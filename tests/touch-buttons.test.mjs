import test from 'node:test';
import assert from 'node:assert/strict';
import { mountTouchButtons, cancelButtonTouches } from '../src/touch-buttons.ts';
import { mountLongPress, cancelLongPresses } from '../src/long-press.ts';

// Model capture/target/bubble ordering, including the production long-press handlers.
function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous = { window: globalThis.window, Element: globalThis.Element, PointerEvent: globalThis.PointerEvent };
  class Pointer {
    constructor(type, props = {}) { Object.assign(this, { type, pointerId: 2, pointerType: 'touch', isPrimary: false, button: 0, detail: type === 'click' ? 1 : 0, clientX: 20, clientY: 20, defaultPrevented: false, bubbles: true }, props); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.stopped = true; }
    stopImmediatePropagation() { this.stopped = this.immediate = true; }
  }
  class Surface {
    handlers = [];
    addEventListener(type, handler, capture = false) { this.handlers.push({ type, handler, capture: capture === true }); }
    run(event, capture) { for (const entry of this.handlers) if (entry.type === event.type && entry.capture === capture) { entry.handler(event); if (event.immediate) break; } }
  }
  const root = new Surface(); let hit = null;
  root.elementFromPoint = () => hit;
  class Element extends Surface {
    id = ''; dataset = {}; disabled = false; isConnected = true; blocked = false;
    classes = new Set(); classList = { contains: name => this.classes.has(name) };
    closest(selector) { return selector === 'button' ? this : this.blocked ? this : null; }
    matches() { return this.disabled; }
    dispatchEvent(event) {
      event.target = this;
      root.run(event, true);
      if (!event.stopped) { this.run(event, true); if (!event.immediate) this.run(event, false); }
      if (!event.stopped) root.run(event, false);
      return !event.defaultPrevented;
    }
  }
  globalThis.window = { setTimeout, clearTimeout }; globalThis.Element = Element; globalThis.PointerEvent = Pointer;
  mountTouchButtons(root);
  t.after(() => { cancelButtonTouches(); cancelLongPresses(); for (const key of Object.keys(previous)) if (previous[key] === undefined) delete globalThis[key]; else globalThis[key] = previous[key]; });
  const make = (hold = false) => {
    const button = new Element(), calls = [];
    if (hold) mountLongPress(button, () => calls.push('hold'));
    button.addEventListener('click', event => calls.push({ detail: event.detail, pointerId: event.pointerId }));
    return { button, calls };
  };
  const fire = (button, type, props = {}) => { hit = button; const event = new Pointer(type, props); button.dispatchEvent(event); return event; };
  return { make, fire, root, hit: button => { hit = button; }, tick: ms => t.mock.timers.tick(ms) };
}

test('a secondary touch activates a button once when the browser emits no click', t => {
  const f = fixture(t), a = f.make();
  f.fire(a.button, 'pointerdown'); f.fire(a.button, 'pointerup'); assert.deepEqual(a.calls, []);
  f.tick(1); assert.deepEqual(a.calls, [{ detail: 1, pointerId: 2 }]);
});

test('a native secondary click wins before the fallback and is not activated twice', t => {
  const f = fixture(t), a = f.make();
  f.fire(a.button, 'pointerdown'); f.fire(a.button, 'pointerup');
  const click = f.fire(a.button, 'click'); f.tick(1);
  assert.equal(click.defaultPrevented, false); assert.equal(a.calls.length, 1);
});

test('a late native click after fallback is suppressed, including legacy touch MouseEvents', t => {
  const f = fixture(t);
  for (const pointerType of ['touch', undefined]) {
    const a = f.make();
    f.fire(a.button, 'pointerdown'); f.fire(a.button, 'pointerup'); f.tick(1);
    const click = f.fire(a.button, 'click', { pointerType });
    assert.equal(click.defaultPrevented, true); assert.equal(a.calls.length, 1);
  }
});

test('primary touches, mouse clicks, keyboard clicks and direct holds keep native behavior', t => {
  const f = fixture(t), a = f.make();
  f.fire(a.button, 'pointerdown', { isPrimary: true }); f.fire(a.button, 'pointerup', { isPrimary: true }); f.tick(1);
  assert.equal(a.calls.length, 0); f.fire(a.button, 'click', { isPrimary: true }); assert.equal(a.calls.length, 1);
  f.fire(a.button, 'pointerdown'); f.fire(a.button, 'pointerup'); f.tick(1);
  assert.equal(f.fire(a.button, 'click', { detail: 0 }).defaultPrevented, false);
  assert.equal(f.fire(a.button, 'click', { pointerType: 'mouse' }).defaultPrevented, false);
  assert.equal(a.calls.length, 4);
  for (const properties of [{ id: 'boost-button' }, { dataset: { move: 'ArrowUp' } }]) {
    const b = f.make(); Object.assign(b.button, properties); f.fire(b.button, 'pointerdown'); f.fire(b.button, 'pointerup'); f.tick(1); assert.equal(b.calls.length, 0);
  }
});

