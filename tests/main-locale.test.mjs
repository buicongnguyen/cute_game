import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import {t,localizeHtml,setLanguage,getLanguage} from '../src/i18n.ts';
import {canTryOn,autoHeld} from '../src/try-on.ts';
import {wardrobeItem} from '../src/house-stores.ts';
import {ENEMY_TYPES} from '../src/enemy-types.ts';
import {produceLots,upgradeCards} from '../src/item-views.ts';
import {dishesHtml,penHtml,penSignature} from '../src/farm-ui.ts';
import {QUALITY} from '../src/graphics.ts';
import {planRoutes} from '../src/space.ts';
import {helperRow} from '../src/helper-ui.ts';
import {HELP_TOPICS} from '../src/help-topics.ts';

afterEach(()=>setLanguage('en'));

// Run the real panel renderers without a GPU; game data, catalogs and localization
// are their production modules. We intercept only the dialog/DOM display boundary.
const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const renderers=['languageSelector','tryOnButton','effectText','growText','expandButton','bedUpgradeRow','plotDialog','inventory','rewardChips','materialChips','quests','shop','market','storage','upgrades','cooking','crafting','decorations','planets','map','settings','testerMore','testerOnline','help','penDialog'];
const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&renderers.includes(node.name?.text)).map(node=>node.getText(ast)).join('\n');
const globals=['BUFF_WORDS','JOURNAL_TABS','SHOP_TABS'];
const declarations=ast.statements.filter(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>globals.includes(item.name.getText(ast)))).map(node=>node.getText(ast)).join('\n');
const shell=ast.statements.find(node=>ts.isExpressionStatement(node)&&node.getText(ast).startsWith('app.innerHTML =')).getText(ast).replaceAll('import.meta.env.VITE_STATIC_HOST',"'true'");
const compiled=ts.transpileModule(declarations+'\n'+functions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function fixture(advanced=true){
  const state=M.newGame('Carrot <Send> {name}');
  if(advanced){
    state.level=45;state.energy=10000;state.discovered=Object.keys(M.PLANETS);state.visited=[...state.discovered];state.farm.built=true;
    for(const id of Object.keys(M.ITEMS))state.bag[id]=7;
    for(const slot of ['weapon','hat','outfit','boots','pet']){const id=Object.keys(M.ITEMS).find(id=>M.ITEMS[id].slot===slot);if(id)state.gear[slot]=id;}
    M.buyAnimal(state,'chicken');M.buyAnimal(state,'cow');
  }
  P.refreshProgress(state);
  let panels=[];
  const art=(id,icon)=>`<span data-art="${id}">${icon}</span>`,mini=id=>`<span data-item="${id}">${M.ITEMS[id]?.icon??'✨'}</span>`;
  const context={M,planRoutes,...P,STORY_STEPS:P.STORY_STEPS,t,helperRow,localizeHtml,getLanguage,esc,art,mini,ENEMY_TYPES,produceLots,upgradeCards,dishesHtml,penHtml,penSignature,QUALITY,ZOOM:{},state,saved:state,app:{innerHTML:''},tryingOn:null,canTryOn,autoHeld,bagMode:'bag',wardrobeItem,visiting:null,activePlot:0,selectedItem:advanced?'manure':null,shopTab:'Weapons',journalTab:'story',craftStation:'craft',craftTab:'All',penShown:'',graphics:{setting:'auto',level:'high',ratio:2,fps:60},world:{zoom:1,planet:'home'},saveFailed:false,persistence:null,actionHandler:null,testerOpen:false,Tester:{isTester:()=>false,testerKitchenHtml:()=>'',testerMakeButton:()=>'',TESTER_TAG:''},
    HELP_TOPICS,joystickEnabled:()=>state.settings.movePad??false,
    openDialog:(type,title,html,kicker,icon)=>{panels.push({type,title:t(title),html:localizeHtml(html),kicker:t(kicker||''),icon});},
    $:()=>({insertAdjacentHTML:(_where,html)=>{panels.at(-1).html+=localizeHtml(html);}}),toast:()=>{},formatSize:cm=>`${cm} cm`,harvestNearby:()=>{},
    farmUi:{art,esc,mini,chips:()=>'',effect:item=>t(item.desc)},
  };
  const ctx=vm.createContext(context);vm.runInContext(compiled,ctx);
  return {state,ctx,render(name,...args){panels=[];ctx[name](...args);return panels;},shell(){vm.runInContext(shell,ctx);return localizeHtml(ctx.app.innerHTML);}};
}

// Only presentation copy may change. Every game action, item identifier, field
// value, enabled state and pressed state must still address the same operation.
function actions(html){
  return [...html.matchAll(/<[a-z][^>]*>/gi)].map(([tag])=>{
    const attrs=[...tag.matchAll(/\s((?:data-[\w-]+|id|name|value|aria-pressed|aria-checked)="[^"]*"|disabled(?=[\s>]))/g)].map(([,attr])=>attr);
    return attrs.length?[tag.match(/^<([a-z]+)/i)[1],...attrs]:null;
  }).filter(Boolean);
}
function suite(app){
  const result=[];
  for(const name of ['inventory','market','storage','upgrades','cooking','decorations','planets','map','settings','help','penDialog'])result.push(...app.render(name));
  for(const tab of ['Weapons','Clothing','Pets','Disguises','Supplies','Decor']){app.ctx.shopTab=tab;result.push(...app.render('shop'));}
  for(const kind of ['story','daily','weekly','achievements','pass','bounties','collection','challenges']){app.ctx.journalTab=kind;result.push(...app.render('quests'));}
  result.push(...app.render('plotDialog',0));
  for(const station of ['craft','forge']){app.ctx.craftStation=station;result.push(...app.render('crafting'));}
  return result;
}

test('all main menus switch Vietnamese and back with identical game actions and saved state',()=>{
  const app=fixture();setLanguage('en');const english=suite(app),saved=JSON.stringify(app.state);
  setLanguage('vi');const vietnamese=suite(app);
  assert.equal(english.length,28);assert.equal(vietnamese.length,english.length);
  for(let i=0;i<english.length;i++){
    assert.equal(vietnamese[i].type,english[i].type);
    assert.deepEqual(actions(vietnamese[i].html),actions(english[i].html),`${english[i].type}: translated controls must retain their actions and enabled states`);
    assert.notEqual(vietnamese[i].title,english[i].title,`${english[i].type}: visible title must change`);
  }
  const byType=type=>vietnamese.find(panel=>panel.type===type).html;
  assert.match(byType('settings'),/Ngôn ngữ/);assert.match(byType('settings'),/Sắc nét/);assert.match(byType('settings'),/độ phân giải 2\.00×/);
  assert.match(byType('help'),/Nhấn mặt đất để đi/);assert.match(byType('plant'),/Cà Rốt/);
  assert.match(byType('bag'),/ba lô|Ba lô/);assert.match(byType('pen'),/Tuổi thọ/);
  assert.doesNotMatch(byType('settings'),/Choose your language|Sound effects|Automatic|resolution/);
  assert.equal(JSON.stringify(app.state),saved,'translation must not rewrite game data or progression');
  setLanguage('en');const restored=suite(app);
  assert.deepEqual(restored.map(panel=>[panel.type,panel.title,actions(panel.html)]),english.map(panel=>[panel.type,panel.title,actions(panel.html)]));
  assert.equal(JSON.stringify(app.state),saved);
});

test('beginner garden and travel locks retain their meaning and input identifiers in Vietnamese',()=>{
  const app=fixture(false);setLanguage('en');const seeds=app.render('plotDialog',0)[0],travel=app.render('planets')[0];
  const saved=JSON.stringify(app.state);setLanguage('vi');const translatedSeeds=app.render('plotDialog',0)[0],translatedTravel=app.render('planets')[0];
  assert.match(translatedSeeds.html,/data-action="plant" data-item="carrot"/);
  assert.match(translatedSeeds.html,/Cấp 2/);assert.match(translatedTravel.html,/Hành tinh bí ẩn/);
  assert.match(translatedTravel.html,/data-action="launch" disabled/);
  assert.deepEqual(actions(translatedSeeds.html),actions(seeds.html));assert.deepEqual(actions(translatedTravel.html),actions(travel.html));
  assert.equal(JSON.stringify(app.state),saved);
});

test('welcome shell keeps a player name and native language option values unchanged',()=>{
  const app=fixture(false);setLanguage('en');const english=app.shell();setLanguage('vi');const vietnamese=app.shell();
  const name='value="Carrot &lt;Send&gt; {name}"';assert.ok(english.includes(name));assert.ok(vietnamese.includes(name));
  assert.match(vietnamese,/CHÚNG MÌNH GỌI BẠN LÀ GÌ NHỈ/);assert.match(vietnamese,/Tiếp tục phiêu lưu/);
  assert.match(vietnamese,/<option value="en" data-i18n-skip[^>]*>English<\/option>/);
  assert.match(vietnamese,/<option value="vi" data-i18n-skip[^>]*>Tiếng Việt<\/option>/);
  assert.deepEqual(actions(vietnamese),actions(english));assert.equal(app.state.name,'Carrot <Send> {name}');
});

test('a growing bed explains the original-duration fertilizer rule in both languages without using any item',()=>{
  const app=fixture();assert.equal(M.plant(app.state,0,'carrot'),true);const saved=JSON.stringify(app.state);
  setLanguage('vi');const panel=app.render('plotDialog',0)[0];
  assert.equal(panel.type,'plot');assert.match(panel.html,/một nửa thời gian sinh trưởng ban đầu/);
  assert.match(panel.html,/data-action="fertilize-manure"/);assert.match(panel.html,/data-action="fertilize"/);
  assert.match(panel.html,/Còn khoảng \d+ giây nữa là chín/);
  setLanguage('en');assert.match(app.render('plotDialog',0)[0].html,/half of the crop&#39;s original growing time/);
  assert.equal(JSON.stringify(app.state),saved);
});

test('garden expansion localizes energy and owned-kit labels on empty and growing beds',()=>{
  const app=fixture(false);app.state.energy=1000;
  setLanguage('vi');let panel=app.render('plotDialog',0)[0];
  assert.match(panel.html,/Mở rộng vườn: thêm 1 luống \(ϟ 60\)/);
  assert.doesNotMatch(panel.html,/Expand garden|add 1 bed/);
  app.state.bag.plot_kit=2;panel=app.render('plotDialog',0)[0];
  assert.match(panel.html,/Đặt thêm luống \(2 bộ trong ba lô\)/);
  assert.equal(M.plant(app.state,0,'carrot'),true);const saved=JSON.stringify(app.state);
  panel=app.render('plotDialog',0)[0];
  assert.match(panel.html,/Mở rộng vườn: thêm 1 luống \(có một bộ trong ba lô\)/);
  assert.doesNotMatch(panel.html,/Expand garden|one in your bag/);
  assert.equal(JSON.stringify(app.state),saved,'rendering the kit offer must not spend energy, consume a kit or change growing time');
});
