// A recording WebAudio stand-in for the sound tests (sound-bus.test.ts, sound-mix.test.ts): every node, every connection
// and every schedule is kept, and a parameter can be asked for its value at any time.
/** An AudioParam that keeps its schedule (steps, ramps and setTargetAtTime glides), so a test can ask for the value at any time. */
export class FakeParam {
  events: { kind: 'set' | 'ramp' | 'target'; value: number; time: number; tau?: number }[] = [];
  /** Direct `.value = x` writes, to prove a playing gain is never stepped. */
  steps = 0;
  private base = 0;
  private clock: () => number;
  constructor(clock: () => number, base = 0) { this.clock = clock; this.base = base; }
  at(time: number) {
    // `value` holds until an event; a target event makes it glide: value(t) = goal + (from - goal) * exp(-(t - t0) / tau).
    let value = this.base, glide: { from: number; goal: number; t0: number; tau: number } | null = null, last = -Infinity;
    const now = (t: number) => glide ? glide.goal + (glide.from - glide.goal) * Math.exp(-(t - glide.t0) / glide.tau) : value;
    for (const e of [...this.events].sort((a, b) => a.time - b.time)) {
      if (e.kind === 'ramp') {
        if (e.time <= time) { value = e.value; glide = null; last = e.time; continue; }
        const start = Math.max(last, 0), from = now(start); return time <= start ? from : from + (e.value - from) * (time - start) / (e.time - start);
      }
      if (e.time > time) break;
      if (e.kind === 'set') { value = e.value; glide = null; } else { const from = now(e.time); glide = { from, goal: e.value, t0: e.time, tau: e.tau! }; }
      last = e.time;
    }
    return now(time);
  }
  get value() { return this.at(this.clock()); }
  set value(v: number) { this.steps++; this.base = v; this.events = []; }
  setValueAtTime(value: number, time: number) { this.events.push({ kind: 'set', value, time }); }
  setTargetAtTime(value: number, time: number, tau: number) { this.events.push({ kind: 'target', value, time, tau }); }
  linearRampToValueAtTime(value: number, time: number) { this.events.push({ kind: 'ramp', value, time }); }
  exponentialRampToValueAtTime(value: number, time: number) { this.events.push({ kind: 'ramp', value, time }); }
  cancelScheduledValues(time: number) { this.events = this.events.filter(e => e.time < time); }
}
export class FakeNode {
  kind: string; to: unknown[] = []; started = 0; type = ''; buffer: unknown = null; fftSize = 0; media: unknown = null;
  gain: FakeParam; frequency: FakeParam; Q: FakeParam; pan: FakeParam; detune: FakeParam;
  threshold: FakeParam; knee: FakeParam; ratio: FakeParam; attack: FakeParam; release: FakeParam;
  context: FakeContext;
  constructor(context: FakeContext, kind: string) {
    this.context = context; this.kind = kind;
    const p = (base = 0) => new FakeParam(() => context.currentTime, base);
    this.gain = p(1); this.frequency = p(440); this.Q = p(1); this.pan = p(); this.detune = p();
    this.threshold = p(); this.knee = p(); this.ratio = p(); this.attack = p(); this.release = p(); this.delayTime = p();
  }
  /** When each start() and stop() was asked for, and the wave an oscillator was given (music-score.ts). */
  starts: number[] = []; stops: number[] = []; wave: unknown = null; delayTime: FakeParam;
  connect(target: unknown) { this.to.push(target); return target; }
  disconnect() { this.to = []; }
  start(when = this.context.currentTime) { this.started++; this.starts.push(when); }
  stop(when = this.context.currentTime) { this.stops.push(when); }
  setPeriodicWave(wave: unknown) { this.wave = wave; }
}
/** A recording WebAudio stand-in: every node, every connection and every schedule is kept. */
export class FakeContext {
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
  createDelay() { return this.node('delay'); }
  createPeriodicWave(real: Float32Array, imag: Float32Array) { return { real, imag }; }
  createMediaElementSource(element: unknown) { const n = this.node('media'); n.media = element; return n; }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
  async suspend() { this.calls.suspend++; this.state = 'suspended'; }
  async resume() { this.calls.resume++; this.state = 'running'; }
}
export const fresh = () => { const ctx = new FakeContext(); return { ctx, make: () => ctx as unknown as AudioContext }; };
export const node = (n: unknown) => n as FakeNode;
export const near = (a: number, b: number, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;
