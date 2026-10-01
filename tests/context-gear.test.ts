import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { ContextGearSelection, type GearContext } from '../src/context-gear.ts';

const land: GearContext = { nearWater: false, fighting: false, fishing: false };
const water: GearContext = { ...land, nearWater: true };
function stateWith(...ids: string[]) {
  const state = M.newGame();
  for (const id of ids) assert.equal(M.addItem(state, id), true);
  return state;
}
function hold(state: M.SaveState, id: string | null) {
  if (id) assert.equal(M.equip(state, id), true);
  else M.unequip(state, 'weapon');
}

test('approaching water deploys the best bag rod and leaving restores the selected combat weapon', () => {
  const selection = new ContextGearSelection();
  const state = stateWith('sword_wood', 'sword_lava', 'rod', 'rod_gold');
  hold(state, 'sword_wood');
  const before = structuredClone(state);
  assert.equal(selection.choose(state, water), 'rod_gold');
  assert.deepEqual(state, before, 'a recommendation never equips, changes stats, consumes items or saves');
  hold(state, selection.choose(state, water));
  assert.equal(selection.choose(state, water), 'rod_gold');
  assert.equal(selection.choose(state, land), 'sword_wood', 'restore the chosen weaker sword, not the stronger unused sword');
  assert.equal(selection.forCombat(state), 'sword_wood');
});

test('combat by water takes priority over the rod, including when a fishing session is interrupted', () => {
  const selection = new ContextGearSelection(), state = stateWith('gun_pea', 'rod');
  hold(state, 'gun_pea'); hold(state, selection.choose(state, water));
  for (const fishing of [false, true]) {
    assert.equal(selection.choose(state, { ...water, fighting: true, fishing }), 'gun_pea');
  }
  assert.equal(selection.choose(state, { ...land, fishing: true }), 'rod', 'an active cast keeps its rod away from the proximity boundary');
  assert.equal(selection.choose(state, land), 'gun_pea');
});

test('weapons and rods need only be in the bag; unrelated equipment never becomes a weapon', () => {
  const selection = new ContextGearSelection(), state = stateWith('hat_straw', 'rod', 'gun_pea', 'sword_wood', 'sword_lava');
  assert.equal(state.gear.weapon, undefined);
  assert.equal(selection.forFishing(state), 'rod');
  assert.equal(selection.forCombat(state), 'sword_lava');
  assert.equal(selection.choose(state, water), 'rod');
  assert.equal(selection.choose(state, land), 'sword_lava');
  const reversed = M.newGame(); reversed.bag = Object.fromEntries(Object.entries(state.bag).reverse());
  assert.equal(selection.forCombat(reversed), 'sword_lava', 'inventory insertion order cannot change the strongest weapon');
});

test('no rod falls back to an owned weapon; no combat weapon falls back to fists', () => {
  const selection = new ContextGearSelection(), onlyWeapon = stateWith('gun_pea');
  assert.equal(selection.forFishing(onlyWeapon), null);
  assert.equal(selection.choose(onlyWeapon, water), 'gun_pea');
  const onlyRod = stateWith('rod'); hold(onlyRod, 'rod');
  assert.equal(selection.choose(onlyRod, land), null);
  assert.equal(selection.choose(onlyRod, { ...water, fighting: true }), null);
  assert.equal(selection.choose(onlyRod, water), 'rod');
  const empty = M.newGame();
  assert.equal(selection.choose(empty, water), null);
  assert.equal(selection.forFishing(empty), null);
  assert.equal(selection.forCombat(empty), null);
});

test('removed weapons and rods are not restored, even when stale equipment still references them', () => {
  const selection = new ContextGearSelection(), state = stateWith('gun_pea', 'sword_wood', 'rod', 'rod_gold');
  hold(state, 'gun_pea'); hold(state, selection.forFishing(state));
  delete state.bag.rod_gold;
  assert.equal(selection.forFishing(state), 'rod');
  delete state.bag.gun_pea;
  assert.equal(selection.forCombat(state), 'sword_wood', 'forget the removed remembered weapon');
  delete state.bag.rod;
  assert.equal(selection.choose(state, water), 'sword_wood', 'the invalid equipped rod does not block combat fallback');
  delete state.bag.sword_wood;
  assert.equal(selection.choose(state, land), null);
  state.bag.gun_pea = 1;
  assert.equal(selection.forCombat(state), 'gun_pea', 'a newly owned weapon becomes available');
});

