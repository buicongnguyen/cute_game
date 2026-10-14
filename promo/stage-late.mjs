// Builds promo/save-late.json (FIX-PLAN 3.7): a representative mid/late-game explorer for screenshots and probes.
// promo/save.json stays as it is: tests (tests/support/insight-saves.ts, tests/hud-layout.test.mjs) and the speed
// baselines of promo/perf-budget.mjs depend on its exact contents. Use this one with SAVE_FILE=./save-late.json.
// Run: node --experimental-strip-types promo/stage-late.mjs
import * as M from '../src/model.ts';
import { ITEMS, PLANETS, STORY_STEPS } from '../src/content.ts';
import { readFileSync, writeFileSync } from 'node:fs';

const s = M.parseSave(readFileSync(new URL('./save.json', import.meta.url), 'utf8'));
const planets = Object.keys(PLANETS), level = 40;
// Chapter 4 (index 3) under way: three chapters done, the story at its first boss of chapter 4.
const step = STORY_STEPS.findIndex(x => x.chapter === 3);
s.progression.story = { index: step, progress: 0, event: STORY_STEPS[step].event };
s.quest = step;
s.visited = [...planets]; s.discovered = [...planets];
s.energy = 186_400; s.level = level;
s.healthUp = 12; s.attackUp = 12; s.defenseUp = 10; s.critUp = 8;
s.counters = { harvests: 1840, sold: 2210, bought: 64, equipped: 41, kills: 3120, upgrades: 42, fish: 260, skills: 900 };
// The strongest shop gear the level allows in every slot, plus a few spares and materials in the bag.
const best = slot => Object.entries(ITEMS).filter(([id, i]) => i.slot === slot && M.shopPrice(s, id) !== null && M.gearLevel(id) <= level && !M.isSpecial(id))
  .sort((a, b) => M.gearLevel(a[0]) - M.gearLevel(b[0]) || (M.shopPrice(s, a[0]) ?? 0) - (M.shopPrice(s, b[0]) ?? 0)).at(-1)?.[0];
for (const slot of ['weapon', 'hat', 'outfit', 'boots', 'pet']) { const id = best(slot); if (id) { s.bag[id] = 1; s.gear[slot] = id; } }
for (const id of ['potion', 'spore', 'claw', 'seed_fire', 'seed_ice']) if (ITEMS[id]) s.bag[id] = 12;
s.savedAt = Date.now();
const out = M.parseSave(JSON.stringify(s));
if (!out || out.progression.story.index !== step || out.visited.length !== planets.length) throw new Error('save-late does not round-trip');
writeFileSync(new URL('./save-late.json', import.meta.url), JSON.stringify(out));
console.log('save-late: level', out.level, 'story step', step, 'chapter', STORY_STEPS[step].chapter + 1, 'planets', out.visited.length, 'gear', JSON.stringify(out.gear));
