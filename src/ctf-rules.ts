/**
 * Flag Rush match rules: one match as a plain, serialisable state object and pure functions that advance it.
 *
 * Built so it can move to the server unchanged when online rooms arrive:
 *  - CtfMatch is plain JSON (numbers, strings, arrays, objects; no classes, maps, closures or Three.js). A server can
 *    JSON.stringify it to snapshot or relay it, and JSON.parse(JSON.stringify(m)) steps on exactly like the original.
 *  - All randomness comes from the match's own seeded generator (m.rng), so a seed and the same inputs replay the same
 *    match (tests rely on this); nothing reads Date.now() or Math.random().
 *  - Inputs are plain calls: movePlayer (positions the client or a bot reports), playerHit (a hit the explorer's real
 *    skill landed), castAi / basicAttack (bots and, later, remote players), setImmune. stepMatch(m, dt) advances clocks,
 *    respawns, flags, power-ups, pads, strikes and the score, and returns what happened as events for the view.
 *  - Collision with the field (river, rocks, fences, edges) is the caller's: fieldObstacles() lists the circles and
 *    ctf-ai.ts steers around them, and the browser's own collision (world.ts) moves the explorer.
 * Offline, ctf.ts runs this in the browser with AI teams (ctf-ai.ts); rewards go through actions.ts (ctf-claim.ts).
 */
import { CTF, FIELD, HEROES, POWERS, POWER_KINDS, POWER, heroStats, type PowerKind, type TeamId, type AiSkill } from './ctf-content.ts';

export interface CtfBuffs { zip: number; wisp: number; bigcap: number; evade: number; speed: number; speedTime: number; shield: number; shieldTime: number; pumpkin: number }
export interface CtfPlayer {
  id: string; name: string; team: TeamId; hero: string; human: boolean;
  x: number; z: number; facing: number;
  hp: number; maxHp: number; atk: number; def: number;
  alive: boolean; respawn: number; guard: number;
  /** The team whose flag this player carries (always the other team's), or null. */
  carrying: TeamId | null;
  stats: { caps: number; rets: number; kills: number; downs: number };
  buffs: CtfBuffs; stun: number; slow: number;
  jump: { fx: number; fz: number; tx: number; tz: number; t: number } | null; padLock: number;
  /** Bots: skill cooldowns and the basic attack's. */
  cds: [number, number, number, number]; atkCd: number;
  lastHitBy: string | null; immune: boolean;
}
export interface CtfFlag { team: TeamId; state: 'home' | 'carried' | 'dropped'; carrier: string | null; x: number; z: number; returnIn: number }
export interface CtfStrike { id: number; by: string; team: TeamId; kind: 'blast' | 'zone' | 'pumpkin'; x: number; z: number; r: number; at: number; total?: number; power: number; stun?: number; slow?: number; heal?: number; pull?: boolean; ticks?: number; every?: number }
export type CtfPhase = 'intro' | 'play' | 'overtime' | 'over';
export interface CtfResult { winner: TeamId | -1; reason: 'flags' | 'time' | 'golden' | 'leave'; seconds: number }
export interface CtfMatch {
  v: 1; id: string; seed: number; rng: number; size: number;
  /** intro: the countdown; play: the 8 minutes; overtime: next capture wins; over: the result is in. */
  phase: CtfPhase; timer: number; elapsed: number;
  score: [number, number]; flags: [CtfFlag, CtfFlag]; players: CtfPlayer[];
  power: { next: number; spots: Array<PowerKind | null> };
  strikes: CtfStrike[]; strikeSeq: number;
  result: CtfResult | null;
}
export type CtfEvent =
  | { kind: 'go' } | { kind: 'overtime' } | { kind: 'end'; result: CtfResult }
  | { kind: 'take'; flag: TeamId; by: string } | { kind: 'drop'; flag: TeamId; by: string; x: number; z: number }
  | { kind: 'return'; flag: TeamId; by: string | null } | { kind: 'capture'; flag: TeamId; by: string; score: [number, number] }
  | { kind: 'down'; id: string; by: string | null } | { kind: 'respawn'; id: string }
  | { kind: 'hit'; id: string; by: string | null; amount: number; x: number; z: number }
  | { kind: 'heal'; id: string; amount: number }
  | { kind: 'power-spawn'; spot: number; power: PowerKind } | { kind: 'power'; id: string; power: PowerKind; spot: number }
  | { kind: 'jump'; id: string; pad: number } | { kind: 'land'; id: string }
  | { kind: 'strike'; strike: CtfStrike } | { kind: 'land-strike'; strike: CtfStrike }
  | { kind: 'cast'; id: string; skill: number; x: number; z: number } | { kind: 'attack'; id: string; target: string; ranged: boolean }
  | { kind: 'knock'; id: string };
