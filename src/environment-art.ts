import * as T from 'three';
import {toonMaterial} from './toon.ts';
import {type EnvironmentLayout,EnvironmentSimulation,terrainHeight,thornRaised,tideHeight,trainPosition,ventPhase,raftPosition} from './environments.ts';

export interface EnvironmentNode {kind:string;name:string;icon:string;index:number;x:number;z:number;radius:number;mesh:T.Group}
export class EnvironmentView {
  staticRoot=new T.Group();dynamicRoot=new T.Group();nodes:EnvironmentNode[]=[];colliders:Array<{x:number;z:number;r:number;tag?:string}>=[];
  private materials=new Map<string,T.MeshToonMaterial>();private pools:T.Mesh[]=[];private trains:Array<{mesh:T.Group;track:number;car:number}>=[];
  private vents:Array<{ring:T.Mesh;fire:T.Group;id:number}>=[];private thorns:Array<{group:T.Group;index:number}>=[];private lamps=new Map<number,T.Group>();private turtles=new Map<number,T.Group>();
  private rafts:T.Group[]=[];private rain=new Map<string,T.Group>();private nestSea?:T.Mesh;
  layout:EnvironmentLayout;
  constructor(layout:EnvironmentLayout){this.layout=layout;this.dynamicRoot.userData.environment=true;this.build();}
  private mat(color:string,glow=false){const key=color+glow;if(!this.materials.has(key))this.materials.set(key,toonMaterial({color,flatShading:true,...(glow?{emissive:color,emissiveIntensity:.65}:{})}));return this.materials.get(key)!;}
  private mesh(geometry:T.BufferGeometry,color:string,x=0,y=0,z=0,glow=false){const m=new T.Mesh(geometry,this.mat(color,glow));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
  private box(color:string,w:number,h:number,d:number,x=0,y=0,z=0){return this.mesh(new T.BoxGeometry(w,h,d),color,x,y,z);}
  private ball(color:string,r:number,x=0,y=0,z=0){return this.mesh(new T.IcosahedronGeometry(r,1),color,x,y,z);}
  private cyl(color:string,r:number,h:number,x=0,y=0,z=0,top=r){return this.mesh(new T.CylinderGeometry(top,r,h,12),color,x,y,z);}
  private disk(color:string,r:number,x:number,z:number,y=.025){const mesh=this.mesh(new T.CircleGeometry(r,48),color,x,y,z);mesh.rotation.x=-Math.PI/2;mesh.castShadow=false;return mesh;}
  private node(kind:string,name:string,icon:string,index:number,x:number,z:number,radius:number,mesh:T.Group){this.nodes.push({kind,name,icon,index,x,z,radius,mesh});return mesh;}
  private crystal(color:string,r=.5){const g=new T.Group();for(let i=0;i<3;i++){const p=this.mesh(new T.OctahedronGeometry(r),color,(i-1)*r*.55,r*.9+i*.15,0,true);p.scale.set(.5,1.5,.6);g.add(p);}return g;}
  private flame(){const g=new T.Group();g.add(this.cyl('#ff813e',.43,1.5,0,.7,0,0),this.cyl('#ffe66b',.23,.95,0,.48,.08,0));g.name='flame';return g;}
  private turtle(){const g=new T.Group();const shell=this.ball('#73ad72',1,0,.48);shell.scale.set(1,.48,1.25);g.add(shell,this.ball('#b6d692',.35,0,.48,1.2));for(const x of [-1,1])for(const z of [-.6,.6]){const flipper=this.ball('#a2c583',.32,x*.78,.14,z);flipper.scale.set(1.2,.24,.8);g.add(flipper);}return g;}
  private build(){const l=this.layout;
    for(const island of l.islands){
      const ocean=l.planet==='ocean';this.staticRoot.add(this.cyl(ocean?'#e9d19a':'#8da1b4',island.r, ocean?.55:3,island.x,ocean?-.27:-1.5,island.z,island.r));
      this.staticRoot.add(this.disk(island.id===0?'#a9dc83':ocean?'#f4dea4':'#aada92',island.r*.998,island.x,island.z,.01));
      if(island.id>0){const tree=new T.Group();tree.add(this.cyl('#a77d58',.22,2.6,0,1.3));for(let k=0;k<5;k++){const leaf=this.ball(ocean?'#61bd75':'#daeeff',1.0,Math.sin(k*1.25)*.7,2.5,Math.cos(k*1.25)*.7);leaf.scale.y=.36;tree.add(leaf);}tree.position.set(island.x+island.r*.4,0,island.z);this.staticRoot.add(tree);this.colliders.push({x:tree.position.x,z:tree.position.z,r:.35});}
    }
    if(l.planet==='ocean'){
      this.staticRoot.add(this.disk('#56bce6',151,0,0,-.16));
      l.bubbles.forEach(p=>{const g=new T.Group();g.add(this.cyl('#b8d7df',.8,.5,0,-.8));for(let i=0;i<5;i++)g.add(this.ball('#dcf8ff',.12+(i%2)*.06,Math.sin(i)*.4,-.6+i*.32,Math.cos(i)*.4));g.position.set(p.x,0,p.z);this.dynamicRoot.add(g);});
      l.turtles.forEach(p=>{const g=this.turtle();this.node('turtle','Sea turtle · ride for 45 seconds','🐢',p.id,p.x,p.z,1.3,g);this.turtles.set(p.id,g);});
      l.bubbles.slice(0,12).forEach((p,index)=>{const g=new T.Group();const shell=this.ball('#c3a0d4',.6,0,-.5);shell.scale.y=.45;g.add(shell,this.ball('#fff0d2',.2,0,-.25));this.node('clam','Pearl clam','🐚',index,p.x+2.3,p.z+.8,.8,g);});
    }
    if(l.planet==='cloud'){
      this.staticRoot.add(this.disk('#e1f3ff',220,0,0,-12));
      l.links.forEach((link,index)=>{for(const [side,p] of [link.a,link.b].entries()){const g=new T.Group();for(let i=0;i<5;i++){const ball=this.ball('#f8fcff',.8,Math.cos(i*1.256)*.42,.28,Math.sin(i*1.256)*.42);ball.scale.y=.5;g.add(ball);}const arrow=this.cyl('#f4ce65',.38,.13,0,.55,0,0);arrow.rotation.z=Math.PI/2;g.add(arrow);g.userData.bounceTo=side===0?link.b:link.a;this.node('bounce','Bounce cloud · cross to the next island','☁️',index*2+side,p.x,p.z,1.15,g);}});
    }
    if(l.planet==='lava'){
      this.nestSea=this.disk('#ff7540',l.nest.r+1.5,l.nest.x,l.nest.z,-.9);this.dynamicRoot.add(this.nestSea);
      for(const island of l.nestIslands)this.staticRoot.add(this.cyl('#90767a',island.r,.7,island.x,.1,island.z,island.r));
      for(const pool of l.pools){const p=this.disk('#ff632e',pool.r,pool.x,pool.z,tideHeight(0));this.dynamicRoot.add(p);this.pools.push(p);}
      for(const pool of l.pools){const raft=new T.Group();for(let i=-2;i<=2;i++)raft.add(this.box('#b48c60',.45,.24,2.5,i*.5,-.1));for(const z of [-.9,.9])raft.add(this.box('#dcc895',2.5,.12,.14,0,.06,z));this.dynamicRoot.add(raft);this.rafts[pool.id]=raft;}
      for(const stone of l.stones){const top=stone.height??0;this.staticRoot.add(this.cyl(top>-.3?'#b09f8d':'#786777',stone.r,1.2+top,stone.x,(-1.2+top)/2,stone.z,stone.r*.85));}
      for(const mesa of l.mesas){this.staticRoot.add(this.cyl('#766571',mesa.r,1.5,mesa.x,.75,mesa.z,mesa.r));for(let j=0;j<4;j++)this.staticRoot.add(this.box('#9c827e',2,.3+j*.3,1.1,mesa.x, (.3+j*.3)/2,mesa.z+mesa.r+1.1-j*.7));}
      for(const vent of l.vents){this.staticRoot.add(this.cyl('#554755',1.5,.8,vent.x,.4,vent.z,1));const ring=this.disk('#fa6851',vent.r,vent.x,vent.z,.045);const fire=this.flame();fire.position.set(vent.x,0,vent.z);fire.scale.set(5,3,5);this.dynamicRoot.add(ring,fire);this.vents.push({ring,fire,id:vent.id});}
      this.staticRoot.add(this.disk('#3c3549',l.cave.r,l.cave.x,l.cave.z,.025));
      for(let i=0;i<36;i++){const angle=i*Math.PI/18;if(Math.abs(angle-Math.PI/2)<.23)continue;const x=l.cave.x+Math.cos(angle)*l.cave.r,z=l.cave.z+Math.sin(angle)*l.cave.r;const rock=this.ball('#4e435d',1.5,x,1.3,z);rock.scale.y=1.8;this.staticRoot.add(rock);this.colliders.push({x,z,r:1.2});}
      const gate=new T.Group();gate.add(this.ball('#746980',2,0,1.1),this.crystal('#a391bb',.7));this.node('cave-gate','Obsidian cave gate · break the stone','🪨',0,l.cave.gate.x,l.cave.gate.z,2,gate);this.colliders.push({...l.cave.gate,r:2,tag:'cave-gate'});
      const chest=new T.Group();chest.add(this.box('#a58b57',1.5,.9,1,0,.45),this.box('#edc964',.2,1.0,1.05,0,.5));this.node('cave-chest','Ancient cave chest','🧰',0,l.cave.x,l.cave.z-8,1,chest);
      [[l.cave.x-5,l.cave.gate.z+4],[l.cave.x+5,l.cave.gate.z+4],[l.cave.x-7,l.cave.z],[l.cave.x+6,l.cave.z-4],[l.cave.x-4,l.cave.z-6]].forEach(([x,z],index)=>this.node('fire-crystal','Fire crystal vein','🔶',index,x,z,.9,this.crystal('#ffc977')));
      for(let i=0;i<40;i++){const magma=i<18,index=magma?i:i-18,angle=i*2.399,r=30+Math.sqrt((i+.5)/40)*93,x=Math.cos(angle)*r,z=Math.sin(angle)*r;if(l.pools.some(p=>Math.hypot(p.x-x,p.z-z)<p.r+2)||Math.hypot(x-l.cave.x,z-l.cave.z)<l.cave.r+4)continue;const ore=this.crystal(magma?'#ffb769':'#8773b9',.65);this.node(magma?'magma-ore':'obsidian-ore',magma?'Magma ore · three strikes':'Obsidian ore · four strikes','⛏️',index,x,z,1,ore);}
      const furnace=new T.Group();furnace.add(this.box('#655669',3.4,3,2.3,0,1.5),this.box('#44394d',1.4,1.8,.15,0,1.0,1.23),this.cyl('#796a7f',.7,2,0,3.8),this.flame());this.node('furnace','Ancient furnace','🔥',0,l.furnace.x,l.furnace.z,2,furnace);this.colliders.push({...l.furnace,r:1.8});
      l.braziers.forEach((p,index)=>{const g=new T.Group();g.add(this.cyl('#776576',.45,.8,0,.4),this.cyl('#9d7a5d',.75,.22,0,.91,.0,.6));const flame=this.flame();flame.position.y=1;g.add(flame);this.node('brazier','Ancient brazier · 1 fire crystal','🕯️',index,p.x,p.z,.9,g);this.colliders.push({...p,r:.55});});
    }
    if(l.planet==='toy')for(const track of l.tracks){
      for(const offset of [-.6,.6]){const rail=this.mesh(new T.TorusGeometry(track.r+offset,.065,4,96),'#8c9bab',track.x,.09,track.z);rail.rotation.x=Math.PI/2;this.staticRoot.add(rail);}
      for(let j=0;j<Math.ceil(track.r*5);j++){const a=j/(track.r*5)*Math.PI*2,beam=this.box('#b79979',1.6,.13,.22,track.x+Math.cos(a)*track.r,.07,track.z+Math.sin(a)*track.r);beam.rotation.y=-a;this.staticRoot.add(beam);}
      for(let car=0;car<4;car++){const g=new T.Group(),color=['#ee626d','#f7ce5c','#72b3e5','#9dd197'][car];g.add(this.box(color,1.6,1.2,2,0,.8),this.box('#f4e9ce',1.65,.15,2.1,0,1.5));if(car===0)g.add(this.cyl('#676475',.22,.9,0,1.65,.7));for(const x of [-.85,.85])for(const z of [-.65,.65]){const wheel=this.cyl('#58576b',.32,.18,x,.3,z);wheel.rotation.z=Math.PI/2;g.add(wheel);}this.dynamicRoot.add(g);this.trains.push({mesh:g,track:track.id,car});}
    }
    if(l.planet==='jungle'){
      l.poison.forEach(p=>{this.staticRoot.add(this.disk('#9869bf',p.r,p.x,p.z));for(let j=0;j<6;j++){const shroom=this.ball('#b19bde',.35,p.x+Math.sin(j)*p.r*.65,.2,p.z+Math.cos(j)*p.r*.65);shroom.scale.y=.5;this.staticRoot.add(shroom);}});
      l.thorns.forEach((wall,index)=>{const g=new T.Group();for(let i=-3;i<=3;i++){const spike=this.cyl('#648344',.32,2.2,i,1.1,0,0);spike.rotation.z=i%2*.35;g.add(spike);g.add(this.box('#80674c',.9,.22,.5,i,.65));}g.position.set(wall.x,0,wall.z);g.rotation.y=-wall.angle;this.dynamicRoot.add(g);this.thorns.push({group:g,index});});
      l.fruit.forEach(p=>{const g=new T.Group();g.add(this.cyl('#8f6b46',.25,2.2,0,1.1),this.ball('#55a45c',1.4,0,2.6));const fruits=new T.Group();fruits.name='fruit';for(let i=0;i<5;i++)fruits.add(this.ball('#f9b167',.24,Math.sin(i*1.25)*1.0,2.2,Math.cos(i*1.25)));g.add(fruits);this.node('fruit','Jungle fruit tree','🍈',p.id,p.x,p.z,1.4,g);this.colliders.push({...p,r:.4});});
    }
    if(l.planet==='shadow'){
      l.lamps.forEach(p=>{const g=new T.Group();g.add(this.cyl('#687386',.23,2.6,0,1.3),this.box('#99866c',.85,.7,.85,0,2.75),this.cyl('#766883',.65,.5,0,3.3,0,0));const glow=this.ball('#ffde8c',.32,0,2.8);glow.name='flame';g.add(glow);this.node('light-pillar','Light pillar · ignite for 150 seconds','🏮',p.id,p.x,p.z,1,g);this.lamps.set(p.id,g);this.colliders.push({...p,r:.35});});
      for(const flower of l.flowers){const g=this.crystal('#80dcd1',.28);g.position.set(flower.x,0,flower.z);this.staticRoot.add(g);}
    }
  }
  update(sim:EnvironmentSimulation){
    this.pools.forEach(p=>p.position.y=sim.lavaLevel);
    if(this.nestSea)this.nestSea.position.y=Math.max(sim.nestLevel,sim.lavaLevel);
    this.rafts.forEach((raft,index)=>{const p=raftPosition(this.layout.pools[index],sim.time);raft.position.set(p.x,p.y+sim.weather.tideOffset,p.z);});
    const drops=[...sim.fireRain.map(d=>({...d,radius:1.2,meteor:false,lightning:false})),...[...sim.weather.meteors,...sim.weather.fireballs].map(d=>({...d,remaining:d.duration-d.age,meteor:d.kind==='meteor',lightning:false})),...sim.lightning.bolts.map(d=>({...d,radius:1.8,meteor:false,lightning:true}))];
    const activeRain=new Set(drops.map(p=>p.id));
    for(const [id,mesh] of this.rain)if(!activeRain.has(id)){this.dynamicRoot.remove(mesh);mesh.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});this.rain.delete(id);}
    for(const drop of drops){let g=this.rain.get(drop.id);if(!g){g=new T.Group();const ring=this.disk(drop.lightning?'#fff28c':'#ffbc53',drop.radius,0,0,.06),fire=drop.lightning?this.box('#ffffb5',.14,2.4,.14,0,6):this.ball(drop.meteor?'#cc674a':'#ff873f',drop.meteor?.7:.24,0,6);if(drop.lightning){fire.rotation.z=.2;fire.add(this.box('#ffffff',.14,1.6,.14,.35,-1.5));}fire.name='falling-fire';g.add(ring,fire);this.dynamicRoot.add(g);this.rain.set(drop.id,g);}g.position.set(drop.x,terrainHeight(this.layout,drop),drop.z);const progress=1-drop.remaining/drop.duration,remaining=1-progress*progress;g.getObjectByName('falling-fire')!.position.set(drop.meteor?-14*remaining:0,remaining*(drop.meteor?34:7),drop.meteor?-10*remaining:0);}
    for(const item of this.vents){const vent=this.layout.vents[item.id],phase=ventPhase(sim.time,vent.phase,sim.ventPeriod);item.ring.visible=phase==='warning';item.ring.scale.setScalar(.94+Math.sin(sim.time*8)*.06);item.fire.visible=phase==='eruption';item.fire.scale.y=2.5+Math.sin(sim.time*18)*.5;}
    for(const item of this.trains){const p=trainPosition(this.layout.tracks[item.track],sim.time,item.car);item.mesh.position.set(p.x,.05,p.z);item.mesh.rotation.y=p.facing;}
    for(const item of this.thorns){const raised=thornRaised(sim.time,this.layout.thorns[item.index].phase);item.group.scale.y=raised?1:.05;item.group.visible=raised;}
    for(const [id,mesh] of this.lamps){const flame=mesh.getObjectByName('flame');if(flame)flame.visible=(sim.lamps.get(id)??0)>sim.time;}
    for(const [id,mesh] of this.turtles){const home=this.layout.turtles[id],angle=sim.time*.15+id*1.3;mesh.position.set(home.x+Math.cos(angle)*6,-.45+Math.sin(sim.time*2+id)*.05,home.z+Math.sin(angle)*6);mesh.rotation.y=-angle;}
  }
}

