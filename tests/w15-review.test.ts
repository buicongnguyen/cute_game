// Wave 15 review fixes: one test (or more) per finding, numbered as in the review.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import * as H from '../src/helper.ts';
import * as F from '../src/friends.ts';
import * as X from '../src/tester.ts';
import { applyGameAction } from '../src/actions.ts';
import { FISH_PER_WATER } from '../src/fishing.ts';
import { FishingView, type PondView } from '../src/fishing-view.ts';
import { FishHuntingView } from '../src/fish-hunting-view.ts';
import { huntingPonds, fishHuntTarget, fishHuntTargets, fishHuntKey, huntFish, parseHunting, huntCatches, FISH_HUNT_RESTOCK_MS, FISH_HUNT_COOLDOWN_MS } from '../src/fish-hunting.ts';
import { useActivity, cooldownLeft, parseHouse, collectionLog, collectibleItems, STAMP_SKEW_MS } from '../src/house-activities.ts';
import { buffText } from '../src/house-life.ts';
import { produceLots, sellProduce } from '../src/item-views.ts';
import { deliversToChest, storeGains, takeFromChest, potItems, CATCH_UP_IDLE_MS } from '../src/delivery.ts';
import { ContextGearSelection } from '../src/context-gear.ts';
import { HouseView } from '../src/house-view.ts';
import { walkable } from '../src/house.ts';
import { HANGOUTS } from '../src/house-activities.ts';
import { lateArtParts, LateArtQueue, HOUSE_FILE } from '../src/late-art.ts';
import { HERO_FILE, KIT_FILES, REFINED_ASSET_FILES, KitLibrary } from '../src/assets.ts';
import { creatureArt } from '../src/creature-art.ts';
import { wakeArt } from '../src/art-retry.ts';
import { World } from '../src/world.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { TITANS } from '../src/titan-content.ts';
import { VI_FIXES } from '../src/locales/vi-fixes.ts';
import { t, setLanguage } from '../src/i18n.ts';

const T0 = Date.parse('2026-10-02T10:00:00Z'), MIN = 60_000, DAY = 86_400_000;
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}, now = T0) => applyGameAction(s, { type, payload }, { now, random: () => .5 });
const src = (file: string) => readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');

// ---- 1. CRITICAL: the harpoon farmed legendary fish -------------------------------------------------------------
test('1. a caught harpoon slot restocks after 90 s with a newly rolled species, the same on client and server', () => {
  assert.equal(FISH_HUNT_RESTOCK_MS, 90_000);
  const pond = huntingPonds('home')[1], s = M.newGame(); s.level = 10; s.bag.harpoon = 1; s.gear.weapon = 'harpoon';
  const shore = { x: pond.x, z: pond.z + pond.rz + .6 }, key = fishHuntKey(pond.id, 0);
  // The slot nearest the shore, so the throw is in reach.
  const slot = fishHuntTargets(pond, T0).sort((a, b) => Math.hypot(a.x - shore.x, a.z - shore.z) - Math.hypot(b.x - shore.x, b.z - shore.z))[0].slot, k = fishHuntKey(pond.id, slot);
  const before = fishHuntTarget(pond, slot, T0, s.hunting)!, r = huntFish(s, { weaponId: 'harpoon', pondId: pond.id, slot, aim: before }, shore, T0)!;
  assert.equal(r.hit, true); assert.equal(r.id, before.id); assert.equal(huntCatches(s.hunting, k), 1); assert.equal(s.hunting!.readyAt[k], T0 + 90_000);
  // The server derives the same next fish from the same save (no client claim): seeded by key and catch count.
  const next = fishHuntTarget(pond, slot, T0 + 90_000, s.hunting)!, again = M.parseSave(JSON.stringify(s))!;
  assert.deepEqual(fishHuntTarget(pond, slot, T0 + 90_000, again.hunting), next, 'the catch count survives a reload');
  assert.equal(huntFish(s, { weaponId: 'harpoon', pondId: pond.id, slot, aim: next }, shore, T0 + 89_999), null, 'still restocking');
  assert.equal(key === k || huntCatches(s.hunting, key) === 0, true);
  // Over many restocks a slot shows several species, never a legendary fish.
  const seen = new Set<string>(); for (let n = 0; n < 200; n++) seen.add(fishHuntTarget(pond, slot, T0, { caught: { [k]: n } })!.id);
  assert.ok(seen.size >= 4, `species rolled: ${[...seen]}`);
});

