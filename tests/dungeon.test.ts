// The Delvers' Vault (dungeon-rules.ts, dungeon-patterns.ts, dungeon-content.ts): day limits, the lobby countdown, the
// stage flow, seeded loot rates, the solo party fill and the guardians' skills.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';
import { DUNGEON, STAGE_COUNT, dayKey, runsLeft, startRun, claimStage, rollStageLoot, scaled, skillDelay, LobbyCountdown, fillParty, DungeonFlow, inLobby } from '../src/dungeon-rules.ts';
import { DUNGEON_STAGES, DUNGEON_BOSSES, DUNGEON_ENEMIES, DUNGEON_ITEMS, DUNGEON_PETS, DUNGEON_SKILL_INFO, DUNGEON_VI, type DungeonSkill } from '../src/dungeon-content.ts';
import { beginSkill, stepSkill, inMark, SKILL_WINDUPS, sanitizeAttack, petSkillMarks, petHits, type DgTarget } from '../src/dungeon-patterns.ts';
import { parseDungeon } from '../src/dungeon-save.ts';
import { setLanguage, t } from '../src/i18n.ts';

const T0 = Date.UTC(2026, 9, 6, 5); // 12:00 in Vietnam
const seeded = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const fresh = () => { const s = M.newGame('Ann'); s.welcome = 'done'; return s; };
const act = (s: M.SaveState, type: string, payload: Record<string, unknown>, now = T0, random = () => .5) => applyGameAction(s, { type, payload }, { now, random });

test('the reference config: 2 runs a day, 10 s countdown, 30 minutes, arena radius 23, five stages', () => {
  assert.equal(DUNGEON.perDay, 2); assert.equal(DUNGEON.countdown, 10); assert.equal(DUNGEON.timeLimit, 1800); assert.equal(DUNGEON.arenaR, 23);
  assert.equal(STAGE_COUNT, 5); assert.deepEqual(DUNGEON_STAGES.map(s => DUNGEON_BOSSES[s.boss].hp), [3000, 3800, 4600, 5400, 6800]);
  for (const b of Object.values(DUNGEON_BOSSES)) { assert.equal(b.skills.length, 4); assert.ok(DUNGEON_PETS[b.pet]); assert.ok(DUNGEON_ITEMS[b.pet]); }
  assert.equal(new Set(Object.values(DUNGEON_BOSSES).flatMap(b => b.skills)).size, 20, 'twenty different guardian skills');
  assert.ok(inLobby({ x: 11, z: 27.5 }) && inLobby({ x: 14.9, z: 27.5 }) && !inLobby({ x: 16, z: 27.5 }));
});

test('two runs a day, counted at the start; the day turns at midnight in Vietnam', () => {
  const s = fresh();
  assert.equal(runsLeft(s, T0), 2);
  assert.deepEqual(act(s, 'dungeonStart', { runId: 'run-a' }), { left: 1 });
  assert.deepEqual(act(s, 'dungeonStart', { runId: 'run-b' }), { left: 0 });
  assert.throws(() => act(s, 'dungeonStart', { runId: 'run-c' }), /twice today/);
  assert.equal(runsLeft(s, T0), 0);
  const midnight = Date.UTC(2026, 9, 6, 17); // 00:00 on the 7th in Vietnam
  assert.equal(dayKey(midnight - 1), '2026-10-06'); assert.equal(dayKey(midnight), '2026-10-07');
  assert.equal(runsLeft(s, midnight - 1), 0); assert.equal(runsLeft(s, midnight), 2);
  assert.ok(startRun(s, 'run-d', midnight)); assert.equal(s.dungeon!.runs, 1);
  const away = fresh(); away.planet = 'lava'; assert.equal(startRun(away, 'run-e', T0), false);
  // The counter survives a save and reload.
  const back = M.parseSave(JSON.stringify(s))!; assert.equal(runsLeft(back, midnight), 1); assert.equal(back.dungeon!.run!.id, 'run-d');
  assert.equal(parseDungeon({ day: 'x', runs: 'many' }), undefined);
});

