import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { attackIntent, inFight, FIGHT, USE_AFTER_SWING_S } from '../src/attack-intent.ts';
import { mainHarness } from './support/main-harness.mjs';
import { pokeTarget, fencePoint, PokeGate, VillageFun, POKE, type PokeThing } from '../src/village-fun.ts';
import { PondSplash, type SplashPond } from '../src/pond-splash.ts';

const press = (o: Partial<Parameters<typeof attackIntent>[0]> = {}) => attackIntent({ hostile: false, usable: true, fresh: true, sinceSwing: 10, ...o });

test('Attack uses the thing beside you only when no creature is near, on a fresh press, and not right after a swing', () => {
  assert.equal(press(), 'use', 'beside the workshop, nothing hostile: open it');
  assert.equal(press({ hostile: true }), 'attack', 'a creature in reach or targeted always wins');
  assert.equal(press({ usable: false }), 'attack', 'nothing to use: swing');
  assert.equal(press({ fresh: false }), 'attack', 'a held Attack (power strike, auto swings) never opens a dialog');
  assert.equal(press({ sinceSwing: USE_AFTER_SWING_S - .1 }), 'attack', 'a chain that ends beside the chest keeps swinging');
  assert.equal(press({ sinceSwing: USE_AFTER_SWING_S }), 'use');
});

test('in a fight Attack always attacks: beside a usable thing, on a fresh press, long after the last swing', () => {
  assert.equal(press({ fight: true }), 'attack', 'the shop is one step away, a creature is near: swing');
  assert.equal(press({ fight: true, sinceSwing: 1e9 }), 'attack');
  assert.equal(press({ fight: true, hostile: true }), 'attack');
  assert.equal(press({ fight: false }), 'use', 'out of a fight Attack is still the use button');
  for (const hostile of [false, true]) for (const usable of [false, true]) for (const fresh of [false, true]) for (const sinceSwing of [0, 10]) {
    const now = attackIntent({ hostile, usable, fresh, sinceSwing, fight: false }), before = !hostile && usable && fresh && sinceSwing >= USE_AFTER_SWING_S ? 'use' : 'attack';
    assert.equal(now, before, 'fight=false keeps the table as it was'); assert.equal(attackIntent({ hostile, usable, fresh, sinceSwing }), before, 'and so does leaving it out');
    assert.equal(attackIntent({ hostile, usable, fresh, sinceSwing, fight: true }), 'attack');
  }
});

const foe = (x: number, o: { hp?: number; phase?: string; tutorial?: boolean; visible?: boolean } = {}) => ({ x, z: 0, hp: o.hp ?? 10, phase: o.phase ?? 'idle', tutorial: o.tutorial, mesh: { visible: o.visible ?? true } });
const angry = (e: { phase: string }) => e.phase !== 'idle' && e.phase !== 'return';
test('a fight is on: an angry creature within 8 m, any living creature within 6 m, a creature of the first fight within 10 m', () => {
  assert.deepEqual(FIGHT, { aggro: 8, hostile: 6, lesson: 10, lessonSwing: 4 });
  assert.equal(inFight([], 0, 0, angry), false);
  assert.equal(inFight([foe(5.9)], 0, 0, angry), true, 'a calm creature 5.9 m away');
  assert.equal(inFight([foe(6.1)], 0, 0, angry), false, 'a calm creature 6.1 m away: Attack still uses');
  assert.equal(inFight([foe(7.9, { phase: 'chase' })], 0, 0, angry), true, 'an angry one 7.9 m away');
  assert.equal(inFight([foe(8.1, { phase: 'chase' })], 0, 0, angry), false);
  assert.equal(inFight([foe(9.9, { tutorial: true })], 0, 0, angry), true, 'the first fight: 9.9 m');
  assert.equal(inFight([foe(10.1, { tutorial: true })], 0, 0, angry), false);
  assert.equal(inFight([{ ...foe(3, { tutorial: true, hp: 0 }), respawn: 5 }], 0, 0, angry), true, 'the first fight: all three fell and come back in 5 s; Attack still opens nothing');
  assert.equal(inFight([{ ...foe(3, { tutorial: true, hp: 0, visible: false }), respawn: 999_999 }], 0, 0, angry), false, 'the step is done: they are gone for good');
  assert.equal(inFight([foe(14, { tutorial: true })], 0, 0, angry, 3.9), true, 'the first fight: its creatures are 14 m off, but the last swing was 3.9 s ago (beside the garden beds)');
  assert.equal(inFight([foe(14, { tutorial: true })], 0, 0, angry, 4.1), false, 'four quiet seconds: Attack plants again');
  assert.equal(inFight([foe(14)], 0, 0, angry, 0), false, 'only the first fight step has this: a swing elsewhere changes nothing');
  assert.equal(inFight([{ ...foe(14, { tutorial: true, hp: 0, visible: false }), respawn: 999_999 }], 0, 0, angry, 0), false);
  assert.equal(inFight([foe(1, { hp: 0 }), foe(1, { visible: false })], 0, 0, angry), false, 'a fallen or hidden creature is no fight');
  assert.equal(inFight([foe(40), foe(3)], 0, 0, angry), true);
});

