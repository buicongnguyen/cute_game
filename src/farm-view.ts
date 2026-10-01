import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeModel, farmKit } from './assets.ts';
import { toonMaterial } from './toon.ts';
import { ANIMALS, PEN, YARD, MAX_ANIMALS_PER_KIND, expired, isAdult, productReady, growth, coatOf, type Animal, type AnimalKind } from './farm.ts';
import { newRoamer, spawnSpot, stepRoamer, RoamGrid, type RoamArea, type Roamer } from './farm-roam.ts';

/**
 * The animal pen at home, drawn cheaply: the fence, gate, coop, troughs, hay and floor are baked into a few merged
 * meshes, and the animals are rigid named parts (farm.glb, CONTRACT.md "Farm pen": <id>_body, _head, _wing_l/_r,
 * _leg_l/_r or _leg_fl/fr/bl/br, _tail, each with its origin at its hinge) drawn as one InstancedMesh per kind and part,
 * so eight chickens cost the same draws as one. Until farm.glb loads (or if it is missing) simple shapes with the same
 * part names stand in. Animals roam the whole home village (farm-roam.ts: clear straight walks, long rests, grazing,
 * dust baths, back to the yard after a long trip) and scurry off when the explorer comes close. Until the pen is built
 * the statics are only a marked plot with a sign. A ready egg or milk bottle bobs over the animal that made it; a collected product flies up and shrinks like a harvested crop.
 */
export { farmKit };

type ModelId = 'chicken' | 'chick' | 'cow' | 'calf';
type Role = 'body' | 'head' | 'wing_l' | 'wing_r' | 'leg_l' | 'leg_r' | 'leg_fl' | 'leg_fr' | 'leg_bl' | 'leg_br' | 'tail';
const ROLES: readonly Role[] = ['body', 'head', 'wing_l', 'wing_r', 'leg_l', 'leg_r', 'leg_fl', 'leg_fr', 'leg_bl', 'leg_br', 'tail'];
const PART_NAME = /_(body|head|wing_[lr]|leg_[lr]|leg_[fb][lr]|tail)(?:_\d+)?$/;
const modelOf = (a: Animal, now: number): ModelId => isAdult(a, now) ? a.kind : a.kind === 'chicken' ? 'chick' : 'calf';
/** Product per model; chicks and calves make nothing. */
const PRODUCT: Record<AnimalKind, 'egg' | 'milk'> = { chicken: 'egg', cow: 'milk' };
/** Most animals of one model the pen can hold (cap at the largest pen); a model has up to four legs. */
const MAX_PER_MODEL: Record<ModelId, number> = { chicken: MAX_ANIMALS_PER_KIND, chick: MAX_ANIMALS_PER_KIND, cow: MAX_ANIMALS_PER_KIND, calf: MAX_ANIMALS_PER_KIND };
const MAX_LEGS = 4, MAX_PRODUCTS = MAX_ANIMALS_PER_KIND * 4;
/** Hens and chicks are drawn 1.3x their true size so they read at the game camera (a hen is then about 40 px tall, like a ripe crop). */
const SHOWN: Record<AnimalKind, number> = { chicken: 1.3, cow: 1 };

/** Pen pieces inside the fence (pen-local metres, +z toward the gate and the garden), also the animals' keep-out circles. */
export const PEN_PROPS: readonly { id: string; x: number; z: number; rot: number; r: number }[] = [
  { id: 'coop', x: -2.05, z: -1.05, rot: .35, r: 1.05 },
  { id: 'feed_trough', x: .15, z: -1.55, rot: 0, r: .55 },
  { id: 'water_trough', x: 2.15, z: -1.25, rot: 0, r: .65 },
  { id: 'hay_bale', x: 2.45, z: .65, rot: Math.PI / 2, r: .55 },
];

/**
 * Breed coats (farm.ts BREEDS order): [coat, second colour, fleck share]. The second colour paints a cow's patches
 * (or a calf's spots) and a hen's flecks: speckles, a black hen's green sheen, a brown chick's stripes. They are
 * per-instance colours on the shared part meshes (a vertex mask picks coat, patch or keep), so a herd of five breeds
 * costs exactly the draws of one.
 */
export const COATS: Record<ModelId, readonly (readonly [string, string, number])[]> = {
  chicken: [['#fffcf2', '#fffcf2', 0], ['#b8592b', '#7e3418', .18], ['#2a2a30', '#2f6b4f', .3], ['#ece6da', '#4a4646', .34], ['#efb85f', '#d4913a', .12]],
  chick: [['#ffe27a', '#ffe27a', 0], ['#d4a265', '#7a4a26', .28], ['#4a4a50', '#f2e3a0', .16], ['#dcd3b0', '#857b6b', .3], ['#ffcf4a', '#f2b23a', .1]],
  cow: [['#fffaf0', '#3b3440', 0], ['#b97a42', '#8a5630', 0], ['#fffaf0', '#a03a24', 0], ['#2f2b32', '#222026', 0], ['#cc6a2a', '#b0561e', 0]],
  calf: [['#fffaf0', '#3b3440', 0], ['#c58a52', '#9a6438', 0], ['#fffaf0', '#a03a24', 0], ['#38343b', '#28252c', 0], ['#d4763a', '#bc6228', 0]],
};
const COAT_COLORS = Object.fromEntries(Object.entries(COATS).map(([id, list]) => [id, list.map(([a, b, f]) => [new T.Color(a), new T.Color(b), f] as const)])) as unknown as Record<ModelId, readonly (readonly [T.Color, T.Color, number])[]>;
/**
 * Which materials are coat (1) or patch (2), by farm.glb material name or a stand-in's colour, with the colour the
 * mask's shading is measured against (a chick's darker wing stays a shade darker in every breed).
 */
