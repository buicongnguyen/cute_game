/**
 * The Delvers' Vault online (src/dungeon-rules.ts, src/dungeon.ts). The server owns:
 *  - the lobby: who stands in the glowing circle by the south gate (from the poses it accepted), the 10 s countdown
 *    (LobbyCountdown), and the party it sends in (at most 5, first come first served), with `dgLobby` updates;
 *  - the run: an id, its members and its host, a private room (a party code `DG…`) so the party is alone in the arena,
 *    the members' poses moved to the arena, and the stages the host reported cleared;
 *  - the relay inside the run: `dgSync` (host → everyone: creatures, stage, casts), `dgHit` (member → host),
 *    `dgHurt` (host → one member), `dgClear` (host → server), `dgLeave` (member → server).
 * The run counter and every reward go through the shared rules (actions.ts dungeonStart / dungeonClaim) with the server's
 * clock and dice; action-service.mjs only lets a member start the run it was put in, and claim a stage the host cleared.
 * The arena itself is simulated by the run's host browser (creature AI, guardian skills) and relayed: a reasonable
 * trust boundary for a co-op PvE room whose rewards are paced and capped by the shared rules.
 */
import { randomBytes } from 'node:crypto';
import { LobbyCountdown, DUNGEON, runsLeft, inLobby, STAGE_COUNT } from '../src/dungeon-rules.ts';

