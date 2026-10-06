// Wave 25 (shop): special offers at the outfitters, home stations reading the chest too, and every menu docked on PC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as M from '../src/model.ts';
import * as X from '../src/tester.ts';
import { applyGameAction, ACTION_RULES_VERSION } from '../src/actions.ts';
import { upgradeGear, gearCost } from '../src/upgrades.ts';
import { readFileSync } from 'node:fs';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService } from '../server/action-service.mjs';

const recipeIndex = (result, station = 'craft') => M.RECIPES.findIndex(r => r.result === result && r.station === station);

test('special offers: crafted and boss-only gear, pets and decorations, never keepsakes, materials, food or shop goods', () => {
  const ids = M.specialIds();
  for (const id of ['pet_dragon', 'pet_robot', 'deco_volcano', 'deco_owlstatue', 'crown', 'hat_bear', 'sword_obsidian', 'armor_wings', 'hat_t_eye', 'pet_t_whale']) assert.ok(ids.includes(id), id);
  for (const id of ['bunny', 'obsidian', 'cooked_apple', 'omelette', 'sword_wood', 'rod', 'harpoon', 'dz_ninja', 'carrot', 'constructor', '__proto__']) assert.equal(M.isSpecial(id), false, id);
  for (const id of ids) { const item = M.ITEMS[id]; assert.ok(item.slot || item.type === 'decor', id); assert.equal(item.price, undefined, `${id} is not a normal shop item`); }
  assert.equal(M.SPECIAL_PRICE, 10_000); assert.equal(M.TITAN_PRICE, 25_000);
  const s = M.newGame();
  assert.equal(M.shopPrice(s, 'pet_dragon'), 10_000); assert.equal(M.shopPrice(s, 'deco_rainbow'), 10_000);
  assert.equal(M.shopPrice(s, 'hat_t_eye'), 25_000); assert.equal(M.shopPrice(s, 'pet_t_turtle'), 25_000);
  assert.equal(M.shopPrice(s, 'sword_wood'), M.ITEMS.sword_wood.price, 'normal shop prices are unchanged');
  assert.equal(M.shopPrice(s, 'bunny'), null); assert.equal(M.shopPrice(s, 'obsidian'), null); assert.equal(M.shopPrice(s, 'constructor'), null);
  assert.deepEqual([M.specialSource('pet_dragon'), M.specialSource('crown'), M.specialSource('pet_t_eye'), M.specialSource('deco_statue')], ['workshop', 'boss', 'titan', 'workshop']);
});

test('buying a special offer costs exactly its energy and adds one to the bag; short energy or a non-offer buys nothing', () => {
  const s = M.newGame(); s.energy = 10_000; s.level = 30; // past every level gate (level-gates.ts)
  assert.equal(M.buy(s, 'hat_t_eye'), false, 'a titan trophy costs 25,000'); assert.equal(s.energy, 10_000);
  assert.equal(M.buy(s, 'pet_dragon'), true); assert.equal(s.energy, 0); assert.equal(s.bag.pet_dragon, 1); assert.equal(s.collection.pet_dragon, 1);
  assert.equal(M.buy(s, 'deco_volcano'), false, 'no energy left'); assert.equal(s.bag.deco_volcano, undefined);
  s.energy = 1e9;
  for (const id of ['bunny', 'obsidian', 'cooked_apple', 'constructor']) assert.equal(M.buy(s, id), false, id);
  assert.equal(s.energy, 1e9);
  // The normal ways still work: the workshop recipe (materials + its own small energy price) and the boss drop table.
  const r = M.RECIPES[recipeIndex('pet_dragon')]; Object.assign(s.bag, r.materials); s.energy = r.energy;
  assert.equal(M.craft(s, recipeIndex('pet_dragon')), true); assert.equal(s.bag.pet_dragon, 2); assert.equal(s.energy, 0);
  assert.ok(Object.values(M.LOOT_TABLES).some(table => table.some(entry => entry[0] === 'crown')), 'the crown still drops');
});

