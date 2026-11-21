// The music director (AAA-PLAN WP13, src/features-audio/music-director.ts): the state table, equal-power crossfades, the hold
// that keeps the drums from flapping, the village's rests, the theme, who wins against the radio, and the duck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sfx, AudioGraph } from '../src/sfx.ts';
import { audioLevels, radio } from '../src/audio-settings.ts';
import { PLANETS } from '../src/content.ts';
import { ZONE_NAMES } from '../src/minimap.ts';
import { installMix, settle } from '../src/features-audio/sound-mix.ts';
import { installStingers, STINGER, STINGER_DUCK } from '../src/features-audio/stingers.ts';
import { MUSIC, HOME_ZONES, MODES, THEME_ONLY } from '../src/features-audio/music-content.ts';
import { Director, Held, mount, newScene, stateOf, regionOf, fadeLevel, FADE, HOLD, BOSS_HOLD, SETTLE, LINGER, THEME_GAP, REACH, CUT, THEME_WAIT, TRIM, type Scene } from '../src/features-audio/music-director.ts';
import { MusicBox } from '../src/features-audio/radio.ts';
import { fresh, node, type FakeContext, type FakeNode } from './support/fake-audio.ts';

const scene = (patch: Partial<Scene> = {}) => ({ ...newScene(), ...patch });
const THEME = { duration: 36.9 } as unknown as AudioBuffer;
/** A director on a recording context, and `run(scene, seconds)`: ten ticks a second, as mount() gives them. */
function stage(lite = false) {
  const { ctx, make } = fresh(), graph = new AudioGraph(make), director = new Director(graph, lite);
  audioLevels.music = .45; let tick = Math.round(ctx.currentTime * 10);
  const run = (s: Scene, seconds: number) => { for (const end = tick + Math.round(seconds * 10); tick < end; tick++) { ctx.currentTime = tick / 10; director.tick(s); } ctx.currentTime = tick / 10; };
  return { ctx, graph, director, run };
}
const gainAt = (d: { gain: GainNode }, t: number) => node(d.gain).gain.at(t);
const sources = (ctx: FakeContext) => ctx.nodes.filter(n => n.kind === 'oscillator' || n.kind === 'buffer');

test('the state table: village after Start, a wild zone its region, a chaser danger, a boss, the cottage, space, the modes', () => {
  assert.equal(stateOf(newScene()), 'village', 'after Start, before the first zone is known');
  assert.equal(stateOf(scene({ zone: 'Clover Village' })), 'village');
  assert.equal(stateOf(scene({ zone: 'Mushroom Forest' })), 'forest');
  assert.equal(stateOf(scene({ zone: 'Blue Lake Meadow' })), 'meadow');
  assert.equal(stateOf(scene({ zone: 'Chomper Swamp' })), 'swamp');
  assert.equal(stateOf(scene({ zone: 'Redrock Canyon' })), 'canyon');
  assert.equal(stateOf(scene({ planet: 'lava', zone: 'Ember Planet' })), 'lava');
  assert.equal(stateOf(scene({ zone: 'Mushroom Forest', chase: true })), 'danger');
  assert.equal(regionOf(scene({ zone: 'Mushroom Forest', chase: true })), 'forest', 'danger keeps the tune of the place');
  assert.equal(stateOf(scene({ zone: 'Mushroom Forest', chase: true, boss: true })), 'boss');
  assert.equal(stateOf(scene({ indoors: true, chase: true, boss: true })), 'indoors');
  assert.equal(stateOf(scene({ space: true, planet: 'ice' })), 'space');
  for (const mode of Object.values(MODES)) assert.equal(stateOf(scene({ mode, chase: true, boss: true })), mode, 'a mode keeps its own tune and beat');
  assert.equal(stateOf(scene({ planet: 'somewhere-new' })), 'village', 'an unknown planet still has music');
  // No title state: nothing is called title, and the director is only made by mount(), after the first played frame.
  assert.ok(!('title' in MUSIC));
  const every = new Set<string>();
  for (const planet of ['home', ...Object.keys(PLANETS), 'nowhere']) for (const zone of ['', ...Object.keys(HOME_ZONES)]) for (let flags = 0; flags < 16; flags++) every.add(stateOf(scene({ planet, zone, chase: !!(flags & 1), boss: !!(flags & 2), indoors: !!(flags & 4), space: !!(flags & 8) })));
  assert.ok(!every.has('title') && [...every].every(state => state in MUSIC), 'every state the table gives has an entry, and none is a title');
});

