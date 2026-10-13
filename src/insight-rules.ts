/**
 * The Village Almanac's reading of a save: nine scores from 0 to 100 with a reason each, the next steps that would
 * earn the most (with the numbers behind them), the best use of one item, the trend since the first snapshot, the
 * level report and the words of praise. Pure rules: every figure comes from the save and the game's own prices and
 * timers (model.ts, farm.ts, progression.ts); a thing that cannot be computed is left out, never guessed.
 *
 * Text is returned as a Msg (an English template, its numbers, and which parameters are names to translate), so the
 * pages localize it and the tests can check every phrase has Vietnamese.
 *
 * THE SCORES (each a weighted sum of parts between 0 and 1; a locked area is not scored):
 *  garden   35% beds planted / beds owned · 25% beds owned / 24 · 25% how each planted bed's crop compares, in energy
 *           per hour, with the best crop of its kind (field crop or fruit tree) the explorer can plant now · 15% bed
 *           upgrade levels / 5.
 *  animals  20% pen built · 40% animals / 15 · 20% kinds kept / kinds unlocked at this level · 10% pen expansions / 2
 *           · 10% the guard dog. Opens at level 2.
 *  kitchen  60% meals cooked / (crops harvested + fish caught), at most 1 · 25% how little raw, cookable produce is
 *           lying in the bag and chest (by value) · 15% Pepper the cook rescued. Opens with the kitchen.
 *  workshop 35% gear slots filled / 5 · 25% crystal upgrades / level, at most 1 · 20% bench and forge levels of what
 *           is worn · 20% things bought or crafted on the way through the journal's milestones.
 *  fishing  40% fish caught (journal milestones) · 35% kinds caught / kinds living in waters already visited · 25% the
 *           best rod owned (bamboo 1/3, golden 2/3, steady 3/3).
 *  exploring 40% worlds visited / worlds this level may land on · 30% different bosses beaten / bosses of those worlds
 *           · 15% creatures defeated (milestones) · 15% veins mined (milestones).
 *  helpers  45% friends rescued / 3 · 15% the garden robot · 10% the pen robot · 30% the share of them at work (not
 *           paused). With nobody yet, the score is 0 and the reason says who waits to be rescued.
 *  savings  100 minus 15 for each improvement the saved energy could buy right now (at most six counted), minus 10 when
 *           the energy is more than ten times the dearest of them. 100 means every bit of energy is at work.
 *  habits   30% check-in streak / 7 · 35% today's daily tasks collected · 20% this week's tasks done · 15% star pass
 *           stars / the pass's last tier.
 * "Milestones" are the journal's own achievement tiers (progression.ts ACHIEVEMENTS): each tier passed is an equal
 * share, the way to the next tier counts in proportion.
 */
import * as M from './model.ts';
import { ITEMS, CROPS, PLANETS, FISH, FISH_WEIGHTS, UPGRADES, type PlanetId } from './content.ts';
import { ACHIEVEMENTS, PASS_REWARDS, dailyChestEnergy } from './progression.ts';
import { MAX_GEAR_LEVEL } from './gear-ceiling.ts';
import { gearLevel as benchLevel } from './upgrades.ts';
import { FRIENDS, FRIEND_IDS, CAGES } from './friends-state.ts';
import { HISTORY_FIELDS, fieldOf, snapshotOf, type HistoryField, type Snapshot } from './insight-history.ts';
import { productGraph, WATERS, enemyName, type Source } from './insight-graph.ts';

export interface Msg { text: string; params?: Record<string, string | number>; /** Parameter keys whose values are English names (items, crops, places) to translate. */ names?: string[] }
const msg = (text: string, params?: Msg['params'], names?: string[]): Msg => ({ text, ...(params ? { params } : {}), ...(names ? { names } : {}) });
export const SCORE_IDS = ['garden', 'animals', 'kitchen', 'workshop', 'fishing', 'exploring', 'helpers', 'savings', 'habits'] as const;
export type ScoreId = typeof SCORE_IDS[number];
export const SCORE_LABEL: Record<ScoreId, string> = { garden: 'Garden', animals: 'Animals', kitchen: 'Kitchen', workshop: 'Workshop and gear', fishing: 'Fishing', exploring: 'Exploring', helpers: 'Helpers', savings: 'Energy at work', habits: 'Daily habits' };
export const SCORE_ICON: Record<ScoreId, string> = { garden: '🌱', animals: '🐔', kitchen: '🍲', workshop: '🔨', fishing: '🎣', exploring: '🚀', helpers: '🤝', savings: 'ϟ', habits: '🗓️' };
export interface Score { id: ScoreId; score: number; open: boolean; reason: Msg; /** The parts, each 0-1 with its weight, for the tests and the curious. */ parts: [name: string, share: number, weight: number][] }
const clamp01 = (v: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
const total = (s: M.SaveState, key: string) => { const v = s.progression.totals[key]; return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0; };
const tiers = (id: string) => ACHIEVEMENTS.find(a => a[0] === id)?.[2] ?? [1];
/** Progress through a journal milestone list: tiers passed plus the way to the next, as 0-1. */
export function tierShare(value: number, targets: readonly number[]): number {
  let passed = 0; while (passed < targets.length && value >= targets[passed]) passed++;
  if (passed >= targets.length) return 1;
  const from = passed ? targets[passed - 1] : 0;
  return clamp01((passed + clamp01((value - from) / (targets[passed] - from))) / targets.length);
}
const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);
const held = (s: M.SaveState, id: string) => M.looseQuantity(s, id) + (s.chest[id] ?? 0);

// ---- Crops per hour
/** Energy per hour of one crop on one bed, planted now (the bed's own speed-up applied). */
export function cropPerHour(s: M.SaveState, crop: string, plot?: M.Plot): number {
  const time = M.bedGrowTime(plot, M.cropGrowTime(s, crop)); return time > 0 ? M.sellPrice(s, crop) * 3_600_000 / time : 0;
}
/** Crops the explorer can plant right now: level reached, and a seed in the bag when the crop needs one. */
export const plantable = (s: M.SaveState, tree?: boolean) => Object.keys(CROPS).filter(id => s.level >= M.cropLevel(s, id) && (!CROPS[id].seed || (s.bag[CROPS[id].seed!] ?? 0) > 0) && (tree === undefined || M.isTreeCrop(id) === tree));
/** The crop that earns the most per hour among those, or null. */
export function bestCrop(s: M.SaveState, tree?: boolean, plot?: M.Plot): string | null {
  let best: string | null = null, top = 0;
  for (const id of plantable(s, tree)) { const v = cropPerHour(s, id, plot); if (v > top) { top = v; best = id; } }
  return best;
}

