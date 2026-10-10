import test from 'node:test';
import assert from 'node:assert/strict';
import { CTF, FIELD, HEROES, HERO_IDS, POWERS, POWER, heroStats, CTF_VI } from '../src/ctf-content.ts';
import { createMatch, stepMatch, movePlayer, hurt, playerHit, castAi, basicAttack, speedFactor, canTeleport, rollPower, fieldObstacles, onLand, forfeit, matchXp, rewardFor, applyPower, player, CTF_REWARD, type CtfMatch, type RosterEntry } from '../src/ctf-rules.ts';
import { assignRoles, planBot, routeTo, pickHeroes, stepBots, newMinds } from '../src/ctf-ai.ts';
import { claimMatch, rewardedLeft, ctfDay } from '../src/ctf-claim.ts';
import { parseCtf } from '../src/ctf-save.ts';
import { DISGUISE_KITS } from '../src/combat.ts';
import { DISGUISES } from '../src/content.ts';
import * as M from '../src/model.ts';
import { t, setLanguage } from '../src/i18n.ts';

const roster = (size: number): RosterEntry[] => [
  ...Array.from({ length: size }, (_, i) => ({ id: i ? 'b' + i : 'me', name: 'B' + i, team: 0 as const, hero: HERO_IDS[i], human: i === 0 })),
  ...Array.from({ length: size }, (_, i) => ({ id: 'r' + i, name: 'R' + i, team: 1 as const, hero: HERO_IDS[5 + i] })),
];
function live(size = 2, seed = 7) { const m = createMatch({ id: 'test-match', seed, size, roster: roster(size) }); for (let i = 0; i < 40 && m.phase === 'intro'; i++) stepMatch(m, .25); assert.equal(m.phase, 'play'); return m; }
const stand = (team: 0 | 1) => FIELD.stands[team];
const at = (m: CtfMatch, id: string, x: number, z: number) => { const p = player(m, id)!; p.x = x; p.z = z; };

test('the reference numbers: first to 3, 8 minutes + 3 overtime, level 8, respawn 5 s, flag home in 15 s, carrier 15% slower, power-ups every 22 s', () => {
  assert.deepEqual([CTF.win, CTF.time, CTF.overtime, CTF.level, CTF.respawn, CTF.flagReturn, CTF.carrySlow, CTF.powerEvery, CTF.firstPower], [3, 480, 180, 8, 5, 15, .15, 22, 8]);
  assert.deepEqual([...CTF.sizes], [1, 2, 3, 5]);
  assert.equal(Object.keys(POWERS).length, 7);
  assert.equal(HERO_IDS.length, 10);
  // Heroes are the ten shared disguises, each with the explorer's four-skill kit (the fourth is the ultimate).
  for (const id of HERO_IDS) { assert.ok(DISGUISES[id], id); assert.equal(DISGUISE_KITS[id]?.length, 4, id); assert.equal(HEROES[id].ai.length, 4); }
  assert.deepEqual(heroStats('dz_knight'), { hp: 1404, atk: 77.2, def: 53, as: .72, range: 2.3, ms: 5.9 });
});

test('scoring: take the enemy flag, bring it to your stand while yours is home; three captures win', () => {
  const m = live(1);
  for (let k = 1; k <= 3; k++) {
    at(m, 'me', stand(1).x, stand(1).z); let ev = stepMatch(m, .05);
    assert.ok(ev.some(e => e.kind === 'take' && e.by === 'me'));
    assert.equal(m.flags[1].state, 'carried'); assert.equal(player(m, 'me')!.carrying, 1);
    at(m, 'me', stand(0).x + .5, stand(0).z); ev = stepMatch(m, .05);
    assert.ok(ev.some(e => e.kind === 'capture' && e.by === 'me'), 'capture ' + k);
    assert.deepEqual(m.score, [k, 0]); assert.equal(m.flags[1].state, 'home');
  }
  assert.equal(m.phase, 'over'); assert.deepEqual(m.result, { winner: 0, reason: 'flags', seconds: m.result!.seconds });
  assert.equal(player(m, 'me')!.stats.caps, 3);
});

