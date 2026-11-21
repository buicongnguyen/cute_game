// What a sound's recipe asks WebAudio for, as a short text, at the nominal draw (random = 0.5):
//   sources : the sum of the volumes its envelopes rise to : the sum of the pitches it schedules : a hash of everything
// "Everything" is every oscillator and filter type, every value written to a frequency, Q or gain, and every scheduled
// step with its value and its time after the play (so a longer tail or a later note changes it too).
// Two recipes with the same text are the same sound. promo/loudness.mjs stores it beside each measured level
// (promo/loudness.json) and tests/sound-mix.test.ts compares: a recipe changed after it was measured fails there until
// the levels are measured again.

const START = 5;
/** A WebAudio stand-in that only keeps what the signature needs. */
export function recordingContext() {
  const log = { sources: 0, gain: 0, pitch: 0, all: [] };
  const note = (...parts) => log.all.push(parts.map(p => typeof p === 'number' ? +p.toFixed(5) : p).join(' '));
  const param = kind => {
    let value = 0;
    const step = how => (v, time) => { if (kind) note(kind, how, v, time - START); if (how === 'set' && kind === 'frequency') log.pitch += v; if (how === 'line' && kind === 'gain') log.gain += v; };
    return { get value() { return value; }, set value(v) { value = v; if (kind) note(kind, 'value', v); },
      setValueAtTime: step('set'), linearRampToValueAtTime: step('line'), exponentialRampToValueAtTime: step('exp'), setTargetAtTime() {}, cancelScheduledValues() {} };
  };
  const ctx = { currentTime: START, sampleRate: 8000, state: 'running', destination: {}, resume: async () => {} };
  // The mix's own nodes (bus gains, the compressor) are not part of a recipe: only sources, filters and envelope gains are kept.
  const node = kind => () => {
    let type = '';
    return { context: ctx, get type() { return type; }, set type(v) { type = v; note(kind, 'type', v); }, buffer: null,
      frequency: param(kind === 'osc' || kind === 'filter' ? 'frequency' : ''), gain: param(kind === 'gain' ? 'gain' : ''), Q: param(kind === 'filter' ? 'Q' : ''), pan: param(''),
      threshold: param(''), knee: param(''), ratio: param(''), attack: param(''), release: param(''),
      connect(to) { return to; }, start(time = START) { log.sources++; note(kind, 'start', time - START); }, stop(time = START) { note(kind, 'stop', time - START); } };
  };
  Object.assign(ctx, { createOscillator: node('osc'), createGain: node('gain'), createBiquadFilter: node('filter'), createBufferSource: node('noise'), createDynamicsCompressor: node('mix'), createStereoPanner: node('pan'),
    createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }) });
  return { ctx, log };
}

/** A short hash of a text (FNV-1a, 32 bits, hex). */
function hash(text) { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }

/**
 * The signature of each sound. `Sfx` is the class of src/sfx.ts; `install(graph)` gives a fresh graph what the features
 * give it in the game (features/stingers.ts installStingers), so the stingers play their own recipes.
 */
export function signatures(Sfx, sounds, install) {
  const out = {};
  for (const sound of sounds) {
    const { ctx, log } = recordingContext(), sfx = new Sfx(() => ctx);
    sfx.random = () => .5; install?.(sfx.graph); sfx.play(sound);
    out[sound] = `${log.sources}:${log.gain.toFixed(4)}:${Math.round(log.pitch)}:${hash(log.all.join('|'))}`;
  }
  return out;
}
