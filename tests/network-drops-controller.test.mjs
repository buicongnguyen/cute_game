import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as M from '../src/model.ts';
import {DropManager} from '../src/drops.ts';

const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const spawn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='spawnNetworkDrop');
const frame=ast.statements.find(node=>ts.isExpressionStatement(node)&&node.getText(ast).startsWith('frameListeners.add(dt=>{for(const [uid,meta]of networkDrops)'));
const compiled=ts.transpileModule(`${spawn.getText(ast)}\n${frame.getText(ast)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(actor='alice',owner='alice',thrown=true,priority=0){
  let now=100000;const sim=new DropManager(),picked=[],hero={x:0,z:0},frameListeners=new Set();
  const drops={sim,spawn:(id,count,x,z,options)=>sim.spawn(id,count,{x,z},options),update:dt=>picked.push(...sim.step(dt,hero,()=>true,undefined,3).picked)};
  const ctx=vm.createContext({M,Date:{now:()=>now},world:{planet:'home'},visiting:null,networkDrops:new Map(),drops,frameListeners});vm.runInContext(compiled,ctx);
  ctx.spawnNetworkDrop({id:'drop-1',item:'bone',count:1,ownerId:owner,owner,planet:'home',room:'public:home',x:0,z:0,thrown,releaseAt:now+priority,expiresAt:now+30000},actor);
  const step=(seconds)=>{for(let t=0;t<seconds;t+=1/60){now+=1000/60;for(const frame of frameListeners)frame(1/60);}};
  return {sim,picked,hero,step};
}

test('an online thrown item stays at its server position and cannot magnet back until the thrower walks away',()=>{
  const f=fixture();f.step(2);assert.equal(f.picked.length,0);assert.equal(f.sim.drops[0].x,0);assert.equal(f.sim.drops[0].z,0);
  f.hero.x=12;f.step(.1);assert.equal(f.sim.drops[0].selfLock,false);f.hero.x=0;f.step(.2);assert.equal(f.picked.length,1);
});

test('another explorer can collect a thrown public item without waiting for the thrower to walk away',()=>{
  const f=fixture('bob');f.step(2);assert.equal(f.picked.length,1);
});

test('a large loot magnet cannot clear someone elses server ownership priority by distance',()=>{
  const f=fixture('bob','alice',false,10000);f.hero.x=4;f.step(2);assert.equal(f.picked.length,0);assert.equal(f.sim.drops[0].x,0);
  f.step(9);assert.equal(f.picked.length,1);
});
