import test from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/server.mjs';

function connect(url, cookie) {
  return new Promise((resolve,reject) => {
    const socket = new WebSocket(url.replace('http:','ws:')+'/socket', {headers:{Cookie:cookie}});
    const queue=[], waiters=[];
    socket.on('message', raw => { const item=JSON.parse(raw); const waiter=waiters.find(w=>w.predicate(item)); if(waiter){waiters.splice(waiters.indexOf(waiter),1);clearTimeout(waiter.timer);waiter.resolve(item);} else queue.push(item); });
    socket.once('error',reject);
    socket.once('open',()=>resolve({socket,send:value=>socket.send(JSON.stringify(value)),drain(predicate){const found=[];for(let i=0;i<queue.length;)if(predicate(queue[i]))found.push(...queue.splice(i,1));else i++;return found;},next(predicate,timeout=4000){const i=queue.findIndex(predicate);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const waiter={predicate,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(waiter),1);reject(new Error('Missing socket event'));},timeout)};waiters.push(waiter);});}}));
  });
}

test('local multiplayer: accounts, saves, friendship, privacy, rooms and host migration', async t => {
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'zoo-garden-network-test-'));
  const game=await createGameServer({port:0,dataDir});
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
  assert.equal((await call('profile',{profile,revision:1,mutation:randomUUID()},alice.cookie,'PUT')).status,200);
  assert.equal((await call('auth/session',null,alice.cookie)).data.profile.energy,321);
  assert.equal((await call('homes/'+alice.data.account.id,null,bob.cookie)).status,403);
  assert.equal((await call('friends/request',{username:'alice'},bob.cookie)).status,200);
  const requests=await call('friends',null,alice.cookie);assert.equal(requests.data.requests[0].id,bob.data.account.id);
  assert.equal((await call('friends/accept',{id:bob.data.account.id},alice.cookie)).status,200);
  const home=await call('homes/'+alice.data.account.id,null,bob.cookie);assert.equal(home.status,200);assert.ok(Array.isArray(home.data.home.plots));assert.equal(home.data.home.bag,undefined);assert.equal(home.data.home.energy,undefined);assert.equal(home.data.home.hash,undefined);
  const a=await connect(game.url,alice.cookie);sockets.push(a);const initialA=await a.next(m=>m.type==='joined');assert.equal(initialA.host,alice.data.account.id);
  const b=await connect(game.url,bob.cookie);sockets.push(b);const initialB=await b.next(m=>m.type==='joined');assert.equal(initialB.host,alice.data.account.id);assert.equal(initialB.players.length,2);
  a.send({type:'enemies',enemies:[{id:'home:slime:1',x:1,z:1,hp:20,maxHp:20,type:'slime'}]});
  assert.equal((await b.next(m=>m.type==='enemies')).enemies[0].hp,20);
  b.send({type:'attack',id:'home:slime:1',damage:8});const hit=await a.next(m=>m.type==='attack');assert.equal(hit.by,bob.data.account.id);assert.equal(hit.damage,8);
  a.send({type:'defeat',id:'home:slime:1',xp:6,energy:4,item:'wood'});const reward=await b.next(m=>m.type==='reward');assert.equal(reward.reward.xp,6);assert.equal(reward.reward.enemyId,'home:slime:1');
  b.send({type:'chat',message:'Hello, explorer!'});assert.equal((await a.next(m=>m.type==='chat')).message,'Hello, explorer!');
  a.send({type:'active',active:false});assert.equal((await b.next(m=>m.type==='authority'&&m.host===bob.data.account.id)).host,bob.data.account.id);
  b.send({type:'visit',id:alice.data.account.id});assert.equal((await b.next(m=>m.type==='visit')).home.id,alice.data.account.id);
  b.send({type:'leaveVisit'});assert.equal((await b.next(m=>m.type==='visit')).home,null);
  b.send({type:'party'});const privateParty=await b.next(m=>m.type==='party');assert.match(privateParty.code,/^[A-F0-9]{6}$/);
  a.send({type:'join',planet:'home',party:privateParty.code});const joinedParty=await a.next(m=>m.type==='joined'&&m.party===privateParty.code);assert.equal(joinedParty.players.length,2);
  const raw=await readFile(path.join(dataDir,'accounts.json'),'utf8');assert.ok(!raw.includes('password-one'));assert.ok(!raw.includes('zoo_session'));assert.equal(JSON.parse(raw).accounts.find(v=>v.username==='alice').profile.energy,321);
  await call('auth/logout',{},alice.cookie);assert.equal((await call('auth/session',null,alice.cookie)).data.account,null);
  await game.close();
  const restarted=await createGameServer({port:0,dataDir});
  try {const response=await fetch(restarted.url+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'alice',password:'password-one'})});assert.equal(response.status,200);assert.equal((await response.json()).profile.energy,321);} finally {await restarted.close();}
});

