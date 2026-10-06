import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as M from '../src/model.ts';
import {resolveMysteryCatch,newMysteryCaller,mysteryLanded} from '../src/fishing.ts';

const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='finishFishingCatch');
const compiled=ts.transpileModule(node.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(online=false){
 const callbacks=[],notices=[],saved=[],effects=[],availability=[];let resolve;
 const state=M.newGame(),round={pondId:'home:pond',ticket:'ticket',simulation:{pick:{id:'fish_perch',power:.2,size:14,huge:false}},proof:{finish:()=>({})}};
 const context={M,state,resolveMysteryCatch,mysteryLanded,mysteryCaller:newMysteryCaller(),fishingEpoch:1,fishGame:null,actionHandler:online?()=>{}:null,performance:{now:()=>1000},
  world:{root:{},position:{x:0,z:0},fx:{burst:()=>effects.push('burst'),shake:()=>{}}},
  fishingView:{land:(_target,done)=>callbacks.push(done),cancel:()=>effects.push('cancel'),dropMystery:(...args)=>availability.push(args)},
  perform:()=>new Promise(r=>{resolve=r;}),change:fn=>{const result=fn();saved.push(structuredClone(state));return result;},
  toast:text=>notices.push(text),tone:()=>effects.push('tone'),floating:()=>{},t:text=>text,formatSize:()=>'',showReel:()=>{},setTimeout:()=>{},recastUntil:0};
 const ctx=vm.createContext(context);vm.runInContext(compiled,ctx);
 return {state,round,ctx,callbacks,notices,saved,effects,availability,start:()=>ctx.finishFishingCatch(round),resolve:result=>resolve(result)};
}
test('a landed offline fish is saved before animation, so rebuilding or reloading cannot lose it',async()=>{
 const f=fixture();await f.start();assert.equal(f.state.bag.fish_perch,1);assert.equal(f.saved[0].bag.fish_perch,1);assert.equal(f.callbacks.length,1);
 f.ctx.world.root={};f.callbacks[0]();assert.equal(f.state.bag.fish_perch,1);assert.deepEqual(f.effects,[]);
});
test('failed catch grant gives no success animation or reward feedback',async()=>{
 const f=fixture();f.state.bag.fish_perch=Number.MAX_SAFE_INTEGER;const before=structuredClone(f.state);await f.start();
 assert.deepEqual(f.state,before);assert.equal(f.callbacks.length,0);assert.deepEqual(f.effects,['cancel']);assert.equal(f.notices.length,1);
});
for(const transition of ['new cast','different world','different account'])test(`a delayed catch reply cannot animate over a ${transition}`,async()=>{
 const f=fixture(true),pending=f.start();if(transition==='new cast'){f.ctx.fishingEpoch++;f.ctx.fishGame={};}else if(transition==='different world')f.ctx.world.root={};else f.ctx.state=M.newGame('Other');
 f.resolve({...f.round.simulation.pick});await pending;
 assert.equal(f.callbacks.length,0);assert.deepEqual(f.effects,[]);assert.deepEqual(f.availability,[]);
});
test('successful online catch does not grant a second client reward',async()=>{
 const f=fixture(true),pending=f.start();f.resolve({...f.round.simulation.pick});await pending;
 assert.equal(f.state.bag.fish_perch,undefined);assert.equal(f.callbacks.length,1);assert.deepEqual(f.availability,[]);
});
test('landing a mystery clears the waiting shadow from the caller (the 60 s wait counts from its call)',async()=>{
 const f=fixture();f.round.simulation.pick={id:'fish_perch',power:.2,size:0,huge:false,mystery:true};f.round.mysteryOut=true;
 f.ctx.mysteryCaller={lastCallAt:500,active:{water:'home:pond',x:1,z:1,tries:1}};
 await f.start();assert.equal(f.ctx.mysteryCaller.active,undefined);assert.equal(f.ctx.mysteryCaller.lastCallAt,500);assert.equal(f.round.mysteryOut,false);
 assert.ok(Object.values(f.state.bag).some(n=>n>0),'the mystery prize is granted');
});
