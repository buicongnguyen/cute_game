/**
 * The product map of the Village Almanac, built from the game's own tables and nothing else: crops and their seeds,
 * roasting (cooked_*), the farm dishes, animals and their products, every shop / workshop / furnace recipe, the fish
 * of each water, and what each world's creatures, bosses and crystal veins give. Pure data: insight-pages.ts draws it,
 * insight-rules.ts reads it for "best use now". No chain is written by hand: a new item or recipe appears by itself,
 * and tests/insight-graph.test.ts fails if anything sellable is left off the map.
 */
import { ITEMS, CROPS, RECIPES, PLANETS, FISH, FISH_WEIGHTS, LOOT_TABLES, COLLECTIONS, type Inventory, type PlanetId, type Recipe } from './content.ts';
import { ANIMALS, ANIMAL_KINDS, FARM_DISHES, ANIMAL_LIFESPAN_MS, isFeedCrop, isTreeCrop, type AnimalKind } from './model.ts';
import { ENEMY_TYPES } from './enemy-types.ts';
import { TITANS } from './titan-content.ts';
import { DUNGEON_ITEMS, DUNGEON_LEVEL } from './dungeon-content.ts';
import { COLOSSUS_TYPE, COLOSSUS_NAME, COLOSSUS_PLACE, COLOSSUS_ITEMS } from './colossus-content.ts';
import { COLOSSUS_PET } from './colossus-rewards.ts';

export type ChapterId = 'garden' | 'animals' | 'kitchen' | 'workshop' | 'fishing' | 'worlds';
export const CHAPTERS: readonly [ChapterId, string, string][] = [['garden', '🌱', 'Garden'], ['animals', '🐔', 'Animals'], ['kitchen', '🍲', 'Kitchen'], ['workshop', '🔨', 'Workshop'], ['fishing', '🎣', 'Fishing'], ['worlds', '🚀', 'Worlds']];
/** The mine material of each world (model.ts claimMine). */
export const MINE_MATERIAL: Partial<Record<PlanetId, string>> = { candy: 'sugar', ice: 'icecrystal', lava: 'mcrystal', toy: 'gear', jungle: 'vine', ocean: 'coral', cloud: 'feather', shadow: 'shadow' };
/** FISH_WEIGHTS keys as places: three home waters and the worlds' ponds. */
export const WATERS: Record<string, { name: string; planet: PlanetId }> = {
  home: { name: 'Village pond', planet: 'home' }, lake: { name: 'Lake Meadow', planet: 'home' }, swamp: { name: 'Chomper Swamp', planet: 'home' },
  candy: { name: 'Candy Planet', planet: 'candy' }, toy: { name: 'Toybox Planet', planet: 'toy' }, jungle: { name: 'Wild Jungle', planet: 'jungle' },
  ocean: { name: 'Ocean Planet', planet: 'ocean' }, ice: { name: 'Frost Planet', planet: 'ice' }, shadow: { name: 'Night Planet', planet: 'shadow' },
};

/** Where a thing comes from. */
export type Source =
  | { kind: 'grow'; crop: string; seed?: string; level: number }
  | { kind: 'roast'; from: string }
  | { kind: 'dish'; materials: Inventory }
  | { kind: 'animal'; animal: AnimalKind }
  | { kind: 'age' } // any farm animal after its two hours
  | { kind: 'recipe'; station: Recipe['station']; category: string; energy: number; materials: Inventory; index: number; count: number }
  | { kind: 'drop'; enemy: string; chance: number; planets: PlanetId[]; boss: boolean }
  | { kind: 'fish'; waters: string[] }
  | { kind: 'hunt' } // harpoon only (the Lake Guardian)
  | { kind: 'mine'; planet: PlanetId }
  | { kind: 'vault' }
  | { kind: 'lastblow' }; // the Colossus's companion, for the final blow (colossus-rewards.ts)
/** What a thing turns into or is needed for. */
export type Use =
  | { kind: 'plant'; crop: string }
  | { kind: 'roast'; to: string }
  | { kind: 'dish'; to: string; need: number }
  | { kind: 'recipe'; to: string; need: number; station: Recipe['station']; index: number }
  | { kind: 'feed' };
