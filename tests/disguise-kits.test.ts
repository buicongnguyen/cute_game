// The sixteen disguise kits: the ten the reference (Zoo Pet) also has keep its four skills (concept, order, cooldown, range,
// damage factor, duration, effect); the six uniforms have kits that fit the outfit. Every effect runs and has a look that
// DisguiseFx draws, and the tooltips state the numbers the simulation uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatSimulation, DISGUISE_KITS, DISGUISE_LOOKS, DZ, type CombatEffect, type CombatTarget } from '../src/combat.ts';
import { DISGUISES } from '../src/content.ts';
import { DISGUISE_INFO, skillDescription } from '../src/skill-info.ts';
import { skillSound } from '../src/skill-sounds.ts';
import { LOOKS } from '../src/skill-visuals.ts';
import { DisguiseFx } from '../src/disguise-fx.ts';
import { makeSummon } from '../src/summon-art.ts';
import { lookOf } from '../src/shot-art.ts';
import { setLanguage, t } from '../src/i18n.ts';

/** Reference cooldowns, slot 1-4 (bundle index-CgCMMPRt.js, skill table `Hh` @770872; see facts-combat.md §2b). */
const REFERENCE_CD: Record<string, number[]> = {
  dz_superhero: [3, 6, 7, 10], dz_ninja: [14, 12, 6, 12], dz_mage: [5, 5, 12, 13], dz_knight: [8, 7, 12, 12], dz_mecha: [12, 14, 7, 16],
  dz_dino: [9, 5, 12, 18], dz_fairy: [12, 10, 14, 14], dz_pirate: [12, 6, 10, 14], dz_vampire: [7, 9, 12, 15], dz_snowman: [7, 12, 12, 16],
};
/** Reference icons, slot 1-4 (same table). */
const REFERENCE_ICON: Record<string, string[]> = {
  dz_superhero: ['🦸', '☄️', '👀', '🪨'], dz_ninja: ['👥', '👤', '⚡', '💨'], dz_mage: ['🔥', '✨', '🐑', '🌀'], dz_knight: ['🛡️', '🐎', '📯', '🗡️'],
  dz_mecha: ['🚜', '🗼', '🚀', '🔰'], dz_dino: ['😋', '🌪️', '📢', '🦕'], dz_fairy: ['💖', '🦋', '💘', '🌳'], dz_pirate: ['💣', '🪝', '🦜', '🏴‍☠️'],
  dz_vampire: ['🩸', '🦇', '🌑', '🌕'], dz_snowman: ['⚪', '⛄', '🧊', '❄️'],
};
const UNIFORMS = ['dz_army', 'dz_navy', 'dz_aodai', 'dz_aodai_man', 'dz_usa', 'dz_vietnam'];

function arena(extra: Partial<CombatTarget>[] = []) {
  const p = { x: 0, z: 0 }, effects: CombatEffect[] = [], hits: { id: string; amount: number; stun: number; critical: boolean }[] = [], statuses: { id: string; kind: string; d: number }[] = [];
  const targets: CombatTarget[] = [{ id: 'a', x: 0, z: 3, hp: 1e6, maxHp: 1e6, radius: .5, facing: Math.PI }, { id: 'b', x: 1.5, z: 5, hp: 1e6, maxHp: 1e6, radius: .5 }, { id: 'c', x: -1, z: 8, hp: 1e6, maxHp: 1e6, radius: .5 }, ...extra.map((e, i) => ({ id: 'x' + i, x: 0, z: 0, hp: 1e6, maxHp: 1e6, radius: .5, ...e }))];
  let facing = 0, healed = 0;
  const sim = new CombatSimulation({ position: () => p, facing: () => facing, face: a => { facing = a; }, targets: () => targets, weapon: () => ({ kind: 'fist' }), stats: () => ({ attack: 10, critChance: 0, maxHp: 100 }),
    move: (x, z) => { p.x += x; p.z += z; }, moveTarget: (tg, x, z) => { tg.x = x; tg.z = z; }, hit: (tg, h) => { hits.push({ id: tg.id, amount: h.amount, stun: h.stun, critical: h.critical }); return h.amount; },
    effect: e => effects.push(e), status: (tg, kind, d) => statuses.push({ id: tg.id, kind, d }), heal: f => { healed += f; } }, () => .5);
  const run = (seconds: number) => { for (let i = 0; i < seconds * 40; i++) sim.update(.025); };
  return { sim, p, effects, hits, statuses, targets, run, healed: () => healed };
}