// ---- The scores
function finish(id: ScoreId, parts: Score['parts'], reason: Msg, open = true): Score {
  const sum = parts.reduce((n, [, share, weight]) => n + clamp01(share) * weight, 0), weights = parts.reduce((n, [, , w]) => n + w, 0) || 1;
  return { id, open, reason, parts, score: open ? Math.max(0, Math.min(100, Math.round(sum / weights * 100))) : 0 };
}
function gardenScore(s: M.SaveState): Score {
  const beds = s.plots.length, planted = s.plots.filter(p => p.crop), empty = beds - planted.length;
  const quality = planted.length ? planted.reduce((n, p) => { const best = bestCrop(s, M.isTreeCrop(p.crop!), p); return n + (best ? clamp01(cropPerHour(s, p.crop!, p) / cropPerHour(s, best, p)) : 1); }, 0) / planted.length : 0;
  const levels = beds ? s.plots.reduce((n, p) => n + M.bedLevel(p), 0) / (beds * M.BED_MAX_LEVEL) : 0;
  const reason = !planted.length ? msg('All {beds} beds are resting. Seeds are waiting for you.', { beds }) : empty ? msg('{planted} of {beds} beds are growing; {empty} are empty.', { planted: planted.length, beds, empty })
    : beds < M.MAX_PLOTS ? msg('Every one of your {beds} beds is growing. There is room for {more} more.', { beds, more: M.MAX_PLOTS - beds }) : msg('All {beds} beds are growing: a full garden.', { beds });
  return finish('garden', [['planted', beds ? planted.length / beds : 0, 35], ['beds', beds / M.MAX_PLOTS, 25], ['crops', quality, 25], ['upgrades', levels, 15]], reason);
}
const livestock = (s: M.SaveState) => M.farmOf(s).animals.filter(a => a.kind !== 'dog');
function animalsScore(s: M.SaveState): Score {
  const farm = M.farmOf(s), open = s.level >= M.PEN_BUILD.level, herd = livestock(s), kinds = new Set(herd.map(a => a.kind)).size;
  const unlocked = M.ANIMAL_KINDS.filter(k => k !== 'dog' && s.level >= M.ANIMALS[k].level).length, dog = farm.animals.some(a => a.kind === 'dog');
  const reason = !open ? msg('The animal pen opens at level {level}.', { level: M.PEN_BUILD.level }) : !farm.built ? msg('A spot for the pen is waiting: {price} energy builds it.', { price: M.PEN_BUILD.price })
    : !herd.length ? msg('The pen is built and quiet. A first chick costs {price} energy.', { price: M.priceOf(s, 'chicken') }) : msg('{count} animals of {kinds} kinds live in your pen.', { count: herd.length, kinds });
  return finish('animals', [['built', farm.built ? 1 : 0, 20], ['herd', herd.length / M.MAX_ANIMALS_TOTAL, 40], ['kinds', unlocked ? kinds / unlocked : 0, 20], ['pen', farm.penLevel / M.MAX_PEN_LEVEL, 10], ['dog', dog ? 1 : 0, 10]], reason, open);
}
/** Raw produce that the kitchen could roast, with what roasting adds (bag and chest). */
export function rawCookable(s: M.SaveState) {
  let count = 0, raw = 0, gain = 0; const lots: { id: string; n: number; gain: number }[] = [];
  for (const id of new Set([...Object.keys(s.bag), ...Object.keys(s.chest)])) {
    const item = ITEMS[id]; if (!item || !['crop', 'fish'].includes(item.type) || !Object.hasOwn(ITEMS, `cooked_${id}`)) continue;
    const n = held(s, id); if (n < 1) continue;
    const each = M.sellPrice(s, `cooked_${id}`) - M.sellPrice(s, id); count += n; raw += n * M.sellPrice(s, id); gain += n * each; lots.push({ id, n, gain: n * each });
  }
  return { count, raw, gain, lots: lots.sort((a, b) => b.gain - a.gain || (a.id < b.id ? -1 : 1)) };
}
function kitchenScore(s: M.SaveState): Score {
  const open = M.kitchenOpen(s), cooked = total(s, 'cook'), made = total(s, 'harvest') + total(s, 'fish'), waiting = rawCookable(s), pepper = (s.friends ?? []).some(f => f.id === 'pepper');
  const stock = waiting.raw + [...new Set([...Object.keys(s.bag), ...Object.keys(s.chest)])].filter(id => ITEMS[id]?.cooked).reduce((n, id) => n + held(s, id) * M.sellPrice(s, id), 0);
  const reason = !open ? msg('The kitchen opens at level {level}.', { level: M.kitchenLevel(s) }) : waiting.count ? msg('{count} raw crops and fish are waiting for the pot.', { count: waiting.count })
    : cooked ? msg('{cooked} meals cooked so far, and nothing raw left lying about.', { cooked }) : msg('The stove is cold: nothing has been cooked yet.');
  return finish('kitchen', [['cooked', made ? cooked / made : cooked ? 1 : 0, 60], ['fresh', stock ? 1 - waiting.raw / stock : 1, 25], ['cook', pepper ? 1 : 0, 15]], reason, open);
}
const WORN_SLOTS = ['weapon', 'hat', 'outfit', 'boots', 'pet'] as const;
function workshopScore(s: M.SaveState): Score {
  const worn = WORN_SLOTS.filter(slot => s.gear[slot]), ups = s.healthUp + s.attackUp + s.defenseUp + s.critUp;
  const levels = worn.length ? worn.reduce((n, slot) => n + (slot === 'weapon' ? M.forgeLevel(s, s.gear.weapon!) / M.MAX_FORGE_LEVEL : benchLevel(s, s.gear[slot]!) / MAX_GEAR_LEVEL), 0) / WORN_SLOTS.length : 0;
  const made = total(s, 'craft'), reason = worn.length < WORN_SLOTS.length ? msg('{worn} of {slots} gear slots are filled.', { worn: worn.length, slots: WORN_SLOTS.length })
    : ups < s.level ? msg('Fully dressed, with {ups} crystal upgrades at level {level}.', { ups, level: s.level }) : msg('Fully dressed and well upgraded: {ups} crystal upgrades.', { ups });
  return finish('workshop', [['slots', worn.length / WORN_SLOTS.length, 35], ['crystal', ups / Math.max(1, s.level), 25], ['levels', levels, 20], ['made', clamp01(made / STORY_CRAFTS), 20]], reason);
}
/** The story asks for 1 and then 3 purchases or crafts (content.ts STORY_STEPS); five gear slots make 5 a full set. */
const STORY_CRAFTS = 5;
const RODS: [string, number][] = [['rod_steady', 1], ['rod_gold', 2 / 3], ['rod', 1 / 3]];
function fishingScore(s: M.SaveState): Score {
  const caught = total(s, 'fish'), waters = Object.keys(WATERS).filter(w => s.visited.includes(WATERS[w].planet) && FISH_WEIGHTS[w]);
  const here = new Set(waters.flatMap(w => FISH_WEIGHTS[w].map(([id]) => id)).filter(id => FISH[id] && FISH[id].rarity !== 'junk')), kinds = [...here].filter(id => s.fishRecords[id]).length;
  const rod = RODS.find(([id]) => M.ownsItem(s, id))?.[1] ?? 0;
  const reason = !rod ? msg('No fishing rod yet: the outfitters sell one for {price} energy.', { price: ITEMS.rod.price ?? 0 }) : !caught ? msg('You have a rod and a quiet pond waiting.') : msg('{caught} fish caught, {kinds} of the {all} kinds in the waters you know.', { caught, kinds, all: here.size });
  return finish('fishing', [['caught', tierShare(caught, tiers('fish')), 40], ['kinds', here.size ? kinds / here.size : 0, 35], ['rod', rod, 25]], reason);
}
const landable = (s: M.SaveState) => (Object.keys(PLANETS) as PlanetId[]).filter(id => s.level >= PLANETS[id].level);
function exploringScore(s: M.SaveState): Score {
  const open = landable(s), seen = open.filter(id => s.visited.includes(id)), bosses = new Set(open.flatMap(id => PLANETS[id].bosses.map(b => `${id}:${b}`))), beaten = (s.bosses ?? []).filter(key => bosses.has(key)).length;
  const waiting = open.filter(id => !s.visited.includes(id));
  const reason = waiting.length ? msg('{count} more worlds are open to you: {planet} is waiting.', { count: waiting.length, planet: PLANETS[waiting[0]].name }, ['planet']) : beaten < bosses.size ? msg('Every world you can reach is visited. {left} bosses still stand.', { left: bosses.size - beaten })
    : msg('Every world you can reach is visited and every boss there has fallen.');
  return finish('exploring', [['worlds', open.length ? seen.length / open.length : 0, 40], ['bosses', bosses.size ? beaten / bosses.size : 0, 30], ['creatures', tierShare(total(s, 'kill'), tiers('kills')), 15], ['veins', tierShare(total(s, 'mine'), tiers('mine')), 15]], reason);
}
/** Everyone who can work at home, with whether they are at it. */
export function workers(s: M.SaveState) {
  const list: { id: string; name: string; working: boolean }[] = (s.friends ?? []).map(f => ({ id: f.id, name: FRIENDS[f.id].name, working: !f.paused }));
  if (s.helper?.owned) list.push({ id: 'robot', name: 'Garden robot', working: !s.helper.paused });
  if (M.farmOf(s).helper?.owned) list.push({ id: 'penbot', name: 'Pen robot', working: !M.farmOf(s).helper!.paused });
  return list;
}
function helpersScore(s: M.SaveState): Score {
  const crew = workers(s), friends = (s.friends ?? []).length, idle = crew.filter(w => !w.working), missing = FRIEND_IDS.find(id => !(s.friends ?? []).some(f => f.id === id));
  const reason = idle.length ? msg('{name} is on pause and would gladly work again.', { name: idle[0].name }, ['name']) : missing ? msg('{name} is still held by a boss on {planet}.', { name: FRIENDS[missing].name, planet: PLANETS[CAGES[missing].planet].name }, ['planet'])
    : msg('All {count} of your helpers are at work.', { count: crew.length });
  return finish('helpers', [['friends', friends / FRIEND_IDS.length, 45], ['robot', s.helper?.owned ? 1 : 0, 15], ['penbot', M.farmOf(s).helper?.owned ? 1 : 0, 10], ['working', crew.length ? 1 - idle.length / crew.length : 0, 30]], reason);
}
export interface Buy { id: string; cost: number }
/** Improvements the saved energy could pay for right now (location aside): crystal upgrades, a bed upgrade, a bed, the pen and its animals. */
export function affordable(s: M.SaveState): Buy[] {
  const out: Buy[] = [], farm = M.farmOf(s);
  for (const kind of Object.keys(UPGRADES) as (keyof typeof UPGRADES)[]) { const cost = M.upgradeCost(s, kind); if (!(kind === 'crit' && s.critUp >= UPGRADES.crit.max) && s.energy >= cost) out.push({ id: `upgrade:${kind}`, cost }); }
  const bed = s.plots.map((p, i) => ({ i, level: M.bedLevel(p) })).filter(b => b.level < M.BED_MAX_LEVEL).sort((a, b) => a.level - b.level)[0];
  if (bed && s.energy >= M.bedUpgradeCost(s, bed.level)) out.push({ id: 'bed-upgrade', cost: M.bedUpgradeCost(s, bed.level) });
  const kit = M.kitPrice(s); if (kit !== null && s.energy >= kit) out.push({ id: 'bed', cost: kit });
  if (s.level >= M.PEN_BUILD.level && !farm.built && s.energy >= M.PEN_BUILD.price) out.push({ id: 'pen', cost: M.PEN_BUILD.price });
  if (farm.built) { const animal = buyableAnimal(s); if (animal) out.push({ id: `animal:${animal}`, cost: M.priceOf(s, animal) });
    const expand = M.penExpandCost(s); if (expand !== null && s.energy >= expand) out.push({ id: 'pen-expand', cost: expand }); }
  return out;
}
/** Energy per hour of one animal's product (its product time, the difficulty's pace applied). */
export const animalPerHour = (s: M.SaveState, kind: M.AnimalKind) => { const d = M.ANIMALS[kind]; return d.productMs > 0 ? M.sellPrice(s, d.product) * 3_600_000 / (d.productMs * M.productPace(s)) : 0; };
/** The animal worth most per hour that could be bought now (level, room in the pen and energy all there). */
export function buyableAnimal(s: M.SaveState): M.AnimalKind | null {
  const farm = M.farmOf(s); if (!farm.built || livestock(s).length >= M.MAX_ANIMALS_TOTAL) return null;
  let best: M.AnimalKind | null = null;
  for (const kind of M.ANIMAL_KINDS) { if (kind === 'dog' || s.level < M.ANIMALS[kind].level || M.animalCount(s, kind) >= M.penCapacity(s, kind) || s.energy < M.priceOf(s, kind)) continue;
    if (!best || animalPerHour(s, kind) > animalPerHour(s, best)) best = kind; }
  return best;
}
function savingsScore(s: M.SaveState): Score {
  const buys = affordable(s), dearest = Math.max(0, ...buys.map(b => b.cost));
  const score = 100 - 15 * Math.min(6, buys.length) - (buys.length && s.energy > dearest * 10 ? 10 : 0);
  const reason = buys.length ? msg('{energy} energy is resting: it could pay for {count} improvements today.', { energy: s.energy, count: buys.length }) : msg('Every bit of your energy is already at work.');
  return { id: 'savings', open: true, reason, score: Math.max(0, score), parts: [['idle', Math.max(0, score) / 100, 100]] };
}
function habitsScore(s: M.SaveState, now: number): Score {
  const p = s.progression, today = p.daily.key === dayKey(now), tasks = today ? p.daily.tasks : [], done = tasks.filter(t => t.claimed).length + (today && p.daily.chest ? 1 : 0);
  const streak = p.login.day >= dayKey(now - 86_400_000) ? p.login.streak : 0, weekly = p.weekly.tasks, weekDone = weekly.filter(t => t.progress >= t.target).length;
  const reason = streak > 1 ? msg('{streak} days in a row, and {done} of {all} of today\'s rewards collected.', { streak, done, all: tasks.length + 1 }) : tasks.length ? msg('{done} of {all} of today\'s rewards collected.', { done, all: tasks.length + 1 })
    : msg('Today\'s tasks are waiting in the journal.');
  return finish('habits', [['streak', streak / 7, 30], ['daily', tasks.length ? done / (tasks.length + 1) : 0, 35], ['weekly', weekly.length ? weekDone / weekly.length : 0, 20], ['pass', p.pass.stars / (PASS_REWARDS.length * 50), 15]], reason);
}
export function scores(s: M.SaveState, now = Date.now()): Score[] {
  return [gardenScore(s), animalsScore(s), kitchenScore(s), workshopScore(s), fishingScore(s), exploringScore(s), helpersScore(s), savingsScore(s), habitsScore(s, now)];
}
/** The two strongest and the two weakest open areas (ties keep the list's order; with fewer than four open, they never overlap). */
export function standouts(list: readonly Score[]): { strong: ScoreId[]; weak: ScoreId[] } {
  const open = list.filter(x => x.open), down = [...open].sort((a, b) => b.score - a.score), strong = down.slice(0, 2).map(x => x.id);
  const weak = [...open].sort((a, b) => a.score - b.score).filter(x => !strong.includes(x.id)).slice(0, 2).map(x => x.id);
  return { strong, weak };
}

