import * as T from 'three';
import { TITAN_COLORS, type TitanAttack } from './titan-patterns.ts';

/** Persistent pooled meshes make attack state readable on the host and newly joined peers alike. */
export class TitanAttackView {
  readonly root=new T.Group();private pool:T.Mesh[]=[];private used=0;
  private disc=new T.RingGeometry(.86,1,48).rotateX(-Math.PI/2);private sphere=new T.IcosahedronGeometry(.45,1);private beam=new T.BoxGeometry(.8,.35,1);
  private materials=new Map<string,T.MeshBasicMaterial>();
  constructor(){this.root.name='titan-attacks';}
  begin(){this.used=0;}
  private mesh(geometry:T.BufferGeometry,color:string){let mat=this.materials.get(color);if(!mat){mat=new T.MeshBasicMaterial({color,transparent:true,opacity:.75,depthWrite:false,side:T.DoubleSide,toneMapped:false});this.materials.set(color,mat);}let m=this.pool[this.used++];if(!m){m=new T.Mesh(geometry,mat);m.raycast=()=>{};this.root.add(m);this.pool.push(m);}m.geometry=geometry;m.material=mat;m.visible=true;m.scale.set(1,1,1);m.rotation.set(0,0,0);return m;}
  draw(a:TitanAttack,source:{x:number;z:number},ground:(x:number,z:number)=>number){
    const color=TITAN_COLORS[a.skill],ring=(x:number,z:number,r:number,c=color)=>{const m=this.mesh(this.disc,c);m.position.set(x,ground(x,z)+.09,z);m.scale.setScalar(r);return m;};
    if(a.skill==='sweep'){const angle=(a.marks[0]?.a??a.facing)+a.age/2.2*3.5,length=a.radius+17,m=this.mesh(this.beam,color);m.position.set(source.x+Math.sin(angle)*length/2,ground(source.x,source.z)+1.2,source.z+Math.cos(angle)*length/2);m.rotation.y=angle;m.scale.z=length;}
    else if(a.skill==='orbs'){for(const orb of a.orbs)if(!orb.done){const m=this.mesh(this.sphere,color);m.position.set(orb.x,ground(orb.x,orb.z)+1.1,orb.z);m.scale.setScalar(1.1+Math.sin(a.age*12)*.15);}}
    else if(a.skill==='pull'){const m=ring(source.x,source.z,4+a.age*8);m.rotation.y=a.age*6;ring(source.x,source.z,a.radius+4.5,'#ffffff');}
    else if(a.skill==='donut'){ring(source.x,source.z,a.radius+11);ring(source.x,source.z,a.radius+1.5,'#5aff9a');}
    else if(a.skill==='pools')for(const p of a.marks){ring(p.x,p.z,p.r);const m=this.mesh(this.sphere,color);m.position.set(p.x,ground(p.x,p.z)+.04,p.z);m.scale.set(p.r*2,.13,p.r*2);}
    else for(let i=0;i<a.marks.length;i++){const p=a.marks[i];if(a.fired.includes(i))continue;ring(p.x,p.z,p.r);if(a.skill==='bombard'){const left=.45+(p.k??0)*.38-a.age,m=this.mesh(this.sphere,'#ffd39b');m.position.set(p.x,ground(p.x,p.z)+Math.max(.3,left*12),p.z);}}
  }
  end(){for(let i=this.used;i<this.pool.length;i++)this.pool[i].visible=false;}
  clear(){this.used=0;this.end();}
  dispose(){this.root.removeFromParent();for(const g of [this.disc,this.sphere,this.beam])g.dispose();for(const m of this.materials.values())m.dispose();this.pool=[];}
}
