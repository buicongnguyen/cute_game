// Where the game says its events (src/game-events.ts): the sites in main.ts, run for real through the main.ts harness,
// and the table of who emits what. The bus itself is tested in tests/game-services.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mainHarness } from './support/main-harness.mjs';
import { EVENT_SAMPLES } from './support/game-event-samples.mjs';
import { connect } from '../src/game-events.ts';
import { createEvents } from '../src/game-services.ts';
import * as M from '../src/model.ts';

/** A bus connected to the game's sending end, and everything it was told: [[event, payload], ...]. */
function listen() {
  const bus = createEvents(), told = [];
  for (const event of Object.keys(EVENT_SAMPLES)) bus.on(event, payload => { told.push([event, payload]); });
  connect(bus);
  return told;
}
/** Payloads made inside the harness (another realm) compare by structure once copied. */
const plain = value => JSON.parse(JSON.stringify(value));
const names = told => told.map(([event]) => event);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

// ---- the emit table ---------------------------------------------------------------------------------------------
// Every event has a file that emits it, or the later package that will. A new event needs a line here.
const SITES = {
  started: 'main.ts', levelUp: 'main.ts', harvest: 'main.ts', reward: 'main.ts', creatureAlert: 'main.ts', hitLanded: 'main.ts', creatureDefeat: 'main.ts',
  rescue: 'main.ts', friendHome: 'main.ts', playerHurt: 'main.ts', fishCatch: 'main.ts',
  storyStep: 'game-services.ts', place: 'game-services.ts', // compared at the HUD tick: main.ts updateHud hands the facts over (noteProgress)
  bossApproach: 'hud-combat.ts', bossEngaged: 'hud-combat.ts', bossBreak: 'hud-combat.ts',
  telegraph: 'main.ts', firstWin: 'WP17', // telegraph: world.onTelegraph, where world.ts starts a wind-up
};
const OWNERS = { WP17: 'the first tutorial win' };

