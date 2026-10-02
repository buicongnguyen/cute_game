/**
 * STUB (w8-house) of w8-rescue's friend look (cute_game-notes/round2/FRIENDS-CONTRACT.md): the hero kit at
 * half the explorer's size in the friend's tint, wearing the given gear through the same kit pieces as the
 * explorer. The lead replaces this file with w8-rescue's real one; the house only calls buildFriend.
 */
import * as T from 'three';
import { heroKit, wearKit, weaponKit, petKit, weaponModelName, type KitLibrary } from './assets.ts';
import { ITEMS } from './content.ts';
import { addOutlines } from './outline.ts';
import { toonMaterial } from './toon.ts';
import { FRIENDS, type Friend, type FriendId } from './friends.ts';

/** HERO_SCALE (world.ts, 0.84) halved: friends stand half as tall as the explorer. */
const FRIEND_SCALE = .84 * .5;
const kitOf = (item: string): KitLibrary => ITEMS[item]?.slot === 'weapon' ? weaponKit : ITEMS[item]?.slot === 'pet' ? petKit : wearKit;
const tagOf = (item: string) => ITEMS[item]?.slot === 'weapon' ? 'hand-right' : ITEMS[item]?.slot === 'hat' ? 'head' : 'body';
function ball(color: string, r: number, x: number, y: number, z: number) { const m = new T.Mesh(new T.IcosahedronGeometry(r, 1), toonMaterial({ color })); m.position.set(x, y, z); m.castShadow = true; return m; }

/** Simple shapes when the hero kit is not in yet (and in Node tests). */
function simpleBody(tint: string, hair: string) {
  const c = new T.Group();
  c.add(ball('#f3d5af', .59, 0, 1.59, 0), ball(hair, .6, 0, 1.8, -.06), ball(tint, .42, 0, .85, 0));
  for (const side of [-1, 1]) {
    const arm = new T.Group(); arm.name = side < 0 ? 'arm-left' : 'arm-right'; arm.position.set(side * .37, 1.08, .02); arm.rotation.order = 'YXZ';
    arm.add(ball(tint, .13, 0, -.15, 0)); const hand = new T.Object3D(); hand.name = side < 0 ? 'hand-left' : 'hand-right'; hand.position.set(0, -.36, .05); arm.add(hand); c.add(arm);
    const leg = new T.Group(); leg.name = side < 0 ? 'leg-left' : 'leg-right'; leg.position.x = side * .18; leg.add(ball('#775f46', .17, 0, .16, .08)); c.add(leg);
  }
  const head = new T.Object3D(); head.name = 'head'; head.position.y = 1.6; c.add(head);
  return c;
}
/** A gear item on the friend: its kit pieces re-parented by tag (as World.wearKit), else a small token. */
function wear(body: T.Object3D, item: string) {
  const kit = kitOf(item);
  if (!kit.requested) void kit.load();
  const model = kit.ready && heroKit.ready ? kit.instance(weaponModelName(item)) : null;
  if (model && ITEMS[item]?.slot === 'pet') { model.position.set(-1, 0, -.6); model.userData.gear = item; body.add(model); return; }
  if (model) {
    body.updateMatrixWorld(true); const toBody = body.matrixWorld.clone().invert();
    for (const piece of [...model.children]) {
      const part = body.getObjectByName(piece.userData.tag ?? tagOf(item)) ?? body;
      piece.applyMatrix4(toBody.clone().multiply(part.matrixWorld).invert()); piece.userData.gear = item; part.add(piece);
    }
    return;
  }
  const slot = ITEMS[item]?.slot, token = slot === 'hat' ? ball('#ffd35c', .45, 0, 2.15, 0) : slot === 'boots' ? ball('#b88c73', .2, 0, .15, .15) : slot === 'weapon' ? ball('#d5dce1', .16, .5, .9, .3) : slot === 'pet' ? ball('#fff0d8', .35, -1, .4, -.6) : ball('#a17eaf', .5, 0, .9, 0);
  token.userData.gear = item; body.add(token);
}
export function buildFriend(id: FriendId, gear: Friend['gear']): T.Group {
  const look = FRIENDS[id], group = new T.Group(), body = heroKit.instance(look.tint) ?? simpleBody(look.tint, look.hair);
  group.name = `friend-${id}`; group.add(body);
  for (const item of Object.values(gear)) if (item && ITEMS[item]) wear(body, item);
  addOutlines(group, { merge: true });
  group.scale.setScalar(FRIEND_SCALE);
  return group;
}
