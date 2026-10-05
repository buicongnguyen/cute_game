import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { JoystickInput } from '../src/gameplay-controls.ts';

// Run the mounted production control, including its capture and lifecycle listeners.
const source = await readFile(new URL('../src/joystick.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('joystick.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'mountJoystick');
const compiled = ts.transpileModule(declaration.getText(ast).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function surface() {
  const listeners = new Map(), captures = new Set();
  return {
    children: [], style: {}, hidden: false, captures,
    classList: { toggle() {} }, setAttribute() {},
    append(child) { this.children.push(child); },
    addEventListener(type, listener) { const handlers = listeners.get(type) ?? []; handlers.push(listener); listeners.set(type, handlers); },
    fire(type, props = {}) { const e = { type, button: 0, pointerId: 1, clientX: 70, clientY: 50, preventDefault() {}, stopPropagation() {}, ...props }; for (const handler of listeners.get(type) ?? []) handler(e); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); },
    releasePointerCapture(id) { captures.delete(id); this.fire('lostpointercapture', { pointerId: id }); },
  };
}
function fixture() {
  const host = surface(), window = surface(), document = surface(), directions = [];
  document.createElement = surface;
  let allowed = true;
  const ctx = vm.createContext({ JoystickInput, document, window, t: text => text, onLanguageChange() {} });
  vm.runInContext(compiled, ctx);
  const control = ctx.mountJoystick(host, () => allowed, direction => directions.push(direction));
  control.setEnabled(true);
  return { control, window, document, stick: host.children[0], block(value) { allowed = !value; }, direction: () => directions.at(-1) };
}

test('opening a menu cancels the joystick instead of resuming the old hold when it closes', () => {
  const f = fixture(); f.stick.fire('pointerdown'); assert.equal(f.direction().x, 1);
  f.block(true); f.control.update(); assert.equal(f.direction(), null);
  assert.equal(f.stick.captures.size, 0, 'cancellation releases the old capture');
  f.block(false); f.control.update(); f.stick.fire('pointermove', { clientX: 90 });
  assert.equal(f.direction(), null, 'the old finger must lift and press again');
  f.stick.fire('pointerdown', { pointerId: 2, clientX: 30 }); assert.equal(f.direction().x, -1);
});

for (const event of ['resize', 'orientationchange', 'blur', 'visibilitychange']) {
  test(`${event} releases the joystick and ignores stale movement`, () => {
    const f = fixture(); f.stick.fire('pointerdown');
    (event === 'visibilitychange' ? f.document : f.window).fire(event);
    assert.equal(f.direction(), null); assert.equal(f.stick.captures.size, 0);
    f.stick.fire('pointermove', { clientX: 90 }); assert.equal(f.direction(), null);
  });
}

test('another finger cannot steal, move, or release the joystick; cancellation permits a fresh hold', () => {
  const f = fixture(); f.stick.fire('pointerdown');
  f.stick.fire('pointerdown', { pointerId: 2, clientX: 30 });
  f.stick.fire('pointermove', { pointerId: 2, clientX: 30 });
  f.stick.fire('pointerup', { pointerId: 2 }); assert.equal(f.direction().x, 1);
  f.stick.fire('pointercancel'); assert.equal(f.direction(), null);
  f.stick.fire('pointerdown', { pointerId: 3, clientX: 30 }); assert.equal(f.direction().x, -1);
  f.stick.fire('lostpointercapture', { pointerId: 3 }); assert.equal(f.direction(), null);
});

test('a hidden joystick and secondary mouse buttons cannot start movement', () => {
  const f = fixture(); f.control.setEnabled(false); f.stick.fire('pointerdown'); assert.equal(f.direction(), null);
  f.control.setEnabled(true); f.stick.fire('pointerdown', { button: 2 }); assert.equal(f.direction(), null);
});
