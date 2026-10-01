import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import { gameHours, GAME_HOUR_MS } from '../src/farm-clock.ts';
import { FarmPenView, placeholderAnimal, rigOf } from '../src/farm-view.ts';
import { animalStatus, penHtml } from '../src/farm-ui.ts';
import { setLanguage } from '../src/i18n.ts';
const now = 1_000_000;
const home = () => { const s=M.newGame();s.level=30;s.energy=100_000;s.farm.built=true;return s; };
const reload=(s:M.SaveState)=>M.parseSave(JSON.stringify(s))!;

test('the farm clock preserves the 2:3:4:6 game-hour ratio and new products are usable',()=>{
  assert.equal(GAME_HOUR_MS,60_000);
  for(const [kind,hours,item] of [['chicken',2,'egg'],['duck',3,'duck_egg'],['cow',4,'milk'],['pig',6,'truffle']] as const){
    const s=home(), a=M.buyAnimal(s,kind,now)!;
    assert.equal(M.ANIMALS[kind].productMs,gameHours(hours));
    const at=M.adultAt(a)+gameHours(hours);
    assert.equal(M.productCount(a,at-1),0);assert.equal(M.productCount(a,at),1);
    assert.equal(M.collectProducts(s,at)[0].item,item);assert.equal(s.bag[item],1);
    assert.ok(M.sell(s,item,1)>0);assert.equal(s.bag[item],undefined);
  }
});

test('offline stock caps at three; collection preserves a partial cycle until the stock is full',()=>{
  const s=home(),a=M.buyAnimal(s,'duck',now)!,d=M.productDuration(a),adult=M.adultAt(a);
  const partial=adult+2.5*d;
  assert.equal(M.productCount(a,partial),2);
  assert.equal(M.collectProducts(s,partial,[a.uid,a.uid]).length,2);
  assert.equal(M.timeLeft(a,partial),d/2);assert.deepEqual(M.collectProducts(s,partial),[]);
  const r=reload(s),b=r.farm.animals[0];
  assert.equal(M.productCount(b,partial+d/2),1);
  const full=partial+20*d;assert.equal(M.productCount(b,full),3);
  assert.equal(M.collectProducts(r,full).length,3);assert.equal(M.timeLeft(b,full),d);
  assert.equal(r.bag.duck_egg,5);
});

test('species shelters preserve stock and fractional progress, accelerate only nearby matching animals',()=>{
  const s=home(),a=M.buyAnimal(s,'chicken',now)!,b=M.buyAnimal(s,'duck',now)!,d=M.productDuration(a);
  const at=M.adultAt(a)+d*2.5, cash=s.energy;
  assert.ok(M.buildSpeciesPen(s,'chicken',at));assert.equal(s.energy,cash-M.SPECIES_PEN_COST.chicken);
  assert.equal(M.productDuration(a),84_000);assert.equal(M.productCapacity(a),5);
  assert.equal(M.productCount(a,at),2);assert.equal(M.productCapacity(b),3);assert.equal(M.productDuration(b),180_000);
  assert.equal(M.collectProducts(s,at).filter(v=>v.uid===a.uid).length,2);assert.equal(M.timeLeft(a,at),42_000);
  assert.equal(M.buildSpeciesPen(s,'chicken',at),false);
  const r=reload(s),c=r.farm.animals.find(v=>v.uid===a.uid)!;assert.equal(c.pen,true);
  assert.equal(M.productCount(c,at+8*84_000),5);
  c.home={x:100,z:100};const far=reload(r).farm.animals.find(v=>v.uid===a.uid)!;assert.equal(far.pen,false);
});

test('legacy first product deadlines survive repeated migrations and switch after collection',()=>{
  for(const [kind,old] of [['chicken',40_000],['cow',75_000]] as const){
    const s=home(),adult=now+M.ANIMALS[kind].growMs;
    s.farm=M.parseFarm({built:true,animals:[{uid:1,kind,bornAt:now,cycleAt:adult,coat:3}]});
    const r=reload(reload(s)),a=r.farm.animals[0];
    assert.equal(a.coat,3);assert.equal(a.acquiredAt,now);assert.equal(a.legacyFirstCycleMs,old);
    assert.equal(M.timeLeft(a,adult+old/2),old/2);assert.equal(M.productCount(a,adult+old),1);
    assert.equal(M.collectProducts(r,adult+old).length,1);assert.equal(a.legacyFirstCycleMs,undefined);
    assert.equal(M.timeLeft(a,adult+old),M.ANIMALS[kind].productMs);
    assert.equal(reload(r).farm.animals[0].legacyFirstCycleMs,undefined);
  }
});

