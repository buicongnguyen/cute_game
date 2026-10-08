import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_GRAPHICS_VERSION, GraphicsGovernor, QUALITY, PHONE_AUTO_RATIO, RESOLUTION, resolutionCap, isResolution, type StoredGraphics } from '../src/graphics.ts';

const phone = { mobile: true, devicePixelRatio: 3 }, desktop = { mobile: false, devicePixelRatio: 2 };
/** A phone with Render resolution set to Sharp: the governor behaves as before the phone cap (these tests are about the governor). */
function sharpPhone(stored?: StoredGraphics | null, legacyLow = false) { const g = new GraphicsGovernor(phone, stored, legacyLow); g.setResolution('sharp'); return g; }
function feed(governor: GraphicsGovernor, fps: number, seconds: number, playing = true) {
  const changes: string[] = [];
  for (let i = 0; i < Math.round(fps * seconds); i++) { const change = governor.sample(1 / fps, playing); if (change) changes.push(change); }
  return changes;
}

test('Sharp phones and desktops start equally sharp, capped by the screen density', () => {
  const p = sharpPhone(), d = new GraphicsGovernor(desktop), lowDensity = new GraphicsGovernor({ mobile: false, devicePixelRatio: 1 });
  assert.equal(p.level, 'high'); assert.equal(p.ratio, QUALITY.high.ratio);
  assert.equal(d.level, 'high'); assert.equal(d.ratio, 2);
  assert.equal(lowDensity.ratio, 1);
  { const mid = new GraphicsGovernor({ mobile: true, devicePixelRatio: 1.5 }); assert.equal(mid.ratio, 1.25, 'Auto'); mid.setResolution('sharp'); assert.equal(mid.ratio, 1.5); }
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
  const g = sharpPhone();
  feed(g, 20, 24.5); assert.equal(g.level, 'low'); assert.equal(g.ratio, .7);
  assert.equal(g.takeSave(), false); assert.equal(g.toJSON().autoLevel, null, 'the spike is not saved');
  feed(g, 60, 14); assert.equal(g.level, 'medium', 'good frames bring the level back'); assert.equal(g.ratio, 1.25);
  feed(g, 60, 70); assert.equal(g.level, 'high'); assert.equal(g.ratio, 2); assert.equal(g.takeSave(), false); assert.deepEqual(g.toJSON(), { setting: 'auto', autoLevel: null, autoVersion: AUTO_GRAPHICS_VERSION });
});

test('a level that holds through a minute of play is remembered for the next visit', () => {
  const g = sharpPhone();
  feed(g, 20, 50); assert.equal(g.level, 'low'); assert.equal(g.takeSave(), false, 'not yet: it has held for under a minute');
  feed(g, 20, 35); assert.equal(g.takeSave(), true); assert.equal(g.takeSave(), false, 'reported once');
  assert.deepEqual(g.toJSON(), { setting: 'auto', autoLevel: 'low', autoVersion: AUTO_GRAPHICS_VERSION });
  assert.equal(sharpPhone(g.toJSON()).level, 'low');
  // Menus and the settling seconds after landing break a slow streak.
  const paused = sharpPhone(); feed(paused, 20, 2.5); feed(paused, 20, 5, false); feed(paused, 20, 1.5); assert.equal(paused.ratio, 2);
});

test('a step up that fails soon after waits twice as long before the next try', () => {
  const g = sharpPhone();
  feed(g, 20, 22.5); assert.equal(g.level, 'low');
  feed(g, 60, 12); assert.equal(g.level, 'medium');
  feed(g, 20, 7.5); assert.equal(g.level, 'low', 'the step up did not hold');
  feed(g, 60, 15); assert.equal(g.level, 'low', 'ten good seconds are no longer enough');
  feed(g, 60, 8); assert.equal(g.level, 'medium', 'twenty are');
});

test('mobile auto reduces rendering work before resolution and restores effects after sustained recovery', () => {
  const g = sharpPhone(), start = g.profile;
  assert.equal(nextChange(g, 30), 'effects');
  assert.equal(g.level, 'high'); assert.equal(g.ratio, 2, 'the first fallback keeps the original pixel dimensions');
  assert.equal(g.profile.ratio, start.ratio); assert.equal(g.profile.outlines, start.outlines);
  assert.equal(g.profile.shadow, 0, 'remove the complete shadow pass');
  assert.ok(g.profile.particles < .6, 'world draws half of decorative grass/flowers at this density');
  assert.deepEqual(g.toJSON(), { setting: 'auto', autoLevel: null, autoVersion: AUTO_GRAPHICS_VERSION }, 'a temporary effects fallback is never saved as low quality');
  feed(g, 60, 10); assert.equal(g.profile.shadow, 0, 'brief recovery cannot flicker shadows');
  assert.equal(nextChange(g, 60), 'effects');
  assert.equal(g.profile, start); assert.equal(g.ratio, 2);

  assert.equal(nextChange(g, 30), 'effects');
  assert.equal(nextChange(g, 30), 'ratio', 'resolution remains a last fallback if less drawing is still insufficient');
  assert.equal(g.ratio, 1.75);
  g.choose('high'); feed(g, 20, 20);
  assert.equal(g.profile, QUALITY.high); assert.equal(g.ratio, 2, 'explicit Sharp remains sharp, including full shadows');
  g.choose('medium'); feed(g, 20, 20);
  assert.equal(g.profile, QUALITY.medium); assert.equal(g.ratio, 1.25, 'explicit Balanced remains fixed');
});

