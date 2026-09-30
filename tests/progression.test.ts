import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';

const start=Date.UTC(2026,8,30,12);
const reload=(s:M.SaveState)=>M.parseSave(JSON.stringify(s))!;
test('story progression counts only actions performed during the current event step',()=>{
  const s=M.newGame();P.recordEvent(s,'sell',100,undefined,start);P.recordEvent(s,'harvest',3,undefined,start);
  const first=P.progressEntries(s,'story',start)[0];assert.equal(first.complete,true);assert.equal(first.rewardLabel,'36 energy · 6 XP · 15 stars');assert.equal(P.claimProgress(s,'story',first.id,start),true);assert.equal(P.claimProgress(s,'story',first.id,start),false);
  assert.equal(P.progressEntries(s,'story',start)[0].progress,0);P.recordEvent(s,'sell',19,undefined,start);assert.equal(P.claimProgress(s,'story','story:1',start),false);P.recordEvent(s,'sell',1,undefined,start);assert.equal(P.claimProgress(s,'story','story:1',start),true);assert.equal(s.quest,2);
});
test('daily and weekly selections are deterministic, unique and level eligible',()=>{
  const a=M.newGame('Tester'),b=M.newGame('Tester');P.refreshProgress(a,start);P.refreshProgress(b,start);
  assert.deepEqual(a.progression.daily,b.progression.daily);assert.equal(a.progression.daily.tasks.length,3);assert.equal(new Set(a.progression.daily.tasks.map(t=>t.type)).size,3);assert.equal(a.progression.weekly.tasks.length,4);assert.equal(new Set(a.progression.weekly.tasks.map(t=>t.type)).size,4);
  assert.ok(a.progression.daily.tasks.every(t=>!['boss','planet'].includes(t.type)));const prior=a.progression.daily.tasks.map(t=>t.type);assert.equal(P.rerollDaily(a,0,start),true);assert.ok(!prior.includes(a.progression.daily.tasks[0].type));assert.equal(P.rerollDaily(a,1,start),false);
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
  const s=M.newGame('Journey tester');let clock=Date.now(),harvests=0,kills=0;
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
