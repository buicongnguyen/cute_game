import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as M from '../src/model.ts';
import { ITEMS, LOOT_TABLES } from '../src/content.ts';
import { VI_CATALOG } from '../src/locales/vi-catalog.ts';
import { COLOSSUS_ITEMS, COLOSSUS_STATS as S, clockText, colossusClock, colossusMaxHp } from '../src/colossus-content.ts';
import { COLOSSUS_VI } from '../src/locales/vi-colossus.ts';
import { COLOSSUS_CALLOUTS, COLOSSUS_ORDER, COLOSSUS_WINDUPS, beginColossusAttack, colossusCadence, colossusDamage, colossusFeet, colossusSkill, colossusTelegraphs, headLowered, headMultiplier, headPoint, sanitizeColossusAttack, stepColossusAttack, throughDefence, type ColossusAttack, type ColossusTarget } from '../src/colossus-patterns.ts';
import { colossusContributors, grantColossusReward } from '../src/colossus-rewards.ts';
import { rallySpot } from '../src/bot-logic.ts';

const at = (iso: string) => Date.parse(iso);
const run = (a: ColossusAttack, targets: ColossusTarget[], seconds: number, dt = .05) => { const hits = []; let summon = false; for (let t = 0; t < seconds; t += dt) { const r = stepColossusAttack(a, dt, targets); hits.push(...r.hits); summon ||= r.summon; } return { hits, summon }; };
const source = { x: 78, z: 0, facing: -Math.PI / 2 };

test('Colossus is available 08:00 to midnight Vietnam time, once per day', () => {
 const idle=colossusClock(at('2026-10-06T00:49:59Z'));assert.equal(idle.phase,'idle');
 const soon=colossusClock(at('2026-10-06T00:50:00Z'));assert.equal(soon.phase,'soon');assert.equal(soon.left,600000);
 const start=colossusClock(at('2026-10-06T01:00:00Z'));assert.equal(start.phase,'active');assert.equal(start.left,16*3600000);
 const late=colossusClock(at('2026-10-06T16:59:59Z'));assert.equal(late.phase,'active');assert.equal(late.day,start.day);
 const end=colossusClock(at('2026-10-06T17:00:00Z'));assert.equal(end.phase,'idle');assert.equal(end.day,start.day+1);assert.equal(end.startsAt,at('2026-10-07T01:00:00Z'));
 assert.equal(clockText(425000),'7:05');assert.equal(clockText(-5),'0:00');
});

