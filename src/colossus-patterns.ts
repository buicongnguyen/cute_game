// The Colossus's attacks as pure, fixed-step data: the browser (offline) and the server (online) run the same code,
// and every browser draws the same telegraphs from it. No three.js, no DOM, no clock.
import { COLOSSUS_STATS as S } from './colossus-content.ts';

export type ColossusSkill = 'stomp' | 'bite' | 'slap' | 'breath' | 'grab' | 'spit' | 'sweep' | 'meteor' | 'roar';
/** Round-robin order; the Colossus casts a skill on every attack. */
export const COLOSSUS_ORDER: readonly ColossusSkill[] = ['stomp', 'bite', 'slap', 'breath', 'grab', 'spit', 'sweep', 'meteor', 'stomp', 'roar'];
/** Wind-up seconds before the blow lands (×0.8 once enraged). */
export const COLOSSUS_WINDUPS: Record<ColossusSkill, number> = { stomp: 1.7, bite: 1.6, slap: 1.5, breath: 1.9, grab: 1.4, spit: 1.8, sweep: 1.8, meteor: 1.6, roar: 2.2 };
/** How long each attack keeps acting after its wind-up (lava footprints, the fire stream, the falling meteors…). */
export const COLOSSUS_ACTIVE: Record<ColossusSkill, number> = { stomp: 8, bite: .35, slap: .35, breath: 2.4, grab: .35, spit: 1, sweep: 1, meteor: 18 * .4 / 4 + 1.2, roar: .5 };
export const COLOSSUS_COLORS: Record<ColossusSkill, string> = { stomp: '#ff6a2b', bite: '#ff3b3b', slap: '#ffb13d', breath: '#ff8a1f', grab: '#c46aff', spit: '#ffe14d', sweep: '#ff3bd0', meteor: '#ff4040', roar: '#ffef8a' };
export const COLOSSUS_CALLOUTS: Record<ColossusSkill, string> = {
  stomp: '⚠️ ARMOUR-CRACKING STOMP', bite: '⚠️ HEAD-DIVE BITE', slap: '⚠️ BOULDER SLAP', breath: '⚠️ CINDER BREATH', grab: '⚠️ GRAB AND HURL',
  spit: '⚠️ IT SPITS OUT A MINION', sweep: '⚠️ GROUND-SWEEPING ARM', meteor: '⚠️ ASH METEOR SHOWER', roar: '⚠️ QUAKE ROAR — HIDE BY A FOOT!',
};
export const isColossusSkill = (v: unknown): v is ColossusSkill => typeof v === 'string' && Object.hasOwn(COLOSSUS_WINDUPS, v);
/** The Colossus reaches this far with a hand or foot: blows aimed farther land at this distance toward the target. */
export const COLOSSUS_REACH = 16, STOMP_STEP = 9;
const SWEEP_LENGTH = 26.5, SWEEP_WIDTH = 3.2, SWEEP_ARC = 2.4, BREATH_LENGTH = 30, BREATH_WIDTH = 5, BREATH_TICK = .35;
const METEOR_RANDOM = 18, METEOR_STEP = .4, METEOR_R = 3.2, METEOR_SIGHT = 70;

export interface ColossusPoint { x: number; z: number }
export interface ColossusSource extends ColossusPoint { facing: number }
export interface ColossusTarget extends ColossusPoint { id: string }
export interface ColossusMark extends ColossusPoint { r: number; k?: number }
export type ColossusEffect = 'crack' | 'burn' | 'grab' | 'stun';
export interface ColossusHit { id: string; multiplier: number; effect?: ColossusEffect }
export interface ColossusAttack {
  skill: ColossusSkill; age: number; windup: number; life: number; source: ColossusSource;
  /** Where the blow lands (stomp, bite, slap, grab), the meteors, or the line's far end (breath). */
  marks: ColossusMark[]; aim: number; fired: number[]; nextHit: Record<string, number>; done: boolean;
}
export interface ColossusStep { hits: ColossusHit[]; bursts: ColossusMark[]; summon: boolean; landed: boolean; done: boolean }

