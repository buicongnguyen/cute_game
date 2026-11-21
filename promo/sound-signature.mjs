// What a sound's recipe asks WebAudio for, as a short text: how many sources it starts, the sum of the volumes its
// envelopes rise to and the sum of the pitches it sets, at the nominal draw (random = 0.5). Two recipes with the same
// text are the same sound; a recipe whose volumes or pitches change gets another text. promo/loudness.mjs stores it
// beside each measured level (promo/loudness.json) and tests/sound-mix.test.ts compares: a recipe changed after it was
// measured fails there until the levels are measured again.

/** A WebAudio stand-in that only keeps what the signature needs. */
export function recordingContext() {
  const log = { sources: 0, gain: 0, pitch: 0 };
  const param = kind => ({ value: 0, setValueAtTime(v) { if (kind === 'frequency') log.pitch += v; }, linearRampToValueAtTime(v) { if (kind === 'gain') log.gain += v; }, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const ctx = { currentTime: 5, sampleRate: 8000, state: 'running', destination: {}, resume: async () => {} };
  const node = () => ({ context: ctx, type: '', buffer: null, frequency: param('frequency'), gain: param('gain'), Q: param(), pan: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
    connect(to) { return to; }, start() { log.sources++; }, stop() {} });
  Object.assign(ctx, { createOscillator: node, createGain: node, createBiquadFilter: node, createBufferSource: node, createDynamicsCompressor: node, createStereoPanner: node,
    createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }) });
  return { ctx, log };
}

/**
 * The signature of each sound. `Sfx` is the class of src/sfx.ts; `install(graph)` gives a fresh graph what the features
 * give it in the game (features/stingers.ts installStingers), so the stingers play their own recipes.
 */
export function signatures(Sfx, sounds, install) {
  const out = {};
  for (const sound of sounds) {
    const { ctx, log } = recordingContext(), sfx = new Sfx(() => ctx);
    sfx.random = () => .5; install?.(sfx.graph); sfx.play(sound);
    out[sound] = `${log.sources}:${log.gain.toFixed(4)}:${Math.round(log.pitch)}`;
  }
  return out;
}
