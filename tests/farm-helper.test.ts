import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as H from '../src/farm-helper.ts';
import { HELPER_COST } from '../src/helper-state.ts';
import { applyGameAction } from '../src/actions.ts';

const T0 = 1_000_000;
function game(owned = true) {
  const s = M.newGame(); s.level = 30; s.energy = 100_000; s.farm.built = true;
  if (owned) assert.equal(H.buyFarmHelper(s), 'bought');
  return s;
}
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}, now = T0) => applyGameAction(s, { type, payload }, { now, random: () => .5 });

test('the pen robot costs exactly the garden robot price once and requires a built home pen', () => {
  const s = game(false), energy = s.energy;
  assert.equal(H.HELPER_COST, HELPER_COST); assert.equal(H.buyFarmHelper(s), 'bought'); assert.equal(s.energy, energy - 1000);
  assert.equal(H.buyFarmHelper(s), 'owned'); assert.equal(s.energy, energy - 1000);
  assert.deepEqual(H.helperOf(s), { owned: true, paused: false, autoFeed: false });
  for (const reason of ['energy', 'away', 'unbuilt'] as const) {
    const blocked = game(false); if (reason === 'energy') blocked.energy = 999; else if (reason === 'away') blocked.planet = 'ice'; else blocked.farm.built = false;
    const before = structuredClone(blocked); assert.equal(H.buyFarmHelper(blocked), reason); assert.deepEqual(blocked, before);
  }
});

test('helper state round-trips independently of the garden robot and old/malformed saves default safely', () => {
  const s = game(); H.setFarmHelperPaused(s, true); H.setFarmHelperAutoFeed(s, true);
  assert.deepEqual(H.helperOf(M.parseSave(JSON.stringify(s))!), H.helperOf(s)); assert.equal(s.helper, undefined);
  delete s.farm.helper; const before = structuredClone(s); assert.deepEqual(H.helperOf(s), { owned: false, paused: false, autoFeed: false }); assert.deepEqual(s, before);
  assert.deepEqual(H.helperOf(M.parseSave(JSON.stringify(s))!), H.helperOf(s));
  const malformed = { ...s, farm: { ...s.farm, helper: { owned: 'yes', paused: 1, autoFeed: 'true' } } };
  assert.deepEqual(H.helperOf(M.parseSave(JSON.stringify(malformed))!), { owned: false, paused: false, autoFeed: false });
});

test('the helper collects all animal products and expired meat with the same grants and XP as manual collection', () => {
  for (const kind of ['chicken', 'duck', 'cow', 'pig'] as const) {
    const s = game(), a = M.buyAnimal(s, kind, T0)!, now = M.adultAt(a) + M.productDuration(a) * 2, manual = structuredClone(s);
    const expected = M.collectProducts(manual, now, [a.uid]);
    assert.deepEqual(H.helperCollect(s, a.uid, now), expected); assert.equal(expected.length, 2); assert.deepEqual(s, manual);
    const dead = game(), animal = M.buyAnimal(dead, kind, T0)!, expiration = M.expiresAt(animal);
    assert.deepEqual(H.helperCollect(dead, animal.uid, expiration), [{ uid: animal.uid, kind, item: 'meat' }]);
    assert.equal(dead.farm.animals.length, 0); assert.deepEqual(H.helperCollect(dead, animal.uid, expiration), []);
  }
});

test('catch-up gathers existing capped stock once, never invents cycles, buys replacements, or feeds by default', () => {
  const s = game(), bird = M.buyAnimal(s, 'chicken', T0)!, expired = M.buyAnimal(s, 'cow', 0)!;
  // Keep the bird alive while the much older cow is ready as meat.
  bird.bornAt = bird.acquiredAt = M.ANIMAL_LIFESPAN_MS; bird.cycleAt = M.adultAt(bird);
  const now = bird.cycleAt + M.productDuration(bird) * 20; s.bag.carrot = 10;
  const energy = s.energy, nextId = s.farm.nextId;
  const result = H.catchUp(s, now); assert.equal(result.collected.filter(c => c.item === 'egg').length, 3); assert.equal(result.collected.filter(c => c.item === 'meat').length, 1);
  assert.ok(!s.farm.animals.some(a => a.uid === expired.uid)); assert.deepEqual(result.fed, []); assert.equal(s.bag.carrot, 10);
  assert.equal(s.energy, energy); assert.equal(s.farm.nextId, nextId); assert.deepEqual(H.catchUp(s, now), { collected: [], fed: [] });
  const limited = game(); for (let i = 0; i < 4; i++) M.buyAnimal(limited, 'chicken', T0);
  const cappedAt = M.adultAt(limited.farm.animals[0]) + M.productDuration(limited.farm.animals[0]) * 20;
  assert.equal(H.catchUp(limited, cappedAt, 2).collected.length, 6);
});

