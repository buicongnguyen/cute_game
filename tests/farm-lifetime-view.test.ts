import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import * as M from '../src/model.ts';
import { FarmPenView } from '../src/farm-view.ts';
import { animalStatus, penHtml, penSignature, type FarmUi } from '../src/farm-ui.ts';
import { setLanguage } from '../src/i18n.ts';

afterEach(() => setLanguage('en'));
const now = 1_000_000;
const ui: FarmUi = { art: (_id, icon) => icon, esc: text => text, mini: id => `<i data-item="${id}"></i>`, chips: () => '', effect: () => '' };
function fullFarm() {
  const s = M.newGame(); s.level = 10; s.energy = 1e6; s.farm.built = true;
  M.expandPen(s); M.expandPen(s);
  for (let i = 0; i < 7; i++) { assert.ok(M.buyAnimal(s, 'chicken', now)); assert.ok(M.buyAnimal(s, 'cow', now)); }
  return s;
}
const meshes = (v: FarmPenView) => v.animals.children.filter((o): o is T.InstancedMesh => o instanceof T.InstancedMesh);

test('all ten hens and ten cows render; expired animals become twenty stationary meat pickups', () => {
  const s = fullFarm(), view = new FarmPenView();
  const grown = now + Math.max(M.ANIMALS.chicken.growMs, M.ANIMALS.cow.growMs);
  view.update(s.farm.animals, .1, 1, grown);
  assert.equal(meshes(view).find(m => m.name === 'farm-chicken:body')?.count, 7);
  assert.equal(meshes(view).find(m => m.name === 'farm-cow:body')?.count, 7);
  const end = M.expiresAt(s.farm.animals[0]);
  view.update(s.farm.animals, .1, 2, end);
  assert.equal(meshes(view).find(m => m.name === 'farm-product:meat')?.count, 14);
  for (const mesh of meshes(view)) if (/farm-(?:chicken|cow|chick|calf):/.test(mesh.name)) {
    assert.equal(mesh.count, 0); assert.equal(mesh.visible, false, 'expired animal models never remain alive on screen');
  }
  assert.ok(view.activities().every(a => a.expired && !a.walking));
  const positions = view.positions();
  view.update(s.farm.animals, 1, 3, end + 1000, { x: positions[0].x, z: positions[0].z });
  assert.deepEqual(view.positions(), positions, 'meat stays collectible and never flees the player');
  const collected = M.collectProducts(s, end + 1000);
  for (const c of collected) view.collect(c.uid, c.item);
  view.update(s.farm.animals, .1, 3.1, end + 1100);
  assert.equal(view.positions().length, 0);
  assert.equal(meshes(view).find(m => m.name === 'farm-product:meat')?.count, 14, 'all twenty pickups can animate together');
  view.update([], .5, 3.6, end + 1600);
  assert.equal(meshes(view).find(m => m.name === 'farm-product:meat')?.visible, false);
  view.dispose();
});

test('pen status tracks life separately, rerenders at expiry, and offers meat instead of feeding', () => {
  const s = fullFarm(), a = s.farm.animals[0], end = M.expiresAt(a);
  const before = animalStatus(a, end - 1000);
  assert.match(before.text, /Life left: 1s/);
  assert.notEqual(penSignature(s, end - 1000), penSignature(s, end));
  assert.match(animalStatus(a, end).text, /Lifespan ended.*Meat ready/);
  const html = penHtml(s, ui, end);
  assert.match(html, /data-item="meat"/);
  assert.match(html, /Meat ready/);
  assert.match(html, /data-action="collect-animal"/);
  assert.doesNotMatch(html, /data-action="feed-animal"/);
  assert.doesNotMatch(html, /animals are friends, never food/);
  setLanguage('vi');
  assert.match(animalStatus(a, end - 1000).text, /Tuổi thọ còn: 1g/);
  assert.match(animalStatus(a, end).text, /Đã hết tuổi thọ/);
  assert.match(penHtml(s, ui, end), /Có thịt/);
});
