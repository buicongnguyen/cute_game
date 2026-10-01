import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutlines } from './outline.ts';
import { toonMaterial } from './toon.ts';

/**
 * The reference's target language: an open red ring under the creature you are fighting,
 * pulsing and turning, and a small bobbing arrow above its head (sizes and rates from the reference, RC-16). Red is kept for "your target";
 * shops, plots and other interactables keep the yellow ring, and danger zones are filled discs.
 */
export const TARGET_RED = '#ff4d5e';
/** The tap marker on the ground turns this red when the tap picked a creature (white on open ground). */
export const TAP_RED = '#ff5a5a';
/** Seconds the last creature you hit stays marked after the selection ends (the reference's lastHit). */
export const TARGET_HOLD = 3;

export interface TargetPose { x: number; y: number; z: number; footprint: number; height: number }

/** A chunky low-poly arrow pointing down: a six-sided head and a short shaft. */
function arrowGeometry() {
  const head = new T.ConeGeometry(.26, .36, 6).rotateX(Math.PI).translate(0, .18, 0);
  const shaft = new T.CylinderGeometry(.09, .09, .3, 6).translate(0, .5, 0);
  const merged = mergeGeometries([head.toNonIndexed(), shaft.toNonIndexed()], false)!;
  merged.computeVertexNormals();
  return merged;
}

/** Ring radius from the drawn body: a little wider than the footprint, never smaller than the hit circle. */
export function targetRingRadius(footprint: number, radius: number) { return Math.max(radius + .35, footprint * 1.15); }

export class TargetMarker {
  readonly root = new T.Group();
  readonly ring: T.Mesh;
  readonly arrow: T.Group;
  private spin = 0;

  constructor() {
    this.root.name = 'target-marker'; this.root.visible = false;
    const ring = new T.Mesh(
      new T.RingGeometry(.86, 1, 48, 1, 0, Math.PI * 1.7).rotateX(-Math.PI / 2),
      // Unlit, lifted off the ground with a polygon offset: the body hides the back of the ring and the front arc shows over the feet.
      new T.MeshBasicMaterial({ color: TARGET_RED, transparent: true, opacity: .85, depthWrite: false, side: T.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    ring.renderOrder = 10; ring.raycast = () => {}; ring.name = 'target-ring';
    this.ring = ring;
    const arrow = new T.Group(), body = new T.Mesh(arrowGeometry(), toonMaterial({ color: TARGET_RED, emissive: '#7a0a18', emissiveIntensity: .6, flatShading: true }));
    body.raycast = () => {}; arrow.add(body); addOutlines(arrow, { merge: true });
    arrow.name = 'target-arrow'; this.arrow = arrow;
    this.root.add(ring, arrow);
  }

  /** Follows the target (null hides the marker). */
  update(dt: number, time: number, target: TargetPose | null, radius = .7) {
    this.root.visible = !!target;
    if (!target) return;
    this.spin += dt;
    const r = targetRingRadius(target.footprint, radius) * (1 + Math.sin(time * 6) * .06);
    this.ring.position.set(target.x, target.y + .07, target.z); this.ring.scale.setScalar(r); this.ring.rotation.y = this.spin;
    this.arrow.position.set(target.x, target.y + target.height + .35 + Math.abs(Math.sin(time * 4)) * .35, target.z);
    this.arrow.rotation.y = time * 2.5;
  }
}
