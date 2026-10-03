import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DOG_TOSS_FLIGHT } from './guard-dog.ts';

/**
 * The guard dog's thrown bones (guard-dog.ts, combat.ts dogToss): a fixed pool drawn as one InstancedMesh (one draw, no
 * shadow), each flying a spinning arc from the dog's mouth to where the creature stood, landing as the hit arrives.
 * Nothing is allocated per frame: slots are reused, and a throw beyond the pool replaces the oldest bone.
 */
export const MAX_BONES = 8;
interface Bone { on: boolean; t: number; fx: number; fz: number; tx: number; tz: number; peak: number; spin: number }

/** A small cartoon bone: a shaft with two knobs at each end, cream white (original shape). */
function boneGeometry() {
  const shaft = new T.CylinderGeometry(.045, .045, .34, 8, 1); shaft.rotateZ(Math.PI / 2);
  const parts: T.BufferGeometry[] = [shaft];
  for (const x of [-.18, .18]) for (const z of [-.05, .05]) { const knob = new T.SphereGeometry(.065, 8, 6); knob.translate(x, 0, z); parts.push(knob); }
  const merged = mergeGeometries(parts.map(g => g.toNonIndexed()))!; for (const g of parts) g.dispose();
  merged.computeVertexNormals(); return merged;
}

export class DogTossView {
  readonly mesh: T.InstancedMesh;
  private bones: Bone[] = Array.from({ length: MAX_BONES }, () => ({ on: false, t: 0, fx: 0, fz: 0, tx: 0, tz: 0, peak: 0, spin: 0 }));
  private m = new T.Matrix4(); private q = new T.Quaternion(); private e = new T.Euler(); private v = new T.Vector3(); private s = new T.Vector3(1.5, 1.5, 1.5);
  constructor() {
    this.mesh = new T.InstancedMesh(boneGeometry(), new T.MeshLambertMaterial({ color: '#fff3dc', emissive: '#4a3a24', emissiveIntensity: .25 }), MAX_BONES);
    this.mesh.name = 'dog-bones'; this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.visible = false;
  }
  /** Starts a bone from (x, z) towards `facing` over `distance` metres (a 'toss' combat effect). */
  throw(x: number, z: number, facing: number, distance: number) {
    if (![x, z, facing, distance].every(Number.isFinite)) return;
    let slot = this.bones.find(b => !b.on);
    if (!slot) slot = this.bones.reduce((a, b) => (b.t > a.t ? b : a));
    const d = Math.max(.5, Math.min(12, distance));
    slot.on = true; slot.t = 0; slot.fx = x; slot.fz = z; slot.tx = x + Math.sin(facing) * d; slot.tz = z + Math.cos(facing) * d; slot.peak = 1.1 + d * .12; slot.spin = facing;
  }
  /** Bones in flight (for probes and tests). */
  get flying() { let n = 0; for (const b of this.bones) if (b.on) n++; return n; }
  update(dt: number) {
    let n = 0;
    for (const b of this.bones) {
      if (!b.on) continue;
      b.t += dt / DOG_TOSS_FLIGHT; if (b.t >= 1) { b.on = false; continue; }
      const k = b.t, x = b.fx + (b.tx - b.fx) * k, z = b.fz + (b.tz - b.fz) * k, y = .45 + 4 * b.peak * k * (1 - k) - .1 * k;
      this.m.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e.set(0, b.spin, k * 13)), this.s);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n; this.mesh.visible = n > 0; if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { for (const b of this.bones) b.on = false; this.mesh.count = 0; this.mesh.visible = false; }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); (this.mesh.material as T.Material).dispose(); }
}
