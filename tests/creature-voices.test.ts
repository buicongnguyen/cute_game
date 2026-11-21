// Creature voices (AAA-PLAN WP12, src/features/creature-voices.ts): a voice per family that falls with size, the wind-up
// that peaks at the blow, the pauses and caps that keep a crowd quiet, placing by screen and distance, the softer hit of
// a pet, the Colossus's own roar, and the measured levels of promo/loudness.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Sfx, AudioGraph, Voices, TOUCH_VOICES, MAX_VOICES, type Sound } from '../src/sfx.ts';
import { ENEMY_TYPES } from '../src/enemy-types.ts';
import { BOSS_WINDUPS } from '../src/boss-patterns.ts';
import { createEvents } from '../src/game-services.ts';
import { installMix } from '../src/features/sound-mix.ts';
import { installStingers, STINGER } from '../src/features/stingers.ts';
import { CreatureVoices, listen, blow, VOICES, VOICE_KINDS, DEFAULT_VOICE, pitchOf, panOf, fadeOf, windupRise, PAN_MAX, HEAR, FULL, HURT_GAP, GAP, FAMILY_GAP, LIVE, LIVE_TOUCH, PER_SECOND, PER_SECOND_TOUCH, WINDUP_MAX, WINDUP_NEAR, WATCH, SIZE_REF,
  VOICE_BANDS, WARNING_BAND, PET_UNDER, type VoiceKind } from '../src/features/creature-voices.ts';
import { heartbeat } from '../src/features/low-health.ts';
import { signatures, voiceSignatures } from '../promo/sound-signature.mjs';
import { fresh, node, near, type FakeNode } from './support/fake-audio.ts';
import type { Enemy } from '../src/world.ts';

// The places in main.ts, world.ts and colossus.ts that these sounds hang on are held in tests/game-events-main.test.mjs.
const read = (file: string) => readFileSync(new URL(`../promo/${file}`, import.meta.url), 'utf8');
interface Level { peak: number; low: number; high: number; loudness: number; ms: number; band: string; centroid: number; recipe: string }
interface Kept {
  sounds: Record<string, { peak: number; recipe: string }>; music: { rms: number } | null; brawlVoices: { peak: number } | null;
  voices: Record<string, Record<VoiceKind | 'warning', Level>>; heartbeat: Level; pet: { peak: number; hit: number; under: number };
  leads: Record<string, { seconds: number; rise: number; starts: number; overMusic: number; peakAt: number; peak: number }>;
}
const kept = JSON.parse(read('loudness.json')) as Kept;

/** A graph on the recording context, with the mix (the panner) and voices that draw the middle of every range. */
function setup(options: { touch?: boolean } = {}) {
  const { ctx, make } = fresh(), graph = new AudioGraph(make); installMix(graph);
  const voices = new CreatureVoices(graph, { touch: options.touch, random: () => .5 });
  const oscillators = () => ctx.nodes.filter(n => n.kind === 'oscillator' && n.started > 0);
  return { ctx, graph, voices, oscillators };
}
const creature = (type: string, more: Partial<Enemy> = {}) => ({ id: type, type, definition: ENEMY_TYPES[type], radius: ENEMY_TYPES[type].radius, boss: ENEMY_TYPES[type].boss, hp: 50, maxHp: 100, x: 0, z: 0, phase: 'chase', ...more }) as unknown as Enemy;

test('every family of enemy-types.ts has a voice of its own, and each kind of it is another sound', () => {
  const families = [...new Set(Object.values(ENEMY_TYPES).map(d => d.family))].sort();
  assert.ok(families.length >= 20);
  for (const family of families) assert.ok(VOICES[family], `${family} has a voice`);
  assert.deepEqual(Object.keys(VOICES).sort(), families, 'and no voice is left without a creature');
  assert.ok(VOICES[DEFAULT_VOICE], 'a family added later squeaks until it gets its own');
  const sig = voiceSignatures(AudioGraph, CreatureVoices, Object.keys(VOICES), VOICE_KINDS, heartbeat) as Record<string, Record<string, string>>;
  const all = Object.keys(VOICES).flatMap(family => [...VOICE_KINDS, 'warning'].map(kind => sig[family][kind]));
  assert.equal(new Set(all).size, all.length, 'every family and kind is its own recipe');
  // An unknown family speaks with the default voice instead of staying silent.
  const { voices, oscillators } = setup(); assert.ok(voices.speak('newcomer', 'notice')); assert.ok(oscillators().length > 0);
});

