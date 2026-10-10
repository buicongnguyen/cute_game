import { t } from './i18n.ts';
import { ITEMS, PLANETS, COLLECTIONS, STORY_STEPS, type Inventory } from './content.ts';
import { stowItem, gainXp, xpNeeded, MAX_PLOTS, type SaveState } from './model.ts';
import { ENEMY_TYPES } from './enemy-types.ts';
import { kitchenLevel } from './difficulty.ts';
export { STORY_STEPS } from './content.ts';
export type ProgressKind = 'story' | 'daily' | 'weekly' | 'achievements' | 'pass' | 'bounties' | 'collection' | 'challenges';
export interface ProgressEntry {
    id: string;
    title: string;
    description: string;
    progress: number;
    target: number;
    complete: boolean;
    claimed: boolean;
    rewardLabel: string;
    icon?: string;
}
export interface Reward {
    energy?: number;
    xp?: number;
    items?: Inventory;
    stars?: number;
}
interface Task {
    type: string;
    target: number;
    progress: number;
    claimed: boolean;
    bonus: string;
}
export interface ProgressionState {
    story: {
        index: number;
        progress: number;
        /** The event the progress counts (the step's, or its stand-in's); a change resets the progress. */
        event?: string;
    };
    /** Day/week keys whose lists were rolled and check-in days claimed (latest ROLLED_KEEP): never rolled fresh twice. */
    rolled?: { daily: string[]; weekly: string[]; login: string[] };
    totals: Record<string, number>;
    daily: {
        key: string;
        tasks: Task[];
        chest: boolean;
        rerolled: boolean;
        rerolls?: number;
    };
    weekly: {
        key: string;
        tasks: Task[];
        chest: boolean;
    };
    pass: {
        season: string;
        stars: number;
        claimed: number[];
    };
    achievements: Record<string, number>;
    login: {
        day: string;
        streak: number;
    };
    bounty: {
        key: string;
        type: string;
        target: number;
        progress: number;
        claimed: boolean;
        ends: number;
    } | null;
    /** This half hour's bounties on the planets left meanwhile (key → progress and claimed), so a quick trip neither wipes progress nor pays a bounty twice. Missing on older saves. */
    bountyLog?: Record<string, { progress: number; claimed: boolean }>;
    challenge: {
        type: string;
        target: number;
        progress: number;
        ends: number;
        claimed: boolean;
    } | null;
    streak: number;
    bestStreak: number;
}
type TaskSpec = {
    event: string;
    targets: number[];
    title: string;
    icon: string;
    level?: number;
};
const DAILY: Record<string, TaskSpec> = {
    kill: { event: 'kill', targets: [12, 25, 40], title: 'Defeat creatures', icon: '⚔️' }, boss: { event: 'boss', targets: [1], title: 'Defeat a boss', icon: '👑', level: 4 }, harvest: { event: 'harvest', targets: [6, 10, 16], title: 'Harvest crops', icon: '🌾' }, fish: { event: 'fish', targets: [3, 5, 8], title: 'Catch fish', icon: '🎣' }, rare: { event: 'fishrare', targets: [1], title: 'Catch a rare fish', icon: '🐠', level: 3 }, cook: { event: 'cook', targets: [3, 6, 10], title: 'Cook meals', icon: '🔥', level: 5 }, mine: { event: 'mine', targets: [5, 10], title: 'Mine deposits', icon: '⛏️', level: 14 }, sell: { event: 'sell', targets: [100, 250, 500], title: 'Earn energy from sales', icon: '🧺' }, skill: { event: 'skill', targets: [20, 40], title: 'Use skills', icon: '🌀' }, craft: { event: 'craft', targets: [1, 2], title: 'Craft or buy items', icon: '🔨' }, planet: { event: 'planet', targets: [1], title: 'Visit another planet', icon: '🚀', level: 6 },
};
const WEEKLY: Record<string, TaskSpec> = {
    kill: { ...DAILY.kill, targets: [150, 300, 500] }, boss: { ...DAILY.boss, targets: [4, 8, 12] }, harvest: { ...DAILY.harvest, targets: [60, 120, 200] }, fish: { ...DAILY.fish, targets: [20, 40, 60] }, cook: { ...DAILY.cook, targets: [15, 30] }, mine: { ...DAILY.mine, targets: [30, 60] }, planet: { ...DAILY.planet, targets: [4, 8] }, sell: { ...DAILY.sell, targets: [1500, 4000, 8000] }, bounty: { event: 'bounty', targets: [3, 5], title: 'Complete bounties', icon: '🎯' }, chal: { event: 'chal', targets: [10, 20], title: 'Win quick challenges', icon: '⏱️' },
};
const BONUS = ['potion', 'spore', 'honey', 'worm', 'seed_ice', 'seed_fire', 'claw', 'nectar', 'plot_kit'];
const ENDLESS: [
    string,
    number,
    string,
    string
][] = [['kill', 120, 'Defeat creatures', '⚔️'], ['boss', 4, 'Defeat bosses', '👑'], ['harvest', 60, 'Harvest crops', '🌾'], ['fish', 25, 'Catch fish', '🎣'], ['bounty', 3, 'Complete bounties', '🎯'], ['chal', 8, 'Win quick challenges', '⏱️']];
export const PASS_REWARDS: Reward[] = [{ items: { potion: 3 } }, { energy: 100 }, { items: { worm: 10 } }, { items: { spore: 2 } }, { items: { plot_kit: 1 } }, { energy: 200 }, { items: { seed_fire: 2 } }, { items: { honey: 3 } }, { items: { seed_ice: 2 } }, { items: { pet_parrot: 1 } }, { energy: 300 }, { items: { spore: 3 } }, { items: { starshard: 1 } }, { items: { seed_star: 1 } }, { items: { hat_wizard: 1 } }, { energy: 400 }, { items: { claw: 3 } }, { items: { nectar: 3 } }, { items: { plot_kit: 2 } }, { items: { boots_cloud: 1 } }, { energy: 500 }, { items: { starshard: 2 } }, { items: { seed_star: 2 } }, { items: { spore: 5 } }, { items: { pet_firefly: 1 } }, { energy: 600 }, { items: { moonstone: 1 } }, { items: { thunderstone: 2 } }, { items: { starshard: 3 } }, { items: { dz_superhero: 1 } }];
const ACHIEVEMENTS: [
    string,
    string,
    number[],
    string,
    string
][] = [['kills', 'kill', [50, 200, 1000, 5000], 'Creature hunter', '⚔️'], ['boss', 'boss', [1, 10, 50, 200], 'Boss hunter', '👑'], ['farm', 'harvest', [20, 100, 500, 2000], 'Gardener', '🌾'], ['fish', 'fish', [10, 50, 200, 1000], 'Angler', '🎣'], ['legend', 'legendFish', [1, 3, 10], 'Legendary angler', '🐋'], ['cook', 'cook', [10, 50, 200], 'Volcano chef', '🔥'], ['mine', 'mine', [20, 100, 500], 'Space miner', '⛏️'], ['planets', 'visited', [2, 3, 5, 9], 'Explorer', '🔭'], ['decor', 'decor', [3, 10, 25], 'Decorator', '🏡'], ['quests', 'questsDone', [5, 30, 100, 300], 'Helpful neighbor', '📜'], ['bounty', 'bounty', [1, 10, 50, 150], 'Bounty hunter', '🎯'], ['chal', 'chal', [5, 30, 100, 300], 'Challenge champion', '⏱️'], ['streak', 'bestStreak', [3, 5, 8, 12], 'Winning streak', '🔥'], ['story', 'story', [9, 15, 21, 29], 'Storyteller', '🧭'], ['level', 'level', [5, 10, 20, 30], 'Growing stronger', '⭐']];
const CHALLENGES: Record<string, {
    target: number;
    seconds: number;
}> = { kill: { target: 4, seconds: 75 }, skill: { target: 8, seconds: 45 }, harvest: { target: 4, seconds: 100 }, fish: { target: 2, seconds: 120 }, boss: { target: 1, seconds: 150 } };
export function createProgression(): ProgressionState { return { story: { index: 0, progress: 0 }, totals: {}, daily: { key: '', tasks: [], chest: false, rerolled: false }, weekly: { key: '', tasks: [], chest: false }, pass: { season: '', stars: 0, claimed: [] }, achievements: {}, login: { day: '', streak: 0 }, bounty: null, challenge: null, streak: 0, bestStreak: 0 }; }
const DAY = 86400000;
/** How many rolled day/week keys and check-in days a save remembers (p.rolled). */
const ROLLED_KEEP = 40;
function day(now: number) { return new Date(now).toISOString().slice(0, 10); }
function week(now: number) { const d = new Date(now); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
function hash(text: string) { let value = 2166136261; for (const c of text)
    value = Math.imul(value ^ c.charCodeAt(0), 16777619); return value >>> 0; }
/** The level a task unlocks at: cooking also waits for the kitchen (difficulty.ts: level 14 on Normal and Hard). */
function specLevel(s: SaveState, spec: TaskSpec) { return spec.event === 'cook' ? Math.max(spec.level || 1, kitchenLevel(s)) : spec.level || 1; }
function tasks(s: SaveState, specs: Record<string, TaskSpec>, count: number, seed: number, tier: number, level: number): Task[] { const eligible = Object.keys(specs).filter(k => level >= specLevel(s, specs[k])), result: Task[] = []; for (let i = 0; i < 80 && result.length < count; i++) {
    const type = eligible[(seed + i * 7919) % eligible.length];
    if (result.some(t => t.type === type))
        continue;
    const spec = specs[type];
    result.push({ type, target: spec.targets[Math.min(tier, spec.targets.length - 1)], progress: 0, claimed: false, bonus: BONUS[(seed + i * 31) % BONUS.length] });
} return result; }
export function refreshProgress(s: SaveState, now = Date.now()) {
    const p = s.progression, today = day(now), monday = week(now), season = today.slice(0, 7);
    // ISO date keys sort by time: only a newer day or week replaces the tasks, so winding the clock back and forth
    // cannot re-roll (and re-claim) them. The newest key seen is kept, unless it lies in the future (more than a day
    // ahead for dailies, a week for weeks and the pass): then the clock was wound forward and back, and keeping the
    // future key would freeze the lists until that date. Such a key is re-rolled for today with a fresh chest and fresh
    // claims, but marked spent: today's own claims were overwritten by the jump, so the lists resume on the next real
    // day (or week) and nothing can be claimed twice. Pass stars earned "in the future" are dropped with that season.
    // Every day and week whose lists were rolled, and every check-in day, is remembered (p.rolled, the latest few):
    // toggling the clock between today and a later day used to roll that later day afresh on each visit (review w15).
    const soon = day(now + DAY), nextWeek = day(now + 7 * DAY), futureDay = p.daily.key > soon, futureWeek = p.weekly.key > nextWeek;
    const rolled = p.rolled ??= { daily: [], weekly: [], login: [] }, remember = (list: string[], key: string) => { if (key && !list.includes(key)) { list.push(key); if (list.length > ROLLED_KEEP) list.splice(0, list.length - ROLLED_KEEP); } };
    if (futureDay) p.daily.key = '';
    if (futureWeek) p.weekly.key = '';
    if (p.pass.season > nextWeek.slice(0, 7)) p.pass.season = '';
    if (p.login.day > soon) p.login = { day: today, streak: 1 };
    const spentDay = !(p.daily.key >= today) && (futureDay || rolled.daily.includes(today)), spentWeek = !(p.weekly.key >= monday) && (futureWeek || rolled.weekly.includes(monday));
    if (!(p.daily.key >= today))
        p.daily = { key: today, tasks: tasks(s, DAILY, 3, hash(today + s.name), Math.floor(s.level / 7), s.level), chest: false, rerolled: false };
    if (!(p.weekly.key >= monday))
        p.weekly = { key: monday, tasks: tasks(s, WEEKLY, 4, hash(monday + 'w' + s.name), Math.floor(s.level / 10), s.level), chest: false };
    for (const [list, spent] of [[p.daily, spentDay], [p.weekly, spentWeek]] as const)
        if (spent) { list.chest = true; for (const task of list.tasks) task.claimed = true; }
    if (spentDay) { p.daily.rerolled = true; p.daily.rerolls = 3; }
    remember(rolled.daily, p.daily.key); remember(rolled.weekly, p.weekly.key);
    // While the kitchen is locked (Normal/Hard below level 14, e.g. after raising the difficulty) a cook task cannot be
    // done: it becomes a harvest task (or another the list lacks), like the story's stand-in step.
    if (s.level < kitchenLevel(s)) for (const [list, specs, tier] of [[p.daily, DAILY, Math.floor(s.level / 7)], [p.weekly, WEEKLY, Math.floor(s.level / 10)]] as const)
        for (const task of list.tasks) {
            if (specs[task.type]?.event !== 'cook' || task.claimed) continue;
            const type = ['harvest', ...Object.keys(specs)].find(k => specs[k].event !== 'cook' && s.level >= specLevel(s, specs[k]) && !list.tasks.some(t => t.type === k));
            if (type) Object.assign(task, { type, target: specs[type].targets[Math.min(tier, specs[type].targets.length - 1)], progress: 0 });
        }
    // The story's progress belongs to its step's event: when the step changes event (the cook stand-in comes or goes
    // with the kitchen lock), progress made toward the other event does not count.
    const event = storyStep(p.story.index, s).event ?? '';
    if (p.story.event === undefined) p.story.event = event; else if (p.story.event !== event) { p.story.event = event; p.story.progress = 0; }
    if (!(p.pass.season >= season))
        p.pass = { season, stars: 0, claimed: [] };
    const key = `${s.planet}:${Math.floor(now / 1800000)}`;
    if (p.bounty?.key !== key) {
        // Remember the bounty being left (same half hour only): coming back finds it as it was, claimed or half done.
        const half = key.slice(key.indexOf(':')), log: Record<string, { progress: number; claimed: boolean }> = {};
        for (const [k, v] of Object.entries(p.bountyLog ?? {})) if (k.endsWith(half)) log[k] = v;
        if (p.bounty?.key.endsWith(half)) log[p.bounty.key] = { progress: p.bounty.progress, claimed: p.bounty.claimed };
        const choices = [...new Set(PLANETS[s.planet].spawns.map(([id]) => id))].sort(), seen = log[key];
        p.bounty = choices.length ? { key, type: choices[hash(key + s.name) % choices.length], target: 3 + hash(key) % 3, progress: 0, claimed: false, ends: (Math.floor(now / 1800000) + 1) * 1800000 } : null;
        if (p.bounty && seen) { p.bounty.progress = Math.min(p.bounty.target, seen.progress); p.bounty.claimed = seen.claimed; }
        if (Object.keys(log).length) p.bountyLog = log; else delete p.bountyLog;
    }
    if (p.challenge && !p.challenge.claimed && p.challenge.progress < p.challenge.target && now > p.challenge.ends) {
        p.challenge = null;
        p.streak = 0;
    }
}
/** Stands in for "Cook three meals" while the kitchen is still locked (Normal and Hard open it at level 14, long after chapter 2). */
const NO_KITCHEN_STEP = { title: 'Harvest ten crops', event: 'harvest', target: 10, icon: '🌾' };
/** The story step at index; pass the save so a cooking step becomes a doable one while its kitchen is locked. */
export function storyStep(index: number, s?: SaveState | null) { if (index < STORY_STEPS.length) {
    const step = STORY_STEPS[index];
    return step.event === 'cook' && s && s.level < kitchenLevel(s) ? { ...step, ...NO_KITCHEN_STEP } : step;
} const round = index - STORY_STEPS.length, [event, base, title, icon] = ENDLESS[round % ENDLESS.length]; return { event, target: Math.round(base * (1 + Math.floor(round / ENDLESS.length) * .5)), title, icon, chapter: 4, condition: undefined, end: undefined }; }
function condition(s: SaveState, key: string) { switch (key) {
    case 'level': return s.level;
    case 'visited': return s.visited.length;
    case 'equipped': return Number(!!(s.gear.weapon || s.gear.disguise));
    case 'disguise': return Number(!!s.gear.disguise);
    case 'plots': return Math.max(0, s.plots.length - 9);
    case 'decor': return s.decorations.length;
    case 'story': return s.progression.story.index;
    case 'bestStreak': return s.progression.bestStreak;
    default: return s.progression.totals[key] || 0;
} }
let helperCredit = 0;
/** Runs work done by a helper (garden robot, pet): it still counts for quests, totals and bounties, but not for the timed challenge. */
export function asHelper<T>(work: () => T): T { helperCredit++; try { return work(); } finally { helperCredit--; } }
/** Which surprise challenges make sense right now (reference Og[type].ok): the game reports what is nearby. */
export interface ChallengeChances { kill: boolean; skill: boolean; harvest: boolean; fish: boolean; boss: boolean }
/** The reference's pick: a boss fight always wins, otherwise a random fitting type; null when nothing fits. */
export function pickChallenge(ok: ChallengeChances, rng: () => number = Math.random): string | null {
    if (ok.boss) return 'boss';
    const fits = (['kill', 'skill', 'harvest', 'fish'] as const).filter(k => ok[k]);
    return fits.length ? fits[Math.min(fits.length - 1, Math.floor(rng() * fits.length))] : null;
}
/** Seconds until the next surprise challenge (reference chNext): 70-170 s at first, 100-200 s after a win, 120-220 s after a timeout,
 * 20 s to look again when nothing fitted. */
export function nextChallengeDelay(after: 'start' | 'won' | 'failed' | 'none', rng: () => number = Math.random) { return after === 'none' ? 20 : (after === 'start' ? 70 : after === 'won' ? 100 : 120) + rng() * 100; }
/** Seconds each surprise challenge lasts (reference Og[type].time). */
export function challengeSeconds(type: string) { return Object.hasOwn(CHALLENGES, type) ? CHALLENGES[type].seconds : 0; }
export function recordEvent(s: SaveState, event: string, amount = 1, detail?: string, now = Date.now()) {
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(now) || !Object.hasOwn({ kill: 1, harvest: 1, sell: 1, craft: 1, fish: 1, skill: 1, upgrade: 1, boss: 1, fishrare: 1, legendFish: 1, cook: 1, mine: 1, planet: 1, expand: 1, decorate: 1, bounty: 1, chal: 1 }, event))
        return;
    refreshProgress(s, now);
    const p = s.progression;
    p.totals[event] = (p.totals[event] || 0) + amount;
    const counters: Record<string, keyof SaveState['counters']> = { kill: 'kills', harvest: 'harvests', sell: 'sold', craft: 'bought', fish: 'fish', skill: 'skills', upgrade: 'upgrades' };
    if (counters[event])
        s.counters[counters[event]] += amount;
    for (const [list, specs] of [[p.daily.tasks, DAILY], [p.weekly.tasks, WEEKLY]] as const)
        for (const task of list)
            if (specs[task.type]?.event === event)
                task.progress = Math.min(task.target, task.progress + amount);
    const step = storyStep(p.story.index, s);
    if (step.event === event)
        p.story.progress = Math.min(step.target, p.story.progress + amount);
    if (event === 'kill' && p.bounty && p.bounty.type === detail && !p.bounty.claimed)
        p.bounty.progress = Math.min(p.bounty.target, p.bounty.progress + amount);
    // Timed challenges count the player's own actions only: the garden helper's harvests and the pet's shots do not (asHelper).
    if (p.challenge?.type === event && !p.challenge.claimed && !helperCredit)
        p.challenge.progress = Math.min(p.challenge.target, p.challenge.progress + amount);
}
function rewardLabel(r: Reward) { return [r.energy ? t('{count} energy', { count: r.energy }) : '', r.xp ? `${r.xp} XP` : '', r.stars ? t('{count} stars', { count: r.stars }) : '', ...Object.entries(r.items || {}).map(([id, n]) => `${t(ITEMS[id]?.name || id)} ×${n}`)].filter(Boolean).join(' · '); }
/** At the 24-bed cap a garden bed kit is useless (beds plus kits already held): each surplus kit comes as 2 magic spores. */
export function fitReward(s: SaveState, r: Reward): Reward {
    const kits = r.items?.plot_kit ?? 0; if (!kits) return r;
    const swap = kits - Math.min(kits, Math.max(0, MAX_PLOTS - s.plots.length - (s.bag.plot_kit || 0))); if (!swap) return r;
    const items: Inventory = { ...r.items }; if (kits > swap) items.plot_kit = kits - swap; else delete items.plot_kit;
    items.spore = (items.spore || 0) + swap * 2; return { ...r, items };
}
function give(s: SaveState, raw: Reward, now: number) { const r = fitReward(s, raw); s.energy += r.energy || 0; if (r.xp)
    gainXp(s, r.xp, now); for (const [id, n] of Object.entries(r.items || {}))
    stowItem(s, id, n); /* a full bag sends rewards to the chest (the reference: "đã vào túi đồ / rương") */ refreshProgress(s, now); s.progression.pass.stars += r.stars || 0; }