// ---- Next steps
export type StepTarget = { go: string } | { journal: string } | { panel: string } | null;
export interface Step { id: string; gain: number; per: 'once' | 'hour' | 'none'; text: Msg; button?: Msg; target: StepTarget; area: ScoreId }
/** Every step worth taking now. Ranked: the most energy first (a per-hour gain counts as one hour of it), then the ones without an energy figure in a fixed order. */
export function nextSteps(s: M.SaveState, now = Date.now()): Step[] {
  const steps: Step[] = [], farm = M.farmOf(s);
  // Ripe beds
  const ripe = s.plots.filter(p => p.crop && M.cropProgress(p, now) >= 1), ripeValue = ripe.reduce((n, p) => n + M.sellPrice(s, p.crop!), 0);
  if (ripe.length) steps.push({ id: 'harvest', gain: ripeValue, per: 'once', area: 'garden', target: { go: 'plot' }, button: msg('To the garden'), text: msg('{count} beds are ripe: a harvest worth {gain} energy is waiting.', { count: ripe.length, gain: ripeValue }) });
  // Cook before selling
  const raw = rawCookable(s);
  if (raw.count && M.kitchenOpen(s)) steps.push({ id: 'cook', gain: raw.gain, per: 'once', area: 'kitchen', target: { go: 'cook' }, button: msg('To the kitchen'),
    text: raw.lots.length === 1 ? msg('Cooking your {count} {item} before selling earns {gain} energy more.', { count: raw.count, item: ITEMS[raw.lots[0].id].name, gain: raw.gain }, ['item'])
      : msg('Cooking your {count} raw crops and fish before selling earns {gain} energy more ({item} alone: {top}).', { count: raw.count, gain: raw.gain, item: ITEMS[raw.lots[0].id].name, top: raw.lots[0].gain }, ['item']) });
  // Animal products ready to collect
  let ready = 0, readyValue = 0; for (const a of farm.animals) { const n = M.productCount(a, now); if (n > 0) { ready += n; readyValue += n * M.sellPrice(s, M.productFor(a, now)); } }
  if (ready) steps.push({ id: 'collect', gain: readyValue, per: 'once', area: 'animals', target: { go: 'pen' }, button: msg('To the pen'), text: msg('Your animals have {count} products ready, worth {gain} energy.', { count: ready, gain: readyValue }) });
  // Empty beds
  const empty = s.plots.filter(p => !p.crop), crop = bestCrop(s, false);
  if (empty.length && crop) { const gain = Math.round(empty.reduce((n, p) => n + cropPerHour(s, crop, p), 0));
    steps.push({ id: 'plant', gain, per: 'hour', area: 'garden', target: { go: 'plot' }, button: msg('To the garden'), text: msg('Planting {crop} on your {count} empty beds would earn about {gain} energy an hour.', { crop: CROPS[crop].name, count: empty.length, gain }, ['crop']) }); }
  // A better crop on planted beds
  const fieldBest = bestCrop(s, false);
  if (fieldBest) { const lesser = s.plots.filter(p => p.crop && !M.isTreeCrop(p.crop) && cropPerHour(s, p.crop, p) < cropPerHour(s, fieldBest, p) * .75), gain = Math.round(lesser.reduce((n, p) => n + cropPerHour(s, fieldBest, p) - cropPerHour(s, p.crop!, p), 0));
    if (lesser.length && gain > 0) steps.push({ id: 'replant', gain, per: 'hour', area: 'garden', target: { go: 'plot' }, button: msg('To the garden'), text: msg('{crop} is your best crop now: on the {count} beds growing less it would add about {gain} energy an hour.', { crop: CROPS[fieldBest].name, count: lesser.length, gain }, ['crop']) }); }
  // One more bed, a bed upgrade, an animal
  const kit = M.kitPrice(s);
  if (kit !== null && s.energy >= kit && crop && !empty.length) { const gain = Math.round(cropPerHour(s, crop));
    steps.push({ id: 'bed', gain, per: 'hour', area: 'garden', target: { go: 'shop' }, button: msg('To the outfitters'), text: msg('One more garden bed costs {cost} energy and would earn about {gain} an hour with {crop}.', { cost: kit, gain, crop: CROPS[crop].name }, ['crop']) }); }
  const growing = s.plots.filter(p => (p.crop || p.choice) && M.bedLevel(p) < M.BED_MAX_LEVEL && s.energy >= M.bedUpgradeCost(s, M.bedLevel(p))).map(p => ({ p, crop: (p.crop ?? p.choice)!, gain: cropPerHour(s, (p.crop ?? p.choice)!, p) })).filter(b => !M.isTreeCrop(b.crop)).sort((a, b) => b.gain - a.gain)[0];
  if (growing) steps.push({ id: 'bed-upgrade', gain: Math.round(growing.gain), per: 'hour', area: 'garden', target: { go: 'plot' }, button: msg('To the garden'),
    text: msg('Upgrading the bed that grows {crop} costs {cost} energy and doubles its speed: about {gain} energy more an hour.', { crop: CROPS[growing.crop].name, cost: M.bedUpgradeCost(s, M.bedLevel(growing.p)), gain: Math.round(growing.gain) }, ['crop']) });
  if (s.level >= M.PEN_BUILD.level && !farm.built && s.energy >= M.PEN_BUILD.price) steps.push({ id: 'pen', gain: Math.round(animalPerHour(s, 'chicken')), per: 'hour', area: 'animals', target: { go: 'pen' }, button: msg('To the pen'),
    text: msg('You can build the animal pen for {cost} energy. A first chicken then lays eggs worth about {gain} energy an hour.', { cost: M.PEN_BUILD.price, gain: Math.round(animalPerHour(s, 'chicken')) }) });
  const animal = buyableAnimal(s);
  if (animal) steps.push({ id: 'animal', gain: Math.round(animalPerHour(s, animal)), per: 'hour', area: 'animals', target: { go: 'pen' }, button: msg('To the pen'),
    text: msg('A {animal} costs {cost} energy and gives {product} worth about {gain} energy an hour.', { animal: M.ANIMALS[animal].name.toLowerCase(), cost: M.priceOf(s, animal), product: ITEMS[M.ANIMALS[animal].product].name.toLowerCase(), gain: Math.round(animalPerHour(s, animal)) }, ['animal', 'product']) });
  // The daily chest
  const p = s.progression, today = p.daily.key === dayKey(now);
  if (today && !p.daily.chest && p.daily.tasks.length) { const left = p.daily.tasks.filter(t => !t.claimed).length, gain = dailyChestEnergy(s.level);
    steps.push({ id: 'daily', gain, per: 'once', area: 'habits', target: { journal: 'daily' }, button: msg('Open the journal'), text: left ? msg('{left} more daily tasks open today\'s chest: {gain} energy.', { left, gain }) : msg('Today\'s chest is ready to open: {gain} energy.', { gain }) }); }
  // No energy figure: a helper on pause, a crystal upgrade, a new world
  const idle = workers(s).find(w => !w.working);
  if (idle) steps.push({ id: 'helper', gain: 0, per: 'none', area: 'helpers', target: null, text: msg('{name} is on pause. Wake them at their post and the work goes on while you explore.', { name: idle.name }, ['name']) });
  const upgrade = (Object.keys(UPGRADES) as (keyof typeof UPGRADES)[]).filter(kind => !(kind === 'crit' && s.critUp >= UPGRADES.crit.max) && s.energy >= M.upgradeCost(s, kind)).sort((a, b) => M.upgradeCost(s, a) - M.upgradeCost(s, b))[0];
  if (upgrade) steps.push({ id: 'upgrade', gain: 0, per: 'none', area: 'workshop', target: { go: 'upgrade' }, button: msg('To the crystal'), text: msg('You can afford the {name} upgrade: {cost} energy at the wishing crystal.', { name: UPGRADES[upgrade].name, cost: M.upgradeCost(s, upgrade) }, ['name']) });
  const world = landable(s).filter(id => !s.visited.includes(id)).sort((a, b) => PLANETS[a].level - PLANETS[b].level)[0];
  if (world) { const only = productGraph().chapters.find(c => c.id === 'worlds')!.groups.find(g => g.planet === world)?.rows.find(r => r.id === `only:${world}`)?.columns[0][0]?.id;
    steps.push({ id: 'world', gain: 0, per: 'none', area: 'exploring', target: { go: 'travel' }, button: msg('To the rocket'), text: only ? msg('{planet} is open to you now. It is the only place for {item}.', { planet: PLANETS[world].name, item: ITEMS[only].name.toLowerCase() }, ['planet', 'item']) : msg('{planet} is open to you now.', { planet: PLANETS[world].name }, ['planet']) }); }
  const order = ['helper', 'upgrade', 'world'];
  return steps.sort((a, b) => b.gain - a.gain || order.indexOf(a.id) - order.indexOf(b.id));
}

