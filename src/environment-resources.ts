import type {EnvironmentLayout} from './environments.ts';
export interface EnvironmentResourceNode {id:string;kind:string;index:number;x:number;z:number;radius:number;hits:number;item?:string;cooldown?:number}
/** Deterministic public world-node positions shared with the server; no Three.js dependency. */
export function environmentResourceNodes(l:EnvironmentLayout):EnvironmentResourceNode[]{
  const nodes:EnvironmentResourceNode[]=[];
  const add=(kind:string,index:number,x:number,z:number,radius:number,hits=1,item?:string,cooldown?:number)=>nodes.push({id:`${l.planet}:${kind}:${index}`,kind,index,x,z,radius,hits,item,cooldown});
  if(l.planet==='jungle')for(const p of l.fruit)add('fruit',p.id,p.x,p.z,1.4,1,undefined,60000);
  if(l.planet==='ocean')l.bubbles.slice(0,16).forEach((p,i)=>add('clam',i,p.x+2.3,p.z+.8,.8,3,'coral',150000));
  if(l.planet==='shadow')for(const p of l.lamps)add('light-pillar',p.id,p.x,p.z,1);
  if(l.planet==='lava'){
    add('cave-gate',0,l.cave.gate.x,l.cave.gate.z,2,8);
    add('cave-chest',0,l.cave.x,l.cave.z-8,1);
    [[l.cave.x-5,l.cave.gate.z+4],[l.cave.x+5,l.cave.gate.z+4],[l.cave.x-7,l.cave.z],[l.cave.x+6,l.cave.z-4],[l.cave.x-4,l.cave.z-6]].forEach(([x,z],i)=>add('fire-crystal',i,x,z,.9,2,'fcrystal',120000));
    for(let i=0;i<40;i++){const magma=i<18,index=magma?i:i-18,a=i*2.399,r=30+Math.sqrt((i+.5)/40)*93,x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(l.pools.some(p=>Math.hypot(p.x-x,p.z-z)<p.r+2)||Math.hypot(x-l.cave.x,z-l.cave.z)<l.cave.r+4)continue;
      add(magma?'magma-ore':'obsidian-ore',index,x,z,1,magma?3:4,magma?'mcrystal':'obsidian',magma?150000:180000);
    }
    l.braziers.forEach((p,i)=>add('brazier',i,p.x,p.z,.9));add('furnace',0,l.furnace.x,l.furnace.z,2);
  }
  return nodes;
}
