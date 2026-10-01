import * as T from 'three';
import type { KitPart } from './assets.ts';
import { DECOR, type DecorPlacement } from './biomes.ts';
import { toonMaterial } from './toon.ts';

/**
 * Thousands of scenery pieces drawn as instances. Pieces are grouped into square tiles so the camera skips tiles that
 * are off screen, and each tile draws one batch per model part. Tiles were 64 m, so about 95% of the scenery triangles
 * drawn lay off screen (CP-3); at 32 m (the reference uses 36) the frustum trims far more, for a few more batches.
 */
export const SCATTER_TILE = 32;
/** Pieces lower than this never cast shadows: flowers, toadstools, logs, small rocks (G2D-6). */
export const LOW_DECOR = 1;
/** Pieces taller than this can hide the explorer at the game's pitch, so they are indexed for the occluder fade (CC-06). */
export const TALL_DECOR = 1.2;
/** Taller pieces cast shadows only from tiles whose bounds come this close to the camera target (CP-3). */
export const SHADOW_REACH = 20;
/** Cell size of the tall-piece index. */
export const TALL_CELL = 8;
export type PartSource = (type: string) => KitPart[] | undefined;
/** One tall piece: where it stands, its upright extent and the instance slots that draw it (one per model part). */
export interface TallPiece { x: number; z: number; y: number; height: number; radius: number; meshes: T.InstancedMesh[]; index: number }
/** Builds the 2D ground-cover cards for one tile's cover pieces (or null to draw them as models). */
export type CoverBuilder = (pieces: DecorPlacement[]) => T.Object3D | null;

const extents = new WeakMap<KitPart[], { height: number; radius: number }>(), box = new T.Box3(), part = new T.Box3();
// A few sun/warm/cool shades break up repeated trees. Stored once in the existing instance buffer: no extra
// materials, geometry, draw calls or per-frame work. Do not consume the world-placement RNG (shared with collisions).
const VARIED_TREES = new Set(['tree_round', 'tree_pine', 'tree_blossom', 'tree_swamp']);
const TREE_SHADES = [[1, 1, 1], [.95, 1, .9], [1, .96, .87], [.88, .96, 1]] as const;
function treeShade(p: DecorPlacement, color: T.Color) {
  if (Math.hypot(p.x, p.z) <= 17) return color.setRGB(1, 1, 1);
  let h = Math.imul(Math.round(p.x * 100), 73856093) ^ Math.imul(Math.round(p.z * 100), 19349663);
  for (let i = 0; i < p.type.length; i++) h = Math.imul(h ^ p.type.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  const shade = TREE_SHADES[(h >>> 0) % TREE_SHADES.length];
  return color.setRGB(shade[0], shade[1], shade[2]);
}
/** Height above the base and horizontal reach of a model at scale 1, measured once per part list. */
export function partsExtent(parts: KitPart[]) {
  let known = extents.get(parts);
  if (!known) {
    box.makeEmpty();
    for (const p of parts) { if (!p.geometry.boundingBox) p.geometry.computeBoundingBox(); box.union(part.copy(p.geometry.boundingBox!).applyMatrix4(p.matrix)); }
    known = box.isEmpty() ? { height: 0, radius: 0 } : { height: Math.max(0, box.max.y), radius: Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z) };
    extents.set(parts, known);
  }
  return known;
}

