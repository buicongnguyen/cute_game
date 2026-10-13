// The Village Almanac: its scores, next steps, product map, history, level reports, praise and Vietnamese.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, CROPS, RECIPES, PLANETS, FISH } from '../src/content.ts';
import * as M from '../src/model.ts';
import { recordEvent, refreshProgress, dailyChestEnergy } from '../src/progression.ts';
import { HISTORY_CAP, HISTORY_FIELDS, fieldOf, noteHistory, parseHistory, setHistoryScorer, snapshotOf } from '../src/insight-history.ts';
import { CHAPTERS, isItemNode, mappableItems, productGraph } from '../src/insight-graph.ts';
import { ADVENTURE, PRAISE_LINES, SCORE_IDS, STRENGTH, affordable, animalPerHour, bestCrop, bestUse, cropPerHour, isReportLevel, itemView, lockOf, nextSteps, praise, rawCookable, report, reportEarned, reportLevelAt, reportOffer, scoreList, scores, standouts, tierShare, trend, type Msg } from '../src/insight-rules.ts';
import { analysisHtml, mapHtml, reportHtml, say, trendHtml, type BookUi } from '../src/insight-pages.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { INSIGHT_VI } from '../src/locales/vi-insight.ts';
import { setLanguage, loadVietnamese, t } from '../src/i18n.ts';
import { NOW, fresh, midGame, promo } from './support/insight-saves.ts';
import { almanacPhrases } from './support/insight-phrases.ts';

const plain = (m: Msg | null | undefined) => m ? m.text.replace(/\{(\w+)\}/g, (_, k) => String(m.params?.[k])) : '';
const byId = (s: M.SaveState) => Object.fromEntries(scores(s, NOW).map(x => [x.id, x]));
const ui = (s: M.SaveState, used?: Set<string>): BookUi => ({ t: (text, params) => { used?.add(text); return params ? text.replace(/\{(\w+)\}/g, (_, k) => String(params[k])) : text; }, esc: x => x, art: (_, icon) => icon, state: s, now: NOW, lang: 'en' });

// ---- Scores
test('every score is a whole number from 0 to 100 with a reason, on every fixture save', () => {
  for (const s of [fresh(), midGame(), promo()]) {
    const list = scores(s, NOW);
    assert.deepEqual(list.map(x => x.id), [...SCORE_IDS]);
    for (const x of list) { assert.ok(Number.isInteger(x.score) && x.score >= 0 && x.score <= 100, `${x.id} ${x.score}`); assert.ok(x.reason.text.length > 0); assert.ok(plain(x.reason).length > 0 && !plain(x.reason).includes('undefined'), `${x.id}: ${plain(x.reason)}`);
      for (const [, share, weight] of x.parts) { assert.ok(Number.isFinite(share)); assert.ok(weight > 0); } }
    assert.deepEqual(scoreList(s).length, SCORE_IDS.length);
  }
});

test('the fixture saves score as worked out by hand', () => {
  const f = byId(fresh());
  assert.equal(f.garden.score, 9);          // 9 of 24 beds (25% x 9/24), nothing planted
  assert.equal(f.animals.open, false); assert.equal(f.animals.score, 0); assert.match(plain(f.animals.reason), /opens at level 2/);
  assert.equal(f.workshop.score, 0); assert.equal(f.fishing.score, 0); assert.equal(f.helpers.score, 0); assert.equal(f.habits.score, 0);
  assert.equal(f.savings.score, 100);       // no energy, nothing affordable
  assert.equal(f.exploring.score, 40);      // the one world open at level 1 is home
  const m = byId(midGame());
  // garden: 8/12 planted (35%), 12/24 beds (25%), crops: 6 carrots at 324/792 of golden corn and 2 pumpkins at 360/792 (25%), no upgrades
  assert.equal(m.garden.score, Math.round(35 * 8 / 12 + 25 * 12 / 24 + 25 * ((6 * 324 / 792 + 2 * 360 / 792) / 8)));
  assert.equal(m.animals.score, Math.round(20 + 40 * 3 / 15 + 20 * 2 / 6)); // built, 3 of 15, 2 of the 6 kinds open at level 14
  assert.equal(m.kitchen.score, Math.round(60 * 12 / 249));                  // 12 meals from 240 crops + 9 fish; all the stock is raw; no cook
  assert.equal(m.workshop.score, Math.round(35 * 2 / 5 + 25 * 5 / 14 + 20 * 4 / 5));
  assert.equal(m.helpers.score, Math.round(45 / 3 + 15 + 30 * 1 / 2));       // Sprout, the robot (paused)
  assert.match(plain(m.helpers.reason), /Garden robot is on pause/);
  assert.equal(m.savings.score, 10);        // more than six improvements affordable: 100 - 90
  assert.match(plain(m.garden.reason), /8 of 12 beds are growing; 4 are empty/);
  const p = byId(promo());
  assert.equal(p.savings.score, 0); assert.match(plain(p.garden.reason), /All 24 beds are growing/);
});

