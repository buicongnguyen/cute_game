// The weapon pair's bits of interface (weapon-pair.ts): the side-slot button in the bag and the shop, the settings row,
// and the target the auto swap measures. main.ts wires them; the strings are in locales/vi-pair.ts.
import { ITEMS } from './content.ts';
import { isGun, sideOpen, pairMode, SIDE_LEVEL, type Hand } from './weapon-pair.ts';

type PairState = { level: number; bag: Partial<Record<string, number>>; gear: Record<string, string | undefined>; settings?: { pairManual?: boolean } };
type Tr = (key: string, vars?: Record<string, string | number>) => string;

/** "Side slot" for a gun the explorer owns once the slot is open; "✓ Side slot" when it is already there. */
export function sideButtonHtml(s: PairState, id: string, t: Tr): string {
  if (!isGun(id) || !(s.bag[id]! > 0)) return '';
  if (!sideOpen(s)) return `<span class="chip chip-gate">🔒 ${t('Side slot at level {level}', { level: SIDE_LEVEL })}</span>`;
  return s.gear.side === id ? `<span class="chip chip-seed">✓ ${t('Side slot')}</span>` : `<button class="sky-button pair-side-equip" data-action="equip-side" data-item="${id}">🔫 ${t('Side slot')}</button>`;
}
/** Settings: Auto (default) or Manual weapon swap. */
export function pairSettingHtml(s: PairState, t: Tr): string {
  if (!sideOpen(s)) return '';
  const mode = pairMode(s);
  return `<div class="settings-row"><div><strong>${t('Weapon swap')}</strong><small>${t(mode === 'auto' ? 'Auto: the gun for far targets, the blade up close. Tab swaps any time.' : 'Manual: only Tab or the swap button changes weapons.')}</small></div><div class="segmented" role="radiogroup" aria-label="${t('Weapon swap')}">${(['auto', 'manual'] as const).map(m => `<button role="radio" aria-checked="${mode === m}" class="${mode === m ? 'on' : ''}" data-action="pair-mode" data-kind="${m}">${t(m === 'auto' ? 'Auto swap' : 'Manual swap')}</button>`).join('')}</div></div>`;
}
/** The swap button's face: the weapon you would swap TO. */
export function swapFace(s: PairState, hand: Hand): string {
  const to = hand === 'main' ? s.gear.side : s.gear.weapon;
  return to && ITEMS[to] ? ITEMS[to].icon : '👊';
}
interface Foe { x: number; z: number; radius: number; hp: number }
/** The edge distance the auto swap reads: the chosen creature, else the nearest living one within `reach` that fights. */
export function pairTarget(at: { x: number; z: number }, chosen: Foe | null, foes: readonly Foe[], fights: (e: Foe) => boolean, reach = 16): number {
  const edge = (e: Foe) => Math.max(0, Math.hypot(e.x - at.x, e.z - at.z) - e.radius);
  if (chosen && chosen.hp > 0) return edge(chosen);
  let best = Infinity; for (const e of foes) if (e.hp > 0 && fights(e)) { const d = edge(e); if (d < best && d <= reach) best = d; }
  return best;
}
