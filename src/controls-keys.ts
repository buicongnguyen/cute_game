/**
 * PC key rebinding (Settings > Controls > Keys): pure rules, no DOM.
 *
 * The two layouts ('classic' arrows + QWER, 'wasd' + JKL;) stay as presets; custom keys are a few overrides on top of the
 * preset in use and are dropped when the player picks another preset (the preset is where they start from). Stored per
 * device with the other control preferences (controls-prefs.ts), never in the synced save: a laptop and a desk keyboard differ.
 *
 * How a custom key acts: main.ts's key handler runs as before, but first the pressed key is translated (translateKey):
 *   - a custom key becomes the canonical key of its action (the preset's key: Q for the first skill, N for the attack, Space
 *     or Shift for the jump...), so every rule hung on those keys (hold to power-strike, F's attack when nothing is near,
 *     the fourth skill free without a fourth button) keeps working unchanged;
 *   - a preset key whose action was moved elsewhere is blocked, unless another action has been given it;
 *   - every other key passes through untouched.
 * Keys are physical (KeyboardEvent.code), so Vietnamese Telex/VNI and other layouts press the same buttons (bindingKey).
 *
 * Conflicts: binding a key another action uses SWAPS the two (that action takes the old key). Swapping keeps every action
 * on a key and is one step for the player; refusing would make them free the key first, a two-step dance for nothing.
 * Keys the game needs for itself are refused: moving (arrows, and WASD with that preset), the backpack (I), map (M),
 * journal (J or P), and Escape / Enter / Tab (menus, chat, weapon swap).
 */
import { gameplayKey, keyboardBindings } from './gameplay-controls.ts';

export const KEY_ACTIONS = ['skill0', 'skill1', 'skill2', 'skill3', 'attack', 'jump', 'eat', 'interact'] as const;
export type KeyAction = typeof KEY_ACTIONS[number];
export type CustomKeys = Partial<Record<KeyAction, string>>;
export interface KeyContext { layout?: string; air: boolean; space: 'jump' | 'attack' }
export type Refusal = 'move' | 'menu' | 'system' | 'none';

