import * as T from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { perfFlags } from './perf-flags.ts';

/**
 * Ink outlines for the play layer (explorer, pets, creatures, the target arrow), after the
 * reference: an inverted hull — the same shape drawn again from its back faces, pushed out
 * along the normals in one ink colour, unlit. Scenery, buildings, plots and instanced decor are
 * never outlined, so the actors read as the things you can fight or touch.
 *
 * One material is shared by every outline, so turning outlines off on the lowest graphics tier
 * is a single flag and the shader is compiled once.
 */
export const INK = '#3a2433';
/** Model-space push in metres. The reference uses 0.022; ours is a little thicker so the ink still reads at about one pixel on phone screens. */
export const OUTLINE_PUSH = .03;

let shared: T.MeshBasicMaterial | null = null;
export function outlineMaterial() {
  if (shared) return shared;
  const material = new T.MeshBasicMaterial({ color: INK, side: T.BackSide });
  material.name = 'ink-outline';
  // Shared like kit materials: world disposal must leave it alive.
  material.userData.sharedKit = true;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n\ttransformed += normalize( normal ) * ${OUTLINE_PUSH.toFixed(3)};`);
  };
  material.customProgramCacheKey = () => 'ink-outline';
  return (shared = material);
}

/** Turns every outline on or off at once (off on the battery-saver tier). */
export function setOutlinesEnabled(on: boolean) { outlineMaterial().visible = on; }
export function outlinesEnabled() { return outlineMaterial().visible; }

const noRaycast = () => {};
function outlineMesh(geometry: T.BufferGeometry) {
  const mesh = new T.Mesh(geometry, outlineMaterial());
  mesh.name = 'outline'; mesh.userData.outline = true; mesh.castShadow = false; mesh.receiveShadow = false;
  // Taps and the occlusion probes must see the body, never its hull.
  mesh.raycast = noRaycast;
  return mesh;
}

/** Meshes that get a hull: solid, drawn, not effects or warning decals. */
function outlinable(o: T.Object3D): o is T.Mesh {
  if (!(o instanceof T.Mesh) || o instanceof T.InstancedMesh || o instanceof T.SkinnedMesh || o.userData.outline) return false;
  if (!o.visible || o.layers.mask === 0 || o.name === 'attack-telegraph' || !o.geometry.getAttribute('normal')) return false;
  const material = o.material as T.Material;
  return !Array.isArray(o.material) && !material.transparent && material.visible;
}

/**
 * A hull of several meshes in their parent's space with smooth normals, so the push leaves no
 * cracks at hard edges (flat-shaded kit parts have split normals).
 */
function mergedHull(meshes: T.Mesh[]) {
  // Every explorer, friend and neighbour made from the same kit part (same geometry, same place in its parent) has the
  // same hull: build it once. Welding and smoothing normals was the biggest part of making an avatar.
  const key = perfFlags.cacheHulls ? hullKey(meshes) : '';
  if (key) { const hit = hulls.get(key); if (hit) return hit; }
  const made = buildHull(meshes);
  if (made && key) {
    made.userData.sharedKit = true; // shared by every outline using it: disposeTree leaves it alone
    hulls.set(key, made);
    if (hulls.size > HULL_CACHE_MAX) { const [oldest] = hulls.keys(); hulls.get(oldest)!.dispose(); hulls.delete(oldest); }
  }
  return made;
}
/** Hulls made so far, by the geometry and placement of the pieces they cover (oldest dropped past the cap). */
const hulls = new Map<string, T.BufferGeometry>();
export const HULL_CACHE_MAX = 192;
export function hullCacheSize() { return hulls.size; }
export function clearHullCache() { for (const g of hulls.values()) g.dispose(); hulls.clear(); }
function hullKey(meshes: T.Mesh[]) {
  let key = '';
  for (const mesh of meshes) { mesh.updateMatrix(); key += mesh.geometry.uuid + '@' + mesh.matrix.elements.join(',') + ';'; }
  return key;
}
function buildHull(meshes: T.Mesh[]) {
  const pieces = meshes.map(mesh => {
    let geometry = new T.BufferGeometry();
    geometry.setAttribute('position', mesh.geometry.getAttribute('position').clone());
    if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone());
    if (geometry.index) geometry = geometry.toNonIndexed();
    mesh.updateMatrix(); geometry.applyMatrix4(mesh.matrix);
    return geometry;
  });
  const merged = mergeGeometries(pieces, false); pieces.forEach(p => p.dispose());
  if (!merged) return null;
  const welded = mergeVertices(merged, 1e-4); merged.dispose();
  welded.computeVertexNormals();
  return welded;
}

/**
 * Adds outline children under `root` and returns them. `merge` builds one hull per parent
 * (the explorer's 18 kit meshes become one outline per animated part, about 7 draws instead of
 * 18); otherwise each mesh gets a child hull sharing its geometry, which costs no memory.
 */
export function addOutlines(root: T.Object3D, { merge = false } = {}): T.Mesh[] {
  const meshes: T.Mesh[] = [];
  root.traverse(o => { if (outlinable(o)) meshes.push(o); });
  const added: T.Mesh[] = [];
  if (!merge) {
    for (const mesh of meshes) { const hull = outlineMesh(mesh.geometry); hull.userData.sharedGeometry = true; mesh.add(hull); added.push(hull); }
  } else {
    const byParent = new Map<T.Object3D, T.Mesh[]>();
    for (const mesh of meshes) if (mesh.parent) { const list = byParent.get(mesh.parent) ?? []; list.push(mesh); byParent.set(mesh.parent, list); }
    for (const [parent, list] of byParent) { const geometry = mergedHull(list); if (!geometry) continue; const hull = outlineMesh(geometry); parent.add(hull); added.push(hull); }
  }
  root.userData.outlines = added;
  return added;
}

/** Shows or hides the outlines of one model (creatures far from the view skip theirs). */
export function showOutlines(root: T.Object3D, on: boolean) {
  if (root.userData.outlined === on) return;
  root.userData.outlined = on;
  for (const hull of (root.userData.outlines ?? []) as T.Mesh[]) hull.visible = on;
}
