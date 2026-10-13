import * as T from 'three';
import { modelShot } from './icons.ts';
import { restPose } from './mirror-preview.ts';
import { dropTree } from './dispose-tree.ts';
import type { Fit } from './looks.ts';

/**
 * The face on the hero plate (top-left HUD card): the explorer as they look now, head and shoulders, with the hat they
 * wear or the disguise that is on, seen from a camera looking down at 30 degrees.
 *
 * It is a still picture. The speed rule (docs/QUALITY-PLAN.md section 2) allows no per-frame cost, so:
 *   - `portraitKey` names everything the picture shows (look, shirt colour, hat and outfit or the disguise over them,
 *     dye, and which art files have arrived). Nothing else can change it.
 *   - `Portraits` draws a key once and keeps the PNG; the same key again is a map lookup.
 *   - `PortraitTile` is told when the explorer was rebuilt (never per frame), shows a kept picture at once, and leaves a
 *     new drawing for an idle moment, out of a fight.
 * The drawing borrows the item-icon renderer (icons.ts modelShot), so the page opens no further WebGL context.
 * When the explorer's file has not arrived, or the picture cannot be read back, the tile keeps its sprout icon.
 *
 * `spec -> image` knows nothing about the local player: another explorer's presence (colour, look, gear) draws the
 * same way, should the online list want faces later.
 */
export interface PortraitSpec {
  color: string;
  look: string;
  gear: { hat?: string; outfit?: string; disguise?: string };
}

/**
 * Everything the picture depends on. A disguise covers the hat and the outfit (World.avatar draws neither under it), so
 * changing those under a costume is not a new picture; the weapon, boots and companion are never in frame.
 * `art` says which of the files it is drawn from have arrived (World.avatarArt).
 */
export function portraitKey(spec: PortraitSpec, art = ''): string {
  const g = spec.gear, worn = g.disguise ? `d:${g.disguise}` : `h:${g.hat ?? ''}|o:${g.outfit ?? ''}`;
  return `${spec.look}|${spec.color}|${worn}|${art}`;
}

/**
 * The shot: degrees the camera looks down from, the model's turn from the camera (radians), the lens, and the frame in
 * head heights: `chin` of shoulders under the head, at least `min` and at most `max` tall (a taller hat loses its
 * tip rather than shrinking the face further), and up to `wide` head widths for a brim. `aside` moves the head that
 * share of the frame to the left: the plate's level badge sits on the tile's lower right corner, over the far shoulder.
 */
export const PORTRAIT = { pitch: 30, yaw: -.3, fov: 20, chin: .3, min: 1.25, max: 1.75, wide: 1.4, margin: 1.03, aside: .2 } as const;

interface Span { lo: number; hi: number }
const part = new T.Box3(), mid = new T.Vector3(), half = new T.Vector3(), right = new T.Vector3(), up = new T.Vector3(), back = new T.Vector3(), headMid = new T.Vector3();
/**
 * How far a mesh reaches along `axis`, taking it as the rounded shape that fills its box (an ellipsoid): the chibi's
 * head, hoods and hats are round, and a box's corners would frame them a third too loosely. Upward it leans most of the way to
 * the box, because ears and horns do sit in its top corners.
 */
function reach(mesh: T.Mesh, axis: T.Vector3, span: Span, floor = -Infinity) {
  mesh.geometry.boundingBox ?? mesh.geometry.computeBoundingBox(); part.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
  if (part.min.y < floor) part.min.y = Math.min(floor, part.max.y); // the neck under the chin is not the face
  part.getCenter(mid); part.getSize(half).multiplyScalar(.5);
  const at = mid.dot(axis), round = Math.hypot(half.x * axis.x, half.y * axis.y, half.z * axis.z), square = Math.abs(half.x * axis.x) + Math.abs(half.y * axis.y) + Math.abs(half.z * axis.z);
  span.lo = Math.min(span.lo, at - round); span.hi = Math.max(span.hi, at + (axis.y > .5 ? round * .35 + square * .65 : round));
}
/** A worn piece carries its body part after an @ (assets.ts: "hat_wizard@head_1"); the inked hull is named "outline". */
const isWorn = (o: T.Object3D) => o.name.includes('@');
/**
 * Aims `camera` at the head of the explorer in `holder`: 30 degrees above the horizon, a little to one side of the
 * face. The frame is fixed to the head itself, so the face is the same readable size under every hat: it starts a
 * little below the chin and rises to the top of whatever rides the head (hat, hood, ears, the sprout), within PORTRAIT's
 * limits. A model without a head part (the stand-in shapes) is framed by its upper half.
 */
