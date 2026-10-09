/**
 * Rescue Call rules: a pure, seeded, serialisable mission state (like Flag Rush's ctf-rules.ts), so a later phase can
 * run it on the server for co-op squads. No DOM, no three.js, no Date/Math.random: time comes in as `dt`, chance from
 * the run's own seeded stream.
 *
 * The field is in "landscape local" coordinates (rescue-content.ts); toWorld/toLocal map it onto the home map for the
 * orientation chosen once at entry (landscape: your end left, enemies from the right; portrait: your end at the
 * bottom, enemies from the top).
 *
 * One run: build phase (place / upgrade / sell defences on pads, climb the squad ladder, buy hero boosts) → a wave
 * (enemies walk their lanes; defences, the squad and the hero fight; a leak costs hearts) → build → … → the last wave
 * (with the planet's boss) → over. Lost when the hearts run out, or when a raider gets through while every member of
 * the squad has fallen back at once.
 */
import { RESCUE, ROLES, DEFENCES, MISSIONS, FIELDS, LADDER_COST, LADDER_STEPS, BOOSTS, SPLIT_INTO, BOSS_STARS, FREEZE_EVERY, SHIELD_TIME, SQUAD_SKILLS, heroAtk, heroHp, defenceSpent,
  type MissionId, type EnemyRole, type DefenceKind, type SquadRole, type Point, type BoostKind } from './rescue-content.ts';
import { ENEMY_TYPES } from './enemy-types.ts';
import { ladderFor, assignDisguises, memberStats, type LadderGear } from './rescue-ladder.ts';

// ---------------------------------------------------------------- geometry: routes, pads, posts
export interface Route { pts: Point[]; cum: number[]; length: number }
export function makeRoute(pts: Point[]): Route {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, cum, length: cum[cum.length - 1] };
}
/** The point `d` metres along a route and the direction of travel there. */
export function pointAt(r: Route, d: number): { x: number; z: number; dx: number; dz: number } {
  const dd = Math.max(0, Math.min(r.length, d));
  let i = 1; while (i < r.cum.length - 1 && r.cum[i] < dd) i++;
  const a = r.pts[i - 1], b = r.pts[i], seg = Math.max(1e-6, r.cum[i] - r.cum[i - 1]), k = (dd - r.cum[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
}
/** Distance from a point to a route, and how far along it the nearest point is. */
export function nearestOnRoute(r: Route, p: Point): { dist: number; d: number; x: number; z: number } {
  let best = { dist: Infinity, d: 0, x: 0, z: 0 };
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], vx = b.x - a.x, vz = b.z - a.z, len2 = vx * vx + vz * vz || 1e-6;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2)), x = a.x + vx * k, z = a.z + vz * k, dist = Math.hypot(p.x - x, p.z - z);
    if (dist < best.dist) best = { dist, d: r.cum[i - 1] + Math.sqrt(len2) * k, x, z };
  }
  return best;
}
export interface FieldPad { x: number; z: number; lane: number; /** Where a wall on this pad blocks: the nearest route point. */ block: { lane: number; route: number; d: number; x: number; z: number } }
export interface Field { mission: MissionId; wide: boolean; lanes: Array<{ routes: Route[]; wide: boolean; index: number }>; pads: FieldPad[]; posts: Point[]; camp: Point }
const fieldCache = new Map<string, Field>();
/** The field for a mission; `wide` opens the wide-screen lanes. Pads and posts are computed from the routes. */
export function buildField(mission: MissionId, wide: boolean): Field {
  const key = mission + (wide ? ':w' : ''); const hit = fieldCache.get(key); if (hit) return hit;
  const def = FIELDS[mission];
  const lanes = def.lanes.map((l, index) => ({ routes: l.routes.map(makeRoute), wide: !!l.wide, index })).filter(l => wide || !l.wide);
  const all = def.lanes.map(l => l.routes.map(makeRoute));
  const pads = padSpots(mission, lanes.flatMap(l => l.routes.map((rt, ri) => ({ rt, lane: l.index, ri }))), wide ? def.pads[1] : def.pads[0]);
  const posts = def.posts.filter(p => wide || !def.lanes[p.lane]?.wide).map(p => { const r = all[p.lane][p.route ?? 0], at = pointAt(r, r.length * p.at); return { x: at.x, z: at.z }; });
  const field: Field = { mission, wide, lanes, pads, posts, camp: { ...RESCUE.camp } };
  fieldCache.set(key, field); return field;
}
/**
 * The build pads, placed from the routes (so every pad is beside a path, never on one): candidates on a 1 m grid
 * 2.4–3.6 m from the nearest path, clear of the decor; lanes take turns, and each pick is that lane's spot reaching the
 * most path length within 6.5 m (choke points and merges first, your half a little preferred), 4.6 m from other pads.
 */
