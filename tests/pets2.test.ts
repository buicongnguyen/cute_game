// Two pet slots and the guard dog as a pet (src/pet-slots.ts): equip rules, stats, the save migration (client and
// server accounts), the dog coming along only while worn, the garden guard staying as it was, and both pets fighting
// on their own cooldowns offline and on the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as T from 'three';
import * as M from '../src/model.ts';
import { applyGameAction, ActionError } from '../src/actions.ts';
import { CombatSimulation, type CombatHit, type CombatHost, type CombatTarget } from '../src/combat.ts';
import { FarmPenView } from '../src/farm-view.ts';
import { GuardDogs } from '../src/dog-world.ts';
import { PetCompanion } from '../src/pet-world.ts';
import { PET_SIDE, PET2_SIDE, petTrail } from '../src/pet-pen.ts';
import { DOG_TOSS_CD, DOG_TOSS_RANGE, DOG_TOSS_FLIGHT, dogTossFactor, trailSpot } from '../src/guard-dog.ts';
import { bagSlotsUsed, bagCapacity } from '../src/storage-slots.ts';
import { giveGear } from '../src/friends.ts';
import { friendSlot } from '../src/friends-state.ts';
import { wearables } from '../src/house-ui.ts';
import { isSpecial } from '../src/special-offers.ts';
import { TESTER_ITEMS } from '../src/tester.ts';
import { upgradableGear } from '../src/upgrades.ts';
import { dyeIds, baseOf } from '../src/dye-skins.ts';
import { collectibleItems } from '../src/house-activities.ts';
import { mergeParts } from '../src/avatar-merge.ts';
import { perfFlags } from '../src/perf-flags.ts';
import { rememberAccount } from '../server/account-cache.mjs';
import { createAccountStore } from '../server/account-store.mjs';
import { createCombatAuthority } from '../server/combat-authority.mjs';
import { enemyRoster } from '../src/enemy-roster.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { PETS2_VI, PETS2_ITEMS_VI } from '../src/locales/vi-pets2.ts';

const now = 1_700_000_000_000;
const DOG = M.DOG_PET;
/** A levelled explorer with a built pen (no dog yet). */
const hero = () => { const s = M.newGame(); s.level = 45; s.energy = 500_000; s.farm.built = true; return s; };
const give = (s: M.SaveState, ...ids: string[]) => { for (const id of ids) s.bag[id] = (s.bag[id] ?? 0) + 1; return s; };
const withDog = () => { const s = hero(); assert.ok(M.buyAnimal(s, 'dog', now)); return s; };
/** The save as a build from before pets had two slots wrote it: no dog item anywhere, no second slot. */
function oldSave(s: M.SaveState) {
  const raw = JSON.parse(JSON.stringify(s));
  delete raw.bag[DOG]; delete raw.chest?.[DOG]; delete raw.gear.pet2; if (raw.gear.pet === DOG) delete raw.gear.pet; if (raw.collection) delete raw.collection[DOG];
  return JSON.stringify(raw);
}
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;

// ------------------------------------------------------------------------------------------------ the item
test('the dog pet is a keepsake that lives at the pen: never sold, upgraded, dyed, offered, collected or lent', () => {
  const item = M.ITEMS[DOG];
  assert.equal(item.slot, 'pet'); assert.equal(item.type, 'pet'); assert.equal(item.keepsake, true); assert.equal(item.penned, true); assert.equal(item.sell, 0);
  assert.equal(item.name, 'Garden guard dog'); assert.equal(item.pet, undefined, 'no shot of its own: it tosses bones (guard-dog.ts)'); assert.equal(item.stats, undefined, 'no stats: the dog gave none before');
  assert.equal(isSpecial(DOG), false); assert.ok(!TESTER_ITEMS.some(i => i.id === DOG), 'not in the tester shop'); assert.equal(upgradableGear(DOG), false);
  assert.ok(!dyeIds().some(id => baseOf(id) === DOG), 'no dye recolours it'); assert.ok(!collectibleItems().includes(DOG));
  assert.equal(friendSlot(DOG), null); assert.equal(M.ITEMS.bunny.slot, 'pet'); assert.equal(M.ITEMS.bunny.keepsake, true, 'the bunny stays the starter pet it was');
  assert.ok(!Object.values(M.ITEMS).some(i => (i.slot as string) === 'pet2'), 'no item names the second slot: it takes pets');
});