test('scores move the right way when the save improves', () => {
  const up = (change: (s: M.SaveState) => void, id: string, strict = true) => { const a = midGame(), b = midGame(); change(b); const before = byId(a)[id].score, after = byId(b)[id].score; assert.ok(strict ? after > before : after >= before, `${id}: ${before} -> ${after}`); };
  up(s => { for (const p of s.plots) if (!p.crop) Object.assign(p, { crop: 'goldcorn', plantedAt: NOW, growDuration: 1_500_000 }); }, 'garden');
  up(s => { s.plots.push({ crop: null, plantedAt: 0, x: 0, z: 9 }); }, 'garden', false);
  up(s => { for (const p of s.plots) p.level = 3; }, 'garden');
  up(s => { s.farm.animals.push({ uid: 9, kind: 'pig', bornAt: NOW, cycleAt: NOW, timerVersion: 2 }); }, 'animals');
  up(s => { s.progression.totals.cook = 200; }, 'kitchen');
  up(s => { delete s.bag.carrot; delete s.bag.fish_perch; }, 'kitchen');
  up(s => { s.bag.armor_leather = 1; s.gear.outfit = 'armor_leather'; }, 'workshop');
  up(s => { s.attackUp += 4; }, 'workshop');
  up(s => { s.progression.totals.fish = 60; }, 'fishing');
  up(s => { s.bag.rod_steady = 1; }, 'fishing');
  up(s => { s.fishRecords.fish_clown = 30; }, 'fishing');
  up(s => { s.visited.push('candy'); }, 'exploring');
  up(s => { s.bosses!.push('home:bear'); }, 'exploring');
  up(s => { s.helper!.paused = false; }, 'helpers');
  up(s => { s.friends!.push({ id: 'pepper', role: 'cook', rescuedAt: NOW, gear: {} }); }, 'helpers');
  up(s => { s.energy = 0; }, 'savings');
  up(s => { refreshProgress(s, NOW); s.progression.daily.tasks[0].claimed = true; }, 'habits');
  up(s => { s.progression.login = { day: new Date(NOW).toISOString().slice(0, 10), streak: 5 }; }, 'habits');
  // More saved energy never raises the savings score.
  let last = 101; for (const energy of [0, 20, 200, 2000, 20000, 2_000_000]) { const s = midGame(); s.energy = energy; const v = byId(s).savings.score; assert.ok(v <= last, `savings at ${energy}`); last = v; }
});

test('milestone shares follow the journal tiers; standouts never overlap and skip locked areas', () => {
  assert.equal(tierShare(0, [10, 50, 200]), 0); assert.equal(tierShare(10, [10, 50, 200]), 1 / 3); assert.equal(tierShare(30, [10, 50, 200]), 1.5 / 3); assert.equal(tierShare(999, [10, 50, 200]), 1);
  for (const s of [fresh(), midGame(), promo()]) { const list = scores(s, NOW), marks = standouts(list);
    assert.equal(marks.strong.length, 2); assert.equal(marks.weak.length, 2); assert.equal(new Set([...marks.strong, ...marks.weak]).size, 4);
    for (const id of [...marks.strong, ...marks.weak]) assert.ok(list.find(x => x.id === id)!.open);
    const lowestStrong = Math.min(...marks.strong.map(id => list.find(x => x.id === id)!.score)), highestWeak = Math.max(...marks.weak.map(id => list.find(x => x.id === id)!.score)); assert.ok(lowestStrong >= highestWeak); }
  assert.ok(!standouts(scores(fresh(), NOW)).weak.includes('animals'), 'a locked area is not a weak point');
});

