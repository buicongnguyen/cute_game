import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { applyGameAction } from '../src/actions.ts';
import { takeFromChest } from '../src/delivery.ts';
import { slotMeterHtml, expandCardHtml } from '../src/bag-slots-ui.ts';
import { titleCardHtml } from '../src/title-card.ts';
import { installButtonHtml, iosGuideHtml } from '../src/install-app.ts';

// Round 3 extras: bag/chest slots with the reference's expansion table, dropped bags, title card and install markup.
const RESERVED = new Set(['carrot', 'radish', 'potion', 'meat', 'cooked_meat', 'starshard', 'leather', 'tusk', 'pearl', 'moonstone', 'vine', 'amber', 'thunderstone', 'dragonscale', 'stone', 'plot_kit', 'wood', 'hat_straw', 'sword_wood', 'sugar', 'fish_perch']);
const FILLER = Object.keys(M.ITEMS).filter(id => !M.ITEMS[id].slot && !RESERVED.has(id) && !/^(deco_|pet_)/.test(id) && M.ITEMS[id].type !== 'placeable');
// Sizes come from the storage table (the owner chose roomier storage than the reference); the costs keep the reference's table.
const BAG = M.STORAGE.bag, CHEST = M.STORAGE.chest, B = M.bagCapacity(M.newGame()), C = M.chestCapacity(M.newGame());
assert.equal(B, BAG.base); assert.equal(C, CHEST.base);
assert.ok(FILLER.length > C + 5, `enough real item ids to over-fill the chest (${FILLER.length} filler ids for ${C} slots)`);
/** A save whose backpack holds `n` different filler items (one each). */
function filled(n = B, s = M.newGame()) { assert.ok(n <= FILLER.length, 'enough filler ids'); for (const id of FILLER.slice(0, n)) s.bag[id] = 1; return s; }
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}, now = Date.now()) => applyGameAction(s, { type, payload }, { now, random: () => .5 });
const ripe = (s: M.SaveState, i: number, crop = 'carrot') => { const p = s.plots[i]; p.crop = crop; p.plantedAt = 0; p.growDuration = 1; };

test('the backpack and chest start at their base slots; a slot is one item id; worn copies sit in their gear slot', () => {
  const s = filled(B - 1);
  assert.equal(M.bagCapacity(s), BAG.base); assert.equal(M.chestCapacity(s), CHEST.base); assert.equal(M.bagSlotsUsed(s), B - 1);
  assert.equal(M.addItem(s, 'carrot', 50), true, 'the last free kind of item');
  assert.equal(M.addItem(s, 'radish'), false, 'one kind more is refused'); assert.equal(s.bag.radish, undefined); assert.equal(M.fullNote(), 'bag');
  assert.equal(M.addItem(s, 'carrot', 49), true, 'a kind already held only grows its stack'); assert.equal(s.bag.carrot, 99);
  // A hat worn with no spare copy takes no backpack slot; taking it off needs one.
  const g = filled(B - 1); g.bag.hat_straw = 1; assert.equal(M.equip(g, 'hat_straw'), true); assert.equal(M.bagSlotsUsed(g), B - 1);
  assert.equal(M.addItem(g, 'carrot'), true); assert.equal(M.unequip(g, 'hat'), false, 'a full bag cannot take the hat off (reference: Túi đồ đầy, không tháo ra được!)');
  assert.throws(() => act(g, 'unequip', { slot: 'hat' }), new RegExp(M.BAG_FULL.slice(0, 20)));
  M.sell(g, 'carrot'); assert.equal(M.unequip(g, 'hat'), true);
});

test('an older save over the limit keeps every item, takes no new kinds and accepts more of a kind it holds', () => {
  const old = filled(B + 10); old.chest = Object.fromEntries(FILLER.slice(0, C + 5).map(id => [id, 2]));
  const s = M.parseSave(JSON.stringify(old))!;
  assert.equal(Object.keys(s.bag).length, B + 10); assert.equal(Object.keys(s.chest).length, C + 5, 'nothing is lost on loading');
  assert.equal(M.addItem(s, 'carrot'), false); assert.equal(M.addItem(s, FILLER[0]), true);
  assert.equal(M.transfer(s, FILLER[1], false), true, 'taking more of a kind the bag holds is fine');
  assert.equal(M.transfer(s, 'carrot', true), false); assert.equal(M.transfer(s, FILLER[2], true), true, 'the over-full chest still stacks');
  for (const id of FILLER.slice(B - 1, B + 10)) delete s.bag[id]; // B + 9 kinds (one went to the chest) minus 11
  assert.equal(M.bagSlotsUsed(s), B - 2); assert.equal(M.addItem(s, 'carrot'), true, 'below the limit again, new kinds fit');
});

