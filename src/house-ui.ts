/**
 * The cottage in the game shell: the outdoor door that swings open, the fade in and out, the "Outside"
 * button, walking in and out through the door, the wardrobe and mirror (your own gear) and the "Dress"
 * panel where you give a rescued friend things to wear (Gear tab) or change its look (Looks tab, friend-looks-ui.ts).
 * main.ts wires it with a few lines.
 */
import * as T from 'three';
import { dropTree } from './dispose-tree.ts';
import { t, onLanguageChange } from './i18n.ts';
import { ITEMS } from './content.ts';
import type { SaveState } from './model.ts';
import type { Entity, World } from './world.ts';
import { HOUSE, INDOOR_Y } from './house.ts';
import { hasDebuffs } from './home-care.ts';
import { HouseSession, type FriendEntity } from './house-session.ts';
import { houseKit } from './house-view.ts';
import { FRIENDS, friendsOf, type FriendId } from './friends.ts';
import { friendStatus, friendWorkRow, offDutyIndoors } from './friend-ui.ts';
import { indoorsKey } from './profiles.ts';
import { friendModel, friendSignature } from './friend-view.ts';
import { friendLooksHtml, friendTabsHtml, initFriendLooks, type FriendTab } from './friend-looks-ui.ts';
import { modelIcon } from './icons.ts';
import { toonMaterial } from './toon.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part } from './part-cache.ts';
import { initHouseLife } from './house-life.ts';

export interface HouseDeps {
  world: World;
  started(): boolean; visiting(): boolean; blocked(): boolean;
  perform(type: string, payload?: Record<string, unknown>): Promise<unknown>;
  openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void;
  closeDialog(): void; modal(): string | null;
  toast(message: string, icon?: string): void; tone(kind?: string): void;
  ownGear(): void; iconUrl(id: string): string;
  /** The mirror's Look shop (look-shop.ts); without it the mirror opens your gear like the wardrobe. */
  looks?(): void;
  /** The craft room's upgrade bench (upgrade-bench.ts). */
  bench?(): void;
  /** The diary opens today's tasks (main.ts quests). */
  quests?(): void;
  soundOn?(): boolean;
}
/** A save made inside resumes inside: this device remembers the explorer was in the cottage. */
// Per save profile (profiles.ts): profile 1 saved indoors must not start profile 2 in the cottage.
const remember = (inside: boolean) => { try { if (inside) localStorage.setItem(indoorsKey(), '1'); else localStorage.removeItem(indoorsKey()); } catch { /* optional */ } };
const remembered = () => { try { return localStorage.getItem(indoorsKey()) === '1'; } catch { return false; } };
// Keys are FRIEND_SLOTS (Friend.gear): 'outfit', not the item type 'armor', or a given outfit never showed and could not be taken back.
export const DRESS_SLOTS: Array<[string, string, string]> = [['hat', '👒', 'Hat'], ['outfit', '🧥', 'Outfit'], ['boots', '👟', 'Boots'], ['weapon', '⚔️', 'Weapon'], ['pet', '🐾', 'Pet']];
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** Things in the bag a friend can wear (not disguises). */
export function wearables(s: SaveState) { return Object.entries(s.bag).filter(([id, n]) => (n ?? 0) > 0 && ['hat', 'outfit', 'boots', 'weapon', 'pet'].includes(ITEMS[id]?.slot ?? '')).map(([id, n]) => ({ id, count: n as number })); }

