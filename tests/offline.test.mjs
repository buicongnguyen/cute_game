import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {VI_ONLINE} from '../src/locales/vi-online.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin='https://garden.example';

async function buildFixture(t, files, {base='/',error}={}) {
  const directory=await mkdtemp(path.join(tmpdir(),'cute-game-offline-test-'));
  t.after(async()=>{
    // Only remove this test's newly-created, resolved temporary directory.
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('cute-game-offline-test-'));
    await rm(directory,{recursive:true,force:true});
  });
  for(const [name,value] of Object.entries(files)) {
    const target=path.join(directory,'dist',name);
    await mkdir(path.dirname(target),{recursive:true});
    await writeFile(target,value);
  }
  const result=spawnSync(process.execPath,[path.join(root,'server/build-offline.mjs')],{cwd:directory,encoding:'utf8',env:{...process.env,VITE_BASE_PATH:base}});
  if(error) {assert.notEqual(result.status,0);assert.match(result.stderr,error);return;}
  assert.equal(result.status,0,result.stderr);
  return readFile(path.join(directory,'dist/sw.js'),'utf8');
}

function cacheStorage() {
  const entries=new Map(),requests=[];
  const key=request=>new URL(typeof request==='string'?request:request.url,origin).href;
  return {
    entries,requests,
    async open(name) {
      if(!entries.has(name)) entries.set(name,new Map());
      const data=entries.get(name);
      return {
        async addAll(urls) { for(const url of urls)await this.add(url); },
        async add(request) { const url=typeof request==='string'?request:new URL(request.url).pathname+new URL(request.url).search; requests.push(url); data.set(key(request),new Response(`cached:${url}`)); },
        async match(request,{ignoreSearch=false}={}) {const want=key(request),bare=u=>u.split('?')[0];for(const [k,v]of data)if(k===want||ignoreSearch&&bare(k)===bare(want))return v.clone();},
        async put(request,response) {data.set(key(request),response.clone());},
      };
    },
    async keys() {return [...entries.keys()];},
    async delete(name) {return entries.delete(name);},
    async match(request) {for(const data of entries.values()){const response=data.get(key(request));if(response)return response.clone();}},
  };
}

function worker(source, caches=cacheStorage()) {
  const listeners=new Map(),network=[];
  let responder=async request=>new Response(`network:${typeof request==='string'?request:request.url}`),claimed=0,skipped=0;const messages=[];
  vm.runInNewContext(source,{
    URL,caches,Request:class{constructor(url,init={}){this.url=new URL(url,origin).href;this.cache=init.cache;}},
    fetch:async request=>{network.push(request);return responder(request);},
    self:{location:{origin},skipWaiting:async()=>{skipped++;},clients:{claim:async()=>{claimed++;},matchAll:async()=>[{postMessage:message=>messages.push(message)}]},addEventListener:(name,handler)=>listeners.set(name,handler)},
  });
  return {
    caches,network,messages,get claimed(){return claimed;},get skipped(){return skipped;},setNetwork(fn){responder=fn;},
    async lifecycle(name) {let promise;listeners.get(name)({waitUntil:value=>{promise=value;}});assert.ok(promise);await promise;},
    request(url,{method='GET',mode='cors'}={}) {
      let response;
      listeners.get('fetch')({request:{url:new URL(url,origin).href,method,mode},respondWith:value=>{assert.equal(response,undefined);response=value;}});
      return response;
    },
  };
}

test('generated cache includes complete nested build output, excludes itself, and is repeatable',async t=>{
  const files={'index.html':'<html>Garden</html>','assets/game.js':'game v1','assets/fonts/nunito.woff2':'font','assets/models/cottage.glb':'model','sw.js':'old worker'};
  const source=await buildFixture(t,files),app=worker(source);
  await app.lifecycle('install');
  assert.deepEqual(app.caches.requests.map(url=>url.replace(/\?v=[a-f0-9]{10}$/,'')).sort(),['/assets/fonts/nunito.woff2','/assets/game.js','/assets/models/cottage.glb','/index.html']);
  assert.ok(app.caches.requests.includes('/assets/models/cottage.glb?v='+createHash('sha256').update('model').digest('hex').slice(0,10)),'models install under their content hash');
  assert.equal(source,await buildFixture(t,files));
});

