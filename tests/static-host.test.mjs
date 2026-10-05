import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {VI_ONLINE} from '../src/locales/vi-online.ts';
import {gameplayKey} from '../src/gameplay-controls.ts';

class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners=new Map();this.attributes=new Map();this.dataset={};this.classes=new Set();this.classList={add:name=>this.classes.add(name)};this.open=false;this.style={};this.value='';this.selectionStart=null;this.selectionEnd=null;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(name,value){this.attributes.set(name,value);}
  addEventListener(name,handler){this.listeners.set(name,handler);}
  querySelectorAll(selector){return elements(this).slice(1).filter(node=>selector==='input'?node.tagName==='input':selector.startsWith('.')?node.className===selector.slice(1):false);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  focus(){this.ownerDocument.activeElement=this;}
  setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  click(){this.listeners.get('click')?.({target:this});}
}

async function compile(file,environment){
  const source=(await readFile(new URL(`../src/${file}`,import.meta.url),'utf8'))
    .replace(/^import '\.\/[^']+\.css';$/gm,'')
    .replaceAll('import.meta.env',JSON.stringify(environment));
  return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
}

function elements(root){return [root,...root.children.flatMap(elements)];}

async function online({staticHost='true',base='/cute_game/',slotPresent=true,language='en',session={account:null},loginError}={}){
  const slot=new Element(),body=new Element(),document=new Element(),window=new Element(),requests=[];
  document.body=body;document.createElement=tag=>Object.assign(new Element(tag),{ownerDocument:document});document.createTextNode=value=>Object.assign(new Element('text'),{textContent:value});document.querySelector=selector=>selector==='#social-slot'&&slotPresent?slot:null;
  window.setTimeout=()=>1;
  const languageListeners=[],sockets=[];
  const i18n={t:(source,params={})=>(language==='vi'?VI_ONLINE[source]||source:source).replace(/\{(\w+)\}/g,(match,key)=>key in params?String(params[key]):match),onLanguageChange:handler=>{languageListeners.push(handler);return()=>{};}};
  class Socket extends Element {static OPEN=1;readyState=1;sent=[];constructor(){super();sockets.push(this);}send(value){this.sent.push(JSON.parse(value));}message(value){this.listeners.get('message')?.({data:JSON.stringify(value)});}}
  let registrations=0;
  let state={name:'Clover',color:'#789abc',planet:'home'};
  const bridge=staticHost==='true'?new Proxy({},{get(){throw new Error('Static hosting must not replace the local game or save hooks');}}):{onFrame(){registrations++;},onAction(){registrations++;},getState:()=>state,getPresence:()=>({planet:'home',x:0,z:0}),getWorld:()=>new Proxy({},{get:()=>()=>{}}),setPersistence(){},setActionHandler(){},applyAuthoritativeState(){},clearNetworkDrops(){},spawnNetworkDrop(){},applyState:value=>{state=value;},setNetworkHooks(){},showNotice(){}};
  const exports={};
  vm.runInNewContext(await compile('online.ts',{VITE_STATIC_HOST:staticHost,BASE_URL:base}),{
    exports,document,window,
    require:name=>{if(name==='./i18n.ts')return i18n;if(name==='./gameplay-controls.ts')return {gameplayKey};assert.equal(name,'./model.ts');return {};},
    fetch:async(url,options)=>{requests.push({url,options});return loginError&&url.endsWith('auth/login')?{ok:false,status:401,json:async()=>({error:loginError})}:{ok:true,json:async()=>session};},
    WebSocket:staticHost==='true'?class{constructor(){throw new Error('Unexpected socket connection');}}:Socket,
    localStorage:staticHost==='true'?new Proxy({},{get(){throw new Error('Static mode must not modify browser saves');}}):{getItem:()=>null,setItem(){}},
    structuredClone,URL,location:{href:'http://localhost:8787/',protocol:'http:'},crypto:{randomUUID:()=> 'language-test-mutation'},
  });
  exports.initOnline(bridge);await new Promise(resolve=>setImmediate(resolve));
  return {slot,body,document,window,requests,sockets,get registrations(){return registrations;},setLanguage:value=>{language=value;for(const handler of languageListeners)handler();}};
}

test('Pages edition explains solo play without accounts, server calls, sockets, or save changes',async()=>{
  const app=await online();
  assert.deepEqual(app.requests,[]);assert.equal(app.registrations,0);assert.equal(app.window.listeners.size,0);assert.equal(app.document.listeners.size,0);
  const toggle=app.slot.children[0],dialog=app.body.children.find(node=>node.tagName==='dialog');
  assert.equal(toggle.attributes.get('aria-label'),'About this solo adventure');assert.equal(toggle.dataset.staticHost,'true');
  assert.equal(dialog.open,false);toggle.click();assert.equal(dialog.open,true);
  const content=elements(dialog);assert.ok(content.some(node=>node.textContent?.includes('progress saves in this browser')));
  assert.ok(content.some(node=>node.textContent?.includes('GitHub Pages edition plays solo')));
  assert.equal(content.filter(node=>node.tagName==='input'||node.tagName==='form').length,0);
  content.find(node=>node.textContent==='Keep playing').click();assert.equal(dialog.open,false);
  toggle.click();content.find(node=>node.attributes.get('aria-label')==='Close solo information').click();assert.equal(dialog.open,false);
});

test('solo information remains usable when the HUD slot is absent',async()=>{
  const app=await online({slotPresent:false});const toggle=app.body.children.find(node=>node.id==='online-button');
  assert.ok(toggle.textContent.includes('Solo adventure'));toggle.click();assert.equal(app.body.children.find(node=>node.tagName==='dialog').open,true);
});

