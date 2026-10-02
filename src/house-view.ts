/**
 * Draws the cottage interior (plan in house.ts) in its own scene: floors, walls and every furniture piece
 * from the Blender house kit (art/blender/kit/build_house.py) merged into one vertex-coloured toon mesh, the
 * glowing parts (lamps, flames, window light) into one unlit mesh, plus the swinging front door and the
 * rescued friends. Before the kit arrives (and in Node tests) simple boxes stand in for the furniture.
 */
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KitLibrary, heroKit, wearKit, weaponKit, petKit, modelUrl } from './assets.ts';
import { toonMaterial } from './toon.ts';
import { FURNITURE, FRIEND_SPOTS, HOUSE, ROOMS, WALL, WALLS, roomAt, walkable, type Placement, type Point } from './house.ts';
import { findRoute } from './navigation.ts';
import { buildFriend } from './friend-view.ts';
import { dropTree } from './dispose-tree.ts';
import { friendStage } from './growth.ts';
import { FRIENDS, type Friend, type FriendId } from './friends.ts';
import { part } from './part-cache.ts';
import { HANGOUTS, SCHEDULE_SECONDS, assignHangouts, type DecorPlacement, type Hangout } from './house-activities.ts';

export const HOUSE_FILE = modelUrl('house.glb');
/** The interior kit, loaded the first time someone opens the cottage door. */
export const houseKit = new KitLibrary([HOUSE_FILE]);

const EXTERIOR = '#e9c39a', TRIM = '#a8683f', BASE = '#6e4330';
const color = new T.Color();
/** A non-indexed piece with only position, normal and a baked colour, ready to merge. */
function baked(geometry: T.BufferGeometry, hex: string | T.Color, matrix?: T.Matrix4) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (matrix) g.applyMatrix4(matrix);
  const c = typeof hex === 'string' ? color.set(hex) : hex, n = g.getAttribute('position').count, colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new T.BufferAttribute(colors, 3));
  return g;
}
function slab(w: number, h: number, d: number, x: number, y: number, z: number, hex: string) {
  const box = new T.BoxGeometry(w, h, d); box.translate(x, y, z); const g = baked(box, hex); box.dispose(); return g;
}
const placementMatrix = (p: Placement) => new T.Matrix4().compose(new T.Vector3(p.x, p.y ?? 0, p.z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), p.rot ?? 0), new T.Vector3().setScalar(p.scale ?? 1));
const glowing = (m: T.Material) => (m as T.MeshToonMaterial).emissive?.getHex() > 0 && ((m as T.MeshToonMaterial).emissiveIntensity ?? 0) > 0;

