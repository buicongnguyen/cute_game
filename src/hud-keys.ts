// The desktop controls guide (bottom left): the CURRENT keyboard layout from Settings, folding to a ⌨️ chip.
// Choice: open for a new player; once they have pressed 120 game keys (moves, attacks, skills, shortcuts; counted
// across sessions on this device) it folds itself once, because by then the keys are learned. Opening or folding it by
// hand is final: the guide never moves on its own again. Remembered per device (localStorage), never in the save.
import { eatKey, keyboardBindings } from './gameplay-controls.ts';
import { keyLabel, type KeyAction } from './controls-keys.ts';
import { t } from './i18n.ts';

export const KEYS_GUIDE_KEY = 'zoo-garden-keys-guide';
export const KEYS_LEARNED = 120;
export interface KeysGuideMemory { mode: 'auto' | 'open' | 'closed'; uses: number }
export function readGuide(store: Pick<Storage, 'getItem'> | null): KeysGuideMemory {
  try { const raw = JSON.parse(store?.getItem(KEYS_GUIDE_KEY) ?? 'null'); if (raw && ['auto', 'open', 'closed'].includes(raw.mode)) return { mode: raw.mode, uses: Math.max(0, Number(raw.uses) || 0) }; } catch { /* private mode or bad JSON: start fresh */ }
  return { mode: 'auto', uses: 0 };
}
/** Folded? 'auto' folds once the keys are learned. */
export const guideFolded = (m: KeysGuideMemory) => m.mode === 'closed' || m.mode === 'auto' && m.uses >= KEYS_LEARNED;

const key = (k: string) => `<kbd>${k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k}</kbd>`;
/**
 * The guide's rows for a layout ('classic' arrows + QWER, or 'wasd' + JKL;). `space`: what the Space key does with jumping
 * on (Settings); then F and N attack, there are four skill keys (the fourth casts the weapon's special), and the power strike is the attack
 * key held. Without it the guide is the one from before jumping.
 */
export function keysGuideHtml(layout: string | undefined, folded: boolean, space?: 'jump' | 'attack', custom?: Record<KeyAction, string[]>) {
  const b = keyboardBindings(layout), wasd = layout !== 'classic';
  // Custom keys (Settings > Controls > Keys): the same rows, each with the key that does it now.
  if (custom) return guideMarkup(folded, [
    [t('Move'), wasd ? ['W', 'A', 'S', 'D'].map(key).join('') : ['↑', '←', '↓', '→'].map(key).join('')],
    ...(space && custom.jump.length ? [[t('Jump'), custom.jump.map(k => key(keyLabel(k))).join('')] as [string, string]] : []),
    [t('Basic attack'), [...custom.attack, ...(space ? custom.interact : [])].map(k => key(keyLabel(k))).join('')],
    [t('Skills'), (['skill0', 'skill1', 'skill2', 'skill3'] as const).map(a => custom[a][0] ? key(keyLabel(custom[a][0])) : '').join('')],
    ...(space ? [[t('Power strike'), `<i>${t('hold')}</i>` + [...custom.interact, ...custom.attack.filter(k => k !== ' ')].map(k => key(keyLabel(k))).join('')] as [string, string]] : []),
    [t('Interact'), custom.interact.map(k => key(keyLabel(k))).join('')],
    [t('Journal'), key(b.journal)], [t('Backpack'), key('i')], [t('Eat'), custom.eat.map(k => key(keyLabel(k))).join('')], [t('Map'), key('m')],
  ]);
  const rows: [string, string][] = [
    [t('Move'), wasd ? ['W', 'A', 'S', 'D'].map(key).join('') : ['↑', '←', '↓', '→'].map(key).join('')],
    ...(space ? [[t('Jump'), key(space === 'jump' ? ' ' : 'Shift')], [t('Basic attack'), (space === 'jump' ? '' : key(' ')) + key('f') + key('n')]] as [string, string][] : [[t('Basic attack'), key(' ')] as [string, string]]), [t('Skills'), b.skills.map(key).join('')], ...(space ? [[t('Power strike'), `<i>${t('hold')}</i>` + key('f') + key('n')] as [string, string]] : []), [t('Interact'), key('f')],
    [t('Journal'), key(b.journal)], [t('Backpack'), key('i')], [t('Eat'), key(eatKey(!!space))], [t('Map'), key('m')],
  ];
  return guideMarkup(folded, rows);
}
function guideMarkup(folded: boolean, rows: [string, string][]) {
  const label = folded ? t('Show keyboard controls') : t('Hide keyboard controls');
  return `<button class="keys-toggle" data-action="keys-guide" aria-expanded="${!folded}" aria-label="${label}" title="${label}"><span aria-hidden="true">⌨️</span>${folded ? '' : `<b>${t('Keyboard')}</b><i aria-hidden="true">▾</i>`}</button>${folded ? '' : `<dl>${rows.map(([what, keys]) => `<div><dt>${what}</dt><dd>${keys}</dd></div>`).join('')}</dl>`}`;
}

export class KeysGuide {
  memory: KeysGuideMemory; private shown = ''; private root: HTMLElement; private store: Storage | null;
  constructor(root: HTMLElement, store: Storage | null) { this.root = root; this.store = store; this.memory = readGuide(store); }
  private save() { try { this.store?.setItem(KEYS_GUIDE_KEY, JSON.stringify(this.memory)); } catch { /* storage blocked: it just is not remembered */ } }
  /** A game key was used; saved every 10 presses and when the guide folds itself. */
  used() { if (this.memory.mode !== 'auto' || this.memory.uses >= KEYS_LEARNED) return; this.memory.uses++; if (this.memory.uses % 10 === 0 || this.memory.uses >= KEYS_LEARNED) this.save(); }
  toggle() { this.memory.mode = guideFolded(this.memory) ? 'open' : 'closed'; this.save(); this.shown = ''; }
  render(layout: string | undefined, language: string, space?: 'jump' | 'attack', custom?: Record<KeyAction, string[]>) {
    const folded = guideFolded(this.memory), sig = `${layout}|${folded}|${language}|${space}|${custom ? Object.values(custom).join('|') : ''}`; if (sig === this.shown) return; this.shown = sig;
    this.root.classList.toggle('folded', folded); this.root.innerHTML = keysGuideHtml(layout, folded, space, custom);
  }
}
