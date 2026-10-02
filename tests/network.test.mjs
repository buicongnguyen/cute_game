import test from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/server.mjs';
import { createAccountStore } from '../server/account-store.mjs';
import { enemyRoster } from '../src/enemy-roster.ts';
import { ITEMS } from '../src/model.ts';
import { beginTitanAttack, titanTelegraphs } from '../src/titan-patterns.ts';

function connect(url, cookie) {
  return new Promise((resolve,reject) => {
    const socket = new WebSocket(url.replace('http:','ws:')+'/socket', {headers:{Cookie:cookie}});
    const queue=[], waiters=[];
    socket.on('message', raw => { const item=JSON.parse(raw); const waiter=waiters.find(w=>w.predicate(item)); if(waiter){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timer);waiter.resolve(item);} else queue.push(item); });
    socket.once('error',reject);
    socket.once('open',()=>resolve({socket,send:value=>socket.send(JSON.stringify(value)),drain(predicate){const found=[];for(let i=0;i<queue.length;)if(predicate(queue[i]))found.push(...queue.splice(i,1));else i++;return found;},next(predicate,timeout=4000){const i=queue.findIndex(predicate);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const waiter={predicate,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(waiter),1);reject(new Error('Missing socket event'));},timeout)};waiters.push(waiter);});}}));
  });
}

// The server's combat tick also broadcasts `enemies` every 250 ms, including an empty list
// before the host's first snapshot is accepted, so wait for the snapshot that carries the ids.
const enemiesWith=(...ids)=>m=>m.type==='enemies'&&Array.isArray(m.enemies)&&ids.every(id=>m.enemies.some(e=>e.id===id));

