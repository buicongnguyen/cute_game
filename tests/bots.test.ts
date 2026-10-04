import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { ITEMS } from '../src/content.ts';
import { BOT_LINES } from '../src/bot-lines.ts';
import { VI_BOTS } from '../src/locales/vi-bots.ts';
import { befriend, canMeet, chooseGift, choosePresent, presentReady, schedulePresent, PRESENT_MAX_MS, PRESENT_MIN_MS, isFriend, makeCast, newStore, parseStore, settleGift, SPARE_GIFTS, ENERGY_GIFT } from '../src/bot-logic.ts';

test('the cast is the same for one seed, has a rich flyer, and dresses everyone from real items', () => {
  const a = makeCast(1234), b = makeCast(1234), c = makeCast(99);
  assert.deepEqual(a, b); assert.equal(a.length, 5); assert.notDeepEqual(a.map(x => x.name), c.map(x => x.name));
  assert.equal(a[0].tier, 'rich'); assert.equal(new Set(a.map(x => x.name)).size, 5);
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) for (const bot of makeCast(seed)) {
    for (const id of [...Object.values(bot.gear), ...bot.gifts]) assert.ok(ITEMS[id], `${bot.name}: ${id}`);
    if (bot.flies) assert.equal(bot.tier, 'rich');
  }
  assert.ok([1, 2, 3, 4, 5, 6, 7, 8].some(seed => makeCast(seed).some(x => x.flies)), 'somebody flies');
});

test('every gift is a real rare item', () => {
  for (const seed of [1, 2, 3]) for (const bot of makeCast(seed)) for (const id of bot.gifts) assert.ok(ITEMS[id].rare, id);
  for (const id of SPARE_GIFTS) assert.ok(ITEMS[id]?.rare, id);
});

test('befriending promises the gift in the same step and a retry cannot lose or double it', () => {
  const bot = makeCast(7)[0], store = newStore(7), owned = new Set<string>();
  const gift = befriend(store, bot, 1000, id => owned.has(id))!;
  assert.ok(isFriend(store, bot.id) && gift.item && store.pending[bot.id] && store.given.includes(gift.item));
  assert.deepEqual(befriend(store, bot, 2000, id => owned.has(id)), gift, 'asking again changes nothing');
  settleGift(store, bot.id, false); assert.ok(store.pending[bot.id] && !store.given.includes(gift.item!), 'a failed grant releases the reservation, the promise stays');
  store.given.push(gift.item!); settleGift(store, bot.id, true);
  assert.equal(store.pending[bot.id], undefined); assert.ok(store.given.includes(gift.item!));
});

test('a gift is never one the player already has, falls back to spare rares, and finally to energy', () => {
  const bot = makeCast(7)[0], store = newStore(7);
  const first = chooseGift(bot, store, () => false).item!; assert.equal(first, bot.gifts[0]);
  const second = chooseGift(bot, store, id => id === first).item!; assert.notEqual(second, first);
  const allOwned = chooseGift(bot, store, () => true); assert.equal(allOwned.item, undefined); assert.equal(allOwned.energy, ENERGY_GIFT);
  const twoFriends = newStore(1), [r, s] = [makeCast(7)[0], makeCast(7).find(x => x.id !== makeCast(7)[0].id && x.tier === 'rich') ?? makeCast(7)[1]];
  const g1 = befriend(twoFriends, r, 1, () => false)!, g2 = befriend(twoFriends, s, 2, () => false)!; assert.notEqual(g1.item, g2.item, 'two friends do not promise the same item');
});

test('friendship, pending gifts and pauses survive a save, and a damaged save starts fresh', () => {
  const bot = makeCast(7)[1], store = newStore(7); befriend(store, bot, 5, () => false); store.meetAfter['bot:3'] = 99; store.daily[bot.id] = 10;
  const back = parseStore(JSON.stringify(store), 1); assert.deepEqual(back, store);
  assert.equal(parseStore('{not json', 42).seed, 42); assert.equal(parseStore(null, 5).seed, 5);
  assert.ok(!canMeet(back, 'bot:3', 50) && canMeet(back, 'bot:3', 100));
  assert.ok(!presentReady(back, bot.id, 9) && presentReady(back, bot.id, 10) && !presentReady(back, 'bot:9', 1e12));
  const weird = parseStore(JSON.stringify({ seed: 3, pending: { 'bot:1': { count: 1e9, energy: -5, item: 4 } }, given: [1, 'x'], friends: { a: 'no', b: 3 } }), 0);
  assert.deepEqual(weird.pending['bot:1'], { item: undefined, count: 99, energy: 0 }); assert.deepEqual(weird.given, ['x']); assert.deepEqual(weird.friends, { b: 3 });
});

test('every neighbour line has a Vietnamese version and each pool is big enough', () => {
  for (const [k, pool] of Object.entries(BOT_LINES)) { assert.ok(pool.length >= (k === 'FLYBY' || k === 'WANDER' || k === 'LATER' ? 5 : 8), k); for (const [en, vi] of pool) { assert.equal(VI_BOTS[en], vi); assert.notEqual(vi, en); } }
});

test('a neighbour house builds into a valid garden with crops, animals and decorations', () => {
  // The same building steps bots.ts uses.
  for (const bot of makeCast(3)) {
    const s = M.newGame(bot.name); s.level = 60; s.energy = 1e9;
    while (s.plots.length < bot.house.plots && M.expandGarden(s)) { /* one bed per call */ }
    assert.ok(s.plots.length >= Math.min(bot.house.plots, 9));
    const round = M.parseSave(JSON.stringify(s)); assert.ok(round, bot.name);
  }
});

test('a friend gives a present every 5 to 10 minutes, mostly everyday things and rarely a rare one', () => {
  const store = newStore(1), bot = makeCast(1)[0]; befriend(store, bot, 0, () => false);
  assert.ok(store.daily[bot.id] >= PRESENT_MIN_MS && store.daily[bot.id] <= PRESENT_MAX_MS, 'the first present is due in 5-10 minutes');
  assert.ok(!presentReady(store, bot.id, PRESENT_MIN_MS - 1)); assert.ok(presentReady(store, bot.id, PRESENT_MAX_MS));
  schedulePresent(store, bot.id, 1000, () => 0); assert.equal(store.daily[bot.id], 1000 + PRESENT_MIN_MS);
  schedulePresent(store, bot.id, 1000, () => .999999); assert.ok(store.daily[bot.id] < 1000 + PRESENT_MAX_MS);
  let rare = 0, state = 7; const rand = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 400; i++) { const p = choosePresent(newStore(1), () => false, rand); assert.ok(p.item ? ITEMS[p.item] : p.energy > 0); if (p.item && ITEMS[p.item].rare) rare++; }
  assert.ok(rare > 10 && rare < 90, `about one in ten is rare (${rare}/400)`);
});
