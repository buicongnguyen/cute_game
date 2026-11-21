/**
 * The Ember Well's trade-off view (solo play): what each of the four choices pays, and the sleeping well's daily gift.
 * Client only and its own small chunk: main.ts wellDialog fetches it when the well opens and appends it under the lid
 * buttons, so none of it is in the start download. Its Vietnamese is src/features-vi/colossus-well.ts.
 *
 * It imports nothing at run time (types only): a run-time import of start code from a lazy chunk makes Rollup split
 * the start chunks anew (about 1.3 KB more to fetch at start, measured), and handing every number in through main.ts
 * costs start bytes too. So main.ts hands in only the translator and the bag, and WELL_PAY below is this view's copy
 * of the pay numbers for display; tests/colossus-sleep.test.ts fails when one differs from the rules.
 *
 * The rules themselves: grantColossusReward in colossus-rewards.ts (shared with the server, which only ever pays the
 * wild rate) and colossusPay in colossus.ts (who is paid which rate, solo):
 *   Let it wake   - the full fight: all the EXP, the loot and the Cinderhorn Crown roll;
 *   Soothe it     - the gentle fight: a fifth of the EXP, the loot without the crown roll, plus 2 fire seeds;
 *   Automatic     - asleep below level 20, soothed from 20 on; its first soothed win pays in full, later ones the soothed rate;
 *   Lower the lid - no fight; the warm well gives 1 Fertilizer once per local day per profile slot, inside the bag limit.
 * The final blow brings Little Cinderpeak whatever the lid.
 */
import type { SaveState } from './model.ts';

/**
 * What the view shows. Display copies of the rules' numbers (see the top of the file): the Colossus's EXP
 * (COLOSSUS_STATS.xp), the soothed share and seeds (colossus-rewards.ts SOOTHED_XP, SOOTHED_GIFT), the crown's chance and
 * the two names (colossus-content.ts), Automatic's rule and its flag (colossus.ts AUTO_ALWAYS_FULL, AUTO_PAID_KEY).
 * `gift` is the rule itself: the sleeping well's daily gift exists only here.
 */
export const WELL_PAY = { xp: 30000, soothedXp: .2, seeds: 2, crownChance: .15, crown: 'Cinderhorn Crown', pet: 'Little Cinderpeak', autoFull: false, paidKey: 'zoo-colossus-auto-paid', gift: ['manure', 1] as readonly [string, number] };
/** Where this device remembers the local day of a profile slot's last well gift. */
const WELL_GIFT_KEY = 'zoo-well-gift';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const storage = (): Store | null => { try { return globalThis.localStorage; } catch { return null; } };
const read = (store: Store | null, key: string) => { try { return store!.getItem(key); } catch { return null; } };
/** The player's own calendar day (the gift comes back at their midnight, not at UTC's). */
export const wellDay = (now: number) => new Date(now).toDateString();

/** The bag, as the game's rules see it (main.ts hands in storage-slots.ts fits and model.ts addItem). */
export interface WellBag {
  /** True when the bag has room for these items. */
  fits(s: SaveState, items: Record<string, number>): boolean;
  /** Puts an item in the bag, inside its slot limit; false when refused. */
  add(s: SaveState, id: string, count: number): boolean;
}
/** Today's gift on this slot: 'taken', 'full' (no room in the bag: it waits) or 'ready'. */
export function wellGift(bag: WellBag, s: SaveState, slot: string, now: number, store: Store | null = storage()): 'ready' | 'taken' | 'full' {
  if (read(store, `${WELL_GIFT_KEY}:${slot}`) === wellDay(now)) return 'taken';
  return bag.fits(s, { [WELL_PAY.gift[0]]: WELL_PAY.gift[1] }) ? 'ready' : 'full';
}
/**
 * Takes today's gift: 1 Fertilizer into the bag, once per local day per profile slot. Call it inside the game's
 * state-change path (the host's `change`, as the Colossus reward is). False when it was taken today, the bag has no
 * room, or the day cannot be remembered (a private window: no gift rather than an endless one).
 */
export function takeWellGift(bag: WellBag, s: SaveState, slot: string, now: number, store: Store | null = storage()): boolean {
  const key = `${WELL_GIFT_KEY}:${slot}`;
  if (wellGift(bag, s, slot, now, store) !== 'ready') return false; // there is room, so the add below goes through
  try { store!.setItem(key, wellDay(now)); } catch { return false; }
  return read(store, key) === wellDay(now) && bag.add(s, WELL_PAY.gift[0], WELL_PAY.gift[1]);
}

