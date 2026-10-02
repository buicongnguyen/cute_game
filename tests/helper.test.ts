import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as H from '../src/helper.ts';
import { helperRow, helperPanel } from '../src/helper-ui.ts';
import { localizeHtml, setLanguage } from '../src/i18n.ts';

const T0 = 1_000_000;
function game(energy = 2000) { const s = M.newGame(); s.energy = energy; s.level = 10; return s; }
function owned() { const s = game(); assert.equal(H.buyHelper(s), 'bought'); return s; }
const ripe = (s: M.SaveState, i: number, crop: string) => { s.plots[i].crop = crop; s.plots[i].plantedAt = T0 - M.CROPS[crop].duration - 1; };

test('the helper costs ϟ1000 once, only at home, and older saves have none', () => {
  const poor = game(999); assert.equal(H.buyHelper(poor), 'energy'); assert.equal(poor.energy, 999);
  const away = game(); away.planet = 'ice'; assert.equal(H.buyHelper(away), 'away');
  const s = game(); assert.equal(H.buyHelper(s), 'bought'); assert.equal(s.energy, 1000); assert.equal(H.buyHelper(s), 'owned'); assert.equal(s.energy, 1000);
  const old = JSON.parse(JSON.stringify(M.newGame())); delete old.helper;
  assert.equal(M.parseSave(JSON.stringify(old))!.helper, undefined); assert.equal(H.helperOf(M.parseSave(JSON.stringify(old))!).owned, false);
});

test('it harvests ripe beds into the bag with XP, exactly like the player', () => {
  const s = owned(), mine = owned(); ripe(s, 0, 'pumpkin'); ripe(mine, 0, 'pumpkin');
  assert.equal(H.helperHarvest(s, 0, T0), 'pumpkin'); M.harvest(mine, 0, T0);
  assert.equal(s.bag.pumpkin, 1); assert.equal(s.xp, mine.xp); assert.equal(s.counters.harvests, mine.counters.harvests);
  assert.equal(s.plots[0].crop, null);
  // Unripe beds are left alone.
  s.plots[1].crop = 'pumpkin'; s.plots[1].plantedAt = T0; assert.equal(H.helperHarvest(s, 1, T0), null);
});

test('it replants with the last crop of that bed, else the cheapest it has, and never buys seeds', () => {
  const s = owned(); ripe(s, 0, 'pumpkin');
  // Next task: the ripe bed first, even when an empty bed is nearer.
  const far = M.bedPosition(s, 0); assert.deepEqual(H.nextTask(s, { x: far.x + 30, z: far.z }, T0), { kind: 'harvest', index: 0 });
  H.helperHarvest(s, 0, T0); assert.equal(H.helperPlant(s, 0, T0), 'pumpkin');
  // A bed that never grew anything gets the cheapest crop: a free one (no seed item), the best the level allows.
  const fresh = H.seedFor(s, 1); assert.ok(fresh && !M.CROPS[fresh].seed);
  assert.equal(fresh, H.cheapestSeed(s));
  // A seed crop is replanted only while seeds last; the bag is never topped up.
  const seedCrop = Object.keys(M.CROPS).find(id => M.CROPS[id].seed)!;
  s.level = Math.max(s.level, M.CROPS[seedCrop].level); s.bag[M.CROPS[seedCrop].seed!] = 1; ripe(s, 2, seedCrop);
  H.helperHarvest(s, 2, T0); assert.equal(H.helperPlant(s, 2, T0), seedCrop); assert.equal(s.bag[M.CROPS[seedCrop].seed!] ?? 0, 0);
  ripe(s, 2, seedCrop); H.helperHarvest(s, 2, T0);
  const energy = s.energy, next = H.helperPlant(s, 2, T0);
  assert.notEqual(next, seedCrop); assert.ok(next && !M.CROPS[next].seed, 'out of seeds: falls back to a free crop'); assert.equal(s.energy, energy);
});

