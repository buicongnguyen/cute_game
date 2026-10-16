// Settings > Controls: the pure rules of custom layouts (controls-layout.ts), the per-device preferences (controls-prefs.ts)
// and PC key rebinding (controls-keys.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clampInto, conflictsOf, dragTo, fitLayout, fromSpot, layoutConflict, MIN_TAP, scaledButton, screenType, snap, toSpot, cleanLayout, type Box } from '../src/controls-layout.ts';
import { CONTROLS_STORE, readControls, saveControls, skillSide } from '../src/controls-prefs.ts';
import { bindingKey, cleanKeys, effectiveKeys, jumpKeyUp, keyLabel, presetKeys, rebind, refusal, translateKey, type KeyContext } from '../src/controls-keys.ts';
import { controlsSectionHtml, keysPanelHtml } from '../src/controls-html.ts';
import { keysGuideHtml } from '../src/hud-keys.ts';
import { CONTROLS_VI } from '../src/locales/vi-controls.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';

const phone = { w: 390, h: 844 }, safe: Box = { l: 4, t: 4, w: 382, h: 836 };
const box = (l: number, t: number, w = 60, h = 60): Box => ({ l, t, w, h });

test('screen types: the paw screens by orientation, the PC tray otherwise', () => {
  assert.equal(screenType({ w: 390, h: 844 }, true), 'portrait');
  assert.equal(screenType({ w: 844, h: 390 }, true), 'landscape');
  assert.equal(screenType({ w: 1600, h: 900 }, false), 'desktop');
  // A narrow desktop window uses the paw layout, so it shares the phone layouts (the CSS does the same).
  assert.equal(screenType({ w: 800, h: 900 }, true), 'portrait');
});

test('dragging snaps the corner to the 8 px grid and stays inside the safe area', () => {
  assert.equal(snap(13), 16); assert.equal(snap(11), 8); assert.equal(snap(-3), -0);
  const b = dragTo(box(100, 600), 13, -21, safe);
  assert.deepEqual([b.l % 8, b.t % 8], [0, 0]); assert.deepEqual([b.l, b.t], [112, 576]);
  const out = dragTo(box(300, 760), 500, 500, safe);
  assert.equal(out.l + out.w, safe.l + safe.w); assert.equal(out.t + out.h, safe.t + safe.h);
  assert.deepEqual(clampInto(box(-50, -50), safe), box(4, 4));
});

test('a drop over the map, the hero card, the dock, the quests or another button is refused, and named', () => {
  const others = [{ name: 'map', box: box(240, 10, 140, 140) }, { name: 'attack', box: box(300, 760, 70, 70) }];
  assert.deepEqual(conflictsOf(box(250, 100), safe, others), ['map']);
  assert.deepEqual(conflictsOf(box(290, 740), safe, others), ['attack']);
  assert.deepEqual(conflictsOf(box(100, 400), safe, others), []);
  assert.deepEqual(conflictsOf(box(0, 400), safe, others), ['edge']);
  // Touching edges is not an overlap (8 px grids put neighbours edge to edge).
  assert.deepEqual(conflictsOf(box(240, 150), safe, others), []);
});

test('spots anchor to the nearest corner and survive another screen size', () => {
  const b = box(300, 740, 70, 70), s = toSpot(b, phone);
  assert.equal(s.h, 'r'); assert.equal(s.v, 'b');
  assert.deepEqual(fromSpot(s, { w: 70, h: 70 }, phone), b);
  // A slightly taller phone keeps the button the same fraction away from its corner.
  const taller = fromSpot(s, { w: 70, h: 70 }, { w: 390, h: 900 });
  assert.equal(taller.l, 300); assert.equal(900 - (taller.t + 70), Math.round(s.y * 900));
  assert.equal(toSpot(box(10, 10), phone).h, 'l'); assert.equal(toSpot(box(10, 10), phone).v, 't');
});

test('a saved layout that no longer fits falls back to the default; one that fits is placed', () => {
  const layout = { attack: toSpot(box(300, 600, 70, 70), phone), skills: toSpot(box(20, 640, 150, 120), phone) };
  const sizes = { attack: { w: 70, h: 70 }, skills: { w: 150, h: 120 } };
  const placed = fitLayout(layout, sizes, phone, safe, [{ name: 'map', box: box(240, 10, 140, 140) }]);
  assert.ok(placed); assert.deepEqual(placed!.attack, box(300, 600, 70, 70));
  // Turned sideways the portrait spots put the attack on the map there: default instead.
  const land = { w: 844, h: 390 }, landSafe = { l: 4, t: 4, w: 836, h: 382 };
  assert.ok(fitLayout(layout, sizes, land, landSafe, []));
  assert.equal(fitLayout(layout, sizes, land, landSafe, [{ name: 'map', box: box(700, 200, 140, 140) }]), null);
  // A part pushed past the safe area (a notch inset) does not fit either.
  assert.equal(fitLayout(layout, sizes, phone, { l: 4, t: 4, w: 340, h: 836 }, []), null);
  // A part that is not shown (no size) is skipped.
  assert.ok(fitLayout({ ...layout, jump: toSpot(box(300, 600), phone) }, sizes, phone, safe, []));
  // Only the placed parts are checked when asked: two default parts touching are the default sheets' business.
  assert.deepEqual(layoutConflict({ attack: box(300, 600), eat: box(0, 0, 50, 50), stick: box(20, 20) }, safe, [], ['attack']), null);
  assert.ok(layoutConflict({ attack: box(300, 600), eat: box(0, 0, 50, 50), stick: box(20, 20) }, safe, []));
});

