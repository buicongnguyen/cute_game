import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, TOON_RAMP } from './toon.ts';

let merged: T.MeshToonMaterial | null = null;
/**
 * True when drawing the mesh through the shared merged toon material would look exactly the same: a smooth-shaded,
 * opaque, front-faced toon material on the shared ramp with no texture (the exact rule used for remote players).
 */
export function mergesExactly(m: T.MeshToonMaterial) {
  return m.type === 'MeshToonMaterial' && m.gradientMap === TOON_RAMP && !(m as unknown as { flatShading?: boolean }).flatShading && m.side === T.FrontSide && m.opacity === 1 && !m.alphaTest
    && m.visible && !m.wireframe && m.fog && !m.map && !m.alphaMap && !m.normalMap && !m.bumpMap && !m.emissiveMap && !m.aoMap && !m.lightMap;
}
/**
 * Merges each rigid part's meshes (skin, shirt, hair, the hat's pieces...) into one vertex-coloured mesh with one shared
 * toon material: a friend then costs one draw per part plus its merged outline, not three or four per part. Textured,
 * see-through or glowing pieces stay as they are. `exact` merges only pieces that look identical through the shared
 * material and keeps each piece's shadow flags (remote players and bots, whose look must not change).
 */
export function mergeParts(model: T.Object3D, { exact = false } = {}) {
  const byParent = new Map<string, { parent: T.Object3D; cast: boolean; recv: boolean; list: T.Mesh[] }>(), ids = new Map<T.Object3D, number>();
  model.traverse(o => {
    if (!(o instanceof T.Mesh) || o.userData.outline || o.userData.gear || !o.parent || Array.isArray(o.material) || o.parent.name === 'remote-pet' || o.parent.parent?.name === 'remote-pet') return;
    const m = o.material as T.MeshToonMaterial;
    if (m.map || m.transparent || (m.emissive && m.emissive.getHex() !== 0) || !m.color) return;
    if (exact && (!mergesExactly(m) || !o.visible || o.layers.mask !== 1 || !o.geometry.getAttribute('normal'))) return;
    let id = ids.get(o.parent); if (id === undefined) ids.set(o.parent, id = ids.size);
    const key = exact ? `${id}|${o.castShadow}|${o.receiveShadow}` : `${id}`; let group = byParent.get(key); if (!group) byParent.set(key, group = { parent: o.parent, cast: o.castShadow, recv: o.receiveShadow, list: [] }); group.list.push(o);
  });
  merged ??= toonMaterial({ vertexColors: true }); merged.userData.sharedKit = true;
  for (const { parent, cast, recv, list } of byParent.values()) {
    if (list.length < 2) continue;
    const pieces = list.map(mesh => {
      const src = mesh.geometry, g = new T.BufferGeometry(); g.setAttribute('position', src.getAttribute('position').clone());
      const n = src.getAttribute('normal'); if (n) g.setAttribute('normal', n.clone());
      const col = src.getAttribute('color'); if (col) g.setAttribute('color', col.clone());
      if (src.index) g.setIndex(src.index.clone());
      const flat = g.index ? g.toNonIndexed() : g; if (flat !== g) g.dispose();
      mesh.updateMatrix(); flat.applyMatrix4(mesh.matrix); if (!n) flat.computeVertexNormals();
      const tint = (mesh.material as T.MeshToonMaterial).color, count = flat.getAttribute('position').count, old = flat.getAttribute('color') as T.BufferAttribute | undefined, colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) colors.set(old ? [old.getX(i) * tint.r, old.getY(i) * tint.g, old.getZ(i) * tint.b] : [tint.r, tint.g, tint.b], i * 3);
      flat.setAttribute('color', new T.BufferAttribute(colors, 3)); return flat;
    });
    const geometry = mergeGeometries(pieces, false); pieces.forEach(p => p.dispose()); if (!geometry) continue;
    for (const mesh of list) { mesh.removeFromParent(); if (!mesh.geometry.userData.sharedKit) mesh.geometry.dispose(); }
    const one = new T.Mesh(geometry, merged); one.name = parent.name + '-merged'; one.castShadow = cast; one.receiveShadow = recv; parent.add(one);
  }
}
