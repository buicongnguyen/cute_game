// Self-test of tests/support/main-harness.mjs, the harness that runs pieces of src/main.ts in node:vm.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { effectiveKeys } from '../src/controls-keys.ts';
import { mainHarness, freeNames } from './support/main-harness.mjs';

const real = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'main-harness-'));
after(() => rmSync(dir, { recursive: true, force: true }));
/** A temporary copy of main.ts: extra lines on top, extra code at the start of one function, extra lines at the end. */
function copy(name, { top = '', into, body = '', bottom = '' }) {
  let text = real;
  if (into) {
    const ast = ts.createSourceFile('main.ts', text, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === into);
    const at = fn.body.getStart(ast) + 1;
    text = text.slice(0, at) + body + text.slice(at);
  }
  const file = join(dir, name); writeFileSync(file, top + text + bottom); return file;
}

test('free names: what a script uses and does not declare, and nothing else', () => {
  const code = 'function a(x){label: for(const {p:q,r} of x){ if(q) break label; } return {x, y, z:w, m(){return this.k}}; }'
    + 'let s=a(Math.max(u.v, undefined)); try{}catch(e){e;} class C{f=1; g(){return h}} typeof window; app.innerHTML=s;';
  assert.deepEqual([...freeNames(code)].sort(), ['Math', 'app', 'h', 'u', 'w', 'window', 'y']);
});

test('a new import in main.ts, used by a harnessed renderer, resolves with no test edit', async () => {
  assert.doesNotMatch(real, /\beffectiveKeys\b/, 'pick another export for this test: main.ts imports this one now');
  const spec = { functions: ['growText'] }, before = await mainHarness(spec);
  assert.ok(!before.free.has('effectiveKeys'));
  const mainFile = copy('one-more-import.ts', { top: "import { effectiveKeys } from './controls-keys.ts';\n", into: 'growText', body: "if(arguments[0]==='harness self-test')return effectiveKeys;" });
  const main = await mainHarness({ ...spec, mainFile }); // the same spec: nothing about the new import
  assert.ok(main.resolve().imported.includes('effectiveKeys'));
  assert.equal(main.context().growText('harness self-test'), effectiveKeys, 'the renderer got the real export of the module main.ts names');
  const fake = () => 'fake';
  assert.equal(main.context({ effectiveKeys: fake }).growText('harness self-test'), fake, 'a fake passed in wins over the import');
});

test('import forms: named, renamed, namespace, and type-only imports are left alone', async () => {
  const main = await mainHarness({ functions: ['harnessProbe'], mainFile: copy('forms.ts', { bottom: '\nfunction harnessProbe(){return [M.newGame, fitsBag, t, typeof EliteTag];}\n' }) });
  const M = await import('../src/model.ts'), { fits } = await import('../src/storage-slots.ts'), { t } = await import('../src/i18n.ts');
  const [newGame, fitsBag, translate, typeOnly] = main.context().harnessProbe();
  assert.equal(newGame, M.newGame); assert.equal(fitsBag, fits, 'import { fits as fitsBag }'); assert.equal(translate, t);
  assert.match(real, /import type \{EliteTag\}/); assert.equal(typeOnly, 'undefined', 'a type-only import is no value');
  assert.deepEqual(main.resolve().imported, ['M', 'fitsBag', 't']);
});

test('a name the test does not provide fails with one clear message when the code reads it', async () => {
  const main = await mainHarness({ functions: ['harnessProbe', 'harnessWrite'], mainFile: copy('missing.ts', { bottom: '\nfunction harnessProbe(){return selectedItem;}\nfunction harnessWrite(){selectedItem=\'egg\';return harnessProbe();}\n' }) });
  assert.deepEqual(main.resolve().missing, ['selectedItem']);
  const ctx = main.context(); // cutting and wiring do not fail: a renderer names far more of main.ts than one test path runs
  assert.throws(() => ctx.harnessProbe(), error => {
    assert.equal(error.message, 'main-harness: the code cut from main.ts uses "selectedItem", which this test does not provide: it is state or a function of main.ts itself. Pass a fake for it to context({ selectedItem: ... }), or cut it too (functions / variables).');
    return true;
  });
  assert.equal(main.context({ selectedItem: 'carrot' }).harnessProbe(), 'carrot', 'a fake answers it');
  assert.equal(main.context().harnessWrite(), 'egg', 'the code may set its own state first');
  const late = main.context(); late.selectedItem = null; assert.equal(late.harnessProbe(), null, 'and so may the test, after the context is made');
});