test('tester mode buys special offers at its own cheap tester price, solo rules only', () => {
  const s = M.newGame(); s.energy = 1_000_000;
  assert.equal(X.testerBuy(s, 'crown'), false, 'not in tester mode'); assert.equal(X.testerBuyButton(s, 'crown'), '');
  X.unlockTester(s);
  const crown = X.TESTER_ITEMS.find(i => i.id === 'crown'), dragon = X.TESTER_ITEMS.find(i => i.id === 'pet_dragon'), titan = X.TESTER_ITEMS.find(i => i.id === 'pet_t_eye');
  assert.equal(crown.price, M.ITEMS.crown.sell); assert.equal(titan.price, M.ITEMS.pet_t_eye.sell);
  assert.equal(dragon.price, M.RECIPES[recipeIndex('pet_dragon')].energy, 'crafted offers keep their recipe energy');
  for (const id of M.specialIds()) assert.ok(X.TESTER_ITEMS.some(i => i.id === id), `${id} is in the tester shop`);
  assert.match(X.testerBuyButton(s, 'crown'), new RegExp(`data-action="tester-buy" data-item="crown"[^>]*>🧪 ϟ ${crown.price}<`));
  const before = s.energy; assert.equal(X.testerBuy(s, 'crown'), true); assert.equal(before - s.energy, crown.price); assert.equal(s.bag.crown, 1);
  // The server never runs tester rules: actions.ts has no tester action, so a special costs the full price online.
  assert.throws(() => applyGameAction(M.newGame(), { type: 'testerBuy', payload: { id: 'crown' } }));
});

async function service(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-w25-shop-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const execute = createActionService({ store, getPeer: () => undefined });
  const act = async (id, type, payload = {}) => execute(id, { rulesVersion: ACTION_RULES_VERSION, requestId: randomUUID(), expectedRevision: (await store.get(id)).profileRevision || 0, type, payload });
  const make = async (id, energy, level = 30) => { const profile = M.newGame(id); profile.energy = energy; profile.level = level; await store.create({ id, username: id, hash: 'h', salt: 's', friends: [], requests: [], profile }); };
  return { store, act, make };
}
const status = n => error => error.status === n;

test('the server prices special offers itself: a client price is ignored, short energy and non-offers are refused', async t => {
  const h = await service(t);
  await h.make('alice', 9_999);
  await assert.rejects(h.act('alice', 'buy', { id: 'pet_dragon' }), status(409), 'one energy short');
  await assert.rejects(h.act('alice', 'buy', { id: 'pet_dragon', price: 1, cost: 1, energy: 1 }), status(409), 'a client price changes nothing');
  await h.make('bob', 10_000);
  const bought = await h.act('bob', 'buy', { id: 'pet_dragon', price: 1 });
  assert.equal(bought.profile.energy, 0); assert.equal(bought.profile.bag.pet_dragon, 1);
  await h.make('carol', 24_999);
  await assert.rejects(h.act('carol', 'buy', { id: 'hat_t_eye' }), status(409), 'titan trophies cost 25,000');
  await h.make('dave', 1e9);
  for (const id of ['bunny', 'obsidian', 'cooked_apple', 'constructor']) await assert.rejects(h.act('dave', 'buy', { id }), status(409), id);
  assert.equal((await h.store.get('dave')).profile.energy, 1e9);
  // Level gates (level-gates.ts) hold online too: a level-1 explorer with plenty of energy cannot buy a lava boss pet.
  await h.make('erin', 1e9, 1);
  await assert.rejects(h.act('erin', 'buy', { id: 'pet_b_dragon' }), error => error.status === 409 && /Needs level 14/.test(error.message), 'below the lava level');
  assert.equal((await h.store.get('erin')).profile.energy, 1e9);
  await assert.rejects(h.act('dave', 'testerBuy', { id: 'crown' }), error => error.status === 400 || error.status === 409, 'no tester purchases online');
});