test('every way into a full backpack refuses with the same clear message and leaves nothing half-done', () => {
  const full = () => { const s = filled(B); s.energy = 5000; s.level = 30; return s; };
  const refused = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}) => {
    const before = structuredClone(s);
    assert.throws(() => act(s, type, payload), (e: Error) => e.message === M.BAG_FULL, type);
    assert.deepEqual(s, before, `${type} leaves the save unchanged`);
  };
  let s = full(); ripe(s, 0); refused(s, 'harvest', { index: 0 }); assert.equal(s.plots[0].crop, 'carrot', 'the crop waits ripe in its bed');
  s = full(); refused(s, 'buy', { id: 'potion' });
  s = full(); s.bag.meat = 2; delete s.bag[FILLER[0]]; s.chest.meat = 1; s.settings.difficulty = 'easy'; // cooking makes a new kind
  if (M.kitchenOpen(s)) refused(s, 'cook', { id: 'meat' });
  s = full(); s.chest.carrot = 3; refused(s, 'transfer', { id: 'carrot', toChest: false });
  s = full(); s.chest.carrot = 3; refused(s, 'takeChest');
  s = full(); s.planet = 'candy'; refused(s, 'claimMine', { index: 0 });
  s = full(); s.deathBags = [{ id: 'b1', x: 0, z: 0, planet: 'home', items: { carrot: 2 }, at: Date.now() }]; refused(s, 'recoverBag', { id: 'b1' });
  s = full(); assert.equal(M.grantCatch(s, 'fish_perch', 20), false, 'a catch needs a slot'); assert.equal(s.bag.fish_perch, undefined);
  s = full(); assert.equal(M.canAddItem(s, 'carrot'), false, 'ground loot stays on the ground (drops.ts canAdd)');
  s = full(); const recipe = M.RECIPES.findIndex(r => r.station === 'shop' && r.result === 'potion'); assert.equal(M.canCraft(s, recipe), false); assert.equal(M.craft(s, recipe), false); assert.equal(s.energy, 5000);
});

test('the chest refuses a new kind when full; workers delivering to the chest are limited by the chest, not the bag', () => {
  const s = M.newGame(); for (const id of FILLER.slice(0, C)) s.chest[id] = 1; s.bag.carrot = 2;
  assert.throws(() => act(s, 'transfer', { id: 'carrot', toChest: true }), (e: Error) => e.message === M.CHEST_FULL);
  s.chest[FILLER[0]] = 1; s.bag[FILLER[0]] = 1; assert.equal(M.transfer(s, FILLER[0], true), true, 'a kind the chest holds still stacks');
  // The robot harvests while the explorer is away: the crop goes to the chest even with a full backpack.
  const away = filled(B); away.helper = { owned: true, paused: false, seed: 'same', last: {} }; ripe(away, 0);
  act(away, 'helperHarvest', { index: 0, away: true }); assert.equal(away.chest.carrot, 1); assert.equal(away.bag.carrot, undefined);
  const both = filled(B); both.helper = { owned: true, paused: false, seed: 'same', last: {} }; ripe(both, 0); for (const id of FILLER.slice(0, C)) both.chest[id] = 1;
  assert.throws(() => act(both, 'helperHarvest', { index: 0, away: true }), (e: Error) => e.message === M.CHEST_FULL);
  assert.equal(both.plots[0].crop, 'carrot');
  // Taking from the chest stops at the bag's slots; the rest stays in the chest.
  const take = filled(B - 1); take.chest = { carrot: 2, radish: 3 }; assert.deepEqual(takeFromChest(take), { count: 2 }); assert.deepEqual(take.chest, { radish: 3 });
});

test('rewards that must not be lost go to the chest when the bag is full', () => {
  const s = filled(B);
  assert.equal(M.stowItem(s, 'carrot', 2), 'chest'); assert.equal(s.chest.carrot, 2); assert.equal(s.collection.carrot, 1);
  const boss = filled(B), loot = M.grantDefeat(boss, 'bear', 10, true, () => .99);
  assert.ok(loot.pet && boss.chest[loot.pet] === 1, 'the first-defeat companion waits in the chest');
  // A daily task's bonus item never vanishes: a full bag sends it to the chest.
  const quest = filled(B), now = Date.now(); P.refreshProgress(quest, now);
  const task = quest.progression.daily.tasks[0]; task.progress = task.target;
  const entry = P.progressEntries(quest, 'daily', now).find(e => e.complete);
  if (entry) { const chestBefore = JSON.stringify(quest.chest); assert.equal(P.claimProgress(quest, 'daily', entry.id, now), true); assert.notEqual(JSON.stringify(quest.chest), chestBefore, 'the reward item went to the chest'); }
});

