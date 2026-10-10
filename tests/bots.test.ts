import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { ITEMS } from '../src/content.ts';
import { BOT_LINES } from '../src/bot-lines.ts';
import { VI_BOTS } from '../src/locales/vi-bots.ts';
import { BOT_LINE_PAIRS } from '../src/locales/vi-bot-lines.ts';
import { CHAT_VI } from '../src/locales/vi-bot-chat.ts';
import { befriend, canMeet, chooseGift, choosePresent, givesPresent, isFriend, makeCast, newStore, parseStore, settleGift, SPARE_GIFTS, ENERGY_GIFT, PRESENT_GAP_MS } from '../src/bot-logic.ts';

test('the cast is the same for one seed, has a rich flyer, and dresses everyone from real items', () => {
  const a = makeCast(1234), b = makeCast(1234), c = makeCast(99);
  assert.deepEqual(a, b); assert.equal(a.length, 5); assert.notDeepEqual(a.map(x => x.name), c.map(x => x.name));
  assert.equal(a[0].tier, 'rich'); assert.equal(a[0].pets.length, 2); assert.notEqual(a[0].pets[0], a[0].pets[1]); assert.equal(new Set(a.map(x => x.name)).size, 5);
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) for (const bot of makeCast(seed)) {
    for (const id of [...Object.values(bot.gear), ...bot.gifts]) assert.ok(ITEMS[id], `${bot.name}: ${id}`);
    if (bot.flies) assert.equal(bot.tier, 'rich');
    assert.equal(bot.pets.length, bot.tier === 'rich' ? 2 : 0); for (const p of bot.pets) assert.ok(ITEMS[p]?.slot === 'pet', p);
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
  const bot = makeCast(7)[1], store = newStore(7); befriend(store, bot, 5, () => false); store.meetAfter['bot:3'] = 99;
  const back = parseStore(JSON.stringify(store), 1); assert.deepEqual(back, store);
  assert.equal(parseStore('{not json', 42).seed, 42); assert.equal(parseStore(null, 5).seed, 5);
  assert.ok(!canMeet(back, 'bot:3', 50) && canMeet(back, 'bot:3', 100));
  const weird = parseStore(JSON.stringify({ seed: 3, pending: { 'bot:1': { count: 1e9, energy: -5, item: 4 } }, given: [1, 'x'], friends: { a: 'no', b: 3 } }), 0);
  assert.deepEqual(weird.pending['bot:1'], { item: undefined, count: 99, energy: 0 }); assert.deepEqual(weird.given, ['x']); assert.deepEqual(weird.friends, { b: 3 });
});

