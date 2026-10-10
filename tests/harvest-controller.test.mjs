import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as M from '../src/model.ts';

const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const declarations=['harvestNearby','growText'].map(name=>{
  const node=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
  assert.ok(node,`missing actual ${name} controller`);return node.getText(ast);
});
const compiled=ts.transpileModule(declarations.join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const tick=()=>new Promise(resolve=>queueMicrotask(resolve));
function garden(now){const state=M.newGame();for(let i=0;i<3;i++)assert.ok(M.plant(state,i,'carrot',now-M.CROPS.carrot.duration));return state;}
function fixture(hold=false){
  const now=Date.now(),state=garden(now),jobs=[],calls=[],animations=[],notices=[];let release;
  const ctx=vm.createContext({state,M,Date:{now:()=>now},visiting:null,t:text=>text,
    world:{planet:'home',syncCrops(){}},harvestBurst:(index,crop)=>animations.push({index,crop}),toast:message=>notices.push(message),
    perform:async(type,payload)=>{assert.equal(type,'harvest');calls.push({...payload});const result=M.harvest(ctx.state,payload.index,now);if(hold&&calls.length===1)await new Promise(resolve=>{release=resolve;});return result;},
    setTimeout:(run,delay)=>{jobs.push({run,delay});return jobs.length;}});
  vm.runInContext(compiled,ctx);
  return {now,state,ctx,jobs,calls,animations,notices,async start(){await ctx.harvestNearby(0);await tick();},async flush(){while(jobs.length)await jobs.shift().run();},async release(){release?.();await tick();}};
}

test('actual staggered harvest controller collects the original ripe beds once',async()=>{
  const f=fixture();await f.start();assert.equal(f.state.bag.carrot,1);assert.deepEqual(f.jobs.map(job=>job.delay),[140,280]);
  await f.flush();assert.equal(f.state.bag.carrot,3);assert.equal(f.animations.length,3);assert.equal(f.notices.length,1);
  assert.match(f.notices[0],/Harvested 3 crops/);await f.start();await f.flush();assert.equal(f.state.bag.carrot,3);
});
for(const transition of ['account replacement','visit','planet change'])test(`pending garden harvests stop after ${transition}`,async()=>{
  const f=fixture();await f.start();const before=structuredClone(f.state);
  const replacement=garden(f.now),replacementBefore=structuredClone(replacement);
  if(transition==='account replacement')f.ctx.state=replacement;
  else if(transition==='visit')f.ctx.visiting='friend';else f.ctx.world.planet='toy';
  await f.flush();assert.deepEqual(f.state,before);assert.deepEqual(replacement,replacementBefore);assert.equal(f.calls.length,1);assert.equal(f.animations.length,1);assert.equal(f.notices.length,0);
});
test('old harvest timers do not consume a newly planted ripe generation at the same coordinates',async()=>{
  const f=fixture();await f.start();const index=1,old=f.state.plots[index].generation;
  assert.equal(M.harvest(f.state,index,f.now),'carrot');assert.ok(M.plant(f.state,index,'carrot',f.now-M.CROPS.carrot.duration));
  assert.notEqual(f.state.plots[index].generation,old);const replacement=structuredClone(f.state.plots[index]);
  await f.flush();assert.deepEqual(f.state.plots[index],replacement);assert.equal(f.state.bag.carrot,3,'one first, one manually harvested, one remaining original bed');assert.equal(f.calls.length,2);
});
test('already dispatched harvest replies cannot animate or notify a replacement account',async()=>{
  const f=fixture(true);await f.start();const replacement=garden(f.now),before=structuredClone(replacement);f.ctx.state=replacement;
  await f.release();await f.flush();assert.deepEqual(replacement,before);assert.equal(f.calls.length,1);assert.equal(f.animations.length,0);assert.equal(f.notices.length,0);
});
test('the growing-bed countdown uses the saved planting duration after crop migration',()=>{
  const f=fixture(),plot=f.state.plots[0];plot.plantedAt=f.now-5000;plot.growDuration=10_000;
  // M.cropProgress has its own real clock; allow one elapsed second at the boundary.
  assert.match(f.ctx.growText(plot),/About [45] seconds until ripe/);
});
test('the growing-bed countdown shows minutes under an hour, never raw thousands of seconds',()=>{
  const f=fixture(),plot=f.state.plots[0];
  plot.plantedAt=f.now-1000;plot.growDuration=1_441_000;
  assert.match(f.ctx.growText(plot),/About (23|24) min until ripe/);
  plot.plantedAt=f.now-1000;plot.growDuration=3_601_000;
  assert.match(f.ctx.growText(plot),/About 1 h 0 min until ripe/);
});
