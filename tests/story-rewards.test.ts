// Story rewards that help a new explorer in (src/story-gifts.ts, progression.ts storyReward; docs/FIX-PLAN.md 5.6).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { ITEMS, STORY_STEPS } from '../src/content.ts';
import { applyGameAction } from '../src/actions.ts';
import { gearLevel } from '../src/level-gates.ts';
import { STORY_GIFTS, storyEnergy, storyItems, storyXp } from '../src/story-gifts.ts';
import { WELCOME_ENERGY } from '../src/friends.ts';

const T0 = Date.UTC(2026, 9, 15, 9);
/** The old formula, for the comparison (before FIX-PLAN 5.6). */
const before = (level: number, index: number) => ({ energy: 30 + level * 6 + Math.min(index, 40) * 4, xp: Math.round(M.xpNeeded(level) * (index >= 29 ? .3 : .25)) });

test('story energy and EXP grow with the level through the shared levelRewardBonus, and never pay less than before', () => {
  for (const index of [0, 8, 14, 20, 28, 40, 60]) {
    let last = 0;
    for (const level of [1, 2, 5, 10, 20, 25, 40, 51, 60]) {
      const r = P.storyRewardAt(level, index), old = before(level, index);
      assert.ok(r.energy! > last, `energy grows with the level (step ${index}, level ${level})`); last = r.energy!;
      assert.ok(r.energy! >= old.energy, `no less energy than before (step ${index}, level ${level})`);
      assert.ok(r.xp! >= old.xp, `no less EXP than before (step ${index}, level ${level})`);
      assert.equal(r.energy, storyEnergy(level, index, M.levelRewardBonus(level)));
      assert.equal(r.xp, storyXp(M.xpNeeded(level), index, M.levelRewardBonus(level)));
    }
  }
  // The owner's two examples: 36 energy at level 1 and 270 at level 40 (first step) were too little.
  assert.ok(P.storyRewardAt(1, 0).energy! >= 60);
  assert.ok(P.storyRewardAt(40, 0).energy! >= 1500);
  // A level-1 step pays about a whole level of EXP; later the share settles back to a quarter of the level plus the bonus part.
  assert.ok(P.storyRewardAt(1, 0).xp! >= M.xpNeeded(1) * .9);
  assert.ok(P.storyRewardAt(40, 20).xp! < M.xpNeeded(40) * .3);
});

test('the first two chapters hand over starter items a new explorer can use at once, each before the step that needs it', () => {
  const chapterTwoEnd = STORY_STEPS.findIndex(s => s.chapter === 2) - 1;
  for (const [index, gift] of Object.entries(STORY_GIFTS)) {
    assert.ok(Number(index) <= chapterTwoEnd, `gifts only in chapters 1-2 (step ${index})`);
    for (const [id, n] of Object.entries(gift)) {
      assert.ok(Object.hasOwn(ITEMS, id), id); assert.ok(n! > 0 && n! <= 6, `${id}: a starter amount`);
      // Wearable right away: the step can only come after "Reach level 5" when it needs level 4 or more.
      const reachFive = STORY_STEPS.findIndex(s => s.condition === 'level' && s.target === 5);
      const lowest = Number(index) > reachFive ? 5 : 1;
      assert.ok(gearLevel(id) <= lowest, `${id} can be worn at level ${lowest}`);
    }
  }
  assert.ok(Object.keys(STORY_GIFTS).filter(i => Number(i) < 9).length >= 5, 'most of chapter 1 pays an item');
  // The rod comes before the first fishing step, food before the first fight, the companion before the first boss.
  const first = (pred: (s: (typeof STORY_STEPS)[number]) => boolean) => STORY_STEPS.findIndex(pred);
  const giftIndex = (id: string) => Math.min(...Object.entries(STORY_GIFTS).filter(([, g]) => g[id]).map(([i]) => Number(i)));
  assert.ok(giftIndex('rod') < first(s => s.event === 'fish'));
  assert.ok(giftIndex('potion') < first(s => s.event === 'kill'));
  assert.ok(giftIndex('pet_robot') < first(s => s.event === 'boss'));
  // Gifts and chapter-end gifts add up.
  assert.deepEqual(storyItems(8, { seed_star: 1, spore: 2, plot_kit: 1 }), { seed_star: 1, spore: 2, plot_kit: 1 });
  assert.deepEqual(storyItems(0), { manure: 4 });
  assert.deepEqual(storyItems(12, { potion: 1 }), { potion: 4, worm: 5 });
});

test('no early step stalls a new explorer: no rare-fish step, small counts, nothing out of reach', () => {
  const early = STORY_STEPS.filter(s => s.chapter <= 1);
  assert.ok(!early.some(s => s.event === 'fishrare'), 'the koi-only rare fish is a daily task, not a gate');
  for (const s of early) if (s.event === 'kill') assert.ok(s.target <= 25, s.title);
  for (const s of early) if (s.event === 'fish') assert.ok(s.target <= 5, s.title);
});

test('the browser and the server pay the same story reward (actions.ts runs the same progression)', () => {
  const play = (claim: (s: M.SaveState) => unknown) => {
    const s = M.newGame('Same'); P.refreshProgress(s, T0);
    for (let i = 0; i < 3; i++) P.recordEvent(s, 'harvest', 1, undefined, T0);
    assert.ok(claim(s)); return s;
  };
  const local = play(s => P.claimProgress(s, 'story', 'story:0', T0));
  const server = play(s => applyGameAction(s, { type: 'claimProgress', payload: { kind: 'story', id: 'story:0' } }, { now: T0, random: () => .5 }));
  assert.equal(local.energy, server.energy); assert.equal(local.xp, server.xp); assert.equal(local.level, server.level);
  assert.deepEqual(local.bag, server.bag);
  assert.equal(local.bag.manure, 4);
  assert.equal(local.energy, P.storyRewardAt(1, 0).energy);
});

test('a new explorer walks chapters 1 and 2 and ends with the starter kit in the bag (the welcome gift unchanged)', () => {
  assert.equal(WELCOME_ENERGY, 10_000);
  const s = M.newGame('Walker'); P.refreshProgress(s, T0); let clock = T0;
  for (let index = 0; index < 15; index++) {
    const step = P.storyStep(index, s);
    if (step.condition === 'level') { while (s.level < step.target) M.gainXp(s, M.xpNeeded(s.level), clock); }
    else if (step.condition === 'equipped') { s.bag.sword_wood = 1; assert.equal(M.equip(s, 'sword_wood'), true); }
    else if (step.condition === 'plots') { assert.ok(s.bag.plot_kit, 'the kit came with "Reach level 5"'); assert.equal(M.expandGarden(s), true); }
    else P.recordEvent(s, step.event!, step.target, undefined, clock += 1000);
    const e = P.progressEntries(s, 'story', clock)[0];
    assert.equal(e.complete, true, step.title); assert.equal(P.claimProgress(s, 'story', e.id, clock), true, step.title);
  }
  const owned = (id: string) => (s.bag[id] ?? 0) + (s.chest[id] ?? 0);
  for (const id of ['manure', 'potion', 'hat_straw', 'rod', 'worm', 'pet_robot']) assert.ok(owned(id) > 0, `has ${id}`);
  assert.equal(M.equip(s, 'hat_straw'), true, 'the hat goes on at once');
  assert.equal(M.equip(s, 'pet_robot'), true, 'the companion comes along at once');
});
