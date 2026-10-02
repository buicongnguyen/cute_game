import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';

// Rules from the reference's openSeeds / openPlot / buyPlot / removeExtra and its ripe-tap handler.
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;
const crop = Object.keys(M.CROPS)[0] as M.CropId, grown = Date.now() - M.CROPS[crop].duration - 1000;

test('a ripe tap gathers every ripe bed in the garden, nearest first, the tapped bed leading', () => {
  const s = M.newGame();
  // Starting beds sit BED_STEP (1.23 m) apart: bed 4 is the centre of the 3x3 garden.
  for (const i of [0, 1, 4, 5, 8]) Object.assign(s.plots[i], { crop, plantedAt: grown });
  s.plots[3].crop = crop; s.plots[3].plantedAt = Date.now(); // growing: never gathered
  assert.deepEqual(M.ripeNearby(s, 4), [4, 1, 5, 0, 8], 'centre, then the 1.23 m neighbours, then the 1.74 m corners');
  // The user's rule: no reach limit, so the far corner comes too (the reference stops at 5 m).
  assert.deepEqual(M.ripeNearby(s, 0), [0, 1, 4, 5, 8]);
  assert.deepEqual(M.ripeNearby(s, 3), [], 'a growing bed gathers nothing');
  assert.deepEqual(M.ripeNearby(s, 2), [], 'an empty bed gathers nothing');
  // A bed at the far side of the village still counts; an explicit reach still limits (for callers that want one).
  s.energy = 1e7; while (M.expandGarden(s)); const far = s.plots.length - 1; Object.assign(s.plots[far], { crop, plantedAt: grown });
  const all = M.ripeNearby(s, 0); assert.equal(all.length, 6); assert.equal(all.at(-1), far, 'the farthest bed comes last');
  assert.deepEqual(M.ripeNearby(s, 0, Date.now(), 1.5), [0, 1], 'within 1.5 m of bed 0');
  assert.equal(M.HARVEST_REACH, Infinity);
});

test('expand costs 60 + 20 per extra bed, prefers a kit in the bag and stops at 24 beds in all (15 extra)', () => {
  const s = M.newGame();
  assert.equal(M.gardenExpansionCost(s), 60);
  s.energy = 59; assert.equal(M.readyPlotKit(s), 'energy'); assert.equal(s.energy, 59); assert.equal(s.bag.plot_kit, undefined);
  s.energy = 60; assert.equal(M.readyPlotKit(s), 'bought'); assert.equal(s.energy, 0); assert.equal(s.bag.plot_kit, 1);
  // Owning a kit costs nothing more, however poor the explorer is.
  assert.equal(M.readyPlotKit(s), 'have'); assert.equal(s.bag.plot_kit, 1);
  // Placing spends the kit, not energy, and raises the next price by 20.
  s.energy = 500; assert.ok(M.expandGarden(s, -13.65, 3.65)); assert.equal(s.bag.plot_kit, undefined); assert.equal(s.energy, 500);
  assert.equal(M.gardenExpansionCost(s), 80);
  s.energy = 79; assert.equal(M.readyPlotKit(s), 'energy');
  // At the cap: nothing is bought or spent.
  s.energy = 1e7; while (M.expandGarden(s));
  assert.equal(s.plots.length, M.STARTING_PLOTS + M.MAX_EXTRA_PLOTS); assert.equal(M.MAX_EXTRA_PLOTS, 15); assert.equal(M.MAX_PLOTS, 24);
  const before = s.energy; assert.equal(M.readyPlotKit(s), 'max'); assert.equal(s.energy, before); assert.equal(s.bag.plot_kit, undefined);
  M.addItem(s, 'plot_kit'); assert.equal(M.readyPlotKit(s), 'max'); assert.equal(M.expandGarden(s, 12, 12), false); assert.equal(s.bag.plot_kit, 1);
  // Away from home the garden cannot grow.
  const away = M.newGame(); away.energy = 1e4; away.planet = 'candy'; assert.equal(M.readyPlotKit(away), 'away'); assert.equal(away.energy, 1e4);
});