// ------------------------------------------------------------------------------------------------ equip rules
test('two pets: the first takes slot 1, the second the free slot 2, a third replaces slot 1 unless a slot is named', () => {
  const s = give(hero(), 'bunny', 'pet_parrot', 'pet_sheep');
  assert.equal(M.equip(s, 'bunny'), true); assert.deepEqual(s.gear, { pet: 'bunny' });
  assert.equal(M.equip(s, 'pet_parrot'), true); assert.deepEqual(s.gear, { pet: 'bunny', pet2: 'pet_parrot' });
  assert.equal(M.equip(s, 'pet_sheep'), true); assert.deepEqual(s.gear, { pet: 'pet_sheep', pet2: 'pet_parrot' }, 'both full: slot 1 is replaced');
  assert.equal(M.equip(s, 'bunny', 'pet2'), true); assert.deepEqual(s.gear, { pet: 'pet_sheep', pet2: 'bunny' }, 'a named slot is the one replaced');
  assert.equal(M.unequip(s, 'pet'), true); assert.deepEqual(s.gear, { pet2: 'bunny' }, 'slot 2 alone is fine');
  assert.equal(M.equip(s, 'pet_parrot'), true); assert.deepEqual(s.gear, { pet: 'pet_parrot', pet2: 'bunny' }, 'the free slot, whichever it is');
  assert.equal(M.unequip(s, 'pet2'), true); assert.equal(M.unequip(s, 'pet2'), false, 'nothing there'); assert.equal(M.unequip(s, 'pet'), true); assert.deepEqual(s.gear, {}, 'alone');
});

test('the same pet is never worn twice from one copy: naming its other slot swaps; two copies may fill both', () => {
  const s = give(hero(), 'bunny', 'pet_parrot'); M.equip(s, 'bunny'); M.equip(s, 'pet_parrot');
  assert.equal(M.equip(s, 'bunny'), true); assert.deepEqual(s.gear, { pet: 'bunny', pet2: 'pet_parrot' }, 'already worn: nothing changes');
  assert.equal(M.equip(s, 'bunny', 'pet2'), true); assert.deepEqual(s.gear, { pet: 'pet_parrot', pet2: 'bunny' }, 'its only copy moves: the slots swap');
  assert.equal(M.unequip(s, 'pet'), true); assert.equal(M.equip(s, 'bunny', 'pet'), true); assert.deepEqual(s.gear, { pet: 'bunny' }, 'moved into the empty slot, not copied');
  assert.equal(M.looseQuantity(s, 'bunny'), 0);
  give(s, 'bunny'); assert.equal(M.looseQuantity(s, 'bunny'), 1);
  assert.equal(M.equip(s, 'bunny'), true); assert.deepEqual(s.gear, { pet: 'bunny', pet2: 'bunny' }, 'two owned: both slots');
  assert.equal(M.looseQuantity(s, 'bunny'), 0, 'both copies are worn'); assert.equal(M.sell(s, 'bunny', 1), 0);
  const loaded = reload(s); assert.deepEqual(loaded.gear, { pet: 'bunny', pet2: 'bunny' });
  // A save claiming the same pet twice with one copy keeps one.
  const raw = JSON.parse(JSON.stringify(s)); raw.bag.bunny = 1; assert.deepEqual(M.parseSave(JSON.stringify(raw))!.gear, { pet: 'bunny' });
});

test('a pet goes only in a pet slot and other gear never in one; bad slots and unowned pets are refused', () => {
  const s = give(hero(), 'bunny', 'hat_straw');
  assert.equal(M.equip(s, 'bunny', 'hat'), false); assert.equal(M.equip(s, 'hat_straw', 'pet2'), false); assert.equal(M.equip(s, 'hat_straw', 'pet'), false);
  assert.equal(M.equip(s, 'bunny', '__proto__' as M.GearSlot), false); assert.equal(M.equip(s, 'pet_parrot', 'pet2'), false, 'not owned');
  assert.deepEqual(s.gear, {}); assert.equal(M.equip(s, 'hat_straw', 'hat'), true); assert.equal(M.equip(s, 'bunny', 'pet2'), true); assert.deepEqual(s.gear, { hat: 'hat_straw', pet2: 'bunny' });
  assert.equal(M.unequip(s, 'constructor' as M.GearSlot), false);
  // A save with something that is not a pet in the second slot drops it.
  const raw = JSON.parse(JSON.stringify(s)); raw.gear.pet2 = 'hat_straw'; assert.equal(M.parseSave(JSON.stringify(raw))!.gear.pet2, undefined);
  // Level gates apply to the second slot as to the first.
  const young = give(M.newGame(), 'pet_t_eye'); const gated = M.gearLevel('pet_t_eye') > young.level;
  assert.equal(M.equip(young, 'pet_t_eye', 'pet2'), !gated);
});

