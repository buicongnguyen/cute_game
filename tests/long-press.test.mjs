import test from 'node:test';
import assert from 'node:assert/strict';
import {mountLongPress,cancelLongPresses} from '../src/long-press.ts';

function fixture(t) {
  t.mock.timers.enable({apis:['setTimeout']});
  const previous=globalThis.window;globalThis.window={setTimeout,clearTimeout};
  t.after(()=>{cancelLongPresses();if(previous===undefined)delete globalThis.window;else globalThis.window=previous;});
  const fire=(button,type,pointerId=1,extra={})=>{
    const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId,button:0,detail:1,...extra});
    button.dispatchEvent(event);return event.defaultPrevented;
  };
  const make=(enabled=()=>true)=>{
    const button=new EventTarget(),calls=[];mountLongPress(button,()=>calls.push('hold'),enabled);
    button.addEventListener('click',()=>calls.push('activate'));
    return {button,calls};
  };
  return {fire,make,tick:ms=>t.mock.timers.tick(ms)};
}

test('holding one skill and tapping another cannot turn the held skill into an attack',t=>{
  const f=fixture(t),a=f.make(),b=f.make();
  f.fire(a.button,'pointerdown',10);f.tick(450);f.fire(b.button,'pointerdown',11);
  f.fire(a.button,'pointerup',10);assert.equal(f.fire(a.button,'click',10),true);
  f.fire(b.button,'pointerup',11);assert.equal(f.fire(b.button,'click',11),false);
  assert.deepEqual(a.calls,['hold']);assert.deepEqual(b.calls,['activate']);
});

test('releasing another skill cannot cancel the first skill hold timer',t=>{
  const f=fixture(t),a=f.make(),b=f.make();
  f.fire(a.button,'pointerdown',1);f.tick(150);f.fire(b.button,'pointerdown',2);f.tick(100);
  f.fire(b.button,'pointerup',2);f.fire(b.button,'click',2);f.tick(200);
  assert.deepEqual(a.calls,['hold']);assert.deepEqual(b.calls,['activate']);
});

test('lifecycle cancellation prevents delayed pickers and does not swallow the next tap',t=>{
  const f=fixture(t),a=f.make();f.fire(a.button,'pointerdown');f.tick(300);cancelLongPresses();f.tick(600);
  assert.deepEqual(a.calls,[]);f.fire(a.button,'pointerup');assert.equal(f.fire(a.button,'click'),true,'an old finger release cannot activate after the interruption');
  f.fire(a.button,'pointerdown');f.fire(a.button,'pointerup');f.fire(a.button,'click');
  assert.deepEqual(a.calls,['activate']);
});

test('interrupting a completed hold also suppresses its later release click',t=>{
  const f=fixture(t),a=f.make();f.fire(a.button,'pointerdown');f.tick(450);cancelLongPresses();
  f.fire(a.button,'pointerup');assert.equal(f.fire(a.button,'click'),true);assert.deepEqual(a.calls,['hold']);
});

test('interrupted capture cancels a hold but normal release preserves its click suppression',t=>{
  const f=fixture(t),a=f.make();f.fire(a.button,'pointerdown');f.tick(300);f.fire(a.button,'lostpointercapture');f.tick(600);
  assert.deepEqual(a.calls,[]);f.fire(a.button,'pointerdown');f.tick(450);f.fire(a.button,'pointerup');f.fire(a.button,'lostpointercapture');
  assert.equal(f.fire(a.button,'click'),true);assert.deepEqual(a.calls,['hold']);
});

test('secondary pointers and secondary mouse buttons cannot steal a pending hold',t=>{
  const f=fixture(t),a=f.make();f.fire(a.button,'pointerdown',9,{button:2});f.tick(500);assert.deepEqual(a.calls,[]);
  f.fire(a.button,'pointerdown',1);f.tick(200);f.fire(a.button,'pointerdown',2);f.fire(a.button,'pointercancel',2);f.tick(250);
  assert.deepEqual(a.calls,['hold']);f.fire(a.button,'pointerup',1);assert.equal(f.fire(a.button,'click',1),true);
});

test('blocked gameplay cancels the pending action and keyboard activation stays available',t=>{
  const f=fixture(t);let enabled=true;const a=f.make(()=>enabled);
  f.fire(a.button,'pointerdown');enabled=false;f.tick(450);assert.deepEqual(a.calls,[]);
  enabled=true;f.fire(a.button,'pointerdown');f.tick(450);f.fire(a.button,'pointerup');
  assert.equal(f.fire(a.button,'click',0,{detail:0}),false);assert.deepEqual(a.calls,['hold','activate']);
  assert.equal(f.fire(a.button,'click'),true,'the original held touch still cannot cast');
});