async function protocolRoom(t) {
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'zoo-garden-protocol-test-'));
  const game=await createGameServer({port:0,dataDir}),clients=[];
  t.after(async()=>{for(const client of clients)client.socket.terminate();await game.close();});
  async function explorer(username){
    const response=await fetch(game.url+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'protocol-password'})});
    assert.equal(response.status,200);const session=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];
    const client=await connect(game.url,cookie);clients.push(client);const joined=await client.next(m=>m.type==='joined');
    return Object.assign(client,{id:session.account.id,cookie,session,joined});
  }
  const host=await explorer('host_player'),peer=await explorer('peer_player');
  assert.equal(peer.joined.host,host.id);
  // Chat is an ordered protocol barrier, avoiding arbitrary sleeps for negative assertions.
  async function barrier(sender,receiver){const marker=randomUUID();sender.send({type:'chat',message:marker});await receiver.next(m=>m.type==='chat'&&m.message===marker);}
  return {game,host,peer,explorer,barrier};
}

test('combat protocol relays bounded impacts and statuses and preserves boss casts',async t=>{
  const {host,peer,barrier}=await protocolRoom(t);
  const boss={id:'forest:treant:boss',type:'treant',kind:'boss',boss:true,x:4,z:3,hp:650,maxHp:1200,phase:'windup',phaseTime:.8,skill:'rain',bossStage:2,attackCount:6,skillCount:3,spinTick:.2,damage:42,lift:1,liftVelocity:3,cooldown:1.4,targetX:1,targetZ:2,statuses:{fear:2,sheep:4,poison:99},telegraphs:[{x:1,z:2,r:2,delay:1.3}],skillEffects:[{x:4,z:3,r:6,inner:3.6,remaining:.44,multiplier:1.1}]};
  host.send({type:'enemies',enemies:[boss]});
  const snapshot=(await peer.next(m=>m.type==='enemies')).enemies[0];
  for(const key of ['boss','phase','phaseTime','skill','bossStage','attackCount','skillCount','spinTick','damage','lift','liftVelocity','cooldown','targetX','targetZ'])assert.equal(snapshot[key],boss[key],key);
  assert.deepEqual(snapshot.telegraphs,boss.telegraphs);assert.deepEqual(snapshot.skillEffects,boss.skillEffects);assert.equal(snapshot.statuses.fear,2);assert.equal(snapshot.statuses.sheep,4);assert.equal(snapshot.statuses.poison,undefined);
  peer.send({type:'attack',id:boss.id,damage:8,stun:30,impact:{amount:9999,critical:true,stun:20,lift:90,knock:90,direction:{x:9,z:-9}}});
  const attack=await host.next(m=>m.type==='attack');assert.equal(attack.by,peer.id);assert.equal(attack.damage,8);assert.equal(attack.stun,5);
  assert.deepEqual(attack.impact,{amount:8,critical:true,stun:5,lift:12,knock:12,direction:{x:1,z:-1}});
  peer.send({type:'status',id:boss.id,kind:'charm',duration:999});assert.deepEqual(await host.next(m=>m.type==='status'),{type:'status',id:boss.id,kind:'charm',duration:12});
  peer.send({type:'moveEnemy',id:boss.id,x:7,z:5});assert.deepEqual(await host.next(m=>m.type==='moveEnemy'),{type:'moveEnemy',id:boss.id,x:7,z:5});
  peer.send({type:'status',id:boss.id,kind:'not-a-status',duration:4});peer.send({type:'moveEnemy',id:boss.id,x:50,z:50});peer.send({type:'enemies',enemies:[{...boss,hp:0}]});peer.send({type:'damage',id:host.id,amount:100});
  await barrier(peer,host);assert.deepEqual(host.drain(m=>['status','moveEnemy','enemies','damage'].includes(m.type)),[]);
  host.send({type:'damage',id:peer.id,amount:7,source:'shot'});assert.deepEqual(await peer.next(m=>m.type==='damage'),{type:'damage',amount:7,source:'shot'});
  host.send({type:'defeat',id:boss.id,xp:320,boss:false,enemy:'treant'});const reward=(await peer.next(m=>m.type==='reward')).reward;assert.equal(reward.boss,true);assert.equal(reward.enemy,'treant');assert.equal(reward.xp,320);
  host.send({type:'defeat',id:boss.id,xp:320});await barrier(host,peer);assert.deepEqual(peer.drain(m=>m.type==='reward'),[]);
});

