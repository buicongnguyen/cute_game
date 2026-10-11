// Two pet slots over the wire (src/pet-slots.ts): the server migrates an old account, validates and replays equips of
// the second slot, refuses what the rules refuse, and other explorers get both pets in the presence they draw from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createAccountStore } from '../server/account-store.mjs';
import { createGameServer } from '../server/server.mjs';
import * as Game from '../src/model.ts';

function connect(url, cookie) {
  const socket = new WebSocket(url.replace('http:', 'ws:') + '/socket', { headers: { Cookie: cookie } }), queue = [], waiters = [];
  socket.on('message', raw => {
    const value = JSON.parse(raw.toString()), at = waiters.findIndex(w => w.predicate(value));
    if (at === -1) queue.push(value); else { const waiter = waiters.splice(at, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(value); }
  });
  return { socket, send: value => socket.send(JSON.stringify(value)), next(predicate) {
    const at = queue.findIndex(predicate); if (at !== -1) return Promise.resolve(queue.splice(at, 1)[0]);
    return new Promise((resolve, reject) => { const waiter = { predicate, resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(new Error('Missing pets WebSocket event')); }, 5000) }; waiters.push(waiter); });
  } };
}

test('online: an old account gets its dog pet, pet2 equips are validated and replayed, and others see both pets', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cute-game-pets2-network-')), clients = [];
  const store = await createAccountStore({ dataDir, databaseUrl: '' });
  const server = await createGameServer({ host: '127.0.0.1', port: 0, dataDir, accountStore: store, databaseUrl: '', databaseRequired: false });
  t.after(async () => { for (const client of clients) client.socket.terminate(); await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  async function call(cookie, route, body) {
    const response = await fetch(`${server.url}/api/${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function action(client, type, payload) {
    // The server may save on its own between the two calls (a health flush after a pose): then the revision is read again.
    for (let attempt = 0; ; attempt++) {
      const session = await call(client.cookie, 'auth/session');
      const reply = await call(client.cookie, 'actions', { type, payload, requestId: randomUUID(), rulesVersion: 1, expectedRevision: session.data.revision });
      if (attempt >= 3 || reply.status !== 409 || !/newer adventure/i.test(reply.data.error ?? '')) return reply;
    }
  }
  async function explorer(username, setup) {
    const session = await call(null, 'auth/register', { username, password: 'Local-pets-test-123', name: username }); assert.equal(session.status, 200);
    const id = session.data.account.id, client = { id, cookie: session.cookie };
    if (setup) await store.command({ actorId: id, requestId: randomUUID(), expectedRevision: session.data.revision, actionType: 'testSetup', hash: 'a'.repeat(64), run: records => { setup(records.get(id)); return true; } });
    Object.assign(client, connect(server.url, client.cookie)); clients.push(client); client.joined = await client.next(m => m.type === 'joined');
    return client;
  }
  // An account as an older build stored it: it owns the pen's guard dog, has pets in the bag, and knows no dog item or second slot.
  const ann = await explorer('pets_ann', record => {
    const s = Game.parseSave(JSON.stringify(record.profile)); s.level = 45; s.energy = 100000; s.farm.built = true; assert.ok(Game.buyAnimal(s, 'dog'));
    s.hp = Game.maxHp(s); // full health: the village's regeneration then never saves a newer revision under the test's feet
    Object.assign(s.bag, { bunny: 1, pet_parrot: 1, hat_straw: 1 });
    const old = JSON.parse(JSON.stringify(s)); delete old.bag.pet_dog; old.gear = {}; record.profile = old;
  });
  const ben = await explorer('pets_ben');
  // The server reads every stored profile through the shared parseSave, so the account is migrated as soon as it is loaded.
  const stored = (await call(ann.cookie, 'auth/session')).data.profile; assert.equal(stored.bag.pet_dog, 1); assert.deepEqual(stored.gear, { pet: 'pet_dog' }, 'the dog keeps following: worn in the free slot');

  const first = await action(ann, 'equip', { id: 'bunny' });
  assert.equal(first.status, 200); assert.equal(first.data.profile.bag.pet_dog, 1);
  assert.deepEqual(first.data.profile.gear, { pet: 'pet_dog', pet2: 'bunny' }, 'the dog took the free slot (it follows as before); the bunny the other');
  assert.deepEqual(first.data.profile, Game.parseSave(JSON.stringify(first.data.profile)), 'the client reads back exactly what the server holds');

  const swap = await action(ann, 'equip', { id: 'pet_parrot', slot: 'pet' });
  assert.equal(swap.status, 200); assert.deepEqual(swap.data.profile.gear, { pet: 'pet_parrot', pet2: 'bunny' }, 'the named slot is replaced: the dog goes home');
  assert.equal(swap.data.profile.bag.pet_dog, 1);

  for (const [type, payload, why] of [
    ['equip', { id: 'bunny', slot: 'hat' }, 'a pet in a hat slot'], ['equip', { id: 'hat_straw', slot: 'pet2' }, 'a hat in a pet slot'], ['equip', { id: 'bunny', slot: 9 }, 'a slot that is not a string'],
    ['equip', { id: 'bunny', slot: 'pet3' }, 'a third pet slot'], ['equip', { id: 'pet_sheep', slot: 'pet2' }, 'a pet that is not owned'], ['unequip', { slot: 'pet3' }, 'taking off a slot that does not exist'],
    ['sell', { id: 'pet_dog', count: 1 }, 'selling the dog'], ['transfer', { id: 'pet_dog', toChest: true, count: 1 }, 'storing the dog'], ['dropItem', { id: 'pet_dog', count: 1 }, 'dropping the dog'],
  ]) assert.notEqual((await action(ann, type, payload)).status, 200, why);
  const unchanged = (await call(ann.cookie, 'auth/session')).data.profile;
  assert.deepEqual(unchanged.gear, { pet: 'pet_parrot', pet2: 'bunny' }); assert.equal(unchanged.bag.pet_dog, 1); assert.equal(unchanged.chest.pet_dog, undefined);

  ann.send({ type: 'pose', x: 1, z: 2 });
  const pose = await ben.next(m => m.type === 'pose' && m.player.id === ann.id);
  assert.deepEqual(pose.player.gear, { pet: 'pet_parrot', pet2: 'bunny' }, 'other explorers get both pets'); assert.equal(pose.player.dog ?? null, null, 'no dog out: it is at its pen');

  const off = await action(ann, 'unequip', { slot: 'pet2' }); assert.equal(off.status, 200, JSON.stringify(off.data).slice(0, 200)); assert.deepEqual(off.data.profile.gear, { pet: 'pet_parrot' });
  const dog = await action(ann, 'equip', { id: 'pet_dog' }); assert.equal(dog.status, 200); assert.deepEqual(dog.data.profile.gear, { pet: 'pet_parrot', pet2: 'pet_dog' });
  await new Promise(r => setTimeout(r, 120)); // the server keeps poses at least 65 ms apart
  ann.send({ type: 'pose', x: 1.5, z: 2 });
  const second = await ben.next(m => m.type === 'pose' && m.player.id === ann.id && m.player.x === 1.5);
  assert.deepEqual(second.player.gear, { pet: 'pet_parrot', pet2: 'pet_dog' }); assert.equal(second.player.dog ?? null, null, 'inside the safe village even a worn dog is at its pen');
  const alone = await action(ann, 'unequip', { slot: 'pet' }); assert.equal(alone.status, 200, JSON.stringify(alone.data).slice(0, 200));
  assert.deepEqual((await action(ann, 'unequip', { slot: 'pet2' })).data.profile.gear, {}, 'both off: alone');
});
