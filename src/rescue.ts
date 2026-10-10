/**
 * Rescue Call at runtime (docs/RESCUE-CALL-PLAN.md, phase 1 "Hold the Line"): the SOS schedule and its toast, the
 * cracked portal by the south square (and its 📯 on the map), the briefing with the squad pick, and the mission itself
 * on a field built far out on the home map (like the Delvers' Vault and Flag Rush: entering sets the village aside and
 * leaving puts it back).
 *
 * Rules live in rescue-rules.ts (a pure, seeded, serialisable run), the squad's behaviour in rescue-ai.ts, the gear
 * ladder in rescue-ladder.ts, numbers and text in rescue-content.ts, drawing in rescue-view.ts. The orientation is
 * chosen once at entry from the screen's shape (landscape: your end left, raiders from the right; a phone held upright:
 * your end at the bottom, raiders from the top), so turning the phone mid-mission never flips the battlefield.
 *
 * The explorer fights with their real combat: each raider has an invisible stand-in body in world.enemies, and a hit
 * on it counts in multiples of the explorer's attack, landed as a hero of the mission's recommended level (so the
 * numbers stay fair whatever the explorer's level). Health works the same way. Nothing here touches the save: Spark,
 * Star bits, defences, the squad's borrowed gear and the hero's boosts end with the mission; only the validated
 * `rescueClaim` pays (rescue-claim.ts). There is no death bag inside a mission (main.ts checkDefeat asks `active`).
 */
import { assetUrl } from './asset-url.ts';
import * as T from 'three';
import './rescue.css';
import type { World, Enemy, Entity } from './world.ts';
import { buildAvatar, poseFriend, type FriendPose } from './friend-view.ts';
import { friendHeight, friendStage } from './growth.ts';
import { HIP, gaitSwing, newGait, stepGait, type Gait } from './walk-cycle.ts';
import { DEFAULT_LOOK, type LookId } from './looks.ts';
import type { SaveState } from './model.ts';
import { t } from './i18n.ts';
import { ITEMS, DISGUISES, PLANETS } from './content.ts';
import { ENEMY_TYPES } from './enemy-types.ts';
import { FRIENDS, type Friend } from './friends-state.ts';
import { friendLook } from './friend-looks.ts';
import { RESCUE, MISSIONS, MISSION_IDS, FIELDS, DEFENCES, DEFENCE_KINDS, BOOSTS, BOOST_KINDS, LADDER_STEPS, STEP_TEXT, SOS, RESCUE_REWARD, type MissionId, type DefenceKind, type BoostKind, type EnemyRole, type SquadRole, type Point } from './rescue-content.ts';
import { createRun, stepRun, startWave, placeDefence, upgradeDefence, sellDefence, buyStep, buyBoost, setOrder, heroHit, statusEnemy, pushBack, setHero, forfeit, claimOf, sellValue, stepCost, hero as runHero, unit as runUnit,
  chooseOrientation, wideScreen, toWorld, toLocal, facingToWorld, fieldYaw, buildField, totalWaves, heroHaste, heroCooldownScale, ME,
  type RsRun, type RsEvent, type RsUnit, type Orientation, type Field, type SquadSpec, type Refusal } from './rescue-rules.ts';
import { heroBot, autoPlan } from './rescue-ai.ts';
import { HELPER_ROLES, spreadRoles } from './rescue-ladder.ts';
import { fullWinsLeft, wavesLeft, isMission, type RescueClaimResult } from './rescue-claim.ts';
import { rescueKit, rescueIcon, buildPortal, buildFieldView, DefenceViews, EnemyViews, ShotViews, type FieldParts } from './rescue-view.ts';

interface Neighbour { id: string; name: string; level: number; color: string; gear: Record<string, string | undefined> }
export interface RescueHooks {
  world: World; state: () => SaveState; started: () => boolean; blocked: () => boolean; visiting: () => boolean; online: () => boolean;
  perform: <R = unknown>(type: string, payload: Record<string, unknown>, quiet?: boolean) => Promise<R | undefined>;
  toast: (message: string, icon?: string) => void; tone: (kind: string) => void;
  openDialog: (type: string, title: string, body: string, kicker?: string, icon?: string) => void; closeDialog: () => void;
  neighbours: () => { cast: readonly Neighbour[] } | null;
  attack: () => number; maxHp: () => number; updateHud: () => void; refreshPlayer: () => void;
  onFrame: (listener: (dt: number) => void) => void;
  /** The explorer's attack and skill timers (gameplay-controls.ts CombatTimers) and the skills' full lengths, for the Me tab's boosts. */
  combatTimers?: { attackCooldown: number; skills: number[] }; skillDurations?: number[];
}
const COOLDOWN_KEY = 'zoo-rescue-ready-at';
const RECOVERY_MS = 3 * 60_000;
const SOS_KEY = 'zoo-rescue-sos', CALLS_KEY = 'zoo-rescue-calls';
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const itemIcon = (id: string) => assetUrl(`icons/items/${id}.webp`);
const planetName = (id: MissionId) => t(PLANETS[MISSIONS[id].planet].name);
const enemyName = (kind: string) => t(ENEMY_TYPES[kind]?.name ?? kind);
const ROLE_ICON: Record<SquadRole, string> = { fighter: '⚔️', ranged: '🏹', support: '💚' };
const ENEMY_ROLE_ICON: Record<EnemyRole, string> = { runner: '💨', grunt: '👊', brute: '🛡️', flyer: '🪽', shooter: '🎯', splitter: '🫧', mini: '·', boss: '👑' };
const REFUSAL: Record<Refusal, string> = { phase: 'Not now', pad: 'Pick a build pad', spark: 'Not enough Spark', stars: 'Not enough Star bits', max: 'Max level', empty: 'Empty pad', taken: 'Built', unit: 'Squad' };

interface SosState { play: number; next: number; day: string; calls: number; call: { mission: MissionId; until: number } | null }
interface Session {
  m: RsRun; o: Orientation; field: Field; parts: FieldParts; defs: DefenceViews; raiders: EnemyViews; shots: ShotViews;
  saved: { root: T.Group; entities: Entity[]; enemies: Enemy[]; obstacles: World['obstacles']; detached: T.Object3D[]; background: T.Scene['background']; fog: T.Scene['fog']; onZone: World['onZone']; onStep: World['onStep']; beforeRender: World['beforeRender']; pointer: World['pointer']; hp: number; zoom: number };
  proxies: Map<number, Enemy>; pool: Enemy[]; squadRoot: T.Group; views: Map<string, { root: T.Group; key: string; gait: Gait; swing: number; t: number; attack: number; x: number; z: number }>;
  pad: number; tab: 'defences' | 'squad' | 'me'; tryOn: { id: string; until: number } | null; focusUntil: number;
  ended: boolean; claimed: boolean; claim: RescueClaimResult | null; hpWritten: number; heroWasDown: boolean; autopilot: boolean; bot: { cd: number };
  pending: RsEvent[]; time: number;
}

