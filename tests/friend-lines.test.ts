import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as F from '../src/friends.ts';
import { LINES, lineFor } from '../src/friend-lines.ts';
import { VI_FRIEND_LINES } from '../src/locales/vi-friend-lines.ts';

test('every scenario has plenty of lines, each unique and in Vietnamese', () => {
  const all = Object.values(LINES).flat();
  assert.equal(new Set(all).size, all.length);
  for (const k of ['HARVEST', 'COLLECT', 'COOK', 'NICE', 'HOME'] as const) assert.ok(LINES[k].length >= 20, k);
  for (const k of ['PLANT', 'FEED', 'OUTFIT'] as const) assert.ok(LINES[k].length >= 12, k);
  for (const l of all) { assert.ok(VI_FRIEND_LINES[l], l); assert.notEqual(VI_FRIEND_LINES[l], l); }
  const seen = new Set(Array.from({ length: 15 }, () => lineFor('t', 'NICE'))); assert.ok(seen.size >= 14, 'a pool does not repeat early');
});

test('the cook changes into a different hat, outfit and boots from what the explorer has', () => {
  const s = M.newGame(); s.friends = [{ id: 'pepper', role: 'cook', rescuedAt: 1, gear: { hat: 'hat_chef' }, home: true }];
  for (const i of ['hat_chef', 'hat_bear', 'hat_cowboy', 'armor_chef', 'armor_pirate', 'boots_cloud', 'boots_lava']) s.bag[i] = 1;
  assert.equal(F.changeOutfit(s, 'pepper', .37), true);
  const g = F.friendOf(s, 'pepper')!.gear; assert.notEqual(g.hat, 'hat_chef'); assert.ok(g.outfit && g.boots);
  assert.equal(F.changeOutfit(s, 'pepper', 2), false); assert.equal(F.changeOutfit(s, 'nobody' as never, .5), false);
  assert.equal(F.changeOutfit(M.newGame(), 'pepper', .5), false, 'a friend who is not rescued');
});

test('the cook does not shadow the gardener: a single ripe bed is left alone, two make a trip', () => {
  const s = M.newGame(); const T0 = Date.now(), done = (i: number) => { s.plots[i].crop = 'radish'; s.plots[i].plantedAt = T0 - M.CROPS.radish.duration - 400_000; };
  s.friends = [{ id: 'pepper', role: 'cook', rescuedAt: 1, gear: {}, home: true }];
  done(0); assert.equal(F.nextFriendTask(s, 'pepper', { x: 0, z: 0 }, T0), null);
  done(1); assert.equal(F.nextFriendTask(s, 'pepper', { x: 0, z: 0 }, T0)?.kind, 'harvest');
});