test('an import that does not load under Node is reported by name, and only if the code reads it', async () => {
  const main = await mainHarness({ functions: ['harnessProbe', 'growText'], mainFile: copy('broken.ts', { top: "import { nothing } from './no-such-module.ts';\nimport { noSuchExport } from './controls-keys.ts';\n", bottom: '\nfunction harnessProbe(which){return which?nothing:noSuchExport;}\n' }) });
  const ctx = main.context();
  assert.throws(() => ctx.harnessProbe(true), /main-harness: the code cut from main\.ts uses "nothing", which this test does not provide: main\.ts imports it from '\.\/no-such-module\.ts', which does not load under Node/);
  assert.throws(() => ctx.harnessProbe(false), /uses "noSuchExport", .*'\.\/controls-keys\.ts' has no export "noSuchExport"/);
  assert.equal(main.context({ nothing: 1 }).harnessProbe(true), 1);
});

test('browser globals stay plain: a typeof guard works and a missing one is a ReferenceError', async () => {
  const main = await mainHarness({ functions: ['harnessProbe', 'harnessUse'], mainFile: copy('host.ts', { bottom: "\nfunction harnessProbe(){return typeof navigator==='undefined'?'none':'some';}\nfunction harnessUse(){return navigator.onLine;}\n" }) });
  assert.deepEqual(main.resolve().host, ['navigator']);
  assert.equal(main.context().harnessProbe(), 'none'); assert.throws(() => main.context().harnessUse(), { name: 'ReferenceError' });
  assert.equal(main.context({ navigator: { onLine: true } }).harnessUse(), true);
});

test('cutting: variables, statements, slices, later statements, extra code, followed helpers and env values', async () => {
  const bottom = `
const HARNESS_WORDS=['a','b'];
function harnessOuter(){return harnessInner()+HARNESS_WORDS.length;}
function harnessInner(){return harnessFake()+1;}
function harnessFake(){return 100;}
harnessLog.push('statement '+import.meta.env.VITE_HARNESS+' '+import.meta.env.VITE_OTHER);
harnessLog.push('later');
/*slice-from*/function harnessSliced(){return 'sliced';}/*slice-to*/
`;
  const mainFile = copy('cutting.ts', { bottom });
  const main = await mainHarness({ mainFile, functions: ['harnessOuter', 'harnessGone'], optional: ['harnessGone'], follow: true, followExcept: ['harnessFake'], variables: ['HARNESS_WORDS'],
    statements: ["harnessLog.push('statement"], later: { more: "harnessLog.push('later" }, slices: [{ from: '/*slice-from*/', to: '/*slice-to*/' }],
    extra: ({ fn }) => `function harnessExtra(){return ${JSON.stringify(fn('harnessFake').length)};}`, env: { VITE_HARNESS: 'on' } });
  assert.equal(main.pieces.length, 5, 'one variable, two functions (one followed), one statement, one slice');
  const harnessLog = [], ctx = main.context({ harnessLog, harnessFake: () => 1 });
  assert.equal(ctx.harnessOuter(), 4, 'the followed helper was cut, the excepted one is the fake');
  assert.equal(ctx.harnessSliced(), 'sliced'); assert.equal(ctx.harnessExtra(), 'function harnessFake(){return 100;}'.length);
  assert.deepEqual(harnessLog, ['statement on undefined']); main.run(ctx, 'more'); assert.deepEqual(harnessLog, ['statement on undefined', 'later']);
  // A fake wins over a cut function of the same name too.
  const both = await mainHarness({ mainFile, functions: ['harnessOuter', 'harnessInner'], variables: ['HARNESS_WORDS'] });
  assert.equal(both.context({ harnessInner: () => 40 }).harnessOuter(), 42);
});

test('a piece that main.ts no longer has fails at once, by name', async () => {
  await assert.rejects(mainHarness({ functions: ['noSuchRenderer'] }), /main-harness: main\.ts has no top-level function "noSuchRenderer"/);
  await assert.rejects(mainHarness({ variables: ['NO_SUCH_TABLE'] }), /main-harness: main\.ts has no top-level variable "NO_SUCH_TABLE"/);
  await assert.rejects(mainHarness({ statements: ['noSuch.addEventListener('] }), /main-harness: no top-level statement of main\.ts matches noSuch\.addEventListener\(/);
  await assert.rejects(mainHarness({ slices: [{ from: 'no such text in main', to: 'x' }] }), /main-harness: main\.ts no longer contains "no such text in main"/);
});

test('the cut code reads the same clock as the test process', async t => {
  const main = await mainHarness({ functions: ['harnessProbe'], mainFile: copy('clock.ts', { bottom: '\nfunction harnessProbe(){return [Date.now(),new Date().getTime()];}\n' }) });
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2031, 0, 2) });
  assert.deepEqual([...main.context().harnessProbe()], [Date.UTC(2031, 0, 2), Date.UTC(2031, 0, 2)]);
});