test('the pitch falls as the creature grows: a tiny slime speaks higher than a queen of the same family', () => {
  assert.equal(pitchOf(SIZE_REF), 1);
  let before = Infinity;
  for (const radius of [.2, .38, .55, .7, .85, 1.1, 1.6, 2.05, 3.2]) { const p = pitchOf(radius); assert.ok(p <= before, `radius ${radius}`); before = p; }
  assert.ok(pitchOf(.38) > pitchOf(.6) && pitchOf(.6) > pitchOf(.85), 'tiny slime, jelly, jelly queen');
  assert.ok(pitchOf(.01) <= 1.6 && pitchOf(50) >= .4 && pitchOf(NaN) === 1, 'inside a range, whatever the model says');
  // Heard: the first pitch each oscillator is given.
  const first = (radius: number) => { const { ctx, voices, oscillators } = setup(); ctx.currentTime = 2; assert.ok(voices.speak('blob', 'notice', { radius })); return oscillators()[0].frequency.events[0].value; };
  assert.ok(first(.38) > first(.6) * 1.2 && first(.6) > first(.85) * 1.15);
  assert.ok(near(first(SIZE_REF), VOICES.blob.f, 1e-6), 'the table is the pitch at the reference size');
  // Every family, small against large.
  for (const [type, d] of Object.entries(ENEMY_TYPES)) assert.ok(pitchOf(d.radius * 1.5) <= pitchOf(d.radius), type);
});

test('a wind-up lasts the telegraph: it starts with it and peaks as the blow lands', () => {
  for (const seconds of [.3, .35, .45, .6, .7, .8, 1, 1.1, 1.2]) {
    const { ctx, voices, oscillators } = setup(); ctx.currentTime = 10;
    const voice = voices.speak('bear', 'windup', { seconds, boss: true, radius: 1.1 })!; assert.ok(voice, `${seconds}`);
    assert.equal(windupRise(seconds), seconds);
    assert.ok(near(voice.peak - 10, seconds + .005, 1e-9), `${seconds}: the peak is the blow`);
    const osc = oscillators()[0]; assert.ok(near(osc.starts[0], 10.005, 1e-9), 'it starts with the telegraph');
    // The pitch climbs all the way to the blow, and the level is highest there.
    const glide = osc.frequency.events; assert.ok(near(glide[glide.length - 1].time, voice.peak, 1e-9)); assert.ok(glide[glide.length - 1].value > glide[0].value * 1.8);
    const env = ctx.nodes.find(n => n.kind === 'gain' && n.gain.events.some(e => near(e.time, voice.peak, 1e-9) && e.kind === 'ramp'))!;
    const top = env.gain.at(voice.peak); for (const t of [.25, .5, .75, .95]) assert.ok(env.gain.at(10.005 + seconds * t) < top, `${seconds}: quieter at ${t}`);
    assert.ok(env.gain.at(10.005 + Math.min(.04, seconds * .2)) > top * .3, 'it is there from the first moment, not only at the end');
    assert.ok(env.gain.at(voice.end) < top * .02, 'and gone a tenth of a second after the blow');
  }
  // A wind-up longer than the longest rise starts later, so it still peaks at the blow.
  const { ctx, voices, oscillators } = setup(); ctx.currentTime = 10;
  const long = voices.speak('treant', 'windup', { seconds: BOSS_WINDUPS.rain, boss: true })!;
  assert.equal(windupRise(BOSS_WINDUPS.rain), WINDUP_MAX); assert.ok(near(long.peak - 10, BOSS_WINDUPS.rain + .005, 1e-9)); assert.ok(near(oscillators()[0].starts[0], 10.005 + BOSS_WINDUPS.rain - WINDUP_MAX, 1e-9));
  // Every boss skill gets at least 0.4 s of warning, enraged (0.8 of the time) too.
  for (const [skill, seconds] of Object.entries(BOSS_WINDUPS)) assert.ok(windupRise(seconds * .8) >= .4, skill);
});