export function padSpots(mission: MissionId, routes: Array<{ rt: Route; lane: number; ri: number }>, count: number): FieldPad[] {
  const samples: Point[] = []; for (const { rt } of routes) for (let d = 0; d <= rt.length; d += 1) { const p = pointAt(rt, d); samples.push({ x: p.x, z: p.z }); }
  const decor = FIELDS[mission].decor, cands: Array<{ x: number; z: number; score: number; near: { lane: number; route: number; d: number; x: number; z: number } }> = [];
  for (let x = -23; x <= 25; x += 1) for (let z = -14; z <= 14; z += 1) {
    let best = { dist: Infinity, lane: 0, route: 0, d: 0, x: 0, z: 0 };
    for (const { rt, lane, ri } of routes) { const n = nearestOnRoute(rt, { x, z }); if (n.dist < best.dist) best = { dist: n.dist, lane, route: ri, d: n.d, x: n.x, z: n.z }; }
    if (best.dist < 2.4 || best.dist > 3.6 || decor.some(([, dx, dz]) => Math.hypot(dx - x, dz - z) < 2.6)) continue;
    let reach = 0; for (const s of samples) if ((s.x - x) ** 2 + (s.z - z) ** 2 < 6.5 * 6.5) reach++;
    cands.push({ x, z, score: reach * (x < 0 ? 1.15 : 1) - Math.abs(z) * .01, near: { lane: best.lane, route: best.route, d: best.d, x: best.x, z: best.z } });
  }
  cands.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z);
  const out: FieldPad[] = [], lanes = [...new Set(routes.map(r => r.lane))], per = new Map<number, number>(lanes.map(l => [l, 0]));
  const free = (c: typeof cands[number]) => !out.some(p => Math.hypot(p.x - c.x, p.z - c.z) < 4.6);
  // Lanes take turns (the one with the fewest pads picks next), so every lane can be defended.
  while (out.length < count) {
    const order = [...lanes].sort((a, b) => per.get(a)! - per.get(b)! || a - b);
    let pick: typeof cands[number] | undefined;
    for (const lane of order) { pick = cands.find(c => c.near.lane === lane && free(c)); if (pick) break; }
    if (!pick) break;
    out.push({ x: pick.x, z: pick.z, lane: pick.near.lane, block: pick.near }); per.set(pick.near.lane, per.get(pick.near.lane)! + 1);
  }
  // Read the pads in a stable order: from your end outwards, top to bottom.
  return out.sort((a, b) => a.x - b.x || a.z - b.z);
}
/** A wave's lane number on this field: lanes that are closed (wide-only on a narrow screen) fall back to a core lane. */
export function laneSlot(field: Field, lane: number) { const i = field.lanes.findIndex(l => l.index === lane); return i >= 0 ? i : lane % field.lanes.length; }

// ---------------------------------------------------------------- orientation
export type Orientation = 'landscape' | 'portrait';
/** Chosen once at entry from the screen's shape: a phone held upright plays the field rotated. */
export const chooseOrientation = (w: number, h: number): Orientation => (h > w * 1.05 ? 'portrait' : 'landscape');
/** Wide screens (landscape and at least 900 px across) open the extra lanes. */
export const wideScreen = (o: Orientation, w: number) => o === 'landscape' && w >= 900;
/** Local → home-map coordinates. Portrait turns the field a quarter (rotation.y = π/2): +x (enemies) goes to −z (top). */
export function toWorld(p: Point, o: Orientation, c: Point = RESCUE.arena): Point { return o === 'portrait' ? { x: c.x + p.z, z: c.z - p.x } : { x: c.x + p.x, z: c.z + p.z }; }
export function toLocal(p: Point, o: Orientation, c: Point = RESCUE.arena): Point { const dx = p.x - c.x, dz = p.z - c.z; return o === 'portrait' ? { x: -dz, z: dx } : { x: dx, z: dz }; }
/** A facing (atan2(dx, dz)) in local space as a world facing. */
export const facingToWorld = (f: number, o: Orientation) => (o === 'portrait' ? f + Math.PI / 2 : f);
/** The field root's yaw for the orientation. */
export const fieldYaw = (o: Orientation) => (o === 'portrait' ? Math.PI / 2 : 0);

