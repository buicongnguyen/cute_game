import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KitLibrary, modelUrl } from './assets.ts';
import { toonify, toonMaterial } from './toon.ts';
import { COLOSSUS_ACTIVE, colossusFeet, forwardOf, type ColossusAttack } from './colossus-patterns.ts';
import { COLOSSUS_STATS } from './colossus-content.ts';

/**
 * The giant (art/blender/kit/build_colossus.py → colossus.glb) keeps its joint hierarchy, so it is loaded whole rather
 * than through KitLibrary (which flattens a model into parts). The horn crown and the little companion in the same
 * file go through a KitLibrary like every other gear piece. One download serves both.
 */
export const colossusFile = modelUrl('colossus.glb');
let scene: Promise<T.Group> | null = null;
const loadScene = () => scene ??= new GLTFLoader().loadAsync(colossusFile).then(g => g.scene);
export const colossusGearKit = new KitLibrary([colossusFile], () => loadScene()); colossusGearKit.warmOnLoad = true;
let template: T.Object3D | null = null, failed = false;
/** Starts the download once; `then` runs when the model is ready (not on failure: the stand-in stays). */
export function loadColossusArt(then: () => void) {
  if (template) { then(); return; }
  if (failed) return;
  loadScene().then(s => { const root = s.getObjectByName('colossus'); if (!root) throw new Error('colossus.glb has no colossus root'); template = toonify(root.clone(true)); then(); }).catch(() => { failed = true; scene = null; });
}
export const colossusArtReady = () => !!template;

const PIVOTS = { leg_l: [3.7, 7, -.3], leg_r: [-3.7, 7, -.3], body: [0, 7.2, -.3], head: [0, 6.4, 1.2], arm_l: [5.7, 5.2, .3], arm_r: [-5.7, 5.2, .3] } as const;
/** A rough stone giant with the same joints, drawn until colossus.glb arrives (or if it never does). */
function fallbackModel() {
  const stone = toonMaterial({ color: '#4b3a3b', flatShading: true }), rock = toonMaterial({ color: '#80604f', flatShading: true });
  const lava = toonMaterial({ color: '#ff7a1e', emissive: '#ff6a10', emissiveIntensity: 1.6 }), horn = toonMaterial({ color: '#efd9ae', flatShading: true });
  const root = new T.Group(); root.name = 'colossus';
  const pivot = (name: keyof typeof PIVOTS, parent: T.Object3D) => { const g = new T.Group(); g.name = 'colossus_' + name; const [px, py, pz] = PIVOTS[name]; g.position.set(px, py, pz); parent.add(g); return g; };
  const lump = (parent: T.Object3D, mat: T.Material, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => { const m = new T.Mesh(new T.IcosahedronGeometry(r, 1), mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; };
  for (const side of [1, -1]) { const leg = pivot(side > 0 ? 'leg_l' : 'leg_r', root); lump(leg, stone, 1.4, side * 2.4, -3, -.4, 1, 2.6, 1); lump(leg, rock, 1, side * 4.8, -6.2, -.4, 2, .9, 2.5); }
  const body = pivot('body', root); lump(body, stone, 1, 0, 3, 0, 4.6, 3.6, 3); lump(body, lava, 1, 0, 2, 2.6, 1, 1.2, .4);
  const head = pivot('head', body); lump(head, stone, 1, 0, 1.3, 1.2, 1.9, 1.6, 2); for (const side of [1, -1]) { const h = new T.Mesh(new T.ConeGeometry(.5, 3, 5), horn); h.position.set(side * 2, 3, .8); h.rotation.z = -side * .6; head.add(h); lump(head, lava, .3, side * .8, 1.5, 3.1); }
  for (const side of [1, -1]) { const arm = pivot(side > 0 ? 'arm_l' : 'arm_r', body); lump(arm, stone, 1.2, side * 1.6, -4.5, 1.2, 1, 3.4, 1); lump(arm, rock, 1.6, side * 1.9, -9.2, 2.3); }
  return root;
}
export interface ColossusRig { root: T.Group; model: T.Object3D; parts: Record<'body' | 'head' | 'leg_l' | 'leg_r' | 'arm_l' | 'arm_r', T.Object3D>; rest: Map<T.Object3D, T.Vector3>; real: boolean }
/** A posable copy: the Blender giant when it has loaded, else the stand-in. */
export function makeColossusRig(): ColossusRig {
  const model = template ? template.clone(true) : fallbackModel(), root = new T.Group();
  root.name = 'colossus-rig'; root.add(model);
  model.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = true; o.receiveShadow = false; } });
  const get = (n: string) => model.getObjectByName('colossus_' + n) ?? new T.Group();
  const parts = { body: get('body'), head: get('head'), leg_l: get('leg_l'), leg_r: get('leg_r'), arm_l: get('arm_l'), arm_r: get('arm_r') };
  const rest = new Map<T.Object3D, T.Vector3>(); for (const p of Object.values(parts)) rest.set(p, p.position.clone());
  return { root, model, parts, rest, real: !!template };
}

