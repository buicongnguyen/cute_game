import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { applyGameAction, ActionError } from '../src/actions.ts';
import { helperPlant } from '../src/helper.ts';

const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;
const crop = 'carrot' as M.CropId, base = M.CROPS[crop].duration;

test('each bed level cuts that bed\'s grow time by 10 %, up to 5 levels (half the time)', () => {
  const s = M.newGame(); s.energy = 1e6;
  assert.equal(M.bedGrowTime(s.plots[0], base), base);
  for (let level = 1; level <= 5; level++) { assert.ok(M.upgradeBed(s, 0)); assert.equal(M.bedLevel(s.plots[0]), level); assert.equal(M.bedGrowTime(s.plots[0], base), Math.round(base * (1 - level / 10))); }
  const left = s.energy; assert.equal(M.upgradeBed(s, 0), false, 'level 5 is the cap'); assert.equal(s.energy, left);
  // Planting reads the level: the crop ripens at half time on a level-5 bed, at full time on a plain one.
  assert.ok(M.plant(s, 0, crop, 1000)); assert.ok(M.plant(s, 1, crop, 1000));
  assert.equal(M.cropDuration(s.plots[0]), base / 2); assert.equal(M.cropDuration(s.plots[1]), base);
  assert.equal(M.cropProgress(s.plots[0], 1000 + base / 2), 1); assert.ok(M.cropProgress(s.plots[1], 1000 + base / 2) < 1);
});

test('upgrade prices double per level from 120, cost 1.5x off Easy, and need the energy', () => {
  const s = M.newGame();
  assert.deepEqual([0, 1, 2, 3, 4].map(l => M.bedUpgradeCost(s, l)), [120, 240, 480, 960, 1920]);
  s.settings.difficulty = 'normal'; assert.deepEqual([0, 1, 2, 3, 4].map(l => M.bedUpgradeCost(s, l)), [180, 360, 720, 1440, 2880]);
  s.settings.difficulty = 'hard'; assert.equal(M.bedUpgradeCost(s, 0), 180);
  s.settings.difficulty = 'easy'; s.energy = 119; assert.equal(M.upgradeBed(s, 0), false); assert.equal(s.energy, 119); assert.equal(s.plots[0].level, undefined);
  s.energy = 120; assert.ok(M.upgradeBed(s, 0)); assert.equal(s.energy, 0);
  s.energy = 1e4; assert.equal(M.upgradeBed(s, 99), false); assert.equal(M.upgradeBed(s, -1), false); assert.equal(M.upgradeBed(s, 1.5), false);
  s.planet = 'candy'; assert.equal(M.upgradeBed(s, 1), false, 'only at home');
});

test('upgrading a bed with a growing crop speeds it up at once, keeping the share it has grown', () => {
  const s = M.newGame(); s.energy = 1e6; assert.ok(M.plant(s, 0, crop, 0));
  const half = base / 2; assert.equal(M.cropProgress(s.plots[0], half), .5);
  assert.ok(M.upgradeBed(s, 0, half));
  assert.equal(M.cropProgress(s.plots[0], half), .5, 'no progress lost or gained at the moment of upgrading');
  assert.equal(M.cropDuration(s.plots[0]), Math.round(base * .9));
  assert.equal(M.cropProgress(s.plots[0], half + Math.round(base * .9) / 2), 1, 'the rest grows 10 % faster');
  // A ripe crop is left alone.
  const r = M.newGame(); r.energy = 1e6; M.plant(r, 0, crop, 0); M.upgradeBed(r, 0, base * 2); assert.equal(M.cropDuration(r.plots[0]), base);
});

