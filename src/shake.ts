/**
 * Camera shake as trauma (AAA-PLAN WP9). A blow adds trauma; the camera moves by trauma squared times one sample of
 * smooth noise (about 18 Hz), so a small hit is a nudge and a big one a jolt, and both die away at SHAKE.decay per
 * second whatever the frame rate. A blow with a direction kicks the camera along it first (the sample starts at +1) and
 * sways a little across it; one without a direction sways freely. The roll is at most half a degree.
 *
 * `gain` is the player's Screen shake setting: 1 Full, SHAKE.low Low (and no roll), 0 Off. The model loads after Start
 * (features/comfort.ts gives it to the effects with the stored gain); before that the camera does not shake at all.
 * Nothing here is random and nothing is allocated: the same blows give the same frames.
 */
export const SHAKE = { decay: 1.5, hz: 18, roll: .5 * Math.PI / 180, side: .35, free: .8, up: .25, low: .4 } as const;
/** The gain of a stored choice; with none stored, Low for a player who asked the system for less motion. */
export const shakeGain = (stored?: string | null, calm = false) => stored === 'off' ? 0 : stored === 'low' || (stored !== 'full' && calm) ? SHAKE.low : 1;
/** A fixed value in -1..1 for each whole number: the lattice the noise is smoothed over. */
const lattice = (i: number) => { const s = Math.sin(i * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };

export class Shake {
  /** 0..1; the seconds since the blow that set it; the way that blow went (unit, on the ground) or `free`. */
  trauma = 0; t = 0; x = 1; z = 0; free = true;
  /** The camera's roll for this frame (rad). */
  roll = 0;
  gain: number;
  constructor(gain = 1) { this.gain = gain; }
  /**
   * A blow of `amount` (the camera's reach in metres at its start, at most 1) that travelled along (dx, dz). A weaker
   * blow than the shake in progress changes nothing.
   */
  add(amount: number, dx = 0, dz = 0) {
    const trauma = Math.sqrt(Math.min(1, Math.max(0, amount))); if (!(trauma > 0 && trauma >= this.trauma)) return;
    const l = Math.hypot(dx, dz);
    this.trauma = trauma; this.t = 0; this.free = !(l > 1e-6); this.x = this.free ? 1 : dx / l; this.z = this.free ? 0 : dz / l;
  }
  /** The camera's offset for this frame, written into `out`; then `dt` seconds pass. */
  offset<V extends { set(x: number, y: number, z: number): V }>(dt: number, out: V): V {
    const k = this.trauma * this.trauma * this.gain;
    if (!(k > 0)) { this.trauma = this.roll = 0; return out.set(0, 0, 0); }
    const p = this.t * SHAKE.hz, i = Math.floor(p), f = p - i, a = i ? lattice(i) : 1, along = a + (lattice(i + 1) - a) * f * f * (3 - 2 * f);
    const across = Math.sin(p * 2.4) * (this.free ? SHAKE.free : SHAKE.side);
    this.roll = this.gain < 1 ? 0 : SHAKE.roll * this.trauma * this.trauma * Math.sin(p * 1.7);
    this.t += dt; this.trauma = Math.max(0, this.trauma - SHAKE.decay * dt);
    return out.set((this.x * along - this.z * across) * k, Math.sin(p * 3.1) * SHAKE.up * k, (this.z * along + this.x * across) * k);
  }
}
