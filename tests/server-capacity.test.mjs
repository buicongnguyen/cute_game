import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createAccountStore } from '../server/account-store.mjs';
import { createGameServer } from '../server/server.mjs';

test('a full server refuses new players, and rate limits count visitors by their forwarded address behind a tunnel', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cute-game-capacity-')), sockets = [];
  const store = await createAccountStore({ dataDir, databaseUrl: '' });
  const server = await createGameServer({ host: '127.0.0.1', port: 0, dataDir, accountStore: store, databaseUrl: '', databaseRequired: false, maxPlayers: 1, trustProxy: true });
  t.after(async () => { for (const s of sockets) s.terminate(); await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  const register = async (name, ip) => {
    const r = await fetch(`${server.url}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ username: name, password: 'Local-capacity-test-123', name }) });
    return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0] };
  };
  // 40 different visitors register through the same tunnel (127.0.0.1) without sharing one 30-a-minute limit.
  for (let i = 0; i < 40; i++) assert.equal((await register(`cap_user_${i}`, `203.0.113.${i + 1}`)).status, 200, `visitor ${i}`);
  const open = cookie => new Promise(resolve => {
    const s = new WebSocket(server.url.replace('http:', 'ws:') + '/socket', { headers: { Cookie: cookie } });
    sockets.push(s);
    s.on('message', () => resolve('open'));
    s.on('unexpected-response', (_request, response) => resolve(response.statusCode));
    s.on('error', () => resolve('error'));
  });
  const first = await register('cap_first', '198.51.100.1'), second = await register('cap_second', '198.51.100.2');
  assert.equal(await open(first.cookie), 'open');
  assert.equal(await open(second.cookie), 503, 'the second player is turned away while the server is full');
});

test('movement is sent as small changes, a still player sends nothing, and a full copy resyncs the rest', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cute-game-delta-')), sockets = [];
  const store = await createAccountStore({ dataDir, databaseUrl: '' });
  const server = await createGameServer({ host: '127.0.0.1', port: 0, dataDir, accountStore: store, databaseUrl: '', databaseRequired: false });
  t.after(async () => { for (const s of sockets) s.terminate(); await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  const join = async name => {
    const r = await fetch(`${server.url}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: 'Local-delta-test-123', name }) });
    const cookie = r.headers.get('set-cookie')?.split(';')[0], messages = [];
    const ws = new WebSocket(server.url.replace('http:', 'ws:') + '/socket', { headers: { Cookie: cookie } }); sockets.push(ws);
    ws.on('message', raw => messages.push(JSON.parse(raw.toString())));
    await new Promise(resolve => ws.once('message', resolve));
    return { ws, messages, id: (await r.json()).account.id };
  };
  const ann = await join('delta_ann'), ben = await join('delta_ben');
  await new Promise(resolve => setTimeout(resolve, 300));
  const poses = () => ann.messages.filter(m => m.type === 'pose' && m.player?.id === ben.id);
  const move = x => ben.ws.send(JSON.stringify({ type: 'pose', x, z: 0, facing: 1.234567, moving: true }));
  move(0.5); await new Promise(resolve => setTimeout(resolve, 120)); move(1.2); await new Promise(resolve => setTimeout(resolve, 120));
  move(1.2); await new Promise(resolve => setTimeout(resolve, 120)); // standing still: nothing to say
  await new Promise(resolve => setTimeout(resolve, 200));
  const seen = poses(); assert.ok(seen.length >= 1 && seen.length <= 3, `${seen.length} pose messages`);
  const deltas = seen.filter(m => m.delta); assert.ok(deltas.length >= 1, 'later moves are changes only');
  for (const d of deltas) { assert.ok(JSON.stringify(d).length < 160, 'a change is small'); assert.equal(d.player.name, undefined, 'unchanged fields are not repeated'); }
  assert.equal(deltas.at(-1).player.x, 1.2);
  const withFacing = seen.find(m => m.player.facing !== undefined); assert.equal(withFacing.player.facing, 1.23, 'numbers are rounded');
});

