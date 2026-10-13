// Jumping, then a disguise skill or the weapon in hand (src/air-cast.ts): every skill has a class, casts from the air begin
// at the explorer's height, ground skills plunge, movement skills take the jump over, and with the switch off nothing changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { CombatSimulation, DISGUISE_KITS, DZ, type CombatEffect, type CombatHit, type CombatTarget, type WeaponProfile } from '../src/combat.ts';
import { AIR_CAST, AIR_CASTING, AIR_WEAPON, airCastBonus, airCastPlan, airCastRule, airSwingFor, carryStep, diveStrikeFor, flightCarry } from '../src/air-cast.ts';
import * as J from '../src/jump-rules.ts';
import { AIR_MOVES } from '../src/moves.ts';
import { DISGUISES, ITEMS } from '../src/content.ts';
import { shotLift } from '../src/combat-view.ts';
import { DisguiseFx } from '../src/disguise-fx.ts';
import { LOOKS, type Shape } from '../src/skill-visuals.ts';

const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/** A fight on a flat field. `height`: how high the explorer is (undefined = a host without jumping: the server, the game with the switch off). */
function arena(spots: Array<{ x: number; z: number; radius?: number; boss?: boolean; hp?: number }>, options: { height?: number; weapon?: WeaponProfile } = {}) {
  const p = { x: 0, z: 0 }; let facing = 0; const state = { height: options.height }, hits: Array<{ id: string; h: CombatHit }> = [], effects: CombatEffect[] = [];
  const targets: CombatTarget[] = spots.map((s, i) => ({ id: 't' + i, x: s.x, z: s.z, radius: s.radius ?? .5, boss: s.boss, hp: s.hp ?? 1e9, maxHp: s.hp ?? 1e9, facing: 0 }));
  const sim = new CombatSimulation({ position: () => p, facing: () => facing, face: a => { facing = a; }, targets: () => targets, weapon: () => options.weapon ?? { kind: 'fist' }, stats: () => ({ attack: 100, critChance: 0, maxHp: 1000 }),
    move: (x, z) => { p.x += x; p.z += z; }, effect: e => effects.push(e), hit: (t, h) => { hits.push({ id: t.id, h }); }, heal: () => {}, status: () => {}, moveTarget: () => {},
    ...(options.height === undefined ? {} : { height: () => state.height ?? 0 }) }, () => .5);
  const run = (s: number) => { for (let t = 0; t < s; t += .025) sim.update(.025, true); };
  return { sim, hits, effects, targets, p, run, state };
}
const kitOf = (effect: string) => { for (const [id, kit] of Object.entries(DISGUISE_KITS)) { const i = kit.indexOf(effect); if (i >= 0) return [id, i] as const; } throw new Error('no kit has ' + effect); };
const all = Object.entries(DISGUISE_KITS).flatMap(([id, kit]) => kit.map((effect, index) => ({ id, index, effect })));

test('every disguise skill has an air class: 17 disguises x 4, no skill without a row and no row without a skill', () => {
  assert.equal(Object.keys(DISGUISE_KITS).length, 17); assert.equal(all.length, 68);
  assert.deepEqual(Object.keys(DISGUISE_KITS).sort(), Object.keys(DISGUISES).sort(), 'the kits are the disguises of content.ts');
  for (const { id, index, effect } of all) assert.ok(AIR_CAST[effect], `${id} skill ${index + 1} (${effect}) has no air class: add it to air-cast.ts AIR_CAST`);
  const used = new Set(all.map(s => s.effect)); assert.equal(used.size, 68, 'no effect is in two kits');
  assert.deepEqual(Object.keys(AIR_CAST).filter(effect => !used.has(effect)), [], 'a row for a skill no disguise has');
  for (const [effect, rule] of Object.entries(AIR_CAST)) {
    assert.ok(['air', 'plunge', 'move'].includes(rule.cls), effect);
    if (rule.cls === 'air') { assert.ok(rule.at === 'body' || rule.at === 'ground' || rule.at === 'far', `${effect}: an air cast says where it begins`); assert.equal(rule.how, undefined); }
    if (rule.cls === 'move') assert.ok(['glide', 'blink', 'land', 'flight'].includes(rule.how!), `${effect}: a movement skill says how it takes the jump over`);
    if (rule.cls === 'plunge') { assert.equal(rule.at, undefined); assert.ok(rule.how === undefined || rule.how === 'leap'); }
  }
  const count = (cls: string) => Object.values(AIR_CAST).filter(r => r.cls === cls).length;
  assert.deepEqual([count('air'), count('plunge'), count('move')], [43, 17, 8]);
  // The classes the owner named: flights, a ground charge, a ground ring, a shot, a shield.
  assert.deepEqual(['flight', 'hover', 'kite'].map(e => AIR_CAST[e].how), ['flight', 'flight', 'flight']);
  for (const e of ['knightcharge', 'surfride', 'giant', 'tank', 'iceage', 'icefloor', 'sandbag', 'smoke', 'drum', 'ink', 'tail', 'anchor']) assert.equal(AIR_CAST[e].cls, 'plunge', e);
  for (const e of ['fireball', 'popgun', 'missiles', 'sweep', 'block', 'energyshield', 'hook', 'drain', 'lotus']) assert.deepEqual(AIR_CAST[e], { cls: 'air', at: 'body' }, e);
  assert.equal(airCastRule(undefined), undefined); assert.equal(airCastRule('nothing'), undefined);
});

