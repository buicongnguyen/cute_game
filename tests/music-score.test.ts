// The live score (AAA-PLAN WP13, src/features-audio/music-score.ts): nothing is planned far ahead, the same seed gives the same
// notes, the measured levels sit beside the theme, phrases vary, and a touch device keeps to its six voices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Voices, TOUCH_VOICES } from '../src/sfx.ts';
import { MUSIC, type Tune } from '../src/features-audio/music-content.ts';
import { Score, Player, scoreBus, seeded, AHEAD, SCORE_VOICES, TOUCH_SCORE, FLOOR, ECHO, MAR, BASS, PAD, DRUM, HAT } from '../src/features-audio/music-score.ts';
import { signatures } from '../promo/music-clips.mjs';
import { FakeContext, type FakeNode } from './support/fake-audio.ts';

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const tunes = Object.entries(MUSIC).filter(([, tune]) => tune.progs) as [string, Tune][];
const ctxOf = () => new FakeContext();
const playerOf = (ctx: FakeContext, tune: Tune, lite = false, seed = 1) => new Player(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode, tune, seed, lite, new Float64Array(lite ? TOUCH_SCORE : SCORE_VOICES));
/** The sources (oscillators and noise) a fake context has started. */
const sources = (ctx: FakeContext) => ctx.nodes.filter(n => n.kind === 'oscillator' || n.kind === 'buffer');
/** Every note of `steps` eighth notes, as text. */
const written = (score: Score, steps: number, drums = false) => { let text = ''; for (let i = 0; i < steps; i++) { const n = score.next(drums); for (let k = 0; k < n; k++) { const note = score.notes[k]; text += `${note.kind}:${note.f.toFixed(3)}:${note.len.toFixed(3)}:${note.amp.toFixed(4)};`; } text += '|'; } return text; };

test('nothing is planned more than a quarter of a second ahead, and never in the past', () => {
  for (const [id, tune] of tunes) {
    const ctx = ctxOf(), player = playerOf(ctx, tune); let seen = 0, passes = 0;
    for (let i = 0; i < 600; i++) { // a minute, ten looks a second
      ctx.currentTime = i / 10; player.pass(ctx.currentTime, id === 'forest');
      const made = sources(ctx);
      if (made.length > seen) passes++;
      for (let k = seen; k < made.length; k++) {
        const at = made[k].starts[0];
        assert.ok(at <= ctx.currentTime + .25 + 1e-9, `${id}: a note at ${at} was planned at ${ctx.currentTime}`);
        assert.ok(at >= ctx.currentTime, `${id}: a note at ${at} was planned late, at ${ctx.currentTime}`);
        assert.ok(at <= ctx.currentTime + AHEAD + 1e-9, `${id}: AHEAD holds`);
      }
      seen = made.length;
    }
    // Notes are planned once per eighth note at most: 2.2 times a second at 66 beats a minute, 4.6 at 138 (a sparse tune skips some).
    const perSecond = passes / 60, eighths = tune.bpm! / 30;
    assert.ok(perSecond <= eighths + .1 && perSecond >= .5 && perSecond <= 5, `${id}: the score is planned ${perSecond.toFixed(1)} times a second`);
  }
});

test('a stall is not caught up: the score starts afresh from now, with no burst of late notes', () => {
  const ctx = ctxOf(), player = playerOf(ctx, MUSIC.boss);
  for (let i = 0; i < 30; i++) { ctx.currentTime = i / 10; player.pass(ctx.currentTime); }
  const before = sources(ctx).length, step = player.score.step;
  ctx.currentTime = 33; player.pass(33); // half a minute without a look: a sleeping tab, a faked clock that jumps
  const late = sources(ctx).slice(before);
  assert.equal(player.score.step, step + 1, 'one step is planned, not the 130 that were missed');
  assert.ok(late.length > 0 && late.length <= 32);
  for (const n of late) assert.ok(n.starts[0] >= 33 && n.starts[0] <= 33 + AHEAD, 'and it sounds from now on');
  // The same moment again (a stopped clock, a timer that fires twice): nothing more.
  const count = ctx.nodes.length; for (let i = 0; i < 50; i++) player.pass(33);
  assert.equal(ctx.nodes.length, count);
});

test('the same tune and seed give the same notes; another seed gives another melody', () => {
  for (const [id, tune] of tunes) {
    assert.equal(written(new Score(tune, 7), 512), written(new Score(tune, 7), 512), `${id}: seed 7 twice`);
    assert.notEqual(written(new Score(tune, 7), 512), written(new Score(tune, 8), 512), `${id}: seed 8 differs`);
  }
  // The notes come from the seed alone: with Math.random taken away they are the same.
  const random = Math.random; Math.random = () => { throw new Error('the score may not use Math.random'); };
  try { assert.equal(written(new Score(MUSIC.village, 7), 512), written(new Score(MUSIC.village, 7), 512)); } finally { Math.random = random; }
});

