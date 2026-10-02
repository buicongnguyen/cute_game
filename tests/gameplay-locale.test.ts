import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setLanguage } from '../src/i18n.ts';
import * as M from '../src/model.ts';
import { animalStatus, collectText, penHtml, sitePenHtml, type FarmUi } from '../src/farm-ui.ts';
import { progressEntries, refreshProgress } from '../src/progression.ts';
import { defenseText, upgradeCards } from '../src/item-views.ts';
import { lootText, zoneInfo } from '../src/hud-combat.ts';
import { mapCaption } from '../src/minimap.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { FishingSimulation } from '../src/fishing.ts';

afterEach(() => setLanguage('en'));
const time = 1_000_000;
const ui: FarmUi = {
  art: (id, icon) => `<span data-art="${id}">${icon}</span>`,
  mini: id => `<span data-item="${id}">◉</span>`,
  esc: text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
  chips: () => '', effect: () => '',
};

test('farm localization changes visible copy without altering animal IDs, classes or actions', () => {
  const state = M.newGame(); state.level = 10; state.energy = 1000; state.farm.built = true;
  const chick = M.buyAnimal(state, 'chicken', time)!;
  M.addItem(state, 'carrot', 2);
  const saved = JSON.stringify(state);
  setLanguage('vi');
  const panel = penHtml(state, ui, time + M.ANIMALS.chicken.growMs + 1); // grown: Feed all skips young ones
  assert.match(panel, /BẠN MỚI/);
  assert.match(panel, /Cho tất cả ăn \(1\)/);
  assert.match(panel, /data-action="feed-animal"/);
  assert.match(panel, new RegExp(`data-id="${chick.uid}"`));
  assert.match(panel, /class="crop-row garden-row animal-row"/);
  assert.match(panel, /data-kind="chicken"/);
  assert.match(panel, /data-item="carrot"/);
  assert.doesNotMatch(panel, /Grows up|NEW FRIENDS|Feed all|cheapest crop/);
  assert.match(animalStatus(chick, time).text, /Trưởng thành sau/);
  assert.equal(JSON.stringify(state), saved, 'rendering never translates persisted data');
  setLanguage('en');
  assert.match(penHtml(state, ui, time), /NEW FRIENDS/);
  assert.match(animalStatus(chick, time).text, /Grows up in/);
});

test('new pen and collection messages have Vietnamese grammar and no English plural suffixes', () => {
  const state = M.newGame();
  setLanguage('vi');
  assert.match(sitePenHtml(state), /Đạt cấp/);
  assert.doesNotMatch(sitePenHtml(state), /Reach level|A roped-off|from level/);
  assert.equal(collectText([{ uid: 1, kind: 'chicken', item: 'egg' }, { uid: 2, kind: 'chicken', item: 'egg' }, { uid: 3, kind: 'cow', item: 'milk' }]), 'Đã thu hoạch 3: 2 trứng, 1 sữa.');
});

test('progression localizes titles and rewards while retaining claim IDs, progress and saved state', () => {
  const state = M.newGame(); state.name = 'Catch fish'; state.level = 8;
  refreshProgress(state, time);
  const english = progressEntries(state, 'daily', time);
  const saved = JSON.stringify(state);
  setLanguage('vi');
  const vietnamese = progressEntries(state, 'daily', time);
  const logic = entries => entries.map(({ id, progress, target, complete, claimed }) => ({ id, progress, target, complete, claimed }));
  assert.deepEqual(logic(vietnamese), logic(english));
  assert.match(vietnamese[0].title, /Điểm danh/);
  assert.match(vietnamese[0].rewardLabel, /năng lượng/);
  assert.match(vietnamese[0].description, /ngày liên tiếp/);
  assert.equal(JSON.stringify(state), saved);
  assert.equal(state.name, 'Catch fish', 'player names matching translation keys are untouched');
});

test('stat cards and combat copy preserve numbers while localizing game-owned text', () => {
  setLanguage('vi');
  assert.equal(defenseText(60), '60 (−50% sát thương)');
  const state = M.newGame(), cards = upgradeCards(state);
  assert.equal(cards[0].gain, '+25 máu tối đa');
  assert.equal(cards[1].gain, '+3 tấn công');
  assert.equal(lootText([{ icon: '🌿', name: 'Carrot', count: 2 }, { icon: '🐟', name: 'Fish', count: 3 }]), '🌿🐟 +5 vật phẩm');
  assert.equal(zoneInfo('Clover Village', 'home').chip, 'An toàn');
  assert.match(zoneInfo('Mushroom Forest', 'home').detail, /Quái hoang dã:/);
  assert.equal(mapCaption('home', 0, 3), 'Hành Tinh Mầm Xanh');
  setLanguage('en');
  assert.equal(mapCaption('home', 0, 3), 'Clover Village');
  assert.equal(defenseText(60), '60 (−50% damage)');
});

test('environment status switches language live without resetting simulation state', () => {
  const ice = new EnvironmentSimulation(createEnvironmentLayout('ice'));
  ice.time = 25; ice.velocity = { x: 2, z: 1 };
  setLanguage('vi');
  assert.equal(ice.status({ x: 30, z: 0 })[0].label, 'Băng');
  assert.match(ice.status({ x: 30, z: 0 })[0].value, /Trơn trượt/);
  assert.equal(ice.time, 25); assert.deepEqual(ice.velocity, { x: 2, z: 1 });
  const ocean = new EnvironmentSimulation(createEnvironmentLayout('ocean')); ocean.rideUntil = 45;
  assert.equal(ocean.status({ x: 0, z: 0 })[1].value, '45 giây');
  setLanguage('en'); assert.match(ice.status({ x: 30, z: 0 })[0].value, /Slippery/);
});

test('fishing state reasons stay canonical so snapped detection survives a Vietnamese interface', () => {
  setLanguage('vi');
  const fish = new FishingSimulation({ quality: .3, bait: false, choose: () => ({ id: 'fish_perch', power: .2 }), random: () => .5 });
  fish.phase = 'escaped'; fish.reason = 'The line snapped. Let go of Reel when the fish surges.';
  assert.equal(fish.snapped, true);
  assert.equal(fish.pick, null);
});