test('a later manual combat selection replaces the remembered choice across subsequent rod swaps', () => {
  const selection = new ContextGearSelection(), state = stateWith('sword_lava', 'gun_pea', 'rod');
  hold(state, 'sword_lava'); hold(state, selection.choose(state, water));
  hold(state, 'gun_pea');
  assert.equal(selection.forCombat(state), 'gun_pea');
  hold(state, selection.forFishing(state));
  assert.equal(selection.choose(state, land), 'gun_pea');
  assert.equal(selection.choose(state, { ...water, fighting: true }), 'gun_pea');
});

test('switching save identity clears remembered combat selection even when both bags own the same items', () => {
  const selection = new ContextGearSelection(), first = stateWith('gun_pea', 'sword_lava', 'rod');
  hold(first, 'gun_pea'); hold(first, selection.forFishing(first));
  assert.equal(selection.forCombat(first), 'gun_pea');
  const second = structuredClone(first);
  assert.equal(selection.forCombat(second), 'sword_lava', 'the previous account choice must not leak to the new save');
  assert.equal(selection.forCombat(first), 'sword_lava', 'returning is a fresh identity transition, not a hidden per-account cache');
});

test('malformed quantities, unknown IDs, inherited entries and nonweapon gear cannot be selected', () => {
  const selection = new ContextGearSelection(), state = M.newGame();
  state.bag = Object.assign(Object.create({ sword_lava: 1, rod_gold: 1 }), {
    sword_wood: 0, gun_pea: -1, gun_bubble: NaN, sword_crystal: Infinity,
    sword_tusk: .5, rod: NaN, hat_straw: 1, constructor: 1, toString: 1, missing: 1,
  });
  for (const id of ['constructor', 'toString', '__proto__', 'missing', 'hat_straw', 'sword_lava', 'rod_gold']) {
    state.gear.weapon = id;
    assert.equal(selection.forCombat(state), null); assert.equal(selection.forFishing(state), null);
  }
  state.bag.sword_wood = 1; state.gear.weapon = 'rod_gold';
  assert.equal(selection.choose(state, water), 'sword_wood');
});

test('an explicitly held harpoon stays ready beside a pond while ordinary fishing can still select the best rod', () => {
  const selection = new ContextGearSelection(), state = stateWith('harpoon', 'rod', 'rod_gold'); hold(state, 'harpoon');
  const before = structuredClone(state);
  assert.equal(selection.choose(state, water), 'harpoon'); assert.equal(selection.choose(state, land), 'harpoon');
  assert.equal(selection.forFishing(state), 'rod_gold'); assert.equal(selection.choose(state, { ...water, fishing: true }), 'rod_gold');
  assert.deepEqual(state, before);
  hold(state, 'rod_gold'); assert.equal(selection.choose(state, water), 'rod_gold', 'manually changing to the rod enables normal fishing near water');
});

test('holding the harpoon records the manual combat choice before a later manual rod swap', () => {
  const selection = new ContextGearSelection(), state = stateWith('sword_wood', 'harpoon', 'rod');
  hold(state, 'sword_wood'); assert.equal(selection.choose(state, land), 'sword_wood');
  hold(state, 'harpoon'); assert.equal(selection.choose(state, water), 'harpoon');
  hold(state, 'rod'); assert.equal(selection.choose(state, water), 'rod');
  assert.equal(selection.choose(state, land), 'harpoon', 'leaving water restores the later manual weapon rather than the old sword');
});

test('a removed harpoon cannot remain selected or block rod and combat fallback', () => {
  const selection = new ContextGearSelection(), state = stateWith('harpoon', 'rod', 'sword_wood'); hold(state, 'harpoon');
  assert.equal(selection.choose(state, water), 'harpoon'); delete state.bag.harpoon;
  assert.equal(selection.choose(state, water), 'rod'); assert.equal(selection.forCombat(state), 'sword_wood');
  delete state.bag.rod; delete state.bag.sword_wood; assert.equal(selection.choose(state, water), null);
});

test('visiting another save identity holding a harpoon invalidates the previous account weapon memory', () => {
  const selection = new ContextGearSelection(), first = stateWith('gun_pea', 'sword_lava', 'rod');
  hold(first, 'gun_pea'); hold(first, selection.choose(first, water));
  const second = stateWith('harpoon', 'rod'); hold(second, 'harpoon'); assert.equal(selection.choose(second, water), 'harpoon');
  assert.equal(selection.choose(first, land), 'sword_lava', 'the harpoon early-return must still observe the account transition');
});
