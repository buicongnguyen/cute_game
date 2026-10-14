// Jumping and air combat (src/jump-rules.ts): the arc, the three jumps and their unlocks, ground against body attacks,
// the perfect dodge, the dive, the combo, bosses blocking low hits, where jumping is off, and the rule that a jump never
// changes where the explorer may stand.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import * as J from '../src/jump-rules.ts';
import { World } from '../src/world.ts';
import * as M from '../src/model.ts';
import * as U from '../src/upgrades.ts';
import { applyGameAction } from '../src/actions.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { CombatSimulation, type CombatHit, type CombatHost, type CombatTarget, type WeaponProfile } from '../src/combat.ts';
import { TelegraphDecals, RIPPLE_FRAMES } from '../src/telegraph.ts';
import { BOSS_SKILLS } from '../src/boss-patterns.ts';
import { TITAN_WINDUPS } from '../src/titan-patterns.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { JUMP_VI } from '../src/locales/vi-jump.ts';
import { keysGuideHtml } from '../src/hud-keys.ts';
import type { Effects } from '../src/fx.ts';

const DT = 1 / 240;
/** Runs the arc until it lands; returns the landing, the air time and the highest point. */
function fly(j: J.JumpState, onStep?: (t: number) => void) { let t = 0, top = 0; for (;;) { const landing = j.step(DT); t += DT; top = Math.max(top, j.height); onStep?.(t); if (landing) return { landing, t, top }; assert.ok(t < 5, 'the jump lands'); } }

test('a single jump is a snappy arc: about 2 m high and under half a second', () => {
  const j = new J.JumpState(); assert.equal(j.jump(), 1); assert.ok(j.airborne && j.rising);
  const { landing, t, top } = fly(j);
  assert.ok(Math.abs(top - 2) < .05, `apex ${top}`); assert.ok(t > .42 && t < .52, `air time ${t}`); assert.ok(Math.abs(J.SINGLE_AIR_TIME - t) < .02);
  assert.deepEqual({ dive: landing.dive, jumps: landing.jumps }, { dive: false, jumps: 1 }); assert.ok(Math.abs(landing.peak - top) < 1e-9);
  assert.equal(j.height, 0); assert.equal(j.airborne, false);
});

test('up to three jumps per airtime: each adds its own height and resets the upward speed; a fourth does nothing', () => {
  const tops: number[] = [];
  for (const presses of [1, 2, 3, 4]) {
    const j = new J.JumpState(); let used = j.jump();
    const { top, landing } = fly(j, () => { if (j.velocity <= 0 && used < presses) { const n = j.jump(); if (n) { used = n; assert.equal(j.velocity, J.jumpSpeed(n)); assert.ok(j.spin > 0, 'an extra jump spins'); } else used = presses; } });
    tops.push(top); assert.equal(landing.jumps, Math.min(3, presses));
  }
  assert.ok(tops[0] < tops[1] && tops[1] < tops[2], `single < double < triple: ${tops}`);
  assert.ok(Math.abs(tops[1] - 3.3) < .08 && Math.abs(tops[2] - J.MAX_HEIGHT) < .1, String(tops)); assert.ok(Math.abs(tops[3] - tops[2]) < 1e-9, 'no fourth jump');
  assert.equal(J.MAX_HEIGHT, 4.4);
});

test('the Jump skill: a new player has one jump; the double and the triple are bought at the bench behind a level and a price', () => {
  assert.deepEqual([0, 1, 2, 3, -1, 1.5, '2', undefined].map(v => J.jumpsFor(v)), [1, 2, 3, 3, 1, 1, 1, 1]); assert.equal(J.jumpsFor(0, true), 3, 'tester mode has all three');
  const j = new J.JumpState(); j.max = 1; assert.equal(j.jump(), 1); assert.equal(j.jump(), 0, 'one jump only'); assert.equal(new J.JumpInput().wants(j, DT), false);
  j.max = 2; assert.equal(j.jump(), 2); assert.equal(j.jump(), 0);
  const s = M.newGame(); assert.equal(U.jumpLevel(s), 0); assert.equal(M.jumpLevel(s), 0);
  s.energy = 99999; s.bag.bone = 99; s.bag.starshard = 99; s.level = 9;
  assert.equal(U.canUpgradeJump(s), false, 'the double jump needs level 10'); assert.throws(() => applyGameAction(s, { type: 'upgradeJump', payload: {} }), /improve your jump/);
  s.level = 10; const before = s.energy;
  assert.deepEqual(applyGameAction(s, { type: 'upgradeJump', payload: {} }), { level: 1 }); assert.equal(before - s.energy, 600); assert.equal(s.bag.bone, 93);
  assert.equal(U.canUpgradeJump(s), false, 'the triple needs level 25'); s.level = 25;
  assert.deepEqual(U.upgradeJump(s), { level: 2 }); assert.equal(before - s.energy, 3000); assert.equal(s.bag.starshard, 96);
  assert.equal(U.upgradeJump(s), null, 'at its best'); assert.equal(J.jumpsFor(U.jumpLevel(s)), 3);
  assert.deepEqual(J.JUMP_UNLOCKS.map(u => [u.level, u.energy]), [[10, 600], [25, 2400]]);
  // Saves: the level survives a reload; an old save or a broken value reads as the single jump.
  assert.equal(M.parseSave(JSON.stringify(s))!.jumpLevel, 2);
  const old = JSON.parse(JSON.stringify(M.newGame())); assert.equal(M.parseSave(JSON.stringify(old))!.jumpLevel, undefined); assert.equal(U.jumpLevel(M.parseSave(JSON.stringify(old))!), 0);
  for (const bad of [9, -3, 1.5, 'x', null, {}]) assert.equal(U.jumpLevel(M.parseSave(JSON.stringify({ ...old, jumpLevel: bad }))!) <= 2 && (bad === 9 ? U.jumpLevel(M.parseSave(JSON.stringify({ ...old, jumpLevel: bad }))!) === 2 : U.jumpLevel(M.parseSave(JSON.stringify({ ...old, jumpLevel: bad }))!) === 0), true, String(bad));
  const poor = M.newGame(); poor.level = 30; poor.energy = 599; poor.bag.bone = 99; assert.equal(U.canUpgradeJump(poor), false); poor.energy = 600; poor.bag.bone = 5; assert.equal(U.canUpgradeJump(poor), false);
});