test('secondary long presses show their tip without casting, while another finger can tap', t => {
  const f = fixture(t), a = f.make(true), b = f.make(true);
  f.fire(a.button, 'pointerdown', { pointerId: 2 }); f.tick(450);
  f.fire(b.button, 'pointerdown', { pointerId: 3 }); f.fire(b.button, 'pointerup', { pointerId: 3 }); f.tick(1);
  f.fire(a.button, 'pointerup', { pointerId: 2 }); f.tick(1);
  assert.deepEqual(a.calls, ['hold']); assert.deepEqual(b.calls, [{ detail: 1, pointerId: 3 }]);
  assert.equal(f.fire(a.button, 'click').defaultPrevented, true, 'a late native click also stays suppressed');
});

test('repeated lifecycle cancellation suppresses an old release but permits a fresh tap', t => {
  const f = fixture(t), a = f.make(true);
  f.fire(a.button, 'pointerdown'); f.tick(450);
  cancelLongPresses(); cancelButtonTouches(); cancelLongPresses(); cancelButtonTouches();
  f.fire(a.button, 'pointerup'); f.tick(1);
  assert.equal(f.fire(a.button, 'click').defaultPrevented, true); assert.deepEqual(a.calls, ['hold']);
  f.fire(a.button, 'pointerdown'); f.fire(a.button, 'pointerup'); f.tick(1);
  assert.deepEqual(a.calls, ['hold', { detail: 1, pointerId: 2 }]);
});

test('dragging away and back, release outside, disabled and inert buttons never synthesize activation', t => {
  const f = fixture(t);
  const dragged = f.make(); f.fire(dragged.button, 'pointerdown'); f.fire(dragged.button, 'pointermove', { clientX: 40 }); f.fire(dragged.button, 'pointerup'); f.tick(1);
  assert.equal(dragged.calls.length, 0); assert.equal(f.fire(dragged.button, 'click').defaultPrevented, true);
  const outside = f.make(); f.fire(outside.button, 'pointerdown');
  f.hit(null); outside.button.dispatchEvent(new PointerEvent('pointerup')); f.tick(1); assert.equal(outside.calls.length, 0);
  for (const properties of [{ disabled: true }, { blocked: true }, { isConnected: false }]) {
    const a = f.make(); Object.assign(a.button, properties); f.fire(a.button, 'pointerdown'); f.fire(a.button, 'pointerup'); f.tick(1); assert.equal(a.calls.length, 0);
  }
  const disabledLater = f.make(); f.fire(disabledLater.button, 'pointerdown'); f.fire(disabledLater.button, 'pointerup'); disabledLater.button.disabled = true; f.tick(1); assert.equal(disabledLater.calls.length, 0);
});

test('cancelled or interrupted capture cannot become a click, and normal capture release is safe', t => {
  const f = fixture(t), a = f.make();
  f.fire(a.button, 'pointerdown'); f.fire(a.button, 'pointercancel'); f.fire(a.button, 'pointerup'); f.tick(1); assert.equal(a.calls.length, 0);
  f.fire(a.button, 'pointerdown'); f.fire(a.button, 'lostpointercapture'); f.fire(a.button, 'pointerup'); f.tick(1); assert.equal(a.calls.length, 0);
  f.fire(a.button, 'pointerdown'); f.fire(a.button, 'pointerup'); f.fire(a.button, 'lostpointercapture'); f.tick(1); assert.equal(a.calls.length, 1);
});

test('a menu opened by fallback still suppresses a later browser click on its toggle', t => {
  const f = fixture(t), a = f.make();
  a.button.addEventListener('click', () => { cancelLongPresses(); cancelButtonTouches(); });
  f.fire(a.button, 'pointerdown'); f.fire(a.button, 'pointerup'); f.tick(1);
  assert.equal(f.fire(a.button, 'click').defaultPrevented, true); assert.equal(a.calls.length, 1);
});

test('releasing a Reel hold after the line ends cannot start another cast', t => {
  const f = fixture(t), reel = f.make(); reel.button.id = 'reel-button';
  f.fire(reel.button, 'pointerdown'); reel.button.classes.add('cast'); f.fire(reel.button, 'pointerup'); f.tick(1);
  assert.equal(reel.calls.length, 0);
  f.fire(reel.button, 'pointerdown'); f.fire(reel.button, 'pointerup'); f.tick(1);
  assert.equal(reel.calls.length, 1, 'a fresh Cast tap activates normally');
  reel.button.classes.delete('cast'); reel.button.classes.add('hunt');
  f.fire(reel.button, 'pointerdown'); f.fire(reel.button, 'pointerup'); f.tick(1);
  assert.equal(reel.calls.length, 2, 'a Hunt tap also activates normally');
});
