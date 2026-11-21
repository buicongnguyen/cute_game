// The low-health warning (AAA-PLAN WP12, src/features/low-health.ts): on below a quarter and off above 30%, never when
// knocked out, indoors or on Battery saver; a heartbeat every 0.8 s as an ordinary voice; a still edge on a phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AudioGraph, Voices, TOUCH_VOICES } from '../src/sfx.ts';
import { CreatureVoices, VOICES, VOICE_KINDS } from '../src/features/creature-voices.ts';
import { LowHealth, Heart, heartbeat, pulses, LOW_ON, LOW_OFF, BEAT, BEAT_LENGTH, POLL, HEART_BAND } from '../src/features/low-health.ts';
import { voiceSignatures } from '../promo/sound-signature.mjs';
import { fresh, near } from './support/fake-audio.ts';

// The sheet (one layer, opacity only, the heart on the bar) is held in tests/hud-ours.test.ts.
const read = (file: string) => readFileSync(new URL(`../promo/${file}`, import.meta.url), 'utf8');

test('on below 25%, off above 30%: between the two it stays as it was', () => {
  assert.equal(LOW_ON, .25); assert.equal(LOW_OFF, .3);
  const low = new LowHealth();
  assert.equal(low.step({ health: 1 }), false); assert.equal(low.step({ health: .26 }), false); assert.equal(low.step({ health: .25 }), false, 'exactly a quarter is not below it');
  assert.equal(low.step({ health: .249 }), true);
  for (const health of [.25, .27, .299, .3]) assert.equal(low.step({ health }), true, `${health}: still on`);
  assert.equal(low.step({ health: .301 }), false);
  for (const health of [.3, .28, .25]) assert.equal(low.step({ health }), false, `${health}: still off`);
  // A bar that trembles around a quarter (a hit, a tick of healing, a hit ...) switches once, not every time.
  let flips = 0, before = low.on;
  for (let i = 0; i < 200; i++) { const on = low.step({ health: .25 + (i % 2 ? .004 : -.004) }); if (on !== before) flips++; before = on; }
  assert.equal(flips, 1);
  // Healing in small steps: off only once the bar is past 30%.
  const heal = new LowHealth(); heal.step({ health: .1 }); let offAt = 0;
  for (let h = .1; h <= .5; h += .01) if (!heal.step({ health: h }) && !offAt) offAt = h;
  assert.ok(offAt > LOW_OFF && offAt < LOW_OFF + .011, `off at ${offAt.toFixed(3)}`);
});

test('off when knocked out, indoors and on Battery saver, and back on afterwards if the bar is still low', () => {
  const low = new LowHealth();
  assert.equal(low.step({ health: .1 }), true);
  assert.equal(low.step({ health: 0 }), false, 'knocked out'); assert.equal(low.step({ health: -1 }), false); assert.equal(low.step({ health: NaN }), false);
  assert.equal(low.step({ health: .1 }), true);
  assert.equal(low.step({ health: .1, indoors: true }), false, 'the cottage is safe'); assert.equal(low.step({ health: .27, indoors: false }), false, 'and it does not come back between the two marks');
  assert.equal(low.step({ health: .2 }), true);
  assert.equal(low.step({ health: .2, saver: true }), false, 'Battery saver'); assert.equal(low.step({ health: .05, saver: true }), false);
  assert.equal(low.step({ health: .2 }), true);
});

test('the edge pulses on a desktop only: never on a touch device, with reduced motion or with flashes off', () => {
  assert.equal(pulses(false, false, ''), true); assert.equal(pulses(false, false, 'on'), true);
  assert.equal(pulses(true, false, ''), false, 'a phone shows a still edge'); assert.equal(pulses(false, true, ''), false); assert.equal(pulses(false, false, 'off'), false);
});

