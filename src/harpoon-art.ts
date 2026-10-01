import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** An 84-triangle three-pronged projectile, pointing along local +Z. Caller owns and disposes both resources. */
export function createHarpoonProjectile(): T.Mesh {
  const pieces: T.BufferGeometry[] = [];
  const add = (geometry: T.BufferGeometry, color: string) => {
    const c = new T.Color(color), count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3)); pieces.push(geometry);
  };
  add(new T.BoxGeometry(.07, .07, .86).translate(0, 0, -.2), '#98724a');
  add(new T.BoxGeometry(.52, .07, .08).translate(0, 0, .24), '#c9f0ec');
  for (const x of [-.23, 0, .23]) {
    add(new T.BoxGeometry(.055, .055, .29).translate(x, 0, .4), '#c9f0ec');
    add(new T.ConeGeometry(.055, .17, 4).rotateX(Math.PI / 2).translate(x, 0, .615), '#f4d58c');
  }
  const geometry = mergeGeometries(pieces, false)!; pieces.forEach(piece => piece.dispose()); geometry.computeBoundingSphere();
  const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial({ vertexColors: true })); mesh.name = 'harpoon-projectile';
  mesh.castShadow = mesh.receiveShadow = false; return mesh;
}
