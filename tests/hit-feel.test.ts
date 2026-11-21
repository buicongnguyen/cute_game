// Hit feel 2.0 (AAA-PLAN WP9): the stop table, the trauma shake, the press buffer, the pitch ladder and the zoom punch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { STOP, STOP_BUDGET, StopBudget, budgetStops, KICK, LADDER, hitStop, hitFeel, pitchStep } from '../src/hit-stop.ts';
import { SHAKE, Shake, shakeGain } from '../src/shake.ts';
import { PRESS_BUFFER, PressBuffer } from '../src/press-buffer.ts';
import { PUNCH, zoomPunch, cameraOffset } from '../src/camera-rig.ts';
import { Effects } from '../src/fx.ts';
import { STEP, frameSteps } from '../src/frame-steps.ts';
import { buzzGuard, buzzLength, shakeChoice, flashChoice } from '../src/features/comfort.ts';

test('the stop table: own light 0.035, third chain hit 0.06, critical 0.08, power 0.09, break 0.11; a pet and Battery saver 0', () => {
  assert.deepEqual({ ...STOP }, { light: .035, big: .06, critical: .08, power: .09, break: .11, kill: .05 });
  assert.equal(hitStop({}), .035); assert.equal(hitStop({ big: true }), .06); assert.equal(hitStop({ critical: true }), .08);
  assert.equal(hitStop({ power: true }), .09); assert.equal(hitStop({ broke: true }), .11); assert.equal(hitStop({ kill: true }), .05);
  assert.equal(hitStop({ critical: true, big: true, kill: true }), .08, 'the longest wins; they never add up');
  assert.equal(hitStop({ broke: true, power: true, critical: true }), .11);
  assert.equal(hitStop({ helper: true, critical: true, broke: true }), 0, 'a pet or a helper stops nothing');
  for (const blow of [{}, { big: true }, { critical: true }, { power: true }, { broke: true }, { kill: true }]) assert.equal(hitStop(blow, true), 0, 'Battery saver');
});

const blow = (over: object = {}) => ({ amount: 5, critical: false, stun: 0, lift: 0, knock: .8, direction: { x: 0, z: 1 }, ...over });
function feelLog() {
  const log: unknown[][] = [];
  return { log, fx: { density: 1, freeze: (s: number, _light?: boolean) => { log.push(['freeze', s]); }, shake: (a: number, x?: number, z?: number) => { log.push(['shake', a, x, z]); }, punch: () => { log.push(['punch']); } } };
}
test('the feel of a landed blow: the stop, a kick along the blow, the punch on a power strike and a break; nothing for a pet', () => {
  let f = feelLog(); hitFeel(f.fx, blow(), false, false, 0);
  assert.deepEqual(f.log, [['freeze', STOP.light], ['shake', KICK.light, 0, 1]]);
  f = feelLog(); hitFeel(f.fx, blow({ knock: 2.2, direction: { x: 1, z: 0 } }), false, false, 0);
  assert.deepEqual(f.log, [['freeze', STOP.big], ['shake', KICK.big, 1, 0]], 'the third hit of the chain');
  f = feelLog(); hitFeel(f.fx, blow({ lift: 1.7 }), false, false, 0); assert.equal(f.log[0][1], STOP.big, 'a launch is a big hit');
  f = feelLog(); hitFeel(f.fx, blow({ critical: true }), false, true, 0); assert.deepEqual(f.log, [['freeze', STOP.critical], ['shake', KICK.critical, 0, 1]]);
  f = feelLog(); hitFeel(f.fx, blow(), false, true, 0); assert.deepEqual(f.log, [['freeze', STOP.kill], ['shake', KICK.kill, 0, 1]]);
  f = feelLog(); hitFeel(f.fx, blow({ source: 'power' }), false, false, 0); assert.deepEqual(f.log.map(l => l[0]), ['freeze', 'shake', 'punch']); assert.equal(f.log[0][1], STOP.power); assert.equal(f.log[1][1], KICK.power);
  f = feelLog(); hitFeel(f.fx, blow(), true, false, 0); assert.equal(f.log[0][1], STOP.break); assert.deepEqual(f.log[2], ['punch']);
  for (const pet of [{ helper: true }, { source: 'pet' }, { source: 'summon' }]) { f = feelLog(); assert.equal(hitFeel(f.fx, blow({ critical: true, ...pet }), true, true, 4), 0); assert.deepEqual(f.log, []); }
  f = feelLog(); f.fx.density = .5; hitFeel(f.fx, blow({ critical: true }), false, false, 0); assert.deepEqual(f.log.map(l => l[0]), ['shake'], 'Battery saver: no stop, the kick stays');
  assert.equal(hitFeel(undefined, blow(), false, false, 3), 200, 'the pitch is told without effects too');
});