test('home stations read the chest too: workshop, outfitter materials, forge and bench take the bag first, then the chest', () => {
  const s = M.newGame(); s.energy = 10_000; s.planet = 'home';
  const boots = recipeIndex('boots_lava'); // obsidian 4, mcrystal 6
  s.bag.obsidian = 4; s.bag.mcrystal = 3; s.chest.mcrystal = 10;
  assert.equal(M.pantry(s, 'mcrystal'), 13); assert.equal(M.fromChest(s, 'mcrystal', 6), 3);
  assert.equal(M.canCraft(s, boots), true);
  s.planet = 'lava'; assert.equal(M.canCraft(s, boots), false, 'away from home only the backpack counts'); s.planet = 'home';
  assert.equal(M.craft(s, boots), true);
  assert.equal(s.bag.mcrystal, undefined, 'the bag is used first'); assert.equal(s.chest.mcrystal, 7, 'then the chest'); assert.equal(s.bag.obsidian, undefined); assert.equal(s.bag.boots_lava, 1);
  // A failed check spends nothing.
  const wings = recipeIndex('armor_wings'), energy = s.energy; s.chest.firecore = 2;
  assert.equal(M.craft(s, wings), false); assert.equal(s.chest.firecore, 2); assert.equal(s.energy, energy);
  // Forge: leather and bone partly from the chest; the worn weapon is never spent as a material.
  const f = M.newGame(); f.energy = 1000; f.planet = 'home'; f.bag.sword_wood = 1; f.gear.weapon = 'sword_wood';
  const cost = M.forgeCost(0); f.bag.bone = cost.materials.bone; f.bag.leather = 1; f.chest.leather = cost.materials.leather; f.chest.starshard = cost.materials.starshard;
  assert.equal(M.canForge(f, 'sword_wood'), true);
  const out = M.forgeWeapon(f, 'sword_wood', () => .1);
  assert.equal(out.success, true); assert.equal(f.bag.leather, undefined); assert.equal(f.chest.leather, 1); assert.equal(f.chest.starshard, undefined); assert.equal(f.bag.sword_wood, 1);
  // Bench: gear levels pay from the chest as well.
  const b = M.newGame(); b.planet = 'home'; b.bag.hat_straw = 1; const g = gearCost('hat_straw', 0); b.energy = g.energy; b.chest.leather = g.materials.leather; b.chest.bone = g.materials.bone;
  assert.deepEqual(upgradeGear(b, 'hat_straw'), { id: 'hat_straw', level: 1 }); assert.equal(b.energy, 0); assert.deepEqual(b.chest, {});
});

test('every menu docks right on PC; only the true confirm and alert dialogs stay centred', () => {
  // dialog-dock.ts imports its CSS, so Node reads the rule from the source (the browser test checks the layout).
  const source = readFileSync(new URL('../src/dialog-dock.ts', import.meta.url), 'utf8');
  const CENTRED = new Set(JSON.parse(source.match(/export const CENTRED[^=]*= new Set\((\[[^\]]*\])\)/)[1].replaceAll("'", '"')));
  const dockable = type => !CENTRED.has(type);
  assert.ok(source.includes('export const dockable = (type: string) => !CENTRED.has(type);'));
  assert.deepEqual([...CENTRED].sort(), ['death', 'difficulty-confirm', 'feed-confirm', 'reset']);
  for (const type of ['upgrade', 'sell', 'travel', 'map', 'quests', 'settings', 'help', 'fish-help', 'shop', 'craft', 'forge', 'cook', 'chest', 'bag', 'pen', 'tester', 'decor', 'plot', 'plant', 'helper', 'farm-helper', 'friend', 'dress', 'looks', 'bench', 'house-collection', 'house-trophies']) assert.equal(dockable(type), true, type);
  for (const type of CENTRED) assert.equal(dockable(type), false, type);
});
