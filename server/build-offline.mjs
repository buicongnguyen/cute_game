import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assetVersions, modelVersions } from './model-versions.mjs';
import { staleCaches, strategy, isHashedBuildFile } from './sw-logic.mjs';

// Keep the worker's paths aligned with Vite's deployment base. GitHub project
// Pages uses /repository/, while the local Node server serves the root path.
function deploymentBase(value) {
  if (!value.startsWith('/') || value.includes('//') || !/^\/[A-Za-z0-9._~/-]*$/.test(value)) {
    throw new Error('VITE_BASE_PATH must be an absolute URL path, such as / or /cute_game/.');
  }
  if (value.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new Error('VITE_BASE_PATH cannot contain relative path segments.');
  }
  return value.endsWith('/') ? value : `${value}/`;
}

const base = deploymentBase(process.env.VITE_BASE_PATH || '/');
const dist = path.resolve('dist');
async function walk(directory) {
  const all = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) all.push(...await walk(file));
    else if (entry.name !== 'sw.js') all.push(file);
  }
  return all;
}
const files = (await walk(dist)).sort();
const urls = files.map(file => base + path.relative(dist, file).split(path.sep).join('/'));
// Models keep fixed names; the client asks for them with ?v=<content hash> (vite.config.ts), and so do these lists.
const versions = modelVersions(path.join(dist, 'assets', 'models'));
// Icons and audio get the same treatment (src/asset-url.ts), keyed by their path under assets/.
const assets = assetVersions(path.join(dist, 'assets'));
const versioned = url => {
  const name = url.match(/\/assets\/models\/([^/]+\.glb)$/)?.[1];
  if (name) return versions[name] ? `${url}?v=${versions[name]}` : url;
  const rel = url.match(/\/assets\/((?:icons|audio)\/.+)$/)?.[1];
  return rel && assets[rel] ? `${url}?v=${assets[rel]}` : url;
};
// Gear models download only when something from them is first worn, planet scenery only
// when that planet is first visited and the farm pen kit only when the pen is first shown,
// so the worker keeps each one the first time it is fetched instead of fetching them all
// at install.
const onDemand = url => /\/assets\/models\/(gear-[a-z-]+|hero-[a-z]+|disguises|pets|worlds-[a-z]+|farm|creatures|helper|cage|house|titans)\.glb$/.test(url);
const index = base + 'index.html';
// The page and its hashed scripts must install together, or the worker is not worth activating.
const core = urls.filter(url => url === index || (isHashedBuildFile(url) && /\.(js|css)$/.test(url)));
const extra = urls.filter(url => !core.includes(url) && !onDemand(url)).map(versioned);
const pinned = urls.map(versioned).filter((url, i) => isHashedBuildFile(urls[i]) || url !== urls[i]);
const later = urls.filter(onDemand).map(versioned);
const scripts = core.filter(url => url.endsWith('.js'));
const hash = createHash('sha256');
for (let i = 0; i < files.length; i++) hash.update(urls[i]).update('\0').update(await readFile(files[i])).update('\0');
// Different project Pages sites share an origin. An update must only retire
// caches for this deployment path, never another game's offline files.
const prefix = `zoo-garden-${createHash('sha256').update(base).digest('hex').slice(0, 12)}-`;
const version = prefix + hash.digest('hex').slice(0, 16);
await writeFile(path.join(dist, 'sw.js'), `const BASE=${JSON.stringify(base)};
const PREFIX=${JSON.stringify(prefix)};
const VERSION=${JSON.stringify(version)};
const CORE=${JSON.stringify(core)};
const EXTRA=${JSON.stringify(extra)};
const LATER=${JSON.stringify(later)};
const KNOWN=${JSON.stringify(urls)};
const PINNED=${JSON.stringify(pinned)};
const SCRIPTS=${JSON.stringify(scripts)};
${staleCaches.toString()}
${strategy.toString()}
const PINNED_SET=new Set(PINNED);
// Unpinned files install past the HTTP cache (Pages sends max-age=600), or index.html could be older than its scripts.
// A pinned URL names one exact build of a file (hash or ?v=), so an older worker's copy of it is used as is, and
// otherwise the ordinary HTTP cache may answer: reloading those only downloaded the same bytes twice.
const fresh=url=>new Request(url,{cache:'reload'});
const older=()=>caches.keys().then(keys=>keys.filter(key=>key!==VERSION&&key.startsWith(PREFIX)));
const copied=(url,names)=>names.reduce((found,name)=>found.then(hit=>hit||caches.open(name).then(cache=>cache.match(url))),Promise.resolve(undefined));
const fill=(cache,url,names)=>PINNED_SET.has(url)?copied(url,names).then(hit=>hit?cache.put(url,hit):cache.add(url)):cache.add(fresh(url));
// Runs job over items with at most n in flight, so a big list does not fight the game for the connection. Never rejects.
const pool=(items,n,job)=>new Promise(done=>{let next=0,live=0;const go=()=>{if(next>=items.length&&!live)return done();while(live<n&&next<items.length){live++;const item=items[next++];Promise.resolve().then(()=>job(item)).catch(()=>{}).then(()=>{live--;go();});}};go();});
// On-demand files (models the game fetches only when first needed): copy any this build can take from an older cache at
// install (no network), and download the rest in the background once the page asks (message 'zoo-fill'), a few at a time.
const inherit=(cache,names)=>pool(LATER,6,url=>copied(url,names).then(hit=>hit&&cache.put(url,hit)));
const backfill=()=>Promise.all([caches.open(VERSION),older()]).then(([cache,names])=>pool(LATER,4,url=>cache.match(url).then(hit=>hit||fill(cache,url,names))));
self.addEventListener('message',event=>{if(event.data&&event.data.type==='zoo-fill')event.waitUntil(backfill());});
// A new build takes over at once: its pinned URLs carry content hashes, so an open page of an older
// build still gets matching files (other versions go to the network), and the page offers a reload.
self.addEventListener('install',event=>{
  event.waitUntil(Promise.all([caches.open(VERSION),older()]).then(([cache,names])=>Promise.all(CORE.map(url=>fill(cache,url,names)))
    .then(()=>pool(EXTRA,5,url=>fill(cache,url,names))).then(()=>inherit(cache,names))).then(()=>self.skipWaiting()));
});
// Older caches go only once this build holds every EXTRA file: a flaky install keeps the last complete copy for offline play.
const complete=()=>caches.open(VERSION).then(cache=>Promise.all(EXTRA.map(url=>cache.match(url)))).then(found=>found.every(Boolean));
self.addEventListener('activate',event=>{
  event.waitUntil(complete().then(done=>done&&caches.keys().then(keys=>Promise.all(staleCaches(keys,VERSION,PREFIX,BASE).map(key=>caches.delete(key)))))
    .then(()=>self.clients.claim())
    .then(()=>self.clients.matchAll({type:'window'}))
    .then(clients=>{for(const client of clients)client.postMessage({type:'zoo-sw-ready',version:VERSION,scripts:SCRIPTS});}));
});
const keep=(cache,request,response)=>response.ok?cache.put(request,response.clone()).then(()=>response,()=>response):response;
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  const how=strategy({method:request.method,mode:request.mode,origin:url.origin,pathname:url.pathname,search:url.search},self.location.origin,BASE,KNOWN,PINNED);
  if(how==='skip')return;
  if(how==='navigate'){
    event.respondWith(fetch(request.url,{cache:'no-cache',credentials:'same-origin'}).catch(error=>caches.open(VERSION).then(cache=>cache.match(BASE+'index.html')).then(cached=>cached||Promise.reject(error))));
    return;
  }
  // Offline, a copy an older (kept) cache holds beats a stand-in.
  const elsewhere=(error,ignoreSearch)=>caches.match(request,{ignoreSearch}).then(cached=>cached||Promise.reject(error));
  event.respondWith(caches.open(VERSION).then(cache=>how==='pinned'
    ?cache.match(request).then(cached=>cached||fetch(request).then(response=>keep(cache,request,response),error=>elsewhere(error,false)))
    :fetch(request,{cache:'no-cache'}).then(response=>keep(cache,request,response),error=>cache.match(request,{ignoreSearch:true}).then(cached=>cached||elsewhere(error,true)))));
});
`);
console.log(`Offline game cache prepared (${core.length + extra.length} files, ${pinned.length} pinned by hash, ${urls.length - core.length - extra.length} on-demand files kept on first use, base ${base}).`);
