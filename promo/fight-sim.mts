// Scripted boss fights for balance (docs/FIGHT-PLAN.md section 7): a hero at the level a boss is met, played by a simple
// script, against the real creature AI (world.ts) and the real combat rules (combat.ts, jump-rules.ts).
//   node --experimental-strip-types promo/fight-sim.mts            the table
//   BLOCK=0.6 node --experimental-strip-types promo/fight-sim.mts  try another block share for the blocking bosses
// Scripts: 'classic' = the switch off (the game before jumping); 'single' = jumping on with one jump (dodges ground attacks,
// fights on the ground); 'double' = the double jump (ground chain, launcher, air swings, dive). No food is eaten: "taken" is
// the damage taken in units of the hero's full health, so above 1.0 the hero needs to eat or dodge better.
import * as T from 'three';
import { World, type Enemy } from '../src/world.ts';
import * as M from '../src/model.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { CombatSimulation, BASE_SKILLS, SPECIALS } from '../src/combat.ts';
import * as J from '../src/jump-rules.ts';

type Script = 'classic' | 'single' | 'double';
const quiet = { text() {}, burst() {}, ring() {}, spark() {}, shake() {}, flash() {}, freeze() {}, update() {}, slash() {}, shakeOffset: () => new T.Vector3() };
function seeded(seed: number) { return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed); return ((seed ^ seed >>> 14) >>> 0) / 4294967296; }; }

export interface FightResult { won: boolean; seconds: number; taken: number; hits: number; dodged: number; perfect: number; biggest: number; bossHp: number; blocked: number }
export function fight(boss: string, planet: M.PlanetId, zone: [number, number], level: number, gear: Partial<M.SaveState['gear']>, script: Script, seed = 1, blockOverride?: number): FightResult {
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
    const on = script !== 'classic'; w.jumpRules = on; w.jump.max = script === 'double' ? 2 : 1;
    const e = w.spawnSpecies(boss, zone[0], zone[1], 0)! as Enemy; w.position.set(zone[0] + e.radius + 1.3, 0, zone[1]);
    const stats = () => M.activeStats(state), out: FightResult = { won: false, seconds: 0, taken: 0, hits: 0, dodged: 0, perfect: 0, biggest: 0, bossHp: 0, blocked: 0 };
    const combo = new J.ComboMeter(); let invulnerable = 0, attackCd = 0, sure = 0, kind: J.ComboHit | null = null, strike: { height: number; jumps: number } | null = null; const cds = [0, 0, 0, 0];
    const sim = new CombatSimulation({
      position: () => w.position, facing: () => w.facing, face: a => { w.facing = a; }, targets: () => w.enemies, weapon: () => M.weaponStats(state), stats,
      move: (x, z) => { const n = Math.max(1, Math.ceil(Math.hypot(x, z) / .2)); for (let i = 0; i < n; i++) w.move(x / n, z / n); },
      skillLevel: () => 0, effect: () => {},
      hit: (target, impact) => {
        const en = target as Enemy, before = en.hp; w.damageEnemy(en, impact.amount, impact.stun); out.biggest = Math.max(out.biggest, before - en.hp); if (impact.blocked) out.blocked++;
        if (impact.lift && en.hp > 0) w.knockUpEnemy(en, impact.lift, .75);
        if (on) combo.hit(kind ?? (w.jump.airborne ? 'air' : impact.lift > 0 ? 'launcher' : 'ground'));
      },
    }, random);
    const share = blockOverride ?? J.blockShare(boss, M.PLANETS[planet].level);
    if (on) { sim.edge.launch = J.AIR.launch; sim.edge.scale = t => (t as Enemy).boss ? J.hitShare(share, (strike ?? w.jump).height, (strike ?? w.jump).jumps) : 1; sim.edge.spent = () => { sure = 0; }; }
    w.onDamage = (amount, source = 'melee', _id, cls = 'body') => {
      if (on && J.dodges(cls, w.jump.height)) { out.dodged++; if (J.perfectDodge(cls, w.jump.height, w.jump.airTime)) { out.perfect++; sure = J.DODGE.sure; sim.edge.sure = true; } return; }
      if (!(amount > 0) || invulnerable > 0 || sim.invulnerable) return;
      const damage = Math.max(1, Math.round(amount * 60 / (stats().defense + sim.defenseBonus + 60))); out.taken += damage / stats().maxHp; out.hits++; invulnerable = .55; combo.break(); void source;
    };
    w.onLanded = landing => {
      if (!landing.dive) return; kind = 'dive'; strike = { height: landing.from, jumps: landing.jumps };
      try { sim.dive(J.diveMultiplier(landing.from) * (combo.finisherReady ? J.COMBO.finisher : 1), J.DIVE.radius, J.DIVE.stun, J.DIVE.knock, t => J.diveCritical(landing.jumps, landing.from, t), J.diveCap); } finally { kind = null; strike = null; }
      attackCd = Math.max(attackCd, .25);
    };
    const dt = .025, skills = [...BASE_SKILLS, SPECIALS[M.weaponStats(state).special ?? 'fist'] ?? SPECIALS.fist]; let swings = 0, airRoute = 0;
    for (let t = 0; t < 600; t += dt) {
      invulnerable = Math.max(0, invulnerable - dt); attackCd = Math.max(0, attackCd - dt); for (let i = 0; i < 4; i++) cds[i] = Math.max(0, cds[i] - dt);
      if (on) { combo.step(dt); sim.edge.bonus = combo.bonus; if (sure > 0 && (sure -= dt) <= 0) sim.edge.sure = false; }
      // The hero keeps beside the boss, at walking speed.
      { const dx = e.x - w.position.x, dz = e.z - w.position.z, d = Math.hypot(dx, dz), want = e.radius + 1.2; if (d > want + .1 && !sim.locksMovement) { const go = Math.min(d - want, stats().speed * dt); w.move(dx / d * go, dz / d * go); } w.facing = Math.atan2(dx, dz); }
      const j = w.jump, reach = Math.hypot(e.x - w.position.x, e.z - w.position.z) < e.radius + 2.2;
      // Dodging: jump just before a ground attack lands.
      const ground = e.phase === 'windup' && J.attackClass(e.skill ?? (e.mesh.userData.slam ? 'slam' : 'melee')) === 'ground';
      if (on && ground && (e.phaseTime ?? 9) <= .2 && j.ready && !j.airborne) j.jump();
      if (on && (e.skillEffects?.length ?? 0) > 0 && j.ready && !j.airborne && e.skillEffects!.some(p => p.remaining <= .16)) j.jump();
      // Attacking.
      if (reach && !sim.locksMovement) {
        if (script === 'double' && !ground) {
          // The route: three ground hits, jump, a swing going up, the second jump at the top, a swing, the dive.
          if (!j.airborne && swings >= 3 && j.ready && attackCd <= .1) { j.jump(); airRoute = 1; swings = 0; }
          if (j.airborne && airRoute) { if (j.velocity <= 0 && j.jumps < 2) j.jump(); if (j.falling && j.jumps >= 2 && j.height >= J.DIVE.minHeight && !j.diving) { j.dive(); airRoute = 0; } }
        }
        if (attackCd <= 0 && !j.diving && J.pressKind(j) !== 'buffer') {
          const air = j.airborne && on; if (sim.basic(e, air ? J.AIR.swing : 1)) { attackCd = (M.weaponStats(state).cd ?? .4) / Math.max(.2, 1 + stats().haste) * (air ? J.AIR.swing : 1); if (!air) swings++; }
        }
        if (!j.airborne) for (const i of [2, 0, 3, 1]) if (cds[i] <= 0 && !sim.locksMovement) { if (sim.skill(i, M.weaponStats(state).special ?? 'fist')) { cds[i] = M.skillCooldown(state, i, skills[i].cd, false); break; } }
      }
      sim.update(dt, true); w.movementLocked = sim.locksMovement; w.update(dt, true, false);
      out.bossHp = e.maxHp;
      if (e.hp <= 0) { out.won = true; out.seconds = t; break; }
      out.seconds = t;
    }
    return out;
  } finally { Math.random = realRandom; }
}

