/**
 * The explorer's character builder ("looks"), at the bedroom mirror: three independent choices that combine.
 *   body   boy | girl              (free: who you are is never paywalled)
 *   height chibi | teen | tall     (teen 80, tall 120 energy)
 *   ears   none | cat | bunny      (cat 150, bunny 150; each comes with its tail)
 * Owning an option unlocks it for both bodies and every combination, and switching between owned options is free.
 * Prices: the old Tall look cost 120 and stays 120; teen is a smaller step. Ears were sold with a whole body at 180
 * (Cat boy / Bunny girl); on their own they are a little cheaper, still between a hat and an outfit. Cosmetic only:
 * stats, hitboxes and HERO_SCALE are the same for every combination.
 *
 * Pure state (no three.js) so model.ts parses it and the server runs the same rules (actions.ts buyLook / wearLook).
 * The art is art/blender/kit/build_hero_styles.py: one file per body x height (bodyFile) plus hero-parts.glb with the
 * ears and tails, placed with FIT and merged into the head/body meshes at load (assets.ts heroKitFor).
 * FIT is the per-part transform World.wearKit applies to a gear piece (and the parts file to ears and tails) after
 * placing it relative to the DEFAULT pivot, so every hat, outfit, boot and weapon fits every height without new art.
 */
export type Body = 'boy' | 'girl';
export type Height = 'chibi' | 'teen' | 'tall';
export type Ears = 'none' | 'cat' | 'bunny';
export type LookId = `${Body}-${Height}-${Ears}`;
export type LookOption = Body | Height | Ears;
export type LookRow = 'body' | 'height' | 'ears';
export interface Look { body: Body; height: Height; ears: Ears }
export interface Looks { owned: LookOption[]; style: LookId }
export interface Fit { scale: [number, number, number]; offset: [number, number, number] }

export const ROWS: Record<LookRow, readonly LookOption[]> = { body: ['boy', 'girl'], height: ['chibi', 'teen', 'tall'], ears: ['none', 'cat', 'bunny'] };
export const ROW_NAMES: Record<LookRow, string> = { body: 'Body', height: 'Height', ears: 'Ears' };
export const OPTIONS: Record<LookOption, { name: string; price: number; icon: string }> = {
  boy: { name: 'Boy', price: 0, icon: '👦' }, girl: { name: 'Girl', price: 0, icon: '👧' },
  chibi: { name: 'Chibi', price: 0, icon: '🧒' }, teen: { name: 'Teen', price: 80, icon: '🧑' }, tall: { name: 'Tall', price: 120, icon: '🧍' },
  none: { name: 'No ears', price: 0, icon: '🙂' }, cat: { name: 'Cat ears', price: 150, icon: '🐱' }, bunny: { name: 'Bunny ears', price: 150, icon: '🐰' },
};
export const DEFAULT_LOOK: LookId = 'boy-chibi-none';
export const LOOK_IDS: readonly LookId[] = ROWS.body.flatMap(b => ROWS.height.flatMap(h => ROWS.ears.map(e => `${b}-${h}-${e}` as LookId)));
/** The old single-choice looks (saves and presence from before the builder). */
const LEGACY: Record<string, { style: LookId; owns: LookOption[] }> = {
  default: { style: DEFAULT_LOOK, owns: [] }, tall: { style: 'boy-tall-none', owns: ['tall'] },
  catboy: { style: 'boy-chibi-cat', owns: ['cat'] }, bunny: { style: 'girl-chibi-bunny', owns: ['bunny'] },
};
const isOption = (v: unknown): v is LookOption => typeof v === 'string' && Object.hasOwn(OPTIONS, v);
export const isLook = (v: unknown): v is LookId => typeof v === 'string' && (LOOK_IDS as readonly string[]).includes(v);
/** A combination id, or an old look id mapped onto the builder; anything else is undefined. */
export const toLook = (v: unknown): LookId | undefined => isLook(v) ? v : typeof v === 'string' && Object.hasOwn(LEGACY, v) ? LEGACY[v].style : undefined;
export const splitLook = (id: LookId): Look => { const [body, height, ears] = id.split('-') as [Body, Height, Ears]; return { body, height, ears }; };
export const joinLook = (l: Look): LookId => `${l.body}-${l.height}-${l.ears}`;
export const lookOptions = (id: LookId): LookOption[] => { const l = splitLook(id); return [l.body, l.height, l.ears]; };
/** The body x height file (build_hero_styles.py body_file); the boy chibi is the default hero.glb. */
export const bodyFile = (body: Body, height: Height) => body === 'boy' && height === 'chibi' ? 'hero.glb' : `hero-${[...(body === 'girl' ? ['girl'] : []), ...(height === 'chibi' ? [] : [height])].join('-')}.glb`;

