import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {t,setLanguage} from '../src/i18n.ts';
import {DISGUISE_INFO} from '../src/skill-info.ts';
import {CombatSimulation} from '../src/combat.ts';

test('Vietnamese dictionaries preserve every interpolation placeholder',async()=>{
 const dir=new URL('../src/locales/',import.meta.url),tokens=s=>[...s.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort();
 for(const file of await readdir(dir)){if(!file.endsWith('.ts'))continue;const module=await import(new URL(file,dir));for(const dict of Object.values(module))for(const [en,vi]of Object.entries(dict))if(typeof vi==='string')assert.deepEqual(tokens(vi),tokens(en),`${file}: ${en}`);}
});
test('blood moon healing uses damage dealt, and both help languages say so',()=>{
 const target={id:'a',x:0,z:1,radius:.5,hp:100},heals=[];
 const sim=new CombatSimulation({position:()=>({x:0,z:0}),facing:()=>0,face(){},targets:()=>[target],weapon:()=>({kind:'fist'}),stats:()=>({attack:10,maxHp:200,critChance:0}),move(){},hit:()=>5,effect(){},heal:f=>heals.push(f)},()=>.5);
 sim.disguise('dz_vampire',3);sim.basic(target);assert.equal(heals[0],5*.4/200);
 assert.match(DISGUISE_INFO.dz_vampire[3],/40% of the damage dealt/);
 try{setLanguage('vi');assert.match(t(DISGUISE_INFO.dz_vampire[3]),/40% sát thương thực tế/);assert.match(t(DISGUISE_INFO.dz_fairy[3]),/8 đợt.*0,3.*1% máu tối đa/);}finally{setLanguage('en');}
});
test('dungeon binds follow simulation time rather than expiring while the game is paused',async()=>{
 const source=await readFile(new URL('../src/dungeon.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('dungeon.ts',source,99,true);let fn;
 const walk=n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text==='statusFrame')fn=n;ts.forEachChild(n,walk);};walk(ast);assert.ok(fn);
 const context={session:{root:{remaining:2,x:1,z:2},slow:0},world:{position:{x:9,z:9},destination:{},route:[1]},C:{x:0,z:0},ARENA_R:23,teleport(){},performance:{now:()=>1e12}};
 vm.createContext(context);vm.runInContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 context.statusFrame(.5);assert.deepEqual(context.world.position,{x:1,z:2});assert.equal(context.session.root.remaining,1.5);
 context.statusFrame(1.5);assert.equal(context.session.root.remaining,0);context.world.position.x=3;context.statusFrame(.1);assert.equal(context.world.position.x,3);
});
