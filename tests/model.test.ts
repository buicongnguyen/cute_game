import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';

const reload=(s:M.SaveState)=>M.parseSave(JSON.stringify(s))!;
const now=Date.now();
test('updated crop catalog retains nineteen unlocks with tenfold timers and triple XP/value plus eight fruits',()=>{
  const facts=[['radish',1,15,6,4],['carrot',1,10,4,3],['pumpkin',2,30,14,10],['mint',3,35,14,9],['chili',4,40,18,12],['candy',4,50,26,18],['bean',5,60,24,16],['star',6,80,45,32],['berry',6,70,30,20],['coffee',7,60,28,18],['moonflower',8,90,40,26],['magnetmelon',9,100,44,30],['melon',9,120,80,60],['clover',10,110,50,34],['glowshroom',11,100,48,30],['iceberry',12,120,60,40],['goldcorn',13,150,70,110],['dragonfruit',15,160,90,70],['rainbowrose',18,200,120,90]] as const;
  assert.equal(Object.keys(M.CROPS).length,27);
  for(const[id,level,time,xp,sell]of facts){assert.deepEqual([M.CROPS[id].level,M.CROPS[id].duration,M.CROPS[id].xp,M.ITEMS[id].sell],[level,time*10000,xp*3,sell*3]);}
  assert.deepEqual(['iceberry','dragonfruit','rainbowrose'].map(id=>M.CROPS[id].seed),['seed_ice','seed_fire','seed_star']);
});
test('nine starting beds, exact harvest boundary and no duplicate resources',()=>{
  const s=M.newGame();assert.equal(s.plots.length,9);assert.equal(s.energy,0);
  assert.equal(M.plant(s,0,'carrot',now),true);assert.equal(M.harvest(s,0,now+99999),null);assert.equal(M.harvest(s,0,now+100000),'carrot');assert.equal(M.harvest(s,0,now+100000),null);
  assert.equal(s.bag.carrot,1);assert.equal(s.xp,12);assert.equal(M.sell(s,'carrot',-1),0);assert.equal(M.sell(s,'carrot',2),0);assert.equal(M.sell(s,'carrot'),9);
  assert.equal(M.plant(s,0,'berry'),false);assert.equal(M.buy(s,'gun_bubble'),false);assert.equal(M.expandGarden(s),false);
});
test('rare seeds are consumed only when a valid empty unlocked bed is planted',()=>{
  const s=M.newGame();M.addItem(s,'seed_fire',2);assert.equal(M.plant(s,0,'dragonfruit',now),false);assert.equal(s.bag.seed_fire,2);
  s.level=15;assert.equal(M.plant(s,0,'dragonfruit',now),true);assert.equal(M.plant(s,0,'dragonfruit',now),false);assert.equal(M.plant(s,99,'dragonfruit',now),false);assert.equal(s.bag.seed_fire,1);
  assert.equal(M.plantAll(s,'dragonfruit',now),1);assert.equal(s.bag.seed_fire,undefined);assert.equal(M.harvestAll(s,now+1600000).length,2);
});
test('level formula, carry-over, health restoration and stat upgrade costs match the reference',()=>{
  const s=M.newGame();s.hp=1;const amount=M.xpNeeded(1)+M.xpNeeded(2)+5;assert.equal(M.gainXp(s,amount),2);assert.equal(s.level,3);assert.equal(s.xp,5);assert.equal(s.hp,120);
  assert.equal(M.xpNeeded(1),25);assert.equal(M.xpNeeded(5),Math.round(25*5**1.55));assert.equal(M.attack(s),13);assert.equal(M.defense(s),2);
  s.energy=1000;assert.equal(M.upgradeCost(s,'health'),12);M.upgrade(s,'health');assert.equal(M.maxHp(s),145);assert.equal(M.upgradeCost(s,'health'),17);M.upgrade(s,'attack');M.upgrade(s,'defense');M.upgrade(s,'crit');
  assert.equal(M.attack(s),16);assert.equal(M.defense(s),6);assert.equal(M.activeStats(s).critChance,.07500000000000001);
  s.critUp=28;const before=s.energy;assert.equal(M.upgrade(s,'crit'),false);assert.equal(s.energy,before);
});
test('manure and spore each advance half the original growth timer',()=>{
  const s=M.newGame();M.addItem(s,'manure',2);M.addItem(s,'spore',2);assert.equal(M.fertilize(s,0,now),false);M.plant(s,0,'carrot',now);
  assert.equal(M.fertilize(s,0,now+2000,'manure'),true);assert.equal(M.cropProgress(s.plots[0],now+2000),.52);assert.equal(s.bag.manure,1);
  assert.equal(M.fertilize(s,0,now+2000),true);assert.equal(M.fertilize(s,0,now+2000),false);assert.equal(s.bag.spore,1);assert.equal(M.harvest(s,0,now+2000),'carrot');
});
test('food buffs work at full HP, reapplication extends half remaining time, and expiry persists',()=>{
  const s=M.newGame();M.addItem(s,'carrot',3);assert.equal(M.eat(s,'carrot',now),true);assert.equal(M.activeStats(s,now).speed,7.199999999999999);
  M.eat(s,'carrot',now+10000);assert.equal(M.activeBuffs(s,now+10000)[0].remaining,62.5);const restored=reload(s);assert.equal(M.activeStats(restored,now+72500).speed,6);
  M.addItem(s,'radish');assert.equal(M.eat(s,'radish',now),false);s.hp=50;assert.equal(M.eat(s,'radish',now),true);assert.equal(s.hp,62);
  M.addBuff(s,{regen:3,time:60},'mint',now);M.tickEffects(s,.5,now);assert.equal(s.hp,63.5);M.tickEffects(s,1,now+60000);assert.equal(s.hp,63.5);
});
test('cooking improves crop and fish value, healing and precise buff strength',()=>{
  const s=M.newGame();M.addItem(s,'moonflower',2);assert.equal(M.cook(s,'moonflower',2),true);assert.equal(s.bag.moonflower,undefined);assert.equal(s.bag.cooked_moonflower,2);
  const cooked=M.ITEMS.cooked_moonflower;assert.equal(cooked.sell,Math.round(78*2.2)+2);assert.equal(cooked.heal,68);assert.equal(cooked.buff!.crit,.12*1.35);assert.equal(cooked.buff!.time,180);assert.equal(M.cook(s,'cooked_moonflower'),false);
  s.planet='toy';M.addItem(s,'fish_perch');assert.equal(M.cook(s,'fish_perch'),false);assert.equal(s.bag.fish_perch,1);
});
test('material purchases and crafting preserve funds and items on failure',()=>{
  const s=M.newGame();const index=M.RECIPES.findIndex(r=>r.station==='craft'&&r.result==='boots_lava'),r=M.RECIPES[index];s.energy=r.energy;
  const before=JSON.stringify(s);assert.equal(M.craft(s,index),false);assert.equal(JSON.stringify(s),before);
  for(const[id,n]of Object.entries(r.materials))M.addItem(s,id,n);assert.equal(M.craft(s,index),true);assert.equal(s.energy,0);assert.equal(s.bag.boots_lava,1);assert.equal(M.equip(s,'boots_lava'),true);assert.equal(M.activeStats(s).lavaproof,true);
  const offer=M.RECIPES.find(r=>r.station==='shop'&&Object.keys(r.materials).length>0)!;s.energy=offer.energy;assert.equal(M.buy(s,offer.result),false);for(const[id,n]of Object.entries(offer.materials))M.addItem(s,id,n);assert.equal(M.buy(s,offer.result),true);
});
test('exactly one equipped copy is protected through selling, storage and death',()=>{
  const s=M.newGame();M.addItem(s,'hat_straw',3);M.equip(s,'hat_straw');assert.equal(M.looseQuantity(s,'hat_straw'),2);assert.equal(M.sell(s,'hat_straw',3),0);assert.equal(M.sell(s,'hat_straw'),10);
  assert.equal(M.transfer(s,'hat_straw',true),true);assert.equal(M.transfer(s,'hat_straw',true),false);assert.equal(s.bag.hat_straw,1);M.transfer(s,'hat_straw',false);M.die(s,1,2);assert.equal(s.bag.hat_straw,1);assert.equal(s.dropped?.items.hat_straw,1);assert.equal(M.recoverBag(s),true);
  assert.equal(M.unequip(s,'hat'),true);assert.equal(M.looseQuantity(s,'hat_straw'),2);assert.equal(M.unequip(s,'hat'),false);
});
test('all sixteen disguises provide four skill definitions and override weapon metadata',()=>{
  const s=M.newGame();assert.equal(Object.keys(M.DISGUISES).length,16);assert.equal(M.weaponStats(s).kind,'fist');
  for(const[id,d]of Object.entries(M.DISGUISES)){assert.equal(d.skills.length,4);M.addItem(s,id);assert.equal(M.equip(s,id),true);assert.equal(M.weaponStats(s).kind,d.weapon.kind);assert.ok(M.weaponStats(s).range>0);assert.ok(M.weaponStats(s).cd>0);}
  assert.equal(M.unequip(s,'disguise'),true);M.addItem(s,'rod');M.equip(s,'rod');assert.equal(M.weaponStats(s).kind,'rod');
});
test('fifteen paid or kit garden expansions and decoration movement are lossless',()=>{
  const s=M.newGame();M.addItem(s,'plot_kit');assert.equal(M.expandGarden(s),true);assert.equal(s.energy,0);assert.equal(M.gardenExpansionCost(s),80);s.energy=100000;
  for(let i=1;i<15;i++)assert.equal(M.expandGarden(s),true,`expansion ${i}`);assert.equal(s.plots.length,24);assert.equal(M.expandGarden(s),false);
  const d=M.newGame();M.addItem(d,'deco_lamp');assert.equal(M.placeDecoration(d,'deco_lamp',50,0),false);assert.equal(M.placeDecoration(d,'deco_lamp',5,5),true);assert.equal(d.bag.deco_lamp,undefined);const uid=d.decorations[0].uid;
  assert.equal(M.moveDecoration(d,uid,7,5,.4),true);const restored=reload(d);assert.deepEqual(restored.decorations,d.decorations);assert.equal(M.removeDecoration(restored,uid),true);assert.equal(restored.bag.deco_lamp,1);assert.equal(M.removeDecoration(restored,uid),false);
});
test('a launch costs 20 energy, landing follows reference level gates and death bags survive multiple defeats',()=>{
  const s=M.newGame();s.energy=19;assert.equal(M.launch(s),false);s.energy=100;assert.equal(M.launch(s),true);assert.equal(s.energy,80);
  s.level=5;assert.equal(M.travel(s,'candy'),false);assert.equal(M.canLand(s,'candy'),false);s.level=6;assert.equal(M.travel(s,'candy'),true);assert.equal(s.energy,80,'landing itself is free');
  assert.deepEqual(s.discovered,['home','candy']);assert.equal(M.discover(s,'candy'),false);assert.equal(M.discover(s,'ice'),true);
  M.addItem(s,'carrot',2);M.die(s,2,3);assert.equal(s.planet,'home');assert.equal(M.recoverBag(s),false);assert.equal(M.travel(s,'candy'),true);assert.equal(M.recoverBag(s),true);assert.equal(M.recoverBag(s),false);M.die(s,2,3);M.addItem(s,'wood',3);M.die(s,1,2);assert.equal(s.chest.carrot,2);assert.equal(s.dropped?.items.wood,3);assert.equal(M.travel(s,'home'),true);
});
test('defeats grant reference XP and probabilistic loot without an extra currency reward',()=>{
  const s=M.newGame();const loot=M.grantDefeat(s,'mushroom',8,false,()=>0);assert.equal(s.xp,8);assert.equal(s.energy,0);assert.equal(s.counters.kills,1);assert.deepEqual(loot,[{id:'manure',count:1},{id:'spore',count:1},{id:'meat',count:1}]);assert.equal(s.collection.spore,1);
  M.grantCatch(s,'fish_perch',20);assert.equal(s.counters.fish,1);assert.equal(s.fishRecords.fish_perch,20);assert.equal(s.collection.fish_perch,1);assert.equal(M.grantCatch(s,'wood'),false);
});
test('a bigger fish pays a bigger bonus: double at the species maximum, more beyond, and the huge flag is at least 1.6',()=>{
  const fish=M.FISH.fish_perch,[lo,hi]=fish.size,at=(size:number,huge=false)=>{const s=M.newGame();M.grantCatch(s,'fish_perch',size,huge);return s;};
  const small=at(lo),big=at(hi),giant=at(hi+(hi-lo)),flagged=at(lo,true);
  assert.equal(small.energy,0);assert.equal(small.xp,fish.xp);
  assert.equal(big.energy,fish.sell);assert.equal(big.xp,fish.xp*2);assert.equal(M.catchMultiplier(fish,hi),2);
  assert.equal(giant.energy,fish.sell*2);assert.equal(M.catchMultiplier(fish,hi+(hi-lo)),3);
  assert.equal(flagged.energy,Math.round(fish.sell*.6));assert.equal(flagged.xp,fish.xp*2);assert.equal(big.progression.totals.fishrare,undefined);assert.equal(big.fishRecords.fish_perch,hi);
  assert.ok(M.catchMultiplier(fish,(lo+hi)/2)>1&&M.catchMultiplier(fish,(lo+hi)/2)<2,'a middling fish gets a small bonus');
  const junk=M.newGame();M.grantCatch(junk,'boot',60,true);assert.equal(junk.energy,0);assert.equal(junk.xp,M.FISH.boot.xp);
});
test('mine cooldowns and separate environment resources persist across travel and reload',()=>{
  const s=M.newGame();s.level=20;s.energy=1000;M.travel(s,'candy');assert.equal(M.claimMine(s,0,now),true);assert.equal(M.claimMine(s,0,now),false);assert.equal(M.claimMine(s,1,now),true);assert.equal(s.bag.sugar,2);
  const r=reload(s);M.travel(r,'home');M.travel(r,'candy');assert.equal(M.claimMine(r,0,now+19999),false);assert.equal(M.claimMine(r,0,now+20000),true);assert.equal(r.bag.sugar,3);M.travel(r,'lava');assert.equal(M.claimMine(r,0,now),true);assert.equal(r.bag.mcrystal,1);
  assert.equal(M.claimEnvironmentResource(r,'lava:fire0','fcrystal',now,30000),true);assert.equal(M.claimEnvironmentResource(reload(r),'lava:fire0','fcrystal',now+29999,30000),false);assert.equal(M.claimEnvironmentResource(r,'constructor','fcrystal',now),false);
});
test('Toybox random gifts regrow after45seconds and saved cooldown blocks reload farming',()=>{
  const s=M.newGame();s.planet='toy';const coins=M.claimGift(s,25,now,()=>.4);assert.equal(coins&&coins.kind,'coins');assert.equal(s.energy,38);assert.equal(M.claimGift(s,25,now),false);
  const r=reload(s);assert.equal(M.giftAvailable(r,'toy',25,now+44999),false);assert.equal(M.giftAvailable(r,'toy',25,now+45000),true);assert.equal(M.claimGift(r,25,now+45000,()=>0).kind,'giant');assert.equal(M.activeStats(r,now+45000).sizeScale,1.7);assert.equal(M.activeStats(r,now+65000).sizeScale,1);
  assert.equal(M.claimGift(s,0,now,()=>.99).kind,'curse');assert.equal(M.activeStats(reload(s),now).speed,3.5999999999999996);assert.equal(M.claimGift(s,26,now),false);
});
test('lava braziers, gate, daily chest and furnace cannot be replayed for rewards',()=>{
  const s=M.newGame();s.planet='lava';assert.equal(M.claimCaveChest(s,now),false);assert.equal(M.openCave(s),true);assert.equal(M.openCave(s),false);assert.equal(M.lightBrazier(s,0),false);M.addItem(s,'fcrystal',3);
  for(let i=0;i<3;i++)assert.equal(M.lightBrazier(s,i,()=>0),true);assert.equal(M.lightBrazier(s,0),false);assert.equal(M.furnaceReady(reload(s)),true);assert.equal(M.claimCaveChest(s,now,()=>0),true);assert.equal(s.bag.obsidian,5);assert.equal(s.bag.firecore,3);assert.equal(s.bag.deco_volcano,1);assert.equal(M.claimCaveChest(reload(s),now),false);assert.equal(M.claimCaveChest(s,now+86400000),true);
  M.addItem(s,'mcrystal',3);const forge=M.RECIPES.findIndex(r=>r.station==='forge'&&r.result==='obsidian');assert.equal(M.craft(s,forge),true);
});
test('version1 migration aliases old inventory, gear, crops and dropped assets without loss',()=>{
  const old={...M.newGame(),contentVersion:undefined,plots:Array.from({length:8},()=>({crop:'turnip',plantedAt:now})),bag:{turnip:3,radish:2,sword:1,crystal:4,wood:2},chest:{fertilizer:3},gear:{weapon:'sword'},dropped:{x:1,z:2,planet:'candy',items:{ember:2,fish:4}},worldRewards:{collectedGifts:{toy:[0]},mineReadyAt:{}},savedAt:now};
  const r=M.parseSave(JSON.stringify(old))!;assert.equal(r.contentVersion,3);assert.equal(r.plots.length,11);assert.equal(r.plots[0].crop,'radish');assert.deepEqual(r.bag,{radish:5,sword_wood:1,starshard:4,wood:2});assert.deepEqual(r.chest,{spore:3});assert.equal(r.gear.weapon,'sword_wood');assert.deepEqual(r.dropped?.items,{magma:2,fish_perch:4});assert.equal(M.giftAvailable(r,'toy',0,now),false);assert.equal(M.giftAvailable(r,'toy',0,now+45000),true);assert.equal(reload(r).plots.length,11);
});
test('the original six-bed save gains three fully positioned interactive beds and retains its color',()=>{
  const old={...M.newGame('Clover','#69c5ff'),contentVersion:undefined,plots:Array.from({length:6},(_,i)=>({crop:i===2?'carrot':null,plantedAt:i===2?1234:0})),bag:{rod:1,sword:1},energy:32,level:3};
  const r=M.parseSave(JSON.stringify(old))!;assert.equal(r.plots.length,9);assert.equal(r.color,'#69c5ff');assert.equal(r.energy,32);assert.equal(r.bag.rod,1);assert.equal(r.bag.sword_wood,1);assert.equal(r.plots[2].crop,'carrot');assert.equal(r.plots[2].plantedAt,1234);
  for(let i=0;i<9;i++){assert.deepEqual({x:r.plots[i].x,z:r.plots[i].z},M.defaultBed(i));}assert.equal(M.plant(r,8,'radish',now),true);
});
test('all public catalog labels use consistent English while identifiers remain unchanged',()=>{
  const names=[...Object.values(M.ITEMS).map(i=>i.name),...Object.values(M.CROPS).map(i=>i.name),...Object.values(M.PLANETS).map(i=>i.name),...Object.values(M.DISGUISES).flatMap(d=>[d.name,...d.skills.map(s=>s.name)]),...Object.values(M.COLLECTIONS).map(c=>c.name),...M.RECIPES.map(r=>r.category)];
  assert.ok(names.every(name=>!/[^\x00-\x7F]/.test(name)));assert.equal(M.ITEMS.carrot.name,'Carrot');assert.equal(M.PLANETS.home.name,'Clover Village');assert.equal(M.ITEMS.deco_lamp.name,'Lava lamp');
});
test('legitimate level1000 progress and all runtime state round-trip safely',()=>{
  const s=M.newGame('Returning explorer');let earned=0;for(let level=1;level<=999;level++)earned+=M.xpNeeded(level);M.gainXp(s,earned+7);assert.equal(s.level,1000);const r=reload(s);assert.equal(r.level,1000);assert.equal(r.xp,7);assert.equal(r.savedAt,s.savedAt);
  M.addItem(s,'sword_wood');M.equip(s,'sword_wood');M.addBuff(s,{speed:.2,time:30},'carrot',now);M.plant(s,0,'berry',now);assert.deepEqual(reload(s),s);
});
test('inherited IDs, non-object roots and malformed optional state cannot enter saves or operations',()=>{
  const s=M.newGame();for(const raw of ['null','[]','true','1','"save"','{bad'])assert.equal(M.parseSave(raw),null);
  for(const id of ['__proto__','constructor','toString']){assert.equal(M.parseSave(JSON.stringify({...s,planet:id})),null);assert.equal(M.addItem(s,id),false);assert.equal(M.plant(s,0,id),false);assert.equal(M.equip(s,id),false);assert.equal(M.sell(s,id),0);}
  const bag=JSON.parse('{"carrot":2,"sword":1,"constructor":3,"__proto__":4,"toString":5,"fish":-2,"wood":1.5,"ember":1e30}');
  const r=M.parseSave(JSON.stringify({...s,bag,chest:null,gear:{weapon:'sword',hat:'constructor',boots:'sword'},counters:null,settings:null,worldRewards:null,plots:[null,{crop:'constructor',plantedAt:1},'berry'],energy:Number.MAX_VALUE,xp:Number.MAX_VALUE,hp:Number.MAX_VALUE,healthUp:Number.MAX_VALUE,attackUp:Number.MAX_VALUE}))!;
  assert.deepEqual(r.bag,{carrot:2,sword_wood:1});assert.deepEqual(r.gear,{weapon:'sword_wood'});assert.equal(r.plots.length,9);assert.ok(r.plots.every(p=>p.crop===null));assert.ok(Number.isFinite(M.maxHp(r)));assert.ok(Number.isFinite(M.attack(r)));assert.ok(Number.isSafeInteger(r.energy));assert.ok(r.xp<M.xpNeeded(r.level));assert.deepEqual(r.settings,{sound:true,lowGraphics:false,difficulty:'easy'});
  assert.equal(M.parseSave(JSON.stringify({...s,dropped:{x:1,z:null,planet:'home',items:{carrot:1}}}))!.dropped,null);
});
test('invalid world actions and numeric overflow leave valuable state unchanged',()=>{
  const s=M.newGame();assert.equal(M.claimMine(s,0,now),false);assert.equal(M.claimGift(s,0,now),false);s.planet='toy';const before=JSON.stringify(s);
  for(const i of [-1,26,NaN,Infinity,.5])assert.equal(M.claimGift(s,i,now),false);for(const i of [-1,2,NaN,Infinity,.5])assert.equal(M.claimMine(s,i,now),false);for(const t of [-1,NaN,Infinity,Number.MAX_VALUE])assert.equal(M.claimMine(s,0,t),false);assert.equal(JSON.stringify(s),before);
  s.energy=100;s.bag.sword_wood=Number.MAX_SAFE_INTEGER;assert.equal(M.buy(s,'sword_wood'),false);assert.equal(s.energy,100);s.chest.sword_wood=Number.MAX_SAFE_INTEGER;assert.equal(M.transfer(s,'sword_wood',true),false);
});

