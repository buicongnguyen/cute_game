import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from './toon.ts';
import { HERO_SCALE } from './world.ts';
import { FRIENDS, type Friend, type FriendId } from './friends-state.ts';
import { friendHeight } from './growth.ts';
import type { SaveState } from './model.ts';

/**
 * A rescued friend's look (FRIENDS-CONTRACT.md "Look"): the explorer's own hero kit at half the explorer's size, with
 * the friend's shirt and hair colours, wearing its gear through the explorer's wear-kit path (World.friendAvatar ->
 * World.avatar -> wearKit/kitFor, registered with setFriendDresser so this module needs no World).
 *
 * Kept cheap: no shadow casting (a soft blob instead, shared geometry and material), the explorer's merged outlines,
 * and the hero kit's baked-colour parts; only the head geometry is copied, to recolour the baked hair.
 */
export const FRIEND_SCALE = HERO_SCALE * .5;
/** The root scale at a growth stage (growth.ts): 0.5, 0.75 or 0.8 of the explorer's height. */
export const friendScale = (stage = 0) => HERO_SCALE * friendHeight(stage);
type Dresser = (color: string, gear: SaveState['gear']) => T.Group;
let dresser: Dresser | null = null;
/** main.ts registers World.friendAvatar here once the world exists. */
export function setFriendDresser(fn: Dresser | null) { dresser = fn; }

const HAIR = new T.Color('#7C4527'); // hero_spec.py 'Hero hair' (baked into vertex colours by bakeModel)
const near = (r: number, g: number, b: number) => Math.abs(r - HAIR.r) + Math.abs(g - HAIR.g) + Math.abs(b - HAIR.b) < .03;
let blobGeometry: T.CircleGeometry | null = null, blobMaterial: T.MeshBasicMaterial | null = null;