// ---- Next steps
test('next steps on the mid-game save: exact numbers from the real prices and timers, ranked by gain', () => {
  const s = midGame(), steps = nextSteps(s, NOW), find = (id: string) => steps.find(x => x.id === id)!;
  // Golden corn (level 13): 330 energy per 1500 s = 792 an hour. A carrot bed makes 9 per 100 s = 324, a pumpkin bed 30 per 300 s = 360.
  assert.equal(cropPerHour(s, 'goldcorn'), 792); assert.equal(cropPerHour(s, 'carrot'), 324); assert.equal(bestCrop(s, false), 'goldcorn');
  assert.equal(find('plant').gain, 4 * 792); assert.equal(plain(find('plant').text), 'Planting Golden corn on your 4 empty beds would earn about 3168 energy an hour.');
  assert.equal(find('replant').gain, 6 * (792 - 324) + 2 * (792 - 360));
  // Cooking: 12 carrots at 22 - 9 and 3 perch at 20 - 9... read from the tables.
  const carrot = ITEMS.cooked_carrot.sell - ITEMS.carrot.sell, perch = ITEMS.cooked_fish_perch.sell - ITEMS.fish_perch.sell;
  assert.equal(carrot, 13); assert.equal(find('cook').gain, 12 * carrot + 3 * perch);
  assert.equal(plain(find('cook').text), `Cooking your 15 raw crops and fish before selling earns ${12 * carrot + 3 * perch} energy more (Carrot alone: 156).`);
  assert.deepEqual(rawCookable(s).lots.map(l => l.id), ['carrot', 'fish_perch']);
  // Six ripe carrot beds: 6 x 9.
  assert.equal(find('harvest').gain, 54); assert.match(plain(find('harvest').text), /^6 beds are ripe/);
  // Animals: each has made its 3 products in 30 minutes (2 chickens x 3 eggs x 6, a cow x 3 milk x 14).
  assert.equal(find('collect').gain, 2 * 3 * 6 + 3 * 14); assert.match(plain(find('collect').text), /9 products ready, worth 78 energy/);
  // A pig: a truffle (80) every 6 game hours = 6 minutes: 800 an hour, the best animal 900 energy can buy at level 14.
  assert.equal(animalPerHour(s, 'pig'), 800); assert.equal(find('animal').gain, 800); assert.match(plain(find('animal').text), /A pink pig costs 380 energy and gives garden truffle worth about 800 energy an hour/);
  // The bed upgrade: the pumpkin bed (360 an hour) beats a carrot bed (324); level 0 costs 120.
  assert.equal(find('bed-upgrade').gain, 360); assert.match(plain(find('bed-upgrade').text), /Pumpkin costs 120 energy/);
  // No energy figure: the paused robot, the cheapest crystal upgrade, the nearest unvisited world.
  assert.match(plain(find('helper').text), /^Garden robot is on pause/); assert.equal(find('helper').target, null);
  assert.match(plain(find('upgrade').text), /You can afford the Defense upgrade: 14 energy/);
  assert.match(plain(find('world').text), /^Candy Planet is open to you now/);
  assert.equal(steps.find(x => x.id === 'bed'), undefined, 'no new bed is advised while beds stand empty');
  assert.deepEqual(steps.map(x => x.id), ['replant', 'plant', 'animal', 'bed-upgrade', 'cook', 'collect', 'harvest', 'helper', 'upgrade', 'world']);
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i - 1].gain >= steps[i].gain);
  for (const step of steps) { assert.ok(SCORE_IDS.includes(step.area)); assert.equal(step.per === 'none', step.gain === 0); if (step.target) assert.ok(step.button); }
});

test('next steps on a new explorer and on the promo save', () => {
  const f = nextSteps(fresh(), NOW);
  assert.deepEqual(f.map(x => x.id), ['plant']); // carrots: 9 per 100 s on 9 beds
  assert.equal(f[0].gain, 9 * 324); assert.match(plain(f[0].text), /Planting Carrot on your 9 empty beds would earn about 2916 energy an hour/);
  const s = promo(), p = nextSteps(s, NOW), ripe = s.plots.filter(b => b.crop && M.cropProgress(b, NOW) >= 1);
  assert.equal(p[0].id, 'harvest'); assert.equal(p[0].gain, ripe.reduce((n, b) => n + ITEMS[b.crop!].sell, 0)); assert.equal(ripe.length, 24);
  assert.ok(p.some(x => x.id === 'upgrade') && p.some(x => x.id === 'world'));
  assert.ok(!p.some(x => x.id === 'plant' || x.id === 'cook'), 'nothing is empty and nothing is raw');
  // The daily chest is advised with the journal's own sum.
  const d = midGame(); refreshProgress(d, NOW); const daily = nextSteps(d, NOW).find(x => x.id === 'daily')!;
  assert.equal(daily.gain, dailyChestEnergy(14)); assert.deepEqual(daily.target, { journal: 'daily' }); assert.match(plain(daily.text), /3 more daily tasks/);
  // What cannot be bought is never advised.
  const poor = midGame(); poor.energy = 0; assert.deepEqual(affordable(poor), []); assert.ok(!nextSteps(poor, NOW).some(x => ['animal', 'bed-upgrade', 'upgrade', 'bed', 'pen'].includes(x.id)));
  for (const b of affordable(midGame())) assert.ok(b.cost <= 900);
});