const dist = (a: ColossusPoint, b: ColossusPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const round = (v: number) => Math.round(v * 100) / 100;
/** Forward is (sin f, cos f), as for every model in the game; right is (cos f, −sin f). */
export const forwardOf = (f: number) => ({ x: Math.sin(f), z: Math.cos(f) });
/** The two feet, 8.5 m left and right of the body. */
export function colossusFeet(source: ColossusSource): [ColossusPoint, ColossusPoint] {
  const rx = Math.cos(source.facing), rz = -Math.sin(source.facing), o = S.footOffset;
  return [{ x: source.x + rx * o, z: source.z + rz * o }, { x: source.x - rx * o, z: source.z - rz * o }];
}
/** A point toward `target`, no farther than `reach` from the body. */
function within(source: ColossusPoint, target: ColossusPoint, reach: number) {
  const d = dist(source, target); if (d <= reach) return { x: target.x, z: target.z };
  return { x: source.x + (target.x - source.x) / d * reach, z: source.z + (target.z - source.z) / d * reach };
}
/** Health share → attack cadence: cooldown ×0.7 below 50%, ×0.6 more once enraged (below 30%), wind-ups ×0.8 enraged. */
export function colossusCadence(hpShare: number) {
  const enraged = hpShare < S.enrageAt;
  return { cooldown: S.cooldown * (hpShare < S.fasterAt ? .7 : 1) * (enraged ? .6 : 1), windupScale: enraged ? .8 : 1, enraged, kneeling: hpShare < S.kneelAt };
}
export const colossusSkill = (count: number) => COLOSSUS_ORDER[((Math.floor(count) % COLOSSUS_ORDER.length) + COLOSSUS_ORDER.length) % COLOSSUS_ORDER.length];

/** Marks are rolled once by whoever runs the fight (browser offline, server online) and shipped to everyone. */
export function colossusTelegraphs(skill: ColossusSkill, source: ColossusSource, target: ColossusPoint, targets: ColossusTarget[] = [], random: () => number = Math.random): ColossusMark[] {
  const marks: ColossusMark[] = [], add = (p: ColossusPoint, r: number, k?: number) => marks.push({ x: round(p.x), z: round(p.z), r, ...(k === undefined ? {} : { k }) });
  // The foot nearer the target steps up to 9 m toward it (k: 0 the left foot, 1 the right).
  if (skill === 'stomp') { const feet = colossusFeet(source), k = dist(feet[0], target) <= dist(feet[1], target) ? 0 : 1; add(within(feet[k], target, STOMP_STEP), 7, k); }
  if (skill === 'bite') add(within(source, target, 13), 5.5);
  if (skill === 'slap') add(within(source, target, COLOSSUS_REACH), 6.5);
  if (skill === 'grab') add(within(source, target, COLOSSUS_REACH), 3.6);
  if (skill === 'spit') add(within(source, target, 12), 3);
  if (skill === 'breath') { const a = Math.atan2(target.x - source.x, target.z - source.z), f = forwardOf(a); add({ x: source.x + f.x * BREATH_LENGTH, z: source.z + f.z * BREATH_LENGTH }, BREATH_WIDTH / 2); }
  if (skill === 'sweep') { const a = Math.atan2(target.x - source.x, target.z - source.z), f = forwardOf(a - SWEEP_ARC / 2); add({ x: source.x + f.x * SWEEP_LENGTH, z: source.z + f.z * SWEEP_LENGTH }, SWEEP_WIDTH / 2); }
  if (skill === 'roar') add(source, S.roarRange);
  if (skill === 'meteor') {
    let k = 0;
    for (const p of targets) if (dist(p, source) < METEOR_SIGHT) add(p, METEOR_R, k++ % 4);
    for (let i = 0; i < METEOR_RANDOM; i++) { const a = random() * Math.PI * 2, r = 10 + random() * 26; add({ x: source.x + Math.sin(a) * r, z: source.z + Math.cos(a) * r }, METEOR_R, (k++) % 4); }
  }
  return marks;
}
export function beginColossusAttack(skill: ColossusSkill, source: ColossusSource, marks: ColossusMark[], windupScale = 1): ColossusAttack {
  const first = marks[0] ?? source, aim = Math.atan2(first.x - source.x, first.z - source.z);
  return { skill, age: 0, windup: COLOSSUS_WINDUPS[skill] * windupScale, life: COLOSSUS_ACTIVE[skill], source: { ...source }, marks: marks.map(m => ({ ...m })), aim: skill === 'roar' ? source.facing : aim, fired: [], nextHit: {}, done: false };
}
/** Where the breath and sweep reach at attack age `t`: a band from the body, `angle` its direction now. */
export function sweepAngle(a: ColossusAttack, age = a.age) { return a.aim + Math.min(1, Math.max(0, (age - a.windup) / COLOSSUS_ACTIVE.sweep)) * SWEEP_ARC; }
/** Distance from p to the segment a→b. */
function toSegment(p: ColossusPoint, a: ColossusPoint, b: ColossusPoint) {
  const x = b.x - a.x, z = b.z - a.z, l = x * x + z * z, f = l ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / l)) : 0;
  return Math.hypot(p.x - a.x - x * f, p.z - a.z - z * f);
}
/** One fixed step. Hits are multipliers of the Colossus's attack; the caller turns them into damage (colossusDamage). */
export function stepColossusAttack(a: ColossusAttack, dt: number, targets: ColossusTarget[]): ColossusStep {
  const out: ColossusStep = { hits: [], bursts: [], summon: false, landed: false, done: a.done };
  if (a.done || !(dt > 0) || !Number.isFinite(dt)) return out;
  const before = a.age; a.age = Math.min(a.windup + a.life, a.age + dt);
  const t = a.age - a.windup; if (t < 0) return out;
  if (before < a.windup) out.landed = true;
  const hit = (p: ColossusTarget, multiplier: number, effect?: ColossusEffect, key = '', period = 0) => {
    if (period) { const k = key + ':' + p.id; if ((a.nextHit[k] ?? -1) > t) return; a.nextHit[k] = t + period; }
    out.hits.push({ id: p.id, multiplier, ...(effect ? { effect } : {}) });
  };
  const once = (index: number, time: number, fn: () => void) => { if (!a.fired.includes(index) && t >= time) { a.fired.push(index); fn(); } };
  const m = a.marks[0], src = a.source;
  if (a.skill === 'stomp' && m) {
    once(0, 0, () => { out.bursts.push(m, { x: m.x, z: m.z, r: 15 }); for (const p of targets) { const d = dist(p, m); if (d < 7) hit(p, 2, 'crack'); else if (d < 15) hit(p, .6); } });
    // The foot leaves a lava footprint that burns for eight seconds.
    if (t > .1) for (const p of targets) if (dist(p, m) < 4) hit(p, .12, undefined, 'lava', .5);
  }
  if ((a.skill === 'bite' || a.skill === 'slap') && m) once(0, 0, () => { out.bursts.push(m); for (const p of targets) if (dist(p, m) < m.r) hit(p, a.skill === 'bite' ? 1.8 : 1.5); });
  if (a.skill === 'grab' && m) once(0, 0, () => { out.bursts.push(m); const caught = targets.filter(p => dist(p, m) < m.r).sort((p, q) => dist(p, m) - dist(q, m))[0]; if (caught) hit(caught, 1, 'grab'); });
  if (a.skill === 'spit' && m) once(0, .9, () => { out.summon = true; out.bursts.push(m); });
  if (a.skill === 'breath' && m) for (const p of targets) if (t <= COLOSSUS_ACTIVE.breath && toSegment(p, src, m) < BREATH_WIDTH / 2 && dist(p, src) > 2) hit(p, .55, 'burn', 'breath', BREATH_TICK);
  if (a.skill === 'sweep' && t <= COLOSSUS_ACTIVE.sweep) {
    const f = forwardOf(sweepAngle(a)), end = { x: src.x + f.x * SWEEP_LENGTH, z: src.z + f.z * SWEEP_LENGTH };
    for (const p of targets) if (toSegment(p, src, end) < SWEEP_WIDTH / 2 + .4 && !a.nextHit['sweep:' + p.id]) { a.nextHit['sweep:' + p.id] = 1; hit(p, 1.3); }
  }
  if (a.skill === 'meteor') a.marks.forEach((p, i) => once(i, (p.k ?? 0) * METEOR_STEP + i * .02, () => { out.bursts.push(p); for (const q of targets) if (dist(q, p) < p.r) hit(q, 1.15); }));
  if (a.skill === 'roar') once(0, 0, () => { out.bursts.push({ x: src.x, z: src.z, r: S.roarRange }); const feet = colossusFeet(src); for (const p of targets) if (dist(p, src) < S.roarRange) hit(p, .6, feet.some(f => dist(f, p) < S.footSafe) ? undefined : 'stun'); });
  if (a.age >= a.windup + a.life) a.done = true;
  out.done = a.done; return out;
}
/** True while the head is down near the ground: bite, breath and spit bring it low, and it stays low while kneeling. */
export function headLowered(a: ColossusAttack | null | undefined, kneeling: boolean) {
  if (kneeling) return true;
  if (!a || a.done) return false;
  if (a.skill !== 'bite' && a.skill !== 'breath' && a.skill !== 'spit') return false;
  return a.age > a.windup * .45 && a.age < a.windup + Math.min(a.life, a.skill === 'breath' ? COLOSSUS_ACTIVE.breath : .9) + .6;
}
/** Where the lowered head is, on the ground plane: in front of the body toward the attack (or straight ahead kneeling). */
export function headPoint(source: ColossusSource, a: ColossusAttack | null | undefined, kneeling: boolean): ColossusPoint {
  const lowered = a && !a.done && (a.skill === 'bite' || a.skill === 'breath' || a.skill === 'spit'), f = forwardOf(lowered ? a.aim : source.facing), reach = lowered ? 9 : kneeling ? 7 : 2;
  return { x: source.x + f.x * reach, z: source.z + f.z * reach };
}
/** ×2.5 within 10 m of the lowered head, else ×1. */
export function headMultiplier(attacker: ColossusPoint, source: ColossusSource, a: ColossusAttack | null | undefined, kneeling: boolean) {
  return headLowered(a, kneeling) && dist(attacker, headPoint(source, a, kneeling)) <= S.headReach ? S.headMultiplier : 1;
}
/**
 * Damage to an explorer: the attack × multiplier through only a quarter of their defence (75% pierce), halved again
 * by a cracked armour and by scorching (each ×0.5), with the game's usual ±10% roll. Never below 1.
 */
