import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {FishingView,type PondView} from '../src/fishing-view.ts';
test('a cast accepts a fresh pond descriptor and attracts the existing mystery swimmer by pond ID',()=>{
  const pond:PondView={id:'home-pond',x:0,z:0,rx:4,rz:4,surface:0,waterId:'home'};
  const view=new FishingView(new T.Scene(),{} as never,{ready:false} as never,()=>{});
  view.populate([pond],()=>['fish_perch']);
  const internals=view as unknown as {fish:Array<{pond:PondView;mystery?:boolean;state:string;species:string;obj:T.Object3D}>};
  const fish=internals.fish[0];fish.mystery=true;fish.obj.position.set(1,0,1);
  view.begin({...pond},new T.Vector3(0,1,5),{x:1,z:1});
  assert.equal(view.pond,pond);assert.equal(view.mysteryNearCast(),'fish_perch');
  const count=internals.fish.length;view.approachDistance('fish_perch',true);assert.equal(internals.fish.length,count);assert.equal(fish.state,'approach');
});

test('no mystery shadow appears on a timer: ponds stay without one however long time runs',()=>{
  const pond:PondView={id:'home-pond',x:0,z:0,rx:4,rz:4,surface:0,waterId:'home'};
  let now=1000;
  const view=new FishingView(new T.Scene(),{ring(){}} as never,{ready:false} as never,()=>{},()=>now);
  view.populate([pond],()=>['fish_perch']);
  for(let i=0;i<50;i++){now+=60;view.update(1,i,new T.Vector3(),new T.Vector3(0,0,0),null);}
  assert.equal(view.mysteryIn(pond.id),null);
});

test('a called mystery rises at its spot, hovers there between tries and only its pond loses it on drop',()=>{
  // The ? mark is drawn on a canvas: a do-nothing 2D context stands in for the browser's.
  const g=globalThis as Record<string,unknown>,before=g.document;const ctx2d=new Proxy({},{get:()=>()=>{}});
  g.document={createElement:()=>({width:0,height:0,getContext:()=>ctx2d})};
  try{
  const pond:PondView={id:'first',x:0,z:0,rx:4,rz:4,surface:0,waterId:'home'},second={...pond,id:'second',x:12};
  const view=new FishingView(new T.Scene(),{ring(){}} as never,{ready:false} as never,()=>{});view.populate([pond,second],()=>['fish_perch']);
  const internals=view as unknown as {fish:Array<{pond:PondView;mystery?:boolean;state:string;obj:T.Object3D;home?:{x:number;z:number}}>};
  view.callMystery(pond.id,{x:2,z:1});view.callMystery(second.id,{x:13,z:0});
  const shadow=internals.fish.find(f=>f.mystery&&f.pond.id===pond.id)!;
  assert.ok(shadow);assert.equal(shadow.obj.position.x,2);assert.equal(shadow.obj.position.z,1);assert.deepEqual(shadow.home,{x:2,z:1});
  const count=internals.fish.length;view.callMystery(pond.id,{x:1,z:2});assert.equal(internals.fish.length,count,'a second call keeps one shadow');
  view.begin(pond,new T.Vector3(0,1,5),{x:0,z:0});
  assert.equal(view.mysteryIn(pond.id),'fish_perch');view.approachDistance('fish_perch',true);assert.equal(shadow.state,'approach','the called shadow is the fish that comes');
  view.cancel();assert.equal(shadow.state,'flee');
  for(let i=0;i<120;i++)view.update(.05,i*.05,new T.Vector3(),new T.Vector3(0,0,0),null);
  assert.equal(shadow.state,'swim');assert.ok(Math.hypot(shadow.obj.position.x-1,shadow.obj.position.z-2)<1.6,'it hovers near its spot for the next try');
  view.dropMystery(pond.id);assert.equal(view.mysteryIn(pond.id),null);assert.equal(view.mysteryIn(second.id),'fish_perch');
  view.dropMystery();assert.equal(view.mysteryIn(second.id),null);
  }finally{g.document=before;}
});
