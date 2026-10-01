import * as T from 'three';
import { tallPiecesNear, type TallPiece } from './scatter.ts';

/**
 * Fades the tall scenery between the camera and the explorer or its target (CC-06, CC-7, C15), which the reference
 * never does. About every 100 ms the pieces standing within 14 m are tested against the segments from the camera to
 * the explorer's chest and head and to the target; a piece in the way fades to 35% over 0.15 s and comes back after.
 *
 * Scatter is instanced, so a fading piece moves out of its tile batch (its slot gets a zero matrix) into a small overlay
 * batch per model part. The overlay's material is the scatter material with dithered alpha (alphaHash) driven by a
 * per-instance fade attribute. Only the few pieces in the overlay pay for the dither's discard; the forest batches
 * keep their plain opaque shader, which matters on tile-based phone GPUs. The overlay still casts the full shadow.
 */
export const FADE = { every: .1, reach: 14, alpha: .35, time: .15, capacity: 24 } as const;

interface Faded { piece: TallPiece; fade: number; hit: boolean; slots: Array<{ overlay: Overlay; slot: number }>; saved: T.Matrix4[] }
interface Overlay { mesh: T.InstancedMesh; fade: T.InstancedBufferAttribute; used: (Faded | null)[] }

const fadeMaterials = new WeakMap<T.Material, T.Material>();
/** The scatter material with per-instance dithered alpha: `instanceFade` scales the alpha that alphaHash dithers. */
export function fadeMaterial(source: T.Material) {
  let material = fadeMaterials.get(source);
  if (!material) {
    material = source.clone(); material.alphaHash = true; material.transparent = false; material.userData.sharedKit = true;
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float instanceFade;\nvarying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = instanceFade;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <alphahash_fragment>', 'diffuseColor.a *= vFade;\n#include <alphahash_fragment>');
    };
    material.customProgramCacheKey = () => 'occluder-fade';
    fadeMaterials.set(source, material);
  }
  return material;
}

const zero = new T.Matrix4().makeScale(0, 0, 0), instanceColor = new T.Color();

/**
 * Whether the segment from `from` (the camera) to `to` passes through a piece: an upright cylinder of 80% of its reach,
 * from its base to its top. The test takes the segment's point nearest the piece's axis (seen from above) and checks
 * that point's height, so a slim pine beside the line of sight does not fade. A point inside the cylinder counts.
 */
export function blocks(piece: TallPiece, from: T.Vector3, to: T.Vector3) {
  const r = piece.radius * .8, dx = to.x - from.x, dz = to.z - from.z, l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((piece.x - from.x) * dx + (piece.z - from.z) * dz) / l2)) : 1;
  const x = from.x + dx * t, z = from.z + dz * t, y = from.y + (to.y - from.y) * t;
  return Math.hypot(x - piece.x, z - piece.z) < r && y >= piece.y && y <= piece.y + piece.height;
}

export class OccluderFade {
  private overlays = new Map<string, Overlay>();
  private faded = new Map<TallPiece, Faded>();
  private clock = 0;
  private near: TallPiece[] = [];
  /** Cost of the last checks (ms, smoothed) and how many have run, for the probes. */
  stats = { ms: 0, checks: 0, faded: 0 };
  private group: T.Group;
  constructor(group: T.Group) { this.group = group; }

  /**
   * Advances the fades; every 100 ms (or when forced) re-tests which pieces stand between `eye` and the `points`.
   * `around` is where to look for pieces (the explorer).
   */
  update(dt: number, eye: T.Vector3, points: readonly T.Vector3[], around: { x: number; z: number }, force = false) {
    this.clock -= dt;
    if (this.clock <= 0 || force) {
      this.clock = FADE.every; const start = performance.now();
      for (const f of this.faded.values()) f.hit = false;
      for (const piece of tallPiecesNear(this.group, around.x, around.z, FADE.reach, this.near))
        if (points.some(p => blocks(piece, eye, p))) { const f = this.faded.get(piece) ?? this.start(piece); if (f) f.hit = true; }
      this.stats.ms = this.stats.checks ? this.stats.ms * .9 + (performance.now() - start) * .1 : performance.now() - start; this.stats.checks++;
    }
    const step = force ? 1 : dt * (1 - FADE.alpha) / FADE.time;
    for (const f of [...this.faded.values()]) {
      f.fade = f.hit ? Math.max(FADE.alpha, f.fade - step) : Math.min(1, f.fade + step);
      if (!f.hit && f.fade >= 1) { this.stop(f); continue; }
      for (const { overlay, slot } of f.slots) { overlay.fade.setX(slot, f.fade); overlay.fade.needsUpdate = true; }
    }
    this.stats.faded = this.faded.size;
  }

