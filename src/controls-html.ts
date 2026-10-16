/**
 * The Controls section of Settings and the PC keys panel, as markup (no DOM, so the locale tests can render them).
 * English text nodes are translated by openDialog's localizeHtml; text with numbers or names goes through t() here.
 */
import { t } from './i18n.ts';
import { KEY_ACTIONS, keyLabel, type KeyAction } from './controls-keys.ts';
import type { ButtonOpacity, ButtonSize, ScreenType } from './controls-layout.ts';

export interface ControlsView {
  side: 'left' | 'right'; size: ButtonSize; opacity: ButtonOpacity; joystick: boolean;
  screen: ScreenType; custom: boolean; fallback: boolean;
  /** Show the PC keys row (a mouse or trackpad is present). */
  pc: boolean; keys: Record<KeyAction, string[]>; customKeys: boolean;
}
export const SCREEN_NAMES: Record<ScreenType, string> = { portrait: 'phones held upright', landscape: 'phones held sideways', desktop: 'this computer' };
const radio = (action: string, label: string, options: [string, string][], chosen: string) =>
  `<div class="segmented" role="radiogroup" aria-label="${label}">${options.map(([kind, text]) => `<button role="radio" aria-checked="${chosen === kind}" class="${chosen === kind ? 'on' : ''}" data-action="${action}" data-kind="${kind}">${text}</button>`).join('')}</div>`;
export const keysText = (keys: string[]) => keys.length ? keys.map(keyLabel).join(' / ') : '—';
/** The one-line key summary under "Keys". */
export function keysSummary(keys: Record<KeyAction, string[]>) {
  const skills = (['skill0', 'skill1', 'skill2', 'skill3'] as const).map(a => keys[a][0] ? keyLabel(keys[a][0]) : '—').join(' ');
  return [`${t('Skills')} ${skills}`, `${t('Basic attack')} ${keysText(keys.attack)}`, ...(keys.jump.length ? [`${t('Jump')} ${keysText(keys.jump)}`] : []), `${t('Eat')} ${keysText(keys.eat)}`, `${t('Interact')} ${keysText(keys.interact)}`].join(' · ');
}
/** The Controls group: the joystick row and the keyboard rows come from main.ts as they were; the rest is new. */
export function controlsSectionHtml(v: ControlsView, joystickRow: string, keyboardRows: string) {
  const layoutNote = !v.custom ? 'The default layout. Each screen shape keeps its own.'
    : v.fallback ? "Your layout doesn't fit this screen right now, so the default is shown."
      : t('Your own layout for {screen}.', { screen: t(SCREEN_NAMES[v.screen]) });
  return `<section class="settings-group controls-group" aria-labelledby="controls-title"><h3 class="settings-group-title" id="controls-title">Controls</h3>${joystickRow}`
    + `<div class="settings-row"><div><strong>Skill buttons side</strong><small>${v.joystick ? 'Attack, Jump and the skills stand here. The joystick takes the other side.' : 'Attack, Jump and the skills stand on this side.'}</small></div>${radio('ctl-side', 'Skill buttons side', [['left', 'Left'], ['right', 'Right']], v.side)}</div>`
    + `<div class="settings-row"><div><strong>Button size</strong><small>The fight buttons and the joystick. Never smaller than a fingertip.</small></div>${radio('ctl-size', 'Button size', [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']], v.size)}</div>`
    + `<div class="settings-row"><div><strong>Button opacity</strong><small>Fainter buttons show more of the world. A pressed button lights up fully.</small></div>${radio('ctl-opacity', 'Button opacity', [['100', '100%'], ['80', '80%'], ['60', '60%']], String(v.opacity))}</div>`
    + `<div class="settings-row"><div><strong>Button layout</strong><small>${layoutNote}</small></div><button class="soft-button" data-action="ctl-edit">Move buttons</button></div>`
    + keyboardRows
    + (v.pc ? `<div class="settings-row keyboard-settings"><div><strong>Keys</strong><small data-i18n-skip>${keysSummary(v.keys)}</small></div><button class="soft-button" data-action="ctl-keys">${v.customKeys ? 'Change keys (custom)' : 'Change keys'}</button></div>` : '')
    + `</section>`;
}
export const KEY_ROW_NAMES: Record<KeyAction, string> = { skill0: 'Skill 1', skill1: 'Skill 2', skill2: 'Skill 3', skill3: 'Skill 4', attack: 'Basic attack', jump: 'Jump', eat: 'Eat', interact: 'Interact' };
/** The keys panel: one row per action, its key on a button; the row being changed listens for the next key. */
export function keysPanelHtml(keys: Record<KeyAction, string[]>, o: { listening: KeyAction | null; status: string; air: boolean; skillNames: string[] }) {
  const rows = KEY_ACTIONS.map(a => {
    const i = a.startsWith('skill') ? Number(a.slice(5)) : -1, name = i >= 0 && o.skillNames[i] ? ` · ${o.skillNames[i]}` : '';
    const off = a === 'jump' && !o.air, listening = o.listening === a;
    const label = t(KEY_ROW_NAMES[a]) + name;
    return `<div class="settings-row ctl-key-row"><div><strong data-i18n-skip>${label}</strong>${off ? '<small>Turn on Jump and air combat first.</small>' : ''}</div><button class="ctl-key${listening ? ' listening' : ''}" data-action="ctl-bind" data-kind="${a}" aria-label="${t('Change the key for {action}', { action: label })}" ${off ? 'disabled' : ''} data-i18n-skip>${listening ? t('Press a key…') : keysText(keys[a])}</button></div>`;
  }).join('');
  return `<p class="ctl-keys-note">Pick an action, then press its new key. Escape cancels. A key another action uses swaps over.</p><div class="ctl-keys-list">${rows}</div><p class="ctl-keys-status" role="status" data-i18n-skip>${o.status}</p><div class="button-row"><button class="text-button" data-action="ctl-keys-reset">Reset to default</button><button class="primary" data-action="ctl-keys-back">Done</button></div>`;
}
