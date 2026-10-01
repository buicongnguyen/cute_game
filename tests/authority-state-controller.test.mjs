import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as M from '../src/model.ts';
import {applyGameAction} from '../src/actions.ts';

const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const perform=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='perform');
const bridge=ast.statements.flatMap(node=>ts.isVariableStatement(node)?[...node.declarationList.declarations]:[]).find(node=>node.name.getText(ast)==='gameBridge');
const apply=bridge.initializer.properties.find(node=>node.name?.getText(ast)==='applyAuthoritativeState');
assert.ok(perform&&apply,'exercise actual bridge and action controller source');
const compiled=ts.transpileModule(`${perform.getText(ast)}\nconst bridge={${apply.getText(ast)}};globalThis.applyReply=next=>bridge.applyAuthoritativeState(next);`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
  const notifications=[],state=M.newGame(),world={state,planet:'home',position:{clone(){return this;},copy(){}},syncCrops(){},syncDecorations(){},syncDropped(){},build(){},refreshPlayer(){}};
  const ctx=vm.createContext({state,world,actionHandler:null,visiting:null,visitHome:null,structuredClone,applyGameAction,
    updateHud(){},updateLabels(){},save(){},toast:(...args)=>notifications.push(args),t:text=>text,
    levelCheck(before){if(ctx.state.level>before)notifications.push(['level',ctx.state.level]);},
    endFishing(){},resetCombat(){},rebuildHomePresentation(){},Date,Math});vm.runInContext(compiled,ctx);
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
  assert.equal(await f.ctx.perform('harvest',{index:0}),'carrot');assert.deepEqual(f.notifications,[['level',2]]);
});
