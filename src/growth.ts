import type { Friend } from './friends-state.ts';

/**
 * Rescued friends grow up: half the explorer's height when freed, then 0.75, then 0.8 (never taller than the explorer,
 * so the explorer still reads as the hero). A stage is reached by EITHER time at home OR work done, whichever comes first:
 * - time (1 day, then 3 days after the rescue) so a player who checks in daily sees them grow even on a slow farm;
 * - jobs (40, then 150) so a busy session is rewarded: a gardener on 8-16 beds does roughly 15-30 jobs an hour,
 *   so the first step comes in the second or third session and the last in about a week of normal play.
 * Stages are saved (`grown`) and never go back, so a friend that grew stays grown after a reset of the day counter.
 */
export const GROWTH = [
  { height: .5, days: 0, jobs: 0 },
  { height: .75, days: 1, jobs: 40 },
  { height: .8, days: 3, jobs: 150 },
] as const;
const DAY = 86_400_000;
/** The stage the friend has earned by now (from its rescue time and jobs). */
export function earnedStage(f: Pick<Friend, 'rescuedAt' | 'jobs'>, now: number) {
  const days = f.rescuedAt > 0 && now > f.rescuedAt ? (now - f.rescuedAt) / DAY : 0, jobs = f.jobs ?? 0;
  let stage = 0;
  GROWTH.forEach((g, i) => { if (i && (days >= g.days || jobs >= g.jobs)) stage = i; });
  return stage;
}
/** The saved stage (0-2). */
export const friendStage = (f: Pick<Friend, 'grown'> | undefined) => Math.max(0, Math.min(GROWTH.length - 1, f?.grown ?? 0));
/** Height as a fraction of the explorer's. */
export const friendHeight = (stage: number) => GROWTH[Math.max(0, Math.min(GROWTH.length - 1, stage))].height;
/** Moves the friend up to the stage it has earned; returns true when it grew just now. */
export function growUp(f: Friend, now: number): boolean {
  const stage = Math.max(friendStage(f), earnedStage(f, now));
  if (stage <= friendStage(f)) return false;
  f.grown = stage; return true;
}
