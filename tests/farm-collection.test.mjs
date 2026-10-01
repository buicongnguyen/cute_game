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
const declarations = ['farmCollectFeedback', 'collectFarm'].map(name => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name));
assert.ok(declarations.every(Boolean), 'main.ts must provide the real collection controller and feedback');
const compiled = ts.transpileModule(declarations.map(node => node.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fullExpiredFarm(now) {
  const state = M.newGame(); state.level = 25; state.energy = 100_000; state.farm.built = true;
  assert.equal(M.expandPen(state), true); assert.equal(M.expandPen(state), true);
  for (let i = 0; i < 10; i++) {
    assert.ok(M.buyAnimal(state, 'chicken', now - M.ANIMAL_LIFESPAN_MS - 10_000));
    assert.ok(M.buyAnimal(state, 'cow', now - M.ANIMAL_LIFESPAN_MS - 10_000));
  }
  return state;
}

const microtasks = () => new Promise(resolve => queueMicrotask(resolve));
function fixture(holdResponse = false) {
  setLanguage('en');
  const now = Date.now(), state = fullExpiredFarm(now), pending = [], calls = [], animations = [], notices = [];
  let closed = 0, release;
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
    // Same real model mutation behind the action boundary; only the asynchronous reply is controlled.
    perform: async (type, payload) => {
      assert.equal(type, 'collectProducts');
      const result=context.M.collectProducts(context.state, now, payload.uids);
      if(holdResponse) await new Promise(resolve=>{release=resolve;});
      return result;
    },
    closeDialog() { closed++; context.modal = null; },
    toast: (message, icon) => notices.push({ message, icon }),
    floating() {}, tone() {},
    setTimeout: (run, delay) => { pending.push({ run, delay }); return pending.length; },
  };
  const ctx = vm.createContext(context); vm.runInContext(compiled, ctx);
  return {
    now, state, ctx, calls, animations, notices, pending,
    async start(uid) { ctx.collectFarm(uid); await microtasks(); },
    async flush() { while (pending.length) await pending.shift().run(); },
    async release() { release?.(); await microtasks(); },
    get closed() { return closed; },
  };
}

test('normal staggered collection grants all twenty meat pickups once with the correct summary', async () => {
  const f = fixture(); await f.start();
  assert.equal(f.closed, 1);
  assert.equal(f.state.bag.meat, 1, 'the nearest pickup happens immediately');
  assert.equal(f.pending.length, 19);
  assert.deepEqual(f.pending.map(job => job.delay), Array.from({ length: 19 }, (_, i) => (i + 1) * 140));
  await f.flush();
  assert.equal(f.state.bag.meat, 20); assert.equal(f.state.farm.animals.length, 0);
  assert.equal(f.calls.length, 20); assert.equal(f.animations.length, 20);
  assert.equal(new Set(f.animations.map(item => item.uid)).size, 20);
  assert.ok(f.animations.every(item => item.item === 'meat'));
  assert.equal(f.notices.length, 1); assert.equal(f.notices[0].message, 'Collected 20: 20 meat.');
  await f.start(); await f.flush(); assert.equal(f.state.bag.meat, 20, 'repeated interaction cannot re-collect the removed animals');
});

test('changing the active save cancels pending pickups without granting from colliding animal IDs', async () => {
  const f = fixture(); await f.start();
  const original = structuredClone(f.state), replacement = fullExpiredFarm(f.now), replacementBefore = structuredClone(replacement);
  assert.equal(replacement.farm.animals[1].uid, original.farm.animals[0].uid, 'the new save deliberately reuses pending animal IDs');
  f.ctx.state = replacement;
  await f.flush();
  assert.deepEqual(f.state, original, 'the original save keeps only the already completed pickup');
  assert.deepEqual(replacement, replacementBefore, 'the new save loses no animal and receives no items or XP');
  assert.equal(f.calls.length, 1); assert.equal(f.animations.length, 1); assert.equal(f.notices.length, 0);
});

for (const transition of ['visiting a friend', 'leaving the home world']) {
  test(`${transition} cancels the rest of a collection already under way`, async () => {
    const f = fixture(); await f.start(); const before = structuredClone(f.state);
    if (transition === 'visiting a friend') f.ctx.visiting = 'friend-account';
    else f.ctx.world.planet = 'toy';
    await f.flush();
    assert.deepEqual(f.state, before);
    assert.equal(f.state.bag.meat, 1); assert.equal(f.state.farm.animals.length, 19);
    assert.equal(f.calls.length, 1); assert.equal(f.animations.length, 1); assert.equal(f.notices.length, 0);
  });
}

test('an in-flight collection reply cannot animate or notify a replacement save',async()=>{
  const f=fixture(true);await f.start();assert.equal(f.calls.length,1);assert.equal(f.animations.length,0);
  const replacement=fullExpiredFarm(f.now),before=structuredClone(replacement);f.ctx.state=replacement;
  await f.release();await f.flush();
  assert.deepEqual(replacement,before);assert.equal(f.animations.length,0);assert.equal(f.notices.length,0);
  assert.equal(f.calls.length,1,'remaining scheduled requests are canceled before reaching the action API');
});

test('individual collection grants and animates all selected stock while leaving every other animal untouched',async()=>{
  const f=fixture(),state=f.state;state.farm=M.emptyFarm();state.farm.built=true;
  const at=f.now-600_000,a=M.buyAnimal(state,'duck',at),b=M.buyAnimal(state,'pig',at);assert.ok(a&&b);
  const other=structuredClone(b);assert.equal(M.productCount(a,f.now),2);
  await f.start(a.uid);await f.flush();
  assert.equal(state.bag.duck_egg,2);assert.equal(state.bag.truffle,undefined);assert.deepEqual(state.farm.animals[1],other);
  assert.equal(f.calls.length,1);assert.deepEqual(Array.from(f.calls[0][2]),[a.uid]);assert.equal(f.animations.length,2);
  assert.equal(f.notices[0].message,'Collected 2: 2 duck eggs.');
  await f.start(a.uid);assert.equal(f.calls.length,1,'a repeated ready-row click cannot claim it twice');
});
