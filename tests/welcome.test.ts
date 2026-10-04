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
