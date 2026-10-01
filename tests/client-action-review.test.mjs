import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as M from '../src/model.ts';

const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const functions=['launch','arrive','executeEnemy','farmHelperContext'].map(name=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(ast));
const click=ast.statements.find(node=>ts.isExpressionStatement(node)&&node.expression.getText(ast).startsWith("app.addEventListener('click',async"));
const actionSwitch=click.expression.arguments[1].body.statements.find(ts.isSwitchStatement);
const cases=actionSwitch.caseBlock.clauses.filter(node=>['plant','fertilize','fertilize-manure','feed-all'].includes(node.expression?.text)).map(node=>node.getText(ast));
const compiled=ts.transpileModule(`${functions.join('\n')}\nasync function act(action,id){switch(action){${cases.join('\n')}}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const state=M.newGame(),calls=[],animations=[],panels=[],notices=[];let resolveAction;
  const flash={classList:{add(){},remove(){}}},ctx=vm.createContext({
    M,state,flight:null,arriving:false,launchPending:false,visiting:null,activePlot:0,modal:'plant',
    actionHandler:null,world:{root:{},position:{x:0,z:0},syncCrops(){},build:id=>calls.push(['build',id]),refreshPlayer(){},applyRefinedAssets(){},renderer:{compileAsync:()=>Promise.resolve()}},
    ship:{busy:false,launch:fn=>calls.push(['launch',fn]),reset:()=>calls.push(['reset'])},
    perform:(...args)=>{calls.push(args);return new Promise(resolve=>{resolveAction=resolve;});},
    leaveWorld(){},toast:message=>notices.push(message),tone(){},warp:fn=>fn(),enterSpace:()=>calls.push(['enterSpace']),
    $:()=>flash,setTimeout:(fn,delay)=>{if(delay===600)queueMicrotask(fn);},
    kitsFor:()=>[],SCENERY_KITS:{},exitSpace(){},settle(){},updateLabels(){},
    plantBurst:index=>animations.push(index),feedBurst:uid=>animations.push(uid),
    closeDialog:()=>panels.push('close'),plotDialog:index=>panels.push(index),penDialog:()=>panels.push('pen'),t:text=>text,
    change:fn=>fn(),hit:(enemy,damage,stun,impact,remote,hazard)=>{calls.push(['hit',damage,hazard]);enemy.hp=Math.max(0,enemy.hp-damage*(hazard?1:.2));},
  });
  vm.runInContext(compiled,ctx);
  return {state,ctx,calls,animations,panels,notices,reply:result=>resolveAction(result)};
}

test('animal helper scene identity survives routine dropped-bag/entity refreshes and changes only on rebuild',()=>{
  const f=fixture();Object.assign(f.ctx,{started:true,document:{hidden:false},network:{role:null}});Object.assign(f.ctx.world,{state:f.state,planet:'home',entities:[]});
  const context=f.ctx.farmHelperContext();assert.equal(context,f.ctx.world.root);
  for(let i=0;i<4;i++){f.ctx.world.entities=[{kind:'dropped'}];assert.equal(f.ctx.farmHelperContext(),context);}
  f.ctx.world.root={};assert.notEqual(f.ctx.farmHelperContext(),context);
  f.ctx.visiting='friend';assert.equal(f.ctx.farmHelperContext(),null);
  f.ctx.visiting=null;f.ctx.actionHandler=()=>{};assert.equal(f.ctx.farmHelperContext(),null,'wait for the authenticated multiplayer room');
});

test('repeated launch taps while the server is pending charge only one flight',async()=>{
  const f=fixture(),first=f.ctx.launch();await f.ctx.launch();assert.equal(f.calls.length,1);
  f.reply(true);await first;assert.equal(f.calls.filter(([kind])=>kind==='launch').length,2,'one server payment and one ship animation');assert.equal(f.ctx.launchPending,false);
});

test('a paid launch reply and delayed warp cannot start travel on a replacement account',async()=>{
  const f=fixture(),first=f.ctx.launch();f.ctx.state=M.newGame('Other');f.reply(true);await first;assert.equal(f.calls.length,1);
  const g=fixture(),paid=g.ctx.launch();g.reply(true);await paid;g.ctx.state=M.newGame('Other');g.calls[1][1]();assert.equal(g.calls.filter(([kind])=>kind==='enterSpace').length,0);
});

test('a rejected landing restores piloting instead of trapping the ship in a finished landing animation',async()=>{
  const f=fixture(),journey={landing:{done:true},autopilot:{id:'lava'}};f.ctx.flight=journey;
  const landing=f.ctx.arrive('lava');await tick();f.reply(undefined);await landing;
  assert.equal(journey.landing,null);assert.equal(journey.autopilot,null);assert.equal(f.ctx.arriving,false);
  assert.equal(f.calls.some(([kind])=>kind==='build'),false);
});

test('a rejected quick home trip restores the explorer from the boarded ship',async()=>{
  const f=fixture(),landing=f.ctx.arrive('home');await tick();f.reply(undefined);await landing;
  assert.ok(f.calls.some(([kind])=>kind==='reset'));assert.equal(f.ctx.arriving,false);
});

test('account replacement while landing is pending cannot build the previous destination',async()=>{
  const f=fixture(),landing=f.ctx.arrive('lava');await tick();f.ctx.state=M.newGame('Other');f.ctx.arriving=false;f.reply(true);await landing;
  assert.equal(f.calls.some(([kind])=>kind==='build'),false);assert.equal(f.ctx.arriving,false);
});

test('a planting reply animates its original bed and leaves a newly selected bed dialog open',async()=>{
  const f=fixture(),pending=f.ctx.act('plant','carrot');f.ctx.activePlot=1;f.reply(true);await pending;
  assert.deepEqual(structuredClone(f.calls[0]),['plant',{index:0,id:'carrot'}]);assert.deepEqual(f.animations,[0]);assert.deepEqual(f.panels,[]);
});

test('a fertilizer reply cannot refresh or close the newly selected crop dialog',async()=>{
  const f=fixture();M.plant(f.state,0,'carrot');M.plant(f.state,1,'carrot');f.ctx.modal='plot';
  const pending=f.ctx.act('fertilize');f.ctx.activePlot=1;f.reply(true);await pending;
  assert.equal(f.calls[0][1].index,0);assert.deepEqual(f.panels,[]);assert.equal(f.notices.length,1);
});

test('a fertilizer reply remains safe if another event removes its old bed',async()=>{
  const f=fixture();M.plant(f.state,0,'carrot');f.ctx.modal='plot';const pending=f.ctx.act('fertilize');f.state.plots.length=0;f.reply(true);await pending;
  assert.deepEqual(f.panels,[]);assert.deepEqual(f.notices,[]);
});

test('feed-all feedback tolerates an animal collected as meat before the reply arrives',async()=>{
  const f=fixture(),now=Date.now(),farm=M.farmOf(f.state);farm.animals=[{uid:1,kind:'chicken',bornAt:now,acquiredAt:now,cycleAt:now+60000},{uid:2,kind:'chicken',bornAt:now,acquiredAt:now,cycleAt:now+60000}];
  const pending=f.ctx.act('feed-all');farm.animals.shift();farm.animals[0].fedYoung=true;f.reply(1);await pending;
  assert.deepEqual(f.animations,[2]);assert.deepEqual(f.panels,['pen']);
});

test('offline devour bypasses a defensive shell and heals only after the creature is defeated',()=>{
  const f=fixture(),enemy={hp:39,maxHp:100,boss:false,x:2,z:0,radius:1};f.state.hp=10;f.ctx.executeEnemy(enemy,.25);
  assert.equal(enemy.hp,0);assert.deepEqual(f.calls,[['hit',40,true]]);assert.equal(f.state.hp,10+M.maxHp(f.state)*.25);
  const g=fixture();g.state.hp=10;g.ctx.hit=()=>{};g.ctx.executeEnemy({...enemy,hp:39},.25);assert.equal(g.state.hp,10);
});

test('devour never locally executes a boss, healthy creature, distant target, or online target',()=>{
  for(const overrides of [{boss:true},{hp:40},{x:8},{online:true}]){
    const f=fixture(),enemy={hp:39,maxHp:100,boss:false,x:2,z:0,radius:1,...overrides};if(overrides.online)f.ctx.actionHandler=()=>{};
    f.ctx.executeEnemy(enemy,.25);assert.deepEqual(f.calls,[]);
  }
});
