import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { HARVEST, HIT_FLASH, HURT_TINT, MELEE_ARC, STACK, enemyFlash, harvestArc, inMeleeArc, meleeArc, nextStackSlot, stackLift, SKILL_NAME_RISE } from '../src/feel-rules.ts';
import { CombatSimulation, type CombatEffect, type CombatTarget } from '../src/combat.ts';
import { DisguiseFx } from '../src/disguise-fx.ts';
import { LOOK_DENSITY, WHIRL_PULSE, whirlRing } from '../src/skill-visuals.ts';
import { TelegraphDecals } from '../src/telegraph.ts';
import { CROP_BOOST, STAGE_SCALE, TREE_BOOST, stageScale } from '../src/crop-cards.ts';
import { CREATURE_TELEGRAPHS } from '../src/boss-patterns.ts';

test('harvest beat: ring and label at once, the crop lands on the collector in 0.45 s, XP after it lands, about 0.85 s in all', () => {
  assert.equal(HARVEST.flight, .45); assert.ok(HARVEST.xpDelay > HARVEST.flight && HARVEST.xpDelay <= .55, 'XP pops just after the crop arrives (the reference: 500 ms)');
  assert.ok(HARVEST.total >= HARVEST.xpDelay + .3 && HARVEST.total <= .9);
  assert.ok(HARVEST.ring.to > 1 && HARVEST.ring.life <= HARVEST.flight);
  const from = { x: 0, y: .22, z: 0 }, to = { x: 3, y: 1.1, z: -1 };
  const start = harvestArc(0, from, to); assert.deepEqual([start.x, start.y, start.z, start.scale, start.done], [0, .22, 0, 1, false]);
  const mid = harvestArc(HARVEST.flight / 2, from, to);
  assert.ok(mid.y > (from.y + to.y) / 2 + HARVEST.peak * .99, 'arcs up over the straight line');
  assert.ok(Math.abs(mid.x - 1.5) < 1e-9 && mid.scale < 1 && mid.scale > HARVEST.endScale);
  const end = harvestArc(HARVEST.flight, from, to);
  assert.ok(end.done); assert.ok(Math.hypot(end.x - to.x, end.y - to.y, end.z - to.z) < 1e-9, 'lands exactly on the collector'); assert.ok(Math.abs(end.scale - HARVEST.endScale) < 1e-9);
  assert.ok(harvestArc(5, from, to).done);
  // The ground track only moves forward (no overshoot), so a crop never flies past a helper.
  let last = -1; for (let t = 0; t <= HARVEST.flight; t += .01) { const a = harvestArc(t, from, to); assert.ok(a.x >= last - 1e-9); last = a.x; }
});

test('hit confirm: creatures flash white for 0.14 s (titans barely), the explorer glows pink for 0.25 s', () => {
  assert.equal(HIT_FLASH.enemy, .14); assert.equal(HIT_FLASH.hero, .25);
  assert.equal(enemyFlash(HIT_FLASH.enemy), HIT_FLASH.white); assert.equal(enemyFlash(.001), HIT_FLASH.white); assert.equal(enemyFlash(0), 0);
  assert.equal(enemyFlash(.1, true), HIT_FLASH.titan); assert.ok(HIT_FLASH.titan < HIT_FLASH.white);
  const [r, g, b] = HURT_TINT; assert.ok(r > .8 && b > g && b > .4, 'pink, not plain red');
});

test('melee arc: a 120° wedge of the creature\'s real reach, in front of it', () => {
  const arc = meleeArc(1.6); assert.ok(Math.abs(arc.r - 2) < 1e-9); assert.ok(Math.abs(arc.half * 2 - Math.PI * 2 / 3) < 1e-9);
  assert.equal(meleeArc(0).r, .8);
  assert.ok(inMeleeArc(0, 0, 0, 1.6, 0, 1.9)); assert.ok(!inMeleeArc(0, 0, 0, 1.6, 0, 2.1), 'past reach + 0.4');
  assert.ok(!inMeleeArc(0, 0, 0, 1.6, 0, -1), 'not behind'); assert.ok(inMeleeArc(0, 0, Math.PI / 2, 1.6, 1.5, 0), 'turns with the creature');
  assert.ok(!inMeleeArc(0, 0, 0, 1.6, 1.5, .2), 'not at its side'); assert.equal(MELEE_ARC.color, '#ff3b3b');
  // The four reference kinds keep their own discs.
  assert.deepEqual(Object.keys(CREATURE_TELEGRAPHS).sort(), ['chomper', 'firebat', 'lavaworm', 'magmaturtle']);
});

