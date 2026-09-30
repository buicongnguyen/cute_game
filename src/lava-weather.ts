/** Independent weather simulation using measured reference timings and reward facts.
 * Time is in seconds and is supplied by the shared environment clock.
 * Rendering, player damage and inventory transactions belong to the caller.
 */
export type LavaEventId = 'normal'|'eruption'|'meteor'|'storm'|'dragon'|'treasure';
export interface WeatherPoint {x:number;z:number}
export interface LavaEvent {id:LavaEventId;index:number;left:number;tideOffset:number}
export const LAVA_EVENT_WEIGHTS = {eruption:2,meteor:2,storm:1.5,dragon:1.5,treasure:1.5} as const;
export const LAVA_CYCLE_SECONDS=360,LAVA_ACTIVE_SECONDS=240;
function unit(seed:number){let value=Math.imul(seed^0x9e3779b9,0x85ebca6b);value^=value>>>13;value=Math.imul(value,0xc2b2ae35);return ((value^(value>>>16))>>>0)/4294967296;}
export function lavaEvent(timeSeconds:number):LavaEvent{
  const time=Number.isFinite(timeSeconds)?Math.max(0,timeSeconds):0,index=Math.floor(time/LAVA_CYCLE_SECONDS),phase=time-index*LAVA_CYCLE_SECONDS;
  if(phase>=LAVA_ACTIVE_SECONDS)return {id:'normal',index,left:LAVA_CYCLE_SECONDS-phase,tideOffset:0};
  let value=unit(index)*8.5,id:LavaEventId='treasure';
  for(const[key,weight]of Object.entries(LAVA_EVENT_WEIGHTS)){value-=weight;if(value<0){id=key as LavaEventId;break;}}
  return {id,index,left:LAVA_ACTIVE_SECONDS-phase,tideOffset:id==='storm'?.28:0};
}
export interface LavaMeteor extends WeatherPoint {id:string;kind:'meteor';y:number;age:number;duration:number;radius:number}
export interface LavaFireball extends WeatherPoint {id:string;kind:'fireball';y:number;age:number;duration:number;radius:number}
export interface LavaOre extends WeatherPoint {id:string;kind:'meteor'|'ore_magma';y:number;expiresAt:number}
export interface LavaImpact extends WeatherPoint {id:string;kind:'meteor'|'fireball';y:number;radius:number;playerFraction:number;enemyFraction:number;stun:number}
export interface WeatherOptions {time?:number;blocked?:(x:number,z:number,radius:number)=>boolean;vents?:WeatherPoint[];eligible?:boolean;authority?:boolean;nearbyPlayers?:number;forcedEvent?:LavaEventId}
export interface WeatherFrame {event:LavaEvent;changed:boolean;warnings:(LavaMeteor|LavaFireball)[];impacts:LavaImpact[];oreSpawns:LavaOre[];expiredOreIds:string[];dragonSummon:boolean}
export interface LavaWeatherSnapshot {time:number;tideOffset:number;seed:number;sequence:number;eventKey:string;meteorWait:number;stormWait:number;treasureWait:number;dragonSummoned:boolean;meteors:LavaMeteor[];fireballs:LavaFireball[];ores:LavaOre[]}
export const LAVA_ORE_RULES:Record<string,{hits:number;loot:[string,number,number,number][]}>={
  meteor:{hits:4,loot:[['mcrystal',1,2,4],['obsidian',.5,1,2],['firecore',.18,1,1],['starshard',.06,1,1]]},
  ore_magma:{hits:3,loot:[['mcrystal',1,2,3],['firecore',.05,1,1]]},
  ore_obsidian:{hits:4,loot:[['obsidian',1,1,2]]},
  ore_fire:{hits:2,loot:[['fcrystal',1,1,2]]},
};