export function aimPortrait(camera: T.PerspectiveCamera, holder: T.Object3D): void {
  holder.rotation.y = PORTRAIT.yaw; holder.updateMatrixWorld(true);
  const pitch = T.MathUtils.degToRad(PORTRAIT.pitch);
  back.set(0, Math.sin(pitch), Math.cos(pitch)); right.set(1, 0, 0); up.crossVectors(back, right);
  const head = holder.getObjectByName('head'), root = head ?? holder;
  const faceU: Span = { lo: Infinity, hi: -Infinity }, faceR: Span = { lo: Infinity, hi: -Infinity }, allU: Span = { lo: Infinity, hi: -Infinity }, allR: Span = { lo: Infinity, hi: -Infinity };
  const face = new T.Box3();
  // The Tall and Grown heads carry their neck (a column down into the torso, build_hero_styles.py neck_geo): the frame
  // is measured from the chin, which sits 0.12 head scales under the head's pivot (hero_spec: neck 1.12, chin 1.0).
  let chin = -Infinity;
  if (head) { let o: T.Object3D | null = head, scale = 1; for (; o; o = o.parent) { const f = (o.userData.fit as Partial<Record<string, Fit>> | undefined)?.head; if (f) { scale = f.scale[1]; break; } } head.getWorldPosition(mid); chin = mid.y - .13 * scale * head.getWorldScale(half).y; }
  root.traverseVisible(o => {
    const m = o as T.Mesh; if (!m.isMesh || m.name === 'outline') return;
    const own = !isWorn(m), floor = own ? chin : -Infinity;
    reach(m, up, allU, floor); reach(m, right, allR, floor);
    if (own) { reach(m, up, faceU, floor); reach(m, right, faceR, floor); face.union(part); }
  });
  if (face.isEmpty()) { face.setFromCenterAndSize(mid.set(0, 1.6, 0), half.set(1.2, 1.2, 1.2)); faceU.lo = allU.lo = 1.6 * up.y - .6; faceU.hi = allU.hi = 1.6 * up.y + .6; faceR.lo = allR.lo = -.6; faceR.hi = allR.hi = .6; }
  if (!head) { faceU.lo = allU.lo = (faceU.lo + faceU.hi) / 2; }
  const tall = faceU.hi - faceU.lo, wide = faceR.hi - faceR.lo, floor = faceU.lo - PORTRAIT.chin * tall;
  const wanted = Math.max(allU.hi - floor, PORTRAIT.min * tall, Math.min(allR.hi - allR.lo, PORTRAIT.wide * wide));
  const size = Math.min(wanted, Math.max(PORTRAIT.max * tall, PORTRAIT.min * tall));
  // Centred on the head across; up, from just under the chin. A frame wider than it needs to be tall shares the spare room.
  const spare = Math.max(0, size - (allU.hi - floor)), centreU = floor - spare * .35 + size / 2, centreR = (faceR.lo + faceR.hi) / 2 + PORTRAIT.aside * size;
  face.getCenter(headMid);
  const target = headMid.addScaledVector(up, centreU - headMid.dot(up)).addScaledVector(right, centreR - headMid.dot(right));
  const distance = size * PORTRAIT.margin / 2 / Math.tan(T.MathUtils.degToRad(PORTRAIT.fov / 2));
  camera.fov = PORTRAIT.fov; camera.aspect = 1; camera.updateProjectionMatrix();
  camera.position.copy(target).addScaledVector(back, distance); camera.lookAt(target);
}

/**
 * One face picture of a freshly built explorer (a PNG data URL, '' on any failure), on the item-icon renderer. The model
 * is freed right after; kit geometry and materials are shared and stay (dispose-tree.ts).
 */
export function portraitShot(build: () => T.Object3D | null): string {
  return modelShot(() => { const model = build(); return model && restPose(model); }, aimPortrait, holder => { for (const child of [...holder.children]) dropTree(child); });
}

/** A PNG data URL with something in it (a lost context reads back a few hundred bytes of nothing). */
export const usablePicture = (url: unknown): url is string => typeof url === 'string' && url.startsWith('data:image/') && url.length > 900;

/**
 * Pictures by key, drawn once each. `draw` returns a data URL ('' or a throw is a failure). A failure is remembered
 * too, so a broken renderer is asked once per look and not on every change of gear. The oldest pictures go when more
 * than `max` are kept (each is a few KB of text).
 */
