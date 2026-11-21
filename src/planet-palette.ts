import type { PlanetId } from './content.ts';
import { perfFlags } from './perf-flags.ts';
import { ENEMY_TYPES } from './enemy-types.ts';

/**
 * Our own colours, in one place (AAA plan WP18): per planet and per home region the light, the sky, the ground, the
 * water and the scenery kit's tints, plus the starship's sky and the Crocodile King's paint. ground.ts, look.ts,
 * pond-view.ts, world.ts (kit tints), space-view.ts and creature-art.ts read from here; content.ts keeps the planet facts.
 * Colour tables only: nothing here costs a frame.
 *
 * The rules (tests/planet-palette.test.ts): vivid and warm, never pastel. Sunlit ground and water have a saturation of
 * .45 or more and a lightness between .35 and .65 as drawn (accents, pads and the Night Planet excepted), shade is
 * blue-violet rather than grey (the sky half of each light), every boss stands 20 L* or more from its ground, and the
 * Night Planet stays very dark blue.
 */
export type HomeZone = 'home' | 'forest' | 'meadow' | 'swamp' | 'canyon';
export interface PlanetLight {
  /** Sky colour high up and at the horizon (the horizon is also the fog). */
  sky: readonly [top: string, horizon: string];
  fog: readonly [near: number, far: number];
  /** The sky's light (what shade is lit with), the bounce from the ground, and their strength. */
  hemi: readonly [sky: string, ground: string, intensity: number];
  /** Sun colour, intensity, and where it stands: degrees round from the camera's side (positive lights right-hand faces) and above the ground. */
  sun: readonly [color: string, intensity: number, azimuth: number, elevation: number];
  /** Brightness into the colour curve. */
  exposure: number;
}
interface GroundTone {
  /** Base colours [low, high, landing pad]; without them the planet facts' own (content.ts). */
  base?: readonly [low: string, high: string, pad: string];
  /** Soft patches that break up wide plains (moss, sugar crust, frost, ash, clover...). */
  patch?: string;
  /** Saturation and lightness shifts of the richer ground, the multiply colour of shade under trees, and worn earth. */
  s: number; l: number; shade: string; wear: string;
}
export interface WaterTone { water: string; sand: string; deep: string; shallow: string }
export interface Palette {
  light: Record<PlanetId, PlanetLight>;
  ground: Record<PlanetId, GroundTone>;
  /** The home regions: base colour, the second colour that drifts through it, and the multiply colour under its trees. */
  zones: Record<HomeZone, readonly [base: string, accent: string, shade: string]>;
  water: Record<string, WaterTone>;
  /** The island planets, whose ground is islands in a sea: [landing island, the other islands, their sides, the sea, and the second colour that dapples an island's top]. */
  isles: Record<'ocean' | 'cloud', readonly [pad: string, isle: string, side: string, sea: string, dapple?: string]>;
  /** Scenery kit tints (material name → colour); "A" is the darker lower lobe, "B" the lighter crown. Home wears the kit's own colours. */
  kit: Partial<Record<PlanetId, Record<string, string>>>;
  /** The starship's sky: background, sky and ground light, three star layers, the clouds of gas, round or square stars, and our own paint for the space kit's rocks (by material name). */
  space: { sky: string; hemi: readonly [string, string]; stars: readonly [string, string, string]; nebulae: readonly string[]; round: boolean; paint?: Record<string, string> };
  /** Our own paint for a creature, by the material names of its file (creatures.glb); the others wear their file's colours. */
  paint: Record<string, Record<string, string>>;
  /** Our own colours for bosses: [body, accent]. enemy-types.ts (which the server shares) keeps the old ones; these are put on as the page loads (below). */
  bosses: Record<string, readonly [color: string, accent?: string]>;
}

// The Night Planet is the same in both tables: very dark blue, lit enough to read.
/** Clear days keep the reference's fog, which starts well beyond the fight radius (camera-rig.ts FOG). */
const DAY = [45, 110] as const;
const NIGHT_LIGHT: PlanetLight = { sky: ['#03061a', '#101a52'], fog: [24, 78], hemi: ['#8494ff', '#2c2a78', 1.5], sun: ['#a8bcff', 1.9, -36, 62], exposure: 1.05 };
const NIGHT_GROUND: GroundTone = { patch: '#3b3160', s: .15, l: .02, shade: '#5a56a8', wear: '#3a3470' };
const NIGHT_WATER: WaterTone = { water: '#3f3a7a', sand: '#5a5478', deep: '#25204a', shallow: '#4a4672' };
const NIGHT_KIT = { 'Leaf A': '#554a96', 'Leaf B': '#8f7fd6', 'Blossom A': '#8f6ff0', 'Blossom B': '#d3c3ff', 'Pine A': '#4a4080', 'Pine B': '#7a6cc0', Bark: '#3e3656', Grass: '#73699b', Rock: '#6d6690' };