test('no capture while your own flag is away from home', () => {
  const m = live(1);
  at(m, 'r0', stand(0).x, stand(0).z); at(m, 'me', stand(1).x, stand(1).z); stepMatch(m, .05);
  assert.equal(m.flags[0].state, 'carried'); assert.equal(m.flags[1].state, 'carried');
  at(m, 'r0', 0, 25); at(m, 'me', stand(0).x, stand(0).z); stepMatch(m, .05);
  assert.deepEqual(m.score, [0, 0]); assert.equal(player(m, 'me')!.carrying, 1);
});

test('a downed carrier drops the flag; it flies home after 15 s, or a teammate touching it sends it home at once', () => {
  const m = live(2);
  at(m, 'r0', stand(0).x, stand(0).z); stepMatch(m, .05); at(m, 'r0', -10, 10);
  hurt(m, 'r0', 1e6, 'me'); let ev = stepMatch(m, .05);
  assert.equal(m.flags[0].state, 'dropped'); assert.equal(m.flags[0].x, -10); assert.ok(m.flags[0].returnIn > 14.8);
  for (let i = 0; i < 140; i++) stepMatch(m, .1);
  assert.equal(m.flags[0].state, 'dropped');
  ev = []; for (let i = 0; i < 12; i++) ev.push(...stepMatch(m, .1));
  assert.equal(m.flags[0].state, 'home'); assert.ok(ev.some(e => e.kind === 'return' && e.by === null));
  // Again, and this time a teammate returns it.
  at(m, 'r1', stand(0).x, stand(0).z); stepMatch(m, .05); hurt(m, 'r1', 1e6, 'me'); stepMatch(m, .05);
  const f = m.flags[0]; at(m, 'b1', f.x, f.z); ev = stepMatch(m, .05);
  assert.equal(f.state, 'home'); assert.ok(ev.some(e => e.kind === 'return' && e.by === 'b1')); assert.equal(player(m, 'b1')!.stats.rets, 1);
  assert.equal(player(m, 'me')!.stats.kills, 2);
});

test('the carrier runs 15% slower, is always seen and cannot teleport', () => {
  const m = live(1), me = player(m, 'me')!;
  assert.equal(speedFactor(me), 1);
  at(m, 'me', stand(1).x, stand(1).z); stepMatch(m, .05);
  assert.equal(speedFactor(me), .85); assert.equal(canTeleport(me), false);
  applyPower(m, me, 'zip'); assert.ok(Math.abs(speedFactor(me) - 1.6 * .85) < 1e-9);
  applyPower(m, me, 'wisp'); assert.equal(me.buffs.wisp, 0, 'no cloak while carrying');
  // A bot carrying the flag cannot blink with it.
  const m2 = createMatch({ id: 'blink-test', seed: 3, size: 1, roster: [{ id: 'mage', name: 'M', team: 0, hero: 'dz_mage' }, { id: 'x', name: 'X', team: 1, hero: 'dz_knight' }] });
  for (let i = 0; i < 40 && m2.phase === 'intro'; i++) stepMatch(m2, .25); at(m2, 'mage', stand(1).x, stand(1).z); stepMatch(m2, .05);
  assert.equal(castAi(m2, 'mage', 1, 0, 0), false);
});

test('respawn: down for 5 s, then back at a spawn with full health and a short guard', () => {
  const m = live(1), r = player(m, 'r0')!;
  at(m, 'r0', 10, 10); hurt(m, 'r0', 1e6, 'me'); assert.equal(r.alive, false);
  for (let i = 0; i < 48; i++) stepMatch(m, .1);
  assert.equal(r.alive, false);
  const ev = []; for (let i = 0; i < 3; i++) ev.push(...stepMatch(m, .1));
  assert.equal(r.alive, true); assert.equal(r.hp, r.maxHp); assert.ok(r.guard > 0);
  assert.ok(FIELD.spawns[1].some(s => s.x === r.x && s.z === r.z));
  assert.equal(hurt(m, 'r0', 100, 'me'), 0, 'guarded just after respawning');
});