test('landing lag, the buffered press and holding: a hold performs the extra jumps at the top and never bounces off the ground', () => {
  const j = new J.JumpState(), input = new J.JumpInput(); input.down(); assert.ok(input.wants(j, DT)); j.jump(); input.done();
  let extra = 0; const { landing } = fly(j, () => { if (input.wants(j, DT) && j.jump()) { input.done(); extra++; assert.ok(Math.abs(j.velocity - J.jumpSpeed(j.jumps)) < 1e-9); } });
  assert.equal(extra, 2); assert.equal(landing.jumps, 3);
  assert.equal(input.wants(j, DT), false, 'still held on the ground: no bounce'); assert.equal(j.ready, false, 'landing lag'); assert.equal(j.jump(), 0);
  for (let t = 0; t < J.JUMP.landLag + .01; t += DT) j.step(DT); assert.equal(j.ready, true);
  // A press just before touching down jumps on landing.
  input.up(); j.max = 1; j.jump(); while (!(j.falling && j.height < .25)) j.step(DT);
  input.down(); assert.equal(input.wants(j, DT), true); assert.equal(j.jump(), 0, 'no jump left in the air');
  let again = -1; for (let t = 0; t < .4 && again < 0; t += DT) { j.step(DT); if (input.wants(j, DT) && j.jump()) { input.done(); again = t; } }
  assert.ok(again > 0 && again < .3, 'the buffered press became a new jump from the ground, once the landing lag was over'); assert.equal(j.jumps, 1);
  input.clear(); assert.equal(input.held, false);
});

test('ground attacks pass under a jump of 0.9 m or more; body attacks always hit', () => {
  assert.equal(J.DODGE.height, .9);
  assert.deepEqual([0, .5, .89, .9, 2, 4.4].map(h => J.dodges('ground', h)), [false, false, false, true, true, true]);
  for (const h of [0, .9, 4.4]) assert.equal(J.dodges('body', h), false);
  // A single jump clears a ground attack for most of its arc, but not as the feet leave or land.
  const j = new J.JumpState(); j.jump(); let safe = 0; const { t } = fly(j, () => { if (J.dodges('ground', j.height)) safe += DT; });
  assert.ok(safe > .3 && safe < t - .08, `clear for ${safe}s of ${t}s`);
});

test('every attack has a class: shockwaves, slams, quakes, floor hazards and low rushes are ground; shots, bites, swings, beams and grabs are body', () => {
  const ground = ['slam', 'quake', 'leap', 'donut', 'stomp4', 'pools', 'stomp', 'slap', 'rush', 'burst', 'lava'];
  const body = ['charge', 'barrage', 'rain', 'spin', 'eclipse', 'sweep', 'pull', 'lines', 'bombard', 'orbs', 'summon', 'bite', 'breath', 'grab', 'spit', 'meteor', 'roar', 'melee', 'shot'];
  for (const k of ground) assert.equal(J.attackClass(k), 'ground', k); for (const k of body) assert.equal(J.attackClass(k), 'body', k);
  assert.deepEqual(Object.keys(J.ATTACK_CLASS).sort(), [...ground, ...body].sort(), 'nothing unlisted');
  assert.equal(J.attackClass(undefined), 'body'); assert.equal(J.attackClass('something new'), 'body', 'unknown attacks hit');
  // Every boss and titan skill in the game is in the table.
  for (const skill of new Set([...Object.values(BOSS_SKILLS).flat(), ...Object.keys(TITAN_WINDUPS)])) assert.ok(Object.hasOwn(J.ATTACK_CLASS, skill), skill);
});

