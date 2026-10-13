// The wind of a disguise's moves (src/skill-wind.ts): every one of the 85 moves has a class, a wind is never drawn past
// what its move hits, the shapes are bounded and free while idle, the blade a bare disguise shows is a model the weapon
// kit has, and nothing of it is read by the fight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DISGUISE_KITS, DZ } from '../src/combat.ts';
import { DISGUISES, ITEMS } from '../src/content.ts';
import { AIR_CAST } from '../src/air-cast.ts';
import { SKILL_WIND, WIND_CLASSES, HAND_BLADE, GUSTS, GUST_SECTIONS, BURST, AHEAD, THRUST, TURN, SkillGusts, buildGusts, streakSpan, sweepTurn, basicWind, windClass, windRule, handBlade, type WindClass, type WindRule } from '../src/skill-wind.ts';
import { TRAIL, SWING, SPIN, CUTS, maxSections } from '../src/trail-ribbon.ts';
import { WIND, WIND_SECTIONS, PUNCH } from '../src/punch-wind.ts';
import { WeaponTrail, trailMaterial } from '../src/weapon-trail.ts';

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const moves = Object.keys(DISGUISES).flatMap(id => [0, 1, 2, 3, 4].map(slot => ({ id, slot, effect: slot ? DISGUISE_KITS[id]?.[slot - 1] : undefined })));
const buffers = (sections = GUST_SECTIONS + 4) => ({ position: new Float32Array(sections * 6), trail: new Float32Array(sections * 4), tint: new Float32Array(sections * 8) });

test('every one of the 85 moves has a wind class: 17 disguises x (the basic attack + 4 skills), no skill without a row and no row without a skill', () => {
  assert.equal(Object.keys(DISGUISES).length, 17); assert.equal(moves.length, 85);
  for (const { id, slot, effect } of moves) {
    const cls = windClass(id, slot, DISGUISES[id].weapon.kind);
    assert.ok(cls && WIND_CLASSES.includes(cls), `${id} ${slot ? `skill ${slot} (${effect})` : 'basic attack'} has no wind class: add it to skill-wind.ts SKILL_WIND (a spell or a shot is 'none')`);
  }
  const used = new Set(moves.filter(m => m.slot).map(m => m.effect!)); assert.equal(used.size, 68);
  assert.deepEqual(Object.keys(SKILL_WIND).filter(effect => !used.has(effect)), [], 'a row for a skill no disguise has');
  assert.deepEqual(Object.keys(SKILL_WIND).sort(), Object.keys(AIR_CAST).sort(), 'the same skills as the air classes');
  // A skill added to a kit without a row is caught: the lookup has no answer for it.
  assert.equal(windRule('a-skill-nobody-wrote'), undefined); assert.equal(windClass('dz_knight', 9), undefined); assert.equal(windClass('nobody', 1), undefined);
  assert.equal(basicWind('sword'), 'swing'); assert.equal(basicWind('fist'), 'thrust'); assert.equal(basicWind('gun'), 'none'); assert.equal(basicWind('rod'), 'none');
});

test('the audit: which moves swing, thrust, sweep, spin, slam or dash, and which are spells, shots, summons and buffs', () => {
  const table: Record<string, WindClass[]> = {};
  for (const { id, slot } of moves) (table[id] ??= []).push(windClass(id, slot, DISGUISES[id].weapon.kind)!);
  assert.deepEqual(table, {
    dz_superhero: ['thrust', 'none', 'slam', 'none', 'none'], dz_ninja: ['swing', 'none', 'none', 'thrust', 'none'], dz_mage: ['none', 'none', 'none', 'none', 'none'],
    dz_knight: ['swing', 'none', 'dash', 'none', 'slam'], dz_mecha: ['none', 'none', 'none', 'none', 'none'], dz_dino: ['swing', 'thrust', 'sweep', 'none', 'none'],
    dz_fairy: ['none', 'none', 'none', 'none', 'none'], dz_army: ['none', 'none', 'none', 'none', 'none'], dz_navy: ['swing', 'spin', 'dash', 'none', 'none'],
    dz_aodai: ['none', 'none', 'dash', 'sweep', 'none'], dz_aodai_man: ['swing', 'swing', 'none', 'spin', 'none'], dz_usa: ['none', 'dash', 'none', 'none', 'none'],
    dz_vietnam: ['none', 'none', 'dash', 'slam', 'none'], dz_pirate: ['none', 'none', 'thrust', 'none', 'none'], dz_vampire: ['swing', 'none', 'none', 'none', 'none'],
    dz_snowman: ['none', 'none', 'none', 'none', 'none'], dz_dawnstar: ['none', 'sweep', 'none', 'dash', 'none'],
  });
  const windy = moves.filter(m => windClass(m.id, m.slot, DISGUISES[m.id].weapon.kind) !== 'none');
  assert.equal(windy.length, 25, '7 basic attacks and 18 skills'); assert.equal(windy.filter(m => m.slot).length, 18);
});

