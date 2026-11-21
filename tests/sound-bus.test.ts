// The sound core (AAA-PLAN WP7): one AudioContext, four buses into the compressor, ducks that do not stack,
// a shared voice counter, and a radio that plays through the music bus so its slider works on an iPhone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sfx, AudioGraph, audioGraph, Voices, SoundGate, TOUCH_VOICES, ALL_SOUNDS, type Bus, type Sound } from '../src/sfx.ts';
import { audioLevels, AUDIO_DEFAULTS, parseAudio, radio } from '../src/audio-settings.ts';
import { installMix, settle, watchRest, mount as mountMix } from '../src/features-audio/sound-mix.ts';
import { FakeContext, FakeNode, fresh, node, near } from './support/fake-audio.ts';

const BUSES: Bus[] = ['sfx', 'ui', 'ambience', 'music'];

/** Every node an output can reach by following connections (AudioParams are not nodes and end the walk). */
function reach(from: FakeNode) {
  const seen = new Set<FakeNode>(), walk = (n: FakeNode) => { for (const t of n.to) if (t instanceof FakeNode && !seen.has(t)) { seen.add(t); walk(t); } };
  walk(from); return seen;
}
const busNodes = (graph: AudioGraph) => new Map(BUSES.map(name => [name, node(graph.bus(name))] as const));
/** The node after a bus: its duck gain. */
const duckOf = (graph: AudioGraph, name: Bus) => node(graph.bus(name)).to[0] as FakeNode;

test('every voice reaches exactly one bus: click, open and close on ui, the rest on sfx, with or without pan', () => {
  for (const pan of [undefined, -.5]) for (const sound of ALL_SOUNDS) {
    const { ctx, make } = fresh(), sfx = new Sfx(make); sfx.random = () => .5; ctx.currentTime = 3; installMix(sfx.graph);
    assert.equal(sfx.play(sound, pan === undefined ? undefined : { pan }), true, sound);
    const buses = busNodes(sfx.graph), want = ['click', 'open', 'close'].includes(sound) ? 'ui' : 'sfx';
    const sources = ctx.nodes.filter(n => n.started > 0);
    assert.ok(sources.length > 0, `${sound} starts sources`);
    let audible = 0;
    for (const source of sources) {
      const all = reach(source), hit = BUSES.filter(name => all.has(buses.get(name)!));
      if (!hit.length) { assert.ok(reach(source).size <= 1 && !all.has(ctx.destination), `${sound}: a source that reaches no bus only modulates another`); continue; }
      audible++; assert.deepEqual(hit, [want], `${sound} plays on the ${want} bus only`);
      assert.ok(all.has(ctx.destination), `${sound} reaches the speakers`);
      if (pan !== undefined) assert.ok([...all].some(n => n.kind === 'panner' && n.pan.value === pan), `${sound} goes through its panner`);
    }
    assert.ok(audible > 0, `${sound} is heard`);
    // Nothing goes around the mix: only the compressor feeds the speakers, and only the four ducks feed the compressor.
    assert.deepEqual(ctx.nodes.filter(n => n.to.includes(ctx.destination)).map(n => n.kind), ['compressor']);
    const compressor = ctx.nodes.find(n => n.kind === 'compressor')!;
    assert.deepEqual(ctx.nodes.filter(n => n.to.includes(compressor)), BUSES.map(name => buses.get(name)!.to[0]));
  }
});

