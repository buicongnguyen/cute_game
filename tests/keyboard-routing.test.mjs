import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as Controls from '../src/gameplay-controls.ts';

// Execute the actual production DOM routing, not a second implementation of its bindings.
const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const registration=ast.statements.filter(node=>ts.isExpressionStatement(node)&&/^(?:document\.addEventListener\('(keydown|keyup|visibilitychange)'|window\.addEventListener\('blur')/.test(node.getText(ast))).map(node=>node.getText(ast)).join('\n');
const cleanup=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='clearHeldInput').getText(ast);
const compiled=ts.transpileModule(cleanup+'\n'+registration,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

function target(kind='body'){
  return {kind,isContentEditable:kind==='editable',matches(selector){return ['input','textarea','select'].includes(kind)&&selector.includes(kind);},closest(selector){return this.matches(selector)||kind==='editable'&&selector.includes('contenteditable')?this:null;}};
}
function fixture(layout='classic'){
  const calls=[],keys=new Set(),documentHandlers=new Map(),windowHandlers=new Map(),body=target();
  const register=(handlers,name,fn)=>{const list=handlers.get(name)??[];list.push(fn);handlers.set(name,list);};
  const state={settings:{keyboardLayout:layout}},movement=new Controls.MovementControls(keys);
  const ctx=vm.createContext({...Controls,state,movement,keys,started:true,modal:'',nativeDialog:false,placement:null,flight:null,fishGame:null,spaceKeys:new Set(),spacePointer:null,boostHeld:false,boostPointers:new Set(),joystick:{clear(){}},cancelLongPresses(){},cancelButtonTouches(){},
    world:{keys,interactNearest:()=>calls.push(['interact'])},document:{hidden:false,activeElement:body,addEventListener:(name,fn)=>register(documentHandlers,name,fn),querySelector:selector=>selector==='dialog[open]'&&ctx.nativeDialog?{}:null},window:{addEventListener:(name,fn)=>register(windowHandlers,name,fn)},
    previous:0,performance:{now:()=>12345},graphics:{sample:(...args)=>calls.push(['graphicsSample',...args])},
    $:()=>({querySelectorAll:()=>[]}),uiBlocked:()=>!!ctx.modal||ctx.nativeDialog,
    tryLanding:()=>calls.push(['land']),cancelPlacement:()=>{calls.push(['cancelPlacement']);ctx.placement=null;},confirmPlacement:()=>calls.push(['place']),rotatePlacement:()=>calls.push(['rotate']),
    closeDialog:()=>{calls.push(['close']);ctx.modal='';movement.clear();},start:()=>calls.push(['start']),inventory:()=>calls.push(['bag']),quests:()=>calls.push(['journal']),map:()=>calls.push(['map']),quickEat:()=>calls.push(['eat']),skill:index=>calls.push(['skill',index]),basicAttack:()=>calls.push(['attack']),
    gestures:{clear:()=>calls.push(['gesturesClear'])},save:()=>calls.push(['save']),
  });
  vm.runInContext(compiled,ctx);
  function fire(type,code,key=code.length===4&&code.startsWith('Key')?code[3].toLowerCase():code==='Space'?' ':code==='Semicolon'?';':code,extra={}){
    const event={code,key,target:body,repeat:false,shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,isComposing:false,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};
    // Browser KeyboardEvent fields are prototype getters, so object spread does not copy modifiers.
    for(const field of ['code','key','shiftKey','ctrlKey','metaKey','altKey','isComposing','keyCode'])if(field in event)Object.defineProperty(event,field,{value:event[field],enumerable:false});
    for(const handler of documentHandlers.get(type)??[])handler(event);return event;
  }
  return {ctx,calls,keys,state,movement,body,fire,documentHandlers,windowHandlers};
}

test('classic bindings keep QWER skills, J journal and arrow movement',()=>{
  const f=fixture();for(const code of ['KeyQ','KeyW','KeyE','KeyR'])f.fire('keydown',code);
  f.fire('keydown','KeyJ');assert.deepEqual(f.calls,[['skill',0],['skill',1],['skill',2],['skill',3],['journal']]);assert.equal(f.keys.size,0);
  assert.equal(f.fire('keydown','ArrowUp').defaultPrevented,true);assert.deepEqual([...f.keys],['ArrowUp']);f.fire('keyup','ArrowUp');assert.equal(f.keys.size,0);
});

test('WASD routing moves with physical keys and gives J/K/L/semicolon skills plus P journal',()=>{
  const f=fixture('wasd');
  for(const [code,direction]of [['KeyW','ArrowUp'],['KeyA','ArrowLeft'],['KeyS','ArrowDown'],['KeyD','ArrowRight']]){
    assert.equal(f.fire('keydown',code,code==='KeyW'?'ư':undefined).defaultPrevented,true);assert.deepEqual([...f.keys],[direction]);f.fire('keyup',code);assert.equal(f.keys.size,0);
  }
  for(const [code,key]of [['KeyJ','j'],['KeyK','k'],['KeyL','l'],['Semicolon',':']])f.fire('keydown',code,key,{shiftKey:code==='Semicolon'});
  f.fire('keydown','KeyP');assert.deepEqual(f.calls,[['skill',0],['skill',1],['skill',2],['skill',3],['journal']]);
});

test('one physical key release cannot stop the same direction held by arrows or touch',()=>{
  const f=fixture('wasd');f.fire('keydown','KeyW');f.fire('keydown','ArrowUp');f.movement.pressPointer(4,'ArrowUp');
  f.fire('keyup','KeyW','ư',{ctrlKey:true,isComposing:true});assert.deepEqual([...f.keys],['ArrowUp']);
  f.fire('keyup','ArrowUp');assert.deepEqual([...f.keys],['ArrowUp']);f.movement.releasePointer(4);assert.equal(f.keys.size,0);
});

test('modifiers, composition, repeats, text fields and open menus do not trigger skills',()=>{
  for(const layout of ['classic','wasd']){
    const f=fixture(layout),code=layout==='wasd'?'KeyJ':'KeyQ';
    for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{keyCode:229},{repeat:true},{target:target('input')},{target:target('textarea')},{target:target('select')},{target:target('editable')}])f.fire('keydown',code,undefined,extra);
    f.ctx.modal='settings';f.fire('keydown',code);f.ctx.modal='';f.ctx.nativeDialog=true;f.fire('keydown',code);assert.deepEqual(f.calls,[]);assert.equal(f.keys.size,0);
  }
});

