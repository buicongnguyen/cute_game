import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import * as F from '../src/friends.ts';
import * as D from '../src/difficulty.ts';
import { applyGameAction } from '../src/actions.ts';
import { penHtml, sitePenHtml, type FarmUi } from '../src/farm-ui.ts';
import { autoFeedNote } from '../src/farm-helper-ui.ts';
import { produceLots } from '../src/item-views.ts';
import { checker } from '../src/ground.ts';
import { mergeEars } from '../src/assets.ts';
import { FarmPenView } from '../src/farm-view.ts';
import { setLanguage, t } from '../src/i18n.ts';
import { VI_UI } from '../src/locales/vi-ui.ts';

// Wave 10 review fixes: one regression test (or more) per finding, numbered as in the review.
afterEach(() => setLanguage('en'));
const T0 = Date.UTC(2026, 9, 2, 12);
const DAY = 86_400_000;
const ui: FarmUi = { art: (_id, icon) => icon, esc: text => text, mini: id => `<i data-item="${id}"></i>`, chips: () => '', effect: () => '' };
function game(d: M.Difficulty = 'easy', level = 30) { const s = M.newGame(); s.level = level; s.energy = 100_000; s.farm.built = true; s.settings.difficulty = d; return s; }
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}, now = T0) => applyGameAction(s, { type, payload }, { now, random: () => .5 });
const ripe = (s: M.SaveState, crop: M.CropId, now: number) => { s.plots[0].crop = crop; s.plots[0].plantedAt = now - M.CROPS[crop].duration - 1; s.plots[0].growDuration = M.CROPS[crop].duration; };

// 1. HIGH: the chapter-2 "Cook three meals" step softlocked Normal/Hard (kitchen opens at level 14).
for (const d of M.DIFFICULTIES) test(`1. ${d}: every story step is doable at the level it is reached`, () => {
  let level = 1;
  P.STORY_STEPS.forEach((raw, i) => {
    const s = game(d, level); s.progression.story = { index: i, progress: 0 }; s.quest = i;
    const step = P.storyStep(i, s), where = `step ${i + 1} "${step.title}" at level ${level}`;
    if (step.event === 'cook') {
      assert.ok(M.kitchenOpen(s), `${where}: cooking needs an open kitchen`);
      s.bag.carrot = step.target; for (let n = 0; n < step.target; n++) assert.ok(M.cook(s, 'carrot'), where);
    } else if (step.event === 'harvest') {
      for (let n = 0; n < step.target; n++) { ripe(s, 'radish', T0); assert.ok(M.harvest(s, 0, T0), where); }
    } else if (step.event) P.recordEvent(s, step.event, step.target, undefined, T0);
    if (step.event) assert.equal(P.progressEntries(s, 'story', T0)[0].complete, true, `${where} completes by doing it`);
    if (raw.condition === 'level') level = Math.max(level, raw.target);
  });
});
test('1. the stand-in step: Normal shows "Harvest ten crops" until the kitchen opens, Easy keeps cooking', () => {
  const cook = P.STORY_STEPS.findIndex(s => s.event === 'cook');
  assert.equal(P.storyStep(cook, game('easy', 6)).event, 'cook');
  const s = game('normal', 6); assert.deepEqual([P.storyStep(cook, s).title, P.storyStep(cook, s).event, P.storyStep(cook, s).target], ['Harvest ten crops', 'harvest', 10]);
  s.level = 14; assert.equal(P.storyStep(cook, s).event, 'cook');
  setLanguage('vi'); assert.notEqual(t('Harvest ten crops'), 'Harvest ten crops');
});

// 2. HIGH: daily/weekly cook tasks (and the reroll) offered while the kitchen is locked.
test('2. cook tasks wait for the kitchen on Normal and Hard, in the rolls and in the reroll', () => {
  const seen = { easy: false, locked: false, open: false };
  for (let day = 0; day < 120; day++) for (const [d, level] of [['easy', 8], ['normal', 8], ['hard', 13], ['normal', 14]] as const) {
    const s = game(d, level); s.name = 'P' + day; const now = T0 + day * DAY; P.refreshProgress(s, now);
    const types = [...s.progression.daily.tasks, ...s.progression.weekly.tasks].map(x => x.type);
    for (let i = 0; i < 3; i++) { const c = structuredClone(s); if (P.rerollDaily(c, i, now)) types.push(c.progression.daily.tasks[i].type); }
    const cook = types.includes('cook');
    if (d === 'easy') seen.easy ||= cook; else if (level < 14) seen.locked ||= cook; else seen.open ||= cook;
  }
  assert.equal(seen.locked, false, 'never offered below the kitchen level'); assert.ok(seen.easy); assert.ok(seen.open);
});