test('placement refuses blocked spots and spots outside the fence', () => {
  const s = M.newGame();
  assert.equal(M.bedSpotOk(s, -13.65, 4.1), true, 'open grass west of the garden');
  assert.equal(M.bedSpotOk(s, -13.46, 2.39), true, 'one grid step west of the garden: smaller beds fit closer');
  assert.equal(M.bedSpotOk(s, -9.15, 2.99), false, 'on a starting bed');
  assert.equal(M.bedSpotOk(s, -12.3, 2.99), false, 'overlapping a starting bed');
  assert.equal(M.bedSpotOk(s, M.PEN.x, M.PEN.z), false, 'the animal pen');
  assert.equal(M.bedSpotOk(s, M.PEN.x, M.PEN.z + M.PEN.hd + .9), false, 'the path around the pen');
  assert.equal(M.bedSpotOk(s, 0, -8), false, 'the cottage');
  assert.equal(M.bedSpotOk(s, -7, -11), false, 'the well');
  assert.equal(M.bedSpotOk(s, 0, 5), false, 'a stepping-stone trail');
  assert.equal(M.bedSpotOk(s, -15.5, 4), false, 'past the fence');
  assert.equal(M.bedSpotOk(s, 30, 30), false, 'far outside');
  assert.equal(M.bedSpotOk(s, NaN, 1), false);
  s.decorations.push({ uid: 'decor-1', id: 'plot_kit', x: -13.65, z: 4.1, rotation: 0 });
  assert.equal(M.bedSpotOk(s, -13.65, 4.1), false, 'a decoration');
  // A refused spot spends nothing.
  M.addItem(s, 'plot_kit'); assert.equal(M.expandGarden(s, 0, -8), false); assert.equal(s.bag.plot_kit, 1); assert.equal(s.plots.length, 9);
});

test('only an empty extra bed can be stored, and it comes back as a kit', () => {
  const s = M.newGame(); M.addItem(s, 'plot_kit'); M.addItem(s, 'plot_kit');
  assert.ok(M.expandGarden(s, -13.65, 4.1)); assert.ok(M.expandGarden(s, -13.65, 2.3)); assert.equal(s.bag.plot_kit, undefined);
  assert.equal(M.isExtraBed(s, 8), false); assert.equal(M.isExtraBed(s, 9), true); assert.equal(M.isExtraBed(s, 11), false);
  assert.equal(M.storeBed(s, 4), false, 'starting beds stay'); assert.equal(s.plots.length, 11);
  s.plots[9].crop = crop; s.plots[9].plantedAt = Date.now();
  assert.equal(M.storeBed(s, 9), false, 'a bed with a crop stays'); assert.equal(s.bag.plot_kit, undefined);
  s.plots[9].crop = null;
  const later = s.plots[10];
  assert.equal(M.storeBed(s, 9), true); assert.equal(s.bag.plot_kit, 1); assert.equal(s.plots.length, 10);
  assert.equal(s.plots[9], later, 'later beds move down one index');
  assert.equal(M.gardenExpansionCost(s), 80, 'the price follows the bed count');
  assert.equal(M.storeBed(s, 10), false, 'no such bed');
  const away = reload(s); away.planet = 'ice'; assert.equal(M.storeBed(away, 9), false);
  // The stored kit goes back down anywhere clear.
  assert.equal(M.readyPlotKit(s), 'have'); assert.ok(M.expandGarden(s, -13.65, 4.1)); assert.equal(s.bag.plot_kit, undefined);
});

test('old saves keep their beds: missing positions fall back to the starting grid and extra beds still count', () => {
  const s = M.newGame(); s.energy = 1e4; M.expandGarden(s); M.expandGarden(s);
  const old = JSON.parse(JSON.stringify(s)); for (const p of old.plots.slice(0, 9)) { delete p.x; delete p.z; }
  const r = M.parseSave(JSON.stringify(old))!;
  assert.equal(r.plots.length, 11); assert.deepEqual(r.plots.slice(0, 9).map(p => [p.x, p.z]), M.newGame().plots.map(p => [p.x, p.z]));
  assert.deepEqual(M.bedPosition(old as M.SaveState, 4), M.defaultBed(4), 'bed 4 is the centre of the starting block');
  assert.equal(M.isExtraBed(r, 10), true); assert.equal(M.gardenExpansionCost(r), 100);
});

