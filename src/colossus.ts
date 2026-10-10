import * as T from 'three';
// colossus.css is imported by main.ts (this module is a lazy chunk: its sheet must keep its place in the cascade)
import { t } from './i18n.ts';
import * as M from './model.ts';
import type { World, Enemy } from './world.ts';
import type { EnemyDefinition } from './enemy-types.ts';
import { terrainHeight } from './environments.ts';
import { planetLight } from './toon.ts';
import { cameraOffset } from './camera-rig.ts';
import { COLOSSUS_ID, COLOSSUS_MINIONS, COLOSSUS_MINION_SHARD, COLOSSUS_NAME, COLOSSUS_SCHEDULE as W, COLOSSUS_STATS as S, COLOSSUS_TYPE, clockText, colossusClock, colossusMaxHp, NEIGHBOUR_HIT_CAP } from './colossus-content.ts';
import { COLOSSUS_CALLOUTS, beginColossusAttack, colossusCadence, colossusDamage, colossusSkill, colossusTelegraphs, headMultiplier, headPoint, sanitizeColossusAttack, stepColossusAttack, throughDefence, type ColossusAttack, type ColossusEffect, type ColossusHit, type ColossusSource } from './colossus-patterns.ts';
import { colossusContributors, grantColossusReward } from './colossus-rewards.ts';
import { loadColossusArt, makeColossusRig, poseColossus, colossusArtReady, type ColossusRig } from './colossus-art.ts';
import { ColossusAttackView } from './colossus-view.ts';

/** What the runtime needs from the game (main.ts wires it). */
export interface ColossusHost {
  world: World;
  state(): M.SaveState;
  /** Cloud play: the server owns the Colossus (its HP, attacks and rewards). */
  online(): boolean;
  /** Fighting is possible: the game has started, no visit, not in the starship. */
  playing(): boolean;
  /** The explorer's defence as the hurt rule counts it (gear, skills, armour buff). */
  defence(): number;
  /** The game's own hurt path (invulnerability frames, death and so on); amount before defence. */
  hurt(amount: number): void;
  change<R>(fn: () => R): R;
  toast(message: string, icon?: string): void;
  floating(text: string, x: number, z: number, style?: string): void;
  spawnLoot(loot: { id: string; count: number }[], x: number, z: number): void;
  tone(kind: string): void;
  hud: HTMLElement;
}
/** A server message about the room's Colossus (server/colossus-authority.mjs). */
export interface ColossusServerState { on: boolean; soon?: boolean; startsAt?: number; endsAt?: number; hp?: number; maxHp?: number; killed?: boolean; facing?: number; attacks?: unknown[]; kneel?: boolean; finalBlow?: boolean }
export interface ColossusServerHit { effect?: ColossusEffect; x?: number; z?: number; amount?: number }

export const COLOSSUS_DEFINITION: EnemyDefinition = {
  name: COLOSSUS_NAME, hp: S.hp, damage: S.atk, speed: 0, reach: 14, sight: S.sight, xp: S.xp, radius: S.radius, behavior: 'boss', family: 'colossus',
  color: '#4b3a3b', accent: '#ff7a1e', cooldown: S.cooldown, windup: 1, boss: true,
};
type Driven = Enemy & { driver?: { incoming(e: Enemy, amount: number, hazard: boolean): number } };
const SKY = new T.Color('#2a1420'), DUSK_SKY_LIGHT = new T.Color('#c87a6a'), DUSK_SUN = new T.Color('#ff9a62'), sky = new T.Color(), fogColor = new T.Color();
/** The arena camera pulls back this much (× the player's zoom) near the Colossus, so more of the giant fits in view. */
const ARENA_ZOOM = 1.4, ARENA_RANGE = 48;
/** Closer than this (about the giant's sight, S.sight), the real model is fetched; far away the fog hides it anyway. */
const ART_RANGE = 70;
const BOT_PREFIX = 'bot:';
/** A toast shows its own icon: drop the emoji a message starts with. */
const bare = (text: string) => text.replace(/^[^\p{L}\p{N}]+\s/u, '');
/** Seconds between two "weak point" floats, so a flurry of hits does not stack them. */
const HEAD_WEAK_TEXT_GAP = .45;

/**
 * The daily Cinderpeak Colossus. Offline (solo, guests, the Pages edition) it wakes on the local clock and this class runs
 * the whole fight; online the server runs it and this class draws what the server says. Either way it spawns as one
 * driven Enemy (world.ts skips its AI, motion and drawing), darkens every planet while awake and shows the banner.
 */