// ---- The product map
test('the product map is built from real data: every edge and tile names an existing thing', () => {
  const g = productGraph();
  assert.deepEqual(g.chapters.map(c => c.id), CHAPTERS.map(c => c[0]));
  for (const id of g.nodes) if (isItemNode(id)) assert.ok(Object.hasOwn(ITEMS, id), `tile ${id}`); else assert.match(id, /^(energy|animal:(chicken|duck|cow|pig|goat|goose|dog))$/);
  for (const e of g.edges) for (const end of [e.from, e.to]) { if (isItemNode(end)) assert.ok(Object.hasOwn(ITEMS, end), `edge ${e.from} -> ${e.to}`); }
  for (const e of g.edges) assert.ok(Object.hasOwn(ITEMS, e.to), 'every edge ends at an item');
  for (const c of g.chapters) { assert.ok(c.groups.length > 0); for (const group of c.groups) { assert.ok(group.rows.length > 0, `${c.id}/${group.id}`); for (const row of group.rows) { assert.ok(row.columns.length >= 1 && row.columns.every(col => col.length > 0), row.id); } } }
  const rowIds = g.chapters.flatMap(c => c.groups.flatMap(x => x.rows.map(r => r.id))); assert.equal(new Set(rowIds).size, rowIds.length, 'row ids are unique');
});

test('no orphans: every recipe, dish, roast, crop, animal product and fish is on the map', () => {
  const g = productGraph(), rows = new Map(g.chapters.flatMap(c => c.groups.flatMap(x => x.rows.map(r => [r.id, r] as const))));
  RECIPES.forEach((r, i) => { const row = rows.get(`recipe:${i}`); assert.ok(row, `recipe ${i} ${r.result}`);
    assert.equal(row!.columns.at(-1)![0].id, r.result); const inputs = row!.columns[0];
    for (const [id, n] of Object.entries(r.materials)) assert.ok(inputs.some(c => c.id === id && (c.n ?? 1) === n), `${r.result} needs ${n} ${id}`);
    assert.equal(inputs.find(c => c.id === 'energy')?.n ?? 0, r.energy);
    assert.ok(g.sources.get(r.result)!.some(s => s.kind === 'recipe' && s.index === i)); });
  for (const dish of M.FARM_DISHES) { const row = rows.get(`dish:${dish.id}`)!; assert.deepEqual(Object.fromEntries(row.columns[0].map(c => [c.id, c.n ?? 1])), dish.materials); }
  for (const id of Object.keys(ITEMS).filter(x => ITEMS[x].cooked)) { assert.ok(g.nodes.has(id), id); assert.ok(g.edges.some(e => e.kind === 'roast' && e.from === ITEMS[id].base && e.to === id)); }
  for (const [id, crop] of Object.entries(CROPS)) { const row = rows.get(`grow:${id}`)!; assert.ok(row.columns.some(col => col[0].id === id)); if (crop.seed) assert.equal(row.columns[0][0].id, crop.seed); }
  for (const kind of M.ANIMAL_KINDS.filter(k => k !== 'dog')) assert.equal(rows.get(`animal:${kind}`)!.columns[1][0].id, M.ANIMALS[kind].product);
  for (const id of Object.keys(FISH)) assert.ok(g.nodes.has(id) && g.sources.get(id)!.length > 0, id);
  // The chapters cover everything a player can sell or cook.
  assert.deepEqual(mappableItems().filter(id => !g.nodes.has(id)), []);
  assert.ok(mappableItems().length > 250);
  // "Only here" really is: every such item has no source on another world.
  for (const planet of Object.keys(PLANETS)) for (const cell of rows.get(`only:${planet}`)?.columns[0] ?? []) for (const src of g.sources.get(cell.id) ?? []) { if (src.kind === 'drop') assert.ok(src.planets.every(p => p === planet), `${cell.id} on ${planet}`); if (src.kind === 'mine') assert.equal(src.planet, planet); }
});