test('overtime: a tie at 8 minutes plays a golden point; a capture wins it, else a draw after 3 minutes', () => {
  const m = live(1);
  m.timer = .05; let ev = stepMatch(m, .1);
  assert.equal(m.phase, 'overtime'); assert.ok(ev.some(e => e.kind === 'overtime')); assert.equal(m.timer, CTF.overtime);
  at(m, 'r0', stand(0).x, stand(0).z); stepMatch(m, .05); at(m, 'r0', stand(1).x, stand(1).z); ev = stepMatch(m, .05);
  assert.equal(m.phase, 'over'); assert.deepEqual([m.result!.winner, m.result!.reason], [1, 'golden']);
  const d = live(1); d.timer = .01; stepMatch(d, .05); d.timer = .01; stepMatch(d, .05);
  assert.equal(d.phase, 'over'); assert.equal(d.result!.winner, -1);
  const lead = live(1); at(lead, 'me', stand(1).x, stand(1).z); stepMatch(lead, .05); at(lead, 'me', stand(0).x, stand(0).z); stepMatch(lead, .05);
  lead.timer = .01; stepMatch(lead, .05); assert.deepEqual([lead.result!.winner, lead.result!.reason], [0, 'time']);
});

test('power-ups: the first at 8 s, then one every 22 s on a free spot; the roll covers all seven by weight; deterministic', () => {
  const run = (seed: number) => { const m = live(1, seed); const spawns: Array<[number, string, number]> = []; for (let i = 0; i < 120 * 10; i++) for (const e of stepMatch(m, .1)) if (e.kind === 'power-spawn') spawns.push([Math.round(m.elapsed), e.power, e.spot]); return { m, spawns }; };
  const { m, spawns } = run(11);
  assert.deepEqual(spawns.map(s => s[0]), [8, 30, 52, 74, 96, 118]);
  assert.equal(new Set(spawns.map(s => s[2])).size, spawns.length, 'never two on one spot');
  assert.equal(m.power.spots.filter(Boolean).length, 6);
  assert.deepEqual(run(11).spawns, spawns); assert.notDeepEqual(run(12).spawns, spawns);
  const seen = new Map<string, number>(); for (let i = 0; i < 1300; i++) { const k = rollPower(i / 1300); seen.set(k, (seen.get(k) ?? 0) + 1); }
  assert.equal(seen.size, 7); assert.ok(seen.get('apple')! > seen.get('frost')!);
  // Picking one up applies it.
  const me = player(m, 'me')!, spot = m.power.spots.findIndex(Boolean), kind = m.power.spots[spot]!;
  at(m, 'me', FIELD.powerSpots[spot].x, FIELD.powerSpots[spot].z); const ev = stepMatch(m, .05);
  assert.ok(ev.some(e => e.kind === 'power' && e.power === kind)); assert.equal(m.power.spots[spot], null); void me;
  const f = live(1); at(f, 'r0', 1, 0); at(f, 'me', 0, 0); applyPower(f, player(f, 'me')!, 'frost'); assert.equal(player(f, 'r0')!.stun, POWER.frostTime);
});

