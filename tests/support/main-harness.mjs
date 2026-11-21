// Runs pieces of src/main.ts for real inside node:vm, without a browser or a GPU.
//
// main.ts is one big script, so its panel renderers, frame loop and input routing cannot be imported. Tests cut the
// pieces they need out of the source by name and run them against a stub world. This harness does the wiring that
// every such test used to write by hand:
//
//   const main = await mainHarness({ functions: ['inventory'], variables: ['SHOP_TABS'] });
//   const ctx = main.context({ state, openDialog: (...) => ... });   // one vm context per fixture
//   ctx.inventory();
//
// 1. It cuts the named pieces out of main.ts (functions, top-level variables, statements, text slices).
// 2. It finds the free names of the compiled pieces with the TypeScript compiler API.
// 3. A free name that main.ts imports is imported from the same module (its own import lines are the map), so a new
//    import in main.ts needs no test edit. Stylesheet imports load as empty modules.
// 4. Fakes passed to context() win over everything, also over a cut function of the same name. (A fake with the name
//    of a cut variable is refused: the variable would hide it.)
// 5. A name that is main.ts's own state or function, was not cut and has no fake, fails when the code reads it,
//    with one message that says what to do. (It cannot fail sooner: a renderer names far more of main.ts than one
//    test path runs.) Browser globals that are missing stay plain ReferenceErrors, so `typeof window` guards work.
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// look-shop.ts and others import their stylesheet; Node only needs the code.
registerHooks({ load(url, context, next) { return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); } });

const SRC = new URL('../../src/', import.meta.url);
const BUILTIN = new Set(Object.getOwnPropertyNames(vm.runInNewContext('globalThis')));
const fail = message => { throw new Error('main-harness: ' + message); };

/** Free names of a plain script: identifiers that no declaration inside it binds. */
export function freeNames(code) {
  const name = 'cut.ts', file = ts.createSourceFile(name, code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS); // as TypeScript: a .js file would let `app.x = 1` declare app
  const host = {
    getSourceFile: wanted => wanted === name ? file : undefined, fileExists: wanted => wanted === name, readFile: () => undefined,
    getDefaultLibFileName: () => 'lib.d.ts', writeFile() {}, getCurrentDirectory: () => '', getCanonicalFileName: f => f,
    useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
  };
  const checker = ts.createProgram([name], { noLib: true, noResolve: true, types: [], target: ts.ScriptTarget.ES2022 }, host).getTypeChecker();
  const free = new Set();
  const visit = node => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const label = ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent);
      const member = ts.isPropertyAccessExpression(parent) && parent.name === node
        || (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isGetAccessor(parent) || ts.isSetAccessor(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node
        || ts.isBindingElement(parent) && parent.propertyName === node;
      if (!label && !member) {
        const symbol = ts.isShorthandPropertyAssignment(parent) ? checker.getShorthandAssignmentValueSymbol(parent) : checker.getSymbolAtLocation(node);
        if (!symbol || !symbol.declarations?.length) free.add(node.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const known of ['undefined', 'arguments', 'globalThis']) free.delete(known);
  return free;
}

/** Local value names main.ts imports: name -> { from, imported } (imported is 'default', '*' or the export's name). */
function importMap(ast) {
  const map = new Map();
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || !node.importClause || node.importClause.isTypeOnly) continue;
    const from = node.moduleSpecifier.text, clause = node.importClause;
    if (clause.name) map.set(clause.name.text, { from, imported: 'default' });
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) map.set(bindings.name.text, { from, imported: '*' });
    else if (bindings) for (const item of bindings.elements) if (!item.isTypeOnly) map.set(item.name.text, { from, imported: (item.propertyName ?? item.name).text });
  }
  return map;
}

/** Names main.ts declares at its top level (its own state, functions and classes). */
function ownNames(ast) {
  const names = new Set();
  const bind = name => { if (ts.isIdentifier(name)) names.add(name.text); else for (const item of name.elements) if (!ts.isOmittedExpression(item)) bind(item.name); };
  for (const node of ast.statements) {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) && node.name) names.add(node.name.text);
    else if (ts.isVariableStatement(node)) for (const item of node.declarationList.declarations) bind(item.name);
  }
  return names;
}

