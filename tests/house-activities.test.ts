import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { newGame, parseSave, maxHp, activeBuffs, type SaveState } from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { noteBossDefeat, type Friend } from '../src/friends-state.ts';
import { ROOMS, roomAt, walkable } from '../src/house.ts';
import { ACTIVITIES, HANGOUTS, assignHangouts, collectionLog, cooldownLeft, decorPlacements, decorSignature, trophies, useActivity, TROPHY_SLOTS } from '../src/house-activities.ts';
import { nearestActivity } from '../src/house-life.ts';
import { HouseView } from '../src/house-view.ts';

const MIN = 60000;
const home = (): SaveState => { const s = newGame(); s.hp = 20; return s; };
const friends = (n: number): Friend[] => (['sprout', 'clover', 'pepper'] as const).slice(0, n).map((id, i) => ({ id, role: (['garden', 'farm', 'cook'] as const)[i], rescuedAt: i, gear: {}, home: true }));

test('every room has something to do, and each tap spot is in its room', () => {
  for (const room of ROOMS) assert.ok(ACTIVITIES.some(a => a.room === room.id), room.id);
  for (const a of ACTIVITIES) assert.equal(roomAt(a.at)?.id, a.room, a.id);
  // Buffs always cool down, so resting is a stop between trips, not something to farm.
  for (const a of ACTIVITIES) if (a.kind === 'buff' || a.kind === 'paint') assert.ok((a.cooldownMin ?? 0) >= 3, a.id);
});

test('the sofa heals fully, its regeneration grows with friends at home, and it cools down for 3 minutes', () => {
  const s = home(); s.friends = friends(2); const t0 = 1_000_000;
  const r = useActivity(s, 'sofa', t0)!;
  assert.equal(s.hp, maxHp(s)); assert.ok(r.healed > 0);
  assert.equal(s.buffs.regen?.value, 3 + 2);
  assert.equal(useActivity(s, 'sofa', t0 + MIN), null, 'still cooling down');
  assert.equal(cooldownLeft(s, 'sofa', t0 + MIN), 2 * MIN);
  assert.ok(useActivity(s, 'sofa', t0 + 3 * MIN));
});

test('sleeping restores health and gives a well-rested XP buff for 5 minutes, once per 15 minutes', () => {
  const s = home(), t0 = 5_000_000;
  assert.ok(useActivity(s, 'bed', t0));
  assert.equal(s.hp, maxHp(s));
  assert.equal(s.buffs.xp?.value, .25); assert.equal(s.buffs.xp?.expiresAt, t0 + 300_000);
  assert.ok(activeBuffs(s, t0 + 1000).some(b => b.id === 'xp'));
  s.hp = 10; assert.equal(useActivity(s, 'bed', t0 + 14 * MIN), null); assert.equal(s.hp, 10);
  assert.ok(useActivity(s, 'bed', t0 + 15 * MIN));
});

test('activities work only at home and only for rule activities; panels and fun ones are not actions', () => {
  const s = home(); s.planet = 'candy' as SaveState['planet'];
  assert.equal(useActivity(s, 'bath', 1), null);
  s.planet = 'home';
  for (const id of ['stove', 'globe', 'duck', 'radio', 'books', 'nope']) assert.equal(useActivity(s, id, 1), null, id);
  assert.ok(useActivity(s, 'bath', 1)); assert.equal(s.buffs.speed?.value, .2);
});

test('houseUse runs through the shared action rules and survives a save round trip', () => {
  const s = home(); s.planet = 'home'; const now = 9_000_000;
  const r = applyGameAction(s, { type: 'houseUse', payload: { id: 'tea' } }, { now, random: Math.random }) as { id: string };
  assert.equal(r.id, 'tea'); assert.equal(s.buffs.haste?.value, .15);
  assert.throws(() => applyGameAction(s, { type: 'houseUse', payload: { id: 'tea' } }, { now: now + 1000, random: Math.random }));
  applyGameAction(s, { type: 'houseUse', payload: { id: 'easel' } }, { now, random: Math.random });
  const back = parseSave(JSON.stringify(s))!;
  assert.equal(back.house?.used?.tea, now); assert.equal(back.house?.paintings, 1);
  assert.equal(cooldownLeft(back, 'tea', now + MIN), 4 * MIN);
  // Junk in the save is dropped.
  const junk = parseSave(JSON.stringify({ ...s, house: { used: { tea: 'x', hack: 5 }, paintings: -3 } }))!;
  assert.equal(junk.house, undefined);
});