test('the pitch ladder: a semitone per hit of the chain, capped at +5, and back to 0 with a new chain', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 30].map(pitchStep), [0, 0, 100, 200, 300, 400, 500, 500, 500]);
  assert.equal(LADDER.step * LADDER.cap, 500); assert.equal(pitchStep(NaN), 0); assert.equal(pitchStep(-3), 0);
  const f = feelLog(), heard: number[] = [];
  for (let chain = 1; chain <= 8; chain++) heard.push(hitFeel(f.fx, blow(), false, false, chain));
  heard.push(hitFeel(f.fx, blow(), false, false, 1)); // the chain ran out: the next hit is the first of a new one
  assert.deepEqual(heard, [0, 100, 200, 300, 400, 500, 500, 500, 0]);
});

const run = (hz: number, seconds: number, start: (s: Shake) => void) => {
  const s = new Shake(), out = new T.Vector3(), frames: { t: number; trauma: number; x: number; y: number; z: number; roll: number }[] = [];
  start(s);
  for (let i = 0; i <= Math.round(seconds * hz); i++) { const trauma = s.trauma; s.offset(1 / hz, out); frames.push({ t: i / hz, trauma, x: out.x, y: out.y, z: out.z, roll: s.roll }); }
  return frames;
};
test('trauma 1 is under 0.05 within 0.7 s, on the same curve at 60 and 120 Hz', () => {
  const at60 = run(60, 1, s => s.add(1, 0, 1)), at120 = run(120, 1, s => s.add(1, 0, 1));
  assert.ok(at60.find(f => f.t >= .7)!.trauma < .05 && at120.find(f => f.t >= .7)!.trauma < .05);
  assert.ok(at60.find(f => f.t >= .6)!.trauma > .05, 'and not before 0.6 s: it decays at 1.5 a second');
  for (let i = 0; i < at60.length; i++) {
    const a = at60[i], b = at120[i * 2];
    for (const key of ['trauma', 'x', 'y', 'z', 'roll'] as const) assert.ok(Math.abs(a[key] - b[key]) < 1e-9, `${key} at ${a.t.toFixed(3)} s: ${a[key]} at 60 Hz, ${b[key]} at 120 Hz`);
  }
  assert.ok(at60.at(-1)!.x === 0 && at60.at(-1)!.z === 0 && at60.at(-1)!.roll === 0, 'at rest when it is over');
  assert.equal(SHAKE.decay, 1.5); assert.equal(SHAKE.hz, 18);
});

