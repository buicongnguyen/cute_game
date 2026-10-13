import { bridgeStrip } from './trail-ribbon.ts';

/**
 * The wind off a punch (drawn by weapon-trail.ts in the trail's own mesh, so it adds no draw call): a bow of pressed
 * air that leaves the fist and widens as it runs ahead, with a few thin streaks beside it. Each burst starts at the
 * fist's place in the world and its tails stay on the fist while the arm is still out. No drawing code here, and
 * nothing is allocated per punch.
 */
export const WIND = {
  /** Seconds a burst shows. */
  life: .2,
  /** Bursts alive at once (the three hits of a chain overlap a little). */
  bursts: 3,
  /** Streaks beside the bow; fewer on Battery saver. */
  streaks: 4, streaksLow: 2,
  /** Metres the bow runs ahead of the fist, and how wide it opens (its radius at the end), for a size of 1. */
  reach: 1.7, radius: .85,
  /** When in the punch (a part of world.punchT's swing) the wind leaves, and for how many seconds its tails then stay on the fist. */
  at: .12, hold: .08,
  /** The size of an ordinary punch and of the last hit of a chain. */
  size: 1, big: 1.55,
} as const;

const BOW = 9, STREAK = 3;
/** Sections `bursts` bursts can need: each bow and each streak, and the unseen joins before them. */
export const WIND_SECTIONS = WIND.bursts * ((BOW + 2) + WIND.streaks * (STREAK + 2));

const STRIDE = 11;
/** The bursts in flight: origin xyz, direction xyz (unit), start time, size, colour. A small ring made once. */
export class WindBursts {
  readonly data = new Float32Array(WIND.bursts * STRIDE);
  start = 0; count = 0;
  at(i: number) { return ((this.start + i) % WIND.bursts) * STRIDE; }
  /** A burst from (x, y, z) along (dx, dy, dz) at time `t`; the oldest gives way when all are in flight. */
  add(x: number, y: number, z: number, dx: number, dy: number, dz: number, t: number, size: number = WIND.size, r = 1, g = 1, b = 1) {
    const l = Math.hypot(dx, dy, dz); if (!(l > 1e-6) || !Number.isFinite(x + y + z + t + size)) return;
    let o: number;
    if (this.count === WIND.bursts) { o = this.at(0); this.start = (this.start + 1) % WIND.bursts; } else o = this.at(this.count++);
    const d = this.data; d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = dx / l; d[o + 4] = dy / l; d[o + 5] = dz / l; d[o + 6] = t; d[o + 7] = size; d[o + 8] = r; d[o + 9] = g; d[o + 10] = b;
  }
  /** Keeps the newest burst on the fist while the arm is out. */
  anchor(x: number, y: number, z: number) { if (!this.count || !Number.isFinite(x + y + z)) return; const o = this.at(this.count - 1); this.data[o] = x; this.data[o + 1] = y; this.data[o + 2] = z; }
  prune(now: number) { while (this.count && now - this.data[this.at(0) + 6] >= WIND.life) { this.start = (this.start + 1) % WIND.bursts; this.count--; } }
  clear() { this.start = 0; this.count = 0; }
}

/** Where each streak leaves the fist: sideways and up, as parts of the bow's radius. */
const FAN: readonly (readonly [number, number])[] = [[-.5, .22], [.46, .3], [-.2, -.26], [.24, -.1]];
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);

/**
 * Writes every burst at time `now` after the `first` sections already in the buffers (position xyz and trail pairs as
 * in buildRibbon; `tint` rgb per vertex). Returns the section count after them.
 */
