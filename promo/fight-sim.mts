// Scripted fights for balance (docs/FIGHT-PLAN.md section 7): a hero at the level a boss is met, played by a simple
// script, against the real creature AI (world.ts) and the real combat rules (combat.ts, moves.ts, jump-rules.ts).
//   node --experimental-strip-types promo/fight-sim.mts            the tables
//   BLOCK=0.6 node --experimental-strip-types promo/fight-sim.mts  try another block share for the blocking bosses
// Scripts (no food is eaten: "taken" is the damage taken in units of the hero's full health, so above 1.0 the hero needs
// to eat or dodge better):
//   'classic'  the switch off: the game before jumping, with the four old skills
//   'careless' the attack chain and the three moves on the ground: never jumping and never stepping out of a mark
//   'single'   the same and one jump, used only to dodge ground attacks
// Every script but 'classic' and 'careless' is careful: it leaves the place a hit will land (a body mark, a bite's arc, a
// spinning boss) when it can get out in time, and comes back.
//   'double'   the double jump: the moves, the air swings, the dives
//   'ground', 'launch', 'chase'  one route of the plan each, with basic attacks while its moves cool down
//   'only-attack', 'only-rush', 'only-quake', 'only-lob'  basic attacks alone, or one move and basic attacks
// The basic attack is the three-hit chain (five-rules.ts), so the routes' 'Strike x3' is three presses of it. With the
// `power` option the hero holds Attack as soon as a strike is charged and the boss stands in its area: no attack for the
// hold's time, then the strike, and with it the sword's own special (the one-move scripts fight without that special).
// The damage bonus is the untouched streak: hits landed since the hero was last hurt.
import * as T from 'three';
import { World, type Enemy } from '../src/world.ts';
import * as M from '../src/model.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { CombatSimulation, BASE_SKILLS, SPECIALS, type CombatTarget } from '../src/combat.ts';
import { MOVES, AIR_MOVES, MOVE_SKILLS, MOVE_SLOTS, moveAt, windowDamage, type MoveId } from '../src/moves.ts';
import { CHAIN, HOLD, STREAK, UntouchedStreak, chainGain, chainKind } from '../src/five-rules.ts';
import { skillTuning } from '../src/skill-upgrades.ts';
import * as J from '../src/jump-rules.ts';
import { POWER, PowerCharge, powerShape, powerReach, powerCap } from '../src/power-rules.ts';

type Route = 'ground' | 'launch' | 'chase';
export type Script = 'classic' | 'careless' | 'single' | 'double' | Route | `only-${MoveId}` | 'only-attack';
type Step = MoveId | 'strike' | 'jump' | 'jump2' | 'swing' | 'airdash' | 'dive' | 'skyquake' | 'rain';
/** The plan's three routes (section 5), and the all-round loop of the 'double' script. */
export const ROUTES: Record<Route | 'double', readonly Step[]> = {
  ground: ['strike', 'quake'],
  launch: ['quake', 'jump', 'swing', 'jump2', 'swing', 'dive'],
  chase: ['lob', 'rush', 'jump', 'airdash', 'jump2', 'dive'],
  double: ['jump', 'swing', 'jump2', 'swing', 'skyquake'],
};
const quiet = { text() {}, burst() {}, ring() {}, spark() {}, shake() {}, flash() {}, freeze() {}, update() {}, slash() {}, shakeOffset: () => new T.Vector3() };
function seeded(seed: number) { return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed); return ((seed ^ seed >>> 14) >>> 0) / 4294967296; }; }

