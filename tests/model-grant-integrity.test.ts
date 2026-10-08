import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';

test('a death bag keeps whatever does not fit yet, including action retries', () => {
  const s = M.newGame(), at = Date.now();
  s.bag = { carrot: Number.MAX_SAFE_INTEGER, wood: 5 };
  s.deathBags = [{ id: 'b1', planet: 'home', x: 0, z: 0, items: { wood: 3, carrot: 1 }, at }];
  // What fits comes back; the rest stays in the bag (the reference: "Túi đầy! Vẫn còn đồ trong hũ.").
  assert.deepEqual(M.recoverBag(s, 'b1', at), { id: 'b1', taken: { wood: 3 }, left: 1 });
  assert.equal(s.bag.wood, 8); assert.deepEqual(s.deathBags?.[0].items, { carrot: 1 });
  const before = structuredClone(s);
  assert.equal(M.recoverBag(s, 'b1', at), false);
  assert.deepEqual(s, before);
  assert.throws(() => applyGameAction(s, { type: 'recoverBag', payload: { id: 'b1' } }, { now: at, random: Math.random }));
  assert.deepEqual(s, before);
  assert.ok(M.removeItem(s.bag, 'carrot'));
  assert.ok(M.recoverBag(s, 'b1', at));
  assert.equal(s.bag.carrot, Number.MAX_SAFE_INTEGER);
  assert.equal(s.deathBags, undefined);
  assert.equal(M.recoverBag(s, 'b1', at), false);
});

test('an unsuccessful decoration pickup preserves its placed object and collection', () => {
  const s = M.newGame();
  s.bag.deco_lamp = Number.MAX_SAFE_INTEGER;
  s.decorations.push({ uid: 'decor-1', id: 'deco_lamp', x: 7, z: 5, rotation: .4 });
  const before = structuredClone(s);
  assert.equal(M.removeDecoration(s, 'decor-1'), false);
  assert.deepEqual(s, before);
  M.removeItem(s.bag, 'deco_lamp');
  assert.equal(M.removeDecoration(s, 'decor-1'), true);
  assert.equal(s.decorations.length, 0);
  assert.equal(s.bag.deco_lamp, Number.MAX_SAFE_INTEGER);
});

test('failed mine and environment grants do not spend their resource cooldown or advance quests', () => {
  const s = M.newGame(); s.planet = 'candy'; s.bag.sugar = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(s), now = 1_000_000;
  assert.equal(M.claimMine(s, 0, now), false);
  assert.equal(M.claimEnvironmentResource(s, 'candy:sugar:0', 'sugar', now), false);
  assert.deepEqual(s, before);
  M.removeItem(s.bag, 'sugar', 2);
  assert.equal(M.claimMine(s, 0, now), true);
  assert.equal(M.claimEnvironmentResource(s, 'candy:sugar:0', 'sugar', now), true);
  assert.equal(s.bag.sugar, Number.MAX_SAFE_INTEGER);
});

test('invalid harvest clocks cannot bypass a crop growing deadline', () => {
  const s = M.newGame(); M.plant(s, 0, 'carrot', 1_000_000);
  const before = structuredClone(s);
  for (const now of [NaN, Infinity, -1]) assert.equal(M.harvest(s, 0, now), null);
  assert.deepEqual(s, before);
});

test('huge and supergiant catches reject unrepresentable energy before granting inventory, XP or records',()=>{
  for(const mystery of [false,true]){
    const s=M.newGame();s.energy=Number.MAX_SAFE_INTEGER;const before=structuredClone(s);
    assert.equal(mystery?M.grantMysteryCatch(s,'fish_perch',50,true):M.grantCatch(s,'fish_perch',50,true),false);
    assert.deepEqual(s,before);
    s.energy=0;assert.equal(mystery?M.grantMysteryCatch(s,'fish_perch',50,true):M.grantCatch(s,'fish_perch',50,true),true);
    assert.equal(s.bag.fish_perch,1);assert.equal(s.counters.fish,1);
  }
});