test('local multiplayer: accounts, saves, friendship, privacy, rooms and host migration', async t => {
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'zoo-garden-network-test-'));
  const game=await createGameServer({port:0,dataDir,databaseUrl:'',databaseRequired:false});
  const sockets=[];
  t.after(async()=>{for(const client of sockets)client.socket.terminate();await game.close();});
  async function call(route,body,cookie,method=body?'POST':'GET',origin){const response=await fetch(game.url+'/api/'+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  assert.equal((await call('profile',{profile:{}},null,'PUT')).status,401);
  assert.equal((await call('auth/register',{username:'bad',password:'short'})).status,400);
  assert.equal((await call('auth/register',{username:'intruder',password:'password-one'},null,'POST','https://unrelated.example')).status,403);
  const alice=await call('auth/register',{username:'alice',password:'password-one',name:'Alice'});
  const bob=await call('auth/register',{username:'bob',password:'password-two',name:'Bob'});
  assert.equal(alice.status,200);assert.equal(bob.status,200);assert.ok(alice.cookie);assert.notEqual(alice.data.account.id,bob.data.account.id);
  assert.equal((await call('auth/register',{username:'alice',password:'password-other'})).status,409);
  assert.equal((await call('auth/login',{username:'alice',password:'wrong-password'})).status,401);
  assert.equal((await call('auth/session',null,alice.cookie)).data.account.username,'alice');
  const profile=alice.data.profile;profile.energy=321;profile.name='Alice 🌱';
  assert.equal((await call('profile',{profile,revision:1,mutation:randomUUID()},alice.cookie,'PUT')).status,409);
  const settings=await call('actions',{type:'settings',payload:{name:'Alice 🌱'},rulesVersion:1,expectedRevision:alice.data.revision,requestId:randomUUID()},alice.cookie);assert.equal(settings.status,200);
  assert.equal((await call('auth/session',null,alice.cookie)).data.profile.energy,0);
  assert.equal((await call('homes/'+alice.data.account.id,null,bob.cookie)).status,403);
  assert.equal((await call('friends/request',{username:'alice'},bob.cookie)).status,200);
  const requests=await call('friends',null,alice.cookie);assert.equal(requests.data.requests[0].id,bob.data.account.id);
  assert.equal((await call('friends/accept',{id:bob.data.account.id},alice.cookie)).status,200);
  const home=await call('homes/'+alice.data.account.id,null,bob.cookie);assert.equal(home.status,200);assert.ok(Array.isArray(home.data.home.plots));assert.equal(home.data.home.bag,undefined);assert.equal(home.data.home.energy,undefined);assert.equal(home.data.home.hash,undefined);
  const a=await connect(game.url,alice.cookie);sockets.push(a);const initialA=await a.next(m=>m.type==='joined');assert.equal(initialA.host,alice.data.account.id);
  const b=await connect(game.url,bob.cookie);sockets.push(b);const initialB=await b.next(m=>m.type==='joined');assert.equal(initialB.host,alice.data.account.id);assert.equal(initialB.players.length,2);
  const enemy=enemyRoster('home').find(e=>e.zone==='forest'&&!e.boss);a.send({type:'enemies',enemies:[{id:enemy.id,type:enemy.type,x:-30,z:0,hp:1,maxHp:1}]});
  assert.equal((await b.next(enemiesWith(enemy.id))).enemies.find(e=>e.id===enemy.id).hp,enemy.baseMaxHp);
  b.send({type:'chat',message:'Hello, explorer!'});assert.equal((await a.next(m=>m.type==='chat')).message,'Hello, explorer!');
  a.send({type:'active',active:false});assert.equal((await b.next(m=>m.type==='authority'&&m.host===bob.data.account.id)).host,bob.data.account.id);
  b.send({type:'visit',id:alice.data.account.id});assert.equal((await b.next(m=>m.type==='visit')).home.id,alice.data.account.id);
  b.send({type:'leaveVisit'});assert.equal((await b.next(m=>m.type==='visit')).home,null);
  b.send({type:'party'});const privateParty=await b.next(m=>m.type==='party');assert.match(privateParty.code,/^[A-F0-9]{6}$/);
  a.send({type:'join',planet:'home',party:privateParty.code});const joinedParty=await a.next(m=>m.type==='joined'&&m.party===privateParty.code);assert.equal(joinedParty.players.length,2);
  const raw=await readFile(path.join(dataDir,'accounts.json'),'utf8');assert.ok(!raw.includes('password-one'));assert.ok(!raw.includes('zoo_session'));assert.equal(JSON.parse(raw).accounts.find(v=>v.username==='alice').profile.energy,0);
  await call('auth/logout',{},alice.cookie);assert.equal((await call('auth/session',null,alice.cookie)).data.account,null);
  await game.close();
  const restarted=await createGameServer({port:0,dataDir,databaseUrl:'',databaseRequired:false});
  try {const response=await fetch(restarted.url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'alice',password:'password-one'})});assert.equal(response.status,200);assert.equal((await response.json()).profile.energy,0);} finally {await restarted.close();}
});

async function protocolRoom(t,{planet='home',configure=()=>{}}={}) {
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'zoo-garden-protocol-test-'));
  const store=await createAccountStore({dataDir,databaseUrl:''});
  const game=await createGameServer({port:0,dataDir,accountStore:store,databaseUrl:'',databaseRequired:false}),clients=[];
  t.after(async()=>{for(const client of clients)client.socket.terminate();await game.close();});
  async function explorer(username){
    const response=await fetch(game.url+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'protocol-password'})});
    assert.equal(response.status,200);let session=await response.json();const cookie=response.headers.get('set-cookie').split(';')[0];
    await store.command({actorId:session.account.id,requestId:randomUUID(),hash:'a'.repeat(64),expectedRevision:session.revision,actionType:'testFixture',run:records=>{const profile=records.get(session.account.id).profile;profile.planet=planet;profile.visited=[...new Set(['home',planet])];profile.discovered=[...profile.visited];configure(profile,username);return true;}});
    session=await (await fetch(game.url+'/api/auth/session',{headers:{Cookie:cookie}})).json();
    const client=await connect(game.url,cookie);clients.push(client);const joined=await client.next(m=>m.type==='joined');
    return Object.assign(client,{id:session.account.id,cookie,session,joined});
  }
  const host=await explorer('host_player'),peer=await explorer('peer_player');
  assert.equal(peer.joined.host,host.id);
  // Chat is an ordered protocol barrier, avoiding arbitrary sleeps for negative assertions.
  async function barrier(sender,receiver){const marker=randomUUID();sender.send({type:'chat',message:marker});await receiver.next(m=>m.type==='chat'&&m.message===marker);}
  async function action(client,type,payload={},extra={}){const current=await (await fetch(game.url+'/api/auth/session',{headers:{Cookie:client.cookie}})).json();const response=await fetch(game.url+'/api/actions',{method:'POST',headers:{Cookie:client.cookie,'Content-Type':'application/json'},body:JSON.stringify({type,payload,rulesVersion:1,requestId:randomUUID(),expectedRevision:current.revision,...extra})});return {status:response.status,data:await response.json()};}
  return {game,host,peer,explorer,barrier,store,action};
}

