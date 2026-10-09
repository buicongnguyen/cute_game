// Rescue Call phase 1, "Hold the Line" (rescue-content.ts, rescue-rules.ts, rescue-ai.ts, rescue-ladder.ts,
// rescue-claim.ts): waves and rising health, lanes with merges and forks, pads and the Spark economy, the squad's gear
// ladder and distinct disguises, mission-only borrowing, the fall-back rule and the end conditions, the orientation
// mapping, the validated claim with its daily caps, balance by whole simulated missions, and Vietnamese for every line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as M from '../src/model.ts';
import { ITEMS } from '../src/content.ts';
import { ENEMY_TYPES } from '../src/enemy-types.ts';
import { applyGameAction } from '../src/actions.ts';
import { RESCUE, MISSIONS, MISSION_IDS, FIELDS, DEFENCES, DEFENCE_KINDS, ROLES, LADDER_COST, LADDER_STEPS, BOOSTS, RESCUE_REWARD, RESCUE_VI, heroAtk, type MissionId, type SquadRole } from '../src/rescue-content.ts';
import { createRun, stepRun, startWave, placeDefence, upgradeDefence, sellDefence, buyStep, buyBoost, heroHit, hurtUnit, enemyNumbers, buildField, laneSlot, pointAt, nearestOnRoute, chooseOrientation, wideScreen, toWorld, toLocal, facingToWorld, fieldYaw, killSpark, squadRouted, ROUT_LEAKS, claimOf, hero, unit, ME, type RsRun, type SquadSpec } from '../src/rescue-rules.ts';
import { simulate, autoPlan, anchorOf } from '../src/rescue-ai.ts';
import { weaponsFor, outfitsFor, disguisesFor, gearScore, ladderFor, assignDisguises, memberStats, spreadRoles, HELPER_ROLES, weaponRole } from '../src/rescue-ladder.ts';
import { claimRescue, fullWinsLeft, wavesLeft, rescueDay, wavePay } from '../src/rescue-claim.ts';
import { parseRescue } from '../src/rescue-save.ts';
import { setLanguage, t } from '../src/i18n.ts';

const T0 = Date.UTC(2026, 9, 9, 5); // 12:00 in Vietnam
const SQUAD: SquadSpec[] = [
  { id: 's1', name: 'Clover', kind: 'helper', role: 'fighter', color: '#d98a4e' }, { id: 's2', name: 'Sprout', kind: 'helper', role: 'ranged', color: '#ffe14d' },
  { id: 's3', name: 'Pepper', kind: 'helper', role: 'support', color: '#f6f1e7' }, { id: 'n1', name: 'Ann', kind: 'neighbour', role: 'fighter', color: '#7fd0ff' },
];
const run = (mission: MissionId = 'toy', o: Partial<{ wide: boolean; squad: SquadSpec[]; seed: number; heroDisguise: string }> = {}) => createRun({ id: 'run-test', seed: o.seed ?? 7, mission, wide: o.wide ?? false, squad: o.squad ?? SQUAD, heroDisguise: o.heroDisguise });
const fresh = (level = 10) => { const s = M.newGame('Ann'); s.welcome = 'done'; s.level = level; return s; };

test('waves: same-size planet creatures, health rising about 18% a wave (+40% on the boss wave), damage 6% a wave', () => {
  for (const id of MISSION_IDS) {
    const md = MISSIONS[id];
    assert.equal(md.waves.length, { toy: 6, candy: 7, jungle: 8 }[id], id);
    assert.ok(md.waves[md.waves.length - 1].boss && md.waves.slice(0, -1).every(w => !w.boss), 'only the last wave has the boss');
    md.waves.forEach((w, i) => {
      assert.ok(Math.abs(w.hp - Math.pow(1.18, i) * (w.boss ? 1.4 : 1)) < .002, `${id} wave ${i} hp`);
      assert.ok(Math.abs(w.dmg - Math.pow(1.06, i)) < .002);
      for (const g of w.groups) { assert.ok(md.kinds[g.role] || g.role === 'mini', `${id} has a creature for ${g.role}`); assert.ok(g.n > 0 && g.gap > 0 && g.at >= 0); }
    });
    // Every role's creature exists, is the planet's own (or the plan's bee) and keeps its size: health climbs, the kind never changes.
    for (const [role, kind] of Object.entries(md.kinds)) {
      assert.ok(ENEMY_TYPES[kind], kind);
      const first = enemyNumbers(id, 0, role as never), last = enemyNumbers(id, md.waves.length - 1, role as never);
      assert.equal(first.kind, last.kind); assert.ok(last.hp > first.hp * 2, `${id} ${role} health rises`); assert.ok(last.dmg > first.dmg);
    }
    // A few more raiders as the waves go on.
    const counts = md.waves.map(w => w.groups.reduce((n, g) => n + g.n, 0));
    assert.ok(counts[counts.length - 1] > counts[0], `${id}: ${counts}`);
  }
  assert.equal(MISSIONS.toy.kinds.boss, 'robot'); assert.equal(MISSIONS.candy.kinds.boss, 'cake'); assert.equal(MISSIONS.jungle.kinds.boss, 'gorilla');
  assert.equal(MISSIONS.jungle.kinds.brute, 'boar'); assert.equal(MISSIONS.jungle.kinds.flyer, 'bee');
});