test('the four buses follow the two sliders without a step, and no bus adds a saved setting', () => {
  const { ctx, make } = fresh(), graph = new AudioGraph(make); installMix(graph);
  /** Asks for every bus (which applies the sliders), lets 1 s pass, and reads the gains. */
  const levels = () => { for (const name of BUSES) graph.bus(name); ctx.currentTime += 1; return BUSES.map(name => +node(graph.nodes[name]!.bus).gain.value.toFixed(4)); };
  assert.deepEqual([graph.sfx, graph.music], [AUDIO_DEFAULTS.sfxVolume, AUDIO_DEFAULTS.musicVolume], 'the graph starts at the default sliders');
  assert.deepEqual(BUSES.map(name => +graph.bus(name)!.gain.value.toFixed(4)), [.55, .55, .55, .45], 'the default sliders keep the old loudness, from the first moment');
  graph.sfx = .4; graph.music = 1;
  const music = node(graph.bus('music')), at = ctx.currentTime;
  assert.ok(near(music.gain.at(at), .45), 'a moved slider does not step the gain'); assert.ok(music.gain.at(at + .02) > .45 && music.gain.at(at + .02) < 1, 'it glides');
  assert.deepEqual(levels(), [.275, .275, .275, 1]);
  graph.music = 0; graph.bus('music'); ctx.currentTime += .2; assert.equal(music.gain.value, 0, 'music slider at 0: music bus gain exactly 0');
  assert.ok(node(graph.bus('sfx')).gain.value > 0, 'the effects are untouched by the music slider');
  assert.equal(graph.bus('music'), graph.bus('music'), 'one node per bus');
  for (const name of BUSES) assert.equal(node(graph.nodes[name]!.bus).gain.steps, 1, `${name}: set outright once, when the bus is made`);
  const sfx = new Sfx(make); sfx.volume = .6; assert.equal(sfx.graph.sfx, .6, 'the effects player\'s volume is the graph\'s effects level');
  // The saved audio settings are the two volumes and the vibration switch, as before.
  assert.deepEqual(Object.keys(AUDIO_DEFAULTS).sort(), ['musicVolume', 'sfxVolume', 'vibrate']);
  assert.deepEqual(Object.keys(parseAudio({})).sort(), ['musicVolume', 'sfxVolume', 'sound', 'vibrate']);
});

test('duck lowers music 6 dB within 0.1 s and restores it; overlapping ducks hold one -6 dB until the later one ends', () => {
  const { ctx, make } = fresh(), graph = new AudioGraph(make);
  graph.music = 1; graph.sfx = .8;
  ctx.currentTime = 5; graph.duck('music', 6, 1); assert.equal(duckOf(graph, 'music').gain.at(5.5), 1, 'before the features mount a duck does nothing');
  installMix(graph);
  const duck = duckOf(graph, 'music'), other = duckOf(graph, 'sfx'), low = 10 ** (-6 / 20);
  const dB = (t: number) => 20 * Math.log10(duck.gain.at(t) * node(graph.bus('music')).gain.value);
  assert.equal(dB(0), 0);
  ctx.currentTime = 10; graph.duck('music', 6, 1);
  assert.ok(Math.abs(dB(10.1) + 6) < .1, `6 dB down after 0.1 s (${dB(10.1)})`); assert.ok(dB(10.01) < 0 && dB(10.01) > -6, 'a short glide, not a jump'); assert.ok(near(duck.gain.at(10), 1), 'from where it was');
  assert.ok(Math.abs(dB(11) + 6) < .001, 'held to the end'); assert.ok(dB(11.1) > -4 && dB(11.1) < 0, 'coming back'); assert.ok(Math.abs(dB(12)) < .001 && Math.abs(dB(20)) < 1e-9, 'restored');
  assert.equal(other.gain.at(10.5), 1, 'only the named bus ducks');
  ctx.currentTime = 20; graph.duck('music'); assert.ok(near(duck.gain.at(20.5), low) && near(duck.gain.at(22.2), 1, 1e-4), 'the defaults: 6 dB for 1 s');

  // Two overlapping ducks: one -6 dB (not -12) until the later one ends.
  ctx.currentTime = 30; graph.duck('music', 6, 1);
  ctx.currentTime = 30.5; graph.duck('music', 6, 1);
  for (const t of [30.1, 30.5, 30.9, 31.2, 31.5]) assert.ok(near(duck.gain.at(t), low, .005), `one -6 dB at ${t} (${duck.gain.at(t)})`);
  assert.ok(duck.gain.at(31.65) > low + .1 && duck.gain.at(31.65) < 1, 'coming back after the later one');
  assert.ok(near(duck.gain.at(32.7), 1, 1e-4));
  // A short duck inside a long one does not cut it short; a deeper one does not stack either.
  ctx.currentTime = 50; graph.duck('music', 6, 2);
  ctx.currentTime = 50.2; graph.duck('music', 6, .3); graph.duck('music', 12, .5);
  assert.ok(near(duck.gain.at(51.9), low)); assert.ok(near(duck.gain.at(53.2), 1, 1e-4));
  // A duck that starts while the last one is still coming back goes down again from where the gain is: no jump, and
  // the code never reads the gain back to do it.
  ctx.currentTime = 60; graph.duck('music', 6, 1); ctx.currentTime = 61.15; const mid = duck.gain.at(61.15); assert.ok(mid > low + .1 && mid < 1);
  graph.duck('music', 6, 1); assert.ok(near(duck.gain.at(61.15), mid), 'no jump'); assert.ok(near(duck.gain.at(61.25), low, .005)); assert.ok(duck.gain.at(61.17) < mid);
  assert.ok(near(duck.gain.at(63.4), 1, 1e-4));
  // Two buses duck on their own clocks.
  ctx.currentTime = 70; graph.duck('ambience', 6, 3); graph.duck('music', 6, 1);
  assert.ok(near(duck.gain.at(72.2), 1, 1e-4)); assert.ok(near(duckOf(graph, 'ambience').gain.at(72.9), low));
  // Glides only: no ramp, no step, no direct write on a duck gain.
  for (const name of BUSES) { const g = node(graph.nodes[name]?.duck)?.gain; if (g) { assert.equal(g.steps, 0, name); assert.ok(g.events.every(e => e.kind === 'target'), name); } }
  // Before any sound there is nothing to duck, and no context is made for it.
  let made = 0; const quiet = new AudioGraph(() => { made++; return fresh().make(); });
  installMix(quiet); quiet.duck('music', 6, 1); assert.equal(made, 0);
});