test('a final brazier keeps its crystal, unlit state and entire reward when one reward cannot fit',()=>{
  const s=M.newGame();s.planet='lava';s.worldRewards.lava.braziers=[0,1];s.bag={fcrystal:1,obsidian:Number.MAX_SAFE_INTEGER};
  const before=structuredClone(s);assert.equal(M.lightBrazier(s,2,()=>0),false);assert.deepEqual(s,before);
  delete s.bag.obsidian;assert.equal(M.lightBrazier(s,2,()=>0),true);assert.equal(s.bag.fcrystal,undefined);assert.equal(s.bag.firecore,2);assert.equal(s.bag.deco_volcano,1);assert.equal(s.bag.obsidian,2);
});

test('daily cave chests never consume a day or give a partial bundle when a later grant fails',()=>{
  const s=M.newGame();s.planet='lava';s.worldRewards.lava.gateOpen=true;s.bag.starshard=Number.MAX_SAFE_INTEGER;
  const before=structuredClone(s);assert.equal(M.claimCaveChest(s,1_000_000,()=>0),false);assert.deepEqual(s,before);
  delete s.bag.starshard;assert.equal(M.claimCaveChest(s,1_000_000,()=>0),true);assert.equal(s.bag.obsidian,3);assert.equal(s.bag.firecore,1);assert.equal(s.bag.dragonegg,1);assert.equal(s.bag.deco_nest,1);assert.equal(s.bag.starshard,1);
  assert.equal(M.claimCaveChest(s,1_000_000,()=>0),false);
});

test('gift reward overflow and malformed random draws preserve the gift and player state',()=>{
  const s=M.newGame();s.planet='toy';s.bag.battery=Number.MAX_SAFE_INTEGER;
  const before=structuredClone(s);let rolls=[.8,0,0];assert.equal(M.claimGift(s,0,1_000_000,()=>rolls.shift()!),false);assert.deepEqual(s,before);
  s.energy=Number.MAX_SAFE_INTEGER;const rich=structuredClone(s);assert.equal(M.claimGift(s,0,1_000_000,()=>.4),false);assert.deepEqual(s,rich);
  for(const bad of [NaN,Infinity,-.1,1]){assert.equal(M.claimGift(s,0,1_000_000,()=>bad),false);assert.deepEqual(s,rich);}
});

test('invalid multi-item reward rolls cannot spend a brazier crystal or cave-chest date',()=>{
  for(const bad of [NaN,Infinity,-.1,1]){
    const s=M.newGame();s.planet='lava';s.bag.fcrystal=1;s.worldRewards.lava={gateOpen:true,braziers:[0,1]};const before=structuredClone(s);
    assert.equal(M.lightBrazier(s,2,()=>bad),false);assert.deepEqual(s,before);
    let n=0;assert.equal(M.claimCaveChest(s,1_000_000,()=>++n===5?bad:0),false);assert.deepEqual(s,before);
  }
});

test('banking an older death bag never overflows storage or drops its contents on reload',()=>{
  const s=M.newGame();s.bag.hat_straw=Number.MAX_SAFE_INTEGER;s.gear.hat='hat_straw';s.chest.hat_straw=Number.MAX_SAFE_INTEGER;
  // Ten bags already waiting: the eleventh defeat banks the oldest (the reference throws it away).
  const now=Date.now();s.deathBags=Array.from({length:10},(_,i)=>({id:`b${i}`,x:1,z:2,planet:'home' as M.PlanetId,items:{hat_straw:Number.MAX_SAFE_INTEGER},at:now-1000+i}));
  const total=(state:M.SaveState)=>BigInt(state.bag.hat_straw||0)+BigInt(state.chest.hat_straw||0)+(state.deathBags??[]).reduce((n,b)=>n+BigInt(b.items.hat_straw||0),0n);
  const before=total(s);M.die(s,3,4,now);assert.equal(total(s),before);assert.equal(s.deathBags?.length,10);
  assert.ok([s.bag.hat_straw,s.chest.hat_straw,...s.deathBags!.map(b=>b.items.hat_straw)].every(Number.isSafeInteger));
  const saved=M.parseSave(JSON.stringify(s))!;assert.equal(total(saved),before);assert.equal(saved.gear.hat,'hat_straw');
});
