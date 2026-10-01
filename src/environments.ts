import { t } from './i18n.ts';
import type {PlanetId} from './model.ts';
import type {Point,Obstacle} from './navigation.ts';
import {LavaWeather,lavaEvent,LAVA_EVENT_INFO} from './lava-weather.ts';

export interface Circle extends Point {r:number;id:number;height?:number}
export interface Link {a:Point;b:Point}
export interface EnvironmentLayout {
  planet:PlanetId;islands:Circle[];links:Link[];pools:Circle[];stones:Circle[];mesas:Circle[];
  vents:Array<Circle&{phase:number}>;tracks:Array<Circle&{speed:number}>;
  thorns:Array<Circle&{angle:number;phase:number}>;poison:Circle[];fruit:Circle[];lamps:Circle[];flowers:Circle[];bubbles:Circle[];turtles:Circle[];
  cave:{x:number;z:number;r:number;gate:Point};furnace:Point;braziers:Point[];nest:Circle;nestIslands:Circle[];
}
export interface EnvironmentTraits {speed:number;maxHp:number;fireResistance?:number;poisonImmune?:boolean;flippers?:boolean;featherFall?:boolean;lightRadius?:number;flying?:boolean}
export interface EnvironmentActor extends Point {id:string;hp:number;maxHp:number;boss:boolean;flying?:boolean;lavaImmune?:boolean}
export interface EnvironmentStatus {label:string;value:string;icon?:string;fraction?:number}
export interface EnvironmentEvent {kind:string;message?:string;id?:string}
export interface LightningState {wait:number;sequence:number;bolts:Array<Point&{id:string;remaining:number;duration:number}>}
export interface EnvironmentStep {motion:Point;push:Point;y:number;relocate?:Point&{y?:number};damage:number;heal:number;enemyHits:Array<{id:string;amount:number}>;enemyPushes:Array<{id:string;x:number;z:number}>;events:EnvironmentEvent[];airborne:boolean;dragonSummon?:boolean;dragonDismiss?:boolean}
const length=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
function rng(seed:number){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function scatter(count:number,seed:number,minDistance=25,spacing=12):Circle[]{
  const random=rng(seed),result:Circle[]=[];
  for(let attempt=0;result.length<count&&attempt<20000;attempt++){
    const angle=random()*Math.PI*2,distance=minDistance+(128-minDistance)*Math.sqrt(random()),candidate={x:Math.cos(angle)*distance,z:Math.sin(angle)*distance,r:1,id:result.length};
    if(result.every(p=>length(p,candidate)>spacing))result.push(candidate);
  }return result;
}
function islandField(count:number,seed:number,padRadius:number):Circle[]{
  const random=rng(seed),result:Circle[]=[{x:0,z:0,r:padRadius,id:0,height:0}];
  for(let attempt=0;result.length<count&&attempt<30000;attempt++){
    const angle=random()*Math.PI*2,distance=30+98*Math.sqrt(random()),r=8+random()*7,point={x:Math.cos(angle)*distance,z:Math.sin(angle)*distance,r,id:result.length,height:0};
    if(result.every(other=>length(other,point)>other.r+r+6))result.push(point);
  }return result;
}
function islandLinks(islands:Circle[]):Link[]{
  const connected=new Set([0]),links:Link[]=[];
  while(connected.size<islands.length){
    let best:{from:number;to:number;distance:number}|undefined;
    for(const from of connected)for(let to=1;to<islands.length;to++)if(!connected.has(to)){
      const distance=length(islands[from],islands[to])-islands[from].r-islands[to].r;
      if(!best||distance<best.distance)best={from,to,distance};
    }
    if(!best)break;connected.add(best.to);
    const a=islands[best.from],b=islands[best.to],distance=length(a,b),dx=(b.x-a.x)/distance,dz=(b.z-a.z)/distance;
    links.push({a:{x:a.x+dx*(a.r-2),z:a.z+dz*(a.r-2)},b:{x:b.x-dx*(b.r-2),z:b.z-dz*(b.r-2)}});
  }return links;
}
export function createEnvironmentLayout(planet:PlanetId):EnvironmentLayout{
  const layout:EnvironmentLayout={planet,islands:[],links:[],pools:[],stones:[],mesas:[],vents:[],tracks:[],thorns:[],poison:[],fruit:[],lamps:[],flowers:[],bubbles:[],turtles:[],cave:{x:-72,z:-59,r:13,gate:{x:-72,z:-46}},furnace:{x:62,z:-62},braziers:[{x:55.5,z:-62},{x:62,z:-68.5},{x:68.5,z:-62}],nest:{x:-96,z:58,r:21,id:0},nestIslands:[]};
  if(planet==='ocean'||planet==='cloud'){
    layout.islands=islandField(planet==='ocean'?18:26,planet==='ocean'?88419:75632,planet==='ocean'?16:17);
    if(planet==='cloud')layout.links=islandLinks(layout.islands);
    else {
      const water=scatter(90,43821,21,12).filter(p=>!layout.islands.some(i=>length(i,p)<i.r+7));
      layout.bubbles=water.slice(0,16).map((p,id)=>({...p,r:2.5,id}));
      layout.turtles=water.slice(18,25).map((p,id)=>({...p,r:1.2,id}));
    }
  }
  if(planet==='lava'){
    layout.pools=[{x:36,z:38,r:22,id:0},{x:-45,z:27,r:24,id:1},{x:45,z:-12,r:17,id:2},{x:-22,z:-86,r:23,id:3},{x:94,z:50,r:21,id:4}];
    for(const pool of layout.pools)for(let i=-3;i<=3;i++)layout.stones.push({x:pool.x+i*(pool.r/3.6),z:pool.z+Math.sin(i)*1.8,r:1.8,id:layout.stones.length,height:i%2===0?-.25:-.64});
    layout.mesas=scatter(12,65191,25,18).filter(p=>!layout.pools.some(i=>length(i,p)<i.r+5)).map((p,id)=>({...p,r:5.5,id,height:1.5}));
    layout.vents=[{x:24,z:-36,r:5.5,id:0,phase:110},{x:-28,z:-24,r:5.5,id:1,phase:57},{x:77,z:15,r:5.5,id:2,phase:9},{x:-82,z:22,r:5.5,id:3,phase:94},{x:12,z:90,r:5.5,id:4,phase:25},{x:88,z:-81,r:5.5,id:5,phase:130}];
    layout.nestIslands.push({...layout.nest,r:4.5,height:.45});
    for(let i=0;i<10;i++){const angle=i*Math.PI/5,d=i%2?16.5:10.5;layout.nestIslands.push({x:layout.nest.x+Math.cos(angle)*d,z:layout.nest.z+Math.sin(angle)*d,r:2.1+(i%3)*.35,id:i+1,height:.45});}
    for(const [angle,d] of [[.5,13],[2.6,12],[4.4,14]])layout.mesas.push({x:layout.nest.x+Math.cos(angle)*d,z:layout.nest.z+Math.sin(angle)*d,r:2.2,id:layout.mesas.length,height:1.5});
  }
  if(planet==='toy')layout.tracks=[{x:-46,z:-33,r:22,id:0,speed:7},{x:51,z:-36,r:27,id:1,speed:8},{x:9,z:70,r:30,id:2,speed:9}];
  if(planet==='jungle'){
    layout.thorns=scatter(16,97632,26,14).map((p,id)=>({...p,r:3.8,angle:id*1.71,phase:id*2.17}));
    layout.poison=scatter(8,87356,24,20).map((p,id)=>({...p,r:4.5+(id%4)*.8}));
    layout.fruit=scatter(12,77937,24,12);
  }
  if(planet==='shadow'){
    layout.lamps=scatter(18,54467,22,18).map(p=>({...p,r:8}));
    layout.flowers=scatter(44,44713,18,7).map(p=>({...p,r:2.4}));
  }
  return layout;
}

export function zoneAt(point:Point):'home'|'forest'|'meadow'|'swamp'|'canyon'{
  if(Math.hypot(point.x,point.z)<18)return 'home';
  return Math.abs(point.x)>Math.abs(point.z)?point.x>0?'canyon':'forest':point.z>0?'meadow':'swamp';
}
export function tideHeight(time:number){return -.82+.42*(.5+.5*Math.sin(time*Math.PI/50));}
export function ventPhase(time:number,phase=0,period=140):'idle'|'warning'|'eruption'{const t=((time+phase)%period+period)%period;return t>=period-4&&t<period-1?'eruption':t>=period-9&&t<period-4?'warning':'idle';}
export function thornRaised(time:number,phase=0){return ((time+phase)%36+36)%36<16;}
export function trainPosition(track:Circle&{speed:number},time:number,car=0):Point&{facing:number}{const angle=time*track.speed/track.r-car*2.4/track.r;return {x:track.x+Math.cos(angle)*track.r,z:track.z+Math.sin(angle)*track.r,facing:-angle+Math.PI/2};}
export function raftPosition(pool:Circle,time:number):Point&{y:number}{const phase=(time+pool.id*2)%12,t=phase<2?0:phase<6?(phase-2)/4:phase<8?1:1-(phase-8)/4,smooth=t*t*(3-2*t);return {x:pool.x+(smooth*2-1)*(pool.r+1),z:pool.z+5,y:tideHeight(time)+.28};}
export function terrainHeight(layout:EnvironmentLayout,point:Point):number{
  if(layout.planet==='cloud')return layout.islands.some(i=>length(i,point)<i.r)?0:-30;
  if(layout.planet==='ocean')return layout.islands.some(i=>length(i,point)<i.r)?0:-1.1;
  if(layout.planet==='lava'){
    const stone=layout.stones.find(i=>length(i,point)<i.r);if(stone)return stone.height??0;
    const mesa=layout.mesas.find(i=>length(i,point)<i.r);if(mesa)return mesa.height??1.5;
    const island=layout.nestIslands.find(i=>length(i,point)<i.r);if(island)return island.height??.45;
    if(length(layout.nest,point)<layout.nest.r)return -.25;
    if(layout.pools.some(i=>length(i,point)<i.r))return -1.1;
  }return 0;
}
export function environmentWalkable(layout:EnvironmentLayout,point:Point){return layout.planet!=='cloud'||terrainHeight(layout,point)>-2;}
export function inWater(layout:EnvironmentLayout,point:Point){return layout.planet==='ocean'&&terrainHeight(layout,point)<-.3;}

export class EnvironmentSimulation {
  time=0;velocity:Point={x:0,z:0};oxygen=100;rideUntil=0;lamps=new Map<number,number>();eclipseUntil=0;
  weather=new LavaWeather();authoritative=true;nearbyPlayers=1;weatherBlocked?:(x:number,z:number,radius:number)=>boolean;
  fireRain:Array<Point&{id:string;remaining:number;duration:number}>=[];
  lightning:LightningState={wait:6,sequence:0,bolts:[]};
  nestLevel=-.9;dragonPhase=0;
  lastSafe:Point={x:0,z:3.6};flight:null|{from:Point;to:Point;t:number;duration:number;height:number;fall?:boolean}=null;
  private timers=new Map<string,number>();private warnings=new Map<string,string>();
  layout:EnvironmentLayout;
  constructor(layout:EnvironmentLayout){this.layout=layout;}
  get riding(){return this.time<this.rideUntil;}
  get airborne(){return this.flight!==null;}
  get lavaLevel(){return tideHeight(this.time)+this.weather.tideOffset;}
  lavaAt(point:Point){return this.layout.planet==='lava'&&terrainHeight(this.layout,point)<this.lavaLevelAt(point)-.03;}
  lavaLevelAt(point:Point){return length(this.layout.nest,point)<this.layout.nest.r+1.5?Math.max(this.nestLevel,this.lavaLevel):this.lavaLevel;}
  addFireRain(point:Point,id:string,delay=1.1){if(terrainHeight(this.layout,point)>.9||this.lavaAt(point)||this.fireRain.some(p=>p.id===id))return false;this.fireRain.push({...point,id,remaining:delay,duration:delay});return true;}
  get ventPeriod(){return lavaEvent(this.time).id==='eruption'?50:140;}
  lightPillar(index:number){this.lamps.set(index,this.time+150);}
  inLight(point:Point){return this.layout.lamps.some(l=>(this.lamps.get(l.id)??0)>this.time&&length(l,point)<l.r);}
  revealed(point:Point,player:Point,radius=3.6){return length(point,player)<(this.time<this.eclipseUntil?1.6:radius)+.5||this.inLight(point)||this.layout.flowers.some(p=>length(p,point)<p.r);}
  launch(from:Point,to:Point){const distance=length(from,to);this.flight={from:{...from},to:{...to},t:0,duration:Math.min(2.2,Math.max(.9,distance/14)),height:3+distance*.15};}
  dynamicObstacles():Obstacle[]{
    return this.layout.thorns.flatMap(w=>thornRaised(this.time,w.phase)?[-3,-1.5,0,1.5,3].map(t=>({x:w.x+Math.cos(w.angle)*t,z:w.z+Math.sin(w.angle)*t,r:.75})):[]);
  }
  enemyLightObstacles():Obstacle[]{return this.layout.lamps.filter(l=>(this.lamps.get(l.id)??0)>this.time).map(l=>({x:l.x,z:l.z,r:l.r}));}
  private tick(key:string,period:number,dt:number){const remaining=(this.timers.get(key)??0)-dt;if(remaining<=0){this.timers.set(key,period);return true;}this.timers.set(key,remaining);return false;}
  private warning(key:string,value:string,message:string,events:EnvironmentEvent[]){if(this.warnings.get(key)!==value){this.warnings.set(key,value);if(value==='warning')events.push({kind:key,message:t(message)});}}
  step(dt:number,player:Point&{y?:number},input:Point,traits:EnvironmentTraits,enemies:EnvironmentActor[]):EnvironmentStep{
    const previousTime=this.time;
    this.time+=dt;
    const out:EnvironmentStep={motion:{x:0,z:0},push:{x:0,z:0},y:terrainHeight(this.layout,player),damage:0,heal:0,enemyHits:[],enemyPushes:[],events:[],airborne:false};
    let speed=traits.speed;
    const swimming=inWater(this.layout,player)&&!traits.flying;
    if(swimming){speed*=this.riding?1.35:traits.flippers?1:.6;out.y=-.48;}
    if(this.layout.planet==='ice'&&Math.hypot(player.x,player.z)>13&&!traits.flying){
      const amount=1-Math.exp(-dt*(Math.hypot(input.x,input.z)>0?2.8:1.6));
      this.velocity.x+=(input.x*speed-this.velocity.x)*amount;this.velocity.z+=(input.z*speed-this.velocity.z)*amount;
      out.motion={x:this.velocity.x*dt,z:this.velocity.z*dt};
    }else{this.velocity={x:input.x*speed,z:input.z*speed};out.motion={x:this.velocity.x*dt,z:this.velocity.z*dt};}
    if(this.flight){
      const flight=this.flight;flight.t+=dt;const progress=Math.min(1,flight.t/flight.duration);out.airborne=true;out.motion={x:0,z:0};
      if(flight.fall){out.relocate={x:flight.from.x,z:flight.from.z,y:-22*progress*progress};if(progress===1){out.relocate={...this.lastSafe,y:0};if(!traits.featherFall)out.damage+=traits.maxHp*.12;out.events.push({kind:'fall',message:t(traits.featherFall?'Your cloud gear carries you safely back.':'You fell! Returned to the last safe platform.')});}}
      else out.relocate={x:flight.from.x+(flight.to.x-flight.from.x)*progress,z:flight.from.z+(flight.to.z-flight.from.z)*progress,y:Math.sin(Math.PI*progress)*flight.height};
      if(progress===1){this.flight=null;this.lastSafe={...flight.to};}return out;
    }
    if(this.layout.planet==='lava'){
      this.nestLevel+=((this.dragonPhase>=3?.32:this.dragonPhase===2?-.05:-.9)-this.nestLevel)*Math.min(1,dt*.35);
      const height=terrainHeight(this.layout,player),resistance=1-Math.max(0,Math.min(1,traits.fireResistance??0));
      const previousEvent=this.weather.snapshot().eventKey,weather=this.weather.step(dt,player,(x,z)=>terrainHeight(this.layout,{x,z}),{time:this.time,blocked:this.weatherBlocked,vents:this.layout.vents,nearbyPlayers:this.nearbyPlayers,authority:this.authoritative});
      out.dragonDismiss=this.authoritative&&weather.changed&&previousEvent.endsWith(':dragon');
      if(weather.changed)out.events.push({kind:'weather',message:t('{icon} {name}: {count} seconds remaining.', { icon: LAVA_EVENT_INFO[weather.event.id].icon, name: t(LAVA_EVENT_INFO[weather.event.id].name), count: Math.ceil(weather.event.left) })});out.dragonSummon=weather.dragonSummon;
      for(const impact of weather.impacts){if(length(player,impact)<impact.radius&&!traits.flying)out.damage+=traits.maxHp*impact.playerFraction*resistance;for(const enemy of enemies)if(enemy.hp>0&&length(enemy,impact)<impact.radius)out.enemyHits.push({id:enemy.id,amount:enemy.maxHp*impact.enemyFraction});}
      let onRaft=false;
      for(const pool of this.layout.pools){const previous=raftPosition(pool,previousTime);if(length(player,previous)<1.3){const next=raftPosition(pool,this.time);out.push.x+=next.x-previous.x;out.push.z+=next.z-previous.z;out.y=next.y+this.weather.tideOffset;onRaft=true;break;}}
      if(!traits.flying&&!onRaft&&this.lavaAt(player)&&this.tick('lava',.5,dt))out.damage+=traits.maxHp*.07*resistance;
      for(const enemy of enemies)if(enemy.hp>0&&!enemy.flying&&!enemy.lavaImmune&&this.lavaAt(enemy)&&this.tick('lava-enemy-'+enemy.id,.5,dt))out.enemyHits.push({id:enemy.id,amount:enemy.maxHp*(enemy.boss?.02:.09)});
      for(const vent of this.layout.vents){
        const phase=ventPhase(this.time,vent.phase,this.ventPeriod);this.warning('vent-'+vent.id,phase,'Volcano warning! Leave the red circle or reach high ground.',length(player,vent)<35?out.events:[]);
        if(phase==='eruption'&&this.tick('eruption-'+vent.id,.5,dt)){
          if(length(player,vent)<vent.r&&height<.9&&!traits.flying)out.damage+=traits.maxHp*.14*resistance;
          for(const e of enemies)if(e.hp>0&&length(e,vent)<vent.r&&terrainHeight(this.layout,e)<.9)out.enemyHits.push({id:e.id,amount:e.maxHp*(e.boss?.03:.14)});
        }
        if(phase==='eruption'&&this.tick('rain-'+vent.id,.3,dt)){
          const sequence=Math.floor(this.time/.3),random=rng(sequence*9743+vent.id*1351),angle=random()*Math.PI*2,distance=3+random()*11,p={x:vent.x+Math.cos(angle)*distance,z:vent.z+Math.sin(angle)*distance};
          if(terrainHeight(this.layout,p)<.9&&terrainHeight(this.layout,p)>tideHeight(this.time))this.fireRain.push({...p,id:vent.id+':'+sequence,remaining:.8,duration:.8});
        }
      }
      for(let i=this.fireRain.length-1;i>=0;i--){const rain=this.fireRain[i];rain.remaining-=dt;if(rain.remaining>0)continue;
        if(length(player,rain)<1.4&&height<.9&&!traits.flying)out.damage+=traits.maxHp*.12*resistance;
        for(const enemy of enemies)if(enemy.hp>0&&length(enemy,rain)<1.3&&!enemy.flying)out.enemyHits.push({id:enemy.id,amount:enemy.maxHp*.1});
        this.fireRain.splice(i,1);
      }
    }
    if(this.layout.planet==='toy')for(const track of this.layout.tracks)for(let car=0;car<4;car++){
      const point=trainPosition(track,this.time,car);
      if(length(point,player)<1.5&&this.tick('train-player',1,dt)){out.damage+=traits.maxHp*.15;const d=Math.max(.01,length(player,track));out.push.x+=(player.x-track.x)/d*2.2;out.push.z+=(player.z-track.z)/d*2.2;}
      for(const e of enemies)if(e.hp>0&&length(e,point)<1.4&&this.tick('train-'+e.id,1,dt))out.enemyHits.push({id:e.id,amount:e.maxHp*(e.boss?.04:.3)});
    }
    if(this.layout.planet==='jungle'){
      const poisoned=this.layout.poison.some(p=>length(p,player)<p.r);
      if(poisoned&&!traits.poisonImmune&&!traits.flying&&this.tick('poison',.6,dt))out.damage+=traits.maxHp*.035;
      if(this.dynamicObstacles().some(p=>length(p,player)<p.r+.65)&&!traits.flying&&this.tick('thorn',.6,dt))out.damage+=traits.maxHp*.05;
    }
    if(this.layout.planet==='ocean'){
      const bubbles=this.layout.bubbles.some(p=>length(player,p)<p.r);
      if(!swimming)this.oxygen=Math.min(100,this.oxygen+45*dt);
      else if(bubbles)this.oxygen=Math.min(100,this.oxygen+60*dt);
      else if(!this.riding)this.oxygen=Math.max(0,this.oxygen-(traits.flippers?4:8)*dt);
      if(this.oxygen<=0&&this.tick('oxygen',.5,dt))out.damage+=traits.maxHp*.06;
    }
    if(this.layout.planet==='cloud'){
      this.lightning.wait=Math.max(0,this.lightning.wait-dt);
      for(let i=this.lightning.bolts.length-1;i>=0;i--){const bolt=this.lightning.bolts[i];bolt.remaining-=dt;if(bolt.remaining>0)continue;if(!traits.flying&&length(player,bolt)<1.8)out.damage+=traits.maxHp*.12;for(const e of enemies)if(e.hp>0&&length(e,bolt)<1.8)out.enemyHits.push({id:e.id,amount:e.maxHp*.2});this.lightning.bolts.splice(i,1);}
      if(this.lightning.wait===0&&this.authoritative){const random=rng(++this.lightning.sequence*85717),angle=random()*Math.PI*2,r=2+random()*7,point={x:player.x+Math.cos(angle)*r,z:player.z+Math.sin(angle)*r};this.lightning.wait=7+random()*6;if(environmentWalkable(this.layout,point)){this.lightning.bolts.push({...point,id:'cloud:bolt:'+this.lightning.sequence,remaining:1.2,duration:1.2});out.events.push({kind:'lightning',message:t('Lightning is gathering! Leave the yellow circle.')});}}
      if(!environmentWalkable(this.layout,player)&&!traits.flying){this.flight={from:{...player},to:{...this.lastSafe},t:0,duration:.8,height:0,fall:true};out.motion={x:0,z:0};}
      else if(this.layout.islands.some(i=>length(i,player)<i.r-1.5))this.lastSafe={...player};
      const cycle=Math.floor(this.time/25),phase=this.time%25,angle=cycle*2.399;
      this.warning('gust',phase>=18&&phase<20?'warning':'idle','Wind is gathering. Stay away from platform edges!',out.events);
      if(phase>=20&&phase<23.5){
        out.push.x+=Math.cos(angle)*3.2*dt;out.push.z+=Math.sin(angle)*3.2*dt;
        for(const e of enemies)if(e.hp>0&&!e.flying&&!e.boss)out.enemyPushes.push({id:e.id,x:Math.cos(angle)*3.2*dt,z:Math.sin(angle)*3.2*dt});
      }
      for(const e of enemies)if(e.hp>0&&!e.flying&&!e.boss&&terrainHeight(this.layout,e)<-2)out.enemyHits.push({id:e.id,amount:e.maxHp});
    }
    if(this.layout.planet==='shadow'&&this.inLight(player))out.heal=traits.maxHp*.03*dt;
    return out;
  }
  status(point:Point):EnvironmentStatus[]{return this.statusSource(point).map(status=>({...status,label:t(status.label),value:t(status.value)}));}
  private statusSource(point:Point):EnvironmentStatus[]{
    switch(this.layout.planet){
      case 'ice':return[{icon:'❄️',label:'Ice',value:Math.hypot(point.x,point.z)>13?'Slippery — release early to brake':'Safe landing pad'}];
      case 'lava':return[{icon:'🌋',label:'Lava tide',value:tideHeight(this.time+1)>tideHeight(this.time)?'Rising — use high stones':'Falling',fraction:(tideHeight(this.time)+.82)/.42},(()=>{const event=lavaEvent(this.time),info=LAVA_EVENT_INFO[event.id];return{icon:info.icon,label:'Weather',value:t('{name} · {count} seconds', { name: t(info.name), count: Math.ceil(event.left) })};})()];
      case 'toy':return[{icon:'🚂',label:'Toy railway',value:'Moving trains hurt explorers and creatures'}];
      case 'jungle':return[{icon:'🌿',label:'Jungle',value:this.layout.poison.some(p=>length(p,point)<p.r)?'Poison gas! Leave the purple ground':'Thorn walls rise for 16 of every 36 seconds'}];
      case 'ocean':return[{icon:'🫧',label:'Oxygen',value:Math.ceil(this.oxygen)+'%',fraction:this.oxygen/100},...(this.riding?[{icon:'🐢',label:'Turtle ride',value:t('{count} seconds', { count: Math.ceil(this.rideUntil-this.time) })}]:[])];
      case 'cloud':return[{icon:'☁️',label:'Sky islands',value:this.flight?'Airborne':this.time%25>=20&&this.time%25<23.5?'Strong gust — watch the edge':'Use bounce clouds to cross gaps'}];
      case 'shadow':return[{icon:'🏮',label:'Light',value:this.inLight(point)?'Safe light — healing':'Light pillars reveal and repel shadow creatures'}];
      default:return[];
    }
  }
}
