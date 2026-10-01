import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { produceLots, sellProduce, defenseText, upgradeCards } from '../src/item-views.ts';

test('sell all produce & fish sells every crop, fish and junk stack and nothing else, like the reference', () => {
  const s = M.newGame();
  Object.assign(s.bag, { radish: 6, carrot: 1, fish_perch: 2, boot: 1, leather: 5, sword_tusk: 1, meat: 2 });
  const expected = 6 * M.ITEMS.radish.sell + M.ITEMS.carrot.sell + 2 * M.ITEMS.fish_perch.sell + M.ITEMS.boot.sell;
  const { lots, total } = produceLots(s);
  assert.deepEqual(lots.map(l => l.id).sort(), ['boot', 'carrot', 'fish_perch', 'radish']);
  assert.equal(total, expected);
  const energy = s.energy, sold = s.counters.sold;
  assert.equal(sellProduce(s), expected);
  assert.equal(s.energy, energy + expected);
  assert.deepEqual(Object.keys(s.bag).sort(), ['leather', 'meat', 'sword_tusk'], 'materials, food and gear stay');
  assert.ok(s.counters.sold >= sold, 'sales still count');
  assert.equal(produceLots(s).total, 0); assert.equal(sellProduce(s), 0);
});

test('every crop and fish can be sold at the market', () => {
  for (const [id, item] of Object.entries(M.ITEMS)) if (item.type === 'crop' || item.type === 'fish') assert.ok(item.sell > 0, `${id} sells`);
});

test('the crystal: cost curve ceil(base·1.38^level), crit capped at 28 with MAX, health heals +25 at once', () => {
  const s = M.newGame(); s.energy = 1e9;
  for (const [kind, base] of [['health', 12], ['attack', 15], ['defense', 14], ['crit', 18]] as const)
    for (let level = 0; level < 6; level++) { assert.equal(M.upgradeCost(s, kind), Math.ceil(base * 1.38 ** level)); M.upgrade(s, kind); }
  s.critUp = 27; let crit = upgradeCards(s).find(c => c.kind === 'crit')!;
  assert.equal(crit.max, false); assert.equal(crit.affordable, true);
  assert.equal(M.upgrade(s, 'crit'), true); assert.equal(s.critUp, 28);
  crit = upgradeCards(s).find(c => c.kind === 'crit')!;
  assert.equal(crit.max, true); assert.equal(crit.affordable, false);
  const energy = s.energy; assert.equal(M.upgrade(s, 'crit'), false); assert.equal(s.energy, energy, 'no charge at the cap');
  // Health: +25 maximum and +25 now (not a full heal).
  const h = M.newGame(); h.energy = 100; h.hp = 40; const max = M.maxHp(h);
  assert.equal(M.upgrade(h, 'health'), true); assert.equal(M.maxHp(h), max + 25); assert.equal(h.hp, 65);
  h.hp = M.maxHp(h) - 5; h.energy = 100; M.upgrade(h, 'health'); assert.equal(h.hp, M.maxHp(h) - 5, 'the +25 heal keeps pace with the +25 maximum');
});

test('each wish counts toward the upgrade quest', () => {
  const s = M.newGame(); s.energy = 1000; const before = s.counters.upgrades;
  M.upgrade(s, 'attack'); M.upgrade(s, 'defense');
  assert.equal(s.counters.upgrades, before + 2);
});

test('crystal cards read like the reference: level, "Now" value and gain; defence shows its damage cut', () => {
  assert.equal(defenseText(0), '0 (−0% damage)');
  assert.equal(defenseText(60), '60 (−50% damage)');
  assert.equal(defenseText(14), '14 (−19% damage)');
  const s = M.newGame(); s.energy = 13;
  const cards = upgradeCards(s);
  assert.deepEqual(cards.map(c => c.kind), ['health', 'attack', 'defense', 'crit']);
  const [hp, atk, def, crit] = cards;
  assert.equal(hp.level, 0); assert.equal(hp.now, String(M.maxHp(s))); assert.equal(hp.gain, '+25 max HP'); assert.equal(hp.cost, 12); assert.equal(hp.affordable, true);
  assert.equal(atk.affordable, false, 'unaffordable buttons are disabled');
  assert.match(atk.now, /^\d+\.\d$/, 'attack with one decimal');
  assert.equal(def.now, defenseText(M.activeStats(s).defense));
  assert.match(crit.now, /^\d+%$/);
});

test('the movement pad is off by default (the reference is tap-to-move only) and the choice survives a save', () => {
  const s = M.newGame();
  assert.equal(!!s.settings.movePad, false);
  assert.equal(!!M.parseSave(JSON.stringify(s))!.settings.movePad, false);
  s.settings.movePad = true;
  assert.equal(M.parseSave(JSON.stringify(s))!.settings.movePad, true);
});
