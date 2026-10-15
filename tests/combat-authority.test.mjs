import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {commandHash} from '../server/action-service.mjs';
import {createAccountStore} from '../server/account-store.mjs';
import {createCombatAuthority} from '../server/combat-authority.mjs';
import * as Game from '../src/model.ts';
import {enemyRoster} from '../src/enemy-roster.ts';
import {ENEMY_TYPES} from '../src/enemy-types.ts';
import {createEnvironmentLayout,terrainHeight} from '../src/environments.ts';
import {SURGE} from '../src/pet-surge.ts';

async function fixture(t,{planet='home',profile:configure=()=>{},options={}}={}){
 const dataDir=await mkdtemp(path.join(tmpdir(),'cute-combat-authority-')),store=await createAccountStore({dataDir,databaseUrl:''}),profile=Game.newGame();profile.planet=planet;configure(profile);
 const account=await store.create({id:'actor',username:'actor',hash:'fixture-hash',salt:'fixture-salt',profile,friends:[],requests:[],profileRevision:0});
 const peer={account,active:true,visit:null,planet,room:'public:'+planet,pose:{x:planet==='home'?-30:30,z:1,facing:0,moving:false},socket:{}},peers=new Map([['actor',peer]]),room={id:peer.room,members:new Set(['actor']),host:'actor',enemies:[],killed:new Set()},rooms=new Map([[room.id,room]]);
 const messages=[],waiters=[];const emit=value=>{messages.push(structuredClone(value));for(const waiter of [...waiters])if(waiter.predicate(value)){clearTimeout(waiter.timer);waiters.splice(waiters.indexOf(waiter),1);waiter.resolve(structuredClone(value));}};
 const remember=value=>{Object.assign(account,value);const live=peers.get(value.id);if(live)live.account=account;return account;};
 let deaths=0;const authority=createCombatAuthority({store,peers,rooms,remember,onError:error=>t.diagnostic(error.stack),send:(_,value)=>emit(value),broadcast:(_,value)=>emit(value),onDeath:p=>{deaths++;p.planet='home';p.room='public:home';p.pose={x:0,z:0,facing:0,moving:false};},...options});
 t.after(async()=>{await authority.close();await store.close();});
 const next=(predicate,from=messages.length)=>{const found=messages.slice(from).find(predicate);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const waiter={predicate,resolve,timer:setTimeout(()=>reject(new Error('Missing authority event')),3000)};waiters.push(waiter);});};
 function spawn(type,x=planet==='home'?-30:30,z=0,extra={}){const definition=enemyRoster(planet).find(e=>e.type===type);assert.ok(definition,type);authority.acceptSnapshots(room,[{id:definition.id,type,x,z,hp:1,...extra}]);return authority.state(room).enemies.get(definition.id);}
 return {store,account,peer,peers,room,rooms,authority,messages,next,spawn,deaths:()=>deaths};
}
test('basic attacks and skills obey server cooldowns across repeated packets and room changes',async t=>{
 const f=await fixture(t),enemy=f.spawn('mushroom'),engine=f.authority.engineFor(f.peer);f.authority.basic(f.peer,enemy.id);const hp=enemy.hp;
 for(let i=0;i<20;i++)f.authority.basic(f.peer,enemy.id);assert.equal(enemy.hp,hp);
 f.authority.skill(f.peer,0);const nextSkill=engine.nextSkill[0];f.authority.skill(f.peer,0);assert.equal(engine.nextSkill[0],nextSkill);assert.ok(nextSkill>Date.now());
 const other={id:'party:home',members:new Set(['actor']),host:'actor',enemies:[],killed:new Set()};f.rooms.set(other.id,other);f.peer.room=other.id;const migrated=f.authority.engineFor(f.peer);assert.equal(migrated,engine);assert.equal(migrated.nextSkill[0],nextSkill);assert.ok(migrated.nextBasic>Date.now());
 const profile=await f.next(m=>m.type==='profile'&&m.profile.counters.skills===1,0);assert.equal(profile.profile.counters.skills,1);
});
test('same-room reconnect rebinds combat to the replacement player pose',async t=>{
 const f=await fixture(t),enemy=f.spawn('mushroom');f.peer.pose.x=-100;const original=f.authority.engineFor(f.peer);const replacement={...f.peer,pose:{x:-30,z:1,facing:0,moving:false},socket:{}};f.peers.set('actor',replacement);
 assert.equal(f.authority.engineFor(replacement),original);f.authority.basic(replacement,enemy.id);assert.ok(enemy.hp<enemy.maxHp);assert.equal(f.peer.pose.x,-100);
});
test('automatic combat gear uses the owned sword when the saved hand holds a fishing rod',async t=>{
 const f=await fixture(t,{profile:p=>{p.bag.rod_basic=1;p.bag.sword_wood=1;p.gear.weapon='rod_basic';}}),enemy=f.spawn('mushroom');
 const engine=f.authority.engineFor(f.peer);f.authority.basic(f.peer,enemy.id);assert.ok(enemy.hp<enemy.maxHp);assert.equal(f.account.profile.gear.weapon,'rod_basic');assert.equal(engine.sim.projectiles.length,0);
});
test('boss crowd control resists charm and hard stun, while launch still interrupts',async t=>{
 const f=await fixture(t,{profile:p=>{p.gear.disguise='dz_fairy';p.bag.dz_fairy=1;}}),boss=f.spawn('treant');const engine=f.authority.engineFor(f.peer);
 engine.sim.disguise('dz_fairy',2);assert.equal(boss.statuses.charm,undefined);assert.equal(boss.statuses.slow,4.8);
 boss.phase='windup';engine.sim.skill(2);engine.sim.update(.43);assert.ok(boss.liftVelocity>0);assert.equal(boss.phase,'chase');assert.ok(boss.stun>=.8);assert.ok(boss.statuses.slow>=.48);
});
test('magma turtle shell and recovery modifiers apply on the authoritative damage path',async t=>{
 const f=await fixture(t,{planet:'lava'}),enemy=f.spawn('magmaturtle');const engine=f.authority.engineFor(f.peer),before=enemy.hp;engine.sim.random=()=>.5; // no lucky critical: the armour and the recovery factor are what is measured
 f.authority.basic(f.peer,enemy.id);const armored=before-enemy.hp;assert.ok(armored>0&&armored<4);engine.nextBasic=0;enemy.phase='recover';const hp=enemy.hp;f.authority.basic(f.peer,enemy.id);assert.ok(hp-enemy.hp>armored*5);
});
test('pets deal real server damage without client hit packets and pause with inactive combat',async t=>{
 const f=await fixture(t,{profile:p=>{p.bag.pet_t_turtle=1;p.gear.pet='pet_t_turtle';}}),enemy=f.spawn('mushroom');enemy.z=5;f.peer.pose.z=0;
 // A peaceful creature is left alone; one that is after the explorer is shot (pet-guard.ts).
 const engine=f.authority.engineFor(f.peer);for(let i=0;i<20;i++)engine.sim.update(.1);assert.equal(enemy.hp,enemy.maxHp,'peaceful: not shot');
 enemy.phase='chase';engine.sim.update(.05,false);assert.equal(engine.sim.projectiles.length,0);engine.sim.update(.05);engine.sim.update(.4);assert.ok(enemy.hp<enemy.maxHp);
});

