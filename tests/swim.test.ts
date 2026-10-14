// Crossing water (src/swim-rules.ts): hold to enter, wade and swim, stamina pull-back, glide, the no-swim flag, strings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SwimState, SWIM, shoreStop, deepEdge, modeAt, shorePoint, pushesIn, swimSpeed, swimBlocksActions, cleanSwimMode, type Pool, type SwimInput } from '../src/swim-rules.ts';
import { JumpState, JUMP } from '../src/jump-rules.ts';
import { SWIM_VI, SWIM_HELP_VI } from '../src/locales/vi-swim.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { HELP_TOPICS } from '../src/help-topics.ts';
import { HELP_TOPICS_VI } from '../src/locales/vi-help-topics.ts';

const pond: Pool = { id: 'p', x: 0, z: 0, r: 6 };
const shore = shoreStop(pond) + .01; // where a walker stops, just outside the collider
const input = (over: Partial<SwimInput>): SwimInput => ({ pools: [pond], x: -shore, z: 0, pushX: 0, pushZ: 0, enabled: true, ...over });
const run = (s: SwimState, seconds: number, over: Partial<SwimInput>, dt = 1 / 60) => { let last; for (let t = 0; t < seconds - 1e-9; t += dt) last = s.step(dt, input(over)); return last!; };

test('the shore line, the shallows and the deep', () => {
  assert.equal(shoreStop(pond), 6 + SWIM.lip + SWIM.clearance);
  assert.equal(modeAt([pond], -shore, 0).mode, 'land');
  assert.equal(modeAt([pond], -5.5, 0).mode, 'wade');
  assert.equal(modeAt([pond], -2, 0).mode, 'swim');
  assert.ok(deepEdge({ x: 0, z: 0, r: 3.3 }) > 0, 'even the small home pond has a deep middle');
  const p = shorePoint(pond, 1, 1); assert.ok(Math.hypot(p.x, p.z) > shoreStop(pond));
});

test('walking into the water stops at the shore until the push is held for half a second', () => {
  const s = new SwimState();
  let step = run(s, .3, { pushX: 1 });
  assert.equal(step.pass, false, 'a short push does not step in'); assert.ok(step.push > .5 && step.push < 1);
  step = run(s, .25, { pushX: 1 });
  assert.equal(s.inside, true); assert.equal(step.pass, true); assert.equal(s.mode, 'wade');
});

test('no accidental entry: letting go or pushing along the shore resets the count', () => {
  const s = new SwimState();
  run(s, .4, { pushX: 1 }); run(s, .1, {}); run(s, .4, { pushX: 1 });
  assert.equal(s.inside, false, 'the pause reset the count');
  run(s, 2, { pushZ: 1 }); assert.equal(s.inside, false, 'along the shore never counts');
  assert.equal(pushesIn(pond, -shore - 3, 0, 1, 0), false, 'too far from the water');
});

test('a press held on the water steps in (tap-to-walk on a phone) and says where to go', () => {
  const s = new SwimState();
  let step = run(s, .45, { press: { x: -2, z: 0, age: .1 } });
  assert.equal(s.inside, false);
  step = s.step(.06, input({ press: { x: -2, z: 0, age: .1 } }));
  assert.equal(s.inside, true); assert.deepEqual(step.entered, { by: 'press', to: { x: -2, z: 0 } });
  const t = new SwimState(); run(t, 2, { press: { x: -2, z: 0, age: 1 } }); assert.equal(t.inside, false, 'a released press (stale) does not count');
  const u = new SwimState(); run(u, 2, { press: { x: -shore - 4, z: 0, age: .1 } }); assert.equal(u.inside, false, 'a press on the grass does not count');
});

test('wading and swimming are slower; swimming blocks attacks and skills', () => {
  assert.equal(swimSpeed('land'), 1); assert.ok(swimSpeed('wade') < 1); assert.ok(swimSpeed('swim') < swimSpeed('wade'));
  assert.equal(swimBlocksActions('swim'), true); assert.equal(swimBlocksActions('wade'), false); assert.equal(swimBlocksActions('land'), false);
});

test('stamina drains in the deep and pulls the explorer back to the nearest shore', () => {
  const s = new SwimState(); run(s, .6, { pushX: 1 });
  let step = run(s, SWIM.swimTime / 2, { x: -1, z: 0 });
  assert.equal(s.mode, 'swim'); assert.ok(Math.abs(s.stamina - .5) < .02);
  step = run(s, SWIM.swimTime / 2 + .1, { x: -1, z: 0 });
  assert.ok(step.pulled, 'pulled out'); assert.ok(step.pulled!.x < -shoreStop(pond), 'to the nearest (west) shore');
  assert.equal(s.inside, false); assert.equal(s.mode, 'land');
  run(s, SWIM.landRefill + .1, { x: step.pulled!.x, z: 0 }); assert.equal(s.stamina, 1, 'refilled on land');
});

