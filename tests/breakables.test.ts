// Breakable trees and stones (src/breakables.ts rules, src/breakables-view.ts picture): hit counts per source, cracks,
// the boss rule, regrowth, the wood cap, the effect areas, the effect source tags, and the instanced view.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  BREAK, BREAK_PLANET, BreakLedger, bossHolds, breakStage, breakablePieces, effectReaches, fighting, grantBreakDrop, hitWorth, inReach, parsePieceId, pieceId, woodKey, type BreakPiece,
} from '../src/breakables.ts';
import { BreakablesView, type BreakViewHost } from '../src/breakables-view.ts';
import { buildScatter } from '../src/scatter.ts';
import { blocked } from '../src/navigation.ts';
import { CombatSimulation, type CombatEffect, type CombatHost } from '../src/combat.ts';
import { BREAK_VI, BREAK_HELP_VI } from '../src/locales/vi-break.ts';
import { BREAK_NOTES } from '../src/breakables-game.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { HELP_TOPICS } from '../src/help-topics.ts';
import { HELP_TOPICS_VI } from '../src/locales/vi-help-topics.ts';

const tree: BreakPiece = { id: pieceId('snow_pine', 10, 4), type: 'snow_pine', x: 10, z: 4, r: .5 };
const stone: BreakPiece = { id: pieceId('snow_rock', -6, 2), type: 'snow_rock', x: -6, z: 2, r: .9 };
/** Hits of `source` (spaced past the rehit gap) until the piece breaks; Infinity when it never does. */
function hitsToBreak(piece: BreakPiece, source: Parameters<BreakLedger['hit']>[1]) {
  const l = new BreakLedger(() => 0); let t = 0;
  for (let n = 1; n <= 200; n++) { t += 1; if (l.hit(piece, source, t).outcome === 'break') return n; }
  return Infinity;
}

test('it takes a lot: ~9 basic hits fell a tree, 12+ for a stone; heavy moves count more but still need several; pets never', () => {
  assert.equal(hitsToBreak(tree, 'melee'), 9);
  assert.ok(hitsToBreak(stone, 'melee') >= 12);
  for (const s of ['skill', 'quake', 'dive', 'power'] as const) { const n = hitsToBreak(tree, s); assert.ok(n >= 3 && n < 9, `tree ${s}: ${n}`); }
  for (const s of ['quake', 'dive', 'power'] as const) { const n = hitsToBreak(stone, s); assert.ok(n >= 3 && n <= 5, `stone ${s}: ${n}`); }
  assert.ok(hitsToBreak(stone, 'skill') > hitsToBreak(stone, 'quake') * 2, 'stones crack mainly under the heavy moves');
  assert.ok(hitsToBreak(stone, 'shot') > 30);
  assert.equal(hitsToBreak(tree, 'pet'), Infinity); assert.equal(hitsToBreak(stone, 'summon'), Infinity);
  assert.equal(hitWorth('ice_spire', 'power'), 0, 'only snow pines and snow rocks break');
});

test('every hit shows: stages 1-3 of cracks, and the rehit gap makes a spin one blow', () => {
  const l = new BreakLedger(() => 0), stages: number[] = [];
  for (let i = 0; i < 13; i++) stages.push(l.hit(stone, 'melee', i).stage);
  assert.deepEqual([...new Set(stages)], [1, 2, 3]); assert.equal(stages[0], 1);
  assert.equal(breakStage(14, 14), 0); assert.equal(breakStage(13, 14), 1); assert.equal(breakStage(7, 14), 2); assert.equal(breakStage(2, 14), 3);
  const m = new BreakLedger(() => 0); assert.equal(m.hit(tree, 'skill', 0).outcome, 'wear'); assert.equal(m.hit(tree, 'skill', .1).outcome, 'none'); assert.equal(m.hit(tree, 'skill', .4).outcome, 'wear');
});

test('boss rule: a fighting boss within 28 m holds the piece (it shakes, no damage); damage waits and resumes after the fight', () => {
  const l = new BreakLedger(() => 0), near = [{ x: 30, z: 4, hp: 100, aggro: true }];
  l.hit(tree, 'melee', 0); l.hit(tree, 'melee', 1);
  assert.equal(bossHolds(tree.x, tree.z, near), true);
  const held = l.hit(tree, 'power', 2, bossHolds(tree.x, tree.z, near)); assert.equal(held.outcome, 'held'); assert.equal(held.hp, 7);
  assert.equal(bossHolds(tree.x, tree.z, [{ ...near[0], aggro: false }]), false, 'a calm boss holds nothing');
  assert.equal(bossHolds(tree.x, tree.z, [{ ...near[0], x: 10 + BREAK.bossRadius + 1 }]), false, 'nor one farther than 28 m');
  assert.equal(bossHolds(tree.x, tree.z, [{ ...near[0], hp: 0 }]), false);
  assert.equal(l.hit(tree, 'melee', 3).hp, 6, 'after the fight the old damage is still there and counts on');
  assert.equal(fighting('chase'), true); assert.equal(fighting('idle'), false); assert.equal(fighting('return'), false); assert.equal(fighting(undefined), false);
});