/** What the text needs: the game's translator and HTML escape, and the language for the numbers (the page's own when left out). */
export interface WellWords {
  t(source: string, params?: Record<string, string | number>): string;
  esc(text: string): string;
  lang?: string;
}
export interface WellView {
  /** Automatic's full-pay kill is used on this slot: its row says so. */
  autoPaid?: boolean;
  /** The gift row: shown only while the lid in force is 'asleep'. */
  gift?: 'ready' | 'taken' | 'full' | null;
}
/** The four choices, Automatic first, each with what it pays, then the pet rule and (lid down) today's gift. */
export function wellChoicesHtml({ t, esc, lang }: WellWords, view: WellView = {}): string {
  const pay = WELL_PAY, vi = (lang ?? globalThis.document?.documentElement.lang) === 'vi', num = (n: number) => n.toLocaleString(vi ? 'vi' : 'en');
  const xp = num(pay.xp), soothedXp = num(pay.xp * pay.soothedXp), seeds = pay.seeds, gift = `${pay.gift[1]} ${t('Fertilizer')}`;
  const wild = t('The full fight: {xp} EXP, the loot and a {chance}% chance of the {crown}.', { xp, chance: Math.round(pay.crownChance * 100), crown: t(pay.crown) });
  const rows = [
    ['auto', '🌙', 'Automatic', pay.autoFull ? wild : view.autoPaid ? t('The full-pay win is used: soothed wins pay {xp} EXP and {seeds} fire seeds.', { xp: soothedXp, seeds }) : t('The first soothed win pays in full ({xp} EXP), later ones the soothed reward.', { xp })],
    ['wild', '🌋', 'Let it wake', wild],
    ['soothed', '💧', 'Soothe it', t('The gentle fight: {xp} EXP (a fifth), the loot without the crown, plus {seeds} fire seeds.', { xp: soothedXp, seeds })],
    ['asleep', '🪨', 'Lower the lid', t('No fight and no spoils. The warm well gives {gift} a day.', { gift })],
  ];
  // Styled in place (no sheet to inject, and none in the start): every line is 13 px (the HUD rule is 11), the gift button a 44 px target, and lines wrap at 320 px.
  const line = (html: string, id = '') => `<p${id && ` data-well-pay="${id}"`} style="margin:0;padding:6px 0;border-top:1px solid #0002;font-size:13px">${html}</p>`;
  const g = view.gift, today = !g ? '' : line(`🌱 <b>${esc(t(g === 'taken' ? 'Today’s {gift} is taken. Come back tomorrow.' : g === 'full' ? 'Bag full: make room for today’s {gift}.' : 'The sleeping giant warms the soil: {gift} is ready.', { gift }))}</b>${g === 'ready' ? `<br><button class="primary" style="min-height:44px" data-well-gift>${esc(t('Take it'))}</button>` : ''}`);
  return `<section class="well-pays"><h3 class="section-label">${esc(t('What each choice pays'))}</h3>${today}${rows.map(([id, icon, name, pays]) => line(`${icon} <b>${esc(t(name))}</b><br>${esc(pays)}`, id)).join('')}${line(`🐾 ${esc(t('Wild or soothed, the final blow brings {pet}.', { pet: t(pay.pet) }))}`)}</section>`;
}

/** What the view needs from the game (main.ts wellDialog hands it over). */
export interface WellHost extends WellWords, WellBag {
  state(): SaveState;
  /** The game's state-change path (level check, save, HUD), the one the Colossus reward goes through. */
  change<R>(fn: () => R): R;
  toast(message: string, icon?: string): void;
  /** The profile slot's save key (profiles.ts activeKey). */
  slot: string;
  /** The lid in force (colossus-sleep.ts colossusLid): the gift shows while it is 'asleep' (the player's lid, or Automatic below level 20). */
  lid: string;
}
/** Appends the view to the open well dialog (once per render) and wires the gift button. */
export function mountWell(body: HTMLElement, h: WellHost) {
  const draw = () => {
    body.querySelector('.well-pays')?.remove();
    body.insertAdjacentHTML('beforeend', wellChoicesHtml(h, { autoPaid: read(storage(), `${WELL_PAY.paidKey}:${h.slot}`) === '1', gift: h.lid === 'asleep' ? wellGift(h, h.state(), h.slot, Date.now()) : null }));
    body.querySelector<HTMLButtonElement>('[data-well-gift]')?.addEventListener('click', () => {
      if (h.change(() => takeWellGift(h, h.state(), h.slot, Date.now()))) h.toast(`+${WELL_PAY.gift[1]} ${h.t('Fertilizer')}`, '🌱');
      draw();
    });
  };
  draw();
}

// This chunk's side effect, which keeps it its own file: Rollup folds a small chunk without one into the start download
// (experimentalMinChunkSize in vite.config.ts; the same kind of line is in features.ts).
(globalThis as { zooWell?: boolean }).zooWell = true;