test('stages are claimed in order, not too fast, within the time limit; the last one counts a clear', () => {
  const s = fresh(); act(s, 'dungeonStart', { runId: 'run-1', party: 5 });
  assert.throws(() => act(s, 'dungeonClaim', { runId: 'run-1', stage: 0 }, T0 + 5000), /already counted/, 'too soon');
  assert.throws(() => act(s, 'dungeonClaim', { runId: 'run-1', stage: 1 }, T0 + 60_000), /already counted/, 'out of order');
  assert.throws(() => act(s, 'dungeonClaim', { runId: 'other', stage: 0 }, T0 + 60_000), /already counted/, 'wrong run');
  const bagBefore = s.bag.dg_seal ?? 0, xpBefore = s.xp + s.level * 1e6;
  let now = T0;
  for (let stage = 0; stage < STAGE_COUNT; stage++) { now += 60_000; const loot = act(s, 'dungeonClaim', { runId: 'run-1', stage }, now) as { stage: number; cleared: boolean }; assert.equal(loot.stage, stage); assert.equal(loot.cleared, stage === STAGE_COUNT - 1); }
  assert.ok((s.bag.dg_seal ?? 0) > bagBefore); assert.ok(s.xp + s.level * 1e6 > xpBefore);
  assert.equal(s.dungeon!.clears, 1); assert.equal(s.dungeon!.run, undefined);
  assert.throws(() => act(s, 'dungeonClaim', { runId: 'run-1', stage: 0 }, now + 60_000), /already counted/);
  const late = fresh(); startRun(late, 'run-late', T0); assert.equal(claimStage(late, 'run-late', 0, T0 + 1800_000 + 61_000, () => .1), false, 'past the time limit');
});

test('seeded loot rates: own pet 25% (no luck), seals always, the chest 50% on the last guardian', () => {
  const random = seeded(12345), N = 20000;
  for (let stage = 0; stage < STAGE_COUNT; stage++) {
    let pets = 0, chests = 0, sealsMin = Infinity;
    for (let i = 0; i < N; i++) {
      const loot = rollStageLoot(stage, random), seals = loot.items.find(x => x.id === 'dg_seal')?.count ?? 0;
      if (loot.pet) { pets++; assert.equal(loot.pet, DUNGEON_BOSSES[DUNGEON_STAGES[stage].boss].pet); }
      if (loot.chest) chests++; sealsMin = Math.min(sealsMin, seals);
    }
    assert.ok(Math.abs(pets / N - .25) < .015, `stage ${stage} pet rate ${pets / N}`);
    assert.ok(sealsMin >= DUNGEON_STAGES[stage].seals[0], 'seals always drop');
    if (stage === STAGE_COUNT - 1) assert.ok(Math.abs(chests / N - .5) < .015, `chest rate ${chests / N}`); else assert.equal(chests, 0);
  }
  // Luck never raises the pet chance: the roll does not read the state at all.
  assert.deepEqual(rollStageLoot(2, seeded(7)), rollStageLoot(2, seeded(7)));
});

test('the lobby countdown runs 10 s while someone stands in the circle and resets when they leave', () => {
  const lobby = new LobbyCountdown(1, 10, 5);
  assert.equal(lobby.step(1, []), null); assert.equal(lobby.seconds, null);
  assert.equal(lobby.step(4, ['me']), null); assert.equal(lobby.seconds, 6);
  assert.equal(lobby.step(1, []), null); assert.equal(lobby.seconds, null, 'stepping out resets');
  for (let i = 0; i < 9; i++) assert.equal(lobby.step(1, ['me', 'b']), null);
  assert.deepEqual(lobby.step(1.01, ['me', 'b', 'c']), ['me', 'b', 'c']);
  const full = new LobbyCountdown(1, 10, 5), crowd = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  full.step(5, crowd); assert.deepEqual(full.step(5, crowd), ['a', 'b', 'c', 'd', 'e'], 'at most five, first come first served');
  assert.deepEqual(full.order, ['f', 'g']);
  const five = new LobbyCountdown(5); assert.equal(five.step(20, ['a', 'b']), null); assert.equal(five.seconds, null, 'the reference needs five');
});

test('solo: AI neighbours fill the party up to five, friends first', () => {
  const cast = [{ id: 'bot:a', name: 'A', level: 30 }, { id: 'bot:b', name: 'B', level: 12 }, { id: 'bot:c', name: 'C', level: 50 }, { id: 'bot:d', name: 'D', level: 8 }, { id: 'bot:e', name: 'E', level: 20 }];
  const friends = new Set(['bot:b', 'bot:d']);
  const party = fillParty(1, cast, id => friends.has(id));
  assert.equal(party.length, 4); assert.deepEqual(party.slice(0, 2).map(p => p.id), ['bot:b', 'bot:d']); assert.deepEqual(party.slice(2).map(p => p.id), ['bot:c', 'bot:a']);
  assert.equal(fillParty(3, cast, () => false).length, 2); assert.equal(fillParty(5, cast, () => false).length, 0);
});