export interface RosterEntry { id: string; name: string; team: TeamId; hero: string; human?: boolean }

// ---------------------------------------------------------------- field geometry
export const otherTeam = (t: TeamId): TeamId => (t === 0 ? 1 : 0);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** True on dry land: inside the field and not in the river (bridges are dry). */
export function onLand(x: number, z: number) {
  if (Math.abs(x) > FIELD.hx || Math.abs(z) > FIELD.hz) return false;
  if (Math.abs(x) < FIELD.river.half) return FIELD.river.bridges.some(b => Math.abs(z - b) < FIELD.river.bridgeHalf);
  return true;
}
/** Every collision circle of the field, in field coordinates: edges, river banks, base fences and rocks. */
export function fieldObstacles(): Array<{ x: number; z: number; r: number }> {
  const out: Array<{ x: number; z: number; r: number }> = [];
  const { hx, hz } = FIELD;
  for (let x = -hx; x <= hx; x += 2) { out.push({ x, z: -hz - 1, r: 1.2 }, { x, z: hz + 1, r: 1.2 }); }
  for (let z = -hz; z <= hz; z += 2) { out.push({ x: -hx - 1, z, r: 1.2 }, { x: hx + 1, z, r: 1.2 }); }
  // The river: a column of circles down the middle, left open on the bridges.
  for (let z = -hz; z <= hz; z += 1.6) if (!FIELD.river.bridges.some(b => Math.abs(z - b) < FIELD.river.bridgeHalf + .9)) out.push({ x: 0, z, r: FIELD.river.half });
  for (const t of [0, 1] as TeamId[]) {
    const s = FIELD.stands[t], dir = t === 0 ? 1 : -1, f = FIELD.fence;
    for (let a = -180; a < 180; a += f.step) {
      if (f.gaps.some(g => Math.abs(angleDiff(a, g)) < f.gapHalf)) continue;
      const rad = a * Math.PI / 180, x = s.x + Math.cos(rad) * f.r * dir, z = s.z + Math.sin(rad) * f.r;
      if (Math.abs(x) <= FIELD.hx) out.push({ x, z, r: f.post });
    }
  }
  for (const [x, z, r] of FIELD.rocks) out.push({ x, z, r }, { x: -x, z: -z, r });
  return out;
}
const angleDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;
/** The gaps in a base fence, as points just outside it (where a walker should aim to get in or out). */
export function fenceGates(team: TeamId) {
  const s = FIELD.stands[team], dir = team === 0 ? 1 : -1, r = FIELD.fence.r + 2.2;
  return FIELD.fence.gaps.map(g => { const rad = g * Math.PI / 180; return { x: s.x + Math.cos(rad) * r * dir, z: s.z + Math.sin(rad) * r }; });
}

