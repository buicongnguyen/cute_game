import type * as T from 'three';

/** Materials a module caches for the whole session (world.ts `material()`): never disposed with a tree. */
export const keepAlive = new WeakSet<T.Material>();
const kept = (r: { userData: Record<string, unknown> }) => r.userData.sharedKit === true;

/**
 * Frees the textures a disposed material owns. Only drawn-at-runtime textures (CanvasTexture, e.g. a mode's ground map) or
 * ones flagged `userData.owned` go: image textures cloned from a kit are shared between copies and re-uploading one
 * would hitch a phone. Kit textures (`userData.sharedKit`) never go.
 */
export function disposeOwnedTextures(material: T.Material) {
  for (const value of Object.values(material)) {
    const tex = value as T.Texture | null;
    if (tex && (tex as { isTexture?: boolean }).isTexture && !kept(tex) && ((tex as { isCanvasTexture?: boolean }).isCanvasTexture || tex.userData.owned === true)) tex.dispose();
  }
}

/**
 * Frees the GPU buffers and programs of a dropped object tree. Kit geometry/materials (`userData.sharedKit`) and
 * cached materials are shared with other instances, so they stay alive.
 */
export function disposeTree(root: T.Object3D) {
  root.traverse(o => {
    const mesh = o as T.Mesh; if (!mesh.isMesh) return;
    if (!kept(mesh.geometry)) mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m && !kept(m) && !keepAlive.has(m)) { disposeOwnedTextures(m); m.dispose(); }
  });
}
/** Removes a tree from its parent and frees it. */
export function dropTree(root: T.Object3D) { root.removeFromParent(); disposeTree(root); }
