import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaceNoticeHistory, NOTICE_COOLDOWN } from '../src/place-notices.ts';
test('place introductions show once across reloads, independently per save', () => {
 const store=new Map<string,string>(), storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);}};
 let scope='one'; const h=new PlaceNoticeHistory(()=>scope,storage);
 assert.equal(h.first('fishing'),true);assert.equal(h.first('fishing'),false);
 assert.equal(new PlaceNoticeHistory(()=>scope,storage).first('fishing'),false);
 scope='two';assert.equal(h.first('fishing'),true);scope='one';assert.equal(h.first('fishing'),false);
});
test('repeated interactions do not spam reminders, with independent per-save cooldowns',()=>{
 let scope='one';const h=new PlaceNoticeHistory(()=>scope);
 assert.equal(h.allow('fishing',100),true);assert.equal(h.allow('fishing',101),false);
 assert.equal(h.allow('fishing',100+NOTICE_COOLDOWN),true);
 scope='two';assert.equal(h.allow('fishing',102),true);
});
test('unavailable storage still remembers the introduction for this session',()=>{
 const h=new PlaceNoticeHistory(()=>'one',{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
 assert.equal(h.first('fishing'),true);assert.equal(h.first('fishing'),false);
});
