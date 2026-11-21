import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { ENEMY_TYPES } from '../src/enemy-types.ts';

const start=Date.UTC(2026,8,30,12);
const reload=(s:M.SaveState)=>M.parseSave(JSON.stringify(s))!;
test('story progression counts only actions performed during the current event step',()=>{
  const s=M.newGame();P.recordEvent(s,'sell',100,undefined,start);P.recordEvent(s,'harvest',3,undefined,start);
  const first=P.progressEntries(s,'story',start)[0];assert.equal(first.complete,true);assert.equal(first.rewardLabel,'67 energy · 24 XP · 15 stars · Fertilizer ×4'); /* story-gifts.ts: level bonus and starter items (FIX-PLAN 5.6) */assert.equal(P.claimProgress(s,'story',first.id,start),true);assert.equal(P.claimProgress(s,'story',first.id,start),false);
  assert.equal(P.progressEntries(s,'story',start)[0].progress,0);P.recordEvent(s,'sell',19,undefined,start);assert.equal(P.claimProgress(s,'story','story:1',start),false);P.recordEvent(s,'sell',1,undefined,start);assert.equal(P.claimProgress(s,'story','story:1',start),true);assert.equal(s.quest,2);
});
test('daily and weekly selections are deterministic, unique and level eligible',()=>{
  const a=M.newGame('Tester'),b=M.newGame('Tester');P.refreshProgress(a,start);P.refreshProgress(b,start);
  assert.deepEqual(a.progression.daily,b.progression.daily);assert.equal(a.progression.daily.tasks.length,3);assert.equal(new Set(a.progression.daily.tasks.map(t=>t.type)).size,3);assert.equal(a.progression.weekly.tasks.length,4);assert.equal(new Set(a.progression.weekly.tasks.map(t=>t.type)).size,4);
  assert.ok(a.progression.daily.tasks.every(t=>!['boss','planet'].includes(t.type)));const prior=a.progression.daily.tasks.map(t=>t.type);assert.equal(P.rerollDaily(a,0,start),true);assert.ok(!prior.includes(a.progression.daily.tasks[0].type));assert.equal(P.rerollDaily(a,1,start),true);assert.equal(P.rerollDaily(a,2,start),true);assert.equal(P.rerollDaily(a,0,start),false);
});
test('daily quests, daily chest and check-in each award once and persist',()=>{
  const s=M.newGame();P.refreshProgress(s,start);
  const login=P.progressEntries(s,'daily',start).find(e=>e.id.endsWith('login'))!;assert.equal(P.claimProgress(s,'daily',login.id,start),true);assert.equal(s.energy,30);assert.equal(s.progression.login.streak,1);assert.equal(P.claimProgress(reload(s),'daily',login.id,start),false);
  for(const t of s.progression.daily.tasks){P.recordEvent(s,t.type,t.target,undefined,start);}
  const tasks=P.progressEntries(s,'daily',start).filter(e=>!e.id.endsWith('login')&&!e.id.endsWith('chest'));for(const entry of tasks){assert.equal(entry.complete,true,entry.title);assert.equal(P.claimProgress(s,'daily',entry.id,start),true);assert.equal(P.claimProgress(s,'daily',entry.id,start),false);}
  const chest=P.progressEntries(s,'daily',start).find(e=>e.id.endsWith('chest'))!;assert.equal(chest.complete,true);assert.equal(P.claimProgress(s,'daily',chest.id,start),true);assert.equal(P.claimProgress(reload(s),'daily',chest.id,start),false);
  const tomorrow=start+86400000;assert.equal(P.claimProgress(s,'daily',login.id,tomorrow),false);const next=P.progressEntries(s,'daily',tomorrow).find(e=>e.id.endsWith('login'))!;assert.equal(P.claimProgress(s,'daily',next.id,tomorrow),true);assert.equal(s.progression.login.streak,2);assert.equal(s.progression.daily.chest,false);
});
test('UTC week and month boundaries reject stale rewards and reset only their periods',()=>{
  const s=M.newGame();P.refreshProgress(s,start);s.progression.pass.stars=50;const pass=P.progressEntries(s,'pass',start)[0];assert.equal(P.claimProgress(s,'pass',pass.id,start),true);assert.equal(s.bag.potion,3);assert.equal(P.claimProgress(reload(s),'pass',pass.id,start),false);
  P.recordEvent(s,'kill',2,undefined,start);const oldWeek=s.progression.weekly.key;P.refreshProgress(s,Date.UTC(2026,9,1));assert.equal(s.progression.pass.stars,0);assert.equal(s.progression.weekly.key,oldWeek);assert.equal(P.claimProgress(s,'pass',pass.id,Date.UTC(2026,9,1)),false);P.refreshProgress(s,Date.UTC(2026,9,5));assert.equal(s.progression.weekly.key,'2026-10-05');assert.ok(s.progression.weekly.tasks.every(t=>t.progress===0));assert.equal(s.progression.totals.kill,2);
});
test('weekly targets and chest require completed claims and cannot be replayed',()=>{
  const s=M.newGame();P.refreshProgress(s,start);let chest=P.progressEntries(s,'weekly',start).find(e=>e.id.endsWith('chest'))!;assert.equal(P.claimProgress(s,'weekly',chest.id,start),false);
  for(const t of s.progression.weekly.tasks)P.recordEvent(s,t.type,t.target,undefined,start);for(const e of P.progressEntries(s,'weekly',start).filter(e=>!e.id.endsWith('chest')))assert.equal(P.claimProgress(s,'weekly',e.id,start),true);
  chest=P.progressEntries(s,'weekly',start).find(e=>e.id.endsWith('chest'))!;assert.equal(chest.complete,true);assert.equal(P.claimProgress(s,'weekly',chest.id,start),true);assert.ok((s.bag.seed_star||0)>=2);assert.ok((s.bag.moonstone||0)>=1);assert.equal(P.claimProgress(reload(s),'weekly',chest.id,start),false);
});
test('achievements unlock successive tiers and cannot replay a claimed tier',()=>{
  const s=M.newGame();P.recordEvent(s,'kill',50,undefined,start);const first=P.progressEntries(s,'achievements',start).find(e=>e.id==='kills:0')!;assert.equal(first.complete,true);assert.equal(P.claimProgress(s,'achievements',first.id,start),true);assert.equal(P.claimProgress(s,'achievements',first.id,start),false);
  const next=P.progressEntries(reload(s),'achievements',start).find(e=>e.id==='kills:1')!;assert.equal(next.target,200);assert.equal(next.progress,50);assert.equal(next.complete,false);
});
test('bounties count only the requested creature and expire at the saved half-hour boundary',()=>{
  const s=M.newGame();P.refreshProgress(s,start);const b=s.progression.bounty!;P.recordEvent(s,'kill',20,'not-the-target',start);assert.equal(b.progress,0);P.recordEvent(s,'kill',b.target,b.type,start);const entry=P.progressEntries(s,'bounties',start)[0];assert.equal(entry.complete,true);assert.equal(P.claimProgress(s,'bounties',entry.id,start),true);assert.equal(P.claimProgress(reload(s),'bounties',entry.id,start),false);assert.equal(s.progression.totals.bounty,1);
  P.refreshProgress(s,b.ends);assert.notEqual(s.progression.bounty!.key,b.key);assert.equal(s.progression.bounty!.progress,0);assert.equal(P.claimProgress(s,'bounties',entry.id,b.ends),false);
});
test('bounty and challenge labels name the creature and the task, not internal ids',()=>{
  for(const[id,planet]of Object.entries(M.PLANETS))for(const[type]of planet.spawns)assert.ok(ENEMY_TYPES[type]?.name,`${id}: bounty candidate ${type} has no display name`);
  const s=M.newGame();P.refreshProgress(s,start);const b=s.progression.bounty!;const bounty=P.progressEntries(s,'bounties',start)[0];
  assert.equal(bounty.title,`Wanted: ${ENEMY_TYPES[b.type].name}`);assert.ok(!bounty.title.endsWith(`: ${b.type}`));
  s.level=2;assert.equal(P.startChallenge(s,'kill',start),true);assert.equal(P.progressEntries(s,'challenges',start)[0].title,'Quick challenge: Defeat creatures');
});
test('timed challenges track successful actions and preserve/restart streaks correctly',()=>{
  const s=M.newGame();assert.equal(P.startChallenge(s,'kill',start),false);s.level=2;assert.equal(P.startChallenge(s,'kill',start),true);assert.equal(P.startChallenge(s,'fish',start),false);P.recordEvent(s,'kill',4,'mushroom',start+5000);const entry=P.progressEntries(s,'challenges',start+5000)[0];assert.equal(entry.complete,true);assert.equal(P.claimProgress(s,'challenges',entry.id,start+5000),true);assert.equal(s.progression.streak,1);assert.equal(P.claimProgress(reload(s),'challenges',entry.id,start+5000),false);
  assert.equal(P.startChallenge(s,'skill',start+6000),true);P.refreshProgress(s,start+51001);assert.equal(s.progression.challenge,null);assert.equal(s.progression.streak,0);assert.equal(s.progression.bestStreak,1);
});
test('collection records every acquired item and offers no invented claimable reward',()=>{
  const s=M.newGame();for(const id of M.COLLECTIONS.lava.items)M.addItem(s,id);const entry=P.progressEntries(s,'collection',start).find(e=>e.id==='lava')!;assert.equal(entry.complete,true);assert.equal(entry.claimed,true);assert.equal(P.claimProgress(s,'collection','lava',start),false);const r=reload(s);assert.deepEqual(r.collection,s.collection);
});
test('malformed progression tasks regenerate and prototype-named events are rejected',()=>{
  const s=M.newGame();P.refreshProgress(s,start);s.progression.daily.tasks=[];const r=reload(s);assert.equal(P.progressEntries(r,'daily',start).filter(e=>!e.id.endsWith('login')&&!e.id.endsWith('chest')).length,3);
  const before=JSON.stringify(r);P.recordEvent(r,'constructor',2);P.recordEvent(r,'__proto__',2);assert.equal(JSON.stringify(r),before);assert.equal(P.startChallenge(r,'constructor',start),false);
});
test('all29 story milestones are reachable using real farming, reward, purchase and travel operations',()=>{
  const s=M.newGame('Journey tester');s.bagUp=5;/* a 40-slot bag (storage-slots.ts): the loot of every story fight stays in reach */let clock=Date.now(),harvests=0,kills=0;
  const farm=()=>{const crop=s.level>=13?'goldcorn':s.level>=9?'melon':s.level>=6?'star':s.level>=4?'candy':s.level>=2?'pumpkin':'radish';M.plantAll(s,crop,clock);clock+=M.CROPS[crop].duration;const items=M.harvestAll(s,clock);assert.ok(items.length);harvests+=items.length;for(const id of new Set(items))M.sell(s,id,M.looseQuantity(s,id));assert.ok(harvests<30000,'farming must progress without a softlock');};
  const fund=(amount:number)=>{while(s.energy<amount)farm();};const level=(target:number)=>{while(s.level<target)farm();};
  const defeat=(type='mushroom',boss=false,count=1)=>{for(let i=0;i<count;i++){M.grantDefeat(s,type,boss?100:8,boss,()=>0);kills++;}};
  for(let index=0;index<29;index++){
    assert.equal(s.quest,index);const q=P.storyStep(index);
    if(q.event==='harvest')farm();else if(q.event==='sell'){while(P.progressEntries(s,'story')[0].progress<q.target)farm();}
    else if(q.event==='craft'){fund(q.target*25);for(let i=0;i<q.target;i++)assert.equal(M.buy(s,index===2?'sword_wood':'potion'),true);}
    else if(q.condition==='equipped')assert.equal(M.equip(s,'sword_wood'),true);
    else if(q.event==='kill')defeat('mushroom',false,q.target);
    else if(q.event==='upgrade'){fund(M.upgradeCost(s,'attack'));assert.equal(M.upgrade(s,'attack'),true);}
    else if(q.event==='fish'){fund(20);assert.equal(M.buy(s,'rod'),true);M.equip(s,'rod');for(let i=0;i<q.target;i++)assert.equal(M.grantCatch(s,'fish_perch'),true);}
    else if(q.event==='skill')for(let i=0;i<q.target;i++)P.recordEvent(s,'skill');
    else if(q.condition==='level')level(q.target);
    else if(q.condition==='plots')assert.equal(M.expandGarden(s),true);
    else if(q.event==='cook'){if(!s.bag.meat)defeat('mushroom',false,3);assert.equal(M.cook(s,'meat',3),true);}
    else if(q.event==='boss')defeat('bear',true,q.target);
    else if(q.event==='fishrare')assert.equal(M.grantCatch(s,'fish_koi'),true);
    else if(q.event==='planet'){level(6);fund(40);assert.equal(M.travel(s,'candy'),true);}
    else if(q.event==='mine'){for(let i=0;i<q.target;i++){clock+=M.MINE_REGROW_MS;assert.equal(M.claimMine(s,0,clock),true);}}
    else if(q.condition==='visited'){for(const[id,p]of Object.entries(M.PLANETS)){if(s.visited.length>=q.target)break;level(p.level);fund(p.fare);assert.equal(M.travel(s,id as M.PlanetId),true);}M.travel(s,'home');}
    else if(q.condition==='decor'){level(4);fund(30);M.travel(s,'toy');defeat('robot',true,2);M.travel(s,'home');assert.equal(M.placeDecoration(s,'deco_traincar',5,5),true);assert.equal(M.placeDecoration(s,'deco_traincar',8,5),true);}
    else if(q.condition==='disguise'){level(20);fund(160);M.travel(s,'shadow');defeat('wisp',false,4);M.travel(s,'home');defeat('boar',false,8);defeat('bear',true,2);fund(360);assert.equal(M.buy(s,'dz_ninja'),true);assert.equal(M.equip(s,'dz_ninja'),true);}
    const e=P.progressEntries(s,'story')[0];assert.equal(e.complete,true,`Step${index+1}: ${e.title}`);assert.equal(P.claimProgress(s,'story',e.id),true);assert.equal(P.claimProgress(s,'story',e.id),false);
    assert.ok(s.energy>=0);assert.ok(s.hp>0);
  }
  assert.equal(s.quest,29);assert.ok(s.level>=25);assert.equal(s.visited.length,9);assert.equal(s.decorations.length,2);assert.ok(s.bag.seed_star);assert.ok(harvests>0);assert.ok(kills>150);assert.equal(P.progressEntries(s,'story')[0].description,'Chapter 5 · Step 30');
  const r=reload(s);assert.equal(r.quest,29);assert.equal(r.level,s.level);assert.equal(r.gear.disguise,'dz_ninja');
});

