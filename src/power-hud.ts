/**
 * The power strike on the Attack button (power-rules.ts, five-rules.ts HOLD). There is no button of its own: the Attack
 * pad wears the charge as a ring that fills with every hit, glows and pulses when the strike is ready ('×2' when it is
 * overcharged, a blink through its last seconds), and shows a quick radial fill while it is held to unleash it.
 * Written only when its state changes; the ring's fill is a CSS variable in twenty steps, and the glow, the pulse and the
 * hold's fill are CSS animations (combo-counter.css).
 */
import { POWER, type PowerView } from './power-rules.ts';
import { HOLD } from './five-rules.ts';

/** What the Attack pad carries once jumping is on: the charge ring, the hold's fill and the overcharge mark. */
export const ATTACK_CHARGE_HTML = '<i class="ap-ring" aria-hidden="true"></i><i class="ap-hold" aria-hidden="true"></i><b class="ap-x" aria-hidden="true">×2</b>';
/** The hint shown the first time a charge is ready, once per device. */
export const POWER_HINT_STORE = 'zoo-power-hold-hint';
export function hintSeen(store: Pick<Storage, 'getItem'> | null) { try { return store?.getItem(POWER_HINT_STORE) === '1'; } catch { return true; } }
export function markHint(store: Pick<Storage, 'setItem'> | null) { try { store?.setItem(POWER_HINT_STORE, '1'); } catch { /* storage blocked: it may show once more next visit */ } }
/** The ring's fill in whole twentieths (one per hit at 20 hits a level): 0 to 100. */
export function chargeSteps(view: PowerView) { return view.level > 0 ? 100 : Math.max(0, Math.min(100, Math.round(view.progress * POWER.need) * (100 / POWER.need))); }
/**
 * What the pad shows, as one signature: '' when nothing (hidden, or no charge at all), else the fill, then 'r' ready,
 * 'x' overcharged, 'b' blinking, 'h' being held to unleash.
 */
export function padState(view: PowerView, shown: boolean, holding = false) {
  if (!shown) return '';
  const ready = view.level > 0;
  return `${chargeSteps(view)}${ready ? 'r' : ''}${view.level > 1 ? 'x' : ''}${ready && view.blinking ? 'b' : ''}${ready && holding ? 'h' : ''}`;
}

export class AttackCharge {
  private pad: HTMLElement; private state = ''; private label = '';
  constructor(pad: HTMLElement) { this.pad = pad; pad.style.setProperty('--hold-time', HOLD.time + 's'); }
  /**
   * `shown` false clears the pad (a menu, the switch off). `label`: the pad's name for a screen reader while a strike is
   * ready. Returns true when the charge has just become ready.
   */
  sync(view: PowerView, shown: boolean, holding: boolean, label: string, plain: string): boolean {
    const state = padState(view, shown, holding), name = state.includes('r') ? label : plain;
    if (state === this.state && name === this.label) return false;
    const was = this.state, c = this.pad.classList; this.state = state;
    if (name !== this.label) { this.label = name; this.pad.setAttribute('aria-label', name); this.pad.title = name; }
    const fill = String(parseInt(state, 10) || 0); if (this.pad.style.getPropertyValue('--charge') !== fill) this.pad.style.setProperty('--charge', fill);
    c.toggle('charging', !!state && !state.includes('r') && fill !== '0'); c.toggle('ready', state.includes('r')); c.toggle('over', state.includes('x')); c.toggle('blink', state.includes('b')); c.toggle('holding', state.includes('h'));
    return state.includes('r') && !was.includes('r');
  }
}