test('stardust gives energy and sometimes a star shard; discovered planets survive reloads',()=>{
  const s=M.newGame();assert.equal(M.collectStardust(s,()=>.5),false);assert.equal(s.energy,3);assert.equal(s.bag.starshard??0,0);
  assert.equal(M.collectStardust(s,()=>.01),true);assert.equal(s.energy,6);assert.equal(s.bag.starshard,1);
  M.discover(s,'ocean');const restored=M.parseSave(JSON.stringify(s))!;assert.deepEqual(restored.discovered,['home','ocean']);
  const old=JSON.parse(JSON.stringify(s));delete old.discovered;old.visited=['home','toy'];assert.deepEqual(M.parseSave(JSON.stringify(old))!.discovered,['home','toy'],'older saves count visited planets as discovered');
});

test('new beds never land on village obstacles, and saved beds on top of them move on load', () => {
  const s = M.newGame(); s.energy = 1e7;
  while (M.expandGarden(s));
  assert.equal(s.plots.length, 24);
  for (const p of s.plots.slice(9)) assert.ok(M.bedClear(p.x!, p.z!), `${p.x},${p.z}`);
  // Explicit spots: the well and the cottage are refused.
  const t = M.newGame(); t.energy = 1e4;
  assert.equal(M.expandGarden(t, -7, -11), false); assert.equal(M.expandGarden(t, 0, -8), false); assert.equal(M.expandGarden(t, -13.65, 4.1), true);
  // An old save with a bed on the well and one stacked on a starting bed.
  const old = M.newGame(); old.plots.push({ crop: 'radish', plantedAt: 5, x: -7, z: -11 }, { crop: null, plantedAt: 0, x: -10.95, z: .05 });
  const r = reload(old), [well, stacked] = r.plots.slice(9);
  assert.ok(M.bedClear(well.x!, well.z!)); assert.equal(well.crop, 'radish'); assert.equal(well.plantedAt, 5);
  assert.ok(r.plots.slice(0, 10).every(p => Math.max(Math.abs(p.x! - stacked.x!), Math.abs(p.z! - stacked.z!)) >= M.BED_GAP));
  assert.deepEqual(r.plots.slice(0, 9).map(p => [p.x, p.z]), M.newGame().plots.map(p => [p.x, p.z]));
});