function storyReward(s: SaveState): Reward { const index = s.progression.story.index, step = storyStep(index, s); return { energy: 30 + s.level * 6 + Math.min(index, 40) * 4, xp: Math.round(xpNeeded(s.level) * (index >= 29 ? .3 : .25)), items: step.end, stars: 15 + (step.end ? 40 : 0) }; }
function taskReward(s: SaveState, t: Task, weekly = false): Reward { if (weekly) {
    const bonus = ['seed_star', 'spore', 'seed_fire', 'seed_ice'][hash(t.type) % 4];
    return { energy: 150 + s.level * 20, xp: Math.round(xpNeeded(s.level) * .35), items: { starshard: 1, [bonus]: 2 }, stars: 30 };
} return { energy: Math.round(20 + s.level * 6 + t.target * (t.type === 'sell' ? .2 : 1.5)), xp: 15 + s.level * 8, items: { [t.bonus]: 1 }, stars: 10 }; }
function dailyChest(s: SaveState, now: number): Reward { const ids = ['seed_star', 'starshard', 'honey', 'fish_golden', 'seed_fire', 'seed_ice']; return { energy: 60 + s.level * 10, xp: 40 + s.level * 12, items: { [ids[hash(day(now) + 'x') % ids.length]]: 1, spore: 2 }, stars: 20 }; }
function weeklyChest(s: SaveState): Reward { return { energy: 400 + s.level * 30, xp: Math.round(xpNeeded(s.level) * .8), items: { seed_star: 2, spore: 4, starshard: 2, moonstone: 1 }, stars: 60 }; }
function loginReward(s: SaveState, now: number): Reward { const streak = s.progression.login.day === day(now - 86400000) ? s.progression.login.streak + 1 : 1; return { energy: 25 + Math.min(streak, 30) * 5 + (streak % 7 === 0 ? 150 : 0), xp: 10 + s.level * 3, items: streak % 7 === 0 ? { seed_star: 1, spore: 2 } : { potion: 1 }, stars: 5 }; }
function bountyReward(s: SaveState): Reward { return { energy: 40 + s.level * 8, xp: Math.round(xpNeeded(s.level) * .15), items: { [BONUS[hash(s.progression.bounty?.key || '') % BONUS.length]]: 1 }, stars: 15 }; }
function achievementReward(tier: number, target: number): Reward { return { energy: 40 * (tier + 1) + Math.min(300, Math.round(target / 10)), xp: 30 * (tier + 1), stars: 10 }; }
/** Player-facing name of a challenge type (the daily task titles), never the internal id. */
export function challengeTitle(type: string): string { return t(DAILY[type]?.title ?? type); }
function entry(id: string, title: string, progress: number, target: number, claimed: boolean, reward: Reward = {}, icon = '📜', description = ''): ProgressEntry { return { id, title: t(title), description: t(description), progress: Math.min(progress, target), target, complete: progress >= target, claimed, rewardLabel: rewardLabel(reward), icon }; }
export function progressEntries(s: SaveState, kind: ProgressKind, now = Date.now()): ProgressEntry[] {
    refreshProgress(s, now);
    const p = s.progression;
    if (kind === 'story') {
        const step = storyStep(p.story.index, s);
        return [entry(`story:${p.story.index}`, step.title, step.condition ? condition(s, step.condition) : p.story.progress, step.target, false, fitReward(s, storyReward(s)), step.icon, t('Chapter {chapter} · Step {step}', { chapter: step.chapter + 1, step: p.story.index + 1 }))];
    }
    if (kind === 'daily' || kind === 'weekly') {
        const weekly = kind === 'weekly', state = weekly ? p.weekly : p.daily, specs = weekly ? WEEKLY : DAILY;
        const result = state.tasks.map((task, i) => entry(`${state.key}:${i}`, specs[task.type].title, task.progress, task.target, task.claimed, fitReward(s, taskReward(s, task, weekly)), specs[task.type].icon));
        result.push(entry(`${state.key}:chest`, weekly ? 'Weekly chest' : 'Daily chest', state.tasks.filter(t => t.claimed).length, state.tasks.length, state.chest, weekly ? weeklyChest(s) : dailyChest(s, now), '🎁'));
        if (!weekly)
            result.unshift(entry(`${day(now)}:login`, 'Daily check-in', 1, 1, p.login.day >= day(now) || !!p.rolled?.login.includes(day(now)), loginReward(s, now), '🗓️', t('{count} consecutive days', { count: p.login.streak })));
        return result;
    }
    if (kind === 'achievements')
        return ACHIEVEMENTS.map(([id, key, targets, title, icon]) => { const tier = p.achievements[id] || 0, target = targets[Math.min(tier, targets.length - 1)], done = tier >= targets.length; return entry(`${id}:${tier}`, `${t(title)} · ${Math.min(tier + 1, targets.length)}/${targets.length}`, condition(s, key), target, done, done ? {} : achievementReward(tier, target), icon); });
    if (kind === 'pass')
        return PASS_REWARDS.map((reward, i) => entry(`${p.pass.season}:${i}`, t('Star pass · Tier {tier}', { tier: i + 1 }), p.pass.stars, (i + 1) * 50, p.pass.claimed.includes(i), fitReward(s, reward), '⭐', t('Season {season}', { season: p.pass.season })));
    if (kind === 'bounties') {
        const b = p.bounty;
        return b ? [entry(b.key, t('Wanted: {name}', { name: t(ENEMY_TYPES[b.type]?.name ?? b.type) }), b.progress, b.target, b.claimed, bountyReward(s), '🎯', t('{count} minutes remaining', { count: Math.max(0, Math.ceil((b.ends - now) / 60000)) }))] : [];
    }
    if (kind === 'collection')
        return Object.entries(COLLECTIONS).map(([id, group]) => { const found = group.items.filter(item => s.collection[item]).length; return entry(id, group.name, found, group.items.length, true, {}, group.emoji, group.items.map(item => `${s.collection[item] ? '✓' : '?'} ${t(ITEMS[item].name)}`).join(' · ')); });
    const c = p.challenge;
    if (!c)
        return [];
    const mult = 1 + Math.min(p.streak, 8) * .25;
    return [entry(`challenge:${c.ends}`, t('Quick challenge: {name}', { name: challengeTitle(c.type) }), c.progress, c.target, c.claimed, { energy: Math.round((15 + s.level * 4) * mult), xp: Math.round(xpNeeded(s.level) * .07 * mult), stars: 6 }, '⏱️', t('{count} seconds remaining', { count: Math.ceil((c.ends - now) / 1000) }))];
}
export function claimProgress(s: SaveState, kind: ProgressKind, id: string, now = Date.now()): boolean {
    const available = progressEntries(s, kind, now).find(e => e.id === id);
    if (!available?.complete || available.claimed || kind === 'collection')
        return false;
    const p = s.progression;
    let reward: Reward = {};
    if (kind === 'story') {
        reward = storyReward(s);
        p.story = { index: p.story.index + 1, progress: 0 };
        s.quest = p.story.index;
        p.totals.questsDone = (p.totals.questsDone || 0) + 1;
    }
    else if (kind === 'daily' || kind === 'weekly') {
        const weekly = kind === 'weekly', state = weekly ? p.weekly : p.daily, tail = id.split(':').at(-1)!;
        if (tail === 'login') {
            reward = loginReward(s, now);
            p.login = { day: day(now), streak: p.login.day === day(now - 86400000) ? p.login.streak + 1 : 1 };
            const days = (p.rolled ??= { daily: [], weekly: [], login: [] }).login; days.push(day(now)); if (days.length > ROLLED_KEEP) days.splice(0, days.length - ROLLED_KEEP);
        }
        else if (tail === 'chest') {
            state.chest = true;
            reward = weekly ? weeklyChest(s) : dailyChest(s, now);
        }
        else {
            const task = state.tasks[Number(tail)];
            task.claimed = true;
            reward = taskReward(s, task, weekly);
            p.totals.questsDone = (p.totals.questsDone || 0) + 1;
        }
    }
    else if (kind === 'pass') {
        const index = Number(id.split(':').at(-1));
        p.pass.claimed.push(index);
        reward = PASS_REWARDS[index];
    }
    else if (kind === 'achievements') {
        const [key, tierText] = id.split(':'), tier = Number(tierText), spec = ACHIEVEMENTS.find(a => a[0] === key)!;
        p.achievements[key] = tier + 1;
        reward = achievementReward(tier, spec[2][tier]);
    }
    else if (kind === 'bounties') {
        p.bounty!.claimed = true;
        reward = bountyReward(s);
        recordEvent(s, 'bounty', 1, undefined, now);
    }
    else if (kind === 'challenges') {
        p.challenge!.claimed = true;
        const mult = 1 + Math.min(p.streak, 8) * .25;
        reward = { energy: Math.round((15 + s.level * 4) * mult), xp: Math.round(xpNeeded(s.level) * .07 * mult), stars: 6, items: p.streak % 3 === 2 ? { [BONUS[hash(id) % BONUS.length]]: 1 } : undefined };
        p.streak++;
        p.bestStreak = Math.max(p.bestStreak, p.streak);
        recordEvent(s, 'chal', 1, undefined, now);
    }
    give(s, reward, now);
    return true;
}
export const dailyRerollsUsed = (d: ProgressionState['daily']) => d.rerolls ?? (d.rerolled ? 1 : 0);
export function rerollDaily(s: SaveState, index: number, now = Date.now()): boolean { refreshProgress(s, now); const d = s.progression.daily, old = d.tasks[index]; if (dailyRerollsUsed(d) >= 3 || !old || old.claimed)
    return false; const choices = Object.keys(DAILY).filter(k => s.level >= specLevel(s, DAILY[k]) && !d.tasks.some(t => t.type === k)); if (!choices.length)
    return false; const type = choices[hash(d.key + s.name) % choices.length], spec = DAILY[type]; d.tasks[index] = { type, target: spec.targets[Math.min(Math.floor(s.level / 7), spec.targets.length - 1)], progress: 0, claimed: false, bonus: old.bonus }; d.rerolls = dailyRerollsUsed(d) + 1; d.rerolled = d.rerolls >= 3; return true; }
