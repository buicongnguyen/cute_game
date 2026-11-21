// The mix and the stingers (AAA-PLAN WP8): the measured levels keep the LOUDNESS table, each stinger is its own recipe,
// the level fanfare is left to the level-up, and a stinger lowers the music 6 dB for its length.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as T from 'three';
import { Sfx, Voices, ALL_SOUNDS, STINGERS, LATE_SOUNDS, LOUDNESS, TOUCH_VOICES, type Sound, type Stinger } from '../src/sfx.ts';
import { installMix } from '../src/features-audio/sound-mix.ts';
import { installStingers, mount as mountStingers, STINGER, STINGER_DUCK, STINGER_GAP, LEVEL_LENGTH } from '../src/features-audio/stingers.ts';
import { MAX_VOICES } from '../src/sfx.ts';
import { skillSound } from '../src/skill-sounds.ts';
import { ShipSequence } from '../src/ship-sequence.ts';
import { signatures } from '../promo/sound-signature.mjs';
import { fresh, node, type FakeNode } from './support/fake-audio.ts';

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
interface Kept { sounds: Record<string, { peak: number; low: number; high: number; recipe: string }>; hits: Record<string, { weapon: string; whoosh: number; hit: number; under: number }>; brawl: { peak: number } | null }
const kept = JSON.parse(read('promo/loudness.json')) as Kept;
const everySound: Sound[] = [...ALL_SOUNDS, ...LATE_SOUNDS];
const recipes = signatures(Sfx, everySound, installStingers) as Record<Sound, string>;
const peak = (sound: string) => { assert.ok(kept.sounds[sound], `${sound} is in promo/loudness.json`); return kept.sounds[sound].peak; };

test('every recipe is the one that was measured: promo/loudness.json is the mix as it is now', () => {
  for (const sound of everySound) assert.equal(recipes[sound], kept.sounds[sound]?.recipe,
    `${sound} changed since its level was measured: run promo/loudness.mjs --check --write (docs/SOUNDS.md, "The mix")`);
  assert.deepEqual(Object.keys(kept.sounds).sort(), [...everySound].sort(), 'no sound is missing from the measurement and none is left over');
});

test('the measured peaks keep the LOUDNESS table: impacts on top, each whoosh 6 to 10 dB under its hit, taps under everything in play, cues never under -24', () => {
  const inside = (value: number, [lo, hi]: readonly number[], what: string) => assert.ok(value >= lo - .05 && value <= hi + .05, `${what}: ${value} is outside ${lo} to ${hi}`);
  for (const kind of ['impact', 'ui', 'cue'] as const) for (const sound of LOUDNESS[kind].sounds) inside(peak(sound), LOUDNESS[kind].peak, `${kind} ${sound}`);
  // A blade's and a shot's hit are impacts too (the plain 'hit' above is a fist's).
  for (const pair of Object.values(kept.hits)) inside(pair.hit, LOUDNESS.impact.peak, `the ${pair.weapon} hit`);
  for (const [whoosh, hit] of Object.entries(LOUDNESS.whoosh.of)) {
    assert.equal(hit, 'hit'); inside(kept.hits[whoosh].under, LOUDNESS.whoosh.under, `${whoosh} under its hit`);
    assert.ok(kept.hits[whoosh].whoosh < kept.hits[whoosh].hit, `${whoosh} is quieter than the blow it leads to`);
  }
  for (const sound of LOUDNESS.whoosh.sounds) assert.ok(peak(sound) >= LOUDNESS.whoosh.floor, `${sound} is ${peak(sound)}: a swing must be heard`);
  // The order between the kinds, whatever the bands are moved to later.
  const of = (kind: 'impact' | 'ui' | 'cue' | 'whoosh') => LOUDNESS[kind].sounds.map(peak);
  assert.ok(Math.max(...of('ui')) < Math.min(...of('impact')), 'every tap is under every impact');
  assert.ok(Math.max(...of('whoosh')) < Math.min(...of('impact')), 'every whoosh is under every impact');
  assert.ok(Math.max(...of('cue')) <= Math.max(...of('impact')), 'no cue is louder than the loudest impact');
  for (const stinger of STINGERS) assert.ok(LOUDNESS.cue.sounds.includes(stinger) && peak(stinger) >= -24, `${stinger} is a cue`);
  // The level fanfare and the win stand over the small rewards; a refusal is the quietest stinger.
  assert.ok(peak('victory') > peak('rewardMedium') && peak('rewardLarge') > peak('rewardMedium') && peak('rewardMedium') > peak('rewardSmall'));
  assert.equal(Math.min(...STINGERS.map(peak)), peak('deny'));
  assert.ok(kept.brawl && kept.brawl.peak < 0, 'a crowded fight at full sliders does not clip');
});