export const FIGHTS: Array<{ boss: string; planet: M.PlanetId; at: [number, number]; level: number; gear: Partial<M.SaveState['gear']>; note: string }> = [
  { boss: 'bear', planet: 'home', at: [107, -46], level: 13, gear: { weapon: 'sword_tusk', outfit: 'armor_wolf', hat: 'hat_leather' }, note: 'King Bear, Redrock Canyon (boss level 13)' },
  { boss: 'yeti', planet: 'ice', at: [60, 0], level: 16, gear: { weapon: 'sword_candy', outfit: 'armor_bone', hat: 'hat_viking' }, note: 'Yeti, the ice world (boss level 16)' },
  { boss: 'shadowlord', planet: 'shadow', at: [60, 0], level: 24, gear: { weapon: 'sword_lava', outfit: 'armor_knight', hat: 'hat_samurai' }, note: 'Shadow Lord, the dark world (boss level 22)' },
];
if (process.argv[1]?.endsWith('fight-sim.mts')) {
  const override = process.env.BLOCK ? Number(process.env.BLOCK) : undefined, seeds = [1, 2, 3, 4, 5, 6];
  for (const f of FIGHTS) {
    console.log(`\n${f.note} — hero level ${f.level}, block ${override ?? J.blockShare(f.boss, M.PLANETS[f.planet].level)}`);
    for (const script of ['classic', 'single', 'double'] as const) {
      const runs = seeds.map(seed => fight(f.boss, f.planet, f.at, f.level, f.gear, script, seed, script === 'classic' ? 1 : override)), avg = (k: keyof FightResult) => runs.reduce((a, r) => a + Number(r[k]), 0) / runs.length;
      console.log(`  ${script.padEnd(8)} wins ${runs.filter(r => r.won).length}/${runs.length}  time ${avg('seconds').toFixed(0)} s  taken ${avg('taken').toFixed(2)} x health in ${avg('hits').toFixed(0)} hits  dodged ${avg('dodged').toFixed(1)} (perfect ${avg('perfect').toFixed(1)})  blocked hits ${avg('blocked').toFixed(0)}  biggest hit ${(Math.max(...runs.map(r => r.biggest / r.bossHp)) * 100).toFixed(1)}% of ${Math.round(avg('bossHp'))} HP`);
    }
  }
}
