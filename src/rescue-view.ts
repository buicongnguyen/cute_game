/**
 * Rescue Call drawn (art/blender/kit/build_rescue.py → rescue.glb; CONTRACT.md "Rescue Call"): the SOS portal by the
 * south square, and the Hold the Line field in "landscape local" coordinates under one root that the runtime turns a
 * quarter for portrait play. Everything repeated is instanced or pooled, nothing is created per frame:
 * - the ground is one canvas texture (grass, the lanes' dirt paths, the camp's sand); chevrons, pads, posts, decor and
 *   border trees are instanced per kit piece;
 * - raiders are drawn instanced per creature kind (the planet's own creature at its normal size, a light raider tint,
 *   a hit flash, a frost tint), with instanced variant props (scarf / helmet / banner from wave 3) and blob shadows
 *   (their health bars are the game's own, on the stand-in bodies); at most RESCUE.maxLive live at once;
 * - defences are one small baked model per pad (rebuilt only when a pad's kind or level changes), heads turn to aim;
 * - shots and zaps are pooled.
 * Simple shapes stand in until the kit file arrives.
 */
import * as T from 'three';
import { KitLibrary, modelUrl, bakeModel } from './assets.ts';
import { toonMaterial } from './toon.ts';
import { ENEMY_TYPES } from './enemy-types.ts';
import { RESCUE, MISSIONS, DEFENCES, FIELDS, type MissionId, type DefenceKind, type Point } from './rescue-content.ts';
import { pointAt, type Field, type RsRun, type RsEnemy, type RsDefence } from './rescue-rules.ts';

export const rescueKit = new KitLibrary([modelUrl('rescue.glb')]);
const mats = new Map<string, T.Material>();
const mat = (color: string, glow = 0) => { const key = color + glow; let m = mats.get(key); if (!m) { m = toonMaterial({ color, emissive: glow ? color : '#000000', emissiveIntensity: glow }); m.userData.sharedKit = true; mats.set(key, m); } return m; };
const basic = (color: string, opacity = 1) => { const key = 'b' + color + opacity; let m = mats.get(key); if (!m) { m = new T.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false }); m.userData.sharedKit = true; mats.set(key, m); } return m; };
function mesh(g: T.BufferGeometry, color: string, x = 0, y = 0, z = 0, glow = 0) { const m = new T.Mesh(g, mat(color, glow)); m.position.set(x, y, z); return m; }
const noPick = <O extends T.Object3D>(o: O) => { o.traverse(c => { c.raycast = () => {}; }); return o; };
const kit = (name: string, tint?: Record<string, string>) => (rescueKit.ready ? rescueKit.instance(name, tint) : null);
export const rescueIcon = (name: string) => `${import.meta.env.BASE_URL}assets/icons/rescue/${name}.webp`;

// ---------------------------------------------------------------- the portal by the south square
const LEAN = 28 * Math.PI / 180, PORTAL_CENTRE = { y: .4 + 1.8 * Math.cos(LEAN), z: -1.8 * Math.sin(LEAN) };
export function buildPortal(): T.Group {
  const g = new T.Group(); g.name = 'rescue-portal';
  const body = kit('rs_portal'), swirl = kit('rs_portal_swirl');
  const tilt = new T.Group(); tilt.position.set(0, PORTAL_CENTRE.y, PORTAL_CENTRE.z); tilt.rotation.x = -LEAN; tilt.updateMatrix();
  const pivot = new T.Group(); pivot.name = 'swirl'; tilt.add(pivot); g.add(tilt);
  if (body && swirl) { g.add(bakeModel(body)); swirl.applyMatrix4(tilt.matrix.clone().invert()); pivot.add(swirl); }
  else {
    g.add(mesh(new T.CylinderGeometry(2, 2.1, .3, 10), '#c7a77a', 0, .15, 0));
    tilt.add(mesh(new T.TorusGeometry(1.7, .3, 6, 20), '#d9b98a'));
    const disc = mesh(new T.CircleGeometry(1.42, 24), '#ff8a4d', 0, 0, 0, 1); (disc.material as T.Material).side = T.DoubleSide; pivot.add(disc);
  }
  return noPick(g);
}

