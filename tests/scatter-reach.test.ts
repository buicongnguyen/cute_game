import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { buildScatter, fallbackParts, updateScatterReach, SCATTER_TILE } from '../src/scatter.ts';

const at = (type: string, x: number, z: number) => ({ type, x, z, y: 0, rotation: 0, scale: 1, radius: .5 });

test('scenery tiles beyond the ground in view are hidden, so culling skips them (FIX-PLAN 1.6)', () => {
  const list = [at('rock', 0, 0), at('rock', 3, 2), at('bush', SCATTER_TILE * 3, 0), at('rock', -SCATTER_TILE * 4, SCATTER_TILE * 2), at('grass', 1, 1)];
  const group = buildScatter(list, fallbackParts);
  const tiles = group.userData.tiles as T.Object3D[];
  assert.ok(tiles.length >= 3 && tiles.every(t => t.parent === group && Array.isArray(t.userData.area)));
  updateScatterReach(group, 0, 0, 37);
  const shown = (x: number) => tiles.filter(t => (t.userData.area as number[])[0] <= x && x <= (t.userData.area as number[])[2]).every(t => t.visible);
  assert.ok(shown(0), 'the tile under the view stays');
  assert.ok(tiles.filter(t => (t.userData.area as number[])[0] > 60).every(t => !t.visible), 'far tiles are hidden');
  updateScatterReach(group, SCATTER_TILE * 3, 0, 37);
  assert.ok(tiles.filter(t => (t.userData.area as number[])[0] > 60 && (t.userData.area as number[])[0] < 120).every(t => t.visible), 'walking there shows them again');
  updateScatterReach(group, 0, 0, Infinity); assert.ok(tiles.every(t => t.visible), 'an unknown reach shows everything');
});
