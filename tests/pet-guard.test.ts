// Pets in a fight (src/pet-guard.ts): a small share of the damage, only against what fights the explorer, and one guard each.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as M from '../src/model.ts';
import { CombatSimulation, type CombatHost, type CombatTarget } from '../src/combat.ts';
import { DOG_GUARD, PET_BEFORE, PET_ROLES, PET_RULES, PetCrew, guardCut, guardOf, hostilePhase, petFighter, petRole, petRoleId, petShare, shotThreatens, type GuardEvent, type GuardKind, type PetFighter } from '../src/pet-guard.ts';
import { PetGuardView, type GuardShot } from '../src/pet-guard-view.ts';
import { petCard, petCardHtml } from '../src/pet-card.ts';
import { PETGUARD_VI } from '../src/locales/vi-petguard.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { setLanguage, switchLanguage } from '../src/i18n.ts';
import { dogTossFactor, DOG_TOSS_CD } from '../src/guard-dog.ts';
import { enemyRoster } from '../src/enemy-roster.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createCombatAuthority } from '../server/combat-authority.mjs';
import { fight, FIGHTS } from '../promo/fight-sim.mts';
import { BEST_PAIR, PACKS, PET_SETS } from '../promo/pet-sim.mts';
import { DUNGEON_PETS, PET_SKILLS, petSkillDps } from '../src/dungeon-content.ts';

const KINDS: GuardKind[] = ['counter', 'block', 'mend', 'distract'];
const pets = () => Object.entries(M.ITEMS).filter(([id, item]) => item.slot === 'pet' && !item.penned && !id.startsWith('dye_')).map(([id]) => id);
const dps = (id: string) => PET_ROLES[id].dmg / PET_ROLES[id].cd;
const family = (prefix: string) => Object.keys(PET_ROLES).filter(id => prefix === 'shop' ? !/^pet_(b|t|dg)_|^pet_colossus$/.test(id) : id.startsWith(prefix));

// ------------------------------------------------------------------------------------------------ the table
test('every pet has one row in the table, the items read their shot from it, and a dyed pet fights as its base', () => {
  assert.deepEqual(pets().sort(), Object.keys(PET_ROLES).sort(), 'one row a pet, no row without a pet');
  assert.deepEqual(Object.keys(PET_BEFORE).sort(), Object.keys(PET_ROLES).sort());
  for (const [id, role] of Object.entries(PET_ROLES)) {
    assert.equal(M.ITEMS[id].pet!.dmg, role.dmg, id); assert.equal(M.ITEMS[id].pet!.cd, role.cd, id);
    assert.ok(KINDS.includes(role.guard), `${id}: one guard of the four`); assert.ok(role.power > 0 && role.every >= 5 && role.every <= 12, `${id}: a guard every 5 to 12 s`);
  }
  for (const [id, item] of Object.entries(M.ITEMS)) if (id.startsWith('dye_') && item.slot === 'pet') { const base = petRoleId(id)!; assert.ok(base, id); assert.deepEqual(item.pet!.dmg, PET_ROLES[base].dmg, id); assert.equal(petRole(id), PET_ROLES[base]); }
  assert.equal(petRole('pet_dog'), undefined, 'the dog keeps its own toss'); assert.equal(DOG_GUARD.kind, 'bark'); assert.equal(petRole('sword_wood'), undefined); assert.equal(petFighter('nothing'), null);
  // Every kind of guard is used, and no kind is everybody's.
  const count = (kind: GuardKind) => Object.values(PET_ROLES).filter(r => r.guard === kind).length;
  for (const kind of KINDS) assert.ok(count(kind) >= 5 && count(kind) <= 16, `${kind}: ${count(kind)} pets`);
});

test('the player does the fighting: one pet about a tenth of the hero, two about a sixth, the best pair at +10 under three tenths', () => {
  for (const [id, role] of Object.entries(PET_ROLES)) {
    const share = petShare(role) + petSkillDps(id) / PET_RULES.heroDps; // a Vault pet's skill counts too
    assert.ok(share >= .035 && share <= PET_RULES.shareMax, `${id}: ${(share * 100).toFixed(1)}% of the hero`);
    assert.ok(dps(id) <= PET_BEFORE[id][0] / PET_BEFORE[id][1] + 1e-9, `${id} is not stronger than before`);
    assert.ok(role.dmg <= .5, `${id}: no shot above half a basic hit`);
  }
  const shares = Object.keys(PET_ROLES).map(id => petShare(PET_ROLES[id], 1.4) + petSkillDps(id) / PET_RULES.heroDps).sort((a, b) => b - a);
  assert.ok(shares[0] + shares[1] <= PET_RULES.pairMax, `the best pair at +10: ${((shares[0] + shares[1]) * 100).toFixed(1)}%`);
  assert.ok(shares[0] + shares[1] >= .22, 'and the best pair is still worth having');
  // Two typical pets (two boss keepsakes): about 15%.
  const two = petShare(PET_ROLES.pet_b_bear) * 2; assert.ok(two >= .12 && two <= .2, `${(two * 100).toFixed(1)}%`);
  // The old table for comparison: the best pair alone out-damaged the hero.
  const old = Object.values(PET_BEFORE).map(([dmg, cd]) => dmg / cd).sort((a, b) => b - a); assert.ok((old[0] + old[1]) / PET_RULES.heroDps > 1);
});

