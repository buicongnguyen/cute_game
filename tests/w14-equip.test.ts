import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as M from '../src/model.ts';
import * as IG from '../src/item-groups.ts';
import { slotMeterHtml, expandCardHtml } from '../src/bag-slots-ui.ts';
import * as F from '../src/friends.ts';
import { applyGameAction } from '../src/actions.ts';
import { ContextGearSelection, type GearContext } from '../src/context-gear.ts';
import { previewGear, canTryOn, autoHeld } from '../src/try-on.ts';
import { needsDuplicateConfirm } from '../src/shop-owned.ts';
import { sideOpen, isGun, SIDE_LEVEL } from '../src/weapon-pair.ts';
import { sideButtonHtml, pairSettingHtml } from '../src/pair-ui.ts';
import * as BagTile from '../src/bag-tile.ts';
import { dressHtml } from '../src/house-ui.ts';

// Equip / unequip review (w14): each test pins a bug that was reachable in play.
const land: GearContext = { nearWater: false, fighting: false, fishing: false };
const water: GearContext = { ...land, nearWater: true };
const owning = (...ids: string[]) => { const s = M.newGame(); for (const id of ids) assert.ok(M.addItem(s, id)); return s; };
const hold = (s: M.SaveState, id: string | null) => { if (id ? M.equip(s, id) : s.gear.weapon ? M.unequip(s, 'weapon') : true) return; assert.fail(`could not hold ${id}`); };

test('removing the weapon by hand keeps fists: the context gear no longer puts it straight back', () => {
  const gear = new ContextGearSelection(), s = owning('sword_wood', 'sword_lava', 'rod');
  hold(s, 'sword_wood'); assert.equal(gear.choose(s, land), 'sword_wood');
  assert.equal(M.unequip(s, 'weapon'), true); gear.holdFists(s);
  assert.equal(gear.choose(s, land), null, 'the removed sword (or the strongest one) must not come back by itself');
  assert.equal(gear.choose(s, { ...land, fighting: true }), null, 'a fight uses the fists the player chose');
  hold(s, gear.choose(s, water)); assert.equal(s.gear.weapon, 'rod', 'the rod still comes out by the water');
  assert.equal(gear.choose(s, land), null, 'and leaving the water goes back to fists');
  hold(s, 'sword_lava'); assert.equal(gear.choose(s, land), 'sword_lava', 'equipping a weapon again ends the fists choice');
  hold(s, gear.choose(s, water)); assert.equal(gear.choose(s, land), 'sword_lava');
});

test('a rod held only because of the water is saved as the chosen combat weapon, so a reload keeps the choice', () => {
  const gear = new ContextGearSelection(), s = owning('sword_wood', 'sword_lava', 'rod_gold');
  hold(s, 'sword_wood'); hold(s, gear.choose(s, water)); assert.equal(s.gear.weapon, 'rod_gold');
  const saved = gear.persisted(s);
  assert.equal(saved.gear.weapon, 'sword_wood'); assert.equal(s.gear.weapon, 'rod_gold', 'the live state keeps the rod in hand');
  const reloaded = M.parseSave(JSON.stringify(saved))!;
  assert.equal(new ContextGearSelection().choose(reloaded, land), 'sword_wood', 'not the stronger sword_lava');
  const plain = owning('sword_wood'); hold(plain, 'sword_wood'); assert.equal(gear.persisted(plain), plain, 'nothing to change returns the state itself');
  const fists = owning('sword_wood', 'rod'); hold(fists, 'sword_wood'); M.unequip(fists, 'weapon'); gear.holdFists(fists); hold(fists, gear.choose(fists, water));
  assert.equal(gear.persisted(fists).gear.weapon, undefined, 'a fists choice is not saved as the rod');
});

