import type { PlanetId } from './model.ts';
import { terrainHeight, zoneAt, type EnvironmentLayout } from './environments.ts';

/**
 * What grows where. Each home region and each planet has its own mix of scenery, with
 * counts that follow the reference game's world dressing, plus a three-row border just
 * outside the walkable circle. Placement is seeded and never depends on whether a model
 * file has loaded, so every player gets the same trees and the same obstacles.
 */
export type KitName = 'scenery' | 'wilds' | 'bright' | 'harsh' | 'dressing';
export interface DecorKind {
  kit: KitName;
  /** Small ground cover: no shadow, and thinned on low graphics (it never blocks). */
  cover?: boolean;
  /** Takes the planet's recolour of the shared scenery materials. */
  tint?: boolean;
  /** Tiny ground dressing (pebbles, shells, sprinkles): cover that low graphics leaves out entirely. */
  dressing?: boolean;
}
export const DECOR: Record<string, DecorKind> = {
  tree_round: { kit: 'scenery', tint: true }, tree_pine: { kit: 'scenery', tint: true }, tree_blossom: { kit: 'scenery', tint: true },
  bush: { kit: 'scenery', tint: true }, rock: { kit: 'scenery', tint: true }, mushroom: { kit: 'scenery' },
  flowers: { kit: 'scenery', cover: true, tint: true }, tuft: { kit: 'scenery', cover: true, tint: true },
  tree_swamp: { kit: 'wilds' }, log: { kit: 'wilds' }, toadstools: { kit: 'wilds', cover: true }, rock_red: { kit: 'wilds' },
  tree_dead: { kit: 'wilds' }, dry_bush: { kit: 'wilds', cover: true }, crystals: { kit: 'wilds' }, fern: { kit: 'wilds', cover: true }, reeds: { kit: 'wilds', cover: true },
  candy_tree: { kit: 'bright' }, candy_cane: { kit: 'bright' }, gumdrops: { kit: 'bright', cover: true }, donut: { kit: 'bright' }, cupcake: { kit: 'bright' },
  toyblock: { kit: 'bright' }, toyball: { kit: 'bright' }, cloudtree: { kit: 'bright' }, skyrock: { kit: 'bright' },
  jungletree: { kit: 'bright' }, palm: { kit: 'bright' }, coral: { kit: 'bright', cover: true },
  snow_pine: { kit: 'harsh' }, ice_spire: { kit: 'harsh' }, snow_rock: { kit: 'harsh' }, snowman: { kit: 'harsh' },
  lava_rock: { kit: 'harsh' }, obsidian: { kit: 'harsh' }, ash_tree: { kit: 'harsh' }, mini_volcano: { kit: 'harsh' }, deadtree: { kit: 'harsh' },
  pebbles: { kit: 'dressing', cover: true, dressing: true }, sprinkles: { kit: 'dressing', cover: true, dressing: true }, toy_bits: { kit: 'dressing', cover: true, dressing: true },
  sky_bloom: { kit: 'dressing', cover: true, dressing: true }, jungle_bloom: { kit: 'dressing', cover: true, dressing: true }, shells: { kit: 'dressing', cover: true, dressing: true },
  ice_shards: { kit: 'dressing', cover: true, dressing: true }, embers: { kit: 'dressing', cover: true, dressing: true }, glow_shrooms: { kit: 'dressing', cover: true, dressing: true },
};
/** [type, count, collision radius (0 = walk through), where: land by default, or 'sea']. */
export type DecorRule = [string, number, number?, ('sea')?];
export const HOME_DECOR: Record<'forest' | 'meadow' | 'swamp' | 'canyon', DecorRule[]> = {
  forest: [['tree_round', 160, .55], ['tree_pine', 160, .45], ['bush', 110], ['toadstools', 130], ['rock', 45, .7], ['tuft', 360], ['flowers', 90], ['log', 30]],
  meadow: [['tree_round', 70, .55], ['tree_blossom', 50, .5], ['bush', 70], ['flowers', 320], ['tuft', 380], ['rock', 36, .7], ['toadstools', 30]],
  swamp: [['tree_swamp', 140, .55], ['reeds', 140], ['bush', 45], ['tuft', 250], ['log', 28], ['toadstools', 70], ['rock', 28, .7]],
  canyon: [['rock_red', 125, 1.1], ['tree_dead', 70, .35], ['dry_bush', 160], ['crystals', 60, .5], ['rock', 55, .7]],
};
export const PLANET_DECOR: Partial<Record<PlanetId, { decor: DecorRule[]; rim: string[] }>> = {
  candy: { decor: [['candy_tree', 160, .35], ['candy_cane', 140, .3], ['gumdrops', 200], ['donut', 50, .9], ['cupcake', 60, .6], ['flowers', 140]], rim: ['candy_tree', 'candy_cane', 'cupcake'] },
  ice: { decor: [['snow_pine', 270, .45], ['ice_spire', 100, .55], ['snow_rock', 110, .8], ['snowman', 36, .45], ['dry_bush', 110]], rim: ['snow_pine', 'snow_pine', 'ice_spire'] },
  lava: { decor: [['lava_rock', 130, .85], ['obsidian', 80, .5], ['ash_tree', 110, .35]], rim: ['lava_rock', 'obsidian', 'mini_volcano'] },
  toy: { decor: [['toyblock', 45, 1.3], ['toyball', 40, .9], ['flowers', 90]], rim: ['toyblock', 'toyball'] },
  jungle: { decor: [['jungletree', 150, .6], ['fern', 260], ['bush', 120], ['flowers', 80]], rim: ['jungletree', 'jungletree', 'fern'] },
  ocean: { decor: [['palm', 70, .35], ['coral', 160, 0, 'sea'], ['fern', 60]], rim: ['palm'] },
  cloud: { decor: [['cloudtree', 90, .4], ['skyrock', 50, .8], ['flowers', 90], ['tuft', 160]], rim: [] },
  shadow: { decor: [['deadtree', 130, .35], ['rock', 50, .7], ['tuft', 120]], rim: ['deadtree'] },
};
/**
 * Small dressing per world, [type, count]. It is planned after everything else from its own seeded stream, so adding it
 * left every existing tree, rock and collider exactly where it was (multiplayer maps match across versions of the plan).
 * Dressing is ground cover: drawn as 2D cards in each tile's single cover batch, so it adds no draw calls.
 */
