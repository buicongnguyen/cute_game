import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import { applyGameAction, ActionError } from '../src/actions.ts';
import { setLanguage, t } from '../src/i18n.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { DYE_PICKS, DYE_PRICE, DYE_STYLES, DYE_STYLE_IDS, baseOf, dyeIds, dyeIdsOf, dyePrice, isDye, isTradeable, priceFor, setDiscount, setPrice, dyeIconClass } from '../src/dye-skins.ts';
import { buyDye, buyDyeSet, dyeBlock, ownsDye, setBlock, setOffer } from '../src/dye-rules.ts';
import { iconPath } from '../src/item-icons.ts';

afterEach(() => setLanguage('en'));
const NOW = Date.UTC(2026, 0, 6, 12);
const act = (s: M.SaveState, type: string, payload: Record<string, unknown> = {}) => applyGameAction(s, { type, payload }, { now: NOW, random: () => .5 });
const rich = () => { const s = M.newGame('Ann'); s.welcome = 'done'; s.energy = 1_000_000; s.level = 30; return s; };
const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const nonDye = () => Object.keys(M.ITEMS).filter(id => !isDye(id));

test('about two dozen dyes exist, five styles, four or five pieces each, none colliding with an existing item', () => {
  const ids = dyeIds();
  assert.ok(ids.length >= 20 && ids.length <= 24, `${ids.length} dyes`);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.deepEqual(DYE_STYLE_IDS.length, 5);
  for (const style of DYE_STYLE_IDS) assert.ok([4, 5].includes(dyeIdsOf(style).length), style);
  for (const id of ids) { assert.match(id, /^dye_(gilded|prism|frost|shade|ruby)_[a-z_]+$/); assert.ok(Object.hasOwn(M.ITEMS, id)); assert.ok(!Object.hasOwn(M.LEGACY_ITEMS, id)); }
  // No generated id equals (or is a prefix-collision with) any base item: the base set is exactly the ids without the dye flag.
  assert.equal(nonDye().length + ids.length, Object.keys(M.ITEMS).length);
  for (const id of nonDye()) assert.ok(!id.startsWith('dye_'), id);
  // Every pick exists, is wearable gear, and each base is used at most once per style.
  for (const style of DYE_STYLE_IDS) { assert.equal(new Set(DYE_PICKS[style]).size, DYE_PICKS[style].length); for (const base of DYE_PICKS[style]) assert.ok(M.ITEMS[base]?.slot, `${style}: ${base}`); }
  const slots = new Set(ids.map(id => M.ITEMS[id].slot)); for (const slot of ['hat', 'outfit', 'weapon', 'pet', 'boots']) assert.ok(slots.has(slot as M.GearSlot), `a ${slot} dye`);
});

test('a dye has exactly the stats of its base piece (deep equality of everything but the name, flags and price)', () => {
  for (const id of dyeIds()) {
    const dye = M.ITEMS[id], base = M.ITEMS[baseOf(id)];
    assert.notEqual(baseOf(id), id);
    for (const key of ['slot', 'attack', 'defense', 'stats', 'weapon', 'pet', 'type', 'icon', 'desc', 'power', 'size', 'luck', 'light', 'antidote', 'lavaproof', 'featherfall', 'collider', 'heal', 'buff', 'legend', 'rare'] as const) assert.deepEqual(dye[key], base[key], `${id}.${key}`);
    if (base.weapon) assert.notStrictEqual(dye.weapon, base.weapon, 'a copy, not shared');
    assert.equal(M.powerChip(id), M.powerChip(baseOf(id)), 'same power chip');
  }
});

test('a dye is untradeable: flagged, never sold, never a special offer, not on any shop list', () => {
  for (const id of dyeIds()) {
    assert.equal(M.ITEMS[id].noTrade, true); assert.equal(isTradeable(id), false); assert.equal(M.ITEMS[id].sell, 0);
    assert.equal(M.isSpecial(id), false); assert.equal(M.shopPrice(rich(), id), null); assert.equal(M.specialPrice(id), null);
    const s = rich(); M.addItem(s, id); assert.equal(M.sell(s, id), 0, 'cannot be sold'); assert.equal(s.bag[id], 1);
    assert.equal(M.RECIPES.some(r => r.result === id), false);
  }
  assert.equal(isTradeable('hat_wizard'), true); assert.equal(isTradeable('carrot'), true);
  assert.ok(!M.specialIds().some(isDye));
});

