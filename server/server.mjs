import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { WebSocketServer, WebSocket } from 'ws';
import * as Game from '../src/model.ts';
import { LavaWeather } from '../src/lava-weather.ts';

const derive = promisify(scrypt);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY = 256 * 1024;
const COOKIE = 'zoo_session';
const STATUS_TYPES = ['fear','charm','slow','blind','sheep','taunt'];
const text = (value, limit = 160) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit) : '';
const number = (value, fallback = 0, min = -1000, max = 1000) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const sameString = (a, b) => {
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
};
const cookieValue = request => (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
const safeProfile = value => Game.parseSave(JSON.stringify(value));
const publicAccount = account => ({ id: account.id, username: account.username, name: account.profile.name, color: account.profile.color, level: account.profile.level, gear: account.profile.gear });
const publicHome = account => {
  const source = account.profile;
  return { ...publicAccount(account), plots: source.plots, decorations: source.decorations || [], farm: source.farm || null, home: source.home || null, placed: source.placed || [] };
};
const send = (socket, payload) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload)); };
const failure = (status, message) => Object.assign(new Error(message), { status });
function cleanWeather(source){
  if(!source||typeof source!=='object')return undefined;
  const weather=new LavaWeather();
  const points=value=>(Array.isArray(value)?value:[]).slice(0,150).map(v=>({id:text(v?.id,100),kind:text(v?.kind,24),x:number(v?.x),z:number(v?.z),y:number(v?.y,0,-30,50),age:number(v?.age,0,0,60),expiresAt:number(v?.expiresAt,0,0,1e12)}));
  weather.restore({time:number(source.time,0,0,1e12),tideOffset:number(source.tideOffset,0,0,.28),seed:number(source.seed,739391,0,4294967295),sequence:number(source.sequence,0,0,1e12),eventKey:text(source.eventKey,50),meteorWait:number(source.meteorWait,2,0,60),stormWait:number(source.stormWait,3,0,60),treasureWait:number(source.treasureWait,4,0,60),dragonSummoned:source.dragonSummoned===true,meteors:points(source.meteors),fireballs:points(source.fireballs),ores:points(source.ores)});
  return weather.snapshot();
}

