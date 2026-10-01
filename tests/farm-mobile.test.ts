import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { FarmPenView } from '../src/farm-view.ts';
import { ANIMALS, ANIMAL_KINDS, ANIMAL_LIFESPAN_MS, type Animal } from '../src/farm.ts';

const now = 1_000_000;
const open = { home: { x: 0, z: 0, rx: 8, rz: 8 }, radius: 50, blocked: () => false };
function herd(): Animal[] {
  const list: Animal[] = [];
  for (const kind of ANIMAL_KINDS) for (let i = 0; i < (kind === 'dog' ? 1 : 10); i++) {
    const bornAt = now - (i < 5 ? ANIMALS[kind].growMs + 1 : 1);
    list.push({ uid: list.length + 1, kind, bornAt, acquiredAt: bornAt, cycleAt: now, coat: i % 3 });
  }
  return list;
}
function view(mobile: boolean) { const v = new FarmPenView(7, { mobile }); v.setArea(open); return v; }
function mesh(v: FarmPenView, name: string) { return v.animals.getObjectByName(`farm-${name}`) as T.InstancedMesh; }
function shape(v: FarmPenView) {
  return v.animals.children.filter((m): m is T.InstancedMesh => m instanceof T.InstancedMesh && m.visible)
    .map(m => ({ name: m.name, count: m.count, vertices: m.geometry.getAttribute('position').count, indices: m.geometry.index?.count, shadow: m.castShadow }));
}

for (const hz of [60, 120]) test(`mobile keeps full herd detail but writes poses only 20 times/sec with ${hz} updates/sec`, () => {
  const list = herd(), desktop = view(false), phone = view(true);
  for (const v of [desktop, phone]) v.update(list, .05, 0, now);
  assert.deepEqual(shape(phone), shape(desktop), 'identical mesh detail, breed count and shadows');
  const d = mesh(desktop, 'cow:body'), p = mesh(phone, 'cow:body');
  const dv = d.instanceMatrix.version, pv = p.instanceMatrix.version;
  const coat = p.geometry.getAttribute('coatA') as T.InstancedBufferAttribute, cv = coat.version;
  for (let i = 1; i <= hz * 2; i++) for (const v of [desktop, phone]) v.update(list, 1 / hz, i / hz, now + i / hz * 1000);
  assert.equal(d.instanceMatrix.version - dv, hz * 2);
  assert.equal(p.instanceMatrix.version - pv, 40, 'held poses do not dirty GPU instance buffers');
  assert.equal(coat.version, cv, 'unchanged breed attributes are not uploaded again');
  assert.equal(phone.draws, desktop.draws, 'animation optimization adds no draw calls');
  desktop.dispose(); phone.dispose();
});

test('mobile makes casual roaming calmer while production, maturity and removals remain immediate', () => {
  const list: Animal[] = [{ uid: 1, kind: 'chicken', bornAt: now - 1, acquiredAt: now, cycleAt: now }];
  const phone = view(true); phone.update(list, .05, 1, now);
  assert.equal(mesh(phone, 'chick:body').count, 1);
  list[0].bornAt = now - ANIMALS.chicken.growMs;
  phone.update(list, .001, 1.001, now);
  assert.equal(mesh(phone, 'chicken:body').count, 1, 'growth does not wait for the next scheduled pose');
  assert.equal(mesh(phone, 'chick:body').visible, false);
  list[0].cycleAt = now - ANIMALS.chicken.productMs;
  phone.update(list, .001, 1.002, now);
  assert.equal(mesh(phone, 'product:egg').count, 1, 'a ready product appears immediately');
  const at = phone.positionOf(1)!;
  assert.equal(phone.pickAnimal(new T.Raycaster(new T.Vector3(at.x, 6, at.z), new T.Vector3(0, -1, 0))), 1);
  phone.update(list, .001, 1.003, now + ANIMAL_LIFESPAN_MS);
  assert.equal(mesh(phone, 'chicken:body').visible, false);
  assert.equal(mesh(phone, 'product:meat').count, 1, 'aging still uses the wall clock');
  phone.update([], .001, 1.004, now + ANIMAL_LIFESPAN_MS);
  assert.equal(phone.positionOf(1), null);
  assert.equal(mesh(phone, 'product:meat').visible, false);
  phone.dispose();

  const grown = herd().filter(a => a.uid <= 5), totals: number[] = [];
  for (const mobile of [false, true]) {
    const v = view(mobile); v.update(grown, .05, 0, now); let distance = 0, before = v.positions();
    for (let i = 1; i <= 3600; i++) {
      v.update(grown, 1 / 60, i / 60, now + i / 60 * 1000);
      const after = v.positions(); for (let j = 0; j < after.length; j++) distance += Math.hypot(after[j].x - before[j].x, after[j].z - before[j].z); before = after;
    }
    totals.push(distance); v.dispose();
  }
  assert.ok(totals[1] < totals[0] * .85, `calmer phone roaming: ${totals[1].toFixed(1)}m versus ${totals[0].toFixed(1)}m`);
});

test('mobile guard chase and pickup effects retain real elapsed time', () => {
  const dog: Animal = { uid: 1, kind: 'dog', bornAt: now, acquiredAt: now, cycleAt: now }, travel: number[] = [];
  for (const mobile of [false, true]) {
    const v = view(mobile); v.update([dog], .05, 0, now); const from = v.positionOf(1)!;
    assert.equal(v.guardBite({ x: from.x + 8, z: from.z }), true);
    for (let i = 1; i <= 30; i++) v.update([dog], 1 / 60, i / 60, now + i / 60 * 1000);
    const to = v.positionOf(1)!; travel.push(Math.hypot(to.x - from.x, to.z - from.z));
    v.collect(1, 'egg'); v.update([dog], .001, .501, now + 501);
    assert.equal(mesh(v, 'product:egg').count, 1, 'feedback starts on the next update');
    for (let i = 1; i <= 30; i++) v.update([dog], 1 / 60, .501 + i / 60, now + 501 + i / 60 * 1000);
    assert.equal(mesh(v, 'product:egg').visible, false, 'a 0.45-second effect is not stretched by calm motion');
    v.dispose();
  }
  assert.ok(Math.abs(travel[0] - travel[1]) < .08, `guard speed is unchanged: ${travel}`);
});

test('breed uploads track changed slots across reordering and multiple updates before a render', () => {
  const v = view(false), list = herd().filter(a => a.kind === 'cow' && a.bornAt < now - 1);
  v.update(list, .05, 0, now);
  const body = mesh(v, 'cow:body'), coat = body.geometry.getAttribute('coatA') as T.InstancedBufferAttribute;
  const initial = coat.version; coat.clearUpdateRanges();
  v.update(list, .05, .05, now); assert.equal(coat.version, initial);
  list[0].coat = 1; v.update(list, .05, .1, now);
  list[4].coat = 0; v.update(list, .05, .15, now);
  assert.equal(coat.version, initial + 2);
  assert.deepEqual(coat.updateRanges, [{ start: 0, count: 4 }, { start: 16, count: 4 }], 'pending writes are preserved until the renderer uploads them');
  const first = [coat.getX(0), coat.getY(0), coat.getZ(0)], last = [coat.getX(4), coat.getY(4), coat.getZ(4)];
  v.update([...list].reverse(), .05, .2, now);
  assert.deepEqual([coat.getX(0), coat.getY(0), coat.getZ(0)], last);
  assert.deepEqual([coat.getX(4), coat.getY(4), coat.getZ(4)], first);
  v.dispose();
});