  /** Moves a piece from its tile batches into the overlays. */
  private start(piece: TallPiece) {
    const overlays = piece.meshes.map(mesh => this.overlay(mesh));
    if (overlays.some(o => !o.used.includes(null))) return null; // overlays full: leave it standing
    const f: Faded = { piece, fade: 1, hit: true, slots: [], saved: [] };
    piece.meshes.forEach((mesh, i) => {
      const overlay = overlays[i], slot = overlay.used.indexOf(null), m = new T.Matrix4();
      mesh.getMatrixAt(piece.index, m); f.saved.push(m); overlay.used[slot] = f; f.slots.push({ overlay, slot });
      overlay.mesh.setMatrixAt(slot, m); overlay.fade.setX(slot, 1);
      // A tinted tree keeps its exact shade when it moves into the fade overlay. Shared overlay slots can also
      // receive an untinted piece, so overwrite old colors with white instead of inheriting the previous occupant.
      if (mesh.instanceColor || overlay.mesh.instanceColor) {
        instanceColor.setRGB(1, 1, 1); if (mesh.instanceColor) mesh.getColorAt(piece.index, instanceColor);
        overlay.mesh.setColorAt(slot, instanceColor); overlay.mesh.instanceColor!.needsUpdate = true;
      }
      overlay.mesh.count = Math.max(overlay.mesh.count, slot + 1); overlay.mesh.instanceMatrix.needsUpdate = true; overlay.fade.needsUpdate = true;
      mesh.setMatrixAt(piece.index, zero); mesh.instanceMatrix.addUpdateRange(piece.index * 16, 16); mesh.instanceMatrix.needsUpdate = true;
    });
    this.faded.set(piece, f);
    return f;
  }
  /** Puts a piece back into its tile batches. */
  private stop(f: Faded) {
    f.piece.meshes.forEach((mesh, i) => { mesh.setMatrixAt(f.piece.index, f.saved[i]); mesh.instanceMatrix.addUpdateRange(f.piece.index * 16, 16); mesh.instanceMatrix.needsUpdate = true; });
    for (const { overlay, slot } of f.slots) {
      overlay.used[slot] = null; overlay.mesh.setMatrixAt(slot, zero); overlay.mesh.instanceMatrix.needsUpdate = true;
      let count = overlay.used.length; while (count > 0 && !overlay.used[count - 1]) count--; overlay.mesh.count = count;
    }
    this.faded.delete(f.piece);
  }
  private overlay(source: T.InstancedMesh) {
    const material = source.material as T.Material, key = source.geometry.uuid + material.uuid;
    let overlay = this.overlays.get(key);
    if (!overlay) {
      const mesh = new T.InstancedMesh(source.geometry, fadeMaterial(material), FADE.capacity), fade = new T.InstancedBufferAttribute(new Float32Array(FADE.capacity).fill(1), 1);
      fade.setUsage(T.DynamicDrawUsage); mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.geometry = source.geometry.clone(); mesh.geometry.setAttribute('instanceFade', fade); mesh.userData.ownGeometry = true;
      mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.fadeOverlay = true; mesh.name = 'occluder-fade';
      this.group.add(mesh);
      overlay = { mesh, fade, used: new Array(FADE.capacity).fill(null) };
      this.overlays.set(key, overlay);
    }
    return overlay;
  }
  /** Pieces currently fading or faded, for tests and probes. */
  fadedPieces() { return [...this.faded.keys()]; }
  fadeOf(piece: TallPiece) { return this.faded.get(piece)?.fade ?? 1; }
}
