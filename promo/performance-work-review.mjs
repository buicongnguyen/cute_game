/** Desktop/mobile CPU, matrix and GPU-buffer review for Three.js r180.
 * Set PLAYWRIGHT_MODULE to an installed Playwright index.mjs, then:
 * npm run perf:work -- http://127.0.0.1:5299/ --mobile --cpu 4 --out report.json
 * Uses isolated storage; synchronous seeded work is NOT a real-device FPS benchmark.
 */
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const args=process.argv.slice(2),opt=(k,d)=>{const i=args.indexOf('--'+k);return i<0?d:args[i+1];};
const url=args.find(a=>/^https?:/.test(a))??'http://127.0.0.1:5298/';
let module=process.env.PLAYWRIGHT_MODULE;if(!module){try{module=createRequire(path.join(process.cwd(),'package.json')).resolve('playwright');}catch{throw Error('Set PLAYWRIGHT_MODULE to an installed Playwright entry point.');}}
const pw=await import(module.startsWith('file:')?module:pathToFileURL(module).href),mobile=args.includes('--mobile');
const [width,height]=opt('viewport',mobile?'390x844':'1280x720').split('x').map(Number);
const save=JSON.parse(fs.readFileSync(new URL('./save.json',import.meta.url),'utf8'));save.savedAt=1.8e12;save.hp=999999;save.settings??={};save.settings.aiNeighbours=false;
const browser=await pw.chromium.launch({headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--mute-audio']});
const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await context.addInitScript(({save})=>{
  localStorage.setItem('cute-game-save-v1',JSON.stringify(save));localStorage.setItem('cute-game-slot','0');localStorage.setItem('cute-game-language','en');
  localStorage.setItem('zoo-garden-graphics',JSON.stringify({setting:'high',autoVersion:2}));localStorage.setItem('zoo-colossus-sleeps','asleep');
  let seed=12345;Math.random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  const realNow=performance.now.bind(performance);let fake=1000,auto=true,id=0;const pending=new Map();
  performance.now=()=>fake;Date.now=()=>1.8e12+fake;
  window.requestAnimationFrame=cb=>{pending.set(++id,cb);return id;};window.cancelAnimationFrame=n=>pending.delete(n);
  const pump=n=>{for(let i=0;i<n;i++){fake+=1000/60;const jobs=[...pending.values()];pending.clear();for(const cb of jobs)cb(fake);}};
  setInterval(()=>{if(auto)pump(1);},16);
  window.__drawReview={realNow,pump,restoreDraws:[],freeze(){auto=false;},calls:0,triangles:0,instanced:0};
  for(const proto of [window.WebGLRenderingContext?.prototype,window.WebGL2RenderingContext?.prototype].filter(Boolean))for(const key of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
   const original=proto[key];if(!original)continue;window.__drawReview.restoreDraws.push(()=>proto[key]=original);proto[key]=function(...a){const r=window.__drawReview,inst=key.endsWith('Instanced'),arrays=key.startsWith('drawArrays'),count=arrays?a[2]:a[1],copies=inst?(arrays?a[3]:a[4]):1;r.calls++;if(inst)r.instanced++;if(a[0]===4)r.triangles+=count/3*copies;return original.apply(this,a);};
  }
 },{save});
 await page.goto(url);await page.locator('[data-action=start]').click();await page.waitForFunction(()=>!!window.__zoo?.world?.renderer);
 await page.evaluate(async()=>{const a=await import('/src/assets.ts');await Promise.all([a.wearKit.load(),a.weaponKit.load(),a.heroKitFor('girl-grown-none-bare').load()]);});
 await page.waitForTimeout(6500);
 for(let i=0;i<4;i++){const close=page.locator('#dialog-layer:not([hidden]) .close-button');if(await close.isVisible()){await close.click();await page.waitForTimeout(200);}}
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(opt('cpu','1'))});
 const result=await page.evaluate(async()=>{
 const T=await import('/node_modules/.vite/deps/three.js');const z=window.__zoo,w=z.world,r=w.renderer,rev=window.__drawReview;rev.freeze();z.pinHero({x:0,z:3.6});w.position.set(0,0,3.6);w.cameraTarget.copy(w.position);rev.pump(180);
 const gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');let uploads=0,bytes=0,allocations=0,allocated=0,compose=0,multiply=0,shadow=0,main=0;
 const sub=gl.bufferSubData.bind(gl),data=gl.bufferData.bind(gl),comp=T.Matrix4.prototype.compose,mul=T.Matrix4.prototype.multiplyMatrices,direct=r.renderBufferDirect;
 gl.bufferSubData=(target,offset,source,start=0,length)=>{uploads++;bytes+=ArrayBuffer.isView(source)?((length||source.length-start)*source.BYTES_PER_ELEMENT):source.byteLength;return sub(target,offset,source,start,...(length===undefined?[]:[length]));};
 gl.bufferData=(...a)=>{allocations++;allocated+=typeof a[1]==='number'?a[1]:a[1]?.byteLength??0;return data(...a);};
 T.Matrix4.prototype.compose=function(...a){compose++;return comp.apply(this,a)};T.Matrix4.prototype.multiplyMatrices=function(...a){multiply++;return mul.apply(this,a)};
 r.renderBufferDirect=function(camera,scene,geometry,material,object,...rest){const old=rev.calls;const value=direct.call(this,camera,scene,geometry,material,object,...rest);if(material.isMeshDepthMaterial||material.isMeshDistanceMaterial)shadow+=rev.calls-old;else main+=rev.calls-old;return value;};
 const memory=()=>{const buffers=new Set();w.scene.traverse(o=>{for(const a of [...Object.values(o.geometry?.attributes??{}),o.geometry?.index,o.instanceMatrix,o.instanceColor].filter(Boolean)){const b=a.array?.buffer??a.data?.array?.buffer;if(b)buffers.add(b);}});return{geometryBytes:[...buffers].reduce((n,b)=>n+b.byteLength,0),...r.info.memory,programs:r.info.programs.length,heap:performance.memory?.usedJSHeapSize};};
 const sample=(name,setup)=>{setup();rev.pump(4);uploads=bytes=allocations=allocated=compose=multiply=shadow=main=rev.calls=rev.triangles=0;for(let i=0;i<60;i++)rev.pump(1);return{name,frames:60,draws:rev.calls/60,shadow:shadow/60,main:main/60,triangles:rev.triangles/60,uploads:uploads/60,bytes:bytes/60,allocations,allocated,compose:compose/60,multiply:multiply/60,matrixVisited:z.matrixStats.visited,memory:memory()};};
 const rows=[];
 rows.push(sample('idle',()=>{w.fx.sparks.clear();w.fx.glow.clear()}));
 rows.push(sample('effects',()=>{w.fx.sparks.clear();w.fx.glow.clear();w.fx.burst(w.position,{n:48,life:20});w.fx.burst(w.position,{n:48,life:20,glow:true})}));
 rows.push(sample('walking-effects',()=>{z.pinHero(null);w.keys.add('ArrowRight')}));w.keys.delete('ArrowRight');z.pinHero({x:w.position.x,z:w.position.z});
 // Compare transform upkeep on the same settled hierarchy, not two moving moments.
 const copyPose=o=>{const n=new T.Object3D();n.position.copy(o.position);n.quaternion.copy(o.quaternion);n.scale.copy(o.scale);n.matrix.copy(o.matrix);n.matrixAutoUpdate=o.matrixAutoUpdate;n.matrixWorldAutoUpdate=o.matrixWorldAutoUpdate;n.visible=o.visible;for(const child of o.children)n.add(copyPose(child));return n;};
 const ordinary=copyPose(w.scene);ordinary.matrixWorldAutoUpdate=true;ordinary.updateMatrixWorld(true);
 compose=multiply=0;ordinary.updateMatrixWorld();const normalMatrices={compose,multiply};
 z.updateSceneMatrices(w.scene);compose=multiply=0;z.updateSceneMatrices(w.scene);
 const transformAudit={ordinary:normalMatrices,cached:{compose,multiply,visited:z.matrixStats.visited,frozenSkips:z.matrixStats.frozenSkips}};
 const paired=[];const memoryBefore=memory();
 const frame=()=>{uploads=bytes=compose=multiply=rev.calls=shadow=main=0;w.fx.sparks.update(0);w.fx.glow.update(0);r.shadowMap.needsUpdate=true;r.render(w.scene,w.camera);const image=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,image);return{uploads,bytes,compose,multiply,draws:rev.calls,shadow,main,image};};
 for(const active of [false,true]){if(!active){w.fx.sparks.clear();w.fx.glow.clear()}else{w.fx.burst(w.position,{n:48,life:20});w.fx.burst(w.position,{n:48,life:20,glow:true});}
  z.flags.selectiveParticleUploads=false;frame();const before=frame(),control=frame();z.flags.selectiveParticleUploads=true;frame();const after=frame();
  let different=0,nullDifferent=0;for(let i=0;i<before.image.length;i+=4){if(before.image.slice(i,i+4).some((v,k)=>v!==after.image[i+k]))different++;if(before.image.slice(i,i+4).some((v,k)=>v!==control.image[i+k]))nullDifferent++;}delete before.image;delete after.image;paired.push({active,before,after,different,nullDifferent});
 }
 gl.bufferSubData=sub;gl.bufferData=data;T.Matrix4.prototype.compose=comp;T.Matrix4.prototype.multiplyMatrices=mul;r.renderBufferDirect=direct;
 // Remove raw draw wrappers too: operation instrumentation must not bias CPU timings.
 for(const restore of rev.restoreDraws)restore();
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
 const timings=[];
 for(const moving of [false,true]){
  if(moving){z.pinHero(null);w.keys.add('ArrowRight');}
  const groups={before:[],after:[],nullA:[],nullB:[]};
  const measure=enabled=>{z.flags.selectiveParticleUploads=enabled;rev.pump(2);const t=rev.realNow();rev.pump(4);return(rev.realNow()-t)/4;};
  for(let pair=0;pair<12;pair++){
   for(const enabled of(pair%2?[true,false]:[false,true]))groups[enabled?'after':'before'].push(measure(enabled));
   groups.nullA.push(measure(true));groups.nullB.push(measure(true));
  }
  timings.push({moving,medians:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,median(v)])),samples:groups});
  w.keys.delete('ArrowRight');z.pinHero({x:w.position.x,z:w.position.z});
 }
 z.flags.selectiveParticleUploads=true;
 const memoryAfter=memory();
 return{gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',canvas:[gl.drawingBufferWidth,gl.drawingBufferHeight],rows,paired,transformAudit,timings,memoryBefore,memoryAfter,errors:[]};
 });
 await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await page.evaluate(()=>window.__drawReview.pump(180));const {profile}=await cdp.send('Profiler.stop');
 const hits=new Map();for(const id of profile.samples??[])hits.set(id,(hits.get(id)??0)+1);result.cpuTop=profile.nodes.map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber,samples:hits.get(n.id)??0})).sort((a,b)=>b.samples-a.samples).slice(0,15);
 const report={url,mobile,cpuThrottle:Number(opt('cpu','1')),...result,errors};if(opt('out'))fs.writeFileSync(opt('out'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(errors.length||result.paired.some(p=>p.different||p.nullDifferent||p.after.bytes>p.before.bytes||p.after.draws!==p.before.draws))process.exitCode=1;
}finally{await browser.close();}