test('punch and cast are about 15 dB up; POWER READY about 12 dB, and the chime of a skill off its cooldown about 5 dB', () => {
  // The sum of the envelope peaks each recipe schedules, against what it scheduled before WP8.
  const asked = (sound: Sound) => Number(recipes[sound].split(':')[1]), dB = (now: number, before: number) => 20 * Math.log10(now / before);
  const up = { punch: dB(asked('punch'), .17), cast: dB(asked('cast'), .06), powerReady: dB(asked('powerReady'), .035 + .025), ready: dB(asked('ready'), .035 + .025) };
  assert.ok(up.punch > 12 && up.punch < 17, `punch +${up.punch.toFixed(1)} dB`);
  assert.ok(up.cast > 12 && up.cast < 17, `cast +${up.cast.toFixed(1)} dB`);
  assert.ok(up.powerReady > 10 && up.powerReady < 14, `POWER READY +${up.powerReady.toFixed(1)} dB`);
  // 'ready' sounds every few seconds in a fight: a small raise, and clearly under the power strike's own chime.
  assert.ok(up.ready > 3 && up.ready < 8, `ready +${up.ready.toFixed(1)} dB`);
  assert.ok(peak('ready') >= -24 && peak('ready') <= -18, `ready peaks at ${peak('ready')}`);
  assert.ok(peak('powerReady') - peak('ready') > 4, 'POWER READY stands over it');
  assert.equal(recipes.powerReady.split(':')[0], recipes.ready.split(':')[0], 'the same chime'); assert.equal(recipes.powerReady.split(':')[2], recipes.ready.split(':')[2]);
});

test('levelUp, rewardLarge, victory and equip are four different recipes, and so is every other stinger', () => {
  const four = ['levelUp', 'rewardLarge', 'victory', 'equip'] as const;
  assert.equal(new Set(four.map(s => recipes[s])).size, 4);
  assert.equal(new Set(STINGERS.map(s => recipes[s])).size, STINGERS.length, 'nine stingers, nine recipes');
  assert.equal(recipes.levelUp, recipes.level, 'levelUp is the level fanfare');
  assert.equal(signatures(Sfx, ['levelUp']).levelUp, recipes.level, 'also before the features are mounted');
  // None of them borrows a sound that was there before (the fanfare aside).
  const old = new Set(ALL_SOUNDS.map(s => recipes[s]));
  for (const s of STINGERS) if (s !== 'levelUp') assert.ok(!old.has(recipes[s]), `${s} is a new sound`);
  assert.deepEqual(Object.keys(STINGER).sort(), [...STINGERS.filter(s => s !== 'levelUp'), 'flag', 'powerReady', 'roar', 'petHit'].sort()); // the last two: tests/creature-voices.test.ts
  // Before the features bring the recipes, a stinger still sounds: the success chime.
  const { ctx, make } = fresh(), sfx = new Sfx(make); sfx.random = () => .5; ctx.currentTime = 2;
  assert.equal(sfx.play('victory'), true); assert.ok(ctx.nodes.some(n => n.started > 0));
  const early = signatures(Sfx, ['victory', 'flag', 'powerReady']); assert.equal(early.victory, recipes.success); assert.equal(early.flag, recipes.success); assert.equal(early.powerReady, recipes.success);
});

/**
 * Where the level fanfare used to play without a level-up (30 places), as the stingers each file plays at least (later
 * packages add their own calls). A scan of the whole source: the modes cannot be loaded here (stylesheets, the page),
 * and the plan's check is a search of the source.
 */