export interface FightResult { won: boolean; seconds: number; taken: number; hits: number; dodged: number; perfect: number; biggest: number; bossHp: number; blocked: number; /** Times the script's route ran to its end, and the longest chain. */ routes: number; combo: number; finishers: number; /** Power strikes used (power-rules.ts), and the damage dealt in all. */ powers: number; damage: number; /** The longest untouched streak, and the average damage bonus it gave over the fight (0.12 = +12%). */ streak: number; bonus: number }
export function fight(boss: string, planet: M.PlanetId, zone: [number, number], level: number, gear: Partial<M.SaveState['gear']>, script: Script, seed = 1, blockOverride?: number, /** `power`: the hero holds Attack for the power strike whenever it is charged and the boss is in its area. */ opts: { power?: boolean } = {}): FightResult {
  const random = seeded(seed * 7919), realRandom = Math.random; Math.random = random;
  try {
    const state = M.newGame(); state.level = level; state.planet = planet; Object.assign(state.gear, gear); for (const id of Object.values(gear)) if (id) state.bag[id] = 1; state.hp = M.maxHp(state);
    const w = Object.assign(Object.create(World.prototype), {
      state, scene: new T.Scene(), camera: new T.OrthographicCamera(-3, 3, 3, -3, .1, 20), root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(),
      destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [], particles: [], keys: new Set<string>(), facing: 0, time: 0, planet, hazardTimer: 0,
      marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(), jump: new J.JumpState(), fx: quiet,
      onInteract() {}, onAttackEnemy() {}, onZone() {},
    }) as World;
    w.environment = new EnvironmentSimulation(createEnvironmentLayout(planet));
    const on = script !== 'classic', only = script.startsWith('only-') ? script.slice(5) as MoveId | 'attack' : null, route = script in ROUTES ? ROUTES[script as Route | 'double'] : null;
    const jumps = script === 'careless' ? 0 : script === 'single' || only || script === 'ground' ? 1 : 2, strikeSlot = !!only, careful = on && script !== 'careless';
    w.jumpRules = on; w.jump.max = Math.max(1, jumps);
    const weapon = () => strikeSlot ? { ...M.weaponStats(state), special: 'fist' } : M.weaponStats(state), special = () => weapon().special ?? 'fist';
    const e = w.spawnSpecies(boss, zone[0], zone[1], 0)! as Enemy; w.position.set(zone[0] + e.radius + 1.3, 0, zone[1]);
    const stats = () => M.activeStats(state), out: FightResult = { won: false, seconds: 0, taken: 0, hits: 0, dodged: 0, perfect: 0, biggest: 0, bossHp: 0, blocked: 0, routes: 0, combo: 0, finishers: 0, powers: 0, damage: 0, streak: 0, bonus: 0 };
    const charge = new PowerCharge(), streak = new UntouchedStreak(); let held = 0, bonusTime = 0;
    const combo = new J.ComboMeter(); let invulnerable = 0, attackCd = 0, sure = 0, kind: J.ComboHit | null = null, strike: { height: number; jumps: number } | null = null, skyQuake: { height: number; jumps: number } | null = null, skyFactor = 1, quakeFinisher = false;
    const cds = [0, 0, 0, 0], airCds = [0, 0, 0, 0];
    const sim = new CombatSimulation({
      position: () => w.position, facing: () => w.facing, face: a => { w.facing = a; }, targets: () => w.enemies, weapon, stats,
      move: (x, z) => { const n = Math.max(1, Math.ceil(Math.hypot(x, z) / .2)); for (let i = 0; i < n; i++) w.move(x / n, z / n); },
      skillLevel: () => 0, effect: () => {},
      hit: (target, impact) => {
        const en = target as Enemy, before = en.hp; w.damageEnemy(en, impact.amount, impact.stun); out.biggest = Math.max(out.biggest, before - en.hp); out.damage += before - en.hp; if (impact.blocked) out.blocked++; if (on) charge.hit();
        if (impact.lift && en.hp > 0) w.knockUpEnemy(en, impact.lift, .75);
        if (on && combo.hit(kind ?? (w.jump.airborne ? 'air' : impact.lift > 0 ? 'launcher' : 'ground'))) { out.combo = Math.max(out.combo, combo.count); streak.hit(); out.streak = Math.max(out.streak, streak.count); }
      },
    }, random);
    const share = blockOverride ?? J.blockShare(boss, M.PLANETS[planet].level);
    if (on) {
      sim.edge.moves = true; sim.edge.chain = true; sim.edge.launch = J.AIR.launch; sim.edge.target = () => e as CombatTarget; sim.edge.spent = () => { sure = 0; };
      sim.edge.scale = t => (t as Enemy).boss ? J.hitShare(share, (strike ?? w.jump).height, (strike ?? w.jump).jumps) : 1;
      // The same finisher rules as main.ts: a Quake on a chain of three hits ends it with the finisher bonus.
      sim.edge.begin = move => { if (move === 'skyquake') return skyFactor; if (move !== 'quake') return 1; quakeFinisher = combo.finisherReady; kind = quakeFinisher ? 'dive' : 'launcher'; return quakeFinisher ? J.COMBO.finisher : 1; };
      sim.edge.end = move => { if (move !== 'quake') return; kind = null; if (quakeFinisher && combo.finished) out.finishers++; quakeFinisher = false; };
    }
    w.onDamage = (amount, source = 'melee', _id, cls = 'body') => {
      if (on && J.dodges(cls, w.jump.height)) { out.dodged++; if (J.perfectDodge(cls, w.jump.height, w.jump.airTime)) { out.perfect++; sure = J.DODGE.sure; sim.edge.sure = true; } return; }
      if (!(amount > 0) || invulnerable > 0 || sim.invulnerable) return;
      const damage = Math.max(1, Math.round(amount * 60 / (stats().defense + sim.defenseBonus + 60))); out.taken += damage / stats().maxHp; out.hits++; invulnerable = .55; combo.break(); streak.hurt(damage); void source;
    };
    w.onLanded = landing => {
      const finisher = combo.finisherReady, dive = () => sim.dive(J.diveMultiplier(landing.from) * (finisher ? J.COMBO.finisher : 1), J.DIVE.radius, J.DIVE.stun, J.DIVE.knock, t => J.diveCritical(landing.jumps, landing.from, t), J.diveCap).length;
      if (sim.plunging) {
        // The heavy dive: the Quake's ring, then the dive strike (main.ts onLanded).
        skyFactor = finisher ? J.COMBO.finisher : 1; strike = skyQuake ?? { height: landing.from, jumps: landing.jumps }; let hits = 0;
        try { kind = 'launcher'; sim.land(); kind = 'dive'; if (landing.from >= J.DIVE.minHeight) hits = dive(); } finally { kind = null; strike = null; skyQuake = null; skyFactor = 1; }
        if (hits && finisher) out.finishers++; attackCd = Math.max(attackCd, .25); return;
      }
      if (!landing.dive) return; kind = 'dive'; strike = { height: landing.from, jumps: landing.jumps };
      try { if (dive() && finisher) out.finishers++; } finally { kind = null; strike = null; }
      attackCd = Math.max(attackCd, .25);
    };
    const dt = .025, old = [...BASE_SKILLS, SPECIALS[special()] ?? SPECIALS.fist], cooldown = (i: number) => M.skillCooldown(state, i, on && moveAt(i) ? MOVE_SKILLS[i].cd : old[i].cd, false);
    /** Casts skill slot `i` (its air form when `air`) if its cooldown and the rules allow. */
    const cast = (i: number, air = false) => {
      const j = w.jump, form = air ? airCds : cds; if (form[i] > 0 || sim.locksMovement) return false;
      if (!sim.skill(i, special(), air ? { ...J.AIR, height: j.height } : undefined)) return false;
      form[i] = cooldown(i);
      if (air && i === 1) j.hold(AIR_MOVES.dash.hover); if (air && i === 0) j.stall(AIR_MOVES.rain.gap * AIR_MOVES.rain.shots);
      if (air && i === 2) { skyQuake = { height: j.height, jumps: j.jumps }; if (!j.dive()) { j.diving = true; j.diveFrom = j.height; j.velocity = -34; } }
      return true;
    };
    let swings = 0, at = 0, stuck = 0, fled = 0;
    // The boss sees the hero before the first blow (it sizes itself to the hero's level then, as in the game).
    w.update(dt, true, false);
    /** Leaving the place a hit will land (plan section 6): the direction to walk now, or null. Ground attacks are jumped instead when the hero can jump. */
    const danger = (): { x: number; z: number } | null => {
      const px = w.position.x, pz = w.position.z, ax = px - e.x, az = pz - e.z, d = Math.hypot(ax, az) || 1, speed = stats().speed, away = { x: ax / d, z: az / d };
      if (e.phase === 'bspin') return d < 3.4 + .8 ? away : null;
      if (e.phase !== 'windup') return null; const left = e.phaseTime ?? 0;
      if (!e.skill) { if (e.mesh.userData.slam) return null; const r = (e.definition?.reach ?? 2.6) + .6; return d < r + .3 && left <= (r + .3 - d) / speed + .12 ? away : null; }
      if (J.attackClass(e.skill) === 'ground' && jumps > 0 || e.skill === 'barrage') return null;
      for (const m of e.telegraphs ?? []) {
        const mx = px - m.x, mz = pz - m.z, md = Math.hypot(mx, mz); if (md > m.r + .4) continue;
        if (left > (m.r + .4 - md) / speed + .15) return null;
        return e.skill === 'charge' || md < .05 ? { x: -away.z, z: away.x } : { x: mx / md, z: mz / md };
      }
      return null;
    };
    for (let t = 0; t < 600; t += dt) {
      invulnerable = Math.max(0, invulnerable - dt); attackCd = Math.max(0, attackCd - dt); for (let i = 0; i < 4; i++) { cds[i] = Math.max(0, cds[i] - dt); airCds[i] = Math.max(0, airCds[i] - dt); }
      if (on) { combo.step(dt); streak.step(dt); sim.edge.bonus = streak.bonus; bonusTime += (streak.bonus - 1) * dt; if (sure > 0 && (sure -= dt) <= 0) sim.edge.sure = false; }
      // The hero keeps beside the boss, at walking speed.
      { const dx = e.x - w.position.x, dz = e.z - w.position.z, d = Math.hypot(dx, dz), want = e.radius + 1.2, flee = careful && !sim.locksMovement ? danger() : null;
        if (flee) { w.move(flee.x * stats().speed * dt, flee.z * stats().speed * dt); fled += dt; }
        else if (d > want + .1 && !sim.locksMovement) { const go = Math.min(d - want, stats().speed * dt); w.move(dx / d * go, dz / d * go); }
        if (!sim.locksMovement) w.facing = Math.atan2(dx, dz); }
      const j = w.jump, gap = Math.hypot(e.x - w.position.x, e.z - w.position.z) - e.radius, reach = gap < 2.2, grounded = !j.airborne, free = !sim.locksMovement && !sim.busy;
      // Dodging: jump just before a ground attack lands.
      const ground = e.phase === 'windup' && J.attackClass(e.skill ?? (e.mesh.userData.slam ? 'slam' : 'melee')) === 'ground';
      if (jumps > 0 && ground && (e.phaseTime ?? 9) <= .2 && j.ready && grounded && !sim.locksMovement) j.jump();
      if (jumps > 0 && (e.skillEffects?.length ?? 0) > 0 && j.ready && grounded && !sim.locksMovement && e.skillEffects!.some(p => p.remaining <= .16)) j.jump();
      // The power strike (main.ts stepHold, powerStrike): Attack is held as soon as a strike is charged and the boss stands in its area. Nothing is
      // swung for the hold's time; then the strike goes off, and the weapon's own special with it. The wind-up and the recovery cost attack time too.
      const aiming = on && !!opts.power && charge.level > 0 && grounded && !sim.locksMovement && !sim.busy && powerReach(powerShape(weapon().kind), charge.level, w.position, w.facing, e) >= 0;
      held = aiming ? held + dt : 0;
      if (aiming && held >= HOLD.time) {
        const level = charge.use(); sim.powerStrike(powerShape(weapon().kind), level, powerCap); sim.weaponSpecial(special()); out.powers++; held = 0; attackCd = Math.max(attackCd, POWER.windup + POWER.recovery);
      }
      charge.step(dt);
      const basic = () => { if (held > dt + 1e-9) return; /* the press that begins the hold still attacks; nothing more until the strike */ if (attackCd <= 0 && grounded && reach && free && sim.basic(e)) { void fled; attackCd = (weapon().cd ?? .4) / Math.max(.2, 1 + stats().haste); swings++; } };
      const swing = () => { if (attackCd > 0 || !J.airWindow(j) || !free) return false; const sword = weapon().kind !== 'gun'; if (!(sword ? sim.airSwing(skillTuning(3, 0).damage) : sim.basic(e, J.AIR.swing))) return false; attackCd = AIR_MOVES.swing.cooldown / Math.max(.2, 1 + stats().haste); j.stall(AIR_MOVES.swing.hover); return true; };
      if (!on) {
        // The switch off: the four old skills on cooldown, basic attacks between them.
        if (reach && !sim.locksMovement) { basic(); for (const i of [2, 0, 3, 1]) if (cast(i)) break; }
      } else if (route) {
        // A route: its steps in order; basic attacks while its opener cools down. A step that cannot happen any more starts the route again.
        const step = route[at], opener = at === 0, done = () => { at++; stuck = 0; swings = 0; if (at >= route.length) { at = 0; out.routes++; } };
        stuck += dt; if (stuck > 2.5 && !opener) { at = 0; stuck = 0; }
        if (step === 'jump') { if (!grounded) done(); else if (free && j.ready && (script !== 'double' || (swings >= 3 && reach && !ground)) && j.jump()) done(); else if (script === 'double') { basic(); if (reach && grounded && free) for (const i of [0, 2, 1]) if (cast(i)) break; } }
        else if (step === 'jump2') { if (grounded) { at = 0; stuck = 0; } else if (j.max < 2 || j.jumps >= 2) done(); else if (j.velocity <= 0 && j.ready && j.jump()) done(); }
        else if (step === 'swing') { if (grounded) { at = 0; stuck = 0; } else if (swing()) done(); }
        else if (step === 'airdash') { if (grounded) { at = 0; stuck = 0; } else if (J.airWindow(j) && cast(1, true)) done(); else if (airCds[1] > 0) done(); }
        else if (step === 'dive' || step === 'skyquake') {
          if (grounded) done();
          else if (!j.diving && j.falling && j.height >= J.DIVE.minHeight && free) { if (!(step === 'skyquake' && cast(2, true))) j.dive(); }
        }
        else if (step === 'rain') { if (grounded) { at = 0; stuck = 0; } else if (J.airWindow(j) && cast(0, true)) done(); }
        else {
          const i = MOVE_SLOTS.indexOf(step as MoveId), near = step === 'lob' ? gap < MOVES.lob.max : step === 'quake' ? gap < MOVES.quake.radius - .3 : reach;
          // The opener waits until every move of the route is ready, so the route always runs whole.
          const ready = !opener || route.every(s => s === 'airdash' ? airCds[1] <= 0 : s === 'skyquake' || s === 'rain' || !MOVE_SLOTS.includes(s as MoveId) ? true : cds[MOVE_SLOTS.indexOf(s as MoveId)] <= 0);
          if (step === 'strike') { if (swings >= 3) done(); else basic(); } // the attack chain: three presses, the third launches
          else if (ready && grounded && free && near && cast(i)) done(); else basic();
        }
      } else if (only) {
        const i = only === 'attack' ? -1 : MOVE_SLOTS.indexOf(only); if (i >= 0 && grounded && free && (only === 'lob' ? gap < MOVES.lob.max : reach)) cast(i); basic();
      } else {
        // 'careless' and 'single': the three moves on cooldown and the attack chain, all on the ground.
        if (reach && grounded && free) for (const i of [2, 0, 1]) if (cast(i)) break;
        basic();
      }
      sim.update(dt, true); w.movementLocked = sim.locksMovement; w.update(dt, true, false);
      out.bossHp = e.maxHp;
      if (e.hp <= 0) { out.won = true; out.seconds = t; break; }
      out.seconds = t;
    }
    out.bonus = out.seconds > 0 ? bonusTime / out.seconds : 0;
    return out;
  } finally { Math.random = realRandom; }
}

