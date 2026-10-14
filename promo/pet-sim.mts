// Pets in scripted fights: what they add to the hero's damage and what their guards take off the damage taken.
//   node --experimental-strip-types promo/pet-sim.mts            the pet table, then the fights, before and after
//   SEEDS=3 node --experimental-strip-types promo/pet-sim.mts    fewer runs of each fight (faster)
//   TABLE=1 ...                                                   the pet table only
// The fights are those of promo/fight-sim.mts (the real creature AI and combat rules) with the 'single' script: the
// four moves, careful, one jump to dodge. Each of the three test bosses, and a pack of five ordinary creatures with
// ranged attackers for each of the three heroes. "before" plays the numbers and the target choice from before the
// 2026-10-14 rebalance (pet-guard.ts PET_BEFORE; the nearest creature within 7 m; no guard). Each pet set-up is compared
// with the same pets worn for their stats only ('stats': no shot, no guard), so the change shown is what the pets do.
import * as M from '../src/model.ts';
import { ENEMY_TYPES } from '../src/enemy-types.ts';
import { DUNGEON_PETS, PET_SKILLS, petSkillDps } from '../src/dungeon-content.ts';
import { DOG_GUARD, PET_BEFORE, PET_ROLES, PET_RULES, petShare, type GuardKind } from '../src/pet-guard.ts';
import { dogTossFactor, DOG_TOSS_CD } from '../src/guard-dog.ts';
import { FIGHTS, fight, type FightResult, type PetOptions, type Script } from './fight-sim.mts';
import { CombatSimulation, attackRange, type CombatTarget } from '../src/combat.ts';
import { petFighter, petRoleId, type PetFighter } from '../src/pet-guard.ts';
import { petTrail, PET_SIDE, PET2_SIDE } from '../src/pet-pen.ts';

export const GUARD_WORDS: Record<GuardKind, string> = { counter: 'counter (shots)', block: 'block (blows)', mend: 'mend (heal)', distract: 'distract', bark: 'bark (slow)' };
/** The pets a hero of each test fight would typically wear, and the best pair there is (at +10). */
export const PET_SETS: Record<string, { one: string[]; two: string[] }> = {
  bear: { one: ['pet_parrot'], two: ['pet_robot', 'pet_turtle'] },
  yeti: { one: ['pet_sheep'], two: ['pet_b_bear', 'pet_b_jellyqueen'] },
  shadowlord: { one: ['pet_firefly'], two: ['pet_b_yeti', 'pet_b_leviathan'] },
};
export const BEST_PAIR = ['pet_colossus', 'pet_dg_empress'];
/** A pack of ordinary creatures of the hero's worlds, two of them ranged: the first is the one the hero starts on. */
export const PACKS: Record<string, string[]> = {
  bear: ['wolf', 'cactus', 'crab', 'cactus', 'boar'],
  yeti: ['penguin', 'lollipop', 'seal', 'lollipop', 'owl'],
  shadowlord: ['spider', 'demoneye', 'wisp', 'demoneye', 'spider'],
};
const pct = (n: number, digits = 0) => (n * 100).toFixed(digits) + '%';

/** Every pet: its shot before and after, its share of the hero's damage at +0 and +10, and its guard. */
export function petTable() {
  return Object.entries(PET_ROLES).map(([id, role]) => {
    const old = PET_BEFORE[id], item = M.ITEMS[id];
    return { id, name: item?.name ?? id, level: M.gearLevel(id), shot: item?.pet?.shot ?? 'fire', before: { dmg: old[0], cd: old[1], dps: old[0] / old[1], share: petShare({ dmg: old[0], cd: old[1] }) },
      after: { dmg: role.dmg, cd: role.cd, dps: role.dmg / role.cd, share: petShare(role), shareMax: petShare(role, 1.4) }, guard: role.guard, power: role.power, every: role.every };
  });
}

/**
 * 'It kills enemies even when they are very far': the hero of the first test fight stands still and never attacks.
 * `peaceful`: a canyon wolf that has not noticed anybody stands `at` metres away for 20 s. `comes`: an angry wolf walks
 * in from 12 m at its own speed. Reported: where it was first hit (m from the hero), the health it has left at the end
 * (peaceful) or when it reaches the hero's reach (comes), and where it died if it did.
 */
