import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {World} from '../src/world.ts';
import {newGame} from '../src/model.ts';
import {EnvironmentSimulation,createEnvironmentLayout} from '../src/environments.ts';

// Inside the safe zone nothing hurts the explorer, even a shot aimed at someone else (a neighbour fighting near the gate).
function world(damage:number[]) {
  const w=Object.assign(Object.create(World.prototype), {
    state:newGame(),scene:new T.Scene(),camera:new T.OrthographicCamera(-3,3,3,-3,.1,20),
    root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(),
    destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],
    particles:[],keys:new Set<string>(),facing:0,time:0,planet:'home',hazardTimer:0,
    marker:new T.Mesh(),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),
    onInteract(){},onAttackEnemy(){},onDamage(n:number){damage.push(n);},onZone(){},
  }) as World;
  w.environment=new EnvironmentSimulation(createEnvironmentLayout('home'));
  return w;
}
const shoot=(w:World,x:number,vx:number,targetId?:string)=>{
  const mesh=new T.Mesh(new T.SphereGeometry(.17),new T.MeshBasicMaterial());mesh.position.set(x,1,0);w.scene.add(mesh);
  ((w as unknown as {enemyShots:unknown[]}).enemyShots??=[]).push({id:'s',ownerId:'e',mesh,vx,vz:0,life:2,damage:9,targetId});
};
test('a shot aimed at a neighbour stops at the safe zone edge instead of hitting the explorer inside',()=>{
  const damage:number[]=[],w=world(damage);w.position.set(10,0,0);
  shoot(w,25,-13,'bot:1');for(let i=0;i<80;i++)w.update(.025,true,false);
  assert.deepEqual(damage,[],'no damage inside the safe zone');
});
test('outside the safe zone the same shot still hurts',()=>{
  const damage:number[]=[],w=world(damage);w.position.set(22,0,0);
  shoot(w,30,-13);for(let i=0;i<80;i++)w.update(.025,true,false);
  assert.ok(damage.length>=1,'hit in the common area');
});
