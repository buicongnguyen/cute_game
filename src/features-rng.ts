/**
 * The seeded randomness the feature modules share (hero fidgets, the music score, creature breath). It imports
 * nothing, so it lands in whichever lazy chunk first needs it and never in the start.
 */

/** mulberry32: numbers from 0 to 1, the same row for the same seed. */
export const mulberry32 = (seed: number) => () => { let t = seed = seed + 0x6D2B79F5 | 0; t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/** Fills a buffer with the same white noise every time (a Park-Miller row from seed 11, -1 to 1). */
export function fillNoise(data: Float32Array) {
  let seed = 11;
  for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
}
