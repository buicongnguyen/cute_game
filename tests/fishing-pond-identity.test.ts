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