test('rejected hits against a pending defeat cannot grant vampire lifesteal',async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1800000000000});
 const f=await fixture(t,{profile:p=>{p.bag.dz_vampire=1;p.gear.disguise='dz_vampire';p.hp=20;}}),enemy=f.spawn('mushroom'),engine=f.authority.engineFor(f.peer);engine.hpAt=Date.now()+100000;engine.sim.statuses.lifesteal=6;enemy.pending=true;enemy.hp=1;
 engine.sim.basic(enemy);assert.equal(engine.healthEvents.length,0);assert.equal(enemy.hp,1);
});

test('canonical Titan summon recalls existing eligible mobs with stacked attack and migration grace',async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1800000000000});
 const f=await fixture(t,{planet:'candy'}),titan=f.spawn('titan_hydra',30,0),entries=enemyRoster('candy').filter(e=>!e.boss&&ENEMY_TYPES[e.type].speed>0).slice(0,6);
 f.authority.acceptSnapshots(f.room,entries.map((e,i)=>({id:e.id,type:e.type,x:42+i,z:0})));const state=f.authority.state(f.room),mobs=entries.map(e=>state.enemies.get(e.id)),ids=[...state.enemies.keys()];
 mobs[0].pending=true;mobs.forEach(e=>e.hp=1);const before=mobs.map(e=>({x:e.x,z:e.z,damage:e.damage}));
 const cast=count=>{titan.nextCastAt=0;f.authority.acceptSnapshots(f.room,[{id:titan.id,type:titan.type,x:30,z:0,phase:'windup',attackCount:count,skill:'summon',facing:0}]);assert.ok(titan.cast);titan.cast.startsAt=Date.now()-1;t.mock.timers.tick(50);};
 cast(2);cast(4);assert.deepEqual([...state.enemies.keys()],ids);
 for(let i=1;i<=4;i++){assert.equal(mobs[i].hp,mobs[i].maxHp);assert.ok(Math.abs(mobs[i].damage-before[i].damage*1.3*1.3)<1e-9);const packet=f.messages.findLast(m=>m.type==='enemyHealth'&&m.id===mobs[i].id);assert.equal(packet.chaseGrace,4);assert.equal(packet.phase,'chase');}
 for(const i of [0,5]){assert.equal(mobs[i].hp,1);assert.equal(mobs[i].x,before[i].x);assert.equal(mobs[i].damage,before[i].damage);}
});
test('pending damage survives reconnect and travel and lethal damage drops the bag at its original location',async t=>{
 const f=await fixture(t,{profile:p=>{p.hp=1;p.bag.wood=2;p.settings.keepBagOnDeath=false;}}),enemy=f.spawn('mushroom');
 await f.authority.internal('actor','fixtureJourney',[],records=>{Object.assign(records.get('actor'),{journeyPaid:true,flightDust:[{id:0,x:0,z:0}],flightPoint:{x:0,z:0},rideUntil:Date.now()+45000,ridePlanet:'home',fishingTicket:{id:'old-life'}});return {};});
 const from={...f.peer.pose};f.authority.damage(f.peer,enemy.id);
 const replacement={...f.peer,room:'party:home',pose:{x:0,z:0,facing:0,moving:false},socket:{}};f.peers.set('actor',replacement);f.rooms.set(replacement.room,{id:replacement.room,members:new Set(['actor']),host:'actor',enemies:[],killed:new Set()});f.authority.engineFor(replacement);
 await f.next(m=>m.type==='healthResult'&&m.died,0);const persisted=await f.store.get('actor');assert.equal(f.deaths(),1);assert.equal(persisted.profile.deathBags.at(-1).x,from.x);assert.equal(persisted.profile.deathBags.at(-1).z,from.z);assert.equal(persisted.lifeEpoch,1);assert.equal(persisted.profile.bag.wood,undefined);
 assert.equal(persisted.journeyPaid,false);for(const key of ['flightDust','flightPoint','rideUntil','ridePlanet','fishingTicket'])assert.equal(persisted[key],undefined,key);
});
test('old-life healing and damage cannot cross a reset epoch boundary',async t=>{
 const f=await fixture(t,{profile:p=>{p.hp=30;}}),enemy=f.spawn('mushroom');f.authority.damage(f.peer,enemy.id);const engine=f.authority.engineFor(f.peer);assert.ok(engine.healthEvents.length);
 f.account.adventureEpoch=1;f.account.lifeEpoch=1;f.authority.resetPeer(f.peer,{newLife:true,reason:'reset'});assert.equal(engine.healthEvents.length,0);assert.equal(engine.sim.projectiles.length,0);assert.equal(engine.nextSkill[0],0);
});

test('healing actions can await buffered and in-flight health before consuming an item',async t=>{
 const f=await fixture(t),enemy=f.spawn('mushroom'),engine=f.authority.engineFor(f.peer),hp=f.account.profile.hp;await f.authority.flushPeerHealth({account:{id:'absent'}});
 f.authority.damage(f.peer,enemy.id);const damage=-engine.healthEvents[0].amount;engine.nextBasic=12345;
 await Promise.all([f.authority.flushPeerHealth(f.peer),f.authority.flushPeerHealth(f.peer)]);
 assert.equal((await f.store.get('actor')).profile.hp,hp-damage);assert.equal(f.account.profile.hp,hp-damage);assert.equal(engine.healthEvents.length,0);assert.equal(engine.pendingHealth,null);assert.equal(engine.nextBasic,12345);
 await f.authority.internal('actor','fixtureHeal',[],records=>{const profile=records.get('actor').profile;profile.hp=Math.min(Game.maxHp(profile),profile.hp+damage);return {};});
 assert.equal(f.account.profile.hp,hp);await f.authority.flushPeerHealth(f.peer);assert.equal(f.account.profile.hp,hp,'settled damage is not applied again after healing');
});