test('stats from both pet slots count exactly as one pet\'s did', () => {
  const base = hero(), a = give(hero(), 'pet_b_dragon'), b = give(hero(), 'pet_b_mammoth'), both = give(hero(), 'pet_b_dragon', 'pet_b_mammoth');
  M.equip(a, 'pet_b_dragon'); M.equip(b, 'pet_b_mammoth'); M.equip(both, 'pet_b_dragon'); M.equip(both, 'pet_b_mammoth');
  assert.deepEqual(both.gear, { pet: 'pet_b_dragon', pet2: 'pet_b_mammoth' });
  const st = (s: M.SaveState) => M.activeStats(s, now), z = st(base);
  for (const key of ['attack', 'defense', 'maxHp', 'critChance'] as const) {
    const gain = (st(a)[key] - z[key]) + (st(b)[key] - z[key]);
    assert.ok(Math.abs(st(both)[key] - z[key] - gain) < 1e-9, `${key}: the two pets add up`);
  }
  assert.equal(st(a).attack - z.attack, 12); assert.equal(st(b).maxHp - z.maxHp, 60);
  // The same numbers whichever slot holds which pet.
  const swapped = give(hero(), 'pet_b_dragon', 'pet_b_mammoth'); M.equip(swapped, 'pet_b_mammoth', 'pet'); M.equip(swapped, 'pet_b_dragon', 'pet2');
  assert.deepEqual(st(swapped), st(both));
  // The dog gives no stats, worn or not.
  const d = withDog(); assert.ok(M.dogWorn(d.gear)); assert.deepEqual(st(d), st(base));
});

// ------------------------------------------------------------------------------------------------ the dog as a pet
test('buying the guard dog grants its pet item worn in the free slot; with both slots taken it waits at the pen', () => {
  const s = hero(); assert.equal(s.bag[DOG], undefined); M.buyAnimal(s, 'dog', now);
  assert.equal(s.bag[DOG], 1); assert.deepEqual(s.gear, { pet: DOG });
  const one = give(hero(), 'bunny'); M.equip(one, 'bunny'); M.buyAnimal(one, 'dog', now); assert.deepEqual(one.gear, { pet: 'bunny', pet2: DOG });
  const two = give(hero(), 'bunny', 'pet_parrot'); M.equip(two, 'bunny'); M.equip(two, 'pet_parrot'); M.buyAnimal(two, 'dog', now);
  assert.deepEqual(two.gear, { pet: 'bunny', pet2: 'pet_parrot' }, 'the pets the player chose stay'); assert.equal(two.bag[DOG], 1, 'the dog is owned and can be brought along later');
  assert.equal(M.equip(two, DOG, 'pet2'), true); assert.deepEqual(two.gear, { pet: 'bunny', pet2: DOG });
  // Through the shared action (what the server replays).
  const viaAction = hero(); applyGameAction(viaAction, { type: 'buyAnimal', payload: { kind: 'dog' } }, { now, random: () => .5 }); assert.deepEqual(viaAction.gear, { pet: DOG });
});

test('the dog item never takes a bag slot and cannot be lost: sold, stored, dropped in a bag, lent or kept without the dog', () => {
  const s = withDog(); assert.equal(M.unequip(s, 'pet'), true); assert.equal(s.bag[DOG], 1); assert.equal(M.looseQuantity(s, DOG), 1);
  assert.equal(bagSlotsUsed(s), 0, 'it lives at the pen, not in the backpack');
  assert.equal(M.sell(s, DOG, 1), 0); assert.equal(M.transfer(s, DOG, true), false); assert.equal(s.chest[DOG], undefined);
  s.friends = [{ id: 'pepper', role: 'cook', gear: {}, since: now } as unknown as NonNullable<M.SaveState['friends']>[number]];
  assert.equal(giveGear(s, 'pepper', DOG), false); assert.ok(!wearables(s).some(w => w.id === DOG));
  give(s, 'carrot'); s.settings.keepBagOnDeath = false; const bag = M.die(s, 30, 30, now);
  assert.deepEqual(bag?.items, { carrot: 1 }, 'the dropped bag holds the carrot, never the dog'); assert.equal(s.bag[DOG], 1);
  assert.equal(M.equip(s, DOG), true); assert.ok(M.dogWorn(s.gear));
  // A dog item without the pen's dog (an edited save) is not kept, in the bag, the chest or a slot.
  const fake = give(hero(), DOG); fake.gear.pet2 = DOG; fake.chest[DOG] = 1; const cleaned = reload(fake);
  assert.equal(cleaned.bag[DOG], undefined); assert.equal(cleaned.chest[DOG], undefined); assert.deepEqual(cleaned.gear, {});
  // Extra copies collapse to the one dog.
  const twin = withDog(); twin.bag[DOG] = 3; twin.gear.pet2 = DOG; const single = reload(twin); assert.equal(single.bag[DOG], 1); assert.deepEqual(single.gear, { pet: DOG });
});

