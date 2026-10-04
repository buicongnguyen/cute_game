import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as F from '../src/friends.ts';
import * as H from '../src/helper.ts';
import { cageCandidates, CAGE_GAP } from '../src/cage-spots.ts';

// Regression tests for the wave-9 review findings (economy and rules; server gates are in friends-authority.test.mjs).
const T0 = 1_000_000;
function home() {
  const s = M.newGame(); s.level = 30; s.energy = 100_000;
  s.friends = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: {}, home: true }, { id: 'clover', role: 'farm', rescuedAt: 2, gear: {}, home: true }];
  return s;
}

test('giveGear replaces what the helper wore without touching the bag', () => {
  const s = home(), f = F.friendOf(s, 'sprout')!; s.bag.hat_cowboy = 1; f.gear.hat = 'hat_straw';
  const bag = structuredClone(s.bag);
  assert.equal(F.giveGear(s, 'sprout', 'hat_cowboy'), true); assert.deepEqual(s.bag, bag); assert.equal(f.gear.hat, 'hat_cowboy');
});

test('feed crops are only cheap quick ones: radish, carrot, pumpkin, mint; never fruit trees or seed crops', () => {
  const feed = Object.keys(M.CROPS).filter(M.isFeedCrop).sort();
  assert.deepEqual(feed, ['carrot', 'mint', 'pumpkin', 'radish']);
  const s = home(); s.bag = { apple: 3, iceberry: 2, melon: 4 };
  assert.equal(M.feedCrop(s), null, 'no automatic feed from valuable crops');
  assert.equal(M.playerFeedCrop(s), null, 'the Feed buttons never default to a valuable crop (the player may still pick one)');
  s.bag.mint = 1; s.bag.radish = 1; assert.equal(M.feedCrop(s), 'radish');
});

test('auto-feed skips young animals and animals whose time saved is worth less than the crop', () => {
  const s = home(); s.farm.built = true; s.bag.carrot = 5; s.bag.pumpkin = 0;
  const pig = M.buyAnimal(s, 'pig', T0)!, chicken = M.buyAnimal(s, 'chicken', T0)!;
  assert.equal(M.autoFeedCrop(s, pig, T0), null, 'young');
  const adult = M.adultAt(pig);
  assert.equal(M.autoFeedCrop(s, pig, adult), 'carrot', 'truffle 80 x half a cycle = 40 >= carrot 9');
  assert.equal(M.autoFeedCrop(s, chicken, adult), null, 'egg 6 x half = 3 < carrot 9');
  s.bag = { pumpkin: 3 }; assert.equal(M.autoFeedCrop(s, pig, adult), 'pumpkin');
  // The player can still feed the chicken any crop by hand.
  assert.equal(M.feedAnimal(s, chicken.uid, adult, 'pumpkin'), 'pumpkin');
});

test('Clover feeds only when her toggle is on (off by default), and it survives a save', () => {
  const s = home(); s.farm.built = true; s.bag.carrot = 5; const pig = M.buyAnimal(s, 'pig', T0)!, now = M.adultAt(pig);
  assert.equal(F.friendOf(s, 'clover')!.autoFeed, undefined);
  assert.equal(F.nextFriendTask(s, 'clover', { x: 0, z: 0 }, now), null);
  F.setFriendAutoFeed(s, 'clover', true);
  assert.deepEqual(F.nextFriendTask(s, 'clover', { x: 0, z: 0 }, now), { kind: 'feed', uid: pig.uid });
  assert.equal(F.friendOf(M.parseSave(JSON.stringify(s))!, 'clover')!.autoFeed, true);
});

test('the robot and Sprout never pick a crop over 30 minutes on their own, and prefer energy per minute', () => {
  const s = home(); s.level = 30; s.bag = { seed_star: 5, seed_fire: 5, seed_ice: 5 };
  const pick = H.cheapestSeed(s)!;
  assert.ok(M.CROPS[pick].duration <= H.FALLBACK_MAX_MS, pick);
  for (const id of Object.keys(M.CROPS)) if (M.CROPS[id].duration > 30 * 60_000) assert.notEqual(pick, id);
  assert.equal(pick, 'goldcorn', 'goldcorn earns the most per minute among quick crops at level 30');
  // Sprout plants through the same fallback.
  const bed = s.plots.findIndex(p => !p.crop); assert.equal(H.seedFor(s, bed), pick);
  s.level = 1; assert.equal(H.cheapestSeed(s), 'carrot', 'carrot (9 per 100 s) beats radish (12 per 150 s)');
});

test('the garden robot catches up only on the home planet', () => {
  const s = home(); s.helper = { ...H.helperOf(s), owned: true, paused: false };
  s.plots[0].crop = 'carrot'; s.plots[0].plantedAt = T0 - 10 * 60_000;
  s.planet = 'ice'; assert.deepEqual(H.catchUp(s, T0), { harvested: [], planted: [] }); assert.equal(s.plots[0].crop, 'carrot');
  s.planet = 'home'; assert.deepEqual(H.catchUp(s, T0).harvested, ['carrot']);
});

test('cage spots: every candidate is CAGE_GAP from the boss, the first towards the village', () => {
  const spots = cageCandidates(100, 0);
  assert.equal(spots.length, 12);
  for (const p of spots) assert.ok(Math.abs(Math.hypot(p.x - 100, p.z) - CAGE_GAP) < 1e-9);
  assert.ok(Math.abs(spots[0].x - (100 - CAGE_GAP)) < 1e-9);
});
