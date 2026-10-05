import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as T from 'three';
import * as M from '../src/model.ts';
import * as F from '../src/farm.ts';
import {CROPS,ITEMS} from '../src/content.ts';
import {TalkBag} from '../src/house-talk.ts';
import {BOT_LINES} from '../src/bot-lines.ts';
import {replyTo} from '../src/bot-chat.ts';
import * as logic from '../src/bot-logic.ts';
import {neighboursKey} from '../src/profiles.ts';

// Run the real neighbour controller and main's eligibility/damage callbacks against a small DOM/world harness.
const source=await readFile(new URL('../src/bots.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('bots.ts',source,ts.ScriptTarget.Latest,true);
const compiled=ts.transpileModule(ast.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(ast)).join('\n').replaceAll('import.meta.env.BASE_URL',"'/'"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const main=await readFile(new URL('../src/main.ts',import.meta.url),'utf8'),mainAst=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true);
const mainFns=mainAst.statements.filter(n=>ts.isFunctionDeclaration(n)&&['uiBlocked','botActive'].includes(n.name?.text)).map(n=>n.getText(mainAst)).join('\n');
const bridge=mainAst.statements.flatMap(n=>ts.isVariableStatement(n)?[...n.declarationList.declarations]:[]).find(n=>n.name.getText(mainAst)==='gameBridge').initializer;
const hooks=bridge.properties.filter(n=>['botContext','botHit'].includes(n.name?.getText(mainAst))).map(n=>n.getText(mainAst)).join(',');
const mainCompiled=ts.transpileModule(`${mainFns}\nglobalThis.hooks={${hooks}};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let resetCase;
function scan(n){if(ts.isCaseClause(n)&&n.expression.getText(mainAst)==="'reset'")resetCase=n.statements.map(s=>s.getText(mainAst)).join('\n');ts.forEachChild(n,scan);}scan(mainAst);
const resetCompiled=ts.transpileModule(`globalThis.resetAdventure=async()=>{switch('reset'){case 'reset':${resetCase}}};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

class Element{
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.hidden=false;this.open=false;this.classList={add(){},remove(){}};this.textContent='';}
  append(...children){for(const c of children){c.parent=this;this.children.push(c);}}
  replaceChildren(...children){this.children=[];this.append(...children);}
  setAttribute(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
  get lastElementChild(){return this.children.at(-1);}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
function fixture({slot=0,storage=new Map()}={}){
  const body=new Element('body'),elements=[],callbacks=[],timers=[],damage=[],gifts=[],visits=[];
  const document={body,hidden:false,createElement(tag){const e=new Element(tag);elements.push(e);return e;},createTextNode:text=>({textContent:text}),querySelector:q=>q==='dialog[open]'?elements.find(e=>e.tag==='dialog'&&e.open):null};
  const world={planet:'home',interior:null,networkRole:null,position:{x:0,z:0},camera:new T.PerspectiveCamera(),remotePlayers:new Map(),friendIds:new Set(),enemies:[],blocked:()=>false,burst(){},
    removeRemotePlayer(id){this.remotePlayers.delete(id);},addRemotePlayer(id,pose){this.remotePlayers.set(id,{pose,mesh:{visible:pose.planet===this.planet,position:{x:pose.x,y:pose.y,z:pose.z},scale:{x:1}}});},updateRemotePlayer(id,pose){this.addRemotePlayer(id,pose);},damageEnemy(e,n){e.hp=Math.max(0,e.hp-n);damage.push(n);}};
  const state=M.newGame('Explorer');
  const ctx=vm.createContext({exports:{},...logic,T,M,F,CROPS,ITEMS,TalkBag,BOT_LINES,replyTo,neighboursKey:()=>neighboursKey(slot),iconPath:()=>null,t:(s,v={})=>s.replace(/\{(\w+)\}/g,(_,k)=>String(v[k]??k)),
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},document,window:{setTimeout:fn=>timers.push(fn)},setTimeout:fn=>timers.push(fn),innerWidth:800,innerHeight:600,
    started:true,actionHandler:null,placement:null,shipSequence:null,flight:null,arriving:false,visiting:null,fishGame:null,modal:'',world,state});
  vm.runInContext(mainCompiled,ctx);
  const game={getWorld:()=>world,getState:()=>state,ownsItem:id=>!!state.bag[id],botContext:()=>ctx.hooks.botContext(),botHit:(...a)=>ctx.hooks.botHit(...a),
    grantGift(g){if(g.item&&!M.addItem(state,g.item,g.count))return false;state.energy+=g.energy;gifts.push(g);return true;},
    setVisiting(name){ctx.visiting=name;world.planet='home';world.position={x:0,z:0};visits.push(name);},showNotice(){},onFrame:fn=>callbacks.push(fn)};
  vm.runInContext(compiled,ctx);const api=ctx.exports.initBots(game);
  const frame=(dt=.1)=>callbacks.forEach(fn=>fn(dt));
  return {ctx,world,state,api,frame,storage,damage,gifts,visits,elements,timers,game};
}
function fight(f){
  f.frame();const r=[...f.api.runs.values()][0];
  Object.assign(r,{mode:'wander',hidden:false,place:'zone',nextPlan:99,huntUntil:999,retreat:0,foeT:0});
  r.w.x=r.zone.x;r.w.z=r.zone.z;
  const e={id:`${f.world.planet}:enemy:0`,x:r.w.x,z:r.w.z+1,hp:100,boss:false};f.world.enemies=[e];r.foe={...e};return {r,e};
}

test('actual neighbour frame and main damage route stop on other planets and resume at home',()=>{
  const f=fixture(),{e}=fight(f);f.world.planet='lava';f.frame();f.ctx.hooks.botHit(e.id,20);
  assert.equal(e.hp,100);assert.equal(f.world.remotePlayers.size,0);assert.equal(f.damage.length,0);
  f.world.planet='home';f.frame();assert.ok(e.hp<100);assert.equal(f.damage.length,1);
});

test('menus, hidden tabs, title screen, indoors, travel and placement freeze neighbour logic',()=>{
  for(const pause of [f=>f.ctx.modal='settings',f=>f.elements.find(x=>x.tag==='dialog').showModal(),f=>f.ctx.document.hidden=true,f=>f.ctx.started=false,f=>f.world.interior='cottage',f=>f.ctx.flight={},f=>f.ctx.arriving=true,f=>f.ctx.placement={},f=>f.state.hp=0]){
    const f=fixture(),{e,r}=fight(f);pause(f);const before={x:r.w.x,z:r.w.z,foeT:r.foeT,nextPlan:r.nextPlan};
    for(let i=0;i<10;i++)f.frame();f.ctx.hooks.botHit(e.id,20);
    assert.equal(e.hp,100);assert.deepEqual({x:r.w.x,z:r.w.z,foeT:r.foeT,nextPlan:r.nextPlan},before);
  }
});

test('a bot garden visit keeps its host and resumes after closing the neighbours panel',()=>{
  const f=fixture();f.frame();const d=f.api.cast[0];f.api.store().friends[d.id]=1;
  f.elements.find(e=>e.id==='neighbours-button').onclick();
  const visit=f.elements.find(e=>e.tag==='button'&&e.textContent==='Visit garden'&&!e.disabled);visit.onclick();
  assert.equal(f.ctx.visiting,d.name);const r=f.api.runs.get(d.id);r.nextPlan=20;
  f.frame();assert.equal(f.api.runs.size,1);assert.equal(f.ctx.visiting,d.name);assert.ok(r.nextPlan<20);
  const dialog=f.elements.find(e=>e.tag==='dialog');dialog.showModal();const next=r.nextPlan;f.frame();assert.equal(r.nextPlan,next);assert.equal(f.ctx.visiting,d.name);
  dialog.close();f.frame();assert.ok(r.nextPlan<next);assert.equal(f.ctx.visiting,d.name);
  f.world.position={x:21,z:0};f.frame();assert.equal(f.ctx.visiting,null);
});

test('stale friendship and visit clicks cannot act while paused or on another planet',()=>{
  const f=fixture();f.frame();const d=f.api.cast[0];f.world.planet='lava';f.api.accept(d.id);
  assert.equal(logic.isFriend(f.api.store(),d.id),false);
  f.api.store().friends[d.id]=1;f.elements.find(e=>e.id==='neighbours-button').onclick();f.elements.find(e=>e.tag==='button'&&e.textContent==='Visit garden'&&!e.disabled).onclick();
  assert.equal(f.visits.length,0);assert.equal(f.gifts.length,0);
});

test('legacy friendship and pending gifts stay with profile 1, even if profile 2 starts first',()=>{
  const legacy=logic.newStore(1234),bot=logic.makeCast(1234)[0];logic.befriend(legacy,bot,1,()=>false);
  const storage=new Map([[neighboursKey(0),JSON.stringify(legacy)]]);
  const second=fixture({slot:1,storage});second.frame();assert.equal(second.gifts.length,0);assert.equal(Object.keys(second.api.store().friends).length,0);
  const first=fixture({slot:0,storage});first.frame();assert.equal(first.gifts.length,1);assert.equal(Object.keys(first.api.store().pending).length,0);
  const secondReload=fixture({slot:1,storage});secondReload.frame();assert.equal(secondReload.gifts.length,0);assert.equal(Object.keys(secondReload.api.store().friends).length,0);
  const firstReload=fixture({slot:0,storage});firstReload.frame();assert.equal(firstReload.gifts.length,0);assert.equal(logic.isFriend(firstReload.api.store(),bot.id),true);
});

test('reset clears only the current profile promises, friendships and live neighbours',()=>{
  const storage=new Map(),first=fixture({slot:0,storage}),second=fixture({slot:1,storage});first.frame();second.frame();
  first.api.accept(first.api.cast[0].id);second.api.accept(second.api.cast[0].id);
  const keep=storage.get(neighboursKey(1));first.api.reset();
  assert.equal(first.api.runs.size,0);assert.equal(first.world.friendIds.size,0);assert.equal(Object.keys(first.api.store().friends).length,0);assert.equal(Object.keys(first.api.store().pending).length,0);
  assert.equal(storage.get(neighboursKey(1)),keep);const reload=fixture({slot:0,storage});reload.frame();assert.equal(reload.gifts.length,0);assert.equal(Object.keys(reload.api.store().friends).length,0);
});

test('a delayed chat reply from the old adventure cannot speak in the new one',()=>{
  const f=fixture();f.frame();const d=f.api.cast[0];f.api.accept(d.id);
  f.elements.find(e=>e.id==='neighbours-button').onclick();f.elements.find(e=>e.tag==='button'&&e.textContent==='💬 Chat').onclick();
  f.elements.find(e=>e.tag==='input'&&e.type==='text').value='Hello';f.elements.find(e=>e.tag==='form').onsubmit({preventDefault(){}});
  assert.equal(f.timers.length,1);f.api.reset();f.frame();for(const run of f.timers)run();
  assert.equal(f.api.runs.get(d.id).say,null);assert.equal(Object.keys(f.api.store().friends).length,0);
});

test('actual Start fresh routing resets neighbours only after a successful offline reset',async()=>{
  for(const online of [false,true])for(const success of [false,true])for(const disconnect of [false,true]){
    let resets=0;const state={welcome:'done'},ctx=vm.createContext({perform:async()=>success,actionHandler:online?()=>{}:null,neighbours:{reset(){resets++;}},state,world:{refreshPlayer(){}},structuredClone,rebuildHomePresentation(){},resetCombat(){},selectedItem:null,save(){},closeDialog(){},welcomeDialog(){},updateHud(){},toast(){}});
    vm.runInContext(resetCompiled,ctx);const pending=ctx.resetAdventure();if(disconnect)ctx.actionHandler=null;await pending;assert.equal(resets,success&&!online?1:0);
  }
});
