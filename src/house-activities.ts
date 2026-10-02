/**
 * Things to do inside the cottage: one or more per room, each tied to a game system (health, buffs, XP, cooking,
 * crafting, the star map, quests, the collection). Pure rules and data, no Three.js or DOM, shared by the view,
 * the UI, actions.ts (the 'houseUse' intent, so online play runs the same rules) and the tests.
 *
 * Rest-style activities (sofa, bed, bath, tea, sink, fire) grant a short buff and then cool down, so they are a
 * pleasant stop between trips rather than something to farm. "open" activities reuse an existing panel; "fun"
 * ones (the duck, the radio) only make the room feel alive.
 */
import * as Game from './model.ts';
import { FISH, ITEMS, PLANETS, type BuffDef } from './content.ts';
import { FRIENDS, FRIEND_IDS } from './friends-state.ts';
import type { Point, RoomId } from './house.ts';

export type ActivityId = 'sofa' | 'fire' | 'trophies' | 'radio' | 'stove' | 'tea' | 'workbench' | 'easel' | 'bed' | 'wardrobe' | 'mirror' | 'bath' | 'duck' | 'sink' | 'globe' | 'books' | 'diary';
/** buff: a rule in this file; open: an existing panel (main.ts routes kind 'cook'/'craft'/'travel'); fun: sound and sparkle only. */
export type ActivityKind = 'buff' | 'open' | 'fun' | 'paint';
export interface Activity {
  id: ActivityId; room: RoomId; icon: string;
  /** The prompt's verb ("Sit with friends") and the thing's name. */
  verb: string; name: string;
  /** Where the tap circle sits and where the effect plays. */
  at: Point; y: number; kind: ActivityKind;
  /** Entity kind the tap routes to: house-* for this module, or a main.ts kind for panels it already has. */
  entity: string;
  cooldownMin?: number; buff?: BuffDef; heal?: 'full' | number; xp?: number;
  /** What the buff does, for the toast. */
  note?: string;
}

