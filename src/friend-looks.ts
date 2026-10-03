import { DEFAULT_LOOK, lookPrice, missingOptions, ownsLook, splitLook, toLook, type LookId, type Looks } from './looks.ts';
import type { Friend, FriendId } from './friends-state.ts';

/**
 * A rescued friend's look: the mirror's four choices (body, height, ears, animal hood), chosen per friend from its
 * panel in the cottage (friend-looks-ui.ts) and saved on the friend (Friend.look). Pure rules, run by the client and
 * the server alike (actions.ts 'friendLook').
 *
 * Ownership: options belong to the player, not to a friend. An option the player owns (bought at the mirror, or one
 * of the free ones) dresses any friend for free; an option not owned yet shows its mirror price in the friend's tab
 * and can be bought right there, which unlocks it for the explorer and every friend too. So nothing is ever paid
 * twice (a fox hood bought for Sprout also dresses you and Pepper), the mirror's prices keep their meaning, and the
 * friend tab doubles as a second window onto the mirror's shop.
 *
 * Height: a friend's height option picks the body file, so it sets the proportions (Tiny: a big-headed toddler,
 * Grown-up: about five heads tall), and growth (growth.ts) still sets how tall the friend stands: 0.5, then 0.75,
 * then 0.8 of the explorer's height whatever the option. friend-view.ts divides the body file's own height out
 * (looks.ts HEIGHT_RATIO), so a Grown-up friend never outgrows the explorer, and every stage reads the same indoors
 * and out.
 */
export const friendLook = (f: Pick<Friend, 'look'> | undefined): LookId => toLook(f?.look) ?? DEFAULT_LOOK;
/** Whether a look puts something on the friend's head (ears or a hood): then the work hat stays off (friend-view.ts). */
export const showsHead = (look: LookId) => { const l = splitLook(look); return l.ears !== 'none' || l.deco !== 'bare'; };

interface HasFriendLooks { energy: number; looks?: Looks; friends?: Friend[] }
/**
 * Dresses a friend in a combination. Options the player owns are free; with `buy` the missing ones are bought first
 * (and stay owned, for the explorer too) without changing the explorer's own look. False when the friend or the look
 * is unknown, when something is missing and `buy` is off or the energy is short, or when nothing would change.
 */
export function setFriendLook(s: HasFriendLooks, id: FriendId, raw: unknown, buy = false): boolean {
  const f = s.friends?.find(x => x.id === id), look = toLook(raw); if (!f || !look) return false;
  const missing = missingOptions(s, look), price = lookPrice(s, look);
  if (missing.length) {
    if (!buy || s.energy < price) return false;
    s.energy -= price; s.looks ??= { owned: [], style: DEFAULT_LOOK }; s.looks.owned.push(...missing);
  } else if (friendLook(f) === look) return false;
  if (look === DEFAULT_LOOK) delete f.look; else f.look = look;
  return true;
}
/** A save's friends may only wear options their owner owns (model.ts parseSave, after the owner's looks). */
export function dropUnownedFriendLooks(s: { looks?: Looks; friends?: Friend[] }) {
  for (const f of s.friends ?? []) if (f.look && !ownsLook(s, f.look)) delete f.look;
}