export class Portraits {
  /** Drawings made: tests and the browser probe check that an unchanged explorer costs none. */
  renders = 0;
  private readonly kept = new Map<string, string>();
  private readonly draw: (spec: PortraitSpec) => string;
  private readonly max: number;
  constructor(draw: (spec: PortraitSpec) => string, max = 12) { this.draw = draw; this.max = max; }
  /** The kept picture ('' = it failed), or undefined when this key was never drawn. */
  peek(key: string): string | undefined {
    const url = this.kept.get(key); if (url !== undefined) { this.kept.delete(key); this.kept.set(key, url); }
    return url;
  }
  /** The picture for `spec`, drawing it if it is new. '' means: show the fallback. */
  get(spec: PortraitSpec, art = ''): string {
    const key = portraitKey(spec, art), known = this.peek(key); if (known !== undefined) return known;
    let url = '';
    try { this.renders++; const made = this.draw(spec); url = usablePicture(made) ? made : ''; } catch { url = ''; }
    this.kept.set(key, url);
    for (const old of this.kept.keys()) { if (this.kept.size <= this.max) break; this.kept.delete(old); }
    return url;
  }
}

export interface PortraitTileOptions {
  portraits: Portraits;
  /** Puts the picture in the tile; '' puts the fallback icon back. */
  show: (url: string) => void;
  /** True while a fight is on: a new drawing waits. */
  busy?: () => boolean;
  /** Runs `fn` at an idle moment; `again` marks a re-check after a busy one. Tests pass a queue. */
  later?: (fn: () => void, again: boolean) => void;
  /** How many busy re-checks before it draws anyway (the default is about half a minute). */
  patience?: number;
}
const whenIdle = (fn: () => void, again: boolean) => {
  if (again) setTimeout(fn, 600);
  else if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 1500 });
  else setTimeout(fn, 150);
};

/**
 * The tile's side: call `want` whenever the explorer may look different (after it is rebuilt), with null while there is
 * nothing to draw from. Same look as shown: nothing happens. A look drawn before: shown at once. A new look: the old
 * picture stays until an idle moment out of a fight, then one drawing replaces it. Several changes while waiting make
 * one drawing, of the last.
 */
export class PortraitTile {
  private readonly o: PortraitTileOptions;
  private wanted = '';
  private shown: string | null = null;
  private spec: PortraitSpec | null = null;
  private art = '';
  private waiting = false;
  private waits = 0;
  constructor(options: PortraitTileOptions) { this.o = options; }
  want(spec: PortraitSpec | null, art = ''): void {
    if (!spec) { this.wanted = ''; this.spec = null; this.put(''); return; }
    const key = portraitKey(spec, art); if (key === this.wanted) return;
    this.wanted = key; this.spec = { color: spec.color, look: spec.look, gear: { hat: spec.gear.hat, outfit: spec.gear.outfit, disguise: spec.gear.disguise } }; this.art = art;
    const known = this.o.portraits.peek(key);
    if (known !== undefined) { this.put(known); return; }
    if (!this.waiting) { this.waiting = true; this.waits = 0; (this.o.later ?? whenIdle)(this.turn, false); }
  }
  private readonly turn = () => {
    if (!this.spec) { this.waiting = false; return; }
    if (this.o.portraits.peek(this.wanted) === undefined && this.o.busy?.() && this.waits++ < (this.o.patience ?? 50)) { (this.o.later ?? whenIdle)(this.turn, true); return; }
    this.waiting = false; this.put(this.o.portraits.get(this.spec, this.art));
  };
  private put(url: string) { if (url !== this.shown) { this.shown = url; this.o.show(url); } }
}

/**
 * The plate's tile in the page: an <img> beside the tile's icon, shown (class `has-face`, hud-ours.css) while there is a
 * picture. Returns the function to call when the explorer may look different.
 */
export function mountHeroFace(tile: HTMLElement | null, o: { spec: () => PortraitSpec | null; art: (spec: PortraitSpec) => string; draw: (spec: PortraitSpec) => string; busy?: () => boolean }): { sync: () => void; portraits: Portraits } {
  const portraits = new Portraits(o.draw), img = tile?.querySelector<HTMLImageElement>('img.hero-pic');
  const view = new PortraitTile({ portraits, busy: o.busy, show: url => { if (!tile || !img) return; if (url) img.src = url; else img.removeAttribute('src'); img.hidden = !url; tile.classList.toggle('has-face', !!url); } });
  // A tile the layout hides (phones of 360 px and narrower) is not drawn for; turning the phone asks again.
  const sync = () => { if (!tile || getComputedStyle(tile).display === 'none') return; const spec = o.spec(); view.want(spec, spec ? o.art(spec) : ''); };
  addEventListener('resize', sync);
  return { portraits, sync };
}
