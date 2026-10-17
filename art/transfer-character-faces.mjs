/** Transfer only facial details from the sibling boat edition; preserve every body, pivot and outfit fit.
 * node --experimental-strip-types art/transfer-character-faces.mjs [reference-models-directory]
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createGltfLoader} from '../src/assets.ts';
import {compressGlb,readGlb,writeGlb} from './compress-models.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const models=path.join(repo,'public/assets/models');
const reference=path.resolve(process.argv[2]??path.join(repo,'../cute_game_boat/public/assets/models'));
const FACE=new Set(['Hero eye','Hero pants','Hero blush']);
globalThis.FileReader??=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}};
const loader=createGltfLoader();
const load=async bytes=>(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
const skin=head=>head.children.find(o=>o.isMesh&&o.material.name==='Hero skin');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=fs.readdirSync(models).filter(n=>/^hero(?:-(?:girl|man|woman))?(?:-(?:tiny|teen|tall|grown))?\.glb$/.test(n));
for(const name of files){
 const targetPath=path.join(models,name),sourceBytes=fs.readFileSync(path.join(reference,name)),targetBytes=fs.readFileSync(targetPath);
 const {json,bin}=readGlb(targetBytes),hero=json.nodes.find(n=>n.name==='hero'),stamp=hash(sourceBytes);
 if(hero.extras?.faceTransfer?.sourceHash===stamp){console.log(name+': already transferred');continue;}
 const [target,source]=await Promise.all([load(targetBytes),load(sourceBytes)]),to=target.getObjectByName('head'),from=source.getObjectByName('head');
 const ts=skin(to),ss=skin(from);if(!ts||!ss)throw Error(name+': missing head skin');
 ts.geometry.computeBoundingBox();ss.geometry.computeBoundingBox();
 // Both editions author the sphere about the same local pivot. Ignore the boat's short-body root scales.
 const scale=ts.geometry.boundingBox.max.x/ss.geometry.boundingBox.max.x;
 const face=new T.Scene();
 for(const material of FACE){
  const m=from.children.find(o=>o.isMesh&&o.material.name===material);
  if(!m)throw Error(name+': missing '+material);
  const copy=new T.Mesh(m.geometry.clone().scale(scale,scale,scale),m.material.clone());copy.name=material;face.add(copy);
 }
 const exported=await new GLTFExporter().parseAsync(face,{binary:true});
 const {json:extra,bin:extraBin}=readGlb(await compressGlb(Buffer.from(exported)));
 const offset=(bin.length+3)&~3,append=Buffer.alloc(offset+extraBin.length);bin.copy(append);extraBin.copy(append,offset);
 const accessorBase=json.accessors.length,viewBase=json.bufferViews.length,materialBase=json.materials.length;
 // Keep the original compressed streams byte-for-byte. Append only the three small facial meshes.
 const fallback=json.buffers[1]?.byteLength??0;
 if(extra.buffers.length>2||extra.buffers[0].uri)throw Error('Unexpected face buffer layout');
 for(const view of extra.bufferViews){
  view.byteOffset=(view.byteOffset??0)+(view.buffer===0?offset:fallback);
  const compression=view.extensions?.EXT_meshopt_compression;
  if(compression){if(compression.buffer!==0)throw Error('Unexpected compressed buffer');compression.byteOffset+=offset;}
  json.bufferViews.push(view);
 }
 for(const accessor of extra.accessors){accessor.bufferView+=viewBase;json.accessors.push(accessor);}
 json.materials.push(...extra.materials);
 const fresh=new Map(extra.meshes.flatMap(mesh=>mesh.primitives).map(primitive=>{
  const material=extra.materials[primitive.material].name;
  for(const semantic of Object.keys(primitive.attributes))primitive.attributes[semantic]+=accessorBase;
  if(primitive.indices!==undefined)primitive.indices+=accessorBase;
  primitive.material+=materialBase;return [material,primitive];
 }));
 const head=json.nodes.find(n=>n.name==='head');if(head.mesh===undefined)throw Error(name+': expected a merged head');
 let changed=0;
 json.meshes[head.mesh].primitives=json.meshes[head.mesh].primitives.map(primitive=>{
  const material=json.materials[primitive.material].name;
  if(!FACE.has(material))return primitive;
  const replacement=fresh.get(material);if(!replacement)throw Error(name+': missing replacement');changed++;return replacement;
 });
 if(changed!==3)throw Error(name+': expected exactly three facial primitives');
 json.buffers[0].byteLength=append.length;
 if(extra.buffers[1]){json.buffers[1]??={byteLength:0};json.buffers[1].byteLength=fallback+extra.buffers[1].byteLength;}
 for(const key of ['extensionsUsed','extensionsRequired'])json[key]=[...new Set([...(json[key]??[]),...(extra[key]??[])])];
 hero.extras??={};hero.extras.faceTransfer={source:'cute_game_boat',sourceHash:stamp,version:1,scale};
 const result=writeGlb(json,append);
 // Load with the real game decoder before replacing the asset.
 const check=await load(result);if(!check.getObjectByName('head'))throw Error(name+': invalid transfer');
 fs.writeFileSync(targetPath,result);console.log(name+': transferred eyes, highlights, cheeks and smile');
}
