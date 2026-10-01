import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as M from '../src/model.ts';
import { ACTION_RULES_VERSION } from '../src/actions.ts';
import { huntingPonds, fishHuntTarget, fishHuntKey, FISH_HUNT_COOLDOWN_MS, FISH_HUNT_RESTOCK_MS } from '../src/fish-hunting.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService, commandHash, waterNodes } from '../server/action-service.mjs';

const pond = huntingPonds('home')[0], shore = { x: pond.x, z: pond.z + pond.rz + .6 };
async function fixture(t) {
  let now = 1_800_000_000_000; t.mock.method(Date, 'now', () => now);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-fish-hunt-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const profile = M.newGame('Alice'); profile.bag.harpoon = 1; profile.gear.weapon = 'harpoon';
  await store.create({ id: 'alice', username: 'alice', hash: 'test-hash', salt: 'test-salt', friends: [], requests: [], profile });
  let peer = { active: true, planet: 'home', room: 'public:home', visit: null, pose: { ...shore } };
  const execute = createActionService({ store, getPeer: () => peer });
  const shot = (slot = 0) => ({ weaponId: 'harpoon', pondId: pond.id, slot, aim: fishHuntTarget(pond, slot, now), from: { ...shore } });
  const command = async (payload = shot(), requestId = randomUUID()) => execute('alice', { rulesVersion: ACTION_RULES_VERSION, requestId, expectedRevision: (await store.get('alice')).profileRevision || 0, type: 'fishHunt', payload });
  async function edit(change) { const account = await store.get('alice'); await store.command({ actorId: 'alice', requestId: randomUUID(), expectedRevision: account.profileRevision || 0, hash: commandHash({ test: randomUUID() }), actionType: 'test', run: records => { change(records.get('alice')); return true; } }); }
  return { store, shot, command, edit, get now() { return now; }, set now(value) { now = value; }, get peer() { return peer; }, set peer(value) { peer = value; } };
}

test('fish hunting and rod authority share exactly the same supported pond geometry', () => {
  for (const planet of ['home', 'candy', 'ice', 'toy', 'jungle', 'shadow', 'ocean', 'cloud', 'lava']) assert.deepEqual(waterNodes(planet), huntingPonds(planet).map(p => ({ x: p.x, z: p.z, r: p.rx, water: p.waterId })));
});

test('authoritative hit ignores claimed reward, commits once, and receipt replay returns a current synchronization clock', async t => {
  const f = await fixture(t), id = randomUUID(), target = f.shot(); target.id = 'fish_whale'; target.size = 999999; target.huge = true;
  const first = await f.command(target, id); assert.equal(first.result.hit, true); assert.equal(first.result.id, target.aim.id); assert.equal(first.result.size, target.aim.size); assert.equal(first.result.huge, false); assert.equal(first.result.count, 1);
  assert.equal(first.profile.bag[first.result.id], 1); assert.equal(first.profile.bag.harpoon, 1);
  f.now += 1000; const replay = await f.command(target, id); assert.equal(replay.replayed, true); assert.equal(replay.profile.bag[first.result.id], 1); assert.equal(replay.result.readyAt, first.result.readyAt); assert.equal(replay.result.shotReadyAt, first.result.shotReadyAt); assert.equal(replay.result.serverNow, f.now);
  const before = await f.store.get('alice'); await assert.rejects(f.command(f.shot(1)), error => error.status === 409); assert.deepEqual(await f.store.get('alice'), before);
  f.now = first.result.serverNow + FISH_HUNT_COOLDOWN_MS; assert.equal((await f.command(f.shot(1))).result.hit, true);
  f.now = first.result.serverNow + FISH_HUNT_RESTOCK_MS; assert.equal((await f.command()).result.hit, true);
});

test('server uses peer position, not a forged payload origin, and rejects visitor/flight/disconnected/dead/rod-cast contexts', async t => {
  const f = await fixture(t), peer = structuredClone(f.peer);
  for (const mode of ['far', 'visitor', 'flight', 'disconnected', 'inactive', 'dead', 'rod', 'unequipped', 'unowned', 'away']) {
    f.peer = structuredClone(peer);
    if (mode === 'far') f.peer.pose = { x: 1000, z: 1000 }; if (mode === 'visitor') f.peer.visit = 'friend'; if (mode === 'disconnected') f.peer = null; if (mode === 'inactive') f.peer.active = false;
    if (mode === 'flight') await f.edit(a => { a.journeyPaid = true; }); if (mode === 'dead') await f.edit(a => { a.profile.hp = 0; }); if (mode === 'rod') await f.edit(a => { a.fishingTicket = { id: 'ticket', startedAt: f.now }; }); if (mode === 'unequipped') await f.edit(a => { delete a.profile.gear.weapon; }); if (mode === 'unowned') await f.edit(a => { delete a.profile.bag.harpoon; }); if (mode === 'away') { f.peer.planet = 'ice'; await f.edit(a => { a.profile.planet = 'ice'; }); }
    const before = await f.store.get('alice'); await assert.rejects(f.command(), error => error.status === 409); assert.deepEqual(await f.store.get('alice'), before, mode);
    await f.edit(a => { delete a.journeyPaid; delete a.fishingTicket; a.profile.hp = 100; a.profile.gear.weapon = 'harpoon'; a.profile.bag.harpoon = 1; a.profile.planet = 'home'; });
  }
});

test('legal online misses spend the shot cooldown without loot, while malformed and overflowing hits preserve everything', async t => {
  const f = await fixture(t), shot = f.shot(), dx = shot.aim.x - pond.x, dz = shot.aim.z - pond.z, distance = Math.hypot(dx, dz);
  shot.aim = { x: pond.x - dx / distance * pond.rx * .9, z: pond.z - dz / distance * pond.rz * .9 };
  const missed = await f.command(shot); assert.equal(missed.result.hit, false); assert.equal(missed.result.count, 0); assert.deepEqual(missed.profile.bag, { harpoon: 1 }); assert.equal(missed.profile.hunting.lastShotAt, f.now); assert.equal(missed.profile.hunting.readyAt[fishHuntKey(pond.id, 0)], undefined);
  f.now += FISH_HUNT_COOLDOWN_MS;
  for (const payload of [{ ...f.shot(), slot: 1000 }, { ...f.shot(), pondId: '__proto__' }, { ...f.shot(), aim: { x: NaN, z: 0 } }, { ...f.shot(), aim: { x: 0, z: 0 } }]) { const before = await f.store.get('alice'); await assert.rejects(f.command(payload)); assert.deepEqual(await f.store.get('alice'), before); }
  const target = f.shot(); await f.edit(a => { a.profile.bag[target.aim.id] = Number.MAX_SAFE_INTEGER; });
  const before = await f.store.get('alice'); await assert.rejects(f.command(target)); assert.deepEqual(await f.store.get('alice'), before);
});
