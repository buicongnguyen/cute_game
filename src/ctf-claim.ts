/**
 * Flag Rush rewards through the shared action rules (actions.ts 'ctfClaim'): offline they run in the browser, and when
 * matches go online the server applies the same function with its own clock. A claim is checked against the clock (a
 * match cannot be claimed faster than it could be played), each match pays once, and six matches a day pay EXP.
 * Winners get the big share; captures, returns and knock-downs add a little (ctf-rules.ts matchXp).
 */
import * as Game from './model.ts';
import { CTF } from './ctf-content.ts';
import { CTF_REWARD, matchXp } from './ctf-rules.ts';
import type { CtfSave } from './ctf-save.ts';

/** Flag Rush days turn at midnight in Vietnam (UTC+7), like the vault's. */
export const ctfDay = (now: number) => new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
export function rewardedLeft(s: { ctf?: CtfSave }, now: number) { const c = s.ctf; return Math.max(0, CTF_REWARD.perDay - (c && c.day === ctfDay(now) ? c.rewarded : 0)); }
const MAX_SECONDS = CTF.intro + CTF.time + CTF.overtime + 30;
export interface CtfClaim { matchId: string; won: boolean; draw: boolean; caps: number; rets: number; kills: number; size: number; seconds: number }
export interface CtfClaimResult { xp: number; left: number; level: number }
export function claimMatch(s: Game.SaveState, c: CtfClaim, now: number): CtfClaimResult | false {
  if (!/^[\w-]{4,64}$/.test(c.matchId) || typeof c.won !== 'boolean' || typeof c.draw !== 'boolean' || (c.won && c.draw)) return false;
  for (const v of [c.caps, c.rets, c.kills, c.size, c.seconds]) if (!Number.isInteger(v) || v < 0) return false;
  if (!(CTF.sizes as readonly number[]).includes(c.size) || c.caps > CTF.win + 3 || c.seconds < CTF_REWARD.minSeconds || c.seconds > MAX_SECONDS) return false;
  const day = ctfDay(now), d: CtfSave = s.ctf ?? { day, rewarded: 0, played: 0, wins: 0, lastAt: 0, claimed: [] };
  if (d.claimed.includes(c.matchId)) return false;
  // No match ends sooner than it was played: two claims are at least the claimed match's length apart.
  if (d.lastAt && now - d.lastAt < c.seconds * 1000 * .9) return false;
  if (d.day !== day) { d.day = day; d.rewarded = 0; }
  d.played++; if (c.won) d.wins++; d.lastAt = now; d.claimed = [...d.claimed, c.matchId].slice(-12);
  let xp = 0;
  if (d.rewarded < CTF_REWARD.perDay) {
    const base = matchXp(c);
    if (base > 0) {
      // gainXp answers in levels gained: count the experience itself (with the explorer's EXP boosts) from before and after.
      const level = s.level, had = s.xp; Game.gainXp(s, base, now);
      let gained = s.xp - had; for (let l = level; l < s.level; l++) gained += Game.xpNeeded(l);
      xp = Math.round(gained); d.rewarded++;
    }
  }
  s.ctf = d;
  if (c.won) Game.recordEvent(s, 'ctf', 1, undefined, now);
  return { xp, left: Math.max(0, CTF_REWARD.perDay - d.rewarded), level: s.level };
}
