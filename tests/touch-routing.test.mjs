import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { FishingInput, MovementControls } from '../src/gameplay-controls.ts';
import { AttackHold, HOLD } from '../src/five-rules.ts';

const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const flightStart = source.indexOf("$('#world').addEventListener('pointerdown',event=>{if(!flight");
assert.ok(flightStart >= 0, 'the real flight touch routing is available');
const flightRouting = source.slice(flightStart, source.indexOf("app.addEventListener('click'", flightStart));
const groundStart = source.indexOf("document.addEventListener('pointerdown',e=>");
const groundRouting = source.slice(groundStart, source.indexOf('let previous=', groundStart));
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function surface(id = '', dataset = {}) {
  const listeners = new Map(), captures = new Set();
  return {
    id, dataset, captures, disabled: false,
    closest() { return this; },
    addEventListener(type, handler) { const handlers = listeners.get(type) ?? []; handlers.push(handler); listeners.set(type, handlers); },
    fire(type, event) { for (const handler of listeners.get(type) ?? []) handler(event); },
    setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); }, releasePointerCapture(id) { captures.delete(id); },
  };
}
function fixture() {
  const world = surface('world'), boost = surface('boost-button'), document = surface(), window = surface();
  const keys = new Set(), movement = new MovementControls(keys), cleared = [], attackHold = new AttackHold(), attacks = [];
  const ctx = vm.createContext({ document, window, addEventListener: window.addEventListener.bind(window), $: id => id === '#world' ? world : boost,
    jumpInput: { down() {}, up() {}, clear() {} }, jumpPointers: new Set(), attackHold, attackPointers: new Set(), worldHold: null, under: 'attack', fightButtonAt: () => ctx.under,
    // main.ts attackDown: the press attacks at once and the hold begins.
    attackDown: source => { attackHold.down(source); attacks.push(source); }, slideCombo: { owns: () => false, cancel() {} }, airOn: () => true, started: true, flight: {}, arriving: false, spacePointer: null, boostHeld: false, boostPointers: new Set(), spaceKeys: new Set(), fishGame: null,
    movement, joystick: { clear: () => cleared.push('joystick') }, cancelLongPresses: () => cleared.push('longPress'), cancelButtonTouches() {}, mountTouchButtons() {}, gestures: { up() {}, clear() {} }, save() {}, uiBlocked: () => false,
    useInstead: () => false, // nothing to use beside the pad here (attack-intent.ts has its own tests)
  });
  vm.runInContext(compile(flightRouting + '\n' + groundRouting), ctx);
  const fire = (target, type, pointerId = 1, extra = {}) => {
    let stopped = false;
    const event = { target, type, pointerId, button: 0, clientX: 20, clientY: 30, preventDefault() {}, stopPropagation() { stopped = true; }, ...extra };
    target.fire(type, event);
    if (!stopped && target !== document && target !== window) document.fire(type, event);
    if (!stopped && target !== window) window.fire(type, event);
  };
  return { ctx, world, boost, document, window, fire, keys, cleared, attackHold, attacks };
}

test('moving and releasing a boost finger preserves the other finger steering the ship', () => {
  const f = fixture(); f.fire(f.world, 'pointerdown', 1);
  f.fire(f.boost, 'pointerdown', 2); assert.equal(f.ctx.boostHeld, true);
  f.fire(f.boost, 'pointermove', 2, { clientX: 80, clientY: 90 });
  assert.equal(f.ctx.spacePointer.x, 20, 'boost cannot change the steering aim');
  f.fire(f.boost, 'pointerup', 2);
  assert.equal(f.ctx.boostHeld, false); assert.equal(f.ctx.spacePointer.x, 20, 'boost release cannot stop steering');
  f.fire(f.world, 'pointermove', 1, { clientX: 40 }); assert.equal(f.ctx.spacePointer.x, 40);
  f.fire(f.world, 'pointerup', 1); assert.equal(f.ctx.spacePointer, null);
});