test('detune passes through: 1200 cents doubles every pitch of the sound, 0 changes nothing', () => {
  const pitches = (sound: Sound, detune?: number) => {
    const { ctx, make } = fresh(), sfx = new Sfx(make); sfx.random = () => .5; ctx.currentTime = 2;
    sfx.play(sound, detune === undefined ? undefined : { detune });
    return ctx.nodes.filter(n => n.kind === 'oscillator' || n.kind === 'filter').flatMap(n => n.frequency.events.length ? n.frequency.events.map(e => e.value) : [n.frequency.at(0)]);
  };
  for (const sound of ['pop', 'coin', 'swing', 'level'] as Sound[]) {
    const plain = pitches(sound), up = pitches(sound, 1200), down = pitches(sound, -1200), same = pitches(sound, 0);
    assert.ok(plain.length > 1); assert.deepEqual(same, plain);
    plain.forEach((f, i) => { if (f > 45) { assert.ok(Math.abs(up[i] / f - 2) < 1e-9, `${sound} up an octave`); assert.ok(down[i] <= f, `${sound} down`); } });
  }
  const cents = pitches('pop', 100)[1] / pitches('pop')[1];
  assert.ok(Math.abs(cents - 2 ** (1 / 12)) < 1e-9, 'detune is in cents');
});

test('the voice counter refuses a 7th voice of six, a touch device has 8 ordinary voices and 2 more for priority cues, and a tap is never starved', () => {
  assert.equal(TOUCH_VOICES, 8);
  const voices = new Voices(6, 0);
  for (let i = 0; i < 6; i++) assert.equal(voices.take(0, 1 + i * .1), true, `voice ${i + 1}`);
  assert.equal(voices.take(0, 5), false, 'the 7th is refused'); assert.equal(voices.live(.5), 6); assert.equal(voices.capped, 1);
  assert.equal(voices.live(1.05), 5); assert.equal(voices.take(1.05, 2), true, 'a finished voice frees its place'); assert.equal(voices.take(1.05, 2), false);
  // A touch device (a coarse pointer): 8 ordinary voices (6 until a twelve-creature fight was measured: 5 to 9 sounds refused) and 2 more for priority cues.
  const g = globalThis as Record<string, unknown>, before = g.matchMedia;
  g.matchMedia = (query: string) => ({ matches: query === '(pointer: coarse)' });
  let touch: Sfx; const { ctx, make } = fresh();
  try { touch = new Sfx(make); } finally { g.matchMedia = before; }
  const pool = touch.graph.voices; assert.deepEqual([pool.budget, pool.reserve], [TOUCH_VOICES + 2, 2]);
  ctx.currentTime = 4;
  const kinds: Sound[] = ['hit', 'crit', 'poof', 'swing', 'punch', 'shoot', 'zap', 'boom', 'pop', 'coin'];
  assert.equal(kinds.filter(k => touch.play(k)).length, 8, 'eight fight sounds at once');
  assert.equal(pool.take(4, 9), false, 'another ordinary player of the same graph (the ambience, the score, the radio\'s stand-in tune) gets no priority place');
  assert.equal(new SoundGate(pool).admit('land', 4, 5), 'capped');
  assert.equal(touch.play('level'), true, 'a level-up still sounds'); assert.equal(touch.play('quest'), true, 'and a quest chime with it'); assert.equal(touch.play('hurt'), false, 'the 11th voice is refused');
  assert.equal(pool.live(4), 10);
  // Taps are not starved by a fight: the ui sounds take no voice and need none.
  assert.equal(touch.play('click'), true); assert.equal(touch.play('open'), true); assert.equal(pool.live(4), 10);
  assert.equal(touch.stats.capped, 3); assert.equal(touch.graph.stats.capped, 5, 'the graph counts every refusal: the effects\' 3 and the two direct asks'); assert.equal(touch.graph.stats, pool);
  ctx.currentTime = 8; assert.equal(pool.live(8), 0); assert.equal(touch.play('hit'), true);
  // Not a touch device: the old 14 + 4.
  const desk = new AudioGraph(make).voices; assert.deepEqual([desk.budget, desk.reserve], [18, 4]);
});

