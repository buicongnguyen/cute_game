import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { FishingView, fishDrawLook, isDeepSpecies, type PondView } from '../src/fishing-view.ts';
import { FishHuntingView } from '../src/fish-hunting-view.ts';
import { fishHuntKey, fishHuntTargets, huntingPonds, type HuntingState } from '../src/fish-hunting.ts';
import { RESTOCK_AFTER_CATCH } from '../src/fishing.ts';

type Swimmer = { slot?: number; species: string; mystery?: boolean; deep?: boolean; obj: T.Group; depth: number; state: string };
type Internals = {
  fish: Swimmer[]; interest: Swimmer | null; leaps: Array<{obj: T.Group}>;
  symbol(label: string): T.Sprite; addMystery(pond: PondView): void;
};

function fixture(pond = huntingPonds('ice')[0]) {
  // A loaded kit exercises the deep silhouettes; the old gear-switch test only used missing-kit fallbacks.
  const geometry = new T.BoxGeometry(.2, .1, .5), material = new T.MeshBasicMaterial({color: '#ffaa22'});
  geometry.userData.sharedKit = true; material.userData.sharedKit = true;
  const kit = {ready: true, parts: () => undefined, instance(id: string) { const group = new T.Group(); group.name = id; group.add(new T.Mesh(geometry, material)); return group; }};
  const scene = new T.Scene(), view = new FishingView(scene, {burst() {}, ring() {}} as never, kit as never, () => {}, () => 0);
  const inside = view as unknown as Internals;
  inside.symbol = label => { const sprite = new T.Sprite(); sprite.userData.label = label; return sprite; };
  const stock = fishHuntTargets(pond, 0);
  view.populate([pond], () => ['fish_perch', 'fish_shark'], () => 'fish_whale', () => stock.map(f => f.id));
  return {scene, view, inside, pond, stock};
}
const slotted = (inside: Internals) => inside.fish.filter(f => f.slot !== undefined);
const positions = (inside: Internals) => new Map(slotted(inside).map(f => [f.slot!, f.obj.position.clone()]));
const close = (a: T.Vector3, b: T.Vector3) => assert.ok(a.distanceTo(b) < 1e-8, `${a.toArray()} != ${b.toArray()}`);
const shadow = (obj: T.Group) => ((obj.children[0] as T.Mesh).material as T.Material).transparent;

test('loaded-kit deep and shallow fish keep their slots and shadows through a complete rod/harpoon handover', t => {
  const now = 1_800_000_000_000; t.mock.method(Date, 'now', () => now);
  const {scene, view, inside, pond, stock} = fixture(), world = {}, owner = {};
  assert.ok(stock.some(f => isDeepSpecies(f.id)) && stock.some(f => !isDeepSpecies(f.id)));
  const extra = inside.fish.filter(f => f.slot === undefined), extraSpecies = extra.map(f => f.species);
  assert.equal(extra.length, 3);
  const before = positions(inside), poses = view.ordinaryPoses(pond.id);
  assert.equal(poses.length, stock.length, 'deep canonical fish are retained; decorative deep fish do not acquire slots');
  assert.deepEqual(poses.map(p => p.slot), stock.map(f => f.slot));
  const hunting = new FishHuntingView(scene, view);
  hunting.update(0, pond, undefined, true, world, owner);
  const models = (hunting as unknown as {fish: Array<{slot: number; id: string; obj: T.Group}>}).fish;
  for (const model of models) {
    close(model.obj.position, before.get(model.slot)!);
    assert.equal(model.id, stock[model.slot].id);
    assert.equal(shadow(model.obj), isDeepSpecies(model.id), 'deep fish remain shadows when taking out a harpoon');
  }
  let disposed = 0;
  const deep = models.find(f => isDeepSpecies(f.id))!;
  ((deep.obj.children[0] as T.Mesh).material as T.Material).addEventListener('dispose', () => { disposed++; });
  hunting.update(.6, pond, undefined, true, world, owner);
  const returning = new Map(models.map(f => [f.slot, f.obj.position.clone()]));
  hunting.update(0, null, undefined, true, world, owner);
  for (const fish of slotted(inside)) {
    close(fish.obj.position, returning.get(fish.slot!)!);
    assert.equal(fish.species, stock[fish.slot!].id);
    assert.equal(fish.deep, isDeepSpecies(fish.species));
  }
  assert.deepEqual(extra.map(f => f.species), extraSpecies, 'decorative fish were not overwritten by canonical slots');
  assert.equal(disposed, 0, 'leaving hunting cannot dispose the shadow material shared by rod-view fish');
});