test('visiting a garden from another planet preserves the saved destination and returns to its room',async t=>{
  const {game,host,peer,store}=await protocolRoom(t,{planet:'lava'});
  await store.friendAction(host.id,peer.id,'request');await store.friendAction(peer.id,host.id,'accept');
  // Refresh the server's live account records after this test-only setup.
  for(const client of [host,peer])await fetch(game.url+'/api/auth/session',{headers:{Cookie:client.cookie}});
  peer.send({type:'visit',id:host.id});
  const entered=await peer.next(message=>message.type==='joined'&&message.planet==='home');assert.equal(entered.visiting,host.id);
  assert.equal((await peer.next(message=>message.type==='visit')).home.id,host.id);
  assert.equal((await store.get(peer.id)).profile.planet,'lava');
  peer.send({type:'leaveVisit'});assert.equal((await peer.next(message=>message.type==='visit'&&!message.home)).home,null);
  const back=await peer.next(message=>message.type==='joined'&&message.planet==='lava');assert.equal(back.visiting,null);assert.equal(back.room,'public:lava');
  assert.equal((await store.get(peer.id)).profile.planet,'lava');
});

test('returning from a garden in the same room refreshes the canonical scene and restores visible ground loot',async t=>{
  const {game,host,peer,store,action}=await protocolRoom(t,{configure:profile=>{profile.bag.carrot=1;}});
  await store.friendAction(host.id,peer.id,'request');await store.friendAction(peer.id,host.id,'accept');
  for(const client of [host,peer])await fetch(game.url+'/api/auth/session',{headers:{Cookie:client.cookie}});
  const dropped=await action(peer,'dropItem',{id:'carrot',count:1});assert.equal(dropped.status,200);
  peer.send({type:'visit',id:host.id});await peer.next(message=>message.type==='joined'&&message.visiting===host.id);await peer.next(message=>message.type==='visit'&&message.home?.id===host.id);
  const visiting=await (await fetch(game.url+'/api/drops',{headers:{Cookie:peer.cookie}})).json();assert.deepEqual(visiting.drops,[]);
  peer.send({type:'leaveVisit'});await peer.next(message=>message.type==='visit'&&!message.home);
  const returned=await peer.next(message=>message.type==='joined'&&message.visiting===null);assert.equal(returned.room,'public:home');assert.ok(returned.players.some(player=>player.id===peer.id));
  const own=await (await fetch(game.url+'/api/drops',{headers:{Cookie:peer.cookie}})).json();assert.equal(own.drops.length,1);assert.equal(own.drops[0].id,dropped.data.result.id);
});

