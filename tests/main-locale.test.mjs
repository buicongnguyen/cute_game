import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import {t,localizeHtml,setLanguage} from '../src/i18n.ts';
import {effectiveKeys} from '../src/controls-keys.ts';
import {HELP_TOPICS} from '../src/help-topics.ts';
import {mainHarness} from './support/main-harness.mjs';

afterEach(()=>setLanguage('en'));

// Run the real panel renderers without a GPU; game data, catalogs and localization
// are their production modules. We intercept only the dialog/DOM display boundary.
// The harness cuts the renderers out of main.ts and imports whatever main.ts imports for them.
const renderers=['languageSelector','disguiseTableHtml','profilePicker','keyboardSettings','tryOnButton','effectText','growText','expandButton','bedUpgradeRow','plotDialog','inventory','rewardChips','materialChips','quests','shop','market','storage','upgrades','cooking','crafting','decorations','planets','map','settings','testerMore','testerOnline','help','penDialog'];
const main=await mainHarness({functions:renderers,optional:renderers,variables:['BUFF_WORDS','JOURNAL_TABS','SHOP_TABS'],later:{shell:'app.innerHTML ='},env:{VITE_STATIC_HOST:'true',VITE_ONLINE_URL:''}});
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
  // Fakes only: the player's state and main.ts's own state, the dialog/DOM display boundary and a few stubs.
  const context={document:{fullscreenElement:null},HELP_TOPICS,activeSlot:()=>0,slotKey:i=>'k'+i,localStorage:{getItem:()=>null},esc,art,mini,state,saved:state,app:{innerHTML:''},tryingOn:null,bagMode:'bag',visiting:null,activePlot:0,selectedItem:advanced?'manure':null,shopTab:'Weapons',journalTab:'story',craftStation:'craft',craftTab:'All',penShown:'',graphics:{setting:'auto',level:'high',ratio:2,fps:60,resolution:'auto',mobile:false},world:{zoom:1,planet:'home'},saveFailed:false,persistence:null,actionHandler:null,testerOpen:false,Tester:{isTester:()=>false,testerKitchenHtml:()=>'',testerMakeButton:()=>'',TESTER_TAG:''},
    joystickEnabled:()=>state.settings.movePad??false,controls:{view:()=>({side:'right',size:'normal',opacity:100,joystick:!!state.settings.movePad,screen:'desktop',custom:false,fallback:false,pc:true,keys:effectiveKeys({layout:state.settings.keyboardLayout,air:true,space:'jump'},{}),customKeys:false})},restoreBackupRow:()=>'',inbox:{settingHtml:()=>'',popups:false,announce:()=>false},foldLists:()=>0,neighboursOn:()=>true,
    openDialog:(type,title,html,kicker,icon)=>{panels.push({type,title:t(title),html:localizeHtml(html),kicker:t(kicker||''),icon});},
    $:()=>({insertAdjacentHTML:(_where,html)=>{panels.at(-1).html+=localizeHtml(html);}}),toast:()=>{},formatSize:cm=>`${cm} cm`,harvestNearby:()=>{},
    farmUi:{art,esc,mini,chips:()=>'',effect:item=>t(item.desc)},
  };
  context.spaceKey='jump';context.airCombat=true;context.airOn=()=>true;context.actionHandler??=null;
  const ctx=main.context(context);
  return {state,ctx,render(name,...args){panels=[];ctx[name](...args);return panels;},shell(){main.run(ctx,'shell');return localizeHtml(ctx.app.innerHTML);}};
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

test('all main menus switch Vietnamese and back with identical game actions and saved state',(ctx)=>{
  // Keep bounty rotation stable while comparing the three language renders.
  ctx.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 17, 6, 0) });
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
  assert.match(vietnamese,/Trồng vườn · Câu cá/);assert.match(vietnamese,/Hồ sơ/);assert.match(vietnamese,/Tiếp tục phiêu lưu/);
  assert.match(vietnamese,/<option value="en" data-i18n-skip[^>]*>English<\/option>/);
  assert.match(vietnamese,/<option value="vi" data-i18n-skip[^>]*>Tiếng Việt<\/option>/);
  assert.deepEqual(actions(vietnamese),actions(english));assert.equal(app.state.name,'Carrot <Send> {name}');
});

test('a growing bed explains the original-duration fertilizer rule in both languages without using any item',()=>{
  const app=fixture();assert.equal(M.plant(app.state,0,'carrot'),true);const saved=JSON.stringify(app.state);
  setLanguage('vi');const panel=app.render('plotDialog',0)[0];
  assert.equal(panel.type,'plot');assert.match(panel.html,/một nửa thời gian sinh trưởng ban đầu/);
  assert.match(panel.html,/data-action="fertilize-manure"/);assert.match(panel.html,/data-action="fertilize"/);
  assert.match(panel.html,/Còn khoảng \d+ (giây|phút) nữa là chín/);
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
