/**
 * Short first lists (docs/FIX-PLAN.md 4.5): in the seed picker, the outfitters and the journal's story chapter the rows
 * the player cannot use yet fold into one line ("7 more unlock from level 3", "6 more steps in this chapter"); a tap
 * on that line shows them all, and they stay open for the rest of the visit. Works on the rendered panel, so the
 * panels themselves (main.ts) are unchanged; the strings' Vietnamese is in locales/vi-first.ts.
 */
import { t } from './i18n.ts';

interface Rule { row: string; locked(row: Element): boolean; label(n: number, level: number): string }
const levelIn = (row: Element, sel: string) => { const m = /(\d+)/.exec(row.querySelector(sel)?.textContent ?? ''); return m ? Number(m[1]) : NaN; };
export const FOLD_RULES: Record<string, Rule> = {
  plant: { row: '.crop-list > .crop-row', locked: r => r.classList.contains('locked'), label: (n, level) => t('{n} more unlock from level {level}', { n, level }) },
  // In the outfitters a row also waits while its materials are short (a red chip): only what can be bought soon stays in view.
  shop: { row: '.shop-item', locked: r => !!r.querySelector('.chip-gate,.chip-miss'), label: n => t('{n} more need a higher level or materials', { n }) },
  quests: { row: '.quest-list > .quest-row.locked', locked: () => true, label: n => t('{n} more steps in this chapter', { n }) },
};
const LEVEL_OF: Record<string, string> = { plant: '.chip-lock', shop: '.chip-gate' };
/** Panels unfolded by a tap during this visit. */
const unfolded = new Set<string>();
export const resetFolds = () => unfolded.clear();

/** Folds the locked rows of the panel `type` drawn in `body`; returns how many rows were folded. */
export function foldLists(type: string, body: ParentNode & Element): number {
  const rule = FOLD_RULES[type]; if (!rule) return 0;
  body.querySelectorAll('.fold-more').forEach(b => b.remove());
  body.querySelectorAll('.fold-hidden').forEach(r => r.classList.remove('fold-hidden'));
  const rows = Array.from(body.querySelectorAll(rule.row)).filter(r => rule.locked(r));
  if (rows.length < 2 || unfolded.has(type)) return 0; // one locked row is not worth a fold
  for (const r of rows) r.classList.add('fold-hidden');
  // One fold line per shop group (or one for the whole list), after the group's last row.
  const groups = new Map<Element | null, Element[]>();
  for (const r of rows) { const g = r.closest('.item-group'); groups.set(g, [...(groups.get(g) ?? []), r]); }
  for (const [group, folded] of groups) {
    const levels = folded.map(r => LEVEL_OF[type] ? levelIn(r, LEVEL_OF[type]) : NaN).filter(Number.isFinite), level = levels.length ? Math.min(...levels) : 0;
    const more = document.createElement('button');
    more.type = 'button'; more.className = 'fold-more'; more.setAttribute('aria-expanded', 'false');
    more.textContent = `🔒 ${rule.label(folded.length, level)} ▾`;
    more.addEventListener('click', event => {
      event.stopPropagation(); unfolded.add(type);
      body.querySelectorAll('.fold-hidden').forEach(r => r.classList.remove('fold-hidden')); body.querySelectorAll('.fold-more').forEach(b => b.remove());
    });
    const last = folded[folded.length - 1];
    if (group) last.parentElement!.append(more); else last.after(more);
  }
  return rows.length;
}