test('placing: panned by the place on the screen, never more than 0.8 to a side; faded with distance, silent from 30 m', () => {
  assert.equal(PAN_MAX, .8); assert.equal(HEAR, 30);
  assert.equal(panOf(0), 0); assert.ok(near(panOf(.5), .4)); assert.equal(panOf(1), .8); assert.equal(panOf(-1), -.8); assert.equal(panOf(7), .8); assert.equal(panOf(-40), -.8); assert.equal(panOf(NaN), 0);
  assert.equal(fadeOf(0), 1); assert.equal(fadeOf(FULL), 1); assert.equal(fadeOf(HEAR), 0); assert.equal(fadeOf(45), 0); assert.equal(fadeOf(NaN), 0);
  let before = 1; for (let d = FULL; d <= HEAR; d += 1.5) { const g = fadeOf(d); assert.ok(g <= before && g >= 0); before = g; }
  assert.ok(fadeOf(29.9) > 0 && fadeOf(29.9) < .01);
  // Heard: a panner at the clamped place, a voice gain at the fade, and nothing at all from 30 m on.
  const { ctx, voices } = setup(); ctx.currentTime = 1;
  assert.ok(voices.speak('winged', 'notice', { pan: panOf(3), gain: fadeOf(18) }));
  const panner = ctx.nodes.find(n => n.kind === 'panner')!; assert.ok(near(panner.pan.value, .8));
  assert.ok(ctx.nodes.some(n => n.kind === 'gain' && near(n.gain.value, fadeOf(18)) && n.to[0] === panner), 'the voice goes through its level into the panner');
  const count = ctx.nodes.length; ctx.currentTime = 3;
  assert.equal(voices.speak('winged', 'notice', { gain: fadeOf(30) }), null); assert.equal(voices.speak('winged', 'notice', { gain: fadeOf(31) }), null);
  assert.equal(ctx.nodes.length, count, 'no node is made for a voice nobody can hear'); assert.equal(voices.stats.quiet, 2);
  // In the middle of the screen no panner is made.
  ctx.currentTime = 5; voices.speak('blob', 'notice', { pan: 0 }); assert.equal(ctx.nodes.filter(n => n.kind === 'panner').length, 1);
});

/** The feature's listeners on a bus of its own, with creatures placed by the test. */
function game(options: { touch?: boolean } = {}) {
  const s = setup(options), bus = createEvents(), where = new Map<Enemy, { metres: number; screenX: number }>(), timers: { run: () => void; seconds: number }[] = [];
  const winding = listen(bus, s.voices, enemy => where.get(enemy) ?? { metres: 3, screenX: 0 }, () => s.ctx.currentTime, (run, seconds) => timers.push({ run, seconds }));
  /** Runs the look at the winding creatures that is due (the feature's timer). */
  const look = () => { const due = timers.splice(0); for (const t of due) t.run(); return due.length; };
  return { ...s, bus, where, winding, timers, look };
}

test('a creature yelps at most once in a quarter of a second, and its last sound is the death voice', async () => {
  assert.equal(HURT_GAP, .25);
  const g = game(), boar = creature('boar'), wolf = creature('wolf'), played = () => g.voices.stats.byKind;
  g.ctx.currentTime = 5; g.bus.emit('hitLanded', { enemy: boar, damage: 5 }); assert.equal(played().hurt, 1);
  for (const dt of [.05, .1, .2, .249]) { g.ctx.currentTime = 5 + dt; g.bus.emit('hitLanded', { enemy: boar, damage: 5 }); }
  assert.equal(played().hurt, 1, 'four more blows inside the quarter second: one yelp');
  g.ctx.currentTime = 5.26; g.bus.emit('hitLanded', { enemy: boar, damage: 5 }); assert.equal(played().hurt, 2);
  // Another creature of the same family has its own quarter second, but the family's pause still holds.
  g.ctx.currentTime = 5.3; g.bus.emit('hitLanded', { enemy: wolf, damage: 5 }); assert.equal(played().hurt, 2, `the family said it ${FAMILY_GAP.hurt} s ago at the earliest`);
  g.ctx.currentTime = 5.45; g.bus.emit('hitLanded', { enemy: wolf, damage: 5 }); assert.equal(played().hurt, 3);
  // A voice refused for the family's pause does not use up the creature's own quarter second.
  g.ctx.currentTime = 5.6; g.bus.emit('hitLanded', { enemy: boar, damage: 5 }); assert.equal(played().hurt, 4);
  // The killing blow: no yelp, the death voice.
  g.ctx.currentTime = 7; boar.hp = 0; g.bus.emit('hitLanded', { enemy: boar, damage: 50 }); g.bus.emit('creatureDefeat', { enemy: boar });
  assert.equal(played().hurt, 4); assert.equal(played().death, 1);
  await Promise.resolve();
});

