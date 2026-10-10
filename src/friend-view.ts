import * as T from 'three';
import { mergeParts } from './avatar-merge.ts';
import { HERO_SCALE } from './world.ts';
import { FRIENDS, type Friend, type FriendId } from './friends-state.ts';
import { friendHeight, friendStage } from './growth.ts';
import { heroKitFor } from './assets.ts';
import { DEFAULT_LOOK, HEIGHT_RATIO, splitLook, toLook, type LookId } from './looks.ts';
import { friendLook, showsHead } from './friend-looks.ts';
import type { SaveState } from './model.ts';
import { applyGait, limbsOf, type Gait } from './walk-cycle.ts';

/**
 * A rescued friend's look (FRIENDS-CONTRACT.md "Look"): the explorer's own hero kit in the friend's own mirror look
 * (friend-looks.ts) at its growth stage's share of the explorer's height (growth.ts), with the friend's shirt and hair
 * colours, wearing its gear through the explorer's wear-kit path (World.friendAvatar ->
 * World.avatar -> wearKit/kitFor, registered with setFriendDresser so this module needs no World).
 *
 * Kept cheap: no shadow casting (a soft blob instead, shared geometry and material), the explorer's merged outlines,
 * and the hero kit's baked-colour parts; only the head geometry is copied, to recolour the baked hair.
 */
export const FRIEND_SCALE = HERO_SCALE * .5;
/** The root scale at a growth stage (growth.ts): 0.5, 0.75 or 0.8 of the explorer's height. */
export const friendScale = (stage = 0) => HERO_SCALE * friendHeight(stage);
type Dresser = (color: string, gear: SaveState['gear'], look: LookId) => T.Group;
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

/**
 * The friend's model: hero kit in its look (friend-looks.ts), tinted, dressed, at its growth stage's share of the
 * explorer's height; stands on y = 0, faces +z. A styled body file is taller or shorter than the chibi one (Grown-up is
 * 1.4x): its own height ratio is divided out, so the look sets the proportions and growth alone sets the height. The
 * ratio follows the body actually drawn: until a styled kit loads, the default explorer stands in at the plain scale.
 */
export function buildFriend(id: FriendId, gear: Friend['gear'] = {}, stage = 0, look: LookId = DEFAULT_LOOK): T.Group {
  const colours = FRIENDS[id], wear: SaveState['gear'] = { hat: gear.hat, outfit: gear.outfit, boots: gear.boots, weapon: gear.weapon, pet: gear.pet };
  const root = buildAvatar(colours.tint, colours.hair, wear, friendHeight(stage), look);
  root.name = 'friend-' + id; root.userData.stage = stage;
  return root;
}
/**
 * The same cheap merged avatar for anyone drawn like a friend: `height` is the share of the explorer's height, `hair`
 * recolours the baked hair (null keeps it), and `gear` may hold a disguise too (Rescue Call's squad, rescue.ts).
 */
export function buildAvatar(tint: string, hair: string | null, gear: SaveState['gear'], height: number, look: LookId = DEFAULT_LOOK): T.Group {
  const wear: SaveState['gear'] = { ...gear };
  for (const k of Object.keys(wear) as (keyof typeof wear)[]) if (!wear[k]) delete wear[k];
  const model = dresser ? dresser(tint, wear, look) : standIn(tint, hair ?? '#7C4527', wear);
  if (hair) recolourHair(model, hair); mergeParts(model);
  model.rotation.order = 'YXZ';
  model.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = false; o.receiveShadow = false; } });
  const ratio = HEIGHT_RATIO[splitLook(toLook(model.userData.look) ?? DEFAULT_LOOK).height];
  const pet = model.getObjectByName('remote-pet'); if (pet) pet.scale.setScalar(.7 * ratio / height); // a pet stays readable beside a small friend (1.4 at half size)
  const scale = HERO_SCALE * height / ratio, root = new T.Group(); root.scale.setScalar(scale); root.add(model);
  blobGeometry ??= new T.CircleGeometry(.36, 14); blobMaterial ??= new T.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: .2, depthWrite: false });
  blobGeometry.userData.sharedKit = true; blobMaterial.userData.sharedKit = true;
  const blob = new T.Mesh(blobGeometry, blobMaterial); blob.scale.setScalar(ratio / FRIEND_SCALE) /* grows with the friend: .36 m at half size */; blob.rotation.x = -Math.PI / 2; blob.position.y = .03 / scale; blob.name = 'friend-blob'; root.add(blob);
  root.userData.model = model; root.userData.look = toLook(model.userData.look) ?? DEFAULT_LOOK;
  return root;
}