export function farReport(ids: readonly string[], level: number, before: boolean, at = 6.5) {
  const f = FIGHTS[0], state = M.newGame(); state.level = f.level; Object.assign(state.gear, f.gear, { pet: ids[0], pet2: ids[1] }); for (const id of [...Object.values(f.gear), ...ids]) if (id) state.bag[id] = 1;
  (state as M.SaveState & { gearLevels?: Record<string, number> }).gearLevels = Object.fromEntries(ids.map(id => [id, level]));
  const def = ENEMY_TYPES.wolf, hp = Math.round(def.hp * 2.6), reach = attackRange(M.weaponStats(state), def.radius);
  const scene = (comes: boolean) => {
    const hero = { x: 0, z: 0 }, wolf: CombatTarget & { taken: number } = { id: 'wolf', x: 0, z: comes ? 12 : at, hp, maxHp: hp, radius: def.radius, phase: comes ? 'chase' : 'idle', taken: 0 }; let first = -1, died = -1, t = 0;
    const pet = (i: number): PetFighter | null => { const id = ids[i]; if (!id) return null; const spot = petTrail(hero, 0, i ? PET2_SIDE : PET_SIDE), factor = M.gearFactor(state, id), shot = M.ITEMS[id]?.pet?.shot, old = PET_BEFORE[petRoleId(id) ?? ''];
      return before ? { x: spot.x, z: spot.z, dmg: old[0] * factor, cd: old[1], ...(shot ? { shot } : {}) } : { ...petFighter(id, factor, shot)!, x: spot.x, z: spot.z }; };
    const sim = new CombatSimulation({ position: () => hero, facing: () => 0, face() {}, move() {}, effect() {}, targets: () => [wolf], weapon: () => M.weaponStats(state), stats: () => M.activeStats(state), pet: () => pet(0), pet2: () => pet(1),
      // Before: the nearest creature within 7 m of the hero (plus its radius) was shot, whatever it was doing.
      focus: () => before && wolf.hp > 0 && Math.hypot(wolf.x, wolf.z) < 7 + wolf.radius ? wolf.id : null,
      hit: (target, h) => { const d = Math.hypot(wolf.x, wolf.z); if (first < 0) first = d; target.hp = Math.max(0, target.hp - h.amount); if (target.hp <= 0 && died < 0) died = d; } }, () => .5); // no lucky criticals: the distances are what is measured
    for (; t < 20; t += .025) { if (comes && wolf.hp > 0) { if (wolf.z <= reach) break; wolf.z -= def.speed * .025; } sim.update(.025); if (wolf.hp <= 0) break; }
    return { first, left: wolf.hp / hp, died, seconds: t };
  };
  return { peaceful: scene(false), comes: scene(true), reach, sight: def.sight };
}

