import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as M from '../src/model.ts';
import { applyGameAction, ACTION_RULES_VERSION } from '../src/actions.ts';
import { huntingPonds, huntFish, parseHunting, FISH_HUNT_COOLDOWN_MS } from '../src/fish-hunting.ts';
import { GUARDIAN_COOLDOWN_MS, GUARDIAN_CYCLE_MS, GUARDIAN_HIT_RADIUS, GUARDIAN_ID, GUARDIAN_POND, GUARDIAN_SLOT, GUARDIAN_STIR_MS, GUARDIAN_UP_MS, guardianPhase, guardianPose, guardianReady, guardianTarget, nextGuardianRise } from '../src/lake-guardian.ts';
import { fishLook } from '../src/fishing-view.ts';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService } from '../server/action-service.mjs';

const lake = huntingPonds('home').find(p => p.id === GUARDIAN_POND);
/** A shore point on the guardian's side of the lake (the harpoon reaches 11 m; the lake is 22 m across). */
const shoreFor = now => { const g = guardianPose(lake, now), dx = g.x - lake.x, dz = g.z - lake.z, d = Math.hypot(dx, dz); return { x: lake.x + dx / d * (lake.rx + .6), z: lake.z + dz / d * (lake.rz + .6) }; };
const T0 = 1_800_000_000_000, UP = nextGuardianRise(T0) + 10_000, shore = shoreFor(UP);
const game = () => { const s = M.newGame(); s.bag.harpoon = 1; s.gear.weapon = 'harpoon'; return s; };
const shot = (now, aim = guardianTarget(lake, now)) => ({ weaponId: 'harpoon', pondId: lake.id, slot: GUARDIAN_SLOT, aim: { x: aim.x, z: aim.z } });

test('it lives in the biggest home water, surfaces about a third of the time on a shared clock, and never leaves the lake', () => {
  const home = huntingPonds('home'); assert.equal(lake.rx, Math.max(...home.map(p => p.rx)), 'the biggest home pond'); assert.equal(lake.waterId, 'lake');
  let up = 0, stir = 0; const step = 1000, span = GUARDIAN_CYCLE_MS * 40;
  for (let t = T0; t < T0 + span; t += step) { const p = guardianPhase(t); if (p.phase === 'up') up++; if (p.phase === 'stir') stir++; assert.ok(p.rise >= 0 && p.rise <= 1); }
  assert.ok(Math.abs(up * step / span - GUARDIAN_UP_MS / GUARDIAN_CYCLE_MS) < .01, 'up 2 of every 6 minutes'); assert.ok(Math.abs(stir * step / span - GUARDIAN_STIR_MS / GUARDIAN_CYCLE_MS) < .01, 'the water stirs first');
  assert.equal(guardianPhase(nextGuardianRise(T0)).phase, 'up'); assert.ok(nextGuardianRise(T0) >= T0 && nextGuardianRise(T0) - T0 < 2 * GUARDIAN_CYCLE_MS);
  for (let t = T0; t < T0 + GUARDIAN_CYCLE_MS * 3; t += 777) { const g = guardianPose(lake, t); assert.ok(Math.hypot((g.x - lake.x) / lake.rx, (g.z - lake.z) / lake.rz) < .62); assert.ok(Number.isFinite(g.facing)); }
  assert.deepEqual(guardianPose(lake, UP), guardianPose(lake, UP), 'deterministic'); assert.ok(guardianTarget(lake, UP)); assert.equal(guardianTarget(home[1], UP), null, 'only in its own lake');
  for (const t of [NaN, -1, Infinity]) assert.equal(guardianPhase(t).phase, 'deep');
});