test('a health batch keeps its original revision across lost acknowledgements and receipt eviction',async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1800000000000});
 const f=await fixture(t),engine=f.authority.engineFor(f.peer),hp=f.account.profile.hp;
 engine.healthEvents.push({adventure:0,life:0,amount:-5,source:'test',at:Date.now(),planet:'home',x:-30,z:1});
 const original=f.store.command.bind(f.store);let lost=true;
 t.mock.method(f.store,'command',async spec=>{const committed=await original(spec);if(spec.actionType==='health'&&lost){lost=false;throw new Error('Lost acknowledgement after durable COMMIT');}return committed;});
 await assert.rejects(f.authority.flushPeerHealth(f.peer),/could not be saved/);
 const batch=engine.pendingHealth;assert.ok(batch);assert.equal(batch.originalRevision,0);assert.equal((await f.store.get('actor')).profile.hp,hp-5);
 for(let i=1;i<=513;i++)await original({actorId:'actor',requestId:randomUUID(),hash:commandHash({i}),expectedRevision:i,run:()=>true});
 await f.authority.flushPeerHealth(f.peer);
 assert.equal((await f.store.get('actor')).profile.hp,hp-5,'an evicted receipt cannot reapply the committed damage');
 assert.equal(f.account.profile.hp,hp-5,'the live peer reloads the canonical state');assert.equal(engine.pendingHealth,null);
 engine.healthEvents.push({adventure:0,life:0,amount:-2,source:'test',at:Date.now(),planet:'home',x:-30,z:1});await f.authority.flushPeerHealth(f.peer);
 assert.equal((await f.store.get('actor')).profile.hp,hp-7,'new damage can settle after the expired batch retires');
});

for(const resetAdventure of [false,true])test(`an expired lethal batch ${resetAdventure?'cannot respawn a newer adventure':'still reconciles death after other actions refreshed the cached life'}`,async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1800000000000});
 const f=await fixture(t),engine=f.authority.engineFor(f.peer);
 engine.healthEvents.push({adventure:0,life:0,amount:-10000,source:'test',at:Date.now(),planet:'home',x:-30,z:1});
 const original=f.store.command.bind(f.store);let lost=true;
 t.mock.method(f.store,'command',async spec=>{const committed=await original(spec);if(spec.actionType==='health'&&lost){lost=false;throw new Error('Lost acknowledgement after durable COMMIT');}return committed;});
 await assert.rejects(f.authority.flushPeerHealth(f.peer),/could not be saved/);
 for(let i=1;i<=513;i++){
  const result=await original({actorId:'actor',requestId:randomUUID(),hash:commandHash({i}),expectedRevision:i,run:records=>{if(resetAdventure)records.get('actor').adventureEpoch=1;return true;}});
  Object.assign(f.account,result.accounts[0]); // The server's ordinary afterCommit refreshes account caches.
 }
 assert.equal(f.account.lifeEpoch,1);assert.equal(f.deaths(),0);
 await f.authority.flushPeerHealth(f.peer);assert.equal(engine.pendingHealth,null);
 assert.equal(f.deaths(),resetAdventure?0:1);assert.equal(f.peer.pose.x,resetAdventure?-30:0);
 await f.authority.flushPeerHealth(f.peer);assert.equal(f.deaths(),resetAdventure?0:1,'the same batch cannot respawn twice');
});
test('untouched enemies take shared environmental damage without awarding a player a kill',async t=>{
 const f=await fixture(t,{planet:'lava'}),env=f.authority.state(f.room).environment;env.time=25;env.weather.time=25;let pool;for(let x=25;x<120&&!pool;x+=2)for(let z=-100;z<100;z+=2)if(env.lavaAt({x,z})){pool={x,z};break;}assert.ok(pool);const enemy=f.spawn('firelizard',pool.x,pool.z),before=enemy.hp;f.peer.pose={x:0,z:0};
 assert.ok(enemy);await f.next(m=>m.type==='enemyHealth'&&m.id===enemy.id&&m.hp<before,0);assert.equal(f.account.profile.counters.kills,0);
});
test('server lightning targets a live explorer and dragon phases raise shared nest lava',async t=>{
 const f=await fixture(t,{planet:'cloud'}),env=f.authority.state(f.room).environment,island=env.layout.islands.find(i=>i.id>0&&i.r>8);f.peer.pose.x=island.x;f.peer.pose.z=island.z;env.lightning.wait=0;
 const packet=await f.next(m=>m.type==='environment'&&m.snapshot.lightning.bolts.length>0,0);const bolt=packet.snapshot.lightning.bolts[0];assert.ok(Math.hypot(bolt.x-f.peer.pose.x,bolt.z-f.peer.pose.z)<10);assert.ok(Math.hypot(bolt.x,bolt.z)>20);
 const lava=await fixture(t,{planet:'lava'}),dragon=lava.spawn('dragon',30,0);dragon.hp=dragon.maxHp*.2;dragon.respawn=0;dragon.deadUntil=0;const sim=lava.authority.state(lava.room).environment;sim.weather.dragonSummoned=true;const start=sim.nestLevel;
 await lava.next(m=>m.type==='environment'&&m.snapshot.nestLevel>start,0);assert.equal(sim.dragonPhase,3);
});
test('Titan damage comes from a validated cast and preserves its move multiplier',async t=>{
 const f=await fixture(t,{profile:p=>{p.healthUp=100;p.hp=Game.maxHp(p);}}),enemy=f.spawn('titan_turtle',100,0);f.peer.pose={x:100,z:10,facing:0,moving:false};
 f.authority.acceptSnapshots(f.room,[{id:enemy.id,type:enemy.type,x:100,z:0,phase:'windup',phaseTime:.01,attackCount:2,skill:'leap',facing:0,targetX:100,targetZ:10}]);
 assert.ok(enemy.cast);assert.ok(enemy.cast.startsAt>Date.now()+500,'host cannot shorten canonical windup');enemy.cast.startsAt=Date.now()-1;f.authority.damage(f.peer,enemy.id,'melee');assert.equal(f.authority.engineFor(f.peer).healthEvents.length,0,'host damage packets cannot duplicate the cast');
 const hit=await f.next(m=>m.type==='healthResult'&&m.delta<0,0);assert.equal(hit.delta,-Math.round(enemy.damage*2.2));
});

