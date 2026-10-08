/**
 * Flag Rush bots: simple but lively team play, pure and deterministic (no clocks, no Math.random: the match's own seeded
 * generator), so tests replay a match exactly and a server could run the same bots later.
 *
 * Each team splits its bots into jobs every think: the carrier runs home (and waits by its stand while its own flag is
 * away), the nearest bot returns a dropped flag, one or two chase an enemy carrier, one escorts a teammate carrier,
 * defenders keep near home, everyone else goes for the enemy flag. Any job fights a seen foe that comes close, casts its
 * hero's skills when they fit (ctf-content.ts HEROES[].ai), and grabs a power-up nearby. Paths cross the river by the
 * cheaper of a bridge or a jump pad and enter a base through a gap in its fence; steer() slides around rocks.
 */
import { CTF, FIELD, HEROES, heroStats, type TeamId } from './ctf-content.ts';
import { otherTeam, visible, canAct, fenceGates, rand, castAi, basicAttack, movePlayer, speedFactor, type CtfMatch, type CtfPlayer, type CtfEvent } from './ctf-rules.ts';

export type BotRole = 'carry' | 'return' | 'chase' | 'escort' | 'defend' | 'attack';
export interface BotPlan { role: BotRole; move: { x: number; z: number } | null; attack: string | null; cast: { index: number; x: number; z: number } | null; goal: { x: number; z: number } }
type P = { x: number; z: number };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z);

/** Jobs for every bot of one team (humans play as they like; the bots read the board around them). */
export function assignRoles(m: CtfMatch, team: TeamId): Record<string, BotRole> {
  const roles: Record<string, BotRole> = {};
  const mates = m.players.filter(p => p.team === team), bots = mates.filter(p => !p.human && p.alive);
  const free = new Set(bots.map(b => b.id));
  const take = (id: string, role: BotRole) => { roles[id] = role; free.delete(id); };
  for (const b of bots) if (b.carrying !== null) take(b.id, 'carry');
  const mine = m.flags[team], theirs = m.flags[otherTeam(team)];
  const nearest = (to: P) => [...free].map(id => bots.find(b => b.id === id)!).sort((a, b) => dist(a, to) - dist(b, to) || a.id.localeCompare(b.id))[0];
  if (mine.state === 'dropped') { const b = nearest(mine); if (b) take(b.id, 'return'); }
  if (mine.state === 'carried') { const chasers = m.size >= 3 ? 2 : 1; for (let i = 0; i < chasers; i++) { const b = nearest(mine); if (b) take(b.id, 'chase'); } }
  if (theirs.state === 'carried' && m.size >= 3) { const carrier = m.players.find(p => p.id === theirs.carrier); if (carrier && carrier.team === team) { const b = nearest(carrier); if (b) take(b.id, 'escort'); } }
  const hasHuman = mates.some(p => p.human);
  let defenders = Math.floor(m.size / 3) + (m.size === 2 && !hasHuman ? 1 : 0);
  for (const id of [...free].sort()) { if (defenders > 0) { take(id, 'defend'); defenders--; } else take(id, 'attack'); }
  return roles;
}

/** The next waypoint from `from` toward `goal`: across the river by bridge or pad, into a base through a fence gap. */
export function routeTo(from: P, goal: P, team: TeamId): P {
  const half = FIELD.river.half, side = (x: number) => (x < -half ? -1 : x > half ? 1 : 0);
  const sf = side(from.x), sg = side(goal.x);
  if (sf === 0) return { x: (sg || 1) * (half + 2.2), z: from.z }; // on a bridge: step off toward the goal's side
  if (sg !== 0 && sf !== sg) {
    const edge = half + 1.6;
    let best: { at: P; cost: number; then: P } | null = null;
    for (const b of FIELD.river.bridges) { const at = { x: sf * edge, z: b }, then = { x: -sf * edge, z: b }; const cost = dist(from, at) + 2 * edge + dist(then, goal); if (!best || cost < best.cost) best = { at, cost, then }; }
    for (const pad of FIELD.pads) if (Math.sign(pad.x) === sf && (pad.team === -1 || pad.team === team) && Math.sign(pad.tx) !== sf) { const at = { x: pad.x, z: pad.z }, then = { x: pad.tx, z: pad.tz }; const cost = dist(from, at) + dist(then, goal) - 2; if (!best || cost < best.cost) best = { at, cost, then }; }
    if (best) { if (dist(from, best.at) < 1.3) return best.then; return fenceExit(from, best.at, team); }
  }
  return fenceExit(from, goal, team);
}
/** Into or out of a fenced base through its nearest gap. */
function fenceExit(from: P, goal: P, _team: TeamId): P {
  for (const t of [0, 1] as TeamId[]) {
    const s = FIELD.stands[t], r = FIELD.fence.r, inF = dist(from, s) < r - .4, inG = dist(goal, s) < r - .4;
    if (inF === inG) continue;
    const gates = fenceGates(t), inside = inF ? from : goal, outside = inF ? goal : from;
    const gate = gates.sort((a, b) => dist(outside, a) + dist(a, inside) - (dist(outside, b) + dist(b, inside)))[0];
    // The gap lies between the gate point and the stand: aim at the gate, then straight through.
    const lineUp = Math.abs((gate.x - s.x) * (from.z - s.z) - (gate.z - s.z) * (from.x - s.x)) / (dist(gate, s) || 1);
    if (inF) return lineUp < 1.6 ? gate : { x: s.x + (gate.x - s.x) * .55, z: s.z + (gate.z - s.z) * .55 };
    return dist(from, gate) < 1.4 || lineUp < 1.4 && dist(from, s) < dist(gate, s) + .5 ? goal : gate;
  }
  return goal;
}
/** One step toward `to`, sliding around circles (rocks, fence posts, river banks). */
export function steer(from: P, to: P, step: number, obstacles: ReadonlyArray<{ x: number; z: number; r: number }>, clearance = .45): P {
  const d = dist(from, to); if (d < 1e-4 || step <= 0) return { x: from.x, z: from.z };
  const k = Math.min(step, d), base = Math.atan2(to.x - from.x, to.z - from.z);
  const free = (x: number, z: number) => !obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + clearance);
  for (const turn of [0, .35, -.35, .7, -.7, 1.05, -1.05, 1.4, -1.4, 1.8, -1.8]) {
    const a = base + turn, x = from.x + Math.sin(a) * k, z = from.z + Math.cos(a) * k;
    if (free(x, z)) return { x, z };
  }
  return { x: from.x, z: from.z };
}

