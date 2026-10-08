import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type { CombatAlly } from './combat.ts';

/** Tiny shared models. CombatView owns instances, never disposes their shared resources. */
const sphere=new T.IcosahedronGeometry(1,1),box=new T.BoxGeometry(1,1,1),cone=new T.ConeGeometry(1,1,6),tube=new T.CylinderGeometry(1,1,1,8);
const lowSphere=new T.IcosahedronGeometry(1,0),taper=new T.CylinderGeometry(.75,1,1,10);
const sparkMaterial=new T.MeshBasicMaterial({color:'#ffb02e'});
/** The lighthouse beam: a 12 m open cone from the lamp (combat.ts DZ.lighthouse.reach), glowing additive yellow. */
const beamGeometry=new T.ConeGeometry(3.2,12,20,1,true).rotateX(-Math.PI/2).translate(0,0,6).rotateX(.15);
const beamMaterial=new T.MeshBasicMaterial({color:'#fff2a0',transparent:true,opacity:.32,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}),beamMaterial2=new T.MeshBasicMaterial({color:'#fff8d0'});
/** Tesla turret: the white-hot orb, its blue glow and the little crackling arcs. */
const coreMaterial=new T.MeshBasicMaterial({color:'#f2fdff'}),haloMaterial=new T.MeshBasicMaterial({color:'#6fdcff',transparent:true,opacity:.45,depthWrite:false,blending:T.AdditiveBlending}),arcMaterial=new T.MeshBasicMaterial({color:'#bff4ff'});
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
    // The battle robot's tesla turret: a steel base on three feet, a coil column wound with copper rings and a glowing
    // electric orb on top that crackles while it fires shock bolts.
    add(tube,'#4a5868',0,.08,0,.7,.16,.7);for(let i=0;i<3;i++){const a=i*Math.PI*2/3;add(box,'#2c3440',Math.sin(a)*.62,.08,Math.cos(a)*.62,.22,.12,.36).rotation.y=a;}
    add(tube,'#8fa3b8',0,.55,0,.16,.8,.16);for(let i=0;i<4;i++)add(tube,i%2?'#d98a3a':'#f0a050',0,.3+i*.17,0,.3-i*.03,.07,.3-i*.03);
    add(tube,'#4a5868',0,1.0,0,.22,.08,.22);add(box,'#6ff2ff',0,.55,.17,.06,.5,.04);
    const core=new T.Mesh(sphere,coreMaterial);core.name='flash';core.scale.setScalar(.26);core.position.set(0,1.22,0);root.add(core);
    const halo=new T.Mesh(sphere,haloMaterial);halo.name='flash2';halo.scale.setScalar(.42);halo.position.set(0,1.22,0);root.add(halo);
    const spinner=new T.Group();spinner.name='spinner';spinner.position.set(0,1.22,0);root.add(spinner);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3,b=new T.Mesh(box,arcMaterial);b.scale.set(.03,.03,.5);b.position.set(Math.sin(a)*.38,Math.cos(a*2)*.08,Math.cos(a)*.38);b.rotation.y=a+.6;spinner.add(b);}
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
  }else if(kind==='parrot'){
    // Scout parrot: red body, yellow-and-blue wings on flapping pivots, a hooked beak and a long tail.
    add(sphere,'#e8352b',0,0,0,.26,.3,.34);add(sphere,'#ff5a4a',0,.3,.16,.2);add(cone,'#ffd84a',0,.27,.4,.07,.16,.07).rotation.x=Math.PI/2+.4;
    add(box,'#3c94e4',0,-.05,-.42,.14,.06,.42).rotation.x=.35;add(box,'#ffd84a',0,-.1,-.6,.1,.05,.24).rotation.x=.5;
    for(const side of [-1,1]){add(sphere,'#ffffff',side*.11,.36,.31,.055);add(sphere,'#1a1a22',side*.12,.36,.34,.03);const pivot=new T.Group();pivot.name='wing'+side;pivot.position.set(side*.2,.08,0);root.add(pivot);const wing=new T.Mesh(box,material(side<0?'#3c94e4':'#ffd84a'));wing.scale.set(.42,.05,.26);wing.position.x=side*.22;pivot.add(wing);}
  }else if(kind==='tree'){
    // Binding tree: a stout trunk, round leafy crowns with pink blossoms, and roots spreading on the ground.
    add(tube,'#8a5a34',0,.75,0,.28,1.5,.28);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const r=add(box,'#6f4527',Math.sin(a)*.45,.08,Math.cos(a)*.45,.14,.12,.7);r.rotation.y=a;}
    for(const [x,y,z,s] of [[0,1.9,0,.85],[.5,1.6,.2,.6],[-.45,1.65,-.15,.62],[.1,2.35,-.1,.55]])add(sphere,'#5fbf4a',x,y,z,s);
    for(let i=0;i<9;i++){const a=i*2.4,h=1.5+(i%3)*.35;add(sphere,i%2?'#ff9ec8':'#fff0f8',Math.sin(a)*.75,h,Math.cos(a)*.75,.1);}
  }else if(kind==='lighthouse'){
    // A little lighthouse: red-and-white striped tower, a glowing lamp room, and the beam (pointing +z; the ally's facing turns it).
    for(let i=0;i<4;i++)add(taper,i%2?'#ffffff':'#e0403a',0,.3+i*.5,0,.48-i*.06,.5,.48-i*.06);
    add(tube,'#2c3e5a',0,2.12,0,.36,.14,.36);add(sphere,'#fff4b0',0,2.42,0,.26);add(cone,'#e0403a',0,2.85,0,.36,.4,.36);add(tube,'#6b5a3c',0,.04,0,.75,.08,.75);
    const lamp=new T.Mesh(sphere,beamMaterial2);lamp.name='lamp';lamp.position.set(0,2.42,0);lamp.scale.setScalar(.34);root.add(lamp);
    const beam=new T.Mesh(beamGeometry,beamMaterial);beam.name='beam';beam.position.set(0,2.35,0);root.add(beam);
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
  if(kind==='turret'){const sp=model.getObjectByName('spinner');if(sp){sp.rotation.y=time*9;sp.visible=Math.sin(time*37)>-.3;}const f=model.getObjectByName('flash'),f2=model.getObjectByName('flash2');if(f)f.scale.setScalar(.24+.04*Math.sin(time*23));if(f2)f2.scale.setScalar(.4+.08*Math.abs(Math.sin(time*31)));}
  if(kind==='cannon'){const sp=model.getObjectByName('spark');if(sp)sp.scale.setScalar(.08+.08*Math.abs(Math.sin(time*22)));}
  if(kind==='bat')for(const side of [-1,1]){const wing=model.getObjectByName('wing'+side);if(wing)wing.rotation.z=side*Math.sin(time*18)*.6;}
  if(kind==='parrot'){for(const side of [-1,1]){const wing=model.getObjectByName('wing'+side);if(wing)wing.rotation.z=side*Math.sin(time*22)*.7;}model.position.y+=Math.sin(time*5)*.12;}
  if(kind==='lighthouse'){const lamp=model.getObjectByName('lamp');if(lamp)lamp.scale.setScalar(.32+.05*Math.sin(time*9));}
  if(kind==='tree')model.scale.setScalar(1+.03*Math.sin(time*3));
  if(kind==='clone')for(const side of [-1,1]){const leg=model.getObjectByName('leg'+side),arm=model.getObjectByName('arm'+side);if(leg)leg.rotation.x=side*Math.sin(time*10)*.35;if(arm)arm.rotation.x=-side*Math.sin(time*10)*.4;}
}