test('harpoon only: no rod table or ordinary hunting slot can roll it, and other weapons cannot throw at it', () => {
  for (const [water, list] of Object.entries(M.FISH_WEIGHTS)) assert.ok(!list.some(([id]) => id === GUARDIAN_ID), water);
  for (let n = 0; n < 50; n++) assert.notEqual(M.chooseFish(game(), 'lake', () => n / 50), GUARDIAN_ID);
  for (const condition of ['bow', 'unequipped', 'disguise', 'deep', 'other lake', 'far', 'off water']) {
    const s = game(); let now = UP, from = shore, intent = shot(UP);
    if (condition === 'bow') { s.bag.bow_star = 1; s.gear.weapon = intent.weaponId = 'bow_star'; } if (condition === 'unequipped') delete s.gear.weapon; if (condition === 'disguise') s.gear.disguise = 'dz_dino';
    if (condition === 'deep') { now = guardianPhase(UP).end + 1000; intent = shot(UP); } if (condition === 'other lake') intent.pondId = huntingPonds('home')[1].id;
    if (condition === 'far') from = { x: lake.x + (shore.x - lake.x) * 1.8, z: lake.z + (shore.z - lake.z) * 1.8 }; if (condition === 'off water') intent.aim = { x: lake.x + lake.rx * 2, z: lake.z };
    const before = structuredClone(s); assert.equal(huntFish(s, intent, from, now), null, condition); assert.deepEqual(s, before, condition);
  }
});

test('a hit grants it through the normal catch rules (fish log, XP, journal); a miss costs only the throw cooldown', () => {
  const s = game(), target = guardianTarget(lake, UP);
  const miss = huntFish(s, shot(UP, { x: target.x + GUARDIAN_HIT_RADIUS + .3, z: target.z }), shore, UP); assert.equal(miss.hit, false); assert.equal(miss.id, GUARDIAN_ID); assert.equal(s.bag[GUARDIAN_ID], undefined); assert.equal(s.hunting.guardianAt, undefined);
  assert.equal(huntFish(s, shot(UP + 500), shore, UP + 500), null, 'the 1.3 s throw cooldown still applies');
  const at = UP + FISH_HUNT_COOLDOWN_MS, before = structuredClone(s), result = huntFish(s, shot(at, { x: guardianTarget(lake, at).x + GUARDIAN_HIT_RADIUS * .9, z: guardianTarget(lake, at).z }), shore, at);
  assert.equal(result.hit, true); assert.equal(result.slot, GUARDIAN_SLOT); assert.equal(result.readyAt, at + GUARDIAN_COOLDOWN_MS); assert.equal(s.bag[GUARDIAN_ID], 1); assert.equal(s.hunting.guardianAt, at);
  const manual = structuredClone(before); M.grantCatch(manual, GUARDIAN_ID, result.size, false);
  assert.ok(result.size >= 180 && result.size <= 260); assert.equal(s.fishRecords[GUARDIAN_ID], result.size); assert.deepEqual([s.xp, s.level], [manual.xp, manual.level]); assert.deepEqual(s.progression, manual.progression);
  assert.equal(s.counters.fish, before.counters.fish + 1);
  assert.equal(M.FISH[GUARDIAN_ID].rarity, 'legendary'); assert.equal(M.ITEMS[GUARDIAN_ID].sell, 450); assert.equal(M.ITEMS[GUARDIAN_ID].type, 'fish');
});

