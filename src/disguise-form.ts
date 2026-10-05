import * as T from 'three';
import {makeSummon,animateSummon} from './summon-art.ts';

const hidden=new WeakMap<T.Object3D,Map<T.Object3D,boolean>>();
/** Avatar/enemy trees dispose their own resources, unlike CombatView's shared summon pool. */
function owned(kind:'bat'|'sheep'){const g=makeSummon(kind);g.traverse(o=>{if(o instanceof T.Mesh){o.geometry=o.geometry.clone();o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();}});return g;}
export function disguiseForm(mesh:T.Group,kind:'bat'|'sheep',active:boolean,time:number,scale=1){
  let form=mesh.children.find(c=>c.name==='form-'+kind) as T.Group|undefined;
  if(active&&!form){form=new T.Group();form.name='form-'+kind;const count=kind==='bat'?4:1;for(let i=0;i<count;i++)form.add(owned(kind));mesh.add(form);}
  if(!form)return;
  form.visible=active;
  if(active){let old=hidden.get(mesh);if(!old){old=new Map();hidden.set(mesh,old);}for(const child of mesh.children)if(child!==form&&child.name!=='status-shield'){if(!old.has(child))old.set(child,child.visible);child.visible=false;}
    form.scale.setScalar(scale);
    if(kind==='bat')form.children.forEach((bat,i)=>{const a=time*3+i*Math.PI/2;bat.position.set(Math.sin(a)*.8,.5+Math.sin(a*2)*.15,Math.cos(a)*.8);bat.rotation.y=-a;animateSummon(bat as T.Group,'bat',time+i);});
  }else{const old=hidden.get(mesh);if(old){for(const [child,visible]of old)child.visible=visible;hidden.delete(mesh);}}
}