test('fields: lanes run from the far end to your end, with merges and forks; pads sit beside the paths, never on them', () => {
  for (const id of MISSION_IDS) for (const wide of [false, true]) {
    const f = buildField(id, wide);
    assert.equal(f.lanes.length, wide ? FIELDS[id].lanes.length : FIELDS[id].lanes.filter(l => !l.wide).length);
    assert.equal(f.lanes.filter(l => !l.wide).length, 3, 'three core lanes for phones and portrait');
    for (const l of f.lanes) for (const r of l.routes) { assert.ok(r.pts[0].x >= 30, 'starts at the far end'); assert.ok(r.pts[r.pts.length - 1].x <= RESCUE.endX, 'ends at your end'); assert.ok(r.length > 50); }
    assert.ok(f.pads.length >= 8 && f.pads.length <= 12, `${id} ${f.pads.length} pads`);
    const routes = f.lanes.flatMap(l => l.routes);
    f.pads.forEach((p, i) => {
      const nearest = Math.min(...routes.map(r => nearestOnRoute(r, p).dist));
      assert.ok(nearest >= 1.7 && nearest <= 5.5, `${id} pad ${i} is beside a path (${nearest.toFixed(2)} m)`);
      assert.ok(Math.abs(p.x) < RESCUE.half.x && Math.abs(p.z) < RESCUE.half.z, 'inside the field');
      for (let j = 0; j < i; j++) assert.ok(Math.hypot(p.x - f.pads[j].x, p.z - f.pads[j].z) >= 3, `${id} pads ${i} and ${j} apart`);
      assert.ok(nearestOnRoute(f.lanes.find(l => l.index === p.block.lane)!.routes[p.block.route], p.block).dist < 1e-6, 'a wall blocks a real lane point');
    });
    assert.ok(f.posts.length >= 3);
  }
  // Merges: toybox's top two lanes share their last stretch; forks: candy's middle lane has two routes that part and join.
  const toy = buildField('toy', false), [a, b] = [toy.lanes[0].routes[0], toy.lanes[1].routes[0]];
  assert.deepEqual(a.pts.slice(-3), b.pts.slice(-3));
  const candy = buildField('candy', false).lanes[1].routes; assert.equal(candy.length, 2);
  assert.deepEqual(candy[0].pts[0], candy[1].pts[0]); assert.deepEqual(candy[0].pts.at(-1), candy[1].pts.at(-1));
  assert.ok(Math.abs(pointAt(candy[0], 26).z - pointAt(candy[1], 26).z) > 3, 'the fork parts in the middle');
  // A wide-only lane falls back to a core lane on a narrow screen.
  const narrow = buildField('jungle', false); assert.equal(laneSlot(narrow, 4), 4 % 3); assert.equal(laneSlot(buildField('jungle', true), 4), 4);
  // Enemies take a fork's routes in turn.
  const m = run('candy'); m.phase = 'build'; startWave(m); m.queue = [{ t: 0, role: 'grunt', lane: 1 }, { t: 0, role: 'grunt', lane: 1 }]; m.waveT = 0; stepRun(m, .05);
  assert.deepEqual(m.enemies.map(e => e.route).sort(), [0, 1]);
});