test('combat quantities and rewards are authoritative while canonical boss visuals are replicated',async t=>{
  const {host,peer,barrier,game}=await protocolRoom(t);
  const canonical=enemyRoster('home').find(e=>e.type==='treant');
  const boss={id:canonical.id,type:canonical.type,x:-40,z:3,hp:1,maxHp:1,damage:999999,phase:'windup',phaseTime:.8,skill:'rain',bossStage:2,attackCount:6,skillCount:3,spinTick:.2,lift:1,liftVelocity:3,cooldown:1.4,targetX:-38,targetZ:2,statuses:{charm:999},telegraphs:[{x:-38,z:2,r:2,delay:1.3}],skillEffects:[{x:-40,z:3,r:6,inner:3.6,remaining:.44,multiplier:1.1}]};
  host.send({type:'enemies',enemies:[boss,{...boss,id:'invented-enemy'}]});
  const received=(await peer.next(enemiesWith(canonical.id))).enemies;assert.equal(received.length,1);const snapshot=received[0];
  for(const key of ['phase','phaseTime','skill','bossStage','attackCount','skillCount','spinTick','lift','liftVelocity','cooldown','targetX','targetZ'])assert.equal(snapshot[key],boss[key],key);
  assert.equal(snapshot.hp,canonical.baseMaxHp);assert.equal(snapshot.maxHp,canonical.baseMaxHp);assert.equal(snapshot.damage,canonical.baseDamage);assert.ok(!snapshot.statuses.charm);
  assert.deepEqual(snapshot.telegraphs.map(({x,z,r,delay})=>({x,z,r,delay})),boss.telegraphs);
  peer.send({type:'attack',id:boss.id,damage:1e9});peer.send({type:'status',id:boss.id,kind:'charm',duration:999});peer.send({type:'moveEnemy',id:boss.id,x:1,z:1});peer.send({type:'enemies',enemies:[{...boss,hp:0}]});peer.send({type:'damage',id:host.id,amount:1e9});host.send({type:'defeat',id:boss.id,xp:1e9,energy:1e9,item:'star'});
  await barrier(peer,host);await barrier(host,peer);assert.deepEqual(host.drain(m=>['attack','status','moveEnemy','damage','reward','defeat'].includes(m.type)),[]);assert.deepEqual(peer.drain(m=>['reward','defeat'].includes(m.type)),[]);
  const session=await (await fetch(game.url+'/api/auth/session',{headers:{Cookie:peer.cookie}})).json();assert.equal(session.profile.counters.kills,0);assert.equal(session.profile.energy,0);assert.equal(session.profile.hp,100);
});

test('one server-simulated basic kill commits once and forged raw attacks cannot award progress',async t=>{
  const {host,peer,barrier,game}=await protocolRoom(t,{configure:(profile,name)=>{if(name==='peer_player')profile.attackUp=1000;}});
  const enemy=enemyRoster('home').find(e=>e.zone==='forest'&&!e.boss),spawn={id:enemy.id,type:enemy.type,x:-30,z:0,hp:999999,maxHp:999999};
  host.send({type:'enemies',enemies:[spawn]});await peer.next(enemiesWith(spawn.id));peer.send({type:'pose',x:-30,z:1});await host.next(m=>m.type==='pose'&&m.player.id===peer.id);
  const before=await (await fetch(game.url+'/api/auth/session',{headers:{Cookie:peer.cookie}})).json();
  peer.send({type:'basic',targetId:enemy.id});const death=await peer.next(m=>m.type==='defeat'&&m.id===enemy.id);assert.deepEqual(death.by,[peer.id]);
  const saved=await (await fetch(game.url+'/api/auth/session',{headers:{Cookie:peer.cookie}})).json();assert.equal(saved.profile.counters.kills,before.profile.counters.kills+1);assert.equal(saved.profile.xp-before.profile.xp,enemy.xp);assert.ok(saved.revision>before.revision);
  peer.send({type:'basic',targetId:enemy.id});peer.send({type:'attack',id:enemy.id,damage:1e9});host.send({type:'defeat',id:enemy.id,xp:1e9});await barrier(host,peer);assert.deepEqual(peer.drain(m=>m.type==='defeat'&&m.id===enemy.id),[]);
  const final=await (await fetch(game.url+'/api/auth/session',{headers:{Cookie:peer.cookie}})).json();assert.equal(final.profile.counters.kills,1);assert.equal(final.profile.energy,saved.profile.energy);
});

