// The Dawn star dancer (dz_dawnstar): our own magical-girl disguise. Its four skills do what their tips say, it sits
// mid-table as a crowd controller without moving anybody else's scores or prices, its art is in the kit within budget,
// and every word of it reads in Vietnamese.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CombatSimulation, DISGUISE_KITS, DZ, type CombatEffect, type CombatTarget } from '../src/combat.ts';
import { DISGUISES, ITEMS, RECIPES } from '../src/content.ts';
import { AIR_CAST } from '../src/air-cast.ts';
import { SKILL_WIND, HAND_BLADE } from '../src/skill-wind.ts';
import { BUFF_CHIPS, DISGUISE_INFO, skillDescription } from '../src/skill-info.ts';
import { LOOKS } from '../src/skill-visuals.ts';
import { AXES, allProfiles, axisBest, profile, rawProfile } from '../src/disguise-profile.ts';
import { DAWNSTAR_ITEMS_VI, DAWNSTAR_VI } from '../src/locales/vi-dawnstar.ts';
import { VI_PACK } from '../src/locales/vi-pack.ts';
import { iconPath } from '../src/item-icons.ts';

const ID = 'dz_dawnstar';
function arena(list: Partial<CombatTarget>[], pets: { dmg: number; cd: number }[] = []) {
  const p = { x: 0, z: 0 }, effects: CombatEffect[] = [], hits: { id: string; amount: number; stun: number; t: number }[] = [], statuses: { id: string; kind: string; d: number }[] = [];
  const targets: CombatTarget[] = list.map((e, i) => ({ id: 'e' + i, x: 0, z: 0, hp: 1e6, maxHp: 1e6, radius: .5, ...e }));
  let facing = 0, healed = 0, time = 0;
  const sim = new CombatSimulation({ position: () => p, facing: () => facing, face: a => { facing = a; }, targets: () => targets, weapon: () => ({ kind: 'gun', range: 9, cd: .45, shot: 'star' }), stats: () => ({ attack: 10, critChance: 0, maxHp: 100 }),
    move: (x, z) => { p.x += x; p.z += z; }, moveTarget: (tg, x, z) => { tg.x = x; tg.z = z; }, hit: (tg, h) => { hits.push({ id: tg.id, amount: h.amount, stun: h.stun, t: time }); return h.amount; },
    effect: e => effects.push(e), status: (tg, kind, d) => statuses.push({ id: tg.id, kind, d }), heal: f => { healed += f; },
    ...(pets[0] ? { pet: () => ({ x: p.x - 1, z: p.z, ...pets[0] }) } : {}) }, () => .5);
  const run = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 40); i++) { time += .025; sim.update(.025); } };
  return { sim, p, effects, hits, statuses, targets, run, healed: () => healed };
}

test('the kit: four skills of its own, each with a name, an icon, a cooldown, a tip, an air class and a wind class', () => {
  assert.deepEqual(DISGUISE_KITS[ID], ['lasso', 'dawnglow', 'sparklestep', 'starshower']);
  assert.deepEqual(DISGUISES[ID].skills.map(s => [s.name, s.icon, s.cd]), [['Ribbon lasso', '🎀', 6], ['Morning glow', '🌅', 12], ['Sparkle step', '✨', 7], ['Star shower', '🌠', 15]]);
  assert.deepEqual(DISGUISES[ID].weapon, { kind: 'gun', range: 9, cd: .45, shot: 'star' });
  // No effect, name or icon of another kit is reused: sixteen kits were here first.
  for (const [id, kit] of Object.entries(DISGUISE_KITS)) if (id !== ID) { for (const effect of kit) assert.ok(!DISGUISE_KITS[ID].includes(effect), effect); for (const s of DISGUISES[id].skills) assert.ok(!DISGUISES[ID].skills.some(mine => mine.name === s.name), s.name); }
  assert.deepEqual(DISGUISE_KITS[ID].map(e => AIR_CAST[e]), [{ cls: 'air', at: 'body' }, { cls: 'air', at: 'body' }, { cls: 'move', how: 'glide' }, { cls: 'air', at: 'ground' }]);
  assert.deepEqual(DISGUISE_KITS[ID].map(e => SKILL_WIND[e].cls), ['sweep', 'none', 'dash', 'none']);
  for (const look of ['lasso', 'sparkle', 'starlet']) assert.equal(typeof LOOKS[look], 'function', look);
  // The wand is part of the costume (a hand-right piece of disguises.glb), not a borrowed blade.
  assert.equal(HAND_BLADE[ID], undefined);
});