test('weak to strong: shop, boss, Titan, Vault, Colossus; within the Titan and Vault families the later pet is not the weaker', () => {
  const avg = (ids: string[]) => ids.reduce((n, id) => n + dps(id), 0) / ids.length, max = (ids: string[]) => Math.max(...ids.map(dps));
  const tiers = [family('shop'), family('pet_b_'), family('pet_t_'), family('pet_dg_'), ['pet_colossus']];
  for (let i = 1; i < tiers.length; i++) assert.ok(avg(tiers[i]) > avg(tiers[i - 1]), `tier ${i} hits harder on average`);
  assert.ok(dps('pet_colossus') > max(family('pet_dg_')) && max(family('pet_dg_')) > max(family('pet_t_')) && max(family('pet_t_')) > max(family('pet_b_')));
  for (const prefix of ['pet_t_', 'pet_dg_']) { const ids = family(prefix); for (let i = 1; i < ids.length; i++) assert.ok(dps(ids[i]) >= dps(ids[i - 1]) - 1e-9, `${ids[i]} after ${ids[i - 1]}`); }
  // Guards grow the same way: a later family protects more with the same kind of guard.
  for (const kind of KINDS) { const best = (ids: string[]) => Math.max(0, ...ids.filter(id => PET_ROLES[id].guard === kind).map(id => PET_ROLES[id].power)); const line = [family('shop'), family('pet_b_'), family('pet_t_'), family('pet_dg_')].map(best).filter(v => v > 0); for (let i = 1; i < line.length; i++) assert.ok(line[i] > line[i - 1], `${kind}: ${line.join(' < ')}`); }
});

test('upgrades keep their meaning: +4% a level on the shot and on the guard, never on its rhythm', () => {
  for (const id of ['pet_robot', 'pet_turtle', 'pet_sheep', 'pet_parrot', 'pet_colossus']) {
    let last = petFighter(id, 1)!;
    for (let level = 1; level <= 10; level++) { const now = petFighter(id, 1 + .04 * level)!; assert.ok(now.dmg > last.dmg && now.guard!.power > last.guard!.power, `${id} +${level}`); assert.equal(now.cd, last.cd); assert.equal(now.guard!.every, last.guard!.every); last = now; }
    assert.ok(Math.abs(last.dmg / PET_ROLES[id].dmg - 1.4) < 1e-9);
  }
  const s = M.newGame(); s.bag.pet_robot = 1; (s as M.SaveState & { gearLevels: Record<string, number> }).gearLevels = { pet_robot: 5 };
  assert.ok(Math.abs(guardOf('pet_robot', M.gearFactor(s, 'pet_robot'))!.power - PET_ROLES.pet_robot.power * 1.2) < 1e-9);
});

test('the Vault pets: one skill is a small attack, the other is the name of the guard; both used to strike anything within 12 m', () => {
  assert.deepEqual(Object.keys(DUNGEON_PETS).sort(), Object.keys(PET_ROLES).filter(id => id.startsWith('pet_dg_')).sort());
  for (const [id, pet] of Object.entries(DUNGEON_PETS)) {
    assert.deepEqual([pet.attack, pet.guard].sort(), [...pet.skills].sort(), `${id}: its two skills, one each`);
    const now = petSkillDps(id), was = (PET_SKILLS[pet.skills[0]].mult + PET_SKILLS[pet.skills[1]].mult) / 2 * pet.was.dmg / pet.was.cd;
    assert.ok(now > .03 && now < .11, `${id}: the skill adds ${(now / PET_RULES.heroDps * 100).toFixed(1)}% of the hero`); assert.ok(now < was / 3, `${id}: ${was.toFixed(2)} -> ${now.toFixed(2)} x attack a second`);
    const hit = PET_SKILLS[pet.attack].mult * pet.skillDmg; assert.ok(hit >= .4 && hit <= 1.1, `${id}: one cast is ${hit.toFixed(2)} x attack, more than a shot and less than the hero's own skills`);
    assert.ok(pet.skillCd >= 9);
  }
  // The skill's target is the shots' target: a creature that fights, within the leash (CombatSimulation.petTarget; dungeon.ts asks it).
  const a = arena([{ z: 5 }, { x: 4, z: 0, phase: 'idle' }, { z: 11, phase: 'chase' }]); assert.equal(a.sim.petTarget({ x: .9, z: -1 }), undefined, 'peaceful creatures 4 and 5 m away, an angry one 11 m away: no cast');
  a.foes[0].phase = 'chase'; assert.equal(a.sim.petTarget({ x: .9, z: -1 })?.id, 'f0'); assert.equal(a.sim.petTarget({ x: 0, z: -9 }), undefined, 'a pet left behind casts nothing');
});

// ------------------------------------------------------------------------------------------------ who a pet may shoot
type Foe = CombatTarget & { taken: number };
function arena(spots: Partial<Foe>[] = [], attack = 100) {
  const p = { x: 0, z: 0 }, foes: Foe[] = spots.map((s, i) => ({ id: 'f' + i, x: 0, z: 4, hp: 1e9, maxHp: 1e9, radius: .5, taken: 0, ...s }));
  const events: GuardEvent[] = [], statuses: { id: string; kind: string; time: number }[] = []; let hp = 1, healed = 0, focus: string | null = null;
  const host: CombatHost = { position: () => p, facing: () => 0, face() {}, targets: () => foes, weapon: () => ({ kind: 'fist' }), stats: () => ({ attack, critChance: 0, maxHp: 1000 }), move: (x, z) => { p.x += x; p.z += z; }, effect() {},
    hit: (t, h) => { (t as Foe).taken += h.amount; }, heal: f => { healed += f; hp = Math.min(1, hp + f); }, health: () => hp, focus: () => focus, guarded: e => events.push(e), status: (t, kind, time) => statuses.push({ id: t.id, kind, time }) };
  const sim = new CombatSimulation(host, () => .5);
  return { p, foes, sim, host, events, statuses, healed: () => healed, setHp: (v: number) => { hp = v; }, setFocus: (id: string | null) => { focus = id; }, run: (seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += .025) sim.update(.025); } };
}
const shooter = (over: Partial<PetFighter> = {}): PetFighter => ({ x: .9, z: -1, dmg: .3, cd: 1, shot: 'fire', ...over });