test('pads and Spark: place, upgrade twice, sell for 60%; costs refused without Spark; kills and cleared waves pay', () => {
  const m = run();
  assert.equal(m.spark, RESCUE.startSpark); assert.equal(m.hearts, 10);
  assert.equal(DEFENCE_KINDS.length, 5); for (const k of DEFENCE_KINDS) assert.equal(DEFENCES[k].levels.length, 3);
  assert.equal(placeDefence(m, 99, 'popcorn'), 'pad');
  assert.ok(Array.isArray(placeDefence(m, 0, 'popcorn'))); assert.equal(m.spark, RESCUE.startSpark - 50);
  assert.equal(placeDefence(m, 0, 'cannon'), 'taken');
  assert.ok(Array.isArray(upgradeDefence(m, 0))); assert.equal(m.defences[0]!.level, 2);
  m.spark = 10; assert.equal(upgradeDefence(m, 0), 'spark'); assert.equal(placeDefence(m, 1, 'wall'), 'spark');
  m.spark = 500; upgradeDefence(m, 0); assert.equal(m.defences[0]!.level, 3); assert.equal(upgradeDefence(m, 0), 'max');
  const spent = 50 + 45 + 70; assert.equal(m.defences[0]!.spent, spent);
  sellDefence(m, 0); assert.equal(m.defences[0], null); assert.equal(m.spark, 500 - 70 + Math.floor(spent * .6));
  assert.equal(sellDefence(m, 0), 'empty');
  // Kills pay by role (a little more each wave); a cleared wave pays a bonus and a Star bit.
  assert.ok(ROLES.brute.spark > ROLES.grunt.spark && ROLES.boss.spark > ROLES.brute.spark);
  assert.ok(killSpark('grunt', 4) > killSpark('grunt', 0));
  const w = run(); w.spark = 0; startWave(w); w.queue = [{ t: 0, role: 'grunt', lane: 0 }]; stepRun(w, .05);
  const e = w.enemies[0]; heroHit(w, e.id, 1000); assert.equal(w.spark, killSpark('grunt', 0));
  stepRun(w, .05); assert.equal(w.phase, 'build'); assert.equal(w.cleared, 1);
  assert.equal(w.spark, killSpark('grunt', 0) + RESCUE.waveSpark.base + RESCUE.waveSpark.per); assert.ok(w.stars >= 1);
  // Defences shoot, the tesla chains, the cannon splashes, the wall blocks, frost slows.
  const d = run(); d.spark = 9999; d.units.splice(1);
  const f = buildField('toy', false), padNear = (lane: number) => f.pads.findIndex(p => p.lane === lane);
  placeDefence(d, padNear(1), 'tesla'); startWave(d); d.queue = Array.from({ length: 4 }, () => ({ t: 0, role: 'grunt' as const, lane: 1 }));
  hero(d).x = -40; let zaps = 0;
  for (let i = 0; i < 400 && d.enemies.length + d.queue.length; i++) zaps += stepRun(d, .05).filter(ev => ev.kind === 'shot' && ev.style === 'chain').length;
  assert.ok(zaps > 0, 'the tesla coil chained');
});

test('the wall holds a lane until it breaks; brutes smash defences; shooters shoot them from range', () => {
  const m = run('toy'); m.units.splice(1); m.spark = 9999; hero(m).x = -40; hero(m).z = 40;
  const f = buildField('toy', false), pad = f.pads.findIndex(p => p.block.lane === 2);
  placeDefence(m, pad, 'wall'); startWave(m); m.queue = [{ t: 0, role: 'grunt', lane: 2 }];
  let held = 0;
  for (let i = 0; i < 1200 && m.enemies.length + m.queue.length && m.phase === 'wave'; i++) { stepRun(m, .05); const e = m.enemies[0]; if (e && e.target === 'pad:' + pad) held++; }
  assert.ok(held > 20, 'the raider stopped at the wall'); assert.ok(!m.defences[pad] || m.defences[pad]!.hp < m.defences[pad]!.maxHp);
  const b = run('toy'); b.units.splice(1); b.spark = 9999; hero(b).x = -40; hero(b).z = 40;
  b.defences.forEach((_, i) => placeDefence(b, i, 'frost'));
  startWave(b); b.queue = [{ t: 0, role: 'brute', lane: 1 }];
  let smashed = false; for (let i = 0; i < 3000 && b.phase === 'wave'; i++) { const ev = stepRun(b, .05); if (ev.some(v => v.kind === 'def-hit')) smashed = true; if (smashed) break; }
  assert.ok(smashed, 'a brute smashed a defence on its way');
  const sh = run('toy'); sh.units.splice(1); sh.spark = 9999; hero(sh).x = -40; hero(sh).z = 40;
  sh.defences.forEach((_, i) => placeDefence(sh, i, 'wall')); startWave(sh); sh.queue = [{ t: 0, role: 'shooter', lane: 1 }];
  let shots = 0; for (let i = 0; i < 3000 && sh.phase === 'wave' && !shots; i++) shots += stepRun(sh, .05).filter(v => v.kind === 'shot' && v.style === 'enemy').length;
  assert.ok(shots > 0, 'a shooter fired at a defence from range');
  // Raiders queue behind one that has stopped instead of piling into one spot.
  const q = run('toy'); q.units.splice(1); startWave(q); q.queue = Array.from({ length: 4 }, (_, i) => ({ t: i * .3, role: 'grunt' as const, lane: 1 }));
  const p = buildField('toy', false).lanes[1].routes[0]; const stop = pointAt(p, 30); hero(q).x = stop.x; hero(q).z = stop.z; hero(q).def = 1e9;
  for (let i = 0; i < 600; i++) stepRun(q, .05);
  const ds = q.enemies.map(e => e.d).sort((a, b) => b - a); // two may face the hero side by side; the rest wait in a line
  assert.equal(ds.length, 4); assert.ok(ds[0] - ds[3] > 1.8 && ds[2] - ds[3] > .8, 'lined up: ' + ds.map(d => d.toFixed(1)));
  assert.ok(q.enemies.some(e => e.target === 'queue'));
});
test('decor stays off the paths', () => {
  for (const id of MISSION_IDS) { const f = buildField(id, true), routes = f.lanes.flatMap(l => l.routes); for (const [kind, x, z] of FIELDS[id].decor) assert.ok(Math.min(...routes.map(r => nearestOnRoute(r, { x, z }).dist)) > 2.4, `${id} ${kind} at ${x},${z}`); }
});