test('ribbon lasso: only creatures in the cone ahead are hit, pulled toward the dancer (never onto her) and tied up', () => {
  const K = DZ.lasso, a = arena([{ x: 0, z: 5 }, { x: 3.5, z: 3.5 }, { x: 0, z: 1.2 }, { x: 0, z: -3 }, { x: 5, z: .5 }, { x: 0, z: 7 }]);
  assert.equal(a.sim.disguise(ID, 0), true);
  assert.deepEqual(a.hits.map(h => h.id).sort(), ['e0', 'e1', 'e2']); assert.ok(a.hits.every(h => h.amount === Math.round(10 * K.power)));
  assert.ok(Math.abs(a.targets[0].z - (5 - K.pull)) < 1e-9, 'pulled the full length');
  assert.ok(Math.abs(Math.hypot(a.targets[1].x, a.targets[1].z) - (Math.hypot(3.5, 3.5) - K.pull)) < 1e-9); assert.ok(Math.abs(a.targets[1].x - a.targets[1].z) < 1e-9, 'straight toward her');
  assert.equal(a.targets[2].z, 1.2, 'one already close is not dragged through her');
  assert.deepEqual([a.targets[3].z, a.targets[4].x, a.targets[5].z], [-3, 5, 7], 'behind, beside and out of reach: untouched');
  assert.deepEqual(a.statuses.map(s => [s.id, s.kind, s.d]).sort(), [['e0', 'stun', K.bind], ['e1', 'stun', K.bind], ['e2', 'stun', K.bind]]);
  const look = a.effects.find(e => e.look === 'lasso')!; assert.equal(look.radius, K.radius);
});

test('morning glow: a shield, a heal, and the pets shoot half again as fast while it lasts', () => {
  const K = DZ.dawnglow, a = arena([{ x: 0, z: 3 }]);
  assert.equal(a.sim.disguise(ID, 1), true); assert.equal(a.healed(), K.heal); assert.equal(a.sim.invulnerable, true); assert.equal(a.hits.length, 0, 'it hurts nobody');
  a.run(K.time - .1); assert.equal(a.sim.invulnerable, true); a.run(.2); assert.equal(a.sim.invulnerable, false);
  assert.ok(a.effects.some(e => e.look === 'shield')); assert.ok(BUFF_CHIPS.cheer && BUFF_CHIPS.shield);
  // A pet with a 1 s cooldown: 6 shots in 6 plain seconds, 9 in the 6 cheered ones (and the dog's toss runs on the same clock).
  const shots = (cheered: boolean) => { const b = arena([{ x: 0, z: 3, phase: 'chase' }], [{ dmg: .5, cd: 1 }]); if (cheered) b.sim.disguise(ID, 1); let n = 0, seen = new Set<number>(); for (let i = 0; i < K.cheerTime * 40; i++) { b.sim.update(.025); for (const s of b.sim.projectiles) if (s.helper && !seen.has(s.id)) { seen.add(s.id); n++; } } return n; };
  const plain = shots(false), cheered = shots(true); assert.equal(plain, 6); assert.equal(cheered, Math.round(6 * (1 + K.cheer)));
});

test('sparkle step: an untouchable step, then a trail that slows and stings whoever stands on it until it fades', () => {
  const K = DZ.sparklestep, length = K.speed * K.time, a = arena([{ x: .8, z: 4 }, { x: 4, z: 4 }, { x: 0, z: 14 }]);
  // No creature to aim at within reach: the step goes where she faces.
  a.targets.forEach(t => { t.hp = 0; }); assert.equal(a.sim.disguise(ID, 2), true); a.targets.forEach(t => { t.hp = 1e6; });
  assert.equal(a.sim.invulnerable, true); a.run(K.time + .05); assert.ok(Math.abs(a.p.z - length) < .7 && Math.abs(a.p.x) < 1e-9, `stepped ${a.p.z} m`); assert.equal(a.sim.invulnerable, false);
  const trail = a.effects.find(e => e.look === 'sparkle')!; assert.ok(trail, 'the trail is drawn'); assert.ok(Math.abs(trail.radius - a.p.z / 2) < 1e-9 && Math.abs(trail.z - a.p.z / 2) < 1e-9, 'over the line she ran'); assert.equal(trail.duration, K.trail);
  a.run(K.trail + .5);
  const on = a.hits.filter(h => h.id === 'e0'); assert.equal(on.length, K.trail / K.tick); assert.ok(on.every(h => h.amount === Math.round(10 * K.power)));
  assert.equal(a.hits.filter(h => h.id !== 'e0').length, 0, 'beside the trail and past its end: untouched');
  assert.equal(a.statuses.filter(s => s.id === 'e0' && s.kind === 'slow' && s.d === K.slow).length, K.trail / K.tick); assert.ok(a.statuses.every(s => s.id === 'e0'));
  const before = a.hits.length; a.run(2); assert.equal(a.hits.length, before, 'the trail is gone');
});