test('1. no harpoon slot on any pond ever stocks a legendary fish; junk counts are rejected on load', () => {
  for (const planet of ['home', 'candy', 'ice', 'toy', 'jungle', 'shadow']) for (const pond of huntingPonds(planet))
    for (let slot = 0; slot < (FISH_PER_WATER[pond.waterId] ?? 0); slot++) for (let n = 0; n < 60; n++) {
      const id = fishHuntTarget(pond, slot, T0, { caught: { [fishHuntKey(pond.id, slot)]: n } })!.id;
      assert.notEqual(M.FISH[id].rarity, 'legendary', `${pond.id}:${slot}:${n} ${id}`);
    }
  const key = fishHuntKey('home:fish:1', 2);
  assert.deepEqual(parseHunting({ lastShotAt: 0, readyAt: {}, caught: { [key]: 7, 'home:fish:1:99': 3, [fishHuntKey('home:fish:1', 3)]: -1, [fishHuntKey('home:fish:1', 4)]: 1.5 } }, T0), { lastShotAt: 0, readyAt: {}, caught: { [key]: 7 } });
});

test('1. harpoon income from the best spot by a lake pond stays under the best rod there (~10k energy an hour)', () => {
  const pond = huntingPonds('home').find(p => p.id === 'home:fish:1')!; let best = 0, legend = 0;
  for (let a = 0; a < 8; a++) {
    const at = { x: pond.x + Math.cos(a / 8 * Math.PI * 2) * (pond.rx + 1), z: pond.z + Math.sin(a / 8 * Math.PI * 2) * (pond.rx + 1) };
    const s = M.newGame(); s.level = 10; s.bag.harpoon = 1; s.gear.weapon = 'harpoon'; let value = 0;
    for (let now = T0; now < T0 + 3600e3; now += 200) {
      const tg = fishHuntTargets(pond, now, s.hunting).filter(x => now >= (s.hunting?.readyAt[fishHuntKey(pond.id, x.slot)] ?? 0) && Math.hypot(x.x - at.x, x.z - at.z) <= 11).sort((p, q) => M.ITEMS[q.id].sell - M.ITEMS[p.id].sell)[0];
      if (!tg) continue; const r = huntFish(s, { weaponId: 'harpoon', pondId: pond.id, slot: tg.slot, aim: tg }, at, now);
      if (r?.hit) { value += M.ITEMS[r.id].sell; if (M.ITEMS[r.id].legend) legend++; }
    }
    best = Math.max(best, value);
  }
  // Review: 203,498 energy and 224 golden fish an hour before (12 s restock of a fixed golden slot).
  assert.equal(legend, 0); assert.ok(best > 3000 && best < 10_000, `harpoon energy per hour ${best}`);
});

test('1. the rod view and the harpoon view show one stock: a caught slot\'s new species is handed back to the rod view', t => {
  let now = 1_800_000_000_000; t.mock.method(Date, 'now', () => now);
  const hunt = huntingPonds('home')[1], pond: PondView = { ...hunt }, scene = new T.Scene(), world = {}, owner = {};
  const fishing = new FishingView(scene, { ring() {} } as never, { ready: false } as never, () => {}, () => 0);
  const hunting = { lastShotAt: 0, readyAt: {} as Record<string, number>, caught: {} as Record<string, number> };
  fishing.populate([pond], () => ['fish_perch'], undefined, p => fishHuntTargets(huntingPonds('home').find(h => h.id === p.id)!, 0, hunting).map(f => f.id));
  type Fish = { mystery?: boolean; species: string }; const ordinary = () => (fishing as unknown as { fish: Fish[] }).fish.filter(f => !f.mystery);
  const view = new FishHuntingView(scene, fishing); view.update(0, hunt, hunting, false, world, owner);
  // A catch on slot 0: the slot restocks with the next roll; the hunting view swaps that fish's model.
  const key = fishHuntKey(hunt.id, 0); hunting.caught[key] = 1; hunting.readyAt[key] = now + FISH_HUNT_RESTOCK_MS;
  const rolled = fishHuntTarget(hunt, 0, now, hunting)!.id;
  view.update(.016, hunt, hunting, false, world, owner);
  assert.equal((view as unknown as { fish: Array<{ id: string }> }).fish[0].id, rolled);
  view.update(0, null, hunting, false, world, owner);
  assert.deepEqual(ordinary().slice(0, FISH_PER_WATER[hunt.waterId]).map(f => f.species), fishHuntTargets(hunt, now, hunting).map(f => f.id), 'the rod view takes the new species over');
  assert.equal(FISH_HUNT_COOLDOWN_MS, 1300);
});