test('all 16 disguises have exactly four skills, a kit entry, a description, a sound and an icon each', () => {
  assert.equal(Object.keys(DISGUISES).length, 16);
  for (const [id, d] of Object.entries(DISGUISES)) {
    assert.equal(d.skills.length, 4, id); assert.equal(DISGUISE_KITS[id]?.length, 4, id); assert.equal(DISGUISE_INFO[id]?.length, 4, id);
    d.skills.forEach((s, i) => { assert.ok(s.name && s.icon && s.cd > 0, `${id} ${i}`); assert.ok(skillDescription(i, { disguise: id }).length > 10); assert.ok(skillSound(i, id)); });
    assert.equal(new Set(d.skills.map(s => s.name)).size, 4, `${id} has four different skills`);
  }
});

test('the ten reference disguises keep its cooldowns and icons, slot by slot', () => {
  for (const [id, cds] of Object.entries(REFERENCE_CD)) {
    assert.deepEqual(DISGUISES[id].skills.map(s => s.cd), cds, id);
    assert.deepEqual(DISGUISES[id].skills.map(s => s.icon), REFERENCE_ICON[id], id);
  }
});

test('reference mechanics: ranges, damage factors and durations match its skill code', () => {
  // [value in DZ, reference value] — offsets are the run() of each skill in the reference bundle.
  const pairs: [number, number, string][] = [
    [DZ.flight.time, 12, 'flight 12 s @770980'], [DZ.flight.speed, .35, 'flight +35% @770980'], [DZ.dive.radius, 5, 'dive r5 @771466'], [DZ.dive.power, 2, 'dive ×2'], [DZ.dive.flying, 4, 'dive ×4 flying'],
    [DZ.clones.count, 2, 'clones 2 @773811'], [DZ.clones.life, 8, 'clones 8 s'], [DZ.clones.power, .5, 'clones ×0.5'], [DZ.stealth.time, 5, 'stealth 5 s @774233'], [DZ.stealth.speed, .3, 'stealth +30%'],
    [DZ.backstab.range, 12, 'backstab 12 m @774556'], [DZ.backstab.power, 3.2, 'backstab ×3.2'], [DZ.smoke.radius, 5, 'smoke r5 @775194'], [DZ.smoke.time, 5, 'smoke 5 s'], [DZ.smoke.blind, 1.2, 'blind 1.2 s'],
    [DZ.fireball.charge, .8, 'fireball .8 s @776020'], [DZ.fireball.range, 14, 'fireball 14 m'], [DZ.fireball.radius, 5, 'fireball r5'], [DZ.fireball.power, 3.5, 'fireball ×3.5'], [DZ.teleport.distance, 8, 'blink 8 m @776913'],
    [DZ.sheep.range, 12, 'sheep 12 m @777344'], [DZ.sheep.around, 3, 'sheep +3 m'], [DZ.sheep.count, 3, 'sheep 1+2'], [DZ.sheep.time, 6, 'sheep 6 s'],
    [DZ.blackhole.pull, 8, 'black hole pull 8 m @777765'], [DZ.blackhole.time, 3, 'black hole 3 s'], [DZ.blackhole.radius, 5, 'black hole r5'], [DZ.blackhole.power, 3, 'black hole ×3'],
    [DZ.block.time, 4, 'shield 4 s @778818'], [DZ.knightcharge.speed * DZ.knightcharge.time, 11, 'charge 22×0.5 @779253'], [DZ.knightcharge.power, 2.5, 'charge ×2.5'], [DZ.taunt.radius, 12, 'taunt 12 m @779744'], [DZ.taunt.defence, 80, 'taunt +80 def'],
    [DZ.holy.range, 14, 'sky sword 14 m @780086'], [DZ.holy.radius, 3.5, 'sky sword r3.5'], [DZ.holy.power, 4.5, 'sky sword ×4.5'],
    [DZ.tank.time, 6, 'tank 6 s @780648'], [DZ.tank.speed, .8, 'tank +80%'], [DZ.tank.defence, 30, 'tank +30 def'], [DZ.tank.reach, 1.6, 'ram 1.6 m'], [DZ.tank.power, 1.6, 'ram ×1.6'], [DZ.tank.rehit, .6, 'ram every .6 s'],
    [DZ.turret.life, 12, 'turret 12 s @781249'], [DZ.turret.power, .55, 'turret ×0.55'], [DZ.missiles.count, 6, '6 missiles @781544'], [DZ.missiles.range, 15, 'missiles 15 m'], [DZ.missiles.radius, 2, 'missile r2'], [DZ.missiles.power, 1.4, 'missile ×1.4'],
    [DZ.energyshield.time, 4, 'energy shield 4 s @782418'], [DZ.energyshield.heal, .2, 'energy shield 20%'],
    [DZ.devour.reach, 3.2, 'devour 3.2 m @783064'], [DZ.devour.below, .4, 'devour <40%'], [DZ.devour.heal, .25, 'devour heal 25%'], [DZ.devour.power, 3, 'devour ×3'],
    [DZ.tail.radius, 3.6, 'tail r3.6 @783561'], [DZ.tail.power, 1.8, 'tail ×1.8'], [DZ.tail.knock, 6, 'tail knock 6'], [DZ.roar.radius, 9, 'roar 9 m @783817'], [DZ.roar.time, 4, 'fear 4 s'],
    [DZ.giant.time, 10, 'giant 10 s @784154'], [DZ.giant.defence, 20, 'giant +20 def'], [DZ.giant.radius, 2.5, 'step r2.5'], [DZ.giant.power, .7, 'step ×0.7'],
    [DZ.heal.time, 8, 'flower ring 8 s @784752'], [DZ.heal.radius, 4, 'flower ring r4'], [DZ.heal.perTick / DZ.heal.tick, .06, '6%/s'], [DZ.hover.time, 8, 'float 8 s @785323'], [DZ.hover.speed, .25, 'float +25%'],
    [DZ.charm.range, 12, 'charm 12 m @785647'], [DZ.charm.time, 8, 'charm 8 s'], [DZ.tree.life, 6, 'tree 6 s @785987'], [DZ.tree.root, 4, 'root 4 s'], [DZ.tree.radius, 5, 'root r5'], [DZ.tree.power, .8, 'tree ×0.8'], [DZ.tree.ahead, 3, 'tree 3 m ahead'],
    [DZ.cannon.life, 10, 'cannon 10 s @786651'], [DZ.cannon.power, 1.4, 'cannon ×1.4'], [DZ.cannon.cd, 1.3, 'cannon every 1.3 s'], [DZ.hook.range, 14, 'hook 14 m @786952'], [DZ.hook.power, 1.2, 'hook ×1.2'], [DZ.hook.slow, 2, 'hook slow 2 s'],
    [DZ.parrot.life, 8, 'parrot 8 s @787504'], [DZ.parrot.power, .4, 'parrot ×0.4'], [DZ.parrot.mark, 8, 'mark 8 s'],
    [DZ.broadside.count, 12, '12 cannonballs @787880'], [DZ.broadside.range, 15, 'broadside 15 m'], [DZ.broadside.radius, 1.8, 'ball r1.8'], [DZ.broadside.power, 1.4, 'ball ×1.4'],
    [DZ.drain.range, 11, 'drain 11 m @788531'], [DZ.drain.power, .7, 'drain ×0.7'], [DZ.drain.tick, .35, 'drain tick .35 s'], [DZ.drain.heal, .8, 'drain heals 80%'],
    [DZ.bats.time, 2.5, 'bat form 2.5 s @789463'], [DZ.bats.speed, 1, 'bat form +100%'], [DZ.batcircle.count, 5, '5 bats @790040'], [DZ.batcircle.life, 8, 'bats 8 s'], [DZ.batcircle.power, .35, 'bat ×0.35'],
    [DZ.bloodnova.radius, 7, 'blood moon 7 m @790531'], [DZ.bloodnova.time, 6, 'bleed 6 s'], [DZ.bloodnova.power / DZ.bloodnova.tick, .6, 'bleed atk×0.6/s'], [DZ.bloodnova.lifesteal, .4, 'lifesteal 40%'],
    [DZ.snowball.time, 2.4, 'snowball 2.4 s @791134'], [DZ.snowball.speed, 9, 'snowball 9 m/s'], [DZ.snowball.slow, 3, 'snowball slow 3 s'],
    [DZ.decoy.life, 6, 'decoy 6 s @791968'], [DZ.decoy.radius, 4, 'decoy burst r4'], [DZ.decoy.power, 2.5, 'decoy ×2.5'], [DZ.decoy.freeze, 2, 'decoy freeze 2 s'],
    [DZ.icefloor.time, 8, 'ice rink 8 s @792466'], [DZ.icefloor.radius, 6, 'ice rink r6'], [DZ.icefloor.speed, .5, 'ice rink +50%'], [DZ.iceage.radius, 8, 'ice age 8 m @792933'], [DZ.iceage.freeze, 3, 'freeze 3 s'], [DZ.iceage.power, 2.8, 'shatter ×2.8'],
  ];
  for (const [ours, ref, what] of pairs) assert.ok(Math.abs(ours - ref) < 1e-9, `${what}: ${ours} != ${ref}`);
});