test('star shower: a ring of stars one after another, then the dawn star bursts over all of it and stuns', () => {
  const K = DZ.starshower, a = arena([{ x: 0, z: K.ring }, { x: 0, z: -.3 }, { x: 0, z: K.finalRadius + 1.5 }]);
  assert.equal(a.sim.disguise(ID, 3), true); assert.equal(a.hits.length, 0); a.run(K.fall + K.count * K.spacing + K.finale + .2);
  const stars = a.effects.filter(e => e.look === 'starlet'); assert.equal(stars.length, K.count);
  for (const s of stars) { assert.ok(Math.abs(Math.hypot(s.x, s.z) - K.ring) < 1e-9); assert.equal(s.radius, K.radius); assert.equal(s.duration, K.fall); }
  const small = Math.round(10 * K.power), big = Math.round(10 * K.finalPower);
  // On the ring: the star that lands there and its two neighbours, then the burst. At her feet: only the burst.
  assert.deepEqual(a.hits.filter(h => h.id === 'e0').map(h => h.amount), [small, small, small, big]);
  assert.deepEqual(a.hits.filter(h => h.id === 'e1').map(h => [h.amount, h.stun]), [[big, K.stun]]); assert.equal(a.hits.filter(h => h.id === 'e2').length, 0);
  assert.ok(a.effects.some(e => e.look === 'goldstar' && e.radius === K.finalRadius));
  assert.equal(rawProfile(ID).skills[3].facts.damage, 3 * K.power + K.finalPower);
});

test('strength: a crowd controller in the middle of the table, and nobody else moved', () => {
  const p = profile(ID), all = allProfiles(), order = [...all].sort((a, b) => b.total - a.total).map(x => x.id), rank = order.indexOf(ID) + 1;
  assert.equal(p.role, 'controller'); assert.equal(p.strong[0], 'control'); assert.equal(p.ranged, true);
  assert.ok(rank >= 6 && rank <= 12, `rank ${rank} of ${all.length}`);
  // It is the best at nothing, so the 100 of every axis (and with it every other disguise's score and price) is what it was.
  for (const axis of AXES) { assert.ok(p.raw[axis] < axisBest()[axis], axis); assert.ok(p.scores[axis] < 100, axis); assert.ok(p.raw[axis] > 0, `${axis}: it does a little of everything`); }
  assert.deepEqual(Object.fromEntries(all.filter(x => x.id !== ID).map(x => [x.id, ITEMS[x.id].price])), { dz_superhero: 600, dz_ninja: 550, dz_mage: 410, dz_knight: 480, dz_mecha: 530, dz_dino: 300, dz_fairy: 480, dz_army: 380, dz_navy: 400, dz_aodai: 420, dz_aodai_man: 310, dz_usa: 510, dz_vietnam: 320, dz_pirate: 300, dz_vampire: 440, dz_snowman: 530 });
  assert.equal(ITEMS[ID].price, Math.round(p.total / 6) * 10); assert.equal(ITEMS[ID].sell, Math.round(ITEMS[ID].price! * .55 / 10) * 10);
});

test('the item: a rare disguise sold at the outfitters for energy and three materials, like the others', () => {
  const item = ITEMS[ID]; assert.equal(item.type, 'disguise'); assert.equal(item.slot, 'disguise'); assert.equal(item.rare, true); assert.equal(item.name, 'Dawn star dancer'); assert.equal(DISGUISES[ID].name, item.name);
  assert.deepEqual(item.stats, { hp: 40, regen: 3, speed: .1 });
  const recipe = RECIPES.find(r => r.result === ID)!; assert.equal(recipe.station, 'shop'); assert.equal(recipe.category, 'Disguises'); assert.equal(recipe.energy, item.price);
  assert.deepEqual(recipe.materials, { starshard: 2, feather: 6, sugar: 6 }); for (const id of Object.keys(recipe.materials)) assert.equal(ITEMS[id].type, 'material', id);
  assert.equal(iconPath(ID), `items/${ID}.webp`); assert.ok(existsSync(new URL(`../public/assets/icons/items/${ID}.webp`, import.meta.url)));
});

