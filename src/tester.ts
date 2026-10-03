import * as M from './model.ts';
import { RECIPES, PLANETS, ITEMS, type PlanetId } from './content.ts';
import { FARM_DISHES } from './farm.ts';
import { MAX_FORGE_LEVEL } from './weapon-forge.ts';
import { sortByPower } from './item-power.ts';
export { MAX_FORGE_LEVEL };
import { FRIENDS, FRIEND_IDS, type FriendId } from './friends-state.ts';
import { t } from './i18n.ts';

/**
 * Tester mode: a code typed in Settings → More lifts energy to 1,000,000 and opens a "Tester" shop (every item without
 * materials or level gates, the three rescue friends, all planets, max level) so performance and items can be tried quickly.
 *
 * Solo only. These rules live here, NOT in actions.ts, so the online server (which replays actions.ts) never knows them:
 * an online account can't be lifted at all, and no server-side secret or rate limit is needed. main.ts refuses the code
 * while connected and says "Tester code works in solo play".
 *
 * The code is compared as a SHA-256 hash so the plain word isn't sitting in the bundle. That is cosmetic only: it is all
 * client-side and anyone can edit their own offline save anyway.
 */
const CODE_SHA256 = 'e65a2e193244854d70be4d2a6dc4b19642390af635e193b37dd84d3371fe10b6';
const CODE_FNV1A = '45598318'; // fallback when crypto.subtle is missing (plain http on a LAN phone)
export const TESTER_ENERGY = 1_000_000;
export const TESTER_LEVEL = Math.max(30, ...Object.values(PLANETS).map(p => p.level));
export const ATTEMPTS_PER_MINUTE = 5;

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export function fnv1a(text: string) { let h = 0x811c9dc5; for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); }
/** The stored hashes of the code; tests pass their own pair, so the plain code never has to appear in the public repo. */
export const CODE_HASHES = { sha256: CODE_SHA256, fnv1a: CODE_FNV1A };
export async function codeMatches(raw: string, subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle, hashes = CODE_HASHES): Promise<boolean> {
  const code = raw.trim().toLowerCase(); if (!code || code.length > 64) return false;
  if (subtle) try { return hex(await subtle.digest('SHA-256', new TextEncoder().encode(code))) === hashes.sha256; } catch { /* fall through */ }
  return fnv1a(code) === hashes.fnv1a;
}

/** At most `limit` tries in any rolling minute; a sliding window kept in memory (a reload resets it, which is fine offline). */
export interface TriesStore { get(): string | null; set(value: string): void }
/** The tries kept in localStorage, so a reload does not reset the limit (storage is optional: blocked = in memory only). */
export const savedTries = (key = 'zoo-garden-tester-tries'): TriesStore => ({
  get() { try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; } },
  set(value) { try { globalThis.localStorage?.setItem(key, value); } catch { /* keep the in-memory window */ } },
});
export function attemptLimiter(limit = ATTEMPTS_PER_MINUTE, windowMs = 60_000, store?: TriesStore) {
  let tries: number[] = [];
  try { const saved = JSON.parse(store?.get() ?? '[]'); if (Array.isArray(saved)) tries = saved.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).slice(-limit); } catch { /* a bad entry starts over */ }
  return (now = Date.now()) => {
    tries = tries.filter(at => at <= now && now - at < windowMs); // a try "in the future" (clock moved back) does not lock the box
    if (tries.length >= limit) return false; tries.push(now); store?.set(JSON.stringify(tries)); return true;
  };
}
/** Leaves tester mode: the Tester shop closes; the energy already given stays. */
export function exitTester(s: M.SaveState) { if (!isTester(s)) return false; delete s.settings.tester; return true; }

export const isTester = (s: M.SaveState) => s.settings.tester === true;
export function unlockTester(s: M.SaveState) { s.settings.tester = true; s.energy = Math.max(s.energy, TESTER_ENERGY); return true; }