test('a crowd cannot squeak a fight away: pauses, a cap of its own, ordinary voices only, two at once on a phone', () => {
  assert.equal(LIVE_TOUCH, 2); assert.ok(LIVE <= 4 && LIVE < MAX_VOICES / 2 && LIVE_TOUCH <= TOUCH_VOICES / 4);
  for (const touch of [false, true]) {
    const g = game({ touch }), pack = ['jelly', 'boar', 'bee', 'frog', 'crab', 'bunny', 'cactus', 'penguin', 'chomper', 'mushroom', 'snake', 'toysoldier'].map(type => creature(type));
    // Twelve creatures notice the explorer in the same frame, wind up and are struck: for ten seconds, every 50 ms something happens.
    let most = 0, mostShared = 0; const starts: number[] = [], kinds: VoiceKind[] = [];
    for (let i = 0; i < 200; i++) {
      g.ctx.currentTime = 20 + i * .05; const enemy = pack[i % pack.length], before = { ...g.voices.stats.byKind };
      if (i < 4) for (const e of pack) g.bus.emit('creatureAlert', { enemy: e });
      if (i % 3 === 0) g.bus.emit('telegraph', { enemy, time: enemy.definition!.windup }); else g.bus.emit('hitLanded', { enemy, damage: 4 });
      for (const kind of VOICE_KINDS) for (let n = before[kind]; n < g.voices.stats.byKind[kind]; n++) { starts.push(g.ctx.currentTime); kinds.push(kind); }
      most = Math.max(most, g.voices.live(g.ctx.currentTime)); mostShared = Math.max(mostShared, g.graph.voices.live(g.ctx.currentTime));
    }
    // One notice may sound over the cap: it took the place of the alert beep, a cue.
    const cap = (touch ? LIVE_TOUCH : LIVE) + 1;
    assert.ok(most <= cap, `${touch ? 'touch' : 'desktop'}: at most ${cap} creature voices at once (${most})`);
    assert.equal(g.voices.stats.byKind.notice, 1, 'twelve creatures notice the explorer within a fifth of a second: one notice is heard, not twelve');
    assert.equal(mostShared, most, 'each is one voice of the shared counter');
    assert.ok(g.voices.stats.played >= 20, 'the fight is not silent either'); assert.ok(g.voices.stats.limited > g.voices.stats.played, 'most of what the crowd asked for was left out');
    for (const kind of VOICE_KINDS) { const of = starts.filter((_, i) => kinds[i] === kind); for (let i = 1; i < of.length; i++) assert.ok(of[i] - of[i - 1] >= GAP[kind] - 1e-9, `never two ${kind} voices started together`); }
    assert.ok(GAP.notice >= .25 && Math.min(...Object.values(GAP)) >= .08);
    const rate = touch ? PER_SECOND_TOUCH : PER_SECOND;
    for (const t of starts) assert.ok(starts.filter(u => u >= t && u < t + 1 - 1e-9).length <= rate + 1, `more than ${rate + 1} voices started in the second from ${t}`);
    assert.ok(starts.length / 10 <= rate, `${(starts.length / 10).toFixed(1)} voices a second`);
    assert.equal(g.graph.voices.capped, 0, 'and the shared counter never had to refuse one');
  }
  // The shared budget of a phone is full of blows: a creature voice is dropped, never a reserved voice taken.
  const g = game({ touch: true }), pool = g.graph.voices as Voices; pool.budget = TOUCH_VOICES + 2; pool.reserve = 2; g.ctx.currentTime = 4;
  for (let i = 0; i < TOUCH_VOICES; i++) assert.equal(pool.take(4, 9), true);
  for (const kind of VOICE_KINDS) assert.equal(g.voices.speak('blob', kind, { seconds: .5 }), null, kind);
  assert.equal(g.voices.speak('bear', 'windup', { seconds: 1.1, boss: true }), null, 'a boss\'s wind-up is an ordinary voice too');
  assert.equal(pool.live(4), TOUCH_VOICES, 'the two voices kept for priority cues are untouched'); assert.equal(pool.take(4, 5, true), true);
  assert.ok(g.voices.stats.capped >= 1);
  // Muted, or the context asleep: nothing.
  const quiet = setup(); quiet.graph.sfx = 0; assert.equal(quiet.voices.speak('blob', 'notice'), null);
  quiet.graph.sfx = .8; quiet.graph.hidden = true; assert.equal(quiet.voices.speak('blob', 'notice'), null); assert.equal(quiet.ctx.nodes.filter(n => n.kind === 'oscillator').length, 0);
});