test('stored layouts and preferences are cleaned on reading and kept per device', () => {
  assert.equal(cleanLayout({ attack: { h: 'x', v: 'b', x: .1, y: .1 } }), null);
  assert.deepEqual(cleanLayout({ attack: { h: 'r', v: 'b', x: .1, y: .2 }, junk: 1 }), { attack: { h: 'r', v: 'b', x: .1, y: .2 } });
  const mem = new Map<string, string>(), store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  assert.deepEqual(readControls(store), {});
  saveControls(store, { side: 'left', size: 'large', opacity: 60, layouts: { landscape: { stick: { h: 'r', v: 'b', x: .02, y: .05 } } } });
  assert.ok(mem.has(CONTROLS_STORE));
  const back = readControls(store);
  assert.equal(back.side, 'left'); assert.equal(back.size, 'large'); assert.equal(back.opacity, 60);
  assert.deepEqual(Object.keys(back.layouts!), ['landscape']);
  mem.set(CONTROLS_STORE, JSON.stringify({ size: 'huge', opacity: 33, side: 'up' }));
  assert.deepEqual(readControls(store), {});
  mem.set(CONTROLS_STORE, '{bad'); assert.deepEqual(readControls(store), {});
  assert.deepEqual(readControls(null), {});
});

test('skill side: the choice wins; old saves keep the paw opposite their joystick side', () => {
  assert.equal(skillSide({}, undefined), 'right');
  assert.equal(skillSide({}, 'left'), 'right');
  assert.equal(skillSide({}, 'right'), 'left');
  assert.equal(skillSide({ side: 'right' }, 'right'), 'right');
});