test('every planet, every zone of the home planet and every mode has an entry', () => {
  for (const planet of Object.keys(PLANETS)) if (planet !== 'home') { assert.ok(MUSIC[planet]?.progs, `${planet} has a tune`); assert.equal(stateOf(scene({ planet })), planet); }
  // The zone names are the game's own (minimap.ts ZONE_NAMES, the same table as the HUD's banner in world.ts).
  assert.deepEqual(Object.keys(HOME_ZONES).sort(), Object.values(ZONE_NAMES).sort());
  assert.deepEqual(Object.entries(ZONE_NAMES).map(([id, zone]) => [id, HOME_ZONES[zone]]), [['home', 'village'], ['forest', 'forest'], ['meadow', 'meadow'], ['swamp', 'swamp'], ['canyon', 'canyon']]);
  for (const [cls, mode] of Object.entries(MODES)) { assert.ok(MUSIC[mode]?.progs, `${mode} (${cls}) has a tune`); }
  assert.deepEqual(MODES, { 'in-ctf': 'ctf', 'in-rescue': 'rescue', 'in-vault': 'vault' }, 'the classes ctf.ts, rescue.ts and dungeon.ts put on the body');
  for (const state of ['village', 'danger', 'boss', 'indoors', 'space']) assert.ok(MUSIC[state], `${state} has an entry`);
  assert.ok(!MUSIC.indoors.progs && !MUSIC.danger.progs && MUSIC.danger.beat && MUSIC.boss.beat, 'indoors is the radio\'s, danger is a layer, the boss has its own beat');
  assert.equal(THEME_ONLY, false, 'the live score is on');
  assert.ok(MUSIC.village.file && MUSIC.village.rest?.[0] === 60 && MUSIC.village.rest[1] === 120, 'the village has the theme and rests 60 to 120 s');
});

test('a crossfade is equal-power: the squares of the gains add up to 1 +/- 0.01 over 1.8 s', () => {
  assert.equal(FADE, 1.8);
  const { director, run, ctx } = stage(), s = scene({ zone: 'Redrock Canyon' });
  run(s, 5); s.zone = 'Mushroom Forest'; run(s, SETTLE); const t0 = ctx.currentTime; run(s, .1); // the new place has held 1.5 s
  assert.equal(director.decks.length, 2);
  const [canyon, forest] = director.decks;
  for (let t = t0; t <= t0 + FADE + 1e-9; t += .03) { const sum = gainAt(canyon, t) ** 2 + gainAt(forest, t) ** 2; assert.ok(Math.abs(sum - 1) <= .01, `at ${(t - t0).toFixed(2)} s the squares add up to ${sum}`); }
  assert.ok(gainAt(canyon, t0 + FADE) < 1e-9 && Math.abs(gainAt(forest, t0 + FADE) - 1) < 1e-9 && gainAt(forest, t0) < 1e-9, 'from one to the other in 1.8 s');
  assert.ok(gainAt(forest, t0 + .9) > .7 && gainAt(canyon, t0 + .9) > .7, 'both at -3 dB in the middle, not at -6');
  // A change in the middle of a crossfade starts from where every deck is: three decks, and still 1.
  run(s, .6); s.boss = true; const t1 = ctx.currentTime; run(s, .1);
  assert.equal(director.decks.length, 3);
  for (let t = t1; t <= t1 + FADE + 1e-9; t += .03) { const sum = director.decks.reduce((a, d) => a + gainAt(d, t) ** 2, 0); assert.ok(Math.abs(sum - 1) <= .01, `three decks at ${(t - t1).toFixed(2)} s: ${sum}`); }
  // No gain is ever stepped while it plays, and the model the director keeps matches the gain that was planned.
  for (const d of director.decks) { assert.equal(node(d.gain).gain.steps, 1, 'only the first 0'); assert.ok(Math.abs(director.levelOf(d, t1 + 1) - gainAt(d, t1 + 1)) < .005); }
  run(s, FADE + LINGER + .3); assert.equal(director.decks.length, 1, 'the decks that faded out are taken away, once they can no longer come back');
  assert.equal(node(canyon.gain).to.length, 0, 'and disconnected');
  for (const x of [0, .25, .5, .75, 1]) assert.ok(Math.abs(fadeLevel(1, false, x) ** 2 + fadeLevel(0, true, x) ** 2 - 1) < 1e-12);
});

test('walking into Mushroom Forest: once the place has held 1.5 s the crossfade takes 1.8 s; the music is there within 3 s of the first tick', () => {
  const { director, run, ctx } = stage(), s = scene({ zone: 'Clover Village' });
  run(s, .2);
  const first = sources(ctx)[0]; assert.ok(first && first.starts[0] < .3, 'the first note within 0.3 s');
  assert.ok(director.levelOf(director.cur!, 1.8) > .99, 'and at full level within 1.8 s');
  run(s, 6); s.zone = 'Mushroom Forest'; run(s, SETTLE); assert.equal(director.key, 'village', 'not yet'); const t0 = ctx.currentTime; run(s, 2);
  assert.equal(director.key, 'forest'); assert.equal(director.cur!.player!.score.tune, MUSIC.forest);
  assert.ok(gainAt(director.cur!, t0 + 2) > .999 && gainAt(director.decks[0], t0 + 2) < .001);
  assert.ok(sources(ctx).some(n => n.starts[0] > t0 && n.starts[0] < t0 + .3), 'its first note within 0.3 s');
});