export const FIGHTS: Array<{ boss: string; planet: M.PlanetId; at: [number, number]; level: number; gear: Partial<M.SaveState['gear']>; note: string }> = [
  { boss: 'bear', planet: 'home', at: [107, -46], level: 13, gear: { weapon: 'sword_tusk', outfit: 'armor_wolf', hat: 'hat_leather' }, note: 'King Bear, Redrock Canyon (boss level 13)' },
  { boss: 'yeti', planet: 'ice', at: [60, 0], level: 16, gear: { weapon: 'sword_candy', outfit: 'armor_bone', hat: 'hat_viking' }, note: 'Yeti, the ice world (boss level 16)' },
  { boss: 'shadowlord', planet: 'shadow', at: [60, 0], level: 24, gear: { weapon: 'sword_lava', outfit: 'armor_knight', hat: 'hat_samurai' }, note: 'Shadow Lord, the dark world (boss level 22)' },
];

// ---------------------------------------------------------------- The moves on their own (no creature AI)

interface Dummy extends CombatTarget { taken: number }
/** A bare arena: the explorer at the origin facing +z with attack 100, never a critical, and creatures that only stand and count what they take. */
export function arena(spots: ReadonlyArray<{ x: number; z: number; radius?: number; boss?: boolean }>) {
  const p = { x: 0, z: 0 }; let facing = 0;
  const targets: Dummy[] = spots.map((s, i) => ({ id: 'd' + i, x: s.x, z: s.z, radius: s.radius ?? .5, boss: s.boss, hp: 1e9, maxHp: 1e9, taken: 0 }));
  const sim = new CombatSimulation({ position: () => p, facing: () => facing, face: a => { facing = a; }, targets: () => targets, weapon: () => ({ kind: 'fist' }), stats: () => ({ attack: 100, critChance: 0 }),
    move: (x, z) => { p.x += x; p.z += z; }, effect: () => {}, hit: (t, h) => { (t as Dummy).taken += h.amount; } }, () => .5);
  sim.edge.moves = true;
  return { sim, targets, p, total: () => targets.reduce((a, t) => a + t.taken, 0) / 100 };
}
/** Damage (in basic hits) that `move` alone deals in `seconds`, cast whenever its cooldown allows, on the creatures at `spots`. */
export function moveDamage(move: MoveId, spots: Parameters<typeof arena>[0], seconds = 10, air?: { height: number }) {
  const a = arena(spots), slot = MOVE_SLOTS.indexOf(move), dt = .025; let cd = 0;
  for (let t = 0; t < seconds - 1e-9; t += dt) { cd = Math.max(0, cd - dt); if (cd <= 0 && a.sim.skill(slot, 'fist', air ? { ...J.AIR, height: air.height } : undefined)) { cd = MOVES[move].cooldown; if (air && move === 'quake') a.sim.land(); } a.sim.update(dt, true); }
  return a.total();
}
/** Where one creature stands for each move to be 'used perfectly': in the arc, on the line, in the ring, on the marked spot. */
export const PERFECT: Record<MoveId, { x: number; z: number }> = { rush: { x: 0, z: 2.5 }, quake: { x: 0, z: 2 }, lob: { x: 0, z: 6 } };
/** The test fights of section 7: each shape of fight has the move that answers it. Creatures are 1 m wide unless a radius is given. */
export const TEST_FIGHTS: Record<string, { note: string; spots: Parameters<typeof arena>[0] }> = {
  duel: { note: 'one large creature in reach', spots: [{ x: 0, z: 2.6, radius: 1.2, boss: true }] },
  line: { note: 'five creatures in a row ahead', spots: [1.5, 2.6, 3.7, 4.8, 5.9].map(z => ({ x: 0, z })) },
  crowd: { note: 'six creatures all round, 2.5 m away', spots: Array.from({ length: 6 }, (_, i) => ({ x: Math.sin(i * Math.PI / 3) * 2.5, z: Math.cos(i * Math.PI / 3) * 2.5 })) },
  far: { note: 'three creatures 8 m away, out of reach', spots: [{ x: 0, z: 8 }, { x: .7, z: 8.4 }, { x: -.7, z: 8.4 }] },
};
/** Every move's ten-second damage in every test fight, and the best move of each. */
export function testFights() {
  return Object.entries(TEST_FIGHTS).map(([name, f]) => { const damage = Object.fromEntries(MOVE_SLOTS.map(m => [m, moveDamage(m, f.spots)])) as Record<MoveId, number>; return { name, note: f.note, damage, best: MOVE_SLOTS.reduce((a, b) => damage[b] > damage[a] ? b : a) }; });
}

