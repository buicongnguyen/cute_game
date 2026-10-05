import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { ENEMY_TYPES } from '../src/enemy-types.ts';
import { BOSS_PETS } from '../src/boss-pet-content.ts';
import { FLYING_PETS } from '../src/pet-pen.ts';

const bosses = Object.entries(ENEMY_TYPES).filter(([, e]) => e.boss && !(e as { titan?: boolean }).titan).map(([k]) => k);
const titans = Object.entries(ENEMY_TYPES).filter(([, e]) => (e as { titan?: boolean }).titan).map(([k]) => k);
const petOf = (t: string) => t.startsWith('titan_') ? `pet_t_${t.slice(6)}` : `pet_b_${t}`;
const high = () => 0.99;

test('every regular boss has a Little <name> pet item and a drop entry', () => {
  assert.deepEqual([...bosses].sort(), Object.keys(BOSS_PETS).sort());
  for (const b of bosses) {
    const id = `pet_b_${b}`, item = M.ITEMS[id];
    assert.equal(item.name, `Little ${ENEMY_TYPES[b].name}`);
    assert.equal(item.slot, 'pet'); assert.equal(item.type, 'pet'); assert.ok(item.rare);
    assert.ok(item.sell >= 600 && item.sell <= 900);
    assert.ok(M.LOOT_TABLES[b].some(e => e[0] === id && e[1] === 0.1));
  }
  for (const f of ['frostowl', 'phoenix', 'dragon', 'shadowlord']) assert.ok(FLYING_PETS.includes(`pet_b_${f}`));
});

test('the first defeat guarantees the pet exactly once, later kills are a 10% chance', () => {
  for (const b of bosses) {
    const s = M.newGame();
    const first = M.grantDefeat(s, b, 1, true, high);
    assert.ok(first.some(l => l.id === petOf(b)), b);
    assert.equal(s.bag[petOf(b)], 1);
    const again = M.grantDefeat(s, b, 1, true, high);
    assert.ok(!again.some(l => l.id === petOf(b)), `${b} second kill, rng high`);
    const lucky = M.grantDefeat(s, b, 1, true, () => 0);
    assert.ok(lucky.some(l => l.id === petOf(b)));
  }
});

test('titans too, and never a duplicate of a pet already owned', () => {
  for (const t of titans) {
    const s = M.newGame();
    assert.ok(M.grantDefeat(s, t, 1, true, high).some(l => l.id === petOf(t)), t);
    const owned = M.newGame(); owned.chest[petOf(t)] = 1;
    assert.ok(!M.grantDefeat(owned, t, 1, true, high).some(l => l.id === petOf(t)));
  }
  for (const where of ['bag', 'chest', 'gear', 'collection'] as const) {
    const s = M.newGame(); const id = petOf(bosses[0]);
    if (where === 'gear') s.gear.pet = id; else (s[where] as Record<string, number>)[id] = 1;
    assert.ok(!M.grantDefeat(s, bosses[0], 1, true, high).some(l => l.id === id), where);
  }
});

test('first-defeat pet is deterministic and non-boss kills are unaffected', () => {
  const run = () => { let n = 1; const rng = () => (n = (n * 16807) % 2147483647) / 2147483647; const s = M.newGame(); return JSON.stringify([M.grantDefeat(s, 'bear', 5, true, rng), M.grantDefeat(s, 'bear', 5, true, rng)]); };
  assert.equal(run(), run());
  assert.ok(!M.grantDefeat(M.newGame(), 'slime', 1, false, high).some(l => l.id.startsWith('pet_')));
});