test('host migration transfers weather, boss state and environment authority',async t=>{
  const {host,peer,explorer,barrier}=await protocolRoom(t);
  host.send({type:'join',planet:'lava'});await host.next(m=>m.type==='joined'&&m.planet==='lava');
  peer.send({type:'join',planet:'lava'});await peer.next(m=>m.type==='joined'&&m.planet==='lava');
  peer.drain(m=>m.type==='authority');
  const boss={id:'lava:dragon:1',x:30,z:0,type:'dragon',boss:true,hp:700,maxHp:2100,phase:'bspin',phaseTime:1.2,bossStage:3,skill:'spin',spinTick:.1};
  host.send({type:'enemies',enemies:[boss]});const enemySnapshot=(await peer.next(m=>m.type==='enemies')).enemies;
  const environment={time:725,lamps:[[0,780]],eclipseUntil:730,nestLevel:-.55,fireRain:[{id:'dragon:6:0:1',x:30,z:4,remaining:.6,duration:1.1},{id:'vent2:7',x:28,z:6,remaining:.3,duration:.8}],weather:{time:725,tideOffset:.17,seed:123456,sequence:17,eventKey:'2:storm',meteorWait:1.8,stormWait:.4,treasureWait:12,dragonSummoned:true,meteors:[{id:'falling',kind:'meteor',x:20,z:1,y:0,age:.7}],fireballs:[{id:'fire',kind:'fireball',x:22,z:2,y:0,age:.4}],ores:[{id:'ore1',kind:'meteor',x:21,z:0,y:0,expiresAt:800}]}};
  environment.lightning={wait:6,sequence:1,bolts:[{id:'cloud-1',x:12,z:13,remaining:1,duration:1.2}]};
  host.send({type:'environment',snapshot:environment});const received=(await peer.next(m=>m.type==='environment')).snapshot;
  assert.equal(received.weather.seed,123456);assert.equal(received.weather.sequence,17);assert.equal(received.weather.meteors[0].age,.7);assert.equal(received.weather.meteors[0].duration,1.8);assert.equal(received.weather.fireballs[0].duration,1);assert.equal(received.weather.ores[0].id,'ore1');assert.equal(received.eclipseUntil,730);
  assert.equal(received.nestLevel,-.55);assert.deepEqual(received.fireRain,environment.fireRain);
  assert.deepEqual(received.lightning,environment.lightning);
  const late=await explorer('late_player');late.send({type:'join',planet:'lava'});const joined=await late.next(m=>m.type==='joined'&&m.planet==='lava');assert.deepEqual(joined.environment,received);assert.deepEqual(joined.enemies,enemySnapshot);
  host.send({type:'active',active:false});const migrated=await peer.next(m=>m.type==='authority'&&m.host===peer.id);assert.deepEqual(migrated.environment,received);assert.deepEqual(migrated.enemies,enemySnapshot);assert.ok(migrated.epoch>joined.epoch);
  // The old host can no longer replace weather. A subsequent update from the new host succeeds.
  host.send({type:'environment',snapshot:{time:9999,lamps:[]}});await barrier(host,peer);assert.deepEqual(peer.drain(m=>m.type==='environment'),[]);
  peer.send({type:'environment',snapshot:{...received,time:726,weather:{...received.weather,time:726,stormWait:.2}}});const resumed=(await host.next(m=>m.type==='environment')).snapshot;assert.equal(resumed.time,726);assert.equal(resumed.weather.stormWait,.2);assert.equal(resumed.weather.seed,123456);
});