const CODE_CHARS: Record<string, string> = { Comma: ',', Period: '.', Slash: '/', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', Semicolon: ';' };
/**
 * The key an event names for binding: physical letters, digits and punctuation from KeyboardEvent.code (Telex turns ] into ơ
 * and [ into ư, so event.key would lie), Shift by side, otherwise what gameplayKey says. '' while composing or with Ctrl/Alt/Meta.
 */
export function bindingKey(event: { code?: string; key: string; isComposing?: boolean; keyCode?: number; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }) {
  if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return '';
  const code = event.code || '';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return code;
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return code;
  if (CODE_CHARS[code]) return CODE_CHARS[code];
  return gameplayKey(event);
}
/** A key as the player reads it: Space, Shift, ↑, Num 1, Q. */
export function keyLabel(key: string) {
  if (key === ' ') return 'Space';
  if (key === 'ShiftLeft') return 'Shift';
  if (key === 'ShiftRight') return 'Right Shift';
  if (key.startsWith('Numpad')) return 'Num ' + key.slice(6);
  const arrows: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return arrows[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}
/** The keys code-only checks in main.ts compare (KeyboardEvent.code) for a binding key. */
export function keyCode(key: string) {
  if (key === ' ') return 'Space';
  if (key.startsWith('Shift') || key.startsWith('Numpad') || key.startsWith('Arrow')) return key;
  if (/^[a-z]$/.test(key)) return 'Key' + key.toUpperCase();
  if (/^\d$/.test(key)) return 'Digit' + key;
  const named = Object.entries(CODE_CHARS).find(([, c]) => c === key);
  return named ? named[0] : key;
}

/** Today's keys for each action with no custom keys, the shown key first (the same table the keyboard guide always showed). */
export function presetKeys(ctx: KeyContext): Record<KeyAction, string[]> {
  const b = keyboardBindings(ctx.layout);
  return {
    skill0: [b.skills[0]], skill1: [b.skills[1]], skill2: [b.skills[2]], skill3: [b.skills[3]],
    // With jumping off Space is the basic attack; with it on N attacks (F too, when nothing is near), and Space as well if the Space setting says attack.
    attack: !ctx.air ? [' '] : ctx.space === 'attack' ? [' ', 'n'] : ['n'],
    jump: !ctx.air ? [] : [ctx.space === 'jump' ? ' ' : 'ShiftLeft'],
    eat: ['h'], interact: ['f'],
  };
}
/** What a key is refused for, or 'none'. */
export function refusal(key: string, ctx: KeyContext): Refusal {
  if (!key) return 'system';
  if (['Escape', 'Enter', 'Tab'].includes(key)) return 'system';
  if (key.startsWith('Arrow') || ctx.layout !== 'classic' && ['w', 'a', 's', 'd'].includes(key)) return 'move';
  if (key === 'i' || key === 'm' || key === keyboardBindings(ctx.layout).journal) return 'menu';
  return 'none';
}
/** Custom keys read from storage: only for the preset they were made on, only known actions, no refused or doubled keys. */
export function cleanKeys(raw: unknown, ctx: KeyContext): CustomKeys {
  const out: CustomKeys = {}, used = new Set<string>();
  if (!raw || typeof raw !== 'object') return out;
  for (const a of KEY_ACTIONS) {
    const k = (raw as Record<string, unknown>)[a];
    if (typeof k !== 'string' || k.length > 12 || refusal(k, ctx) !== 'none' || used.has(k)) continue;
    used.add(k); out[a] = k;
  }
  return out;
}
/** Every action's keys now: a custom key replaces the preset's; a preset key taken by another action's custom key is dropped. */
export function effectiveKeys(ctx: KeyContext, custom: CustomKeys): Record<KeyAction, string[]> {
  const preset = presetKeys(ctx), taken = new Set(Object.values(custom));
  const out = {} as Record<KeyAction, string[]>;
  for (const a of KEY_ACTIONS) out[a] = custom[a] !== undefined ? [custom[a]!] : preset[a].filter(k => !taken.has(k));
  return out;
}
export const actionOf = (key: string, keys: Record<KeyAction, string[]>) => KEY_ACTIONS.find(a => keys[a].includes(key)) ?? null;

export type RebindResult = { ok: true; keys: CustomKeys; swapped?: KeyAction } | { ok: false; reason: Refusal | 'taken' };
/**
 * Give `action` the key `key`. Another action using it swaps (takes this action's old key); a key the game needs is refused.
 * An action with no key to give (Jump while jumping is off) cannot swap, so the key is refused as taken.
 */
export function rebind(custom: CustomKeys, action: KeyAction, key: string, ctx: KeyContext): RebindResult {
  const why = refusal(key, ctx); if (why !== 'none') return { ok: false, reason: why };
  const now = effectiveKeys(ctx, custom), mine = now[action][0];
  if (mine === key) return { ok: true, keys: { ...custom } };
  const other = KEY_ACTIONS.find(a => a !== action && now[a].includes(key));
  const next: CustomKeys = { ...custom, [action]: key };
  if (other) { if (mine === undefined) return { ok: false, reason: 'taken' }; next[other] = mine; }
  return { ok: true, keys: next, ...(other ? { swapped: other } : {}) };
}
/**
 * What main.ts's handler should see for a pressed key: the canonical key (and code) of the action a custom key stands for,
 * null when the key is a preset key whose action moved away (blocked), or the key itself.
 */
export function translateKey(key: string, code: string, ctx: KeyContext, custom: CustomKeys): { key: string; code: string } | null {
  if (!Object.keys(custom).length) return { key, code };
  const preset = presetKeys(ctx), keys = effectiveKeys(ctx, custom), mine = actionOf(key, keys);
  if (mine) {
    if (custom[mine] !== key) return { key, code }; // its own preset key, untouched
    const canon = preset[mine][0]; if (canon === undefined) return null;
    return { key: canon, code: keyCode(canon) };
  }
  return KEY_ACTIONS.some(a => preset[a].includes(key)) ? null : { key, code };
}
/** The key-up side: is this physical key the one that jumps now (so letting go ends the hold-for-higher-jumps)? */
export const jumpKeyUp = (key: string, ctx: KeyContext, custom: CustomKeys) => custom.jump !== undefined && custom.jump === key;