export function buildWind(bursts: WindBursts, now: number, position: Float32Array, trail: Float32Array, tint: Float32Array, first = 0, streaks: number = WIND.streaks): number {
  const room = Math.min(position.length / 6, trail.length / 4, tint.length / 6) | 0, d = bursts.data;
  let sections = first;
  for (let n = 0; n < bursts.count; n++) {
    const o = bursts.at(n), k = (now - d[o + 6]) / WIND.life; if (!(k >= 0 && k < 1)) continue;
    const x = d[o], y = d[o + 1], z = d[o + 2], fx = d[o + 3], fy = d[o + 4], fz = d[o + 5], size = d[o + 7], r = d[o + 8], g = d[o + 9], b = d[o + 10];
    // Sideways: level and square to the punch (a punch straight up or down takes x).
    let sx = fz, sy = 0, sz = -fx; const sl = Math.hypot(sx, sz); if (sl > 1e-4) { sx /= sl; sz /= sl; } else { sx = 1; sz = 0; }
    // Up: square to both.
    const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
    const e = easeOut(k), age = k * k;
    const put = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, across: number, old: number) => {
      const p = sections * 6, q = sections * 4;
      position[p] = ax; position[p + 1] = ay; position[p + 2] = az; position[p + 3] = bx; position[p + 4] = by; position[p + 5] = bz;
      trail[q] = across; trail[q + 1] = old; trail[q + 2] = 1; trail[q + 3] = old;
      tint[p] = tint[p + 3] = r; tint[p + 1] = tint[p + 4] = g; tint[p + 2] = tint[p + 5] = b;
      sections++;
    };
    // The bow: an arc whose top runs ahead of the fist and whose ends trail back, thick in the middle, bright on its leading edge.
    if (sections + (sections ? 2 : 0) + BOW <= room) {
      const ahead = (.2 + WIND.reach * e) * size, radius = (.2 + (WIND.radius - .2) * e) * size, thick = .42 * size * (1 - .55 * k), span = 1.15;
      for (let i = 0; i < BOW; i++) {
        const a = (i / (BOW - 1) * 2 - 1) * span, c = Math.cos(a) - 1, s = Math.sin(a), edge = Math.cos(a / span * Math.PI / 2);
        const px = x + fx * (ahead + radius * c) + sx * radius * s, py = y + fy * (ahead + radius * c) + sy * radius * s, pz = z + fz * (ahead + radius * c) + sz * radius * s, back = thick * edge;
        if (i === 0 && sections) sections = bridgeStrip(position, trail, sections, px, py, pz);
        put(px - fx * back, py - fy * back, pz - fz * back, px, py, pz, 0, Math.min(1, age + (1 - edge) * .5));
      }
    }
    // The streaks: thin darts that leave the fist and stretch ahead, their tails letting go late.
    for (let i = 0; i < Math.min(streaks, FAN.length); i++) {
      if (sections + 2 + STREAK > room) break;
      const [a, c] = FAN[i], off = WIND.radius * size, ox = x + (sx * a + ux * c) * off * (.35 + .65 * e), oy = y + (sy * a + uy * c) * off * (.35 + .65 * e), oz = z + (sz * a + uz * c) * off * (.35 + .65 * e);
      const reach = (WIND.reach * (1.05 + .22 * (i % 2)) + .2) * size, head = reach * e, tail = reach * Math.max(0, e - .5) * 1.1, mid = tail + (head - tail) * .7, w = .075 * size * (1 - .5 * k);
      sections = bridgeStrip(position, trail, sections, ox + fx * tail, oy + fy * tail, oz + fz * tail);
      put(ox + fx * tail, oy + fy * tail, oz + fz * tail, ox + fx * tail, oy + fy * tail, oz + fz * tail, 1, age);
      put(ox + fx * mid - sx * w, oy + fy * mid - sy * w + w * .4, oz + fz * mid - sz * w, ox + fx * mid + sx * w, oy + fy * mid + sy * w - w * .4, oz + fz * mid + sz * w, 1, age);
      put(ox + fx * head, oy + fy * head, oz + fz * head, ox + fx * head, oy + fy * head, oz + fz * head, 1, age);
    }
  }
  return sections;
}
