import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import * as M from '../src/model.ts';
import * as F from '../src/friends.ts';
import { applyGameAction } from '../src/actions.ts';
import { World } from '../src/world.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';

const T0 = 1_000_000;
function game(d?: M.Difficulty, level = 30) {
  const s = M.newGame(); s.level = level; s.energy = 100_000; s.farm.built = true; if (d) s.settings.difficulty = d; return s;
}
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}) => applyGameAction(s, { type, payload }, { now: T0, random: () => .5 });

test('new games and old saves play on Easy; a saved choice survives a reload; bad values fall back', () => {
  assert.equal(M.newGame().settings.difficulty, 'easy');
  const old = JSON.parse(JSON.stringify(M.newGame())); delete old.settings.difficulty;
  assert.equal(M.parseSave(JSON.stringify(old))!.settings.difficulty, 'easy', 'migration: no setting = easy');
  assert.equal(M.parseSave(JSON.stringify({ ...old, settings: { ...old.settings, difficulty: 'nightmare' } }))!.settings.difficulty, 'easy');
  assert.equal(M.parseSave(JSON.stringify(game('hard')))!.settings.difficulty, 'hard');
  assert.equal(M.difficultyOf({}), 'easy');
});

test('Easy keeps every current value', () => {
  const s = game('easy', 1);
  assert.equal(M.cropLevel(s, 'apple'), 3); assert.equal(M.cropXp(s, 'apple'), 400); assert.equal(M.sellPrice(s, 'apple'), 600);
  assert.equal(M.priceOf(s, 'chicken'), 25); assert.equal(M.priceOf(s, 'cow'), 70); assert.equal(M.priceOf(s, 'duck'), 220); assert.equal(M.priceOf(s, 'pig'), 380);
  assert.equal(M.kitchenOpen(s), true); s.bag.carrot = 1; assert.equal(M.cook(s, 'carrot'), true);
  const c = M.buyAnimal(game('easy'), 'chicken', T0)!; assert.equal(c.pace, undefined); assert.equal(M.productDuration(c), M.ANIMALS.chicken.productMs);
  assert.deepEqual(M.hardScale('easy'), { hp: 1, damage: 1 });
});

for (const d of ['normal', 'hard'] as const) test(`${d}: kitchen at level 14 (Pepper only gathers before), leaner later fruit trees, dearer slower livestock`, () => {
  // Kitchen
  const s = game(d, 13); s.bag.carrot = 4; s.bag.egg = 2;
  assert.equal(M.kitchenOpen(s), false); assert.equal(M.cook(s, 'carrot'), false); assert.equal(M.canCookDish(s, 'omelette'), false);
  const pepper: F.Friend = { id: 'pepper', role: 'cook', rescuedAt: 1, gear: {}, home: true }; s.friends = [pepper];
  assert.deepEqual(F.cookHalf(s, pepper, { carrot: 4 }), {}); assert.equal(s.bag.carrot, 4, 'nothing cooked, nothing carried');
  s.level = 14; assert.equal(M.cook(s, 'carrot'), true);
  // Fruit trees: apple L8, sells 150, 120 XP; the others by the same ratios, +5 levels (capped at 25).
  assert.equal(M.cropLevel(s, 'apple'), 8); assert.equal(M.sellPrice(s, 'apple'), 150); assert.equal(M.cropXp(s, 'apple'), 120);
  assert.equal(M.cropLevel(s, 'peach'), 23); assert.equal(M.sellPrice(s, 'peach'), 550); assert.equal(M.cropXp(s, 'peach'), 420);
  assert.equal(M.cropLevel(s, 'carrot'), 1); assert.equal(M.sellPrice(s, 'carrot'), M.ITEMS.carrot.sell, 'ordinary crops unchanged');
  const g = game(d, 7); assert.equal(M.plant(g, 0, 'apple', T0), false); g.level = 8; assert.equal(M.plant(g, 0, 'apple', T0), true);
  const xp = g.xp; assert.equal(M.harvest(g, 0, T0 + M.CROPS.apple.duration), 'apple'); assert.equal(g.xp - xp, d === 'hard' ? 138 : 120, 'Hard pays +15% XP');
  const e = g.energy; assert.equal(M.sell(g, 'apple'), 150); assert.equal(g.energy - e, 150);
  // Livestock
  const f = game(d); assert.equal(M.priceOf(f, 'chicken'), 60); assert.equal(M.priceOf(f, 'cow'), 120); assert.equal(M.priceOf(f, 'duck'), 370); assert.equal(M.priceOf(f, 'pig'), 650); assert.equal(M.priceOf(f, 'dog'), 450);
  const before = f.energy, hen = M.buyAnimal(f, 'chicken', T0)!; assert.equal(before - f.energy, 60);
  assert.equal(M.productDuration(hen), M.ANIMALS.chicken.productMs * 1.5);
  assert.equal(M.parseSave(JSON.stringify(f))!.farm.animals[0].pace, 1.5, 'the slower pace is saved with the animal');
});

test('only Hard makes creatures tougher (+25% health, +20% damage), bosses too, in the client world', () => {
  assert.deepEqual(M.hardScale('normal'), { hp: 1, damage: 1 }); assert.deepEqual(M.hardScale('hard'), { hp: 1.25, damage: 1.2 });
  const spawn = (d: M.Difficulty, type: string) => {
    const w = Object.assign(Object.create(World.prototype), { state: game(d), scene: new T.Scene(), root: new T.Group(), entities: [], enemies: [], obstacles: [], planet: 'home', time: 0 }) as World;
    w.environment = new EnvironmentSimulation(createEnvironmentLayout('home'));
    return w.spawnSpecies(type, 30, 0, 0)!;
  };
  for (const type of ['wolf', 'bear']) {
    const easy = spawn('easy', type), hard = spawn('hard', type);
    assert.ok(Math.abs(hard.maxHp / easy.maxHp - 1.25) < .01, type);
    assert.ok(Math.abs(hard.damage / easy.damage - 1.2) < 1e-9, type);
  }
});

test('switching difficulty mid-game changes prices for new purchases; owned animals keep their pace', () => {
  const s = game('easy'), old = M.buyAnimal(s, 'chicken', T0)!;
  assert.equal(M.priceOf(s, 'chicken'), 25);
  assert.equal(act(s, 'settings', { settings: { difficulty: 'normal' } }), true); assert.equal(s.settings.difficulty, 'normal');
  assert.equal(M.priceOf(s, 'chicken'), 60); assert.equal(M.productDuration(old), M.ANIMALS.chicken.productMs, 'the easy chicken is unaffected');
  assert.equal(act(s, 'settings', { settings: { difficulty: 'hard' } }), true); assert.equal(s.settings.difficulty, 'hard');
  act(s, 'settings', { settings: { difficulty: 'impossible' } }); assert.equal(s.settings.difficulty, 'hard', 'unknown values are ignored');
  act(s, 'settings', { settings: { difficulty: 'easy' } }); assert.equal(M.priceOf(s, 'chicken'), 25);
});