const COAT_PARTS: Record<ModelId, Record<string, [1 | 2, string]>> = {
  chicken: { 'Farm feather': [1, '#fffcf2'], '#fffaf0': [1, '#fffaf0'], '#f3e5d0': [1, '#fffaf0'] },
  chick: { 'Farm chick': [1, '#ffd640'], 'Farm chick wing': [1, '#ffd640'], '#ffd84a': [1, '#ffd84a'] },
  cow: { 'Farm cow': [1, '#fffaf0'], 'Farm cow patch': [2, '#3b3440'], '#ffffff': [1, '#ffffff'], '#2f2a2e': [2, '#2f2a2e'] },
  calf: { 'Farm calf': [1, '#e89a52'], 'Farm cow': [2, '#fffaf0'], '#e8b07a': [1, '#e8b07a'], '#fff3e0': [2, '#fff3e0'] },
};

/** A drawn piece: one geometry hung at one hinge (legs: at each leg's hinge, swinging by `sign`). */
interface Part {
  draw: 'body' | 'head' | 'tail' | 'legs'; geometry: T.BufferGeometry; pivots: { at: T.Vector3; sign: number }[];
  /** Its instanced mesh and breed-colour attributes, found once (no per-frame key lookups). */
  mesh?: T.InstancedMesh; coatA?: T.InstancedBufferAttribute; coatB?: T.InstancedBufferAttribute;
}
interface Rig { parts: Part[]; height: number }
/** A roaming animal (world metres, farm-roam.ts) plus how it is drawn. */
interface Walker extends Roamer { expired: boolean; model: ModelId; phase: number; pop: number; size: number; seed: number; coat: number; lodT: number; lodDt: number; seen: boolean }
/** The low fence behind the yard: 2 m segments centred at these pen-local x, along BACK_FENCE_Z (outside the oval). */
export const BACK_FENCE = [-2, 0, 2] as const, BACK_FENCE_Z = -(YARD.rz + .35);
/** A keep-out circle in pen-local metres (beds, decorations, anything else standing in the yard). */
export interface KeepOut { x: number; z: number; r: number }
/** Pulls a pen-local point back inside the yard oval shrunk by `margin`. */
export function intoYard(x: number, z: number, margin: number) {
  const k = (x / (YARD.rx - margin)) ** 2 + (z / (YARD.rz - margin)) ** 2;
  return k <= 1 ? { x, z } : { x: x / Math.sqrt(k), z: z / Math.sqrt(k) };
}

let sharedMaterial: T.MeshToonMaterial | null = null;
/**
 * One toon material with vertex colours for every animal part (colours are baked into the merged part geometry). The
 * coat mask (vertex attribute coatMask: 0 keep, 1 coat, 2 patch) multiplies in each instance's breed colours: coatA
 * (rgb + fleck share) and coatB. Flecks hash the part-local position, so they stay put as the animal moves.
 */
