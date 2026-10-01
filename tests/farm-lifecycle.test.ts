import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';

const start = 1_000_000;
function garden() { const s = M.newGame(); s.level = 25; s.energy = 100_000; s.farm.built = true; return s; }
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;

test('each pen level enforces its independent chicken/cow capacity, never above ten', () => {
  const limits = [[4, 2, 4, 4, 1], [7, 6, 7, 7, 1], [10, 10, 10, 10, 1]];
  for (let level = 0; level <= M.MAX_PEN_LEVEL; level++) {
    const s = garden();
    for (let i = 0; i < level; i++) assert.equal(M.expandPen(s), true);
    for (const [index, kind] of M.ANIMAL_KINDS.entries()) {
      const limit = limits[level][index];
      assert.equal(M.penCapacity(s, kind), limit);
      for (let i = 0; i < limit; i++) assert.ok(M.buyAnimal(s, kind, start));
      const funds = s.energy;
      assert.equal(M.buyAnimal(s, kind, start), null);
      assert.equal(M.canBuyAnimal(s, kind), 'full');
      assert.equal(s.energy, funds);
      assert.equal(M.animalCount(reload(s), kind), limit);
    }
  }
  const s = garden(); s.farm.penLevel = 99;
  assert.equal(M.penCapacity(s, 'chicken'), 10);
  assert.equal(M.penCapacity(s, 'cow'), 10);
  const animals = M.ANIMAL_KINDS.flatMap((kind, index) => Array.from({ length: 14 }, (_, i) => ({ uid: index * 100 + i + 1, kind, bornAt: start })));
  for (let level = 0; level <= 2; level++) {
    const parsed = M.parseFarm({ penLevel: level, animals });
    for (const [index, kind] of M.ANIMAL_KINDS.entries()) assert.equal(parsed.animals.filter(a => a.kind === kind).length, limits[level][index]);
    assert.ok(parsed.animals.every(a => a.acquiredAt === start), 'legacy arrival is inferred without resetting its life');
  }
});

test('offline expiry leaves collectible meat until collected exactly once, then frees the pen slot', () => {
  let s = garden();
  const chicken = M.buyAnimal(s, 'chicken', start)!, cow = M.buyAnimal(s, 'cow', start)!;
  const end = start + M.ANIMAL_LIFESPAN_MS;
  assert.equal(M.expiresAt(chicken), end);
  assert.equal(M.expired(chicken, end - 1), false);
  assert.equal(M.expired(chicken, end), true);
  assert.equal(M.lifetimeLeft(chicken, end - 1), 1);
  assert.equal(M.lifetimeLeft(chicken, end + 1_000_000), 0);
  s = reload(s); // Loading neither grants meat nor discards expired animals.
  assert.equal(s.farm.animals.length, 2);
  assert.equal(s.bag.meat, undefined);
  for (const a of s.farm.animals) {
    assert.equal(M.productFor(a, end), 'meat');
    assert.equal(M.productReady(a, end), true);
    assert.equal(M.productProgress(a, end), 1);
    assert.equal(M.timeLeft(a, end), 0);
    assert.equal(M.canFeed(a, end), false);
  }
  assert.deepEqual(M.readyAnimals(s, end).map(a => a.uid), [chicken.uid, cow.uid]);
  const got = M.collectProducts(s, end, [cow.uid, cow.uid, chicken.uid, chicken.uid]);
  assert.deepEqual(got, [{ uid: cow.uid, kind: 'cow', item: 'meat' }, { uid: chicken.uid, kind: 'chicken', item: 'meat' }]);
  assert.equal(s.bag.meat, 2); assert.equal(s.bag.egg, undefined); assert.equal(s.bag.milk, undefined);
  assert.equal(s.farm.animals.length, 0);
  assert.deepEqual(M.collectProducts(s, end + 1), []);
  assert.deepEqual(M.collectProducts(reload(s), end + 1), []);
  assert.ok(M.buyAnimal(s, 'cow', end + 1));
});

