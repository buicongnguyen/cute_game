import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as M from '../src/model.ts';
import {SpaceFlight} from '../src/space.ts';
import {GraphicsGovernor} from '../src/graphics.ts';

// The actual main loop, flight controller and visibility hook: a hidden phone must not
// spend a resumed frame's whole one-second cap on fuel, hazards or autopilot movement.
const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['frame','updateSpace'].includes(n.name?.text)
  ||ts.isExpressionStatement(n)&&n.getText(ast).startsWith("document.addEventListener('visibilitychange'")&&n.getText(ast).includes('previous=performance.now()'));
assert.equal(nodes.length,3);
const code=ts.transpileModule(nodes.map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
  let now=0,draws=0,saves=0,scheduled=0;const handlers=new Map(),events=[],noop=()=>{};
  const flight=new SpaceFlight('home',['home','candy']);flight.setAutopilot('candy');
  const graphics=new GraphicsGovernor({mobile:true,devicePixelRatio:3});
  const ctx=vm.createContext({M,graphics,frameTime:0,previous:0,elapsed:0,uiElapsed:0,flight,arriving:false,
    document:{hidden:false,addEventListener:(name,fn)=>handlers.set(name,fn)},performance:{now:()=>now},
    spaceKeys:new Set(),spacePointer:null,boostHeld:false,innerWidth:390,innerHeight:844,
    world:{renderer:{}},state:{level:60,energy:100},spaceHome:{update:noop},spaceView:{update:noop,render:()=>draws++,drawRadar:noop},
    onSpaceEvent:event=>events.push(event),$:()=>({style:{},classList:{toggle:noop},getContext:()=>null}),
    t:text=>text,updateHud:noop,save:()=>saves++,requestAnimationFrame:()=>scheduled++});
  vm.runInContext(code,ctx);
  return {ctx,flight,graphics,events,frame(time){now=time;ctx.frame(time);},visibility(hidden,time){now=time;ctx.document.hidden=hidden;handlers.get('visibilitychange')();},
    get draws(){return draws;},get saves(){return saves;},get scheduled(){return scheduled;}};
}

test('hidden phone frames do not move the ship, burn fuel, render or advance autosave clocks',()=>{
  const f=fixture(),start={x:f.flight.x,z:f.flight.z,fuel:f.flight.fuel,time:f.flight.time};f.visibility(true,0);
  for(const now of [1000,10000,60000])f.frame(now);
  assert.deepEqual({x:f.flight.x,z:f.flight.z,fuel:f.flight.fuel,time:f.flight.time},start);
  assert.equal(f.draws,0);assert.equal(f.saves,0);assert.equal(f.ctx.elapsed,0);assert.equal(f.ctx.uiElapsed,0);assert.equal(f.scheduled,3);assert.deepEqual(f.events,[]);
});

for(const hiddenFrames of [false,true])test(`resuming flight ignores the suspended interval (${hiddenFrames?'throttled callbacks':'no callbacks'})`,()=>{
  const f=fixture();f.frame(20);const before=f.flight.time,fuel=f.flight.fuel;
  f.visibility(true,21);if(hiddenFrames)f.frame(30000);f.visibility(false,60000);f.frame(60020);
  assert.ok(Math.abs(f.flight.time-before-.08)<1e-8,'only the visible20ms advances the4x autopilot');
  assert.ok(fuel-f.flight.fuel<.1,'returning cannot consume seconds of fuel');assert.equal(f.draws,2);
});

test('a resumed animation timestamp older than the visibility event cannot run time backwards',()=>{
  const f=fixture();f.visibility(true,10);f.visibility(false,60010);f.frame(60000);
  assert.equal(f.flight.time,0);assert.equal(f.flight.fuel,100);assert.equal(f.ctx.elapsed,0);assert.ok(f.ctx.frameTime>=0);
});
