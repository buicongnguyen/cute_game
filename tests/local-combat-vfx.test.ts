import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { World } from '../src/world.ts';
import { WeaponTrail } from '../src/weapon-trail.ts';

test('Auto particle reduction preserves the local slash lifetime and punch wind detail',()=>{
 const results=[];
 for(const density of [1,.75,.45]){
  const w:any=Object.create(World.prototype),trail=new WeaponTrail(),scene=new T.Scene();
  Object.assign(w,{scene,player:new T.Group(),camera:new T.PerspectiveCamera(),bladeTrail:trail,trailClock:.12,trailTint:[1,1,1],fx:{density}});
  for(let i=0;i<4;i++)trail.samples.push(i*.1,1,0,i*.1,2,0,i*.005);
  trail.wind.add(0,1,0,0,0,1,.1,1,1,1,1,.4,false);
  w.updateTrail(scene);
  assert.ok(trail.samples.count>1,'slash keeps its full lifetime');
  assert.equal(trail.mesh.visible,true);
  results.push({sections:trail.sections,positions:Array.from(trail.mesh.geometry.getAttribute('position').array),tints:Array.from(trail.mesh.geometry.getAttribute('tint').array)});
 }
 assert.deepEqual(results[1],results[0]);assert.deepEqual(results[2],results[0]);
});
