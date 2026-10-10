/**
 * The Multiworld Gate and Flag Rush at runtime: Gatekeeper Orrin and the gate by the south gate, the mode picker, and a
 * Capture the Flag match against an AI team on Flag Rush Isle. Rules live in ctf-rules.ts (a pure, serialisable match
 * state meant to move to the server later), bots in ctf-ai.ts, numbers in ctf-content.ts, art in ctf-view.ts.
 *
 * Like the Delvers' Vault, the isle is built far out on the home map (the canyon corner): entering sets the village's
 * scene objects, entities, creatures and obstacles aside and puts the isle in their place; leaving puts them back.
 *
 * The explorer plays their real disguise kit (combat.ts) as the chosen hero: the hero is worn for the match only (never
 * saved; a reload mid-match restores the explorer's own disguise and health). Everyone plays at level 8: the explorer's
 * hits on bots are measured in multiples of their own attack and land as a level-8 hero's, and bots' hits take the same
 * share of the explorer's health as of a level-8 hero's. Teammates are the explorer's AI neighbours (bots.ts) and the
 * other team comes from bot-logic.ts makeCast. Online rooms are not open yet: the picker shows them as coming soon.
 */
import { assetUrl } from './asset-url.ts';
import * as T from 'three';
import './ctf.css';
import type { World, Enemy, Entity, RemotePose } from './world.ts';
import type { SaveState } from './model.ts';
import { t } from './i18n.ts';
import { DISGUISES } from './content.ts';
import { makeCast } from './bot-logic.ts';
import { CTF, FIELD, HEROES, HERO_IDS, POWERS, heroStats, type PowerKind, type TeamId } from './ctf-content.ts';
import { createMatch, stepMatch, canAct, movePlayer, playerHit, setImmune, fieldObstacles, forfeit, rewardFor, jumpLift, player as rulesPlayer, otherTeam, type CtfMatch, type CtfEvent, type CtfPlayer, type RosterEntry } from './ctf-rules.ts';
import { stepPractice, newMinds, pickHeroes, type BotMinds } from './ctf-ai.ts';
import { CTF_REWARD } from './ctf-rules.ts';
import { rewardedLeft } from './ctf-claim.ts';
import { ctfKit, buildGate, buildKeeper, buildArena, buildPower, StrikeMarks, Shots, TEAM_COLORS, powerIcon, type ArenaParts } from './ctf-view.ts';

interface Neighbour { id: string; name: string; level: number; color: string; gear: Record<string, string | undefined>; pets: string[] }
export interface CtfHooks {
  world: World; state: () => SaveState; started: () => boolean; blocked: () => boolean; visiting: () => boolean; online: () => boolean;
  perform: <R = unknown>(type: string, payload: Record<string, unknown>, quiet?: boolean) => Promise<R | undefined>;
  toast: (message: string, icon?: string) => void; tone: (kind: string) => void;
  openDialog: (type: string, title: string, body: string, kicker?: string, icon?: string) => void; closeDialog: () => void;
  neighbours: () => { cast: readonly Neighbour[] } | null;
  attack: () => number; maxHp: () => number; updateHud: () => void; refreshPlayer: () => void;
  onFrame: (listener: (dt: number) => void) => void;
}
/** Where things stand: the gate and keeper by the south gate (village coordinates), the isle far out in the canyon corner. */
export const GATE = { gate: { x: -12, z: 29 }, keeper: { x: -6.8, z: 24 }, isle: { x: 84, z: -104 } } as const;
const C = GATE.isle, ME = 'me';
const RESTORE_KEY = 'zoo-ctf-restore';
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const teamName = (team: TeamId) => t(team === 0 ? 'blue' : 'red');
const heroIcon = (id: string) => assetUrl(`icons/items/${id}.webp`);
const heroName = (id: string) => t(DISGUISES[id]?.name ?? id);

interface Bot { id: string; def: { name: string; color: string; gear: Record<string, string | undefined> }; team: TeamId; proxy: Enemy | null; shown: boolean }
interface Session {
  m: CtfMatch; minds: BotMinds; arena: ArenaParts; marks: StrikeMarks; shots: Shots; obstacles: Array<{ x: number; z: number; r: number }>;
  bots: Bot[]; hero: string; team: TeamId;
  saved: { root: T.Group; entities: Entity[]; enemies: Enemy[]; obstacles: World['obstacles']; detached: T.Object3D[]; background: T.Scene['background']; fog: T.Scene['fog']; onZone: World['onZone']; onStep: World['onStep']; beforeRender: World['beforeRender']; onRemotePlayerClick: World['onRemotePlayerClick']; hp: number; disguise: string | undefined; zoom: number };
  last: { x: number; z: number }; hpWritten: number; frozen: { x: number; z: number } | null; ended: boolean; claimed: boolean; claim: { xp: number; left: number } | null;
  feed: Array<{ html: string; t: number }>; speedBase: number; powerShown: Array<PowerKind | null>; pendingHits: CtfEvent[];
}