test('a perfect dodge: off the ground at most 0.25 s before a ground attack lands', () => {
  assert.equal(J.DODGE.perfect, .25); assert.equal(J.DODGE.sure, 2);
  assert.equal(J.perfectDodge('ground', 1.5, .1), true); assert.equal(J.perfectDodge('ground', 1.5, .25), true);
  assert.equal(J.perfectDodge('ground', 1.5, .26), false, 'too early: a plain dodge'); assert.equal(J.perfectDodge('ground', .5, .02), false, 'too late: not high enough yet');
  assert.equal(J.perfectDodge('body', 3, .1), false); assert.equal(J.perfectDodge('ground', 3, -1), false);
  // A second jump does not open the window again: the clock runs from leaving the ground.
  const j = new J.JumpState(); j.jump(); for (let t = 0; t < .2; t += DT) j.step(DT); j.jump(); for (let t = 0; t < .1; t += DT) j.step(DT);
  assert.ok(j.airTime > .29); assert.equal(J.perfectDodge('ground', j.height, j.airTime), false);
});

test('the dive: only from height, straight down, stronger the higher it began, a sure critical from a double or triple jump on a boss or a large creature', () => {
  const low = new J.JumpState(); low.jump(); low.step(DT); assert.equal(low.dive(), false, 'too low to dive');
  const j = new J.JumpState(); j.jump(); while (j.velocity > 0) j.step(DT); const from = j.height;
  assert.equal(j.dive(), true); assert.equal(j.velocity, -J.JUMP.diveSpeed); assert.equal(j.ready, false, 'no jump out of a dive'); assert.equal(j.dive(), false);
  const { landing, t } = fly(j); assert.equal(landing.dive, true); assert.ok(Math.abs(landing.from - from) < 1e-9); assert.ok(t < .08, 'the dive is fast');
  assert.ok(Math.abs(j.lag - J.JUMP.diveLag) < DT * 2, 'a dive has a longer recovery');
  const [single, double, triple] = [2, 3.3, 4.4].map(J.diveMultiplier);
  assert.ok(J.diveMultiplier(.9) < single && single < double && double < triple, 'single < double < triple'); assert.equal(J.diveMultiplier(99), triple); assert.ok(Math.abs(triple - .89) < 1e-9);
  const boss = { boss: true, radius: 1 }, big = { radius: 1.3 }, small = { radius: .5 };
  assert.equal(J.diveCritical(1, 2, boss), false, 'a single jump is not enough'); assert.equal(J.diveCritical(2, 2.1, boss), false, 'a double jump pressed too low is not either');
  assert.equal(J.diveCritical(2, 3.3, boss), true); assert.equal(J.diveCritical(3, 4.4, boss), true); assert.equal(J.diveCritical(3, 4.4, big), true); assert.equal(J.diveCritical(3, 4.4, small), false);
  // One dive never takes more than a fifth of a boss's health.
  assert.equal(J.diveCap({ boss: true, maxHp: 5000 }), 1000); assert.equal(J.diveCap({ maxHp: 5000 }), Infinity);
});

function arena(weapon: WeaponProfile = { kind: 'fist' }, crit = 0) {
  const player = { x: 0, z: 0 }; let facing = 0; const targets: CombatTarget[] = [], hits: { id: string; impact: CombatHit }[] = [];
  const host: CombatHost = { position: () => player, facing: () => facing, face: v => facing = v, targets: () => targets, weapon: () => weapon, stats: () => ({ attack: 100, critChance: crit, critDamage: 5 }), move: (x, z) => { player.x += x; player.z += z; }, effect: () => {}, hit: (target, impact) => { hits.push({ id: target.id, impact }); target.hp -= impact.amount; } };
  const sim = new CombatSimulation(host, () => .5);
  const enemy = (id: string, x: number, z: number, extra: Partial<CombatTarget> = {}) => { const target = { id, x, z, hp: 1e6, maxHp: 1e6, radius: .5, ...extra }; targets.push(target); return target; };
  const run = (seconds: number) => { for (let t = 0; t < seconds - .0001; t += .025) sim.update(.025, true); };
  return { sim, enemy, hits, run, player };
}

test('combat: the dive strike hits an area with a stun, is a sure critical only where the rule says, and is capped on a boss', () => {
  const a = arena(), boss = a.enemy('boss', 0, 1.5, { boss: true, radius: 1.2, maxHp: 2000 }), small = a.enemy('small', 1, 0); a.enemy('far', 9, 0);
  const hit = a.sim.dive(J.diveMultiplier(4.4), J.DIVE.radius, J.DIVE.stun, J.DIVE.knock, t => J.diveCritical(3, 4.4, t), J.diveCap);
  assert.deepEqual(hit.map(t => t.id).sort(), ['boss', 'small']); assert.deepEqual(a.hits.map(h => h.id).sort(), ['boss', 'small']);
  const onBoss = a.hits.find(h => h.id === 'boss')!.impact, onSmall = a.hits.find(h => h.id === 'small')!.impact;
  assert.equal(onBoss.critical, true); assert.equal(onSmall.critical, false); assert.equal(onBoss.stun, J.DIVE.stun);
  assert.equal(onSmall.amount, 89, '100 attack x 0.89'); assert.equal(onBoss.amount, 400, '445 capped at a fifth of 2000');
  // The sure critical and the cap do not leak into the next hit.
  a.hits.length = 0; a.sim.basic(small); assert.equal(a.hits[0].impact.critical, false);
});