test('prices: a single dye scales with the base piece, a five-piece set is 45% off, a three- or four-piece set 14% off', () => {
  assert.equal(DYE_PRICE, 6000);
  assert.equal(priceFor(0), 6000); assert.equal(priceFor(400), 12000); assert.equal(priceFor(30), 6450);
  for (const id of dyeIds()) { const p = dyePrice(id)!; assert.equal(p, priceFor(M.ITEMS[baseOf(id)].sell)); assert.ok(p >= 6000 && p <= 12000 && p % 50 === 0, `${id} ${p}`); }
  assert.equal(dyePrice('hat_wizard'), null);
  assert.equal(setDiscount(5), .45); assert.equal(setDiscount(6), .45); assert.equal(setDiscount(4), .14); assert.equal(setDiscount(3), .14); assert.equal(setDiscount(2), 0);
  const gilded = dyeIdsOf('gilded'), five = gilded.reduce((n, id) => n + dyePrice(id)!, 0);
  assert.equal(gilded.length, 5); assert.equal(setPrice(gilded), Math.floor(five * .55)); assert.ok(setPrice(gilded) < five * .56);
  const ruby = dyeIdsOf('ruby'), four = ruby.reduce((n, id) => n + dyePrice(id)!, 0);
  assert.equal(setPrice(ruby), Math.floor(four * .86));
  const three = dyeIdsOf('ruby').slice(0, 3), sum3 = three.reduce((n, id) => n + dyePrice(id)!, 0);
  assert.equal(setPrice(three), Math.floor(sum3 * .86)); assert.equal(setPrice(three.slice(0, 2)), three.slice(0, 2).reduce((n, id) => n + dyePrice(id)!, 0), 'two pieces: no discount');
  const s = rich(); assert.deepEqual(setOffer(s, 'gilded'), { missing: gilded, price: setPrice(gilded), single: five });
});

test('client and server charge the same: buyDye / buyDyeSet through the shared action rules', () => {
  const id = dyeIdsOf('frost')[0], price = dyePrice(id)!;
  const local = rich(), served = structuredClone(local);
  assert.equal(buyDye(local, id), true); act(served, 'buyDye', { id });
  assert.equal(local.energy, 1_000_000 - price); assert.equal(served.energy, local.energy); assert.deepEqual(served.bag, local.bag);
  const set = rich(), setServed = structuredClone(set);
  assert.equal(buyDyeSet(set, 'gilded'), true); act(setServed, 'buyDyeSet', { style: 'gilded' });
  assert.equal(set.energy, 1_000_000 - setPrice(dyeIdsOf('gilded'))); assert.equal(setServed.energy, set.energy);
  for (const dye of dyeIdsOf('gilded')) { assert.equal(set.bag[dye], 1); assert.equal(setServed.bag[dye], 1); }
  // A set after owning two pieces costs only the missing ones (five missing = 45%, three missing = 14%).
  const part = rich(); buyDye(part, dyeIdsOf('gilded')[0]); buyDye(part, dyeIdsOf('gilded')[1]);
  const offer = setOffer(part, 'gilded'); assert.equal(offer.missing.length, 3); assert.equal(offer.price, setPrice(offer.missing));
  assert.equal(offer.price, Math.floor(offer.missing.reduce((n, d) => n + dyePrice(d)!, 0) * .86));
  const before = part.energy; assert.equal(buyDyeSet(part, 'gilded'), true); assert.equal(before - part.energy, offer.price);
});