test('guard dogs are unique permanent guardians, with pen-dependent bites and no production or meat',()=>{
  const s=home(),dog=M.buyAnimal(s,'dog',now)!;
  assert.ok(dog);assert.equal(M.buyAnimal(s,'dog',now),null);assert.equal(M.penCapacity(s,'dog'),1);
  assert.equal(M.hasGuardDog(s,now-1),false);assert.equal(M.hasGuardDog(s,now),true);assert.equal(M.guardBiteDamage(s,now),18);
  assert.equal(M.expiresAt(dog),Infinity);assert.equal(M.expired(dog,now+100*M.ANIMAL_LIFESPAN_MS),false);
  assert.equal(M.canFeed(dog,now),false);assert.equal(M.productCount(dog,now+100*M.ANIMAL_LIFESPAN_MS),0);
  assert.deepEqual(M.collectProducts(s,now+100*M.ANIMAL_LIFESPAN_MS),[]);
  assert.ok(M.buildSpeciesPen(s,'dog',now));assert.equal(M.guardBiteDamage(reload(s),now),30);
  assert.match(animalStatus(dog,now).text,/30/);assert.doesNotMatch(animalStatus(dog,now).text,/Life left/);
});

test('livestock expires after two real hours and failed full-stock grants retain the stock',()=>{
  for(const kind of ['duck','pig'] as const){
    const s=home(),a=M.buyAnimal(s,kind,now)!,at=M.adultAt(a)+10*M.productDuration(a),item=M.ANIMALS[kind].product;
    s.bag[item]=Number.MAX_SAFE_INTEGER;const before=structuredClone(a);
    assert.deepEqual(M.collectProducts(s,at),[]);assert.deepEqual(a,before);
    delete s.bag[item];const end=now+M.ANIMAL_LIFESPAN_MS;
    assert.equal(M.productFor(a,end),'meat');assert.equal(M.collectProducts(s,end).length,1);
    assert.equal(s.bag.meat,1);assert.equal(s.farm.animals.length,0);assert.deepEqual(M.collectProducts(s,end),[]);
  }
});

test('new models expose independent articulated parts and stay visible with finite matrices',()=>{
  const s=home();for(const kind of ['duck','pig','dog'] as const)M.buyAnimal(s,kind,now);
  for(const id of ['duck','duckling','pig','piglet','dog'] as const){
    const root=placeholderAnimal(id),rig=rigOf(root);assert.ok(rig.height>0);
    assert.ok(rig.parts.some(p=>p.draw==='head'));assert.ok(rig.parts.some(p=>p.draw==='legs'));
  }
  const view=new FarmPenView();for(let i=0;i<120;i++)view.update(s.farm.animals,1/60,i/60,now+300_000);
  assert.equal(view.positions().length,3);assert.ok(view.draws>0);
  view.animals.traverse(o=>{assert.ok(o.matrix.elements.every(Number.isFinite));});view.dispose();
});

test('farm UI explains the clock, shelter bonuses and guardian in both languages',()=>{
  const s=home(),ui={art:(_id:string,icon:string)=>icon,esc:(s:string)=>s,mini:(id:string)=>id,chips:()=>'',effect:()=>''};
  try{for(const locale of ['en','vi'] as const){setLanguage(locale);const html=penHtml(s,ui,now);assert.match(html,/data-kind="duck"/);assert.match(html,/data-kind="pig"/);assert.match(html,/data-kind="dog"/);assert.match(html,/70%/);assert.match(html,/18.*30/);assert.ok(html.includes(locale==='en'?'1 game hour = 1 real minute':'1 giờ trong game = 1 phút thực'));}}
  finally{setLanguage('en');}
});