test('combat: the air swing is lighter, every third melee hit launches ordinary creatures (never a boss), and the solo-only switches are off by default', () => {
  const a = arena(), e = a.enemy('e', 0, 1), boss = a.enemy('boss', .3, 1, { boss: true });
  assert.deepEqual([a.sim.edge.bonus, a.sim.edge.sure, a.sim.edge.launch, a.sim.edge.scale], [1, false, 0, undefined], 'the server never sets these: online damage is unchanged');
  a.sim.basic(e); a.sim.basic(e); a.sim.basic(e); assert.ok(a.hits.every(h => h.impact.lift === 0), 'no launcher unless the solo game switches it on');
  a.hits.length = 0; a.sim.edge.launch = J.AIR.launch;
  for (let i = 0; i < 3; i++) a.sim.basic(e);
  const lifts = a.hits.filter(h => h.id === 'e').map(h => h.impact.lift); assert.equal(lifts.filter(l => l > 0).length, 1); assert.equal(Math.max(...lifts), J.AIR.launch);
  assert.ok(a.hits.filter(h => h.id === 'boss').every(h => h.impact.lift === 0), 'a boss is never launched by a punch');
  const sword = arena({ kind: 'sword', range: 2.2, arc: .2 }), t = sword.enemy('t', 0, 1.5); sword.sim.edge.launch = J.AIR.launch;
  for (let i = 0; i < 6; i++) sword.sim.basic(t); assert.equal(sword.hits.filter(h => h.impact.lift > 0).length, 2, 'swords launch on every third swing too');
  const b = arena({ kind: 'sword', range: 2.2, arc: .2 }), u = b.enemy('u', 0, 1.5); b.sim.basic(u); b.sim.basic(u, J.AIR.swing);
  assert.equal(b.hits[0].impact.amount, 110); assert.equal(b.hits[1].impact.amount, 88, 'the air swing deals 80%');
  b.sim.basic(u); assert.equal(b.hits[2].impact.amount, 110, 'and the factor does not stick');
});

test('combat: the combo ramp scales own hits, a perfect dodge makes exactly the next own hit a critical, and a block lets a share through with a flag', () => {
  const a = arena({ kind: 'sword', range: 2.2, arc: .2 }), e = a.enemy('e', 0, 1.5); let spent = 0; a.sim.edge.spent = () => spent++;
  a.sim.edge.bonus = 1.4; a.sim.basic(e); assert.equal(a.hits[0].impact.amount, 154);
  a.sim.edge.bonus = 1; a.sim.edge.sure = true; a.sim.basic(e); a.sim.basic(e);
  assert.deepEqual(a.hits.slice(1).map(h => [h.impact.critical, h.impact.amount]), [[true, 550], [false, 110]]); assert.equal(spent, 1); assert.equal(a.sim.edge.sure, false);
  const boss = a.enemy('boss', 0, -1.5, { boss: true }); a.hits.length = 0;
  a.sim.edge.scale = t => t.boss ? .5 : 1; a.sim.basic(boss); a.sim.basic(e);
  const onBoss = a.hits.find(h => h.id === 'boss')!.impact, onE = a.hits.find(h => h.id === 'e')!.impact;
  assert.equal(onBoss.amount, 55); assert.equal(onBoss.blocked, true); assert.equal(onE.amount, 110); assert.equal(onE.blocked, undefined);
  a.sim.reset(); assert.deepEqual([a.sim.edge.bonus, a.sim.edge.sure], [1, false]);
});

test('combat: Breeze Step and Root Quake have an air form; the quake waits for the landing and is wider and stronger', () => {
  const g = arena(), ge = g.enemy('e', 0, 2); g.sim.skill(1); g.run(.3); const ground = g.hits[0].impact.amount;
  const a = arena(), ae = a.enemy('e', 0, 2); assert.equal(a.sim.skill(1, 'fist', J.AIR), true); a.run(.3);
  assert.equal(a.hits[0].impact.amount, Math.round(ground * J.AIR.dash)); assert.equal(a.player.z, g.player.z, 'the air dash covers the same ground: it never crosses what a dash cannot');
  const q = arena(), near = q.enemy('near', 0, 2), rim = q.enemy('rim', 0, 5.6); assert.equal(q.sim.skill(2, 'fist', J.AIR), true);
  assert.equal(q.sim.locksMovement, false, 'no leap: the explorer is already in the air'); assert.equal(q.sim.plunging, true); q.run(1); assert.equal(q.hits.length, 0, 'nothing until the landing');
  assert.equal(q.sim.land(), true); assert.equal(q.sim.land(), false);
  assert.deepEqual(q.hits.map(h => h.id).sort(), ['near', 'rim'], 'the rim creature stands beyond the ground quake (4.4 m) and inside the sky quake (5.4 m)');
  assert.equal(q.hits[0].impact.amount, Math.round(230 * J.AIR.quakePower)); assert.ok(q.hits[0].impact.lift > 0, 'it launches');
  const s = arena(); s.enemy('rim', 0, 5.6); s.sim.skill(2); s.run(1); assert.equal(s.hits.length, 0, 'the ground quake does not reach it');
  void ge; void ae; void near; void rim;
});