test('the shake kicks along the blow first, never rolls past half a degree, and is the same every time', () => {
  for (const [dx, dz] of [[0, 1], [1, 0], [-3, 4], [0, -2]]) {
    const frames = run(60, .5, s => s.add(.5, dx, dz)), l = Math.hypot(dx, dz), first = frames[0];
    assert.ok(Math.abs(first.x - dx / l * .5) < 1e-9 && Math.abs(first.z - dz / l * .5) < 1e-9, 'the first frame is the whole reach along the blow');
    let along = 0, across = 0;
    for (const f of frames) { along += Math.abs(f.x * dx / l + f.z * dz / l); across += Math.abs(f.z * dx / l - f.x * dz / l); }
    assert.ok(along > across * 1.8, `biased along the blow (${along.toFixed(3)} along, ${across.toFixed(3)} across)`);
  }
  const big = run(60, .7, s => s.add(1, 1, 0));
  assert.ok(Math.max(...big.map(f => Math.abs(f.roll))) <= .5 * Math.PI / 180 + 1e-12); assert.ok(big.some(f => Math.abs(f.roll) > .1 * Math.PI / 180));
  assert.ok(Math.max(...big.map(f => Math.hypot(f.x, f.z))) <= 1.1, 'never further than its reach');
  assert.deepEqual(run(60, .7, s => s.add(1, 1, 0)), big, 'no randomness');
  const weak = new Shake(); weak.add(.4, 1, 0); weak.offset(.05, new T.Vector3()); const trauma = weak.trauma; weak.add(.05, 0, 1);
  assert.equal(weak.trauma, trauma, 'a weaker blow does not cut a shake in progress'); assert.equal(weak.x, 1);
  weak.add(NaN); weak.add(-1); assert.equal(weak.trauma, trauma);
});

test('Screen shake Off gives a zero offset and no roll; Low is smaller and never rolls; the default follows prefers-reduced-motion', () => {
  const out = new T.Vector3();
  const off = new Shake(shakeGain('off')); off.add(1, 1, 0);
  for (let i = 0; i < 40; i++) { off.offset(1 / 60, out); assert.equal(out.lengthSq(), 0); assert.equal(off.roll, 0); }
  const low = new Shake(shakeGain('low')), full = new Shake(shakeGain('full')), lowOut = new T.Vector3();
  low.add(1, 1, 0); full.add(1, 1, 0);
  for (let i = 0; i < 40; i++) { low.offset(1 / 60, lowOut); full.offset(1 / 60, out); assert.ok(Math.abs(lowOut.length() - out.length() * SHAKE.low) < 1e-9); assert.equal(low.roll, 0); }
  assert.equal(shakeGain(null, false), 1); assert.equal(shakeGain(null, true), SHAKE.low, 'Low under prefers-reduced-motion');
  assert.equal(shakeGain('full', true), 1, 'a choice made wins over the system'); assert.equal(shakeGain('off', false), 0); assert.equal(shakeGain('nonsense', false), 1);
  assert.equal(shakeChoice('', true), 'low'); assert.equal(shakeChoice('', false), 'full'); assert.equal(shakeChoice('off', true), 'off'); assert.equal(shakeChoice('full', true), 'full');
  assert.equal(flashChoice(''), 'on'); assert.equal(flashChoice('low'), 'low');
  // The effects: Off also stops the zoom punch.
  const fx = new Effects(new T.Scene(), new T.PerspectiveCamera()), view = cameraOffset(16 / 9);
  assert.equal(fx.shakeOffset(1 / 60, out, view).lengthSq(), 0, 'before the shake model is there: no shake'); fx.shake(1); assert.equal(fx.roll, 0);
  fx.rig = new Shake(0); fx.shake(1, 1, 0); fx.punch();
  for (let i = 0; i < 20; i++) assert.equal(fx.shakeOffset(1 / 60, out, view).lengthSq(), 0);
  assert.equal(fx.roll, 0);
});

test('a press 0.1 s before the cooldown ends swings on the frame it ends; one 0.3 s before is dropped', () => {
  const swingsAfter = (cooldown: number, dt = STEP) => {
    const buffer = new PressBuffer(); let fired = -1, t = 0;
    buffer.press();
    for (let i = 0; i < 40 && fired < 0; i++) { cooldown = Math.max(0, cooldown - dt); t += dt; if (buffer.step(dt, cooldown <= 1e-12)) fired = t; }
    return fired;
  };
  assert.ok(Math.abs(swingsAfter(.1) - .1) < 1e-9, 'on the step the cooldown ends');
  assert.equal(swingsAfter(.3), -1); assert.equal(swingsAfter(.2), -1);
  assert.ok(Math.abs(swingsAfter(.125) - .125) < 1e-9);
  assert.ok(Math.abs(swingsAfter(.1, 1 / 120) - .1) < .009, 'at any step length');
  assert.equal(PRESS_BUFFER, .15);
  const b = new PressBuffer();
  assert.equal(b.step(.025, true), false, 'nothing kept, nothing swings');
  b.press(); assert.equal(b.step(.025, true), true); assert.equal(b.step(.025, true), false, 'one press, one swing');
  b.press(); b.press(); assert.equal(b.step(.025, true), true); assert.equal(b.step(.025, true), false, 'two presses in the wait are one swing');
  b.press(); for (let i = 0; i < 20; i++) assert.equal(b.step(0, false), false); assert.equal(b.step(.025, true), true, 'a hit-stop (no game time) does not eat the wait');
  b.press(); b.clear(); assert.equal(b.step(.025, true), false);
});

