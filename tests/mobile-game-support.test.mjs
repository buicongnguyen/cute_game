import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {VI_PACK} from '../src/locales/vi-pack.ts';

test('mobile interruption releases document keyboard handlers and preserves fullscreen icons',async()=>{
  const source=await readFile(new URL('../src/mobile-game-support.mjs',import.meta.url),'utf8');
  const listeners=()=>({handlers:new Map(),addEventListener(name,fn){const list=this.handlers.get(name)||[];list.push(fn);this.handlers.set(name,list);},dispatchEvent(event){for(const fn of this.handlers.get(event.type)||[])fn(event);}});
  const window=listeners(),document=listeners(),attrs={};
  const button={textContent:'⛶',hasAttribute:()=>false,setAttribute:(key,value)=>attrs[key]=value,dataset:{},style:{getPropertyValue:()=>'',setProperty(){},removeProperty(){}}}; // a real element always has dataset and style (the safe-margin pass reads them)
  Object.assign(document,{head:{append(){}},body:{},documentElement:{lang:'en'},createElement:()=>({dataset:{}}),querySelectorAll:()=>[button],getElementById:()=>null});
  const context={window,document,Element:class{},KeyboardEvent:class{constructor(type,props){this.type=type;Object.assign(this,props);}},Event:class{constructor(type){this.type=type;}},MutationObserver:class{observe(){}takeRecords(){return[];}disconnect(){}},matchMedia:()=>({matches:false}),performance:{now:()=>0}};
  vm.createContext(context);vm.runInContext(source.replace('export function','function'),context);
  // The game passes its t() as `translate` (mobile-game-init.mjs); here the Vietnamese pack stands in for it.
  const translate=text=>document.documentElement.lang==='vi'?VI_PACK[text]??text:text;
  context.installMobileGameSupport({fullscreen:false,existingButtons:['.platform-tools button:first-child'],translate});
  const released=[];document.addEventListener('keyup',e=>released.push(e.code));
  window.dispatchEvent({type:'keydown',code:'KeyW',key:'w'});
  window.dispatchEvent({type:'blur'});window.dispatchEvent({type:'blur'});
  assert.deepEqual(released,['KeyW']);
  document.dispatchEvent({type:'fullscreenchange'});
  assert.equal(button.textContent,'⛶');assert.equal(attrs['aria-label'],'Full screen');
  document.documentElement.lang='vi';document.fullscreenElement={};document.dispatchEvent({type:'fullscreenchange'});
  assert.equal(button.textContent,'⛶');assert.equal(attrs['aria-label'],'Thoát toàn màn hình');assert.equal(attrs['aria-pressed'],'true');
});

