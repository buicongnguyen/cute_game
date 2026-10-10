/**
 * The Delvers' Vault at runtime: the keeper and the lobby circle by the south gate, the countdown, the arena (five rooms:
 * creatures, guardian, portal), the HUD with its 30-minute clock, the AI neighbours who fill a solo party, the guardians'
 * skills and the trip home. Pure rules live in dungeon-rules.ts, skills in dungeon-patterns.ts, art in dungeon-view.ts.
 *
 * The arena is built in the home world, far out in the swamp corner: entering moves the village's own scene objects,
 * entities, creatures and obstacles aside (nothing is rebuilt) and puts the arena, its creatures and wall in their place;
 * leaving puts everything back. A world rebuild meanwhile (rare: a late art file, a server state change) ends the run.
 *
 * Offline: AI neighbours (friends first) make up the party and fight with small blows; they never take loot.
 * Online: the server forms the party from everyone in the circle (server/dungeon-lobby.mjs) and moves it to a private
 * room; the first member's browser runs the arena and relays it (creatures, stage, guardian casts), the others send their
 * hits to it; the run counter and every reward are server-validated actions (dungeonStart / dungeonClaim).
 */
import * as T from 'three';
import './dungeon.css';
import type { World, Enemy, Entity, RemotePose } from './world.ts';
import type { SaveState } from './model.ts';
import { t } from './i18n.ts';
import { ENEMY_TYPES, enemyScale } from './enemy-types.ts';
import { adoptCreatureModel } from './creature-art.ts';
import { DUNGEON_ENEMIES, DUNGEON_STAGES, DUNGEON_BOSSES, DUNGEON_SKILL_INFO, DUNGEON_PETS, DUNGEON_ITEMS, PET_SKILLS, type DungeonSkill } from './dungeon-content.ts';
import { DUNGEON, STAGE_COUNT, runsLeft, inLobby, scaled, skillDelay, fillParty, DungeonFlow, LobbyCountdown, type StageLoot, type FlowEvent } from './dungeon-rules.ts';
import { beginSkill, stepSkill, inMark, sanitizeAttack, petSkillMarks, petHits, SKILL_WINDUPS, type DgAttack, type DgTarget } from './dungeon-patterns.ts';
import { dungeonKit, buildArena, buildPortal, buildLobby, buildKeeper, creatureModel, VaultTelegraphs } from './dungeon-view.ts';

Object.assign(ENEMY_TYPES, DUNGEON_ENEMIES); // the vault's creatures, known to the world only while the game runs