export class ColossusEvent {
  private h: ColossusHost;
  private rig: ColossusRig | null = null;
  private view = new ColossusAttackView();
  private enemy: Driven | null = null;
  private artAsked = false;
  private time = 0;
  /** Offline fight state for today's window. */
  private day = -1; private killedDay = -1; private attacks: ColossusAttack[] = []; private count = 0; private nextAt = 0; private facing: number = W.facing;
  private rise = 0; private dying = 0; private kneel = 0; private announced = { kneel: false, enrage: false };
  private lastHits = new Map<string, number>(); private killer: string | null = null; private striker: string | null = null;
  private minions: Enemy[] = []; private minionsUsed: string[] = []; private minionIndex = 0;
  /** Effects on the explorer (local in both modes; online the server counts the damage). */
  private crackUntil = 0; private scorchUntil = 0; private burnUntil = 0; private burnTick = 0; private stunUntil = 0;
  private throwing: { fromX: number; fromZ: number; toX: number; toZ: number; t: number; land: boolean } | null = null;
  private weakAt = -1; private dark = 0; private lightPlanet = ''; private lastPhase = '';
  private zoomK = 1; private fittedK = 1; private fitAt = 0;
  /** Online: the last state the server sent (null until one arrives). */
  private server: (ColossusServerState & { at: number }) | null = null;
  private serverAttacks: ColossusAttack[] = [];
  /** The newest attack still running: it drives the pose and the head weak point. */
  private get attack(): ColossusAttack | null { const list = this.h.online() ? this.serverAttacks : this.attacks; for (let i = list.length - 1; i >= 0; i--) if (!list[i].done) return list[i]; return null; }
  /** A forced window for testing (?colossus=1 or __zoo.colossus.start()). */
  private forcedUntil = 0;
  private banner: HTMLElement; private bannerKey = '';
  /** Explorer lift while being hurled (world.playerLift draws it). */
  lift = 0;

  constructor(host: ColossusHost) {
    this.h = host;
    try { this.killedDay = Number(localStorage.getItem('zoo-colossus-killed') ?? -1); } catch { this.killedDay = -1; }
    this.banner = document.createElement('div'); this.banner.id = 'colossus-banner'; this.banner.hidden = true; this.banner.setAttribute('role', 'status');
    host.hud.append(this.banner);
    // The fight steps with the world (after main sets the step's movement lock) and poses just before each draw.
    host.world.onStep = dt => { this.step(dt); if (this.locked) host.world.movementLocked = true; };
    host.world.beforeRender = () => this.frame();
    // online.ts forwards the room's Colossus messages as DOM events (no import cycle with the network layer).
    addEventListener('zoo-colossus', event => {
      const message = (event as CustomEvent).detail as { type?: string } & ColossusServerState & ColossusServerHit;
      if (message?.type === 'colossus') this.applyServer(message); else if (message?.type === 'colossusHit') this.applyServerHit(message);
    });
  }
  /** Movement is locked while stunned by the roar or flying through the air. */
  get locked() { return this.time < this.stunUntil || !!this.throwing; }
  /** Defence multiplier from a cracked armour and scorching (each ×0.5). */
  get defenceFactor() { return (this.time < this.crackUntil ? S.crackFactor : 1) * (this.time < this.scorchUntil ? S.burnDefFactor : 1); }
  get alive() { return !!this.enemy && this.enemy.hp > 0; }
  /** Where AI neighbours gather to help (bots.ts through the game bridge), or null when there is nothing to fight. */
  rally(): { id: string; x: number; z: number; r: number } | null {
    const e = this.enemy; if (!e || e.hp <= 0 || this.h.online() || this.h.world.planet !== 'home' || this.rise < 1) return null;
    return { id: e.id, x: e.x, z: e.z, r: e.radius };
  }
  /** A neighbour's blow: small damage that never earns it a reward. */
  botStrike(botId: string, amount: number) {
    const e = this.enemy; if (!e || e.hp <= 0 || !(amount > 0) || this.h.online()) return;
    this.striker = BOT_PREFIX + botId; try { this.h.world.damageEnemy(e, Math.min(amount, NEIGHBOUR_HIT_CAP)); } finally { this.striker = null; }
    this.h.world.burst(e.x + (Math.random() - .5) * 6, e.z + (Math.random() - .5) * 6, '#ffd27a', 5);
  }
  /** Testing: wake it now for `minutes` (offline only). */
  start(minutes = 60) { this.forcedUntil = Date.now() + minutes * 60000; this.killedDay = -1; this.day = -1; }
  /** Testing: the current offline fight, for probes. */
  get debug() { return { hp: this.enemy?.hp ?? 0, maxHp: this.enemy?.maxHp ?? 0, skill: this.attack?.skill ?? null, age: this.attack?.age ?? 0, attacks: this.attacks.length, count: this.count, kneel: this.kneel, dark: this.dark, facing: this.facing, online: !!this.server }; }
  /** Testing: run the fight to a given skill's wind-up (offline). */
  force(skill: string, at = .6) {
    const order = ['stomp', 'bite', 'slap', 'breath', 'grab', 'spit', 'sweep', 'meteor', 'stomp', 'roar'], i = order.indexOf(skill);
    if (i < 0 || !this.enemy) return false; this.count = i; this.attacks = []; this.nextAt = this.time; this.cast(); const a = this.attacks.at(-1); if (a) a.age = a.windup * at; return true;
  }
  /** Testing: set the health share (offline), e.g. 0.2 to see it kneel. */
  setHealth(share: number) { if (this.enemy) this.enemy.hp = Math.max(1, Math.round(this.enemy.maxHp * share)); }