test('the six uniforms have their own kits, shaped like the reference kits', () => {
  const borrowed = new Set(Object.keys(REFERENCE_CD).flatMap(id => DISGUISE_KITS[id]));
  for (const id of UNIFORMS) {
    const cds = DISGUISES[id].skills.map(s => s.cd);
    assert.ok(cds.every(cd => cd >= 5 && cd <= 18), `${id} cooldowns ${cds}`);
    assert.ok(cds[3] >= 14 && cds[3] === Math.max(...cds), `${id}: slot 4 is the big one`);
    assert.ok(DISGUISE_KITS[id].every(e => !borrowed.has(e)), `${id} does not borrow a reference kit skill`);
  }
  // No real-weapon wording on the toy soldier.
  for (const text of [...DISGUISE_INFO.dz_army, ...DISGUISES.dz_army.skills.map(s => s.name)]) assert.doesNotMatch(text, /rifle|gun turret|rocket|grenade|missile|bullet/i, text);
});

test('every kit skill runs, resets cleanly, and each look it emits is drawn', () => {
  const fx = new DisguiseFx({ ground: () => 0, explorerAt: () => null }), seen = new Set<string>();
  for (const [id, kit] of Object.entries(DISGUISE_KITS)) kit.forEach((effect, slot) => {
    const a = arena(); assert.equal(a.sim.disguise(id, slot), true, `${id} ${effect}`); a.run(9);
    assert.ok(a.effects.length || a.hits.length || a.statuses.length || a.healed() > 0, `${id} ${effect} has an observable result`);
    for (const e of a.effects) { assert.ok(Number.isFinite(e.x) && Number.isFinite(e.z) && Number.isFinite(e.radius), `${id} ${effect}`); if (e.look) seen.add(e.look); }
    a.sim.reset(); assert.equal(a.sim.projectiles.length, 0); assert.equal(a.sim.allies.length, 0); assert.deepEqual(a.sim.statuses, {});
  });
  for (const look of seen) if (!['eyes', 'burn', 'shock', 'boulder'].includes(look)) { assert.ok(LOOKS[look], look); assert.equal(fx.play({ look: look as CombatEffect['look'], kind: 'cast', x: 0, z: 0, radius: 3, color: '#ffffff' }), true, look); }
  for (const look of ['sandbag', 'flare', 'parachute', 'whistle', 'ribbon', 'fan', 'lantern', 'kite', 'ink', 'dragondance', 'starshield', 'torch', 'firework', 'bamboo', 'drum', 'bigstar']) {
    assert.ok((DISGUISE_LOOKS as readonly string[]).includes(look)); assert.ok(seen.has(look), `${look} is emitted by its skill`);
  }
  for (const kind of ['parrot', 'tree', 'lighthouse'] as const) { const model = makeSummon(kind); assert.equal(model.name, 'summon-' + kind); }
  assert.equal(lookOf('cork'), 'cork');
});