test('danger: the drums join the tune of the place, hold 1.5 s past the chase and never flap', () => {
  assert.equal(HOLD, 1.5); assert.equal(REACH, 12);
  const held = new Held(); assert.equal(held.set(true, 0), true); assert.equal(held.set(false, 1.49), true); assert.equal(held.set(false, 1.5), false);
  const { director, run, ctx } = stage(), s = scene({ zone: 'Chomper Swamp' });
  run(s, 4); const deck = director.cur!, drums = node(deck.player!.drums);
  assert.equal(drums.gain.at(4), 0, 'no drums while calm');
  const before = sources(ctx).length; s.chase = true; run(s, 3);
  assert.equal(director.name, 'danger'); assert.equal(director.key, 'swamp'); assert.equal(director.cur, deck, 'the same tune plays on: no crossfade');
  assert.ok(drums.gain.at(4.3) > .95, 'the drums are in within 0.3 s');
  const strokes = sources(ctx).slice(before).filter(n => (n.to[0] as FakeNode).to[0] === drums || ((n.to[0] as FakeNode).to[0] as FakeNode).kind === 'filter');
  assert.ok(strokes.length >= 6, `kick, tom and shaker play (${strokes.length} strokes in 3 s)`);
  // A creature at the edge of its reach: in and out every 0.3 s for 6 s. The state never leaves danger.
  const names = new Set<string>(); let events = drums.gain.events.length;
  for (let i = 0; i < 20; i++) { s.chase = i % 2 === 0; run(s, .3); names.add(director.name); }
  assert.deepEqual([...names], ['danger']); assert.equal(drums.gain.events.length, events, 'and the drums were not touched');
  s.chase = true; run(s, .1); events = drums.gain.events.length; s.chase = false; run(s, 1.4); assert.equal(director.name, 'danger', 'held for 1.5 s');
  run(s, .3); assert.equal(director.name, 'swamp'); assert.ok(drums.gain.events.length === events + 1, 'the drums leave once');
  const t = ctx.currentTime; run(s, 3); assert.ok(drums.gain.at(t + 2.5) < .01, 'and they are gone 2.5 s later');
  const after = sources(ctx).filter(n => n.starts[0] > t + .3 && (n.to[0] as FakeNode).to[0] === drums);
  assert.equal(after.length, 0, 'no more strokes are planned');
});

test('a boss brings its own beat within 1 s of the boss bar, and the place comes back when it is over', () => {
  const { director, run, ctx } = stage(), s = scene({ zone: 'Mushroom Forest' });
  run(s, 5); s.boss = true; const t0 = ctx.currentTime; run(s, 1);
  assert.equal(director.name, 'boss'); assert.equal(director.cur!.player!.score.tune, MUSIC.boss);
  const drums = node(director.cur!.player!.drums); assert.equal(drums.gain.value, 1, 'its beat needs no chase');
  const strokes = sources(ctx).filter(n => n.starts[0] >= t0 && ((n.to[0] as FakeNode).to[0] === drums || ((n.to[0] as FakeNode).to[0] as FakeNode).kind === 'filter'));
  assert.ok(strokes.length >= 4 && strokes[0].starts[0] < t0 + .3, 'the first stroke within 0.3 s');
  assert.ok(gainAt(director.cur!, t0 + 1) > .7, `and the boss tune is at ${gainAt(director.cur!, t0 + 1).toFixed(2)} of its level after 1 s`);
  assert.ok(BOSS_HOLD >= FADE, 'a boss lasts longer than a fade');
  const forest = director.decks[0], bossDeck = director.cur!;
  s.boss = false; run(s, BOSS_HOLD - .1); assert.equal(director.name, 'boss'); run(s, .3); assert.equal(director.name, 'forest'); assert.equal(director.key, 'forest');
  assert.equal(director.cur, forest, 'the tune of the place comes back from where it is: it was never taken away'); assert.equal(director.made, 2);
  // Kited at the edge of its reach: the boss comes and goes every 2.5 s. Its tune is faded up again each time, never started from its first bar.
  const step = bossDeck.player!.score.step;
  for (let i = 0; i < 6; i++) { s.boss = i % 2 === 0; run(s, 2.5); }
  s.boss = true; run(s, .2); assert.equal(director.cur, bossDeck); assert.equal(director.made, 2, 'no new deck in 15 s of kiting'); assert.ok(bossDeck.player!.score.step > step + 30, 'and it played on unheard meanwhile');
});

test('the village rests: a tune of two phrases, 60 to 120 s of quiet, then a variation; the wild plays on', () => {
  const { director, run, ctx } = stage(), s = scene({ zone: 'Clover Village' }), length = 2 * 32 * 60 / MUSIC.village.bpm!;
  run(s, length - .5); assert.equal(director.resting, false); const first = director.cur!;
  run(s, 1); assert.equal(director.resting, true); assert.equal(director.cur, null);
  const rest = director.until - ctx.currentTime; assert.ok(rest >= 58 && rest <= 120, `a rest of ${rest.toFixed(0)} s`);
  const t0 = ctx.currentTime; run(s, 10); assert.ok(sources(ctx).every(n => n.starts[0] < t0 + FADE + .25), 'only the tail of the fade is planned');
  const quiet = sources(ctx).length; run(s, 40); assert.equal(sources(ctx).length, quiet, 'nothing is planned in a rest');
  assert.equal(director.decks.length, 0, 'and nothing is kept');
  run(s, rest - 49); assert.equal(director.resting, false); assert.ok(director.cur?.player && director.cur !== first, 'a variation plays');
  // A wild region has no rest.
  const wild = stage(), w = scene({ zone: 'Redrock Canyon' }); wild.run(w, 200); assert.equal(wild.director.resting, false); assert.equal(wild.director.until, Infinity);
});

