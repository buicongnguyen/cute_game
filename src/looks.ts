/**
 * The explorer's character builder ("looks"), at the bedroom mirror: four independent choices that combine.
 *   body   boy | girl | man | woman | sturdy | slim   (free: who you are is never paywalled)
 *   height tiny | chibi | teen | tall | grown  (tiny 80, teen 80, tall 120, grown 160 energy)
 *   ears   none | cat | bunny                  (cat 150, bunny 150; each comes with its tail)
 *   deco   bare | twelve animal hoods          (110-140 energy)
 * Builds: sturdy is the boy file made broader at load, slim the girl file made slender (BUILD), so a build reads from the
 * high game camera under every hat and hood (hair styles would hide under them) and costs no new files. Grown is the most
 * human height (about five heads tall). From Teen up the boy and the girl are shaped apart (broader shoulders and a
 * straighter torso; narrower shoulders, a waist, a flared skirt and longer hair), more with every height, and Man and
 * Woman are the adults of the same family: that shaping a step stronger, he in long trousers and a little taller, she
 * in a longer dress with long hair (their own body files, same parts and pivots; SHAPE below is their gear fit). Tall
 * and Grown have a neck: the head rides higher on a skin column that belongs to the head part. A head decoration rides where the ears do (head-leaf): it brings its own ears,
 * so the Ears row's ears are left off while it is worn (the tail stays), and a hat covers it (one thing on the head).
 * Owning an option unlocks it for both bodies and every combination, and switching between owned options is free.
 * Prices: the old Tall look cost 120 and stays 120; teen is a smaller step. Ears were sold with a whole body at 180
 * (Cat boy / Bunny girl); on their own they are a little cheaper, still between a hat and an outfit. Body and accessories are cosmetic; height also sets a gentle walking pace.
 * Hitboxes and HERO_SCALE are the same for every combination.
 *
 * Pure state (no three.js) so model.ts parses it and the server runs the same rules (actions.ts buyLook / wearLook).
 * The art is art/blender/kit/build_hero_styles.py: one file per body x height (bodyFile) plus hero-parts.glb with the
 * ears and tails, placed with FIT and merged into the head/body meshes at load (assets.ts heroKitFor).
 * FIT is the per-part transform World.wearKit applies to a gear piece (and the parts file to ears and tails) after
 * placing it relative to the DEFAULT pivot, so every hat, outfit, boot and weapon fits every height without new art.
 */
export type Body = 'boy' | 'girl' | 'man' | 'woman' | 'sturdy' | 'slim';
/** The bodies that have their own Blender files (sturdy and slim are builds of the boy's and the girl's). */
export type FileBody = 'boy' | 'girl' | 'man' | 'woman';
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
export const ROWS: Record<LookRow, readonly LookOption[]> = { body: ['boy', 'girl', 'man', 'woman', 'sturdy', 'slim'], height: ['tiny', 'chibi', 'teen', 'tall', 'grown'], ears: ['none', 'cat', 'bunny'], deco: ['bare', ...DECOS] };
export const ROW_NAMES: Record<LookRow, string> = { body: 'Body', height: 'Height', ears: 'Ears', deco: 'Hood' }; // every head decoration is an animal hood: the short name fits beside a phone's tiles
/**
 * Every option has a Blender portrait at assets/icons/looks/<id>.webp (build_hero_styles.py render_option_icons: the
 * default explorer with only that option changed); `icon` is its alt text and the stand-in if the picture fails.
 */