/** Damage per second of each careful and careless script on the three bosses, without and with the power strike. */
export function powerReport(scripts: readonly Script[] = ['careless', 'single', 'double', 'ground', 'launch', 'chase'], seeds: readonly number[] = [1, 2, 3, 4, 5, 6]) {
  const rows: { boss: string; script: Script; before: number; after: number; gain: number; powers: number; biggest: number }[] = [];
  for (const f of FIGHTS) for (const script of scripts) {
    const dps = (power: boolean) => { const runs = seeds.map(seed => fight(f.boss, f.planet, f.at, f.level, f.gear, script, seed, undefined, { power })); return { dps: runs.reduce((a, r) => a + r.damage, 0) / runs.reduce((a, r) => a + r.seconds, 0), powers: runs.reduce((a, r) => a + r.powers, 0) / runs.length, biggest: Math.max(...runs.map(r => r.biggest / r.bossHp)) }; };
    const before = dps(false), after = dps(true);
    rows.push({ boss: f.boss, script, before: before.dps, after: after.dps, gain: after.dps / before.dps - 1, powers: after.powers, biggest: after.biggest });
  }
  return rows;
}

/**
 * The fight before the five buttons (four skills with the Strike or the weapon's special in the fourth slot, the timed +4%
 * ramp, the power strike on its own button), measured with this file on 2026-10-14 just before the change: damage per
 * second and damage taken (in full healths) with the power strike in use, 6 seeds. fiveReport compares the fight of today with it.
 */