const RUN_MS = (DUNGEON.timeLimit + 120) * 1000;
export function createDungeonLobby({ peers, rooms, parties, join, send, arrived, now = () => Date.now() }) {
  const lobbies = new Map(), runs = new Map(), sent = new Map();
  /** The room's countdown (one lobby per world room, so a private party queues on its own). */
  const lobbyOf = key => { let lobby = lobbies.get(key); if (!lobby) lobbies.set(key, lobby = new LobbyCountdown(DUNGEON.need, DUNGEON.countdown, DUNGEON.maxParty)); return lobby; };
  const eligible = peer => peer && peer.active !== false && !peer.visit && peer.planet === 'home' && !peer.dungeon && peer.account.profile.hp > 0 && runsLeft(peer.account.profile, now()) > 0 && inLobby(peer.pose);
  function tick(dt) {
    const byRoom = new Map();
    for (const peer of peers.values()) if (peer.room && !peer.room.startsWith('DG') && eligible(peer)) { const list = byRoom.get(peer.room) ?? []; list.push(peer.account.id); byRoom.set(peer.room, list); }
    for (const key of new Set([...lobbies.keys(), ...byRoom.keys()])) {
      const lobby = lobbyOf(key), inCircle = byRoom.get(key) ?? [], party = lobby.step(dt, inCircle);
      if (party) start(party.map(id => peers.get(id)).filter(Boolean));
      for (const id of inCircle) tell(id, { type: 'dgLobby', n: Math.min(DUNGEON.maxParty, lobby.order.length), waiting: Math.max(0, lobby.order.length - DUNGEON.maxParty), need: DUNGEON.need, max: DUNGEON.maxParty, cd: lobby.seconds, left: runsLeft(peers.get(id).account.profile, now()), names: lobby.order.slice(0, DUNGEON.maxParty).map(m => peers.get(m)?.account.profile.name ?? '') });
      if (!inCircle.length && !lobby.order.length) lobbies.delete(key);
    }
    // Those who stepped out hear it once, so their panel closes.
    for (const [id, last] of sent) if (last && !peers.get(id)?.dungeon && !eligibleIn(id)) { sent.set(id, null); const peer = peers.get(id); if (peer) send(peer.socket, { type: 'dgLobby', n: 0, cd: null, gone: true }); }
    for (const run of runs.values()) if (now() - run.startedAt > RUN_MS) finish(run);
  }
  const eligibleIn = id => { const peer = peers.get(id); return !!peer && eligible(peer); };
  function tell(id, message) { const peer = peers.get(id), key = JSON.stringify(message); if (!peer || sent.get(id) === key) return; sent.set(id, key); send(peer.socket, message); }
  function start(members) {
    if (!members.length) return;
    const id = 'dg-' + randomBytes(6).toString('hex'), code = 'DG' + randomBytes(3).toString('hex').toUpperCase(), seed = randomBytes(4).readUInt32LE(0);
    parties.set(code, { owner: members[0].account.id, created: now(), dungeon: id });
    const run = { id, code, seed, members: members.map(p => p.account.id), host: members[0].account.id, startedAt: now(), cleared: 0 };
    runs.set(id, run);
    const roster = members.map(p => ({ id: p.account.id, name: p.account.profile.name, level: p.account.profile.level }));
    members.forEach((peer, index) => {
      peer.dungeon = run; peer.dungeonReturn = peer.party;
      try { join(peer, 'home', code); } catch { /* the room is new and private: joining it cannot fail for space */ }
      const a = index * TAU / Math.max(1, members.length);
      peer.pose = { ...peer.pose, x: DUNGEON.arena.x + Math.sin(a) * 3, z: DUNGEON.arena.z + 10 + Math.cos(a) * 2 }; arrived(peer);
      sent.delete(peer.account.id);
      send(peer.socket, { type: 'dgGo', runId: id, seed, host: run.host, you: peer.account.id, members: roster, spawn: { x: peer.pose.x, z: peer.pose.z } });
    });
  }
  /** A member leaves (or the run ends): back to the world room it came from, standing by the circle. */
  function leave(peer, reason = 'leave') {
    const run = peer?.dungeon; if (!run) return;
    peer.dungeon = null; peer.dungeonPast = { run, until: now() + 120_000 }; run.members = run.members.filter(id => id !== peer.account.id);
    const back = peer.dungeonReturn && parties.has(peer.dungeonReturn) ? peer.dungeonReturn : null; delete peer.dungeonReturn;
    try { join(peer, 'home', back); } catch { try { join(peer, 'home', null); } catch { /* the public village is full: the client reconnects */ } }
    peer.pose = { ...peer.pose, x: DUNGEON.lobby.x, z: DUNGEON.lobby.z - 6 }; arrived(peer);
    send(peer.socket, { type: 'dgEnd', runId: run.id, reason });
    if (run.host === peer.account.id && run.members.length) { run.host = run.members[0]; for (const id of run.members) { const p = peers.get(id); if (p) send(p.socket, { type: 'dgHost', runId: run.id, host: run.host }); } }
    if (!run.members.length) { runs.delete(run.id); parties.delete(run.code); }
  }
  function finish(run) { for (const id of [...run.members]) leave(peers.get(id) ?? { dungeon: null }, 'time'); runs.delete(run.id); parties.delete(run.code); }
  const others = (run, except) => run.members.filter(id => id !== except).map(id => peers.get(id)).filter(Boolean);
  /** A socket message of type dg*; returns true when handled. */
  function message(peer, m) {
    const run = peer.dungeon;
    if (m.type === 'dgLeave') { leave(peer); return true; }
    if (!run || m.runId !== run.id) return m.type?.startsWith('dg') ?? false;
    const json = s => { const text = JSON.stringify(s); return text.length < 60_000 ? text : null; };
    if (m.type === 'dgSync' && run.host === peer.account.id) { const body = json({ type: 'dgSync', runId: run.id, state: m.state }); if (body) for (const p of others(run, peer.account.id)) send(p.socket, body); }
    else if (m.type === 'dgHit' && run.host !== peer.account.id) { const host = peers.get(run.host), dmg = Number(m.damage); if (host && typeof m.id === 'string' && m.id.length < 80 && Number.isFinite(dmg) && dmg > 0) send(host.socket, { type: 'dgHit', runId: run.id, id: m.id, damage: Math.min(dmg, 50_000), stun: Math.min(3, Math.max(0, Number(m.stun) || 0)), by: peer.account.id }); }
    else if (m.type === 'dgHurt' && run.host === peer.account.id) { const target = peers.get(m.to), amount = Number(m.amount); if (target?.dungeon === run && Number.isFinite(amount) && amount > 0) send(target.socket, { type: 'dgHurt', runId: run.id, amount: Math.min(amount, 100_000), source: m.source === 'shot' ? 'shot' : m.source === 'hazard' ? 'hazard' : 'melee' }); }
    else if (m.type === 'dgClear' && run.host === peer.account.id && Number.isInteger(m.stage) && m.stage === run.cleared && m.stage < STAGE_COUNT) { run.cleared++; for (const p of others(run, peer.account.id)) send(p.socket, { type: 'dgClear', runId: run.id, stage: m.stage }); }
    return true;
  }
  /** action-service.mjs: may this explorer start / claim this run? */
  function check(actorId, type, p) {
    const run = peers.get(actorId)?.dungeon;
    if (type === 'dungeonStart') return !!run && run.id === p.runId;
    // Rooms cleared before you left can still be claimed for two minutes (claims are paced 15 s apart).
    const past = peers.get(actorId)?.dungeonPast, claimable = run ?? (past && now() < past.until ? past.run : null);
    if (type === 'dungeonClaim') return !!claimable && claimable.id === p.runId && Number.isInteger(p.stage) && p.stage < claimable.cleared;
    return true;
  }
  function disconnect(peer) { if (peer?.dungeon) leave(peer, 'disconnect'); sent.delete(peer?.account?.id); }
  return { tick, message, check, disconnect, runs, lobbies };
}
const TAU = Math.PI * 2;
