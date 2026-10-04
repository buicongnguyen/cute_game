// Vietnamese completeness: render the real panels, prompts and messages in vi and fail on
// leftover English. Main-menu renderers run as in main-locale.test.mjs (TS transpile + vm);
// module renderers (friends, helpers, pen, tester, dress, look shop, house, delivery,
// difficulty) are imported directly. Item names and other data are covered by catalog tests.
import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
// look-shop.ts and others import their stylesheet; Node only needs the code.
registerHooks({load(url,context,next){return url.endsWith('.css')?{format:'module',source:'',shortCircuit:true}:next(url,context);}});
const M=await import('../src/model.ts');
const P=await import('../src/progression.ts');
const {t,localizeHtml,setLanguage,getLanguage}=await import('../src/i18n.ts');
const {canTryOn}=await import('../src/try-on.ts');
const {ENEMY_TYPES}=await import('../src/enemy-types.ts');
const {produceLots,upgradeCards}=await import('../src/item-views.ts');
const {dishesHtml,penHtml,penSignature,sitePenHtml,collectText}=await import('../src/farm-ui.ts');
const {QUALITY}=await import('../src/graphics.ts');
const {planRoutes}=await import('../src/space.ts');
const {helperRow,helperPanel}=await import('../src/helper-ui.ts');
const {farmHelperPanel,autoFeedNote}=await import('../src/farm-helper-ui.ts');
const {HELP_TOPICS}=await import('../src/help-topics.ts');
const {FRIENDS,FRIEND_IDS}=await import('../src/friends.ts');
const {friendPanel,lockedHint,RESCUE_LINES}=await import('../src/friend-ui.ts');
const Tester=await import('../src/tester.ts');
const IG=await import('../src/item-groups.ts');
const {dressHtml,DRESS_SLOTS}=await import('../src/house-ui.ts');
const {lookShopHtml}=await import('../src/look-shop.ts');
const {friendLooksHtml,friendTabsHtml}=await import('../src/friend-looks-ui.ts');
const {ACTIVITIES}=await import('../src/house-activities.ts');
const {buffText}=await import('../src/house-life.ts');
const {storedLine}=await import('../src/delivery.ts');

afterEach(()=>setLanguage('en'));

// Common English interface words. Vietnamese copy never needs them; a hit means a string
// skipped t(), has no vi entry, or was glued together around a translated piece.
const ENGLISH=new Set(('the and your you yours with from for this that these here there into about while after before '
  +'buy sell sold equip equipped unequip wear wearing close level levels energy ready seconds minutes hours give take back '
  +'open tap click press hold choose pick place placed use used make made need needs needed more left free new owned '
  +'full empty locked unlock unlocks unlocked cost costs get got has have was were will cannot again please try '
  +'garden crops seeds items fish animal animals pen market kitchen shop storage chest bag backpack '
  +'effect power speed shower healed feet parts explosion livestock products meat dogs fuel steer mouse boosts boost '
  +'ground path walk arrow keys nearby objects interactive chapter fed saved unavailable session account another active '
  +'reward health pending glowing thing outside inside home friends friend helper hire pause paused feed').split(/\s+/));
const decode=text=>text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ');
/** Visible text of markup: text nodes plus title/aria-label/placeholder/alt, skipping data-i18n-skip and <kbd>. */
function visible(html){
  const out=[];
  for(const [,,value] of html.matchAll(/\s(title|aria-label|placeholder|alt)="([^"]*)"/g))out.push(decode(value));
  const stripped=html.replace(/<(kbd|code)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<([a-z]+)\b[^>]*data-i18n-skip[^>]*>[\s\S]*?<\/\1>/gi,' ');
  for(const piece of stripped.split(/<[^>]*>/))if(piece.trim())out.push(decode(piece.trim()));
  return out;
}
function leftovers(where,html,found){
  for(const text of visible(String(html)).map(text=>text.replace(/Zoo\s*Garden/g,'')))for(const word of text.match(/[A-Za-z]+/g)??[])
    if(ENGLISH.has(word.toLowerCase()))found.push(`${where}: "${word}" in ${JSON.stringify(text.slice(0,140))}`);
}

