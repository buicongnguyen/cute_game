import * as T from 'three';
import { toonMaterial } from './toon.ts';

/**
 * A pond drawn as two smooth polar meshes instead of stacked discs, so the shore, the rim and the water
 * blend without hard steps or bands (the reference carves a soft bowl into its ground and lays a 55 %
 * water disc over it, @672950–@673900):
 *  - the bank: one vertex-coloured mesh from the deep middle, up the shallows to a sandy lip just above the
 *    water line, then down and out over the grass, where its alpha fades to nothing;
 *  - the water: a translucent disc a little wider than the water line, its colour lighter and foamier toward
 *    the rim. The bank's lip hides the disc's edge, so the shoreline is where the two surfaces meet.
 * Normals point straight up so the bank is lit exactly like the flat ground around it. No textures, no
 * custom shaders: 2 draw calls per pond, and neither casts a shadow.
 */
export interface PondLook { water: string; sand: string; deep: string; shallow: string }
/** Water colours of the reference's waters (`water:` in its planet table @655363 and the home lakes @672677). */
const LOOKS: Record<string, PondLook> = {
  home: { water: '#5ec8ff', sand: '#e6dc9e', deep: '#5ab4d8', shallow: '#9bd3dc' },
  lake: { water: '#5ec8ff', sand: '#e6dc9e', deep: '#5ab4d8', shallow: '#9bd3dc' },
  swamp: { water: '#4fc0b0', sand: '#d9cf98', deep: '#2f8a7a', shallow: '#78bba0' },
  candy: { water: '#ff9fd2', sand: '#ffd8ec', deep: '#e06aa8', shallow: '#f6a9cc' },
  ice: { water: '#7fd3ff', sand: '#eef6ff', deep: '#3f9fcf', shallow: '#a9dcef' },
  toy: { water: '#6fd3ff', sand: '#ffe9a8', deep: '#2f93ad', shallow: '#86cfd0' },
  jungle: { water: '#4fa88a', sand: '#d8c890', deep: '#2a7a62', shallow: '#6fae8f' },
  ocean: { water: '#4fd8e0', sand: '#f2e2b0', deep: '#2a9aa8', shallow: '#7fd0c8' },
  shadow: { water: '#3f3a7a', sand: '#5a5478', deep: '#25204a', shallow: '#4a4672' },
};
export const pondLook = (waterId: string) => LOOKS[waterId] ?? LOOKS.home;

const SEGMENTS = 64;
/** Bank profile: [distance from the water line in metres (negative = under water), height, colour, alpha]. */
type Ring = [offset: number | ((r: number) => number), y: number, color: keyof PondLook | [keyof PondLook, keyof PondLook, number], alpha: number];
const BANK: Ring[] = [
  [r => -r, .02, 'deep', 1],
  [r => -r * .55, .03, 'deep', 1],
  [r => -r * .28, .07, ['deep', 'shallow', .5], 1],
  [-.55, .15, 'shallow', 1],
  [-.18, .25, ['shallow', 'sand', .55], 1],
  [0, .3, ['sand', 'shallow', .18], 1],
  [.16, .33, 'sand', 1],
  [.42, .12, 'sand', .7],
  [.8, .03, 'sand', .3],
  [1.2, .008, 'sand', 0],
];
/** Water profile: [distance from the water line, colour mix toward white, alpha]. */
const WATER: Array<[offset: number | ((r: number) => number), white: number, alpha: number]> = [
  [r => -r, 0, .5],
  [r => -r * .45, .03, .5],
  [-.9, .12, .46],
  [-.32, .3, .5],
  [-.08, .62, .72],
  [.12, .7, .8],
];