test('the combo: hits within 1.5 s chain, a dive after three hits is a finisher, being hit or waiting ends it; the chain gives no damage of its own (the untouched streak does)', () => {
  const c = new J.ComboMeter(); assert.ok(!('bonus' in c) && !('step' in J.COMBO) && !('max' in J.COMBO), 'the timed +4% ramp is gone'); assert.equal(c.live, false);
  const hit = (kind: J.ComboHit, wait = .3) => { c.step(wait); return c.hit(kind); };
  hit('ground'); assert.equal(c.count, 1); assert.equal(c.diveBonus(), 1);
  hit('ground'); hit('launcher'); assert.equal(c.count, 3); assert.equal(c.launched, true);
  assert.equal(c.hit('ground'), false, 'one swing through a crowd counts once'); assert.equal(c.count, 3);
  hit('air'); assert.equal(c.aired, true); assert.equal(c.finisherReady, true); assert.equal(c.diveBonus(), J.COMBO.finisher);
  hit('dive'); assert.deepEqual([c.count, c.finished, c.live, c.diveBonus()], [5, true, false, 1], 'the finisher ends the chain');
  assert.deepEqual(c.view(), { count: 5, launched: true, aired: true, finished: true, live: false }); c.step(J.COMBO.linger + .1); assert.equal(c.view().count, 0, 'the chip clears after a moment');
  for (let i = 0; i < 14; i++) hit('ground'); assert.equal(c.count, 14);
  c.break(); assert.equal(c.live, false); hit('ground'); assert.equal(c.count, 1, 'being hit starts over');
  c.step(1.49); assert.equal(c.live, true); c.step(.02); assert.equal(c.live, false, 'the window is 1.5 s'); hit('dive'); assert.equal(c.finished, false, 'a lone dive is no finisher');
  c.reset(); assert.equal(c.count, 0);
});

test('bosses block low hits: 60% damage from the ground or a single jump, all of it from double-jump height; early bosses and ordinary creatures never block', () => {
  assert.equal(J.BLOCK.share, .6);
  for (const type of ['bear', 'treant', 'croc', 'mushking', 'robot', 'cake', 'gingerbread', 'jellyqueen', 'gorilla', 'colossus']) assert.equal(J.blockShare(type, 99), 1, type + ' is met before the double jump: no block');
  for (const type of ['yeti', 'mammoth', 'frostowl', 'leviathan', 'golem', 'dragon', 'phoenix', 'shadowlord']) assert.equal(J.blockShare(type, 0), .6, type);
  // One number per boss: every boss in the game has its own entry for the owner to tune.
  for (const type of Object.keys(BOSS_SKILLS).filter(k => !k.startsWith('titan_'))) assert.ok(Object.hasOwn(J.BOSS_BLOCK, type), type);
  // A boss without its own number (the titans): by the level its world opens at.
  assert.equal(J.blockShare('titan_x', 8), 1); assert.equal(J.blockShare('titan_x', 10), .6); assert.equal(J.blockShare(undefined, 20), .6);
  assert.equal(J.hitShare(.5, 0, 0), .5, 'from the ground'); assert.equal(J.hitShare(.5, 2, 1), .5, 'from a single jump'); assert.equal(J.hitShare(.5, 3, 1), .5, 'height alone is not enough');
  assert.equal(J.hitShare(.5, 2.1, 2), .5, 'a double jump pressed too low'); assert.equal(J.hitShare(.5, 2.2, 2), 1); assert.equal(J.hitShare(.5, 4.4, 3), 1); assert.equal(J.hitShare(1, 0, 0), 1);
  assert.equal(J.BLOCK.height, J.DIVE.critHeight, 'what opens a boss up is what makes the dive a critical');
});

test('jumping is off where it makes no sense', () => {
  assert.equal(J.canJump({ playing: true }), '');
  assert.equal(J.canJump({ playing: false }), 'idle');
  for (const key of ['menu', 'cutscene', 'indoors', 'fishing', 'placing', 'stunned', 'thrown', 'starship', 'swimming', 'flying', 'riding', 'casting', 'down'] as const) assert.equal(J.canJump({ playing: true, [key]: true }), key, key);
});