test('the garden items explain themselves', () => {
  assert.match(M.ITEMS.plot_kit.desc, /tap a garden bed.*Expand garden/i);
  for (const id of ['manure', 'spore']) {
    assert.match(M.ITEMS[id].desc, /half.*original growing time/i, id + ' describes a fixed share of the original timer');
    assert.match(M.ITEMS[id].desc, /two uses.*ripen.*newly planted/i, id + ' explains how to fully ripen a new crop');
    assert.equal(M.ITEMS[id].grow, .5, id + ' agrees with the crop model');
  }
});

test('placed beds keep their 45° turn, turned beds need more room, and old saves stay square', () => {
  const s = M.newGame(); M.addItem(s, 'plot_kit'); M.addItem(s, 'plot_kit');
  // Turned 45° a bed's corners reach further, toward the trails and its neighbours.
  assert.equal(M.bedClear(-13.65, 4.1, 0), true);
  assert.equal(M.bedClear(-1.2, 4.1, 0), true, 'square: 0.585 m half side clears the 0.55 m trail');
  assert.equal(M.bedClear(-1.2, 4.1, Math.PI / 4), false, 'turned: 0.83 m half extent reaches the trail');
  assert.equal(M.bedClear(-13.65, 4.1, NaN), false);
  assert.equal(M.bedSpotOk(s, -13, 7.1), false, 'the tree west of the garden');
  assert.equal(M.bedSpotOk(s, -9.6, 6.6), true, 'a square bed fits here on its own');
  assert.ok(M.expandGarden(s, -11.5, 6.6, Math.PI / 4)); assert.equal(s.plots[9].rotation, Math.PI / 4);
  assert.equal(M.bedSpotOk(s, -10.2, 6.6), false, '1.3 m beside a turned bed its corner would overlap');
  assert.equal(M.bedSpotOk(s, -10, 6.6), true, '1.5 m is enough');
  assert.equal(M.bedSpotOk(s, -11, 3.62 + 1.3, Math.PI / 4), false, 'nor on a starting bed');
  assert.ok(M.placeDecoration(s, 'plot_kit', -13.65, 2.3, 0)); assert.equal('rotation' in s.plots[10], false, 'unturned beds save no rotation');
  const r = reload(s); assert.equal(r.plots[9].rotation, Math.PI / 4); assert.equal(r.plots[10].rotation, undefined);
  const old = JSON.parse(JSON.stringify(s)); old.plots[9].rotation = 'x'; assert.equal(M.parseSave(JSON.stringify(old))!.plots[9].rotation, undefined);
});

test('decorations may stand on clear ground inside the fence, not on beds or other decorations', () => {
  const s = M.newGame();
  assert.equal(M.decorSpotOk(s, 4, 4), true);
  assert.equal(M.decorSpotOk(s, -9.15, 1.85), false, 'a bed');
  assert.equal(M.decorSpotOk(s, 16.7, 0), false, 'past the fence');
  M.addItem(s, 'bench_wood' in M.ITEMS ? 'bench_wood' : Object.keys(M.ITEMS).find(id => M.ITEMS[id].type === 'decor')!);
  const id = Object.keys(s.bag)[0]; assert.ok(M.placeDecoration(s, id, 4, 4, Math.PI / 4));
  assert.equal(M.decorSpotOk(s, 4.5, 4), false, 'another decoration');
  s.planet = 'candy'; assert.equal(M.decorSpotOk(s, 8, 8), false);
});