test('shared ore requires a host acknowledgement and grants only one reward per request',async t=>{
  const {host,peer,barrier}=await protocolRoom(t);
  const weather={time:10,tideOffset:0,seed:1,sequence:1,eventKey:'0:treasure',meteorWait:2,stormWait:3,treasureWait:4,dragonSummoned:false,meteors:[],fireballs:[],ores:[{id:'shared-ore',kind:'meteor',x:1,z:0,y:0,expiresAt:100},{id:'distant-ore',kind:'ore_magma',x:90,z:0,y:0,expiresAt:100}]};
  host.send({type:'environment',snapshot:{time:10,lamps:[],weather}});await peer.next(m=>m.type==='environment');
  peer.send({type:'environmentAction',action:{kind:'collect-ore',id:'shared-ore'}});const request=await host.next(m=>m.type==='environmentAction');assert.equal(request.by,peer.id);assert.equal(request.action.id,'shared-ore');assert.ok(request.requestId);
  await barrier(host,peer);assert.deepEqual(peer.drain(m=>m.type==='environmentReward'),[]);
  peer.send({type:'environmentResult',requestId:request.requestId,ok:true,rewards:[{id:'mcrystal',count:50}]});await barrier(peer,peer);assert.deepEqual(peer.drain(m=>m.type==='environmentReward'),[]);
  host.send({type:'environmentResult',requestId:request.requestId,ok:true,rewards:[{id:'mcrystal',count:2},{id:'not-an-item',count:10}]});const reward=await peer.next(m=>m.type==='environmentReward');assert.equal(reward.eventId,request.requestId);assert.deepEqual(reward.rewards,[{id:'mcrystal',count:2}]);
  host.send({type:'environmentResult',requestId:request.requestId,ok:true,rewards:[{id:'mcrystal',count:2}]});host.send({type:'environmentResult',requestId:randomUUID(),ok:true,rewards:[{id:'mcrystal',count:2}]});await barrier(host,peer);assert.deepEqual(peer.drain(m=>m.type==='environmentReward'),[]);
  // Once consumed, the host snapshot removes the collectible for every client.
  host.send({type:'environment',snapshot:{time:10,lamps:[],weather:{...weather,ores:weather.ores.slice(1)}}});await peer.next(m=>m.type==='environment');
  peer.send({type:'environmentAction',action:{kind:'collect-ore',id:'shared-ore'}});peer.send({type:'environmentAction',action:{kind:'collect-ore',id:'distant-ore'}});await barrier(peer,host);assert.deepEqual(host.drain(m=>m.type==='environmentAction'),[]);
});