test('a remembered Sharp auto level also restores mobile shadows after recovery', () => {
  const g = sharpPhone({ setting: 'auto', autoLevel: 'high', autoVersion: AUTO_GRAPHICS_VERSION });
  assert.equal(nextChange(g, 30), 'effects');
  assert.equal(g.ratio, 2); assert.equal(g.profile.outlines, true);
  assert.equal(nextChange(g, 60), 'effects');
  assert.equal(g.level, 'high'); assert.equal(g.profile, QUALITY.high);
});

test('old mobile automatic levels reset once while current learned and explicit choices remain intact', () => {
  for (const autoLevel of ['low', 'medium'] as const) {
    const g = sharpPhone({ setting: 'auto', autoLevel });
    assert.equal(g.level, 'high'); assert.equal(g.ratio, 2);
    assert.equal(g.takeSave(), true, 'persist the migration immediately'); assert.equal(g.takeSave(), false);
    const reloaded = sharpPhone(g.toJSON());
    assert.equal(reloaded.level, 'high'); assert.equal(reloaded.takeSave(), false, 'migration runs only once');
    const learned = sharpPhone({ setting: 'auto', autoLevel, autoVersion: AUTO_GRAPHICS_VERSION });
    assert.equal(learned.level, autoLevel); assert.equal(learned.takeSave(), false, 'new performance measurements survive reload');
  }
  for (const setting of ['low', 'medium', 'high'] as const) {
    const g = sharpPhone({ setting, autoLevel: 'low' });
    assert.equal(g.level, setting); assert.equal(g.ratio, QUALITY[setting].ratio);
    assert.equal(g.takeSave(), false, 'explicit preferences never require migration');
  }
  assert.equal(sharpPhone(null, true).level, 'low', 'legacy explicit battery saver is respected');
  assert.equal(new GraphicsGovernor(desktop, { setting: 'auto', autoLevel: 'medium' }).level, 'medium', 'desktop learned preferences are unchanged');
});

test('manual choices and paused play are never adjusted', () => {
  const g = new GraphicsGovernor(desktop);
  g.choose('high'); feed(g, 20, 10); assert.equal(g.level, 'high'); assert.equal(g.ratio, 2);
  const auto = new GraphicsGovernor(desktop); feed(auto, 20, 10, false); assert.equal(auto.level, 'high');
});

test('even a brief pause discards partial samples and breaks the slow-frame streak', () => {
  const g = sharpPhone();
  feed(g, 20, 2.5);
  assert.equal(g.sample(.01, false), null);
  assert.deepEqual(feed(g, 20, .55), [], 'the old two slow seconds must not carry across a menu or background pause');
  assert.equal(g.profile, QUALITY.high);
  assert.equal(nextChange(g, 20), 'effects', 'three fresh slow seconds still trigger the normal fallback');

  const resumed = sharpPhone();
  feed(resumed, 20, 2.5); resumed.sample(0, false);
  assert.deepEqual(feed(resumed, 60, 1), [], 'a visibility event can reset the window without adding a frame');
  assert.ok(resumed.fps > 59, 'the resumed estimate only measures visible frames');
});

test('choosing graphics discards frames measured under the previous setting', () => {
  const g = sharpPhone(); feed(g, 2, .5); g.choose('auto');
  feed(g, 60, 1); assert.ok(g.fps > 59);
  for (const dt of [0, -1, NaN, Infinity]) assert.equal(g.sample(dt, true), null);
  assert.ok(Number.isFinite(g.fps)); assert.equal(g.profile, QUALITY.high);
});

test('stored choices and the legacy low-graphics flag are respected', () => {
  assert.equal(new GraphicsGovernor(desktop, { setting: 'low' }).level, 'low');
  assert.equal(new GraphicsGovernor(desktop, null, true).level, 'low');
  assert.equal(new GraphicsGovernor(desktop, { setting: 'auto', autoLevel: 'medium' }).level, 'medium');
  assert.equal(new GraphicsGovernor(desktop, { setting: 'bogus' as never }).setting, 'auto');
});

test('Render resolution: Auto caps phones at the reference 1.25x (487x1055 at 390x844) and leaves desktops alone; choices are ceilings', () => {
  const p = new GraphicsGovernor(phone), d = new GraphicsGovernor(desktop);
  assert.equal(p.resolution, 'auto'); assert.equal(p.ratio, PHONE_AUTO_RATIO); assert.equal(Math.round(390 * p.ratio), 488); assert.equal(Math.round(844 * p.ratio), 1055);
  assert.equal(d.ratio, 2, 'desktop Auto is unchanged');
  p.setResolution('sharp'); assert.equal(p.ratio, 2); p.setResolution('balanced'); assert.equal(p.ratio, 1.25); p.setResolution('saver'); assert.equal(p.ratio, RESOLUTION.saver.ratio);
  d.setResolution('balanced'); assert.equal(d.ratio, 1.25); d.choose('low'); assert.equal(d.ratio, QUALITY.low.ratio, 'the Graphics level may go lower still');
  assert.equal(new GraphicsGovernor({ mobile: true, devicePixelRatio: 1 }).ratio, 1, 'never above the screen density');
  assert.equal(resolutionCap('auto', false), Infinity); assert.equal(isResolution('sharp'), true); assert.equal(isResolution('ultra'), false);
  p.setResolution('bogus' as never); assert.equal(p.resolution, 'auto');
});