/** Kitchen results: every cooked_ food (cook()) and every farm dish (cookDish()). Cooking is free in normal play. */
export const KITCHEN_COOKED = 'Kitchen: cooked food', KITCHEN_DISHES = 'Kitchen: farm dishes';
export const COOKABLE: { id: string; category: string }[] = [
  ...Object.keys(ITEMS).filter(id => id.startsWith('cooked_')).map(id => ({ id, category: KITCHEN_COOKED })),
  ...FARM_DISHES.map(d => ({ id: d.id, category: KITCHEN_DISHES })),
];
/** Every buyable, crafted, furnace-made or cooked item once, at its cheapest energy price (at least 1), ignoring materials and level. */
export const TESTER_ITEMS: { id: string; price: number; category: string }[] = (() => {
  const best = new Map<string, { id: string; price: number; category: string }>();
  for (const r of RECIPES) { if (!Object.hasOwn(ITEMS, r.result)) continue; const price = Math.max(1, r.energy), had = best.get(r.result); if (!had || price < had.price) best.set(r.result, { id: r.result, price, category: r.category }); }
  for (const c of COOKABLE) if (Object.hasOwn(ITEMS, c.id) && !best.has(c.id)) best.set(c.id, { ...c, price: 1 });
  return [...best.values()];
})();
export const FRIEND_PRICE = 500;

// Crafting panels in tester mode (main.ts crafting/cooking/forgeMenu): make any result without ingredients, level,
// station or furnace gates. Workshop/forge recipes still cost their energy; kitchen food stays free as in normal play.
/** Tester workshop/furnace craft: the recipe's energy only. */
export function testerCraft(s: M.SaveState, index: number) {
  const r = isTester(s) ? RECIPES[index] : undefined, n = r?.count || 1;
  if (!r || !Object.hasOwn(ITEMS, r.result) || s.energy < r.energy || !Number.isSafeInteger((s.bag[r.result] || 0) + n)) return false;
  s.energy -= r.energy; M.addItem(s, r.result, n); return true;
}
/** Tester kitchen: any cooked food or farm dish, free, without the raw food or the kitchen level. */
export function testerCook(s: M.SaveState, id: string) {
  if (!isTester(s) || !COOKABLE.some(c => c.id === id) || !Number.isSafeInteger((s.bag[id] || 0) + 1)) return false;
  M.addItem(s, id, 1); return true;
}
const forgeable = (id: string) => Object.hasOwn(ITEMS, id) && ITEMS[id].slot === 'weapon' && !!ITEMS[id].weapon && ITEMS[id].weapon!.kind !== 'rod';
/** Tester forge: an owned weapon straight to +15, no roll, energy or materials. */
export function testerForgeMax(s: M.SaveState, id: string) {
  if (!isTester(s) || !forgeable(id) || !(s.bag[id]! > 0) || (s.forge?.[id] ?? 0) >= MAX_FORGE_LEVEL) return false;
  (s.forge ??= {})[id] = MAX_FORGE_LEVEL; return true;
}
export const TESTER_TAG = '<span class="tester-tag">🧪 Tester</span>';
/** A tester make button for a crafting panel row (empty outside tester mode). */
export function testerMakeButton(s: M.SaveState, action: 'tester-craft' | 'tester-cook' | 'tester-forge', key: string | number, energy = 0) {
  if (!isTester(s)) return '';
  const attr = action === 'tester-craft' ? `data-index="${key}"` : `data-item="${esc(String(key))}"`;
  return `<button class="soft-button tester-make" data-action="${action}" ${attr} ${s.energy < energy ? 'disabled' : ''}>🧪 ${energy ? `ϟ ${energy.toLocaleString()}` : esc(t(action === 'tester-forge' ? 'Max' : 'Make'))}</button>`;
}
/** Tester kitchen section: every cooked food and dish, with or without ingredients. */
export function testerKitchenHtml(s: M.SaveState) {
  if (!isTester(s)) return '';
  return `<div class="section-label">${TESTER_TAG} ${esc(t('Cook anything, no ingredients'))}</div><div class="tester-grid">${COOKABLE.map(c => { const it = ITEMS[c.id], have = s.bag[c.id] || 0;
    return `<div class="tester-card"><span>${it.icon}</span><strong>${esc(t(it.name))}</strong>${have ? `<small>×${have}</small>` : ''}${testerMakeButton(s, 'tester-cook', c.id)}</div>`; }).join('')}</div>`;
}