// 3. HIGH: roasted fruit skipped the Normal tree price cut.
test('3. roasted fruit is priced from the difficulty-adjusted raw crop', () => {
  assert.equal(M.sellPrice(game('easy'), 'cooked_apple'), M.ITEMS.cooked_apple.sell);
  assert.equal(M.sellPrice(game('normal'), 'cooked_apple'), Math.round(2.2 * 150) + 2);
  assert.equal(M.sellPrice(game('normal'), 'cooked_carrot'), M.ITEMS.cooked_carrot.sell, 'non-tree food unchanged');
  const s = game('normal'); s.bag = { apple: 2, carrot: 3, cooked_apple: 1 }; const lots = produceLots(s);
  assert.equal(lots.total, 2 * 150 + 3 * M.ITEMS.carrot.sell); const before = s.energy; act(s, 'sell', { id: 'cooked_apple', count: 1 }); assert.equal(s.energy - before, 332);
});

// 4. MED: difficulty switching.
test('4. raising is free; lowering works once per 24 h; growing crops keep their planting difficulty', () => {
  const s = game('easy', 10);
  act(s, 'settings', { settings: { difficulty: 'hard' } }); assert.equal(M.difficultyOf(s), 'hard'); assert.equal(s.settings.difficultyLoweredAt, undefined);
  act(s, 'settings', { settings: { difficulty: 'normal' } }); assert.equal(M.difficultyOf(s), 'normal'); assert.equal(s.settings.difficultyLoweredAt, T0);
  assert.throws(() => act(s, 'settings', { settings: { difficulty: 'easy' } }, T0 + DAY - 1)); assert.equal(M.difficultyOf(s), 'normal');
  act(s, 'settings', { settings: { difficulty: 'hard' } }, T0 + 1000); assert.equal(M.difficultyOf(s), 'hard', 'raising stays free in the cooldown');
  act(s, 'settings', { settings: { difficulty: 'easy' } }, T0 + DAY); assert.equal(M.difficultyOf(s), 'easy');
  assert.equal(M.parseSave(JSON.stringify(s))!.settings.difficultyLoweredAt, T0 + DAY, 'the timestamp is saved');
  // A tree planted on Easy, harvested after raising to Normal: Easy XP and value.
  const g = game('easy', 10); assert.ok(M.plant(g, 0, 'apple', T0)); assert.equal(g.plots[0].difficulty, 'easy');
  assert.equal(M.parseSave(JSON.stringify(g))!.plots[0].difficulty, 'easy');
  act(g, 'settings', { settings: { difficulty: 'normal' } }); const xp = g.xp, level = g.level, energy = g.energy;
  assert.equal(M.harvest(g, 0, T0 + M.CROPS.apple.duration), 'apple');
  assert.ok(g.level > level || g.xp - xp === 400, 'Easy XP'); assert.equal(g.energy - energy, 600 - 150, 'the Easy price, paid as the gap at harvest');
  assert.equal(g.plots[0].difficulty, undefined);
  // Planted on Normal, harvested on Easy: the Normal XP.
  const h = game('normal', 10); M.plant(h, 0, 'apple', T0); h.settings.difficulty = 'easy'; const hx = h.xp; M.harvest(h, 0, T0 + M.CROPS.apple.duration); assert.equal(h.xp - hx, 120);
});
test('4. co-op: the settings note shows the host difficulty (source contract) and Vietnamese has it', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /Host difficulty: \{level\}/); assert.match(main, /world\.roomDifficulty&&world\.roomDifficulty!==M\.difficultyOf\(state\)/);
  for (const key of ['Host difficulty: {level}', 'Lower the difficulty?', 'Keep {level}', 'Lower to {level}', 'You can lower the difficulty again in {hours} h.']) assert.ok(VI_UI[key], key);
});

// 5. MED: pre-pen chips and the energy toast used the Easy animal prices.
test('5. the pen site lists the difficulty prices; the toast reads priceOf', () => {
  assert.match(sitePenHtml(game('normal', 1)), /Chick from level 2 · ϟ 60/); assert.match(sitePenHtml(game('easy', 1)), /Chick from level 2 · ϟ 25/);
  assert.match(readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), /You need \$\{M\.priceOf\(state,kind\)\} energy/);
});

