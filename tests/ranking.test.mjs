import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as M from '../src/model.ts';
import { ACTION_RULES_VERSION } from '../src/actions.ts';
import { makeCast } from '../src/bot-logic.ts';
import { weekKey, weekStart, weekEnds, addProgress, profileTotals, totalXp, rankEntries, boardReply, entryFor, soloBoard, rankingReplyKind, botTotals, advanceSoloWeek, soloWeekGains, WEEKLY_CATEGORIES, ALL_TIME_CATEGORIES } from '../src/ranking-logic.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService } from '../server/action-service.mjs';
import { createCombatAuthority } from '../server/combat-authority.mjs';
import { createRanking, noteProgress } from '../server/ranking.mjs';
import { createGameServer } from '../server/server.mjs';
import { enemyRoster } from '../src/enemy-roster.ts';

const at = text => Date.parse(text);

test('the week starts Monday 00:00 UTC, also across a year boundary', () => {
  assert.equal(weekKey(at('2026-10-05T00:00:00Z')), '2026-10-05', 'Monday midnight opens the week');
  assert.equal(weekKey(at('2026-10-04T23:59:59.999Z')), '2026-09-28', 'Sunday night still belongs to the week before');
  assert.equal(weekKey(at('2026-10-11T23:59:59Z')), '2026-10-05');
  assert.equal(weekKey(at('2026-10-08T12:00:00+07:00')), '2026-10-05', 'time zones do not matter, the week is UTC');
  // 1 January 2027 is a Friday: its week began on Monday 28 December 2026.
  assert.equal(weekKey(at('2027-01-01T08:00:00Z')), '2026-12-28');
  assert.equal(weekKey(at('2027-01-03T23:59:00Z')), '2026-12-28');
  assert.equal(weekKey(at('2027-01-04T00:00:00Z')), '2027-01-04');
  assert.equal(weekKey(at('2024-02-29T10:00:00Z')), '2024-02-26', 'a leap day');
  const now = at('2026-10-08T15:30:00Z');
  assert.equal(weekStart(now), at('2026-10-05T00:00:00Z'));
  assert.equal(weekEnds(now), at('2026-10-12T00:00:00Z'));
});

test('weekly counters add only gains and start again from zero in a new week', () => {
  const t0 = at('2026-12-30T10:00:00Z'), before = { exp: 100, harvest: 3, fish: 1, kills: 4, boss: 0 };
  let week = addProgress(undefined, before, { exp: 150, harvest: 5, fish: 1, kills: 4, boss: 1 }, t0);
  assert.deepEqual(week, { week: '2026-12-28', exp: 50, harvest: 2, fish: 0, kills: 0, boss: 1 });
  week = addProgress(week, { exp: 150, harvest: 5, fish: 1, kills: 4, boss: 1 }, { exp: 0, harvest: 0, fish: 0, kills: 0, boss: 0 }, t0);
  assert.equal(week.exp, 50, 'a reset never takes points away');
  // The first gain after the year turns over (Monday 4 Jan 2027) lands in a fresh week.
  week = addProgress(week, before, { ...before, kills: 7 }, at('2027-01-04T00:00:01Z'));
  assert.deepEqual(week, { week: '2027-01-04', exp: 0, harvest: 0, fish: 0, kills: 3, boss: 0 });
  // An old week's counters read as zero on the board.
  const p = M.newGame('Old'); assert.equal(entryFor('old', p, { week: '2026-12-28', exp: 900 }, 'weekly', 'exp', at('2027-01-05T00:00:00Z')), null);
});

test('total EXP counts every level climbed', () => {
  const p = M.newGame('A'); p.level = 3; p.xp = 7;
  assert.equal(totalXp(p), M.xpNeeded(1) + M.xpNeeded(2) + 7);
  const before = profileTotals(p); M.gainXp(p, 500, Date.now(), 1);
  assert.equal(profileTotals(p).exp - before.exp, Math.floor(500 * (1 + M.activeStats(p).xp)));
});

