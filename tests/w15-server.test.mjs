// Wave 15 review, server side: the cottage position check, the away flag without a socket, the co-op Hard bonus,
// and the offline worker's partial install.
import './support/midday-clock.mjs'; // helpers work at this hour (their breaks are tested on their own)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as M from '../src/model.ts';
import * as H from '../src/helper.ts';
import { ACTION_RULES_VERSION } from '../src/actions.ts';
import { INDOOR_Y } from '../src/house.ts';
import { activity } from '../src/house-activities.ts';
import { enemyRoster } from '../src/enemy-roster.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService } from '../server/action-service.mjs';
import { createCombatAuthority } from '../server/combat-authority.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function service(t, setup = () => {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-w15-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const profile = M.newGame('Alice'); profile.level = 30; profile.energy = 5000; profile.hp = 10; setup(profile);
  await store.create({ id: 'alice', username: 'alice', hash: 'h', salt: 's', friends: [], requests: [], profile });
  const box = { peer: null }, execute = createActionService({ store, getPeer: () => box.peer });
  const command = async (type, payload = {}) => execute('alice', { rulesVersion: ACTION_RULES_VERSION, requestId: randomUUID(), expectedRevision: (await store.get('alice')).profileRevision || 0, type, payload });
  return { store, box, command };
}

test('F. houseUse needs your own cottage: an indoor pose within reach of the thing, not a visit or the garden', async t => {
  const f = await service(t), tea = activity('tea').at;
  f.box.peer = { active: true, planet: 'home', room: 'public:home', visit: null, pose: { x: tea.x, z: tea.z, y: 0 } };
  await assert.rejects(f.command('houseUse', { id: 'tea' }), /Go inside your cottage first/, 'outdoors at the same x/z');
  f.box.peer.pose = { x: tea.x + 5, z: tea.z, y: INDOOR_Y }; await assert.rejects(f.command('houseUse', { id: 'tea' }), /Walk up to it first/);
  f.box.peer = { ...f.box.peer, visit: 'bob', pose: { x: tea.x, z: tea.z, y: INDOOR_Y } }; await assert.rejects(f.command('houseUse', { id: 'tea' }));
  f.box.peer = { ...f.box.peer, visit: null }; const r = await f.command('houseUse', { id: 'tea' });
  assert.equal(r.result.id, 'tea'); assert.ok(Math.abs(r.result.at - Date.now()) < 5000, 'the reply carries the server clock');
  f.box.peer = null; await assert.rejects(f.command('houseUse', { id: 'tea' }), /Go inside your cottage first/, 'no socket, no cottage');
});

test('Server: without a game socket the client cannot send the harvest to the chest', async t => {
  const T = Date.now(), f = await service(t, p => { H.buyHelper(p); for (const i of [0, 1]) { p.plots[i].crop = 'carrot'; p.plots[i].plantedAt = T - M.CROPS.carrot.duration - 1000 - 300000; } });
  let r = await f.command('helperHarvest', { index: 0, away: true }); assert.equal(r.profile.bag.carrot, 1); assert.equal(r.profile.chest.carrot, undefined);
  f.box.peer = { active: true, planet: 'home', room: 'public:home', visit: null, pose: { x: 40, z: 0 } };
  r = await f.command('helperHarvest', { index: 1, away: false }); assert.equal(r.profile.chest.carrot, 1, 'the server pose decides');
});

test('8. co-op: a kill pays the room\'s Hard bonus, whatever each contributor chose', async t => {
  for (const [host, killer, expected] of [['hard', 'easy', 1.15], ['easy', 'hard', 1]]) {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zoo-w15-kill-')), store = await createAccountStore({ dataDir, databaseUrl: '' });
    const make = async (id, difficulty) => { const profile = M.newGame(id); profile.settings.difficulty = difficulty; profile.level = 30; return store.create({ id, username: id, hash: 'h', salt: 's', profile, friends: [], requests: [], profileRevision: 0 }); };
    const hostAccount = await make('host', host), killerAccount = await make('killer', killer);
    const room = { id: 'public:home', members: new Set(['host', 'killer']), host: 'host', enemies: [], killed: new Set() };
    const peer = account => ({ account, active: true, visit: null, planet: 'home', room: room.id, pose: { x: -30, z: 1, facing: 0, moving: false }, socket: {} });
    const peers = new Map([['host', peer(hostAccount)], ['killer', peer(killerAccount)]]), rooms = new Map([[room.id, room]]);
    const events = [], remember = value => { const live = peers.get(value.id); if (live) live.account = value; return value; };
    const authority = createCombatAuthority({ store, peers, rooms, remember, onError: e => t.diagnostic(String(e)), send: () => {}, broadcast: (_, v) => events.push(v), onDeath: () => {} });
    const def = enemyRoster('home').find(e => e.type === 'mushroom');
    authority.acceptSnapshots(room, [{ id: def.id, type: 'mushroom', x: -30, z: 0, hp: 1 }]); const enemy = authority.state(room).enemies.get(def.id); enemy.hp = 1;
    authority.basic(peers.get('killer'), enemy.id);
    for (let i = 0; i < 100 && !events.some(e => e.type === 'defeat'); i++) await new Promise(r => setTimeout(r, 10));
    const xp = (await store.get('killer')).profile.xp;
    assert.ok(Math.abs(xp - def.xp * expected) < 1e-6, `host ${host}, killer ${killer}: ${xp} for ${def.xp} XP`);
    await authority.close(); await store.close(); await rm(dataDir, { recursive: true, force: true });
  }
});

