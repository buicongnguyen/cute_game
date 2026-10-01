import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as M from '../src/model.ts';
import { ContextGearSelection } from '../src/context-gear.ts';
import { FishingSimulation, planCast, selectCatch, catchWeight } from '../src/fishing.ts';
import { FishingInput, CombatTimers, MovementControls } from '../src/gameplay-controls.ts';
import { BASE_SKILLS, SPECIALS } from '../src/combat.ts';
import { fightNear } from '../src/hud-combat.ts';

// Run the actual main.ts controllers with real inventory, contextual selection,
// fishing simulation and threat detection. Only presentation and combat dispatch
// are intercepted so assertions can inspect which gear reaches each action.
const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const names = ['applyContextWeapon', 'prepareCombatWeapon', 'updateContextWeapon', 'fish', 'pondView', 'endFishing', 'updateFishing', 'finishFishingCatch', 'basicAttack', 'skillList', 'skill'];
const declarations = names.map(name => {
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, `main.ts must provide the actual ${name} controller`);
  return node.getText(ast);
}).join('\n');
const hints = ast.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === 'FISH_HINTS'));
assert.ok(hints, 'main.ts must provide the actual fishing phase hints');
const compiled = ts.transpileModule(hints.getText(ast) + '\n' + declarations, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(...items) {
  const state = M.newGame();
  for (const id of items) assert.ok(M.addItem(state, id));
  const calls = { refresh: 0, save: 0, hud: 0, cancel: 0, casts: [], landings: [], reels: [], timers: [], dialogs: [], toasts: [], attacks: [], skills: [], actions: [] };
  const pond = { id: 'pond', kind: 'fish', x: 0, z: 0, radius: 2, pond: { rx: 2, rz: 2, surface: 0 }, waterId: 'home' };
  const combatTimers = new CombatTimers();
  const ctx = vm.createContext({
    M, ContextGearSelection, FishingSimulation, FishingInput, planCast, selectCatch, catchWeight,
    BASE_SKILLS, SPECIALS, fightNear, recordEvent: M.recordEvent,
    state, gearState: state, gearPlanet: state.planet, gearWater: false, combatGearUntil: 0,actionHandler:null,
    contextGear: new ContextGearSelection(), started: true, visiting: null, blocked: false,
    document: { hidden: false }, now: 1000, performance: { now: () => ctx.now },
    fishGame: null, fishPond: null, fishingWater: 'home', lastCast: null, recastUntil: 0,fishingEpoch:0,
    cooldowns: combatTimers.skills, combatTimers, skillDurations: [7, 4, 9, 6],
    uiBlocked: () => ctx.blocked,
    world: {
      entities: [pond], enemies: [], position: { x: 5, z: 0 }, selected: null,
      destination: null, route: [], moving: false, keys: new Set(), pondTap: null, ring: { visible: false },
      refreshPlayer: () => { calls.refresh++; }, playerAttack() {},
    },
    fishingView: {
      mysteryNearCast:()=>null,
      approachDistance: () => 2,
      begin: (...args) => calls.casts.push(args),
      cancel: () => { calls.cancel++; },
      land: (_target, callback) => calls.landings.push(callback),
    },
    combat: {
      basic: target => { calls.attacks.push({ target, kind: M.weaponStats(ctx.state).kind, item: ctx.state.gear.weapon }); return true; },
      skill: (index, special) => { calls.skills.push({ index, special, kind: M.weaponStats(ctx.state).kind, item: ctx.state.gear.weapon }); return true; },
      disguise: (id, index) => { calls.skills.push({ id, index, item: ctx.state.gear.weapon }); return true; },
    },
    tipPosition: () => ({ x: 5, y: 1.4, z: 0 }), showReel: (on, mode = 'reel') => calls.reels.push({ on, mode }), tone() {}, vibrate() {},
    setTimeout: (run, delay) => { calls.timers.push({ run, delay }); return calls.timers.length; },
    $: () => ({ textContent: '', classList: { toggle() {} }, setAttribute() {} }),
    t: value => value, floating() {}, formatSize: cm => `${cm} cm`,
    save: () => { calls.save++; }, updateHud: () => { calls.hud++; },
    openDialog: (...args) => calls.dialogs.push(args), toast: (...args) => calls.toasts.push(args),
    emitAction: action => calls.actions.push(action), change: callback => callback(),
  });
  vm.runInContext(compiled, ctx);
  return { state, ctx, calls, pond, shore(distance) { ctx.world.position.x = pond.radius + distance; ctx.world.position.z = pond.z; ctx.updateContextWeapon(); } };
}

test('shore hysteresis swaps only at entry/exit boundaries without repeated avatar rebuilds or saves', () => {
  const f = fixture('sword_wood', 'rod'); M.equip(f.state, 'sword_wood');
  f.shore(3.1); assert.equal(f.state.gear.weapon, 'sword_wood'); assert.equal(f.calls.refresh, 0);
  f.shore(3); assert.equal(f.state.gear.weapon, 'rod');
  const equipped = f.state.counters.equipped;
  for (let i = 0; i < 600; i++) f.shore(i % 2 ? 3.01 : 3.99);
  assert.equal(f.state.gear.weapon, 'rod'); assert.equal(f.state.counters.equipped, equipped);
  assert.equal(f.calls.refresh, 1); assert.equal(f.calls.save, 1); assert.equal(f.calls.hud, 1);
  f.shore(4.01); assert.equal(f.state.gear.weapon, 'sword_wood');
  for (let i = 0; i < 600; i++) f.shore(i % 2 ? 3.01 : 3.99);
  assert.equal(f.state.gear.weapon, 'sword_wood'); assert.equal(f.calls.refresh, 2); assert.equal(f.calls.save, 2);
  f.shore(3); assert.equal(f.state.gear.weapon, 'rod'); assert.equal(f.calls.refresh, 3);
});

test('a selected creature or nearby aggressive creature overrides the rod while calm creatures do not', () => {
  const f = fixture('gun_pea', 'rod'); M.equip(f.state, 'gun_pea'); f.shore(2);
  f.ctx.world.selected = { kind: 'enemy' }; f.ctx.updateContextWeapon();
  assert.equal(f.state.gear.weapon, 'gun_pea');
  f.ctx.world.selected = null; f.ctx.updateContextWeapon(); assert.equal(f.state.gear.weapon, 'rod');
  const enemy = { kind: 'enemy', hp: 10, phase: 'chase', x: f.ctx.world.position.x + 4, z: 0 };
  f.ctx.world.enemies.push(enemy); f.ctx.updateContextWeapon(); assert.equal(f.state.gear.weapon, 'gun_pea');
  enemy.phase = 'idle'; f.ctx.updateContextWeapon(); assert.equal(f.state.gear.weapon, 'rod');
  enemy.phase = 'attack'; enemy.x += 20; f.ctx.updateContextWeapon(); assert.equal(f.state.gear.weapon, 'rod');
});

test('an explicit attack reels in active fishing and uses the owned combat weapon immediately', () => {
  const f = fixture('gun_pea', 'rod'); M.equip(f.state, 'gun_pea'); f.ctx.fish(f.pond);
  assert.ok(f.ctx.fishGame); assert.equal(f.state.gear.weapon, 'rod');
  const target = { id: 'target' }; f.ctx.basicAttack(target);
  assert.equal(f.ctx.fishGame, null); assert.equal(f.calls.cancel, 1);
  assert.deepEqual(f.calls.attacks, [{ target, kind: 'gun', item: 'gun_pea' }]);
  assert.equal(f.state.gear.weapon, 'gun_pea'); assert.ok(f.ctx.combatTimers.attackCooldown > 0);
  f.ctx.now += 2999; f.ctx.updateContextWeapon(); assert.equal(f.state.gear.weapon, 'gun_pea');
  f.ctx.now += 2; f.ctx.updateContextWeapon(); assert.equal(f.state.gear.weapon, 'rod', 'rod returns after the combat hold expires');
});

test('attack and skill controls use fists when the bag contains only a fishing rod', () => {
  const f = fixture('rod'); f.ctx.fish(f.pond); f.ctx.basicAttack();
  assert.equal(f.state.gear.weapon, undefined); assert.equal(f.calls.attacks[0].kind, 'fist');
  f.ctx.now += 4000; f.ctx.updateContextWeapon(); assert.equal(f.state.gear.weapon, 'rod');
  f.ctx.skill(3);
  assert.equal(f.state.gear.weapon, undefined);
  assert.deepEqual(f.calls.skills, [{ index: 3, special: 'fist', kind: 'fist', item: undefined }]);
  assert.ok(f.ctx.cooldowns[3] > 0); assert.equal(f.state.counters.skills, 1);
});

test('a weapon skill automatically swaps away from the rod before choosing its special', () => {
  const f = fixture('sword_tusk', 'rod'); M.equip(f.state, 'sword_tusk'); f.ctx.fish(f.pond);
  f.ctx.skill(3);
  assert.equal(f.ctx.fishGame, null);
  assert.deepEqual(f.calls.skills, [{ index: 3, special: 'gore', kind: 'sword', item: 'sword_tusk' }]);
  assert.equal(f.ctx.skillDurations[3], SPECIALS.gore.cd);
});

test('casting uses the best bag rod directly, including while wearing a combat disguise', () => {
  const disguise = Object.keys(M.DISGUISES)[0], f = fixture('rod', 'rod_gold', disguise);
  M.equip(f.state, disguise);
  assert.notEqual(M.weaponStats(f.state).kind, 'rod');
  f.ctx.fish();
  assert.equal(f.state.gear.weapon, 'rod_gold'); assert.equal(f.state.gear.disguise, disguise);
  assert.equal(f.ctx.fishGame.simulation.phase, 'cast');
  assert.equal(f.ctx.fishGame.simulation.biteWindow, 1.4 + M.ITEMS.rod_gold.weapon.quality * .6);
  assert.equal(f.ctx.fishGame.input.ready, true); assert.equal(f.calls.casts.length, 1);
  assert.equal(f.calls.dialogs.length, 0); assert.equal(f.calls.refresh, 1); assert.equal(f.calls.save, 1);
  for (let i = 0; i < 120; i++) f.ctx.updateContextWeapon();
  assert.equal(f.calls.refresh, 1); assert.equal(f.calls.save, 1, 'an active cast does not continuously equip or save');
});

test('without an owned rod casting opens the shop help and never starts a simulation', () => {
  const f = fixture('sword_wood'); f.state.gear.weapon = 'rod';
  f.ctx.fish(f.pond);
  assert.equal(f.ctx.fishGame, null); assert.equal(f.calls.casts.length, 0); assert.equal(f.calls.dialogs.length, 1);
  assert.equal(f.calls.dialogs[0][0], 'fish-help');
  assert.match(f.calls.dialogs[0][2], /data-action="go" data-kind="shop"/);
  assert.doesNotMatch(f.calls.dialogs[0][2], /equip-rod/);
  assert.equal(f.calls.refresh, 0); assert.equal(f.calls.save, 0);
  f.ctx.world.position.x = 50; f.ctx.fish(f.pond);
  assert.match(f.calls.toasts.at(-1)[0], /Walk up to a pond/); assert.equal(f.calls.dialogs.length, 1);
});

test('planet and save identity changes reset shore hysteresis and combat delay', () => {
  const f = fixture('gun_pea', 'sword_lava', 'rod'); M.equip(f.state, 'gun_pea'); f.shore(2);
  f.ctx.world.position.x = 5.5; f.state.planet = 'candy'; f.ctx.combatGearUntil = 9000;
  f.ctx.updateContextWeapon();
  assert.equal(f.ctx.gearWater, false); assert.equal(f.ctx.combatGearUntil, 0);
  assert.equal(f.state.gear.weapon, 'gun_pea', 'travel retains the chosen combat weapon');
  f.shore(2); assert.equal(f.state.gear.weapon, 'rod');
  const second = structuredClone(f.state); f.ctx.state = second; f.ctx.world.position.x = 5.5; f.ctx.combatGearUntil = 9000;
  f.ctx.updateContextWeapon();
  assert.equal(f.ctx.gearWater, false); assert.equal(f.ctx.combatGearUntil, 0);
  assert.equal(second.gear.weapon, 'sword_lava', 'the previous save choice does not leak into the new state');
  assert.equal(f.state.gear.weapon, 'rod', 'changing context never mutates the previous save');
});

test('paused, hidden, visiting and unstarted screens do not automatically change saved equipment', () => {
  for (const mode of ['blocked', 'hidden', 'visiting', 'unstarted']) {
    const f = fixture('sword_wood', 'rod'); M.equip(f.state, 'sword_wood');
    if (mode === 'blocked') f.ctx.blocked = true;
    else if (mode === 'hidden') f.ctx.document.hidden = true;
    else if (mode === 'visiting') f.ctx.visiting = 'friend';
    else f.ctx.started = false;
    f.ctx.updateContextWeapon();
    assert.equal(f.state.gear.weapon, 'sword_wood'); assert.equal(f.calls.refresh, 0); assert.equal(f.calls.save, 0);
  }
});

for (const input of ['keyboard', 'touch pad', 'moving without a route']) {
  for (const weapon of ['sword_wood', null]) {
    test(`${input} reels in the line and leaving the pond restores ${weapon ?? 'fists'} without consuming inventory`, () => {
      const f = fixture('rod', 'worm', ...(weapon ? [weapon] : []));
      if (weapon) M.equip(f.state, weapon);
      const inventory = structuredClone(f.state.bag);
      f.ctx.fish(f.pond); const simulation = f.ctx.fishGame.simulation;
      const movement = new MovementControls(f.ctx.world.keys);
      if (input === 'keyboard') movement.pressKey('ArrowRight');
      else if (input === 'touch pad') movement.pressPointer(17, 'ArrowRight');
      else f.ctx.world.moving = true;
      assert.equal(f.ctx.world.destination, null); assert.equal(f.ctx.world.route.length, 0);
      f.ctx.updateFishing(1 / 60);
      assert.equal(f.ctx.fishGame, null); assert.equal(f.calls.cancel, 1);
      assert.equal(simulation.time, 0, 'cancel before advancing fishing or consuming bait');
      assert.equal(f.ctx.world.fishing, 'idle');
      movement.clear(); f.ctx.world.moving = false; f.shore(4.1);
      assert.equal(f.state.gear.weapon ?? null, weapon);
      assert.deepEqual(f.state.bag, inventory, 'automatic rod/weapon changes never remove or duplicate items');
      assert.match(f.calls.toasts.at(-1)[0], /Fishing line reeled in/);
    });
  }
}

test('arriving at a pond clears the completed walk before the first fishing simulation step', () => {
  const f = fixture('rod');
  // World.update can reach a selected pond and call fish() in a frame whose
  // movement flag was calculated while the approach path still existed.
  f.ctx.world.moving = true; f.ctx.world.destination = { x: 5, z: 0 }; f.ctx.world.route = [{ x: 5, z: 0 }];
  f.ctx.fish(f.pond);
  assert.equal(f.ctx.world.moving, false); assert.equal(f.ctx.world.destination, null); assert.equal(f.ctx.world.route.length, 0);
  const session = f.ctx.fishGame;
  f.ctx.updateFishing(1 / 60);
  assert.equal(f.ctx.fishGame, session, 'the newly cast line must not cancel because of the completed approach');
  assert.equal(f.calls.cancel, 0); assert.equal(session.simulation.time, 1 / 60);
});

test('manual equipment, storage and save migration cannot resurrect a removed combat weapon or lose bag items', () => {
  const f = fixture('sword_wood', 'gun_pea', 'rod');
  M.equip(f.state, 'sword_wood'); f.shore(2);
  assert.ok(M.transfer(f.state, 'sword_wood', true), 'a remembered weapon may be deliberately stored while the rod is held');
  M.equip(f.state, 'gun_pea'); f.ctx.updateContextWeapon();
  assert.equal(f.state.gear.weapon, 'rod');
  const bag = structuredClone(f.state.bag), chest = structuredClone(f.state.chest);
  f.shore(4.1); assert.equal(f.state.gear.weapon, 'gun_pea');
  assert.deepEqual(f.state.bag, bag); assert.deepEqual(f.state.chest, chest);
  f.shore(2);
  assert.ok(M.sell(f.state, 'gun_pea') > 0);
  f.shore(4.1); assert.equal(f.state.gear.weapon, undefined, 'sold and stored weapons are unavailable, so use fists');
  const parsed = M.parseSave(JSON.stringify(f.state)); assert.ok(parsed);
  assert.deepEqual(parsed.bag, f.state.bag); assert.deepEqual(parsed.chest, f.state.chest);
  f.ctx.state = parsed; f.ctx.updateContextWeapon(); assert.equal(parsed.gear.weapon, undefined);
  f.shore(2); assert.equal(parsed.gear.weapon, 'rod');
  assert.deepEqual(parsed.bag, { rod: 1 }); assert.deepEqual(parsed.chest, { sword_wood: 1 });
});

function finishCatch(f) {
  f.ctx.fish(f.pond);
  const id = Object.keys(M.FISH).find(id => M.FISH[id].rarity === 'common');
  assert.ok(id);
  const simulation = f.ctx.fishGame.simulation;
  simulation.phase = 'caught'; simulation.pick = { id, size: 23, huge: false, power: M.FISH[id].power };
  f.ctx.updateFishing(1 / 60);
  assert.equal(f.ctx.fishGame, null); assert.equal(f.calls.landings.length, 1);
  assert.equal(f.state.bag[id], 1, 'earned catch is saved before its optional landing animation');
  return id;
}

test('a completed catch grants once before the landing callback displays its feedback', () => {
  const f = fixture('rod'), id = finishCatch(f);
  f.calls.landings.shift()();
  assert.equal(f.state.bag[id], 1); assert.equal(f.state.counters.fish, 1);
  assert.equal(f.state.fishRecords[id], 23);
  assert.deepEqual(f.calls.reels.at(-1), { on: true, mode: 'cast' });
  assert.equal(f.ctx.recastUntil, f.ctx.now + 6000);
});

test('a delayed catch cannot grant items, XP or UI effects after the active save changes', () => {
  const f = fixture('rod'); finishCatch(f);
  const original = structuredClone(f.state), replacement = M.newGame('Other explorer'), before = structuredClone(replacement);
  f.ctx.state = replacement;
  const reels = f.calls.reels.length, notices = f.calls.toasts.length, timers = f.calls.timers.length;
  f.calls.landings.shift()();
  assert.deepEqual(replacement, before, 'a new account/adventure must not receive the previous catch');
  assert.deepEqual(f.state, original, 'the stale callback also cannot mutate the old save');
  assert.equal(f.calls.reels.length, reels); assert.equal(f.calls.toasts.length, notices); assert.equal(f.calls.timers.length, timers);
});

test('a previous catch may land during the next cast without replacing Reel controls with Cast', () => {
  const f = fixture('rod'), id = finishCatch(f);
  f.ctx.fish(f.pond); const nextSession = f.ctx.fishGame, reels = f.calls.reels.length;
  assert.deepEqual(f.calls.reels.at(-1), { on: true, mode: 'reel' });
  f.calls.landings.shift()();
  assert.equal(f.state.bag[id], 1, 'the earned catch still belongs to this save');
  assert.equal(f.ctx.fishGame, nextSession); assert.equal(f.calls.reels.length, reels);
  assert.equal(f.ctx.recastUntil, 0, 'the old animation must not start a recast timer over the active fishing controls');
});
