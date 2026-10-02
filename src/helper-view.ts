import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { helperKit } from './assets.ts';
import { toonMaterial } from './toon.ts';
import * as M from './model.ts';
import { nextTask, rememberPlantings, type HelperTask } from './helper.ts';

/**
 * Bolt, the garden helper, in the world: helper.glb's six rigid parts (CONTRACT.md "Garden helper"), each merged
 * with its colours baked into one geometry around its joint, all drawn with one shared vertex-colour toon material:
 * six small draws and no shadow pass (a soft blob sits under it instead). Until the kit loads, simple shapes with the
 * same parts stand in.
 *
 * It walks to the bed `nextTask` picks, stands beside it, plays a short pose (tug for a harvest, a tilt of the
 * watering can for planting), then calls back into the game, which applies the rule (helper.ts) and the usual
 * harvest/plant effects. With nothing to do it strolls back to its spot by the garden and idles. A visitor's copy
 * (act = false) never touches the beds: it potters from bed to bed watering, so visitors see the owner's helper at work.
 */
type Role = 'body' | 'head' | 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r';
const ROLES: readonly Role[] = ['body', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r'];
/** Its idle spot: the front-left corner of the garden, out of the explorer's usual path. */
export const HELPER_HOME = { x: M.GARDEN_CENTRE.x - 3.1, z: M.GARDEN_CENTRE.z + 2.6 };
const SPEED = 1.5, STAND = .78, WORK: Record<HelperTask['kind'], number> = { harvest: .9, plant: 1.1 };
/** Shown 1.5x: 0.8 m to the leaf tip, about 40 % of the explorer's 1.93 m (a quarter of its on-screen area). At the true quarter height (0.53 m) it was
 * about 20 px tall at the 1440x900 game camera and hard to spot among the crops; hens are likewise shown 1.3x. */
export const HELPER_SCALE = 1.5;

export interface HelperFrame {
  /** The garden being drawn (the player's, or the owner's when visiting); null hides the helper. */
  state: M.SaveState | null;
  /** True only for the owner's own game: then the helper really harvests and plants. */
  act: boolean;
  now: number;
  harvest(index: number): boolean;
  plant(index: number): boolean;
}

/** Shared rigid robot presentation; callers own their tasks and never mutate through this method. */
export interface HelperPose { visible: boolean; x: number; z: number; facing: number; mode: 'idle' | 'walk' | 'work'; work?: 'harvest' | 'plant' }

let material: T.MeshToonMaterial | null = null;
function sharedMaterial() { if (!material) { material = toonMaterial({ vertexColors: true }); material.userData.sharedKit = true; } return material; }

function stand(): Record<Role, { at: T.Vector3; shapes: { g: T.BufferGeometry; color: string; m: T.Matrix4 }[] }> {
  const sphere = (r: number) => new T.IcosahedronGeometry(r, 1), m = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion(), new T.Vector3(sx, sy, sz));
  return {
    body: { at: new T.Vector3(0, .2, 0), shapes: [{ g: sphere(.11), color: '#ffd24a', m: m(0, .2, 0) }, { g: new T.CylinderGeometry(.104, .104, .09, 10), color: '#4fbf3a', m: m(0, .165, .012) }] },
    head: { at: new T.Vector3(0, .29, 0), shapes: [{ g: sphere(.105), color: '#ffd24a', m: m(0, .36, 0, 1.08, .9, .95) }, { g: sphere(.075), color: '#24335a', m: m(0, .355, .062, 1.1, .75, .7) }, { g: sphere(.03), color: '#6fd24a', m: m(0, .5, 0, 1.4, .4, .6) }] },
    arm_l: { at: new T.Vector3(-.118, .235, 0), shapes: [{ g: sphere(.026), color: '#4fbf3a', m: m(-.118, .15, 0, 1, 2.2, 1) }] },
    arm_r: { at: new T.Vector3(.118, .235, 0), shapes: [{ g: sphere(.026), color: '#4fbf3a', m: m(.118, .15, 0, 1, 2.2, 1) }, { g: new T.CylinderGeometry(.04, .04, .06, 10), color: '#ff8a2a', m: m(.125, .1, .02) }] },
    leg_l: { at: new T.Vector3(-.045, .11, 0), shapes: [{ g: sphere(.034), color: '#c46a2e', m: m(-.045, .04, .012, 1, .8, 1.35) }] },
    leg_r: { at: new T.Vector3(.045, .11, 0), shapes: [{ g: sphere(.034), color: '#c46a2e', m: m(.045, .04, .012, 1, .8, 1.35) }] },
  };
}