test('the first touch or key builds the context once and plays a silent sample (the phone unlock)', () => {
  const g = globalThis as Record<string, unknown>, saved = g.window, win = new EventTarget();
  g.window = win;
  try {
    const { ctx, make } = fresh(); let made = 0;
    const graph = new AudioGraph(() => { made++; return make(); }); ctx.state = 'suspended'; graph.listen();
    assert.equal(made, 0, 'nothing before a gesture');
    win.dispatchEvent(new Event('touchend')); assert.equal(made, 1); assert.equal(ctx.state, 'running', 'resumed inside the gesture');
    assert.equal(ctx.nodes.filter(n => n.kind === 'buffer' && n.started).length, 1);
    win.dispatchEvent(new Event('pointerdown')); win.dispatchEvent(new Event('keydown')); assert.equal(ctx.nodes.filter(n => n.kind === 'buffer').length, 1, 'only once');
    // Both sliders at 0: the gesture builds nothing.
    let quietMade = 0; const quiet = new AudioGraph(() => { quietMade++; return fresh().make(); }); quiet.sfx = 0; quiet.music = 0; quiet.listen();
    win.dispatchEvent(new Event('keydown')); assert.equal(quietMade, 0);
  } finally { g.window = saved; }
});

test('the context sleeps while both sliders are at 0 or the tab is hidden, and wakes on the next input', () => {
  const win = new EventTarget(), doc = Object.assign(new EventTarget(), { hidden: false }), before = audioLevels.music;
  const { ctx, make } = fresh(); let made = 0;
  const graph = new AudioGraph(() => { made++; return make(); });
  try {
    audioLevels.music = 0; graph.sfx = 0;
    const stop = watchRest(graph, win as unknown as Window, doc as unknown as Document);
    assert.equal(graph.rest, true); win.dispatchEvent(new Event('pointerdown')); assert.equal(made, 0, 'watching never builds a context');
    graph.sfx = .8; assert.equal(graph.rest, false, 'a slider up: no longer resting, before any event says so'); assert.ok(graph.bus('sfx')); assert.equal(made, 1); assert.equal(ctx.state, 'running');
    // Both sliders to 0: asleep at the next input (dragging a slider or letting it go is one); a slider back up and an input: awake.
    graph.sfx = 0; win.dispatchEvent(new Event('input')); assert.equal(ctx.state, 'suspended', 'dragging the last slider to 0'); assert.equal(graph.rest, true);
    ctx.state = 'running'; win.dispatchEvent(new Event('change')); assert.equal(ctx.state, 'suspended', 'letting it go');
    win.dispatchEvent(new Event('pointerdown')); assert.equal(ctx.state, 'suspended', 'an input with everything at 0 does not wake it');
    graph.bus('sfx'); graph.bus('music'); assert.equal(ctx.state, 'suspended', 'asking for a bus does not wake a resting context');
    audioLevels.music = .3; win.dispatchEvent(new Event('pointerdown')); assert.equal(ctx.state, 'running', 'music alone keeps it awake');
    assert.equal(graph.music, .3, 'the graph has the music slider'); assert.equal(graph.rest, false);
    audioLevels.music = 0; graph.sfx = .8; win.dispatchEvent(new Event('keydown')); assert.equal(ctx.state, 'running', 'effects alone too');
    // Awake means resume() every time: a suspend() asked a moment ago may not show in the state yet.
    const resumes = ctx.calls.resume; win.dispatchEvent(new Event('keydown')); assert.equal(ctx.calls.resume, resumes + 1, 'resume although the state says running');
    // A hidden tab: asleep, also when something asks for a bus; back in view: awake (and at the latest on the next input).
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); assert.equal(ctx.state, 'suspended'); assert.equal(graph.hidden, true);
    graph.bus('sfx'); win.dispatchEvent(new Event('keydown')); assert.equal(ctx.state, 'suspended');
    doc.hidden = false; win.dispatchEvent(new Event('touchend')); assert.equal(ctx.state, 'running');
    // An iPhone's "interrupted" state (a call, the lock screen) wakes the same way, on an input or when a sound asks for its bus; a closed context is left alone.
    ctx.state = 'interrupted'; win.dispatchEvent(new Event('touchend')); assert.equal(ctx.state, 'running');
    ctx.state = 'interrupted'; graph.bus('sfx'); assert.equal(ctx.state, 'running');
    ctx.state = 'closed'; const closed = ctx.calls.resume; win.dispatchEvent(new Event('touchend')); assert.equal(ctx.calls.resume, closed);
    ctx.state = 'running';
    // The plain rule, and a browser whose suspend throws.
    assert.equal(settle(graph, false, 0), false); assert.equal(settle(graph, true, .5), true); graph.sfx = 0; assert.equal(settle(graph, false, 0), true); assert.equal(settle(graph, false, .5), false);
    const bad = fresh(); bad.ctx.suspend = () => { throw new Error('no'); }; const broken = new AudioGraph(bad.make); broken.bus('sfx');
    assert.equal(settle(broken, true, 1), true);
    // Stopped: nothing listens any more.
    stop(); graph.sfx = 0; audioLevels.music = 0; for (const e of ['pointerdown', 'input', 'change']) win.dispatchEvent(new Event(e)); doc.dispatchEvent(new Event('visibilitychange')); assert.equal(ctx.state, 'running');
    assert.equal(made, 1);
  } finally { audioLevels.music = before; }
  // The effects slider's preview from 0/0: the click the drag plays is heard at once, though nothing has settled the graph yet.
  const quiet = fresh(), sfx = new Sfx(quiet.make);
  assert.equal(sfx.play('click'), true); sfx.volume = 0; assert.equal(settle(sfx.graph, false, 0), true); assert.equal(quiet.ctx.state, 'suspended');
  assert.equal(sfx.play('click'), false, 'muted at 0'); quiet.ctx.currentTime = 1;
  sfx.volume = .5; assert.equal(sfx.play('click'), true, 'the preview click plays'); assert.equal(quiet.ctx.state, 'running', 'and wakes the context');
  // A hidden tab skips effects: its clock is stopped, and they would all play at once on the way back.
  settle(sfx.graph, true, 0); quiet.ctx.currentTime = 2; assert.equal(sfx.play('hit'), false); settle(sfx.graph, false, 0); assert.equal(sfx.play('hit'), true);
});