test('long Titan hazards keep running when the next skill starts and launches only cancel pending wind-ups',async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1800000000000});
 const f=await fixture(t,{planet:'candy'}),enemy=f.spawn('titan_hydra');f.peer.pose={x:30,z:10,facing:0,moving:false};
 const cast=(skill,count)=>f.authority.acceptSnapshots(f.room,[{id:enemy.id,type:enemy.type,x:30,z:0,phase:'windup',attackCount:count,skill,facing:0}]);
 cast('pools',2);const pools=enemy.cast;pools.startsAt=Date.now()-1;t.mock.timers.tick(50);assert.ok(pools.attack);
 enemy.nextCastAt=0;cast('orbs',4);const orbs=enemy.cast;assert.notEqual(orbs,pools);assert.equal(enemy.combatAttacks.length,2);
 const age=pools.attack.age;t.mock.timers.tick(50);assert.ok(pools.attack.age>age,'the first attack continues after a second wind-up');
 const engine=f.authority.engineFor(f.peer);f.peer.pose.z=1;engine.sim.skill(2);engine.sim.update(.43);
 assert.ok(enemy.combatAttacks.includes(pools),'already cast pools survive launch');assert.ok(!enemy.combatAttacks.includes(orbs),'launch interrupts the pending orb wind-up');
});

test('phase-three dragon rain is created by the authority and uses the enraged cooldown',async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1800000000000});
 const f=await fixture(t,{planet:'lava'}),env=f.authority.state(f.room).environment;env.time=25;env.weather.time=25;
 let dry;for(let x=25;x<110&&!dry;x+=2)for(let z=-70;z<70;z+=2){const p={x,z},height=terrainHeight(env.layout,p);if(height>env.lavaLevel+.1&&height<.7){dry=p;break;}}assert.ok(dry);
 const dragon=f.spawn('dragon',dry.x,dry.z);dragon.hp=dragon.maxHp*.2;f.peer.pose={...dry,facing:0,moving:false};
 f.authority.acceptSnapshots(f.room,[{id:dragon.id,type:'dragon',...dry,phase:'windup',attackCount:2,skill:'rain',facing:0}]);
 assert.ok(env.fireRain.some(r=>r.id.startsWith('dragon:')),'dragon rain must be in shared server weather');
 const windup=1.3*.8,cooldown=ENEMY_TYPES.dragon.cooldown*.7*.6*.8;
 assert.equal(dragon.nextCastAt,Date.now()+(windup+cooldown)*1000,'phase-three cooldown has its extra 0.8 multiplier');
});

test('a lost health commit reply retries the same receipt instead of applying damage twice',async t=>{
 const f=await fixture(t),enemy=f.spawn('mushroom'),engine=f.authority.engineFor(f.peer),initialHp=f.account.profile.hp,requestIds=[];
 const command=f.store.command.bind(f.store);let droppedReply=false;
 f.store.command=async input=>{const committed=await command(input);if(input.actionType==='health'){requestIds.push(input.requestId);if(!droppedReply){droppedReply=true;throw new Error('Fixture: connection lost after commit');}}return committed;};
 f.authority.damage(f.peer,enemy.id);const damage=-engine.healthEvents[0].amount;
 await f.next(m=>m.type==='healthResult'&&m.delta<0,0);
 assert.equal(requestIds.length,2);assert.equal(requestIds[0],requestIds[1]);assert.equal((await f.store.get('actor')).profile.hp,initialHp-damage);
 assert.equal(f.account.profile.hp,initialHp-damage,'receipt replay refreshes the connected account');assert.ok(f.messages.some(m=>m.type==='profile'&&m.profile.hp===initialHp-damage));
});

test('environmental damage shares hit invulnerability and the knight armor defense bonus',async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1800000000000});
 const f=await fixture(t),engine=f.authority.engineFor(f.peer);engine.hpAt=Date.now()+100000;engine.sim.statuses.armor=6;
 engine.environment.step=()=>({damage:20,heal:0});
 t.mock.timers.tick(50);assert.equal(engine.healthEvents.length,1);assert.equal(engine.healthEvents[0].amount,-9);
 t.mock.timers.tick(500);assert.equal(engine.healthEvents.length,1,'successive hazard ticks respect the 550 ms hit window');
 t.mock.timers.tick(50);assert.equal(engine.healthEvents.length,2);assert.equal(engine.healthEvents[1].amount,-9);
});

test('an explorer inside the safe zone takes no creature or hazard damage online',async t=>{
 const f=await fixture(t),enemy=f.spawn('mushroom'),engine=f.authority.engineFor(f.peer);engine.hpAt=Date.now()+100000;
 f.peer.pose={x:-5,z:0,facing:0,moving:false};f.authority.damage(f.peer,enemy.id,'shot');assert.equal(engine.healthEvents.length,0,'a shot reported inside the fence is ignored');
 f.peer.pose={x:-25,z:0,facing:0,moving:false};f.authority.damage(f.peer,enemy.id,'shot');assert.equal(engine.healthEvents.length,1,'outside the fence it hurts');assert.ok(engine.healthEvents[0].amount<0);
});

test('validated dinosaur execution ignores an armored turtle shell and heals only after one durable kill',async t=>{
 const f=await fixture(t,{planet:'lava',profile:p=>{p.level=50;p.bag.dz_dino=1;p.gear.disguise='dz_dino';p.hp=20;}}),enemy=f.spawn('magmaturtle');enemy.hp=enemy.maxHp*.39;enemy.phase='idle';
 f.authority.skill(f.peer,0);assert.equal(f.account.profile.hp,20);assert.equal(enemy.pending,true);
 f.authority.skill(f.peer,0);await f.next(m=>m.type==='executeResult'&&m.ok,0);
 assert.equal(enemy.hp,0);assert.equal(f.account.profile.hp,20+Game.maxHp(f.account.profile)*.25);assert.equal(f.account.profile.counters.kills,1);
});

