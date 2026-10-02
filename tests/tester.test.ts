import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as M from '../src/model.ts';
import * as F from '../src/friends.ts';
import { applyGameAction } from '../src/actions.ts';
import * as X from '../src/tester.ts';
import { RECIPES } from '../src/content.ts';

// The real code stays out of this public repo: the rules are tested with a stand-in code's hashes; set ZOO_TESTER_CODE
// to also check the shipped hashes against the real code.
test('the right code (any case, spaces trimmed) matches with SHA-256 and with the fallback hash; wrong codes do not', async () => {
  const sample = 'garden-sample', hashes = { sha256: createHash('sha256').update(sample).digest('hex'), fnv1a: X.fnv1a(sample) };
  for (const code of [sample, '  Garden-SAMPLE ']) { assert.equal(await X.codeMatches(code, globalThis.crypto.subtle, hashes), true); assert.equal(await X.codeMatches(code, undefined, hashes), true, 'no crypto.subtle (plain http)'); }
  for (const code of ['', 'garden', sample + '1', 'x'.repeat(200)]) assert.equal(await X.codeMatches(code, globalThis.crypto.subtle, hashes), false);
  assert.equal(await X.codeMatches(sample), false, 'the shipped hashes are not the sample');
  assert.match(X.CODE_HASHES.sha256, /^[0-9a-f]{64}$/); assert.match(X.CODE_HASHES.fnv1a, /^[0-9a-f]{1,8}$/);
  const real = process.env.ZOO_TESTER_CODE; if (real) { assert.equal(await X.codeMatches(real), true); assert.equal(await X.codeMatches(real, undefined), true); }
  assert.ok(!real || !readFileSync(new URL('../src/tester.ts', import.meta.url), 'utf8').toLowerCase().includes(real.toLowerCase()), 'the plain code is not in the source');
});

test('code attempts are limited to 5 a minute', () => {
  const tryIt = X.attemptLimiter(); const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(tryIt(t0 + i), true);
  assert.equal(tryIt(t0 + 1000), false); assert.equal(tryIt(t0 + 59_999), false);
  assert.equal(tryIt(t0 + 60_000), true, 'the oldest try left the window');
  // The window survives a reload through the saved tries (localStorage in the game).
  let saved: string | null = null; const store = { get: () => saved, set: (v: string) => { saved = v; } };
  const first = X.attemptLimiter(5, 60_000, store); for (let i = 0; i < 5; i++) assert.equal(first(t0 + i), true);
  const reloaded = X.attemptLimiter(5, 60_000, store); assert.equal(reloaded(t0 + 10), false, 'a reload keeps the limit');
  assert.equal(reloaded(t0 + 60_005), true);
  saved = 'not json'; assert.equal(X.attemptLimiter(5, 60_000, store)(t0), true, 'a bad saved entry starts over');
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
  for (const type of ['tester', 'testerBuy', 'unlockTester']) assert.throws(() => applyGameAction(s, { type, payload: { code: 'garden-sample' } }));
  applyGameAction(s, { type: 'settings', payload: { settings: { tester: true } } }); assert.equal(s.settings.tester, undefined, 'settings cannot switch it on');
});