test('equipping a hat, outfit or boots takes a disguise off, exactly as the try-on preview showed', () => {
  for (const wear of ['hat_straw', 'armor_leather', 'boots_cowboy']) {
    const s = owning('dz_knight', wear); hold(s, 'dz_knight'); s.hp = M.maxHp(s);
    const preview = previewGear(s.gear, wear);
    assert.equal(applyGameAction(s, { type: 'equip', payload: { id: wear } }), true);
    assert.deepEqual(s.gear, preview, `${wear}: the worn result matches the preview (no hidden ${wear} under the costume)`);
    assert.ok(s.hp <= M.maxHp(s), 'the knight costume health leaves with it');
  }
  const s = owning('hat_straw', 'dz_ninja'); hold(s, 'hat_straw'); hold(s, 'dz_ninja');
  assert.deepEqual(s.gear, { hat: 'hat_straw', disguise: 'dz_ninja' }, 'a disguise goes over the clothes; they return when it comes off');
  const pet = owning('dz_ninja', 'bunny'); hold(pet, 'dz_ninja'); hold(pet, 'bunny'); assert.equal(pet.gear.disguise, 'dz_ninja', 'pets and weapons keep the costume');
});

test('lending a worn health item to a friend changes nothing for the explorer', () => {
  const s = M.newGame(); s.friends = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: {}, home: true }];
  assert.ok(M.addItem(s, 'armor_space')); hold(s, 'armor_space'); s.hp = M.maxHp(s); assert.equal(s.hp, 180);
  assert.equal(applyGameAction(s, { type: 'giveFriendGear', payload: { friend: 'sprout', id: 'armor_space' } }), true);
  assert.equal(s.gear.outfit, 'armor_space'); assert.equal(M.maxHp(s), 180); assert.equal(s.hp, 180);
});

test('an outfit given to a friend shows as worn in the Dress panel and can be taken back', () => {
  const s = M.newGame(); s.friends = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: {}, home: true }];
  assert.ok(M.addItem(s, 'armor_leather'));
  assert.equal(applyGameAction(s, { type: 'giveFriendGear', payload: { friend: 'sprout', id: 'armor_leather' } }), true);
  const html = dressHtml(s, 'sprout');
  const take = html.match(/data-house-action="take"[^>]*data-slot="([^"]+)"/);
  assert.ok(take, 'the given outfit must appear in a Wearing slot'); assert.equal(take![1], 'outfit');
  assert.equal(applyGameAction(s, { type: 'takeFriendGear', payload: { friend: 'sprout', slot: take![1] } }), true);
  assert.equal(s.bag.armor_leather, 1); assert.equal(F.friendOf(s, 'sprout')!.gear.outfit, undefined);
});

test('rods are held automatically: not offered for a manual Equip, not equipped on purchase', () => {
  assert.equal(autoHeld('rod'), true); assert.equal(autoHeld('rod_steady'), true);
  assert.equal(autoHeld('harpoon'), false, 'the harpoon is held by choice'); assert.equal(autoHeld('sword_wood'), false);
  assert.equal(canTryOn('rod'), false);
});

