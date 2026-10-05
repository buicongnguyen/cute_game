import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { GraphicsGovernor } from '../src/graphics.ts';
import { frameSteps } from '../src/frame-steps.ts';
import * as M from '../src/model.ts';
import { BoulderFx } from '../src/boulder-fx.ts';
import {DisguiseFx} from '../src/disguise-fx.ts';

// Exercise the real main-loop controller and governor. Rendering is intercepted
// because changing a canvas's dimensions invalidates its last rendered image.
const source = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'frame');
assert.ok(declaration, 'main.ts must provide the actual frame controller');
const compiled = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
  const boulders=new BoulderFx({ground:()=>0,explorerAt:()=>null});
  const graphics = new GraphicsGovernor({ mobile: false, devicePixelRatio: 2 });
  const events = [], samples = [], changes = [];
  let now = 0, painted = false, renders = 0, scheduled = 0;
  const sample = graphics.sample.bind(graphics);
  graphics.sample = (dt, playing) => { samples.push(playing); events.push('sample'); return sample(dt, playing); };
  const noop = () => {};
  const context = {
    M, frameSteps, graphics, previous: 0, frameTime: 0, elapsed: 0, uiElapsed: 0,
    flight: null, arriving: false, started: true, blocked: false, settledAt: -1,actionHandler:null,
    wasAirborne: false, fishGame: null, recastUntil: 0, modal: '',
    state: M.newGame(), document: { hidden: false }, performance: { now: () => now },
    innerWidth: 1280, innerHeight: 720, network: { role: null },
    ship: { update: noop }, gestures: { update: noop }, joystick:{update:noop},combatTimers: { advance: noop },
    combat: { update: noop, statuses: {}, airborne: 0, projectiles: [], allies: [], pose: 'idle' },
    combatView: { update: noop }, fishingView: { update: noop, active: false }, rodTip: {}, skillFx: { disguises: new DisguiseFx({ground:()=>0,explorerAt:()=>null}), boulders, update: noop, gazeAngle: () => null },
    uiBlocked: () => context.blocked,
    world: {
      time: 0, player: { position: { y: 0 } }, position: { x: 0, z: 0 },
      fx: { hitstop: 0, updateText: noop }, update: noop, syncCrops: noop,
      applyGraphics(profile, ratio) {
        events.push('resize'); painted = false; changes.push({ profile, ratio });
      },
      render() { events.push('render'); painted = true; renders++; },
    },
    $: () => ({ hidden: true }), autoAttack: noop, updateContextWeapon: noop, updateHunting: noop, updateGuardian: noop, positionLabels: noop,
    minimap: { frame: noop }, frameListeners: new Set(), updateHud: noop, updateLabels: noop, measureHud: noop, hudFresh: false,
    save: noop, saveGraphics: noop, requestAnimationFrame: () => { scheduled++; },
  };
  const ctx = vm.createContext(context); vm.runInContext(compiled, ctx);
  return {
    ctx, graphics, changes, samples,
    run(fps, seconds) {
      for (let i = 0; i < Math.round(fps * seconds); i++) {
        events.length = 0; now += 1000 / fps; ctx.frame(now);
        if (ctx.document.hidden) { assert.equal(events.includes('render'), false, 'a hidden tab does no rendering work'); continue; }
        assert.equal(painted, true, `frame ${renders} must end with a rendered image after any resize`);
        assert.equal(events.filter(event => event === 'render').length, 1, 'draw exactly once per animation frame');
        const resize = events.indexOf('resize');
        if (resize >= 0) assert.ok(resize < events.indexOf('render'), 'adaptive resizing must happen before the visible draw');
      }
    },
    get renders() { return renders; }, get scheduled() { return scheduled; },
  };
}

test('adaptive resolution and quality changes finish every frame with a visible render', () => {
  const f = fixture();
  f.run(20, 30);
  assert.equal(f.graphics.level, 'low');
  assert.equal(f.graphics.ratio, .7);
  assert.ok(new Set(f.changes.map(change => change.profile)).size >= 3, 'exercise resolution, shadow-size and shadow-on/off changes');
  const reduced = f.changes.length;
  f.run(60, 100);
  assert.equal(f.graphics.level, 'high'); assert.equal(f.graphics.ratio, 2);
  assert.ok(f.changes.length > reduced, 'restoring quality also resizes the renderer');
  assert.equal(f.renders, 6600); assert.equal(f.scheduled, f.renders);
});

for (const condition of ['not started', 'menu open', 'document hidden', 'world settling']) {
  test(`${condition} cannot trigger automatic quality changes`, () => {
    const f = fixture();
    if (condition === 'not started') f.ctx.started = false;
    else if (condition === 'menu open') f.ctx.blocked = true;
    else if (condition === 'document hidden') f.ctx.document.hidden = true;
    else f.ctx.settledAt = 100_000;
    f.run(20, 10);
    assert.equal(f.changes.length, 0); assert.equal(f.graphics.ratio, 2);
    assert.equal(f.samples.length, 200); assert.ok(f.samples.every(playing => playing === false));
    assert.equal(f.renders, condition === 'document hidden' ? 0 : 200); assert.equal(f.scheduled, 200);
  });
}

test('a manual quality setting remains fixed during slow rendered frames', () => {
  const f = fixture(); f.graphics.choose('medium'); f.run(20, 10);
  assert.equal(f.changes.length, 0); assert.equal(f.graphics.level, 'medium');
  assert.equal(f.graphics.ratio, 1.25); assert.ok(f.samples.every(Boolean));
});

test('a boulder pauses with solo combat and resumes on the same simulation clock',()=>{
  const f=fixture(),b=f.ctx.skillFx.boulders;
  b.throw({kind:'cast',look:'boulder',x:0,z:0,radius:8,facing:0,duration:.6,color:'#c96a3a'});
  f.run(60,.2);const rock=b.root.children[0],at=rock.position.clone();assert.ok(at.z>0&&at.z<8);
  f.ctx.blocked=true;f.run(60,2);assert.deepEqual(rock.position,at);assert.equal(b.busy,true);
  f.ctx.blocked=false;f.run(60,.5);assert.equal(b.busy,false);assert.equal(rock.visible,false);
});

test('persistent disguise fields pause with solo combat and reset',()=>{const f=fixture(),fx=f.ctx.skillFx.disguises;fx.play({kind:'cast',look:'heal',x:0,z:0,radius:4,color:'#ffffff',duration:1});f.run(60,.2);f.ctx.blocked=true;f.run(60,2);assert.equal(fx.busy,true);f.ctx.blocked=false;f.run(60,1);assert.equal(fx.busy,false);});
