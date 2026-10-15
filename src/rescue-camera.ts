/**
 * Rescue Call's own camera (rescue.ts): a tower-defence view that fits the battlefield to the free part of the screen.
 *
 * The field is already laid out per orientation (rescue-rules.ts toWorld: landscape, your end on the left and raiders
 * from the right; a phone held upright, your end at the bottom and raiders from the top), so the camera never turns
 * (yaw 0, like everywhere else in the game): the stick and taps stay screen-relative without any change. What this
 * module picks is the pitch (steeper than the explorer's camera, so lanes read like a board and less far ground is
 * drawn), the distance and the point looked at, so that every route and build pad lies inside the screen rectangle the
 * HUD, the build drawer and the controls leave free.
 *
 * When fitting the whole field would draw the raiders smaller than `minPxPerM` (a phone held upright: 64 m of lanes in
 * about 450 px), the camera keeps that scale instead. It then rests on your end (`anchor`: the camp and the lanes' last
 * stretch, the part that must never be lost) and slides toward the raiders' end only when the explorer walks into the
 * outer quarter of the free rectangle; it is clamped so the view never runs past the field (no bare skirt or sky).
 * Pure: three.js maths only, no DOM, no world.
 */
import * as T from 'three';
import { CAMERA } from './camera-rig.ts';

export type Orient = 'portrait' | 'landscape';
export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Ground { x: number; z: number }
export interface ViewFit {
  /** The ground point looked at, and the camera's offset from it (world axes, yaw 0). */
  target: Ground; offset: [number, number, number]; distance: number;
  /** Screen pixels per metre on the ground at the middle of the free rectangle. */
  pxPerM: number;
  /** True when the whole field fits; false when the readability floor won and the camera follows. */
  whole: boolean;
}
export const RESCUE_VIEW = {
  /** Degrees above the ground: steeper on a phone held upright (the lanes run up the screen), a little lower on wide screens. */
  pitch: { portrait: 62, landscape: 56 } as Record<Orient, number>,
  /** Never draw the field smaller than this many pixels per metre (a raider about 1.2 m tall stays ≥ ~14 px). */
  minPxPerM: 11.5,
  /** Metres of grass kept around the routes and pads. */
  margin: 2.2,
} as const;

const cam = new T.PerspectiveCamera(), v = new T.Vector3(), ray = new T.Ray(), ground = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
function place(w: number, h: number, pitch: number, distance: number, target: Ground) {
  Object.assign(cam, { fov: CAMERA.fov, aspect: w / h, near: CAMERA.near, far: 1000 }); cam.updateProjectionMatrix();
  const r = pitch * Math.PI / 180; cam.position.set(target.x, distance * Math.sin(r), target.z + distance * Math.cos(r)); cam.lookAt(target.x, 0, target.z); cam.updateMatrixWorld(true);
}
/** A world ground point → CSS px on a w×h screen (camera placed by `place`). */
function toScreen(p: Ground, w: number, h: number) { v.set(p.x, 0, p.z).project(cam); return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h }; }
/** A screen point (CSS px) → where it meets the ground; rays toward the sky stop `reach` metres out. */
function toGround(x: number, y: number, w: number, h: number, reach = 400): Ground {
  ray.origin.copy(cam.position); ray.direction.set(x / w * 2 - 1, -(y / h) * 2 + 1, .5).unproject(cam).sub(cam.position).normalize();
  const t = ray.distanceToPlane(ground); ray.at(t === null || t > reach ? reach : t, hit); return { x: hit.x, z: hit.z };
}
function bounds(points: readonly Ground[], margin: number) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  return { x0: x0 - margin, x1: x1 + margin, z0: z0 - margin, z1: z1 + margin };
}
const offsetOf = (pitch: number, d: number): [number, number, number] => { const r = pitch * Math.PI / 180; return [0, d * Math.sin(r), d * Math.cos(r)]; };

/**
 * The view for a w×h screen whose free part is `free` (CSS px). `points`: the routes' samples and the pads, in world
 * ground coordinates. `follow`: the explorer, used only when the readability floor stops the whole field fitting.
 */