test('ladder: weak → strong by item stats per role, distinct disguises (never the hero\'s), and steps that cost Spark and Star bits', () => {
  for (const role of ['fighter', 'ranged', 'support'] as SquadRole[]) {
    const w = weaponsFor(role), o = outfitsFor(role), d = disguisesFor(role);
    assert.ok(w.length >= 3 && o.length >= 2 && d.length >= 2, role);
    for (const list of [w, o, d]) for (let i = 1; i < list.length; i++) assert.ok(gearScore(list[i]) >= gearScore(list[i - 1]), `${role}: ${list[i - 1]} before ${list[i]}`);
    // The steps only ever get stronger.
    const ladder = ladderFor(role, d[d.length - 1]); assert.equal(ladder.length, LADDER_STEPS + 1); assert.deepEqual(ladder[0], {});
    let prev = memberStats(ladder[0]);
    assert.equal(prev.range, 1.3, 'a punch at step 0');
    for (let s = 1; s <= LADDER_STEPS; s++) { const st = memberStats(ladder[s]); assert.ok(st.atk >= prev.atk && st.hp >= prev.hp, `${role} step ${s}`); prev = st; }
    assert.equal(ladder[1].weapon, w[0]); assert.equal(ladder[6].weapon, w[w.length - 1]); assert.equal(ladder[2].outfit, o[0]); assert.equal(ladder[5].outfit, o[o.length - 1]);
    assert.ok(ladder[4].disguise && !ladder[3].disguise);
  }
  assert.equal(weaponsFor('fighter')[0], 'sword_wood'); assert.equal(weaponsFor('ranged')[0], 'gun_pea'); assert.equal(weaponsFor('support')[0], 'gun_bubble');
  assert.equal(outfitsFor('fighter')[0], 'armor_leather'); assert.equal(outfitsFor('support')[0], 'armor_chef'); assert.equal(outfitsFor('ranged')[0], 'armor_hoodie');
  assert.equal(weaponRole('harpoon'), null); assert.equal(weaponRole('rod'), null);
  // New gear slots in by its stats: a made-up stronger sword lands at the top of the fighter branch.
  (ITEMS as Record<string, unknown>).sword_test_mega = { name: 'Mega', type: 'weapon', slot: 'weapon', stats: { atk: 999 }, weapon: { kind: 'sword', range: 3, cd: .5 } };
  try { /* the lists are cached per process, so compute afresh through the same rule */ const all = Object.keys(ITEMS).filter(id => weaponRole(id) === 'fighter').sort((a, b) => gearScore(a) - gearScore(b)); assert.equal(all.at(-1), 'sword_test_mega'); }
  finally { delete (ITEMS as Record<string, unknown>).sword_test_mega; }
  // Disguises: every friend different, none the hero's.
  for (const heroDz of [null, 'dz_knight', 'dz_fairy', 'dz_mecha']) {
    const picks = assignDisguises(['fighter', 'fighter', 'support', 'ranged'], heroDz);
    assert.equal(new Set(picks).size, 4, String(picks)); if (heroDz) assert.ok(!picks.includes(heroDz)); assert.ok(picks.every(Boolean));
  }
  const m = run('toy', { heroDisguise: 'dz_knight' });
  const dz = m.units.slice(1).map(u => u.disguise); assert.equal(new Set(dz).size, dz.length); assert.ok(!dz.includes('dz_knight'));
  // Buying steps: build phase only, Spark first, Star bits from step 3.
  const u = m.units[1]; m.spark = 1000; m.stars = 0;
  for (let s = 1; s <= 2; s++) { assert.ok(Array.isArray(buyStep(m, u.id))); assert.equal(u.step, s); }
  assert.equal(buyStep(m, u.id), 'stars'); m.stars = 99;
  while (u.step < LADDER_STEPS) assert.ok(Array.isArray(buyStep(m, u.id)));
  assert.equal(buyStep(m, u.id), 'max'); assert.equal(buyStep(m, ME), 'unit');
  const total = LADDER_COST.slice(1).reduce((n, c) => n + c.spark, 0); assert.equal(m.spark, 1000 - total);
  assert.ok(u.atk > memberStats({}).atk * 4 && u.maxHp > memberStats({}).hp * 1.8, 'the top of the ladder is far stronger than a punch');
  startWave(m); assert.equal(buyStep(m, m.units[2].id), 'phase');
  // Roles: helpers keep theirs, neighbours fill the thinnest role.
  const spread = spreadRoles([HELPER_ROLES.clover, null, null, HELPER_ROLES.pepper]);
  assert.equal(spread[0], 'fighter'); assert.equal(spread[3], 'support'); assert.equal(spread[1], 'ranged'); assert.equal(new Set(spread).size, 3);
  assert.equal(new Set(spreadRoles([null, null, null])).size, 3);
});

