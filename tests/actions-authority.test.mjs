import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, rename, mkdir, rmdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createAccountStore } from '../server/account-store.mjs';
import { createActionService, commandHash } from '../server/action-service.mjs';
import { createGameServer } from '../server/server.mjs';
import { ACTION_RULES_VERSION } from '../src/actions.ts';
import * as Game from '../src/model.ts';
import {createEnvironmentLayout} from '../src/environments.ts';
import {environmentResourceNodes} from '../src/environment-resources.ts';

const status=n=>error=>error.status===n;
function account(id,profile=Game.newGame(id)){return {id,username:id,hash:'test-hash',salt:'test-salt',friends:[],requests:[],profile};}
const spec=(actorId,expectedRevision,run,extra={})=>({actorId,expectedRevision,requestId:randomUUID(),hash:commandHash({test:'command'}),run,...extra});
async function pg(){
  const db=await PGlite.create();let queue=Promise.resolve(),failure=null;
  const pool={async connect(){const before=queue;let release;queue=new Promise(r=>release=r);await before;let done=false;return {async query(sql,params){failure?.(sql,params);return db.query(sql,params);},release(){if(!done){done=true;release();}}};},async query(sql,params){const c=await pool.connect();try{return await c.query(sql,params);}finally{c.release();}},async end(){await queue;}};
  return {pool,fail:f=>failure=f,async close(){await queue;await db.close();}};
}
async function fixture(t,kind='file'){
  const dir=await mkdtemp(path.join(os.tmpdir(),'zoo-authority-')),database=kind==='postgres'?await pg():null;
  let store=await createAccountStore({dataDir:dir,pool:database?.pool});
  t.after(async()=>{await store.close();await database?.close();await rm(dir,{recursive:true,force:true});});
  return {dir,database,get store(){return store;},async reopen(){await store.close();store=await createAccountStore({dataDir:dir,pool:database?.pool});return store;}};
}

