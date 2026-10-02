import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as M from '../src/model.ts';
import { ACTION_RULES_VERSION } from '../src/actions.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService, commandHash } from '../server/action-service.mjs';

async function fixture(t, owned = false) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-farm-helper-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const profile = M.newGame('Alice'); profile.level = 20; profile.energy = 5000; profile.farm.built = true; profile.bag.carrot = 5;
  const at = Date.now() - 30 * 60_000, animal = M.buyAnimal(profile, 'pig', at); // a truffle is worth a carrot (auto-feed skips cheaper products)
  if (owned) profile.farm.helper = { owned: true, paused: false, autoFeed: false };
  await store.create({ id: 'alice', username: 'alice', hash: 'test-hash', salt: 'test-salt', friends: [], requests: [], profile });
  let peer = { active: true, planet: 'home', room: 'public:home', visit: null, pose: { x: 0, z: 0 } };
  const execute = createActionService({ store, getPeer: () => peer });
  const command = async (type, payload = {}, requestId = randomUUID()) => execute('alice', { rulesVersion: ACTION_RULES_VERSION, requestId, expectedRevision: (await store.get('alice')).profileRevision || 0, type, payload });
  async function edit(change) {
    const account = await store.get('alice');
    await store.command({ actorId: 'alice', requestId: randomUUID(), expectedRevision: account.profileRevision || 0, hash: commandHash({ test: randomUUID() }), actionType: 'test', run: records => { change(records.get('alice')); return true; } });
  }
  return { store, animal, command, edit, get peer() { return peer; }, set peer(value) { peer = value; } };
}

test('online farm helper purchase and catch-up use durable receipts without duplicate cost, products or meat', async t => {
  const f = await fixture(t), before = (await f.store.get('alice')).profile.energy, purchase = randomUUID();
  const bought = await f.command('buyFarmHelper', {}, purchase); assert.equal(bought.profile.energy, before - 1000); assert.equal(bought.profile.farm.helper.autoFeed, false);
  const replay = await f.command('buyFarmHelper', {}, purchase); assert.equal(replay.replayed, true); assert.equal(replay.profile.energy, before - 1000);
  // Catch-up for time away: the save sat idle for two minutes (delivery.ts CATCH_UP_IDLE_MS), so it goes to the chest.
  await f.edit(account => { account.profile.savedAt = Date.now() - 120_000; });
  const collection = randomUUID(), caught = await f.command('farmHelperCatchUp', {}, collection);
  assert.equal(caught.result.collected.length, 3); assert.equal(caught.profile.chest.truffle, 3); assert.equal(caught.profile.bag.truffle, undefined, "catch-up work is stored in the house chest"); assert.deepEqual(caught.result.fed, []);
  assert.equal((await f.command('farmHelperCatchUp', {}, collection)).profile.chest.truffle, 3);
  assert.equal((await f.command('farmHelperCatchUp')).result.collected.length, 0);
  await f.edit(account => { const a = account.profile.farm.animals[0]; a.bornAt = a.acquiredAt = Date.now() - M.ANIMAL_LIFESPAN_MS - 1000; a.cycleAt = M.adultAt(a); });
  const meatId = randomUUID(), meat = await f.command('farmHelperCollect', { uid: f.animal.uid }, meatId);
  assert.equal(meat.profile.bag.meat, 1); assert.equal(meat.profile.farm.animals.length, 0);
  assert.equal((await f.command('farmHelperCollect', { uid: f.animal.uid }, meatId)).profile.bag.meat, 1);
});

test('online helper work rejects unowned/paused commands and opt-out feeding with no persisted mutation', async t => {
  const f = await fixture(t);
  for (const type of ['farmHelperCollect', 'farmHelperFeed', 'farmHelperCatchUp']) {
    const before = await f.store.get('alice'); await assert.rejects(f.command(type, { uid: f.animal.uid })); assert.deepEqual(await f.store.get('alice'), before);
  }
  await f.command('buyFarmHelper'); await f.command('setFarmHelperPaused', { paused: true });
  for (const type of ['farmHelperCollect', 'farmHelperFeed', 'farmHelperCatchUp']) {
    const before = await f.store.get('alice'); await assert.rejects(f.command(type, { uid: f.animal.uid })); assert.deepEqual(await f.store.get('alice'), before);
  }
  await f.command('setFarmHelperPaused', { paused: false }); await f.command('farmHelperCollect', { uid: f.animal.uid });
  const before = await f.store.get('alice'); await assert.rejects(f.command('farmHelperFeed', { uid: f.animal.uid })); assert.deepEqual(await f.store.get('alice'), before);
  await f.command('setFarmHelperAutoFeed', { autoFeed: true }); const fed = await f.command('farmHelperFeed', { uid: f.animal.uid }); assert.equal(fed.profile.bag.carrot, 4);
  await assert.rejects(f.command('farmHelperFeed', { uid: f.animal.uid })); assert.equal((await f.store.get('alice')).profile.bag.carrot, 4);
});

test('visitor, away, space-flight and disconnected sessions cannot command or configure the home pen robot', async t => {
  const f = await fixture(t, true);
  const validPeer = structuredClone(f.peer);
  for (const mode of ['visitor', 'away', 'space', 'inactive', 'disconnected']) {
    f.peer = structuredClone(validPeer);
    if (mode === 'visitor') f.peer.visit = 'friend';
    if (mode === 'away') { f.peer.planet = 'ice'; await f.edit(account => { account.profile.planet = 'ice'; }); }
    if (mode === 'space') await f.edit(account => { account.journeyPaid = true; });
    if (mode === 'inactive') f.peer.active = false;
    if (mode === 'disconnected') f.peer = null;
    for (const [type, payload] of [['farmHelperCollect', { uid: f.animal.uid }], ['farmHelperCatchUp', {}], ['setFarmHelperAutoFeed', { autoFeed: true }], ['setFarmHelperPaused', { paused: true }]]) {
      const before = await f.store.get('alice'); await assert.rejects(f.command(type, payload), error => error.status === 409); assert.deepEqual(await f.store.get('alice'), before);
    }
    await f.edit(account => { account.profile.planet = 'home'; delete account.journeyPaid; });
  }
});