test('the server refuses to unequip a slot name that is not a gear slot', () => {
  const s = owning('hat_straw'); hold(s, 'hat_straw'); const before = JSON.stringify(s);
  for (const slot of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.throws(() => applyGameAction(s, { type: 'unequip', payload: { slot } }, { now: 5, random: Math.random }), `${slot} is refused`);
  assert.equal(JSON.stringify(s), before, 'nothing changes (not even savedAt)');
  assert.equal(applyGameAction(s, { type: 'unequip', payload: { slot: 'hat' } }), true); assert.equal(s.gear.hat, undefined);
});

// ---- main.ts controllers, run for real against a stub world (as client-action-review.test.mjs does) ----
const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const fn = (name: string) => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!.getText(ast);
const click = ast.statements.find(node => ts.isExpressionStatement(node) && node.expression.getText(ast).startsWith("app.addEventListener('click',async")) as ts.ExpressionStatement;
const handler = ((click.expression as ts.CallExpression).arguments[1] as ts.ArrowFunction).body as ts.Block;
const actionSwitch = handler.statements.find(ts.isSwitchStatement)!;
const cases = actionSwitch.caseBlock.clauses.filter(node => ts.isCaseClause(node) && ['unequip', 'buy', 'equip'].includes((node.expression as ts.StringLiteral).text)).map(node => node.getText(ast));
const compiled = ts.transpileModule(`${fn('inventory')}\n${fn('tryOnButton')}\nasync function act(action,id,button){switch(action){${cases.join('\n')}}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(...items: string[]) {
  const state = owning(...items), gear = new ContextGearSelection(), html: string[] = [], calls: string[] = [];
  const ctx = vm.createContext({
    ...BagTile, placeBagCard() {}, $: () => null, M, IG, state, contextGear: gear, sideOpen, isGun, SIDE_LEVEL, sideButtonHtml, pairSettingHtml, canTryOn, autoHeld, needsDuplicateConfirm, slotMeterHtml, expandCardHtml, mini: (id: string) => id, selectedItem: null, tryingOn: null, modal: 'bag', bagMode: 'bag', wardrobeItem: (item?: { slot?: string }) => !!item?.slot,
    // As main.ts perform: a refused action is a toast and resolves undefined.
    perform: async (type: string, payload: Record<string, unknown>) => { calls.push(type); try { return applyGameAction(state, { type, payload }); } catch { return undefined; } },
    world: { refreshPlayer() {}, position: { x: 0, z: 0 } }, save() {}, shop() { calls.push('shop'); }, equipFeedback(id: string) { calls.push(`feedback:${id}`); },
    floating() {}, tone() {}, t: (s: string) => s, esc: (s: string) => s, art: (id: string) => id, openDialog: (_k: string, _t: string, body: string) => html.push(body),
  });
  vm.runInContext(compiled + '\nthis.act=act;this.inventory=inventory;', ctx);
  return { state, gear, ctx, html, calls };
}

test('the bag Remove button empties the weapon slot for good (main.ts unequip wiring)', async () => {
  const f = fixture('sword_wood'); hold(f.state, 'sword_wood'); assert.equal(f.gear.choose(f.state, land), 'sword_wood');
  await f.ctx.act('unequip', '', { dataset: { slot: 'weapon' } });
  assert.equal(f.state.gear.weapon, undefined); assert.equal(f.gear.choose(f.state, land), null);
  hold(f.state, 'sword_wood'); await f.ctx.act('unequip', '', { dataset: { slot: 'hat' } });
  assert.equal(f.gear.choose(f.state, land), 'sword_wood', 'a failed or other-slot Remove is not a fists choice');
});

test('buying a rod keeps the weapon in hand; buying other gear still equips it', async () => {
  const f = fixture('sword_wood'); hold(f.state, 'sword_wood'); f.state.energy = 10_000;
  await f.ctx.act('buy', 'rod', {}); assert.equal(f.state.bag.rod, 1); assert.equal(f.state.gear.weapon, 'sword_wood');
  assert.ok(!f.calls.includes('equip'), 'no equip request for a rod');
  await f.ctx.act('buy', 'hat_straw', {}); assert.equal(f.state.gear.hat, 'hat_straw');
});

test('the bag shows a rod as automatic, not as an Equip button that would be undone a frame later', () => {
  const f = fixture('rod', 'sword_wood'); f.ctx.selectedItem = 'rod'; f.ctx.inventory();
  const detail = f.html.at(-1)!.split('item-detail')[1];
  assert.ok(!/data-action="equip"/.test(detail), 'no Equip for a rod'); assert.match(detail, /automatically/);
  f.ctx.selectedItem = 'sword_wood'; f.ctx.inventory(); assert.match(f.html.at(-1)!.split('item-detail')[1], /data-action="equip"[^>]*>Equip</);
  hold(f.state, 'sword_wood'); f.ctx.inventory(); assert.match(f.html.at(-1)!.split('item-detail')[1], /disabled>Equipped</);
});

test('save() writes the persisted gear, not the rod the water put in hand', () => {
  assert.match(fn('save'), /contextGear\.persisted\(state\)/);
});

// ---- bag tile actions (bag-tile.ts): E and ? on the selected tile, details card beside it ----
const cell = (html: string, id: string) => html.split(`<div class="item-cell sel"><button class="item-tile selected" data-action="inspect" data-item="${id}"`)[1]?.split('</div>')[0] ?? '';
test('only the selected tile carries the green E (its primary action) and the ? details button', () => {
  BagTile.bagUi.card = false;
  const f = fixture('sword_wood', 'radish'); f.ctx.selectedItem = 'sword_wood'; f.ctx.inventory();
  const html = f.html.at(-1)!;
  assert.equal(html.match(/tile-act tile-e/g)?.length, 1, 'one E in the whole bag');
  assert.match(cell(html, 'sword_wood'), /class="tile-act tile-e" data-action="equip" data-item="sword_wood" +aria-label="\{action\}: \{name\}"/);
  assert.match(cell(html, 'sword_wood'), /class="tile-act tile-q" data-action="bag-card"[^>]*aria-expanded="false"/);
  assert.match(html, /id="bag-card"[^>]*hidden>/, 'the details card waits for ?');
  f.ctx.selectedItem = 'radish'; f.ctx.inventory();
  assert.match(cell(f.html.at(-1)!, 'radish'), /data-action="eat" data-item="radish"/, 'food: E uses it');
});

test('a worn item keeps a disabled E; an automatic rod has only ?; the open card keeps every old action', () => {
  const f = fixture('rod', 'sword_wood'); hold(f.state, 'sword_wood');
  f.ctx.selectedItem = 'sword_wood'; f.ctx.inventory();
  assert.match(cell(f.html.at(-1)!, 'sword_wood'), /tile-e" data-action="equip" data-item="sword_wood" disabled/);
  f.ctx.selectedItem = 'rod'; f.ctx.inventory();
  assert.doesNotMatch(cell(f.html.at(-1)!, 'rod'), /tile-e/); assert.match(cell(f.html.at(-1)!, 'rod'), /tile-q/);
  BagTile.bagUi.card = true;
  f.ctx.selectedItem = 'sword_wood'; f.ctx.inventory();
  const card = f.html.at(-1)!.split('id="bag-card"')[1];
  assert.doesNotMatch(card.split('>')[0], /hidden/); assert.match(card, /data-action="bag-card-close"/); assert.match(card, /data-action="forge-menu"/);
  BagTile.bagUi.card = false;
});

test('the details card compares with what is worn in the same slot', () => {
  BagTile.bagUi.card = true;
  const f = fixture('hat_straw', 'sword_wood'); const other = Object.keys(M.ITEMS).find(id => id !== 'sword_wood' && M.ITEMS[id].slot === 'weapon' && M.ITEMS[id].weapon?.kind !== 'rod')!;
  assert.ok(M.addItem(f.state, other)); hold(f.state, 'sword_wood'); f.ctx.selectedItem = other; f.ctx.inventory();
  assert.match(f.html.at(-1)!.split('id="bag-card"')[1], /card-compare">Wearing now: <b>/);
  BagTile.bagUi.card = false;
});

test('double tap: a second tap on the selected tile within 400 ms, never a first tap', () => {
  BagTile.bagUi.tapId = '';
  assert.equal(BagTile.isDoubleTap('a', false, 1000), false);
  assert.equal(BagTile.isDoubleTap('a', true, 1300), true);
  assert.equal(BagTile.isDoubleTap('a', true, 1350), false, 'a third tap starts again');
  assert.equal(BagTile.isDoubleTap('a', true, 1900), false, 'too slow');
  assert.equal(BagTile.isDoubleTap('b', true, 1950), false, 'another tile');
});

test('main.ts wires E, Esc and the card actions, and every new bag string has Vietnamese', async () => {
  assert.match(source, /modal==='bag'&&bagUi\.card\)\{bagUi\.card=false;inventory\(\)/, 'Esc closes the card before the bag');
  assert.match(source, /pressed\.toLowerCase\(\)==='e'&&selectedItem/, 'E acts on the selected item');
  assert.match(source, /case 'bag-card':/); assert.match(source, /case 'bag-card-close':/);
  const { VI_PACK } = await import('../src/locales/vi-pack.ts');
  for (const key of ['Details: {name}', 'Close details', 'Wearing now']) assert.ok(VI_PACK[key], key);
});
