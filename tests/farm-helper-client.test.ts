import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as H from '../src/farm-helper.ts';
import { FarmHelperController } from '../src/farm-helper-controller.ts';
import { FarmHelperView, FARM_HELPER_HOME } from '../src/farm-helper-view.ts';
import { HelperView } from '../src/helper-view.ts';
import { farmHelperRow, farmHelperPanel } from '../src/farm-helper-ui.ts';
import { setLanguage } from '../src/i18n.ts';

function game() { const s = M.newGame(); s.farm.built = true; s.level = 30; s.energy = 2000; H.buyFarmHelper(s); return s; }
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
function fixture() {
  let state = game(), context: object | null = {}, resolve!: (value: any) => void, reject!: (error: Error) => void;
  const calls: Array<[string, Record<string, unknown> | undefined]> = [], effects: any[] = [];
  const controller = new FarmHelperController({ state: () => state, context: () => context, perform: <T>(type: string, payload?: Record<string, unknown>) => { calls.push([type, payload]); return new Promise<T>((yes, no) => { resolve = yes; reject = no; }); }, completed: (result, catchUp) => effects.push({ result, catchUp }) });
  return { controller, calls, effects, get state() { return state; }, replace() { state = game(); }, context(value: object | null) { context = value; }, async reply(value: unknown) { resolve(value); await tick(); }, async fail() { reject(new Error('offline')); await tick(); } };
}

test('animal robot catches up once per home entry and never duplicates a pending command', async () => {
  const f = fixture(); f.controller.sync(); f.controller.sync(); assert.equal(f.controller.pending, true); assert.equal(f.calls.length, 1);
  assert.equal(f.controller.work({ kind: 'collect', uid: 1 }), false); assert.equal(f.calls[0][0], 'farmHelperCatchUp');
  await f.reply({ collected: [], fed: [] }); f.controller.sync(); assert.equal(f.calls.length, 1); assert.equal(f.effects.length, 1);
  f.context(null); f.controller.sync(); f.context({}); f.controller.sync(); assert.equal(f.calls.length, 2);
  await f.reply({ collected: [], fed: [] }); assert.equal(f.controller.pending, false);
});

for (const transition of ['account', 'scene', 'away'] as const) test(`animal robot ignores a stale ${transition} completion and unlocks its queue`, async () => {
  const f = fixture(); assert.equal(f.controller.work({ kind: 'collect', uid: 1 }), true);
  if (transition === 'account') f.replace(); else f.context(transition === 'scene' ? {} : null);
  await f.reply([{ uid: 1, kind: 'chicken', item: 'egg' }]); assert.equal(f.effects.length, 0); assert.equal(f.controller.pending, false);
});

test('animal robot refuses visitor and paused work, preserves command intent, and recovers after rejection', async () => {
  const f = fixture(); f.context(null); assert.equal(f.controller.work({ kind: 'collect', uid: 4 }), false);
  f.context({}); H.setFarmHelperPaused(f.state, true); f.controller.sync(); assert.equal(f.controller.work({ kind: 'collect', uid: 4 }), false); assert.equal(f.calls.length, 0);
  H.setFarmHelperPaused(f.state, false); assert.equal(f.controller.work({ kind: 'feed', uid: 4 }), true); assert.deepEqual(f.calls[0], ['farmHelperFeed', { uid: 4 }]);
  await f.fail(); assert.equal(f.controller.pending, false); assert.equal(f.effects.length, 0);
  assert.equal(f.controller.work({ kind: 'collect', uid: 7 }), true); await f.reply([{ uid: 7, kind: 'pig', item: 'truffle' }]); assert.equal(f.effects[0].result.collected[0].uid, 7);
});

test('animal robot walks and works using the shared rigid visual; visitor and paused frames never mutate', t => {
  const poses: any[] = []; t.mock.method(HelperView.prototype, 'present', (_dt: number, pose: unknown) => poses.push(pose));
  const s = game(), a = M.buyAnimal(s, 'chicken', 1_000_000)!;
  const now = M.adultAt(a) + M.productDuration(a), context = {}, tasks: H.FarmHelperTask[] = [];
  const view = new FarmHelperView(), frame = { state: s, context, act: true, pending: false, now, position: () => ({ x: FARM_HELPER_HOME.x + 2, z: FARM_HELPER_HOME.z }), work: (task: H.FarmHelperTask) => { tasks.push(task); H.helperCollect(s, task.uid, now); return true; } };
  for (let i = 0; i < 25; i++) view.update(.1, frame);
  assert.ok(poses.some(p => p.mode === 'walk')); assert.ok(poses.some(p => p.mode === 'work')); assert.deepEqual(tasks, [{ kind: 'collect', uid: a.uid }]); assert.equal(s.bag.egg, 1);
  tasks.length = 0; const before = structuredClone(s); frame.act = false;
  for (let i = 0; i < 70; i++) view.update(.1, frame);
  assert.deepEqual(s, before); assert.equal(tasks.length, 0);
  frame.act = true; H.setFarmHelperPaused(s, true); view.reset();
  for (let i = 0; i < 30; i++) view.update(.1, frame);
  assert.equal(tasks.length, 0); assert.equal(view.mode, 'idle'); assert.equal(view.x, FARM_HELPER_HOME.x);
  view.update(.1, { ...frame, state: null }); assert.equal(poses.at(-1).visible, false);
});

test('animal robot panels show the price and explicit opt-in feeding in English and Vietnamese', () => {
  const s = game(); delete s.farm.helper; s.energy = 999;
  setLanguage('en'); const hire = farmHelperPanel(s, '/helper.webp'); assert.match(hire, /1000/); assert.match(hire, /data-action="farm-helper-buy" disabled/); assert.match(hire, /Automatic feeding is off/);
  assert.equal(farmHelperRow(s, true), ''); s.energy = 1000; H.buyFarmHelper(s);
  const owned = farmHelperPanel(s, '/helper.webp'); assert.match(owned, /aria-checked="false" aria-label="Automatic feeding"/); assert.match(owned, /data-action="pen-menu"/);
  try { setLanguage('vi'); const translated = farmHelperPanel(s, '/helper.webp'); assert.match(translated, /Rô-bốt/); assert.match(translated, /Tự động cho ăn/); assert.doesNotMatch(translated, />Automatic feeding</); assert.match(farmHelperRow(s), /Rô-bốt chăm vật nuôi/); }
  finally { setLanguage('en'); }
});