test('one context: the effects, the radio theme and its stand-in tune all play through the shared graph', async () => {
  const g = globalThis as Record<string, unknown>, saved = { AudioContext: g.AudioContext, Audio: g.Audio, document: g.document, window: g.window }, before = audioLevels.music;
  let failing = false; const plays: FakeAudio[] = [];
  class FakeAudio { loop = false; volume = 1; paused = true; src: string; constructor(src: string) { this.src = src; } play() { plays.push(this); this.paused = false; return failing ? Promise.reject(new Error('no file')) : Promise.resolve(); } pause() { this.paused = true; } }
  g.AudioContext = FakeContext; g.Audio = FakeAudio; g.document = Object.assign(new EventTarget(), { hidden: false, documentElement: {} }); g.window = new EventTarget();
  FakeContext.made = 0;
  try {
    const { MusicBox, mount: mountRadio } = await import('../src/features-audio/radio.ts');
    const graph = audioGraph(); assert.equal(graph, audioGraph());
    audioLevels.music = .45;
    const sfx = new Sfx(); assert.equal(sfx.graph, graph, 'the game\'s effects use the shared graph');
    assert.equal(sfx.play('hit'), true); assert.equal(sfx.play('click'), true);
    const ctx = graph.ctx as unknown as FakeContext; assert.equal(FakeContext.made, 1);
    // The features mount with the game's graph (services.audio): duck and rest arrive, and the radio gets its player.
    mountMix({ audio: graph }); radio.box = undefined; mountRadio({ audio: graph });
    const box = radio.box as InstanceType<typeof MusicBox>; assert.ok(box instanceof MusicBox); assert.equal(box.playing, false);
    mountRadio({ audio: graph }); assert.equal(radio.box, box, 'one player');

    // The radio: the theme element feeds the music bus, and the slider is the bus gain (an iPhone ignores element.volume).
    box.tick(.016); assert.equal(plays.length, 0, 'nothing plays until it is switched on'); box.start(); assert.equal(box.playing, true);
    const theme = plays[0]; assert.ok(theme && /zoo-garden-theme\.mp3/.test(theme.src)); assert.equal(theme.loop, true);
    const media = ctx.nodes.filter(n => n.kind === 'media'); assert.equal(media.length, 1); assert.equal(media[0].media, theme);
    const music = node(graph.bus('music')), trim = node(media[0].to[0]); assert.equal(media[0].to.length, 1); assert.deepEqual(trim.to, [music], 'element -> trim -> music bus'); assert.equal(trim.gain.value, MusicBox.TRIM);
    assert.equal(theme.volume, 1, 'the element stays at full level'); assert.equal(music.gain.value, .45);
    audioLevels.music = .2; box.tick(.016); ctx.currentTime += .5; assert.equal(music.gain.value, .2, 'the slider moves the bus'); assert.equal(theme.volume, 1);
    audioLevels.music = 0; box.tick(.016); ctx.currentTime += .5; assert.equal(music.gain.value, 0, 'music slider at 0: music bus gain 0'); assert.equal(theme.volume, 1);
    // A duck (a stinger, a talk bar) lowers the radio too, because it is on the music bus.
    audioLevels.music = 1; box.tick(.016); graph.duck('music', 6, 1); ctx.currentTime += .2;
    assert.ok(near(node(music.to[0]).gain.value, 10 ** (-6 / 20), 1e-4));
    box.stop(); assert.equal(theme.paused, true); box.start(); assert.equal(ctx.nodes.filter(n => n.kind === 'media').length, 1, 'switched on again: the same element and node');
    box.stop();

    // No theme file (offline, never played): the stand-in tune plays its notes into the same bus.
    failing = true; audioLevels.music = .45;
    const spare = new MusicBox(graph); spare.start(); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
    assert.equal(spare.playing, true); ctx.currentTime += 5;
    const oscillators = () => ctx.nodes.filter(n => n.kind === 'oscillator' && n.started && reach(n).has(music)).length, quiet = oscillators();
    const live = graph.voices.live(ctx.currentTime); spare.tick(.016);
    assert.equal(oscillators(), quiet + 1, 'a note on the music bus'); assert.equal(graph.voices.live(ctx.currentTime), live + 1, 'counted as a live voice');
    // Its notes are ordinary voices: with the ordinary places full it stays silent and leaves the priority places alone.
    ctx.currentTime += 5; const pool = graph.voices; while (pool.take(ctx.currentTime, ctx.currentTime + 9)) { /* fill the ordinary places */ }
    assert.equal(pool.live(ctx.currentTime), pool.budget - pool.reserve); const full = oscillators();
    spare.tick(1); spare.tick(1); assert.equal(oscillators(), full, 'no note over a full fight'); assert.equal(pool.take(ctx.currentTime, ctx.currentTime + 1, true), true, 'a priority cue still has its place');
    spare.stop();
    assert.equal(FakeContext.made, 1, 'a fight plus a radio play: still one AudioContext');
    assert.deepEqual(ctx.nodes.filter(n => n.to.includes(ctx.destination)).map(n => n.kind), ['compressor'], 'nothing goes around the mix');

    // The radio switched on before the features came (house-life.ts sets `want`): it starts when they mount.
    failing = false; radio.box = undefined; radio.want = true; const asked = plays.length;
    mountRadio({ audio: graph }); const late = radio.box as InstanceType<typeof MusicBox>;
    assert.equal(late.playing, true, 'the radio the player asked for plays'); assert.equal(radio.want, false); assert.equal(plays.length, asked + 1);
    late.stop(); mountRadio({ audio: graph }); assert.equal(late.playing, false, 'only once');
  } finally { g.AudioContext = saved.AudioContext; g.Audio = saved.Audio; g.document = saved.document; g.window = saved.window; audioLevels.music = before; radio.box = undefined; radio.want = false; }
});

