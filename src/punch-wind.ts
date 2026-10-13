import { bridgeStrip } from './trail-ribbon.ts';

/**
 * The wind off a punch (drawn by weapon-trail.ts in the trail's own mesh, so it adds no draw call). It has to read at a
 * glance, on a phone, as wind thrown by the fist: a thick gust that leaves the fist and runs ahead along the punch,
 * narrow at its tail and round at its head; a wide bow of pressed air riding in front of it; a few speed lines beside
 * it; and a ring of pressure that opens where the punch lands. Every piece is a flat strip turned to face the camera,
 * so none of them is ever seen edge-on, and all are drawn with a white core inside a blue rim (weapon-trail.ts), which
 * holds on grass, snow, candy and night ground alike. No drawing code here, and nothing is allocated per punch.
 */
export const WIND = {
  /** Seconds a burst shows, and the part of them the gust takes to run its reach. */
  life: .28, travel: .14,
  /** Bursts alive at once (the three hits of a chain overlap a little). */
  bursts: 3,
  /** Speed lines beside the gust; fewer on Battery saver. */
  lines: 3, linesLow: 2,
  /** Metres the gust's head runs ahead of the fist, its half width at the head, and the radius of the bow in front of it, for a size of 1. */
  reach: 1.75, width: .36, bow: .62,
  /** The ring of pressure: its radius when it is fully open, how far ahead of the fist it opens when the punch met nothing, and the seconds it takes. */
  ring: .7, contact: .9, ringTime: .18,
  /** Seconds the burst's tail stays on the fist. */
  hold: .06,
  /** The size of an ordinary punch, of the last hit of a chain, and of the pound that ends a dive. */
  size: 1, big: 1.4, pound: 1.6,
} as const;

const GUST = 9, BOW = 9, LINE = 3, RING = 15;
/** Sections `bursts` bursts can need: each gust, bow, line and ring, and the unseen joins before them. */
export const WIND_SECTIONS = WIND.bursts * ((GUST + 2) + (BOW + 2) + WIND.lines * (LINE + 2) + (RING + 2));

const STRIDE = 13;
/** The bursts in flight: origin xyz, direction xyz (unit), start time, size, colour, how far ahead the ring opens, and whether the ring lies flat on the ground. A small ring buffer made once. */
export class WindBursts {
  readonly data = new Float32Array(WIND.bursts * STRIDE);
  start = 0; count = 0;
  at(i: number) { return ((this.start + i) % WIND.bursts) * STRIDE; }
  /**
   * A burst from (x, y, z) along (dx, dy, dz) at time `t`; the oldest gives way when all are in flight. `ringAt`: metres
   * ahead of the fist where the punch landed (the ring opens there); `flat`: the ring lies on the ground (a pound).
   */
  add(x: number, y: number, z: number, dx: number, dy: number, dz: number, t: number, size: number = WIND.size, r = 1, g = 1, b = 1, ringAt: number = WIND.contact * size, flat = false) {
    const l = Math.hypot(dx, dy, dz); if (!(l > 1e-6) || !Number.isFinite(x + y + z + t + size + ringAt)) return;
    let o: number;
    if (this.count === WIND.bursts) { o = this.at(0); this.start = (this.start + 1) % WIND.bursts; } else o = this.at(this.count++);
    const d = this.data; d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = dx / l; d[o + 4] = dy / l; d[o + 5] = dz / l; d[o + 6] = t; d[o + 7] = size; d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = ringAt; d[o + 12] = flat ? 1 : 0;
  }
  /** Keeps the newest burst on the fist while the arm is out. */
  anchor(x: number, y: number, z: number) { if (!this.count || !Number.isFinite(x + y + z)) return; const o = this.at(this.count - 1); this.data[o] = x; this.data[o + 1] = y; this.data[o + 2] = z; }
  prune(now: number) { while (this.count && now - this.data[this.at(0) + 6] >= WIND.life) { this.start = (this.start + 1) % WIND.bursts; this.count--; } }
  clear() { this.start = 0; this.count = 0; }
}

/** Where each speed line runs: sideways from the gust (parts of its width), how far behind the head it ends, and its length (parts of the reach). */
const LINES: readonly (readonly [number, number, number])[] = [[-1.75, .1, .5], [1.6, .2, .42], [-2.6, .34, .34]];
const easeOut = (x: number) => { const s = Math.min(1, Math.max(0, x)); return 1 - (1 - s) * (1 - s); };
const smooth = (x: number) => { const s = Math.min(1, Math.max(0, x)); return s * s * (3 - 2 * s); };

/** How far the gust's head is from the fist `age` seconds after the punch, for a burst of `size`: it is out at once and runs its reach in `WIND.travel`. */
export function gustHead(age: number, size: number = WIND.size) { return (.35 + (WIND.reach - .35) * easeOut(age / WIND.travel)) * size; }