test('the arc decal fills from the creature to its rim and turns with it; discs and arcs share the pool frame', () => {
  const decals = new TelegraphDecals();
  decals.begin(); decals.cone(2, .04, 3, 2, 1.2, MELEE_ARC.half, .5, MELEE_ARC.color); decals.draw(0, .04, 0, 2.6, 1, '#ff3b3b'); decals.end();
  assert.deepEqual(decals.activeArcs.map(a => ({ ...a, fill: +a.fill.toFixed(3) })), [{ x: 2, z: 3, r: 2, facing: 1.2, fill: .5 }]);
  assert.equal(decals.active.length, 1);
  const wedge = decals.root.children.find(g => g.visible && g.children.some(m => m.name === 'attack-telegraph-arc'))!;
  const fill = (wedge.children[0] as T.Mesh).geometry; fill.computeBoundingBox();
  assert.ok(fill.boundingBox!.max.z > .99 && fill.boundingBox!.min.z > -1e-6, 'the wedge opens toward +z (the creature\'s facing)');
  decals.begin(); decals.end(); assert.equal(decals.activeArcs.length, 0); assert.ok(!wedge.visible, 'hidden when no creature winds up');
});

test('damage numbers stack upward while blows keep landing, then start again', () => {
  assert.equal(nextStackSlot(0, 0, .3), 1); assert.equal(nextStackSlot(3, 1, 1 + STACK.gap - .01), 4);
  assert.equal(nextStackSlot(STACK.max - 1, 0, .1), 0); assert.equal(nextStackSlot(2, 0, STACK.gap + .01), 0);
  assert.equal(stackLift(0), 0); assert.ok(stackLift(2) > stackLift(1) && stackLift(STACK.max - 1) < 1.6);
  assert.ok(SKILL_NAME_RISE > .5, 'the skill name floats over the head, above the numbers');
});

test('whirlwind: one thin swelling ring about the hero\'s size, its hit ticks draw nothing more', () => {
  for (let a = 0; a < 2.2; a += .05) { const ring = whirlRing(a, 2.8); assert.ok(ring.r <= 2.8 * .66 && ring.r >= 2.8 * .25 - 1e-9); }
  assert.ok(whirlRing(WHIRL_PULSE * .99, 2.8).r > whirlRing(WHIRL_PULSE * .1, 2.8).r);
  const fx = new DisguiseFx({ ground: () => 0, explorerAt: () => null });
  fx.play({ look: 'whirl', kind: 'cast', x: 0, z: 0, radius: 2.8, color: '#e5f6ff', duration: 2.2 });
  for (let i = 0; i < 40; i++) { fx.update(.05); assert.ok(fx.maxPainted <= 6, `painted ${fx.maxPainted}`); }
  assert.ok(LOOK_DENSITY < 1);
  const p = { x: 0, z: 0 }, effects: CombatEffect[] = [], targets: CombatTarget[] = [{ id: 'a', x: 0, z: 1.5, hp: 1e6, maxHp: 1e6, radius: .5 }];
  const sim = new CombatSimulation({ position: () => p, facing: () => 0, face: () => {}, targets: () => targets, weapon: () => ({ kind: 'fist' }), stats: () => ({ attack: 10, critChance: 0 }),
    move: () => {}, hit: (t, h) => { t.hp -= h.amount; return h.amount; }, effect: e => effects.push(e) }, () => .5);
  sim.skill(0); for (let i = 0; i < 120; i++) sim.update(.025);
  const drawn = effects.filter(e => !e.quiet), ticks = effects.filter(e => e.quiet);
  assert.equal(drawn.length, 1); assert.equal(drawn[0].look, 'whirl'); assert.equal(ticks.length, 10, 'ten hits, all quiet');
  assert.ok(targets[0].hp < 1e6, 'quiet ticks still hit');
});

test('ninja clones: four small puffs behind the clones, no big cloud over them', () => {
  const p = { x: 0, z: 0 }, effects: CombatEffect[] = [];
  const sim = new CombatSimulation({ position: () => p, facing: () => 0, face: () => {}, targets: () => [], weapon: () => ({ kind: 'fist' }), stats: () => ({ attack: 10, critChance: 0, maxHp: 100 }),
    move: () => {}, hit: () => 0, effect: e => effects.push(e) }, () => .5);
  assert.ok(sim.disguise('dz_ninja', 0)); assert.equal(sim.allies.filter(a => a.kind === 'clone').length, 4, 'the clones exist on the cast frame');
  const puffs = effects.filter(e => e.look === 'poof');
  assert.equal(puffs.length, 4); for (const e of puffs) { assert.ok(e.radius <= .5 && (e.duration ?? 1) <= .35); }
  for (const clone of sim.allies) { const nearest = Math.min(...puffs.map(e => Math.hypot(e.x - clone.x, e.z - clone.z))); assert.ok(nearest < .5 && Math.hypot(clone.x - p.x, clone.z - p.z) > Math.hypot(puffs[0].x - p.x, puffs[0].z - p.z) - 1e-9, 'puff sits just behind the clone'); }
});

test('ripe crops are big characters, growing stages smaller; fruit trees keep their sizes', () => {
  assert.deepEqual(STAGE_SCALE, [0, 1.4, .55, 1.25]);
  assert.ok(CROP_BOOST[3] >= 1.8, 'ripe crops at least 1.8x the old size'); assert.equal(CROP_BOOST[1], 1);
  const ripe = stageScale('radish', 3), young = stageScale('radish', 2);
  assert.ok(young < ripe * .45, 'a young plant stays well under half the ripe size');
  assert.equal(stageScale('apple', 3), STAGE_SCALE[3] * TREE_BOOST[3], 'trees: their own boost only');
});