test('a boss\'s wind-up is not held back by the pauses; an ordinary creature\'s is heard only close by', () => {
  const g = game({ touch: true }), bear = creature('bear'), boar = creature('boar'), wolf = creature('wolf');
  g.ctx.currentTime = 30; for (const e of [boar, wolf]) g.bus.emit('creatureAlert', { enemy: e }); g.bus.emit('hitLanded', { enemy: boar, damage: 3 });
  const before = g.voices.stats.byKind.windup;
  g.bus.emit('telegraph', { enemy: bear, time: BOSS_WINDUPS.slam });
  assert.equal(g.voices.stats.byKind.windup, before + 1, 'in the same instant as other voices, over the cap of two'); assert.ok(g.winding.has(bear));
  // Far away an ordinary creature winds up unheard; a boss is heard as far as any voice.
  g.ctx.currentTime = 40; g.where.set(boar, { metres: WINDUP_NEAR + 1, screenX: 0 }); g.bus.emit('telegraph', { enemy: boar, time: .7 }); assert.equal(g.voices.stats.byKind.windup, before + 1);
  g.where.set(bear, { metres: 25, screenX: -.5 }); g.bus.emit('telegraph', { enemy: bear, time: 1 }); assert.equal(g.voices.stats.byKind.windup, before + 2);
  g.where.set(bear, { metres: 31, screenX: 0 }); g.ctx.currentTime = 50; g.bus.emit('telegraph', { enemy: bear, time: 1 }); assert.equal(g.voices.stats.byKind.windup, before + 2, 'not beyond 30 m');
});

test('an interrupted wind-up stops promising a blow: a flinch, a break or a defeat fades it out at once', () => {
  const level = (g: ReturnType<typeof game>, t: number) => {
    const out = g.ctx.nodes.filter(n => n.kind === 'gain' && n.gain.events.some(e => e.kind === 'target')); return out.length ? out[out.length - 1].gain.at(t) : 1;
  };
  for (const how of ['flinch', 'break', 'defeat'] as const) {
    const g = game(), bear = creature('bear', { phase: 'windup' }); g.ctx.currentTime = 10;
    g.bus.emit('telegraph', { enemy: bear, time: 1.1 }); assert.ok(g.winding.has(bear));
    // A blow that does not interrupt it (a boss does not flinch): the voice goes on.
    g.ctx.currentTime = 10.3; g.bus.emit('hitLanded', { enemy: bear, damage: 5 }); assert.ok(g.winding.has(bear)); assert.equal(level(g, 10.5), 1);
    g.ctx.currentTime = 10.5;
    if (how === 'flinch') { bear.phase = 'chase'; g.bus.emit('hitLanded', { enemy: bear, damage: 5 }); }
    else if (how === 'break') g.bus.emit('bossBreak', { enemy: bear });
    else { bear.hp = 0; g.bus.emit('creatureDefeat', { enemy: bear }); }
    assert.equal(g.winding.has(bear), false, how); assert.ok(level(g, 10.6) < .01, `${how}: silent within 0.1 s`);
  }
  // A stun takes hold a frame after the blow, and a creature may turn and flee without any blow: the feature looks at a
  // winding creature every WATCH seconds, and at nothing when no wind-up sounds.
  for (const how of ['stun', 'flee'] as const) {
    const g = game(), boar = creature('boar', { phase: 'windup', stun: 0 }); g.ctx.currentTime = 10;
    assert.equal(g.timers.length, 0, 'no timer before a wind-up'); g.bus.emit('telegraph', { enemy: boar, time: .7 });
    assert.equal(g.timers.length, 1); assert.equal(g.timers[0].seconds, WATCH);
    g.ctx.currentTime = 10.08; assert.equal(g.look(), 1); assert.ok(g.winding.has(boar)); assert.equal(g.timers.length, 1, 'still winding: it looks again');
    if (how === 'stun') { boar.stun = 1.5; g.bus.emit('hitLanded', { enemy: boar, damage: 5 }); } else { boar.phase = 'chase'; g.ctx.currentTime = 10.16; g.look(); }
    assert.equal(g.winding.has(boar), false, how); assert.ok(level(g, g.ctx.currentTime + .1) < .01);
    g.look(); g.look(); assert.equal(g.timers.length, 0, 'and the timer ends with the wind-up');
  }
  // A wind-up that runs its course: the look ends after the blow by itself.
  { const g = game(), boar = creature('boar', { phase: 'windup' }); g.ctx.currentTime = 10; g.bus.emit('telegraph', { enemy: boar, time: .5 });
    for (let t = 10.08; t < 11; t += .08) { g.ctx.currentTime = t; if (t > 10.5) boar.phase = 'recover'; g.look(); }
    assert.equal(g.timers.length, 0); assert.equal(g.winding.size, 0); assert.equal(level(g, 10.45), 1, 'never hushed'); }
  // The blow itself (the phase has moved on at the peak) is not an interruption.
  const g = game(), boar = creature('boar', { phase: 'windup' }); g.ctx.currentTime = 10; g.bus.emit('telegraph', { enemy: boar, time: .7 });
  g.ctx.currentTime = 10.7; boar.phase = 'charge'; g.bus.emit('hitLanded', { enemy: boar, damage: 5 }); assert.equal(level(g, 10.75), 1);
});