test('boss warnings use the authoritative damaging marks, including Titan safe rings and stagger indices',async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1800000000000});
 const f=await fixture(t,{planet:'candy'}),enemy=f.spawn('titan_hydra');f.peer.pose={x:30,z:10,facing:0,moving:false};
 f.authority.acceptSnapshots(f.room,[{id:enemy.id,type:enemy.type,x:30,z:0,phase:'windup',phaseTime:0,attackCount:2,skill:'bombard',telegraphs:[{x:120,z:120,r:1,delay:0}]}]);
 assert.deepEqual(enemy.telegraphs,enemy.cast.marks);assert.ok(enemy.telegraphs.some(mark=>mark.k>0));assert.ok(enemy.phaseTime>1);
 const home=await fixture(t),turtle=home.spawn('titan_turtle',100,0);home.peer.pose={x:100,z:10,facing:0,moving:false};
 home.authority.acceptSnapshots(home.room,[{id:turtle.id,type:turtle.type,x:100,z:0,phase:'windup',attackCount:2,skill:'donut'}]);
 assert.equal(turtle.telegraphs.filter(mark=>mark.safe).length,1);assert.deepEqual(home.room.enemies.find(e=>e.id===turtle.id).telegraphs,turtle.cast.marks);
});

test('active Titan attack snapshots advance without host packets so migration retains the current hazard age',async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1800000000000});
 const f=await fixture(t,{planet:'candy'}),enemy=f.spawn('titan_hydra');f.peer.pose={x:30,z:20,facing:0,moving:false};
 f.authority.acceptSnapshots(f.room,[{id:enemy.id,type:enemy.type,x:30,z:0,phase:'windup',attackCount:2,skill:'orbs'}]);enemy.cast.startsAt=Date.now()-1;
 t.mock.timers.tick(300);const first=f.messages.filter(m=>m.type==='enemies').at(-1).enemies.find(e=>e.id===enemy.id).titanAttacks[0];assert.ok(first.age>0);
 t.mock.timers.tick(300);const latest=f.messages.filter(m=>m.type==='enemies').at(-1).enemies.find(e=>e.id===enemy.id).titanAttacks[0];assert.ok(latest.age>first.age);
 assert.deepEqual(f.room.enemies.find(e=>e.id===enemy.id).titanAttacks[0],latest);assert.equal(latest.orbs.length,5);assert.ok(latest.orbs.some((orb,i)=>orb.x!==first.orbs[i].x||orb.z!==first.orbs[i].z));
});

test('Scorpion Titan trophies provide their advertised lava immunity online',async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1800000000000});
 for(const id of ['hat_t_scorpion','pet_t_scorpion']){
  const f=await fixture(t,{planet:'lava',profile:p=>{p.level=Game.gearLevel(id);p.bag[id]=1;Game.equip(p,id);}}),engine=f.authority.engineFor(f.peer);engine.hpAt=Date.now()+100000;
  let observed;engine.environment.step=(_dt,_pose,_input,traits)=>{observed=traits;return {damage:traits.maxHp*.07*(1-traits.fireResistance),heal:0};};
  t.mock.timers.tick(50);assert.equal(observed.fireResistance,1,id);assert.equal(engine.healthEvents.length,0,id);
 }
});

test('online lava burns ordinary ground creatures but preserves the burrowing lava worm',async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1800000000000});
 const f=await fixture(t,{planet:'lava'}),env=f.authority.state(f.room).environment;env.time=25;env.weather.time=25;f.peer.pose={x:0,z:0,facing:0,moving:false};
 let pool;for(let x=25;x<120&&!pool;x+=2)for(let z=-100;z<100;z+=2)if(env.lavaAt({x,z})){pool={x,z};break;}assert.ok(pool);
 const worm=f.spawn('lavaworm',pool.x,pool.z),slime=f.spawn('magmaslime',pool.x,pool.z),hp=worm.hp;t.mock.timers.tick(50);
 assert.equal(worm.hp,hp);assert.ok(slime.hp<slime.maxHp);
});