test('feeding requires opt-in, consumes only available crops once per eligible cycle, and never feeds dogs', () => {
  const s = game(), chicken = M.buyAnimal(s, 'chicken', T0)!, dog = M.buyAnimal(s, 'dog', T0)!; s.bag.carrot = 2;
  assert.equal(H.helperFeed(s, chicken.uid, T0), false); assert.equal(s.bag.carrot, 2);
  H.setFarmHelperAutoFeed(s, true); const energy = s.energy;
  assert.deepEqual(H.nextTask(s, M.PEN, T0), { kind: 'feed', uid: chicken.uid });
  assert.equal(H.helperFeed(s, chicken.uid, T0), true); assert.equal(H.helperFeed(s, chicken.uid, T0), false); assert.equal(H.helperFeed(s, dog.uid, T0), false);
  assert.equal(s.bag.carrot, 1); assert.equal(s.energy, energy);
  const ready = M.adultAt(chicken) + M.productDuration(chicken);
  const result = H.catchUp(s, ready); assert.equal(result.collected.length, 1); assert.deepEqual(result.fed, [chicken.uid]); assert.equal(s.bag.carrot, undefined);
  assert.deepEqual(H.catchUp(s, ready), { collected: [], fed: [] });
});

test('ready collection beats nearer feeding, uses stable UIDs, and skips full inventory without losing stock', () => {
  const s = game(), chicken = M.buyAnimal(s, 'chicken', T0)!, duck = M.buyAnimal(s, 'duck', T0)!;
  H.setFarmHelperAutoFeed(s, true); s.bag.carrot = 1; chicken.home = { x: 30, z: 30 }; duck.home = { x: 0, z: 0 };
  const now = M.adultAt(chicken) + M.productDuration(chicken);
  assert.deepEqual(H.nextTask(s, { x: 0, z: 0 }, now), { kind: 'collect', uid: chicken.uid });
  s.bag.egg = Number.MAX_SAFE_INTEGER; const before = structuredClone(s);
  assert.deepEqual(H.helperCollect(s, chicken.uid, now), []); assert.deepEqual(s, before);
  assert.deepEqual(H.nextTask(s, { x: 0, z: 0 }, now), { kind: 'feed', uid: duck.uid });
});

test('unowned, paused, unbuilt and away helpers cannot perform direct actions or catch up', () => {
  for (const mode of ['unowned', 'paused', 'unbuilt', 'away']) {
    const s = game(), animal = M.buyAnimal(s, 'chicken', T0)!, now = M.adultAt(animal) + M.productDuration(animal);
    H.setFarmHelperAutoFeed(s, true); s.bag.carrot = 5;
    if (mode === 'unowned') s.farm.helper!.owned = false; else if (mode === 'paused') s.farm.helper!.paused = true; else if (mode === 'unbuilt') s.farm.built = false; else s.planet = 'ice';
    const before = structuredClone(s);
    assert.equal(H.nextTask(s, M.PEN, now), null); assert.deepEqual(H.helperCollect(s, animal.uid, now), []); assert.equal(H.helperFeed(s, animal.uid, T0), false); assert.deepEqual(H.catchUp(s, now), { collected: [], fed: [] });
    for (const [type, payload] of [['farmHelperCollect', { uid: animal.uid }], ['farmHelperFeed', { uid: animal.uid }], ['farmHelperCatchUp', {}]] as const) assert.throws(() => act(s, type, payload, now));
    assert.deepEqual(s, before);
  }
});

test('helper action toggles reject ambiguous values and invalid clocks cannot consume feed or stock', () => {
  const s = game(), animal = M.buyAnimal(s, 'chicken', T0)!; s.bag.carrot = 2; H.setFarmHelperAutoFeed(s, true); const before = structuredClone(s);
  assert.throws(() => act(s, 'setFarmHelperPaused', { paused: 'false' })); assert.throws(() => act(s, 'setFarmHelperAutoFeed', { autoFeed: 1 }));
  for (const now of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) { assert.equal(H.helperFeed(s, animal.uid, now), false); assert.deepEqual(H.catchUp(s, now), { collected: [], fed: [] }); }
  assert.deepEqual(s, before);
});