test('boards order by score, share ranks on ties and report the caller even outside the top', () => {
  const rows = [
    { id: 'c', name: 'C', level: 1, value: 50 }, { id: 'a', name: 'A', level: 1, value: 80 }, { id: 'b', name: 'B', level: 1, value: 50 },
    { id: 'd', name: 'D', level: 1, value: 10 }, { id: 'e', name: 'E', level: 1, value: 80 },
  ];
  const ranked = rankEntries(rows);
  assert.deepEqual(ranked.map(r => `${r.id}${r.rank}`), ['a1', 'e1', 'b3', 'c3', 'd5']);
  const reply = boardReply(ranked, 'weekly', 'kills', at('2026-10-06T00:00:00Z'), 9, 'd', 2);
  assert.deepEqual(reply.top.map(r => r.id), ['a', 'e']);
  assert.deepEqual(reply.me, { id: 'd', rank: 5, value: 10 });
  assert.equal(reply.players, 9);
  assert.deepEqual(boardReply(ranked, 'weekly', 'kills', 0, 9, 'nobody').me, { id: 'nobody', rank: null, value: 0 });
  assert.equal(boardReply(ranked, 'weekly', 'kills', 0, 9, null).me, undefined, 'no rank without a sign-in');
  // Levels tie on level and break on EXP within it.
  const lv = rankEntries([{ id: 'x', name: 'X', level: 5, value: 5, sub: 10 }, { id: 'y', name: 'Y', level: 5, value: 5, sub: 30 }]);
  assert.deepEqual(lv.map(r => `${r.id}${r.rank}`), ['y1', 'x2']);
});

async function serviceFixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-ranking-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const profile = M.newGame('Ranker'); profile.level = 5; profile.energy = 500; profile.bag.rod_basic = 1;
  for (const i of [0, 1, 2]) { const plot = profile.plots[i]; plot.crop = 'carrot'; plot.growDuration = M.CROPS.carrot.duration; plot.plantedAt = Date.now() - plot.growDuration - 60000; }
  await store.create({ id: 'ranker', username: 'ranker', hash: 'h', salt: 's', friends: [], requests: [], profile });
  const peer = { active: true, planet: 'home', room: 'public:home', visit: null, pose: { x: 0, z: 0 } };
  const execute = createActionService({ store, getPeer: () => peer, getWorld: () => null });
  const command = async (type, payload = {}) => execute('ranker', { rulesVersion: ACTION_RULES_VERSION, requestId: randomUUID(), expectedRevision: (await store.get('ranker')).profileRevision || 0, type, payload });
  return { store, command, peer };
}

test('authoritative harvests raise the weekly harvest and EXP counters on the account', async t => {
  const f = await serviceFixture(t);
  const before = (await f.store.get('ranker')).profile;
  await f.command('harvest', { index: 0 });
  let account = await f.store.get('ranker');
  assert.equal(account.ranking.week, weekKey(Date.now()));
  assert.equal(account.ranking.harvest, 1);
  assert.equal(account.ranking.exp, totalXp(account.profile) - totalXp(before));
  assert.ok(account.ranking.exp > 0);
  await f.command('harvestAll');
  account = await f.store.get('ranker');
  assert.equal(account.ranking.harvest, 3);
  assert.equal('ranking' in account.profile, false, 'counters stay out of the game profile');
  // An action that earns nothing leaves the counters as they were.
  await f.command('setHelperPaused', { paused: true }).catch(() => {});
  assert.equal((await f.store.get('ranker')).ranking.harvest, 3);
});

test('noteProgress counts catches and boss defeats from the authoritative grants', () => {
  const account = { id: 'a' }, p = M.newGame('Fisher'), now = Date.now();
  let before = structuredClone(p); M.grantCatch(p, 'fish_perch', 30); noteProgress(account, before, p, now);
  assert.equal(account.ranking.fish, 1); assert.ok(account.ranking.exp > 0);
  before = structuredClone(p); M.grantDefeat(p, 'mushroom', 10, false, () => .5); noteProgress(account, before, p, now);
  before = structuredClone(p); M.grantDefeat(p, 'gorilla', 200, true, () => .5); noteProgress(account, before, p, now);
  assert.equal(account.ranking.kills, 2, 'every defeat is a kill'); assert.equal(account.ranking.boss, 1);
  assert.equal(entryFor('a', p, null, 'all', 'big', now).value, 30);
  assert.equal(entryFor('a', p, null, 'all', 'big', now).fish, 'fish_perch');
});

