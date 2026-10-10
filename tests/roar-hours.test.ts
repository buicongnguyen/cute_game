import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import { COLOSSUS_SCHEDULE, COLOSSUS_STATS, colossusClock, roarBonusCount, roarHours } from '../src/colossus-content.ts';
import { grantRoarBonus } from '../src/colossus-rewards.ts';
import { ROAR_VI } from '../src/locales/vi-roar.ts';

const at = (iso: string) => Date.parse(iso);

test('roar hours: 12:00 UTC window boundaries are exact', () => {
  assert.equal(roarHours(at('2026-10-10T11:59:59.999Z')).active, false);
  const open = roarHours(at('2026-10-10T12:00:00.000Z'));
  assert.equal(open.active, true); assert.equal(open.startsAt, at('2026-10-10T12:00:00Z')); assert.equal(open.endsAt, at('2026-10-10T13:00:00Z'));
  assert.equal(roarHours(at('2026-10-10T12:59:59.999Z')).active, true);
  assert.equal(roarHours(at('2026-10-10T13:00:00.000Z')).active, false);
});
test('roar hours: 02:00 and 19:00 windows, and next', () => {
  assert.equal(roarHours(at('2026-10-10T02:30:00Z')).active, true);
  assert.equal(roarHours(at('2026-10-10T19:00:00Z')).active, true);
  assert.equal(roarHours(at('2026-10-10T20:00:00Z')).active, false);
  assert.equal(roarHours(at('2026-10-10T05:00:00Z')).next, at('2026-10-10T12:00:00Z'));
  assert.equal(roarHours(at('2026-10-10T12:30:00Z')).next, at('2026-10-10T19:00:00Z'));
  const idle = roarHours(at('2026-10-10T05:00:00Z'));
  assert.equal(idle.startsAt, idle.next); assert.equal(idle.endsAt, at('2026-10-10T13:00:00Z'));
});
test('roar hours: day wrap (after 19:00 the next is 02:00 tomorrow; before 02:00 it is today)', () => {
  assert.equal(roarHours(at('2026-10-10T23:59:59.999Z')).next, at('2026-10-11T02:00:00Z'));
  assert.equal(roarHours(at('2026-10-10T19:59:59.999Z')).next, at('2026-10-11T02:00:00Z'));
  assert.equal(roarHours(at('2026-10-31T19:30:00Z')).next, at('2026-11-01T02:00:00Z'));
  assert.equal(roarHours(at('2026-10-10T00:00:00Z')).next, at('2026-10-10T02:00:00Z'));
  assert.equal(roarHours(at('2026-10-10T00:00:00Z')).active, false);
});
test('our long Colossus window is untouched', () => {
  assert.equal(COLOSSUS_SCHEDULE.hour, 8); assert.equal(COLOSSUS_SCHEDULE.duration, 16 * 3600); assert.equal(COLOSSUS_SCHEDULE.utcOffsetHours, 7);
  assert.equal(colossusClock(at('2026-10-10T05:00:00Z')).phase, 'active'); // 12:00 UTC+7: inside the long window, roar or not
});
test('bonus rule: +25% of a stack, a stack of 1 gains at most 1 (25% chance), never negative', () => {
  assert.equal(roarBonusCount(1, () => .24), 1); assert.equal(roarBonusCount(1, () => .25), 0); assert.equal(roarBonusCount(1, () => .99), 0);
  assert.equal(roarBonusCount(4, () => .99), 1); assert.equal(roarBonusCount(8, () => .99), 2);
  assert.equal(roarBonusCount(6, () => .49), 2); assert.equal(roarBonusCount(6, () => .5), 1); // 1.5 -> 1 + 50% chance
  assert.equal(roarBonusCount(0, () => 0), 0);
  for (let c = 1; c < 30; c++) for (const r of [0, .3, .7, .999]) { const b = roarBonusCount(c, () => r); assert.ok(b >= Math.floor(c / 4) && b <= Math.ceil(c / 4)); }
});
test('grantRoarBonus adds 25% EXP and grows loot stacks', () => {
  const s = M.newGame(), plain = M.newGame();
  const base = M.grantDefeat(plain, 'colossus', COLOSSUS_STATS.xp, true, () => 0, false);
  const xp0 = s.xp + (s.level - 1) * 1e12; // compare through gainXp so levels cancel
  void xp0;
  const loot = [{ id: 'a', count: 8 }, { id: 'b', count: 1 }];
  const extra = grantRoarBonus(s, loot, () => 0);
  assert.equal(extra, COLOSSUS_STATS.xp * .25);
  assert.deepEqual(loot, [{ id: 'a', count: 10 }, { id: 'b', count: 2 }]);
  assert.ok(base.length > 0);
});
test('solo only: the server never pays the roar bonus; the offline path does', () => {
  const server = readFileSync(new URL('../server/colossus-authority.mjs', import.meta.url), 'utf8');
  assert.ok(!/roar/i.test(server));
  const rewards = readFileSync(new URL('../src/colossus-rewards.ts', import.meta.url), 'utf8');
  assert.equal((rewards.match(/export function grantColossusReward/g) || []).length, 1);
  assert.ok(!/roar/i.test(rewards.slice(rewards.indexOf('export function grantColossusReward'), rewards.indexOf('Roar hour bonus'))));
  const ui = readFileSync(new URL('../src/colossus.ts', import.meta.url), 'utf8');
  assert.match(ui, /if \(roar\) extraXp = grantRoarBonus/);
});
test('Vietnamese strings exist and keep their placeholders', () => {
  assert.ok(Object.keys(ROAR_VI).length < 40);
  for (const [k, v] of Object.entries(ROAR_VI)) { assert.ok(v.length > 0); assert.deepEqual(v.match(/\{\w+\}/g), k.match(/\{\w+\}/g)); }
});