// ---- 2. HIGH: switching difficulty undid the fruit nerf --------------------------------------------------------
test('2. difficulty round trips pay nothing extra: no harvest top-up, one price on every difficulty, nerf fixed at planting', () => {
  const s = M.newGame(); s.level = 25; s.energy = 1e6; while (M.expandGarden(s)); s.energy = 0;
  for (let i = 0; i < s.plots.length; i++) assert.ok(M.plant(s, i, 'peach', T0));
  act(s, 'settings', { settings: { difficulty: 'normal' } });
  const e0 = s.energy; M.harvestAll(s, T0 + M.CROPS.peach.duration + 1); assert.equal(s.energy - e0, 0, 'review: 39,600 top-up before');
  act(s, 'settings', { settings: { difficulty: 'easy' } }, T0 + M.CROPS.peach.duration + 2);
  assert.equal(sellProduce(s), s.plots.length * M.ITEMS.peach.sell, 'the legit Easy value, not 1.75x');
  // Planted on Normal: twice the grow time and 0.3x XP, kept when the setting changes; no +15% on a harvest planted off Hard.
  const n = M.newGame(); n.level = 25; n.settings.difficulty = 'normal'; M.plant(n, 0, 'peach', T0); n.settings.difficulty = 'hard';
  assert.equal(n.plots[0].growDuration, 2 * M.CROPS.peach.duration); const x = n.xp, lv = n.level;
  M.harvest(n, 0, T0 + 2 * M.CROPS.peach.duration); assert.ok(n.level > lv || Math.abs(n.xp - x - Math.round(M.CROPS.peach.xp * .3)) < 1e-9, 'Normal XP, no Hard bonus');
  const h = M.newGame(); h.level = 25; M.plant(h, 0, 'peach', T0); h.settings.difficulty = 'hard'; const hx = h.xp, hl = h.level;
  M.harvest(h, 0, T0 + M.CROPS.peach.duration); assert.ok(h.level > hl || h.xp - hx === M.CROPS.peach.xp, 'H: planted on Easy, harvested on Hard: no +15%');
  setLanguage('vi'); assert.notEqual(t(M.DIFFICULTY_NOTE.normal), M.DIFFICULTY_NOTE.normal); setLanguage('en');
});

// ---- 3 + 4. MED: the fireplace and buff stacking ---------------------------------------------------------------
test('3. the fireplace adds 15 defence points and says so', () => {
  const s = M.newGame(); s.level = 20; const d0 = M.defense(s, T0); useActivity(s, 'fire', T0);
  assert.equal(M.defense(s, T0) - d0, 15); assert.match(buffText({ def: 15, time: 150 }), /^\+15 defence/);
});
test('4. a house rest never lengthens a stronger food buff', () => {
  const s = M.newGame(); s.bag.cooked_berry = 1; M.eat(s, 'cooked_berry', T0); const buff = { ...s.buffs.xp! };
  useActivity(s, 'bed', T0 + 200e3); assert.deepEqual(s.buffs.xp, buff, 'review: extended by 280 s before');
  const w = M.newGame(); useActivity(w, 'bed', T0); M.addBuff(w, { xp: .25, time: 300 }, 'x', T0 + 100e3); assert.ok(w.buffs.xp!.expiresAt > T0 + 300e3, 'an equal one still stacks time');
});

