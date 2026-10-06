import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/item-power.ts';
import { applyGameAction } from '../src/actions.ts';
import { CombatSimulation } from '../src/combat.ts';
import { huntingPonds, fishHuntTarget, huntFish } from '../src/fish-hunting.ts';
import { t, setLanguage } from '../src/i18n.ts';
import { HELP_TOPICS } from '../src/help-topics.ts';

// w25: the user's option 2 for the harpoon: ϟ1000 and +100 attack, still the fish-hunting tool and a fighting weapon.
test('the harpoon costs 1000 energy in the shop and as a recipe, and gives +100 attack', () => {
  const item = M.ITEMS.harpoon;
  assert.equal(item.price, 1000); assert.equal(item.attack, 100); assert.equal(item.stats?.atk, 100); assert.equal(item.sell, 400);
  assert.deepEqual(M.SHOP_CATEGORIES.find(c => c.tab === 'Weapons')!.items.find(i => i.id === 'harpoon'), { id: 'harpoon', cost: 1000 });
  assert.deepEqual(M.RECIPES.filter(r => r.result === 'harpoon').map(r => [r.energy, r.station]), [[1000, 'shop']]);
  const s = M.newGame(); s.energy = 999; assert.equal(M.buy(s, 'harpoon'), false, 'one short of 1000');
  s.energy = 1000; assert.equal(M.buy(s, 'harpoon'), true); assert.equal(s.energy, 0); assert.equal(M.equip(s, 'harpoon'), true);
  const bare = M.newGame(); assert.equal(M.attack(s) - M.attack(bare), 100, 'the full +100 reaches the attack stat');
  assert.match(item.desc, /\+100 attack/); assert.ok(HELP_TOPICS.some(([, , body]) => body.includes('1000 energy') && body.includes('+100 attack')));
  setLanguage('vi'); try { assert.match(t(item.desc), /\+100 tấn công/); assert.equal(t('Lake Guardian'), 'Cá Thần Hồ'); } finally { setLanguage('en'); }
});

test('the harpoon keeps its fish hunting: an equipped harpoon still catches pond fish, other weapons cannot', () => {
  const pond = huntingPonds('home')[0], shore = { x: pond.x, z: pond.z + pond.rz + .6 }, now = 5_000_000, target = fishHuntTarget(pond, 0, now)!;
  const s = M.newGame(); s.bag.harpoon = 1; s.gear.weapon = 'harpoon';
  const hit = applyGameAction(s, { type: 'fishHunt', payload: { weaponId: 'harpoon', pondId: pond.id, slot: 0, aim: { x: target.x, z: target.z }, from: shore } }, { now, random: () => .5 }) as { hit: boolean; id: string };
  assert.equal(hit.hit, true); assert.equal(s.bag[hit.id], 1); assert.equal(s.bag.harpoon, 1, 'reusable');
  const sword = M.newGame(); sword.bag.sword_lava = 1; sword.gear.weapon = 'sword_lava';
  assert.equal(huntFish(sword, { weaponId: 'harpoon', pondId: pond.id, slot: 0, aim: target }, shore, now), null);
});

test('the harpoon still fights: a ranged throw that lands the +100 attack on a creature', () => {
  const s = M.newGame(); s.bag.harpoon = 1; M.equip(s, 'harpoon');
  const target = { id: 'boar', x: 0, z: 8, hp: 10_000, radius: .8 }, hits: number[] = [];
  const sim = new CombatSimulation({ position: () => ({ x: 0, z: 0 }), facing: () => 0, face() {}, targets: () => [target], weapon: () => M.weaponStats(s), stats: () => ({ ...M.activeStats(s), critChance: 0 }), move() {}, hit(e, h) { hits.push(h.amount); e.hp -= h.amount; return h.amount; }, effect() {} }, () => .5);
  assert.equal(sim.basic(target), true); for (let i = 0; i < 40; i++) sim.update(.05);
  assert.equal(hits.length, 1); assert.equal(hits[0], Math.round(M.attack(s)), 'one throw, 10 base + 100');
  assert.equal(M.weaponStats(s).range, 11); assert.equal(M.weaponStats(s).cd, 1.3);
});

test('item power: 100 / 1.3 s = 76.9/s, between the lava sword and the moon scythe; the biggest single hit', () => {
  assert.ok(Math.abs(P.itemScore('harpoon') - 100 / 1.3) < 1e-9); assert.equal(P.powerLabel('harpoon'), '⚔️ 76.9/s');
  assert.ok(P.itemScore('sword_lava') < P.itemScore('harpoon') && P.itemScore('harpoon') < P.itemScore('scythe_moon'));
  assert.ok(P.itemScore('harpoon') < P.itemScore('blaster_rainbow'), 'the rainbow blaster keeps the best basic DPS');
  const weapons = Object.keys(M.ITEMS).filter(id => P.powerKind(M.ITEMS[id]) === 'weapon' && id !== 'harpoon');
  assert.ok(weapons.every(id => (M.ITEMS[id].stats?.atk ?? M.ITEMS[id].attack ?? 0) < 100), 'no other weapon hits as hard per throw');
});

test('a disguise fights with its own weapon: the hidden harpoon adds no attack and no forge bonus', () => {
  const bare = M.newGame(); bare.level = 10;
  const s = M.newGame(); s.level = 10; M.addItem(s, 'harpoon'); assert.equal(M.equip(s, 'harpoon'), true);
  const harpoon = M.attack(s, 0); assert.ok(harpoon >= M.attack(bare, 0) + 100, 'the harpoon alone adds its +100');
  M.addItem(s, 'dz_dino'); assert.equal(M.equip(s, 'dz_dino'), true); assert.equal(s.gear.weapon, 'harpoon');
  M.addItem(bare, 'dz_dino'); assert.equal(M.equip(bare, 'dz_dino'), true);
  assert.equal(M.attack(s, 0), M.attack(bare, 0), 'harpoon + dz_dino attacks exactly like dz_dino alone');
  assert.ok(M.attack(s, 0) < harpoon);
  s.forge = { harpoon: 50 } as typeof s.forge; assert.equal(M.attack(s, 0), M.attack(bare, 0), 'no forge bonus from the hidden weapon');
  M.unequip(s, 'disguise'); assert.ok(M.attack(s, 0) > harpoon, 'the forge bonus is back once the disguise comes off');
});