// ---------------------------------------------------------------- the field
const GROUND_PAD = 10;
function groundTexture(field: Field, mission: MissionId) {
  const md = MISSIONS[mission], W = RESCUE.half.x * 2 + GROUND_PAD * 2, H = RESCUE.half.z * 2 + GROUND_PAD * 2, px = 7;
  const c = document.createElement('canvas'); c.width = Math.round(W * px); c.height = Math.round(H * px);
  const g = c.getContext('2d'); if (!g) return null;
  const X = (x: number) => (x + W / 2) * px, Z = (z: number) => (z + H / 2) * px;
  const [base, light, sand] = md.ground;
  g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
  let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 4200; i++) { g.fillStyle = i % 3 ? light : 'rgba(0,0,0,.05)'; const s = 1 + r() * 3; g.fillRect(r() * c.width, r() * c.height, s, s); }
  // Mown stripes across the field make the lanes' direction easy to read.
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.025)'; g.fillRect(X(-RESCUE.half.x + i * RESCUE.half.x / 8), 0, RESCUE.half.x / 8 * px, c.height); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  // Paths: a darker edge, then the dirt, then a light middle line.
  for (const [w, col] of [[3.4, 'rgba(90,60,30,.35)'], [2.8, sand], [.5, 'rgba(255,255,255,.28)']] as Array<[number, string]>) {
    g.strokeStyle = col; g.lineWidth = w * px;
    for (const l of field.lanes) for (const rt of l.routes) { g.beginPath(); rt.pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z)))); g.stroke(); }
  }
  // Your end: a sandy yard with a warm stripe where raiders must not pass; their side: a red dashed spawn line.
  g.fillStyle = sand; g.fillRect(X(-W / 2), Z(-RESCUE.half.z - 2), (RESCUE.endX + W / 2) * px, (RESCUE.half.z * 2 + 4) * px);
  g.fillStyle = 'rgba(255,200,60,.55)'; g.fillRect(X(RESCUE.endX - .25), Z(-RESCUE.half.z), .5 * px, RESCUE.half.z * 2 * px);
  g.strokeStyle = 'rgba(230,60,60,.5)'; g.lineWidth = .3 * px; g.setLineDash([1 * px, .7 * px]); g.beginPath(); g.moveTo(X(30.5), Z(-RESCUE.half.z)); g.lineTo(X(30.5), Z(RESCUE.half.z)); g.stroke(); g.setLineDash([]);
  // Pads' soft shadows
  g.fillStyle = 'rgba(0,0,0,.12)'; for (const p of field.pads) { g.beginPath(); g.arc(X(p.x), Z(p.z), 1.4 * px, 0, Math.PI * 2); g.fill(); }
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4; return tex;
}
type Spot = { x: number; z: number; rot?: number; s?: number };
/** Copies of one kit piece, instanced (one draw per material), or null before the kit arrives. */
function instanced(name: string, spots: Spot[], tint?: Record<string, string>, shadow = false): T.Object3D | null {
  const src = kit(name, tint); if (!src || !spots.length) return null;
  const g = new T.Group(), m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), v = new T.Vector3(), s3 = new T.Vector3();
  src.updateMatrixWorld(true);
  src.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    const inst = new T.InstancedMesh(o.geometry, o.material, spots.length);
    spots.forEach((p, i) => { q.setFromAxisAngle(up, p.rot ?? 0); const s = p.s ?? 1; m.compose(v.set(p.x, 0, p.z), q, s3.set(s, s, s)).multiply(o.matrixWorld); inst.setMatrixAt(i, m); });
    inst.castShadow = shadow; inst.receiveShadow = true; inst.computeBoundingSphere(); inst.raycast = () => {}; g.add(inst);
  });
  return g;
}
export interface FieldParts { root: T.Group; pads: T.Group; marker: T.Mesh; range: T.Mesh; farmhouse: T.Object3D }
export function buildFieldView(field: Field, mission: MissionId): FieldParts {
  const md = MISSIONS[mission], root = new T.Group(); root.name = 'rescue-field';
  const W = RESCUE.half.x * 2 + GROUND_PAD * 2, H = RESCUE.half.z * 2 + GROUND_PAD * 2, tex = groundTexture(field, mission);
  const ground = new T.Mesh(new T.PlaneGeometry(W, H).rotateX(-Math.PI / 2), tex ? toonMaterial({ map: tex }) : mat(md.ground[0])); ground.receiveShadow = true; ground.position.y = -.01; root.add(ground);
  const skirt = new T.Mesh(new T.PlaneGeometry(W + 260, H + 260).rotateX(-Math.PI / 2), basic(md.ground[0])); skirt.position.y = -.05; root.add(skirt);
  // Chevrons along every route, pointing toward your end.
  const chevrons: Spot[] = [];
  for (const l of field.lanes) l.routes.forEach((rt, ri) => { for (let d = 3; d < rt.length - 2; d += 4.2) { if (ri > 0 && d < 12) continue; const p = pointAt(rt, d); chevrons.push({ x: p.x, z: p.z, rot: Math.atan2(-p.dx, -p.dz) }); } });
  const chev = instanced('rs_chevron', chevrons); if (chev) root.add(chev);
  // Pads, posts
  const pads = new T.Group(); pads.name = 'pads';
  const padSpots = field.pads.map(p => ({ x: p.x, z: p.z, rot: 0 })), padMesh = instanced('rs_pad', padSpots);
  if (padMesh) pads.add(padMesh); else for (const p of field.pads) pads.add(mesh(new T.CylinderGeometry(1.2, 1.25, .2, 8), '#b9b2a6', p.x, .1, p.z));
  root.add(pads);
  const posts = instanced('rs_post', field.posts.map(p => ({ x: p.x + 1.1, z: p.z - 1.1, s: .8 }))); if (posts) root.add(posts);
  // Your end: the camp and the friend's farmhouse (roof in the planet's colour).
  const farm = kit('rs_farmhouse', { 'RS roof': mission === 'candy' ? '#ff6fae' : mission === 'jungle' ? '#3f9a4a' : '#e8524a' }) ?? (() => { const g = new T.Group(); g.add(mesh(new T.BoxGeometry(4.2, 2.2, 3.2), '#fff1d6', 0, 1.1, 0), mesh(new T.ConeGeometry(3, 1.4, 4), '#e8524a', 0, 2.9, 0)); return g; })();
  farm.position.set(RESCUE.camp.x - 4.6, 0, 0); farm.rotation.y = Math.PI / 2; root.add(bakeModel(farm));
  const camp = kit('rs_camp'); if (camp) { camp.position.set(RESCUE.camp.x, 0, -8.5); camp.rotation.y = Math.PI / 2; root.add(bakeModel(camp)); }
  // Decor and border trees (instanced per kind).
  const byKind = new Map<string, Spot[]>();
  for (const [kind, x, z, rot] of FIELD_DECOR(mission, field)) { const list = byKind.get(kind) ?? []; list.push({ x, z, rot: rot ?? (x * 1.7 + z) % 6.28, s: 1 }); byKind.set(kind, list); }
  for (const [kind, spots] of byKind) { const o = instanced(kind, spots, { 'RS leaf': mission === 'candy' ? '#ff9ccf' : mission === 'toy' ? '#34b84a' : '#1f8a3a' }, kind === 'rs_tree'); if (o) root.add(o); else for (const s of spots) root.add(mesh(new T.IcosahedronGeometry(.7, 0), '#8a9a6a', s.x, .5, s.z)); }
  // The selected pad's marker and its defence's range.
  const marker = new T.Mesh(new T.RingGeometry(1.35, 1.6, 32).rotateX(-Math.PI / 2), basic('#ffe14d', .9)); marker.position.y = .28; marker.visible = false; marker.renderOrder = 4; root.add(marker);
  const range = new T.Mesh(new T.CircleGeometry(1, 48).rotateX(-Math.PI / 2), basic('#7fd0ff', .14)); range.position.y = .06; range.visible = false; range.renderOrder = 3; root.add(range);
  noPick(root);
  return { root, pads, marker, range, farmhouse: farm };
}
/** The field's decor from content plus border trees, as [kit piece, x, z, rot?]. */
function FIELD_DECOR(mission: MissionId, field: Field): Array<[string, number, number, number?]> {
  void field;
  const out: Array<[string, number, number, number?]> = [];
  for (const d of FIELD_DECOR_LIST(mission)) out.push(d);
  for (let x = -RESCUE.half.x - 2; x <= RESCUE.half.x + 2; x += 4.6) for (const z of [-RESCUE.half.z - 3, RESCUE.half.z + 3]) out.push(['rs_tree', x + ((x * 7) % 2), z + (x % 2.4), x]);
  for (let z = -RESCUE.half.z + 1; z <= RESCUE.half.z - 1; z += 4.4) out.push(['rs_tree', RESCUE.half.x + 3.4, z, z]);
  for (const z of [-RESCUE.half.z + 1, -RESCUE.half.z + 5, RESCUE.half.z - 5, RESCUE.half.z - 1]) out.push(['rs_tree', -RESCUE.half.x - 4, z, z]);
  return out;
}
const FIELD_DECOR_LIST = (mission: MissionId) => FIELDS[mission].decor;