test('healing settles buffered combat damage and preserves food on a stale revision',async t=>{
  // Hold only automatic world/health intervals; WS and HTTP still run normally.
  t.mock.timers.enable({apis:['setInterval']});
  const {host,peer,barrier,store,action}=await protocolRoom(t,{configure:profile=>{profile.hp=50;profile.bag.carrot=1;}});
  const enemy=enemyRoster('home').find(value=>value.zone==='forest'&&!value.boss);
  host.send({type:'enemies',enemies:[{id:enemy.id,type:enemy.type,x:-30,z:0}]});await peer.next(enemiesWith(enemy.id));
  peer.send({type:'pose',x:-30,z:1});await host.next(message=>message.type==='pose'&&message.player.id===peer.id);
  host.send({type:'damage',id:peer.id,enemyId:enemy.id});await barrier(host,peer);
  assert.equal((await store.get(peer.id)).profile.hp,50,'damage is still buffered before the action');
  const stale=await action(peer,'eat',{id:'carrot'},{expectedRevision:peer.session.revision});assert.equal(stale.status,409);
  const damaged=await store.get(peer.id);assert.ok(damaged.profile.hp<50);assert.equal(damaged.profile.bag.carrot,1,'conflicting heal keeps the food');
  const healed=await action(peer,'eat',{id:'carrot'});assert.equal(healed.status,200);assert.equal(healed.data.profile.hp,damaged.profile.hp+ITEMS.carrot.heal);assert.ok(!healed.data.profile.bag.carrot);
});

test('server-owned volcano weather advances through host migration and ignores forged weather',async t=>{
  const {host,peer,explorer,barrier}=await protocolRoom(t,{planet:'lava'});
  const first=(await peer.next(m=>m.type==='environment')).snapshot;assert.ok(first.time>=0);assert.ok(Number.isFinite(first.weather.seed));
  const forged={time:99999,lamps:[[0,1e9]],eclipseUntil:1e9,weather:{...first.weather,time:99999,seed:123456,ores:[{id:'forged-gold',kind:'meteor',x:0,z:0,y:0,expiresAt:1e9}]}};
  host.send({type:'environment',snapshot:forged});await barrier(host,peer);const after=(await peer.next(m=>m.type==='environment'&&m.snapshot.time>first.time)).snapshot;
  assert.ok(after.time-first.time<2);assert.notEqual(after.time,99999);assert.equal(after.weather.seed,first.weather.seed);assert.ok(!after.weather.ores.some(o=>o.id==='forged-gold'));assert.equal(after.eclipseUntil,0);
  const late=await explorer('late_player');assert.equal(late.joined.environment.weather.seed,first.weather.seed);assert.ok(late.joined.environment.time>=after.time);
  peer.drain(m=>m.type==='authority');host.send({type:'active',active:false});const migrated=await peer.next(m=>m.type==='authority'&&m.host===peer.id);assert.ok(migrated.environment.time>=after.time);assert.equal(migrated.environment.weather.seed,first.weather.seed);
  peer.send({type:'environment',snapshot:forged});const resumed=(await peer.next(m=>m.type==='environment'&&m.snapshot.time>migrated.environment.time)).snapshot;assert.ok(resumed.time-migrated.environment.time<2);assert.notEqual(resumed.time,99999);assert.equal(resumed.weather.seed,first.weather.seed);
});

test('invented meteor claims and obsolete host reward acknowledgements cannot grant items',async t=>{
  const {host,peer,barrier,action,game}=await protocolRoom(t,{planet:'lava'});
  const before=await (await fetch(game.url+'/api/auth/session',{headers:{Cookie:peer.cookie}})).json();
  const denied=await action(peer,'collectMeteor',{id:'invented-meteor'});assert.equal(denied.status,409);
  host.send({type:'environmentResult',requestId:randomUUID(),ok:true,rewards:[{id:'mcrystal',count:99}]});peer.send({type:'environmentAction',action:{kind:'collect-ore',id:'invented-meteor'}});await barrier(host,peer);assert.deepEqual(peer.drain(m=>m.type==='environmentReward'),[]);
  const after=await (await fetch(game.url+'/api/auth/session',{headers:{Cookie:peer.cookie}})).json();assert.deepEqual(after.profile.bag,before.profile.bag);
});