test('every neighbour line has a Vietnamese version and each pool is big enough', () => {
  for (const [k, pool] of Object.entries(BOT_LINES)) { assert.ok(pool.length >= (k === 'FLYBY' || k === 'WANDER' || k === 'LATER' || k === 'WITHDRAW' ? 5 : 8), k); for (const en of pool) { assert.equal(VI_BOTS[en], BOT_LINE_PAIRS[en]); assert.ok(BOT_LINE_PAIRS[en]); assert.notEqual(BOT_LINE_PAIRS[en], en); } }
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

test('meeting a friend gives a present about one time in five, mostly everyday things and rarely a rare one', () => {
  const store = newStore(1), bot = makeCast(1)[0]; assert.ok(!givesPresent(store, bot.id, () => 0), 'strangers give none'); befriend(store, bot, 0, () => false);
  assert.ok(givesPresent(store, bot.id, () => .19) && !givesPresent(store, bot.id, () => .21));
  let n = 0, s0 = 3; const dice = () => (s0 = (s0 * 48271) % 2147483647) / 2147483647; for (let i = 0; i < 2000; i++) if (givesPresent(store, bot.id, dice)) n++;
  assert.ok(n > 300 && n < 500, `about one in five (${n}/2000)`);
  let rare = 0, state = 7; const rand = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 400; i++) { const p = choosePresent(newStore(1), () => false, rand); assert.ok(p.item ? ITEMS[p.item] : p.energy > 0); if (p.item && ITEMS[p.item].rare) rare++; }
  assert.ok(rare > 10 && rare < 90, `about one in ten is rare (${rare}/400)`);
});

test('each friend gives at most one present per five minutes, remembered across saves', () => {
  const store = newStore(1), [bot, other] = makeCast(2), t0 = 1_800_000_000_000; befriend(store, bot, 0, () => false); befriend(store, other, 0, () => false);
  assert.equal(PRESENT_GAP_MS, 5 * 60_000);
  assert.ok(givesPresent(store, bot.id, () => 0, t0)); store.daily[bot.id] = t0; // bots.ts records the handover
  assert.ok(!givesPresent(store, bot.id, () => 0, t0 + PRESENT_GAP_MS - 1), 'not again within five minutes');
  assert.ok(givesPresent(store, other.id, () => 0, t0 + 1), 'another friend is not held back');
  assert.ok(givesPresent(store, bot.id, () => 0, t0 + PRESENT_GAP_MS) && !givesPresent(store, bot.id, () => .21, t0 + PRESENT_GAP_MS), 'then the one-in-five chance again');
  assert.ok(!givesPresent(parseStore(JSON.stringify(store), 1), bot.id, () => 0, t0 + 1000), 'the last present time survives a reload');
  assert.ok(givesPresent(store, bot.id, () => 0, t0 - 60_000), 'a clock set back does not block presents forever');
});

test('the message box sorts English and Vietnamese messages and always answers in a pool with Vietnamese', async () => {
  const { intentOf, replyTo, CHAT_REPLIES, normalize } = await import('../src/bot-chat.ts');
  assert.equal(intentOf('Hello there!'), 'hello'); assert.equal(intentOf('Xin chào bạn'), 'hello'); assert.equal(intentOf('cảm ơn nha'), 'thanks');
  assert.equal(intentOf('Can I get a gift?'), 'gift'); assert.equal(intentOf('Tạm biệt'), 'bye'); assert.equal(intentOf('mình buồn quá'), 'sad');
  assert.equal(intentOf('tell me about your garden'), 'garden'); assert.equal(intentOf('what is that?'), 'question'); assert.equal(intentOf('blah'), 'other');
  assert.equal(normalize('Đẹp Quá!'), 'dep qua');
  for (const [k, pool] of Object.entries(CHAT_REPLIES)) { assert.ok(pool.length >= 2, k); for (const en of pool) { assert.ok(CHAT_VI[en], en); assert.notEqual(CHAT_VI[en], en); } }
  const bot = makeCast(1)[0], seen = new Set<string>(); let n = 7; const rand = () => (n = (n * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < 30; i++) seen.add(replyTo('haha funny', bot, true, { pick: (_k, pool) => pool[Math.floor(rand() * pool.length)], rand }));
  assert.ok(seen.size >= 3);
});

test('neighbours live beyond the gates, hunt the nearest ordinary enemy there, and walk through their own gate', async () => {
  const L = await import('../src/bot-logic.ts');
  for (const zone of L.ZONES) { assert.ok(Math.hypot(zone.gate.x, zone.gate.z) === L.SAFE_RADIUS); assert.ok(Math.hypot(zone.x, zone.z) - L.ZONE_RADIUS > L.SAFE_RADIUS, `${zone.id} hunting ground is outside the safe zone`); }
  assert.equal(new Set(makeCast(5).map(b => L.zoneOf(b).id)).size, 4, 'five neighbours spread over the four zones');
  const zone = L.ZONES[3], foes = [{ id: 'far', x: 38, z: 3, hp: 5 }, { id: 'near', x: 29, z: 2, hp: 5 }, { id: 'dead', x: 30, z: 0, hp: 0 }, { id: 'boss', x: 30, z: 1, hp: 9, boss: true }, { id: 'home', x: 10, z: 0, hp: 5 }];
  assert.equal(L.pickFoe(foes, { x: 31, z: 0 }, zone)?.id, 'near'); assert.equal(L.pickFoe(foes.slice(2), { x: 31, z: 0 }, zone), null, 'no bosses, no dead, nothing inside the safe zone');
  const [out, inside] = L.gateRoute(zone, true); assert.ok(Math.hypot(out.x, out.z) > L.SAFE_RADIUS && Math.hypot(inside.x, inside.z) < L.SAFE_RADIUS);
  const [a, b] = L.gateRoute(zone, false); assert.ok(Math.hypot(a.x, a.z) < L.SAFE_RADIUS && Math.hypot(b.x, b.z) > L.SAFE_RADIUS);
  assert.ok(L.attackDamage(40) < 40 && L.attackDamage(2) >= 4); const v = L.nextVisitIn(() => 0), w = L.nextVisitIn(() => .9999); assert.ok(v >= 360 && w < 720 && L.visitStay(() => .9999) < 40 && L.huntFor(() => 0) >= 120 && L.restFor(() => 0) >= 100);
});

test('a neighbour can pick a boss only when asked, dares it for a few seconds, then keeps away', async () => {
  const L = await import('../src/bot-logic.ts'), zone = L.ZONES[3];
  const foes = [{ id: 'imp', x: 29, z: 2, hp: 5 }, { id: 'king', x: 30, z: 1, hp: 900, boss: true }];
  assert.equal(L.pickFoe(foes, { x: 31, z: 0 }, zone)?.id, 'imp'); assert.equal(L.pickFoe(foes, { x: 31, z: 0 }, zone, 18, true)?.id, 'king');
  assert.ok(L.bossDare(() => 0) >= 5 && L.bossDare(() => .9999) < 10 && L.BOSS_SHY >= 120);
});

test('compound and everyday messages are sorted by the most specific intent', async () => {
  const { intentOf } = await import('../src/bot-chat.ts');
  assert.equal(intentOf('hi, how are you?'), 'how'); assert.equal(intentOf('hello, what is your name'), 'name'); assert.equal(intentOf('thanks for the gift'), 'gift');
  assert.equal(intentOf('we met yesterday'), 'other'); assert.equal(intentOf('trong nhà bạn có gì?'), 'question'); assert.equal(intentOf('representative'), 'other');
  assert.equal(intentOf('mình mệt quá'), 'sad'); assert.equal(intentOf('đưa mình cái mũ'), 'outfit'); assert.equal(intentOf('xin chào'), 'hello');
});

test('a fight keeps neighbours quiet: aggro, a hurt player, a hurt target, the boss bar, and 8 s after the last sign', async () => {
  const { FightWatch, FIGHT_MEMORY, fightPass, fightTarget, bubbleCovers } = await import('../src/bot-logic.ts');
  const w = new FightWatch(), calm = { playerHp: 100, px: 0, pz: 0, enemies: [] as { id: string; x: number; z: number; hp: number; maxHp: number; phase?: string }[] };
  assert.equal(w.update(0, calm), false);
  assert.equal(w.update(1, { ...calm, enemies: [{ id: 'a', x: 30, z: 0, hp: 9, maxHp: 9, phase: 'chase' }] }), false, 'a chase far away is not your fight');
  assert.equal(w.update(2, { ...calm, enemies: [{ id: 'a', x: 5, z: 0, hp: 9, maxHp: 9, phase: 'chase' }] }), true);
  assert.equal(w.update(2 + FIGHT_MEMORY - .1, calm), true); assert.equal(w.update(2 + FIGHT_MEMORY + .1, calm), false);
  assert.equal(w.update(20, { ...calm, playerHp: 90 }), true, 'losing health'); w.reset();
  assert.equal(w.update(40, { ...calm, bossBar: true }), true, 'boss bar'); w.reset();
  assert.equal(w.update(60, { ...calm, selectedId: 'b', enemies: [{ id: 'b', x: 10, z: 0, hp: 5, maxHp: 9, phase: 'idle' }] }), true, 'a hurt target you picked');
  let pass = 0; for (let i = 0; i < 1000; i++) if (fightPass(() => i / 1000)) pass++; assert.equal(pass, 250, 'one in four');
  assert.equal(fightTarget({ ...calm, enemies: [{ id: 'x', x: 9, z: 0, hp: 1, maxHp: 1, phase: 'chase' }, { id: 'y', x: 3, z: 0, hp: 1, maxHp: 1, phase: 'chase' }] })?.id, 'y');
  assert.equal(bubbleCovers(400, 300, 420, 280), true); assert.equal(bubbleCovers(400, 300, 700, 280), false); assert.equal(bubbleCovers(400, 300, NaN, NaN), false);
});