export function colossusDamage(atk: number, multiplier: number, defence: number, defenceFactor = 1, roll = 1) {
  const def = Math.max(0, defence) * defenceFactor * (1 - S.pierce);
  return Math.max(1, Math.round(atk * multiplier * roll * 60 / (def + 60)));
}
/** The input for the game's own hurt rule (amount × 60 / (defence + 60)) that comes out as `damage`. */
export const throughDefence = (damage: number, defence: number) => damage * (Math.max(0, defence) + 60) / 60;

/** Accept only bounded attack state from the server; it is drawn, never used for damage. */
export function sanitizeColossusAttack(value: unknown): ColossusAttack | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>, n = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  const src = v.source as Record<string, unknown> | undefined;
  if (!isColossusSkill(v.skill) || !n(v.age, 0, 30) || !n(v.windup, 0, 5) || !n(v.life, 0, 20) || !n(v.aim, -100, 100) || !src || !n(src.x, -160, 160) || !n(src.z, -160, 160) || !n(src.facing, -100, 100) || !Array.isArray(v.marks)) return null;
  const marks: ColossusMark[] = [];
  for (const raw of v.marks.slice(0, 40)) { const m = raw as Record<string, unknown>; if (m && n(m.x, -200, 200) && n(m.z, -200, 200) && n(m.r, 0, 80)) marks.push({ x: m.x as number, z: m.z as number, r: m.r as number, ...(n(m.k, 0, 64) ? { k: Math.floor(m.k as number) } : {}) }); }
  const fired = Array.isArray(v.fired) ? v.fired.filter((x): x is number => n(x, 0, 64) && Number.isInteger(x)).slice(0, 41) : [];
  return { skill: v.skill, age: v.age as number, windup: v.windup as number, life: v.life as number, aim: v.aim as number, source: { x: src.x as number, z: src.z as number, facing: src.facing as number }, marks, fired, nextHit: {}, done: v.done === true };
}