  // ---- Server messages (online) ----
  applyServer(state: ColossusServerState) {
    if (!state || typeof state !== 'object') return;
    this.server = { ...state, at: Date.now() };
    const incoming = (Array.isArray(state.attacks) ? state.attacks : []).slice(0, 6).map(sanitizeColossusAttack).filter((a): a is ColossusAttack => !!a);
    // Keep our own ages running between messages unless the server's drift apart (a new attack, a late packet).
    this.serverAttacks = incoming.map(a => { const mine = this.serverAttacks.find(b => b.skill === a.skill && b.source.x === a.source.x && b.marks[0]?.x === a.marks[0]?.x && Math.abs(b.age - a.age) < .35); return mine ?? a; });
    if (Number.isFinite(state.facing)) this.facing = state.facing!;
    if (state.finalBlow) this.h.toast(bare(t('👑 You landed the FINAL BLOW! Little Cinderpeak joins you.')), '👑');
    const e = this.enemy;
    if (e && Number.isFinite(state.hp) && Number.isFinite(state.maxHp)) { const was = e.hp; e.maxHp = state.maxHp!; e.hp = Math.max(0, state.hp!); if (was > 0 && e.hp <= 0) this.crumble(); }
  }
  /** The server says one of its blows hit us: play the effect it carries (the damage arrives as health). */
  applyServerHit(hit: ColossusServerHit) { if (hit?.effect) this.effect(hit.effect); }

  // ---- The frame ----
  /** One fixed step of the fight (world.onStep, at the start of each world step). */
  step(dt: number) {
    if (!(dt > 0)) return;
    this.time += dt;
    const now = Date.now(), w = this.h.world, clock = this.window(now), online = this.h.online();
    const awake = online ? !!this.server?.on && !this.server?.killed : clock.phase === 'active' && this.killedDay !== clock.day;
    if (!online && clock.phase === 'active' && this.day !== clock.day) this.resetDay(clock.day);
    if (clock.phase !== this.lastPhase) { if (this.lastPhase === 'active' && clock.phase !== 'active' && !online) this.retreat(); this.lastPhase = clock.phase; }
    const home = w.planet === 'home' && !w.interior && this.h.playing();
    if (awake && home) this.ensureSpawned(online); else if (!awake && this.enemy && this.enemy.hp > 0 && !this.dying) this.despawn();
    if (this.enemy && !w.enemies.includes(this.enemy)) { this.enemy = null; this.rig = null; this.minions = []; }
    this.stepPlayer(dt);
    const e = this.enemy;
    if (e && !this.artAsked && (colossusArtReady() || Math.hypot(w.position.x - e.x, w.position.z - e.z) < ART_RANGE)) { this.artAsked = true; loadColossusArt(() => this.restyle()); }
    if (e) {
      this.rise = Math.min(1, this.rise + dt / 2.5);
      if (e.hp > 0) { if (online) this.stepOnline(dt); else this.stepOffline(dt); }
      else if (this.dying > 0) { this.dying = Math.min(1, this.dying + dt / 3); if (this.dying >= 1) this.removeEnemy(); }
    }
    this.stepMinions();
    this.darken(dt, awake && (!e || e.hp > 0));
    const close = !!this.enemy && this.enemy.hp > 0 && w.planet === 'home' && !w.interior && Math.hypot(w.position.x - this.enemy.x, w.position.z - this.enemy.z) < ARENA_RANGE;
    this.zoomK += ((close ? ARENA_ZOOM : 1) - this.zoomK) * Math.min(1, dt * 1.6);
    if (Math.abs(this.zoomK - 1) < .002) this.zoomK = 1;
  }
  /** Drawing: just before the frame is drawn (world.beforeRender): pose, attacks, camera, banner. */
  frame() {
    const w = this.h.world, e = this.enemy;
    this.view.begin();
    if (e && this.rig) {
      const a = this.attack, ground = Math.max(0, terrainHeight(w.environment.layout, e));
      poseColossus(this.rig, { x: e.x, z: e.z, ground, facing: this.facing, time: this.time, attack: a, kneel: this.kneel, dying: this.dying, rise: this.rise });
      if (e.hp > 0) {
        this.rig.root.updateMatrixWorld(true); const head = this.rig.parts.head.getWorldPosition(new T.Vector3()).add(new T.Vector3(Math.sin(this.facing) * 2.5, -.6, Math.cos(this.facing) * 2.5));
        for (const b of this.h.online() ? this.serverAttacks : this.attacks) if (!b.done) this.view.draw(b, (x, z) => terrainHeight(w.environment.layout, { x, z }), this.time, head);
      }
      e.mesh.visible = true;
    }
    this.view.end();
    if (this.view.root.parent !== w.scene) w.scene.add(this.view.root);
    this.frameCamera();
    this.updateBanner();
  }