test('a second steering finger cannot steal the first, and only owner cancellation clears the aim', () => {
  const f = fixture(); f.fire(f.world, 'pointerdown', 1);
  f.fire(f.world, 'pointerdown', 2, { clientX: 80 }); assert.equal(f.ctx.spacePointer.x, 20);
  f.fire(f.world, 'pointercancel', 2); assert.equal(f.ctx.spacePointer.x, 20);
  f.fire(f.world, 'lostpointercapture', 1); assert.equal(f.ctx.spacePointer, null);
});

test('boost remains held until all boost fingers release, including capture loss', () => {
  const f = fixture(); f.fire(f.boost, 'pointerdown', 1); f.fire(f.boost, 'pointerdown', 2);
  assert.ok(f.boost.captures.has(1), 'the hold remains connected while dragging off the button');
  f.fire(f.boost, 'pointerup', 1); assert.equal(f.ctx.boostHeld, true);
  f.fire(f.boost, 'lostpointercapture', 2); assert.equal(f.ctx.boostHeld, false);
});

for (const event of ['blur', 'visibilitychange', 'resize', 'orientationchange']) {
  test(`${event} cancels ground, reel, joystick and flight holds together`, () => {
    const f = fixture(), input = new FishingInput(); input.ready = true; f.ctx.fishGame = { input };
    input.pressPointer(3); f.ctx.movement.pressPointer(4, 'ArrowUp'); f.ctx.spaceKeys.add('w');
    f.fire(f.world, 'pointerdown', 1); f.fire(f.boost, 'pointerdown', 2);
    f.fire(event === 'visibilitychange' ? f.document : f.window, event);
    assert.equal(f.keys.size, 0); assert.equal(input.held, false); assert.equal(f.ctx.spaceKeys.size, 0);
    assert.equal(f.ctx.spacePointer, null); assert.equal(f.ctx.boostHeld, false); assert.equal(f.ctx.boostPointers.size, 0);
    assert.ok(f.cleared.includes('joystick')); assert.ok(f.cleared.includes('longPress'));
    f.fire(f.world, 'pointermove', 1); assert.equal(f.ctx.spacePointer, null);
  });
}

test('reel cancellation releases its finger without losing another reel or movement finger', () => {
  const f = fixture(), input = new FishingInput(), reel = surface('reel-button'), move = surface('up', { move: 'ArrowUp' });
  input.ready = true; f.ctx.fishGame = { input }; f.ctx.flight = null;
  f.fire(move, 'pointerdown', 1); f.fire(reel, 'pointerdown', 2); f.fire(reel, 'pointerdown', 3);
  f.fire(reel, 'pointercancel', 2); assert.equal(input.held, true); assert.ok(f.keys.has('ArrowUp'));
  f.fire(reel, 'lostpointercapture', 3); assert.equal(input.held, false); assert.ok(f.keys.has('ArrowUp'));
  f.fire(move, 'lostpointercapture', 1); assert.equal(f.keys.size, 0);
});

test('secondary mouse buttons do not start a reel or direction hold', () => {
  const f = fixture(), input = new FishingInput(), reel = surface('reel-button'), move = surface('up', { move: 'ArrowUp' });
  input.ready = true; f.ctx.fishGame = { input }; f.ctx.flight = null;
  f.fire(move, 'pointerdown', 1, { button: 2 }); f.fire(reel, 'pointerdown', 2, { button: 2 });
  assert.equal(f.keys.size, 0); assert.equal(input.held, false);
  assert.equal(move.captures.size, 0); assert.equal(reel.captures.size, 0);
});