test('jump pads throw you across the river; the river and fences are not walkable land', () => {
  const m = live(1); const pad = FIELD.pads[0];
  at(m, 'me', pad.x, pad.z); let ev = stepMatch(m, .05); assert.ok(ev.some(e => e.kind === 'jump'));
  ev = []; for (let i = 0; i < 12; i++) ev.push(...stepMatch(m, .1));
  assert.ok(ev.some(e => e.kind === 'land')); const me = player(m, 'me')!; assert.deepEqual([me.x, me.z], [pad.tx, pad.tz]);
  assert.equal(onLand(0, 8), false); assert.equal(onLand(0, 0), true); assert.equal(onLand(0, 17), true); assert.equal(onLand(-20, 5), true);
  const obs = fieldObstacles(); assert.ok(obs.some(o => o.x === 0 && Math.abs(o.z - 8) < 1)); assert.ok(!obs.some(o => o.x === 0 && Math.abs(o.z) < 2));
});

test('the explorer’s hits land as a level-8 hero’s; bots fight with their kit; damage never hits teammates', () => {
  const m = live(1), r = player(m, 'r0')!;
  at(m, 'r0', 1, 0); at(m, 'me', 0, 0);
  const lost = playerHit(m, 'me', 'r0', 2); assert.ok(lost > 100 && lost < 400, String(lost));
  assert.equal(playerHit(m, 'b1', 'me', 2), 0);
  r.atkCd = 0; assert.ok(basicAttack(m, 'r0', 'me')); assert.equal(basicAttack(m, 'r0', 'me'), false, 'attack cooldown');
  r.cds[0] = 0; assert.ok(castAi(m, 'r0', 0, 0, 0)); assert.ok(r.cds[0] > 0);
  assert.equal(movePlayer(m, 'r0', 3, 3), true);
});

test('AI: jobs follow the board (carrier, return, chase, defend, attack) and paths cross by a bridge or a pad', () => {
  const m = live(3);
  let roles = assignRoles(m, 1); assert.deepEqual(Object.values(roles).sort(), ['attack', 'attack', 'defend']);
  at(m, 'r2', stand(0).x, stand(0).z); stepMatch(m, .05); roles = assignRoles(m, 1); assert.equal(roles.r2, 'carry');
  roles = assignRoles(m, 0); assert.equal(Object.values(roles).filter(r => r === 'chase').length, 2);
  hurt(m, 'r2', 1e6, 'me'); stepMatch(m, .05); roles = assignRoles(m, 0); assert.ok(Object.values(roles).includes('return'));
  // A path from the blue side to the red flag goes to a crossing first.
  const wp = routeTo({ x: -20, z: 5 }, stand(1), 0); assert.ok(Math.abs(wp.x) <= 9 && wp.x < 0, JSON.stringify(wp));
  const plan = planBot(m, 'r0', 'attack'); assert.ok(plan.move);
  assert.deepEqual(pickHeroes(5, ['dz_knight'], () => .5).length, 5);
  assert.equal(new Set(pickHeroes(5, ['dz_knight'], (() => { let i = 0; return () => (i++ % 7) / 7; })())).size, 5);
});

test('bots play whole matches on their own, the same way every time for a seed, and the state survives JSON', () => {
  const sim = (size: number, seed: number, clone = false) => {
    const all: RosterEntry[] = roster(size).map(r => ({ ...r, human: false }));
    let m = createMatch({ id: 'sim', seed, size, roster: all }); const minds = newMinds(), obs = fieldObstacles();
    for (let i = 0; i < 12000 && m.phase !== 'over'; i++) { stepBots(m, .05, minds, obs); stepMatch(m, .05); if (clone && i === 3000) m = JSON.parse(JSON.stringify(m)); }
    return m;
  };
  const a = sim(2, 4), b = sim(2, 4), c = sim(2, 4, true);
  assert.equal(a.phase, 'over'); assert.deepEqual(a.score, b.score); assert.deepEqual(a.result, b.result); assert.deepEqual(c.result, a.result);
  assert.ok(a.score[0] + a.score[1] >= 1, 'somebody scores');
  assert.ok(a.players.some(p => p.stats.downs > 0), 'they fight');
});

