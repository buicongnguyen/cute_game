import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeModel, farmKit } from './assets.ts';
import { toonMaterial } from './toon.ts';
import { ANIMALS, PEN, YARD, isAdult, productReady, growth, type Animal, type AnimalKind } from './farm.ts';

/**
 * The animal pen at home, drawn cheaply: the fence, gate, coop, troughs, hay and floor are baked into a few merged
 * meshes, and the animals are rigid named parts (farm.glb, CONTRACT.md "Farm pen": <id>_body, _head, _wing_l/_r,
 * _leg_l/_r or _leg_fl/fr/bl/br, _tail, each with its origin at its hinge) drawn as one InstancedMesh per kind and part,
 * so eight chickens cost the same draws as one. Until farm.glb loads (or if it is missing) simple shapes with the same
 * part names stand in. Animals roam the open yard oval (farm.ts YARD) like fish in a pond: each walks to a spot with a
 * turn limit, pecks or grazes there and moves on, steps around the coop, beds and decorations, and the hens scurry off
 * when the explorer comes close. A ready egg or milk bottle bobs over the animal that made it; a collected product flies up and shrinks like a harvested crop.
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
const MAX_PER_MODEL: Record<ModelId, number> = { chicken: 8, chick: 8, cow: 4, calf: 4 };
const MAX_LEGS = 4;
/** Hens and chicks are drawn 1.3x their true size so they read at the game camera (a hen is then about 40 px tall, like a ripe crop). */
const SHOWN: Record<AnimalKind, number> = { chicken: 1.3, cow: 1 };

/** Pen pieces inside the fence (pen-local metres, +z toward the gate and the garden), also the animals' keep-out circles. */
export const PEN_PROPS: readonly { id: string; x: number; z: number; rot: number; r: number }[] = [
  { id: 'coop', x: -2.05, z: -1.05, rot: .35, r: 1.05 },
  { id: 'feed_trough', x: .15, z: -1.55, rot: 0, r: .55 },
  { id: 'water_trough', x: 2.15, z: -1.25, rot: 0, r: .65 },
  { id: 'hay_bale', x: 2.45, z: .65, rot: Math.PI / 2, r: .55 },
];

/** A drawn piece: one geometry hung at one hinge (legs: at each leg's hinge, swinging by `sign`). */
interface Part { draw: 'body' | 'head' | 'tail' | 'legs'; geometry: T.BufferGeometry; pivots: { at: T.Vector3; sign: number }[] }
interface Rig { parts: Part[]; height: number }
interface Walker {
  uid: number; kind: AnimalKind; model: ModelId; x: number; z: number; heading: number; goalX: number; goalZ: number;
  wait: number; phase: number; speed: number; peck: number; peckT: number; flap: number; pop: number; size: number; seed: number;
  /** Seconds left of a scurry away from the explorer (faster, no pecking). */
  flee: number;
}
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
/** One toon material with vertex colours for every animal part (colours are baked into the merged part geometry). */
function animalMaterial() { if (!sharedMaterial) { sharedMaterial = toonMaterial({ vertexColors: true }); sharedMaterial.userData.sharedKit = true; } return sharedMaterial; }

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
export function rigOf(root: T.Object3D): Rig {
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
    const color = (o.material as T.MeshStandardMaterial).color ?? new T.Color('#ffffff'), n = g.getAttribute('position').count, colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new T.BufferAttribute(colors, 3));
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