export interface ColossusPose {
  x: number; z: number; ground: number; facing: number; time: number; attack: ColossusAttack | null;
  /** 0–1: how far down on its knees (below 25% health). */ kneel: number;
  /** 0–1 after defeat: crumbling into the canyon. */ dying: number;
  /** 0–1 while rising out of the ground at the start. */ rise: number;
}
const ease = (v: number) => v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
const HIP = 7;
/** Down on bent legs by `d` metres: the root sinks and the legs swing back so the feet stay on the ground. */
function crouchLegs(d: number) { return Math.acos(Math.max(.2, Math.min(1, (HIP - d) / HIP))); }
/**
 * Poses the rig from the fight state alone (no hidden animation state), so every browser draws the same giant.
 * Rotation about x leans forward (the model faces +z); arms and legs swing forward with negative x.
 */
export function poseColossus(rig: ColossusRig, p: ColossusPose) {
  const { body, head, leg_l, leg_r, arm_l, arm_r } = rig.parts, t = p.time;
  for (const [o, rest] of rig.rest) { o.position.copy(rest); o.rotation.set(0, 0, 0); }
  let crouch = 0, lean = Math.sin(t * .9) * .03, headX = Math.sin(t * .5) * .08, headY = Math.sin(t * .37) * .25, twist = 0;
  const arms = { l: { x: Math.sin(t * .9) * .05, z: .08 }, r: { x: -Math.sin(t * .9) * .05, z: -.08 } };
  const a = p.attack;
  if (a && !a.done) {
    const wind = ease(a.age / Math.max(.05, a.windup)), after = a.age - a.windup, strike = after >= 0, back = strike ? ease(1 - (after - Math.max(0, a.life - .8)) / .8) : 1;
    const local = Math.atan2(Math.sin(a.aim - p.facing), Math.cos(a.aim - p.facing)), side: 'l' | 'r' = local >= 0 ? 'l' : 'r';
    const lowered = a.skill === 'bite' || a.skill === 'breath' || a.skill === 'spit';
    if (lowered) {
      const hold = a.skill === 'breath' ? (strike && after < COLOSSUS_ACTIVE.breath ? 1 : strike ? back : wind) : (strike ? (after < .6 ? 1 : ease(1 - (after - .6) / .5)) : wind);
      crouch = 3 * hold; lean = 1.25 * hold + (a.skill === 'bite' && strike && after < .25 ? .15 : 0); headX = .35 * hold; twist = local * hold;
      arms.l.x = arms.r.x = .5 * hold; arms.l.z = .35 * hold; arms.r.z = -.35 * hold;
    }
    if (a.skill === 'slap' || a.skill === 'grab') {
      const arm = arms[side], swing = strike ? Math.max(0, 1 - after / .5) : wind;
      arm.x = strike ? -.9 - .3 * swing : -2.4 * wind; arm.z = (side === 'l' ? 1 : -1) * (.25 + .3 * wind);
      twist = local * .7; lean = strike ? .45 : -.15 * wind; crouch = strike ? 1.4 : 0;
    }
    if (a.skill === 'sweep') {
      const arm = arms[side]; arm.x = -1.25 * (strike ? 1 : wind); arm.z = (side === 'l' ? 1 : -1) * .5;
      const angle = strike ? a.aim + Math.min(1, after / COLOSSUS_ACTIVE.sweep) * 2.4 : a.aim;
      twist = Math.atan2(Math.sin(angle - p.facing), Math.cos(angle - p.facing)) * .85; lean = .55 * (strike ? back : wind); crouch = 2 * (strike ? back : wind);
    }
    if (a.skill === 'meteor') { const up = strike ? Math.max(0, 1 - after / .7) : wind; arms.l.x = arms.r.x = -2.9 * up; arms.l.z = .4 * up; arms.r.z = -.4 * up; headX = -.45 * up; lean = -.18 * up; }
    if (a.skill === 'roar') {
      const open = strike ? Math.max(0, 1 - after / a.life) : wind, shake = strike ? Math.sin(t * 60) * .03 : 0;
      arms.l.z = 1.1 * open; arms.r.z = -1.1 * open; arms.l.x = arms.r.x = -.6 * open; headX = -.55 * open + shake; lean = -.22 * open + shake;
    }
    if (a.skill === 'stomp') {
      const k = a.marks[0]?.k ?? 0, leg = k === 0 ? leg_l : leg_r, mark = a.marks[0];
      if (mark) {
        // The stepping foot travels from its rest spot to the mark: up during the wind-up, slammed down on the blow.
        const feet = colossusFeet({ x: p.x, z: p.z, facing: p.facing }), from = feet[k], f = forwardOf(p.facing), rx = Math.cos(p.facing), rz = -Math.sin(p.facing);
        const k1 = 1 / COLOSSUS_STATS.modelScale, dx = (mark.x - from.x) * k1, dz = (mark.z - from.z) * k1, along = strike ? (after < 1 ? 1 : ease(1 - (after - 1) / .8)) : wind;
        const lx = (dx * rx + dz * rz) * along, lz = (dx * f.x + dz * f.z) * along, lift = strike ? 0 : Math.sin(wind * Math.PI * .92) * 4.5;
        leg.position.x += lx; leg.position.z += lz; leg.position.y += lift; leg.rotation.x = strike ? 0 : -.35 * wind;
        lean = -.12 * wind; twist = local * .35;
      }
    }
  }
  // On its knees: low, leaning in, the head within reach; it keeps fighting from there.
  const kneel = ease(p.kneel);
  crouch = Math.max(crouch, 3.4 * kneel); if (kneel > 0) { lean = Math.max(lean, .65 * kneel); headX = Math.max(headX, .4 * kneel); arms.l.x = Math.min(arms.l.x, -.55 * kneel + arms.l.x * (1 - kneel)); arms.r.x = Math.min(arms.r.x, -.55 * kneel + arms.r.x * (1 - kneel)); }
  const bend = crouchLegs(crouch);
  for (const leg of [leg_l, leg_r]) if (leg.rotation.x === 0 && leg.position.y === rig.rest.get(leg)!.y) leg.rotation.x = bend;
  body.rotation.set(lean, twist * .6, 0); head.rotation.set(headX, twist * .4 + headY * (1 - Math.min(1, Math.abs(twist))), 0);
  arm_l.rotation.set(arms.l.x, 0, arms.l.z); arm_r.rotation.set(arms.r.x, 0, arms.r.z);
  // Rising out of the canyon floor at dusk; crumbling back into it when beaten.
  const rise = ease(p.rise), die = ease(p.dying);
  const scale = COLOSSUS_STATS.modelScale;
  rig.root.scale.setScalar(scale);
  rig.root.position.set(p.x, p.ground - (crouch + (1 - rise) * 20 + die * 14) * scale, p.z);
  rig.root.rotation.set(die * .35, p.facing, die * .2);
}