test('rewards: winners get the big share; a claim pays once, never faster than played, twelve a day', () => {
  assert.ok(matchXp({ won: true, draw: false, caps: 0, rets: 0, kills: 0, size: 1 }) > matchXp({ won: false, draw: true, caps: 0, rets: 0, kills: 0, size: 1 }));
  assert.equal(matchXp({ won: false, draw: false, caps: 0, rets: 0, kills: 0, size: 3 }), 0);
  assert.ok(matchXp({ won: false, draw: false, caps: 1, rets: 1, kills: 0, size: 1 }) > 0);
  const m = live(1); at(m, 'me', stand(1).x, stand(1).z); stepMatch(m, .05); at(m, 'me', stand(0).x, stand(0).z); stepMatch(m, .05); forfeit(m, 1);
  assert.equal(m.result!.winner, 0); assert.equal(rewardFor(m, 'me'), matchXp({ won: true, draw: false, caps: 1, rets: 0, kills: 0, size: 1 })); assert.equal(rewardFor(m, 'r0'), 0);
  const s = M.newGame('Tester'), now = Date.UTC(2026, 9, 9, 3), claim = { matchId: 'match-1', won: true, draw: false, caps: 1, rets: 0, kills: 2, size: 3, seconds: 300 };
  const xpBefore = s.xp + s.level * 1e6;
  const r = claimMatch(s, claim, now); assert.ok(r && r.xp > 0); assert.ok(s.xp + s.level * 1e6 > xpBefore);
  assert.equal(claimMatch(s, claim, now + 600_000), false, 'once per match');
  assert.equal(claimMatch(s, { ...claim, matchId: 'match-2' }, now + 60_000), false, 'not faster than the match');
  assert.equal(claimMatch(s, { ...claim, matchId: 'short', seconds: 20 }, now + 600_000), false, 'too short');
  assert.equal(claimMatch(s, { ...claim, matchId: 'odd', size: 4 }, now + 600_000), false);
  let t0 = now; for (let i = 2; i <= 13; i++) { t0 += 400_000; const k = claimMatch(s, { ...claim, matchId: 'match-' + i }, t0); assert.ok(k); if (i <= 12) assert.ok(k.xp > 0, 'match ' + i); else assert.equal(k.xp, 0, 'thirteenth is unpaid'); }
  assert.equal(rewardedLeft(s, t0), 0); assert.equal(rewardedLeft(s, t0 + 86_400_000), CTF_REWARD.perDay);
  assert.equal(s.ctf!.day, ctfDay(now)); assert.equal(s.ctf!.played, 13);
  // The answer is the EXP itself (not levels), also when no level is gained.
  const big = M.newGame('Veteran'); big.level = 40; const paid = claimMatch(big, { ...claim, matchId: 'vet-1' }, now);
  assert.ok(paid && paid.xp >= matchXp(claim) && Math.abs(big.xp - paid.xp) < 1, JSON.stringify(paid));
  // The save keeps it, and rubbish is dropped.
  const back = M.parseSave(JSON.stringify(s)); assert.deepEqual(back?.ctf, s.ctf);
  assert.equal(parseCtf('nope'), undefined); assert.deepEqual(parseCtf({ day: '2026-10-09', rewarded: 2, played: 3, wins: 1, lastAt: 5, claimed: ['ok-id', 1, '<bad>'] })?.claimed, ['ok-id']);
});

test('every Flag Rush line has Vietnamese', () => {
  setLanguage('vi');
  try {
    for (const key of ['Multiworld Gate', 'Flag Rush', 'Online — coming soon', 'GOLDEN POINT — the next capture wins!', 'Zippy Boots', 'Guardian']) assert.notEqual(t(key), key, key);
    assert.equal(t('Respawning in {s}s', { s: 4 }), 'Hồi sinh sau 4 giây');
    for (const [en, vi] of Object.entries(CTF_VI)) assert.ok(vi && vi !== en || /EXP/.test(en), en);
  } finally { setLanguage('en'); }
});