test('the Space key: jump by default, the old attack on request (then Left Shift jumps); remembered per device', () => {
  assert.equal(J.jumpKeyAction('Space', 'jump'), 'jump'); assert.equal(J.jumpKeyAction('ShiftLeft', 'jump'), ''); assert.equal(J.jumpKeyAction('Space', 'attack'), 'attack'); assert.equal(J.jumpKeyAction('ShiftLeft', 'attack'), 'jump'); assert.equal(J.jumpKeyAction('KeyF', 'jump'), '');
  const store = new Map<string, string>(), s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  assert.equal(J.readSpaceKey(s), 'jump'); J.saveSpaceKey(s, 'attack'); assert.equal(J.readSpaceKey(s), 'attack'); store.set(J.SPACE_KEY_STORE, 'nonsense'); assert.equal(J.readSpaceKey(s), 'jump');
  assert.equal(J.readSpaceKey(null), 'jump'); assert.equal(J.readSpaceKey({ getItem() { throw new Error('blocked'); } }), 'jump');
  const jump = keysGuideHtml('wasd', false, 'jump'), old = keysGuideHtml('wasd', false, 'attack');
  assert.match(jump, /<dt>Jump<\/dt><dd><kbd>Space<\/kbd><\/dd>.*<dt>Basic attack<\/dt><dd><kbd>F<\/kbd><kbd>N<\/kbd><\/dd>/s); assert.match(old, /<dt>Jump<\/dt><dd><kbd>Shift<\/kbd><\/dd>.*<dt>Basic attack<\/dt><dd><kbd>Space<\/kbd><kbd>F<\/kbd><kbd>N<\/kbd><\/dd>/s);
  for (const guide of [jump, old]) assert.match(guide, /<dt>Eat<\/dt><dd><kbd>H<\/kbd><\/dd>/, 'H is the second attack key, so Eat is G');
});

test('another explorer\'s jump as the host reads it from the pose: only real jump heights, above the ground it stands on', () => {
  assert.equal(J.poseAir(0, 0), 0); assert.equal(J.poseAir(.5, 0), 0); assert.equal(J.poseAir(1.5, 0), 1.5); assert.equal(J.poseAir(1.5, 1), 0, 'standing on a hill is not a jump');
  assert.ok(Math.abs(J.poseAir(3.2, 0, 1.7) - 1.5) < 1e-9, 'a flying disguise is not counted'); assert.equal(J.poseAir(40, 0), 0, 'higher than any jump: ignored'); assert.equal(J.poseAir(undefined, 0), 0); assert.equal(J.poseAir(NaN, 0), 0);
  assert.ok(J.MAX_AIR_SECONDS >= 1.5 && J.MAX_AIR_SECONDS <= 2.5);
});

// ---- The world: the same checks on the real mover and the real creature attacks.
function world() {
  const w = Object.assign(Object.create(World.prototype), {
    state: M.newGame(), scene: new T.Scene(), camera: new T.OrthographicCamera(-3, 3, 3, -3, .1, 20), root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(),
    destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [], particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0,
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(), jump: new J.JumpState(),
    onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {},
  }) as World;
  w.environment = new EnvironmentSimulation(createEnvironmentLayout('home')); return w;
}
const quietFx = () => ({ text() {}, burst() {}, ring() {}, spark() {}, shake() {}, flash() {}, freeze() {}, update() {}, shakeOffset: () => new T.Vector3() }) as unknown as Effects;

test('no platforming: walking into obstacles while jumping gives exactly the path of walking, and the jump never moves the explorer sideways', () => {
  const path = (jumping: boolean) => {
    const w = world(); w.position.set(30, 0, 0); w.obstacles.push({ x: 33, z: 0, r: 1 }, { x: 36, z: 1.2, r: .8 }, { x: 31, z: -3, r: 1.5 });
    const out: number[] = []; let landings = 0; w.onLanded = () => landings++;
    for (let i = 0; i < 400; i++) {
      if (jumping && w.jump.ready && (i % 3 === 0)) w.jump.jump();
      w.keys.clear(); w.keys.add(i < 200 ? 'ArrowRight' : 'ArrowDown'); if (i % 50 > 30) w.keys.add('ArrowUp');
      w.update(.025, true, false); out.push(w.position.x, w.position.z);
      if (jumping) assert.equal(w.position.y, 0, 'the ground position keeps its height: the jump is drawn on top');
    }
    return { out, landings, top: w.jump.peak };
  };
  const walk = path(false), hop = path(true);
  assert.deepEqual(hop.out, walk.out); assert.ok(hop.landings > 3, 'it really jumped'); assert.equal(walk.landings, 0);
  assert.ok(Math.abs(walk.out[2 * 199] - 30) > .5, 'and it really walked');
  // Standing still, a full triple jump leaves x and z untouched, and the drawn explorer rises by the jump height.
  const w = world(); w.position.set(30, 0, 0); w.jump.jump(); w.update(.025, true, false);
  assert.ok(w.jump.height > 0); assert.equal(w.position.x, 30); assert.equal(w.position.z, 0); assert.ok(Math.abs(w.player.position.y - w.jump.height) < .2);
});

