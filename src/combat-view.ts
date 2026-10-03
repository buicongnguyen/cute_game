import * as T from 'three';
import {ELECTRIC_SHOTS,type CombatAlly,type CombatEffect,type Projectile} from './combat.ts';
import {toonMaterial} from './toon.ts';
import {createHarpoonProjectile} from './harpoon-art.ts';
export class CombatView {
  private scene:T.Scene;private shots=new Map<number,T.Mesh>();private effects:Array<{mesh:T.Mesh;life:number;max:number;kind:string}>=[];
  private allies=new Map<number,T.Group>();
  /** Called every frame for each flying electric shot (skill-fx.ts crackles around it). */
  electric?:(x:number,y:number,z:number,dx:number,dz:number)=>void;
  constructor(scene:T.Scene){this.scene=scene;}
  /** Effect geometry by shape and size, and finished effect meshes for reuse: no material or geometry is made or freed per swing (each new material relinked a shader). */
  private shapes=new Map<string,T.BufferGeometry>();private spare:T.Mesh[]=[];
  private shape(e:CombatEffect){const key=e.kind+':'+e.radius.toFixed(2)+':'+(e.width??.65).toFixed(2);let geometry=this.shapes.get(key);
    if(!geometry){if(e.kind==='beam')geometry=new T.PlaneGeometry(e.width??.65,e.radius);else if(e.kind==='arc')geometry=new T.RingGeometry(e.radius*.78,e.radius,28,1,-Math.PI*.65,Math.PI*1.3);else if(e.kind==='cast')geometry=new T.RingGeometry(e.radius*.92,e.radius,40);else geometry=new T.RingGeometry(e.radius*.65,e.radius,32);this.shapes.set(key,geometry);}
    return geometry;}
  effect(e:CombatEffect){
    const mesh=this.spare.pop()??new T.Mesh(undefined,new T.MeshBasicMaterial({transparent:true,opacity:.72,side:T.DoubleSide,depthWrite:false}));
    mesh.geometry=this.shape(e);(mesh.material as T.MeshBasicMaterial).color.set(e.color);(mesh.material as T.MeshBasicMaterial).opacity=.72;
    mesh.rotation.set(-Math.PI/2,0,0);mesh.scale.setScalar(1);mesh.position.set(e.x,e.kind==='cast'?.15:.6,e.z);
    // The plane's long side lies along (sin f, cos f) only with +f (−f mirrored every diagonal beam across the z axis).
    if(e.kind==='beam'){mesh.rotation.z=e.facing??0;mesh.position.x+=Math.sin(e.facing??0)*e.radius/2;mesh.position.z+=Math.cos(e.facing??0)*e.radius/2;}
    if(e.kind==='arc')mesh.rotation.z=-(e.facing??0)+Math.PI/2;
    this.scene.add(mesh);const life=e.duration??(e.kind==='cast'?.7:e.kind==='trail'?.24:.38);this.effects.push({mesh,life,max:life,kind:e.kind});
  }
  update(dt:number,projectiles:Projectile[],active=true,allies:CombatAlly[]=[]){
    const allyIds=new Set(allies.map(ally=>ally.id));for(const[id,model]of this.allies)if(!allyIds.has(id)){this.disposeAlly(model);this.allies.delete(id);}
    for(const ally of allies){let model=this.allies.get(ally.id);if(!model){model=new T.Group();const color=ally.kind==='snowman'?'#ebfcff':ally.kind==='bat'?'#745278':ally.kind==='clone'?'#807db2':'#80909c';const mat=toonMaterial({color,transparent:true,opacity:.88,flatShading:true});
      const body=new T.Mesh(ally.kind==='turret'||ally.kind==='cannon'?new T.BoxGeometry(.8,.8,.8):new T.IcosahedronGeometry(ally.kind==='bat'?.3:.5,1),mat);body.position.y=.6;model.add(body);
      if(ally.kind==='turret'||ally.kind==='cannon'){const barrel=new T.Mesh(new T.CylinderGeometry(.14,.2,1,8),mat);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.95,.45);model.add(barrel);}
      else if(ally.kind==='bat'){for(const side of [-1,1]){const wing=new T.Mesh(new T.ConeGeometry(.36,.75,3),mat);wing.rotation.z=side*Math.PI/2;wing.position.set(side*.4,.7,0);model.add(wing);}}
      else{const head=new T.Mesh(new T.IcosahedronGeometry(.35,1),mat);head.position.y=1.2;model.add(head);for(const x of [-.12,.12]){const eye=new T.Mesh(new T.SphereGeometry(.04,6,4),new T.MeshBasicMaterial({color:'#263541'}));eye.position.set(x,1.23,.32);model.add(eye);}}
      this.allies.set(ally.id,model);this.scene.add(model);}model.position.set(ally.x,ally.kind==='bat'?.7:0,ally.z);}
    const ids=new Set(projectiles.map(p=>p.id));for(const[id,mesh]of this.shots)if(!ids.has(id)){this.dispose(mesh);this.shots.delete(id);}
    for(const p of projectiles){let mesh=this.shots.get(p.id);if(!mesh){mesh=p.kind==='harpoon'?createHarpoonProjectile():ELECTRIC_SHOTS.has(p.kind)?new T.Mesh(new T.IcosahedronGeometry(.13,1),new T.MeshBasicMaterial({color:'#f2fdff'})):new T.Mesh(new T.IcosahedronGeometry(Math.max(.14,p.radius),1),new T.MeshBasicMaterial({color:p.color,transparent:true,opacity:.9}));this.shots.set(p.id,mesh);this.scene.add(mesh);}mesh.position.set(p.x,p.kind==='wave'?.5:1.05,p.z);if(p.kind==='wave')mesh.scale.set(2.5,.35,1);if(p.kind==='harpoon')mesh.rotation.y=Math.atan2(p.direction.x,p.direction.z);if(active&&ELECTRIC_SHOTS.has(p.kind))this.electric?.(p.x,1.05,p.z,p.direction.x,p.direction.z);}
    if(!active)return;
    for(let i=this.effects.length-1;i>=0;i--){const e=this.effects[i];e.life-=dt;(e.mesh.material as T.MeshBasicMaterial).opacity=.72*Math.max(0,e.life/e.max);if(e.kind!=='beam'&&e.kind!=='cast'){const scale=1+(1-e.life/e.max)*.65;e.mesh.scale.setScalar(scale);}if(e.life<=0){this.scene.remove(e.mesh);this.spare.push(e.mesh);this.effects.splice(i,1);}}
  }
  clear(){for(const mesh of this.shots.values())this.dispose(mesh);this.shots.clear();for(const effect of this.effects){this.scene.remove(effect.mesh);this.spare.push(effect.mesh);}this.effects=[];for(const model of this.allies.values())this.disposeAlly(model);this.allies.clear();}
  private disposeAlly(group:T.Group){this.scene.remove(group);const materials=new Set<T.Material>();group.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material])materials.add(material);}});for(const material of materials)material.dispose();}
  private dispose(mesh:T.Mesh){this.scene.remove(mesh);mesh.geometry.dispose();(mesh.material as T.Material).dispose();}
}
