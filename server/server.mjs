import http from 'node:http';
import { poseStep, poseFix, arrived } from './pose-budget.mjs';
import { clientAddress } from './client-address.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { WebSocketServer, WebSocket } from 'ws';
import * as Game from '../src/model.ts';
import { dogFollows } from '../src/guard-dog.ts';
import { lookOf } from '../src/looks.ts';
import { createAccountStore } from './account-store.mjs';
import { createActionService, commandHash, logGuest } from './action-service.mjs';
import { createCombatAuthority } from './combat-authority.mjs';
import { EFFECT_LOOKS } from '../src/combat.ts';
import { rememberAccount } from './account-cache.mjs';

const derive = promisify(scrypt);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY = 256 * 1024;
const COOKIE = 'zoo_session';
// Direct health actions use the latest durable damage and normal revision conflicts.
const HEALTH_ACTIONS = new Set(['eat','jungleFruit','rest','houseUse','equip','unequip']);
const text = (value, limit = 160) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit) : '';
const number = (value, fallback = 0, min = -1000, max = 1000) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const sameString = (a, b) => {
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
};
const cookieValue = request => (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
const publicAccount = account => ({ id: account.id, username: account.username, name: account.profile.name, color: account.profile.color, level: account.profile.level, gear: account.profile.gear, look: lookOf(account.profile) });
const publicHome = account => {
  const source = account.profile;
  return { ...publicAccount(account), discovered:source.discovered||['home'], plots: source.plots, decorations: source.decorations || [], farm: source.farm || null, helper: source.helper || null, friends: Array.isArray(source.friends) ? source.friends : [], home: source.home || null, placed: source.placed || [],
    // The cottage's trophy shelf and paintings, for visitors (cooldown stamps stay private).
    bosses: Array.isArray(source.bosses) ? source.bosses : [], house: { paintings: Number.isSafeInteger(source.house?.paintings) ? source.house.paintings : 0 } };
};
const send = (socket, payload) => { if (socket.readyState === WebSocket.OPEN) socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload)); };
const failure = (status, message) => Object.assign(new Error(message), { status });
export async function createGameServer(options = {}) {
  const host = options.host || process.env.HOST || '127.0.0.1';
  const port = options.port ?? Number(process.env.PORT || 8787);
  const root = options.root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(root, 'data');
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if ((options.databaseRequired ?? process.env.DATABASE_REQUIRED === '1') && !databaseUrl && !options.accountStore) {
    throw new Error('DATABASE_URL is required for this deployment. No temporary account storage was started.');
  }
  const store = options.accountStore || await createAccountStore({ dataDir, databaseUrl });
  const accounts = new Map(), sessions = new Map(), peers = new Map(), rooms = new Map(), parties = new Map();
  const limits = new Map(), chatReceipts = new Map();
  const maxPlayers = Number(options.maxPlayers ?? process.env.MAX_PLAYERS ?? 60);
  // Behind a tunnel or proxy every request arrives from 127.0.0.1: with TRUST_PROXY=1 rate limits use the visitor's real address instead (client-address.mjs).
  const trustProxy = options.trustProxy ?? process.env.TRUST_PROXY === '1';
  let closing = false;
  const remember=value=>rememberAccount(accounts,value);
  try {
    for (const value of await store.list()) remember(value);
  } catch (error) { await store.close(); throw new Error('The account database could not be read. It has not been overwritten.', { cause: error }); }
  function allowedOrigin(request) {
    const origin = request.headers.origin;
    if (!origin) return true;
    try {
      const url = new URL(origin);
      const expected = request.headers.host;
      return url.host === expected || ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'].includes(origin)
        || (options.origins || process.env.ALLOWED_ORIGINS?.split(',') || []).includes(origin);
    } catch { return false; }
  }
  function rate(key, maximum, period = 60_000) {
    const now = Date.now(), previous = limits.get(key);
    const entry = previous && now - previous.at < period ? previous : { at: now, count: 0 };
    entry.count++; limits.set(key, entry);
    if (entry.count > maximum) throw failure(429, 'Please wait a moment before trying again.');
  }
  function validSession(request) {
    const token = cookieValue(request), session = token && sessions.get(token);
    if (!session || session.expires < Date.now()) { if (token) sessions.delete(token); return null; }
    return session;
  }
  async function authenticated(request) {
    const session = validSession(request);
    if (!session) return null;
    const account = await store.get(session.id);
    return validSession(request) === session ? remember(account) : null;
  }
  function sessionCookie(response, request, account) {
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { id: account.id, expires: Date.now() + SESSION_MS });
    const secure = request.socket.encrypted || process.env.COOKIE_SECURE === '1';
    response.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure ? '; Secure' : ''}`);
  }
  function respond(response, status, value, extra = {}) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
    response.end(JSON.stringify(value));
  }
  async function body(request) {
    let size = 0; const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BODY) throw failure(413, 'This request is too large.');
      chunks.push(chunk);
    }
    try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; }
    catch { throw failure(400, 'Please send a valid request.'); }
  }
  function friendList(account) {
    return {
      friends: account.friends.map(id => accounts.get(id)).filter(Boolean).map(value => ({ ...publicAccount(value), online: peers.has(value.id) })),
      requests: account.requests.map(id => accounts.get(id)).filter(Boolean).map(publicAccount),
      // Requests I sent that are still waiting (so they can be cancelled), and the guest diary (who visited, watered, gifted).
      sent: [...accounts.values()].filter(other => other.requests.includes(account.id)).map(publicAccount),
      visitLog: (account.visitLog || []).slice(0, 30),
    };
  }
  async function refreshFriends(account) {
    await Promise.all([...new Set([...account.friends, ...account.requests])].map(async id => remember(await store.get(id))));
    return friendList(account);
  }
  /** Writes one entry in an owner's guest diary (visit, message) and tells them at once; false if the account was busy. */
  async function noteGuest(ownerId, entry) {
    try {
      const committed = await store.command({ actorId: ownerId, requestId: randomUUID(), hash: commandHash({ type: 'guestNote', ownerId, entry }), expectedRevision: accounts.get(ownerId)?.profileRevision || 0, actionType: 'guestNote', keepRevision: true,
        run: records => { logGuest(records.get(ownerId), entry); return true; } });
      committed.accounts.forEach(remember);
      const owner = accounts.get(ownerId), ownerPeer = peers.get(ownerId);
      if (owner && ownerPeer) send(ownerPeer.socket, { type: 'guestNotice', entry: owner.visitLog?.[0] }); // the profile and its revision did not change
      return true;
    } catch { return false; }
  }
  function tellFriends(account) { const peer = peers.get(account.id); if (peer) send(peer.socket, { type: 'friends', ...friendList(account) }); }
  function broadcast(room, payload, except) { payload = JSON.stringify(payload); /* once for everyone in the room */ for (const id of room.members) { if (id !== except) { const peer = peers.get(id); if (peer) send(peer.socket, payload); } } }
  function visibleDrop(peer,drop){const space=drop.space||(drop.planet==='home'&&Math.hypot(drop.x,drop.z)<18?`home:${drop.ownerId}`:'wild');return !peer.visit&&drop.room===peer.room&&drop.planet===peer.planet&&(space==='wild'||space===`home:${peer.account.id}`);}
  function respawn(peer){if(peer.visit)endVisit(peer);join(peer,'home',peer.party);peer.pose={...peer.pose,x:0,z:-4.8};arrived(peer);}
  const combatAuthority=createCombatAuthority({store,peers,rooms,remember,send,broadcast,onDeath:respawn});
  const executeAction = createActionService({store,getPeer:id=>peers.get(id),getWorld:id=>rooms.has(id)?combatAuthority.state(rooms.get(id)):null,afterCommit:async(committed,intent)=>{
    committed.accounts.forEach(remember);
    if(committed.reply.replayed)return;
    for(const changed of committed.accounts){
      const account=accounts.get(changed.id),peer=peers.get(changed.id);
      if(peer)send(peer.socket,{type:'profile',profile:account.profile,revision:account.profileRevision,authorityVersion:1});
      for(const visitor of peers.values())if(visitor.visit===account.id)send(visitor.socket,{type:'home',home:publicHome(account)});
    }
    const result=committed.reply.result;
    if(['rest','reset','die','returnHome','travel'].includes(intent.type)||result?.died){const peer=peers.get(intent.actorId);if(peer)combatAuthority.resetPeer?.(peer,{newLife:['reset','die'].includes(intent.type)||result?.died===true,reason:intent.type});}
    if(intent.type==='claimGift'&&result?.kind==='bomb'){const peer=peers.get(intent.actorId);if(peer)combatAuthority.bomb(peer,result.radius,result.damageMultiplier);}
    if(result?.died){const peer=peers.get(intent.actorId);if(peer){respawn(peer);send(peer.socket,{type:'healthResult',delta:-result.damage,died:true});}}
    if(['waterFriend','giftFriend','stealCrop'].includes(intent.type)&&result?.ownerId){const owner=accounts.get(result.ownerId),entry=owner?.visitLog?.[0],ownerPeer=peers.get(result.ownerId);if(entry&&ownerPeer)send(ownerPeer.socket,{type:'guestNotice',entry});}
    if(intent.type==='stealCrop'&&result?.ownerId)for(const peer of peers.values())if(peer.visit===result.ownerId||peer.account.id===result.ownerId||peer.account.id===intent.actorId)send(peer.socket,{type:'gardenEvent',eventId:intent.requestId,by:intent.actorId,...result});
    if(intent.type==='dropItem'&&result?.room)for(const peer of peers.values())if(visibleDrop(peer,result))send(peer.socket,{type:'dropSpawn',drop:result});
    if(intent.type==='claimDrop'||intent.type==='releaseDrop')for(const peer of peers.values())if(visibleDrop(peer,result))send(peer.socket,{type:intent.type==='claimDrop'?'dropClaimed':'dropReleased',...result});
  }});
  function endVisit(peer) {
    peer.visit = null; send(peer.socket, { type: 'visit', home: null });
    const party=peer.visitReturnParty&&parties.has(peer.visitReturnParty)?peer.visitReturnParty:null;delete peer.visitReturnParty;
    join(peer,peer.account.profile.planet,party,null,true);
    const room = rooms.get(peer.room); if (room) { peer.lastSent = null; broadcastPose(room, peer); }
  }
  function presence(peer) {
    return { ...publicAccount(peer.account), ...peer.pose, difficulty: Game.difficultyOf(peer.account.profile), id: peer.account.id, planet: peer.planet, space: peer.visit ? `home:${peer.visit}` : peer.planet === 'home' && Math.hypot(peer.pose.x, peer.pose.z) < 18 ? `home:${peer.account.id}` : 'wild', active: peer.active };
  }
  /**
   * Movement updates are sent as changes only: the first time (and every 5 s as a resync, and after any non-movement
   * event) the full presence, otherwise just the fields that changed since the last send, with numbers rounded. A player
   * standing still sends nothing. The client merges them (online.ts).
   */
  const round2 = value => typeof value === 'number' ? Math.round(value * 100) / 100 : value;
  function poseUpdate(peer, now = Date.now()) {
    const full = presence(peer);
    for (const key of ['x', 'y', 'z', 'facing']) if (key in full) full[key] = round2(full[key]);
    const last = peer.lastSent;
    if (!last || now - peer.lastSentAt > 5000) { peer.lastSent = full; peer.lastSentAt = now; return { type: 'pose', player: full }; }
    const changed = { id: full.id };
    for (const key of Object.keys(full)) if (JSON.stringify(full[key]) !== JSON.stringify(last[key])) changed[key] = full[key];
    for (const key of Object.keys(last)) if (!(key in full)) changed[key] = null;
    if (Object.keys(changed).length === 1) return null;
    peer.lastSent = full;
    return { type: 'pose', player: changed, delta: true };
  }
  function broadcastPose(room, peer) { const update = poseUpdate(peer); if (update) broadcast(room, update, peer.account.id); }
  function roster(room) { return [...room.members].map(id => peers.get(id)).filter(Boolean).map(presence); }
  function elect(room) {
    const available = [...room.members].map(id => peers.get(id)).filter(Boolean);
    const current = peers.get(room.host);
    const active = available.filter(peer => peer.active);
    const next = current?.active && room.members.has(room.host) ? room.host : (active[0] || available[0])?.account.id || null;
    if (room.host !== next) { room.host = next; broadcast(room, { type: 'authority', host: next, enemies: room.enemies, environment:room.environment, epoch: ++room.epoch }); }
  }
  function leave(peer) {
    const room = rooms.get(peer.room);
    if (!room) return;
    room.members.delete(peer.account.id);
    broadcast(room, { type: 'leave', id: peer.account.id });
    if (!room.members.size) rooms.delete(room.id); else elect(room);
    peer.room = null;
  }
  function join(peer, planet = 'home', party = null, visitId = null, refresh = false) {
    if (!Object.hasOwn(Game.PLANETS, planet)) throw failure(400, 'Unknown world.');
    if (party && !parties.has(party)) throw failure(404, 'That party code was not found.');
    const key = `${party || 'public'}:${planet}`;
    if (peer.room === key) {
      if(peer.visit===visitId&&!refresh)return;
      peer.visit=visitId;
      const room=rooms.get(key);
      send(peer.socket,{type:'joined',id:peer.account.id,room:key,party,host:room.host,planet,visiting:visitId,players:roster(room),enemies:room.enemies,environment:room.environment,epoch:room.epoch});
      return;
    }
    const existing = rooms.get(key);
    if (existing?.members.size >= 24) throw failure(409, 'This world is full. Join a private party to play together.');
    leave(peer);
    const room = existing || { id: key, members: new Set(), host: null, enemies: [], environment:null, requests:new Map(), epoch: 0, killed: new Set(), contributors: new Map(), lastSnapshot: 0 };
    rooms.set(key, room); room.members.add(peer.account.id);
    if (peer.planet && peer.planet !== 'home' || peer.visit) peer.tripAt = Date.now(); // leaving a trip: delivery.ts catch-ups go to the chest
    peer.planet = planet; peer.party = party; peer.room = key; peer.visit = visitId; peer.pose = { ...peer.pose, x: 0, z: planet === 'home' ? 0 : 9 }; arrived(peer);
    elect(room);
    send(peer.socket, { type: 'joined', id: peer.account.id, room: key, party, host: room.host, planet, visiting:visitId, players: roster(room), enemies: room.enemies, environment:room.environment, epoch: room.epoch });
    broadcast(room, { type: 'enter', player: presence(peer) }, peer.account.id);
  }

  async function api(request, response, url) {
    // The status check is public and readable from the solo site (github.io), which asks "is the server on?" before it shows its Play online link. Nothing else is cross-origin.
    if (url.pathname === '/api/health') {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'ngrok-skip-browser-warning, Content-Type', 'Access-Control-Max-Age': '600' };
      if (request.method === 'OPTIONS') { response.writeHead(204, cors); return response.end(); }
      if (request.method === 'GET') {
        try { if (closing) throw new Error('Closing'); await store.health(); }
        catch { return respond(response, 503, { ok: false, error: 'Account storage is unavailable.' }, cors); }
        return respond(response, 200, { ok: true, online: peers.size, version: 1, storage: store.kind }, cors);
      }
    }
    if (!allowedOrigin(request)) throw failure(403, 'This origin is not allowed.');
    const route = url.pathname.slice(5), method = request.method;
    if (route === 'health' && method === 'GET') {
      try { if (closing) throw new Error('Closing'); await store.health(); }
      catch { return respond(response, 503, { ok: false, error: 'Account storage is unavailable.' }); }
      return respond(response, 200, { ok: true, online: peers.size, version: 1, storage: store.kind });
    }
    if ((route === 'auth/register' || route === 'auth/login') && method === 'POST') {
      rate(`auth:${clientAddress(request, trustProxy)}`, 30);
      const data = await body(request), username = text(data.username, 24).toLowerCase(), password = typeof data.password === 'string' ? data.password : '';
      if (route === 'auth/login') rate(`auth-user:${username}`, 20); // tries per account, whoever sends them
      if (!/^[a-z0-9_]{3,24}$/.test(username) || password.length < 4 || password.length > 128) throw failure(400, 'Use a 3–24 character username and a password of at least 4 characters.');
      let account = remember(await store.findByUsername(username));
      if (route === 'auth/register') {
        if (account) throw failure(409, 'That username is already taken.');
        const salt = randomBytes(16).toString('hex'), hash = (await derive(password, salt, 64)).toString('hex');
        account = { id: randomUUID(), username, salt, hash, createdAt: Date.now(), friends: [], requests: [], profile: Game.newGame(text(data.name, 20) || username, Game.COLORS.includes(data.color) ? data.color : Game.COLORS[0]) };
        account = remember(await store.create(account));
      } else {
        const salt = account?.salt || 'missing-user-salt', hash = (await derive(password, salt, 64)).toString('hex');
        if (!account || !sameString(hash, account.hash)) throw failure(401, 'The username or password is incorrect.');
      }
      sessionCookie(response, request, account);
      return respond(response, 200, { account: publicAccount(account), profile: account.profile, revision:account.profileRevision||0, authorityVersion:1, ...await refreshFriends(account) });
    }
    if (route === 'auth/logout' && method === 'POST') {
      const session = validSession(request);
      sessions.delete(cookieValue(request)); response.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      if (session) peers.get(session.id)?.socket.close(1000, 'Signed out');
      return respond(response, 200, { ok: true });
    }
    const account = await authenticated(request);
    if (route === 'auth/session' && method === 'GET') {
      const friends = account ? await refreshFriends(account) : {};
      return respond(response, 200, account && validSession(request)?.id === account.id ? { account: publicAccount(account), profile: account.profile, revision:account.profileRevision||0, authorityVersion:1, ...friends } : { account: null });
    }
    if (!account) throw failure(401, 'Sign in to play online.');
    const authorizedSession=validSession(request);
    const checkAccess=()=>{if(!authorizedSession||validSession(request)!==authorizedSession)throw failure(401,'Sign in to play online.');};
    if(route==='actions'&&method==='POST'){
      rate(`action:${account.id}`,240);
      const data=await body(request);data.payload??={};
      checkAccess();
      const peer=peers.get(account.id);
      if(peer&&(HEALTH_ACTIONS.has(data.type)||data.type==='upgrade'&&data.payload.kind==='health'||data.type==='environmentResource'&&peer.planet==='jungle'))await combatAuthority.flushPeerHealth(peer);
      return respond(response,200,await executeAction(account.id,data,{checkAccess}));
    }
    if(route==='drops'&&method==='GET'){
      const peer=peers.get(account.id),now=Date.now();
      return respond(response,200,{drops:peer?[...accounts.values()].flatMap(owner=>(owner.drops||[]).filter(drop=>!drop.claimed&&drop.expiresAt>now&&visibleDrop(peer,drop))):[]});
    }
    if(route==='events'&&method==='GET')return respond(response,200,{events:account.outbox||[],profile:account.profile,revision:account.profileRevision||0,authorityVersion:1});
    if (route === 'profile' && method === 'PUT') {
      throw failure(409,'Reconnect to use server-approved actions.');

    }
    if (route === 'friends' && method === 'GET') return respond(response, 200, await refreshFriends(account));
    if (route.startsWith('friends/') && method === 'POST') {
      rate(`friend:${account.id}`, 25);
      const data = await body(request), target = remember((typeof data.id === 'string' ? await store.get(data.id) : null) || await store.findByUsername(text(data.username, 24).toLowerCase()));
      checkAccess();
      if (!target || target.id === account.id) throw failure(404, 'Choose another explorer.');
      const changed = await store.friendAction(account.id, target.id, route.slice('friends/'.length),checkAccess);
      changed.forEach(remember);
      for (const visitor of peers.values()) if (visitor.visit && !visitor.account.friends.includes(visitor.visit)) endVisit(visitor);
      tellFriends(account); tellFriends(target); return respond(response, 200, await refreshFriends(account));
    }
    if (route.startsWith('homes/') && method === 'GET') {
      const target = remember(await store.get(route.slice(6)));
      if (!target || (target.id !== account.id && !account.friends.includes(target.id))) throw failure(403, 'Become friends before visiting a garden.');
      return respond(response, 200, { home: publicHome(target) });
    }
    throw failure(404, 'That service was not found.');
  }

  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await api(request, response, url);
      if (!['GET', 'HEAD'].includes(request.method)) throw failure(405, 'This action is not supported.');
      const dist = path.resolve(root, 'dist'), relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const target = path.resolve(dist, relative);
      if (target !== dist && !target.startsWith(dist + path.sep)) throw failure(403, 'This path is not available.');
      let data;
      try { data = await readFile(target); } catch { throw failure(404, 'Build the game first, then open its home page.'); }
      response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': /(?:index\.html|sw\.js|manifest|\.json)$/.test(relative) ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch (error) { if (!response.headersSent) respond(response, error.status || 500, { error: error.status ? error.message : 'The server could not complete that request.' }); else response.end(); }
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024, perMessageDeflate: false });
  server.on('upgrade', async (request, socket, head) => {
    if (request.url?.split('?')[0] !== '/socket' || !allowedOrigin(request)) return socket.destroy();
    // The peer can disconnect while the database wakes up. Never upgrade a dead socket.
    const onError = () => socket.destroy(); socket.on('error', onError);
    try {
      const account = await authenticated(request);
      if (socket.destroyed || closing) return socket.destroy();
      if (!account) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return socket.destroy(); }
      await refreshFriends(account);
      if (socket.destroyed || closing) return socket.destroy();
      if (peers.size >= maxPlayers && !peers.has(account.id)) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return; } // the server is full
      if (validSession(request)?.id !== account.id) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
      socket.removeListener('error', onError);
      sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws, request, account));
    } catch { if (!socket.destroyed) socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); }
  });
  sockets.on('connection', (socket, request, account) => {
    const previous = peers.get(account.id); if (previous) { leave(previous); previous.socket.close(4001, 'This adventure was opened in another tab.'); }
    const peer = { socket, account, active: true, visit: null, party: null, room: null, planet: account.profile.planet, pose: { x: 0, z: 0, facing: 0, moving: false }, poseAt: 0, messages: 0 };
    peers.set(account.id, peer); send(socket, { type: 'welcome', id: account.id, ...friendList(account) });
    try { join(peer, Object.hasOwn(Game.PLANETS, account.profile.planet) ? account.profile.planet : 'home'); }
    catch (error) { peers.delete(account.id); send(socket, { type: 'error', message: error.message }); socket.close(1008, 'World unavailable'); return; }
    socket.isAlive = true; socket.on('pong', () => { socket.isAlive = true; });
    for (const id of account.friends) if (accounts.has(id)) tellFriends(accounts.get(id));
    socket.on('message', raw => {
      let requestId;
      try {
        if (socket.readyState !== WebSocket.OPEN || peers.get(account.id) !== peer) return;
        if (validSession(request)?.id !== account.id) { socket.close(1000, 'Signed out'); return; }
        const message = JSON.parse(raw.toString());
        if (!message || typeof message.type !== 'string') return;
        if (message.type === 'chat' && typeof message.requestId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(message.requestId)) requestId = message.requestId;
        rate(`messages:${account.id}`, 80, 1000);
        const room = rooms.get(peer.room);
        if (message.type === 'active') { peer.active = message.active === true; if (room) elect(room); }
        else if (message.type === 'join') {if(message.planet!==account.profile.planet)throw failure(403,'Travel to that planet before joining it.');join(peer, message.planet, text(message.party, 8).toUpperCase() || null);}
        else if (message.type === 'party') {
          const code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); parties.set(code, { owner: account.id, created: Date.now() });
          join(peer, peer.planet, code); send(socket, { type: 'party', code });
        } else if (message.type === 'pose' && room) {
          const now = Date.now(); if (now - peer.poseAt < 65) return;
          const x = number(message.x), z = number(message.z), distance = Math.hypot(x - peer.pose.x, z - peer.pose.z);
          // Movement budget (pose-budget.mjs): refills at the top speed and saves up only a short burst, so neither a pause
          // nor a stream of small jumps adds up to a teleport; the Home button's snap to the village centre stays allowed.
          const move = poseStep(peer, { x, z }, distance, now); if (!move) { const fix = poseFix(peer, now); if (fix) send(socket, fix); return; } // the client goes back to the server's spot
          const combat=combatAuthority.engineFor(peer).sim;
          peer.poseAt = now; if (peer.planet !== 'home' || peer.visit) peer.tripAt = now; const y = number(message.y, 0, -30, 50), dog = !peer.visit && account.profile.farm?.animals?.find(a => a.kind === 'dog');
          // A guard dog follows its explorer only away from the safe village (guard-dog.ts); its breed is all others need.
          peer.pose = { x, z, y, dog: dog && dogFollows(peer.planet, { x, z, y }) ? Game.coatOf(dog) : null, facing: number(message.facing, 0, -100, 100), moving: message.moving === true, hp: account.profile.hp, maxHp: Game.maxHp(account.profile),visual:{size:combat.visualScale>1?combat.visualScale:Game.activeStats(account.profile).sizeScale,stealth:combat.statuses.stealth>0,shield:combat.statuses.shield>0,flight:combat.statuses.flight>0?1.7:0,bat:combat.statuses.bats>0} };
          broadcastPose(room, peer);
        } else if (message.type === 'dm') {
          // A private message to a friend, online or not: it lands in their guest diary (and pops up if they are playing).
          rate(`dm:${account.id}`, 10);
          const target = accounts.get(typeof message.to === 'string' ? message.to : ''), body = text(message.text, 120);
          if (!target || !account.friends.includes(target.id) || !target.friends.includes(account.id)) throw failure(403, 'Only friends can send messages.');
          if (!body) return;
          noteGuest(target.id, { at: Date.now(), by: account.id, name: account.profile.name, kind: 'message', text: body }).then(ok => send(socket, { type: 'dmSent', to: target.id, ok }));
        } else if (message.type === 'chat') {
          if (!room) throw failure(409, 'Join a world before sending a message.');
          if (message.requestId !== undefined && !requestId) throw failure(400, 'This message needs a valid request ID.');
          const value = text(message.message, 160), receiptKey = requestId && `${account.id}:${requestId}`;
          const prior = receiptKey && chatReceipts.get(receiptKey);
          if (prior && Date.now() - prior.at < 10 * 60_000) {
            if (prior.room !== room.id || prior.message !== value) throw failure(409, 'That message was already sent in another conversation.');
            send(socket, { type: 'chatAck', requestId }); return;
          }
          rate(`chat:${account.id}`, 24);
          if (!value) throw failure(400, 'Write a message before sending.');
          broadcast(room, { type: 'chat', id: account.id, name: account.profile.name, message: value, at: Date.now() });
          if (receiptKey) {
            chatReceipts.set(receiptKey, { room: room.id, message: value, at: Date.now() });
            if (chatReceipts.size > 10_000) chatReceipts.delete(chatReceipts.keys().next().value);
            send(socket, { type: 'chatAck', requestId });
          }
        } else if (message.type === 'visit') {
          const target = accounts.get(message.id);
          if (!target || !account.friends.includes(target.id)) throw failure(403, 'Become friends before visiting.');
          if(!peer.visit)peer.visitReturnParty=peer.party;
          join(peer, 'home', peers.get(target.id)?.party || peer.party,target.id); peer.pose = { ...peer.pose, x: 0, z: 3 };
          noteGuest(target.id, { at: Date.now(), by: account.id, name: account.profile.name, kind: 'visit' }); // the owner's guest diary (best effort)
          send(socket, { type: 'visit', home: publicHome(target) }); { peer.lastSent = null; broadcastPose(rooms.get(peer.room), peer); }
        } else if (message.type === 'leaveVisit') {
          endVisit(peer);
        } else if (message.type === 'enemies' && room?.host === account.id && Array.isArray(message.enemies)) {
          if (Date.now() - room.lastSnapshot < 100) return; room.lastSnapshot = Date.now();
          combatAuthority.acceptSnapshots(room,message.enemies);
          broadcast(room,{type:'enemies',enemies:room.enemies});
        } else if(message.type==='basic'&&room&&!peer.visit){
          rate('basic:'+account.id,12,1000);combatAuthority.basic(peer,text(message.targetId,100));
        } else if(message.type==='skill'&&room&&!peer.visit){
          rate('skill:'+account.id,12,1000);combatAuthority.skill(peer,message.index);
        } else if(message.type==='environmentAction'&&room&&!peer.visit){
          const action=message.action;
          if(action?.kind==='light-pillar'){
            const env=combatAuthority.state(room).environment,lamp=env.layout.lamps.find(l=>l.id===action.index);
            if(lamp&&Math.hypot(lamp.x-peer.pose.x,lamp.z-peer.pose.z)<4)env.lightPillar(lamp.id);
          }
        } else if(message.type==='damage'&&room?.host===account.id&&room.members.has(message.id)){
          const target=peers.get(message.id);if(target)combatAuthority.damage(target,text(message.enemyId,100),message.source==='shot'?'shot':'melee');
        } else if (message.type === 'effect' && room) {
          const visual=message.visual,cleanVisual=visual&&['arc','ring','impact','trail','beam','cast'].includes(visual.kind)?{kind:visual.kind,x:number(visual.x),z:number(visual.z),radius:number(visual.radius,1,0,40),facing:number(visual.facing,0,-100,100),duration:number(visual.duration,.4,0,5),...(Number.isFinite(visual.arc)?{arc:number(visual.arc,2.2,0,6.3)}:{}),...(Number.isFinite(visual.width)?{width:number(visual.width,.65,.05,4)}:{}),...(EFFECT_LOOKS.includes(visual.look)?{look:visual.look}:{}),color:/^#[a-f0-9]{6}$/i.test(visual.color)?visual.color:'#fff2a0'}:null;
          broadcast(room, { type: 'effect', visual:cleanVisual, by: account.id, effect: text(message.effect, 30), x: number(message.x), z: number(message.z), color: /^#[a-f0-9]{6}$/i.test(message.color) ? message.color : '#fff2a0' }, account.id);
        }
      } catch (error) { send(socket, { type: 'error', ...(requestId ? { requestId } : {}), message: error.status ? error.message : 'That action could not be completed.' }); }
    });
    socket.on('close', () => {
      if (peers.get(account.id) !== peer) return;
      leave(peer); peers.delete(account.id);
      for (const id of account.friends) if (accounts.has(id)) tellFriends(accounts.get(id));
    });
    socket.on('error', () => {});
  });
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [token, value] of sessions) if (value.expires < now) sessions.delete(token);
    for (const [key, value] of limits) if (now - value.at > 120_000) limits.delete(key);
    for (const [key, value] of chatReceipts) if (now - value.at > 10 * 60_000) chatReceipts.delete(key);
    for (const [key, value] of parties) if (now - value.created > 24 * 60 * 60 * 1000 && ![...rooms.keys()].some(room => room.startsWith(key + ':'))) parties.delete(key);
  }, 60_000); cleanup.unref();
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false; socket.ping();
    }
  }, 30_000); heartbeat.unref();
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); }
  catch (error) { clearInterval(cleanup); clearInterval(heartbeat); await store.close(); throw error; }
  return {
    server, port: server.address().port, url: `http://${host}:${server.address().port}`,
    async close() { if (closing) return; closing = true; await combatAuthority.close(); clearInterval(cleanup); clearInterval(heartbeat); for (const socket of sockets.clients) socket.terminate(); await new Promise(resolve => sockets.close(resolve)); await new Promise(resolve => server.close(resolve)); await store.close(); },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const game = await createGameServer();
    console.log(`Zoo Garden server is ready at ${game.url}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await game.close(); process.exit(0); });
  } catch {
    // Database errors can contain connection details; keep deployment logs free of credentials.
    console.error('Zoo Garden could not start. Check DATABASE_URL, database access, and the server configuration.');
    process.exitCode = 1;
  }
}