test('a server combat defeat adds a kill to the weekly board', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zoo-ranking-kill-')), store = await createAccountStore({ dataDir, databaseUrl: '' });
  const profile = M.newGame(); profile.planet = 'home';
  const account = await store.create({ id: 'actor', username: 'actor', hash: 'h', salt: 's', profile, friends: [], requests: [], profileRevision: 0 });
  const peer = { account, active: true, visit: null, planet: 'home', room: 'public:home', pose: { x: -30, z: 1, facing: 0, moving: false }, socket: {} };
  const peers = new Map([['actor', peer]]), room = { id: peer.room, members: new Set(['actor']), host: 'actor', enemies: [], killed: new Set() }, rooms = new Map([[room.id, room]]);
  const events = [];
  const authority = createCombatAuthority({ store, peers, rooms, remember: value => Object.assign(account, value), send: () => {}, broadcast: (_, value) => events.push(value) });
  t.after(async () => { await authority.close(); await store.close(); await rm(dataDir, { recursive: true, force: true }); });
  const definition = enemyRoster('home').find(e => e.type === 'mushroom');
  authority.acceptSnapshots(room, [{ id: definition.id, type: 'mushroom', x: -30, z: 0, hp: 1 }]);
  const enemy = authority.state(room).enemies.get(definition.id); enemy.hp = 1;
  authority.basic(peer, enemy.id);
  for (let i = 0; i < 100 && !events.some(e => e.type === 'defeat'); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(events.some(e => e.type === 'defeat'), 'the mushroom was defeated');
  const saved = await store.get('actor');
  assert.equal(saved.ranking.kills, 1); assert.equal(saved.ranking.boss, 0); assert.ok(saved.ranking.exp > 0);
});

const account = (id, name, level, extra = {}) => { const p = M.newGame(name); p.level = level; Object.assign(p, extra.profile || {}); return { id, username: id, profile: p, ranking: extra.ranking }; };

test('the cached board orders, ties and ranks the caller, and refreshes after its time-to-live', () => {
  let now = at('2026-10-07T12:00:00Z');
  const week = weekKey(now), list = [
    account('u1', 'Ann', 12, { ranking: { week, exp: 500, harvest: 2, fish: 0, kills: 9, boss: 0 } }),
    account('u2', 'Bo', 30, { ranking: { week, exp: 900, harvest: 2, fish: 1, kills: 0, boss: 1 } }),
    account('u3', 'Cy', 8, { ranking: { week: '2026-09-28', exp: 99999, harvest: 50, fish: 50, kills: 50, boss: 5 } }),
    account('u4', 'Di', 30, { ranking: { week, exp: 100, harvest: 0, fish: 0, kills: 0, boss: 0 } }),
  ];
  list[3].profile.xp = 40; list[1].profile.xp = 10;
  const ranking = createRanking({ source: () => list.values(), ttl: 45000, clock: () => now });
  const exp = ranking.query({ board: 'weekly', cat: 'exp', meId: 'u3' });
  assert.deepEqual(exp.top.map(r => [r.id, r.rank, r.value]), [['u2', 1, 900], ['u1', 2, 500], ['u4', 3, 100]]);
  assert.deepEqual(exp.me, { id: 'u3', rank: null, value: 0 }, 'last week counts for nothing');
  assert.equal(exp.players, 4); assert.equal(exp.week, week);
  const harvest = ranking.query({ board: 'weekly', cat: 'harvest', meId: 'u2' });
  assert.deepEqual(harvest.top.map(r => [r.id, r.rank]), [['u1', 1], ['u2', 1]], 'a tie shares the rank');
  const level = ranking.query({ board: 'all', cat: 'level', meId: 'u2' });
  assert.deepEqual(level.top.map(r => r.id).slice(0, 2), ['u4', 'u2'], 'equal levels are split by EXP');
  assert.equal(level.me.rank, 2);
  assert.throws(() => ranking.query({ board: 'weekly', cat: 'level' }), /category/);
  assert.throws(() => ranking.query({ board: 'monthly' }), /weekly or all-time/);
  // Cached: a change shows only after the time-to-live.
  list[3].ranking.exp = 5000;
  assert.equal(ranking.query({ board: 'weekly', cat: 'exp' }).top[0].id, 'u2');
  now += 46000;
  assert.equal(ranking.query({ board: 'weekly', cat: 'exp' }).top[0].id, 'u4');
});

