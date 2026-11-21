// Hit feel in the real main.ts code (AAA-PLAN WP9): frame() spending a hit-stop, and the kept Attack press through
// basicAttack() and stepFight(). The pieces are cut out of main.ts and run against a stub world (support/main-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphicsGovernor } from '../src/graphics.ts';
import * as M from '../src/model.ts';
import { BoulderFx } from '../src/boulder-fx.ts';
import { DisguiseFx } from '../src/disguise-fx.ts';
import { CombatTimers } from '../src/gameplay-controls.ts';
import { DIVE } from '../src/jump-rules.ts';
import { PRESS_BUFFER } from '../src/press-buffer.ts';
import { mainHarness } from './support/main-harness.mjs';

const frames = await mainHarness({ functions: ['frame'] });
const noop = () => {};

function frameFixture({ role = null, hitstop = 0, posed = true } = {}) {
  let now = 0; const log = { holds: [], steps: [], timers: [], fight: [], listeners: [], text: [], renders: 0 };
  const context = {
    graphics: new GraphicsGovernor({ mobile: false, devicePixelRatio: 1 }), previous: 0, frameTime: 0, elapsed: 0, uiElapsed: 0,
    flight: null, arriving: false, started: true, settledAt: -1, actionHandler: null, wasAirborne: false, fishGame: null, recastUntil: 0, modal: '',
    state: M.newGame(), document: { hidden: false }, performance: { now: () => now }, innerWidth: 1280, innerHeight: 720, network: { role },
    ship: { update: noop }, gestures: { update: noop }, joystick: { update: noop },
    combatTimers: { advance: dt => log.timers.push(dt) }, stepFight: dt => log.fight.push(dt),
    combat: { update: noop, statuses: {}, airborne: 0, projectiles: [], allies: [], pose: 'idle' },
    combatView: { update: noop }, fishingView: { update: noop, active: false }, pondSplash: { update: noop }, villageFun: { update: noop }, breakables: { update: noop }, rodTip: {},
    skillFx: { disguises: new DisguiseFx({ ground: () => 0, explorerAt: () => null }), boulders: new BoulderFx({ ground: () => 0, explorerAt: () => null }), update: noop, gazeAngle: () => null },
    uiBlocked: () => false,
    world: {
      time: 0, player: { position: { y: 0 } }, position: { x: 0, z: 0 },
      fx: { hitstop, posed, updateText: dt => log.text.push(dt) },
      update(dt) { log.steps.push(dt); this.time += dt; }, hold: dt => log.holds.push(dt), syncCrops: noop, applyGraphics: noop, render() { log.renders++; },
    },
    $: () => ({ hidden: true }), autoAttack: noop, questWalk: { update: noop, holds: () => false }, updateContextWeapon: noop, updateHunting: noop, updateGuardian: noop, positionLabels: noop,
    minimap: { frame: noop }, frameListeners: new Set([dt => log.listeners.push(dt)]), updateHud: noop, updateLabels: noop, measureHud: noop, hudFresh: false,
    save: noop, saveGraphics: noop, requestAnimationFrame: noop,
  };
  const ctx = frames.context(context);
  return { ctx, log, fx: ctx.world.fx, world: ctx.world, frame(ms = 1000 / 60) { now += ms; ctx.frame(now); } };
}
const sum = list => list.reduce((a, b) => a + b, 0), near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('frame(): a held frame runs no step at all, the stop drains exactly, and the rest of its last frame is played', () => {
  const f = frameFixture({ hitstop: .035 });
  f.frame();
  assert.deepEqual(f.log.steps, [], 'no world step'); assert.deepEqual(f.log.timers, [], 'no cooldown time'); assert.deepEqual(f.log.fight, [], 'no fight step');
  assert.ok(near(f.log.holds[0], 1 / 60)); assert.equal(f.world.time, 0); assert.equal(f.log.renders, 1, 'the held frame is still drawn');
  assert.ok(near(f.log.text[0], 1 / 60), 'floating text runs on real time'); assert.equal(f.log.listeners[0], 0, 'the frame listeners get no game time');
  f.frame();
  assert.deepEqual(f.log.steps, []); assert.equal(f.log.holds.length, 2);
  f.frame();
  assert.equal(f.log.holds.length, 3); assert.ok(near(sum(f.log.holds), .035), `held ${sum(f.log.holds)} s in all`);
  assert.ok(near(sum(f.log.steps), 3 / 60 - .035), 'the last frame plays what the stop left of it'); assert.ok(near(sum(f.log.timers), sum(f.log.steps)));
  assert.ok(Math.abs(f.fx.hitstop) < 1e-12, 'drained');
  f.frame();
  assert.equal(f.log.holds.length, 3, 'and nothing is held after'); assert.ok(near(sum(f.log.steps), 4 / 60 - .035));
  assert.equal(f.log.renders, 4);
});

