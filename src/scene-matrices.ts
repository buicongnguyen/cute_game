import type * as T from 'three';
import { perfFlags } from './perf-flags.ts';

/**
 * Matrix upkeep for big scenes, after the reference (it turns the scene's automatic matrix update off and runs its own).
 *
 * three.js recomposes every object's local matrix and multiplies its world matrix on every frame, moving or not:
 * about 2,500 objects in the village, the largest single cost of a frame in the CPU profile (PERF-ANALYSIS.md).
 * Here an object is recomposed only when its position, rotation or scale really changed since the last frame,
 * and its world matrix only when it or a parent changed. Hidden subtrees are skipped and marked stale, so they
 * catch up the frame they show again. Code that sets `matrix` by hand (matrixAutoUpdate off) keeps working
 * through `matrixWorldNeedsUpdate`, as in three.js.
 */
type Tracked = T.Object3D & { _trs?: Float64Array; _stale?: boolean; _parent?: T.Object3D | null; _settled?: number };

/** Objects visited and hidden subtrees skipped by the last pass (read by tests and the perf probe). */
export const matrixStats = { visited: 0, frozenSkips: 0 };
let hiddenSkips = 0;

/**
 * Marks a subtree whose descendants never move on their own (scatter tiles: instanced scenery with identity transforms).
 * Once its matrices have settled the pass stops at its root until the root itself moves, a child is added or removed,
 * or `thawStaticTree` is called, so the ~500 tiles of the village cost nothing per frame.
 */
export function freezeStaticTree(root: T.Object3D) { root.userData.staticTree = true; }
/** Makes a frozen subtree update again (call after editing the transform of anything inside it). */
export function thawStaticTree(root: T.Object3D) { (root as Tracked)._settled = undefined; }

/** True when the object's TRS differs from the cached copy (and refreshes the cache). */
function moved(o: Tracked) {
  const c = o._trs ?? (o._trs = new Float64Array(10).fill(NaN));
  const p = o.position, q = o.quaternion, s = o.scale;
  if (c[0] === p.x && c[1] === p.y && c[2] === p.z && c[3] === q.x && c[4] === q.y && c[5] === q.z && c[6] === q.w && c[7] === s.x && c[8] === s.y && c[9] === s.z) return false;
  c[0] = p.x; c[1] = p.y; c[2] = p.z; c[3] = q.x; c[4] = q.y; c[5] = q.z; c[6] = q.w; c[7] = s.x; c[8] = s.y; c[9] = s.z;
  return true;
}

function visit(o: Tracked, parentChanged: boolean) {
  if (!o.visible) { o._stale = true; hiddenSkips++; return; }
  matrixStats.visited++;
  // A move to another parent changes the world matrix without touching the local one.
  // three.js raises matrixWorldNeedsUpdate on every ancestor whenever code asks an object for its world position or
  // quaternion (updateWorldMatrix(true) -> updateMatrix), which made the whole scene look changed every frame. For an
  // object whose matrix is composed here the flag says nothing the position/rotation/scale cache does not already say.
  const auto = o.matrixAutoUpdate && perfFlags.trustTransforms;
  let changed = parentChanged || (o.matrixWorldNeedsUpdate && !auto) || !!o._stale || o._parent !== o.parent;
  o._parent = o.parent;
  if (o.matrixAutoUpdate && moved(o)) { o.matrix.compose(o.position, o.quaternion, o.scale); changed = true; }
  if (changed) {
    if (o.matrixWorldAutoUpdate) { if (o.parent === null) o.matrixWorld.copy(o.matrix); else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix); }
    o.matrixWorldNeedsUpdate = false; o._stale = false;
  } else if (auto) o.matrixWorldNeedsUpdate = false;
  const children = o.children;
  if (o.userData.staticTree && perfFlags.freezeStaticTrees) {
    // A settled tree (same children as when it was walked, nothing hidden in it) has nothing to recompute.
    if (!changed && o._settled === children.length) { matrixStats.frozenSkips++; return; }
    const hiddenBefore = hiddenSkips;
    for (let i = 0, n = children.length; i < n; i++) visit(children[i] as Tracked, changed);
    o._settled = hiddenSkips === hiddenBefore ? children.length : undefined;
    return;
  }
  if (o._settled !== undefined) o._settled = undefined;
  for (let i = 0, n = children.length; i < n; i++) visit(children[i] as Tracked, changed);
}

/** Takes the scene's matrix upkeep over from the renderer; call `updateSceneMatrices` before each render. */
export function manageSceneMatrices(scene: T.Scene) { scene.matrixWorldAutoUpdate = false; }

/** Brings every visible object's world matrix up to date, touching only what moved. */
export function updateSceneMatrices(scene: T.Scene) { matrixStats.visited = 0; matrixStats.frozenSkips = 0; visit(scene as Tracked, false); }
