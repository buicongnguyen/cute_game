import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as M from '../src/model.ts';
import { ACTION_RULES_VERSION } from '../src/actions.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService } from '../server/action-service.mjs';

// Online, the server owns the bag slots and the dropped bags: the same rules as offline, checked at the server's pose.
const FILLER = Object.keys(M.ITEMS).filter(id => !M.ITEMS[id].slot && !['carrot', 'radish', 'leather', 'tusk', 'starshard'].includes(id) && !/^(deco_|pet_)/.test(id) && M.ITEMS[id].type !== 'placeable');
// Sizes come from the storage table, not the reference's numbers (the owner chose roomier storage).
const BAG = M.STORAGE.bag, CHEST = M.STORAGE.chest;
assert.ok(FILLER.length >= Math.max(BAG.base, CHEST.base), `enough real item ids to fill the storage (${FILLER.length})`);
async function fixture(t, edit = () => {}, editBob = () => {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-r3-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const alice = M.newGame('Alice'), bob = M.newGame('Bob'); edit(alice); editBob(bob);
  await store.create({ id: 'alice', username: 'alice', hash: 'h', salt: 's', friends: ['bob'], requests: [], profile: alice });
  await store.create({ id: 'bob', username: 'bob', hash: 'h', salt: 's', friends: ['alice'], requests: [], profile: bob });
  const peers = { alice: { active: true, planet: 'home', room: 'public:home', visit: null, pose: { x: 0, z: 0 } }, bob: { active: true, planet: 'home', room: 'public:home', visit: null, pose: { x: 0, z: 0 } } };
  const execute = createActionService({ store, getPeer: id => peers[id], getWorld: () => null });
  const command = async (who, type, payload = {}) => execute(who, { rulesVersion: ACTION_RULES_VERSION, requestId: randomUUID(), expectedRevision: (await store.get(who)).profileRevision || 0, type, payload });
  return { store, peers, command, profile: async who => (await store.get(who)).profile };
}

test('a dropped bag online: only its owner, standing beside it, within 24 hours', async t => {
  const now = Date.now();
  const f = await fixture(t, s => { s.deathBags = [{ id: 'b1', x: 10, z: 10, planet: 'home', items: { carrot: 3 }, at: now - 1000 }, { id: 'old', x: 0, z: 0, planet: 'home', items: { radish: 1 }, at: now - M.DEATH_BAG_MS - 1 }]; });
  await assert.rejects(f.command('alice', 'recoverBag', { id: 'b1' }), /Move closer/);
  await assert.rejects(f.command('bob', 'recoverBag', { id: 'b1' }), /That bag is not here/, 'another explorer cannot claim it');
  await assert.rejects(f.command('alice', 'recoverBag', { id: 'old' }), /That bag is not here/, 'an expired bag is gone');
  f.peers.alice.pose = { x: 11, z: 10 };
  const reply = await f.command('alice', 'recoverBag', { id: 'b1' });
  assert.deepEqual(reply.result, { id: 'b1', taken: { carrot: 3 }, left: 0 });
  const after = await f.profile('alice'); assert.equal(after.bag.carrot, 3); assert.equal(after.deathBags, undefined, 'the expired bag was cleared too');
});

test('online defeat drops a bag at the server pose; slots, expansion and gifts follow the same limits', async t => {
  const f = await fixture(t, s => { s.hp = 0; s.bag = { carrot: 2 }; s.settings.keepBagOnDeath = false; }, s => { for (const id of FILLER.slice(0, CHEST.base)) s.chest[id] = 1; });
  f.peers.alice.pose = { x: 5, z: 6 };
  assert.deepEqual((await f.command('alice', 'die', { x: 99, z: 99 })).result, { dropped: true });
  const bag = (await f.profile('alice')).deathBags[0]; assert.deepEqual([bag.x, bag.z, bag.items], [5, 6, { carrot: 2 }], 'the server pose, not the client\'s');
  // Expansion through the server.
  const g = await fixture(t, s => { s.energy = 250; Object.assign(s.bag, { leather: 8, tusk: 2, starshard: 1 }); });
  assert.equal((await g.command('alice', 'expandStorage', { kind: 'bag' })).result.size, BAG.base + BAG.add);
  const saved = await g.profile('alice'); assert.equal(saved.bagUp, 1); assert.equal(saved.energy, 50); assert.equal(saved.bag.leather, undefined);
  await assert.rejects(g.command('alice', 'expandStorage', { kind: 'bag' }), /You need 400 energy/);
  // A full backpack refuses a harvest with the clear message; a friend's full chest refuses a gift of a new kind.
  const h = await fixture(t, s => { for (const id of FILLER.slice(0, BAG.base)) s.bag[id] = 1; const p = s.plots[0]; p.crop = 'carrot'; p.plantedAt = 0; p.growDuration = 1; s.bag.radish = undefined; });
  await assert.rejects(h.command('alice', 'harvest', { index: 0 }), new RegExp(M.BAG_FULL.slice(0, 25)));
  const gift = await fixture(t, s => { s.bag.carrot = 3; }, s => { for (const id of FILLER.slice(0, CHEST.base)) s.chest[id] = 1; });
  await assert.rejects(gift.command('alice', 'giftFriend', { ownerId: 'bob', item: 'carrot', count: 1 }), /chest is full/);
  assert.equal((await gift.profile('alice')).bag.carrot, 3);
});