interface Row { fight: string; pets: string; mode: 'none' | 'stats' | 'before' | 'after'; wins: number; runs: number; seconds: number; taken: number; hits: number; petShare: number; saved: number; guards: Record<string, number>; mended: number }
function run(name: string, pack: boolean, pets: PetOptions | undefined, seeds: readonly number[], script: Script): Omit<Row, 'fight' | 'pets' | 'mode'> {
  const f = FIGHTS.find(x => x.boss === name)!, kinds = PACKS[name];
  const runs: FightResult[] = seeds.map(seed => pack ? fight(kinds[0], f.planet, f.at, f.level, f.gear, script, seed, 1, { pets, pack: kinds.slice(1) }) : fight(f.boss, f.planet, f.at, f.level, f.gear, script, seed, undefined, { pets }));
  const avg = (pick: (r: FightResult) => number) => runs.reduce((a, r) => a + pick(r), 0) / runs.length, guards: Record<string, number> = {};
  for (const r of runs) for (const [k, n] of Object.entries(r.guards)) guards[k] = (guards[k] ?? 0) + n / runs.length;
  return { wins: runs.filter(r => r.won).length, runs: runs.length, seconds: avg(r => r.seconds), taken: avg(r => r.taken), hits: avg(r => r.hits), petShare: runs.reduce((a, r) => a + r.petDamage, 0) / Math.max(1, runs.reduce((a, r) => a + r.damage, 0)), saved: avg(r => r.saved), guards, mended: avg(r => r.mended) };
}
/** The four pet set-ups of one fight, before and after. `script`: how the hero plays (fight-sim.mts). */
export function petReport(seeds: readonly number[] = [1, 2, 3, 4, 5, 6], script: Script = 'single', names: readonly string[] = Object.keys(PET_SETS), kinds: readonly boolean[] = [false, true]) {
  const rows: Row[] = [];
  for (const name of names) for (const pack of kinds) {
    const set = PET_SETS[name], label = pack ? `${name}'s pack (${PACKS[name].join(', ')})` : name;
    rows.push({ fight: label, pets: 'no pet', mode: 'none', ...run(name, pack, undefined, seeds, script) });
    for (const [pets, ids, level] of [['one typical', set.one, 0], ['two typical', set.two, 0], ['best pair +10', BEST_PAIR, 10]] as const)
      // 'stats': the pets are worn for what they add to the hero (attack, health, defence) but neither shoot nor guard: the fair line to compare with.
      for (const mode of ['stats', 'before', 'after'] as const) rows.push({ fight: label, pets: `${pets} (${ids.map(id => M.ITEMS[id].name.replace(/^Little | companion$/g, '')).join(' + ')})`, mode, ...run(name, pack, { ids, level, before: mode === 'before', mute: mode === 'stats' }, seeds, script) });
  }
  return rows;
}