test('late join and host migration retain bounded projectiles and Titan attack visuals',async t=>{
  const {host,peer,explorer}=await protocolRoom(t);
  const roster=enemyRoster('home'),first=roster.find(e=>e.zone==='forest'&&!e.boss),titan=roster.find(e=>e.titan),source={x:100,z:0,radius:titan.radius,facing:0},targets=[{id:peer.id,x:95,z:1}];
  const attack=beginTitanAttack('lines',source,titanTelegraphs('lines',source,targets[0],targets,()=>.5),targets);
  const enemy={id:first.id,type:first.type,x:-30,z:2,hp:1,shots:[{id:'shot:one',x:-29,y:1.2,z:2,vx:13,vz:0,life:.8,damage:999999,targetEnemyId:titan.id}]};
  const boss={id:titan.id,type:titan.type,x:100,z:0,hp:1,phase:'windup',skill:'lines',phaseTime:.8,titanAttacks:[attack],telegraphs:attack.marks,titanLift:2,shots:Array.from({length:35},(_,i)=>({id:`titan:shot:${i}`,x:98,y:999,z:1,vx:500,vz:-500,life:500,damage:1e8}))};
  host.send({type:'enemies',enemies:[enemy,boss]});const received=(await peer.next(enemiesWith(enemy.id,boss.id))).enemies;
  const shot=received[0].shots[0];assert.equal(shot.targetEnemyId,titan.id);assert.equal(shot.damage,first.baseDamage);assert.equal(shot.vx,13);
  assert.equal(received[1].shots.length,30);assert.equal(received[1].shots[0].damage,titan.baseDamage);assert.equal(received[1].shots[0].vx,100);assert.equal(received[1].shots[0].y,50);assert.equal(received[1].shots[0].life,60);assert.deepEqual(received[1].titanAttacks,[attack]);assert.equal(received[1].telegraphs.length,42);
  const late=await explorer('projectile_viewer');assert.deepEqual(late.joined.enemies.map(e=>e.shots),received.map(e=>e.shots));assert.deepEqual(late.joined.enemies[1].titanAttacks,[attack]);
  peer.drain(m=>m.type==='authority');host.send({type:'active',active:false});const migrated=await peer.next(m=>m.type==='authority'&&m.host===peer.id);assert.deepEqual(migrated.enemies[1].titanAttacks,[attack]);assert.equal(migrated.enemies[0].shots[0].targetEnemyId,titan.id);
});

test('concurrent registrations cannot duplicate an account name',async()=>{
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'zoo-garden-registration-test-'));
  const game=await createGameServer({port:0,dataDir,databaseUrl:'',databaseRequired:false});
  try {const results=await Promise.all([1,2].map(()=>fetch(game.url+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'same_name',password:'password-one'})})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);}finally{await game.close();}
});


