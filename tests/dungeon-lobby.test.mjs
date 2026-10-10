// The Delvers' Vault online (server/dungeon-lobby.mjs): the circle, the countdown, the party's private room, the relay
// inside a run, and the gate on the server-validated actions (only your run; only rooms the host cleared).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Game from '../src/model.ts';
import { createDungeonLobby } from '../server/dungeon-lobby.mjs';
import { DUNGEON } from '../src/dungeon-rules.ts';

function setup() {
  const peers = new Map(), rooms = new Map(), parties = new Map(), outbox = [], joins = [];
  const send = (socket, message) => outbox.push({ to: socket.id, ...(typeof message === 'string' ? JSON.parse(message) : message) });
  const join = (peer, planet, party) => { const key = `${party || 'public'}:${planet}`; if (party && !parties.has(party)) throw new Error('no party'); peer.room = key; peer.party = party; peer.pose = { ...peer.pose, x: 0, z: 0 }; joins.push({ id: peer.account.id, key }); };
  const add = (id, x, z, extra = {}) => { const profile = Game.newGame(id); const peer = { socket: { id }, account: { id, profile }, active: true, visit: null, planet: 'home', room: 'public:home', party: null, pose: { x, z }, ...extra }; peers.set(id, peer); return peer; };
  let clock = Date.UTC(2026, 9, 6, 5);
  const lobby = createDungeonLobby({ peers, rooms, parties, join, send, arrived: () => {}, now: () => clock });
  return { peers, parties, outbox, joins, add, lobby, tick: s => { for (let t = 0; t < s; t += .25) { clock += 250; lobby.tick(.25); } } };
}
const L = DUNGEON.lobby;

test('departed players can claim only rooms cleared before they left, until the grace period ends',()=>{
  const w=setup(),a=w.add('a',L.x,L.z),b=w.add('b',L.x+1,L.z);w.tick(10.5);const run=a.dungeon;
  w.lobby.message(a,{type:'dgClear',runId:run.id,stage:0});
  w.lobby.message(b,{type:'dgLeave',runId:run.id});
  w.lobby.message(a,{type:'dgClear',runId:run.id,stage:1});
  assert.equal(w.lobby.check('b','dungeonClaim',{runId:run.id,stage:0}),true);
  assert.equal(w.lobby.check('b','dungeonClaim',{runId:run.id,stage:1}),false);
  assert.equal(w.lobby.check('b','dungeonClaim',{runId:run.id,stage:-1}),false);
  assert.equal(w.lobby.check('a','dungeonClaim',{runId:run.id,stage:1}),true);
  w.tick(121);assert.equal(w.lobby.check('b','dungeonClaim',{runId:run.id,stage:0}),false);
});

test('a delayed leave packet for an old run cannot eject a player from the current run',()=>{
  const w=setup(),a=w.add('a',L.x,L.z);w.tick(10.5);const run=a.dungeon;
  w.lobby.message(a,{type:'dgLeave',runId:'old-run'});assert.equal(a.dungeon,run);
  w.lobby.message(a,{type:'dgLeave',runId:run.id});assert.equal(a.dungeon,null);
});

test('everyone in the circle when the 10 s countdown ends goes in together (at most five), in a private room', () => {
  const w = setup();
  for (let i = 0; i < 6; i++) w.add('p' + i, L.x + (i % 3) - 1, L.z + Math.floor(i / 3));
  w.add('far', 0, 0);
  w.tick(5);
  const update = w.outbox.filter(m => m.type === 'dgLobby' && m.to === 'p0').at(-1);
  assert.equal(update.n, 5); assert.equal(update.waiting, 1); assert.ok(update.cd > 0 && update.cd <= 5); assert.equal(update.left, 6);
  assert.ok(!w.outbox.some(m => m.to === 'far'), 'only those in the circle hear the countdown');
  w.tick(5.5);
  const go = w.outbox.filter(m => m.type === 'dgGo');
  assert.equal(go.length, 5); assert.equal(new Set(go.map(m => m.runId)).size, 1); assert.equal(go[0].host, 'p0');
  for (const m of go) { assert.equal(m.you, m.to); assert.equal(m.members.length, 5); assert.ok(Math.hypot(m.spawn.x - DUNGEON.arena.x, m.spawn.z - DUNGEON.arena.z) < DUNGEON.arenaR); }
  const room = w.peers.get('p0').room; assert.match(room, /^DG[0-9A-F]{6}:home$/); assert.ok([...w.peers.values()].filter(p => p.room === room).length === 5);
  assert.equal(w.peers.get('p5').dungeon, undefined, 'the sixth waits for the next party');
});