export interface Edge { from: string; to: string; kind: Source['kind'] | 'seed'; n?: number }
export interface Cell { id: string; n?: number; note?: string; noteParams?: Record<string, string | number> }
/** One chain: columns of cells, read left to right (an arrow between columns). */
export interface Row { id: string; label?: string; labelParams?: Record<string, string | number>; columns: Cell[][] }
export interface Group { id: string; title: string; titleParams?: Record<string, string | number>; note?: string; noteParams?: Record<string, string | number>; rows: Row[]; planet?: PlanetId }
export interface Chapter { id: ChapterId; icon: string; title: string; lead: string; groups: Group[] }
export interface ProductGraph { chapters: Chapter[]; edges: Edge[]; sources: Map<string, Source[]>; uses: Map<string, Use[]>; nodes: Set<string> }

/** Pseudo nodes that are not items: 'animal:cow', 'planet:candy', 'water:lake', 'enemy:boar', 'energy'. */
export const isItemNode = (id: string) => !id.includes(':') && id !== 'energy';
const planetsOf = (enemy: string): PlanetId[] => (Object.entries(PLANETS) as [PlanetId, (typeof PLANETS)[PlanetId]][]).filter(([, p]) => p.bosses.includes(enemy) || p.spawns.some(([id]) => id === enemy)).map(([id]) => id)
  .concat(Object.hasOwn(TITANS, enemy) ? [(TITANS as Record<string, { planet: string }>)[enemy].planet as PlanetId] : enemy === COLOSSUS_TYPE || enemy === 'forest_raptor' ? ['home'] : []);
const isBoss = (enemy: string) => !!ENEMY_TYPES[enemy]?.boss || enemy === COLOSSUS_TYPE || Object.hasOwn(TITANS, enemy);
export const enemyName = (enemy: string) => enemy === COLOSSUS_TYPE ? COLOSSUS_NAME : ENEMY_TYPES[enemy]?.name ?? enemy;

