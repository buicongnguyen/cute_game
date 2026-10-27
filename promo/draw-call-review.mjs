/** Draw-call review adapted from Claude's smooth-dense-scenes render-probe, draw-attribution and pixel A/B workflow.
 * PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node promo/draw-call-review.mjs http://127.0.0.1:5298/ --mobile --cpu 4 --out report.json
 * Uses isolated test storage, the promo save and a frozen clock. No accounts or real saves are touched.
 * Counts actual WebGL submissions including shadows. Same-state pixel checks and interleaved null controls accompany A/B timings.
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
  window.__drawReview={realNow,pump,freeze(){auto=false;},calls:0,triangles:0,instanced:0};
  for(const proto of [window.WebGLRenderingContext?.prototype,window.WebGL2RenderingContext?.prototype].filter(Boolean))for(const key of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']){
   const original=proto[key];if(!original)continue;proto[key]=function(...a){const r=window.__drawReview,inst=key.endsWith('Instanced'),arrays=key.startsWith('drawArrays'),count=arrays?a[2]:a[1],copies=inst?(arrays?a[3]:a[4]):1;r.calls++;if(inst)r.instanced++;if(a[0]===4)r.triangles+=count/3*copies;return original.apply(this,a);};
  }
 },{save});
 await page.goto(url);await page.locator('[data-action=start]').click();await page.waitForFunction(()=>!!window.__zoo?.world?.renderer);
 await page.evaluate(async()=>{const a=await import('/src/assets.ts');await Promise.all([a.wearKit.load(),a.weaponKit.load(),a.heroKitFor('girl-grown-none-bare').load()]);});
 await page.waitForTimeout(6500);
 for(let i=0;i<4;i++){const close=page.locator('#dialog-layer:not([hidden]) .close-button');if(await close.isVisible()){await close.click();await page.waitForTimeout(200);}}
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(opt('cpu','1'))});
 const result=await page.evaluate(({scenes,flag})=>{
  const w=__zoo.world,r=w.renderer,review=window.__drawReview;review.freeze();
  if(!(flag in __zoo.flags))throw Error('Unknown performance flag: '+flag);
  document.getElementById('dialog-layer').hidden=true;document.getElementById('hud').inert=false;
  const gl=r.getContext(),gpuInfo=gl.getExtension('WEBGL_debug_renderer_info');
  const gpu=gpuInfo?gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL):'unknown';
  const originalRender=r.renderBufferDirect;let passes={main:0,shadow:0},rows=new Map();
  const entities=new Map(w.entities.map(e=>[e.mesh,e.kind]));
  const label=o=>{let p=o;while(p){if(p===w.player)return'player';if(entities.has(p))return entities.get(p);if(p.userData.scatter)return'scatter';p=p.parent;}return o.name||o.type;};
  r.renderBufferDirect=function(camera,scene,geometry,material,object){const pass=material.isMeshDepthMaterial||material.isMeshDistanceMaterial?'shadow':'main';const before=review.calls,result=originalRender.apply(this,arguments),submitted=review.calls-before;passes[pass]+=submitted;const key=pass+':'+label(object);if(submitted)rows.set(key,(rows.get(key)??0)+submitted);return result;};
  const geometryBytes=()=>{const seen=new Set();let bytes=0;w.scene.traverse(o=>{if(!o.geometry)return;for(const a of [...Object.values(o.geometry.attributes),o.geometry.index].filter(Boolean)){const buffer=a.array?.buffer??a.data?.array?.buffer;if(buffer&&!seen.has(buffer)){seen.add(buffer);bytes+=buffer.byteLength;}}});return bytes;};
  let pose=()=>{};
  const build=enabled=>{__zoo.flags[flag]=enabled;w.refreshPlayer();w.update(0,false,false,false);pose();w.renderSerial=0;r.shadowMap.autoUpdate=true;r.shadowMap.needsUpdate=true;w.render();};
  const draw=(pixels=false)=>{review.calls=review.triangles=review.instanced=0;passes={main:0,shadow:0};rows=new Map();r.shadowMap.needsUpdate=true;const t=review.realNow();r.render(w.scene,w.camera);const data=new Uint8Array(pixels?gl.drawingBufferWidth*gl.drawingBufferHeight*4:4);gl.readPixels(0,0,pixels?gl.drawingBufferWidth:1,pixels?gl.drawingBufferHeight:1,gl.RGBA,gl.UNSIGNED_BYTE,data);return{calls:review.calls,triangles:Math.round(review.triangles),instanced:review.instanced,passes:{...passes},renderMs:review.realNow()-t,geometryBytes:geometryBytes(),top:[...rows].sort((a,b)=>b[1]-a[1]).slice(0,12),pixels:data};};
  const diff=(a,b)=>{let n=0,max=0;for(let i=0;i<a.length;i+=4){let d=0;for(let c=0;c<3;c++)d=Math.max(d,Math.abs(a[i+c]-b[i+c]));if(d)n++;max=Math.max(max,d);}return{pixels:a.length/4,differing:n,maxDelta:max};};
  const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];const results=[];
  for(const [name,x,z]of scenes){
   __zoo.pinHero({x,z});w.position.set(x,0,z);w.cameraTarget.set(x,0,z);review.pump(180);document.querySelector('#dialog-layer .close-button')?.click();
   const saved=__zoo.flags[flag];
   build(false);const before=draw(true);const repeat=draw(true);build(true);const after=draw(true);
   const picture=diff(before.pixels,after.pixels),nullPicture=diff(before.pixels,repeat.pixels);
   const timings={off:[],on:[],nullA:[],nullB:[]};
   for(let pair=0;pair<12;pair++){
    for(const enabled of(pair%2?[true,false]:[false,true])){build(enabled);draw();timings[enabled?'on':'off'].push(draw().renderMs);}
    build(true);draw();timings.nullA.push(draw().renderMs);timings.nullB.push(draw().renderMs);
   }
   delete before.pixels;delete after.pixels;
   results.push({scene:name,position:[x,z],before,after,picture,nullPicture,timing:{offMedian:median(timings.off),onMedian:median(timings.on),nullAMedian:median(timings.nullA),nullBMedian:median(timings.nullB)}});
   __zoo.flags[flag]=saved;
  }
  const characterChecks=[],state=__zoo.state,original={color:state.color,gear:state.gear,looks:state.looks,hurt:w.hurtT,stealth:w.playerStealth,weapon:w.weaponKind};
  for(const name of ['recoloured','hat-and-outfit','grown-body','walking','hurt-flash','stealth','fishing-pose']){
   state.color=name==='recoloured'?'#ff7ab0':original.color;
   state.gear=name==='hat-and-outfit'?{hat:'hat_straw',outfit:'armor_knight'}:name==='fishing-pose'?{weapon:'rod'}:{};
   state.looks=name==='grown-body'?{style:'girl-grown-none-bare',owned:['grown']}:original.looks;
   w.hurtT=name==='hurt-flash'?.2:0;w.playerStealth=name==='stealth';w.weaponKind=name==='fishing-pose'?'rod':'fist';
   pose=()=>{if(name==='walking'){w.moving=true;w.animatePlayer(0);}if(name==='fishing-pose'){w.castT=.2;w.animatePlayer(0);}};
   build(false);const a=draw(true);build(true);const b=draw(true);
   characterChecks.push({name,picture:diff(a.pixels,b.pixels),handSocket:!!w.player.getObjectByName('hand-right'),sproutVisible:w.player.getObjectByName('head-leaf')?.visible??null});
  }
  w.playerStealth=false;build(true);w.playerStealth=true;w.update(0,false,false,false);const faded=w.player.userData.localBatchOpaque===false;w.playerStealth=false;w.update(0,false,false,false);const opaque=w.player.userData.localBatchOpaque===true;characterChecks.push({name:'stealth-transition',transitionsVerified:faded&&opaque,handSocket:faded&&opaque});
  pose=()=>{};state.color=original.color;state.gear=original.gear;state.looks=original.looks;w.hurtT=original.hurt;w.playerStealth=original.stealth;w.weaponKind=original.weapon;
  r.renderBufferDirect=originalRender;
  return{gpu,characterChecks,canvas:[gl.drawingBufferWidth,gl.drawingBufferHeight],msaa:gl.getContextAttributes().antialias,scenes:results};
 },{flag:opt('flag','mergeLocalAvatar'),scenes:[['village',0,3.6],['forest',-13,-57],['canyon',105,-40]].filter(([name])=>!opt('scenes')||opt('scenes').split(',').includes(name))});
 const report={url,viewport:[width,height],mobile,cpuThrottle:Number(opt('cpu','1')),flag:opt('flag','mergeLocalAvatar'),...result,errors};
 if(opt('out'))fs.writeFileSync(opt('out'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 if(errors.length||result.characterChecks.some(c=>(c.picture?.differing??0)!==0||!c.handSocket)||result.scenes.some(s=>s.nullPicture.differing!==0||s.picture.differing!==0||s.after.calls>s.before.calls))process.exitCode=1;
}finally{await browser.close();}
