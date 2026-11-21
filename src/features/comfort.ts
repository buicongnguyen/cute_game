/**
 * Hit feel and the comfort settings (AAA-PLAN WP9), all of it after Start:
 * - The feel of a landed blow (hit-stop.ts: the stop, the kick, the pitch ladder) and the camera's shake model
 *   (shake.ts) are put on the effects here. Until this module is mounted, just after the first played frame, blows
 *   have no stop and the camera does not shake.
 * - Screen shake: Off / Low / Full. Low is the choice of a player who asked the system for less motion and never
 *   picked one. The camera's shake and its zoom punch follow it (shake.ts gain).
 * - Flashes: On / Low. Low halves the red flash round the screen when the explorer is hurt, the white-out of a warp,
 *   a creature's white hit flash and the light blooms of fx.ts (fx.flashes; the break flash of a later package reads it too).
 * - Haptics behind the Vibration switch: 12 ms on a critical and on a kill of the explorer's own, [20, 30, 40] when a
 *   boss breaks and when the Colossus kneels (colossus.ts calls fx.buzz).
 * Both choices are kept per device (services.pref), not in the save. The rows reach Settings through settings-extras.ts.
 */
import type { GameServices } from '../game-services.ts';
import { addSettingsRow } from '../settings-extras.ts';
import { Shake, shakeGain } from '../shake.ts';
import { hitFeel } from '../hit-stop.ts';

export const SHAKE_CHOICES = ['off', 'low', 'full'] as const, FLASH_CHOICES = ['on', 'low'] as const;
export type ShakeChoice = typeof SHAKE_CHOICES[number];
export type FlashChoice = typeof FLASH_CHOICES[number];
/** What Flashes: Low leaves of a flash. */
export const FLASH_LOW = .5;
const LABEL: Record<string, string> = { off: 'Off', low: 'Low', full: 'Full', on: 'On' };

/** The stored Screen shake choice; with none stored, Low under prefers-reduced-motion (`calm`), else Full. */
export const shakeChoice = (stored: string, calm: boolean): ShakeChoice => stored === 'off' || stored === 'low' || stored === 'full' ? stored : calm ? 'low' : 'full';
export const flashChoice = (stored: string): FlashChoice => stored === 'low' ? 'low' : 'on';

/** A Settings row of two or three choices (English; the dialog localizes it). Each choice is a 44 px target on every screen. */
export function choiceRow(key: string, title: string, note: string, choices: readonly string[], now: string) {
  return `<div class="settings-row"><div><strong>${title}</strong><small>${note}</small></div><div class="segmented comfort-pick" data-comfort="${key}" role="radiogroup" aria-label="${title}">${choices.map(c => `<button role="radio" aria-checked="${c === now}" class="${c === now ? 'on' : ''}" data-kind="${c}">${LABEL[c]}</button>`).join('')}</div></div>`;
}
export const shakeRow = (now: ShakeChoice) => choiceRow('shake', 'Screen shake', 'How much the camera moves when a blow lands', SHAKE_CHOICES, now);
export const flashRow = (now: FlashChoice) => choiceRow('flashes', 'Flashes', 'Low halves the flash when you are hurt and the glow of hits', FLASH_CHOICES, now);

/** A blow of the explorer's own (not a pet's, a helper's or a summon's). */
const own = (impact?: { helper?: boolean; source?: string }) => !!impact && !impact.helper && impact.source !== 'pet' && impact.source !== 'summon';
/** The Vibration switch as the save holds it (audio-settings.ts parseAudio: an old save's sound switch stands in). */
export const vibrates = (settings: { vibrate?: unknown; sound?: unknown }) => typeof settings.vibrate === 'boolean' ? settings.vibrate : settings.sound !== false;

const CSS = '#dialog-body .comfort-pick button{min-width:44px;min-height:44px}:root[data-flashes=low] #damage-flash.active,:root[data-flashes=low] #warp-flash.show{opacity:.5}';

export function mount(s: GameServices) {
  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const shake = () => shakeChoice(s.pref('shake'), calm()), flashes = () => flashChoice(s.pref('flashes'));
  const buzz = (pattern: number | number[]) => { try { if (vibrates(s.state().settings as { vibrate?: unknown }) && s.touch()) navigator.vibrate?.(pattern); } catch { /* Optional. */ } };
  const apply = () => {
    const fx = s.world.fx;
    if (fx) { (fx.rig ??= new Shake()).gain = shakeGain(shake()); fx.feel ??= (hit, broke, kill, chain) => hitFeel(fx, hit, broke, kill, chain); fx.flashes = flashes() === 'low' ? FLASH_LOW : 1; fx.buzz = buzz; }
    const root = globalThis.document?.documentElement; if (root) root.dataset.flashes = flashes();
  };
  if (globalThis.document?.head) { const style = document.createElement('style'); style.textContent = CSS; document.head.append(style); }
  apply();
  /** A row's choices are buttons: a tap stores the choice and moves the mark, with no redraw of the dialog. */
  const pick = (key: string) => (root: ParentNode | undefined) => {
    const row = root?.querySelector<HTMLElement>(`[data-comfort="${key}"]`); if (!row) return;
    row.onclick = event => {
      const button = (event.target as Element).closest?.<HTMLElement>('button[data-kind]'); if (!button) return;
      s.setPref(key, button.dataset.kind!); apply(); s.tone('click');
      row.querySelectorAll<HTMLElement>('button[data-kind]').forEach(b => { const on = b === button; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    };
  };
  addSettingsRow('comfort', () => shakeRow(shake()), pick('shake'));
  addSettingsRow('comfort', () => flashRow(flashes()), pick('flashes'));
  s.on('hitLanded', ({ impact }) => { if (impact?.critical && own(impact)) buzz(12); });
  s.on('creatureDefeat', ({ impact }) => { if (own(impact)) buzz(12); });
  s.on('bossBreak', () => buzz([20, 30, 40]));
}
