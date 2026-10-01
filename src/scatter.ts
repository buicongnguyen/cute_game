import * as T from 'three';
import type { KitPart } from './assets.ts';
import { DECOR, type DecorPlacement } from './biomes.ts';

/**
 * Thousands of scenery pieces drawn as instances. Pieces are grouped into square tiles so
 * the camera skips tiles that are off screen, and each tile draws one batch per model part.
 */
export const SCATTER_TILE = 64;
export type PartSource = (type: string) => KitPart[] | undefined;

export function buildScatter(placements: readonly DecorPlacement[], parts: PartSource, detail = 1): T.Group {
  const group = new T.Group(), buckets = new Map<string, DecorPlacement[]>();
  group.name = 'scatter'; group.userData.scatter = true;
  let coverIndex = 0;
  for (const p of placements) {
    // Low graphics keeps every other blade of grass and flower; nothing that blocks is skipped.
    if (detail < 1 && DECOR[p.type]?.cover && coverIndex++ % 2) continue;
    // Tiles are centred on the origin so the village sits inside a single tile.
    const key = `${p.type}|${Math.floor(p.x / SCATTER_TILE + .5)}|${Math.floor(p.z / SCATTER_TILE + .5)}`;
    let list = buckets.get(key); if (!list) buckets.set(key, list = []); list.push(p);
  }
  const matrix = new T.Matrix4(), rotation = new T.Quaternion(), scale = new T.Vector3(), position = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  for (const [key, list] of buckets) {
    const type = key.slice(0, key.indexOf('|')), source = parts(type) ?? fallbackParts(type);
    for (const part of source) {
      const mesh = new T.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((p, i) => { rotation.setFromAxisAngle(up, p.rotation); scale.setScalar(p.scale); mesh.setMatrixAt(i, matrix.compose(position.set(p.x, p.y, p.z), rotation, scale).multiply(part.matrix)); });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      mesh.castShadow = !DECOR[type]?.cover; mesh.receiveShadow = true; mesh.userData.scatter = type;
      group.add(mesh);
    }
  }
  return group;
}

/** Frees the instance buffers; the shared kit geometry and materials stay alive. */
export function disposeScatter(group: T.Object3D) { group.traverse(o => { if (o instanceof T.InstancedMesh) o.dispose(); }); }