function animalMaterial() {
  if (sharedMaterial) return sharedMaterial;
  const m = sharedMaterial = toonMaterial({ vertexColors: true }); m.userData.sharedKit = true;
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float coatMask;\nattribute vec4 coatA;\nattribute vec3 coatB;')
      .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_COLOR
  if (coatMask > .5) {
    float fleck = fract(sin(dot(floor(position * 24.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    vColor.rgb *= (coatMask > 1.5 || fleck < coatA.w) ? coatB : coatA.rgb;
  }
#endif`);
  };
  m.customProgramCacheKey = () => 'farm-coat';
  return m;
}

function box(color: string, w: number, h: number, d: number, x = 0, y = 0, z = 0) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshStandardMaterial({ color })); m.position.set(x, y, z); return m; }
function ball(color: string, r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) { const m = new T.Mesh(new T.IcosahedronGeometry(r, 1), new T.MeshStandardMaterial({ color })); m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m; }
function cyl(color: string, r: number, h: number, x = 0, y = 0, z = 0) { const m = new T.Mesh(new T.CylinderGeometry(r, r, h, 8), new T.MeshStandardMaterial({ color })); m.position.set(x, y, z); return m; }
/** A named part whose origin is its hinge, holding shapes placed relative to that hinge. */
function part(name: string, pivot: [number, number, number], ...meshes: T.Object3D[]) { const g = new T.Group(); g.name = name; g.position.set(...pivot); g.add(...meshes); return g; }

/** Stand-in animals with the contract's part names and hinges, scaled to the contract's heights. */
export function placeholderAnimal(id: ModelId): T.Group {
  const g = new T.Group(); g.name = id;
  if (id === 'chicken' || id === 'chick') {
    const s = id === 'chick' ? .52 : 1, body = id === 'chick' ? '#ffd84a' : '#fffaf0', beak = '#ffaa2b';
    g.add(part(`${id}_body`, [0, .2 * s, 0], ball(body, .17 * s, 0, .06 * s, 0, 1, .9, 1.2)));
    g.add(part(`${id}_head`, [0, .34 * s, .1 * s], ball(body, .11 * s, 0, .08 * s, .03 * s), ball(beak, .035 * s, 0, .07 * s, .14 * s, 1, .7, 1.3), ...(id === 'chicken' ? [ball('#ff4a4a', .045 * s, 0, .19 * s, .02 * s, .7, 1, 1.2)] : []), ball('#2a1d1d', .02 * s, .06 * s, .1 * s, .1 * s), ball('#2a1d1d', .02 * s, -.06 * s, .1 * s, .1 * s)));
    for (const side of [1, -1]) g.add(part(`${id}_wing_${side > 0 ? 'l' : 'r'}`, [side * .15 * s, .3 * s, 0], ball(body, .1 * s, side * .03 * s, -.06 * s, -.02 * s, .45, .8, 1.2)));
    for (const side of [1, -1]) g.add(part(`${id}_leg_${side > 0 ? 'l' : 'r'}`, [side * .06 * s, .12 * s, 0], cyl(beak, .018 * s, .12 * s, 0, -.06 * s, 0), box(beak, .07 * s, .02 * s, .08 * s, 0, -.115 * s, .02 * s)));
    g.add(part(`${id}_tail`, [0, .3 * s, -.16 * s], ball(id === 'chick' ? body : '#f3e5d0', .08 * s, 0, .05 * s, -.04 * s, .5, 1.2, .8)));
  } else {
    const s = id === 'calf' ? .66 : 1, coat = id === 'calf' ? '#e8b07a' : '#ffffff', spot = id === 'calf' ? '#fff3e0' : '#2f2a2e';
    g.add(part(`${id}_body`, [0, .95 * s, 0], box(coat, .9 * s, .62 * s, 1.5 * s, 0, 0, 0), box(spot, .92 * s, .3 * s, .4 * s, 0, .12 * s, -.25 * s), box('#ffc2cf', .3 * s, .14 * s, .3 * s, 0, -.36 * s, -.35 * s)));
    g.add(part(`${id}_head`, [0, 1.2 * s, .72 * s], box(coat, .5 * s, .5 * s, .45 * s, 0, .1 * s, .22 * s), box('#ffc2cf', .44 * s, .2 * s, .14 * s, 0, -.04 * s, .48 * s), box('#f5d36b', .08 * s, .14 * s, .08 * s, .18 * s, .4 * s, .2 * s), box('#f5d36b', .08 * s, .14 * s, .08 * s, -.18 * s, .4 * s, .2 * s), box('#2a1d1d', .06 * s, .07 * s, .02 * s, .13 * s, .16 * s, .45 * s), box('#2a1d1d', .06 * s, .07 * s, .02 * s, -.13 * s, .16 * s, .45 * s)));
    for (const [n, x, z] of [['fl', -.3, .55], ['fr', .3, .55], ['bl', -.3, -.55], ['br', .3, -.55]] as const)
      g.add(part(`${id}_leg_${n}`, [x * s, .68 * s, z * s], box(coat, .18 * s, .62 * s, .18 * s, 0, -.31 * s, 0), box('#5a3d33', .2 * s, .1 * s, .2 * s, 0, -.63 * s, 0)));
    g.add(part(`${id}_tail`, [0, 1.15 * s, -.76 * s], box(coat, .06 * s, .55 * s, .06 * s, 0, -.27 * s, 0), box('#2f2a2e', .1 * s, .12 * s, .1 * s, 0, -.55 * s, 0)));
  }
  return g;
}
/** Stand-in pen props and products (simple shapes at the contract's sizes; origin at the ground centre). */
export function placeholderProp(id: string): T.Group {
  const g = new T.Group(); g.name = id;
  if (id === 'pen_fence') for (const x of [-1, 1]) g.add(box('#8a5a3b', .13, .9, .13, x, .45, 0)); else if (id === 'pen_gate') { for (const x of [-1, 1]) g.add(box('#8a5a3b', .15, 1.5, .15, x, .75, 0)); g.add(box('#c98f5a', 2.16, .13, .12, 0, 1.36, 0), box('#e8453c', 1.7, .7, .06, 0, .5, 0)); }
  if (id === 'pen_fence') for (const y of [.42, .74]) g.add(box('#d99b5c', 2, .13, .055, 0, y, 0));
  if (id === 'coop') g.add(box('#d8443a', 1.3, .74, 1, 0, .67, 0), box('#f2bf45', 1.6, .2, 1.3, 0, 1.15, 0), box('#f2bf45', 1.1, .25, 1.1, 0, 1.38, 0), box('#5a2c25', .34, .42, .04, 0, .55, .51));
  if (id === 'feed_trough') g.add(box('#a8714a', 1.2, .3, .5, 0, .25, 0), box('#f0cf5a', 1.08, .06, .38, 0, .4, 0));
  if (id === 'water_trough') g.add(cyl('#a8714a', .55, .4, 0, .2, 0), cyl('#5cc8ff', .48, .05, 0, .4, 0));
  if (id === 'hay_bale') g.add(box('#f2cf5b', 1, .5, .6, 0, .26, 0), box('#d84a3c', .04, .52, .62, -.25, .26, 0), box('#d84a3c', .04, .52, .62, .25, .26, 0));
  if (id === 'meat') g.add(ball('#de8c92', .19, 0, .19, 0, 1.35, .7, 1), cyl('#fff0d6', .065, .13, .2, .19, 0), ball('#fff0d6', .065, .27, .19, .025), ball('#fff0d6', .065, .27, .19, -.025));
  if (id === 'egg') g.add(ball('#fff0d6', .045, 0, .06, 0, 1, 1.3, 1));
  if (id === 'milk') g.add(cyl('#ffffff', .07, .22, 0, .11, 0), cyl('#2f9bef', .045, .05, 0, .25, 0), cyl('#ef3b3b', .072, .05, 0, .12, 0));
  return g;
}
function model(id: string, animal: boolean) { return (farmKit.ready ? farmKit.instance(id) : null) ?? (animal ? placeholderAnimal(id as ModelId) : placeholderProp(id)); }

/**
 * Splits a model into what moves: the head, the tail (cows; a bird's tail and wings ride on its body) and the legs,
 * which share one geometry hung at each leg's hinge; everything else is the body. Each piece's meshes are merged with
 * their colours baked in, around its hinge, so a whole model costs three or four draws however many animals use it.
 */
export function rigOf(root: T.Object3D, coats: Record<string, [1 | 2, string]> = {}): Rig {
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.setScalar(1); root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert(), found = new Map<Role, { list: T.BufferGeometry[]; pivot: T.Vector3 }>();
  let height = 0;
  root.traverse(o => {
    if (!(o instanceof T.Mesh) || Array.isArray(o.material)) return;
    let named: T.Object3D | null = o; while (named && named !== root && !PART_NAME.test(named.name)) named = named.parent;
    const own = !!named && named !== root, role = (own ? PART_NAME.exec(named!.name)![1] : 'body') as Role;
    const pivot = own ? new T.Vector3().setFromMatrixPosition(toRoot.clone().multiply(named!.matrixWorld)) : new T.Vector3();
    let g = new T.BufferGeometry(); g.setAttribute('position', o.geometry.getAttribute('position').clone());
    const normal = o.geometry.getAttribute('normal'); if (normal) g.setAttribute('normal', normal.clone());
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    g = g.index ? g.toNonIndexed() : g;
    g.applyMatrix4(toRoot.clone().multiply(o.matrixWorld)); if (!normal) g.computeVertexNormals();
    g.computeBoundingBox(); height = Math.max(height, g.boundingBox!.max.y);
    const material = o.material as T.MeshStandardMaterial, n = g.getAttribute('position').count, colors = new Float32Array(n * 3), mask = new Float32Array(n);
    let color = material.color ?? new T.Color('#ffffff');
    // A coat part keeps only its shade (relative to the coat's own colour); the breed colour comes per instance.
    const coat = coats[material.name] ?? coats['#' + color.getHexString()];
    if (coat) { const base = new T.Color(coat[1]), shade = Math.min(1.2, Math.max(.5, (color.r + color.g + color.b) / Math.max(1e-3, base.r + base.g + base.b))); color = new T.Color(shade, shade, shade); mask.fill(coat[0]); }
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new T.BufferAttribute(colors, 3)); g.setAttribute('coatMask', new T.BufferAttribute(mask, 1));
    const entry = found.get(role) ?? { list: [], pivot }; entry.list.push(g); found.set(role, entry);
  });
  const quadruped = [...found.keys()].some(r => r.startsWith('leg_f')), legs = ROLES.filter(r => r.startsWith('leg_') && found.has(r));
  const drawOf = (r: Role): Part['draw'] => r === 'head' ? 'head' : r.startsWith('leg_') ? 'legs' : r === 'tail' && quadruped ? 'tail' : 'body';
  const merge = (list: T.BufferGeometry[], at: T.Vector3) => { const g = list.length > 1 ? mergeGeometries(list, false) : list[0]; if (!g) return null; g.translate(-at.x, -at.y, -at.z); g.userData.sharedKit = true; g.computeBoundingSphere(); return g; };
  const parts: Part[] = [];
  for (const draw of ['body', 'head', 'tail'] as const) {
    const roles = ROLES.filter(r => found.has(r) && drawOf(r) === draw); if (!roles.length) continue;
    const at = found.get(roles.includes(draw) ? draw : roles[0])!.pivot.clone(), list = roles.flatMap(r => found.get(r)!.list);
    const geometry = merge(list, draw === 'body' ? at : found.get(roles[0])!.pivot);
    if (geometry) parts.push({ draw, geometry, pivots: [{ at, sign: 1 }] });
  }
  if (legs.length) {
    // One leg's shape serves them all (the legs are mirror twins); the rest are only freed.
    const first = found.get(legs[0])!, geometry = merge(first.list, first.pivot);
    for (const r of legs.slice(1)) found.get(r)!.list.forEach(g => g.dispose());
    if (geometry) parts.push({ draw: 'legs', geometry, pivots: legs.map(r => ({ at: found.get(r)!.pivot.clone(), sign: r === 'leg_l' || r === 'leg_fl' || r === 'leg_br' ? 1 : -1 })) });
  }
  return { parts, height };
}