test('API, sockets, writes, cross-origin and unknown resources are never intercepted or cached',async t=>{
  const app=worker(await buildFixture(t,{'index.html':'v1','assets/game.js':'game'}));
  await app.lifecycle('install');const requests=app.caches.requests.length;
  for(const [url,options]of[
    ['/api/me',{}],['/api/save?revision=2',{}],['/api/accounts',{mode:'navigate'}],['/socket',{}],['/socket?token=test',{}],
    ['/assets/game.js',{method:'POST'}],['/api/save',{method:'PUT'}],['https://other.example/assets/game.js',{}],['/unknown.js',{}],
  ])assert.equal(app.request(url,options),undefined,`${options.method||'GET'} ${url}`);
  assert.equal(app.caches.requests.length,requests);assert.equal(app.network.length,0);
});

test('navigation is network-first with an offline shell fallback; cached assets work without network',async t=>{
  const app=worker(await buildFixture(t,{'index.html':'v1','assets/game-AbCd12_x.js':'game'}));
  await app.lifecycle('install');
  assert.equal(await(await app.request('/adventure',{mode:'navigate'})).text(),`network:${origin}/adventure`);
  app.setNetwork(async()=>{throw new Error('offline');});
  assert.equal(await(await app.request('/adventure',{mode:'navigate'})).text(),'cached:/index.html');
  const calls=app.network.length;
  assert.equal(await(await app.request('/assets/game-AbCd12_x.js')).text(),'cached:/assets/game-AbCd12_x.js','hashed build files are cache-first');
  assert.equal(app.network.length,calls);
  const active=await app.caches.open((await app.caches.keys())[0]);
  app.caches.entries.values().next().value.delete(`${origin}/assets/game-AbCd12_x.js`);
  app.setNetwork(async()=>new Response('restored asset'));
  assert.equal(await(await app.request('/assets/game-AbCd12_x.js')).text(),'restored asset');
  assert.equal(await active.match('/missing'),undefined);
});

test('activation removes obsolete game builds, preserves other caches and claims clients',async t=>{
  const storage=cacheStorage(),old=worker(await buildFixture(t,{'index.html':'old','assets/old.js':'old'}),storage);
  await old.lifecycle('install');const oldName=(await storage.keys())[0];
  await(await storage.open('unrelated-app')).put('/other.html',new Response('retained'));
  const next=worker(await buildFixture(t,{'index.html':'new','assets/new.js':'new'}),storage);
  await next.lifecycle('install');assert.equal((await storage.keys()).length,3);
  await next.lifecycle('activate');
  assert.equal(next.claimed,1);assert.equal((await storage.keys()).includes(oldName),false);
  assert.equal((await storage.keys()).length,2);assert.equal(await(await storage.match('/other.html')).text(),'retained');
});

test('offline navigation uses this build shell even when another app cached index.html first',async t=>{
  const storage=cacheStorage();await(await storage.open('other-app')).put('/index.html',new Response('unrelated app'));
  const app=worker(await buildFixture(t,{'index.html':'Garden','assets/game.js':'game'}),storage);
  await app.lifecycle('install');await app.lifecycle('activate');app.setNetwork(async()=>{throw new Error('offline');});
  assert.equal(await(await app.request('/adventure',{mode:'navigate'})).text(),'cached:/index.html');
});

class EventTargetStub {
  listeners=new Map();children=[];hidden=false;attributes=new Map();
  addEventListener(name,handler){const handlers=this.listeners.get(name)||[];handlers.push(handler);this.listeners.set(name,handlers);}
  append(...children){this.children.push(...children);}
  setAttribute(key,value){this.attributes.set(key,value);}
  async dispatch(name,event={}){for(const handler of this.listeners.get(name)||[])await handler(event);}
}