test('old saves move to the smaller beds: starting beds onto the new grid, game-placed beds packed again, hand-placed beds kept', () => {
  const now = Date.now(), old = JSON.parse(JSON.stringify(M.newGame()));
  delete old.gardenLayout;
  old.plots = Array.from({ length: 9 }, (_, i) => ({ crop: i === 4 ? crop : null, plantedAt: i === 4 ? now : 0, ...M.legacyBed(i) }));
  // Three beds the game placed on the old 2.25 m grid, a turned bed placed by hand, and a square one where the pen now stands.
  old.plots.push({ crop, plantedAt: 5, x: -13.65, z: 4.1 }, { crop: null, plantedAt: 0, x: -6.9, z: 6.35 }, { crop: null, plantedAt: 0, x: -4.65, z: 1.85 },
    { crop: null, plantedAt: 0, x: -4.1, z: 5.2, rotation: Math.PI / 4 }, { crop: null, plantedAt: 0, x: M.PEN.x, z: M.PEN.z });
  const r = M.parseSave(JSON.stringify(old))!;
  assert.equal(r.gardenLayout, M.GARDEN_LAYOUT); assert.equal(r.plots.length, 14);
  assert.deepEqual(r.plots.slice(0, 9).map(p => ({ x: p.x, z: p.z })), Array.from({ length: 9 }, (_, i) => M.defaultBed(i)));
  assert.equal(r.plots[4].crop, crop); assert.equal(r.plots[9].crop, crop); assert.equal(r.plots[9].plantedAt, 5, 'crops and timers stay with their beds');
  assert.deepEqual([r.plots[12].x, r.plots[12].z, r.plots[12].rotation], [-4.1, 5.2, Math.PI / 4], 'a hand-placed bed keeps its spot');
  assert.ok(M.clearOfPen(r.plots[13].x!, r.plots[13].z!, M.BED_HALF), 'the bed on the new pen moved');
  const span = (p: M.Plot) => M.BED_HALF * (Math.abs(Math.cos(p.rotation ?? 0)) + Math.abs(Math.sin(p.rotation ?? 0)));
  r.plots.forEach((a, i) => { if (i >= 9) assert.ok(M.bedClear(a.x!, a.z!, a.rotation ?? 0), `bed ${i} clear`); r.plots.forEach((b, j) => { if (j > i) assert.ok(Math.max(Math.abs(a.x! - b.x!), Math.abs(a.z! - b.z!)) >= Math.max(M.BED_GAP, span(a) + span(b)), `beds ${i} and ${j} apart`); }); });
  // Game-placed beds now sit on the garden grid, nearer the garden than before.
  for (const p of r.plots.slice(9, 12)) assert.ok(Math.hypot(p.x! - M.GARDEN_CENTRE.x, p.z! - M.GARDEN_CENTRE.z) <= 5.1, `${p.x},${p.z}`);
  // A save on the new layout loads as it is.
  assert.deepEqual(reload(r).plots, r.plots);
});

test('"Place new beds myself" is off by default and survives a reload', () => {
  const s = M.newGame(); assert.equal(!!s.settings.placeBeds, false); assert.equal(reload(s).settings.placeBeds, undefined);
  s.settings.placeBeds = true; assert.equal(reload(s).settings.placeBeds, true);
  const odd = JSON.parse(JSON.stringify(s)); odd.settings.placeBeds = 'yes'; assert.equal(M.parseSave(JSON.stringify(odd))!.settings.placeBeds, undefined);
  // Automatic placement: no spot given, the bed goes on the free grid spot nearest the garden.
  s.energy = 60; assert.ok(M.expandGarden(s)); assert.deepEqual([s.plots[9].x, s.plots[9].z], [-8.54, 1.16], 'the first free spot of the 6 x 4 grid');
});

test('layout 4: beds at 0.75 of layout 3 on a 6 x 4 grid of 24, crops a little less shrunk', () => {
  // The model frame is 1.94 m outside with 7 cm planks around a 1.8 m soil square, now drawn at 60 % (was 80 %).
  assert.ok(Math.abs(M.BED_SCALE / .8 - .75) < 1e-9 && Math.abs(M.BED_HALF / .78 - .75) < .01 && Math.abs(M.BED_STEP / 1.64 - .75) < .01, 'everything 0.75 of layout 3');
  assert.ok(Math.abs(M.BED_HALF / M.BED_SCALE - .07 - .9) < .01, 'same soil square in model units');
  assert.ok(2 * M.BED_HALF < M.BED_STEP && M.BED_STEP - 2 * M.BED_HALF <= .08, 'a narrow path between frames');
  assert.ok(M.BED_GAP >= 2 * M.BED_HALF && M.BED_GAP <= M.BED_STEP, 'grid neighbours count as apart, frames never touch');
  assert.ok(M.CROP_SCALE > .88 * .75 && M.CROP_SCALE < .88, 'crops shrink, but less than the beds');
  assert.equal(M.GARDEN_GRID.length, M.MAX_PLOTS); assert.equal(M.GARDEN_COLUMNS * M.GARDEN_ROWS, 24);
  assert.equal(new Set(M.GARDEN_GRID.map(g => g.x)).size, 6); assert.equal(new Set(M.GARDEN_GRID.map(g => g.z)).size, 4);
  M.GARDEN_GRID.forEach((b, i) => {
    assert.ok(M.bedClear(b.x, b.z), `spot ${i} clear`); assert.ok(M.clearOfPen(b.x, b.z, M.BED_HALF, 1.4), `spot ${i} off the pen`);
    M.GARDEN_GRID.forEach((c, j) => { if (j > i) assert.ok(Math.max(Math.abs(b.x - c.x), Math.abs(b.z - c.z)) >= M.BED_GAP - 1e-9, `spots ${i} and ${j} apart`); });
  });
  // The starting beds are the west 3 x 3 block of the grid.
  for (let i = 0; i < 9; i++) assert.deepEqual(M.defaultBed(i), M.GARDEN_GRID[i]);
});

