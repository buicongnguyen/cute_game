import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { part } from '../src/part-cache.ts';

test('part() remembers a named node and finds a swapped one again', () => {
  const root = new T.Group(), body = new T.Group(), arm = new T.Object3D(); arm.name = 'arm'; body.add(arm); root.add(body);
  assert.equal(part(root, 'arm'), arm);
  let walks = 0; const get = root.getObjectByName.bind(root); root.getObjectByName = n => { walks++; return get(n); };
  assert.equal(part(root, 'arm'), arm); assert.equal(walks, 0, 'a cached hit does not walk the tree');
  body.remove(arm); const arm2 = new T.Object3D(); arm2.name = 'arm'; body.add(arm2);
  assert.equal(part(root, 'arm'), arm2, 'a removed part is looked up again');
  assert.equal(part(root, 'leg'), undefined); const misses = walks; part(root, 'leg'); assert.equal(walks, misses, 'a miss is remembered');
  const leg = new T.Object3D(); leg.name = 'leg'; root.add(leg); assert.equal(part(root, 'leg'), leg, 'until the root changes');
  assert.doesNotThrow(() => root.clone(), 'clone() never sees the cache');
});