// ---- main.ts panels, rendered by the production functions --------------------------------
const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const renderers=['languageSelector','profilePicker','tryOnButton','effectText','growText','expandButton','plotDialog','inventory','rewardChips','materialChips','quests','shop','market','storage','upgrades','cooking','crafting','forgeMenu','decorations','planets','map','settings','testerMore','testerOnline','testerShop','help','penDialog','helperDialog','farmHelperDialog','friendDialog'];
// Pull in the pure helpers the renderers call (function declarations only; they are hoisted
// and run nothing until called), so a new helper in main.ts does not break this test.
const declared=new Map(ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name).map(node=>[node.name.text,node.getText(ast)]));
const wanted=new Set(renderers.filter(name=>declared.has(name)));
for(const name of wanted)for(const [, other] of declared.get(name).matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g))if(declared.has(other)&&!/^(openDialog|toast|perform|save|tone|updateHud|closeDialog|start|art|decorIcon|harvestNearby|formatSize|joystickEnabled)$/.test(other))wanted.add(other);
const functions=[...wanted].map(name=>declared.get(name)).join('\n');
// Imports main.ts gets from small UI modules (e.g. house-stores.ts) are given to the renderers too.
const extraModules={};
for(const file of ['house-stores.ts','try-on.ts'])try{Object.assign(extraModules,await import('../src/'+file));}catch{/* Not every branch has it. */}
const declarations=ast.statements.filter(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>['BUFF_WORDS','JOURNAL_TABS','SHOP_TABS'].includes(item.name.getText(ast)))).map(node=>node.getText(ast)).join('\n');
const shell=ast.statements.find(node=>ts.isExpressionStatement(node)&&node.getText(ast).startsWith('app.innerHTML =')).getText(ast).replaceAll('import.meta.env.VITE_STATIC_HOST',"'true'").replaceAll('import.meta.env.VITE_ONLINE_URL',"''");
const compiled=ts.transpileModule(declarations+'\n'+functions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function advancedState(){
  const state=M.newGame('Clover');
  state.level=45;state.energy=100000;state.discovered=Object.keys(M.PLANETS);state.visited=[...state.discovered];state.farm.built=true;
  for(const id of Object.keys(M.ITEMS))state.bag[id]=7;
  for(const slot of ['weapon','hat','outfit','boots','pet']){const id=Object.keys(M.ITEMS).find(id=>M.ITEMS[id].slot===slot);if(id)state.gear[slot]=id;}
  M.buyAnimal(state,'chicken');M.buyAnimal(state,'cow');M.buyAnimal(state,'duck');
  state.settings.tester=true;
  P.refreshProgress(state);
  return state;
}
function mainPanels(state){
  let panels=[];
  const art=(id,icon)=>`<span data-art="${id}">${icon}</span>`,mini=id=>`<span data-item="${id}">${M.ITEMS[id]?.icon??'✨'}</span>`;
  const context={document:{fullscreenElement:null},PROFILE_SLOTS:3,activeSlot:()=>0,slotKey:i=>'k'+i,localStorage:{getItem:()=>null},...extraModules,M,IG,planRoutes,...P,STORY_STEPS:P.STORY_STEPS,t,helperRow,helperPanel,farmHelperPanel,FRIENDS,friendPanel,Tester,ICON_BASE:'/assets/icons/',localizeHtml,getLanguage,esc,art,mini,ENEMY_TYPES,produceLots,upgradeCards,dishesHtml,penHtml,penSignature,QUALITY,ZOOM:{},state,saved:state,app:{innerHTML:''},tryingOn:null,canTryOn,visiting:null,activePlot:0,selectedItem:'manure',shopTab:'Weapons',journalTab:'story',craftStation:'craft',craftTab:'All',penShown:'',graphics:{setting:'auto',level:'high',ratio:2,fps:60},world:{zoom:1,planet:'home',state},saveFailed:true,bagMode:'bag',persistence:null,actionHandler:null,testerOpen:true,
    HELP_TOPICS,joystickEnabled:()=>state.settings.movePad??false,
    openDialog:(type,title,html,kicker,icon)=>{panels.push({type,title:t(title),html:localizeHtml(html),kicker:t(kicker||''),icon});},
    $:()=>({insertAdjacentHTML:(_where,html)=>{panels.at(-1).html+=localizeHtml(html);}}),toast:()=>{},formatSize:cm=>`${cm} cm`,harvestNearby:()=>{},
    farmUi:{art,esc,mini,chips:()=>'',effect:item=>t(item.desc)},
  };
  const ctx=vm.createContext(context);vm.runInContext(compiled,ctx);
  const render=(name,...args)=>{panels=[];ctx[name](...args);return panels;};
  const all=[];
  ctx.bagMode='wardrobe';all.push(...render('inventory'));ctx.bagMode='bag';
  for(const name of ['inventory','market','storage','upgrades','cooking','decorations','planets','map','settings','help','penDialog','testerShop','helperDialog','farmHelperDialog','forgeMenu'])all.push(...render(name));
  for(const tab of ['Weapons','Clothing','Pets','Disguises','Supplies','Decor']){ctx.shopTab=tab;all.push(...render('shop'));}
  for(const kind of ['story','daily','weekly','achievements','pass','bounties','collection','challenges']){ctx.journalTab=kind;all.push(...render('quests'));}
  all.push(...render('plotDialog',0));
  for(const station of ['craft','forge']){ctx.craftStation=station;all.push(...render('crafting'));}
  for(const id of FRIEND_IDS)all.push(...render('friendDialog',id));
  vm.runInContext(shell,ctx);all.push({type:'welcome',title:'',kicker:'',html:localizeHtml(ctx.app.innerHTML)});
  return all;
}

test('every main panel renders in Vietnamese without leftover English words',()=>{
  setLanguage('vi');const found=[];
  const panels=mainPanels(advancedState());
  assert.ok(panels.length>=35,`expected the full set of panels, got ${panels.length}`);
  for(const panel of panels){leftovers(panel.type+' title',panel.title,found);leftovers(panel.type+' kicker',panel.kicker,found);leftovers(panel.type,panel.html,found);}
  // A beginner sees locked rows and the empty-state copy.
  const fresh=M.newGame('Pip');P.refreshProgress(fresh);
  for(const panel of mainPanels(fresh))leftovers('beginner '+panel.type,panel.title+' '+panel.html,found);
  assert.deepEqual([...new Set(found)],[]);
});

test('friends, helpers, pen, tester, dress panel, look shop and difficulty texts are Vietnamese',()=>{
  setLanguage('vi');const found=[];const state=advancedState();
  const ui={art:(id,icon)=>icon,esc,mini:()=>'🌱',chips:()=>'',effect:item=>t(item.desc)};
  for(const id of FRIEND_IDS){
    leftovers('friendPanel '+id,localizeHtml(friendPanel(state,id)),found);leftovers('lockedHint '+id,lockedHint(id),found);
    for(const line of RESCUE_LINES[id])leftovers('rescue '+id,t(line),found);
    leftovers('dress '+id,localizeHtml(dressHtml(state,id)),found);leftovers('dress read-only '+id,localizeHtml(dressHtml(state,id,{readOnly:true})),found);
  }
  for(const [, , label] of DRESS_SLOTS)leftovers('dress slot',t(label),found);
  // A friend's Looks tab (friend-looks-ui.ts): the tabs, a draft to buy, a free draft, and a visitor's view.
  const housed={...state,friends:FRIEND_IDS.map((id,i)=>({id,role:FRIENDS[id].role,rescuedAt:1,gear:{},home:true,grown:i%3,...(i?{look:'girl-chibi-none-bare'}:{})}))};
  leftovers('friendTabs',localizeHtml(friendTabsHtml('looks')),found);
  for(const id of FRIEND_IDS){leftovers('friendLooks '+id,localizeHtml(friendLooksHtml(housed,id,'slim-grown-bunny-owl')),found);leftovers('friendLooks free '+id,localizeHtml(friendLooksHtml(housed,id,'girl-chibi-none-bare')),found);leftovers('friendLooks visitor '+id,localizeHtml(friendLooksHtml(housed,id,undefined,{readOnly:true})),found);}
  leftovers('helperRow',localizeHtml(helperRow(state,false)),found);
  leftovers('helperPanel',localizeHtml(helperPanel(state,{esc,mini:()=>'',picture:''})),found);
  leftovers('farmHelperPanel',localizeHtml(farmHelperPanel(state,'')),found);
  leftovers('autoFeedNote',autoFeedNote(state,true)+' '+autoFeedNote(state,false),found);
  leftovers('penHtml',localizeHtml(penHtml(state,ui)),found);
  const site=M.newGame('Pip');site.level=10;leftovers('sitePenHtml',localizeHtml(sitePenHtml(site)),found);
  leftovers('collectText',t(collectText([{item:'egg'},{item:'egg'},{item:'milk'},{item:'duck_egg'},{item:'duck_egg'},{item:'truffle'},{item:'truffle'}])),found);
  leftovers('testerShop',localizeHtml(Tester.testerShopHtml(state)),found);
  leftovers('lookShop',localizeHtml(lookShopHtml(state,'boy-chibi-none-bare')),found);leftovers('lookShop draft',localizeHtml(lookShopHtml(state,'slim-grown-cat-owl')),found);leftovers('lookShop owned',localizeHtml(lookShopHtml({...state,looks:{owned:['tall'],style:'boy-chibi-none'}},'sturdy-tiny-none-koala')),found);
  for(const level of M.DIFFICULTIES)leftovers('difficulty '+level,t(M.DIFFICULTY_LABEL[level])+' '+t(M.DIFFICULTY_NOTE[level]),found);
  assert.deepEqual([...new Set(found)],[]);
});

test('house prompts, buffs, delivery card and surprise-box messages are Vietnamese',()=>{
  setLanguage('vi');const found=[];
  for(const a of ACTIVITIES){
    leftovers('house prompt '+a.id,[t(a.verb),t(a.name),a.note?t(a.note,{n:3}):'',buffText(a.buff)].join(' · '),found);
    leftovers('house cooldown '+a.id,t('{name} is ready again in {time}.',{name:t(a.name),time:'1:30'}),found);
  }
  const line=storedLine({egg:3,carrot:2,milk:1,apple:4,manure:1},id=>t(M.ITEMS[id]?.name??id));
  leftovers('delivery card',`${t('While you were out, your helpers stored:')} ${line.text} ${t('and {count} more',{count:line.more})} ${t('Tap to open the chest')}`,found);
  // Every surprise gift on the toy planet, each outcome forced by its roll.
  const kinds=new Set();
  for(let roll=.01;roll<1;roll+=.02){
    const s=M.newGame('Pip');s.planet='toy';const outcome=M.claimGift(s,0,Date.now(),()=>roll);
    if(outcome&&!kinds.has(outcome.kind)){kinds.add(outcome.kind);leftovers('gift '+outcome.kind,t(outcome.label),found);}
  }
  assert.ok(kinds.size>=6,`surprise outcomes covered: ${[...kinds]}`);
  // Timed effects in the HUD: the hover text names the effect.
  const s=M.newGame('Pip');M.addBuff(s,{regen:3,time:90},'house:sofa');
  for(const b of M.activeBuffs(s))leftovers('buff '+b.id,localizeHtml(`<span title="${esc(b.description)}">${b.icon} ${esc(b.name)}</span>`),found);
  assert.deepEqual([...new Set(found)],[]);
});

// ---- messages built in code: every literal handed to toast/floating/space hints ------------
test('toasts, floating texts and space hints written in code translate fully',async()=>{
  setLanguage('vi');const found=[];
  const dir=new URL('../src/',import.meta.url);
  const files=(await readdir(dir)).filter(name=>name.endsWith('.ts')&&!name.endsWith('.d.ts'));
  const sinks=/^(toast|floating|spaceHint|spaceFloat|announce|rejectActions|d\.toast|deps\.toast|host\.toast)$/;
  for(const name of files){
    const code=await readFile(new URL(name,dir),'utf8');const file=ts.createSourceFile(name,code,ts.ScriptTarget.Latest,true);
    const visit=node=>{
      if(ts.isCallExpression(node)&&sinks.test(node.expression.getText(file))&&node.arguments.length){
        // Each literal branch of the message, with numbers standing in for interpolations.
        const branches=[];
        const collect=arg=>{
          if(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))branches.push(arg.text);
          else if(ts.isTemplateExpression(arg))branches.push(arg.head.text+arg.templateSpans.map(span=>'3'+span.literal.text).join(''));
          else if(ts.isConditionalExpression(arg)){collect(arg.whenTrue);collect(arg.whenFalse);}
          else if(ts.isParenthesizedExpression(arg))collect(arg.expression);
        };
        collect(node.arguments[0]);
        for(const text of branches)if(/[A-Za-z]{3}/.test(text)){
          const line=file.getLineAndCharacterOfPosition(node.getStart(file)).line+1;
          leftovers(`${name}:${line}`,/<[a-z]/i.test(text)?localizeHtml(text):t(text),found);
        }
      }
      ts.forEachChild(node,visit);
    };
    visit(file);
  }
  assert.deepEqual([...new Set(found)],[]);
});

test('the 3D view label and keyboard hint read in Vietnamese',async()=>{
  setLanguage('vi');const found=[];
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const [, value] of html.matchAll(/aria-label="([^"]*)"/g))leftovers('index.html aria-label',t(value),found);
  assert.deepEqual(found,[]);
});
