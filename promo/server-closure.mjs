// The server closure: every src module the Node server loads, directly or through other src modules.
// Rules there run for every online player, so a change to one of these files must keep rule results the same
// (docs/AAA-PLAN.md section 2), and none of them may need a browser to load.
//
//   node promo/server-closure.mjs                 print the list
//   node promo/server-closure.mjs --write         write it to docs/server-closure.txt
//   node promo/server-closure.mjs world.ts hud.ts say whether the server reaches these, and through which file
//
// tests/architecture-fitness.test.mjs compares the list with docs/server-closure.txt and checks each module.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** Imports of one source text that load a module at run time: [specifier, kind]. `import type` loads nothing. */
export function runtimeImports(text) {
  const found = [], code = strip(text);
  for (const m of code.matchAll(/^\s*import\s+(type\s+)?[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gm)) if (!m[1]) found.push([m[2], 'import']);
  for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.push([m[1], 'import']);
  for (const m of code.matchAll(/^\s*export\s+(type\s+)?[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gm)) if (!m[1]) found.push([m[2], 'export']);
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g)) found.push([m[1], 'dynamic']);
  return found;
}

/**
 * Map of src module (path inside src/, forward slashes) -> the file that first reaches it.
 * It starts at every server/*.mjs (static and dynamic imports) and follows static imports and re-exports inside src.
 */
export function serverClosure(root = ROOT) {
  const seen = new Map(), queue = [];
  const inside = (from, specifier) => { const rel = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier)); return rel.startsWith('src/') ? rel.slice(4) : null; };
  for (const file of fs.readdirSync(path.join(root, 'server')).filter(name => name.endsWith('.mjs')).sort())
    for (const [specifier, kind] of runtimeImports(fs.readFileSync(path.join(root, 'server', file), 'utf8'))) {
      const rel = specifier.startsWith('.') && inside('server/' + file, specifier);
      if (rel) queue.push([rel, 'server/' + file + (kind === 'dynamic' ? ' (dynamic)' : '')]);
    }
  while (queue.length) {
    const [rel, via] = queue.shift(); if (seen.has(rel)) continue; seen.set(rel, via);
    const file = path.join(root, 'src', rel); if (!fs.existsSync(file)) continue;
    for (const [specifier, kind] of runtimeImports(fs.readFileSync(file, 'utf8'))) {
      const next = kind !== 'dynamic' && specifier.startsWith('.') && inside('src/' + rel, specifier);
      if (next && /\.(ts|mts|mjs|js)$/.test(next)) queue.push([next, rel]); // code only: a stylesheet is no module of the closure (the fitness test refuses it)
    }
  }
  return new Map([...seen].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

/** The text of docs/server-closure.txt for a closure: one module per line, sorted. */
export const closureText = closure => [...closure.keys()].join('\n') + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), closure = serverClosure();
  if (args.includes('--write')) { fs.writeFileSync(path.join(ROOT, 'docs', 'server-closure.txt'), closureText(closure)); console.log(`docs/server-closure.txt: ${closure.size} modules`); }
  else if (args.length) for (const name of args) console.log(name, closure.has(name) ? 'YES via ' + closure.get(name) : 'no');
  else { console.log(`the server reaches ${closure.size} src modules`); console.log([...closure.keys()].join('\n')); }
}