async function platform({production=true,basePath='/',supportFullscreen=true,register=async()=>({}),language='en'}={}) {
  const source=(await readFile(path.join(root,'src/platform.ts'),'utf8')).replace(/import '\.\/platform\.css';/,'').replaceAll('import.meta.env.PROD',String(production)).replaceAll('import.meta.env.BASE_URL',JSON.stringify(basePath));
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const window=new EventTargetStub(),slot=new EventTargetStub(),document={createElement:()=>new EventTargetStub(),querySelector:()=>slot,body:new EventTargetStub(),documentElement:{},fullscreenElement:null};
  let entered=0,exited=0;const registered=[],notices=[];
  if(supportFullscreen) document.documentElement.requestFullscreen=async()=>{entered++;document.fullscreenElement=document.documentElement;};
  document.exitFullscreen=async()=>{exited++;document.fullscreenElement=null;};
  const languageListeners=[],i18n={t:source=>language==='vi'?VI_ONLINE[source]||source:source,onLanguageChange:handler=>{languageListeners.push(handler);return()=>{};}};
  // Registration lives in art-status.ts (update prompt); stand in for it with a plain register call.
  const serviceWorker={register:async url=>{registered.push(url);return register(url);}},artStatus={registerWorker:url=>{void serviceWorker.register(url).catch(()=>{});}};
  const exports={};vm.runInNewContext(js,{exports,window,document,require:name=>{if(name==='./art-status.ts')return artStatus;assert.equal(name,'./i18n.ts');return i18n;},navigator:{serviceWorker}});
  exports.initPlatform(message=>notices.push(message));
  return {window,document,registered,notices,fullscreen:slot.children[0].children[0],install:slot.children[0].children[1],get entered(){return entered;},get exited(){return exited;},setLanguage:value=>{language=value;for(const handler of languageListeners)handler();}};
}

test('platform language changes preserve an available install invitation and localize feedback',async()=>{
  const app=await platform({supportFullscreen:false});let prompted=0;
  await app.window.dispatch('beforeinstallprompt',{preventDefault(){},prompt:async()=>{prompted++;},userChoice:Promise.resolve({outcome:'accepted'})});
  app.setLanguage('vi');assert.equal(app.fullscreen.title,'Toàn màn hình');assert.equal(app.fullscreen.attributes.get('aria-label'),'Bật/tắt toàn màn hình');
  assert.equal(app.install.textContent,'Cài đặt trò chơi');assert.equal(app.install.hidden,false);
  await app.fullscreen.dispatch('click');assert.equal(app.notices.at(-1),'Hãy dùng tùy chọn toàn màn hình của trình duyệt trên thiết bị này.');
  await app.install.dispatch('click');assert.equal(prompted,1);assert.equal(app.install.hidden,true);
  app.setLanguage('en');assert.equal(app.install.textContent,'Install game');assert.equal(app.fullscreen.title,'Fullscreen');
  assert.deepEqual(app.registered,['/sw.js'],'changing language must not register another worker');
});

test('platform registers offline support only in production; registration errors do not stop play',async()=>{
  assert.deepEqual((await platform({production:false})).registered,[]);
  assert.deepEqual((await platform()).registered,['/sw.js']);
  assert.deepEqual((await platform({basePath:'/cute_game/'})).registered,['/cute_game/sw.js']);
  const app=await platform({register:async()=>{throw new Error('unavailable');}});
  await Promise.resolve();assert.deepEqual(app.registered,['/sw.js']);assert.equal(app.fullscreen.type,'button');
});

test('fullscreen enters and exits, and unsupported devices receive usable feedback',async()=>{
  const supported=await platform();await supported.fullscreen.dispatch('click');await supported.fullscreen.dispatch('click');
  assert.equal(supported.entered,1);assert.equal(supported.exited,1);
  const unsupported=await platform({supportFullscreen:false});await unsupported.fullscreen.dispatch('click');assert.equal(unsupported.notices.length,1);
});

test('install prompts are one-use and dismissed prompts do not leave an inert visible button',async()=>{
  const app=await platform();assert.equal(app.install.hidden,true);let prevented=0,prompted=0;
  await app.window.dispatch('beforeinstallprompt',{preventDefault(){prevented++;},prompt:async()=>{prompted++;},userChoice:Promise.resolve({outcome:'dismissed'})});
  assert.equal(app.install.hidden,false);await app.install.dispatch('click');assert.equal(prompted,1);assert.equal(prevented,1);assert.equal(app.install.hidden,true);
  await app.window.dispatch('beforeinstallprompt',{preventDefault(){},prompt:async()=>{prompted++;},userChoice:Promise.resolve({outcome:'accepted'})});
  assert.equal(app.install.hidden,false);await app.install.dispatch('click');assert.equal(prompted,2);assert.equal(app.install.hidden,true);
  await app.window.dispatch('appinstalled');assert.equal(app.install.hidden,true);assert.ok(app.notices.some(message=>message.includes('installed')));
});

test('failed install prompts are handled and do not prevent a later browser invitation',async()=>{
  const app=await platform();
  await app.window.dispatch('beforeinstallprompt',{preventDefault(){},prompt:async()=>{throw new Error('prompt rejected');},userChoice:Promise.resolve({outcome:'dismissed'})});
  await app.install.dispatch('click');assert.equal(app.install.hidden,true);assert.equal(app.notices.length,1);
  await app.window.dispatch('beforeinstallprompt',{preventDefault(){},prompt:async()=>{},userChoice:Promise.resolve({outcome:'accepted'})});
  assert.equal(app.install.hidden,false);await app.install.dispatch('click');assert.equal(app.install.hidden,true);
});