/**
 * Ours. Each day planet's light is split so that shade (which only the sky half reaches) is blue-violet while flat ground
 * in full sun gets the same light in total as before: a cooler, stronger sky half and a warmer sun.
 */
const LAKE: WaterTone = { water: '#4ab8fc', sand: '#e6dc9e', deep: '#5ab4d8', shallow: '#9bd3dc' };
const OWN: Palette = {
  light: {
    // A warm late-morning sun against blue-violet shade.
    home: { sky: ['#3f9cf2', '#bfe6ff'], fog: DAY, hemi: ['#a4beff', '#a8d86a', 1.79], sun: ['#ffedaf', 2.66, 54.5, 60.2], exposure: 1 },
    // Berry light: a golden sun, grape shade, raspberry bounce.
    candy: { sky: ['#c2409c', '#f570b4'], fog: DAY, hemi: ['#d9b8ff', '#ff6fb0', 1.5], sun: ['#fff3af', 2.46, 38, 63], exposure: 1 },
    // A low winter sun from the left, long blue shadows.
    ice: { sky: ['#2f86e8', '#a8d8ff'], fog: DAY, hemi: ['#a2c0ff', '#7fb0f0', 1.71], sun: ['#ffefb9', 2.64, -46, 50], exposure: 1 },
    // Ember glow from low in front, everything else in deep plum shade.
    lava: { sky: ['#2a0f1c', '#b8452c'], fog: [34, 100], hemi: ['#f09ab8', '#8a3038', 1.6], sun: ['#ffca50', 2.41, 26, 50], exposure: 1.08 },
    // A bright playroom lamp straight overhead, under a blue ceiling.
    toy: { sky: ['#3f9af0', '#a8d4ff'], fog: DAY, hemi: ['#dcc4ff', '#ffb4dc', 1.5], sun: ['#fff5b2', 2.28, 54.5, 66], exposure: .96 },
    // Golden shafts through green canopy.
    jungle: { sky: ['#2f9e62', '#a4e078'], fog: [36, 104], hemi: ['#b8e4d0', '#2f8a3a', 1.6], sun: ['#ffedb6', 2.68, 68, 55], exposure: 1 },
    // High tropical noon over turquoise.
    ocean: { sky: ['#1f8ef0', '#a6e8ff'], fog: DAY, hemi: ['#9cc8ff', '#4fb0e6', 1.64], sun: ['#fff29f', 2.59, 30, 68], exposure: .98 },
    // Thin bright air above the clouds: white stays white, shade goes sky blue, the sun comes low from the left.
    cloud: { sky: ['#3f8cf0', '#a4d2ff'], fog: DAY, hemi: ['#ccd8ff', '#a4c4ff', 1.6], sun: ['#fff6d5', 2.58, -42, 52], exposure: 1 },
    shadow: NIGHT_LIGHT,
  },
  ground: {
    home: { s: 0, l: 0, shade: '#6f9f96', wear: '#ead27c' },
    // Berry and raspberry, with one hot accent: the golden pad and the tangerine trees.
    candy: { base: ['#d43c86', '#ec5aa0', '#ffd86a'], patch: '#ff86bf', s: 0, l: 0, shade: '#9a6ad0', wear: '#ffc46a' },
    // Glacier blue under snow drifts.
    ice: { base: ['#52a0ea', '#80bef8', '#b9d6f2'], patch: '#70b4f4', s: 0, l: 0, shade: '#8fa8ec', wear: '#e8f4ff' },
    lava: { base: ['#8a5a5e', '#9e6c5e', '#4f4450'], patch: '#5a3c46', s: .1, l: .015, shade: '#8a5a80', wear: '#7a5a52' },
    // The play mat: rose and sky-blue squares. The mat's texture deepens what it is given (ground.ts checker): these are drawn as about #dc6a96 and #62a6e4.
    toy: { base: ['#efadca', '#a7d3f3', '#fff4c8'], s: 0, l: 0, shade: '#b89ae6', wear: '#fff4c8' },
    jungle: { base: ['#4aa646', '#5cba50', '#8a6a3a'], patch: '#2e8f3c', s: 0, l: 0, shade: '#4f8a6a', wear: '#a67c3c' },
    // Golden sand.
    ocean: { base: ['#f0b850', '#f7d070', '#f8e8b8'], patch: '#fbe2a0', s: 0, l: 0, shade: '#c8a0a0', wear: '#f8e8b8' },
    cloud: { base: ['#74d052', '#a4e868', '#e8f0ff'], patch: '#e6f4ff', s: 0, l: 0, shade: '#8fb0e8', wear: '#e8f0ff' },
    shadow: NIGHT_GROUND,
  },
  zones: {
    home: ['#80d862', '#9be064', '#6f9f96'],
    // A warm leafy floor with sunlit moss.
    forest: ['#6cc648', '#9ccc3c', '#86a86e'],
    meadow: ['#9fe062', '#c4e860', '#6f9f96'],
    // Mossy olive, so the teal Crocodile King stands out.
    swamp: ['#84c450', '#62aa3c', '#8aa66a'],
    canyon: ['#f4b26c', '#ee9a58', '#c9908c'],
  },
  water: {
    home: LAKE, lake: LAKE,
    swamp: { water: '#3fc4a0', sand: '#dccf8c', deep: '#1f8a6e', shallow: '#7cc79a' },
    // Grape soda.
    candy: { water: '#9858ee', sand: '#ffc6e0', deep: '#6a34c0', shallow: '#b88af5' },
    ice: { water: '#4fb8f5', sand: '#eef6ff', deep: '#2f8fd0', shallow: '#9ad6f2' },
    toy: { water: '#44b8f2', sand: '#ffe08a', deep: '#2389b8', shallow: '#7fcfe0' },
    jungle: { water: '#3fb890', sand: '#d8c47c', deep: '#1f7a5c', shallow: '#6fbf96' },
    ocean: { water: '#48d2e0', sand: '#f6dc90', deep: '#1a93b0', shallow: '#74d6d0' },
    shadow: NIGHT_WATER,
  },
  // Golden sand in a turquoise sea; deep green islands in a blue sky, with the clouds left white. Each top is dappled with its second colour.
  isles: { ocean: ['#f2bc58', '#f2bc58', '#dba24a', '#2fb4e8', '#f8d47c'], cloud: ['#54b83c', '#54b83c', '#7f9ad0', '#5aa8f0', '#70c84a'] },
  kit: {
    candy: { 'Leaf A': '#8438d8', 'Leaf B': '#b06cf8', 'Blossom A': '#ff5a3c', 'Blossom B': '#ff9a4a', 'Pine A': '#ff7a1c', 'Pine B': '#ffb43c', Bark: '#8a4a34', Grass: '#ff86c0', Rock: '#9a62e4' },
    ice: { 'Leaf A': '#5fb4e8', 'Leaf B': '#c4ecff', 'Blossom A': '#8fd4fa', 'Blossom B': '#e4f6ff', 'Pine A': '#4fa4d8', 'Pine B': '#b4e4fb', Bark: '#7a8fb5', Grass: '#a8e0f7', Rock: '#9cc4e6' },
    lava: { 'Leaf A': '#8a3a2e', 'Leaf B': '#c4603a', 'Blossom A': '#ff6a2a', 'Blossom B': '#ffb36b', 'Pine A': '#74342c', 'Pine B': '#aa5238', Bark: '#4a2c30', Grass: '#b0603a', Rock: '#4a3644' },
    toy: { 'Leaf A': '#22b04a', 'Leaf B': '#7fe04a', 'Pine A': '#1f8ae8', 'Pine B': '#6cc4ff' },
    jungle: { 'Leaf A': '#1f9030', 'Leaf B': '#52cc3c', 'Pine A': '#1a7a34', 'Pine B': '#3ab848', Grass: '#58cc3c' },
    shadow: NIGHT_KIT,
  },
  // Very dark blue, with blue and teal clouds only and round stars.
  space: { sky: '#050a24', hemi: ['#c8d8ff', '#1c2a6a'], stars: ['#ffffff', '#cfe4ff', '#ffe9b0'], nebulae: ['rgba(60,130,255,.5)', 'rgba(40,200,220,.42)', 'rgba(80,110,255,.48)', 'rgba(70,235,200,.36)'], round: true, paint: { Basalt: '#3a4064' } },
  // The Crocodile King: dark teal with a warm belly, against the swamp's mossy olive.
  paint: {
    croc: { 'Creature croc': '#1f7266', 'Creature croc dark': '#104a48', 'Creature croc belly': '#ffcf7a' },
    // King Bear a shade darker, so he stands off the canyon's clay; the Snow Yeti cream with indigo shadows, warm against the cold glacier.
    bear: { 'Creature bear': '#724630', 'Creature bear dark': '#4a2a1c' },
    yeti: { 'Creature yeti': '#fff6e2', 'Creature yeti light': '#ffe9c4', 'Creature yeti dark': '#5a74cc' },
  },
  bosses: { croc: ['#1f7266', '#ffcf7a'], gingerbread: ['#f0a850'], jellyqueen: ['#4fe0c4'], golem: ['#4a2a48', '#ff7a1a'], dragon: ['#ffa828'], robot: ['#ffd83a'], leviathan: ['#3a5cae'], phoenix: ['#c8381c'] },
};