export function buildScatter(placements: readonly DecorPlacement[], parts: PartSource, detail = 1, cover?: CoverBuilder): T.Group {
  const group = new T.Group(), buckets = new Map<string, DecorPlacement[]>(), coverTiles = new Map<string, DecorPlacement[]>();
  group.name = 'scatter'; group.userData.scatter = true;
  const casters: T.InstancedMesh[] = [], tall = new Map<string, TallPiece[]>();
  let coverIndex = 0;
  for (const p of placements) {
    const isCover = !!DECOR[p.type]?.cover;
    // Low graphics keeps every other blade of grass and flower; nothing that blocks is skipped.
    if (detail < 1 && isCover && coverIndex++ % 2) continue;
    // Low graphics also leaves out the tiny dressing (pebbles, shells, sprinkles) entirely.
    if (detail < 1 && DECOR[p.type]?.dressing) continue;
    // Tiles are centred on the origin so the village sits inside a single tile.
    const tile = `${Math.floor(p.x / SCATTER_TILE + .5)}|${Math.floor(p.z / SCATTER_TILE + .5)}`;
    const target = cover && isCover ? coverTiles : buckets, key = cover && isCover ? tile : `${p.type}|${tile}`;
    let list = target.get(key); if (!list) target.set(key, list = []); list.push(p);
  }
  const matrix = new T.Matrix4(), rotation = new T.Quaternion(), scale = new T.Vector3(), position = new T.Vector3(), up = new T.Vector3(0, 1, 0), color = new T.Color();
  for (const [key, list] of buckets) {
    const type = key.slice(0, key.indexOf('|')), source = parts(type) ?? fallbackParts(type), extent = partsExtent(source);
    const meshes = source.map(part => {
      const mesh = new T.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((p, i) => { rotation.setFromAxisAngle(up, p.rotation); scale.setScalar(p.scale); mesh.setMatrixAt(i, matrix.compose(position.set(p.x, p.y, p.z), rotation, scale).multiply(part.matrix)); if (VARIED_TREES.has(type)) mesh.setColorAt(i, treeShade(p, color)); });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      // Ground cover and low pieces never cast; taller ones cast only near the camera target (updateScatterShadows).
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.scatter = type;
      if (!DECOR[type]?.cover && extent.height >= LOW_DECOR) casters.push(mesh);
      group.add(mesh);
      return mesh;
    });
    list.forEach((p, index) => {
      const height = extent.height * p.scale;
      if (DECOR[type]?.cover || height <= TALL_DECOR) return;
      const cell = `${Math.floor(p.x / TALL_CELL)}|${Math.floor(p.z / TALL_CELL)}`;
      let pieces = tall.get(cell); if (!pieces) tall.set(cell, pieces = []);
      pieces.push({ x: p.x, z: p.z, y: p.y, height, radius: extent.radius * p.scale, meshes, index });
    });
  }
  for (const list of coverTiles.values()) { const cards = cover!(list); if (cards) group.add(cards); }
  group.userData.casters = casters; group.userData.tall = tall;
  return group;
}

/** Turns shadows on for the tall-piece batches whose bounds come within `reach` of (x, z), and off for the rest. */
export function updateScatterShadows(group: T.Object3D, x: number, z: number, reach = SHADOW_REACH) {
  for (const mesh of (group.userData.casters ?? []) as T.InstancedMesh[]) {
    const s = mesh.boundingSphere; if (!s) continue;
    const near = Math.hypot(s.center.x - x, s.center.z - z) - s.radius < reach;
    if (mesh.castShadow !== near) mesh.castShadow = near;
  }
}

/** Tall pieces standing within `radius` of (x, z), from the index built with the scatter. */
export function tallPiecesNear(group: T.Object3D, x: number, z: number, radius: number, out: TallPiece[] = []) {
  const cells = group.userData.tall as Map<string, TallPiece[]> | undefined; out.length = 0;
  if (!cells) return out;
  for (let i = Math.floor((x - radius) / TALL_CELL); i <= Math.floor((x + radius) / TALL_CELL); i++)
    for (let j = Math.floor((z - radius) / TALL_CELL); j <= Math.floor((z + radius) / TALL_CELL); j++)
      for (const p of cells.get(`${i}|${j}`) ?? []) if (Math.hypot(p.x - x, p.z - z) < radius + p.radius) out.push(p);
  return out;
}

/** Frees the instance buffers; the shared kit geometry and materials stay alive. Card meshes free their own. */
export function disposeScatter(group: T.Object3D) { group.traverse(o => { if (o instanceof T.InstancedMesh) { o.dispose(); if (o.userData.ownGeometry) o.geometry.dispose(); } }); }

/** Simple stand-ins, used for any piece whose model file has not arrived. */
const fallbacks = new Map<string, KitPart[]>();
const shared = <M extends T.Material | T.BufferGeometry>(resource: M) => { resource.userData.sharedKit = true; return resource; };
const material = (color: string, emissive?: string) => shared(toonMaterial({ color, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 1.2 : 0 }));
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
  pebbles: ['#b9b2a6', '#b9b2a6', 'blob'], sprinkles: ['#ff4fa3', '#3fb6ff', 'tuft'], toy_bits: ['#ee2d2d', '#2462ea', 'blob'], sky_bloom: ['#fcfeff', '#8fd2ff', 'blob'],
  jungle_bloom: ['#3fc23e', '#ff5a2e', 'tuft'], shells: ['#ffe3c8', '#ff8a4a', 'blob'], ice_shards: ['#bfe8ff', '#bfe8ff', 'tuft'], embers: ['#3a3036', '#ff7a2b', 'blob'], glow_shrooms: ['#d8ccf0', '#9a6aff', 'tuft'],
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
  else if (DECOR[type]?.dressing) parts = [{ geometry: shared(new T.IcosahedronGeometry(.18, 0)), material: material(top), matrix: at(0, .1, 0, 1, .6, 1), name: type }];
  else parts = [{ geometry: shared(new T.IcosahedronGeometry(.55, 0)), material: material(base), matrix: at(0, .45, 0, 1, .8, 1), name: type }];
  fallbacks.set(type, parts);
  return parts;
}