/** Wander goal in the yard oval, off the props and the keep-outs; `near` biases it to a short stroll from there. */
export function penGoal(rng: () => number, margin = .45, keep: readonly KeepOut[] = [], near?: { x: number; z: number }): { x: number; z: number } {
  for (let i = 0; i < 24; i++) {
    let x: number, z: number;
    if (near && i < 12) { const a = rng() * Math.PI * 2, d = 1 + rng() * 2.2; ({ x, z } = intoYard(near.x + Math.sin(a) * d, near.z + Math.cos(a) * d, margin)); }
    else { const a = rng() * Math.PI * 2, d = Math.sqrt(rng()); x = Math.sin(a) * d * (YARD.rx - margin); z = Math.cos(a) * d * (YARD.rz - margin); }
    if (PEN_PROPS.every(p => Math.hypot(x - p.x, z - p.z) > p.r + margin * .5) && keep.every(k => Math.hypot(x - k.x, z - k.z) > k.r + margin * .5)) return { x, z };
  }
  return { x: 0, z: .6 };
}

/** Where animals may go when no world says otherwise (tests, a bare view): the yard oval off the pen's props. */
export function yardArea(): RoamArea {
  return { home: { x: PEN.x, z: PEN.z, rx: YARD.rx, rz: YARD.rz }, radius: 16,
    blocked: (x, z, r) => ((x - PEN.x) / (YARD.rx - r)) ** 2 + ((z - PEN.z) / (YARD.rz - r)) ** 2 > 1 || PEN_PROPS.some(p => Math.hypot(x - PEN.x - p.x, z - PEN.z - p.z) < p.r + r) };
}

