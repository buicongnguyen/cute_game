// Round 26 (fx builder): the superhero's laser gaze drawn where it hits, the battle robot's electric attacks, ponds that
// refill in seconds with twice the fish, an 18 s harpoon restock, and line-break chances per rod (60/30/10 %) that the
// server's fishing proof check rolls exactly like the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as T from 'three';
import { CombatSimulation, GAZE, ELECTRIC_SHOTS, ELECTRIC_COLOR, EFFECT_LOOKS, DISGUISE_LOOKS, distanceToSegment, type CombatEffect, type CombatTarget, type WeaponProfile } from '../src/combat.ts';
import { CombatView } from '../src/combat-view.ts';
import { SkillFx, gazeEnds, eyePoints, GAZE_BEAM, SHOCK_MARK, type ShockTarget } from '../src/skill-fx.ts';
import { DISGUISE_INFO, statusMarks } from '../src/skill-info.ts';
import { skillSound } from '../src/skill-sounds.ts';
import { t, setLanguage } from '../src/i18n.ts';
import * as M from '../src/model.ts';
import { FishingSimulation, FISH_PER_WATER, RESTOCK_AFTER_CATCH, LINE_BREAK, STRAIN, lineBreakChance, lineRoll, lineSnaps } from '../src/fishing.ts';
import { FishingProof } from '../src/fishing-proof.ts';
import { FishingView, type PondView } from '../src/fishing-view.ts';
import { FishSchool } from '../src/fish-school.ts';
import { huntingPonds, fishHuntTargets, fishHuntKey, huntFish, FISH_HUNT_RESTOCK_MS } from '../src/fish-hunting.ts';
import { GUARDIAN_COOLDOWN_MS, GUARDIAN_POND, GUARDIAN_SLOT, guardianTarget } from '../src/lake-guardian.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService } from '../server/action-service.mjs';
import { ACTION_RULES_VERSION } from '../src/actions.ts';