// ---- One item: where from, what for, best use now
const sourceLine = (src: Source): Msg | null => {
  switch (src.kind) {
    case 'grow': return src.seed ? msg('Grown in the garden from {seed}, from level {level}.', { seed: ITEMS[src.seed].name.toLowerCase(), level: src.level }, ['seed']) : msg('Grown in the garden from level {level}. Its seeds are free.', { level: src.level });
    case 'roast': return msg('Roasted at the kitchen from {item}.', { item: ITEMS[src.from].name.toLowerCase() }, ['item']);
    case 'dish': return msg('Cooked at the kitchen from farm products.');
    case 'animal': return src.animal === 'dog' ? msg('The guard dog from the pen (level {level}) comes along as a pet.', { level: M.ANIMALS.dog.level }) : msg('From your {animal} in the pen (level {level}).', { animal: M.ANIMALS[src.animal].name.toLowerCase(), level: M.ANIMALS[src.animal].level }, ['animal']);
    case 'age': return msg('Left by a farm animal after its two hours with you.');
    case 'recipe': return src.station === 'shop' ? msg('Sold at the outfitters ({category}) for {energy} energy.', { category: src.category, energy: src.energy }, ['category']) : src.station === 'craft' ? msg('Made at the workshop ({category}) for {energy} energy.', { category: src.category, energy: src.energy }, ['category']) : msg('Smelted at the ancient furnace on the Volcano Planet.');
    case 'drop': return src.planets.length ? msg('Dropped by {enemy} on {planet} ({chance}% a time).', { enemy: enemyName(src.enemy), planet: PLANETS[src.planets[0]].name, chance: Math.max(1, Math.round(src.chance * 100)) }, ['enemy', 'planet']) : msg('Dropped by {enemy} ({chance}% a time).', { enemy: enemyName(src.enemy), chance: Math.max(1, Math.round(src.chance * 100)) }, ['enemy']);
    case 'fish': return msg('Caught with a rod at {place}.', { place: WATERS[src.waters[0]].name }, ['place']);
    case 'hunt': return msg('Only a harpoon catches it, in the big meadow lake.');
    case 'mine': return msg('Mined from crystal veins on {planet}.', { planet: PLANETS[src.planet].name }, ['planet']);
    case 'vault': return msg("A reward of the Delvers' Vault.");
    case 'lastblow': return msg('It follows the explorer who lands the final blow on the Cinderpeak Colossus.');
  }
};
export interface ItemView { id: string; bag: number; chest: number; known: boolean; sell: number; heal: number; from: Msg[]; lock: Msg | null; best: Msg | null }
/** How to unlock something not yet met: the level, the world or the shop that opens it; null when nothing stands in the way. */
export function lockOf(s: M.SaveState, id: string): Msg | null {
  const sources = productGraph().sources.get(id) ?? [], first = sources[0]; if (!first) return null;
  if (first.kind === 'grow' && s.level < M.cropLevel(s, id)) return msg('Level {level}', { level: M.cropLevel(s, id) });
  if (first.kind === 'roast' && !M.kitchenOpen(s)) return msg('Level {level}', { level: M.kitchenLevel(s) });
  if (first.kind === 'animal' && s.level < M.ANIMALS[first.animal].level) return msg('Level {level}', { level: M.ANIMALS[first.animal].level });
  const drops = sources.filter((x): x is Extract<Source, { kind: 'drop' }> => x.kind === 'drop'), mine = sources.find((x): x is Extract<Source, { kind: 'mine' }> => x.kind === 'mine');
  if (sources.every(x => x.kind === 'drop' || x.kind === 'mine')) { const planets = [...new Set([...drops.flatMap(d => d.planets), ...(mine ? [mine.planet] : [])])];
    if (planets.length && !planets.some(p => s.visited.includes(p))) { const near = planets.sort((a, b) => PLANETS[a].level - PLANETS[b].level)[0]; return s.level < PLANETS[near].level ? msg('{planet}, level {level}', { planet: PLANETS[near].name, level: PLANETS[near].level }, ['planet']) : msg('{planet}', { planet: PLANETS[near].name }, ['planet']); } }
  const gate = M.gearLevel(id); if (gate > s.level) return msg('Level {level}', { level: gate });
  return null;
}
export function itemView(s: M.SaveState, id: string): ItemView | null {
  const item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined; if (!item) return null;
  const g = productGraph(), bag = s.bag[id] ?? 0, chest = s.chest[id] ?? 0, n = bag + chest, sell = M.sellPrice(s, id);
  // Where from: every kind of source once, the two handiest drops (a world already visited, an ordinary creature, the better chance), four lines at most.
  const sources = g.sources.get(id) ?? [], reach = (d: Extract<Source, { kind: 'drop' }>) => Number(d.planets.some(p => s.visited.includes(p))) * 4 + Number(!d.boss) * .3 + d.chance;
  const drops = sources.filter((x): x is Extract<Source, { kind: 'drop' }> => x.kind === 'drop').sort((x, y) => reach(y) - reach(x)).slice(0, 2);
  const from = [...sources.filter(x => x.kind !== 'drop'), ...drops].map(sourceLine).filter((line): line is Msg => !!line).slice(0, 4);
  return { id, bag, chest, known: n > 0 || !!s.collection[id] || Object.values(s.gear).includes(id), sell, heal: item.heal ?? 0, from, lock: n > 0 ? null : lockOf(s, id), best: bestUse(s, id) };
}
/** The one thing most worth doing with this item now, with its numbers; null when there is nothing to say. */
export function bestUse(s: M.SaveState, id: string): Msg | null {
  const item = Object.hasOwn(ITEMS, id) ? ITEMS[id] : undefined; if (!item) return null;
  const g = productGraph(), uses = g.uses.get(id) ?? [], n = held(s, id), sell = M.sellPrice(s, id);
  const plant = uses.find(u => u.kind === 'plant');
  if (plant && plant.kind === 'plant' && n > 0) { const level = M.cropLevel(s, plant.crop); return s.level >= level ? msg('Plant it: one {crop} sells for {sell} energy, {cooked} roasted.', { crop: CROPS[plant.crop].name, sell: M.sellPrice(s, plant.crop), cooked: M.sellPrice(s, `cooked_${plant.crop}`) }, ['crop']) : msg('Keep it: at level {level} it grows {crop}, worth {sell} energy each.', { level, crop: CROPS[plant.crop].name, sell: M.sellPrice(s, plant.crop) }, ['crop']); }
  if (Object.values(s.gear).includes(id)) return msg('You are wearing it. The upgrade bench makes it stronger.');
  if (n < 1) { const lock = lockOf(s, id); if (!lock && Object.hasOwn(CROPS, id) && plantable(s).includes(id)) return msg('Grow it: one sells for {sell} energy, {cooked} roasted.', { sell, cooked: M.sellPrice(s, `cooked_${id}`) }); return lock ? null : sell > 0 ? msg('Not in your bag yet. One sells for {sell} energy.', { sell }) : null; }
  const roast = uses.find(u => u.kind === 'roast');
  if (roast && roast.kind === 'roast' && M.kitchenOpen(s)) { const cooked = M.sellPrice(s, roast.to); return msg('Roast before selling: {raw} becomes {cooked} energy each, {gain} more for your {count}.', { raw: sell, cooked, gain: (cooked - sell) * n, count: n }); }
  const dishes = uses.filter((u): u is Extract<typeof u, { kind: 'dish' }> => u.kind === 'dish').map(u => { const dish = M.FARM_DISHES.find(d => d.id === u.to)!, rawValue = Object.entries(dish.materials).reduce((sum, [m, k]) => sum + M.sellPrice(s, m) * k!, 0), can = Object.entries(dish.materials).every(([m, k]) => held(s, m) >= k!);
    return { to: u.to, extra: M.sellPrice(s, u.to) - rawValue, can }; }).filter(d => d.can && d.extra > 0).sort((a, b) => b.extra - a.extra)[0];
  if (dishes && M.kitchenOpen(s)) return msg('Cook {dish}: it sells for {extra} energy more than its ingredients, and it carries a buff.', { dish: ITEMS[dishes.to].name.toLowerCase(), extra: dishes.extra }, ['dish']);
  const wanted = uses.filter((u): u is Extract<typeof u, { kind: 'recipe' }> => u.kind === 'recipe').filter(u => !M.ownsItem(s, u.to) && M.gearLevel(u.to) <= s.level).sort((a, b) => Math.min(1, n / b.need) - Math.min(1, n / a.need) || a.need - b.need || a.index - b.index)[0];
  if (wanted) return n >= wanted.need ? msg('You have enough for {item}: {need} needed, {have} in store.', { item: ITEMS[wanted.to].name.toLowerCase(), need: wanted.need, have: n }, ['item']) : msg('Keep it for {item}: {have} of {need} gathered.', { item: ITEMS[wanted.to].name.toLowerCase(), have: n, need: wanted.need }, ['item']);
  if (item.slot) return sell > 0 ? msg('Wear it, or sell it for {sell} energy.', { sell }) : msg('Wear it and see how it feels.');
  if (uses.some(u => u.kind === 'feed') && M.farmOf(s).animals.length) return msg('Good animal feed, or {total} energy at the market for your {count}.', { total: sell * n, count: n });
  return sell > 0 ? msg('Nothing needs it right now: your {count} sell for {total} energy.', { count: n, total: sell * n }) : null;
}

