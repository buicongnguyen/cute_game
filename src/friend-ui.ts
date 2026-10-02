import { t } from './i18n.ts';
import { ENEMY_TYPES } from './enemy-types.ts';
import type { SaveState } from './model.ts';
import { CAGES, FRIENDS, doneToday, friendOf, type FriendId } from './friends.ts';
import { GROWTH, friendStage } from './growth.ts';
import { autoFeedNote } from './farm-helper-ui.ts';

/** Rescued friends' panel copy (main.ts opens it when a friend is tapped). */
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const ROLE_LINE: Record<string, string> = {
  garden: '{name} · gardening · tended {count} beds today',
  farm: '{name} · farming · {count} jobs at the pen today',
  cook: '{name} · cooking · gathered {count} times today',
};
/** "Sprout · gardening · tended 12 beds today" (or following / resting). */
export function friendStatus(s: SaveState, id: FriendId, now = Date.now()) {
  const f = friendOf(s, id), name = FRIENDS[id].name;
  if (!f) return t('{name} is still waiting in a cage.', { name });
  if (!f.home) return t('{name} · following you home', { name });
  if (f.paused) return t('{name} · resting (paused)', { name });
  return t(ROLE_LINE[f.role], { name, count: doneToday(f, now) });
}
const JOB: Record<string, string> = {
  garden: 'Harvests ripe beds and replants them from your seeds, like the garden robot. Both can work: a bed is only ever harvested once.',
  farm: 'Collects eggs and milk into your bag and feeds animals from your cheapest crop, always leaving you one.',
  cook: 'Gathers ripe crops and farm products, then cooks half of them (rounded down) at the volcano kitchen. The other half goes to your bag raw.',
};
const STAGE_NAME = ['Little', 'Growing', 'Grown'];
/** "Size: Growing · ¾ of your height · grows again after 150 jobs or 3 days" (the growth stage, growth.ts). */
export function growthLine(s: SaveState, id: FriendId) {
  const f = friendOf(s, id); if (!f) return '';
  const stage = friendStage(f), next = GROWTH[stage + 1], size = t('{name} · {share} of your height', { name: t(STAGE_NAME[stage]), share: String(GROWTH[stage].height) });
  return next ? t('Size: {size} · grows at {jobs} jobs or {days} days home (now {done} jobs)', { size, jobs: next.jobs, days: next.days, done: f.jobs ?? 0 }) : t('Size: {size} · fully grown', { size });
}
export function friendPanel(s: SaveState, id: FriendId, now = Date.now()) {
  const f = friendOf(s, id); if (!f) return '';
  const paused = !!f.paused;
  return `<p class="intro friend-status" data-friend-status="${id}">${esc(friendStatus(s, id, now))}</p><p class="friend-growth" data-friend-stage="${friendStage(f)}">🌱 ${esc(growthLine(s, id))}</p><p>${esc(t(JOB[f.role]))}</p>`
    + `<div class="button-row"><button class="${paused ? 'primary' : 'soft-button'}" data-action="friend-pause" data-kind="${id}" aria-pressed="${paused}">${esc(t(paused ? 'Back to work' : 'Take a break'))}</button></div>`
    // The farmer feeds only when asked (off by default): feeding costs crops that could be sold.
    + (f.role === 'farm' ? `<div class="settings-row"><div><strong>${esc(t('Automatic feeding'))}</strong><small>${esc(autoFeedNote(s, !!f.autoFeed, now))}</small></div><button class="toggle ${f.autoFeed ? 'on' : ''}" role="switch" aria-checked="${!!f.autoFeed}" aria-label="${esc(t('Automatic feeding'))}" data-action="friend-feed" data-kind="${id}"></button></div>` : '');
}
/** What a locked cage says when tapped. */
export function lockedHint(id: FriendId) {
  return id === 'pepper' ? t('Beat a boss on another planet to open this cage.') : t('Defeat the {boss} nearby to open this cage.', { boss: t(ENEMY_TYPES[CAGES[id].boss]?.name ?? CAGES[id].boss) });
}
/** The thank-you and a short story line, per friend. */
export const RESCUE_LINES: Record<FriendId, [string, string]> = {
  sprout: ['Thank you! I am Sprout.', 'The treant caught me watering its roots. Now I will tend your garden!'],
  clover: ['You beat the bear! I am Clover.', 'It caught me sharing its honey with hens. I will care for your animals!'],
  pepper: ['Free at last! I am Pepper.', 'The robot wanted a cook who never sleeps. I would love to cook for you!'],
};
