// The sound core (AAA-PLAN WP7): one AudioContext, four buses into the compressor, ducks that do not stack,
// a shared voice counter, and a radio that plays through the music bus so its slider works on an iPhone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sfx, AudioGraph, audioGraph, Voices, SoundGate, TOUCH_VOICES, ALL_SOUNDS, type Bus, type Sound } from '../src/sfx.ts';
import { audioLevels, AUDIO_DEFAULTS, parseAudio, radio } from '../src/audio-settings.ts';
import { installDuck, settle, watchRest, mount as mountMix } from '../src/features/sound-mix.ts';

const BUSES: Bus[] = ['sfx', 'ui', 'ambience', 'music'];

/** An AudioParam that keeps its schedule, so a test can ask for the value at any time. */
class FakeParam {
  events: { kind: 'set' | 'ramp'; value: number; time: number }[] = [];
  private base = 0;
  private clock: () => number;
  constructor(clock: () => number, base = 0) { this.clock = clock; this.base = base; }
  at(time: number) {
    let value = this.base, from = -Infinity;
    for (const e of [...this.events].sort((a, b) => a.time - b.time)) {
      if (e.kind === 'set') { if (e.time > time) break; value = e.value; from = e.time; }
      else if (e.time <= time) { value = e.value; from = e.time; }
      else { const start = Math.max(from, 0); return time <= start ? value : value + (e.value - value) * (time - start) / (e.time - start); }
    }
    return value;
  }
  get value() { return this.at(this.clock()); }
  set value(v: number) { this.base = v; this.events = []; }
  setValueAtTime(value: number, time: number) { this.events.push({ kind: 'set', value, time }); }
  linearRampToValueAtTime(value: number, time: number) { this.events.push({ kind: 'ramp', value, time }); }
  exponentialRampToValueAtTime(value: number, time: number) { this.events.push({ kind: 'ramp', value, time }); }
  cancelScheduledValues(time: number) { this.events = this.events.filter(e => e.time < time); }
}
class FakeNode {
  kind: string; to: unknown[] = []; started = 0; type = ''; buffer: unknown = null; fftSize = 0; media: unknown = null;
  gain: FakeParam; frequency: FakeParam; Q: FakeParam; pan: FakeParam; detune: FakeParam;
  threshold: FakeParam; knee: FakeParam; ratio: FakeParam; attack: FakeParam; release: FakeParam;
  context: FakeContext;
  constructor(context: FakeContext, kind: string) {
    this.context = context; this.kind = kind;
    const p = (base = 0) => new FakeParam(() => context.currentTime, base);
    this.gain = p(1); this.frequency = p(440); this.Q = p(1); this.pan = p(); this.detune = p();
    this.threshold = p(); this.knee = p(); this.ratio = p(); this.attack = p(); this.release = p();
  }
  connect(target: unknown) { this.to.push(target); return target; }
  start() { this.started++; }
  stop() {}
}
/** A recording WebAudio stand-in: every node, every connection and every schedule is kept. */
class FakeContext {
  static made = 0;
  currentTime = 0; sampleRate = 8000; state = 'running'; nodes: FakeNode[] = [];
  destination = new FakeNode(this, 'destination');
  calls = { suspend: 0, resume: 0 };
  constructor() { FakeContext.made++; }
  private node(kind: string) { const n = new FakeNode(this, kind); this.nodes.push(n); return n; }
  createOscillator() { return this.node('oscillator'); }
  createGain() { return this.node('gain'); }
  createBiquadFilter() { return this.node('filter'); }
  createBufferSource() { return this.node('buffer'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createAnalyser() { return this.node('analyser'); }
  createStereoPanner() { return this.node('panner'); }
  createMediaElementSource(element: unknown) { const n = this.node('media'); n.media = element; return n; }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
  async suspend() { this.calls.suspend++; this.state = 'suspended'; }
  async resume() { this.calls.resume++; this.state = 'running'; }
}
const fresh = () => { const ctx = new FakeContext(); return { ctx, make: () => ctx as unknown as AudioContext }; };
const node = (n: unknown) => n as FakeNode;
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
    const { ctx, make } = fresh(), sfx = new Sfx(make); sfx.random = () => .5; ctx.currentTime = 3;
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

test('the four buses follow the two sliders, and no bus adds a saved setting', () => {
  const { make } = fresh(), graph = new AudioGraph(make);
  assert.deepEqual([graph.sfx, graph.music], [AUDIO_DEFAULTS.sfxVolume, AUDIO_DEFAULTS.musicVolume], 'the graph starts at the default sliders');
  assert.deepEqual(BUSES.map(name => +graph.bus(name)!.gain.value.toFixed(4)), [.55, .55, .55, .45], 'the default sliders keep the old loudness');
  graph.sfx = .4; graph.music = 1;
  assert.deepEqual(BUSES.map(name => +graph.bus(name)!.gain.value.toFixed(4)), [.275, .275, .275, 1]);
  graph.music = 0; assert.equal(graph.bus('music')!.gain.value, 0, 'music slider at 0: music bus gain 0');
  assert.ok(graph.bus('sfx')!.gain.value > 0, 'the effects are untouched by the music slider');
  graph.music = 7; assert.equal(graph.bus('music')!.gain.value, 1, 'never above full level');
  assert.equal(graph.bus('music'), graph.bus('music'), 'one node per bus');
  const sfx = new Sfx(make); sfx.volume = .6; assert.equal(sfx.graph.sfx, .6, 'the effects player\'s volume is the graph\'s effects level');
  // The saved audio settings are the two volumes and the vibration switch, as before.
  assert.deepEqual(Object.keys(AUDIO_DEFAULTS).sort(), ['musicVolume', 'sfxVolume', 'vibrate']);
  assert.deepEqual(Object.keys(parseAudio({})).sort(), ['musicVolume', 'sfxVolume', 'sound', 'vibrate']);
});

test('duck lowers music 6 dB within 0.1 s and restores it; overlapping ducks hold one -6 dB until the later one ends', () => {
  const { ctx, make } = fresh(), graph = new AudioGraph(make);
  graph.music = 1; graph.sfx = .8;
  ctx.currentTime = 5; graph.duck('music', 6, 1); assert.equal(duckOf(graph, 'music').gain.at(5.5), 1, 'before the features mount a duck does nothing');
  installDuck(graph);
  const duck = duckOf(graph, 'music'), other = duckOf(graph, 'sfx'), low = 10 ** (-6 / 20);
  const dB = (t: number) => 20 * Math.log10(duck.gain.at(t) * node(graph.bus('music')).gain.value);
  assert.equal(dB(0), 0);
  ctx.currentTime = 10; graph.duck('music', 6, 1);
  assert.ok(Math.abs(dB(10.1) + 6) < .01, `6 dB down after 0.1 s (${dB(10.1)})`); assert.ok(dB(10.04) < 0 && dB(10.04) > -6, 'a short ramp, not a jump');
  assert.ok(Math.abs(dB(11) + 6) < .01, 'held to the end'); assert.ok(Math.abs(dB(11.3)) < 1e-9 && Math.abs(dB(20)) < 1e-9, 'restored');
  assert.equal(other.gain.at(10.5), 1, 'only the named bus ducks');
  ctx.currentTime = 20; graph.duck('music'); assert.ok(Math.abs(duck.gain.at(20.5) - low) < 1e-9 && duck.gain.at(21.4) === 1, 'the defaults: 6 dB for 1 s');

  // Two overlapping ducks: one -6 dB (not -12) until the later one ends.
  ctx.currentTime = 30; graph.duck('music', 6, 1);
  ctx.currentTime = 30.5; graph.duck('music', 6, 1);
  for (const t of [30.1, 30.5, 30.9, 31.2, 31.5]) assert.ok(Math.abs(duck.gain.at(t) - low) < 1e-9, `one -6 dB at ${t} (${duck.gain.at(t)})`);
  assert.ok(duck.gain.at(31.65) > low && duck.gain.at(31.65) < 1, 'coming back after the later one');
  assert.equal(duck.gain.at(31.8), 1);
  // A short duck inside a long one does not cut it short; a deeper one does not stack either.
  ctx.currentTime = 50; graph.duck('music', 6, 2);
  ctx.currentTime = 50.2; graph.duck('music', 6, .3); graph.duck('music', 12, .5);
  assert.ok(Math.abs(duck.gain.at(51.9) - low) < 1e-9); assert.equal(duck.gain.at(52.3), 1);
  // A duck that starts while the last one is still coming back goes down again from where the gain is.
  ctx.currentTime = 60; graph.duck('music', 6, 1); ctx.currentTime = 61.15; const mid = duck.gain.value; assert.ok(mid > low && mid < 1);
  graph.duck('music', 6, 1); assert.ok(Math.abs(duck.gain.at(61.15) - mid) < 1e-9, 'no jump'); assert.ok(Math.abs(duck.gain.at(61.23) - low) < 1e-9);
  assert.equal(duck.gain.at(62.45), 1);
  // Two buses duck on their own clocks.
  ctx.currentTime = 70; graph.duck('ambience', 6, 3); graph.duck('music', 6, 1);
  assert.equal(duck.gain.at(71.4), 1); assert.ok(Math.abs(duckOf(graph, 'ambience').gain.at(72.9) - low) < 1e-9);
  // Before any sound there is nothing to duck, and no context is made for it.
  let made = 0; const quiet = new AudioGraph(() => { made++; return fresh().make(); });
  installDuck(quiet); quiet.duck('music', 6, 1); assert.equal(made, 0);
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

test('the voice counter refuses a 7th voice on touch, and frees a voice when it ends', () => {
  assert.equal(TOUCH_VOICES, 6);
  const voices = new Voices(TOUCH_VOICES);
  for (let i = 0; i < 6; i++) assert.equal(voices.take(0, 1 + i * .1), true, `voice ${i + 1}`);
  assert.equal(voices.take(0, 5), false, 'the 7th is refused'); assert.equal(voices.live(.5), 6);
  assert.equal(voices.live(1.05), 5); assert.equal(voices.take(1.05, 2), true, 'a finished voice frees its place'); assert.equal(voices.take(1.05, 2), false);
  // The effects player counts on the graph's shared counter: on touch a brawl leaves one place for a fanfare, and never passes 6.
  const { ctx, make } = fresh(), sfx = new Sfx(make); sfx.graph.voices.budget = TOUCH_VOICES; ctx.currentTime = 4;
  const kinds: Sound[] = ['hit', 'crit', 'poof', 'swing', 'punch', 'shoot', 'zap', 'boom', 'pop', 'coin'];
  assert.equal(kinds.filter(k => sfx.play(k)).length, 5); assert.equal(sfx.play('level'), true, 'a level-up still sounds'); assert.equal(sfx.play('quest'), false);
  assert.equal(sfx.graph.voices.live(4), 6); assert.equal(sfx.stats.capped, 6);
  // Another player of the same graph (the ambience, the score) shares the count.
  assert.equal(sfx.graph.voices.take(4, 9), false); assert.equal(new SoundGate(sfx.graph.voices).admit('land', 4, 5), 'capped');
  ctx.currentTime = 8; assert.equal(sfx.graph.voices.live(8), 0); assert.equal(sfx.play('hit'), true);
  assert.equal(new AudioGraph(make).voices.budget, 18, 'not a touch device: the old 14 + 4');
  // A touch device (a coarse pointer) gets the budget of 6 from the start.
  const g = globalThis as Record<string, unknown>, before = g.matchMedia;
  g.matchMedia = (query: string) => ({ matches: query === '(pointer: coarse)' });
  try { assert.equal(new AudioGraph(make).voices.budget, 6); } finally { g.matchMedia = before; }
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
    graph.sfx = .8; assert.ok(graph.bus('sfx')); assert.equal(made, 1); assert.equal(ctx.state, 'running');
    // Both sliders to 0: asleep at the next input (letting a slider go is one); a slider back up and an input: awake.
    graph.sfx = 0; win.dispatchEvent(new Event('change')); assert.equal(ctx.state, 'suspended'); assert.equal(graph.rest, true);
    win.dispatchEvent(new Event('pointerdown')); assert.equal(ctx.state, 'suspended', 'an input with everything at 0 does not wake it');
    graph.bus('sfx'); graph.bus('music'); assert.equal(ctx.state, 'suspended', 'asking for a bus does not wake a resting context');
    audioLevels.music = .3; win.dispatchEvent(new Event('pointerdown')); assert.equal(ctx.state, 'running', 'music alone keeps it awake');
    assert.equal(graph.music, .3, 'the graph has the music slider'); assert.equal(graph.rest, false);
    audioLevels.music = 0; graph.sfx = .8; win.dispatchEvent(new Event('keydown')); assert.equal(ctx.state, 'running', 'effects alone too');
    // A hidden tab: asleep, also when something asks for a bus; back in view: awake (and at the latest on the next input).
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); assert.equal(ctx.state, 'suspended');
    graph.bus('sfx'); win.dispatchEvent(new Event('keydown')); assert.equal(ctx.state, 'suspended');
    doc.hidden = false; win.dispatchEvent(new Event('touchend')); assert.equal(ctx.state, 'running');
    // An iPhone's "interrupted" state (a call, the lock screen) wakes the same way; a closed context is left alone.
    ctx.state = 'interrupted'; win.dispatchEvent(new Event('touchend')); assert.equal(ctx.state, 'running');
    ctx.state = 'closed'; const resumes = ctx.calls.resume; win.dispatchEvent(new Event('touchend')); assert.equal(ctx.calls.resume, resumes);
    ctx.state = 'running';
    // The plain rule, and a browser whose suspend throws.
    assert.equal(settle(graph, false, 0), false); assert.equal(settle(graph, true, .5), true); graph.sfx = 0; assert.equal(settle(graph, false, 0), true); assert.equal(settle(graph, false, .5), false);
    const bad = fresh(); bad.ctx.suspend = () => { throw new Error('no'); }; const broken = new AudioGraph(bad.make); broken.bus('sfx');
    assert.equal(settle(broken, true, 1), true);
    // Stopped: nothing listens any more.
    stop(); graph.sfx = 0; audioLevels.music = 0; win.dispatchEvent(new Event('pointerdown')); doc.dispatchEvent(new Event('visibilitychange')); assert.equal(ctx.state, 'running');
    assert.equal(made, 1);
  } finally { audioLevels.music = before; }
});

test('one context: the effects, the radio theme and its stand-in tune all play through the shared graph', async () => {
  const g = globalThis as Record<string, unknown>, saved = { AudioContext: g.AudioContext, Audio: g.Audio, document: g.document, window: g.window }, before = audioLevels.music;
  let failing = false; const plays: FakeAudio[] = [];
  class FakeAudio { loop = false; volume = 1; paused = true; src: string; constructor(src: string) { this.src = src; } play() { plays.push(this); this.paused = false; return failing ? Promise.reject(new Error('no file')) : Promise.resolve(); } pause() { this.paused = true; } }
  g.AudioContext = FakeContext; g.Audio = FakeAudio; g.document = Object.assign(new EventTarget(), { hidden: false, documentElement: {} }); g.window = new EventTarget();
  FakeContext.made = 0;
  try {
    const { MusicBox, mount: mountRadio } = await import('../src/features/radio.ts');
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
    audioLevels.music = .2; box.tick(.016); assert.equal(music.gain.value, .2, 'the slider moves the bus'); assert.equal(theme.volume, 1);
    audioLevels.music = 0; box.tick(.016); assert.equal(music.gain.value, 0, 'music slider at 0: music bus gain 0'); assert.equal(theme.volume, 1);
    // A duck (a stinger, a talk bar) lowers the radio too, because it is on the music bus.
    audioLevels.music = 1; box.tick(.016); graph.duck('music', 6, 1); ctx.currentTime += .1;
    assert.ok(Math.abs(node(music.to[0]).gain.value - 10 ** (-6 / 20)) < 1e-9);
    box.stop(); assert.equal(theme.paused, true); box.start(); assert.equal(ctx.nodes.filter(n => n.kind === 'media').length, 1, 'switched on again: the same element and node');
    box.stop();

    // No theme file (offline, never played): the stand-in tune plays its notes into the same bus.
    failing = true; audioLevels.music = .45;
    const spare = new MusicBox(graph); spare.start(); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
    assert.equal(spare.playing, true); ctx.currentTime += 5;
    const oscillators = () => ctx.nodes.filter(n => n.kind === 'oscillator' && n.started && reach(n).has(music)).length, quiet = oscillators();
    const live = graph.voices.live(ctx.currentTime); spare.tick(.016);
    assert.equal(oscillators(), quiet + 1, 'a note on the music bus'); assert.equal(graph.voices.live(ctx.currentTime), live + 1, 'counted as a live voice');
    spare.stop();
    assert.equal(FakeContext.made, 1, 'a fight plus a radio play: still one AudioContext');
    assert.deepEqual(ctx.nodes.filter(n => n.to.includes(ctx.destination)).map(n => n.kind), ['compressor'], 'nothing goes around the mix');
  } finally { g.AudioContext = saved.AudioContext; g.Audio = saved.Audio; g.document = saved.document; g.window = saved.window; audioLevels.music = before; radio.box = undefined; }
});

test('without WebAudio the radio still plays, on the element\'s own volume', async () => {
  const g = globalThis as Record<string, unknown>, saved = { Audio: g.Audio, document: g.document }, before = audioLevels.music;
  class FakeAudio { loop = false; volume = 1; src: string; constructor(src: string) { this.src = src; } play() { return Promise.resolve(); } pause() {} }
  g.Audio = FakeAudio; g.document = Object.assign(new EventTarget(), { hidden: false, documentElement: {} });
  try {
    const { MusicBox } = await import('../src/features/radio.ts');
    audioLevels.music = .45; const box = new MusicBox(new AudioGraph(() => { throw new Error('no WebAudio'); })); box.start();
    const theme = (box as unknown as { theme: FakeAudio }).theme; assert.equal(theme.volume, .45);
    audioLevels.music = .2; box.tick(.016); assert.equal(theme.volume, .2);
    // A context that cannot route an element (an old browser): the same.
    const { ctx, make } = fresh(); (ctx as unknown as { createMediaElementSource: unknown }).createMediaElementSource = () => { throw new Error('unsupported'); };
    audioLevels.music = .45; const old = new MusicBox(new AudioGraph(make)); old.start();
    assert.equal((old as unknown as { theme: FakeAudio }).theme.volume, .45); audioLevels.music = .3; old.tick(.016); assert.equal((old as unknown as { theme: FakeAudio }).theme.volume, .3);
  } finally { g.Audio = saved.Audio; g.document = saved.document; audioLevels.music = before; }
});
