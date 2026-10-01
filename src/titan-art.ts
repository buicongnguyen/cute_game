import * as T from 'three';
import {KitLibrary} from './assets.ts';
import {TITANS, type TitanId} from './titan-content.ts';
import {toonMaterial} from './toon.ts';
export const titanKit=new KitLibrary([`${import.meta.env?.BASE_URL??'/'}assets/models/titans.glb`]);
/** Kit-independent silhouettes keep all nine encounters readable while the optional Blender file streams. */
export function titanFallback(id:TitanId){
  const d=TITANS[id],g=new T.Group(),materials=new Map<string,T.MeshToonMaterial>();
  const add=(geo:T.BufferGeometry,color:string,x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{let mat=materials.get(color);if(!mat){mat=toonMaterial({color,flatShading:true});materials.set(color,mat);}const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);g.add(m);return m;};
  const ball=(x:number,y:number,z:number,r:number,color=d.color as string,sx=1,sy=1,sz=1)=>add(new T.IcosahedronGeometry(r,1),color,x,y,z,sx,sy,sz);
  const limb=(x:number,z:number,a:number,r=.2)=>{const m=add(new T.CylinderGeometry(r,r,1.2,6),d.color,x,.55,z);m.rotation.z=a;return m;};
  const eye=(x:number,y:number,z:number)=>{ball(x,y,z,.16,'#fff7dd');ball(x,y,z+.11,.075,'#292132');};
  if(id==='titan_turtle'){ball(0,.7,0,.95,d.color,1,.6,1.25);ball(0,1.05,0,.95,d.accent,1,.65,1.1);ball(0,.9,1.15,.38);for(const x of [-.75,.75])for(const z of [-.7,.7])limb(x,z,x*.3);for(let i=0;i<5;i++)add(new T.ConeGeometry(.3,.8,5),d.glow,Math.sin(i*1.25)*.5,1.7,Math.cos(i*1.25)*.5);eye(-.15,1.02,1.48);eye(.15,1.02,1.48);}
  else if(id==='titan_hydra'){ball(0,.6,0,1,d.color,1,.55,1.1);for(const x of [-.65,0,.65]){add(new T.CylinderGeometry(.17,.25,1.4,8),d.color,x,1.35,0);ball(x,2.05,.12,.35,x===0?d.color:x<0?d.accent:d.glow);eye(x-.11,2.1,.4);eye(x+.11,2.1,.4);}}
  else if(id==='titan_crystal'){add(new T.OctahedronGeometry(1),d.color,0,1.2,0,.7,1.4,.7);for(let i=0;i<7;i++){const a=i*Math.PI*2/7;add(new T.OctahedronGeometry(.35),d.accent,Math.sin(a)*.7,2,Math.cos(a)*.7,.5,1.4,.5);}eye(-.18,1.5,.56);eye(.18,1.5,.56);}
  else if(id==='titan_scorpion'||id==='titan_clock'){ball(0,.75,0,.8,d.color,1,.6,1.2);for(let i=0;i<4;i++)for(const side of [-1,1])limb(side*(.9+i*.06),-.6+i*.4,side*.8,.12);if(id==='titan_scorpion'){for(let i=0;i<5;i++)ball(0,1+i*.25,-.65-Math.sin(i*.55)*.65,.21,d.glow);for(const side of [-1,1])ball(side*1.1,.8,1,.4,d.accent,.6,.7,1);}else{add(new T.CylinderGeometry(.75,.75,.2,12),d.accent,0,1.22,0);for(let i=0;i<10;i++){const a=i*Math.PI/5;ball(Math.sin(a)*.65,1.45,Math.cos(a)*.65,.1,d.glow);}}eye(-.18,.85,.86);eye(.18,.85,.86);}
  else if(id==='titan_flower'){add(new T.CylinderGeometry(.3,.55,1.2,8),d.glow,0,.6,0);for(let i=0;i<7;i++){const a=i*Math.PI*2/7;ball(Math.sin(a)*.8,1.1,Math.cos(a)*.8,.55,d.color,1,.25,1);}ball(0,1.35,0,.65,d.accent,1,.35,1);ball(0,1.55,0,.4,'#552036',1,.2,1);}
  else if(id==='titan_kraken'){ball(0,1.3,0,.75,d.color,.8,1.2,.8);for(let i=0;i<8;i++){const a=i*Math.PI/4;for(let j=1;j<=3;j++)ball(Math.sin(a)*j*.35,.35+Math.sin(j)*.1,Math.cos(a)*j*.35,.2,d.accent);}eye(-.22,1.3,.62);eye(.22,1.3,.62);}
  else if(id==='titan_whale'){ball(0,.85,0,1,d.color,.85,.55,1.45);for(const side of [-1,1])ball(side*.95,.7,.1,.4,d.accent,1.2,.16,1);for(const side of [-1,1])ball(side*.38,.9,-1.4,.45,d.accent,1.3,.16,.7);eye(-.43,.9,1.04);eye(.43,.9,1.04);}
  else{ball(0,1.2,0,.85,d.color);ball(0,1.2,.55,.6,'#fff0f5');ball(0,1.2,1,.36,d.glow);ball(0,1.2,1.23,.14,'#241432');for(let i=0;i<8;i++){const a=i*Math.PI/4;add(new T.ConeGeometry(.14,.7,5),d.accent,Math.sin(a)*.95,1.2+Math.cos(a)*.95,0);}}
  return g;
}
export function titanArt(id:TitanId){return titanKit.ready?titanKit.instance(id):null;}