test('regrowth after 3-5 minutes, never while someone stands on the spot', () => {
  const l = new BreakLedger(() => .5); let r; for (let t = 0; !(r && r.outcome === 'break'); t++) r = l.hit(tree, 'power', t);
  assert.ok(r!.regrowAt! - 2 >= BREAK.regrow[0] && r!.regrowAt! - 2 <= BREAK.regrow[1]);
  assert.equal(l.hit(tree, 'power', 5).outcome, 'none', 'a broken piece takes no more hits');
  const find = () => tree;
  assert.deepEqual(l.regrow(100, find, () => false), [], 'not yet');
  assert.deepEqual(l.regrow(1000, find, (x, z, rad) => Math.hypot(x - 10.4, z - 4) < rad), [], 'someone is standing there');
  assert.deepEqual(l.regrow(1000, find, () => false), [tree.id]); assert.equal(l.broken(tree.id), false); assert.equal(l.get(tree.id), undefined);
});

test('wood: one per felled tree, at most 6 a day; a stone drops nothing (there is no stone material)', () => {
  const s = { worldRewards: { resourceReadyAt: { 'break-wood:2000-01-01': 3, other: 7 } as Record<string, number> } }, bag: Record<string, number> = {}, add = (id: string, n: number) => { bag[id] = (bag[id] ?? 0) + n; return true; };
  const now = Date.UTC(2026, 9, 14, 12);
  let got = 0; for (let i = 0; i < 10; i++) got += grantBreakDrop(s, 'snow_pine', now, add);
  assert.equal(got, BREAK.wood.daily); assert.equal(bag.wood, 6); assert.equal(s.worldRewards.resourceReadyAt[woodKey(now)], 6);
  assert.equal(s.worldRewards.resourceReadyAt['break-wood:2000-01-01'], undefined, 'old days are dropped'); assert.equal(s.worldRewards.resourceReadyAt.other, 7);
  assert.equal(grantBreakDrop(s, 'snow_rock', now + 864e5, add), 0);
  assert.equal(grantBreakDrop(s, 'snow_pine', now + 864e5, add), 1, 'a new day, a new cap');
  assert.match(woodKey(now), /^[a-zA-Z0-9:_-]{1,100}$/, 'the key passes the save sanitiser (model.ts resourceReadyAt)');
});

test('only the Ice planet, only blocking snow pines and rocks; ids are stable and checked', () => {
  const decor = [{ type: 'snow_pine', x: 1, z: 2, radius: .5 }, { type: 'snow_pine', x: 150, z: 2, radius: 0 }, { type: 'snow_rock', x: 3, z: 4, radius: .9 }, { type: 'ice_spire', x: 5, z: 6, radius: .6 }];
  assert.equal(BREAK_PLANET, 'ice');
  assert.deepEqual(breakablePieces('ice', decor).map(p => p.type), ['snow_pine', 'snow_rock'], 'rim rows (radius 0) and spires stay');
  assert.deepEqual(breakablePieces('home', decor), []); assert.deepEqual(breakablePieces('ocean', decor), []);
  assert.deepEqual(parsePieceId(pieceId('snow_rock', -12.34, 56.78)), { type: 'snow_rock', x: -12.3, z: 56.8 });
  assert.equal(parsePieceId('house@1:2'), null); assert.equal(parsePieceId('snow_pine@1:2;drop'), null); assert.equal(parsePieceId(42), null);
  assert.ok(inReach(tree, { x: 7, z: 4 }, 'melee')); assert.ok(!inReach(tree, { x: 0, z: 4 }, 'melee')); assert.ok(inReach(tree, { x: 0, z: 4 }, 'shot')); assert.ok(!inReach(tree, { x: 9, z: 4 }, 'pet'));
});