test('the zoom punch is 3% at the blow, back to 1 within 80 ms, and scales the view offset without a resize', () => {
  assert.equal(zoomPunch(0), 1 - PUNCH.amount); assert.equal(PUNCH.amount, .03); assert.equal(PUNCH.time, .08);
  assert.equal(zoomPunch(.08), 1); assert.equal(zoomPunch(.2), 1); assert.equal(zoomPunch(-1), 1);
  let last = 0; for (let t = 0; t <= .08; t += .004) { const z = zoomPunch(t); assert.ok(z >= .97 && z <= 1 && z >= last, 'eases back, never past 1'); last = z; }
  assert.ok(Math.abs(zoomPunch(0, .4) - (1 - .012)) < 1e-12); assert.equal(zoomPunch(0, 0), 1);
  // As the world frames its camera (world.ts frameCamera): target + viewOffset + the effects' offset.
  let resized = 0;
  const world = { viewOffset: cameraOffset(16 / 9), resize() { resized++; } }, before = world.viewOffset.clone();
  const fx = new Effects(new T.Scene(), new T.PerspectiveCamera()), out = new T.Vector3(), scales: number[] = [];
  fx.rig = new Shake(1); fx.punch();
  for (let i = 0; i < 12; i++) { fx.shakeOffset(1 / 120, out, world.viewOffset); scales.push(1 + out.dot(world.viewOffset) / world.viewOffset.lengthSq()); assert.ok(out.clone().cross(world.viewOffset).length() < 1e-9, 'a pure scale of the view offset'); }
  assert.ok(Math.abs(scales[0] - .97) < 1e-9); assert.ok(scales.slice(0, 9).every(s => s < 1), 'closer for the first 75 ms');
  assert.ok(scales.slice(10).every(s => s === 1), 'back at 1 from 80 ms on');
  assert.equal(resized, 0); assert.ok(world.viewOffset.equals(before), 'the stored offset itself is never changed');
  fx.punch(); fx.clear(); assert.equal(fx.shakeOffset(1 / 60, out, world.viewOffset).lengthSq(), 0, 'clear() ends a punch');
});

test('a frame spends the stop exactly: the rules lose that time and no more, at any frame rate', () => {
  // main.ts frame(): hold = min(realDt, hitstop); the rules get realDt - hold, the effects all of realDt.
  for (const hz of [60, 120, 144, 30]) for (const stop of Object.values(STOP)) {
    let hitstop = stop, game = 0, real = 0, held = 0, frozenFrames = 0;
    for (let i = 0; i < hz; i++) {
      const realDt = 1 / hz, hold = Math.min(realDt, Math.max(0, hitstop)); hitstop -= hold;
      const dt = realDt - hold; if (hold > 0) { held += hold; if (!frameSteps(dt).length) frozenFrames++; }
      game += dt; real += realDt;
    }
    assert.ok(Math.abs(real - game - stop) < 1e-9 && Math.abs(held - stop) < 1e-9, `${stop} s at ${hz} Hz`);
    assert.equal(frozenFrames, Math.floor(stop * hz + 1e-6), 'whole frames with no step at all');
  }
});