function recolourHair(model: T.Object3D, hair: string) {
  const colour = new T.Color(hair);
  model.traverse(o => {
    if (!(o instanceof T.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      if (m.name === 'Hero hair' && 'color' in m) { (m as T.MeshToonMaterial).color.copy(colour); }
    const c = o.geometry.getAttribute('color') as T.BufferAttribute | undefined; if (!c) return;
    let hit = false; for (let i = 0; i < c.count && !hit; i++) hit = near(c.getX(i), c.getY(i), c.getZ(i));
    if (!hit) return;
    // The kit's geometry is shared with the explorer: recolour a copy (one head per friend).
    const g = o.geometry.clone(); g.userData = {}; const cc = g.getAttribute('color') as T.BufferAttribute;
    for (let i = 0; i < cc.count; i++) if (near(cc.getX(i), cc.getY(i), cc.getZ(i))) cc.setXYZ(i, colour.r, colour.g, colour.b);
    o.geometry = g;
  });
}
let merged: T.MeshToonMaterial | null = null;
/**
 * Merges each rigid part's meshes (skin, shirt, hair, the hat's pieces...) into one vertex-coloured mesh with one shared
 * toon material: a friend then costs one draw per part plus its merged outline, not three or four per part. Textured,
 * see-through or glowing pieces stay as they are.
 */
function mergeParts(model: T.Object3D) {
  const byParent = new Map<T.Object3D, T.Mesh[]>();
  model.traverse(o => {
    if (!(o instanceof T.Mesh) || o.userData.outline || o.userData.gear || !o.parent || Array.isArray(o.material) || o.parent.name === 'remote-pet' || o.parent.parent?.name === 'remote-pet') return;
    const m = o.material as T.MeshToonMaterial;
    if (m.map || m.transparent || (m.emissive && m.emissive.getHex() !== 0) || !m.color) return;
    const list = byParent.get(o.parent) ?? []; list.push(o); byParent.set(o.parent, list);
  });
  merged ??= toonMaterial({ vertexColors: true }); merged.userData.sharedKit = true;
  for (const [parent, list] of byParent) {
    if (list.length < 2) continue;
    const pieces = list.map(mesh => {
      const src = mesh.geometry, g = new T.BufferGeometry(); g.setAttribute('position', src.getAttribute('position').clone());
      const n = src.getAttribute('normal'); if (n) g.setAttribute('normal', n.clone());
      const col = src.getAttribute('color'); if (col) g.setAttribute('color', col.clone());
      if (src.index) g.setIndex(src.index.clone());
      const flat = g.index ? g.toNonIndexed() : g; if (flat !== g) g.dispose();
      mesh.updateMatrix(); flat.applyMatrix4(mesh.matrix); if (!n) flat.computeVertexNormals();
      const tint = (mesh.material as T.MeshToonMaterial).color, count = flat.getAttribute('position').count, old = flat.getAttribute('color') as T.BufferAttribute | undefined, colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) colors.set(old ? [old.getX(i) * tint.r, old.getY(i) * tint.g, old.getZ(i) * tint.b] : [tint.r, tint.g, tint.b], i * 3);
      flat.setAttribute('color', new T.BufferAttribute(colors, 3)); return flat;
    });
    const geometry = mergeGeometries(pieces, false); pieces.forEach(p => p.dispose()); if (!geometry) continue;
    for (const mesh of list) { mesh.removeFromParent(); if (!mesh.geometry.userData.sharedKit) mesh.geometry.dispose(); }
    const one = new T.Mesh(geometry, merged); one.name = parent.name + '-merged'; parent.add(one);
  }
}
/** A stand-in until the world registers its dresser (tests, or a friend shown before the world exists). */
function standIn(tint: string, hair: string, wear: SaveState['gear'] = {}) {
  const g = new T.Group(), m = (c: string) => new T.MeshToonMaterial({ color: c }), m0 = m('#ffffff');
  const body = new T.Mesh(new T.CylinderGeometry(.32, .42, .65, 8), m(tint)); body.position.y = .85; body.name = 'body';
  const head = new T.Mesh(new T.SphereGeometry(.59, 12, 8), m('#f3d5af')); head.position.y = 1.59; head.name = 'head';
  const top = new T.Mesh(new T.SphereGeometry(.6, 12, 6, 0, Math.PI * 2, 0, 1.2), m(hair)); top.position.y = 1.62; head.add(top); top.position.set(0, .03, -.03);
  g.add(body, head);
  // One small tagged marker per worn item, so tests (and a world-less build) can still see what a friend wears.
  Object.values(wear).forEach((id, i) => { const m = new T.Mesh(new T.BoxGeometry(.2, .2, .2), m0); m.position.set(-.3 + i * .15, 2.2, 0); m.userData.gear = id; g.add(m); });
  return g;
}

/** The friend's model: hero kit, tinted, dressed, at half the explorer's size; stands on y = 0, faces +z. */
export function buildFriend(id: FriendId, gear: Friend['gear'] = {}, stage = 0): T.Group {
  const look = FRIENDS[id], wear: SaveState['gear'] = { hat: gear.hat, outfit: gear.outfit, boots: gear.boots, weapon: gear.weapon, pet: gear.pet };
  for (const k of Object.keys(wear) as (keyof typeof wear)[]) if (!wear[k]) delete wear[k];
  const model = dresser ? dresser(look.tint, wear) : standIn(look.tint, look.hair, wear);
  recolourHair(model, look.hair); mergeParts(model);
  model.rotation.order = 'YXZ';
  model.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = false; o.receiveShadow = false; } });
  const pet = model.getObjectByName('remote-pet'); if (pet) pet.scale.setScalar(.7 / friendHeight(stage)); // a pet stays readable beside a small friend (1.4 at half size)
  const scale = friendScale(stage), root = new T.Group(); root.name = 'friend-' + id; root.scale.setScalar(scale); root.add(model); root.userData.stage = stage;
  blobGeometry ??= new T.CircleGeometry(.36, 14); blobMaterial ??= new T.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: .2, depthWrite: false });
  blobGeometry.userData.sharedKit = true; blobMaterial.userData.sharedKit = true;
  const blob = new T.Mesh(blobGeometry, blobMaterial); blob.scale.setScalar(1 / FRIEND_SCALE) /* grows with the friend: .36 m at half size */; blob.rotation.x = -Math.PI / 2; blob.position.y = .03 / scale; blob.name = 'friend-blob'; root.add(blob);
  root.userData.model = model;
  return root;
}