let cached: ProductGraph | null = null;
export function productGraph(): ProductGraph {
  if (cached) return cached;
  const sources = new Map<string, Source[]>(), uses = new Map<string, Use[]>(), edges: Edge[] = [];
  const src = (id: string, s: Source) => { if (!sources.has(id)) sources.set(id, []); sources.get(id)!.push(s); };
  const use = (id: string, u: Use) => { if (!uses.has(id)) uses.set(id, []); uses.get(id)!.push(u); };
  // Growing and roasting
  for (const [id, crop] of Object.entries(CROPS)) {
    src(id, { kind: 'grow', crop: id, seed: crop.seed, level: crop.level });
    if (crop.seed) { use(crop.seed, { kind: 'plant', crop: id }); edges.push({ from: crop.seed, to: id, kind: 'seed' }); }
    if (isFeedCrop(id)) use(id, { kind: 'feed' });
  }
  for (const [id, item] of Object.entries(ITEMS)) if (item.cooked && item.base) { src(id, { kind: 'roast', from: item.base }); use(item.base, { kind: 'roast', to: id }); edges.push({ from: item.base, to: id, kind: 'roast' }); }
  // Animals, their products and the dishes
  for (const kind of ANIMAL_KINDS) { const a = ANIMALS[kind]; if (!Object.hasOwn(ITEMS, a.product)) continue; src(a.product, { kind: 'animal', animal: kind }); edges.push({ from: `animal:${kind}`, to: a.product, kind: 'animal' }); }
  src('meat', { kind: 'age' });
  if (Object.hasOwn(ITEMS, 'pet_dog')) { src('pet_dog', { kind: 'animal', animal: 'dog' }); edges.push({ from: 'animal:dog', to: 'pet_dog', kind: 'animal' }); }
  if (Object.hasOwn(ITEMS, COLOSSUS_PET)) { src(COLOSSUS_PET, { kind: 'lastblow' }); edges.push({ from: `enemy:${COLOSSUS_TYPE}`, to: COLOSSUS_PET, kind: 'lastblow' }); }
  for (const dish of FARM_DISHES) { src(dish.id, { kind: 'dish', materials: dish.materials }); for (const [id, n] of Object.entries(dish.materials)) { use(id, { kind: 'dish', to: dish.id, need: n! }); edges.push({ from: id, to: dish.id, kind: 'dish', n }); } }
  // Shop, workshop and furnace
  RECIPES.forEach((r, index) => {
    src(r.result, { kind: 'recipe', station: r.station, category: r.category, energy: r.energy, materials: r.materials, index, count: r.count || 1 });
    for (const [id, n] of Object.entries(r.materials)) { use(id, { kind: 'recipe', to: r.result, need: n!, station: r.station, index }); edges.push({ from: id, to: r.result, kind: 'recipe', n }); }
    if (!Object.keys(r.materials).length) edges.push({ from: 'energy', to: r.result, kind: 'recipe', n: r.energy });
  });
  // Drops, fish, veins, the vault
  for (const [enemy, table] of Object.entries(LOOT_TABLES)) for (const [id, chance] of table) { if (!Object.hasOwn(ITEMS, id)) continue; src(id, { kind: 'drop', enemy, chance, planets: planetsOf(enemy), boss: isBoss(enemy) }); edges.push({ from: `enemy:${enemy}`, to: id, kind: 'drop' }); }
  for (const id of Object.keys(FISH)) { const waters = Object.keys(WATERS).filter(w => FISH_WEIGHTS[w]?.some(([fish]) => fish === id)); if (waters.length) { src(id, { kind: 'fish', waters }); for (const w of waters) edges.push({ from: `water:${w}`, to: id, kind: 'fish' }); } else { src(id, { kind: 'hunt' }); edges.push({ from: 'water:lake', to: id, kind: 'hunt' }); } }
  for (const [planet, id] of Object.entries(MINE_MATERIAL) as [PlanetId, string][]) { src(id, { kind: 'mine', planet }); edges.push({ from: `planet:${planet}`, to: id, kind: 'mine' }); }
  for (const id of Object.keys(DUNGEON_ITEMS)) { src(id, { kind: 'vault' }); edges.push({ from: 'planet:home', to: id, kind: 'vault' }); }

  const sell = (id: string) => ITEMS[id]?.sell ?? 0, cell = (id: string, n?: number): Cell => n && n > 1 ? { id, n } : { id };
  const cells = (inv: Inventory) => Object.entries(inv).map(([id, n]) => cell(id, n));
  const cooked = (id: string) => Object.hasOwn(ITEMS, `cooked_${id}`) ? [[cell(`cooked_${id}`)]] : [];
  // ---- Garden
  const cropRow = (id: string): Row => ({ id: `grow:${id}`, columns: [...(CROPS[id].seed ? [[cell(CROPS[id].seed!)]] : []), [cell(id)], ...cooked(id)] });
  const byLevel = (a: string, b: string) => CROPS[a].level - CROPS[b].level || sell(a) - sell(b);
  const field = Object.keys(CROPS).filter(id => !isTreeCrop(id)).sort(byLevel), trees = Object.keys(CROPS).filter(isTreeCrop).sort(byLevel);
  const garden: Chapter = { id: 'garden', icon: '🌱', title: 'Garden', lead: 'Seed to crop to a warm plate: every bed is a small business.', groups: [
    { id: 'field', title: 'Field crops', note: 'Fast crops fill the market stall. Roasting a crop more than doubles what it sells for.', rows: field.map(cropRow) },
    { id: 'trees', title: 'Fruit trees', note: 'Slow and rich: plant them before you leave on a long trip.', rows: trees.map(cropRow) },
    { id: 'care', title: 'Garden care', note: 'Fertilizer halves the wait, a bed kit adds a bed.', rows: ['manure', 'spore', 'plot_kit'].filter(id => Object.hasOwn(ITEMS, id)).map(id => ({ id: `care:${id}`, columns: [[cell(id)]] })) },
  ] };
  // ---- Animals
  const dishesOf = (product: string) => FARM_DISHES.filter(d => Object.hasOwn(d.materials, product)).map(d => cell(d.id));
  const animals: Chapter = { id: 'animals', icon: '🐔', title: 'Animals', lead: 'Feed them, collect from them, and the kitchen turns it into dishes.', groups: [
    { id: 'pen', title: 'The pen', note: 'Each animal gives its product again and again while it lives with you.', rows: ANIMAL_KINDS.filter(k => Object.hasOwn(ITEMS, ANIMALS[k].product) && ITEMS[ANIMALS[k].product].sell > 0).sort((a, b) => ANIMALS[a].level - ANIMALS[b].level || ANIMALS[a].price - ANIMALS[b].price)
      .map(kind => ({ id: `animal:${kind}`, columns: [[cell(`animal:${kind}`)], [cell(ANIMALS[kind].product)], ...(dishesOf(ANIMALS[kind].product).length ? [dishesOf(ANIMALS[kind].product)] : [])] })) },
    { id: 'old', title: 'A full life', note: 'After {hours} hours an animal leaves meat behind instead.', noteParams: { hours: ANIMAL_LIFESPAN_MS / 3_600_000 }, rows: [{ id: 'animal:meat', columns: [[cell('meat')], ...cooked('meat')] }] },
    ...(Object.hasOwn(ITEMS, 'pet_dog') ? [{ id: 'dog', title: 'The guard dog', note: 'It guards ripe crops, and comes along as a pet.', rows: [{ id: 'animal:dog', columns: [[cell('animal:dog')], [cell('pet_dog')]] }] }] : []),
  ] };
  // ---- Kitchen
  const gain = (id: string) => sell(`cooked_${id}`) - sell(id);
  const roastable = Object.keys(ITEMS).filter(id => Object.hasOwn(ITEMS, `cooked_${id}`) && !ITEMS[id].cooked).sort((a, b) => gain(b) - gain(a) || (a < b ? -1 : 1));
  const kitchen: Chapter = { id: 'kitchen', icon: '🍲', title: 'Kitchen', lead: 'The same harvest, worth more: cook first, then sell or eat.', groups: [
    { id: 'dishes', title: 'Farm dishes', note: 'Eggs and milk become dishes with buffs.', rows: FARM_DISHES.map(d => ({ id: `dish:${d.id}`, columns: [cells(d.materials), [cell(d.id)]] })) },
    { id: 'roast', title: 'Roasting', note: 'Biggest gain first. A roast sells for about 2.2 times the raw price and heals twice as much.', rows: roastable.map(id => ({ id: `roast:${id}`, columns: [[cell(id)], [cell(`cooked_${id}`)]] })) },
  ] };
  // ---- Workshop: one group per station and category, in the catalogue's order
  const recipeGroups = new Map<string, Group>();
  RECIPES.forEach((r, index) => {
    const key = `${r.station}:${r.category}`;
    if (!recipeGroups.has(key)) recipeGroups.set(key, { id: key, title: r.category, note: r.station === 'shop' ? 'At the outfitters.' : r.station === 'craft' ? 'At the workshop.' : 'At the ancient furnace on the Volcano Planet.', rows: [] });
    recipeGroups.get(key)!.rows.push({ id: `recipe:${index}`, columns: [[{ id: 'energy', n: r.energy }, ...cells(r.materials)].filter(c => c.id !== 'energy' || r.energy > 0), [cell(r.result, r.count)]] });
  });
  const workshop: Chapter = { id: 'workshop', icon: '🔨', title: 'Workshop', lead: 'What the trail gives you becomes gear, pets and decorations.', groups: [...recipeGroups.values()].sort((a, b) => Number(a.id.startsWith('shop')) - Number(b.id.startsWith('shop'))) };
  // ---- Fishing
  const rarity = (id: string) => FISH[id].rarity, fishRow = (id: string): Row => ({ id: `fish:${id}`, columns: [[cell(id)], ...cooked(id)] });
  const fishIds = Object.keys(FISH).sort((a, b) => sell(a) - sell(b));
  const fishing: Chapter = { id: 'fishing', icon: '🎣', title: 'Fishing', lead: 'Every water has its own fish. Rare ones feed the whole village.', groups: [
    { id: 'tools', title: 'Rods and bait', rows: [{ id: 'fish:tools', columns: [['rod', 'rod_gold', 'rod_steady', 'harpoon', 'worm'].filter(id => Object.hasOwn(ITEMS, id)).map(id => cell(id))] }] },
    ...(['common', 'rare', 'legendary', 'junk'] as const).map(r => ({ id: `fish:${r}`, title: r === 'common' ? 'Common fish' : r === 'rare' ? 'Rare fish' : r === 'legendary' ? 'Legendary fish' : 'Old boots', rows: fishIds.filter(id => rarity(id) === r).map(fishRow) })).filter(g => g.rows.length),
    { id: 'waters', title: 'Where they bite', rows: Object.keys(WATERS).filter(w => FISH_WEIGHTS[w]).map(w => ({ id: `water:${w}`, label: WATERS[w].name, columns: [[...FISH_WEIGHTS[w]].sort((a, b) => b[1] - a[1]).map(([id]) => cell(id))] })) },
  ] };
  // ---- Worlds
  const everySource = (id: string) => sources.get(id) ?? [];
  const onlyOn = (id: string, planet: PlanetId) => { const list = everySource(id).filter(s => s.kind === 'drop' || s.kind === 'mine' || s.kind === 'fish'); return list.length > 0 && list.every(s => s.kind === 'mine' ? s.planet === planet : s.kind === 'drop' ? s.planets.length > 0 && s.planets.every(p => p === planet) : s.waters.every(w => WATERS[w].planet === planet)); };
  const drops = (enemies: readonly string[]) => [...new Set(enemies.flatMap(e => (LOOT_TABLES[e] ?? []).map(([id]) => id)).filter(id => Object.hasOwn(ITEMS, id)))];
  const collectionOf = (planet: PlanetId) => COLLECTIONS[planet === 'cloud' ? 'sky' : planet === 'shadow' ? 'dark' : planet]?.items ?? [];
  const planetGroup = (planet: PlanetId): Group => {
    const p = PLANETS[planet], creatures = [...new Set(p.spawns.map(([id]) => id))], titan = Object.entries(TITANS).find(([, t]) => (t as { planet: string }).planet === planet)?.[0];
    const common = drops(creatures), bossy = drops(p.bosses).filter(id => !common.includes(id)), mine = MINE_MATERIAL[planet], water = Object.keys(WATERS).filter(w => WATERS[w].planet === planet && FISH_WEIGHTS[w]);
    const fish = [...new Set(water.flatMap(w => FISH_WEIGHTS[w].map(([id]) => id)))].filter(id => Object.hasOwn(ITEMS, id));
    const only = [...new Set([...common, ...bossy, ...(mine ? [mine] : []), ...fish])].filter(id => onlyOn(id, planet)).sort((a, b) => Number(ITEMS[b].type === 'material') - Number(ITEMS[a].type === 'material'));
    const rows: Row[] = [
      ...(only.length ? [{ id: `only:${planet}`, label: 'Only here', columns: [only.map(id => cell(id))] }] : []),
      ...(common.length ? [{ id: `drops:${planet}`, label: 'Creatures drop', columns: [common.map(id => cell(id))] }] : []),
      ...(bossy.length ? [{ id: `boss:${planet}`, label: 'Bosses drop', columns: [bossy.map(id => cell(id))] }] : []),
      ...(titan && LOOT_TABLES[titan] ? [{ id: `titan:${planet}`, label: 'The titan drops', columns: [drops([titan]).map(id => cell(id))] }] : []),
      ...(mine ? [{ id: `mine:${planet}`, label: 'Crystal veins give', columns: [[cell(mine)]] }] : []),
      ...(fish.length ? [{ id: `pond:${planet}`, label: 'Fish', columns: [fish.map(id => cell(id))] }] : []),
      ...(collectionOf(planet).length ? [{ id: `set:${planet}`, label: 'Its collection', columns: [collectionOf(planet).filter(id => Object.hasOwn(ITEMS, id)).map(id => cell(id))] }] : []),
    ];
    return { id: `planet:${planet}`, title: p.name, note: 'Landing from level {level}.', noteParams: { level: p.level }, rows, planet };
  };
  const strays = Object.keys(LOOT_TABLES).filter(e => !planetsOf(e).length), vault = Object.keys(DUNGEON_ITEMS);
  const worlds: Chapter = { id: 'worlds', icon: '🚀', title: 'Worlds', lead: 'Each world keeps something no other has. Go and bring it home.', groups: [
    ...(Object.keys(PLANETS) as PlanetId[]).sort((a, b) => PLANETS[a].level - PLANETS[b].level).map(planetGroup),
    ...(LOOT_TABLES[COLOSSUS_TYPE] ? [{ id: 'colossus', title: COLOSSUS_NAME, note: 'It wakes once a day in {place}.', noteParams: { place: COLOSSUS_PLACE }, rows: [{ id: 'colossus:drops', columns: [[...new Set([...drops([COLOSSUS_TYPE]), ...Object.keys(COLOSSUS_ITEMS)])].map(id => cell(id))] }] }] : []),
    ...(vault.length ? [{ id: 'vault', title: "The Delvers' Vault", note: 'A five-room dungeon by the south gate, best from level {level}.', noteParams: { level: DUNGEON_LEVEL }, rows: [{ id: 'vault:rewards', columns: [vault.map(id => cell(id))] }] }] : []),
    ...(strays.length ? [{ id: 'strays', title: 'Other creatures', note: 'Met on the trails and in events.', rows: [{ id: 'strays:drops', columns: [drops(strays).map(id => cell(id))] }] }] : []),
  ] };
  const chapters = [garden, animals, kitchen, workshop, fishing, worlds];
  const nodes = new Set<string>(); for (const c of chapters) for (const g of c.groups) for (const r of g.rows) for (const col of r.columns) for (const one of col) nodes.add(one.id);
  return cached = { chapters, edges, sources, uses, nodes };
}
/** Items a player can sell or cook that the map must show (keepsakes and dye recolours aside). */
export const mappableItems = () => Object.keys(ITEMS).filter(id => { const item = ITEMS[id]; return !item.keepsake && !item.dye && item.type !== 'effect' && (item.sell > 0 || Object.hasOwn(ITEMS, `cooked_${id}`)); });