test('the health check can be read from another site (the solo page asks whether the server is on), and nothing else can', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cute-game-health-'));
  const store = await createAccountStore({ dataDir, databaseUrl: '' });
  const server = await createGameServer({ host: '127.0.0.1', port: 0, dataDir, accountStore: store, databaseUrl: '', databaseRequired: false });
  t.after(async () => { await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  const foreign = { Origin: 'https://buicongnguyen.github.io' };
  const preflight = await fetch(`${server.url}/api/health`, { method: 'OPTIONS', headers: { ...foreign, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'ngrok-skip-browser-warning' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  const health = await fetch(`${server.url}/api/health`, { headers: { ...foreign, 'ngrok-skip-browser-warning': '1' } });
  assert.equal(health.status, 200); assert.equal(health.headers.get('access-control-allow-origin'), '*'); assert.equal((await health.json()).ok, true);
  const session = await fetch(`${server.url}/api/auth/session`, { headers: foreign });
  assert.equal(session.status, 403, 'every other route still refuses a foreign origin'); assert.equal(session.headers.get('access-control-allow-origin'), null);
});

test('a player stays signed in after the server restarts, and signing out really ends the session', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cute-game-sessions-'));
  t.after(async () => { await rm(dataDir, { recursive: true, force: true }); });
  const start = async () => { const store = await createAccountStore({ dataDir, databaseUrl: '' }); return createGameServer({ host: '127.0.0.1', port: 0, dataDir, accountStore: store, databaseUrl: '', databaseRequired: false }); };
  let server = await start();
  const registered = await fetch(`${server.url}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'stay_in', password: 'abcd', name: 'Stay' }) });
  const cookie = registered.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
  assert.match(registered.headers.get('set-cookie'), /Max-Age=5184000/, 'a sign-in lasts 60 days');
  await server.close();
  server = await start(); t.after(() => server.close());
  const again = await (await fetch(`${server.url}/api/auth/session`, { headers: { Cookie: cookie } })).json();
  assert.equal(again.account?.username, 'stay_in', 'still signed in after a restart');
  const raw = await (await import('node:fs/promises')).readFile(path.join(dataDir, 'sessions.json'), 'utf8');
  assert.ok(!raw.includes(cookie.split('=')[1]), 'the file holds a hash, not the cookie value');
  await fetch(`${server.url}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.ok(!(await (await fetch(`${server.url}/api/auth/session`, { headers: { Cookie: cookie } })).json()).account, 'signed out');
});

test('a first movement packet is corrected after each WebSocket reconnect', { timeout: 10_000 }, async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cute-game-first-pose-')), sockets = [];
  const store = await createAccountStore({ dataDir, databaseUrl: '' });
  const server = await createGameServer({ host: '127.0.0.1', port: 0, dataDir, accountStore: store, databaseUrl: '', databaseRequired: false });
  t.after(async () => { for (const socket of sockets) socket.terminate(); await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  const registered = await fetch(`${server.url}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'first_pose', password: 'pose-test-password' }) });
  assert.equal(registered.status, 200);
  const cookie = registered.headers.get('set-cookie').split(';')[0];
  for (let connection = 0; connection < 2; connection++) {
    const socket = new WebSocket(server.url.replace('http:', 'ws:') + '/socket', { headers: { Cookie: cookie } }); sockets.push(socket);
    await new Promise((resolve, reject) => { socket.once('message', resolve); socket.once('error', reject); });
    const correction = new Promise(resolve => socket.on('message', raw => { const message = JSON.parse(raw.toString()); if (message.type === 'poseFix') resolve(message); }));
    socket.send(JSON.stringify({ type: 'pose', x: 140, z: 40, facing: 0, moving: true }));
    const fixed = await correction;
    assert.equal(fixed.planet, 'home'); assert.ok(Math.hypot(fixed.x, fixed.z) < 18, 'server stays at the safe arrival point');
    socket.close(); await new Promise(resolve => socket.once('close', resolve));
  }
});