// ---- Trend
export interface TrendLine { key: HistoryField | 'level' | 'energy'; label: string; values: number[]; first: number; last: number }
export interface Trend { points: Snapshot[]; lines: TrendLine[]; reading: Msg; enough: boolean }
export const TREND_LABEL: Record<TrendLine['key'], string> = { sell: 'Energy earned at the market', harvest: 'Crops harvested', cook: 'Meals cooked', fish: 'Fish caught', kill: 'Creatures defeated', boss: 'Bosses beaten', craft: 'Things bought or made', mine: 'Veins mined', upgrade: 'Crystal upgrades', beds: 'Garden beds', animals: 'Animals', worlds: 'Worlds visited', level: 'Level', energy: 'Energy saved' };
/** The saved snapshots plus this very moment, and what they say. */
export function trend(s: M.SaveState, now = Date.now()): Trend {
  const points = [...(s.history ?? []), snapshotOf(s, 'day', now)], first = points[0], last = points[points.length - 1], enough = points.length >= 2;
  const line = (key: TrendLine['key']): TrendLine => { const values = points.map(p => key === 'level' ? p.l : key === 'energy' ? p.e : fieldOf(p, key)); return { key, label: TREND_LABEL[key], values, first: values[0], last: values[values.length - 1] }; };
  const moved = (['harvest', 'cook', 'fish', 'kill', 'boss', 'craft', 'mine'] as const).map(line).filter(l => l.last > l.first).sort((a, b) => (b.last - b.first) / Math.max(1, b.last) - (a.last - a.first) / Math.max(1, a.last)).slice(0, 2);
  const lines = [line('sell'), line('energy'), ...moved];
  let reading: Msg;
  if (!enough) reading = msg('I have only just started keeping notes. Come back after your next level or tomorrow, and the first line will be drawn.');
  else { const income = fieldOf(last, 'sell') - fieldOf(first, 'sell'), mid = points[Math.floor((points.length - 1) / 2)];
    const early = fieldOf(mid, 'sell') - fieldOf(first, 'sell'), late = fieldOf(last, 'sell') - fieldOf(mid, 'sell'), spanEarly = Math.max(1, mid.l - first.l), spanLate = Math.max(1, last.l - mid.l);
    if (points.length >= 3 && early > 0 && late / spanLate >= early / spanEarly * 1.5) reading = msg('Your market income per level grew {times} times since level {level}. The village feels it.', { times: Math.round(late / spanLate / (early / spanEarly) * 10) / 10, level: first.l });
    else if (income > 0) reading = msg('Since level {level} you brought {income} energy home from the market.', { level: first.l, income });
    else if (moved.length) reading = msg('Since level {level}: {label} went from {from} to {to}.', { level: first.l, label: moved[0].label, from: moved[0].first, to: moved[0].last }, ['label']);
    else reading = msg('A quiet stretch since level {level}: the market is your next adventure.', { level: first.l }); }
  return { points, lines, reading, enough };
}