test('a pet\'s or a helper\'s blow lands with its own bite, 6 dB under the explorer\'s hit', async () => {
  const { ctx, make } = fresh(), sfx = new Sfx(make), bus = createEvents(); sfx.random = () => .5; installMix(sfx.graph); installStingers(sfx.graph);
  listen(bus, new CreatureVoices(sfx.graph, { random: () => .5 }), () => ({ metres: 40, screenX: 0 }), () => ctx.currentTime);
  const impact = { amount: 5, critical: false, stun: 0, lift: 0, knock: 0, direction: { x: 1, z: 0 } }, boar = creature('boar'), count = (s: Sound) => sfx.stats.byKind[s] ?? 0;
  ctx.currentTime = 3; bus.emit('hitLanded', { enemy: boar, damage: 5, impact }); assert.equal(blow.helper, false); assert.equal(sfx.play('hit'), true);
  assert.deepEqual([count('hit'), count('petHit')], [1, 0], 'the explorer\'s own blow');
  // main.ts hit(): the event, then the sound, in the same step.
  for (const [i, sound] of (['hit', 'hitHeavy', 'crit'] as const).entries()) {
    ctx.currentTime = 4 + i; bus.emit('hitLanded', { enemy: boar, damage: 5, impact: { ...impact, helper: true } }); assert.equal(blow.helper, true);
    assert.equal(sfx.play(sound), true); assert.equal(count('petHit'), i + 1, sound); assert.equal(count(sound), sound === 'hit' ? 1 : 0);
    await Promise.resolve(); assert.equal(blow.helper, false, 'only for the blow being settled');
  }
  ctx.currentTime = 9; assert.equal(sfx.play('hit'), true); assert.equal(count('hit'), 2, 'the next blow of the explorer is a hit again');
  // An ordinary voice, not a tune: no reserved voice, no duck.
  assert.equal(STINGER.petHit.priority, undefined); assert.equal(STINGER.petHit.plain, true);
  // Measured.
  assert.deepEqual(PET_UNDER, [5, 7]); assert.ok(kept.pet.under >= PET_UNDER[0] && kept.pet.under <= PET_UNDER[1], `${kept.pet.under} dB under`);
  assert.ok(near(kept.sounds.hit.peak - kept.sounds.petHit.peak, kept.pet.under, .051));
});

test('the Colossus has its own roar: not the hurt cry, and no other sound either', () => {
  const names: Sound[] = ['roar', 'hurt', 'boom', 'power', 'break', 'success'], sig = signatures(Sfx, names, installStingers) as Record<Sound, string>;
  assert.equal(new Set(names.map(n => sig[n])).size, names.length);
  assert.equal(STINGER.roar.priority, true, 'it stuns: like the hurt cry it replaced it may use a reserved voice'); assert.equal(STINGER.roar.plain, true);
  assert.ok(kept.sounds.roar.peak <= -10 && kept.sounds.roar.peak >= -14, `the roar peaks at ${kept.sounds.roar.peak}`);
  assert.ok(kept.sounds.roar.peak < kept.sounds.hitHeavy.peak, 'under the heaviest blow');
});

