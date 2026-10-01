import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { t, localizeHtml, getLanguage, setLanguage, onLanguageChange, LANGUAGE_KEY, bindLanguage } from '../src/i18n.ts';
import * as M from '../src/model.ts';
afterEach(()=>setLanguage('en'));

test('Vietnamese catalog labels and dynamic crop messages preserve numbers and punctuation',()=>{
  setLanguage('vi');
  assert.equal(t('Carrot'),'Cà Rốt Tốc Hành');
  assert.equal(t('carrot'),'Cà Rốt Tốc Hành');
  assert.equal(t('About 15 seconds until ripe'),'Còn khoảng 15 giây nữa là chín');
  assert.ok(!t('Carrot harvested.').includes('Carrot'));
  assert.ok(t('🔒 Level 27').includes('27'));
  assert.notEqual(t('🔒 Level 27'),'🔒 Level 27');
  assert.equal(t('  Carrot  '),'  Cà Rốt Tốc Hành  ');
  assert.equal(t('Unknown future item'),'Unknown future item');
  assert.equal(t('Sharp · 2.00× resolution'),'Sắc nét · độ phân giải 2.00×');
  assert.equal(t('+25% attack, +10 defense for 60s'),'+25% tấn công, +10 phòng thủ trong 60 giây');
  assert.equal(t('➕ Expand garden: add 1 bed (ϟ 60)'),'➕ Mở rộng vườn: thêm 1 luống (ϟ 60)');
  assert.equal(t('➕ Expand garden: add 1 bed (one in your bag)'),'➕ Mở rộng vườn: thêm 1 luống (có một bộ trong ba lô)');
});

test('explicit parameters preserve player names, markup, dollars, and braces literally',()=>{
  setLanguage('vi');
  const name='Carrot {count} <img src=x> $&';
  assert.equal(t('Welcome back, {name}. Your garden missed you!',{name}),`Chào mừng trở lại, ${name}. Khu vườn nhớ bạn lắm!`);
  assert.equal(t('Unknown {name}',{name}),`Unknown ${name}`);
  for(const unknown of ['constructor','toString','__proto__'])assert.equal(t(unknown,{}),unknown);
});

test('HTML localization preserves actions, item IDs, values, and escaped user text',()=>{
  setLanguage('vi');
  const html='<button data-action="buy" data-item="carrot" title="Carrot" aria-label="Carrot">Carrot</button><input value="Carrot" placeholder="Your name"><span data-i18n-skip>Carrot &lt;script&gt;alert(1)&lt;/script&gt;</span><kbd>Space</kbd>';
  const result=localizeHtml(html);
  assert.match(result,/data-action="buy" data-item="carrot" title="Cà Rốt Tốc Hành" aria-label="Cà Rốt Tốc Hành">Cà Rốt Tốc Hành/);
  assert.match(result,/value="Carrot" placeholder="[^"]+"/);
  assert.ok(!result.includes('placeholder="Your name"'));
  assert.ok(result.includes('<span data-i18n-skip>Carrot &lt;script&gt;alert(1)&lt;/script&gt;</span><kbd>Space</kbd>'));
  assert.ok(!result.includes('<script>'));
  const injected=localizeHtml('<p>Welcome back, &lt;img src=x onerror=alert(1)&gt;. Your garden missed you!</p>');
  assert.ok(injected.includes('&lt;img'));assert.ok(!injected.includes('<img'));
  setLanguage('en');assert.equal(localizeHtml(html),html);
});

test('language changes stay outside game saves and notify only on change',()=>{
  setLanguage('en');const s=M.newGame('Carrot'),before=JSON.stringify(s);let changes=0;
  const unsubscribe=onLanguageChange(()=>changes++);
  setLanguage('vi');assert.equal(getLanguage(),'vi');assert.equal(changes,1);
  setLanguage('vi');assert.equal(changes,1);
  assert.equal(JSON.stringify(s),before);assert.equal(s.name,'Carrot');
  unsubscribe();setLanguage('en');assert.equal(changes,1);assert.equal(t('Carrot'),'Carrot');
});

test('language preference uses its own key and remains usable with blocked storage',()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');const saved=new Map<string,string>();
  try{
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>saved.set(k,v)}});
    setLanguage('vi');assert.equal(saved.get(LANGUAGE_KEY),'vi');assert.deepEqual([...saved.keys()],[LANGUAGE_KEY]);
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('blocked');}});
    assert.doesNotThrow(()=>setLanguage('en'));assert.equal(getLanguage(),'en');
    assert.doesNotThrow(()=>setLanguage('vi'));assert.equal(getLanguage(),'vi');
  }finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete (globalThis as any).localStorage;}
});

test('static DOM bindings round-trip language without replacing inputs or translating user content',()=>{
  class FakeNode {
    nodeType=1;tagName='DIV';textContent='';childNodes:FakeNode[]=[];attrs=new Map<string,string>();
    getAttribute(k:string){return this.attrs.get(k)??null;}hasAttribute(k:string){return this.attrs.has(k);}setAttribute(k:string,v:string){this.attrs.set(k,v);}
    contains(other:FakeNode):boolean{return this===other||this.childNodes.some(c=>c.contains(other));}
  }
  const root=new FakeNode(),text=new FakeNode(),input=new FakeNode(),user=new FakeNode(),userText=new FakeNode();
  text.nodeType=userText.nodeType=3;text.textContent=userText.textContent='Carrot';input.tagName='INPUT';input.attrs.set('value','Carrot');input.attrs.set('placeholder','Your name');user.attrs.set('data-i18n-skip','');user.childNodes=[userText];root.childNodes=[text,input,user];
  setLanguage('en');const refresh=bindLanguage(root as unknown as Element);setLanguage('vi');refresh();
  assert.equal(text.textContent,'Cà Rốt Tốc Hành');assert.equal(userText.textContent,'Carrot');assert.equal(input.attrs.get('value'),'Carrot');assert.notEqual(input.attrs.get('placeholder'),'Your name');assert.equal(root.childNodes[1],input);
  setLanguage('en');refresh();assert.equal(text.textContent,'Carrot');assert.equal(input.attrs.get('placeholder'),'Your name');
});