/** Bakes a list of (geometry, colour, placement) into one vertex-coloured geometry around `at`. */
function bake(list: { g: T.BufferGeometry; color: string | T.Color; m: T.Matrix4 }[], at: T.Vector3) {
  const pieces = list.map(({ g, color, m }) => {
    let p = new T.BufferGeometry(); p.setAttribute('position', g.getAttribute('position').clone());
    const n = g.getAttribute('normal'); if (n) p.setAttribute('normal', n.clone()); if (g.index) p.setIndex(g.index.clone());
    p = p.index ? p.toNonIndexed() : p; p.applyMatrix4(m); if (!n) p.computeVertexNormals();
    const c = new T.Color(color), count = p.getAttribute('position').count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    p.setAttribute('color', new T.BufferAttribute(colors, 3)); return p;
  });
  const merged = pieces.length > 1 ? mergeGeometries(pieces, false) : pieces[0]; if (pieces.length > 1) pieces.forEach(p => p.dispose());
  merged.translate(-at.x, -at.y, -at.z); merged.computeBoundingSphere(); return merged;
}

export class HelperView {
  readonly group = new T.Group();
  x = HELPER_HOME.x; z = HELPER_HOME.z; facing = 0;
  /** What it is doing now, for tests and the dev hook. */
  mode: 'idle' | 'walk' | 'work' = 'idle';
  task: HelperTask | null = null;
  private parts = new Map<Role, T.Object3D>();
  private fromKit = false; private t = 0; private workT = 0; private thinkT = 0; private stride = 0; private wanderI = 0;
  private goal: { x: number; z: number } | null = null;
  constructor() { this.group.name = 'garden-helper'; this.group.visible = false; }