test('a full bag: the dog can still be taken off and put back, and nothing else is pushed out', () => {
  const s = withDog(), ids = Object.keys(M.ITEMS).filter(id => !M.ITEMS[id].penned && !M.ITEMS[id].slot).slice(0, bagCapacity(s));
  for (const id of ids) s.bag[id] = 1;
  assert.equal(bagSlotsUsed(s), bagCapacity(s)); assert.equal(M.addItem(s, 'bunny'), false, 'the bag really is full');
  assert.equal(M.unequip(s, 'pet'), true, 'the dog goes back to its pen: no bag slot needed'); assert.equal(bagSlotsUsed(s), bagCapacity(s)); assert.equal(s.bag[DOG], 1);
  assert.equal(M.equip(s, DOG), true); assert.equal(Object.keys(s.bag).length, ids.length + 1);
  // An ordinary pet still needs its slot.
  const p = give(hero(), 'bunny'); M.equip(p, 'bunny'); for (const id of ids) p.bag[id] = 1; assert.equal(M.unequip(p, 'pet'), false);
});

test('the garden guard is unchanged whether the dog is worn or left at home', () => {
  const s = withDog(); assert.ok(M.dogWorn(s.gear));
  const worn = { has: M.hasGuardDog(s, now), bite: M.guardBiteDamage(s, now) };
  M.unequip(s, M.slotWearing(s.gear, DOG) as M.GearSlot); assert.equal(M.dogWorn(s.gear), false);
  assert.deepEqual({ has: M.hasGuardDog(s, now), bite: M.guardBiteDamage(s, now) }, worn); assert.equal(worn.has, true); assert.equal(worn.bite, 18);
  assert.equal(M.hasGuardDog(hero(), now), false); assert.equal(M.guardBiteDamage(hero(), now), 0);
  assert.equal(M.hasGuardDog(give(hero(), DOG), now), false, 'the item alone guards nothing: the pen\'s dog does');
});

test('the dog comes along only while its item is worn; left at home it stays at the pen wherever you go', () => {
  const s = withDog();
  const scene = new T.Scene(), farmView = new FarmPenView(3, { mobile: false });
  farmView.setArea({ home: { x: M.PEN.x, z: M.PEN.z, rx: M.YARD.rx, rz: M.YARD.rz }, radius: 15.2, blocked: () => false });
  const host = { scene, planet: 'home', position: new T.Vector3(30, 0, 0), facing: 0, boarded: false, time: 0, state: s, farmView, interior: null as unknown, remotePlayers: new Map() };
  const dogs = new GuardDogs(), run = (sec: number) => { for (let i = 0; i < sec * 30; i++) { host.time += 1 / 30; farmView.update(s.farm.animals, 1 / 30, host.time, now, host.position); dogs.update(host, 1 / 30); } };
  run(6); assert.equal(dogs.place, 'follow'); assert.equal(dogs.view.count, 1); assert.ok(farmView.isDogAway);
  M.unequip(s, 'pet'); run(.2); assert.equal(dogs.place, 'return', 'taken off in the wilds: it trots home');
  run(20); assert.equal(dogs.place, 'pen'); assert.equal(dogs.view.count, 0); assert.equal(farmView.isDogAway, false);
  host.planet = 'candy'; host.farmView = undefined as unknown as FarmPenView; host.position.set(40, 0, 40); run(2); assert.equal(dogs.place, 'pen', 'another planet without it: you are alone');
  M.equip(s, DOG, 'pet2'); run(1); assert.equal(dogs.place, 'follow', 'worn in the second slot it comes along just the same'); assert.equal(dogs.view.count, 1);
});

// ------------------------------------------------------------------------------------------------ migration
test('migration: a save that owns the dog gets the dog pet worn in the free slot, so it keeps following', () => {
  const plain = M.parseSave(oldSave(withDog()))!;
  assert.equal(plain.bag[DOG], 1); assert.deepEqual(plain.gear, { pet: DOG }, 'no pet before: slot 1');
  const pet = give(withDog(), 'pet_parrot'); pet.gear = { pet: 'pet_parrot' };
  const migrated = M.parseSave(oldSave(pet))!;
  assert.deepEqual(migrated.gear, { pet: 'pet_parrot', pet2: DOG }, 'slot 1 holds a pet: the dog takes slot 2'); assert.equal(migrated.bag.pet_parrot, 1);
  assert.ok(M.dogWorn(migrated.gear)); assert.ok(M.hasGuardDog(migrated, now));
});