export const BEFORE_FIVE: Record<string, readonly [dps: number, taken: number]> = {
  'bear:careless': [173.3, 6.32],
  'bear:single': [210.9, 1.38],
  'bear:double': [236.9, 1.15],
  'bear:ground': [179.7, 1.61],
  'bear:launch': [205.9, 1.87],
  'bear:chase': [188.3, 1.73],
  'yeti:careless': [199.3, 10.33],
  'yeti:single': [235.4, 0.89],
  'yeti:double': [309, 0.61],
  'yeti:ground': [217.5, 0.28],
  'yeti:launch': [243.2, 0.43],
  'yeti:chase': [226.8, 1.43],
  'shadowlord:careless': [390.1, 16.1],
  'shadowlord:single': [349.9, 6.36],
  'shadowlord:double': [433.2, 3.97],
  'shadowlord:ground': [300.2, 4.6],
  'shadowlord:launch': [329.4, 4.71],
  'shadowlord:chase': [324.2, 4.76],
};
/** Each script on each boss, with the power strike held as soon as it is charged: damage per second and damage taken now, against BEFORE_FIVE. */
export function fiveReport(scripts: readonly Script[] = ['careless', 'single', 'double', 'ground', 'launch', 'chase'], seeds: readonly number[] = [1, 2, 3, 4, 5, 6]) {
  const rows: { boss: string; script: Script; before: number; after: number; change: number; takenBefore: number; taken: number; powers: number; biggest: number; streak: number; bonus: number }[] = [];
  for (const f of FIGHTS) for (const script of scripts) {
    const runs = seeds.map(seed => fight(f.boss, f.planet, f.at, f.level, f.gear, script, seed, undefined, { power: true })), time = runs.reduce((a, r) => a + r.seconds, 0), was = BEFORE_FIVE[f.boss + ':' + script];
    const after = runs.reduce((a, r) => a + r.damage, 0) / time;
    rows.push({ boss: f.boss, script, before: was[0], after, change: after / was[0] - 1, takenBefore: was[1], taken: runs.reduce((a, r) => a + r.taken, 0) / runs.length, powers: runs.reduce((a, r) => a + r.powers, 0) / runs.length, biggest: Math.max(...runs.map(r => r.biggest / r.bossHp)), streak: Math.max(...runs.map(r => r.streak)), bonus: runs.reduce((a, r) => a + r.bonus * r.seconds, 0) / time });
  }
  return rows;
}
/** Damage (in basic hits) of the attack chain alone in `seconds`, pressed at the weapon's pace (`cd` seconds a press), on the creatures at `spots`. */
export function chainDamage(spots: Parameters<typeof arena>[0], seconds = 10, cd = .4) {
  const a = arena(spots); a.sim.edge.chain = true; let wait = 0;
  for (let t = 0; t < seconds - 1e-9; t += .025) { wait = Math.max(0, wait - .025); if (wait <= 0 && a.sim.basic()) wait = cd; a.sim.update(.025, true); }
  return a.total();
}