test('a pause before play() settles (AbortError) does not lock the radio to its stand-in tune; a real failure does', async () => {
  const g = globalThis as Record<string, unknown>, saved = { Audio: g.Audio, document: g.document }, before = audioLevels.music;
  const answers: (Error | null)[] = []; let made = 0;
  class FakeAudio { loop = false; volume = 1; src: string; constructor(src: string) { this.src = src; made++; } play() { const error = answers.shift(); return error ? Promise.reject(error) : Promise.resolve(); } pause() {} }
  g.Audio = FakeAudio; g.document = Object.assign(new EventTarget(), { hidden: false, documentElement: {} });
  const settled = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };
  try {
    const { MusicBox } = await import('../src/features-audio/radio.ts');
    const { ctx, make } = fresh(), box = new MusicBox(new AudioGraph(make)), inside = box as unknown as { theme: FakeAudio | null; fallback: boolean };
    audioLevels.music = .45;
    // On and off at once: the browser rejects play() with AbortError.
    answers.push(Object.assign(new Error('The play() request was interrupted by a call to pause().'), { name: 'AbortError' }));
    box.start(); box.stop(); await settled();
    assert.equal(inside.fallback, false, 'not the stand-in tune'); assert.ok(inside.theme, 'the theme element is kept'); assert.equal(box.playing, false);
    // The same while it should be playing (a hidden tab paused it): it stays the theme and is not restarted as the stand-in.
    answers.push(Object.assign(new Error('interrupted'), { name: 'AbortError' }));
    box.start(); await settled(); assert.equal(inside.fallback, false); assert.equal(box.playing, true); assert.equal(made, 1);
    box.stop(); box.start(); await settled(); assert.equal(inside.fallback, false, 'switched on again: the theme'); assert.equal(made, 1, 'the same element');
    assert.equal(ctx.nodes.filter(n => n.kind === 'oscillator').length, 0, 'no stand-in note was ever made');
    // A file that cannot play (offline and never kept, an unsupported type): the stand-in tune, from then on.
    box.stop(); answers.push(Object.assign(new Error('no supported source'), { name: 'NotSupportedError' }));
    box.start(); await settled(); assert.equal(inside.fallback, true); assert.equal(inside.theme, null); assert.equal(box.playing, true);
    ctx.currentTime += 1; box.tick(1); assert.equal(ctx.nodes.filter(n => n.kind === 'oscillator' && n.started).length, 1);
  } finally { g.Audio = saved.Audio; g.document = saved.document; audioLevels.music = before; }
});