// 6. MED: Feed buttons.
test('6. Feed never defaults to a valuable crop, confirms a losing feed, and skips young animals', () => {
  const s = game('easy', 10); s.bag = { apple: 2 }; const chick = M.buyAnimal(s, 'chicken', T0)!;
  assert.equal(M.playerFeedCrop(s), null);
  const adult = T0 + M.ANIMALS.chicken.growMs + 1;
  assert.equal(M.feedLoses(s, 'apple', chick, adult), true, 'an apple is worth more than a faster egg');
  s.bag.radish = 3; assert.equal(M.playerFeedCrop(s), 'radish');
  let html = penHtml(s, ui, T0); assert.match(html, /data-action="feed-animal" data-id="\d+" disabled/, 'Feed is off for a chick'); assert.doesNotMatch(html, /feed-all/);
  assert.equal(M.feedAll(s, T0), 0);
  html = penHtml(s, ui, adult); assert.match(html, /data-action="feed-all"/); assert.equal(M.feedAll(s, adult), 1);
  const none = game('easy', 10); none.bag = { apple: 1 }; M.buyAnimal(none, 'chicken', T0);
  html = penHtml(none, ui, adult); assert.match(html, /<option value="" selected>Pick a crop<\/option><option value="apple">/, 'any crop can still be picked');
  assert.match(penHtml(game('easy', 10), ui, T0), /a fed animal finishes its current wait twice as fast/);
  assert.match(readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), /M\.feedLoses\(state,choice,target\)\)\{feedConfirm/);
});

// 7. LOW: the auto-feed switch's text.
test('7. auto-feed says it feeds pigs and ducks when that pays off, and when nothing is worth feeding', () => {
  const s = game('easy', 10); M.buyAnimal(s, 'chicken', T0); s.bag.radish = 2;
  assert.match(autoFeedNote(s, false, T0), /^Feeds pigs and ducks from your bag when that pays off/);
  assert.match(autoFeedNote(s, true, T0), /Nothing worth feeding now\.$/); assert.doesNotMatch(autoFeedNote(s, false, T0), /Nothing/);
  setLanguage('vi'); assert.doesNotMatch(autoFeedNote(s, true, T0), /Feeds|Nothing/);
});

// 8. LOW: friends grew too fast.
test('8. only harvests and collects grow a friend, 30 a day at most', () => {
  const s = M.newGame(); s.level = 30; s.energy = 1e5; s.farm.built = true; s.planet = M.CAGES.clover.planet;
  M.grantDefeat(s, M.CAGES.clover.boss, 1, true, () => .5, false); assert.ok(F.rescue(s, 'clover', T0)); s.planet = 'home'; F.arriveHome(s, { x: 0, z: 5 });
  const f = s.friends![0]; f.autoFeed = true;
  const pig = M.buyAnimal(s, 'pig', T0)!; s.bag.radish = 9; const grown = T0 + M.ANIMALS.pig.growMs + 1;
  assert.ok(F.friendWork(s, 'clover', { kind: 'feed', uid: pig.uid }, grown)); assert.equal(f.jobs ?? 0, 0, 'feeding does not count');
  assert.equal(f.done, 1, 'feeding still shows in today\'s work');
  assert.ok(F.friendWork(s, 'clover', { kind: 'collect', uid: pig.uid }, grown + M.productDuration(pig))); assert.equal(f.jobs, 1, 'a collect counts');
  const g = M.newGame(); g.planet = M.CAGES.sprout.planet; g.level = 30; M.grantDefeat(g, M.CAGES.sprout.boss, 1, true, () => .5, false); F.rescue(g, 'sprout', T0); g.planet = 'home'; F.arriveHome(g, { x: 0, z: 5 });
  const sprout = g.friends![0]; g.bag.seed_star = 0;
  for (let i = 0; i < 3; i++) { g.plots[0].crop = null; F.friendWork(g, 'sprout', { kind: 'plant', index: 0 }, T0); }
  assert.equal(sprout.jobs ?? 0, 0, 'planting does not count');
  for (let i = 0; i < 45; i++) { ripe(g, 'radish', T0); assert.ok(F.friendWork(g, 'sprout', { kind: 'harvest', index: 0 }, T0)); }
  assert.equal(sprout.jobs, 30); assert.equal(sprout.done! >= 45, true);
  assert.equal(M.parseSave(JSON.stringify(g))!.friends![0].grew, 30, 'the daily count survives a reload');
});

// 9 + 10. The rename, and Hard's reward.
test('9/10. hardScale replaces creatureScale; Hard pays +15% XP and +15% drop chance', () => {
  assert.equal('creatureScale' in D, false); assert.deepEqual(D.hardScale('hard'), { hp: 1.25, damage: 1.2 });
  const e = game('easy', 1), h = game('hard', 1); M.gainXp(e, 10); M.gainXp(h, 10); assert.equal(h.xp, e.xp * 1.15);
  const [type, table] = Object.entries(M.LOOT_TABLES).find(([, rows]) => rows.some(r => r[1] < .5))!, [id, chance] = table.find(r => r[1] < .5)!;
  const rng = () => chance * 1.1; // between the base chance and the boosted one
  assert.equal(M.rollLoot(type, 0, rng).some(l => l.id === id), false);
  assert.equal(M.rollLoot(type, 0, rng, 1.15).some(l => l.id === id), true);
  assert.match(D.DIFFICULTY_NOTE.hard, /\+15% XP and drop chance/); assert.ok(VI_UI[D.DIFFICULTY_NOTE.hard]);
});