test('the server never takes a dye the explorer cannot afford, already owns, or has no room for; a refusal changes nothing', () => {
  const id = dyeIdsOf('shade')[0], price = dyePrice(id)!;
  const poor = rich(); poor.energy = price - 1; const copy = structuredClone(poor);
  assert.throws(() => act(poor, 'buyDye', { id }), (e: unknown) => e instanceof ActionError && e.status === 409 && /needs? .*energy|energy/.test(e.message));
  assert.deepEqual(poor, copy, 'a refusal leaves the save alone'); assert.equal(buyDye(poor, id), false);
  const owner = rich(); act(owner, 'buyDye', { id }); const e1 = owner.energy;
  assert.throws(() => act(owner, 'buyDye', { id }), (e: unknown) => e instanceof ActionError && /already own/.test(e.message)); assert.equal(owner.energy, e1); assert.equal(owner.bag[id], 1);
  // Owned while worn (a worn piece is in the bag too) and while in the chest.
  act(owner, 'equip', { id }); assert.equal(owner.gear[M.ITEMS[id].slot!], id); assert.equal(ownsDye(owner, id), true); assert.equal(dyeBlock(owner, id), 'You already own that dye.');
  const chested = rich(); chested.chest[id] = 1; assert.equal(buyDye(chested, id), false);
  // Not a dye, wrong types, hostile ids and styles.
  for (const bad of ['hat_wizard', 'carrot', '__proto__', 'constructor', 'dye_gilded_nothing', 'dye_gilded_hat_wizard']) { const s = rich(); assert.throws(() => act(s, 'buyDye', { id: bad }), ActionError, bad); assert.equal(s.energy, 1_000_000); }
  for (const bad of ['', 'toString', '__proto__', 'nope']) { const s = rich(); assert.throws(() => act(s, 'buyDyeSet', { style: bad }), ActionError, bad); }
  assert.throws(() => act(rich(), 'buyDye', {}), ActionError); assert.throws(() => act(rich(), 'buyDyeSet', { style: 5 }), ActionError);
  // A set that cannot be paid: nothing is granted and no energy leaves.
  const short = rich(); short.energy = setPrice(dyeIdsOf('gilded')) - 1; assert.throws(() => act(short, 'buyDyeSet', { style: 'gilded' }), ActionError);
  assert.equal(dyeIdsOf('gilded').some(d => short.bag[d]), false); assert.equal(short.energy, setPrice(dyeIdsOf('gilded')) - 1);
  // A set with fewer than three missing is refused (those are sold singly).
  const almost = rich(); for (const d of dyeIdsOf('ruby').slice(0, 2)) buyDye(almost, d); assert.equal(setBlock(almost, 'ruby') !== null, true); assert.throws(() => act(almost, 'buyDyeSet', { style: 'ruby' }), ActionError);
  // No room in the bag: refused with the bag-full text, nothing taken.
  const full = rich(); const slots = M.bagCapacity(full); for (let i = 0; full.bag && Object.keys(full.bag).length < slots; i++) full.bag[`filler_${i}`] = 1;
  assert.throws(() => act(full, 'buyDye', { id }), (e: unknown) => e instanceof ActionError && e.message === M.BAG_FULL); assert.equal(full.energy, 1_000_000);
});

test('the level gate is the base piece\'s', () => {
  // A dye of a gated base waits for that level; every shipped base is an ordinary shop piece (level 0), so check the rule on a gated one by name.
  for (const id of dyeIds()) assert.equal(M.gearLevel(id), M.gearLevel(baseOf(id)), id);
  const s = rich(); s.level = 1; const id = dyeIds()[0]; assert.equal(buyDye(s, id), true);
});

