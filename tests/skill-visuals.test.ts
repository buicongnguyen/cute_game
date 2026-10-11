import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { CombatSimulation, DISGUISE_KITS, DISGUISE_LOOKS, DZ, type CombatEffect, type CombatTarget } from '../src/combat.ts';
import { DISGUISE_INFO } from '../src/skill-info.ts';
import { DisguiseFx } from '../src/disguise-fx.ts';
import { BLAST_CORE, BLAST_POP, LOOKS, LOOK_LIFE, MAX_PER_CAST, type Painter, type Shape } from '../src/skill-visuals.ts';
import { CombatView, TRAIL_GROW } from '../src/combat-view.ts';
import { BEAM_OPACITY } from '../src/summon-art.ts';

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

// ---- Drawn size against hit size (the attack-visual audit of 2026-10-11): an effect must not look bigger than what it hits.
const FLAT = new Set<Shape>(['ring', 'gring', 'petal']), BOXES = new Set<Shape>(['box', 'gbox']), OUTLINES = new Set<Shape>(['ring', 'gring', 'dome']);
/**
 * Plays a look with a recording painter and returns, over its whole life: `all` the furthest any piece reaches from the
 * cast centre (m, on the ground plane), and `fill` the widest single piece that is not an outline (its half-width).
 * Pieces under 12 cm (sparkles) are ignored. `from`/`to` limit the moments looked at (shares of its life).
 */
function drawnSize(look: string, radius: number, life: number, from = 0, to = 1) {
  let all = 0, fill = 0;
  const painter: Painter = { put(kind, _color, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
    if (Math.max(sx, sy, sz) * (BOXES.has(kind) ? 1 : 2) < .12) return;
    const cx = Math.cos(rx), sX = Math.sin(rx), cy = Math.cos(ry), sY = Math.sin(ry), cz = Math.cos(rz), sZ = Math.sin(rz);
    const m = [cy * cz + sY * sX * sZ, sY * sX * cz - cy * sZ, sY * cx, cy * sX * sZ - sY * cz, sY * sZ + cy * sX * cz, cy * cx]; // rows x and z of the YXZ rotation
    const pts: number[][] = [];
    if (BOXES.has(kind)) for (let c = 0; c < 8; c++) pts.push([c & 1 ? .5 : -.5, c & 2 ? .5 : -.5, c & 4 ? .5 : -.5]);
    else for (let k = 0; k < 16; k++) { const q = k / 16 * Math.PI * 2, a = Math.cos(q), b = Math.sin(q); if (FLAT.has(kind)) pts.push([a, 0, b]); else if (kind === 'heart' || kind === 'star') pts.push([a, b, 0]); else if (kind === 'cone') pts.push([a, -.5, b]); else pts.push([a, 0, b], [0, a, b], [a, b, 0]); }
    for (const [px, py, pz] of pts) {
      const lx = px * sx, ly = py * sy, lz = pz * sz, ox = m[0] * lx + m[1] * ly + m[2] * lz, oz = m[3] * lx + m[4] * ly + m[5] * lz;
      all = Math.max(all, Math.hypot(x + ox, z + oz)); if (!OUTLINES.has(kind)) fill = Math.max(fill, Math.hypot(ox, oz));
    }
  } };
  const c = { x: 0, y: 0, z: 0, r: radius, t: 0, a: 0, f: 0, color: '#ffffff', n: 1, life };
  for (let i = 0; i <= 120; i++) { c.t = from + (to - from) * i / 120; c.a = c.t * life; LOOKS[look](painter, c); }
  return { all, fill };
}
/** Every look effect the sixteen kits emit in nine seconds of fighting three creatures, once per look and radius. */
function kitLooks() {
  const out: Array<{ id: string; skill: string; look: string; radius: number; life: number }> = [];
  for (const [id, kit] of Object.entries(DISGUISE_KITS)) kit.forEach((skill, slot) => {
    const p = { x: 0, z: 0 }, seen = new Set<string>(); let facing = 0;
    const targets: CombatTarget[] = [{ id: 'a', x: 1.4, z: -1.9, hp: 1e9, maxHp: 1e9, radius: .7 }, { id: 'b', x: -2.8, z: -4.1, hp: 1e9, maxHp: 1e9, radius: .7 }, { id: 'c', x: 1, z: -7.4, hp: 1e9, maxHp: 1e9, radius: .7 }];
    const sim = new CombatSimulation({ position: () => p, facing: () => facing, face: a => { facing = a; }, targets: () => targets, weapon: () => ({ kind: 'fist' }), stats: () => ({ attack: 10, maxHp: 100, critChance: 0 }),
      move: (x, z) => { p.x += x; p.z += z; }, moveTarget: () => {}, hit: () => {}, status: () => {}, heal: () => {},
      effect: e => { if (!e.look || !LOOKS[e.look]) return; const key = e.look + e.radius.toFixed(2); if (seen.has(key)) return; seen.add(key); out.push({ id, skill, look: e.look, radius: e.radius, life: e.duration ?? LOOK_LIFE[e.look] ?? .6 }); } }, () => .5);
    assert.equal(sim.disguise(id, slot), true, `${id} ${skill}`); for (let i = 0; i < 540; i++) sim.update(1 / 60);
  });
  return out;
}
/**
 * Looks whose cast radius is a length or a nominal size, not a hit radius, with the furthest each may reach instead:
 * a chain or beam to the creature plus the ring on it, a dash and the landing at its end, things that trail behind or
 * fly in, and the casts that sit ahead of the explorer.
 */