test('a pet never shoots a peaceful creature, however near, and never one beyond the leash, however angry', () => {
  for (const phase of [undefined, 'idle', 'return']) { const a = arena([{ z: 3, phase }]); a.host.pet = () => shooter(); a.host.dog = () => shooter({ dmg: .25, cd: 2.5 }); a.run(20); assert.equal(a.foes[0].taken, 0, `phase ${phase}: left alone`); assert.equal(a.sim.projectiles.length, 0); }
  const far = arena([{ z: PET_RULES.leash + .5 + .1, phase: 'chase' }]); far.host.pet = () => shooter(); far.host.pet2 = () => shooter({ x: -.9 }); far.run(20); assert.equal(far.foes[0].taken, 0, 'just beyond the leash: not shot');
  const near = arena([{ z: PET_RULES.leash + .5 - .1, phase: 'chase' }]); near.host.pet = () => shooter(); near.run(5); assert.ok(near.foes[0].taken > 0, 'just inside it: shot');
  assert.ok(PET_RULES.leash >= 6 && PET_RULES.leash <= 9, 'a short leash'); assert.ok(PET_RULES.range <= PET_RULES.leash + 3, 'and no long shots');
  for (const phase of ['chase', 'windup', 'charge', 'recover', 'bspin']) assert.equal(hostilePhase(phase), true); for (const phase of [undefined, '', 'idle', 'return']) assert.equal(hostilePhase(phase), false);
});

test('fair game: the chosen creature, one the hero hit in the last seconds, one that hurt the hero; then the pets stop', () => {
  // The chosen target, peaceful or not.
  const chosen = arena([{ z: 3 }, { x: 3, z: 0 }]); chosen.host.pet = () => shooter(); chosen.setFocus('f0'); chosen.run(4); assert.ok(chosen.foes[0].taken > 0); assert.equal(chosen.foes[1].taken, 0, 'its peaceful neighbour is left alone');
  chosen.setFocus(null); const then = chosen.foes[0].taken; chosen.run(6); assert.equal(chosen.foes[0].taken, then, 'no longer chosen: the pet stops');
  // One the hero hit: for PET_RULES.struck seconds after the last blow.
  const struck = arena([{ z: 1.5 }]); struck.host.pet = () => shooter(); struck.run(3); assert.equal(struck.foes[0].taken, 0);
  assert.equal(struck.sim.basic(struck.foes[0]), true); const own = struck.foes[0].taken; struck.run(PET_RULES.struck); const helped = struck.foes[0].taken - own; assert.ok(helped > 0, 'the pet joins in');
  struck.run(3); const after = struck.foes[0].taken; struck.run(5); assert.equal(struck.foes[0].taken, after, 'the hero stopped hitting: so does the pet');
  // One that hurt the hero: for PET_RULES.hurt seconds.
  const hurt = arena([{ z: 3 }]); hurt.host.pet = () => shooter(); hurt.sim.guardIncoming(10, 'melee', hurt.foes[0]); hurt.run(2); assert.ok(hurt.foes[0].taken > 0);
  hurt.run(PET_RULES.hurt + 2); const done = hurt.foes[0].taken; hurt.run(5); assert.equal(hurt.foes[0].taken, done);
});

test('the hero leaves the fight and the pets stop; a pet left behind does nothing; a shot passes a peaceful creature by', () => {
  const a = arena([{ z: 4, phase: 'chase' }]); a.host.pet = () => shooter({ x: a.p.x + .9, z: a.p.z - 1 }); a.run(3); const before = a.foes[0].taken; assert.ok(before > 0);
  a.p.z = -(PET_RULES.leash + 2); a.run(1); const settled = a.foes[0].taken; a.run(8); assert.equal(a.foes[0].taken, settled, 'out of the leash: no more shots');
  const behind = arena([{ z: 3, phase: 'chase' }]); behind.host.pet = () => shooter({ x: 0, z: -(PET_RULES.leash + 1) }); behind.run(6); assert.equal(behind.foes[0].taken, 0, 'the pet is too far from its hero to fight');
  // A peaceful creature stands in the line of fire: the shot flies through it and lands on the one that fights.
  const line = arena([{ z: 5, phase: 'chase' }, { z: 2.5, phase: 'idle' }]); line.host.pet = () => shooter({ x: 0, z: 0 }); line.run(6); assert.ok(line.foes[0].taken > 0); assert.equal(line.foes[1].taken, 0, 'never a peaceful creature, not even by accident');
  // The nearest of two that fight is the target; the chosen one comes first.
  const two = arena([{ z: 5, phase: 'chase' }, { x: 3, z: 0, phase: 'chase' }]); two.host.pet = () => shooter({ x: 0, z: 0, cd: 5 }); two.run(1); assert.ok(two.foes[1].taken > 0 && two.foes[0].taken === 0, 'the nearest');
  const pick = arena([{ z: 5, phase: 'chase' }, { x: 3, z: 0, phase: 'chase' }]); pick.setFocus('f0'); pick.host.pet = () => shooter({ x: 0, z: 0, cd: 5 }); pick.run(1); assert.ok(pick.foes[0].taken > 0 && pick.foes[1].taken === 0, 'the chosen one first');
});

test('with no pet out the crew does nothing; a pet shot is a helper hit that never freezes', () => {
  const idle = arena([{ z: 3, phase: 'chase' }]); idle.run(5); assert.equal(idle.foes[0].taken, 0); assert.deepEqual(idle.sim.crew.wait, [0, 0, 0]);
  assert.equal(idle.sim.guardIncoming(50, 'melee', idle.foes[0]), 50, 'no pet: the whole hit'); assert.equal(idle.sim.counterShot({ x: 0, z: 3, damage: 50 }), undefined); assert.equal(idle.events.length, 0);
  const ice = arena([{ z: 3, phase: 'chase' }]); ice.host.pet = () => shooter({ shot: 'ice' }); ice.sim.update(.025); const shot = ice.sim.projectiles[0];
  assert.equal(shot.helper, true); assert.equal(shot.stun, 0); assert.equal(shot.slow, PET_RULES.chill); assert.ok(shot.remaining <= PET_RULES.range);
});

// ------------------------------------------------------------------------------------------------ the guards
const guard = (kind: GuardKind | 'bark', power: number, every = 6, over: Partial<PetFighter> = {}): PetFighter => ({ x: .9, z: -1, dmg: .3, cd: 1e6, guard: { kind, power, every }, ...over });

