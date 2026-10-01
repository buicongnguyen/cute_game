import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/server.mjs';
import { createAccountStore } from '../server/account-store.mjs';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function within(promise, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 5000);
  })]).finally(() => clearTimeout(timer));
}

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'cute-game-auth-races-'));
  const store = await createAccountStore({ dataDir: directory, databaseUrl: '' });
  const gates = [], connections = [];
  let failReads = false;
  const accountStore = {
    ...store,
    async get(id) {
      if (failReads) throw new Error('Simulated database read outage');
      // Return the actual snapshot from before the concurrent operation commits.
      const snapshot = await store.get(id);
      const gate = gates.find(value => value.id === id && !value.taken);
      if (gate) { gate.taken = true; gate.entered.resolve(); await gate.released.promise; }
      return snapshot;
    },
  };
  const app = await createGameServer({ host: '127.0.0.1', port: 0, accountStore, databaseUrl: '', databaseRequired: false });
  t.after(async () => {
    for (const gate of gates) gate.released.resolve();
    for (const connection of connections) connection.socket.terminate();
    await app.close();
    // Only remove this test's fresh temporary account directory.
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('cute-game-auth-races-'));
    await rm(directory, { recursive: true, force: true });
  });
  async function request(cookie, route, data, method = data === undefined ? 'GET' : 'POST') {
    const response = await fetch(`${app.url}/api/${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, setCookie: response.headers.get('set-cookie'), body: await response.json() };
  }
  async function register(username) {
    const result = await request(null, 'auth/register', { username, password: 'Test-only-password-123', name: username });
    assert.equal(result.status, 200);
    return { id: result.body.account.id, cookie: result.setCookie.split(';')[0], profile: result.body.profile };
  }
  async function befriend(first, second) {
    assert.equal((await request(first.cookie, 'friends/request', { id: second.id })).status, 200);
    assert.equal((await request(second.cookie, 'friends/accept', { id: first.id })).status, 200);
  }
  function delayRead(id) {
    const gate = { id, taken: false, entered: deferred(), released: deferred() }; gates.push(gate);
    return { entered: () => within(gate.entered.promise, 'database read'), release: () => gate.released.resolve() };
  }
  function connect(cookie) {
    const socket = new WebSocket(app.url.replace('http:', 'ws:') + '/socket', { headers: { cookie } });
    const messages = [], opened = deferred(), closed = deferred();
    socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
    socket.once('open', () => opened.resolve({ opened: true }));
    socket.on('error', () => opened.resolve({ opened: false }));
    socket.once('unexpected-response', (_, response) => {
      opened.resolve({ opened: false, status: response.statusCode }); response.resume(); socket.terminate();
    });
    socket.once('close', code => { opened.resolve({ opened: false }); closed.resolve(code); });
    const connection = {
      socket, messages,
      opened: () => within(opened.promise, 'WebSocket upgrade'),
      closed: () => within(closed.promise, 'WebSocket close'),
      async message(predicate, from = 0) {
        const existing = messages.slice(from).find(predicate);
        if (existing) return existing;
        let listener;
        try {
          return await within(new Promise(resolve => {
            listener = raw => { const value = JSON.parse(raw.toString()); if (predicate(value)) resolve(value); };
            socket.on('message', listener);
          }), 'WebSocket message');
        } finally { if (listener) socket.off('message', listener); }
      },
    };
    connections.push(connection); return connection;
  }
  return { url:app.url,store, request, register, befriend, delayRead, connect, failReads: value => { failReads = value; } };
}

for (const stage of ['account lookup', 'friend refresh']) {
  test(`logout during WebSocket ${stage} prevents the pending authenticated upgrade`, async t => {
    const f = await fixture(t), alice = await f.register('alice');
    let delayedId = alice.id;
    if (stage === 'friend refresh') {
      const bob = await f.register('bob'); await f.befriend(alice, bob); delayedId = bob.id;
    }
    const gate = f.delayRead(delayedId), connection = f.connect(alice.cookie);
    await gate.entered();
    assert.equal((await f.request(alice.cookie, 'auth/logout', {})).status, 200);
    gate.release();
    const upgrade = await connection.opened();
    assert.equal(upgrade.opened, false, 'a revoked session must not gain a live socket');
    assert.equal(upgrade.status, 401);
    assert.equal((await f.request(alice.cookie, 'auth/session')).body.account, null);
  });
}

test('a delayed session read cannot authenticate after concurrent logout', async t => {
  const f = await fixture(t), alice = await f.register('alice');
  const gate = f.delayRead(alice.id), pending = f.request(alice.cookie, 'auth/session');
  await gate.entered();
  assert.equal((await f.request(alice.cookie, 'auth/logout', {})).status, 200);
  gate.release();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(response.body.account, null);
});

for(const action of ['settings','friend request'])test(`logout while an authenticated ${action} body is incomplete prevents its later mutation`,async t=>{
  const f=await fixture(t),alice=await f.register('alice'),bob=await f.register('bob');
  const route=action==='settings'?'actions':'friends/request',body=JSON.stringify(action==='settings'?{type:'settings',rulesVersion:1,expectedRevision:0,requestId:'revoked-body-action-0001',payload:{name:'Changed after logout'}}:{id:bob.id});
  const gate=f.delayRead(alice.id);let finish;
  const pending=new Promise((resolve,reject)=>{
    const request=http.request(f.url+'/api/'+route,{method:'POST',headers:{Cookie:alice.cookie,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},response=>{let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(text)}));});
    request.on('error',reject);request.write(body.slice(0,1));finish=()=>request.end(body.slice(1));
  });
  await gate.entered();gate.release();assert.equal((await f.request(alice.cookie,'auth/logout',{})).status,200);finish();
  const response=await within(pending,'revoked body response');assert.equal(response.status,401);
  assert.equal((await f.store.get(alice.id)).profile.name,'alice');assert.deepEqual((await f.store.get(bob.id)).requests,[]);
});

test('a stale account read cannot restore a removed friendship or authorize a garden visit', async t => {
  const f = await fixture(t), alice = await f.register('alice'), bob = await f.register('bob');
  await f.befriend(alice, bob);
  const connection = f.connect(alice.cookie);
  assert.equal((await connection.opened()).opened, true);
  await connection.message(value => value.type === 'joined');
  const gate = f.delayRead(alice.id), pending = f.request(alice.cookie, 'auth/session');
  await gate.entered();
  const removed = await f.request(alice.cookie, 'friends/remove', { id: bob.id });
  assert.equal(removed.status, 200); assert.deepEqual(removed.body.friends, []);
  gate.release();
  const stale = await pending;
  assert.deepEqual(stale.body.friends, [], 'the older database snapshot must not roll back the live account');
  assert.deepEqual((await f.store.get(alice.id)).friends, []);
  const from = connection.messages.length;
  connection.socket.send(JSON.stringify({ type: 'visit', id: bob.id }));
  const response = await connection.message(value => value.type === 'visit' || value.type === 'error', from);
  assert.equal(response.type, 'error');
  assert.match(response.message, /friends/i);
});

test('logout revokes the session and closes its socket even while database reads fail', async t => {
  const f = await fixture(t), alice = await f.register('alice'), connection = f.connect(alice.cookie);
  assert.equal((await connection.opened()).opened, true);
  await connection.message(value => value.type === 'joined');
  f.failReads(true);
  const result = await f.request(alice.cookie, 'auth/logout', {});
  assert.equal(result.status, 200);
  assert.match(result.setCookie, /Max-Age=0/);
  assert.equal(await connection.closed(), 1000);
  const session = await f.request(alice.cookie, 'auth/session');
  assert.equal(session.status, 200);
  assert.equal(session.body.account, null);
});

test('removing a friendship ends an active garden visit and stops private home updates', async t => {
  const f = await fixture(t), alice = await f.register('alice'), bob = await f.register('bob');
  await f.befriend(alice, bob);
  const connection = f.connect(alice.cookie);
  assert.equal((await connection.opened()).opened, true);
  await connection.message(value => value.type === 'joined');
  connection.socket.send(JSON.stringify({ type: 'visit', id: bob.id }));
  await connection.message(value => value.type === 'visit' && value.home?.id === bob.id);
  const beforeRemoval = connection.messages.length;
  assert.equal((await f.request(bob.cookie, 'friends/remove', { id: alice.id })).status, 200);
  await connection.message(value => value.type === 'visit' && value.home === null, beforeRemoval);

  const afterRemoval = connection.messages.length;
  const session=await f.request(bob.cookie,'auth/session');
  const saved = await f.request(bob.cookie, 'actions', {
    type:'settings',payload:{name:'Private garden'},rulesVersion:1,expectedRevision:session.body.revision,requestId:'private-home-after-revoke-0001',
  });
  assert.equal(saved.status, 200);
  // A later WebSocket acknowledgement is an ordering barrier, not an arbitrary sleep.
  const requestId = 'revoked-visit-barrier-0001';
  connection.socket.send(JSON.stringify({ type: 'chat', requestId, message: 'Still in the shared world' }));
  await connection.message(value => value.type === 'chatAck' && value.requestId === requestId, afterRemoval);
  assert.equal(connection.messages.slice(afterRemoval).some(value => value.type === 'home'), false);
});
