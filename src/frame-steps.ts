/**
 * The game simulates in fixed 25 ms steps and draws once per frame. A frame runs at most four
 * steps (0.1 s of game time) and drops the rest, so a stall shows as a moment of slow motion.
 * Without the cap a slow step makes the next frame longer, which then needs even more steps:
 * on a phone-class CPU that spiral ends at one frame a second.
 */
export const STEP = .025, MAX_STEPS = 4;

/** The fixed steps to simulate for a frame that advanced the game clock by `dt` seconds. */
export function frameSteps(dt: number): number[] {
  const steps: number[] = [];
  for (let remaining = Math.min(dt, STEP * MAX_STEPS); remaining > 1e-6 && steps.length < MAX_STEPS; remaining -= STEP) steps.push(Math.min(STEP, remaining));
  return steps;
}
