import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { CombatSimulation, DISGUISE_LOOKS, type CombatEffect, type CombatTarget } from '../src/combat.ts';
import { DISGUISE_INFO } from '../src/skill-info.ts';
import { DisguiseFx } from '../src/disguise-fx.ts';
import { LOOKS, LOOK_LIFE, MAX_PER_CAST } from '../src/skill-visuals.ts';

const host = { ground: () => 0, explorerAt: () => null };
function arena() {
  const p = { x: 0, z: 0 }, effects: CombatEffect[] = [];
  const targets: CombatTarget[] = [{ id: 'a', x: 0, z: 2, hp: 1e6, maxHp: 1e6, radius: .5 }, { id: 'b', x: 4, z: 8, hp: 1e6, maxHp: 1e6, radius: .5 }];
  const sim = new CombatSimulation({ position: () => p, facing: () => 0, face: () => {}, targets: () => targets, weapon: () => ({ kind: 'fist' }), stats: () => ({ attack: 10, critChance: 0 }),
    move: (x, z) => { p.x += x; p.z += z; }, moveTarget: (t, x, z) => { t.x = x; t.z = z; }, hit: (t, h) => { t.hp -= h.amount; return h.amount; }, effect: e => effects.push(e), status: () => {}, heal: () => {} }, () => .5);
  return { sim, effects };
}

test('every look has a builder and a sane life', () => {
  for (const look of DISGUISE_LOOKS) assert.equal(typeof LOOKS[look], 'function', look);
  for (const [look, life] of Object.entries(LOOK_LIFE)) { assert.ok(LOOKS[look], look); assert.ok(life > 0 && life <= 12); }
});

test('every look an emitted effect carries is drawn by DisguiseFx', () => {
  const seen = new Set<string>();
  const run = (go: (s: CombatSimulation) => void) => { const a = arena(); go(a.sim); for (let i = 0; i < 400; i++) a.sim.update(.025); for (const e of a.effects) if (e.look) seen.add(e.look); };
  for (let i = 0; i < 3; i++) run(s => s.skill(i, 'fist'));
  for (const id of ['volley', 'anchor', 'lotus', 'dragon', 'eagle', 'goldstar', 'wave', 'tsunami', 'magma', 'thunder', 'bonk', 'whirl', 'starfall', 'inferno', 'laser']) run(s => s.special(id));
  for (const id of Object.keys(DISGUISE_INFO)) for (let slot = 0; slot < 4; slot++) run(s => s.disguise(id, slot));
  const fx = new DisguiseFx(host);
  for (const look of seen) if (look !== 'eyes' && look !== 'burn' && look !== 'shock' && look !== 'boulder') assert.equal(fx.play({ look, kind: 'cast', x: 0, z: 0, radius: 3, color: '#ffffff' } as CombatEffect), true, look);
  for (const look of ['anchor', 'bolt', 'rainbow', 'shield', 'blast', 'surf', 'lotus', 'crater', 'iceage', 'rush', 'bats']) assert.ok(seen.has(look), `${look} is emitted by combat`);
});

test('each look stays within the per-cast budget at every moment and paints finite transforms', () => {
  const fx = new DisguiseFx(host);
  for (const look of DISGUISE_LOOKS) for (const radius of [1, 4, 10]) {
    fx.clear(); fx.play({ look, kind: 'cast', x: 1, z: 2, radius, color: '#88ccff', duration: 2, facing: 1 });
    for (let i = 0; i < 40; i++) { fx.update(.05); assert.ok(fx.maxPainted <= MAX_PER_CAST, `${look} ${radius}`); }
    for (const child of fx.root.children) { const b = child as T.InstancedMesh; for (const v of b.instanceMatrix.array.slice(0, b.count * 16)) assert.ok(Number.isFinite(v), look); }
  }
});

test('repeated casts are pooled: batches and geometry never grow and everything is released', () => {
  const fx = new DisguiseFx(host), geos = fx.root.children.map(c => (c as T.Mesh).geometry), children = fx.root.children.length;
  for (let round = 0; round < 30; round++) for (const look of DISGUISE_LOOKS) { fx.play({ look, kind: 'cast', x: round, z: 0, radius: 5, color: '#ffffff', duration: .3 }); fx.update(.1); }
  assert.ok(fx.count <= 48);
  fx.update(20); assert.equal(fx.count, 0); assert.ok(fx.root.children.every(c => !c.visible && (c as T.InstancedMesh).count === 0));
  assert.equal(fx.root.children.length, children); assert.deepEqual(fx.root.children.map(c => (c as T.Mesh).geometry), geos);
});

test('low density paints fewer instances', () => {
  let density = 1; const fx = new DisguiseFx({ ...host, density: () => density });
  fx.play({ look: 'smoke', kind: 'cast', x: 0, z: 0, radius: 5, color: '#fff', duration: 5 }); const full = fx.maxPainted;
  density = .25; fx.update(.01); assert.ok(fx.maxPainted < full);
});
