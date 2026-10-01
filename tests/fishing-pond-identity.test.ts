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

test('server mystery cooldown hides a stale shadow and expires independently of animation time',()=>{
  const pond:PondView={id:'home-pond',x:0,z:0,rx:4,rz:4,surface:0,waterId:'home'};
  let now=1000;
  const view=new FishingView(new T.Scene(),{ring(){}} as never,{ready:false} as never,()=>{},()=>now);
  view.populate([pond],()=>['fish_perch']);
  const internals=view as unknown as {fish:Array<{pond:PondView;mystery?:boolean;state:string;species:string;obj:T.Object3D}>;addMystery:(pond:PondView)=>void};
  internals.fish[0].mystery=true;const original=internals.fish.length;
  view.setMysteryAvailability(pond.id,60);assert.equal(internals.fish.length,original-1);
  view.populate([{...pond}],()=>['fish_perch']);let spawns=0;internals.addMystery=()=>{spawns++;};
  view.update(61,61,new T.Vector3(),new T.Vector3(1000,0,1000),null);assert.equal(spawns,0,'animation time cannot finish the server cooldown');
  now+=59;view.update(0,61,new T.Vector3(),new T.Vector3(1000,0,1000),null);assert.equal(spawns,0);
  now+=1;view.update(0,61,new T.Vector3(),new T.Vector3(1000,0,1000),null);assert.equal(spawns,1);
});

test('mystery cooldown elapses during suspended rendering and stays expired when the pond is rebuilt',()=>{
  const pond:PondView={id:'home-pond',x:0,z:0,rx:4,rz:4,surface:0,waterId:'home'};
  let now=1000;
  const view=new FishingView(new T.Scene(),{} as never,{ready:false} as never,()=>{},()=>now);
  view.populate([pond],()=>['fish_perch']);view.setMysteryAvailability(pond.id,60);
  view.populate([],()=>['fish_perch']);
  now+=120; // Space travel or a background tab: no FishingView.update calls.
  view.populate([{...pond}],()=>['fish_perch']);
  const internals=view as unknown as {addMystery:(pond:PondView)=>void};
  const spawned:string[]=[];internals.addMystery=p=>{spawned.push(p.id);};
  view.update(0,0,new T.Vector3(),new T.Vector3(1000,0,1000),null);
  assert.deepEqual(spawned,[pond.id]);
  view.update(0,0,new T.Vector3(),new T.Vector3(1000,0,1000),null);
  assert.equal(spawned.length,1,'resuming does not spawn duplicate mystery fish');
});

test('one pond cooldown does not remove a different pond mystery and account reset clears cached deadlines',()=>{
  const pond:PondView={id:'first',x:0,z:0,rx:4,rz:4,surface:0,waterId:'home'},second={...pond,id:'second',x:12};
  const now=1000;
  const view=new FishingView(new T.Scene(),{} as never,{ready:false} as never,()=>{},()=>now);view.populate([pond,second],()=>['fish_perch']);
  const internals=view as unknown as {fish:Array<{pond:PondView;mystery?:boolean}>;mysterySpawns:Array<{pond:PondView;at:number}>};
  const other=internals.fish.find(f=>f.pond.id===second.id)!;other.mystery=true;
  view.setMysteryAvailability(pond.id,60);assert.ok(internals.fish.includes(other));
  view.resetMysteryAvailability();view.populate([pond],()=>['fish_perch']);assert.ok(internals.mysterySpawns[0].at>now);assert.ok(internals.mysterySpawns[0].at<=now+20);
});
