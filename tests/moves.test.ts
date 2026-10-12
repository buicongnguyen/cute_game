// The four moves (src/moves.ts) as dealt by combat.ts, their air forms, the three routes and the switch-off guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatSimulation, BASE_SKILLS, type CombatEffect, type CombatHit, type CombatTarget } from '../src/combat.ts';
import * as Mv from '../src/moves.ts';
import * as J from '../src/jump-rules.ts';
import { LOOKS } from '../src/skill-visuals.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { MOVES_VI } from '../src/locales/vi-moves.ts';
import { moveDescription } from '../src/skill-info.ts';
import { arena as simArena, moveDamage, PERFECT, testFights, fight, FIGHTS } from '../promo/fight-sim.mts';

function arena(spots: Array<{ x: number; z: number; radius?: number; boss?: boolean }>, moves = true) {
  const p = { x: 0, z: 0 }; let facing = 0; const hits: Array<{ id: string; h: CombatHit }> = [], effects: CombatEffect[] = [];
  const targets: CombatTarget[] = spots.map((s, i) => ({ id: 't' + i, x: s.x, z: s.z, radius: s.radius ?? .5, boss: s.boss, hp: 1e9, maxHp: 1e9 }));
  const sim = new CombatSimulation({ position: () => p, facing: () => facing, face: a => { facing = a; }, targets: () => targets, weapon: () => ({ kind: 'fist' }), stats: () => ({ attack: 100, critChance: 0 }),
    move: (x, z) => { p.x += x; p.z += z; }, effect: e => effects.push(e), hit: (t, h) => { hits.push({ id: t.id, h }); } }, () => .5);
  sim.edge.moves = moves;
  const run = (s: number) => { for (let t = 0; t < s; t += .025) sim.update(.025, true); };
  return { sim, hits, effects, targets, p, run };
}

