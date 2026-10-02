/**
 * Who sees the workers' gain effects. The user's rule (2026-10-02): the flying orbs, "+N" floats, bursts and harvest
 * sounds from the helpers' and friends' work (Bolt the garden robot, the pen robot, Sprout, Clover and Pepper) play
 * only while the explorer is outdoors in the home village, where the work is in view. Inside the cottage, out in the
 * wilds or on another planet they are skipped: the items still arrive (to the chest while away, delivery.ts) and the
 * return summary card still tells what was done. The explorer's own gains (fights, own harvest, fishing, drops) keep
 * their effects everywhere.
 */
export type GainSource = 'own' | 'worker';
export interface GainPlace { planet: string; indoors: boolean; away: boolean }
export function showsGain(source: GainSource, at: GainPlace) {
  return source === 'own' || at.planet === 'home' && !at.indoors && !at.away;
}
