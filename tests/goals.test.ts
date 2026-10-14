// Long-term goals on the main screen (src/goals.ts; docs/FIX-PLAN.md 5.5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import { COLLECTIONS, CROPS, FISH, PLANETS } from '../src/content.ts';
import { DUNGEON_LEVEL } from '../src/dungeon-content.ts';
import { collectionGoal, goalsKey, nextUnlock, planetGoal, unlockLadder } from '../src/goals.ts';
import { GOALS_VI } from '../src/locales/vi-goals.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';

const base = () => ({ level: 1, discovered: ['home'], collection: {} as Record<string, number>, fishRecords: {} as Record<string, number>, bosses: [] as string[] });

test('planets: the spotted planets out of all nine, unknown ids and repeats ignored', () => {
  assert.equal(Object.keys(PLANETS).length, 9);
  assert.deepEqual(planetGoal(base()), { done: 1, total: 9 });
  const ids = Object.keys(PLANETS);
  assert.deepEqual(planetGoal({ ...base(), discovered: [ids[0], ids[1], ids[1], 'nowhere'] }), { done: 2, total: 9 });
  assert.deepEqual(planetGoal({ ...base(), discovered: ids }), { done: 9, total: 9 });
});

test('collection: fish log, world collections and beaten bosses, each entry weighing the same', () => {
  const empty = collectionGoal(base());
  assert.equal(empty.done, 0); assert.equal(empty.pct, 0);
  assert.equal(empty.fish.total, Object.keys(FISH).length - 1, 'the old boot is not a fish to collect');
  const items = new Set(Object.values(COLLECTIONS).flatMap(c => c.items).filter(id => !Object.hasOwn(FISH, id)));
  assert.equal(empty.items.total, items.size, 'fish in a world collection count once, as fish');
  assert.equal(empty.creatures.total, new Set(Object.entries(PLANETS).flatMap(([id, p]) => p.bosses.map(b => `${id}:${b}`))).size);
  assert.equal(empty.total, empty.fish.total + empty.items.total + empty.creatures.total);
  const s = base(), fish = Object.keys(FISH).find(id => id !== 'boot')!, [planet, p] = Object.entries(PLANETS)[0];
  s.fishRecords[fish] = 30; s.collection.boot = 1; s.collection[[...items][0]] = 1; s.bosses.push(`${planet}:${p.bosses[0]}`, 'nowhere:nobody');
  const c = collectionGoal(s);
  assert.deepEqual([c.fish.done, c.items.done, c.creatures.done, c.done], [1, 1, 1, 3]);
  assert.equal(c.pct, Math.floor(3 / c.total * 100));
  const all = base(); for (const id of Object.keys(FISH)) all.fishRecords[id] = 1; for (const id of items) all.collection[id] = 1;
  all.bosses = Object.entries(PLANETS).flatMap(([id, q]) => q.bosses.map(b => `${id}:${b}`));
  assert.equal(collectionGoal(all).pct, 100);
});

test('next unlock: the lowest level gate above the explorer, with the levels to go and the gate before it', () => {
  const ladder = unlockLadder();
  for (let i = 1; i < ladder.length; i++) assert.ok(ladder[i].level >= ladder[i - 1].level, 'lowest first');
  assert.ok(ladder.some(u => u.kind === 'vault' && u.level === DUNGEON_LEVEL));
  for (const level of [1, 2, 5, 9, 14, 19, 25]) {
    const u = nextUnlock({ level });
    const lowest = Math.min(...[...Object.values(CROPS).map(c => c.level), ...Object.values(PLANETS).map(q => q.level), DUNGEON_LEVEL].filter(l => l > level));
    if (!Number.isFinite(lowest)) { assert.equal(u, null); continue; }
    assert.ok(u, `something opens after level ${level}`);
    assert.equal(u.level, lowest); assert.equal(u.inLevels, lowest - level); assert.ok(u.from <= level && u.from >= 1);
  }
  const top = Math.max(...ladder.map(u => u.level));
  assert.equal(nextUnlock({ level: top }), null, 'nothing left once every gate is open');
  // A planet wins a tie with a crop at the same level.
  const tie = ladder.find(u => u.kind === 'planet' && ladder.some(v => v.kind === 'crop' && v.level === u.level));
  if (tie) assert.equal(nextUnlock({ level: tie.level - 1 })!.kind, 'planet');
});

test('the goals of the promo saves read sensibly, and the redraw key follows every goal', () => {
  for (const file of ['save.json', 'save-late.json']) {
    const s = M.parseSave(readFileSync(new URL(`../promo/${file}`, import.meta.url), 'utf8'));
    assert.ok(s, file);
    const p = planetGoal(s!), c = collectionGoal(s!);
    assert.ok(p.done >= 1 && p.done <= 9, file); assert.ok(c.pct >= 0 && c.pct <= 100, file);
  }
  const s = base(), k = goalsKey(s);
  s.level++; assert.notEqual(goalsKey(s), k);
  const k2 = goalsKey(s); s.collection.pearl = 1; assert.notEqual(goalsKey(s), k2);
  const k3 = goalsKey(s); s.bosses.push('home:bear'); assert.notEqual(goalsKey(s), k3);
  const k4 = goalsKey(s); s.discovered.push('ocean'); assert.notEqual(goalsKey(s), k4);
});

test('every goals string has its Vietnamese in the pack', () => {
  for (const [en, vi] of Object.entries(GOALS_VI)) { assert.ok(vi && vi !== en, en); assert.equal(VI_PACK[en], vi, en); }
  const source = readFileSync(new URL('../src/goals-ui.ts', import.meta.url), 'utf8');
  for (const [, en] of source.matchAll(/\bt\('([^']+)'/g)) assert.ok(VI_PACK[en], `missing Vietnamese: ${en}`);
});