export class LavaWeather {
  time=0;tideOffset=0;meteors:LavaMeteor[]=[];fireballs:LavaFireball[]=[];ores:LavaOre[]=[];
  private seed=739391;private sequence=0;private eventKey='';
  private meteorWait=2;private stormWait=3;private treasureWait=4;private dragonSummoned=false;
  private random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
  private nextId(kind:string){return `lava:${kind}:${Math.floor(this.time/360)}:${this.sequence++}`;}
  private addOre(kind:LavaOre['kind'],point:WeatherPoint,y:number,lifetime:number,id=this.nextId('ore')){
    const ore={id,kind,x:point.x,z:point.z,y,expiresAt:this.time+lifetime};this.ores.push(ore);return ore;
  }
  collectOre(id:string){const index=this.ores.findIndex(ore=>ore.id===id&&ore.expiresAt>this.time);if(index<0)return null;return this.ores.splice(index,1)[0];}
  step(dt:number,player:WeatherPoint,heightAt:(x:number,z:number)=>number,options:WeatherOptions={}):WeatherFrame{
    const elapsed=Number.isFinite(dt)?Math.max(0,dt):0;
    this.time=Number.isFinite(options.time)?Math.max(0,options.time!):this.time+elapsed;
    const event=lavaEvent(this.time);if(options.forcedEvent){event.id=options.forcedEvent;event.tideOffset=event.id==='storm'?.28:0;}
    const key=`${event.index}:${event.id}`,changed=key!==this.eventKey;
    if(changed){this.eventKey=key;this.dragonSummoned=false;this.meteorWait=2;this.stormWait=3;this.treasureWait=4;}
    this.tideOffset+=(event.tideOffset-this.tideOffset)*Math.min(1,elapsed*.5);
    const frame:WeatherFrame={event,changed,warnings:[],impacts:[],oreSpawns:[],expiredOreIds:[],dragonSummon:false};
    for(const list of [this.meteors,this.fireballs])for(let i=list.length-1;i>=0;i--){
      const warning=list[i];warning.age+=elapsed;if(warning.age+1e-9<warning.duration)continue;
      const meteor=warning.kind==='meteor';frame.impacts.push({id:warning.id,kind:warning.kind,x:warning.x,z:warning.z,y:warning.y,radius:warning.radius,playerFraction:meteor?.3:.1,enemyFraction:meteor?.35:.1,stun:meteor?6:0});
      if(meteor)frame.oreSpawns.push(this.addOre('meteor',warning,warning.y,90,warning.id));list.splice(i,1);
    }
    for(let i=this.ores.length-1;i>=0;i--)if(this.ores[i].expiresAt<=this.time){frame.expiredOreIds.push(this.ores[i].id);this.ores.splice(i,1);}
    const authoritative=options.authority!==false;
    const eligible=options.eligible!==false&&Math.hypot(player.x,player.z)>13;
    const valid=(point:WeatherPoint,radius:number)=>Number.isFinite(point.x)&&Number.isFinite(point.z)&&Math.hypot(point.x,point.z)>=13&&Math.hypot(point.x,point.z)<=136&&!options.blocked?.(point.x,point.z,radius)&&heightAt(point.x,point.z)<=.9;
    const nearby=(center:WeatherPoint,min:number,max:number)=>{const angle=this.random()*Math.PI*2,distance=min+this.random()*(max-min);return {x:center.x+Math.cos(angle)*distance,z:center.z+Math.sin(angle)*distance};};
    if(event.id==='meteor'&&eligible){
      this.meteorWait-=elapsed;
      if(this.meteorWait<=0&&authoritative){this.meteorWait=2.6+this.random()*2.4;for(let attempt=0;attempt<8;attempt++){const point=nearby(player,5,17);if(!valid(point,1.5))continue;const meteor:LavaMeteor={...point,id:this.nextId('meteor'),kind:'meteor',y:heightAt(point.x,point.z),age:0,duration:1.8,radius:2.6};this.meteors.push(meteor);frame.warnings.push({...meteor});break;}}
    }
    if(event.id==='storm'&&eligible){
      this.stormWait-=elapsed;
      if(this.stormWait<=0&&authoritative){this.stormWait=1.6+this.random()*1.5;const point=nearby(player,0,8);if(valid(point,1.2)){const fire:LavaFireball={...point,id:this.nextId('fire'),kind:'fireball',y:heightAt(point.x,point.z),age:0,duration:1,radius:1.4};this.fireballs.push(fire);frame.warnings.push({...fire});}}
    }
    if(event.id==='treasure'){
      this.treasureWait-=elapsed;
      if(this.treasureWait<=0&&authoritative){this.treasureWait=18;for(const vent of options.vents||[])if(Math.hypot(vent.x-player.x,vent.z-player.z)<=40)for(let i=0;i<2;i++){const point=nearby(vent,2.5,5.5);if(options.blocked?.(point.x,point.z,1))continue;frame.oreSpawns.push(this.addOre('ore_magma',point,heightAt(point.x,point.z),100));}}
    }
    if(authoritative&&!this.dragonSummoned&&(event.id==='dragon'||event.id!=='normal'&&(options.nearbyPlayers||1)>=3)){this.dragonSummoned=true;frame.dragonSummon=true;}
    return frame;
  }
  snapshot():LavaWeatherSnapshot{return {time:this.time,tideOffset:this.tideOffset,seed:this.seed,sequence:this.sequence,eventKey:this.eventKey,meteorWait:this.meteorWait,stormWait:this.stormWait,treasureWait:this.treasureWait,dragonSummoned:this.dragonSummoned,meteors:this.meteors.map(v=>({...v})),fireballs:this.fireballs.map(v=>({...v})),ores:this.ores.map(v=>({...v}))};}
  restore(snapshot:LavaWeatherSnapshot){
    if(!snapshot||!Number.isFinite(snapshot.time)||snapshot.time<0)return false;
    this.time=snapshot.time;this.tideOffset=Math.max(0,Math.min(.28,snapshot.tideOffset||0));this.seed=Number.isFinite(snapshot.seed)?snapshot.seed>>>0:739391;this.sequence=Number.isSafeInteger(snapshot.sequence)&&snapshot.sequence>=0?snapshot.sequence:0;this.eventKey=typeof snapshot.eventKey==='string'?snapshot.eventKey:'';
    this.meteorWait=Number.isFinite(snapshot.meteorWait)?snapshot.meteorWait:2;this.stormWait=Number.isFinite(snapshot.stormWait)?snapshot.stormWait:3;this.treasureWait=Number.isFinite(snapshot.treasureWait)?snapshot.treasureWait:4;this.dragonSummoned=snapshot.dragonSummoned===true;
    const point=(v:WeatherPoint&{id:string;y:number})=>v&&typeof v.id==='string'&&Number.isFinite(v.x)&&Number.isFinite(v.z)&&Number.isFinite(v.y);
    this.meteors=(Array.isArray(snapshot.meteors)?snapshot.meteors:[]).filter(v=>point(v)&&v.kind==='meteor'&&Number.isFinite(v.age)&&v.age>=0&&v.age<1.8).slice(0,50).map(v=>({...v,duration:1.8,radius:2.6}));
    this.fireballs=(Array.isArray(snapshot.fireballs)?snapshot.fireballs:[]).filter(v=>point(v)&&v.kind==='fireball'&&Number.isFinite(v.age)&&v.age>=0&&v.age<1).slice(0,50).map(v=>({...v,duration:1,radius:1.4}));
    this.ores=(Array.isArray(snapshot.ores)?snapshot.ores:[]).filter(v=>point(v)&&['meteor','ore_magma'].includes(v.kind)&&Number.isFinite(v.expiresAt)&&v.expiresAt>this.time).slice(0,150).map(v=>({...v}));return true;
  }
}