export function startChallenge(s: SaveState, type = 'kill', now = Date.now()): boolean { refreshProgress(s, now); const spec = Object.hasOwn(CHALLENGES, type) ? CHALLENGES[type] : undefined; if (!spec || s.level < 2 || s.progression.challenge && !s.progression.challenge.claimed)
    return false; s.progression.challenge = { type, target: spec.target + (type === 'kill' ? Math.floor(s.level / 8) : 0), progress: 0, ends: now + spec.seconds * 1000, claimed: false }; return true; }
export function normalizeProgression(raw: unknown, s: SaveState): ProgressionState {
    const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
    const number = (v: unknown, max = 1e12) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0;
    const text = (v: unknown) => typeof v === 'string' ? v.slice(0, 100) : '';
    /** Day and week keys are ISO dates; anything else (a hand-edited "9999" sorts after every date) starts over. */
    const dateKey = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
    const p = createProgression();
    if (!record(raw)) {
        p.story.index = s.quest;
        const old: Record<string, number> = { kill: s.counters.kills, harvest: s.counters.harvests, sell: s.counters.sold, craft: s.counters.bought, fish: s.counters.fish, skill: s.counters.skills, upgrade: s.counters.upgrades };
        p.totals = old;
        const step = storyStep(s.quest, s);
        p.story.progress = Math.min(step.target, old[step.event || ''] || 0);
        return p;
    }
    if (record(raw.story))
        p.story = { index: number(raw.story.index, 1e6), progress: number(raw.story.progress), ...(typeof raw.story.event === 'string' && /^[a-zA-Z]{0,20}$/.test(raw.story.event) ? { event: raw.story.event } : {}) };
    if (record(raw.rolled)) { const keys = (v: unknown) => Array.isArray(v) ? [...new Set(v.map(dateKey).filter(Boolean))].slice(-ROLLED_KEEP) : []; p.rolled = { daily: keys(raw.rolled.daily), weekly: keys(raw.rolled.weekly), login: keys(raw.rolled.login) }; }
    if (record(raw.totals))
        for (const [k, v] of Object.entries(raw.totals))
            if (/^[a-zA-Z]{1,30}$/.test(k) && !['constructor', 'prototype', '__proto__'].includes(k))
                p.totals[k] = number(v);
    for (const [key, specs] of [['daily', DAILY], ['weekly', WEEKLY]] as const) {
        const r = raw[key];
        if (!record(r))
            continue;
        const list: Array<Task> = [];
        if (Array.isArray(r.tasks))
            for (const t of r.tasks.slice(0, key === 'daily' ? 3 : 4))
                if (record(t) && typeof t.type === 'string' && Object.hasOwn(specs, t.type) && specs[t.type].targets.includes(t.target))
                    list.push({ type: t.type, target: t.target, progress: Math.min(number(t.progress), t.target), claimed: t.claimed === true, bonus: typeof t.bonus === 'string' && BONUS.includes(t.bonus) ? t.bonus : 'potion' });
        Object.assign(p[key], { key: dateKey(r.key), tasks: list, chest: r.chest === true });
        if (list.length !== (key === 'daily' ? 3 : 4) || new Set(list.map(t => t.type)).size !== list.length)
            p[key].key = '';
        if (key === 'daily')
            p.daily.rerolled = r.rerolled === true;
        if (key === 'daily' && r.rerolls !== undefined) p.daily.rerolls = typeof r.rerolls === 'number' && Number.isFinite(r.rerolls) ? Math.max(0, Math.min(3, Math.floor(r.rerolls))) : r.rerolled === true ? 1 : 0;
    }
    if (record(raw.pass))
        p.pass = { season: typeof raw.pass.season === 'string' && /^\d{4}-\d{2}$/.test(raw.pass.season) ? raw.pass.season : '', stars: number(raw.pass.stars), claimed: Array.isArray(raw.pass.claimed) ? [...new Set<number>(raw.pass.claimed.filter((x: any) => Number.isInteger(x) && x >= 0 && x < PASS_REWARDS.length))] : [] };
    if (record(raw.achievements))
        for (const [id, , tiers] of ACHIEVEMENTS)
            if (Object.hasOwn(raw.achievements, id))
                p.achievements[id] = number(raw.achievements[id], tiers.length);
    if (record(raw.login))
        p.login = { day: dateKey(raw.login.day), streak: number(raw.login.streak) };
    const b = raw.bounty;
    if (record(b) && typeof b.type === 'string' && Object.values(PLANETS).some(p => p.spawns.some(([type]) => type === b.type)))
        p.bounty = { key: text(b.key), type: b.type, target: Math.max(3, Math.min(5, number(b.target))), progress: Math.min(number(b.progress), number(b.target)), claimed: b.claimed === true, ends: number(b.ends, Number.MAX_SAFE_INTEGER) };
    if (record(raw.bountyLog)) {
        const log: Record<string, { progress: number; claimed: boolean }> = {};
        for (const [k, v] of Object.entries(raw.bountyLog).slice(0, 12)) if (/^[a-z]+:\d+$/.test(k) && record(v)) log[k] = { progress: number(v.progress, 5), claimed: v.claimed === true };
        if (Object.keys(log).length) p.bountyLog = log;
    }
    const c = raw.challenge;
    if (record(c) && typeof c.type === 'string' && Object.hasOwn(CHALLENGES, c.type))
        p.challenge = { type: c.type, target: Math.max(1, number(c.target, 1e6)), progress: number(c.progress), ends: number(c.ends, Number.MAX_SAFE_INTEGER), claimed: c.claimed === true };
    p.streak = number(raw.streak);
    p.bestStreak = Math.max(p.streak, number(raw.bestStreak));
    return p;
}