test('the board handles thousands of accounts and keeps the top 50', () => {
  const now = at('2026-10-07T12:00:00Z'), week = weekKey(now);
  const list = Array.from({ length: 3000 }, (_, i) => account(`id${String(i).padStart(4, '0')}`, `P${i}`, 1 + (i % 60), { ranking: { week, exp: i * 7 % 1013, harvest: i % 17, fish: 0, kills: i, boss: 0 } }));
  const ranking = createRanking({ source: () => list, clock: () => now });
  const started = performance.now(), reply = ranking.query({ board: 'weekly', cat: 'kills', meId: 'id0005' });
  assert.ok(performance.now() - started < 2000, 'one refresh stays quick');
  assert.equal(reply.top.length, 50); assert.equal(reply.top[0].id, 'id2999');
  assert.equal(reply.me.rank, 2995); assert.equal(reply.players, 3000);
});

test('GET /api/ranking works signed out and signed in, and stays same-origin', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zoo-ranking-http-'));
  const game = await createGameServer({ port: 0, dataDir, databaseUrl: '', databaseRequired: false, rankingTtl: 0 });
  try {
    const anonymous = await fetch(game.url + '/api/ranking?board=weekly&cat=exp');
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.headers.get('access-control-allow-origin'), null, 'no cross-origin access');
    assert.equal(rankingReplyKind(anonymous.status, anonymous.headers.get('content-type')), 'json', 'the real server answers JSON');
    const body = await anonymous.json(); assert.deepEqual(body.top, []); assert.equal(body.me, undefined);
    const registered = await fetch(game.url + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'ranky', password: 'password-r', name: 'Ranky' }) });
    const cookie = registered.headers.get('set-cookie').split(';')[0];
    const mine = await (await fetch(game.url + '/api/ranking?board=all&cat=level', { headers: { Cookie: cookie } })).json();
    assert.equal(mine.top[0].name, 'Ranky'); assert.equal(mine.me.rank, 1); assert.equal(mine.players, 1);
    assert.equal((await fetch(game.url + '/api/ranking?board=all&cat=exp')).status, 400);
    assert.equal((await fetch(game.url + '/api/ranking', { headers: { Origin: 'https://evil.example' } })).status, 403);
    const health = await fetch(game.url + '/api/health', { headers: { Origin: 'https://buicongnguyen.github.io' } });
    assert.equal(health.headers.get('access-control-allow-origin'), '*', 'health stays public');
  } finally { await game.close(); await rm(dataDir, { recursive: true, force: true }); }
});

