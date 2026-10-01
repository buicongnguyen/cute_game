import test from 'node:test';
import assert from 'node:assert/strict';
import { GroundGestures } from '../src/gestures.ts';
function controls(){const taps:number[][]=[],walks:number[][]=[],zooms:number[]=[];let stops=0;const g=new GroundGestures({tap:(x,y)=>taps.push([x,y]),walk:(x,y)=>walks.push([x,y]),zoom:ratio=>zooms.push(ratio),stop:()=>stops++});return {g,taps,walks,zooms,stops:()=>stops};}
test('short tap interacts once; held pointer follows ground without duplicate tap',()=>{const a=controls();a.g.down(1,10,20);a.g.update(.1);a.g.up(1);assert.deepEqual(a.taps,[[10,20]]);a.g.down(2,30,40);a.g.update(.25);a.g.move(2,40,50);a.g.update(.25);a.g.up(2);assert.deepEqual(a.walks,[[30,40],[40,50]]);assert.equal(a.taps.length,1);});
test('pinch stops movement and never becomes a stray click on finger release',()=>{const a=controls();a.g.down(1,0,0);a.g.down(2,100,0);a.g.move(2,200,0);assert.deepEqual(a.zooms,[.5]);assert.equal(a.stops(),1);a.g.up(2);a.g.update(.4);a.g.up(1);assert.equal(a.taps.length,0);assert.equal(a.walks.length,0);});
test('unrelated pointer release cannot end the held movement gesture',()=>{const a=controls();a.g.down(1,10,20);a.g.up(99);a.g.update(.3);assert.equal(a.walks.length,1);a.g.up(1,true);assert.equal(a.taps.length,0);});