export const ACTIVITIES: Activity[] = [
  // Living room: rest with your friends, warm up by the fire, admire your trophies, play the radio.
  { id: 'sofa', room: 'living', icon: '🛋️', verb: 'Sit with friends', name: 'Sofa', at: { x: -1.9, z: -.85 }, y: .6, kind: 'buff', entity: 'house-use', cooldownMin: 3, heal: 'full', buff: { regen: 3, time: 90 }, note: 'Rested: health restored, +{n} regeneration' },
  { id: 'fire', room: 'living', icon: '🔥', verb: 'Warm up', name: 'Fireplace', at: { x: -4.1, z: 1.7 }, y: .6, kind: 'buff', entity: 'house-use', cooldownMin: 4, buff: { def: .15, time: 150 }, note: 'Toasty: +15% defence' },
  { id: 'trophies', room: 'living', icon: '🏆', verb: 'Trophy wall', name: 'Trophies', at: { x: 2.25, z: -1.5 }, y: .9, kind: 'open', entity: 'house-use' },
  { id: 'radio', room: 'living', icon: '📻', verb: 'Play music', name: 'Radio', at: { x: 3.0, z: .85 }, y: 1.2, kind: 'fun', entity: 'house-use' },
  // Kitchen: the same cooking as the outdoor kitchen (and its level gate), and a cup of tea.
  { id: 'stove', room: 'kitchen', icon: '🍳', verb: 'Cook', name: 'Stove', at: { x: -9.0, z: 2.4 }, y: .9, kind: 'open', entity: 'cook' },
  { id: 'tea', room: 'kitchen', icon: '🫖', verb: 'Brew tea', name: 'Kettle', at: { x: -9.0, z: .1 }, y: 1.1, kind: 'buff', entity: 'house-use', cooldownMin: 5, buff: { haste: .15, time: 150 }, note: 'Tea time: +15% attack speed' },
  // Craft room: the workbench is the workshop; the easel paints a picture for the wall.
  { id: 'workbench', room: 'craft', icon: '🔨', verb: 'Craft', name: 'Workbench', at: { x: 9.0, z: .3 }, y: .9, kind: 'open', entity: 'craft' },
  { id: 'easel', room: 'craft', icon: '🎨', verb: 'Paint', name: 'Easel', at: { x: 7.0, z: -.45 }, y: 1.1, kind: 'paint', entity: 'house-use', cooldownMin: 8, xp: 12 },
  // Bedroom: sleep (full health and a well-rested XP buff), the wardrobe and mirror.
  { id: 'bed', room: 'bedroom', icon: '🛏️', verb: 'Sleep', name: 'Bed', at: { x: -7.0, z: -4.7 }, y: .6, kind: 'buff', entity: 'house-use', cooldownMin: 15, heal: 'full', buff: { xp: .25, time: 300 }, note: 'Well rested: +25% experience' },
  { id: 'wardrobe', room: 'bedroom', icon: '👗', verb: 'Wardrobe', name: 'Wardrobe', at: { x: -9.62, z: -3.6 }, y: 1.4, kind: 'open', entity: 'house-wardrobe' },
  { id: 'mirror', room: 'bedroom', icon: '🪞', verb: 'Mirror', name: 'Mirror', at: { x: -2.35, z: -4.9 }, y: 1.2, kind: 'open', entity: 'house-mirror' },
  // Bathroom: a bubble bath, the duck, the sink.
  { id: 'bath', room: 'bath', icon: '🛁', verb: 'Take a bath', name: 'Bathtub', at: { x: -.75, z: -5.8 }, y: .6, kind: 'buff', entity: 'house-use', cooldownMin: 5, buff: { speed: .2, time: 150 }, note: 'Fresh: +20% movement speed' },
  { id: 'duck', room: 'bath', icon: '🦆', verb: 'Squeak', name: 'Duck', at: { x: .15, z: -5.85 }, y: .6, kind: 'fun', entity: 'house-use' },
  { id: 'sink', room: 'bath', icon: '🫧', verb: 'Wash up', name: 'Sink', at: { x: 2.35, z: -6.1 }, y: .9, kind: 'buff', entity: 'house-use', cooldownMin: 3, buff: { luck: .1, time: 150 }, note: 'Sparkling clean: +10% luck' },
  // Study: the globe is the star map, the bookshelf the collection log, the diary today's tasks.
  { id: 'globe', room: 'study', icon: '🌍', verb: 'Star map', name: 'Globe', at: { x: 3.8, z: -5.9 }, y: 1.0, kind: 'open', entity: 'travel' },
  { id: 'books', room: 'study', icon: '📚', verb: 'Collection log', name: 'Bookshelf', at: { x: 9.2, z: -4.4 }, y: 1.2, kind: 'open', entity: 'house-use' },
  { id: 'diary', room: 'study', icon: '📔', verb: 'Diary', name: 'Diary', at: { x: 6.5, z: -6.0 }, y: 1.0, kind: 'open', entity: 'house-use' },
];
export const activity = (id: string) => ACTIVITIES.find(a => a.id === id);

export interface HouseState { used?: Partial<Record<ActivityId, number>>; paintings?: number }
type WithHouse = Game.SaveState & { house?: HouseState };
/** The house's saved part; older saves have none. */
export function houseOf(s: Game.SaveState): HouseState { return (s as WithHouse).house ?? {}; }
export const MAX_PAINTINGS = 4;
/** Milliseconds until `id` can be used again (0 = ready). */
export function cooldownLeft(s: Game.SaveState, id: ActivityId, now = Date.now()) {
  const a = activity(id), at = houseOf(s).used?.[id];
  return a?.cooldownMin && at !== undefined ? Math.max(0, at + a.cooldownMin * 60000 - now) : 0;
}
/** Friends at home, who make the sofa nicer. */
const homeFriends = (s: Game.SaveState) => (s.friends ?? []).filter(f => f.home).length;

export interface UseResult { id: ActivityId; healed: number; buff?: BuffDef; xp: number; paintings?: number }
/**
 * Uses a rest-style activity: checks the cooldown, heals, adds the buff, records the time. Returns null when it is
 * not available (cooling down, away from home, or not a rule here). The sofa's regeneration grows with friends at home.
 */