test('each ready animal row exposes its own localized stock collection action',()=>{
  const s=home(),a=M.buyAnimal(s,'duck',now)!,b=M.buyAnimal(s,'pig',now)!,dog=M.buyAnimal(s,'dog',now)!;
  const ui={art:(_id:string,icon:string)=>icon,esc:(s:string)=>s,mini:(id:string)=>id,chips:()=>'',effect:()=>''},at=now+600_000;
  try{for(const locale of ['en','vi'] as const){setLanguage(locale);const html=penHtml(s,ui,at);
    assert.match(html,new RegExp(`data-action="collect-animal" data-id="${a.uid}"`));assert.match(html,new RegExp(`data-action="collect-animal" data-id="${b.uid}"`));
    assert.doesNotMatch(html,new RegExp(`data-action="collect-animal" data-id="${dog.uid}"`));assert.ok(html.includes(locale==='en'?'Collect ×2':'Thu ×2'));
  }}finally{setLanguage('en');}
});

test('guard presentation follows a moving thief, gives one visible bite, and changes no saved state',()=>{
  const s=home(),dog=M.buyAnimal(s,'dog',now)!,view=new FarmPenView();
  view.setArea({home:{x:0,z:0,rx:2,rz:2},radius:20,blocked:()=>false});view.update(s.farm.animals,.05,0,now);
  const start=view.positionOf(dog.uid)!,target={x:start.x+8,z:start.z};const before=structuredClone(s);
  assert.ok(view.guardBite(target,()=>target));
  for(let i=0;i<15;i++)view.update(s.farm.animals,.05,i*.05,now);
  target.z+=4;let flashed=false,maxZ=start.z;
  for(let i=15;i<150;i++){view.update(s.farm.animals,.05,i*.05,now);flashed ||= view.animals.getObjectByName('guard-bite-flash')?.visible===true;maxZ=Math.max(maxZ,view.positionOf(dog.uid)!.z);}
  assert.ok(flashed,'a lunge and expanding bite flash visibly finish the chase');assert.ok(maxZ>start.z+2,'the pursuit follows the updated target');
  assert.equal(view.animals.getObjectByName('guard-bite-flash')?.visible,false);assert.deepEqual(s,before,'presentation cannot apply damage or rewards');view.dispose();
});

test('guard presentation cancels when the thief leaves the garden',()=>{
  const s=home(),dog=M.buyAnimal(s,'dog',now)!,view=new FarmPenView();view.setArea({home:{x:0,z:0,rx:2,rz:2},radius:20,blocked:()=>false});view.update(s.farm.animals,.05,0,now);
  const start=view.positionOf(dog.uid)!;assert.ok(view.guardBite({x:start.x+8,z:start.z},()=>null));
  for(let i=0;i<160;i++)view.update(s.farm.animals,.05,i*.05,now);
  assert.equal(view.animals.getObjectByName('guard-bite-flash'),undefined);view.dispose();
});

test('all four full species pens retain every accumulated product animation and stable shelter meshes',()=>{
  const s=home();M.expandPen(s);M.expandPen(s);
  for(const kind of ['chicken','duck','cow','pig'] as const){M.buildSpeciesPen(s,kind,now);for(let i=0;i<10;i++)assert.ok(M.buyAnimal(s,kind,now));}
  const dog=M.buyAnimal(s,'dog',now)!;M.buildSpeciesPen(s,'dog',now);
  const view=new FarmPenView();view.setSpeciesPens(s.farm.speciesPens);const statics=[...view.statics.children];view.setSpeciesPens(structuredClone(s.farm.speciesPens));assert.deepEqual(view.statics.children,statics);
  const at=now+3600_000;view.update(s.farm.animals,.1,1,at);assert.equal(view.positions().length,41);
  assert.ok(view.guardBite({x:M.PEN.x,z:M.PEN.z+2}));assert.equal(view.guardBite({x:NaN,z:0}),false);
  const collected=M.collectProducts(s,at);assert.equal(collected.length,200);assert.equal(M.productCount(dog,at),0);
  for(const c of collected)view.collect(c.uid,c.item);view.update(s.farm.animals,.1,1.1,at+100);
  for(const id of ['egg','duck_egg','milk','truffle']){
    const mesh=view.animals.children.find(m=>m.name==='farm-product:'+id) as import('three').InstancedMesh;
    assert.equal(mesh.count,50);assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite));
  }
  view.dispose();
});
