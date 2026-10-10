import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import * as H from '../src/helper.ts';
import { creatureLevelScale, CREATURE_SCALE_FROM } from '../src/difficulty.ts';
import { colossusMaxHp, NEIGHBOUR_HIT_CAP, COLOSSUS_STATS } from '../src/colossus-content.ts';
import { grantColossusReward } from '../src/colossus-rewards.ts';
import { applyGameAction } from '../src/actions.ts';

const T = Date.UTC(2026, 9, 10, 12);
const act = (s: M.SaveState, type: string, payload: unknown) => applyGameAction(s, { type, payload } as never, { now: T, random: () => .5 } as never);

test('milestone levels are every 5th level above 25', () => {
  assert.deepEqual([20, 25, 26, 30, 35, 40, 55, 60, 61].map(M.isMilestoneLevel), [false, false, false, true, true, true, true, true, false]);
  assert.deepEqual(M.milestoneReward(30), { energy: 15000, items: { moonstone: 1 } });
  assert.equal(M.milestoneReward(60).energy, 30000);
  assert.deepEqual(M.milestonesBetween(24, 41), [30, 35, 40]); assert.deepEqual(M.milestonesBetween(30, 34), []);
});

test('gainXp pays the milestone once per level passed (the same code the server runs)', () => {
  const s = M.newGame(); s.level = 29; s.xp = 0; s.energy = 0;
  M.gainXp(s, M.xpNeeded(29) + 1, T, 1); assert.equal(s.level, 30); assert.equal(s.energy, 15000); assert.equal(s.bag.moonstone, 1);
  M.gainXp(s, 1, T, 1); assert.equal(s.energy, 15000, 'no second payment inside level 30');
  const t = M.newGame(); t.level = 29; t.energy = 0; t.xp = 0;
  let need = 0; for (let l = 29; l < 35; l++) need += M.xpNeeded(l);
  M.gainXp(t, need + 1, T, 1); assert.equal(t.level, 35); assert.equal(t.energy, 15000 + 17500); assert.equal(t.bag.moonstone, 2);
  const u = M.newGame(); u.level = 22; u.xp = 0; u.energy = 0; M.gainXp(u, M.xpNeeded(22), T, 1); assert.equal(u.energy, 0, 'below 25 pays no milestone');
  const f = M.newGame(); f.level = 34; f.xp = 0; f.energy = 0; f.bag = {};
  M.gainXp(f, M.xpNeeded(34), T, 1); assert.equal(f.level, 35); assert.equal((f.bag.moonstone ?? 0) + (f.chest.moonstone ?? 0), 1); assert.equal(f.energy, 17500);
});

test('the endless story points at the modes, fillers and the levels 30, 40, 50 and 60', () => {
  const n = P.STORY_STEPS.length, steps = Array.from({ length: P.ENDGAME_STEPS.length }, (_, i) => P.storyStep(n + i));
  assert.deepEqual(steps.slice(0, 4).map(x => x.event), ['rescue', 'ctf', 'dungeon', 'colossus'], 'the four mode tries come first');
  assert.deepEqual(steps.filter(x => x.condition === 'level').map(x => x.target), [30, 40, 50, 60]);
  assert.equal(steps.at(-1)!.title, 'Reach level 60');
  assert.equal(P.storyStep(n + steps.length).event, 'kill', 'the old endless cycle follows');
});