test('project Pages cache uses its base for every asset and offline navigation',async t=>{
  const app=worker(await buildFixture(t,{'index.html':'Garden','assets/game.js':'game','icon-192.png':'icon'},{base:'/cute_game/'}));
  await app.lifecycle('install');
  assert.deepEqual(app.caches.requests.slice().sort(),['/cute_game/assets/game.js','/cute_game/icon-192.png','/cute_game/index.html']);
  app.setNetwork(async()=>{throw new Error('offline');});
  assert.equal(await(await app.request('/cute_game/',{mode:'navigate'})).text(),'cached:/cute_game/index.html');
  assert.equal(await(await app.request('/cute_game/assets/game.js?v=1')).text(),'cached:/cute_game/assets/game.js');
  for(const url of ['/api/me','/socket','/cute_game/api','/cute_game/api/me','/cute_game/socket','/cute_game/socket/path','/cute_game-other/','/index.html']) {
    assert.equal(app.request(url,{mode:'navigate'}),undefined,url);
  }
});

test('activation preserves other project Pages caches on the same origin',async t=>{
  const storage=cacheStorage();
  const rootApp=worker(await buildFixture(t,{'index.html':'root'}),storage);
  const sibling=worker(await buildFixture(t,{'index.html':'sibling'},{base:'/other_game/'}),storage);
  const old=worker(await buildFixture(t,{'index.html':'old'},{base:'/cute_game/'}),storage);
  for(const app of [rootApp,sibling,old])await app.lifecycle('install');
  const initial=await storage.keys(),oldName=initial[2];
  assert.equal(new Set(initial).size,3);
  const next=worker(await buildFixture(t,{'index.html':'new'},{base:'/cute_game/'}),storage);
  await next.lifecycle('install');await next.lifecycle('activate');
  const remaining=await storage.keys();
  assert.equal(remaining.length,3);assert.equal(remaining.includes(oldName),false);
  assert.ok(remaining.includes(initial[0]));assert.ok(remaining.includes(initial[1]));
  assert.equal(await(await storage.match('/other_game/index.html')).text(),'cached:/other_game/index.html');
});

test('cache version changes when a file moves without changing its content',async t=>{
  const before=worker(await buildFixture(t,{'index.html':'shell','assets/old.js':'same bytes'}));
  const after=worker(await buildFixture(t,{'index.html':'shell','assets/new.js':'same bytes'}));
  await before.lifecycle('install');await after.lifecycle('install');
  assert.notEqual((await before.caches.keys())[0],(await after.caches.keys())[0]);
});

test('build accepts repository paths and rejects unsafe deployment base values',async t=>{
  assert.equal(await buildFixture(t,{'index.html':'shell'},{base:'/cute_game'}),await buildFixture(t,{'index.html':'shell'},{base:'/cute_game/'}));
  for(const base of ['https://example.com/game/','game/','//other.example/game/','/foo/../bar/','/./game/','/game?x=1','/game#fragment','/game%2fother/','/foo\\bar/']) {
    await buildFixture(t,{'index.html':'shell'},{base,error:/VITE_BASE_PATH/});
  }
});

test('install manifest resolves its identity, launch URL, scope and icons within any deployment',async()=>{
  const manifest=JSON.parse(await readFile(path.join(root,'public/manifest.webmanifest'),'utf8'));
  for(const base of ['/','/cute_game/']) {
    const manifestUrl=`${origin}${base}manifest.webmanifest`;
    for(const field of ['id','start_url','scope'])assert.equal(new URL(manifest[field],manifestUrl).href,`${origin}${base}`);
    for(const icon of manifest.icons) {
      const url=new URL(icon.src,manifestUrl);
      assert.equal(url.origin,origin);assert.ok(url.pathname.startsWith(base));
      assert.match(url.pathname,/icon-(192|512)\.png$/);
    }
  }
});