test('the art: its pieces are in disguises.glb with a part tag each, within the triangle budget, and nothing in it glows', () => {
  const bytes = readFileSync(new URL('../public/assets/models/disguises.glb', import.meta.url)), length = bytes.readUInt32LE(12), doc = JSON.parse(bytes.toString('utf8', 20, 20 + length));
  assert.ok(bytes.length <= 900 * 1024, `disguises.glb is ${bytes.length} bytes (build_hero.py DZ_GLB_LIMIT)`);
  const roots = doc.scenes[doc.scene ?? 0].nodes.map((i: number) => doc.nodes[i]); assert.equal(roots.length, 17);
  const root = roots.find((n: { name: string }) => n.name === ID); assert.ok(root, 'dz_dawnstar is in the kit');
  const pieces = root.children.map((i: number) => doc.nodes[i]) as { name: string; mesh: number }[], tags = pieces.map(p => p.name.split('@')[1]).sort();
  assert.deepEqual([...new Set(tags)], ['arm-left', 'arm-right', 'body', 'hand-right', 'head', 'leg-left', 'leg-right']);
  let triangles = 0; const materials = new Set<number>();
  for (const piece of pieces) for (const prim of doc.meshes[piece.mesh].primitives) { triangles += doc.accessors[prim.indices].count / 3; materials.add(prim.material); }
  assert.ok(triangles > 1500 && triangles <= 2500, `${triangles} triangles`);
  for (const m of materials) { const mat = doc.materials[m]; assert.match(mat.name, /^Disguise dawnstar /); assert.equal(mat.emissiveFactor, undefined, `${mat.name}: plain materials merge into the avatar's baked colours`); }
  // The wand is the only hand piece: the game leaves it out when a weapon is equipped (world.ts avatar).
  assert.deepEqual(pieces.filter(p => p.name.endsWith('@hand-right')).map(p => p.name), ['dz_dawnstar_wand@hand-right']);
  assert.match(readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8'), /if\(gear\.weapon\)for\(const own of \[\.\.\.\(c\.getObjectByName\('hand-right'\)\?\.children\?\?\[\]\)\]\)own\.removeFromParent\(\)/);
});

test('every word of it reads in Vietnamese, with the same numbers as the English', () => {
  const numbers = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => n.replace(',', '.'));
  DISGUISE_INFO[ID].forEach((text, i) => {
    assert.equal(skillDescription(i, { disguise: ID }), text); assert.ok(DAWNSTAR_VI[text], `no Vietnamese for: ${text}`); assert.equal(VI_PACK[text], DAWNSTAR_VI[text]);
    assert.deepEqual(numbers(DAWNSTAR_VI[text]), numbers(text), `skill ${i + 1}`);
  });
  for (const text of [ITEMS[ID].name, ITEMS[ID].desc, ...DISGUISES[ID].skills.map(s => s.name)]) { assert.ok(DAWNSTAR_ITEMS_VI[text], text); assert.equal(VI_PACK[text], DAWNSTAR_ITEMS_VI[text]); }
  assert.equal(VI_PACK[BUFF_CHIPS.cheer.name], DAWNSTAR_VI['Pets cheered on']);
  for (const [en, vi] of Object.entries({ ...DAWNSTAR_ITEMS_VI, ...DAWNSTAR_VI })) { assert.ok(vi.trim().length > 0, en); assert.equal(vi, vi.normalize('NFC'), en); assert.notEqual(vi, en); }
  // Nothing unused: every entry is a string the game shows.
  const shown = new Set([...DISGUISE_INFO[ID], ITEMS[ID].name, ITEMS[ID].desc, ...DISGUISES[ID].skills.map(s => s.name), BUFF_CHIPS.cheer.name]);
  for (const en of [...Object.keys(DAWNSTAR_ITEMS_VI), ...Object.keys(DAWNSTAR_VI)]) assert.ok(shown.has(en), `unused: ${en}`);
});

test('our own design: none of the names and terms of the character that inspired the genre', () => {
  const words = [ITEMS[ID].name, ...DISGUISES[ID].skills.map(s => s.name), ...DISGUISE_INFO[ID], ...Object.values(DAWNSTAR_ITEMS_VI), ...Object.values(DAWNSTAR_VI)].join(' | ');
  assert.doesNotMatch(words, /sailor|moon|senshi|guardian|tiara|crescent|prism|odango|usagi|serenity|scout|thuỷ thủ|thủy thủ|mặt trăng/i);
});