test('button sizes never drop under a 44 px touch target, and the CSS clamps the same way', () => {
  assert.equal(scaledButton(50, 'small'), 44); assert.equal(scaledButton(60, 'small'), 51);
  assert.equal(scaledButton(44, 'large'), 52.8); assert.equal(scaledButton(46, 'normal'), 46);
  for (const base of [44, 46, 50, 54, 60]) for (const s of ['small', 'normal', 'large'] as const) assert.ok(scaledButton(base, s) >= MIN_TAP);
  const css = readFileSync(new URL('../src/controls.css', import.meta.url), 'utf8');
  assert.match(css, /--sk: max\(44px,/);
});

const wasd: KeyContext = { layout: 'wasd', air: true, space: 'jump' }, classic: KeyContext = { layout: 'classic', air: true, space: 'jump' };

test('presets: the keys the game always had', () => {
  assert.deepEqual(presetKeys(classic).skill0, ['q']); assert.deepEqual(presetKeys(wasd).skill3, [';']);
  assert.deepEqual(presetKeys(wasd).attack, ['n']); assert.deepEqual(presetKeys({ ...wasd, space: 'attack' }).attack, [' ', 'n']);
  assert.deepEqual(presetKeys({ ...wasd, space: 'attack' }).jump, ['ShiftLeft']);
  assert.deepEqual(presetKeys({ ...wasd, air: false }).attack, [' ']); assert.deepEqual(presetKeys({ ...wasd, air: false }).jump, []);
});

test('rebinding: a free key just moves; a used key swaps; keys the game needs are refused', () => {
  const a = rebind({}, 'attack', 'g', wasd); assert.ok(a.ok); assert.deepEqual(a.ok && a.keys, { attack: 'g' });
  const b = rebind(a.ok ? a.keys : {}, 'skill0', 'g', wasd);
  assert.ok(b.ok); assert.deepEqual(b.ok && b.keys, { attack: 'j', skill0: 'g' }); assert.equal(b.ok && b.swapped, 'attack');
  assert.deepEqual(rebind({}, 'eat', 'w', wasd), { ok: false, reason: 'move' });
  assert.ok(rebind({}, 'eat', 'w', classic).ok && rebind({}, 'eat', 'w', classic).ok); // W is the second skill there: a swap
  assert.equal((rebind({}, 'eat', 'w', classic) as { swapped?: string }).swapped, 'skill1');
  assert.deepEqual(rebind({}, 'eat', 'ArrowUp', classic), { ok: false, reason: 'move' });
  assert.deepEqual(rebind({}, 'eat', 'i', wasd), { ok: false, reason: 'menu' });
  assert.deepEqual(rebind({}, 'eat', 'p', wasd), { ok: false, reason: 'menu' }); // the WASD journal
  assert.deepEqual(rebind({}, 'eat', 'Escape', wasd), { ok: false, reason: 'system' });
  // Jump has no key while jumping is off, so it cannot hand one over in a swap.
  assert.deepEqual(rebind({}, 'jump', 'h', { ...wasd, air: false }), { ok: false, reason: 'taken' });
  // Binding the key it already has changes nothing.
  assert.deepEqual(rebind({}, 'eat', 'h', wasd), { ok: true, keys: {} });
});

test('effective keys: a custom key replaces the preset one and frees it', () => {
  const k = effectiveKeys({ ...wasd, space: 'attack' }, { jump: ' ' });
  assert.deepEqual(k.jump, [' ']); assert.deepEqual(k.attack, ['n']);
  assert.deepEqual(cleanKeys({ attack: 'g', eat: 'g', skill0: 'w', jump: 7, x: 'q' }, wasd), { attack: 'g' });
});

test('translateKey: custom keys read as their preset key, moved preset keys are ignored, others pass', () => {
  const custom = { attack: 'j', skill0: 'g' }; // the swap above
  assert.deepEqual(translateKey('g', 'KeyG', wasd, custom), { key: 'j', code: 'KeyJ' });
  assert.deepEqual(translateKey('j', 'KeyJ', wasd, custom), { key: 'n', code: 'KeyN' });
  assert.equal(translateKey('n', 'KeyN', wasd, custom), null); // the attack moved off N
  assert.deepEqual(translateKey('k', 'KeyK', wasd, custom), { key: 'k', code: 'KeyK' });
  assert.deepEqual(translateKey('x', 'KeyX', wasd, custom), { key: 'x', code: 'KeyX' });
  assert.deepEqual(translateKey('n', 'KeyN', wasd, {}), { key: 'n', code: 'KeyN' });
  // A custom jump reads as Space for the code-only jump rules; letting go of it ends the hold.
  assert.deepEqual(translateKey('v', 'KeyV', wasd, { jump: 'v' }), { key: ' ', code: 'Space' });
  assert.equal(translateKey(' ', 'Space', wasd, { jump: 'v' }), null);
  assert.ok(jumpKeyUp('v', wasd, { jump: 'v' })); assert.ok(!jumpKeyUp('v', wasd, {}));
});

test('physical keys: Vietnamese Telex and VNI press the same buttons; composing never counts', () => {
  assert.equal(bindingKey({ code: 'BracketRight', key: 'ơ' }), ']');
  assert.equal(bindingKey({ code: 'KeyW', key: 'ư' }), 'w');
  assert.equal(bindingKey({ code: 'Digit1', key: 'á' }), '1');
  assert.equal(bindingKey({ code: 'ShiftLeft', key: 'Shift' }), 'ShiftLeft');
  assert.equal(bindingKey({ code: 'KeyA', key: 'a', isComposing: true }), '');
  assert.equal(bindingKey({ code: 'KeyA', key: 'a', ctrlKey: true }), '');
  assert.equal(keyLabel(' '), 'Space'); assert.equal(keyLabel('ShiftLeft'), 'Shift'); assert.equal(keyLabel(';'), ';'); assert.equal(keyLabel('g'), 'G');
});

test('the keyboard guide shows custom keys; without them it is exactly the preset guide', () => {
  const plain = keysGuideHtml('wasd', false, 'jump');
  const custom = keysGuideHtml('wasd', false, 'jump', effectiveKeys(wasd, { attack: 'j', skill0: 'g' }));
  assert.match(custom, /<kbd>G<\/kbd><kbd>K<\/kbd>/); assert.match(custom, /<kbd>J<\/kbd>/); assert.doesNotMatch(custom, /<kbd>N<\/kbd>/);
  assert.match(plain, /<kbd>N<\/kbd>/);
});

test('the Controls section and the keys panel have every label, and Vietnamese for each', () => {
  const keys = effectiveKeys(wasd, {});
  const html = controlsSectionHtml({ side: 'left', size: 'large', opacity: 60, joystick: true, screen: 'portrait', custom: true, fallback: false, pc: true, keys, customKeys: false }, '<i>joy</i>', '<i>kb</i>');
  for (const s of ['Skill buttons side', 'Button size', 'Button opacity', 'Move buttons', 'Change keys', '<i>joy</i>', '<i>kb</i>']) assert.ok(html.includes(s), s);
  assert.match(html, /data-action="ctl-side" data-kind="left"/); assert.match(html, /aria-checked="true" class="on" data-action="ctl-opacity" data-kind="60"/);
  assert.doesNotMatch(controlsSectionHtml({ side: 'left', size: 'large', opacity: 60, joystick: true, screen: 'portrait', custom: true, fallback: false, pc: false, keys, customKeys: false }, '', ''), /ctl-keys/);
  const panel = keysPanelHtml(keys, { listening: 'attack', status: '', air: false, skillNames: ['Petal Gale'] });
  assert.match(panel, /listening/); assert.match(panel, /data-kind="jump"[^>]*disabled/);
  for (const [k, v] of Object.entries(CONTROLS_VI)) { assert.equal(VI_PACK[k], v, k); assert.notEqual(v, k); }
});
