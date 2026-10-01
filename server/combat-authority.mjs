import {randomUUID} from 'node:crypto';
import * as Game from '../src/model.ts';
import {ContextGearSelection} from '../src/context-gear.ts';
import {CombatSimulation,BASE_SKILLS,SPECIALS} from '../src/combat.ts';
import {ENEMY_TYPES} from '../src/enemy-types.ts';
import {enemyRoster} from '../src/enemy-roster.ts';
import {zoneAt,createEnvironmentLayout,EnvironmentSimulation} from '../src/environments.ts';
import {sanitizeTitanAttacks,beginTitanAttack,stepTitanAttack,titanTelegraphs,isTitanSkill} from '../src/titan-patterns.ts';
import {BOSS_SKILLS,BOSS_WINDUPS,bossTelegraphs,bossPhase,hitControl,BOSS_RESISTED,RESIST_SLOW,liftHeight} from '../src/boss-patterns.ts';
import {commandHash} from './action-service.mjs';
import {clearJourney} from './adventure-lifecycle.mjs';

const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const finite=(value,fallback=0,min=-160,max=160)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
const snapshot=enemy=>{const {roster,home,changedAt,deadUntil,generation,pending,contributors,scaled,damageAt,cast,nextCastAt,hostPhase,hostAttackCount,combatAttacks,lastHitAt,...publicState}=enemy;return {...publicState,chaseGrace:Math.max(0,Math.min(4,((lastHitAt||0)+4000-Date.now())/1000))};};
const STATUS=['fear','charm','slow','blind','sheep','taunt'];

