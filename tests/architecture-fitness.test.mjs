// Architecture fitness: a few cheap guards on the shape of the code base (docs/AAA-PLAN.md WP1).
//   1. The two biggest files do not grow past their budget.
//   2. The server closure (the src modules the Node server loads) is the reviewed list, and none of its modules
//      needs a browser to load.
//   3. Tests that read src files as text are on an allow list, so new tests check behaviour instead.
// Each check is a function, run on the real tree and on small fixtures that must fail.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { serverClosure, closureText, runtimeImports } from '../promo/server-closure.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (file, root = ROOT) => readFileSync(join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const temp = mkdtempSync(join(tmpdir(), 'architecture-fitness-'));
after(() => rmSync(temp, { recursive: true, force: true }));
/** A small fake repository: { 'server/a.mjs': text, 'src/b.ts': text }. */
function tree(name, files) {
  const root = join(temp, name);
  for (const [file, text] of Object.entries(files)) { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); }
  return root;
}

// ---- 1. size budgets ------------------------------------------------------------------------------------------
// Bytes as git stores the file (line ends as \n), so a Windows checkout measures the same as CI.
// 2026-11: main.ts is 344,830 and world.ts 266,464. Raise a budget only with a reason in the commit; WP27 lowers them.
const SIZE_BUDGET = { 'src/main.ts': 356_000, 'src/world.ts': 272_000 };
const storedBytes = text => Buffer.byteLength(text.replace(/\r\n/g, '\n'));
function sizeProblems(budget, root = ROOT) {
  return Object.entries(budget).map(([file, most]) => [file, storedBytes(read(file, root)), most]).filter(([, bytes, most]) => bytes > most)
    .map(([file, bytes, most]) => `${file} is ${bytes.toLocaleString('en')} bytes, over its budget of ${most.toLocaleString('en')}: move code into a module of its own instead of adding to it`);
}

test('main.ts and world.ts stay inside their size budget', () => {
  assert.deepEqual(sizeProblems(SIZE_BUDGET), []);
});

test('the size check fails on an oversized file, and counts line ends as git stores them', () => {
  const root = tree('sizes', { 'src/main.ts': 'x'.repeat(356_001), 'src/world.ts': 'y'.repeat(272_000), 'src/crlf.ts': 'ab\r\n'.repeat(100) });
  assert.deepEqual(sizeProblems(SIZE_BUDGET, root), ['src/main.ts is 356,001 bytes, over its budget of 356,000: move code into a module of its own instead of adding to it']);
  assert.deepEqual(sizeProblems({ 'src/crlf.ts': 300 }, root), [], '100 lines of "ab" are 300 bytes with \\n line ends');
  assert.equal(sizeProblems({ 'src/crlf.ts': 299 }, root).length, 1);
});

// ---- 2. the server closure ------------------------------------------------------------------------------------
/** Differences between the closure and the reviewed list, after the listed changes. */
function closureDrift(closure, listed, allow) {
  const expected = new Set(listed.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')));
  for (const { module } of allow.add ?? []) expected.add(module);
  for (const { module } of allow.remove ?? []) expected.delete(module);
  const problems = [];
  for (const [module, via] of closure) if (!expected.has(module)) problems.push(`the server now loads src/${module} (through ${via}), which is not in docs/server-closure.txt: keep it out of the server's reach, or list it under "add" in tests/fixtures/closure-allow.json with the reason`);
  for (const module of expected) if (!closure.has(module)) problems.push(`the server no longer loads src/${module}, which docs/server-closure.txt (or an "add" in tests/fixtures/closure-allow.json) lists: list it under "remove" in tests/fixtures/closure-allow.json with the reason`);
  for (const entry of [...allow.add ?? [], ...allow.remove ?? []]) if (!entry.module || !entry.why) problems.push(`tests/fixtures/closure-allow.json: every entry needs "module" and "why" (${JSON.stringify(entry)})`);
  return problems;
}

/** True inside `typeof name !== 'undefined' && ...`, the true branch of such a `?:`, or the body of such an `if`. */
function guarded(node, file) {
  const tested = condition => new RegExp(`typeof\\s+${node.text}\\s*!==?\\s*['"]undefined['"]`).test(condition.getText(file));
  for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && parent.right === child && tested(parent.left)) return true;
    if (ts.isConditionalExpression(parent) && parent.whenTrue === child && tested(parent.condition)) return true;
    if (ts.isIfStatement(parent) && parent.thenStatement === child && tested(parent.expression)) return true;
  }
  return false;
}

