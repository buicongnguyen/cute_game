/**
 * The Delvers' Vault rules, pure and shared: the daily run counter and stage rewards run through actions.ts, so online the
 * server applies them with its own clock and dice (server-validated); the lobby countdown, stage flow, party fill and
 * scaling are used by dungeon.ts (and the lobby countdown by server/dungeon-lobby.mjs).
 *
 * Reference behaviour (the co-op dungeon config {need:5, perDay:2, countdown:10, timeLimit:1800, arenaR:23}): 2 runs a
 * day, a 10 s countdown in the lobby circle, 30 minutes, a round arena of radius 23; per stage the creatures, then the
 * boss, then a portal that takes everyone on after 8 s; 25 s after the last stage everyone goes home. Our version also
 * plays solo: AI neighbours fill the party offline.
 */
import * as Game from './model.ts';
import { DUNGEON_BOSSES, DUNGEON_STAGES, DUNGEON_ENEMIES, DUNGEON_SEAL, DUNGEON_CHEST } from './dungeon-content.ts';
import type { DungeonSave } from './dungeon-save.ts';
import type { EnemyDefinition } from './enemy-types.ts';

export const DUNGEON = {
  perDay: 2, countdown: 10, timeLimit: 1800, arenaR: 23, maxParty: 5,
  /** Players needed in the circle before the countdown starts (the reference needs 5 online; neighbours fill ours). */
  need: 1,
  portalAuto: 8, returnDelay: 25, introTime: 2.5,
  /** A stage cannot be claimed sooner than this after the last one (no instant clears). */
  minStageMs: 15_000,
  lobby: { x: 11, z: 27.5, r: 4.2 }, keeper: { x: 5.8, z: 22.8 },
  /** Where the arena is built: far out in the swamp corner of the home map, out of view of the village. */
  arena: { x: -60, z: -100 },
  /** Walking further than this from the circle leaves the queue (the reference: 30 m). */
  leaveQueue: 30,
  /** Zone difficulty 5 multiplier (jf[5]). */
  difficulty: 4.8,
} as const;
export const STAGE_COUNT = DUNGEON_STAGES.length;

/** The vault's day turns at midnight in Vietnam (UTC+7), like the colossus schedule. */
export const dayKey = (now: number) => new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
export function runsLeft(s: { dungeon?: DungeonSave }, now: number) {
  const d = s.dungeon; return Math.max(0, DUNGEON.perDay - (d && d.day === dayKey(now) ? d.runs : 0));
}
export const inLobby = (p: { x: number; z: number }) => Math.hypot(p.x - DUNGEON.lobby.x, p.z - DUNGEON.lobby.z) <= DUNGEON.lobby.r;

/** Starts a run (one of today's two). False when none is left or the explorer is not at home. */
export function startRun(s: Game.SaveState, id: string, now: number, party = 1): { left: number } | false {
  if (s.dungeon?.run?.id === id) return { left: runsLeft(s, now) }; // the same run asked twice (a retried request) counts once
  if (s.planet !== 'home' || !/^[\w-]{4,64}$/.test(id) || !Number.isInteger(party) || party < 1 || party > DUNGEON.maxParty || runsLeft(s, now) <= 0) return false;
  const day = dayKey(now), d = s.dungeon ?? { day, runs: 0, clears: 0 };
  if (d.day !== day) { d.day = day; d.runs = 0; }
  d.runs++; d.run = { id, stage: 0, startedAt: now, lastAt: now, party }; s.dungeon = d;
  return { left: runsLeft(s, now) };
}
export function leaveRun(s: Game.SaveState) { if (!s.dungeon?.run) return false; delete s.dungeon.run; return true; }

