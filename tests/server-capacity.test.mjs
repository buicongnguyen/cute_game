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