// ---- Praise
const hash = (text: string) => { let v = 2166136261; for (const c of text) v = Math.imul(v ^ c.charCodeAt(0), 16777619); return v >>> 0; };
interface PraiseFact { id: string; value: number; share: number; area: ScoreId | null; lines: string[]; params: Record<string, string | number>; names?: string[] }
/** Everything the explorer has really done, each with how far along it is (0-1) and the lines that can say so. */
function praiseFacts(s: M.SaveState): PraiseFact[] {
  const friends = (s.friends ?? []).map(f => FRIENDS[f.id].name), herd = livestock(s).length, planted = s.plots.filter(p => p.crop).length;
  const facts: PraiseFact[] = [
    { id: 'harvest', area: 'garden', value: total(s, 'harvest'), share: tierShare(total(s, 'harvest'), tiers('farm')), params: { n: total(s, 'harvest') }, lines: ['You harvested {n} crops. The village market is full because of you.', '{n} crops came out of your beds. Nobody in the village goes hungry.', 'Your hands picked {n} crops. The family in the cottage eats well.'] },
    { id: 'sell', area: 'savings', value: total(s, 'sell'), share: clamp01(total(s, 'sell') / (dailyChestEnergy(s.level) * 20)), params: { n: total(s, 'sell') }, lines: ['You brought {n} energy home from the market. The cottage is warm because of you.', '{n} energy earned at the stall: the whole village trades with you.'] },
    { id: 'cook', area: 'kitchen', value: total(s, 'cook'), share: tierShare(total(s, 'cook'), tiers('cook')), params: { n: total(s, 'cook') }, lines: ['You cooked {n} meals. The neighbours follow the smell to your door.', '{n} warm meals left your kitchen. The family is proud of its cook.'] },
    { id: 'fish', area: 'fishing', value: total(s, 'fish'), share: tierShare(total(s, 'fish'), tiers('fish')), params: { n: total(s, 'fish') }, lines: ['You caught {n} fish. The pond-side neighbours tell stories about you.', '{n} fish landed: there is fish soup for the whole village.'] },
    { id: 'kill', area: 'exploring', value: total(s, 'kill'), share: tierShare(total(s, 'kill'), tiers('kills')), params: { n: total(s, 'kill') }, lines: ['You drove off {n} creatures. The trails are safe for your helpers.', '{n} creatures sent packing: the animals in the pen sleep soundly.'] },
    { id: 'boss', area: 'exploring', value: total(s, 'boss'), share: tierShare(total(s, 'boss'), tiers('boss')), params: { n: total(s, 'boss') }, lines: ['You beat {n} bosses. The village tells that story by the fire.', '{n} bosses have fallen to you. Every neighbour feels braver.'] },
    { id: 'worlds', area: 'exploring', value: s.visited.length - 1, share: (s.visited.length - 1) / (Object.keys(PLANETS).length - 1), params: { n: s.visited.length }, lines: ['You have walked on {n} worlds and always come home. The village waits for your stories.', '{n} worlds know your footprints now. The children draw your rocket.'] },
    { id: 'animals', area: 'animals', value: herd, share: herd / M.MAX_ANIMALS_TOTAL, params: { n: herd }, lines: ['{n} animals trust you with their days. The pen is the happiest corner of the village.', 'You care for {n} animals. They come running when they hear you.'] },
    { id: 'friends', area: 'helpers', value: friends.length, share: friends.length / FRIEND_IDS.length, params: { n: friends.length, names: friends.join(', ') }, lines: friends.length > 1 ? ['{names}: home in the village because you went to find them.', 'You brought {n} friends home. The cottage is full of voices again.'] : ['{names}: home in the village because you went to find them.'] },
    { id: 'beds', area: 'garden', value: planted, share: planted / M.MAX_PLOTS, params: { n: planted, beds: s.plots.length }, lines: ['{n} of your {beds} beds are growing right now. The garden is alive because of you.', '{n} beds are in leaf today. The bees thank you.'] },
    { id: 'craft', area: 'workshop', value: total(s, 'craft'), share: clamp01(total(s, 'craft') / 20), params: { n: total(s, 'craft') }, lines: ['You made or bought {n} things for the trail. The workshop hums when you walk in.', '{n} pieces of gear chosen with care: you look after yourself, and the village is glad.'] },
  ];
  return facts.filter(f => f.value > 0);
}
const START_LINES = ['Level {level}, {beds} garden beds and a village that is glad you came. Every good story starts like this.', 'You have {beds} beds and a whole valley ahead at level {level}. The family in the cottage believes in you.', '{beds} beds, level {level}, and willing hands: the village could not ask for more.'];
export const PRAISE_LINES: readonly string[] = [...START_LINES, ...(() => { const s = M.newGame(); return praiseFacts({ ...s, progression: { ...s.progression, totals: Object.fromEntries(['harvest', 'sell', 'cook', 'fish', 'kill', 'boss', 'craft'].map(k => [k, 1])) }, visited: ['home', 'candy'], plots: s.plots.map(p => ({ ...p, crop: 'radish' })), friends: [{ id: 'sprout', role: 'garden', rescuedAt: 0, gear: {} }, { id: 'clover', role: 'farm', rescuedAt: 0, gear: {} }], farm: { ...s.farm, animals: [{ uid: 1, kind: 'chicken', bornAt: 0, cycleAt: 0 }] } } as M.SaveState).flatMap(f => f.lines); })()];
/**
 * Praise for a page: the explorer's furthest-along real deed (or the one of `area`, when it has any), said in one of
 * its lines. The line is picked by a hash of the name, the level and the page, so it is stable while nothing changes
 * and varies from page to page. A brand-new explorer is praised for what is true of them: their level and their beds.
 */