test('frame(): a stop asked for between two frames waits until its blow has been drawn', () => {
  const f = frameFixture({ hitstop: .06, posed: false });
  f.frame();
  assert.deepEqual(f.log.holds, [], 'the first frame plays: it poses the blow'); assert.ok(near(sum(f.log.steps), 1 / 60)); assert.equal(f.fx.hitstop, .06);
  f.fx.posed = true; // fx.update() says so in the game (the stub world's update does not)
  for (let i = 0; i < 5; i++) f.frame();
  assert.ok(near(sum(f.log.holds), .06)); assert.ok(near(sum(f.log.steps), 6 / 60 - .06));
});

test('frame(): in an online room nothing is held; the stop only runs out', () => {
  for (const role of ['host', 'peer']) {
    const f = frameFixture({ role, hitstop: .11 });
    for (let i = 0; i < 9; i++) f.frame();
    assert.deepEqual(f.log.holds, [], role); assert.ok(near(sum(f.log.steps), 9 / 60), 'every frame is played whole'); assert.ok(near(sum(f.log.timers), 9 / 60));
    assert.ok(Math.abs(f.fx.hitstop) < 1e-12, 'the stop is spent all the same, so it cannot wait for the room to end');
  }
});

const fight = await mainHarness({ functions: ['basicAttack', 'stepFight'], variables: ['pressBuffer'] });
function fightFixture() {
  const log = { swings: 0, basic: 0, dives: 0, used: 0 };
  const combatTimers = new CombatTimers();
  const ctx = fight.context({
    ctfApi: null, swim: { blocksActions: () => false }, started: true, visiting: false, uiBlocked: () => false, actionHandler: null, lastSwingAt: 0,
    performance: { now: () => 0 }, state: M.newGame(), combatTimers,
    world: { jump: { airborne: false, falling: false, height: 0, diving: false }, playerAttack() { log.swings++; }, fx: null },
    combat: { basic() { log.basic++; return true; }, edge: { chain: false }, chainLast: 0 },
    prepareCombatWeapon: noop, tone: noop, emitAction: noop, startDive() { log.dives++; return true; }, useInstead() { log.used++; return true; }, interactPrompted() { log.used++; },
    syncAirCombat: noop, airOn: () => false,
  });
  const step = (dt = .025) => { combatTimers.advance(dt, true); ctx.stepFight(dt, true, true); };
  return { ctx, log, combatTimers, step };
}

test('a press during the cooldown is kept and swings once, on the step the cooldown ends; it never uses a thing', () => {
  const f = fightFixture();
  f.ctx.basicAttack(); assert.equal(f.log.swings, 1); const cooldown = f.combatTimers.attackCooldown; assert.ok(cooldown > .2);
  while (f.combatTimers.attackCooldown > .1 + 1e-9) f.step();
  f.ctx.basicAttack(); f.ctx.basicAttack(); assert.equal(f.log.swings, 1, 'still cooling down: kept, not swung');
  let steps = 0; while (f.log.swings === 1 && steps < 20) { f.step(); steps++; }
  assert.equal(f.log.swings, 2); assert.ok(steps * .025 <= .1 + .025 + 1e-9, `after ${steps} steps`); assert.ok(near(f.combatTimers.attackCooldown, cooldown), 'the new swing has its own cooldown');
  for (let i = 0; i < 60; i++) f.step();
  assert.equal(f.log.swings, 2, 'two presses in the wait were one swing, and it fired once'); assert.equal(f.log.used, 0); assert.equal(f.log.dives, 0);
});

test('a press too early is dropped, and a stop (no game time) does not eat the wait', () => {
  const f = fightFixture();
  f.ctx.basicAttack(); f.ctx.basicAttack(); // pressed with the whole cooldown ahead: more than the wait
  assert.ok(f.combatTimers.attackCooldown > PRESS_BUFFER);
  for (let i = 0; i < 60; i++) f.step();
  assert.equal(f.log.swings, 1);
  f.ctx.basicAttack(); assert.equal(f.log.swings, 2);
  while (f.combatTimers.attackCooldown > .1 + 1e-9) f.step();
  f.ctx.basicAttack();
  for (let i = 0; i < 30; i++) f.ctx.stepFight(0, true, true); // held frames would not even step; a step of no time keeps the press
  assert.equal(f.log.swings, 2);
  for (let i = 0; i < 6; i++) f.step();
  assert.equal(f.log.swings, 3);
});

test('a kept press never becomes a dive: falling from height when the cooldown ends, it is dropped', () => {
  const f = fightFixture();
  f.ctx.basicAttack();
  while (f.combatTimers.attackCooldown > .1 + 1e-9) f.step();
  f.ctx.basicAttack(); assert.equal(f.log.swings, 1);
  Object.assign(f.ctx.world.jump, { airborne: true, falling: true, height: DIVE.minHeight + 1 });
  for (let i = 0; i < 12; i++) f.step();
  assert.equal(f.log.dives, 0); assert.equal(f.log.swings, 1, 'no swing either: the press is gone');
  Object.assign(f.ctx.world.jump, { airborne: false, falling: false, height: 0 });
  for (let i = 0; i < 12; i++) f.step();
  assert.equal(f.log.swings, 1, 'and it does not come back on landing');
});