test('every event has a site that emits it, or a named later owner', () => {
  assert.deepEqual(Object.keys(SITES).sort(), Object.keys(EVENT_SAMPLES).sort(), 'the table lists exactly the events of game-events.ts (tests/support/game-event-samples.mjs)');
  const text = Object.fromEntries(['main.ts', 'hud-combat.ts', 'game-services.ts'].map(file => [file, readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')]));
  for (const [event, site] of Object.entries(SITES)) {
    if (site in OWNERS) continue;
    assert.match(text[site], new RegExp(`emit\\('${event}',`), `src/${site} emits ${event}`);
  }
  assert.match(text['main.ts'], /noteProgress\(state,state\.quest,world\.lastZone,world\.planet\)/, 'the HUD tick hands the story index and the place to the bus');
  assert.equal((text['main.ts'].match(/emit\('playerHurt',/g) ?? []).length, 2, 'playerHurt: the solo damage path and the server\'s health change');
});

// ---- perform(): harvest and reward --------------------------------------------------------------------------------
const performer = await mainHarness({ functions: ['perform'] });
function game() {
  const state = M.parseSave(readFileSync(new URL('../promo/save-new.json', import.meta.url), 'utf8')), calls = [];
  const ctx = performer.context({ state, actionHandler: null, Date, Math, structuredClone, save() {}, updateHud() {}, levelCheck() {}, pepperGift() { calls.push('pepper'); }, reportRefusal(type) { calls.push('refused:' + type); } });
  const ripen = (...beds) => { for (const index of beds) Object.assign(state.plots[index], { crop: 'carrot', plantedAt: 1 }); };
  return { state, ctx, calls, ripen };
}

test('the player\'s own harvest on a new save emits harvest, with first: true exactly once (the one that brings Pepper)', async () => {
  const g = game(), told = listen();
  assert.equal(g.state.welcome, 'pending', 'promo/save-new.json is a save before its first harvest');
  g.ripen(0, 1, 2, 3);
  assert.equal(await g.ctx.perform('harvest', { index: 0 }), 'carrot');
  assert.deepEqual(plain(told), [['harvest', { crops: ['carrot'], all: false, first: true }]]);
  assert.deepEqual(g.calls, ['pepper'], 'the same harvest brings Pepper');
  assert.equal(await g.ctx.perform('harvest', { index: 1 }), 'carrot');
  assert.deepEqual(await g.ctx.perform('harvestAll'), ['carrot', 'carrot']);
  assert.deepEqual(plain(told.slice(1)), [['harvest', { crops: ['carrot'], all: false, first: false }], ['harvest', { crops: ['carrot', 'carrot'], all: true, first: false }]]);
  assert.equal(told.filter(([, payload]) => payload.first).length, 1);
  // Nothing ripe: the action is refused or returns nothing, and nothing is said.
  await g.ctx.perform('harvest', { index: 0 }); assert.deepEqual(await g.ctx.perform('harvestAll'), []);
  assert.equal(told.length, 3);
  // A helper's harvest is another action and no event of the player's.
  g.ripen(0); g.state.helper = { owned: true, paused: false, seed: 'test', last: {} };
  await g.ctx.perform('helperHarvest', { index: 0 }, { quiet: true });
  assert.equal(told.length, 3, 'helperHarvest is the helper\'s, not the player\'s');
});

test('claimQuest emits reward with the entry that was claimed and the energy it paid; a refused claim emits nothing', async () => {
  const g = game(), told = listen();
  await g.ctx.perform('claimQuest');
  assert.deepEqual(plain(told), [], 'the step is not done: refused');
  assert.deepEqual(g.calls, ['refused:claimQuest']);
  g.ripen(0, 1, 2);
  for (const index of [0, 1, 2]) await g.ctx.perform('harvest', { index }); // the first story step: harvest three crops
  told.length = 0;
  const energy = g.state.energy;
  assert.equal(await g.ctx.perform('claimQuest'), true);
  assert.equal(told.length, 1);
  const [event, reward] = told[0];
  assert.equal(event, 'reward'); assert.equal(reward.kind, 'story'); assert.equal(reward.entry.id, 'story:0'); assert.equal(reward.entry.complete, true);
  assert.match(reward.entry.rewardLabel, /energy/); assert.equal(reward.energy, g.state.energy - energy); assert.ok(reward.energy > 0);
  assert.equal(g.state.quest, 1, 'the story moved on');
});

test('claimProgress emits reward for the entry named in the payload', async () => {
  const g = game(), told = listen();
  g.ripen(0, 1, 2);
  for (const index of [0, 1, 2]) await g.ctx.perform('harvest', { index });
  told.length = 0;
  assert.equal(await g.ctx.perform('claimProgress', { kind: 'story', id: 'story:0' }), true);
  assert.deepEqual(told.map(([event, reward]) => [event, reward.kind, reward.entry.id]), [['reward', 'story', 'story:0']]);
});

test('the claim lookup never touches the save before the action, and a lookup that fails costs only the event', async () => {
  // Online: the save must reach the server call as the server last sent it (listing the entries refreshes them, so it reads a copy).
  const g = game(), told = listen();
  g.ripen(0, 1, 2);
  for (const index of [0, 1, 2]) await g.ctx.perform('harvest', { index });
  told.length = 0;
  g.state.progression.daily.day = -1; // stale: listing the entries of the save itself would roll the day over
  const before = JSON.stringify(g.state); let atCall = '';
  g.ctx.actionHandler = async () => { atCall = JSON.stringify(g.state); g.state.energy += 67; return { result: true }; };
  assert.equal(await g.ctx.perform('claimQuest'), true);
  assert.equal(atCall, before, 'unchanged when the server is asked');
  assert.deepEqual(told.map(([event, reward]) => [event, reward.entry.id, reward.energy]), [['reward', 'story:0', 67]]);
  // Solo, with a lookup that throws: the claim itself still goes through, without an event; a refused one still reports its refusal.
  const h = game(); h.ripen(0, 1, 2);
  for (const index of [0, 1, 2]) await h.ctx.perform('harvest', { index });
  told.length = 0;
  h.ctx.structuredClone = () => { throw new Error('cannot copy'); };
  assert.equal(await h.ctx.perform('claimQuest'), true); assert.equal(h.state.quest, 1); assert.deepEqual(told, []);
  await h.ctx.perform('claimQuest');
  assert.deepEqual(h.calls.filter(call => call.startsWith('refused')), ['refused:claimQuest'], 'the refusal toast is not lost');
});

// ---- levelCheck(): one levelUp per level gained --------------------------------------------------------------------
const leveller = await mainHarness({ functions: ['levelCheck'] });
test('levelCheck emits exactly one levelUp per level gained', () => {
  const state = M.newGame(), told = listen();
  const ctx = leveller.context({ state, inbox: { announce: () => false }, actionHandler: null, persistence: null, colossusChoice: () => false, loadInsight: async () => {}, insight: null,
    toast() {}, tone() {}, world: { burst() {}, position: { x: 0, z: 0 } }, levelFlash() {} });
  state.level = 5; ctx.levelCheck(2);
  assert.deepEqual(plain(told), [['levelUp', { level: 3 }], ['levelUp', { level: 4 }], ['levelUp', { level: 5 }]], 'three levels at once: three events, in order');
  ctx.levelCheck(5); ctx.levelCheck(7);
  assert.equal(told.length, 3, 'no level gained: nothing');
  state.level = 6; ctx.levelCheck(5);
  assert.deepEqual(plain(told.slice(3)), [['levelUp', { level: 6 }]]);
});

// ---- started: once, after the features are mounted -----------------------------------------------------------------
const loader = await mainHarness({ functions: ['loadFeatures'], variables: ['featuresAsked'] });
test('the features are asked for once, after the first played frame, and started fires once when they are mounted', async () => {
  const told = listen(), order = [], frameListeners = new Set(), serviceHost = { name: 'host' }, addPhrases = () => {};
  const ctx = loader.context({ frameListeners, serviceHost, addPhrases, console, setTimeout() { assert.fail('no retry after a load that worked'); } });
  let loads = 0;
  const load = async () => { loads++; order.push('chunk'); return { async mountFeatures(host, phrases) {
    assert.equal(host, serviceHost); assert.equal(phrases, addPhrases);
    order.push('mounting'); await tick(); order.push('mounted'); assert.deepEqual(names(told), [], 'not before the features are mounted: they would miss it'); return { services: true };
  } }; };
  ctx.loadFeatures(load); ctx.loadFeatures(load); // start() run twice (a double click) asks once
  assert.equal(frameListeners.size, 1); assert.equal(loads, 0, 'nothing is fetched before a frame was played');
  const [firstFrame] = frameListeners;
  firstFrame(1 / 60);
  assert.equal(frameListeners.size, 0, 'the frame listener is gone after its one frame');
  assert.equal(loads, 1);
  await tick(); await tick(); await tick();
  assert.deepEqual(order, ['chunk', 'mounting', 'mounted']);
  assert.deepEqual(plain(told), [['started', {}]]);
  ctx.loadFeatures(load);
  assert.equal(frameListeners.size, 0); await tick();
  assert.equal(names(told).filter(event => event === 'started').length, 1, 'started fires once per page');
});

test('a feature chunk that cannot be fetched is logged and asked for once more, 8 s later; started then fires once', async () => {
  const run = async answers => {
    const told = listen(), frameListeners = new Set(), logged = [], timers = [];
    const ctx = loader.context({ frameListeners, serviceHost: {}, addPhrases() {}, console: { error: error => logged.push(String(error)) }, setTimeout: (fn, ms) => { timers.push([fn, ms]); } });
    let loads = 0;
    ctx.loadFeatures(async () => { if (!answers[loads++]) throw new Error('offline'); return { mountFeatures: async () => ({}) }; });
    for (const listener of frameListeners) listener(1 / 60);
    await tick(); await tick();
    return { told, logged, timers, loads: () => loads };
  };
  const second = await run([false, true]);
  assert.deepEqual(second.told, [], 'the game goes on without its features for now'); assert.equal(second.logged.length, 1); assert.match(second.logged[0], /offline/);
  assert.deepEqual(second.timers.map(([, ms]) => ms), [8000]);
  second.timers[0][0](); await tick(); await tick();
  assert.equal(second.loads(), 2); assert.deepEqual(plain(second.told), [['started', {}]]);
  const never = await run([false, false]);
  never.timers[0][0](); await tick(); await tick();
  assert.equal(never.loads(), 2); assert.equal(never.timers.length, 1, 'one retry, not a loop'); assert.equal(never.logged.length, 2); assert.deepEqual(never.told, []);
});

test('asking again (the radio before its player came): one more load while the features are missing, none once they are mounted', async () => {
  const again = await mainHarness({ functions: ['loadFeatures', 'retryFeatures'], variables: ['featuresAsked'] });
  const frame = listeners => { for (const listener of [...listeners]) listener(1 / 60); };
  // Missing: the first fetch failed and its 8 s retry has not run. The tap asks at once, on the next frame.
  const told = listen(), frameListeners = new Set(), timers = [], logged = [];
  const ctx = again.context({ frameListeners, serviceHost: {}, addPhrases() {}, console: { error: error => logged.push(String(error)) }, setTimeout: (fn, ms) => { timers.push([fn, ms]); } });
  let loads = 0; const load = async () => { if (!loads++) throw new Error('offline'); return { mountFeatures: async () => ({ mounted: true }) }; };
  ctx.loadFeatures(load); frame(frameListeners); await tick(); await tick();
  assert.equal(logged.length, 1); assert.equal(frameListeners.size, 0); assert.equal(timers.length, 1, 'the 8 s retry is waiting');
  ctx.retryFeatures(load); assert.equal(frameListeners.size, 1, 'asked for again (house-life.ts asks once per wish)');
  assert.deepEqual(told, []);
  frame(frameListeners); await tick(); await tick(); await tick();
  assert.equal(loads, 2); assert.deepEqual(plain(told), [['started', {}]], 'mounted by the tap');
  // Mounted: asking again does nothing, and the old 8 s retry answering late does not tell 'started' twice.
  ctx.retryFeatures(load); assert.equal(frameListeners.size, 0, 'nothing more to load');
  timers[0][0](); await tick(); await tick(); await tick();
  assert.equal(loads, 3); assert.deepEqual(plain(told), [['started', {}]], 'started fires once per page, however many loads answer');
});

// ---- WP12: the places the creature voices hang on --------------------------------------------------------------------
test('telegraph, the alert beep and the hit sound: the lines features/creature-voices.ts relies on', () => {
  const src = file => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), main = src('main.ts'), world = src('world.ts');
  // The creature's own notice replaces the beep once a feature listens (emit is true then); before that the beep stays.
  assert.match(main, /world\.onAlert=e=>\{emit\('creatureAlert',\{enemy:e\}\)\|\|tone\('alert'\);\};/);
  assert.match(main, /world\.onTelegraph=\(enemy,time\)=>\{emit\('telegraph',\{enemy,time\}\);\};/);
  // world.ts tells a wind-up once, where it starts, with the time the telegraph on the ground uses.
  assert.equal(world.split('this.onTelegraph?.(').length, 2);
  assert.match(world, /e\.windupTotal=e\.phaseTime;this\.onTelegraph\?\.\(e,e\.phaseTime\);/);
  // A pet's hit is swapped for its own sound by the feature, which must know whose blow it is before the sound is asked for:
  // hitLanded is told before the hit sound, in one step.
  const line = main.split('\n').find(l => l.includes("emit('hitLanded',"));
  assert.ok(line.indexOf("emit('hitLanded',") < line.indexOf("tone(impact?.critical?'crit'") && line.includes("tone(impact?.critical?'crit'"), 'main.ts hit() tells hitLanded before it plays the hit');
  // The Colossus roars with its own sound, and the features get the health bar as a part of 1.
  assert.match(src('colossus.ts'), /tone\(a\.skill === 'roar' \? 'roar' : 'crit'\)/);
  assert.match(main, /health:\(\)=>state\.hp\/M\.maxHp\(state\),/);
});

test.after(() => connect(undefined));