test('an open Pages solo dialog switches Vietnamese and English without server or save access',async()=>{
  const app=await online(),toggle=app.slot.children[0],dialog=app.body.children.find(node=>node.tagName==='dialog');
  toggle.click();app.setLanguage('vi');
  assert.equal(dialog.open,true);assert.equal(dialog.attributes.get('aria-label'),'Phiêu lưu một mình');
  assert.equal(toggle.attributes.get('aria-label'),'Thông tin về chế độ chơi một mình');
  assert.ok(elements(dialog).some(node=>node.textContent==='Tiếp tục chơi'));
  assert.ok(elements(dialog).some(node=>node.textContent?.includes('được lưu trong trình duyệt này')));
  app.setLanguage('en');assert.equal(dialog.attributes.get('aria-label'),'Solo adventure');
  assert.deepEqual(app.requests,[]);assert.equal(app.registrations,0);
});

test('changing online language preserves typed credentials, focus and server error meaning',async()=>{
  const app=await online({staticHost:'',base:'/',loginError:'The username or password is incorrect.'});
  app.slot.children[0].click();let nodes=elements(app.body);
  const username=nodes.find(node=>node.name==='username'),password=nodes.find(node=>node.name==='password');
  username.value='Online';password.value='Send-{name}-123';password.focus();password.setSelectionRange(3,7);
  app.setLanguage('vi');nodes=elements(app.body);
  assert.ok(nodes.some(node=>node.textContent==='Tên đăng nhập'));assert.ok(nodes.some(node=>node.textContent==='Mật khẩu'));
  assert.equal(nodes.find(node=>node.name==='username').value,'Online');assert.equal(nodes.find(node=>node.name==='password').value,'Send-{name}-123');
  assert.equal(app.document.activeElement.name,'password');assert.equal(app.document.activeElement.selectionStart,3);
  await nodes.find(node=>node.tagName==='form').listeners.get('submit')({preventDefault(){}});
  assert.deepEqual(JSON.parse(app.requests.at(-1).options.body),{username:'Online',password:'Send-{name}-123',color:'#789abc'});
  assert.ok(elements(app.body).some(node=>node.textContent==='Tên đăng nhập hoặc mật khẩu không đúng.'));
  app.setLanguage('en');assert.ok(elements(app.body).some(node=>node.textContent==='The username or password is incorrect.'));
});

test('Vietnamese social labels keep player names, party codes and chat text verbatim',async()=>{
  const account={id:'local',name:'Online',username:'fern_1',color:'#789abc',level:2,gear:{}};
  const app=await online({staticHost:'',base:'/',session:{authorityVersion:1,account,profile:{...account,planet:'home'},revision:0}});
  await Promise.resolve();await Promise.resolve();app.slot.children[0].click();
  const socket=app.sockets[0];assert.ok(socket);
  socket.message({type:'joined',host:'local',party:'AB12CD',planet:'home',players:[account]});
  socket.message({type:'chat',name:'Send',message:'Sign in {name}'});
  const draft=elements(app.body).find(node=>node.name==='world-chat');draft.value='Online {code}';
  app.setLanguage('vi');const nodes=elements(app.body);
  assert.ok(nodes.some(node=>node.textContent==='Nhóm riêng · AB12CD'));
  assert.ok(nodes.some(node=>node.textContent==='Online · Cấp 2'));
  assert.ok(nodes.some(node=>node.textContent==='Send: '));assert.ok(nodes.some(node=>node.textContent==='Sign in {name}'));
  assert.equal(nodes.find(node=>node.name==='world-chat').value,'Online {code}');
  assert.equal(app.slot.children[0].title,'Nhóm AB12CD');
  assert.equal(app.requests.length,2,'relabeling must not queue another profile save or network request');
});

test('switching languages during sign-in cannot submit the same credentials twice',async()=>{
  const app=await online({staticHost:'',base:'/',loginError:'The username or password is incorrect.'});
  app.slot.children[0].click();let nodes=elements(app.body);
  nodes.find(node=>node.name==='username').value='fern';nodes.find(node=>node.name==='password').value='test-password';
  const pending=nodes.find(node=>node.tagName==='form').listeners.get('submit')({preventDefault(){}});
  app.setLanguage('vi');nodes=elements(app.body);
  assert.equal(nodes.find(node=>node.type==='submit').disabled,true);
  await nodes.find(node=>node.tagName==='form').listeners.get('submit')({preventDefault(){}});await pending;
  assert.equal(app.requests.filter(request=>request.url.endsWith('auth/login')).length,1);
  assert.equal(nodes.find(node=>node.type==='submit').disabled,false);
});

test('default server edition retains online hooks and the original root session endpoint',async()=>{
  const server=await online({staticHost:'',base:'/'});
  assert.equal(server.registrations,2);assert.equal(server.requests.length,1);assert.equal(server.requests[0].url,'/api/auth/session');
  assert.equal(server.slot.children[0].attributes.get('aria-label'),'Play together');
  assert.equal(server.window.listeners.has('pagehide'),true);assert.equal(server.document.listeners.has('visibilitychange'),true);
});

test('all refined model URLs honor a project deployment prefix',async()=>{
  const exports={};
  vm.runInNewContext(await compile('assets.ts',{BASE_URL:'/cute_game/'}),{exports,require:name=>name==='three'?{}:{GLTFLoader:class{}}});
  const paths=[...Object.values(exports.REFINED_ASSET_FILES),...Object.values(exports.KIT_FILES)];
  assert.equal(paths.length,28);assert.equal(exports.KIT_FILES.forestBirds,'/cute_game/assets/models/forest-birds.glb');assert.ok(paths.every(url=>url.startsWith('/cute_game/assets/models/')&&url.endsWith('.glb')));
});