export class FarmPenView {
  /** The baked fence, gate, coop, troughs, hay and floor; the world uses it as the pen entity's mesh. */
  readonly statics = new T.Group();
  /** Animals and product markers, inside `statics` (pen-local metres). */
  readonly animals = new T.Group();
  private rigs = new Map<ModelId, Rig>();
  private meshes = new Map<string, T.InstancedMesh>();
  private walkers = new Map<number, Walker>();
  private flights: Array<{ product: 'egg' | 'milk' | 'meat'; x: number; y: number; z: number; t: number }> = [];
  private rng: () => number;
  private kitUsed = false;
  private built = true;
  /** Seconds since the pen was built here (drives the pop-in of the yard); Infinity when it was already standing. */
  private buildT = Infinity;
  private area: RoamArea = yardArea();
  private m = new T.Matrix4(); private q = new T.Quaternion(); private e = new T.Euler(); private v = new T.Vector3(); private one = new T.Vector3(1, 1, 1);
  private root = new T.Matrix4(); private local = new T.Matrix4(); private s = new T.Vector3(); private v2 = new T.Vector3();
  constructor(seed = 7) {
    let state = seed >>> 0; this.rng = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
    // The animals live inside the pen group (pen-local), which the world keeps out of its scenery batches.
    this.statics.name = 'farm-pen'; this.animals.name = 'farm-animals'; this.statics.position.set(PEN.x, 0, PEN.z); this.statics.add(this.animals);
    this.buildStatics();
  }
  /** True once farm.glb is drawn (false while the stand-ins show). */
  get usesKit() { return this.kitUsed; }
  /** Re-dress with farm.glb once it has loaded. */
  /** Marked plot (false) or the built yard; `animate` pops the yard up as it is built. */
  setBuilt(built: boolean, animate = false) {
    if (built === this.built) return;
    this.built = built; this.buildT = animate && built ? 0 : Infinity; this.disposeStatics(); this.buildStatics();
  }
  get isBuilt() { return this.built; }
  /** Where the animals may roam (the world's village ground). */
  setArea(area: RoamArea) { this.area = area; }
  refresh() {
    if (this.kitUsed === farmKit.ready) return;
    this.disposeStatics(); this.disposeAnimals(); this.buildStatics();
  }
  private buildStatics() {
    this.kitUsed = farmKit.ready;
    const g = new T.Group();
    if (!this.built) { this.statics.add(bakeModel(this.plotMarker())); return; }
    // A sandy floor the size of the yard oval and a low fence behind it only (BACK_FENCE): the front and sides stay
    // open so the animals roam freely and nothing hides them from the camera.
    const floor = new T.Mesh(new T.CircleGeometry(1, 36), new T.MeshStandardMaterial({ color: '#efc879' })); floor.rotation.x = -Math.PI / 2; floor.scale.set(YARD.rx + .2, YARD.rz + .2, 1); floor.position.y = .015; floor.receiveShadow = true; g.add(floor);
    const pieces: Array<[string, number, number, number]> = [];
    for (const x of BACK_FENCE) pieces.push(['pen_fence', x, BACK_FENCE_Z, 0]);
    for (const p of PEN_PROPS) pieces.push([p.id, p.x, p.z, p.rot]);
    for (const [id, x, z, rot] of pieces) { const piece = model(id, false); piece.position.set(x, 0, z); piece.rotation.y = rot; piece.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = id !== 'pen_fence'; o.receiveShadow = true; } }); g.add(piece); }
    // A fresh copy so baking never touches the kit's shared meshes; same-look parts merge into a few draws.
    this.statics.add(bakeModel(g));
  }
  /**
   * The unbuilt site: a pale dirt patch roped off by four stakes, and a sign with a hen on it, so the spot reads as
   * "something goes here" without looking like a building.
   */
  private plotMarker() {
    const g = new T.Group(), mat = (color: string) => new T.MeshStandardMaterial({ color });
    const patch = new T.Mesh(new T.CircleGeometry(1, 28), mat('#e3cf9a')); patch.rotation.x = -Math.PI / 2; patch.scale.set(PEN.hw * .9, PEN.hd * .9, 1); patch.position.y = .012; patch.receiveShadow = true; g.add(patch);
    const hw = PEN.hw * .8, hd = PEN.hd * .8, corners: Array<[number, number]> = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    for (const [x, z] of corners) g.add(box('#a8714a', .1, .55, .1, x, .27, z), box('#ff7a59', .14, .08, .14, x, .55, z));
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4], len = Math.hypot(bx - ax, bz - az), rope = box('#f6e3b4', len, .035, .035, (ax + bx) / 2, .42, (az + bz) / 2);
      rope.rotation.y = -Math.atan2(bz - az, bx - ax); g.add(rope);
    }
    // The sign faces the garden (south, toward the camera).
    g.add(box('#8a5a3b', .12, 1.1, .12, 0, .55, hd * .2), box('#f2cf5b', 1.15, .62, .08, 0, 1.08, hd * .2 + .07), box('#c98f5a', 1.25, .08, .1, 0, 1.42, hd * .2 + .07));
    g.add(ball('#fffaf0', .17, 0, 1.05, hd * .2 + .14, 1.1, .9, .4), ball('#ff4a4a', .05, .08, 1.24, hd * .2 + .15, .8, 1, .5), ball('#ffaa2b', .04, .18, 1.08, hd * .2 + .16, 1.2, .7, .5));
    g.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = o !== patch; o.receiveShadow = true; } });
    return g;
  }
  /** Where an animal stands (world metres), for bursts and floating text; null if unknown. */
  positionOf(uid: number) { const w = this.walkers.get(uid); return w ? { x: w.x, z: w.z } : null; }
  /** Every animal in world metres with its kind, so a tap on any animal can stand for a tap on the pen. */
  positions() { return [...this.walkers.values()].map(w => ({ uid: w.uid, kind: w.kind, adult: w.model === w.kind, expired: w.expired, x: w.x, z: w.z })); }
  /** What each animal is doing (for probes and tests): walking, or the kind of rest. */
  activities() { return [...this.walkers.values()].map(w => ({ uid: w.uid, kind: w.kind, young: w.young, expired: w.expired, walking: w.walking, rest: w.rest, x: w.x, z: w.z })); }
  private player: { x: number; z: number } | null = null;
  /** A collected product flies up from its animal and shrinks (like a harvested crop). */
  collect(uid: number, product?: string) {
    const w = this.walkers.get(uid); if (!w) return;
    const item = product === 'meat' || product === 'egg' || product === 'milk' ? product : w.expired ? 'meat' : PRODUCT[w.kind];
    this.flights.push({ product: item, x: w.x - PEN.x, y: item === 'meat' ? .3 : this.rigOf(w.model).height + .2, z: w.z - PEN.z, t: 0 });
  }
  private rigOf(id: ModelId) { let r = this.rigs.get(id); if (!r) { const src = model(id, true); r = rigOf(src, COAT_PARTS[id]); this.rigs.set(id, r); this.disposeSource(src); } return r; }
  /** Frees a stand-in model once its parts are merged; a kit instance shares the kit's geometry and materials. */
  private disposeSource(src: T.Object3D) { src.traverse(o => { if (o instanceof T.Mesh) { if (!o.geometry.userData.sharedKit) o.geometry.dispose(); const m = o.material as T.Material; if (!m.userData.sharedKit) m.dispose(); } }); }
  private mesh(key: string, geometry: T.BufferGeometry, max: number, shadow: boolean, material: T.Material = animalMaterial()) {
    let m = this.meshes.get(key);
    if (!m) {
      // Animal parts carry their breed colours per instance (see animalMaterial).
      if (material === sharedMaterial) { geometry.setAttribute('coatA', new T.InstancedBufferAttribute(new Float32Array(max * 4), 4)); geometry.setAttribute('coatB', new T.InstancedBufferAttribute(new Float32Array(max * 3), 3)); }
      m = new T.InstancedMesh(geometry, material, max); m.name = `farm-${key}`; m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; this.meshes.set(key, m); this.animals.add(m); }
    return m;
  }
  private productMesh(product: 'egg' | 'milk' | 'meat') {
    const key = `product:${product}`; if (this.meshes.has(key)) return this.meshes.get(key)!;
    const src = model(product, false), rig = rigOf(src); this.disposeSource(src);
    const moved = rig.parts.map(p => p.geometry.translate(p.pivots[0].at.x, p.pivots[0].at.y, p.pivots[0].at.z)), geometry = (moved.length > 1 ? mergeGeometries(moved, false) : null) ?? moved[0];
    for (const g of moved) if (g !== geometry) g.dispose(); geometry.userData.sharedKit = true;
    // Products glow a little so a waiting egg reads against the sand.
    const material = toonMaterial({ vertexColors: true, emissive: '#fff4c2', emissiveIntensity: .25 }); material.userData.sharedKit = true;
    return this.mesh(key, geometry, MAX_PRODUCTS, false, material);
  }
  /** Keeps a walker per animal (new ones pop in at the gate side); forgets the ones that left. */
  private syncWalkers(list: readonly Animal[], now: number) {
    const keep = new Set<number>();
    for (const a of list) {
      keep.add(a.uid); const model = modelOf(a, now); let w = this.walkers.get(a.uid);
      if (!w) {
        const young = model !== a.kind, spot = spawnSpot(this.area, this.rng, a.kind, young, [...this.walkers.values()]);
        w = { ...newRoamer(a.uid, a.kind, young, spot, this.rng), model, expired: expired(a, now), phase: this.rng() * 6, pop: 0, size: .94 + this.rng() * .12, seed: this.rng() * 10, coat: 0, lodT: 0, lodDt: 0, seen: true };
        this.walkers.set(a.uid, w);
      }
      w.expired = expired(a, now); w.coat = coatOf(a);
      if (w.expired) { w.walking = false; w.speed = 0; w.rest = 'none'; w.path = []; }
      if (w.model !== model) { w.model = model; w.young = model !== a.kind; w.pop = 0; }
    }
    for (const uid of this.walkers.keys()) if (!keep.has(uid)) this.walkers.delete(uid);
  }
  private camera: T.Camera | null = null;
  private frustum = new T.Frustum(); private sphere = new T.Sphere(); private grid = new RoamGrid(); private live: Walker[] = [];
  /** The camera whose view decides which animals are posed (offscreen ones are not) and which think less often. */
  setCamera(camera: T.Camera) { this.camera = camera; }
  /** Seconds between thinking steps: every frame near the explorer and on screen, ~10 a second far away or off it. */
  private lodStep(w: Walker, seen: boolean) {
    if (w.flee > 0 || !this.player) return 0;
    const d = Math.hypot(w.x - this.player.x, w.z - this.player.z);
    return !seen ? .1 : d > 22 ? .1 : d > 14 ? .05 : 0;
  }
  /** Whether an animal (a sphere round its body, world metres) is inside the camera's view; true without a camera. */
  private onScreen(w: Walker) {
    if (!this.camera) return true;
    this.sphere.center.set(w.x, w.kind === 'cow' ? .8 : .3, w.z); this.sphere.radius = w.kind === 'cow' ? 1.6 : .7;
    return this.frustum.intersectsSphere(this.sphere);
  }
  /** Moves and poses every animal and its product marker for this frame. */
  update(list: readonly Animal[], dt: number, time: number, now = Date.now(), player?: { x: number; z: number }) {
    this.player = player ? { x: player.x, z: player.z } : null;
    if (this.camera) { this.camera.updateMatrixWorld(); this.frustum.setFromProjectionMatrix(this.m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)); }
    if (this.buildT < 1) { this.buildT += dt; const k = Math.min(1, this.buildT / .6), s = k < 1 ? k * (1 + Math.sin(k * Math.PI) * .25) : 1; for (const c of this.statics.children) if (c !== this.animals) c.scale.set(1, Math.max(.01, s), 1); }
    this.syncWalkers(list, now);
    const walkers = this.live; walkers.length = 0; for (const w of this.walkers.values()) if (!w.expired) walkers.push(w);
    this.grid.build(walkers);
    // Far or offscreen animals think a few times a second with the gathered time (their walks stay on the same line).
    for (const w of walkers) {
      w.seen = this.onScreen(w); w.lodDt += dt; w.lodT -= dt; if (w.lodT > 0) continue;
      w.lodT = this.lodStep(w, w.seen); stepRoamer(w, walkers, this.area, this.rng, Math.min(w.lodDt, .25), this.player, this.grid); w.lodDt = 0;
    }
    for (const w of walkers) w.phase += dt * (w.kind === 'cow' ? 7 : 16) * Math.min(1, w.speed / .3);
    for (const m of this.meshes.values()) m.count = 0;
    for (const a of list) {
      const w = this.walkers.get(a.uid)!;
      if (w.expired) {
        const marker = this.productMesh('meat'), i = marker.count;
        if (i < MAX_PRODUCTS) { marker.setMatrixAt(i, this.m.compose(this.v.set(w.x - PEN.x, .15 + Math.sin(time * 3 + w.seed) * .05, w.z - PEN.z), this.q.setFromEuler(this.e.set(0, time * .7 + w.seed, 0)), this.s.setScalar(1.6))); marker.count = i + 1; }
        continue;
      }
      const rig = this.rigOf(w.model), cow = a.kind === 'cow', young = w.model === 'chick' || w.model === 'calf';
      w.pop = Math.min(1, w.pop + dt * 2.5);
      // Offscreen animals are not posed at all (no matrices written, nothing drawn).
      if (!w.seen) continue;
      const [coatA, coatB, fleck] = this.coatColors(w.model, w.coat);
      const pop = w.pop < 1 ? Math.min(1, w.pop * 2) * (1 + Math.sin(w.pop * Math.PI * 2.5) * (1 - w.pop) * .35) : 1;
      // Young ones grow a little toward adult size before they change model.
      const scale = SHOWN[a.kind] * w.size * pop * (young ? .85 + growth(a, now) * .3 : 1), moving = w.speed > .05;
      // Hens hop a little as they walk; a sitting or dust-bathing hen settles onto the ground (and wobbles in the dust).
      const bob = moving ? Math.abs(Math.sin(w.phase)) * (cow ? .03 : .05) : 0, settle = cow ? 0 : -w.sit * .13 * scale, dust = w.rest === 'dust' ? Math.sin(time * 13 + w.seed) * .18 * w.sit : 0;
      this.root.compose(this.v.set(w.x - PEN.x, bob + settle, w.z - PEN.z), this.q.setFromEuler(this.e.set(0, w.heading, dust)), this.s.setScalar(scale));
      const swing = moving ? Math.sin(w.phase) * (cow ? .45 : .7) : 0;
      // A hop when a hen flaps; a little sway of the body while walking.
      for (const p of rig.parts) {
        if (!p.mesh) {
          // Only bodies cast shadows: a head's shadow merges into the body's at this camera, and it saves a shadow draw per model.
          p.mesh = this.mesh(`${w.model}:${p.draw}`, p.geometry, MAX_PER_MODEL[w.model] * (p.draw === 'legs' ? MAX_LEGS : 1), p.draw === 'body');
          p.coatA = p.geometry.getAttribute('coatA') as T.InstancedBufferAttribute; p.coatB = p.geometry.getAttribute('coatB') as T.InstancedBufferAttribute;
        }
        const mesh = p.mesh, max = mesh.instanceMatrix.count;
        for (const { at, sign } of p.pivots) {
          let rx = 0, ry = 0, rz = 0;
          // Grazing: head down to the grass with a slow chew; pecking: a quick dip.
          if (p.draw === 'head') { rx = Math.max(w.peck * .9, w.graze * (cow ? .75 : .6)) + w.graze * Math.sin(time * 6 + w.seed) * .06 + Math.sin(time * 2 + w.seed) * .05; ry = Math.sin(time * .7 + w.seed) * .15 * (1 - w.graze * .6); }
          else if (p.draw === 'legs') rx = sign * swing;
          else if (p.draw === 'tail') ry = Math.sin(time * 3 + w.seed) * .35;
          else rz = moving ? Math.sin(w.phase) * .04 : 0;
          this.local.compose(this.v2.copy(at).setY(at.y + (p.draw === 'legs' ? 0 : w.flap * .08)), this.q.setFromEuler(this.e.set(rx, ry, rz)), this.one);
          const i = mesh.count; if (i >= max) continue;
          mesh.setMatrixAt(i, this.m.multiplyMatrices(this.root, this.local)); mesh.count = i + 1;
          p.coatA?.setXYZW(i, coatA.r, coatA.g, coatA.b, fleck); p.coatB?.setXYZ(i, coatB.r, coatB.g, coatB.b);
        }
      }
      if (productReady(a, now)) {
        const marker = this.productMesh(PRODUCT[a.kind]), i = marker.count, y = rig.height * scale + .25 + Math.sin(time * 3 + w.seed) * .06;
        if (i < MAX_PRODUCTS) { marker.setMatrixAt(i, this.m.compose(this.v.set(w.x - PEN.x, y, w.z - PEN.z), this.q.setFromEuler(this.e.set(0, time * 1.5 + w.seed, 0)), this.s.setScalar(1.6))); marker.count = i + 1; }
      }
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]; f.t += dt; const k = f.t / .45;
      if (k >= 1) { this.flights.splice(i, 1); continue; }
      const marker = this.productMesh(f.product), n = marker.count; if (n >= MAX_PRODUCTS) continue;
      const s = 1.6 * (1.4 - k * 1.2);
      marker.setMatrixAt(n, this.m.compose(this.v.set(f.x, f.y + Math.sin(k * Math.PI) * 1.6, f.z), this.q.setFromEuler(this.e.set(0, k * 12, 0)), this.s.setScalar(s))); marker.count = n + 1;
    }
    for (const m of this.meshes.values()) {
      m.instanceMatrix.needsUpdate = true; m.visible = m.count > 0;
      for (const name of ['coatA', 'coatB']) { const at = m.geometry.getAttribute(name) as T.InstancedBufferAttribute | undefined; if (at && m.count) { at.clearUpdateRanges(); at.addUpdateRange(0, m.count * at.itemSize); at.needsUpdate = true; } }
    }
  }
  /** Linear colours for a breed of a model (an unknown index wears the first breed). */
  private coatColors(id: ModelId, coat: number) { const list = COAT_COLORS[id]; return list[coat] ?? list[0]; }
  /** Which breed each animal shows (for probes and tests). */
  coats() { return [...this.walkers.values()].map(w => ({ uid: w.uid, model: w.model, coat: w.coat })); }
  /** Draw calls the pen costs this frame (statics + visible instanced parts). */
  get draws() { let n = 0; this.statics.traverse(o => { if (o instanceof T.Mesh && !(o instanceof T.InstancedMesh) && o.visible && o.layers.isEnabled(0)) n++; }); for (const m of this.meshes.values()) if (m.visible) n++; return n; }
  private disposeStatics() { for (const c of [...this.statics.children]) { if (c === this.animals) continue; c.removeFromParent(); c.traverse(o => { if (o instanceof T.Mesh) { if (!o.geometry.userData.sharedKit) o.geometry.dispose(); const m = o.material as T.Material; if (!m.userData.sharedKit) m.dispose(); } }); } }
  private disposeAnimals() {
    for (const m of this.meshes.values()) { m.removeFromParent(); m.dispose(); m.geometry.dispose(); if (m.material !== sharedMaterial) (m.material as T.Material).dispose(); }
    this.meshes.clear(); this.rigs.clear();
  }
  dispose() { this.disposeStatics(); this.disposeAnimals(); this.statics.removeFromParent(); this.animals.removeFromParent(); this.walkers.clear(); this.flights = []; }
}
