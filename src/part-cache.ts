import type * as T from 'three';

/**
 * getObjectByName walks the whole tree; the hero, friends and the cottage door ask for the same few parts every frame
 * (a measurable share of a throttled phone's frame). This remembers each lookup per root (a WeakMap, so clone()'s JSON
 * copy of userData never sees it) and re-checks a hit by walking up from it, so a rebuilt or swapped part is found again.
 * A miss is remembered until the root's direct children change.
 */
const caches = new WeakMap<T.Object3D, Map<string, { node: T.Object3D | null; kids: number }>>();
export function part(root: T.Object3D, name: string): T.Object3D | undefined {
  let cache = caches.get(root); if (!cache) caches.set(root, cache = new Map());
  const hit = cache.get(name);
  if (hit) {
    if (!hit.node) { if (hit.kids === root.children.length) return undefined; }
    else if (hit.node.name === name && under(hit.node, root)) return hit.node;
  }
  const node = root.getObjectByName(name) ?? null; cache.set(name, { node, kids: root.children.length });
  return node ?? undefined;
}
function under(node: T.Object3D, root: T.Object3D) { for (let p: T.Object3D | null = node; p; p = p.parent) if (p === root) return true; return false; }