export function testerBuy(s: M.SaveState, id: string) {
  const item = isTester(s) ? TESTER_ITEMS.find(i => i.id === id) : undefined;
  if (!item || s.energy < item.price || !Number.isSafeInteger((s.bag[id] || 0) + 1)) return false;
  s.energy -= item.price; M.addItem(s, id, 1); return true;
}
/** Counts as a real rescue that already walked home: the friend stands at its post and its cage disappears. */
export function testerFriend(s: M.SaveState, id: FriendId, now = Date.now()) {
  if (!isTester(s) || !FRIEND_IDS.includes(id) || (s.friends ?? []).some(f => f.id === id) || s.energy < FRIEND_PRICE) return false;
  s.energy -= FRIEND_PRICE; (s.friends ??= []).push({ id, role: FRIENDS[id].role, rescuedAt: now, gear: {}, home: true }); return true;
}
export function testerPlanets(s: M.SaveState) { if (!isTester(s)) return false; for (const id of Object.keys(PLANETS) as PlanetId[]) if (!s.discovered.includes(id)) s.discovered.push(id); return true; }
export function testerMaxLevel(s: M.SaveState) { if (!isTester(s) || s.level >= TESTER_LEVEL) return false; s.level = TESTER_LEVEL; s.xp = 0; s.hp = M.maxHp(s); return true; }

function esc(v: string): string { return v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
export function testerShopHtml(s: M.SaveState) {
  const friends = FRIEND_IDS.map(id => {
    const has = (s.friends ?? []).some(f => f.id === id);
    return `<div class="tester-card"><span>🧑‍🌾</span><strong>${esc(t(FRIENDS[id].name))}</strong>${has ? `<small>✓ ${esc(t('Rescued'))}</small>` : `<button class="primary" data-action="tester-friend" data-item="${id}" ${s.energy < FRIEND_PRICE ? 'disabled' : ''}>ϟ ${FRIEND_PRICE}</button>`}</div>`;
  }).join('');
  const groups = new Map<string, string[]>(TESTER_ITEMS.map(i => [i.category, []])); // category order stays; cards inside run weakest to strongest
  for (const i of sortByPower(TESTER_ITEMS, i => i.id, i => i.price)) { const it = ITEMS[i.id], have = s.bag[i.id] || 0;
    (groups.get(i.category) ?? groups.set(i.category, []).get(i.category)!).push(`<div class="tester-card"><span>${it.icon}</span><strong>${esc(t(it.name))}</strong>${have ? `<small>×${have}</small>` : ''}<button class="soft-button" data-action="tester-buy" data-item="${i.id}" ${s.energy < i.price ? 'disabled' : ''}>ϟ ${i.price.toLocaleString()}</button></div>`); }
  const items = [...groups].map(([cat, cards], i) => `<h3 id="tester-cat-${i}">${esc(t(cat))}</h3><div class="tester-grid">${cards.join('')}</div>`).join('');
  return `<p class="intro">${esc(t('Tester mode: every item, crafted, forged and cooked ones too, without materials or level, still paid with energy.'))} ϟ ${s.energy.toLocaleString()}</p>`
    + `<div class="button-row"><button class="soft-button" data-action="tester-planets">${esc(t('Unlock all planets'))}</button><button class="soft-button" data-action="tester-level">${esc(t('Max level'))}</button></div>`
    + `<nav class="tester-jump" aria-label="${esc(t('Categories'))}">${[...groups.keys()].map((cat, i) => `<a href="#tester-cat-${i}">${esc(t(cat))}</a>`).join('')}</nav>`
    + `<h3>${esc(t('Rescue friends'))}</h3><div class="tester-grid">${friends}</div>${items}`;
}
