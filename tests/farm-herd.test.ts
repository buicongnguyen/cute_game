import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import * as M from '../src/model.ts';
import { BREEDS, buyAnimal, coatOf, coatPick, parseFarm, type Animal } from '../src/farm.ts';
import { FarmPenView, COATS } from '../src/farm-view.ts';
import { RoamGrid, newRoamer, roamRadius, spacing, spawnSpot, stepRoamer, type RoamArea, type Roamer } from '../src/farm-roam.ts';

function random(seed: number) { return () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646; }

test('each bought animal gets a stable breed that survives saving, and old saves get one from the id', () => {
  const s = M.newGame(); s.level = 25; s.energy = 1e6; s.farm.built = true; s.farm.penLevel = 2;
  const seen = { chicken: new Set<number>(), cow: new Set<number>() };
  for (let i = 0; i < 10; i++) for (const kind of ['chicken', 'cow'] as const) {
    const a = buyAnimal(s, kind, 1_000_000 + i * 7_919)!; assert.ok(a, 'bought');
    assert.ok(Number.isInteger(a.coat) && a.coat! >= 0 && a.coat! < BREEDS[kind].length); seen[kind].add(a.coat!);
  }
  assert.ok(seen.chicken.size >= 3 && seen.cow.size >= 3, `a pen shows several breeds (${seen.chicken.size} hens, ${seen.cow.size} cows)`);
  const again = parseFarm(JSON.parse(JSON.stringify(s.farm)));
  assert.deepEqual(again.animals.map(a => a.coat), s.farm.animals.map(a => a.coat), 'breeds persist through a save');
  // A save from before breeds: no coat (or a broken one) gets the id's pick, the same on every load.
  const legacy = s.farm.animals.map(({ coat: _coat, ...rest }) => rest);
  const first = parseFarm({ penLevel: 2, animals: legacy }), second = parseFarm({ penLevel: 2, animals: legacy });
  assert.deepEqual(first.animals.map(a => a.coat), second.animals.map(a => a.coat));
  for (const a of first.animals) assert.equal(a.coat, coatPick(a.kind, a.uid));
  assert.equal(parseFarm({ animals: [{ ...legacy[0], coat: 99 }] }).animals[0].coat, coatPick(legacy[0].kind, legacy[0].uid));
  assert.equal(coatOf({ kind: 'cow', uid: 3, coat: 2.5 }), coatPick('cow', 3));
  for (const kind of ['chicken', 'cow'] as const) assert.equal(new Set(Array.from({ length: 40 }, (_, uid) => coatPick(kind, uid + 1))).size, 5, 'ids spread over every breed');
});

const stones = [{ x: 0, z: 0, r: 2.3 }, { x: 6, z: -4, r: 1.5 }, { x: -6, z: 6, r: 1.5 }];
const area: RoamArea = { radius: 16, home: { x: -8, z: -8, rx: 4.3, rz: 2.9 }, blocked: (x, z, r) => Math.hypot(x, z) > 16 - r || stones.some(o => Math.hypot(x - o.x, z - o.z) < o.r + r) };
function herd(rng: () => number) {
  const out: Roamer[] = []; let uid = 1;
  for (const [kind, young, n] of [['chicken', false, 8], ['chicken', true, 2], ['cow', false, 4], ['cow', true, 2]] as const)
    for (let i = 0; i < n; i++) out.push(newRoamer(uid++, kind, young, spawnSpot(area, rng, kind, young, out), rng));
  return out;
}