test('stage flow: creatures, guardian, portal (auto after 8 s or step in), and home 25 s after the last guardian', () => {
  const flow = new DungeonFlow(), alive = { mobs: 14, boss: false };
  assert.deepEqual(flow.step(1, alive), []); assert.deepEqual(flow.step(2, alive), [{ kind: 'spawnMobs', stage: 0 }]);
  assert.deepEqual(flow.step(1, alive), []); alive.mobs = 0;
  assert.deepEqual(flow.step(.1, alive), [{ kind: 'spawnBoss', stage: 0 }]); alive.boss = true;
  assert.deepEqual(flow.step(5, alive), []); alive.boss = false;
  assert.deepEqual(flow.step(.1, alive), [{ kind: 'portal', stage: 0 }]);
  assert.deepEqual(flow.step(7.5, alive), []); assert.deepEqual(flow.step(.6, alive), [{ kind: 'next', stage: 1 }], 'auto after 8 s');
  for (let stage = 1; stage < STAGE_COUNT; stage++) {
    alive.mobs = 3; flow.step(3, alive); alive.mobs = 0; flow.step(.1, alive); alive.boss = false; const events = flow.step(1.1, alive);
    if (stage < STAGE_COUNT - 1) { assert.deepEqual(events, [{ kind: 'portal', stage }]); assert.deepEqual(flow.enterPortal(), [{ kind: 'next', stage: stage + 1 }], 'stepping in'); }
    else assert.deepEqual(events, [{ kind: 'done' }]);
  }
  assert.deepEqual(flow.step(24.9, alive), []); assert.deepEqual(flow.step(.2, alive), [{ kind: 'home', reason: 'clear' }]);
  const slow = new DungeonFlow(); slow.step(10, { mobs: 5, boss: false }); assert.deepEqual(slow.step(DUNGEON.timeLimit, { mobs: 5, boss: false }), [{ kind: 'home', reason: 'time' }]);
});

test('scaling: difficulty 5, guardian HP x1.4 and attack x1.35, party size like the reference; skill cadence', () => {
  const first = scaled(DUNGEON_ENEMIES.dg_morel, true, 1); assert.equal(first.hp, 20160); assert.ok(Math.abs(first.damage - 34 * 4.8 * 1.35) < 1e-9);
  assert.equal(scaled(DUNGEON_ENEMIES.dg_morel, true, 5).hp, Math.round(20160 * 2.4)); assert.equal(scaled(DUNGEON_ENEMIES.dg_gnat, false, 3).hp, Math.round(90 * 4.8 * 1.4));
  const calm = skillDelay(2.2, 1, false), half = skillDelay(2.2, .4, false), angry = skillDelay(2.2, .2, true);
  assert.ok(calm > half && half > angry, `${calm} > ${half} > ${angry}`); assert.equal(calm, Math.round((2.2 + .6) * 2 * 100) / 100);
});

