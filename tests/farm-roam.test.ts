import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRoamer, roamRadius, spacing, stepRoamer, type RoamArea, type RoamKind } from '../src/farm-roam.ts';

test('mixed species keep the same separation regardless of herd iteration order or age', () => {
  const kinds: RoamKind[] = ['chicken', 'duck', 'cow', 'pig', 'dog'];
  for (const kindA of kinds) for (const kindB of kinds) for (const youngA of [false, true]) for (const youngB of [false, true]) {
    const a = { kind: kindA, young: youngA }, b = { kind: kindB, young: youngB };
    assert.equal(spacing(a, b), spacing(b, a), `${kindA}/${kindB}, young=${youngA}/${youngB}`);
    assert.ok(spacing(a, b) >= roamRadius(a) + roamRadius(b), 'bodies do not overlap');
  }
});

function random(seed: number) { return () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646; }
const stones = [{ x: 0, z: 0, r: 2.3 }, { x: 6, z: -4, r: 1.5 }, { x: -6, z: -4, r: 1.5 }, { x: -6, z: 6, r: 1.5 }, { x: 7, z: 6, r: 1.2 }];
function area(obstacles: boolean): RoamArea {
  return {
    radius: 16,
    home: { x: -8, z: -8, rx: 3, rz: 2 },
    blocked: (x, z, r) => Math.hypot(x, z) > 16 - r || obstacles && stones.some(o => Math.hypot(x - o.x, z - o.z) < o.r + r),
  };
}

function simulate(kind: RoamKind, young: boolean, obstacles: boolean, seed: number, duration = 7_200) {
  const rng = random(seed), ground = area(obstacles), w = newRoamer(1, kind, young, { x: -9, z: -7 }, rng);
  const dt = .1, visits = new Set<string>(), activities = new Set<string>();
  let walking = 0, grazing = 0, walked = 0, walks = 0, longestRest = 0, rest = 0;
  for (let i = 0; i < duration / dt; i++) {
    const wasWalking = w.walking, x = w.x, z = w.z;
    if (wasWalking) { walking += dt; rest = 0; }
    else { rest += dt; longestRest = Math.max(longestRest, rest); if (w.rest === 'graze') grazing += dt; activities.add(w.rest); }
    stepRoamer(w, [w], ground, rng, dt, null);
    if (!wasWalking && w.walking) walks++;
    if (wasWalking) walked += Math.hypot(w.x - x, w.z - z);
    if (i % 10 === 0) visits.add(`${Math.floor(w.x / 3)},${Math.floor(w.z / 3)}`);
    assert.ok(!ground.blocked(w.x, w.z, roamRadius(w)), 'the animal stays on free ground');
    const top = (kind === 'cow' ? .45 : .8) * (young ? 1.15 : 1);
    assert.ok(w.speed <= top + 1e-9, 'walking speed stays unchanged');
  }
  return { walking, grazing, walked, walks, longestRest, visits, activities, ratio: grazing / walking };
}

for (const young of [false, true]) for (const obstacles of [false, true]) {
  test(`${young ? 'calves' : 'cows'} graze three times as long as they walk ${obstacles ? 'among obstacles' : 'on open ground'}`, () => {
    for (const seed of [1, 904, 72109]) {
      const result = simulate('cow', young, obstacles, seed);
      assert.ok(result.ratio > 2.85 && result.ratio < 3.15, `seed ${seed}: graze/walk = ${result.ratio.toFixed(3)}`);
      assert.ok(result.walks >= 75, `seed ${seed}: cattle keep taking walks (${result.walks})`);
      assert.ok(result.walked > 400, `seed ${seed}: cattle continue moving around the village (${result.walked})`);
      assert.ok(result.visits.size > 15, `seed ${seed}: cattle visit different ground (${result.visits.size})`);
      assert.ok(result.longestRest < 300, `seed ${seed}: cattle never become stuck grazing (${result.longestRest})`);
    }
  });
}

test('a cow interrupted while grazing keeps its unused grazing time after fleeing', () => {
  const rng = random(28), ground = area(false), w = newRoamer(1, 'cow', false, { x: -9, z: -7 }, rng), dt = .1;
  // Observe a complete walk and the longer rest it earned.
  for (let i = 0; i < 3000 && !(w.rest === 'graze' && w.grazeDebt > 12); i++) stepRoamer(w, [w], ground, rng, dt, null);
  assert.equal(w.walking, false); assert.ok(w.grazeDebt > 12);
  const remaining = w.grazeDebt;
  stepRoamer(w, [w], ground, rng, dt, { x: w.x + .4, z: w.z });
  assert.equal(w.walking, true, 'the explorer still makes a cow step away');
  assert.ok(w.grazeDebt >= remaining, 'being interrupted cannot erase the remaining grazing time');
  for (let i = 0; i < 1000 && w.walking; i++) stepRoamer(w, [w], ground, rng, dt, null);
  assert.equal(w.rest, 'graze'); assert.ok(w.restT >= remaining, 'the cow resumes the grazing it still owes');
});

test('hens and chicks keep their pecking and resting behavior instead of the cattle pacing rule', () => {
  for (const young of [false, true]) {
    const result = simulate('chicken', young, true, young ? 814 : 92, 900);
    assert.equal(result.grazing, 0);
    assert.ok(result.activities.has('peck')); assert.ok(result.activities.has('sit'));
    if (!young) assert.ok(result.activities.has('dust'));
    assert.ok(result.walks >= 25); assert.ok(result.walked > 100);
  }
});
