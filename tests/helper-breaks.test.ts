// The helpers' daily rests (helper-state.ts BREAKS) at fixed UTC times, so these checks pass at any hour of the day.
// Other tests that seed with Date.now() import tests/support/midday-clock.mjs instead of depending on the wall clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MIDDAY } from './support/midday-clock.mjs';
import * as M from '../src/model.ts';
import * as H from '../src/helper.ts';
import * as F from '../src/friends.ts';
import { applyGameAction } from '../src/actions.ts';

const at = (h: number, m = 30) => Date.UTC(2026, 0, 6, h, m);
function garden(now: number) {
  const s = M.newGame('Ann'); s.energy = 5000; assert.equal(H.buyHelper(s), 'bought');
  for (const i of [0, 1]) { s.plots[i].crop = 'radish'; s.plots[i].plantedAt = now - M.CROPS.radish.duration - H.GROWN_HOLD_MS - 1000; }
  s.friends = [{ id: 'pepper', role: 'cook', rescuedAt: 1, gear: {}, home: true }];
  return s;
}

test('the midday clock seam puts the test process at 12:xx UTC, a working hour for every helper', () => {
  assert.equal(new Date(MIDDAY).getUTCHours(), 12); assert.equal(new Date(Date.now()).getUTCHours(), 12);
  assert.equal(M.onBreak('robot', Date.now()), false); assert.equal(M.onBreak('cook', Date.now()), false);
});

test('Bolt rests 21:00-24:00 UTC: no task, a refused harvest says so, and "work now" brings him back for 30 minutes', () => {
  for (const h of [21, 22, 23]) assert.equal(M.onBreak('robot', at(h)), true, `${h}:30`);
  for (const h of [0, 12, 20]) assert.equal(M.onBreak('robot', at(h)), false, `${h}:30`);
  const now = at(22), s = garden(now);
  assert.equal(H.nextTask(s, { x: 0, z: 0 }, now), null);
  assert.throws(() => applyGameAction(s, { type: 'helperHarvest', payload: { index: 0 } }, { now, random: Math.random }), /Bolt is resting right now/);
  assert.equal(H.callHelper(s, now), true);
  assert.equal(H.nextTask(s, { x: 0, z: 0 }, now)?.kind, 'harvest');
  assert.equal(H.nextTask(s, { x: 0, z: 0 }, now + M.CALL_MS + 1), null, 'the call lasts 30 minutes');
  const day = garden(at(12)); assert.equal(H.nextTask(day, { x: 0, z: 0 }, at(12))?.kind, 'harvest');
});

test('the cook rests the last hour of every four (03, 07, 11, 15, 19, 23 UTC) and works the rest', () => {
  for (const h of [3, 7, 11, 15, 19, 23]) assert.equal(M.onBreak('cook', at(h)), true, `${h}:30`);
  for (const h of [0, 4, 8, 12, 16, 20]) assert.equal(M.onBreak('cook', at(h)), false, `${h}:30`);
  const rest = at(7), s = garden(rest);
  assert.equal(F.nextFriendTask(s, 'pepper', { x: 0, z: 0 }, rest), null);
  assert.equal(F.nextFriendTask(s, 'pepper', { x: 0, z: 0 }, at(12))?.kind, 'harvest');
  assert.equal(F.callFriend(s, 'pepper', rest), true); assert.equal(F.nextFriendTask(s, 'pepper', { x: 0, z: 0 }, rest)?.kind, 'harvest');
});

test('review: a switched-off Bolt is not offered "work now" during his rest, and the call never switches him back on', async () => {
  const { helperPanel } = await import('../src/helper-ui.ts'), { autoPlanting } = await import('../src/auto-plant.ts');
  const real = Date.now; Date.now = () => at(22);
  try {
    const s = garden(at(22)); assert.equal(H.setHelperPaused(s, true), true);
    const ui = { esc: (v: string) => v, mini: (v: string) => v, picture: '' };
    assert.doesNotMatch(helperPanel(s, ui), /helper-call/, 'no call button for a robot that is switched off');
    assert.equal(H.callHelper(s, at(22)), false); assert.equal(s.helper!.paused, true); assert.equal(autoPlanting(s), false, 'hand planting stays on');
    H.setHelperPaused(s, false); assert.match(helperPanel(s, ui), /helper-call/, 'a resting robot that is on gets the button');
  } finally { Date.now = real; }
});

test('review: the bed panel does not promise that a resting Bolt plants now', async () => {
  const { bedPlan } = await import('../src/auto-plant-ui.ts');
  const real = Date.now;
  try {
    const s = garden(at(22)); s.plots[2].crop = null;
    Date.now = () => at(22); assert.equal(bedPlan(s, 2).who, 'you'); assert.match(bedPlan(s, 2).text, /daily rest/);
    Date.now = () => at(12); assert.equal(bedPlan(s, 2).who, 'helper');
  } finally { Date.now = real; }
});
