/**
 * The weapon trail, the part with no drawing in it (weapon-trail.ts draws it): where a weapon's blade is, the ring of
 * blade positions a swing leaves behind, the ribbon built from them, and the swing's own curve.
 *
 * A swing samples the blade's base and tip in world space once a frame. The ribbon is a strip between those samples,
 * smoothed (Catmull-Rom) so a fast swing bends instead of showing one flat face per frame, full width at the newest
 * sample (the blade itself) and narrowing onto the tip's path as it ages. Everything here writes into arrays made once:
 * a swing allocates nothing.
 */

export const TRAIL = {
  /** Seconds of the blade's path the ribbon shows. */
  life: .16,
  /** The same on Battery saver and on phones the governor has relieved: a shorter ribbon. */
  lifeLow: .1,
  /** Samples kept: .16 s at 144 frames a second. */
  samples: 24,
  /** Ribbon sections between two samples. */
  subdiv: 4, subdivLow: 2,
  /** Where along the weapon (0 grip end, 1 tip) the ribbon's inner edge runs: the handle leaves no trail. */
  inner: .3,
  /** How much of its width the ribbon has lost at the end of its life (it closes onto the tip's path). */
  taper: .82,
  /** How old (a part of `life`) the first edge of a new ribbon is born, so a cut starts as a point and not as a hard edge. */
  soft: .5,
} as const;

/** The most ribbon sections a full ring can make (the size of the vertex buffers). */
export const maxSections = (samples: number = TRAIL.samples, subdiv: number = TRAIL.subdiv) => (samples - 1) * subdiv + 1;

const STRIDE = 7;
/** The last blade positions of one swinger, oldest first: base xyz, tip xyz and the time, in a ring that never grows. */
export class TrailSamples {
  readonly capacity: number;
  readonly data: Float32Array;
  start = 0; count = 0;
  constructor(capacity: number = TRAIL.samples) { this.capacity = Math.max(2, capacity); this.data = new Float32Array(this.capacity * STRIDE); }
  /** The slot of the i-th sample (0 the oldest) in `data`. */
  at(i: number) { return ((this.start + i) % this.capacity) * STRIDE; }
  get newest() { return this.count ? this.data[this.at(this.count - 1) + 6] : -Infinity; }
  /**
   * Adds the blade's position at time `t`. A frame in which no time passed (a pause, the frozen moment of a hit)
   * replaces the last sample instead of stacking a second one on it; a full ring drops its oldest.
   */
  push(bx: number, by: number, bz: number, tx: number, ty: number, tz: number, t: number) {
    if (!(Number.isFinite(bx + by + bz + tx + ty + tz + t))) return;
    let o: number;
    if (this.count && t <= this.newest) o = this.at(this.count - 1);
    else if (this.count === this.capacity) { o = this.at(0); this.start = (this.start + 1) % this.capacity; }
    else o = this.at(this.count++);
    const d = this.data; d[o] = bx; d[o + 1] = by; d[o + 2] = bz; d[o + 3] = tx; d[o + 4] = ty; d[o + 5] = tz; d[o + 6] = Math.max(t, this.count > 1 ? d[this.at(this.count - 2) + 6] : t);
  }
  /** Drops what has faded out. One sample past the ribbon's life stays, so the tail shrinks smoothly instead of jumping a frame at a time. */
  prune(now: number, life: number) {
    while (this.count > 1 && now - this.data[this.at(1) + 6] >= life) { this.start = (this.start + 1) % this.capacity; this.count--; }
    if (this.count === 1 && now - this.data[this.at(0) + 6] >= life) this.count = 0;
  }
  clear() { this.start = 0; this.count = 0; }
}

/** Catmull-Rom through p1..p2 (uniform). */
const spline = (p0: number, p1: number, p2: number, p3: number, s: number) => .5 * (2 * p1 + (p2 - p0) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (3 * p1 - p0 - 3 * p2 + p3) * s * s * s);