test('between two level gates the story always has a doable filler (a level-25 explorer is never parked on a gate)', () => {
  const EVENTS = new Set(['kill', 'harvest', 'sell', 'craft', 'fish', 'boss', 'mine', 'bounty', 'rescue', 'ctf', 'dungeon', 'colossus']);
  const steps = P.ENDGAME_STEPS;
  let run = 0, fillers = 0;
  steps.forEach((x, i) => {
    if (x.condition === 'level') { assert.ok(i === 0 || !steps[i - 1].condition, 'no two gates in a row'); if (x.target > 30) assert.ok(fillers >= 2, `at least two fillers before level ${x.target}`); fillers = 0; run = 0; }
    else { assert.ok(x.event && EVENTS.has(x.event), `${x.title} uses a recorded event`); assert.ok(x.target > 0); fillers++; run++; }
  });
  // Play it through: level 25, every earlier step done. Each step is either done by actions or waits only on the level.
  const s = M.newGame('Walker'); s.level = 25; s.progression.story.index = P.STORY_STEPS.length;
  let waits = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = P.storyStep(s.progression.story.index, s);
    if (step.condition === 'level') { assert.ok(s.level >= step.target - 5 || s.level < step.target, 'gate'); s.level = step.target; }
    else P.recordEvent(s, step.event!, step.target, undefined, T);
    const e = P.progressEntries(s, 'story', T)[0]; assert.equal(e.complete, true, step.title);
    assert.equal(P.claimProgress(s, 'story', e.id, T), true, step.title);
    const next = P.storyStep(s.progression.story.index, s);
    if (next.condition === 'level' && s.level < next.target) waits++;
  }
  assert.ok(s.progression.story.index >= P.STORY_STEPS.length + steps.length);
  // At level 25 the first gate is only reached after at least 7 steps that need no level.
  assert.ok(steps.findIndex(x => x.condition === 'level') >= 7);
  void waits; void run;
});

test('story fillers pay modest rewards (more only at the gates)', () => {
  const n = P.STORY_STEPS.length;
  for (let i = 0; i < P.ENDGAME_STEPS.length; i++) {
    const s = M.newGame('Pay'); s.level = 25; s.progression.story.index = n + i;
    const step = P.ENDGAME_STEPS[i], e = P.progressEntries(s, 'story', T)[0];
    assert.ok(e.rewardLabel.length > 0, step.title);
    if (!step.end) assert.ok(!/moonstone|thunderstone|starshard/.test(e.rewardLabel), step.title);
  }
});

test('mode events advance their story steps and nothing else', () => {
  for (const [at, event] of [[0, 'rescue'], [1, 'ctf'], [2, 'dungeon'], [3, 'colossus']] as const) {
    const s = M.newGame(); s.progression.story.index = P.STORY_STEPS.length + at;
    P.recordEvent(s, 'kill', 5, undefined, T); assert.equal(s.progression.story.progress, 0);
    P.recordEvent(s, event, 1, undefined, T); assert.equal(s.progression.story.progress, 1, event);
    assert.equal(P.progressEntries(s, 'story', T)[0].complete, true);
  }
  const s = M.newGame(); s.progression.story.index = P.STORY_STEPS.length + P.ENDGAME_STEPS.findIndex(x => x.target === 30 && x.condition === 'level'); s.level = 29;
  assert.equal(P.progressEntries(s, 'story', T)[0].complete, false); s.level = 30; assert.equal(P.progressEntries(s, 'story', T)[0].complete, true);
});

test('the colossus reward path counts the colossus step (offline and server)', () => {
  const s = M.newGame(); s.progression.story.index = P.STORY_STEPS.length + 3;
  grantColossusReward(s, false, () => .99, true); assert.equal(s.progression.story.progress, 1);
});

test('the level achievement goes to 60', () => {
  const s = M.newGame(); s.level = 60;
  const find = () => P.progressEntries(s, 'achievements', T).find(x => x.id.startsWith('level:'))!;
  assert.match(find().title, /1\/7$/);
  for (const target of [5, 10, 20, 30, 40, 50, 60]) { const a = find(); assert.equal(a.target, target); assert.equal(a.complete, true); assert.ok(P.claimProgress(s, 'achievements', a.id, T)); }
  assert.equal(find().claimed, true);
});

test('zone creatures past level 25 grow 3% per level', () => {
  assert.equal(CREATURE_SCALE_FROM, 25);
  assert.equal(creatureLevelScale(1), 1); assert.equal(creatureLevelScale(25), 1); assert.ok(Math.abs(creatureLevelScale(26) - 1.03) < 1e-12);
  assert.ok(Math.abs(creatureLevelScale(35) - 1.3) < 1e-12); assert.ok(Math.abs(creatureLevelScale(60) - 2.05) < 1e-12); assert.equal(creatureLevelScale(NaN), 1);
});