/** Floors (planks or tiles in two shades), walls coloured per room on each face, low walls capped. */
export function shellPieces(): T.BufferGeometry[] {
  const out: T.BufferGeometry[] = [], b = HOUSE.bounds;
  out.push(slab(b.x1 - b.x0 + .6, .5, b.z1 - b.z0 + .6, (b.x0 + b.x1) / 2, -.33, (b.z0 + b.z1) / 2, BASE));
  for (const room of ROOMS) {
    const r = room.rect, w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (room.pattern === 'planks') { const n = Math.round(d / .5); for (let i = 0; i < n; i++) out.push(slab(w, .08, d / n, (r.x0 + r.x1) / 2, -.04, r.z0 + (i + .5) * d / n, room.floor[i % 2])); }
    else { const nx = Math.round(w / .7), nz = Math.round(d / .7); for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) out.push(slab(w / nx, .08, d / nz, r.x0 + (i + .5) * w / nx, -.04, r.z0 + (j + .5) * d / nz, room.floor[(i + j) % 2])); }
  }
  const half = WALL.thick / 2;
  for (const wall of WALLS) {
    const cuts = [...wall.gaps].sort((a, b) => a[0] - b[0]), spans: Array<[number, number]> = [];
    let at = wall.from; for (const [a, b] of cuts) { if (a > at) spans.push([at, a]); at = Math.max(at, b); } if (at < wall.to) spans.push([at, wall.to]);
    for (const [a, b] of spans) {
      const mid = (a + b) / 2, len = b - a, h = wall.height;
      for (const side of [-1, 1]) {
        const probe = wall.axis === 'x' ? { x: mid, z: wall.at + side * .4 } : { x: wall.at + side * .4, z: mid }, hex = roomAt(probe)?.wall ?? EXTERIOR;
        out.push(wall.axis === 'x' ? slab(len, h, half, mid, h / 2, wall.at + side * half / 2, hex) : slab(half, h, len, wall.at + side * half / 2, h / 2, mid, hex));
        // A skirting board on each face.
        const skirt = new T.Color(hex).multiplyScalar(.78).getHexString();
        out.push(wall.axis === 'x' ? slab(len, .14, .03, mid, .07, wall.at + side * (half + .015), '#' + skirt) : slab(.03, .14, len, wall.at + side * (half + .015), .07, mid, '#' + skirt));
      }
      out.push(wall.axis === 'x' ? slab(len + .04, .08, WALL.thick + .08, mid, h + .04, wall.at, TRIM) : slab(WALL.thick + .08, .08, len + .04, wall.at, h + .04, mid, TRIM));
    }
  }
  return out;
}
/** Stand-in boxes for furniture before the kit arrives. */
function fallbackPiece(p: Placement): { plain: T.BufferGeometry[]; glow: T.BufferGeometry[] } {
  const m = placementMatrix(p), hues: Record<string, string> = { sofa: '#24b3b0', armchair: '#ffc23a', bed: '#f2668e', fireplace: '#cf5b3e', bookshelf: '#c77a3a', wardrobe: '#a98bff', fridge: '#6ccbff', bathtub: '#f2f8ff' };
  if (p.kit === 'window') { const g = new T.BoxGeometry(1.1, 1.1, .1); g.translate(0, 1.5, -.05); return { plain: [], glow: [baked(g, '#ffe7a0', m)] }; }
  if (!p.block) return { plain: [], glow: [] };
  const h = p.kit === 'wardrobe' || p.kit === 'bookshelf' || p.kit === 'fridge' ? 1.9 : p.kit === 'fireplace' ? 1.2 : .7, g = new T.BoxGeometry(p.block[0], h, p.block[1]); g.translate(0, h / 2, 0);
  return { plain: [baked(g, hues[p.kit] ?? '#e8a862', m)], glow: [] };
}

/** Which look kits have arrived: a friend is rebuilt when one lands (the hero, or a kit for its gear). */
const kitStamp = () => [heroKit, wearKit, weaponKit, petKit].map(k => k.ready ? 1 : 0).join('');
export interface FriendView { id: FriendId; group: T.Group; signature: string; spot: (typeof FRIEND_SPOTS)[number] | Hangout; seed: number; role: string; stage: number }
/** Steam puffs over the kettle and the stove's pot, bubbles over the bath: [x, y, z, rise, spread]. */
const PUFF_SOURCES: Array<[number, number, number, number, number]> = [[-9.5, 1.15, -.13, .7, .06], [-9.38, 1.12, 2.27, .8, .08], [-.75, .62, -6.4, .45, .55]];
const PUFFS_EACH = 5;

