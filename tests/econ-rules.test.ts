// Round 28 rules: fruit trees refuse fertilizer, level gates on late gear, Cook & sell all, sound settings, the news
// board, the mystery shadow called only while fishing, and watering's pure numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { cookSellPlan, cookSellProduce, produceLots, sellProduce } from '../src/item-views.ts';
import { cookSellHtml } from '../src/econ-ui.ts';
import { parseAudio, applyAudio, audioRowsHtml, AUDIO_DEFAULTS, volume } from '../src/audio-settings.ts';
import { parseNews, newsHtml, unread, readIds, markRead, READ_KEY, AUTO_OPEN } from '../src/news-board.ts';
import { attractMystery, mysteryMissed, mysteryLanded, mysterySpot, newMysteryCaller, parseMysteryCaller, MYSTERY } from '../src/fishing.ts';
import { waterBoost, waterXp, waterLedger, waterLeft, WATER_RULES } from '../src/visit-rules.ts';
import { setLanguage, t } from '../src/i18n.ts';

const NOW = 1_800_000_000_000;
const refusal = (s: M.SaveState, type: string, payload: Record<string, unknown>) => { try { applyGameAction(s, { type, payload }, { now: NOW, random: () => .5 }); return ''; } catch (error) { return (error as Error).message; } };

test('fruit trees (8 h or more) accept both fertilizers with a two-hour cap; every other crop still takes them', () => {
  const trees = Object.keys(M.CROPS).filter(M.isTreeCrop);
  assert.deepEqual(trees.sort(), ['apple', 'coconut', 'durian', 'grape', 'lychee', 'mango', 'peach', 'pineapple']);
  for (const crop of trees) for (const item of ['manure', 'spore']) {
    const s = M.newGame(); s.level = 30; s.bag[item] = 3;
    assert.ok(M.plant(s, 0, crop, NOW - 1000));
    const before = s.plots[0].plantedAt; assert.equal(M.fertilize(s, 0, NOW, item), true, `${crop} + ${item}`);
    assert.equal(s.bag[item], 2, 'one dose spent');
    assert.equal(before - s.plots[0].plantedAt, 2 * 3600_000);
  }
  const s = M.newGame(); s.bag.manure = 1; assert.ok(M.plant(s, 0, 'carrot', NOW - 1000)); assert.equal(M.fertilize(s, 0, NOW, 'manure'), true);
  setLanguage('vi'); try { assert.notEqual(t('Fruit trees grow at their own pace. Fertilizer does not help them.'), 'Fruit trees grow at their own pace. Fertilizer does not help them.'); } finally { setLanguage('en'); }
});

test('level gates: late gear needs the level of the world it comes from, to buy and to wear', () => {
  const gate = (id: string) => M.gearLevel(id), level = (p: M.PlanetId) => M.PLANETS[p].level;
  // Titan trophies: their titan's planet. Boss pets: their boss's planet. Crafted gear: its collection's world.
  assert.equal(gate('hat_t_eye'), level('shadow')); assert.equal(gate('pet_t_scorpion'), M.gearLevel('hat_t_scorpion'));
  assert.equal(gate('pet_t_turtle'), 0, 'the home titan is level 1: no gate');
  assert.equal(gate('pet_b_dragon'), level('lava')); assert.equal(gate('pet_b_robot'), level('toy')); assert.equal(gate('pet_b_bear'), 0);
  assert.equal(gate('pet_robot'), level('toy')); assert.equal(gate('armor_cloud'), level('cloud')); assert.equal(gate('hat_lantern'), level('shadow'));
  assert.equal(gate('crown'), 0, 'a home boss drop'); assert.equal(gate('sword_wood'), 0, 'ordinary shop gear is never gated'); assert.equal(gate('deco_volcano'), 0, 'decorations are not gear');
  for (const id of M.specialIds()) if (M.ITEMS[id].slot && /^(hat|pet)_t_|^pet_b_/.test(id)) assert.ok(M.gearWorld(id), `${id} has a world`);

  const s = M.newGame(); s.energy = 1e6;
  assert.equal(M.buy(s, 'pet_b_dragon'), false); assert.equal(s.energy, 1e6);
  assert.equal(refusal(s, 'buy', { id: 'pet_b_dragon' }), `Needs level ${level('lava')}.`);
  s.level = level('lava'); assert.equal(M.buy(s, 'pet_b_dragon'), true);
  s.level = 1; assert.equal(M.equip(s, 'pet_b_dragon'), false, 'cannot wear it below the level');
  assert.equal(refusal(s, 'equip', { id: 'pet_b_dragon' }), `Needs level ${level('lava')} to wear.`);
  s.level = level('lava'); assert.equal(M.equip(s, 'pet_b_dragon'), true);
  // An old save that already wears gated gear keeps it on, also after a reload and a re-equip of the same piece.
  const old = M.newGame(); old.bag.hat_t_eye = 1; old.gear.hat = 'hat_t_eye';
  const loaded = M.parseSave(JSON.stringify(old))!; assert.equal(loaded.gear.hat, 'hat_t_eye'); assert.ok(M.activeStats(loaded));
  assert.equal(M.equip(loaded, 'hat_t_eye'), true, 'putting on what is already worn is not a new equip');
  assert.equal(M.unequip(loaded, 'hat'), true); assert.equal(M.equip(loaded, 'hat_t_eye'), false, 'taken off, it waits for the level');
  setLanguage('vi'); try { assert.equal(t('Needs level {level}', { level: 20 }), 'Cần cấp 20'); } finally { setLanguage('en'); }
});

