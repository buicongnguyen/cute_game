import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import ts from 'typescript';
import {mainHarness} from './support/main-harness.mjs';

// The actual action controller, and the bridge's applyAuthoritativeState cut out of the gameBridge object.
const main=await mainHarness({functions:['perform'],extra({ast}){
  const bridge=ast.statements.flatMap(node=>ts.isVariableStatement(node)?[...node.declarationList.declarations]:[]).find(node=>node.name.getText(ast)==='gameBridge');
  const apply=bridge.initializer.properties.find(node=>node.name?.getText(ast)==='applyAuthoritativeState');
  assert.ok(apply,'exercise actual bridge and action controller source');
  return `const bridge={${apply.getText(ast)}};globalThis.applyReply=next=>bridge.applyAuthoritativeState(next);`;
}});
function fixture(){
  const notifications=[],state=M.newGame(),world={state,planet:'home',position:{clone(){return this;},copy(){}},syncCrops(){},syncDecorations(){},syncDropped(){},build(){},refreshPlayer(){}};
  const ctx={state,world,actionHandler:null,visiting:null,visitHome:null,structuredClone,gearWater:false,
    updateHud(){},updateLabels(){},save(){},toast:(...args)=>notifications.push(args),t:text=>text,
    levelCheck(before){if(ctx.state.level>before)notifications.push(['level',ctx.state.level]);},
    endFishing(){},resetCombat(){},rebuildHomePresentation(){},pepperGift(){notifications.push(['pepper']);},Date,Math};main.context(ctx);
  return {ctx,state,notifications};
}
test('authoritative reset removes stale optional helper while preserving active save identity',()=>{
  const f=fixture();f.state.helper={owned:true,paused:false,seed:'same',last:{}};f.state.bag.carrot=10;f.state.forge={sword_wood:7};
  const next=M.newGame();f.ctx.applyReply(next);
  assert.equal(f.ctx.state,f.state);assert.equal(f.ctx.world.state,f.state);assert.deepEqual(f.state,next);assert.equal(f.state.helper,undefined);
});
test('an online level gain is announced once when its authoritative reply is applied',async()=>{
  const f=fixture();f.ctx.actionHandler=async()=>{const next=structuredClone(f.state);next.level=2;f.ctx.applyReply(next);return {ok:true,result:'carrot',profile:next,revision:1};};
  assert.equal(await f.ctx.perform('harvest',{index:0}),'carrot');assert.deepEqual(f.notifications,[['level',2]]);
});
test('offline actions still announce their local level gain once',async()=>{
  const f=fixture();const now=Date.now();f.state.xp=M.xpNeeded(1)-1;assert.ok(M.plant(f.state,0,'carrot',now-M.CROPS.carrot.duration));
  assert.equal(await f.ctx.perform('harvest',{index:0}),'carrot');assert.deepEqual(f.notifications,[['level',2],['pepper']],"a new game's first harvest also brings Pepper's gift (FIX-PLAN 4.6)");
});