export const DRESSING: Partial<Record<PlanetId, [string, number][]>> = {
  home: [['pebbles', 700]], candy: [['sprinkles', 1100]], ice: [['ice_shards', 900]], lava: [['embers', 1100]], toy: [['toy_bits', 800]],
  jungle: [['jungle_bloom', 900]], ocean: [['shells', 600]], cloud: [['sky_bloom', 600]], shadow: [['glow_shrooms', 700]],
};
/** The kits a world needs, so they can be fetched before it is built. */
export function kitsFor(planet: PlanetId): KitName[] {
  const types = planet === 'home' ? [...Object.values(HOME_DECOR).flat().map(r => r[0]), 'tree_swamp', 'rock_red', 'tree_dead', 'reeds'] : [...(PLANET_DECOR[planet]?.decor.map(r => r[0]) ?? []), ...(PLANET_DECOR[planet]?.rim ?? [])];
  // Planets with fishing ponds ring them with reeds from the wilds kit.
  if (['home', 'candy', 'ice', 'toy', 'jungle', 'shadow'].includes(planet)) types.push('reeds');
  for (const [type] of DRESSING[planet] ?? []) types.push(type);
  return [...new Set(types.map(t => DECOR[t].kit))];
}

export interface DecorPlacement { type: string; x: number; z: number; y: number; rotation: number; scale: number; radius: number }
export interface DecorContext {
  planet: PlanetId; layout: EnvironmentLayout; random: () => number;
  /** False where something already stands: buildings, ponds, hazards, creatures. */
  free: (x: number, z: number, r: number) => boolean;
  /** Fishing ponds, ringed with reeds. */
  ponds?: readonly { x: number; z: number; r: number }[];
  /** Creature spawn points, planned first: scenery leaves a clearing around each (CC-7). */
  clearings?: readonly { x: number; z: number; type?: string }[];
}
/**
 * Clearings around creature spawn points. A creature wanders up to 2 m from its spawn point, so trees and rocks (pieces
 * that block) keep 4.5 m away and the creature never comes within 2.5 m of one; bushes and logs keep 3.5 m. Ground cover
 * may grow in a clearing. Decor that could be mistaken for the creature spawning there keeps 8 m away (C13).
 */