test('Cook & sell all cooks every cookable stack first and earns exactly the cooked total it shows', () => {
  const s = M.newGame(); s.level = 30; s.planet = 'home';
  s.bag.carrot = 4; s.bag.fish_perch = 2; s.bag.boot = 1; s.chest.pumpkin = 3; s.bag.cooked_carrot = 2; // a saved meal is not sold
  const plan = cookSellPlan(s), raw = produceLots(s).total;
  assert.equal(plan.kitchen, true); assert.equal(plan.raw, raw); assert.equal(plan.dishes, 9);
  const expected = 4 * M.sellPrice(s, 'cooked_carrot') + 2 * M.sellPrice(s, 'cooked_fish_perch') + 3 * M.sellPrice(s, 'cooked_pumpkin') + M.sellPrice(s, 'boot');
  assert.equal(plan.cooked, expected); assert.ok(plan.cooked > plan.raw, 'cooking is worth more');
  const before = s.energy, gained = applyGameAction(s, { type: 'cookSellProduce', payload: {} }, { now: NOW, random: () => .5 });
  assert.equal(gained, plan.cooked); assert.equal(s.energy - before, plan.cooked);
  assert.equal(s.bag.cooked_carrot, 2, 'the meal saved for the trail stays'); assert.equal(s.bag.carrot, undefined); assert.equal(s.chest.pumpkin, undefined); assert.equal(s.bag.boot, undefined);
  // The button shows both totals; away from home only a note (the kitchen is at home) and the action refuses.
  const html = cookSellHtml(plan, x => x); assert.match(html, /data-action="cook-sell-produce"/); assert.match(html, new RegExp(`ϟ ${plan.cooked}`)); assert.match(html, new RegExp(`Raw: ϟ ${plan.raw}`));
  const away = M.newGame(); away.planet = 'toy'; away.bag.carrot = 2;
  assert.equal(cookSellPlan(away).kitchen, false); assert.equal(cookSellProduce(away), 0); assert.equal(away.bag.carrot, 2);
  assert.match(refusal(away, 'cookSellProduce', {}), /kitchen/i); assert.doesNotMatch(cookSellHtml(cookSellPlan(away), x => x), /data-action/);
  assert.equal(sellProduce(away), 2 * M.sellPrice(away, 'carrot'), 'plain Sell all still works anywhere');
});