test('wading refills, and walking out leaves the water without a push', () => {
  const s = new SwimState(); s.stamina = .5; run(s, .6, { pushX: 1 });
  run(s, 1, { x: -5.6, z: 0 }); assert.equal(s.mode, 'wade'); assert.ok(s.stamina > .5);
  run(s, .1, { x: -shore - .1, z: 0 }); assert.equal(s.inside, false); assert.equal(s.mode, 'land');
});

test('a double jump may pass over water and glides while a direction is held; a single jump does not', () => {
  const s = new SwimState();
  let step = s.step(.016, input({ air: { jumps: 1, falling: true, height: 1 }, pushX: 1 }));
  assert.equal(step.pass, false); assert.equal(step.glide, false);
  step = s.step(.016, input({ x: -3, air: { jumps: 2, falling: true, height: 3 }, pushX: 1 }));
  assert.equal(step.pass, true); assert.equal(step.glide, true);
  step = s.step(.016, input({ x: -3, air: { jumps: 2, falling: true, height: 3 } }));
  assert.equal(step.glide, false, 'no direction held: a plain fall');
  // Landing in the deep starts a swim.
  step = s.step(.016, input({ x: -1 })); assert.equal(s.inside, true); assert.equal(s.mode, 'swim');
});

test('the glide caps the fall: a double jump hangs about two seconds (about 10 m at a walk)', () => {
  const j = new JumpState(); j.jump(); for (let i = 0; i < 20; i++) j.step(1 / 60); j.jump(); j.glide = SWIM.glideFall;
  let t = 0; while (j.airborne && t < 10) { j.step(1 / 60); t += 1 / 60; }
  assert.ok(t > 1.6, `glided ${t.toFixed(2)} s`);
  const k = new JumpState(); k.jump(); for (let i = 0; i < 20; i++) k.step(1 / 60); k.jump();
  let u = 0; while (k.airborne && u < 10) { k.step(1 / 60); u += 1 / 60; }
  assert.ok(u < 1, 'without a glide it falls as before'); assert.equal(JUMP.fallMax, 26);
});

test('a pond marked no-swim stays a barrier, and a landing in it goes back to the shore', () => {
  const gate: Pool = { ...pond, noSwim: true }, s = new SwimState();
  let step: ReturnType<SwimState['step']> | undefined;
  for (let i = 0; i < 120; i++) step = s.step(1 / 60, { ...input({ pushX: 1 }), pools: [gate] });
  assert.equal(s.inside, false); assert.equal(step!.pass, false);
  step = s.step(.016, { ...input({ x: -2 }), pools: [gate] }); assert.ok(step.bounced);
  step = s.step(.016, { ...input({ x: -3, air: { jumps: 3, falling: true, height: 2 }, pushX: 1 }), pools: [gate] }); assert.equal(step.glide, false);
});

test('switched off (ocean, indoors, cut-scenes) it is plain land', () => {
  const s = new SwimState(); run(s, .6, { pushX: 1 }); assert.equal(s.inside, true);
  const step = s.step(.016, input({ enabled: false })); assert.equal(step.pass, false); assert.equal(s.mode, 'land');
});

test('the movement sync only carries the two water modes', () => {
  assert.equal(cleanSwimMode('swim'), 'swim'); assert.equal(cleanSwimMode('wade'), 'wade'); assert.equal(cleanSwimMode('fly'), 'land'); assert.equal(cleanSwimMode(undefined), 'land');
  const server = readFileSync(new URL('../server/server.mjs', import.meta.url), 'utf8');
  assert.match(server, /swim: message\.swim === 'wade' \|\| message\.swim === 'swim' \? message\.swim : 'land'/);
});

test('the pond collider is tagged as water, so swimmers cross it and shots fly over it', () => {
  const world = readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8');
  assert.match(world, /this\.obstacles\.push\(\{x,z,r:r\+\.15,water:true\}/);
  assert.match(world, /clearSegment\(from,shot\.mesh\.position,this\.shotObstacles\(\)/);
  assert.match(world, /const obstacles=this\.moverObstacles\(\),options=this\.navigationOptions\(\.36,allowVoid\)/);
});

test('every swim string has Vietnamese, in the pack and in the help', () => {
  for (const [en, vi] of Object.entries(SWIM_VI)) { assert.equal(VI_PACK[en], vi, en); assert.notEqual(vi, en); }
  const topic = HELP_TOPICS.find(([, title]) => title === 'Crossing water');
  assert.ok(topic, 'help topic'); assert.equal(HELP_TOPICS_VI['Crossing water'], SWIM_HELP_VI[0]); assert.equal(HELP_TOPICS_VI[topic![2]], SWIM_HELP_VI[1]);
  const swim = readFileSync(new URL('../src/swim.ts', import.meta.url), 'utf8');
  for (const m of swim.matchAll(/host\.toast\('([^']+)'/g)) assert.ok(SWIM_VI[m[1]], 'translated: ' + m[1]);
});