test('the stop budget: ordinary stops hold at most 80 ms of any second; a steady light chain stops on each hit', () => {
  assert.deepEqual({ ...STOP_BUDGET }, { window: 1, most: .08, light: .07, least: .012, signature: .09 });
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  let b = new StopBudget();
  assert.equal(b.grant(STOP.light, 0, true), .035); assert.equal(b.grant(STOP.light, .5, true), .035, 'the second light hit of the second stops too');
  assert.equal(b.grant(STOP.light, .7, true), 0, 'a third does not'); assert.equal(b.grant(STOP.big, .8), 0, '10 ms would be left: not worth a frame');
  assert.ok(near(b.grant(STOP.big, 1.1), .045), 'the first light hit is a second old: the third hit of the chain gets what is left of 80 ms');
  b = new StopBudget(); assert.equal(b.grant(STOP.kill, 0), .05); assert.ok(near(b.grant(STOP.critical, .3), .03)); assert.equal(b.grant(STOP.light, .4, true), 0);
  b = new StopBudget(); b.grant(.08, 5); assert.equal(b.grant(.035, 1, true), .035, 'the clock went back (another world): the past is forgotten');
  // Any pattern of ordinary blows: every rolling second holds at most 80 ms.
  let seed = 7; const random = () => { seed = seed * 1103515245 + 12345 & 0x7fffffff; return seed / 0x7fffffff; };
  const ordinary = [STOP.light, STOP.big, STOP.critical, STOP.kill];
  for (let round = 0; round < 20; round++) {
    const budget = new StopBudget(), log: [number, number][] = []; let t = 0;
    for (let i = 0; i < 400; i++) { t += random() * .3; const stop = ordinary[Math.floor(random() * ordinary.length)], got = budget.grant(stop, t, stop === STOP.light); assert.ok(got === 0 || got >= STOP_BUDGET.least && got <= stop); if (got) log.push([t, got]); }
    for (const [from] of log) { const sum = log.filter(([at]) => at >= from && at < from + 1).reduce((a, [, got]) => a + got, 0); assert.ok(sum <= .08 + 1e-9, `${sum} s held in the second from ${from}`); }
    assert.ok(log.length > 20);
  }
});

test('the signature moments keep their whole length, one a second; the hits after them wait', () => {
  for (const whole of [STOP.power, STOP.break, .12, .14]) {
    const b = new StopBudget(); b.grant(STOP.light, 0, true); b.grant(STOP.light, .3, true);
    assert.equal(b.grant(whole, .5), whole, `${whole} s after two light hits`);
    assert.equal(b.grant(STOP.light, .6, true), 0, 'the second is more than full'); assert.equal(b.grant(STOP.break, .9), 0, 'a second signature stop in the same second is an ordinary one');
    assert.equal(b.grant(STOP.light, 1.55, true), .035, 'a second later the hits stop again'); assert.equal(b.grant(STOP.break, 1.6), STOP.break, 'and so may the next signature moment');
  }
  // With every kind in the mix: never more than one whole signature stop and 80 ms of ordinary stops in a second.
  let seed = 11; const random = () => { seed = seed * 1103515245 + 12345 & 0x7fffffff; return seed / 0x7fffffff; };
  const budget = new StopBudget(), log: [number, number, boolean][] = [], all = [...Object.values(STOP), .12, .14]; let t = 0;
  for (let i = 0; i < 3000; i++) { t += random() * .25; const stop = all[Math.floor(random() * all.length)], got = budget.grant(stop, t, stop === STOP.light); if (got) log.push([t, got, got >= STOP_BUDGET.signature]); }
  for (const [from] of log) { const second = log.filter(([at]) => at >= from && at < from + 1); assert.ok(second.filter(e => e[2]).length <= 1); assert.ok(second.reduce((a, e) => a + e[1], 0) <= .08 + .14 + 1e-9); }
});