test('sound settings: two volumes and vibration, migrated from the old single switch', () => {
  assert.deepEqual(parseAudio({}), { sound: true, musicVolume: AUDIO_DEFAULTS.musicVolume, sfxVolume: AUDIO_DEFAULTS.sfxVolume, vibrate: true });
  assert.deepEqual(parseAudio({ sound: false }), { sound: false, musicVolume: 0, sfxVolume: 0, vibrate: false }, 'old "sound off" = silence');
  assert.deepEqual(parseAudio({ sound: true, musicVolume: 2, sfxVolume: -1, vibrate: false }), { sound: true, musicVolume: 1, sfxVolume: 0, vibrate: false });
  assert.equal(volume(.333), .35); assert.equal(volume('1'), undefined); assert.equal(volume(NaN), undefined);
  const fresh = M.newGame(); assert.equal(fresh.settings.musicVolume, .45); assert.equal(fresh.settings.sfxVolume, .8); assert.equal(fresh.settings.vibrate, true);
  const old = JSON.parse(JSON.stringify(fresh)); old.settings = { sound: false, lowGraphics: false };
  const migrated = M.parseSave(JSON.stringify(old))!; assert.equal(migrated.settings.musicVolume, 0); assert.equal(migrated.settings.sfxVolume, 0); assert.equal(migrated.settings.vibrate, false);
  // The settings action (and so the server) takes the new fields; the old toggle still means on/off.
  const s = M.newGame(); applyGameAction(s, { type: 'settings', payload: { settings: { musicVolume: .2, sfxVolume: 0, vibrate: false } } }, { now: NOW, random: () => .5 });
  assert.deepEqual([s.settings.musicVolume, s.settings.sfxVolume, s.settings.vibrate, s.settings.sound], [.2, 0, false, true]);
  assert.deepEqual(M.parseSave(JSON.stringify(s))!.settings.musicVolume, .2, 'saved and reloaded');
  applyAudio(s.settings, { sound: false }); assert.deepEqual([s.settings.musicVolume, s.settings.sfxVolume, s.settings.sound], [0, 0, false]);
  const html = audioRowsHtml({ musicVolume: .45, sfxVolume: .8, vibrate: true });
  assert.match(html, /data-volume="music"[^>]*>|value="45" data-volume="music"/); assert.match(html, /value="80" data-volume="sfx"/); assert.match(html, /data-action="vibrate"/);
  setLanguage('vi'); try { for (const k of ['Music volume', 'Effects volume', 'Vibration']) assert.notEqual(t(k), k); } finally { setLanguage('en'); }
});