test('an item card: where it comes from, how to meet it, and the best use with its numbers', () => {
  const s = midGame();
  assert.equal(plain(bestUse(s, 'carrot')), 'Roast before selling: 9 becomes 22 energy each, 156 more for your 12.');
  assert.equal(plain(bestUse(s, 'egg')), 'Cook omelette: it sells for 6 energy more than its ingredients, and it carries a buff.'); // 18 against 2 x 6
  assert.equal(plain(bestUse(s, 'leather')), 'You have enough for bunny hat: 2 needed, 5 in store.');
  assert.equal(plain(bestUse(s, 'sword_wood')), 'You are wearing it. The upgrade bench makes it stronger.');
  assert.equal(plain(bestUse(s, 'radish')), 'Grow it: one sells for 12 energy, 28 roasted.');
  s.bag.seed_fire = 2; assert.match(plain(bestUse(s, 'seed_fire')), /^Keep it: at level 15 it grows Dragon fruit, worth 210 energy each/);
  s.level = 15; assert.match(plain(bestUse(s, 'seed_fire')), /^Plant it: one Dragon fruit sells for 210 energy/);
  s.bag.boot = 3; assert.equal(plain(bestUse(s, 'boot')), `Nothing needs it right now: your 3 sell for ${3 * ITEMS.boot.sell} energy.`);
  const f = fresh();
  assert.equal(plain(lockOf(f, 'pumpkin')), 'Level 2'); assert.equal(plain(lockOf(f, 'egg')), 'Level 2'); assert.equal(lockOf(f, 'carrot'), null);
  assert.equal(plain(lockOf(f, 'pearl')), 'Ocean Planet, level 12'); assert.equal(plain(lockOf(midGame(), 'pearl')), 'Ocean Planet');
  const view = itemView(midGame(), 'leather')!; assert.equal(view.bag, 5); assert.equal(view.known, true); assert.equal(view.lock, null); assert.ok(view.from.length >= 1 && view.from.length <= 4);
  assert.match(plain(view.from[0]), /^Dropped by .* on Clover Village/); // a world already visited comes first
  assert.equal(itemView(f, 'egg')!.known, false); assert.equal(plain(itemView(f, 'carrot')!.from[0]), 'Grown in the garden from level 1. Its seeds are free.');
  assert.equal(itemView(f, 'no-such-item'), null);
  for (const id of mappableItems()) { const v = itemView(s, id)!; assert.ok(v.from.length > 0, `${id} has a source line`); for (const line of [...v.from, v.best, v.lock]) assert.ok(!plain(line).includes('undefined'), `${id}: ${plain(line)}`); }
});

// ---- History
test('history: a snapshot per level-up and per new day, written by the shared rules', () => {
  const s = M.newGame('Mai'); assert.equal(s.history, undefined);
  recordEvent(s, 'harvest', 3, undefined, NOW);                       // the first action of a day
  assert.equal(s.history!.length, 1); assert.equal(s.history![0].k, 'day'); assert.equal(s.history![0].l, 1); assert.equal(fieldOf(s.history![0], 'harvest'), 0, 'taken before the day\'s work');
  recordEvent(s, 'harvest', 2, undefined, NOW + 60_000); assert.equal(s.history!.length, 1, 'one per day');
  M.gainXp(s, M.xpNeeded(1) + 1, NOW + 120_000); assert.equal(s.level, 2);
  assert.equal(s.history!.length, 2); assert.deepEqual([s.history![1].k, s.history![1].l, fieldOf(s.history![1], 'harvest'), fieldOf(s.history![1], 'beds')], ['level', 2, 5, 9]);
  M.gainXp(s, 1, NOW + 130_000); assert.equal(s.history!.length, 2, 'no level, no snapshot');
  // A new day on which nothing changed since the last note only moves that note's time.
  recordEvent(s, 'sell', 40, undefined, NOW + 86_400_000 + 5); assert.equal(s.history!.length, 2); assert.equal(s.history![1].t, NOW + 86_400_000 + 5); assert.equal(s.history![1].k, 'level');
  recordEvent(s, 'sell', 1, undefined, NOW + 3 * 86_400_000); assert.equal(s.history!.length, 3); assert.equal(s.history![2].k, 'day'); assert.equal(fieldOf(s.history![2], 'sell'), 40);
  const quiet = structuredClone(s); refreshProgress(quiet, NOW + 4 * 86_400_000); assert.equal(quiet.history!.length, 4);
  refreshProgress(quiet, NOW + 5 * 86_400_000); assert.equal(quiet.history!.length, 4); assert.equal(quiet.history![3].t, NOW + 5 * 86_400_000);
  assert.deepEqual(snapshotOf(s, 'day', NOW).n.length, HISTORY_FIELDS.length);
});

test('history: capped at 30, future notes dropped, scores only when the Almanac is loaded', () => {
  const s = midGame();
  for (let i = 0; i < 45; i++) { s.level++; noteHistory(s, 'level', NOW + i * 1000); }
  assert.equal(s.history!.length, HISTORY_CAP); assert.equal(s.history![0].l, 14 + 16); assert.equal(s.history!.at(-1)!.l, 14 + 45);
  assert.equal(s.history!.at(-1)!.s, undefined, 'the shared rules alone store no scores');
  setHistoryScorer(scoreList); try { noteHistory(s, 'level', NOW + 50_000); assert.equal(s.history!.at(-1)!.s!.length, SCORE_IDS.length); for (const v of s.history!.at(-1)!.s!) assert.ok(Number.isInteger(v) && v >= 0 && v <= 100); } finally { setHistoryScorer(null); }
  noteHistory(s, 'level', NOW + 10_000); assert.ok(s.history!.every(p => p.t <= NOW + 10_000), 'notes from a wound-forward clock are dropped');
  noteHistory(s, 'level', NaN); noteHistory(s, 'level', -5); assert.ok(s.history!.every(p => Number.isFinite(p.t) && p.t >= 0));
});

