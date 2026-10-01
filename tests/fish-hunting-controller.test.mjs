import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as M from '../src/model.ts';
import { FISH_HUNT_COOLDOWN_MS, huntingPondAt, huntingPonds, fishHuntTargets } from '../src/fish-hunting.ts';

const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8'), ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const statements = ast.statements.filter(n => ts.isFunctionDeclaration(n) && ['updateHunting', 'throwHarpoon'].includes(n.name?.text) || ts.isVariableStatement(n) && n.declarationList.declarations.some(d => /^hunting(?!View)/.test(d.name.getText(ast))));
const compiled = ts.transpileModule(statements.map(n => n.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture() {
  const state = M.newGame(); state.bag.harpoon = 1; state.gear.weapon = 'harpoon';
  const pond = huntingPonds('home')[0], calls = [], effects = [], resolvers = [], now = 1_000_000;
  const button = { hidden: true, classList: { values: new Set(), contains(s) { return this.values.has(s); }, toggle(s, on) { if (on) this.values.add(s); else this.values.delete(s); } } };
  const huntingView = { pond: null, targets: [], now: () => now, syncClock: () => effects.push('clock'), throw: () => effects.push('throw'), update(_dt, p) { this.pond = p; this.targets = p ? fishHuntTargets(p, now) : []; }, nearest() { return this.targets[0] ?? null; } };
  const context = { M, huntingPondAt, FISH_HUNT_COOLDOWN_MS, huntingView, state, started: true, visiting: null, flight: null, fishGame: null,
    blocked: false, uiBlocked: () => ctx.blocked, document: { hidden: false }, fishKit: { ready: false }, combatTimers: { attackCooldown: 0 },
    world: { root: {}, entities: [{ ...pond, kind: 'fish', radius: pond.rx, pond }], position: { x: pond.x, z: pond.z + pond.rz + .6 }, route: [], ring: { visible: true }, playerAttack: () => effects.push('attack'), fx: { ring: () => effects.push('ring') } },
    $: selector => selector === '#reel-button' ? button : { textContent: '' }, showReel: (on, mode) => { button.hidden = !on; button.classList.toggle('hunt', mode === 'hunt'); },
    perform: (type, payload) => { calls.push({ type, payload }); return new Promise(resolve => resolvers.push(resolve)); }, toast: () => {}, tone: () => effects.push('tone'), floating: () => effects.push('floating'), t: s => s, formatSize: size => String(size) };
  const ctx = vm.createContext(context); vm.runInContext(compiled, ctx);
  const reply = () => ({ ...fishHuntTargets(pond, now)[0], hit: true, count: 1, huge: false, pondId: pond.id, readyAt: now + 12_000, shotReadyAt: now + 1300, serverNow: now });
  return { ctx, state, calls, effects, reply, resolve: (i = 0, value = reply()) => resolvers[i](value) };
}

test('rapid harpoon inputs send one action and online feedback never grants a second local fish', async () => {
  const f = fixture(), pending = f.ctx.throwHarpoon(); await f.ctx.throwHarpoon(); assert.equal(f.calls.length, 1);
  f.resolve(); await pending; assert.equal(f.effects.filter(e => e === 'throw').length, 1); assert.deepEqual(f.state.bag, { harpoon: 1 });
  await f.ctx.throwHarpoon(); assert.equal(f.calls.length, 1, 'the acknowledged attack cooldown prevents an immediate second shot');
});

for (const change of ['account', 'world', 'rod cast', 'flight', 'weapon', 'disguise', 'visit', 'death']) test(`a pending hunting reply cannot show a throw after ${change} changes`, async () => {
  const f = fixture(), pending = f.ctx.throwHarpoon();
  if (change === 'account') f.ctx.state = M.newGame('Other'); if (change === 'world') f.ctx.world.root = {}; if (change === 'rod cast') f.ctx.fishGame = {}; if (change === 'flight') f.ctx.flight = {};
  if (change === 'weapon') f.state.gear.weapon = 'rod'; if (change === 'disguise') f.state.gear.disguise = 'dz_dino'; if (change === 'visit') f.ctx.visiting = 'Friend'; if (change === 'death') f.state.hp = 0;
  f.resolve(); await pending; assert.deepEqual(f.effects, []); assert.equal(f.ctx.combatTimers.attackCooldown, 0);
});

test('a new scene can hunt while an old request is unresolved, and stale completion cannot clear the new pending guard', async () => {
  const f = fixture(), old = f.ctx.throwHarpoon(); f.ctx.world.root = {}; f.ctx.updateHunting(0);
  const current = f.ctx.throwHarpoon(); assert.equal(f.calls.length, 2);
  f.resolve(0); await old; assert.deepEqual(f.effects, []); await f.ctx.throwHarpoon(); assert.equal(f.calls.length, 2);
  f.resolve(1); await current; assert.equal(f.effects.filter(e => e === 'throw').length, 1);
});

test('Home recall can invalidate a pending shot in the same scene without displaying stale effects', async () => {
  const f = fixture(), pending = f.ctx.throwHarpoon();
  vm.runInContext('huntingPending=null', f.ctx); f.ctx.world.position = { x: 0, z: 0 }; f.ctx.updateHunting(0);
  f.resolve(); await pending; assert.deepEqual(f.effects, []); assert.equal(f.ctx.combatTimers.attackCooldown, 0);
});
