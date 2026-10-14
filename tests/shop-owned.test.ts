import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ITEMS } from '../src/content.ts';
import { ownedCopies, needsDuplicateConfirm } from '../src/shop-owned.ts';

const of = (slot: string) => Object.entries(ITEMS).find(([, i]) => (i as { slot?: string }).slot === slot)![0];
const empty = () => ({ bag: {} as Record<string, number>, chest: {} as Record<string, number>, gear: {} as Record<string, string> });

test('owned gear asks before a second copy; pets only after two; materials, food and seeds never (FIX-PLAN 3.4)', () => {
  const sword = of('weapon'), pet = of('pet'), seed = Object.entries(ITEMS).find(([, i]) => !(i as { slot?: string }).slot)![0];
  const s = empty();
  assert.equal(needsDuplicateConfirm(s, sword), false, 'first sword buys at once');
  s.bag[sword] = 1; assert.equal(needsDuplicateConfirm(s, sword), true);
  const chest = empty(); chest.chest[sword] = 1; assert.equal(needsDuplicateConfirm(chest, sword), true, 'a sword in the chest counts');
  const worn = empty(); worn.gear.weapon = sword; assert.equal(ownedCopies(worn, sword), 1);
  s.bag[pet] = 1; assert.equal(needsDuplicateConfirm(s, pet), false, 'a second pet fills the second pet slot');
  s.bag[pet] = 2; assert.equal(needsDuplicateConfirm(s, pet), true);
  s.bag[seed] = 40; assert.equal(needsDuplicateConfirm(s, seed), false);
});

test('the shop shows "Owned" and the buy button asks once more before spending', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /needsDuplicateConfirm\(state,id\)\?` <span class="owned-tag">/);
  assert.match(main, /case 'buy':if\(id&&needsDuplicateConfirm\(state,id\)&&button\.dataset\.sure!=='1'\)\{button\.dataset\.sure='1';[^\n]*break;\}/);
});