test('Hard difficulty: the room host save gives server creatures +25% health and +20% damage, Easy keeps the roster',async t=>{
 const roster=enemyRoster('home').find(e=>e.type==='mushroom');
 const hard=await fixture(t,{profile:p=>{p.settings.difficulty='hard';}}),h=hard.spawn('mushroom');
 assert.equal(h.maxHp,Math.round(roster.baseMaxHp*1.25));assert.equal(h.hp,h.maxHp);assert.ok(Math.abs(h.damage-roster.baseDamage*1.2)<1e-9);
 const easy=await fixture(t),e=easy.spawn('mushroom');assert.equal(e.maxHp,roster.baseMaxHp);assert.equal(e.damage,roster.baseDamage);
});
test('disguise freezes reach the server and the knight shield blocks only blows from in front',async t=>{
 const f=await fixture(t,{profile:p=>{p.gear.disguise='dz_navy';p.bag.dz_navy=1;}}),enemy=f.spawn('mushroom',-30,4),boss=f.spawn('treant',-28,3);const engine=f.authority.engineFor(f.peer);
 // The bosun's whistle stuns everything within 8 m, bosses too; clients hear it as a 'stun' status.
 const from=f.messages.length;assert.equal(engine.sim.disguise('dz_navy',2),true);assert.equal(enemy.stun,2.5);assert.equal(boss.stun,2.5);assert.ok(f.messages.slice(from).some(m=>m.type==='status'&&m.kind==='stun'&&m.id===enemy.id));
 f.account.profile.gear.disguise='dz_knight';f.account.profile.bag.dz_knight=1;f.peer.pose.facing=0;assert.equal(engine.sim.disguise('dz_knight',0),true);
 engine.healthEvents=[];engine.damageAt=0;f.authority.damage(f.peer,enemy.id);assert.equal(engine.healthEvents.length,0,'blocked from the front');
 f.peer.pose.facing=Math.PI;engine.damageAt=0;f.authority.damage(f.peer,enemy.id);assert.ok(engine.healthEvents.some(e=>e.amount<0),'hurt from behind');
});
test('online summons: the server shares checked decoys, a reported blow hurts the clone (never the explorer) and its health goes home',async t=>{
 const f=await fixture(t,{profile:p=>{p.gear.disguise='dz_ninja';p.bag.dz_ninja=1;}}),enemy=f.spawn('mushroom',-30,4);const engine=f.authority.engineFor(f.peer);
 f.peer.pose.facing=0;assert.equal(engine.sim.disguise('dz_ninja',0),true);
 const shared=f.authority.decoys(f.peer);assert.equal(shared.length,4);assert.ok(shared.every(d=>d.kind==='clone'&&d.taunt&&Math.hypot(d.x-f.peer.pose.x,d.z-f.peer.pose.z)<=6));
 const clone=engine.sim.allies[0],full=clone.hp;engine.healthEvents=[];engine.damageAt=0;const from=f.messages.length;
 f.authority.damage(f.peer,enemy.id,'melee',clone.id);
 assert.equal(engine.healthEvents.length,0,'the explorer is not hurt');assert.ok(clone.hp<full,'the clone is');
 const sent=f.messages.slice(from).find(m=>m.type==='decoyHp');assert.equal(sent?.id,clone.id);assert.equal(sent.hp,clone.hp);
 // A stale id lands on the nearest live clone the creature can reach; with none in reach nothing is hurt.
 f.authority.damage(f.peer,enemy.id,'melee',999);assert.equal(engine.healthEvents.length,0);
 for(const a of engine.sim.allies){a.x=-60;a.z=40;}const hps=engine.sim.allies.map(a=>a.hp);f.authority.damage(f.peer,enemy.id,'melee',engine.sim.allies[1].id);
 assert.deepEqual(engine.sim.allies.map(a=>a.hp),hps,'a summon far beyond the creature\'s reach is not hurt');assert.equal(engine.healthEvents.length,0);
 // Out of the lifetime, nothing is shared.
 engine.sim.update(9);assert.deepEqual(f.authority.decoys(f.peer),[]);
});
test("online knight: a shot reported against the raised shield hits the shooter back, not the explorer",async t=>{
 const f=await fixture(t,{profile:p=>{p.gear.disguise='dz_knight';p.bag.dz_knight=1;}}),enemy=f.spawn('mushroom',-30,6);const engine=f.authority.engineFor(f.peer);
 f.peer.pose.facing=0;assert.equal(engine.sim.disguise('dz_knight',0),true);const hp=enemy.hp;engine.healthEvents=[];engine.damageAt=0;
 f.authority.damage(f.peer,enemy.id,'shot');assert.equal(engine.healthEvents.length,0,'blocked');
 engine.sim.update(.5);assert.ok(enemy.hp<hp,'the shooter is hit by its own shot');
 f.peer.pose.facing=Math.PI;const after=enemy.hp;engine.damageAt=0;f.authority.damage(f.peer,enemy.id,'shot');engine.sim.update(.5);assert.equal(enemy.hp,after,'from behind nothing bounces');assert.ok(engine.healthEvents.some(e=>e.amount<0));
});