/** The game as it delivers stops: hitFeel through the budget in front of the effects' freeze (features/comfort.ts mounts it so). */
function delivered() {
  const fx = { density: 1, hitstop: 0, now: 0, freeze(seconds: number, _light?: boolean) { this.hitstop = Math.max(this.hitstop, seconds); }, shake() {}, punch() {} };
  budgetStops(fx, () => fx.now);
  const hit = (at: number, over: object = {}, broke = false, kill = false) => { fx.now = at; fx.hitstop = 0; hitFeel(fx, blow(over), broke, kill, 0); return +fx.hitstop.toFixed(4); };
  return { fx, hit };
}
test('what a fight really gets: a chain at the sword\'s pace, a critical, a kill, a break, the power strike, a dodge', () => {
  const big = { knock: 2.2 }, crit = { critical: true }, power = { source: 'power', knock: 2.2 };
  let g = delivered();
  // Light, light, heavy at 0.55 s a swing (the wooden sword with its stops), three rounds: every hit stops; the heavy one is cut to 45 ms and the light one after it to 25.
  const chain = [0, .55, 1.1, 1.65, 2.2, 2.75, 3.3, 3.85, 4.4].map((at, i) => g.hit(at, i % 3 === 2 ? big : {}));
  assert.deepEqual(chain, [.035, .035, .045, .025, .035, .045, .025, .035, .045]);
  assert.ok(chain.reduce((a, b) => a + b, 0) / 4.95 < .08, 'under 8% of the fight');
  g = delivered(); assert.equal(g.hit(0, crit), STOP.critical); assert.equal(g.hit(.5), 0, 'the light hit after a critical finds the second full'); assert.equal(g.hit(1.05), .035);
  g = delivered(); assert.equal(g.hit(0, {}, false, true), STOP.kill); assert.equal(g.hit(.5, {}, false, true), .03, 'a second kill in the second is cut to the 80 ms');
  g = delivered(); assert.equal(g.hit(0), .035); assert.equal(g.hit(.4, big, true), STOP.break, 'a break keeps its 110 ms whatever came before'); assert.equal(g.hit(.6, crit), 0);
  g = delivered(); assert.equal(g.hit(0), .035); assert.equal(g.hit(.5, power), STOP.power, 'so does the power strike\'s hit'); assert.equal(g.hit(.9, big, true), 0, 'a break in the same second is ordinary, and the second is full');
  // Two creatures struck by one swing: one stop, the longer, counted once.
  g = delivered(); g.fx.now = 0; hitFeel(g.fx, blow(), false, false, 0); hitFeel(g.fx, blow(big), false, false, 0); assert.equal(g.fx.hitstop, .06); g.fx.hitstop = 0; assert.ok(Math.abs(g.hit(.5, big) - .02) < 1e-9, '60 ms were counted, not 95');
  // The freezes main.ts and the Colossus ask for themselves go the same way: a perfect dodge 0.14 s, the fall 0.12 s, the wave's first beat 0.045 s.
  g = delivered(); g.fx.freeze(.14); assert.equal(g.fx.hitstop, .14); g.fx.hitstop = 0; g.fx.now = .5; g.fx.freeze(.12); assert.equal(g.fx.hitstop, 0, 'not two in a second');
  g.fx.now = 1.2; g.fx.freeze(.045); assert.equal(g.fx.hitstop, .045); g.fx.now = 1.3; g.fx.hitstop = 0; hitFeel(g.fx, blow(power), false, false, 0); assert.equal(g.fx.hitstop, STOP.power);
  // A pet's blow and Battery saver: nothing, and nothing counted.
  g = delivered(); assert.equal(g.hit(0, { helper: true, critical: true }, true, true), 0); g.fx.density = .5; assert.equal(g.hit(.1, crit), 0); g.fx.density = 1; assert.equal(g.hit(.2, crit), STOP.critical);
});

test('haptics: a longer buzz is not cut by a shorter one that comes while it runs', () => {
  assert.equal(buzzLength(12), 12); assert.equal(buzzLength([20, 30, 40]), 90);
  const free = buzzGuard();
  assert.equal(free([20, 30, 40], 1000), true, 'a boss breaks'); assert.equal(free(12, 1010), false, 'the critical of the same blow would cut the pattern: dropped');
  assert.equal(free(25, 1070), true, 'one that outlasts what is left may take over'); assert.equal(free(12, 1100), true, 'and after it, anything');
  assert.equal(free(80, 1105), true, 'a longer one replaces a shorter one'); assert.equal(free(12, 1110), false);
});
