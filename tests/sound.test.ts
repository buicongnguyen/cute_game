import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Sfx, SoundGate, SOUND_EVENTS, ALL_SOUNDS, MAX_VOICES, RATE, RATE_WINDOW, type Sound} from '../src/sfx.ts';

/** A WebAudio stand-in: records every node made and every start() call; time is set by the test. */
function fakeContext() {
  const log = {nodes: 0, starts: 0, made: 0, values: [] as number[]};
  const param = () => ({value: 0, setValueAtTime(v: number) { log.values.push(v); }, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}});
  const node = () => { log.nodes++; return {type: '', buffer: null, frequency: param(), gain: param(), Q: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), fftSize: 0,
    connect() {}, start() { log.starts++; }, stop() {}}; };
  const ctx = {currentTime: 0, sampleRate: 8000, state: 'running', destination: {}, resume: async () => {},
    createOscillator: node, createGain: node, createBiquadFilter: node, createBufferSource: node, createDynamicsCompressor: node, createAnalyser: node,
    createBuffer: (_c: number, n: number) => ({getChannelData: () => new Float32Array(n)})};
  return {ctx, log, make: () => { log.made++; return ctx as unknown as AudioContext; }};
}

test('every sound event maps to a sound with a recipe that starts voices', () => {
  const required = ['hitBlade', 'hitFist', 'hitGun', 'hitHeavy', 'critical', 'enemyDefeat', 'playerHurt', 'harvest', 'plant', 'energyGain', 'buy', 'sell',
    'levelUp', 'fishBite', 'fishCatch', 'uiTap', 'uiOpen', 'uiClose', 'questComplete', 'powerStrike', 'jump', 'land', 'swimStroke', 'swimSplash'];
  for (const e of required) assert.ok(e in SOUND_EVENTS, e);
  const src = readFileSync(new URL('../src/sfx.ts', import.meta.url), 'utf8');
  for (const s of ALL_SOUNDS) {
    assert.ok(src.includes(`case '${s}':`), `recipe for ${s}`);
    const {make, log, ctx} = fakeContext(); const sfx = new Sfx(make); sfx.random = () => .5;
    ctx.currentTime = 5; assert.equal(sfx.play(s), true, s); assert.ok(log.starts > 0, `${s} starts oscillators/noise`);
  }
  for (const s of Object.values(SOUND_EVENTS)) assert.ok(ALL_SOUNDS.includes(s), s);
});

test('rate limit: a burst of the same sound inside 100 ms plays at most its limit', () => {
  const g = new SoundGate(); let ok = 0;
  for (let i = 0; i < 20; i++) if (g.admit('hit', i * .02 * RATE_WINDOW, 1) === 'ok') ok++; // 20 hits over 40 ms
  assert.equal(ok, RATE.hit);
  assert.equal(g.admit('hit', 1, 1.1), 'ok', 'free again after the window');
  const {make, ctx} = fakeContext(); const sfx = new Sfx(make);
  for (let i = 0; i < 10; i++) { ctx.currentTime = 2 + i * .005; sfx.play('coin'); }
  assert.ok(sfx.stats.limited > 0 && sfx.stats.started <= (RATE.coin ?? 2));
});

test('voice cap: a big fight never stacks more than MAX_VOICES (priority cues get a little headroom)', () => {
  const g = new SoundGate(); const kinds: Sound[] = ['hit', 'crit', 'poof', 'swing', 'punch', 'shoot', 'zap', 'boom', 'pop', 'coin', 'land', 'jump', 'snap', 'splash', 'cast', 'shock', 'alert', 'magic', 'freeze', 'ready'];
  let started = 0; for (const k of kinds) if (g.admit(k, 0, 5) === 'ok') started++;
  assert.equal(started, MAX_VOICES); assert.equal(g.voices(0), MAX_VOICES);
  assert.equal(g.admit('level', 0, 5), 'ok', 'a level-up still sounds');
  assert.equal(g.voices(6), 0, 'voices end');
});

test('mute and zero volume make no sound and never build an AudioContext', () => {
  const {make, log} = fakeContext(); const sfx = new Sfx(make);
  sfx.enabled = false; assert.equal(sfx.play('hit'), false);
  sfx.enabled = true; sfx.volume = 0; assert.equal(sfx.play('level'), false);
  assert.equal(log.made, 0); assert.equal(log.starts, 0); assert.equal(sfx.stats.muted, 2);
  sfx.volume = .8; assert.equal(sfx.play('click'), true); assert.equal(log.made, 1);
});

test('hits take the weapon of the last attack sound; repeats vary in pitch', () => {
  const {make, ctx, log} = fakeContext(); const sfx = new Sfx(make);
  const count = (s: Sound, t: number) => { ctx.currentTime = t; const before = log.nodes; sfx.play(s); return log.nodes - before; };
  count('swing', 1); const blade = count('hit', 1.1);
  count('shoot', 3); const gun = count('hit', 3.1);
  const fist = count('hit', 9); // long after any attack: a plain fist smack
  assert.notEqual(blade, fist); assert.notEqual(gun, blade);
  const pitch = (r: number) => { sfx.random = () => r; log.values.length = 0; ctx.currentTime += 1; sfx.play('pop'); return log.values[0]; };
  assert.notEqual(pitch(.1), pitch(.9), 'random pitch spread');
});