export interface StageLoot { stage: number; items: Array<{ id: string; count: number }>; xp: number; pet?: string; chest: boolean; cleared: boolean }
/** One stage's rewards. Pet 25% (luck never raises it), seals always, the chest 50% on the last guardian; creatures add seals at 35% each. */
export function rollStageLoot(stage: number, random: () => number): StageLoot {
  const st = DUNGEON_STAGES[stage], b = DUNGEON_BOSSES[st.boss], roll = () => { const r = random(); return Number.isFinite(r) ? Math.min(.999999, Math.max(0, r)) : .5; };
  const items: StageLoot['items'] = [], add = (id: string, count: number) => { if (count > 0) { const have = items.find(i => i.id === id); if (have) have.count += count; else items.push({ id, count }); } };
  const pet = roll() < .25 ? b.pet : undefined; if (pet) add(pet, 1);
  const [lo, hi] = st.seals; add(DUNGEON_SEAL, lo + Math.floor(roll() * (hi - lo + 1)));
  let mobSeals = 0; for (const [, count] of st.mobs) for (let i = 0; i < count; i++) if (roll() < .35) mobSeals += stage === STAGE_COUNT - 1 && roll() < .5 ? 2 : 1;
  add(DUNGEON_SEAL, mobSeals);
  const chest = stage === STAGE_COUNT - 1 && roll() < .5; if (chest) add(DUNGEON_CHEST, 1);
  const mobXp = st.mobs.reduce((sum, [type, count]) => sum + scaled(DUNGEON_ENEMIES[type], false, 1).xp * count, 0);
  return { stage, items, xp: mobXp + scaled(DUNGEON_ENEMIES[st.boss], true, 1).xp, ...(pet ? { pet } : {}), chest, cleared: stage === STAGE_COUNT - 1 };
}
/**
 * Claims the rewards of the stage just cleared. Stages are claimed in order, no sooner than DUNGEON.minStageMs after the
 * previous claim, within the time limit (plus a minute's grace for the trip home). The last claim counts a clear.
 */
export function claimStage(s: Game.SaveState, id: string, stage: number, now: number, random: () => number): StageLoot | false {
  const run = s.dungeon?.run;
  if (!run || run.id !== id || !Number.isInteger(stage) || stage !== run.stage || stage < 0 || stage >= STAGE_COUNT) return false;
  if (now - run.lastAt < DUNGEON.minStageMs || now - run.startedAt > DUNGEON.timeLimit * 1000 + 60_000) return false;
  const loot = rollStageLoot(stage, random);
  for (const item of loot.items) Game.addItem(s, item.id, item.count); // a full bag keeps what fits, like other rewards
  Game.gainXp(s, loot.xp, now);
  const st = DUNGEON_STAGES[stage]; Game.recordEvent(s, 'kill', st.mobs.reduce((n, [, c]) => n + c, 0) + 1, st.boss, now); Game.recordEvent(s, 'boss', 1, st.boss, now);
  run.stage++; run.lastAt = now;
  if (loot.cleared) { s.dungeon!.clears++; delete s.dungeon!.run; }
  return loot;
}

/** Creature numbers inside the vault: zone difficulty 5, bosses x1.4 HP and x1.35 attack, then the party size (humans). */
export function scaled(def: EnemyDefinition, boss: boolean, players: number) {
  const n = Math.max(1, Math.min(DUNGEON.maxParty, Math.floor(players) || 1)), k = DUNGEON.difficulty;
  return {
    hp: Math.round(def.hp * k * (boss ? 1.4 : 1) * (1 + (boss ? .35 : .2) * (n - 1))),
    damage: def.damage * k * (boss ? 1.35 : 1) * (1 + .05 * (n - 1)),
    xp: Math.round(def.xp * (.6 + .4 * k)),
    level: 5 * 3 - 2 + (boss ? 6 : 0),
  };
}
/**
 * Seconds until a guardian's next skill. The reference casts on every 2nd attack, on 2 of 3 below half health and on
 * every attack once enraged (below 30%), and its attack cooldown shrinks x0.7 below half and x0.6 enraged.
 */
export function skillDelay(atkCd: number, hpFraction: number, enraged: boolean) {
  const half = hpFraction < .5, cd = atkCd * (half ? .7 : 1) * (enraged ? .6 : 1) + .6, attacks = enraged ? 1 : half ? 1.5 : 2;
  return Math.round(cd * attacks * 100) / 100;
}