test('one per explorer every 20 hours, and the lock survives saves, future clocks and the offline action route', t => {
  let s = game(), at = UP; const intent = () => shot(at); t.mock.method(Date, 'now', () => at);
  assert.equal(applyGameAction(s, { type: 'fishHunt', payload: { ...intent(), from: shore } }, { now: at, random: () => .5 }).hit, true);
  s = M.parseSave(JSON.stringify(s)); assert.equal(s.hunting.guardianAt, at); assert.equal(guardianReady(s.hunting, at + GUARDIAN_COOLDOWN_MS - 1), false);
  // Every up window in the next 20 h: still gone for this explorer (the client also stops offering it as a target).
  for (let t = nextGuardianRise(at + GUARDIAN_CYCLE_MS) + 5000, n = 0; t < at + GUARDIAN_COOLDOWN_MS - GUARDIAN_UP_MS; t = nextGuardianRise(t + GUARDIAN_CYCLE_MS) + 5000, n++) {
    if (n % 25) continue; assert.equal(guardianTarget(lake, t, s.hunting), null); assert.equal(huntFish(s, shot(t, guardianPose(lake, t)), shoreFor(t), t), null);
  }
  const later = nextGuardianRise(at + GUARDIAN_COOLDOWN_MS) + 5000; assert.equal(huntFish(s, shot(later), shoreFor(later), later).hit, true, 'the next day it comes back'); assert.equal(s.bag[GUARDIAN_ID], 2);
  // A stamp in the future (clock games) is pulled back to now, never dropped; a corrupt one is ignored.
  assert.equal(parseHunting({ lastShotAt: 0, readyAt: {}, guardianAt: T0 + 9e9 }, T0).guardianAt, T0);
  assert.equal(parseHunting({ lastShotAt: 0, readyAt: {}, guardianAt: 'x' }, T0).guardianAt, undefined);
  // Another explorer is not locked by someone else's catch.
  assert.equal(huntFish(game(), shot(UP), shore, UP).hit, true);
});

test('the server validates it like any harpoon catch: its own clock, its own pose, one award per request', async t => {
  let now = UP; t.mock.method(Date, 'now', () => now);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zoo-guardian-')), store = await createAccountStore({ dataDir: dir });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  await store.create({ id: 'alice', username: 'alice', hash: 'h', salt: 's', friends: [], requests: [], profile: game() });
  const peer = { active: true, planet: 'home', room: 'public:home', visit: null, pose: { ...shore } }, execute = createActionService({ store, getPeer: () => peer });
  const command = async (payload, requestId = randomUUID()) => execute('alice', { rulesVersion: ACTION_RULES_VERSION, requestId, expectedRevision: (await store.get('alice')).profileRevision || 0, type: 'fishHunt', payload });
  // A client claiming a far-off position, or aiming at a guardian that is not up on the server's clock, is refused.
  peer.pose = { x: lake.x + 40, z: lake.z }; await assert.rejects(command({ ...shot(UP), from: shore }), e => e.status === 409); peer.pose = { ...shore };
  now = guardianPhase(UP).end + 1; await assert.rejects(command({ ...shot(UP), from: shore }), e => e.status === 409); now = UP;
  const id = randomUUID(), first = await command({ ...shot(UP), from: shore }, id); assert.equal(first.result.hit, true); assert.equal(first.result.id, GUARDIAN_ID); assert.equal(first.profile.bag[GUARDIAN_ID], 1);
  const replay = await command({ ...shot(UP), from: shore }, id); assert.equal(replay.replayed, true); assert.equal(replay.profile.bag[GUARDIAN_ID], 1);
  now = UP + 60_000; peer.pose = shoreFor(now); await assert.rejects(command({ ...shot(now, guardianPose(lake, now)), from: shoreFor(now) }), e => e.status === 409, 'caught today on the server');
  assert.equal((await store.get('alice')).profile.bag[GUARDIAN_ID], 1);
});

test('collection log, original Blender art and the fish look table agree', () => {
  assert.ok(Object.keys(M.FISH).includes(GUARDIAN_ID), 'listed in the journal fish log (main.ts quests: every FISH entry)');
  assert.ok(existsSync(new URL('../public/assets/icons/fish/fish_guardian.webp', import.meta.url)));
  const manifest = JSON.parse(readFileSync(new URL('../art/asset-manifest.json', import.meta.url), 'utf8')).fish.models.fish[GUARDIAN_ID];
  assert.deepEqual(fishLook(GUARDIAN_ID), [manifest.display_scale, manifest.body_top, manifest.wag]); assert.ok(manifest.triangles.total <= 450);
  assert.ok(readFileSync(new URL('../art/blender/kit/build_fish.py', import.meta.url), 'utf8').includes('def build_guardian'));
});
