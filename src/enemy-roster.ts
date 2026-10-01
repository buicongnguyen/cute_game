import {ENEMY_TYPES,HOME_SPAWNS,PLANET_SPAWNS,PLANET_BOSSES,FOREST_RAPTOR_COUNT} from './enemy-types.ts';
import {TITAN_BY_PLANET} from './titan-content.ts';
import {ZONE_DIFFICULTY} from './boss-patterns.ts';
import type {PlanetId} from './content.ts';

export interface EnemyRosterEntry {id:string;index:number;type:string;zone:string;baseMaxHp:number;baseDamage:number;xp:number;level:number;radius:number;boss:boolean;titan:boolean;dormant:boolean;respawn:number}
/** Shared ID ordering and initial combat facts. Placement is cosmetic; reward identity never comes from host input. */
export function enemyRoster(planet:PlanetId):EnemyRosterEntry[]{
  const entries:EnemyRosterEntry[]=[];
  const add=(type:string,zone:string=planet)=>{const d=ENEMY_TYPES[type];if(!d)return;const difficulty=ZONE_DIFFICULTY[zone]??1,scale=[1,1,1.7,2.6,3.6,4.8,6.2][Math.min(6,Math.max(0,difficulty))],index=entries.length,dormant=type==='dragon'||type==='minislime';entries.push({id:`${planet}:enemy:${index}`,index,type,zone,baseMaxHp:Math.round(d.hp*scale*(d.titan?7:d.boss&&type!=='dragon'?2.6:1)),baseDamage:d.damage*scale*(d.titan?1.6:d.boss?1.35:1),xp:Math.round(d.xp*(.6+scale*.4)),level:difficulty*3-2+(d.boss?6:0),radius:d.radius,boss:d.boss,titan:!!d.titan,dormant,respawn:dormant?999999:d.titan?600:d.boss?90:22});};
  if(planet==='home'){for(const[zone,spawns]of Object.entries(HOME_SPAWNS))for(const[type,count]of spawns)for(let i=0;i<count;i++)add(type,zone);for(const[type,zone]of [['bear','canyon'],['treant','forest'],['croc','swamp'],['mushking','meadow']])add(type,zone);}
  else{for(const[type,count]of PLANET_SPAWNS[planet]??[])for(let i=0;i<count;i++)add(type);for(const type of PLANET_BOSSES[planet]??[])add(type);}
  const titan=TITAN_BY_PLANET[planet];if(titan)add(titan,planet==='home'?'canyon':planet);
  if(planet==='lava')for(let i=0;i<18;i++)add('minislime');
  if(planet==='home')for(let i=0;i<FOREST_RAPTOR_COUNT;i++)add('forest_raptor','forest');
  return entries;
}