test('borrowed for the mission only: nothing of a run reaches the save, and the runtime never writes gear', () => {
  const s = fresh(), before = JSON.stringify(s);
  const m = run(); m.spark = 9999; m.stars = 99; for (const u of m.units.slice(1)) while (u.step < LADDER_STEPS) buyStep(m, u.id);
  simulate(m, { limit: 60 });
  assert.equal(JSON.stringify(s), before, 'a run is separate from the save');
  // Only the claim writes, and only its own bookkeeping, EXP, energy and the gift.
  const r = claimRescue(s, { runId: 'run-borrow', mission: 'toy', waves: 6, won: true, seconds: 400 }, T0, () => .99);
  assert.ok(r); const after = JSON.parse(JSON.stringify(s)) as Record<string, unknown>, was = JSON.parse(before) as Record<string, unknown>;
  const changed = Object.keys(after).filter(k => JSON.stringify(after[k]) !== JSON.stringify(was[k])).sort();
  for (const k of changed) assert.ok(['rescue', 'xp', 'level', 'energy', 'bag', 'chest', 'collection', 'hp', 'savedAt', 'events', 'progress', 'stats'].includes(k), 'unexpected save change: ' + k);
  assert.ok(!/spark|stars|ladder|defence/i.test(JSON.stringify(s.rescue)));
  assert.deepEqual(s.gear, JSON.parse(before).gear, 'the explorer\'s gear is untouched'); assert.deepEqual(s.friends ?? [], JSON.parse(before).friends ?? []);
  // The runtime shows mission gear through poses only: it never assigns to the save's gear or a friend's gear.
  const src = readFileSync(new URL('../src/rescue.ts', import.meta.url), 'utf8');
  assert.ok(!/\.gear\s*(\.\w+\s*)?=[^=]/.test(src), 'rescue.ts never writes gear');
  assert.ok(!/\b(spark|stars)\b[^\n]*state\(\)/.test(src) && !/state\(\)\.(spark|stars)/.test(src));
});

