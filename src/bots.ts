import * as T from 'three';
import * as M from './model.ts';
import * as F from './farm.ts';
import { CROPS, ITEMS } from './content.ts';
import { t } from './i18n.ts';
import { TalkBag } from './house-talk.ts';
import { BOT_LINES, type BotScenario } from './bot-lines.ts';
import { iconPath } from './item-icons.ts';
import { replyTo } from './bot-chat.ts';
import type { GameBridge } from './game-bridge.ts';
import type { RemotePose } from './world.ts';
import {
  BOT_ID_PREFIX, MEET_PAUSE_MS, SAFE_RADIUS, ZONE_RADIUS, attackDamage, huntFor, restFor, visitStay, befriend, canMeet, choosePresent, gateRoute, givesPresent, inSafeZone, isBotId, isFriend, makeCast, newStore, nextVisitIn, parseStore, pickFoe, pickGoal, seeded, settleGift, walk, zoneOf,
  type BotDef, type BotStore, type GiftNote, type WalkCtx, type Walker, type Zone,
} from './bot-logic.ts';
import './bots.css';

/**
 * AI neighbours for solo play: a few made-up explorers live in the common area beyond the four gates, fighting the enemies there (you meet them
 * out there). Friends sometimes walk through a gate into your safe zone to visit your house, and stay a minute or so. A few made-up explorers share the garden with you (drawn by the same code as other players,
 * with a name and level above their heads), each with a house you can visit once you are friends. Some are rich and wear
 * rare outfits; the ones who can fly cross the sky now and then. Now and then one walks up, says something kind and asks to be
 * friends; when you say yes they give you a rare gift. They only exist while you play offline, never next to real players.
 *
 * The gift is promised in the same step as the friendship (bot-logic befriend) and kept in the saved store until the bag has
 * it, so closing the page, a full bag or a visit in progress can delay it but never lose it.
 */
