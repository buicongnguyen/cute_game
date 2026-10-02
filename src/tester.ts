import * as M from './model.ts';
import { RECIPES, PLANETS, ITEMS, type PlanetId } from './content.ts';
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
export async function codeMatches(raw: string, subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle): Promise<boolean> {
  const code = raw.trim().toLowerCase(); if (!code || code.length > 64) return false;
  if (subtle) try { return hex(await subtle.digest('SHA-256', new TextEncoder().encode(code))) === CODE_SHA256; } catch { /* fall through */ }
  return fnv1a(code) === CODE_FNV1A;
}

/** At most `limit` tries in any rolling minute; a sliding window kept in memory (a reload resets it, which is fine offline). */
export function attemptLimiter(limit = ATTEMPTS_PER_MINUTE, windowMs = 60_000) {
  const tries: number[] = [];
  return (now = Date.now()) => { while (tries.length && now - tries[0] >= windowMs) tries.shift(); if (tries.length >= limit) return false; tries.push(now); return true; };
}

export const isTester = (s: M.SaveState) => s.settings.tester === true;
export function unlockTester(s: M.SaveState) { s.settings.tester = true; s.energy = Math.max(s.energy, TESTER_ENERGY); return true; }

/** Every buyable or craftable item once, at its cheapest energy price (at least 1), ignoring materials and level. */
export const TESTER_ITEMS: { id: string; price: number; category: string }[] = (() => {
  const best = new Map<string, { id: string; price: number; category: string }>();
  for (const r of RECIPES) { if (!Object.hasOwn(ITEMS, r.result)) continue; const price = Math.max(1, r.energy), had = best.get(r.result); if (!had || price < had.price) best.set(r.result, { id: r.result, price, category: r.category }); }
  return [...best.values()];
})();
export const FRIEND_PRICE = 500;

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

const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function testerShopHtml(s: M.SaveState) {
  const friends = FRIEND_IDS.map(id => {
    const has = (s.friends ?? []).some(f => f.id === id);
    return `<div class="tester-card"><span>🧑‍🌾</span><strong>${esc(t(FRIENDS[id].name))}</strong>${has ? `<small>✓ ${esc(t('Rescued'))}</small>` : `<button class="primary" data-action="tester-friend" data-item="${id}" ${s.energy < FRIEND_PRICE ? 'disabled' : ''}>ϟ ${FRIEND_PRICE}</button>`}</div>`;
  }).join('');
  const groups = new Map<string, string[]>();
  for (const i of TESTER_ITEMS) { const it = ITEMS[i.id], have = s.bag[i.id] || 0;
    (groups.get(i.category) ?? groups.set(i.category, []).get(i.category)!).push(`<div class="tester-card"><span>${it.icon}</span><strong>${esc(t(it.name))}</strong>${have ? `<small>×${have}</small>` : ''}<button class="soft-button" data-action="tester-buy" data-item="${i.id}" ${s.energy < i.price ? 'disabled' : ''}>ϟ ${i.price.toLocaleString()}</button></div>`); }
  const items = [...groups].map(([cat, cards]) => `<h3>${esc(t(cat))}</h3><div class="tester-grid">${cards.join('')}</div>`).join('');
  return `<p class="intro">${esc(t('Tester mode: every item without materials or level, still paid with energy.'))} ϟ ${s.energy.toLocaleString()}</p>`
    + `<div class="button-row"><button class="soft-button" data-action="tester-planets">${esc(t('Unlock all planets'))}</button><button class="soft-button" data-action="tester-level">${esc(t('Max level'))}</button></div>`
    + `<h3>${esc(t('Rescue friends'))}</h3><div class="tester-grid">${friends}</div>${items}`;
}