  /**
   * The arena camera: the offset is recomputed every frame from the player's own zoom, and the shadow box and view reach
   * are refitted now and then while it moves (world.resize, with the zoom borrowed for the call). It runs just before
   * the frame is drawn, so the canvas resize inside never shows.
   */
  private frameCamera() {
    const w = this.h.world, k = this.zoomK, now = this.time;
    if (k === 1 && this.fittedK === 1) return;
    cameraOffset(innerWidth / innerHeight, w.zoom * k, w.viewOffset);
    if (Math.abs(k - this.fittedK) > .04 && now - this.fitAt > .3 || k === 1 && this.fittedK !== 1) {
      const zoom = w.zoom; w.zoom = zoom * k; w.resize(); w.zoom = zoom; this.fittedK = k; this.fitAt = now;
      cameraOffset(innerWidth / innerHeight, w.zoom * k, w.viewOffset);
    }
  }

  // ---- Offline fight ----
  private resetDay(day: number) {
    this.day = day; this.count = 0; this.attacks = []; this.nextAt = this.time + 3; this.facing = W.facing; this.lastHits.clear(); this.killer = null;
    this.minionsUsed = []; this.announced = { kneel: false, enrage: false }; this.kneel = 0;
    if (this.enemy) { this.enemy.maxHp = colossusMaxHp(1 + this.nearbyExplorers(), !this.h.online()); this.enemy.hp = this.enemy.maxHp; }
  }
  private window(now: number) {
    const c = colossusClock(now);
    if (this.forcedUntil > now) return { ...c, phase: 'active' as const, day: -2, startsAt: now, endsAt: this.forcedUntil, left: this.forcedUntil - now };
    return c;
  }
  private nearbyExplorers() { let n = 0; for (const r of this.h.world.remotePlayers?.values() ?? []) if (r.mesh.visible && Math.hypot(r.pose.x - W.x, r.pose.z - W.z) < 70) n++; return n; }
  private targets() {
    const w = this.h.world, list: { id: string; x: number; z: number }[] = [];
    const p = w.position, s = this.h.state();
    if (s.hp > 0 && Math.hypot(p.x, p.z) > 18 && !this.throwing) list.push({ id: 'local', x: p.x, z: p.z });
    return list;
  }
  private source(): ColossusSource { const e = this.enemy!; return { x: e.x, z: e.z, facing: this.facing }; }
  private stepOffline(dt: number) {
    const e = this.enemy!, share = e.hp / e.maxHp, cadence = colossusCadence(share), targets = this.targets();
    this.kneel = Math.min(1, Math.max(0, this.kneel + (cadence.kneeling ? dt : -dt) / 1.6));
    if (cadence.kneeling && !this.announced.kneel) { this.announced.kneel = true; this.h.toast(t('The Cinderpeak Colossus falls to its knees! Its head is in reach.'), '💥'); this.h.world.fx?.shake(.9); }
    if (cadence.enraged && !this.announced.enrage) { this.announced.enrage = true; this.h.toast(t('The Cinderpeak Colossus is enraged! Its attacks come faster.'), '😡'); }
    const near = targets.filter(p => Math.hypot(p.x - e.x, p.z - e.z) < S.sight);
    // Turn slowly toward the nearest explorer (it never walks).
    const target = near.sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
    const current = this.attack;
    if (target && (!current || current.age >= current.windup)) { const want = Math.atan2(target.x - e.x, target.z - e.z), d = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing)); this.facing += Math.max(-dt * .7, Math.min(dt * .7, d)); }
    for (const a of this.attacks) {
      const result = stepColossusAttack(a, dt, near);
      if (result.landed) this.landed(a);
      for (const hit of result.hits) if (hit.id === 'local') this.hitPlayer(hit);
      if (result.summon) this.spawnMinion(a.marks[0] ?? e);
      for (const b of result.bursts) this.burst(b.x, b.z, b.r, a.skill);
    }
    this.attacks = this.attacks.filter(a => !a.done);
    const busy = this.attack;
    if (target && this.time >= this.nextAt && (!busy || busy.age >= busy.windup)) this.cast(target);
  }
  private cast(target?: { x: number; z: number }) {
    const e = this.enemy; if (!e) return;
    const near = this.targets(), aim = target ?? near[0] ?? { x: e.x + Math.sin(this.facing) * 10, z: e.z + Math.cos(this.facing) * 10 };
    const share = e.hp / e.maxHp, cadence = colossusCadence(share), skill = colossusSkill(this.count++), src = this.source();
    const marks = colossusTelegraphs(skill, src, aim, near, Math.random);
    // Earlier attacks keep running beside it (a stomp's lava footprint, meteors still falling).
    const a = beginColossusAttack(skill, src, marks, cadence.windupScale); this.attacks.push(a);
    this.nextAt = this.time + a.windup + cadence.cooldown;
    this.callout(skill);
  }
  private callout(skill: ColossusAttack['skill']) {
    const w = this.h.world, e = this.enemy, d = e ? Math.hypot(w.position.x - e.x, w.position.z - e.z) : Infinity; if (!e || d > 75) return;
    // Above the explorer, nudged toward the giant: its body is mostly beyond the top of the screen.
    const k = Math.min(1, 3 / Math.max(.01, d));
    w.fx?.text({ x: w.position.x + (e.x - w.position.x) * k, y: 3.2, z: w.position.z + (e.z - w.position.z) * k }, t(COLOSSUS_CALLOUTS[skill]), 'alert callout');
  }
  /** The moment a blow lands: shake, sound and dust, scaled by distance. */
  private landed(a: ColossusAttack) {
    const w = this.h.world, d = Math.hypot(w.position.x - a.source.x, w.position.z - a.source.z), near = Math.max(0, 1 - d / 70);
    if (a.skill === 'stomp' || a.skill === 'slap' || a.skill === 'roar') { w.fx?.shake(.35 + .55 * near); if (near > 0) this.h.tone(a.skill === 'roar' ? 'hurt' : 'crit'); }
  }
  private burst(x: number, z: number, r: number, skill: string) {
    const w = this.h.world, fx = w.fx; if (!fx) return;
    if (skill === 'roar') { fx.ring({ x, z }, { color: '#ffef8a', from: 2, to: r, life: .9, thick: .6 }); return; }
    fx.ring({ x, z }, { color: skill === 'meteor' ? '#ff4040' : '#ffb13d', from: .3, to: r, life: .45, thick: .35 });
    fx.burst({ x, z }, { n: Math.min(40, 10 + Math.round(r * 2)), color: ['#5a4448', '#ff7a1e', '#ffd27a'], speed: 6 + r * .5, up: 7, size: .22, life: 1 });
    if (r > 5) fx.burst({ x, z }, { n: 14, color: '#ffffff', glow: true, speed: 5, up: 3, size: .16, life: .5 });
  }
  private hitPlayer(hit: ColossusHit) {
    const s = this.h.state(), def = this.h.defence(), damage = colossusDamage(S.atk, hit.multiplier, def, this.defenceFactor, .9 + Math.random() * .2);
    this.h.hurt(throughDefence(damage, def));
    if (hit.effect) this.effect(hit.effect, s);
  }
  /** Status effects on the explorer: the same in both modes (online the server already counted the damage). */
  private effect(kind: ColossusEffect, s = this.h.state()) {
    const w = this.h.world, offline = !this.h.online();
    if (kind === 'crack' && (offline ? Math.random() < S.crackChance && !!s.gear.outfit : true)) { this.crackUntil = this.time + S.crackSeconds; this.h.toast(bare(t('💔 Armour cracked! −50% DEF for 30 s (it mends by itself).')), '💔'); w.fx?.text(w.position, t('💔 Armour cracked! −50% DEF for 30 s (it mends by itself).').split('!')[0] + '!', 'hurt'); }
    if (kind === 'burn') { const fresh = this.time >= this.scorchUntil; this.scorchUntil = this.time + S.burnDefSeconds; this.burnUntil = this.time + S.burnSeconds; if (fresh) this.h.toast(bare(t('🔥 Scorched! −50% DEF for 12 s and burning.')), '🔥'); }
    if (kind === 'stun') { this.stunUntil = this.time + S.stunSeconds; w.destination = null; w.route = []; w.fx?.text(w.position, t('😵 Stunned by the roar!'), 'hurt'); }
    if (kind === 'grab') {
      const e = this.enemy, from = { x: w.position.x, z: w.position.z }, away = e ? Math.atan2(from.x - e.x, from.z - e.z) : this.facing + Math.PI;
      const to = { x: from.x + Math.sin(away) * S.throwDistance, z: from.z + Math.cos(away) * S.throwDistance }, d = Math.hypot(to.x, to.z), limit = 150;
      if (d > limit) { to.x *= limit / d; to.z *= limit / d; }
      this.throwing = { fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, t: 0, land: offline }; w.destination = null; w.route = []; w.selected = null;
      w.fx?.text(w.position, t('🪨 Grabbed and hurled!'), 'hurt');
    }
  }
  private stepPlayer(dt: number) {
    const w = this.h.world, s = this.h.state(), offline = !this.h.online();
    if (this.throwing) {
      const th = this.throwing, k0 = th.t / S.throwSeconds; th.t = Math.min(S.throwSeconds, th.t + dt); const k1 = th.t / S.throwSeconds;
      w.move((th.toX - th.fromX) * (k1 - k0), (th.toZ - th.fromZ) * (k1 - k0), true);
      this.lift = Math.sin(k1 * Math.PI) * S.throwHeight;
      if (k1 >= 1) { this.throwing = null; this.lift = 0; w.landT = .25; w.fx?.shake(.6); w.fx?.ring(w.position, { color: '#ffb13d', to: 3.5, life: .45 }); if (th.land) this.h.hurt(throughDefence(Math.round(M.maxHp(s) * S.grabShare), this.h.defence())); }
    } else this.lift = 0;
    w.playerLift = this.lift;
    if (offline && this.time < this.burnUntil && s.hp > 0) {
      this.burnTick -= dt;
      if (this.burnTick <= 0) { this.burnTick = S.burnTick; this.h.hurt(throughDefence(Math.max(1, Math.round(M.maxHp(s) * S.burnShare)), this.h.defence())); w.fx?.burst(w.position, { n: 4, color: ['#ff7a1e', '#ffd27a'], glow: true, size: .1, speed: 1.5, up: 3, y: 1, life: .5 }); }
    }
  }

  // ---- Online mirror ----
  private stepOnline(dt: number) {
    const s = this.server;
    for (const a of this.serverAttacks) if (!a.done) { a.age = Math.min(a.windup + a.life, a.age + dt); if (a.age >= a.windup + a.life) a.done = true; }
    this.kneel = Math.min(1, Math.max(0, this.kneel + (s?.kneel ? dt : -dt) / 1.6));
  }

  // ---- Spawning ----
  private ensureSpawned(online: boolean) {
    const w = this.h.world;
    if (this.enemy && w.enemies.includes(this.enemy)) return;
    // A server snapshot may have spawned a plain creature under our id first: replace it.
    for (const old of w.enemies.filter(x => x.id === COLOSSUS_ID)) { w.enemies.splice(w.enemies.indexOf(old), 1); w.entities = w.entities.filter(x => x !== old); old.mesh.removeFromParent(); }
    this.artAsked = false; // colossus.glb (130 KB) downloads once the explorer is within ART_RANGE of the giant (step); the stand-in stands until then
    const rig = makeColossusRig(), e = w.addEntity('enemy', COLOSSUS_NAME, '👑', rig.root, W.x, W.z, S.radius) as Driven;
    e.id = COLOSSUS_ID;
    const maxHp = online ? Math.max(1, this.server?.maxHp ?? S.hp) : colossusMaxHp(1 + this.nearbyExplorers(), true), hp = online ? Math.max(0, this.server?.hp ?? maxHp) : maxHp;
    Object.assign(e, { type: COLOSSUS_TYPE, definition: COLOSSUS_DEFINITION, hp, maxHp, baseMaxHp: maxHp, baseDamage: S.atk, damage: S.atk, xp: S.xp, level: 40, homeX: W.x, homeZ: W.z, cooldown: 0, respawn: 0, boss: true, stun: 0, phase: 'chase', phaseTime: 0, route: [], routeTime: 0, lift: 0, liftVelocity: 0, statuses: {}, scaled: true, lastHitAt: Infinity });
    e.driver = { incoming: (target, amount, hazard) => this.incoming(target, amount, hazard) };
    // Tap and target-ring height: about the lower body, which is what the game camera shows.
    rig.root.userData.pickHeight = 9 / 1.85; rig.root.userData.pickHeightAsset = null; rig.root.userData.footprint = S.radius * .8;
    w.enemies.push(e); this.enemy = e; this.rig = rig; this.rise = online && (this.server?.hp ?? 1) < (this.server?.maxHp ?? 1) ? 1 : 0; this.dying = 0;
    if (!online && this.day < 0) this.resetDay(this.window(Date.now()).day);
    if (!online) { this.nextAt = this.time + 3; this.h.toast(t('The Cinderpeak Colossus has woken in Redrock Canyon! The sky darkens over every planet.'), '🌋'); this.h.tone('level'); }
  }
  /** Swaps the stand-in for the Blender giant once it arrives. */
  private restyle() {
    const e = this.enemy, old = this.rig; if (!e || !old || old.real || !colossusArtReady()) return;
    const rig = makeColossusRig(); rig.root.userData = old.root.userData; rig.root.userData.entity = e;
    const parent = old.root.parent; old.root.removeFromParent(); parent?.add(rig.root); e.mesh = rig.root; this.rig = rig;
  }
  private despawn() {
    const e = this.enemy; if (!e) return;
    this.retreatMinions(); e.hp = 0; this.dying = .001; this.attacks = []; this.serverAttacks = [];
  }
  private retreat() {
    if (this.enemy && this.enemy.hp > 0) { this.despawn(); this.h.toast(t('The Cinderpeak Colossus sinks back into the canyon. It wakes again tomorrow at 08:00.'), '🌙'); }
    this.forcedUntil = 0;
  }
  private removeEnemy() {
    const w = this.h.world, e = this.enemy; if (!e) return;
    const i = w.enemies.indexOf(e); if (i >= 0) w.enemies.splice(i, 1);
    w.entities = w.entities.filter(x => x !== e); e.mesh.removeFromParent();
    if (w.selected === e) w.selected = null;
    this.enemy = null; this.rig = null; this.dying = 0; this.view.clear();
  }

  // ---- Damage in, rewards out ----
  private incoming(e: Enemy, amount: number, hazard: boolean) {
    if (e !== this.enemy || !(amount > 0)) return amount;
    const who = this.striker ?? 'local', w = this.h.world;
    let dealt = amount;
    if (who === 'local' && !hazard) {
      const k = headMultiplier(w.position, this.source(), this.attack, this.kneel > .5);
      if (k > 1) {
        dealt *= k;
        if (this.time - this.weakAt > HEAD_WEAK_TEXT_GAP) { this.weakAt = this.time; const p = headPoint(this.source(), this.attack, this.kneel > .5); w.fx?.text({ x: p.x, y: 4, z: p.z }, t('💥 WEAK POINT ×2.5'), 'crit big'); }
      }
    }
    this.lastHits.set(who, Date.now());
    if (who === 'local' && !hazard && !this.h.online()) M.recordEvent(this.h.state(), 'colossus');
    if (e.hp - dealt <= 0) { this.killer = who; queueMicrotask(() => this.defeated()); }
    return dealt;
  }
  private defeated() {
    const e = this.enemy; if (!e || e.hp > 0 || this.dying > 0 || this.h.online()) return;
    const now = Date.now(), helpers = colossusContributors(this.lastHits, this.killer, now, S.contributionWindow, id => id.startsWith(BOT_PREFIX));
    this.killedDay = this.window(now).day; try { if (this.killedDay >= 0) localStorage.setItem('zoo-colossus-killed', String(this.killedDay)); } catch { /* a private window forgets it */ }
    this.crumble();
    if (helpers.includes('local')) {
      const lastHit = this.killer === 'local', loot = this.h.change(() => grantColossusReward(this.h.state(), lastHit, Math.random, false));
      this.h.spawnLoot(loot, e.x - 6, e.z);
      this.h.floating(`+${S.xp} EXP`, e.x - 6, e.z, 'xp');
      this.h.world.fx?.orbs({ x: e.x, z: e.z }, 8, '#7ff0ff', () => this.h.world.position, () => this.h.tone('coin'));
      if (lastHit) this.h.toast(bare(t('👑 You landed the FINAL BLOW! Little Cinderpeak joins you.')), '👑');
      else this.h.toast(t('A neighbour landed the final blow. Your share of the spoils is on the ground.'), '🎁');
    } else this.h.toast(t('Hit the Colossus within the last {seconds} seconds to share its spoils.', { seconds: S.contributionWindow }), '⏳');
  }
  /** It crumbles into the canyon; the sky clears. */
  private crumble() {
    const w = this.h.world, e = this.enemy; if (!e) return;
    this.dying = .001; this.attacks = []; this.serverAttacks = []; this.retreatMinions();
    w.fx?.shake(1); w.fx?.freeze(.12); this.h.tone('level');
    for (let i = 0; i < 6; i++) w.fx?.burst({ x: e.x + (Math.random() - .5) * 14, z: e.z + (Math.random() - .5) * 10 }, { n: 22, color: ['#4b3a3b', '#ff7a1e', '#ffd27a'], speed: 7, up: 9, size: .3, life: 1.4 });
    this.h.toast(t('The Cinderpeak Colossus crumbles! The sky clears.'), '🌋');
  }

  // ---- Minions (offline) ----
  private spawnMinion(at: { x: number; z: number }) {
    const w = this.h.world; if (this.minions.some(m => m.hp > 0)) return;
    if (this.minionsUsed.length >= COLOSSUS_MINIONS.length) this.minionsUsed = [];
    const type = COLOSSUS_MINIONS.find(id => !this.minionsUsed.includes(id)) ?? COLOSSUS_MINIONS[0]; this.minionsUsed.push(type);
    const m = w.spawnSpecies(type, at.x, at.z, 900 + (this.minionIndex++ % 50)); if (!m) return;
    m.name = t('{name} (Minion)', { name: t(m.name) }); m.phase = 'chase'; m.lastHitAt = w.time; m.homeX = at.x; m.homeZ = at.z;
    this.minions.push(m); w.fx?.burst({ x: at.x, z: at.z }, { n: 30, color: ['#ffe14d', '#ff7a1e', '#ffffff'], glow: true, speed: 6, up: 8, size: .2 });
  }
  private stepMinions() {
    const w = this.h.world;
    for (const m of [...this.minions]) {
      if (!w.enemies.includes(m)) { this.minions.splice(this.minions.indexOf(m), 1); continue; }
      if (m.hp <= 0 && !(m.dying! > 0)) {
        if (!m.mesh.userData.shardRolled) { m.mesh.userData.shardRolled = true; if (Math.hypot(w.position.x - m.x, w.position.z - m.z) < 30 && Math.random() < COLOSSUS_MINION_SHARD) this.h.spawnLoot([{ id: 'colossus_shard', count: 1 }], m.x, m.z); }
        w.enemies.splice(w.enemies.indexOf(m), 1); w.entities = w.entities.filter(x => x !== m); m.mesh.removeFromParent(); w.disposeTree(m.mesh); this.minions.splice(this.minions.indexOf(m), 1);
      }
    }
  }
  private retreatMinions() { for (const m of this.minions) if (m.hp > 0) { m.hp = 0; m.dying = .3; m.mesh.userData.shardRolled = true; } }

  // ---- Sky ----
  /** Every planet darkens while it is awake: sky light −55%, sun −60%, the sky toward deep ember red. */
  private darken(dt: number, on: boolean) {
    const w = this.h.world, target = on ? 1 : 0;
    if (w.planet !== this.lightPlanet) this.lightPlanet = w.planet;
    if (this.dark === 0 && target === 0) return;
    this.dark = Math.max(0, Math.min(1, this.dark + (target - this.dark) * Math.min(1, dt * 1.2) + (target > this.dark ? .0005 : -.0005)));
    if (w.interior) return;
    const l = planetLight(w.planet), k = this.dark;
    for (const o of w.scene.children) {
      if (o instanceof T.HemisphereLight) { o.intensity = l.hemi * (1 - .55 * k); o.color.set(l.sky).lerp(DUSK_SKY_LIGHT, .55 * k); }
      else if (o instanceof T.DirectionalLight && o.castShadow) { o.intensity = l.sunIntensity * (1 - .6 * k); o.color.set(l.sun).lerp(DUSK_SUN, .6 * k); }
    }
    const base = w.planet === 'home' ? '#aee4ff' : M.PLANETS[w.planet].sky;
    sky.set(base).lerp(SKY, .85 * k); if (w.scene.background instanceof T.Color) w.scene.background.copy(sky);
    if (w.scene.fog instanceof T.Fog) w.scene.fog.color.copy(fogColor.set(M.PLANETS[w.planet].sky).lerp(SKY, .75 * k));
  }

  // ---- Banner ----
  private updateBanner() {
    const now = Date.now(), online = this.h.online(), clock = this.window(now), e = this.enemy, s = this.server;
    let mode: 'none' | 'soon' | 'awake' | 'done' = 'none', left = clock.left;
    if (online && s) { if (s.on && !s.killed) mode = 'awake'; else if (s.soon) mode = 'soon'; else if (s.on && s.killed) mode = 'done'; if (s.startsAt && mode === 'soon') left = s.startsAt - now; if (s.endsAt && mode === 'awake') left = s.endsAt - now; }
    else if (!online) { if (clock.phase === 'soon') mode = 'soon'; else if (clock.phase === 'active') mode = this.killedDay === clock.day ? 'done' : 'awake'; }
    if (!this.h.playing()) mode = 'none';
    const hp = e && e.hp > 0 ? e.hp / e.maxHp : (online && s?.maxHp ? (s.hp ?? 0) / s.maxHp : 1);
    // Close by, the boss bar already shows its health: the banner steps back (hidden on phones, no meter on desktop).
    const bar = document.getElementById('boss-bar'), near = mode === 'awake' && !!bar && !bar.hidden && !!e && Math.hypot(this.h.world.position.x - e.x, this.h.world.position.z - e.z) < 36;
    const key = `${mode}|${near}|${Math.ceil(left / 1000)}|${Math.round(hp * 1000)}`;
    if (key === this.bannerKey) return; this.bannerKey = key;
    this.banner.hidden = mode === 'none'; this.banner.className = 'colossus-banner ' + mode + (near ? ' near' : '');
    if (mode === 'soon') this.banner.innerHTML = `<span class="cb-icon">⏳</span><span class="cb-text"><b>${t('The Cinderpeak Colossus wakes at 08:00')}</b><small>${t('in {time}', { time: clockText(left) })}</small></span>`;
    else if (mode === 'awake') this.banner.innerHTML = `<span class="cb-icon">🌋</span><span class="cb-text"><b>${t(COLOSSUS_NAME)}</b><small>${t('Redrock Canyon · until 24:00')} · ${clockText(left)}</small><span class="boss-meter cb-meter"><i style="width:${(hp * 100).toFixed(1)}%"></i></span></span><span class="cb-pct">${Math.ceil(hp * 100)}%</span>`;
    else if (mode === 'done') this.banner.innerHTML = `<span class="cb-icon">🏆</span><span class="cb-text"><b>${t(COLOSSUS_NAME)}</b><small>${t('Defeated today · back tomorrow at 08:00')}</small></span>`;
  }
}