test('guardCut: the power, never more than the hit, and for a boss never past 30% of it', () => {
  assert.equal(guardCut(40, 60, false, 40), 40); assert.equal(guardCut(40, 25, false, 40), 25); assert.equal(guardCut(0, 25, false, 40), 0); assert.equal(guardCut(40, 0, false, 40), 0);
  assert.equal(guardCut(100, 60, true, 100), 30); assert.equal(guardCut(100, 20, true, 100), 20); assert.equal(guardCut(80, 60, true, 100, 20), 10, 'a second pet only gets what is left of the cap'); assert.equal(guardCut(70, 60, true, 100, 30), 0);
  assert.equal(PET_RULES.bossCap, .3);
});

test('bullet counter: a weaker shot is destroyed, a stronger one loses the protect power, once per cooldown, shots only', () => {
  const a = arena([{ z: 6, phase: 'chase' }]); a.host.pet = () => guard('counter', .4, 7); // protect power .4 x 100 attack = 40
  assert.equal(a.sim.guardIncoming(30, 'shot', a.foes[0]), 0, '40 against 30: destroyed'); assert.deepEqual(a.events.map(e => [e.slot, e.kind, e.power, e.left]), [[0, 'counter', 30, 0]]);
  assert.equal(a.sim.guardIncoming(30, 'shot', a.foes[0]), 30, 'the guard is cooling down'); a.run(6.9); assert.equal(a.sim.guardIncoming(30, 'shot', a.foes[0]), 30); a.run(.2);
  assert.equal(a.sim.guardIncoming(100, 'shot', a.foes[0]), 60, '40 against 100: 60 flies on'); assert.equal(a.events.at(-1)!.left, 60);
  a.run(8); assert.equal(a.sim.guardIncoming(30, 'melee', a.foes[0]), 30, 'a counter does not stop a blow'); assert.equal(a.sim.guardIncoming(30, 'hazard', a.foes[0]), 30); assert.equal(a.sim.guardIncoming(30, 'shot', null), 30, 'nor a hit without a creature (lava, weather)');
  assert.equal(a.sim.guardIncoming(30, 'shot', a.foes[0]), 0, 'and none of those spent it');
  // A pet too far from its hero guards nothing.
  const far = arena([{ z: 6, phase: 'chase' }]); far.host.pet = () => guard('counter', .4, 7, { x: 0, z: -(PET_RULES.reach + 1) }); assert.equal(far.sim.guardIncoming(30, 'shot', far.foes[0]), 30);
});

test('a shot met in the air: only within reach of the pet, with the place for the picture', () => {
  const a = arena([{ z: 12, phase: 'chase' }]); a.host.pet = () => guard('counter', .4, 7, { x: 1, z: 0 });
  assert.equal(a.sim.counterShot({ x: 0, z: 1 + PET_RULES.reach + 1, damage: 30 }), undefined, 'too far from the pet yet'); assert.equal(a.events.length, 0);
  assert.equal(a.sim.counterShot({ x: 0, z: 5, damage: 30, owner: 'f0' }), 0); assert.deepEqual(a.events[0], { slot: 0, kind: 'counter', power: 30, left: 0, x: 1, z: 0, tx: 0, tz: 5, target: 'f0', flight: true });
  assert.equal(a.sim.counterShot({ x: 0, z: 4, damage: 30 }), undefined, 'one intercept per cooldown'); a.run(7.1); assert.equal(a.sim.counterShot({ x: 0, z: 4, damage: 100 }), 60);
  assert.equal(shotThreatens({ x: 0, z: 8, vx: 0, vz: -13 }, { x: 0, z: 0 }), true); assert.equal(shotThreatens({ x: 0, z: 8, vx: 0, vz: 13 }, { x: 0, z: 0 }), false, 'flying away');
  assert.equal(shotThreatens({ x: 3, z: 8, vx: 0, vz: -13 }, { x: 0, z: 0 }), false, 'passing 3 m wide'); assert.equal(shotThreatens({ x: 0, z: 8, vx: 0, vz: 0 }, { x: 0, z: 0 }), false);
});

test('a boss shot is only reduced, by at most 30%, and two pets share that cap', () => {
  const a = arena([{ z: 6, phase: 'windup', boss: true }]); a.host.pet = () => guard('counter', 5, 7); a.host.pet2 = () => guard('counter', 5, 7, { x: -.9 });
  assert.equal(a.sim.guardIncoming(200, 'shot', a.foes[0]), 140, 'never deleted: 30% off at most'); assert.equal(a.events.length, 1, 'the first pet used the whole cap; the second keeps its guard');
  assert.equal(a.sim.guardIncoming(200, 'shot', a.foes[0]), 140, 'the second pet answers the next one'); a.run(8);
  assert.equal(a.sim.counterShot({ x: 0, z: 3, damage: 200, boss: true }), 140);
  const weak = arena([{ z: 6, phase: 'windup', boss: true }]); weak.host.pet = () => guard('counter', .2, 7); weak.host.pet2 = () => guard('counter', .2, 7, { x: -.9 });
  assert.equal(weak.sim.guardIncoming(200, 'shot', weak.foes[0]), 160, 'two weak counters: 20 + 20 off');
});