test('migration: saves without a dog get nothing, and the second slot starts empty', () => {
  const none = M.parseSave(oldSave(hero()))!; assert.equal(none.bag[DOG], undefined); assert.deepEqual(none.gear, {});
  const pet = give(hero(), 'bunny'); pet.gear = { pet: 'bunny' }; const loaded = M.parseSave(oldSave(pet))!;
  assert.deepEqual(loaded.gear, { pet: 'bunny' }); assert.equal(loaded.gear.pet2, undefined); assert.equal(loaded.bag[DOG], undefined);
  assert.deepEqual(M.newGame().gear, {});
});

test('migration round trip: old -> new -> saved -> loaded is stable, and the player\'s later choice survives', () => {
  const pet = give(withDog(), 'pet_parrot', 'carrot'); pet.gear = { pet: 'pet_parrot' };
  const first = M.parseSave(oldSave(pet))!, second = reload(first), third = reload(second);
  assert.deepEqual(second.gear, first.gear); assert.deepEqual(second.bag, first.bag); assert.deepEqual(third, second, 'loading a migrated save changes nothing more');
  assert.deepEqual(JSON.parse(JSON.stringify(third.farm)), JSON.parse(JSON.stringify(first.farm)));
  // Left at home afterwards: it is not put back on by the next load.
  assert.equal(M.unequip(second, 'pet2'), true); const stays = reload(reload(second));
  assert.deepEqual(stays.gear, { pet: 'pet_parrot' }); assert.equal(stays.bag[DOG], 1, 'still owned');
  // Everything else in the old save is as it was.
  const before = JSON.parse(oldSave(pet)), after = JSON.parse(JSON.stringify(first));
  for (const key of ['level', 'energy', 'xp', 'name', 'planet', 'chest', 'plots']) assert.deepEqual(after[key], before[key], key);
  assert.deepEqual({ ...after.bag, [DOG]: undefined }, { ...before.bag, [DOG]: undefined });
});

test('migration with a full bag: the dog pet is worn, takes no slot, and every item is kept', () => {
  const s = withDog(), ids = Object.keys(M.ITEMS).filter(id => !M.ITEMS[id].penned && !M.ITEMS[id].slot).slice(0, bagCapacity(s));
  for (const id of ids) s.bag[id] = 2;
  give(s, 'pet_sheep'); s.gear = { pet: 'pet_sheep' };
  const loaded = M.parseSave(oldSave(s))!;
  assert.deepEqual(loaded.gear, { pet: 'pet_sheep', pet2: DOG }); assert.equal(bagSlotsUsed(loaded), bagCapacity(loaded), 'still exactly full: the dog took no slot');
  for (const id of ids) assert.equal(loaded.bag[id], 2, id);
  assert.equal(M.unequip(loaded, 'pet2'), true, 'and it can be left at home at once'); assert.equal(reload(loaded).bag[DOG], 1);
});

test('server accounts migrate the same way when they are loaded', () => {
  const pet = give(withDog(), 'bunny'); pet.gear = { pet: 'bunny' };
  const record = rememberAccount(new Map(), { id: 'a', username: 'a', profile: JSON.parse(oldSave(pet)) })!;
  assert.deepEqual(record.profile.gear, { pet: 'bunny', pet2: DOG }); assert.equal(record.profile.bag[DOG], 1);
  assert.deepEqual(record.profile, M.parseSave(oldSave(pet)), 'the same result as the client\'s own load');
  const nodog = rememberAccount(new Map(), { id: 'b', username: 'b', profile: JSON.parse(oldSave(hero())) })!; assert.deepEqual(nodog.profile.gear, {});
});

// ------------------------------------------------------------------------------------------------ actions (server replay)
test('equip and unequip of the second slot replay identically on the server\'s copy; malformed slots are refused', () => {
  const start = give(withDog(), 'bunny', 'pet_parrot'), client = reload(start), server = reload(start), context = () => ({ now, random: () => .5 });
  const steps = [
    { type: 'equip', payload: { id: 'bunny' } }, { type: 'equip', payload: { id: 'pet_parrot', slot: 'pet' } }, { type: 'equip', payload: { id: 'bunny', slot: 'pet2' } },
    { type: 'unequip', payload: { slot: 'pet2' } }, { type: 'equip', payload: { id: DOG, slot: 'pet2' } }, { type: 'unequip', payload: { slot: 'pet' } }, { type: 'equip', payload: { id: 'bunny' } },
  ];
  for (const step of steps) {
    const a = applyGameAction(client, step, context()), b = applyGameAction(server, JSON.parse(JSON.stringify(step)), context());
    assert.deepEqual(a, b, step.type); assert.deepEqual(JSON.parse(JSON.stringify(server)), JSON.parse(JSON.stringify(client)), `${step.type} ${JSON.stringify(step.payload)}`);
    assert.deepEqual(reload(server), reload(client));
  }
  assert.deepEqual(client.gear, { pet: 'bunny', pet2: DOG });
  const refused = (payload: Record<string, unknown>, type = 'equip') => { const copy = reload(client); assert.throws(() => applyGameAction(copy, { type, payload }, context()), ActionError, JSON.stringify(payload)); assert.deepEqual(copy.gear, client.gear); };
  refused({ id: 'pet_parrot', slot: 'hat' }); refused({ id: 'pet_parrot', slot: 7 }); refused({ id: 'pet_parrot', slot: 'pet3' }); refused({ id: 'pet_sheep', slot: 'pet2' });
  refused({ slot: 'pet3' }, 'unequip'); refused({ id: DOG, count: 1 }, 'sell'); refused({ id: DOG, toChest: true }, 'transfer');
});

