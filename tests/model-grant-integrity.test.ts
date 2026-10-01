import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';

test('a death bag is retained in full until every item can fit, including action retries', () => {
  const s = M.newGame();
  s.bag = { carrot: Number.MAX_SAFE_INTEGER, wood: 5 };
  s.dropped = { planet: 'home', x: 0, z: 0, items: { wood: 3, carrot: 1 } };
  const before = structuredClone(s);
  assert.equal(M.recoverBag(s), false);
  assert.deepEqual(s, before);
  assert.throws(() => applyGameAction(s, { type: 'recoverBag' }));
  assert.deepEqual(s, before);
  assert.ok(M.removeItem(s.bag, 'carrot'));
  assert.equal(M.recoverBag(s), true);
  assert.equal(s.bag.wood, 8);
  assert.equal(s.bag.carrot, Number.MAX_SAFE_INTEGER);
  assert.equal(s.dropped, null);
  assert.equal(M.recoverBag(s), false);
});

test('an unsuccessful decoration pickup preserves its placed object and collection', () => {
  const s = M.newGame();
  s.bag.deco_lamp = Number.MAX_SAFE_INTEGER;
  s.decorations.push({ uid: 'decor-1', id: 'deco_lamp', x: 7, z: 5, rotation: .4 });
  const before = structuredClone(s);
  assert.equal(M.removeDecoration(s, 'decor-1'), false);
  assert.deepEqual(s, before);
  M.removeItem(s.bag, 'deco_lamp');
  assert.equal(M.removeDecoration(s, 'decor-1'), true);
  assert.equal(s.decorations.length, 0);
  assert.equal(s.bag.deco_lamp, Number.MAX_SAFE_INTEGER);
});

test('failed mine and environment grants do not spend their resource cooldown or advance quests', () => {
  const s = M.newGame(); s.planet = 'candy'; s.bag.sugar = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(s), now = 1_000_000;
  assert.equal(M.claimMine(s, 0, now), false);
  assert.equal(M.claimEnvironmentResource(s, 'candy:sugar:0', 'sugar', now), false);
  assert.deepEqual(s, before);
  M.removeItem(s.bag, 'sugar', 2);
  assert.equal(M.claimMine(s, 0, now), true);
  assert.equal(M.claimEnvironmentResource(s, 'candy:sugar:0', 'sugar', now), true);
  assert.equal(s.bag.sugar, Number.MAX_SAFE_INTEGER);
});

test('invalid harvest clocks cannot bypass a crop growing deadline', () => {
  const s = M.newGame(); M.plant(s, 0, 'carrot', 1_000_000);
  const before = structuredClone(s);
  for (const now of [NaN, Infinity, -1]) assert.equal(M.harvest(s, 0, now), null);
  assert.deepEqual(s, before);
});
