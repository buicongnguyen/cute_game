import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import * as F from '../src/friends.ts';
import { applyGameAction } from '../src/actions.ts';
import * as X from '../src/tester.ts';
import { RECIPES } from '../src/content.ts';

test('the right code (any case, spaces trimmed) matches with SHA-256 and with the fallback hash; wrong codes do not', async () => {
  for (const code of ['buicongnguyen', '  BuiCongNguyen ']) { assert.equal(await X.codeMatches(code), true); assert.equal(await X.codeMatches(code, undefined), true, 'no crypto.subtle (plain http)'); }
  for (const code of ['', 'buicong', 'buicongnguyen1', 'x'.repeat(200)]) assert.equal(await X.codeMatches(code), false);
  assert.equal(X.fnv1a('buicongnguyen'), '45598318');
  assert.ok(!/buicongnguyen/i.test(readFileSync(new URL('../src/tester.ts', import.meta.url), 'utf8')), 'the plain code is not in the source');
});

test('code attempts are limited to 5 a minute', () => {
  const tryIt = X.attemptLimiter(); const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(tryIt(t0 + i), true);
  assert.equal(tryIt(t0 + 1000), false); assert.equal(tryIt(t0 + 59_999), false);
  assert.equal(tryIt(t0 + 60_000), true, 'the oldest try left the window');
});

test('unlocking sets energy to at least 1,000,000 and a tester flag that survives a save round trip', () => {
  const s = M.newGame(); s.energy = 50; X.unlockTester(s);
  assert.equal(s.energy, 1_000_000); assert.equal(X.isTester(s), true);
  const rich = M.newGame(); rich.energy = 2_000_000; X.unlockTester(rich); assert.equal(rich.energy, 2_000_000, 'never lowers energy');
  const back = M.parseSave(JSON.stringify(s)); assert.equal(back?.settings.tester, true);
  assert.equal(M.parseSave(JSON.stringify(M.newGame()))?.settings.tester, undefined);
});

test('gated items are buyable without materials or level only in tester mode, still for energy', () => {
  const gated = RECIPES.find(r => Object.keys(r.materials).length && r.station !== 'forge')!; assert.ok(gated);
  const s = M.newGame(); s.energy = 1_000_000;
  assert.equal(X.testerBuy(s, gated.result), false, 'a normal player cannot use the tester shop');
  assert.equal(M.buy(s, gated.result) || M.craft(s, RECIPES.indexOf(gated)), false, 'normal rules still ask for materials');
  X.unlockTester(s); const price = X.TESTER_ITEMS.find(i => i.id === gated.result)!.price;
  assert.equal(X.testerBuy(s, gated.result), true); assert.equal(s.bag[gated.result], 1); assert.equal(s.energy, 1_000_000 - price);
  s.energy = 0; assert.equal(X.testerBuy(s, gated.result), false, 'still costs energy');
  assert.ok(X.TESTER_ITEMS.length > 50); assert.equal(new Set(X.TESTER_ITEMS.map(i => i.id)).size, X.TESTER_ITEMS.length);
});

test('buying a friend counts as a rescue: at home at its post, the cage reads rescued, and only once', () => {
  const s = M.newGame(); s.energy = 1_000_000;
  assert.equal(X.testerFriend(s, 'pepper'), false); assert.equal(F.cageState(s, 'pepper'), 'hidden');
  X.unlockTester(s);
  for (const id of F.FRIEND_IDS) { assert.equal(X.testerFriend(s, id, 5), true); assert.equal(F.cageState(s, id), 'rescued'); assert.equal(X.testerFriend(s, id), false); }
  assert.deepEqual(s.friends!.map(f => [f.id, f.home, f.rescuedAt]), [['sprout', true, 5], ['clover', true, 5], ['pepper', true, 5]]);
  assert.equal(F.following(s).length, 0);
  const back = M.parseSave(JSON.stringify(s))!; assert.equal(back.friends!.length, 3);
});

test('unlock-all-planets and max level work only in tester mode', () => {
  const s = M.newGame(); assert.equal(X.testerPlanets(s), false); assert.equal(X.testerMaxLevel(s), false);
  X.unlockTester(s); X.testerPlanets(s); X.testerMaxLevel(s);
  assert.ok(s.discovered.length >= 9); assert.equal(s.level, X.TESTER_LEVEL); assert.equal(s.hp, M.maxHp(s));
});

test('the shared (server) action rules know nothing about tester mode', () => {
  const s = M.newGame();
  for (const type of ['tester', 'testerBuy', 'unlockTester']) assert.throws(() => applyGameAction(s, { type, payload: { code: 'buicongnguyen' } }));
  applyGameAction(s, { type: 'settings', payload: { settings: { tester: true } } }); assert.equal(s.settings.tester, undefined, 'settings cannot switch it on');
});