test('without WebAudio the radio still plays, on the element\'s own volume', async () => {
  const g = globalThis as Record<string, unknown>, saved = { Audio: g.Audio, document: g.document }, before = audioLevels.music;
  class FakeAudio { loop = false; volume = 1; src: string; constructor(src: string) { this.src = src; } play() { return Promise.resolve(); } pause() {} }
  g.Audio = FakeAudio; g.document = Object.assign(new EventTarget(), { hidden: false, documentElement: {} });
  try {
    const { MusicBox } = await import('../src/features-audio/radio.ts');
    audioLevels.music = .45; const box = new MusicBox(new AudioGraph(() => { throw new Error('no WebAudio'); })); box.start();
    const theme = (box as unknown as { theme: FakeAudio }).theme; assert.equal(theme.volume, .45);
    audioLevels.music = .2; box.tick(.016); assert.equal(theme.volume, .2);
    // A context that cannot route an element (an old browser): the same.
    const { ctx, make } = fresh(); (ctx as unknown as { createMediaElementSource: unknown }).createMediaElementSource = () => { throw new Error('unsupported'); };
    audioLevels.music = .45; const old = new MusicBox(new AudioGraph(make)); old.start();
    assert.equal((old as unknown as { theme: FakeAudio }).theme.volume, .45); audioLevels.music = .3; old.tick(.016); assert.equal((old as unknown as { theme: FakeAudio }).theme.volume, .3);
  } finally { g.Audio = saved.Audio; g.document = saved.document; audioLevels.music = before; }
});