test('history: old saves start empty, a round trip keeps it, and bad data is cleaned (the server parses with the same function)', () => {
  const old = JSON.parse(JSON.stringify(midGame())); delete old.history;
  assert.equal(M.parseSave(JSON.stringify(old))!.history, undefined, 'an old save has no history yet');
  const s = midGame(); noteHistory(s, 'level', NOW); s.level = 15; s.progression.totals.sell = 9000; noteHistory(s, 'level', NOW + 1000);
  const back = M.parseSave(JSON.stringify(s))!; assert.deepEqual(back.history, s.history);
  assert.deepEqual(M.parseSave(JSON.stringify(back))!.history, s.history, 'stable over a second trip');
  const dirty = JSON.parse(JSON.stringify(s));
  dirty.history = [null, 5, 'x', { t: 'soon', l: 3, e: 1, k: 'level', n: [] }, { t: 5, l: 0, e: 1, k: 'level', n: [] }, { t: 5, l: 2, e: -4, k: 'week', n: [] }, { t: 9, l: 4.7, e: 12.9, k: 'day', n: [1, -2, 'a', 1e400, 3.9], s: [50, 500, -1, 'x'], extra: '<script>' }, ...Array.from({ length: 40 }, (_, i) => ({ t: 100 + i, l: 5, e: 0, k: 'level', n: [] }))];
  const cleaned = M.parseSave(JSON.stringify(dirty))!.history!;
  assert.equal(cleaned.length, HISTORY_CAP); assert.ok(cleaned.every(p => p.n.length === HISTORY_FIELDS.length && p.n.every(v => Number.isSafeInteger(v) && v >= 0)));
  assert.deepEqual(parseHistory([dirty.history[6]]), [{ t: 9, l: 4, e: 12, k: 'day', n: [1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0], s: [50, 100, 0, 0] }]);
  assert.deepEqual(parseHistory('nope'), []); assert.deepEqual(parseHistory({ length: 3 }), []);
  assert.ok(JSON.stringify(Array.from({ length: 30 }, () => snapshotOf(promo(), 'level', NOW))).length < 4000, 'thirty notes stay small');
});

// ---- Trend
test('trend: needs two points, reads the income honestly, and always ends at this moment', () => {
  const s = midGame(); let tr = trend(s, NOW);
  assert.equal(tr.enough, false); assert.match(plain(tr.reading), /only just started keeping notes/); assert.equal(tr.points.length, 1);
  s.history = [];
  const at = (level: number, sell: number, harvest: number) => { const p = midGame(); p.level = level; p.progression.totals.sell = sell; p.progression.totals.harvest = harvest; noteHistory(Object.assign(p, { history: s.history }), 'level', NOW - (20 - level) * 1000); };
  at(4, 100, 20); at(9, 600, 90);
  tr = trend(s, NOW);
  assert.equal(tr.enough, true); assert.equal(tr.points.length, 3); assert.equal(tr.points.at(-1)!.l, 14);
  assert.deepEqual(tr.lines[0].values, [100, 600, 5200]); assert.equal(tr.lines[0].key, 'sell');
  // 500 energy over levels 4-9 (100 a level), then 4,600 over levels 9-14 (920 a level): 9.2 times.
  assert.equal(plain(tr.reading), 'Your market income per level grew 9.2 times since level 4. The village feels it.');
  assert.ok(tr.lines.some(l => l.key === 'harvest' && l.first === 20 && l.last === 240));
  const flat = midGame(); flat.history = [snapshotOf(flat, 'level', NOW - 5000)]; flat.history[0].l = 12;
  assert.match(plain(trend(flat, NOW).reading), /A quiet stretch since level 12: the market is your next adventure/);
  flat.progression.totals.sell += 300; assert.equal(plain(trend(flat, NOW).reading), 'Since level 12 you brought 300 energy home from the market.');
});

