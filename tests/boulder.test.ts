import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {CombatSimulation,BOULDER,type CombatEffect,type CombatHit,type CombatTarget} from '../src/combat.ts';
import {BoulderFx} from '../src/boulder-fx.ts';
import {DISGUISE_INFO} from '../src/skill-info.ts';
import {setLanguage,t} from '../src/i18n.ts';

function arena(){const p={x:0,z:0},effects:CombatEffect[]=[],hits:CombatHit[]=[],targets:CombatTarget[]=[];const sim=new CombatSimulation({position:()=>p,facing:()=>0,face:()=>{},targets:()=>targets,weapon:()=>({kind:'fist'}),stats:()=>({attack:10,critChance:0}),move:()=>{},hit:(_target,hit)=>{hits.push(hit);},effect:e=>effects.push(e),clearShot:()=>false},()=>.5);return{p,effects,hits,targets,sim};}
test('superhero lobs at a fixed target point over obstacles and hits only at landing',()=>{
 const a=arena(),target={id:'a',x:6,z:8,hp:100,radius:.5};a.targets.push(target,{id:'b',x:8,z:8,hp:100,radius:.5});
 a.sim.disguise('dz_superhero',3);const cast=a.effects[0];assert.equal(cast.look,'boulder');assert.equal(cast.radius,10);assert.equal(cast.duration,.6);assert.equal(a.sim.projectiles.length,0);
 a.sim.update(.59);assert.equal(a.hits.length,0);a.sim.update(.01);assert.equal(a.hits.length,2);assert.ok(a.hits.every(h=>h.amount===32&&h.lift===7&&h.stun===0));
 assert.deepEqual([a.effects[1].x,a.effects[1].z,a.effects[1].radius],[6,8,4.5]);
});
test('empty throws land ahead; moving away avoids a previously targeted landing, and pauses/reset cancel time',()=>{
 const a=arena();a.sim.disguise('dz_superhero',3);a.sim.update(10,false);assert.equal(a.effects.length,1);a.p.x=20;a.sim.update(.6);assert.deepEqual([a.effects[1].x,a.effects[1].z],[0,8]);
 const b=arena(),enemy={id:'a',x:0,z:10,hp:100,radius:.5};b.targets.push(enemy);b.sim.disguise('dz_superhero',3);enemy.x=20;b.sim.update(.6);assert.equal(b.hits.length,0);assert.equal(b.effects[1].x,0);
 b.sim.disguise('dz_superhero',3);const count=b.effects.length;b.sim.reset();b.sim.update(1);assert.equal(b.effects.length,count);
});
test('boulder starts above an airborne hero, arcs above terrain and ends at the same landing point',()=>{
 const hero=new T.Group();hero.position.set(0,5,0);const fx=new BoulderFx({ground:()=>2,explorerAt:()=>hero});
 fx.throw({kind:'cast',look:'boulder',x:0,z:0,radius:8,facing:Math.PI/2,duration:.6,color:'#c96a3a'});
 const rock=fx.root.children[0];assert.equal(rock.position.y,8);fx.update(.3);assert.ok(Math.abs(rock.position.x-4)<1e-8);assert.equal(rock.position.y,9);assert.equal(rock.visible,true);
 fx.update(.3);assert.equal(rock.visible,false);assert.equal(fx.busy,false);assert.ok(Math.abs(rock.position.x-8)<1e-8);assert.ok(Math.abs(rock.position.y-2)<1e-8);
});
test('remote fallback respects terrain; pooled throws share one shaded geometry/material and reset cleanly',()=>{
 const fx=new BoulderFx({ground:()=>3,explorerAt:()=>null}),event:CombatEffect={kind:'cast',look:'boulder',x:2,z:4,radius:8,facing:0,duration:BOULDER.time,color:'#c96a3a'};
 for(let i=0;i<30;i++)fx.throw(event);assert.equal(fx.root.children.length,8);assert.equal(fx.root.children[0].position.y,6);
 const meshes:T.Mesh[]=[];fx.root.traverse(o=>{if(o instanceof T.Mesh)meshes.push(o);});assert.equal(meshes.length,8);assert.equal(new Set(meshes.map(m=>m.geometry)).size,1);assert.equal(new Set(meshes.map(m=>m.material)).size,1);
 assert.ok(meshes[0].geometry.getAttribute('color'));assert.ok(meshes[0].material instanceof T.MeshStandardMaterial);assert.ok(meshes[0].geometry.getAttribute('position').count<=120);
 fx.update(0);assert.equal(fx.busy,true);fx.clear();assert.equal(fx.busy,false);assert.ok(fx.root.children.every(o=>!o.visible));fx.throw(event);assert.equal(fx.root.children.length,8);
});
test('English and Vietnamese help describe the arcing landing hit',()=>{assert.match(DISGUISE_INFO.dz_superhero[3],/0.6 s.*3.2.*4.5 m/);try{setLanguage('vi');assert.match(t(DISGUISE_INFO.dz_superhero[3]),/0,6.*3,2.*4,5.*hất tung/);}finally{setLanguage('en');}});
