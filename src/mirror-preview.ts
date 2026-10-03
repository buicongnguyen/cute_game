import * as T from 'three';
import { planetLight } from './toon.ts';
import { dropTree } from './dispose-tree.ts';

/**
 * The mirror's framed portrait (look-shop.ts) and a friend's (friend-looks-ui.ts): a small offscreen three.js render
 * of the real avatar in the combination being tried, drawn only when what it shows changes. Each show() call names
 * what the picture depends on (the combination, colour, gear, which kits have arrived, the frame's size); the same key
 * again costs nothing, so the panel can re-render its HTML on every tap (the canvas is simply put back in its slot,
 * picture and all). A new key builds the avatar, renders it once, copies the pixels into the panel's own 2D canvas and
 * frees the avatar: no per-frame work, nothing left in the world's scene.
 *
 * One small WebGL renderer serves every preview (like icons.ts), created on first use. It keeps the world's toon look:
 * no tone mapping and the home planet's lights. Framing: `reach` fixes how many model units of height the glass shows
 * (the explorer's mirror: the tallest look fits, so Tiny to Grown-up visibly grows in it); without it the model is
 * fitted (a friend, whose height growth sets).
 */
export interface PreviewRenderer {
  render(scene: T.Scene, camera: T.Camera): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  domElement: CanvasImageSource;
}
let shared: PreviewRenderer | null = null;
function makeRenderer(): PreviewRenderer {
  const r = new T.WebGLRenderer({ alpha: true, antialias: true });
  r.setPixelRatio(1); r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.NoToneMapping; r.setClearColor(0x000000, 0);
  return r;
}
const box = new T.Box3(), size = new T.Vector3(), centre = new T.Vector3();
/** The explorer's idle stance (world.ts: arms a little out), so a portrait does not stand stiff. */
export function restPose<O extends T.Object3D>(model: O): O {
  model.getObjectByName('arm-left')?.rotation.set(0, 0, -.3); model.getObjectByName('arm-right')?.rotation.set(0, 0, .3); return model;
}

export interface MirrorOptions {
  /** Model units of height the glass shows; omitted: fit the model. */
  reach?: number;
  /** Turn of the model toward the light (radians), so the face and one side read. */
  yaw?: number;
  /** Fallback CSS size before the slot has a layout (hidden or not yet attached). */
  width?: number; height?: number;
  /** Tests inject these (Node has no WebGL or DOM canvas). */
  renderer?: PreviewRenderer; canvas?: HTMLCanvasElement;
}
export class MirrorPreview {
  /** Renders done: tests and probes check that a repaint with nothing changed costs none. */
  renders = 0;
  readonly canvas: HTMLCanvasElement;
  private key = '';
  private readonly scene = new T.Scene();
  private readonly camera = new T.PerspectiveCamera(20, 1, .1, 80);
  private readonly holder = new T.Group();
  private readonly opts: MirrorOptions;
  constructor(opts: MirrorOptions = {}) {
    this.opts = opts;
    this.canvas = opts.canvas ?? document.createElement('canvas'); this.canvas.className = 'mirror-canvas';
    const l = planetLight('home'), sun = new T.DirectionalLight(l.sun, l.sunIntensity); sun.position.set(2.5, 6, 7);
    this.scene.add(new T.HemisphereLight(l.sky, l.ground, l.hemi), sun, this.holder);
  }
  /** Forget the last picture (the next show() renders even with the same key). */
  reset() { this.key = ''; }
  /**
   * Puts the canvas into `slot` and draws `build()` when `key` (plus the slot's size) differs from the last drawing.
   * Returns true when it rendered. `build` is called only then; its model is freed right after.
   */
  show(slot: Element | null | undefined, key: string, build: () => T.Object3D | null): boolean {
    if (slot && this.canvas.parentElement !== slot) slot.replaceChildren(this.canvas);
    const el = slot as HTMLElement | null | undefined, w = Math.round(el?.clientWidth || this.opts.width || 160), h = Math.round(el?.clientHeight || this.opts.height || 220);
    const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1)), full = `${key}|${w}x${h}@${dpr}`;
    if (full === this.key) return false;
    this.key = full; // set first: a model or GL failure is not retried on every repaint
    let model: T.Object3D | null = null;
    try {
      model = build(); if (!model) return false;
      const r = this.opts.renderer ?? (shared ??= makeRenderer()), pw = Math.round(w * dpr), ph = Math.round(h * dpr);
      this.holder.add(model); model.rotation.y += this.opts.yaw ?? -.42; this.frame(model, w / h);
      r.setSize(pw, ph, false); r.render(this.scene, this.camera);
      // Copied at once, in the same task as the render, so the GL canvas needs no preserved drawing buffer.
      this.canvas.width = pw; this.canvas.height = ph;
      const ctx = this.canvas.getContext('2d'); ctx?.clearRect(0, 0, pw, ph); ctx?.drawImage(r.domElement, 0, 0);
      this.renders++; return true;
    } catch { return false; } finally { if (model) { this.holder.remove(model); dropTree(model); } }
  }
  /** Aims the camera: feet near the glass's bottom edge, a little above eye level, the whole figure in. */
  private frame(model: T.Object3D, aspect: number) {
    model.updateMatrixWorld(true); box.setFromObject(model); box.getSize(size); box.getCenter(centre);
    const reach = this.opts.reach, height = reach ?? size.y * 1.1, floor = reach ? box.min.y - .06 : centre.y - height / 2;
    const span = Math.max(height, (Math.max(size.x, size.z) * 1.08) / aspect), mid = floor + span / 2;
    const fov = T.MathUtils.degToRad(this.camera.fov), dist = span / 2 / Math.tan(fov / 2) + size.z / 2;
    this.camera.aspect = aspect; this.camera.position.set(0, mid + dist * .1, dist); this.camera.lookAt(0, mid, 0); this.camera.updateProjectionMatrix();
  }
}