/** Simple stand-ins, used for any piece whose model file has not arrived. */
const fallbacks = new Map<string, KitPart[]>();
const shared = <M extends T.Material | T.BufferGeometry>(resource: M) => { resource.userData.sharedKit = true; return resource; };
const material = (color: string, emissive?: string) => shared(new T.MeshStandardMaterial({ color, roughness: .7, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 1.2 : 0 }));
const at = (x: number, y: number, z: number, sx = 1, sy = sx, sz = sx) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion(), new T.Vector3(sx, sy, sz));
const LOOK: Record<string, [string, string, 'tree' | 'pine' | 'rock' | 'blob' | 'spire' | 'tuft']> = {
  tree_round: ['#8a5a3b', '#6fbf5a', 'tree'], tree_blossom: ['#8a5a3b', '#f4a6c6', 'tree'], tree_pine: ['#8a5a3b', '#3f9a5a', 'pine'], tree_swamp: ['#5a4a3a', '#3f8a6a', 'tree'],
  tree_dead: ['#c8bca8', '#c8bca8', 'spire'], ash_tree: ['#3a3036', '#ff8a3d', 'spire'], deadtree: ['#4a3a5a', '#a07aff', 'spire'], jungletree: ['#6a4a2a', '#3f9a3a', 'tree'],
  cloudtree: ['#ffffff', '#e8f4ff', 'tree'], candy_tree: ['#ffffff', '#ff7ab0', 'tree'], palm: ['#c8a070', '#5ab05a', 'tree'], snow_pine: ['#6a4a3a', '#e8f4ff', 'pine'],
  rock: ['#9a9aa8', '#9a9aa8', 'rock'], rock_red: ['#e07a4a', '#e07a4a', 'rock'], snow_rock: ['#c8d8e8', '#ffffff', 'rock'], lava_rock: ['#4a3a40', '#ff6a2b', 'rock'], skyrock: ['#d8e4f0', '#8fd36a', 'rock'],
  obsidian: ['#2a2036', '#6a4a8a', 'spire'], ice_spire: ['#bfe8ff', '#bfe8ff', 'spire'], crystals: ['#a77aff', '#7af0ff', 'spire'], candy_cane: ['#ff4a5a', '#ffffff', 'spire'], mini_volcano: ['#4a3a40', '#ff6a2b', 'pine'],
  bush: ['#4fae4a', '#4fae4a', 'blob'], dry_bush: ['#d8b870', '#d8b870', 'blob'], fern: ['#3f9a4a', '#3f9a4a', 'blob'], gumdrops: ['#ff7ab0', '#9be36f', 'blob'], donut: ['#e8b070', '#ff9fd0', 'blob'],
  cupcake: ['#f2c070', '#ffffff', 'blob'], toyblock: ['#ff5a4a', '#4a8aff', 'blob'], toyball: ['#ff5a4a', '#ffe14d', 'blob'], snowman: ['#ffffff', '#ffffff', 'blob'], coral: ['#ff7a8a', '#ffb070', 'blob'],
  toadstools: ['#f4ead8', '#e8443a', 'blob'], mushroom: ['#f4ead8', '#e8443a', 'blob'], log: ['#8a5a3b', '#8a5a3b', 'blob'],
  flowers: ['#5aa04a', '#ffd25a', 'tuft'], tuft: ['#79b85c', '#79b85c', 'tuft'], reeds: ['#6a9a4a', '#8a6a3a', 'tuft'],
};
export function fallbackParts(type: string): KitPart[] {
  let parts = fallbacks.get(type);
  if (parts) return parts;
  const [base, top, shape] = LOOK[type] ?? ['#9a9aa8', '#9a9aa8', 'rock'], glow = /lava|ash|crystals|deadtree/.test(type) ? top : undefined;
  if (shape === 'tree') parts = [{ geometry: shared(new T.CylinderGeometry(.18, .28, 2.2, 6).translate(0, 1.1, 0)), material: material(base), matrix: new T.Matrix4(), name: type }, { geometry: shared(new T.IcosahedronGeometry(1.4, 0)), material: material(top), matrix: at(0, 2.9, 0), name: type }];
  else if (shape === 'pine') parts = [{ geometry: shared(new T.CylinderGeometry(.15, .25, 1, 6).translate(0, .5, 0)), material: material(base), matrix: new T.Matrix4(), name: type }, { geometry: shared(new T.ConeGeometry(1.3, 3, 7)), material: material(top, type === 'mini_volcano' ? top : undefined), matrix: at(0, 2.3, 0), name: type }];
  else if (shape === 'spire') parts = [{ geometry: shared(new T.ConeGeometry(.4, 2.6, 5).translate(0, 1.3, 0)), material: material(base, glow), matrix: new T.Matrix4(), name: type }];
  else if (shape === 'rock') parts = [{ geometry: shared(new T.DodecahedronGeometry(.9, 0)), material: material(base), matrix: at(0, .45, 0, 1, .7, 1), name: type }];
  else if (shape === 'tuft') parts = [{ geometry: shared(new T.ConeGeometry(.13, .5, 3).translate(0, .25, 0)), material: material(type === 'flowers' ? top : base), matrix: new T.Matrix4(), name: type }];
  else parts = [{ geometry: shared(new T.IcosahedronGeometry(.55, 0)), material: material(base), matrix: at(0, .45, 0, 1, .8, 1), name: type }];
  fallbacks.set(type, parts);
  return parts;
}