test('a boss slam (ground) misses a jumping explorer and still hits one on the ground; its bite (body) hits either way', () => {
  const run = (jumpAt: number | null) => {
    const w = world(); w.fx = quietFx(); const got: Array<[number, string | undefined]> = []; w.onDamage = (n, _s, _id, cls) => { got.push([n, cls]); };
    w.position.set(32, 0, 0); const e = w.spawnSpecies('bear', 30, 0, 0)!; e.attackCount = 1; w.update(.025, true, false);
    assert.equal(e.skill, 'slam');
    for (let i = 0; i < 80 && e.phase === 'windup'; i++) { if (jumpAt !== null && (e.phaseTime ?? 0) <= jumpAt && w.jump.ready && !w.jump.airborne) w.jump.jump(); w.update(.025, true, false); }
    return { got, height: w.jump.height, air: w.jump.airTime };
  };
  const grounded = run(null); assert.equal(grounded.got.length, 1); assert.equal(grounded.got[0][1], 'ground');
  const jumped = run(.15); assert.equal(jumped.got.length, 1, 'the world still reports the blow, with its class');
  assert.equal(jumped.got[0][1], 'ground'); assert.ok(J.dodges('ground', jumped.height), `the explorer is ${jumped.height} m up when it lands`); assert.ok(J.perfectDodge('ground', jumped.height, jumped.air), 'jumping 0.15 s before the slam is a perfect dodge');
  // A plain blow is a body attack.
  const w = world(); w.fx = quietFx(); const classes: Array<string | undefined> = []; w.onDamage = (_n, _s, _id, cls) => { classes.push(cls); };
  w.position.set(31.5, 0, 0); const wolf = w.spawnSpecies('wolf', 30, 0, 0)!; w.jump.jump();
  for (let i = 0; i < 120 && !classes.length; i++) { if (w.jump.ready && !w.jump.airborne) w.jump.jump(); w.update(.025, true, false); }
  assert.deepEqual(classes, ['body']); void wolf;
});

test('lava is a floor hazard: a jump clears a stream only if it ends on dry ground', () => {
  const env = new EnvironmentSimulation(createEnvironmentLayout('lava')), traits = { speed: 5, maxHp: 100 };
  const pool = env.layout.pools[0]; assert.ok(pool, 'the lava world has pools');
  let spot: { x: number; z: number } | null = null;
  for (let a = 0; a < 6.3 && !spot; a += .2) for (let r = 0; r < pool.r && !spot; r += .5) { const p = { x: pool.x + Math.cos(a) * r, z: pool.z + Math.sin(a) * r }; if (env.lavaAt(p)) spot = p; }
  if (!spot) return; // the tide is out everywhere at time 0: nothing to burn
  const stand = (hop: boolean, seconds: number) => { let damage = 0; for (let t = 0; t < seconds; t += .025) damage += env.step(.025, spot!, { x: 0, z: 0 }, { ...traits, hop }, []).damage; return damage; };
  const burnt = stand(false, 1.2); assert.ok(burnt > 0, 'standing in lava burns');
  const hopping = stand(true, 1.2); assert.equal(hopping, 0, 'in the air over it: nothing yet');
  assert.ok(stand(false, .05) > 0, 'landing in it burns at once: the burn that came due in the air was waiting');
});

test('ground telegraphs ripple and the jump has one pooled blob shadow; neither adds meshes per decal', () => {
  const decals = new TelegraphDecals(); decals.begin(); decals.draw(0, 0, 0, 4.8, .5, '#ff3b3b', true); decals.draw(5, 0, 0, 2, .5, '#ff7a1f'); decals.end();
  assert.deepEqual(decals.active.map(d => d.ground), [true, false]);
  const count = () => { let n = 0; decals.root.traverse(o => { if (o instanceof T.Mesh && o.visible && o.parent?.visible !== false) n++; }); return n; };
  assert.equal(count(), 6, 'three meshes per decal, rippling or not');
  const groups = decals.root.children as T.Group[], ripple = (groups[0].children[2] as T.Mesh).geometry, plain = (groups[1].children[2] as T.Mesh).geometry;
  assert.ok(ripple.getAttribute('position').count > plain.getAttribute('position').count, 'the rippling rim carries its inner rings in the same shape');
  assert.ok(RIPPLE_FRAMES >= 6);
  decals.begin(); decals.shadow(1, 0, 1, .5, .4); decals.end(); assert.equal(decals.root.children.filter(o => o.name === 'jump-shadow' && o.visible).length, 1);
  decals.begin(); decals.end(); assert.equal(decals.root.children.filter(o => o.name === 'jump-shadow' && o.visible).length, 0, 'gone on the next frame without a jump');
  decals.begin(); decals.shadow(1, 0, 1, .5, .4); decals.shadow(2, 0, 1, .3, .2); decals.end(); assert.equal(decals.root.children.filter(o => o.name === 'jump-shadow').length, 1, 'one disc, reused');
});