test('the notes are in key: every pitch belongs to the tune\'s scale, and the bass stays low', () => {
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  for (const [id, tune] of tunes) {
    const scale = new Set(MAJOR.map((_, i) => (MAJOR[(i + tune.mode!) % 7] - MAJOR[tune.mode!] + 12) % 12)), score = new Score(tune, 3);
    for (let i = 0; i < 640; i++) {
      const n = score.next();
      for (let k = 0; k < n; k++) {
        const note = score.notes[k]; if (note.kind === DRUM || note.kind === HAT) continue;
        const midi = 69 + 12 * Math.log2(note.f / 440), step = ((Math.round(midi) - tune.key!) % 12 + 12) % 12;
        assert.ok(Math.abs(midi - Math.round(midi)) < 1e-6 && scale.has(step), `${id}: ${midi.toFixed(2)} is not in the scale`);
        if (note.kind === BASS) assert.ok(midi < tune.key! + 20 && midi > 30, `${id}: bass at ${midi}`);
        if (note.kind === MAR) assert.ok(midi <= 96, `${id}: a marimba note at ${midi} is too high to be pleasant`);
        assert.ok(note.amp > 0 && note.amp <= .3 && note.len > 0 && note.len < 5);
      }
    }
  }
});

test('no 8-bar phrase more than twice in a row, and at least 3 progressions per tune in 3 minutes', () => {
  for (const [id, tune] of tunes) for (const seed of [1, 2, 3, 99]) {
    assert.ok(tune.progs!.length >= 3, `${id} has at least 3 progressions`);
    for (const prog of tune.progs!) assert.match(prog, /^[1-7]{8}$/, `${id}: a progression is 8 bars of degrees`);
    const score = new Score(tune, seed), phrases = Math.floor(180 / (32 * score.beat)), ids: number[] = [], texts: string[] = [];
    for (let p = 0; p < phrases; p++) { texts.push(written(score, 64)); ids.push(score.id); }
    let run = 1; for (let p = 1; p < ids.length; p++) { run = ids[p] === ids[p - 1] ? run + 1 : 1; assert.ok(run <= 2, `${id} seed ${seed}: progression ${ids[p]} three times running`); }
    assert.ok(new Set(ids).size >= 3, `${id} seed ${seed}: ${new Set(ids).size} progressions in 3 minutes`);
    // And no phrase is note for note the one before: the melody is drawn anew.
    for (let p = 1; p < texts.length; p++) assert.notEqual(texts[p], texts[p - 1], `${id} seed ${seed}: phrase ${p} repeats the one before`);
  }
});

test('the measured levels: every tune within 2 LU of the theme, peaks at or below -1 dBFS, measured on the tune as it is now', async () => {
  const kept = JSON.parse(read('promo/music-levels.json')) as { theme: { lufs: number; peak: number }; tunes: Record<string, { lufs: number; peak: number; rms: number; tune: string }>; mix: { duck: { depth: number }; brawlTop: number } };
  const now = await signatures() as Record<string, string>;
  assert.deepEqual(Object.keys(kept.tunes).sort(), tunes.map(([id]) => id).sort(), 'every tune was measured and none is left over');
  for (const [id] of tunes) {
    const m = kept.tunes[id];
    assert.equal(m.tune, now[id], `${id} changed since its level was measured: run promo/music-clips.mjs --check --write (docs/SOUNDS.md, "The music")`);
    assert.ok(Math.abs(m.lufs - kept.theme.lufs) <= 2, `${id}: ${m.lufs} LKFS is more than 2 LU from the theme (${kept.theme.lufs})`);
    assert.ok(m.peak <= -1, `${id} peaks at ${m.peak} dBFS`);
  }
  // The music is under the blows and the cues, a stinger's duck takes it down 6 dB, and a crowded fight over it does not clip.
  const sounds = (JSON.parse(read('promo/loudness.json')) as { sounds: Record<string, { peak: number }> }).sounds, loudest = Math.max(...Object.values(kept.tunes).map(t => t.rms));
  for (const cue of ['hit', 'hitHeavy', 'punch', 'hurt', 'victory', 'rewardSmall', 'level', 'powerReady']) assert.ok(sounds[cue].peak > loudest + 3, `${cue} (${sounds[cue].peak}) stands over the music (${loudest} RMS)`);
  assert.ok(Math.abs(kept.mix.duck.depth + 6) <= .5, `the duck is ${kept.mix.duck.depth} dB`);
  assert.ok(kept.mix.brawlTop < 0, 'no clipping with both sliders at the top');
});