// ---------------------------------------------------------------- defences on pads
const HEAD = (name: string) => name + '_head';
/** One defence's model: the kit piece for its level (baked; the head kept apart on a pivot so it can aim). */
export function buildDefence(kind: DefenceKind, level: number): T.Group {
  const name = `rs_${kind}_${level}`, src = kit(name), g = new T.Group(); g.name = name;
  const pivot = new T.Group(); pivot.name = 'head';
  if (src) {
    const heads = src.children.filter(c => c.name.startsWith(HEAD(name)));
    if (heads.length) { const at = heads[0].position.clone(); pivot.position.copy(at); for (const h of heads) { h.position.sub(at); pivot.add(h); } }
    g.add(bakeModel(src)); if (pivot.children.length) g.add(bakeModel(pivot));
  } else {
    const col = { popcorn: '#ff5a5f', tesla: '#e08a3c', cannon: '#9a6a40', wall: '#d9c08a', frost: '#bff4ff' }[kind];
    g.add(mesh(kind === 'wall' ? new T.BoxGeometry(2.6, .35 * level, .6) : new T.CylinderGeometry(.5, .6, .8 + .15 * level, 10), col, 0, kind === 'wall' ? .18 * level : .4 + .07 * level, 0, kind === 'frost' ? .6 : 0));
    pivot.position.y = .9; pivot.add(mesh(new T.CylinderGeometry(.12, .12, .9, 8).rotateX(Math.PI / 2).translate(0, 0, .45), '#2f3542')); if (kind !== 'wall' && kind !== 'frost') g.add(pivot);
  }
  g.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  return noPick(g);
}
export class DefenceViews {
  readonly root = new T.Group();
  private slots: Array<{ key: string; model: T.Group | null; head: T.Object3D | null; pop: number; hurt: number }> = [];
  private bars: T.InstancedMesh; private fills: T.InstancedMesh;
  constructor(private field: Field, private retire: (o: T.Object3D) => void = o => o.removeFromParent()) {
    this.root.name = 'rescue-defences';
    const bar = new T.PlaneGeometry(1.6, .16), fill = new T.PlaneGeometry(1.6, .12).translate(.8, 0, 0);
    this.bars = new T.InstancedMesh(bar, basic('#2a2236', .75), field.pads.length); this.fills = new T.InstancedMesh(fill, new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), field.pads.length);
    this.bars.frustumCulled = this.fills.frustumCulled = false; this.bars.renderOrder = this.fills.renderOrder = 6; this.root.add(this.bars, this.fills);
    field.pads.forEach(() => this.slots.push({ key: '', model: null, head: null, pop: 0, hurt: 0 }));
  }
  hurt(pad: number) { const s = this.slots[pad]; if (s) s.hurt = .18; }
  private m = new T.Matrix4(); private t = new T.Matrix4(); private t2 = new T.Matrix4(); private v = new T.Vector3(); private s = new T.Vector3(); private c = new T.Color();
  update(defences: ReadonlyArray<RsDefence | null>, dt: number, time: number, faceCamera: T.Quaternion) {
    let bars = 0;
    defences.forEach((d, i) => {
      const slot = this.slots[i], pad = this.field.pads[i], key = d ? `${d.kind}:${d.level}:${rescueKit.ready ? 1 : 0}` : '';
      if (slot.key !== key) {
        if (slot.model) this.retire(slot.model);
        slot.model = null; slot.head = null; slot.key = key;
        if (d) { const g = buildDefence(d.kind, d.level); g.position.set(pad.x, .2, pad.z); if (d.kind === 'wall') g.rotation.y = Math.atan2(pad.block.x - pad.x, pad.block.z - pad.z) + Math.PI / 2; this.root.add(g); slot.model = g; slot.head = g.getObjectByName('head') ?? null; slot.pop = .35; }
      }
      if (!d || !slot.model) return;
      // Build pop, hurt shake, aim and idle motion.
      slot.pop = Math.max(0, slot.pop - dt); slot.hurt = Math.max(0, slot.hurt - dt);
      const k = slot.pop > 0 ? 1 + Math.sin(slot.pop / .35 * Math.PI) * .25 : 1; slot.model.scale.set(k, k, k);
      slot.model.position.x = pad.x + (slot.hurt > 0 ? Math.sin(time * 90) * .06 : 0);
      if (slot.head) {
        if (d.kind === 'tesla') slot.head.rotation.y += dt * 2.4;
        else if (d.kind === 'frost') slot.head.rotation.z = Math.sin(time * 1.7 + i) * .12;
        else { const cur = slot.head.rotation.y, want = d.aim; slot.head.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 12); }
      }
      if (d.hp < d.maxHp) {
        this.m.compose(this.v.set(pad.x, 2.6, pad.z), faceCamera, this.s.set(1, 1, 1)); this.bars.setMatrixAt(bars, this.m);
        this.m.multiply(this.t.makeTranslation(-.8, 0, .01)).multiply(this.t2.makeScale(Math.max(.02, d.hp / d.maxHp), 1, 1)); this.fills.setMatrixAt(bars, this.m);
        this.fills.setColorAt(bars, this.c.set(d.hp / d.maxHp > .5 ? '#7aff9a' : d.hp / d.maxHp > .25 ? '#ffd23f' : '#ff5a5f')); bars++;
      }
    });
    this.bars.count = this.fills.count = bars; this.bars.instanceMatrix.needsUpdate = this.fills.instanceMatrix.needsUpdate = true; if (this.fills.instanceColor) this.fills.instanceColor.needsUpdate = true;
  }
  dispose() { this.bars.dispose(); this.fills.dispose(); }
}