/** Freed friends wear a work hat (display only, never saved) unless the player gave them a hat; prisoners have none. */
export const WORK_HATS: Record<FriendId, string> = { sprout: 'hat_straw', clover: 'hat_cowboy', pepper: 'hat_chef' };
/** What a freed friend wears: its gear, plus its work hat while nothing else is on its head (a hat would hide ears or a hood). */
export function friendWear(f: Pick<Friend, 'id' | 'gear' | 'look'>): Friend['gear'] {
  return f.gear.hat || showsHead(friendLook(f)) ? { ...f.gear } : { hat: WORK_HATS[f.id] as Friend['gear']['hat'], ...f.gear };
}
/**
 * A freed friend as drawn everywhere: outdoors at work (friend-crew.ts), in the cottage (house-view.ts), in its panel
 * and in a visitor's copy. One builder with the same gear, work hat, look and growth stage, so a friend stands at the
 * same share of the explorer's height indoors and out (before, the cottage left the work hat off: Pepper's chef's hat
 * alone made her 0.91 of the explorer outdoors and 0.80 inside). `look` previews a combination (the Looks tab).
 */
export const friendModel = (f: Friend, look = friendLook(f)) => buildFriend(f.id, friendWear({ ...f, look }), friendStage(f), look);
/** What friendModel depends on, for rebuild checks: gear, stage, look and whether the look's body file has arrived. */
export const friendSignature = (f: Friend, look = friendLook(f)) => JSON.stringify(f.gear) + friendStage(f) + look + (look === DEFAULT_LOOK || heroKitFor(look).ready ? 1 : 0);

export type FriendPose = 'idle' | 'walk' | 'sad' | 'harvest' | 'plant' | 'collect' | 'feed' | 'cook' | 'cheer';
/**
 * Small rigid poses on the hero's named parts (arm-left/right, leg-left/right, head) and a lean of the whole model.
 * `t` is the friend's clock in seconds. `gait` (walk-cycle.ts) swings the legs and arms over the pose while it walks and
 * fades out when it stops; `swing` is its amplitude (gaitSwing, by speed).
 */
export function poseFriend(root: T.Group, pose: FriendPose, t: number, gait?: Gait, swing = .6) {
  const model = root.userData.model as T.Object3D | undefined; if (!model) return;
  const parts = (root.userData.parts ??= ['arm-left', 'arm-right', 'leg-left', 'leg-right', 'head'].map(n => model.getObjectByName(n) ?? null)) as (T.Object3D | null)[];
  const [armL, armR, legL, legR, head] = parts;
  armL?.rotation.set(0, 0, -.3); armR?.rotation.set(0, 0, .3); legL?.rotation.set(0, 0, 0); legR?.rotation.set(0, 0, 0); head?.rotation.set(0, 0, 0);
  let lean = 0, lift = 0, roll = 0;
  switch (pose) {
    case 'walk': lean = .1 * (gait?.blend ?? 1); break; // the limbs are the gait's (below)
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
  const bob = gait ? applyGait(limbsOf(model), gait, swing) : 0;
  model.rotation.x = lean; model.rotation.z = roll; model.position.y = lift / (root.scale.x || FRIEND_SCALE) + bob; // the root carries the friend's scale
}
