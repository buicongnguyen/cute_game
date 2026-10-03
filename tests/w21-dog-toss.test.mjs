import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAccountStore} from '../server/account-store.mjs';
import {createCombatAuthority} from '../server/combat-authority.mjs';
import * as Game from '../src/model.ts';
import {enemyRoster} from '../src/enemy-roster.ts';
import {ENEMY_TYPES} from '../src/enemy-types.ts';
import {createEnvironmentLayout,terrainHeight} from '../src/environments.ts';

async function fixture(t,{planet='home',profile:configure=()=>{}}={}){
 const dataDir=await mkdtemp(path.join(tmpdir(),'cute-combat-authority-')),store=await createAccountStore({dataDir,databaseUrl:''}),profile=Game.newGame();profile.planet=planet;configure(profile);
 const account=await store.create({id:'actor',username:'actor',hash:'fixture-hash',salt:'fixture-salt',profile,friends:[],requests:[],profileRevision:0});
 const peer={account,active:true,visit:null,planet,room:'public:'+planet,pose:{x:planet==='home'?-30:30,z:1,facing:0,moving:false},socket:{}},peers=new Map([['actor',peer]]),room={id:peer.room,members:new Set(['actor']),host:'actor',enemies:[],killed:new Set()},rooms=new Map([[room.id,room]]);
 const messages=[],waiters=[];const emit=value=>{messages.push(structuredClone(value));for(const waiter of [...waiters])if(waiter.predicate(value)){clearTimeout(waiter.timer);waiters.splice(waiters.indexOf(waiter),1);waiter.resolve(structuredClone(value));}};
 const remember=value=>{Object.assign(account,value);const live=peers.get(value.id);if(live)live.account=account;return account;};
 let deaths=0;const authority=createCombatAuthority({store,peers,rooms,remember,onError:error=>t.diagnostic(error.stack),send:(_,value)=>emit(value),broadcast:(_,value)=>emit(value),onDeath:p=>{deaths++;p.planet='home';p.room='public:home';p.pose={x:0,z:0,facing:0,moving:false};}});
 t.after(async()=>{await authority.close();await store.close();});
 const next=(predicate,from=messages.length)=>{const found=messages.slice(from).find(predicate);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const waiter={predicate,resolve,timer:setTimeout(()=>reject(new Error('Missing authority event')),3000)};waiters.push(waiter);});};
 function spawn(type,x=planet==='home'?-30:30,z=0,extra={}){const definition=enemyRoster(planet).find(e=>e.type===type);assert.ok(definition,type);authority.acceptSnapshots(room,[{id:definition.id,type,x,z,hp:1,...extra}]);return authority.state(room).enemies.get(definition.id);}
 return {store,account,peer,peers,room,rooms,authority,messages,next,spawn,deaths:()=>deaths};
}
// ---- w21: the guard dog's toy toss (guard-dog.ts, combat.ts dogToss, server/combat-authority.mjs) ----------------------
const G=await import('../src/guard-dog.ts');
const {CombatSimulation}=await import('../src/combat.ts');
const foe=(id,x,z,hp=100,radius=.5)=>({id,x,z,hp,maxHp:hp,radius});
function sim({dog,targets,attack=20}){
  const hits=[],effects=[];
  const s=new CombatSimulation({position:()=>({x:0,z:0}),facing:()=>0,face:()=>{},targets:()=>targets,weapon:()=>({kind:'fist'}),stats:()=>({attack,critChance:0}),move:()=>{},
    hit:(t,h)=>{hits.push({id:t.id,amount:h.amount});t.hp-=h.amount;},effect:e=>effects.push(e),dog:()=>dog()},()=>.5);
  return {s,hits,effects};
}
test('dog toss numbers: range 6-8 m, cooldown 2-3 s, a starter pet\'s shot growing a little with level',()=>{
  assert.ok(G.DOG_TOSS_RANGE>=6&&G.DOG_TOSS_RANGE<=8);assert.ok(G.DOG_TOSS_CD>=2&&G.DOG_TOSS_CD<=3);
  assert.equal(G.dogTossFactor(1),.25);assert.ok(Math.abs(G.dogTossFactor(21)-.3)<1e-9);assert.equal(G.dogTossFactor(200),.375);assert.equal(G.dogTossFactor(NaN),.25);
});
test('the dog targets your target first, else the nearest living creature in reach',()=>{
  const near=foe('near',2,0),far=foe('far',5,0),dead=foe('dead',1,0,0),out=foe('out',20,0);
  assert.equal(G.dogTarget({x:0,z:0},[far,near,dead,out]).id,'near');
  assert.equal(G.dogTarget({x:0,z:0},[far,near],'far').id,'far');
  assert.equal(G.dogTarget({x:0,z:0},[near,out],'out').id,'near');// the chosen target out of reach: nearest instead
  assert.equal(G.dogTarget({x:0,z:0},[dead,out]),undefined);
});
test('the dog never fights at home: the village circle, the pen or the cottage',()=>{
  assert.equal(G.dogMayToss('follow','home',{x:0,z:0}),false);
  assert.equal(G.dogMayToss('pen','home',{x:-30,z:0}),false);
  assert.equal(G.dogMayToss('return','forest',{x:30,z:0}),false);
  assert.equal(G.dogMayToss('follow','home',{x:-30,z:1},true),false);
  assert.equal(G.dogMayToss('follow','home',{x:-30,z:1}),true);assert.equal(G.dogMayToss('follow','forest',{x:30,z:0}),true);
});
test('a toss: head-flick effect now, the hit (attack x factor) when the bone lands, then a cooldown',()=>{
  const t1=foe('a',3,0);let dog={x:0,z:0,dmg:G.dogTossFactor(1),cd:G.DOG_TOSS_CD};
  const {s,hits,effects}=sim({dog:()=>dog,targets:[t1]});
  s.update(.05);assert.equal(effects.filter(e=>e.kind==='toss').length,1);assert.equal(hits.length,0);
  const toss=effects.find(e=>e.kind==='toss');assert.ok(Math.abs(toss.radius-3)<1e-9);assert.ok(Math.abs(toss.facing-Math.PI/2)<1e-9);
  for(let i=0;i<12;i++)s.update(.05);// bone lands after DOG_TOSS_FLIGHT
  assert.deepEqual(hits,[{id:'a',amount:5}]);// 20 attack x .25 = 5, the damage number shown
  assert.ok(effects.some(e=>e.kind==='impact'));
  for(let t=0;t<G.DOG_TOSS_CD-.8;t+=.05)s.update(.05);assert.equal(effects.filter(e=>e.kind==='toss').length,1,'still cooling down');
  for(let t=0;t<1;t+=.05)s.update(.05);assert.equal(effects.filter(e=>e.kind==='toss').length,2,'throws again after the cooldown');
  dog=null;for(let t=0;t<6;t+=.05)s.update(.05);assert.equal(effects.filter(e=>e.kind==='toss').length,2,'no dog in the fight (at home): no throws');
});
test('out of range: no throw',()=>{
  const {s,effects}=sim({dog:()=>({x:0,z:0,dmg:.25,cd:2.5}),targets:[foe('far',G.DOG_TOSS_RANGE+2,0)]});
  for(let i=0;i<40;i++)s.update(.05);assert.equal(effects.filter(e=>e.kind==='toss').length,0);
});
test('online: the server\'s simulation throws for a following dog and lands real damage; none at home or on a visit',async t=>{
  const f=await fixture(t),enemy=f.spawn('mushroom',-30,4);enemy.hp=enemy.maxHp=500;
  f.peer.pose.dog=0;// the wilds of home (x -30): the server set dog because it follows
  const engine=f.authority.engineFor(f.peer);for(let i=0;i<14;i++)engine.sim.update(.05);
  assert.ok(enemy.hp<500,'the bone landed on the server');
  const toss=f.messages.find(m=>m.type==='effect'&&m.visual?.kind==='toss');assert.ok(toss,'others see the throw');
  const before=enemy.hp;f.peer.pose.dog=null;for(let i=0;i<80;i++)engine.sim.update(.05);assert.equal(enemy.hp,before,'no dog following: no throws');
  f.peer.pose.dog=0;f.peer.visit={owner:'x'};for(let i=0;i<80;i++)engine.sim.update(.05);assert.equal(enemy.hp,before,'visiting: no throws');
});
test('online at home the server ignores a client claiming a following dog',async t=>{
  const f=await fixture(t),enemy=f.spawn('mushroom');enemy.x=2;enemy.z=1;enemy.hp=enemy.maxHp=500;f.peer.pose={x:0,z:0,facing:0,moving:false,dog:0};
  const engine=f.authority.engineFor(f.peer);for(let i=0;i<80;i++)engine.sim.update(.05);assert.equal(enemy.hp,500);
});