/** The 10 s lobby countdown. It runs while at least `need` explorers stand in the circle and resets when they leave. */
export class LobbyCountdown {
  remaining: number | null = null; order: string[] = []; need: number; length: number; max: number;
  constructor(need: number = DUNGEON.need, length: number = DUNGEON.countdown, max: number = DUNGEON.maxParty) { this.need = need; this.length = length; this.max = max; }
  /** Advance by dt with who stands in the circle now; returns the party (arrival order, at most max) when it reaches 0. */
  step(dt: number, inCircle: readonly string[]): string[] | null {
    this.order = [...this.order.filter(id => inCircle.includes(id)), ...inCircle.filter(id => !this.order.includes(id))];
    if (this.order.length < this.need) { this.remaining = null; return null; }
    this.remaining = (this.remaining ?? this.length) - Math.max(0, dt);
    if (this.remaining > 0) return null;
    const party = this.order.slice(0, this.max); this.remaining = null; this.order = this.order.filter(id => !party.includes(id));
    return party;
  }
  get seconds() { return this.remaining === null ? null : Math.max(0, Math.ceil(this.remaining)); }
}

export interface Neighbour { id: string; name: string; level: number }
/** Offline the AI neighbours make up the party: friends first (then the stronger ones), up to five with the explorer. */
export function fillParty<T extends Neighbour>(humans: number, cast: readonly T[], isFriend: (id: string) => boolean, max: number = DUNGEON.maxParty): T[] {
  const room = Math.max(0, max - Math.max(1, humans));
  return [...cast].sort((a, b) => Number(isFriend(b.id)) - Number(isFriend(a.id)) || b.level - a.level || a.id.localeCompare(b.id)).slice(0, room);
}

export type FlowPhase = 'intro' | 'mobs' | 'boss' | 'portal' | 'done' | 'over';
export type FlowEvent = { kind: 'spawnMobs'; stage: number } | { kind: 'spawnBoss'; stage: number } | { kind: 'portal'; stage: number } | { kind: 'next'; stage: number } | { kind: 'done' } | { kind: 'home'; reason: 'clear' | 'time' };
/**
 * One run's stage flow: intro, creatures, guardian, portal (auto after 8 s, or step in), … and after the last guardian
 * 25 s, then home. The 30-minute limit ends the run wherever it is.
 */
export class DungeonFlow {
  stage = 0; phase: FlowPhase = 'intro'; timer: number = DUNGEON.introTime; elapsed = 0;
  step(dt: number, alive: { mobs: number; boss: boolean }): FlowEvent[] {
    const out: FlowEvent[] = []; if (this.phase === 'over' || !(dt >= 0)) return out;
    this.elapsed += dt;
    if (this.elapsed > DUNGEON.timeLimit) { this.phase = 'over'; out.push({ kind: 'home', reason: 'time' }); return out; }
    if (this.phase === 'intro') { this.timer -= dt; if (this.timer <= 0) { this.phase = 'mobs'; out.push({ kind: 'spawnMobs', stage: this.stage }); } }
    else if (this.phase === 'mobs') { if (alive.mobs <= 0) { this.phase = 'boss'; out.push({ kind: 'spawnBoss', stage: this.stage }); this.timer = 1; } }
    else if (this.phase === 'boss') { this.timer -= dt; if (this.timer <= 0 && !alive.boss) { if (this.stage >= STAGE_COUNT - 1) { this.phase = 'done'; this.timer = DUNGEON.returnDelay; out.push({ kind: 'done' }); } else { this.phase = 'portal'; this.timer = DUNGEON.portalAuto; out.push({ kind: 'portal', stage: this.stage }); } } }
    else if (this.phase === 'portal') { this.timer -= dt; if (this.timer <= 0) out.push(...this.enterPortal()); }
    else if (this.phase === 'done') { this.timer -= dt; if (this.timer <= 0) { this.phase = 'over'; out.push({ kind: 'home', reason: 'clear' }); } }
    return out;
  }
  /** Stepping into the open portal: on to the next stage at once. */
  enterPortal(): FlowEvent[] {
    if (this.phase !== 'portal') return [];
    this.stage++; this.phase = 'intro'; this.timer = DUNGEON.introTime; return [{ kind: 'next', stage: this.stage }];
  }
  get timeLeft() { return Math.max(0, DUNGEON.timeLimit - this.elapsed); }
}