test('a chosen seed overrides "same as before"; without that seed it waits', () => {
  const s = owned(); assert.equal(H.setHelperSeed(s, 'carrot'), true); ripe(s, 0, 'pumpkin'); H.helperHarvest(s, 0, T0);
  assert.equal(H.helperPlant(s, 0, T0), 'carrot');
  const seedCrop = Object.keys(M.CROPS).find(id => M.CROPS[id].seed)!; s.level = 99; H.setHelperSeed(s, seedCrop); delete s.bag[M.CROPS[seedCrop].seed!];
  s.plots[1].crop = null; assert.equal(H.seedFor(s, 1), null); assert.equal(H.helperPlant(s, 1, T0), null);
  assert.equal(H.setHelperSeed(s, 'not-a-crop'), false);
  // Paused: no tasks at all.
  H.setHelperSeed(s, 'same'); H.setHelperPaused(s, true); assert.equal(H.nextTask(s, { x: 0, z: 0 }, T0), null);
});

test('offline catch-up tends each ripened bed once, up to the cap, and replants from now', () => {
  const s = owned(); for (let i = 0; i < 4; i++) ripe(s, i, 'radish'); s.plots[4].crop = 'pumpkin'; s.plots[4].plantedAt = T0;
  const r = H.catchUp(s, T0);
  assert.equal(r.harvested.length, 4); assert.equal(s.bag.radish, 4);
  assert.ok(r.planted.length >= 4); for (let i = 0; i < 4; i++) { assert.equal(s.plots[i].crop, 'radish'); assert.equal(s.plots[i].plantedAt, T0); }
  assert.equal(s.plots[4].crop, 'pumpkin', 'a growing bed is left alone');
  // Only one cycle: a second catch-up at the same moment does nothing more.
  assert.equal(H.catchUp(s, T0).harvested.length, 0);
  const capped = owned(); for (let i = 0; i < 6; i++) ripe(capped, i, 'radish'); assert.equal(H.catchUp(capped, T0, 2).harvested.length, 2);
  const paused = owned(); ripe(paused, 0, 'radish'); H.setHelperPaused(paused, true); assert.equal(H.catchUp(paused, T0).harvested.length, 0);
});

test('the helper survives a save round trip, and bad saved data is cleaned', () => {
  const s = owned(); H.setHelperSeed(s, 'carrot'); H.setHelperPaused(s, true); ripe(s, 0, 'pumpkin'); H.rememberPlantings(s);
  const back = M.parseSave(JSON.stringify(s))!;
  assert.deepEqual(back.helper, s.helper);
  const bad = JSON.parse(JSON.stringify(s)); bad.helper = { owned: 'yes', paused: 1, seed: 'rocks', last: { 'x,y': 'carrot', '1.00,2.00': 'nope', '3.00,4.00': 'pumpkin' } };
  assert.deepEqual(M.parseSave(JSON.stringify(bad))!.helper, { owned: false, paused: false, seed: 'same', last: { '3.00,4.00': 'pumpkin' } });
});

test('the bed panel row and the helper panel are localized without changing actions', () => {
  const s = game(); const ui = { esc: (v: string) => v, mini: (id: string) => `<i data-mini="${id}"></i>`, picture: 'helper.webp' };
  assert.match(helperRow(s, false), /Hire for ϟ 1000/); assert.equal(helperRow(s, true), '');
  assert.match(helperPanel(game(10), ui), /data-action="helper-buy" disabled/);
  setLanguage('vi');
  try {
    const row = localizeHtml(helperRow(s, false)); assert.match(row, /Người giúp vườn · Thuê với ϟ 1000/);
    const buy = localizeHtml(helperPanel(s, ui)); assert.match(buy, /Thuê Bolt \(ϟ 1000\)/); assert.doesNotMatch(buy, /never buys|Hire Bolt/);
    H.buyHelper(s); const panel = localizeHtml(helperPanel(s, ui));
    assert.match(panel, /data-action="helper-pause"/); assert.match(panel, /data-action="helper-seed" data-item="same"/); assert.match(panel, /Như trước/);
    assert.doesNotMatch(panel, /Seed to plant|Helper at work|Same as before/);
  } finally { setLanguage('en'); }
});