test('a full pen keeps its spacing over a long run: hens 1.5 m and cows 3 m apart, nobody stacked', () => {
  for (const seed of [3, 4242]) {
    const rng = random(seed), all = herd(rng), grid = new RoamGrid(), dt = 1 / 30;
    let minHen = Infinity, minCow = Infinity, minAny = Infinity, yard = 0, samples = 0;
    for (let i = 0; i < 20 * 60 * 30; i++) {
      grid.build(all);
      for (const w of all) stepRoamer(w, all, area, rng, dt, null, grid);
      for (const w of all) assert.ok(!area.blocked(w.x, w.z, roamRadius(w) * .9), 'animals stay on free ground');
      if (i < 30 * 5 || i % 3) continue;
      samples++;
      for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
        const p = all[a], q = all[b], d = Math.hypot(p.x - q.x, p.z - q.z);
        minAny = Math.min(minAny, d / spacing(p, q));
        if (!p.young && !q.young && p.kind === q.kind) { if (p.kind === 'cow') minCow = Math.min(minCow, d); else minHen = Math.min(minHen, d); }
      }
      if (all.filter(w => ((w.x - area.home.x) / area.home.rx) ** 2 + ((w.z - area.home.z) / area.home.rz) ** 2 < 1).length > 8) yard++;
    }
    console.log(`seed ${seed}: closest hens ${minHen.toFixed(2)} m, cows ${minCow.toFixed(2)} m, worst pair ${(minAny * 100).toFixed(0)}% of its spacing, yard crowded ${(yard / samples * 100).toFixed(1)}%`);
    assert.ok(minHen >= 1.3, `hens keep ~1.5 m (${minHen})`);
    assert.ok(minCow >= 2.6, `cows keep ~3 m (${minCow})`);
    assert.ok(minAny > .75, `no pair ever piles up (${minAny})`);
    assert.ok(yard / samples < .05, 'the yard never holds most of the herd at once');
  }
});

test('two cows walking head-on pass each other instead of pressing together', () => {
  const rng = random(9), open: RoamArea = { radius: 30, home: { x: 0, z: -20, rx: 3, rz: 2 }, blocked: (x, z, r) => Math.hypot(x, z) > 30 - r };
  const a = newRoamer(1, 'cow', false, { x: 0, z: -5 }, rng), b = newRoamer(2, 'cow', false, { x: 0, z: 5 }, rng), all = [a, b];
  Object.assign(a, { walking: true, rest: 'none', goalX: 0, goalZ: 5, walkT: 60, heading: 0 });
  Object.assign(b, { walking: true, rest: 'none', goalX: 0, goalZ: -5, walkT: 60, heading: Math.PI });
  let closest = Infinity;
  for (let i = 0; i < 30 * 30 && (a.walking || b.walking); i++) { for (const w of all) stepRoamer(w, all, open, rng, 1 / 30, null); closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z)); }
  assert.ok(closest > 2.6, `they never overlap (closest ${closest.toFixed(2)} m)`);
  assert.ok(a.z > 0 || b.z < 0 || !a.walking, 'at least one gets past or settles, none stays jammed');
});

test('five breeds of each animal draw exactly as many instanced parts as a single breed', () => {
  const now = 10_000_000, make = (coats: number[]) => {
    const list: Animal[] = []; let uid = 1;
    for (const [kind, adult, n] of [['chicken', true, 8], ['chicken', false, 2], ['cow', true, 4], ['cow', false, 2]] as const)
      for (let i = 0; i < n; i++) { const grow = kind === 'cow' ? 120_000 : 60_000, born = adult ? now - grow - 1 : now - 1; list.push({ uid, kind, bornAt: born, acquiredAt: born, cycleAt: born + grow, coat: coats[uid++ % coats.length] }); }
    const view = new FarmPenView(); view.update(list, .1, 1, now, { x: 30, z: 30 });
    const meshes: T.InstancedMesh[] = []; view.animals.traverse(o => { if (o instanceof T.InstancedMesh && o.visible) meshes.push(o); });
    return { view, meshes };
  };
  const plain = make([0]), mixed = make([0, 1, 2, 3, 4]);
  assert.equal(mixed.meshes.length, plain.meshes.length, 'no extra draws for breeds');
  assert.equal(mixed.view.draws, plain.view.draws);
  const body = mixed.meshes.find(m => m.name === 'farm-cow:body')!, coat = body.geometry.getAttribute('coatA') as T.InstancedBufferAttribute;
  assert.ok(body.geometry.getAttribute('coatMask'), 'parts carry the coat mask');
  const colours = new Set(Array.from({ length: body.count }, (_, i) => [coat.getX(i), coat.getY(i), coat.getZ(i)].map(v => v.toFixed(3)).join()));
  assert.ok(colours.size >= 3, `cows wear different coats (${colours.size})`);
  for (const id of ['chicken', 'chick', 'cow', 'calf'] as const) assert.equal(COATS[id].length, 5, `${id}: one coat per breed`);
  // Only bodies cast shadows (heads merge into them at this camera).
  assert.ok(mixed.meshes.every(m => m.castShadow === m.name.endsWith(':body')));
});
