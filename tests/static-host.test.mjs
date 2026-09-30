import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners=new Map();this.attributes=new Map();this.dataset={};this.classes=new Set();this.classList={add:name=>this.classes.add(name)};this.open=false;}
  append(...children){this.children.push(...children);}
  setAttribute(name,value){this.attributes.set(name,value);}
  addEventListener(name,handler){this.listeners.set(name,handler);}
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

async function online({staticHost='true',base='/cute_game/',slotPresent=true}={}){
  const slot=new Element(),body=new Element(),document=new Element(),window=new Element(),requests=[];
  document.body=body;document.createElement=tag=>new Element(tag);document.querySelector=selector=>selector==='#social-slot'&&slotPresent?slot:null;
  let registrations=0;
  const bridge=staticHost==='true'?new Proxy({},{get(){throw new Error('Static hosting must not replace the local game or save hooks');}}):{onFrame(){registrations++;},onAction(){registrations++;}};
  const exports={};
  vm.runInNewContext(await compile('online.ts',{VITE_STATIC_HOST:staticHost,BASE_URL:base}),{
    exports,document,window,
    require:name=>{assert.equal(name,'./model.ts');return {};},
    fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({account:null})};},
    WebSocket:class{constructor(){throw new Error('Unexpected socket connection');}},
    localStorage:new Proxy({},{get(){throw new Error('Static mode must not modify browser saves');}}),
  });
  exports.initOnline(bridge);await Promise.resolve();
  return {slot,body,document,window,requests,get registrations(){return registrations;}};
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
  assert.equal(paths.length,13);assert.ok(paths.every(url=>url.startsWith('/cute_game/assets/models/')&&url.endsWith('.glb')));
});