test('gear, planet scenery, the farm pen and the creatures are kept the first time they are needed instead of downloading at install',async t=>{
  const app=worker(await buildFixture(t,{'index.html':'shell','assets/models/cottage.glb':'cottage','assets/models/gear-wear.glb':'hats','assets/models/pets.glb':'pets','assets/models/worlds-harsh.glb':'ice','assets/models/farm.glb':'farm','assets/models/creatures.glb':'creatures'},{base:'/cute_game/'}));
  await app.lifecycle('install');
  assert.deepEqual(app.caches.requests.map(url=>url.replace(/\?v=[a-f0-9]{10}$/,'')).sort(),['/cute_game/assets/models/cottage.glb','/cute_game/index.html']);
  assert.equal(await(await app.request('/cute_game/assets/models/gear-wear.glb')).text(),`network:${origin}/cute_game/assets/models/gear-wear.glb`);
  app.setNetwork(async()=>{throw new Error('offline');});
  assert.equal(await(await app.request('/cute_game/assets/models/gear-wear.glb')).text(),`network:${origin}/cute_game/assets/models/gear-wear.glb`,'the first download is kept for offline play');
  await assert.rejects(async()=>app.request('/cute_game/assets/models/pets.glb'),/offline/,'unworn gear needs the network; the game shows simple shapes instead');
  await assert.rejects(async()=>app.request('/cute_game/assets/models/creatures.glb'),/offline/,'creatures never seen online keep their simple shapes offline');
});

const glbHash=bytes=>createHash('sha256').update(bytes).digest('hex').slice(0,10);
test('models are cache-first only under this build\'s content hash; any other copy comes from the network first',async t=>{
  const app=worker(await buildFixture(t,{'index.html':'shell','assets/models/cottage.glb':'cottage v2','assets/models/farm.glb':'farm v2'}));
  await app.lifecycle('install');
  const mine=`/assets/models/cottage.glb?v=${glbHash('cottage v2')}`;
  let calls=app.network.length;
  assert.equal(await(await app.request(mine)).text(),`cached:${mine}`);assert.equal(app.network.length,calls,'matching hash: no network');
  assert.equal(await(await app.request('/assets/models/cottage.glb?v=0123456789')).text(),`network:${origin}/assets/models/cottage.glb?v=0123456789`,'another build asked for its own copy');
  assert.equal(await(await app.request('/assets/models/cottage.glb')).text(),`network:${origin}/assets/models/cottage.glb`,'unversioned: network first');
  // An on-demand model with this build's hash is kept on first use and then served offline.
  const farm=`/assets/models/farm.glb?v=${glbHash('farm v2')}`;
  assert.equal(await(await app.request(farm)).text(),`network:${origin}${farm}`);
  app.setNetwork(async()=>{throw new Error('offline');});calls=app.network.length;
  assert.equal(await(await app.request(farm)).text(),`network:${origin}${farm}`);assert.equal(app.network.length,calls);
  assert.equal(await(await app.request('/assets/models/cottage.glb?v=0123456789')).text(),`cached:${mine}`,'offline, any copy beats a stand-in');
});

test('a new build never gets the previous build\'s cached models (the stale-worker mix seen after deploys)',async t=>{
  const storage=cacheStorage(),old=worker(await buildFixture(t,{'index.html':'old','assets/models/cottage.glb':'cottage v1'}),storage);
  await old.lifecycle('install');await old.lifecycle('activate');
  // The old worker still controls the tab when the new index.html and scripts arrive from the network.
  const fresh=`/assets/models/cottage.glb?v=${glbHash('cottage v2')}`;
  assert.equal(await(await old.request(fresh)).text(),`network:${origin}${fresh}`);
  assert.equal(await(await old.request('/adventure',{mode:'navigate'})).text(),`network:${origin}/adventure`);
});

test('a new worker installs past the HTTP cache, takes over at once, drops old caches and tells pages its scripts',async t=>{
  const storage=cacheStorage(),old=worker(await buildFixture(t,{'index.html':'old','assets/index-AAAAAAAA.js':'old'}),storage);
  await old.lifecycle('install');await old.lifecycle('activate');const oldName=(await storage.keys())[0];
  const source=await buildFixture(t,{'index.html':'new','assets/index-BBBBBBBB.js':'new'}),next=worker(source,storage);
  await next.lifecycle('install');assert.equal(next.skipped,1);
  assert.match(source,/cache:'reload'/);
  await next.lifecycle('activate');
  assert.equal((await storage.keys()).includes(oldName),false);
  assert.deepEqual(JSON.parse(JSON.stringify(next.messages.map(m=>({...m,version:typeof m.version})))),[{type:'zoo-sw-ready',version:'string',scripts:['/assets/index-BBBBBBBB.js']}]);
});
