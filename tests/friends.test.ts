import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as F from '../src/friends.ts';
import * as H from '../src/helper.ts';
import { enemyRoster } from '../src/enemy-roster.ts';
import { applyGameAction } from '../src/actions.ts';
import { followGoal, postFor } from '../src/friend-crew.ts';

const T0 = 1_000_000;
function game() { const s = M.newGame(); s.level = 30; s.energy = 100_000; return s; }
const ripe = (s: M.SaveState, i: number, crop: string) => { s.plots[i].crop = crop; s.plots[i].plantedAt = T0 - M.CROPS[crop].duration - 1 - 5 * 60_000; };
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}, now = T0) => applyGameAction(s, { type, payload }, { now, random: () => .5 });
function rescued(id: F.FriendId) {
  const s = game(); s.planet = F.CAGES[id].planet; M.grantDefeat(s, id === 'pepper' ? 'robot' : F.CAGES[id].boss, 1, true, () => .5, false);
  assert.equal(F.rescue(s, id, T0), true); s.planet = 'home'; assert.deepEqual(F.arriveHome(s, { x: 0, z: 5 }), [id]); return s;
}

test('the cages sit by the weakest and the strongest home boss, read from the boss table', () => {
  const bosses = enemyRoster('home').filter(e => e.boss && !e.titan).sort((a, b) => a.baseMaxHp - b.baseMaxHp);
  assert.equal(F.CAGES.sprout.boss, bosses[0].type); assert.equal(F.CAGES.clover.boss, bosses.at(-1)!.type);
  assert.ok(enemyRoster('toy').some(e => e.boss && e.type === F.CAGES.pepper.boss));
});

test('a cage opens only after its own boss falls, and a respawn never re-locks it', () => {
  const s = game();
  assert.equal(F.cageState(s, 'sprout'), 'locked'); assert.equal(F.cageState(s, 'clover'), 'locked'); assert.equal(F.cageState(s, 'pepper'), 'hidden');
  assert.equal(F.rescue(s, 'sprout', T0), false);
  M.grantDefeat(s, 'croc', 10, true, () => .5, false); M.grantDefeat(s, 'treant', 10, false, () => .5, false);
  assert.equal(F.cageState(s, 'sprout'), 'locked', 'another boss, or a non-boss kill, does not open it');
  M.grantDefeat(s, 'treant', 10, true, () => .5, false); assert.equal(F.cageState(s, 'sprout'), 'open'); assert.equal(F.cageState(s, 'clover'), 'locked');
  M.grantDefeat(s, 'treant', 10, true, () => .5, false); assert.deepEqual(s.bosses!.filter(b => b === 'home:treant').length, 1);
  assert.equal(F.cageState(M.parseSave(JSON.stringify(s))!, 'sprout'), 'open', 'kept in the save');
  assert.equal(F.rescue(s, 'sprout', T0), true); assert.equal(F.cageState(s, 'sprout'), 'rescued'); assert.equal(F.rescue(s, 'sprout', T0), false);
});

test("Pepper's cage appears on the toy planet once any boss away from home is beaten", () => {
  const s = game(); M.grantDefeat(s, 'bear', 1, true, () => .5, false); assert.equal(F.cageState(s, 'pepper'), 'hidden');
  s.planet = 'candy'; M.grantDefeat(s, 'cake', 1, true, () => .5, false); assert.equal(F.cageState(s, 'pepper'), 'open');
  assert.equal(F.rescue(s, 'pepper', T0), false, 'only from the toy planet'); s.planet = 'toy'; assert.equal(F.rescue(s, 'pepper', T0), true);
});