test('effect areas: a swing reaches what is in front, a ring all round, an impact where it lands, a beam along its line', () => {
  const p = { x: 0, z: 2, r: .5 };
  assert.ok(effectReaches({ kind: 'arc', x: 0, z: 0, radius: 2.2, facing: 0, arc: 2 }, p));
  assert.ok(!effectReaches({ kind: 'arc', x: 0, z: 0, radius: 2.2, facing: Math.PI, arc: 2 }, p), 'behind the swing');
  assert.ok(effectReaches({ kind: 'ring', x: 3, z: 2, radius: 3 }, p)); assert.ok(!effectReaches({ kind: 'ring', x: 9, z: 2, radius: 3 }, p));
  assert.ok(effectReaches({ kind: 'impact', x: .4, z: 2, radius: .4 }, p));
  assert.ok(effectReaches({ kind: 'beam', x: 0, z: -5, radius: 9, width: 1, facing: 0 }, p)); assert.ok(!effectReaches({ kind: 'beam', x: 3, z: -5, radius: 9, width: 1, facing: 0 }, p));
  assert.ok(!effectReaches({ kind: 'cast', x: 0, z: 0, radius: 9 }, p), 'a cast is only a picture');
});

test('combat effects carry their source: a fist swing is melee, the Quake ring is quake, a pet shot is pet', () => {
  const effects: CombatEffect[] = [], enemy = { id: 'e', x: 0, z: 1.2, hp: 1e6, maxHp: 1e6, radius: .5 };
  const host: CombatHost = { position: () => ({ x: 0, z: 0 }), facing: () => 0, face: () => {}, targets: () => [enemy], weapon: () => ({ kind: 'fist' }), stats: () => ({ attack: 10, critChance: 0 }), move: () => {}, hit: () => {}, effect: e => effects.push(e) };
  const sim = new CombatSimulation(host, () => .5);
  assert.ok(sim.basic()); assert.equal(effects.find(e => e.kind === 'arc')?.source, 'melee');
  effects.length = 0; sim.skill(2); sim.update(.5, true); assert.equal(effects.find(e => e.kind === 'ring')?.source, 'quake');
  effects.length = 0; sim.shoot('pea', 0, 1, 11, { helper: true }); for (let i = 0; i < 10; i++) sim.update(.05, true); const pet = effects.find(e => e.kind === 'impact'); if (pet) assert.equal(pet.source, 'pet');
});

/** A small Ice world with its scatter batches (fallback models) and colliders, and the view over it. */
function rig(over: Partial<BreakViewHost> = {}) {
  const decor = [
    { type: 'snow_pine', x: 4, z: 0, y: 0, rotation: .3, scale: 1, radius: .45 },
    { type: 'snow_rock', x: -4, z: 0, y: 0, rotation: 1, scale: 1, radius: .8 },
    { type: 'ice_spire', x: 0, z: 6, y: 0, rotation: 0, scale: 1, radius: .55 },
  ];
  const obstacles = decor.map(p => ({ x: p.x, z: p.z, r: p.radius })), scene = new T.Scene(), group = buildScatter(decor, () => undefined);
  const notes: string[] = [], sent: string[] = [], at = { x: 2, z: 0 };
  let clock = 0, bosses: { x: number; z: number; hp: number; aggro: boolean }[] = [];
  const host: BreakViewHost = {
    planet: () => 'ice', decor: () => decor, obstacles: () => obstacles, scatter: () => group, occluders: () => undefined, scene: () => scene, fx: () => null,
    bosses: () => bosses, explorer: () => at, others: () => [], now: () => clock, online: () => false, send: (id, s) => { sent.push(id + ' ' + s); },
    drop: type => (type === 'snow_pine' ? 1 : 0), note: k => { notes.push(k); }, sound: () => {}, reduced: () => false, ...over,
  };
  const view = new BreakablesView(host);
  const slotOf = (type: string) => { const out: T.Matrix4[] = []; group.traverse(o => { if (o instanceof T.InstancedMesh && o.userData.scatter === type) { const m = new T.Matrix4(); o.getMatrixAt(0, m); out.push(m); } }); return out; };
  return { view, decor, obstacles, scene, group, notes, sent, at, slotOf, tick: (s: number) => { for (let t = 0; t < s; t += .1) { clock += .1; view.update(.1); } }, setBosses: (b: typeof bosses) => { bosses = b; } };
}
const scaleOf = (m: T.Matrix4) => new T.Vector3().setFromMatrixScale(m).length();

