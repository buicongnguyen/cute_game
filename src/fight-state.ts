/**
 * When a fight is on (AAA-PLAN WP17, decision R13): then Attack never uses the thing beside the explorer
 * (attack-intent.ts). Loaded after Start with features/tutorial-fight.ts, which hands it to main.ts as world.lesson.fight.
 */
/**
 * What makes a fight. Metres: an angry creature this close, any living creature this close, a creature of the first fight
 * this close. Seconds: while the first fight step is on, a swing this short a time ago keeps Attack a swing wherever
 * its creatures are (one that fled to the garden and fell there leaves the others more than `lesson` m away).
 */
export const FIGHT = { aggro: 8, hostile: 6, lesson: 10, lessonSwing: 4 } as const;
/** A fallen creature of the first fight still counts while it comes back within this many seconds (first-run.ts CRITTER.respawn is 5; once the step is done it is 999,999). */
export const LESSON_BACK_S = 30;
interface Foe { x: number; z: number; hp: number; phase?: string; respawn?: number; tutorial?: boolean; mesh: { visible: boolean } }
/**
 * A fight is on at (x, z): a creature that has noticed someone (`aggro`) is within FIGHT.aggro m, any living creature is
 * within FIGHT.hostile m, or a creature of the first fight step (first-run.ts: they are about only while that step is on)
 * is within FIGHT.lesson m, alive or fallen and on its way back: between two of them Attack must not open the thing the
 * last one fell beside. While that step is on, the last swing (`sinceSwing` seconds ago) also counts for
 * FIGHT.lessonSwing s. Distances are to the creature's middle. No allocation: it runs on the HUD tick.
 */
/** A creature that has noticed someone (hud-combat.ts aggro). */
export const angry = (e: { phase?: string }) => !!e.phase && e.phase !== 'idle' && e.phase !== 'return';
export function inFight<E extends Foe>(enemies: readonly E[], x: number, z: number, aggro: (e: E) => boolean = angry, sinceSwing = Infinity): boolean {
  for (const e of enemies) {
    const d = Math.hypot(e.x - x, e.z - z);
    if (e.tutorial && (d < FIGHT.lesson || sinceSwing < FIGHT.lessonSwing) && (e.hp > 0 || (e.respawn ?? Infinity) < LESSON_BACK_S)) return true;
    if (!(e.hp > 0) || !e.mesh.visible) continue;
    if (d < FIGHT.hostile || d < FIGHT.aggro && aggro(e)) return true;
  }
  return false;
}