test('rescues persist; old saves and junk migrate to nobody rescued', () => {
  const s = rescued('sprout'), back = M.parseSave(JSON.stringify(s))!;
  assert.equal(F.friendsOf(back)[0].id, 'sprout'); assert.equal(F.friendsOf(back)[0].home, true);
  const old = JSON.parse(JSON.stringify(M.newGame())); delete old.friends; delete old.bosses;
  const parsed = M.parseSave(JSON.stringify(old))!; assert.deepEqual(F.friendsOf(parsed), []); assert.equal(F.cageState(parsed, 'clover'), 'locked');
  const junk = M.parseSave(JSON.stringify({ ...M.newGame(), friends: [{ id: 'sprout', gear: { hat: 'carrot', outfit: 'nope', armor: 'armor_chef' } }, { id: 'sprout' }, { id: 'boss' }, 7], bosses: ['home:bear', 5, '<x>'] }))!;
  assert.equal(junk.friends!.length, 1); assert.deepEqual(junk.friends![0].gear, {}); assert.equal(junk.friends![0].home, false); assert.deepEqual(junk.bosses, ['home:bear']);
});

test('a rescued friend follows until the explorer is home in the village, then goes to its post', () => {
  const s = game(); s.planet = 'toy'; s.bosses = ['toy:robot']; F.rescue(s, 'pepper', T0);
  assert.deepEqual(F.arriveHome(s, { x: 0, z: 0 }), [], 'not on another planet'); s.planet = 'home';
  assert.deepEqual(F.arriveHome(s, { x: 60, z: 0 }), [], 'not out in the wilds'); assert.equal(F.following(s).length, 1);
  const behind = followGoal({ x: 10, z: 0 }, 0, 0), dHero = Math.hypot(behind.x - 10, behind.z);
  assert.ok(dHero > 1 && dHero < 2.5 && behind.z < 0, 'trails behind the explorer, offset from the pet');
  assert.equal(F.nextFriendTask(s, 'pepper', { x: 0, z: 0 }, T0), null, 'no work while following');
  assert.deepEqual(F.arriveHome(s, { x: 3, z: 4 }), ['pepper']); assert.equal(F.following(s).length, 0);
  const post = postFor('pepper'); assert.ok(Math.hypot(post.x - 1, post.z - 10.5) < 3, 'the cook works by the kitchen');
});

test('Sprout gardens like the robot; with the robot both work and never double-harvest', () => {
  const s = rescued('sprout'); ripe(s, 0, 'carrot'); ripe(s, 1, 'carrot'); s.plots[2].crop = null;
  const t = F.nextFriendTask(s, 'sprout', M.bedPosition(s, 0), T0)!; assert.deepEqual(t, { kind: 'harvest', index: 0 });
  assert.deepEqual(F.nextFriendTask(s, 'sprout', M.bedPosition(s, 0), T0, 0), { kind: 'harvest', index: 1 }, 'skips the robot\'s bed');
  assert.equal(H.buyHelper(s), 'bought');
  assert.equal(H.helperHarvest(s, 0, T0), 'carrot');
  const bag = s.bag.carrot ?? 0; assert.equal(F.friendWork(s, 'sprout', { kind: 'harvest', index: 0 }, T0), null, 'the robot got there first'); assert.equal(s.bag.carrot ?? 0, bag);
  assert.ok(F.friendWork(s, 'sprout', { kind: 'harvest', index: 1 }, T0)); assert.equal(s.bag.carrot, bag + 1);
  assert.ok(F.friendWork(s, 'sprout', { kind: 'plant', index: 1 }, T0)); assert.ok(s.plots[1].crop);
  assert.equal(H.helperPlant(s, 1, T0), null, 'the robot cannot plant a planted bed');
  assert.equal(F.doneToday(F.friendOf(s, 'sprout')!, T0), 2);
  F.setFriendPaused(s, 'sprout', true); ripe(s, 3, 'carrot'); assert.equal(F.nextFriendTask(s, 'sprout', { x: 0, z: 0 }, T0), null);
  assert.equal(F.friendWork(s, 'sprout', { kind: 'harvest', index: 3 }, T0), null);
});