export function useActivity(s: Game.SaveState, id: string, now = Date.now()): UseResult | null {
  const a = activity(id);
  if (!a || (a.kind !== 'buff' && a.kind !== 'paint') || s.planet !== 'home' || cooldownLeft(s, a.id, now) > 0) return null;
  const before = s.hp; let buff = a.buff;
  if (a.id === 'sofa' && buff) buff = { ...buff, regen: (buff.regen ?? 0) + Math.min(3, homeFriends(s)) };
  if (a.heal === 'full') s.hp = Game.maxHp(s); else if (a.heal) s.hp = Math.min(Game.maxHp(s), s.hp + a.heal);
  if (buff) Game.addBuff(s, buff, 'house_' + a.id, now);
  const house = ((s as WithHouse).house ??= {}); (house.used ??= {})[a.id] = now;
  let xp = 0;
  if (a.xp) { const lv = s.level, before = s.xp; Game.gainXp(s, a.xp, now); xp = s.level === lv ? s.xp - before : a.xp; }
  if (a.kind === 'paint') house.paintings = Math.min(99, (house.paintings ?? 0) + 1);
  return { id: a.id, healed: Math.max(0, s.hp - before), buff, xp, paintings: house.paintings };
}
/** Sanitises a loaded save's house part (model.ts parse). */
export function parseHouse(raw: unknown): HouseState | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>, out: HouseState = {};
  if (v.used && typeof v.used === 'object') for (const a of ACTIVITIES) { const t = (v.used as Record<string, unknown>)[a.id]; if (typeof t === 'number' && Number.isFinite(t) && t >= 0) (out.used ??= {})[a.id] = t; }
  if (typeof v.paintings === 'number' && Number.isSafeInteger(v.paintings) && v.paintings >= 0) out.paintings = Math.min(99, v.paintings);
  return out.used || out.paintings ? out : undefined;
}

/** The trophy shelf: one cup per boss beaten (newest last), at most this many shown. */
export const TROPHY_SLOTS = 6;
export function trophies(s: Game.SaveState) { return (s.bosses ?? []).slice(-TROPHY_SLOTS); }
/** Photos of rescued friends on the living-room wall. */
export function photos(s: Game.SaveState) { return (s.friends ?? []).map(f => f.id); }

export interface LogRow { id: string; label: string; icon: string; have: number; total: number; pct: number }
const bossTotal = () => new Set(Object.entries(PLANETS).flatMap(([id, p]) => p.bosses.map(b => `${id}:${b}`))).size;
/** The study's collection log: what you have found of each kind, as counts and a percentage. */
export function collectionLog(s: Game.SaveState): { rows: LogRow[]; pct: number } {
  const fish = Object.keys(FISH), items = Object.keys(ITEMS);
  const row = (id: string, label: string, icon: string, have: number, total: number): LogRow => ({ id, label, icon, have: Math.min(have, total), total, pct: total ? Math.round(Math.min(have, total) / total * 100) : 0 });
  const rows = [
    row('fish', 'Fish caught', '🐟', fish.filter(f => (s.fishRecords[f] ?? 0) > 0 || s.collection[f]).length, fish.length),
    row('items', 'Items discovered', '🎒', items.filter(i => s.collection[i]).length, items.length),
    row('worlds', 'Worlds discovered', '🪐', s.discovered.length, Object.keys(PLANETS).length),
    row('bosses', 'Bosses beaten', '👑', (s.bosses ?? []).length, bossTotal()),
    row('friends', 'Friends rescued', '🤝', (s.friends ?? []).length, FRIEND_IDS.length),
  ];
  return { rows, pct: Math.round(rows.reduce((n, r) => n + r.pct, 0) / rows.length) };
}
export const friendLabel = (id: string) => (FRIENDS as Record<string, { name: string }>)[id]?.name ?? id;

/**
 * Where each friend at home spends the next while: the cook in the kitchen at meal times, the gardener reading in
 * the study, everyone on the sofa in the evening. Changes every SCHEDULE_SECONDS of the world clock, so the house
 * shifts a little each visit without anyone wandering about every frame.
 */