export type FriendPose = 'idle' | 'walk' | 'sad' | 'harvest' | 'plant' | 'collect' | 'feed' | 'cook' | 'cheer';
/**
 * Small rigid poses on the hero's named parts (arm-left/right, leg-left/right, head) and a lean of the whole model.
 * `t` is the friend's clock in seconds; `stride` its walk phase.
 */
export function poseFriend(root: T.Group, pose: FriendPose, t: number, stride = 0) {
  const model = root.userData.model as T.Object3D | undefined; if (!model) return;
  const parts = (root.userData.parts ??= ['arm-left', 'arm-right', 'leg-left', 'leg-right', 'head'].map(n => model.getObjectByName(n) ?? null)) as (T.Object3D | null)[];
  const [armL, armR, legL, legR, head] = parts, s = Math.sin(stride);
  armL?.rotation.set(0, 0, -.3); armR?.rotation.set(0, 0, .3); legL?.rotation.set(0, 0, 0); legR?.rotation.set(0, 0, 0); head?.rotation.set(0, 0, 0);
  let lean = 0, lift = 0, roll = 0;
  switch (pose) {
    case 'walk': armL?.rotation.set(-s * .8, 0, -.3); armR?.rotation.set(s * .8, 0, .3); legL?.rotation.set(s * .7, 0, 0); legR?.rotation.set(-s * .7, 0, 0); lift = Math.abs(Math.cos(stride)) * .05; lean = .1; break;
    case 'sad': // head hung, arms limp in front, a slow sway and a sigh every few seconds
      head?.rotation.set(.45 + Math.max(0, Math.sin(t * .9)) * .15, Math.sin(t * .4) * .25, 0); armL?.rotation.set(-.25, 0, -.08); armR?.rotation.set(-.25, 0, .08); roll = Math.sin(t * 1.1) * .05; lean = .08; break;
    case 'harvest': { const k = Math.sin(t * 9); lean = .35; head?.rotation.set(.3, 0, 0); armL?.rotation.set(-1.2 + k * .3, 0, -.15); armR?.rotation.set(-1.2 - k * .3, 0, .15); legL?.rotation.set(-.3, 0, 0); legR?.rotation.set(-.3, 0, 0); break; }
    case 'plant': lean = .25; head?.rotation.set(.35, 0, 0); armR?.rotation.set(-1 + Math.sin(t * 5) * .2, 0, .2); armL?.rotation.set(-.4, 0, -.3); break;
    case 'collect': lean = .3 + Math.sin(t * 4) * .08; armL?.rotation.set(-1.4, 0, -.1); armR?.rotation.set(-1.4, 0, .1); head?.rotation.set(.25, 0, 0); break;
    case 'feed': { const k = Math.max(0, Math.sin(t * 5)); armR?.rotation.set(-.6 - k * 1, 0, .25); armL?.rotation.set(-.5, 0, -.3); head?.rotation.set(.2, 0, 0); lean = .1; break; }
    case 'cook': // stirring the pot: the right arm circles, the left steadies it, the head bobs along
      armR?.rotation.set(-1.1 + Math.sin(t * 6) * .25, 0, .25 + Math.cos(t * 6) * .25); armL?.rotation.set(-.9, 0, -.2); head?.rotation.set(.2 + Math.sin(t * 3) * .06, Math.sin(t * 1.5) * .2, 0); lean = .12; break;
    case 'cheer': { const k = Math.abs(Math.sin(t * 8)); armL?.rotation.set(-2.6, 0, -.4); armR?.rotation.set(-2.6, 0, .4); lift = k * .12; break; }
    default: armL?.rotation.set(0, 0, -.3 - Math.sin(t * 2) * .05); armR?.rotation.set(0, 0, .3 + Math.sin(t * 2) * .05); head?.rotation.set(0, Math.sin(t * .6) * .3, 0); lift = Math.sin(t * 2.4) * .004;
  }
  model.rotation.x = lean; model.rotation.z = roll; model.position.y = lift / (root.scale.x || FRIEND_SCALE); // the root carries the friend's scale
}