// ---------------------------------------------------------------- state
export interface RsEnemy {
  id: number; kind: string; role: EnemyRole; lane: number; route: number; d: number; off: number; x: number; z: number; facing: number;
  hp: number; maxHp: number; dmg: number; speed: number; air: boolean; boss: boolean; variant: number;
  slow: number; slowT: number; freeze: number; stun: number; cd: number; skillCd: number; target: string | null; hit: number;
}
export interface RsDefence { pad: number; kind: DefenceKind; level: number; hp: number; maxHp: number; cd: number; aim: number; freezeCd: number; spent: number }
export interface RsUnit {
  id: string; name: string; kind: 'hero' | 'helper' | 'neighbour'; role: SquadRole; step: number; ladder: LadderGear[]; disguise: string;
  x: number; z: number; facing: number; hp: number; maxHp: number; atk: number; def: number; range: number; rate: number; air: boolean; speed: number;
  cd: number; down: number; post: number; skillCd: [number, number, number]; target: number | null;
  /** Display only (the view): colour and the look id for helpers. */ color: string; look?: string; friend?: string;
}
export interface SquadSpec { id: string; name: string; kind: 'helper' | 'neighbour'; role: SquadRole; color: string; look?: string; friend?: string }
export interface RsResult { won: boolean; waves: number; reason: 'won' | 'hearts' | 'routed' | 'leave'; seconds: number }
export interface RsRun {
  id: string; seed: number; rng: number; mission: MissionId; wide: boolean; level: number;
  phase: 'build' | 'wave' | 'over'; timer: number; elapsed: number; wave: number; cleared: number; waveT: number;
  hearts: number; spark: number; stars: number; order: 'hold' | 'follow';
  enemies: RsEnemy[]; queue: Array<{ t: number; role: EnemyRole; lane: number }>; nextId: number; flip: number[];
  defences: Array<RsDefence | null>; units: RsUnit[];
  boosts: Record<BoostKind, number>; shield: number; shieldT: number;
  stats: { kills: number; leaks: number; spark: number; stars: number; bosses: number };
  /** Leaks since the whole squad fell back (reset when anyone is back up). */ rout: number;
  result: RsResult | null;
}
export type RsEvent =
  | { kind: 'wave'; wave: number; boss: boolean } | { kind: 'clear'; wave: number; spark: number; stars: number }
  | { kind: 'spawn'; id: number; role: EnemyRole; enemy: string; boss: boolean }
  | { kind: 'leak'; id: number; hearts: number; boss: boolean; x: number; z: number }
  | { kind: 'kill'; id: number; role: EnemyRole; enemy: string; x: number; z: number; spark: number; stars: number; by: string; boss: boolean }
  | { kind: 'hurt'; id: number; amount: number; x: number; z: number; by: string }
  | { kind: 'shot'; from: Point; to: Point; style: DefenceKind | 'enemy' | 'squad' | 'chain'; y?: number }
  | { kind: 'boom'; x: number; z: number; r: number; style: 'cannon' | 'frost' | 'slam' | 'skill' | 'heal' | 'freeze' }
  | { kind: 'def-hit'; pad: number; amount: number } | { kind: 'broken'; pad: number; defence: DefenceKind }
  | { kind: 'unit-hit'; unit: string; amount: number; x: number; z: number } | { kind: 'down'; unit: string } | { kind: 'back'; unit: string }
  | { kind: 'heal'; unit: string; amount: number }
  | { kind: 'skill'; unit: string; slot: number; x: number; z: number; r: number; role: SquadRole }
  | { kind: 'swing'; unit: string; target: number; ranged: boolean }
  | { kind: 'split'; id: number; x: number; z: number } | { kind: 'freeze'; pad: number }
  | { kind: 'step'; unit: string; step: number } | { kind: 'boost'; boost: BoostKind }
  | { kind: 'build'; pad: number; defence: DefenceKind; level: number } | { kind: 'sold'; pad: number; spark: number }
  | { kind: 'over'; result: RsResult };