test('the Attack pad acts as the finger lands and is held; a tap, a slide off the pad, a cancel or a blur ends the hold before it can unleash', () => {
  const pad = surface('', { action: 'attack' });
  // A tap: it attacks at once; released before the hold time, nothing is unleashed.
  let f = fixture(); f.fire(pad, 'pointerdown', 7);
  assert.deepEqual(f.attacks, ['pointer:7'], 'the press attacks on the way down'); assert.equal(f.attackHold.held, true); assert.ok(pad.captures.has(7), 'the pad keeps the finger, so a slide is seen');
  assert.equal(f.attackHold.step(HOLD.time * .6, true), 'fill'); f.fire(pad, 'pointerup', 7); assert.equal(f.attackHold.held, false); assert.equal(f.attackHold.step(1, true), null, 'a tap never fires the strike');
  // Rapid taps: each one starts from nothing.
  for (let i = 0; i < 12; i++) { f.fire(pad, 'pointerdown', 7); assert.notEqual(f.attackHold.step(HOLD.time * .9, true), 'power'); f.fire(pad, 'pointerup', 7); }
  assert.equal(f.attacks.length, 13);
  // Held with a charge: it fills, then unleashes once.
  f.fire(pad, 'pointerdown', 7); assert.equal(f.attackHold.step(HOLD.time * .5, true), 'fill'); assert.equal(f.attackHold.step(HOLD.time * .5, true), 'power'); f.attackHold.spent(); assert.equal(f.attackHold.step(.05, false), 'repeat', 'still held after the strike: it goes on attacking'); f.fire(pad, 'pointerup', 7);
  // Held without a charge: it keeps attacking (main.ts stepHold calls basicAttack at the weapon's pace).
  f.fire(pad, 'pointerdown', 7); for (let i = 0; i < 40; i++) assert.equal(f.attackHold.step(.05, false), 'repeat'); f.fire(pad, 'pointerup', 7);
  // The finger slides off the pad: the hold ends there, and coming back does not resume it.
  f = fixture(); f.fire(pad, 'pointerdown', 3); f.attackHold.step(HOLD.time * .8, true); f.ctx.under = 'skill1'; f.fire(pad, 'pointermove', 3, { clientX: 90, clientY: 10 });
  assert.equal(f.attackHold.held, false, 'slid off'); f.ctx.under = 'attack'; f.fire(pad, 'pointermove', 3); assert.equal(f.attackHold.held, false); assert.equal(f.attackHold.step(1, true), null);
  // Moving while still on the pad keeps it.
  f = fixture(); f.fire(pad, 'pointerdown', 3); f.fire(pad, 'pointermove', 3, { clientX: 24, clientY: 33 }); assert.equal(f.attackHold.held, true);
  // A system cancel, a lost capture, a blur.
  f.fire(pad, 'pointercancel', 3); assert.equal(f.attackHold.held, false);
  f.fire(pad, 'pointerdown', 4); f.fire(pad, 'lostpointercapture', 4); assert.equal(f.attackHold.held, false);
  f.fire(pad, 'pointerdown', 5); f.fire(f.window, 'blur'); assert.equal(f.attackHold.held, false); assert.equal(f.ctx.attackPointers.size, 0);
  // Two fingers on the pad: held until the last one lifts. A right mouse button, or a menu, starts nothing.
  f = fixture(); f.fire(pad, 'pointerdown', 1); f.fire(pad, 'pointerdown', 2); f.fire(pad, 'pointerup', 1); assert.equal(f.attackHold.held, true); f.fire(pad, 'pointerup', 2); assert.equal(f.attackHold.held, false);
  f = fixture(); f.fire(pad, 'pointerdown', 1, { button: 2 }); assert.equal(f.attackHold.held, false); f.ctx.uiBlocked = () => true; f.fire(pad, 'pointerdown', 1); assert.deepEqual(f.attacks, []);
  // Switched off, the pad is the click button it always was: nothing on the way down.
  f = fixture(); f.ctx.airOn = () => false; f.fire(pad, 'pointerdown', 1); assert.deepEqual(f.attacks, []); assert.equal(f.attackHold.held, false);
  assert.match(source, /case 'attack':if\(!airOn\(\)\|\|\(event as MouseEvent\)\.detail===0\)\{if\(!useInstead\(true\)\)basicAttack\(\);\}break;/, 'the click that follows a pointer press does not attack twice; switched off it is the attack, as before');
});
