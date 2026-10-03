import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createAccountStore } from '../server/account-store.mjs';
import { createGameServer } from '../server/server.mjs';

function connect(url, cookie) {
  const socket = new WebSocket(url.replace('http:', 'ws:') + '/socket', { headers: { Cookie: cookie } }), queue = [], waiters = [];
  socket.on('message', raw => {
    const value = JSON.parse(raw.toString()), at = waiters.findIndex(w => w.predicate(value));
    if (at === -1) queue.push(value); else { const waiter = waiters.splice(at, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(value); }
  });
  return { socket, send: value => socket.send(JSON.stringify(value)), next(predicate) {
    const at = queue.findIndex(predicate); if (at !== -1) return Promise.resolve(queue.splice(at, 1)[0]);
    return new Promise((resolve, reject) => { const waiter = { predicate, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(new Error('Missing hunting WebSocket event')); }, 5000) }; waiters.push(waiter); });
  } };
}

test('the server validates look purchases and the whole combination reaches other explorers in their presence', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cute-game-looks-network-')), clients = [];
  const store = await createAccountStore({ dataDir, databaseUrl: '' });
  const server = await createGameServer({ host: '127.0.0.1', port: 0, dataDir, accountStore: store, databaseUrl: '', databaseRequired: false });
  t.after(async () => { for (const client of clients) client.socket.terminate(); await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  async function call(cookie, route, body) {
    const response = await fetch(`${server.url}/api/${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function action(client, type, payload) {
    const session = await call(client.cookie, 'auth/session');
    return call(client.cookie, 'actions', { type, payload, requestId: randomUUID(), rulesVersion: 1, expectedRevision: session.data.revision });
  }
  async function explorer(username) {
    const session = await call(null, 'auth/register', { username, password: 'Local-looks-test-123', name: username }); assert.equal(session.status, 200);
    const id = session.data.account.id, client = { id, cookie: session.cookie };
    await store.command({ actorId: id, requestId: randomUUID(), expectedRevision: session.data.revision, actionType: 'testSetup', hash: 'a'.repeat(64), run: records => { records.get(id).profile.energy = 500; return true; } });
    Object.assign(client, connect(server.url, client.cookie)); clients.push(client); client.joined = await client.next(m => m.type === 'joined');
    return client;
  }
  const ann = await explorer('look_ann'), ben = await explorer('look_ben');
  assert.equal(ben.joined.players.find(p => p.id === ann.id).look, 'boy-chibi-none-bare');
  assert.notEqual((await action(ann, 'wearLook', { id: 'girl-tall-none-bare' })).status, 200, 'an unowned height cannot be worn');
  assert.notEqual((await action(ann, 'buyLook', { id: 'boy-huge-none-bare' })).status, 200, 'an unknown option cannot be bought');
  const bought = await action(ann, 'buyLook', { id: 'slim-grown-bunny-penguin' }); assert.equal(bought.status, 200); assert.equal(bought.data.profile.looks.style, 'slim-grown-bunny-penguin'); assert.equal(bought.data.profile.energy, 500 - 160 - 150 - 120);
  ann.send({ type: 'pose', x: 1, z: 2 });
  const pose = await ben.next(m => m.type === 'pose' && m.player.id === ann.id); assert.equal(pose.player.look, 'slim-grown-bunny-penguin');
  const worn = await action(ann, 'wearLook', { id: 'boy-grown-none-bare' }); assert.equal(worn.status, 200);
  await new Promise(r => setTimeout(r, 120)); // the server keeps poses at least 65 ms apart
  ann.send({ type: 'pose', x: 1.5, z: 2 });
  assert.equal((await ben.next(m => m.type === 'pose' && m.player.id === ann.id && m.player.x === 1.5)).player.look, 'boy-grown-none-bare');
  assert.equal((await action(ann, 'wearLook', { id: 'girl-grown-bunny' })).status, 200, 'a first-builder id still works');
  assert.notEqual((await action(ann, 'wearLook', { id: 'girl-grown-bunny-tiger' })).status, 200, 'an unbought hood cannot be worn');
});
