import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Game from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { colossusMaxHp } from '../src/colossus-content.ts';
import { enemyRoster } from '../src/enemy-roster.ts';

test('the server shares the milestone, bag default, and online Colossus numbers', () => {
  const s = Game.newGame(); s.level = 29; s.xp = 0; s.energy = 0; s.hp = 0;
  // The server applies actions with the same gainXp / die the browser uses.
  Game.gainXp(s, Game.xpNeeded(29), Date.now(), 1); assert.equal(s.level, 30); assert.equal(s.energy, 15000);
  s.bag = { carrot: 2 }; assert.deepEqual(applyGameAction(s, { type: 'die', payload: { x: 1, z: 2 } }, { now: Date.now(), random: () => .5 }), { dropped: false });
  assert.equal(s.bag.carrot, 2, 'keep-my-bag is the default on the server too');
  assert.equal(colossusMaxHp(1), 3_000_000);
  const authority = readFileSync(new URL('../server/colossus-authority.mjs', import.meta.url), 'utf8');
  assert.ok(authority.includes('colossusMaxHp(Math.max(1,players))'), 'the server never uses the solo (one third) health');
  const combat = readFileSync(new URL('../server/combat-authority.mjs', import.meta.url), 'utf8');
  assert.ok(!combat.includes('creatureLevelScale'), 'the server roster is not level scaled');
  assert.ok(enemyRoster('home').every(e => e.baseMaxHp === Math.round(e.baseMaxHp)));
});
