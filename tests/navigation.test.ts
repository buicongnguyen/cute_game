import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approach, blocked, clearSegment, findRoute } from '../src/navigation.ts';

test('approaching the outfitters avoids the neighboring market',()=>{
  const obstacles=[{x:8,z:-1,r:1.7},{x:12,z:-1,r:1.7}];
  const target=approach({x:4.9,z:-1},{x:12,z:-1},2,obstacles)!;
  assert.equal(blocked(target,obstacles),false);
  assert.ok(Math.hypot(target.x-12,target.z+1)<3.45);
  const route=findRoute({x:4.9,z:-1},target,obstacles);assert.ok(route.length>0);
  route.forEach(p=>assert.equal(blocked(p,obstacles),false));
});
test('walking from the garden to the woods routes around the cottage',()=>{
  const obstacles=[{x:0,z:-8,r:2.65},{x:-8,z:-10,r:1}];
  const route=findRoute({x:0,z:0},{x:0,z:-25},obstacles);
  assert.ok(route.some(p=>Math.abs(p.x)>3));route.forEach(p=>assert.equal(blocked(p,obstacles),false));assert.deepEqual(route.at(-1),{x:0,z:-25});
  let position={x:0,z:0};const remaining=[...route];
  for(let frame=0;frame<2000&&remaining.length;frame++){
    const dx=remaining[0].x-position.x,dz=remaining[0].z-position.z,d=Math.hypot(dx,dz);
    if(d<.27){remaining.shift();continue;}
    const x=position.x+dx/d*.08,z=position.z+dz/d*.08;
    if(!blocked({x,z:position.z},obstacles))position.x=x;
    if(!blocked({x:position.x,z},obstacles))position.z=z;
  }
  assert.equal(remaining.length,0);assert.ok(Math.hypot(position.x,position.z+25)<.3);
});
test('pond interaction stops on dry land',()=>{
  const obstacles=[{x:19,z:8,r:4.6}],target=approach({x:0,z:0},{x:19,z:8},5.6,obstacles)!;
  assert.equal(blocked(target,obstacles),false);assert.ok(Math.hypot(target.x-19,target.z-8)<7.05);
});

test('final fractional route segment cannot cut through a tree',()=>{
  const start={x:23.364043668843806,z:-23.966000208165497};
  const target={x:-25.25037911720574,z:43.94605067325756};
  const obstacles=[{x:-24.75990803539753,z:42.99104031175375,r:.6248574953433127}];
  const route=findRoute(start,target,obstacles);
  assert.ok(route.length>0);
  let previous=start;
  for(const point of route){assert.equal(clearSegment(previous,point,obstacles),true);previous=point;}
  assert.deepEqual(route.at(-1),target);
});

test('routing starts at the real position when the rounded grid cell is blocked',()=>{
  const start={x:-.49,z:-.49},target={x:3,z:3},obstacles=[{x:.25,z:.25,r:.64}];
  assert.equal(blocked(start,obstacles),false);
  assert.equal(blocked({x:0,z:0},obstacles),true);
  const route=findRoute(start,target,obstacles);assert.ok(route.length>0);
  let previous=start;
  for(const point of route){assert.equal(clearSegment(previous,point,obstacles),true);previous=point;}
});

test('segment collision catches obstacles missed by endpoint and midpoint samples',()=>{
  const obstacles=[{x:.3,z:.3,r:.01}];
  assert.equal(blocked({x:0,z:0},obstacles),false);
  assert.equal(blocked({x:1.5,z:1.5},obstacles),false);
  assert.equal(blocked({x:3,z:3},obstacles),false);
  assert.equal(clearSegment({x:0,z:0},{x:3,z:3},obstacles),false);
});

test('blocked and outside-world destinations never become route waypoints',()=>{
  assert.deepEqual(findRoute({x:0,z:0},{x:2,z:2},[{x:2,z:2,r:1}]),[]);
  assert.deepEqual(findRoute({x:0,z:0},{x:50,z:0},[]),[]);
});