// ------------------------------------------------------------------------------------------------ following
test('two companions trail on opposite sides, clear of each other and of the explorer; the dog keeps its own spot', () => {
  const player = { x: 50, z: 50 };
  for (const facing of [0, 1, Math.PI / 2, 3, -2]) {
    const a = petTrail(player, facing, PET_SIDE), b = petTrail(player, facing, PET2_SIDE), dog = trailSpot(player, facing);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 1.5, 'the two pets are apart'); assert.ok(Math.hypot(a.x - player.x, a.z - player.z) > 1 && Math.hypot(b.x - player.x, b.z - player.z) > 1, 'neither stands on the explorer');
    assert.ok(Math.hypot(a.x - dog.x, a.z - dog.z) > 1.5, 'the first pet is clear of the dog');
  }
  // Which pet is which: slot order without the dog; a pet beside the dog is always the first companion (the right side).
  assert.equal(M.companionId({ pet: 'bunny', pet2: 'pet_parrot' }, 0), 'bunny'); assert.equal(M.companionId({ pet: 'bunny', pet2: 'pet_parrot' }, 1), 'pet_parrot');
  assert.equal(M.companionId({ pet: DOG, pet2: 'bunny' }, 0), 'bunny'); assert.equal(M.companionId({ pet: DOG, pet2: 'bunny' }, 1), undefined);
  assert.equal(M.companionId({ pet: 'bunny', pet2: DOG }, 0), 'bunny'); assert.equal(M.companionId({ pet: 'bunny', pet2: DOG }, 1), undefined);
  assert.equal(M.companionId({ pet2: 'pet_parrot' }, 0), 'pet_parrot'); assert.equal(M.companionId({ pet: DOG }, 0), undefined); assert.equal(M.companionId({}, 0), undefined);
});

test('the companion controllers: both pets wait on different pen spots at home and follow on their own sides outside', () => {
  const s = give(hero(), 'pet_parrot', 'pet_dragon'); s.gear = { pet: 'pet_parrot', pet2: 'pet_dragon' }; // both perchers: the same spots to share
  const h = { companion: new T.Group(), companion2: new T.Group(), planet: 'home', position: new T.Vector3(-4, 0, 3), facing: 0, boarded: false, time: 0, state: s, farmView: { isBuilt: true }, interior: undefined as unknown, petStaysHome: () => false };
  const a = new PetCompanion(0), b = new PetCompanion(1), dt = 1 / 30, run = (sec: number) => { for (let i = 0; i < sec * 30; i++) { h.time += dt; a.update(h, dt); b.update(h, dt); } };
  let closest = Infinity;
  for (let i = 0; i < 60; i++) { run(1); if (a.link.resting && b.link.resting) closest = Math.min(closest, Math.hypot(a.link.x - b.link.x, a.link.z - b.link.z)); }
  assert.equal(a.place, 'pen'); assert.equal(b.place, 'pen'); assert.ok(closest > .8, `a minute at the pen: never on the same perch (closest ${closest.toFixed(2)} m)`);
  assert.equal(a.mayFight(h.planet, h.position), false); assert.equal(b.mayFight(h.planet, h.position), false);
  h.position.set(2, 0, 40); run(8);
  assert.equal(a.place, 'follow'); assert.equal(b.place, 'follow'); assert.ok(a.mayFight(h.planet, h.position) && b.mayFight(h.planet, h.position));
  const pa = h.companion.position, pb = h.companion2.position;
  assert.ok(pa.x > h.position.x + .5, 'the first pet on the right'); assert.ok(pb.x < h.position.x - .5, 'the second on the left'); assert.ok(Math.hypot(pa.x - pb.x, pa.z - pb.z) > 1.4);
  // One pet and the dog: the second controller has nothing to pose.
  s.gear = { pet: DOG, pet2: 'pet_parrot' }; run(1); assert.equal(a.place, 'follow'); assert.ok(h.companion.position.x > h.position.x + .5, 'the pet beside the dog keeps the right side');
  // None worn: nothing follows, nothing fights.
  s.gear = {}; run(1); const none = new PetCompanion(1); none.update(h, dt); assert.equal(none.place, 'pen');
});

