import * as T from 'three';
import { BOULDER, type CombatEffect } from './combat.ts';
import { makeShot, poseShot } from './shot-art.ts';

interface Host { ground(x:number,z:number):number; explorerAt(x:number,z:number):T.Object3D|null }
interface Lob { mesh:T.Group; start:T.Vector3; end:T.Vector3; age:number; duration:number; live:boolean }
/** Bounded pool; one shared low-poly mesh per throw, no textures or per-frame allocations. */
export class BoulderFx {
  readonly root=new T.Group();
  private pool:Lob[]=[];
  private host:Host;
  constructor(host:Host){this.host=host;this.root.name='boulder-effects';}
  get busy(){return this.pool.some(lob=>lob.live);}
  throw(e:CombatEffect){
    let lob=this.pool.find(lob=>!lob.live);
    if(!lob){if(this.pool.length>=8)lob=this.pool.reduce((a,b)=>a.age/a.duration>b.age/b.duration?a:b);else{lob={mesh:makeShot('boulder',1.3,e.color),start:new T.Vector3(),end:new T.Vector3(),age:0,duration:BOULDER.time,live:false};this.pool.push(lob);this.root.add(lob.mesh);}}
    const angle=e.facing??0,x=e.x+Math.sin(angle)*e.radius,z=e.z+Math.cos(angle)*e.radius,model=this.host.explorerAt(e.x,e.z);
    if(model)model.getWorldPosition(lob.start);else lob.start.set(e.x,this.host.ground(e.x,e.z),e.z);
    lob.start.set(e.x,lob.start.y+BOULDER.height,e.z);lob.end.set(x,this.host.ground(x,z),z);
    lob.age=0;lob.duration=Math.max(.05,e.duration??BOULDER.time);lob.live=true;lob.mesh.visible=true;this.pose(lob);
  }
  private pose(lob:Lob){const t=Math.min(1,lob.age/lob.duration),a=lob.start,b=lob.end;poseShot(lob.mesh,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t+Math.sin(t*Math.PI)*BOULDER.arc,a.z+(b.z-a.z)*t,b.x-a.x,b.z-a.z,lob.age);}
  update(dt:number){if(!Number.isFinite(dt)||dt<=0)return;for(const lob of this.pool)if(lob.live){lob.age+=dt;this.pose(lob);if(lob.age>=lob.duration){lob.live=false;lob.mesh.visible=false;}}}
  clear(){for(const lob of this.pool){lob.live=false;lob.mesh.visible=false;}}
}