test('the solo board is the player and the neighbours, the same for the same seed and moment', () => {
  const now = at('2026-10-08T09:00:00Z'), cast = makeCast(1234, 5), p = M.newGame('Me'); p.level = 14; p.counters.kills = 40;
  const gains = { exp: 300, harvest: 4, fish: 2, kills: 6, boss: 0 };
  for (const [board, cats] of [['weekly', WEEKLY_CATEGORIES], ['all', ALL_TIME_CATEGORIES]]) for (const cat of cats) {
    const a = soloBoard(p, gains, cast, 1234, board, cat, now), b = soloBoard(p, gains, cast, 1234, board, cat, now);
    assert.deepEqual(a, b, `${board}/${cat} is deterministic`);
    assert.ok(a.top.length >= 5, `${board}/${cat} is never empty`); assert.equal(a.players, 6); assert.equal(a.solo, true);
    for (let i = 1; i < a.top.length; i++) assert.ok(a.top[i - 1].value >= a.top[i].value);
  }
  assert.notDeepEqual(soloBoard(p, gains, cast, 1234, 'weekly', 'exp', now).top, soloBoard(p, gains, makeCast(99, 5), 99, 'weekly', 'exp', now).top);
  const level = soloBoard(p, gains, cast, 1234, 'all', 'level', now);
  assert.equal(level.top.find(r => r.id === 'me').value, 14); assert.equal(level.me.rank, level.top.find(r => r.id === 'me').rank);
  // Neighbours grow slowly: more by the end of the week, more all-time a month later, never less.
  const rich = cast.find(d => d.tier === 'rich'), monday = botTotals(rich, 1234, at('2026-10-05T01:00:00Z')), sunday = botTotals(rich, 1234, at('2026-10-11T23:00:00Z'));
  for (const key of WEEKLY_CATEGORIES) assert.ok(sunday.weekly[key] >= monday.weekly[key]);
  const later = botTotals(rich, 1234, at('2026-11-08T09:00:00Z')), nowStats = botTotals(rich, 1234, now);
  for (const key of WEEKLY_CATEGORIES) assert.ok(later.allTime[key] >= nowStats.allTime[key]);
  assert.ok(later.allTime.kills > nowStats.allTime.kills); assert.equal(later.level, rich.level, 'levels match the neighbours list');
  // A player with no catch is listed with a zero but has no rank; neighbours' fish fit their species.
  const big = soloBoard(p, gains, cast, 1234, 'all', 'big', now);
  assert.equal(big.me.rank, null); assert.equal(big.top.find(r => r.id === 'me').value, 0);
  for (const row of big.top.filter(r => r.bot)) { const [lo, hi] = M.FISH[row.fish].size; assert.ok(row.value >= lo && row.value <= hi, `${row.fish} ${row.value}`); }
  const newcomer = { id: 'bot:x', level: 3, tier: 'new' };
  assert.ok(botTotals(rich, 1234, now).allTime.exp > botTotals(newcomer, 1234, now).allTime.exp, 'rich neighbours have played more');
});

test('the solo week keeps a base from the start of the week and rolls it on Monday', () => {
  const tue = at('2026-12-29T10:00:00Z'), mk = (exp, kills) => ({ exp, harvest: 0, fish: 0, kills, boss: 0 });
  let s = advanceSoloWeek(null, mk(100, 5), tue);
  assert.deepEqual(soloWeekGains(s, mk(100, 5)), mk(0, 0));
  s = advanceSoloWeek(s, mk(180, 9), tue + 3600e3);
  assert.deepEqual(soloWeekGains(s, mk(180, 9)), mk(80, 4));
  // The next week starts from the totals last seen, so what was earned after that counts for the new week.
  s = advanceSoloWeek(s, mk(200, 12), at('2027-01-05T10:00:00Z'));
  assert.equal(s.week, '2027-01-04'); assert.deepEqual(soloWeekGains(s, mk(200, 12)), mk(20, 3));
  // A new game (totals fell) restarts the week's base.
  s = advanceSoloWeek(s, mk(10, 0), at('2027-01-05T11:00:00Z'));
  assert.deepEqual(soloWeekGains(s, mk(10, 0)), mk(0, 0));
});

test('with no game server behind the page (Vite dev server, static host) the board falls back to the neighbourhood', () => {
  assert.equal(rankingReplyKind(200, 'text/html'), 'absent', 'the dev server answers /api/* with index.html');
  assert.equal(rankingReplyKind(404, 'text/plain'), 'absent'); assert.equal(rankingReplyKind(404, null), 'absent'); assert.equal(rankingReplyKind(405, null), 'absent');
  assert.equal(rankingReplyKind(200, 'application/json; charset=utf-8'), 'json');
  assert.equal(rankingReplyKind(500, 'text/plain'), 'down', 'the dev server proxy with no game server on :8787'); assert.equal(rankingReplyKind(502, 'text/html'), 'down');
  assert.equal(rankingReplyKind(500, 'application/json'), 'error', 'the game server failing offers a retry'); assert.equal(rankingReplyKind(400, 'application/json'), 'error');
});