/** Where the bot means to go and what it does there. */
export function planBot(m: CtfMatch, id: string, role: BotRole): BotPlan {
  const me = m.players.find(p => p.id === id)!, team = me.team, enemy = otherTeam(team);
  const mine = m.flags[team], theirs = m.flags[enemy], stand = FIELD.stands[team], st = heroStats(me.hero);
  const foes = m.players.filter(p => p.team !== team && visible(p));
  const near = (r: number, around: P = me) => foes.filter(f => dist(f, around) < r).sort((a, b) => dist(a, around) - dist(b, around));
  let goal: P = { x: me.x, z: me.z }, target: CtfPlayer | undefined;
  switch (role) {
    case 'carry':
      if (mine.state === 'home') goal = stand;
      else if (mine.state === 'dropped') goal = mine;
      else {
        // Both flags out: wait by the stand while a teammate hunts their carrier; alone, go and get it back yourself.
        const thief = m.players.find(p => p.id === mine.carrier), helpers = m.players.filter(p => p.team === team && p.alive && p.id !== me.id).length;
        if (!helpers && thief) { goal = thief; target = thief; }
        else { goal = { x: stand.x + (team === 0 ? 3 : -3), z: stand.z + (me.id.length % 2 ? 4 : -4) }; target = near(st.range + 1)[0]; }
      }
      break;
    case 'return': goal = mine; target = near(st.range + .5)[0]; break;
    case 'chase': { const c = m.players.find(p => p.id === mine.carrier); if (c) { goal = c; target = c; } break; }
    case 'escort': { const c = m.players.find(p => p.id === theirs.carrier); if (c) { goal = { x: c.x + (team === 0 ? 2.5 : -2.5), z: c.z + 1.5 }; target = near(8, c)[0]; } break; }
    case 'defend': { const intruder = near(16, stand)[0]; goal = intruder ?? { x: stand.x + (team === 0 ? 7 : -7), z: stand.z + (me.id.charCodeAt(me.id.length - 1) % 2 ? 3 : -3) }; target = intruder && dist(intruder, me) < 12 ? intruder : undefined; break; }
    case 'attack': {
      goal = theirs.state === 'carried' ? (m.players.find(p => p.id === theirs.carrier) ?? theirs) : theirs;
      target = near(7)[0]; if (target && theirs.state !== 'carried' && dist(me, theirs) < 5) target = near(st.range + .5)[0];
      break;
    }
  }
  // A power-up close by is worth a detour (not for a carrier or a chaser on the heels of the flag).
  if (role !== 'carry' && role !== 'chase' && !target) {
    let best = 9, spot: P | null = null;
    m.power.spots.forEach((k, i) => { if (k) { const p = FIELD.powerSpots[i], d = dist(p, me); if (d < best) { best = d; spot = p; } } });
    if (spot) goal = spot;
  }
  let attack: string | null = null, cast: BotPlan['cast'] = null;
  if (target) {
    const d = dist(target, me);
    if (d <= st.range + .8) attack = target.id;
    if (role !== 'carry' || d < st.range + .8) goal = d > st.range * .8 ? target : { x: me.x, z: me.z };
  }
  if (canAct(m, me)) cast = chooseCast(m, me, target, role);
  const move = dist(goal, me) > .4 ? routeTo(me, goal, team) : null;
  return { role, move, attack, cast, goal };
}
/** A skill that fits right now, or null. Bots wait a moment now and then (a seeded roll) so they do not cast in lockstep. */
function chooseCast(m: CtfMatch, me: CtfPlayer, target: CtfPlayer | undefined, role: BotRole): BotPlan['cast'] {
  const kit = HEROES[me.hero]?.ai; if (!kit) return null;
  const foesNear = (r: number) => m.players.filter(p => p.team !== me.team && p.alive && dist(p, me) < r).length;
  const order = [3, 0, 1, 2];
  for (const i of order) {
    const s = kit[i]; if (me.cds[i] > 0) continue;
    let at: P | null = null;
    switch (s.kind) {
      case 'blast': case 'single': if (target && dist(target, me) <= (s.range ?? 8)) at = target; break;
      case 'line': if (target && dist(target, me) <= (s.len ?? 10) - .5) at = target; break;
      case 'dash': if (target && dist(target, me) <= (s.range ?? 8) && dist(target, me) > 2) at = target; break;
      case 'zone': if (s.range ? target && dist(target, me) <= s.range : foesNear(s.r ?? 3) > 0) at = s.range && target ? target : me; break;
      case 'nova': if (foesNear((s.r ?? 3) - .3) > 0) at = me; break;
      case 'heal': if (m.players.some(p => p.team === me.team && p.alive && p.hp < p.maxHp * .7 && dist(p, me) < (s.r ?? 6))) at = me; break;
      case 'blink': if (me.carrying === null && (role === 'chase' || role === 'attack') && target && dist(target, me) > 8) at = target; break;
      case 'buff': {
        const b = s.buff!;
        if ((b.shield || b.evade) && (target || foesNear(8)) && me.hp < me.maxHp * .75) at = me;
        else if (b.speed && !b.shield && (role === 'carry' || role === 'chase' || role === 'return')) at = me;
        else if ((b.giant || b.wisp) && target && dist(target, me) < 8) at = me;
        else if (s.heal && me.hp < me.maxHp * .5) at = me;
        break;
      }
    }
    if (at && rand(m) < (i === 3 ? .5 : .7)) return { index: i, x: at.x, z: at.z };
  }
  return null;
}

