import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { FishHuntingView } from '../src/fish-hunting-view.ts';
import type { FishingView } from '../src/fishing-view.ts';
import { huntingPonds, fishHuntKey, fishHuntTargets } from '../src/fish-hunting.ts';

test('hunting targets match the shared paths and restock clock without altering the rod selection', t => {
  let now = 1_800_000_000_000; t.mock.method(Date, 'now', () => now);
  const pond = huntingPonds('home')[0], world = {}, owner = {}, fishing = { huntingPondId: null, makeFish: () => ({ obj: new T.Group(), tail: null }) };
  const view = new FishHuntingView(new T.Scene(), fishing as unknown as FishingView);
  const state = { lastShotAt: now, readyAt: { [fishHuntKey(pond.id, 0)]: now + 12_000 } };
  view.update(0, pond, state, false, world, owner);
  assert.equal(fishing.huntingPondId, pond.id); assert.deepEqual(view.targets, fishHuntTargets(pond, now).slice(1));
  now += 12_000; view.update(0, pond, state, false, world, owner); assert.deepEqual(view.targets, fishHuntTargets(pond, now));
  view.update(0, null, state, false, world, owner); assert.equal(fishing.huntingPondId, null); assert.deepEqual(view.targets, []);
});

test('leaving hunting mode during a projectile flight clears the old pond visual immediately', () => {
  const pond = huntingPonds('home')[0], world = {}, owner = {}, fishing = { huntingPondId: null, makeFish: () => ({ obj: new T.Group(), tail: null }) };
  const view = new FishHuntingView(new T.Scene(), fishing as unknown as FishingView);
  const internals = view as unknown as { shot: unknown; projectile: T.Object3D };
  view.update(0, pond, undefined, false, world, owner); view.throw({ x: pond.x, z: pond.z + 4 }, pond);
  assert.equal(internals.projectile.visible, true); assert.ok(internals.shot);
  view.update(0, null, undefined, false, world, owner); assert.equal(internals.projectile.visible, false); assert.equal(internals.shot, null);
});
