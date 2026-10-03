import * as T from 'three';
import { dogRig, dogCoat, animalMaterial, SHOWN, type Rig } from './farm-view.ts';
import { newGait, stepGait, type Gait } from './walk-cycle.ts';

/**
 * Guard dogs out of their pen (guard-dog.ts): yours trotting after you in the wilds or on another planet, and other
 * explorers' dogs after them. They are the pen's puppy (farm.glb `dog`, rigid parts) drawn as one InstancedMesh per
 * part (body, head, tail, the four legs as one), so any number of dogs costs four draws, and only the body casts a
 * shadow. Legs use the shared walk cycle (walk-cycle.ts): the cadence follows the ground covered, diagonal pairs
 * swing together, and the swing fades in and out as the dog starts and stops; standing still it sits and wags.
 */
export interface DogPose { key: string; x: number; z: number; y?: number; heading: number; coat: number }
/** Most dogs drawn at once: yours and a room's worth of explorers. */
export const MAX_DOGS = 12;
/** Drawn at the pen's size; its hip height (metres) is the walk cycle's leg length. */
const SIZE = SHOWN.dog, LEG = .19 * SIZE;
interface Live { gait: Gait; x: number; z: number; still: number; sit: number; seed: number; seen: boolean; /** 1 at a throw, fading to 0 over TOSS_TIME: the head-toss. */ toss: number }
/** Seconds a head-toss takes (the bone leaves at its top). */
const TOSS_TIME = .4;

