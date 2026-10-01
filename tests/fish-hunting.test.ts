import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { FISH_PER_WATER } from '../src/fishing.ts';
import { huntingPonds, huntingPondAt, fishHuntTargets, fishHuntTarget, fishHuntKey, huntFish, parseHunting, FISH_HUNT_COOLDOWN_MS, FISH_HUNT_RESTOCK_MS, type FishHuntIntent } from '../src/fish-hunting.ts';

const NOW = 1_000_000, pond = huntingPonds('home')[0], shore = { x: pond.x, z: pond.z + pond.rz + .6 };
function game() { const s = M.newGame(); s.bag.harpoon = 1; s.gear.weapon = 'harpoon'; return s; }
function intent(now = NOW, slot = 0): FishHuntIntent { return { weaponId: 'harpoon', pondId: pond.id, slot, aim: fishHuntTarget(pond, slot, now)! }; }
function miss(now = NOW): FishHuntIntent { const shot = intent(now), dx = shot.aim.x - pond.x, dz = shot.aim.z - pond.z, d = Math.hypot(dx, dz); shot.aim = { x: pond.x - dx / d * pond.rx * .9, z: pond.z - dz / d * pond.rz * .9 }; return shot; }

test('canonical hunt ponds retain the world geometry, IDs and ordinary fish counts', () => {
  assert.deepEqual(huntingPonds('home').map(p => [p.id, p.x, p.z, p.rx, p.rz]), [['home:fish:0', -7.5, 11.2, 3.3, 3.3], ['home:fish:1', 10, 52, 9, 9], ['home:fish:2', 40, 105, 11, 11], ['home:fish:3', -70, 35, 8, 8], ['home:fish:4', -105, -30, 7, 7]]);
  assert.deepEqual(huntingPondAt('home', pond.x, pond.z), pond); assert.equal(huntingPondAt('ice', pond.x, pond.z), null);
  for (const planet of ['home', 'candy', 'ice', 'toy', 'jungle', 'shadow']) for (const water of huntingPonds(planet)) {
    const targets = fishHuntTargets(water, NOW); assert.equal(targets.length, FISH_PER_WATER[water.waterId]);
    assert.deepEqual(targets, fishHuntTargets(water, NOW));
    for (const target of targets) { assert.notEqual(M.FISH[target.id].rarity, 'junk'); assert.ok(M.FISH_WEIGHTS[water.waterId].some(([id]) => id === target.id)); assert.ok(Math.hypot((target.x - water.x) / water.rx, (target.z - water.z) / water.rz) < 1); assert.ok(Number.isFinite(target.facing)); assert.ok(target.size >= M.FISH[target.id].size[0] && target.size <= M.FISH[target.id].size[1]); }
    const later = fishHuntTargets(water, NOW + 1000); assert.deepEqual(later.map(t => [t.id, t.size]), targets.map(t => [t.id, t.size])); assert.notEqual(later[0].x, targets[0].x);
  }
  for (const planet of ['lava', 'ocean', 'cloud', 'constructor', 'unknown']) assert.deepEqual(huntingPonds(planet), []);
});

test('a confirmed hit grants the canonical fish immediately through normal XP/journal rules without consuming the harpoon', () => {
  const s = game(), target = intent().aim as ReturnType<typeof fishHuntTarget> & {}, manual = game();
  M.grantCatch(manual, target.id, target.size, false);
  const result = huntFish(s, { ...intent(), id: 'fish_whale', size: 999999, huge: true } as FishHuntIntent, shore, NOW)!;
  assert.equal(result.hit, true); assert.equal(result.id, target.id); assert.equal(result.size, target.size); assert.equal(result.huge, false);
  assert.deepEqual(s.bag, manual.bag); assert.equal(s.xp, manual.xp); assert.deepEqual(s.fishRecords, manual.fishRecords); assert.deepEqual(s.counters, manual.counters); assert.equal(s.bag.harpoon, 1);
  assert.equal(s.hunting!.readyAt[fishHuntKey(pond.id, 0)], NOW + FISH_HUNT_RESTOCK_MS);
});

test('shot and per-slot restock cooldowns survive reload, and other slots become available on the exact shot boundary', () => {
  let s = game(); assert.ok(huntFish(s, intent(), shore, NOW));
  s = M.parseSave(JSON.stringify(s))!; const saved = structuredClone(s);
  assert.equal(huntFish(s, intent(NOW + FISH_HUNT_COOLDOWN_MS - 1, 1), shore, NOW + FISH_HUNT_COOLDOWN_MS - 1), null); assert.deepEqual(s, saved);
  assert.equal(huntFish(s, intent(NOW + FISH_HUNT_COOLDOWN_MS), shore, NOW + FISH_HUNT_COOLDOWN_MS), null, 'caught slot is still empty');
  assert.ok(huntFish(s, intent(NOW + FISH_HUNT_COOLDOWN_MS, 1), shore, NOW + FISH_HUNT_COOLDOWN_MS));
  assert.ok(huntFish(s, intent(NOW + FISH_HUNT_RESTOCK_MS), shore, NOW + FISH_HUNT_RESTOCK_MS));
});

