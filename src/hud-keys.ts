// The desktop controls guide (a low strip along the bottom edge, from the left): the CURRENT keyboard layout from Settings,
// folding to a ⌨️ chip.
// Choice (AAA plan WP16): open for a new player; it folds itself once, at whichever comes first: the first planting, three
// minutes of play, or 30 game keys (moves, attacks, skills, shortcuts). Keys and play time are counted across sessions on
// this device. Opening or folding it by hand is final: the guide never moves on its own again. Remembered per device
// (localStorage), never in the save.
import { eatKey, keyboardBindings } from './gameplay-controls.ts';
import { keyLabel, type KeyAction } from './controls-keys.ts';
import { t } from './i18n.ts';

export const KEYS_GUIDE_KEY = 'zoo-garden-keys-guide';
export const KEYS_LEARNED = 30;
/** Play time after which the guide folds itself, in ms. */
export const KEYS_PLAY_MS = 180_000;
export interface KeysGuideMemory { mode: 'auto' | 'open' | 'closed'; uses: number; ms: number }
export function readGuide(store: Pick<Storage, 'getItem'> | null): KeysGuideMemory {
  try { const raw = JSON.parse(store?.getItem(KEYS_GUIDE_KEY) ?? 'null'); if (raw && ['auto', 'open', 'closed'].includes(raw.mode)) return { mode: raw.mode, uses: Math.max(0, Number(raw.uses) || 0), ms: Math.max(0, Number(raw.ms) || 0) }; } catch { /* private mode or bad JSON: start fresh */ }
  return { mode: 'auto', uses: 0, ms: 0 };
}
/** Folded? 'auto' folds once the keys are learned: 30 of them used (planting counts as all 30), or three minutes played. */
export const guideFolded = (m: KeysGuideMemory) => m.mode === 'closed' || m.mode === 'auto' && (m.uses >= KEYS_LEARNED || m.ms >= KEYS_PLAY_MS);

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
  memory: KeysGuideMemory; private shown = ''; private root: HTMLElement; private store: Storage | null; private last = 0;
  constructor(root: HTMLElement, store: Storage | null) { this.root = root; this.store = store; this.memory = readGuide(store); }
  private save() { try { this.store?.setItem(KEYS_GUIDE_KEY, JSON.stringify(this.memory)); } catch { /* storage blocked: it just is not remembered */ } }
  private get waiting() { return this.memory.mode === 'auto' && !guideFolded(this.memory); }
  /** A game key was used; saved every 10 presses and when the guide folds itself. */
  used() { if (!this.waiting) return; this.memory.uses++; if (this.memory.uses % 10 === 0 || this.memory.uses >= KEYS_LEARNED) this.save(); }
  /** The first planting: the player has found the garden, so the guide folds (the keys count as learned). */
  planted() { if (!this.waiting) return; this.memory.uses = KEYS_LEARNED; this.save(); }
  /** `ms` of play went by; saved every 10 s and when the guide folds itself. */
  played(ms: number) { if (!this.waiting || !(ms > 0)) return; const before = this.memory.ms || 0, now = this.memory.ms = before + ms; if (now >= KEYS_PLAY_MS || Math.floor(now / 10_000) > Math.floor(before / 10_000)) this.save(); }
  toggle() { this.memory.mode = guideFolded(this.memory) ? 'open' : 'closed'; this.save(); this.shown = ''; }
  /** Drawn from the HUD update (about eight times a second). `playing`: the game has started, so the time since the last call
      counts as play; a gap (a hidden tab, a pause) counts as one second at most. */
  render(layout: string | undefined, language: string, space?: 'jump' | 'attack', custom?: Record<KeyAction, string[]>, playing = false, clock: () => number = Date.now) {
    if (playing && this.waiting) { const now = clock(); if (this.last) this.played(Math.min(1000, now - this.last)); this.last = now; } else this.last = 0;
    const folded = guideFolded(this.memory), sig = `${layout}|${folded}|${language}|${space}|${custom ? Object.values(custom).join('|') : ''}`; if (sig === this.shown) return; this.shown = sig;
    this.root.classList.toggle('folded', folded); this.root.innerHTML = keysGuideHtml(layout, folded, space, custom);
  }
}
