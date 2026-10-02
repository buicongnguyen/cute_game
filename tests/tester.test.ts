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

/** Every item normal play only gets by combining others: workshop/furnace recipes with materials, the kitchen's cooked_
 *  foods and farm dishes. Kept independent of tester.ts so a new crafting source shows up here as a missing item. */
function combinables() {
  const ids = new Set<string>();
  for (const r of RECIPES) if (r.station !== 'shop' || Object.keys(r.materials).length) ids.add(r.result);
  for (const id of Object.keys(M.ITEMS)) if (id.startsWith('cooked_')) ids.add(id);
  for (const d of M.FARM_DISHES) ids.add(d.id);
  return [...ids];
}

test('every combinable item is in the tester shop and buyable for energy alone', () => {
  const shop = new Set(X.TESTER_ITEMS.map(i => i.id)), all = combinables();
  assert.ok(all.length > 100); assert.deepEqual(all.filter(id => !shop.has(id)), []);
  const s = M.newGame(); X.unlockTester(s);
  for (const id of all) assert.equal(X.testerBuy(s, id), true, id);
  for (const id of all) assert.ok(s.bag[id]! >= 1, id);
  for (const cat of [X.KITCHEN_COOKED, X.KITCHEN_DISHES]) assert.ok(X.TESTER_ITEMS.some(i => i.category === cat), cat);
});

test('tester crafting panels make any recipe or dish without ingredients; normal mode still needs them', () => {
  const s = M.newGame(); s.energy = 1_000_000;
  const furnace = RECIPES.findIndex(r => r.station === 'forge'), gated = RECIPES.findIndex(r => r.station === 'craft' && Object.keys(r.materials).length);
  // Normal rules: no materials, no furnace, no kitchen level -> nothing.
  assert.equal(M.canCraft(s, gated), false); assert.equal(M.craft(s, gated), false); assert.equal(M.canCraft(s, furnace), false);
  assert.equal(M.cook(s, 'meat'), false); assert.equal(M.cookDish(s, 'cheese'), false);
  assert.equal(X.testerCraft(s, gated), false); assert.equal(X.testerCook(s, 'cheese'), false, 'tester rules are off outside tester mode');
  X.unlockTester(s); const before = s.energy;
  for (let i = 0; i < RECIPES.length; i++) assert.equal(X.testerCraft(s, i), true, RECIPES[i].result);
  assert.equal(s.energy, before - RECIPES.reduce((n, r) => n + r.energy, 0), 'only each recipe\'s energy is paid');
  for (const r of RECIPES) assert.ok(s.bag[r.result]! >= (r.count || 1), r.result);
  const energy = s.energy; for (const c of X.COOKABLE) assert.equal(X.testerCook(s, c.id), true, c.id);
  assert.equal(s.energy, energy, 'kitchen food stays free'); assert.equal(X.testerCook(s, 'meat'), false, 'only kitchen results');
  s.energy = 0; assert.equal(X.testerCraft(s, RECIPES.findIndex(r => r.energy > 0)), false, 'workshop still costs energy');
});

test('tester forge maxes an owned weapon; normal forging keeps its costs and roll', () => {
  const s = M.newGame(), sword = Object.keys(M.ITEMS).find(id => M.ITEMS[id].slot === 'weapon' && M.ITEMS[id].weapon && M.ITEMS[id].weapon!.kind !== 'rod')!;
  M.addItem(s, sword); s.energy = 1_000_000;
  assert.equal(X.testerForgeMax(s, sword), false); assert.equal(M.canForge(s, sword), false, 'no materials, no forging');
  X.unlockTester(s); assert.equal(X.testerForgeMax(s, 'rod'), false);
  assert.equal(X.testerForgeMax(s, sword), true); assert.equal(M.forgeLevel(s, sword), X.MAX_FORGE_LEVEL); assert.equal(X.testerForgeMax(s, sword), false);
  assert.equal(M.parseSave(JSON.stringify(s))!.forge?.[sword], X.MAX_FORGE_LEVEL);
});

test('tester buttons and the kitchen section render only in tester mode', () => {
  const s = M.newGame(); assert.equal(X.testerKitchenHtml(s), ''); assert.equal(X.testerMakeButton(s, 'tester-craft', 0, 5), '');
  X.unlockTester(s); const html = X.testerKitchenHtml(s);
  assert.equal((html.match(/data-action="tester-cook"/g) ?? []).length, X.COOKABLE.length); assert.match(html, /🧪 Tester/);
});