test('the theme: on an arrival in the village when it is there, not twice in three minutes; the live score plays the variations', () => {
  const { director, run, ctx } = stage(), s = scene({ zone: 'Mushroom Forest' });
  director.theme = THEME; run(s, 3); assert.ok(director.cur?.player, 'the forest has no recording: the live score');
  s.zone = 'Clover Village'; run(s, SETTLE); const t0 = ctx.currentTime; run(s, 1);
  const deck = director.cur!, src = node(deck.src!);
  assert.ok(src && !deck.player, 'the theme plays'); assert.equal(src.buffer, THEME); assert.ok(src.starts[0] < t0 + .2);
  // It goes through the director's trim into the music bus, like the radio: no element, no element volume.
  const trim = node(deck.gain).to[0] as FakeNode; assert.equal(trim.gain.value, TRIM); assert.equal(TRIM, MusicBox.TRIM);
  assert.equal(trim.to[0], director['graph'].nodes.music!.bus);
  assert.ok(ctx.nodes.every(n => n.kind !== 'media'), 'no media element is routed: the theme is a decoded buffer');
  // Out of the gate and back in ten seconds: the same theme is faded up again where it is, not started anew.
  s.zone = 'Blue Lake Meadow'; run(s, SETTLE + 3); assert.equal(director.key, 'meadow'); s.zone = 'Clover Village'; run(s, SETTLE + .2);
  assert.equal(director.cur, deck); assert.equal(src.starts.length, 1);
  run(s, 37.3 - (ctx.currentTime - t0)); assert.equal(director.resting, true, 'once, then the rest');
  run(s, director.until - ctx.currentTime + .2); assert.ok(director.cur?.player, 'then a variation by the live score');
  // Away for ten seconds and back: it played less than three minutes ago, so a live variation greets the village.
  assert.equal(THEME_GAP, 180);
  s.zone = 'Blue Lake Meadow'; run(s, 10); s.zone = 'Clover Village'; run(s, SETTLE + .2); assert.equal(director.key, 'village'); assert.ok(director.cur?.player && !director.cur.src);
  // After more than three minutes away it is the theme again.
  s.zone = 'Blue Lake Meadow'; run(s, 200); s.zone = 'Clover Village'; run(s, SETTLE + .2); assert.ok(director.cur?.src); assert.equal(ctx.nodes.filter(n => n.kind === 'buffer' && n.buffer === THEME).length, 2);
});

test('a walk along a border changes nothing, and a diagonal across the village ring makes two decks, not twenty', () => {
  assert.equal(SETTLE, 1.5);
  // In and out of the forest every 0.8 s for 20 s: the village plays on.
  const a = stage(), s = scene({ zone: 'Clover Village' }); a.run(s, 3); const village = a.director.cur;
  for (let i = 0; i < 25; i++) { s.zone = i % 2 ? 'Clover Village' : 'Mushroom Forest'; a.run(s, .8); }
  assert.equal(a.director.made, 1); assert.equal(a.director.cur, village); assert.equal(a.director.key, 'village'); assert.equal(a.director.decks.length, 1);
  // A slower weave, 2.5 s on each side for 20 s: each tune is faded up again where it is.
  const b = stage(), w = scene({ zone: 'Clover Village' }); b.run(w, 3); let most = 0;
  for (let i = 0; i < 8; i++) { w.zone = i % 2 ? 'Clover Village' : 'Blue Lake Meadow'; b.run(w, 2.5); most = Math.max(most, b.director.decks.length); }
  assert.equal(b.director.made, 2, 'two decks in 20 s'); assert.ok(most <= 2);
  // The same with the theme in the village: it is never started again.
  const c = stage(), v = scene({ zone: 'Clover Village' }); c.director.theme = THEME; c.run(v, 3); assert.ok(c.director.cur?.src);
  for (let i = 0; i < 8; i++) { v.zone = i % 2 ? 'Clover Village' : 'Mushroom Forest'; c.run(v, 2.5); }
  assert.equal(c.ctx.nodes.filter(n => n.kind === 'buffer' && n.buffer === THEME).length, 1, 'the theme began once'); assert.equal(c.director.made, 2);
  // Through four places with three seconds in each: never more than three decks.
  const d = stage(), x = scene({ zone: 'Clover Village' }); let decks = 0;
  for (const zone of ['Mushroom Forest', 'Chomper Swamp', 'Redrock Canyon', 'Blue Lake Meadow', 'Clover Village', 'Mushroom Forest']) { x.zone = zone; for (let i = 0; i < 30; i++) { d.run(x, .1); decks = Math.max(decks, d.director.decks.length); } }
  assert.ok(decks <= 3, `${decks} decks at once`);
});

