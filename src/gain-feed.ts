/**
 * Where a gain is told (the owner's rule, 2026-10-16): progress shows where the player tracks progress, not as white text
 * over the hero in the middle of the screen.
 *   - an item that counts toward the current quest step, the bounty or a timed challenge: the tracker row ticks (2/5 -> 3/5)
 *     with a short glow and a "+1" that floats up beside the number ('tracker');
 *   - any other item picked up, harvested, cooked or bought: a small line in the pickup list by the backpack button,
 *     "🥩 Meat ×3", merged with the same item for a moment, gone after a few seconds ('pickups');
 *   - EXP and energy: their own numbers on the hero plate fill and show a small "+24" ('stat');
 *   - action feedback stays in the world over the hero or the creature: damage, CRIT, BREAK!, level-ups, catches and their
 *     sizes, warnings, small heals ('centre').
 * This file is the rule and the bookkeeping, pure (tests/gain-feed.test.ts); gain-feed-ui.ts draws it and writes to the page
 * only when a gain happens, never once a frame.
 */

export type GainKind = 'item' | 'xp' | 'energy' | 'heal' | 'damage' | 'crit' | 'level' | 'catch' | 'warn' | 'note';
export type GainPlace = 'tracker' | 'pickups' | 'stat' | 'centre';
/** The one routing table. `advanced`: this gain moved a tracker row on (TaskWatch). */
export function gainPlace(kind: GainKind, advanced = false): GainPlace {
  if (kind === 'item') return advanced ? 'tracker' : 'pickups';
  if (kind === 'xp' || kind === 'energy') return 'stat';
  return 'centre';
}

export const PICKUP = {
  /** The same item picked up again within this many ms adds to its line (×N) instead of a new line. */
  merge: 2000,
  /** A line fades this many ms after it was last added to. */
  life: 3000,
  /** Lines shown at once: newest on top, the oldest leaves first. Phones keep two. */
  max: 3, maxPhone: 2,
} as const;

export interface PickupLine { uid: number; id: string; count: number; at: number }
/** What one add did: the line it wrote (new or merged) and the lines pushed out to keep within `max`. */
export interface PickupChange { line: PickupLine; merged: boolean; dropped: PickupLine[] }
/** The list's lines, newest first. No timers here: the view asks `expire(now)` when `nextExpiry()` comes. */
export class PickupList {
  lines: PickupLine[] = [];
  private uid = 0;
  add(id: string, count: number, now: number, max: number = PICKUP.max): PickupChange {
    const i = this.lines.findIndex(l => l.id === id && now - l.at <= PICKUP.merge);
    if (i >= 0) { const line = this.lines[i]; line.count += count; line.at = now; if (i) { this.lines.splice(i, 1); this.lines.unshift(line); } return { line, merged: true, dropped: this.trim(max) }; }
    const line = { uid: ++this.uid, id, count, at: now }; this.lines.unshift(line);
    return { line, merged: false, dropped: this.trim(max) };
  }
  /** Lines whose time is up, removed from the list. */
  expire(now: number): PickupLine[] { const gone = this.lines.filter(l => now - l.at >= PICKUP.life); if (gone.length) this.lines = this.lines.filter(l => now - l.at < PICKUP.life); return gone; }
  /** When the next line fades (ms on the same clock), or null when the list is empty. */
  nextExpiry(): number | null { return this.lines.length ? Math.min(...this.lines.map(l => l.at)) + PICKUP.life : null; }
  private trim(max: number) { return this.lines.length > max ? this.lines.splice(Math.max(1, max)) : []; }
}

export type TaskRowId = 'quest' | 'bounty' | 'chal';
/** A tracker row moved on within this many ms counts as moved by the gain being told now: the HUD redraw that ticked it runs
    in the same action (change() -> updateHud) just before the gain's feedback, or, online, as the confirmed state arrives. */
export const TICK_WINDOW = 250;
/**
 * The tracker rows as last seen: each row's task (its key) and count. `see` is called with what the HUD shows; it answers
 * how far the row moved on since last time (0 when it did not, or when the row now holds a different task: a new quest step
 * or a new bounty starts without a tick). Rows are kept in place and updated, so the HUD's 8-a-second redraw allocates nothing.
 */
export class TaskWatch {
  private rows: Record<TaskRowId, { key: string | number | null; progress: number }> = { quest: { key: null, progress: 0 }, bounty: { key: null, progress: 0 }, chal: { key: null, progress: 0 } };
  lastTick = -Infinity;
  see(row: TaskRowId, key: string | number | null, progress: number, now: number): number {
    const r = this.rows[row], same = key !== null && r.key === key, delta = same ? progress - r.progress : 0;
    r.key = key; r.progress = progress;
    if (delta > 0) { this.lastTick = now; return delta; }
    return 0;
  }
  /** Forgets every row: the next look is a baseline (a save loaded, a profile switched, play not started yet). */
  reset() { for (const r of Object.values(this.rows)) { r.key = null; r.progress = 0; } this.lastTick = -Infinity; }
  /** True when a row ticked within TICK_WINDOW of `now`. */
  recent(now: number) { return now - this.lastTick <= TICK_WINDOW; }
}
