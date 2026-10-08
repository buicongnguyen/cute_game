// Skill readability: every cast shows an effect sized to its real hit area, statuses apply to living creatures only
// and show as marks, and the descriptions carry the numbers combat.ts uses. combat.ts is the one simulation both the
// browser and server/combat-authority.mjs run, so these checks hold online too.
import test from 'node:test';
import assert from 'node:assert/strict';
const { CombatSimulation, SPECIALS } = await import('../src/combat.ts');
const { SPECIAL_INFO, DISGUISE_INFO, skillDescription, skillTip, statusMarks, whirlRadius, slamRadius, BUFF_CHIPS } = await import('../src/skill-info.ts');
const { DISGUISES } = await import('../src/model.ts');
const { setLanguage, t } = await import('../src/i18n.ts');

function rig({ weapon = { kind: 'sword', range: 2.3, special: 'crescent' }, level = 0, enemies } = {}) {
  const effects = [], statuses = [], hits = [];
  const targets = enemies ?? [{ id: 'a', x: 0, z: 2, hp: 1e6, radius: .6 }, { id: 'b', x: 2, z: 0, hp: 1e6, radius: .6 }, { id: 'dead', x: 0, z: 1, hp: 0, radius: .6 }];
  const host = { position: () => ({ x: 0, z: 0 }), facing: () => 0, face() {}, targets: () => targets, weapon: () => weapon, stats: () => ({ attack: 10, critChance: 0 }),
    move() {}, hit: (t, h) => { hits.push({ id: t.id, ...h }); }, effect: e => effects.push(e), status: (t, k, d) => statuses.push({ id: t.id, k, d }), skillLevel: () => level, heal() {}, moveTarget() {} };
  return { sim: new CombatSimulation(host, () => .5), effects, statuses, hits, targets };
}
const run = (sim, seconds) => { for (let i = 0; i < seconds * 60; i++) sim.update(1 / 60); };

test('whirlwind and ground slam show a cast ring at the exact (levelled) hit radius', () => {
  for (const level of [0, 3, 5]) {
    const sword = rig({ level }); sword.sim.skill(0); run(sword.sim, .1);
    assert.equal(sword.effects.find(e => e.kind === 'cast').radius, whirlRadius('sword', level));
    assert.equal(sword.effects.find(e => e.kind === 'ring').radius, whirlRadius('sword', level));
    const slam = rig({ level }); slam.sim.skill(2);
    assert.equal(slam.effects[0].kind, 'cast'); assert.equal(slam.effects[0].radius, slamRadius(level));
    run(slam.sim, .5); assert.equal(slam.effects.find(e => e.kind === 'ring').radius, slamRadius(level));
  }
  assert.equal(whirlRadius('gun', 0), 2.8); assert.equal(slamRadius(5), 5.9);
});

test('area specials emit rings of the radius their description states', () => {
  for (const [id, info] of Object.entries(SPECIAL_INFO)) {
    if (!info.radius) continue;
    const r = rig(); r.sim.special(id); run(r.sim, 1.5);
    const sizes = new Set(r.effects.filter(e => e.kind === 'ring' || e.kind === 'arc').map(e => e.radius));
    assert.ok(sizes.has(info.radius), `${id}: ${[...sizes]} lacks ${info.radius}`);
    assert.match(skillDescription(3, { special: id }), new RegExp(String(info.radius).replace('.', '\\.') + ' m'), id);
  }
});

test('a swing arc is drawn as wide as the cone it hits; beams are as wide as their hit line', () => {
  const r = rig(); r.sim.special('crescent');
  const arc = r.effects.find(e => e.kind === 'arc'); assert.ok(Math.abs(arc.arc - 2 * Math.acos(-.05)) < 1e-9);
  const l = rig(); l.sim.special('laser'); const beam = l.effects.find(e => e.kind === 'beam'); assert.equal(beam.width, 1.4); assert.equal(beam.radius, 14);
  const th = rig(); th.sim.special('thunder'); run(th.sim, .5);
  assert.ok(th.effects.filter(e => e.kind === 'beam').length >= 2, 'thunder draws its chain');
});

test('statuses reach living creatures only; ice age freezes (3 s stun) instead of a sheep spell', () => {
  for (const [d, i] of [['dz_snowman', 1], ['dz_snowman', 2], ['dz_snowman', 3], ['dz_pirate', 2]]) {
    const r = rig(); r.sim.disguise(d, i); run(r.sim, 1);
    assert.ok(!r.statuses.some(s => s.id === 'dead'), `${d} ${i} touched a defeated creature`);
    assert.ok(!r.sim.marked.has('dead'));
  }
  const ice = rig(); ice.sim.disguise('dz_snowman', 3);
  assert.ok(!ice.statuses.some(s => s.k === 'sheep'));
  assert.ok(ice.statuses.filter(s => s.k === 'stun' && s.d === 3).length === 2, 'both living creatures frozen');
});

test("a pet's ice shot chills briefly instead of freezing for good", () => {
  const r = rig(); r.sim.host.pet = () => ({ x: 0, z: 0, dmg: .3, cd: 1.5, shot: 'ice' }); r.sim.update(1 / 60);
  assert.equal(r.sim.projectiles[0].stun, .5);
});

test('status marks show on the bar: stun first, at most two', () => {
  assert.equal(statusMarks({ stun: 1, statuses: { slow: 2, fear: 1 } }), '💫😱');
  assert.equal(statusMarks({ stun: .1, statuses: { sheep: 2 } }), '🐑');
  assert.equal(statusMarks({ statuses: {} }, true), '🎯');
  assert.equal(statusMarks({}), '');
});

test('every skill has a description with numbers, in English and Vietnamese', () => {
  for (const id of Object.keys(SPECIALS)) assert.ok(SPECIAL_INFO[id], id);
  for (const [id, d] of Object.entries(DISGUISES)) { assert.equal(DISGUISE_INFO[id]?.length, d.skills.length, id); }
  assert.equal(skillDescription(0, { weaponKind: 'sword', level: 2 }), 'Spin for 2.2 s: 10 hits of ×0.66 damage on every enemy within 3.64 m.');
  assert.equal(skillDescription(3, { special: 'bonk', level: 5 }), 'A giant hammer blow just ahead: ×3.08 damage within 3.6 m, stunned for 3 s.');
  assert.match(skillTip({ name: 'Dash', icon: '➶', cd: 4 }, 1, { level: 5 }), /^Dash · 3 s cooldown — Rush 7\.2 m/);
  setLanguage('vi');
  try {
    const texts = [...[0, 1, 2].map(i => skillDescription(i, {})), ...Object.keys(SPECIAL_INFO).map(s => skillDescription(3, { special: s })),
      ...Object.entries(DISGUISE_INFO).flatMap(([d, list]) => list.map((_, i) => skillDescription(i, { disguise: d }))), ...Object.values(BUFF_CHIPS).map(c => t(c.name))];
    for (const text of texts) assert.doesNotMatch(text, /\b(damage|enemies|enemy|within|seconds?)\b/, text);
  } finally { setLanguage('en'); }
});

test('the six uniform disguises run all four skills, each with a description', () => {
  for (const id of ['dz_army', 'dz_navy', 'dz_aodai', 'dz_aodai_man', 'dz_usa', 'dz_vietnam']) {
    for (let i = 0; i < 4; i++) {
      const r = rig(); assert.ok(r.sim.disguise(id, i), `${id} skill ${i}`); run(r.sim, 1.5);
      assert.ok(skillDescription(i, { disguise: id }).length > 10, `${id} ${i} has text`);
    }
  }
});
