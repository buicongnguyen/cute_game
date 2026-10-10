import {COLOSSUS_ID,COLOSSUS_NAME,COLOSSUS_SCHEDULE as W,COLOSSUS_STATS as S,COLOSSUS_TYPE,colossusClock,colossusMaxHp} from '../src/colossus-content.ts';
import {beginColossusAttack,colossusCadence,colossusSkill,colossusTelegraphs,headMultiplier,stepColossusAttack} from '../src/colossus-patterns.ts';

const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const BROADCAST_MS=250;
/**
 * The daily Colossus in online rooms. Every home room ('<party>:home') wakes its own Colossus with shared health during
 * the 08:00-24:00 (UTC+7) window; the server runs its attacks (colossus-patterns.ts, the same code as offline) and
 * hurts explorers through 75% of their defence. Other rooms only learn that it is up, so their sky darkens too.
 * The enemy lives in the room's combat state like any creature, so hits, contributors and the kill commit go through
 * combat-authority.mjs; this module adds spawning, attacks, the head weak point and the status effects.
 */
export function createColossusAuthority({send,broadcast,peers,clock=colossusClock,random=Math.random}){
  const effects=new Map();// account id → {crackUntil, scorchUntil, burnUntil, nextBurn, landAt}
  const effect=id=>{let e=effects.get(id);if(!e)effects.set(id,e={crackUntil:0,scorchUntil:0,burnUntil:0,nextBurn:0,landAt:0});return e;};
  const isHome=room=>room.id.endsWith(':home');
  /** The room's Colossus record (day, kill, attack state); the enemy itself sits in s.enemies. */
  function record(room){return room.colossus??={day:-1,killedDay:-1,attacks:[],count:0,nextAt:0,facing:W.facing,time:0,lastSent:0,finalBlow:null};}
  function spawn(s,room,now){
    const players=[...room.members].map(id=>peers.get(id)).filter(p=>p&&!p.visit&&p.planet==='home').length,maxHp=colossusMaxHp(Math.max(1,players));
    const roster={id:COLOSSUS_ID,type:COLOSSUS_TYPE,zone:'canyon',xp:S.xp,level:40,radius:S.radius,boss:true,titan:false,dormant:false,respawn:999999,baseMaxHp:maxHp,baseDamage:S.atk};
    const enemy={id:COLOSSUS_ID,type:COLOSSUS_TYPE,name:COLOSSUS_NAME,roster,x:W.x,z:W.z,home:{x:W.x,z:W.z},radius:S.radius,boss:true,hp:maxHp,maxHp,baseMaxHp:maxHp,damage:S.atk,baseDamage:S.atk,scaled:true,respawn:0,deadUntil:Infinity,generation:0,contributors:new Map(),changedAt:now,statuses:{},stun:0,phase:'chase',facing:W.facing,shots:[]};
    s.enemies.set(COLOSSUS_ID,enemy);return enemy;
  }
  function stateMessage(room,c,window,s=room.combat){
    const enemy=s?.enemies.get(COLOSSUS_ID),on=window.phase==='active';
    const base={type:'colossus',on,soon:window.phase==='soon',startsAt:window.startsAt,endsAt:window.endsAt};
    if(!isHome(room))return base;
    return {...base,killed:c.killedDay===window.day,hp:enemy?Math.max(0,enemy.hp):0,maxHp:enemy?.maxHp??S.hp,facing:c.facing,kneel:!!enemy&&enemy.hp<enemy.maxHp*S.kneelAt,attacks:c.attacks.filter(a=>!a.done).map(a=>({...a,nextHit:{}}))};
  }
  function publish(room,c,now,window,force=false,s=room.combat){if(!force&&now-c.lastSent<BROADCAST_MS)return;c.lastSent=now;broadcast(room,stateMessage(room,c,window,s));}
  /**
   * One server step for a room. `targets()` lists the explorers who can be hit; `hurt(peer, multiplier, defenceFactor,
   * roll)` and `hurtTrue(peer, amount)` apply damage through the combat authority's health path.
   */
  function tick(room,s,dt,{targets,hurt,hurtTrue,now=Date.now()}){
    const window=clock(now),c=record(room);
    if(!isHome(room)){if(window.phase!=='idle'||c.lastOn)publish(room,c,now,window,false,s);c.lastOn=window.phase==='active';return;}
    let enemy=s.enemies.get(COLOSSUS_ID);
    if(window.phase==='active'&&c.day!==window.day){c.day=window.day;c.attacks=[];c.count=0;c.nextAt=c.time+3;c.facing=W.facing;if(enemy){s.enemies.delete(COLOSSUS_ID);enemy=undefined;}}
    if(window.phase==='active'&&c.killedDay!==window.day&&!enemy)enemy=spawn(s,room,now);
    if(window.phase!=='active'&&enemy){s.enemies.delete(COLOSSUS_ID);enemy=undefined;c.attacks=[];publish(room,c,now,window,true,s);}
    if(enemy&&enemy.hp<=0&&!enemy.pending&&c.killedDay!==window.day){c.killedDay=window.day;c.attacks=[];publish(room,c,now,window,true,s);}
    c.time+=dt;
    if(enemy&&enemy.hp>0&&!enemy.pending){
      const list=targets(),points=list.map(p=>({id:p.account.id,x:p.pose.x,z:p.pose.z})),near=points.filter(p=>dist(p,enemy)<S.sight).sort((a,b)=>dist(a,enemy)-dist(b,enemy)),cadence=colossusCadence(enemy.hp/enemy.maxHp);
      const current=c.attacks.at(-1);
      if(near[0]&&(!current||current.done||current.age>=current.windup)){const want=Math.atan2(near[0].x-enemy.x,near[0].z-enemy.z),d=Math.atan2(Math.sin(want-c.facing),Math.cos(want-c.facing));c.facing+=Math.max(-dt*.7,Math.min(dt*.7,d));}
      enemy.facing=c.facing;
      for(const a of c.attacks){
        const result=stepColossusAttack(a,dt,near);
        for(const hit of result.hits){const peer=list.find(p=>p.account.id===hit.id);if(!peer)continue;const fx=effect(hit.id),factor=(fx.crackUntil>now?S.crackFactor:1)*(fx.scorchUntil>now?S.burnDefFactor:1);
          if(!hurt(peer,hit.multiplier,factor,.9+random()*.2))continue;
          let kind=hit.effect;
          if(kind==='crack'){if(random()<S.crackChance&&peer.account.profile.gear?.outfit)fx.crackUntil=now+S.crackSeconds*1000;else kind=undefined;}
          if(kind==='burn'){fx.scorchUntil=now+S.burnDefSeconds*1000;fx.burnUntil=now+S.burnSeconds*1000;}
          if(kind==='grab')fx.landAt=now+S.throwSeconds*1000;
          if(kind)send(peer.socket,{type:'colossusHit',effect:kind,x:peer.pose.x,z:peer.pose.z});
        }
        if(result.landed)publish(room,c,now,window,true,s);
      }
      c.attacks=c.attacks.filter(a=>!a.done);
      const busy=c.attacks.at(-1);
      if(near[0]&&c.time>=c.nextAt&&(!busy||busy.age>=busy.windup)){
        const skill=colossusSkill(c.count++),source={x:enemy.x,z:enemy.z,facing:c.facing},a=beginColossusAttack(skill,source,colossusTelegraphs(skill,source,near[0],near,random),cadence.windupScale);
        c.attacks.push(a);c.nextAt=c.time+a.windup+cadence.cooldown;enemy.phase='windup';enemy.skill=skill;publish(room,c,now,window,true,s);
      }
      // Burning ticks and the landing after a throw: true damage, a share of the explorer's maximum health.
      for(const peer of list){const fx=effects.get(peer.account.id);if(!fx)continue;const max=peer.account.profile.hp>0?maxHp(peer):0;if(!max)continue;
        if(fx.burnUntil>now&&now>=fx.nextBurn){fx.nextBurn=now+S.burnTick*1000;hurtTrue(peer,Math.max(1,Math.round(max*S.burnShare)));}
        if(fx.landAt&&now>=fx.landAt){fx.landAt=0;hurtTrue(peer,Math.round(max*S.grabShare));}}
    }
    publish(room,c,now,window,false,s);
  }
  let maxHp=peer=>peer.account.profile.hp;
  /** ×2.5 for a blow struck within reach of the lowered head. */
  function incoming(room,enemy,peer,amount){
    if(enemy.type!==COLOSSUS_TYPE||!peer?.pose)return amount;const c=record(room),current=c.attacks.filter(a=>!a.done).at(-1);
    return amount*headMultiplier(peer.pose,{x:enemy.x,z:enemy.z,facing:c.facing},current,enemy.hp<enemy.maxHp*S.kneelAt);
  }
  /** The final blow: remembered so the killer is told the companion is theirs. */
  function killed(room,enemy,killerId){if(enemy.type!==COLOSSUS_TYPE)return;const killer=peers.get(killerId);if(killer)send(killer.socket,{type:'colossus',...stateMessage(room,record(room),clock(Date.now())),finalBlow:true});}
  return {tick,incoming,killed,record,effects,setMaxHp(fn){maxHp=fn;}};
}
