// w21: every item list shows labelled groups (item-groups.ts), each weakest to strongest inside.
import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'',shortCircuit:true}:next(url,context);}});
const M=await import('../src/model.ts');
const P=await import('../src/item-power.ts');
const IG=await import('../src/item-groups.ts');
const Tester=await import('../src/tester.ts');
const {benchHtml}=await import('../src/upgrade-bench.ts');
const {setLanguage,t}=await import('../src/i18n.ts');
afterEach(()=>setLanguage('en'));
const ids=html=>[...html.matchAll(/data-group="(\w+)"/g)].map(m=>m[1]).filter((g,i,a)=>a.indexOf(g)===i);
const ordered=(groups,order)=>groups.every((g,i)=>i===0||order.indexOf(groups[i-1])<order.indexOf(g));

test('groupOf sorts every item into its slot or kind',()=>{
  const expect={hat_straw:'hat',armor_leather:'outfit',boots_cowboy:'boots',sword_wood:'sword',gun_pea:'ranged',rod:'tool',worm:'tool',pet_robot:'pet',dz_ninja:'disguise',meat:'food',carrot:'harvest',fish_perch:'fish',seed_fire:'seed',leather:'material',deco_lamp:'decor',plot_kit:'kit'};
  for(const [id,g] of Object.entries(expect))assert.equal(IG.groupOf(id),g,id);
  for(const id of Object.keys(M.ITEMS))assert.ok(IG.GROUPS[IG.groupOf(id)],id);
});
test('groups follow the panel order and run weakest to strongest inside',()=>{
  const all=Object.keys(M.ITEMS);
  for(const order of [IG.GEAR_ORDER,IG.BAG_ORDER]){
    const groups=IG.groupItems(all,id=>id,order);
    assert.ok(ordered(groups.map(g=>g.id),order));
    assert.equal(groups.reduce((n,g)=>n+g.entries.length,0),all.length);
    for(const g of groups)for(let i=1;i<g.entries.length;i++)assert.ok(P.compareByPower(g.entries[i-1],g.entries[i])<=0,`${g.id}: ${g.entries[i-1]} before ${g.entries[i]}`);
  }
  assert.deepEqual(IG.groupItems(['sword_lava','hat_straw','sword_wood','meat'],id=>id).map(g=>g.id),['hat','sword','food']);
  assert.deepEqual(IG.groupItems(['sword_lava','hat_straw','sword_wood','meat'],id=>id,IG.BAG_ORDER).map(g=>g.id),['food','hat','sword']);
  assert.deepEqual(IG.groupItems(['sword_lava','sword_wood'],id=>id)[0].entries,['sword_wood','sword_lava']);
});
test('each group has a header "icon label · count", and a folded group stays in the markup but hidden',()=>{
  const html=IG.groupedHtml('test',IG.groupItems(['hat_straw','hat_bear','sword_wood'],id=>id),id=>`<i>${id}</i>`);
  assert.match(html,/🎩 Hats · 2/);assert.match(html,/⚔️ Melee weapons · 1/);assert.match(html,/data-action="toggle-group" data-panel="test" data-group="hat" aria-expanded="true"/);
  assert.equal(IG.toggleFold('test','hat'),true);assert.ok(IG.isFolded('test','hat'));
  assert.match(IG.groupedHtml('test',IG.groupItems(['hat_straw'],id=>id),id=>id),/item-group folded/);
  assert.equal(IG.toggleFold('test','hat'),false);
});
test('the tester shop and the upgrade bench show grouped lists',()=>{
  const s=M.newGame();s.settings.tester=true;s.energy=1e9;
  const tester=Tester.testerShopHtml(s);assert.ok(ids(tester).length>5&&ordered(ids(tester),IG.GEAR_ORDER),ids(tester).join());
  assert.match(tester,/href="#tester-cat-hat"/);
  for(const id of ['sword_lava','sword_wood','hat_straw','pet_robot','gun_pea'])s.bag[id]=1;
  const bench=benchHtml(s,'gear',{art:(_,i)=>i,chips:()=>'',skills:[]});assert.deepEqual(ids(bench),['hat','sword','ranged','pet']);
  assert.ok(bench.indexOf('sword_wood')<bench.indexOf('sword_lava'));
});
test('every group header has Vietnamese',()=>{
  setLanguage('vi');
  for(const g of Object.values(IG.GROUPS))assert.notEqual(t(g.label),g.label,g.label);
  assert.equal(IG.groupTitle(IG.GROUPS.hat,7),'🎩 Mũ · 7');
});
test('main.ts panels group with the right order: shop and workshop gear-first; bag, chest and market gather-first',async()=>{
  const {readFile}=await import('node:fs/promises');const src=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
  const fnBody=name=>{const at=src.indexOf(`function ${name}(`);return src.slice(at,src.indexOf('\nfunction ',at+10));};
  for(const [fn,panel,order] of [['shop','shop','GEAR_ORDER'],['crafting','craft','GEAR_ORDER'],['inventory','bag','BAG_ORDER'],['market','sell','BAG_ORDER'],['storage','chest','BAG_ORDER']]){
    const body=fnBody(fn);assert.ok(body.includes(`IG.${order}`),`${fn} uses ${order}`);assert.ok(body.includes(`IG.groupedHtml(`)&&body.includes(`'${panel}'`),`${fn} renders groups`);assert.ok(!body.includes('sortByPower'),fn);
  }
});
