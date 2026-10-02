/**
 * Draws the cottage interior (plan in house.ts) in its own scene: floors, walls and every furniture piece
 * from the Blender house kit (art/blender/kit/build_house.py) merged into one vertex-coloured toon mesh, the
 * glowing parts (lamps, flames, window light) into one unlit mesh, plus the swinging front door and the
 * rescued friends. Before the kit arrives (and in Node tests) simple boxes stand in for the furniture.
 */
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KitLibrary, heroKit, wearKit, weaponKit, petKit } from './assets.ts';
import { toonMaterial } from './toon.ts';
import { FURNITURE, FRIEND_SPOTS, HOUSE, ROOMS, WALL, WALLS, roomAt, type Placement } from './house.ts';
import { buildFriend } from './friend-view.ts';
import { friendStage } from './growth.ts';
import { FRIENDS, type Friend, type FriendId } from './friends.ts';

const assetBase = import.meta.env?.BASE_URL ?? '/';
export const HOUSE_FILE = `${assetBase}assets/models/house.glb`;
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
export interface FriendView { id: FriendId; group: T.Group; signature: string; spot: (typeof FRIEND_SPOTS)[number]; seed: number }

export class HouseView {
  scene = new T.Scene(); root = new T.Group(); hemi: T.HemisphereLight; sun: T.DirectionalLight;
  /** The front door's hinge (opens toward the room); kind 'door' entities use it. */
  door = new T.Group();
  friends = new Map<FriendId, FriendView>();
  /** Draw calls of the static interior (shell + furniture + glow), for the budget test and probes. */
  staticDraws = 0;
  doorOpen = 0; doorTarget = 0;
  private statics: T.Mesh[] = [];
  private kitBuilt = false;
  constructor() {
    this.scene.background = new T.Color('#2a1d1a');
    this.hemi = new T.HemisphereLight('#fff3df', '#b07a52', 1.55);
    this.sun = new T.DirectionalLight('#ffe9c8', 1.7); this.sun.position.set(4, 14, 9); this.sun.target.position.set(0, 0, 0); this.sun.castShadow = true;
    const b = HOUSE.bounds, cam = this.sun.shadow.camera; Object.assign(cam, { left: -13, right: 13, top: 11, bottom: -11, near: 1, far: 40 }); cam.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(1024, 1024); this.sun.shadow.bias = -.0008; this.sun.shadow.normalBias = .03;
    void b;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.root);
    this.door.name = 'house-door'; this.root.add(this.door);
    this.build();
  }
  /** (Re)builds the static interior; uses the kit once it has loaded. */
  build() {
    for (const mesh of this.statics) { this.root.remove(mesh); mesh.geometry.dispose(); }
    this.statics = [];
    const kit = houseKit.ready ? houseKit : null, plain: T.BufferGeometry[] = shellPieces(), glow: T.BufferGeometry[] = [];
    for (const p of FURNITURE) {
      const parts = kit?.parts(p.kit);
      if (!parts) { const f = fallbackPiece(p); plain.push(...f.plain); glow.push(...f.glow); continue; }
      const m = placementMatrix(p);
      for (const part of parts) {
        const world = m.clone().multiply(part.matrix), mat = part.material as T.MeshToonMaterial;
        if (glowing(mat)) glow.push(baked(part.geometry, mat.emissive.clone().lerp(mat.color, .35), world));
        else plain.push(baked(part.geometry, mat.color, world));
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
  /** Loads the kit if needed; resolves true when a rebuild with it happened. */
  async refine() {
    if (this.kitBuilt) return false;
    await houseKit.load();
    if (!houseKit.ready || this.kitBuilt) return false;
    this.build(); return true;
  }
  private buildDoor(kit: KitLibrary | null) {
    for (const child of [...this.door.children]) { this.door.remove(child); (child as T.Mesh).geometry?.dispose(); }
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
  syncFriends(list: Friend[]) {
    list = list.filter(f => f.home); // only friends who reached home stand in the big room; followers are still out with the explorer
    const seen = new Set<FriendId>();
    list.forEach((friend, index) => {
      const spot = FRIEND_SPOTS[index % FRIEND_SPOTS.length], signature = JSON.stringify(friend.gear) + index + kitStamp() + friendStage(friend), known = this.friends.get(friend.id);
      seen.add(friend.id);
      if (known && known.signature === signature) return;
      if (known) this.dropFriend(known);
      const group = buildFriend(friend.id, friend.gear, friendStage(friend)); group.userData.friendId = friend.id;
      // Friends are small and keep still: they skip the shadow pass (it would cost a draw per part).
      group.traverse(o => { o.castShadow = false; });
      group.position.set(spot.x, spot.y ?? 0, spot.z); group.rotation.y = spot.facing;
      this.root.add(group);
      this.friends.set(friend.id, { id: friend.id, group, signature, spot, seed: index * 1.7 });
    });
    for (const view of [...this.friends.values()]) if (!seen.has(view.id)) { this.dropFriend(view); this.friends.delete(view.id); }
  }
  private dropFriend(view: FriendView) { this.root.remove(view.group); }
  /** Rebuild every friend (a gear kit has loaded). */
  refreshFriends(list: Friend[]) { for (const view of this.friends.values()) view.signature = ''; this.syncFriends(list); }
  update(dt: number, time: number) {
    this.doorOpen += (this.doorTarget - this.doorOpen) * (1 - Math.exp(-dt * 10));
    this.door.rotation.y = -this.doorOpen * 1.7;
    for (const v of this.friends.values()) {
      const body = v.group.children[0], t = time + v.seed;
      if (!body) continue;
      const arm = body.getObjectByName('arm-right'), legL = body.getObjectByName('leg-left'), legR = body.getObjectByName('leg-right');
      if (v.spot.pose === 'sit') { if (legL) legL.rotation.x = -1.35; if (legR) legR.rotation.x = -1.35; body.position.y = -.55 + Math.sin(t * 2) * .02; body.rotation.z = Math.sin(t * .7) * .04; }
      else body.position.y = Math.abs(Math.sin(t * 2.2)) * .05;
      if (arm) { arm.rotation.x = v.spot.pose === 'wave' ? -2.6 : 0; arm.rotation.z = v.spot.pose === 'wave' ? .4 + Math.sin(t * 7) * .45 : .1 + Math.sin(t * 1.5) * .05; }
      if (v.spot.pose === 'stand') v.group.rotation.y = v.spot.facing + Math.sin(t * .4) * .35;
    }
  }
  /** Draw calls the interior costs on its own (static batches, door, friends' meshes), as a rough budget. */
  meshCount() { let n = 0; this.root.traverse(o => { if (o instanceof T.Mesh && o.visible) n++; }); return n; }
}
export function friendName(id: FriendId) { return FRIENDS[id]?.name ?? id; }
