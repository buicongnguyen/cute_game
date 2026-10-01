import test from 'node:test';
import assert from 'node:assert/strict';
import {CombatSimulation,type CombatTarget,type CombatHost,type CombatHit} from '../src/combat.ts';
function arena(){
 const p={x:0,z:0},targets:CombatTarget[]=[],hits:CombatHit[]=[];let heals=0,moving=false;
 const host:CombatHost={position:()=>p,facing:()=>0,face(){},targets:()=>targets,weapon:()=>({kind:'fist'}),stats:()=>({attack:10,critChance:0}),move:(x,z)=>{p.x+=x;p.z+=z;},effect(){},moving:()=>moving,hit:(t,h)=>{hits.push(h);t.hp-=h.amount;},heal:n=>{heals+=n;}};
 const sim=new CombatSimulation(host,()=>.5),add=(hp=100,maxHp=100,boss=false)=>{const t={id:String(targets.length),x:0,z:2,hp,maxHp,boss,radius:.5};targets.push(t);return t;};
 return {p,host,sim,hits,add,targets,heals:()=>heals,move:()=>{moving=true;},run:(time:number,active=true)=>{for(let t=0;t<time-.0001;t+=.025)sim.update(Math.min(.025,time-t),active);}};
}
test('devour executes only strictly below 40% HP, never a boss, and heals after confirmed death',()=>{
 const low=arena();low.add(39);assert.equal(low.sim.disguise('dz_dino',0),true);assert.equal(low.targets[0].hp,-1);assert.equal(low.heals(),.25);
 for(const [hp,boss] of [[40,false],[39,true]] as const){const a=arena();a.add(hp,100,boss);a.sim.disguise('dz_dino',0);assert.equal(a.hits[0].amount,30);assert.equal(a.heals(),0);}
});
test('online devour delegates without speculative damage or healing',()=>{
 const a=arena(),target=a.add(30);let requested:unknown;a.host.execute=(t,f)=>{requested=[t,f];};a.sim.disguise('dz_dino',0);assert.deepEqual(requested,[target,.25]);assert.equal(target.hp,30);assert.equal(a.heals(),0);assert.equal(a.hits.length,0);
 a.sim.reset();delete a.host.execute;a.host.hit=()=>{};a.sim.disguise('dz_dino',0);assert.equal(a.heals(),0,'rejected local damage cannot heal');
});
test('tail uses 1.8x attack and a six-metre knockback impulse without stun or lift',()=>{
 const a=arena();a.add();a.sim.disguise('dz_dino',1);assert.equal(a.hits[0].amount,18);assert.equal(a.hits[0].knock,6);assert.equal(a.hits[0].stun,0);assert.equal(a.hits[0].lift,0);
});
test('giant provides scale and defense, stomps only while moving, and expires on active time',()=>{
 const a=arena();a.add(1e5,1e5);a.sim.disguise('dz_dino',3);assert.equal(a.sim.visualScale,2);assert.equal(a.sim.defenseBonus,20);
 a.run(1);assert.equal(a.hits.length,0);a.run(20,false);assert.equal(a.sim.defenseBonus,20);
 a.move();a.run(1);assert.equal(a.hits.length,3);assert.ok(a.hits.every(h=>h.amount===11&&h.knock===2));a.run(8.1);assert.equal(a.sim.visualScale,1);assert.equal(a.sim.defenseBonus,0);const n=a.hits.length;a.run(1);assert.equal(a.hits.length,n);
});
test('equipped combat pet fires a real travelling projectile, pauses and observes its cooldown',()=>{
 const a=arena();const target=a.add(1e5,1e5);target.z=5;a.host.pet=()=>({x:0,z:0,dmg:.6,cd:1,shot:'fire'});
 a.sim.update(.025);assert.equal(a.hits.length,0);assert.equal(a.sim.projectiles.length,1);a.run(5,false);assert.equal(a.sim.projectiles.length,1);
 a.run(.6);assert.equal(a.hits.length,1);assert.equal(a.hits[0].amount,6);a.run(.35);assert.equal(a.sim.projectiles.length,0);a.run(.1);assert.equal(a.sim.projectiles.length,1);
 a.sim.reset();a.host.pet=()=>null;a.run(1);assert.equal(a.hits.length,1);
});