test('winding the clock back never re-rolls or re-pays dailies: the newest date key is kept',()=>{
  const s=M.newGame();P.refreshProgress(s,start);const today=JSON.stringify(s.progression.daily),week=s.progression.weekly.key;
  const login=P.progressEntries(s,'daily',start).find(e=>e.id.endsWith('login'))!;assert.equal(P.claimProgress(s,'daily',login.id,start),true);const energy=s.energy;
  const yesterday=start-86400000;
  P.refreshProgress(s,yesterday);
  assert.equal(JSON.stringify(s.progression.daily),today,'an earlier day keeps today\'s tasks');assert.equal(s.progression.weekly.key,week);
  const back=P.progressEntries(s,'daily',yesterday).find(e=>e.id.endsWith('login'))!;assert.equal(back.claimed,true);assert.equal(P.claimProgress(s,'daily',back.id,yesterday),false);assert.equal(s.energy,energy);
  P.refreshProgress(s,start);assert.equal(JSON.stringify(s.progression.daily),today,'returning to today does not re-roll');
  P.refreshProgress(s,start+86400000);assert.notEqual(s.progression.daily.key,JSON.parse(today).key,'a real new day still rolls');
});

// ---- AAA-PLAN WP24: the bounty cap ----
test('a bounty never names a creature more than one level above the explorer; at level 30 every creature is still offered',()=>{
  assert.equal(P.BOUNTY_LEVELS_ABOVE,1);
  // The level a hunter meets a creature at: the zone's difficulty x 3 - 2 (the easiest home zone it lives in).
  assert.deepEqual(['mushroom','boar','bee','wolf','chomper','cactus'].map(id=>P.bountyLevel('home',id)),[1,1,1,4,4,7]);
  assert.deepEqual(['candy','ice','lava','toy','jungle','ocean','cloud','shadow'].map(id=>P.bountyLevel(id,'x')),[7,10,13,4,7,10,13,16]);
  assert.deepEqual(P.bountyChoices('home',1),['bee','boar','mushroom']);assert.deepEqual(P.bountyChoices('home',3),['bee','boar','chomper','mushroom','wolf']);assert.equal(P.bountyChoices('home',6).length,6);
  for(let level=1;level<=10;level++)for(const[planet,def]of Object.entries(M.PLANETS)){
    if(def.level>level)continue; // a planet the explorer can reach
    const seen=new Set<string>();
    for(let seed=0;seed<200;seed++){
      const s=M.newGame('Seed '+seed);s.level=level;s.planet=planet as M.SaveState['planet'];P.refreshProgress(s,start+seed*1800000);
      const b=s.progression.bounty;assert.ok(b,planet+' level '+level+': a bounty is offered');
      assert.ok(P.bountyLevel(planet,b.type)<=level+1,planet+' level '+level+' seed '+seed+': '+b.type+' is level '+P.bountyLevel(planet,b.type));seen.add(b.type);
      // The rotation is deterministic: the same explorer, place and half hour name the same creature.
      const again=M.newGame('Seed '+seed);again.level=level;again.planet=s.planet;P.refreshProgress(again,start+seed*1800000);assert.deepEqual(again.progression.bounty,b);
    }
    assert.deepEqual([...seen].sort(),P.bountyChoices(planet,level),planet+' level '+level+': every fair creature comes round');
  }
  // Level 30: nothing is held back anywhere.
  for(const[planet,def]of Object.entries(M.PLANETS)){
    const all=[...new Set(def.spawns.map(([id])=>id))].sort(),seen=new Set<string>();assert.deepEqual(P.bountyChoices(planet,30),all,planet);
    for(let seed=0;seed<200;seed++){const s=M.newGame('Seed '+seed);s.level=30;s.planet=planet as M.SaveState['planet'];P.refreshProgress(s,start+seed*1800000);seen.add(s.progression.bounty!.type);}
    assert.deepEqual([...seen].sort(),all,planet+': every bounty is still offered at level 30');
  }
  // Too far from home for its level (only a tester gets there): no bounty rather than an unfair one.
  const lost=M.newGame();lost.planet='shadow';P.refreshProgress(lost,start);assert.equal(lost.progression.bounty,null);assert.deepEqual(P.progressEntries(lost,'bounties',start),[]);
});
test('a save from before the cap: a bounty already rolled lasts to the end of its half hour and still pays; the next one is fair',async()=>{
  const{readFileSync}=await import('node:fs');
  const key='home:'+Math.floor(start/1800000),ends=(Math.floor(start/1800000)+1)*1800000;
  // A level-1 explorer holding a cactus bounty (level 7) from before the cap, loaded inside the same half hour.
  const old=(progress:number,claimed=false)=>{const s=M.newGame('Old');P.refreshProgress(s,start);s.progression.bounty={key,type:'cactus',target:4,progress,claimed,ends};return reload(s);};
  for(const progress of[0,1]){
    const s=old(progress);P.refreshProgress(s,start+60000);assert.deepEqual(s.progression.bounty,{key,type:'cactus',target:4,progress,claimed:false,ends},'kept as it was offered');
    P.recordEvent(s,'kill',4,'cactus',start+60000);const entry=P.progressEntries(s,'bounties',start+60000)[0];assert.equal(entry.complete,true);assert.equal(P.claimProgress(s,'bounties',entry.id,start+60000),true,'and it pays');
    assert.equal(P.claimProgress(s,'bounties',entry.id,start+70000),false,'once');
    // The half hour ends (at most 30 minutes later): from here on every bounty is under the cap.
    P.refreshProgress(s,ends);assert.notEqual(s.progression.bounty!.key,key);assert.ok(P.bountyLevel('home',s.progression.bounty!.type)<=s.level+1);
  }
  const paid=old(4,true);P.refreshProgress(paid,start+60000);assert.equal(paid.progression.bounty!.claimed,true,'a claimed one is not paid twice');
  // Any later visit (the usual case: another half hour) rolls a fair one at once.
  const later=old(0);P.refreshProgress(later,start+86400000);assert.ok(['bee','boar','mushroom'].includes(later.progression.bounty!.type));
  // The four promo saves load; their next bounty is fair, and they save again.
  for(const name of['save-new','save-mid','save','save-late']){
    const s=M.parseSave(readFileSync(new URL('../promo/'+name+'.json',import.meta.url),'utf8'))!;assert.ok(s,name);
    P.refreshProgress(s,start);const b=s.progression.bounty;assert.ok(b&&P.bountyLevel(s.planet,b.type)<=s.level+1,name+': '+b?.type);assert.ok(reload(s),name);
  }
});
test('a bounty left for another planet is found as it was on the way back, creature and all, even a level higher',()=>{
  const s=M.newGame('Trip');s.level=4;P.refreshProgress(s,start);const home=s.progression.bounty!;P.recordEvent(s,'kill',1,home.type,start);
  s.planet='toy';P.refreshProgress(s,start+1000);assert.deepEqual(s.progression.bountyLog,{[home.key]:{progress:1,claimed:false,type:home.type}});assert.equal(P.bountyLevel('toy',s.progression.bounty!.type),4);
  const back=reload(s);assert.equal(back.progression.bountyLog![home.key].type,home.type,'the log keeps the creature through a save');back.planet='home';P.refreshProgress(back,start+2000);assert.deepEqual(back.progression.bounty,{...home,progress:1});
  // Level 5 -> 6 on the trip: the cactus joins the list (5 -> 6 creatures), so the half hour's pick moves for most names. The begun bounty must not.
  const half=Math.floor(start/1800000),pick=(name:string,level:number)=>{const g=M.newGame(name);g.level=level;P.refreshProgress(g,start);return g.progression.bounty!.type;};
  const name=Array.from({length:200},(_,i)=>'Hunter '+i).find(n=>pick(n,5)!==pick(n,6))!;assert.ok(name,'a name whose pick differs between level 5 and 6');
  const t=M.newGame(name);t.level=5;P.refreshProgress(t,start);const was=t.progression.bounty!;assert.equal(was.key,'home:'+half);P.recordEvent(t,'kill',2,was.type,start);
  t.planet='toy';P.refreshProgress(t,start+1000);t.level=6;t.planet='home';P.refreshProgress(t,start+2000);
  assert.equal(t.progression.bounty!.type,was.type,'the same creature, not the level-6 pick '+pick(name,6));assert.equal(t.progression.bounty!.progress,2);
  P.recordEvent(t,'kill',9,pick(name,6),start+3000);assert.equal(t.progression.bounty!.progress,2,'kills of the other creature do not count');
  // The next half hour picks from the level-6 list as usual.
  P.refreshProgress(t,was.ends);assert.equal(t.progression.bounty!.progress,0);assert.ok(P.bountyChoices('home',6).includes(t.progression.bounty!.type));
  // A log from before this rule has no creature: the half hour's pick is used. An unknown creature in a save is dropped by the parser.
  const legacy=reload(s);delete legacy.progression.bountyLog![home.key].type;const again=reload(legacy);again.planet='home';P.refreshProgress(again,start+2000);assert.equal(again.progression.bounty!.progress,1);assert.ok(P.bountyLevel('home',again.progression.bounty!.type)<=5);
  for(const bad of['no-such-creature',7,null]){const raw=JSON.parse(JSON.stringify(s));raw.progression.bountyLog[home.key].type=bad;const parsed=M.parseSave(JSON.stringify(raw))!.progression.bountyLog![home.key];assert.deepEqual(parsed,{progress:1,claimed:false});}
  // A creature of another planet in the log (a tampered save) is not offered here.
  const wrong=JSON.parse(JSON.stringify(s));wrong.progression.bountyLog[home.key].type='toysoldier';const w=M.parseSave(JSON.stringify(wrong))!;w.planet='home';P.refreshProgress(w,start+2000);assert.ok(P.bountyChoices('home',4).includes(w.progression.bounty!.type));
});
