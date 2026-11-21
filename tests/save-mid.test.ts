// promo/save-mid.json: the mid-game save of the speed gate's boss rows (promo/perf-budget.mjs, docs/AAA-PLAN.md WP3).
// It is a state real play reaches: story steps 0-11 done and claimed, level 8, "Defeat a boss" next, no boss beaten yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { cageState, friendOf } from '../src/friends.ts';
import { STORY_STEPS } from '../src/content.ts';

const load = () => M.parseSave(readFileSync(new URL('../promo/save-mid.json', import.meta.url), 'utf8'))!;

test('promo/save-mid.json parses: level 8, story step 12 (Defeat a boss), nothing of it done yet', () => {
  const s = load();
  assert.ok(s, 'it parses');
  assert.equal(s.level, 8);
  assert.equal(s.progression.story.index, 12);
  assert.equal(STORY_STEPS[12].title, 'Defeat a boss');
  assert.equal(s.progression.story.progress, 0);
  assert.equal(s.quest, 12);
  assert.equal(s.planet, 'home');
});

test('the welcome is settled and Pepper is home: the entry the first hand harvest gives a new game', () => {
  const s = load();
  assert.equal(s.welcome, 'done');
  const pepper = friendOf(s, 'pepper')!;
  assert.ok(pepper, 'Pepper is a friend'); assert.equal(pepper.home, true);
  // A new game after its first harvest by hand (actions.ts harvest -> friends.ts firstHarvestGift).
  const fresh = M.newGame('Fresh'), now = 1_000_000; fresh.bag.seed_radish = 1;
  assert.equal(fresh.welcome, 'pending');
  assert.ok(applyGameAction(fresh, { type: 'plant', payload: { index: 0, id: 'radish' } }, { now, random: Math.random }));
  assert.ok(applyGameAction(fresh, { type: 'harvest', payload: { index: 0 } }, { now: now + 86400000, random: Math.random }));
  assert.equal(fresh.welcome, 'done');
  const { rescuedAt: _a, ...given } = friendOf(M.parseSave(JSON.stringify(fresh))!, 'pepper')!, { rescuedAt: _b, ...saved } = pepper;
  assert.deepEqual(saved, given);
});

test('Pepper has no cage; Sprout and the farmer are still caged: neither home boss is beaten', () => {
  const s = load();
  assert.equal(cageState(s, 'pepper'), 'rescued');
  assert.equal(cageState(s, 'sprout'), 'locked');
  assert.equal(cageState(s, 'clover'), 'locked');
  const bosses = s.bosses ?? [];
  assert.ok(!bosses.includes('home:treant') && !bosses.includes('home:bear'), JSON.stringify(bosses));
  assert.deepEqual(s.friends!.map(f => f.id), ['pepper']);
});

test('the counters match story steps 0-11 done', () => {
  const s = load(), c = s.counters, t = s.progression.totals;
  assert.equal(t.questsDone, 12);
  assert.ok(c.harvests >= 3 && c.sold >= 20 && c.bought >= 1, 'harvest, market, one item');
  assert.ok(s.gear.weapon, 'a weapon is equipped');
  assert.ok(c.kills >= 30, `5 + 25 creatures (${c.kills})`);
  assert.ok(c.upgrades >= 1 && s.attackUp + s.healthUp + s.defenseUp + s.critUp >= 1, 'a crystal upgrade');
  assert.ok(c.fish >= 2 && c.skills >= 10, 'two fish, ten skills');
  assert.ok(s.plots.length >= M.STARTING_PLOTS + 1, 'another garden bed');
  assert.ok((t.cook ?? 0) >= 3, 'three meals');
  assert.ok(!(t.boss > 0), 'no boss yet');
  assert.deepEqual(s.visited, ['home']);
});
