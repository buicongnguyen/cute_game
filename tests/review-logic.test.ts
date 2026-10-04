// Code and logic review fixes (the round after "That action is not available."): each test fails on the code before it.
import { MIDDAY } from './support/midday-clock.mjs'; // Game.travel stamps its planet event with Date.now(): keep that at 12:00 UTC, early in a half hour
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import * as H from '../src/helper.ts';
import * as F from '../src/friends.ts';
import { applyGameAction } from '../src/actions.ts';
import { recordEvent, refreshProgress, startChallenge } from '../src/progression.ts';
import { indoorsKey, slotKey, PROFILE_SLOTS } from '../src/profiles.ts';

const T0 = MIDDAY + 60_000; // a working hour for every helper, early in a half hour
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}, now = T0) => applyGameAction(s, { type, payload }, { now, random: () => .5 });

test('a claimed bounty stays claimed after a planet round trip in the same half hour, and progress survives the trip', () => {
  const s = M.newGame('Ann'); s.level = 10; s.energy = 500; refreshProgress(s, T0);
  const b = s.progression.bounty!; assert.ok(b.key.startsWith('home:'));
  recordEvent(s, 'kill', 1, b.type, T0); // one of three before the trip
  assert.ok(act(s, 'launch')); assert.ok(act(s, 'travel', { id: 'toy' }, T0 + 30_000)); assert.ok(s.progression.bounty!.key.startsWith('toy:'));
  act(s, 'travel', { id: 'home' }, T0 + 60_000); refreshProgress(s, T0 + 60_000);
  assert.equal(s.progression.bounty!.key, b.key); assert.equal(s.progression.bounty!.progress, 1, 'partial progress kept');
  recordEvent(s, 'kill', b.target, b.type, T0 + 61_000);
  assert.equal(act(s, 'claimProgress', { kind: 'bounties', id: b.key }, T0 + 62_000), true);
  const energy = s.energy;
  assert.ok(act(s, 'launch', {}, T0 + 63_000)); act(s, 'travel', { id: 'toy' }, T0 + 64_000); act(s, 'travel', { id: 'home' }, T0 + 65_000); refreshProgress(s, T0 + 66_000);
  assert.equal(s.progression.bounty!.claimed, true, 'still claimed: no second reward');
  assert.throws(() => act(s, 'claimProgress', { kind: 'bounties', id: b.key }, T0 + 67_000), /already collected/);
  assert.equal(s.energy, energy - M.LAUNCH_COST); assert.equal(s.progression.totals.bounty, 1);
  const back = M.parseSave(JSON.stringify(s))!; assert.deepEqual(back.progression.bountyLog, s.progression.bountyLog, 'the log survives a save');
  refreshProgress(s, T0 + 31 * 60_000); assert.equal(s.progression.bounty!.claimed, false, 'the next half hour brings a new bounty');
  assert.equal(s.progression.bountyLog, undefined, 'old half hours are forgotten');
});

test("Sprout's and Pepper's harvests (and their catch-up) do not win the player's timed harvest challenge", () => {
  const s = M.newGame('Ann'); s.level = 5;
  for (let i = 0; i < 6; i++) { s.plots[i].crop = 'carrot'; s.plots[i].plantedAt = T0 - M.CROPS.carrot.duration - H.GROWN_HOLD_MS - 1000; }
  s.friends = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: {}, home: true }, { id: 'pepper', role: 'cook', rescuedAt: 1, gear: {}, home: true }];
  assert.equal(startChallenge(s, 'harvest', T0), true);
  for (let i = 0; i < 3; i++) assert.ok(F.friendWork(s, 'sprout', { kind: 'harvest', index: i }, T0));
  assert.ok(F.friendWork(s, 'pepper', { kind: 'harvest', index: 3 }, T0));
  F.friendsCatchUp(s, T0);
  assert.equal(s.progression.challenge!.progress, 0, 'helpers only');
  assert.ok(s.counters.harvests >= 4, 'their harvests still count as harvests');
  s.plots[5].crop = 'carrot'; s.plots[5].plantedAt = T0 - 1e8; act(s, 'harvest', { index: 5 });
  assert.equal(s.progression.challenge!.progress, 1, "the player's own harvest counts");
});