// ---------------------------------------------------------------- raiders, instanced per creature kind
type EnemyModelFn = (type: string) => T.Object3D | null;
interface KindDraw { parts: Array<{ mesh: T.InstancedMesh; local: T.Matrix4 }>; height: number }
const PROPS = ['rs_scarf', 'rs_helmet', 'rs_banner'] as const;
export class EnemyViews {
  readonly root = new T.Group();
  private kinds = new Map<string, KindDraw>();
  private props: Array<T.InstancedMesh[]> = [];
  private blobs: T.InstancedMesh;
  private m = new T.Matrix4(); private m2 = new T.Matrix4(); private q = new T.Quaternion(); private v = new T.Vector3(); private s = new T.Vector3(); private c = new T.Color(); private up = new T.Vector3(0, 1, 0);
  private tint: T.Color; private cap: number; private roll = new T.Quaternion(); private z = new T.Vector3(0, 0, 1); private icy = new T.Color('#bfe9ff'); private t2 = new T.Matrix4();
  constructor(mission: MissionId, makeModel: EnemyModelFn, cap = RESCUE.maxLive + 8) {
    this.root.name = 'rescue-raiders'; this.cap = cap; this.tint = new T.Color(MISSIONS[mission].tint);
    const kinds = new Set(Object.values(MISSIONS[mission].kinds));
    for (const kind of kinds) this.kinds.set(kind, this.makeKind(kind, makeModel));
    // Variant props (kit pieces) — added once the kit has arrived.
    if (rescueKit.ready) for (const name of PROPS) { const src = kit(name); const list: T.InstancedMesh[] = []; src?.updateMatrixWorld(true); src?.traverse(o => { if (o instanceof T.Mesh) { const im = new T.InstancedMesh(o.geometry, o.material, cap); im.userData.local = o.matrixWorld.clone(); im.count = 0; im.frustumCulled = false; this.root.add(im); list.push(im); } }); this.props.push(list); }
    this.blobs = new T.InstancedMesh(new T.CircleGeometry(.6, 14).rotateX(-Math.PI / 2), basic('#000000', .2), cap); this.blobs.renderOrder = 2;
    this.blobs.frustumCulled = false; this.blobs.count = 0; this.root.add(this.blobs);
  }
  private makeKind(kind: string, makeModel: EnemyModelFn): KindDraw {
    const model = makeModel(kind) ?? (() => { const g = new T.Group(); g.add(mesh(new T.IcosahedronGeometry(.6, 1), ENEMY_TYPES[kind]?.color ?? '#c0392b', 0, .65, 0)); return g; })();
    model.position.set(0, 0, 0); model.rotation.set(0, 0, 0); model.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(model), parts: KindDraw['parts'] = [];
    model.traverse(o => {
      if (!(o instanceof T.Mesh) || o.userData.outline || !o.visible) return;
      const material = Array.isArray(o.material) ? o.material[0] : o.material;
      const im = new T.InstancedMesh(o.geometry, material, this.cap); im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; im.raycast = () => {};
      im.setColorAt(0, this.c.set('#ffffff')); this.root.add(im); parts.push({ mesh: im, local: o.matrixWorld.clone() });
    });
    return { parts, height: Number.isFinite(box.max.y) ? box.max.y : 1.4 };
  }
  update(run: RsRun, time: number, faceCamera: T.Quaternion) {
    const counts = new Map<string, number>(); let blobs = 0; const propCounts = this.props.map(() => 0);
    for (const e of run.enemies) {
      if (e.hp <= 0) continue;
      const draw = this.kinds.get(e.kind); if (!draw) continue;
      const n = counts.get(e.kind) ?? 0; if (n >= this.cap) continue; counts.set(e.kind, n + 1);
      const moving = e.target === null && e.freeze <= 0 && e.stun <= 0, phase = e.id * 1.7;
      const bob = e.air ? 1.3 + Math.sin(time * 4 + phase) * .15 : moving ? Math.abs(Math.sin(time * 9 + phase)) * .12 : 0;
      const lean = moving ? Math.sin(time * 9 + phase) * .08 : e.target && e.target !== 'queue' ? Math.sin(time * 14 + phase) * .12 : 0;
      const squash = e.hit > 0 ? 1 - e.hit * .9 : 1, k = e.role === 'mini' ? .6 : 1;
      this.q.setFromAxisAngle(this.up, e.facing); this.q.multiply(this.roll.setFromAxisAngle(this.z, lean));
      this.m.compose(this.v.set(e.x, bob, e.z), this.q, this.s.set(k / Math.sqrt(squash), k * squash, k / Math.sqrt(squash)));
      // Colour: the raider tint, a white flash when hit, icy blue when frozen or slowed.
      this.c.copy(this.tint); if (e.freeze > 0) this.c.set('#9fe6ff'); else if (e.slowT > 0) this.c.lerp(this.icy, .45); if (e.hit > 0) this.c.setRGB(2.2, 2.2, 2.2);
      for (const p of draw.parts) { this.m2.multiplyMatrices(this.m, p.local); p.mesh.setMatrixAt(n, this.m2); p.mesh.setColorAt(n, this.c); }
      // Shadow blob
      this.m2.compose(this.v.set(e.x, .03, e.z), this.q.identity(), this.s.set(k * (e.boss ? 2.2 : 1), 1, k * (e.boss ? 2.2 : 1))); this.blobs.setMatrixAt(blobs++, this.m2);
      // A variant prop from wave 3 (scarf, then helmet, then banner); brutes and the boss always wear a helmet then.
      const pv = e.variant <= 0 ? -1 : e.boss || e.role === 'brute' ? 1 : e.variant - 1;
      if (pv >= 0 && this.props[pv]?.length) {
        const top = draw.height * k * squash + bob, size = Math.max(.5, Math.min(1.4, draw.height * .35)) * k;
        this.q.setFromAxisAngle(this.up, e.facing); this.m.compose(this.v.set(e.x, top - (pv === 1 ? .25 : pv === 0 ? .55 : .1) * size, e.z), this.q, this.s.set(size, size, size));
        for (const im of this.props[pv]) { this.m2.multiplyMatrices(this.m, im.userData.local as T.Matrix4); im.setMatrixAt(propCounts[pv], this.m2); }
        propCounts[pv]++;
      }
      // Health bars: the game's own over-head bars ride on the stand-in bodies (hud-combat.ts), like every creature's.
    }
    for (const [kind, draw] of this.kinds) { const n = counts.get(kind) ?? 0; for (const p of draw.parts) { p.mesh.count = n; p.mesh.instanceMatrix.needsUpdate = true; if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true; } }
    this.props.forEach((list, i) => { for (const im of list) { im.count = propCounts[i]; im.instanceMatrix.needsUpdate = true; } });
    this.blobs.count = blobs; this.blobs.instanceMatrix.needsUpdate = true;
  }
  /** Draw calls the raiders cost right now (kinds with live raiders × parts, plus props, blobs, bars). */
  get draws() { let n = 0; for (const d of this.kinds.values()) for (const p of d.parts) if (p.mesh.count) n++; for (const l of this.props) for (const im of l) if (im.count) n++; return n + (this.blobs.count ? 1 : 0); }
  dispose() { for (const d of this.kinds.values()) for (const p of d.parts) p.mesh.dispose(); for (const l of this.props) for (const im of l) im.dispose(); this.blobs.dispose(); }
}