// 11. MED: a future date key froze dailies; clock forward and back must not re-pay.
test('11. clock to 2031 and back: dailies resume and nothing is claimable twice', () => {
  const s = game('easy', 10); P.refreshProgress(s, T0);
  const claimAll = (now: number) => { let n = 0; for (const kind of ['daily', 'weekly'] as const) { for (const task of (kind === 'daily' ? s.progression.daily : s.progression.weekly).tasks) task.progress = task.target; for (const e of P.progressEntries(s, kind, now)) if (P.claimProgress(s, kind, e.id, now)) n++; } return n; };
  assert.ok(claimAll(T0) > 0); assert.equal(claimAll(T0), 0);
  const future = Date.UTC(2031, 0, 5); assert.ok(claimAll(future) > 0, 'a real later date has its own lists');
  assert.equal(claimAll(T0), 0, 'back to today: nothing claimable twice');
  assert.equal(s.progression.daily.key, '2026-10-02', 'the future key is gone (no freeze)');
  P.refreshProgress(s, T0 + DAY); assert.equal(s.progression.daily.key, '2026-10-03'); assert.ok(claimAll(T0 + DAY) > 0, 'dailies resume the next day');
  // Bad key formats start over in normalize.
  const raw = JSON.parse(JSON.stringify(s.progression)); raw.daily.key = '9999'; raw.weekly.key = 'zzz'; raw.pass.season = '9999-99-99'; raw.login.day = 'x';
  const p = P.normalizeProgression(raw, s); assert.deepEqual([p.daily.key, p.weekly.key, p.pass.season, p.login.day], ['', '', '', '']);
});

// 14. LOW: the earless head geometry is kit geometry.
test('14. mergeEars marks the earless head shared, so disposing one explorer keeps it', () => {
  const colored = () => { const g = new T.BoxGeometry(); g.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3)); return g; };
  const hero = new T.Group(), head = new T.Group(), leaf = new T.Group(); head.name = 'head'; leaf.name = 'head-leaf';
  const mesh = new T.Mesh(colored(), new T.MeshStandardMaterial({ vertexColors: true })), original = mesh.geometry; head.add(mesh); leaf.add(new T.Mesh(colored(), new T.MeshStandardMaterial())); hero.add(head, leaf);
  mergeEars(hero); assert.notEqual(mesh.geometry, original); assert.equal(original.userData.sharedKit, true);
});

// 15. LOW: no getBoundingClientRect per frame for the discovery pill.
test('15. positionLabels computes the discovery pill rect from its left/top and cached size', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), body = main.slice(main.indexOf('function positionLabels(){'), main.indexOf('/** Sparkles, the XP number'));
  assert.doesNotMatch(body, /getBoundingClientRect/); assert.equal(body.split('offsetWidth').length, 2); assert.ok(body.includes('if(!discoverySize.w){discoverySize.w=discovery.offsetWidth'), 'measured only when the cache is empty'); assert.match(body, /clearOfHud\(pill,hudPanels\)/);
});

// 16. LOW: one checker texture for the toy planet.
test('16. the toy checker texture is cached', () => {
  const a = checker('#ff0000', '#00ff00'); assert.equal(checker('#ff0000', '#00ff00'), a); assert.equal(a.userData.sharedKit, true);
});

// 17. LOW: farm-view update allocates no player point per frame.
test('17. farm-view update reuses one scratch player point', () => {
  const s = game('easy', 10); M.buyAnimal(s, 'chicken', T0); const view = new FarmPenView() as unknown as { update: FarmPenView['update']; player: unknown };
  view.update(s.farm.animals, .1, 1, T0, { x: 1, z: 2 }); const first = view.player;
  view.update(s.farm.animals, .1, 2, T0 + 100, { x: 3, z: 4 }); assert.equal(view.player, first); assert.deepEqual(view.player, { x: 3, z: 4 });
  view.update(s.farm.animals, .1, 3, T0 + 200); assert.equal(view.player, null);
});

// 18. LOW: the sellProduce action sold crop and fish but the button counted junk too.
test('18. sellProduce sells exactly what the button totals (crop, fish and junk)', () => {
  const s = game('easy'); s.bag = { radish: 2, fish_perch: 1, boot: 3, honey: 1 }; const total = produceLots(s).total, before = s.energy;
  assert.equal(act(s, 'sellProduce'), total); assert.equal(s.energy - before, total); assert.equal(s.bag.boot, undefined); assert.equal(s.bag.honey, 1);
});
