/**
 * The explorer's character builder ("looks"), at the bedroom mirror: four independent choices that combine.
 *   body   boy | girl | sturdy | slim          (free: who you are is never paywalled)
 *   height tiny | chibi | teen | tall | grown  (tiny 80, teen 80, tall 120, grown 160 energy)
 *   ears   none | cat | bunny                  (cat 150, bunny 150; each comes with its tail)
 *   deco   bare | twelve animal hoods          (110-140 energy)
 * Builds: sturdy is the boy file made broader at load, slim the girl file made slender (BUILD), so a build reads from the
 * high game camera under every hat and hood (hair styles would hide under them) and costs no new files. Grown is the most
 * human height (about five heads tall). A head decoration rides where the ears do (head-leaf): it brings its own ears,
 * so the Ears row's ears are left off while it is worn (the tail stays), and a hat covers it (one thing on the head).
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
export type Body = 'boy' | 'girl' | 'sturdy' | 'slim';
export type Height = 'tiny' | 'chibi' | 'teen' | 'tall' | 'grown';
export type Ears = 'none' | 'cat' | 'bunny';
export type Deco = 'bare' | 'bear' | 'panda' | 'fox' | 'kitty' | 'frog' | 'piggy' | 'chick' | 'koala' | 'tiger' | 'penguin' | 'monkey' | 'owl';
export type LookId = `${Body}-${Height}-${Ears}-${Deco}`;
export type LookOption = Body | Height | Ears | Deco;
export type LookRow = 'body' | 'height' | 'ears' | 'deco';
export interface Look { body: Body; height: Height; ears: Ears; deco: Deco }
export interface Looks { owned: LookOption[]; style: LookId }
export interface Fit { scale: [number, number, number]; offset: [number, number, number] }

export const DECOS = ['bear', 'panda', 'fox', 'kitty', 'frog', 'piggy', 'chick', 'koala', 'tiger', 'penguin', 'monkey', 'owl'] as const;
export const ROWS: Record<LookRow, readonly LookOption[]> = { body: ['boy', 'girl', 'sturdy', 'slim'], height: ['tiny', 'chibi', 'teen', 'tall', 'grown'], ears: ['none', 'cat', 'bunny'], deco: ['bare', ...DECOS] };
export const ROW_NAMES: Record<LookRow, string> = { body: 'Body', height: 'Height', ears: 'Ears', deco: 'Head decoration' };
/** `art`: a Blender portrait at assets/icons/looks/<id>.webp (build_hero_styles.py render_deco_icons); the emoji is its alt. */
export const OPTIONS: Record<LookOption, { name: string; price: number; icon: string; art?: boolean }> = {
  boy: { name: 'Boy', price: 0, icon: '👦' }, girl: { name: 'Girl', price: 0, icon: '👧' }, sturdy: { name: 'Sturdy', price: 0, icon: '💪' }, slim: { name: 'Slim', price: 0, icon: '🌿' },
  tiny: { name: 'Tiny', price: 80, icon: '👶' }, chibi: { name: 'Chibi', price: 0, icon: '🧒' }, teen: { name: 'Teen', price: 80, icon: '🧑' }, tall: { name: 'Tall', price: 120, icon: '🧍' }, grown: { name: 'Grown-up', price: 160, icon: '🚶' },
  none: { name: 'No ears', price: 0, icon: '🙂' }, cat: { name: 'Cat ears', price: 150, icon: '🐱' }, bunny: { name: 'Bunny ears', price: 150, icon: '🐰' },
  bare: { name: 'No hood', price: 0, icon: '✨' },
  bear: { name: 'Bear hood', price: 110, icon: '🐻', art: true }, panda: { name: 'Panda hood', price: 130, icon: '🐼', art: true }, fox: { name: 'Fox hood', price: 120, icon: '🦊', art: true },
  kitty: { name: 'Kitty hood', price: 110, icon: '🐱', art: true }, frog: { name: 'Frog hood', price: 110, icon: '🐸', art: true }, piggy: { name: 'Piggy hood', price: 110, icon: '🐷', art: true },
  chick: { name: 'Chick hood', price: 110, icon: '🐥', art: true }, koala: { name: 'Koala hood', price: 130, icon: '🐨', art: true }, tiger: { name: 'Tiger hood', price: 140, icon: '🐯', art: true },
  penguin: { name: 'Penguin hood', price: 120, icon: '🐧', art: true }, monkey: { name: 'Monkey hood', price: 120, icon: '🐵', art: true }, owl: { name: 'Owl hood', price: 130, icon: '🦉', art: true },
};
export const DEFAULT_LOOK: LookId = 'boy-chibi-none-bare';
export const LOOK_IDS: readonly LookId[] = ROWS.body.flatMap(b => ROWS.height.flatMap(h => ROWS.ears.flatMap(e => ROWS.deco.map(d => [b, h, e, d].join('-') as LookId))));
const LOOK_SET = new Set<string>(LOOK_IDS);
/** The old single-choice looks (saves and presence from before the builder). */
const LEGACY: Record<string, { style: LookId; owns: LookOption[] }> = {
  default: { style: DEFAULT_LOOK, owns: [] }, tall: { style: 'boy-tall-none-bare', owns: ['tall'] },
  catboy: { style: 'boy-chibi-cat-bare', owns: ['cat'] }, bunny: { style: 'girl-chibi-bunny-bare', owns: ['bunny'] },
};
const isOption = (v: unknown): v is LookOption => typeof v === 'string' && Object.hasOwn(OPTIONS, v);
export const isLook = (v: unknown): v is LookId => typeof v === 'string' && LOOK_SET.has(v);
/**
 * A combination id, or an older id mapped onto the builder: the three-part ids of the first builder ('girl-tall-cat',
 * in saves and in presence from older clients) gain no decoration; the single looks before that map by LEGACY.
 */
