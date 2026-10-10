import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import {applyGameAction} from '../src/actions.ts';
import {rerollDaily,refreshProgress,dailyRerollsUsed} from '../src/progression.ts';
const now=Date.parse('2026-10-09T03:00:00Z');
const act=(s,type,payload)=>applyGameAction(s,{type,payload},{now,random:()=>.5});
test('keep backpack setting persists, is boolean-only, and keeps defeat recovery intact',()=>{
 let s=M.newGame();s.bag={carrot:4,hat_straw:1};s.gear.hat='hat_straw';
 act(s,'settings',{settings:{keepBagOnDeath:true}});s=M.parseSave(JSON.stringify(s));assert.equal(s.settings.keepBagOnDeath,true);
 s.hp=0;s.planet='candy';assert.deepEqual(act(s,'die',{x:2,z:3}),{dropped:false});assert.deepEqual(s.bag,{carrot:4,hat_straw:1});assert.equal(s.planet,'home');assert.equal(s.hp,M.maxHp(s));
 act(s,'settings',{settings:{keepBagOnDeath:false}});act(s,'settings',{settings:{keepBagOnDeath:'true'}});assert.equal(s.settings.keepBagOnDeath,false);
 s.hp=0;assert.deepEqual(act(s,'die',{x:2,z:3}),{dropped:true});assert.equal(s.deathBags[0].items.carrot,4);
});
test('mine overflow uses chest once and preserves resource cooldown',()=>{
 const s=M.newGame();s.planet='candy';for(const id of Object.keys(M.ITEMS).filter(id=>id!=='sugar').slice(0,M.bagCapacity(s)))s.bag[id]=1;
 assert.ok(act(s,'claimMine',{index:0}));assert.equal(s.chest.sugar,1);assert.equal(s.bag.sugar,undefined);assert.throws(()=>act(s,'claimMine',{index:0}));assert.equal(s.chest.sugar,1);
});
test('legacy reroll migrates as one use; three-use cap survives reload and resets tomorrow',()=>{
 let s=M.newGame();refreshProgress(s,now);s.progression.daily.rerolled=true;delete s.progression.daily.rerolls;s=M.parseSave(JSON.stringify(s));assert.equal(dailyRerollsUsed(s.progression.daily),1);
 assert.ok(rerollDaily(s,0,now));s=M.parseSave(JSON.stringify(s));assert.ok(rerollDaily(s,1,now));assert.equal(dailyRerollsUsed(s.progression.daily),3);assert.equal(rerollDaily(s,2,now),false);refreshProgress(s,now+86400000);assert.equal(dailyRerollsUsed(s.progression.daily),0);
});
test('tree fertilizer never spends a dose after ripening, even on a five-level bed',()=>{
 const s=M.newGame();s.level=40;s.energy=1e6;s.bag.manure=4;for(let i=0;i<5;i++)assert.ok(M.upgradeBed(s,0,now));assert.ok(M.plant(s,0,'apple',now));assert.ok(M.fertilize(s,0,now,'manure'));assert.ok(M.fertilize(s,0,now,'manure'));assert.equal(M.cropProgress(s.plots[0],now),1);assert.equal(M.fertilize(s,0,now,'manure'),false);assert.equal(s.bag.manure,2);
});
