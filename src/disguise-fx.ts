import * as T from 'three';
import { DISGUISE_LOOKS, type CombatEffect } from './combat.ts';
import { LOOKS, LOOK_LIFE, MAX_PER_CAST, SHAPES, screenPulse, type LookContext, type Painter, type Shape } from './skill-visuals.ts';

interface Host { ground(x:number,z:number):number; explorerAt(x:number,z:number):T.Object3D|null; /** 0-1 particle density of the graphics setting. */ density?():number; /** True when the cast is the local player's (screen pulses). */ isLocal?(x:number,z:number):boolean }
interface Cast { effect:CombatEffect; age:number; life:number; model:T.Object3D|null }
const FOLLOW=new Set(['charge','parrot','shield','bats','rush']);
const BATCH=900,MAX_CASTS=48;
/** Soft hex-cell dome: a fresnel rim plus a faint honeycomb, patched into a plain basic material (no lights, no textures). */
function domeMaterial(){
  const m=new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.5,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending});
  m.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vN;varying vec3 vV;varying vec3 vP;').replace('#include <project_vertex>','#include <project_vertex>\nvec3 nn=normal;\n#ifdef USE_INSTANCING\nnn=mat3(instanceMatrix)*nn;\n#endif\nvN=normalize(normalMatrix*nn);vV=normalize(-mvPosition.xyz);vP=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vN;varying vec3 vV;varying vec3 vP;\nfloat hexd(vec2 p){p=abs(p);return max(dot(p,vec2(.866,.5)),p.y);}')
      .replace('#include <dithering_fragment>','#include <dithering_fragment>\nfloat rim=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.2);vec2 g=vP.xz*3.2+vec2(vP.y*1.6,0.);vec2 r=vec2(1.,1.732);vec2 a=mod(g,r)-r*.5;vec2 b=mod(g-r*.5,r)-r*.5;vec2 gv=dot(a,a)<dot(b,b)?a:b;float edge=smoothstep(.40,.48,hexd(gv));gl_FragColor.rgb*=.25+rim*1.6+edge*.9;gl_FragColor.a*=.25+rim*.9+edge*.5;');
  };
  return m;
}
/** Every cast is painted into shared instanced batches (one draw per shape in use). No textures, lights or per-frame meshes. */
export class DisguiseFx implements Painter {
  readonly root=new T.Group();
  private casts:Cast[]=[];
  private batches:Record<Shape,T.InstancedMesh>;
  private dummy=new T.Object3D();private color=new T.Color();private origin=new T.Vector3();
  private host:Host;private painted=0;private ctx:LookContext={x:0,y:0,z:0,r:1,t:0,a:0,f:0,color:'#fff',n:1,life:1};
  /** Instances painted for the busiest cast of the last draw (tests). */
  maxPainted=0;
  constructor(host:Host){
    this.host=host;this.root.name='disguise-effects';this.dummy.rotation.order='YXZ';
    const heart=new T.Shape();heart.moveTo(0,-.6);heart.bezierCurveTo(-1,.05,-.65,.85,0,.4);heart.bezierCurveTo(.65,.85,1,.05,0,-.6);
    const star=new T.Shape();for(let i=0;i<10;i++){const a=i/10*Math.PI*2,r=i%2?.42:1;if(i)star.lineTo(Math.sin(a)*r,Math.cos(a)*r);else star.moveTo(Math.sin(a)*r,Math.cos(a)*r);}
    const geometries:Record<Shape,T.BufferGeometry>={orb:new T.IcosahedronGeometry(1,1),mist:new T.IcosahedronGeometry(1,1),box:new T.BoxGeometry(1,1,1),cone:new T.ConeGeometry(1,1,6),ring:new T.RingGeometry(.94,1,40).rotateX(-Math.PI/2),heart:new T.ShapeGeometry(heart),star:new T.ShapeGeometry(star),petal:new T.CircleGeometry(1,10).rotateX(-Math.PI/2),rock:new T.IcosahedronGeometry(1,0),gorb:new T.IcosahedronGeometry(1,1),gbox:new T.BoxGeometry(1,1,1),gring:new T.RingGeometry(.9,1,48).rotateX(-Math.PI/2),dome:new T.SphereGeometry(1,20,10,0,Math.PI*2,0,Math.PI/2)};
    const glow=(opacity:number)=>new T.MeshBasicMaterial({color:'#ffffff',side:T.DoubleSide,transparent:true,opacity,depthWrite:false});
    const materials:Record<Shape,T.Material>={
      orb:new T.MeshBasicMaterial({color:'#ffffff',side:T.DoubleSide}),box:new T.MeshBasicMaterial({color:'#ffffff'}),cone:new T.MeshBasicMaterial({color:'#ffffff'}),heart:new T.MeshBasicMaterial({color:'#ffffff',side:T.DoubleSide}),star:new T.MeshBasicMaterial({color:'#ffffff',side:T.DoubleSide}),petal:new T.MeshBasicMaterial({color:'#ffffff',side:T.DoubleSide}),
      mist:new T.MeshLambertMaterial({color:'#ffffff',transparent:true,opacity:.72,depthWrite:false}),rock:new T.MeshLambertMaterial({color:'#ffffff',flatShading:true}),
      ring:new T.MeshBasicMaterial({color:'#ffffff',side:T.DoubleSide,transparent:true,opacity:.8,depthWrite:false}),gorb:glow(.85),gbox:glow(.8),gring:glow(.9),dome:domeMaterial()};
    this.batches={} as Record<Shape,T.InstancedMesh>;
    for(const kind of SHAPES){const mesh=new T.InstancedMesh(geometries[kind],materials[kind],BATCH);mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.setColorAt(0,this.color.set('#ffffff'));mesh.instanceColor!.setUsage(T.DynamicDrawUsage);mesh.renderOrder=kind.startsWith('g')||kind==='dome'||kind==='mist'?3:2;mesh.name=kind;mesh.visible=false;this.batches[kind]=mesh;this.root.add(mesh);}
  }
  get busy(){return this.casts.length>0;}
  get count(){return this.casts.length;}
  play(effect:CombatEffect){
    if(!effect.look||!DISGUISE_LOOKS.includes(effect.look as typeof DISGUISE_LOOKS[number]))return false;
    if(!Number.isFinite(effect.x)||!Number.isFinite(effect.z)||!Number.isFinite(effect.radius))return false;
    if(this.casts.length>=MAX_CASTS)this.casts.shift();
    this.casts.push({effect:{...effect,radius:Math.max(0,Math.min(40,effect.radius))},age:0,life:Math.max(.05,Math.min(12,effect.duration??LOOK_LIFE[effect.look]??.6)),model:FOLLOW.has(effect.look)?this.host.explorerAt(effect.x,effect.z):null});
    if(effect.look==='roar'&&(this.host.isLocal?.(effect.x,effect.z)??false))screenPulse('#ffb03a');
    this.draw();return true;
  }
  update(dt:number){if(!this.busy||!Number.isFinite(dt)||dt<=0)return;for(const c of this.casts)c.age+=dt;this.casts=this.casts.filter(c=>c.age<c.life);this.draw();}
  clear(){this.casts=[];this.draw();}
  put(kind:Shape,color:string,x:number,y:number,z:number,sx:number,sy=sx,sz=sx,rx=0,ry=0,rz=0){
    const b=this.batches[kind];if(b.count>=BATCH||this.painted>=MAX_PER_CAST)return;this.painted++;
    this.dummy.position.set(x,y,z);this.dummy.scale.set(Math.max(1e-4,sx),Math.max(1e-4,sy),Math.max(1e-4,sz));this.dummy.rotation.set(rx,ry,rz);this.dummy.updateMatrix();b.setMatrixAt(b.count,this.dummy.matrix);b.setColorAt(b.count++,this.color.set(color));
  }
  private draw(){
    for(const batch of Object.values(this.batches))batch.count=0;
    const n=Math.max(.25,Math.min(1,this.host.density?.()??1)),c=this.ctx;this.maxPainted=0;
    for(const cast of this.casts){const e=cast.effect;let x=e.x,z=e.z,y=this.host.ground(x,z)+.12;
      if(cast.model?.parent){cast.model.getWorldPosition(this.origin);x=this.origin.x;z=this.origin.z;y=this.origin.y+.12;}
      c.x=x;c.y=y;c.z=z;c.r=e.radius;c.t=Math.min(1,cast.age/cast.life);c.a=cast.age;c.f=e.facing??0;c.color=e.color;c.n=n;c.life=cast.life;
      this.painted=0;LOOKS[e.look!]?.(this,c);this.maxPainted=Math.max(this.maxPainted,this.painted);
    }
    for(const b of Object.values(this.batches)){b.instanceMatrix.needsUpdate=true;if(b.instanceColor)b.instanceColor.needsUpdate=true;b.visible=b.count>0;}
  }
}