if (process.argv[1]?.endsWith('pet-sim.mts')) {
  console.log(`Pets: damage per shot (x the hero's attack), seconds between shots, damage per second and its share of the hero's own (${PET_RULES.heroDps} x attack a second), before -> after; then the guard.`);
  console.log(`Target rule, after: a creature that is fighting the hero (its chosen one, one that is after someone, one that hurt the hero in the last ${PET_RULES.hurt} s or that the hero hit in the last ${PET_RULES.struck} s) within ${PET_RULES.leash} m of the hero. Before: the nearest creature within 7 m of the hero, peaceful or not; shots flew 9 m.`);
  for (const p of petTable()) console.log(`  ${p.name.padEnd(26)} L${String(p.level).padStart(2)} ${p.shot.padEnd(7)} ${p.before.dmg.toFixed(2)}/${p.before.cd.toFixed(1)}s ${p.before.dps.toFixed(2)}/s ${pct(p.before.share).padStart(4)}  ->  ${p.after.dmg.toFixed(2)}/${p.after.cd.toFixed(1)}s ${p.after.dps.toFixed(2)}/s ${pct(p.after.share).padStart(4)} (+10: ${pct(p.after.shareMax)})   ${GUARD_WORDS[p.guard].padEnd(16)} ${p.guard === 'mend' ? pct(p.power, 1) + ' of health' : p.guard === 'distract' ? p.power + ' s' : 'x' + p.power + ' attack'} every ${p.every} s`);
  console.log(`  ${'Garden guard dog'.padEnd(26)} L 0 bone    ${dogTossFactor(1).toFixed(2)}/${DOG_TOSS_CD}s ${(dogTossFactor(1) / DOG_TOSS_CD).toFixed(2)}/s ${pct(dogTossFactor(1) / DOG_TOSS_CD / PET_RULES.heroDps).padStart(4)}  ->  unchanged (up to ${dogTossFactor(51).toFixed(3)} at level 51)                ${GUARD_WORDS.bark.padEnd(16)} ${DOG_GUARD.power} s every ${DOG_GUARD.every} s`);
  console.log(`
The Vault pets also cast skills (the solo game and inside the Vault; dungeon.ts). Before: two skills in turn on the nearest creature within 12 m of the pet, peaceful or not. After: one skill, only at a creature that is fighting the hero (the same rule as the shots); the other skill is the name of its guard.`);
  for (const [id, p] of Object.entries(DUNGEON_PETS)) { const was = (PET_SKILLS[p.skills[0]].mult + PET_SKILLS[p.skills[1]].mult) / 2 * p.was.dmg, now = PET_SKILLS[p.attack].mult * p.skillDmg, role = PET_ROLES[id];
    console.log(`  ${M.ITEMS[id].name.padEnd(26)} ${PET_SKILLS[p.skills[0]].name} / ${PET_SKILLS[p.skills[1]].name}: x${was.toFixed(2)} attack (area) every ${p.was.cd} s = ${(was / p.was.cd).toFixed(2)}/s ${pct(was / p.was.cd / PET_RULES.heroDps)}  ->  ${PET_SKILLS[p.attack].name} x${now.toFixed(2)} every ${p.skillCd} s = ${petSkillDps(id).toFixed(2)}/s ${pct(petSkillDps(id) / PET_RULES.heroDps)}; guard: ${PET_SKILLS[p.guard].name}.  Shots and skill together: ${pct((PET_BEFORE[id][0] / PET_BEFORE[id][1] + was / p.was.cd) / PET_RULES.heroDps)} -> ${pct(petShare(role) + petSkillDps(id) / PET_RULES.heroDps)} (+10: ${pct(petShare(role, 1.4) + petSkillDps(id) / PET_RULES.heroDps)})`); }
  console.log(`  A creature's hit is its base damage x its world (1 at home's edge to 6.2 in the dark world): a canyon cactus shoots for 39, a dark-world eye for 130; the test heroes' attack is 42, 59 and 83.`);
  console.log(`
Far away (the hero of the bear fight stands still and never attacks; a canyon wolf, sight ${ENEMY_TYPES.wolf.sight} m; the hero's own reach is ${farReport([], 0, false).reach.toFixed(1)} m)`);
  for (const [label, ids, level] of [['two typical (Robot + Turtle)', PET_SETS.bear.two, 0], ['best pair +10 (Cinderpeak + Moon Moth)', BEST_PAIR, 10]] as const) for (const before of [true, false]) {
    const r = farReport(ids, level, before), m = (v: number) => v < 0 ? 'never' : v.toFixed(1) + ' m';
    console.log(`  ${label.padEnd(40)} ${before ? 'before' : 'after '}  a peaceful wolf 6.5 m away: first hit at ${m(r.peaceful.first)}, ${r.peaceful.died >= 0 ? `dead in ${r.peaceful.seconds.toFixed(1)} s` : `${pct(r.peaceful.left)} health after 20 s`}   an angry wolf walking in from 12 m: first hit at ${m(r.comes.first)}, ${r.comes.died >= 0 ? `dead ${m(r.comes.died)} away` : `arrives with ${pct(r.comes.left)} health`}`);
  }
  if (!process.env.TABLE) {
    const seeds = Array.from({ length: Number(process.env.SEEDS) || 6 }, (_, i) => i + 1);
    for (const script of (process.env.SCRIPTS?.split(',') ?? ['single']) as Script[]) {
      console.log(`\nFights (script '${script}', ${seeds.length} runs each): time to win, damage taken in full healths (food is not eaten), the pets' share of all damage, what the guards took off, guards fired a fight`);
      let last = '', base: Row | null = null;
      for (const r of petReport(seeds, script)) {
        if (r.fight !== last) { console.log(`\n  ${r.fight}`); last = r.fight; }
        if (r.mode === 'none' || r.mode === 'stats') base = r;
        const dt = base && r !== base ? ` (${r.seconds >= base.seconds ? '+' : ''}${pct(r.seconds / base.seconds - 1)})` : '', dd = base && r !== base ? ` (${r.taken >= base.taken ? '+' : ''}${pct(r.taken / base.taken - 1)})` : '';
        console.log(`    ${r.pets.padEnd(44)} ${r.mode.padEnd(6)} wins ${r.wins}/${r.runs}  ${r.seconds.toFixed(0).padStart(3)} s${dt.padEnd(8)} taken ${r.taken.toFixed(2)}${dd.padEnd(8)} in ${r.hits.toFixed(0).padStart(2)} hits  pets ${pct(r.petShare).padStart(4)} of damage  guards saved ${r.saved.toFixed(2)}${r.mended ? ` mended ${r.mended.toFixed(2)}` : ''}  ${Object.entries(r.guards).map(([k, n]) => `${k} ${n.toFixed(1)}`).join(', ')}`);
      }
    }
  }
}
