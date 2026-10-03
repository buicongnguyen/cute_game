import * as T from 'three';
import { isShared } from './assets.ts';
import { fishLook, type FishingView } from './fishing-view.ts';
import type { Effects } from './fx.ts';
import { huntingPonds, type HuntPond, type HuntingState } from './fish-hunting.ts';
import { GUARDIAN_ID, GUARDIAN_POND, guardianPhase, guardianPose, guardianReady } from './lake-guardian.ts';

/** Drawn and updated only while the explorer is within this of the lake's centre (m); the lake is 11 m across the radius. */
export const GUARDIAN_VIEW_RANGE = 48;
const LAKE = huntingPonds('home').find(p => p.id === GUARDIAN_POND)!;
/** The guardian's lake while the explorer is on the home planet within GUARDIAN_VIEW_RANGE of it, else null. */
export function guardianLake(planet: string, at: { x: number; z: number }) {
  return planet === 'home' && Math.hypot(LAKE.x - at.x, LAKE.z - at.z) < GUARDIAN_VIEW_RANGE ? LAKE : null;
}
/** What a frame of the view reports, for the caller's hints: it just rose (once per up window), or nothing. */
export type GuardianEvent = 'surfaced' | null;

/**
 * A soft glow (or shade) on the water, no texture: vertex alpha by radius. A halo is clear in the middle (the fish
 * shows through it) and brightest at mid radius; a disc falls off from the centre.
 */
function softDisc(color: string, additive: boolean, halo = false) {
  const g = new T.RingGeometry(.001, 1, 28, 6), p = g.getAttribute('position'), c = new T.Color(color), rgba = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) { const r = Math.min(1, Math.hypot(p.getX(i), p.getY(i))), a = halo ? Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (r - .28) / .72))) ** 1.5) : (1 - r) * (1 - r); rgba.set([c.r, c.g, c.b, a], i * 4); }
  g.setAttribute('color', new T.BufferAttribute(rgba, 4)); g.rotateX(-Math.PI / 2);
  const m = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending, toneMapped: false });
  const mesh = new T.Mesh(g, m); mesh.renderOrder = 2; mesh.castShadow = mesh.receiveShadow = false; mesh.frustumCulled = false; return mesh;
}

/**
 * The Lake Guardian in the meadow lake (rules: lake-guardian.ts). Shown with any gear, so an angler sees it and learns
 * a harpoon is needed; the hunting view only adds it as a target. Cost while near the lake: the fish model (body + tail)
 * and two soft discs (a glow over it, its shadow before it rises): four draws, no shadow casting. Ripples and sparkles
 * use the shared pooled effects. Nothing is drawn while it is down, already caught by this explorer, or far away.
 */