/**
 * One strip after another in the same buffers: two unseen sections (age 1 draws nothing) carry the strip from the last
 * section written to (x, y, z), so separate ribbons and streaks still go out as one mesh. Returns the new section count.
 */
export function bridgeStrip(position: Float32Array, trail: Float32Array, sections: number, x: number, y: number, z: number): number {
  if (sections <= 0) return 0;
  if ((sections + 2) * 6 > position.length || (sections + 2) * 4 > trail.length) return sections;
  const last = (sections - 1) * 6;
  for (let k = 0; k < 2; k++) {
    const p = (sections + k) * 6, q = (sections + k) * 4;
    for (let v = 0; v < 2; v++) { position[p + v * 3] = k ? x : position[last + 3]; position[p + v * 3 + 1] = k ? y : position[last + 4]; position[p + v * 3 + 2] = k ? z : position[last + 5]; }
    trail[q] = 0; trail[q + 1] = 1; trail[q + 2] = 1; trail[q + 3] = 1;
  }
  return sections + 2;
}

/**
 * Writes the ribbon of `samples` at time `now` into `position` (xyz per vertex) and `trail` (per vertex: across the
 * ribbon, 0 inner edge to 1 tip edge; and age, 0 new to 1 gone), after the `first` sections already there. Two vertices
 * per section, inner then tip, oldest section first. Returns the section count after it: unchanged with fewer than two
 * samples (nothing to draw); a full ring adds at most `maxSections(samples.capacity, subdiv)`.
 */
export function buildRibbon(samples: TrailSamples, now: number, life: number, subdiv: number, position: Float32Array, trail: Float32Array, first = 0): number {
  const n = samples.count; if (n < 2 || !(life > 0)) return first;
  const d = samples.data, steps = Math.max(1, Math.floor(subdiv)), room = Math.min(position.length / 6, trail.length / 4) | 0;
  if (first + (first ? 2 : 0) + 2 > room) return first;
  const o = samples.at(0);
  let sections = first ? bridgeStrip(position, trail, first, d[o + 3], d[o + 4], d[o + 5]) : 0;
  const put = (bx: number, by: number, bz: number, tx: number, ty: number, tz: number, t: number) => {
    if (sections >= room) return;
    const age = Math.min(1, Math.max(0, (now - t) / life)), keep = 1 - TRAIL.taper * age, p = sections * 6, q = sections * 4;
    position[p] = tx + (bx - tx) * keep; position[p + 1] = ty + (by - ty) * keep; position[p + 2] = tz + (bz - tz) * keep;
    position[p + 3] = tx; position[p + 4] = ty; position[p + 5] = tz;
    trail[q] = 0; trail[q + 1] = age; trail[q + 2] = 1; trail[q + 3] = age;
    sections++;
  };
  for (let i = 0; i < n - 1; i++) {
    const a = samples.at(Math.max(0, i - 1)), b = samples.at(i), c = samples.at(i + 1), e = samples.at(Math.min(n - 1, i + 2));
    for (let k = 0; k < steps; k++) {
      const s = k / steps;
      if (k === 0) put(d[b], d[b + 1], d[b + 2], d[b + 3], d[b + 4], d[b + 5], d[b + 6]);
      else put(spline(d[a], d[b], d[c], d[e], s), spline(d[a + 1], d[b + 1], d[c + 1], d[e + 1], s), spline(d[a + 2], d[b + 2], d[c + 2], d[e + 2], s),
        spline(d[a + 3], d[b + 3], d[c + 3], d[e + 3], s), spline(d[a + 4], d[b + 4], d[c + 4], d[e + 4], s), spline(d[a + 5], d[b + 5], d[c + 5], d[e + 5], s),
        d[b + 6] + (d[c + 6] - d[b + 6]) * s);
    }
  }
  const z = samples.at(n - 1); put(d[z], d[z + 1], d[z + 2], d[z + 3], d[z + 4], d[z + 5], d[z + 6]);
  return sections;
}

export interface Blade { /** The grip end, the tip, and where the ribbon's inner edge starts, in the hand's own space. */ grip: [number, number, number]; tip: [number, number, number]; inner: [number, number, number]; length: number }

