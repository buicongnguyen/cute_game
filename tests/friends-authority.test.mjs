import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as M from '../src/model.ts';
import { ACTION_RULES_VERSION } from '../src/actions.ts';
import { cageCandidates } from '../src/cage-spots.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService } from '../server/action-service.mjs';

// Server gates for friends (wave-9 review): rescue at the cage, arrival where the server saw the explorer, home-only gear and catch-up.
const BOSS = { x: 100, z: 20 };
async function fixture(t, edit = () => {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-friends-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const profile = M.newGame('Alice'); profile.level = 20;
  M.grantDefeat(profile, 'treant', 1, true, () => .5, false); // Sprout's cage opens
  edit(profile);
  await store.create({ id: 'alice', username: 'alice', hash: 'test-hash', salt: 'test-salt', friends: [], requests: [], profile });
  const peer = { active: true, planet: 'home', room: 'public:home', visit: null, pose: { x: 0, z: 0 } };
  const world = { enemies: new Map([['home:enemy:9', { type: 'treant', boss: true, home: { ...BOSS }, x: BOSS.x, z: BOSS.z }]]) };
  const execute = createActionService({ store, getPeer: () => peer, getWorld: room => room === peer.room ? world : null });
  const command = async (type, payload = {}) => execute('alice', { rulesVersion: ACTION_RULES_VERSION, requestId: randomUUID(), expectedRevision: (await store.get('alice')).profileRevision || 0, type, payload });
  return { store, peer, command };
}

test('a rescue needs the explorer at the cage by its boss', async t => {
  const f = await fixture(t);
  await assert.rejects(f.command('rescueFriend', { id: 'sprout' }), /closer/);
  assert.equal((await f.store.get('alice')).profile.friends?.length ?? 0, 0);
  const spot = cageCandidates(BOSS.x, BOSS.z)[3]; f.peer.pose = { x: spot.x + 1, z: spot.z };
  const ok = await f.command('rescueFriend', { id: 'sprout' }); assert.equal(ok.result, true);
  await assert.rejects(f.command('rescueFriend', { id: 'clover' }), /closer/, 'no reported bear: no rescue');
});

test('friends arrive where the server last saw the explorer, not where the client says', async t => {
  const f = await fixture(t, s => { s.friends = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: {}, home: false }]; });
  f.peer.pose = { x: 80, z: 0 };
  const far = await f.command('friendsArrive', { x: 0, z: 5 }); assert.deepEqual(far.result, []);
  f.peer.pose = { x: 0, z: 5 };
  const near = await f.command('friendsArrive', { x: 500, z: 500 }); assert.deepEqual(near.result, ['sprout']);
});

test('friend gear and the garden robot catch-up only work at home', async t => {
  const f = await fixture(t, s => { s.friends = [{ id: 'sprout', role: 'garden', rescuedAt: 1, gear: {}, home: true }]; s.bag.hat_cowboy = 1; s.planet = 'ice'; });
  f.peer.planet = 'ice';
  for (const [type, payload] of [['giveFriendGear', { friend: 'sprout', id: 'hat_cowboy' }], ['takeFriendGear', { friend: 'sprout', slot: 'hat' }], ['helperCatchUp', {}]])
    await assert.rejects(f.command(type, payload), /garden/, type);
  assert.equal((await f.store.get('alice')).profile.bag.hat_cowboy, 1);
});