const OWN_REACH: Record<string, (radius: number) => number> = {
  rush: () => 8, ribbon: () => DZ.ribbon.speed * DZ.ribbon.time, surf: r => r * 1.15, hook: r => r + 1.2, drain: r => r + 1.2,
  bamboo: r => r + DZ.bamboo.radius * 1.15, lantern: r => 4 + r * .5, kite: () => 3, tank: () => DZ.tank.reach + .5, starshield: () => DZ.starshield.radius * 1.15, charge: () => 2,
};
test('no kit effect is drawn past what it hits: within 15% of its radius (half a metre for the small ones)', () => {
  const casts = kitLooks(); assert.ok(casts.length > 60, 'the kits emit their looks');
  for (const e of casts) {
    const drawn = drawnSize(e.look, e.radius, e.life).all, most = OWN_REACH[e.look]?.(e.radius) ?? Math.max(e.radius * 1.15, e.radius + .5);
    assert.ok(drawn <= most + 1e-6, `${e.id} ${e.skill}: ${e.look} reaches ${drawn.toFixed(2)} m, its ${e.radius.toFixed(2)} m cast allows ${most.toFixed(2)} m`);
  }
});
test('no area cast of 3 m or more paints a filled floor or dome: only its outline rings may be that wide', () => {
  for (const e of kitLooks()) if (e.radius >= 3 && !OWN_REACH[e.look]) {
    const { fill } = drawnSize(e.look, e.radius, e.life);
    assert.ok(fill <= e.radius * .5, `${e.id} ${e.skill}: ${e.look} has a filled piece ${fill.toFixed(2)} m in radius on a ${e.radius} m cast`);
  }
});
test('a blast is a quick pop and a thin shockwave at the hit radius, not a fireball dome', () => {
  for (const radius of [2, 5]) {
    const whole = drawnSize('blast', radius, .8), after = drawnSize('blast', radius, .8, (BLAST_POP + .01) / .8, 1);
    assert.ok(whole.all <= radius * 1.001, 'the shockwave stops at the hit radius'); assert.ok(whole.fill <= Math.min(1.3, radius * BLAST_CORE) + .05, 'the fire core is a third of the radius at most');
    assert.ok(BLAST_POP <= .25 && after.fill <= .55, 'after a quarter second only small smoke puffs are left');
  }
});
test('a wave ride is one narrow crest over its corridor, and a shield hugs the explorer', () => {
  const side = (radius: number) => { let most = 0; LOOKS.surf({ put(_k, _c, x) { most = Math.max(most, Math.abs(x)); } }, { x: 0, y: 0, z: 0, r: radius, t: .8, a: .5, f: 0, color: '#fff', n: 1, life: .6 }); return most; };
  assert.ok(side(DZ.surfride.speed * DZ.surfride.time) <= 2.2, 'the ride stays within the 1.2 m + creature corridor'); assert.ok(side(13) > 5, 'the five-shot wave fan stays wide');
  assert.ok(drawnSize('shield', 2.3, 4).all <= 2);
});
test('a dash trail and the lighthouse beam stay light', () => {
  assert.ok(TRAIL_GROW <= .25 && BEAM_OPACITY <= .25);
  const view = new CombatView(new T.Scene()); view.effect({ kind: 'trail', x: 0, z: 0, radius: .7, color: '#e9fbff' }); view.update(.2, []);
  const mesh = (view as unknown as { effects: Array<{ mesh: T.Mesh }> }).effects[0].mesh; assert.ok(mesh.scale.x > 1 && mesh.scale.x <= 1 + TRAIL_GROW);
});