/** The Dress panel's body: portrait, what the friend wears per slot, and what you can give. */
export function dressHtml(s: SaveState, id: FriendId, { readOnly = false, portrait = '', iconUrl = (item: string) => item }: { readOnly?: boolean; portrait?: string; iconUrl?: (id: string) => string } = {}) {
  const friend = friendsOf(s).find(f => f.id === id), look = FRIENDS[id];
  if (!friend) return `<p class="intro">${t('This friend is out right now.')}</p>`;
  const gear = friend.gear as Record<string, string | undefined>;
  const slots = DRESS_SLOTS.map(([slot, icon, label]) => {
    const item = gear[slot];
    return item ? `<button class="dress-slot worn" data-house-action="take" data-friend="${id}" data-slot="${slot}" ${readOnly ? 'disabled' : ''} aria-label="${esc(t('Take back {item}', { item: t(ITEMS[item]?.name ?? item) }))}"><img src="${esc(iconUrl(item))}" alt="" loading="lazy"><span>${esc(t(ITEMS[item]?.name ?? item))}</span>${readOnly ? '' : `<small>${t('Take back')}</small>`}</button>`
      : `<div class="dress-slot empty"><b>${icon}</b><span>${t(label)}</span></div>`;
  }).join('');
  const bag = readOnly ? '' : wearables(s).map(({ id: item, count }) => `<button class="dress-item" data-house-action="give" data-friend="${id}" data-item="${esc(item)}" aria-label="${esc(t('Give {item}', { item: t(ITEMS[item].name) }))}"><img src="${esc(iconUrl(item))}" alt="" loading="lazy"><span>${esc(t(ITEMS[item].name))}</span><b>×${count}</b></button>`).join('');
  return `<div class="dress-panel"><div class="dress-head">${portrait ? `<img class="dress-portrait" src="${portrait}" alt="">` : `<div class="dress-portrait">🧑‍🌾</div>`}<div><strong>${esc(t(look.name))}</strong><small>${t(look.role === 'garden' ? 'Tends the garden' : look.role === 'farm' ? 'Looks after the animals' : 'Cooks in the kitchen')}</small></div></div>`
    // Off duty indoors the outdoor panel cannot be tapped: its work buttons are here instead.
    + (!readOnly && offDutyIndoors(s, id) ? `<p class="intro friend-status">${esc(friendStatus(s, id))}</p>${friendWorkRow(s, id)}` : '')
    + `<h4>${t('Wearing')}</h4><div class="dress-slots">${slots}</div>`
    + (readOnly ? `<p class="fineprint">${t('Only the owner of this cottage can dress their friends.')}</p>`
      : `<h4>${t('Dress from your collection')}</h4>${bag ? `<div class="dress-bag">${bag}</div>` : `<p class="fineprint">${t('Nothing to wear in your bag yet. Visit the outfitters!')}</p>`}<p class="fineprint">${t('Your helpers borrow a copy, so every helper can wear anything you have obtained and you keep it too.')}</p>`)
    + '</div>';
}