/**
 * Writes every burst at time `now` after the `first` sections already in the buffers (position xyz and trail pairs as
 * in buildRibbon; `tint` r, g, b and the look (1: wind) per vertex). (vx, vy, vz) is where the camera is: the strips
 * turn to face it. Returns the section count after them.
 */
export function buildWind(bursts: WindBursts, now: number, position: Float32Array, trail: Float32Array, tint: Float32Array, first = 0, lines: number = WIND.lines, vx = 0, vy = 30, vz = 26): number {
  const room = Math.min(position.length / 6, trail.length / 4, tint.length / 8) | 0, d = bursts.data;
  let sections = first, r = 1, g = 1, b = 1;
  const put = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, old: number) => {
    const p = sections * 6, q = sections * 4, c = sections * 8;
    position[p] = ax; position[p + 1] = ay; position[p + 2] = az; position[p + 3] = bx; position[p + 4] = by; position[p + 5] = bz;
    trail[q] = 0; trail[q + 1] = old; trail[q + 2] = 1; trail[q + 3] = old;
    tint[c] = tint[c + 4] = r; tint[c + 1] = tint[c + 5] = g; tint[c + 2] = tint[c + 6] = b; tint[c + 3] = tint[c + 7] = 1;
    sections++;
  };
  /** Starts a new strip at (x, y, z): false when the buffers cannot hold `need` more sections. */
  const begin = (need: number, x: number, y: number, z: number) => {
    if (sections + (sections ? 2 : 0) + need > room) return false;
    if (sections) sections = bridgeStrip(position, trail, sections, x, y, z);
    return true;
  };
  for (let n = 0; n < bursts.count; n++) {
    const o = bursts.at(n), since = Math.max(0, now - d[o + 6]), k = since / WIND.life; if (!(k < 1)) continue; // the start time is kept in single precision: it may read a hair after `now`
    const x = d[o], y = d[o + 1], z = d[o + 2], fx = d[o + 3], fy = d[o + 4], fz = d[o + 5], size = d[o + 7], ringAt = d[o + 11], flat = d[o + 12] === 1;
    r = d[o + 8]; g = d[o + 9]; b = d[o + 10];
    // Towards the camera, then sideways: square to the punch and to the line of sight, so a strip along the punch faces the camera.
    let cx = vx - x, cy = vy - y, cz = vz - z; const cl = Math.hypot(cx, cy, cz) || 1; cx /= cl; cy /= cl; cz /= cl;
    let sx = fy * cz - fz * cy, sy = fz * cx - fx * cz, sz = fx * cy - fy * cx, sl = Math.hypot(sx, sy, sz);
    if (sl < 1e-3) { sx = fz; sy = 0; sz = -fx; sl = Math.hypot(sx, sz); if (sl < 1e-3) { sx = 1; sz = 0; sl = 1; } } // a punch straight at the camera
    sx /= sl; sy /= sl; sz /= sl;
    const run = Math.min(1, since / WIND.travel), e = easeOut(run), head = gustHead(since, size), age = smooth((k - .4) / .6);
    // The gust: from its tail (on the fist at first, letting go late) to its round head, widest just behind the head.
    const tail = head * .72 * smooth((run - .3) / .7), wide = WIND.width * size * (.55 + .45 * e) * (1 - .35 * age);
    for (let i = 0; i < GUST; i++) {
      const s = i / (GUST - 1), along = tail + (head - tail) * s, w = wide * (s < .72 ? .1 + .9 * Math.pow(s / .72, .75) : Math.sqrt(Math.max(.02, 1 - ((s - .72) / .28) ** 2)));
      const px = x + fx * along, py = y + fy * along, pz = z + fz * along;
      if (i === 0 && !begin(GUST, px, py, pz)) break;
      put(px - sx * w, py - sy * w, pz - sz * w, px + sx * w, py + sy * w, pz + sz * w, 1 - (1 - age) * Math.sqrt(.2 + .8 * s));
    }
    // The bow: an arc of pressed air riding ahead of the gust, its ends swept back, thick in the middle.
    {
      const radius = WIND.bow * size * (.5 + .5 * e), thick = .24 * size * (1 - .5 * k), span = 1.2, centre = head + .16 * size - radius;
      for (let i = 0; i < BOW; i++) {
        const a = (i / (BOW - 1) * 2 - 1) * span, c = Math.cos(a), s = Math.sin(a), edge = Math.cos(a / span * Math.PI / 2), back = thick * (.15 + .85 * edge);
        const px = x + fx * (centre + radius * c) + sx * radius * s, py = y + fy * (centre + radius * c) + sy * radius * s, pz = z + fz * (centre + radius * c) + sz * radius * s;
        if (i === 0 && !begin(BOW, px, py, pz)) break;
        put(px - fx * back, py - fy * back, pz - fz * back, px, py, pz, Math.min(1, age + (1 - edge) * .35));
      }
    }
    // The speed lines: thin darts beside the gust, a little behind its head.
    for (let i = 0; i < Math.min(lines, LINES.length); i++) {
      const [side, lag, length] = LINES[i], off = WIND.width * size * side, to = head * (1 - lag), from = Math.max(0, to - WIND.reach * size * length * e), mid = from + (to - from) * .6, w = .05 * size * (1 - .4 * k);
      const ox = x + sx * off, oy = y + sy * off, oz = z + sz * off;
      if (!begin(LINE, ox + fx * from, oy + fy * from, oz + fz * from)) break;
      put(ox + fx * from, oy + fy * from, oz + fz * from, ox + fx * from, oy + fy * from, oz + fz * from, 1);
      put(ox + fx * mid - sx * w, oy + fy * mid - sy * w, oz + fz * mid - sz * w, ox + fx * mid + sx * w, oy + fy * mid + sy * w, oz + fz * mid + sz * w, age);
      put(ox + fx * to, oy + fy * to, oz + fz * to, ox + fx * to, oy + fy * to, oz + fz * to, age);
    }
    // The ring of pressure where the punch landed: it opens fast and thins as it goes. Facing the camera, a little
    // flattened along the punch (so it reads as the face of the blow); flat on the ground under a pound.
    {
      const open = Math.min(1, since / WIND.ringTime), radius = WIND.ring * size * (flat ? 2.3 : 1) * (.3 + .7 * easeOut(open)), thick = .26 * size * (1 - .7 * open), old = open * open * (2 - open);
      // The ring's two axes: sideways, and the punch as the camera sees it (its part square to the line of sight).
      let ax = sx, ay = sy, az = sz, bx = cy * sz - cz * sy, by = cz * sx - cx * sz, bz = cx * sy - cy * sx, squash = .62;
      if (flat) { ax = 1; ay = 0; az = 0; bx = 0; by = 0; bz = 1; squash = 1; }
      const ox = x + fx * ringAt, oy = y + fy * ringAt, oz = z + fz * ringAt;
      for (let i = 0; i < RING; i++) {
        const a = i / (RING - 1) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a) * squash, inner = radius - thick / 2, outer = radius + thick / 2;
        if (i === 0 && !begin(RING, ox + ax * inner, oy + ay * inner, oz + az * inner)) break;
        put(ox + (ax * c + bx * s) * inner, oy + (ay * c + by * s) * inner, oz + (az * c + bz * s) * inner, ox + (ax * c + bx * s) * outer, oy + (ay * c + by * s) * outer, oz + (az * c + bz * s) * outer, old);
      }
    }
  }
  return sections;
}