test('helpers and friends plant through the bed level; offline growth uses the upgraded time', () => {
  const s = M.newGame(); s.energy = 1e6; for (let i = 0; i < 3; i++) M.upgradeBed(s, 2);
  s.helper = { owned: true, paused: false, seed: crop, last: {} } as unknown as M.SaveState['helper'];
  const planted = helperPlant(s, 2, 5000);
  assert.ok(planted, 'the helper planted'); assert.equal(M.cropDuration(s.plots[2]), Math.round(base * .7));
  // Reloading (the offline path) keeps the snapshot: ripe at 70 % of the base time after planting.
  const r = reload(s); assert.equal(M.bedLevel(r.plots[2]), 3); assert.equal(M.cropProgress(r.plots[2], 5000 + Math.round(base * .7)), 1);
});

test('bed levels survive a save round-trip, are clamped on load, and an upgraded bed is not packed away', () => {
  const s = M.newGame(); s.energy = 1e6; M.addItem(s, 'plot_kit'); assert.ok(M.expandGarden(s)); M.upgradeBed(s, 9); M.upgradeBed(s, 9);
  assert.equal(reload(s).plots[9].level, 2); assert.equal(reload(s).plots[0].level, undefined);
  const odd = JSON.parse(JSON.stringify(s)); odd.plots[0].level = 99; odd.plots[1].level = -2; odd.plots[2].level = 'x'; odd.plots[3].level = 2.5;
  const r = M.parseSave(JSON.stringify(odd))!; assert.deepEqual(r.plots.slice(0, 4).map(p => p.level), [5, undefined, undefined, undefined]);
  assert.equal(M.storeBed(s, 9), false, 'its level would be lost in a kit'); assert.equal(s.plots.length, 10);
});

test('the upgradeBed action runs the same rules and refuses what the model refuses', () => {
  const s = M.newGame(); s.energy = 300;
  applyGameAction(s, { type: 'upgradeBed', payload: { index: 4 } }, { now: 1000, random: Math.random });
  assert.equal(s.plots[4].level, 1); assert.equal(s.energy, 180);
  assert.throws(() => applyGameAction(s, { type: 'upgradeBed', payload: { index: 4 } }, { now: 1000, random: Math.random }), (e: unknown) => e instanceof ActionError && e.status === 409, 'not enough energy for level 2 (240)');
  assert.equal(s.plots[4].level, 1); assert.equal(s.energy, 180);
  assert.throws(() => applyGameAction(s, { type: 'upgradeBed', payload: { index: -1 } }), (e: unknown) => e instanceof ActionError && e.status === 400);
  assert.throws(() => applyGameAction(s, { type: 'upgradeBed', payload: { index: 'x' } }), (e: unknown) => e instanceof ActionError && e.status === 400);
  assert.throws(() => applyGameAction(s, { type: 'upgradeBed', payload: { index: 40 } }), (e: unknown) => e instanceof ActionError && e.status === 409);
});

test('layout 3 saves with more than 24 beds: extras over the cap are refunded, their crops harvested or returned as seeds', () => {
  const now = Date.now(), old = JSON.parse(JSON.stringify(M.newGame()));
  old.gardenLayout = 3; old.energy = 0;
  old.plots = Array.from({ length: 9 }, (_, i) => ({ crop: null, plantedAt: 0, ...M.layout3Bed(i) }));
  // 24 extra beds (33 in all), placed by hand off to the east so none clash: the last two carry a ripe and a growing crop.
  for (let i = 9; i < 33; i++) old.plots.push({ crop: null, plantedAt: 0, x: +(-5.5 + (i % 4) * 1.3).toFixed(2), z: +(1.6 + Math.floor((i - 9) / 4) * 1.3).toFixed(2) });
  old.plots[31] = { ...old.plots[31], crop, plantedAt: now - base * 2, growDuration: base };
  old.plots[32] = { ...old.plots[32], crop: 'iceberry', plantedAt: now, growDuration: M.CROPS.iceberry.duration, level: 2 };
  const r = M.parseSave(JSON.stringify(old))!;
  assert.equal(r.plots.length, 24); assert.equal(r.gardenLayout, M.GARDEN_LAYOUT);
  // Nine empty extra beds went (indices 22..30), refunded at their price: 60 + 20 x (i - 9).
  const refund = Array.from({ length: 9 }, (_, k) => M.bedPrice(22 + k)).reduce((a, b) => a + b, 0);
  assert.equal(r.energy >= refund, true);
  assert.equal(r.plots.filter(p => p.crop).length, 2, 'beds with crops stay while empty ones can go');
  assert.equal(reload(r).plots.length, 24);
});