// ---- Level reports
test('report levels: 3, then every fifth; the card is offered once and only in a calm moment', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10, 12, 15, 41, 45].filter(isReportLevel), [3, 5, 10, 15, 45]);
  assert.deepEqual([1, 2, 3, 4, 5, 9, 10, 14, 41].map(reportLevelAt), [0, 0, 3, 3, 5, 5, 10, 10, 40]);
  assert.equal(reportEarned(2, 3), 3); assert.equal(reportEarned(3, 4), 0); assert.equal(reportEarned(4, 5), 5); assert.equal(reportEarned(2, 11), 10, 'several levels at once: the highest card'); assert.equal(reportEarned(10, 14), 0);
  // Never during a fight, a mode or an open panel: the caller's `calm` says so, and the card waits.
  assert.equal(reportOffer({ level: 10, seen: 5, calm: false }), 0);
  assert.equal(reportOffer({ level: 10, seen: 5, calm: true }), 10);
  assert.equal(reportOffer({ level: 12, seen: 5, calm: true }), 10, 'it is still offered a few levels later');
  assert.equal(reportOffer({ level: 10, seen: 10, calm: true }), 0, 'once');
  assert.equal(reportOffer({ level: 2, seen: 0, calm: true }), 0);
});

test('the report card: what grew since the last card, one strength, one next adventure with a tip, and what the village gained', () => {
  assert.equal(report(fresh(), NOW), null);
  const s = midGame(), first = report(s, NOW)!;
  assert.equal(first.level, 10); assert.equal(first.since, 0, 'no notes yet: everything so far');
  assert.deepEqual(first.grew.map(g => [g.key, g.from, g.to]), [['harvest', 0, 240], ['sell', 0, 5200], ['cook', 0, 12], ['fish', 0, 9]]);
  assert.equal(plain(first.village), '240 more crops reached the market stall: the whole village eats from your garden.');
  assert.ok(first.strong && first.weak && first.strong.id !== first.weak.id); assert.ok(first.strong!.score >= first.weak!.score);
  assert.ok(first.tip); assert.ok(plain(first.praise).length > 0);
  // With a note from level 5, the card counts from there.
  const five = midGame(); five.level = 5; Object.assign(five.progression.totals, { harvest: 40, sell: 700, cook: 0, fish: 9 }); s.history = [snapshotOf(five, 'level', NOW - 9000)];
  const second = report(s, NOW)!; assert.equal(second.since, 5);
  assert.deepEqual(second.grew.map(g => [g.key, g.from, g.to]), [['harvest', 40, 240], ['sell', 700, 5200], ['cook', 0, 12]]);
  assert.equal(plain(second.village), '200 more crops reached the market stall: the whole village eats from your garden.');
  // The tip belongs to the weak area when there is one for it.
  if (nextSteps(s, NOW).some(step => step.area === second.weak!.id)) assert.equal(second.tip!.area, second.weak!.id);
  assert.equal(report(promo(), NOW)!.level, 40);
});

// ---- Praise
test('praise is never empty, never ignores the numbers, and is the same every time for the same save and page', () => {
  for (const s of [fresh(), midGame(), promo()]) for (const page of ['home', 'map-garden', 'map-worlds', 'trend', 'report-10']) for (const area of [undefined, ...SCORE_IDS]) {
    const a = praise(s, page, area), b = praise(structuredClone(s), page, area); assert.deepEqual(a, b);
    const text = plain(a); assert.ok(text.length > 20 && !text.includes('undefined') && !/\{\w+\}/.test(text), text);
    assert.ok(/\d/.test(text) || /Sprout|Clover|Pepper/.test(text), `a real number or name: ${text}`);
    assert.ok(PRAISE_LINES.includes(a.text), a.text);
  }
  // A new explorer is praised for what is true of them.
  assert.match(plain(praise(fresh(), 'home')), /9 (garden )?beds/); assert.match(plain(praise(fresh(), 'home')), /level 1/i);
  // A deed that never happened is never praised.
  const s = midGame(); s.progression.totals = { harvest: 240 }; s.friends = []; s.farm.animals = []; s.plots.forEach(p => { p.crop = null; }); s.visited = ['home'];
  for (const page of ['a', 'b', 'c', 'd', 'e', 'f']) assert.match(plain(praise(s, page)), /240 crops/);
  assert.match(plain(praise(midGame(), 'x', 'garden')), /240 crops|8 of your 12 beds|8 beds/);
  // Pages vary: across many pages a seasoned explorer hears more than one line.
  assert.ok(new Set(Array.from({ length: 12 }, (_, i) => praise(midGame(), `page-${i}`).text)).size >= 3);
  assert.ok(PRAISE_LINES.length >= 24);
  // Every line names who is glad of it.
  for (const line of PRAISE_LINES) assert.match(line, /village|family|cottage|neighbour|helpers|animals|pen|children|bees|garden|workshop|door/i, line);
  // Weak points are worded as adventures, never as failures.
  for (const line of Object.values(ADVENTURE)) { assert.match(line, /next adventure/); assert.doesNotMatch(line, /fail|bad|poor|weak|wrong|lazy|behind/i); }
  for (const id of SCORE_IDS) assert.ok(STRENGTH[id] && ADVENTURE[id]);
});