test('the size rule: no wind is drawn past what its move hits (within 15%), and each lines up with its skill\'s own numbers', () => {
  for (const [effect, rule] of Object.entries(SKILL_WIND)) {
    if (rule.cls === 'none') { assert.ok(['spell', 'shot', 'summon', 'buff', 'shout', 'form'].includes(rule.why), effect); continue; }
    assert.match(rule.color, /^#[0-9a-f]{6}$/, effect); assert.ok(rule.hit > 0 && rule.reach > 0 && rule.at >= 0, effect);
    assert.ok(rule.reach <= rule.hit * 1.15 + 1e-9, `${effect}: drawn to ${rule.reach} m, hits ${rule.hit} m`);
    assert.ok(rule.arm === 'blade' || rule.arm === 'fists', effect);
    if (rule.cls === 'dash') { assert.ok(rule.time > 0 && rule.tail > 0 && rule.tail < rule.reach && rule.width <= .4, effect); assert.equal(!!rule.end, rule.endHit !== undefined, effect); }
    if (rule.cls === 'slam') { assert.ok(rule.beats.length >= 1 && rule.beats.every((b, i) => b >= 0 && (!i || b > rule.beats[i - 1])), effect); assert.equal(rule.fall === 'far', !!rule.far, effect); }
    if (rule.cls === 'sweep' || rule.cls === 'spin') assert.ok(rule.span > 0 && rule.span <= Math.PI * 2 + 1e-9 && rule.turn > 0 && rule.width > 0 && rule.width <= 1.3 && rule.height >= 0, effect);
    if (rule.cls === 'thrust') assert.ok(rule.travel > 0 && rule.width > 0 && rule.width <= .4, effect);
  }
  const R = SKILL_WIND as Record<string, WindRule & { hit: number; reach: number; at: number }>;
  // The radius, the reach and the moment of each are the skill's own (combat.ts DZ, the effect's cast in CombatSimulation).
  assert.equal(R.dive.hit, DZ.dive.radius); assert.equal(R.dive.at, DZ.dive.delay);
  assert.equal(R.knightcharge.hit, DZ.knightcharge.speed * DZ.knightcharge.time); assert.equal(R.holy.hit, DZ.holy.radius); assert.equal(R.holy.at, DZ.holy.delay);
  assert.equal(R.tail.hit, DZ.tail.radius); assert.equal(R.devour.hit, DZ.devour.reach); assert.equal(R.hook.hit, DZ.hook.range); assert.equal(R.anchor.hit, 4.4); assert.equal(R.anchor.at, .15);
  assert.equal(R.surfride.hit, DZ.surfride.speed * DZ.surfride.time); assert.equal(R.ribbon.hit, DZ.ribbon.speed * DZ.ribbon.time); assert.equal(R.fan.hit, DZ.fan.radius);
  assert.equal(R.ink.hit, DZ.ink.radius); assert.equal(R.eagle.hit, 9); assert.equal(R.bamboo.hit, DZ.bamboo.speed * DZ.bamboo.time); assert.equal(R.drum.hit, DZ.drum.radius);
  const fan = SKILL_WIND.fan as WindRule & { span: number }; assert.ok(fan.span <= 2 * Math.acos(DZ.fan.cone), 'the fan\'s gust stays inside the cone it hits');
  const drum = SKILL_WIND.drum as WindRule & { beats: number[] }; assert.deepEqual(drum.beats.map(b => +b.toFixed(2)), [0, .35, .7], 'one pound for each beat of the drum');
  const dashes = Object.entries(SKILL_WIND).filter(([, r]) => r.cls === 'dash').map(([e]) => e).sort(); assert.deepEqual(dashes, ['bamboo', 'eagle', 'knightcharge', 'ribbon', 'sparklestep', 'surfride']);
  assert.equal(R.lasso.hit, DZ.lasso.radius); assert.equal(R.sparklestep.hit, DZ.sparklestep.speed * DZ.sparklestep.time);
  const lasso = SKILL_WIND.lasso as WindRule & { span: number }; assert.ok(lasso.span <= 2 * Math.acos(DZ.lasso.cone), 'the ribbon stays inside the cone it catches');
  // A burst thrown by a stab or a bite: the punch's own wind, never further from the explorer than the rule says.
  for (const [effect, rule] of Object.entries(SKILL_WIND)) if (rule.cls === 'thrust' && rule.burst) assert.ok(AHEAD + BURST * rule.burst <= rule.reach + 1e-9, effect);
});

test('gameplay numbers are untouched: the skill tables, the swing and the punch are what they were', () => {
  assert.deepEqual(DZ.dive, { ahead: 4, radius: 5, power: 2, flying: 4, lift: 2.2, delay: .18, guard: .5 }); assert.deepEqual(DZ.backstab, { range: 12, power: 3.2 });
  assert.deepEqual(DZ.knightcharge, { speed: 22, time: .5, grab: 2, radius: 3, power: 2.5, knock: 4, lift: 1.5 }); assert.deepEqual(DZ.holy, { range: 14, fallback: 6, delay: .6, radius: 3.5, power: 4.5, lift: 1.25 });
  assert.deepEqual(DZ.devour, { reach: 3.2, below: .4, heal: .25, power: 3 }); assert.deepEqual(DZ.tail, { radius: 3.6, power: 1.8, knock: 6 }); assert.deepEqual(DZ.hook, { range: 14, power: 1.2, slow: 2, gap: 1.5 });
  assert.deepEqual(DZ.surfride, { speed: 26, time: .35, power: 1.4 }); assert.deepEqual(DZ.ribbon, { speed: 24, time: .35, boost: .3, boostTime: 3 }); assert.deepEqual(DZ.fan, { radius: 7, cone: .64, power: 1.2, knock: 5, slow: 3 });
  assert.deepEqual(DZ.ink, { radius: 5, stun: 3, power: .8 }); assert.deepEqual(DZ.bamboo, { speed: 16, time: .5, radius: 3, power: 1.4, knock: 2 }); assert.deepEqual(DZ.drum, { beats: 3, gap: .35, radius: 7, power: .6, knock: 2.5, stun: 1.5 });
  assert.equal(SWING.time, .25); assert.equal(SWING.contact, .07); assert.equal(PUNCH.contact, .07); assert.equal(TRAIL.life, .16); assert.equal(WIND.life, .28); assert.equal(SPIN.hold, 1.45); assert.equal(CUTS.length, 3);
  // The fight cannot read the wind: the rules do not import it, and it changes no file of theirs.
  for (const file of ['src/combat.ts', 'src/moves.ts', 'src/jump-rules.ts', 'src/air-cast.ts', 'src/model.ts']) assert.ok(!read(file).includes('skill-wind'), file);
  assert.ok(!/from 'three'/.test(read('src/skill-wind.ts')), 'skill-wind.ts has no three.js in it');
});

test('a streak: narrow tail, pointed head, inside its length, faces the camera, and nothing when idle', () => {
  const g = new SkillGusts(), b = buffers();
  assert.equal(buildGusts(g, 1, b.position, b.trail, b.tint, 7), 7, 'nothing in flight: the section count is unchanged');
  const slot = g.streak(1, 2, 3, 0, 0, 5, 10, { length: 4, width: .3, travel: .1, fade: .2 }, .2, .4, .8); assert.ok(slot >= 0); assert.equal(g.count, 1);
  let most = 0;
  for (let age = .004; age < .3; age += .004) {
    const n = buildGusts(g, 10 + age, b.position, b.trail, b.tint, 0, true, 1, 30, 26); most = Math.max(most, n);
    for (let i = 0; i < n * 6; i += 3) {
      const x = b.position[i], y = b.position[i + 1], z = b.position[i + 2]; assert.ok(Number.isFinite(x + y + z));
      assert.ok(z >= 3 - 1e-4 && z <= 7 + 1e-4, `along the streak: ${z}`); assert.ok(Math.hypot(x - 1, y - 2) <= .3 * 1.9 + .06, `beside it: ${Math.hypot(x - 1, y - 2)}`);
    }
    for (let i = 0; i < n * 4; i += 2) assert.ok(b.trail[i + 1] >= 0 && b.trail[i + 1] <= 1);
  }
  assert.ok(most >= GUSTS.streak && most <= GUSTS.streak + GUSTS.lines * (GUSTS.line + 2));
  // At full reach: the head is a point on the end of its length, the widest part behind it, and the strip is square to the line of sight.
  const n = buildGusts(g, 10.1, b.position, b.trail, b.tint, 0, false, 1, 30, 26); assert.equal(n, GUSTS.streak, 'no speed lines on Battery saver');
  const half = (i: number) => Math.hypot(b.position[i * 6] - b.position[i * 6 + 3], b.position[i * 6 + 1] - b.position[i * 6 + 4], b.position[i * 6 + 2] - b.position[i * 6 + 5]) / 2;
  assert.ok(half(n - 1) < 1e-6 && Math.abs(b.position[(n - 1) * 6 + 2] - 7) < 1e-4); assert.ok(half(0) < half(6) && half(6) > .25 && half(6) <= .3 + 1e-6);
  const sx = b.position[6 * 6 + 3] - b.position[6 * 6], sy = b.position[6 * 6 + 4] - b.position[6 * 6 + 1], sz = b.position[6 * 6 + 5] - b.position[6 * 6 + 2];
  assert.ok(Math.abs(sz) < 1e-6, 'square to the streak'); assert.ok(Math.abs(sx * 0 + sy * 28 + sz * 23) < 1e-3 * 40, 'square to the line of sight');
  for (let i = 0; i < n * 8; i += 4) { assert.ok(Math.abs(b.tint[i] - .2) < 1e-6 && Math.abs(b.tint[i + 2] - .8) < 1e-6); assert.equal(b.tint[i + 3], 1, 'the wind\'s look'); }
  // Its time is up: pruned, and nothing more is written.
  g.prune(10.31); assert.equal(g.count, 0); assert.equal(buildGusts(g, 10.31, b.position, b.trail, b.tint, 3), 3);
  // Numbers that are no streak give no streak, and no NaN reaches the buffers.
  assert.equal(g.streak(0, 0, 0, 0, 0, 0, 1, { length: 2, width: .2, travel: .1 }), -1); assert.equal(g.streak(NaN, 0, 0, 1, 0, 0, 1, { length: 2, width: .2, travel: .1 }), -1);
  assert.equal(g.streak(0, 0, 0, 1, 0, 0, 1, { length: 0, width: .2, travel: .1 }), -1); assert.equal(g.count, 0);
});

test('a streak held on a dashing body ends where the body is, shows only its tail length, and closes when it is let go', () => {
  assert.deepEqual(streakSpan(0, 9, .35, .57, 3.2, true, 0), [0, 0]);
  const [head, tail] = streakSpan(.2, 9, .35, .57, 3.2, true, 5); assert.equal(head, 5); assert.ok(Math.abs(tail - 1.8) < 1e-9, 'three metres of it behind the body');
  assert.equal(streakSpan(.2, 9, .35, .57, 3.2, true, 50)[0], 9, 'never past its length');
  const [h2, t2] = streakSpan(.5, 9, .35, .57, 3.2, true, 9, .36); assert.ok(t2 > 9 - 3.2 && t2 < h2, 'let go: the tail closes on the head'); assert.deepEqual(streakSpan(.6, 9, .35, .57, 3.2, true, 9, .36), [9, 9]);
  for (let age = 0; age < .4; age += .01) { const [h, t] = streakSpan(age, 2.3, .08, .28); assert.ok(h >= t && h <= 2.3 + 1e-9 && t >= 0); }
  assert.ok(streakSpan(.02, 2.3, .08, .28)[0] > 2.3 * .4, 'a thrust is out fast');
  const g = new SkillGusts(), b = buffers(), slot = g.streak(0, 1, 0, 1, 0, 0, 5, { length: 9, width: .34, travel: .35, tail: 3.2, even: true, fade: .22 });
  g.head(slot, 0); assert.equal(buildGusts(g, 5.01, b.position, b.trail, b.tint), 0, 'nothing before the body has moved');
  g.head(slot, 6); const n = buildGusts(g, 5.2, b.position, b.trail, b.tint); assert.ok(n >= GUSTS.streak);
  let low = Infinity, high = -Infinity; for (let i = 0; i < GUSTS.streak * 6; i += 3) { low = Math.min(low, b.position[i]); high = Math.max(high, b.position[i]); }
  assert.ok(Math.abs(high - 6) < 1e-4 && Math.abs(low - 2.8) < 1e-4, `from ${low} to ${high}`);
  g.release(slot, 5.36); assert.ok(g.live(slot, 5.5)); g.prune(5.6); assert.equal(g.count, 0, 'gone a fifth of a second after the dash ends'); assert.equal(g.live(slot, 5.6), false);
  g.head(slot, 3); g.head(-1, 3); g.head(99, 3); g.release(99, 1); // a slot that is not a streak in flight: nothing happens
});

test('a swept arc: a ribbon at its radius, the newest at the head, bright edge outside, a full ring over its turn, and gone after', () => {
  const g = new SkillGusts(), b = buffers(), R = 3.96, W = .6, turn = .7 / 1.5, keep = .22;
  assert.ok(g.arc(10, 1.1, -5, .4, Math.PI * 2, 20, { radius: R, width: W, turn, keep }, .3, .6, 1) >= 0);
  const seen = new Set<number>();
  for (let age = .005; age < turn + keep; age += .005) {
    const n = buildGusts(g, 20 + age, b.position, b.trail, b.tint); assert.ok(n >= 3 && n <= GUSTS.arc, `${n} sections`);
    for (let s = 0; s < n; s++) {
      const ix = b.position[s * 6] - 10, iz = b.position[s * 6 + 2] + 5, ox = b.position[s * 6 + 3] - 10, oz = b.position[s * 6 + 5] + 5, inner = Math.hypot(ix, iz), outer = Math.hypot(ox, oz);
      assert.ok(Number.isFinite(inner + outer)); assert.ok(Math.abs(outer - R) < 1e-3, 'the bright edge runs at the radius'); assert.ok(inner <= outer + 1e-6 && inner >= R - W - 1e-3, 'the ribbon lies inside it, never wider than its width');
      assert.equal(b.position[s * 6 + 1], Math.fround(1.1)); assert.equal(b.tint[s * 8 + 3], 0, 'the blade\'s look'); assert.equal(b.trail[s * 4], 0); assert.equal(b.trail[s * 4 + 2], 1);
      if (b.trail[s * 4 + 1] < .98) seen.add(Math.round(((Math.atan2(ox, oz) - .4) / (Math.PI * 2) % 1 + 1) % 1 * 24) % 24);
    }
    if (age < turn) {
      // The newest section is where the head of the sweep is: the angle the swung thing is at (the anchor's own turn).
      const s = n - 1, at = Math.atan2(b.position[s * 6 + 3] - 10, b.position[s * 6 + 5] + 5), want = .4 + Math.PI * 2 * age / turn;
      assert.ok(Math.abs(Math.atan2(Math.sin(at - want), Math.cos(at - want))) < 1e-3); assert.ok(b.trail[s * 4 + 1] <= b.trail[1] + 1e-6, 'older behind the head');
    }
  }
  assert.equal(seen.size, 24, 'the ribbon goes all the way round');
  g.prune(20 + turn + keep + .001); assert.equal(g.count, 0); assert.equal(buildGusts(g, 21, b.position, b.trail, b.tint, 2), 2);
  assert.equal(g.arc(0, 0, 0, 0, 0, 1, { radius: 3, width: .5, turn: .3, keep: .2 }), -1, 'no span, no arc'); assert.equal(g.arc(0, 0, 0, 0, 6, 1, { radius: 0, width: .5, turn: .3, keep: .2 }), -1);
});

test('a fan\'s gust: the whole arc at once inside its cone, pushed out to its reach and never past it', () => {
  const rule = SKILL_WIND.fan; assert.ok(rule.cls === 'sweep' && rule.wave !== undefined);
  const g = new SkillGusts(), b = buffers(), f = 1.1; g.arc(0, 1, 0, f - rule.span / 2, rule.span, 3, { radius: rule.reach, width: rule.width, turn: rule.turn, keep: rule.keep, wave: rule.wave });
  let last = 0;
  for (let age = .01; age < rule.keep; age += .01) {
    const n = buildGusts(g, 3 + age, b.position, b.trail, b.tint); assert.equal(n, 15); let out = 0;
    for (let s = 0; s < n; s++) {
      const x = b.position[s * 6 + 3], z = b.position[s * 6 + 5], r = Math.hypot(x, z), a = Math.atan2(x, z); out = Math.max(out, r);
      assert.ok(r <= rule.reach + 1e-3 && r <= DZ.fan.radius); assert.ok(Math.abs(Math.atan2(Math.sin(a - f), Math.cos(a - f))) <= Math.acos(DZ.fan.cone) + 1e-6, 'inside the cone the fan hits');
      assert.ok(Math.hypot(b.position[s * 6], b.position[s * 6 + 2]) <= r + 1e-6);
    }
    assert.ok(out >= last - 1e-6, 'it only goes outwards'); last = out;
    assert.ok(b.trail[1] > b.trail[7 * 4 + 1], 'closed at its ends, full in the middle');
  }
  assert.ok(Math.abs(last - rule.reach) < 1e-3);
});

test('the slots never grow and never overrun the buffers', () => {
  const g = new SkillGusts(), b = buffers(GUST_SECTIONS);
  for (let i = 0; i < 12; i++) i % 2 ? g.arc(i, 0, 0, 0, 6.28, 1 + i * .001, { radius: 4, width: .6, turn: .4, keep: .3 }) : g.streak(i, 1, 0, 1, 0, 0, 1 + i * .001, { length: 9, width: .3, travel: .3 });
  assert.equal(g.data.length, GUSTS.max * 20); g.prune(1.1); assert.equal(g.count, GUSTS.max, 'the oldest give way');
  const n = buildGusts(g, 1.25, b.position, b.trail, b.tint); assert.ok(n > 0 && n <= GUST_SECTIONS, `${n} of ${GUST_SECTIONS}`);
  const tight = buffers(12); assert.ok(buildGusts(g, 1.25, tight.position, tight.trail, tight.tint) <= 12, 'a full buffer stops the writing');
  for (const v of b.position.subarray(0, n * 6)) assert.ok(Number.isFinite(v));
  g.clear(); assert.equal(g.count, 0);
});

test('the wind is drawn in the weapon trail\'s own mesh: no new mesh, material or draw call, and hidden when it is over', () => {
  const trail = new WeaponTrail(), mesh = trail.mesh; assert.equal(trail.active, false); assert.equal(mesh.visible, false);
  assert.equal(mesh.geometry.getAttribute('position').count, (maxSections() + WIND_SECTIONS + GUST_SECTIONS + 10) * 2);
  trail.gusts.arc(0, 1, 0, 0, Math.PI * 2, 5, { radius: 4, width: .6, turn: .4, keep: .2 }, 1, .5, .2); assert.equal(trail.active, true);
  assert.equal(trail.draw(5.2, 1, 1, 1, 1, { x: 0, y: 30, z: 26 }), true); assert.equal(mesh.visible, true); assert.ok(trail.sections >= 3); assert.equal(trail.mesh, mesh); assert.equal(mesh.material, trailMaterial());
  assert.equal(mesh.geometry.drawRange.count, (trail.sections - 1) * 6);
  // With a blade's ribbon and a punch's wind in the same buffers, each keeps its own colour and look.
  trail.samples.push(0, 1, 0, 0, 1, 1, 5.18); trail.samples.push(.5, 1, 0, .5, 1, 1, 5.2); trail.wind.add(0, 1, 0, 1, 0, 0, 5.19);
  assert.equal(trail.draw(5.2, 1, .9, .1, .1), true); const tint = mesh.geometry.getAttribute('tint').array as Float32Array;
  assert.ok(Math.abs(tint[0] - .9) < 1e-6 && tint[3] === 0); assert.ok(Math.abs(tint[(trail.sections - 1) * 8] - 1) < 1e-6 && Math.abs(tint[(trail.sections - 1) * 8 + 2] - .2) < 1e-6);
  assert.equal(trail.draw(6, 1, 1, 1, 1), false); assert.equal(mesh.visible, false); assert.equal(trail.active, false); assert.equal(mesh.geometry.drawRange.count, 0);
  trail.gusts.streak(0, 1, 0, 1, 0, 0, 7, { length: 3, width: .2, travel: .1 }); trail.clear(); assert.equal(trail.active, false);
});

test('the body turns once round with a spin or a tail sweep and comes back to its facing', () => {
  const span = Math.PI * 2, turn = .4;
  assert.ok(Math.abs(sweepTurn(0, span, turn, SPIN.hold) + SPIN.hold) < 1e-9, 'the arm held out to the side points along the facing at the start');
  for (const hold of [SPIN.hold, Math.PI]) {
    for (let age = 0; age < turn; age += .01) assert.ok(Math.abs(sweepTurn(age, span, turn, hold) + hold - span * age / turn) < 1e-9, 'the limb is where the ribbon\'s head is');
    assert.ok(Math.abs(sweepTurn(turn + TURN.settle, span, turn, hold)) < 1e-9, 'back on its facing'); assert.equal(Math.abs(sweepTurn(turn + 5, span, turn, hold)), 0);
    const end = sweepTurn(turn - 1e-6, span, turn, hold), next = sweepTurn(turn + 1e-6, span, turn, hold); assert.ok(Math.abs(Math.atan2(Math.sin(end - next), Math.cos(end - next))) < 1e-3, 'no jump where the turn ends');
    for (let age = turn; age < turn + TURN.settle; age += .01) assert.ok(Math.abs(sweepTurn(age, span, turn, hold)) <= Math.PI + 1e-9);
  }
  assert.ok(THRUST.time > 0 && THRUST.time <= .35 && THRUST.step <= .6 && THRUST.lungeStep <= AHEAD, 'a stab is over in a third of a second and steps no further than the wind allows for');
});

test('a bare disguise shows a blade only when the weapon kit has a fitting model, and never over a weapon that is equipped', () => {
  const glb = readFileSync(new URL('../public/assets/models/gear-weapons.glb', import.meta.url)), json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const models = new Set<string>(json.scenes[0].nodes.map((i: number) => json.nodes[i].name));
  assert.deepEqual(Object.keys(HAND_BLADE).sort(), ['dz_knight', 'dz_navy', 'dz_ninja', 'dz_vampire']);
  for (const [disguise, weapon] of Object.entries(HAND_BLADE)) {
    assert.ok(DISGUISES[disguise], disguise); assert.equal(DISGUISES[disguise].weapon.kind, 'sword', `${disguise} fights with a blade of its own`);
    assert.equal(ITEMS[weapon]?.slot, 'weapon', `${weapon} is a weapon`); assert.equal(ITEMS[weapon]?.weapon?.kind, 'sword'); assert.ok(models.has(weapon), `${weapon} has a model in gear-weapons.glb`);
    assert.equal(handBlade(disguise, undefined), weapon); assert.equal(handBlade(disguise, 'sword_wood'), undefined, 'a weapon in the hand comes first'); assert.equal(handBlade(disguise, 'rod'), undefined);
  }
  assert.equal(handBlade(undefined, undefined), undefined); assert.equal(handBlade('dz_dino', undefined), undefined); assert.equal(handBlade('dz_pirate', undefined), undefined);
  // It is looks only: the weapon a disguise fights with is still its own.
  assert.ok(/handBlade\(gear\.disguise,gear\.weapon\)/.test(read('src/world.ts')));
});

test('wiring: a cast disguise skill starts its wind from one place, the same with the air switch on or off, and never for anyone else', () => {
  const main = read('src/main.ts'), world = read('src/world.ts');
  assert.equal(main.match(/world\.skillWind\(/g)?.length, 1, 'one call');
  const cast = main.slice(main.indexOf('function castDisguise('), main.indexOf('function airDisguise('));
  assert.ok(/cast=combat\.disguise\(disguise,index,air\)/.test(cast) && /if\(!cast\)return false;/.test(cast) && cast.indexOf('if(!cast)return false;') < cast.indexOf('world.skillWind('), 'only after the skill really was cast');
  assert.ok(!/airOn\(\)|actionHandler/.test(cast.slice(0, cast.indexOf('world.skillWind(') + 20)), 'no switch decides it: the ground cast and the air cast are one call');
  assert.ok(!/skillWind/.test(main.slice(main.indexOf('applyRemoteEffect'), main.indexOf('applyRemoteEffect') + 200)), 'not from what other players cast');
  assert.ok(/resetCombat\(\)\{world\.clearSkillWind\(\);/.test(main));
  // Idle: one comparison in the pose, and the trail's first line returns.
  assert.ok(/if\(this\.skillSteps\?\.length\|\|this\.dashWind\)this\.stepSkill\(\);/.test(world));
  assert.ok(/if\(!this\.trailEmit&&!contact&&!this\.bladeTrail\?\.active&&!this\.gustDue&&!this\.dashWind\)return;/.test(world));
  assert.ok(!/new WeaponTrail\(\)/.test(world.slice(world.indexOf('skillWind(effect'), world.indexOf('private stepSkill('))), 'a skill makes no mesh of its own');
});
