import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import * as M from '../src/model.ts';
import { FarmPenView } from '../src/farm-view.ts';

const now=1_000_000;
function farm(){const s=M.newGame();s.level=30;s.energy=100_000;s.farm.built=true;return s;}
const ray=(p:{x:number;z:number})=>new T.Raycaster(new T.Vector3(p.x,6,p.z),new T.Vector3(0,-1,0));

test('visible farm body and product instances preserve animal identity after roaming',()=>{
  const s=farm();for(const kind of ['chicken','duck','cow','pig','dog'] as const)assert.ok(M.buyAnimal(s,kind,now));
  const view=new FarmPenView();view.setArea({home:{x:0,z:0,rx:5,rz:5},radius:20,blocked:()=>false});
  for(let i=0;i<100;i++)view.update(s.farm.animals,.05,i*.05,now+600_000);
  for(const animal of s.farm.animals)assert.equal(view.pickAnimal(ray(view.positionOf(animal.uid)!)),animal.uid);
  // Reusing an earlier bound must not make a later moving instance unclickable.
  for(let i=100;i<700;i++)view.update(s.farm.animals,.05,i*.05,now+600_000);
  for(const animal of s.farm.animals)assert.equal(view.pickAnimal(ray(view.positionOf(animal.uid)!)),animal.uid);
  view.dispose();
});

test('meat pickups identify their expired animal; collection flights never become clickable animals',()=>{
  const s=farm(),animal=M.buyAnimal(s,'pig',now)!,view=new FarmPenView(),at=now+M.ANIMAL_LIFESPAN_MS;
  view.update(s.farm.animals,.1,1,at);const p=view.positionOf(animal.uid)!;
  assert.equal(view.pickAnimal(ray(p)),animal.uid);
  assert.equal(M.collectProducts(s,at,[animal.uid]).length,1);view.collect(animal.uid,'meat');view.update(s.farm.animals,.1,1.1,at);
  assert.equal(view.pickAnimal(ray(p)),null);view.dispose();
});

test('a meat collection acknowledgement can animate after its authoritative profile removed the walker',()=>{
  const s=farm(),animal=M.buyAnimal(s,'chicken',now)!,view=new FarmPenView(),at=now+M.ANIMAL_LIFESPAN_MS;
  view.update(s.farm.animals,.1,1,at);const origin=view.positionOf(animal.uid)!;
  M.collectProducts(s,at,[animal.uid]);view.update(s.farm.animals,.1,1.1,at);assert.equal(view.positionOf(animal.uid),null);
  view.collect(animal.uid,'meat',origin);view.update(s.farm.animals,.1,1.2,at);
  const marker=view.animals.getObjectByName('farm-product:meat') as T.InstancedMesh;
  assert.equal(marker.count,1);assert.equal(marker.visible,true);assert.ok([...marker.instanceMatrix.array].every(Number.isFinite));
  assert.equal(view.pickAnimal(ray(origin)),null);view.dispose();
});
