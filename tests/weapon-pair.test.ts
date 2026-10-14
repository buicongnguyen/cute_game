import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { ContextGearSelection } from '../src/context-gear.ts';
import { WeaponPair, autoHand, sideGun, equipSide, withHand, pairMode, SIDE_LEVEL, GUN_FAR, BLADE_NEAR, SWAP_GAP, DRAW_TIME, SWAP_BONUS } from '../src/weapon-pair.ts';
import { pairTarget, sideButtonHtml } from '../src/pair-ui.ts';
import { PAIR_VI, PAIR_HELP_VI } from '../src/locales/vi-pair.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { HELP_TOPICS } from '../src/help-topics.ts';
import { refusalReason } from '../src/refusals.ts';

function explorer(level = 20, ...items: string[]) { const s = M.newGame(); s.level = level; for (const id of items) M.addItem(s, id); return s; }

test('auto swap: the gun beyond 4.5 m, the blade within 3 m, and the weapon in hand in between', () => {
  assert.equal(GUN_FAR, 4.5); assert.equal(BLADE_NEAR, 3);
  assert.equal(autoHand('main', 6), 'side'); assert.equal(autoHand('side', 2), 'main');
  for (const edge of [3, 3.5, 4.5]) { assert.equal(autoHand('main', edge), 'main', `${edge}`); assert.equal(autoHand('side', edge), 'side', `${edge}`); }
  assert.equal(autoHand('side', Infinity), 'side', 'no target: nothing changes');
});

test('a swap waits 0.6 s after the last, draws for 0.15 s and makes only the next hit 20% stronger', () => {
  const pair = new WeaponPair();
  assert.equal(pair.swap('side', 10, false), false, 'no side gun: nothing to swap to');
  assert.equal(pair.swap('side', 10), true); assert.equal(pair.hand, 'side');
  assert.equal(pair.ready(10 + DRAW_TIME / 2), false, 'drawing'); assert.equal(pair.ready(10 + DRAW_TIME), true);
  assert.equal(pair.swap('main', 10 + SWAP_GAP - .01), false, 'too soon'); assert.equal(pair.hand, 'side');
  assert.equal(pair.takeBonus(), SWAP_BONUS); assert.equal(pair.takeBonus(), 1, 'once');
  assert.equal(pair.toggle(10 + SWAP_GAP), true); assert.equal(pair.hand, 'main');
  assert.equal(pair.auto(10, 20), true, 'far target'); assert.equal(pair.hand, 'side');
  pair.settle(false); assert.equal(pair.hand, 'main', 'the side gun went away'); assert.equal(pair.takeBonus(), 1);
});

test('the side slot: level 15, guns only, one gun at most', () => {
  const young = explorer(SIDE_LEVEL - 1, 'gun_ice', 'sword_lava');
  assert.equal(equipSide(young, 'gun_ice'), false);
  assert.match(refusalReason('equipSide', young, { id: 'gun_ice' }) ?? '', /level 15/);
  const s = explorer(SIDE_LEVEL, 'gun_ice', 'sword_lava', 'bow_star');
  assert.equal(equipSide(s, 'sword_lava'), false, 'a blade is not a side weapon');
  assert.equal(equipSide(s, 'rod'), false);
  M.equip(s, 'sword_lava'); assert.equal(applyGameAction(s, { type: 'equipSide', payload: { id: 'gun_ice' } }), true);
  assert.deepEqual([s.gear.weapon, s.gear.side], ['sword_lava', 'gun_ice']); assert.equal(sideGun(s), 'gun_ice');
  // A gun into the main hand frees the side slot; a gun moved from the main hand to the side leaves the main hand empty.
  M.equip(s, 'bow_star'); assert.equal(s.gear.side, undefined);
  assert.equal(equipSide(s, 'bow_star'), true); assert.equal(s.gear.weapon, undefined); assert.equal(s.gear.side, 'bow_star');
  assert.equal(applyGameAction(s, { type: 'unequipSide' }), true); assert.equal(s.gear.side, undefined);
});

test('old saves load unchanged with an empty side slot; a saved side gun comes back, anything else in it is dropped', () => {
  const old = explorer(30, 'sword_lava', 'gun_ice'); M.equip(old, 'sword_lava');
  const loaded = M.parseSave(JSON.stringify(old))!;
  assert.equal(loaded.gear.side, undefined); assert.equal(loaded.hand, undefined);
  assert.equal(M.attack(loaded, 0), M.attack(old, 0)); assert.deepEqual(M.weaponStats(loaded), M.weaponStats(old));
  equipSide(old, 'gun_ice'); old.hand = 'side';
  const back = M.parseSave(JSON.stringify(old))!;
  assert.equal(back.gear.side, 'gun_ice'); assert.equal(back.hand, undefined, 'the hand is never read back: a reload starts with the main weapon');
  assert.equal(M.parseSave(JSON.stringify({ ...old, gear: { weapon: 'sword_lava', side: 'sword_lava' } }))!.gear.side, undefined);
  assert.equal(pairMode(back), 'auto', 'Auto is the default');
  applyGameAction(back, { type: 'settings', payload: { settings: { pairManual: true } } }); assert.equal(pairMode(back), 'manual');
  assert.equal(M.parseSave(JSON.stringify(back))!.settings.pairManual, true);
});