/** The browser host animates navigation; the server owns HP, skill timing, stats, kills and rewards. */
export function createCombatAuthority({store,peers,rooms,remember,send,broadcast,onDeath=()=>{},onError=()=>{}}){
  const engines=new Map(),queues=new Map();let stopped=false;
  function queue(id,task){const next=(queues.get(id)||Promise.resolve()).catch(()=>{}).then(task);queues.set(id,next);return next;}
  async function internal(actorId,type,relatedIds,run,requestId=randomUUID()){
    return queue(actorId,async()=>{
      for(let retry=0;retry<5;retry++){
        const account=await store.get(actorId);if(!account)return null;
        try{
          const committed=await store.command({actorId,requestId,hash:commandHash({type,requestId}),expectedRevision:account.profileRevision||0,actionType:type,relatedIds,run});
          // A successful commit may outlive its connection. Receipt replay has no changed
          // records, but connected peers still need the persisted HP and life metadata.
          if(committed.reply.replayed)committed.accounts=(await Promise.all([...new Set([actorId,...relatedIds])].map(id=>store.get(id)))).filter(Boolean);
          committed.accounts.forEach(value=>{const current=remember(value),peer=peers.get(value.id);if(peer)send(peer.socket,{type:'profile',profile:current.profile,revision:current.profileRevision,authorityVersion:1});});
          return committed;
        }catch(error){if(error.status===409&&retry<4)continue;throw error;}
      }
    });
  }
  function state(room){if(!room.combat){const planet=room.id.split(':').at(-1),environment=new EnvironmentSimulation(createEnvironmentLayout(planet));environment.time=Date.now()/1000;environment.weather.time=environment.time;room.combat={planet,roster:new Map(enemyRoster(planet).map(e=>[e.id,e])),enemies:new Map(),environment,id:randomUUID(),at:Date.now(),lastBroadcast:0};}return room.combat;}
  function publish(room){
    const now=Date.now();
    for(const enemy of state(room).enemies.values())if(enemy.combatAttacks){
      enemy.titanAttacks=enemy.combatAttacks.filter(c=>!c.done&&c.attack).map(c=>structuredClone(c.attack));
      const pending=enemy.combatAttacks.find(c=>!c.done&&now<c.startsAt);
      if(pending){enemy.phase='windup';enemy.phaseTime=(pending.startsAt-now)/1000;enemy.skill=pending.skill;enemy.telegraphs=pending.marks.map(mark=>({...mark}));}
    }
    room.enemies=[...state(room).enemies.values()].map(snapshot);
  }
  function health(room,enemy,impact){publish(room);broadcast(room,{...snapshot(enemy),type:'enemyHealth',enemyType:enemy.type,impact,...(impact?{impactId:randomUUID()}:{})});}
  const aliveTargets=room=>[...room.members].map(id=>peers.get(id)).filter(p=>p&&p.active&&!p.visit&&p.account.profile.hp>0&&dist(p.pose,{x:0,z:0})>=(p.planet==='home'?18:11));
  const randomFor=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function observeCast(room,enemy,raw,now){
    const previousPhase=enemy.hostPhase,previousCount=enemy.hostAttackCount;enemy.hostPhase=raw.phase;enemy.hostAttackCount=raw.attackCount;
    const skill=raw.skill;if(!enemy.boss||raw.phase!=='windup'||!BOSS_SKILLS[enemy.type]?.includes(skill)||enemy.hp<=0||now<(enemy.nextCastAt||0)||previousPhase==='windup'&&previousCount===raw.attackCount)return;
    const targets=aliveTargets(room),target=targets.sort((a,b)=>dist(a.pose,enemy)-dist(b.pose,enemy))[0];if(!target||dist(target.pose,enemy)>35)return;
    const source={x:enemy.x,z:enemy.z,radius:enemy.radius,facing:finite(raw.facing,enemy.facing||0,-100,100)},players=targets.map(p=>({id:p.account.id,x:p.pose.x,z:p.pose.z,airborne:engineFor(p).sim.statuses.flight>0}));
    const telegraphPhase=enemy.type==='dragon'?bossPhase(enemy.hp,enemy.maxHp):enemy.hp<enemy.maxHp*.5?2:1;
    const marks=isTitanSkill(skill)?titanTelegraphs(skill,source,target.pose,players,randomFor((raw.attackCount||1)*91571)):bossTelegraphs(skill,source,target.pose,telegraphPhase,raw.attackCount||1);
    if(skill==='rain')for(const p of players)if(dist(p,target.pose)>.05&&dist(p,enemy)<22)marks.push(...bossTelegraphs(skill,source,p,telegraphPhase,(raw.attackCount||1)+marks.length));
    const phase=enemy.type==='dragon'?bossPhase(enemy.hp,enemy.maxHp):1;
    if(phase>=2&&(skill==='slam'||skill==='rain')){
      const random=randomFor((raw.attackCount||1)*9127),environment=state(room).environment;
      players.filter(p=>dist(p,enemy)<=25).forEach((p,index)=>{for(let i=0;i<(phase>=3?5:3);i++){const angle=random()*Math.PI*2,r=random()*4;environment.addFireRain({x:p.x+Math.cos(angle)*r,z:p.z+Math.sin(angle)*r},`dragon:${enemy.generation}:${raw.attackCount}:${index}:${i}`);}});
    }
    const windup=BOSS_WINDUPS[skill]*(enemy.hp<enemy.maxHp*.3?.8:1),cooldown=ENEMY_TYPES[enemy.type].cooldown*(enemy.hp<enemy.maxHp*.5?.7:1)*(enemy.hp<enemy.maxHp*.3?.6:1)*(phase>=3?.8:1);
    enemy.cast={skill,source,marks,startsAt:now+windup*1000,elapsed:0,fired:[],shots:[],attack:null};
    // A new wind-up must not erase lingering orbs, poison pools or shockwaves.
    (enemy.combatAttacks??=[]).push(enemy.cast);enemy.nextCastAt=now+(windup+cooldown)*1000;
  }
  function hurtPlayer(peer,amount,source='melee'){
    const e=engineFor(peer),now=Date.now();if(peer.visit||!peer.active||peer.account.profile.hp<=0||now-e.damageAt<550||e.sim.invulnerable||source==='melee'&&e.sim.statuses.flight>0)return;
    e.damageAt=now;const defense=Game.defense(combatProfile(peer))+e.sim.defenseBonus+(e.sim.statuses.armor>0?80:0);hp(peer,-Math.max(1,Math.round(amount*60/(defense+60))),source);
  }
  function hurtEnemyTarget(peer,enemy,multiplier,source='melee'){hurtPlayer(peer,enemy.damage*multiplier,source);}
  function updateCast(room,enemy,dt,now){
    if(enemy.hp<=0||enemy.pending)return;
    for(const cast of enemy.combatAttacks??[])updateAttack(room,enemy,cast,dt,now);
    enemy.combatAttacks=(enemy.combatAttacks??[]).filter(c=>!c.done);enemy.cast=enemy.combatAttacks.at(-1)??null;
  }
  function updateAttack(room,enemy,c,dt,now){
    if(now<c.startsAt)return;
    const targets=aliveTargets(room),points=targets.map(p=>({id:p.account.id,x:p.pose.x,z:p.pose.z,airborne:engineFor(p).sim.statuses.flight>0}));c.elapsed+=dt;
    const once=(id,time,fn)=>{if(c.elapsed>=time&&!c.fired.includes(id)){c.fired.push(id);fn();}};
    const area=(p,r,multiplier,source='melee',inner=-1)=>{for(const peer of targets){const d=dist(peer.pose,p);if(d<r&&d>inner)hurtEnemyTarget(peer,enemy,multiplier,source);}};
    if(isTitanSkill(c.skill)){
      c.attack??=beginTitanAttack(c.skill,c.source,c.marks,points);const result=stepTitanAttack(c.attack,dt,enemy,points);
      for(const hit of result.hits){const target=peers.get(hit.id);if(target?.room===room.id)hurtEnemyTarget(target,enemy,hit.multiplier,hit.source);}
      if(result.move){enemy.x=result.move.x;enemy.z=result.move.z;enemy.titanLift=result.move.y;}
      if(result.summon)[...state(room).enemies.values()].filter(e=>e!==enemy&&e.hp>0&&!e.pending&&!e.roster.dormant&&!e.boss&&ENEMY_TYPES[e.type].speed>0&&dist(e,enemy)<60).slice(0,4).forEach((e,i)=>{const angle=c.source.facing+(i+.5)*Math.PI/2;e.x=enemy.x+Math.sin(angle)*(enemy.radius+2);e.z=enemy.z+Math.cos(angle)*(enemy.radius+2);e.hp=e.maxHp;e.damage*=1.3;e.phase='chase';e.lastHitAt=now;health(room,e);});
      if(result.done){c.done=true;if(c.skill==='leap')enemy.titanLift=0;}return;
    }
    if(c.skill==='slam')once(0,0,()=>area(enemy,4.8,1.6));
    if(c.skill==='rain')once(0,0,()=>{for(const mark of c.marks)area(mark,mark.r,1.3,'shot');});
    if(c.skill==='quake')for(let i=0;i<3;i++)once(i,.12+i*.32,()=>area(c.source,3+i*3+.4,1.1,'melee',3+i*3-2.4));
    if(c.skill==='eclipse')once(0,0,()=>{area(enemy,7,.9,'shot');state(room).environment.eclipseUntil=state(room).environment.time+6;});
    if(c.skill==='charge'&&c.elapsed<.8)for(const peer of targets)if(dist(peer.pose,enemy)<enemy.radius+.6&&!c.fired.includes(peer.account.id)){c.fired.push(peer.account.id);hurtEnemyTarget(peer,enemy,1.3);}
    if(c.skill==='spin'&&c.elapsed<2.4)once(Math.floor(c.elapsed/.35),0,()=>area(enemy,3.4,.5));
    if(c.skill==='barrage'){
      once(0,0,()=>{const count=enemy.hp<enemy.maxHp*.5?20:14;for(let i=0;i<count;i++){const a=i/count*Math.PI*2+c.source.facing;c.shots.push({x:c.source.x,z:c.source.z,vx:Math.sin(a)*13,vz:Math.cos(a)*13,life:1.4});}});
      for(const shot of c.shots){const from={x:shot.x,z:shot.z};shot.x+=shot.vx*dt;shot.z+=shot.vz*dt;shot.life-=dt;for(const peer of targets)if(shot.life>0&&segmentDistance(peer.pose,from,shot)<.65){hurtEnemyTarget(peer,enemy,1,'shot');shot.life=0;}}
    }
    if(c.elapsed>3)c.done=true;
  }
  function segmentDistance(p,a,b){const x=b.x-a.x,z=b.z-a.z,l=x*x+z*z,f=l?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.z-a.z)*z)/l)):0;return Math.hypot(p.x-a.x-x*f,p.z-a.z-z*f);}
  function acceptSnapshots(room,incoming){
    const s=state(room),now=Date.now();
    for(const raw of incoming.slice(0,300)){
      const roster=s.roster.get(raw?.id);if(!roster||raw.type!==roster.type||!Number.isFinite(raw.x)||!Number.isFinite(raw.z)||Math.hypot(raw.x,raw.z)>155)continue;
      let enemy=s.enemies.get(roster.id);
      if(!enemy){
        if(!roster.dormant&&(Math.hypot(raw.x,raw.z)<22||s.planet==='home'&&zoneAt(raw)!==roster.zone))continue;
        enemy={...roster,roster,home:{x:raw.x,z:raw.z},x:raw.x,z:raw.z,hp:roster.dormant?0:roster.baseMaxHp,maxHp:roster.baseMaxHp,damage:roster.baseDamage,respawn:roster.dormant?999999:0,deadUntil:roster.dormant?Infinity:0,generation:0,contributors:new Map(),changedAt:now,statuses:{},shots:[]};s.enemies.set(roster.id,enemy);
      }
      const elapsed=Math.max(.1,(now-enemy.changedAt)/1000),maximum=(ENEMY_TYPES[roster.type].speed+16)*elapsed+2;
      if(dist(enemy,raw)<=maximum){enemy.x=raw.x;enemy.z=raw.z;}
      enemy.changedAt=now;observeCast(room,enemy,raw,now);
      // Only visual/AI state comes from the elected browser. Combat quantities are canonical.
      Object.assign(enemy,{y:finite(raw.y,0,-30,50),facing:finite(raw.facing,0,-100,100),phase:typeof raw.phase==='string'?raw.phase.slice(0,24):'idle',phaseTime:finite(raw.phaseTime,0,0,60),lift:finite(raw.lift,0,0,20),liftVelocity:finite(raw.liftVelocity,0,-30,30),cooldown:finite(raw.cooldown,0,0,60),targetX:finite(raw.targetX,enemy.x),targetZ:finite(raw.targetZ,enemy.z),skill:typeof raw.skill==='string'?raw.skill.slice(0,40):'',bossStage:finite(raw.bossStage,0,0,4),attackCount:finite(raw.attackCount,0,0,1e9),skillCount:finite(raw.skillCount,0,0,1e9),spinTick:finite(raw.spinTick,0,0,10),titanAttacks:sanitizeTitanAttacks(raw.titanAttacks),titanLift:finite(raw.titanLift,0,0,20)});
      for(const key of ['telegraphs','skillEffects'])enemy[key]=(Array.isArray(raw[key])?raw[key]:[]).slice(0,64).map(v=>({x:finite(v?.x),z:finite(v?.z),r:finite(v?.r,1,0,80),delay:finite(v?.delay,0,0,60),inner:finite(v?.inner,0,0,80),remaining:finite(v?.remaining,0,0,60),multiplier:finite(v?.multiplier,1,0,6)}));
      enemy.shots=(Array.isArray(raw.shots)?raw.shots:[]).slice(0,30).filter(v=>typeof v?.id==='string').map(v=>({id:v.id.slice(0,100),x:finite(v.x),y:finite(v.y,1,-30,50),z:finite(v.z),vx:finite(v.vx,0,-100,100),vz:finite(v.vz,0,-100,100),life:finite(v.life,0,0,60),damage:enemy.damage,targetEnemyId:typeof v.targetEnemyId==='string'?v.targetEnemyId.slice(0,100):undefined}));
      // The same marks drive damage and the warning shown to every browser, including
      // the host. Preserve Titan safe rings, sequence indices and sweep angles.
      if(enemy.cast&&now<enemy.cast.startsAt){enemy.phase='windup';enemy.phaseTime=(enemy.cast.startsAt-now)/1000;enemy.skill=enemy.cast.skill;enemy.telegraphs=enemy.cast.marks.map(mark=>({...mark}));}
    }
    publish(room);return room.enemies;
  }
  function kill(room,enemy,killer,execute=false){
    if(enemy.pending)return;enemy.pending=true;const now=Date.now(),requestId=randomUUID(),killPoint={x:enemy.x,z:enemy.z},killerEpoch=epoch(killer.account),contributorEpochs=new Map([...room.members].map(id=>[id,peers.get(id)?.account.adventureEpoch||0]));
    const contributors=[...enemy.contributors].filter(([id,at])=>now-at<30000&&room.members.has(id)&&peers.get(id)?.planet===state(room).planet).map(([id])=>id);
    if(!contributors.includes(killer.account.id))contributors.push(killer.account.id);
    internal(killer.account.id,'combatKill',contributors,records=>{
      let loot=[];
      for(const id of contributors){const account=records.get(id);if(!account||(account.adventureEpoch||0)!==contributorEpochs.get(id))continue;const profile=Game.parseSave(JSON.stringify(account.profile));if(!profile)continue;
        const rolled=Game.grantDefeat(profile,enemy.type,enemy.roster.xp,enemy.boss,Math.random,false);if(id===killer.account.id)loot=rolled;
        if(execute&&id===killer.account.id&&(account.lifeEpoch||0)===killerEpoch.life)profile.hp=Math.min(Game.maxHp(profile),profile.hp+Game.maxHp(profile)*.25);
        account.profile=profile;
      }
      const owner=records.get(killer.account.id);if(!owner||(owner.adventureEpoch||0)!==killerEpoch.adventure)return {enemyId:enemy.id,drops:[],execute:false};owner.drops=(owner.drops||[]).filter(d=>d.expiresAt>now);
      const drops=loot.map(item=>({id:randomUUID(),ownerId:owner.id,item:item.id,count:item.count,room:room.id,planet:state(room).planet,x:killPoint.x,z:killPoint.z,owner:owner.id,releaseAt:now+10000,expiresAt:now+30000}));owner.drops.push(...drops);
      return {enemyId:enemy.id,drops,execute};
    },requestId).then(committed=>{
      if(!committed)throw new Error('Missing killer');enemy.pending=false;enemy.hp=0;enemy.deadUntil=Date.now()+enemy.roster.respawn*1000;enemy.respawn=enemy.roster.respawn;enemy.titanAttacks=[];enemy.shots=[];enemy.skillEffects=[];enemy.telegraphs=[];enemy.combatAttacks=[];enemy.cast=null;
      room.killed.add(enemy.id);health(room,enemy);broadcast(room,{type:'defeat',id:enemy.id,by:contributors,eventId:requestId});
      for(const drop of committed.reply.result.drops)broadcast(room,{type:'dropSpawn',drop});
      if(execute&&committed.reply.result.execute)send((peers.get(killer.account.id)||killer).socket,{type:'executeResult',id:enemy.id,requestId,ok:true,profile:committed.reply.profile,revision:committed.reply.revision});
      if(enemy.type==='magmaslime')for(const [i,minion] of [...state(room).enemies.values()].filter(e=>e.type==='minislime'&&e.hp<=0&&!e.pending).slice(0,3).entries()){minion.x=enemy.x+Math.cos(i*Math.PI*2/3)*.9;minion.z=enemy.z+Math.sin(i*Math.PI*2/3)*.9;minion.hp=minion.maxHp;minion.deadUntil=0;minion.respawn=0;minion.generation++;health(room,minion);}
    }).catch(()=>{enemy.pending=false;enemy.hp=Math.max(1,enemy.hp);health(room,enemy);send(killer.socket,{type:'error',message:'The reward could not be saved. Please try again.'});});
  }
  function hit(peer,enemy,impact,execute=false,hazard=false){
    const room=rooms.get(peer.room);if(!room||peer.visit||enemy.hp<=0||enemy.pending)return 0;
    if(!enemy.scaled&&enemy.boss){const players=[...room.members].map(id=>peers.get(id)).filter(p=>p&&!p.visit&&dist(p.pose,enemy)<28),level=Math.max(...players.map(p=>p.account.profile.level),1),difference=Math.max(0,level-enemy.roster.level);enemy.maxHp=Math.round(enemy.roster.baseMaxHp*(1+.6*Math.max(0,players.length-1))*(enemy.type==='dragon'?1:1+difference*.12));enemy.hp=enemy.maxHp;enemy.damage=enemy.roster.baseDamage*(enemy.type==='dragon'?1:(1+difference*.07)*(1+.1*Math.max(0,players.length-1)));enemy.scaled=true;}
    const control=hitControl(enemy.boss,impact.stun||0);
    if(!hazard&&!execute&&enemy.type==='magmaturtle')impact={...impact,amount:impact.amount*(enemy.phase==='recover'?2:.12)};
    const dealt=Math.min(enemy.hp,Math.max(0,impact.amount));enemy.contributors.set(peer.account.id,Date.now());enemy.lastHitAt=Date.now();enemy.hp-=dealt;enemy.stun=Math.max(enemy.stun||0,control.stun);
    if(control.slow)enemy.statuses.slow=Math.max(enemy.statuses.slow||0,control.slow);
    if(impact.lift>0){enemy.liftVelocity=Math.max(enemy.liftVelocity||0,Math.sqrt(liftHeight(enemy.boss,impact.lift)*24));enemy.stun=Math.max(enemy.stun||0,.8);enemy.phase='chase';enemy.telegraphs=[];enemy.combatAttacks=(enemy.combatAttacks??[]).filter(c=>c.attack||c.elapsed>0);enemy.cast=enemy.combatAttacks.at(-1)??null;}
    if(enemy.hp<=0){enemy.hp=1;kill(room,enemy,peer,execute);}health(room,enemy,impact);return dealt;
  }
  const epoch=account=>({adventure:account.adventureEpoch||0,life:account.lifeEpoch||0});
  function hp(peer,amount,source){
    if(!Number.isFinite(amount)||!amount||peer.visit)return;const engine=engineFor(peer),now=Date.now(),context=epoch(peer.account);
    const last=engine.healthEvents.at(-1);
    if(last&&last.adventure===context.adventure&&last.life===context.life&&last.planet===peer.planet&&Math.sign(last.amount)===Math.sign(amount)&&now-last.at<100)last.amount+=amount;
    else engine.healthEvents.push({...context,amount,source,at:now,planet:peer.planet,x:peer.pose.x,z:peer.pose.z});
  }
  function flushHealth(engine){
    if(engine.pendingHealth?.flushing)return engine.pendingHealth.promise;
    if(!engine.pendingHealth&&!engine.healthEvents.length)return Promise.resolve(true);
    const batch=engine.pendingHealth??={events:engine.healthEvents.splice(0),requestId:randomUUID(),flushing:false},events=batch.events,actorId=engine.peer.account.id;batch.flushing=true;engine.hpAt=Date.now();
    return batch.promise=internal(actorId,'health',[],records=>{
      const account=records.get(actorId),profile=account.profile;let delta=0,died=false;
      for(const event of events){
        if(event.adventure!==(account.adventureEpoch||0)||event.life!==(account.lifeEpoch||0)||event.at<(account.healthBoundaryAt||0))continue;
        const before=profile.hp;profile.hp=Math.max(0,Math.min(Game.maxHp(profile),profile.hp+event.amount));delta+=profile.hp-before;
        if(profile.hp<=0){profile.planet=event.planet;Game.die(profile,event.x,event.z);clearJourney(account);account.lifeEpoch=(account.lifeEpoch||0)+1;died=true;}
      }
      return {delta,died,lifeEpoch:account.lifeEpoch||0};
    },batch.requestId).then(result=>{engine.pendingHealth=null;if(!result)return true;const live=peers.get(actorId);if(!live)return true;
      if(result.reply.result.died){resetPeer(live,{newLife:true});onDeath(live);}
      send(live.socket,{type:'healthResult',...result.reply.result});return true;
    }).catch(()=>{batch.flushing=false;return false;});
  }
  /** Settle already observed damage before an inventory action calculates healing. */
  async function flushPeerHealth(peer){
    const engine=engines.get(peer.account.id);if(!engine)return;
    const pending=!!engine.pendingHealth,buffered=engine.healthEvents.length>0;
    if(pending&&!await flushHealth(engine))throw new Error('Pending health could not be saved. Please try again.');
    if(buffered&&!await flushHealth(engine))throw new Error('Pending health could not be saved. Please try again.');
  }
  function combatProfile(peer){
    const engine=engineFor(peer),profile=peer.account.profile;engine.gear??=new ContextGearSelection();
    const weapon=engine.gear.forCombat(profile);return {...profile,gear:{...profile.gear,...(weapon?{weapon}:{weapon:undefined})}};
  }
  function engineFor(peer){
    let engine=engines.get(peer.account.id);
    if(engine){
      engine.peer=peer;engine.lastSeen=Date.now();
      if(engine.room!==peer.room){flushHealth(engine);engine.sim.reset();engine.room=peer.room;}
      if(engine.planet!==peer.planet){engine.planet=peer.planet;engine.environment=new EnvironmentSimulation(createEnvironmentLayout(peer.planet));}
      return engine;
    }
    engine={peer,room:peer.room,planet:peer.planet,lastSeen:Date.now(),nextBasic:0,nextSkill:[0,0,0,0],healthEvents:[],hpAt:0,damageAt:0,lastSkill:new Map(),environment:new EnvironmentSimulation(createEnvironmentLayout(peer.planet))};
    const current=()=>engine.peer,room=()=>rooms.get(current().room);
    const targets=()=>room()?[...state(room()).enemies.values()]:[];
    engine.sim=new CombatSimulation({position:()=>current().pose,facing:()=>current().pose.facing,face:a=>{current().pose.facing=a;},targets,
      weapon:()=>{const weapon=Game.weaponStats(combatProfile(current()));return weapon.kind==='rod'?{kind:'fist',range:1.6,cd:.5,special:'fist'}:weapon;},
      stats:()=>Game.activeStats(combatProfile(current())),moving:()=>current().pose.moving,
      move:(x,z)=>{current().pose.x+=x;current().pose.z+=z;},hit:(target,impact)=>hit(current(),target,impact),
      heal:fraction=>hp(current(),Game.maxHp(current().account.profile)*fraction,'heal'),
      execute:target=>{const p=current();if(!target.boss&&target.hp/target.maxHp<.4&&dist(p.pose,target)<=3.2+target.radius)hit(p,target,{amount:target.hp,critical:true,stun:0,lift:0,knock:0,direction:{x:0,z:0}},true);},
      effect:effect=>{if(room())broadcast(room(),{type:'effect',by:current().account.id,visual:effect},current().account.id);},
      pet:()=>{const p=current(),pet=Game.ITEMS[p.account.profile.gear.pet]?.pet;return pet?{...pet,x:p.pose.x,z:p.pose.z}:null;},
      status:(target,kind,duration)=>{if(target.boss&&BOSS_RESISTED.includes(kind)){kind='slow';duration*=RESIST_SLOW;}target.statuses[kind]=Math.max(target.statuses[kind]||0,duration);if(room())broadcast(room(),{type:'status',id:target.id,kind,duration});},
      moveTarget:(target,x,z)=>{if(dist(target,{x,z})>12)return;target.x=x;target.z=z;if(room())broadcast(room(),{type:'moveEnemy',id:target.id,x,z});}});
    engines.set(peer.account.id,engine);return engine;
  }
  function resetPeer(peer,{newLife=false,reason}={}){
    const engine=engineFor(peer);engine.sim.reset();
    if(newLife||reason==='rest')engine.healthEvents=[];
    if(newLife){engine.environment=new EnvironmentSimulation(createEnvironmentLayout(peer.planet));engine.damageAt=0;}
    if(reason==='reset'){engine.nextBasic=0;engine.nextSkill=[0,0,0,0];}
  }
  function basic(peer,targetId){if(peer.visit||!peer.active||peer.account.profile.hp<=0)return;const e=engineFor(peer),now=Date.now();if(now<e.nextBasic)return;const target=state(rooms.get(peer.room)).enemies.get(targetId);if(e.sim.basic(target)){const weapon=Game.weaponStats(combatProfile(peer));e.nextBasic=now+Math.max(.12,(weapon.cd||.5)/Math.max(.2,1+Game.activeStats(peer.account.profile).haste))*1000;}}
  function skill(peer,index){if(peer.visit||!peer.active||peer.account.profile.hp<=0||!Number.isInteger(index)||index<0||index>3)return;const e=engineFor(peer),now=Date.now();if(now<e.nextSkill[index])return;const profile=combatProfile(peer),dz=profile.gear.disguise,weapon=Game.weaponStats(profile),list=Game.DISGUISES[dz]?.skills||[...BASE_SKILLS,SPECIALS[weapon.special||'fist']||SPECIALS.fist];if(dz?e.sim.disguise(dz,index):e.sim.skill(index,weapon.special||'fist')){e.nextSkill[index]=now+list[index].cd/Math.max(.2,1+Game.activeStats(profile).haste)*1000;internal(peer.account.id,'skill',[],records=>{const s=records.get(peer.account.id).profile;Game.recordEvent(s,'skill');return {index};}).catch(()=>{});}}
  function damage(peer,enemyId,source='melee'){
    if(peer.visit)return;const room=rooms.get(peer.room),enemy=room&&state(room).enemies.get(enemyId),e=engineFor(peer),now=Date.now();
    if(!enemy||enemy.hp<=0)return;
    if(enemy.boss&&BOSS_SKILLS[enemy.type]?.includes(enemy.skill))return;
    const def=ENEMY_TYPES[enemy.type],reach=source==='shot'?45:def.reach+enemy.radius+2;
    if(dist(peer.pose,enemy)>reach)return;
    hurtEnemyTarget(peer,enemy,enemy.phase==='charge'?1.3:1,source);
  }
  function environmentSnapshot(env){return {time:env.time,lamps:[...env.lamps],eclipseUntil:env.eclipseUntil,nestLevel:env.nestLevel,fireRain:env.fireRain,lightning:env.lightning,weather:env.weather.snapshot()};}
  function tick(dt=.05){
    const now=Date.now();
    for(const room of rooms.values()){
      const s=state(room),active=[...room.members].map(id=>peers.get(id)).filter(p=>p&&p.active&&!p.visit),actors=[...s.enemies.values()].map(e=>({id:e.id,x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp,boss:e.boss,flying:ENEMY_TYPES[e.type].flying,lavaImmune:e.type==='lavaworm'}));
      const liveDragon=[...s.enemies.values()].find(e=>e.type==='dragon'&&e.hp>0);s.environment.dragonPhase=liveDragon?bossPhase(liveDragon.hp,liveDragon.maxHp):0;
      s.environment.nearbyPlayers=active.length;
      const before=environmentSnapshot(s.environment),weatherBefore=structuredClone(before.weather),rainBefore=structuredClone(before.fireRain),lightningBefore=structuredClone(before.lightning);
      const focus=active.length?active[(s.focusCursor=(s.focusCursor||0)+1)%active.length].pose:{x:0,z:0};
      const step=s.environment.step(dt,focus,{x:0,z:0},{speed:6,maxHp:100,flying:true},actors);
      for(const strike of step.enemyHits){const enemy=s.enemies.get(strike.id);if(!enemy||enemy.pending||enemy.hp<=0)continue;
        const contributor=[...enemy.contributors].filter(([,at])=>now-at<30000).map(([id])=>peers.get(id)).find(p=>p?.room===room.id&&!p.visit);
        if(contributor)hit(contributor,enemy,{amount:strike.amount,critical:false,stun:0,lift:0,knock:0,direction:{x:0,z:0}},false,true);
        else{enemy.hp=Math.max(0,enemy.hp-strike.amount);if(enemy.hp===0){enemy.deadUntil=now+enemy.roster.respawn*1000;enemy.respawn=enemy.roster.respawn;enemy.shots=[];enemy.titanAttacks=[];enemy.combatAttacks=[];enemy.cast=null;}health(room,enemy);}
      }
      const dragon=[...s.enemies.values()].find(e=>e.type==='dragon');if(dragon&&step.dragonSummon){dragon.hp=dragon.maxHp;dragon.deadUntil=0;dragon.respawn=0;dragon.statuses={};dragon.stun=0;dragon.phase='idle';dragon.cast=null;dragon.combatAttacks=[];health(room,dragon);}if(dragon&&step.dragonDismiss){dragon.hp=0;dragon.deadUntil=Infinity;dragon.respawn=999999;dragon.cast=null;dragon.combatAttacks=[];dragon.titanAttacks=[];dragon.shots=[];dragon.skillEffects=[];dragon.telegraphs=[];health(room,dragon);}
      for(const enemy of s.enemies.values()){
        if(enemy.hp>0&&!enemy.pending&&enemy.phase==='return'&&now-(enemy.lastHitAt||0)>4000){enemy.hp=Math.min(enemy.maxHp,enemy.hp+enemy.maxHp*.3*dt);if(enemy.hp===enemy.maxHp)enemy.scaled=false;}
        updateCast(room,enemy,dt,now);
        enemy.stun=Math.max(0,(enemy.stun||0)-dt);for(const key of STATUS)enemy.statuses[key]=Math.max(0,(enemy.statuses[key]||0)-dt);
        if(enemy.hp<=0&&!enemy.pending&&Number.isFinite(enemy.deadUntil)){enemy.respawn=Math.max(0,(enemy.deadUntil-now)/1000);if(enemy.respawn===0&&active.every(p=>dist(p.pose,enemy.home)>22)){enemy.x=enemy.home.x;enemy.z=enemy.home.z;enemy.hp=enemy.maxHp=enemy.roster.baseMaxHp;enemy.damage=enemy.roster.baseDamage;enemy.scaled=false;enemy.contributors.clear();enemy.generation++;room.killed.delete(enemy.id);health(room,enemy);}}
      }
      room.environment=environmentSnapshot(s.environment);
      if(now-s.lastBroadcast>250){s.lastBroadcast=now;publish(room);broadcast(room,{type:'enemies',enemies:room.enemies});broadcast(room,{type:'environment',snapshot:room.environment});}
      for(const peer of active){const e=engineFor(peer);e.sim.update(dt,true);e.environment.authoritative=false;e.environment.time=s.environment.time-dt;e.environment.weather.restore(weatherBefore);e.environment.fireRain=structuredClone(rainBefore);e.environment.lightning=structuredClone(lightningBefore);e.environment.lamps=new Map(s.environment.lamps);e.environment.eclipseUntil=s.environment.eclipseUntil;e.environment.dragonPhase=s.environment.dragonPhase;e.environment.nestLevel=before.nestLevel;
        if(peer.account.ridePlanet===peer.planet&&peer.account.rideUntil>now)e.environment.rideUntil=e.environment.time+(peer.account.rideUntil-now)/1000;
        const traits=Game.activeStats(peer.account.profile),hazard=e.environment.step(dt,peer.pose,{x:0,z:0},{...traits,fireResistance:traits.lavaproof?1:traits.fireResistance,flying:e.sim.statuses.flight>0||e.sim.statuses.bats>0},[]);
        if(hazard.damage>0)hurtPlayer(peer,hazard.damage,'hazard');if(hazard.heal)hp(peer,hazard.heal,'heal');if(traits.regen>0&&peer.account.profile.hp<traits.maxHp)hp(peer,traits.regen*dt,'regen');if(peer.planet==='home'&&zoneAt(peer.pose)==='home'&&peer.account.profile.hp<traits.maxHp)hp(peer,4*dt,'rest');

      }
    }
    for(const[id,engine]of engines){if((engine.pendingHealth||engine.healthEvents.length)&&now-engine.hpAt>500)flushHealth(engine);if(!peers.has(id)&&!engine.pendingHealth&&!engine.healthEvents.length&&now-engine.lastSeen>600000)engines.delete(id);}
  }
  const timer=setInterval(()=>{if(!stopped)try{tick(.05);}catch(error){onError(error);}},50);timer.unref();
  function bomb(peer,radius,multiplier){const room=rooms.get(peer.room);if(!room||peer.visit)return;for(const enemy of state(room).enemies.values())if(enemy.hp>0&&dist(peer.pose,enemy)<=radius+enemy.radius)hit(peer,enemy,{amount:Math.round(Game.attack(combatProfile(peer))*multiplier),critical:false,stun:.5,lift:0,knock:2,direction:{x:0,z:0}});}
  return {acceptSnapshots,basic,skill,damage,bomb,engineFor,state,internal,resetPeer,flushPeerHealth,async close(){stopped=true;clearInterval(timer);for(const engine of engines.values())flushHealth(engine);await Promise.allSettled([...queues.values()]);}};
}