test('the heartbeat: two soft thumps every 0.8 s on the audio clock, an ordinary voice that a full fight may drop', () => {
  assert.equal(BEAT, .8);
  const { ctx, make } = fresh(), graph = new AudioGraph(make), heart = new Heart(graph), starts = () => [...new Set(ctx.nodes.filter(n => n.kind === 'oscillator').flatMap(n => n.starts))].sort((a, b) => a - b);
  // Off: nothing is made, not even the context's bus.
  ctx.currentTime = 100; heart.tick(false); assert.equal(ctx.nodes.length, 0);
  // On for five seconds, looked at every POLL seconds.
  for (let t = 100; t < 105 - 1e-9; t += POLL) { ctx.currentTime = t; heart.tick(true); }
  const lubs = starts().filter((_, i) => i % 2 === 0), dubs = starts().filter((_, i) => i % 2 === 1);
  assert.ok(lubs.length >= 6 && lubs.length <= 7, `${lubs.length} beats in 5 s`); assert.equal(heart.stats.beats, lubs.length);
  assert.ok(near(lubs[0], 100.03, 1e-9), 'the first beat comes at once');
  for (let i = 1; i < lubs.length; i++) assert.ok(near(lubs[i] - lubs[i - 1], BEAT, 1e-9), 'exactly 0.8 s apart, whatever the timer does');
  for (let i = 0; i < dubs.length; i++) assert.ok(near(dubs[i] - lubs[i], .17, 1e-9), 'lub-dub');
  assert.ok(graph.voices.live(104.9) <= 1, 'one voice at a time');
  // Each thump is low: under 120 Hz, with a quieter part a phone speaker can play.
  const first = ctx.nodes.filter(n => n.kind === 'oscillator').slice(0, 4).map(n => n.frequency.events[0].value);
  assert.ok(Math.min(...first) < 120 && Math.max(...first) > 200 && Math.max(...first) < 400);
  // Off, then on again later: the beat starts afresh (no burst for the time in between).
  const made = ctx.nodes.length; ctx.currentTime = 105; heart.tick(false); ctx.currentTime = 130; heart.tick(true);
  assert.equal(ctx.nodes.filter(n => n.kind === 'oscillator').length - ctx.nodes.slice(0, made).filter(n => n.kind === 'oscillator').length, 4, 'one beat, not thirty');
  // A full fight on a phone: the beat is left out and the reserved voices stay free.
  const pool = graph.voices as Voices; pool.budget = TOUCH_VOICES + 2; pool.reserve = 2; ctx.currentTime = 200;
  for (let i = 0; i < TOUCH_VOICES; i++) pool.take(200, 260);
  const before = heart.stats.beats; for (let t = 200; t < 203; t += POLL) { ctx.currentTime = t; heart.tick(true); }
  assert.equal(heart.stats.beats, before); assert.ok(heart.stats.dropped >= 3); assert.equal(pool.take(202, 203, true), true);
  // Muted or asleep: nothing.
  const quiet = fresh(), silent = new AudioGraph(quiet.make), still = new Heart(silent); silent.sfx = 0; quiet.ctx.currentTime = 5; still.tick(true); assert.equal(quiet.ctx.nodes.length, 0);
  silent.sfx = .8; silent.hidden = true; still.tick(true); assert.equal(quiet.ctx.nodes.filter(n => n.kind === 'oscillator').length, 0);
  assert.ok(BEAT_LENGTH < BEAT / 2);
});

test('the heartbeat is the one that was measured: about -24 dBFS, far under a blow', () => {
  const kept = JSON.parse(read('loudness.json')) as { heartbeat: { peak: number; ms: number; band: string; recipe: string }; sounds: Record<string, { peak: number }> };
  const sig = voiceSignatures(AudioGraph, CreatureVoices, Object.keys(VOICES), VOICE_KINDS, heartbeat) as { heartbeat: string };
  assert.equal(sig.heartbeat, kept.heartbeat.recipe, 'the heartbeat changed since its level was measured: run promo/loudness.mjs --check --write');
  assert.deepEqual(HEART_BAND, [-26, -22]); assert.ok(kept.heartbeat.peak >= HEART_BAND[0] && kept.heartbeat.peak <= HEART_BAND[1], `${kept.heartbeat.peak} dBFS`);
  assert.ok(kept.sounds.hit.peak - kept.heartbeat.peak >= 12 && kept.sounds.hurt.peak - kept.heartbeat.peak >= 9);
  assert.ok(kept.heartbeat.ms < 320, 'both thumps inside a third of a second');
});