const STINGER_SITES: Record<string, Partial<Record<Stinger, number>>> = {
  // the Lake Guardian, a boss and a freed friend; a rare drop, a gift, a forge that worked; new gear; a star shard, more storage; a new planet
  'main.ts': { victory: 3, rewardMedium: 3, equip: 1, rewardSmall: 2, discover: 1 },
  'ship-sequence.ts': { discover: 1 }, // the starship has landed
  'colossus.ts': { go: 1, victory: 1 }, // it wakes; it crumbles
  'ctf.ts': { discover: 1, go: 1, rewardSmall: 2, rewardMedium: 1, victory: 1 }, // the isle; "Go!"; our side takes a flag, a draw; our side scores; the match is won
  'dungeon.ts': { go: 2, rewardLarge: 1 }, // the party sets out, the guardian awakens; a pet joins
  'rescue.ts': { go: 2, rewardMedium: 1, rewardSmall: 1 }, // the mission and each wave; a ladder step; a tower upgrade
  'upgrade-bench.ts': { rewardMedium: 3, rewardLarge: 1 }, // gear, forge, skill; a jump learned
  'house-life.ts': { rewardSmall: 1 }, // a nap in the bed
};

test('the level fanfare plays only on a level-up: each of the 30 former sites has its own stinger', () => {
  // Every call of tone(...) or sound(...) in src/, with the quoted names inside it (a ternary has two).
  const found: Record<string, Partial<Record<string, number>>> = {}, fanfare: string[] = [];
  for (const entry of readdirSync(new URL('../src/', import.meta.url), { recursive: true, encoding: 'utf8' })) {
    if (!entry.endsWith('.ts')) continue;
    const file = entry.replaceAll('\\', '/');
    read(`src/${entry}`).split('\n').forEach((line, i) => {
      for (const call of line.matchAll(/\b(?:tone|sound|play)\(([^)]*)\)/g)) for (const name of call[1].matchAll(/'(\w+)'/g)) {
        if (name[1] === 'level') fanfare.push(`${file}:${i + 1}`);
        else if ((STINGERS as readonly string[]).includes(name[1])) (found[file] ??= {})[name[1]] = (found[file][name[1]] ?? 0) + 1;
      }
    });
  }
  for (const [file, counts] of Object.entries(STINGER_SITES)) for (const [stinger, least] of Object.entries(counts)) assert.ok((found[file]?.[stinger] ?? 0) >= least, `${file} plays ${stinger} ${found[file]?.[stinger] ?? 0} times, at least ${least} expected`);
  // The plan's search, tone(...'level'...) with the ternaries and sound('level'): the level check in main.ts, and the
  // levelUp stinger, which is that fanfare.
  fanfare.sort(); assert.equal(fanfare.length, 2, fanfare.join(' '));
  assert.match(fanfare[0], /^features-audio\/stingers\.ts:\d+$/); assert.match(fanfare[1], /^main\.ts:\d+$/);
  const main = read('src/main.ts').split('\n'), at = Number(fanfare[1].split(':')[1]) - 1;
  assert.ok(main.slice(at - 8, at + 1).some(line => line.startsWith('function levelCheck(')), 'the one use left in the game is in levelCheck');
  // A freed friend: main.ts plays the win itself, so it sounds whether or not the features are mounted.
  assert.ok(main.find(line => line.includes('rescued(id,at){'))!.includes("tone('victory')"));
  // No skill borrows the fanfare either: the two uniforms have combat sounds.
  for (const id of ['dz_navy', 'dz_aodai_man', 'dz_army', 'dz_aodai', 'dz_usa', 'dz_vietnam', 'dz_superhero', 'dz_ninja']) for (let i = 0; i < 4; i++) assert.notEqual(skillSound(i, id), 'level', `${id} ${i}`);
  assert.equal(skillSound(3, 'dz_navy'), 'zap'); assert.equal(skillSound(3, 'dz_aodai_man'), 'boom');
});

test('a fake host hears the named stinger: the starship lifts off with a boom and lands with discover', () => {
  const heard: Sound[] = [], ship = new T.Object3D();
  const world = { launchRocket: () => ({ ship, flame: null, x: 0, z: 0, rest: 0 }), position: new T.Vector3(), cameraTarget: new T.Vector3(), cameraFocus: null, boarded: false, fx: undefined };
  const sequence = new ShipSequence(world as never, sound => heard.push(sound));
  let done = 0; const run = () => { for (let i = 0; i < 400 && sequence.busy; i++) sequence.update(.05, i * .05); };
  sequence.launch(() => done++); run();
  assert.equal(done, 1); assert.deepEqual(heard, ['pop', 'alert', 'boom', 'cast'], 'the lift-off is a boom');
  heard.length = 0; sequence.land(() => done++); run();
  assert.equal(done, 2); assert.deepEqual(heard, ['discover']);

  // The feature only gives the graph its stingers: it listens to no event, so nothing is lost before it mounts.
  const { make } = fresh(), sfx = new Sfx(make); let listened = 0;
  mountStingers({ audio: sfx.graph, on: () => { listened++; return () => {}; } } as never);
  assert.equal(typeof sfx.graph.cue, 'function'); assert.equal(listened, 0);
});