/** The blade a hand holds when no weapon model is there to measure (a disguise's own weapon, a file still loading): from the hand, forward and up, as the stand-in sword is held. */
export function plainBlade(length = 1): Blade { const y = Math.cos(1.25) * length, z = Math.sin(1.25) * length; return { grip: [0, 0, 0], tip: [0, y, z], inner: [0, y * TRAIL.inner, z * TRAIL.inner], length }; }

/**
 * Finds a weapon's long axis from its vertices (xyz triples in the hand's space): the direction they spread along most.
 * The end nearer the hand's origin is the grip, the other the tip, so it works for a sword, a hammer (handle to head),
 * a scythe or a trident alike. Null for fewer than two distinct points.
 */
export function bladeAxis(points: ArrayLike<number>): Blade | null {
  const n = Math.floor(points.length / 3); if (n < 2) return null;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += points[i * 3]; cy += points[i * 3 + 1]; cz += points[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (let i = 0; i < n; i++) { const x = points[i * 3] - cx, y = points[i * 3 + 1] - cy, z = points[i * 3 + 2] - cz; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
  if (!(xx + yy + zz > 1e-10)) return null;
  // Power iteration from the widest axis of the box (never at right angles to the answer).
  let ax = xx >= yy && xx >= zz ? 1 : 0, ay = !ax && yy >= zz ? 1 : 0, az = ax || ay ? 0 : 1;
  for (let i = 0; i < 24; i++) {
    const x = xx * ax + xy * ay + xz * az, y = xy * ax + yy * ay + yz * az, z = xz * ax + yz * ay + zz * az, l = Math.hypot(x, y, z);
    if (!(l > 0)) break; ax = x / l; ay = y / l; az = z / l;
  }
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < n; i++) { const p = (points[i * 3] - cx) * ax + (points[i * 3 + 1] - cy) * ay + (points[i * 3 + 2] - cz) * az; if (p < low) low = p; if (p > high) high = p; }
  const a: [number, number, number] = [cx + ax * low, cy + ay * low, cz + az * low], b: [number, number, number] = [cx + ax * high, cy + ay * high, cz + az * high];
  const [grip, tip] = Math.hypot(...a) <= Math.hypot(...b) ? [a, b] : [b, a], length = Math.hypot(tip[0] - grip[0], tip[1] - grip[1], tip[2] - grip[2]);
  if (!(length > 1e-5)) return null;
  const k = TRAIL.inner;
  return { grip, tip, inner: [grip[0] + (tip[0] - grip[0]) * k, grip[1] + (tip[1] - grip[1]) * k, grip[2] + (tip[2] - grip[2]) * k], length };
}

/**
 * The trail's colour from the weapon's own paint, when it has no effect colour or wears a dye: the average of its
 * brighter, more colourful pieces (`parts`: r, g, b in 0-1 and a weight, one per piece), lifted so a dark blade still
 * leaves a bright trail. Returns r, g, b in 0-1, or null when there is nothing to go by.
 */
export function bladeTint(parts: ArrayLike<number>): [number, number, number] | null {
  let r = 0, g = 0, b = 0, sum = 0;
  for (let i = 0; i + 3 < parts.length; i += 4) {
    const pr = parts[i], pg = parts[i + 1], pb = parts[i + 2], max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
    const w = parts[i + 3] * (.15 + max) * (.04 + (max - min) * (max - min)); if (!(w > 0)) continue;
    r += pr * w; g += pg * w; b += pb * w; sum += w;
  }
  if (!(sum > 0)) return null;
  r /= sum; g /= sum; b /= sum;
  const max = Math.max(r, g, b, 1e-4), lift = 1 / max; r *= lift; g *= lift; b *= lift; // as bright as that hue goes
  return [r, g, b];
}

/**
 * The swing of a blade (world.ts animatePlayer). The whole swing lasts `time`, as it always has; inside it the blade
 * pulls back for a moment, cuts fast, runs a little past the end and settles into the stance again. Gameplay does not
 * read any of this: hits land when the attack is pressed, exactly as before.
 */
export const SWING = {
  /** Seconds of the whole swing (world.punchT). */
  time: .25,
  /** Where the pull-back ends, the cut ends and the follow-through ends, as parts of the swing. */
  back: .18, cut: .56, follow: .76,
  /** The moment the blade crosses what it hits. */
  contact: .38,
  /** A swing this soon after the last continues the pattern (first, second, third cut); later ones start over. */
  chain: .9,
} as const;

/**
 * The three cuts. `from`/`to`: the blade's angle along the cut (0 points it straight ahead); `axis`: what the cut turns
 * about, in the explorer's own space (x to the sword side, y up, z ahead); `back`/`over`: the pull-back and the
 * follow-through (rad); `twist`: how the body turns with it; `lean`: how far it leans in.
 */
export interface Cut { from: number; to: number; axis: [number, number, number]; back: number; over: number; twist: [number, number]; lean: number }
const tilt = (roll: number): [number, number, number] => [-Math.sin(roll), Math.cos(roll), 0];
export const CUTS: readonly Cut[] = [
  // From the sword side, high, across to the other side, low.
  { from: 1.5, to: -1.2, axis: tilt(.32), back: .3, over: .22, twist: [.5, -.6], lean: .16 },
  // Back again, rising.
  { from: -1.25, to: 1.45, axis: tilt(.18), back: .28, over: .22, twist: [-.55, .55], lean: .14 },
  // Down from high on the sword side: a steep slant, not a straight chop, so the cut is never edge-on to the camera.
  { from: -2.2, to: .65, axis: [Math.cos(.8), -Math.sin(.8), 0], back: .25, over: .2, twist: [.35, -.3], lean: .3 },
];
export type CutIndex = 0 | 1 | 2;

const smooth = (x: number) => { const s = Math.min(1, Math.max(0, x)); return s * s * (3 - 2 * s); };
const easeOut = (x: number) => { const s = Math.min(1, Math.max(0, x)); return 1 - (1 - s) * (1 - s); };

export interface SwingPose { /** The blade's angle along the cut. */ angle: number; /** 0 the pose the swing started from or settles into, 1 the swing. */ blend: number; /** True after the cut: `blend` then leads back to the stance. */ settling: boolean; /** The blade leaves a trail now. */ emit: boolean; twist: number; lean: number }
/** The swing at `t` (0 its start, 1 its end), written into `out`. */
export function swingPose(cut: Cut, t: number, out: SwingPose): SwingPose {
  const S = SWING, dir = Math.sign(cut.to - cut.from) || 1, x = Math.min(1, Math.max(0, t));
  const start = cut.from - dir * cut.back, cutting = smooth((x - S.back) / (S.cut - S.back));
  out.angle = x < S.back ? cut.from - dir * cut.back * easeOut(x / S.back)
    : x < S.cut ? start + (cut.to - start) * cutting
    : cut.to + dir * cut.over * easeOut((x - S.cut) / (S.follow - S.cut));
  out.settling = x > S.follow;
  out.blend = x < S.back ? easeOut(x / S.back) : out.settling ? 1 - smooth((x - S.follow) / (1 - S.follow)) : 1;
  out.emit = x >= S.back && x <= S.follow;
  const turn = x < S.back ? 0 : x < S.cut ? cutting : 1;
  out.twist = (cut.twist[0] + (cut.twist[1] - cut.twist[0]) * turn) * out.blend;
  out.lean = cut.lean * Math.sin(Math.min(1, x / S.follow) * Math.PI) * (out.settling ? out.blend : 1);
  return out;
}

/** Which cut a swing makes: the next of the pattern when it follows the last within `SWING.chain` seconds, else the first. */
export function nextCut(last: CutIndex, sinceLast: number): CutIndex { return sinceLast >= 0 && sinceLast <= SWING.chain ? ((last + 1) % CUTS.length) as CutIndex : 0; }