test('every voice is the one that was measured, and the measured levels keep their bands', () => {
  const sig = voiceSignatures(AudioGraph, CreatureVoices, Object.keys(VOICES), VOICE_KINDS, heartbeat) as Record<string, Record<string, string>>;
  const again = 'changed since its level was measured: run promo/loudness.mjs --check --write (docs/SOUNDS.md, "Creature voices")';
  assert.deepEqual(Object.keys(kept.voices).sort(), Object.keys(VOICES).sort());
  const hit = kept.sounds.hit.peak, hurt = kept.sounds.hurt.peak, music = kept.music!.rms;
  for (const [family, kinds] of Object.entries(kept.voices)) {
    for (const kind of VOICE_KINDS) {
      const v = kinds[kind]; assert.equal(sig[family][kind], v.recipe, `${family} ${kind} ${again}`);
      assert.ok(v.peak >= VOICE_BANDS[kind][0] - .05 && v.peak <= VOICE_BANDS[kind][1] + .05, `${family} ${kind} peaks at ${v.peak}`);
      assert.ok(hit - v.peak >= 6, `${family} ${kind} sits at least 6 dB under a hit`); assert.ok(v.peak < hurt, `${family} ${kind} is under the explorer's own hurt cry`);
    }
    const warning = kinds.warning; assert.equal(sig[family].warning, warning.recipe, `${family} warning ${again}`);
    assert.ok(warning.peak >= WARNING_BAND[0] - .05 && warning.peak <= WARNING_BAND[1] + .05, `${family} warning peaks at ${warning.peak}`);
    assert.ok(warning.peak - music >= 6, `${family}: the warning is clearly over the music (${(warning.peak - music).toFixed(1)} dB over its RMS)`);
    assert.ok(warning.peak < hit, 'and still under a blow'); assert.ok(warning.peak - kinds.windup.peak >= 4, 'a boss warns louder than a creature');
    assert.ok(kinds.notice.peak >= -24, `${family}: a notice is a cue, never under -24`);
  }
  assert.ok(kept.brawlVoices && kept.brawlVoices.peak < 0, 'a crowded fight with voices at full sliders does not clip');
});

test('families are told apart by ear: blob, bird and boar notice with centroids more than 15% apart', () => {
  const c = (family: string) => kept.voices[family].notice.centroid, three = [c('blob'), c('winged'), c('quadruped')];
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const [low, high] = [three[i], three[j]].sort((a, b) => a - b); assert.ok(high / low >= 1.15, `${three[i]} Hz and ${three[j]} Hz`); }
  assert.ok(c('winged') > c('blob') * 2, 'a chirp sits far above a squeak');
  // The big, slow families speak longer than the small quick ones.
  assert.ok(kept.voices.bear.death.ms > kept.voices.bunny.death.ms * 1.5);
});

test('the warning on the clock: every boss pattern is heard over the music at least 0.4 s before the blow, and peaks at it', () => {
  const names = Object.keys(kept.leads); assert.ok(names.length >= 8);
  for (const skill of ['slam', 'charge', 'quake']) assert.ok(names.includes(skill), `King Bear's ${skill}`);
  for (const [name, lead] of Object.entries(kept.leads)) {
    assert.ok(lead.rise >= .4 && lead.rise <= WINDUP_MAX, `${name}: rises for ${lead.rise} s`);
    assert.ok(lead.starts >= .4 && lead.starts <= WINDUP_MAX + .001, `${name}: starts ${lead.starts} s before the blow`);
    assert.ok(lead.overMusic >= .4, `${name}: over the music's RMS ${lead.overMusic} s before the blow`);
    assert.ok(Math.abs(lead.peakAt) <= .08, `${name}: loudest ${lead.peakAt} s from the blow`);
    assert.ok(lead.peak >= WARNING_BAND[0] && lead.peak <= WARNING_BAND[1], `${name}: ${lead.peak} dBFS`);
  }
});
