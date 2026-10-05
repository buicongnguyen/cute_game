import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type { CombatAlly } from './combat.ts';

/** Tiny shared models. CombatView owns instances, never disposes their shared resources. */
const sphere=new T.IcosahedronGeometry(1,1),box=new T.BoxGeometry(1,1,1),cone=new T.ConeGeometry(1,1,6),tube=new T.CylinderGeometry(1,1,1,8);
const mats=new Map<string,T.MeshStandardMaterial>();
const templates=new Map<string,T.Group>();
const mergedMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.85,flatShading:true});
function material(color:string){let m=mats.get(color);if(!m)mats.set(color,m=new T.MeshStandardMaterial({color,roughness:.85,flatShading:true}));return m;}
export function makeSummon(kind:CombatAlly['kind']|'sheep'){
  const cached=templates.get(kind);if(cached)return cached.clone(true);
  const root=new T.Group();root.name='summon-'+kind;
  const add=(geo:T.BufferGeometry,color:string,x:number,y:number,z:number,sx:number,sy=sx,sz=sx)=>{const m=new T.Mesh(geo,material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);root.add(m);return m;};
  if(kind==='clone'){
    add(box,'#474064',0,.85,0,.5,.7,.35);add(sphere,'#51466d',0,1.48,0,.32);add(box,'#ddb8a0',0,1.48,.28,.46,.13,.07);
    for(const side of [-1,1]){add(box,'#342f48',side*.16,.26,0,.18,.5,.22).name='leg'+side;add(box,'#70618d',side*.36,.85,0,.18,.6,.2).name='arm'+side;add(sphere,'#181629',side*.12,1.5,.33,.04);}
    add(box,'#bb6689',0,1.15,0,.55,.12,.4);add(box,'#bba7d6',.35,1.1,-.2,.08,1.2,.08).rotation.z=-.5;
  }else if(kind==='turret'||kind==='cannon'){
    const cannon=kind==='cannon';add(box,cannon?'#8d5936':'#486170',0,.35,0,1.1,.45,.9);
    for(const side of [-1,1]){const wheel=add(tube,'#303849',side*.65,.3,0,.3,.18,.3);wheel.rotation.z=Math.PI/2;}
    add(sphere,cannon?'#46495b':'#8dcbd2',0,.85,0,.48,.35,.45);
    const barrel=add(tube,'#384657',0,.9,.55,.18,1.25,.18);barrel.rotation.x=Math.PI/2;
    add(box,cannon?'#ffc36c':'#77efff',0,1.16,.15,.22,.08,.25);
  }else if(kind==='bat'){
    add(sphere,'#583963',0,.65,0,.2,.3,.2);add(sphere,'#795182',0,.93,.04,.19);
    for(const side of [-1,1]){add(cone,'#795182',side*.12,1.13,.02,.1,.27,.08);const pivot=new T.Group();pivot.name='wing'+side;pivot.position.set(side*.12,.75,0);root.add(pivot);const wing=new T.Mesh(cone,material('#6c4780'));wing.scale.set(.35,.65,.06);wing.rotation.z=-side*Math.PI/2;wing.position.x=side*.3;pivot.add(wing);add(sphere,'#ffbfa3',side*.07,.96,.2,.035);}
  }else if(kind==='sheep'){
    add(sphere,'#f6f0dc',0,.55,0,.65,.43,.45);add(sphere,'#b7a698',0,.62,.49,.23,.26,.24);
    for(const side of [-1,1]){add(sphere,'#e9dbc5',side*.25,.75,.43,.19,.09,.09);for(const z of [-.26,.24])add(box,'#776959',side*.32,.17,z,.12,.3,.12);add(sphere,'#342f34',side*.12,.69,.67,.045);}
  }else{
    add(sphere,'#e5f5ff',0,.48,0,.55);add(sphere,'#faffff',0,1.12,0,.38);add(box,'#da655b',0,.85,0,.72,.13,.65);add(box,'#da655b',.24,.63,.4,.16,.5,.09);
    const nose=add(cone,'#f5a24b',0,1.12,.43,.09,.32,.09);nose.rotation.x=Math.PI/2;
    for(const side of [-1,1]){add(sphere,'#343c50',side*.13,1.23,.32,.05);add(box,'#856040',side*.7,.7,0,.5,.06,.06).rotation.z=side*.4;}
    add(tube,'#344b70',0,1.47,0,.43,.08,.43);add(tube,'#344b70',0,1.64,0,.27,.3,.27);
  }
  // Merge the rigid coloured parts once. Only limbs/wing pivots need separate draws.
  const pieces:T.BufferGeometry[]=[];
  for(const child of [...root.children])if(child instanceof T.Mesh&&!child.name){child.updateMatrix();const g=(child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone()).applyMatrix4(child.matrix),colors=new Float32Array(g.getAttribute('position').count*3),color=(child.material as T.MeshStandardMaterial).color;for(let i=0;i<colors.length;i+=3)color.toArray(colors,i);g.setAttribute('color',new T.BufferAttribute(colors,3));pieces.push(g);root.remove(child);}
  if(pieces.length){root.add(new T.Mesh(mergeGeometries(pieces),mergedMaterial));for(const g of pieces)g.dispose();}
  templates.set(kind,root);return root.clone(true);
}
export function animateSummon(model:T.Group,kind:string,time:number){
  if(kind==='bat')for(const side of [-1,1]){const wing=model.getObjectByName('wing'+side);if(wing)wing.rotation.z=side*Math.sin(time*18)*.6;}
  if(kind==='clone')for(const side of [-1,1]){const leg=model.getObjectByName('leg'+side),arm=model.getObjectByName('arm'+side);if(leg)leg.rotation.x=side*Math.sin(time*10)*.35;if(arm)arm.rotation.x=-side*Math.sin(time*10)*.4;}
}