test('a press: on the ground the ordinary cast, in the air window its class, too late in the fall or mid-dive it is kept for the landing', () => {
  assert.equal(airCastPlan('iceage', 'ground'), 'ground'); assert.equal(airCastPlan('iceage', 'buffer'), 'buffer'); assert.equal(airCastPlan('flight', 'buffer'), 'buffer');
  assert.deepEqual(airCastPlan('iceage', 'air'), { cls: 'plunge' }); assert.deepEqual(airCastPlan('ribbon', 'air'), { cls: 'move', how: 'glide' });
  assert.equal(airCastPlan('unknown', 'air'), 'ground', 'a skill without a class is cast as on the ground, never dropped');
  // The window itself is jump-rules.ts pressKind: every class is reached from the rise, none from a dive or the last 0.35 m.
  const j = new J.JumpState(); j.jump(); j.step(.1); assert.equal(J.pressKind(j), 'air');
  j.dive(); assert.equal(J.pressKind(j), 'buffer'); assert.equal(airCastPlan('fireball', J.pressKind(j)), 'buffer');
  const low = { airborne: true, diving: false, velocity: -5, height: .2 }; assert.equal(airCastPlan('fireball', J.pressKind(low)), 'buffer');
  // The kept press waits for the feet and for free hands (a plunge that lands as a knight's charge finishes first), so it is cast, not lost.
  const main = read('main.ts');
  assert.match(main, /function firePending\(\)\{const p=pendingPress;if\(!p\|\|pendingLeft<=0\|\|world\.jump\.airborne\|\|combat\.locksMovement\)return;pendingPress=null;/);
  assert.match(main, /if\(pendingPress\)pendingLeft=Math\.max\(pendingLeft,combat\.dashLeft\+\.25\);/); assert.match(main, /queueMicrotask\(firePending\);/);
});

test('the plunge bonus: one table, 10% from a single jump, 20% from a double, 30% from a triple, never more', () => {
  assert.equal(airCastBonus(0), 1); assert.ok(Math.abs(airCastBonus(J.JUMP.rise[0]) - 1.1) < 1e-9); assert.ok(Math.abs(airCastBonus(J.JUMP.rise[0] + J.JUMP.rise[1]) - 1.2) < 1e-9); assert.ok(Math.abs(airCastBonus(J.MAX_HEIGHT) - 1.3) < 1e-9);
  assert.equal(airCastBonus(99), airCastBonus(J.MAX_HEIGHT)); assert.equal(airCastBonus(-3), 1); assert.equal(airCastBonus(NaN), 1);
  let last = 1; for (let h = 0; h <= J.MAX_HEIGHT + .01; h += .1) { const b = airCastBonus(h); assert.ok(b >= last - 1e-9 && b <= 1.3 + 1e-9, 'it only grows with height'); last = b; }
  assert.ok(Math.abs(airCastBonus(1) - 1.05) < 1e-9, 'a straight line between the rows');
  assert.equal(AIR_CASTING.bonus.at(-1)![1], 1.3, 'modest: the best plunge is +30%');
});

test('a cast from the air begins at the height of the explorer: body casts and shots are lifted, ground and far casts are not', () => {
  // Body: the cork popgun's puff and its five corks leave from 2 m up and come down over their range.
  const a = arena([{ x: 0, z: 6 }], { height: 2 }); assert.equal(a.sim.disguise(...kitOf('popgun'), { grounded: false }), true);
  assert.ok(a.effects.length > 0); assert.equal(a.sim.projectiles.length, DZ.popgun.count);
  for (const shot of a.sim.projectiles) { assert.equal(shot.y, 2); assert.equal(shot.reach, DZ.popgun.range); }
  const shot = a.sim.projectiles[0]; assert.equal(shotLift(shot), 2); assert.ok(Math.abs(shotLift({ ...shot, remaining: shot.reach! / 2 }) - 1) < 1e-9); assert.equal(shotLift({ ...shot, remaining: 0 }), 0); assert.equal(shotLift({ remaining: 5 }), 0);
  // Body: the vanish puff is at the explorer; the life drain's thread starts up there on every tick while the jump lasts.
  const b = arena([{ x: 0, z: 4 }], { height: 1.5 }); b.sim.disguise(...kitOf('stealth'), {}); assert.equal(b.effects[0].y, 1.5);
  const c = arena([{ x: 0, z: 4 }], { height: 1.5 }); c.sim.disguise(...kitOf('drain'), {}); c.run(.1); assert.equal(c.effects.find(e => e.look === 'drain')!.y, 1.5);
  c.state.height = 0; c.effects.length = 0; c.run(.4); assert.equal(c.effects.find(e => e.look === 'drain')!.y, undefined, 'back on the ground the thread is level again');
  // Ground: a shout's ring, a summon and the rolling snowball begin on the ground under the explorer.
  for (const effect of ['taunt', 'roar', 'whistle', 'heal', 'turret', 'cannon', 'decoy', 'clones', 'tree', 'lighthouse', 'lanterns', 'snowball']) {
    assert.equal(AIR_CAST[effect].at, 'ground', effect);
    const g = arena([{ x: 0, z: 4 }], { height: 2 }); assert.equal(g.sim.disguise(...kitOf(effect), { grounded: true }), true, effect);
    g.run(.5); for (const e of g.effects) assert.equal(e.y, undefined, `${effect}: ${e.look ?? e.kind} stays on the ground`);
    for (const s of g.sim.projectiles) assert.equal(s.y, undefined, `${effect}: its shot starts on the ground`);
  }
  // Far: a strike called down on the creature is where the creature is.
  for (const effect of ['holy', 'blackhole', 'flare', 'bigstar', 'broadside', 'airdrop', 'fireworks', 'sheep', 'charm']) {
    assert.equal(AIR_CAST[effect].at, 'far', effect);
    const f = arena([{ x: 0, z: 6 }], { height: 2 }); assert.equal(f.sim.disguise(...kitOf(effect), { grounded: true }), true, effect); f.run(.3);
    for (const e of f.effects) assert.equal(e.y, undefined, `${effect}: ${e.look ?? e.kind}`);
  }
  // The fireball charges 0.8 s: still in the air it leaves from there; a turret's own shots never do.
  const d = arena([{ x: 0, z: 8 }], { height: 2.5 }); d.sim.disguise(...kitOf('fireball'), {}); d.run(.85); assert.equal(d.sim.projectiles[0].y, 2.5);
  const e = arena([{ x: 0, z: 10 }], { height: 2 }); e.sim.disguise(...kitOf('turret'), { grounded: true }); e.run(.1); assert.ok(e.sim.projectiles.length > 0); for (const s of e.sim.projectiles) assert.equal(s.y, undefined);
});

test('the looks are painted where the cast began: lifted by its height, a hook and a drain slant down to their target', () => {
  const batchY = (fx: DisguiseFx, shape: Shape) => { const b = fx.root.children.find(c => c.name === shape) as T.InstancedMesh; assert.ok(b.count > 0, shape); return b.instanceMatrix.array[13]; };
  const fx = new DisguiseFx({ ground: () => 1, explorerAt: () => null });
  fx.play({ x: 0, z: 0, kind: 'cast', look: 'lift', radius: 2, color: '#fff', duration: 1 }); const low = batchY(fx, 'gring'); fx.clear();
  fx.play({ x: 0, z: 0, kind: 'cast', look: 'lift', radius: 2, color: '#fff', duration: 1, y: 2 }); assert.ok(Math.abs(batchY(fx, 'gring') - low - 2) < 1e-6, 'two metres up, the ring is two metres higher');
  // A hook thrown from 2 m: its first link is near the hand, its last near the creature on the ground.
  const ys: number[] = []; const painter = { put: (_k: Shape, _c: string, _x: number, y: number) => { ys.push(y); } };
  LOOKS.hook(painter, { x: 0, y: 0, z: 0, r: 6, t: .45, a: .1, f: 0, color: '#fff', n: 1, life: .25, lift: 2 });
  assert.ok(ys[0] > 2.5 && Math.min(...ys.slice(0, 12)) < ys[0] - 1, 'the chain comes down'); const flat: number[] = [];
  LOOKS.hook({ put: (_k: Shape, _c: string, _x: number, y: number) => { flat.push(y); } }, { x: 0, y: 0, z: 0, r: 6, t: .45, a: .1, f: 0, color: '#fff', n: 1, life: .25 });
  assert.ok(Math.max(...flat.slice(0, 12)) - Math.min(...flat.slice(0, 12)) < .2, 'from the ground it is level, as before');
});

test('a plunge is the ground cast with the height bonus on every hit, at once and delayed, and never more than its cap on a boss', () => {
  const plain = arena([{ x: 0, z: 2 }]); plain.sim.disguise(...kitOf('tail')); const base = plain.hits[0].h.amount; assert.equal(base, Math.round(100 * DZ.tail.power));
  const high = arena([{ x: 0, z: 2 }], { height: 0 }); assert.equal(high.sim.disguise(...kitOf('tail'), { power: 1.2, landed: true }), true); assert.equal(high.hits[0].h.amount, Math.round(base * 1.2));
  for (const e of high.effects) assert.equal(e.y, undefined, 'it is cast on the ground');
  // Ice age deals its damage three seconds later: the bonus is still on it, and no later cast inherits it.
  const ice = arena([{ x: 0, z: 3 }], { height: 0 }); ice.sim.disguise(...kitOf('iceage'), { power: 1.3, landed: true }); ice.run(DZ.iceage.freeze + .1); assert.equal(ice.hits[0].h.amount, Math.round(100 * DZ.iceage.power * 1.3));
  const next = arena([{ x: 0, z: 2 }]); next.sim.disguise(...kitOf('tail'), { power: 1.3, landed: true }); next.hits.length = 0; next.sim.disguise(...kitOf('tail')); assert.equal(next.hits[0].h.amount, base, 'the bonus ends with its cast');
  // The cap is the dive's own (jump-rules.ts diveCap): a fifth of a boss's health a hit; ordinary creatures take it all.
  const boss = arena([{ x: 0, z: 2, boss: true, hp: 400, radius: 1 }, { x: 1, z: 2, hp: 400 }], { height: 0 }); boss.sim.disguise(...kitOf('tail'), { power: 1.3, cap: J.diveCap, landed: true });
  assert.equal(boss.hits.find(h => h.id === 't0')!.h.amount, Math.round(400 * J.DIVE.bossCap)); assert.equal(boss.hits.find(h => h.id === 't1')!.h.amount, Math.round(base * 1.3));
  // The meteor dive leaps ahead while it falls (main.ts drift): landed, it strikes where it is, at once.
  const meteor = arena([{ x: 0, z: 1 }], { height: 0 }); meteor.sim.disguise(...kitOf('dive'), { power: 1.1, landed: true }); meteor.run(.03);
  assert.deepEqual([meteor.p.x, meteor.p.z], [0, 0], 'no second leap'); assert.equal(meteor.hits[0].h.amount, Math.round(100 * DZ.dive.power * 1.1));
  const ground = arena([{ x: 0, z: 5 }]); ground.sim.disguise(...kitOf('dive')); assert.ok(Math.abs(ground.p.z - DZ.dive.ahead) < 1e-9, 'on the ground it leaps as ever');
  // A plunge that finds nothing to bite returns false: main.ts starts no cooldown, so it costs nothing.
  assert.equal(arena([], { height: 0 }).sim.disguise(...kitOf('devour'), { power: 1.2, landed: true }), false);
});

test('a movement skill takes the jump over: a glide holds its height, a blink reports its arrival once, a flight carries the height in', () => {
  // Glide: the ribbon dashes 0.35 s; holding the jump for the dash keeps the height, then it falls.
  const a = arena([], { height: 1.5 }); assert.equal(a.sim.disguise(...kitOf('ribbon'), {}), true); assert.ok(Math.abs(a.sim.dashLeft - DZ.ribbon.time) < 1e-9);
  const j = new J.JumpState(); j.jump(); j.step(.1); const h = j.height; j.hold(a.sim.dashLeft + AIR_CASTING.glideAfter);
  for (let t = 0; t < DZ.ribbon.time; t += .025) { j.step(.025); a.sim.update(.025, true); assert.equal(j.height, h, 'no rise and no fall while it dashes'); }
  assert.ok(Math.abs(a.p.z - DZ.ribbon.speed * DZ.ribbon.time) < .7, 'moved once, by the dash only'); assert.equal(a.sim.dashLeft, 0);
  for (let t = 0; t < 1; t += .025) j.step(.025); assert.equal(j.airborne, false, 'then it comes down');
  assert.ok(a.effects.filter(e => e.kind === 'trail').every(e => e.y === 1.5), 'the trail is at its height');
  // Blink: `arrive` fires once, after the move. The shadow strike uses it to land behind its target.
  for (const effect of ['teleport', 'backstab']) { let arrived = 0; const b = arena([{ x: 0, z: 6 }], { height: 1.2 }); const before = { ...b.p };
    assert.equal(b.sim.disguise(...kitOf(effect), { arrive: () => { arrived++; assert.notDeepEqual({ ...b.p }, before, 'already moved'); b.state.height = 0; } }), true); assert.equal(arrived, 1, effect); }
  const s = arena([{ x: 0, z: 6 }], { height: 1.2 }); s.sim.disguise(...kitOf('backstab'), { arrive: () => { s.state.height = 0; } });
  const portals = s.effects.filter(e => e.look === 'portal'); assert.equal(portals[0].y, 1.2, 'it vanishes where it was, in the air'); assert.equal(portals[1].y, undefined, 'and appears on the ground');
  assert.deepEqual(AIR_CAST.backstab, { cls: 'move', how: 'land' }); assert.deepEqual(AIR_CAST.teleport, { cls: 'move', how: 'blink' });
  // Flight: the jump's height is handed to the flight (1.7 m) and blends in; neither a pop up nor a drop.
  assert.ok(Math.abs(flightCarry(1.7)) < 1e-9); assert.ok(Math.abs(flightCarry(.5) + 1.2) < 1e-9); assert.ok(Math.abs(flightCarry(3.3) - 1.6) < 1e-9); assert.ok(Math.abs(flightCarry(NaN) + AIR_CASTING.flightHeight) < 1e-9);
  for (const start of [flightCarry(.5), flightCarry(4)]) { let c = start, t = 0; while (c !== 0 && t < 2) { const n = carryStep(c, 1 / 60); assert.ok(Math.abs(n) < Math.abs(c) && Math.sign(n) * Math.sign(c) >= 0, 'it only closes'); c = n; t += 1 / 60; } assert.ok(t < .6, 'within about half a second'); }
  assert.equal(carryStep(0, .1), 0); const f = arena([], { height: 1 }); f.sim.disguise(...kitOf('flight'), {}); assert.ok(f.sim.statuses.flight > 0);
  const jump = new J.JumpState(); jump.jump(); jump.step(.1); jump.cancel(); assert.equal(jump.airborne, false); assert.equal(jump.ready, true, 'cancelled without a landing lag');
});

test('the weapon in the air: paws spin, a blade slashes as far as it reaches in its colour, a gun shoots from up there', () => {
  const spin = AIR_MOVES.swing.radius;
  assert.deepEqual(airSwingFor({ kind: 'fist' }, spin), { shape: 'spin', radius: spin, color: AIR_WEAPON.plain });
  assert.deepEqual(airSwingFor({ kind: 'gun', range: 10 }, spin), { shape: 'shot' }); assert.deepEqual(airSwingFor({ kind: 'rod' }, spin), { shape: 'none' });
  // Every blade in the game, held or a disguise's own: never shorter than the paws' spin, never past maxReach, in its colour.
  const blades = [...Object.values(ITEMS).map(i => i.weapon), ...Object.values(DISGUISES).map(d => d.weapon)].filter(w => w?.kind === 'sword'); assert.ok(blades.length >= 15);
  for (const w of blades) { const s = airSwingFor(w!, spin); assert.equal(s.shape, 'slash'); if (s.shape !== 'slash') continue;
    assert.ok(s.radius >= spin && s.radius <= AIR_WEAPON.maxReach); assert.equal(s.radius, Math.max(spin, Math.min(AIR_WEAPON.maxReach, w!.range))); assert.equal(s.color, w!.fx ?? AIR_WEAPON.blade); }
  assert.equal((airSwingFor(ITEMS.scythe_moon.weapon!, spin) as { radius: number }).radius, 3.3); assert.equal((airSwingFor(DISGUISES.dz_knight.weapon, spin) as { color: string }).color, '#fff3c4');
  // Every gun shoots, and no weapon kind is left without an answer.
  for (const item of Object.values(ITEMS)) if (item.weapon) assert.ok(['spin', 'slash', 'shot', 'none'].includes(airSwingFor(item.weapon, spin).shape));
  // combat.airSwing with the blade's reach: a creature 3 m away is out of the paws' spin and inside the scythe's.
  const paws = arena([{ x: 0, z: 3.2 }], { height: 1.5 }); assert.equal(paws.sim.airSwing(1), true); assert.equal(paws.hits.length, 0);
  const scythe = arena([{ x: 0, z: 3.2 }, { x: -3.2, z: 0 }], { height: 1.5 }); scythe.sim.airSwing(1, 3.3, '#abc'); assert.equal(scythe.hits.length, 2, 'all round, like the spin'); assert.equal(scythe.hits[0].h.amount, Math.round(100 * AIR_MOVES.swing.power), 'the same 80%');
  assert.equal(scythe.effects[0].radius, 3.3); assert.equal(scythe.effects[0].color, '#abc'); assert.equal(scythe.effects[0].y, 1.5);
  // A gun's basic attack from the air: the shot carries the height it left from; on the ground it carries none.
  const gun: WeaponProfile = { kind: 'gun', range: 10, cd: .4, shot: 'pea' };
  const up = arena([{ x: 0, z: 6 }], { height: 1.8, weapon: gun }); assert.equal(up.sim.basic(undefined, J.AIR.swing), true); assert.equal(up.sim.projectiles[0].y, 1.8); assert.equal(up.sim.projectiles[0].reach, 11);
  const down = arena([{ x: 0, z: 6 }], { height: 0, weapon: gun }); down.sim.basic(); assert.equal(down.sim.projectiles[0].y, undefined);
  // A blade's ground arc drawn from a jump (the fallback when the moves are off) is at its height too.
  const sword = arena([{ x: 0, z: 2 }], { height: 1.2, weapon: { kind: 'sword', range: 2.6, arc: .3, fx: '#f0f' } }); sword.sim.basic(); assert.equal(sword.effects[0].kind, 'arc'); assert.equal(sword.effects[0].y, 1.2); assert.equal(sword.effects[0].color, '#f0f');
  // The dive strikes with it: a blade's reach (never under the plain dive), a gun in its shot's colour, paws as before.
  assert.deepEqual(diveStrikeFor({ kind: 'fist' }), { radius: J.DIVE.radius, color: AIR_WEAPON.dive, swing: 'fist' });
  assert.deepEqual(diveStrikeFor({ kind: 'sword', range: 3.3, fx: '#123' }), { radius: 3.3, color: '#123', swing: 'sword' }); assert.equal(diveStrikeFor({ kind: 'sword', range: 2.3 }).radius, J.DIVE.radius); assert.equal(diveStrikeFor({ kind: 'sword', range: 9 }).radius, AIR_WEAPON.maxReach);
  assert.deepEqual(diveStrikeFor({ kind: 'gun', range: 10 }, '#0f0'), { radius: J.DIVE.radius, color: '#0f0', swing: 'gun' }); assert.equal(diveStrikeFor({ kind: 'rod' }).swing, 'fist');
  const dive = arena([{ x: 0, z: 3 }], { height: 0 }); dive.sim.dive(1, 3.3, 0, 0, () => false, () => Infinity, '#123'); assert.equal(dive.hits.length, 1); assert.equal(dive.effects[0].color, '#123');
});

test('switch off or online: nobody is in the air, so every one of the 68 casts and every attack is exactly what it was', () => {
  // A host without `height` is the server and the game before jumping; a host at height 0 is the game with the switch off.
  for (const { id, index, effect } of all) {
    const old = arena([{ x: 0, z: 2.5 }, { x: 2, z: 4 }]), off = arena([{ x: 0, z: 2.5 }, { x: 2, z: 4 }], { height: 0 });
    assert.equal(off.sim.disguise(id, index), old.sim.disguise(id, index), effect); old.run(1.5); off.run(1.5);
    assert.deepEqual(off.effects, old.effects, `${effect}: the same effects`); assert.deepEqual(off.hits, old.hits, `${effect}: the same hits`);
    assert.deepEqual(off.sim.projectiles, old.sim.projectiles, effect); assert.deepEqual({ ...off.p }, { ...old.p }, effect);
    for (const e of off.effects) assert.ok(!('y' in e), `${effect}: no effect carries a height`); for (const s of off.sim.projectiles) assert.ok(!('y' in s) && !('reach' in s));
  }
  for (const weapon of [{ kind: 'fist' }, { kind: 'sword', range: 2.6, arc: .3 }, { kind: 'gun', range: 10, shot: 'pea' }] as WeaponProfile[]) {
    const old = arena([{ x: 0, z: 1.5 }], { weapon }), off = arena([{ x: 0, z: 1.5 }], { height: 0, weapon }); old.sim.basic(); off.sim.basic(); old.run(.5); off.run(.5);
    assert.deepEqual(off.effects, old.effects); assert.deepEqual(off.hits, old.hits); assert.deepEqual(off.sim.projectiles, old.sim.projectiles);
  }
  const old = arena([{ x: 0, z: 1.5 }]), off = arena([{ x: 0, z: 1.5 }], { height: 0 }); old.sim.airSwing(1); off.sim.airSwing(1); assert.deepEqual(off.effects, old.effects); assert.deepEqual(off.hits, old.hits);
  // main.ts: the height is only ever given with the switch on, the air classes only solo with it on, and a plunge is dropped when it is turned off.
  const main = read('main.ts');
  assert.match(main, /height:\(\)=>airOn\(\)\?world\.jump\?\.height\?\?0:0,/);
  assert.match(main, /if\(disguise\)\{const plan=!actionHandler&&airOn\(\)\?airCastPlan\(DISGUISE_KITS\[disguise\]\?\.\[index\],press\):'ground';if\(plan==='ground'\)castDisguise\(disguise,index\);/);
  assert.match(main, /if\(!on\)\{world\.jump\.cancel\(\);[^\n]*plungeCast=null;world\.airCarry=0;/);
  assert.match(main, /airOn\(\)&&state\.gear\.disguise===cast\.disguise&&cooldowns\[cast\.index\]<=0/, 'a plunge casts only what is still worn and ready');
  assert.match(main, /bufferPress\(\{kind:'skill',index\}\);return;\}\n[^\n]*\n\s*if\(disguise\)/, 'a late press is kept before any class is looked at');
  assert.equal(J.BOSS_BLOCK_ON, false);
});

test('the pose follows the weapon that fights: in a disguise too, and a rod is still a rod', () => {
  const main = read('main.ts');
  assert.match(main, /world\.weaponKind=state\.gear\.weapon&&M\.ITEMS\[state\.gear\.weapon\]\?\.weapon\?\.kind==='rod'\?'rod':weaponKind;/);
  assert.doesNotMatch(main, /state\.gear\.disguise\?'fist':weaponKind/, 'a disguise no longer forces the punch');
  const world = read('world.ts');
  assert.match(world, /at=\{x:this\.position\.x,y:this\.position\.y\+\(this\.jump\?\.height\?\?0\),z:this\.position\.z\}/, 'the muzzle flash and the sparks are where the explorer is, in a jump too');
  assert.match(world, /this\.player\.position\.y\+=\(this\.playerLift\?\?0\)\+this\.jump\.height\+\(this\.airCarry\|\|0\);/);
});
