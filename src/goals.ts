/**
 * Long-term goals on the main screen (docs/FIX-PLAN.md 5.5): planets discovered x/9, how much of the collections is found,
 * and the next thing a level opens. Pure rules over the save; goals-ui.ts draws the HUD chip and the Goals panel.
 *
 * - Planets: the planets spotted from the starship (s.discovered), as the starship's own "Discovered x/9" line counts them.
 * - Collection: one percentage over every entry of the existing collections: the fish log (FISH, the old boot left out), the
 *   world collections of the journal (COLLECTIONS items) and the creatures, i.e. every world boss beaten at least once
 *   (s.bosses keys `<planet>:<boss>`). Each entry weighs the same.
 * - Next unlock: the lowest level gate above the explorer's level among crops and fruit trees (CROPS[*].level), planet
 *   landings (PLANETS[*].level) and the Delvers' Vault (DUNGEON_LEVEL). Ties go to the planet, then the vault, then crops.
 */
import { COLLECTIONS, CROPS, FISH, PLANETS } from './content.ts';
import { DUNGEON_LEVEL } from './dungeon-content.ts';

export interface GoalsSave {
  level: number;
  discovered: readonly string[];
  collection: Readonly<Record<string, number>>;
  fishRecords: Readonly<Record<string, number>>;
  bosses?: readonly string[];
}
export interface Count { done: number; total: number }
export interface CollectionGoal extends Count { pct: number; fish: Count; items: Count; creatures: Count }
export interface Unlock { kind: 'planet' | 'vault' | 'crop'; id: string; name: string; icon: string; level: number; inLevels: number; /** The gate before it (or level 1): the progress bar runs from here to `level`. */ from: number }

const FISH_IDS = Object.keys(FISH).filter(id => id !== 'boot');
const ITEM_IDS = [...new Set(Object.values(COLLECTIONS).flatMap(c => c.items))].filter(id => !FISH_IDS.includes(id));
const BOSS_KEYS = [...new Set(Object.entries(PLANETS).flatMap(([id, p]) => p.bosses.map(b => `${id}:${b}`)))];
const RANK = { planet: 0, vault: 1, crop: 2 } as const;

export function planetGoal(s: GoalsSave): Count {
  const ids = new Set(Object.keys(PLANETS));
  return { done: new Set(s.discovered.filter(id => ids.has(id))).size, total: ids.size };
}

export function collectionGoal(s: GoalsSave): CollectionGoal {
  const fish = { done: FISH_IDS.filter(id => s.fishRecords[id] || s.collection[id]).length, total: FISH_IDS.length };
  const items = { done: ITEM_IDS.filter(id => s.collection[id]).length, total: ITEM_IDS.length };
  const beaten = new Set(s.bosses ?? []), creatures = { done: BOSS_KEYS.filter(k => beaten.has(k)).length, total: BOSS_KEYS.length };
  const done = fish.done + items.done + creatures.done, total = fish.total + items.total + creatures.total;
  return { done, total, pct: total ? Math.floor(done / total * 100) : 100, fish, items, creatures };
}

/** Every level gate there is, lowest first. */
export function unlockLadder(): Omit<Unlock, 'inLevels' | 'from'>[] {
  const out: Omit<Unlock, 'inLevels' | 'from'>[] = [];
  for (const [id, p] of Object.entries(PLANETS)) out.push({ kind: 'planet', id, name: p.name, icon: p.icon, level: p.level });
  out.push({ kind: 'vault', id: 'vault', name: "The Delvers' Vault", icon: '🗝️', level: DUNGEON_LEVEL });
  for (const [id, c] of Object.entries(CROPS)) out.push({ kind: 'crop', id, name: c.name, icon: c.icon, level: c.level });
  return out.sort((a, b) => a.level - b.level || RANK[a.kind] - RANK[b.kind] || a.id.localeCompare(b.id));
}
let ladder: ReturnType<typeof unlockLadder> | null = null;

/** The next thing a level opens, or null once everything is open. */
export function nextUnlock(s: Pick<GoalsSave, 'level'>): Unlock | null {
  ladder ??= unlockLadder();
  const i = ladder.findIndex(u => u.level > s.level);
  if (i < 0) return null;
  const next = ladder[i], from = Math.max(1, ...ladder.slice(0, i).map(u => u.level));
  return { ...next, inLevels: next.level - s.level, from };
}

/** A short key of everything the goals show: the HUD redraws only when it changes. */
export const goalsKey = (s: GoalsSave) => `${s.level}|${s.discovered.length}|${Object.keys(s.collection).length}|${Object.keys(s.fishRecords).length}|${s.bosses?.length ?? 0}`;