test('fall-back: a member at 0 HP recovers at the camp for 15 s, the hero for 5 s; a run ends on hearts or a rout', () => {
  const m = run(); startWave(m); m.queue = []; m.enemies = [];
  const u = m.units[1]; hurtUnit(m, u, 1e6, []); assert.equal(u.down, RESCUE.recover); assert.equal(u.hp, 0);
  hurtUnit(m, hero(m), 1e6, []); assert.equal(hero(m).down, RESCUE.heroDown);
  m.queue = [{ t: 999, role: 'grunt', lane: 0 }];
  let backs: string[] = []; for (let i = 0; i < 16 * 20; i++) backs.push(...stepRun(m, .05).filter(e => e.kind === 'back').map(e => (e as { unit: string }).unit));
  assert.deepEqual(backs, [ME, u.id], 'the hero is back first, then the member'); assert.equal(u.hp, u.maxHp);
  const camp = anchorOf(m, u, 1); assert.ok(Number.isFinite(camp.x));
  // Hearts: every leak costs one (the boss three); at 0 the farm falls.
  const h = run(); h.units.splice(1); startWave(h); h.queue = []; h.enemies = []; h.hearts = 2;
  h.queue = [{ t: 0, role: 'runner', lane: 2 }, { t: 0, role: 'runner', lane: 2 }]; hero(h).x = 40; hero(h).z = 40;
  for (let i = 0; i < 2000 && h.phase === 'wave'; i++) stepRun(h, .05);
  assert.equal(h.phase, 'over'); assert.deepEqual(h.result, { won: false, waves: 0, reason: 'hearts', seconds: h.result!.seconds });
  // A rout: the whole squad at the camp and three raiders through; a solo explorer is never routed.
  const r = run(); startWave(r); r.queue = []; r.enemies = []; hero(r).x = 40; hero(r).z = 40;
  for (const v of r.units.slice(1)) hurtUnit(r, v, 1e6, []); assert.ok(squadRouted(r));
  r.queue = Array.from({ length: ROUT_LEAKS }, () => ({ t: 0, role: 'runner' as const, lane: 2 })); stepRun(r, .05);
  for (const e of r.enemies) e.d += 50; // nearly at the camp while the squad recovers
  for (let i = 0; i < 2000 && r.phase === 'wave'; i++) stepRun(r, .05);
  assert.equal(r.result?.reason, 'routed'); assert.equal(r.hearts, RESCUE.hearts - ROUT_LEAKS);
  const solo = run('toy', { squad: [] }); assert.equal(squadRouted(solo), false);
  // A win: every wave cleared.
  const w = run(); for (let k = 0; k < MISSIONS.toy.waves.length; k++) { startWave(w); w.queue = []; w.enemies = []; stepRun(w, .05); }
  assert.equal(w.result?.won, true); assert.equal(w.result?.waves, 6); assert.equal(w.result?.reason, 'won'); assert.deepEqual(claimOf(w).won, true);
});

test('orientation: chosen once from the screen; landscape puts your end left, portrait at the bottom with raiders from the top', () => {
  assert.equal(chooseOrientation(1440, 900), 'landscape'); assert.equal(chooseOrientation(390, 844), 'portrait'); assert.equal(chooseOrientation(800, 820), 'landscape');
  assert.equal(wideScreen('landscape', 1440), true); assert.equal(wideScreen('landscape', 800), false); assert.equal(wideScreen('portrait', 1440), false);
  const C = RESCUE.arena, camp = { x: RESCUE.endX, z: 0 }, spawn = { x: 30, z: 0 };
  // Landscape: the camera looks along −z, so screen-left is −x.
  assert.ok(toWorld(camp, 'landscape').x < C.x && toWorld(spawn, 'landscape').x > C.x);
  // Portrait: screen-top is −z (far from the camera), screen-bottom +z.
  assert.ok(toWorld(spawn, 'portrait').z < C.z, 'raiders from the top'); assert.ok(toWorld(camp, 'portrait').z > C.z, 'your end at the bottom');
  for (const o of ['landscape', 'portrait'] as const) for (const p of [{ x: 3, z: -7 }, { x: -20, z: 11 }]) { const back = toLocal(toWorld(p, o), o); assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.z - p.z) < 1e-9); }
  // The drawn root's yaw matches the mapping (three.js: x' = x cos θ + z sin θ, z' = −x sin θ + z cos θ).
  for (const o of ['landscape', 'portrait'] as const) { const th = fieldYaw(o), p = { x: 5, z: 2 }, w = toWorld(p, o); assert.ok(Math.abs(C.x + p.x * Math.cos(th) + p.z * Math.sin(th) - w.x) < 1e-9 && Math.abs(C.z - p.x * Math.sin(th) + p.z * Math.cos(th) - w.z) < 1e-9, o); }
  // Facings turn with the field: heading +x (toward the raiders) faces −z in portrait.
  assert.ok(Math.abs(Math.cos(facingToWorld(Math.PI / 2, 'portrait')) - -1) < 1e-9);
  // The whole field stays inside the home map in both orientations.
  for (const o of ['landscape', 'portrait'] as const) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = toWorld({ x: sx * (RESCUE.half.x + 1), z: sz * (RESCUE.half.z + 1) }, o); assert.ok(Math.hypot(w.x, w.z) < 148, o); }
});

