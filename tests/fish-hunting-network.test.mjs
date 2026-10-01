import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createAccountStore } from '../server/account-store.mjs';
import { createGameServer } from '../server/server.mjs';
import { huntingPonds, fishHuntTarget } from '../src/fish-hunting.ts';

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

test('two real authenticated HTTP/WebSocket clients hunt using authoritative poses and durable single-award retries', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cute-game-hunting-network-')), clients = [];
  const store = await createAccountStore({ dataDir, databaseUrl: '' });
  const server = await createGameServer({ host: '127.0.0.1', port: 0, dataDir, accountStore: store, databaseUrl: '', databaseRequired: false });
  t.after(async () => {
    for (const client of clients) client.socket.terminate(); await server.close();
    assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dataDir).startsWith('cute-game-hunting-network-'));
    await rm(dataDir, { recursive: true, force: true });
  });
  async function call(cookie, route, body) {
    const response = await fetch(`${server.url}/api/${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function action(client, type, payload, requestId = randomUUID()) {
    const session = await call(client.cookie, 'auth/session');
    return call(client.cookie, 'actions', { type, payload, requestId, rulesVersion: 1, expectedRevision: session.data.revision });
  }
  async function explorer(username) {
    const session = await call(null, 'auth/register', { username, password: 'Local-hunting-test-123', name: username }); assert.equal(session.status, 200);
    const id = session.data.account.id, cookie = session.cookie;
    // Test-only starting currency; buying and equipping then use the public actions route.
    await store.command({ actorId: id, requestId: randomUUID(), expectedRevision: session.data.revision, actionType: 'testSetup', hash: 'a'.repeat(64), run: records => { records.get(id).profile.energy = 2000; return true; } });
    const client = { id, cookie };
    const bought = await action(client, 'buy', { id: 'harpoon' }); assert.equal(bought.status, 200); assert.equal(bought.data.profile.bag.harpoon, 1); assert.equal(bought.data.profile.energy, 1350);
    const equipped = await action(client, 'equip', { id: 'harpoon' }); assert.equal(equipped.status, 200); assert.equal(equipped.data.profile.gear.weapon, 'harpoon');
    Object.assign(client, connect(server.url, cookie)); clients.push(client); client.joined = await client.next(m => m.type === 'joined');
    return client;
  }
  const alice = await explorer('hunt_alice'), bob = await explorer('hunt_bob'); assert.equal(bob.joined.players.length, 2); assert.equal(bob.joined.host, alice.id);
  const pond = huntingPonds('home')[0], shore = { x: pond.x, z: pond.z + pond.rz + .6 };
  alice.send({ type: 'pose', ...shore });
  const acceptedPose = await bob.next(m => m.type === 'pose' && m.player.id === alice.id); assert.equal(acceptedPose.player.x, shore.x); assert.equal(acceptedPose.player.z, shore.z);
  const target = fishHuntTarget(pond, 0, Date.now()), shot = { weaponId: 'harpoon', pondId: pond.id, slot: 0, aim: { x: target.x, z: target.z }, from: { x: 999, z: 999 }, id: 'fish_whale', size: 999999, huge: true }, requestId = randomUUID();
  const caught = await action(alice, 'fishHunt', shot, requestId); assert.equal(caught.status, 200); assert.equal(caught.data.result.hit, true); assert.equal(caught.data.result.id, target.id); assert.equal(caught.data.result.size, target.size); assert.equal(caught.data.result.huge, false);
  const updated = await alice.next(m => m.type === 'profile' && m.revision === caught.data.revision); assert.equal(updated.profile.bag[target.id], 1); assert.equal(updated.profile.bag.harpoon, 1);
  const replay = await action(alice, 'fishHunt', shot, requestId); assert.equal(replay.status, 200); assert.equal(replay.data.replayed, true); assert.equal(replay.data.profile.bag[target.id], 1); assert.ok(replay.data.result.serverNow >= caught.data.result.serverNow);
  const duplicate = await action(alice, 'fishHunt', shot); assert.equal(duplicate.status, 409);

  // Bob cannot borrow Alice's shore coordinates in an HTTP payload: his real socket pose is at home.
  const forged = await action(bob, 'fishHunt', { ...shot, from: shore }); assert.equal(forged.status, 409);
  assert.equal((await call(bob.cookie, 'auth/session')).data.profile.bag[target.id], undefined);
  assert.equal((await call(null, 'actions', { type: 'fishHunt', payload: shot, requestId: randomUUID(), rulesVersion: 1, expectedRevision: 0 })).status, 401);

  // His own accepted socket position unlocks only his own personal pond stock/profile.
  bob.send({ type: 'pose', ...shore }); await alice.next(m => m.type === 'pose' && m.player.id === bob.id && m.player.x === shore.x);
  const bobTarget = fishHuntTarget(pond, 0, Date.now()); const bobCatch = await action(bob, 'fishHunt', { weaponId: 'harpoon', pondId: pond.id, slot: 0, aim: { x: bobTarget.x, z: bobTarget.z }, from: shore });
  assert.equal(bobCatch.status, 200); assert.equal(bobCatch.data.result.hit, true); assert.equal(bobCatch.data.profile.bag[target.id], 1);
  const bobUpdated = await bob.next(m => m.type === 'profile' && m.revision === bobCatch.data.revision); assert.equal(bobUpdated.profile.bag[target.id], 1);
  assert.equal((await call(alice.cookie, 'auth/session')).data.profile.bag[target.id], 1, 'the other player cannot duplicate Alice’s catch');
});