// ---------------------------------------------------------------- shots and zaps (pooled)
const SHOT_LOOK: Record<string, { color: string; size: number; life: number; arc: number }> = {
  popcorn: { color: '#fff6c8', size: .16, life: .18, arc: .2 }, cannon: { color: '#2f3542', size: .26, life: .45, arc: 2.6 },
  enemy: { color: '#c86bff', size: .2, life: .4, arc: .8 }, squad: { color: '#7fd0ff', size: .14, life: .2, arc: .3 },
};
export class ShotViews {
  readonly root = new T.Group();
  private balls: Array<{ mesh: T.Mesh; from: T.Vector3; to: T.Vector3; t: number; life: number; arc: number }> = [];
  private zaps: Array<{ mesh: T.Mesh; t: number }> = [];
  private ball = new T.IcosahedronGeometry(1, 1); private zap = new T.BoxGeometry(1, 1, 1).translate(0, 0, .5);
  constructor() { this.root.name = 'rescue-shots'; }
  fire(from: Point, to: Point, style: string, y = .9) {
    if (style === 'tesla' || style === 'chain') {
      let z = this.zaps.find(v => v.t <= 0);
      if (!z) { z = { mesh: new T.Mesh(this.zap, basic('#9ff7ff')), t: 0 }; z.mesh.raycast = () => {}; this.root.add(z.mesh); this.zaps.push(z); }
      const a = new T.Vector3(from.x, style === 'tesla' ? 1.9 : y, from.z), b = new T.Vector3(to.x, y, to.z), len = a.distanceTo(b);
      z.mesh.position.copy(a); z.mesh.lookAt(b); z.mesh.scale.set(.09, .09, len); z.mesh.visible = true; z.t = .12; return;
    }
    const look = SHOT_LOOK[style] ?? SHOT_LOOK.squad;
    let s = this.balls.find(v => v.t >= 1);
    if (!s) { s = { mesh: new T.Mesh(this.ball, basic(look.color)), from: new T.Vector3(), to: new T.Vector3(), t: 1, life: .2, arc: 0 }; s.mesh.raycast = () => {}; this.root.add(s.mesh); this.balls.push(s); }
    s.mesh.material = basic(look.color); s.mesh.scale.setScalar(look.size); s.from.set(from.x, style === 'cannon' ? 1 : style === 'popcorn' ? 1.4 : 1.1, from.z); s.to.set(to.x, y, to.z); s.t = 0; s.life = look.life; s.arc = look.arc; s.mesh.visible = true;
  }
  update(dt: number) {
    for (const s of this.balls) { if (s.t >= 1) { s.mesh.visible = false; continue; } s.t = Math.min(1, s.t + dt / s.life); s.mesh.position.lerpVectors(s.from, s.to, s.t); s.mesh.position.y += Math.sin(s.t * Math.PI) * s.arc; }
    for (const z of this.zaps) { if (z.t <= 0) { z.mesh.visible = false; continue; } z.t -= dt; z.mesh.scale.x = z.mesh.scale.y = .05 + Math.random() * .08; }
  }
}
/** The local position of an enemy for effects (world conversion happens in the runtime). */
export const enemyAt = (e: RsEnemy) => ({ x: e.x, z: e.z });
export { DEFENCES };