export const CLEARING = { blocking: 4.5, low: 3.5, lookalike: 8 } as const;
/**
 * Decor that looks like a creature of the same biome (C13). Every decor kind was listed next to its biome's creatures,
 * with drawn heights (creatures now stand 1.1-1.4 m):
 *   forest/meadow/swamp (mushroom, boar, bee, chomper, wolf, frog): toadstools 0.52 m, red caps on pale stalks = a small
 *     Grumpy Mushroom; bushes 0.71 m, round and green = a Poison Frog at a glance. Trees 3.4-3.8 m, rocks 0.64 m, logs,
 *     reeds, tufts and flowers have no twin. canyon (cactus, wolf, crab): red rocks 1.4 m, crystals 1.1 m, dead trees,
 *     dry bushes: none.
 *   candy (jelly, gummy, lollipop, bunny, beetle): gumdrops 0.44 m, round pink/green = Jelly Jumper. Candy trees, canes,
 *     donuts and cupcakes: none.  ice (snowball, penguin, ice blossom, seal, owl): snowmen 1.64 m and snow rocks 0.9 m,
 *     white and round = Rolling Snowball. lava: none (rocks, obsidian, ash trees, volcano cones vs slimes and lizards).
 *   toy (soldier, mouse, jack-in-the-box): toy blocks 1.66 m = Jack-in-the-Box (a box). jungle: ferns and bushes vs the
 *     flytrap and snake: none.  ocean (jellyfish, shark, urchin, crab): pink coral 0.82 m = Coral Urchin.
 *   cloud (sheep, thunderbird, wind spirit): white sky rocks 1.3 m = Cloud Sheep. shadow (wisp, spider, eye): the
 *     planet's purple-tinted rocks 0.64 m = Shadow Spider.
 * Each lookalike keeps 8 m from the spawn points of its twin, so a creature never stands among its doubles; outlines
 * on actors (the fx builder's work) separate the rest.
 */
export const LOOKALIKES: Readonly<Record<string, readonly string[]>> = {
  toadstools: ['mushroom', 'mushking'], bush: ['frog'], gumdrops: ['jelly'], snowman: ['snowball'], snow_rock: ['snowball'],
  toyblock: ['jackbox'], coral: ['urchin'], skyrock: ['cloudsheep'], rock: ['spider'],
};
/** Grid of spawn points for the clearing test. */
function clearingGrid(points: readonly { x: number; z: number; type?: string }[]) {
  const cells = new Map<string, { x: number; z: number; type?: string }[]>(), key = (x: number, z: number) => `${Math.floor(x / 8)}|${Math.floor(z / 8)}`;
  for (const p of points) { const k = key(p.x, p.z); const list = cells.get(k) ?? []; list.push(p); cells.set(k, list); }
  return (type: string, x: number, z: number) => {
    const kind = DECOR[type], twins = LOOKALIKES[type];
    if (kind?.cover && !twins) return false;
    for (let i = Math.floor(x / 8) - 1; i <= Math.floor(x / 8) + 1; i++) for (let j = Math.floor(z / 8) - 1; j <= Math.floor(z / 8) + 1; j++)
      for (const p of cells.get(`${i}|${j}`) ?? []) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (twins?.includes(p.type ?? '') ? d < CLEARING.lookalike : !kind?.cover && d < (blocking(type) ? CLEARING.blocking : CLEARING.low)) return true;
      }
    return false;
  };
}
/** Pieces that block movement (trees, rocks, spires): the rules give them a collision radius. */
const BLOCKING = new Set([...Object.values(HOME_DECOR).flat(), ...Object.values(PLANET_DECOR).flatMap(p => p?.decor ?? [])].filter(r => (r[2] ?? 0) > 0).map(r => r[0]));
function blocking(type: string) { return BLOCKING.has(type); }
/** Where the home trails run: winding sand paths from the four gates out to the border. */
export function trailDistance(x: number, z: number) {
  if (Math.hypot(x, z) < 17) return Infinity;
  return Math.min(Math.abs(z - trailOffset(Math.abs(x))), Math.abs(x - trailOffset(Math.abs(z))));
}
/** How far a trail wanders sideways at distance t from the village centre (the minimap draws the same line). */
export const trailOffset = (t: number) => (Math.sin(t * .09) * 3 + Math.sin(t * .23) * 1.2) * smoothstep(t, 18, 30);
export const smoothstep = (x: number, a: number, b: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Sectors of the home wilds, as angles of atan2(z, x). */
const SECTORS = { canyon: [-Math.PI / 4, Math.PI / 4], meadow: [Math.PI / 4, 3 * Math.PI / 4], forest: [3 * Math.PI / 4, 5 * Math.PI / 4], swamp: [-3 * Math.PI / 4, -Math.PI / 4] } as const;
export const RIM_START = 149.5;

/** Hazards and features of a planet's layout that scenery must leave clear. */
function hazardAt(layout: EnvironmentLayout, x: number, z: number, pad: number) {
  const near = (c: { x: number; z: number; r: number }, extra = 0) => Math.hypot(x - c.x, z - c.z) < c.r + pad + extra;
  if (layout.planet === 'lava') {
    if (layout.pools.some(p => near(p, 1)) || layout.mesas.some(m => near(m)) || layout.vents.some(v => near(v, 1)) || near(layout.nest, 2)) return true;
    if (Math.hypot(x - layout.cave.x, z - layout.cave.z) < layout.cave.r + pad + 2 || Math.hypot(x - layout.furnace.x, z - layout.furnace.z) < 8 + pad) return true;
  }
  if (layout.planet === 'toy' && layout.tracks.some(t => Math.abs(Math.hypot(x - t.x, z - t.z) - t.r) < 3 + pad)) return true;
  if (layout.planet === 'jungle' && (layout.thorns.some(t => near(t)) || layout.poison.some(p => near(p)) || layout.fruit.some(f => near(f, 1)))) return true;
  if (layout.planet === 'shadow' && (layout.lamps.some(l => Math.hypot(x - l.x, z - l.z) < 3 + pad) || layout.flowers.some(f => near(f)))) return true;
  if (layout.planet === 'ocean' && (layout.bubbles.some(b => near(b, 1)) || layout.turtles.some(t => near(t, 1)))) return true;
  if (layout.planet === 'cloud') {
    // Scenery stays on the islands, away from their edges and the cloud bridges.
    if (!layout.islands.some(i => Math.hypot(x - i.x, z - i.z) < i.r - pad - .6)) return true;
    for (const link of layout.links) {
      const dx = link.b.x - link.a.x, dz = link.b.z - link.a.z, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((x - link.a.x) * dx + (z - link.a.z) * dz) / l2)) : 0;
      if (Math.hypot(link.a.x + dx * t - x, link.a.z + dz * t - z) < 2.6 + pad) return true;
    }
  }
  return false;
}