/**
 * Cut pieces of main.ts and get ready to run them.
 *
 * spec.functions     names of top-level functions (a missing one fails; `optional` lists names that may be absent)
 * spec.follow        also cut every top-level function those call, transitively, except the names in `followExcept`
 * spec.variables     names of top-level variables (their whole statement is cut)
 * spec.statements    top-level expression statements: a string prefix, a RegExp or (text) => boolean, each must match
 * spec.slices        raw text ranges: { from, to } (both searched as text; `to` after `from`, not included)
 * spec.extra         extra TypeScript appended last: a string, or (main) => string with main = { source, ast, fn }
 * spec.later         { name: selector } statements compiled apart and run on demand with main.run(ctx, name)
 * spec.env           values for import.meta.env.NAME (anything else reads as undefined)
 * spec.mainFile      another copy of main.ts (URL or path); its imports still resolve inside src/
 */
export async function mainHarness(spec = {}) {
  const { functions = [], optional = [], follow = false, followExcept = [], variables = [], statements = [], slices = [], extra = '', later = {}, env = {}, mainFile = new URL('main.ts', SRC) } = spec;
  const source = readFileSync(mainFile, 'utf8');
  const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
  const declared = new Map(ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name).map(node => [node.name.text, node.getText(ast)]));
  const fn = name => declared.get(name) ?? fail(`main.ts has no top-level function "${name}"`);
  const expressions = ast.statements.filter(ts.isExpressionStatement).map(node => node.getText(ast));
  const pick = selector => {
    const test = typeof selector === 'string' ? text => text.startsWith(selector) : selector instanceof RegExp ? text => selector.test(text) : selector;
    const found = expressions.filter(text => test(text));
    return found.length ? found : fail(`no top-level statement of main.ts matches ${selector}`);
  };

  const wanted = new Set(functions.filter(name => declared.has(name) || !optional.includes(name)));
  for (const name of wanted) fn(name);
  if (follow) {
    const skip = new Set(followExcept);
    // Function declarations only: they are hoisted and run nothing until called.
    for (const name of wanted) for (const [, other] of declared.get(name).matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) if (declared.has(other) && !skip.has(other)) wanted.add(other);
  }
  const variableText = variables.map(name => (ast.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(ast) === name))
    ?? fail(`main.ts has no top-level variable "${name}"`)).getText(ast));
  const sliceText = slices.map(({ from, to }) => {
    const start = source.indexOf(from); if (start < 0) fail(`main.ts no longer contains ${JSON.stringify(from)}`);
    const end = source.indexOf(to, start); if (end < 0) fail(`main.ts no longer contains ${JSON.stringify(to)} after ${JSON.stringify(from)}`);
    return source.slice(start, end);
  });
  const pieces = [...variableText, ...[...wanted].map(fn), ...statements.flatMap(pick), ...sliceText];
  const extraText = typeof extra === 'function' ? extra({ source, ast, fn }) : extra;

  const compile = text => ts.transpileModule(text.replace(/\bimport\.meta\.env\.([A-Za-z_]\w*)/g, (_all, key) => key in env ? JSON.stringify(env[key]) : 'undefined'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const code = compile([...pieces, extraText].join('\n'));
  const laterCode = Object.fromEntries(Object.entries(later).map(([name, selector]) => [name, compile(pick(selector).join('\n'))]));

  const free = freeNames([code, ...Object.values(laterCode)].join('\n'));
  const imports = importMap(ast), own = ownNames(ast), bindings = new Map(), broken = new Map(), modules = new Map();
  for (const name of free) {
    const entry = imports.get(name); if (!entry) continue;
    if (!modules.has(entry.from)) modules.set(entry.from, await import(/^\.{1,2}\//.test(entry.from) ? new URL(entry.from, SRC).href : entry.from).then(module => ({ module }), error => ({ error })));
    const { module, error } = modules.get(entry.from);
    if (error) broken.set(name, `main.ts imports it from '${entry.from}', which does not load under Node (${String(error.message).split('\n')[0]})`);
    else if (entry.imported !== '*' && !(entry.imported in module)) broken.set(name, `'${entry.from}' has no export "${entry.imported}"`);
    else bindings.set(name, entry.imported === '*' ? module : module[entry.imported]);
  }
  const cutNames = wanted;
  const cutVariables = new Set();
  const bindNames = name => { if (ts.isIdentifier(name)) cutVariables.add(name.text); else for (const item of name.elements) if (!ts.isOmittedExpression(item)) bindNames(item.name); };
  for (const node of ast.statements) if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => variables.includes(item.name.getText(ast)))) for (const item of node.declarationList.declarations) bindNames(item.name);

  /** How each free name of the cut code resolves with these fakes (for a test that wants to look, and for messages). */
  function resolve(fakes = {}) {
    const report = { fake: [], imported: [], builtin: [], missing: [], host: [], redundant: [], unused: [] };
    for (const name of [...free].sort()) (Object.hasOwn(fakes, name) ? report.fake : bindings.has(name) ? report.imported : BUILTIN.has(name) ? report.builtin : own.has(name) || broken.has(name) ? report.missing : report.host).push(name);
    // Fakes that only repeat what the harness would import anyway, and fakes the cut code never names.
    for (const name of Object.keys(fakes)) if (!free.has(name)) report.unused.push(name); else if (bindings.get(name) === fakes[name]) report.redundant.push(name);
    return report;
  }

  /** A vm context with the cut code already run. `fakes` becomes the context's global object and may be changed later. */
  function context(fakes = {}) {
    for (const [name, value] of bindings) if (!Object.hasOwn(fakes, name)) fakes[name] = value;
    // One clock: the cut code reads the test process's Date (mock timers, tests/support/clock-shift.mjs), as the imported modules do.
    if (!Object.hasOwn(fakes, 'Date')) Object.defineProperty(fakes, 'Date', { value: Date, writable: true, enumerable: false, configurable: true });
    const missing = [...free].filter(name => !Object.hasOwn(fakes, name) && !BUILTIN.has(name) && (own.has(name) || broken.has(name)));
    const trap = name => fail(`the code cut from main.ts uses "${name}", which this test does not provide: ${broken.get(name) ?? 'it is state or a function of main.ts itself'}. Pass a fake for it to context({ ${name}: ... }), or cut it too (functions / variables).`);
    // A cut variable is a let/const of the script: it would hide a fake of the same name without a word.
    for (const name of cutVariables) if (Object.hasOwn(fakes, name)) fail(`"${name}" is both a cut variable and a fake: the cut one would be used. Drop it from \`variables\` to fake it, or drop the fake.`);
    const kept = [...cutNames].filter(name => Object.hasOwn(fakes, name)).map(name => [name, fakes[name]]);
    const ctx = vm.createContext(fakes);
    // The traps sit on a prototype put under the context's global: a throwing getter on the global itself is
    // swallowed by node:vm and ends as a bare ReferenceError. Assigning the name (from the code or the test) clears it.
    vm.runInContext(`(names, trap) => { const traps = Object.create(Object.getPrototypeOf(globalThis));
      for (const name of names) Object.defineProperty(traps, name, { configurable: true, get() { trap(name); }, set(value) { Object.defineProperty(globalThis, name, { value, writable: true, enumerable: true, configurable: true }); } });
      Object.setPrototypeOf(globalThis, traps); }`, ctx)(missing, trap);
    vm.runInContext(code, ctx, { filename: 'main.ts (cut)' });
    for (const [name, value] of kept) ctx[name] = value; // a fake wins over a cut function of the same name
    return ctx;
  }

  return {
    source, ast, fn, pieces, code, free, context, resolve,
    /** Run one of the `later` statements in a context made by context(). */
    run(ctx, name) { return vm.runInContext(laterCode[name] ?? fail(`no later statement "${name}"`), ctx, { filename: `main.ts (${name})` }); },
  };
}