test('rescueClaim: validated, once per run, never faster than played, waves capped a day, five full wins a day with the gift', () => {
  const s = fresh(10), act = (p: Record<string, unknown>, now: number) => applyGameAction(s, { type: 'rescueClaim', payload: p }, { now, random: () => .99 });
  const ok = { runId: 'run-1', mission: 'toy', waves: 6, won: true, seconds: 400 };
  for (const bad of [{ ...ok, mission: 'mars' }, { ...ok, waves: 7 }, { ...ok, won: false }, { ...ok, waves: 3 }, { ...ok, seconds: 30 }, { ...ok, runId: '<x>' }])
    assert.throws(() => act(bad, T0), /already counted|not available/, JSON.stringify(bad));
  const low = fresh(2); assert.equal(claimRescue(low, ok, T0, () => .5), false, 'the planet must be open');
  const xp0 = s.xp + s.level * 1e9, e0 = s.energy;
  const r = act(ok, T0) as ReturnType<typeof claimRescue> & object;
  assert.ok(r.xp > 0 && r.energy === wavePay('toy', 6).energy && r.full && r.badge, JSON.stringify(r));
  assert.ok(s.xp + s.level * 1e9 > xp0); assert.equal(s.energy, e0 + r.energy);
  assert.deepEqual(r.gift.map(g => g.id), [MISSIONS.toy.gift.crop, MISSIONS.toy.gift.decor]); assert.equal(s.bag[MISSIONS.toy.gift.decor] ?? s.chest[MISSIONS.toy.gift.decor], 1);
  assert.throws(() => act(ok, T0 + 3_600_000), /already counted/, 'once per run');
  assert.throws(() => act({ ...ok, runId: 'run-2' }, T0 + 60_000), /already counted/, 'not faster than the run');
  // Five full wins a day; the sixth pays a quarter and no gift.
  let now = T0; for (let i = 2; i <= 6; i++) { now += 500_000; const k = claimRescue(s, { ...ok, runId: 'run-' + i }, now, () => .99)!; assert.ok(k, 'run ' + i); assert.equal(k.full, i <= 5, 'full ' + i); if (i > 5) assert.equal(k.gift.length, 0); }
  assert.equal(fullWinsLeft(s, now), 0); assert.equal(fullWinsLeft(s, now + 86_400_000), RESCUE_REWARD.winsPerDay);
  // Waves are capped a day (losses pay their waves too).
  const w = fresh(10); let t = T0, paid = 0;
  for (let i = 0; i < 12; i++) { t += 500_000; const k = claimRescue(w, { runId: 'loss-' + i, mission: 'toy', waves: 5, won: false, seconds: 300 }, t, () => .5)!; assert.ok(k); if (k.energy) paid += 5; }
  assert.equal(paid, RESCUE_REWARD.wavesPerDay); assert.equal(wavesLeft(w, t), 0);
  // The gift goes to the chest when the bag is full; the rare Defender hat sometimes.
  // A truly full backpack: as many real item kinds as it has slots (the size comes from the storage table).
  const full = fresh(10), gifts = new Set(Object.values(MISSIONS.jungle.gift)), kinds = Object.keys(M.ITEMS).filter(id => !gifts.has(id) && !M.ITEMS[id].slot);
  assert.ok(kinds.length >= M.bagCapacity(full), 'enough item kinds to fill the backpack'); for (const id of kinds.slice(0, M.bagCapacity(full))) full.bag[id] = 1;
  assert.equal(M.bagSlotsUsed(full), M.bagCapacity(full), 'the backpack is full');
  const g = claimRescue(full, { runId: 'chest-1', mission: 'jungle', waves: 8, won: true, seconds: 600 }, T0, () => 0)!;
  assert.ok(g.gift.some(x => x.where === 'chest')); assert.ok(g.gift.some(x => x.id === MISSIONS.jungle.gift.rare));
  // The save keeps it, and rubbish is dropped.
  const back = M.parseSave(JSON.stringify(s)); assert.deepEqual(back?.rescue, s.rescue); assert.equal(s.rescue!.day, rescueDay(T0));
  assert.equal(parseRescue('nope'), undefined); assert.deepEqual(parseRescue({ day: '2026-10-09', waves: 3, wins: 1, played: 2, won: 1, lastAt: 1, best: { toy: 6, '<x>': 3 }, heroes: ['toy', 5], claimed: ['ok-id', '<bad>'] }), { day: '2026-10-09', waves: 3, wins: 1, played: 2, won: 1, lastAt: 1, best: { toy: 6 }, heroes: ['toy'], claimed: ['ok-id'] });
});