/** The tables as they were before WP18, for an exact before/after in one build (perfFlags.ownColours off; dev and perf builds, and tests). */
const CLASSIC: Palette | null = import.meta.env?.DEV === false && !import.meta.env.VITE_PERF_HOOK ? null : {
  light: {
    home: { sky: ['#3f9cf2', '#bfe6ff'], fog: DAY, hemi: ['#d4e8ff', '#a8d86a', 1.18], sun: ['#fff0d8', 2.55, 54.5, 60.2], exposure: 1 },
    candy: { sky: ['#ff6fb8', '#ffc2e6'], fog: DAY, hemi: ['#ffe2f2', '#ff7fc0', 1.1], sun: ['#fff0d4', 2.4, 38, 63], exposure: 1 },
    ice: { sky: ['#3d93ea', '#c4e6ff'], fog: DAY, hemi: ['#d6eaff', '#7fb0f0', 1.12], sun: ['#fff4e0', 2.5, -46, 50], exposure: 1 },
    lava: { sky: ['#2a0f1c', '#b8452c'], fog: [34, 100], hemi: ['#ffb494', '#8a3038', 1.3], sun: ['#ffc284', 2.5, 26, 50], exposure: 1.08 },
    toy: { sky: ['#ff8fc6', '#ffe0ef'], fog: DAY, hemi: ['#ffeaf6', '#ffb4dc', 1.05], sun: ['#fff2d6', 2.3, 54.5, 66], exposure: .96 },
    jungle: { sky: ['#2f9e62', '#b4e894'], fog: [36, 104], hemi: ['#dcffc8', '#2f8a3a', 1.25], sun: ['#fff2cc', 2.55, 68, 55], exposure: 1 },
    ocean: { sky: ['#1f8ef0', '#a6e8ff'], fog: DAY, hemi: ['#c8f2ff', '#4fb0e6', 1.1], sun: ['#fff4c8', 2.5, 30, 68], exposure: .98 },
    cloud: { sky: ['#3f8cf0', '#a4d2ff'], fog: DAY, hemi: ['#eef6ff', '#a4c4ff', 1.22], sun: ['#fff8ec', 2.5, -42, 52], exposure: 1 },
    shadow: NIGHT_LIGHT,
  },
  ground: {
    home: { s: 0, l: 0, shade: '#6f9f96', wear: '#ead27c' }, candy: { patch: '#ffd0ea', s: .03, l: -.035, shade: '#d48ac4', wear: '#ffd98a' }, ice: { patch: '#b9d6f2', s: .06, l: -.02, shade: '#8fb4ec', wear: '#e8f4ff' },
    lava: { patch: '#55424a', s: .1, l: .015, shade: '#8a5a6a', wear: '#7a5a52' }, toy: { s: 0, l: 0, shade: '#c9a8e6', wear: '#fff4c8' }, jungle: { patch: '#3c9440', s: 0, l: .03, shade: '#3f7a6a', wear: '#9a7a44' },
    ocean: { patch: '#f4e2b0', s: .05, l: -.02, shade: '#c8a892', wear: '#f8e8b8' }, cloud: { patch: '#e6f4ff', s: .05, l: -.02, shade: '#96b4e0', wear: '#e8f0ff' }, shadow: NIGHT_GROUND,
  },
  zones: { home: ['#80d862', '#9be064', '#6f9f96'], forest: ['#56bf4f', '#36a552', '#6f9f96'], meadow: ['#9fe062', '#c4e860', '#6f9f96'], swamp: ['#52c08c', '#3fa878', '#6f9f96'], canyon: ['#f7c284', '#f0a468', '#c9908c'] },
  water: {
    home: { water: '#5ec8ff', sand: '#e6dc9e', deep: '#5ab4d8', shallow: '#9bd3dc' }, lake: { water: '#5ec8ff', sand: '#e6dc9e', deep: '#5ab4d8', shallow: '#9bd3dc' },
    swamp: { water: '#4fc0b0', sand: '#d9cf98', deep: '#2f8a7a', shallow: '#78bba0' }, candy: { water: '#ff9fd2', sand: '#ffd8ec', deep: '#e06aa8', shallow: '#f6a9cc' },
    ice: { water: '#7fd3ff', sand: '#eef6ff', deep: '#3f9fcf', shallow: '#a9dcef' }, toy: { water: '#6fd3ff', sand: '#ffe9a8', deep: '#2f93ad', shallow: '#86cfd0' },
    jungle: { water: '#4fa88a', sand: '#d8c890', deep: '#2a7a62', shallow: '#6fae8f' }, ocean: { water: '#4fd8e0', sand: '#f2e2b0', deep: '#2a9aa8', shallow: '#7fd0c8' }, shadow: NIGHT_WATER,
  },
  isles: { ocean: ['#a9dc83', '#f4dea4', '#e9d19a', '#56bce6'], cloud: ['#a9dc83', '#aada92', '#8da1b4', '#e1f3ff'] },
  kit: {
    candy: { 'Leaf A': '#ff7fb8', 'Leaf B': '#ffb8d9', 'Blossom A': '#a97cff', 'Blossom B': '#dcc8ff', 'Pine A': '#ff8a5c', 'Pine B': '#ffc49a', Bark: '#b06a52', Grass: '#ff9ccf', Rock: '#d7a3e8' },
    ice: { 'Leaf A': '#8fcbe6', 'Leaf B': '#dcf5ff', 'Blossom A': '#b5e2fa', 'Blossom B': '#ecfaff', 'Pine A': '#7fbcd8', 'Pine B': '#d0f0fb', Bark: '#8b9db5', Grass: '#c6ecf7', Rock: '#b9d6e6' },
    lava: { 'Leaf A': '#7e3f36', 'Leaf B': '#b0604a', 'Blossom A': '#ff6a2a', 'Blossom B': '#ffb36b', 'Pine A': '#6a3a32', 'Pine B': '#9a5a48', Bark: '#4a3434', Grass: '#8c5a48', Rock: '#5e4553' },
    toy: { 'Leaf A': '#34b84a', 'Leaf B': '#8fe06a', 'Pine A': '#2f8fe0', 'Pine B': '#7cc8ff' },
    jungle: { 'Leaf A': '#1c8a3a', 'Leaf B': '#3cc04e', 'Pine A': '#18763a', 'Pine B': '#2fae52', Grass: '#3fbf4f' },
    shadow: NIGHT_KIT,
  },
  space: { sky: '#120a2a', hemi: ['#c8d8ff', '#3a2a6a'], stars: ['#ffffff', '#cfe0ff', '#ffe9b0'], nebulae: ['rgba(255,110,200,.55)', 'rgba(110,160,255,.5)', 'rgba(160,110,255,.5)', 'rgba(110,240,220,.4)'], round: false },
  paint: {}, bosses: {},
};

/** The two tables by name, for tests and tools. */
export const PALETTES = { own: OWN, classic: CLASSIC };
/** The colours the game wears. Read once, as the page loads: `window.__zooFlagPreset = { ownColours: false }` gives the old ones (perf-flags.ts). */
export const PALETTE: Palette = CLASSIC && !perfFlags.ownColours ? CLASSIC : OWN;
// The bosses' display colours (bodies drawn from shapes, health chips, bursts and sparks all read ENEMY_TYPES): the server never loads this file.
for (const [id, [color, accent]] of Object.entries(PALETTE.bosses)) Object.assign(ENEMY_TYPES[id], accent ? { color, accent } : { color });