test('no stat stacking: the stowed weapon adds nothing, the side gun in hand counts half its attack', () => {
  const s = explorer(30, 'sword_lava', 'gun_ice'); M.equip(s, 'sword_lava');
  const single = M.attack(s, 0);
  equipSide(s, 'gun_ice');
  assert.equal(M.attack(s, 0), single, 'blade in hand: the side gun adds nothing');
  assert.equal(M.weaponStats(s).kind, 'sword');
  const gun = withHand(s, 'side'), base = 10 + 29 * 1.5;
  assert.equal(M.weaponStats(gun).kind, 'gun'); assert.equal(M.weaponStats(gun).special, 'blizzard');
  assert.equal(M.attack(gun, 0), base + 20 * .5, 'the gun in hand: half its +20 attack, none of the blade');
  assert.equal(withHand(s, 'main'), s);
  // Disguises keep their rule: the weapon in hand fights, here the gun.
  M.addItem(s, 'dz_ninja'); M.equip(s, 'dz_ninja');
  if (s.gear.disguise) assert.equal(M.weaponStats(withHand(s, 'side')).kind, 'gun');
});

test('with a side gun the automatic main-hand choice never takes a gun', () => {
  const s = explorer(30, 'gun_ice', 'blaster_rainbow', 'sword_wood'), gear = new ContextGearSelection();
  assert.equal(gear.forCombat(s), 'blaster_rainbow', 'strongest owned (before)');
  equipSide(s, 'gun_ice');
  assert.equal(new ContextGearSelection().forCombat(s), 'sword_wood');
});

test('the auto swap measures the chosen creature, else the nearest one that fights', () => {
  const foes = [{ x: 10, z: 0, radius: 1, hp: 5 }, { x: 4, z: 0, radius: .5, hp: 5 }, { x: 2, z: 0, radius: .5, hp: 0 }];
  assert.equal(pairTarget({ x: 0, z: 0 }, null, foes, () => true), 3.5);
  assert.equal(pairTarget({ x: 0, z: 0 }, foes[0], foes, () => true), 9);
  assert.equal(pairTarget({ x: 0, z: 0 }, null, foes, () => false), Infinity);
});

test('the side-slot button, the swap button outside the paw, and both languages', () => {
  const s = explorer(SIDE_LEVEL, 'gun_ice'), t = (k: string, v?: Record<string, string | number>) => k.replace(/\{(\w+)\}/g, (_, n) => String(v?.[n]));
  assert.match(sideButtonHtml(s, 'gun_ice', t), /data-action="equip-side"/);
  assert.equal(sideButtonHtml(s, 'sword_wood', t), '');
  equipSide(s, 'gun_ice'); assert.match(sideButtonHtml(s, 'gun_ice', t), /✓ Side slot/);
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), skills = main.slice(main.indexOf('<div class="skills"'), main.indexOf('<div id="keys-guide"'));
  assert.doesNotMatch(skills, /pair-swap/, 'the five-button paw keeps its five buttons');
  assert.match(main, /id="pair-swap"/);
  for (const [en, vi] of Object.entries(PAIR_VI)) { assert.equal(VI_PACK[en], vi, en); assert.notEqual(vi, en); assert.deepEqual(vi.match(/\{\w+\}/g) ?? [], en.match(/\{\w+\}/g) ?? [], en); }
  const topic = HELP_TOPICS.find(([, title]) => title === 'Weapon pair')!; assert.ok(topic);
  assert.equal(VI_PACK[topic[1]], PAIR_HELP_VI[0]); assert.equal(VI_PACK[topic[2]], PAIR_HELP_VI[1]);
  assert.deepEqual(PAIR_HELP_VI[1].replace(/(\d),(\d)/g, '$1.$2').match(/\d+(\.\d+)?/g), topic[2].match(/\d+(\.\d+)?/g), 'the same numbers');
  for (const line of ['The side slot opens at level {level}.', 'Only a gun fits the side slot.', 'Side gun', 'Swap weapon (Tab)']) assert.ok(VI_PACK[line], line);
});

test('balance (promo/fight-sim.mts pairReport): the pair stays near one weapon on bosses and beats the gun alone on the shell crab', async () => {
  const { pairReport } = await import('../promo/fight-sim.mts');
  const rows = pairReport(), row = (name: string) => rows.find(r => r.name === name)!;
  for (const name of ['Yeti', 'Yeti (ground)']) assert.ok(Math.abs(row(name).change) <= .05, `${name}: ${(row(name).change * 100).toFixed(1)}%`);
  assert.ok(Math.abs(row('Shadow Lord').change) <= .08, 'the Shadow Lord keeps leaping away: the gun fills the gaps (about +6%)');
  const crab = row('shell crab (elite)'); assert.ok(crab.gun && crab.pair.dps > crab.gun.dps * 1.1, 'gun to blade cracks the shell');
  for (const r of rows) assert.equal(r.pair.won, r.single.won, r.name);
});