test('a stinger lowers the music bus 6 dB for its length and lets it come back; other sounds leave the music alone', async () => {
  const duckOf = (sfx: Sfx, bus: 'music' | 'sfx') => node(sfx.graph.bus(bus)).to[0] as FakeNode, dB = (v: number) => 20 * Math.log10(v);
  for (const stinger of [...STINGERS, 'flag'] as (Stinger | 'flag')[]) {
    const { ctx, make } = fresh(), sfx = new Sfx(make); sfx.random = () => .5; sfx.graph.music = 1; installMix(sfx.graph); installStingers(sfx.graph);
    const music = duckOf(sfx, 'music'), effects = duckOf(sfx, 'sfx'), length = stinger === 'levelUp' ? LEVEL_LENGTH : STINGER[stinger].length;
    ctx.currentTime = 10; assert.equal(music.gain.at(10), 1);
    assert.equal(sfx.play('hit'), true); assert.equal(music.gain.at(10.5), 1, 'a blow does not lower the music');
    ctx.currentTime = 12; assert.equal(sfx.play(stinger), true, stinger); await Promise.resolve();
    assert.ok(Math.abs(dB(music.gain.at(12.1)) + STINGER_DUCK) < .1, `${stinger}: the music is ${STINGER_DUCK} dB down within 0.1 s`);
    assert.ok(Math.abs(dB(music.gain.at(12 + length)) + STINGER_DUCK) < .1, `${stinger}: it stays down for the stinger's ${length} s`);
    assert.ok(dB(music.gain.at(12 + length + .6)) > -.1, `${stinger}: and is back 0.6 s after`);
    assert.equal(music.gain.steps, 0, 'the gain only glides'); assert.equal(effects.gain.at(12.1), 1, 'the effects bus is not lowered');
    // It plays on the effects bus, as one voice.
    assert.ok(ctx.nodes.some(n => n.started > 0 && n.kind === 'oscillator'));
    assert.equal(sfx.stats.byKind[stinger === 'levelUp' ? 'level' : stinger], 1);
  }
  assert.equal(STINGER_DUCK, 6);
  // POWER READY is a cue, not a tune: the music stays. A fanfare the player's own gate refuses lowers nothing either.
  const { ctx, make } = fresh(), sfx = new Sfx(make); sfx.random = () => .5; sfx.graph.music = 1; installMix(sfx.graph); installStingers(sfx.graph);
  ctx.currentTime = 3; assert.equal(sfx.play('powerReady'), true); await Promise.resolve(); assert.equal(duckOf(sfx, 'music').gain.at(3.1), 1);
  for (let i = 0; i < MAX_VOICES + 4; i++) sfx.graph.voices.take(3, 9, true);
  assert.equal(sfx.play('level'), false, 'no voice left, even for a priority cue'); await Promise.resolve(); assert.equal(duckOf(sfx, 'music').gain.at(3.1), 1, 'a fanfare that did not start lowers nothing');
});