// ---- M/N: the offline worker ---------------------------------------------------------------------------------------
const origin = 'https://garden.example';
async function build(t, files, base = '/cute_game/') {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-w15-sw-')); t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [name, value] of Object.entries(files)) { const target = path.join(dir, 'dist', name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, value); }
  const r = spawnSync(process.execPath, [path.join(root, 'server/build-offline.mjs')], { cwd: dir, encoding: 'utf8', env: { ...process.env, VITE_BASE_PATH: base } });
  assert.equal(r.status, 0, r.stderr); return readFile(path.join(dir, 'dist/sw.js'), 'utf8');
}
function storage() {
  const entries = new Map(), key = r => new URL(typeof r === 'string' ? r : r.url, origin).href;
  return { entries, async open(name) { if (!entries.has(name)) entries.set(name, new Map()); const data = entries.get(name); return {
      async add(r) { const res = await net.fetch(r); if (!res.ok) throw new TypeError('bad'); data.set(key(r), res); },
      async match(r, { ignoreSearch = false } = {}) { const want = key(r), bare = u => u.split('?')[0]; for (const [k, v] of data) if (k === want || ignoreSearch && bare(k) === bare(want)) return v.clone(); },
      async put(r, res) { data.set(key(r), res.clone()); } }; },
    async keys() { return [...entries.keys()]; }, async delete(n) { return entries.delete(n); },
    async match(r, { ignoreSearch = false } = {}) { const want = key(r), bare = u => u.split('?')[0]; for (const data of entries.values()) for (const [k, v] of data) if (k === want || ignoreSearch && bare(k) === bare(want)) return v.clone(); } };
}
const net = { calls: [], fail: () => false, async fetch(r) { const url = typeof r === 'string' ? r : r.url; net.calls.push({ url: new URL(url, origin).pathname + new URL(url, origin).search, reload: r?.cache === 'reload' }); if (net.fail(url)) throw new TypeError('Failed to fetch'); return new Response('net:' + url); } };
function worker(source, caches) {
  const listeners = new Map();
  vm.runInNewContext(source, { URL, caches, Request: class { constructor(u, i = {}) { this.url = new URL(u, origin).href; this.cache = i.cache; } }, fetch: r => net.fetch(r),
    self: { location: { origin }, skipWaiting: async () => {}, clients: { claim: async () => {}, matchAll: async () => [] }, addEventListener: (n, h) => listeners.set(n, h) } });
  return { async life(n) { let p; listeners.get(n)({ waitUntil: v => { p = v; } }); await p; },
    request(u) { let res; listeners.get('fetch')({ request: { url: new URL(u, origin).href, method: 'GET', mode: 'cors' }, respondWith: v => { res = v; } }); return res; } };
}
test('M/N. a flaky install keeps the old complete cache, copies unchanged pinned files from it, and reloads only unpinned files', async t => {
  const caches = storage(), filesA = { 'index.html': 'A', 'assets/index-AAAAAAAA.js': 'a', 'assets/models/cottage.glb': 'cottage', 'assets/models/well.glb': 'well', 'icon-192.png': 'icon' };
  const A = worker(await build(t, filesA), caches); net.fail = () => false; await A.life('install'); await A.life('activate'); const oldCache = (await caches.keys())[0];
  // B: new code, same models; on a flaky phone every model and icon fails.
  const sourceB = await build(t, { ...filesA, 'index.html': 'B', 'assets/index-BBBBBBBB.js': 'b' }); net.calls = []; net.fail = url => /\.glb|\.png/.test(url);
  const B = worker(sourceB, caches); await B.life('install'); await B.life('activate');
  assert.ok((await caches.keys()).includes(oldCache), 'the old complete cache stays until this build has every file');
  assert.ok(!net.calls.some(c => /\.glb/.test(c.url)), 'pinned models were copied from the old cache, not downloaded');
  assert.ok(net.calls.filter(c => /index\.html|\.png/.test(c.url)).every(c => c.reload), 'unpinned files still install past the HTTP cache');
  assert.ok(net.calls.filter(c => /index-BBBBBBBB/.test(c.url)).every(c => !c.reload), 'hashed files use the ordinary cache');
  // Offline: B's page gets its model (copied at install) and its icon (from the kept old cache).
  net.fail = () => true; const hash = sourceB.match(/cottage\.glb\?v=([a-f0-9]+)/)[1];
  assert.match(await (await B.request(`/cute_game/assets/models/cottage.glb?v=${hash}`)).text(), /cottage.glb/, 'review: FAILED offline before (the old copy was deleted)');
  assert.match(await (await B.request('/cute_game/icon-192.png')).text(), /icon-192\.png/);
  // A later complete install of the same build retires the old cache.
  net.fail = () => false; await B.life('install'); await B.life('activate'); assert.ok(!(await caches.keys()).includes(oldCache));
});