test('theme only (below Sharp, Battery saver, the switch): the theme plays and rests; until it is there the live score stands in, lightly', () => {
  for (const zone of ['Clover Village', 'Mushroom Forest']) { // Battery saver and medium alike: `can` is false
    const { director, run, ctx } = stage(), s = scene({ zone });
    director.can = false; run(s, 3);
    assert.equal(director.mode, 'lite'); assert.equal(director.key, regionOf(s) + '~');
    const made = sources(ctx); assert.ok(made.length > 3 && made[0].starts[0] < .3, 'not silent: the first note within 0.3 s');
    assert.ok(director.levelOf(director.cur!, 1.8) > .99, 'at full level within 1.8 s, well inside 3 s');
    run(s, 20); assert.ok(sources(ctx).every(n => !n.wave), 'no pad');
  }
  const { director, run, ctx } = stage(), s = scene({ zone: 'Mushroom Forest', chase: true });
  director.can = false; run(s, 5); const lite = director.cur!; assert.equal(director.key, 'forest~');
  // The theme comes in the middle of a chase: nothing changes until the place does, or a rest comes.
  director.theme = THEME; run(s, 5); assert.equal(director.cur, lite); assert.equal(director.mode, 'lite');
  s.chase = false; s.zone = 'Redrock Canyon'; run(s, HOLD + SETTLE + .3); assert.equal(director.mode, 'theme'); assert.equal(director.key, 'theme'); assert.ok(director.cur?.src, 'now the theme plays');
  const deck = director.cur, before = sources(ctx).filter(n => n.kind === 'oscillator').length; s.zone = 'Chomper Swamp'; s.boss = true; run(s, 12); assert.equal(director.cur, deck, 'the same theme everywhere: a new place does not start it again');
  assert.ok(sources(ctx).filter(n => n.kind === 'oscillator' && n.starts[0] > ctx.currentTime - 5).length === 0 && before > 0, 'and no live note is planned any more');
  run(s, 37 - 12); assert.equal(director.resting, true); const rest = director.until - ctx.currentTime; assert.ok(rest > 58 && rest <= 120);
  run(s, rest + .2); assert.ok(director.cur?.src && director.cur !== deck, 'and again after the rest');
});

test('the graphics governor cannot change the music in the middle of a tune: only at a change of place or in a rest, never in a boss fight', () => {
  const { director, run, ctx } = stage(), s = scene({ zone: 'Mushroom Forest' });
  run(s, 5); const forest = director.cur!; s.boss = true; run(s, 3); const boss = director.cur!; assert.equal(director.key, 'boss');
  // The governor drops the level in the middle of the boss fight, then flips it a few times.
  for (let i = 0; i < 10; i++) { director.can = i % 2 === 1; run(s, 1); assert.equal(director.cur, boss); assert.equal(director.mode, 'live'); }
  director.can = false; run(s, 5); assert.equal(director.cur, boss, 'the boss tune and its beat play on'); assert.equal(director.made, 2);
  // The boss falls: now the place's music is settled anew. The theme is not here, so the live score stands in.
  s.boss = false; run(s, BOSS_HOLD + .3); assert.equal(director.mode, 'lite'); assert.equal(director.key, 'forest~'); assert.notEqual(director.cur, forest);
  // In the calm it holds too: back to Sharp in the middle of the tune changes nothing until the next place.
  director.can = true; run(s, 10); assert.equal(director.key, 'forest~'); s.chase = true; run(s, 3); assert.equal(director.key, 'forest~');
  s.chase = false; s.zone = 'Redrock Canyon'; run(s, HOLD + SETTLE + .3); assert.equal(director.mode, 'live'); assert.equal(director.key, 'canyon');
  // The switch in Settings is the player's own: it applies at once.
  director.can = false; director.fresh = true; run(s, .2); assert.equal(director.key, 'canyon~'); assert.equal(director.fresh, false);
  director.can = true; director.fresh = true; run(s, .2); assert.equal(director.key, 'canyon');
  // In the village a rest is such a moment.
  const v = stage(), w = scene({ zone: 'Clover Village' }); v.run(w, 5); v.director.can = false; v.director.theme = THEME; v.run(w, 30); assert.equal(v.director.key, 'village');
  v.run(w, 10); assert.equal(v.director.resting, true); v.run(w, v.director.until - v.ctx.currentTime + SETTLE + .5); assert.equal(v.director.key, 'theme'); assert.ok(v.director.cur?.src);
  assert.ok(ctx.nodes.length > 0);
});