const STORE_KEY = 'cute-game-neighbours-v1', ENABLED_KEY = 'cute-game-neighbours-on', COUNT = 5;
const AREA = { radius: 13, centre: { x: 0, z: 2 } }; // where a visiting friend wanders: inside the safe zone
const FLY_HEIGHT = 3.1, GATE_EXIT = 19.5;
type Mode = 'wander' | 'approach' | 'talk' | 'ask' | 'fly' | 'commute' | 'rest';
/** `zone`: out in the common area, fighting. `garden`: a friend visiting your safe zone. */
type Place = 'zone' | 'garden';
interface Run {
  def: BotDef; w: Walker; y: number; mode: Mode; modeT: number; flyY: number; say: { text: string; until: number } | null;
  moving: boolean; nextPlan: number; chase: number; askUntil: number;
  huntUntil: number; restUntil: number; hidden: boolean;
  place: Place; zone: Zone; /** Clock time of the next trip into the safe zone (friends) and when the visit ends. */ visitAt: number; stayUntil: number;
  foe: { id: string; x: number; z: number; hp: number } | null; foeT: number; swing: number; route: Array<{ x: number; z: number }>; commuteTo: Place;
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
  const blocked = (x: number, z: number) => world.blocked(x, z);
  const gardenCtx: WalkCtx = { blocked, rand, radius: AREA.radius, centre: AREA.centre };
  const zoneCtxs = new Map<string, WalkCtx>();
  const ctxOf = (r: Run): WalkCtx => {
    if (r.place === 'garden') return gardenCtx;
    let c = zoneCtxs.get(r.zone.id); if (!c) zoneCtxs.set(r.zone.id, c = { blocked, rand, radius: ZONE_RADIUS - 3, centre: { x: r.zone.x, z: r.zone.z } });
    return c;
  };
  const spawn = (def: BotDef): Run => {
    const w: Walker = { x: 0, z: 0, facing: rand() * 6.28, goalX: 0, goalZ: 0, wait: 1 + rand() * 3, speed: 2.1 }, zone = zoneOf(def);
    const r: Run = { def, w, y: 0, mode: 'wander', modeT: 0, flyY: 0, say: null, moving: false, nextPlan: 4 + rand() * 8, chase: 0, askUntil: 0, place: 'zone', zone, huntUntil: 0, restUntil: 0, hidden: false, visitAt: 0, stayUntil: 0, foe: null, foeT: 0, swing: 0, route: [], commuteTo: 'zone' };
    placeInZone(r); r.huntUntil = clock + 60 + rand() * 120; r.visitAt = clock + 60 + nextVisitIn(rand);
    if (rand() < .5) { r.mode = 'rest'; r.hidden = true; r.restUntil = clock + rand() * restFor(rand); } // about half are away resting when the game starts
    return r;
  };
  /** Puts a neighbour at a free spot in its hunting ground. */
  function placeInZone(r: Run) { r.place = 'zone'; const c = ctxOf(r); pickGoal(r.w, c); r.w.x = r.w.goalX; r.w.z = r.w.goalZ; pickGoal(r.w, c); r.mode = 'wander'; r.flyY = 0; r.y = 0; r.foe = null; r.route = []; r.hidden = false; }

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
  function leave(r: Run) { r.mode = 'wander'; r.modeT = 0; r.w.speed = 2.1; r.flyY = 0; busy = busy === r.def.id ? null : busy; pickGoal(r.w, ctxOf(r)); r.nextPlan = 5 + rand() * 8; }

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
    // Strangers are met out in the common area only: they stay out there, so the player must be beyond the gates and close by.
    const now = Date.now(), outside = !inSafeZone(p.x, p.z), meetable = (r: Run) => !r.hidden && (r.mode === 'wander' || r.mode === 'fly') && (r.place === 'garden' ? !outside : outside && Math.hypot(r.w.x - p.x, r.w.z - p.z) < 22);
    const list = [...runs.values()].filter(meetable).filter(r => canMeet(store, r.def.id, now)).sort((a, b) => Math.hypot(a.w.x - p.x, a.w.z - p.z) - Math.hypot(b.w.x - p.x, b.w.z - p.z));
    // friends say hello more rarely than strangers ask, and every meeting is worth waiting a little for
    const r = list[0]; if (!r || rand() > .55) return;
    r.mode = 'approach'; r.chase = 0; busy = r.def.id; r.w.speed = r.def.flies ? 6.2 : 3.3;
  }
  function approach(r: Run, dt: number) {
    const p = playerPos(), dx = p.x - r.w.x, dz = p.z - r.w.z, d = Math.hypot(dx, dz);
    r.chase += dt; r.w.goalX = p.x - dx / (d || 1) * 2.1; r.w.goalZ = p.z - dz / (d || 1) * 2.1;
    if (r.def.flies) r.flyY = d > 6 ? FLY_HEIGHT : Math.max(0, (d - 2.4) * .5);
    if (!ready().ready || (r.place === 'zone' && inSafeZone(p.x, p.z))) { leave(r); return; } // (a stranger never follows you through the gate)
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
    if (givesPresent(store, r.def.id, rand)) {
      const present = choosePresent(store, owns, rand);
      if (game.grantGift(present)) { if (present.item && ITEMS[present.item]?.rare) store.given.push(present.item); save(); showGift(r.def, present); sayLine(r, 'GIFT', 4500); }
    }
    store.meetAfter[r.def.id] = now + MEET_PAUSE_MS.greeted; save(); leave(r);
  }
  function ask(r: Run) {
    const p = playerPos(); r.w.facing = Math.atan2(p.x - r.w.x, p.z - r.w.z);
    if (!ready().ready || Math.hypot(p.x - r.w.x, p.z - r.w.z) > 9 || clock > r.askUntil) { if (cardFor === r.def.id) closeCard(); store.meetAfter[r.def.id] = Date.now() + MEET_PAUSE_MS.spoke; save(); leave(r); }
  }

  // ---- The per-bot step ----
  /** Out in the common area a neighbour hunts the nearest enemy (a gentle blow every second or so) and wanders when there is none. */
  function hunt(r: Run, dt: number) {
    const w = r.w, c = ctxOf(r); r.foeT -= dt; r.swing = Math.max(0, r.swing - dt);
    if (r.foe && (r.foe.hp <= 0 || !world.enemies.some(e => e.id === r.foe!.id && e.hp > 0))) r.foe = null;
    if (!r.foe && r.foeT <= 0) { r.foeT = .8 + rand() * .6; const f = pickFoe(world.enemies, w, r.zone); r.foe = f ? { id: f.id, x: f.x, z: f.z, hp: f.hp } : null; }
    const foe = r.foe ? world.enemies.find(e => e.id === r.foe!.id) : null;
    if (foe && foe.hp > 0) {
      const dx = foe.x - w.x, dz = foe.z - w.z, d = Math.hypot(dx, dz);
      if (d > 2.4) { w.goalX = foe.x - dx / d * 1.9; w.goalZ = foe.z - dz / d * 1.9; w.speed = 3.2; r.moving = walk(w, dt, c, false); return; }
      w.facing = Math.atan2(dx, dz); r.moving = false;
      if (r.foeT <= 0) { r.foeT = .9 + rand() * .5; r.swing = .3; game.applyRemoteHit(foe.id, attackDamage(r.def.level), 0); world.burst(foe.x, foe.z, r.def.color, 6); }
      return;
    }
    w.speed = 2.4;
    if (w.wait > 0) { w.wait -= dt; r.moving = false; return; }
    r.moving = walk(w, dt, c, false);
    if (!r.moving) { w.wait = 1 + rand() * 3; pickGoal(w, c); }
  }
  /** Starts the walk through a gate: into the safe zone (a friend's visit) or back out to the hunting ground. */
  function commute(r: Run, to: Place) {
    r.mode = 'commute'; r.commuteTo = to; r.foe = null; busy = null;
    r.route = to === 'garden' ? [...gateRoute(r.zone, true), { x: AREA.centre.x * .6 + (rand() - .5) * 6, z: AREA.centre.z * .6 + (rand() - .5) * 6 }] : [...gateRoute(r.zone, false), { x: r.zone.x, z: r.zone.z }];
    r.w.speed = r.def.flies ? 6 : 3.4; r.flyY = r.def.flies ? FLY_HEIGHT : 0;
  }
  function step(r: Run, dt: number) {
    const w = r.w;
    switch (r.mode) {
      case 'wander': case 'fly': {
        r.nextPlan -= dt;
        if (r.place === 'zone') {
          if (r.mode === 'fly') { r.modeT -= dt; if (r.modeT <= 0) { r.mode = 'wander'; r.flyY = 0; w.speed = 2.4; } r.moving = walk(w, dt, ctxOf(r), true); if (!r.moving) pickGoal(w, ctxOf(r)); break; }
          if (r.nextPlan <= 0) { r.nextPlan = 6 + rand() * 9; if (rand() < .2) sayLine(r, 'WANDER', 3200); else if (r.def.flies && !r.foe && rand() < .25) { r.mode = 'fly'; r.modeT = 7 + rand() * 5; w.speed = 5.5; r.flyY = FLY_HEIGHT; pickGoal(w, ctxOf(r)); if (rand() < .4) sayLine(r, 'FLYBY', 3000); } }
          hunt(r, dt);
          if (clock > r.huntUntil && !busy && !r.foe && r.mode === 'wander') { // back to its own safe zone for a rest: it walks away and is gone for a while
            const k = 1 + 16 / Math.max(1, Math.hypot(r.zone.x, r.zone.z)); r.mode = 'rest'; r.route = [{ x: r.zone.x * k, z: r.zone.z * k }]; w.speed = 3; sayLine(r, 'WANDER', 2500);
          }
          // a friend now and then walks into the safe zone to visit the player's house (only while the player is there)
          if (isFriend(store, r.def.id) && clock >= r.visitAt && !busy && !visitingBot && r.mode === 'wander' && !r.foe) {
            const p = playerPos(), c = ready();
            if (c.ready && inSafeZone(p.x, p.z)) { commute(r, 'garden'); r.stayUntil = 0; sayLine(r, 'FRIEND', 3000); } else r.visitAt = clock + 20;
          }
        } else { // visiting the safe zone
          if (r.mode === 'fly') { r.modeT -= dt; if (r.modeT <= 0) { r.mode = 'wander'; r.flyY = 0; w.speed = 2.1; } }
          else if (r.nextPlan <= 0) { r.nextPlan = 5 + rand() * 9; if (rand() < .3) sayLine(r, 'WANDER', 3200); else if (r.def.flies && rand() < .3) { r.mode = 'fly'; r.modeT = 6 + rand() * 4; w.speed = 6; r.flyY = FLY_HEIGHT; pickGoal(w, gardenCtx); } }
          if (clock > r.stayUntil && !busy) { commute(r, 'zone'); break; }
          if (w.wait > 0) { w.wait -= dt; r.moving = false; break; }
          r.moving = walk(w, dt, gardenCtx, r.mode === 'fly');
          if (!r.moving) { w.wait = r.mode === 'fly' ? 0 : 1.5 + rand() * 4; pickGoal(w, gardenCtx); }
        }
        break;
      }
      case 'commute': {
        const next = r.route[0];
        if (!next) { // arrived
          r.flyY = 0; w.speed = 2.1; r.mode = 'wander';
          if (r.commuteTo === 'garden') { r.place = 'garden'; r.stayUntil = clock + visitStay(rand); pickGoal(w, gardenCtx); }
          else { r.place = 'zone'; r.visitAt = clock + nextVisitIn(rand); pickGoal(w, ctxOf(r)); }
          break;
        }
        w.goalX = next.x; w.goalZ = next.z; r.moving = walk(w, dt, gardenCtx, true);
        if (Math.hypot(next.x - w.x, next.z - w.z) < .6) r.route.shift();
        break;
      }
      case 'rest': {
        if (!r.hidden) {
          const next = r.route[0]; if (next) { w.goalX = next.x; w.goalZ = next.z; r.moving = walk(w, dt, gardenCtx, true); if (Math.hypot(next.x - w.x, next.z - w.z) < .8) r.route.shift(); }
          else { r.hidden = true; r.restUntil = clock + restFor(rand); r.moving = false; world.removeRemotePlayer(r.def.id); }
        } else if (clock > r.restUntil) { r.hidden = false; placeInZone(r); r.huntUntil = clock + huntFor(rand); }
        break;
      }
      case 'approach': approach(r, dt); r.moving = walk(w, dt, ctxOf(r), r.def.flies); break;
      case 'talk': talk(r, dt); r.moving = false; break;
      case 'ask': ask(r); r.moving = false; break;
    }
    // altitude eases toward the plan; walking bots stay on the ground
    r.y += (r.flyY - r.y) * Math.min(1, dt * 3);
  }
  function pose(r: Run): RemotePose {
    const d = r.def, flying = r.y > .4;
    return {
      id: d.id, x: r.w.x, z: r.w.z, y: r.y + (flying ? Math.sin(clock * 2 + d.level) * .12 : 0) + (r.swing > 0 ? Math.sin(r.swing / .3 * Math.PI) * .25 : 0), facing: r.w.facing, color: d.color, name: d.name, planet: 'home', moving: r.moving || flying || r.swing > 0,
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
    for (const [id, r] of runs) if (id !== def.id) world.removeRemotePlayer(id); else { r.place = 'garden'; r.mode = 'wander'; r.stayUntil = clock + 1e9; r.flyY = 0; r.w.x = 4; r.w.z = 4; pickGoal(r.w, gardenCtx); }
    showLeave(def);
  }
  const leaveBtn = el('button', 'bot-leave'); leaveBtn.hidden = true; document.body.append(leaveBtn);
  function showLeave(def: BotDef) {
    leaveBtn.textContent = t('Leave {name}\'s garden', { name: def.name }); leaveBtn.hidden = false;
    leaveBtn.onclick = endVisit;
  }
  /** Back to your own garden: from the button, or by walking out of a gate (the wild beyond belongs to you, and so does the way home). */
  function endVisit() {
    if (!visitingBot) return;
    leaveBtn.hidden = true; visitingBot = null; busy = null; game.setVisiting(null); for (const r of runs.values()) { r.w.facing = 0; placeInZone(r); r.visitAt = clock + nextVisitIn(rand); }
  }

  // ---- The neighbours panel ----
  const dialog = el('dialog', 'social-dialog bot-dialog'); dialog.setAttribute('aria-label', t('Neighbours')); document.body.append(dialog);
  // ---- The message box ----
  const logs = new Map<string, Array<{ me: boolean; text: string }>>(); let chatWith: BotDef | null = null, draft = '';
  function renderChat(d: BotDef) {
    chatWith = d; dialog.replaceChildren();
    const header = el('header', 'social-header'), close = el('button', 'social-close', '✕'); close.setAttribute('aria-label', t('Close')); close.onclick = () => { chatWith = null; dialog.close(); };
    const back = el('button', 'bot-back', '‹ ' + t('Back')); back.onclick = () => { chatWith = null; renderPanel(); };
    header.append(back, el('h2', '', `${isFriend(store, d.id) ? '💚 ' : ''}${d.name} · Lv ${d.level}`), close);
    const body = el('div', 'social-content bot-chat'), log = el('div', 'bot-log'), form = el('form', 'bot-form'), input = el('input'), send = el('button', 'bot-send', t('Send'));
    input.type = 'text'; input.maxLength = 160; input.placeholder = t('Type a message…'); input.value = draft; input.autocomplete = 'off'; input.setAttribute('aria-label', t('Message'));
    input.oninput = () => { draft = input.value; }; send.type = 'submit';
    const lines = logs.get(d.id) ?? (logs.set(d.id, [{ me: false, text: t('Hello, {name}! So nice to hear from you.', { name: player().name }) }]), logs.get(d.id)!);
    for (const m of lines) log.append(el('p', m.me ? 'bot-msg me' : 'bot-msg', m.text));
    form.onsubmit = event => {
      event.preventDefault(); const text = input.value.trim().slice(0, 160); if (!text) return;
      input.value = ''; draft = ''; lines.push({ me: true, text }); log.append(el('p', 'bot-msg me', text)); log.scrollTop = log.scrollHeight;
      const typing = el('p', 'bot-msg typing', '…'); log.append(typing); log.scrollTop = log.scrollHeight;
      const reply = replyTo(text, d, isFriend(store, d.id), { pick: (key, pool) => bag.pick(key, pool, rand), rand });
      window.setTimeout(() => {
        const out = t(reply, { name: player().name, me: d.name, level: d.level }); lines.push({ me: false, text: out }); if (lines.length > 40) lines.splice(0, lines.length - 40);
        typing.remove(); if (chatWith === d && dialog.open) { log.append(el('p', 'bot-msg', out)); log.scrollTop = log.scrollHeight; }
        const r = runs.get(d.id); if (r) r.say = { text: out, until: clock + 5 };
      }, 500 + rand() * 700);
    };
    form.append(input, send); body.append(log, form); dialog.append(header, body); log.scrollTop = log.scrollHeight;
  }
  function renderPanel() {
    chatWith = null; dialog.replaceChildren();
    const header = el('header', 'social-header'), close = el('button', 'social-close', '✕'); close.setAttribute('aria-label', t('Close')); close.onclick = () => dialog.close();
    header.append(el('h2', '', `🏘️ ${t('Neighbours')}`), close);
    const body = el('div', 'social-content bot-list');
    const toggle = el('label', 'bot-toggle'), box = el('input'); box.type = 'checkbox'; box.checked = enabled; box.onchange = () => { enabled = box.checked; write(ENABLED_KEY, enabled ? '1' : '0'); renderPanel(); };
    toggle.append(box, document.createTextNode(' ' + t('Show AI neighbours')));
    body.append(el('p', 'social-small', t('Neighbours fight enemies in the wild beyond the four gates, so go out and meet them there. Some are rich and wear rare outfits. Become friends and they give you gifts, let you visit their gardens, and sometimes walk in through a gate to visit yours.')), toggle);
    for (const d of cast) {
      const row = el('section', 'bot-row'), friend = isFriend(store, d.id);
      const info = el('div', 'bot-info'); info.append(el('b', '', `${friend ? '💚 ' : ''}${d.name} · Lv ${d.level}`), el('span', 'social-small', `${d.tier === 'rich' ? '💎 ' : ''}${outfitName(d)}${d.flies ? ' · ' + t('flies') : ''}`));
      const visitBtn = el('button', '', t('Visit garden')); visitBtn.disabled = !friend || !!visitingBot; visitBtn.title = friend ? '' : t('Become friends first.');
      visitBtn.onclick = () => { dialog.close(); visit(d); };
      const chatBtn = el('button', '', `💬 ${t('Chat')}`); chatBtn.onclick = () => renderChat(d);
      const acts = el('div', 'bot-acts'); acts.append(chatBtn, visitBtn); row.append(info, acts); body.append(row);
    }
    dialog.append(header, body);
  }
  const slot = document.querySelector('#social-slot');
  const panelBtn = el('button', 'social-toggle bot-open', '🏘️'); panelBtn.id = 'neighbours-button'; panelBtn.title = t('Neighbours'); panelBtn.setAttribute('aria-label', t('Neighbours'));
  panelBtn.onclick = () => { renderPanel(); dialog.showModal(); };
  if (slot) { slot.append(panelBtn); panelBtn.classList.add('social-inline-toggle'); } else document.body.append(panelBtn);

  // ---- Clicking a neighbour ----
  const previousClick = world.onRemotePlayerClick;
  world.onRemotePlayerClick = id => {
    if (!isBotId(id)) { previousClick?.(id); return; }
    const r = runs.get(id); if (!r) return;
    if (!isFriend(store, id) && !busy && ready().ready) { r.mode = 'approach'; r.chase = 0; busy = id; r.w.speed = r.def.flies ? 6.2 : 3.3; return; }
    const d = cast.find(b => b.id === id); if (d) { renderChat(d); dialog.showModal(); }
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
    // Through any of the four gates (18 m out) is the wild, with its enemies; returning through the gate lands you in your own safe zone.
    if (visitingBot && Math.hypot(world.position.x, world.position.z) > GATE_EXIT) { endVisit(); game.showNotice(t('You left through the gate. Your own garden is waiting when you come back.')); return; }
    for (const r of runs.values()) step(r, d);
    pushClock -= d; if (pushClock <= 0) { pushClock = 1 / 12; for (const [id, r] of runs) { if (r.hidden) continue; const p = pose(r); if (world.remotePlayers.has(id)) world.updateRemotePlayer(id, p); else world.addRemotePlayer(id, p); } }
    for (const id of Object.keys(store.friends)) world.friendIds.add(id);
    thinkClock -= d; if (thinkClock <= 0) { thinkClock = 3; if (!visitingBot) thinkMeet(); }
    giftTimer -= d; if (giftTimer <= 0) { giftTimer = 1.5; deliverGifts(); }
    drawBubbles();
  });
  return { cast, store: () => store, accept: (id: string) => { const r = runs.get(id); if (r) accept(r); }, runs };
}
export type NeighbourApi = ReturnType<typeof initBots>;
void BOT_ID_PREFIX; void newStore;