test('health is 3,000,000 for one explorer and grows 80% per extra explorer (2026-10-07 balance patch)', () => {
  assert.equal(S.hp, 3000000, 'bundle sb_colossus hp:3e6 @660630'); assert.equal(S.perExtraPlayer, .8);
  assert.equal(colossusMaxHp(1), 3000000); assert.equal(colossusMaxHp(3), 7800000); assert.equal(colossusMaxHp(0), 3000000);
});
test('its blows pierce 75% of defence, cracked armour and scorching halve what is left, and never deal less than 1', () => {
  assert.equal(colossusDamage(3200, 1, 0), 3200);
  assert.equal(colossusDamage(3200, 1, 240), 1600, 'a quarter of 240 defence counts');
  assert.ok(colossusDamage(3200, 1, 240) > Math.round(3200 * 60 / (240 + 60)), 'more than an ordinary blow through full defence');
  assert.equal(colossusDamage(3200, 1, 240, .5), Math.round(3200 * 60 / 90));
  assert.equal(colossusDamage(3200, .6, 240), 960);
  assert.equal(colossusDamage(1e-6, 1, 1e9), 1);
  for (const def of [0, 35, 400]) assert.ok(Math.abs(throughDefence(1234, def) * 60 / (def + 60) - 1234) < 1e-9, 'the hurt rule turns it back into the same damage');
});
test('the head weak point: ×2.5 within 10 m of the lowered head (bite, breath, spit or kneeling), else ×1', () => {
  const marks = colossusTelegraphs('bite', source, { x: 64, z: 0 });
  const bite = beginColossusAttack('bite', source, marks);
  assert.equal(headLowered(bite, false), false, 'not yet at the start of the wind-up');
  bite.age = bite.windup * .8; assert.equal(headLowered(bite, false), true);
  const head = headPoint(source, bite, false);
  assert.equal(headMultiplier({ x: head.x + 3, z: head.z }, source, bite, false), S.headMultiplier);
  assert.equal(headMultiplier({ x: head.x + 30, z: head.z }, source, bite, false), 1);
  const stomp = beginColossusAttack('stomp', source, colossusTelegraphs('stomp', source, { x: 64, z: 0 })); stomp.age = 1;
  assert.equal(headMultiplier(head, source, stomp, false), 1, 'a stomp keeps the head high');
  const kneelHead = headPoint(source, null, true);
  assert.equal(headMultiplier(kneelHead, source, null, true), 2.5); assert.equal(headMultiplier(kneelHead, source, null, false), 1);
});
test('below 25% health it kneels; below 50% and 30% it attacks faster, enraged wind-ups are shorter', () => {
  assert.equal(colossusCadence(.26).kneeling, false); assert.equal(colossusCadence(.249).kneeling, true);
  assert.equal(colossusCadence(.9).cooldown, S.cooldown); assert.ok(Math.abs(colossusCadence(.4).cooldown - S.cooldown * .7) < 1e-9);
  const enraged = colossusCadence(.29); assert.equal(enraged.enraged, true); assert.ok(Math.abs(enraged.cooldown - S.cooldown * .7 * .6) < 1e-9); assert.equal(enraged.windupScale, .8);
  assert.equal(beginColossusAttack('roar', source, [], .8).windup, COLOSSUS_WINDUPS.roar * .8);
});
test('it casts its skills round-robin, every skill has a telegraph colour and a callout', () => {
  assert.deepEqual(Array.from({ length: 12 }, (_, i) => colossusSkill(i)), [...COLOSSUS_ORDER, 'stomp', 'bite']);
  for (const skill of new Set(COLOSSUS_ORDER)) { assert.ok(COLOSSUS_CALLOUTS[skill]); assert.ok(COLOSSUS_VI[COLOSSUS_CALLOUTS[skill]], skill); }
});
test('the roar stuns everyone within 62 m for 2 s unless they stand by one of its feet', () => {
  const [left, right] = colossusFeet(source);
  assert.ok(Math.abs(Math.hypot(left.x - source.x, left.z - source.z) - S.footOffset) < 1e-9);
  const roar = beginColossusAttack('roar', source, colossusTelegraphs('roar', source, { x: 60, z: 0 }));
  const { hits } = run(roar, [{ id: 'safe', x: right.x + 2, z: right.z }, { id: 'open', x: 50, z: 10 }, { id: 'far', x: 0, z: -80 }], 3);
  assert.deepEqual(hits.map(h => [h.id, h.effect]), [['safe', undefined], ['open', 'stun']]);
  assert.ok(hits.every(h => h.multiplier === .6));
});
test('a stomp lands on the foot nearer the target, cracks those it crushes, shakes the ring and leaves burning lava', () => {
  const marks = colossusTelegraphs('stomp', source, { x: 78, z: 14 });
  const feet = colossusFeet(source), near = Math.hypot(feet[0].x - 78, feet[0].z - 14) < Math.hypot(feet[1].x - 78, feet[1].z - 14) ? 0 : 1;
  assert.equal(marks[0].k, near, 'the foot on the target side'); assert.ok(Math.hypot(marks[0].x - 78, marks[0].z - 14) < 1e-6, 'within its step');
  const stomp = beginColossusAttack('stomp', source, marks);
  const { hits } = run(stomp, [{ id: 'under', x: 78, z: 14 }, { id: 'ring', x: 78, z: 24 }, { id: 'out', x: 78, z: 34 }], stomp.windup + 2);
  assert.deepEqual(hits.filter(h => h.multiplier > 1).map(h => [h.id, h.multiplier, h.effect]), [['under', 2, 'crack']]);
  assert.deepEqual(hits.filter(h => h.multiplier === .6).map(h => h.id), ['ring']);
  const lava = hits.filter(h => h.multiplier === .12 && h.id === 'under').length; assert.ok(lava >= 3 && lava <= 5, `lava ticks every 0.5 s (${lava})`);
  const far = colossusTelegraphs('stomp', source, { x: 78, z: 40 })[0]; assert.ok(Math.abs(Math.hypot(far.x - feet[near].x, far.z - feet[near].z) - 9) < .02, 'a far target: the foot steps 9 m toward it');
  assert.ok(!hits.some(h => h.id === 'out'));
});
test('grab catches one explorer, breath scorches along its lane every 0.35 s, spit summons, meteors find every explorer', () => {
  const grab = beginColossusAttack('grab', source, colossusTelegraphs('grab', source, { x: 70, z: 0 }));
  const caught = run(grab, [{ id: 'a', x: 70, z: 0 }, { id: 'b', x: 71, z: 1 }], 2).hits;
  assert.deepEqual(caught.map(h => [h.id, h.effect]), [['a', 'grab']]);
  const breath = beginColossusAttack('breath', source, colossusTelegraphs('breath', source, { x: 58, z: 0 }));
  const burned = run(breath, [{ id: 'lane', x: 60, z: 0 }, { id: 'side', x: 60, z: 8 }], breath.windup + 3).hits;
  assert.ok(burned.every(h => h.id === 'lane' && h.effect === 'burn' && h.multiplier === .55)); assert.ok(burned.length >= 6 && burned.length <= 8, String(burned.length));
  const spit = beginColossusAttack('spit', source, colossusTelegraphs('spit', source, { x: 60, z: 0 }));
  assert.equal(run(spit, [], spit.windup + 1.2).summon, true);
  const players = [{ id: 'p1', x: 60, z: 5 }, { id: 'p2', x: 90, z: -20 }, { id: 'p3', x: -60, z: 0 }];
  const marks = colossusTelegraphs('meteor', source, players[0], players, () => .5);
  assert.equal(marks.length, 2 + 18, 'one per explorer within 70 m plus eighteen at random');
  const meteor = beginColossusAttack('meteor', source, marks);
  assert.deepEqual([...new Set(run(meteor, players, 6).hits.map(h => h.id))].sort(), ['p1', 'p2']);
  const sweep = beginColossusAttack('sweep', source, colossusTelegraphs('sweep', source, { x: 60, z: 0 }));
  const swept = run(sweep, [{ id: 's', x: 66, z: 0 }], sweep.windup + 2).hits; assert.equal(swept.length, 1, 'a sweep hits each explorer once'); assert.equal(swept[0].multiplier, 1.3);
});
test('attack snapshots from the server are bounded before they are drawn', () => {
  const a = beginColossusAttack('meteor', source, colossusTelegraphs('meteor', source, { x: 60, z: 0 }, [], () => .3));
  const clean = sanitizeColossusAttack(JSON.parse(JSON.stringify(a)))!; assert.equal(clean.skill, 'meteor'); assert.equal(clean.marks.length, a.marks.length);
  assert.equal(sanitizeColossusAttack({ ...a, skill: 'laser' }), null); assert.equal(sanitizeColossusAttack({ ...a, age: 1e9 }), null); assert.equal(sanitizeColossusAttack(null), null);
  assert.equal(sanitizeColossusAttack({ ...a, marks: [{ x: 1e9, z: 0, r: 2 }] })!.marks.length, 0);
});
test('helpers share the spoils: recent hitters and the killer, never AI neighbours; the final blow adds the companion', () => {
  const now = 1_000_000, hits = new Map([['me', now - 5000], ['old', now - 60000], ['bot:n1', now - 100]]);
  assert.deepEqual(colossusContributors(hits, 'bot:n1', now, 20, id => id.startsWith('bot:')), ['me']);
  assert.deepEqual(colossusContributors(hits, 'late', now, 20), ['me', 'bot:n1', 'late']);
  const s = M.newGame(), xp = s.xp, level = s.level, rolls = [0, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5];
  const loot = grantColossusReward(s, true, () => rolls.shift() ?? .5);
  assert.equal(loot.pet, 'pet_colossus'); assert.equal(s.bag.pet_colossus, 1);
  assert.ok(loot.some(i => i.id === 'hat_colossus'), 'a roll under 15% wins the horn crown');
  const shard = loot.find(i => i.id === 'colossus_shard')!; assert.ok(shard.count >= 4 && shard.count <= 8);
  assert.ok(s.level > level || s.xp > xp, 'the Colossus pays its EXP');
  const helper = M.newGame(), plain = grantColossusReward(helper, false, () => .99);
  assert.equal(plain.pet, undefined); assert.ok(!plain.some(i => i.id === 'hat_colossus')); assert.equal(helper.bag.pet_colossus, undefined);
});
test('trophies, loot and Vietnamese names are registered, with Blender icons and the colossus model on disk', () => {
  for (const [id, item] of Object.entries(COLOSSUS_ITEMS)) {
    assert.equal(ITEMS[id], item); assert.ok(VI_CATALOG[item.name], id); assert.ok(VI_CATALOG[item.desc], id + ' desc');
    assert.ok(existsSync(new URL(`../public/assets/icons/items/${id}.webp`, import.meta.url)), id + ' icon');
  }
  assert.equal(ITEMS.hat_colossus.slot, 'hat'); assert.equal(ITEMS.pet_colossus.slot, 'pet'); assert.equal(ITEMS.hat_colossus.lavaproof, true);
  assert.deepEqual(LOOT_TABLES.colossus[0], ['hat_colossus', .15, 1, 1]);
  for (const [id] of LOOT_TABLES.colossus) assert.ok(ITEMS[id], id);
  const glb = readFileSync(new URL('../public/assets/models/colossus.glb', import.meta.url)); assert.ok(glb.length > 10000 && glb.length < 1_500_000);
});
test('AI neighbours gather on a ring just outside the Colossus body', () => {
  const r = { id: 'home:colossus', x: 78, z: 0, r: 9 };
  for (let i = 0; i < 5; i++) { const p = rallySpot(r, i), d = Math.hypot(p.x - 78, p.z); assert.ok(d >= 12 - 1e-9 && d <= 15 + 1e-9, String(d)); }
});