export function initCtf(h: CtfHooks) {
  const world = h.world;
  let session: Session | null = null, keeper: Entity | null = null, gateMesh: T.Group | null = null, gateEntity: Entity | null = null;
  let view: 'modes' | 'setup' = 'modes', size = 3, hero = 'dz_knight', lastResult: { winner: TeamId | -1; reason: string } | null = null, sayT = 0, said = false, restored = false, lastClaim: { xp: number; left: number } | null = null;

  // ---------------------------------------------------------------- DOM
  const hud = div('ctf-hud'), feed = div('ctf-feed'), down = div('ctf-down'), tags = div('ctf-tags'), keeperTag = div('ctf-keeper-tag'), bubble = div('ctf-say');
  hud.setAttribute('role', 'status'); hud.hidden = feed.hidden = down.hidden = tags.hidden = keeperTag.hidden = bubble.hidden = true;
  function div(id: string) { const el = document.createElement('div'); el.id = id; document.body.append(el); return el; }
  document.addEventListener('click', event => { if (session && (event.target as HTMLElement).closest?.('[data-action="return-home"]')) { event.preventDefault(); event.stopImmediatePropagation(); confirmLeave(); } }, true);
  document.addEventListener('click', event => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-ctf]'); if (!el) return;
    const what = el.dataset.ctf!;
    if (what === 'mode-ctf') { view = 'setup'; openGate(); }
    else if (what === 'modes') { view = 'modes'; openGate(); }
    else if (what === 'size') { size = Number(el.dataset.size) || 3; openGate(); }
    else if (what === 'hero') { hero = el.dataset.hero && HEROES[el.dataset.hero] ? el.dataset.hero : hero; openGate(); }
    else if (what === 'start') { h.closeDialog(); start(size, hero); }
    else if (what === 'leave') confirmLeave();
    else if (what === 'leave-yes') { h.closeDialog(); leave(); }
    else if (what === 'close') h.closeDialog();
    else if (what === 'again') { h.closeDialog(); const s = session; if (s) exit(); start(size, hero); }
    else if (what === 'home') { h.closeDialog(); exit(); }
  });

  // ---------------------------------------------------------------- home: the gate and Gatekeeper Orrin
  function decorateHome() {
    keeper = null; gateMesh = null; gateEntity = null;
    if (world.planet !== 'home' || session) return;
    const G = GATE.gate, K = GATE.keeper, inWay = (p: { x: number; z: number }) => Math.hypot(p.x - G.x, p.z - G.z) < 3.4 || Math.hypot(p.x - K.x, p.z - K.z) < 1.8;
    const kept = world.decor.filter(p => !inWay(p));
    if (kept.length !== world.decor.length) { world.decor = kept; world.obstacles = world.obstacles.filter(o => !inWay(o)); world.refreshScenery(); }
    const model = buildKeeper(); model.rotation.y = .6;
    keeper = world.addEntity('ctf-keeper', 'Gatekeeper Orrin', '🌀', model, K.x, K.z, 1.1); world.obstacle(K.x, K.z, .55);
    gateMesh = buildGate(); gateMesh.rotation.y = .35;
    gateEntity = world.addEntity('ctf-gate', 'Multiworld Gate', '🌀', gateMesh, G.x, G.z, 2.4);
    for (const s of [-1, 1]) world.obstacle(G.x + Math.cos(.35) * 1.8 * s, G.z - Math.sin(.35) * 1.8 * s, .7);
  }
  const previousBuilt = world.onBuilt; world.onBuilt = () => { previousBuilt?.(); decorateHome(); };
  decorateHome();
  let kitHooked = false;
  const requestKit = () => { if (!kitHooked) { kitHooked = true; void ctfKit.load().then(onKit); } };
  function onKit() {
    if (!ctfKit.ready || session || world.planet !== 'home') return;
    if (keeper) { const fresh = buildKeeper(); keeper.mesh.clear(); keeper.mesh.add(...fresh.children); }
    if (gateMesh && gateEntity) { const fresh = buildGate(); gateMesh.clear(); gateMesh.add(...fresh.children); }
  }
  const previousInteract = world.onInteract;
  world.onInteract = e => { if (e.kind === 'ctf-keeper' || e.kind === 'ctf-gate') { view = 'modes'; openGate(); return; } previousInteract(e); };

  function openGate() {
    requestKit();
    const left = rewardedLeft(h.state(), Date.now());
    if (view === 'modes') {
      h.openDialog('ctf', 'Multiworld Gate', `<div class="ctf-dialog"><p class="ctf-lead"><img src="${assetUrl("icons/ctf/keeper.webp")}" alt="" width="44" height="44"><i>“${esc(t('Beyond this gate wait many other worlds. Fancy a match? Pick a mode!'))}”</i></p>
        <div class="ctf-modes">
          <button class="ctf-mode on" data-ctf="mode-ctf"><b>🚩 ${esc(t('Flag Rush'))}</b><small>1v1 · 2v2 · 3v3 · 5v5 — ${esc(t('Grab the other team\'s flag, carry it home to your own stand while your flag is safe, and score. First to 3 wins. Jump pads fling you over the river, 7 fun power-ups, 10 heroes with their ultimate ready. No gear is ever lost, and winners earn EXP.'))}</small><em>${esc(t('PLAY'))}</em></button>
          <button class="ctf-mode" disabled aria-disabled="true"><b>⚔️ ${esc(t('Lane Clash'))}</b><small>${esc(t('Three lanes, towers and a big boss. Being polished so it is easier to play.'))}</small><em>🔒 ${esc(t('Locked'))}</em></button>
          <button class="ctf-mode" disabled aria-disabled="true"><b>🏟️ ${esc(t('Last One Standing'))}</b><small>${esc(t('Everyone jumps in; the last explorer standing wins.'))}</small><em>${esc(t('Coming soon'))}</em></button>
        </div></div>`, 'BEYOND THE GATE', '🌀');
      return;
    }
    const kit = DISGUISES[hero], st = heroStats(hero), def = HEROES[hero];
    h.openDialog('ctf', 'Flag Rush', `<div class="ctf-dialog">
      <p class="ctf-rule"><b>${esc(t('You are blue. Cross the river and take the red flag.'))} ${esc(t('Bring the red flag back to the blue base.'))}</b></p><p class="ctf-rule">🚩 ${esc(t('Touch the enemy flag to take it. Bring it to your own stand while your flag is home: +1. A downed carrier drops the flag; a teammate touching it sends it home at once, or it flies home by itself after 15 s. The carrier runs 15% slower, is always seen and cannot teleport.'))}</p>
      <p class="ctf-sub">${esc(t('First to 3 · 8 minutes · everyone at level 8 with the ultimate ready · no gear lost · EXP for winners'))}</p>
      <h4>${esc(t('Team size'))}</h4><div class="ctf-sizes">${CTF.sizes.map(n => `<button data-ctf="size" data-size="${n}" class="${n === size ? 'sel' : ''}" aria-pressed="${n === size}">${n}v${n}</button>`).join('')}</div>
      <h4>${esc(t('Pick your hero'))}</h4><div class="ctf-heroes">${HERO_IDS.map(id => `<button data-ctf="hero" data-hero="${id}" class="${id === hero ? 'sel' : ''}" aria-pressed="${id === hero}" title="${esc(heroName(id))}"><img src="${heroIcon(id)}" alt="" loading="lazy"><b>${esc(heroName(id))}</b><small>${esc(t(HEROES[id].role))}</small></button>`).join('')}</div>
      <div class="ctf-kit"><b>${kit?.emoji ?? ''} ${esc(heroName(hero))}</b> · ${esc(t(def.role))} · ❤️ ${st.hp} · ⚔️ ${Math.round(st.atk)} · 🛡️ ${Math.round(st.def)}
        <ul>${(kit?.skills ?? []).map((s, i) => `<li><b>${'1234'[i]} ${s.icon} ${esc(t(s.name))}</b> (${s.cd}s)${i === 3 ? ' ⭐' : ''}</li>`).join('')}</ul></div>
      <p class="ctf-note">${esc(t('Your AI neighbours join your team; an AI team plays the other side. Online rooms come later.'))} <b>${esc(t('Rewarded matches left today: {n}', { n: left }))}</b></p>
      <div class="ctf-actions"><button class="primary" data-ctf="start">🚩 ${esc(t('Practice vs AI'))}</button><button disabled aria-disabled="true" title="${esc(t('Coming soon'))}">🌐 ${esc(t('Online — coming soon'))}</button><button data-ctf="modes">‹ ${esc(t('Back to modes'))}</button></div></div>`, 'CAPTURE THE FLAG', '🚩');
  }

  // ---------------------------------------------------------------- the match
  function start(teamSize: number, pick: string) {
    if (session || world.interior || world.planet !== 'home' || h.visiting()) return false;
    requestKit();
    const seed = (Date.now() ^ 0x5eed) >>> 0;
    return enter(teamSize, pick, seed);
  }
  function roster(teamSize: number, pick: string, seed: number) {
    let r = seed || 1; const rnd = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
    const n = h.neighbours()?.cast ?? [], extra = makeCast(seed ^ 0xc7f, 12).map(d => ({ id: d.id, name: d.name, color: d.color, gear: { ...d.gear } as Record<string, string | undefined> }));
    const used = new Set<string>([h.state().name]);
    const fresh = (list: readonly { id: string; name: string; color: string; gear: Record<string, string | undefined> }[]) => list.filter(d => !used.has(d.name));
    const mates = fresh([...n, ...extra]).slice(0, teamSize - 1); mates.forEach(d => used.add(d.name));
    const foes = fresh(extra).slice(0, teamSize); foes.forEach(d => used.add(d.name));
    const mateHeroes = pickHeroes(mates.length, [pick], rnd), foeHeroes = pickHeroes(foes.length, [], rnd);
    const list: Array<RosterEntry & { def: Bot['def'] }> = [{ id: ME, name: h.state().name, team: 0, hero: pick, human: true, def: { name: h.state().name, color: '#ffffff', gear: {} } }];
    mates.forEach((d, i) => list.push({ id: 'ctf-ally:' + i, name: d.name, team: 0, hero: mateHeroes[i], def: { name: d.name, color: d.color, gear: d.gear as Record<string, string | undefined> } }));
    foes.forEach((d, i) => list.push({ id: 'ctf-foe:' + i, name: d.name, team: 1, hero: foeHeroes[i], def: { name: d.name, color: d.color, gear: d.gear as Record<string, string | undefined> } }));
    return list;
  }
  function enter(teamSize: number, pick: string, seed: number) {
    const list = roster(teamSize, pick, seed);
    const m = createMatch({ id: 'ctf-' + seed.toString(36) + '-' + Date.now().toString(36), seed, size: teamSize, roster: list.map(({ def: _d, ...r }) => r) });
    const st = h.state();
    const saved: Session['saved'] = { root: world.root, entities: world.entities, enemies: world.enemies, obstacles: world.obstacles, detached: [], background: world.scene.background, fog: world.scene.fog, onZone: world.onZone, onStep: world.onStep, beforeRender: world.beforeRender, onRemotePlayerClick: world.onRemotePlayerClick, hp: st.hp, disguise: st.gear.disguise, zoom: world.zoom };
    try { localStorage.setItem(RESTORE_KEY, JSON.stringify({ disguise: saved.disguise ?? null, hp: saved.hp, hero: pick })); } catch { /* storage is optional */ }
    for (const child of [...world.root.children]) if (child !== world.player && child !== world.companion) { saved.detached.push(child); world.root.remove(child); }
    const obstacles = fieldObstacles();
    world.entities = []; world.enemies = []; world.obstacles = obstacles.map(o => ({ x: o.x + C.x, z: o.z + C.z, r: o.r }));
    world.onZone = () => {}; world.onStep = undefined; world.beforeRender = undefined; world.playerLift = 0;
    const w = world as unknown as Record<string, unknown>; w.applyEnemySnapshots = () => {}; w.applyAuthoritativeEnemyHealth = () => {}; w.enemySnapshots = () => [];
    const arena = buildArena(); arena.root.position.set(C.x, 0, C.z); world.root.add(arena.root);
    const marks = new StrikeMarks(), shots = new Shots(); marks.root.position.set(C.x, 0, C.z); shots.root.position.set(C.x, 0, C.z); world.scene.add(marks.root, shots.root);
    world.scene.background = new T.Color('#9fdcff'); world.scene.fog = new T.Fog('#bfe8ff', 60, 150);
    // A little wider view on the isle: the fights and the flags are further apart than in the village.
    world.zoom = Math.max(world.zoom, 1.3); world.resize();
    const s: Session = {
      m, minds: newMinds(), arena, marks, shots, obstacles, bots: [], hero: pick, team: 0, saved,
      last: { x: 0, z: 0 }, hpWritten: -1, frozen: null, ended: false, claimed: false, claim: null, feed: [], speedBase: world.playerSpeedBonus, powerShown: FIELD.powerSpots.map(() => null), pendingHits: [],
    };
    session = s;
    // The hero is worn for the match only: never written to the save (toJSON), put back on leaving.
    wearHero(pick);
    st.hp = h.maxHp(); s.hpWritten = st.hp;
    // Extra speed (Zippy Boots) rides on top of whatever the explorer's skills give.
    Object.defineProperty(world, 'playerSpeedBonus', { configurable: true, get: () => s.speedBase + extraSpeed(), set: (v: number) => { s.speedBase = v; } });
    const me = rulesPlayer(m, ME)!; teleport(me.x + C.x, me.z + C.z, Math.PI / 2); s.last = { x: world.position.x, z: world.position.z };
    for (const e of list) if (e.id !== ME) s.bots.push({ id: e.id, def: e.def, team: e.team, proxy: null, shown: false });
    for (const b of s.bots) showBot(b);
    world.onRemotePlayerClick = id => { const b = s.bots.find(v => v.id === id); if (b?.proxy && b.proxy.hp > 0) { world.select(b.proxy); } };
    document.body.classList.add('in-ctf', 'in-mode'); hud.hidden = false; feed.hidden = false; tags.hidden = false; keeperTag.hidden = true; bubble.hidden = true;
    h.refreshPlayer(); h.tone('level'); banner(t('Flag Rush Isle'), `${teamSize}v${teamSize} · ${t('Red team: AI opponents')}`);
    world.fx?.burst({ x: world.position.x, z: world.position.z }, { n: 40, color: ['#7a8aff', '#ff7a8a', '#ffffff'], glow: true, speed: 5, up: 9 });
    h.updateHud();
    return true;
  }
  function wearHero(id: string) {
    const gear = h.state().gear as SaveState['gear'] & { toJSON?: () => unknown };
    const own = session?.saved.disguise;
    gear.disguise = id as SaveState['gear']['disguise'];
    Object.defineProperty(gear, 'toJSON', { configurable: true, enumerable: false, writable: true, value() { const out: Record<string, unknown> = { ...this }; if (own) out.disguise = own; else delete out.disguise; return out; } });
  }
  function takeOffHero() {
    const s = session; const gear = h.state().gear as SaveState['gear'] & { toJSON?: unknown };
    delete gear.toJSON; if (!s) return;
    if (s.saved.disguise) gear.disguise = s.saved.disguise as SaveState['gear']['disguise']; else delete gear.disguise;
  }
  /** A reload in the middle of a match: the explorer's own disguise and health come back. */
  function restoreAfterReload() {
    try {
      const raw = localStorage.getItem(RESTORE_KEY); if (!raw) return; localStorage.removeItem(RESTORE_KEY);
      const v = JSON.parse(raw) as { disguise: string | null; hp: number; hero: string }, st = h.state();
      if (st.gear.disguise === v.hero && v.hero !== v.disguise) { if (v.disguise) st.gear.disguise = v.disguise as SaveState['gear']['disguise']; else delete st.gear.disguise; }
      if (Number.isFinite(v.hp) && v.hp > 0) st.hp = Math.min(h.maxHp(), v.hp);
    } catch { /* nothing to restore */ }
  }
  function extraSpeed() { const s = session; const p = s ? rulesPlayer(s.m, ME) : null; return p && p.alive && p.buffs.zip > 0 ? .6 : 0; }
  function teleport(x: number, z: number, facing = world.facing) {
    world.position.set(x, 0, z); world.facing = facing; world.destination = null; world.route = []; world.marker.visible = false; world.cameraTarget.copy(world.position);
  }
  function botPose(b: Bot, p: CtfPlayer): RemotePose {
    const lift = p.jump ? jumpLift(p.jump.t) : 0;
    return { id: b.id, x: p.x + C.x, z: p.z + C.z, y: lift, facing: p.facing, color: b.def.color, name: '', planet: 'home', moving: true, gear: { ...b.def.gear, disguise: p.hero } as RemotePose['gear'], level: CTF.level, hp: p.hp,
      visual: { size: p.buffs.bigcap > 0 ? 1.55 : 1, stealth: p.buffs.wisp > 0 || p.buffs.evade > 0, shield: p.buffs.shield > 0, flight: 0 } };
  }
  function showBot(b: Bot) {
    const s = session!, p = rulesPlayer(s.m, b.id)!; b.shown = true;
    world.addRemotePlayer(b.id, botPose(b, p));
    if (b.team !== s.team) {
      if (!b.proxy) {
        const g = new T.Group(); const pick = new T.Mesh(new T.CylinderGeometry(.7, .7, 2.2, 8).translate(0, 1.1, 0), new T.MeshBasicMaterial({ visible: false })); g.add(pick);
        g.userData.pickHeight = 2; g.userData.footprint = .6;
        const e = world.addEntity('enemy', b.def.name, '⚔️', g, p.x + C.x, p.z + C.z, .7) as Enemy;
        Object.assign(e, { id: b.id, type: 'ctf-hero', hp: p.hp, maxHp: p.maxHp, baseMaxHp: p.maxHp, damage: 0, baseDamage: 0, xp: 0, level: CTF.level, homeX: e.x, homeZ: e.z, cooldown: 0, respawn: 0, boss: false, stun: 0, phase: 'chase', phaseTime: 0, route: [], routeTime: 0, lift: 0, liftVelocity: 0, statuses: {}, scaled: true, lastHitAt: Infinity });
        e.driver = { incoming: (target, amount) => incoming(target, amount) };
        world.enemies.push(e); b.proxy = e;
      }
      b.proxy.hp = p.hp; b.proxy.dying = 0; b.proxy.mesh.visible = true;
    }
  }
  function hideBot(b: Bot) { b.shown = false; world.removeRemotePlayer(b.id); if (b.proxy) { b.proxy.hp = 0; b.proxy.mesh.visible = false; if (world.selected === b.proxy) { world.selected = null; world.ring.visible = false; } } }
  /** The explorer's hit on a bot: measured in multiples of their attack, landed as a level-8 hero's. */
  function incoming(e: Enemy, amount: number) {
    const s = session; if (!s || !(amount > 0)) return 0;
    const lost = playerHit(s.m, ME, e.id, amount / Math.max(1, h.attack()), s.pendingHits);
    return lost;
  }
  function confirmLeave() {
    if (!session) return;
    if (session.m.phase === 'over') { exit(); return; }
    h.openDialog('ctf-leave', 'Leave the match', `<p class="center">${esc(t('Leave the match? It counts as a loss.'))}</p><div class="ctf-actions"><button class="primary" data-ctf="leave-yes">${esc(t('Leave'))}</button><button data-ctf="close">${esc(t('Stay'))}</button></div>`, 'FLAG RUSH', '🚪');
  }
  function leave() { const s = session; if (!s) return; if (s.m.phase !== 'over') handle(forfeit(s.m, s.team)); exit(); }
  function exit() {
    const s = session; if (!s || s.ended) return; s.ended = true;
    const rebuilt = world.root !== s.saved.root;
    for (const b of s.bots) world.removeRemotePlayer(b.id);
    for (const b of s.bots) if (b.proxy) { b.proxy.mesh.removeFromParent(); }
    s.marks.root.removeFromParent(); s.shots.root.removeFromParent();
    s.arena.root.removeFromParent(); world.disposeTree(s.arena.root);
    const w = world as unknown as Record<string, unknown>; delete w.applyEnemySnapshots; delete w.applyAuthoritativeEnemyHealth; delete w.enemySnapshots;
    delete (world as unknown as Record<string, unknown>).playerSpeedBonus; world.playerSpeedBonus = s.speedBase; world.playerLift = 0;
    world.onZone = s.saved.onZone; world.onStep = s.saved.onStep; world.beforeRender = s.saved.beforeRender; world.onRemotePlayerClick = s.saved.onRemotePlayerClick;
    if (!rebuilt) {
      world.entities = s.saved.entities; world.enemies = s.saved.enemies; world.obstacles = s.saved.obstacles;
      for (const child of s.saved.detached) world.root.add(child);
      world.scene.background = s.saved.background; world.scene.fog = s.saved.fog;
      teleport(GATE.keeper.x - 1.2, GATE.keeper.z - 3, Math.PI);
    } else for (const child of s.saved.detached) world.disposeTree(child);
    world.zoom = s.saved.zoom; world.resize();
    takeOffHero(); const st = h.state(); st.hp = Math.max(1, Math.min(h.maxHp(), s.saved.hp));
    session = null;
    try { localStorage.removeItem(RESTORE_KEY); } catch { /* fine */ }
    world.selected = null; world.ring.visible = false;
    document.body.classList.remove('in-ctf', 'in-mode'); hud.hidden = feed.hidden = down.hidden = tags.hidden = true; tags.innerHTML = ''; tagEls.clear(); world.movementLocked = false;
    h.refreshPlayer(); h.updateHud(); h.toast(t('Welcome back from Flag Rush Isle.'), '🌀');
  }

  // HUD map updates at 10 Hz; keep movement/rendering smooth without rebuilding SVG every frame.
  let hudElapsed = 0;
  // ---------------------------------------------------------------- the frame
  h.onFrame(dt => {
    if (!h.started()) return;
    if (!restored) { restored = true; restoreAfterReload(); }
    if (!session) { homeFrame(dt); return; }
    const s = session;
    if (world.root !== s.saved.root) { exit(); return; }
    const m = s.m, me = rulesPlayer(m, ME)!, st = h.state();
    // An action replaces the gear object (actions.ts clones the save): wear the hero again, still never saved.
    if (st.gear.disguise !== s.hero || !Object.hasOwn(st.gear, 'toJSON')) { const changed = st.gear.disguise !== s.hero; wearHero(s.hero); if (changed) h.refreshPlayer(); }
    // Flag Rush is local AI practice even when the account is connected online.
    const paused = h.blocked();
    if (!paused) {
      // The explorer's moves into the match: carrier slowdown and slows, no teleporting with the flag, frozen when stunned or down.
      inputFrame(s, me);
      // Health the explorer's own skills changed (heals, regeneration) counts in the match too.
      if (Math.abs(st.hp - s.hpWritten) > .5 && me.alive) me.hp = Math.max(1, Math.min(me.maxHp, st.hp / h.maxHp() * me.maxHp));
      setImmune(m, ME, !!world.playerShield);
      if (world.playerStealth && me.carrying === null && me.alive) me.buffs.wisp = Math.max(me.buffs.wisp, .2);
      foeStatuses(s, dt);
      const out = [...s.pendingHits.splice(0)];
      stepPractice(m, dt, s.minds, s.obstacles, out);
      handle(out);
      if (!session) return;
      outputFrame(s, me);
    }
    s.shots.update(dt); drawStrikes(s); drawFlags(s, dt); drawPowers(s, dt); botsFrame(s); hudElapsed += dt; if (hudElapsed >= .1) { hudElapsed = 0; hudFrame(s); } tagsFrame(s);
  });
  function inputFrame(s: Session, me: CtfPlayer) {
    const p = world.position, m = s.m;
    if (!canAct(m, me)) {
      // Follow the rules position: knockback and respawn may have moved it while input was locked.
      const hold = { x: me.x + C.x, z: me.z + C.z };
      if (!s.frozen) s.frozen = { x: hold.x, z: hold.z };
      p.x = hold.x; p.z = hold.z; world.destination = null; world.route = [];
    } else {
      s.frozen = null;
      let dx = p.x - s.last.x, dz = p.z - s.last.z; const d = Math.hypot(dx, dz);
      if (me.carrying !== null && d > 3.5) { dx = 0; dz = 0; h.toast(t('The flag carrier cannot teleport!'), '🚩'); }
      const k = (me.carrying !== null ? 1 - CTF.carrySlow : 1) * (me.slow > 0 ? .55 : 1);
      p.x = s.last.x + dx * k; p.z = s.last.z + dz * k;
      movePlayer(m, ME, p.x - C.x, p.z - C.z);
    }
    world.playerLift = me.jump ? jumpLift(me.jump.t) : 0;
  }
  function outputFrame(s: Session, me: CtfPlayer) {
    // The rules may have moved the explorer (a pad, a knock-back, a pull, the respawn).
    const wx = me.x + C.x, wz = me.z + C.z;
    if (Math.hypot(world.position.x - wx, world.position.z - wz) > .05) { world.position.x = wx; world.position.z = wz; world.cameraTarget.lerp(world.position, .5); }
    if (me.jump) { world.playerLift = jumpLift(me.jump.t); world.facing = me.facing; }
    s.last = { x: world.position.x, z: world.position.z };
    const st = h.state(), want = me.alive ? Math.max(1, Math.round(me.hp / me.maxHp * h.maxHp())) : 1;
    if (st.hp !== want) { st.hp = want; } s.hpWritten = st.hp;
  }
  /** Stuns, sheep, fear and slows the explorer's kit put on a bot (world.statusEnemy) hold it in the match too. */
  function foeStatuses(s: Session, dt: number) {
    for (const b of s.bots) {
      const e = b.proxy; if (!e) continue; const p = rulesPlayer(s.m, b.id); if (!p || !p.alive) continue;
      const st = e.statuses ?? {}, hold = Math.max(e.stun, st.stun ?? 0, st.sheep ?? 0, st.fear ?? 0);
      if (hold > 0) p.stun = Math.max(p.stun, Math.min(hold, 3));
      if ((st.slow ?? 0) > 0) p.slow = Math.max(p.slow, st.slow!);
      e.stun = Math.max(0, e.stun - dt); for (const k in st) st[k] = Math.max(0, st[k] - dt);
      // A hook or knock that moved the proxy (main.ts moveEnemy) moves the hero.
      if (Math.hypot(e.x - (p.x + C.x), e.z - (p.z + C.z)) > .3 && !p.jump) { p.x = Math.max(-FIELD.hx, Math.min(FIELD.hx, e.x - C.x)); p.z = Math.max(-FIELD.hz, Math.min(FIELD.hz, e.z - C.z)); }
    }
  }
  function botsFrame(s: Session) {
    for (const b of s.bots) {
      const p = rulesPlayer(s.m, b.id)!;
      if (!p.alive) { if (b.shown) hideBot(b); continue; }
      if (!b.shown) showBot(b);
      world.updateRemotePlayer(b.id, botPose(b, p));
      const e = b.proxy; if (e) { e.x = p.x + C.x; e.z = p.z + C.z; e.hp = p.hp; e.maxHp = p.maxHp; e.mesh.position.set(e.x, 0, e.z); e.mesh.visible = true; }
    }
  }

  // ---------------------------------------------------------------- events
  function name(id: string | null) { if (!id) return ''; if (id === ME) return t('You'); return session?.m.players.find(p => p.id === id)?.name ?? id; }
  function at(p: { x: number; z: number }, y = 0) { return { x: p.x + C.x, y, z: p.z + C.z }; }
  function handle(events: CtfEvent[]) {
    const s = session; if (!s) return; const m = s.m, fx = world.fx;
    for (const ev of events) switch (ev.kind) {
      case 'go': banner(t('Go!'), ''); h.tone('level'); break;
      case 'overtime': banner(t('Overtime!'), t('GOLDEN POINT — the next capture wins!')); h.tone('alert'); break;
      case 'take': {
        const ours = ev.flag === s.team; post(ours ? t('{name} took our flag! Stop them!', { name: name(ev.by) }) : t('{name} took the {team} flag!', { name: name(ev.by), team: teamName(ev.flag) }), ours ? 'bad' : 'good');
        h.tone(ours ? 'alert' : 'level'); const p = rulesPlayer(m, ev.by); if (p) fx?.burst(at(p), { n: 30, color: [TEAM_COLORS[ev.flag], '#ffffff', '#ffe14d'], glow: true, speed: 5, up: 7 });
        if (ev.by === ME) banner('🚩 ' + t('You carry the flag!'), t('Bring it home!'));
        break;
      }
      case 'drop': post(t('{name} was knocked down: the {team} flag fell!', { name: name(ev.by), team: teamName(ev.flag) }), ''); h.tone('crit'); break;
      case 'return': post(ev.by ? t('{name} sent the {team} flag home!', { name: name(ev.by), team: teamName(ev.flag) }) : t('The {team} flag flew home by itself', { team: teamName(ev.flag) }), ev.flag === s.team ? 'good' : ''); h.tone('success'); fx?.burst(at(FIELD.stands[ev.flag]), { n: 24, color: [TEAM_COLORS[ev.flag], '#ffffff'], glow: true, speed: 4, up: 8 }); break;
      case 'capture': {
        const scorer = rulesPlayer(m, ev.by), ours = scorer?.team === s.team;
        post(ev.by === ME ? t('You score! {a} – {b}', { a: ev.score[0], b: ev.score[1] }) : t('{name} SCORES! {a} – {b}', { name: name(ev.by), a: ev.score[0], b: ev.score[1] }), ours ? 'good big' : 'bad big');
        h.tone(ours ? 'level' : 'hurt'); fx?.shake?.(ours ? .5 : .25);
        if (scorer) { const p = FIELD.stands[scorer.team]; for (let i = 0; i < 3; i++) setTimeout(() => world.fx?.burst(at(p), { n: 40, color: ['#ff7ab0', '#7fd0ff', '#ffe14d', '#7aff9a'], glow: true, speed: 7, up: 11 }), i * 220); fx?.ring(at(p), { color: TEAM_COLORS[scorer.team], from: .5, to: 7, life: .8, y: .1, thick: .08 }); }
        banner(`🏆 ${ev.score[0]} – ${ev.score[1]}`, ours ? t('Point for the blue team!') : t('The red team scores!'), ours ? 'good' : 'bad');
        break;
      }
      case 'down': {
        const p = rulesPlayer(m, ev.id); if (p) { fx?.burst(at(p), { n: 18, color: ['#ffffff', TEAM_COLORS[p.team]], speed: 4, up: 5 }); }
        if (ev.id === ME) { h.tone('hurt'); const sp = FIELD.spawns[s.team][0], pm = rulesPlayer(m, ME)!; pm.x = sp.x; pm.z = sp.z; teleport(sp.x + C.x, sp.z + C.z, Math.PI / 2); s.last = { x: world.position.x, z: world.position.z }; world.selected = null; }
        else if (ev.by === ME) { h.tone('poof'); fx?.text(at(p ?? { x: 0, z: 0 }, 2.4), '💥', 'callout'); }
        if (ev.by) post(`${esc(name(ev.by))} ⚔️ ${esc(name(ev.id))}`, '', true);
        break;
      }
      case 'respawn': if (ev.id === ME) { const p = rulesPlayer(m, ME)!; teleport(p.x + C.x, p.z + C.z, Math.PI / 2); s.last = { x: world.position.x, z: world.position.z }; h.state().hp = h.maxHp(); s.hpWritten = h.state().hp; fx?.ring(at(p), { color: '#ffffff', from: .3, to: 2.5, life: .5 }); } break;
      case 'hit': {
        if (ev.id === ME) { const lost = Math.round(ev.amount / Math.max(1, rulesPlayer(m, ME)!.maxHp) * h.maxHp()); world.hurtFeedback(lost); h.tone('hurt'); const flash = document.querySelector('#damage-flash'); flash?.classList.add('active'); setTimeout(() => flash?.classList.remove('active'), 160); }
        else if (ev.by === ME) { /* main.ts shows the number */ }
        else if (Math.hypot(ev.x + C.x - world.position.x, ev.z + C.z - world.position.z) < 24) fx?.text(at(ev, 1.9), String(ev.amount), 'damage');
        break;
      }
      case 'heal': { const p = rulesPlayer(m, ev.id); if (p && ev.amount > 20) fx?.text(at(p, 2), '+' + ev.amount, 'heal'); break; }
      case 'power-spawn': post(t('A power-up appeared: {power}', { power: `${POWERS[ev.power].icon} ${t(POWERS[ev.power].name)}` }), '', true); break;
      case 'power': {
        const p = rulesPlayer(m, ev.id), pw = POWERS[ev.power];
        post(t('{name} picked up {power}', { name: name(ev.id), power: `${pw.icon} ${t(pw.name)}` }), ev.id === ME ? 'good' : '', ev.id !== ME);
        if (p) { fx?.burst(at(p), { n: 20, color: [pw.color, '#ffffff'], glow: true, speed: 4, up: 6 }); fx?.text(at(p, 2.4), `${pw.icon} ${t(pw.name)}`, 'item'); }
        if (ev.id === ME) { h.tone('magic'); h.toast(t(pw.desc), pw.icon); }
        if (ev.power === 'frost' && p) { fx?.ring(at(p), { color: '#bff4ff', from: .5, to: 6, life: .5, y: .1, thick: .4 }); h.tone('freeze'); }
        break;
      }
      case 'jump': { const p = rulesPlayer(m, ev.id); if (p) { fx?.burst(at(p), { n: 14, color: ['#fff3b0', '#ffffff'], glow: true, speed: 3, up: 6 }); if (ev.id === ME || Math.hypot(p.x + C.x - world.position.x, p.z + C.z - world.position.z) < 20) h.tone('pop'); const pad = s.arena.pads[ev.pad]; if (pad) pad.userData.boing = .35; } break; }
      case 'land': { const p = rulesPlayer(m, ev.id); if (p) fx?.ring(at(p), { color: '#ffffff', from: .2, to: 1.8, life: .35, y: .1 }); break; }
      case 'attack': {
        const a = rulesPlayer(m, ev.id), b = rulesPlayer(m, ev.target); if (!a || !b) break;
        if (ev.ranged) s.shots.fire(a.x, a.z, b.x, b.z, TEAM_COLORS[a.team]);
        else fx?.slash(at(a), a.facing, 1.9, TEAM_COLORS[a.team], { arc: 2, life: .2 });
        break;
      }
      case 'cast': {
        const a = rulesPlayer(m, ev.id); if (!a) break; const skill = HEROES[a.hero]?.ai[ev.skill]; const nm = DISGUISES[a.hero]?.skills[ev.skill];
        if (nm && Math.hypot(a.x + C.x - world.position.x, a.z + C.z - world.position.z) < 26) fx?.text(at(a, 2.6), `${nm.icon} ${t(nm.name)}`, ev.skill === 3 ? 'alert callout' : 'item');
        if (skill?.kind === 'dash' || skill?.kind === 'blink') fx?.burst(at(a), { n: 14, color: [TEAM_COLORS[a.team], '#ffffff'], glow: true, speed: 5, up: 3 });
        if (skill?.kind === 'heal') fx?.ring(at(a), { color: '#7aff9a', from: .3, to: skill.r ?? 6, life: .6, y: .1 });
        if (skill?.kind === 'buff') fx?.burst(at(a), { n: 16, color: ['#fff3b0', TEAM_COLORS[a.team]], glow: true, speed: 3, up: 5 });
        if (skill?.kind === 'line') { const len = skill.len ?? 10; for (let i = 1; i <= 6; i++) { const d = i * len / 6; fx?.burst(at({ x: a.x + Math.sin(a.facing) * d, z: a.z + Math.cos(a.facing) * d }), { n: 4, color: [TEAM_COLORS[a.team], '#ffffff'], glow: true, speed: 2, up: 2, size: .12 }); } }
        if (ev.skill === 3) h.tone('cast');
        break;
      }
      case 'land-strike': {
        const str = ev.strike, col = str.kind === 'pumpkin' ? '#ff9a3c' : TEAM_COLORS[str.team];
        fx?.ring(at(str), { color: col, from: .3, to: str.r, life: .4, y: .12, thick: .3 });
        if (str.kind !== 'zone') { fx?.burst(at(str), { n: str.kind === 'pumpkin' ? 30 : 14, color: [col, '#ffffff'], glow: true, speed: 5, up: 5 }); if (Math.hypot(str.x + C.x - world.position.x, str.z + C.z - world.position.z) < 14) { world.fx?.shake?.(str.kind === 'pumpkin' ? .4 : .15); h.tone('boom'); } }
        break;
      }
      case 'knock': break;
      case 'strike': break;
      case 'end': finishMatch(ev.result); break;
    }
  }
  function finishMatch(result: { winner: TeamId | -1; reason: string; seconds: number }) {
    const s = session!; lastResult = result;
    const won = result.winner === s.team, draw = result.winner === -1, me = rulesPlayer(s.m, ME)!;
    h.tone(won ? 'success' : draw ? 'level' : 'hurt');
    banner(won ? t('VICTORY!') : draw ? t('DRAW') : t('DEFEAT'), `${s.m.score[0]} – ${s.m.score[1]}`, won ? 'good' : draw ? '' : 'bad');
    void claim(s, won, draw, me).then(() => { if (session === s) setTimeout(() => { if (session === s) endDialog(s); }, 1600); });
  }
  async function claim(s: Session, won: boolean, draw: boolean, me: CtfPlayer) {
    if (s.claimed) return; s.claimed = true;
    if (s.m.result?.reason === 'leave') { s.claim = { xp: 0, left: rewardedLeft(h.state(), Date.now()) }; return; }
    // The claim saves the game: the explorer's own disguise is back on for it (the hero is never saved).
    takeOffHero(); let res: { xp: number; left: number } | undefined;
    try { res = await h.perform<{ xp: number; left: number }>('ctfClaim', { matchId: s.m.id, won, draw, caps: me.stats.caps, rets: me.stats.rets, kills: me.stats.kills, size: s.m.size, seconds: Math.max(0, Math.round(s.m.result?.seconds ?? 0)) }, true); } finally { if (session === s) wearHero(s.hero); }
    s.claim = res ?? { xp: 0, left: rewardedLeft(h.state(), Date.now()) }; lastClaim = s.claim;
    if (res && res.xp > 0) { world.fx?.text({ x: world.position.x, y: 1.6, z: world.position.z }, t('+{xp} EXP', { xp: res.xp }), 'xp'); world.fx?.orbs?.({ x: world.position.x, z: world.position.z }, 8, '#7ff0ff', () => world.position, () => h.tone('coin')); }
    h.updateHud();
  }
  function endDialog(s: Session) {
    const m = s.m, r = m.result!, won = r.winner === s.team, draw = r.winner === -1;
    const why = { flags: t('Three flags captured'), time: t('Time is up'), golden: t('Golden point'), leave: t('A team left') }[r.reason];
    const rows = (team: TeamId) => m.players.filter(p => p.team === team).map(p => `<tr class="${p.id === ME ? 'me' : ''}"><td>${DISGUISES[p.hero]?.emoji ?? ''} <b data-i18n-skip>${esc(p.id === ME ? h.state().name : p.name)}</b></td><td>🚩${p.stats.caps}</td><td>↩️${p.stats.rets}</td><td>${p.stats.kills}/${p.stats.downs}</td></tr>`).join('');
    const xp = s.claim?.xp ?? 0, mineXp = rewardFor(m, ME);
    h.openDialog('ctf-end', won ? 'VICTORY!' : draw ? 'DRAW' : 'DEFEAT', `<div class="ctf-dialog ctf-end"><p class="ctf-score"><b style="color:${TEAM_COLORS[0]}">${m.score[0]}</b> – <b style="color:${TEAM_COLORS[1]}">${m.score[1]}</b></p>
      <p class="center">${esc(why)} · ⏱️ ${clock(r.seconds)}</p>
      ${xp > 0 ? `<h4 class="center ctf-xp">⭐ ${esc(t('+{xp} EXP', { xp }))}</h4>` : mineXp > 0 && s.claim && s.claim.left <= 0 ? `<p class="center muted">${esc(t('No EXP this time: today\'s rewarded matches are used up.'))}</p>` : mineXp > 0 && r.seconds < CTF_REWARD.minSeconds ? `<p class="center muted">${esc(t('Matches shorter than {s} seconds earn no EXP.', { s: CTF_REWARD.minSeconds }))}</p>` : ''}
      <p class="center muted"><small>${esc(t('Flag Rush never takes your gear. Another round?'))}</small></p>
      <div class="ctf-tables">${([0, 1] as TeamId[]).map(team => `<table><tr><th style="color:${TEAM_COLORS[team]}">${esc(t(team ? 'Red team' : 'Blue team'))}${r.winner === team ? ' 🏆' : ''}</th><th>${esc(t('Flags'))}</th><th>${esc(t('Returns'))}</th><th>${esc(t('K/D'))}</th></tr>${rows(team)}</table>`).join('')}</div>
      <div class="ctf-actions"><button class="primary" data-ctf="again">🚩 ${esc(t('Play again'))}</button><button data-ctf="home">🏡 ${esc(t('Back home'))}</button></div></div>`, 'FLAG RUSH', won ? '🏆' : draw ? '🤝' : '💪');
  }

  // ---------------------------------------------------------------- drawing
  function drawStrikes(s: Session) {
    s.marks.begin();
    for (const str of s.m.strikes) if (str.kind !== 'pumpkin') s.marks.draw(str.x, str.z, str.r, str.kind === 'zone' || !str.total ? 1 : 1 - Math.max(0, str.at) / str.total, TEAM_COLORS[str.team]);
    for (const p of s.m.players) if (p.alive && p.buffs.pumpkin > 0) s.marks.draw(p.x, p.z, 4.5, 1 - p.buffs.pumpkin / 2, '#ff9a3c');
    s.marks.end();
  }
  let flagTime = 0;
  function drawFlags(s: Session, dt: number) {
    flagTime += dt; let carrier: CtfPlayer | null = null;
    for (const f of s.m.flags) {
      const g = s.arena.flags[f.team];
      if (f.state === 'carried') {
        const p = rulesPlayer(s.m, f.carrier ?? ''); if (!p) continue; carrier = p;
        const lift = p.jump ? jumpLift(p.jump.t) : 0;
        g.position.set(p.x - Math.sin(p.facing) * .45, 1.0 + lift, p.z - Math.cos(p.facing) * .45); g.rotation.set(0, p.facing + Math.PI, .12); g.scale.setScalar(.75);
      } else if (f.state === 'dropped') { g.position.set(f.x, 0, f.z); g.rotation.set(0, flagTime * .8, .5); g.scale.setScalar(.9); }
      else { g.position.set(f.x, .3, f.z); g.rotation.set(0, Math.sin(flagTime * 1.3 + f.team) * .25 + (f.team ? Math.PI : 0), 0); g.scale.setScalar(1); }
    }
    const b = s.arena.beacon; b.visible = !!carrier;
    if (carrier) { b.position.set(carrier.x, 0, carrier.z); (b.material as T.MeshBasicMaterial).color.set(TEAM_COLORS[otherTeam(carrier.team)]); (b.material as T.MeshBasicMaterial).opacity = .16 + .08 * Math.sin(flagTime * 6); }
    for (const pad of s.arena.pads) { const k = pad.userData.boing ?? 0; if (k > 0) { pad.userData.boing = Math.max(0, k - dt); pad.scale.set(1, 1 + Math.sin(k / .35 * Math.PI) * .5, 1); } }
  }
  function drawPowers(s: Session, dt: number) {
    s.m.power.spots.forEach((k, i) => {
      const holder = s.arena.powers[i];
      if (s.powerShown[i] !== k) { holder.clear(); if (k) holder.add(buildPower(k)); s.powerShown[i] = k; }
      if (k && holder.children[0]) { const o = holder.children[0]; o.rotation.y += dt * 1.6; o.position.y = .5 + Math.sin(flagTime * 2.4 + i) * .18; }
    });
  }

  // ---------------------------------------------------------------- HUD
  let hudShown = '';
  function flagLine(s: Session, team: TeamId) {
    const f = s.m.flags[team], ours = team === s.team;
    if (f.state === 'home') return ours ? `🏳️ ${t('Our flag is home')}` : `🚩 ${t('Enemy flag')}`;
    if (f.state === 'carried') return ours ? `🏃 ${t('Our flag was taken!')}` : f.carrier === ME ? `🏃 ${t('You carry the flag!')}` : `🏃 ${t('{name} took the {team} flag!', { name: name(f.carrier), team: teamName(team) })}`;
    const sec = Math.ceil(f.returnIn); return ours ? `⚠️ ${t('Our flag is down: {s}s', { s: sec })}` : `⚠️ ${t('Enemy flag down: {s}s', { s: sec })}`;
  }
  function hudFrame(s: Session) {
    const m = s.m, me = rulesPlayer(m, ME)!, golden = m.phase === 'overtime';
    const time = m.phase === 'intro' ? `${Math.ceil(m.timer)}` : clock(m.phase === 'over' ? 0 : m.timer);
    const buffs = [me.buffs.zip > 0 ? `👟${Math.ceil(me.buffs.zip)}` : '', me.buffs.shield > 0 ? `🫧${Math.round(me.buffs.shield)}` : '', me.buffs.wisp > 0 && me.carrying === null ? `👻${Math.ceil(me.buffs.wisp)}` : '', me.buffs.bigcap > 0 ? `🍄${Math.ceil(me.buffs.bigcap)}` : '', me.buffs.pumpkin > 0 ? `🎃${Math.ceil(me.buffs.pumpkin)}` : '', me.stun > 0 ? '❄️' : ''].filter(Boolean).join(' ');
    const enemyFlag = m.flags[otherTeam(s.team)];
    const goal = me.carrying !== null ? (m.flags[s.team].state === 'home' ? 'Bring the red flag back to the blue base.' : 'Recover your blue flag before you can score.') : enemyFlag.state === 'carried' ? 'Your teammate has the red flag. Protect them on the way home.' : enemyFlag.state === 'dropped' ? 'The red flag was dropped. Walk onto it to pick it up.' : 'Cross a bridge to the red base on the right of the map. Walk onto the red flag to pick it up.';
    const map = `<svg class="ctf-map" viewBox="-52 -32 104 64" role="img" aria-label="${esc(t('Arena map: blue allies, red AI opponents, white ring is you.'))}"><rect x="-52" y="-32" width="104" height="64" rx="4" fill="#284d43"/><path d="M0 -32V32" stroke="#62bddb" stroke-width="7"/>${FIELD.river.bridges.map(z=>`<path d="M-5 ${z}H5" stroke="#e1c28b" stroke-width="4"/>`).join('')}${m.players.filter(p=>p.alive).map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.z.toFixed(1)}" r="${p.id===ME?2.2:1.6}" fill="${TEAM_COLORS[p.team]}" stroke="${p.id===ME?'white':'#142635'}" stroke-width=".8"/>`).join('')}${m.flags.map(f=>{ const carrier = f.state === 'carried' ? rulesPlayer(m, f.carrier ?? '') : null; const x = carrier?.x ?? f.x, z = carrier?.z ?? f.z; return `<g class="ctf-map-flag" data-team="${f.team}" transform="translate(${x} ${z})"><path d="M0 1V-8H6L4 -5H0" fill="${TEAM_COLORS[f.team]}" stroke="white" stroke-width="1" stroke-linejoin="round"/><title>${esc(teamName(f.team))}</title></g>`; }).join('')}</svg>`;
    const html = `<div class="ctf-score-row"><span class="ctf-team blue"><i>${esc(t('Blue team'))}</i><b>${m.score[0]}</b></span><span class="ctf-clock ${golden ? 'golden' : ''}">${golden ? '⚡ ' : '⏱ '}${time}</span><span class="ctf-team red"><b>${m.score[1]}</b><i>${esc(t('Red team: AI opponents'))}</i></span><button data-ctf="leave" title="${esc(t('Leave the match'))}" aria-label="${esc(t('Leave the match'))}">🚪</button></div>
      <div class="ctf-wave ${golden ? 'golden' : ''}">${golden ? esc(t('GOLDEN POINT — the next capture wins!')) : `🚩 ${esc(t('First to 3 points'))}`}</div>
      <div class="ctf-objective">${esc(t(goal))}</div>${map}<div class="ctf-map-key">${esc(t('Arena map: blue allies, red AI opponents, white ring is you.'))}</div><div class="ctf-flags"><span class="${m.flags[s.team].state !== 'home' ? 'alarm' : ''}">${esc(flagLine(s, s.team))}</span><span class="${m.flags[otherTeam(s.team)].state === 'carried' && me.carrying !== null ? 'mine' : ''}">${esc(flagLine(s, otherTeam(s.team)))}</span></div>${buffs ? `<div class="ctf-buffs">${buffs}</div>` : ''}`;
    if (html !== hudShown) { hudShown = html; hud.innerHTML = html; }
    down.hidden = me.alive || m.phase === 'over';
    if (!down.hidden) { const text = `<b>${esc(t('You were knocked down'))}</b><span>${esc(t('Respawning in {s}s', { s: Math.max(1, Math.ceil(me.respawn)) }))}</span>`; if (down.dataset.html !== text) { down.dataset.html = text; down.innerHTML = text; } }
    feed.hidden = h.blocked(); const now = performance.now(); s.feed = s.feed.filter(f => now - f.t < 6500).slice(-5);
    const fh = s.feed.map(f => f.html).join(''); if (feed.dataset.html !== fh) { feed.dataset.html = fh; feed.innerHTML = fh; }
    const zone = document.querySelector('#zone-name'); if (zone && zone.textContent !== t('Flag Rush Isle')) zone.textContent = t('Flag Rush Isle');
  }
  function post(text: string, cls = '', small = false) { const s = session; if (!s) return; s.feed.push({ html: `<p class="${cls}${small ? ' small' : ''}">${small ? text : esc(text)}</p>`, t: performance.now() }); }
  function banner(title: string, sub: string, cls = '') {
    document.querySelectorAll('.ctf-banner').forEach(old => old.remove());
    const el = document.createElement('div'); el.className = 'ctf-banner ' + cls;
    el.innerHTML = `<strong>${esc(title)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    document.body.append(el); setTimeout(() => el.classList.add('leaving'), 2200); setTimeout(() => el.remove(), 2800);
  }
  const tagEls = new Map<string, HTMLDivElement>();
  function tagsFrame(s: Session) {
    tags.hidden = h.blocked(); if (tags.hidden) return;
    const seen = new Set<string>();
    for (const p of s.m.players) {
      if (!p.alive || (p.id !== ME && p.team !== s.team && p.carrying === null && (p.buffs.wisp > 0 || p.buffs.evade > 0))) continue;
      const lift = p.jump ? jumpLift(p.jump.t) : 0, scr = world.screen(p.x + C.x, 2.55 + lift + (p.buffs.bigcap > 0 ? 1.2 : 0), p.z + C.z);
      if (!scr.visible || Math.hypot(p.x + C.x - world.position.x, p.z + C.z - world.position.z) > 34) continue;
      seen.add(p.id); let el = tagEls.get(p.id);
      if (!el) { el = document.createElement('div'); el.className = 'ctf-tag'; tags.append(el); tagEls.set(p.id, el); }
      const html = `<span class="n t${p.team}">${p.carrying !== null ? '🚩 ' : ''}${esc(p.id === ME ? h.state().name : p.name)}</span>${p.team === s.team ? `<span class="hp"><i class="t${p.team}" style="width:${Math.round(p.hp / p.maxHp * 100)}%"></i></span>` : ''}`;
      if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
      el.style.transform = `translate(${scr.x.toFixed(0)}px, ${scr.y.toFixed(0)}px) translate(-50%, -100%)`; el.hidden = false;
    }
    for (const [id, el] of tagEls) if (!seen.has(id)) el.hidden = true;
  }

  // ---------------------------------------------------------------- home frame: the gate swirls, the keeper calls out
  function homeFrame(dt: number) {
    if (world.planet !== 'home' || world.interior || h.visiting() || !keeper) { keeperTag.hidden = bubble.hidden = true; return; }
    const p = world.position, K = GATE.keeper, d = Math.hypot(p.x - K.x, p.z - K.z);
    if (d < 22) requestKit(); // ctf.glb (63 KB): fetched only when the keeper is about to come into view
    const swirl = gateMesh?.getObjectByName('swirl'); if (swirl) swirl.rotation.z -= dt * 1.6;
    if (gateMesh && d < 30 && Math.random() < dt * 6) world.fx?.burst({ x: GATE.gate.x + (Math.random() - .5) * 3, z: GATE.gate.z }, { n: 1, color: ['#a86aff', '#6af0ff', '#ffffff'], glow: true, size: .12, speed: .6, up: 3, y: 1 + Math.random() * 3, life: .9, gravity: -1 });
    if (d < 10) { const target = Math.atan2(p.x - K.x, p.z - K.z), cur = keeper.mesh.rotation.y; keeper.mesh.rotation.y = cur + Math.atan2(Math.sin(target - cur), Math.cos(target - cur)) * Math.min(1, dt * 3); }
    const scr = world.screen(K.x, 2.7, K.z), show = scr.visible && d < 36 && !h.blocked();
    keeperTag.hidden = true;
    if (!said && d < 8) { said = true; sayT = 4; }
    if (d > 14) said = false;
    sayT -= dt; bubble.hidden = !(show && sayT > 0);
    if (!bubble.hidden) { const half = (bubble.offsetWidth || 200) / 2, x = Math.max(half + 8, Math.min(innerWidth - half - 8, scr.x)); bubble.style.transform = `translate(${x.toFixed(0)}px, ${(scr.y - 22).toFixed(0)}px) translate(-50%, -100%)`; const text = t('Touch me to play Flag Rush!'); if (bubble.textContent !== text) bubble.textContent = text; }
  }

  // ---------------------------------------------------------------- main.ts hooks
  const api = {
    get active() { return !!session; },
    get canAct() { const p = session && rulesPlayer(session.m, ME); return !session || !!p && canAct(session.m, p); },
    owns: (e: { id: string }) => !!session && session.bots.some(b => b.proxy?.id === e.id),
    open() { view = 'modes'; openGate(); },
    confirmLeave,
    /** Development hooks (window.__ctf): start a match at once, score, end, look inside. */
    quickStart(teamSize = 3, pick = 'dz_knight', seed = 1234) { if (session) return true; size = teamSize; hero = pick; return enter(teamSize, pick, seed); },
    skipIntro() { const s = session; if (s && s.m.phase === 'intro') s.m.timer = .01; },
    /** Puts the explorer next to the enemy flag (to grab it) or home (to score), for probes and screenshots. */
    warp(where: 'enemy-flag' | 'home' | 'mid') { const s = session; if (!s) return; const f = where === 'enemy-flag' ? s.m.flags[otherTeam(s.team)] : where === 'home' ? FIELD.stands[s.team] : { x: -8, z: 4 }; teleport(f.x + C.x + (where === 'home' ? .5 : 0), f.z + C.z + .6); s.last = { x: world.position.x, z: world.position.z }; movePlayer(s.m, ME, world.position.x - C.x, world.position.z - C.z); },
    /** Both flags back on their stands (probes). */
    homeFlags() { const s = session; if (!s) return; for (const f of s.m.flags) { f.state = 'home'; f.carrier = null; f.x = FIELD.stands[f.team].x; f.z = FIELD.stands[f.team].z; f.returnIn = 0; } for (const p of s.m.players) p.carrying = null; },
    setTime(seconds: number) { const s = session; if (s && (s.m.phase === 'play' || s.m.phase === 'overtime')) s.m.timer = seconds; },
    /** Freezes the bots (they stand where they are) for a calm screenshot. */
    calm(on = true) { const s = session; if (!s) return; for (const p of s.m.players) if (!p.human) p.stun = on ? 9999 : 0; },
    get match() { return session?.m ?? null; },
    get lastResult() { return lastResult; },
    get lastClaim() { return lastClaim; },
    leave, exit,
  };
  return api;
}
export type CtfApi = ReturnType<typeof initCtf>;