test('a legal miss consumes only the shot cooldown, including the first shot at time zero', () => {
  const s = game(); s.hunting = { lastShotAt: 0, readyAt: {} }; const before = structuredClone(s);
  const result = huntFish(s, miss(0), shore, 0)!; assert.equal(result.hit, false); assert.equal(result.readyAt, 0);
  assert.deepEqual(s.bag, before.bag); assert.deepEqual(s.fishRecords, before.fishRecords); assert.equal(s.xp, before.xp); assert.deepEqual(s.hunting!.readyAt, {});
  assert.equal(huntFish(s, intent(0, 1), shore, 0), null); assert.equal(huntFish(s, intent(1299, 1), shore, 1299), null);
  assert.ok(huntFish(s, intent(1300, 1), shore, 1300));
});

test('invalid targets, invalid clocks, absent or unequipped tools, disguises and unreachable shots cannot mutate state', () => {
  for (const condition of ['absent', 'unequipped', 'bow', 'dead', 'disguise', 'planet', 'slot', 'pond', 'aim', 'offwater', 'far', 'negative', 'nan', 'unsafe']) {
    const s = game(), shot = intent(); let from = shore, now = NOW;
    if (condition === 'absent') delete s.bag.harpoon; if (condition === 'unequipped') delete s.gear.weapon; if (condition === 'bow') { s.gear.weapon = shot.weaponId = 'bow_star'; s.bag.bow_star = 1; }
    if (condition === 'dead') s.hp = 0; if (condition === 'disguise') s.gear.disguise = 'dz_dino'; if (condition === 'planet') s.planet = 'ice';
    if (condition === 'slot') shot.slot = 999; if (condition === 'pond') shot.pondId = '__proto__'; if (condition === 'aim') shot.aim = { x: NaN, z: 0 }; if (condition === 'offwater') shot.aim = { x: 0, z: 0 }; if (condition === 'far') from = { x: 1000, z: 1000 };
    if (condition === 'negative') now = -1; if (condition === 'nan') now = NaN; if (condition === 'unsafe') now = Number.MAX_SAFE_INTEGER;
    const before = structuredClone(s); assert.equal(huntFish(s, shot, from, now), null, condition); assert.deepEqual(s, before, condition);
  }
});

test('a failed inventory grant does not consume the fish, shot cooldown, or XP', () => {
  const s = game(), target = fishHuntTarget(pond, 0, NOW)!; s.bag[target.id] = Number.MAX_SAFE_INTEGER; const before = structuredClone(s);
  assert.equal(huntFish(s, intent(), shore, NOW), null); assert.deepEqual(s, before);
  assert.throws(() => applyGameAction(s, { type: 'fishHunt', payload: { ...intent(), from: shore } }, { now: NOW, random: () => .5 })); assert.deepEqual(s, before);
});

test('hunting save migration bounds known slots and clears future-clock corruption without a permanent rolling lock', () => {
  assert.equal(M.parseSave(JSON.stringify(M.newGame()))!.hunting, undefined);
  const key = fishHuntKey(pond.id, 0), good = { lastShotAt: NOW, readyAt: { [key]: NOW + FISH_HUNT_RESTOCK_MS }, hasShot: true };
  assert.deepEqual(parseHunting(good, NOW), good);
  const raw = { lastShotAt: NOW + 1_000_000, hasShot: true, readyAt: { [key]: NOW + 1_000_000, 'home:fish:0:999': NOW, '__proto__': NOW } };
  const parsed = parseHunting(raw, NOW)!; assert.deepEqual(parsed, { lastShotAt: 0, readyAt: {} });
  const s = game(); s.hunting = parsed; assert.ok(huntFish(s, intent(), shore, NOW));
  assert.deepEqual(parseHunting({ lastShotAt: NaN, readyAt: [] }, NOW), { lastShotAt: 0, readyAt: {} });
});

test('offline fishHunt action grants once and validates the provided player position', () => {
  const s = game(); const result = applyGameAction(s, { type: 'fishHunt', payload: { ...intent(), from: shore } }, { now: NOW, random: () => .5 }) as { hit: boolean; id: string };
  assert.equal(result.hit, true); assert.equal(s.bag[result.id], 1);
  const before = structuredClone(s); assert.throws(() => applyGameAction(s, { type: 'fishHunt', payload: { ...intent(NOW + 1300, 1), from: null } }, { now: NOW + 1300, random: () => .5 })); assert.deepEqual(s, before);
});