export const OPTIONS: Record<LookOption, { name: string; price: number; icon: string }> = {
  boy: { name: 'Boy', price: 0, icon: '👦' }, girl: { name: 'Girl', price: 0, icon: '👧' }, man: { name: 'Man', price: 0, icon: '👨' }, woman: { name: 'Woman', price: 0, icon: '👩' }, sturdy: { name: 'Sturdy', price: 0, icon: '💪' }, slim: { name: 'Slim', price: 0, icon: '🌿' },
  tiny: { name: 'Tiny', price: 80, icon: '👶' }, chibi: { name: 'Chibi', price: 0, icon: '🧒' }, teen: { name: 'Teen', price: 80, icon: '🧑' }, tall: { name: 'Tall', price: 120, icon: '🧍' }, grown: { name: 'Grown-up', price: 160, icon: '🚶' },
  none: { name: 'No ears', price: 0, icon: '🙂' }, cat: { name: 'Cat ears', price: 150, icon: '🐱' }, bunny: { name: 'Bunny ears', price: 150, icon: '🐰' },
  bare: { name: 'No hood', price: 0, icon: '✨' },
  bear: { name: 'Bear hood', price: 110, icon: '🐻' }, panda: { name: 'Panda hood', price: 130, icon: '🐼' }, fox: { name: 'Fox hood', price: 120, icon: '🦊' },
  kitty: { name: 'Kitty hood', price: 110, icon: '🐱' }, frog: { name: 'Frog hood', price: 110, icon: '🐸' }, piggy: { name: 'Piggy hood', price: 110, icon: '🐷' },
  chick: { name: 'Chick hood', price: 110, icon: '🐥' }, koala: { name: 'Koala hood', price: 130, icon: '🐨' }, tiger: { name: 'Tiger hood', price: 140, icon: '🐯' },
  penguin: { name: 'Penguin hood', price: 120, icon: '🐧' }, monkey: { name: 'Monkey hood', price: 120, icon: '🐵' }, owl: { name: 'Owl hood', price: 130, icon: '🦉' },
};
export const DEFAULT_LOOK: LookId = 'boy-chibi-none-bare';
/**
 * Standing height of each height's body file over the chibi's (tests/w26-people.test.ts measures the boy's GLBs). A friend
 * (friend-view.ts) divides it out: for a friend the height option sets the proportions and growth sets the height.
 * The man stands up to 3% taller than this and girls and women up to 1.5% shorter (SHAPE taller), on purpose: it is
 * part of how the two read apart, for friends too.
 */
export const HEIGHT_RATIO: Record<Height, number> = { tiny: .979, chibi: 1, teen: 1.066, tall: 1.152, grown: 1.287 };
/**
 * A trim on the drawn size of a height, on top of its body file: the whole dressed explorer shrinks together, so hats
 * and gear still fit. Friends are not affected (they divide the height out). None is in use: Grown was drawn at 0.92
 * for a day (2026-10-13, the owner found it a little too tall), then its body file was rebuilt 8% shorter with the cut
 * taken from the shins (build_hero_styles.py, 2026-10-14), so its head, hats and gear are full size again.
 */
/** A gentler travel pace for longer legs. Equipment and skill bonuses remain independent. */
export const HEIGHT_PACE: Record<Height, number> = { tiny: 1, chibi: 1, teen: .97, tall: .94, grown: .9 };
export function lookPace(look: unknown): number { const l = typeof look === 'string' ? toLook(look) : null; return l ? HEIGHT_PACE[splitLook(l).height] : 1; }
export const HEIGHT_TRIM: Partial<Record<Height, number>> = {};
/** The trim of the look an avatar was built with (its userData.look); 1 for anything else. */
export function lookTrim(look: unknown): number { const l = typeof look === 'string' ? toLook(look) : null; return l ? HEIGHT_TRIM[splitLook(l).height] ?? 1 : 1; }
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
export const baseBody = (body: Body): FileBody => body === 'sturdy' ? 'boy' : body === 'slim' ? 'girl' : body;
/** The body x height file (build_hero_styles.py body_file); the boy chibi is the default hero.glb. */
export const bodyFile = (body: Body, height: Height) => { const b = baseBody(body); return b === 'boy' && height === 'chibi' ? 'hero.glb' : `hero-${[...(b === 'boy' ? [] : [b]), ...(height === 'chibi' ? [] : [height])].join('-')}.glb`; };

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
/**
 * Tall and Grown have a neck since 2026-10-14: their heads are a little smaller (0.76 -> 0.66, 0.52 -> 0.49) and ride
 * higher, their torsos and sleeves a little shorter (1.2 -> 1.109 and 1.5 -> 1.37; 1.55 -> 1.35 and 3 -> 2.75), and they
 * stand exactly as tall as before. Hats, hoods, ears and hair follow the head pivot, so they needed nothing else.
 */
