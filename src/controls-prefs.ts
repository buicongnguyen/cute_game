/**
 * The Controls preferences, per device (localStorage 'zoo-garden-controls', like the graphics setting): which side the
 * fight buttons stand on, their size and resting opacity, the custom layouts per screen type and the custom PC keys.
 * None of it is in the synced save: a phone and a PC want different hands, sizes and keys.
 *
 * Side: the skill buttons (with Attack and Jump) take one side and the joystick, when shown, always the other, so they can
 * never meet. Before this setting there was only "Joystick side" (in the save): an old save that put the stick on the
 * right keeps its paw on the left, so nothing moves for anyone until they choose.
 */
import { cleanLayout, OPACITIES, SCREEN_TYPES, SIZES, type ButtonOpacity, type ButtonSize, type Layout, type ScreenType } from './controls-layout.ts';

export const CONTROLS_STORE = 'zoo-garden-controls';
export interface ControlsPrefs {
  side?: 'left' | 'right'; size?: ButtonSize; opacity?: ButtonOpacity;
  layouts?: Partial<Record<ScreenType, Layout>>;
  /** Custom PC keys: overrides on top of the preset they were made on (controls-keys.ts). */
  keys?: { preset: 'classic' | 'wasd'; map: Record<string, string> };
}
export function readControls(store: Pick<Storage, 'getItem'> | null): ControlsPrefs {
  let raw: Record<string, unknown> | null = null;
  try { raw = JSON.parse(store?.getItem(CONTROLS_STORE) ?? 'null'); } catch { /* blocked storage or bad JSON: defaults */ }
  if (!raw || typeof raw !== 'object') return {};
  const out: ControlsPrefs = {};
  if (raw.side === 'left' || raw.side === 'right') out.side = raw.side;
  if (typeof raw.size === 'string' && raw.size in SIZES) out.size = raw.size as ButtonSize;
  if ((OPACITIES as readonly number[]).includes(raw.opacity as number)) out.opacity = raw.opacity as ButtonOpacity;
  if (raw.layouts && typeof raw.layouts === 'object') {
    const layouts: Partial<Record<ScreenType, Layout>> = {};
    for (const s of SCREEN_TYPES) { const l = cleanLayout((raw.layouts as Record<string, unknown>)[s]); if (l) layouts[s] = l; }
    if (Object.keys(layouts).length) out.layouts = layouts;
  }
  const k = raw.keys as ControlsPrefs['keys'];
  if (k && (k.preset === 'classic' || k.preset === 'wasd') && k.map && typeof k.map === 'object') out.keys = { preset: k.preset, map: { ...k.map } };
  return out;
}
export function saveControls(store: Pick<Storage, 'setItem'> | null, prefs: ControlsPrefs) {
  try { store?.setItem(CONTROLS_STORE, JSON.stringify(prefs)); } catch { /* storage blocked: it lasts for this visit */ }
}
/** The skill buttons' side: the player's choice, else the opposite of the old save's joystick side (right-handed by default). */
export function skillSide(prefs: ControlsPrefs, joystickSide?: string): 'left' | 'right' {
  return prefs.side ?? (joystickSide === 'right' ? 'left' : 'right');
}
export const sizeOf = (prefs: ControlsPrefs): ButtonSize => prefs.size ?? 'normal';
export const opacityOf = (prefs: ControlsPrefs): ButtonOpacity => prefs.opacity ?? 100;