test('body block: one blow in N seconds loses the protect power; a blow weaker than it is stopped', () => {
  const a = arena([{ z: 1.5, phase: 'chase' }]); a.host.pet = () => guard('block', .5, 6);
  assert.equal(a.sim.guardIncoming(80, 'melee', a.foes[0]), 30); assert.equal(a.sim.guardIncoming(80, 'melee', a.foes[0]), 80, 'cooling down'); assert.equal(a.sim.guardIncoming(80, 'shot', a.foes[0]), 80, 'a block does not stop a shot');
  a.run(6.1); assert.equal(a.sim.guardIncoming(40, 'melee', a.foes[0]), 0); assert.deepEqual(a.events.map(e => [e.kind, e.power, e.left]), [['block', 50, 30], ['block', 40, 0]]);
  // A blocker and a counter each answer their own kind of hit, the same second.
  const both = arena([{ z: 1.5, phase: 'chase' }]); both.host.pet = () => guard('block', .5, 6); both.host.pet2 = () => guard('counter', .3, 7, { x: -.9 });
  assert.equal(both.sim.guardIncoming(80, 'melee', both.foes[0]), 30); assert.equal(both.sim.guardIncoming(80, 'shot', both.foes[0]), 50); assert.deepEqual(both.events.map(e => e.slot), [0, 1]);
  // Two blockers on one blow: both step in.
  const two = arena([{ z: 1.5, phase: 'chase' }]); two.host.pet = () => guard('block', .3, 6); two.host.pet2 = () => guard('block', .2, 6, { x: -.9 }); assert.equal(two.sim.guardIncoming(80, 'melee', two.foes[0]), 30);
});

test('mend: a little health when a hit leaves the hero below half, once per cooldown, never out of a fight', () => {
  const a = arena([{ z: 1.5, phase: 'chase' }]); a.host.pet = () => guard('mend', .05, 12);
  a.setHp(.4); a.run(3); assert.equal(a.healed(), 0, 'low, but nothing has hurt the hero: no heal');
  a.setHp(.8); assert.equal(a.sim.guardIncoming(50, 'melee', a.foes[0]), 50, 'a mender takes nothing off the hit'); a.run(1); assert.equal(a.healed(), 0, 'above half: no heal');
  a.setHp(.45); a.sim.guardIncoming(50, 'melee', a.foes[0]); a.run(.1); assert.ok(Math.abs(a.healed() - .05) < 1e-12); assert.deepEqual(a.events.map(e => [e.kind, e.power]), [['mend', .05]]);
  a.setHp(.3); a.sim.guardIncoming(50, 'melee', a.foes[0]); a.run(5); assert.ok(Math.abs(a.healed() - .05) < 1e-12, 'once in 12 s');
  a.run(7.5); a.setHp(.3); a.sim.guardIncoming(50, 'melee', a.foes[0]); a.run(.1); assert.ok(Math.abs(a.healed() - .1) < 1e-12);
  const dead = arena([{ z: 1.5, phase: 'chase' }]); dead.host.pet = () => guard('mend', .05, 12); dead.setHp(0); dead.sim.guardIncoming(50, 'melee', dead.foes[0]); dead.run(1); assert.equal(dead.healed(), 0, 'it does not raise the fallen');
});

test('distract and the dog\'s bark: the creature that hurt the hero is stopped or slowed, a boss only slowed and half as long', () => {
  const a = arena([{ z: 1.5, phase: 'chase' }]); a.host.pet = () => guard('distract', 2, 9);
  assert.equal(a.sim.guardIncoming(50, 'melee', a.foes[0]), 50, 'the hit lands'); assert.deepEqual(a.statuses, [{ id: 'f0', kind: 'blind', time: 2 }]); assert.deepEqual(a.events.map(e => [e.kind, e.power, e.target]), [['distract', 2, 'f0']]);
  a.sim.guardIncoming(50, 'shot', a.foes[0]); assert.equal(a.statuses.length, 1, 'once per cooldown'); a.run(9.1); a.sim.guardIncoming(50, 'shot', a.foes[0]); assert.equal(a.statuses.length, 2, 'a shooter is distracted too');
  const boss = arena([{ z: 1.5, phase: 'chase', boss: true }]); boss.host.pet = () => guard('distract', 2, 9); boss.sim.guardIncoming(50, 'melee', boss.foes[0]); assert.deepEqual(boss.statuses, [{ id: 'f0', kind: 'slow', time: 1 }]);
  const dog = arena([{ z: 1.5, phase: 'chase' }]); dog.host.dog = () => ({ x: -1, z: -1, dmg: dogTossFactor(1), cd: DOG_TOSS_CD, guard: DOG_GUARD });
  assert.equal(dog.sim.guardIncoming(50, 'melee', dog.foes[0]), 50); assert.deepEqual(dog.statuses, [{ id: 'f0', kind: 'slow', time: DOG_GUARD.power }]); assert.deepEqual(dog.events.map(e => [e.slot, e.kind]), [[2, 'bark']]);
  dog.run(3); assert.ok(dog.foes[0].taken > 0, 'and it tosses bones at the creature that fights');
  const calm = arena([{ z: 3 }]); calm.host.dog = () => ({ x: -1, z: -1, dmg: .25, cd: DOG_TOSS_CD, guard: DOG_GUARD }); calm.run(8); assert.equal(calm.foes[0].taken, 0, 'the dog leaves a peaceful creature alone');
});

test('two slots: each pet guards on its own cooldown, and a reset clears them', () => {
  const a = arena([{ z: 4, phase: 'chase' }]); a.host.pet = () => guard('counter', .2, 7); a.host.pet2 = () => guard('counter', .2, 5, { x: -.9 });
  assert.equal(a.sim.guardIncoming(100, 'shot', a.foes[0]), 60, 'both answer one shot: 20 + 20'); assert.deepEqual(a.events.map(e => e.slot), [0, 1]);
  a.run(5.1); assert.equal(a.sim.guardIncoming(100, 'shot', a.foes[0]), 80, 'the second is ready first'); a.run(2); assert.equal(a.sim.guardIncoming(100, 'shot', a.foes[0]), 80, 'then the first');
  a.sim.reset(); assert.deepEqual(a.sim.crew.wait, [0, 0, 0]); assert.equal(a.sim.guardIncoming(100, 'shot', a.foes[0]), 60);
  const crew = new PetCrew(); crew.use(0, 3); crew.noteStruck('x', 0); crew.step(1, 1); assert.equal(crew.ready(0), false); assert.equal(crew.engaged({ id: 'x', x: 0, z: 0, hp: 1 }, null, 1), true); crew.step(5, 6); assert.equal(crew.ready(0), true); assert.equal(crew.engaged({ id: 'x', x: 0, z: 0, hp: 1 }, null, 6), false);
});

