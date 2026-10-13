/**
 * The power strike's button (power-rules.ts): hidden until the charge is full, then it pops in beside the fight
 * buttons. On a touch screen it is a large glowing button just above the paw (the paw's own child, so left-handed play
 * mirrors it with the paw); on a desktop it joins the tray with its key on it. Written only when its state changes;
 * the glow, the pulse and the last seconds' blink are CSS (combo-counter.css).
 */
import { POWER, type PowerView } from './power-rules.ts';

/** A burst with a bolt through it: ours, drawn for this button. */
const ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3l4.6 9.2 9.6-3.6-3.6 9.6L44 24l-9.4 5.8 3.6 9.6-9.6-3.6L24 45l-4.6-9.2-9.6 3.6 3.6-9.6L4 24l9.4-5.8-3.6-9.6 9.6 3.6z" fill="#fff6c9" stroke="#3a2433" stroke-width="2.2" stroke-linejoin="round"/><path d="M27 12l-9 13h6l-3 11 10-14h-6z" fill="#ff7a1a" stroke="#3a2433" stroke-width="1.8" stroke-linejoin="round"/></svg>';
export const POWER_PAD_HTML = `<button id="power-pad" class="power-pad" data-action="power" hidden>${ICON}<b class="power-x" aria-hidden="true">×2</b></button>`;
/** The hint shown the first time the button appears, once per device. */
export const POWER_HINT_STORE = 'zoo-power-hint';
export function hintSeen(store: Pick<Storage, 'getItem'> | null) { try { return store?.getItem(POWER_HINT_STORE) === '1'; } catch { return true; } }
export function markHint(store: Pick<Storage, 'setItem'> | null) { try { store?.setItem(POWER_HINT_STORE, '1'); } catch { /* storage blocked: it may show once more next visit */ } }
/** What the button's state is called in its signature and classes: '' hidden, else the level and whether it blinks. */
export function padState(view: PowerView, shown: boolean) { return !shown || view.level < 1 ? '' : `${Math.min(POWER.levels, view.level)}${view.blinking ? 'b' : ''}`; }

export class PowerPad {
  private pad: HTMLElement; private state = ''; private labels = '';
  constructor(pad: HTMLElement) { this.pad = pad; }
  /** `shown` false hides it whatever the charge (a menu, fishing, the switch off). Returns true when it has just appeared. */
  sync(view: PowerView, shown: boolean, label: string, key = POWER.key.toUpperCase()): boolean {
    const state = padState(view, shown), labels = label + '|' + key;
    if (state === this.state && labels === this.labels) return false;
    const appeared = !this.state && !!state; this.state = state;
    if (labels !== this.labels) { this.labels = labels; this.pad.setAttribute('aria-label', label); this.pad.title = `${label} (${key})`; this.pad.dataset.key = key; this.pad.dataset.label = label; }
    this.pad.hidden = !state; this.pad.classList.toggle('over', state.startsWith('2')); this.pad.classList.toggle('blink', state.endsWith('b'));
    return appeared;
  }
}