export class FarmPenView {
  /** The baked fence, gate, coop, troughs, hay and floor; the world uses it as the pen entity's mesh. */
  readonly statics = new T.Group();
  /** Animals and product markers, inside `statics` (pen-local metres). */
  readonly animals = new T.Group();
  private rigs = new Map<ModelId, Rig>();
  private meshes = new Map<string, T.InstancedMesh>();
  private walkers = new Map<number, Walker>();
  private flights: Array<{ product: 'egg' | 'milk'; x: number; y: number; z: number; t: number }> = [];
  private rng: () => number;
  private kitUsed = false;
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
  refresh() {
    if (this.kitUsed === farmKit.ready) return;
    this.disposeStatics(); this.disposeAnimals(); this.buildStatics();
  }
  private buildStatics() {
    this.kitUsed = farmKit.ready;
    const g = new T.Group();
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
  /** Where an animal stands (world metres), for bursts and floating text; null if unknown. */
  positionOf(uid: number) { const w = this.walkers.get(uid); return w ? { x: PEN.x + w.x, z: PEN.z + w.z } : null; }
  /** Every animal in world metres with its kind, so a tap on any animal can stand for a tap on the pen. */
  positions() { return [...this.walkers.values()].map(w => ({ uid: w.uid, kind: w.kind, adult: w.model === w.kind, x: PEN.x + w.x, z: PEN.z + w.z })); }
  /** Keep-out circles in world metres (beds, decorations…), refreshed by the world now and then. */
  setKeepOut(list: readonly KeepOut[]) { this.keep = list.map(k => ({ x: k.x - PEN.x, z: k.z - PEN.z, r: k.r })); }
  private keep: KeepOut[] = [];
  private player: { x: number; z: number } | null = null;
  /** A collected product flies up from its animal and shrinks (like a harvested crop). */
  collect(uid: number) {
    const w = this.walkers.get(uid); if (!w) return;
    this.flights.push({ product: PRODUCT[w.kind], x: w.x, y: this.rigOf(w.model).height + .2, z: w.z, t: 0 });
  }
  private rigOf(id: ModelId) { let r = this.rigs.get(id); if (!r) { const src = model(id, true); r = rigOf(src); this.rigs.set(id, r); this.disposeSource(src); } return r; }
  /** Frees a stand-in model once its parts are merged; a kit instance shares the kit's geometry and materials. */
  private disposeSource(src: T.Object3D) { src.traverse(o => { if (o instanceof T.Mesh) { if (!o.geometry.userData.sharedKit) o.geometry.dispose(); const m = o.material as T.Material; if (!m.userData.sharedKit) m.dispose(); } }); }
  private mesh(key: string, geometry: T.BufferGeometry, max: number, shadow: boolean, material: T.Material = animalMaterial()) {
    let m = this.meshes.get(key);
    if (!m) { m = new T.InstancedMesh(geometry, material, max); m.name = `farm-${key}`; m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; this.meshes.set(key, m); this.animals.add(m); }
    return m;
  }
  private productMesh(product: 'egg' | 'milk') {
    const key = `product:${product}`; if (this.meshes.has(key)) return this.meshes.get(key)!;
    const src = model(product, false), rig = rigOf(src); this.disposeSource(src);
    const moved = rig.parts.map(p => p.geometry.translate(p.pivots[0].at.x, p.pivots[0].at.y, p.pivots[0].at.z)), geometry = (moved.length > 1 ? mergeGeometries(moved, false) : null) ?? moved[0];
    for (const g of moved) if (g !== geometry) g.dispose(); geometry.userData.sharedKit = true;
    // Products glow a little so a waiting egg reads against the sand.
    const material = toonMaterial({ vertexColors: true, emissive: '#fff4c2', emissiveIntensity: .25 }); material.userData.sharedKit = true;
    return this.mesh(key, geometry, 16, false, material);
  }
  /** Keeps a walker per animal (new ones pop in at the gate side); forgets the ones that left. */
  private syncWalkers(list: readonly Animal[], now: number) {
    const keep = new Set<number>();
    for (const a of list) {
      keep.add(a.uid); const model = modelOf(a, now); let w = this.walkers.get(a.uid);
      if (!w) {
        const spot = penGoal(this.rng, .6, this.keep);
        w = { flee: 0, uid: a.uid, kind: a.kind, model, x: spot.x, z: spot.z, heading: this.rng() * Math.PI * 2, goalX: spot.x, goalZ: spot.z, wait: this.rng() * 2, phase: this.rng() * 6, speed: 0, peck: 0, peckT: 1 + this.rng() * 3, flap: 0, pop: 0, size: .94 + this.rng() * .12, seed: this.rng() * 10 };
        this.walkers.set(a.uid, w);
      }
      if (w.model !== model) { w.model = model; w.pop = 0; }
    }
    for (const uid of this.walkers.keys()) if (!keep.has(uid)) this.walkers.delete(uid);
  }
  /** Moves and poses every animal and its product marker for this frame. */
  update(list: readonly Animal[], dt: number, time: number, now = Date.now(), player?: { x: number; z: number }) {
    this.player = player ? { x: player.x - PEN.x, z: player.z - PEN.z } : null;
    this.syncWalkers(list, now);
    const counts = new Map<string, number>(), walkers = [...this.walkers.values()];
    for (const w of walkers) this.step(w, walkers, dt);
    for (const m of this.meshes.values()) m.count = 0;
    for (const a of list) {
      const w = this.walkers.get(a.uid)!, rig = this.rigOf(w.model), cow = a.kind === 'cow', young = w.model === 'chick' || w.model === 'calf';
      w.pop = Math.min(1, w.pop + dt * 2.5);
      const pop = w.pop < 1 ? Math.min(1, w.pop * 2) * (1 + Math.sin(w.pop * Math.PI * 2.5) * (1 - w.pop) * .35) : 1;
      // Young ones grow a little toward adult size before they change model.
      const scale = SHOWN[a.kind] * w.size * pop * (young ? .85 + growth(a, now) * .3 : 1), moving = w.speed > .05;
      const bob = moving ? Math.abs(Math.sin(w.phase)) * (cow ? .03 : .025) : 0;
      this.root.compose(this.v.set(w.x, bob, w.z), this.q.setFromEuler(this.e.set(0, w.heading, 0)), this.s.setScalar(scale));
      const swing = moving ? Math.sin(w.phase) * (cow ? .45 : .7) : 0;
      // A hop when a hen flaps; a little sway of the body while walking.
      for (const p of rig.parts) {
        const key = `${w.model}:${p.draw}`, max = MAX_PER_MODEL[w.model] * (p.draw === 'legs' ? MAX_LEGS : 1), mesh = this.mesh(key, p.geometry, max, p.draw === 'body' || p.draw === 'head');
        for (const { at, sign } of p.pivots) {
          let rx = 0, ry = 0, rz = 0;
          if (p.draw === 'head') { rx = w.peck * (cow ? .55 : .9) + Math.sin(time * 2 + w.seed) * .05; ry = Math.sin(time * .7 + w.seed) * .15; }
          else if (p.draw === 'legs') rx = sign * swing;
          else if (p.draw === 'tail') ry = Math.sin(time * 3 + w.seed) * .35;
          else rz = moving ? Math.sin(w.phase) * .04 : 0;
          this.local.compose(this.v2.copy(at).setY(at.y + (p.draw === 'legs' ? 0 : w.flap * .08)), this.q.setFromEuler(this.e.set(rx, ry, rz)), this.one);
          const i = counts.get(key) ?? 0; if (i >= max) continue; counts.set(key, i + 1);
          mesh.setMatrixAt(i, this.m.multiplyMatrices(this.root, this.local)); mesh.count = i + 1;
        }
      }
      if (productReady(a, now)) {
        const marker = this.productMesh(PRODUCT[a.kind]), i = marker.count, y = rig.height * scale + .25 + Math.sin(time * 3 + w.seed) * .06;
        if (i < 16) { marker.setMatrixAt(i, this.m.compose(this.v.set(w.x, y, w.z), this.q.setFromEuler(this.e.set(0, time * 1.5 + w.seed, 0)), this.s.setScalar(1.6))); marker.count = i + 1; }
      }
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]; f.t += dt; const k = f.t / .45;
      if (k >= 1) { this.flights.splice(i, 1); continue; }
      const marker = this.productMesh(f.product), n = marker.count; if (n >= 16) continue;
      const s = 1.6 * (1.4 - k * 1.2);
      marker.setMatrixAt(n, this.m.compose(this.v.set(f.x, f.y + Math.sin(k * Math.PI) * 1.6, f.z), this.q.setFromEuler(this.e.set(0, k * 12, 0)), this.s.setScalar(s))); marker.count = n + 1;
    }
    for (const m of this.meshes.values()) { m.instanceMatrix.needsUpdate = true; m.visible = m.count > 0; }
  }
  /**
   * Roam like a fish: stroll to a spot (usually a short way from here, now and then across the yard) with a turn limit,
   * pause to peck or graze, flap now and then, keep a little apart; scurry off when the explorer walks up close.
   */
  private step(w: Walker, all: readonly Walker[], dt: number) {
    const cow = w.kind === 'cow', young = w.model === 'chick' || w.model === 'calf', margin = cow ? .8 : .45;
    const p = this.player, shy = cow ? 1.5 : 1.3;
    w.flee = Math.max(0, w.flee - dt);
    if (p && w.flee <= 0) {
      const dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz);
      if (d < shy) {
        const away = d > 1e-3 ? { x: dx / d, z: dz / d } : { x: 0, z: 1 }, run = cow ? 1.6 : 2.2;
        const g = intoYard(w.x + away.x * run, w.z + away.z * run, margin);
        w.goalX = g.x; w.goalZ = g.z; w.wait = 0; w.flee = cow ? 1.2 : .8; w.peck = 0; if (!cow) w.flap = 1;
      }
    }
    w.peckT -= dt; if (w.peckT <= 0) { w.peckT = (cow ? 3 : 1.4) + this.rng() * (cow ? 5 : 3); w.peck = 1; }
    w.peck = Math.max(0, w.peck - dt * (cow ? .35 : 1.6));
    w.flap = Math.max(0, w.flap - dt * 2.5); if (!cow && this.rng() < dt * .08) w.flap = 1;
    if (w.wait > 0) { w.wait -= dt; w.speed = Math.max(0, w.speed - dt * 3); }
    else {
      const dx = w.goalX - w.x, dz = w.goalZ - w.z, d = Math.hypot(dx, dz);
      if (d < .15) { w.wait = w.flee > 0 ? .2 : (cow ? 2.5 : 1) + this.rng() * (cow ? 4 : 2.5); const g = penGoal(this.rng, margin, this.keep, this.rng() < .7 ? w : undefined); w.goalX = g.x; w.goalZ = g.z; }
      else {
        const want = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(want - w.heading), Math.cos(want - w.heading)), rate = cow ? 1.6 : 4;
        w.heading += Math.max(-rate * dt, Math.min(rate * dt, turn));
        const top = (cow ? .45 : .8) * (young ? 1.15 : 1) * (w.flee > 0 ? (cow ? 1.8 : 2.4) : 1);
        w.speed = Math.min(top, w.speed + dt * 2) * (Math.abs(turn) > 1.2 ? .4 : 1);
        w.x += Math.sin(w.heading) * w.speed * dt; w.z += Math.cos(w.heading) * w.speed * dt;
      }
    }
    // Personal space, the props and keep-outs (beds, decorations), and the yard oval as hard limits.
    for (const o of all) { if (o === w) continue; const dx = w.x - o.x, dz = w.z - o.z, d = Math.hypot(dx, dz), need = (cow || o.kind === 'cow' ? .9 : .35); if (d > 1e-3 && d < need) { const push = (need - d) * .5; w.x += dx / d * push; w.z += dz / d * push; } }
    for (const k of [...PEN_PROPS, ...this.keep]) { const dx = w.x - k.x, dz = w.z - k.z, d = Math.hypot(dx, dz), need = k.r + (cow ? .45 : .15); if (d < need) { const f = d > 1e-3 ? need / d : 0; w.x = k.x + dx * f || k.x + need; w.z = k.z + dz * f; } }
    const inside = intoYard(w.x, w.z, cow ? .7 : .3); w.x = inside.x; w.z = inside.z;
    w.phase += dt * (cow ? 7 : 16) * Math.min(1, w.speed / .3);
  }
  /** Draw calls the pen costs this frame (statics + visible instanced parts). */
  get draws() { let n = 0; this.statics.traverse(o => { if (o instanceof T.Mesh && !(o instanceof T.InstancedMesh) && o.visible && o.layers.isEnabled(0)) n++; }); for (const m of this.meshes.values()) if (m.visible) n++; return n; }
  private disposeStatics() { for (const c of [...this.statics.children]) { if (c === this.animals) continue; c.removeFromParent(); c.traverse(o => { if (o instanceof T.Mesh) { if (!o.geometry.userData.sharedKit) o.geometry.dispose(); const m = o.material as T.Material; if (!m.userData.sharedKit) m.dispose(); } }); } }
  private disposeAnimals() {
    for (const m of this.meshes.values()) { m.removeFromParent(); m.dispose(); m.geometry.dispose(); if (m.material !== sharedMaterial) (m.material as T.Material).dispose(); }
    this.meshes.clear(); this.rigs.clear();
  }
  dispose() { this.disposeStatics(); this.disposeAnimals(); this.statics.removeFromParent(); this.animals.removeFromParent(); this.walkers.clear(); this.flights = []; }
}