test('the fanfare and a big stinger never sound together: whichever comes second waits for the first to end', () => {
  const setup = () => {
    const { ctx, make } = fresh(), sfx = new Sfx(make), held: { run: () => void; seconds: number }[] = []; sfx.random = () => .5;
    installMix(sfx.graph); installStingers(sfx.graph, (run, seconds) => held.push({ run, seconds }));
    return { ctx, sfx, held, count: (s: Sound) => sfx.stats.byKind[s] ?? 0 };
  };
  // A boss falls and the kill is a level-up: the fanfare first (levelCheck), the win after it.
  for (const stinger of ['victory', 'rewardLarge', 'rewardMedium', 'equip'] as const) {
    const { ctx, sfx, held, count } = setup(); ctx.currentTime = 20;
    assert.equal(sfx.play('level'), true); assert.equal(sfx.play(stinger), true, 'held, not dropped');
    assert.equal(count(stinger), 0); assert.equal(held.length, 1); assert.ok(Math.abs(held[0].seconds - LEVEL_LENGTH) < 1e-9, `${stinger} waits for the fanfare's end`);
    assert.equal(sfx.graph.voices.live(20), 1, 'a waiting stinger holds no voice: a hurt cry still finds one');
    ctx.currentTime = 20 + held[0].seconds; held[0].run(); assert.equal(count(stinger), 1); assert.equal(held.length, 1, 'it plays when its turn comes');
    // Long after the fanfare nothing waits.
    ctx.currentTime = 30; assert.equal(sfx.play(stinger), true); assert.equal(count(stinger), 2); assert.equal(held.length, 1);
  }
  // The other order: the win is playing when the level-up comes.
  {
    const { ctx, sfx, held, count } = setup(); ctx.currentTime = 20;
    assert.equal(sfx.play('victory'), true); ctx.currentTime = 20.3; assert.equal(sfx.play('level'), true, 'held, not dropped');
    assert.equal(count('level'), 0); assert.equal(held.length, 1); assert.ok(Math.abs(held[0].seconds - (STINGER.victory.length - .3)) < 1e-9);
    // A small reward asked for meanwhile queues behind the fanfare that is still to come.
    assert.equal(sfx.play('rewardSmall'), true); assert.equal(count('rewardSmall'), 0); assert.equal(held.length, 2);
    assert.ok(Math.abs(held[1].seconds - (STINGER.victory.length - .3 + LEVEL_LENGTH)) < 1e-9);
    ctx.currentTime = 20 + STINGER.victory.length; held[0].run(); assert.equal(count('level'), 1);
    ctx.currentTime += LEVEL_LENGTH; held[1].run(); assert.equal(count('rewardSmall'), 1);
  }
  // A small stinger does not make the fanfare wait, and POWER READY never waits for anything.
  {
    const { ctx, sfx, held, count } = setup(); ctx.currentTime = 20;
    assert.equal(sfx.play('rewardSmall'), true); assert.equal(sfx.play('level'), true); assert.equal(count('level'), 1); assert.equal(held.length, 0);
    assert.equal(sfx.play('powerReady'), true); assert.equal(count('powerReady'), 1); assert.equal(held.length, 0);
    // levelUp is the fanfare: it waits and plays like it.
    ctx.currentTime = 40; assert.equal(sfx.play('discover'), true); assert.equal(sfx.play('levelUp'), true); assert.equal(count('level'), 1); assert.equal(held.length, 1);
  }
});

test('only the big stingers are priority cues: a win sounds over a full fight on a phone, a small reward is dropped like any sound', () => {
  assert.deepEqual(Object.entries(STINGER).filter(([, s]) => s.priority).map(([name]) => name).sort(), ['discover', 'flag', 'go', 'rewardLarge', 'roar', 'victory']); // the Colossus's roar took the hurt cry's place, a priority cue
  const { ctx, make } = fresh(), sfx = new Sfx(make); sfx.random = () => .5; installMix(sfx.graph); installStingers(sfx.graph);
  const voices = sfx.graph.voices as Voices; voices.budget = TOUCH_VOICES + 2; voices.reserve = 2; ctx.currentTime = 4;
  for (let i = 0; i < TOUCH_VOICES; i++) assert.equal(voices.take(4, 9), true);
  assert.equal(sfx.play('boom'), false, 'the ordinary voices are used up'); assert.equal(sfx.stats.capped, 1);
  for (const small of ['rewardSmall', 'rewardMedium', 'equip', 'deny', 'powerReady'] as const) assert.equal(sfx.play(small), false, `${small} is an ordinary voice`);
  assert.equal(sfx.stats.capped, 6);
  assert.equal(sfx.play('victory'), true, 'a big stinger takes a reserved voice');
  assert.equal(sfx.play('victory'), false, 'the same stinger at once is one stinger'); assert.equal(sfx.stats.limited, 1);
  ctx.currentTime = 4 + STINGER_GAP + .01; assert.equal(sfx.play('go'), true);
  assert.equal(sfx.play('discover'), false, 'both reserved voices are taken'); assert.equal(sfx.stats.capped, 7); assert.equal(voices.capped, 7);
  assert.deepEqual(sfx.stats.byKind, { victory: 1, go: 1 });
  // Muted or asleep, a stinger is skipped like any sound and lowers nothing.
  sfx.volume = 0; assert.equal(sfx.play('victory'), false); assert.equal(sfx.stats.muted, 1);
});