// ------------------------------------------------------------------------------------------------ the picture
function viewRig(local = true) {
  const calls: string[] = [], texts: string[] = [], a = arena([{ id: 'cactus', z: 10, phase: 'windup' }]);
  const fx = { flash: () => calls.push('flash'), ring: () => calls.push('ring'), spark: () => calls.push('spark'), burst: () => calls.push('burst'), text: (_at: unknown, message: string) => { texts.push(message); } };
  const model = { position: { x: .9, y: 0, z: -1 }, scale: { x: 1, value: 1, setScalar(v: number) { this.x = v; this.value = v; } } };
  const view = new PetGuardView({ fx: () => fx as never, petModel: slot => slot === 0 ? model as never : null, hero: () => ({ x: a.p.x, y: 0, z: a.p.z }), creature: id => a.foes.find(f => f.id === id), counter: shot => a.sim.counterShot(shot), local: () => local, color: () => '#ff985f', maxHp: () => 1000, t: key => key });
  a.host.guarded = e => { a.events.push(e); view.show(e); };
  const shot = (damage: number, z = 4): GuardShot => { const mesh = { position: { x: 0, y: 1, z }, scale: { v: 1, multiplyScalar(k: number) { this.v *= k; } } }; return { mesh: mesh as never, vx: 0, vz: -13, life: 1, damage, ownerId: 'cactus' }; };
  const fly = (s: GuardShot, seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += .02) { (s.mesh.position as { z: number }).z += s.vz * .02; s.life -= .02; view.update(.02); } };
  return { a, view, calls, texts, model, shot, fly };
}
test('the picture of a counter: the bolt meets the shot, which pops when destroyed and shrinks when only weakened', () => {
  const r = viewRig(); r.a.host.pet = () => guard('counter', .4, 7);
  const weak = r.shot(30); r.view.shotNear(weak); assert.equal(weak.damage, 0, 'its damage is gone at once'); assert.equal(weak.guarded, true); assert.ok(weak.life > 0, 'it still flies until the bolt reaches it');
  r.fly(weak, .4); assert.equal(weak.life <= 0, true, 'popped where they met'); assert.deepEqual(r.texts, ['🛡️ Blocked']); assert.ok(r.calls.includes('spark') && r.calls.includes('burst'));
  assert.equal(r.model.scale.value, 1, 'the pet is back to its size after its little jump'); assert.equal(r.view.shown.counter, 1);
  const again = r.shot(30); r.view.shotNear(again); assert.equal(again.damage, 30, 'the guard is cooling down: this one flies on'); assert.equal(again.guarded, undefined);
  r.a.run(7.1); const strong = r.shot(100); r.view.shotNear(strong); assert.equal(strong.damage, 60); r.fly(strong, .25); assert.ok(strong.life > 0, 'weakened, not destroyed');
  assert.ok((strong.mesh.scale as unknown as { v: number }).v < 1, 'and drawn smaller'); assert.equal(r.texts.at(-1), '🛡️ −40');
  // A shot that flies away, one aimed at somebody else, and any shot while the server decides: left alone.
  r.a.run(8); const away = r.shot(30); away.vz = 13; r.view.shotNear(away); assert.equal(away.damage, 30);
  const theirs = r.shot(30); theirs.targetId = 'friend'; r.view.shotNear(theirs); assert.equal(theirs.damage, 30);
  const online = viewRig(false); online.a.host.pet = () => guard('counter', .4, 7); const s = online.shot(30); online.view.shotNear(s); assert.equal(s.damage, 30, 'online the server answers it where it lands'); assert.equal(online.a.events.length, 0);
});
test('the picture of the other guards: a shield for a block, a glow for a mend, a mark for a distraction; idle costs nothing', () => {
  const r = viewRig(); r.view.update(.016); assert.deepEqual(r.calls, [], 'nothing in flight: nothing drawn');
  r.view.show({ slot: 0, kind: 'block', power: 25, left: 55, x: .9, z: -1, tx: 0, tz: 0 }); assert.ok(r.calls.includes('ring')); assert.equal(r.texts.at(-1), '🛡️ −25');
  r.view.show({ slot: 1, kind: 'block', power: 40, left: 0, x: -.9, z: -1 }); assert.equal(r.texts.at(-1), '🛡️ Blocked');
  r.view.show({ slot: 0, kind: 'mend', power: .05, left: 0, x: .9, z: -1 }); assert.equal(r.texts.at(-1), '+50');
  r.view.show({ slot: 0, kind: 'distract', power: 2, left: 50, x: .9, z: -1, target: 'cactus' }); assert.equal(r.texts.at(-1), '💫');
  r.view.show({ slot: 2, kind: 'bark', power: 3, left: 50, x: -1, z: -1, target: 'cactus' }); assert.equal(r.texts.at(-1), '🐕');
  for (let i = 0; i < 10; i++) r.view.update(.02); assert.ok(r.model.scale.value > 1, 'the pet jumps a little'); for (let i = 0; i < 20; i++) r.view.update(.02); assert.equal(r.model.scale.value, 1);
  const n = r.calls.length; r.view.update(.016); assert.equal(r.calls.length, n, 'idle again');
  r.view.show({ slot: 0, kind: 'block', power: 1, left: 1, x: 0, z: 0 }); r.view.clear(); assert.equal(r.model.scale.value, 1);
});