test('a save over the cap with crops on every bed: the least grown extra beds go, their crops come back as seeds or value', () => {
  const now = Date.now(), s = M.newGame(); s.energy = 0;
  // 27 beds, every one planted and 90 % grown: three must go, the least grown first (w15 review: not simply the newest).
  for (let i = 9; i < 27; i++) s.plots.push({ crop: null, plantedAt: 0, ...M.GARDEN_GRID[i % 24], x: -5.5 + (i % 4) * 1.3, z: 1.6 + Math.floor((i - 9) / 4) * 1.3 });
  const grow = (p: M.Plot, id: M.CropId, share: number) => Object.assign(p, { crop: id, plantedAt: now - Math.round(M.CROPS[id].duration * share), growDuration: M.CROPS[id].duration });
  s.plots.forEach(p => grow(p, 'iceberry', .9));
  grow(s.plots[26], crop, 2); grow(s.plots[12], 'iceberry', 0); grow(s.plots[10], 'pumpkin', .3); grow(s.plots[15], 'radish', .6);
  s.plots[12].level = 1;
  const seed = M.CROPS.iceberry.seed!, seeds = s.bag[seed] || 0;
  const refunded = M.trimGarden(s, now);
  assert.equal(s.plots.length, 24);
  assert.equal(s.plots.filter(p => p.crop === crop).length, 1, 'the ripe carrot keeps its bed: the least grown went');
  assert.equal(s.bag[seed], seeds + 1, 'the iceberry that had just been planted came back as its seed');
  assert.equal(s.bag.radish, 1, 'a crop more than half grown comes back as the crop');
  const pumpkin = Math.round(M.ITEMS.pumpkin.sell * .3);
  assert.equal(refunded, M.bedPrice(26) + M.bedPrice(25) + M.bedPrice(24) + M.bedUpgradeCost(s, 0) + pumpkin, 'the three dearest bed prices, the upgrade and the seedless pumpkin pro rata');
  assert.deepEqual(s.gardenTrim, { beds: 3, energy: refunded, items: { [seed]: 1, radish: 1 } }, 'kept for the one-time note');
});

test('layout 3 saves move onto the 6 x 4 grid: starting beds and game-placed beds, crops and levels kept', () => {
  const now = Date.now(), old = JSON.parse(JSON.stringify(M.newGame()));
  old.gardenLayout = 3;
  old.plots = Array.from({ length: 9 }, (_, i) => ({ crop: i === 4 ? crop : null, plantedAt: i === 4 ? now : 0, ...M.layout3Bed(i), ...(i === 4 ? { growDuration: base, level: 2 } : {}) }));
  // Two beds the game placed on the old 1.64 m grid around the garden centre.
  old.plots.push({ crop: null, plantedAt: 0, x: +(M.GARDEN_CENTRE.x - 3 * 1.64).toFixed(2), z: M.GARDEN_CENTRE.z }, { crop, plantedAt: 7, x: M.GARDEN_CENTRE.x, z: +(M.GARDEN_CENTRE.z + 2 * 1.64).toFixed(2) });
  const r = M.parseSave(JSON.stringify(old))!;
  assert.equal(r.gardenLayout, M.GARDEN_LAYOUT); assert.equal(r.plots.length, 11);
  assert.deepEqual(r.plots.map(p => ({ x: p.x, z: p.z })), M.GARDEN_GRID.slice(0, 11));
  assert.equal(r.plots[4].crop, crop); assert.equal(r.plots[4].plantedAt, now); assert.equal(r.plots[4].level, 2); assert.equal(r.plots[10].plantedAt, 7);
});