// ---- 5. MED: trimGarden (one-time note; the rules are in bed-upgrade.test.ts) -----------------------------------
test('5. the trim note is shown once: ackTrim clears it, and a re-parse refunds nothing twice', () => {
  const s: M.SaveState = M.newGame(); s.energy = 0; for (let i = 9; i < 33; i++) s.plots.push({ crop: null, plantedAt: 0, ...M.defaultBed(i) });
  const p = M.parseSave(JSON.stringify(s))!; let paid = 0; for (let i = 24; i < 33; i++) paid += M.bedPrice(i);
  assert.equal(p.energy, paid, 'review: 3,640 of 3,960 refunded before'); assert.deepEqual(p.gardenTrim, { beds: 9, energy: paid, items: {} });
  const again = M.parseSave(JSON.stringify(p))!; assert.equal(again.energy, paid); assert.deepEqual(again.gardenTrim, p.gardenTrim, 'kept until read');
  assert.deepEqual(act(again, 'ackTrim'), { beds: 9, energy: paid, items: {} }); assert.equal(again.gardenTrim, undefined);
  assert.match(src('main.ts'), /function showTrimNote\(\)\{const n=state\.gardenTrim;if\(!n\)return;void perform\('ackTrim'\)/);
  for (const k of ['Your garden now holds {max} beds: {beds} extra beds were refunded for ϟ {energy}.', 'Their crops are in your bag.']) assert.ok(VI_FIXES[k], k);
});
test('5. the robot remembers what each bed grew after the beds move onto the new grid', () => {
  const s = M.newGame(); s.level = 40; s.energy = 1e6; while (M.expandGarden(s)); const old = JSON.parse(JSON.stringify(s));
  old.gardenLayout = 3; old.plots = old.plots.map((p: M.Plot, i: number) => ({ ...p, ...(i < 9 ? M.layout3Bed(i) : {}) }));
  old.helper = { owned: true, paused: false, seed: 'same', last: {} };
  old.plots.forEach((p: M.Plot) => { old.helper.last[`${p.x!.toFixed(2)},${p.z!.toFixed(2)}`] = 'pumpkin'; });
  const n = M.parseSave(JSON.stringify(old))!;
  assert.equal(n.plots.filter((_, i) => H.seedFor(n, i) === 'pumpkin').length, n.plots.length, 'every bed still replants pumpkin');
});

// ---- 6. MED-LOW: bed kits at the 24 cap -------------------------------------------------------------------------
test('6. at the cap kit rewards become spores, and the shop kit is priced like Expand and off sale at the cap', () => {
  const s = M.newGame(); s.energy = 1e6; assert.equal(M.kitPrice(s), M.gardenExpansionCost(s)); assert.equal(M.shopPrice(s, 'plot_kit'), 60);
  assert.ok(act(s, 'buy', { id: 'plot_kit' })); assert.equal(M.kitPrice(s), M.bedPrice(10), 'the next kit costs the next bed');
  while (M.expandGarden(s)); assert.equal(s.plots.length, M.MAX_PLOTS); assert.equal(M.kitPrice(s), null); assert.equal(M.shopPrice(s, 'plot_kit'), null);
  assert.throws(() => act(s, 'buy', { id: 'plot_kit' }));
  assert.deepEqual(P.fitReward(s, { items: { plot_kit: 2 } }), { items: { spore: 4 } });
  assert.deepEqual(P.fitReward(M.newGame(), { items: { plot_kit: 2 } }), { items: { plot_kit: 2 } }, 'below the cap a kit stays a kit');
  // Star pass tier 5 claimed at the cap.
  s.progression.pass.stars = 1000; P.refreshProgress(s, T0); const tier = P.progressEntries(s, 'pass', T0)[4];
  assert.doesNotMatch(tier.rewardLabel, /bed kit/i); const spores = s.bag.spore ?? 0, kits = s.bag.plot_kit ?? 0;
  assert.ok(P.claimProgress(s, 'pass', tier.id, T0)); assert.equal(s.bag.spore, spores + 2); assert.equal(s.bag.plot_kit ?? 0, kits);
  assert.match(src('main.ts'), /M\.shopPrice\(state,id\)!==null&&matches\(item\)/);
});

// ---- 7. LOW-MED: house cooldowns --------------------------------------------------------------------------------
test('7. a house cooldown never exceeds its length, and far-future stamps are dropped on load', () => {
  const s = M.newGame(); s.hp = 10; useActivity(s, 'bed', T0);
  assert.equal(cooldownLeft(s, 'bed', T0 - DAY), 15 * MIN, 'review: 24.25 h after setting the clock back a day');
  const f = JSON.parse(JSON.stringify(s)); f.house.used.bed = T0 + 365 * DAY;
  assert.equal(M.parseSave(JSON.stringify(f))!.house?.used?.bed, undefined, 'review: a 365-day lock before');
  assert.deepEqual(parseHouse({ used: { bed: T0 + STAMP_SKEW_MS - 1 } }, T0), { used: { bed: T0 + STAMP_SKEW_MS - 1 } }, 'clock skew between server and device is kept');
  assert.equal(useActivity(s, 'bed', T0 + MIN)!, null); assert.equal(useActivity(M.newGame(), 'tea', T0)!.at, T0, 'the result carries the rules\' clock (server time online)');
});

// ---- 8 + H. LOW-MED: the Hard bonus follows the creatures fought ------------------------------------------------
test('8. a kill pays the bonus of the creatures fought, not the killer\'s own setting', () => {
  const easyRoom = M.scaleReward(M.hardScale('easy')), hardRoom = M.scaleReward(M.hardScale('hard'));
  assert.equal(easyRoom, 1); assert.equal(hardRoom, 1.15);
  const hardPlayer = M.newGame(); hardPlayer.settings.difficulty = 'hard'; M.grantDefeat(hardPlayer, 'mushroom', 10, false, () => .99, true, easyRoom); assert.equal(hardPlayer.xp, 10);
  const easyPlayer = M.newGame(); M.grantDefeat(easyPlayer, 'mushroom', 10, false, () => .99, true, hardRoom); assert.ok(Math.abs(easyPlayer.xp - 11.5) < 1e-9);
  const solo = M.newGame(); solo.settings.difficulty = 'hard'; M.grantDefeat(solo, 'mushroom', 10, false, () => .99); assert.ok(Math.abs(solo.xp - 11.5) < 1e-9, 'solo: the save\'s own');
  assert.match(readFileSync(new URL('../server/combat-authority.mjs', import.meta.url), 'utf8'), /const bonus=Game\.scaleReward\(state\(room\)\.scale\)/);
});

// ---- 9 + 10. LOW: cook tasks and story stand-ins ----------------------------------------------------------------
test('9. raising the difficulty swaps a current cook task for a doable one', () => {
  const s = M.newGame(); s.level = 9; let week = '';
  for (let d = 0; d < 80 && !week; d++) { const now = T0 + d * 7 * DAY; s.progression.weekly.key = ''; P.refreshProgress(s, now); if (s.progression.weekly.tasks.some(t => t.type === 'cook')) week = s.progression.weekly.key; }
  assert.ok(week); const now = Date.parse(week + 'T12:00:00Z');
  s.settings.difficulty = 'normal'; P.refreshProgress(s, now);
  const types = s.progression.weekly.tasks.map(t => t.type); assert.ok(!types.includes('cook'), types.join()); assert.equal(new Set(types).size, types.length, 'no duplicate task');
  assert.ok(types.includes('harvest'));
});
test('10. story progress toward one event does not complete the stand-in that replaces it', () => {
  const s = M.newGame(); s.level = 9; s.progression.story.index = 11; s.settings.difficulty = 'normal';
  assert.equal(P.storyStep(11, s).event, 'harvest'); P.refreshProgress(s, T0);
  for (let i = 0; i < 10; i++) P.recordEvent(s, 'harvest', 1, 'carrot', T0); assert.equal(s.progression.story.progress, 10);
  s.settings.difficulty = 'easy'; const e = P.progressEntries(s, 'story', T0)[0];
  assert.equal(e.progress, 0); assert.equal(e.complete, false, 'review: "Cook three meals 3/3 complete" with no meal cooked');
  assert.equal(M.parseSave(JSON.stringify(s))!.progression.story.event, 'cook', 'the event is saved');
});

// ---- E. MED: clock toggling re-claimed dailies --------------------------------------------------------------------
test('E. toggling the clock between today and later days never re-claims dailies, weeklies or the check-in', () => {
  const s = M.newGame(); s.level = 10; P.refreshProgress(s, T0);
  const claimAll = (now: number) => { let n = 0; for (const kind of ['daily', 'weekly'] as const) { for (const task of (kind === 'daily' ? s.progression.daily : s.progression.weekly).tasks) task.progress = task.target; for (const e of P.progressEntries(s, kind, now)) if (P.claimProgress(s, kind, e.id, now)) n++; } return n; };
  assert.ok(claimAll(T0) > 0); const later = T0 + 2 * DAY; assert.ok(claimAll(later) > 0, 'a real later day has its own lists');
  for (let i = 0; i < 12; i++) { assert.equal(claimAll(T0), 0, `back, toggle ${i}`); assert.equal(claimAll(later), 0, `forward again, toggle ${i}`); }
  assert.ok(claimAll(T0 + 3 * DAY) > 0, 'the next unseen day resumes');
  const back = M.parseSave(JSON.stringify(s))!; assert.ok(back.progression.rolled!.daily.includes(new Date(later).toISOString().slice(0, 10)), 'remembered across a reload');
});

// ---- 11. LOW: tester mode -----------------------------------------------------------------------------------------
test('11. a new adventure leaves tester mode; Exit keeps the energy and closes the shop', () => {
  const s = M.newGame(); X.unlockTester(s); act(s, 'reset'); assert.equal(s.settings.tester, undefined);
  const z = M.newGame(); X.unlockTester(z); assert.ok(X.exitTester(z)); assert.equal(X.isTester(z), false); assert.equal(z.energy, X.TESTER_ENERGY); assert.equal(X.exitTester(z), false);
  assert.match(src('main.ts'), /data-action="tester-exit">Exit tester mode/); for (const k of ['Exit tester mode', 'Tester mode is off. Your energy stays.']) assert.ok(VI_FIXES[k], k);
});

// ---- 12. LOW: the collection log ------------------------------------------------------------------------------------
test('12. the log counts obtainable items only, zone bosses only, and titans in their own row', () => {
  const items = collectibleItems(); for (const id of ['wood', 'bunny', 'guard']) assert.ok(!items.includes(id), id);
  assert.equal(items.length, Object.keys(M.ITEMS).length - 3); assert.ok(items.includes('egg') && items.includes('pancake'), 'farm products count');
  const s = M.newGame(); s.bosses = ['home:bear', 'home:titan_turtle', 'lava:nothing']; const rows = collectionLog(s).rows, row = (id: string) => rows.find(r => r.id === id)!;
  assert.equal(row('bosses').have, 1); assert.equal(row('titans').have, 1); assert.equal(row('titans').total, Object.keys(TITANS).length);
});

// ---- 13 + 15 + 16. LOW: texts and rates -------------------------------------------------------------------------------
test('13. bed upgrades say what they do to the harvest rate', () => {
  const main = src('main.ts'); assert.match(main, /'−\{percent\}% grow time \(\{ratio\}× harvests\)'/); assert.doesNotMatch(main, /Grows \{percent\}% faster/);
  assert.equal(+(1 / (1 - M.BED_LEVEL_CUT * 5)).toFixed(2), 2); for (const k of ['−{percent}% grow time ({ratio}× harvests)', 'Bed upgraded to level {level}: −{percent}% grow time ({ratio}× harvests).']) assert.ok(VI_FIXES[k], k);
});
test('15. a busy friend can grow by work before time (60 counted jobs a day) and the panel says how', () => {
  const s = M.newGame(); s.level = 30; s.planet = M.CAGES.sprout.planet; M.grantDefeat(s, M.CAGES.sprout.boss, 1, true, () => .5, false); F.rescue(s, 'sprout', T0); s.planet = 'home'; F.arriveHome(s, { x: 0, z: 5 });
  for (let i = 0; i < 40; i++) { s.plots[0].crop = 'radish'; s.plots[0].plantedAt = T0 - M.CROPS.radish.duration - 1; F.friendWork(s, 'sprout', { kind: 'harvest', index: 0 }, T0 + 3600e3); }
  assert.equal(F.friendStage(s.friends![0]), 1, 'grown an hour after the rescue, by work');
});
test('16. the easel pays 3 % of the level bar', () => {
  for (const level of [1, 10, 30]) { const s = M.newGame(); s.level = level; assert.equal(useActivity(s, 'easel', T0)!.xp, Math.max(1, Math.round(M.xpNeeded(level) * .03))); }
});

// ---- 14. Deliveries ---------------------------------------------------------------------------------------------------
test('14. Take all moves the chest (or the listed stacks) to the bag, at home only', () => {
  const s = M.newGame(); s.chest = { carrot: 9, egg: 2 };
  assert.deepEqual(act(s, 'takeChest', { items: { carrot: 5, egg: 99, honey: 3 } }), { count: 7 }); assert.deepEqual(s.chest, { carrot: 4 }); assert.equal(s.bag.carrot, 5);
  assert.deepEqual(act(s, 'takeChest'), { count: 4 }); assert.deepEqual(s.chest, {});
  const away = M.newGame(); away.planet = 'ice'; away.chest = { carrot: 1 }; assert.deepEqual(takeFromChest(away), { count: 0 });
  assert.match(src('main.ts'), /data-action="take-all">Take all/); assert.match(src('delivery-ui.ts'), /perform<\{ count: number \}>\('takeChest', \{ items \}\)/);
});
test('14. at home Sell all sells the chest\'s produce too and says how much came from it; away it does not', () => {
  const s = M.newGame(); s.bag = { carrot: 2 }; s.chest = { carrot: 9, fish_perch: 1, egg: 3 };
  const lots = produceLots(s); assert.equal(lots.fromChest, 10); assert.equal(lots.total, 11 * M.ITEMS.carrot.sell + M.ITEMS.fish_perch.sell);
  assert.equal(act(s, 'sellProduce'), lots.total); assert.deepEqual(s.chest, { egg: 3 }, 'eggs are food, kept'); assert.equal(s.progression.totals.sell, lots.total);
  const away = M.newGame(); away.planet = 'ice'; away.chest = { carrot: 9 }; assert.equal(produceLots(away).fromChest, 0);
  assert.ok(VI_FIXES['{count} from the chest']);
});
test('14. cooking, farm dishes and the feeders draw from the chest at home (bag first), keeping the player one', () => {
  const s = M.newGame(); s.level = 30; s.chest = { carrot: 3, egg: 2, milk: 1 };
  assert.ok(M.cook(s, 'carrot', 2)); assert.equal(s.chest.carrot, 1); assert.equal(s.bag.cooked_carrot, 2, 'review: cook() returned false');
  s.bag.egg = 1; assert.ok(M.canCookDish(s, 'pancake') || M.canCookDish(s, 'omelette'));
  assert.ok(M.cookDish(s, 'omelette')); assert.equal((s.bag.egg ?? 0) + (s.chest.egg ?? 0), 1, 'two eggs: the bag one first, then the chest');
  const away = M.newGame(); away.level = 30; away.planet = 'ice'; away.chest = { carrot: 3 }; assert.equal(M.pantry(away, 'carrot'), 0);
  // Clover feeds from the chest, never the last one.
  const f = M.newGame(); f.level = 30; f.energy = 1e5; M.buildPen(f); const hen = M.buyAnimal(f, 'chicken', T0 - 10 * DAY)!; f.chest = { radish: 2 };
  f.friends = [{ id: 'clover', role: 'farm', rescuedAt: 1, gear: {}, home: true, autoFeed: true }];
  const adult = T0 + M.ANIMALS.chicken.growMs + 1; hen.bornAt = T0 - M.ANIMALS.chicken.growMs - 10; hen.cycleAt = adult - 1; hen.fed = false;
  const crop = M.autoFeedCrop(f, hen, adult); if (crop) { assert.ok(act(f, 'friendWork', { id: 'clover', kind: 'feed', uid: hen.uid, away: true }, adult)); assert.equal(f.chest.radish, 1); }
  f.chest = { radish: 1 }; assert.equal(M.pantry(f, 'radish'), 1);
});
test('14. catch-ups go to the chest only when away or after a minute idle; a tab switch at home keeps them in the bag', () => {
  assert.equal(deliversToChest('farmHelperCatchUp', {}, 5_000), false); assert.equal(deliversToChest('farmHelperCatchUp', {}, CATCH_UP_IDLE_MS + 1), true);
  assert.equal(deliversToChest('helperCatchUp', { away: true }, 0), true); assert.equal(deliversToChest('helperHarvest', {}, 1e9), false, 'live work follows the pose only');
  const s = M.newGame(); s.level = 30; s.energy = 5000; H.buyHelper(s); s.plots[0].crop = 'carrot'; s.plots[0].plantedAt = T0 - M.CROPS.carrot.duration - 1; s.savedAt = T0 - 2000;
  act(s, 'helperCatchUp'); assert.equal(s.bag.carrot, 1); assert.equal(s.chest.carrot, undefined);
  // The robot's catch-up runs on every arrival home, like the friends'; right after a trip (another planet or a visit)
  // it counts as work done while away, so the client asks for the chest and the server agrees from its own trip clock.
  const main = src('main.ts');
  assert.match(main, /if\(home&&!friendsHome\)\{if\(tripSeen\)\{tripBackUntil=Date\.now\(\)\+120_000;tripSeen=false;\}void friendsCatchUp\(\);void helperCatchUp\(\);\}/);
  assert.match(main, /CATCH_UP_ACTIONS\.has\(type\)\?\{\.\.\.payload,away:catchUpAway\(\)\}/);
  assert.match(src('../server/action-service.mjs'), /CATCH_UP_ACTIONS\.has\(data\.type\)&&now-\(peer\.tripAt\|\|0\)<120000/);
  assert.match(src('../server/server.mjs'), /peer\.tripAt = now/);
});
test('14. LOW: the cook\'s pot holds back only what it took in this action', () => {
  const s = M.newGame(); s.friends = [{ id: 'pepper', role: 'cook', rescuedAt: 1, gear: {}, home: true, pot: { egg: 4 } }];
  s.bag.egg = 4; const before = { ...s.bag }, pot = potItems(s); s.bag.egg = 6; s.friends[0].pot = { egg: 5 };
  storeGains(s, before, pot); assert.equal(s.chest.egg, 1, 'two new eggs: one for the pot, one to the chest'); assert.equal(s.bag.egg, 5);
});

// ---- w14 follow-ups -----------------------------------------------------------------------------------------------
test('w14-1. taking the weapon off means fists after a reload and in the server\'s combat profile', () => {
  const s = M.newGame(); s.bag.sword_wood = 1; act(s, 'equip', { id: 'sword_wood' }); act(s, 'unequip', { slot: 'weapon' });
  assert.equal(s.fists, true); const back = M.parseSave(JSON.stringify(s))!; assert.equal(back.fists, true);
  assert.equal(new ContextGearSelection().forCombat(back), null, 'fists, not the strongest weapon');
  act(back, 'equip', { id: 'sword_wood' }); assert.equal(back.fists, undefined); assert.equal(new ContextGearSelection().forCombat(back), 'sword_wood');
});
test('w14-3/5. cooked food does not say where it was cooked; Vietnamese uses one word, XP', () => {
  assert.doesNotMatch(M.ITEMS.cooked_carrot.desc, /volcano/i);
  for (const file of ['vi-catalog.ts', 'vi-gameplay.ts', 'vi-house.ts', 'vi-ui.ts', 'vi-fixes.ts']) for (const line of src('locales/' + file).split(/\r?\n/)) {
    const value = line.match(/^\s*(['"]).*?\1\s*:\s*(.*)$/)?.[2] ?? ''; assert.doesNotMatch(value, /\b(KN|EXP)\b/, `${file}: ${line.trim().slice(0, 80)}`);
  }
});

// ---- Coordinator items A-L ----------------------------------------------------------------------------------------
test('A/B. the globe flight leaves the cottage first, finds the outdoor ship, and the indoor HUD follows every change', () => {
  assert.match(src('house-ui.ts'), /if \(house\.inside !== wasInside\) sync\(\);/);
  assert.match(src('main.ts'), /function leaveWorld\(\)\{if\(house\.inside\)house\.house\.leave\(\);/);
  const ship = new T.Group(); ship.name = 'ship'; const pad = new T.Group(); pad.add(ship);
  const w = Object.assign(Object.create(World.prototype), { entities: [{ kind: 'house-door', mesh: new T.Group(), x: 0, z: 0 }], interior: { outdoor: [{ kind: 'travel', mesh: pad, x: 4, z: 5 }] } }) as World;
  assert.equal(w.launchRocket()?.x, 4, 'review: null from the interior list, so the flight skipped its launch');
});
test('C. creature templates are asked again when a later file of the kit arrives', async () => {
  // a.glb loads; b.glb (with the mushroom) fails its quick tries, so the kit turns ready without it, then lands late.
  const node = (name: string) => { const g = new T.Group(); g.name = name; const m = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial()); m.name = name + '_body'; g.add(m); const s = new T.Group(); s.add(g); return s; };
  let tries = 0; const kit = new KitLibrary(['a.glb', 'b.glb'], async url => { if (url === 'b.glb' && tries++ === 0) throw new Error('offline'); return node(url === 'a.glb' ? 'frog' : 'mushroom'); });
  await kit.load(); assert.equal(kit.ready, true); assert.ok(creatureArt('frog', kit)); assert.equal(creatureArt('mushroom', kit), null, 'not in yet');
  wakeArt(); for (let i = 0; i < 5 && tries < 2; i++) await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  assert.ok(creatureArt('mushroom', kit), 'review: the cached null kept the stand-in forever');
});
test('D. knockback slides a creature that is far off screen (simulation, not drawing)', () => {
  const w = Object.assign(Object.create(World.prototype), { state: M.newGame(), scene: new T.Scene(), camera: new T.OrthographicCamera(-3, 3, 3, -3, .1, 20), root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(), destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [], particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0, marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(), onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {} }) as World;
  w.build('home'); w.environment = new EnvironmentSimulation(createEnvironmentLayout('home'));
  const far = w.enemies.filter(e => e.hp > 0 && !e.boss && (e.definition?.speed ?? 0) > 0 && Math.hypot(e.x, e.z) > 60)[0]; assert.ok(far);
  const x = far.x; w.knockEnemy(far, 1, 0, 2); for (let i = 0; i < 20; i++) w.update(.025, true, false);
  assert.ok(Math.abs(far.x - x) > .05 || Math.abs((far.knockVX ?? 0)) < .05 && far.x !== x, `moved ${far.x - x}`);
  assert.ok(Math.abs(far.knockVX ?? 0) < 1, 'the slide decays');
});
test('I. friends walk round the walls through the doorways, with walking legs and arms', () => {
  const view = new HouseView(), friends: F.Friend[] = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: {}, home: true }];
  view.syncFriends(friends, 0); const f = [...view.friends.values()][0];
  f.group.position.set(HANGOUTS[0].x, 0, HANGOUTS[0].z); f.spot = HANGOUTS[4]; // living room sofa -> kitchen
  let worst = 0; for (let i = 0; i < 1200; i++) { view.update(1 / 60, 10 + i / 60); const p = f.group.position; if (!walkable({ x: p.x, z: p.z })) worst++; }
  assert.ok(Math.hypot(f.group.position.x - HANGOUTS[4].x, f.group.position.z - HANGOUTS[4].z) < .06, 'arrived');
  assert.ok(worst < 12, `frames outside the walkable plan: ${worst} (a straight line crossed the wall)`);
});
test('L. late files refresh only what they dress, once per frame', () => {
  assert.deepEqual([...lateArtParts([KIT_FILES.wear, KIT_FILES.pets])], ['avatars']);
  assert.deepEqual([...lateArtParts([REFINED_ASSET_FILES.cottage, KIT_FILES.fruitCrops, HERO_FILE, HOUSE_FILE])].sort(), ['avatars', 'crops', 'house', 'refined']);
  assert.deepEqual([...lateArtParts([KIT_FILES.helper, KIT_FILES.cage])], [], 'they refresh themselves');
  const q = new LateArtQueue(); q.add('a'); q.add('a'); q.add('b'); assert.deepEqual(q.take(), ['a', 'b']); assert.deepEqual(q.take(), []);
  assert.match(src('main.ts'), /onArtLoaded\(url=>lateArt\.add\(url\)\)/);
});
test('J. house cooldowns are measured on the server clock (the reply\'s `at`) and a double tap sends one request', () => {
  const life = src('house-life.ts'); assert.match(life, /clockOffset = r\.at - Date\.now\(\)/); assert.match(life, /if \(using\) return; using = true;/);
  assert.match(life, /if \(music\.playing && !d\.soundOn\(\)\) music\.stop\(\);/);
});