// ------------------------------------------------------------------------------------------------ the card
test('the pet card says what a pet does, in English and Vietnamese, for every pet and the dog', async () => {
  const s = M.newGame(); s.level = 20; const attack = M.activeStats(s).attack, maxHp = M.activeStats(s).maxHp;
  try {
    for (const lang of ['en', 'vi'] as const) {
      await switchLanguage(lang);
      for (const id of [...pets(), 'pet_dog', 'dye_gilded_pet_robot']) {
        const card = petCard(id, s)!; assert.ok(card, id);
        for (const line of [card.attack, card.rule, card.guard, card.boss]) assert.ok(!/[{}]|undefined|NaN/.test(line), `${lang} ${id}: ${line}`);
        if (lang === 'vi') for (const line of [card.attack, card.rule, card.guard]) assert.ok(/[À-ỹ]/.test(line), `Vietnamese: ${line}`);
        assert.ok(petCardHtml(id, s).includes('class="pet-card"'));
      }
    }
    setLanguage('en');
    const robot = petCard('pet_robot', s)!; assert.equal(robot.kind, 'counter'); assert.ok(robot.attack.includes('7%')); assert.ok(robot.guard.includes(`Takes ${Math.round(PET_ROLES.pet_robot.power * attack)} damage off a shot`)); assert.ok(robot.guard.includes('every 8 s')); assert.ok(robot.boss.includes('30%'));
    assert.ok(petCard('pet_sheep', s)!.guard.includes(`+${Math.round(PET_ROLES.pet_sheep.power * maxHp)} health`)); assert.equal(petCard('pet_sheep', s)!.boss, '');
    assert.equal(petCard('pet_dog', s)!.kind, 'bark'); assert.equal(petCard('sword_wood', s), null); assert.equal(petCardHtml('sword_wood', s), ''); assert.equal(petCardHtml('nothing', s), '');
    // A levelled pet shows what it does now.
    (s as M.SaveState & { gearLevels: Record<string, number> }).gearLevels = { pet_robot: 10 }; assert.ok(petCard('pet_robot', s)!.attack.includes('10%')); assert.ok(petCard('pet_robot', s)!.guard.includes(`Takes ${Math.round(PET_ROLES.pet_robot.power * 1.4 * attack)} damage`));
  } finally { setLanguage('en'); }
  for (const [en, vi] of Object.entries(PETGUARD_VI)) { assert.equal(VI_PACK[en], vi, en); assert.notEqual(vi, en); assert.deepEqual((vi.match(/\{\w+\}/g) ?? []).sort(), (en.match(/\{\w+\}/g) ?? []).sort(), `same slots: ${en}`); }
});

// ------------------------------------------------------------------------------------------------ the server
async function serverRig(t: { after(fn: () => Promise<void>): void; diagnostic(m: string): void }, gears: Record<string, Record<string, string>>) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'cute-pet-guard-')), store = await createAccountStore({ dataDir, databaseUrl: '' });
  const peers = new Map<string, any>(), sent: { to: string; message: any }[] = [], room = { id: 'public:home', members: new Set<string>(), host: '', enemies: [], killed: new Set() }, rooms = new Map([[room.id, room]]);
  for (const [id, gear] of Object.entries(gears)) {
    const profile = M.newGame(); for (const item of Object.values(gear)) profile.bag[item] = 1; Object.assign(profile.gear, gear);
    const account = await store.create({ id, username: id, hash: 'h', salt: 's', profile, friends: [], requests: [], profileRevision: 0 });
    peers.set(id, { account, active: true, visit: null, planet: 'home', room: room.id, pose: { x: -30, z: 1, facing: 0, moving: false }, socket: { id } }); room.members.add(id); room.host ||= id;
  }
  const authority = createCombatAuthority({ store, peers, rooms, remember: (v: unknown) => v, onError: (e: Error) => t.diagnostic(e.stack ?? ''), send: (socket: { id: string }, message: unknown) => { sent.push({ to: socket.id, message }); }, broadcast() {}, onDeath() {} });
  t.after(async () => { await authority.close(); await store.close(); });
  const spawn = (type: string, phase = 'chase') => { const definition = enemyRoster('home').find(e => e.type === type)!; authority.acceptSnapshots(room, [{ id: definition.id, type, x: 107, z: -46, hp: 1 }]); const enemy = authority.state(room).enemies.get(definition.id)!; enemy.phase = phase; enemy.x = -30; enemy.z = 4; return enemy; }; // accepted in its own zone (the canyon), then beside the explorers
  /** The host reports a hit on `id`; returns the health the server took (0: nothing landed). */
  const hurt = (id: string, enemy: { id: string }, source: string) => { const peer = peers.get(id), engine = authority.engineFor(peer), lost = () => engine.healthEvents.reduce((sum: number, e: { amount: number }) => sum - Math.min(0, e.amount), 0), before = lost(); engine.damageAt = 0; authority.damage(peer, enemy.id, source); return lost() - before; }; // blows within 100 ms are saved as one event
  return { authority, peers, sent, spawn, hurt };
}
test('online: the server computes the same protection, for the pet\'s own explorer only, and tells that explorer alone', async t => {
  const f = await serverRig(t, { alone: {}, robot: { pet: 'pet_robot' }, turtle: { pet: 'pet_turtle' } }), cactus = f.spawn('cactus'), raw = cactus.damage;
  const profile = f.peers.get('robot').account.profile, attack = M.activeStats(profile).attack, taken = (amount: number, p = profile) => Math.max(1, Math.round(amount * 60 / (M.defense(p) + 60)));
  assert.equal(f.hurt('alone', cactus, 'shot'), taken(raw, f.peers.get('alone').account.profile), 'no pet: the whole shot, though two pets stand beside them');
  assert.equal(f.sent.filter(m => m.message.type === 'guard').length, 0, 'other explorers\' pets protect nobody else');
  // The robot counters the shot: the server's copy of the rules decides by the same numbers as the browser's.
  const cut = Math.min(raw, PET_ROLES.pet_robot.power * attack), local = arena([{ z: 4, phase: 'chase' }], attack); local.host.pet = () => ({ ...petFighter('pet_robot', 1)!, x: 0, z: 0 });
  assert.equal(local.sim.guardIncoming(raw, 'shot', local.foes[0]), raw - cut);
  assert.equal(f.hurt('robot', cactus, 'shot'), taken(raw - cut), 'the server took off exactly the protect power');
  const told = f.sent.filter(m => m.message.type === 'guard'); assert.deepEqual(told.map(m => m.to), ['robot'], 'only the protected explorer hears of it');
  assert.equal(told[0].message.event.kind, 'counter'); assert.ok(Math.abs(told[0].message.event.power - cut) < 1e-9); assert.equal(told[0].message.event.slot, 0);
  assert.equal(f.hurt('robot', cactus, 'shot'), taken(raw), 'its guard is cooling down on the server'); assert.equal(f.hurt('robot', cactus, 'melee'), taken(raw), 'and a counter stops no blow');
  // The turtle blocks a blow, not a shot.
  const tp = f.peers.get('turtle').account.profile, block = Math.min(raw, PET_ROLES.pet_turtle.power * M.activeStats(tp).attack);
  assert.equal(f.hurt('turtle', cactus, 'shot'), taken(raw, tp)); assert.equal(f.hurt('turtle', cactus, 'melee'), taken(raw - block, tp));
  // A hit that cannot land (the safe village) spends no guard.
  const robot = f.peers.get('robot'), engine = f.authority.engineFor(robot); engine.sim.reset(); robot.pose.x = 0; assert.equal(f.hurt('robot', cactus, 'shot'), 0); assert.deepEqual(engine.sim.crew.wait, [0, 0, 0]);
  robot.pose.x = -30; assert.equal(f.hurt('robot', cactus, 'shot'), taken(raw - cut));
});
test('online: a levelled pet protects more, a boss keeps 70% of its hit, and a mend heals on the server', async t => {
  const f = await serverRig(t, { plus: { pet: 'pet_robot' }, sheep: { pet: 'pet_sheep' }, strong: { pet: 'pet_colossus', pet2: 'pet_dg_bellows' } }), cactus = f.spawn('cactus'), bear = f.spawn('bear', 'recover'), raw = cactus.damage;
  const plus = f.peers.get('plus').account.profile; plus.gearLevels = { pet_robot: 10 }; const taken = (amount: number, p: M.SaveState) => Math.max(1, Math.round(amount * 60 / (M.defense(p) + 60)));
  assert.equal(f.hurt('plus', cactus, 'shot'), taken(raw - Math.min(raw, PET_ROLES.pet_robot.power * 1.4 * M.activeStats(plus).attack), plus));
  // The best pair against a boss: a blow and a shot each lose 30% at most.
  const strong = f.peers.get('strong').account.profile; strong.level = 40; strong.hp = M.maxHp(strong); const boss = bear.damage;
  assert.ok(PET_ROLES.pet_colossus.power * M.activeStats(strong).attack > boss * .3, 'strong enough to hit the cap');
  assert.equal(f.hurt('strong', bear, 'melee'), taken(boss * .7, strong)); assert.equal(f.hurt('strong', bear, 'shot'), taken(boss * .7, strong));
  // The sheep mends its explorer once it is below half health.
  const sheep = f.peers.get('sheep'), sp = sheep.account.profile; sp.hp = Math.round(M.maxHp(sp) * .45); const engine = f.authority.engineFor(sheep), n = engine.healthEvents.length;
  f.hurt('sheep', cactus, 'melee'); engine.sim.update(.05); const heals = engine.healthEvents.slice(n).filter((e: { amount: number }) => e.amount > 0);
  assert.equal(heals.length, 1); assert.ok(Math.abs(heals[0].amount - M.maxHp(sp) * PET_ROLES.pet_sheep.power) < 1e-9);
  assert.equal(f.sent.filter(m => m.to === 'sheep' && m.message.type === 'guard' && m.message.event.kind === 'mend').length, 1);
});

