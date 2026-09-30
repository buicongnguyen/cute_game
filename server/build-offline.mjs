import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

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
const assets = files.map(file => base + path.relative(dist, file).split(path.sep).join('/'));
const hash = createHash('sha256');
for (let index = 0; index < files.length; index++) {
  hash.update(assets[index]).update('\0').update(await readFile(files[index])).update('\0');
}
// Different project Pages sites share an origin. An update must only retire
// caches for this deployment path, never another game's offline files.
const prefix = `zoo-garden-${createHash('sha256').update(base).digest('hex').slice(0, 12)}-`;
const version = prefix + hash.digest('hex').slice(0, 16);
await writeFile(path.join(dist, 'sw.js'), `const BASE=${JSON.stringify(base)};
const PREFIX=${JSON.stringify(prefix)};
const VERSION=${JSON.stringify(version)};
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>
    key!==VERSION&&(key.startsWith(PREFIX)||(BASE==='/'&&/^zoo-garden-[a-f0-9]{16}$/.test(key)))
  ).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
  const localPath=url.pathname.slice(BASE.length);
  if(localPath==='api'||localPath.startsWith('api/')||localPath==='socket'||localPath.startsWith('socket/'))return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(()=>caches.open(VERSION).then(cache=>cache.match(BASE+'index.html'))));
    return;
  }
  if(ASSETS.includes(url.pathname))event.respondWith(caches.open(VERSION).then(cache=>cache.match(url.pathname).then(cached=>cached||fetch(event.request))));
});
`);
console.log(`Offline game cache prepared (${assets.length} files, base ${base}).`);