test('the effects player and the radio follow the volume sliders', async () => {
  const { Sfx } = await import('../src/sfx.ts');
  const gains: number[] = [];
  class FakeCtx { state = 'running'; currentTime = 0; sampleRate = 8000; destination = {}; createGain() { const g = { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; return g; } createBuffer() { return { getChannelData: () => new Float32Array(8) }; } createOscillator() { return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; } }
  const g = globalThis as Record<string, unknown>, before = g.AudioContext; g.AudioContext = FakeCtx;
  try {
    const sfx = new Sfx(); sfx.volume = .8; sfx.play('click'); gains.push((sfx as unknown as { out: { gain: { value: number } } }).out.gain.value);
    sfx.volume = .4; sfx.play('pop'); gains.push((sfx as unknown as { out: { gain: { value: number } } }).out.gain.value);
    assert.ok(Math.abs(gains[0] - .55) < 1e-9, 'the default 0.8 keeps the original loudness'); assert.ok(Math.abs(gains[1] - .275) < 1e-9);
    const silent = new Sfx(); silent.volume = 0; silent.play('click'); assert.equal((silent as unknown as { ctx: unknown }).ctx, null, 'volume 0 makes no sound at all');
  } finally { g.AudioContext = before; }
  const doc = Object.assign(new EventTarget(), { hidden: false, documentElement: {} });
  class FakeAudio { loop = false; volume = 1; src: string; constructor(src: string) { this.src = src; } play() { return Promise.resolve(); } pause() {} }
  const saved = { document: g.document, Audio: g.Audio }; g.document = doc; g.Audio = FakeAudio;
  try {
    const { MusicBox } = await import('../src/house-life.ts'); const { audioLevels } = await import('../src/audio-settings.ts');
    audioLevels.music = .45; const box = new MusicBox(); box.start();
    const theme = (box as unknown as { theme: FakeAudio }).theme; assert.equal(theme.volume, .45);
    audioLevels.music = .2; box.tick(.016); assert.equal(theme.volume, .2, 'the slider changes a playing radio');
    audioLevels.music = .45; box.stop();
  } finally { g.document = saved.document; g.Audio = saved.Audio; }
});

test('the news board: our own entries in both languages, newest first, unread remembered per device', async () => {
  const raw = JSON.parse(await readFile(new URL('../public/news.json', import.meta.url), 'utf8'));
  const data = parseNews(raw);
  assert.equal(data.news.length, raw.news.length, 'every entry is well-formed'); assert.ok(data.upcoming.length >= 2);
  for (const e of [...raw.news, ...raw.upcoming]) { assert.ok(e.title.vi && e.title.vi !== e.title.en, `${e.id} has Vietnamese`); }
  for (const e of raw.news) assert.equal(e.items.vi.length, e.items.en.length, `${e.id} lines match`);
  assert.ok(data.news.every((e, i) => i === 0 || data.news[i - 1].date >= e.date), 'newest first');
  const events = JSON.stringify(data.news.find(e => e.id === '2026-10-06-events')); for (const word of ['Colossus', "Delvers' Vault", 'Leaderboard']) assert.match(events, new RegExp(word), `${word} is announced`);
  const first = JSON.stringify(data.news[0]); for (const word of ['4%', '30%', '0.15%', '12%', '6%', '3,000,000', '80%', '3.000.000', 'Render resolution']) assert.ok(first.includes(word), `the 2026-10-09 balance entry says ${word}`);
  const text = JSON.stringify(raw); for (const word of ['neighbour', 'boss', 'oat', 'deep', 'size', 'kill']) assert.match(text, new RegExp(word, 'i'));
  assert.doesNotMatch(text, /Zoo Pet|KNDARK|Khương/, 'nothing copied from the reference');
  // Malformed input never breaks the board; sorting is by date, stable within a day.
  const parsed = parseNews({ news: [{ id: 'a', date: '2026-01-01', title: { en: 'A' }, items: { en: ['x'] } }, { id: 'b', date: '2026-02-01', title: { en: 'B', vi: 'Bê' }, items: { en: ['y'], vi: ['ý'] } }, null, { id: 3 }, { id: 'c', date: '2026-02-01', title: { en: 'C' } }], upcoming: 'no' });
  assert.deepEqual(parsed.news.map(e => e.id), ['b', 'a']); assert.equal(parsed.news[1].title.vi, 'A', 'a missing translation falls back to English'); assert.deepEqual(parsed.upcoming, []);
  assert.deepEqual(parseNews(null), { news: [], upcoming: [] });
  // Unread: ids this device has not marked read.
  const store = new Map<string, string>(), storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  assert.equal(unread(data, readIds(storage)).length, data.news.length);
  markRead([data.news[0].id], storage); assert.equal(unread(data, readIds(storage)).length, data.news.length - 1); assert.ok(store.has(READ_KEY));
  assert.deepEqual([...readIds({ getItem: () => '{bad' })], [], 'broken storage reads as nothing read');
  // Panel: two tabs; the newest card has the NEW tag; older ones under "Earlier updates"; Vietnamese from the file.
  const html = newsHtml(data, 'news', new Set(), 'en');
  assert.match(html, /data-action="news-tab" data-kind="news"/); assert.match(html, /data-kind="soon"/);
  assert.equal(html.match(/class="news-new"/g)?.length, 1); assert.match(html, /Earlier updates/);
  assert.match(newsHtml(data, 'news', new Set(), 'vi'), new RegExp(data.news[0].title.vi.slice(0, 12)));
  assert.match(newsHtml(data, 'soon', new Set(), 'en'), /news-card upcoming/);
  assert.deepEqual(AUTO_OPEN, { firstMs: 2500, retryMs: 2000, tries: 40 });
  setLanguage('vi'); try { for (const k of ['News', 'Coming soon', 'NEW', 'Earlier updates']) assert.notEqual(t(k), k); } finally { setLanguage('en'); }
});

test('the mystery shadow is called only while fishing: 10% per attract, once a minute, near the bobber, three tries', () => {
  const pond = { x: 0, z: 0, r: 6 }, cast = { x: 1, z: 0 };
  const st = newMysteryCaller();
  assert.deepEqual(attractMystery(st, 'home', cast, 100_000, () => .2), { mystery: false, called: false }, 'exactly 20% misses');
  let roll = .05; const random = () => roll;
  const call = attractMystery(st, 'home', cast, 100_000, random, pond);
  assert.equal(call.mystery, true); assert.equal(call.called, true);
  const d = Math.hypot(call.spot!.x - cast.x, call.spot!.z - cast.z); assert.ok(d >= MYSTERY.near[0] - 1e-9 && d <= MYSTERY.near[1] + 1e-9);
  assert.ok(Math.hypot(call.spot!.x, call.spot!.z) <= pond.r - .4 + 1e-9, 'inside the water');
  // It comes back at the next attracts without a new roll, until its third try is missed.
  roll = .99; assert.equal(mysteryMissed(st), false); assert.deepEqual(attractMystery(st, 'home', cast, 101_000, random), { mystery: true, called: false, spot: call.spot });
  assert.equal(mysteryMissed(st), false); assert.equal(attractMystery(st, 'home', cast, 102_000, random).mystery, true);
  assert.equal(mysteryMissed(st), true, 'the third miss and it is gone'); assert.equal(st.active, undefined);
  roll = .05; assert.equal(attractMystery(st, 'home', cast, 119_999, random).mystery, false, 'not within 20 s of the last call');
  assert.equal(attractMystery(st, 'home', cast, 120_000, random).called, true, 'a new one after 20 seconds');
  // Fishing elsewhere: the waiting one sinks away (another pond, or far from this bobber).
  roll = .99; assert.equal(attractMystery(st, 'lake', cast, 121_000, random).mystery, false); assert.equal(st.active, undefined);
  roll = .05; attractMystery(st, 'home', cast, 300_000, random); assert.ok(st.active);
  roll = .99; assert.equal(attractMystery(st, 'home', { x: cast.x + 9, z: 0 }, 301_000, random).mystery, false, 'far from the bobber');
  roll = .05; attractMystery(st, 'home', cast, 400_000, random); mysteryLanded(st); assert.equal(st.active, undefined); assert.equal(st.lastCallAt, 400_000);
  // A spot near the rim of a small pond is pulled into the water; saved callers are checked.
  for (let i = 0; i < 50; i++) { const p = mysterySpot({ x: 2.6, z: 0 }, Math.random, { x: 0, z: 0, r: 3 }); assert.ok(Math.hypot(p.x, p.z) <= 2.6 + 1e-9); }
  assert.deepEqual(parseMysteryCaller({ lastCallAt: 'x', active: { water: 'home', x: 1, z: 1, tries: 3 } }), { lastCallAt: 0 });
  assert.deepEqual(parseMysteryCaller({ lastCallAt: 5, active: { water: 'home', x: 1, z: 2, tries: 1 } }), { lastCallAt: 5, active: { water: 'home', x: 1, z: 2, tries: 1 } });
});

test('watering numbers: 10% of the remaining time, 5 + min(30, level) XP, five a day per garden', () => {
  assert.equal(WATER_RULES.share, .1); assert.equal(WATER_RULES.perHomePerDay, 10);
  assert.equal(waterBoost(600_000, 100_000), 50_000); assert.equal(waterBoost(600_000, 600_000), 0); assert.equal(waterBoost(NaN, 0), 0);
  assert.deepEqual([waterXp(1), waterXp(10), waterXp(30), waterXp(99)], [6, 15, 35, 35]);
  const day = waterLedger({ day: new Date(NOW).toISOString().slice(0, 10), homes: { bob: 3, bad: -1 } }, NOW);
  assert.deepEqual(day.homes, { bob: 3 }); assert.equal(waterLeft(day, 'bob'), 7); assert.equal(waterLeft(day, 'cara'), 10);
  assert.deepEqual(waterLedger({ day: '2000-01-01', homes: { bob: 5 } }, NOW).homes, {}, 'a new day starts fresh');
});
