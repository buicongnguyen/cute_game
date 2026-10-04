import * as T from 'three';
import * as M from './model.ts';
import * as F from './farm.ts';
import { CROPS, ITEMS } from './content.ts';
import { t } from './i18n.ts';
import { TalkBag } from './house-talk.ts';
import { BOT_LINES, type BotScenario } from './bot-lines.ts';
import { iconPath } from './item-icons.ts';
import type { GameBridge } from './game-bridge.ts';
import type { RemotePose } from './world.ts';
import {
  BOT_ID_PREFIX, MEET_PAUSE_MS, befriend, canMeet, choosePresent, isBotId, isFriend, makeCast, newStore, parseStore, pickGoal, presentReady, schedulePresent, seeded, settleGift, walk,
  type BotDef, type BotStore, type GiftNote, type WalkCtx, type Walker,
} from './bot-logic.ts';
import './bots.css';

/**
 * AI neighbours for solo play: a few made-up explorers share the garden with you (drawn by the same code as other players,
 * with a name and level above their heads), each with a house you can visit once you are friends. Some are rich and wear
 * rare outfits; the ones who can fly cross the sky now and then. Now and then one walks up, says something kind and asks to be
 * friends; when you say yes they give you a rare gift. They only exist while you play offline, never next to real players.
 *
 * The gift is promised in the same step as the friendship (bot-logic befriend) and kept in the saved store until the bag has
 * it, so closing the page, a full bag or a visit in progress can delay it but never lose it.
 */
const STORE_KEY = 'cute-game-neighbours-v1', ENABLED_KEY = 'cute-game-neighbours-on', COUNT = 5;
const AREA = { radius: 13, centre: { x: 0, z: 2 } }; // inside the home safe zone (18 m), so enemies never notice them
const FLY_HEIGHT = 3.1;
type Mode = 'wander' | 'approach' | 'talk' | 'ask' | 'fly';
interface Run {
  def: BotDef; w: Walker; y: number; mode: Mode; modeT: number; flyY: number; say: { text: string; until: number } | null;
  moving: boolean; nextPlan: number; chase: number; askUntil: number;
}
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: friendships last for this visit only */ } };
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