test('Clover collects products and feeds from crops, always leaving the player one', () => {
  const s = rescued('clover'); s.farm.built = true; const a = M.buyAnimal(s, 'pig', T0)!; const now = M.adultAt(a) + M.productDuration(a);
  assert.deepEqual(F.nextFriendTask(s, 'clover', { x: 0, z: 0 }, now), { kind: 'collect', uid: a.uid });
  const r = F.friendWork(s, 'clover', { kind: 'collect', uid: a.uid }, now)!; assert.ok(r.raw.truffle >= 1); assert.equal(s.bag.truffle, r.raw.truffle);
  assert.equal(F.friendWork(s, 'clover', { kind: 'harvest', index: 0 }, now), null, 'a farmer does not garden');
  s.bag.carrot = 1; assert.equal(F.nextFriendTask(s, 'clover', { x: 0, z: 0 }, now), null, 'keeps the last carrot');
  s.bag.carrot = 2; assert.equal(F.nextFriendTask(s, 'clover', { x: 0, z: 0 }, now), null, 'feeding is off by default');
  assert.equal(F.friendWork(s, 'clover', { kind: 'feed', uid: a.uid }, now), null);
  assert.equal(F.setFriendAutoFeed(s, 'clover', true), true); assert.equal(F.setFriendAutoFeed(s, 'sprout', true), false);
  assert.deepEqual(F.nextFriendTask(s, 'clover', { x: 0, z: 0 }, now), { kind: 'feed', uid: a.uid });
  assert.ok(F.friendWork(s, 'clover', { kind: 'feed', uid: a.uid }, now)); assert.equal(s.bag.carrot, 1);
});

test('Pepper cooks half of what she gathers, rounding down and carrying the odd one', () => {
  const s = rescued('pepper'), f = F.friendOf(s, 'pepper')!;
  s.bag.carrot = 5; assert.deepEqual(F.cookHalf(s, f, { carrot: 5 }), { cooked_carrot: 2 }); assert.equal(s.bag.carrot, 3); assert.equal(s.bag.cooked_carrot, 2);
  assert.deepEqual(f.carry, { carrot: 1 });
  s.bag.carrot += 1; assert.deepEqual(F.cookHalf(s, f, { carrot: 1 }), { cooked_carrot: 1 }, 'the carried one pairs up'); assert.deepEqual(f.carry, {});
  s.bag.carrot += 1; assert.deepEqual(F.cookHalf(s, f, { carrot: 1 }), {}, 'one alone rounds down to none');
  s.bag.egg = 4; assert.deepEqual(F.cookHalf(s, f, { egg: 4 }), { omelette: 1 }, 'eggs go to the pot, two make an omelette'); assert.equal(s.bag.egg, 2);
  s.bag.egg += 1; s.bag.milk = 2; assert.deepEqual(F.cookHalf(s, f, { egg: 1, milk: 2 }), {}, 'one milk in the pot, the odd egg carried');
  s.bag.milk += 2; assert.deepEqual(F.cookHalf(s, f, { milk: 2 }), { milkshake: 1 });
  const before = structuredClone(s.bag); assert.deepEqual(F.cookHalf(s, f, { wood: 4 }), {}, 'nothing uncookable'); assert.deepEqual(s.bag, before);
});

test('Pepper harvests only what the gardener left and never replants', () => {
  const s = rescued('pepper'); ripe(s, 0, 'carrot'); ripe(s, 1, 'carrot');
  const r = F.friendWork(s, 'pepper', { kind: 'harvest', index: 0 }, T0)!; assert.deepEqual(r.cooked, {}); assert.equal(r.raw.carrot, 1);
  const r2 = F.friendWork(s, 'pepper', { kind: 'harvest', index: 1 }, T0)!; assert.deepEqual(r2.cooked, { cooked_carrot: 1 }); assert.equal(r2.raw.carrot, 0);
  assert.equal(F.friendWork(s, 'pepper', { kind: 'plant', index: 0 }, T0), null);
  assert.equal(F.friendWork(s, 'pepper', { kind: 'harvest', index: 0 }, T0), null, 'nothing ripe left');
});

