import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {FishingView,type PondView} from '../src/fishing-view.ts';
import {FishHuntingView} from '../src/fish-hunting-view.ts';
import {huntingPonds,fishHuntTargets} from '../src/fish-hunting.ts';

// Regression: taking out the harpoon by a pond used to hide every rod-view fish (the mystery shadow too)
// and pop in a different set of fish; putting it away swapped them back.
test('switching to the harpoon by a pond keeps its fish species, count and the mystery fish',t=>{
  const now=1_800_000_000_000;t.mock.method(Date,'now',()=>now);
  const hunt=huntingPonds('home')[1],pond:PondView={...hunt},scene=new T.Scene(),world={},owner={};
  const fishing=new FishingView(scene,{ring(){}} as never,{ready:false} as never,()=>{},()=>0);
  fishing.populate([pond],()=>['fish_perch'],undefined,p=>fishHuntTargets(huntingPonds('home').find(h=>h.id===p.id)!,0).map(f=>f.id));
  type Fish={mystery?:boolean;species:string;obj:T.Object3D};
  const fish=(fishing as unknown as {fish:Fish[]}).fish,ordinary=()=>fish.filter(f=>!f.mystery);
  const mystery=fish.at(-1)!;mystery.mystery=true;// stands in for addMystery (which needs a canvas for its '?')
  const species=ordinary().map(f=>f.species),total=fish.length,near=new T.Vector3(pond.x,0,pond.z+pond.rx+1),far=new T.Vector3(pond.x+200,0,pond.z);
  fishing.update(.016,1,new T.Vector3(),near,null);
  assert.deepEqual(species,fishHuntTargets(hunt,now).slice(0,species.length).map(f=>f.id),'rod fish are stocked with the harpoon slot species');

  const hunting=new FishHuntingView(scene,fishing);
  const poses=fishing.ordinaryPoses(pond.id);
  hunting.update(0,hunt,undefined,false,world,owner);fishing.update(.016,1.016,new T.Vector3(),near,null);
  assert.equal(fish.length,total);assert.ok(fish.includes(mystery));
  assert.equal(mystery.obj.visible,true,'mystery fish stays visible with the harpoon out');
  assert.ok(ordinary().every(f=>!f.obj.visible),'the hunting view draws the ordinary fish');
  assert.deepEqual(hunting.targets.map(f=>f.id).slice(0,species.length),species,'same species, so the pond keeps its look');
  const huntFish=(hunting as unknown as {fish:Array<{obj:T.Object3D}>}).fish;
  poses.forEach((p,i)=>{assert.ok(Math.hypot(huntFish[i].obj.position.x-p.x,huntFish[i].obj.position.z-p.z)<1e-6,'handover starts where the fish were');});

  for(let i=0;i<60;i++)hunting.update(.016,hunt,undefined,false,world,owner);
  const left=huntFish.map(f=>({x:f.obj.position.x,z:f.obj.position.z}));
  hunting.update(0,null,undefined,false,world,owner);fishing.update(.016,2,new T.Vector3(),near,null);
  assert.equal(fish.length,total);assert.ok(fish.includes(mystery)&&mystery.obj.visible);
  assert.ok(ordinary().every(f=>f.obj.visible));assert.deepEqual(ordinary().map(f=>f.species),species);
  ordinary().forEach((f,i)=>assert.ok(Math.hypot(f.obj.position.x-left[i].x,f.obj.position.z-left[i].z)<.1,'fish are handed back in place'));
  fishing.update(.016,3,new T.Vector3(),far,null);assert.equal(fish.length,total);
});