export function initBots(game: GameBridge) {
  const world = game.getWorld(), bag = new TalkBag(), rand = Math.random;
  let enabled = read(ENABLED_KEY) !== '0';
  const seed0 = (Date.now() ^ (Math.random() * 2 ** 32)) >>> 0;
  let store: BotStore = parseStore(read(STORE_KEY), seed0);
  const cast = makeCast(store.seed, COUNT), runs = new Map<string, Run>();
  const save = () => write(STORE_KEY, JSON.stringify(store));
  save();
  const player = () => game.getState();
  const owns = (item: string) => game.ownsItem(item);
  const botName = (d: BotDef) => d.name;

  // ---- Where they walk ----
  const ctx: WalkCtx = { blocked: (x, z) => world.blocked(x, z), rand, radius: AREA.radius, centre: AREA.centre };
  const spawn = (def: BotDef): Run => {
    const w: Walker = { x: 0, z: 0, facing: rand() * 6.28, goalX: 0, goalZ: 0, wait: 1 + rand() * 3, speed: 2.1 };
    for (let i = 0; i < 40; i++) { pickGoal(w, ctx); if (Math.hypot(w.goalX - world.position.x, w.goalZ - world.position.z) > 5) break; }
    w.x = w.goalX; w.z = w.goalZ; pickGoal(w, ctx);
    return { def, w, y: 0, mode: 'wander', modeT: 0, flyY: 0, say: null, moving: false, nextPlan: 4 + rand() * 8, chase: 0, askUntil: 0 };
  };

  // ---- State shared with the game ----
  let visitingBot: string | null = null, busy: string | null = null, giftTimer = 0, clock = 0, pushClock = 0, thinkClock = 2;
  const ready = () => game.botContext();
  const active = () => enabled && !world.networkRole && ![...world.remotePlayers.keys()].some(id => !isBotId(id));

  // ---- Speech bubbles ----
  const bubbles = new Map<string, HTMLDivElement>(), v = new T.Vector3();
  const sayLine = (r: Run, scenario: BotScenario, ms = 4200) => {
    const line = bag.pick(scenario, BOT_LINES[scenario].map(p => p[0]), rand);
    r.say = { text: t(line, { name: player().name, me: botName(r.def) }), until: clock + ms / 1000 };
  };
  const drawBubbles = () => {
    for (const [id, r] of runs) {
      let b = bubbles.get(id); const on = !!r.say && r.say.until > clock && world.remotePlayers.get(id)?.mesh.visible;
      if (!on) { if (b) b.style.display = 'none'; continue; }
      if (!b) { b = el('div', 'bot-bubble'); document.body.append(b); bubbles.set(id, b); }
      const mesh = world.remotePlayers.get(id)!.mesh; v.set(mesh.position.x, mesh.position.y + 2.7 * Math.max(.6, mesh.scale.x), mesh.position.z).project(world.camera);
      const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
      if (v.z > 1 || x < -60 || x > innerWidth + 60 || y < 0 || y > innerHeight) { b.style.display = 'none'; continue; }
      if (b.textContent !== r.say!.text) b.textContent = r.say!.text;
      b.style.display = ''; b.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
    }
  };

  // ---- The request card ----
  const card = el('div', 'bot-card'); card.hidden = true; card.setAttribute('role', 'dialog'); document.body.append(card);
  let cardFor: string | null = null;
  const closeCard = () => { card.hidden = true; cardFor = null; };
  const outfitName = (d: BotDef) => d.gear.disguise ? t(ITEMS[d.gear.disguise]?.name ?? 'Costume') : d.gear.outfit ? t(ITEMS[d.gear.outfit]?.name ?? 'Outfit') : '';
  function openRequest(r: Run) {
    cardFor = r.def.id; card.replaceChildren();
    const title = el('h3', '', `${botName(r.def)} · Lv ${r.def.level}`), text = el('p', '', t('{name} would like to be your friend.', { name: botName(r.def) }));
    const yes = el('button', 'bot-yes', t('Be friends')), no = el('button', 'bot-no', t('Maybe later'));
    yes.onclick = () => accept(r); no.onclick = () => decline(r);
    card.append(title, text, el('div', 'bot-actions')); card.lastElementChild!.append(yes, no); card.hidden = false;
  }
  function decline(r: Run) {
    closeCard(); sayLine(r, 'LATER'); store.meetAfter[r.def.id] = Date.now() + MEET_PAUSE_MS.declined; save(); leave(r);
  }
  function accept(r: Run) {
    closeCard(); const now = Date.now();
    if (!isFriend(store, r.def.id)) befriend(store, r.def, now, owns);
    save(); sayLine(r, 'THANKS', 3200); r.mode = 'talk'; r.modeT = 2.8; r.askUntil = 0;
    giftTimer = 0; // the promised gift follows at once (deliverGifts)
    world.friendIds.add(r.def.id);
  }
  function leave(r: Run) { r.mode = 'wander'; r.modeT = 0; r.w.speed = 2.1; busy = busy === r.def.id ? null : busy; pickGoal(r.w, ctx); r.nextPlan = 5 + rand() * 8; }

  // ---- Gifts ----
  function showGift(def: BotDef, g: GiftNote) {
    const box = el('div', 'bot-gift'); box.setAttribute('role', 'status');
    const icon = g.item && iconPath(g.item) ? Object.assign(el('img', 'bot-gift-icon'), { src: `${import.meta.env.BASE_URL}assets/icons/${iconPath(g.item)}`, alt: '' }) : el('span', 'bot-gift-icon', '🎁');
    const text = el('div'); text.append(el('b', '', t('A gift from {name}', { name: def.name })), el('span', '', g.item ? t(ITEMS[g.item]?.name ?? g.item) : t('{n} energy', { n: g.energy })));
    if (g.item && g.energy) text.append(el('span', 'bot-gift-extra', t('+{n} energy', { n: g.energy })));
    box.append(icon, text); document.body.append(box); setTimeout(() => box.classList.add('leaving'), 5200); setTimeout(() => box.remove(), 5600);
  }
  /** Hands over any gift still waiting in the store. A grant that fails (nothing playing yet, a full bag) is tried again later. */
  function deliverGifts() {
    for (const [id, gift] of Object.entries(store.pending)) {
      const def = cast.find(d => d.id === id); if (!def) { settleGift(store, id, true); save(); continue; }
      if (!ready().ready) return;
      const ok = game.grantGift({ item: gift.item, count: gift.count, energy: gift.energy });
      if (!ok) { settleGift(store, id, false); store.pending[id] = { ...gift, item: undefined, count: 0, energy: Math.max(gift.energy, 300) }; save(); continue; }
      settleGift(store, id, true); save(); showGift(def, gift); const r = runs.get(id); if (r) { sayLine(r, 'GIFT', 5000); }
      return; // one at a time, so each popup is seen
    }
  }

  // ---- Meetings ----
  const playerPos = () => world.position;
  function thinkMeet() {
    if (busy || visitingBot) return;
    const p = playerPos(), c = ready();
    if (!c.ready) return;
    const now = Date.now(), list = [...runs.values()].filter(r => r.mode === 'wander' || r.mode === 'fly').filter(r => canMeet(store, r.def.id, now)).sort((a, b) => (presentReady(store, b.def.id, now) ? 1 : 0) - (presentReady(store, a.def.id, now) ? 1 : 0) || Math.hypot(a.w.x - p.x, a.w.z - p.z) - Math.hypot(b.w.x - p.x, b.w.z - p.z));
    // friends say hello more rarely than strangers ask, and every meeting is worth waiting a little for
    const r = list[0]; if (!r || rand() > .55) return;
    r.mode = 'approach'; r.chase = 0; busy = r.def.id; r.w.speed = r.def.flies ? 6.2 : 3.3;
  }
  function approach(r: Run, dt: number) {
    const p = playerPos(), dx = p.x - r.w.x, dz = p.z - r.w.z, d = Math.hypot(dx, dz);
    r.chase += dt; r.w.goalX = p.x - dx / (d || 1) * 2.1; r.w.goalZ = p.z - dz / (d || 1) * 2.1;
    if (r.def.flies) r.flyY = d > 6 ? FLY_HEIGHT : Math.max(0, (d - 2.4) * .5);
    if (!ready().ready) { leave(r); return; }
    if (d < 3 || r.chase > 18) {
      if (d >= 3) { store.meetAfter[r.def.id] = Date.now() + 60_000; save(); leave(r); return; }
      r.mode = 'talk'; r.modeT = 0; r.flyY = 0; r.w.facing = Math.atan2(dx, dz);
      const friend = isFriend(store, r.def.id);
      sayLine(r, friend ? 'FRIEND' : 'GREET', 3800); r.modeT = 3.2;
    }
  }
  function talk(r: Run, dt: number) {
    const p = playerPos(); r.w.facing = Math.atan2(p.x - r.w.x, p.z - r.w.z);
    r.modeT -= dt; if (r.modeT > 0) return;
    const now = Date.now();
    if (!isFriend(store, r.def.id)) { r.mode = 'ask'; r.askUntil = clock + 30; sayLine(r, 'ASK', 28000); openRequest(r); return; }
    if (presentReady(store, r.def.id, now)) {
      const present = choosePresent(store, owns, rand);
      if (game.grantGift(present)) { schedulePresent(store, r.def.id, now, rand); if (present.item && ITEMS[present.item]?.rare) store.given.push(present.item); save(); showGift(r.def, present); sayLine(r, 'GIFT', 4500); }
    }
    store.meetAfter[r.def.id] = now + MEET_PAUSE_MS.greeted; save(); leave(r);
  }
  function ask(r: Run) {
    const p = playerPos(); r.w.facing = Math.atan2(p.x - r.w.x, p.z - r.w.z);
    if (!ready().ready || Math.hypot(p.x - r.w.x, p.z - r.w.z) > 9 || clock > r.askUntil) { if (cardFor === r.def.id) closeCard(); store.meetAfter[r.def.id] = Date.now() + MEET_PAUSE_MS.spoke; save(); leave(r); }
  }

  // ---- The per-bot step ----
  function step(r: Run, dt: number) {
    const w = r.w, id = r.def.id;
    switch (r.mode) {
      case 'wander': case 'fly': {
        r.nextPlan -= dt;
        if (r.def.flies && r.mode === 'wander' && r.nextPlan <= 0 && rand() < .5 && !visitingBot) { // a flight across the garden
          r.mode = 'fly'; r.modeT = 9 + rand() * 6; w.speed = 6; r.flyY = FLY_HEIGHT; pickGoal(w, ctx); if (rand() < .4) sayLine(r, 'FLYBY', 3000);
        } else if (r.nextPlan <= 0 && r.mode === 'wander') { r.nextPlan = 5 + rand() * 9; if (rand() < .22) sayLine(r, 'WANDER', 3200); }
        if (r.mode === 'fly') { r.modeT -= dt; if (r.modeT <= 0) { r.mode = 'wander'; r.flyY = 0; w.speed = 2.1; r.nextPlan = 8 + rand() * 10; } }
        if (w.wait > 0) { w.wait -= dt; r.moving = false; break; }
        r.moving = walk(w, dt, ctx, r.mode === 'fly');
        if (!r.moving) { w.wait = r.mode === 'fly' ? 0 : 1.5 + rand() * 5; pickGoal(w, ctx); }
        break;
      }
      case 'approach': approach(r, dt); r.moving = walk(w, dt, ctx, r.def.flies); break;
      case 'talk': talk(r, dt); r.moving = false; break;
      case 'ask': ask(r); r.moving = false; break;
    }
    // altitude eases toward the plan; walking bots stay on the ground
    r.y += (r.flyY - r.y) * Math.min(1, dt * 3);
    void id;
  }
  function pose(r: Run): RemotePose {
    const d = r.def, flying = r.y > .4;
    return {
      id: d.id, x: r.w.x, z: r.w.z, y: r.y + (flying ? Math.sin(clock * 2 + d.level) * .12 : 0), facing: r.w.facing, color: d.color, name: d.name, planet: 'home', moving: r.moving || flying,
      gear: d.gear as RemotePose['gear'], level: d.level, hp: 100, visual: flying ? { flight: 1 } : { flight: 0 },
    };
  }

  // ---- House visits ----
  function buildHome(def: BotDef): Partial<M.SaveState> {
    const now = Date.now(), s = M.newGame(def.name), r = seeded(def.level * 7919 + def.name.length);
    s.level = 60; s.energy = 1e9; s.planet = 'home';
    while (s.plots.length < def.house.plots && M.expandGarden(s)) { /* each call places one more bed */ }
    s.plots.forEach((p, i) => {
      const crop = def.house.crops[i % def.house.crops.length], dur = (CROPS[crop]?.duration ?? 3_600_000), seedId = CROPS[crop]?.seed;
      if (seedId) s.bag[seedId] = (s.bag[seedId] || 0) + 1;
      M.plant(s, i, crop, now - Math.floor(dur * (.2 + r() * 1.3)));
    });
    if (def.house.animals.length && F.buildPen(s)) {
      const kinds = [...new Set(def.house.animals)];
      if (def.tier === 'rich') { F.expandPen(s); F.expandPen(s); }
      for (const kind of kinds) F.buildSpeciesPen(s, kind, now);
      for (const kind of def.house.animals) F.buyAnimal(s, kind, now - Math.floor((.05 + r() * .9) * 3_600_000));
    }
    const spots: Array<[number, number]> = [[-6, 9], [6, 9], [-12, 6], [12, 6], [0, 13], [-9, 12], [9, 12]];
    def.house.decor.forEach((id, i) => { s.bag[id] = (s.bag[id] || 0) + 1; for (let k = 0; k < spots.length; k++) { const [x, z] = spots[(i + k) % spots.length]; if (M.placeDecoration(s, id, x, z, r() * 6)) break; } });
    return { name: def.name, discovered: ['home'], plots: s.plots, decorations: s.decorations, farm: s.farm } as Partial<M.SaveState>;
  }
  function visit(def: BotDef) {
    if (!isFriend(store, def.id)) return;
    visitingBot = def.id; busy = def.id; closeCard();
    game.setVisiting(def.name, buildHome(def));
    for (const [id, r] of runs) if (id !== def.id) world.removeRemotePlayer(id); else { r.mode = 'wander'; r.w.x = 4; r.w.z = 4; pickGoal(r.w, ctx); }
    showLeave(def);
  }
  const leaveBtn = el('button', 'bot-leave'); leaveBtn.hidden = true; document.body.append(leaveBtn);
  function showLeave(def: BotDef) {
    leaveBtn.textContent = t('Leave {name}\'s garden', { name: def.name }); leaveBtn.hidden = false;
    leaveBtn.onclick = () => { leaveBtn.hidden = true; visitingBot = null; busy = null; game.setVisiting(null); for (const r of runs.values()) r.w.facing = 0; };
  }

  // ---- The neighbours panel ----
  const dialog = el('dialog', 'social-dialog bot-dialog'); dialog.setAttribute('aria-label', t('Neighbours')); document.body.append(dialog);
  function renderPanel() {
    dialog.replaceChildren();
    const header = el('header', 'social-header'), close = el('button', 'social-close', '✕'); close.setAttribute('aria-label', t('Close')); close.onclick = () => dialog.close();
    header.append(el('h2', '', `🏘️ ${t('Neighbours')}`), close);
    const body = el('div', 'social-content bot-list');
    const toggle = el('label', 'bot-toggle'), box = el('input'); box.type = 'checkbox'; box.checked = enabled; box.onchange = () => { enabled = box.checked; write(ENABLED_KEY, enabled ? '1' : '0'); renderPanel(); };
    toggle.append(box, document.createTextNode(' ' + t('Show AI neighbours in my garden')));
    body.append(el('p', 'social-small', t('Friendly neighbours walk around your garden. Some are rich and wear rare outfits; become friends and they send gifts and let you visit their gardens.')), toggle);
    for (const d of cast) {
      const row = el('section', 'bot-row'), friend = isFriend(store, d.id);
      const info = el('div', 'bot-info'); info.append(el('b', '', `${friend ? '💚 ' : ''}${d.name} · Lv ${d.level}`), el('span', 'social-small', `${d.tier === 'rich' ? '💎 ' : ''}${outfitName(d)}${d.flies ? ' · ' + t('flies') : ''}`));
      const visitBtn = el('button', '', t('Visit garden')); visitBtn.disabled = !friend || !!visitingBot; visitBtn.title = friend ? '' : t('Become friends first.');
      visitBtn.onclick = () => { dialog.close(); visit(d); };
      row.append(info, visitBtn); body.append(row);
    }
    dialog.append(header, body);
  }
  const slot = document.querySelector('#social-slot');
  const panelBtn = el('button', 'social-toggle bot-open', `🏘️ ${t('Neighbours')}`); panelBtn.id = 'neighbours-button';
  panelBtn.onclick = () => { renderPanel(); dialog.showModal(); };
  if (slot) { slot.append(panelBtn); panelBtn.classList.add('social-inline-toggle'); } else document.body.append(panelBtn);

  // ---- Clicking a neighbour ----
  const previousClick = world.onRemotePlayerClick;
  world.onRemotePlayerClick = id => {
    if (!isBotId(id)) { previousClick?.(id); return; }
    const r = runs.get(id); if (!r) return;
    if (!isFriend(store, id) && !busy && ready().ready) { r.mode = 'approach'; r.chase = 0; busy = id; r.w.speed = r.def.flies ? 6.2 : 3.3; return; }
    renderPanel(); dialog.showModal();
  };

  // ---- Every frame ----
  game.onFrame(dt => {
    clock += Math.min(.1, dt);
    const on = active();
    if (!on) { for (const id of [...runs.keys()]) { world.removeRemotePlayer(id); bubbles.get(id)?.remove(); bubbles.delete(id); } runs.clear(); busy = null; closeCard(); leaveBtn.hidden = true; visitingBot = null; panelBtn.hidden = !enabled || !!world.networkRole; return; }
    panelBtn.hidden = false;
    for (const d of cast) {
      if (visitingBot && d.id !== visitingBot) continue;
      if (!runs.has(d.id)) runs.set(d.id, spawn(d));
    }
    for (const id of [...runs.keys()]) if (visitingBot && id !== visitingBot) { world.removeRemotePlayer(id); runs.delete(id); }
    const d = Math.min(.1, dt);
    for (const r of runs.values()) step(r, d);
    pushClock -= d; if (pushClock <= 0) { pushClock = 1 / 12; for (const [id, r] of runs) { const p = pose(r); if (world.remotePlayers.has(id)) world.updateRemotePlayer(id, p); else world.addRemotePlayer(id, p); } }
    for (const id of Object.keys(store.friends)) world.friendIds.add(id);
    thinkClock -= d; if (thinkClock <= 0) { thinkClock = 3; if (!visitingBot) thinkMeet(); }
    giftTimer -= d; if (giftTimer <= 0) { giftTimer = 1.5; deliverGifts(); }
    drawBubbles();
  });
  return { cast, store: () => store, accept: (id: string) => { const r = runs.get(id); if (r) accept(r); }, runs };
}
export type NeighbourApi = ReturnType<typeof initBots>;
void BOT_ID_PREFIX; void newStore;