test('feeding changes growth and product timing but never the arrival or expiry time', () => {
  const s = garden(), a = M.buyAnimal(s, 'cow', start)!;
  M.addItem(s, 'carrot', 4);
  const end = M.expiresAt(a);
  assert.equal(M.feedAnimal(s, a.uid, start + 10_000), 'carrot');
  assert.ok(a.bornAt < start); assert.equal(a.acquiredAt, start); assert.equal(M.expiresAt(a), end);
  const adult = M.adultAt(a);
  assert.equal(M.feedAnimal(s, a.uid, adult), 'carrot');
  assert.equal(M.expiresAt(a), end); assert.equal(M.expiresAt(reload(s).farm.animals[0]), end);
  const crops = s.bag.carrot;
  assert.equal(M.feedAnimal(s, a.uid, end), null); assert.equal(s.bag.carrot, crops);
  assert.equal(M.feedAll(s, end), 0);
  const legacy = M.buyAnimal(s, 'chicken', start)!; delete legacy.acquiredAt;
  assert.equal(M.feedAnimal(s, legacy.uid, start), 'carrot');
  assert.equal(legacy.acquiredAt, start); assert.equal(M.expiresAt(legacy), end);
});

test('failed meat grants preserve the animal and XP; duplicate in-memory UIDs cannot duplicate meat', () => {
  const s = garden(), a = M.buyAnimal(s, 'chicken', start)!, end = M.expiresAt(a);
  s.bag.meat = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(s);
  assert.deepEqual(M.collectProducts(s, end), []);
  assert.deepEqual(s, before);
  s.bag.meat = 0;
  s.farm.animals.push({ ...a });
  assert.equal(M.collectProducts(s, end, [a.uid, a.uid]).length, 1);
  assert.equal(s.bag.meat, 1); assert.equal(s.farm.animals.length, 0);
  assert.deepEqual(M.collectProducts(s, end), []);
});

test('invalid clocks never buy, feed or grant products, and unsafe saved timestamps are rejected', () => {
  const s = garden(), a = M.buyAnimal(s, 'chicken', start)!;
  M.addItem(s, 'carrot', 3);
  const before = structuredClone(s);
  for (const now of [-1, NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
    assert.equal(M.buyAnimal(s, 'cow', now), null);
    assert.equal(M.feedAnimal(s, a.uid, now), null);
    assert.deepEqual(M.collectProducts(s, now), []);
    assert.equal(M.productReady(a, now), false);
    assert.equal(M.expired(a, now), false);
  }
  assert.equal(M.feedAnimal(s, a.uid, start - 1), null);
  assert.deepEqual(M.collectProducts(s, start - 1), []);
  assert.deepEqual(s, before);
  for (const badTime of [NaN, Infinity, -1, Number.MAX_VALUE]) {
    assert.equal(M.parseFarm({ animals: [{ ...a, acquiredAt: badTime }] }).animals.length, 0);
    assert.equal(M.parseFarm({ animals: [{ ...a, cycleAt: badTime }] }).animals.length, 0);
  }
  assert.equal(M.parseFarm({ animals: [{ ...a, bornAt: start, acquiredAt: start + M.ANIMAL_LIFESPAN_MS }] }).animals.length, 0);
  s.planet = 'ice'; assert.deepEqual(M.collectProducts(s, M.expiresAt(a)), []); assert.equal(s.farm.animals.length, 1);
});

test('late-life feeding still halves production time without changing the lifetime', () => {
  const s = garden(), a = M.buyAnimal(s, 'chicken', start)!, end = M.expiresAt(a);
  M.addItem(s, 'carrot');
  assert.equal(M.collectProducts(s, end - 10_000).length, 3);
  const now = end - 9_000, remaining = M.ANIMALS.chicken.productMs - 1_000;
  assert.equal(M.timeLeft(a, now), remaining);
  assert.equal(M.feedAnimal(s, a.uid, now), 'carrot');
  assert.equal(M.timeLeft(a, now), remaining / 2);
  assert.equal(M.lifetimeLeft(a, now), 9_000);
  assert.equal(M.expiresAt(a), end);
  assert.equal(M.productFor(a, end), 'meat');
});