/** Bot heroes for a team: distinct within the team (as the reference's picker), seeded. */
export function pickHeroes(count: number, taken: readonly string[], r: () => number) {
  const pool = Object.keys(HEROES).filter(h => !taken.includes(h)), out: string[] = [];
  for (let i = 0; i < count; i++) { const list = pool.length ? pool : Object.keys(HEROES); const k = Math.floor(r() * list.length); out.push(list[k]); const j = pool.indexOf(list[k]); if (j >= 0) pool.splice(j, 1); }
  return out;
}
export const AI_THINK = .25;

/** The bots' memory between steps: plain data, kept beside the match (not inside it, so a replay can drop it). */
export interface BotMinds { think: number; roles: Record<string, BotRole>; plans: Record<string, BotPlan>; stuck: Record<string, { x: number; z: number; t: number }> }
export const newMinds = (): BotMinds => ({ think: 0, roles: {}, plans: {}, stuck: {} });
/**
 * Runs every bot for one step: thinks every AI_THINK s (jobs, goals, targets, a skill), then casts, swings and walks
 * (steered around `obstacles`, at its hero's speed with the carrier's slowdown and boosts). Humans are left alone.
 */
export function stepBots(m: CtfMatch, dt: number, minds: BotMinds, obstacles: ReadonlyArray<{ x: number; z: number; r: number }>, out: CtfEvent[] = []) {
  if (m.phase !== 'play' && m.phase !== 'overtime') return out;
  minds.think -= dt;
  if (minds.think <= 0) {
    minds.think = AI_THINK; minds.roles = { ...assignRoles(m, 0), ...assignRoles(m, 1) };
    for (const p of m.players) if (!p.human && p.alive) minds.plans[p.id] = planBot(m, p.id, minds.roles[p.id] ?? 'attack');
  }
  for (const p of m.players) {
    if (p.human || !canAct(m, p)) continue;
    const plan = minds.plans[p.id]; if (!plan) continue;
    if (plan.cast) { castAi(m, p.id, plan.cast.index, plan.cast.x, plan.cast.z, out); plan.cast = null; if (!canAct(m, p)) continue; }
    if (plan.attack) { const t = m.players.find(o => o.id === plan.attack); if (t && t.alive) basicAttack(m, p.id, t.id, out); }
    if (plan.move) {
      const next = steer(p, plan.move, heroStats(p.hero).ms * speedFactor(p) * dt, obstacles);
      movePlayer(m, p.id, next.x, next.z);
      const s = minds.stuck[p.id] ??= { x: p.x, z: p.z, t: 0 };
      if (dist(s, p) > .6) { s.x = p.x; s.z = p.z; s.t = 0; }
      else if ((s.t += dt) > 1.2) { s.t = 0; const a = rand(m) * Math.PI * 2; plan.move = { x: p.x + Math.sin(a) * 4, z: p.z + Math.cos(a) * 4 }; }
    }
  }
  return out;
}
export { CTF };