interface Neighbour { id: string; name: string; level: number; color: string; gear: Record<string, string | undefined>; pets: string[] }
export interface DungeonHooks {
  world: World; state: () => SaveState; started: () => boolean; blocked: () => boolean; visiting: () => boolean; online: () => boolean;
  perform: <R = unknown>(type: string, payload: Record<string, unknown>, quiet?: boolean) => Promise<R | undefined>;
  toast: (message: string, icon?: string) => void; tone: (kind: string) => void;
  openDialog: (type: string, title: string, body: string, kicker?: string, icon?: string) => void; closeDialog: () => void;
  neighbours: () => { cast: readonly Neighbour[]; isFriend: (id: string) => boolean } | null;
  attack: () => number; maxHp: () => number; hitEnemy: (e: Enemy, amount: number) => void; updateHud: () => void; save: () => void;
  onFrame: (listener: (dt: number) => void) => void;
}
type Role = 'local' | 'host' | 'peer';
interface Ally { def: Neighbour; id: string; x: number; z: number; facing: number; cd: number; swing: number; target: string | null; moving: boolean }
interface Session {
  runId: string; role: Role; online: boolean; rng: () => number; flow: DungeonFlow;
  /** Peers mirror the host's stage, phase and clocks. */
  mirror: { stage: number; phase: string; timer: number; elapsed: number };
  saved: { root: T.Group; entities: Entity[]; enemies: Enemy[]; obstacles: World['obstacles']; detached: T.Object3D[]; background: T.Scene['background']; fog: T.Scene['fog']; onZone: World['onZone']; networkRole: World['networkRole']; onRemoteDamage: World['onRemoteDamage']; onStep: World['onStep']; beforeRender: World['beforeRender'] };
  arena: T.Group; arenaStage: number; portal: Entity | null; view: VaultTelegraphs;
  allies: Ally[]; members: Array<{ id: string; name: string; level?: number }>;
  boss: Enemy | null; attacks: Array<{ a: DgAttack; enemyId: string; mine: boolean }>; skillClock: number; skillIndex: number; outgoing: DgAttack[];
  /** Rooms cleared (here, or by the host for a peer) and rooms whose rewards were claimed. */
  cleared: number; claimed: number; claiming: boolean; lastClaimAt: number; startedAt: number;
  root: { remaining: number; x: number; z: number }; slow: number; lastPos?: { x: number; z: number }; hpShadow: { damage: number; set: number } | null;
  syncClock: number; spawnIndex: number; ended: boolean; knocked: boolean; done: boolean;
}
const C = DUNGEON.arena, ARENA_R = DUNGEON.arenaR, TAU = Math.PI * 2;
const isVaultId = (id: string) => id.startsWith('vault:');
const seeded = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function initDungeon(h: DungeonHooks) {
  const world = h.world;
  let session: Session | null = null, sender: ((m: Record<string, unknown>) => boolean) | null = null;
  let keeper: Entity | null = null, lobbyMesh: T.Object3D | null = null;
  const lobby = new LobbyCountdown(DUNGEON.need, DUNGEON.countdown, DUNGEON.maxParty);
  let lobbyOnline: { n: number; cd: number | null; names: string[]; left: number } | null = null, starting = false;
  let petClock = 3, onlineId = '', lastExit = '';

  // ---------------------------------------------------------------- HUD
  const hud = document.createElement('div'); hud.id = 'vault-hud'; hud.hidden = true; hud.setAttribute('role', 'status');
  const lobbyPanel = document.createElement('div'); lobbyPanel.id = 'vault-lobby'; lobbyPanel.hidden = true; lobbyPanel.setAttribute('role', 'status');
  const keeperLabel = document.createElement('div'); keeperLabel.className = 'vault-keeper-tag'; keeperLabel.hidden = true;
  document.body.append(hud, lobbyPanel, keeperLabel);
  // The Home button leaves the vault (with a confirmation) instead of snapping to the village centre.
  document.addEventListener('click', event => { if (session && (event.target as HTMLElement).closest?.('[data-action="return-home"]')) { event.preventDefault(); event.stopImmediatePropagation(); confirmLeave(); } }, true);
  hud.addEventListener('click', event => { if ((event.target as HTMLElement).closest('[data-vault="leave"]')) confirmLeave(); });
  document.addEventListener('click', event => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-vault]'); if (!el || hud.contains(el)) return;
    const what = el.dataset.vault;
    if (what === 'walk') { h.closeDialog(); world.walkTo(DUNGEON.lobby.x, DUNGEON.lobby.z); }
    else if (what === 'close') h.closeDialog();
    else if (what === 'leave-yes') { h.closeDialog(); leaveRun(); }
  });

  // ---------------------------------------------------------------- home: keeper and circle
  function decorateHome() {
    keeper = null; lobbyMesh = null;
    if (world.planet !== 'home' || session) return;
    // Trees and bushes planned on the circle or the keeper's spot step aside (their obstacles too).
    const L = DUNGEON.lobby, K = DUNGEON.keeper, inWay = (p: { x: number; z: number }) => Math.hypot(p.x - L.x, p.z - L.z) < L.r + 1.8 || Math.hypot(p.x - K.x, p.z - K.z) < 1.9;
    const kept = world.decor.filter(p => !inWay(p));
    if (kept.length !== world.decor.length) { world.decor = kept; world.obstacles = world.obstacles.filter(o => !inWay(o)); world.refreshScenery(); }
    const model = buildKeeper(); model.rotation.y = -2.2;
    keeper = world.addEntity('dungeon-keeper', 'Vault Keeper Wren', '🏰', model, DUNGEON.keeper.x, DUNGEON.keeper.z, 1.1); world.obstacle(DUNGEON.keeper.x, DUNGEON.keeper.z, .55);
    lobbyMesh = buildLobby(); lobbyMesh.position.set(DUNGEON.lobby.x, 0, DUNGEON.lobby.z); lobbyMesh.name = 'vault-lobby'; world.root.add(lobbyMesh);
  }
  const previousBuilt = world.onBuilt; world.onBuilt = () => { previousBuilt?.(); decorateHome(); };
  decorateHome();
  /** The kit (about 1 MB) is fetched only near the circle, at the keeper or for a run: simple shapes stand in until then. */
  let kitHooked = false; // a worn vault pet may have started the download already (world.ts kitFor): dress the vault when it lands either way
  const requestKit = () => { if (!kitHooked) { kitHooked = true; void dungeonKit.load().then(onKit); } };
  const onKit = () => { if (!dungeonKit.ready) return; if (!session && world.planet === 'home') { if (keeper) { const fresh = buildKeeper(); keeper.mesh.clear(); keeper.mesh.add(...fresh.children); } if (lobbyMesh) { const fresh = buildLobby(); lobbyMesh.clear(); lobbyMesh.add(...fresh.children); } } else if (session) { restage(session.arenaStage, true); restyleCreatures(); } };
  const previousInteract = world.onInteract;
  world.onInteract = e => {
    if (e.kind === 'dungeon-keeper') { keeperDialog(); return; }
    if (e.kind === 'dungeon-portal') { if (session && session.role !== 'peer') through(session.flow.enterPortal()); return; }
    previousInteract(e);
  };
  function keeperDialog() {
    requestKit();
    const s = h.state(), left = runsLeft(s, Date.now()), clears = s.dungeon?.clears ?? 0;
    h.openDialog('vault', 'The Delvers\' Vault', `<div class="vault-dialog"><p class="vault-lead">${esc(t('Five rooms wait below, each with its creatures and a guardian. Beat the guardian, step through the portal, and keep going. You have 30 minutes.'))}</p>
      <div class="vault-rooms">${DUNGEON_STAGES.map((st, i) => `<span title="${esc(t(st.name))}">${st.icon}<small>${i + 1}</small></span>`).join('<i>›</i>')}</div>
      <p>${esc(t('Stand in the glowing circle by the south gate. When the party is ready, the vault opens after a short countdown.'))}</p>
      <p class="muted">${esc(h.online() ? t('Online, the party is everyone standing in the circle when the countdown ends (up to 5).') : t('Your AI neighbours come along to fill the party, friends first. They help a little and never take your loot.'))}</p>
      <p class="muted">${esc(t('Each guardian may drop its own little companion (25%), always drops Rune Seals, and the last one may leave a Delver\'s Chest (50%).'))}</p>
      <p class="vault-stats"><b>${esc(t('Runs left today: {n} / {max}', { n: left, max: DUNGEON.perDay }))}</b> · ${esc(t('Cleared so far: {n}', { n: clears }))} · ${esc(t('Recommended: level 20 or higher.'))}</p>
      <div class="vault-actions">${left > 0 ? `<button class="primary" data-vault="walk">${esc(t('Walk into the circle'))}</button>` : `<p class="vault-none">${esc(t('You have used all six vault runs today. Come back tomorrow!'))}</p>`}<button data-vault="close">${esc(t('Got it'))}</button></div></div>`,
      'FIVE ROOMS, FIVE GUARDIANS', '🏰');
  }

  // ---------------------------------------------------------------- lobby
  function lobbyFrame(dt: number) {
    const s = h.state(), p = world.position, home = world.planet === 'home' && !world.interior && !h.visiting() && h.started();
    const here = home && inLobby(p) && s.hp > 0, left = runsLeft(s, Date.now());
    if (home && Math.hypot(p.x - DUNGEON.lobby.x, p.z - DUNGEON.lobby.z) < 45) requestKit();
    if (h.online()) {
      const info = lobbyOnline; lobbyPanel.hidden = !(here && (info || left <= 0));
      if (!lobbyPanel.hidden) setLobby(left <= 0 ? null : info, left);
      return;
    }
    lobbyOnline = null;
    const ready = here && left > 0 && !starting && !h.blocked(), party = lobby.step(dt, ready ? ['me'] : []);
    lobbyPanel.hidden = !here;
    if (here) { const allies = previewAllies(); setLobby(left <= 0 ? null : { n: 1 + allies.length, cd: lobby.seconds, names: [s.name, ...allies.map(a => a.name)], left }, left); }
    if (party) void startOffline();
  }
  function setLobby(info: { n: number; cd: number | null; names: string[]; left?: number } | null, left: number) {
    const html = !info ? `<b>🏰 ${esc(t('Delvers\' Vault'))}</b><span>${esc(t('You have used all six vault runs today. Come back tomorrow!'))}</span>`
      : `<b>🏰 ${esc(t('Delvers\' Vault'))} <em>${esc(t('Runs left today: {n} / {max}', { n: left, max: DUNGEON.perDay }))}</em></b><span class="vault-count">${esc(info.cd === null ? t('Party {n}/{max} · waiting for explorers', { n: info.n, max: DUNGEON.maxParty }) : info.cd <= 0 ? t('The vault is opening…') : t('Party {n}/{max} · the vault opens in {s}s', { n: info.n, max: DUNGEON.maxParty, s: info.cd }))}</span><span class="vault-names">${info.names.map(n => `<i>${esc(n)}</i>`).join('')}</span>`;
    if (lobbyPanel.dataset.html !== html) { lobbyPanel.dataset.html = html; lobbyPanel.innerHTML = html; }
  }
  function previewAllies() { const n = h.neighbours(); return n ? fillParty(1, n.cast, n.isFriend) : []; }
  async function startOffline() {
    if (starting || session) return; starting = true;
    try {
      const runId = 'run-' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), allies = previewAllies();
      const ok = await h.perform<{ left: number }>('dungeonStart', { runId, party: 1 });
      if (!ok) return;
      enter({ runId, role: 'local', online: false, seed: (Date.now() ^ 0x5eed) >>> 0, members: [{ id: 'me', name: h.state().name }], allies });
    } finally { starting = false; }
  }

  // ---------------------------------------------------------------- entering and leaving
  function enter(o: { runId: string; role: Role; online: boolean; seed: number; members: Session['members']; allies: Neighbour[]; spawn?: { x: number; z: number } }) {
    if (session) return;
    if (world.interior) return;
    requestKit();
    const saved: Session['saved'] = { root: world.root, entities: world.entities, enemies: world.enemies, obstacles: world.obstacles, detached: [], background: world.scene.background, fog: world.scene.fog, onZone: world.onZone, networkRole: world.networkRole, onRemoteDamage: world.onRemoteDamage, onStep: world.onStep, beforeRender: world.beforeRender };
    for (const child of [...world.root.children]) if (child !== world.player && child !== world.companion) { saved.detached.push(child); world.root.remove(child); }
    world.entities = []; world.enemies = []; world.obstacles = wallObstacles();
    world.onZone = () => {};
    // The village's own per-step modules (the daily Colossus, colossus.ts) pause while you are below: its giant stays in the
    // set-aside village list, and its sky tint would otherwise repaint the vault's.
    world.onStep = undefined; world.beforeRender = undefined; world.playerLift = 0;
    const w = world as unknown as Record<string, unknown>;
    w.applyEnemySnapshots = () => {}; w.applyAuthoritativeEnemyHealth = () => {}; w.enemySnapshots = () => [];
    const view = new VaultTelegraphs(); world.scene.add(view.root);
    session = {
      runId: o.runId, role: o.role, online: o.online, rng: seeded(o.seed), flow: new DungeonFlow(), mirror: { stage: 0, phase: 'intro', timer: DUNGEON.introTime, elapsed: 0 },
      saved, arena: new T.Group(), arenaStage: -1, portal: null, view, allies: [], members: o.members, boss: null, attacks: [], skillClock: 3, skillIndex: 0, outgoing: [],
      cleared: 0, claimed: 0, claiming: false, lastClaimAt: Date.now(), startedAt: Date.now(), root: { remaining: 0, x: 0, z: 0 }, slow: 0,
      hpShadow: o.online ? { damage: 0, set: h.state().hp } : null, syncClock: 0, spawnIndex: 0, ended: false, knocked: false, done: false,
    };
    restage(0);
    const spawn = o.spawn ?? { x: C.x, z: C.z + 10 };
    teleport(spawn.x, spawn.z, Math.PI);
    o.allies.forEach((def, i) => { const a = (i + 1) * TAU / (o.allies.length + 1) - Math.PI / 2; session!.allies.push({ def, id: 'vault-ally:' + def.id, x: spawn.x + Math.sin(a) * 2.6, z: spawn.z + Math.cos(a) * 2, facing: Math.PI, cd: 1 + i * .3, swing: 0, target: null, moving: false }); });
    for (const ally of session.allies) world.addRemotePlayer(ally.id, allyPose(ally));
    document.body.classList.add('in-vault', 'in-mode'); hud.hidden = false; lobbyPanel.hidden = true; keeperLabel.hidden = true;
    h.tone('level'); for (const ally of session.allies) h.toast(t('{name} joins the party', { name: ally.def.name }), '🤝');
    banner(0);
  }
  function wallObstacles(): World['obstacles'] { const out: World['obstacles'] = []; for (let i = 0; i < 72; i++) { const a = i * TAU / 72; out.push({ x: C.x + Math.cos(a) * (ARENA_R + 2.2), z: C.z + Math.sin(a) * (ARENA_R + 2.2), r: 1.5 }); } return out; }
  function teleport(x: number, z: number, facing = world.facing) {
    world.position.set(x, 0, z); world.facing = facing; world.destination = null; world.route = []; world.selected = null; world.marker.visible = false; world.ring.visible = false; world.cameraTarget.copy(world.position);
  }
  /** Builds (or rebuilds) the arena dressing and atmosphere for a room. */
  function restage(stage: number, force = false) {
    const s = session; if (!s || (s.arenaStage === stage && !force)) return;
    s.arena.removeFromParent(); world.disposeTree(s.arena);
    const st = DUNGEON_STAGES[stage]; s.arena = buildArena(st); s.arena.position.set(C.x, 0, C.z); world.root.add(s.arena); s.arenaStage = stage;
    world.scene.background = new T.Color(st.sky); world.scene.fog = new T.Fog(st.fog, 38, 92);
  }
  function restyleCreatures() { for (const e of world.enemies) if (isVaultId(e.id) && e.type && !e.mesh.userData.vaultArt) adoptArt(e); }
  function adoptArt(e: Enemy) { const model = creatureModel(e.type!, enemyScale(e.type, e.boss)); if (!model) return; adoptCreatureModel(e.mesh, model, old => world.disposeTree(old)); e.mesh.userData.vaultArt = true; e.flashLit = false; }

  function exit(reason: 'clear' | 'time' | 'leave' | 'knocked' | 'rebuild' | 'server') {
    const s = session; if (!s || s.ended) return; s.ended = true; session = null; lastExit = reason;
    const rebuilt = world.root !== s.saved.root;
    s.view.root.removeFromParent();
    for (const e of world.enemies) if (isVaultId(e.id)) { e.mesh.removeFromParent(); world.disposeTree(e.mesh); }
    if (s.portal) { s.portal.mesh.removeFromParent(); world.disposeTree(s.portal.mesh); }
    s.arena.removeFromParent(); world.disposeTree(s.arena);
    for (const ally of s.allies) world.removeRemotePlayer(ally.id);
    const w = world as unknown as Record<string, unknown>; delete w.applyEnemySnapshots; delete w.applyAuthoritativeEnemyHealth; delete w.enemySnapshots;
    world.onZone = s.saved.onZone; world.onRemoteDamage = s.saved.onRemoteDamage; world.networkRole = s.saved.networkRole; world.onStep = s.saved.onStep; world.beforeRender = s.saved.beforeRender;
    if (!rebuilt) {
      world.entities = s.saved.entities; world.enemies = s.saved.enemies; world.obstacles = s.saved.obstacles;
      for (const child of s.saved.detached) world.root.add(child);
      world.scene.background = s.saved.background; world.scene.fog = s.saved.fog;
      teleport(DUNGEON.lobby.x - 1.5, DUNGEON.lobby.z - 6.5, Math.PI);
    } else for (const child of s.saved.detached) world.disposeTree(child);
    document.body.classList.remove('in-vault', 'in-mode'); hud.hidden = true; world.movementLocked = false;
    if (s.online) { if (reason !== 'server') sender?.({ type: 'dgLeave', runId: s.runId }); if (s.hpShadow) h.state().hp = Math.max(1, h.state().hp + s.hpShadow.damage); }
    if (reason === 'knocked' && !s.online) { const st = h.state(); st.hp = Math.max(1, Math.round(h.maxHp() * .3)); h.save(); }
    void finishClaims(s);
    h.toast(reason === 'time' ? 'Time is up! The vault seals itself.' : reason === 'knocked' ? 'You fainted. The keeper carried you home.' : reason === 'clear' ? 'Welcome back from the vault.' : 'Welcome back from the vault.', reason === 'knocked' ? '🌷' : '🏰');
    h.updateHud();
  }
  /** Rooms cleared but not yet claimed when the run ended are still claimed (paced as the rules ask), then the run is closed. */
  async function finishClaims(s: Session) {
    for (let tries = 0; s.claimed < s.cleared && tries < 12; tries++) {
      const wait = Math.max(0, s.lastClaimAt + DUNGEON.minStageMs + 300 - Date.now()); if (wait) await new Promise(r => setTimeout(r, wait));
      const loot = await h.perform<StageLoot>('dungeonClaim', { runId: s.runId, stage: s.claimed }, true);
      if (loot) { s.claimed++; s.lastClaimAt = Date.now(); showLoot(loot); } else await new Promise(r => setTimeout(r, 3000));
    }
    if (h.state().dungeon?.run?.id === s.runId) void h.perform('dungeonLeave', {}, true);
  }
  function confirmLeave() {
    if (!session) return;
    h.openDialog('vault-leave', 'Leave the vault', `<p class="center">${esc(t('Leave the vault? You cannot come back into this run.'))}</p><div class="vault-actions"><button class="primary" data-vault="leave-yes">${esc(t('Leave'))}</button><button data-vault="close">${esc(t('Stay'))}</button></div>`, 'Delvers\' Vault · 6 runs a day', '🚪');
  }
  function leaveRun() { if (session) exit('leave'); }

  // ---------------------------------------------------------------- creatures
  function spawn(type: string, x: number, z: number, humans: number) {
    const s = session!; const def = DUNGEON_ENEMIES[type]; if (!def) return null;
    const e = world.spawnSpecies(type, x, z, 9000 + s.spawnIndex) as Enemy | null; if (!e) return null;
    e.id = `vault:${s.arenaStage}:${s.spawnIndex++}`;
    const st = scaled(def, def.boss, humans);
    Object.assign(e, { hp: st.hp, maxHp: st.hp, baseMaxHp: st.hp, damage: st.damage, baseDamage: st.damage, xp: st.xp, level: st.level, homeX: C.x, homeZ: C.z, scaled: true });
    adoptArt(e);
    world.fx?.burst({ x, z }, { n: def.boss ? 40 : 10, color: [def.color, '#ffffff', def.accent], glow: true, speed: def.boss ? 6 : 3, up: 5, size: def.boss ? .2 : .12 });
    world.fx?.ring({ x, z }, { color: def.accent, from: .2, to: def.boss ? 4 : 1.4, life: .5, y: .1 });
    return e;
  }
  const humans = () => session?.online ? Math.max(1, session.members.length) : 1;
  function spawnMobs(stage: number) {
    const s = session!, st = DUNGEON_STAGES[stage]; restage(stage);
    let i = 0; const total = st.mobs.reduce((n, [, c]) => n + c, 0);
    for (const [type, count] of st.mobs) for (let k = 0; k < count; k++, i++) {
      const a = (i + s.rng() * .6) / total * TAU, r = 11 + s.rng() * 8; spawn(type, C.x + Math.sin(a) * r, C.z + Math.cos(a) * r, humans());
    }
  }
  function spawnBoss(stage: number) {
    const s = session!, st = DUNGEON_STAGES[stage], e = spawn(st.boss, C.x, C.z + 4, humans()); s.boss = e; s.skillClock = 3; s.skillIndex = 0;
    if (e) { world.fx?.shake?.(.6); world.fx?.text({ x: e.x, y: 3, z: e.z }, `${DUNGEON_BOSSES[st.boss].icon} ${t(DUNGEON_BOSSES[st.boss].name)}`, 'alert callout'); }
    h.toast('The guardian awakens!', DUNGEON_BOSSES[st.boss].icon); h.tone('level');
  }
  function vaultEnemies() { return world.enemies.filter(e => isVaultId(e.id)); }
  function cleanupDead() {
    for (const e of [...world.enemies]) if (isVaultId(e.id) && e.hp <= 0 && !((e.dying ?? 0) > 0)) {
      world.enemies.splice(world.enemies.indexOf(e), 1); const k = world.entities.indexOf(e); if (k >= 0) world.entities.splice(k, 1);
      e.mesh.removeFromParent(); world.disposeTree(e.mesh); if (session?.boss === e) session.boss = null;
    } else if (isVaultId(e.id) && e.hp <= 0) e.respawn = 1e9;
  }
  /** A creature fell to the explorer (main.ts hit): experience orbs only; rewards come with the room's claim. */
  function defeated(e: Enemy) {
    world.fx?.orbs?.({ x: e.x, z: e.z }, e.boss ? 8 : 3, '#7ff0ff', () => world.position, () => h.tone('coin'));
    if (e.boss) { h.toast('Guardian defeated!', '👑'); world.fx?.shake?.(.5); }
  }

  // ---------------------------------------------------------------- flow
  function through(events: FlowEvent[]) {
    const s = session; if (!s) return;
    for (const ev of events) {
      if (ev.kind === 'spawnMobs') { spawnMobs(ev.stage); }
      else if (ev.kind === 'spawnBoss') spawnBoss(ev.stage);
      else if (ev.kind === 'portal') { openPortal(); s.cleared = Math.max(s.cleared, ev.stage + 1); if (s.role === 'host') sender?.({ type: 'dgClear', runId: s.runId, stage: ev.stage }); }
      else if (ev.kind === 'next') { closePortal(); restage(ev.stage); gatherParty(); banner(ev.stage); h.tone('cast'); }
      else if (ev.kind === 'done') { s.done = true; s.cleared = STAGE_COUNT; if (s.role === 'host') sender?.({ type: 'dgClear', runId: s.runId, stage: STAGE_COUNT - 1 }); h.toast('Vault cleared! Rewards are in your bag.', '🏆'); h.tone('success'); world.fx?.burst({ x: world.position.x, z: world.position.z }, { n: 40, color: ['#ffd23f', '#ffffff', '#b48cff'], glow: true, speed: 6, up: 9 }); }
      else if (ev.kind === 'home') { exit(ev.reason); return; }
    }
  }
  function openPortal() {
    const s = session!; if (s.portal) return; const model = buildPortal();
    s.portal = world.addEntity('dungeon-portal', 'Portal to the next room', '🌀', model, C.x, C.z, 2.2); model.position.set(C.x, 0, C.z);
    world.fx?.ring({ x: C.x, z: C.z }, { color: '#b48cff', from: .3, to: 4, life: .8, y: .1 }); h.tone('cast');
  }
  function closePortal() { const s = session!; if (!s.portal) return; const k = world.entities.indexOf(s.portal); if (k >= 0) world.entities.splice(k, 1); s.portal.mesh.removeFromParent(); world.disposeTree(s.portal.mesh); s.portal = null; }
  /** Everyone (you and the neighbours) appears together at the new room's entrance. */
  function gatherParty() {
    const s = session!, a0 = s.rng() * TAU; teleport(C.x + Math.sin(a0) * 2, C.z + 12, Math.PI);
    s.allies.forEach((ally, i) => { const a = (i + 1) * TAU / (s.allies.length + 1); ally.x = world.position.x + Math.sin(a) * 2.4; ally.z = world.position.z + Math.cos(a) * 2; ally.target = null; });
    world.fx?.burst({ x: world.position.x, z: world.position.z }, { n: 24, color: ['#b48cff', '#ffffff'], glow: true, speed: 4, up: 6 });
  }
  /**
   * Claims each cleared room's rewards through the shared rules (the server's dice online), in order and no sooner than
   * the rules allow after the previous claim; a refusal ("too soon", a reconnect) is tried again a little later.
   */
  let claimRetryAt = 0;
  async function claimFrame() {
    const s = session; if (!s || s.claiming || s.claimed >= s.cleared || Date.now() < Math.max(claimRetryAt, s.lastClaimAt + DUNGEON.minStageMs + 300)) return;
    s.claiming = true; const runId = s.runId, stage = s.claimed;
    try {
      const loot = await h.perform<StageLoot>('dungeonClaim', { runId, stage }, true);
      if (loot) { s.claimed = Math.max(s.claimed, stage + 1); s.lastClaimAt = Date.now(); showLoot(loot); }
      else claimRetryAt = Date.now() + 4000;
    } finally { s.claiming = false; }
  }
  function showLoot(loot: StageLoot) {
    const parts = loot.items.map(i => `+${i.count} ${t(DUNGEON_ITEMS[i.id]?.name ?? i.id)}`);
    world.fx?.text({ x: world.position.x, y: 1.4, z: world.position.z }, `+${loot.xp} EXP`, 'xp');
    h.toast(`${t('Room {n} cleared', { n: loot.stage + 1 })} · ${parts.join(' · ')}`, '🎁');
    if (loot.pet) { h.toast(t('{name} joined you! It waits in your bag.', { name: t(DUNGEON_ITEMS[loot.pet].name) }), DUNGEON_ITEMS[loot.pet].icon); h.tone('level'); }
    h.updateHud();
  }
  function banner(stage: number) {
    const st = DUNGEON_STAGES[stage]; const el = document.createElement('div'); el.className = 'vault-banner';
    el.innerHTML = `<small>${esc(t('Stage {n}/{max}', { n: stage + 1, max: STAGE_COUNT }))}</small><strong>${st.icon} ${esc(t(st.name))}</strong><span>${esc(t(st.tagline))}</span>`;
    document.body.append(el); setTimeout(() => el.classList.add('leaving'), 2600); setTimeout(() => el.remove(), 3200);
  }

  // ---------------------------------------------------------------- guardians' skills
  function targets(): DgTarget[] {
    const s = session!, list: DgTarget[] = [];
    if (h.state().hp > 0) list.push({ id: 'me', x: world.position.x, z: world.position.z });
    for (const [id, r] of world.remotePlayers) if (r.mesh.visible && Math.hypot(r.pose.x - C.x, r.pose.z - C.z) < ARENA_R + 6) list.push({ id, x: r.pose.x, z: r.pose.z });
    void s; return list;
  }
  function bossFrame(dt: number) {
    const s = session!, e = s.boss;
    if (s.role !== 'peer' && e && e.hp > 0) {
      const busy = s.attacks.some(x => x.enemyId === e.id);
      if (!busy) s.skillClock -= dt;
      const tgt = targets(), near = tgt.filter(p => Math.hypot(p.x - e.x, p.z - e.z) < 18).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
      if (!busy && s.skillClock <= 0 && near && (e.phase === 'chase' || e.phase === 'idle' || e.phase === 'recover') && !(e.stun > 0)) {
        const boss = DUNGEON_BOSSES[e.type!], skill = boss.skills[s.skillIndex++ % boss.skills.length] as DungeonSkill;
        const a = beginSkill(skill, { x: e.x, z: e.z, radius: e.radius, facing: e.mesh.rotation.y }, near, tgt, s.rng, { x: C.x, z: C.z, r: ARENA_R });
        e.mesh.rotation.y = a.facing; s.attacks.push({ a, enemyId: e.id, mine: true }); s.outgoing.push(a);
        callout(e, skill);
      }
    }
    // Every cast in flight: keep its guardian still, strike, move it on a roll or dash, and draw.
    s.view.begin();
    for (const x of [...s.attacks]) {
      const e2 = world.enemies.find(v => v.id === x.enemyId);
      if (!e2 || e2.hp <= 0) { s.attacks.splice(s.attacks.indexOf(x), 1); continue; }
      if (s.role !== 'peer') { e2.phase = 'recover'; e2.phaseTime = Math.max(.15, x.a.life - x.a.age); e2.telegraphs = []; }
      const out = stepSkill(x.a, dt, e2, targets());
      for (const hit of out.hits) if (hit.id === 'me') {
        world.onDamage(e2.damage * hit.mult, hit.source, e2.id);
        if (hit.root) { s.root = { remaining: hit.root, x: world.position.x, z: world.position.z }; world.fx?.text({ x: world.position.x, y: 2.2, z: world.position.z }, '⛓', 'alert'); }
        if (hit.slow) s.slow = Math.max(s.slow, hit.slow);
      }
      if (out.move && s.role !== 'peer') { const d = Math.hypot(out.move.x - C.x, out.move.z - C.z), lim = ARENA_R - 2; e2.x = d > lim ? C.x + (out.move.x - C.x) / d * lim : out.move.x; e2.z = d > lim ? C.z + (out.move.z - C.z) / d * lim : out.move.z; }
      for (const b of out.bursts) { const col = DUNGEON_SKILL_INFO[x.a.skill].color; world.fx?.ring({ x: b.x, z: b.z }, { color: col, from: .2, to: Math.min(6, b.r), life: .35, y: .1, thick: .25 }); world.fx?.burst({ x: b.x, z: b.z }, { n: 8, color: [col, '#ffffff'], glow: true, speed: 4, up: 3, size: .12, life: .45 }); }
      if (out.bursts.length && Math.hypot(e2.x - world.position.x, e2.z - world.position.z) < 25) world.fx?.shake?.(.18);
      if (out.done) { s.attacks.splice(s.attacks.indexOf(x), 1); if (x.mine) { s.skillClock = skillDelay(DUNGEON_BOSSES[e2.type!]?.atkCd ?? 2, e2.hp / e2.maxHp, !!e2.enraged); e2.phase = 'chase'; e2.phaseTime = 0; } }
      else s.view.draw(x.a, e2);
    }
    s.view.end();
  }
  function callout(e: Enemy, skill: DungeonSkill) {
    if (Math.hypot(e.x - world.position.x, e.z - world.position.z) > 34) return;
    world.fx?.text({ x: e.x, y: 3.4, z: e.z }, t('⚠️ ' + DUNGEON_SKILL_INFO[skill].name), 'alert callout');
    world.fx?.burst({ x: e.x, z: e.z }, { n: 18, color: [DUNGEON_SKILL_INFO[skill].color, '#ffffff'], glow: true, size: .12, speed: 5, up: 4, life: .5, y: 2 });
  }
  /** Binds and slows: the explorer is held where the bind caught them (or pulled back toward it). */
  function statusFrame(dt: number) {
    const s = session!; s.slow = Math.max(0, s.slow - dt);
    if (s.root.remaining > 0) { world.position.x = s.root.x; world.position.z = s.root.z; world.destination = null; world.route = []; }
    else if (s.slow > 0 && s.lastPos) { world.position.x = s.lastPos.x + (world.position.x - s.lastPos.x) * .55; world.position.z = s.lastPos.z + (world.position.z - s.lastPos.z) * .55; }
    s.root.remaining = Math.max(0, s.root.remaining - dt);
    s.lastPos = { x: world.position.x, z: world.position.z };
    // The wall holds everyone in; anyone who slips past it (a dash, a knock) is put back inside.
    const d = Math.hypot(world.position.x - C.x, world.position.z - C.z); if (d > ARENA_R + 4) teleport(C.x + (world.position.x - C.x) / d * (ARENA_R - 1), C.z + (world.position.z - C.z) / d * (ARENA_R - 1));
  }

  // ---------------------------------------------------------------- the AI neighbours
  function allyPose(a: Ally): RemotePose { const d = a.def; return { id: a.id, x: a.x, z: a.z, y: a.swing > 0 ? Math.sin(a.swing / .3 * Math.PI) * .25 : 0, facing: a.facing, color: d.color, name: d.name, planet: 'home', moving: a.moving || a.swing > 0, gear: (d.pets.length ? { ...d.gear, pet: d.pets[0] } : d.gear) as RemotePose['gear'], pets: d.pets.slice(1), level: d.level, hp: 100, visual: { flight: 0 } }; }
  function alliesFrame(dt: number) {
    const s = session!, foes = vaultEnemies().filter(e => e.hp > 0);
    for (const a of s.allies) {
      a.cd -= dt; a.swing = Math.max(0, a.swing - dt);
      let foe = a.target ? foes.find(e => e.id === a.target) : undefined;
      if (!foe) { let best = Infinity; for (const e of foes) { const d = Math.hypot(e.x - a.x, e.z - a.z) + (e.boss ? 4 : 0); if (d < best) { best = d; foe = e; } } a.target = foe?.id ?? null; }
      let gx = a.x, gz = a.z;
      if (foe) { const dx = foe.x - a.x, dz = foe.z - a.z, d = Math.hypot(dx, dz), reach = foe.radius + 1.4; if (d > reach) { gx = foe.x - dx / d * reach; gz = foe.z - dz / d * reach; } a.facing = Math.atan2(dx, dz);
        if (d <= reach + .4 && a.cd <= 0) { a.cd = .9 + s.rng() * .5; a.swing = .3; world.damageEnemy(foe, (4 + Math.round(a.def.level * .6)) * (foe.boss ? 1.8 : 1.4), 0, false); world.fx?.burst({ x: foe.x, z: foe.z }, { n: 5, color: [a.def.color, '#ffffff'], glow: true, speed: 3, up: 2, size: .1, life: .3, y: .8 }); if (foe.hp <= 0) world.defeatFeedback(foe); } }
      else { const p = world.position, d = Math.hypot(p.x - a.x, p.z - a.z); if (d > 3) { gx = p.x + (a.x - p.x) / d * 2.6; gz = p.z + (a.z - p.z) / d * 2.6; } }
      // Step out of a telegraph before it lands.
      for (const x of s.attacks) for (const m of x.a.marks) if (m.shape !== 'safe' && x.a.age < m.at && inMark(m, { x: gx, z: gz }, .6)) { const ang = Math.atan2(gx - m.x, gz - m.z) || a.facing; gx = m.x + Math.sin(ang) * (m.r + 1.2); gz = m.z + Math.cos(ang) * (m.r + 1.2); }
      const dx = gx - a.x, dz = gz - a.z, d = Math.hypot(dx, dz), step = Math.min(d, 4.6 * dt); a.moving = d > .08;
      if (a.moving) { a.x += dx / d * step; a.z += dz / d * step; if (!foe) a.facing = Math.atan2(dx, dz); }
      const r = Math.hypot(a.x - C.x, a.z - C.z); if (r > ARENA_R - .8) { a.x = C.x + (a.x - C.x) / r * (ARENA_R - .8); a.z = C.z + (a.z - C.z) / r * (ARENA_R - .8); }
      world.updateRemotePlayer(a.id, allyPose(a));
    }
  }

  // ---------------------------------------------------------------- pets with skills
  function petFrame(dt: number) {
    const s = h.state(), id = s.gear.pet; if (!id || !DUNGEON_PETS[id] || !h.started() || h.blocked() || h.visiting()) return;
    if (h.online() && !session) return; // online outside the vault the server owns combat: the pet only shoots
    petClock -= dt; if (petClock > 0) return;
    const pet = DUNGEON_PETS[id], from = { x: world.companion.position.x, z: world.companion.position.z };
    let target: Enemy | null = null, best = 12; for (const e of world.enemies) if (e.hp > 0 && e.mesh.visible) { const d = Math.hypot(e.x - from.x, e.z - from.z); if (d < best) { best = d; target = e; } }
    if (!target) { petClock = .5; return; }
    petClock = pet.skillCd; const skill = pet.skills[Math.floor(Date.now() / 1000 / pet.skillCd) % 2], { marks, mult, color } = petSkillMarks(skill, from, target, Math.random);
    for (const m of marks) { world.fx?.ring({ x: m.x, z: m.z }, { color, from: .2, to: m.shape === 'line' ? 1.2 : m.r, life: .4, y: .1, thick: .3 }); world.fx?.burst({ x: m.x, z: m.z }, { n: 6, color: [color, '#ffffff'], glow: true, speed: 3, up: 3, size: .1 }); }
    if (marks[0]?.shape === 'line') world.fx?.burst({ x: (from.x + target.x) / 2, z: (from.z + target.z) / 2 }, { n: 10, color, glow: true, speed: 2, up: 1, size: .12 });
    const damage = Math.round(h.attack() * mult * pet.skillDmg * .5);
    for (const e of petHits(marks, world.enemies)) h.hitEnemy(e, damage);
    world.fx?.text({ x: from.x, y: 1.2, z: from.z }, t(PET_SKILLS[skill].name), 'item');
  }

  // ---------------------------------------------------------------- online relay
  function syncFrame(dt: number) {
    const s = session!; if (!s.online) return;
    if (s.role === 'host') {
      s.syncClock -= dt; if (s.syncClock > 0) return; s.syncClock = .12;
      const enemies = vaultEnemies().map(e => ({ id: e.id, type: e.type, x: Math.round(e.x * 100) / 100, z: Math.round(e.z * 100) / 100, hp: Math.round(e.hp), maxHp: e.maxHp, f: Math.round(e.mesh.rotation.y * 100) / 100, ph: e.phase, d: e.damage }));
      const casts = s.outgoing.splice(0).map(a => ({ ...a, enemyId: s.boss?.id }));
      sender?.({ type: 'dgSync', runId: s.runId, state: { stage: s.flow.stage, phase: s.flow.phase, timer: s.flow.timer, elapsed: s.flow.elapsed, portal: !!s.portal, enemies, casts } });
    }
  }
  type SyncState = { stage: number; phase: string; timer: number; elapsed: number; portal: boolean; enemies: Array<{ id: string; type: string; x: number; z: number; hp: number; maxHp: number; f: number; ph?: string; d?: number }>; casts: Array<Record<string, unknown>> };
  function applySync(st: SyncState) {
    const s = session; if (!s || s.role !== 'peer' || !st || !Number.isInteger(st.stage) || st.stage < 0 || st.stage >= STAGE_COUNT) return;
    if (st.stage !== s.mirror.stage) { restage(st.stage); gatherParty(); banner(st.stage); }
    s.mirror = { stage: st.stage, phase: String(st.phase), timer: Number(st.timer) || 0, elapsed: Number(st.elapsed) || 0 };
    if (st.portal && !s.portal) openPortal(); else if (!st.portal && s.portal) closePortal();
    const seen = new Set<string>();
    for (const raw of Array.isArray(st.enemies) ? st.enemies.slice(0, 64) : []) {
      if (typeof raw?.id !== 'string' || !isVaultId(raw.id) || !DUNGEON_ENEMIES[raw.type] || !Number.isFinite(raw.x) || !Number.isFinite(raw.z) || Math.hypot(raw.x - C.x, raw.z - C.z) > ARENA_R + 6) continue;
      seen.add(raw.id); let e = world.enemies.find(v => v.id === raw.id);
      if (!e) { const made = spawn(raw.type, raw.x, raw.z, humans()); if (!made) continue; made.id = raw.id; e = made; if (e.boss) s.boss = e; }
      e.x = raw.x; e.z = raw.z; e.maxHp = Math.max(1, raw.maxHp); const was = e.hp; e.hp = Math.max(0, Math.min(e.maxHp, raw.hp)); e.mesh.rotation.y = raw.f ?? 0; e.phase = raw.ph ?? e.phase; if (Number.isFinite(raw.d)) e.damage = raw.d!;
      if (was > 0 && e.hp <= 0) { e.dying = .3; world.defeatFeedback(e); }
    }
    for (const e of vaultEnemies()) if (!seen.has(e.id) && e.hp > 0) { e.hp = 0; e.dying = .3; }
    for (const raw of Array.isArray(st.casts) ? st.casts.slice(0, 4) : []) { const a = sanitizeAttack(raw, Object.keys(SKILL_WINDUPS)); const id = typeof raw.enemyId === 'string' ? raw.enemyId : s.boss?.id; if (a && id) { s.attacks.push({ a, enemyId: id, mine: false }); const e = world.enemies.find(v => v.id === id); if (e) callout(e, a.skill); } }
  }
  function message(m: { type: string; [key: string]: unknown }) {
    if (m.type === 'dgLobby') { lobbyOnline = m.gone ? null : { n: Number(m.n) || 0, cd: typeof m.cd === 'number' ? m.cd : null, names: Array.isArray(m.names) ? (m.names as string[]).map(String).slice(0, 5) : [], left: Number(m.left) || 0 }; return; }
    if (m.type === 'dgGo') {
      lobbyOnline = null; const runId = String(m.runId ?? ''), me = onlineId = String(m.you ?? ''), members = Array.isArray(m.members) ? (m.members as Array<{ id: string; name: string; level?: number }>).slice(0, 5) : [];
      const spawnAt = m.spawn && typeof m.spawn === 'object' ? m.spawn as { x: number; z: number } : undefined;
      void h.perform<{ left: number }>('dungeonStart', { runId, party: Math.max(1, members.length) }).then(ok => {
        if (!ok) { sender?.({ type: 'dgLeave', runId }); return; }
        enter({ runId, role: m.host === me ? 'host' : 'peer', online: true, seed: Number(m.seed) >>> 0, members, allies: [], spawn: spawnAt && Number.isFinite(spawnAt.x) ? spawnAt : undefined });
      });
      return;
    }
    const s = session; if (!s || m.runId !== s.runId) return;
    if (m.type === 'dgSync') applySync(m.state as SyncState);
    else if (m.type === 'dgHit' && s.role === 'host') { const e = world.enemies.find(v => v.id === m.id && v.hp > 0); const dmg = Number(m.damage); if (e && Number.isFinite(dmg) && dmg > 0) { world.damageEnemy(e, Math.min(dmg, e.maxHp), Math.min(1, Number(m.stun) || 0), false); world.hitFeedback(e, Math.round(dmg), false); if (e.hp <= 0) world.defeatFeedback(e); } }
    else if (m.type === 'dgHurt') world.onDamage(Number(m.amount) || 0, m.source === 'shot' ? 'shot' : m.source === 'hazard' ? 'hazard' : 'melee');
    else if (m.type === 'dgClear' && Number.isInteger(m.stage)) { s.cleared = Math.max(s.cleared, Math.min(STAGE_COUNT, Number(m.stage) + 1)); if (Number(m.stage) === STAGE_COUNT - 1) { s.done = true; h.toast('Vault cleared! Rewards are in your bag.', '🏆'); } }
    else if (m.type === 'dgHost') { if (m.host === onlineId && s.role === 'peer') { s.role = 'host'; const f = s.flow; f.stage = s.mirror.stage; f.phase = (['intro', 'mobs', 'boss', 'portal', 'done'].includes(s.mirror.phase) ? s.mirror.phase : 'mobs') as DungeonFlow['phase']; f.timer = s.mirror.timer; f.elapsed = s.mirror.elapsed; for (const e of vaultEnemies()) if (e.boss && e.hp > 0) s.boss = e; } }
    else if (m.type === 'dgEnd') exit(m.reason === 'time' ? 'time' : 'server');
  }

  // ---------------------------------------------------------------- the frame
  h.onFrame(dt => {
    if (!h.started()) return;
    if (!session) { lobbyFrame(dt); keeperTag(); petFrame(dt); return; }
    const s = session;
    if (world.root !== s.saved.root) { exit('rebuild'); return; }
    const paused = h.blocked() && !s.online;
    // Keep this run's network role: the browser that runs the arena simulates creatures, the others mirror it.
    world.networkRole = s.role === 'peer' ? 'peer' : null;
    if (world.onRemoteDamage !== relayHurt) { world.onRemoteDamage = relayHurt; }
    if (s.hpShadow) { const st = h.state(); if (st.hp !== s.hpShadow.set) { const server = st.hp; st.hp = Math.max(0, server - s.hpShadow.damage); s.hpShadow.set = st.hp; } }
    if (!paused) {
      if (s.role !== 'peer') { const alive = { mobs: vaultEnemies().filter(e => e.hp > 0 && !e.boss).length, boss: vaultEnemies().some(e => e.boss && e.hp > 0) }; through(s.flow.step(dt, alive)); if (!session) return; }
      else { s.mirror.elapsed += dt; if (s.mirror.elapsed > DUNGEON.timeLimit + 30) { exit('time'); return; } }
      bossFrame(dt); statusFrame(dt); if (s.allies.length) alliesFrame(dt); petFrame(dt);
      if (s.portal && s.role !== 'peer' && Math.hypot(world.position.x - C.x, world.position.z - C.z) < 2.6) through(s.flow.enterPortal());
    }
    if (!session) return;
    cleanupDead(); syncFrame(dt); void claimFrame(); hudFrame();
  });
  function relayHurt(id: string, amount: number, source?: string) { const s = session; if (s?.role === 'host' && !id.startsWith('vault-ally:')) sender?.({ type: 'dgHurt', runId: s.runId, to: id, amount, source }); }
  function keeperTag() {
    if (!keeper || world.planet !== 'home' || Math.hypot(world.position.x - keeper.x, world.position.z - keeper.z) > 16) { keeperLabel.hidden = true; return; }
    const p = world.screen(DUNGEON.lobby.x, .2, DUNGEON.lobby.z); keeperLabel.hidden = !p.visible; if (p.visible) { keeperLabel.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px) translate(-50%, -50%)`; const text = `🏰 ${t('Vault')}`; if (keeperLabel.textContent !== text) keeperLabel.textContent = text; }
  }
  let hudShown = '';
  function hudFrame() {
    const s = session!, stage = s.role === 'peer' ? s.mirror.stage : s.flow.stage, phase = s.role === 'peer' ? s.mirror.phase : s.flow.phase, timer = s.role === 'peer' ? s.mirror.timer : s.flow.timer, elapsed = s.role === 'peer' ? s.mirror.elapsed : s.flow.elapsed;
    const st = DUNGEON_STAGES[stage], left = vaultEnemies().filter(e => e.hp > 0 && !e.boss).length, boss = DUNGEON_BOSSES[st.boss];
    const goal = phase === 'intro' ? t(st.tagline) : phase === 'mobs' ? t('Creatures left: {n}', { n: left }) : phase === 'boss' ? t('Defeat {name}', { name: t(boss.name) }) : phase === 'portal' ? t('The portal is open: step in (next room in {s}s)', { s: Math.ceil(Math.max(0, timer)) }) : t('Vault cleared! Home in {s}s', { s: Math.ceil(Math.max(0, timer)) });
    const party = [...s.members.map(m => m.name), ...s.allies.map(a => a.def.name)];
    const html = `<div class="vault-top"><span class="vault-stage" title="${esc(t('Stage {n}/{max}', { n: stage + 1, max: STAGE_COUNT }))}">${st.icon} <b>${stage + 1}/${STAGE_COUNT}</b> ${esc(t(st.name))}</span><span class="vault-clock">⏱ ${clock(Math.max(0, DUNGEON.timeLimit - elapsed))}</span><button data-vault="leave" title="${esc(t('Leave the vault'))}" aria-label="${esc(t('Leave the vault'))}">🚪</button></div><div class="vault-goal">${esc(goal)}</div><div class="vault-party">${party.map((n, i) => `<i class="${i < s.members.length ? 'human' : 'ally'}">${esc(n)}</i>`).join('')}</div>`;
    if (html !== hudShown) { hudShown = html; hud.innerHTML = html; const zone = document.querySelector('#zone-name'); if (zone) zone.textContent = t(st.name); }
  }

  // ---------------------------------------------------------------- main.ts hooks
  const api = {
    get active() { return !!session; },
    owns: (e: { id: string }) => !!session && isVaultId(e.id),
    /** May this client apply a hit itself? A peer sends it to the run's host instead (and shows only the number). */
    mayDamage(e: Enemy, damage: number, stun = 0) {
      const s = session; if (!s || s.role !== 'peer') return true;
      sender?.({ type: 'dgHit', runId: s.runId, id: e.id, damage: Math.round(damage), stun }); world.hitFeedback(e, Math.round(damage), false); return false;
    },
    defeated, confirmLeave, message,
    knockedOut() { if (!session || session.knocked) return; session.knocked = true; exit('knocked'); },
    /** Arena damage online stays local to the run (the server's health is untouched); this keeps it across profile updates. */
    noteDamage(amount: number) { const s = session; if (s?.hpShadow) { s.hpShadow.damage += amount; s.hpShadow.set = h.state().hp; } },
    setSender(fn: typeof sender) { sender = fn; },
    // Development hooks (window.__vault): start a run at once, clear the room, jump to a stage.
    async quickStart(stage = 0, allies = true) { if (session) return true; const runId = 'dev-' + Date.now().toString(36); const ok = await h.perform('dungeonStart', { runId, party: 1 }); if (!ok) { const s = h.state(); if (s.dungeon) s.dungeon.runs = 0; if (!await h.perform('dungeonStart', { runId, party: 1 })) return false; } enter({ runId, role: 'local', online: false, seed: 1234, members: [{ id: 'me', name: h.state().name }], allies: allies ? previewAllies() : [] }); if (stage > 0) api.skipTo(stage); return true; },
    skipTo(stage: number) { const s = session; if (!s || s.role === 'peer') return; for (const e of vaultEnemies()) { e.hp = 0; e.dying = 0; } cleanupDead(); s.attacks = []; closePortal(); s.flow.stage = Math.max(0, Math.min(STAGE_COUNT - 1, stage)); s.flow.phase = 'intro'; s.flow.timer = .1; restage(s.flow.stage); gatherParty(); },
    killAll(bossToo = false) { for (const e of vaultEnemies()) if (bossToo || !e.boss) { world.damageEnemy(e, e.hp + 1); } },
    get session() { return session; },
    /** Why the last run ended (tests and probes). */
    get lastExit() { return lastExit; },
  };
  return api;
}
export type DungeonApi = ReturnType<typeof initDungeon>;