export const SCHEDULE_SECONDS = 40;
export interface Hangout extends Point { facing: number; pose: 'sit' | 'stand' | 'wave'; y?: number; room: RoomId; say: string[] }
export const HANGOUTS: Hangout[] = [
  { x: -2.4, z: -1.32, facing: 0, pose: 'sit', y: .5, room: 'living', say: ['This sofa is the best.', 'Welcome home!', 'Sit with us a while.'] },
  { x: -1.4, z: -1.32, facing: 0, pose: 'sit', y: .5, room: 'living', say: ['I could nap right here.', 'Tell me about your trip!'] },
  { x: -3.55, z: 2.85, facing: .5, pose: 'stand', room: 'living', say: ['The fire is so cosy.', 'Warm your paws!'] },
  { x: 2.0, z: 3.9, facing: 0, pose: 'wave', room: 'living', say: ['Hello again!', 'You look strong today!'] },
  { x: -8.2, z: 2.4, facing: -Math.PI / 2, pose: 'stand', room: 'kitchen', say: ['Something smells tasty!', 'Bring me more veggies!', 'Soup is nearly ready.'] },
  { x: 7.8, z: 2.2, facing: Math.PI / 2, pose: 'stand', room: 'craft', say: ['Look at my painting!', 'So many colours…'] },
  { x: 6.0, z: -3.6, facing: 0, pose: 'stand', room: 'study', say: ['This book is about fish!', 'So many worlds to visit.'] },
];
/** The hangout index for friend number `index` (role first) at world time `time`. */
export function hangoutFor(index: number, role: string, time: number): number {
  const phase = Math.floor(time / SCHEDULE_SECONDS);
  if (role === 'cook' && phase % 2 === 0) return 4;
  if (role === 'garden' && phase % 3 === 1) return 6;
  if (role === 'farm' && phase % 3 === 2) return 5;
  return (index + phase) % 4;
}
/** Hangouts for the friends at home, one each (a taken spot passes to the next free one); writes into `out`. */
export function assignHangouts(roles: readonly string[], time: number, out: number[] = []): number[] {
  out.length = 0;
  for (let i = 0; i < roles.length; i++) { let h = hangoutFor(i, roles[i], time); while (out.includes(h)) h = (h + 1) % HANGOUTS.length; out.push(h); }
  return out;
}

/** A piece placed from the save (trophies, friends' photos, paintings); `tint` recolours its canvas. */
export interface DecorPlacement { kit: string; x: number; z: number; y?: number; rot?: number; scale?: number; tint?: string }
const PAINT = ['#ffb3c7', '#9fd8ff', '#ffe08a', '#b9f0a8', '#d6c2ff', '#ffc59e'];
const FRIEND_TINT: Record<string, string> = { sprout: '#c8f5a8', clover: '#ffe2a8', pepper: '#ffc2c2' };
/** What the save hangs on the walls: a cup per boss beaten, a photo per rescued friend, the latest paintings. */
export function decorPlacements(s: Game.SaveState): DecorPlacement[] {
  const out: DecorPlacement[] = [];
  // Cups stand on the shelf along the living room's low back wall; photos hang above your bed; paintings lean on the craft room's low wall.
  trophies(s).forEach((_, i) => out.push({ kit: 'trophy', x: 1.65 + i * .24, z: -1.86, y: .69 }));
  photos(s).forEach((id, i) => out.push({ kit: 'photo', x: -7.55 + i * .55, z: -6.88, y: i % 2 ? .12 : 0, tint: FRIEND_TINT[id] ?? '#fff1d2' }));
  const n = Math.min(MAX_PAINTINGS, houseOf(s).paintings ?? 0), first = (houseOf(s).paintings ?? 0) - n;
  for (let i = 0; i < n; i++) out.push({ kit: 'painting', x: [6.35, 8.0, 8.7, 9.4][i], z: -1.83, y: -.77, rot: (i % 2 ? -.06 : .06), tint: PAINT[(first + i) % PAINT.length] });
  return out;
}
/** Changes only when what hangs on the walls changes (the view rebuilds its batch then, not every frame). */
export const decorSignature = (s: Game.SaveState) => `${trophies(s).length}|${photos(s).join(',')}|${houseOf(s).paintings ?? 0}`;