/** A small seeded stream (mulberry32) keyed by the planet's name. */
function seeded(key: string) {
  let a = [...key].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A coarse grid of circles already taken by scenery, so pieces never overlap. */
class Occupancy {
  private cells = new Map<number, { x: number; z: number; r: number }[]>();
  private key(cx: number, cz: number) { return (cx + 512) * 1024 + cz + 512; }
  taken(x: number, z: number, r: number) {
    const cx = Math.floor(x / 4), cz = Math.floor(z / 4);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) for (const c of this.cells.get(this.key(i, j)) ?? []) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true;
    return false;
  }
  add(x: number, z: number, r: number) { const k = this.key(Math.floor(x / 4), Math.floor(z / 4)); const list = this.cells.get(k) ?? []; list.push({ x, z, r: Math.min(r, 4) }); this.cells.set(k, list); }
}

export function planDecor({ planet, layout, random, free, ponds = [], clearings = [] }: DecorContext): DecorPlacement[] {
  const out: DecorPlacement[] = [], taken = new Occupancy(), between = (a: number, b: number) => a + random() * (b - a), cleared = clearingGrid(clearings);
  // Sea pieces (coral) sit on the sea floor; everything else stands on the land.
  const place = (type: string, x: number, z: number, radius: number, scale = between(.8, 1.25), sea = false) => {
    out.push({ type, x, z, y: sea ? terrainHeight(layout, { x, z }) : Math.max(0, terrainHeight(layout, { x, z })), rotation: random() * Math.PI * 2, scale, radius: radius * scale });
    taken.add(x, z, radius ? radius * scale + .6 : .4);
  };
  const scatterRule = ([type, count, radius = 0, where]: DecorRule, angles?: readonly [number, number], zone?: string, minR = 14) => {
    const spacing = radius ? radius * 2 : .5;
    for (let placed = 0, tries = 0; placed < count && tries < count * 30; tries++) {
      const a = angles ? between(angles[0], angles[1]) : random() * Math.PI * 2, d = Math.sqrt(between((minR / 140) ** 2, 1)) * 138, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (zone && zoneAt({ x, z }) !== zone) continue;
      if (planet === 'home' && trailDistance(x, z) < 2.6 + spacing) continue;
      if (taken.taken(x, z, spacing) || !free(x, z, spacing) || cleared(type, x, z)) continue;
      if (planet === 'ocean' ? (where === 'sea') !== (terrainHeight(layout, { x, z }) < -.3) : hazardAt(layout, x, z, spacing)) continue;
      if (planet === 'ocean' && where !== 'sea' && !layout.islands.some(i => Math.hypot(x - i.x, z - i.z) < i.r - spacing - .5)) continue;
      place(type, x, z, radius, undefined, where === 'sea'); placed++;
    }
  };
  // Reeds around each pond's sandy rim (the ponds are round, as in the reference).
  for (const pond of ponds) {
    const count = pond.r < 4 ? 4 : pond.r >= 7 && planet === 'home' ? 16 : 5;
    for (let i = 0; i < count; i++) { const a = random() * Math.PI * 2, x = pond.x + Math.cos(a) * (pond.r + .7), z = pond.z + Math.sin(a) * (pond.r + .7); place('reeds', x, z, 0); }
  }
  if (planet === 'home') {
    // Inside the village fence: flowers, grass and bushes around the buildings and trails.
    for (let i = 0; i < 160; i++) {
      const a = random() * Math.PI * 2, d = Math.sqrt(random()) * 16.5, x = Math.cos(a) * d, z = Math.sin(a) * d, kind = random();
      if (Math.abs(x) < 1.3 || Math.abs(z) < 1.3 || taken.taken(x, z, .6) || !free(x, z, .6)) continue;
      place(kind < .35 ? 'flowers' : kind < .85 ? 'tuft' : 'bush', x, z, 0, kind < .85 ? between(.8, 1.25) : between(.6, .9));
    }
    for (const [zone, rules] of Object.entries(HOME_DECOR) as [keyof typeof HOME_DECOR, DecorRule[]][])
      for (const rule of rules) scatterRule(rule, SECTORS[zone], zone, 21);
  } else for (const rule of PLANET_DECOR[planet]?.decor ?? []) scatterRule(rule);
  // The border: three loose rows of tall pieces just outside the walkable circle.
  const rim = PLANET_DECOR[planet]?.rim;
  if (planet === 'home' || rim?.length) {
    const step = planet === 'home' ? .03 : .032;
    for (let a = 0; a < Math.PI * 2; a += step) for (let row = 0; row < 3; row++) {
      const r = RIM_START + row * 3.2 + between(-1, 1), angle = a + between(-.02, .02) + row * .02, x = Math.cos(angle) * r, z = Math.sin(angle) * r;
      let type: string;
      if (planet === 'home') { const zone = zoneAt({ x: Math.cos(angle) * 60, z: Math.sin(angle) * 60 }); type = zone === 'canyon' ? random() < .7 ? 'rock_red' : 'tree_dead' : zone === 'swamp' ? 'tree_swamp' : random() < .5 ? 'tree_pine' : 'tree_round'; }
      else type = rim![Math.floor(random() * rim!.length)];
      out.push({ type, x, z, y: 0, rotation: random() * Math.PI * 2, scale: between(1.1, 1.6), radius: 0 });
    }
  }
  // Dressing last, from its own stream (see DRESSING): it never shifts the pieces above.
  const own = seeded(planet);
  for (const [type, count] of DRESSING[planet] ?? []) for (let placed = 0, tries = 0; placed < count && tries < count * 20; tries++) {
    const a = own() * Math.PI * 2, d = Math.sqrt(own() * (1 - (12 / 138) ** 2) + (12 / 138) ** 2) * 138, x = Math.cos(a) * d, z = Math.sin(a) * d, rotation = own() * Math.PI * 2, scale = 1.6 + own() * .8;
    if (planet === 'home' && (trailDistance(x, z) < 2.6 || zoneAt({ x, z }) === 'swamp')) continue;
    if (taken.taken(x, z, .35) || !free(x, z, .35)) continue;
    if (planet === 'ocean' ? terrainHeight(layout, { x, z }) < -.3 || !layout.islands.some(i => Math.hypot(x - i.x, z - i.z) < i.r - 1) : hazardAt(layout, x, z, .3)) continue;
    out.push({ type, x, z, y: Math.max(0, terrainHeight(layout, { x, z })), rotation, scale, radius: 0 }); taken.add(x, z, .4); placed++;
  }
  return out;
}