test('strike: three hits 80/88/112% in a 2 m front arc; the third launches a small creature, never a boss', () => {
  const a = arena([{ x: 0, z: 1.8 }, { x: 0, z: -1.8 }]); a.sim.skill(3); a.run(1);
  assert.deepEqual(a.hits.map(h => [h.id, h.h.amount]), [['t0', 80], ['t0', 88], ['t0', 112]], 'nothing behind is hit');
  assert.ok(a.hits[2].h.lift > 0 && a.hits[0].h.lift === 0);
  const b = arena([{ x: 0, z: 2, radius: 1.4, boss: true }]); b.sim.skill(3); b.run(1); assert.equal(b.hits.at(-1)!.h.lift, 0);
});
test('rush: 6 m line, 160% once each, untouchable on the way (ground marks cannot hurt)', () => {
  const a = arena([{ x: 0, z: 2 }, { x: .5, z: 5 }, { x: 3, z: 3 }]); assert.equal(a.sim.skill(1), true);
  let rushing = false; for (let t = 0; t < 1; t += .025) { a.sim.update(.025, true); if (a.sim.rushing) { rushing = true; assert.equal(a.sim.invulnerable, true); } }
  assert.ok(rushing); assert.deepEqual(a.hits.map(h => [h.id, h.h.amount]), [['t0', 160], ['t1', 160]]); assert.ok(Math.abs(a.p.z - Mv.MOVES.rush.length) < .3);
});
test('quake: 3.5 m ring after 0.35 s, 240%, launches, stuns large creatures only', () => {
  const a = arena([{ x: 0, z: 2 }, { x: 2, z: 0, radius: 1.3 }, { x: 0, z: -4.3 }]); a.sim.skill(2); a.run(.3); assert.equal(a.hits.length, 0); a.run(.2);
  assert.deepEqual(a.hits.map(h => h.id).sort(), ['t0', 't1']); assert.ok(a.hits.every(h => h.h.amount === 240 && h.h.lift > 0));
  assert.equal(a.hits.find(h => h.id === 't0')!.h.stun, 0); assert.equal(a.hits.find(h => h.id === 't1')!.h.stun, Mv.MOVES.quake.stun);
});
test('lob: aims at the chosen target, else the nearest in range, else 6.5 m ahead; lands after 0.85 s; 260% centre, 130% edge', () => {
  assert.deepEqual(Mv.lobLanding({ x: 0, z: 0 }, 0, { x: 0, z: 2 }), { x: 0, z: 4, facing: 0, distance: 4 }, 'never nearer than 4 m');
  assert.equal(Mv.lobLanding({ x: 0, z: 0 }, 0, { x: 0, z: 20 }).distance, 9); assert.equal(Mv.lobLanding({ x: 0, z: 0 }, 0).distance, 6.5);
  const a = arena([{ x: 0, z: 6 }, { x: 1.6, z: 6 }, { x: 6, z: 0 }]); a.sim.edge.target = () => a.targets[0]; a.sim.skill(0);
  assert.ok(a.effects.some(e => e.look === 'lobmark' && e.radius === 2), 'the spot is marked at once'); a.run(.8); assert.equal(a.hits.length, 0, 'still in flight'); a.run(.1);
  assert.deepEqual(a.hits.map(h => [h.id, h.h.amount]), [['t0', 260], ['t1', 130]]);
  const n = arena([{ x: -5, z: 0 }]); n.sim.skill(0); n.run(1); assert.equal(n.hits[0]?.h.amount, 260, 'nearest in range');
  const f = arena([]); f.sim.skill(0); const mark = f.effects.find(e => e.look === 'lobmark')!; assert.ok(Math.abs(mark.z - 6.5) < 1e-9);
  assert.ok(Mv.lobReaches({ x: 0, z: 0 }, { x: 9.4, z: 0, radius: .5 }) && !Mv.lobReaches({ x: 0, z: 0 }, { x: 10, z: 0, radius: .5 }));
});
test('air: spin 80% all round; dash 160% at height and turns once to the stick; sky quake by height with a cap; rain 3 x 90% in a line', () => {
  const s = arena([{ x: 0, z: 1.5 }, { x: 0, z: -1.5 }]); assert.equal(s.sim.skill(3, 'fist', { ...J.AIR, height: 1 }), true); assert.deepEqual(s.hits.map(h => h.h.amount), [80, 80]);
  const d = arena([{ x: 0, z: 2 }]); d.sim.edge.stick = () => Math.PI / 2; d.sim.skill(1, 'fist', { ...J.AIR, height: 1 }); d.run(.4);
  assert.equal(d.hits[0].h.amount, 160); assert.ok(d.p.x > 1, 'it turned towards the stick once');
  assert.ok(Mv.skyQuakePower(0) < Mv.skyQuakePower(2) && Mv.skyQuakePower(2) === 2.5 && Mv.skyQuakePower(J.MAX_HEIGHT) === 4);
  const q = arena([{ x: 0, z: 4 }, { x: 0, z: 1, boss: true }]); q.targets[1].maxHp = 1000; q.sim.skill(2, 'fist', { ...J.AIR, height: J.MAX_HEIGHT }); assert.equal(q.sim.plunging, true); assert.equal(q.sim.land(), true);
  assert.equal(q.hits.find(h => h.id === 't0')!.h.amount, 400); assert.equal(q.hits.find(h => h.id === 't1')!.h.amount, 150, 'capped at 15% of a boss');
  const r = arena([{ x: 0, z: 0, radius: .4 }, { x: 0, z: 1.3, radius: .4 }, { x: 0, z: 2.6, radius: .4 }]); r.sim.skill(0, 'fist', { ...J.AIR, height: 1 }); r.run(1);
  assert.ok(r.hits.length >= 3 && r.hits.every(h => h.h.amount === 90)); assert.equal(new Set(r.hits.map(h => h.id)).size, 3); assert.deepEqual(Mv.rainPoints({ x: 0, z: 0 }, 0).map(p => p.z), [0, 1.3, 2.6]);
});
test('ten seconds of each move used perfectly are roughly equal, and each of the four is best in one test fight', () => {
  const ten = Mv.MOVE_SLOTS.map(m => moveDamage(m, [PERFECT[m]])); assert.ok(Math.max(...ten) / Math.min(...ten) < 1.25, ten.join(' '));
  assert.deepEqual(new Set(testFights().map(f => f.best)), new Set(Mv.MOVE_SLOTS)); void simArena;
});
test('the three routes win on King Bear with the combo and finishers', () => {
  const f = FIGHTS[0]; for (const route of ['ground', 'launch', 'chase'] as const) { const r = fight(f.boss, f.planet, f.at, f.level, f.gear, route, 1); assert.ok(r.won && r.routes > 3 && r.finishers > 0, route); }
});
test('switch off: the four old skills, byte for byte', () => {
  const a = arena([{ x: 0, z: 1.5 }], false); a.sim.skill(0); a.run(2.4); assert.equal(a.hits.length, 10); assert.ok(a.hits.every(h => h.h.amount === 55));
  assert.deepEqual(BASE_SKILLS.map(s => s.cd), [7, 4, 9]);
  const w = arena([{ x: 0, z: 2 }], false); w.sim.skill(1); w.run(.3); assert.equal(w.hits[0].h.amount, 170);
});
test('looks, Vietnamese and descriptions', () => {
  for (const look of ['lob', 'lobmark', 'petalfall', 'petalburst']) assert.equal(typeof LOOKS[look], 'function');
  for (const [k, v] of Object.entries(MOVES_VI)) { assert.equal(VI_PACK[k], v); assert.deepEqual(v.match(/\{\w+\}/g), k.match(/\{\w+\}/g)); }
  for (let i = 0; i < 4; i++) assert.ok(moveDescription(i).length > 40);
});


test('an unfinished strike cannot be bypassed by changing outfit or turning moves off', () => {
  const a = arena([{ x: 0, z: 1 }]);
  assert.equal(a.sim.skill(3), true);
  assert.equal(a.sim.disguise('dz_knight', 0), false);
  a.sim.edge.moves = false;
  assert.equal(a.sim.skill(0), false);
  a.run(1);
  assert.equal(a.sim.skill(0), true);
});
