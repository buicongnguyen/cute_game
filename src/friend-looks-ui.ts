import { t } from './i18n.ts';
import { heroKit, heroKitFor, wearKit } from './assets.ts';
import { FRIENDS, type Friend, type FriendId } from './friends-state.ts';
import { friendLook } from './friend-looks.ts';
import { friendModel, friendSignature } from './friend-view.ts';
import { friendHeight, friendStage } from './growth.ts';
import { OPTIONS, lookPrice, missingOptions, swapOption, type LookId, type LookOption, type Looks } from './looks.ts';
import { centreChosen, headline, lookName, lookRowsHtml, mirrorHtml } from './look-tiles.ts';
import { MirrorPreview, restPose } from './mirror-preview.ts';

/**
 * A friend's Looks tab in its cottage panel (house-ui.ts "Dress"): the mirror's four rows of portrait tiles and a framed
 * mirror of the friend, in its own shirt and hair colours and gear. A tap previews the combination on the friend in
 * the room (house-ui.ts shows `draft` instead of the saved look) and in the glass; Apply saves it (actions
 * 'friendLook'). Options the player owns are free for friends; the rest show the mirror's price and are bought once,
 * for the player and every friend (friend-looks.ts explains the rules, and why the height option sets proportions while
 * growth sets the height). Visitors see the tab with the tiles disabled.
 */
export type FriendTab = 'gear' | 'looks';
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const share = (stage: number) => `${Math.round(friendHeight(stage) * 100)}%`;

/** The Gear / Looks switch at the top of a friend's panel. */
export const friendTabsHtml = (tab: FriendTab) => `<nav class="panel-tabs friend-tabs" aria-label="${esc(t('Friend'))}">${([['gear', '👗', 'Gear'], ['looks', '🪞', 'Looks']] as const).map(([id, icon, label]) => `<button class="${tab === id ? 'active' : ''}" aria-pressed="${tab === id}" data-friend-tab="${id}">${icon} ${esc(t(label))}</button>`).join('')}</nav>`;

/** The tab's body for friend `id`, showing `draft` (the saved look when nothing is being tried). */
export function friendLooksHtml(s: { energy: number; looks?: Looks; friends?: Friend[] }, id: FriendId, draft?: LookId, { readOnly = false } = {}) {
  const friend = s.friends?.find(f => f.id === id), name = t(FRIENDS[id].name);
  if (!friend) return `<p class="intro">${esc(t('This friend is out right now.'))}</p>`;
  const worn = friendLook(friend), shown = draft ?? worn, price = lookPrice(s, shown), missing = missingOptions(s, shown);
  const main = readOnly ? '' : shown === worn ? `<span class="chip chip-seed">✓ ${esc(t('Wearing'))}</span>`
    : missing.length ? `<button class="primary" data-friend-look-action="buy" data-friend="${id}" ${s.energy < price ? 'disabled' : ''} title="${esc(t('Unlocks it for you and every friend too'))}">${esc(t('Buy'))} ϟ ${price}</button>`
    : `<button class="primary" data-friend-look-action="apply" data-friend="${id}">${esc(t('Dress {name}', { name }))}</button>`;
  const back = readOnly || shown === worn ? '' : `<button class="soft-button" data-friend-look-action="reset" data-friend="${id}">${esc(t('Back to theirs'))}</button>`;
  return `<p class="intro">${esc(t('Options you own dress friends for free; buying one here unlocks it for you too. Height sets the body shape: {name} still grows to {share} of your height.', { name, share: share(friendStage(friend)) }))}</p>`
    + `<div class="look-studio friend-studio">${mirrorHtml('friend')}<div class="look-builder">${lookRowsHtml(s, shown, { attr: 'data-friend-look', worn, readOnly })}</div></div>`
    + (readOnly ? `<p class="fineprint">${esc(t('Only the owner of this cottage can dress their friends.'))}</p>`
      : `<div class="look-footer"><strong class="look-name">${esc(lookName(shown))}</strong><div class="look-buttons">${back}${main}</div></div>`);
}

export interface FriendLooksDeps {
  /** The friends as saved (the host's while visiting). */
  friends(): Friend[];
  state(): { energy: number; looks?: Looks; friends?: Friend[] };
  visiting(): boolean;
  perform(type: string, payload?: Record<string, unknown>): Promise<unknown>;
  toast(message: string, icon?: string): void; tone(kind?: string): void;
  /** Re-renders the friend's panel (house-ui.ts dress) and re-syncs the room's friends with the drafts. */
  refresh(id: FriendId): void;
}
export function initFriendLooks(d: FriendLooksDeps) {
  /** Combinations being tried, per friend: local only, shown in the room and the glass, dropped when the panel closes. */
  const drafts = new Map<FriendId, LookId>();
  const mirror = new MirrorPreview({ width: 170, height: 240 });
  const friend = (id: FriendId) => d.friends().find(f => f.id === id);
  /** The friends as the room should show them: each with its draft look while one is being tried. */
  const shown = (list: Friend[]) => drafts.size ? list.map(f => drafts.has(f.id) ? { ...f, look: drafts.get(f.id)! } : f) : list;
  /** Draws the friend in the glass (only when its look, gear, stage or kits changed: mirror-preview.ts). */
  const paint = (id: FriendId) => {
    const f = friend(id); if (!f) return;
    const look = drafts.get(id) ?? friendLook(f), kit = heroKitFor(look), key = friendSignature(f, look) + heroKit.ready + wearKit.ready;
    mirror.show(document.querySelector('[data-mirror-slot="friend"]'), id + key, () => {
      // The glass draws its own floor shadow: no blob, and the explorer's relaxed stance.
      const model = friendModel(f, look), blob = model.getObjectByName('friend-blob'); if (blob) blob.visible = false; return restPose(model);
    });
    centreChosen();
    if (!kit.ready) void kit.load().then(() => { if (drafts.get(id) === look || friendLook(friend(id)) === look) d.refresh(id); });
  };
  document.addEventListener('click', async event => {
    const target = event.target as HTMLElement, chip = target.closest<HTMLButtonElement>('[data-friend-look]');
    const panel = target.closest<HTMLElement>('[data-friend-panel]'), id = panel?.dataset.friendPanel as FriendId | undefined;
    if (chip && id && !chip.disabled && !d.visiting()) {
      const f = friend(id); if (!f) return;
      const next = swapOption(drafts.get(id) ?? friendLook(f), chip.dataset.friendLook as LookOption);
      if (next === friendLook(f)) drafts.delete(id); else drafts.set(id, next);
      d.tone('click'); d.refresh(id); return;
    }
    const button = target.closest<HTMLButtonElement>('[data-friend-look-action]'); if (!button || button.disabled || d.visiting()) return;
    const who = button.dataset.friend as FriendId, action = button.dataset.friendLookAction, look = drafts.get(who);
    if (action === 'reset' || !look) { drafts.delete(who); d.refresh(who); return; }
    button.disabled = true;
    const ok = await d.perform('friendLook', { friend: who, id: look, buy: action === 'buy' });
    if (ok) {
      drafts.delete(who); d.tone('success');
      d.toast(t('{name} has a new look: {look}!', { name: t(FRIENDS[who].name), look: lookName(look) }), OPTIONS[headline(look)].icon);
    }
    d.refresh(who);
  });
  return {
    drafts, mirror, shown, paint,
    /** Drops every draft (the panel closed); true when there were any, so the room re-syncs. */
    clear() { if (!drafts.size) return false; drafts.clear(); return true; },
  };
}