test('the touch budget: at most 6 score voices at once, no pad, one oscillator a note', () => {
  for (const [id, tune] of tunes) {
    const ctx = ctxOf(), player = playerOf(ctx, tune, true);
    for (let i = 0; i < 900; i++) { ctx.currentTime = i / 10; player.pass(ctx.currentTime, true); }
    const made = sources(ctx);
    assert.ok(made.every(n => !n.wave), `${id}: no pad on a touch device`);
    // Each note is one source there, so the sources that sound at a moment are the voices.
    for (const n of made) { const at = n.starts[0]; let live = 0; for (const m of made) if (m.starts[0] <= at && m.stops[0] - .03 - 1e-6 > at) live++; assert.ok(live <= TOUCH_SCORE, `${id}: ${live} voices at ${at.toFixed(2)}`); }
    assert.equal(ctx.nodes.filter(n => n.kind === 'gain').length, made.length + 2, `${id}: one envelope a note (and the player's two gains)`);
  }
  assert.equal(TOUCH_SCORE, 6); assert.equal(seeded(5)(), seeded(5)()); assert.notEqual(seeded(5)(), seeded(6)());
  // A desktop plays the pad and the mallet's partial, inside its own count.
  const ctx = ctxOf(), player = playerOf(ctx, MUSIC.village);
  for (let i = 0; i < 300; i++) { ctx.currentTime = i / 10; player.pass(ctx.currentTime); }
  assert.ok(sources(ctx).some(n => n.wave), 'the pad plays on a desktop');
});

test('the score never takes a voice from the effects; on a touch device it makes room for them, down to a floor of two voices', () => {
  assert.equal(FLOOR, 2);
  const run = (busy: number) => {
    const ctx = ctxOf(), player = playerOf(ctx, MUSIC.boss, true), effects = new Voices(TOUCH_VOICES + 2, 2);
    for (let i = 0; i < 300; i++) {
      ctx.currentTime = i / 10;
      while (effects.live(ctx.currentTime) < busy) assert.ok(effects.take(ctx.currentTime, ctx.currentTime + .3)); // a fight keeps `busy` effect voices sounding
      player.pass(ctx.currentTime, false, effects);
    }
    const made = sources(ctx); let most = 0;
    for (const n of made) { const at = n.starts[0]; let live = 0; for (const m of made) if (m.starts[0] <= at && m.stops[0] - .03 - 1e-6 > at) live++; most = Math.max(most, live); }
    const drums = made.filter(n => (n.to[0] as FakeNode).to[0] === player.drums || ((n.to[0] as FakeNode).to[0] as FakeNode).kind === 'filter').length;
    return { most, notes: made.length, drums, capped: effects.capped };
  };
  const free = run(0), fight = run(4), full = run(8);
  assert.ok(free.most <= 6 && free.most > 2); assert.ok(fight.most <= 2, `with 4 effect voices the score keeps to 2 (it had ${fight.most})`);
  assert.ok(fight.notes > 0 && fight.notes < free.notes, 'it thins out, it does not stop');
  // The fullest fight a phone plays (all 8 ordinary voices): two voices are still the score's, and they are the beat and the bass.
  assert.equal(full.most, 2); assert.ok(full.drums >= free.drums * .6, `the boss beat stays (${full.drums} of ${free.drums} strokes)`);
  for (const r of [free, fight, full]) assert.equal(r.capped, 0, 'no effect was ever refused for the music');
  const score = new Score(MUSIC.boss, 1, true); score.next();
  assert.ok(score.notes[0].kind === DRUM && [DRUM, HAT, BASS].includes(score.notes[1].kind), 'they are written first');
});

test('the instruments: every envelope starts at 0, ends before its source stops, and the echoes are the theme\'s', () => {
  const ctx = ctxOf(), bus = scoreBus(ctx as unknown as BaseAudioContext, ctx.destination as unknown as AudioNode) as unknown as FakeNode;
  const delays = ctx.nodes.filter(n => n.kind === 'delay');
  assert.deepEqual(delays.map(d => d.delayTime.value), ECHO.map(e => e[0]));
  assert.equal(bus.to.length, 1 + ECHO.length);
  const player = new Player(ctx as unknown as BaseAudioContext, bus as unknown as AudioNode, MUSIC.village, 1, false, new Float64Array(SCORE_VOICES));
  for (let i = 0; i < 100; i++) { ctx.currentTime = i / 10; player.pass(ctx.currentTime, true); }
  const kinds = new Set<number>(); const probe = new Score(MUSIC.village, 1); for (let i = 0; i < 80; i++) { const n = probe.next(true); for (let k = 0; k < n; k++) kinds.add(probe.notes[k].kind); }
  assert.deepEqual([...kinds].sort(), [MAR, BASS, PAD, DRUM, HAT], 'marimba, bass, pad and the two drums all play');
  for (const src of sources(ctx)) {
    assert.equal(src.starts.length, 1); assert.equal(src.stops.length, 1); assert.ok(src.stops[0] > src.starts[0]);
    const env = src.to[0] as FakeNode; assert.equal(env.kind, 'gain');
    assert.equal(env.gain.at(src.starts[0] - .001), 0, 'silent until its source starts');
    assert.ok(env.gain.at(src.stops[0]) < .004, `the envelope is closed when the source stops (${env.gain.at(src.stops[0])})`);
  }
  // Everything the player sounds goes through its one gain: the drums through their own first.
  const out = player.out as unknown as FakeNode, drums = player.drums as unknown as FakeNode;
  assert.deepEqual(drums.to, [out]); assert.deepEqual(out.to, [bus]);
});