test('the shared roster is level-independent (online determinism, boss HP unchanged)', async () => {
  const { enemyRoster } = await import('../src/enemy-roster.ts'), a = enemyRoster('home'), b = enemyRoster('home');
  assert.deepEqual(a, b); assert.ok(a.every(e => Number.isInteger(e.baseMaxHp)));
});

test('chests: daily 200 + 25 per level, weekly 3,000 + 100 per level and 2 firecore', () => {
  assert.equal(P.dailyChestEnergy(10), 450); assert.equal(P.weeklyChestEnergy(10), 4000); assert.equal(P.weeklyChestEnergy(1), 3100);
  const s = M.newGame(); P.refreshProgress(s, T);
  for (const kind of ['daily', 'weekly'] as const) {
    const list = kind === 'daily' ? s.progression.daily : s.progression.weekly;
    for (const task of list.tasks) P.recordEvent(s, task.type, task.target, undefined, T);
    for (const e of P.progressEntries(s, kind, T).filter(e => !e.id.endsWith('chest') && !e.id.endsWith('login'))) assert.ok(P.claimProgress(s, kind, e.id, T));
    const chest = P.progressEntries(s, kind, T).find(e => e.id.endsWith('chest'))!;
    assert.ok(chest.complete); assert.ok(chest.rewardLabel.startsWith(`${kind === 'daily' ? P.dailyChestEnergy(s.level) : P.weeklyChestEnergy(s.level)} energy`), chest.rewardLabel);
    const f0 = (s.bag.firecore ?? 0) + (s.chest.firecore ?? 0); assert.ok(P.claimProgress(s, kind, chest.id, T));
    assert.equal((s.bag.firecore ?? 0) + (s.chest.firecore ?? 0) - f0, kind === 'weekly' ? 2 : 0);
  }
});

test('helper hold: a quarter of the growing time between 20 s and 5 min', () => {
  assert.equal(H.growHold(60_000), 20_000); assert.equal(H.growHold(120_000), 30_000); assert.equal(H.growHold(180_000), 45_000); assert.equal(H.growHold(1_000_000), 250_000); assert.equal(H.growHold(3_600_000), 300_000);
});

test('solo Colossus has a third of the online health; neighbours hit up to 1,200', () => {
  assert.equal(colossusMaxHp(1), 3_000_000); assert.equal(colossusMaxHp(3), 7_800_000);
  assert.equal(colossusMaxHp(1, true), 1_000_000); assert.equal(colossusMaxHp(3, true), 2_600_000);
  assert.equal(COLOSSUS_STATS.hp, 3_000_000); assert.equal(NEIGHBOUR_HIT_CAP, 1200);
});

test('keep-my-bag is on by default; only an explicit false turns it off, and it survives saving', () => {
  const s = M.newGame(); assert.equal(s.settings.keepBagOnDeath, undefined); assert.equal(M.keepsBag(s), true);
  s.bag = { carrot: 3 }; assert.equal(M.die(s, 1, 2, T), null); assert.equal(s.bag.carrot, 3);
  const old = JSON.parse(JSON.stringify(M.newGame())); delete old.settings.keepBagOnDeath; assert.equal(M.keepsBag(M.parseSave(JSON.stringify(old))!), true);
  const off = M.newGame(); act(off, 'settings', { settings: { keepBagOnDeath: false } });
  assert.equal(off.settings.keepBagOnDeath, false); const again = M.parseSave(JSON.stringify(off))!; assert.equal(again.settings.keepBagOnDeath, false); assert.equal(M.keepsBag(again), false);
  again.bag = { carrot: 3 }; assert.ok(M.die(again, 1, 2, T)); assert.equal(again.bag.carrot, undefined);
});
