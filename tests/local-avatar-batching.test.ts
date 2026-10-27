import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { World } from '../src/world.ts';
import { newGame } from '../src/model.ts';
import { toonMaterial } from '../src/toon.ts';
test('local batching preserves transparent sorting, companions and per-player status materials',()=>{
 const w:any=Object.create(World.prototype),companion=new T.Group(),second=new T.Group();let petBuilds=0;
 const avatar=()=>{const root=new T.Group(),body=new T.Group();root.add(body);for(const color of ['#f4b59c','#4488ff'])body.add(new T.Mesh(new T.BoxGeometry(1,1,1),toonMaterial({color})));return root;};
 Object.assign(w,{state:newGame(),root:new T.Group(),player:new T.Group(),companion,companion2:second,disposeTree(){},avatar,petFor(){petBuilds++;return new T.Group();},pairShown:'main',playerStealth:false});
 const saved=JSON.stringify(w.state),count=()=>{let n=0;w.player.traverse((o:T.Object3D)=>{if((o as T.Mesh).isMesh)n++;});return n;};
 w.refreshPlayer(true);assert.equal(count(),1);assert.equal(w.player.userData.localBatchOpaque,true);
 const firstMaterial=w.playerMaterials[0];firstMaterial.emissive.set('#ff0000');
 w.playerStealth=true;w.refreshPlayer(true);assert.equal(count(),2,'stealth keeps independently sorted pieces');assert.equal(w.player.userData.localBatchOpaque,false);
 assert.ok(w.playerMaterials.every((m:T.MeshToonMaterial)=>m.emissive.getHex()===0),'a new player does not inherit another instance flash');
 w.playerStealth=false;w.refreshPlayer(true);assert.equal(count(),1);
 assert.equal(w.companion,companion);assert.equal(w.companion2,second);assert.equal(petBuilds,0);
 assert.equal(JSON.stringify(w.state),saved,'rendering does not change gameplay or saved equipment');
});