test('tooltip numbers match the simulation: each "×N damage within R m" hits for ×N and draws an R m ring', () => {
  let checked = 0;
  for (const [id, list] of Object.entries(DISGUISE_INFO)) list.forEach((_, slot) => {
    const text = skillDescription(slot, { disguise: id });
    for (const [, dmg, r] of text.matchAll(/×([\d.]+) damage (?:each )?(?:within|in a) ([\d.]+) m/g)) {
      const a = arena([{ x: 4, z: 0 }, { x: -3, z: -3 }, { x: -2.5, z: 3 }]); a.sim.disguise(id, slot); a.run(9);
      const want = Math.round(10 * Number(dmg));
      assert.ok(a.hits.some(h => h.amount === want), `${id} ${slot}: no ×${dmg} hit (${[...new Set(a.hits.map(h => h.amount))]})`);
      assert.ok(a.effects.some(e => Math.abs(e.radius - Number(r)) < 1e-9), `${id} ${slot}: no ${r} m effect`);
      checked++;
    }
  });
  assert.ok(checked >= 17, `checked ${checked}`);
});

test('reference behaviours: frozen, rooted, blocked, rammed, carried, drained', () => {
  // Ice age freezes (a 3 s hold), then shatters for ×2.8.
  const ice = arena(); ice.sim.disguise('dz_snowman', 3); assert.ok(ice.statuses.filter(s => s.kind === 'stun' && s.d === 3).length >= 2); assert.equal(ice.hits.length, 0); ice.run(3.1); assert.ok(ice.hits.some(h => h.amount === 28));
  // The binding tree roots for 4 s and lashes ×0.8 once a second.
  const tree = arena(); tree.sim.disguise('dz_fairy', 3); assert.ok(tree.statuses.some(s => s.kind === 'stun' && s.d === 4)); tree.run(6.2); assert.ok(tree.hits.filter(h => h.amount === 8).length >= 5);
  // The knight's shield blocks only blows from in front.
  const knight = arena(); knight.sim.disguise('dz_knight', 0); assert.equal(knight.sim.blocks({ x: 0, z: 3 }), true); assert.equal(knight.sim.blocks({ x: 0, z: -3 }), false); knight.run(4.1); assert.equal(knight.sim.blocks({ x: 0, z: 3 }), false);
  // The knight's charge carries a creature along and strikes once at the end for ×2.5.
  const charge = arena(); const before = charge.targets[0].z; charge.sim.disguise('dz_knight', 1); charge.run(.3); assert.equal(charge.hits.length, 0); assert.ok(charge.targets[0].z > before); charge.run(.4); assert.ok(charge.hits.some(h => h.id === 'a' && h.amount === 25));
  // Tank mode: +30 defence, 80% faster.
  const tank = arena(); tank.sim.disguise('dz_mecha', 0); assert.equal(tank.sim.defenseBonus, 30); assert.equal(tank.sim.speedBonus, .8);
  // Ninja strike: ×3.2, shown as a critical blow.
  const ninja = arena(); ninja.sim.disguise('dz_ninja', 2); assert.equal(ninja.hits[0].amount, 32); assert.equal(ninja.hits[0].critical, true);
  // Life drain: 8 bites of ×0.7, healing 80% of the damage.
  const drain = arena(); drain.sim.disguise('dz_vampire', 0); drain.run(3); assert.equal(drain.hits.length, 8); assert.ok(Math.abs(drain.healed() - 8 * 7 * .8 / 100) < 1e-9);
  // Sheep: the nearest and at most two around it.
  const sheep = arena([{ x: .5, z: 3.5 }, { x: -.5, z: 3.5 }, { x: 0, z: 4.5 }]); sheep.sim.disguise('dz_mage', 2); assert.equal(sheep.statuses.filter(s => s.kind === 'sheep').length, 3);
});

