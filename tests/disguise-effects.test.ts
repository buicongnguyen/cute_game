import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {CombatSimulation,DISGUISE_LOOKS,type CombatEffect,type CombatTarget} from '../src/combat.ts';
import {DISGUISE_INFO} from '../src/skill-info.ts';
import {DisguiseFx} from '../src/disguise-fx.ts';
import {disguiseForm} from '../src/disguise-form.ts';
import {makeSummon,animateSummon} from '../src/summon-art.ts';
import {CombatView} from '../src/combat-view.ts';

function arena(){const p={x:0,z:0},effects:CombatEffect[]=[],hits:string[]=[],statuses:Array<{id:string;kind:string}>=[],targets:CombatTarget[]=[{id:'near',x:0,z:2,hp:10000,maxHp:10000,radius:.5,facing:Math.PI/2},{id:'far',x:4,z:10,hp:10000,radius:.5}];let facing=0,healed=0;
 const sim=new CombatSimulation({position:()=>p,facing:()=>facing,face:a=>facing=a,targets:()=>targets,weapon:()=>({kind:'fist'}),stats:()=>({attack:10,critChance:0}),move:(x,z)=>{p.x+=x;p.z+=z;},moveTarget:(t,x,z)=>{t.x=x;t.z=z;},hit:(t,h)=>{hits.push(t.id);t.hp-=h.amount;return h.amount;},effect:e=>effects.push(e),status:(t,kind)=>statuses.push({id:t.id,kind}),heal:f=>healed+=f},()=>.5);
 return{sim,p,effects,hits,statuses,targets,get healed(){return healed;}};
}
for(const id of Object.keys(DISGUISE_INFO))for(let slot=0;slot<4;slot++)test(`${id} slot ${slot+1} completes, renders and resets`,()=>{
 const a=arena();assert.equal(a.sim.disguise(id,slot),true);for(let i=0;i<600;i++)a.sim.update(.025);
 assert.ok(a.effects.length||a.hits.length||a.healed>0||a.statuses.length,`${id} needs an observable result`);
 for(const e of a.effects)assert.ok(Number.isFinite(e.x)&&Number.isFinite(e.z)&&Number.isFinite(e.radius));
 a.sim.reset();assert.equal(a.sim.projectiles.length,0);assert.equal(a.sim.allies.length,0);assert.deepEqual(a.sim.statuses,{});
});
test('every new effect is bounded, renders finite transforms, expires and reuses six batches',()=>{
 const fx=new DisguiseFx({ground:()=>2,explorerAt:()=>null});
 for(const look of DISGUISE_LOOKS){assert.equal(fx.play({look,kind:'cast',x:2,z:3,radius:4,color:'#bbaaee',duration:2}),true);fx.update(.35);}
 assert.equal(fx.root.children.length,6);assert.ok(fx.busy);
 for(const child of fx.root.children){const b=child as T.InstancedMesh;assert.ok(b.count<=1024);for(const value of b.instanceMatrix.array.slice(0,b.count*16))assert.ok(Number.isFinite(value));}
 for(let i=0;i<200;i++)fx.play({look:'heal',kind:'cast',x:i,z:0,radius:4,color:'#ffffff',duration:8});assert.equal(fx.count,48);
 const geometries=fx.root.children.map(c=>(c as T.Mesh).geometry);fx.update(0);assert.equal(fx.count,48);fx.update(9);assert.equal(fx.count,0);assert.ok(fx.root.children.every(c=>!c.visible));fx.clear();assert.deepEqual(fx.root.children.map(c=>(c as T.Mesh).geometry),geometries);
});
test('hook draws to the original target, pulls only at impact and pauses/reset cancel the pull',()=>{
 const a=arena();a.targets[0].z=8;a.sim.disguise('dz_pirate',1);assert.equal(a.effects[0].look,'hook');assert.equal(a.effects[0].radius,8);assert.equal(a.targets[0].z,8);a.sim.update(10,false);assert.equal(a.targets[0].z,8);a.sim.update(.25);assert.equal(a.targets[0].z,1.8);
 const b=arena();b.sim.disguise('dz_pirate',1);b.sim.reset();b.sim.update(1);assert.equal(b.targets[0].z,2);
});
test('backstab uses enemy facing and turns toward its target',()=>{const a=arena();a.sim.disguise('dz_ninja',2);assert.ok(Math.abs(a.p.x+1.3)<1e-8);assert.ok(Math.abs(a.p.z-2)<1e-8);});
test('smoke refreshes enemies entering later and stops hiding the player outside',()=>{
 const a=arena();a.sim.disguise('dz_ninja',3);a.sim.update(.01);assert.ok(a.sim.statuses.stealth>0);assert.equal(a.effects[0].duration,5);a.p.x=20;a.targets[1].x=0;a.targets[1].z=3;a.sim.update(.7);assert.equal(a.sim.statuses.stealth,0);assert.ok(a.statuses.some(s=>s.id==='far'&&s.kind==='blind'));
});
test('missiles launch from current position, turn toward moving targets and do not chase dead targets',()=>{
 const a=arena();a.targets[0].z=12;a.sim.disguise('dz_mecha',2);a.p.x=3;a.sim.update(.16);assert.equal(a.sim.projectiles.length,2);const rocket=a.sim.projectiles[0];assert.ok(rocket.direction.x<0);a.targets.find(t=>t.id===rocket.homing)!.x=-5;const before=rocket.direction.x;a.sim.update(.025);assert.ok(rocket.direction.x<before);a.targets.forEach(t=>t.hp=0);const d={...rocket.direction};a.sim.update(.025);assert.deepEqual(rocket.direction,d);
});
test('snowball grows with its collision sphere, sits on ground and returns to a fixed pool key',()=>{
 const a=arena();a.targets.length=0;a.sim.disguise('dz_snowman',0);const ball=a.sim.projectiles[0],view=new CombatView(new T.Scene());a.sim.update(1);assert.ok(Math.abs(ball.radius-1.4)<1e-8);view.update(.1,a.sim.projectiles);const shot=(view as any).shots.get(ball.id) as T.Group;assert.equal(shot.position.y,ball.radius);assert.equal(shot.scale.x,ball.radius/.5);view.clear();a.sim.reset();a.sim.disguise('dz_snowman',0);view.update(.1,a.sim.projectiles);assert.equal((view as any).shots.get(a.sim.projectiles[0].id),shot);
});
test('bat and sheep forms replace the original silhouette and restore prior visibility',()=>{
 for(const kind of ['bat','sheep'] as const){const mesh=new T.Group(),body=new T.Group(),hidden=new T.Group();hidden.visible=false;mesh.add(body,hidden);disguiseForm(mesh,kind,true,0);assert.equal(body.visible,false);const form=mesh.getObjectByName('form-'+kind)!;assert.equal(form.visible,true);disguiseForm(mesh,kind,true,1);disguiseForm(mesh,kind,false,2);assert.equal(body.visible,true);assert.equal(hidden.visible,false);assert.equal(form.visible,false);}
});
test('summons reuse shared geometry and their bat wings animate',()=>{const a=makeSummon('bat'),b=makeSummon('bat');const ma:T.Mesh[]=[],mb:T.Mesh[]=[];a.traverse(o=>{if(o instanceof T.Mesh)ma.push(o);});b.traverse(o=>{if(o instanceof T.Mesh)mb.push(o);});assert.equal(ma[0].geometry,mb[0].geometry);assert.ok(ma.length<=3);animateSummon(a,'bat',.1);assert.notEqual(a.getObjectByName('wing1')!.rotation.z,0);});