test('layout 2 saves move to the slim-frame grid, keeping crops, timers and hand-placed beds', () => {
  const now = Date.now(), old = JSON.parse(JSON.stringify(M.newGame()));
  old.gardenLayout = 2;
  old.plots = Array.from({ length: 9 }, (_, i) => ({ crop: i === 4 ? crop : null, plantedAt: i === 4 ? now : 0, ...M.layout2Bed(i) }));
  // Two beds the game placed on the 1.8 m grid, one turned bed placed by hand, one hand-placed square off the grid.
  old.plots.push({ crop, plantedAt: 7, x: -12.75, z: 1.85 }, { crop: null, plantedAt: 0, x: -5.55, z: 5.45 },
    { crop: null, plantedAt: 0, x: -4.1, z: 5.6, rotation: Math.PI / 4 }, { crop, plantedAt: 9, x: -13.6, z: 2.5 });
  const r = M.parseSave(JSON.stringify(old))!;
  assert.equal(r.gardenLayout, M.GARDEN_LAYOUT); assert.equal(r.plots.length, 13);
  assert.deepEqual(r.plots.slice(0, 9).map(p => ({ x: p.x, z: p.z })), Array.from({ length: 9 }, (_, i) => M.defaultBed(i)));
  assert.equal(r.plots[4].crop, crop); assert.equal(r.plots[4].plantedAt, now);
  assert.equal(r.plots[9].crop, crop); assert.equal(r.plots[9].plantedAt, 7, 'crops and timers stay with their beds');
  assert.deepEqual([r.plots[11].x, r.plots[11].z, r.plots[11].rotation], [-4.1, 5.6, Math.PI / 4], 'a hand-placed bed keeps its spot');
  assert.deepEqual([r.plots[12].x, r.plots[12].z, r.plots[12].plantedAt], [-13.6, 2.5, 9]);
  // Game-placed beds were packed again on the new grid around the garden.
  for (const p of r.plots.slice(9, 11)) assert.ok(M.GARDEN_GRID.some(g => g.x === p.x && g.z === p.z), `${p.x},${p.z}`);
  const span = (p: M.Plot) => M.BED_HALF * (Math.abs(Math.cos(p.rotation ?? 0)) + Math.abs(Math.sin(p.rotation ?? 0)));
  r.plots.forEach((a, i) => { assert.ok(M.bedClear(a.x!, a.z!, a.rotation ?? 0), `bed ${i} clear`); r.plots.forEach((b, j) => { if (j > i) assert.ok(Math.max(Math.abs(a.x! - b.x!), Math.abs(a.z! - b.z!)) >= Math.max(M.BED_GAP, span(a) + span(b)), `beds ${i} and ${j} apart`); }); });
  assert.deepEqual(reload(r).plots, r.plots, 'a current-layout save loads as it is');
});

test('a full garden: every extra bed fits on the dense grid, near the starting garden', () => {
  const s = M.newGame(); s.energy = 1e7; while (M.expandGarden(s));
  assert.equal(s.plots.length, M.STARTING_PLOTS + M.MAX_EXTRA_PLOTS);
  const far = Math.max(...s.plots.map(p => Math.hypot(p.x! - M.GARDEN_CENTRE.x, p.z! - M.GARDEN_CENTRE.z)));
  assert.ok(far < 5, `the farthest bed is ${far.toFixed(2)} m from the garden centre`);
  s.plots.forEach((a, i) => { assert.ok(M.bedClear(a.x!, a.z!), `bed ${i}`); s.plots.forEach((b, j) => { if (j > i) assert.ok(Math.max(Math.abs(a.x! - b.x!), Math.abs(a.z! - b.z!)) >= M.BED_GAP); }); });
});
