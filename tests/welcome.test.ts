import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as F from '../src/friends.ts';
import { applyGameAction } from '../src/actions.ts';
import { slotKey, PROFILE_SLOTS } from '../src/profiles.ts';

test('a new game offers the welcome: Pepper joins, and the 1M energy only if taken', () => {
  const a = M.newGame(), b = M.newGame();
  assert.equal(a.welcome, 'pending');
  assert.equal(applyGameAction(a, { type: 'welcomeStart', payload: { take: true } }), true);
  assert.equal(a.energy, 1_000_000); assert.equal(a.welcome, 'done');
  const pepper = F.friendOf(a, 'pepper')!; assert.ok(pepper.home && pepper.role === 'cook');
  assert.equal(applyGameAction(b, { type: 'welcomeStart', payload: { take: false } }), true);
  assert.equal(b.energy, 0); assert.ok(F.friendOf(b, 'pepper'));
  assert.throws(() => applyGameAction(a, { type: 'welcomeStart', payload: { take: true } }), 'only once');
  assert.equal(a.energy, 1_000_000);
});

test('saves from before the welcome never see it; the offer survives a save round trip while pending', () => {
  const old = JSON.parse(JSON.stringify(M.newGame())); delete old.welcome;
  assert.equal(M.parseSave(JSON.stringify(old))!.welcome, 'done');
  assert.equal(M.parseSave(JSON.stringify(M.newGame()))!.welcome, 'pending');
});

test('three profile slots; the first keeps the original save key', () => {
  assert.equal(PROFILE_SLOTS, 3); assert.equal(slotKey(0), M.SAVE_KEY);
  assert.equal(new Set([0, 1, 2].map(slotKey)).size, 3);
});

test('a new explorer is a tall girl; helpers are girls who start small and grow with time and jobs', async () => {
  const s = M.newGame(); assert.equal(s.looks!.style, 'girl-tall-none-bare'); assert.deepEqual(s.looks!.owned, ['tall']);
  assert.equal(M.parseSave(JSON.stringify(s))!.looks!.style, 'girl-tall-none-bare');
  const old = JSON.parse(JSON.stringify(s)); delete old.looks; assert.equal(M.parseSave(JSON.stringify(old))!.looks, undefined, 'older saves keep the default hero');
  F.welcomeStart(s, false); const p = F.friendOf(s, 'pepper')!; assert.equal(p.look, 'girl-chibi-none-bare'); assert.equal(F.friendStage(p), 0);
  const { friendHeight } = await import('../src/growth.ts'); assert.ok(friendHeight(0) < friendHeight(1) && friendHeight(1) < friendHeight(2));
  s.bosses = ['home:treant']; assert.ok(F.rescue(s, 'sprout')); assert.equal(F.friendOf(s, 'sprout')!.look, 'girl-chibi-none-bare');
});

test('a uniform in the outfit slot brings its own fighting skill in place of the weapon special', async () => {
  const { UNIFORM_SPECIAL } = await import('../src/uniform-skills.ts'); const { SPECIALS } = await import('../src/combat.ts');
  const s = M.newGame(); assert.equal(M.weaponStats(s).special, 'fist');
  for (const [outfit, special] of Object.entries(UNIFORM_SPECIAL)) {
    assert.ok(M.ITEMS[outfit] && SPECIALS[special], outfit);
    s.gear.outfit = outfit; assert.equal(M.weaponStats(s).special, special, outfit);
    s.gear.disguise = 'dz_ninja'; assert.notEqual(M.weaponStats(s).special, special, 'a disguise has its own skills'); delete s.gear.disguise;
  }
  assert.equal(Object.keys(UNIFORM_SPECIAL).length, 6);
  delete s.gear.outfit; assert.equal(M.weaponStats(s).special, 'fist');
});
