// Every English phrase the Village Almanac can show, gathered from its sources: the templates handed to msg(...) and
// t(...) in the rule and page modules, and the titles, notes and labels of the product map. The Vietnamese coverage
// test asks for a translation of each one.
import { readFileSync } from 'node:fs';
import { productGraph } from '../../src/insight-graph.ts';
import { ADVENTURE, PRAISE_LINES, REPORT_VILLAGE_LINES, SCORE_LABEL, STRENGTH, TREND_LABEL } from '../../src/insight-rules.ts';

const read = (name: string) => readFileSync(new URL(`../../src/${name}`, import.meta.url), 'utf8');
const unquote = (raw: string) => raw.replace(/\\(['"\\])/g, '$1');
/** String literals that are the first argument of msg( / t( / ui.t( / u.t(, in single or double quotes. */
function literals(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/\b(?:msg|t)\(\s*'((?:[^'\\\n]|\\.)*)'/g)) out.push(unquote(m[1]));
  for (const m of source.matchAll(/\b(?:msg|t)\(\s*"((?:[^"\\\n]|\\.)*)"/g)) out.push(unquote(m[1]));
  // Ternaries inside a call: t(cond ? 'a' : 'b'...)
  for (const m of source.matchAll(/\bt\([^()'"]*\?\s*'((?:[^'\\\n]|\\.)*)'\s*:\s*'((?:[^'\\\n]|\\.)*)'/g)) out.push(unquote(m[1]), unquote(m[2]));
  for (const m of source.matchAll(/\bt\([^()'"]*\?\s*'((?:[^'\\\n]|\\.)*)'\s*:\s*[^()'"]*\?\s*'((?:[^'\\\n]|\\.)*)'\s*:\s*'((?:[^'\\\n]|\\.)*)'/g)) out.push(unquote(m[1]), unquote(m[2]), unquote(m[3]));
  return out;
}
export function almanacPhrases(): string[] {
  const out = new Set<string>();
  for (const file of ['insight-rules.ts', 'insight-pages.ts', 'insight.ts', 'disguise-ui.ts']) for (const text of literals(read(file))) out.add(text);
  for (const m of read('insight-pages.ts').matchAll(/const [A-Z_]+ = '((?:[^'\\\n]|\\.)*)';/g)) out.add(unquote(m[1]));
  for (const text of [...PRAISE_LINES, ...REPORT_VILLAGE_LINES, ...Object.values(ADVENTURE), ...Object.values(STRENGTH), ...Object.values(SCORE_LABEL), ...Object.values(TREND_LABEL), 'The Village Almanac', 'THE BIG PICTURE']) out.add(text);
  for (const [, , label] of [['home', '', 'Overview'], ['map', '', 'Product map'], ['trend', '', 'Trend'], ['report', '', 'Report card'], ['disguises', '', 'Disguises']]) out.add(label);
  for (const chapter of productGraph().chapters) { out.add(chapter.title); out.add(chapter.lead);
    for (const group of chapter.groups) { out.add(group.title); if (group.note) out.add(group.note); for (const row of group.rows) if (row.label) out.add(row.label); } }
  // A template that is nothing but a parameter needs no words.
  return [...out].filter(text => text.trim() && !/^(\{\w+\}|[\d\s×·+%.ϟ→-])*$/.test(text));
}
