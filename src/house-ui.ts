/**
 * The cottage in the game shell: the outdoor door that swings open, the fade in and out, the "Outside"
 * button, walking in and out through the door, the wardrobe and mirror (your own gear) and the "Dress"
 * panel where you give a rescued friend things to wear. main.ts wires it with a few lines.
 */
import * as T from 'three';
import { dropTree } from './dispose-tree.ts';
import { t, onLanguageChange } from './i18n.ts';
import { ITEMS } from './content.ts';
import type { SaveState } from './model.ts';
import type { Entity, World } from './world.ts';
import { HOUSE, INDOOR_Y } from './house.ts';
import { HouseSession, type FriendEntity } from './house-session.ts';
import { houseKit } from './house-view.ts';
import { FRIENDS, friendsOf, type FriendId } from './friends.ts';
import { buildFriend } from './friend-view.ts';
import { friendStage } from './growth.ts';
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
  /** The diary opens today's tasks (main.ts quests). */
  quests?(): void;
  soundOn?(): boolean;
}
/** A save made inside resumes inside: this device remembers the explorer was in the cottage. */
const INSIDE_KEY = 'zoo-garden-indoors';
const remember = (inside: boolean) => { try { if (inside) localStorage.setItem(INSIDE_KEY, '1'); else localStorage.removeItem(INSIDE_KEY); } catch { /* optional */ } };
const remembered = () => { try { return localStorage.getItem(INSIDE_KEY) === '1'; } catch { return false; } };
export const DRESS_SLOTS: Array<[string, string, string]> = [['hat', '👒', 'Hat'], ['armor', '🧥', 'Outfit'], ['boots', '👟', 'Boots'], ['weapon', '⚔️', 'Weapon'], ['pet', '🐾', 'Pet']];
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
    + `<h4>${t('Wearing')}</h4><div class="dress-slots">${slots}</div>`
    + (readOnly ? `<p class="fineprint">${t('Only the owner of this cottage can dress their friends.')}</p>`
      : `<h4>${t('Give from your bag')}</h4>${bag ? `<div class="dress-bag">${bag}</div>` : `<p class="fineprint">${t('Nothing to wear in your bag yet. Visit the outfitters!')}</p>`}<p class="fineprint">${t('Given things leave your bag and come back when you take them.')}</p>`)
    + '</div>';
}

export function initHouse(d: HouseDeps) {
  const house = new HouseSession(), world = d.world;
  let fade = 0, fadeTarget = 0, pending: (() => void) | null = null, friendClock = 0, dressing: FriendId | null = null, resumed = false, outdoorDoor: T.Group | null = null, doorOpen = 0, prewarmed = false, veilFade = -1;
  const veil = document.createElement('div'); veil.id = 'house-veil'; document.body.append(veil);
  const out = document.createElement('button'); out.className = 'home-button house-out'; out.dataset.houseAction = 'leave'; out.title = t('Outside');
  /** The HUD's place name says where you are: the cottage indoors, the village zone again outside. */
  const zoneName = () => { const el = document.getElementById('zone-name'); if (el) el.textContent = house.inside ? t('Cottage') : t(world.lastZone || 'Clover Village'); };
  const label = () => { zoneName(); out.innerHTML = `🚪 <span>${t('Outside')}</span>`; out.title = t('Outside'); out.setAttribute('aria-label', t('Outside')); };
  label(); document.querySelector('.home-button')?.after(out); onLanguageChange(label);
  /** Fade to the warm dark, swap, fade back. */
  const transition = (swap: () => void) => { if (pending) return; pending = swap; fadeTarget = 1; };
  const sync = () => { document.body.classList.toggle('indoors', house.inside); zoneName(); remember(house.inside && !d.visiting()); };
  const enter = (instant = false) => {
    if (house.inside || world.planet !== 'home') return;
    void houseKit.load();
    const swap = () => { house.enter(world); house.view.doorOpen = 1; house.view.doorTarget = 0; sync(); };
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
  const frame = (dt: number) => {
    if (!d.started()) return;
    if (!resumed) { resumed = true; if (remembered() && !d.visiting() && world.planet === 'home') enter(true); }
    if (house.inside && !world.interior) { sync(); } // the world rebuilt (travel, visit, reset)
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
      if ((friendClock -= dt) <= 0) { friendClock = .25; house.syncFriends(friendList()); }
      // Walking into the front door from inside leaves.
      if (!pending && !d.blocked() && world.moving && world.position.z > HOUSE.spawn.z + .65 && Math.abs(world.position.x) < .75 && Math.cos(world.facing) > .5) leave();
    } else if (!pending && !d.blocked() && world.planet === 'home' && world.moving && Math.hypot(world.position.x - HOUSE.outdoorDoor.x, world.position.z - HOUSE.outdoorDoor.z) < 1.45 && Math.cos(world.facing) < -.5) enter();
  };
  const portrait = (id: FriendId) => { const f = friendList().find(x => x.id === id); return f ? modelIcon(`friend:${id}:${JSON.stringify(f.gear)}:${houseKit.ready}:${friendStage(f)}`, () => buildFriend(id, f.gear, friendStage(f))) : ''; };
  const dress = (id: FriendId) => {
    dressing = id;
    d.openDialog('dress', t('Dress {name}', { name: t(FRIENDS[id].name) }), dressHtml(world.state, id, { readOnly: d.visiting(), portrait: portrait(id), iconUrl: d.iconUrl }), t('A FRIEND AT HOME'), '👗');
  };
  document.addEventListener('click', async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-house-action]'); if (!button || button.disabled) return;
    const action = button.dataset.houseAction, friend = button.dataset.friend as FriendId | undefined;
    if (action === 'leave') { d.closeDialog(); leave(); return; }
    if (!friend || d.visiting()) return;
    button.disabled = true;
    const ok = action === 'give' ? await d.perform('giveFriendGear', { friend, id: button.dataset.item }) : await d.perform('takeFriendGear', { friend, slot: button.dataset.slot });
    if (ok) { d.tone('success'); house.syncFriends(friendList()); if (action === 'give') world.refreshPlayer(); }
    if (d.modal() === 'dress' && dressing === friend) dress(friend);
  });
  /** Taps on house things; true when handled (main.ts calls this first in world.onInteract). */
  const interact = (e: Entity) => {
    if (life.interact(e)) return true;
    if (e.kind === 'home') { if (!d.visiting()) void d.perform('rest').then(ok => { if (ok) d.toast('Home, sweet home. Your health is restored.', '🏡'); }); enter(); return true; }
    if (e.kind === 'house-door') { leave(); return true; }
    if (e.kind === 'house-wardrobe' || e.kind === 'house-mirror') { if (d.visiting()) d.toast('Enjoy looking around. Your own garden is waiting at home.', '🌷'); else if (e.kind === 'house-mirror' && d.looks) d.looks(); else d.ownGear(); return true; }
    // Indoor friends carry friendId; the outdoor workers (friend-crew.ts) open their status panel in main.ts instead.
    if (e.kind === 'friend' && (e as FriendEntity).friendId) { dress((e as FriendEntity).friendId); return true; }
    return false;
  };
  return {
    house, life, interact, enter, leave, dress, label,
    get inside() { return house.inside; },
    /** Pose height for other clients: raised while inside (see house.ts). */
    poseY: (y: number) => y + (house.inside ? INDOOR_Y : 0),
    frame,
    /** A gear kit arrived: dress the friends again. */
    refreshFriends: () => house.view.refreshFriends(friendList()),
  };
}