/**
 * The pose of a punch (world.ts animatePlayer). A hit lands when the attack is pressed, so the fist is out at once
 * (`contact` of the way in: one frame), holds for a moment and comes back. The arm reaches further than it is long
 * (it stretches, the fist grows, the body leans and steps in), so the fist shows past the explorer's big head from
 * the game's high camera. Gameplay reads none of this.
 */
export const PUNCH = {
  /** Parts of the punch (world.punchT's quarter second): the fist is out, starts back, is back. */
  contact: .07, hold: .4, back: .85,
  /** How long the arm gets (1: its own length), how big the fist, how far the body steps in (m), leans (rad) and turns its shoulder in (rad). */
  stretch: 2.4, fist: 1.5, step: .3, lean: .24, twist: .62,
  /** The arm's angle: straight ahead for a jab; an uppercut meets its target at `upper` and carries on up to `upperEnd`. */
  jab: -1.5, upper: -1.2, upperEnd: -2.55,
} as const;
/** 0: a jab; 1: an uppercut (the last hit of a chain); 2: the pound that ends a dive (both fists down). */
export type PunchKind = 0 | 1 | 2;
export interface PunchPose { /** The arm's angle forward and up (rotation.x). */ raise: number; /** How long the arm is, and how big the fist. */ stretch: number; fist: number; /** The body: its turn (for the right arm; the left mirrors it), lean and step forward. */ twist: number; lean: number; step: number }
/** The punch at `t` (0 the press, 1 its end), written into `out`. */
export function punchPose(kind: PunchKind, t: number, out: PunchPose): PunchPose {
  const P = PUNCH, x = Math.min(1, Math.max(0, t));
  const reach = x < P.contact ? x / P.contact : x < P.hold ? 1 : 1 - smooth((x - P.hold) / (P.back - P.hold)), through = easeOut((x - P.contact) / (P.hold - P.contact));
  out.raise = kind === 1 ? (P.upper * Math.min(1, x / P.contact) + (P.upperEnd - P.upper) * through) * (x < P.hold ? 1 : reach) : kind === 2 ? -.95 * reach : P.jab * reach;
  out.stretch = 1 + (P.stretch - 1) * reach * (kind === 2 ? .5 : 1);
  out.fist = 1 + (P.fist - 1) * reach;
  out.twist = (kind === 2 ? 0 : -P.twist) * reach;
  out.lean = P.lean * reach * (kind === 1 ? .4 : kind === 2 ? 1.6 : 1);
  out.step = P.step * reach * (kind === 2 ? 0 : 1);
  return out;
}
