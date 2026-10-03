import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { KitLibrary, KitPart } from './assets.ts';

/**
 * Pond fish drawn instanced (lightweight-game-objects: repeated creatures in one draw per family). A kit fish is 7–10
 * coloured parts, so 42 fish cost 314 draw calls as separate models; here every species is one body draw (its plain
 * parts merged with their colours baked into the vertices) plus one tail draw, however many swim, so ponds can hold
 * twice the fish (fishing.ts FISH_PER_WATER) for fewer draws than before.
 *
 * A fish is a `FishHandle`: an empty group whose position, rotation and scale the fishing and hunting views move as
 * before, with a `tail` child at the hinge whose rotation.y wags. `render()` writes every attached, visible handle into
 * the instance buffers once a frame (nothing allocated per frame). A handle stops drawing once it leaves the scene graph.
 */
export interface FishHandle { obj: T.Group; tail: T.Object3D | null }
interface Layer { mesh: T.InstancedMesh; tail: boolean; count: number }
interface Species { layers: Layer[]; tail: KitPart | null }
interface Live { obj: T.Group; tail: T.Object3D | null; species: Species }

const plain = (m: T.Material): m is T.MeshToonMaterial | T.MeshStandardMaterial =>
  (m instanceof T.MeshToonMaterial || m instanceof T.MeshStandardMaterial) && !m.transparent && !m.map && !m.vertexColors && !(m.alphaTest > 0) && !(m.emissiveIntensity > 0 && m.emissive.getHex() !== 0);

export class FishSchool {
  readonly root = new T.Group();
  private kinds = new Map<string, Species | null>();
  private live: Live[] = [];
  private baked = new Map<string, T.Material>();
  private body = new T.Matrix4(); private hinge = new T.Matrix4(); private out = new T.Matrix4();
  private kit: KitLibrary;
  constructor(kit: KitLibrary) { this.kit = kit; this.root.name = 'fish-school'; }

  /** A new fish of `species` (null when the kit has no such model). */
  handle(species: string): FishHandle | null {
    const kind = this.kind(species); if (!kind) return null;
    const obj = new T.Group(); obj.name = species;
    let tail: T.Object3D | null = null;
    if (kind.tail) { tail = new T.Object3D(); tail.name = kind.tail.name; tail.applyMatrix4(kind.tail.matrix); obj.add(tail); }
    this.live.push({ obj, tail, species: kind });
    return { obj, tail };
  }

  /** Draw counts: one per species layer in use (tests and the draw-call report). */
  get draws() { let n = 0; for (const kind of this.kinds.values()) if (kind) for (const layer of kind.layers) if (layer.count) n++; return n; }
  get fish() { return this.live.length; }

  private kind(species: string) {
    if (this.kinds.has(species)) return this.kinds.get(species)!;
    if (!this.kit.ready) return null;
    const parts = this.kit.parts(species);
    if (!parts?.length) { this.kinds.set(species, null); return null; }
    const tail = parts.find(p => p.name.endsWith('_tail')) ?? null, layers: Layer[] = [];
    // Plain parts that share a look merge into one geometry with baked colours; glowing or see-through parts keep their own material.
    const groups = new Map<string, KitPart[]>(), own: KitPart[] = [];
    for (const part of parts) {
      if (part === tail) continue;
      if (!plain(part.material)) { own.push(part); continue; }
      const key = `${part.material.type}|${part.material.side}|${(part.material as { flatShading?: boolean }).flatShading}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(part);
    }
    for (const [key, list] of groups) layers.push(this.layer(this.bake(list, true), this.material(key, list[0].material), false));
    for (const part of own) layers.push(this.layer(this.bake([part], false), part.material, false));
    if (tail) layers.push(this.layer(plain(tail.material) ? this.bake([tail], true, false) : tail.geometry, plain(tail.material) ? this.material(`${tail.material.type}|${tail.material.side}|${(tail.material as { flatShading?: boolean }).flatShading}`, tail.material) : tail.material, true));
    const kind = { layers, tail };
    this.kinds.set(species, kind); return kind;
  }

  /** Parts in model space (or the tail in its own hinge space), with each part's colour baked in when `colours`. */
  private bake(parts: KitPart[], colours: boolean, placed = true) {
    const pieces = parts.map(part => {
      let g = new T.BufferGeometry();
      g.setAttribute('position', part.geometry.getAttribute('position').clone());
      const normal = part.geometry.getAttribute('normal'); if (normal) g.setAttribute('normal', normal.clone());
      if (part.geometry.index) g.setIndex(part.geometry.index.clone());
      if (placed) g.applyMatrix4(part.matrix);
      if (g.index && parts.some(p => !p.geometry.index)) g = g.toNonIndexed();
      if (colours) {
        const c = (part.material as T.MeshToonMaterial).color, n = g.getAttribute('position').count, colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
        g.setAttribute('color', new T.BufferAttribute(colors, 3));
      }
      return g;
    });
    if (pieces.length === 1) return pieces[0];
    const merged = mergeGeometries(pieces, false) ?? pieces[0]; if (merged !== pieces[0]) pieces.forEach(p => p.dispose());
    return merged;
  }

  private material(key: string, like: T.Material) {
    let material = this.baked.get(key);
    if (!material) { const copy = like.clone() as T.MeshToonMaterial; copy.color.set('#ffffff'); copy.vertexColors = true; copy.name = 'Fish baked colours'; this.baked.set(key, material = copy); }
    return material;
  }

  private layer(geometry: T.BufferGeometry, material: T.Material, tail: boolean, capacity = 24): Layer {
    const mesh = new T.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false;
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'fish-layer';
    this.root.add(mesh); return { mesh, tail, count: 0 };
  }

  private grow(layer: Layer) {
    const old = layer.mesh, mesh = new T.InstancedMesh(old.geometry, old.material, old.instanceMatrix.count * 2);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = old.name;
    (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    this.root.remove(old); old.dispose(); this.root.add(mesh); layer.mesh = mesh;
  }

  /** Writes every attached, visible fish into its species' layers. Call once a frame after the views moved them. */
  render() {
    for (const kind of this.kinds.values()) if (kind) for (const layer of kind.layers) layer.count = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i], parent = f.obj.parent;
      if (!parent) { this.live.splice(i, 1); continue; }
      if (!f.obj.visible || !parent.visible) continue;
      this.body.compose(f.obj.position, f.obj.quaternion, f.obj.scale);
      if (f.tail) this.out.multiplyMatrices(this.body, this.hinge.compose(f.tail.position, f.tail.quaternion, f.tail.scale));
      for (const layer of f.species.layers) {
        if (layer.count >= layer.mesh.instanceMatrix.count) this.grow(layer);
        layer.mesh.setMatrixAt(layer.count++, layer.tail ? this.out : this.body);
      }
    }
    for (const kind of this.kinds.values()) if (kind) for (const layer of kind.layers) {
      layer.mesh.count = layer.count; layer.mesh.visible = layer.count > 0;
      if (layer.count) { layer.mesh.instanceMatrix.clearUpdateRanges(); layer.mesh.instanceMatrix.addUpdateRange(0, layer.count * 16); layer.mesh.instanceMatrix.needsUpdate = true; }
    }
  }

  /** Forget every fish and model (a rebuilt kit); the views make new handles. */
  reset() {
    for (const kind of this.kinds.values()) if (kind) for (const layer of kind.layers) { this.root.remove(layer.mesh); if (layer.mesh.geometry.userData.sharedKit !== true) layer.mesh.geometry.dispose(); layer.mesh.dispose(); }
    this.kinds.clear(); this.live = [];
  }
}