test('a repeated WASD movement key stays held without repeatedly firing a skill or journal',()=>{
  const f=fixture('wasd');for(let i=0;i<5;i++)f.fire('keydown','KeyW','w',{repeat:i>0});
  assert.deepEqual([...f.keys],['ArrowUp']);assert.deepEqual(f.calls,[]);f.fire('keyup','KeyW');assert.equal(f.keys.size,0);
});

test('fishing Space keeps reel hold/release separate from attacks even after focus changes',()=>{
  const f=fixture('wasd'),input=new Controls.FishingInput();input.enable({disabled:true,focus(){}});f.ctx.fishGame={input};
  assert.equal(f.fire('keydown','Space').defaultPrevented,true);assert.equal(input.held,true);assert.deepEqual(f.calls,[]);
  f.fire('keyup','Space',' ',{target:target('input'),altKey:true});assert.equal(input.held,false);
});

test('flight retains WAD controls and L landing instead of the configured ground skills',()=>{
  const f=fixture('wasd');f.ctx.flight={};f.fire('keydown','KeyW');f.fire('keydown','KeyA');f.fire('keydown','KeyD');f.fire('keydown','KeyL');
  assert.deepEqual([...f.ctx.spaceKeys],['w','a','d']);assert.deepEqual(f.calls,[['land']]);assert.equal(f.keys.size,0);
  f.fire('keyup','KeyW','ư',{ctrlKey:true});assert.deepEqual([...f.ctx.spaceKeys],['a','d']);
});

test('typing or composing while in flight does not steer or request a landing',()=>{
  const f=fixture('wasd');f.ctx.flight={};for(const kind of ['input','textarea','select','editable']){f.fire('keydown','KeyW','w',{target:target(kind)});f.fire('keydown','KeyL','l',{target:target(kind)});}
  f.fire('keydown','KeyW','w',{isComposing:true});assert.equal(f.ctx.spaceKeys.size,0);assert.deepEqual(f.calls,[]);
});

test('blur and visibility loss clear held ground, space, boost, pointer and reel controls',()=>{
  for(const kind of ['blur','visibilitychange']){
    const f=fixture('wasd'),input=new Controls.FishingInput();input.enable({disabled:true,focus(){}});input.holdSpace();f.ctx.fishGame={input};f.fire('keydown','KeyW');
    f.ctx.spaceKeys.add('w');f.ctx.boostHeld=true;f.ctx.spacePointer={x:2,y:3};f.ctx.document.hidden=true;
    for(const handler of (kind==='blur'?f.windowHandlers:f.documentHandlers).get(kind)??[])handler();
    assert.equal(f.keys.size,0);assert.equal(f.ctx.spaceKeys.size,0);assert.equal(f.ctx.boostHeld,false);assert.equal(f.ctx.spacePointer,null);assert.equal(input.held,false);
    if(kind==='visibilitychange'){assert.equal(f.ctx.previous,12345);assert.ok(f.calls.some(([call,dt,playing])=>call==='graphicsSample'&&dt===0&&playing===false));}
  }
});