test('the radio wins: indoors the director is silent, and a radio that starts cuts it in a moment', () => {
  const { director, run, ctx } = stage(), s = scene({ zone: 'Clover Village' });
  run(s, 4); const deck = director.cur!; s.indoors = true; const t0 = ctx.currentTime; run(s, .5);
  assert.equal(director.name, 'indoors'); assert.equal(director.key, ''); assert.equal(director.cur, null);
  assert.ok(gainAt(deck, t0 + FADE) < 1e-9, 'it fades out in 1.8 s');
  s.radio = true; run(s, .2); assert.ok(gainAt(deck, t0 + .5 + CUT + .01) < 1e-9, 'the radio starts: the tail is gone in 0.12 s');
  const count = sources(ctx).length; run(s, 30); assert.equal(sources(ctx).length, count, 'nothing is planned under the radio');
  // The radio left on by the door (it stops a frame later), or switched on by a test outdoors: still the radio's turn.
  s.indoors = false; run(s, 1); assert.equal(director.key, ''); assert.equal(sources(ctx).length, count);
  s.radio = false; run(s, .2); assert.equal(director.key, 'village'); assert.ok(sources(ctx).length > count, 'outside again: the village');
});

test('the music slider at 0: nothing is planned and nothing is kept; back up, the place starts afresh', () => {
  const { director, run, ctx, graph } = stage(), s = scene({ zone: 'Mushroom Forest' });
  run(s, 3); const bus = node(graph.nodes.music!.bus); assert.equal(bus.gain.value, .45);
  audioLevels.music = 0; run(s, .1);
  assert.equal(director.decks.length, 0); assert.equal(director.key, ''); assert.equal(graph.music, 0); assert.equal(bus.gain.at(ctx.currentTime + 1), 0, 'the bus is at 0');
  const count = ctx.nodes.length; run(s, 20); assert.equal(ctx.nodes.length, count, 'not one node while off');
  audioLevels.music = .3; run(s, .3); assert.equal(director.key, 'forest'); assert.ok(ctx.nodes.length > count); assert.equal(graph.music, .3);
  // A director that never played builds nothing while the slider is at 0: no context either.
  audioLevels.music = 0; const quiet = stage(); audioLevels.music = 0; quiet.director.tick(s); assert.equal(quiet.graph.made, null);
  audioLevels.music = .45;
});

test('a hidden tab, a sleeping context, a stopped or jumping clock: no stall, no spin, no burst', () => {
  const { director, run, ctx, graph } = stage(), s = scene({ zone: 'Mushroom Forest' });
  run(s, 3); installMix(graph);
  settle(graph, true, .45); assert.equal(ctx.state, 'suspended'); // hidden: sound-mix.ts puts the context to sleep
  const count = ctx.nodes.length; for (let i = 0; i < 100; i++) director.tick(s);
  assert.equal(ctx.nodes.length, count, 'nothing is planned while hidden');
  settle(graph, false, .45); assert.equal(ctx.state, 'running');
  for (let i = 0; i < 100; i++) director.tick(s); // the clock has not moved yet (a faked clock, a context still waking)
  assert.equal(ctx.nodes.length, count, 'the same moment again plans nothing');
  ctx.currentTime += 600; director.tick(s); // ten minutes later in one step
  const late = sources(ctx).filter(n => n.starts[0] > 100);
  assert.ok(late.length > 0 && late.length <= 32, `one step is planned after the jump (${late.length} sources), not ten minutes of notes`);
  for (const n of late) assert.ok(n.starts[0] >= ctx.currentTime);
  assert.equal(director.key, 'forest');
});

test('a stinger ducks the score 6 dB: everything the director plays is behind the music bus', () => {
  const { ctx, make } = fresh(), sfx = new Sfx(make), graph = sfx.graph, director = new Director(graph);
  installMix(graph); installStingers(graph); audioLevels.music = .45;
  const s = scene({ zone: 'Mushroom Forest' }); for (let i = 0; i < 50; i++) { ctx.currentTime = i / 10; director.tick(s); }
  const music = graph.nodes.music!, duck = node(music.duck), deck = director.cur!;
  // The path of a note: its envelope, the deck, the echo bus, the trim, the music bus, the duck.
  const env = ctx.nodes.find(n => n.kind === 'oscillator')!.to[0] as FakeNode, echo = node(deck.gain).to[0] as FakeNode, trim = echo.to[0] as FakeNode;
  assert.equal(env.to[0], deck.gain); assert.equal(trim.to[0], music.bus); assert.equal(node(music.bus).to[0], music.duck); assert.equal(echo.to.length, 4, 'the trim and three echoes');
  for (const n of ctx.nodes.filter(n => n.kind === 'delay')) assert.equal(((n.to[0] as FakeNode).to[0]), trim, 'the echoes too');
  assert.equal(duck.gain.at(ctx.currentTime), 1);
  const t0 = ctx.currentTime; assert.equal(sfx.play('victory'), true);
  const dB = (v: number) => 20 * Math.log10(v);
  assert.ok(Math.abs(dB(duck.gain.at(t0 + .1)) + STINGER_DUCK) < .1, `6 dB down within 0.1 s (${dB(duck.gain.at(t0 + .1)).toFixed(2)} dB)`);
  assert.ok(Math.abs(dB(duck.gain.at(t0 + STINGER.victory.length)) + 6) < .1, 'held for the stinger');
  assert.ok(dB(duck.gain.at(t0 + STINGER.victory.length + .6)) > -.1, 'and back');
  // The director itself never touches the duck (only the stinger's two glides are on it) and takes no voice of the effects.
  assert.equal(duck.gain.events.length, 2); assert.equal(duck.gain.steps, 0);
  assert.equal(graph.voices.capped, 0);
});

