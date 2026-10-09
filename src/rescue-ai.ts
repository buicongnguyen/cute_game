/**
 * The squad's behaviour in a Rescue Call (pure, seeded through the run): hold a guard post on a lane or follow the hero,
 * pick the raider closest to leaking within its leash, walk up and hit it (a punch at step 0, the ladder's weapon
 * later), use the disguise's skills from step 4, and sit out a fall-back at the camp. Flyers can only be hit from range.
 *
 * Also here: a stand-in hero (for tests, probes and the dev autopilot) and a simple build planner, so the balance can
 * be checked by playing whole missions in node.
 */
import { RESCUE, SQUAD_BASE, DEFENCES, DEFENCE_KINDS, type DefenceKind, type Point } from './rescue-content.ts';
import { stepRun, fieldOf, hero, hurtEnemy, healUnit, remaining, skillOf, setSquadStepper, placeDefence, upgradeDefence, buyStep, stepCost, startWave, heroHit, setHero, ME,
  type RsRun, type RsEvent, type RsUnit, type RsEnemy } from './rescue-rules.ts';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
/** Where a member stands when nothing needs it: its post (hold) or a spot around the hero (follow). */
export function anchorOf(m: RsRun, u: RsUnit, index: number): Point {
  const field = fieldOf(m);
  if (m.order === 'follow') { const me = hero(m), a = index * 2.1 + .6; return { x: me.x - 1.6 + Math.cos(a) * 1.8, z: me.z + Math.sin(a) * 1.8 }; }
  return field.posts[u.post] ?? field.camp;
}
const campSpot = (index: number): Point => ({ x: RESCUE.camp.x - .5, z: RESCUE.camp.z - 3 + index * 1.5 });
function moveToward(u: RsUnit, p: Point, dt: number, stop = .1) {
  const dx = p.x - u.x, dz = p.z - u.z, d = Math.hypot(dx, dz); if (d <= stop) return;
  const k = Math.min(d - stop, u.speed * dt) / d; u.x += dx * k; u.z += dz * k; u.facing = Math.atan2(dx, dz);
}
export function stepSquad(m: RsRun, dt: number, events: RsEvent[]) {
  const live = m.enemies.filter(e => e.hp > 0);
  m.units.forEach((u, index) => {
    if (u.id === ME) return;
    if (u.down > 0) { const c = campSpot(index); u.x = c.x; u.z = c.z; return; }
    u.cd -= dt; for (let i = 0; i < 3; i++) u.skillCd[i] = Math.max(0, u.skillCd[i] - dt);
    const anchor = anchorOf(m, u, index), leash = m.order === 'hold' ? SQUAD_BASE.leash.hold : SQUAD_BASE.leash.follow;
    let target: RsEnemy | null = null, best = Infinity;
    for (const e of live) {
      if (e.air && !u.air) continue;
      if (dist(e, anchor) > leash + u.range) continue;
      // Already fighting this one: keep at it; otherwise the raider closest to leaking.
      const k = (u.target === e.id ? -100 : 0) + remaining(m, e);
      if (k < best) { best = k; target = e; }
    }
    u.target = target?.id ?? null;
    if (m.phase === 'wave') useSkills(m, u, live, events);
    if (!target) { moveToward(u, anchor, dt, .2); return; }
    const d = dist(u, target);
    if (d > u.range) {
      // Walk up, but never further than the leash from the anchor.
      const want = { x: target.x - (target.x - u.x) / d * (u.range * .8), z: target.z - (target.z - u.z) / d * (u.range * .8) };
      const fromAnchor = dist(want, anchor); if (fromAnchor > leash) { want.x = anchor.x + (want.x - anchor.x) / fromAnchor * leash; want.z = anchor.z + (want.z - anchor.z) / fromAnchor * leash; }
      moveToward(u, want, dt, .05);
    } else u.facing = Math.atan2(target.x - u.x, target.z - u.z);
    if (d <= u.range + .2 && u.cd <= 0) {
      u.cd = 1 / u.rate; const ranged = u.range > 3;
      events.push({ kind: 'swing', unit: u.id, target: target.id, ranged });
      if (ranged) events.push({ kind: 'shot', from: { x: u.x, z: u.z }, to: { x: target.x, z: target.z }, style: 'squad', y: target.air ? 1.6 : .9 });
      hurtEnemy(m, target, u.atk, u.id, events);
    }
  });
}
function useSkills(m: RsRun, u: RsUnit, live: RsEnemy[], events: RsEvent[]) {
  if (u.step < 4) return;
  const near = (p: Point, r: number) => live.filter(e => e.hp > 0 && dist(e, p) <= r);
  const slots: Array<0 | 1 | 2> = u.step >= 6 ? [2, 1, 0] : u.step >= 5 ? [1, 0] : [0];
  for (const slot of slots) {
    if (u.skillCd[slot] > 0) continue;
    const s = skillOf(u, slot), around = near(u, Math.max(s.r, u.range + 1));
    const hurtSquad = m.units.filter(v => v.down <= 0 && v.hp < v.maxHp * .7 && dist(v, u) <= s.r);
    const worth = s.kind === 'heal' ? hurtSquad.length > 0 : slot === 2 ? around.length >= 3 || around.some(e => e.boss) : around.length >= 2 || around.some(e => e.boss || e.role === 'brute');
    if (!worth) continue;
    u.skillCd[slot] = s.cd;
    const focus = around.sort((a, b) => remaining(m, a) - remaining(m, b))[0] ?? u;
    const centre = s.kind === 'snare' || s.kind === 'charge' || (s.kind === 'ult' && u.role === 'ranged') ? { x: focus.x, z: focus.z } : { x: u.x, z: u.z };
    if (s.kind === 'charge') { u.x = focus.x - Math.sin(u.facing) * .8; u.z = focus.z - Math.cos(u.facing) * .8; }
    events.push({ kind: 'skill', unit: u.id, slot, x: centre.x, z: centre.z, r: s.r, role: u.role });
    const hitR = s.kind === 'charge' ? 2.2 : s.r;
    if (s.mul > 0) {
      const targets = s.kind === 'volley' ? around.slice(0, s.targets ?? 3) : near(centre, hitR).filter(e => u.air || !e.air || s.kind === 'ult');
      for (const e of targets) { hurtEnemy(m, e, u.atk * s.mul, u.id, events); if (s.stun) e.stun = Math.max(e.stun, e.boss ? s.stun * .3 : s.stun); if (s.slow) { e.slow = Math.max(e.slow, s.slow); e.slowT = Math.max(e.slowT, 3); } }
    }
    if (s.heal) for (const v of m.units) if (v.down <= 0 && dist(v, u) <= s.r) healUnit(v, v.maxHp * s.heal, events);
    events.push({ kind: 'boom', x: centre.x, z: centre.z, r: s.r, style: s.heal && !s.mul ? 'heal' : 'skill' });
    break;
  }
}
setSquadStepper(stepSquad);