/** hero_spec.PIVOTS (and HANDS) in three.js space: where gear (and ears, tails) is modelled, before a height's FIT moves it. */
export const DEFAULT_PIVOTS: Record<string, [number, number, number]> = { body: [0, .85, 0], head: [0, 1.12, 0], 'arm-left': [-.37, 1.08, -.02], 'arm-right': [.37, 1.08, -.02], 'leg-left': [-.18, .52, 0], 'leg-right': [.18, .52, 0], 'hand-left': [-.37, .72, .05], 'hand-right': [.37, .72, .05] };
/** Gear fit per hero part and height (three.js part space: scale, then offset); mirrors build_hero_styles.py fit_table. */
const fit = (head: number, tw: number, th: number, aw: number, al: number, e: number): Partial<Record<string, Fit>> => ({
  head: { scale: [head, head, head], offset: [0, 0, 0] },
  body: { scale: [tw, th, tw], offset: [0, 0, 0] },
  'arm-left': { scale: [aw, al, aw], offset: [0, 0, 0] },
  'arm-right': { scale: [aw, al, aw], offset: [0, 0, 0] },
  'leg-left': { scale: [1, 1, 1], offset: [0, -e, 0] },
  'leg-right': { scale: [1, 1, 1], offset: [0, -e, 0] },
  'hand-right': { scale: [1, 1, 1], offset: [0, 0, 0] },
});
export const FIT: Record<Height, Partial<Record<string, Fit>>> = { chibi: {}, teen: fit(.9, .9, 1.08, .94, 1.22, .2), tall: fit(.76, .8, 1.2, .86, 1.55, .46) };

/** Saves from before looks have no `looks` (undefined: the default, nothing owned); old single looks migrate. */
export function parseLooks(raw: unknown): Looks | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>, owned = new Set<LookOption>();
  for (const v of Array.isArray(r.owned) ? r.owned : []) {
    if (typeof v === 'string' && Object.hasOwn(LEGACY, v)) LEGACY[v].owns.forEach(o => owned.add(o));
    else if (isOption(v) && OPTIONS[v].price > 0) owned.add(v);
  }
  const list = [...owned], wanted = toLook(r.style) ?? DEFAULT_LOOK;
  const style = lookOptions(wanted).every(o => OPTIONS[o].price === 0 || owned.has(o)) ? wanted : DEFAULT_LOOK;
  return list.length || style !== DEFAULT_LOOK ? { owned: list, style } : undefined;
}
interface HasLooks { energy: number; looks?: Looks }
export const lookOf = (s: { looks?: Looks }): LookId => toLook(s.looks?.style) ?? DEFAULT_LOOK;
export const ownsOption = (s: { looks?: Looks }, o: LookOption) => OPTIONS[o]?.price === 0 || !!s.looks?.owned.includes(o);
/** The options of a combination still to buy. */
export const missingOptions = (s: { looks?: Looks }, id: LookId) => lookOptions(id).filter(o => !ownsOption(s, o));
export const lookPrice = (s: { looks?: Looks }, id: LookId) => missingOptions(s, id).reduce((n, o) => n + OPTIONS[o].price, 0);
export const ownsLook = (s: { looks?: Looks }, id: unknown) => { const look = toLook(id); return !!look && missingOptions(s, look).length === 0; };
/** The combination with one option changed (the row is the option's own). */
export function swapOption(id: LookId, o: LookOption): LookId {
  const l = splitLook(id);
  if ((ROWS.body as readonly string[]).includes(o)) l.body = o as Body; else if ((ROWS.height as readonly string[]).includes(o)) l.height = o as Height; else l.ears = o as Ears;
  return joinLook(l);
}
/**
 * Buys and wears. `id` is a whole combination (every missing option is bought at once) or one option (bought and
 * swapped into the worn combination). False if unknown, nothing to buy or too dear.
 */
export function buyLook(s: HasLooks, id: unknown): boolean {
  const look = isLook(id) ? id : isOption(id) ? swapOption(lookOf(s), id) : undefined; if (!look) return false;
  const missing = missingOptions(s, look), price = lookPrice(s, look);
  if (!missing.length || s.energy < price) return false;
  s.energy -= price; s.looks ??= { owned: [], style: DEFAULT_LOOK }; s.looks.owned.push(...missing); s.looks.style = look; return true;
}
/** Switches to a combination of owned options (free). Old look ids are accepted. */
export function wearLook(s: HasLooks, id: unknown): boolean {
  const look = toLook(id); if (!look || !ownsLook(s, look)) return false;
  s.looks ??= { owned: [], style: DEFAULT_LOOK }; s.looks.style = look; return true;
}
