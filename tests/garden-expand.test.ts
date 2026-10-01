import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';

// Rules from the reference's openSeeds / openPlot / buyPlot / removeExtra and its ripe-tap handler.
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;
const crop = Object.keys(M.CROPS)[0] as M.CropId, grown = Date.now() - M.CROPS[crop].duration - 1000;

test('a ripe tap gathers ripe beds within 5 m, nearest first, the tapped bed leading', () => {
  const s = M.newGame();
  // Starting beds sit 2.25 m apart: bed 4 is the centre of the 3x3 garden.
  for (const i of [0, 1, 4, 5, 8]) Object.assign(s.plots[i], { crop, plantedAt: grown });
  s.plots[3].crop = crop; s.plots[3].plantedAt = Date.now(); // growing: never gathered
  assert.deepEqual(M.ripeNearby(s, 4), [4, 1, 5, 0, 8], 'centre, then the 2.25 m neighbours, then the 3.18 m corners');
  // From a corner the far corner is 6.36 m away: out of reach.
  assert.deepEqual(M.ripeNearby(s, 0), [0, 1, 4], "bed 5 is 5.03 m away");
  assert.ok(!M.ripeNearby(s, 0).includes(8));
  assert.deepEqual(M.ripeNearby(s, 3), [], 'a growing bed gathers nothing');
  assert.deepEqual(M.ripeNearby(s, 2), [], 'an empty bed gathers nothing');
  // Exactly at the reach is out (reference: distance < 5).
  s.plots.push({ crop, plantedAt: grown, x: -11.4 + 5, z: -.4 });
  assert.ok(!M.ripeNearby(s, 0).includes(9)); assert.ok(M.ripeNearby(s, 0, Date.now(), 5.01).includes(9));
});

test('expand costs 60 + 20 per extra bed, prefers a kit in the bag and stops at 24 extra beds', () => {
  const s = M.newGame();
  assert.equal(M.gardenExpansionCost(s), 60);
  s.energy = 59; assert.equal(M.readyPlotKit(s), 'energy'); assert.equal(s.energy, 59); assert.equal(s.bag.plot_kit, undefined);
  s.energy = 60; assert.equal(M.readyPlotKit(s), 'bought'); assert.equal(s.energy, 0); assert.equal(s.bag.plot_kit, 1);
  // Owning a kit costs nothing more, however poor the explorer is.
  assert.equal(M.readyPlotKit(s), 'have'); assert.equal(s.bag.plot_kit, 1);
  // Placing spends the kit, not energy, and raises the next price by 20.
  s.energy = 500; assert.ok(M.expandGarden(s, -13.65, 4.1)); assert.equal(s.bag.plot_kit, undefined); assert.equal(s.energy, 500);
  assert.equal(M.gardenExpansionCost(s), 80);
  s.energy = 79; assert.equal(M.readyPlotKit(s), 'energy');
  // At the cap: nothing is bought or spent.
  s.energy = 1e7; while (M.expandGarden(s));
  assert.equal(s.plots.length, M.STARTING_PLOTS + M.MAX_EXTRA_PLOTS); assert.equal(M.MAX_EXTRA_PLOTS, 24);
  const before = s.energy; assert.equal(M.readyPlotKit(s), 'max'); assert.equal(s.energy, before); assert.equal(s.bag.plot_kit, undefined);
  M.addItem(s, 'plot_kit'); assert.equal(M.readyPlotKit(s), 'max'); assert.equal(M.expandGarden(s, 12, 12), false); assert.equal(s.bag.plot_kit, 1);
  // Away from home the garden cannot grow.
  const away = M.newGame(); away.energy = 1e4; away.planet = 'candy'; assert.equal(M.readyPlotKit(away), 'away'); assert.equal(away.energy, 1e4);
});

test('placement refuses blocked spots and spots outside the fence', () => {
  const s = M.newGame();
  assert.equal(M.bedSpotOk(s, -13.65, 4.1), true, 'open grass west of the garden');
  assert.equal(M.bedSpotOk(s, -9.15, 1.85), false, 'on a starting bed');
  assert.equal(M.bedSpotOk(s, -10.3, 1.85), false, 'overlapping a starting bed');
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
  assert.ok(M.expandGarden(s, -13.65, 4.1)); assert.ok(M.expandGarden(s, -13.65, 1.85)); assert.equal(s.bag.plot_kit, undefined);
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
  assert.deepEqual(M.bedPosition(old as M.SaveState, 4), { x: -9.15, z: 1.85 });
  assert.equal(M.isExtraBed(r, 10), true); assert.equal(M.gardenExpansionCost(r), 100);
});

test('the garden items explain themselves', () => {
  assert.match(M.ITEMS.plot_kit.desc, /tap a garden bed.*Expand garden/i);
  assert.match(M.ITEMS.manure.desc, /halves/i); assert.match(M.ITEMS.spore.desc, /ripens/i);
});

test('placed beds keep their 45° turn, turned beds need more room, and old saves stay square', () => {
  const s = M.newGame(); M.addItem(s, 'plot_kit'); M.addItem(s, 'plot_kit');
  // A square bed fits 2.25 m from the starting garden's west column; turned 45° its corners reach the trail-free margin less.
  assert.equal(M.bedClear(-13.65, 4.1, 0), true);
  assert.equal(M.bedClear(-1.7, 4.1, 0), true, 'square: 1.06 m half side clears the 0.55 m trail');
  assert.equal(M.bedClear(-1.7, 4.1, Math.PI / 4), false, 'turned: 1.5 m half extent reaches the trail');
  assert.equal(M.bedClear(-13.65, 4.1, NaN), false);
  assert.equal(M.bedSpotOk(s, -9.75, -3), true, 'a square bed fits here on its own');
  assert.ok(M.expandGarden(s, -12, -3, Math.PI / 4)); assert.equal(s.plots[9].rotation, Math.PI / 4);
  assert.equal(M.bedSpotOk(s, -9.75, -3), false, '2.25 m beside a turned bed its corner would overlap');
  assert.equal(M.bedSpotOk(s, -12, -.4 + 2.25 + 2.6, Math.PI / 4), false, 'nor on a starting bed');
  assert.ok(M.placeDecoration(s, 'plot_kit', -13.65, 1.85, 0)); assert.equal('rotation' in s.plots[10], false, 'unturned beds save no rotation');
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
