/**
 * Story steps that are about owning something are credited from what the explorer already has when the step comes
 * up: buying the wood sword before "Buy or craft one item" is active no longer leaves it at 0/1. (Steps that count a
 * condition, such as "Equip a weapon", read the live state already; steps that count actions, such as kills, do not
 * look back.) progression.ts calls catchUpStory() once per refresh.
 */
import { ITEMS } from './content.ts';
import type { SaveState } from './model.ts';

/** How many different pieces of gear (weapon, clothing, companion bought in a shop) the explorer holds or wears. */
export function ownedGearCount(s: Pick<SaveState, 'bag' | 'chest' | 'gear'>): number {
  const ids = new Set<string>();
  for (const [id, n] of Object.entries(s.bag ?? {})) if ((n ?? 0) > 0) ids.add(id);
  for (const [id, n] of Object.entries(s.chest ?? {})) if ((n ?? 0) > 0) ids.add(id);
  for (const id of Object.values(s.gear ?? {})) if (id) ids.add(id);
  let count = 0;
  for (const id of ids) { const item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined; if (item?.slot && !item.keepsake && !id.startsWith('cooked_')) count++; }
  return count;
}

/** Raises the active story step's progress to what is already owned (never lowers it). Returns whether it changed. */
export function catchUpStory(s: SaveState, step: { event?: string; target: number }): boolean {
  const p = s.progression.story;
  if (step.event !== 'craft') return false;
  const owned = Math.min(step.target, ownedGearCount(s));
  if (owned <= p.progress) return false;
  p.progress = owned; return true;
}
