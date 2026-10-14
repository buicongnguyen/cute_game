// FIX-PLAN 5.2 (welcome-back card), 5.3 (quest walk vs auto-fight) and 5.4 (rewards that grow with level).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { progressEntries, claimProgress } from '../src/progression.ts';
import { welcomeBackDue, welcomeFacts, localDay } from '../src/welcome-back.ts';
import { attacker, holdsAutoFight, arrived, trailDots, DEFEND_RANGE } from '../src/quest-walk.ts';
import { LOOP_VI } from '../src/locales/vi-loop.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';

const NOW = Date.UTC(2026, 9, 15, 3); // 10:00 in Vietnam: the Colossus (08:00 UTC+7) is awake
const energy = (label: string) => Number(/([\d,]+)\s*energy/.exec(label)?.[1].replace(/,/g, '') ?? 0);
const xp = (label: string) => Number(/([\d,]+) XP/.exec(label)?.[1].replace(/,/g, '') ?? 0);

test('the welcome-back card is due once per local day, never on a brand-new save', () => {
  assert.equal(welcomeBackDue(null, '2026-10-15', true), false);
  assert.equal(welcomeBackDue(null, '2026-10-15', false), true);
  assert.equal(welcomeBackDue('2026-10-14', '2026-10-15', false), true);
  assert.equal(welcomeBackDue('2026-10-15', '2026-10-15', false), false);
  assert.match(localDay(NOW), /^\d{4}-\d{2}-\d{2}$/);
});

test('the card reuses the Journal check-in and lists the Colossus, rescue and Vault', () => {
  const s = M.newGame('Ana'); s.level = 25;
  const f = welcomeFacts(s, NOW, { rescueCall: true });
  assert.ok(f.checkIn && f.checkIn.id.endsWith(':login') && !f.checkIn.claimed && f.checkIn.complete);
  assert.equal(f.checkIn.rewardLabel, progressEntries(s, 'daily', NOW)[0].rewardLabel);
  assert.deepEqual(f.lines.map(l => l.kind), ['colossus', 'rescue', 'vault']);
  assert.match(f.lines[0].text, /awake/);
  assert.match(f.lines[1].text, /waiting/);
  assert.match(f.lines[2].text, /2 \/ 2|runs left/);
  // Collecting it is the Journal's own claim: the card then shows it collected, and it cannot be taken twice.
  const before = s.energy;
  assert.equal(claimProgress(s, 'daily', f.checkIn.id, NOW), true);
  assert.ok(s.energy > before);
  assert.equal(welcomeFacts(s, NOW).checkIn?.claimed, true);
  assert.equal(claimProgress(s, 'daily', f.checkIn.id, NOW), false);
  // The streak shown is the one the claim makes (yesterday claimed -> 2).
  const t = M.newGame('Bo'); t.progression.login = { day: '2026-10-14', streak: 1 };
  assert.equal(welcomeFacts(t, NOW).streak, 2);
  // Low levels: no Colossus line, the Vault says when it opens; Bolt's news joins the card.
  const low = welcomeFacts(M.newGame('Cy'), NOW, { away: [{ text: 'Bolt harvested 3 crops', icon: '🤖' }] });
  assert.deepEqual(low.lines.map(l => l.kind), ['rescue', 'vault', 'away']);
  assert.match(low.lines[1].text, /opens at level/);
});

test('a guided quest walk holds auto-fight back unless a creature attacks', () => {
  const p = { x: 0, z: 0 };
  const wander = { x: 2, z: 0, hp: 10, radius: .5, phase: 'idle' }, charger = { x: 3, z: 0, hp: 10, radius: .5, phase: 'chase' }, far = { x: 30, z: 0, hp: 10, radius: .5, phase: 'chase' };
  assert.equal(holdsAutoFight(true, [wander, far], p), true);
  assert.equal(holdsAutoFight(false, [wander], p), false);
  assert.equal(holdsAutoFight(true, [wander, charger], p), false);
  assert.equal(attacker([wander, charger, far], p), charger);
  assert.equal(attacker([{ ...charger, hp: 0 }], p), null);
  assert.equal(attacker([{ ...charger, x: DEFEND_RANGE + 2 }], p), null);
  assert.equal(arrived({ x: 0, z: 0 }, { x: 3, z: 0, radius: 1 }), true);
  assert.equal(arrived({ x: 0, z: 0 }, { x: 9, z: 0, radius: 1 }), false);
});

test('the trail dots follow the route, evenly spaced and capped', () => {
  const dots = trailDots([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 10 }], 6, 2, 1);
  assert.equal(dots.length, 6);
  assert.deepEqual(dots.slice(0, 3), [{ x: 1, z: 0 }, { x: 3, z: 0 }, { x: 4, z: 1 }]);
  assert.equal(trailDots([{ x: 0, z: 0 }, { x: 2, z: 0 }], 10, 1, .5).length, 2);
  assert.equal(trailDots([{ x: 0, z: 0 }], 10, 1, .5).length, 0);
});

test('achievements and the check-in pay more at higher levels, within the economy', () => {
  assert.equal(M.levelRewardBonus(1), 1); assert.equal(M.levelRewardBonus(10), 1.9); assert.equal(M.levelRewardBonus(40), 4.9); assert.equal(M.levelRewardBonus(99), 6); assert.equal(M.levelRewardBonus(NaN), 1);
  const at = (level: number) => { const s = M.newGame('Ana'); s.level = level; return { ach: progressEntries(s, 'achievements', NOW)[0].rewardLabel, login: progressEntries(s, 'daily', NOW)[0].rewardLabel, chest: progressEntries(s, 'daily', NOW).at(-1)!.rewardLabel }; };
  const l1 = at(1), l10 = at(10), l40 = at(40);
  assert.ok(energy(l10.ach) > energy(l1.ach) && energy(l40.ach) > energy(l10.ach));
  assert.ok(xp(l40.ach) > xp(l1.ach));
  assert.ok(energy(l40.login) > energy(l1.login));
  // Never more than the day's chest: a first-tier achievement or a plain check-in stays a small treat.
  for (const r of [l1, l10, l40]) { assert.ok(energy(r.ach) < energy(r.chest)); assert.ok(energy(r.login) < energy(r.chest)); }
  // The claim pays what the Journal shows (one rule for the browser and the server).
  const s = M.newGame('Ana'); s.level = 40; s.progression.totals.kill = 60; s.counters.kills = 60;
  const entry = progressEntries(s, 'achievements', NOW).find(e => e.id === 'kills:0')!, before = s.energy;
  assert.ok(claimProgress(s, 'achievements', entry.id, NOW));
  assert.equal(s.energy - before, energy(entry.rewardLabel));
});

test('every new card and walk string has Vietnamese in the pack', () => {
  for (const [en, vi] of Object.entries(LOOP_VI)) { assert.ok(vi && vi !== en, en); assert.equal(VI_PACK[en], vi); }
});