test('catch-up is one fair round: each bed and animal at most once, gardener first', () => {
  const s = rescued('sprout'); s.planet = 'toy'; s.bosses!.push('toy:robot'); F.rescue(s, 'pepper', T0); s.planet = 'home'; F.arriveHome(s, { x: 0, z: 0 });
  s.plots.forEach((_, i) => ripe(s, i, 'carrot'));
  const out = F.friendsCatchUp(s, T0 + 10 * 86_400_000);
  assert.equal(out.sprout!.jobs, s.plots.length * 2, 'harvest and replant each bed once'); assert.equal(out.pepper!.jobs, 0, 'nothing left for the cook');
  assert.equal(s.bag.carrot, s.plots.length);
  const again = F.friendsCatchUp(s, T0 + 10 * 86_400_000); assert.equal(again.sprout!.jobs, 0);
  const capped = rescued('sprout'); capped.plots.forEach((_, i) => ripe(capped, i, 'carrot')); assert.equal(F.friendsCatchUp(capped, T0, 3).sprout!.jobs, 3);
  const away = rescued('sprout'); away.plots.forEach((_, i) => ripe(away, i, 'carrot')); away.planet = 'ice'; assert.deepEqual(F.friendsCatchUp(away, T0), {});
});

test('helpers borrow gear: the bag keeps it, so every helper can wear the same piece', () => {
  const s = rescued('clover'); s.bag.hat_straw = 1; const hat = Object.keys(M.ITEMS).find(id => M.ITEMS[id].slot === 'hat')!; s.bag[hat] = 1;
  assert.equal(F.giveGear(s, 'clover', hat), true); assert.equal(s.bag[hat], 1); assert.equal(F.friendOf(s, 'clover')!.gear.hat, hat);
  assert.equal(F.giveGear(s, 'clover', 'carrot'), false); assert.equal(F.takeGear(s, 'clover', 'hat'), true); assert.equal(s.bag[hat], 1);
  s.gear.hat = hat; assert.equal(F.giveGear(s, 'clover', hat), true); assert.equal(s.gear.hat, hat, 'the explorer keeps wearing it'); F.takeGear(s, 'clover', 'hat');
  s.bag.armor_chef = 1; assert.equal(F.giveGear(s, 'clover', 'armor_chef'), true); assert.deepEqual(F.friendOf(s, 'clover')!.gear, { outfit: 'armor_chef' }, 'same slot keys as SaveState.gear');
  assert.deepEqual(M.parseSave(JSON.stringify(s))!.friends!.find(f => f.id === 'clover')!.gear, { outfit: 'armor_chef' });
});

test('the actions apply the same rules (online authority path)', () => {
  const s = game(); s.bosses = ['home:treant'];
  assert.throws(() => act(s, 'rescueFriend', { id: 'clover' })); act(s, 'rescueFriend', { id: 'sprout' });
  act(s, 'friendsArrive', { x: 0, z: 0 }); ripe(s, 0, 'carrot');
  assert.equal((act(s, 'friendWork', { id: 'sprout', kind: 'harvest', index: 0 }) as F.WorkResult).raw.carrot, 1);
  assert.throws(() => act(s, 'friendWork', { id: 'sprout', kind: 'harvest', uid: 0 }));
  act(s, 'setFriendPaused', { id: 'sprout', paused: true }); assert.equal(F.friendOf(s, 'sprout')!.paused, true);
});

test('every friend line has Vietnamese copy', async () => {
  const { VI_FRIENDS } = await import('../src/locales/vi-friends.ts');
  const { setLanguage } = await import('../src/i18n.ts');
  const UI = await import('../src/friend-ui.ts');
  const s = rescued('pepper'); setLanguage('vi');
  try {
    for (const key of Object.keys(VI_FRIENDS)) assert.ok(VI_FRIENDS[key] && VI_FRIENDS[key] !== key, key);
    assert.match(UI.friendStatus(s, 'pepper', T0), /nấu ăn/); assert.match(UI.friendPanel(s, 'pepper', T0), /Nghỉ một lát/);
    assert.match(UI.lockedHint('clover'), /Gấu Vua/); for (const [a, b] of Object.values(UI.RESCUE_LINES)) { assert.ok(VI_FRIENDS[a], a); assert.ok(VI_FRIENDS[b], b); }
  } finally { setLanguage('en'); }
});