export const FIT: Record<Height, Partial<Record<string, Fit>>> = { tiny: fit(1.1, 1.04, .88, 1, .9, -.1), chibi: {}, teen: fit(.9, .9, 1.08, .94, 1.22, .2), tall: fit(.66, .8, 1.109, .86, 1.35, .46), grown: fit(.49, .74, 1.37, .8, 2.75, .84) };
/**
 * How each Blender body is shaped apart from the default at each height (mirrors build_hero_styles.py STYLE, STRENGTH,
 * TALLER and shape_of): `strength` of the masculine or feminine shaping, and `taller` [extra hip height, torso height
 * factor]. Gear follows: his torso gear grows with his chest (x 1 + 0.1 s wide, 1 + 0.03 s deep) and his arm gear with
 * his arms (1 + 0.1 s); her arm gear slims with her arms (1 - 0.1 s) and her torso gear keeps its size (her hips do).
 */
const GROWING = { teen: .35, tall: .7, grown: 1 }, ADULT = { teen: .5, tall: .9, grown: 1.2 }, SHORTER: Partial<Record<Height, [number, number]>> = { tall: [-.02, 1], grown: [-.04, 1] };
export const SHAPE: Record<FileBody, { sex: 'm' | 'f'; strength: Partial<Record<Height, number>>; taller?: Partial<Record<Height, [number, number]>> }> = {
  boy: { sex: 'm', strength: GROWING }, girl: { sex: 'f', strength: GROWING, taller: SHORTER },
  man: { sex: 'm', strength: ADULT, taller: { teen: [.02, 1.01], tall: [.04, 1.02], grown: [.06, 1.03] } }, woman: { sex: 'f', strength: ADULT, taller: SHORTER },
};
/** The gear fit of a Blender body at a height: the height's FIT with that body's shaping (build_hero_styles.py fit_table). */
export function shapeFit(body: FileBody, height: Height): Partial<Record<string, Fit>> {
  const base = FIT[height], sh = SHAPE[body], s = sh.strength[height] ?? 0, tall = sh.taller?.[height];
  if (!s && !tall) return base;
  const one: Fit = { scale: [1, 1, 1], offset: [0, 0, 0] }, out: Partial<Record<string, Fit>> = { ...base };
  const scaled = (part: string, x: number, y: number, z: number, dy = 0) => { const f = base[part] ?? one; out[part] = { scale: [f.scale[0] * x, f.scale[1] * y, f.scale[2] * z], offset: [f.offset[0], f.offset[1] - dy, f.offset[2]] }; };
  const m = sh.sex === 'm', arm = m ? 1 + .1 * s : 1 - .1 * s, [e, th] = tall ?? [0, 1];
  scaled('body', m ? 1 + .1 * s : 1, th, m ? 1 + .03 * s : 1);
  for (const p of ['arm-left', 'arm-right']) scaled(p, arm, 1, arm);
  for (const p of ['leg-left', 'leg-right']) scaled(p, 1, 1, 1, e);
  // Her skirt flares wider than the chibi girl's: a tail (assets.ts dressEars) sits that much further back, on the skirt.
  if (!m && s) out.tail = { scale: out.body!.scale, offset: [0, 0, -.05 * s] };
  return out;
}
/**
 * Builds (mirrors build_hero_styles.py BUILDS), applied at load to the base body's parts (assets.ts applyBuild):
 * torso [x, z] scale, limb thickness (x, z of arms and legs), shoulder and hip spread (the parts' x positions).
 */
export const BUILD: Partial<Record<Body, { torso: [number, number]; limb: number; spread: number; hips: number }>> = {
  sturdy: { torso: [1.2, 1.15], limb: 1.18, spread: 1.17, hips: 1.12 }, slim: { torso: [.86, .9], limb: .86, spread: .87, hips: .9 },
};
/** The gear fit of a whole combination: the height's FIT with the body's shaping, then the build's widths (scale and offset both widen). */
export function fitOf(id: LookId): Partial<Record<string, Fit>> {
  const l = splitLook(id), base = shapeFit(baseBody(l.body), l.height), b = BUILD[l.body]; if (!b) return base;
  const out: Partial<Record<string, Fit>> = { ...base }, one: Fit = { scale: [1, 1, 1], offset: [0, 0, 0] };
  const widen = (part: string, x: number, z: number) => { const f = base[part] ?? one; out[part] = { scale: [f.scale[0] * x, f.scale[1], f.scale[2] * z], offset: [f.offset[0] * x, f.offset[1], f.offset[2] * z] }; };
  widen('body', ...b.torso); if (base.tail) widen('tail', ...b.torso); for (const p of ['arm-left', 'arm-right', 'leg-left', 'leg-right']) widen(p, b.limb, b.limb);
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