test('balance: whole missions played in node — a sensible build wins, doing nothing loses, harder planets are harder', () => {
  const wins = (id: MissionId, o: Parameters<typeof simulate>[1], squad = SQUAD) => { let n = 0, waves = 0; for (let seed = 1; seed <= 4; seed++) { const m = run(id, { seed, squad }); simulate(m, o); if (m.result?.won) n++; waves += m.cleared; } return { n, waves }; };
  const toy = wins('toy', {}), candy = wins('candy', {}), jungle = wins('jungle', {});
  assert.ok(toy.n >= 3, 'toybox is winnable with a sensible build: ' + JSON.stringify(toy));
  assert.ok(candy.n >= 2, 'candy: ' + JSON.stringify(candy));
  assert.ok(jungle.waves >= 4 * 5, 'the jungle is hard but reachable: ' + JSON.stringify(jungle));
  for (const id of MISSION_IDS) { const none = wins(id, { build: false, hero: false }); assert.equal(none.n, 0, id + ' cannot be won by doing nothing'); assert.ok(none.waves <= 4 * 2); }
  // Upgrades matter: no ladder and no upgrades holds fewer waves than the full plan in the jungle.
  const noUp = (() => { let waves = 0; for (let seed = 1; seed <= 4; seed++) { const m = run('jungle', { seed }); simulate(m, { build: false }); waves += m.cleared; } return waves; })();
  assert.ok(jungle.waves > noUp, `${jungle.waves} > ${noUp}`);
  // At most 40 raiders alive at once.
  const m = run('jungle', { wide: true }); let peak = 0; for (let t = 0; t < 900 && m.phase !== 'over'; t += .1) { if (m.phase === 'build') { autoPlan(m); startWave(m); } stepRun(m, .1); peak = Math.max(peak, m.enemies.filter(e => e.hp > 0).length); }
  assert.ok(peak <= RESCUE.maxLive, String(peak));
  // The hero hits as a hero of the mission's level, whatever the explorer's level.
  const h = run('jungle'); startWave(h); h.queue = [{ t: 0, role: 'brute', lane: 0 }]; stepRun(h, .05); const e = h.enemies[0], hp = e.hp; heroHit(h, e.id, 1);
  assert.ok(Math.abs(hp - e.hp - heroAtk(8)) < 1e-6);
  buyBoost(h, 'dmg'); assert.equal(buyBoost(h, 'cdr'), 'stars'); h.spark = 999; h.stars = 9; for (let i = 0; i < 3; i++) buyBoost(h, 'cdr'); assert.equal(buyBoost(h, 'cdr'), 'max'); assert.equal(h.boosts.cdr, BOOSTS.cdr.max);
});

test('every Rescue Call line reads in Vietnamese', () => {
  setLanguage('vi');
  try {
    for (const [en, vi] of Object.entries(RESCUE_VI)) assert.ok(vi && (vi !== en || /EXP/.test(en)), en);
    // Every literal handed to t( in the rescue modules has a translation.
    const dir = new URL('../src/', import.meta.url), missing: string[] = [];
    for (const name of readdirSync(dir).filter(n => /^rescue.*\.ts$/.test(n))) {
      const src = readFileSync(new URL(name, dir), 'utf8');
      for (const [, q, text] of src.matchAll(/\bt\((['"])((?:\\.|(?!\1).)+)\1/g)) { void q; const key = text.replace(/\\'/g, "'"); if (t(key) === key && !/^\{|EXP/.test(key)) missing.push(`${name}: ${key}`); }
    }
    for (const md of Object.values(MISSIONS)) for (const key of [md.title, md.friend, md.story]) if (t(key) === key) missing.push(key);
    for (const d of Object.values(DEFENCES)) for (const key of [d.name, d.desc]) if (t(key) === key) missing.push(key);
    for (const b of Object.values(BOOSTS)) for (const key of [b.name, b.desc]) if (t(key) === key) missing.push(key);
    assert.deepEqual(missing, []);
    assert.equal(t('Wave {n}/{total}', { n: 2, total: 6 }), 'Đợt 2/6');
  } finally { setLanguage('en'); }
});

test('the run is plain data: it survives JSON and plays on the same', () => {
  const a = run('candy', { seed: 42 }), b = JSON.parse(JSON.stringify(a)) as RsRun;
  autoPlan(a); autoPlan(b); startWave(a); startWave(b);
  for (let i = 0; i < 600; i++) { stepRun(a, .05); stepRun(b, .05); }
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.ok(unit(a, 's1'));
});