function seeded(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
function rig(targets: CombatTarget[], weapon: WeaponProfile = { kind: 'fist' }) {
  const effects: CombatEffect[] = [], hits: Array<{ id: string; stun: number }> = [];
  const host = { position: () => ({ x: 0, z: 0 }), facing: () => 0, face() {}, targets: () => targets, weapon: () => weapon, stats: () => ({ attack: 10, critChance: 0 }),
    move() {}, hit: (target: CombatTarget, h: { stun: number }) => { hits.push({ id: target.id, stun: h.stun }); }, effect: (e: CombatEffect) => { effects.push(e); }, status() {}, skillLevel: () => 0, heal() {}, moveTarget() {} };
  return { sim: new CombatSimulation(host as never, () => .5), effects, hits };
}
const run = (sim: CombatSimulation, seconds: number) => { for (let i = 0; i < seconds * 60; i++) sim.update(1 / 60); };
const at = (angle: number, d: number, id: string, radius = .5): CombatTarget => ({ id, x: Math.sin(angle) * d, z: Math.cos(angle) * d, hp: 1e6, radius });
/** Is the point inside the line a beam effect draws (its origin, facing, length and width), for a body of radius r? */
const inBeam = (e: CombatEffect, p: { x: number; z: number }, r: number) => {
  const fx = Math.sin(e.facing!), fz = Math.cos(e.facing!), dx = p.x - e.x, dz = p.z - e.z, along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
  return along > 0 && along < e.radius && across < r + e.width! / 2;
};

// ---- 1. Laser gaze: the drawn line is the hit line ------------------------------------------------------------------
test('laser gaze: every beam drawn is the GAZE line, and exactly the creatures inside a drawn line are hit', () => {
  const targets = [at(0, 4, 'ahead'), at(.5, 8, 'swept'), at(.3, 13.8, 'beyond'), at(Math.PI, 3, 'behind'), at(1.4, 4, 'wide'), at(-.85, 12.4, 'edge', .3)];
  const g = rig(targets); assert.equal(g.sim.disguise('dz_superhero', 2), true); run(g.sim, GAZE.time + .3);
  const beams = g.effects.filter(e => e.kind === 'beam');
  assert.equal(beams.length, Math.round(GAZE.time / GAZE.step) + 1);
  for (const b of beams) { assert.equal(b.look, 'eyes'); assert.equal(b.radius, GAZE.length); assert.equal(b.width, GAZE.width); }
  // The sweep covers GAZE.arc, centred on the aim (the nearest creature, straight ahead).
  assert.ok(Math.abs(beams[0].facing! + GAZE.arc / 2) < 1e-9 && Math.abs(beams.at(-1)!.facing! - GAZE.arc / 2) < 1e-9);
  const hit = new Set(g.hits.map(h => h.id));
  for (const target of targets) assert.equal(hit.has(target.id), beams.some(b => inBeam(b, target, target.radius)), target.id);
  assert.deepEqual([...hit].sort(), ['ahead', 'edge', 'swept']);
  // Each hit leaves a scorch ('burn') on the beam's centre line, where it touched the creature.
  const burns = g.effects.filter(e => e.look === 'burn');
  assert.equal(burns.length, g.hits.length);
  for (const burn of burns) {
    const b = beams.find(x => x.facing === burn.facing)!, end = { x: b.x + Math.sin(b.facing!) * GAZE.length, z: b.z + Math.cos(b.facing!) * GAZE.length };
    assert.ok(distanceToSegment(burn, b, end) < 1e-9);
  }
});

test('a beam plane lies along its facing at every angle (it was mirrored across z on diagonals)', () => {
  const scene = new T.Scene(), view = new CombatView(scene);
  for (const facing of [0, .7, -2.3, Math.PI / 2, 2.9]) {
    view.effect({ x: 1, z: 2, kind: 'beam', radius: 10, facing, width: 1.4, color: '#ffffff' });
    const mesh = scene.children.at(-1)!; mesh.updateMatrixWorld(true);
    const a = new T.Vector3(0, 5, 0).applyMatrix4(mesh.matrixWorld), b = new T.Vector3(0, -5, 0).applyMatrix4(mesh.matrixWorld);
    const far = { x: 1 + Math.sin(facing) * 10, z: 2 + Math.cos(facing) * 10 };
    const ends = [[a, b], [b, a]].find(([p, q]) => Math.hypot(p.x - 1, p.z - 2) < 1e-6 && Math.hypot(q.x - far.x, q.z - far.z) < 1e-6);
    assert.ok(ends, `facing ${facing}: ${a.x.toFixed(2)},${a.z.toFixed(2)} → ${b.x.toFixed(2)},${b.z.toFixed(2)}`);
    const edge = new T.Vector3(.7, 0, 0).applyMatrix4(mesh.matrixWorld);
    assert.ok(Math.abs(distanceToSegment(edge, { x: 1, z: 2 }, far) - .7) < 1e-6, 'drawn as wide as the hit line');
  }
});

test('the eye beams leave the eyes at head height and end inside the hit line, together as wide as it', () => {
  for (const angle of [0, .9, -1.7, 3]) {
    const ends = gazeEnds({ x: 2, z: 3 }, angle, [0, 0, 0, 0]), fx = Math.sin(angle), fz = Math.cos(angle);
    for (const k of [0, 1]) {
      const dx = ends[k * 2] - 2, dz = ends[k * 2 + 1] - 3, along = dx * fx + dz * fz, across = dx * fz - dz * fx;
      assert.ok(Math.abs(along - GAZE.length) < 1e-9);
      assert.ok(Math.abs(Math.abs(across) + GAZE_BEAM.end / 2 - GAZE.width / 2) < 1e-9, 'the outer beam edges meet the line edges');
    }
    // An explorer facing elsewhere, head turned to the gaze (world.ts animatePlayer): both eyes sit over the hit line.
    const model = new T.Group(), head = new T.Group(); head.name = 'head'; head.position.set(0, 1.12, 0); model.add(head);
    model.position.set(2, 0, 3); model.rotation.y = angle - .8; head.rotation.y = .8; model.scale.setScalar(.84);
    const l = new T.Vector3(), r = new T.Vector3(); eyePoints(model, l, r);
    for (const eye of [l, r]) {
      const dx = eye.x - 2, dz = eye.z - 3;
      assert.ok(dx * fx + dz * fz > .3 && Math.abs(dx * fz - dz * fx) < GAZE.width / 2, `eye over the line at ${angle}`);
      assert.ok(Math.abs(eye.y - .84 * (1.12 + .465)) < 1e-6, 'eye height');
    }
  }
});

test('the gaze view draws twin beams from the eyes to the line end, a ground band, sparks and scorches', () => {
  const scene = new T.Scene(), model = new T.Group(), head = new T.Group(); head.name = 'head'; head.position.set(0, 1.12, 0); model.add(head); scene.add(model);
  const sounds: string[] = [], fx = new SkillFx(scene, null, { explorerAt: () => model, ground: () => 0, targets: () => [], sound: k => { sounds.push(k); } });
  fx.gaze({ x: 0, z: 0, kind: 'beam', radius: GAZE.length, width: GAZE.width, facing: 0, duration: .075, color: '#ff3b30', look: 'eyes' });
  fx.update(.016);
  assert.deepEqual(sounds, ['zap']); assert.equal(fx.gazeAngle(model), 0);
  const start = (fx.glow as unknown as { start: Float32Array; end: Float32Array }), l = new T.Vector3(), r = new T.Vector3(); eyePoints(model, l, r);
  const ends = gazeEnds({ x: 0, z: 0 }, 0, [0, 0, 0, 0]);
  assert.ok(Math.hypot(start.start[0] - l.x, start.start[1] - l.y, start.start[2] - l.z) < 1e-5, 'a beam starts at the left eye');
  assert.ok(Math.hypot(start.end[0] - ends[0], start.end[2] - ends[1]) < 1e-5, 'and ends at its end of the line');
  assert.ok(fx.glow.count >= 6 && fx.core.count >= 4);
  const band = scene.getObjectByName('gaze-band')!; band.updateMatrixWorld(true);
  const far = new T.Vector3(.5, 0, 1).applyMatrix4(band.matrixWorld);
  assert.ok(band.visible && Math.abs(far.x - GAZE.width / 2) < 1e-6 && Math.abs(far.z - GAZE.length) < 1e-6, 'the ground band is the hit line');
  assert.ok(fx.liveDecals >= 1, 'the end of the line scorches the ground');
  for (let i = 0; i < 30; i++) fx.update(.016);
  assert.equal(band.visible, false, 'the gaze ends with its effects'); assert.equal(fx.gazeAngle(model), null);
});

// ---- 2. The battle robot is electric ------------------------------------------------------------------------------
test('the battle robot fires electricity: volt bolts, a tesla turret, shock missiles and an electric tank wave', () => {
  assert.equal(M.DISGUISES.dz_mecha.weapon!.shot, 'volt'); assert.equal(M.ITEMS.pet_robot.pet!.shot, 'volt');
  assert.ok(ELECTRIC_SHOTS.has('volt') && ELECTRIC_SHOTS.has('missile')); assert.deepEqual([...EFFECT_LOOKS].sort(), ['boulder', 'burn', 'eyes', 'shock', ...DISGUISE_LOOKS].sort());
  const ring = () => [at(0, 3, 'a'), at(1, 4, 'b'), at(-1, 5, 'c')];
  // Missiles: every impact and blast is an electric burst; no stun added (they never stunned).
  const m = rig(ring()); m.sim.disguise('dz_mecha', 2); run(m.sim, 2);
  const shocks = m.effects.filter(e => e.look === 'shock');
  assert.ok(shocks.some(e => e.kind === 'impact') && shocks.some(e => e.kind === 'ring' && e.radius === 2));
  assert.ok(shocks.every(e => e.color === ELECTRIC_COLOR)); assert.ok(m.hits.length > 0 && m.hits.every(h => h.stun === 0));
  // Tank mode: rams what it touches (the reference's 1.6 m, ×1.6, knock 5) with an electric shockwave.
  const k = rig([at(0, 1.5, 'near')]); k.sim.disguise('dz_mecha', 0); run(k.sim, .6);
  assert.ok(k.effects.filter(e => e.kind === 'ring').every(e => e.look === 'shock' && e.radius === 1.6)); assert.ok(k.hits.every(h => h.stun === 0) && k.hits.length === 1, 'rammed once in 0.6 s');
  // The turret and the robot's own gun shoot volt bolts.
  const tr = rig(ring()); tr.sim.disguise('dz_mecha', 1); run(tr.sim, 1 / 60); assert.ok(tr.sim.projectiles.length && tr.sim.projectiles.every(p => p.kind === 'volt'));
  const gun = rig(ring(), M.weaponStats({ ...M.newGame(), gear: { disguise: 'dz_mecha' } } as M.SaveState) as WeaponProfile);
  assert.equal(gun.sim.basic(), true); assert.equal(gun.sim.projectiles[0].kind, 'volt'); run(gun.sim, .5);
  assert.ok(gun.effects.some(e => e.kind === 'impact' && e.look === 'shock'));
  assert.deepEqual([0, 1, 2, 3].map(i => skillSound(i, 'dz_mecha')), ['shock', 'zap', 'zap', 'magic']);
});

test('electric descriptions in English and Vietnamese; the ⚡ mark shows after a shock, next to a stun', () => {
  const [tank, turret, missiles] = DISGUISE_INFO.dz_mecha;
  assert.match(tank, /electric shockwave/); assert.match(turret, /tesla turret.*shock bolts/); assert.match(missiles, /shock missiles.*electric burst/);
  assert.match(DISGUISE_INFO.dz_superhero[2], /Twin eye lasers.*13 m.*1 m wide/);
  setLanguage('vi');
  try { for (const text of [tank, turret, missiles]) { assert.notEqual(t(text), text); assert.match(t(text), /điện|sét/); } assert.match(t(DISGUISE_INFO.dz_superhero[2]), /laser từ mắt/); }
  finally { setLanguage('en'); }
  assert.equal(statusMarks({ shock: 1 }), '⚡'); assert.equal(statusMarks({ stun: 1, shock: 1, statuses: { slow: 1 } }), '💫⚡'); assert.equal(statusMarks({ shock: 0 }), '');
});

test('an electric burst crackles, flashes and marks the living creatures inside it with ⚡ for a moment', async () => {
  const targets: ShockTarget[] = [{ x: 0, z: 0, radius: .6, hp: 10 }, { x: 2.4, z: 0, radius: .6, hp: 10 }, { x: 3, z: 0, radius: .6, hp: 10 }, { x: 0, z: 1, radius: .6, hp: 0 }];
  const sounds: string[] = [], fx = new SkillFx(new T.Scene(), null, { explorerAt: () => null, ground: () => 0, targets: () => targets, sound: k => { sounds.push(k); } });
  fx.shock({ x: 0, z: 0, kind: 'ring', radius: 2, color: ELECTRIC_COLOR, look: 'shock' });
  assert.deepEqual(targets.map(x => x.shock ?? 0), [SHOCK_MARK, SHOCK_MARK, 0, 0], 'inside the blast (radius + body) and alive');
  assert.ok(fx.liveBolts >= 6, 'branching arcs'); assert.deepEqual(sounds, ['shock']);
  fx.update(.05); assert.ok(fx.glow.count > 0 && fx.core.count > 0, 'drawn as glowing ribbons');
  fx.shock({ x: 0, z: 0, kind: 'impact', radius: .5, color: ELECTRIC_COLOR, look: 'shock' }, false, false); assert.deepEqual(sounds, ['shock'], 'the zap sound is throttled');
  for (let i = 0; i < 80; i++) fx.update(.02);
  assert.deepEqual(targets.map(x => x.shock ?? 0), [0, 0, 0, 0]); assert.equal(fx.liveBolts, 0);
  // The server relays the look of remote players' effects.
  assert.match(await readFile(new URL('../server/server.mjs', import.meta.url), 'utf8'), /EFFECT_LOOKS\.includes\(visual\.look\)/);
});

// ---- 3. Ponds full of fish, refilled in seconds ------------------------------------------------------------------
test('ponds hold twice the reference fish, refill a catch in a few seconds, and rod and harpoon share one stock', () => {
  const reference: Record<string, number> = { home: 4, lake: 9, swamp: 4, candy: 6, ice: 6, lava: 0, toy: 5, jungle: 5, ocean: 7, dark: 5, shadow: 5 };
  for (const [water, n] of Object.entries(reference)) assert.equal(FISH_PER_WATER[water], n * 2, water);
  assert.ok(RESTOCK_AFTER_CATCH >= 2 && RESTOCK_AFTER_CATCH <= 5);
  const hunt = huntingPonds('home')[1], pond: PondView = { ...hunt }, fx = { ring() {}, burst() {}, shake() {}, flash() {} };
  const view = new FishingView(new T.Scene(), fx as never, { ready: false } as never, () => {}, () => 0);
  view.populate([pond], () => ['fish_perch'], undefined, p => fishHuntTargets(huntingPonds('home').find(h => h.id === p.id)!, 0).map(f => f.id));
  type Fish = { mystery?: boolean; species: string }; const ordinary = () => (view as unknown as { fish: Fish[] }).fish.filter(f => !f.mystery).length;
  assert.equal(ordinary(), FISH_PER_WATER[hunt.waterId]); assert.equal(fishHuntTargets(hunt, 0).length, FISH_PER_WATER[hunt.waterId], 'one stock per pond');
  const player = new T.Vector3(pond.x, 0, pond.z + pond.rz + 1), tip = player.clone();
  view.begin(pond, tip, { x: pond.x, z: pond.z }); view.approachDistance('fish_perch');
  const before = ordinary(); view.land(() => player, () => {});
  assert.equal(ordinary(), before - 1, 'the catch leaves the pond');
  for (let s = 0; s < RESTOCK_AFTER_CATCH - .2; s += .1) view.update(.1, s, tip, player, null);
  assert.equal(ordinary(), before - 1, 'not before RESTOCK_AFTER_CATCH');
  for (let s = 0; s < .4; s += .1) view.update(.1, s, tip, player, null);
  assert.equal(ordinary(), before, 'refilled');
});

test('kit fish are instanced: a species is one body and one tail draw however many swim', () => {
  const part = (name: string, color: string, x = 0) => ({ name, geometry: new T.BoxGeometry(.1, .1, .2), material: new T.MeshToonMaterial({ color }), matrix: new T.Matrix4().makeTranslation(x, 0, 0) });
  const kit = { ready: true, parts: (id: string) => id === 'fish_perch' ? [part('fish_perch_body_1', '#88aa44'), part('fish_perch_body_2', '#ffffff', .05), part('fish_perch_tail', '#ff9a3a', -.2)] : undefined };
  const school = new FishSchool(kit as never), pond = new T.Group();
  const fish = Array.from({ length: 30 }, (_, i) => { const h = school.handle('fish_perch')!; h.obj.position.set(i, 0, 0); h.obj.rotation.y = i * .2; h.tail!.rotation.y = .5; pond.add(h.obj); return h; });
  school.render(); assert.equal(school.draws, 2); assert.equal(school.fish, 30);
  const layers = school.root.children as T.InstancedMesh[];
  assert.deepEqual(layers.map(l => l.count), [30, 30]);
  // Each tail instance hangs off its own body at the hinge, turned with it.
  const m = new T.Matrix4(), body = new T.Vector3(), tail = new T.Vector3();
  for (let k = 0; k < 30; k++) {
    layers[0].getMatrixAt(k, m); body.setFromMatrixPosition(m); layers[1].getMatrixAt(k, m); tail.setFromMatrixPosition(m);
    const i = Math.round(body.x), expect = new T.Vector3(-.2, 0, 0).applyAxisAngle(new T.Vector3(0, 1, 0), i * .2).add(body);
    assert.ok(tail.distanceTo(expect) < 1e-6, `fish ${i}`);
  }
  fish[3].obj.visible = false; pond.remove(fish[4].obj); school.render();
  assert.deepEqual(layers.map(l => l.count), [28, 28]); assert.equal(school.fish, 29, 'a fish taken out of the scene is forgotten');
  assert.equal(school.handle('fish_missing'), null);
});

// ---- 4. Harpoon restock ------------------------------------------------------------------------------------------
test('a harpoon slot restocks in 18 s, the Lake Guardian still waits 20 h', () => {
  assert.ok(FISH_HUNT_RESTOCK_MS >= 15_000 && FISH_HUNT_RESTOCK_MS <= 20_000); assert.equal(GUARDIAN_COOLDOWN_MS, 20 * 3_600_000);
  const T0 = Date.parse('2026-10-03T10:00:00Z'), pond = huntingPonds('home')[1], s = M.newGame(); s.level = 10; s.bag.harpoon = 1; s.gear.weapon = 'harpoon';
  const shore = { x: pond.x, z: pond.z + pond.rz + .6 }, target = fishHuntTargets(pond, T0).sort((a, b) => Math.hypot(a.x - shore.x, a.z - shore.z) - Math.hypot(b.x - shore.x, b.z - shore.z))[0];
  const r = huntFish(s, { weaponId: 'harpoon', pondId: pond.id, slot: target.slot, aim: target }, shore, T0)!;
  assert.equal(r.hit, true); assert.equal(r.readyAt, T0 + FISH_HUNT_RESTOCK_MS); assert.equal(s.hunting!.readyAt[fishHuntKey(pond.id, target.slot)], T0 + FISH_HUNT_RESTOCK_MS);
  // The guardian: caught once, it is gone for 20 h, not 18 s.
  const lake = huntingPonds('home').find(p => p.id === GUARDIAN_POND)!, g = M.newGame(); g.level = 10; g.bag.harpoon = 1; g.gear.weapon = 'harpoon';
  let now = T0, up = null; for (; now < T0 + 3_600_000 && !(up = guardianTarget(lake, now, g.hunting)); now += 5000);
  assert.ok(up, 'the guardian surfaces within an hour');
  const d = Math.hypot(up!.x - lake.x, up!.z - lake.z) || 1, from = { x: lake.x + (up!.x - lake.x) / d * (lake.rx + .5), z: lake.z + (up!.z - lake.z) / d * (lake.rx + .5) };
  const caught = huntFish(g, { weaponId: 'harpoon', pondId: lake.id, slot: GUARDIAN_SLOT, aim: up! }, from, now)!;
  assert.equal(caught.hit, true); assert.equal(caught.readyAt, now + GUARDIAN_COOLDOWN_MS);
  assert.equal(guardianTarget(lake, now + FISH_HUNT_RESTOCK_MS + 2000, g.hunting), null);
});

// ---- 5. Line break chances --------------------------------------------------------------------------------------
test('a strained line snaps 60 % (bamboo), 30 % (golden), 10 % (steady) over 2000 seeded fights, always after a warning', () => {
  const heavy = { id: 'fish_shark', power: 2 };
  for (const [id, chance] of [['rod', LINE_BREAK.bamboo], ['rod_gold', LINE_BREAK.golden], ['rod_steady', LINE_BREAK.steady]] as const) {
    const rod = M.ITEMS[id].weapon!; assert.equal(lineBreakChance(rod), chance, id);
    let strained = 0, snapped = 0, warned = 0; const N = 2000;
    for (let seed = 1; seed <= N; seed++) {
      const lineSeed = Math.imul(seed, 7919) >>> 0, f = new FishingSimulation({ quality: rod.quality!, steady: rod.steady === true, bait: false, choose: () => heavy, random: seeded(seed), lineSeed });
      for (let s = 0; s < 60 && f.phase !== 'bite'; s += .025) f.update(.025, false);
      f.update(.025, true); assert.equal(f.phase, 'hooked');
      let sawWarning = false;
      for (let s = 0; s < 60 && !f.finished && f.strains === 0; s += .025) { if (f.strained) sawWarning = true; f.update(.025, true); }
      if (!f.strains) continue;
      strained++; if (sawWarning) warned++;
      if (f.snapped) snapped++;
      assert.equal(f.snapped, lineSnaps(lineSeed, 0, chance), 'the roll is lineRoll(seed, 0), as the server rolls it');
    }
    const rate = snapped / strained;
    assert.ok(strained >= N / 2, `${id}: ${strained} fights strained`); assert.equal(warned, strained, 'the warning comes before every roll');
    assert.ok(Math.abs(rate - chance) <= .05, `${id}: snapped ${snapped}/${strained} = ${rate.toFixed(3)}, want ${chance}`);
  }
});

test('a line that holds gives a little: tension back to 0.7, the fish takes 8 % of the line, the fight goes on', () => {
  let seed = 1; while (lineSnaps(seed, 0, LINE_BREAK.bamboo)) seed++;
  const f = new FishingSimulation({ quality: .3, bait: false, choose: () => ({ id: 'fish_carp', power: 1 }), random: seeded(3), lineSeed: seed });
  for (let s = 0; s < 60 && f.phase !== 'bite'; s += .025) f.update(.025, false);
  f.update(.025, true); let progress = 0;
  for (let s = 0; s < 60 && f.strains === 0; s += .025) { progress = f.progress; f.update(.025, true); }
  assert.equal(f.phase, 'hooked'); assert.equal(f.strains, 1); assert.equal(f.strainsHeld, 1); assert.equal(f.tension, STRAIN.relief);
  assert.ok(f.progress < progress && progress - f.progress < STRAIN.slip + .02);
  assert.ok(lineRoll(seed, 0) >= LINE_BREAK.bamboo && lineRoll(seed, 0) < 1);
  // Without a seed (offline, tests) the simulation's own random rolls.
  assert.equal(new FishingSimulation({ quality: .3, bait: false, choose: () => null }).lineSeed, null);
});

test('the proof keeps every strain through thinning and reports the count', () => {
  const proof = new FishingProof(0);
  for (let i = 0; i < 400; i++) { proof.sample(1000 + i * 50, i % 7 < 4, .4, Math.min(1, i / 400)); if (i % 90 === 45) proof.strain(1000 + i * 50 + 10, i / 400); }
  const out = proof.finish(25000);
  assert.ok(out.samples.length <= 94); assert.equal(out.strains, 4); assert.equal(out.samples.filter(s => s.strain).length, 4);
  assert.ok(out.samples.filter(s => s.strain).every(s => s.tension === 1 && s.held));
});

// ---- 6. Server parity -------------------------------------------------------------------------------------------
test('server parity: the fishing ticket seeds the strain rolls; the proof check refuses a line that should have snapped', async t => {
  let now = 2_000_000_000_000; t.mock.method(Date, 'now', () => now);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-w26-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const profile = M.newGame('alice'); profile.bag = { rod: 1 } as M.SaveState['bag'];
  await store.create({ id: 'alice', username: 'alice', hash: 'h', salt: 's', friends: [], requests: [], profile });
  const peer = { planet: 'home', room: 'home', pose: { x: -7.5, z: 15.3 } }, execute = createActionService({ store, getPeer: () => peer });
  const act = async (type: string, payload: Record<string, unknown>) => execute('alice', { rulesVersion: ACTION_RULES_VERSION, requestId: randomUUID(), expectedRevision: (await store.get('alice')).profileRevision || 0, type, payload });
  const cast = { rodId: 'rod', water: 'home', cast: { x: -7.5, z: 13.5 } };
  const base = [{ t: 2, held: true, tension: .3, progress: .2 }, { t: 9, held: true, tension: .5, progress: .6 }, { t: 20, held: true, tension: .4, progress: 1 }];
  const strainAt = { t: 5, held: true, tension: 1, progress: .4, strain: true as const };
  let refused = false, accepted = false, simulated = 0;
  for (let attempt = 0; attempt < 40 && !(refused && accepted && simulated >= 3); attempt++) {
    const start = await act('fishStart', cast), ticket = (await store.get('alice')).fishingTicket, seed = start.result.lineSeed;
    assert.equal(seed, ticket.seed); assert.ok(Number.isSafeInteger(seed)); assert.equal(ticket.breakChance, LINE_BREAK.bamboo);
    // The browser's simulation with the server's seed snaps exactly where the server would refuse.
    const sim = new FishingSimulation({ quality: .3, bait: false, choose: () => ({ id: start.result.pick.id, power: start.result.pick.power }), random: seeded(attempt + 1) });
    sim.setLineSeed(seed);
    for (let s = 0; s < 60 && sim.phase !== 'bite'; s += .025) sim.update(.025, false);
    sim.update(.025, true); for (let s = 0; s < 90 && !sim.finished; s += .025) sim.update(.025, true);
    if (sim.strains) { simulated++; for (let i = 0; i < sim.strains; i++) assert.equal(lineSnaps(seed, i, ticket.breakChance), sim.snapped && i === sim.strains - 1); }
    now += 21_000;
    const samples = [base[0], strainAt, ...base.slice(1)];
    await assert.rejects(act('fishFinish', { ticketId: ticket.id, telemetry: { elapsed: 20, hookAt: 1, samples, strains: 0 } }), (e: { status: number }) => e.status === 400, 'a strain not declared');
    await assert.rejects(act('fishFinish', { ticketId: ticket.id, telemetry: { elapsed: 20, hookAt: 1, samples: [base[0], { ...strainAt, strain: undefined }, ...base.slice(1)], strains: 0 } }), (e: { status: number }) => e.status === 400, 'full tension with no strain');
    if (lineSnaps(seed, 0, LINE_BREAK.bamboo)) {
      await assert.rejects(act('fishFinish', { ticketId: ticket.id, telemetry: { elapsed: 20, hookAt: 1, samples, strains: 1 } }), (e: { status: number; message: string }) => e.status === 409 && /snapped/.test(e.message));
      await act('fishCancel', { ticketId: ticket.id }); refused = true;
    } else {
      const done = await act('fishFinish', { ticketId: ticket.id, telemetry: { elapsed: 20, hookAt: 1, samples, strains: 1 } });
      assert.equal(done.result.id, ticket.outcome.id); accepted = true;
    }
  }
  assert.ok(refused && accepted && simulated >= 3, `refused ${refused}, accepted ${accepted}, simulated ${simulated}`);
});

test('combat parity: the browser and the server run one simulation, so the gaze and the shocks match hit for hit', () => {
  const play = () => { const r = rig([at(0, 4, 'a'), at(.5, 8, 'b'), at(-.4, 3, 'c', .6)]); r.sim.disguise('dz_superhero', 2); run(r.sim, 1.6); r.sim.disguise('dz_mecha', 2); run(r.sim, 2); return r; };
  const client = play(), server = play();
  assert.deepEqual(server.hits, client.hits); assert.deepEqual(server.effects, client.effects);
  assert.ok(client.effects.some(e => e.look === 'eyes') && client.effects.some(e => e.look === 'shock'));
});