export class DogFollowView {
  readonly group = new T.Group();
  private rig: Rig | null = null;
  private meshes: { mesh: T.InstancedMesh; part: Rig['parts'][number]; coatA: T.InstancedBufferAttribute; coatB: T.InstancedBufferAttribute }[] = [];
  private live = new Map<string, Live>();
  private m = new T.Matrix4(); private root = new T.Matrix4(); private local = new T.Matrix4(); private q = new T.Quaternion(); private e = new T.Euler(); private v = new T.Vector3(); private s = new T.Vector3(); private one = new T.Vector3(1, 1, 1);
  constructor() { this.group.name = 'guard-dogs'; }
  /** Rebuilds the parts (once farm.glb has loaded, the puppy replaces the stand-in). */
  refresh() { this.disposeMeshes(); }
  private build() {
    const rig = this.rig = dogRig(), material = animalMaterial();
    for (const part of rig.parts) {
      const max = MAX_DOGS * part.pivots.length, g = part.geometry;
      const coatA = new T.InstancedBufferAttribute(new Float32Array(max * 4), 4), coatB = new T.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      g.setAttribute('coatA', coatA); g.setAttribute('coatB', coatB);
      const mesh = new T.InstancedMesh(g, material, max); mesh.name = `guard-dog-${part.draw}`; mesh.count = 0; mesh.frustumCulled = false;
      mesh.castShadow = part.draw === 'body'; mesh.receiveShadow = true; this.group.add(mesh);
      this.meshes.push({ mesh, part, coatA, coatB });
    }
  }
  /** Poses every dog in `dogs` (world metres) for this frame; the ones left out vanish. */
  update(dt: number, time: number, dogs: readonly DogPose[]) {
    if (!dogs.length) { for (const p of this.meshes) p.mesh.count = 0; this.group.visible = false; this.live.clear(); return; }
    if (!this.rig) this.build();
    this.group.visible = true;
    for (const p of this.meshes) p.mesh.count = 0;
    for (const key of this.live.keys()) if (!dogs.some(d => d.key === key)) this.live.delete(key);
    for (let n = 0; n < dogs.length && n < MAX_DOGS; n++) {
      const d = dogs[n]; let l = this.live.get(d.key);
      if (!l) { l = { gait: newGait(), x: d.x, z: d.z, still: 0, sit: 0, seed: (n * 2.399) % 6.28, seen: true, toss: 0 }; this.live.set(d.key, l); }
      let dist = Math.hypot(d.x - l.x, d.z - l.z); if (dist > 3) dist = 0; // a placement is not a step
      l.x = d.x; l.z = d.z; stepGait(l.gait, dist, dt, LEG);
      l.toss = Math.max(0, l.toss - dt / TOSS_TIME);
      l.still = dist > dt * .05 || l.toss > 0 ? 0 : l.still + dt;
      // After a moment standing still it sits; it gets up the instant it moves.
      l.sit += ((l.still > 1.2 ? 1 : 0) - l.sit) * (1 - Math.exp(-dt * (l.still > 1.2 ? 4 : 12)));
      const b = l.gait.blend, phase = l.gait.phase, bob = Math.abs(Math.cos(phase)) * .045 * b, swing = .75 * b;
      this.root.compose(this.v.set(d.x, (d.y ?? 0) + bob - l.sit * .07, d.z), this.q.setFromEuler(this.e.set(-l.sit * .32, d.heading, 0)), this.s.setScalar(SIZE));
      const coat = dogCoat(d.coat);
      for (const p of this.meshes) {
        const part = p.part;
        for (let j = 0; j < part.pivots.length; j++) {
          const at = part.pivots[j].at, sign = part.pivots[j].sign; let rx = 0, ry = 0;
          if (part.draw === 'legs') {
            // Front legs stand straight while sitting (the body tilts back); the back legs fold forward under it.
            const front = at.z > 0; rx = sign * Math.sin(phase) * swing + (front ? l.sit * .32 : -l.sit * 1.1);
          } else if (part.draw === 'head') { rx = -l.sit * .25 + Math.sin(time * 1.7 + l.seed) * .06 + (l.toss > 0 ? Math.sin((1 - l.toss) * Math.PI * 2) * .55 : 0); /* the toss: chin down to scoop, then a flick up */ ry = Math.sin(time * .6 + l.seed) * .25 * (1 - b); }
          else if (part.draw === 'tail') ry = Math.sin(time * (b > .3 ? 13 : 8) + l.seed) * .55;
          this.local.compose(this.v.copy(at), this.q.setFromEuler(this.e.set(rx, ry, 0)), this.one);
          const i = p.mesh.count; if (i >= p.mesh.instanceMatrix.count) continue;
          p.mesh.setMatrixAt(i, this.m.multiplyMatrices(this.root, this.local)); p.mesh.count = i + 1;
          p.coatA.setXYZW(i, coat[0].r, coat[0].g, coat[0].b, coat[2]); p.coatB.setXYZ(i, coat[1].r, coat[1].g, coat[1].b);
        }
      }
    }
    for (const p of this.meshes) { p.mesh.visible = p.mesh.count > 0; if (p.mesh.count) { p.mesh.instanceMatrix.needsUpdate = true; p.coatA.needsUpdate = true; p.coatB.needsUpdate = true; } }
  }
  /** The dog nearest (x, z) (within 3 m) tosses its head: the throw a 'toss' effect starts. */
  tossAt(x: number, z: number) {
    let best: Live | null = null, bestD = 3;
    for (const l of this.live.values()) { const d = Math.hypot(l.x - x, l.z - z); if (d < bestD) { bestD = d; best = l; } }
    if (best) best.toss = 1;
  }
  /** Draw calls the dogs cost now (shadow pass: the body only). */
  get draws() { return this.group.visible ? this.meshes.filter(p => p.mesh.visible).length : 0; }
  /** The poses drawn last frame (for probes and tests). */
  get count() { return this.meshes.find(p => p.part.draw === 'body')?.mesh.count ?? 0; }
  private disposeMeshes() { for (const p of this.meshes) { p.mesh.removeFromParent(); p.mesh.dispose(); p.part.geometry.dispose(); } this.meshes = []; this.rig = null; }
  dispose() { this.disposeMeshes(); this.live.clear(); this.group.removeFromParent(); }
}
