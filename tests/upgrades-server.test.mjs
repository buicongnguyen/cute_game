// Skill levels on the server: combat-authority must use the same cooldowns and the same reach as the browser
// (both read skill-upgrades.ts through upgrades.ts and combat.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAccountStore} from '../server/account-store.mjs';
import {createCombatAuthority} from '../server/combat-authority.mjs';
import * as Game from '../src/model.ts';
import {enemyRoster} from '../src/enemy-roster.ts';
import {CombatSimulation,BASE_SKILLS} from '../src/combat.ts';
import {skillCooldown} from '../src/upgrades.ts';

async function fixture(t,levels){
  const dataDir=await mkdtemp(path.join(tmpdir(),'cute-upgrades-')),store=await createAccountStore({dataDir,databaseUrl:''}),profile=Game.newGame();profile.planet='home';profile.skillLevels=levels;
  const account=await store.create({id:'actor',username:'actor',hash:'h',salt:'s',profile,friends:[],requests:[],profileRevision:0});
  const peer={account,active:true,visit:null,planet:'home',room:'public:home',pose:{x:-30,z:1,facing:0,moving:false},socket:{}},peers=new Map([['actor',peer]]),room={id:peer.room,members:new Set(['actor']),host:'actor',enemies:[],killed:new Set()},rooms=new Map([[room.id,room]]);
  const remember=value=>{Object.assign(account,value);return account;};
  const authority=createCombatAuthority({store,peers,rooms,remember,send:()=>{},broadcast:()=>{}});
  t.after(async()=>{await authority.close();await store.close();});
  const spawn=(type,x,z)=>{const d=enemyRoster('home').find(e=>e.type===type);authority.acceptSnapshots(room,[{id:d.id,type,x,z,hp:1}]);return authority.state(room).enemies.get(d.id);};
  return {peer,authority,spawn,profile:account.profile};
}

test('server skill cooldowns follow the skill level (dash 4 s → 3 s at level 5), the same number as the client',async t=>{
  for(const level of [0,5]){
    const f=await fixture(t,[0,level,0,0]),engine=f.authority.engineFor(f.peer),before=Date.now();
    f.authority.skill(f.peer,1);
    const seconds=(engine.nextSkill[1]-before)/1000,client=skillCooldown(f.profile,1,BASE_SKILLS[1].cd,false);
    assert.equal(client,level?3:4);assert.ok(Math.abs(seconds-client)<.15,`${seconds} vs ${client}`);
  }
});

test('a level-5 ground slam reaches 5.9 m on the server and in the browser simulation alike',async t=>{
  const results=[];
  for(const level of [0,5]){
    const f=await fixture(t,[0,0,level,0]),enemy=f.spawn('mushroom',-30,1+5.6),engine=f.authority.engineFor(f.peer),hp=enemy.hp;
    engine.sim.skill(2);engine.sim.update(.43);
    // The browser: the same CombatSimulation with the client's host reading the same save.
    const dummy={id:'d',x:0,z:5.6,hp:1e6,radius:enemy.radius};let hits=0;
    const client=new CombatSimulation({position:()=>({x:0,z:0}),facing:()=>0,face:()=>{},targets:()=>[dummy],weapon:()=>({kind:'fist'}),stats:()=>({attack:10,critChance:0}),move:()=>{},effect:()=>{},hit:()=>{hits++;},skillLevel:i=>Game.skillLevel(f.profile,i)});
    client.skill(2);client.update(.43);
    results.push({level,server:enemy.hp<hp,client:hits>0});
  }
  assert.deepEqual(results,[{level:0,server:false,client:false},{level:5,server:true,client:true}]);
});
