import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatTimers, FishingInput, MovementControls } from '../src/gameplay-controls.ts';

test('releasing an attack finger preserves a held movement finger and keyboard direction', () => {
  const keys = new Set<string>(), controls = new MovementControls(keys);
  controls.pressKey('ArrowLeft'); controls.pressPointer(1, 'ArrowUp');
  controls.releasePointer(2);
  assert.deepEqual([...keys].sort(), ['ArrowLeft', 'ArrowUp']);
  controls.releasePointer(1);
  assert.deepEqual([...keys], ['ArrowLeft']);
  controls.releaseKey('ArrowLeft'); assert.equal(keys.size, 0);
});

test('independent movement pointers and keyboard presses can hold the same direction', () => {
  const keys = new Set<string>(), controls = new MovementControls(keys);
  controls.pressKey('ArrowUp'); controls.pressPointer(3, 'ArrowUp'); controls.pressPointer(4, 'ArrowRight');
  controls.releaseKey('ArrowUp'); assert.equal(keys.has('ArrowUp'), true);
  controls.releasePointer(4); assert.deepEqual([...keys], ['ArrowUp']);
  controls.clear(); assert.equal(keys.size, 0);
  controls.releasePointer(3); assert.equal(keys.size, 0);
});

test('pausing gameplay freezes attack, invulnerability, and all skill clocks', () => {
  const timers = new CombatTimers();
  timers.attackCooldown = .58; timers.invulnerable = .55; timers.skills.splice(0, 4, 5, 3, 7, 12);
  timers.advance(30, false);
  assert.equal(timers.attackCooldown, .58); assert.equal(timers.invulnerable, .55);
  assert.deepEqual(timers.skills, [5, 3, 7, 12]);
  timers.advance(1, true);
  assert.equal(timers.attackCooldown, 0); assert.equal(timers.invulnerable, 0);
  assert.deepEqual(timers.skills, [4, 2, 6, 11]);
  timers.reset(); assert.deepEqual(timers.skills, [0, 0, 0, 0]);
});

test('a fishing bite enables and focuses Reel for native Enter activation', () => {
  const input = new FishingInput(); let focused = 'close';
  const reel = { disabled: true, focus() { focused = 'reel'; } };
  input.toggle(); input.holdSpace(); input.pressPointer(1); assert.equal(input.held, false);
  input.enable(reel); assert.equal(reel.disabled, false); assert.equal(focused, 'reel');
  input.toggle(); assert.equal(input.held, true); assert.equal(input.keyboardToggle, true);
  input.toggle(); assert.equal(input.held, false);
});

test('fishing releases only the matching input and clears all holds when paused or closed', () => {
  const input = new FishingInput(); input.enable({ disabled: true, focus() {} });
  input.pressPointer(1); input.releasePointer(2); assert.equal(input.held, true);
  input.holdSpace(); input.releasePointer(1); assert.equal(input.held, true);
  input.releaseSpace(); assert.equal(input.held, false);
  input.toggle(); input.clear(); assert.equal(input.held, false);
  input.holdSpace(); assert.equal(input.keyboardToggle, false); assert.equal(input.held, true);
});
