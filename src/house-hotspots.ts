/**
 * Where each usable thing in the cottage really is: a box around the furniture you see (measured from the Blender
 * house kit once it has loaded, a fitted guess before), used three ways so they always agree:
 *  - the tap region: a tap anywhere on the object's projected box (or on its label) picks it;
 *  - the label: pinned low on the object's middle, so the word sits on the thing it names;
 *  - the hover glow and the nearest-thing ring: drawn around the same footprint.
 * Before, the labels hung 3.3 m up (an empty anchor has no height) and the tap circles sat on the walk spot with
 * the outdoor buildings' radii, so the word, the object and the place that answered a tap were three different spots.
 */
import * as T from 'three';
import { FURNITURE, HOUSE, spreadActivity, type Placement } from './house.ts';
import { houseKit } from './house-view.ts';
import type { ActivityId } from './house-activities.ts';

export interface Box3D { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }
export interface ScreenRect { left: number; top: number; right: number; bottom: number }

/** The furniture each activity is: [kit, x, z] of its FURNITURE placement (the diary is the desk, the books the shelf). */
const PIECES: Record<ActivityId, Array<[string, number, number]>> = {
  sofa: [['sofa', -1.9, -1.38]], fire: [['fireplace', -4.62, 1.7]], trophies: [['trophy_shelf', 2.25, -1.9]], radio: [['radio', 3.0, .85]],
  stove: [['stove', -9.58, 2.4]], tea: [['kettle', -9.5, .05]], workbench: [['workbench', 9.6, .3]], bench: [['upgrade_bench', 9.55, 2.6]], easel: [['easel', 7.2, -.9]],
  bed: [['bed', -7.0, -5.85]], wardrobe: [['wardrobe', -9.62, -3.6]], mirror: [['mirror', -2.35, -4.9]],
  bath: [['bathtub', -.75, -6.4]], duck: [['duck', -.4, -6.35]], sink: [['sink', 2.35, -6.62]],
  globe: [['globe', 3.8, -6.4]], books: [['bookshelf', 9.76, -4.4]], diary: [['desk', 6.5, -6.55], ['books', 6.95, -6.5]],
};
/** Heights (and sizes of pieces without a collision footprint) for the stand-in boxes before the kit arrives. */
const GUESS: Record<string, { h: number; w?: number; d?: number }> = {
  sofa: { h: .95 }, fireplace: { h: 1.3 }, trophy_shelf: { h: .45, w: 1.5, d: .3 }, radio: { h: .3, w: .45, d: .25 }, stove: { h: 1 },
  kettle: { h: .3, w: .3, d: .3 }, workbench: { h: 1 }, upgrade_bench: { h: 1.1 }, easel: { h: 1.6 }, bed: { h: .8 }, wardrobe: { h: 2 }, mirror: { h: 1.75 },
  bathtub: { h: .65 }, duck: { h: .2, w: .25, d: .25 }, sink: { h: 1 }, globe: { h: 1.1 }, bookshelf: { h: 1.9 }, desk: { h: .8 }, books: { h: .15, w: .35, d: .25 },
};
/** The front door seen from inside: the panel in its frame. */
const DOOR: Box3D = { x0: -.6, x1: .6, y0: 0, y1: 2.05, z0: HOUSE.bounds.z1 - .2, z1: HOUSE.bounds.z1 + .1 };

