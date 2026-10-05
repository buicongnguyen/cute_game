import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World} from '../src/world.ts';
import * as M from '../src/model.ts';
import {superheroFlightPose,clearSuperheroFlightPose} from '../src/flight-pose.ts';
function avatar(){const m=new T.Group(),body=new T.Group();m.add(body);for(const name of ['arm-left','arm-right','leg-left','leg-right','head']){const p=new T.Group();p.name=name;body.add(p);}return m;}
test('flight leans along the facing in every direction with both arms ahead and no marching legs',()=>{
 for(const facing of [0,Math.PI/2,Math.PI,-Math.PI/2]){const m=avatar();m.rotation.y=facing;superheroFlightPose(m,true);const up=new T.Vector3(0,1,0).applyQuaternion(m.quaternion);assert.ok(up.x*Math.sin(facing)+up.z*Math.cos(facing)>.9);assert.equal(m.getObjectByName('leg-left')!.rotation.x,m.getObjectByName('leg-right')!.rotation.x);assert.ok(m.getObjectByName('arm-right')!.rotation.x<-2.8);clearSuperheroFlightPose(m);assert.equal(m.rotation.x,0);assert.equal(m.rotation.y,facing);assert.equal(m.rotation.order,'XYZ');}
});
test('actual local animation holds flight limbs still, hovers without steps and restores walking on landing',()=>{
 const w=Object.create(World.prototype) as World;Object.assign(w,{state:M.newGame(),player:avatar(),playerFlying:true,moving:true,weaponKind:'fist',time:0,facing:1,walkClock:0});w.state.gear.disguise='dz_superhero';
 const tick=()=>{w.player.position.set(0,1.7,0);w.player.scale.setScalar(1);(w as any).animatePlayer(.1);};tick();const leg=w.player.getObjectByName('leg-left')!;const angle=leg.rotation.x;tick();assert.equal(leg.rotation.x,angle);assert.equal(w.player.position.y,1.7);assert.equal(w.player.rotation.x,1.2);
 w.moving=false;tick();assert.equal(w.player.rotation.x,.18);assert.equal(leg.rotation.x,angle);w.playerFlying=false;w.moving=true;tick();assert.equal(w.player.rotation.order,'XYZ');assert.equal(w.player.rotation.x,.1);const walking=leg.rotation.x;tick();assert.notEqual(leg.rotation.x,walking);
});
test('remote superhero flight removes walk bob and landing clears the flight pose',()=>{
 const w=Object.create(World.prototype) as World,m=avatar(),pose={x:0,z:0,moving:true,gear:{disguise:'dz_superhero'},visual:{flight:1.7}};
 Object.assign(w,{remotePlayers:new Map([['p',{mesh:m,pose}]]),planet:'home'});(w as any).animateRemotes(.1);assert.equal(m.rotation.x,1.2);assert.equal(m.children[0].position.y,0);assert.equal(m.getObjectByName('arm-left')!.rotation.x,-2.95);
 pose.visual.flight=0;(w as any).animateRemotes(.1);assert.equal(m.rotation.x,0);assert.equal(m.rotation.order,'XYZ');assert.notEqual(m.getObjectByName('arm-left')!.rotation.x,-2.95);
});