// main.ts for real (tests/support/main-harness.mjs): F and the phone's Attack ask one rule, useInstead, before they swing.
const main = await mainHarness({ functions: ['attackUses', 'useInstead', 'hostileNear', 'interactPrompted', 'fKey'], variables: ['lastSwingAt'] });
function atTheShop(enemies: unknown[] = []) {
  const used: string[] = [], shop = { kind: 'shop', x: 1, z: 0, radius: 2 };
  const world = { position: { x: 0, z: 0 }, enemies, selected: null, jump: null, inReach: () => true, select: (e: { kind: string }) => used.push('use:' + e.kind), interactNearest: () => false, nearest: () => null };
  const ctx = main.context({ world, state: {}, started: true, uiBlocked: () => false, promptTarget: () => shop, attackRange: () => 2, airOn: () => false, basicAttack: () => used.push('swing'), attackDown: () => used.push('swing'), attackHold: { down() {} }, M: { weaponStats: () => ({}) }, performance: { now: () => 1e7 } });
  return { ctx, used };
}
test('F and the phone Attack beside the shop: it opens out of a fight, and never in one', () => {
  const calm = atTheShop(); assert.equal(calm.ctx.useInstead(true), true); assert.deepEqual(calm.used, ['use:shop'], 'nothing near: Attack opens the shop');
  const key = atTheShop(); key.ctx.fKey('KeyF'); assert.deepEqual(key.used, ['use:shop'], 'F follows the same rule');
  const held = atTheShop(); assert.equal(held.ctx.useInstead(false), false, 'a held Attack never uses');
  for (const [what, enemy] of [['a calm creature 5 m away', foe(5)], ['an angry one 7 m away', foe(7, { phase: 'chase' })], ['a creature of the first fight 9 m away', foe(9, { tutorial: true })]] as const) {
    const fight = atTheShop([{ ...enemy, radius: .5 }]);
    assert.equal(fight.ctx.useInstead(true), false, what); assert.deepEqual(fight.used, [], 'the shop stays shut');
    fight.ctx.fKey('KeyF'); assert.ok(!fight.used.includes('use:shop'), 'F too: ' + what);
  }
  const far = atTheShop([{ ...foe(6.5), radius: .5 }]); assert.equal(far.ctx.useInstead(true), true, 'a calm creature 6.5 m away is no fight');
});

const things: PokeThing[] = [{ id: 'tree', kind: 'tree', x: 0, z: 2, r: .9 }, { id: 'stall', kind: 'bump', x: 2.5, z: 0, r: 1 }, { id: 'hen', kind: 'happy', x: 0, z: -1.2, r: .3 }];
test('a swing meets the nearest thing in front, or one right beside; nothing behind or out of reach', () => {
  assert.equal(pokeTarget(things, 0, 0, 0, 2)?.id, 'tree', 'facing +z: the tree');
  assert.equal(pokeTarget(things, 0, 0, Math.PI / 2, 2)?.id, 'stall', 'facing +x: the stall');
  assert.equal(pokeTarget(things, 0, 0, Math.PI, 2)?.id, 'hen', 'facing -z: the hen, gently');
  assert.equal(pokeTarget(things, 0, 0, -Math.PI / 2, .5), null, 'facing -x, short reach: nothing');
  assert.equal(pokeTarget([{ id: 'b', kind: 'bump', x: -.9, z: 0, r: .5 }], 0, 0, 0, 1)?.id, 'b', 'right beside counts whatever the facing');
});
test('the fence is met only near the ring of the village fence', () => {
  assert.deepEqual(fencePoint(16.5, 0, 18, 2), { x: 18, z: 0 }); assert.equal(fencePoint(10, 0, 18, 2), null); assert.equal(fencePoint(0, 0, 18, 2), null);
});
test('each thing rests between reactions; a tree shakes and comes back upright; nothing is allocated per frame once still', () => {
  const g = new PokeGate(); assert.ok(g.ready('a', 0)); assert.ok(!g.ready('a', POKE.rest - .1)); assert.ok(g.ready('a', POKE.rest + .01));
  const bursts: unknown[] = [], fx = { burst: (...a: unknown[]) => bursts.push(a) } as never; let now = 0;
  const fun = new VillageFun(() => fx, () => now), tree = new T.Group();
  assert.ok(fun.poke({ id: 't', kind: 'tree', x: 0, z: 2, r: .9, obj: tree }, 0, 0)); assert.equal(bursts.length, 1, 'a puff of leaves');
  assert.ok(!fun.poke({ id: 't', kind: 'tree', x: 0, z: 2, r: .9, obj: tree }, 0, 0), 'resting');
  fun.update(.1); assert.ok(Math.abs(tree.rotation.x) + Math.abs(tree.rotation.z) > 0, 'it sways');
  for (let i = 0; i < 10; i++) fun.update(.1); assert.equal(tree.rotation.x, 0); assert.equal(tree.rotation.z, 0);
  now = 1; assert.ok(fun.poke({ id: 'hen', kind: 'happy', x: 1, z: 0, r: .3 }, 0, 0)); assert.equal(bursts.length, 2, 'hearts, never harm');
});
test('a plain swing at the water splashes the pond (with its rest); one away from it does not', () => {
  const pond: SplashPond = { id: 'p', x: 0, z: 4, r: 2, surface: .1, waterId: 'home' }, fx = { density: 1, burst() {}, ring() {} } as never;
  const s = new PondSplash({ root: () => null, fx: () => fx, ponds: () => [pond], fish: () => null, species: () => 'fish_carp', now: () => 0, reduced: () => false });
  assert.equal(s.swing(0, 0, Math.PI, 2), false, 'facing away');
  assert.equal(s.swing(0, 0, 0, 2), true, 'facing the water from its edge');
  assert.equal(s.swing(0, 0, 0, 2), false, 'the pond rests between splashes');
});