test('projectile snapshots retain their owning enemy and continue across late join and host migration',async t=>{
  const {host,peer,explorer}=await protocolRoom(t);
  const first={id:'forest:bee:1',type:'bee',x:5,z:2,hp:30,maxHp:30,shots:[{id:'bee:shot:1',x:4,y:1.2,z:2,vx:-13,vz:0,life:.8,damage:7,targetEnemyId:'forest:boar:2'}]};
  const second={id:'forest:boar:2',type:'boar',x:6,z:3,hp:40,maxHp:40,shots:Array.from({length:35},(_,i)=>({id:`boar:shot:${i}`,x:8,y:999,z:1,vx:500,vz:-500,life:500,damage:1e8}))};
  host.send({type:'enemies',enemies:[first,second]});const received=(await peer.next(m=>m.type==='enemies')).enemies;
  assert.deepEqual(received[0].shots,first.shots);assert.equal(received[1].shots.length,30);assert.ok(received[1].shots.every(shot=>shot.id.startsWith('boar:shot:')));
  assert.deepEqual(received[1].shots[0],{id:'boar:shot:0',x:8,y:50,z:1,vx:100,vz:-100,life:60,damage:100000});
  const late=await explorer('projectile_viewer');assert.deepEqual(late.joined.enemies,received);
  host.send({type:'active',active:false});const migrated=await peer.next(m=>m.type==='authority'&&m.host===peer.id);assert.deepEqual(migrated.enemies,received);assert.equal(migrated.enemies[0].shots[0].targetEnemyId,second.id);
});

test('concurrent registrations cannot duplicate an account name',async()=>{
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'zoo-garden-registration-test-'));
  const game=await createGameServer({port:0,dataDir});
  try {const results=await Promise.all([1,2].map(()=>fetch(game.url+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'same_name',password:'password-one'})})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);}finally{await game.close();}
});


test('cloud saves preserve client timestamps, reject stale writes, and safely retry a save',async()=>{
  const dataDir=await mkdtemp(path.join(os.tmpdir(),'zoo-garden-revision-test-'));
  const game=await createGameServer({port:0,dataDir});
  try {
    const registered=await fetch(game.url+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'revision_test',password:'password-three'})});
    const cookie=registered.headers.get('set-cookie').split(';')[0],session=await registered.json();
    const profile=session.profile;profile.savedAt=1000;profile.energy=12;
    const first={profile,revision:1,mutation:randomUUID()};
    const save=async job=>fetch(game.url+'/api/profile',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(job)});
    assert.equal((await save(first)).status,200);assert.equal((await save(first)).status,200);
    const next={profile:{...profile,energy:25,savedAt:1100},revision:2,mutation:randomUUID()};
    assert.equal((await save(next)).status,200);assert.equal((await save({...first,mutation:randomUUID()})).status,409);
    const current=await (await fetch(game.url+'/api/auth/session',{headers:{Cookie:cookie}})).json();assert.equal(current.revision,2);assert.equal(current.profile.energy,25);assert.equal(current.profile.savedAt,1100);
    const newer={profile:{...profile,energy:44,savedAt:1400},revision:4,mutation:randomUUID()},older={profile:{...profile,energy:33,savedAt:1300},revision:3,mutation:randomUUID()};
    const [newerResult,olderResult]=await Promise.all([save(newer),save(older)]);assert.equal(newerResult.status,200);assert.ok([200,409].includes(olderResult.status));
    // Retrying the last mutation acknowledges it without applying a modified payload twice.
    const retry=await save({...newer,profile:{...newer.profile,energy:999}});assert.equal(retry.status,200);assert.equal((await retry.json()).revision,4);
    assert.equal((await save(next)).status,409);assert.equal((await save({...newer,mutation:randomUUID()})).status,409);
    assert.equal((await save({...newer,revision:4.5,mutation:randomUUID()})).status,400);assert.equal((await save({...newer,revision:5,mutation:'short'})).status,400);
    const final=await (await fetch(game.url+'/api/auth/session',{headers:{Cookie:cookie}})).json();assert.equal(final.revision,4);assert.equal(final.profile.energy,44);assert.equal(final.profile.savedAt,1400);
    const stored=JSON.parse(await readFile(path.join(dataDir,'accounts.json'),'utf8')).accounts[0];assert.equal(stored.profileRevision,4);assert.equal(stored.lastMutation,newer.mutation);assert.equal(stored.profile.energy,44);
  }finally{await game.close();}
});