test('stepping out resets the countdown; a run spent today keeps you out of the queue', () => {
  const w = setup(), a = w.add('a', L.x, L.z);
  w.tick(6); a.pose = { x: 0, z: 0 }; w.tick(.5); a.pose = { x: L.x, z: L.z }; w.tick(6);
  assert.equal(w.outbox.filter(m => m.type === 'dgGo').length, 0, 'the countdown started over');
  w.tick(5); assert.equal(w.outbox.filter(m => m.type === 'dgGo').length, 1);
  const tired = setup(), b = tired.add('b', L.x, L.z); b.account.profile.dungeon = { day: '2026-10-06', runs: 6, clears: 0 };
  tired.tick(12); assert.equal(tired.outbox.filter(m => m.type === 'dgGo').length, 0);
});

test('inside a run: the host relays, members send hits to the host, only the host reports cleared rooms', () => {
  const w = setup(), a = w.add('a', L.x, L.z), b = w.add('b', L.x + 1, L.z);
  w.tick(10.5); const runId = a.dungeon.id; w.outbox.length = 0;
  w.lobby.message(a, { type: 'dgSync', runId, state: { stage: 0, enemies: [] } });
  assert.deepEqual(w.outbox.map(m => [m.type, m.to]), [['dgSync', 'b']]);
  w.outbox.length = 0; w.lobby.message(b, { type: 'dgSync', runId, state: {} }); assert.equal(w.outbox.length, 0, 'a member cannot pose as the host');
  w.lobby.message(b, { type: 'dgHit', runId, id: 'vault:0:3', damage: 9e9 }); assert.deepEqual(w.outbox.map(m => [m.type, m.to, m.damage]), [['dgHit', 'a', 50000]]);
  w.outbox.length = 0; w.lobby.message(a, { type: 'dgHurt', runId, to: 'b', amount: 40, source: 'shot' }); assert.deepEqual(w.outbox.map(m => [m.type, m.to, m.amount]), [['dgHurt', 'b', 40]]);
  // Claims: only your own run, only rooms the host cleared, in order.
  assert.equal(w.lobby.check('b', 'dungeonStart', { runId }), true); assert.equal(w.lobby.check('b', 'dungeonStart', { runId: 'other' }), false);
  assert.equal(w.lobby.check('b', 'dungeonClaim', { runId, stage: 0 }), false, 'not cleared yet');
  w.lobby.message(b, { type: 'dgClear', runId, stage: 0 }); assert.equal(w.lobby.check('b', 'dungeonClaim', { runId, stage: 0 }), false, 'a member cannot clear a room');
  w.lobby.message(a, { type: 'dgClear', runId, stage: 1 }); assert.equal(w.lobby.check('a', 'dungeonClaim', { runId, stage: 0 }), false, 'rooms clear in order');
  w.lobby.message(a, { type: 'dgClear', runId, stage: 0 }); assert.equal(w.lobby.check('b', 'dungeonClaim', { runId, stage: 0 }), true); assert.equal(w.lobby.check('b', 'dungeonClaim', { runId, stage: 1 }), false);
  assert.equal(w.lobby.check('c', 'dungeonClaim', { runId, stage: 0 }), false, 'not in the party');
});

test('leaving or disconnecting hands the run to the next member and takes you back to your world room', () => {
  const w = setup(), a = w.add('a', L.x, L.z), b = w.add('b', L.x + 1, L.z);
  w.tick(10.5); const run = a.dungeon; w.outbox.length = 0;
  w.lobby.message(a, { type: 'dgClear', runId: run.id, stage: 0 });
  w.lobby.message(a, { type: 'dgLeave', runId: run.id });
  assert.equal(w.lobby.check('a', 'dungeonClaim', { runId: run.id, stage: 0 }), true, 'a room cleared before leaving can still be claimed');
  assert.equal(w.lobby.check('a', 'dungeonStart', { runId: run.id }), false);
  assert.equal(a.dungeon, null); assert.equal(a.room, 'public:home'); assert.ok(Math.hypot(a.pose.x - L.x, a.pose.z - L.z) < 8);
  assert.deepEqual(w.outbox.filter(m => m.type !== 'dgClear').map(m => [m.type, m.to]), [['dgEnd', 'a'], ['dgHost', 'b']]); assert.equal(run.host, 'b');
  w.lobby.disconnect(b); assert.equal(w.lobby.runs.size, 0); assert.ok(!w.parties.has(run.code), 'the private room code is retired');
});
