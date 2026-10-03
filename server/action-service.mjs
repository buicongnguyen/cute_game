import {createHash,randomUUID,randomInt} from 'node:crypto';
import * as Game from '../src/model.ts';
import {applyGameAction,ACTION_RULES_VERSION} from '../src/actions.ts';
import {resolveMysteryCatch,catchWeight,STEADY} from '../src/fishing.ts';
import {createEnvironmentLayout} from '../src/environments.ts';
import {environmentResourceNodes} from '../src/environment-resources.ts';
import {LAVA_ORE_RULES} from '../src/lava-weather.ts';
import {STAR_MAP,DISCOVER_RANGE,SPACE_EDGE,spaceLayout,dustSpot} from '../src/space.ts';
import {clearJourney} from './adventure-lifecycle.mjs';
import {huntingPonds,huntFish} from '../src/fish-hunting.ts';
import {CAGES} from '../src/friends-state.ts';
import {WORK_ACTIONS,CATCH_UP_ACTIONS,explorerAway} from '../src/delivery.ts';
import {cageCandidates,RESCUE_REACH} from '../src/cage-spots.ts';
import {activity} from '../src/house-activities.ts';
import {INDOOR_Y} from '../src/house.ts';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const random=()=>randomInt(0,0x100000000)/0x100000000;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const commandHash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{1,100}$/.test(value)&&!['constructor','prototype','__proto__'].includes(value);
const point=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const farmActions=new Set(['plant','plantAll','harvest','harvestAll','fertilize','expandGarden','buyBedKit','storeBed','upgradeBed','moveBed','placeDecoration','moveDecoration','removeDecoration','buildPen','buyAnimal','feedAnimal','feedAll','collectProducts','expandPen','buildSpeciesPen','buyHelper','setHelperPaused','setHelperSeed','helperHarvest','helperPlant','rest','houseUse','cook','cookDish','friendsArrive','setFriendPaused','setFriendAutoFeed','friendWork','friendsCatchUp','helperCatchUp','giveFriendGear','takeFriendGear','ackStored']);
const farmHelperActions=new Set(['buyFarmHelper','setFarmHelperPaused','setFarmHelperAutoFeed','farmHelperCollect','farmHelperFeed','farmHelperCatchUp','upgradeFarmRestock','setFarmRestock','farmHelperRestock']);
export function waterNodes(planet){
  return huntingPonds(planet).map(pond=>({x:pond.x,z:pond.z,r:pond.rx,water:pond.waterId}));
}
function requireNear(peer,at,range=4){if(!peer||peer.visit||!point(at)||distance(peer.pose,at)>range)fail(409,'Move closer to use that.');}
function strike(account,key,required,now){account.resourceHits??={};const hit=account.resourceHits[key]||{hits:0,at:0};if(now-hit.at<250)fail(429,'Wait for your next strike.');hit.hits++;hit.at=now;if(hit.hits<required){account.resourceHits[key]=hit;return {hits:hit.hits,required};}delete account.resourceHits[key];return null;}
function flightPoint(account,value,now){if(!account.journeyPaid||!point(value)||Math.hypot(value.x,value.z)>SPACE_EDGE+40)fail(409,'Launch your starship first.');const previous=account.flightPoint;if(!previous||distance(previous,value)>Math.max(0,now-previous.at)/1000*400+8)fail(409,'Keep flying toward your destination.');account.flightPoint={x:value.x,z:value.z,at:now};return value;}
function validateFishingProof(proof,ticket,now){
  if(!proof||!Array.isArray(proof.samples)||proof.samples.length<3||proof.samples.length>96||!Number.isFinite(proof.elapsed)||proof.elapsed<2||proof.elapsed>180||proof.elapsed*1000>now-ticket.startedAt+750||!Number.isFinite(proof.hookAt)||proof.hookAt<0||proof.hookAt>proof.elapsed)fail(400,'This catch could not be verified.');
  let previous=proof.hookAt,held=0,lastProgress=0;
  for(const sample of proof.samples){
    if(!sample||!Number.isFinite(sample.t)||sample.t<previous||sample.t>proof.elapsed+.1||typeof sample.held!=='boolean'||!Number.isFinite(sample.tension)||sample.tension<0||sample.tension>1||!Number.isFinite(sample.progress)||sample.progress<0||sample.progress>1)fail(400,'This catch could not be verified.');
    if(sample.held)held+=sample.t-previous;
    previous=sample.t;lastProgress=sample.progress;
  }
  const power=ticket.power*(ticket.steady?STEADY.heavy:1),minimum=1/(.3*(1.15-power*.45)*(ticket.steady?STEADY.reel:1));
  if(lastProgress<1||held+.25<minimum||proof.elapsed-proof.hookAt+.25<minimum)fail(409,'Reel the fish in before collecting it.');
}
function saveDrop(account,item,count,peer,now,{owner=account.id,priority=0,life=30000}={}){
  const drop={id:randomUUID(),ownerId:account.id,item,count,room:peer.room,planet:peer.planet,space:peer.planet==='home'&&Math.hypot(peer.pose.x,peer.pose.z)<18?`home:${account.id}`:'wild',x:peer.pose.x,z:peer.pose.z,owner,releaseAt:now+priority,expiresAt:now+life};
  account.drops=(account.drops||[]).filter(value=>value.expiresAt>now);account.drops.push(drop);return drop;
}