export function initRescue(h: RescueHooks) {
  const world = h.world;
  /**
   * Takes a drawn object out of the scene and frees its GPU data a little later: main.ts warms shaders with
   * renderer.compileAsync, whose polling breaks on a material disposed while it still waits (three r180).
   */
  const retire = (o: T.Object3D, also?: () => void) => { o.removeFromParent(); setTimeout(() => { world.disposeTree(o); also?.(); }, 20_000); };
  let session: Session | null = null, portal: Entity | null = null, portalMesh: T.Group | null = null, restored = false;
  let briefing: { mission: MissionId; picks: string[] } | null = null, lastClaim: RescueClaimResult | null = null, lastResult: RsRun['result'] = null;
  let sos: SosState = loadSos(), saveT = 0, said = false, sayT = 0;

  const recoveryLeft = () => { try { const at = Number(localStorage.getItem(COOLDOWN_KEY)); return Number.isFinite(at) ? Math.max(0, Math.ceil((Math.min(at, Date.now() + RECOVERY_MS) - Date.now()) / 1000)) : 0; } catch { return 0; } };
  const recoveryText = () => t('Rescue team recovering: {n}s remaining.', { n: recoveryLeft() });

  // ---------------------------------------------------------------- DOM
  const hud = div('rescue-hud'), panel = div('rescue-build'), tags = div('rescue-tags'), down = div('rescue-down'), bubble = div('rescue-say');
  hud.setAttribute('role', 'status'); hud.hidden = panel.hidden = tags.hidden = down.hidden = bubble.hidden = true;
  function div(id: string) { const el = document.createElement('div'); el.id = id; document.body.append(el); return el; }
  document.addEventListener('click', event => { if (session && (event.target as HTMLElement).closest?.('[data-action="return-home"]')) { event.preventDefault(); event.stopImmediatePropagation(); confirmLeave(); } }, true);
  document.addEventListener('click', event => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-rescue]'); if (!el) return;
    const what = el.dataset.rescue!, s = session;
    if (what === 'calls') { event.preventDefault(); event.stopPropagation(); setCalls(!callsOn()); el.classList.toggle('on', callsOn()); el.setAttribute('aria-checked', String(callsOn())); return; }
    if (what === 'mission' && isMission(el.dataset.mission)) { briefing = { mission: el.dataset.mission, picks: defaultPicks() }; openBriefing(); return; }
    if (what === 'pick' && briefing) { togglePick(el.dataset.id!); openBriefing(); return; }
    if (what === 'go' && briefing) { h.closeDialog(); start(briefing.mission, briefing.picks); return; }
    if (what === 'later') { h.closeDialog(); return; }
    if (what === 'leave') { confirmLeave(); return; }
    if (what === 'leave-yes') { h.closeDialog(); leave(); return; }
    if (what === 'close') { h.closeDialog(); return; }
    if (what === 'again') { h.closeDialog(); const mission = s?.m.mission ?? briefing?.mission ?? 'toy', picks = s ? s.m.units.slice(1).map(u => u.id) : briefing?.picks ?? []; if (s) exit(); start(mission, picks); return; }
    if (what === 'home') { h.closeDialog(); exit(); return; }
    if (!s) return;
    if (what === 'tab') { s.tab = (el.dataset.tab as Session['tab']) ?? 'defences'; renderPanel(true); }
    else if (what === 'pad') { selectPad(Number(el.dataset.pad), true); }
    else if (what === 'place') act(placeDefence(s.m, s.pad, el.dataset.kind as DefenceKind));
    else if (what === 'upgrade') act(upgradeDefence(s.m, s.pad));
    else if (what === 'sell') act(sellDefence(s.m, s.pad));
    else if (what === 'step') act(buyStep(s.m, el.dataset.id!));
    else if (what === 'try') { s.tryOn = { id: el.dataset.id!, until: s.time + 4 }; const u = runUnit(s.m, el.dataset.id!); if (u) focus(u, 4); h.tone('magic'); renderPanel(true); }
    else if (what === 'boost') act(buyBoost(s.m, el.dataset.kind as BoostKind));
    else if (what === 'ready') { s.m.phase === 'build' && handle(startWave(s.m)); }
    else if (what === 'order') { setOrder(s.m, s.m.order === 'hold' ? 'follow' : 'hold'); h.toast(t(s.m.order === 'hold' ? 'Squad order: Hold' : 'Squad order: Follow me'), s.m.order === 'hold' ? '🛡️' : '👣'); h.tone('pop'); renderHud(true); }
    else if (what === 'panel') { panel.classList.toggle('folded'); }
  });
  function act(r: RsEvent[] | Refusal) {
    const s = session; if (!s) return;
    if (typeof r === 'string') { h.toast(t(REFUSAL[r]), r === 'stars' ? '⭐' : '✨'); h.tone('error'); return; }
    handle(r); renderPanel(true); renderHud(true);
  }

  // ---------------------------------------------------------------- SOS: the schedule, the setting, the portal
  function callsOn() { try { return localStorage.getItem(CALLS_KEY) !== 'off'; } catch { return true; } }
  function setCalls(on: boolean) { try { localStorage.setItem(CALLS_KEY, on ? 'on' : 'off'); } catch { /* optional */ } if (!on && sos.call) { sos.call = null; saveSos(); decorateHome(); } }
  function loadSos(): SosState {
    const fresh: SosState = { play: 0, next: SOS.first * 60, day: '', calls: 0, call: null };
    try { const v = JSON.parse(localStorage.getItem(SOS_KEY) ?? 'null') as SosState | null; if (v && Number.isFinite(v.play) && Number.isFinite(v.next)) return { ...fresh, ...v, call: v.call && isMission(v.call.mission) ? v.call : null }; } catch { /* fresh */ }
    return fresh;
  }
  function saveSos() { try { localStorage.setItem(SOS_KEY, JSON.stringify(sos)); } catch { /* optional */ } }
  // Mission unlocks and reward caps are independent of portal availability.
  /** Missions the explorer's level opens (their planet's landing level). */
  const open = () => MISSION_IDS.filter(id => h.state().level >= PLANETS[MISSIONS[id].planet].level);
  let wasRecovering = recoveryLeft() > 0;
  function sosFrame(dt: number) {
    if (!h.started() || h.visiting() || document.hidden || session) return;
    sos.play += dt; saveT += dt;
    const recovering = recoveryLeft() > 0;
    if (wasRecovering && !recovering && callsOn()) h.toast(t('Rescue ready — choose a mission!'), '📯');
    wasRecovering = recovering;
    if (saveT > 10) { saveT = 0; saveSos(); }
  }
  function call(mission: MissionId) {
    sos.call = { mission, until: sos.play + SOS.lasts * 60 }; saveSos();
    const md = MISSIONS[mission];
    h.toast(`${t('An SOS from {planet}!', { planet: planetName(mission) })} ${t('{friend} needs help! A rescue portal opened by the south square.', { friend: t(md.friend) })}`, '📯');
    h.tone('alert'); decorateHome();
  }
  function decorateHome() {
    if (portal) { const p = portal; world.entities = world.entities.filter(e => e !== p); retire(p.mesh); world.obstacles = world.obstacles.filter(o => o.tag !== 'rescue-portal'); }
    portal = null; portalMesh = null;
    if (world.planet !== 'home' || session || world.interior) return;
    const P = RESCUE.portal, inWay = (p: { x: number; z: number }) => Math.hypot(p.x - P.x, p.z - P.z) < 3.2;
    const kept = world.decor.filter(p => !inWay(p)); if (kept.length !== world.decor.length) { world.decor = kept; world.obstacles = world.obstacles.filter(o => !inWay(o)); world.refreshScenery(); }
    if (!rescueKit.requested) void rescueKit.load().then(() => { if (!session) decorateHome(); });
    portalMesh = buildPortal(); portalMesh.rotation.y = -.25;
    portal = world.addEntity('rescue-portal', 'Rescue portal', '📯', portalMesh, P.x, P.z, 2.2);
    for (const s of [-1, 1]) world.obstacles.push({ x: P.x + s * 2.3, z: P.z, r: .45, tag: 'rescue-portal' } as World['obstacles'][number]);
  }
  const previousBuilt = world.onBuilt; world.onBuilt = () => { previousBuilt?.(); decorateHome(); };
  decorateHome();
  const previousInteract = world.onInteract;
  world.onInteract = e => { if (e.kind === 'rescue-portal') { briefing = { mission: sos.call?.mission ?? open()[0] ?? 'toy', picks: defaultPicks() }; openBriefing(); return; } previousInteract(e); };

  // ---------------------------------------------------------------- briefing and squad pick
  interface Candidate { id: string; name: string; kind: 'helper' | 'neighbour'; role: SquadRole | null; color: string; look?: string; friend?: string; level?: number }
  function candidates(): Candidate[] {
    const st = h.state(), out: Candidate[] = [];
    for (const f of (st.friends ?? []) as Friend[]) out.push({ id: 'rs-friend:' + f.id, name: FRIENDS[f.id].name, kind: 'helper', role: HELPER_ROLES[f.id] ?? null, color: FRIENDS[f.id].tint, look: friendLook(f), friend: f.id });
    for (const n of h.neighbours()?.cast ?? []) out.push({ id: 'rs-bot:' + n.id, name: n.name, kind: 'neighbour', role: null, color: n.color, level: n.level });
    return out;
  }
  const defaultPicks = () => candidates().slice(0, RESCUE.maxSquad - 1).map(c => c.id);
  function togglePick(id: string) { if (!briefing) return; const i = briefing.picks.indexOf(id); if (i >= 0) briefing.picks.splice(i, 1); else if (briefing.picks.length < RESCUE.maxSquad - 1) briefing.picks.push(id); }
  function openBriefing() {
    if (!briefing) return; void rescueKit.load();
    const md = MISSIONS[briefing.mission], list = candidates(), st = h.state();
    const roles = new Map<EnemyRole, string>(); for (const w of md.waves) for (const g of w.groups) if (g.role !== 'boss' && md.kinds[g.role]) roles.set(g.role, md.kinds[g.role]!);
    const boss = md.kinds.boss ? enemyName(md.kinds.boss) : '';
    const locked = st.level < PLANETS[md.planet].level;
    h.openDialog('rescue', md.title, `<div class="rescue-dialog">
      <p>${esc(t('Choose a rescue any time. The team rests for 3 minutes after each run.'))}</p>
      <div class="rescue-actions">${MISSION_IDS.map(id => `<button data-rescue="mission" data-mission="${id}" aria-pressed="${briefing!.mission === id}">${esc(planetName(id))}</button>`).join('')}</div>
      ${recoveryLeft() ? `<p role="status">${esc(recoveryText())}</p>` : ''}
      <p class="rescue-lead"><span class="rescue-friend">${md.friendIcon}</span><i>“${esc(t(md.story))}”</i><b>— ${esc(t(md.friend))}</b></p>
      <div class="rescue-facts"><span>🪐 ${esc(planetName(briefing.mission))}</span><span>🌊 ${esc(t('{n} waves', { n: md.waves.length }))}</span><span class="${locked ? 'warn' : ''}">⭐ ${esc(t('Recommended level {n}', { n: md.level }))}</span><span>❤️ ${RESCUE.hearts}</span></div>
      <h4>${esc(t('Enemies'))}</h4><div class="rescue-foes">${[...roles].map(([role, kind]) => `<span title="${esc(t(role))}">${ENEMY_ROLE_ICON[role]} ${esc(enemyName(kind))} <small>${esc(t(role))}</small></span>`).join('')}<span class="boss">👑 ${esc(t('Last wave: {boss}', { boss }))}</span></div>
      <p class="rescue-rule">${esc(t('Place defences on the pads, then start the wave. Enemies walk in from the far end; stop them before they reach the farmhouse.'))}</p>
      <h4>${esc(t('Pick your squad'))} <small>${esc(t('Up to {n} with you', { n: RESCUE.maxSquad - 1 }))}</small></h4>
      <div class="rescue-squad"><button class="sel me" disabled><b>🧑 ${esc(st.name)}</b><small>${esc(t('(you)'))}</small></button>${list.length ? list.map(c => { const on = briefing!.picks.includes(c.id); return `<button data-rescue="pick" data-id="${esc(c.id)}" class="${on ? 'sel' : ''}" aria-pressed="${on}"><b data-i18n-skip><i style="background:${esc(c.color)}"></i>${esc(c.name)}</b><small>${esc(t(c.kind === 'helper' ? 'Helper' : 'Neighbour'))}${c.role ? ' · ' + ROLE_ICON[c.role] + ' ' + esc(t(c.role)) : ''}</small></button>`; }).join('') : `<p class="muted">${esc(t('No squad yet: rescue friends or turn on AI neighbours.'))}</p>`}</div>
      <p class="rescue-note">${esc(t('Your squad starts with plain clothes and a punch. Spend Spark and Star bits to climb their gear ladder.'))} <b>${esc(t('Rescues with full rewards left today: {n}', { n: fullWinsLeft(st, Date.now()) }))}</b></p>
      <div class="rescue-actions">${locked ? `<button class="primary" disabled aria-disabled="true">🔒 ${esc(t('Locked: level {n}', { n: md.level }))}</button>` : `<button class="primary" data-rescue="go">📯 ${esc(t('Go to the rescue'))}</button>`}<button data-rescue="later">${esc(t('Not now'))}</button></div></div>`, 'RESCUE CALL', '📯');
  }

  // ---------------------------------------------------------------- the mission
  function start(mission: MissionId, picks: string[], o?: Orientation, seed = (Date.now() ^ 0x5c0e) >>> 0) {
    if (session || world.interior || world.planet !== 'home' || h.visiting()) return false;
    if (recoveryLeft()) { h.toast(recoveryText(), '⏳'); openBriefing(); return false; }
    if (!isMission(mission) || !open().includes(mission)) { h.toast(t('Locked: level {n}', { n: MISSIONS[mission]?.level ?? 1 }), '🔒'); return false; }
    void rescueKit.load();
    const orient = o ?? chooseOrientation(innerWidth, innerHeight), wide = wideScreen(orient, innerWidth);
    const pool = candidates(), chosen = picks.map(id => pool.find(c => c.id === id)).filter((c): c is Candidate => !!c).slice(0, RESCUE.maxSquad - 1);
    const roles = spreadRoles(chosen.map(c => c.role));
    const squad: SquadSpec[] = chosen.map((c, i) => ({ id: c.id, name: c.name, kind: c.kind, role: roles[i], color: c.color, look: c.look, friend: c.friend }));
    const st = h.state();
    const m = createRun({ id: 'rescue-' + seed.toString(36) + '-' + Date.now().toString(36), seed, mission, wide, squad, heroDisguise: st.gear.disguise ?? null, heroName: st.name });
    if (sos.call?.mission === mission) { sos.call = null; saveSos(); }
    return enter(m, orient);
  }
  function enter(m: RsRun, o: Orientation) {
    const st = h.state(), field = buildField(m.mission, m.wide), md = MISSIONS[m.mission];
    if (portal) { const p = portal; world.entities = world.entities.filter(e => e !== p); p.mesh.removeFromParent(); portal = null; }
    const saved: Session['saved'] = { root: world.root, entities: world.entities, enemies: world.enemies, obstacles: world.obstacles, detached: [], background: world.scene.background, fog: world.scene.fog, onZone: world.onZone, onStep: world.onStep, beforeRender: world.beforeRender, pointer: world.pointer, hp: st.hp, zoom: world.zoom };
    for (const child of [...world.root.children]) if (child !== world.player && child !== world.companion) { saved.detached.push(child); world.root.remove(child); }
    world.entities = []; world.enemies = []; world.obstacles = fieldObstacles(field, o);
    world.onZone = () => {}; world.onStep = undefined; world.beforeRender = undefined; world.playerLift = 0;
    const w = world as unknown as Record<string, unknown>; w.applyEnemySnapshots = () => {}; w.applyAuthoritativeEnemyHealth = () => {}; w.enemySnapshots = () => [];
    const parts = buildFieldView(field, m.mission), C = RESCUE.arena;
    parts.root.position.set(C.x, 0, C.z); parts.root.rotation.y = fieldYaw(o); world.root.add(parts.root);
    const makeModel = (type: string) => { const fn = (world as unknown as { enemyModel?: (t: string, d: unknown) => T.Object3D }).enemyModel; const def = ENEMY_TYPES[type]; return fn && def ? fn.call(world, type, def) : null; };
    const defs = new DefenceViews(field, retire), raiders = new EnemyViews(m.mission, makeModel), shots = new ShotViews();
    const squadRoot = new T.Group(); squadRoot.name = 'rescue-squad';
    parts.root.add(defs.root, raiders.root, shots.root, squadRoot);
    // The kit file may arrive after the field was built from stand-ins: then the field is drawn again with its art.
    if (!rescueKit.ready) void rescueKit.load().then(() => { if (session && session.m === m && rescueKit.ready) refreshArt(session, makeModel); });
    world.scene.background = new T.Color(md.sky); world.scene.fog = new T.Fog(md.fog, 70, 160);
    world.zoom = Math.max(world.zoom, o === 'portrait' ? 1.7 : 1.8); world.resize();
    const s: Session = { m, o, field, parts, defs, raiders, shots, saved, proxies: new Map(), pool: [], squadRoot, views: new Map(), pad: -1, tab: 'defences', tryOn: null, focusUntil: 0,
      ended: false, claimed: false, claim: null, hpWritten: -1, heroWasDown: false, autopilot: false, bot: { cd: 0 }, pending: [], time: 0 };
    session = s;
    // Taps on a build pad pick it at once (no walking there); any other tap moves the explorer as usual.
    world.pointer = (x: number, y: number) => { const pad = padAt(x, y); if (pad >= 0 && s.m.phase !== 'over') { selectPad(pad, false); world.destination = null; world.route = []; world.marker.visible = false; return; } saved.pointer.call(world, x, y); };
    const me = runHero(m); const at = toWorld(me, o); teleport(at.x, at.z, facingToWorld(Math.PI / 2, o));
    st.hp = h.maxHp(); s.hpWritten = st.hp;
    try { localStorage.setItem('zoo-rescue-restore', JSON.stringify({ hp: saved.hp })); } catch { /* optional */ }
    document.body.classList.add('in-rescue', 'in-mode'); document.body.dataset.rescueOrient = o;
    hud.hidden = false; tags.hidden = false; panel.hidden = false; panel.classList.remove('folded'); bubble.hidden = true;
    selectPad(nearestEmptyPad(s), false);
    h.refreshPlayer(); h.tone('level'); banner(t(md.title), `${md.friendIcon} ${t(md.friend)} · ${t('{n} waves', { n: md.waves.length })}`);
    world.fx?.burst({ x: world.position.x, z: world.position.z }, { n: 40, color: ['#ff8a4d', '#ffd23f', '#ffffff'], glow: true, speed: 5, up: 9 });
    renderHud(true); renderPanel(true); h.updateHud();
    return true;
  }
  function refreshArt(s: Session, makeModel: (type: string) => T.Object3D | null) {
    const old = s.parts.root, parts = buildFieldView(s.field, s.m.mission), raiders = new EnemyViews(s.m.mission, makeModel);
    parts.root.position.copy(old.position); parts.root.rotation.copy(old.rotation);
    old.remove(s.defs.root, s.raiders.root, s.shots.root, s.squadRoot); retire(old);
    s.raiders.root.removeFromParent(); s.raiders.dispose();
    parts.root.add(s.defs.root, raiders.root, s.shots.root, s.squadRoot); world.root.add(parts.root);
    s.parts = parts; s.raiders = raiders;
  }
  /** The field's solid things in world coordinates: the farmhouse, the camp's tent and the decor (never the pads or lanes). */
  function fieldObstacles(field: Field, o: Orientation) {
    void field; const list: Array<{ x: number; z: number; r: number }> = [];
    const add = (p: Point, r: number) => { const w = toWorld(p, o); list.push({ x: w.x, z: w.z, r }); };
    add({ x: RESCUE.camp.x - 4.6, z: 0 }, 2.6); add({ x: RESCUE.camp.x, z: -7.3 }, 1.5);
    for (const [, x, z] of FIELDS[field.mission].decor) add({ x, z }, .9);
    return list;
  }
  function teleport(x: number, z: number, facing = world.facing) { world.position.set(x, 0, z); world.facing = facing; world.destination = null; world.route = []; world.marker.visible = false; world.cameraTarget.copy(world.position); }
  const raycaster = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
  function padAt(x: number, y: number) {
    const s = session; if (!s) return -1;
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); raycaster.setFromCamera(ndc, world.camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return -1;
    const p = toLocal({ x: hit.x, z: hit.z }, s.o); let best = -1, bd = 1.7;
    s.field.pads.forEach((pad, i) => { const d = Math.hypot(pad.x - p.x, pad.z - p.z); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function nearestEmptyPad(s: Session) { const me = runHero(s.m); let best = 0, bd = Infinity; s.field.pads.forEach((p, i) => { if (s.m.defences[i]) return; const d = Math.hypot(p.x - me.x, p.z - me.z) + (p.x > 0 ? 0 : -6); if (d < bd) { bd = d; best = i; } }); return best; }
  function selectPad(i: number, fromPanel: boolean) {
    const s = session; if (!s || !(i >= 0 && i < s.field.pads.length)) return;
    s.pad = i; s.tab = 'defences'; panel.classList.remove('folded');
    if (fromPanel) focus(s.field.pads[i], 1.6);
    h.tone('pop'); renderPanel(true);
  }
  function focus(p: Point, seconds: number) { const s = session; if (!s) return; const w = toWorld(p, s.o); world.cameraFocus = lookAt.set(w.x, 0, w.z); s.focusUntil = s.time + seconds; }
  function confirmLeave() {
    if (!session) return;
    if (session.m.phase === 'over') { exit(); return; }
    h.openDialog('rescue-leave', 'Leave the mission', `<p class="center">${esc(t('Leave the rescue? Waves you held still count.'))}</p><div class="rescue-actions"><button class="primary" data-rescue="leave-yes">${esc(t('Leave'))}</button><button data-rescue="close">${esc(t('Stay'))}</button></div>`, 'RESCUE CALL', '🚪');
  }
  function leave() { const s = session; if (!s) return; if (s.m.phase !== 'over') handle(forfeit(s.m)); else exit(); }
  function exit() {
    const s = session; if (!s || s.ended) return; s.ended = true;
    const rebuilt = world.root !== s.saved.root;
    for (const e of [...s.proxies.values(), ...s.pool]) e.mesh.removeFromParent();
    retire(s.parts.root, () => { s.defs.dispose(); s.raiders.dispose(); });
    const w = world as unknown as Record<string, unknown>; delete w.applyEnemySnapshots; delete w.applyAuthoritativeEnemyHealth; delete w.enemySnapshots;
    world.pointer = s.saved.pointer; world.cameraFocus = null; world.playerLift = 0;
    world.onZone = s.saved.onZone; world.onStep = s.saved.onStep; world.beforeRender = s.saved.beforeRender;
    if (!rebuilt) {
      world.entities = s.saved.entities; world.enemies = s.saved.enemies; world.obstacles = s.saved.obstacles;
      for (const child of s.saved.detached) world.root.add(child);
      world.scene.background = s.saved.background; world.scene.fog = s.saved.fog;
      teleport(RESCUE.portal.x, RESCUE.portal.z - 3.5, Math.PI);
    } else for (const child of s.saved.detached) world.disposeTree(child);
    world.zoom = s.saved.zoom; world.resize();
    const st = h.state(); st.hp = Math.max(1, Math.min(h.maxHp(), s.saved.hp));
    wasRecovering = true;
    try { localStorage.setItem(COOLDOWN_KEY, String(Date.now() + RECOVERY_MS)); } catch { /* storage optional */ }
    session = null; world.selected = null; world.ring.visible = false; world.movementLocked = false;
    try { localStorage.removeItem('zoo-rescue-restore'); } catch { /* fine */ }
    document.body.classList.remove('in-rescue', 'in-mode'); delete document.body.dataset.rescueOrient;
    hud.hidden = panel.hidden = tags.hidden = down.hidden = true; tags.innerHTML = ''; tagEls.clear();
    decorateHome(); h.refreshPlayer(); h.updateHud(); h.toast(t('Welcome back from the rescue.'), '📯');
  }
  /** A reload in the middle of a mission: the explorer's health comes back (nothing else was ever saved). */
  function restoreAfterReload() { try { const raw = localStorage.getItem('zoo-rescue-restore'); if (!raw) return; localStorage.setItem(COOLDOWN_KEY, String(Date.now() + RECOVERY_MS)); wasRecovering = true; localStorage.removeItem('zoo-rescue-restore'); const v = JSON.parse(raw) as { hp: number }; if (Number.isFinite(v.hp) && v.hp > 0) h.state().hp = Math.min(h.maxHp(), v.hp); } catch { /* nothing */ } }

  // ---------------------------------------------------------------- the frame
  const camQ = new T.Quaternion(), rootQ = new T.Quaternion(), lookAt = new T.Vector3(), LOOK_AHEAD = 5;
  h.onFrame(dt => {
    if (!h.started()) return;
    if (!restored) { restored = true; restoreAfterReload(); }
    if (!session) { sosFrame(dt); homeFrame(dt); return; }
    const s = session;
    if (world.root !== s.saved.root) { exit(); return; }
    s.time += dt;
    const m = s.m, paused = h.blocked() && m.phase !== 'over' && !h.online();
    if (!paused) {
      inputFrame(s, dt);
      foeStatuses(s);
      const out = [...s.pending.splice(0), ...stepRun(m, dt)];
      handle(out);
      if (!session) return;
      outputFrame(s);
    }
    if (s.focusUntil && s.time > s.focusUntil) s.focusUntil = 0;
    // Without a picked focus, the camera looks a little ahead of the explorer toward the raiders' side.
    if (!s.focusUntil) { const me = runHero(s.m), p = me.down > 0 ? RESCUE.camp : toLocal(world.position, s.o), w = toWorld({ x: p.x + (s.o === 'portrait' ? 7 : LOOK_AHEAD), z: p.z * .85 }, s.o); world.cameraFocus = lookAt.set(w.x, 0, w.z); }
    if (s.tryOn && s.time > s.tryOn.until) { s.tryOn = null; renderPanel(true); }
    // Billboards face the camera in the field root's own space (the root turns for portrait).
    s.parts.root.getWorldQuaternion(rootQ); camQ.copy(rootQ.invert()).multiply(world.camera.quaternion);
    s.raiders.update(m, s.time, camQ); s.defs.update(m.defences, dt, s.time, camQ); s.shots.update(dt);
    proxiesFrame(s); squadFrame(s, dt); padMarker(s); renderHud(false); renderPanel(false); tagsFrame(s); downFrame(s);
  });
  function inputFrame(s: Session, dt: number) {
    const me = runHero(s.m);
    if (me.down > 0) { const camp = toWorld({ x: RESCUE.camp.x + 2, z: RESCUE.camp.z }, s.o); world.position.x = camp.x; world.position.z = camp.z; world.destination = null; world.route = []; return; }
    if (s.autopilot) { heroBot(s.m, dt, s.pending, s.bot); const w = toWorld(me, s.o); world.position.x = w.x; world.position.z = w.z; world.facing = facingToWorld(me.facing, s.o); return; }
    // Keep the explorer on the field.
    const p = toLocal(world.position, s.o), x = Math.max(-RESCUE.half.x - 1, Math.min(RESCUE.half.x + 1, p.x)), z = Math.max(-RESCUE.half.z - 1, Math.min(RESCUE.half.z + 1, p.z));
    if (x !== p.x || z !== p.z) { const w = toWorld({ x, z }, s.o); world.position.x = w.x; world.position.z = w.z; }
    setHero(s.m, x, z);
    // Health the explorer's own skills changed (heals, regeneration) counts in the mission too.
    const st = h.state(); if (Math.abs(st.hp - s.hpWritten) > .5 && me.down <= 0) me.hp = Math.max(1, Math.min(me.maxHp, st.hp / h.maxHp() * me.maxHp));
  }
  function outputFrame(s: Session) {
    const me = runHero(s.m), st = h.state(), want = me.down > 0 ? 1 : Math.max(1, Math.round(me.hp / me.maxHp * h.maxHp()));
    if (st.hp !== want) st.hp = want; s.hpWritten = st.hp;
    if (s.heroWasDown && me.down <= 0) { const c = toWorld({ x: RESCUE.camp.x + 2, z: RESCUE.camp.z }, s.o); teleport(c.x, c.z, facingToWorld(Math.PI / 2, s.o)); }
    s.heroWasDown = me.down > 0;
  }
  /** Stuns, slows and knock-backs the explorer's kit put on a stand-in hold the raider in the rules too. */
  function foeStatuses(s: Session) {
    for (const [id, e] of s.proxies) {
      const st = e.statuses ?? {}, hold = Math.max(e.stun, st.stun ?? 0, st.sheep ?? 0, st.fear ?? 0);
      if (hold > 0) { statusEnemy(s.m, id, 'stun', hold); e.stun = 0; for (const k of ['stun', 'sheep', 'fear']) if (st[k]) st[k] = 0; }
      if ((st.slow ?? 0) > 0) { statusEnemy(s.m, id, 'slow', st.slow!); st.slow = 0; }
      const r = s.m.enemies.find(v => v.id === id); if (!r) continue;
      const w = toWorld(r, s.o), moved = Math.hypot(e.x - w.x, e.z - w.z); if (moved > .4) pushBack(s.m, id, moved);
    }
  }
  // ---------------------------------------------------------------- stand-in bodies for the explorer's combat
  function proxiesFrame(s: Session) {
    const live = new Set<number>();
    for (const r of s.m.enemies) {
      if (r.hp <= 0) continue; live.add(r.id);
      let e = s.proxies.get(r.id);
      if (!e) e = takeProxy(s, r.id, r.kind, r.boss, r.air);
      const w = toWorld(r, s.o); e.x = w.x; e.z = w.z; e.hp = r.hp; e.maxHp = r.maxHp; e.mesh.position.set(w.x, r.air ? 1.2 : 0, w.z); e.mesh.visible = true; e.dying = 0;
    }
    for (const [id, e] of s.proxies) if (!live.has(id)) { s.proxies.delete(id); e.hp = 0; e.mesh.visible = false; if (world.selected === e) { world.selected = null; world.ring.visible = false; } s.pool.push(e); }
  }
  const PICK = new T.CylinderGeometry(.75, .75, 2, 8).translate(0, 1, 0), PICK_MAT = new T.MeshBasicMaterial({ visible: false });
  PICK.userData.sharedKit = PICK_MAT.userData.sharedKit = true;
  function takeProxy(s: Session, id: number, kind: string, boss: boolean, air: boolean) {
    const def = ENEMY_TYPES[kind];
    let e = s.pool.pop();
    if (!e) {
      const g = new T.Group(); g.add(new T.Mesh(PICK, PICK_MAT)); g.userData.footprint = .7;
      e = world.addEntity('enemy', '', '⚔️', g, 0, 0, .8) as Enemy;
      e.driver = { incoming: (target, amount) => incoming(target, amount) };
    } else if (!world.entities.includes(e)) world.entities.push(e);
    const radius = boss ? 1.5 : air ? .6 : .75;
    Object.assign(e, { id: 'rescue:' + id, name: def?.name ?? kind, type: 'rescue-' + kind, radius, hp: 1, maxHp: 1, baseMaxHp: 1, damage: 0, baseDamage: 0, xp: 0, level: MISSIONS[s.m.mission].level, homeX: 0, homeZ: 0, cooldown: 0, respawn: 0, boss, stun: 0, phase: 'chase', phaseTime: 0, route: [], routeTime: 0, lift: 0, liftVelocity: 0, statuses: {}, scaled: true, lastHitAt: Infinity, dying: 0 });
    e.mesh.scale.setScalar(boss ? 1.9 : 1); e.mesh.userData.pickHeight = boss ? 3.4 : air ? 2.4 : 1.8;
    if (!world.enemies.includes(e)) world.enemies.push(e);
    s.proxies.set(id, e); return e;
  }
  /** The explorer's hit on a stand-in: measured in multiples of their attack, landed as the mission hero's. */
  function incoming(e: Enemy, amount: number) {
    const s = session; if (!s || !(amount > 0)) return 0;
    const id = Number(e.id.slice('rescue:'.length));
    return heroHit(s.m, id, amount / Math.max(1, h.attack()), s.pending);
  }

  // ---------------------------------------------------------------- the squad, drawn as avatars
  /** The gear a member shows: its ladder step, or the next one while it tries that on. */
  function shownGear(s: Session, u: RsUnit): SaveState['gear'] {
    const trying = s.tryOn?.id === u.id, step = trying ? Math.min(LADDER_STEPS, u.step + 1) : u.step, g = u.ladder[step] ?? {};
    return { ...(g.weapon ? { weapon: g.weapon } : {}), ...(g.outfit ? { outfit: g.outfit } : {}), ...(g.disguise ? { disguise: g.disguise } : {}) } as SaveState['gear'];
  }
  /** Members are drawn like rescued friends (friend-view.ts buildAvatar: merged parts, no shadow casting), in the field's own space. */
  function squadFrame(s: Session, dt: number) {
    s.m.units.forEach((u, index) => {
      if (u.id === ME) return;
      const gear = shownGear(s, u), key = JSON.stringify(gear) + (u.look ?? '');
      let v = s.views.get(u.id);
      if (!v || v.key !== key) {
        const f = u.friend ? (h.state().friends ?? []).find(x => x.id === u.friend) : undefined;
        const height = u.kind === 'helper' ? Math.max(.72, f ? friendHeight(friendStage(f)) : .72) : 1;
        const root = buildAvatar(u.color, u.friend ? FRIENDS[u.friend as keyof typeof FRIENDS]?.hair ?? null : null, gear, height, (u.look ?? DEFAULT_LOOK) as LookId);
        root.name = 'rescue-squad-' + u.id; noPickTree(root);
        if (v) { root.position.copy(v.root.position); root.rotation.y = v.root.rotation.y; retire(v.root); }
        s.squadRoot.add(root);
        v = { root, key, gait: v?.gait ?? newGait(), swing: .6, t: v?.t ?? index * 1.3, attack: 0, x: u.x, z: u.z };
        s.views.set(u.id, v);
      }
      const at = u.down > 0 ? { x: RESCUE.camp.x - 1.5, z: RESCUE.camp.z - 3 + index * 1.5 } : u;
      const moved = Math.hypot(at.x - v.x, at.z - v.z); v.x = at.x; v.z = at.z; v.t += dt; v.attack = Math.max(0, v.attack - dt);
      const leg = HIP * v.root.scale.x; stepGait(v.gait, moved < 1 ? moved : 0, dt, leg); if (moved > 0) v.swing = gaitSwing(moved / Math.max(dt, 1e-4), leg);
      v.root.position.set(at.x, 0, at.z);
      const want = u.down > 0 ? Math.PI / 2 : u.facing, cur = v.root.rotation.y; v.root.rotation.y = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 12);
      const pose: FriendPose = s.m.result?.won ? 'cheer' : u.down > 0 ? 'sad' : moved > .002 ? 'walk' : 'idle';
      poseFriend(v.root, pose, v.t, v.gait, v.swing);
      // A blow: the right arm swings down (and a little lean into it).
      if (v.attack > 0) { const model = v.root.userData.model as T.Object3D, arm = model?.getObjectByName('arm-right'), k = Math.sin((1 - v.attack / .25) * Math.PI); if (arm) arm.rotation.set(-2.2 * k, 0, .3); if (model) model.rotation.x += .15 * k; }
    });
  }
  const noPickTree = (o: T.Object3D) => { o.traverse(c => { c.raycast = () => {}; }); };

  // ---------------------------------------------------------------- events → effects
  const at = (p: Point, y = 0) => { const s = session!; const w = toWorld(p, s.o); return { x: w.x, y, z: w.z }; };
  const near = (p: Point, r = 26) => { const s = session!; const w = toWorld(p, s.o); return Math.hypot(w.x - world.position.x, w.z - world.position.z) < r; };
  function handle(events: RsEvent[]) {
    const s = session; if (!s) return; const fx = world.fx, m = s.m;
    for (const ev of events) switch (ev.kind) {
      case 'wave': { const md = MISSIONS[m.mission]; banner(t('Wave {n}!', { n: ev.wave + 1 }), ev.boss ? t('The boss is coming!') : md.waves[ev.wave].groups.some(g => g.role === 'flyer') ? '🪽 ' + t('Flyers ahead') : '', ev.boss ? 'bad' : ''); h.tone(ev.boss ? 'alert' : 'level'); s.pad = -1; renderPanel(true); break; }
      case 'clear': banner(t('Wave cleared!'), t('+{spark} Spark · +{stars} Star bit', { spark: ev.spark, stars: ev.stars }), 'good'); h.tone('success'); fx?.burst({ x: world.position.x, z: world.position.z }, { n: 24, color: ['#ffd23f', '#ffffff', '#7fd0ff'], glow: true, speed: 4, up: 8 }); s.pad = nearestEmptyPad(s); renderPanel(true); break;
      case 'spawn': if (ev.boss) { banner('👑 ' + enemyName(ev.enemy), t('The boss is coming!'), 'bad'); world.fx?.shake?.(.4); h.tone('alert'); } break;
      case 'leak': { banner('💔 ' + t('A raider got through!'), `❤️ ${ev.hearts}/${RESCUE.hearts}`, 'bad'); h.tone('hurt'); fx?.shake?.(.35); fx?.burst(at(ev), { n: 20, color: ['#ff5a5f', '#ffffff'], glow: true, speed: 4, up: 6 }); break; }
      case 'kill': {
        const p = at(ev); fx?.burst(p, { n: ev.boss ? 50 : 10, color: ['#ffd23f', '#fff3b0', '#ffffff'], glow: true, speed: ev.boss ? 7 : 3, up: ev.boss ? 10 : 5 });
        if (near(ev)) { fx?.text({ ...p, y: 1.8 }, `+${ev.spark}✨${ev.stars ? ` +${ev.stars}⭐` : ''}`, ev.stars ? 'item' : 'xp'); if (ev.by !== ME) h.tone('coin'); }
        if (ev.boss) { banner('👑 ' + t('Wave cleared!'), enemyName(ev.enemy), 'good'); fx?.shake?.(.6); }
        break;
      }
      case 'hurt': if (ev.by !== ME && near(ev, 18) && ev.amount >= 8) fx?.text(at(ev, 1.6), String(ev.amount), 'damage'); break;
      case 'shot': if (near(ev.from, 34)) s.shots.fire(ev.from, ev.to, ev.style, ev.y); break;
      case 'boom': {
        const p = at(ev), col = ev.style === 'freeze' ? '#bff4ff' : ev.style === 'heal' ? '#7aff9a' : ev.style === 'slam' ? '#ff9a3c' : ev.style === 'cannon' ? '#ffb347' : '#ffe14d';
        if (near(ev, 34)) { fx?.ring(p, { color: col, from: .3, to: ev.r, life: .4, y: .12, thick: .3 }); if (ev.style !== 'heal' && ev.style !== 'freeze') fx?.burst(p, { n: ev.style === 'cannon' ? 10 : 16, color: [col, '#ffffff'], glow: true, speed: 4, up: 4 }); }
        if (ev.style === 'cannon' && near(ev, 12)) h.tone('boom'); if (ev.style === 'slam' && near(ev, 14)) { fx?.shake?.(.3); h.tone('crit'); }
        break;
      }
      case 'def-hit': s.defs.hurt(ev.pad); break;
      case 'broken': { const p = s.field.pads[ev.pad]; fx?.burst(at(p), { n: 22, color: ['#b07a4a', '#ffffff', '#9aa3b5'], speed: 5, up: 6 }); h.toast(t('Defence broken!'), DEFENCES[ev.defence].icon); h.tone('crit'); renderPanel(true); break; }
      case 'unit-hit': if (ev.unit === ME) { const me = runHero(m); world.hurtFeedback(Math.round(ev.amount / me.maxHp * h.maxHp())); h.tone('hurt'); const flash = document.querySelector('#damage-flash'); flash?.classList.add('active'); setTimeout(() => flash?.classList.remove('active'), 160); } break;
      case 'down': { const u = runUnit(m, ev.unit); if (!u) break; fx?.burst(at(u), { n: 16, color: ['#ffffff', '#ffb0b0'], speed: 4, up: 5 }); if (u.id === ME) { h.tone('hurt'); world.selected = null; } else h.toast(t('{name} fell back to the camp', { name: u.name }), '⛺'); break; }
      case 'back': { const u = runUnit(m, ev.unit); if (!u) break; if (u.id !== ME) h.toast(t('{name} is back in the fight!', { name: u.name }), '💪'); fx?.ring(at(u), { color: '#ffffff', from: .3, to: 2.4, life: .5 }); break; }
      case 'heal': { const u = runUnit(m, ev.unit); if (u && ev.amount > 15 && near(u)) fx?.text(at(u, 2.2), '+' + ev.amount, 'heal'); break; }
      case 'skill': { const u = runUnit(m, ev.unit); if (!u) break; const dz = DISGUISES[u.disguise]?.skills[[0, 1, 3][ev.slot]]; if (dz && near(ev, 30)) fx?.text(at(u, 2.8), `${dz.icon} ${t(dz.name)}`, ev.slot === 2 ? 'alert callout' : 'item'); if (ev.slot === 2) { fx?.shake?.(.25); h.tone('cast'); } break; }
      case 'swing': { const u = runUnit(m, ev.unit), v = s.views.get(ev.unit); if (v) v.attack = .25; if (u && !ev.ranged && near(u, 22)) fx?.slash(at(u), facingToWorld(u.facing, s.o), 1.4, '#ffffff', { arc: 1.6, life: .18 }); break; }
      case 'split': fx?.burst(at(ev), { n: 14, color: ['#ff6fae', '#ffffff'], glow: true, speed: 4, up: 4 }); break;
      case 'freeze': h.tone('freeze'); break;
      case 'step': { const u = runUnit(m, ev.unit); if (!u) break; s.tryOn = null; fx?.burst(at(u), { n: 26, color: ['#ffe66d', '#ffffff', u.color], glow: true, speed: 4, up: 7 }); fx?.text(at(u, 2.6), `${t('Step {n}/{total}', { n: u.step, total: LADDER_STEPS })} ↑`, 'item big'); h.tone('level'); focus(u, 1.4); break; }
      case 'boost': { fx?.burst({ x: world.position.x, z: world.position.z }, { n: 18, color: ['#7fd0ff', '#ffffff'], glow: true, speed: 3, up: 6 }); h.tone('magic'); break; }
      case 'build': { const p = s.field.pads[ev.pad]; fx?.burst(at(p), { n: 18, color: ['#ffe66d', '#ffffff'], glow: true, speed: 3, up: 6 }); h.tone(ev.level > 1 ? 'level' : 'pop'); break; }
      case 'sold': { const p = s.field.pads[ev.pad]; fx?.text(at(p, 1.8), `+${ev.spark}✨`, 'xp'); h.tone('coin'); break; }
      case 'over': finish(ev.result); break;
    }
  }
  function finish(result: NonNullable<RsRun['result']>) {
    const s = session!; lastResult = result;
    h.tone(result.won ? 'success' : 'hurt');
    banner(result.won ? t('The farm is saved!') : t('The farm fell…'), t('Waves held: {n}/{total}', { n: result.waves, total: totalWaves(s.m) }), result.won ? 'good' : 'bad');
    if (result.won) for (let i = 0; i < 3; i++) setTimeout(() => world.fx?.burst({ x: world.position.x, z: world.position.z }, { n: 40, color: ['#ff7ab0', '#7fd0ff', '#ffe14d', '#7aff9a'], glow: true, speed: 7, up: 11 }), i * 240);
    renderPanel(true);
    void claim(s).then(() => { if (session === s) setTimeout(() => { if (session === s) endDialog(s); }, 1500); });
  }
  async function claim(s: Session) {
    if (s.claimed) return; s.claimed = true;
    const c = claimOf(s.m);
    if (c.waves <= 0 && !c.won) { s.claim = null; return; }
    let res: RescueClaimResult | undefined;
    try { res = await h.perform<RescueClaimResult>('rescueClaim', c, true); } catch { res = undefined; }
    s.claim = res ?? null; lastClaim = s.claim;
    if (res && res.xp > 0) { world.fx?.text({ x: world.position.x, y: 1.6, z: world.position.z }, t('+{xp} EXP', { xp: res.xp }), 'xp'); world.fx?.orbs?.({ x: world.position.x, z: world.position.z }, 8, '#7ff0ff', () => world.position, () => h.tone('coin')); }
    h.updateHud();
  }
  function endDialog(s: Session) {
    const m = s.m, r = m.result!, md = MISSIONS[m.mission], c = s.claim;
    const why = { won: t('Every wave held'), hearts: t('All hearts lost'), routed: t('The whole squad fell back'), leave: t('You left the mission') }[r.reason];
    const gift = c?.gift?.length ? `<div class="rescue-gift"><h4>🎁 ${esc(t('Thank-you gift'))}</h4>${c.gift.map(g => `<span><img src="${itemIcon(g.id)}" alt="" onerror="this.remove()">${esc(t(ITEMS[g.id]?.name ?? g.id))} ×${g.count}${g.where === 'chest' ? ' 📦' : ''}</span>`).join('')}<small>${esc(t('Victory gift sent to your bag (or the chest when the bag is full).'))}</small></div>` : '';
    const pay = c ? `<p class="rescue-pay"><b>⭐ ${esc(t('+{xp} EXP', { xp: c.xp }))}</b> · <b>⚡ +${c.energy} ${esc(t('energy'))}</b></p>${c.badge ? `<p class="rescue-badge">🏅 ${esc(t('Hero of {planet}', { planet: planetName(m.mission) }))}</p>` : ''}${c.wavesLeft <= 0 ? `<p class="muted center">${esc(t('No more wave rewards today, but you can still play.'))}</p>` : ''}` : '';
    const squad = m.units.map(u => `<tr><td data-i18n-skip>${u.id === ME ? '🧑' : ROLE_ICON[u.role]} ${esc(u.name)}</td><td>${u.id === ME ? '—' : esc(t('Step {n}/{total}', { n: u.step, total: LADDER_STEPS }))}</td></tr>`).join('');
    h.openDialog('rescue-end', r.won ? 'The farm is saved!' : 'The farm fell…', `<div class="rescue-dialog rescue-end">
      <p class="rescue-score">${r.won ? '🏆' : '💪'} ${esc(t('Waves held: {n}/{total}', { n: r.waves, total: totalWaves(m) }))}</p>
      <p class="center">${esc(why)} · ❤️ ${m.hearts}/${RESCUE.hearts} · ⏱️ ${Math.floor(r.seconds / 60)}:${String(r.seconds % 60).padStart(2, '0')}</p>
      ${pay}${gift}
      <div class="rescue-stats"><span>⚔️ ${esc(t('Kills'))}: <b>${m.stats.kills}</b></span><span>💔 ${esc(t('Leaks'))}: <b>${m.stats.leaks}</b></span><span>✨ ${m.stats.spark}</span><span>⭐ ${m.stats.stars}</span></div>
      <table class="rescue-table">${squad}</table>
      <p class="center muted"><small>${esc(t('Nothing is ever lost in a rescue. Try again?'))} · ${esc(t('Rescues with full rewards left today: {n}', { n: c?.winsLeft ?? fullWinsLeft(h.state(), Date.now()) }))}</small></p>
      <div class="rescue-actions"><button class="primary" data-rescue="again">📯 ${esc(t('Play again'))}</button><button data-rescue="home">🏡 ${esc(t('Back home'))}</button></div></div>`, 'RESCUE CALL', r.won ? '🏆' : '💪');
    void md;
  }

  // ---------------------------------------------------------------- HUD, panel, tags
  let hudShown = '';
  function renderHud(force: boolean) {
    const s = session; if (!s) return; const m = s.m, total = totalWaves(m);
    const hearts = Array.from({ length: RESCUE.hearts }, (_, i) => `<i class="${i < m.hearts ? 'on' : ''}">❤</i>`).join('');
    const live = m.enemies.filter(e => e.hp > 0).length + m.queue.length;
    const phase = m.phase === 'build'
      ? `<span class="rescue-phase build">🔨 ${esc(t('Build: {s}s', { s: Math.max(0, Math.ceil(m.timer)) }))}</span><button class="go" data-rescue="ready">▶ ${esc(t('Start the wave'))}</button>`
      : m.phase === 'wave' ? `<span class="rescue-phase wave">⚔️ ${esc(t('Wave {n}/{total}', { n: m.wave + 1, total }))} · 👾 ${live}</span>` : `<span class="rescue-phase">${m.result?.won ? '🏆' : '💔'}</span>`;
    const squad = m.units.slice(1).map(u => `<span class="${u.down > 0 ? 'down' : ''}" title="${esc(u.name)}"><i style="background:${esc(u.color)}"></i><b class="hp"><em style="width:${Math.round(u.down > 0 ? 0 : u.hp / u.maxHp * 100)}%"></em></b>${u.down > 0 ? `<small>${Math.ceil(u.down)}s</small>` : `<small>${u.step}</small>`}</span>`).join('');
    const html = `<div class="rescue-top"><span class="hearts" aria-label="${esc(t('Hearts'))} ${m.hearts}">${hearts}</span><span class="wave">🌊 ${Math.min(m.wave + 1, total)}/${total}</span><span class="spark">✨ ${m.spark}</span><span class="stars">⭐ ${m.stars}</span><button data-rescue="leave" title="${esc(t('Leave the mission'))}" aria-label="${esc(t('Leave the mission'))}">🚪</button></div>
      <div class="rescue-mid">${phase}<button class="order" data-rescue="order" title="${esc(t(m.order === 'hold' ? 'Squad order: Hold' : 'Squad order: Follow me'))}">${m.order === 'hold' ? '🛡️ ' + esc(t('Hold')) : '👣 ' + esc(t('Follow me'))}</button></div>${squad ? `<div class="rescue-squadbar">${squad}</div>` : ''}${m.shield > 0 ? `<div class="rescue-shield">🫧 ${Math.ceil(m.shield)}</div>` : ''}`;
    if (force || html !== hudShown) { hudShown = html; hud.innerHTML = html; }
    const zone = document.querySelector('#zone-name'); const title = t(MISSIONS[m.mission].title); if (zone && zone.textContent !== title) zone.textContent = title;
  }
  let panelShown = '';
  function renderPanel(force: boolean) {
    const s = session; if (!s) return; const m = s.m;
    const show = m.phase === 'build'; panel.hidden = !show || h.blocked();
    if (!show) { panelShown = ''; return; }
    if (!force && Math.floor(s.time * 4) % 2) return; // a few times a second is plenty
    const tab = (id: Session['tab'], label: string, icon: string) => `<button data-rescue="tab" data-tab="${id}" class="${s.tab === id ? 'sel' : ''}" aria-pressed="${s.tab === id}">${icon} ${esc(t(label))}</button>`;
    let body = '';
    if (s.tab === 'defences') {
      const chips = s.field.pads.map((p, i) => { const d = m.defences[i]; return `<button data-rescue="pad" data-pad="${i}" class="${i === s.pad ? 'sel' : ''} ${d ? 'built' : ''}" title="${esc(t('Pad {n}', { n: i + 1 }))}">${d ? DEFENCES[d.kind].icon + `<sup>${d.level}</sup>` : i + 1}</button>`; }).join('');
      const d = m.defences[s.pad];
      let detail = `<p class="muted">${esc(t('Pick a build pad'))}</p>`;
      if (s.pad >= 0 && !d) detail = `<div class="rescue-cards">${DEFENCE_KINDS.map(k => { const def = DEFENCES[k], lv = def.levels[0], can = m.spark >= lv.cost; return `<button class="card ${can ? '' : 'poor'}" data-rescue="place" data-kind="${k}" ${can ? '' : 'aria-disabled="true"'}><img src="${rescueIcon(k)}" alt="" onerror="this.replaceWith(document.createTextNode('${def.icon}'))"><b>${esc(t(def.name))}</b><small>${esc(t(def.desc))}</small><em>✨ ${lv.cost}</em></button>`; }).join('')}</div>`;
      else if (d) {
        const def = DEFENCES[d.kind], lv = def.levels[d.level - 1], next = def.levels[d.level];
        const stat = (l: typeof lv) => d.kind === 'wall' ? `❤️ ${l.hp}` : `⚔️ ${l.dmg} · 🎯 ${l.range}m${l.chain ? ` · ⚡×${l.chain}` : ''}${l.splash ? ` · 💥${l.splash}m` : ''}${l.slow ? ` · ❄️${Math.round(l.slow * 100)}%` : ''}${l.freeze ? ' · 🧊' : ''}`;
        detail = `<div class="rescue-built"><img src="${rescueIcon(d.kind)}" alt="" onerror="this.remove()"><div><b>${def.icon} ${esc(t(def.name))} · ${esc(t('Level {n}', { n: d.level }))}</b><small>${stat(lv)} · ❤️ ${Math.ceil(d.hp)}/${d.maxHp}</small>${next ? `<small class="next">→ ${stat(next)}</small>` : ''}</div></div>
          <div class="rescue-row">${next ? `<button class="primary ${m.spark >= next.cost ? '' : 'poor'}" data-rescue="upgrade">⬆️ ${esc(t('Upgrade'))} ✨${next.cost}</button>` : `<button disabled>${esc(t('Max level'))}</button>`}<button data-rescue="sell">💰 ${esc(t('Sell'))} +${sellValue(d)}</button></div>`;
      }
      body = `<div class="rescue-pads">${chips}</div>${detail}`;
    } else if (s.tab === 'squad') {
      const members = m.units.slice(1);
      const meRow = `<div class="rescue-member me"><div class="who"><i style="background:${esc(m.units[0].color)}"></i><b data-i18n-skip>${esc(m.units[0].name)}</b><small>🧑 ${esc(t('(you)'))}</small></div></div>`;
      body = meRow + (members.length ? members.map(u => {
        const cost = stepCost(u), next = u.ladder[u.step + 1], gear = u.ladder[u.step] ?? {}, trying = s.tryOn?.id === u.id;
        const icons = [gear.weapon, gear.outfit, gear.disguise].filter(Boolean).map(id => `<img src="${itemIcon(id!)}" alt="" title="${esc(t(ITEMS[id!]?.name ?? id!))}">`).join('') || '👊';
        const nextGear: string[] = next ? [next.weapon !== gear.weapon ? next.weapon : '', next.outfit !== gear.outfit ? next.outfit : '', next.disguise !== gear.disguise ? next.disguise : ''].filter((id): id is string => !!id) : [];
        const ok = cost && m.spark >= cost.spark && m.stars >= cost.stars;
        return `<div class="rescue-member ${trying ? 'trying' : ''}"><div class="who"><i style="background:${esc(u.color)}"></i><b data-i18n-skip>${esc(u.name)}</b><small>${esc(t(u.kind === 'helper' ? 'Helper' : 'Neighbour'))} · ${ROLE_ICON[u.role]} ${esc(t(u.role))} · ${esc(t('Step {n}/{total}', { n: u.step, total: LADDER_STEPS }))}</small></div>
          <div class="gear">${icons}</div>
          ${cost && next ? `<div class="next">→ ${esc(t(STEP_TEXT[u.step + 1]))}${nextGear.length ? ': ' + nextGear.map(id => `<img src="${itemIcon(id)}" alt="" title="${esc(t(ITEMS[id]?.name ?? id))}">`).join('') : ''}</div>
          <div class="rescue-row"><button data-rescue="try" data-id="${esc(u.id)}">👀 ${esc(t('Try on'))}</button><button class="primary ${ok ? '' : 'poor'}" data-rescue="step" data-id="${esc(u.id)}">⬆️ ✨${cost.spark}${cost.stars ? ` ⭐${cost.stars}` : ''}</button></div>` : `<div class="next">🌟 ${esc(t('Top of the ladder'))}</div>`}</div>`;
      }).join('') + `<p class="muted small">${esc(t('Squad gear is borrowed for this mission only.'))}</p>` : `<p class="muted">${esc(t('No squad yet: rescue friends or turn on AI neighbours.'))}</p>`);
    } else {
      body = `<div class="rescue-boosts">${BOOST_KINDS.map(k => { const b = BOOSTS[k], n = m.boosts[k], max = n >= b.max, ok = !max && m.spark >= b.spark && m.stars >= b.stars; return `<button class="card ${ok ? '' : 'poor'}" data-rescue="boost" data-kind="${k}" ${max ? 'disabled' : ''}><span class="ic">${b.icon}</span><b>${esc(t(b.name))}${b.max < 99 ? ` <sup>${n}/${b.max}</sup>` : ''}</b><small>${esc(t(b.desc))}</small><em>✨ ${b.spark}${b.stars ? ` ⭐${b.stars}` : ''}</em></button>`; }).join('')}</div><p class="muted small">${esc(t('Boosts last until the end of the mission.'))}</p>`;
    }
    const html = `<div class="rescue-tabs">${tab('defences', 'Defences', '🏰')}${tab('squad', 'Squad', '🧑‍🤝‍🧑')}${tab('me', 'Me', '🧑')}<button class="fold" data-rescue="panel" aria-label="${esc(t('Upgrades'))}">▾</button></div><div class="rescue-body">${body}</div>`;
    if (force || html !== panelShown) { panelShown = html; panel.innerHTML = html; }
  }
  function padMarker(s: Session) {
    const show = s.m.phase === 'build' && s.pad >= 0, p = s.field.pads[s.pad];
    s.parts.marker.visible = show; s.parts.range.visible = false;
    if (!show || !p) return;
    s.parts.marker.position.set(p.x, .28, p.z); s.parts.marker.scale.setScalar(1 + Math.sin(s.time * 5) * .06);
    const d = s.m.defences[s.pad]; if (d && d.kind !== 'wall') { const r = DEFENCES[d.kind].levels[d.level - 1].range; s.parts.range.visible = true; s.parts.range.position.set(p.x, .06, p.z); s.parts.range.scale.setScalar(r); }
  }
  function banner(title: string, sub: string, cls = '') {
    document.querySelectorAll('.rescue-banner').forEach(old => old.remove());
    const el = document.createElement('div'); el.className = 'rescue-banner ' + cls;
    el.innerHTML = `<strong>${esc(title)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    document.body.append(el); setTimeout(() => el.classList.add('leaving'), 2000); setTimeout(() => el.remove(), 2600);
  }
  const tagEls = new Map<string, HTMLDivElement>();
  function tagsFrame(s: Session) {
    tags.hidden = h.blocked(); if (tags.hidden) return;
    const seen = new Set<string>();
    for (const u of s.m.units) {
      if (u.id === ME) continue;
      const w = toWorld(u, s.o), scr = world.screen(w.x, 2.5, w.z);
      if (!scr.visible) continue;
      seen.add(u.id); let el = tagEls.get(u.id);
      if (!el) { el = document.createElement('div'); el.className = 'rescue-tag'; tags.append(el); tagEls.set(u.id, el); }
      const trying = s.tryOn?.id === u.id;
      const html = `<span class="n" data-i18n-skip>${trying ? '👀 ' : ''}${esc(u.name)}${u.step ? ` <sup>${u.step}</sup>` : ''}</span>${u.down > 0 ? `<span class="rec">⛺ ${Math.ceil(u.down)}s</span>` : `<span class="hp"><i style="width:${Math.round(u.hp / u.maxHp * 100)}%"></i></span>`}`;
      if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
      el.style.transform = `translate(${scr.x.toFixed(0)}px, ${scr.y.toFixed(0)}px) translate(-50%, -100%)`; el.hidden = false;
    }
    for (const [id, el] of tagEls) if (!seen.has(id)) el.hidden = true;
  }
  function downFrame(s: Session) {
    const me = runHero(s.m); down.hidden = me.down <= 0 || s.m.phase === 'over';
    if (!down.hidden) { const text = `<b>${esc(t('You fell! Back at the camp in {s}s', { s: Math.max(1, Math.ceil(me.down)) }))}</b>`; if (down.dataset.html !== text) { down.dataset.html = text; down.innerHTML = text; } }
  }
  // ---------------------------------------------------------------- the portal at home
  function homeFrame(dt: number) {
    if (!portal || world.planet !== 'home' || world.interior || h.visiting()) { bubble.hidden = true; return; }
    const P = RESCUE.portal, d = Math.hypot(world.position.x - P.x, world.position.z - P.z);
    const swirl = portalMesh?.getObjectByName('swirl'); if (swirl) swirl.rotation.z += dt * 2.2;
    if (d < 30 && Math.random() < dt * 7) world.fx?.burst({ x: P.x + (Math.random() - .5) * 3, z: P.z }, { n: 1, color: ['#ff8a4d', '#ffd23f', '#ffffff'], glow: true, size: .12, speed: .6, up: 3, y: 1 + Math.random() * 3, life: .9, gravity: -1 });
    const scr = world.screen(P.x, 4.8, P.z), show = scr.visible && d < 34 && !h.blocked();
    if (!said && d < 9) { said = true; sayT = 4; } if (d > 15) said = false;
    sayT -= dt; bubble.hidden = !(show && (sayT > 0 || d < 22));
    if (!bubble.hidden) { const half = (bubble.offsetWidth || 200) / 2, x = Math.max(half + 8, Math.min(innerWidth - half - 8, scr.x)); bubble.style.transform = `translate(${x.toFixed(0)}px, ${(scr.y - 10).toFixed(0)}px) translate(-50%, -100%)`; const md = sos.call ? MISSIONS[sos.call.mission] : null; const text = `📯 ${md ? md.friendIcon + ' ' : ''}${(recoveryLeft() ? recoveryText() : t('Rescue ready — choose a mission!'))}`; if (bubble.textContent !== text) bubble.textContent = text; }
  }

  // ---------------------------------------------------------------- the Me tab's boosts on the explorer's real combat
  // A fresh attack or skill cooldown (it jumped up since the last frame) is shortened by the mission's boosts.
  let lastAttack = 0; const lastSkills: number[] = [];
  h.onFrame(() => {
    const ct = h.combatTimers, s = session; if (!ct) return;
    const haste = s ? heroHaste(s.m) : 1, cdr = s ? heroCooldownScale(s.m) : 1;
    if (ct.attackCooldown > lastAttack + 1e-6 && haste !== 1) ct.attackCooldown /= haste;
    lastAttack = ct.attackCooldown;
    ct.skills.forEach((v, i) => { if (v > (lastSkills[i] ?? 0) + 1e-6 && cdr !== 1) { ct.skills[i] = v * cdr; if (h.skillDurations) h.skillDurations[i] *= cdr; } lastSkills[i] = ct.skills[i]; });
  });
  // The settings panel gets a "Rescue calls" switch under the AI neighbours one.
  if (typeof MutationObserver !== 'undefined') new MutationObserver(() => {
    const anchor = document.getElementById('dialog-body')?.querySelector('[data-action="neighbours"]')?.closest('.settings-row');
    if (anchor && !anchor.parentElement?.querySelector('[data-rescue="calls"]')) anchor.insertAdjacentHTML('afterend', api.settingsRow());
  }).observe(document.body, { childList: true, subtree: true });

  // ---------------------------------------------------------------- main.ts hooks and the dev hook
  const api = {
    get active() { return !!session; },
    owns: (e: { id: string }) => !!session && typeof e.id === 'string' && e.id.startsWith('rescue:'),
    /** The hero's mission boosts for main.ts combat: attack speed and skill cooldowns. */
    get attackHaste() { return session ? heroHaste(session.m) : 1; },
    get cooldownScale() { return session ? heroCooldownScale(session.m) : 1; },
    /** A settings row (main.ts settings()): rescue calls on or off. */
    settingsRow: () => `<div class="settings-row"><div><strong>${esc(t('Rescue calls'))}</strong><small>${esc(t('Optional rescue reminders. The portal is always available by the south square.'))}</small></div><button class="toggle ${callsOn() ? 'on' : ''}" role="switch" aria-checked="${callsOn()}" aria-label="${esc(t('Rescue calls'))}" data-rescue="calls"></button></div>`,
    /** The 📯 marker for the map: where the portal stands while a call waits. */
    get call() { return !session ? { mission: sos.call?.mission ?? open()[0] ?? 'toy', until: 0, x: RESCUE.portal.x, z: RESCUE.portal.z } : null; },
    confirmLeave,
    // ---- development hooks (window.__rescue)
    callNow(mission: MissionId = 'toy') { call(mission); return !!portal; },
    brief(mission: MissionId = 'toy') { briefing = { mission, picks: defaultPicks() }; openBriefing(); },
    quickStart(mission: MissionId = 'toy', o?: { orientation?: Orientation; picks?: string[]; seed?: number }) { if (session) return true; h.closeDialog(); return start(mission, o?.picks ?? defaultPicks(), o?.orientation, o?.seed ?? 1234); },
    candidates: () => candidates().map(c => ({ id: c.id, name: c.name, kind: c.kind })),
    skipBuild() { const s = session; if (s?.m.phase === 'build') handle(startWave(s.m)); },
    autoBuild() { const s = session; if (!s) return 0; const ev = autoPlan(s.m); handle(ev); renderPanel(true); renderHud(true); return ev.length; },
    autopilot(on = true) { const s = session; if (s) s.autopilot = on; },
    give(spark = 500, stars = 10) { const s = session; if (!s) return; s.m.spark += spark; s.m.stars += stars; renderPanel(true); renderHud(true); },
    toWave(wave: number) { const s = session; if (!s || s.m.phase === 'over') return; s.m.enemies = []; s.m.queue = []; s.m.wave = Math.max(0, Math.min(totalWaves(s.m) - 1, wave)); s.m.cleared = s.m.wave; s.m.phase = 'build'; s.m.timer = RESCUE.build; renderPanel(true); },
    /** Freezes the raiders where they stand (calm screenshots). */
    calm(on = true) { const s = session; if (!s) return; for (const e of s.m.enemies) { e.freeze = on ? 9999 : 0; } },
    selectPad(i: number) { selectPad(i, true); },
    tab(tab: Session['tab']) { const s = session; if (s) { s.tab = tab; renderPanel(true); } },
    tryOn(id?: string) { const s = session; if (!s) return; const u = id ? runUnit(s.m, id) : s.m.units[1]; if (u) { s.tryOn = { id: u.id, until: s.time + 6 }; focus(u, 6); renderPanel(true); } },
    /** Ends the mission now (a win clears the remaining waves' numbers into the result). */
    finish(won = true) { const s = session; if (!s || s.m.phase === 'over') return; if (won) { s.m.cleared = totalWaves(s.m); s.m.enemies = []; s.m.queue = []; s.m.elapsed = Math.max(s.m.elapsed, totalWaves(s.m) * RESCUE_REWARD.minSecondsPerWave + 5); s.m.phase = 'wave'; s.m.wave = totalWaves(s.m) - 1; handle(stepRun(s.m, .05)); } else handle(forfeit(s.m)); },
    get run() { return session?.m ?? null; },
    get orientation() { return session?.o ?? null; },
    get lastClaim() { return lastClaim; },
    get lastResult() { return lastResult; },
    get draws() { return session?.raiders.draws ?? 0; },
    sos: () => ({ ...sos, on: callsOn() }),
    leave, exit,
  };
  return api;
}
export type RescueApi = ReturnType<typeof initRescue>;