/** Uses of the bare names `document` and `window` that run when the module loads (not inside a function, not a typeof test or behind one). */
function domAtLoad(name, text) {
  const file = ts.createSourceFile(name, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const host = { getSourceFile: wanted => wanted === name ? file : undefined, fileExists: wanted => wanted === name, readFile: () => undefined, getDefaultLibFileName: () => 'lib.d.ts',
    writeFile() {}, getCurrentDirectory: () => '', getCanonicalFileName: f => f, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n' };
  const checker = ts.createProgram([name], { noLib: true, noResolve: true, types: [], target: ts.ScriptTarget.ES2022 }, host).getTypeChecker();
  const found = [];
  const visit = node => {
    // A function body runs later, and so does the initializer of an instance field.
    if (ts.isFunctionLike(node) || ts.isPropertyDeclaration(node) && !node.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) || ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    if (ts.isTypeOfExpression(node) && ts.isIdentifier(node.expression)) return;
    if (ts.isIdentifier(node) && (node.text === 'document' || node.text === 'window')) {
      const parent = node.parent;
      const member = ts.isPropertyAccessExpression(parent) && parent.name === node || ts.isBindingElement(parent) && parent.propertyName === node
        || (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name === node;
      const symbol = member ? null : ts.isShorthandPropertyAssignment(parent) ? checker.getShorthandAssignmentValueSymbol(parent) : checker.getSymbolAtLocation(node);
      if (!member && !symbol?.declarations?.length && !guarded(node, file)) found.push(`${name}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1} uses ${node.text} when the module loads`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** What makes a closure module unfit for the server: it loads three or a stylesheet, or touches the page as it loads. */
function loadProblems(closure, root = ROOT) {
  const problems = [];
  for (const module of closure.keys()) {
    const text = read('src/' + module, root);
    for (const [specifier] of runtimeImports(text)) {
      if (specifier === 'three' || specifier.startsWith('three/')) problems.push(`src/${module} imports '${specifier}': a module the server loads cannot use the renderer`);
      if (/\.css(\?.*)?$/.test(specifier)) problems.push(`src/${module} imports the stylesheet '${specifier}': a module the server loads cannot`);
    }
    problems.push(...domAtLoad('src/' + module, text).map(line => `${line}: a module the server loads cannot (use it inside a function, behind a typeof test)`));
  }
  return problems;
}

test('the server closure is the reviewed list in docs/server-closure.txt', () => {
  const closure = serverClosure(), allow = json('tests/fixtures/closure-allow.json');
  assert.ok(closure.size >= 90, `the closure walk found only ${closure.size} modules: it is broken`);
  assert.deepEqual(closureDrift(closure, read('docs/server-closure.txt'), allow), []);
  if (!(allow.add?.length || allow.remove?.length)) assert.equal(closureText(closure), read('docs/server-closure.txt').replace(/\r\n/g, '\n'), 'docs/server-closure.txt is what `node promo/server-closure.mjs --write` writes');
});

test('no module of the server closure imports three or a stylesheet, or touches document or window as it loads', () => {
  assert.deepEqual(loadProblems(serverClosure()), []);
});

test('the closure checks fail on a fake module that imports three, and on the other things they guard', () => {
  const server = "import { rule } from '../src/rules.ts';\nconst late = () => import('../src/late.ts');\n";
  const clean = { 'server/server.mjs': server, 'src/rules.ts': "import { helper } from './lib/helper.ts';\nimport type { Scene } from 'three';\nimport type { View } from './view.ts';\nexport const rule = helper;\n",
    'src/lib/helper.ts': "import '../side-effect.ts';\nexport * from '../shared.ts';\nexport const helper = 1;\n", 'src/side-effect.ts': '', 'src/shared.ts': 'export const shared = 1;\n', 'src/late.ts': 'export const late = 1;\n',
    'src/view.ts': "import { Scene } from 'three';\nimport './view.css';\n", 'src/unreached.ts': "import 'three';\n" };
  assert.deepEqual(runtimeImports("const a = '/*';\nimport { x } from './real.ts';\nconst b = '*/';\n// import './comment.ts';\nconst c = \"import './string.ts'\";\n"), [['./real.ts', 'import']], 'read from the syntax tree: strings and comments neither hide nor fake an import');
  const root = tree('clean', clean), closure = serverClosure(root);
  assert.deepEqual([...closure], [['late.ts', 'server/server.mjs (dynamic)'], ['lib/helper.ts', 'rules.ts'], ['rules.ts', 'server/server.mjs'], ['shared.ts', 'lib/helper.ts'], ['side-effect.ts', 'lib/helper.ts']],
    'static, dynamic, side-effect and re-export edges are followed; type-only imports are not');
  assert.deepEqual(loadProblems(closure, root), []);
  const listed = closureText(closure);
  assert.deepEqual(closureDrift(closure, listed, {}), []);

  // A closure module that imports three (and a stylesheet).
  const three = tree('three', { ...clean, 'src/shared.ts': "import { Vector3 } from 'three';\nimport { Sky } from 'three/examples/jsm/objects/Sky.js';\nimport './shared.css';\nexport const shared = new Vector3();\n" });
  assert.deepEqual(loadProblems(serverClosure(three), three), ["src/shared.ts imports 'three': a module the server loads cannot use the renderer",
    "src/shared.ts imports 'three/examples/jsm/objects/Sky.js': a module the server loads cannot use the renderer", "src/shared.ts imports the stylesheet './shared.css': a module the server loads cannot"]);

  // A closure module that touches the page as it loads; guarded and deferred uses, and other things called window, are fine.
  const dom = tree('dom', { ...clean, 'src/shared.ts': [
    "const lang = document.documentElement.lang;", "window.addEventListener('resize', () => {});",
    "if (typeof window === 'undefined') { /* Node */ }", "export function later() { return document.title + window.innerWidth; }", "export const arrow = () => window.innerWidth;",
    "export class Meter { window: number = 3; width = window.innerWidth; read(window = 2) { return window + this.window; } }", "export const COMBO = { window: 1.5 }; export const span = COMBO.window;",
    "export class Bad { static width = window.innerWidth; }", "export const shared = 1;",
    "const wide = typeof window !== 'undefined' && window.innerWidth > 900;", "const lang2 = typeof document != 'undefined' ? document.documentElement.lang : 'en';",
    "if (typeof document !== 'undefined') { document.title = 'x'; }", "const wrong = typeof window !== 'undefined' && document.title;", "const other = typeof document === 'undefined' ? document.title : '';"].join('\n') + '\n' });
  assert.deepEqual(loadProblems(serverClosure(dom), dom).map(line => line.split(':').slice(0, 2).join(':')), ['src/shared.ts:1 uses document when the module loads', 'src/shared.ts:2 uses window when the module loads', 'src/shared.ts:8 uses window when the module loads',
    'src/shared.ts:13 uses document when the module loads', 'src/shared.ts:14 uses document when the module loads'], 'a use behind its own typeof test (lines 10 to 12) is fine; behind another name\'s test, or in the wrong branch, it is not');

  // A module that joins the closure unlisted, one that leaves it, and how the allow list settles both.
  const grown = tree('grown', { ...clean, 'src/rules.ts': clean['src/rules.ts'] + "import './view.ts';\n", 'src/lib/helper.ts': 'export const helper = 1;\n' });
  const drift = closureDrift(serverClosure(grown), listed, {});
  assert.equal(drift.length, 3); assert.match(drift[0], /^the server now loads src\/view\.ts \(through rules\.ts\), which is not in docs\/server-closure\.txt/);
  assert.match(drift[1], /^the server no longer loads src\/shared\.ts/); assert.match(drift[2], /^the server no longer loads src\/side-effect\.ts/);
  const why = 'fixture';
  assert.deepEqual(closureDrift(serverClosure(grown), listed, { add: [{ module: 'view.ts', why }], remove: [{ module: 'shared.ts', why }, { module: 'side-effect.ts', why }] }), []);
  assert.equal(closureDrift(closure, listed, { add: [{ module: 'view.ts', why }] }).length, 1, 'an allow entry that is not true is drift too');
  assert.match(closureDrift(serverClosure(grown), listed, { add: [{ module: 'view.ts' }], remove: [{ module: 'shared.ts', why }, { module: 'side-effect.ts', why }] })[0], /every entry needs "module" and "why"/);
});

// ---- 3. tests that read source as text --------------------------------------------------------------------------
/** True for a test that reads a file under src/ as text (also through the main.ts harness), not only imports modules. */
function scansSource(text) {
  const code = text.replace(/\bfrom\s*['"][^'"]*['"]/g, '').replace(/\bimport\(\s*['"`][^'"`]*['"`]\s*\)/g, '').replace(/^\s*import\s*['"][^'"]*['"];?/gm, '');
  return /\bmainHarness\b/.test(code) || /\b(readFile|readFileSync|readdir|readdirSync|createReadStream)\b/.test(code) && /['"`](\.\.?\/)*src\//.test(code);
}
function scanProblems(tests, allow) {
  const allowed = new Set([...allow.today, ...allow.planned]), problems = [];
  for (const [name, text] of tests) if (scansSource(text) && !allowed.has(name)) problems.push(`tests/${name} reads src files as text: check behaviour through imports instead, or (for a scan of the whole source, such as a locale or naming scan) add it to tests/fixtures/source-scan-allow.json`);
  for (const name of allow.today) {
    if (!tests.has(name)) problems.push(`tests/fixtures/source-scan-allow.json lists ${name}, which does not exist: remove or rename the entry`);
    else if (!scansSource(tests.get(name))) problems.push(`tests/${name} no longer reads src files as text: remove it from tests/fixtures/source-scan-allow.json so it stays that way`);
  }
  return problems;
}

test('only the listed tests read src files as text', () => {
  const tests = new Map(readdirSync(join(ROOT, 'tests')).filter(name => /\.test\.(ts|mjs)$/.test(name)).sort().map(name => [name, read('tests/' + name)]));
  assert.deepEqual(scanProblems(tests, json('tests/fixtures/source-scan-allow.json')), []);
});

test('the scan check tells a source-reading test from one that imports modules, and keeps its list honest', () => {
  const imports = "import test from 'node:test';\nimport { readFileSync } from 'node:fs';\nimport * as M from '../src/model.ts';\nconst late = await import('../src/late.ts');\nconst save = readFileSync(new URL('./fixtures/save.json', import.meta.url), 'utf8');\n";
  const reads = "import { readFileSync } from 'node:fs';\nconst source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');\n";
  const lists = "import { readdir, readFile } from 'node:fs/promises';\nconst dir = new URL('../src/', import.meta.url);\nfor (const name of await readdir(dir)) await readFile(new URL(name, dir), 'utf8');\n";
  const harness = "import { mainHarness } from './support/main-harness.mjs';\nconst main = await mainHarness({ functions: ['frame'] });\n";
  assert.deepEqual([imports, reads, lists, harness].map(scansSource), [false, true, true, true]);
  const tests = new Map([['a.test.ts', imports], ['b.test.ts', reads], ['c.test.mjs', harness]]);
  assert.deepEqual(scanProblems(tests, { today: ['b.test.ts', 'c.test.mjs'], planned: ['own-names.test.ts'] }), []);
  assert.match(scanProblems(tests, { today: ['b.test.ts'], planned: [] })[0], /^tests\/c\.test\.mjs reads src files as text/);
  assert.match(scanProblems(tests, { today: ['a.test.ts', 'b.test.ts', 'c.test.mjs'], planned: [] })[0], /^tests\/a\.test\.ts no longer reads src files as text/);
  assert.match(scanProblems(tests, { today: ['b.test.ts', 'c.test.mjs', 'gone.test.ts'], planned: [] })[0], /lists gone\.test\.ts, which does not exist/);
});