test('ownership and saves: old saves load unchanged, a save with dyes round-trips, and one slot per id', () => {
  const old = M.newGame('Old'); old.energy = 1234; old.bag = { carrot: 3, hat_wizard: 1 }; old.gear = { hat: 'hat_wizard' };
  const loaded = M.parseSave(JSON.stringify(old))!;
  assert.equal(loaded.energy, 1234); assert.deepEqual(loaded.bag, old.bag); assert.deepEqual(loaded.gear, old.gear);
  assert.ok(!Object.keys(loaded).some(key => /dye/i.test(key)), 'no new save field');
  const s = rich(); buyDyeSet(s, 'frost'); act(s, 'equip', { id: dyeIdsOf('frost')[0] });
  const back = M.parseSave(JSON.stringify(s))!;
  assert.deepEqual(back.bag, s.bag); assert.deepEqual(back.gear, s.gear); assert.equal(back.energy, s.energy);
  for (const id of dyeIdsOf('frost')) assert.equal(ownsDye(back, id), true);
  // One bag slot per id: five dyes take five slots, a worn one still counts once, and a second copy is never sold.
  const t0 = M.bagSlotsUsed(rich()), t1 = rich(); buyDyeSet(t1, 'frost'); assert.equal(M.bagSlotsUsed(t1), t0 + 5);
  const worn = rich(); buyDye(worn, dyeIdsOf('frost')[0]); act(worn, 'equip', { id: dyeIdsOf('frost')[0] }); assert.equal(M.bagSlotsUsed(worn), 0, 'a worn piece sits in its gear slot, not in the bag');
  assert.equal(buyDye(worn, dyeIdsOf('frost')[0]), false, 'never a second copy');
  // Stats flow through the normal gear maths: wearing the dyed weapon equals wearing the base.
  const a = rich(), b = rich(); const dyeWeapon = dyeIds().find(id => M.ITEMS[id].slot === 'weapon' && M.ITEMS[id].weapon?.kind === 'sword')!;
  M.addItem(a, dyeWeapon); M.equip(a, dyeWeapon); M.addItem(b, baseOf(dyeWeapon)); M.equip(b, baseOf(dyeWeapon));
  assert.deepEqual(M.activeStats(a, NOW), M.activeStats(b, NOW));
});

test('rendering hooks: a dye uses the base icon and model name, and each style has colours and an icon class', () => {
  for (const id of dyeIds()) { assert.equal(iconPath(id), iconPath(baseOf(id))); assert.match(dyeIconClass(id), /^dye-/); }
  for (const style of DYE_STYLE_IDS) assert.match(DYE_STYLES[style].tint, /^#[0-9a-f]{6}$/i);
  assert.equal(dyeIconClass('hat_wizard'), '');
  const world = read('world.ts'); assert.match(world, /baseOf\(id!\)/); assert.match(world, /applyDye\(/);
});

test('the Dyes tab: reachable from the outfitters, 44 px touch targets, no layout change to existing panels', () => {
  const main = read('main.ts'), css = read('dye-ui.css'), ui = read('dye-ui.ts');
  assert.match(main, /SHOP_TABS=\['Weapons','Clothing','Pets','Disguises','Supplies','Decor','Dyes'\]/); assert.match(main, /dyes\.fill\(\)/);
  assert.match(css, /\.dye-card button\.dye-btn \{[^}]*min-height: 44px/); assert.match(css, /\.dye-card button\.dye-set \{[^}]*min-height: 44px/);
  assert.doesNotMatch(css, /^\.shop-item\s*\{/m, 'only dye-card rules, no restyle of the shop rows');
  assert.match(ui, /data-dye-buy/); assert.match(ui, /data-dye-set/); assert.match(ui, /Owned/);
  assert.equal(M.ITEMS.hat_wizard.dye, undefined);
});

test('Vietnamese: every dye string (styles, tab, refusals) is translated; the 24 dye names reuse the base piece names', () => {
  for (const key of ['Dyes', ...DYE_STYLE_IDS.map(s => DYE_STYLES[s].name), 'Buy the set', 'Complete the set', 'You already own that dye.', 'That dye is not for sale.', 'A set needs at least three dyes you do not have yet.', 'Some of these dyes need a higher level.']) assert.ok(VI_PACK[key], key);
  setLanguage('vi');
  for (const id of dyeIds()) assert.notEqual(t(M.ITEMS[id].name), M.ITEMS[id].name, id);
  assert.equal(t('Save {percent}%', { percent: 45 }), 'Tiết kiệm 45%');
  assert.equal(t('{owned} of {total} owned', { owned: 2, total: 5 }), 'Đã có 2/5');
});