test('server-approved actions preserve progress with durable receipts and reject stale or forged profile writes',async()=>{
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'zoo-garden-revision-test-'));
  const game=await createGameServer({port:0,dataDir,databaseUrl:'',databaseRequired:false});
  try{
    const registered=await fetch(game.url+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'revision_test',password:'password-three'})});
    const cookie=registered.headers.get('set-cookie').split(';')[0],session=await registered.json();
    const call=async(route,job,method='POST')=>{const response=await fetch(game.url+'/api/'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(job)});return {status:response.status,data:await response.json()};};
    const first={type:'settings',payload:{name:'Amber',energy:99999},rulesVersion:1,expectedRevision:session.revision,requestId:randomUUID()};const saved=await call('actions',first);assert.equal(saved.status,200);assert.equal(saved.data.profile.energy,0);assert.equal(saved.data.profile.name,'Amber');
    const retried=await call('actions',first);assert.equal(retried.status,200);assert.equal(retried.data.replayed,true);assert.equal(retried.data.revision,saved.data.revision);
    assert.equal((await call('actions',{...first,payload:{name:'Modified retry'}})).status,409);
    const planted=await call('actions',{type:'plant',payload:{index:0,id:'carrot'},rulesVersion:1,expectedRevision:saved.data.revision,requestId:randomUUID()});assert.equal(planted.status,200);assert.equal(planted.data.profile.plots[0].crop,'carrot');assert.ok(planted.data.profile.plots[0].plantedAt>Date.now()-5000);
    assert.equal((await call('actions',{...first,requestId:randomUUID()})).status,409);
    const jobs=['Aster','Willow'].map(name=>({type:'settings',payload:{name},rulesVersion:1,expectedRevision:planted.data.revision,requestId:randomUUID()}));const concurrent=await Promise.all(jobs.map(job=>call('actions',job)));assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
    assert.equal((await call('profile',{profile:{...session.profile,energy:999999},revision:999,mutation:randomUUID()},'PUT')).status,409);
    const final=await (await fetch(game.url+'/api/auth/session',{headers:{Cookie:cookie}})).json();assert.equal(final.profile.energy,0);assert.equal(final.profile.plots[0].crop,'carrot');assert.equal(final.revision,planted.data.revision+1);
    const stored=JSON.parse(await readFile(path.join(dataDir,'accounts.json'),'utf8')).accounts[0];assert.equal(stored.profileRevision,final.revision);assert.equal(stored.profile.energy,0);assert.equal(stored.profile.plots[0].plantedAt,planted.data.profile.plots[0].plantedAt);
  }finally{await game.close();}
});

test('chat acknowledgements are sender-only and retries do not broadcast twice',async t=>{
  const {host,peer,barrier}=await protocolRoom(t);
  const message={type:'chat',requestId:randomUUID(),message:'Xin chào, explorer!'};
  host.send(message);
  assert.deepEqual(await host.next(m=>m.type==='chatAck'),{type:'chatAck',requestId:message.requestId});
  const received=await peer.next(m=>m.type==='chat'&&m.message===message.message);
  assert.equal(received.id,host.id);assert.equal(received.name,host.session.profile.name);assert.equal(received.requestId,undefined,'delivery receipts are not exposed to other players');
  assert.equal((await host.next(m=>m.type==='chat'&&m.message===message.message)).id,host.id);
  await barrier(host,peer);assert.deepEqual(peer.drain(m=>m.type==='chatAck'),[]);

  host.send(message);
  assert.deepEqual(await host.next(m=>m.type==='chatAck'),{type:'chatAck',requestId:message.requestId});
  await barrier(host,peer);
  assert.deepEqual(peer.drain(m=>m.type==='chat'&&m.message===message.message),[]);
  assert.deepEqual(host.drain(m=>m.type==='chat'&&m.message===message.message),[]);
  assert.deepEqual(peer.drain(m=>m.type==='chatAck'),[]);
});

test('a chat request ID cannot be reused for changed text or another room',async t=>{
  const {host,peer,barrier}=await protocolRoom(t);
  const message={type:'chat',requestId:randomUUID(),message:'Original conversation'};
  host.send(message);await host.next(m=>m.type==='chatAck'&&m.requestId===message.requestId);
  await peer.next(m=>m.type==='chat'&&m.message===message.message);await host.next(m=>m.type==='chat'&&m.message===message.message);

  host.send({...message,message:'Changed text'});
  assert.deepEqual(await host.next(m=>m.type==='error'),{type:'error',requestId:message.requestId,message:'That message was already sent in another conversation.'});
  await barrier(host,peer);assert.deepEqual(peer.drain(m=>m.type==='chat'&&m.message==='Changed text'),[]);assert.deepEqual(host.drain(m=>m.type==='chatAck'),[]);

  host.send({type:'party'});const room=await host.next(m=>m.type==='party');await host.next(m=>m.type==='joined'&&m.party===room.code);
  host.send(message);
  assert.deepEqual(await host.next(m=>m.type==='error'),{type:'error',requestId:message.requestId,message:'That message was already sent in another conversation.'});
  await barrier(host,host);assert.deepEqual(host.drain(m=>m.type==='chat'&&m.message===message.message),[]);assert.deepEqual(host.drain(m=>m.type==='chatAck'),[]);

  // Request IDs are scoped to an authenticated account, not another player's text.
  peer.send(message);assert.deepEqual(await peer.next(m=>m.type==='chatAck'),{type:'chatAck',requestId:message.requestId});assert.equal((await peer.next(m=>m.type==='chat'&&m.message===message.message)).id,peer.id);
});

