import * as T from 'three';
import { DISGUISE_LOOKS, type CombatEffect } from './combat.ts';

interface Host { ground(x:number,z:number):number; explorerAt(x:number,z:number):T.Object3D|null }
type Shape='orb'|'mist'|'box'|'cone'|'ring'|'heart';
interface Cast { effect:CombatEffect; age:number; life:number; model:T.Object3D|null }
/** All magic fields share six instanced draws, including on phones. No textures, lights or per-frame meshes. */
export class DisguiseFx {
  readonly root=new T.Group();
  private casts:Cast[]=[];
  private batches:Record<Shape,T.InstancedMesh>;
  private dummy=new T.Object3D();private color=new T.Color();private origin=new T.Vector3();
  private host:Host;
  constructor(host:Host){
    this.host=host;this.root.name='disguise-effects';
    const heart=new T.Shape();heart.moveTo(0,-.6);heart.bezierCurveTo(-1,.05,-.65,.85,0,.4);heart.bezierCurveTo(.65,.85,1,.05,0,-.6);
    const geometries={orb:new T.IcosahedronGeometry(1,1),mist:new T.IcosahedronGeometry(1,1),box:new T.BoxGeometry(1,1,1),cone:new T.ConeGeometry(1,1,6),ring:new T.RingGeometry(.94,1,40).rotateX(-Math.PI/2),heart:new T.ShapeGeometry(heart)};
    this.batches={} as Record<Shape,T.InstancedMesh>;
    for(const kind of Object.keys(geometries) as Shape[]){const translucent=kind==='mist'||kind==='ring';const mesh=new T.InstancedMesh(geometries[kind],new T.MeshBasicMaterial({color:'#ffffff',side:T.DoubleSide,transparent:translucent,opacity:kind==='mist'?.2:kind==='ring'?.75:1,depthWrite:!translucent}),1024);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.name=kind;this.batches[kind]=mesh;this.root.add(mesh);}
  }
  get busy(){return this.casts.length>0;}
  get count(){return this.casts.length;}
  play(effect:CombatEffect){
    if(!effect.look||!DISGUISE_LOOKS.includes(effect.look as typeof DISGUISE_LOOKS[number]))return false;
    if(!Number.isFinite(effect.x)||!Number.isFinite(effect.z)||!Number.isFinite(effect.radius))return false;
    if(this.casts.length>=48)this.casts.shift();
    this.casts.push({effect:{...effect,radius:Math.max(0,Math.min(40,effect.radius))},age:0,life:Math.max(.05,Math.min(12,effect.duration??.6)),model:effect.look==='charge'||effect.look==='parrot'?this.host.explorerAt(effect.x,effect.z):null});
    this.draw();return true;
  }
  update(dt:number){if(!this.busy||!Number.isFinite(dt)||dt<=0)return;for(const c of this.casts)c.age+=dt;this.casts=this.casts.filter(c=>c.age<c.life);this.draw();}
  clear(){this.casts=[];this.draw();}
  private put(kind:Shape,color:string,x:number,y:number,z:number,sx:number,sy=sx,sz=sx,rx=0,ry=0,rz=0){
    const b=this.batches[kind];if(b.count>=1024)return;this.dummy.position.set(x,y,z);this.dummy.scale.set(sx,sy,sz);this.dummy.rotation.set(rx,ry,rz);this.dummy.updateMatrix();b.setMatrixAt(b.count,this.dummy.matrix);b.setColorAt(b.count++,this.color.set(color));
  }
  private draw(){
    for(const batch of Object.values(this.batches))batch.count=0;
    for(const c of this.casts){const e=c.effect,t=c.age/c.life,a=c.age,r=e.radius,f=e.facing??0;let x=e.x,z=e.z,y=this.host.ground(x,z)+.12;
      if(c.model?.parent){c.model.getWorldPosition(this.origin);x=this.origin.x;z=this.origin.z;y=this.origin.y+.12;}
      const rim=(color=e.color,radius=r)=>this.put('ring',color,x,y,z,radius,1,radius);
      switch(e.look){
        case 'charge':{const s=.15+t;this.put('orb','#ff6a24',x+Math.sin(f),y+1.9,z+Math.cos(f),s);this.put('mist','#ffcd55',x+Math.sin(f),y+1.9,z+Math.cos(f),s*1.6);break;}
        case 'smoke':rim('#b1a1ca');for(let i=0;i<10;i++){const q=i*2.4+a*.22,rr=r*(.25+(i%3)*.24);this.put('mist','#9387b4',x+Math.sin(q)*rr,y+.5+(i%3)*.35,z+Math.cos(q)*rr,1.1,.6,1.1);}break;
        case 'heal':rim('#72d98b');for(let i=0;i<9;i++){const q=i*2.4,rr=r*Math.sqrt((i+.5)/9),xx=x+Math.sin(q)*rr,zz=z+Math.cos(q)*rr,yy=y+.22+Math.sin(a*2+i)*.09;this.put('orb','#ffe881',xx,yy,zz,.14);for(let j=0;j<5;j++)this.put('orb','#ff91cf',xx+Math.sin(j*1.257)*.22,yy,zz+Math.cos(j*1.257)*.22,.18,.08,.18);}break;
        case 'icefield':rim('#66d9ff');this.put('mist','#7ac9fa',x,y-.1,z,r,.08,r);for(let i=0;i<6;i++){const q=i*Math.PI/3;this.put('box','#c2f6ff',x+Math.sin(q)*r*.45,y,z+Math.cos(q)*r*.45,.05,.03,r*.85,0,q);}break;
        case 'blackhole':rim('#9770ff');this.put('orb','#211433',x,y+1.4,z,1.1+.1*Math.sin(a*5));for(let i=0;i<3;i++){const s=1.8+i*.6;this.put('ring','#c277ff',x,y+1.4,z,s,1,s,.35+i*.4,a*(i+1));}for(let i=0;i<12;i++){const q=i*2.4+a*3,rr=r*(1-((a*.5+i/12)%1));this.put('orb','#ca8dff',x+Math.sin(q)*rr,y+.4,z+Math.cos(q)*rr,.08);}break;
        case 'moon':rim('#c74565');this.put('orb','#c42c53',x,y+5,z,1.35);this.put('mist','#ff6382',x,y+5,z,1.7);for(let i=0;i<7;i++){const q=i*2.4;this.put('orb','#7b1539',x+Math.sin(q)*.8,y+5+Math.cos(q)*.7,z+.85,.19);}break;
        case 'holy':{rim('#ffdf68');const h=y+(1-t)*8;this.put('cone','#fff1af',x,h+1.6,z,.45,3,.18,Math.PI);this.put('box','#ffc847',x,h+3.3,z,1.7,.22,.35);this.put('box','#7555b0',x,h+3.8,z,.25,.9,.25);break;}
        case 'meteor':case 'cannonfall':{rim();const h=y+(1-t)*9;this.put('orb',e.look==='meteor'?'#ffe058':'#454854',x,h,z,.5);if(e.look==='meteor')this.put('cone','#ff9445',x,h+1,z,.4,2,.4);break;}
        case 'hook':case 'drain':{const reach=e.look==='hook'?r*Math.min(1,t*3):r,xx=x+Math.sin(f)*reach/2,zz=z+Math.cos(f)*reach/2;this.put('box',e.look==='hook'?'#b9b2a0':'#e24474',xx,y+1,zz,.06,.06,Math.max(.01,reach),0,f);for(let i=0;i<4;i++){const k=((i/4+1-t)%1)*reach;this.put('orb',e.look==='hook'?'#ece5cb':'#ff7d94',x+Math.sin(f)*k,y+1,z+Math.cos(f)*k,.11);}break;}
        case 'hearts':for(let i=0;i<5;i++){const q=i*1.257+a,rr=.6;this.put('heart','#ff6eb4',x+Math.sin(q)*rr,y+.6+((a+i*.3)%2),z+Math.cos(q)*rr,.35,.35,.35,-.6);}break;
        case 'roots':{rim('#83be62');const tx=x+Math.sin(f)*2.5,tz=z+Math.cos(f)*2.5;this.put('box','#815533',tx,y+.9,tz,.3,1.8,.3);this.put('orb','#43894f',tx,y+1.55,tz,.95,.55,.8);this.put('orb','#70bd65',tx-.3,y+2,tz,.75,.65,.7);this.put('orb','#91d675',tx+.35,y+2.1,tz+.15,.6,.5,.65);for(let j=0;j<3;j++)this.put('orb','#ffd378',tx+Math.sin(j*2.1)*.7,y+2.25,tz+Math.cos(j*2.1)*.65,.18);for(let i=0;i<8;i++){const q=i*Math.PI/4;this.put('cone','#b6d77d',x+Math.sin(q)*r*.65,y+.35,z+Math.cos(q)*r*.65,.16,.85,.16,Math.sin(q)*.5,0,Math.cos(q)*.5);}break;}
        case 'roar':for(let i=0;i<3;i++){const s=((t+i/3)%1)*r;this.put('ring',e.color,x,y+.8,z,s,1,s);}break;
        case 'freeze':for(let i=0;i<5;i++){const q=i*Math.PI*2/5;this.put('cone','#9cdefa',x+Math.sin(q)*r*.7,y+.8,z+Math.cos(q)*r*.7,.28,1.8,.28);}break;
        case 'portal':{const s=.3+Math.sin(t*Math.PI)*r;this.put('ring','#b88cff',x,y+1,z,s,1,s,Math.PI/2);for(let i=0;i<8;i++){const q=i*Math.PI/4+a*5;this.put('orb','#eee0ff',x+Math.cos(q)*s,y+1+Math.sin(q)*s,z,.12);}break;}
        case 'bite':for(const side of [-1,1])for(let i=0;i<5;i++){const q=f+(i-2)*.3,rr=r*.65;this.put('cone','#fff5ce',x+Math.sin(q)*rr,y+.8+side*(.12+.45*(1-t)),z+Math.cos(q)*rr,.13,.45,.13,side<0?0:Math.PI);}break;
        case 'tail':for(let i=0;i<9;i++){const q=f+t*6.28-i*.14;this.put('orb','#70b66b',x+Math.sin(q)*r*.8,y+.5,z+Math.cos(q)*r*.8,.3*(1-i/12),.15,.3);}break;
        case 'parrot':{const q=a*1.5,xx=x+Math.sin(q)*2,zz=z+Math.cos(q)*2,yy=y+2.6;this.put('orb','#3dc880',xx,yy,zz,.3,.4,.3);this.put('orb','#ffcf4a',xx,yy+.38,zz+.1,.22);for(const side of [-1,1])this.put('box','#3c94e4',xx+side*.45,yy,zz,.75,.08,.35,0,0,side*Math.sin(a*16)*.5);break;}
      }
    }
    for(const b of Object.values(this.batches)){b.instanceMatrix.needsUpdate=true;if(b.instanceColor)b.instanceColor.needsUpdate=true;b.visible=b.count>0;}
  }
}
