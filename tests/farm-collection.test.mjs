import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as M from '../src/model.ts';
import { collectText } from '../src/farm-ui.ts';
import { setLanguage } from '../src/i18n.ts';

// Execute the actual main.ts collection controller with real farm/save logic.
// Only timers and presentation are intercepted, so we can switch worlds/saves
// between the first immediate pickup and the remaining staggered callbacks.
const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'collectFarm');
assert.ok(declaration, 'main.ts must provide the real collection controller');
const compiled = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fullExpiredFarm(now) {
  const state = M.newGame(); state.level = 25; state.energy = 100_000; state.farm.built = true;
  assert.equal(M.expandPen(state), true); assert.equal(M.expandPen(state), true);
  for (let i = 0; i < 10; i++) {
    assert.ok(M.buyAnimal(state, 'chicken', now - M.ANIMAL_LIFESPAN_MS - 10_000));
    assert.ok(M.buyAnimal(state, 'cow', now - M.ANIMAL_LIFESPAN_MS - 10_000));
  }
  return state;
}

function fixture() {
  setLanguage('en');
  const now = Date.now(), state = fullExpiredFarm(now), pending = [], calls = [], animations = [], notices = [];
  let closed = 0;
  const context = {
    M: { ...M, collectProducts(...args) { calls.push(args); return M.collectProducts(...args); } },
    state, visiting: null, modal: 'pen', Date: { now: () => now }, collectText,
    world: {
      planet: 'home', position: { x: 0, z: 0 },
      farmView: {
        positionOf: uid => ({ x: uid, z: 0 }),
        collect: (uid, item) => animations.push({ uid, item }),
      },
    },
    change: callback => callback(),
    closeDialog() { closed++; context.modal = null; },
    toast: (message, icon) => notices.push({ message, icon }),
    floating() {}, tone() {},
    setTimeout: (run, delay) => { pending.push({ run, delay }); return pending.length; },
  };
  const ctx = vm.createContext(context); vm.runInContext(compiled, ctx);
  return {
    now, state, ctx, calls, animations, notices, pending,
    start: () => ctx.collectFarm(),
    flush() { while (pending.length) pending.shift().run(); },
    get closed() { return closed; },
  };
}

test('normal staggered collection grants all twenty meat pickups once with the correct summary', () => {
  const f = fixture(); f.start();
  assert.equal(f.closed, 1);
  assert.equal(f.state.bag.meat, 1, 'the nearest pickup happens immediately');
  assert.equal(f.pending.length, 19);
  assert.deepEqual(f.pending.map(job => job.delay), Array.from({ length: 19 }, (_, i) => (i + 1) * 140));
  f.flush();
  assert.equal(f.state.bag.meat, 20); assert.equal(f.state.farm.animals.length, 0);
  assert.equal(f.calls.length, 20); assert.equal(f.animations.length, 20);
  assert.equal(new Set(f.animations.map(item => item.uid)).size, 20);
  assert.ok(f.animations.every(item => item.item === 'meat'));
  assert.equal(f.notices.length, 1); assert.equal(f.notices[0].message, 'Collected 20: 20 meat.');
  f.start(); f.flush(); assert.equal(f.state.bag.meat, 20, 'repeated interaction cannot re-collect the removed animals');
});

test('changing the active save cancels pending pickups without granting from colliding animal IDs', () => {
  const f = fixture(); f.start();
  const original = structuredClone(f.state), replacement = fullExpiredFarm(f.now), replacementBefore = structuredClone(replacement);
  assert.equal(replacement.farm.animals[1].uid, original.farm.animals[0].uid, 'the new save deliberately reuses pending animal IDs');
  f.ctx.state = replacement;
  f.flush();
  assert.deepEqual(f.state, original, 'the original save keeps only the already completed pickup');
  assert.deepEqual(replacement, replacementBefore, 'the new save loses no animal and receives no items or XP');
  assert.equal(f.calls.length, 1); assert.equal(f.animations.length, 1); assert.equal(f.notices.length, 0);
});

for (const transition of ['visiting a friend', 'leaving the home world']) {
  test(`${transition} cancels the rest of a collection already under way`, () => {
    const f = fixture(); f.start(); const before = structuredClone(f.state);
    if (transition === 'visiting a friend') f.ctx.visiting = 'friend-account';
    else f.ctx.world.planet = 'toy';
    f.flush();
    assert.deepEqual(f.state, before);
    assert.equal(f.state.bag.meat, 1); assert.equal(f.state.farm.animals.length, 19);
    assert.equal(f.calls.length, 1); assert.equal(f.animations.length, 1); assert.equal(f.notices.length, 0);
  });
}