// ------------------------------------------------------------------------------------------------ fighting
function arena() {
  const p = { x: 0, z: 0 }, targets: CombatTarget[] = [], hits: (CombatHit & { at: number })[] = []; let time = 0;
  const host: CombatHost = { position: () => p, facing: () => 0, face() {}, targets: () => targets, weapon: () => ({ kind: 'fist' }), stats: () => ({ attack: 10, critChance: 0 }), move() {}, effect() {}, moving: () => false, hit: (t, h) => { hits.push({ ...h, at: time }); t.hp -= h.amount; }, heal() {} };
  const sim = new CombatSimulation(host, () => .5), target = { id: 'foe', x: 0, z: 5, hp: 1e9, maxHp: 1e9, boss: false, radius: .5, phase: 'chase' }; targets.push(target);
  return { host, sim, hits, target, run: (sec: number) => { for (let t = 0; t < sec - 1e-6; t += .025) { time += .025; sim.update(.025); } } };
}

test('two pets shoot on their own cooldowns: together they deal the sum of what each deals alone', () => {
  const A = { x: 1, z: 0, dmg: .6, cd: 1, shot: 'fire' }, B = { x: -1, z: 0, dmg: .3, cd: 1.5, shot: 'ice' }, seconds = 60;
  const solo = (pet: typeof A, second = false) => { const a = arena(); if (second) a.host.pet2 = () => pet; else a.host.pet = () => pet; a.run(seconds); return a.hits; };
  const first = solo(A), second = solo(B), viaSlot2 = solo(A, true), both = arena(); both.host.pet = () => A; both.host.pet2 = () => B; both.run(seconds);
  assert.equal(viaSlot2.length, first.length, 'slot 2 shoots exactly as slot 1 does');
  assert.equal(both.hits.length, first.length + second.length); assert.ok(first.length >= 58 && second.length >= 38);
  const sum = (hits: CombatHit[]) => hits.reduce((n, h) => n + h.amount, 0);
  assert.ok(Math.abs(sum(both.hits) - sum(first) - sum(second)) < 1e-6);
  assert.ok(both.hits.every(h => h.helper), 'pet damage stays helper damage (timed challenges ignore it)');
  assert.deepEqual([...new Set(both.hits.map(h => h.amount))].sort(), [3, 6], 'each pet keeps its own damage');
  // A slow pet never delays a fast one: the fast pet's rhythm is the same with or without the second.
  const rhythm = (hits: { amount: number; at: number }[]) => hits.filter(h => h.amount === 6).map(h => +h.at.toFixed(2));
  assert.deepEqual(rhythm(both.hits), rhythm(first));
  both.sim.reset(); both.host.pet = () => null; both.host.pet2 = () => null; const n = both.hits.length; both.run(5); assert.equal(both.hits.length, n, 'none worn: you fight alone');
});

test('a pet and the dog fight side by side, and the dog keeps its numbers', () => {
  assert.equal(DOG_TOSS_RANGE, 7); assert.equal(DOG_TOSS_CD, 2.5); assert.equal(DOG_TOSS_FLIGHT, .5);
  assert.equal(dogTossFactor(1), .25); assert.ok(Math.abs(dogTossFactor(31) - .325) < 1e-12); assert.ok(Math.abs(dogTossFactor(200) - .375) < 1e-12);
  const a = arena(); a.host.pet = () => ({ x: 1, z: 0, dmg: .6, cd: 1, shot: 'fire' }); a.host.dog = () => ({ x: -1, z: 0, dmg: dogTossFactor(1), cd: DOG_TOSS_CD });
  a.run(30); const pet = a.hits.filter(h => h.amount === 6).length, thrown = a.hits.filter(h => h.amount !== 6), bones = thrown.length;
  assert.ok(thrown.every(h => h.amount === 3 && h.helper), 'a bone lands for a quarter of your attack (10 x .25, rounded as every hit is)');
  assert.ok(pet >= 28); assert.ok(bones >= 11 && bones <= 12, `${bones} bones in 30 s at one per 2.5 s`);
});