for(const kind of ['file','postgres'])test(`${kind} commands have durable receipts and atomic cross-account state`,async t=>{
  const f=await fixture(t,kind);let store=f.store;
  await store.create(account('alice'));await store.create(account('bob'));await store.create(account('owner'));
  let runs=0;const command=spec('alice',0,records=>{runs++;records.get('alice').profile.energy+=12;return {gain:12};},{actionType:'testReward'});
  const first=await store.command(command);assert.equal(first.reply.revision,1);assert.equal(first.reply.profile.energy,12);
  await store.command(spec('alice',1,records=>{records.get('alice').profile.energy+=7;return 7;}));
  const before=await store.get('alice');
  const replay=await store.command({...command,expectedRevision:2});
  assert.equal(replay.reply.replayed,true);assert.equal(replay.reply.revision,2);assert.equal(replay.reply.actionRevision,1);
  assert.deepEqual(replay.reply.result,{gain:12});assert.equal(replay.reply.profile.energy,19);assert.equal(runs,1);
  assert.deepEqual(await store.get('alice'),before);assert.deepEqual(replay.accounts,[]);
  const persisted=kind==='file'?JSON.parse(await readFile(path.join(f.dir,'accounts.json'),'utf8')).receipts:(await f.database.pool.query('SELECT receipt FROM zoo_action_receipts')).rows.map(row=>row.receipt);
  assert.equal(persisted.length,2);assert.ok(persisted.every(receipt=>receipt.format===2&&!Object.hasOwn(receipt.reply,'profile')),'durable receipts must not duplicate entire player profiles');
  await assert.rejects(store.command({...command,hash:commandHash({different:true})}),status(409));
  store=await f.reopen();assert.equal((await store.command(command)).reply.replayed,true);assert.equal(runs,1);
  assert.equal((await store.get('alice')).profile.energy,19);
  assert.equal((await store.get('alice')).outbox.filter(e=>e.id===command.requestId).length,1);
  await assert.rejects(store.saveProfile('alice',{profile:Game.newGame(),revision:50,mutation:randomUUID()}),status(409));

  const pairBefore=await Promise.all(['alice','bob'].map(id=>store.get(id)));
  const pair=spec('alice',2,records=>{records.get('alice').profile.energy-=5;records.get('bob').profile.energy+=5;throw new Error('abort after both changes');},{relatedIds:['bob'],actionType:'transfer'});
  await assert.rejects(store.command(pair),/abort after both/);
  assert.deepEqual(await Promise.all(['alice','bob'].map(id=>store.get(id))),pairBefore);
  const committed=await store.command({...pair,run:records=>{records.get('alice').profile.energy-=5;records.get('bob').profile.energy+=5;return true;}});
  assert.equal(committed.accounts.length,2);assert.equal((await store.get('alice')).profile.energy,14);assert.equal((await store.get('bob')).profile.energy,5);
  assert.equal((await store.get('bob')).accountRevision,1);

  // Different actor revisions do not protect a shared resource; the shared owner lock must.
  const claim=id=>store.command(spec(id,id==='alice'?3:1,records=>{
    const owner=records.get('owner');if(owner.claimed)throw Object.assign(new Error('claimed'),{status:409});
    owner.claimed=id;records.get(id).profile.bag.carrot=1;return true;
  },{relatedIds:['owner'],actionType:'claim'}));
  const race=await Promise.allSettled([claim('alice'),claim('bob')]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(race.find(r=>r.status==='rejected').reason.status,409);
  assert.equal(['alice','bob'].includes((await store.get('owner')).claimed),true);
  assert.equal(((await store.get('alice')).profile.bag.carrot??0)+((await store.get('bob')).profile.bag.carrot??0),1);
});

for(const kind of ['file','postgres'])test(`${kind} checks revoked access inside the transaction before mutation or receipt replay`,async t=>{
  const f=await fixture(t,kind);await f.store.create(account('alice'));await f.store.create(account('bob'));
  let release,enter;const entered=new Promise(resolve=>enter=resolve),held=new Promise(resolve=>release=resolve);let allowed=true;
  const checkAccess=()=>{if(!allowed)throw Object.assign(new Error('Session revoked'),{status:401});};
  const blocking=f.store.command(spec('alice',0,async()=>{enter();await held;return true;}));await entered;
  const request=spec('alice',1,records=>{records.get('alice').profile.energy+=10;return true;},{checkAccess});
  const queued=f.store.command(request),friend=f.store.friendAction('alice','bob','request',checkAccess);
  const rejected=Promise.all([assert.rejects(queued,status(401)),assert.rejects(friend,status(401))]);allowed=false;release();await blocking;await rejected;
  assert.equal((await f.store.get('alice')).profile.energy,0);assert.deepEqual((await f.store.get('bob')).requests,[]);
  allowed=true;await f.store.command(request);allowed=false;await assert.rejects(f.store.command(request),status(401));
  assert.equal((await f.store.get('alice')).profile.energy,10);
});

test('file write failure leaves neither partial command changes nor a replay receipt',async t=>{
  const f=await fixture(t);await f.store.create(account('alice'));const original=await f.store.get('alice');
  const filename=path.join(f.dir,'accounts.json'),backup=path.join(f.dir,'accounts.backup');
  await rename(filename,backup);await mkdir(filename);
  const cmd=spec('alice',0,records=>{records.get('alice').profile.energy=90;return true;});
  await assert.rejects(f.store.command(cmd));assert.deepEqual(await f.store.get('alice'),original);
  await rmdir(filename);await rename(backup,filename);
  const result=await f.store.command(cmd);assert.equal(result.reply.replayed,undefined);assert.equal(result.reply.profile.energy,90);
  await f.reopen();assert.equal((await f.store.command(cmd)).reply.replayed,true);
});

test('SQL second account update, receipt insert and COMMIT failures roll back the entire command',async t=>{
  const f=await fixture(t,'postgres');await f.store.create(account('alice'));await f.store.create(account('bob'));
  for(const point of ['second-update','INSERT INTO zoo_action_receipts','COMMIT']){
    const before=await f.store.list();let writes=0;
    const cmd=spec('alice',(await f.store.get('alice')).profileRevision||0,records=>{records.get('alice').profile.energy+=1;records.get('bob').profile.energy+=1;return true;},{relatedIds:['bob']});
    f.database.fail(sql=>{if(point==='second-update'?sql.startsWith('UPDATE zoo_accounts')&&++writes===2:sql.startsWith(point))throw new Error('injected storage outage');});
    await assert.rejects(f.store.command(cmd),/injected/);f.database.fail(null);assert.deepEqual(await f.store.list(),before);
    assert.equal((await f.store.command(cmd)).reply.replayed,undefined);assert.equal((await f.store.command(cmd)).reply.replayed,true);
  }
  assert.equal((await f.store.get('alice')).profile.energy,3);assert.equal((await f.store.get('bob')).profile.energy,3);
});

async function service(t){
  const f=await fixture(t);const peers=new Map(),events=[];
  const execute=createActionService({store:f.store,getPeer:id=>peers.get(id),afterCommit:(committed,intent)=>{if(!committed.reply.replayed)events.push({committed,intent});}});
  async function act(id,type,payload={},extra={}){return execute(id,{rulesVersion:ACTION_RULES_VERSION,requestId:randomUUID(),expectedRevision:(await f.store.get(id)).profileRevision||0,type,payload,...extra});}
  return {...f,store:f.store,peers,events,execute,act};
}

test('keyboard settings persist through authoritative actions, retries and reopen without crossing accounts', async t => {
  const h = await service(t), alice = account('alice'), bob = account('bob');
  alice.profile.settings.difficulty = 'hard';
  alice.profile.settings.difficultyLoweredAt = Date.now();
  await h.store.create(alice); await h.store.create(bob);
  const requestId = randomUUID();
  const chosen = await h.act('alice', 'settings', {settings: {keyboardLayout: 'wasd'}}, {requestId});
  assert.equal(chosen.profile.settings.keyboardLayout, 'wasd');
  assert.equal(chosen.profile.settings.difficulty, 'hard');
  const retry = await h.act('alice', 'settings', {settings: {keyboardLayout: 'wasd'}}, {requestId});
  assert.equal(retry.replayed, true); assert.equal(retry.revision, chosen.revision);
  const ignored = await h.act('alice', 'settings', {settings: {keyboardLayout: 'WASD', sound: false}});
  assert.equal(ignored.profile.settings.keyboardLayout, 'wasd'); assert.equal(ignored.profile.settings.sound, false);
  const before = await h.store.get('alice');
  await assert.rejects(h.act('alice', 'settings', {settings: {keyboardLayout: 'classic', difficulty: 'easy'}}), status(400));
  assert.deepEqual(await h.store.get('alice'), before, 'rejected difficulty changes roll back the entire settings command');
  assert.equal((await h.store.get('bob')).profile.settings.keyboardLayout, undefined, 'other accounts retain the classic default');
  const reopened = await h.reopen();
  assert.equal((await reopened.get('alice')).profile.settings.keyboardLayout, 'wasd');
  const execute = createActionService({store: reopened, getPeer: () => undefined});
  const restored = await execute('alice', {rulesVersion: ACTION_RULES_VERSION, requestId: randomUUID(), expectedRevision: before.profileRevision, type: 'settings', payload: {settings: {keyboardLayout: 'classic'}}});
  assert.equal(restored.profile.settings.keyboardLayout, 'classic');
  assert.equal(restored.profile.settings.difficulty, 'hard');
});

test('dropped items are shared in the wild but never cross private home instances, including old drops',async t=>{
  const h=await service(t);const alice=account('alice'),bob=account('bob');alice.profile.bag.carrot=3;
  await h.store.create(alice);await h.store.create(bob);
  const peer=x=>({active:true,planet:'home',room:'public:home',visit:null,pose:{x,z:0}});
  h.peers.set('alice',peer(30));h.peers.set('bob',peer(30));
  const wild=await h.act('alice','dropItem',{id:'carrot',count:1});assert.equal(wild.result.space,'wild');assert.equal(wild.result.thrown,true);
  const picked=await h.act('bob','claimDrop',{ownerId:'alice',id:wild.result.id});assert.equal(picked.result.item,'carrot');assert.equal(picked.profile.bag.carrot,1);
  await assert.rejects(h.act('bob','claimDrop',{ownerId:'alice',id:wild.result.id}),status(409));
  h.peers.set('alice',peer(0));h.peers.set('bob',peer(0));
  const home=await h.act('alice','dropItem',{id:'carrot',count:1});assert.equal(home.result.space,'home:alice');
  const before=await h.store.get('bob');await assert.rejects(h.act('bob','claimDrop',{ownerId:'alice',id:home.result.id}),status(403));assert.deepEqual(await h.store.get('bob'),before);
  assert.equal((await h.act('alice','claimDrop',{ownerId:'alice',id:home.result.id})).result.item,'carrot','the owner can recover their own private-home item');
  const legacy=await h.act('alice','dropItem',{id:'carrot',count:1});
  await h.store.command(spec('alice',(await h.store.get('alice')).profileRevision,records=>{delete records.get('alice').drops.find(drop=>drop.id===legacy.result.id).space;return true;}));
  await assert.rejects(h.act('bob','claimDrop',{ownerId:'alice',id:legacy.result.id}),status(403),'legacy drops infer private home from their original location');
  assert.equal((await h.act('alice','claimDrop',{ownerId:'alice',id:legacy.result.id})).result.item,'carrot');
});

test('crop theft checks friendship, visit, generation, ripeness, range and six successful crops per UTC day',async t=>{
  let at=2_000_000_000_000;t.mock.method(Date,'now',()=>at);const h=await service(t);
  const actor=account('alice'),owner=account('owner');actor.friends=['owner'];owner.friends=['alice'];owner.profile.level=30;
  while(owner.profile.plots.length<7)owner.profile.plots.push({crop:null,plantedAt:0});
  for(let i=0;i<7;i++)assert.ok(Game.plant(owner.profile,i,'carrot',at-Game.CROPS.carrot.duration-1-300000));
  await h.store.create(actor);await h.store.create(owner);
  const peer={planet:'home',room:'home',visit:'owner',pose:Game.bedPosition(owner.profile,0)};h.peers.set('alice',peer);
  const payload=i=>({ownerId:'owner',index:i,generation:owner.profile.plots[i].generation});
  await assert.rejects(h.act('alice','stealCrop',{...payload(0),generation:'old-generation'}),status(409));
  peer.visit=null;await assert.rejects(h.act('alice','stealCrop',payload(0)),status(403));peer.visit='owner';
  peer.pose={x:100,z:100};await assert.rejects(h.act('alice','stealCrop',payload(0)),status(409));
  const requestId=randomUUID();peer.pose=Game.bedPosition(owner.profile,0);
  const first=await h.act('alice','stealCrop',payload(0),{requestId});assert.equal(first.result.count,1);assert.equal(first.result.remaining,5);
  assert.equal((await h.store.get('owner')).profile.plots[0].crop,null);
  assert.equal((await h.act('alice','stealCrop',payload(0),{requestId})).replayed,true);
  assert.equal((await h.store.get('alice')).profile.bag.carrot,1);
  for(let i=1;i<6;i++){peer.pose=Game.bedPosition(owner.profile,i);await h.act('alice','stealCrop',payload(i));}
  peer.pose=Game.bedPosition(owner.profile,6);await assert.rejects(h.act('alice','stealCrop',payload(6)),status(409));
  assert.equal((await h.store.get('alice')).theftLedger.owner.count,6);assert.equal((await h.store.get('owner')).profile.plots[6].crop,'carrot');
  at+=24*3600_000;assert.equal((await h.act('alice','stealCrop',payload(6))).result.remaining,5);
  assert.equal(h.events.length,7,'retries and rejected attempts do not publish new committed events');
});

test('a guard blocks theft without losing the crop and bites only once per cooldown, including replay',async t=>{
  let at=2_000_000_000_000;t.mock.method(Date,'now',()=>at);const h=await service(t);
  const actor=account('alice'),owner=account('owner');actor.friends=['owner'];owner.friends=['alice'];owner.profile.level=30;owner.profile.energy=1000;owner.profile.farm.built=true;
  Game.plant(owner.profile,0,'carrot',at-Game.CROPS.carrot.duration);Game.buyAnimal(owner.profile,'dog',at-1000);Game.buildSpeciesPen(owner.profile,'dog',at);
  await h.store.create(actor);await h.store.create(owner);h.peers.set('alice',{planet:'home',visit:'owner',pose:Game.bedPosition(owner.profile,0)});
  const payload={ownerId:'owner',index:0,generation:owner.profile.plots[0].generation},requestId=randomUUID();
  const first=await h.act('alice','stealCrop',payload,{requestId});assert.equal(first.result.blocked,true);assert.equal(first.result.damage,30);assert.equal(first.profile.hp,70);
  assert.equal((await h.store.get('owner')).profile.plots[0].crop,'carrot');assert.equal(first.profile.bag.carrot,undefined);
  assert.equal((await h.act('alice','stealCrop',payload,{requestId})).replayed,true);assert.equal((await h.store.get('alice')).profile.hp,70);
  await assert.rejects(h.act('alice','stealCrop',payload),status(429));at+=6000;
  assert.equal((await h.act('alice','stealCrop',payload)).profile.hp,40);assert.equal((await h.store.get('alice')).theftLedger,undefined);
});

test('forging charges server-defined costs exactly once and preserves its random outcome on retry',async t=>{
  const h=await service(t),a=account('alice');a.profile.energy=10_000;a.profile.bag={sword_wood:1,bone:20,leather:20,starshard:10};await h.store.create(a);
  const requestId=randomUUID(),payload={id:'sword_wood',cost:0,success:true,level:15};
  const first=await h.act('alice','forge',payload,{requestId});assert.equal(first.profile.energy,9920);assert.equal(first.profile.bag.bone,16);assert.equal(first.result.level,Number(first.result.success));
  await h.act('alice','settings',{settings:{sound:false}});const before=await h.store.get('alice');
  const retry=await h.act('alice','forge',payload,{requestId});assert.deepEqual(retry.result,first.result);assert.equal(retry.replayed,true);assert.deepEqual(await h.store.get('alice'),before);
  await assert.rejects(h.act('alice','forge',{id:'rod'}),status(409));await assert.rejects(h.act('alice','grantCatch',{id:'fish_golden'}),status(400));
});

test('fishing requires an owned rod, server ticket, elapsed reeling proof and one durable reward',async t=>{
  let at=2_000_000_000_000;t.mock.method(Date,'now',()=>at);const h=await service(t),a=account('alice');a.profile.bag={rod:1,worm:2};await h.store.create(a);
  const peer={planet:'home',room:'home',pose:{x:-7.5,z:15.3}};h.peers.set('alice',peer);
  const cast={rodId:'rod',water:'home',cast:{x:-7.5,z:13.5}};
  await assert.rejects(h.act('alice','fishStart',{...cast,rodId:'rod_gold'}),status(409));
  const start=await h.act('alice','fishStart',cast),ticket=(await h.store.get('alice')).fishingTicket;
  assert.equal(start.result.ticketId,ticket.id);assert.equal(start.profile.bag.worm,1);
  await assert.rejects(h.act('alice','fishStart',cast),status(409));
  await assert.rejects(h.act('alice','fishFinish',{ticketId:'fabricated'}),status(409));
  const proof={elapsed:20,hookAt:1,samples:[{t:7,held:true,tension:.3,progress:.2},{t:14,held:true,tension:.5,progress:.6},{t:20,held:true,tension:.4,progress:1}]};
  await assert.rejects(h.act('alice','fishFinish',{ticketId:ticket.id,telemetry:proof}),status(400));
  at+=20_000;
  await assert.rejects(h.act('alice','fishFinish',{ticketId:ticket.id,telemetry:{...proof,samples:proof.samples.map(s=>({...s,held:false}))}}),status(409));
  peer.pose={x:60,z:60};await assert.rejects(h.act('alice','fishFinish',{ticketId:ticket.id,telemetry:proof}),status(409));peer.pose={x:-7.5,z:15.3};
  const requestId=randomUUID(),payload={ticketId:ticket.id,telemetry:proof,id:'fish_golden',count:999};
  const finish=await h.act('alice','fishFinish',payload,{requestId});assert.equal(finish.result.id,ticket.outcome.id);assert.equal((await h.store.get('alice')).fishingTicket,undefined);
  const before=await h.store.get('alice');assert.equal((await h.act('alice','fishFinish',payload,{requestId})).replayed,true);assert.deepEqual(await h.store.get('alice'),before);
  await assert.rejects(h.act('alice','fishFinish',payload),status(409));
});

test('mystery eligibility follows the exact pond and starts its durable cooldown only after a successful catch',async t=>{
  let at=2_000_000_000_000;t.mock.method(Date,'now',()=>at);const h=await service(t),a=account('alice');a.profile.bag={rod:1};await h.store.create(a);
  const peer={planet:'home',room:'public:home',pose:{x:-7.5,z:15.3}};h.peers.set('alice',peer);
  const cast={rodId:'rod',water:'home',cast:{x:-7.5,z:13.5},mystery:true};
  const first=await h.act('alice','fishStart',cast);assert.equal(first.result.pick.mystery,true);assert.deepEqual(first.result.mysteryState,{readyAt:0,serverNow:at});
  await h.act('alice','fishCancel',{ticketId:first.result.ticketId});assert.equal((await h.store.get('alice')).mysteryReadyAt,undefined);
  const second=await h.act('alice','fishStart',cast);assert.equal(second.result.pick.mystery,true);
  at+=20_000;const proof={elapsed:20,hookAt:1,samples:[{t:7,held:true,tension:.3,progress:.2},{t:14,held:true,tension:.5,progress:.6},{t:20,held:true,tension:.4,progress:1}]};
  const requestId=randomUUID(),payload={ticketId:second.result.ticketId,telemetry:proof},finish=await h.act('alice','fishFinish',payload,{requestId});
  assert.equal(finish.result.mystery,true);assert.equal(finish.result.mysteryState.serverNow,at);assert.ok(finish.result.mysteryState.readyAt>=at+45000&&finish.result.mysteryState.readyAt<=at+90000);
  const cooldown=finish.result.mysteryState.readyAt;at+=1000;const replay=await h.act('alice','fishFinish',payload,{requestId});assert.deepEqual(replay.result,finish.result);
  const ordinary=await h.act('alice','fishStart',cast);assert.equal(ordinary.result.pick.mystery,false);assert.equal(ordinary.result.mysteryState.readyAt,cooldown);
  await h.act('alice','fishCancel',{ticketId:ordinary.result.ticketId});
  peer.pose={x:10,z:63};const lake={...cast,water:'lake',cast:{x:10,z:59.5}},other=await h.act('alice','fishStart',lake);
  assert.equal(other.result.pick.mystery,true);assert.equal(other.result.mysteryState.readyAt,0,'another pond does not inherit the home pond cooldown');
  at+=180001;const expired=await h.act('alice','fishStart',lake);assert.equal(expired.result.pick.mystery,true,'an expired ticket leaves the pond opportunity available');
});

test('interior cave crystals require the opened gate while the exterior crystals remain mineable',async t=>{
  let at=2_000_000_000_000;t.mock.method(Date,'now',()=>at);const h=await service(t),a=account('alice');a.profile.planet='lava';a.profile.level=30;await h.store.create(a);
  const layout=createEnvironmentLayout('lava'),nodes=environmentResourceNodes(layout).filter(node=>node.kind==='fire-crystal'),outside=nodes[0],inside=nodes[2];
  const peer={planet:'lava',room:'public:lava',pose:{x:inside.x,z:inside.z}};h.peers.set('alice',peer);
  const before=await h.store.get('alice');await assert.rejects(h.act('alice','environmentResource',{nodeId:inside.id}),/Open the cave gate/);assert.deepEqual(await h.store.get('alice'),before);
  peer.pose={x:outside.x,z:outside.z};assert.equal((await h.act('alice','environmentResource',{nodeId:outside.id})).result.hits,1);at+=250;
  assert.ok((await h.act('alice','environmentResource',{nodeId:outside.id})).result.rewards.length);
  peer.pose={...layout.cave.gate};for(let i=0;i<8;i++){at+=250;await h.act('alice','openCave');}assert.equal((await h.store.get('alice')).profile.worldRewards.lava.gateOpen,true);
  peer.pose={x:inside.x,z:inside.z};at+=250;assert.equal((await h.act('alice','environmentResource',{nodeId:inside.id})).result.hits,1);at+=250;
  assert.ok((await h.act('alice','environmentResource',{nodeId:inside.id})).result.rewards.length);
});

test('HTTP denies full profile overwrites and derives action identity from the authenticated session',async t=>{
  const f=await fixture(t),server=await createGameServer({host:'127.0.0.1',port:0,dataDir:f.dir,databaseUrl:'',databaseRequired:false,accountStore:f.store});
  t.after(()=>server.close());
  async function api(route,method,body,cookie){const response=await fetch(server.url+'/api/'+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  const a=await api('auth/register','POST',{username:'alice',password:'test-password-123'});assert.equal(a.status,200);
  assert.equal((await api('profile','PUT',{profile:{...a.body.profile,energy:999999},revision:99,mutation:randomUUID()},a.cookie)).status,409);
  const intent={rulesVersion:ACTION_RULES_VERSION,requestId:randomUUID(),expectedRevision:0,type:'settings',payload:{name:'New name'},actorId:'other'};
  assert.equal((await api('actions','POST',intent)).status,401);
  const reply=await api('actions','POST',intent,a.cookie);assert.equal(reply.status,200);assert.equal(reply.body.profile.name,'New name');assert.equal(reply.body.profile.energy,0);
  assert.equal((await f.store.get(a.body.account.id)).profile.name,'New name');
});

test('friends can gift items from the bag (chest + note, daily limit) and water growing crops once per plant',async t=>{
  let at=2_000_000_000_000;t.mock.method(Date,'now',()=>at);const h=await service(t);
  const actor=account('alice'),owner=account('owner'),stranger=account('eve');actor.friends=['owner'];owner.friends=['alice'];
  owner.profile.level=30;actor.profile.bag.carrot=30;actor.profile.bag.radish=3;
  assert.ok(Game.plant(owner.profile,0,'pumpkin',at-60_000));
  await h.store.create(actor);await h.store.create(owner);await h.store.create(stranger);
  // Gifts
  const gift=await h.act('alice','giftFriend',{ownerId:'owner',item:'carrot',count:5});
  assert.equal(gift.result.count,5);assert.equal(gift.profile.bag.carrot,25);
  const given=(await h.store.get('owner')).profile;assert.equal(given.chest.carrot,5);assert.equal(given.awayStore.carrot,5);
  await assert.rejects(h.act('alice','giftFriend',{ownerId:'eve',item:'carrot',count:1}),status(403),'not a friend');
  await assert.rejects(h.act('alice','giftFriend',{ownerId:'owner',item:'carrot',count:99}),status(400));
  await assert.rejects(h.act('alice','giftFriend',{ownerId:'owner',item:'nonsense',count:1}),status(400));
  await assert.rejects(h.act('alice','giftFriend',{ownerId:'owner',item:'radish',count:4}),status(409),'more than you have');
  // Watering needs a visit, range and a growing crop; once per plant per visitor
  const plot=(await h.store.get('owner')).profile.plots[0],peer={planet:'home',room:'home',visit:null,pose:Game.bedPosition(owner.profile,0)};h.peers.set('alice',peer);
  const payload={ownerId:'owner',index:0,generation:plot.generation};
  await assert.rejects(h.act('alice','waterFriend',payload),status(403),'not visiting');peer.visit='owner';
  const before=plot.plantedAt,watered=await h.act('alice','waterFriend',payload);
  assert.ok(watered.result.seconds>0);assert.ok((await h.store.get('owner')).profile.plots[0].plantedAt<before);
  await assert.rejects(h.act('alice','waterFriend',payload),status(409),'only once per plant');
  await assert.rejects(h.act('alice','waterFriend',{...payload,generation:'old'}),status(409));
});
