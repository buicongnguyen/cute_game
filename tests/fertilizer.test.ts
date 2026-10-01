import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';

const plantedAt = 1_000_000;
function garden(crop = 'carrot') {
  const state = M.newGame();
  state.level = 25;
  M.addItem(state, 'manure', 3);
  M.addItem(state, 'spore', 3);
  const seed = M.CROPS[crop].seed;
  if (seed) M.addItem(state, seed);
  assert.equal(M.plant(state, 0, crop, plantedAt), true);
  return state;
}

test('two doses of either fertilizer ripen every crop from newly planted', () => {
  for (const crop of Object.keys(M.CROPS)) for (const fertilizer of ['manure', 'spore']) {
    const state = garden(crop);
    assert.equal(M.fertilize(state, 0, plantedAt, fertilizer), true, `${crop}: first ${fertilizer}`);
    assert.equal(M.cropProgress(state.plots[0], plantedAt), .5);
    assert.equal(state.bag[fertilizer], 2);
    assert.equal(M.fertilize(state, 0, plantedAt, fertilizer), true);
    assert.equal(M.cropProgress(state.plots[0], plantedAt), 1);
    assert.equal(state.bag[fertilizer], 1);
    assert.equal(M.fertilize(state, 0, plantedAt, fertilizer), false, 'do not waste a third dose');
    assert.equal(state.bag[fertilizer], 1);
    assert.equal(M.harvest(state, 0, plantedAt), crop);
    assert.equal(M.harvest(state, 0, plantedAt), null);
  }
});

test('fertilizer removes half the original duration after natural growth and caps at ripe', () => {
  const state = garden('melon'); // Original duration is 120 seconds.
  assert.equal(M.cropProgress(state.plots[0], plantedAt + 30_000), .25);
  assert.equal(M.fertilize(state, 0, plantedAt + 30_000, 'manure'), true);
  assert.equal(M.cropProgress(state.plots[0], plantedAt + 30_000), .75);
  assert.equal(M.fertilize(state, 0, plantedAt + 30_000, 'spore'), true);
  assert.equal(M.cropProgress(state.plots[0], plantedAt + 30_000), 1);
  assert.equal(state.plots[0].plantedAt, plantedAt + 30_000 - M.CROPS.melon.duration, 'no excess progress');
  assert.equal(M.harvest(state, 0, plantedAt + 30_000), 'melon');
  assert.equal(M.plant(state, 0, 'carrot', plantedAt + 30_000), true);
  assert.equal(M.cropProgress(state.plots[0], plantedAt + 30_000), 0, 'the next planting has a fresh timer');
  const almostRipe = garden();
  assert.equal(M.fertilize(almostRipe, 0, plantedAt + 9_999, 'manure'), true);
  assert.equal(M.cropProgress(almostRipe.plots[0], plantedAt + 9_999), 1);
});

test('fixed fertilizer progress survives save reload and ordinary elapsed time', () => {
  let state = garden();
  assert.equal(M.fertilize(state, 0, plantedAt, 'manure'), true);
  state = M.parseSave(JSON.stringify(state))!;
  assert.equal(M.cropProgress(state.plots[0], plantedAt + 1_000), .6);
  assert.equal(state.bag.manure, 2);
  assert.equal(M.fertilize(state, 0, plantedAt + 1_000, 'fertilizer'), true, 'legacy alias still uses spore');
  state = M.parseSave(JSON.stringify(state))!;
  assert.equal(M.cropProgress(state.plots[0], plantedAt + 1_000), 1);
  assert.equal(state.bag.spore, 2);
  assert.equal(M.harvest(state, 0, plantedAt + 1_000), 'carrot');
});

test('empty, ripe, invalid and unavailable fertilizer actions preserve inventory and plots', () => {
  const state = garden();
  const before = structuredClone(state);
  for (const index of [-1, .5, 1, 99, NaN, Infinity]) assert.equal(M.fertilize(state, index, plantedAt, 'manure'), false);
  for (const time of [-1, NaN, Infinity, -Infinity, Number.MAX_VALUE, plantedAt - 1]) assert.equal(M.fertilize(state, 0, time, 'manure'), false);
  for (const item of ['carrot', 'wood', 'constructor', '__proto__', 'toString']) assert.equal(M.fertilize(state, 0, plantedAt, item), false);
  assert.equal(M.fertilize(state, 0, plantedAt + M.CROPS.carrot.duration, 'manure'), false);
  assert.deepEqual(state, before);
  for (const badTime of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
    state.plots[0].plantedAt = badTime;
    const invalid = structuredClone(state);
    assert.equal(M.fertilize(state, 0, plantedAt, 'spore'), false);
    assert.deepEqual(state, invalid);
  }
  state.plots[0].plantedAt = plantedAt;
  state.plots[0].crop = 'constructor';
  assert.equal(M.fertilize(state, 0, plantedAt, 'spore'), false);
  assert.deepEqual(state.bag, before.bag);
  state.plots[0].crop = 'carrot';
  state.bag = {};
  assert.equal(M.fertilize(state, 0, plantedAt, 'manure'), false);
  assert.equal(state.plots[0].plantedAt, plantedAt);
});