export const ME = 'me';
/** The run's seeded stream (mulberry32): the only chance in the rules. */
export function roll(m: RsRun) { let t = (m.rng = (m.rng + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

export function createRun(o: { id: string; seed: number; mission: MissionId; wide: boolean; squad: readonly SquadSpec[]; heroDisguise?: string | null; heroName?: string }): RsRun {
  const mission = MISSIONS[o.mission], field = buildField(o.mission, o.wide), L = mission.level;
  const squad = o.squad.slice(0, RESCUE.maxSquad - 1);
  const disguises = assignDisguises(squad.map(s => s.role), o.heroDisguise ?? null);
  const hero: RsUnit = {
    id: ME, name: o.heroName ?? 'You', kind: 'hero', role: 'fighter', step: 0, ladder: [{}], disguise: o.heroDisguise ?? '',
    x: field.camp.x + 3, z: field.camp.z, facing: Math.PI / 2, hp: heroHp(L), maxHp: heroHp(L), atk: heroAtk(L), def: 0, range: 2.4, rate: 1.6, air: true, speed: 5,
    cd: 0, down: 0, post: -1, skillCd: [0, 0, 0], target: null, color: '#ffffff',
  };
  const units: RsUnit[] = [hero, ...squad.map((s, i): RsUnit => {
    const ladder = ladderFor(s.role, disguises[i]), st = memberStats(ladder[0]), post = i % Math.max(1, field.posts.length), p = field.posts[post] ?? field.camp;
    return { id: s.id, name: s.name, kind: s.kind, role: s.role, step: 0, ladder, disguise: disguises[i], x: p.x, z: p.z, facing: Math.PI / 2,
      hp: st.hp, maxHp: st.hp, atk: st.atk, def: st.def, range: st.range, rate: st.rate, air: st.air, speed: st.speed,
      cd: 0, down: 0, post, skillCd: [0, 0, 0], target: null, color: s.color, look: s.look, friend: s.friend };
  })];
  return {
    id: o.id, seed: o.seed >>> 0, rng: (o.seed >>> 0) || 1, mission: o.mission, wide: o.wide, level: L,
    phase: 'build', timer: RESCUE.firstBuild, elapsed: 0, wave: 0, cleared: 0, waveT: 0,
    hearts: RESCUE.hearts, spark: RESCUE.startSpark, stars: RESCUE.startStars, order: 'hold',
    enemies: [], queue: [], nextId: 1, flip: field.lanes.map(() => 0),
    defences: field.pads.map(() => null), units,
    boosts: { dmg: 0, haste: 0, cdr: 0, potion: 0, shield: 0 }, shield: 0, shieldT: 0,
    stats: { kills: 0, leaks: 0, spark: 0, stars: 0, bosses: 0 }, rout: 0, result: null,
  };
}
export const fieldOf = (m: RsRun) => buildField(m.mission, m.wide);
export const unit = (m: RsRun, id: string) => m.units.find(u => u.id === id);
export const hero = (m: RsRun) => m.units[0];
export const totalWaves = (m: RsRun) => MISSIONS[m.mission].waves.length;
export const liveEnemies = (m: RsRun) => m.enemies.filter(e => e.hp > 0);

// ---------------------------------------------------------------- the build phase: defences, the ladder, boosts
export type Refusal = 'phase' | 'pad' | 'spark' | 'stars' | 'max' | 'empty' | 'taken' | 'unit';
export function placeDefence(m: RsRun, pad: number, kind: DefenceKind): RsEvent[] | Refusal {
  if (m.phase === 'over') return 'phase';
  if (!Number.isInteger(pad) || pad < 0 || pad >= m.defences.length || !DEFENCES[kind]) return 'pad';
  if (m.defences[pad]) return 'taken';
  const lv = DEFENCES[kind].levels[0]; if (m.spark < lv.cost) return 'spark';
  m.spark -= lv.cost;
  m.defences[pad] = { pad, kind, level: 1, hp: lv.hp, maxHp: lv.hp, cd: .3, aim: Math.PI / 2, freezeCd: 1, spent: lv.cost };
  return [{ kind: 'build', pad, defence: kind, level: 1 }];
}
export function upgradeDefence(m: RsRun, pad: number): RsEvent[] | Refusal {
  if (m.phase === 'over') return 'phase';
  const d = m.defences[pad]; if (!d) return 'empty'; if (d.level >= 3) return 'max';
  const next = DEFENCES[d.kind].levels[d.level]; if (m.spark < next.cost) return 'spark';
  m.spark -= next.cost; d.spent += next.cost; d.level++;
  // An upgrade also mends: health keeps its share of the new maximum, plus the gain.
  const share = d.hp / d.maxHp; d.maxHp = next.hp; d.hp = Math.min(next.hp, Math.round(share * next.hp + next.hp * .25));
  return [{ kind: 'build', pad, defence: d.kind, level: d.level }];
}
export function sellDefence(m: RsRun, pad: number): RsEvent[] | Refusal {
  if (m.phase === 'over') return 'phase';
  const d = m.defences[pad]; if (!d) return 'empty';
  const back = Math.floor(d.spent * RESCUE.sellBack); m.spark += back; m.defences[pad] = null;
  return [{ kind: 'sold', pad, spark: back }];
}
/** Spark and Star bits for a member's next ladder step, or null at the top. */
export const stepCost = (u: RsUnit) => (u.step >= LADDER_STEPS || u.kind === 'hero' ? null : LADDER_COST[u.step + 1]);
export function applyStats(u: RsUnit) {
  const st = memberStats(u.ladder[u.step] ?? {}), share = u.maxHp > 0 ? u.hp / u.maxHp : 1;
  Object.assign(u, { maxHp: st.hp, atk: st.atk, def: st.def, range: st.range, rate: st.rate, air: st.air, speed: st.speed });
  u.hp = u.down > 0 ? u.hp : Math.max(1, Math.round(share * st.hp));
}
export function buyStep(m: RsRun, id: string): RsEvent[] | Refusal {
  if (m.phase !== 'build') return 'phase';
  const u = unit(m, id); if (!u || u.kind === 'hero') return 'unit';
  const cost = stepCost(u); if (!cost) return 'max';
  if (m.spark < cost.spark) return 'spark'; if (m.stars < cost.stars) return 'stars';
  m.spark -= cost.spark; m.stars -= cost.stars; u.step++; applyStats(u);
  return [{ kind: 'step', unit: u.id, step: u.step }];
}
export function buyBoost(m: RsRun, kind: BoostKind): RsEvent[] | Refusal {
  if (m.phase === 'over') return 'phase';
  const b = BOOSTS[kind]; if (!b) return 'unit'; if (m.boosts[kind] >= b.max) return 'max';
  if (m.spark < b.spark) return 'spark'; if (m.stars < b.stars) return 'stars';
  m.spark -= b.spark; m.stars -= b.stars; m.boosts[kind]++;
  const me = hero(m);
  if (kind === 'potion' && me.down <= 0) { const heal = Math.round(me.maxHp * b.value); me.hp = Math.min(me.maxHp, me.hp + heal); }
  if (kind === 'shield') { m.shield = Math.round(me.maxHp * b.value); m.shieldT = SHIELD_TIME; }
  return [{ kind: 'boost', boost: kind }];
}
/** The hero's damage multiplier, attack-speed factor and skill cooldown factor from the Me tab. */
export const heroDamageScale = (m: RsRun) => 1 + m.boosts.dmg * BOOSTS.dmg.value;
export const heroHaste = (m: RsRun) => 1 + m.boosts.haste * BOOSTS.haste.value;
export const heroCooldownScale = (m: RsRun) => 1 - m.boosts.cdr * BOOSTS.cdr.value;
export function setOrder(m: RsRun, order: 'hold' | 'follow') { m.order = order; }
/** Skips the rest of the build phase. */
export function startWave(m: RsRun): RsEvent[] {
  if (m.phase !== 'build') return [];
  const mission = MISSIONS[m.mission], w = mission.waves[m.wave]; if (!w) return [];
  const field = fieldOf(m); m.phase = 'wave'; m.waveT = 0; m.queue = [];
  for (const g of w.groups) for (let i = 0; i < g.n; i++) m.queue.push({ t: g.at + i * g.gap, role: g.role, lane: laneSlot(field, g.lane) });
  m.queue.sort((a, b) => a.t - b.t);
  return [{ kind: 'wave', wave: m.wave, boss: w.boss }];
}

// ---------------------------------------------------------------- enemies
/** An enemy's numbers for this mission and wave: the creature's own health and damage × its role × the wave. */
export function enemyNumbers(mission: MissionId, wave: number, role: EnemyRole) {
  const md = MISSIONS[mission], kind = md.kinds[role] ?? md.kinds.grunt!, def = ENEMY_TYPES[kind], r = ROLES[role], w = md.waves[Math.min(wave, md.waves.length - 1)];
  return { kind, hp: Math.round(def.hp * r.hp * w.hp * md.hpScale), dmg: Math.round(def.damage * r.dmg * w.dmg * 10) / 10, speed: r.speed };
}
function spawn(m: RsRun, role: EnemyRole, lane: number, events: RsEvent[], at?: { route: number; d: number }) {
  const field = fieldOf(m), L = field.lanes[lane] ?? field.lanes[0], n = enemyNumbers(m.mission, m.wave, role);
  const route = at?.route ?? (L.routes.length > 1 ? m.flip[lane]++ % L.routes.length : 0), d = at?.d ?? 0, r = L.routes[route], p = pointAt(r, d);
  const roleDef = ROLES[role], off = (roll(m) - .5) * (role === 'boss' ? 0 : 1.6);
  const e: RsEnemy = { id: m.nextId++, kind: n.kind, role, lane, route, d, off, x: p.x, z: p.z, facing: Math.atan2(p.dx, p.dz), hp: n.hp, maxHp: n.hp, dmg: n.dmg, speed: n.speed * (.94 + roll(m) * .12),
    air: roleDef.air, boss: role === 'boss', variant: m.wave >= 6 ? 3 : m.wave >= 4 ? 2 : m.wave >= 2 ? 1 : 0, slow: 0, slowT: 0, freeze: 0, stun: 0, cd: .5, skillCd: 4, target: null, hit: 0 };
  m.enemies.push(e); events.push({ kind: 'spawn', id: e.id, role, enemy: e.kind, boss: e.boss });
  return e;
}
const routeOf = (m: RsRun, e: RsEnemy) => fieldOf(m).lanes[e.lane].routes[e.route];
function placeEnemy(m: RsRun, e: RsEnemy) {
  const p = pointAt(routeOf(m, e), e.d); e.x = p.x - p.dz * e.off; e.z = p.z + p.dx * e.off; e.facing = Math.atan2(p.dx, p.dz);
}
/** Metres left to the camp: lower is more dangerous (towers aim at the closest to leaking). */
export const remaining = (m: RsRun, e: RsEnemy) => routeOf(m, e).length - e.d;
export function hurtEnemy(m: RsRun, e: RsEnemy, amount: number, by: string, events: RsEvent[]) {
  if (e.hp <= 0 || !(amount > 0)) return 0;
  const lost = Math.min(e.hp, amount); e.hp -= lost; e.hit = .15;
  events.push({ kind: 'hurt', id: e.id, amount: Math.round(lost), x: e.x, z: e.z, by });
  if (e.hp <= 0) kill(m, e, by, events);
  return lost;
}
/** Spark for a kill: the role's share, worth a little more each wave (tougher raiders, bigger bounty). */
export const killSpark = (role: EnemyRole, wave: number) => Math.round(ROLES[role].spark * (1 + RESCUE.sparkPerWave * wave));
function kill(m: RsRun, e: RsEnemy, by: string, events: RsEvent[]) {
  e.hp = 0; const r = ROLES[e.role];
  const spark = killSpark(e.role, m.wave), stars = (e.boss ? BOSS_STARS : 0) + (roll(m) < r.star ? 1 : 0);
  m.spark += spark; m.stars += stars; m.stats.kills++; m.stats.spark += spark; m.stats.stars += stars; if (e.boss) m.stats.bosses++;
  events.push({ kind: 'kill', id: e.id, role: e.role, enemy: e.kind, x: e.x, z: e.z, spark, stars, by, boss: e.boss });
  if (e.role === 'splitter') {
    events.push({ kind: 'split', id: e.id, x: e.x, z: e.z });
    for (let i = 0; i < SPLIT_INTO; i++) { const s = spawn(m, 'mini', e.lane, events, { route: e.route, d: Math.max(0, e.d - .6 * i) }); s.off = (i - 1) * .7; placeEnemy(m, s); }
  }
}
/** The explorer's own hit (their real combat, on a stand-in body): `multiple` of their attack, landed as the mission hero's. */
export function heroHit(m: RsRun, id: number, multiple: number, events: RsEvent[] = []): number {
  const e = m.enemies.find(v => v.id === id); if (!e || e.hp <= 0 || !(multiple > 0) || m.phase === 'over') return 0;
  const me = hero(m); if (me.down > 0) return 0;
  return hurtEnemy(m, e, multiple * me.atk * heroDamageScale(m), ME, events);
}
/** Statuses the hero's skills put on an enemy (stun / slow, seconds). */
export function statusEnemy(m: RsRun, id: number, kind: 'stun' | 'slow', seconds: number) {
  const e = m.enemies.find(v => v.id === id); if (!e || e.hp <= 0) return;
  const s = Math.min(e.boss ? 1 : 3, Math.max(0, seconds));
  if (kind === 'stun') e.stun = Math.max(e.stun, s); else { e.slow = Math.max(e.slow, .45); e.slowT = Math.max(e.slowT, s); }
}
/** A knock-back from the hero's skills pushes an enemy back along its lane. */
export function pushBack(m: RsRun, id: number, metres: number) { const e = m.enemies.find(v => v.id === id); if (!e || e.hp <= 0 || e.boss) return; e.d = Math.max(0, e.d - Math.min(3, Math.max(0, metres))); placeEnemy(m, e); }
export function hurtUnit(m: RsRun, u: RsUnit, raw: number, events: RsEvent[]) {
  if (u.down > 0 || !(raw > 0)) return 0;
  let amount = raw * (1 - u.def / (u.def + 60));
  if (u.id === ME && m.shield > 0) { const soak = Math.min(m.shield, amount); m.shield -= soak; amount -= soak; }
  amount = Math.round(amount * 10) / 10; if (amount <= 0) return 0;
  u.hp = Math.max(0, u.hp - amount); events.push({ kind: 'unit-hit', unit: u.id, amount, x: u.x, z: u.z });
  if (u.hp <= 0) { u.down = u.id === ME ? RESCUE.heroDown : RESCUE.recover; u.target = null; events.push({ kind: 'down', unit: u.id }); }
  return amount;
}
export function healUnit(u: RsUnit, amount: number, events: RsEvent[]) { if (u.down > 0 || u.hp >= u.maxHp || !(amount > 0)) return; const h = Math.min(u.maxHp - u.hp, amount); u.hp += h; events.push({ kind: 'heal', unit: u.id, amount: Math.round(h) }); }
function hurtDefence(m: RsRun, d: RsDefence, amount: number, events: RsEvent[]) {
  d.hp -= amount; events.push({ kind: 'def-hit', pad: d.pad, amount: Math.round(amount) });
  if (d.hp <= 0) { m.defences[d.pad] = null; events.push({ kind: 'broken', pad: d.pad, defence: d.kind }); }
}
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

function stepEnemies(m: RsRun, dt: number, events: RsEvent[]) {
  const field = fieldOf(m), up = m.units.filter(u => u.down <= 0);
  for (const e of m.enemies) {
    if (e.hp <= 0) continue;
    e.hit = Math.max(0, e.hit - dt); e.cd -= dt; e.skillCd -= dt; e.slowT -= dt; if (e.slowT <= 0) e.slow = 0;
    if (e.freeze > 0 || e.stun > 0) { e.freeze -= dt; e.stun -= dt; continue; }
    const role = ROLES[e.role];
    // The wave boss slams the ground every few seconds: units and defences round it are hurt.
    if (e.boss && e.skillCd <= 0) {
      const near = up.some(u => dist(u, e) < 3.2) || m.defences.some(d => d && dist(field.pads[d.pad], e) < 3.2);
      if (near) { e.skillCd = 6; events.push({ kind: 'boom', x: e.x, z: e.z, r: 3.2, style: 'slam' }); for (const u of up) if (dist(u, e) < 3.2) hurtUnit(m, u, e.dmg * 1.4, events); for (const d of m.defences) if (d && dist(field.pads[d.pad], e) < 3.2) hurtDefence(m, d, e.dmg * 2, events); }
    }
    // What stops it: a unit in its way, a wall on its lane, a defence to smash, a target to shoot.
    let foe: { unit?: RsUnit; def?: RsDefence } | null = null;
    if (role.blocked && !e.air) {
      for (const d of m.defences) { if (!d || d.kind !== 'wall') continue; const b = field.pads[d.pad].block; if (b.lane === field.lanes[e.lane].index && b.route === e.route && e.d >= b.d - 1.2 && e.d <= b.d + .3 || dist(b, e) < DEFENCES.wall.levels[d.level - 1].block! * .55) { foe = { def: d }; break; } }
      if (!foe) for (const u of up) if (dist(u, e) < role.radius + .75) { foe = { unit: u }; break; }
    }
    if (!foe && role.smash) for (const d of m.defences) if (d && d.kind !== 'wall' && dist(field.pads[d.pad], e) < 2.6) { foe = { def: d }; break; }
    if (!foe && e.role === 'shooter') {
      let best = Infinity;
      for (const d of m.defences) if (d) { const k = dist(field.pads[d.pad], e); if (k < role.range && k < best) { best = k; foe = { def: d }; } }
      if (!foe) for (const u of up) { const k = dist(u, e); if (k < role.range && k < best) { best = k; foe = { unit: u }; } }
    }
    if (foe) {
      const tp = foe.unit ?? field.pads[foe.def!.pad];
      e.facing = Math.atan2(tp.x - e.x, tp.z - e.z); e.target = foe.unit ? foe.unit.id : 'pad:' + foe.def!.pad;
      if (e.cd <= 0) {
        e.cd = role.cd;
        if (e.role === 'shooter') events.push({ kind: 'shot', from: { x: e.x, z: e.z }, to: { x: tp.x, z: tp.z }, style: 'enemy' });
        if (foe.unit) hurtUnit(m, foe.unit, e.dmg, events); else hurtDefence(m, foe.def!, e.dmg * (role.smash ? 1.6 : 1), events);
      }
      continue;
    }
    // Raiders queue behind one that has stopped on their path (they line up instead of piling into one spot).
    if (role.blocked && !e.air && m.enemies.some(f => f !== e && f.hp > 0 && f.target !== null && !f.air && f.lane === e.lane && f.route === e.route && f.d - e.d > 0 && f.d - e.d < 1.25 && Math.abs(f.off - e.off) < 1)) { e.target = 'queue'; continue; }
    e.target = null;
    const slow = e.slowT > 0 ? 1 - e.slow : 1;
    e.d += e.speed * slow * dt; const r = routeOf(m, e);
    if (e.d >= r.length) { leak(m, e, events); continue; }
    placeEnemy(m, e);
  }
}
/** Every squad member (the hero aside) has fallen back at once. A solo explorer (no squad) is never routed. */
export const squadRouted = (m: RsRun) => m.units.length > 1 && m.units.every(u => u.id === ME || u.down > 0);
/** Leaks while the whole squad is back at the camp: this many in one rout ends the mission ("the hearts keep dropping"). */
export const ROUT_LEAKS = 3;
function leak(m: RsRun, e: RsEnemy, events: RsEvent[]) {
  e.hp = 0; const lost = e.boss ? RESCUE.leak.boss : RESCUE.leak.normal; m.hearts = Math.max(0, m.hearts - lost); m.stats.leaks++;
  events.push({ kind: 'leak', id: e.id, hearts: m.hearts, boss: e.boss, x: e.x, z: e.z });
  if (m.hearts <= 0) end(m, false, 'hearts', events);
  else if (squadRouted(m) && ++m.rout >= ROUT_LEAKS) end(m, false, 'routed', events);
}

// ---------------------------------------------------------------- defences
function stepDefences(m: RsRun, dt: number, events: RsEvent[]) {
  const field = fieldOf(m), live = m.enemies.filter(e => e.hp > 0);
  for (const d of m.defences) {
    if (!d || d.kind === 'wall') continue;
    const lv = DEFENCES[d.kind].levels[d.level - 1], pad = field.pads[d.pad], air = DEFENCES[d.kind].air;
    d.cd -= dt;
    const inRange = (e: RsEnemy) => e.hp > 0 && (air || !e.air) && dist(pad, e) <= lv.range;
    if (d.kind === 'frost') {
      d.freezeCd -= dt;
      if (d.cd > 0) continue; d.cd = 1 / lv.rate;
      let any = false;
      for (const e of live) if (inRange(e)) { any = true; e.slow = Math.max(e.slow, e.boss ? lv.slow! * .5 : lv.slow!); e.slowT = Math.max(e.slowT, .7); hurtEnemy(m, e, lv.dmg, 'pad:' + d.pad, events); }
      if (any && lv.freeze && d.freezeCd <= 0) { d.freezeCd = FREEZE_EVERY; events.push({ kind: 'freeze', pad: d.pad }, { kind: 'boom', x: pad.x, z: pad.z, r: lv.range, style: 'freeze' }); for (const e of live) if (inRange(e)) e.freeze = Math.max(e.freeze, e.boss ? lv.freeze * .4 : lv.freeze); }
      continue;
    }
    if (d.cd > 0) continue;
    let target: RsEnemy | null = null, best = Infinity;
    for (const e of live) if (inRange(e)) { const k = remaining(m, e); if (k < best) { best = k; target = e; } }
    if (!target) continue;
    d.cd = 1 / lv.rate; d.aim = Math.atan2(target.x - pad.x, target.z - pad.z);
    const by = 'pad:' + d.pad;
    if (d.kind === 'popcorn') { events.push({ kind: 'shot', from: pad, to: { x: target.x, z: target.z }, style: 'popcorn', y: target.air ? 1.6 : .9 }); hurtEnemy(m, target, lv.dmg, by, events); }
    else if (d.kind === 'tesla') {
      const hit = new Set<number>(); let cur: RsEnemy | null = target, from: Point = pad;
      for (let k = 0; k < (lv.chain ?? 1) && cur; k++) {
        hit.add(cur.id); events.push({ kind: 'shot', from, to: { x: cur.x, z: cur.z }, style: k ? 'chain' : 'tesla', y: cur.air ? 1.6 : .9 });
        hurtEnemy(m, cur, lv.dmg * (k ? .8 : 1), by, events); if (lv.slow) { cur.slow = Math.max(cur.slow, lv.slow); cur.slowT = Math.max(cur.slowT, 1); }
        from = { x: cur.x, z: cur.z }; let next: RsEnemy | null = null, nb = 3.4;
        for (const e of live) if (e.hp > 0 && !hit.has(e.id)) { const q = dist(e, from); if (q < nb) { nb = q; next = e; } }
        cur = next;
      }
    } else if (d.kind === 'cannon') {
      const at = { x: target.x, z: target.z }, r = lv.splash ?? 2;
      events.push({ kind: 'shot', from: pad, to: at, style: 'cannon' }, { kind: 'boom', x: at.x, z: at.z, r, style: 'cannon' });
      for (const e of live) if (e.hp > 0 && !e.air) { const k = dist(e, at); if (k <= r) hurtEnemy(m, e, lv.dmg * (1 - .4 * k / r), by, events); }
    }
  }
}

// ---------------------------------------------------------------- the squad (AI in rescue-ai.ts is imported lazily to keep this file the state)
type SquadStepper = (m: RsRun, dt: number, events: RsEvent[]) => void;
let squadStepper: SquadStepper | null = null;
/** rescue-ai.ts registers the squad's behaviour here (it needs these rules; this keeps the import one-way). */
export function setSquadStepper(fn: SquadStepper) { squadStepper = fn; }
/** A squad skill's numbers. */
export const skillOf = (u: RsUnit, slot: 0 | 1 | 2) => SQUAD_SKILLS[u.role][slot];

// ---------------------------------------------------------------- the step
export function stepRun(m: RsRun, dt: number): RsEvent[] {
  const events: RsEvent[] = [];
  if (m.phase === 'over' || !(dt > 0)) return events;
  dt = Math.min(dt, .1); m.elapsed += dt;
  if (m.shieldT > 0) { m.shieldT -= dt; if (m.shieldT <= 0) m.shield = 0; }
  // Downed units come back (squad at the camp after 15 s, the hero after 5 s).
  for (const u of m.units) if (u.down > 0) { u.down -= dt; if (u.down <= 0) { u.down = 0; u.hp = u.maxHp; u.x = m.units[0] === u ? RESCUE.camp.x + 2 : u.x; u.z = m.units[0] === u ? RESCUE.camp.z : u.z; events.push({ kind: 'back', unit: u.id }); } }
  if (m.phase === 'build') { m.timer -= dt; if (m.timer <= 0) events.push(...startWave(m)); squadStepper?.(m, dt, events); return events; }
  m.waveT += dt; if (!squadRouted(m)) m.rout = 0;
  while (m.queue.length && m.queue[0].t <= m.waveT && m.enemies.filter(e => e.hp > 0).length < RESCUE.maxLive) { const q = m.queue.shift()!; spawn(m, q.role, q.lane, events); }
  stepEnemies(m, dt, events); if (m.phase !== 'wave') return events;
  stepDefences(m, dt, events);
  squadStepper?.(m, dt, events);
  m.enemies = m.enemies.filter(e => e.hp > 0);
  if (!m.queue.length && !m.enemies.length) {
    const spark = RESCUE.waveSpark.base + RESCUE.waveSpark.per * (m.wave + 1), stars = RESCUE.waveStars;
    m.spark += spark; m.stars += stars; m.cleared = m.wave + 1; events.push({ kind: 'clear', wave: m.wave, spark, stars });
    if (m.cleared >= totalWaves(m)) end(m, true, 'won', events);
    else { m.wave++; m.phase = 'build'; m.timer = RESCUE.build; }
  }
  return events;
}
function end(m: RsRun, won: boolean, reason: RsResult['reason'], events: RsEvent[]) {
  if (m.phase === 'over') return;
  m.phase = 'over'; m.result = { won, waves: m.cleared, reason, seconds: Math.round(m.elapsed) };
  events.push({ kind: 'over', result: m.result });
}
export function forfeit(m: RsRun): RsEvent[] { const ev: RsEvent[] = []; end(m, false, 'leave', ev); return ev; }
/** Moves the hero (the explorer walks freely; the runtime reports where they are). */
export function setHero(m: RsRun, x: number, z: number) { const me = hero(m); if (me.down > 0) return; const fx = x - me.x, fz = z - me.z; if (fx * fx + fz * fz > 1e-6) me.facing = Math.atan2(fx, fz); me.x = x; me.z = z; }
/** The claim the run supports (rescue-claim.ts checks it again). */
export const claimOf = (m: RsRun) => ({ runId: m.id, mission: m.mission, waves: m.cleared, won: !!m.result?.won, seconds: Math.round(m.elapsed) });
/** The spark a pad's defence would sell for. */
export const sellValue = (d: RsDefence) => Math.floor(d.spent * RESCUE.sellBack);
export { defenceSpent };