test('expansion costs follow the reference table exactly and use backpack materials only', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(t => M.expansionCost('bag', t)), [
    { energy: 200, materials: { leather: 8, tusk: 2, starshard: 1 } },
    { energy: 400, materials: { leather: 12, tusk: 3, starshard: 2, pearl: 1 } },
    { energy: 600, materials: { leather: 16, tusk: 4, starshard: 3, pearl: 2 } },
    { energy: 800, materials: { leather: 20, tusk: 5, starshard: 4, pearl: 3, moonstone: 1 } },
    { energy: 1000, materials: { leather: 24, tusk: 6, starshard: 5, pearl: 4, moonstone: 2 } },
  ]);
  assert.deepEqual([0, 1, 2, 3].map(t => M.expansionCost('chest', t)), [
    { energy: 300, materials: { vine: 6, amber: 1, starshard: 1 } },
    { energy: 600, materials: { vine: 10, amber: 2, starshard: 2, thunderstone: 1 } },
    { energy: 900, materials: { vine: 14, amber: 3, starshard: 3, thunderstone: 2, dragonscale: 1 } },
    { energy: 1200, materials: { vine: 18, amber: 4, starshard: 4, thunderstone: 3, dragonscale: 2 } },
  ]);
  const s = M.newGame(); s.energy = 10_000; Object.assign(s.chest, { leather: 99, tusk: 99, starshard: 99 });
  assert.throws(() => act(s, 'expandStorage', { kind: 'bag' }), /missing some materials/, 'chest materials do not count');
  Object.assign(s.bag, { leather: 100, tusk: 30, starshard: 30, pearl: 20, moonstone: 5 });
  const sizes = [1, 2, 3, 4, 5].map(() => (act(s, 'expandStorage', { kind: 'bag' }) as { size: number }).size);
  assert.deepEqual(sizes, [1, 2, 3, 4, 5].map(n => BAG.base + n * BAG.add)); assert.equal(M.bagCapacity(s), BAG.base + BAG.max * BAG.add); assert.equal(s.bagUp, BAG.max);
  assert.equal(s.energy, 10_000 - 3000); assert.equal(s.bag.leather, 100 - 80); assert.equal(s.bag.moonstone, 5 - 3);
  assert.throws(() => act(s, 'expandStorage', { kind: 'bag' }), /already as big as it gets/);
  const c = M.newGame(); c.energy = 100; Object.assign(c.bag, { vine: 6, amber: 1, starshard: 1 });
  assert.throws(() => act(c, 'expandStorage', { kind: 'chest' }), /You need 300 energy/);
  c.energy = 300; assert.deepEqual(act(c, 'expandStorage', { kind: 'chest' }), { kind: 'chest', level: 1, size: CHEST.base + CHEST.add }); assert.equal(c.energy, 0); assert.equal(M.chestCapacity(c), CHEST.base + CHEST.add);
  assert.throws(() => act(c, 'expandStorage', { kind: 'pocket' }), /not available/);
  const r = M.parseSave(JSON.stringify({ ...c, bagUp: 9, chestUp: 2.7 }))!; assert.equal(r.bagUp, 5); assert.equal(r.chestUp, 2);
  assert.equal(M.parseSave(JSON.stringify({ ...c, bagUp: -1, chestUp: 'x' }))!.bagUp, undefined);
});

test('a defeat drops the loose backpack in a bag at the spot; it lasts 24 hours and up to ten are kept', () => {
  const now = 1_000_000_000_000, s = M.newGame(); s.bag = { carrot: 3, hat_straw: 1 }; s.gear.hat = 'hat_straw'; s.planet = 'candy';
  const bag = M.die(s, 4, 5, now)!;
  assert.deepEqual(bag, { id: bag.id, x: 4, z: 5, planet: 'candy', items: { carrot: 3 }, at: now });
  assert.deepEqual(s.bag, { hat_straw: 1 }, 'worn gear stays on'); assert.equal(s.planet, 'home');
  assert.equal(M.die(M.newGame(), 0, 0, now), null, 'an empty backpack drops nothing');
  assert.equal(M.recoverBag(s, bag.id, now), false, 'the bag waits on its own planet'); s.planet = 'candy';
  assert.deepEqual(M.liveBags(s, now + M.DEATH_BAG_MS - 1, 'candy').length, 1);
  assert.equal(M.recoverBag(s, bag.id, now + M.DEATH_BAG_MS), false, 'after 24 hours the bag is gone'); assert.equal(s.deathBags, undefined);
  // Ten bags at once; an eleventh banks the oldest into the chest.
  const many = M.newGame(); for (let i = 0; i < 11; i++) { many.bag[FILLER[i]] = i + 1; M.die(many, i, i, now + i); }
  assert.equal(many.deathBags!.length, 10); assert.equal(many.chest[FILLER[0]], 1); assert.equal(many.deathBags![0].items[FILLER[1]], 2);
  assert.match(M.bagTimeLeft(many.deathBags![0], now + 3600_000 + 5 * 60_000), /^22h 5[45]m$/);
  // The action says whether anything dropped (main.ts shows the matching card).
  const a = M.newGame(); a.bag.carrot = 1; a.hp = 0; assert.deepEqual(act(a, 'die', { x: 1, z: 2 }), { dropped: true });
  const b = M.newGame(); b.hp = 0; assert.deepEqual(act(b, 'die', { x: 1, z: 2 }), { dropped: false });
});

