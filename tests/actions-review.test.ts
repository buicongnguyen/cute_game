import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as Helper from '../src/helper.ts';
import {applyGameAction} from '../src/actions.ts';

test('start fresh removes optional purchased helper and all adventure progress while keeping preferences',()=>{
  const state=M.newGame('Original',M.COLORS[2]);state.level=30;state.energy=100_000;
  assert.equal(Helper.buyHelper(state),'bought');state.settings={sound:false,lowGraphics:true,movePad:true,joystickSide:'left',placeBeds:true};
  state.forge={sword_wood:7};state.bag={sword_wood:2,carrot:8};state.gear.weapon='sword_wood';
  assert.ok(M.plant(state,0,'apple',10_000));const original=state,settings={...state.settings};
  assert.equal(applyGameAction(state,{type:'reset'},{now:20_000,random:()=>.5}),true);
  assert.equal(state,original,'shared action callers retain the active save object');assert.deepEqual(state.settings,settings);
  const expected=M.newGame('Original',M.COLORS[2]);expected.settings=settings;expected.savedAt=20_000;
  assert.deepEqual(state,expected);
});
