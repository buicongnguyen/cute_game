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

test('friends see each other when one visits, and a gift reaches their chest', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cute-game-visit-network-')), clients = [];
  const store = await createAccountStore({ dataDir, databaseUrl: '' });
  const server = await createGameServer({ host: '127.0.0.1', port: 0, dataDir, accountStore: store, databaseUrl: '', databaseRequired: false });
  t.after(async () => { for (const client of clients) client.socket.terminate(); await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  async function call(cookie, route, body) {
    const response = await fetch(`${server.url}/api/${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function explorer(username) {
    const session = await call(null, 'auth/register', { username, password: 'Local-visit-test-123', name: username }); assert.equal(session.status, 200);
    const id = session.data.account.id, client = { id, cookie: session.cookie };
    await store.command({ actorId: id, requestId: randomUUID(), expectedRevision: session.data.revision, actionType: 'testSetup', hash: 'a'.repeat(64), run: records => { records.get(id).profile.bag.carrot = 5; return true; } });
    Object.assign(client, connect(server.url, client.cookie)); clients.push(client); client.joined = await client.next(m => m.type === 'joined');
    return client;
  }
  const ann = await explorer('visit_ann'), ben = await explorer('visit_ben');
  assert.equal((await call(ben.cookie, 'friends/request', { id: ann.id })).status, 200);
  assert.equal((await call(ann.cookie, 'friends/accept', { id: ben.id })).status, 200);
  // Ben visits Ann's garden: he sees her there, and she sees him arrive.
  ben.send({ type: 'visit', id: ann.id });
  const visit = await ben.next(m => m.type === 'visit' && m.home); assert.equal(visit.home.id, ann.id);
  const seen = await ann.next(m => (m.type === 'pose' || m.type === 'players') && JSON.stringify(m).includes(ben.id)); assert.ok(seen);
  // A gift from Ben's bag lands in Ann's chest with a note.
  const session = await call(ben.cookie, 'auth/session');
  const gift = await call(ben.cookie, 'actions', { type: 'giftFriend', payload: { ownerId: ann.id, item: 'carrot', count: 2 }, requestId: randomUUID(), rulesVersion: 1, expectedRevision: session.data.revision });
  assert.equal(gift.status, 200, JSON.stringify(gift.data));
  const annProfile = (await store.get(ann.id)).profile; assert.equal(annProfile.chest.carrot, 2); assert.equal(annProfile.awayStore.carrot, 2);
  assert.equal((await store.get(ben.id)).profile.bag.carrot, 3);
  // The guest diary lists the visit and the gift for the owner, newest first.
  const diary = (await call(ann.cookie, 'auth/session')).data.visitLog;
  assert.deepEqual(diary.map(e => e.kind), ['gift', 'visit']); assert.equal(diary[0].name, 'visit_ben'); assert.equal(diary[0].what, 'carrot');
  // A friend request can be cancelled by the one who sent it.
  const eve = await explorer('visit_eve');
  assert.equal((await call(eve.cookie, 'friends/request', { id: ann.id })).status, 200);
  assert.deepEqual((await call(eve.cookie, 'auth/session')).data.sent.map(p => p.id), [ann.id]);
  assert.equal((await call(ann.cookie, 'auth/session')).data.requests.length, 1);
  const cancelled = await call(eve.cookie, 'friends/cancel', { id: ann.id }); assert.equal(cancelled.status, 200); assert.equal(cancelled.data.sent.length, 0);
  assert.equal((await call(ann.cookie, 'auth/session')).data.requests.length, 0);
});