test('a missing rod-caught slot and its later respawn cannot shift the remaining handover identities', t => {
  const now = 1_800_000_000_000; t.mock.method(Date, 'now', () => now);
  const {scene, view, inside, pond, stock} = fixture(), world = {}, owner = {};
  const caught = slotted(inside).find(f => f.slot === 1)!;
  view.begin(pond, new T.Vector3(), pond); inside.interest = caught; view.land(() => new T.Vector3(), () => {});
  assert.ok(!view.ordinaryPoses(pond.id).some(p => p.slot === 1));
  const before = positions(inside), hunting = new FishHuntingView(scene, view);
  hunting.update(0, pond, undefined, true, world, owner);
  const models = (hunting as unknown as {fish: Array<{slot: number; obj: T.Group}>}).fish;
  for (const model of models) if (before.has(model.slot)) close(model.obj.position, before.get(model.slot)!);

  // A legitimate harpoon restock changes the absent slot before its rod animation has respawned.
  const key = fishHuntKey(pond.id, 1), state: HuntingState = {lastShotAt: 0, readyAt: {}, caught: {[key]: 1}};
  for (let attempt = 0; attempt < 100 && fishHuntTargets(pond, now, state)[1].id === caught.species; attempt++) state.caught![key]++;
  const nextSpecies = fishHuntTargets(pond, now, state)[1].id;
  assert.notEqual(nextSpecies, caught.species, 'fixture includes a restock with a different canonical species');
  hunting.update(.6, pond, state, true, world, owner); hunting.update(0, null, state, true, world, owner);
  view.update(RESTOCK_AFTER_CATCH + .01, 1, new T.Vector3(), new T.Vector3(1000, 0, 1000), null);
  const restored = slotted(inside).find(f => f.slot === 1)!;
  assert.ok(restored); assert.equal(restored.species, nextSpecies);
  assert.equal(slotted(inside).length, stock.length); assert.equal(new Set(slotted(inside).map(f => f.slot)).size, stock.length);
  assert.equal(slotted(inside).at(-1)!.slot, 1, 'the respawn is appended, not silently renumbered');
  const after = positions(inside);
  hunting.update(0, pond, state, true, world, owner);
  for (const model of (hunting as unknown as {fish: Array<{slot: number; obj: T.Group}>}).fish) close(model.obj.position, after.get(model.slot)!);
});

test('returning changed hunting species rebuilds the right silhouette without altering decorative fish', () => {
  const {view, inside, pond} = fixture();
  const small = slotted(inside).find(f => !f.deep)!, deep = slotted(inside).find(f => f.deep)!;
  const extra = inside.fish.filter(f => f.slot === undefined).map(f => ({fish: f, obj: f.obj, species: f.species}));
  view.adoptPoses(pond.id, [
    {slot: small.slot!, id: 'fish_shark', x: pond.x, z: pond.z, heading: 1},
    {slot: deep.slot!, id: 'fish_perch', x: pond.x + 1, z: pond.z, heading: 2},
  ].reverse());
  assert.equal(small.species, 'fish_shark'); assert.equal(small.deep, true); assert.equal(shadow(small.obj), true);
  assert.equal(deep.species, 'fish_perch'); assert.equal(deep.deep, false); assert.equal(shadow(deep.obj), false);
  assert.equal(small.obj.rotation.y, 1); assert.equal(deep.obj.rotation.y, 2);
  for (const item of extra) { assert.equal(item.fish.obj, item.obj); assert.equal(item.fish.species, item.species); }
});

for (const reveal of [
  {id: 'starshard', fish: false, icon: '⭐'},
  {id: 'fish_perch', fish: true},
  {id: 'fish_whale', fish: true, supergiant: true},
]) test(`a deep mystery shadow reveals the actual ${reveal.id}${reveal.supergiant ? ' supergiant' : ''} reward`, () => {
  const {view, inside, pond} = fixture(); inside.addMystery(pond);
  const fish = inside.fish.find(f => f.mystery)!; assert.equal(fish.deep, true);
  view.begin(pond, new T.Vector3(), pond); inside.interest = fish;
  view.land(() => new T.Vector3(), () => {}, reveal);
  const landed = inside.leaps[0].obj;
  if (!reveal.fish) assert.equal(landed.children[0].userData.label, '⭐', 'treasure cannot turn back into the shadow species');
  else {
    assert.equal(landed.name, reveal.id); assert.equal(shadow(landed), false);
    assert.equal(landed.scale.x, fishDrawLook(reveal.id)[0] * (reveal.supergiant ? 2.2 : 1));
    assert.equal(landed.scale.y, landed.scale.x, 'the reveal is a full fish, not a flattened shadow');
  }
});

test('an ordinary deep catch still reveals its full species model and retains its respawn slot', () => {
  const {view, inside, pond} = fixture(), fish = slotted(inside).find(f => f.deep)!;
  view.begin(pond, new T.Vector3(), pond); inside.interest = fish; view.land(() => new T.Vector3(), () => {});
  const landed = inside.leaps[0].obj;
  assert.equal(landed.name, fish.species); assert.equal(shadow(landed), false); assert.equal(landed.scale.y, landed.scale.x);
  view.update(RESTOCK_AFTER_CATCH + .01, 1, new T.Vector3(), new T.Vector3(1000, 0, 1000), null);
  const next = slotted(inside).find(f => f.slot === fish.slot)!;
  assert.equal(next.species, fish.species); assert.equal(next.deep, true);
});