// ---------------------------------------------------------------- a stand-in hero and a build planner (tests, probes, the dev autopilot)
/** The stand-in hero: guards the busiest post, hits like an explorer of the mission's level (about 1.6 hits a second). */
export function heroBot(m: RsRun, dt: number, events: RsEvent[], state: { cd: number }) {
  const me = hero(m); if (me.down > 0 || m.phase === 'over') return;
  state.cd -= dt;
  const field = fieldOf(m), post = field.posts[0] ?? field.camp, live = m.enemies.filter(e => e.hp > 0);
  let target: RsEnemy | null = null, best = Infinity;
  for (const e of live) { if (dist(e, post) > 12) continue; const k = remaining(m, e); if (k < best) { best = k; target = e; } }
  const goal = target ? { x: target.x - Math.sign(target.x - me.x || 1) * 1.6, z: target.z } : post;
  const dx = goal.x - me.x, dz = goal.z - me.z, d = Math.hypot(dx, dz);
  if (d > .2) { const k = Math.min(d, 5 * dt) / d; setHero(m, me.x + dx * k, me.z + dz * k); }
  if (target && dist(me, target) < 2.6 && state.cd <= 0) { state.cd = .62; heroHit(m, target.id, 1, events); }
}
/** Spends the build phase sensibly: defences near your end first, then upgrades and the squad's ladder. */
export function autoPlan(m: RsRun, opts: { squadShare?: number } = {}): RsEvent[] {
  const out: RsEvent[] = []; if (m.phase !== 'build') return out;
  const field = fieldOf(m), order = field.pads.map((p, i) => ({ i, x: p.x })).sort((a, b) => a.x - b.x).map(p => p.i);
  const plan: DefenceKind[] = ['popcorn', 'cannon', 'popcorn', 'frost', 'tesla', 'cannon', 'popcorn', 'wall', 'tesla', 'cannon', 'popcorn', 'frost'];
  const share = opts.squadShare ?? .3;
  for (let guard = 0; guard < 60; guard++) {
    const empty = order.find(i => !m.defences[i]);
    const built = m.defences.filter(Boolean).length, kind = plan[built % plan.length];
    const place = () => { if (empty === undefined || m.spark < DEFENCES[kind].levels[0].cost) return false; const r = placeDefence(m, empty, kind); if (typeof r === 'string') return false; out.push(...r); return true; };
    // A few defences first (more each wave), then the squad's ladder while Star bits allow, then upgrades and more defences.
    if (built < Math.min(field.pads.length, 2 + m.wave) && place()) continue;
    const squad = m.units.filter(u => u.id !== ME).sort((a, b) => a.step - b.step);
    const next = squad.find(u => { const c = stepCost(u); return c && c.spark <= m.spark * share + 20 && c.stars <= m.stars; });
    if (next && typeof buyStep(m, next.id) !== 'string') { out.push({ kind: 'step', unit: next.id, step: next.step }); continue; }
    if (place()) continue;
    const up = order.map(i => m.defences[i]).filter((d): d is NonNullable<typeof d> => !!d && d.level < 3).sort((a, b) => DEFENCES[a.kind].levels[a.level].cost - DEFENCES[b.kind].levels[b.level].cost)[0];
    if (up && m.spark >= DEFENCES[up.kind].levels[up.level].cost) { const r = upgradeDefence(m, up.pad); if (typeof r !== 'string') { out.push(...r); continue; } }
    break;
  }
  return out;
}
/** Plays a whole run in node with the stand-in hero and planner: returns the run when it is over (or after `limit` s). */
export function simulate(m: RsRun, o: { build?: boolean; hero?: boolean; limit?: number; dt?: number } = {}) {
  const st = { cd: 0 }, dt = o.dt ?? .1, limit = o.limit ?? 1800;
  for (let t = 0; t < limit && m.phase !== 'over'; t += dt) {
    if (m.phase === 'build') { if (o.build !== false) autoPlan(m); startWave(m); }
    if (o.hero !== false) heroBot(m, dt, [], st);
    stepRun(m, dt);
  }
  return m;
}
export { DEFENCE_KINDS };