test('every new string has Vietnamese in the jump pack, and the pack serves it', () => {
  for (const key of ['Jump', 'jump', 'Space key', 'HITS', 'FINISHER!', 'LAUNCH!', 'DODGE', 'PERFECT DODGE!', '🛡️ Blocked', 'Sky Step', 'Sky Quake', 'Single jump', 'Double jump', 'Triple jump', 'Space: jump · F or N: attack (hold: power strike) · H: eat', 'Space: attack · Left Shift: jump · F or N: attack (hold: power strike) · H: eat', 'Eat · H',
    'Double jump learned! Jump again in the air.', 'Triple jump learned! Jump three times in the air.', 'Jump and air combat']) { assert.ok(VI_PACK[key] && VI_PACK[key] !== key, key); }
  for (const [key, value] of Object.entries(JUMP_VI)) { assert.equal(VI_PACK[key], value, key); assert.notEqual(value, key); }
});

test('the air window: rising and the early fall give the air move; late in the fall the press is buffered for the ground move', () => {
  const j = new J.JumpState(); assert.equal(J.pressKind(j), 'ground'); assert.equal(J.airWindow(j), false);
  j.jump(); j.step(DT); assert.ok(j.height < J.AIR_WINDOW.minHeight && j.rising); assert.equal(J.pressKind(j), 'air', 'rising, however low');
  while (j.velocity > 0) j.step(DT); assert.equal(J.pressKind(j), 'air', 'the top');
  while (j.height > 1) j.step(DT); assert.ok(j.falling); assert.equal(J.pressKind(j), 'air', 'the early fall');
  while (j.height >= J.AIR_WINDOW.minHeight) j.step(DT); assert.ok(j.airborne && j.height > 0); assert.equal(J.pressKind(j), 'buffer', 'the late fall: no combination');
  fly(j); assert.equal(J.pressKind(j), 'ground');
  // A dive is committed: a press during it waits for the landing too.
  const d = new J.JumpState(); d.jump(); while (d.velocity > 0) d.step(DT); d.dive(); assert.equal(J.pressKind(d), 'buffer');
  assert.equal(J.AIR_WINDOW.minHeight, .35); assert.ok(J.AIR_WINDOW.buffer >= .3);
});

test('the touch slide: Jump, then the same finger onto a button; it fires on release or after a 60 ms rest, never for a brush, once per slide', () => {
  const s = new J.SlideCombo(); assert.equal(s.active, false); assert.equal(s.move(1, 'skill1', 0), null, 'no slide without a Jump press');
  // Release on a button fires it.
  s.begin(1); assert.equal(s.owns(1), true); assert.equal(s.move(1, null, 0), null); assert.equal(s.move(1, 'skill2', .01), null, 'reaching a toe is not enough'); assert.equal(s.release(1), 'skill2'); assert.equal(s.active, false);
  // Brushing a toe on the way to another fires nothing; resting on one for 60 ms does, once.
  s.begin(1); s.move(1, 'skill0', 0); assert.equal(s.move(1, 'skill0', .03), null); assert.equal(s.move(1, 'skill1', .04), null, 'brushed skill0 for 40 ms: nothing');
  assert.equal(s.move(1, 'skill1', .09), null); assert.equal(s.poll(.1001), 'skill1', 'rested 60 ms'); assert.equal(s.poll(.3), null); assert.equal(s.move(1, 'attack', .4), null, 'one move per slide'); assert.equal(s.release(1), null);
  // Lifting on the Jump pad itself, or off every button, fires nothing.
  s.begin(1); assert.equal(s.release(1), null); s.begin(1); s.move(1, 'attack', 0); s.move(1, null, .02); assert.equal(s.release(1), null);
  // Another finger (the joystick's) is never followed, and cannot end the slide.
  s.begin(1); assert.equal(s.owns(2), false); assert.equal(s.move(2, 'skill3', 0), null); assert.equal(s.release(2), null); assert.equal(s.active, true); s.move(1, 'attack', .5); assert.equal(s.release(1), 'attack');
  s.begin(3); s.move(3, 'skill0', 0); s.cancel(); assert.equal(s.poll(9), null); assert.equal(J.SLIDE.dwell, .06);
});

test('touch play has wider timing: the perfect dodge 0.4 s and the combo timer 2 s', () => {
  assert.equal(J.perfectDodge('ground', 1.5, .35), false); assert.equal(J.perfectDodge('ground', 1.5, .35, true), true); assert.equal(J.perfectDodge('ground', 1.5, .41, true), false);
  const c = new J.ComboMeter(); c.hit('ground'); c.step(1.7); assert.equal(c.live, false);
  c.reset(); c.window = J.COMBO.windowTouch; c.hit('ground'); c.step(1.7); assert.equal(c.live, true); c.step(.4); assert.equal(c.live, false);
});