test('empty chat rejection includes its request ID and broadcasts no message',async t=>{
  const {host,peer,barrier}=await protocolRoom(t),requestId=randomUUID();
  host.send({type:'chat',requestId,message:' \n\u0000\t '});
  assert.deepEqual(await host.next(m=>m.type==='error'),{type:'error',requestId,message:'Write a message before sending.'});
  await barrier(peer,peer);await barrier(peer,host);
  assert.deepEqual(host.drain(m=>m.type==='chatAck'||m.type==='chat'&&!m.message.trim()),[]);
  assert.deepEqual(peer.drain(m=>m.type==='chatAck'||m.type==='chat'&&!m.message.trim()),[]);
});

test('chat rate rejection preserves request IDs while an accepted retry remains idempotent',async t=>{
  const {host,peer,barrier}=await protocolRoom(t),accepted=[];
  for(let i=0;i<24;i++){
    const message={type:'chat',requestId:randomUUID(),message:`Allowed message ${i}`};accepted.push(message);host.send(message);
    assert.equal((await host.next(m=>m.type==='chatAck')).requestId,message.requestId);
  }
  await peer.next(m=>m.type==='chat'&&m.message===accepted.at(-1).message);
  assert.equal(peer.drain(m=>m.type==='chat').length,23);assert.equal(host.drain(m=>m.type==='chat').length,24);

  const rejected={type:'chat',requestId:randomUUID(),message:'This exceeds the limit'};host.send(rejected);
  assert.deepEqual(await host.next(m=>m.type==='error'),{type:'error',requestId:rejected.requestId,message:'Please wait a moment before trying again.'});
  host.send(accepted[0]);assert.deepEqual(await host.next(m=>m.type==='chatAck'),{type:'chatAck',requestId:accepted[0].requestId});
  // The other account supplies the ordered barrier because this sender is rate-limited.
  await barrier(peer,peer);
  assert.deepEqual(peer.drain(m=>m.type==='chat'&&[rejected.message,accepted[0].message].includes(m.message)),[]);
  assert.deepEqual(host.drain(m=>m.type==='chat'&&[rejected.message,accepted[0].message].includes(m.message)),[]);
  assert.deepEqual(peer.drain(m=>m.type==='chatAck'),[]);
});

test('same-account reconnect retains chat receipts and acknowledges a retry without rebroadcast',async t=>{
  const {game,host,peer,barrier}=await protocolRoom(t);
  const message={type:'chat',requestId:randomUUID(),message:'Only once across reconnect'};
  host.send(message);await host.next(m=>m.type==='chatAck'&&m.requestId===message.requestId);await peer.next(m=>m.type==='chat'&&m.message===message.message);
  const replaced=new Promise(resolve=>host.socket.once('close',code=>resolve(code)));
  const reconnected=await connect(game.url,host.cookie);t.after(()=>reconnected.socket.terminate());
  const joined=await reconnected.next(m=>m.type==='joined');assert.equal(joined.id,host.id);assert.equal(joined.room,'public:home');assert.equal(await replaced,4001);
  reconnected.send(message);assert.deepEqual(await reconnected.next(m=>m.type==='chatAck'),{type:'chatAck',requestId:message.requestId});
  await barrier(reconnected,peer);
  assert.deepEqual(peer.drain(m=>m.type==='chat'&&m.message===message.message),[]);
  assert.deepEqual(reconnected.drain(m=>m.type==='chat'&&m.message===message.message),[]);
  assert.deepEqual(peer.drain(m=>m.type==='chatAck'),[]);
});