  private build() {
    const kit = helperKit.ready ? helperKit.parts('helper') : undefined;
    for (const o of this.parts.values()) { o.removeFromParent(); (o as T.Mesh).geometry?.dispose(); }
    this.parts.clear();
    const found = new Map<Role, { at: T.Vector3 | null; list: { g: T.BufferGeometry; color: T.Color | string; m: T.Matrix4 }[] }>();
    if (kit?.length) {
      for (const p of kit) {
        const role = /helper_(body|head|arm_[lr]|leg_[lr])/.exec(p.name)?.[1] as Role | undefined; if (!role) continue;
        const entry = found.get(role) ?? { at: null, list: [] };
        // Each mesh's matrix is relative to the model root; its translation is the part's joint (CONTRACT.md).
        entry.at ??= new T.Vector3().setFromMatrixPosition(p.matrix);
        entry.list.push({ g: p.geometry, color: (p.material as T.MeshStandardMaterial).color ?? '#ffffff', m: p.matrix }); found.set(role, entry);
      }
    }
    this.fromKit = ROLES.every(r => found.has(r));
    const parts = this.fromKit ? Object.fromEntries([...found].map(([r, e]) => [r, { at: e.at!, shapes: e.list }])) as ReturnType<typeof stand> : stand();
    for (const role of ROLES) {
      const { at, shapes } = parts[role], mesh = new T.Mesh(bake(shapes, at), sharedMaterial());
      mesh.name = 'helper_' + role; mesh.position.copy(at); mesh.userData.rest = at.clone(); mesh.castShadow = false; mesh.receiveShadow = false;
      this.parts.set(role, mesh); this.group.add(mesh);
    }
    if (!this.group.getObjectByName('helper-blob')) {
      const blob = new T.Mesh(new T.CircleGeometry(.17, 16), new T.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: .22, depthWrite: false }));
      blob.name = 'helper-blob'; blob.rotation.x = -Math.PI / 2; blob.position.y = .02; this.group.add(blob);
    }
    this.group.scale.setScalar(HELPER_SCALE);
  }

  /** Where the helper stands to work on bed `i`: beside it, on the side it comes from. */
  private standBy(s: M.SaveState, i: number) {
    const b = M.bedPosition(s, i), dx = this.x - b.x, dz = this.z - b.z, d = Math.hypot(dx, dz) || 1;
    return { x: b.x + dx / d * STAND, z: b.z + dz / d * STAND };
  }

  update(dt: number, f: HelperFrame) {
    const s = f.state, show = !!s?.helper?.owned;
    this.group.visible = show; if (!show || !s) { this.task = null; this.mode = 'idle'; return; }
    if (!this.parts.size || helperKit.ready && !this.fromKit) this.build();
    if (!helperKit.requested) void helperKit.load().then(() => { if (helperKit.ready) this.build(); });
    this.t += dt;
    if (this.mode === 'work') {
      this.workT -= dt;
      if (this.workT <= 0) {
        const task = this.task!;
        if (f.act && s.plots[task.index]) { if (task.kind === 'harvest') f.harvest(task.index); else f.plant(task.index); }
        this.task = null; this.mode = 'idle'; this.thinkT = .45; this.goal = null;
      }
    } else if ((this.thinkT -= dt) <= 0) {
      this.thinkT = .5;
      if (f.act) { rememberPlantings(s); this.task = nextTask(s, this, f.now); }
      else if (s.helper!.paused || !s.plots.length) this.task = null;
      // A visitor's copy only pretends: it waters one bed after another.
      else if (!this.task && this.mode !== 'walk') this.task = { kind: 'plant', index: (this.wanderI = (this.wanderI + 1 + Math.floor(Math.random() * 3)) % s.plots.length) };
      this.goal = this.task ? this.standBy(s, this.task.index) : HELPER_HOME;
    }
    if (this.mode !== 'work' && this.goal) {
      const dx = this.goal.x - this.x, dz = this.goal.z - this.z, d = Math.hypot(dx, dz);
      if (d > .06) { const step = Math.min(d, SPEED * dt); this.x += dx / d * step; this.z += dz / d * step; this.mode = 'walk'; this.turnTo(Math.atan2(dx, dz), dt); }
      else if (this.task) { this.mode = 'work'; this.workT = WORK[this.task.kind] * (f.act ? 1 : 2.2); }
      else { this.mode = 'idle'; this.goal = null; }
    }
    if (this.task && this.mode === 'work') { const b = M.bedPosition(s, this.task.index); this.turnTo(Math.atan2(b.x - this.x, b.z - this.z), dt); }
    this.pose(dt);
  }
  present(dt: number, pose: HelperPose) {
    this.group.visible = pose.visible; if (!pose.visible) return;
    if (!this.parts.size || helperKit.ready && !this.fromKit) this.build();
    if (!helperKit.requested) void helperKit.load().then(() => { if (helperKit.ready) this.build(); });
    this.x = pose.x; this.z = pose.z; this.facing = pose.facing; this.mode = pose.mode; this.t += dt;
    this.pose(dt, pose.work);
  }
  private turnTo(target: number, dt: number) { this.facing += Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing)) * Math.min(1, dt * 10); }

  /** Rigid-part animation: a bouncy waddle, a tug (harvest), a can tilt (plant) and an idle look-around. */
  private pose(dt: number, work = this.task?.kind) {
    const p = (r: Role) => this.parts.get(r)!, t = this.t;
    if (!this.parts.size) return;
    for (const r of ROLES) { const o = p(r); o.rotation.set(0, 0, 0); o.position.copy(o.userData.rest as T.Vector3); }
    let bob = 0;
    if (this.mode === 'walk') {
      this.stride += dt * 13; const s = Math.sin(this.stride);
      p('leg_l').rotation.x = s * .7; p('leg_r').rotation.x = -s * .7; p('arm_l').rotation.x = -s * .6; p('arm_r').rotation.x = s * .35;
      bob = Math.abs(Math.cos(this.stride)) * .025; p('body').rotation.z = s * .06; p('head').rotation.z = -s * .05;
    } else if (this.mode === 'work' && work === 'harvest') {
      const k = Math.sin(t * 9);
      p('body').rotation.x = .35; p('head').rotation.x = .25; p('head').position.z += .03;
      p('arm_l').rotation.x = -1.1 + k * .35; p('arm_r').rotation.x = -1.1 - k * .35; bob = -.02;
    } else if (this.mode === 'work') {
      // Watering: the right arm lifts the can forward and tips it; the head watches.
      p('arm_r').rotation.x = -1.25 + Math.sin(t * 5) * .12; p('arm_r').rotation.z = .25; p('head').rotation.x = .3; p('body').rotation.x = .1;
      p('arm_l').rotation.x = Math.sin(t * 3) * .15;
    } else {
      p('head').rotation.y = Math.sin(t * .9) * .5; p('head').rotation.z = Math.sin(t * 1.7) * .06;
      p('arm_l').rotation.z = -.1 - Math.sin(t * 2) * .05; p('arm_r').rotation.z = .1 + Math.sin(t * 2) * .05; bob = Math.sin(t * 2) * .006;
    }
    this.group.position.set(this.x, bob, this.z); this.group.rotation.y = this.facing;
  }
  /** Moves it straight to its spot (after a rebuild or a teleport). */
  reset() { this.x = HELPER_HOME.x; this.z = HELPER_HOME.z; this.task = null; this.mode = 'idle'; this.goal = null; this.thinkT = 0; }
}