export function fitView(points: readonly Ground[], w: number, h: number, free: Rect, orient: Orient, follow: Ground, opts: { minPxPerM?: number; margin?: number; pitch?: number; anchor?: Ground } = {}): ViewFit {
  const pitch = opts.pitch ?? RESCUE_VIEW.pitch[orient], floor = opts.minPxPerM ?? RESCUE_VIEW.minPxPerM, b = bounds(points, opts.margin ?? RESCUE_VIEW.margin);
  const box: Ground[] = [{ x: b.x0, z: b.z0 }, { x: b.x1, z: b.z0 }, { x: b.x1, z: b.z1 }, { x: b.x0, z: b.z1 }];
  const fw = Math.max(40, free.right - free.left), fh = Math.max(40, free.bottom - free.top), cx = (free.left + free.right) / 2, cy = (free.top + free.bottom) / 2;
  const target = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }; let d = 60;
  // Fit: scale the distance by how much the projected box overflows, then slide the target so the box is centred in the free rectangle.
  for (let i = 0; i < 24; i++) {
    place(w, h, pitch, d, target);
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
    for (const p of box) { const s = toScreen(p, w, h); sx0 = Math.min(sx0, s.x); sx1 = Math.max(sx1, s.x); sy0 = Math.min(sy0, s.y); sy1 = Math.max(sy1, s.y); }
    const k = Math.max((sx1 - sx0) / fw, (sy1 - sy0) / fh);
    const a = toGround((sx0 + sx1) / 2, (sy0 + sy1) / 2, w, h), c = toGround(cx, cy, w, h);
    target.x += a.x - c.x; target.z += a.z - c.z; d *= Math.pow(k, .9);
  }
  place(w, h, pitch, d, target);
  const ppm = (at: Ground) => { const c = toGround(cx, cy, w, h), p = toScreen(c, w, h), q = toScreen({ x: c.x + 1, z: c.z }, w, h); void at; return Math.hypot(q.x - p.x, q.y - p.y); };
  let px = ppm(target);
  if (px >= floor) return { target: { ...target }, offset: offsetOf(pitch, d), distance: d, pxPerM: px, whole: true };
  // Too small to read: come closer, then follow the explorer, clamped so the free rectangle stays over the field.
  d *= px / floor; const t = { x: follow.x, z: follow.z };
  for (let i = 0; i < 3; i++) {
    place(w, h, pitch, d, t);
    // How far the free rectangle reaches from the target, measured on its middle row and column.
    const c = toGround(cx, cy, w, h), up = toGround(cx, free.top, w, h), dn = toGround(cx, free.bottom, w, h), lf = toGround(free.left, cy, w, h), rt = toGround(free.right, cy, w, h);
    const ox = c.x - t.x, oz = c.z - t.z; // the free rectangle's centre is not the screen's: aim so it lands on the field
    const reachUp = c.z - up.z, reachDn = dn.z - c.z, reachL = c.x - lf.x, reachR = rt.x - c.x;
    // On each axis: centre a field shorter than the view; otherwise rest on the anchor, move just enough to keep the
    // explorer inside the inner three quarters, and stay within the field.
    const anchor = opts.anchor ?? follow, DEAD = .75;
    const want = (lo: number, hi: number, a: number, bb: number, rest: number, at: number) => {
      if (hi - lo <= a + bb) return (lo + hi) / 2 + (a - bb) / 2;
      let c = Math.min(hi - bb, Math.max(lo + a, rest));
      if (at > c + bb * DEAD) c = at - bb * DEAD; else if (at < c - a * DEAD) c = at + a * DEAD;
      return Math.min(hi - bb, Math.max(lo + a, c));
    };
    const gx = want(b.x0, b.x1, reachL, reachR, anchor.x, follow.x), gz = want(b.z0, b.z1, reachUp, reachDn, anchor.z, follow.z);
    t.x = gx - ox; t.z = gz - oz;
  }
  place(w, h, pitch, d, t); px = ppm(t);
  return { target: t, offset: offsetOf(pitch, d), distance: d, pxPerM: px, whole: false };
}

/** The ground in view (screen corners, bottom-left, bottom-right, top-right, top-left) relative to the target, for the shadow box and view reach. */
export function footprintOf(fit: ViewFit, w: number, h: number, reach = 160, within?: readonly Ground[], margin = 8): Ground[] {
  const r = Math.atan2(fit.offset[1], fit.offset[2]) * 180 / Math.PI;
  place(w, h, r, fit.distance, { x: 0, z: 0 });
  const out = [toGround(0, h, w, h, reach), toGround(w, h, w, h, reach), toGround(w, 0, w, h, reach), toGround(0, 0, w, h, reach)];
  if (!within?.length) return out;
  // Only the field casts shadows that matter: the box stops at the field (plus a margin for the border trees), so far
  // things in the light's path (the village's walkers, 100 m off) are not drawn into the shadow map.
  const b = bounds(within, margin);
  return out.map(p => ({ x: Math.min(b.x1, Math.max(b.x0, p.x + fit.target.x)) - fit.target.x, z: Math.min(b.z1, Math.max(b.z0, p.z + fit.target.z)) - fit.target.z }));
}
/** Where a world ground point lands on the screen for a fit (tests, the dev hook). */
export function screenOf(fit: ViewFit, w: number, h: number, p: Ground) {
  const r = Math.atan2(fit.offset[1], fit.offset[2]) * 180 / Math.PI;
  place(w, h, r, fit.distance, fit.target); return toScreen(p, w, h);
}