const arena = { x: -60, z: -100, r: 23 }, boss = { x: -60, z: -96, radius: 1.5, facing: 0 };
function run(skill: DungeonSkill, targets: DgTarget[], seconds = 12) {
  const a = beginSkill(skill, boss, targets[0], targets, seeded(3), arena); const hits: Array<{ id: string; mult: number; root?: number; slow?: number }> = []; let moved = false;
  for (let t = 0; t < seconds && a.age < a.life; t += 1 / 30) { const out = stepSkill(a, 1 / 30, boss, targets); hits.push(...out.hits); if (out.move) moved = true; }
  return { a, hits, moved };
}
test('every guardian skill telegraphs before it strikes and then hits who stands in it', () => {
  for (const skill of Object.keys(SKILL_WINDUPS) as DungeonSkill[]) {
    const target = { id: 'me', x: -60, z: -90 }, a = beginSkill(skill, boss, target, [target], seeded(1), arena);
    assert.ok(a.marks.length > 0, skill); assert.ok(a.marks.every(m => m.at >= SKILL_WINDUPS[skill] - 1e-9), `${skill} strikes only after its wind-up`);
    const early = stepSkill(a, SKILL_WINDUPS[skill] * .9, boss, [target]); assert.equal(early.hits.length, 0, `${skill} does not hit during the wind-up`);
    assert.ok(DUNGEON_SKILL_INFO[skill]);
  }
  // Someone standing on the guardian's chosen spot is hit by the aimed skills.
  for (const skill of ['hush_bind', 'anvil_drop', 'chain_cage', 'polyp_bloom', 'scatter_dust', 'glow_beams', 'hammer_cross', 'tentacle_sweep', 'spark_flurry', 'cap_roll'] as DungeonSkill[]) {
    const { hits } = run(skill, [{ id: 'me', x: -60, z: -89 }]); assert.ok(hits.some(h => h.id === 'me'), `${skill} hits its target`);
  }
  assert.ok(run('hush_bind', [{ id: 'me', x: -60, z: -89 }]).hits[0].root! > 2, 'the bind roots');
  assert.ok(run('cap_roll', [{ id: 'me', x: -60, z: -89 }]).moved, 'the roll moves the guardian');
  // Far away from the nova is safe; inside it is not.
  assert.equal(run('great_chime', [{ id: 'me', x: -60, z: -80 }]).hits.length, 0); assert.equal(run('great_chime', [{ id: 'me', x: -60, z: -93 }]).hits.length, 1);
  // The trail keeps hurting while you stand in it (8 s at one tick per 0.5 s).
  const trail = run('spore_trail', [{ id: 'me', x: -60, z: -90 }]).hits; assert.ok(trail.length >= 12 && trail.every(h => h.slow), `${trail.length} trail ticks`);
});
test('the eclipse spares only those inside a safe circle; moon dust punishes standing together', () => {
  const me = { id: 'me', x: -60, z: -100 }, a = beginSkill('eclipse_wing', boss, me, [me], seeded(9), arena), safe = a.marks.filter(m => m.shape === 'safe');
  assert.equal(safe.length, 3); assert.ok(safe.every(m => Math.hypot(m.x - arena.x, m.z - arena.z) < arena.r - 3));
  const inside = { id: 'in', x: safe[0].x, z: safe[0].z }, outside = { id: 'out', x: -60, z: -100 };
  const b = beginSkill('eclipse_wing', boss, me, [me], seeded(9), arena); let hits: string[] = [];
  for (let t = 0; t < 3; t += .05) hits.push(...stepSkill(b, .05, boss, [inside, outside]).hits.map(h => h.id));
  assert.deepEqual(hits, ['out']);
  const pair = [{ id: 'a', x: -55, z: -90 }, { id: 'b', x: -55.5, z: -90 }], dust = run('scatter_dust', pair).hits;
  assert.equal(dust.filter(h => h.id === 'a').length, 2, 'two overlapping marks: hit twice');
  const apart = [{ id: 'a', x: -50, z: -90 }, { id: 'b', x: -70, z: -90 }]; assert.equal(run('scatter_dust', apart).hits.filter(h => h.id === 'a').length, 1);
});
test('homing bubbles chase and land; rotating lances tick; peers accept only sane casts', () => {
  const me = { id: 'me', x: -52, z: -96 }, orbs = run('bubble_orbs', [me]).hits; assert.ok(orbs.length >= 5, `${orbs.length} bubbles landed`);
  const lances = run('prism_lances', [{ id: 'me', x: -60, z: -90 }]).hits; assert.ok(lances.length >= 1);
  const a = beginSkill('starfall', boss, me, [me], seeded(2), arena), wire = JSON.parse(JSON.stringify(a));
  const back = sanitizeAttack(wire, Object.keys(SKILL_WINDUPS)); assert.ok(back); assert.equal(back!.marks.length, a.marks.length);
  assert.equal(sanitizeAttack({ ...wire, skill: 'nuke' }, Object.keys(SKILL_WINDUPS)), null);
  assert.equal(sanitizeAttack({ ...wire, marks: [] }, Object.keys(SKILL_WINDUPS)), null);
  assert.ok(inMark({ shape: 'line', x: 0, z: 0, angle: 0, len: 10, width: 2, r: 10, at: 0 }, { x: 0, z: 5 })); assert.ok(!inMark({ shape: 'line', x: 0, z: 0, angle: 0, len: 10, width: 2, r: 10, at: 0 }, { x: 3, z: 5 }));
});
test('pet skills strike the creatures around their target', () => {
  const { marks, mult } = petSkillMarks('p_anvil', { x: 0, z: 0 }, { x: 4, z: 0 }, seeded(4)); assert.ok(mult > 2);
  const hit = petHits(marks, [{ id: 'a', x: 4, z: 0, hp: 10 }, { id: 'b', x: 5.5, z: .5, hp: 10 }, { id: 'c', x: 12, z: 0, hp: 10 }, { id: 'd', x: 4, z: 0, hp: 0 }]);
  assert.deepEqual(hit.map(e => e.id), ['a', 'b']);
});
test('every vault name and line has Vietnamese', () => {
  setLanguage('vi');
  try {
    for (const item of Object.values(DUNGEON_ITEMS)) { assert.notEqual(t(item.name), item.name, item.name); assert.notEqual(t(item.desc), item.desc, item.desc); }
    for (const def of Object.values(DUNGEON_ENEMIES)) assert.notEqual(t(def.name), def.name, def.name);
    for (const st of DUNGEON_STAGES) assert.notEqual(t(st.name), st.name);
    for (const key of Object.keys(DUNGEON_VI)) assert.ok(DUNGEON_VI[key].length > 0, key);
  } finally { setLanguage('en'); }
});
test('vault companions need the vault\'s recommended level to wear; the chest and seals are free', () => {
  for (const id of Object.keys(DUNGEON_PETS)) { assert.equal(M.gearLevel(id), 20, id); const s = M.newGame(); s.level = 19; s.bag[id] = 1; assert.equal(M.equip(s, id), false); s.level = 20; assert.notEqual(M.equip(s, id), false); }
  assert.equal(M.gearLevel('deco_dgchest'), 0); assert.equal(M.gearLevel('dg_seal'), 0);
});
