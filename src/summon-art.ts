import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type { CombatAlly } from './combat.ts';

/** Tiny shared models. CombatView owns instances, never disposes their shared resources. */
const sphere=new T.IcosahedronGeometry(1,1),box=new T.BoxGeometry(1,1,1),cone=new T.ConeGeometry(1,1,6),tube=new T.CylinderGeometry(1,1,1,8);
const lowSphere=new T.IcosahedronGeometry(1,0),taper=new T.CylinderGeometry(.75,1,1,10);
const flashMaterial=new T.MeshBasicMaterial({color:'#ffd35a',transparent:true,opacity:.95,depthWrite:false}),flashMaterial2=new T.MeshBasicMaterial({color:'#fff4c0',transparent:true,opacity:.95,depthWrite:false}),sparkMaterial=new T.MeshBasicMaterial({color:'#ffb02e'});
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
  }else if(kind==='turret'){
    // Sentry nest: a ring of sandbags, a tripod machine gun with an ammo box, a spinning barrel cluster and a brass muzzle flash.
    for(let i=0;i<9;i++){const a=-Math.PI*.95+i*Math.PI*1.9/8,x=Math.sin(a)*.95,z=-Math.cos(a)*.95;add(lowSphere,i%2?'#d2b27a':'#c29e62',x,.2,z,.34,.2,.26).rotation.y=-a;if(i%2===0)add(lowSphere,'#cfae72',x*.9,.46,z*.9,.3,.18,.24).rotation.y=-a;}
    add(box,'#6b5a3c',0,.06,0,1.5,.05,1.5);
    for(const side of [-1,1]){const leg=add(box,'#3a3f47',side*.22,.35,-.05,.06,.7,.06);leg.rotation.z=side*.35;}
    add(box,'#3a3f47',0,.35,-.3,.06,.7,.06).rotation.x=.4;
    add(box,'#4d5a3a',0,.78,-.05,.4,.26,.62);add(box,'#2c3138',0,.95,-.05,.14,.1,.4);
    add(box,'#5b6a45',.4,.2,.18,.3,.22,.3);add(box,'#e3b341',.4,.33,.18,.22,.04,.2);
    add(box,'#e3b341',.22,.7,.1,.06,.28,.1);
    const spinner=new T.Group();spinner.name='spinner';spinner.position.set(0,.8,.32);root.add(spinner);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3,b=new T.Mesh(tube,material('#202630'));b.scale.set(.05,.9,.05);b.rotation.x=Math.PI/2;b.position.set(Math.cos(a)*.1,Math.sin(a)*.1,.45);spinner.add(b);}
    const shroud=new T.Mesh(tube,material('#3a424e'));shroud.scale.set(.14,.35,.14);shroud.rotation.x=Math.PI/2;shroud.position.set(0,.8,.42);shroud.name='shroud';root.add(shroud);
    const flash=new T.Mesh(cone,flashMaterial);flash.name='flash';flash.scale.set(.2,.55,.2);flash.rotation.x=Math.PI/2;flash.position.set(0,.8,1.1);root.add(flash);
    const flash2=new T.Mesh(cone,flashMaterial2);flash2.name='flash2';flash2.scale.set(.1,.8,.1);flash2.rotation.x=Math.PI/2;flash2.position.set(0,.8,1.2);root.add(flash2);
  }else if(kind==='cannon'){
    // Pirate cannon: tapered iron barrel with a flared muzzle on a wooden carriage, spoked wheels, a ball pile and a fuse spark.
    add(box,'#8a5a32',0,.34,-.05,.8,.18,1.1);
    for(const side of [-1,1]){add(box,'#6e4526',side*.36,.5,-.05,.08,.34,1.0);const wheel=add(tube,'#6b4423',side*.62,.36,0,.36,.1,.36);wheel.rotation.z=Math.PI/2;const hub=add(tube,'#c8a24a',side*.7,.36,0,.12,.06,.12);hub.rotation.z=Math.PI/2;}
    const barrel=new T.Mesh(taper,material('#2d323d'));barrel.scale.set(.34,1.5,.34);barrel.rotation.x=Math.PI/2-.2;barrel.position.set(0,.72,.2);barrel.name='barrel';root.add(barrel);
    add(tube,'#c8a24a',0,.78,.88,.31,.1,.31).rotation.x=Math.PI/2-.2;add(tube,'#c8a24a',0,.7,-.15,.34,.08,.34).rotation.x=Math.PI/2-.2;
    add(sphere,'#2d323d',0,.78,-.58,.2);
    for(const [x,z,y] of [[-.9,.5,.16],[-.68,.62,.16],[-.8,.56,.38]])add(lowSphere,'#1d2028',x,y,z,.17);
    const spark=new T.Mesh(lowSphere,sparkMaterial);spark.name='spark';spark.scale.setScalar(.12);spark.position.set(0,1.0,-.62);root.add(spark);
  }else if(kind==='bat'){
    add(sphere,'#583963',0,.65,0,.2,.3,.2);add(sphere,'#795182',0,.93,.04,.19);
    for(const side of [-1,1]){add(cone,'#fffdf0',side*.05,.84,.2,.03,.1,.03).rotation.x=Math.PI;add(cone,'#795182',side*.12,1.13,.02,.1,.27,.08);const pivot=new T.Group();pivot.name='wing'+side;pivot.position.set(side*.12,.75,0);root.add(pivot);const wing=new T.Mesh(cone,material('#6c4780'));wing.scale.set(.35,.65,.06);wing.rotation.z=-side*Math.PI/2;wing.position.x=side*.3;pivot.add(wing);add(sphere,'#ffbfa3',side*.07,.96,.2,.035);}
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
  if(kind==='turret'){const sp=model.getObjectByName('spinner');if(sp)sp.rotation.z=time*28;const f=model.getObjectByName('flash'),f2=model.getObjectByName('flash2'),on=Math.sin(time*47)>-.2;if(f){f.visible=on;f.scale.set(.2,.35+.3*Math.abs(Math.sin(time*60)),.2);}if(f2)f2.visible=on&&Math.sin(time*31)>0;}
  if(kind==='cannon'){const sp=model.getObjectByName('spark');if(sp)sp.scale.setScalar(.08+.08*Math.abs(Math.sin(time*22)));}
  if(kind==='bat')for(const side of [-1,1]){const wing=model.getObjectByName('wing'+side);if(wing)wing.rotation.z=side*Math.sin(time*18)*.6;}
  if(kind==='clone')for(const side of [-1,1]){const leg=model.getObjectByName('leg'+side),arm=model.getObjectByName('arm'+side);if(leg)leg.rotation.x=side*Math.sin(time*10)*.35;if(arm)arm.rotation.x=-side*Math.sin(time*10)*.4;}
}