export async function createGameServer(options = {}) {
  const host = options.host || process.env.HOST || '127.0.0.1';
  const port = options.port ?? Number(process.env.PORT || 8787);
  const root = options.root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(root, 'data');
  const databasePath = path.join(dataDir, 'accounts.json');
  const accounts = new Map(), sessions = new Map(), peers = new Map(), rooms = new Map(), parties = new Map();
  const limits = new Map();
  let writes = Promise.resolve(), closing = false;
  await mkdir(dataDir, { recursive: true });
  try {
    const stored = JSON.parse(await readFile(databasePath, 'utf8'));
    for (const value of stored.accounts || []) {
      const profile = safeProfile(value.profile);
      if (profile && typeof value.id === 'string' && typeof value.username === 'string' && typeof value.hash === 'string' && typeof value.salt === 'string') {
        accounts.set(value.id, { ...value, profile, friends: Array.isArray(value.friends) ? value.friends : [], requests: Array.isArray(value.requests) ? value.requests : [] });
      }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw new Error('The account database could not be read. It has not been overwritten.', { cause: error }); }

  function persist() {
    const snapshot = JSON.stringify({ version: 1, accounts: [...accounts.values()] });
    writes = writes.catch(() => {}).then(async () => {
      await writeFile(databasePath + '.tmp', snapshot, { mode: 0o600 });
      await rename(databasePath + '.tmp', databasePath);
    });
    return writes;
  }
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
  function authenticated(request) {
    const token = cookieValue(request), session = token && sessions.get(token);
    if (!session || session.expires < Date.now()) { if (token) sessions.delete(token); return null; }
    return accounts.get(session.id) || null;
  }
  function sessionCookie(response, request, account) {
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { id: account.id, expires: Date.now() + SESSION_MS });
    const secure = request.socket.encrypted || process.env.COOKIE_SECURE === '1';
    response.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure ? '; Secure' : ''}`);
  }
  function respond(response, status, value) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
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
    };
  }
  function tellFriends(account) { const peer = peers.get(account.id); if (peer) send(peer.socket, { type: 'friends', ...friendList(account) }); }
  function broadcast(room, payload, except) { for (const id of room.members) { if (id !== except) { const peer = peers.get(id); if (peer) send(peer.socket, payload); } } }
  function presence(peer) {
    return { ...publicAccount(peer.account), ...peer.pose, id: peer.account.id, planet: peer.planet, space: peer.visit ? `home:${peer.visit}` : peer.planet === 'home' && Math.hypot(peer.pose.x, peer.pose.z) < 18 ? `home:${peer.account.id}` : 'wild', active: peer.active };
  }
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
  function join(peer, planet = 'home', party = null) {
    if (!Object.hasOwn(Game.PLANETS, planet)) throw failure(400, 'Unknown world.');
    if (party && !parties.has(party)) throw failure(404, 'That party code was not found.');
    const key = `${party || 'public'}:${planet}`;
    if (peer.room === key) return;
    const existing = rooms.get(key);
    if (existing?.members.size >= 24) throw failure(409, 'This world is full. Join a private party to play together.');
    leave(peer);
    const room = existing || { id: key, members: new Set(), host: null, enemies: [], environment:null, requests:new Map(), epoch: 0, killed: new Set(), contributors: new Map(), lastSnapshot: 0 };
    rooms.set(key, room); room.members.add(peer.account.id);
    peer.planet = planet; peer.party = party; peer.room = key; peer.visit = null; peer.pose = { ...peer.pose, x: 0, z: planet === 'home' ? 0 : 9 };
    elect(room);
    send(peer.socket, { type: 'joined', id: peer.account.id, room: key, party, host: room.host, planet, players: roster(room), enemies: room.enemies, environment:room.environment, epoch: room.epoch });
    broadcast(room, { type: 'enter', player: presence(peer) }, peer.account.id);
  }

  async function api(request, response, url) {
    if (!allowedOrigin(request)) throw failure(403, 'This origin is not allowed.');
    const route = url.pathname.slice(5), method = request.method;
    if (route === 'health' && method === 'GET') return respond(response, 200, { ok: true, online: peers.size, version: 1 });
    if ((route === 'auth/register' || route === 'auth/login') && method === 'POST') {
      rate(`auth:${request.socket.remoteAddress}`, 30);
      const data = await body(request), username = text(data.username, 24).toLowerCase(), password = typeof data.password === 'string' ? data.password : '';
      if (!/^[a-z0-9_]{3,24}$/.test(username) || password.length < 8 || password.length > 128) throw failure(400, 'Use a 3–24 character username and a password of at least 8 characters.');
      let account = [...accounts.values()].find(value => value.username === username);
      if (route === 'auth/register') {
        if (account) throw failure(409, 'That username is already taken.');
        const salt = randomBytes(16).toString('hex'), hash = (await derive(password, salt, 64)).toString('hex');
        account = { id: randomUUID(), username, salt, hash, createdAt: Date.now(), friends: [], requests: [], profile: Game.newGame(text(data.name, 20) || username, Game.COLORS.includes(data.color) ? data.color : Game.COLORS[0]) };
        if ([...accounts.values()].some(value => value.username === username)) throw failure(409, 'That username is already taken.');
        accounts.set(account.id, account); await persist();
      } else {
        const salt = account?.salt || 'missing-user-salt', hash = (await derive(password, salt, 64)).toString('hex');
        if (!account || !sameString(hash, account.hash)) throw failure(401, 'The username or password is incorrect.');
      }
      sessionCookie(response, request, account);
      return respond(response, 200, { account: publicAccount(account), profile: account.profile, revision:account.profileRevision||0, ...friendList(account) });
    }
    const account = authenticated(request);
    if (route === 'auth/session' && method === 'GET') return respond(response, 200, account ? { account: publicAccount(account), profile: account.profile, revision:account.profileRevision||0, ...friendList(account) } : { account: null });
    if (!account) throw failure(401, 'Sign in to play online.');
    if (route === 'auth/logout' && method === 'POST') {
      sessions.delete(cookieValue(request)); response.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      peers.get(account.id)?.socket.close(1000, 'Signed out'); return respond(response, 200, { ok: true });
    }
    if (route === 'profile' && method === 'PUT') {
      rate(`save:${account.id}`, 90);
      const data = await body(request), profile = safeProfile(data.profile);
      if (!profile) throw failure(400, 'This adventure could not be saved.');
      if(!Number.isSafeInteger(data.revision)||data.revision<1||typeof data.mutation!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(data.mutation))throw failure(400,'This save needs a valid revision.');
      if(data.mutation===account.lastMutation){await persist();return respond(response,200,{ok:true,revision:account.profileRevision,savedAt:account.profile.savedAt});}
      if(data.revision<=(account.profileRevision||0))throw failure(409,'A newer adventure is already saved. Reconnect to load it.');
      account.profile = profile; account.profileRevision=data.revision;account.lastMutation=data.mutation;account.receivedAt=Date.now();await persist();for(const visitor of peers.values())if(visitor.visit===account.id)send(visitor.socket,{type:'home',home:publicHome(account)});
      return respond(response, 200, { ok: true, revision:account.profileRevision,savedAt: account.profile.savedAt });
    }
    if (route === 'friends' && method === 'GET') return respond(response, 200, friendList(account));
    if (route.startsWith('friends/') && method === 'POST') {
      rate(`friend:${account.id}`, 25);
      const data = await body(request), target = accounts.get(data.id) || [...accounts.values()].find(value => value.username === text(data.username, 24).toLowerCase());
      if (!target || target.id === account.id) throw failure(404, 'Choose another explorer.');
      if (route === 'friends/request') {
        if (account.friends.includes(target.id)) throw failure(409, 'You are already friends.');
        if (!target.requests.includes(account.id)) target.requests.push(account.id);
      } else if (route === 'friends/accept') {
        if (!account.requests.includes(target.id)) throw failure(400, 'That friend request is no longer available.');
        account.requests = account.requests.filter(id => id !== target.id); target.requests = target.requests.filter(id => id !== account.id);
        if (!account.friends.includes(target.id)) account.friends.push(target.id);
        if (!target.friends.includes(account.id)) target.friends.push(account.id);
      } else if (route === 'friends/decline') account.requests = account.requests.filter(id => id !== target.id);
      else if (route === 'friends/remove') { account.friends = account.friends.filter(id => id !== target.id); target.friends = target.friends.filter(id => id !== account.id); }
      else throw failure(404, 'Unknown action.');
      await persist(); tellFriends(account); tellFriends(target); return respond(response, 200, friendList(account));
    }
    if (route.startsWith('homes/') && method === 'GET') {
      const target = accounts.get(route.slice(6));
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
  server.on('upgrade', (request, socket, head) => {
    if (request.url?.split('?')[0] !== '/socket' || !allowedOrigin(request)) return socket.destroy();
    const account = authenticated(request);
    if (!account) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return socket.destroy(); }
    sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws, request, account));
  });
  sockets.on('connection', (socket, request, account) => {
    const previous = peers.get(account.id); if (previous) { leave(previous); previous.socket.close(4001, 'This adventure was opened in another tab.'); }
    const peer = { socket, account, active: true, visit: null, party: null, room: null, planet: account.profile.planet, pose: { x: 0, z: 0, facing: 0, moving: false }, poseAt: 0, messages: 0 };
    peers.set(account.id, peer); send(socket, { type: 'welcome', id: account.id, ...friendList(account) });
    join(peer, Object.hasOwn(Game.PLANETS, account.profile.planet) ? account.profile.planet : 'home');
    for (const id of account.friends) if (accounts.has(id)) tellFriends(accounts.get(id));
    socket.on('message', raw => {
      try {
        rate(`messages:${account.id}`, 80, 1000);
        const message = JSON.parse(raw.toString());
        if (!message || typeof message.type !== 'string') return;
        const room = rooms.get(peer.room);
        if (message.type === 'active') { peer.active = message.active === true; if (room) elect(room); }
        else if (message.type === 'join') join(peer, message.planet, text(message.party, 8).toUpperCase() || null);
        else if (message.type === 'party') {
          const code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); parties.set(code, { owner: account.id, created: Date.now() });
          join(peer, peer.planet, code); send(socket, { type: 'party', code });
        } else if (message.type === 'pose' && room) {
          const now = Date.now(); if (now - peer.poseAt < 65) return;
          const x = number(message.x), z = number(message.z), elapsed = Math.min(5, (now - peer.poseAt) / 1000);
          const distance = Math.hypot(x - peer.pose.x, z - peer.pose.z);
          if (peer.poseAt && distance > 55 * elapsed + 8 && !(Math.hypot(x, z) < 2)) return;
          peer.poseAt = now; peer.pose = { x, z, y: number(message.y, 0, -30, 50), facing: number(message.facing, 0, -100, 100), moving: message.moving === true, hp: number(message.hp, 100, 0, 100000), maxHp: number(message.maxHp, 100, 1, 100000) };
          broadcast(room, { type: 'pose', player: presence(peer) }, account.id);
        } else if (message.type === 'chat' && room) {
          rate(`chat:${account.id}`, 24); const value = text(message.message, 160);
          if (value) broadcast(room, { type: 'chat', id: account.id, name: account.profile.name, message: value, at: Date.now() });
        } else if (message.type === 'visit') {
          const target = accounts.get(message.id);
          if (!target || !account.friends.includes(target.id)) throw failure(403, 'Become friends before visiting.');
          join(peer, 'home', peers.get(target.id)?.party || peer.party); peer.visit = target.id; peer.pose = { ...peer.pose, x: 0, z: 3 };
          send(socket, { type: 'visit', home: publicHome(target) }); broadcast(rooms.get(peer.room), { type: 'pose', player: presence(peer) }, account.id);
        } else if (message.type === 'leaveVisit') {
          peer.visit = null; send(socket, { type: 'visit', home: null }); if (room) broadcast(room, { type: 'pose', player: presence(peer) }, account.id);
        } else if (message.type === 'enemies' && room?.host === account.id && Array.isArray(message.enemies)) {
          if (Date.now() - room.lastSnapshot < 100) return; room.lastSnapshot = Date.now();
          const previousById = new Map(room.enemies.map(enemy => [enemy.id, enemy]));
          room.enemies = message.enemies.slice(0, 300).filter(enemy => enemy && typeof enemy.id === 'string').map(enemy => ({
            id: text(enemy.id, 100), x: number(enemy.x), z: number(enemy.z), y: number(enemy.y, 0, -30, 50), facing: number(enemy.facing, 0, -100, 100), hp: number(enemy.hp, 0, 0, 100000), maxHp: number(enemy.maxHp, 100, 1, 100000), respawn: number(enemy.respawn, 0, 0, 600), stun: number(enemy.stun, 0, 0, 10), type: text(enemy.type, 60), kind: text(enemy.kind, 40), boss: enemy.boss === true,
            phase:text(enemy.phase,24),phaseTime:number(enemy.phaseTime,0,0,60),lift:number(enemy.lift,0,0,20),liftVelocity:number(enemy.liftVelocity,0,-30,30),cooldown:number(enemy.cooldown,0,0,60),targetX:number(enemy.targetX,enemy.x),targetZ:number(enemy.targetZ,enemy.z),statuses:Object.fromEntries(STATUS_TYPES.map(kind=>[kind,number(enemy.statuses?.[kind],0,0,12)])),
            shots:(Array.isArray(enemy.shots)?enemy.shots:[]).slice(0,30).filter(v=>v&&typeof v.id==='string').map(v=>({id:text(v.id,100),x:number(v.x),y:number(v.y,1,-30,50),z:number(v.z),vx:number(v.vx,0,-100,100),vz:number(v.vz,0,-100,100),life:number(v.life,0,0,60),damage:number(v.damage,1,0,100000),targetEnemyId:typeof v.targetEnemyId==='string'?text(v.targetEnemyId,100):undefined})),
            skill:text(enemy.skill,40),bossStage:number(enemy.bossStage,0,0,4),attackCount:number(enemy.attackCount,0,0,1e9),skillCount:number(enemy.skillCount,0,0,1e9),spinTick:number(enemy.spinTick,0,0,10),damage:number(enemy.damage,1,0,100000),telegraphs:(Array.isArray(enemy.telegraphs)?enemy.telegraphs:[]).slice(0,32).map(v=>({x:number(v?.x),z:number(v?.z),r:number(v?.r,1,0,80),delay:number(v?.delay,0,0,60)})),skillEffects:(Array.isArray(enemy.skillEffects)?enemy.skillEffects:[]).slice(0,32).map(v=>({x:number(v?.x),z:number(v?.z),r:number(v?.r,1,0,80),inner:number(v?.inner,0,0,80),remaining:number(v?.remaining,0,0,60),multiplier:number(v?.multiplier,1,0,20)})),
          }));
          for (const enemy of room.enemies) if (enemy.hp > 0 && previousById.get(enemy.id)?.hp === 0) { room.killed.delete(enemy.id); room.contributors.delete(enemy.id); }
          broadcast(room, { type: 'enemies', enemies: room.enemies }, account.id);
        } else if (message.type === 'attack' && room && !peer.visit) {
          rate(`attack:${account.id}`, 45, 1000);
          const enemy = room.enemies.find(value => value.id === message.id && value.hp > 0);
          if (!enemy || Math.hypot(enemy.x - peer.pose.x, enemy.z - peer.pose.z) > 45) return;
          const contributors = room.contributors.get(message.id) || new Map(); contributors.set(account.id, Date.now()); room.contributors.set(message.id, contributors);
          const maximum = Math.max(25, Game.attack(account.profile) * 15);
          const hostPeer = peers.get(room.host);
          const damage=number(message.damage,1,0,maximum),impact=message.impact;
          if (hostPeer) send(hostPeer.socket, { type: 'attack', by: account.id, id: text(message.id, 100), damage, stun: number(message.stun, 0, 0, 5), impact:impact?{amount:damage,critical:impact.critical===true,stun:number(impact.stun,0,0,5),lift:number(impact.lift,0,0,12),knock:number(impact.knock,0,0,12),direction:{x:number(impact.direction?.x,0,-1,1),z:number(impact.direction?.z,0,-1,1)}}:undefined });
        } else if ((message.type === 'status'||message.type==='moveEnemy') && room && !peer.visit) {
          rate(`status:${account.id}`,45,1000);const enemy=room.enemies.find(value=>value.id===message.id&&value.hp>0);
          if(!enemy||Math.hypot(enemy.x-peer.pose.x,enemy.z-peer.pose.z)>45)return;
          const hostPeer=peers.get(room.host);if(!hostPeer)return;
          if(message.type==='status'&&STATUS_TYPES.includes(message.kind))send(hostPeer.socket,{type:'status',id:enemy.id,kind:message.kind,duration:number(message.duration,0,0,12)});
          if(message.type==='moveEnemy'){const x=number(message.x),z=number(message.z);if(Math.hypot(x-enemy.x,z-enemy.z)<=12)send(hostPeer.socket,{type:'moveEnemy',id:enemy.id,x,z});}
        } else if (message.type==='environment'&&room?.host===account.id&&message.snapshot) {
          const snapshot=message.snapshot;room.environment={time:number(snapshot.time,0,0,1e12),lamps:Array.isArray(snapshot.lamps)?snapshot.lamps.slice(0,40).filter(v=>Array.isArray(v)&&v.length===2).map(v=>[number(v[0],0,0,100),number(v[1],0,0,1e12)]):[],eclipseUntil:number(snapshot.eclipseUntil,0,0,1e12),nestLevel:number(snapshot.nestLevel,-.9,-.9,.32),fireRain:(Array.isArray(snapshot.fireRain)?snapshot.fireRain:[]).slice(0,120).filter(v=>v&&typeof v.id==='string').map(v=>({id:text(v.id,100),x:number(v.x,0,-150,150),z:number(v.z,0,-150,150),remaining:number(v.remaining,0,0,number(v.duration,1,.05,2)),duration:number(v.duration,1,0.05,2)})),lightning:snapshot.lightning?{wait:number(snapshot.lightning.wait,6,0,13),sequence:number(snapshot.lightning.sequence,0,0,1e12),bolts:(Array.isArray(snapshot.lightning.bolts)?snapshot.lightning.bolts:[]).slice(0,12).filter(v=>v&&typeof v.id==='string').map(v=>({id:text(v.id,100),x:number(v.x,0,-150,150),z:number(v.z,0,-150,150),remaining:number(v.remaining,0,0,number(v.duration,1.2,.05,2)),duration:number(v.duration,1.2,.05,2)}))}:undefined,weather:cleanWeather(snapshot.weather)};
          broadcast(room,{type:'environment',snapshot:room.environment},account.id);
        } else if(message.type==='environmentAction'&&room&&!peer.visit){
          rate(`environment:${account.id}`,30);const action=message.action;if(!action||!['light-pillar','collect-ore'].includes(action.kind))return;
          if(action.kind==='collect-ore'){const ore=room.environment?.weather?.ores.find(value=>value.id===action.id);if(!ore||Math.hypot(ore.x-peer.pose.x,ore.z-peer.pose.z)>3.5)return;}
          for(const[id,pending]of room.requests)if(Date.now()-pending.at>10000)room.requests.delete(id);if(room.requests.size>=100)return;
          const requestId=randomUUID();room.requests.set(requestId,{by:account.id,at:Date.now(),kind:action.kind});const hostPeer=peers.get(room.host);
          if(hostPeer)send(hostPeer.socket,{type:'environmentAction',requestId,by:account.id,action:{kind:action.kind,id:text(action.id,100),index:number(action.index,0,0,100)}});
        } else if(message.type==='environmentResult'&&room?.host===account.id){
          const pending=room.requests.get(message.requestId);if(!pending)return;room.requests.delete(message.requestId);const recipient=peers.get(pending.by);if(!recipient||recipient.room!==room.id)return;
          if(message.ok&&pending.kind==='collect-ore'){const rewards=(Array.isArray(message.rewards)?message.rewards:[]).slice(0,10).filter(v=>v&&Object.hasOwn(Game.ITEMS,v.id)).map(v=>({id:v.id,count:Math.floor(number(v.count,1,1,50))}));send(recipient.socket,{type:'environmentReward',eventId:message.requestId,rewards});}
        } else if (message.type === 'defeat' && room?.host === account.id) {
          const id = text(message.id, 100); if (room.killed.has(id)) return;
          const enemy = room.enemies.find(value => value.id === id); if (!enemy) return;
          room.killed.add(id); enemy.hp = 0;
          const contributors = room.contributors.get(id) || new Map([[account.id, Date.now()]]);
          const rewards = { eventId: randomUUID(), xp: number(message.xp, 6, 0, 1000), energy: number(message.energy, 4, 0, 1000), item: Object.hasOwn(Game.ITEMS, message.item) ? message.item : peer.planet === 'lava' ? 'ember' : 'wood', enemyId: id, enemy: text(message.enemy || enemy.type, 60), boss: enemy.boss };
          for (const [id, at] of contributors) if (Date.now() - at < 30_000 && room.members.has(id)) { const recipient = peers.get(id); if (recipient) send(recipient.socket, { type: 'reward', reward: rewards }); }
          broadcast(room, { type: 'defeat', id, by: [...contributors.keys()] });
        } else if (message.type === 'damage' && room?.host === account.id && room.members.has(message.id)) {
          const recipient = peers.get(message.id); if (recipient) send(recipient.socket, { type: 'damage', amount: number(message.amount, 0, 0, 1000), source: text(message.source, 100) });
        } else if (message.type === 'effect' && room) {
          const visual=message.visual,cleanVisual=visual&&['arc','ring','impact','trail','beam','cast'].includes(visual.kind)?{kind:visual.kind,x:number(visual.x),z:number(visual.z),radius:number(visual.radius,1,0,40),facing:number(visual.facing,0,-100,100),duration:number(visual.duration,.4,0,5),color:/^#[a-f0-9]{6}$/i.test(visual.color)?visual.color:'#fff2a0'}:null;
          broadcast(room, { type: 'effect', visual:cleanVisual, by: account.id, effect: text(message.effect, 30), x: number(message.x), z: number(message.z), color: /^#[a-f0-9]{6}$/i.test(message.color) ? message.color : '#fff2a0' }, account.id);
        }
      } catch (error) { send(socket, { type: 'error', message: error.status ? error.message : 'That action could not be completed.' }); }
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
    for (const [key, value] of parties) if (now - value.created > 24 * 60 * 60 * 1000 && ![...rooms.keys()].some(room => room.startsWith(key + ':'))) parties.delete(key);
  }, 60_000); cleanup.unref();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return {
    server, port: server.address().port, url: `http://${host}:${server.address().port}`,
    async close() { if (closing) return; closing = true; clearInterval(cleanup); for (const peer of peers.values()) peer.socket.terminate(); await new Promise(resolve => sockets.close(resolve)); await new Promise(resolve => server.close(resolve)); await writes; },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const game = await createGameServer();
  console.log(`Zoo Garden server is ready at ${game.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await game.close(); process.exit(0); });
}