export const toLook = (v: unknown): LookId | undefined => isLook(v) ? v : typeof v !== 'string' ? undefined
  : Object.hasOwn(LEGACY, v) ? LEGACY[v].style : isLook(v + '-bare') ? (v + '-bare') as LookId : undefined;
export const splitLook = (id: LookId): Look => { const [body, height, ears, deco = 'bare'] = id.split('-') as [Body, Height, Ears, Deco?]; return { body, height, ears, deco }; };
export const joinLook = (l: Look): LookId => `${l.body}-${l.height}-${l.ears}-${l.deco}`;
export const lookOptions = (id: LookId): LookOption[] => { const l = splitLook(id); return [l.body, l.height, l.ears, l.deco]; };
/** Which row an option belongs to. */
export const rowOf = (o: LookOption) => (Object.keys(ROWS) as LookRow[]).find(r => ROWS[r].includes(o))!;
/** The Blender body a build starts from: sturdy is the boy made broader, slim the girl made slender. */
export const baseBody = (body: Body): 'boy' | 'girl' => body === 'sturdy' ? 'boy' : body === 'slim' ? 'girl' : body;
/** The body x height file (build_hero_styles.py body_file); the boy chibi is the default hero.glb. */
export const bodyFile = (body: Body, height: Height) => { const b = baseBody(body); return b === 'boy' && height === 'chibi' ? 'hero.glb' : `hero-${[...(b === 'girl' ? ['girl'] : []), ...(height === 'chibi' ? [] : [height])].join('-')}.glb`; };

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
export const FIT: Record<Height, Partial<Record<string, Fit>>> = { tiny: fit(1.1, 1.04, .88, 1, .9, -.1), chibi: {}, teen: fit(.9, .9, 1.08, .94, 1.22, .2), tall: fit(.76, .8, 1.2, .86, 1.55, .46), grown: fit(.52, .74, 1.5, .8, 3, 1.1) };
/**
 * Builds (mirrors build_hero_styles.py BUILDS), applied at load to the base body's parts (assets.ts applyBuild):
 * torso [x, z] scale, limb thickness (x, z of arms and legs), shoulder and hip spread (the parts' x positions).
 */
export const BUILD: Partial<Record<Body, { torso: [number, number]; limb: number; spread: number; hips: number }>> = {
  sturdy: { torso: [1.2, 1.15], limb: 1.18, spread: 1.17, hips: 1.12 }, slim: { torso: [.86, .9], limb: .86, spread: .87, hips: .9 },
};
/** The gear fit of a whole combination: the height's FIT, then the build's widths (scale and offset both widen). */
export function fitOf(id: LookId): Partial<Record<string, Fit>> {
  const l = splitLook(id), base = FIT[l.height], b = BUILD[l.body]; if (!b) return base;
  const out: Partial<Record<string, Fit>> = { ...base }, one: Fit = { scale: [1, 1, 1], offset: [0, 0, 0] };
  const widen = (part: string, x: number, z: number) => { const f = base[part] ?? one; out[part] = { scale: [f.scale[0] * x, f.scale[1], f.scale[2] * z], offset: [f.offset[0] * x, f.offset[1], f.offset[2] * z] }; };
  widen('body', ...b.torso); for (const p of ['arm-left', 'arm-right', 'leg-left', 'leg-right']) widen(p, b.limb, b.limb);
  return out;
}

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
  const row = rowOf(o); if (row === 'body') l.body = o as Body; else if (row === 'height') l.height = o as Height; else if (row === 'ears') l.ears = o as Ears; else l.deco = o as Deco;
  return joinLook(l);
}
/**
 * Buys and wears. `id` is a whole combination (every missing option is bought at once) or one option (bought and
 * swapped into the worn combination). False if unknown, nothing to buy or too dear.
 */
export function buyLook(s: HasLooks, id: unknown): boolean {
  const look = isOption(id) ? swapOption(lookOf(s), id) : toLook(id); if (!look) return false;
  const missing = missingOptions(s, look), price = lookPrice(s, look);
  if (!missing.length || s.energy < price) return false;
  s.energy -= price; s.looks ??= { owned: [], style: DEFAULT_LOOK }; s.looks.owned.push(...missing); s.looks.style = look; return true;
}
/** Switches to a combination of owned options (free). Old look ids are accepted. */
export function wearLook(s: HasLooks, id: unknown): boolean {
  const look = toLook(id); if (!look || !ownsLook(s, look)) return false;
  s.looks ??= { owned: [], style: DEFAULT_LOOK }; s.looks.style = look; return true;
}
