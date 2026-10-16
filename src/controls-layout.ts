/**
 * Custom button layouts (Settings > Controls > Move buttons): pure rules, no DOM (controls-ui.ts does the measuring).
 *
 * What moves: the skill buttons as ONE group (the arc of three or four toes keeps its shape; a disguise adds and removes the
 * fourth, the moves switch reorders them, and four separate small targets are fiddly to drag on a phone, while the group is
 * one big easy handle), the Attack button, the Jump button, the quick-eat button (with its food picker) and the joystick.
 *
 * Where it is kept: one layout per screen type (phone portrait, phone landscape, PC) on this device. Each part is stored by
 * the screen corner it is nearest to, as its gaps to those two edges in fractions of the screen, so a layout survives a
 * slightly different size (a browser bar, another phone). A layout that does not fit when it is applied (a part out of
 * the safe area, over the map, the hero plate, the menu dock, the quest cards, or another part) is not used: the screen
 * type falls back to the default and the saved one waits for a screen it fits.
 */
export const PARTS = ['skills', 'attack', 'jump', 'eat', 'stick'] as const;
export type Part = typeof PARTS[number];
export type ScreenType = 'portrait' | 'landscape' | 'desktop';
export const SCREEN_TYPES: readonly ScreenType[] = ['portrait', 'landscape', 'desktop'];
export interface Box { l: number; t: number; w: number; h: number }
/** A part's place: the nearest horizontal edge ('l'/'r') and vertical edge ('t'/'b'), and its gaps to them as screen fractions. */
export interface Spot { h: 'l' | 'r'; v: 't' | 'b'; x: number; y: number }
export type Layout = Partial<Record<Part, Spot>>;
export interface View { w: number; h: number }
/** The snapping grid, in CSS pixels. */
export const GRID = 8;

/** The screen type: the paw layout's screens (touch, or a window up to 900 x 520) by orientation, otherwise the PC tray. */
export function screenType(view: View, touchLayout: boolean): ScreenType {
  return !touchLayout ? 'desktop' : view.w > view.h ? 'landscape' : 'portrait';
}
export const snap = (v: number, grid = GRID) => Math.round(v / grid) * grid;
export const right = (b: Box) => b.l + b.w, bottom = (b: Box) => b.t + b.h;
export const overlaps = (a: Box, b: Box) => a.l < right(b) && b.l < right(a) && a.t < bottom(b) && b.t < bottom(a);
export const inside = (a: Box, safe: Box) => a.l >= safe.l - .5 && a.t >= safe.t - .5 && right(a) <= right(safe) + .5 && bottom(a) <= bottom(safe) + .5;
/** Keep a box inside the safe area (a box larger than it sticks to its top-left). */
export function clampInto(b: Box, safe: Box): Box {
  return { ...b, l: Math.max(safe.l, Math.min(b.l, right(safe) - b.w)), t: Math.max(safe.t, Math.min(b.t, bottom(safe) - b.h)) };
}
/** A dragged box: moved by (dx, dy) from where the drag began, its corner on the 8 px grid, then kept inside the safe area. */
export function dragTo(start: Box, dx: number, dy: number, safe: Box): Box {
  return clampInto({ ...start, l: snap(start.l + dx), t: snap(start.t + dy) }, safe);
}
/** A box as a spot: anchored to the nearer of each pair of edges. */
export function toSpot(b: Box, view: View): Spot {
  const h = b.l + b.w / 2 <= view.w / 2 ? 'l' : 'r', v = b.t + b.h / 2 <= view.h / 2 ? 't' : 'b';
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return { h, v, x: round((h === 'l' ? b.l : view.w - right(b)) / view.w), y: round((v === 't' ? b.t : view.h - bottom(b)) / view.h) };
}
/** Where a spot puts a part of this size on this screen. */
export function fromSpot(s: Spot, size: { w: number; h: number }, view: View): Box {
  const l = s.h === 'l' ? s.x * view.w : view.w - s.x * view.w - size.w, t = s.v === 't' ? s.y * view.h : view.h - s.y * view.h - size.h;
  return { l: Math.round(l), t: Math.round(t), w: size.w, h: size.h };
}
export function validSpot(s: unknown): s is Spot {
  const o = s as Spot;
  return !!o && (o.h === 'l' || o.h === 'r') && (o.v === 't' || o.v === 'b') && Number.isFinite(o.x) && Number.isFinite(o.y) && o.x >= 0 && o.x <= 1 && o.y >= 0 && o.y <= 1;
}
export function cleanLayout(raw: unknown): Layout | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Layout = {};
  for (const p of PARTS) { const s = (raw as Record<string, unknown>)[p]; if (validSpot(s)) out[p] = { h: s.h, v: s.v, x: s.x, y: s.y }; }
  return Object.keys(out).length ? out : null;
}
export interface Obstacle { name: string; box: Box }
/** What a part's box runs into: 'edge' when it leaves the safe area, then each obstacle or other part it overlaps. */
export function conflictsOf(box: Box, safe: Box, others: readonly Obstacle[]): string[] {
  const out: string[] = [];
  if (!inside(box, safe)) out.push('edge');
  for (const o of others) if (o.box.w > 0 && o.box.h > 0 && overlaps(box, o.box)) out.push(o.name);
  return out;
}
/**
 * Does a set of placed parts fit? Each part inside the safe area, over no obstacle and no other part. Parts that are not
 * shown (no size) are skipped; with `only`, just those parts are checked (against everything). Returns the first conflict as [part, what], or null when it all fits.
 */
export function layoutConflict(boxes: Partial<Record<Part, Box>>, safe: Box, obstacles: readonly Obstacle[], only?: readonly Part[]): [Part, string] | null {
  const shown = PARTS.filter(p => boxes[p] && boxes[p]!.w > 0 && boxes[p]!.h > 0);
  // `only`: the parts the layout placed. Two parts both standing where the default sheets put them are the default's business.
  for (const p of shown.filter(p => !only || only.includes(p))) {
    const others = [...obstacles, ...shown.filter(q => q !== p).map(q => ({ name: q, box: boxes[q]! }))];
    const hit = conflictsOf(boxes[p]!, safe, others)[0];
    if (hit) return [p, hit];
  }
  return null;
}
/** A saved layout placed on this screen with the parts' current sizes, or null when it no longer fits (fall back to the default). */
export function fitLayout(layout: Layout, sizes: Partial<Record<Part, { w: number; h: number }>>, view: View, safe: Box, obstacles: readonly Obstacle[]): Partial<Record<Part, Box>> | null {
  const boxes: Partial<Record<Part, Box>> = {};
  for (const p of PARTS) { const s = layout[p], size = sizes[p]; if (s && size && size.w > 0 && size.h > 0) boxes[p] = fromSpot(s, size, view); }
  return layoutConflict(boxes, safe, obstacles) ? null : boxes;
}

/** Button size: Small / Normal / Large scale the fight buttons; none ever drops under a 44 px touch target. */
export const SIZES = { small: .85, normal: 1, large: 1.2 } as const;
export type ButtonSize = keyof typeof SIZES;
export const MIN_TAP = 44;
export const scaledButton = (base: number, size: ButtonSize) => Math.max(MIN_TAP, Math.round(base * SIZES[size] * 10) / 10);
/** Resting opacity of the fight buttons and joystick (full while pressed). */
export const OPACITIES = [100, 80, 60] as const;
export type ButtonOpacity = typeof OPACITIES[number];
