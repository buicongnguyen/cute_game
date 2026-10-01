import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KitLibrary} from '../src/assets.ts';
import {TITANS} from '../src/titan-content.ts';
test('the Blender export loads all nine Titans, pets and wearable trophies through the runtime asset library',async()=>{
 const bytes=await readFile(new URL('../public/assets/models/titans.glb',import.meta.url));assert.ok(bytes.length<2_500_000);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const kit=new KitLibrary(['titans.glb'],async()=>gltf.scene);await kit.load();assert.equal(kit.ready,true);
 for(const[id,definition]of Object.entries(TITANS)){
  const key=id.replace('titan_',''),boss=kit.instance(id),pet=kit.instance('pet_t_'+key),hat=kit.instance('hat_t_'+key);assert.ok(boss&&pet&&hat,id);
  const box=new T.Box3().setFromObject(boss),size=box.getSize(new T.Vector3());assert.ok(Math.abs(box.min.y)<1e-5);assert.ok(Math.abs(size.y*definition.scale-definition.height)<.002,id);assert.ok(Math.abs(Math.max(size.x,size.z)*definition.scale-2*definition.radius)<.002,id);
  let triangles=0;boss.traverse(node=>{if(node instanceof T.Mesh){triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;assert.ok(Number.isFinite(node.geometry.attributes.position.array[0]));}});assert.ok(triangles<6500&&triangles>200,id);
  const petBox=new T.Box3().setFromObject(pet);assert.ok(petBox.max.y<.71);assert.ok(petBox.min.y>=-1e-5);
  const hatBox=new T.Box3().setFromObject(hat);assert.ok(hatBox.min.y>=2.029&&hatBox.max.y<2.481,id);let head=false;hat.traverse(n=>{if(n.userData.tag==='head')head=true;});assert.equal(head,true,id);
 }
});