// ---- Pages and Vietnamese
test('the pages render on every fixture save: charts carry text, nodes are buttons with labels, nothing is undefined', () => {
  for (const s of [fresh(), midGame(), promo()]) {
    const u = ui(s), home = analysisHtml(u);
    assert.match(home, /class="ins-praise"/); assert.match(home, /role="list"/); assert.equal((home.match(/class="ins-bar /g) ?? []).length, 9);
    assert.equal((home.match(/<em>strong<\/em>/g) ?? []).length, 2); assert.equal((home.match(/<em>next adventure<\/em>/g) ?? []).length, 2);
    assert.ok((home.match(/class="ins-rank"/g) ?? []).length <= 3);
    for (const [id] of CHAPTERS) { const html = mapHtml(u, id, null, new Set(productGraph().chapters.find(c => c.id === id)!.groups.map(g => g.id)));
      assert.ok(!html.includes('undefined') && !html.includes('NaN'), id); assert.match(html, /data-insight="node"/); assert.match(html, /aria-label="[^"]+, (\d+ in store|met before|not met yet)/); }
    for (const html of [home, trendHtml(u), reportHtml(u)]) assert.ok(!html.includes('undefined') && !html.includes('NaN') && !/\{\w+\}/.test(html));
  }
  const m = ui(midGame()), garden = mapHtml(m, 'garden', { row: 'grow:carrot', id: 'carrot' }, null);
  assert.match(garden, /class="ins-detail"/); assert.match(garden, /Roast before selling: 9 becomes 22 energy each, 156 more for your 12\./); assert.match(garden, /aria-expanded="true"/);
  assert.match(garden, /class="ins-node have[^"]*" data-insight="node" data-id="carrot"/); assert.match(garden, /class="ins-node unknown" data-insight="node" data-id="cooked_radish"/);
  assert.match(mapHtml(ui(fresh()), 'garden', null, null), /🔒 Level 2/);
  const withNotes = midGame(); const five = midGame(); five.level = 5; five.progression.totals.sell = 700; withNotes.history = [snapshotOf(five, 'level', NOW - 9000)];
  assert.match(trendHtml(ui(withNotes)), /role="img" aria-label="Energy earned at the market: from 700 to 5,200"/);
  assert.match(reportHtml(ui(withNotes)), /Level 10 report card/); assert.match(reportHtml(ui(fresh())), /first report card comes at level 3/);
  assert.match(analysisHtml(m), /data-insight="step" data-go="plot"/);
});

test('Vietnamese: every phrase the Almanac can show has a translation with the same placeholders', async () => {
  const phrases = almanacPhrases(); assert.ok(phrases.length > 300, `${phrases.length} phrases found`);
  assert.deepEqual(phrases.filter(text => !VI_PACK[text]), []);
  // Whatever the pages actually asked for on the fixture saves is covered too (item, crop, place and creature names included).
  const used = new Set<string>();
  for (const s of [fresh(), midGame(), promo()]) { const u = ui(s, used); analysisHtml(u); trendHtml(u); reportHtml(u);
    for (const c of productGraph().chapters) { mapHtml(u, c.id, null, new Set(c.groups.map(g => g.id))); for (const g of c.groups) for (const r of g.rows) for (const col of r.columns) for (const cell of col) mapHtml(u, c.id, { row: r.id, id: cell.id }, null); } }
  assert.deepEqual([...used].filter(text => !VI_PACK[text] && !/^(\{\w+\}|[\d\s×·+%.ϟ→-])*$/.test(text)), []);
  for (const [en, vi] of Object.entries(INSIGHT_VI)) assert.deepEqual([...vi.matchAll(/\{(\w+)\}/g)].map(x => x[1]).sort(), [...en.matchAll(/\{(\w+)\}/g)].map(x => x[1]).sort(), en);
  await loadVietnamese(); setLanguage('vi');
  try { const u: BookUi = { ...ui(midGame()), t, lang: 'vi' };
    assert.equal(say(u, { text: 'A {animal} costs {cost} energy and gives {product} worth about {gain} energy an hour.', params: { animal: 'pink pig', cost: 380, product: 'garden truffle', gain: 12800 }, names: ['animal', 'product'] }), `Một con ${t('Pink pig').toLowerCase()} giá 380 năng lượng và cho ${t('Garden truffle').toLowerCase()} trị giá khoảng 12.800 năng lượng mỗi giờ.`);
    const home = analysisHtml(u); assert.match(home, /Nên làm gì tiếp theo/); assert.doesNotMatch(home, /What to do next|next adventure|energy an hour/);
  } finally { setLanguage('en'); }
});
