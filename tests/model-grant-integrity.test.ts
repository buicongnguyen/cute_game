import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { applyGameAction } from '../src/actions.ts';

test('a death bag is retained in full until every item can fit, including action retries', () => {
  const s = M.newGame();
  s.bag = { carrot: Number.MAX_SAFE_INTEGER, wood: 5 };
  s.dropped = { planet: 'home', x: 0, z: 0, items: { wood: 3, carrot: 1 } };
  const before = structuredClone(s);
  assert.equal(M.recoverBag(s), false);
  assert.deepEqual(s, before);
  assert.throws(() => applyGameAction(s, { type: 'recoverBag' }));
  assert.deepEqual(s, before);
  assert.ok(M.removeItem(s.bag, 'carrot'));
  assert.equal(M.recoverBag(s), true);
  assert.equal(s.bag.wood, 8);
  assert.equal(s.bag.carrot, Number.MAX_SAFE_INTEGER);
  assert.equal(s.dropped, null);
  assert.equal(M.recoverBag(s), false);
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
  s.dropped={x:1,z:2,planet:'home',items:{hat_straw:Number.MAX_SAFE_INTEGER}};
  const total=(state:M.SaveState)=>BigInt(state.bag.hat_straw||0)+BigInt(state.chest.hat_straw||0)+BigInt(state.dropped?.items.hat_straw||0);
  const before=total(s);M.die(s,3,4);assert.equal(total(s),before);
  assert.ok([s.bag.hat_straw,s.chest.hat_straw,s.dropped?.items.hat_straw].every(Number.isSafeInteger));
  const saved=M.parseSave(JSON.stringify(s))!;assert.equal(total(saved),before);assert.equal(saved.gear.hat,'hat_straw');
});