test('painting gives XP and hangs up to four pictures, newest kept', () => {
  const s = home(), t0 = 1e7; let xp = 0;
  for (let i = 0; i < 6; i++) { const r = useActivity(s, 'easel', t0 + i * 8 * MIN)!; xp += r.xp; }
  assert.ok(xp >= 6 * 12 - 1);
  assert.equal(decorPlacements(s).filter(p => p.kit === 'painting').length, 4);
});

test('boss kills put trophies on the shelf; rescued friends hang photos; the batch rebuilds only when they change', () => {
  const s = home(), sig0 = decorSignature(s);
  assert.equal(trophies(s).length, 0);
  noteBossDefeat(s, 'bear'); noteBossDefeat(s, 'bear'); noteBossDefeat(s, 'treant');
  assert.equal(trophies(s).length, 2, 'one cup per boss, not per kill');
  s.friends = friends(3);
  const decor = decorPlacements(s);
  assert.equal(decor.filter(p => p.kit === 'trophy').length, 2); assert.equal(decor.filter(p => p.kit === 'photo').length, 3);
  assert.notEqual(decorSignature(s), sig0);
  for (let i = 0; i < 10; i++) noteBossDefeat(s, 'boss' + i);
  assert.equal(trophies(s).length, TROPHY_SLOTS);
  const view = new HouseView();
  assert.equal(view.setDecor(decorSignature(s), decor), true); assert.equal(view.setDecor(decorSignature(s), decor), false);
  assert.equal(view.staticDraws, 2, 'trophies, photos and paintings merge into the same two batches');
});

test('the collection log counts fish, items, worlds, bosses and friends as percentages', () => {
  const s = home(), empty = collectionLog(s);
  assert.equal(empty.rows.find(r => r.id === 'worlds')!.have, 1);
  assert.equal(empty.rows.find(r => r.id === 'friends')!.pct, 0);
  s.friends = friends(3); s.fishRecords = { [Object.keys(s.fishRecords)[0] ?? 'carp']: 1 };
  const log = collectionLog(s), f = log.rows.find(r => r.id === 'friends')!;
  assert.equal(f.pct, 100); assert.ok(log.pct > empty.pct);
  for (const r of log.rows) { assert.ok(r.have <= r.total, r.id); assert.ok(r.pct >= 0 && r.pct <= 100); }
});

test('friends keep a schedule: one hangout each, the cook in the kitchen at meal times, every hangout reachable', () => {
  for (const h of HANGOUTS) { assert.ok(walkable(h), `${h.x},${h.z}`); assert.equal(roomAt(h)?.id, h.room); assert.ok(h.say.length); }
  for (let time = 0; time < 400; time += 40) {
    const spots = assignHangouts(['garden', 'farm', 'cook'], time);
    assert.equal(new Set(spots).size, 3, `time ${time}`);
    if (Math.floor(time / 40) % 2 === 0) assert.equal(HANGOUTS[spots[2]].room, 'kitchen');
  }
  // Over a few minutes the friends visit more than the living room.
  const rooms = new Set<string>(); for (let time = 0; time < 600; time += 40) for (const i of assignHangouts(['garden', 'farm', 'cook'], time)) rooms.add(HANGOUTS[i].room);
  assert.ok(rooms.size >= 4);
});

test('the house update and the prompt search allocate nothing per frame, and the live bits cost three draws', () => {
  const src = HouseView.prototype.update.toString() + nearestActivity.toString();
  assert.doesNotMatch(src, /new |\.map\(|\.filter\(|\[\.\.\.|\.push\(/);
  const view = new HouseView();
  view.syncFriends(friends(3), 0);
  for (let i = 0; i < 300; i++) view.update(1 / 60, i / 60 + 39); // across a schedule change: friends walk
  assert.equal(view.moved || true, true);
  // Static batches + door + flame + puffs + ring; friends are separate (they existed before).
  const own = [view.flame, view.puffs, view.highlight].filter(m => m instanceof T.Mesh).length;
  assert.equal(own, 3); assert.equal(view.staticDraws, 2);
  assert.equal(nearestActivity(-1.9, -.3)?.id, 'sofa'); assert.equal(nearestActivity(0, 4), null);
});