export function praise(s: M.SaveState, page: string, area?: ScoreId | null): Msg {
  const facts = praiseFacts(s), seed = hash(`${s.name}|${s.level}|${page}`);
  if (!facts.length) return msg(START_LINES[seed % START_LINES.length], { level: s.level, beds: s.plots.length });
  const pool = area ? facts.filter(f => f.area === area) : [], ranked = (pool.length ? pool : facts).sort((a, b) => b.share - a.share || b.value - a.value);
  // Different pages lead with different deeds when several are close: the page picks among the top three.
  const top = ranked.slice(0, Math.min(3, ranked.length)).filter(f => f.share >= ranked[0].share * .5), fact = pool.length ? ranked[0] : top[seed % top.length];
  return msg(fact.lines[(seed >>> 3) % fact.lines.length], fact.params, fact.names);
}
/** A weak area, said kindly: it is the next adventure, never a failure. */
export const ADVENTURE: Record<ScoreId, string> = {
  garden: 'The garden has room for more green: a lovely next adventure.', animals: 'The pen is your next adventure: animals are waiting to meet you.', kitchen: 'The kitchen is your next adventure: the pot is ready when you are.',
  workshop: 'New gear is your next adventure: the workshop keeps a bench free for you.', fishing: 'The pond is your next adventure: the fish have not met you properly yet.', exploring: 'The stars are your next adventure: a world is waiting for your first step.',
  helpers: 'Friends to rescue are your next adventure: they will love the village.', savings: 'Your saved energy is ready for its next adventure: let it build something.', habits: 'A little visit each day is your next adventure: the journal keeps a gift for it.',
};
export const STRENGTH: Record<ScoreId, string> = {
  garden: 'Your garden is the pride of the village.', animals: 'Your animals could not be in better hands.', kitchen: 'Your kitchen feeds the valley.', workshop: 'You are dressed and armed like a true explorer.', fishing: 'The pond knows your name.',
  exploring: 'You are the explorer the village tells stories about.', helpers: 'Your helpers make a wonderful team.', savings: 'Every bit of your energy is building something.', habits: 'You show up for the village every day.',
};