test('the view: hits wear and crack in place, a break hides the instance and its collider, regrowth brings both back', () => {
  const r = rig(), [pine, rock] = r.view.pieces().sort((a, b) => b.x - a.x);
  assert.equal(r.view.pieces().length, 2, 'the spire never breaks');
  const marks = () => r.scene.children.filter(o => o instanceof T.InstancedMesh && o.visible).length;
  assert.equal(marks(), 0, 'idle: no extra batch draws');
  r.view.strike(rock.id, 'quake'); r.tick(.5); assert.equal(r.view.stageOf(rock.id), 1); assert.equal(marks(), 1, 'cracks: one shared batch');
  r.view.strike(rock.id, 'quake'); r.tick(.5); assert.equal(r.view.stageOf(rock.id), 2);
  const before = scaleOf(r.slotOf('snow_pine')[0]);
  for (let i = 0; i < 8; i++) { r.view.strike(pine.id, 'melee'); r.tick(.5); }
  assert.ok(!r.view.isBroken(pine.id)); assert.ok(Math.abs(scaleOf(r.slotOf('snow_pine')[0]) - before) < 1e-6, 'a shake ends where it began');
  r.view.strike(pine.id, 'melee'); assert.ok(r.view.isBroken(pine.id)); assert.ok(r.obstacles[0].r < -2, 'the collider goes at once'); assert.equal(blocked({ x: 4, z: 0 }, r.obstacles), false, 'you can walk through the spot');
  r.tick(1); assert.equal(scaleOf(r.slotOf('snow_pine')[0]), 0, 'the fallen tree is hidden (zero matrix), nothing rebuilt');
  assert.ok(r.notes.includes('first-break') && r.notes.includes('wood'));
  assert.ok(r.scene.getObjectByName('break-stumps')!.visible);
  r.at.x = 4; r.tick(400); assert.ok(r.view.isBroken(pine.id), 'no regrowth while the explorer stands on the spot');
  r.at.x = 9; r.tick(3); assert.ok(!r.view.isBroken(pine.id)); assert.equal(r.obstacles[0].r, .45); assert.equal(blocked({ x: 4, z: 0 }, r.obstacles), true);
  assert.ok(Math.abs(scaleOf(r.slotOf('snow_pine')[0]) - before) < 1e-6, 'grown back to its own size');
  assert.equal(r.scene.getObjectByName('break-stumps')!.visible, false);
});

test('the view: near a fighting boss a hit only shakes; pets do nothing; online it asks the server and waits for its word', () => {
  const r = rig(), [pine] = r.view.pieces().sort((a, b) => b.x - a.x);
  r.setBosses([{ x: 20, z: 0, hp: 1, aggro: true }]);
  for (let i = 0; i < 20; i++) { r.view.strike(pine.id, 'power'); r.tick(.5); }
  assert.ok(!r.view.isBroken(pine.id)); assert.equal(r.view.stageOf(pine.id), 0); assert.equal(r.view.stats.held, 20); assert.ok(r.notes.includes('held'));
  r.setBosses([]); r.view.strike(pine.id, 'pet'); assert.equal(r.view.stats.wear, 0);
  const o = rig({ online: () => true }), [p2] = o.view.pieces().sort((a, b) => b.x - a.x);
  o.view.strike(p2.id, 'melee'); assert.deepEqual(o.sent, [p2.id + ' melee']); assert.equal(o.view.stageOf(p2.id), 0, 'nothing decided here');
  o.view.apply(p2.id, 'wear', 5); assert.equal(o.view.stageOf(p2.id), 2);
  o.view.apply(p2.id, 'break', 0); assert.ok(o.view.isBroken(p2.id)); assert.ok(o.obstacles[0].r < -2);
  o.view.applySnapshot([]); assert.ok(!o.view.isBroken(p2.id), 'the server says it regrew'); assert.equal(o.obstacles[0].r, .45);
});

test('help topic and Vietnamese', () => {
  const topic = HELP_TOPICS.find(t => t[1] === 'Breakable trees and stones'); assert.ok(topic);
  const titles = HELP_TOPICS.map(t => t[1]); assert.ok(titles.indexOf('Breakable trees and stones') > titles.indexOf('Crossing water'), 'a later topic');
  assert.equal(HELP_TOPICS_VI['Breakable trees and stones'], BREAK_HELP_VI[0]); assert.equal(HELP_TOPICS_VI[topic![2]], BREAK_HELP_VI[1]);
  for (const en of Object.values(BREAK_NOTES)) { assert.ok(BREAK_VI[en], en); assert.equal(VI_PACK[en], BREAK_VI[en]); }
  assert.deepEqual(BREAK_HELP_VI[1].match(/\d+/g), topic![2].match(/\d+/g), 'the same numbers in both languages');
});