export class HouseView {
  scene = new T.Scene(); root = new T.Group(); hemi: T.HemisphereLight; sun: T.DirectionalLight;
  /** The front door's hinge (opens toward the room); kind 'door' entities use it. */
  door = new T.Group();
  friends = new Map<FriendId, FriendView>();
  /** Draw calls of the static interior (shell + furniture + glow), for the budget test and probes. */
  staticDraws = 0;
  doorOpen = 0; doorTarget = 0;
  private statics: T.Mesh[] = [];
  /** Save-driven pieces (trophies, photos, paintings) merged into the same batch; see setDecor. */
  // Built empty in the constructor, so the signature starts as an empty save's (house-activities.ts decorSignature):
  // with '' the first indoor frame rebuilt the whole interior for nothing.
  private decor: DecorPlacement[] = []; private decorSig = '0||0';
  /** Live bits, one draw each: the fire's flames, steam and bubbles, and the ring under the thing you can use. */
  flame: T.Mesh; puffs: T.InstancedMesh; highlight: T.Mesh;
  private readonly m4 = new T.Matrix4(); private readonly q = new T.Quaternion(); private readonly v = new T.Vector3(); private readonly sc = new T.Vector3();
  private hangouts: number[] = []; private roles: string[] = []; private schedulePhase = -1;
  /** The world clock the schedule runs on (set each update). */
  private clock = 0;
  /** Friends' hangouts changed this update (every SCHEDULE_SECONDS): the session then moves their tap circles. */
  moved = false;
  private kitBuilt = false;
  /**
   * Each friend's walk to its next hangout, round the walls and through the doorways (house.ts walkable): planned once
   * per move (every SCHEDULE_SECONDS), so friends no longer cross walls on a straight line between rooms.
   */
  private walks = new Map<FriendId, { to: FriendView['spot']; points: Point[]; next: number }>();
  private planWalk(v: FriendView) {
    const from = { x: v.group.position.x, z: v.group.position.z }, route = findRoute(from, v.spot, [], { walkable, gridSize: .5, bounds: 16, clearance: 0, maxIterations: 4000 });
    const walk = { to: v.spot, points: route.length ? route : [{ x: v.spot.x, z: v.spot.z }], next: 0 }; this.walks.set(v.id, walk); return walk;
  }
  constructor() {
    this.scene.background = new T.Color('#2a1d1a');
    this.hemi = new T.HemisphereLight('#fff3df', '#b07a52', 1.55);
    this.sun = new T.DirectionalLight('#ffe9c8', 1.7); this.sun.position.set(4, 14, 9); this.sun.target.position.set(0, 0, 0); this.sun.castShadow = true;
    const b = HOUSE.bounds, cam = this.sun.shadow.camera; Object.assign(cam, { left: -13, right: 13, top: 11, bottom: -11, near: 1, far: 40 }); cam.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(1024, 1024); this.sun.shadow.bias = -.0008; this.sun.shadow.normalBias = .03;
    void b;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.root);
    this.door.name = 'house-door'; this.root.add(this.door);
    const fire = new T.ConeGeometry(.16, .42, 6); fire.translate(0, .21, 0); const core = new T.ConeGeometry(.09, .28, 5); core.translate(0, .14, .02);
    const flames = mergeGeometries([baked(fire, '#ff8a2a'), baked(core, '#ffe36b')], false)!; fire.dispose(); core.dispose();
    this.flame = new T.Mesh(flames, new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); this.flame.name = 'house-flame'; this.flame.position.set(-4.42, .12, 1.7);
    const puff = new T.IcosahedronGeometry(.07, 0);
    this.puffs = new T.InstancedMesh(puff, new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), PUFF_SOURCES.length * PUFFS_EACH); this.puffs.name = 'house-puffs'; this.puffs.frustumCulled = false;
    const ring = new T.RingGeometry(.5, .62, 28); ring.rotateX(-Math.PI / 2);
    this.highlight = new T.Mesh(ring, new T.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: .85, depthWrite: false, toneMapped: false })); this.highlight.name = 'house-highlight'; this.highlight.visible = false; this.highlight.renderOrder = 2;
    // Hover (desktop): a warm glow over the thing under the mouse and a ring around its footprint, so you see what a click will use.
    this.hoverRing = new T.Mesh(ring, new T.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: .95, depthWrite: false, toneMapped: false })); this.hoverRing.name = 'house-hover-ring'; this.hoverRing.visible = false; this.hoverRing.renderOrder = 2;
    const glowBox = new T.BoxGeometry(1, 1, 1); glowBox.translate(0, .5, 0);
    this.hoverGlow = new T.Mesh(glowBox, new T.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: .22, depthWrite: false, toneMapped: false, blending: T.AdditiveBlending })); this.hoverGlow.name = 'house-hover-glow'; this.hoverGlow.visible = false; this.hoverGlow.renderOrder = 3;
    this.root.add(this.flame, this.puffs, this.highlight, this.hoverRing, this.hoverGlow);
    this.build();
  }
  hoverRing: T.Mesh; hoverGlow: T.Mesh;
  /** Lays a ring (ring geometry, mid radius .56) on the floor around a footprint; null hides it. */
  placeRing(ring: T.Mesh, b: { x0: number; x1: number; z0: number; z1: number } | null) {
    ring.visible = !!b; if (!b) return;
    const sx = Math.max(.5, (b.x1 - b.x0) / 2 + .32) / .56, sz = Math.max(.5, (b.z1 - b.z0) / 2 + .32) / .56;
    ring.position.set((b.x0 + b.x1) / 2, .03, (b.z0 + b.z1) / 2); ring.userData.base = [sx, sz]; ring.scale.set(sx, 1, sz);
  }
  private pulseRing(ring: T.Mesh, p: number) { if (!ring.visible) return; const base = ring.userData.base as number[] | undefined; ring.scale.set((base?.[0] ?? 1) * p, 1, (base?.[1] ?? 1) * p); }
  /** The hover glow and ring around a box (house-hotspots.ts), or off. */
  setHover(b: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } | null) {
    this.placeRing(this.hoverRing, b); this.hoverGlow.visible = !!b; if (!b) return;
    this.hoverGlow.position.set((b.x0 + b.x1) / 2, b.y0, (b.z0 + b.z1) / 2); this.hoverGlow.scale.set(b.x1 - b.x0 + .08, b.y1 - b.y0 + .06, b.z1 - b.z0 + .08);
  }
  /** (Re)builds the static interior; uses the kit once it has loaded. */
  build() {
    for (const mesh of this.statics) { this.root.remove(mesh); mesh.geometry.dispose(); (mesh.material as T.Material).dispose(); }
    this.statics = [];
    const kit = houseKit.ready ? houseKit : null, plain: T.BufferGeometry[] = shellPieces(), glow: T.BufferGeometry[] = [];
    for (const p of [...FURNITURE, ...this.decor] as Array<Placement & { tint?: string }>) {
      const parts = kit?.parts(p.kit);
      if (!parts) { const f = fallbackPiece(p); plain.push(...f.plain); glow.push(...f.glow); continue; }
      const m = placementMatrix(p);
      for (const part of parts) {
        const world = m.clone().multiply(part.matrix), mat = part.material as T.MeshToonMaterial;
        if (glowing(mat)) glow.push(baked(part.geometry, mat.emissive.clone().lerp(mat.color, .35), world));
        else plain.push(baked(part.geometry, p.tint && /canvas/.test(part.name) ? p.tint : mat.color, world));
      }
    }
    const solid = mergeGeometries(plain, false); plain.forEach(g => g.dispose());
    if (solid) { const mesh = new T.Mesh(solid, toonMaterial({ color: '#ffffff', vertexColors: true })); mesh.name = 'house-shell'; mesh.castShadow = mesh.receiveShadow = true; this.statics.push(mesh); }
    const lit = glow.length ? mergeGeometries(glow, false) : null; glow.forEach(g => g.dispose());
    if (lit) { const mesh = new T.Mesh(lit, new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); mesh.name = 'house-glow'; this.statics.push(mesh); }
    for (const mesh of this.statics) this.root.add(mesh);
    this.staticDraws = this.statics.length;
    this.buildDoor(kit);
    this.kitBuilt = !!kit;
  }
  /** Hangs the save's trophies, photos and paintings; rebuilds the batch only when they changed. */
  setDecor(signature: string, list: DecorPlacement[]) { if (signature === this.decorSig) return false; this.decorSig = signature; this.decor = list; this.build(); return true; }
  /** Loads the kit if needed; resolves true when a rebuild with it happened. */
  async refine() {
    if (this.kitBuilt) return false;
    await houseKit.load();
    if (!houseKit.ready || this.kitBuilt) return false;
    this.build(); return true;
  }
  private buildDoor(kit: KitLibrary | null) {
    for (const child of [...this.door.children]) { this.door.remove(child); (child as T.Mesh).geometry?.dispose(); ((child as T.Mesh).material as T.Material | undefined)?.dispose(); }
    // The hinge sits at the left post seen from inside; the panel's own hinge edge is its x = 0.
    this.door.position.set(.53, 0, HOUSE.bounds.z1);
    const parts = kit?.parts('door'), pieces = parts ? parts.map(part => baked(part.geometry, (part.material as T.MeshToonMaterial).color, part.matrix)) : [slab(1.06, 1.95, .08, .53, .975, 0, '#d8643c')];
    const geometry = mergeGeometries(pieces, false); pieces.forEach(g => g.dispose());
    if (!geometry) return;
    const panel = new T.Mesh(geometry, toonMaterial({ color: '#ffffff', vertexColors: true }));
    // Seen from inside, the panel is turned around: it hangs from x = +0.53 back to x = -0.53.
    panel.rotation.y = Math.PI; panel.castShadow = true; this.door.add(panel);
  }
  /** Friends in the big room, rebuilt only when someone arrives, leaves or changes clothes. */
  syncFriends(list: Friend[], time = this.clock) {
    list = list.filter(f => f.home); // only friends who reached home are in the house; followers are still out with the explorer
    const seen = new Set<FriendId>();
    assignHangouts(list.map(f => f.role), time, this.hangouts); this.schedulePhase = Math.floor(time / SCHEDULE_SECONDS);
    list.forEach((friend, index) => {
      const spot = HANGOUTS[this.hangouts[index]] ?? FRIEND_SPOTS[index % FRIEND_SPOTS.length], signature = JSON.stringify(friend.gear) + index + kitStamp() + friendStage(friend), known = this.friends.get(friend.id);
      seen.add(friend.id);
      if (known && known.signature === signature) { known.spot = spot; known.stage = friendStage(friend); return; }
      if (known) this.dropFriend(known);
      const group = buildFriend(friend.id, friend.gear, friendStage(friend)); group.userData.friendId = friend.id;
      // Friends are small and keep still: they skip the shadow pass (it would cost a draw per part).
      group.traverse(o => { o.castShadow = false; });
      group.position.set(spot.x, spot.y ?? 0, spot.z); group.rotation.y = spot.facing;
      this.root.add(group);
      this.friends.set(friend.id, { id: friend.id, group, signature, spot, seed: index * 1.7, role: friend.role, stage: friendStage(friend) });
    });
    for (const view of [...this.friends.values()]) if (!seen.has(view.id)) { this.dropFriend(view); this.friends.delete(view.id); }
  }
  private dropFriend(view: FriendView) { dropTree(view.group); }
  /** Rebuild every friend (a gear kit has loaded). */
  refreshFriends(list: Friend[]) { for (const view of this.friends.values()) view.signature = ''; this.syncFriends(list); }
  update(dt: number, time: number) {
    this.clock = time; this.moved = false;
    if (Math.floor(time / SCHEDULE_SECONDS) !== this.schedulePhase && this.friends.size) {
      this.schedulePhase = Math.floor(time / SCHEDULE_SECONDS); let i = 0;
      for (const v of this.friends.values()) this.roles[i++] = v.role;
      this.roles.length = i; i = 0; assignHangouts(this.roles, time, this.hangouts);
      for (const v of this.friends.values()) v.spot = HANGOUTS[this.hangouts[i++]];
      this.moved = true;
    }
    // Fire flicker, steam and bubbles: a few matrices a frame, no allocation.
    const f = 1 + Math.sin(time * 13) * .08 + Math.sin(time * 7.3) * .06; this.flame.scale.set(1 + Math.sin(time * 9) * .05, f, 1);
    let k = 0;
    for (const src of PUFF_SOURCES) {
      const x = src[0], y = src[1], z = src[2], rise = src[3], spread = src[4], bath = spread > .3;
      for (let i = 0; i < PUFFS_EACH; i++) {
        const life = (time * .45 + i / PUFFS_EACH + x * .13) % 1, a = i * 2.4 + x, w = bath ? 1 : life;
        this.v.set(x + Math.cos(a) * spread * w, y + life * rise, z + Math.sin(a) * spread * w * (bath ? .5 : 1));
        const r = Math.sin(life * Math.PI) * (bath ? 1.1 : .9); this.sc.set(r, r, r);
        this.puffs.setMatrixAt(k++, this.m4.compose(this.v, this.q, this.sc));
      }
    }
    this.puffs.instanceMatrix.needsUpdate = true;
    const pulse = 1 + Math.sin(time * 5) * .08; this.pulseRing(this.highlight, pulse); this.pulseRing(this.hoverRing, pulse);
    if (this.hoverGlow.visible) (this.hoverGlow.material as T.MeshBasicMaterial).opacity = .18 + Math.sin(time * 6) * .07;
    this.doorOpen += (this.doorTarget - this.doorOpen) * (1 - Math.exp(-dt * 10));
    this.door.rotation.y = -this.doorOpen * 1.7;
    for (const v of this.friends.values()) {
      const body = v.group.children[0], t = time + v.seed, g = v.group;
      let walk = this.walks.get(v.id); if (!walk || walk.to !== v.spot) walk = this.planWalk(v);
      // Waypoint by waypoint; the last one is the hangout itself.
      let goal = walk.points[Math.min(walk.next, walk.points.length - 1)], dx = goal.x - g.position.x, dz = goal.z - g.position.z, far = Math.hypot(dx, dz);
      while (far <= .05 && walk.next < walk.points.length - 1) { walk.next++; goal = walk.points[walk.next]; dx = goal.x - g.position.x; dz = goal.z - g.position.z; far = Math.hypot(dx, dz); }
      const arm = body && part(body, 'arm-right'), legL = body && part(body, 'leg-left'), legR = body && part(body, 'leg-right');
      // Walk to the next hangout with a little bounce and swinging legs (not the seated or raised-arm pose it left), then settle into its pose.
      if (far > .05) {
        const step = Math.min(far, dt * 1.6); g.position.x += dx / far * step; g.position.z += dz / far * step; g.position.y = 0; g.rotation.y = Math.atan2(dx, dz);
        if (body) { body.position.y = Math.abs(Math.sin(t * 9)) * .07; body.rotation.z = 0; body.rotation.x = 0; const swing = Math.sin(t * 9) * .5; if (legL) legL.rotation.x = swing; if (legR) legR.rotation.x = -swing; if (arm) armPose(arm, 'walk', t); }
        continue;
      }
      g.position.y = v.spot.y ?? 0;
      if (!body) continue;
      if (v.spot.pose !== 'sit') { if (legL) legL.rotation.x = 0; if (legR) legR.rotation.x = 0; body.rotation.z = 0; }
      body.rotation.x = v.spot.pose === 'read' ? .12 : 0;
      if (v.spot.pose === 'sit') { if (legL) legL.rotation.x = -1.35; if (legR) legR.rotation.x = -1.35; body.position.y = -.55 + Math.sin(t * 2) * .02; body.rotation.z = Math.sin(t * .7) * .04; }
      else body.position.y = Math.abs(Math.sin(t * 2.2)) * .05;
      if (arm) armPose(arm, v.spot.pose, t);
      if (v.spot.pose !== 'stand') v.group.rotation.y = v.spot.facing;
      if (v.spot.pose === 'stand') v.group.rotation.y = v.spot.facing + Math.sin(t * .4) * .35;
    }
  }
  /** Draw calls the interior costs on its own (static batches, door, friends' meshes), as a rough budget. */
  meshCount() { let n = 0; this.root.traverse(o => { if (o instanceof T.Mesh && o.visible) n++; }); return n; }
}
/**
 * The right arm tells what a friend is doing at each hangout (no props, no extra draws): stirring a pot, sipping tea,
 * painting strokes, holding a book (with a page flip now and then), stretching up, brushing teeth, waving.
 */
function armPose(arm: T.Object3D, pose: string, t: number) {
  let x = 0, z = .1 + Math.sin(t * 1.5) * .05;
  if (pose === 'wave') { x = -2.6; z = .4 + Math.sin(t * 7) * .45; }
  else if (pose === 'stir') { x = -1.1 + Math.sin(t * 5) * .18; z = .35 + Math.cos(t * 5) * .25; }
  else if (pose === 'sip') { const up = Math.max(0, Math.sin(t * .9) - .5) * 2; x = -1.2 - up * .9; z = .5 + up * .3; }
  else if (pose === 'paint') { x = -1.6 + Math.sin(t * 3) * .4; z = .2 + Math.sin(t * 1.3) * .15; }
  else if (pose === 'read') { x = -1.0; z = .45 + (Math.sin(t * .6) > .95 ? .4 : 0); }
  else if (pose === 'stretch') { x = -2.9 + Math.sin(t * .8) * .25; z = .2; }
  else if (pose === 'brush') { x = -1.9; z = .95 + Math.sin(t * 14) * .15; }
  arm.rotation.x = x; arm.rotation.z = z;
}
export function friendName(id: FriendId) { return FRIENDS[id]?.name ?? id; }