test('the robot\'s "same as before" memory keeps the beds\' current spots after a reload, not the oldest ones', () => {
  const s = M.newGame('Ann'); s.energy = 5000; s.level = 30; assert.equal(H.buyHelper(s), 'bought');
  for (let i = 0; i < 70; i++) s.helper!.last[`${50 + i}.00,${50 + i}.00`] = 'radish'; // long-gone spots from moved beds
  assert.ok(M.plant(s, 0, 'pumpkin', T0)); H.rememberPlantings(s);
  const key = H.bedKey(s, 0), back = M.parseSave(JSON.stringify(s))!;
  assert.equal(back.helper!.last[key], 'pumpkin'); assert.equal(Object.keys(back.helper!.last).length, 64);
  s.helper!.last = { [key]: 'carrot', '1.00,1.00': 'radish' }; H.rememberPlantings(s);
  assert.equal(Object.keys(s.helper!.last).at(-1), key, 'an updated bed moves to the newest end');
});

test('gear a friend got before borrowing (only copy) comes back to the bag once, so taking it off never destroys it', () => {
  const s = M.newGame('Ann'); s.friends = [{ id: 'pepper', role: 'cook', rescuedAt: 1, gear: { hat: 'hat_chef' }, home: true }];
  const back = M.parseSave(JSON.stringify(s))!;
  assert.equal(back.bag.hat_chef, 1, 'the old given copy is back in the bag'); assert.equal(back.friends![0].borrowed, true);
  assert.equal(act(back, 'takeFriendGear', { friend: 'pepper', slot: 'hat' }), true); assert.equal(back.bag.hat_chef, 1, 'taking it off keeps it');
  // Once migrated, nothing is handed out again: borrowing, then losing the bag's copy, then reloading gives no free copy.
  act(back, 'giveFriendGear', { friend: 'pepper', id: 'hat_chef' }); delete back.bag.hat_chef;
  assert.equal(M.parseSave(JSON.stringify(back))!.bag.hat_chef ?? 0, 0);
  const fresh = M.newGame(); F.welcomeStart(fresh, false); assert.equal(fresh.friends![0].borrowed, true, 'new friends follow the borrowing rule from the start');
});

test('each save profile has its own "resume indoors" flag', () => {
  const keys = Array.from({ length: PROFILE_SLOTS }, (_, i) => indoorsKey(i));
  assert.equal(new Set(keys).size, PROFILE_SLOTS); assert.equal(keys[0], 'zoo-garden-indoors', 'profile 1 keeps the old key');
  for (let i = 0; i < PROFILE_SLOTS; i++) assert.notEqual(indoorsKey(i), slotKey(i));
  const ui = readFileSync(new URL('../src/house-ui.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /INSIDE_KEY/); assert.match(ui, /localStorage\.getItem\(indoorsKey\(\)\)/);
});

test('Start fresh offers the welcome again at once', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /case 'reset':\{[^\n]*closeDialog\(\);if\(state\.welcome==='pending'\)welcomeDialog\(\);/);
  const s = M.newGame(); s.welcome = 'done'; act(s, 'reset'); assert.equal(s.welcome, 'pending');
});

test('a cook who is paused waits at her post, and one on her rest can be asked to work from the cottage', async () => {
  const crew = readFileSync(new URL('../src/friend-crew.ts', import.meta.url), 'utf8');
  assert.match(crew, /if \(f\.role === 'cook' && !f\.paused && resting\(f, now\)\)/, 'only the rest sends her indoors');
  const { dressHtml } = await import('../src/house-ui.ts');
  const s = M.newGame(); s.friends = [{ id: 'pepper', role: 'cook', rescuedAt: 1, gear: {}, home: true }];
  const real = Date.now;
  try {
    Date.now = () => Date.UTC(2026, 0, 6, 7, 30); // her rest hour
    const html = dressHtml(s, 'pepper'); assert.match(html, /data-action="friend-call"/); assert.match(html, /data-action="friend-pause"/);
    assert.doesNotMatch(dressHtml(s, 'pepper', { readOnly: true }), /friend-call/, 'a visitor gets no work buttons');
    Date.now = () => Date.UTC(2026, 0, 6, 12, 30);
    assert.doesNotMatch(dressHtml(s, 'pepper'), /friend-call/, 'at work: the outdoor panel has the buttons');
  } finally { Date.now = real; }
});

test('online: a fetch that never reaches the server says so in the game\'s words, not the browser\'s', () => {
  const online = readFileSync(new URL('../src/online.ts', import.meta.url), 'utf8');
  assert.match(online, /try\{response=await fetch\([^\n]*\);\}catch\{throw new Error\('Connection interrupted\. Please try again\.'\);\}/);
});

test('the "helpers stored" card waits while a panel is open instead of covering it', () => {
  const ui = readFileSync(new URL('../src/delivery-ui.ts', import.meta.url), 'utf8'), main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(ui, /if \(host\.covered\?\.\(\)\) \{ homeFor = 0;/); assert.match(main, /covered:\(\)=>!!modal\}/);
});