/** PIECES lists plan coordinates; FURNITURE is spread (house.ts SPACE), so spread the lookup the same way. */
const placementOf = (kit: string, x: number, z: number): Placement | undefined => { const at = spreadActivity({ x, z }); return FURNITURE.find(p => p.kit === kit && Math.abs(p.x - at.x) < .01 && Math.abs(p.z - at.z) < .01); };
const box = new T.Box3(), part = new T.Box3(), m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0);
/** A placement's box from the kit's real parts, or from its footprint and a guessed height. */
function pieceBox(p: Placement, out: T.Box3) {
  const parts = houseKit.ready ? houseKit.parts(p.kit) : undefined;
  const place = m.compose(new T.Vector3(p.x, p.y ?? 0, p.z), q.setFromAxisAngle(up, p.rot ?? 0), new T.Vector3().setScalar(p.scale ?? 1));
  if (parts?.length) {
    for (const piece of parts) { const g = piece.geometry; if (!g.boundingBox) g.computeBoundingBox(); out.union(part.copy(g.boundingBox!).applyMatrix4(new T.Matrix4().multiplyMatrices(place, piece.matrix))); }
    return;
  }
  const guess = GUESS[p.kit] ?? { h: 1 }, s = p.scale ?? 1, w = (guess.w ?? p.block?.[0] ?? .5) * s, d = (guess.d ?? p.block?.[1] ?? .5) * s;
  out.union(part.set(new T.Vector3(-w / 2, 0, -d / 2), new T.Vector3(w / 2, guess.h * s, d / 2)).applyMatrix4(place));
}
const cache = new Map<string, Box3D>(); let cachedWithKit = false;
/** The visible box of an activity's furniture (metres, interior space). */
export function activityBox(id: ActivityId): Box3D | null {
  if (cachedWithKit !== houseKit.ready) { cache.clear(); cachedWithKit = houseKit.ready; }
  const known = cache.get(id); if (known) return known;
  const list = PIECES[id]; if (!list) return null;
  box.makeEmpty();
  for (const [kit, x, z] of list) { const p = placementOf(kit, x, z); if (p) pieceBox(p, box); }
  if (box.isEmpty()) return null;
  const out = { x0: box.min.x, x1: box.max.x, y0: Math.max(0, box.min.y), y1: box.max.y, z0: box.min.z, z1: box.max.z };
  cache.set(id, out); return out;
}
export const doorBox = () => DOOR;
/** A friend's box around where they stand now (they walk between hangouts), from their measured height. */
export function friendBox(group: T.Object3D, out: Box3D = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 }): Box3D {
  const data = group.userData as { hotspotH?: number };
  if (data.hotspotH === undefined) { box.makeEmpty(); group.updateWorldMatrix(true, true); box.setFromObject(group); data.hotspotH = box.isEmpty() ? 1.1 : Math.max(.6, Math.min(2, box.max.y - group.position.y)); }
  const p = group.position, r = .38;
  out.x0 = p.x - r; out.x1 = p.x + r; out.z0 = p.z - r; out.z1 = p.z + r; out.y0 = p.y; out.y1 = p.y + data.hotspotH; return out;
}

/**
 * Where the label sits: the middle of the footprint, low on the object: 0.25-0.9 m up a thing that stands on the floor
 * (a tall wardrobe gets it at waist height, not on its top), halfway up a small thing on a table or counter (the kettle).
 */
export function labelSpot(b: Box3D) { const mid = b.y0 + (b.y1 - b.y0) * .45; return { x: (b.x0 + b.x1) / 2, y: b.y0 > .5 ? mid : Math.max(.25, Math.min(.9, mid)), z: (b.z0 + b.z1) / 2 }; }

const corner = new T.Vector3();
/** The box's projected screen rectangle (CSS pixels), grown to at least `min` px each way so tiny things stay tappable. */
export function screenRect(b: Box3D, camera: T.Camera, width: number, height: number, min = 44): ScreenRect | null {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? b.x1 : b.x0, i & 2 ? b.y1 : b.y0, i & 4 ? b.z1 : b.z0).project(camera);
    if (corner.z < -1 || corner.z > 1) return null;
    const x = (corner.x + 1) * width / 2, y = (1 - corner.y) * height / 2;
    if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
  }
  const grow = (lo: number, hi: number) => { const pad = Math.max(0, (min - (hi - lo)) / 2); return [lo - pad, hi + pad]; };
  [left, right] = grow(left, right); [top, bottom] = grow(top, bottom);
  return { left, top, right, bottom };
}
const holds = (r: ScreenRect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
const area = (r: ScreenRect) => (r.right - r.left) * (r.bottom - r.top);

export interface Hotspot<E> { e: E; rect: ScreenRect | null; label?: ScreenRect | null }
/**
 * What a tap at (x, y) means: a label under the finger wins (it is the explicit target), then the smallest object box
 * holding the tap (the duck in the tub, a friend on the sofa), else nothing (a walk).
 */
export function pickHotspot<E>(spots: Iterable<Hotspot<E>>, x: number, y: number): E | null {
  let best: E | null = null, bestScore = Infinity;
  for (const s of spots) {
    if (s.label && holds(s.label, x, y)) { const score = -1e9 + area(s.label); if (score < bestScore) { bestScore = score; best = s.e; } continue; }
    if (s.rect && holds(s.rect, x, y)) { const score = area(s.rect); if (score < bestScore) { bestScore = score; best = s.e; } }
  }
  return best;
}