if (process.argv[1]?.endsWith('fight-sim.mts')) {
  const override = process.env.BLOCK ? Number(process.env.BLOCK) : undefined, seeds = [1, 2, 3, 4, 5, 6], pct = (n: number) => (n * 100).toFixed(0) + '%';
  console.log('Ten seconds of one move used perfectly on one creature (damage in basic hits; the table of moves.ts)');
  for (const m of MOVE_SLOTS) console.log(`  ${m.padEnd(7)} ${pct(moveDamage(m, [PERFECT[m]]))}  (${pct(windowDamage(m))} by the table, cooldown ${MOVES[m].cooldown} s)`);
  console.log('  air: ' + [`Sky Spin ${pct(AIR_MOVES.swing.power)} a spin`, `Sky Step ${pct(moveDamage('rush', [PERFECT.rush], 10, { height: 2 }))}`, `Sky Quake ${pct(moveDamage('quake', [PERFECT.quake], 10, { height: 2 }))} from a single jump (ring only)`, `Petal Rain ${pct(moveDamage('lob', [{ x: 0, z: 1.2, radius: 1.2 }], 10, { height: 2 }))} on a large creature below`].join(' · '));
  console.log('\nTest fights: ten seconds of each move alone (damage in basic hits, all creatures together)');
  for (const f of testFights()) console.log(`  ${f.name.padEnd(6)} ${f.note.padEnd(40)} ${MOVE_SLOTS.map(m => `${m} ${pct(f.damage[m])}`).join('  ')}  -> best: ${f.best}`);
  if (process.env.POWER !== '0') {
    // Sustained damage per second with and without the power strike (the bound of docs/FIGHT-PLAN.md section 10: no more than about +15%).
    console.log(`
Power strike: ${POWER.need} hits a level, ${POWER.power.join(' / ')} basic hits, boss cap ${POWER.bossCap * 100}% (damage per second, 6 seeds; before -> after)`);
    for (const row of powerReport()) console.log(`  ${row.boss.padEnd(11)} ${row.script.padEnd(9)} ${row.before.toFixed(0).padStart(5)} -> ${row.after.toFixed(0).padStart(5)}  ${(row.gain * 100 >= 0 ? '+' : '') + (row.gain * 100).toFixed(1)}%  (${row.powers.toFixed(1)} strikes a fight, biggest hit ${(row.biggest * 100).toFixed(1)}% of the boss)`);
  }
  const scripts: Script[] = ['classic', 'careless', 'single', 'double', 'ground', 'launch', 'chase', 'only-strike', 'only-rush', 'only-quake', 'only-lob'];
  for (const f of FIGHTS) {
    console.log(`\n${f.note} — hero level ${f.level}, block ${J.BOSS_BLOCK_ON ? override ?? J.blockShare(f.boss, M.PLANETS[f.planet].level) : 'off'}`);
    for (const script of scripts) {
      const runs = seeds.map(seed => fight(f.boss, f.planet, f.at, f.level, f.gear, script, seed, script === 'classic' || !J.BOSS_BLOCK_ON ? 1 : override)), avg = (k: keyof FightResult) => runs.reduce((a, r) => a + Number(r[k]), 0) / runs.length;
      console.log(`  ${script.padEnd(11)} wins ${runs.filter(r => r.won).length}/${runs.length}  time ${avg('seconds').toFixed(0).padStart(3)} s  taken ${avg('taken').toFixed(2)} x health in ${avg('hits').toFixed(0).padStart(2)} hits  dodged ${avg('dodged').toFixed(1)} (perfect ${avg('perfect').toFixed(1)})  routes ${avg('routes').toFixed(1)}  finishers ${avg('finishers').toFixed(1)}  longest chain ${Math.max(...runs.map(r => r.combo))}  biggest hit ${(Math.max(...runs.map(r => r.biggest / r.bossHp)) * 100).toFixed(1)}% of ${Math.round(avg('bossHp'))} HP`);
    }
  }
}