export class LakeGuardianView {
  readonly group = new T.Group();
  private fish: { obj: T.Group; tail: T.Object3D | null } | null = null;
  private kitReady: boolean | null = null;
  /** An additive aqua halo (a normal-blended gold one muddied the blue water to olive). */
  private glow = softDisc('#5ff5e6', true, true);
  private shade = softDisc('#06222e', false);
  private ripple = 0; private sparkle = 0;
  /** The up window already announced (its start time). */
  private announced = -1;
  constructor(scene: T.Scene, private fishing: FishingView) {
    this.group.name = 'lake-guardian'; this.group.visible = false;
    this.group.add(this.glow, this.shade); scene.add(this.group);
  }
  attach(scene: T.Scene) { if (this.group.parent !== scene) scene.add(this.group); }
  /** True while the fish is drawn (for probes and tests). */
  get showing() { return this.group.visible && !!this.fish?.obj.visible; }
  /** Where the fish is drawn now (null while hidden). */
  get position() { return this.showing ? this.fish!.obj.position : null; }
  /**
   * One frame. `pond` is the guardian's lake when the explorer is home and near it (else null: everything hides);
   * `now` is the hunting clock (server-synced online); `hunting` the explorer's save (a caught guardian stays away).
   */
  update(dt: number, pond: HuntPond | null, now: number, hunting: HuntingState | undefined, kitReady: boolean, fx?: Effects | null): GuardianEvent {
    const phase = pond ? guardianPhase(now) : null, ready = guardianReady(hunting, now);
    if (!pond || !phase || !ready || phase.phase === 'deep') { this.group.visible = false; return null; }
    if (this.kitReady !== kitReady || !this.fish) this.build(kitReady);
    const fish = this.fish!, [scale, top, wag] = fishLook(GUARDIAN_ID), pose = guardianPose(pond, now), surface = pond.surface;
    this.group.visible = true;
    const t = now / 1000, up = phase.phase === 'up', rise = up ? phase.rise : 0;
    // Before it rises only its deep shadow drifts; then it lifts to swimming depth and the glow blooms.
    const stir = up ? 1 : Math.max(0, 1 - (phase.start - now) / 20_000);
    fish.obj.visible = rise > .02;
    // Risen, its back breaks the surface (ordinary fish keep their body under it): it reads in full colour through the water.
    fish.obj.position.set(pose.x, surface - top * scale * .55 - (1 - rise) * .45, pose.z);
    fish.obj.rotation.y = pose.facing; fish.obj.scale.setScalar(scale * (.8 + .2 * rise));
    if (fish.tail) fish.tail.rotation.y = Math.sin(t * 2.4) * wag;
    // A halo hugging the fish's length (clear in the middle so the koi itself stays readable), breathing slowly.
    const breathe = 1 + .08 * Math.sin(t * 1.7);
    this.glow.position.set(pose.x, surface + .02, pose.z); this.glow.rotation.y = pose.facing; this.glow.scale.set(.95 * breathe, 1, 1.45 * breathe);
    (this.glow.material as T.MeshBasicMaterial).opacity = rise * (.55 + .15 * Math.sin(t * 2.3));
    this.shade.position.set(pose.x, surface + .012, pose.z); this.shade.rotation.y = pose.facing; this.shade.scale.set(.85, 1, 1.7);
    (this.shade.material as T.MeshBasicMaterial).opacity = (up ? .25 * (1 - rise) + .12 : .45 * stir);
    // Rings on the water: slow and wide while it stirs below, quicker over it while it swims.
    if (fx && (this.ripple -= dt) <= 0) {
      this.ripple = up ? 1.3 : 2.2;
      fx.ring({ x: pose.x, z: pose.z }, { color: up ? '#c9fff7' : '#e6f6ff', from: .4, to: up ? 2.4 : 3.2, life: up ? 1.1 : 1.6, y: surface + .03, thick: .12, opacity: up ? .7 : .45 * stir + .1 });
    }
    if (fx && up && (this.sparkle -= dt) <= 0) {
      this.sparkle = .55;
      fx.burst({ x: pose.x, y: surface, z: pose.z }, { n: 2, color: ['#bffff6', '#ffe28a'], glow: true, speed: .5, up: 1.4, size: .07, life: 1.1, gravity: 0, spread: 3, y: .06 });
    }
    if (up && rise > .2 && this.announced !== phase.start) { this.announced = phase.start; return 'surfaced'; }
    return null;
  }
  /** A caught guardian leaves in a splash of light; the view hides it until the explorer may catch it again. */
  caught(at: { x: number; z: number }, surface: number, fx?: Effects | null) {
    fx?.burst({ x: at.x, y: surface, z: at.z }, { n: 26, color: ['#ffffff', '#7ffff0', '#ffd95a'], glow: true, speed: 4, up: 6, y: .1 });
    fx?.ring({ x: at.x, z: at.z }, { color: '#ffe66d', from: .3, to: 3.4, life: .8, y: surface + .03 });
    this.group.visible = false;
  }
  private build(kitReady: boolean) {
    // Kit fish share the kit's geometry and materials; only the simple stand-in owns its own.
    if (this.fish) { this.group.remove(this.fish.obj); this.fish.obj.traverse(o => { if (o instanceof T.Mesh) { if (!isShared(o.geometry)) o.geometry.dispose(); for (const m of [o.material].flat()) if (!isShared(m)) m.dispose(); } }); }
    this.kitReady = kitReady;
    const fish = this.fishing.makeFish(GUARDIAN_ID); fish.obj.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
    fish.obj.name = 'lake-guardian-fish'; this.fish = fish; this.group.add(fish.obj);
  }
}