test('online: the server shoots for both worn pets, for the dog only when worn, and for nobody at home', async t => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'cute-pets2-')), store = await createAccountStore({ dataDir, databaseUrl: '' });
  const profile = give(withDog(), 'pet_t_turtle', 'pet_firefly'); profile.gear = { pet: 'pet_t_turtle', pet2: 'pet_firefly' };
  const account = await store.create({ id: 'actor', username: 'actor', hash: 'h', salt: 's', profile, friends: [], requests: [], profileRevision: 0 });
  const peer = { account, active: true, visit: null as unknown, planet: 'home', room: 'public:home', pose: { x: -30, z: 0, facing: 0, moving: false, dog: null as number | null }, socket: {} }, peers = new Map([['actor', peer]]);
  const room = { id: peer.room, members: new Set(['actor']), host: 'actor', enemies: [], killed: new Set() }, rooms = new Map([[room.id, room]]);
  const effects: { kind: string; color?: string }[] = [];
  const authority = createCombatAuthority({ store, peers, rooms, remember: (v: unknown) => v, onError: (e: Error) => t.diagnostic(e.stack ?? ''), send() {}, broadcast: (_: unknown, m: { type: string; visual?: { kind: string } }) => { if (m.type === 'effect' && m.visual) effects.push(m.visual); }, onDeath() {} });
  t.after(async () => { await authority.close(); await store.close(); });
  const definition = enemyRoster('home').find(e => e.type === 'mushroom')!;
  authority.acceptSnapshots(room, [{ id: definition.id, type: 'mushroom', x: -30, z: 5, hp: 1 }]); const enemy = authority.state(room).enemies.get(definition.id)!; enemy.hp = enemy.maxHp = 1e6; enemy.phase = 'chase';
  const engine = authority.engineFor(peer), run = (sec: number) => { for (let i = 0; i < sec * 20; i++) engine.sim.update(.05); }, casts = () => effects.filter(e => e.kind === 'cast').length;
  const two = (() => { const c = casts(); run(13); return casts() - c; })();
  const turtle = M.ITEMS.pet_t_turtle.pet!.cd!, firefly = M.ITEMS.pet_firefly.pet!.cd!, expected = 13 / turtle + 13 / firefly;
  assert.ok(Math.abs(two - expected) <= 3, `both pets cast: ${two} casts in 13 s, about ${expected.toFixed(1)} expected`);
  account.profile.gear = { pet: 'pet_t_turtle' }; engine.sim.reset();
  const one = (() => { const c = casts(); run(13); return casts() - c; })(); assert.ok(Math.abs(one - 13 / turtle) <= 2, `one pet: ${one} casts`); assert.ok(two > one + 5);
  // The dog: thrown for only while its item is worn (the pose flag alone is not enough).
  const tosses = () => effects.filter(e => e.kind === 'toss').length;
  peer.pose.dog = 0; let c = tosses(); run(8); assert.equal(tosses(), c, 'the dog is at home (not worn): no bones');
  account.profile.gear = { pet: 'pet_t_turtle', pet2: DOG }; c = tosses(); run(8); assert.ok(tosses() - c >= 2, 'worn: it throws');
  // Nobody fights from the safe village.
  peer.pose = { x: 0, z: 0, facing: 0, moving: false, dog: null }; engine.sim.reset(); const hp = enemy.hp; enemy.x = 2; enemy.z = 1; run(8); assert.equal(enemy.hp, hp);
});

// ------------------------------------------------------------------------------------------------ speed
test('a pet draws its same-look pieces as one mesh, and its wings stay their own so they still flap', () => {
  assert.equal(perfFlags.mergeCompanions, true);
  const pet = new T.Group(), piece = (name: string, color: string, x: number) => { const m = new T.Mesh(new T.BoxGeometry(.2, .2, .2), new T.MeshToonMaterial({ color })); m.name = name; m.position.x = x; pet.add(m); return m; };
  piece('body', '#ff0000', 0); piece('head', '#00ff00', .3); piece('beak', '#ffff00', .5);
  const wingL = piece('parrot_wing_l', '#0000ff', -.3), wingR = piece('parrot_wing_r', '#0000ff', .8); wingL.userData.animated = wingR.userData.animated = true;
  mergeParts(pet);
  assert.equal(pet.children.length, 3, 'body, head and beak became one mesh; the two wings are untouched');
  assert.ok(pet.children.includes(wingL) && pet.children.includes(wingR)); assert.equal(wingL.parent, pet);
  const merged = pet.children.find(c => c !== wingL && c !== wingR) as T.Mesh; assert.equal(merged.geometry.getAttribute('position').count, 3 * 36);
});

// ------------------------------------------------------------------------------------------------ words
test('the new strings are in the Vietnamese pack, and the stopgap switch\'s strings are gone', () => {
  for (const [en, vi] of Object.entries({ ...PETS2_VI, ...PETS2_ITEMS_VI })) { assert.equal(VI_PACK[en], vi, en); assert.notEqual(vi, en); }
  assert.ok(VI_PACK[M.ITEMS[DOG].name]); assert.ok(VI_PACK[M.ITEMS[DOG].desc]);
  for (const key of ['Second pet', 'Replace {name}', 'Leave at home']) assert.ok(PETS2_VI[key], key);
  assert.equal(VI_PACK['Guard dog follows me'], undefined);
});