// Elite roles (src/elite-roles.ts): the server decides the barrier and the split exactly as the browser does.
const eliteEntry=(planet,role)=>enemyRoster(planet).find(e=>e.elite===role);
const spawnEntry=(f,entry,x=31.5,z=1)=>{f.authority.acceptSnapshots(f.room,[{id:entry.id,type:entry.type,x,z,hp:1}]);return f.authority.state(f.room).enemies.get(entry.id);};
test('elite shield online: a gun shot is deflected to 15%, sword hits crack it, the third breaks it with a stun, and the barrier is published',async t=>{
 const gun=await fixture(t,{planet:'ocean',profile:p=>{p.level=12;p.bag.gun_spike=1;p.gear.weapon='gun_spike';}}),crab=spawnEntry(gun,eliteEntry('ocean','shielded'),32,1),engine=gun.authority.engineFor(gun.peer);engine.sim.random=()=>.5;
 assert.equal(crab.elite,'shielded');const before=crab.hp;gun.authority.basic(gun.peer,crab.id);for(let i=0;i<10;i++)engine.sim.update(.05);
 const shot=before-crab.hp;assert.ok(shot>0,'a shot lands');assert.equal(crab.barrier.cracks,0);
 const impact=gun.messages.findLast(m=>m.type==='enemyHealth'&&m.id===crab.id&&m.impact);assert.equal(impact.impact.barrier,'deflect');assert.equal(impact.impact.source,'shot');
 const sword=await fixture(t,{planet:'ocean',profile:p=>{p.level=12;p.bag.sword_crystal=1;p.gear.weapon='sword_crystal';}}),elite=spawnEntry(sword,eliteEntry('ocean','shielded'),31.2,1),e2=sword.authority.engineFor(sword.peer);e2.sim.random=()=>.5;
 const hits=[];for(let i=0;i<3;i++){const hp=elite.hp;e2.nextBasic=0;sword.authority.basic(sword.peer,elite.id);hits.push(hp-elite.hp);if(i<2)assert.equal(elite.barrier.cracks,i+1);}
 assert.ok(hits.every(h=>h>0)&&Math.min(...hits)>Math.max(...hits)*.8,'every sword hit lands in full (none is cut)');
 assert.ok(elite.barrier.open>5.9&&elite.stun>=.99,'broken for 6 s, stunned');
 const published=sword.authority.state(sword.room).enemies.get(elite.id);sword.authority.acceptSnapshots(sword.room,[]);assert.ok(sword.room.enemies.find(s=>s.id===elite.id).barrier.open>5.9,'the snapshot carries the barrier');void published;
 // While it is broken a shot hurts in full.
 const g2=await fixture(t,{planet:'ocean',profile:p=>{p.level=12;p.bag.gun_spike=1;p.gear.weapon='gun_spike';}}),c2=spawnEntry(g2,eliteEntry('ocean','shielded'),32,1),e3=g2.authority.engineFor(g2.peer);e3.sim.random=()=>.5;c2.barrier={cracks:0,open:6,idle:0};
 const hp2=c2.hp;g2.authority.basic(g2.peer,c2.id);for(let i=0;i<10;i++)e3.sim.update(.05);const full=hp2-c2.hp;assert.ok(Math.abs(shot/full-.15)<.04,`open: full damage; standing, the same shot did ${shot} of ${full} (15%)`);
});
test('elite split online: the server wakes two children where the splitter fell, children do not split again, and pay EXP without counting as kills',async t=>{
 const f=await fixture(t,{planet:'candy',profile:p=>{p.level=30;p.bag.sword_crystal=1;p.gear.weapon='sword_crystal';}}),engine=f.authority.engineFor(f.peer);engine.sim.random=()=>.5;
 const kids=enemyRoster('candy').filter(e=>e.elite==='mini');f.authority.acceptSnapshots(f.room,kids.map(k=>({id:k.id,type:k.type,x:30,z:30,hp:1})));
 for(const k of kids)assert.equal(f.authority.state(f.room).enemies.get(k.id).hp,0,'dormant until a split');
 const elite=spawnEntry(f,eliteEntry('candy','splitter'),31.2,1);elite.hp=1;f.authority.basic(f.peer,elite.id);
 await f.next(m=>m.type==='defeat'&&m.id===elite.id);
 const woken=kids.map(k=>f.authority.state(f.room).enemies.get(k.id)).filter(k=>k.hp>0);
 assert.equal(woken.length,2);for(const k of woken){assert.equal(k.parentId,elite.id);assert.equal(k.depth,1);assert.ok(Math.hypot(k.x-elite.x,k.z-elite.z)<1);}
 const killsBefore=(await f.store.get('actor')).profile.counters?.kills??0,xpBefore=(await f.store.get('actor')).profile.xp;
 const kid=woken[0];kid.x=31.2;kid.z=1;kid.hp=1;engine.nextBasic=0;f.authority.basic(f.peer,kid.id);await f.next(m=>m.type==='defeat'&&m.id===kid.id);
 assert.equal(kids.map(k=>f.authority.state(f.room).enemies.get(k.id)).filter(k=>k.hp>0).length,1,'a child does not split');
 const after=(await f.store.get('actor')).profile;assert.equal(after.counters?.kills??0,killsBefore,'a child is not a kill');assert.ok(after.xp>xpBefore||after.level>30,'but pays EXP');
});
test('elite split online: at the live-children cap the splitter dies without splitting, and children leave with their parent\'s respawn',async t=>{
 const f=await fixture(t,{planet:'candy',profile:p=>{p.level=30;p.bag.sword_crystal=1;p.gear.weapon='sword_crystal';}}),engine=f.authority.engineFor(f.peer);engine.sim.random=()=>.5;
 const kids=enemyRoster('candy').filter(e=>e.elite==='mini');f.authority.acceptSnapshots(f.room,kids.map(k=>({id:k.id,type:k.type,x:30,z:30,hp:1})));
 const live=kids.map(k=>f.authority.state(f.room).enemies.get(k.id));live.slice(0,7).forEach(k=>{k.hp=k.maxHp;k.deadUntil=0;});
 const elite=spawnEntry(f,eliteEntry('candy','splitter'),31.2,1);elite.hp=1;f.authority.basic(f.peer,elite.id);await f.next(m=>m.type==='defeat'&&m.id===elite.id);
 assert.equal(live.filter(k=>k.hp>0).length,7,'one free slot is not enough for two: no split');
 // Children of a splitter vanish when it comes back.
 live.slice(0,7).forEach(k=>{k.hp=0;k.deadUntil=Infinity;});const other=spawnEntry(f,enemyRoster('candy').filter(e=>e.elite==='splitter')[1],33,3);other.hp=1;engine.nextBasic=0;other.x=31.2;other.z=1;f.authority.basic(f.peer,other.id);await f.next(m=>m.type==='defeat'&&m.id===other.id);
 assert.equal(live.filter(k=>k.hp>0&&k.parentId===other.id).length,2);
 other.deadUntil=Date.now()-1;f.peer.pose={x:-60,z:-60,facing:0,moving:false};other.home={x:other.x+40,z:other.z+40};
 await new Promise(r=>setTimeout(r,400));
 assert.ok(other.hp>0,'the splitter is back');assert.equal(live.filter(k=>k.hp>0&&k.parentId===other.id).length,0,'and its children are gone');
});
test('weapon pair online: the server holds the weapon in hand from swap packets, keeps the gap and the draw, and pays the +20% swap bonus once',async t=>{
 t.mock.timers.enable({apis:['Date','setInterval'],now:1800000000000});
 const f=await fixture(t,{profile:p=>{p.level=20;p.bag.sword_lava=1;p.bag.gun_ice=1;p.gear.weapon='sword_lava';p.gear.side='gun_ice';}}),enemy=f.spawn('mushroom'),engine=f.authority.engineFor(f.peer);
 engine.sim.random=()=>.5;enemy.hp=enemy.maxHp=1e6;enemy.phase='chase';
 const blow=()=>{engine.nextBasic=0;const before=enemy.hp;f.authority.basic(f.peer,enemy.id);return before-enemy.hp;};
 const plain=blow();assert.ok(plain>0,'the blade hits');assert.equal(engine.pair.hand,'main');
 t.mock.timers.tick(1500);
 assert.equal(f.authority.swap(f.peer,'side'),true);assert.equal(engine.pair.hand,'side');
 assert.equal(f.authority.swap(f.peer,'main'),false,'0.6 s between swaps');assert.equal(f.authority.swap(f.peer,'sword'),false,'only main or side');
 assert.equal(blow(),0,'drawing: no attack for 0.15 s');
 t.mock.timers.tick(200);engine.nextBasic=0;f.authority.basic(f.peer,enemy.id);assert.ok(engine.sim.projectiles.length>0,'the gun in hand shoots');
 for(let i=0;i<20;i++)engine.sim.update(.05);
 t.mock.timers.tick(1500);engine.sim.projectiles.length=0;
 assert.equal(f.authority.swap(f.peer,'main'),true);t.mock.timers.tick(200);
 const bonus=blow(),after=blow();
 assert.ok(Math.abs(bonus/plain-1.2)<.02,`first blade hit after the swap: ${bonus} vs ${plain}`);
 assert.ok(after<bonus,'the bonus is spent');
 // No side gun any more: the server falls back to the main hand and refuses the side.
 delete f.account.profile.gear.side;t.mock.timers.tick(1000);assert.equal(f.authority.swap(f.peer,'side'),false);assert.equal(engine.pair.hand,'main');
});
test('breakable scenery: the server wears, breaks and regrows a piece for the room, holds it near a fighting boss, and caps the wood',async t=>{
 const f=await fixture(t,{planet:'ice',options:{sceneryRandom:()=>0}}),tree='snow_pine@305:10',stone='snow_rock@310:-20',now=()=>Date.now()/1000;
 const hits=id=>f.messages.filter(m=>m.type==='scenery'&&m.id===id);
 // Pets never wear scenery; a piece out of reach or of another type is refused; so is any hit off the Ice planet.
 assert.equal(f.authority.scenery(f.peer,tree,'pet'),null);assert.equal(f.authority.scenery(f.peer,'snow_pine@900:10','melee'),null);assert.equal(f.authority.scenery(f.peer,'ice_spire@305:10','melee'),null);
 // Nine basic hits fell a tree (one counted per rehit gap: the ledger's clock is pinned by waiting it out).
 const ledger=f.room.scenery??(f.authority.scenery(f.peer,tree,'melee'),f.room.scenery);assert.ok(ledger);
 for(let i=0;i<20&&!ledger.broken(tree);i++){ledger['last'].clear();f.authority.scenery(f.peer,tree,'melee');}
 const wear=hits(tree);assert.equal(wear.filter(m=>m.outcome==='wear').length,8);assert.equal(wear.at(-1).outcome,'break');assert.equal(wear.at(-1).hp,0);
 // Pinned random 0: it regrows after exactly 180 s, and not while someone stands on the spot.
 assert.ok(Math.abs(ledger.get(tree).regrowAt-(now()+180))<2);
 const wood=await f.next(m=>m.type==='sceneryWood',0);assert.equal(wood.wood,1);const saved=await f.store.get('actor');assert.equal(saved.profile.bag.wood,1);
 ledger.get(tree).regrowAt=now()-1;f.peer.pose.x=30.5;f.peer.pose.z=1;f.authority.engineFor(f.peer);
 await new Promise(r=>setTimeout(r,1150));assert.ok(ledger.broken(tree),'the explorer stands on the spot: no regrowth');
 f.peer.pose.x=34;await new Promise(r=>setTimeout(r,1150));assert.ok(!ledger.broken(tree));assert.equal(hits(tree).at(-1).outcome,'regrow');
 // A boss fighting within 28 m holds the stone: the hit shows ('held') but no damage counts, and it counts again after the fight.
 const boss=f.spawn('yeti',40,-2,{phase:'chase',hp:18720});assert.ok(boss.boss);f.peer.pose.x=31;f.peer.pose.z=-2;
 ledger['last'].clear();assert.equal(f.authority.scenery(f.peer,stone,'quake').outcome,'held');assert.equal(ledger.get(stone),undefined);
 boss.phase='idle';ledger['last'].clear();await new Promise(r=>setTimeout(r,760));const worn=f.authority.scenery(f.peer,stone,'quake');assert.equal(worn.outcome,'wear');assert.equal(worn.hp,14-3.5);
 // A stone takes several heavy blows: four Quakes crack it apart (one heavy blow per 0.7 s).
 for(let i=0;i<3;i++){ledger['last'].clear();await new Promise(r=>setTimeout(r,720));f.authority.scenery(f.peer,stone,'quake');}assert.ok(ledger.broken(stone));
 assert.equal(f.messages.filter(m=>m.type==='sceneryWood').length,1,'a stone drops nothing');
});
test('Bond Surge online: the server decides the surge from three basic packets, doubles the pet\'s shots, staggers the boss, opens it to the explorer and soaks to the boss cap (pinned random)',async t=>{
 const f=await fixture(t,{profile:p=>{p.level=20;p.bag.sword_wood=1;p.gear.weapon='sword_wood';p.bag.pet_colossus=1;p.gear.pet='pet_colossus';}});
 const bear=f.spawn('bear',107,-46),engine=f.authority.engineFor(f.peer);bear.x=-30;bear.z=3;bear.phase='chase'; // accepted in its own zone (the canyon), then beside the explorerengine.sim.random=()=>.5; // no lucky criticals: the +15% is exact
 const press=()=>{engine.nextBasic=0;const before=bear.hp;f.authority.basic(f.peer,bear.id);return before-bear.hp;},surges=()=>f.messages.filter(m=>m.type==='surge').map(m=>m.event);
 press();engine.sim.update(.3);const plain=press();engine.sim.update(.3);assert.equal(surges().length,0,'two hits: nothing yet');press();
 assert.deepEqual(surges().map(e=>[e.phase,e.sig,e.slot]),[['start','stomp',0]],'the third basic hit: the Colossus surges, told to its explorer');
 bear.phase='chase';const shots=new Set(),shoot=engine.sim.shoot.bind(engine.sim);engine.sim.shoot=(kind,angle,multiplier,...rest)=>{if(rest[1]?.helper)shots.add(Math.round(multiplier*100)/100);return shoot(kind,angle,multiplier,...rest);};engine.sim.update(.35);
 const big=surges().find(e=>e.phase==='big');assert.equal(big.boss,bear.id);assert.ok(bear.stun>0,'the boss is staggered');assert.ok(engine.sim.surge.vulnerable(bear.id));
 for(let i=0;i<60;i++)engine.sim.update(.025);
 assert.ok(shots.has(Math.round(Game.ITEMS.pet_colossus.pet.dmg*SURGE.damage*100)/100),`the pet's shot is doubled on the server: ${[...shots]}`);
 const open=press();assert.ok(Math.abs(open/plain-(1+SURGE.vuln))<.02,`the explorer's own hit on the open boss: ${plain} -> ${open}`);
 // Bulwark (the Colossus keeps it): the boss's next blow loses only the 30% cap; the explorer is told it was blocked.
 const lost=()=>engine.healthEvents.reduce((sum,e)=>sum-Math.min(0,e.amount),0),before=lost(),profile=f.peer.account.profile;engine.damageAt=0;f.authority.damage(f.peer,bear.id,'melee');
 assert.equal(lost()-before,Math.max(1,Math.round(bear.damage*.7*60/(Game.defense(profile)+60))));
 assert.ok(f.messages.some(m=>m.type==='guard'&&m.event.kind==='block'&&Math.abs(m.event.power-bear.damage*.3)<1e-6));
 // After the surge and its cooldown the next three hits surge again; a reset (a new room) ends a surge on the server too.
 for(let i=0;i<14/.05;i++)engine.sim.update(.05);assert.equal(engine.sim.surge.state,'ready');press();engine.sim.update(.3);press();engine.sim.update(.3);press();
 assert.equal(surges().filter(e=>e.phase==='start').length,2);f.authority.resetPeer(f.peer);assert.equal(engine.sim.surge.state,'ready');
});
