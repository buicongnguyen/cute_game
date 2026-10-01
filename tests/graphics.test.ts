import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GraphicsGovernor, QUALITY } from '../src/graphics.ts';

const phone = { mobile: true, devicePixelRatio: 3 }, desktop = { mobile: false, devicePixelRatio: 2 };
function feed(governor: GraphicsGovernor, fps: number, seconds: number, playing = true) {
  const changes: string[] = [];
  for (let i = 0; i < Math.round(fps * seconds); i++) { const change = governor.sample(1 / fps, playing); if (change) changes.push(change); }
  return changes;
}

test('phones start balanced and desktops start sharp, capped by the screen density', () => {
  const p = new GraphicsGovernor(phone), d = new GraphicsGovernor(desktop), lowDensity = new GraphicsGovernor({ mobile: false, devicePixelRatio: 1 });
  assert.equal(p.level, 'medium'); assert.equal(p.ratio, QUALITY.medium.ratio);
  assert.equal(d.level, 'high'); assert.equal(d.ratio, 2);
  assert.equal(lowDensity.ratio, 1);
});

/** Feed frames until the governor changes something (or give up after a minute). */
function nextChange(governor: GraphicsGovernor, fps: number) {
  for (let i = 0; i < fps * 60; i++) { const change = governor.sample(1 / fps, true); if (change) return change; }
  return null;
}

test('a slow device loses resolution first, then quality, and recovers both when fast', () => {
  const g = new GraphicsGovernor(desktop);
  assert.deepEqual(feed(g, 30, 2.5), [], 'two slow seconds are tolerated');
  assert.equal(nextChange(g, 30), 'ratio'); assert.equal(g.ratio, 1.75);
  for (const expected of [1.5, 1.25, 1]) { assert.equal(nextChange(g, 30), 'ratio'); assert.equal(g.ratio, expected); }
  assert.equal(nextChange(g, 30), 'level'); assert.equal(g.level, 'medium');
  assert.equal(nextChange(g, 30), 'level'); assert.equal(g.level, 'low'); assert.equal(g.ratio, .85);
  assert.equal(nextChange(g, 30), 'ratio'); assert.equal(g.ratio, .7, 'as a last resort resolution drops to 0.7×');
  assert.equal(nextChange(g, 30), null, 'nothing below that');
  assert.equal(nextChange(g, 60), 'ratio'); assert.equal(g.ratio, .85, 'a fast device recovers up to the level target');
  assert.equal(nextChange(g, 60), 'level'); assert.equal(g.level, 'medium', 'ten good seconds at full resolution step back up a level');
  const recovery: string[] = []; for (let change = nextChange(g, 60); change; change = nextChange(g, 60)) recovery.push(change);
  assert.deepEqual(recovery, ['ratio', 'ratio', 'level', 'ratio', 'ratio', 'ratio'], 'back to the sharp level at full resolution, and no further');
  assert.equal(g.level, 'high'); assert.equal(g.ratio, 2);
});

test('a short slow spike lowers quality for the moment but is never remembered', () => {
  const g = new GraphicsGovernor(phone);
  feed(g, 20, 9.5); assert.equal(g.level, 'low'); assert.equal(g.ratio, .7);
  assert.equal(g.takeSave(), false); assert.equal(g.toJSON().autoLevel, null, 'the spike is not saved');
  feed(g, 60, 14); assert.equal(g.level, 'medium', 'good frames bring the level back'); assert.equal(g.ratio, 1.25);
  feed(g, 60, 70); assert.equal(g.takeSave(), false); assert.deepEqual(g.toJSON(), { setting: 'auto', autoLevel: null });
});

test('a level that holds through a minute of play is remembered for the next visit', () => {
  const g = new GraphicsGovernor(phone);
  feed(g, 20, 50); assert.equal(g.level, 'low'); assert.equal(g.takeSave(), false, 'not yet: it has held for under a minute');
  feed(g, 20, 20); assert.equal(g.takeSave(), true); assert.equal(g.takeSave(), false, 'reported once');
  assert.deepEqual(g.toJSON(), { setting: 'auto', autoLevel: 'low' });
  assert.equal(new GraphicsGovernor(phone, g.toJSON()).level, 'low');
  // Menus and the settling seconds after landing break a slow streak.
  const paused = new GraphicsGovernor(phone); feed(paused, 20, 2.5); feed(paused, 20, 5, false); feed(paused, 20, 1.5); assert.equal(paused.ratio, 1.25);
});

test('a step up that fails soon after waits twice as long before the next try', () => {
  const g = new GraphicsGovernor(phone);
  feed(g, 20, 7.5); assert.equal(g.level, 'low');
  feed(g, 60, 12); assert.equal(g.level, 'medium');
  feed(g, 20, 7.5); assert.equal(g.level, 'low', 'the step up did not hold');
  feed(g, 60, 15); assert.equal(g.level, 'low', 'ten good seconds are no longer enough');
  feed(g, 60, 8); assert.equal(g.level, 'medium', 'twenty are');
});

test('manual choices and paused play are never adjusted', () => {
  const g = new GraphicsGovernor(desktop);
  g.choose('high'); feed(g, 20, 10); assert.equal(g.level, 'high'); assert.equal(g.ratio, 2);
  const auto = new GraphicsGovernor(desktop); feed(auto, 20, 10, false); assert.equal(auto.level, 'high');
});

test('stored choices and the legacy low-graphics flag are respected', () => {
  assert.equal(new GraphicsGovernor(desktop, { setting: 'low' }).level, 'low');
  assert.equal(new GraphicsGovernor(desktop, null, true).level, 'low');
  assert.equal(new GraphicsGovernor(desktop, { setting: 'auto', autoLevel: 'medium' }).level, 'medium');
  assert.equal(new GraphicsGovernor(desktop, { setting: 'bogus' as never }).setting, 'auto');
});