test('uniform behaviours: cover, whistle, lighthouse, torch, flare', () => {
  const bag = arena(); bag.sim.disguise('dz_army', 1); assert.equal(bag.sim.defenseBonus, 60); bag.p.z = 5; assert.equal(bag.sim.defenseBonus, 0, 'cover only behind the sandbags');
  const whistle = arena(); whistle.sim.disguise('dz_navy', 2); assert.equal(whistle.statuses.filter(s => s.kind === 'stun' && s.d === 2.5).length, 3);
  const light = arena(); light.sim.disguise('dz_navy', 3); assert.equal(light.sim.allies[0].kind, 'lighthouse'); light.run(2.1); for (const id of ['a', 'b', 'c']) assert.ok(light.hits.some(h => h.id === id), `beam swept over ${id}`);
  assert.ok(light.statuses.some(s => s.kind === 'blind'));
  const torch = arena(); torch.sim.disguise('dz_usa', 2); assert.ok(torch.healed() > 0); torch.sim.disguise('dz_army', 0); torch.run(1); assert.ok(torch.hits.some(h => h.amount === Math.round(10 * 1.2 * 1.3)), 'the torch adds 30% damage');
  const flare = arena(); flare.sim.disguise('dz_army', 2); flare.run(.6); assert.ok(flare.sim.marked.has('a')); assert.ok(flare.statuses.some(s => s.id === 'a' && s.kind === 'blind' && s.d === 4));
});

test('every description reads in Vietnamese', () => {
  setLanguage('vi');
  try { for (const [id, list] of Object.entries(DISGUISE_INFO)) list.forEach((_, i) => { const text = skillDescription(i, { disguise: id }); assert.doesNotMatch(text, /\b(damage|enemies|enemy|within|seconds?|ahead)\b/, `${id} ${i}: ${text}`); assert.notEqual(t(DISGUISES[id].skills[i].name), DISGUISES[id].skills[i].name, `${id} ${i} name`); }); }
  finally { setLanguage('en'); }
});