test('mount: the scene is read from the game ten times a second, and the theme is asked for 20 s after the first played frame', async t => {
  assert.equal(THEME_WAIT, 20);
  const { ctx, make } = fresh(), graph = new AudioGraph(make); audioLevels.music = .45;
  Object.assign(ctx, { decodeAudioData: async () => THEME });
  const classes = new Set<string>(), spaceHud = { hidden: true }, timers: { run: () => void; ms: number }[] = [], fetched: string[] = [], listeners: Record<string, (p: { enemy: unknown }) => void> = {};
  let clock = 1000, quality = 'high';
  t.mock.method(performance, 'now', () => clock);
  t.mock.method(globalThis, 'setInterval', (run: () => void, ms: number) => { timers.push({ run, ms }); return 0; });
  t.mock.method(globalThis, 'setTimeout', (run: () => void) => { run(); return 0; });
  t.mock.method(globalThis, 'fetch', async (url: string) => { fetched.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; });
  const g = globalThis as { document?: unknown };
  let click: (event: { target: unknown }) => void = () => {}; const prefs: Record<string, string> = {};
  g.document = { body: { classList: { contains: (name: string) => classes.has(name) } }, getElementById: (id: string) => id === 'space-hud' ? spaceHud : null, addEventListener: (type: string, fn: typeof click) => { if (type === 'click') click = fn; } };
  t.after(() => { delete g.document; radio.box = undefined; radio.row = undefined; });
  const enemy = (x: number, phase?: string, boss = false) => ({ x, z: 0, hp: 10, phase, boss });
  const world = { planet: 'home', lastZone: 'Mushroom Forest', interior: null as unknown, enemies: [] as ReturnType<typeof enemy>[], position: { x: 0, z: 0 } };
  const services = { world, audio: graph, pref: (key: string) => prefs[key] ?? '', setPref: (key: string, value: string) => { prefs[key] = value; return true; }, touch: () => false, quality: () => quality, on: (event: string, fn: (p: { enemy: unknown }) => void) => { listeners[event] = fn; return () => {}; } };
  mount(services as unknown as Parameters<typeof mount>[0]);
  assert.equal(timers.length, 1); assert.equal(timers[0].ms, 100, 'one timer, ten times a second (frames stop in space)');
  const director = (graph as unknown as { director: Director }).director; let tick = 0;
  const run = (seconds: number) => { for (const end = tick + Math.round(seconds * 10); tick < end; tick++) { ctx.currentTime = tick / 10; clock += 100; timers[0].run(); } };
  run(1); assert.equal(director.name, 'forest'); assert.equal(director.can, true);
  // A chaser counts within 12 m, when it is after someone: not asleep, not idle, not walking home, not dead.
  world.enemies = [enemy(13, 'chase'), enemy(5), enemy(5, 'idle'), enemy(5, 'return'), { ...enemy(5, 'chase'), hp: 0 }]; run(2); assert.equal(director.name, 'forest');
  world.enemies = [enemy(11.9, 'windup')]; run(.2); assert.equal(director.name, 'danger');
  world.enemies = []; run(2); assert.equal(director.name, 'forest');
  // The boss bar: bossEngaged. It lasts while the boss lives and fights or stands near; a boss that falls ends it.
  const boss = enemy(30, 'chase', true); world.enemies = [boss]; listeners.bossEngaged({ enemy: boss }); run(.2); assert.equal(director.name, 'boss');
  boss.phase = undefined; boss.x = 20; run(3); assert.equal(director.name, 'boss', 'calm but near (24 m)');
  boss.hp = 0; run(2); assert.equal(director.name, 'forest');
  // The cottage, space, the modes, another planet.
  world.interior = {}; run(.2); assert.equal(director.name, 'indoors'); world.interior = null;
  radio.box = { playing: true, start() {}, stop() {}, tick() {} }; run(.2); assert.equal(director.key, '', 'the radio plays'); radio.box = undefined;
  spaceHud.hidden = false; run(.2); assert.equal(director.name, 'space'); spaceHud.hidden = true;
  for (const [cls, mode] of Object.entries(MODES)) { classes.add('in-mode'); classes.add(cls); run(.2); assert.equal(director.name, mode); classes.clear(); }
  world.planet = 'ice'; world.lastZone = 'Frost Planet'; run(.2); assert.equal(director.name, 'ice');
  // Below Sharp and on Battery saver the live score is not asked for (the director takes that up at a change of place).
  quality = 'medium'; run(.2); assert.equal(director.can, false); quality = 'low'; run(.2); assert.equal(director.can, false); quality = 'high'; run(.2); assert.equal(director.can, true);
  // The theme: not before 20 s after mount, and not in a fight.
  assert.deepEqual(fetched, [], `nothing was asked for in the first ${((clock - 1000) / 1000).toFixed(0)} s`);
  run(20 - (clock - 1000) / 1000 - .2); assert.deepEqual(fetched, []);
  world.enemies = [enemy(5, 'chase')]; run(3); assert.deepEqual(fetched, [], 'a chase is on: the fetch waits');
  world.enemies = []; run(.3); assert.equal(fetched.length, 1); assert.match(fetched[0], /assets\/audio\/zoo-garden-theme\.mp3$/);
  await new Promise<void>(resolve => setImmediate(resolve)); run(5);
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(director.theme, null, 'with the live score on another planet it is kept as it came, not decoded');
  world.planet = 'home'; world.lastZone = 'Clover Village'; run(.2);
  await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(director.theme, THEME, 'in the village it is decoded');
  run(30); assert.equal(fetched.length, 1, 'asked for once');
  // The switch in Settings: a row after the music slider, drawn by audio-settings.ts through the slot; a click applies at once and is kept.
  const { audioRowsHtml } = await import('../src/audio-settings.ts'); let html = audioRowsHtml({});
  assert.match(html, /data-volume="music".*<strong>Live music<\/strong><small>Tunes played for each place\. Off: the recorded theme only\.<\/small>.*class="toggle on" role="switch" aria-checked="true" aria-label="Live music" data-live-music.*data-volume="sfx"/s);
  const button = { on: true, checked: 'true', classList: { toggle(_: string, on: boolean) { button.on = on; } }, setAttribute(_: string, value: string) { button.checked = value; } };
  click({ target: { closest: () => null } }); assert.equal(prefs.music, undefined, 'another click is not ours');
  click({ target: { closest: (selector: string) => selector === '[data-live-music]' ? button : null } });
  assert.equal(prefs.music, 'theme'); assert.equal(button.on, false); assert.equal(button.checked, 'false'); assert.equal(director.fresh, true);
  run(.2); assert.equal(director.can, false); assert.equal(director.mode, 'theme'); assert.equal(director.key, 'theme', 'at once: no walk to another place is needed');
  html = audioRowsHtml({}); assert.match(html, /class="toggle " role="switch" aria-checked="false" aria-label="Live music"/);
  click({ target: { closest: () => button } }); assert.equal(prefs.music, ''); assert.equal(button.on, true); run(.2); assert.equal(director.can, true); assert.equal(director.mode, 'live');
  // Its Vietnamese is in the features' own table.
  const vi = (await import('../src/features-vi/music.ts')).default as Record<string, string>;
  for (const phrase of ['Live music', 'Tunes played for each place. Off: the recorded theme only.']) { assert.ok(vi[phrase] && vi[phrase] !== phrase, phrase); assert.ok(html.includes(phrase)); }
  // The preference: `theme` is theme only on any device, `live` the live score at any graphics level.
  for (const [wish, q, live] of [['theme', 'high', false], ['live', 'low', true], ['', 'low', false]] as const) {
    const made = fresh(), other = new AudioGraph(made.make), before = timers.length;
    mount({ ...services, audio: other, pref: () => wish, quality: () => q } as unknown as Parameters<typeof mount>[0]);
    made.ctx.currentTime = 1; timers[before].run(); assert.equal((other as unknown as { director: Director }).director.can, live, `music=${wish || '(unset)'} at ${q}`);
  }
  // A fetch that fails is tried again, later each time: after 30 s, then a minute after that.
  {
    const made = fresh(), other = new AudioGraph(made.make), before = timers.length, at: number[] = []; const from = clock;
    t.mock.method(globalThis, 'fetch', async () => { at.push(Math.round((clock - from) / 1000)); throw new Error('offline'); });
    mount({ ...services, audio: other, quality: () => 'low' } as unknown as Parameters<typeof mount>[0]);
    const lone = (other as unknown as { director: Director }).director;
    for (let i = 0; i < 1300; i++) { made.ctx.currentTime = i / 10; clock += 100; timers[before].run(); if (i % 50 === 0) await new Promise<void>(resolve => setImmediate(resolve)); }
    assert.equal(at.length, 3, `three tries in 130 s (at ${at.join(', ')} s)`); assert.ok(at[0] >= 20 && at[1] - at[0] >= 30 && at[2] - at[1] >= 60);
    assert.equal(lone.theme, null); assert.equal(lone.mode, 'lite'); assert.ok(lone.made >= 1 && lone.key === 'village~', 'meanwhile the live score stands in: Battery saver is not silent');
  }
});

test('the slider label says what it moves, in both languages', async () => {
  const { audioRowsHtml } = await import('../src/audio-settings.ts'), { VI_ECON } = await import('../src/locales/vi-econ.ts') as { VI_ECON: Record<string, string> };
  assert.match(audioRowsHtml({}), /<small>Music in the world and the cottage radio<\/small>/);
  assert.ok(VI_ECON['Music in the world and the cottage radio']); assert.ok(!('The cottage radio and its tunes' in VI_ECON));
});