const scratch = new T.Color(), other = new T.Color(), white = new T.Color('#ffffff');
function ringMesh(rings: Array<{ radius: number; y: number; color: T.Color; alpha: number }>, material: T.Material) {
  // A centre vertex, then SEGMENTS + 1 vertices per ring (the seam is duplicated so nothing wraps).
  const count = 1 + (rings.length - 1) * (SEGMENTS + 1), position = new Float32Array(count * 3), color = new Float32Array(count * 4), normal = new Float32Array(count * 3);
  const put = (i: number, x: number, y: number, z: number, c: T.Color, a: number) => { position.set([x, y, z], i * 3); normal.set([0, 1, 0], i * 3); color.set([c.r, c.g, c.b, a], i * 4); };
  put(0, 0, rings[0].y, 0, rings[0].color, rings[0].alpha);
  for (let k = 1; k < rings.length; k++) for (let s = 0; s <= SEGMENTS; s++) {
    const a = s / SEGMENTS * Math.PI * 2, ring = rings[k];
    put(1 + (k - 1) * (SEGMENTS + 1) + s, Math.cos(a) * ring.radius, ring.y, Math.sin(a) * ring.radius, ring.color, ring.alpha);
  }
  const index: number[] = [];
  for (let s = 0; s < SEGMENTS; s++) index.push(0, 1 + s + 1, 1 + s);
  for (let k = 1; k < rings.length - 1; k++) for (let s = 0; s < SEGMENTS; s++) {
    const a = 1 + (k - 1) * (SEGMENTS + 1) + s, b = a + SEGMENTS + 1;
    index.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new T.BufferAttribute(normal, 3));
  // Four components: three.js then blends with the per-vertex alpha.
  geometry.setAttribute('color', new T.BufferAttribute(color, 4));
  geometry.setIndex(index); geometry.computeBoundingSphere();
  return new T.Mesh(geometry, material);
}

const bankMaterials = new Map<string, T.Material>(), waterMaterials = new Map<string, T.Material>();
/** Shared per look (several ponds, one program); flagged so world teardown leaves them alone. */
function bankMaterial(key: string) {
  let m = bankMaterials.get(key);
  if (!m) { m = toonMaterial({ vertexColors: true, transparent: true }); m.userData.sharedKit = true; bankMaterials.set(key, m); }
  return m;
}
function waterMaterial(key: string) {
  let m = waterMaterials.get(key);
  // Toon like everything else (the reference's water is a toon disc at 55% opacity, no depth write).
  if (!m) { m = toonMaterial({ vertexColors: true, transparent: true, depthWrite: false }); m.userData.sharedKit = true; waterMaterials.set(key, m); }
  return m;
}

/** The bank and water of a round pond of water radius `r` whose surface is at `surface`. */
export function buildPond(r: number, surface: number, waterId: string) {
  const look = pondLook(waterId), colour = (c: Ring[2]) => Array.isArray(c) ? scratch.set(look[c[0]]).lerp(other.set(look[c[1]]), c[2]).clone() : new T.Color(look[c]);
  const at = (o: number | ((r: number) => number)) => Math.max(0, r + (typeof o === 'function' ? o(r) : o));
  const bank = ringMesh(BANK.map(([o, y, c, alpha]) => ({ radius: at(o), y, color: colour(c), alpha })), bankMaterial(waterId));
  bank.name = 'pond-bank'; bank.receiveShadow = true; bank.castShadow = false;
  // Drawn first among see-through things, so blob shadows and rings on the sand are never covered by it.
  bank.renderOrder = -1;
  // Taps on the sand are walks, not casts: only the water is picked.
  bank.raycast = () => {};
  const base = new T.Color(look.water);
  const water = ringMesh(WATER.map(([o, w, alpha]) => ({ radius: at(o), y: surface, color: base.clone().lerp(white, w), alpha })), waterMaterial(waterId));
  water.name = 'pond-water'; water.renderOrder = 1; water.castShadow = false; water.receiveShadow = false;
  const group = new T.Group(); group.name = 'pond'; group.add(bank, water);
  return { group, bank, water, look };
}