// ------------------------------------------------------------------------------------------------ the balance, by simulation
test('scripted fights: typical pets add a modest share, the best pair stays under a third, and guards protect without making fights trivial', () => {
  const bear = FIGHTS.find(f => f.boss === 'bear')!, shadow = FIGHTS.find(f => f.boss === 'shadowlord')!, seeds = [1, 2, 3];
  const sum = (f: typeof bear, opts: Parameters<typeof fight>[8], pack?: string[]) => { const runs = seeds.map(seed => pack ? fight(pack[0], f.planet, f.at, f.level, f.gear, 'single', seed, 1, { ...opts, pack: pack.slice(1) }) : fight(f.boss, f.planet, f.at, f.level, f.gear, 'single', seed, undefined, opts));
    const total = (k: 'damage' | 'petDamage' | 'taken' | 'saved' | 'seconds') => runs.reduce((n, r) => n + r[k], 0); return { won: runs.every(r => r.won), share: total('petDamage') / total('damage'), taken: total('taken'), saved: total('saved'), seconds: total('seconds') }; };
  const two = sum(bear, { pets: { ids: PET_SETS.bear.two } }), stats = sum(bear, { pets: { ids: PET_SETS.bear.two, mute: true } });
  assert.ok(two.won && stats.won); assert.ok(two.share > .05 && two.share < .2, `two typical pets on the bear: ${(two.share * 100).toFixed(1)}% of the damage`); assert.equal(stats.share, 0);
  assert.ok(two.seconds < stats.seconds * 1.1, 'the fight is not slower with them');
  assert.ok(two.saved > 0 && two.saved / (two.taken + two.saved) < .35, `guards took off ${(two.saved / (two.taken + two.saved) * 100).toFixed(0)}% of the damage`);
  const best = sum(shadow, { pets: { ids: BEST_PAIR, level: 10 } }), old = sum(shadow, { pets: { ids: BEST_PAIR, level: 10, before: true } });
  assert.ok(best.share < .3, `the best pair at +10 on the Shadow Lord: ${(best.share * 100).toFixed(1)}%`); assert.ok(old.share > .5, `before: ${(old.share * 100).toFixed(1)}%`);
  const pack = sum(bear, { pets: { ids: PET_SETS.bear.two } }, PACKS.bear); assert.ok(pack.won && pack.share < .25 && pack.taken > 0, 'a pack with ranged creatures still hurts');
});
