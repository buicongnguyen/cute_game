/**
 * Flag Rush drawn: the kit (art/blender/kit/build_ctf.py → ctf.glb), the Multiworld Gate and its keeper at home, the
 * isle (a painted ground, the river, bridges, fences, rocks and border trees, instanced), flags, pads, power-ups, the
 * bots' strike marks and shots (pooled: nothing is created or disposed mid-match). Simple shapes stand in until the
 * file arrives.
 */
import { assetUrl } from './asset-url.ts';
import * as T from 'three';
import { KitLibrary, modelUrl } from './assets.ts';
import { toonMaterial } from './toon.ts';
import { CTF, FIELD, POWERS, type PowerKind, type TeamId } from './ctf-content.ts';
import { fieldObstacles } from './ctf-rules.ts';

export const ctfKit = new KitLibrary([modelUrl('ctf.glb')]); ctfKit.warmOnLoad = true;
export const TEAM_COLORS = ['#3f8cff', '#ff5a5f'] as const;
const TEAM_GLOW = ['#9fd0ff', '#ffb0b0'] as const;
export const NEUTRAL = '#ffc94a';
const mats = new Map<string, T.MeshToonMaterial>();
const mat = (color: string, glow = 0) => { const key = color + glow; let m = mats.get(key); if (!m) { m = toonMaterial({ color, emissive: glow ? color : '#000000', emissiveIntensity: glow }); m.userData.sharedKit = true; mats.set(key, m); } return m; };
function mesh(geometry: T.BufferGeometry, color: string, x = 0, y = 0, z = 0, glow = 0) { const m = new T.Mesh(geometry, mat(color, glow)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
const noPick = (o: T.Object3D) => { o.traverse(c => { c.raycast = () => {}; }); return o; };
export const teamTint = (team: number): Record<string, string> => team < 0 ? { 'CTF team': NEUTRAL, 'CTF team glow': '#fff3b0' } : { 'CTF team': TEAM_COLORS[team as TeamId], 'CTF team glow': TEAM_GLOW[team as TeamId] };
const kit = (name: string, tint?: Record<string, string>) => (ctfKit.ready ? ctfKit.instance(name, tint) : null);

// ---------------------------------------------------------------- home: the gate and its keeper
/** The ring leans back 28 degrees (build_ctf.py LEAN) so the game camera sees its face; the swirl spins in that plane. */
const GATE_LEAN = 28 * Math.PI / 180, GATE_CENTRE = { y: .5 + 1.85 * Math.cos(GATE_LEAN), z: -1.85 * Math.sin(GATE_LEAN) };
export function buildGate(): T.Group {
  const g = new T.Group(); g.name = 'ctf-gate';
  const body = kit('ctf_gate'), swirl = kit('ctf_gate_swirl');
  const tilt = new T.Group(); tilt.position.set(0, GATE_CENTRE.y, GATE_CENTRE.z); tilt.rotation.x = -GATE_LEAN; tilt.updateMatrix();
  const pivot = new T.Group(); pivot.name = 'swirl'; tilt.add(pivot); g.add(tilt);
  if (body && swirl) { g.add(body); swirl.applyMatrix4(tilt.matrix.clone().invert()); pivot.add(swirl); }
  else {
    g.add(mesh(new T.CylinderGeometry(2.2, 2.3, .35, 20), '#b8a98f', 0, .17, 0));
    const ring = mesh(new T.TorusGeometry(1.85, .32, 8, 28), '#c9b796'); tilt.add(ring);
    const disc = mesh(new T.CircleGeometry(1.55, 28), '#7a5cff', 0, 0, 0, 1); (disc.material as T.Material).side = T.DoubleSide; pivot.add(disc);
  }
  return noPick(g) as T.Group;
}
export function buildKeeper(): T.Group {
  const k = kit('ctf_keeper'); if (k) return k;
  const g = new T.Group();
  g.add(mesh(new T.CylinderGeometry(.32, .55, 1.05, 14), '#3b5fa8', 0, .52, 0), mesh(new T.IcosahedronGeometry(.34, 1), '#ffe0c2', 0, 1.25, 0), mesh(new T.ConeGeometry(.42, .7, 14), '#2c4688', 0, 1.75, 0), mesh(new T.ConeGeometry(.2, .3, 5), '#ffd23f', .6, 1.95, 0, 1.2));
  return g;
}

// ---------------------------------------------------------------- the isle
const GROUND_PAD = 12;
/** The painted ground: grass, mown stripes, paths from each base to the bridges and pads, base circles. */
function groundTexture() {
  const W = FIELD.hx * 2 + GROUND_PAD * 2, H = FIELD.hz * 2 + GROUND_PAD * 2, px = 6;
  const c = document.createElement('canvas'); c.width = Math.round(W * px); c.height = Math.round(H * px);
  const g = c.getContext('2d'); if (!g) return null;
  const X = (x: number) => (x + W / 2) * px, Z = (z: number) => (z + H / 2) * px;
  g.fillStyle = '#69c44f'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,60,0,.04)'; g.fillRect(X(-FIELD.hx + i * FIELD.hx / 7), 0, FIELD.hx / 7 * px, c.height); }
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5000; i++) { g.fillStyle = ['#74cf5a', '#5db748', '#7dd863', '#57ad42'][i & 3]; const s = 1 + r() * 3; g.fillRect(r() * c.width, r() * c.height, s, s); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  const path = (pts: Array<[number, number]>, w: number, col: string) => { g.strokeStyle = col; g.lineWidth = w * px; g.beginPath(); pts.forEach(([x, z], i) => i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))); g.stroke(); };
  for (const s of [-1, 1]) for (const col of ['#d9b77a', '#e8cc94']) {
    const w = col === '#d9b77a' ? 3.4 : 2.4;
    path([[s * 44, 0], [s * 26, 0], [s * 4, 0]], w, col);
    path([[s * 33, 0], [s * 18, -12], [s * 4, -17]], w, col); path([[s * 33, 0], [s * 18, 12], [s * 4, 17]], w, col);
    path([[s * 30, 6], [s * 14, 20], [s * 8, 24]], w * .8, col); path([[s * 30, -6], [s * 14, -20], [s * 8, -24]], w * .8, col);
  }
  for (const t of [0, 1] as const) {
    const s = FIELD.stands[t]; g.fillStyle = t ? 'rgba(255,90,95,.18)' : 'rgba(63,140,255,.18)'; g.beginPath(); g.arc(X(s.x), Z(s.z), FIELD.fence.r * px, 0, Math.PI * 2); g.fill();
    g.strokeStyle = t ? 'rgba(255,90,95,.35)' : 'rgba(63,140,255,.35)'; g.lineWidth = .22 * px; g.setLineDash([1.2 * px, .8 * px]); g.beginPath(); g.arc(X(s.x), Z(s.z), CTF.baseR * px, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  }
  // The river bed and banks (the water is its own mesh above).
  g.fillStyle = '#c7a86e'; g.fillRect(X(-FIELD.river.half - .8), Z(-FIELD.hz - 2), (FIELD.river.half + .8) * 2 * px, (FIELD.hz + 2) * 2 * px);
  // Sand all round the isle.
  g.strokeStyle = '#f2dca0'; g.lineWidth = 5 * px; g.strokeRect(X(-FIELD.hx - 4.5), Z(-FIELD.hz - 4.5), (FIELD.hx + 4.5) * 2 * px, (FIELD.hz + 4.5) * 2 * px);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
/** Copies of one kit piece drawn as instanced meshes (one draw per material). */
function instanced(name: string, spots: Array<{ x: number; z: number; rot?: number; s?: number }>, tint?: Record<string, string>): T.Object3D | null {
  const src = kit(name, tint); if (!src || !spots.length) return null;
  const g = new T.Group(), m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0);
  src.updateMatrixWorld(true);
  src.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    const inst = new T.InstancedMesh(o.geometry, o.material, spots.length);
    spots.forEach((p, i) => { q.setFromAxisAngle(up, p.rot ?? 0); const s = p.s ?? 1; m.compose(new T.Vector3(p.x, 0, p.z), q, new T.Vector3(s, s, s)).multiply(o.matrixWorld); inst.setMatrixAt(i, m); });
    inst.castShadow = true; inst.receiveShadow = true; inst.raycast = () => {}; g.add(inst);
  });
  return g;
}
export interface ArenaParts { root: T.Group; flags: [T.Group, T.Group]; powers: T.Group[]; pads: T.Group[]; beacon: T.Mesh }
export function buildArena(): ArenaParts {
  const root = new T.Group(); root.name = 'ctf-arena';
  const W = FIELD.hx * 2 + GROUND_PAD * 2, H = FIELD.hz * 2 + GROUND_PAD * 2;
  const tex = groundTexture();
  const ground = new T.Mesh(new T.PlaneGeometry(W, H).rotateX(-Math.PI / 2), tex ? toonMaterial({ map: tex }) : mat('#69c44f')); ground.receiveShadow = true; ground.position.y = -.01; root.add(ground);
  const sea = new T.Mesh(new T.PlaneGeometry(W + 400, H + 400).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#3fb6d8' })); sea.position.y = -.6; root.add(sea);
  const water = new T.Mesh(new T.PlaneGeometry(FIELD.river.half * 2 + .6, FIELD.hz * 2 + 6).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#46b9e6', transparent: true, opacity: .88 })); water.position.y = .04; water.name = 'ctf-water'; root.add(water);
  for (const s of [-1, 1]) { const foam = new T.Mesh(new T.PlaneGeometry(.35, FIELD.hz * 2 + 6).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#e6fbff', transparent: true, opacity: .8 })); foam.position.set(s * (FIELD.river.half + .15), .05, 0); root.add(foam); }
  // Bridges
  for (const b of FIELD.river.bridges) { const k = kit('ctf_bridge'); if (k) { k.position.set(0, 0, b); root.add(k); } else root.add(mesh(new T.BoxGeometry(8, .3, FIELD.river.bridgeHalf * 2), '#b07a4a', 0, .15, b)); }
  // Fences, rocks and the border trees, from the same circles the bots and the explorer collide with.
  const obstacles = fieldObstacles(), posts: Array<{ x: number; z: number; rot: number }> = [];
  for (const t of [0, 1] as const) { const s = FIELD.stands[t]; for (const o of obstacles) if (Math.abs(Math.hypot(o.x - s.x, o.z - s.z) - FIELD.fence.r) < .01) posts.push({ x: o.x, z: o.z, rot: Math.atan2(o.x - s.x, o.z - s.z) + Math.PI / 2 }); }
  const rocks = FIELD.rocks.flatMap(([x, z, r], i) => [{ x, z, s: r / 1.05, rot: i }, { x: -x, z: -z, s: r / 1.05, rot: i + 2 }]);
  const trees: Array<{ x: number; z: number; s: number; rot: number }> = [];
  for (let x = -FIELD.hx - 3; x <= FIELD.hx + 3; x += 5.5) for (const z of [-FIELD.hz - 3, FIELD.hz + 3]) trees.push({ x: x + ((x * 7) % 2), z: z + (x % 3), s: .9 + (Math.abs(x) % 4) * .1, rot: x });
  for (let z = -FIELD.hz + 2; z <= FIELD.hz - 2; z += 5.5) for (const x of [-FIELD.hx - 3, FIELD.hx + 3]) trees.push({ x, z, s: 1 + (Math.abs(z) % 3) * .1, rot: z });
  const postMesh = instanced('ctf_post', posts), rockMesh = instanced('ctf_rock', rocks), treeMesh = instanced('ctf_tree', trees);
  if (postMesh) root.add(postMesh); else for (const p of posts) root.add(mesh(new T.CylinderGeometry(.2, .2, 1, 6), '#b07a4a', p.x, .5, p.z));
  if (rockMesh) root.add(rockMesh); else for (const r of rocks) root.add(mesh(new T.IcosahedronGeometry(r.s, 0), '#9aa0ab', r.x, r.s * .5, r.z));
  if (treeMesh) root.add(treeMesh); else for (const t of trees) root.add(mesh(new T.ConeGeometry(1.1, 3, 7), '#4fae4a', t.x, 1.5, t.z));
  // Bases: stands and banners
  for (const t of [0, 1] as const) {
    const s = FIELD.stands[t], stand = kit('ctf_stand', teamTint(t)) ?? (() => { const g = new T.Group(); g.add(mesh(new T.CylinderGeometry(1.2, 1.25, .3, 16), TEAM_COLORS[t], 0, .15, 0)); return g; })();
    stand.position.set(s.x, 0, s.z); root.add(stand);
    for (const dz of [-6.5, 6.5]) { const b = kit('ctf_banner', teamTint(t)); if (b) { b.position.set(s.x + (t ? 4.5 : -4.5), 0, s.z + dz); root.add(b); } }
  }
  // Pads
  const pads: T.Group[] = [];
  for (const p of FIELD.pads) { const g = kit('ctf_pad', teamTint(p.team)) ?? (() => { const g = new T.Group(); g.add(mesh(new T.CylinderGeometry(1.2, 1.3, .3, 18), p.team < 0 ? NEUTRAL : TEAM_COLORS[p.team as TeamId], 0, .15, 0, .3)); return g; })(); g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(p.tx - p.x, p.tz - p.z); root.add(g); pads.push(g); }
  // Power-up rings (the power-up itself is added when it appears)
  const powers: T.Group[] = [];
  for (const sp of FIELD.powerSpots) { const ring = kit('ctf_power_ring') ?? (() => { const g = new T.Group(); g.add(mesh(new T.CylinderGeometry(.95, .95, .08, 16), '#e8dcc0', 0, .04, 0)); return g; })(); ring.position.set(sp.x, 0, sp.z); root.add(ring); const holder = new T.Group(); holder.position.set(sp.x, 0, sp.z); root.add(holder); powers.push(holder); }
  const flags: [T.Group, T.Group] = [buildFlag(0), buildFlag(1)]; root.add(flags[0], flags[1]);
  // A light column over the carrier: the carrier is always seen.
  const beacon = new T.Mesh(new T.CylinderGeometry(.5, .7, 18, 12, 1, true).translate(0, 9, 0), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .22, depthWrite: false, side: T.DoubleSide })); beacon.visible = false; root.add(beacon);
  noPick(root);
  return { root, flags, powers, pads, beacon };
}
export function buildFlag(team: TeamId): T.Group {
  const g = new T.Group(); g.name = 'ctf-flag-' + team;
  const k = kit('ctf_flag', teamTint(team));
  if (k) { k.rotation.y = Math.PI / 2; g.add(k); }
  else { g.add(mesh(new T.CylinderGeometry(.05, .05, 2.6, 6), '#f3e6c8', 0, 1.3, 0)); g.add(mesh(new T.BoxGeometry(1.1, .75, .05), TEAM_COLORS[team], .58, 2.2, 0)); }
  return g;
}
export function buildPower(kind: PowerKind): T.Group {
  const k = kit('ctf_pw_' + kind); if (k) { k.scale.setScalar(1.25); return noPick(k) as T.Group; }
  const g = new T.Group(); g.add(mesh(new T.IcosahedronGeometry(.4, 1), POWERS[kind].color, 0, .45, 0, .4)); return g;
}

/** The bots' pending strikes: a filling disc and a rim where a blast or zone will land. Pooled. */
export class StrikeMarks {
  readonly root = new T.Group();
  private pool: Array<{ fill: T.Mesh; rim: T.Mesh }> = []; private used = 0;
  private disc = new T.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  private ring = new T.RingGeometry(.9, 1, 40).rotateX(-Math.PI / 2);
  constructor() { this.root.name = 'ctf-strikes'; }
  begin() { this.used = 0; }
  draw(x: number, z: number, r: number, progress: number, color: string) {
    let p = this.pool[this.used++];
    if (!p) {
      const m = () => new T.MeshBasicMaterial({ color, transparent: true, opacity: .3, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      p = { fill: new T.Mesh(this.disc, m()), rim: new T.Mesh(this.ring, m()) }; p.fill.renderOrder = p.rim.renderOrder = 3; this.root.add(p.fill, p.rim); this.pool.push(p);
    }
    for (const m of [p.fill, p.rim]) { m.visible = true; m.position.set(x, .07, z); (m.material as T.MeshBasicMaterial).color.set(color); }
    p.rim.scale.setScalar(r); (p.rim.material as T.MeshBasicMaterial).opacity = .85;
    p.fill.scale.setScalar(Math.max(.05, r * Math.min(1, progress))); (p.fill.material as T.MeshBasicMaterial).opacity = .22 + .2 * progress;
  }
  end() { for (let i = this.used; i < this.pool.length; i++) { this.pool[i].fill.visible = false; this.pool[i].rim.visible = false; } }
}
/** Glowing shots for the bots' ranged blows, pooled. */
export class Shots {
  readonly root = new T.Group();
  private list: Array<{ mesh: T.Mesh; fx: number; fz: number; tx: number; tz: number; t: number }> = [];
  private geo = new T.IcosahedronGeometry(.18, 1);
  constructor() { this.root.name = 'ctf-shots'; }
  fire(fx: number, fz: number, tx: number, tz: number, color: string) {
    let s = this.list.find(v => v.t >= 1);
    if (!s) { s = { mesh: new T.Mesh(this.geo, new T.MeshBasicMaterial({ color, toneMapped: false })), fx, fz, tx, tz, t: 1 }; s.mesh.raycast = () => {}; this.root.add(s.mesh); this.list.push(s); }
    Object.assign(s, { fx, fz, tx, tz, t: 0 }); (s.mesh.material as T.MeshBasicMaterial).color.set(color); s.mesh.visible = true;
  }
  update(dt: number) { for (const s of this.list) { if (s.t >= 1) { s.mesh.visible = false; continue; } s.t = Math.min(1, s.t + dt / .22); s.mesh.position.set(s.fx + (s.tx - s.fx) * s.t, 1.1 + Math.sin(s.t * Math.PI) * .4, s.fz + (s.tz - s.fz) * s.t); } }
}
export const powerIcon = (kind: PowerKind) => assetUrl(`icons/ctf/${kind}.webp`);