// ---------------------------------------------------------------- creating a match
/** mulberry32 over the match's own state: deterministic and serialisable. */
export function rand(m: CtfMatch) {
  m.rng = (m.rng + 0x6d2b79f5) >>> 0; let t = m.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const freshBuffs = (): CtfBuffs => ({ zip: 0, wisp: 0, bigcap: 0, evade: 0, speed: 0, speedTime: 0, shield: 0, shieldTime: 0, pumpkin: 0 });
export function spawnPoint(team: TeamId, index: number) { const list = FIELD.spawns[team]; return list[((index % list.length) + list.length) % list.length]; }
export function createMatch(o: { id: string; seed: number; size: number; roster: RosterEntry[] }): CtfMatch {
  const size = (CTF.sizes as readonly number[]).includes(o.size) ? o.size : 3;
  const seen = [0, 0];
  const players: CtfPlayer[] = o.roster.map(r => {
    const st = heroStats(HEROES[r.hero] ? r.hero : 'dz_knight'), at = spawnPoint(r.team, seen[r.team]++);
    return { id: r.id, name: r.name, team: r.team, hero: HEROES[r.hero] ? r.hero : 'dz_knight', human: !!r.human, x: at.x, z: at.z, facing: r.team === 0 ? Math.PI / 2 : -Math.PI / 2,
      hp: st.hp, maxHp: st.hp, atk: st.atk, def: st.def, alive: true, respawn: 0, guard: 0, carrying: null,
      stats: { caps: 0, rets: 0, kills: 0, downs: 0 }, buffs: freshBuffs(), stun: 0, slow: 0, jump: null, padLock: 0,
      cds: [1.5, 3, 4, 8], atkCd: .5, lastHitBy: null, immune: false };
  });
  const flag = (team: TeamId): CtfFlag => ({ team, state: 'home', carrier: null, x: FIELD.stands[team].x, z: FIELD.stands[team].z, returnIn: 0 });
  return { v: 1, id: o.id, seed: o.seed >>> 0, rng: o.seed >>> 0, size, phase: 'intro', timer: CTF.intro, elapsed: 0, score: [0, 0], flags: [flag(0), flag(1)], players,
    power: { next: CTF.firstPower, spots: FIELD.powerSpots.map(() => null) }, strikes: [], strikeSeq: 0, result: null };
}
export const player = (m: CtfMatch, id: string) => m.players.find(p => p.id === id);
export const live = (m: CtfMatch) => m.phase === 'play' || m.phase === 'overtime';
/** Can this player be seen (and so targeted)? A carrier is always seen. */
export const visible = (p: CtfPlayer) => p.alive && (p.carrying !== null || (p.buffs.wisp <= 0 && p.buffs.evade <= 0));
/** Move-speed multiplier: carrying (-15%), Zippy Boots, skill hastes, slows. */
export function speedFactor(p: CtfPlayer) {
  return (1 + (p.buffs.zip > 0 ? POWER.zipSpeed : 0) + (p.buffs.speedTime > 0 ? p.buffs.speed : 0)) * (p.carrying !== null ? 1 - CTF.carrySlow : 1) * (p.slow > 0 ? .55 : 1);
}
export const canTeleport = (p: CtfPlayer) => p.carrying === null;
/** Can this player act (move, attack, cast) right now? */
export const canAct = (m: CtfMatch, p: CtfPlayer) => live(m) && p.alive && !p.jump && p.stun <= 0;

// ---------------------------------------------------------------- inputs
/** A position report (the explorer's browser or a bot). Ignored while down, flying off a pad or before the start. */
export function movePlayer(m: CtfMatch, id: string, x: number, z: number) {
  const p = player(m, id); if (!p || !p.alive || p.jump || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (m.phase === 'intro' || m.phase === 'over') return false;
  const dx = x - p.x, dz = z - p.z; if (Math.hypot(dx, dz) > .001) p.facing = Math.atan2(dx, dz);
  p.x = Math.max(-FIELD.hx, Math.min(FIELD.hx, x)); p.z = Math.max(-FIELD.hz, Math.min(FIELD.hz, z));
  return true;
}
export function setImmune(m: CtfMatch, id: string, immune: boolean) { const p = player(m, id); if (p) p.immune = immune; }
/** Damage of an attack: attacker's level-8 attack × multiplier, the target's defence, the match scale, Big-Cap both ways. */
export function damageOf(attacker: CtfPlayer, target: CtfPlayer, mult: number) {
  return Math.max(1, attacker.atk * mult * (attacker.buffs.bigcap > 0 ? POWER.bigcapDamage : 1) * CTF.damageScale * 100 / (100 + target.def) * (target.buffs.bigcap > 0 ? POWER.bigcapTaken : 1));
}
/**
 * Hurts a player. Returns the health actually lost (after guard, evasion, the bubble and immunity). At zero the player
 * is down: a carried flag drops where they fell, the attacker counts a knock-down, the respawn clock starts.
 */
export function hurt(m: CtfMatch, targetId: string, amount: number, byId: string | null, out: CtfEvent[] = []) {
  const p = player(m, targetId); if (!p || !p.alive || !live(m) || !(amount > 0)) return 0;
  const by = byId ? player(m, byId) : undefined; if (by && by.team === p.team) return 0;
  if (p.guard > 0 || p.buffs.evade > 0 || p.immune || p.jump) return 0;
  let left = amount;
  if (p.buffs.shield > 0) { const soak = Math.min(p.buffs.shield, left); p.buffs.shield -= soak; left -= soak; }
  const lost = Math.min(p.hp, left); p.hp -= lost; if (byId) p.lastHitBy = byId;
  if (lost > 0 || amount > 0) out.push({ kind: 'hit', id: p.id, by: byId, amount: Math.round(amount), x: p.x, z: p.z });
  if (p.hp <= 0) down(m, p, byId, out);
  return lost;
}
function down(m: CtfMatch, p: CtfPlayer, byId: string | null, out: CtfEvent[]) {
  p.hp = 0; p.alive = false; p.respawn = CTF.respawn; p.stats.downs++; p.jump = null; p.stun = 0; p.slow = 0; p.buffs = freshBuffs();
  const killer = byId ? player(m, byId) ?? (p.lastHitBy ? player(m, p.lastHitBy) : undefined) : p.lastHitBy ? player(m, p.lastHitBy) : undefined;
  if (killer && killer.team !== p.team) killer.stats.kills++;
  out.push({ kind: 'down', id: p.id, by: killer?.id ?? null });
  if (p.carrying !== null) { const f = m.flags[p.carrying]; f.state = 'dropped'; f.carrier = null; f.x = p.x; f.z = p.z; f.returnIn = CTF.flagReturn; out.push({ kind: 'drop', flag: f.team, by: p.id, x: f.x, z: f.z }); p.carrying = null; }
}
export function heal(m: CtfMatch, id: string, amount: number, out: CtfEvent[] = []) {
  const p = player(m, id); if (!p || !p.alive || !(amount > 0)) return 0;
  const gained = Math.min(p.maxHp - p.hp, amount); p.hp += gained; if (gained > 0) out.push({ kind: 'heal', id, amount: Math.round(gained) }); return gained;
}
/** The explorer's own skill or blow landed on a bot: `mult` is the hit's size in multiples of their attack. */
export function playerHit(m: CtfMatch, byId: string, targetId: string, mult: number, out: CtfEvent[] = []) {
  const a = player(m, byId), b = player(m, targetId); if (!a || !b || !a.alive || a.team === b.team || !(mult > 0)) return 0;
  const lost = hurt(m, targetId, damageOf(a, b, Math.min(mult, 12)), byId, out);
  const life = HEROES[a.hero]?.lifesteal; if (life && lost > 0) heal(m, a.id, lost * life, out);
  return lost;
}
/** A bot's (or remote player's) basic attack on a target in range. */
export function basicAttack(m: CtfMatch, id: string, targetId: string, out: CtfEvent[] = []) {
  const a = player(m, id), b = player(m, targetId); if (!a || !b || !canAct(m, a) || a.atkCd > 0 || !visible(b) || a.team === b.team) return false;
  const st = heroStats(a.hero); if (dist(a, b) > st.range + .9) return false;
  a.atkCd = 1 / st.as; a.facing = Math.atan2(b.x - a.x, b.z - a.z); a.buffs.wisp = 0;
  out.push({ kind: 'attack', id, target: targetId, ranged: st.range > 3 });
  const lost = hurt(m, targetId, damageOf(a, b, 1), id, out);
  const life = HEROES[a.hero]?.lifesteal; if (life && lost > 0) heal(m, id, lost * life, out);
  return true;
}
/** A bot casts skill `index` of its hero (ctf-content.ts HEROES[].ai) at a point. */
export function castAi(m: CtfMatch, id: string, index: number, tx: number, tz: number, out: CtfEvent[] = []) {
  const p = player(m, id), skill: AiSkill | undefined = p ? HEROES[p.hero]?.ai[index] : undefined;
  if (!p || !skill || !canAct(m, p) || p.cds[index] > 0) return false;
  if (skill.kind === 'blink' && !canTeleport(p)) return false;
  p.cds[index] = skill.cd; p.buffs.wisp = 0;
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  p.facing = Math.atan2(dx, dz);
  out.push({ kind: 'cast', id, skill: index, x: tx, z: tz });
  const foes = () => m.players.filter(o => o.team !== p.team && o.alive);
  const strike = (x: number, z: number, extra: Partial<CtfStrike> = {}) => { const s: CtfStrike = { id: ++m.strikeSeq, by: id, team: p.team, kind: 'blast', x, z, r: skill.r ?? 3, at: skill.delay ?? 0, total: skill.delay ?? 0, power: skill.power ?? 1, stun: skill.stun, slow: skill.slow, heal: skill.heal, pull: skill.pull, ...extra }; m.strikes.push(s); out.push({ kind: 'strike', strike: s }); return s; };
  switch (skill.kind) {
    case 'blast': { const reach = Math.min(d, skill.range ?? 10); strike(p.x + ux * reach, p.z + uz * reach); break; }
    case 'nova': strike(p.x, p.z); break;
    case 'zone': { const reach = skill.range ? Math.min(d, skill.range) : 0; const every = .5; strike(p.x + ux * reach, p.z + uz * reach, { kind: 'zone', ticks: Math.round((skill.dur ?? 3) / every), every, at: 0 }); break; }
    case 'line': {
      const len = skill.len ?? 10, w = (skill.width ?? 1.4) / 2;
      for (const o of foes()) { const ax = o.x - p.x, az = o.z - p.z, along = ax * ux + az * uz, across = Math.abs(ax * uz - az * ux); if (along > 0 && along < len && across < w + .5 && visible(o)) { hurt(m, o.id, damageOf(p, o, skill.power ?? 1), id, out); if (skill.stun) o.stun = Math.max(o.stun, skill.stun); if (skill.slow) o.slow = Math.max(o.slow, skill.slow); } }
      break;
    }
    case 'dash': { const reach = Math.min(d, skill.range ?? 8); const end = clampLand(p.x + ux * reach, p.z + uz * reach, p.x, p.z); p.x = end.x; p.z = end.z; strike(p.x, p.z); break; }
    case 'blink': { const reach = Math.min(d, skill.range ?? 8); const end = clampLand(p.x + ux * reach, p.z + uz * reach, p.x, p.z); p.x = end.x; p.z = end.z; break; }
    case 'single': {
      const t = foes().filter(o => visible(o) && dist(o, { x: tx, z: tz }) < 2.5 && dist(o, p) <= (skill.range ?? 8) + 1).sort((a, b) => dist(a, { x: tx, z: tz }) - dist(b, { x: tx, z: tz }))[0];
      if (!t) break;
      const lost = hurt(m, t.id, damageOf(p, t, skill.power ?? 1), id, out);
      if (skill.heal && lost > 0) heal(m, id, lost * skill.heal, out);
      if (t.alive) { if (skill.stun) t.stun = Math.max(t.stun, skill.stun); if (skill.slow) t.slow = Math.max(t.slow, skill.slow); if (skill.pull) { const k = Math.max(0, dist(t, p) - 1.6); const at = clampLand(t.x - ux * k, t.z - uz * k, t.x, t.z); t.x = at.x; t.z = at.z; out.push({ kind: 'knock', id: t.id }); } }
      break;
    }
    case 'heal': for (const o of m.players) if (o.team === p.team && o.alive && dist(o, p) <= (skill.r ?? 6)) heal(m, o.id, o.maxHp * (skill.heal ?? .2), out); break;
    case 'buff': {
      const b = skill.buff!;
      if (b.shield) { p.buffs.shield = Math.max(p.buffs.shield, b.shield); p.buffs.shieldTime = Math.max(p.buffs.shieldTime, b.time); }
      if (b.speed) { p.buffs.speed = b.speed; p.buffs.speedTime = Math.max(p.buffs.speedTime, b.time); }
      if (b.wisp && p.carrying === null) p.buffs.wisp = Math.max(p.buffs.wisp, b.wisp);
      if (b.evade) p.buffs.evade = Math.max(p.buffs.evade, b.evade);
      if (b.giant) p.buffs.bigcap = Math.max(p.buffs.bigcap, b.giant);
      if (skill.heal) heal(m, id, p.maxHp * skill.heal, out);
      break;
    }
  }
  return true;
}
/** Keeps a dash or blink on dry land: walks back toward the start until the spot is land. */
function clampLand(x: number, z: number, fx: number, fz: number) {
  for (let k = 1; k >= 0; k -= .1) { const px = fx + (x - fx) * k, pz = fz + (z - fz) * k; if (onLand(px, pz)) return { x: px, z: pz }; }
  return { x: fx, z: fz };
}

// ---------------------------------------------------------------- the clock
/** Advances the match by dt seconds. Returns the events of this step, in order. */
export function stepMatch(m: CtfMatch, dt: number): CtfEvent[] {
  const out: CtfEvent[] = []; if (m.phase === 'over' || !(dt > 0)) return out;
  dt = Math.min(dt, .25);
  if (m.phase === 'intro') { m.timer -= dt; if (m.timer <= 0) { m.phase = 'play'; m.timer = CTF.time; out.push({ kind: 'go' }); } return out; }
  m.elapsed += dt; m.timer -= dt;
  for (const p of m.players) stepPlayer(m, p, dt, out);
  stepStrikes(m, dt, out);
  stepFlags(m, dt, out);
  stepPowers(m, dt, out);
  for (const p of m.players) if (p.alive && !p.jump) touch(m, p, out);
  if ((m.phase as CtfPhase) !== 'over' && m.timer <= 0) {
    if (m.phase === 'play' && m.score[0] === m.score[1]) { m.phase = 'overtime'; m.timer = CTF.overtime; out.push({ kind: 'overtime' }); }
    else finish(m, m.score[0] === m.score[1] ? -1 : m.score[0] > m.score[1] ? 0 : 1, m.phase === 'overtime' ? 'golden' : 'time', out);
  }
  return out;
}
function stepPlayer(m: CtfMatch, p: CtfPlayer, dt: number, out: CtfEvent[]) {
  if (!p.alive) {
    p.respawn -= dt;
    if (p.respawn <= 0) { const at = spawnPoint(p.team, m.players.filter(o => o.team === p.team).indexOf(p)); Object.assign(p, { alive: true, hp: p.maxHp, x: at.x, z: at.z, guard: CTF.spawnGuard, respawn: 0, stun: 0, slow: 0, lastHitBy: null, jump: null }); out.push({ kind: 'respawn', id: p.id }); }
    return;
  }
  const b = p.buffs;
  p.guard = Math.max(0, p.guard - dt); p.stun = Math.max(0, p.stun - dt); p.slow = Math.max(0, p.slow - dt); p.padLock = Math.max(0, p.padLock - dt); p.atkCd = Math.max(0, p.atkCd - dt);
  for (let i = 0; i < 4; i++) p.cds[i] = Math.max(0, p.cds[i] - dt);
  b.zip = Math.max(0, b.zip - dt); b.wisp = p.carrying !== null ? 0 : Math.max(0, b.wisp - dt); b.bigcap = Math.max(0, b.bigcap - dt); b.evade = Math.max(0, b.evade - dt);
  b.speedTime = Math.max(0, b.speedTime - dt); if (b.shieldTime > 0) { b.shieldTime = Math.max(0, b.shieldTime - dt); if (b.shieldTime <= 0 && b.shield > 0 && b.shield <= 300) b.shield = 0; }
  if (b.pumpkin > 0) { b.pumpkin -= dt; if (b.pumpkin <= 0) { b.pumpkin = 0; const s: CtfStrike = { id: ++m.strikeSeq, by: p.id, team: p.team, kind: 'pumpkin', x: p.x, z: p.z, r: POWER.pumpkinR, at: 0, total: 0, power: 0 }; m.strikes.push(s); out.push({ kind: 'strike', strike: s }); } }
  if (p.jump) {
    const j = p.jump; j.t += dt / CTF.jumpTime;
    if (j.t >= 1) { p.x = j.tx; p.z = j.tz; p.jump = null; p.padLock = CTF.padLock; out.push({ kind: 'land', id: p.id }); }
    else { p.x = j.fx + (j.tx - j.fx) * j.t; p.z = j.fz + (j.tz - j.fz) * j.t; }
  } else if (p.padLock <= 0) {
    const i = FIELD.pads.findIndex(pad => (pad.team === -1 || pad.team === p.team) && Math.hypot(pad.x - p.x, pad.z - p.z) < CTF.padR);
    if (i >= 0) { const pad = FIELD.pads[i]; p.jump = { fx: p.x, fz: p.z, tx: pad.tx, tz: pad.tz, t: 0 }; p.facing = Math.atan2(pad.tx - p.x, pad.tz - p.z); out.push({ kind: 'jump', id: p.id, pad: i }); }
  }
  const f = p.carrying !== null ? m.flags[p.carrying] : null; if (f) { f.x = p.x; f.z = p.z; }
}
/** Height of a pad jump at progress t (0..1): a smooth arc. */
export const jumpLift = (t: number) => Math.sin(Math.PI * Math.max(0, Math.min(1, t))) * CTF.jumpHeight;
function stepStrikes(m: CtfMatch, dt: number, out: CtfEvent[]) {
  for (const s of [...m.strikes]) {
    s.at -= dt; if (s.at > 0) continue;
    const by = player(m, s.by);
    if (s.kind === 'pumpkin') {
      for (const o of m.players) if (o.team !== s.team && o.alive && dist(o, s) < s.r) {
        const a = by ?? o; hurt(m, o.id, POWER.pumpkinPower * CTF.damageScale * 100 / (100 + o.def), by ? by.id : null, out); void a;
        if (o.alive) { const d = dist(o, s) || 1, k = POWER.pumpkinKnock; const at = clampLand(o.x + (o.x - s.x) / d * k, o.z + (o.z - s.z) / d * k, o.x, o.z); o.x = at.x; o.z = at.z; out.push({ kind: 'knock', id: o.id }); }
      }
      out.push({ kind: 'land-strike', strike: s }); m.strikes.splice(m.strikes.indexOf(s), 1); continue;
    }
    if (by && live(m)) for (const o of m.players) if (o.team !== s.team && o.alive && visibleToArea(o) && dist(o, s) < s.r + .4) {
      const lost = hurt(m, o.id, damageOf(by, o, s.power), by.id, out);
      if (s.heal && lost > 0) heal(m, by.id, lost * s.heal, out);
      if (o.alive) {
        if (s.stun) o.stun = Math.max(o.stun, s.stun); if (s.slow) o.slow = Math.max(o.slow, s.kind === 'zone' ? .6 : s.slow);
        if (s.pull) { const d = dist(o, s); if (d > .5) { const k = Math.min(d - .4, 2.5); const at = clampLand(o.x - (o.x - s.x) / d * k, o.z - (o.z - s.z) / d * k, o.x, o.z); o.x = at.x; o.z = at.z; out.push({ kind: 'knock', id: o.id }); } }
      }
    }
    out.push({ kind: 'land-strike', strike: s });
    if (s.kind === 'zone' && (s.ticks ?? 0) > 1) { s.ticks!--; s.at = s.every ?? .5; } else m.strikes.splice(m.strikes.indexOf(s), 1);
  }
}
/** Areas hit the unseen too (a cloak hides you from aim, not from a blast); only evasion and the jump save you. */
const visibleToArea = (p: CtfPlayer) => p.alive && p.buffs.evade <= 0 && !p.jump;
function stepFlags(m: CtfMatch, dt: number, out: CtfEvent[]) {
  for (const f of m.flags) if (f.state === 'dropped') { f.returnIn -= dt; if (f.returnIn <= 0) { sendHome(f); out.push({ kind: 'return', flag: f.team, by: null }); } }
}
function sendHome(f: CtfFlag) { f.state = 'home'; f.carrier = null; f.x = FIELD.stands[f.team].x; f.z = FIELD.stands[f.team].z; f.returnIn = 0; }
function stepPowers(m: CtfMatch, dt: number, out: CtfEvent[]) {
  m.power.next -= dt; if (m.power.next > 0) return;
  m.power.next = CTF.powerEvery;
  const empty = m.power.spots.map((k, i) => (k ? -1 : i)).filter(i => i >= 0); if (!empty.length) return;
  const spot = empty[Math.floor(rand(m) * empty.length)], power = rollPower(rand(m));
  m.power.spots[spot] = power; out.push({ kind: 'power-spawn', spot, power });
}
/** A weighted roll over the seven power-ups (r in 0..1). */
export function rollPower(r: number): PowerKind {
  const total = POWER_KINDS.reduce((n, k) => n + POWERS[k].w, 0); let x = Math.max(0, Math.min(.999999, r)) * total;
  for (const k of POWER_KINDS) { x -= POWERS[k].w; if (x < 0) return k; }
  return POWER_KINDS[POWER_KINDS.length - 1];
}
/** Flags and power-ups touched by a player on foot. */
function touch(m: CtfMatch, p: CtfPlayer, out: CtfEvent[]) {
  if (!live(m)) return;
  const mine = m.flags[p.team], theirs = m.flags[otherTeam(p.team)];
  if (theirs.state !== 'carried' && p.carrying === null && dist(p, theirs) < CTF.pickR) {
    theirs.state = 'carried'; theirs.carrier = p.id; p.carrying = theirs.team; p.buffs.wisp = 0; out.push({ kind: 'take', flag: theirs.team, by: p.id });
  }
  if (mine.state === 'dropped' && dist(p, mine) < CTF.pickR) { sendHome(mine); p.stats.rets++; out.push({ kind: 'return', flag: mine.team, by: p.id }); }
  if (p.carrying !== null && mine.state === 'home' && dist(p, FIELD.stands[p.team]) < CTF.captureR) {
    const f = m.flags[p.carrying]; sendHome(f); p.carrying = null; p.stats.caps++; m.score[p.team]++;
    out.push({ kind: 'capture', flag: f.team, by: p.id, score: [m.score[0], m.score[1]] });
    if (m.phase === 'overtime') finish(m, p.team, 'golden', out);
    else if (m.score[p.team] >= CTF.win) finish(m, p.team, 'flags', out);
  }
  for (let i = 0; i < m.power.spots.length; i++) {
    const k = m.power.spots[i]; if (!k || dist(p, FIELD.powerSpots[i]) > CTF.powerR) continue;
    m.power.spots[i] = null; applyPower(m, p, k, out); out.push({ kind: 'power', id: p.id, power: k, spot: i });
  }
}
export function applyPower(m: CtfMatch, p: CtfPlayer, k: PowerKind, out: CtfEvent[] = []) {
  const b = p.buffs;
  if (k === 'zip') b.zip = POWER.zipTime;
  else if (k === 'bubble') { b.shield = Math.max(b.shield, POWER.bubble); b.shieldTime = 0; }
  else if (k === 'pumpkin') b.pumpkin = POWER.pumpkinFuse;
  else if (k === 'wisp') { if (p.carrying === null) b.wisp = POWER.wispTime; }
  else if (k === 'bigcap') b.bigcap = POWER.bigcapTime;
  else if (k === 'frost') { for (const o of m.players) if (o.team !== p.team && o.alive && dist(o, p) < POWER.frostR) o.stun = Math.max(o.stun, POWER.frostTime); }
  else if (k === 'apple') heal(m, p.id, p.maxHp, out);
}
function finish(m: CtfMatch, winner: TeamId | -1, reason: CtfResult['reason'], out: CtfEvent[]) {
  m.phase = 'over'; m.strikes = []; m.result = { winner, reason, seconds: Math.round(m.elapsed) }; out.push({ kind: 'end', result: m.result });
}
/** A side gives up (the explorer leaves): the other team wins. */
export function forfeit(m: CtfMatch, team: TeamId) { const out: CtfEvent[] = []; if (m.phase !== 'over') finish(m, otherTeam(team), 'leave', out); return out; }

// ---------------------------------------------------------------- rewards
/** EXP for a finished match (our numbers; the reference keeps its own on the server). Winners get the big share. */
export const CTF_REWARD = { win: 600, draw: 200, loss: 0, perCapture: 120, perReturn: 40, perKnock: 10, max: 1400, perDay: 6, minSeconds: 45 } as const;
export function matchXp(o: { won: boolean; draw: boolean; caps: number; rets: number; kills: number; size: number }) {
  const base = o.won ? CTF_REWARD.win : o.draw ? CTF_REWARD.draw : CTF_REWARD.loss;
  const extra = Math.min(6, o.caps) * CTF_REWARD.perCapture + Math.min(10, o.rets) * CTF_REWARD.perReturn + Math.min(20, o.kills) * CTF_REWARD.perKnock;
  // Bigger rooms are longer fights: up to +30% for 5v5.
  const room = 1 + (Math.max(1, Math.min(5, o.size)) - 1) * .075;
  return Math.min(CTF_REWARD.max, Math.round((base + extra) * room));
}
/** The EXP this player has earned in this (finished) match. */
export function rewardFor(m: CtfMatch, id: string) {
  const p = player(m, id); if (!p || !m.result) return 0;
  return matchXp({ won: m.result.winner === p.team, draw: m.result.winner === -1, caps: p.stats.caps, rets: p.stats.rets, kills: p.stats.kills, size: m.size });
}