test('picking a bag up takes what fits and leaves the rest; saves keep bags and migrate the old single bag', () => {
  const now = Date.now(), s = filled(B - 1); s.deathBags = [{ id: 'b1', x: 0, z: 0, planet: 'home', items: { carrot: 2, radish: 1, [FILLER[0]]: 4 }, at: now }];
  const r = M.recoverBag(s, 'b1', now) as { taken: M.Inventory; left: number };
  assert.equal(r.left, 1); assert.equal(s.bag[FILLER[0]], 5); assert.equal(Object.keys(r.taken).length, 2);
  assert.equal(Object.keys(s.deathBags![0].items).length, 1, 'one kind did not fit and stays in the bag');
  const loaded = M.parseSave(JSON.stringify({ ...M.newGame(), savedAt: 123, dropped: { x: 1, z: 2, planet: 'ice', items: { carrot: 2 } }, deathBags: [{ id: 'x1', x: 3, z: 4, planet: 'home', items: { radish: 1, nope: 3 }, at: 500 }, { x: 'bad', z: 0, planet: 'home', items: { carrot: 1 } }] }))!;
  assert.deepEqual(loaded.deathBags!.map(b => [b.planet, b.at, b.items]), [['ice', 123, { carrot: 2 }], ['home', 500, { radish: 1 }]]);
  assert.equal(Object.hasOwn(loaded, 'dropped'), false);
});

test('bag panel markup: slot meter, expand card with have/need chips, maxed card', () => {
  const t = (x: string, p?: Record<string, string | number>) => x.replace(/\{(\w+)\}/g, (_, k) => String(p?.[k] ?? ''));
  const s = filled(B - 1); s.energy = 150; s.bag.leather = 9;
  assert.match(slotMeterHtml(s, 'bag', t), new RegExp(`class="slot-meter full".*<b>${B} / ${B}</b>`));
  const card = expandCardHtml(s, 'bag', t, id => id);
  assert.match(card, /data-action="expand-storage" data-kind="bag" disabled/); assert.match(card, /chip chip-energy chip-miss">ϟ 200/); assert.match(card, /Leather<\/span> 9\/8/);
  assert.ok(card.includes(`Step 1/${BAG.max}: +${BAG.add} slots (${B} → ${B + BAG.add})`), card);
  s.bagUp = BAG.max; assert.ok(expandCardHtml(s, 'bag', t, id => id).includes(`Fully expanded: ${BAG.base + BAG.max * BAG.add} slots`));
});

test('title card: short, keeps the ids the game and tests use; install markup', () => {
  const html = titleCardHtml({ name: 'Mam', color: M.COLORS[1], colors: M.COLORS, colorNames: ['a', 'b', 'c', 'd', 'e', 'f'], returning: false, language: '<div class="language-picker"></div>', profiles: '<fieldset class="profile-picker"></fieldset>', esc: x => x, t: x => x });
  assert.match(html, /^<div id="title-screen" class="title-live">/); assert.match(html, /id="name-input"[^>]*value="Mam"/);
  assert.equal((html.match(/data-action="color"/g) ?? []).length, 6); assert.match(html, /aria-pressed="true"/);
  assert.ok(html.indexOf('class="primary start-button"') < html.indexOf('button.primary') || !html.includes('primary', html.indexOf('start-button') + 20), 'Play is the only primary button');
  assert.match(html, /<div id="title-profiles" class="title-profiles" hidden><fieldset class="profile-picker">/);
  assert.match(html, /data-action="title-profiles" aria-expanded="false"/);
  assert.match(installButtonHtml(x => x), /data-action="install-app" hidden>📲 Install as app/, 'hidden when the browser offers no install');
  assert.match(iosGuideHtml(x => x), /Add to Home Screen/);
});
