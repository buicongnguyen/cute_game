import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSave } from '../src/model.ts';
import { PLANETS } from '../src/content.ts';

test('promo/save-late.json is a real mid/late-game save: chapter 4 under way, every planet, worn gear (FIX-PLAN 3.7)', () => {
  const s = parseSave(readFileSync(new URL('../promo/save-late.json', import.meta.url), 'utf8'))!;
  assert.ok(s, 'it parses');
  assert.ok(s.progression.story.index >= 15, `story step ${s.progression.story.index}`);
  assert.equal(s.visited.length, Object.keys(PLANETS).length);
  assert.ok(s.level >= 30 && s.gear.weapon && s.gear.outfit, 'levelled and geared');
  assert.equal(s.welcome, 'done');
});

test('the speed tool pins the hero on its spot while measuring (FIX-PLAN 3.8)', () => {
  const tool = readFileSync(new URL('../promo/perf-budget.mjs', import.meta.url), 'utf8');
  assert.match(tool, /__zoo\.pinHero\?\.\(\{ x, z \}\)/);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /if\(perfPin\)\{world\.position\.x=world\.player\.position\.x=perfPin\.x;world\.position\.z=world\.player\.position\.z=perfPin\.z;combatTimers\.invulnerable=/);
  assert.match(main, /pinHero:\(spot:\{x:number;z:number\}\|null\)=>\{perfPin=spot;\}/);
});