// ---- Level reports
/** Report levels: the first at 3, then every fifth level. */
export const isReportLevel = (level: number) => Number.isInteger(level) && (level === 3 || level >= 5 && level % 5 === 0);
/** The latest report level at or below `level` (0 = none yet). */
export const reportLevelAt = (level: number) => { for (let l = Math.floor(level); l >= 3; l--) if (isReportLevel(l)) return l; return 0; };
/** The report a level-up from `before` to `after` earns (the highest one crossed), or 0. */
export const reportEarned = (before: number, after: number) => { const l = reportLevelAt(after); return l > before ? l : 0; };
/**
 * Whether to offer a report now. `seen` is the last report level already offered on this device; a report is offered
 * once, only while nothing is going on (no fight, no mode, no open panel: `calm`), and waits otherwise.
 */
export function reportOffer(state: { level: number; seen: number; calm: boolean }): number {
  const due = reportLevelAt(state.level); return due > state.seen && state.calm ? due : 0;
}
export interface Report { level: number; since: number; grew: { key: HistoryField; label: string; from: number; to: number }[]; strong: Score | null; weak: Score | null; tip: Step | null; praise: Msg; village: Msg }
const REPORT_FIELDS: HistoryField[] = ['harvest', 'sell', 'cook', 'fish', 'kill', 'boss', 'craft', 'mine', 'beds', 'animals', 'worlds'];
const VILLAGE: Partial<Record<HistoryField, string>> = {
  harvest: '{n} more crops reached the market stall: the whole village eats from your garden.', sell: 'Your trade brought {n} more energy into the village: lamps are lit along every path.',
  cook: '{n} more meals: the family in the cottage sits down to a warm table.', fish: '{n} more fish: the neighbours by the pond share your catch.', kill: '{n} more creatures driven off: your helpers work without fear.',
  boss: '{n} more bosses beaten: the valley is a safer home for everyone.', craft: '{n} more things made: the workshop is proud of its best customer.', mine: '{n} more veins mined: the workshop shelves are full.',
  beds: '{n} more garden beds: there is more green for everyone.', animals: '{n} more animals: the pen is a livelier place.', worlds: '{n} more worlds visited: the village map has grown.',
};
/** The report card for the latest report level reached: what grew since the report before it, one strength, one next adventure with one tip. */
export function report(s: M.SaveState, now = Date.now()): Report | null {
  const level = reportLevelAt(s.level); if (!level) return null;
  const previous = reportLevelAt(level - 1), history = s.history ?? [], current = snapshotOf(s, 'level', now);
  // The comparison point: the last snapshot taken at or below the previous report level; with none, the oldest one kept.
  const base = [...history].reverse().find(p => p.l <= previous) ?? history[0] ?? null, since = base ? base.l : 0;
  const grew = REPORT_FIELDS.map(key => ({ key, label: TREND_LABEL[key], from: base ? fieldOf(base, key) : 0, to: fieldOf(current, key) })).filter(g => g.to > g.from && (base || g.key !== 'beds' && g.key !== 'worlds')).slice(0, 4); // REPORT_FIELDS is in headline order: the garden and the market first
  const list = scores(s, now), marks = standouts(list), strong = list.find(x => x.id === marks.strong[0]) ?? null, weak = list.find(x => x.id === marks.weak[0]) ?? null;
  const steps = nextSteps(s, now), tip = (weak && steps.find(step => step.area === weak.id)) ?? steps[0] ?? null;
  const lead = grew.find(g => VILLAGE[g.key]), village = lead ? msg(VILLAGE[lead.key]!, { n: lead.to - lead.from }) : msg('The village is glad to have you: level {level} suits you.', { level });
  return { level, since, grew, strong, weak, tip, praise: praise(s, `report-${level}`, strong?.id), village };
}
export const REPORT_VILLAGE_LINES = Object.values(VILLAGE) as string[];
/** The scores as the plain list a snapshot stores (insight-history.ts setHistoryScorer). */
export const scoreList = (s: M.SaveState) => scores(s).map(x => x.score);
export { HISTORY_FIELDS };
