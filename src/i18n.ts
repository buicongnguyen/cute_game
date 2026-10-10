export type Language = 'en' | 'vi';
export const LANGUAGE_KEY = 'cute-game-language';
// The Vietnamese phrases (about 250 KB of source) are a separate chunk: English players never download them, Vietnamese
// players load them before the first screen (the top-level await below) or when they switch language (switchLanguage).
let vi: Record<string, string> = Object.create(null);
let folded = new Map<string, string>();
let templates: Rule[] = [];
let viLoading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const cache = new Map<string, string>();
function initialLanguage(): Language {
  try { const saved = globalThis.localStorage?.getItem(LANGUAGE_KEY); if (saved === 'en' || saved === 'vi') return saved; } catch { /* Storage is optional. */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}
let language: Language = initialLanguage();
function documentLanguage() { if (typeof document !== 'undefined') document.documentElement.lang = language; }
documentLanguage();
export function getLanguage(): Language { return language; }
/** Loads the Vietnamese phrases (once); the page re-renders through onLanguageChange when they arrive after a switch. */
export function loadVietnamese(): Promise<void> {
  viLoading ??= import('./locales/vi-pack.ts').then(({ VI_PACK, VI_TIME_UNITS }) => {
    vi = VI_PACK; folded = new Map(Object.entries(VI_PACK).map(([key, value]) => [key.toLowerCase(), value])); templates = compileTemplates(VI_PACK, VI_TIME_UNITS); cache.clear();
    if (language === 'vi') for (const listener of listeners) listener();
  }, error => { viLoading = null; throw error; });
  return viLoading;
}
/** Switches language once its phrases are in memory, so the page never shows a half-translated flash. */
export async function switchLanguage(next: Language) {
  if (next === 'vi') { try { await loadVietnamese(); } catch { /* Offline and uncached: setLanguage still switches; the phrases follow when the load succeeds. */ } }
  setLanguage(next);
}
export function setLanguage(next: Language) {
  if (next !== 'en' && next !== 'vi') return;
  try { globalThis.localStorage?.setItem(LANGUAGE_KEY, next); } catch { /* Keep playing without storage. */ }
  if (language === next) { documentLanguage(); return; }
  language = next; cache.clear(); documentLanguage();
  if (next === 'vi' && !viLoading) void loadVietnamese().catch(() => { /* English text stays until a later switch retries. */ });
  for (const listener of listeners) listener();
}
export function onLanguageChange(callback: () => void): () => void { listeners.add(callback); return () => { listeners.delete(callback); }; }
type Params = Record<string, string | number>;
const interpolate = (value: string, params: Params) => value.replace(/\{(\w+)\}/g, (token, key) => Object.hasOwn(params, key) ? String(params[key]) : token);
const quoteRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Template matching keeps legacy generated labels localizable. Explicit parameters are
// preferred for player text; their values are never translated or interpreted as markup.
type Rule = { regex: RegExp; names: string[]; target: string; specificity: number };
const compileTemplates = (table: Record<string, string>, units: string): Rule[] => Object.entries(table).filter(([key]) => /\{\w+\}/.test(key)).map(([source, target]) => {
  const names: string[] = [], parts: string[] = []; let cursor = 0;
  for (const match of source.matchAll(/\{(\w+)\}/g)) {
    const numeric = /^(amount|count|seconds|minutes|hours|days|level|ratio|cost|price|total|current|max|progress|target|chapter|rank|step|percent|defense|hp|xp|energy|stars|index|empty|beds|caught|all|need|have|gain)$/i.test(match[1]);
    const time = /^(time|interval)$/i.test(match[1]);
    const capture = numeric ? '([+−-]?\\d+(?:[.,]\\d+)*)' : time ? '(\\d+(?:[.,]\\d+)?(?:\\s*(?:' + units + ')(?:\\s+\\d+(?:[.,]\\d+)?\\s*(?:' + units + '))*)?)' : '(.+?)';
    parts.push(quoteRegex(source.slice(cursor, match.index)), capture); names.push(match[1]); cursor = match.index! + match[0].length;
  }
  parts.push(quoteRegex(source.slice(cursor)));
  return { regex: new RegExp('^' + parts.join('') + '$', 'iu'), names, target, specificity: source.replace(/\{\w+\}/g, '').length };
}).filter(rule => rule.specificity > 2).sort((a, b) => b.specificity - a.specificity);
function translate(source: string, depth = 0): string {
  if (!source || depth > 8) return source;
  const core = source.trim(); if (!core) return source;
  const prefix = source.slice(0, source.indexOf(core)), suffix = source.slice(source.indexOf(core) + core.length);
  const exact = vi[core] ?? folded.get(core.toLowerCase());
  if (exact !== undefined) return prefix + exact + suffix;
  for (const rule of templates) {
    const match = rule.regex.exec(core); if (!match) continue;
    const params: Params = {};
    rule.names.forEach((key, index) => { params[key] = /^(name|user|username|owner|player|code)$/i.test(key) ? match[index + 1] : translate(match[index + 1], depth + 1); });
    return prefix + interpolate(rule.target, params) + suffix;
  }
  // Decorations and separators are layout, not prose. Translate each known phrase,
  // leaving unknown text intact; no substring replacement of arbitrary player text.
  // " · " joins whole sentences, so split there first: stripping the final "." of
  // "3 of 9 worlds discovered · Click the ground…" would leave the last phrase unmatched.
  if (/\s[·•]\s/.test(core)) {
    const joined = core.split(/(\s+[·•]\s+)/).map((piece, i) => i % 2 ? piece : translate(piece, depth + 1)).join('');
    if (joined !== core) return prefix + joined + suffix;
  }
  const decorated = core.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
  if (decorated && (decorated[1] || decorated[3]) && decorated[2]) {
    // First remove only one edge. Parentheses and punctuation can belong to a
    // template (e.g. "➕ Expand garden (ϟ 60)") and must survive icon handling.
    if (decorated[1]) {
      const rest = decorated[2] + decorated[3], changed = translate(rest, depth + 1);
      if (changed !== rest) return prefix + decorated[1] + changed + suffix;
      // An icon then a signed amount ("✨ +14 fuel"): keep the sign with its template.
      const gap = decorated[1].search(/\s\S+$/);
      if (gap >= 0) {
        const lead = decorated[1].slice(0, gap + 1), signed = core.slice(lead.length), moved = translate(signed, depth + 1);
        if (moved !== signed) return prefix + lead + moved + suffix;
      }
    }
    if (decorated[3]) {
      const rest = decorated[1] + decorated[2], changed = translate(rest, depth + 1);
      if (changed !== rest) return prefix + changed + decorated[3] + suffix;
    }
    const middle = translate(decorated[2], depth + 1);
    if (middle !== decorated[2]) return prefix + decorated[1] + middle + decorated[3] + suffix;
  }
  const pieces = core.split(/(\s+[·•]\s+|,\s+)/);
  if (pieces.length > 1) return prefix + pieces.map((piece, i) => i % 2 ? piece : translate(piece, depth + 1)).join('') + suffix;
  return source;
}
export function t(source: string, params?: Params): string {
  if (language === 'en') return params ? interpolate(source, params) : source;
  if (params) return interpolate(vi[source] ?? folded.get(source.toLowerCase()) ?? source, params);
  const cached = cache.get(source); if (cached !== undefined) return cached;
  const result = translate(source); if (cache.size > 3000) cache.clear(); cache.set(source, result); return result;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const decode = (text: string) => text.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, entity => {
  const named: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': '\u00a0' };
  if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
  const hex = entity[2].toLowerCase() === 'x', point = parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
  return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
});
const SKIP_TAGS = new Set(['script', 'style', 'code', 'kbd', 'textarea']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt'];
/** Localize trusted application templates, preserving every ID, value and data-* attribute.
 * User-generated text belongs in a data-i18n-skip element, or an explicit t() parameter.
 * This is not a sanitizer: interpolated values must still be HTML-escaped by callers.
 */
export function localizeHtml(markup: string): string {
  if (language === 'en') return markup;
  const stack: { tag: string; skip: boolean }[] = [];
  return markup.replace(/<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g, token => {
    if (!token.startsWith('<')) {
      if (stack.at(-1)?.skip) return token;
      const original = decode(token), translated = t(original); return translated === original ? token : escapeHtml(translated);
    }
    const close = token.match(/^<\/\s*([\w-]+)/);
    if (close) { const tag = close[1].toLowerCase(); for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; } return token; }
    const opening = token.match(/^<([\w-]+)/); if (!opening) return token;
    const tag = opening[1].toLowerCase(), skip = !!stack.at(-1)?.skip || SKIP_TAGS.has(tag) || /\sdata-i18n-skip(?:[\s=>]|$)|\stranslate\s*=\s*["']no["']/i.test(token);
    if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(token)) stack.push({ tag, skip });
    if (skip) return token;
    return token.replace(/(\s(?:title|aria-label|placeholder|alt)\s*=\s*)(["'])([\s\S]*?)\2/gi, (all, lead, quote, value) => {
      const original = decode(value), translated = t(original); return original === translated ? all : lead + quote + escapeHtml(translated) + quote;
    });
  });
}

/** Bind the initial, static shell without replacing DOM nodes, inputs or game state.
 * Dynamic panels use localizeHtml when they render; callers refresh HUD values after this.
 */
export function bindLanguage(root: Element): () => void {
  const entries: { node: Node; attr?: string; source: string }[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) { if (node.textContent?.trim()) entries.push({ node, source: node.textContent }); return; }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (SKIP_TAGS.has(el.tagName.toLowerCase()) || el.hasAttribute('data-i18n-skip') || el.getAttribute('translate') === 'no') return;
    for (const attr of ATTRIBUTES) { const source = el.getAttribute(attr); if (source) entries.push({ node, attr, source }); }
    for (const child of Array.from(el.childNodes)) walk(child);
  };
  walk(root);
  const refresh = () => { for (const entry of entries) if (root.contains(entry.node)) {
    if (entry.attr) (entry.node as Element).setAttribute(entry.attr, t(entry.source)); else entry.node.textContent = t(entry.source);
  } };
  refresh(); return refresh;
}
// A Vietnamese player waits for the phrases before the first screen is drawn. Node (tests, tools) has no window and keeps the
// old behaviour: the phrases are there when the module is.
if (language === 'vi' || typeof window === 'undefined') { try { await loadVietnamese(); } catch { /* The game starts untranslated rather than not at all. */ } }