export function initHouse(d: HouseDeps) {
  const house = new HouseSession(), world = d.world;
  let fade = 0, fadeTarget = 0, pending: (() => void) | null = null, friendClock = 0, dressing: FriendId | null = null, friendTab: FriendTab = 'gear', resumed = false, outdoorDoor: T.Group | null = null, doorOpen = 0, prewarmed = false, veilFade = -1;
  const veil = document.createElement('div'); veil.id = 'house-veil'; document.body.append(veil);
  const out = document.createElement('button'); out.className = 'home-button house-out'; out.dataset.houseAction = 'leave'; out.title = t('Outside');
  /** The HUD's place name says where you are: the cottage indoors, the village zone again outside. */
  const zoneName = () => { const el = document.getElementById('zone-name'); if (el) el.textContent = house.inside ? t('Cottage') : t(world.lastZone || 'Clover Village'); };
  // Indoors the outdoor hint ("Space attack") makes no sense: the cottage has its own (house.css swaps them).
  const hint = document.createElement('div'); hint.className = 'control-hint house-hint';
  const label = () => { zoneName(); out.innerHTML = `🚪 <span>${t('Outside')}</span>`; out.title = t('Outside'); out.setAttribute('aria-label', t('Outside')); hint.innerHTML = `<span>${t('Click a glowing thing to use it')}</span><i>•</i> ${t('Arrows to move')}`; };
  label(); document.querySelector('.home-button')?.after(out); document.querySelector('.control-hint')?.after(hint); onLanguageChange(label);
  /** Fade to the warm dark, swap, fade back. */
  const transition = (swap: () => void) => { if (pending) return; pending = swap; fadeTarget = 1; };
  let wasInside = false;
  const sync = () => { wasInside = house.inside; document.body.classList.toggle('indoors', house.inside); zoneName(); remember(house.inside && !d.visiting()); };
  /** Stepping inside clears bad effects like landing home does (home-care.ts; the authority re-checks). */
  const cleanse = () => { if (d.visiting() || !hasDebuffs(world.state)) return; void d.perform('homeCleanse').then(n => { if (!n) return; world.fx?.burst({ x: world.position.x, z: world.position.z }, { n: 18, color: ['#ffffff', '#bff7ff', '#ffe9a8'], glow: true, size: .1, speed: 3, up: 4, y: 1 }); d.toast(t('Cleansed! Bad effects wash away at home.'), '✨'); }); };
  const enter = (instant = false) => {
    if (house.inside || world.planet !== 'home') return;
    void houseKit.load();
    const swap = () => { house.enter(world); house.view.doorOpen = 1; house.view.doorTarget = 0; sync(); cleanse(); };
    if (instant) swap(); else { doorOpen = 1; d.tone('pop'); transition(swap); }
  };
  const leave = () => {
    if (!house.inside) return;
    house.view.doorTarget = 1; d.tone('pop');
    transition(() => { house.leave(); doorOpen = 1; sync(); });
  };
  /** A swinging door in front of the cottage's painted one (the cottage model is one baked piece). */
  const ensureOutdoorDoor = () => {
    if (house.inside || world.interior) return; // indoors the entity list is the interior's: keep the door we have
    const home = world.planet === 'home' ? world.entities.find(e => e.kind === 'home') : null;
    if (home && outdoorDoor?.parent === home.mesh) return;
    if (outdoorDoor) { dropTree(outdoorDoor); outdoorDoor = null; } // the cottage was rebuilt or left behind: free the old door
    if (!home) return;
    const parts = houseKit.ready ? ['doorway', 'door'].map(n => houseKit.parts(n) ?? []) : null;
    if (!parts) { void houseKit.load(); return; }
    const group = new T.Group(); group.name = 'cottage-door';
    const z = 2.585, piece = (list: typeof parts[number]) => { const g = mergeGeometries(list.map(p => { const geo = (p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone()); for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k); geo.applyMatrix4(p.matrix); const c = (p.material as T.MeshToonMaterial).color, n = geo.getAttribute('position').count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); geo.setAttribute('color', new T.BufferAttribute(a, 3)); return geo; }), false); return g ? new T.Mesh(g, toonMaterial({ color: '#ffffff', vertexColors: true })) : null; };
    const dark = piece(parts[0]); if (dark) { dark.position.set(0, .36, z); group.add(dark); }
    const hinge = new T.Group(); hinge.name = 'hinge'; hinge.position.set(-.53, .36, z + .075); const panel = piece(parts[1]); if (panel) { panel.castShadow = true; hinge.add(panel); } group.add(hinge);
    home.mesh.add(group); outdoorDoor = group;
  };
  const stepDoors = (dt: number) => {
    const hinge = outdoorDoor && part(outdoorDoor, 'hinge');
    if (hinge) {
      const near = !house.inside && Math.hypot(world.position.x - HOUSE.outdoorDoor.x, world.position.z - HOUSE.outdoorDoor.z) < 2.2;
      const target = near || fadeTarget > 0 ? 1 : 0; doorOpen += (target - doorOpen) * (1 - Math.exp(-dt * 8));
      hinge.rotation.y = -doorOpen * 1.75;
    }
  };
  const friendList = () => friendsOf(world.state);
  // Activities, prompts, chatter and music (house-life.ts).
  let dimHold = 0;
  const life = initHouseLife({ world, house, visiting: d.visiting, blocked: d.blocked, perform: d.perform, openDialog: d.openDialog, toast: d.toast, tone: d.tone, ownGear: d.ownGear, looks: d.looks, quests: d.quests, soundOn: () => d.soundOn?.() ?? true,
    dim: seconds => { dimHold = seconds; }, route: e => world.onInteract(e) });
  // Desktop hover: the thing under the mouse glows and the cursor turns into a hand, so you see what a click will use
  // before clicking. Touch has no hover: there the ring round the nearest thing (house-life.ts) does that job.
  const canvas = document.getElementById('world');
  let mouse: { x: number; y: number } | null = null, hovered: Entity | null = null, hoverScan = 0;
  canvas?.addEventListener('pointermove', ev => { mouse = ev.pointerType === 'mouse' ? { x: ev.clientX, y: ev.clientY } : null; });
  canvas?.addEventListener('pointerleave', () => { mouse = null; });
  const hover = (e: Entity | null) => {
    if (e !== hovered) { hovered = e; if (canvas) canvas.style.cursor = e ? 'pointer' : ''; }
    house.view.setHover(e ? house.boxOf(e) : null); // friends walk: their glow follows them
  };
  const frame = (dt: number) => {
    if ((hoverScan -= dt) <= 0) { hoverScan = .05; const e = house.inside && mouse && !d.blocked() && !pending ? house.pick(mouse.x, mouse.y) : null; if (e || hovered) hover(e); }
    if (!d.started()) return;
    if (!resumed) { resumed = true; if (remembered() && !d.visiting() && world.planet === 'home') enter(true); }
    // Any change: a world rebuild (travel, visit, reset, the globe's flight) drops the interior without leave(), so a
    // check of house.inside alone never saw it and the indoor HUD stayed on.
    if (house.inside !== wasInside) sync();
    ensureOutdoorDoor(); stepDoors(dt);
    // Build the kit interior and compile its shaders in idle time outside: on a slow phone the first entry used to
    // stall for 100-150 ms (merging the furniture, then a synchronous shader link on the first indoor frame).
    if (!prewarmed && !house.inside && houseKit.ready) {
      prewarmed = true; const idle = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
      idle(() => { void house.view.refine().then(() => world.renderer.compileAsync(house.view.scene, world.camera)).catch(() => {}); }, { timeout: 3000 });
    }
    if (fadeTarget !== fade) {
      fade = fadeTarget > fade ? Math.min(1, fade + dt * 5) : Math.max(0, fade - dt * 4);
      if (fade >= 1 && pending) { const swap = pending; pending = null; swap(); fadeTarget = 0; }
    }
    // Sleep: the veil dims for a moment, then lifts.
    if (dimHold > 0) { dimHold -= dt; const v = Math.min(.85, Math.min(dimHold, 1.4 - dimHold + .3) * 2); if (v > fade) { veil.style.display = 'block'; veil.style.opacity = String(Math.max(0, v)); veilFade = -1; } }
    if (fade !== veilFade && dimHold <= 0) { veilFade = fade; veil.style.opacity = String(fade); veil.style.display = fade > 0 ? 'block' : 'none'; }
    life.frame(dt);
    if (house.inside) {
      house.frame(innerWidth / innerHeight); house.view.update(dt, world.time);
      // A closed panel ends its look previews (friend-looks-ui.ts drafts); the room shows the drafts while it is open.
      if (d.modal() !== 'dress' && looks.clear()) friendClock = 0;
      if ((friendClock -= dt) <= 0) { friendClock = .25; house.syncFriends(looks.shown(friendList())); }
      // Walking into the front door from inside leaves.
      if (!pending && !d.blocked() && world.moving && world.position.z > HOUSE.spawn.z + .65 && Math.abs(world.position.x) < .75 && Math.cos(world.facing) > .5) leave();
    } else if (!pending && !d.blocked() && world.planet === 'home' && world.moving && Math.hypot(world.position.x - HOUSE.outdoorDoor.x, world.position.z - HOUSE.outdoorDoor.z) < 1.45 && Math.cos(world.facing) < -.5) enter();
  };
  const portrait = (id: FriendId) => { const f = friendList().find(x => x.id === id); return f ? modelIcon(`friend:${id}:${friendSignature(f)}:${houseKit.ready}`, () => friendModel(f)) : ''; };
  // The panel's Looks tab: drafts preview on the friend in the room and in the tab's mirror.
  const looks = initFriendLooks({ friends: friendList, state: () => world.state, visiting: d.visiting, perform: d.perform, toast: d.toast, tone: d.tone,
    refresh: id => { if (house.inside) house.syncFriends(looks.shown(friendList())); if (d.modal() === 'dress' && dressing === id) dress(id); } });
  /** A friend's panel, on the tab used last (Gear the first time). */
  const dress = (id: FriendId, tab: FriendTab = friendTab) => {
    dressing = id; friendTab = tab;
    const body = tab === 'looks' ? friendLooksHtml(world.state, id, looks.drafts.get(id), { readOnly: d.visiting() }) : dressHtml(world.state, id, { readOnly: d.visiting(), portrait: portrait(id), iconUrl: d.iconUrl });
    d.openDialog('dress', t('Dress {name}', { name: t(FRIENDS[id].name) }), `<div class="friend-panel" data-friend-panel="${id}">${friendTabsHtml(tab)}${body}</div>`, t('A FRIEND AT HOME'), tab === 'looks' ? '🪞' : '👗');
    if (tab === 'looks') looks.paint(id);
  };
  document.addEventListener('click', async event => {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-friend-tab]');
    if (tab && dressing && d.modal() === 'dress') { d.tone('click'); dress(dressing, tab.dataset.friendTab as FriendTab); return; }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-house-action]'); if (!button || button.disabled) return;
    const action = button.dataset.houseAction, friend = button.dataset.friend as FriendId | undefined;
    if (action === 'leave') { d.closeDialog(); leave(); return; }
    if (!friend || d.visiting()) return;
    button.disabled = true;
    const ok = action === 'give' ? await d.perform('giveFriendGear', { friend, id: button.dataset.item }) : await d.perform('takeFriendGear', { friend, slot: button.dataset.slot });
    if (ok) { d.tone('success'); house.syncFriends(looks.shown(friendList())); if (action === 'give') world.refreshPlayer(); }
    if (d.modal() === 'dress' && dressing === friend) dress(friend);
  });
  /** Taps on house things; true when handled (main.ts calls this first in world.onInteract). */
  const interact = (e: Entity) => {
    if (life.interact(e)) return true;
    if (e.kind === 'home') { if (!d.visiting()) void d.perform('rest').then(ok => { if (ok) d.toast('Home, sweet home. Your health is restored.', '🏡'); }); enter(); return true; }
    if (e.kind === 'house-door') { leave(); return true; }
    if (e.kind === 'house-wardrobe' || e.kind === 'house-mirror') { if (d.visiting()) d.toast('Enjoy looking around. Your own garden is waiting at home.', '🌷'); else if (e.kind === 'house-mirror' && d.looks) d.looks(); else d.ownGear(); return true; }
    if (e.kind === 'house-bench') { if (d.visiting()) d.toast('Enjoy looking around. Your own garden is waiting at home.', '🌷'); else d.bench?.(); return true; }
    // Indoor friends carry friendId; the outdoor workers (friend-crew.ts) open their status panel in main.ts instead.
    if (e.kind === 'friend' && (e as FriendEntity).friendId) { dress((e as FriendEntity).friendId); return true; }
    return false;
  };
  return {
    house, life, interact, enter, leave, dress, label,
    get inside() { return house.inside; },
    /** The thing under the mouse indoors (desktop), for the label's hover look. */
    hovered: () => hovered,
    /** Pose height for other clients: raised while inside (see house.ts). */
    poseY: (y: number) => y + (house.inside ? INDOOR_Y : 0),
    frame,
    /** A gear kit arrived: dress the friends again. */
    refreshFriends: () => house.view.refreshFriends(looks.shown(friendList())),
    /** The friend Looks tab (drafts, its mirror), for tests and probes. */
    looks,
  };
}
