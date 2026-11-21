// Build check: no built chunk may wait on itself through a top-level await.
// src/i18n.ts awaits the Vietnamese pack at module top level, so a Vietnamese player has the phrases before the first screen.
// If the built vi-pack chunk statically imports (directly or through others) the chunk that holds that await, the browser
// waits for each to finish before the other and the page stays blank for good. The dev server is not affected, so only a
// check of the build sees it. Run after a build:   node promo/await-cycle.mjs        (DIST=<folder> for another build)
// The Pages build runs it; tests/build-await-cycle.test.mjs runs it on fixtures and on dist/ when there is one.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

/** What one chunk's text does: { imports: static specifiers, dynamic: import() specifiers, awaits: has a top-level await }. */
export function chunkFacts(text, name = 'chunk.js') {
  const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS), imports = [], dynamic = [];
  let awaits = false;
  const visit = (node, top) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) { imports.push(node.moduleSpecifier.text); return; }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) dynamic.push(node.arguments[0].text);
    if (top && (ts.isAwaitExpression(node) || (ts.isForOfStatement(node) && node.awaitModifier))) awaits = true;
    const inner = top && !ts.isFunctionLike(node);
    ts.forEachChild(node, child => visit(child, inner));
  };
  visit(file, true);
  return { imports, dynamic, awaits };
}

/**
 * Problems in a set of chunks, as sentences. `chunks` maps a file name to its text; specifiers resolve relative to the file.
 * A chunk with a top-level await must not be reachable by static imports from a chunk it loads with import(): that is the
 * shape that cannot finish. (It is stricter than needed when the import() is not the awaited one, which is the safe side.)
 */
export function awaitCycles(chunks) {
  const facts = new Map([...chunks].map(([name, text]) => [name, chunkFacts(text, name)]));
  const resolve = (from, specifier) => specifier.startsWith('.') ? path.posix.join(path.posix.dirname(from), specifier) : null;
  /** The static import path from `start` to `target`, or null. */
  const route = (start, target) => {
    const seen = new Set([start]), queue = [[start]];
    while (queue.length) {
      const trail = queue.shift(), at = trail.at(-1);
      if (at === target) return trail;
      for (const specifier of facts.get(at)?.imports ?? []) { const next = resolve(at, specifier); if (next && !seen.has(next)) { seen.add(next); queue.push([...trail, next]); } }
    }
    return null;
  };
  const problems = [];
  for (const [name, fact] of facts) if (fact.awaits) for (const specifier of new Set(fact.dynamic)) {
    const lazy = resolve(name, specifier), trail = lazy && route(lazy, name);
    if (trail) problems.push(`${name} has a top-level await and loads ${lazy} with import(), but ${trail.join(' imports ')}: the two wait on each other and the page never starts. Keep what the lazy chunk imports out of the chunk that awaits it (manualChunk in vite.config.ts).`);
  }
  return problems;
}

/** The script chunks of a build folder, as awaitCycles wants them. */
export function builtChunks(dist) {
  const assets = path.join(dist, 'assets');
  return new Map(readdirSync(assets).filter(file => /\.m?js$/.test(file)).map(file => [`assets/${file}`, readFileSync(path.join(assets, file), 'utf8')]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = path.resolve(process.env.DIST || 'dist');
  if (!existsSync(path.join(dist, 'assets'))) { console.error(`No build in ${dist}. Run npm run build:pages first.`); process.exit(2); }
  const chunks = builtChunks(dist), problems = awaitCycles(chunks);
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exit(1);
  console.log(`No top-level-await cycle in ${chunks.size} chunks.`);
}