/** Account records, receipts, theft ledgers and drops commit in one storage transaction. */
export function createActionService({store,getPeer,getWorld=()=>null,afterCommit=()=>{}}){
  return async function execute(actorId,data,{checkAccess}={}){
    checkAccess?.();
    if(data?.rulesVersion!==ACTION_RULES_VERSION||!validId(data.type)||!data.payload||typeof data.payload!=='object'||Array.isArray(data.payload))fail(400,'This action needs the current game rules.');
    const intent={type:data.type,payload:data.payload},p=data.payload;
    const relatedIds=['stealCrop','claimDrop','releaseDrop'].includes(data.type)&&validId(p.ownerId)?[p.ownerId]:[];
    let reservation;
    try {
    const committed=await store.command({actorId,requestId:data.requestId,expectedRevision:data.expectedRevision,actionType:data.type,hash:commandHash({rulesVersion:data.rulesVersion,...intent}),relatedIds,checkAccess,run:records=>{
      const account=records.get(actorId),state=Game.parseSave(JSON.stringify(account.profile)),peer=getPeer(actorId),now=Date.now();
      if(!state)fail(409,'Reconnect to load your adventure.');account.profile=state;
      if(peer&&peer.planet!==state.planet&&!['returnHome','stealCrop'].includes(data.type))fail(409,'Reconnect to load your current planet.');
      if(farmActions.has(data.type)&&(state.planet!=='home'||peer?.visit))fail(409,'Return to your own garden first.');
      if(farmHelperActions.has(data.type)&&(state.planet!=='home'||!peer?.active||peer.visit||account.journeyPaid))fail(409,'Return to your own garden first.');
      if(data.type==='homeCleanse'&&(!peer?.active||peer.visit||account.journeyPaid))fail(409,'Return to your own garden first.');
      let result;
      if(data.type==='stealCrop'){
        const owner=records.get(p.ownerId);
        if(!owner||owner.id===actorId||!account.friends.includes(owner.id)||!owner.friends.includes(actorId)||peer?.visit!==owner.id||peer.planet!=='home')fail(403,'Visit a friend’s garden before stealing a crop.');
        const target=Game.parseSave(JSON.stringify(owner.profile)),plot=target?.plots[p.index];
        if(!Number.isSafeInteger(p.index)||!plot||!plot.crop||p.generation!==plot.generation||distance(peer.pose,Game.bedPosition(target,p.index))>5||Game.cropProgress(plot,now)<1)fail(409,'That crop is no longer available.');
        if(Game.hasGuardDog(target)){
          const damage=Game.guardBiteDamage(target);account.lastGuardBite??={};
          if(now-(account.lastGuardBite[owner.id]||0)<6000)fail(429,'The guard dog is still chasing you.');
          account.lastGuardBite[owner.id]=now;state.hp=Math.max(0,state.hp-damage);const died=state.hp<=0;if(died){state.planet='home';Game.die(state,0,3);account.lifeEpoch=(account.lifeEpoch||0)+1;clearJourney(account);}result={blocked:true,ownerId:owner.id,damage,died};
        }else{
          const day=new Date(now).toISOString().slice(0,10);account.theftLedger??={};
          const ledger=account.theftLedger[owner.id]?.day===day?account.theftLedger[owner.id]:{day,count:0};
          if(ledger.count>=6)fail(409,'You have collected six crops from this garden today.');
          const item=plot.crop;if(!Game.addItem(state,item))fail(409,'Your bag cannot hold that crop.');
          plot.crop=null;plot.plantedAt=0;delete plot.growDuration;delete plot.generation;
          owner.profile=target;ledger.count++;account.theftLedger[owner.id]=ledger;
          result={blocked:false,ownerId:owner.id,index:p.index,item,count:1,remaining:6-ledger.count};
        }
      }else if(data.type==='fishHunt'){
        if(!peer?.active||peer.visit||account.journeyPaid||account.fishingTicket&&now-account.fishingTicket.startedAt<180000)fail(409,'Finish your cast and return to your own shore before hunting fish.');
        result=huntFish(state,p,peer.pose,now);
        if(!result)fail(409,'Equip your hunting harpoon and aim at an available nearby fish.');
      }else if(data.type==='fishStart'){
        const rod=Game.ITEMS[p.rodId]?.weapon;
        if(!peer||peer.visit||!rod||rod.kind!=='rod'||!state.bag[p.rodId]||!point(p.cast))fail(409,'Bring a fishing rod to the water.');
        const water=waterNodes(state.planet).find(node=>node.water===p.water&&distance(node,p.cast)<node.r&&distance(node,peer.pose)<=node.r+3.05&&distance(p.cast,peer.pose)<=8);
        if(!water)fail(409,'Move to the pond before casting.');
        if(account.fishingTicket&&now-account.fishingTicket.startedAt<180000)fail(409,'Finish or cancel your current cast first.');
        const key=`${state.planet}:${water.x}:${water.z}`,readyAt=account.mysteryReadyAt?.[key]||0;
        // A stale browser silhouette must not reject an otherwise valid ordinary cast.
        const mystery=p.mystery===true&&now>=readyAt;
        const bait=(state.bag.worm||0)>0,bonus=(bait?.8:0)+(rod.quality??.3)-.3+Game.activeStats(state).luck;
        const choices=(Game.FISH_WEIGHTS[p.water]||[]).map(([id,weight])=>[id,catchWeight(weight,Game.FISH[id]?.rarity,bonus)]);
        if(!choices.length)fail(409,'No fish live in this water.');
        let roll=random()*choices.reduce((sum,[,w])=>sum+w,0),id=choices.at(-1)[0];for(const choice of choices)if((roll-=choice[1])<=0){id=choice[0];break;}
        const fish=Game.FISH[id],fraction=random()**2.4,size=Math.round(fish.size[0]+(fish.size[1]-fish.size[0])*fraction);
        const outcome=mystery?resolveMysteryCatch({id,max:fish.size[1]},random):{id,size,huge:fish.rarity!=='junk'&&fraction>.82,supergiant:false,mystery:false};
        const ticket={id:randomUUID(),startedAt:now,planet:state.planet,water:key,power:fish.power,steady:rod.steady===true,outcome,cast:{...p.cast}};
        account.fishingTicket=ticket;if(bait)Game.removeItem(state.bag,'worm');
        result={ticketId:ticket.id,bait,pick:{id,power:fish.power,size,huge:fraction>.82,mystery},mysteryState:{readyAt,serverNow:now}};
      }else if(data.type==='fishFinish'||data.type==='fishCancel'){
        const ticket=account.fishingTicket;
        if(!ticket||ticket.id!==p.ticketId)fail(409,'That cast is no longer available.');
        if(data.type==='fishCancel'){delete account.fishingTicket;result=true;}
        else{
          if(ticket.planet!==state.planet||now-ticket.startedAt>180000)fail(409,'That cast has expired.');requireNear(peer,ticket.cast,9);
          validateFishingProof(p.telemetry,ticket,now);const catchResult=ticket.outcome;
          const ok=catchResult.mystery?Game.grantMysteryCatch(state,catchResult.id,catchResult.size,catchResult.supergiant):Game.grantCatch(state,catchResult.id,catchResult.size,catchResult.huge);
          if(!ok)fail(409,'Your bag cannot hold that catch.');
          if(catchResult.mystery){account.mysteryReadyAt??={};account.mysteryReadyAt[ticket.water]=now+(45+random()*45)*1000;}
          delete account.fishingTicket;result={...catchResult,mysteryState:{readyAt:account.mysteryReadyAt?.[ticket.water]||0,serverNow:now}};
        }
      }else if(data.type==='dropItem'){
        if(!peer||peer.visit||!validId(p.id)||!Number.isSafeInteger(p.count)||p.count<1||p.count>Game.looseQuantity(state,p.id))fail(409,'That item cannot be dropped.');
        Game.removeItem(state.bag,p.id,p.count);result=saveDrop(account,p.id,p.count,peer,now);result.thrown=true;
      }else if(data.type==='claimDrop'||data.type==='releaseDrop'){
        const owner=records.get(p.ownerId),drop=owner?.drops?.find(value=>value.id===p.id);
        if(!drop||drop.claimed||drop.expiresAt<=now||!peer||peer.visit||drop.room!==peer.room||drop.planet!==peer.planet)fail(409,'That dropped item is no longer available.');
        const space=drop.space||(drop.planet==='home'&&Math.hypot(drop.x,drop.z)<18?`home:${drop.ownerId}`:'wild');
        if(space!=='wild'&&space!==`home:${actorId}`)fail(403,'This dropped item belongs to a private garden.');
        if(data.type==='releaseDrop'){if(drop.owner!==actorId)fail(403,'Only the owner can release this item.');drop.releaseAt=now;result=drop;}
        else{if(distance(peer.pose,drop)>4.5||now<drop.releaseAt&&drop.owner!==actorId)fail(409,'Move closer or wait for the owner to release this item.');if(!Game.addItem(state,drop.item,drop.count))fail(409,'Your bag cannot hold that item.');drop.claimed=actorId;drop.claimedAt=now;result={id:drop.id,item:drop.item,count:drop.count,ownerId:owner.id,room:drop.room,planet:drop.planet,space,x:drop.x,z:drop.z};}
      }else if(data.type==='rideTurtle'){
        const turtle=createEnvironmentLayout(state.planet).turtles[p.index];if(state.planet!=='ocean'||!turtle)fail(400,'That turtle is not here.');requireNear(peer,turtle,4);account.rideUntil=now+45000;account.ridePlanet=state.planet;result={until:account.rideUntil};
      }else if(data.type==='collectMeteor'){
        const world=peer&&getWorld(peer.room),ore=world?.environment.weather.ores.find(ore=>ore.id===p.id&&ore.expiresAt>world.environment.time);
        if(state.planet!=='lava'||!ore)fail(409,'This meteor was already collected.');requireNear(peer,ore,4);
        world.oreClaims??=new Set();if(world.oreClaims.has(p.id))fail(409,'This meteor is already being collected.');
        const rules=LAVA_ORE_RULES[ore.kind],progress=strike(account,`${world.id}:${p.id}`,rules.hits,now);
        if(progress)result=progress;
        else{world.oreClaims.add(p.id);reservation={world,id:p.id};const rewards=[];for(const[id,chance,min,max]of rules.loot)if(random()<chance){const count=min+Math.floor(random()*(max-min+1));if(!Game.addItem(state,id,count))fail(409,'Your bag cannot hold that resource.');rewards.push({id,count});}Game.recordEvent(state,'mine',1,undefined,now);result={rewards};}
      }else if(data.type==='openCave'){
        if(state.planet!=='lava'||state.worldRewards.lava.gateOpen)fail(409,'That gate is already open.');requireNear(peer,createEnvironmentLayout('lava').cave.gate);
        result=strike(account,'lava:cave-gate',8,now)||Game.openCave(state);
      }else if(data.type==='collectStardust'){
        const position=flightPoint(account,p.position,now),dust=account.flightDust?.find(value=>value.id===p.dustId);
        if(!dust||distance(position,dust)>5)fail(409,'Fly closer to that stardust.');
        Object.assign(dust,dustSpot(random));result={shard:Game.collectStardust(state,random),nextDust:{...dust}};
      }else if(data.type==='discover'){
        const planet=Object.hasOwn(STAR_MAP,p.id)&&STAR_MAP[p.id],position=flightPoint(account,p.position,now);
        if(!planet||distance(planet,position)>planet.r+DISCOVER_RANGE+5)fail(409,'Fly closer to discover that planet.');result=Game.discover(state,p.id)||true;
      }else if(data.type==='environmentResource'||data.type==='jungleFruit'){
        const layout=createEnvironmentLayout(state.planet),node=environmentResourceNodes(layout).find(node=>node.id===p.nodeId);
        if(!node||data.type==='jungleFruit'&&node.kind!=='fruit')fail(400,'Unknown resource.');requireNear(peer,node,node.radius+3);
        if(node.kind==='fire-crystal'&&distance(node,layout.cave)<layout.cave.r&&!state.worldRewards.lava.gateOpen)fail(409,'Open the cave gate before mining inside.');
        if(now<(state.worldRewards.resourceReadyAt[node.id]||0))fail(409,'This resource is growing back.');
        if(node.kind==='fruit'){
          state.hp=Math.min(Game.maxHp(state),state.hp+Math.round(Game.maxHp(state)*.3));Game.addBuff(state,random()<.5?{regen:4,time:30}:{haste:.3,time:30},'jungle-fruit',now);if(random()<.35)Game.addItem(state,'vine');state.worldRewards.resourceReadyAt[node.id]=now+60000;result={kind:'fruit'};
        }else if(node.item){
          const progress=strike(account,node.id,node.hits,now);
          if(progress)result={kind:node.kind,...progress};
          else{const rules=node.kind==='clam'?{loot:[['coral',1,1,2],['pearl',.3,1,1]]}:LAVA_ORE_RULES[node.kind==='fire-crystal'?'ore_fire':node.kind==='magma-ore'?'ore_magma':'ore_obsidian'];const rewards=[];for(const[id,chance,min,max]of rules.loot)if(random()<chance){const count=min+Math.floor(random()*(max-min+1));if(!Game.addItem(state,id,count))fail(409,'Your bag cannot hold that resource.');rewards.push({id,count});}state.worldRewards.resourceReadyAt[node.id]=now+(node.cooldown||60000);Game.recordEvent(state,'mine',1,undefined,now);result={kind:node.kind,rewards};}
        }else fail(400,'Use the interaction for that landmark.');
      }else{
        if(data.type==='rest')requireNear(peer,{x:0,z:-8},7);
        // Cottage activities: in your own cottage (an indoor pose is raised by INDOOR_Y) and within reach of the thing.
        if(data.type==='houseUse'){if(!peer||peer.visit||state.planet!=='home'||!(peer.pose.y>=INDOOR_Y-1))fail(409,'Go inside your cottage first.');const spot=activity(typeof p.id==='string'?p.id:'');if(!spot||distance(peer.pose,spot.at)>3)fail(409,'Walk up to it first.');}
        // The upgrade bench stands in the cottage's craft room (upgrade-bench.ts).
        if(data.type==='upgradeGear'||data.type==='upgradeSkill'){const bench=activity('bench');if(!peer||peer.visit||state.planet!=='home'||!(peer.pose.y>=INDOOR_Y-1))fail(409,'Go inside your cottage first.');if(!bench||distance(peer.pose,bench.at)>3)fail(409,'Walk up to it first.');}
        if(data.type==='recoverBag'){if(!state.dropped||state.dropped.planet!==state.planet)fail(409,'That bag is not here.');requireNear(peer,state.dropped,4);}
        if(data.type==='claimMine')requireNear(peer,p.index===0?{x:-6,z:3}:{x:9,z:-8});
        if(data.type==='claimGift'){const a=p.index*2.399+.4,d=24+Math.sqrt(p.index/25)*95;requireNear(peer,{x:Math.cos(a)*d,z:Math.sin(a)*d});}
        if(['openCave','lightBrazier','claimCaveChest'].includes(data.type)){
          const layout=createEnvironmentLayout('lava');if(state.planet!=='lava')fail(409,'Travel to the volcano first.');requireNear(peer,data.type==='openCave'?layout.cave.gate:data.type==='lightBrazier'?layout.braziers[p.index]:{x:layout.cave.x,z:layout.cave.z-8});
        }
        // A rescue happens at the cage: within reach of a spot it can stand on around its boss's reported spawn (cage-spots.ts).
        if(data.type==='rescueFriend'){const cage=typeof p.id==='string'&&Object.hasOwn(CAGES,p.id)?CAGES[p.id]:null,boss=cage&&peer&&!peer.visit?[...(getWorld(peer.room)?.enemies?.values()??[])].find(e=>e.boss&&e.type===cage.boss&&point(e.home)):null;if(!boss||!cageCandidates(boss.home.x,boss.home.z).some(spot=>distance(peer.pose,spot)<=RESCUE_REACH+2.6))fail(409,'Move closer to use that.');}
        // Friends arrive where the server saw the explorer, not where the client says it is.
        if(data.type==='friendsArrive'){if(!peer||peer.visit)fail(409,'Return to your own garden first.');p.x=peer.pose.x;p.z=peer.pose.z;}
        if(data.type==='travel'&&!account.journeyPaid)fail(409,'Launch your starship first.');
        if(data.type==='die'){if(!peer||peer.visit||state.hp>0)fail(409,'Your adventure is still alive.');p.x=peer.pose.x;p.z=peer.pose.z;}
        // Workers' harvest goes to the chest while the server sees the explorer outside the home circle (delivery.ts).
        // The server's own pose decides; without a game socket the explorer is not away (a bare HTTP client cannot choose the chest).
        if((WORK_ACTIONS.has(data.type)||CATCH_UP_ACTIONS.has(data.type))&&p&&typeof p==='object')p.away=peer&&!peer.visit?explorerAway(peer.planet,peer.pose.x,peer.pose.z)||CATCH_UP_ACTIONS.has(data.type)&&now-(peer.tripAt||0)<120000:false;
        result=applyGameAction(state,intent,{now,random});
        if(data.type==='rest'||data.type==='houseUse')account.healthBoundaryAt=now;
        if(data.type==='reset'){account.adventureEpoch=(account.adventureEpoch||0)+1;account.lifeEpoch=(account.lifeEpoch||0)+1;clearJourney(account);for(const key of ['resourceHits','drops','mysteryReadyAt'])delete account[key];}
        if(data.type==='die'){account.lifeEpoch=(account.lifeEpoch||0)+1;clearJourney(account);}
        if(data.type==='claimGift'&&state.hp<=0){Game.die(state,peer.pose.x,peer.pose.z);account.lifeEpoch=(account.lifeEpoch||0)+1;clearJourney(account);result={...result,died:true};}
        if(data.type==='launch'){const start=STAR_MAP[state.planet];account.journeyPaid=true;account.flightPoint={x:start.x,z:start.z+start.r+8,at:now};account.flightDust=spaceLayout().dust;}
        if(data.type==='travel'||data.type==='returnHome')clearJourney(account);
      }
      state.savedAt=now;
      return result;
    }});
    if(reservation)reservation.world.environment.weather.collectOre(reservation.id);
    await afterCommit(committed,{...intent,actorId,requestId:data.requestId});
    // Receipt replay retains the earned catch/deadlines, but clock synchronization needs response time.
    if(data.type==='fishHunt')return {...committed.reply,result:{...committed.reply.result,serverNow:Date.now()}};
    return committed.reply;
    } finally {if(reservation)reservation.world.oreClaims.delete(reservation.id);}
  };
}
