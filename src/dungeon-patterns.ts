/**
 * The vault guardians' skills, pure: where each one strikes (its telegraph marks), when, and whom it hits. dungeon.ts
 * runs them on the boss (the world's creature AI keeps the walking and plain blows) and dungeon-view.ts draws the marks.
 *
 * Kinds and timings follow the reference's twenty dungeon boss skills (lingering trails, spike rings, rolls, beams,
 * echoing rings, binds, sky drops, a get-out nova, homing orbs, sweeps, dashes, crosses, a cage, rotating lances, a
 * spread-out mark and a hide-in-the-light wipe); the shapes, names and numbers here are our own.
 */
import type { DungeonSkill, PetSkill } from './dungeon-content.ts';
import { PET_SKILLS } from './dungeon-content.ts';

export interface DgPoint { x: number; z: number }
export interface DgSource extends DgPoint { radius: number; facing: number }
export interface DgTarget extends DgPoint { id: string }
export type DgShape = 'circle' | 'ring' | 'line' | 'cone' | 'safe';
/** One danger shape. `at`: seconds after the cast starts when it strikes (the telegraph fills until then). */
export interface DgMark extends DgPoint { shape: DgShape; r: number; inner?: number; angle?: number; len?: number; width?: number; arc?: number; at: number }
export interface DgOrb extends DgPoint { vx: number; vz: number; targetId?: string; done: boolean }
export interface DgAttack {
  skill: DungeonSkill; age: number; windup: number; life: number; origin: DgPoint; facing: number; radius: number;
  marks: DgMark[]; fired: number[]; nextHit: Record<string, number>; orbs: DgOrb[];
  /** A roll or dash: the boss slides from origin to `to` between `start` and `end` (seconds). */
  dash?: { to: DgPoint; start: number; end: number };
}
export interface DgHit { id: string; mult: number; source: 'melee' | 'shot' | 'hazard'; slow?: number; root?: number }
export interface DgStep { hits: DgHit[]; bursts: DgMark[]; move?: DgPoint; done: boolean }

export const SKILL_WINDUPS: Record<DungeonSkill, number> = {
  spore_trail: 1, cap_spikes: 1.3, cap_roll: 1.1, glow_beams: 1,
  toll_echo: 1.2, hush_bind: 2, feather_rain: 1.2, great_chime: 1.5,
  bubble_orbs: 1, polyp_bloom: 1.4, tentacle_sweep: 1.3, riptide_dash: 1,
  hammer_cross: 1.1, anvil_drop: .9, spark_flurry: .8, chain_cage: 1.6,
  prism_lances: 1.5, scatter_dust: 2.2, eclipse_wing: 2.4, starfall: 1,
};
/** Damage multipliers (x the guardian's attack). */
export const SKILL_MULT: Record<DungeonSkill, number> = {
  spore_trail: .25, cap_spikes: 1.15, cap_roll: 1.5, glow_beams: 1,
  toll_echo: .45, hush_bind: 1.2, feather_rain: .95, great_chime: 1.8,
  bubble_orbs: .85, polyp_bloom: 1.3, tentacle_sweep: 1.1, riptide_dash: .3,
  hammer_cross: 1.4, anvil_drop: 2, spark_flurry: .85, chain_cage: 1.7,
  prism_lances: .5, scatter_dust: .9, eclipse_wing: 2.3, starfall: 1.1,
};
const TAU = Math.PI * 2, HIT_RADIUS = .4;
const dist = (a: DgPoint, b: DgPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const r2 = (v: number) => Math.round(v * 100) / 100;
const toward = (from: DgPoint, to: DgPoint, fallback: number) => { const dx = to.x - from.x, dz = to.z - from.z; return Math.hypot(dx, dz) > .01 ? Math.atan2(dx, dz) : fallback; };

/** Is the point inside the mark? Lines and cones start at the mark's x/z and run along `angle` (sin, cos). */
export function inMark(m: DgMark, p: DgPoint, pad = HIT_RADIUS): boolean {
  const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
  if (m.shape === 'circle' || m.shape === 'safe') return d < m.r + pad;
  if (m.shape === 'ring') return d < m.r + pad && d > (m.inner ?? 0) - pad;
  const a = m.angle ?? 0, ux = Math.sin(a), uz = Math.cos(a);
  if (m.shape === 'line') { const t = dx * ux + dz * uz, side = Math.abs(dx * uz - dz * ux); return t > -pad && t < (m.len ?? m.r) + pad && side < (m.width ?? 1) / 2 + pad; }
  return d < (m.len ?? m.r) + pad && (d < pad || Math.abs(wrap(Math.atan2(dx, dz) - a)) < (m.arc ?? 1) / 2);
}

/**
 * Plans a cast: the marks are made once (the host's dice) and travel with the attack, so a peer draws and dodges the
 * same shapes. `arena` bounds the arena-wide skills.
 */
export function beginSkill(skill: DungeonSkill, source: DgSource, target: DgPoint, targets: readonly DgTarget[], random: () => number, arena: DgPoint & { r: number }): DgAttack {
  const W = SKILL_WINDUPS[skill], marks: DgMark[] = [], near = targets.filter(p => dist(p, source) < 34), rnd = () => { const v = random(); return Number.isFinite(v) ? Math.min(.999999, Math.max(0, v)) : .5; };
  const aim = toward(source, target, source.facing);
  const add = (m: Omit<DgMark, 'at'> & { at?: number }) => { marks.push({ ...m, x: r2(m.x), z: r2(m.z), at: m.at ?? W }); };
  const inArena = (p: DgPoint, margin = 1.5) => { const d = dist(p, arena), lim = arena.r - margin; return d <= lim ? p : { x: arena.x + (p.x - arena.x) / d * lim, z: arena.z + (p.z - arena.z) / d * lim }; };
  const around = (c: DgPoint, spread: number) => { const a = rnd() * TAU, d = Math.sqrt(rnd()) * spread; return inArena({ x: c.x + Math.sin(a) * d, z: c.z + Math.cos(a) * d }); };
  let life = W + .1, dash: DgAttack['dash'];
  switch (skill) {
    case 'spore_trail': { // a lingering trail of spores from the guardian to each explorer, and a few loose patches
      for (const p of near.length ? near : [{ ...target, id: '' }]) for (let k = 1; k <= 3; k++) { const f = k / 3; add({ shape: 'circle', x: source.x + (p.x - source.x) * f, z: source.z + (p.z - source.z) * f, r: 1.9 }); }
      for (let i = 0; i < 3; i++) { const p = around(source, 9); add({ shape: 'circle', ...p, r: 1.9 }); }
      life = W + 8; break;
    }
    case 'cap_spikes': for (let i = 0; i < 10; i++) { const a = source.facing + i * TAU / 10; add({ shape: 'circle', x: source.x + Math.sin(a) * (source.radius + 2.6), z: source.z + Math.cos(a) * (source.radius + 2.6), r: 1.7 }); }
      for (const p of near) add({ shape: 'circle', x: p.x, z: p.z, r: 1.7, at: W + .25 }); life = W + .4; break;
    case 'cap_roll': { const len = 14, to = inArena({ x: source.x + Math.sin(aim) * len, z: source.z + Math.cos(aim) * len }), real = dist(source, to);
      add({ shape: 'line', x: source.x, z: source.z, angle: aim, len: real, width: 2 * source.radius + .6, r: real }); dash = { to, start: W, end: W + .7 }; life = W + .75; break; }
    case 'glow_beams': for (const off of [-.5, 0, .5]) add({ shape: 'line', x: source.x, z: source.z, angle: aim + off, len: 16, width: 1.6, r: 16 }); life = W + .2; break;
    case 'toll_echo': [3, 6, 9, 12].forEach((r, i) => add({ shape: 'ring', x: source.x, z: source.z, r: r + .4, inner: r - 2.2, at: W + i * .3 })); life = W + 1.1; break;
    case 'hush_bind': for (const p of near.length ? near : [{ ...target, id: '' }]) add({ shape: 'circle', x: p.x, z: p.z, r: 2.6 }); break;
    case 'feather_rain': for (const p of near.length ? near : [{ ...target, id: '' }]) for (let i = 0; i < 6; i++) add({ shape: 'circle', ...around(p, 4), r: 1.6, at: W + i * .14 }); life = W + .9; break;
    case 'great_chime': add({ shape: 'circle', x: source.x, z: source.z, r: 6.5 }); break;
    case 'bubble_orbs': add({ shape: 'circle', x: source.x, z: source.z, r: source.radius + 1 }); life = W + 3.2; break;
    case 'polyp_bloom': add({ shape: 'circle', x: target.x, z: target.z, r: 4.6 }); for (let i = 0; i < 2; i++) add({ shape: 'circle', ...around(target, 9), r: 4.6 }); break;
    case 'tentacle_sweep': add({ shape: 'cone', x: source.x, z: source.z, angle: aim, arc: 2.1, len: 8.5, r: 8.5 }); add({ shape: 'cone', x: source.x, z: source.z, angle: aim + Math.PI, arc: 2.1, len: 8.5, r: 8.5, at: W + .55 }); life = W + .65; break;
    case 'riptide_dash': { const to = inArena({ x: source.x + Math.sin(aim) * 13, z: source.z + Math.cos(aim) * 13 }), real = dist(source, to);
      add({ shape: 'line', x: source.x, z: source.z, angle: aim, len: real, width: 2 * source.radius + .4, r: real });
      for (let k = 1; k <= 4; k++) { const f = k / 4; add({ shape: 'circle', x: source.x + (to.x - source.x) * f, z: source.z + (to.z - source.z) * f, r: 1.5, at: W + .6 }); }
      dash = { to, start: W, end: W + .6 }; life = W + .6 + 4; break; }
    case 'hammer_cross': for (const a of [aim, aim + Math.PI / 2, aim + Math.PI, aim - Math.PI / 2]) add({ shape: 'line', x: source.x, z: source.z, angle: a, len: 12, width: 2.2, r: 12 }); break;
    case 'anvil_drop': add({ shape: 'circle', x: target.x, z: target.z, r: 2.2 }); add({ shape: 'ring', x: target.x, z: target.z, r: 5, inner: 2.2 }); break;
    case 'spark_flurry': for (let i = 0; i < 3; i++) add({ shape: 'cone', x: source.x, z: source.z, angle: aim + (i - 1) * .35, arc: 1.2, len: 7, r: 7, at: W + i * .35 }); life = W + .8; break;
    case 'chain_cage': add({ shape: 'circle', x: target.x, z: target.z, r: 3.3 }); break;
    case 'prism_lances': for (let i = 0; i < 4; i++) add({ shape: 'line', x: source.x, z: source.z, angle: source.facing + i * TAU / 4, len: 18, width: 1.2, r: 18 }); life = W + 2; break;
    case 'scatter_dust': for (const p of near.length ? near : [{ ...target, id: '' }]) add({ shape: 'circle', x: p.x, z: p.z, r: 4.2 }); break;
    case 'eclipse_wing': {
      add({ shape: 'circle', x: arena.x, z: arena.z, r: arena.r + 2 });
      const base = rnd() * TAU; for (let i = 0; i < 3; i++) { const a = base + i * TAU / 3, d = 8 + rnd() * 7; add({ shape: 'safe', x: arena.x + Math.sin(a) * d, z: arena.z + Math.cos(a) * d, r: 3.1 }); }
      break;
    }
    case 'starfall': for (const p of near) add({ shape: 'circle', x: p.x, z: p.z, r: 1.8 }); for (let i = 0; i < 10; i++) add({ shape: 'circle', ...around(arena, arena.r - 2), r: 1.8, at: W + i * .1 }); life = W + 1.1; break;
  }
  const orbs: DgOrb[] = skill === 'bubble_orbs' ? Array.from({ length: 9 }, (_, i) => { const a = source.facing + i * TAU / 9; return { x: r2(source.x + Math.sin(a) * source.radius), z: r2(source.z + Math.cos(a) * source.radius), vx: r2(Math.sin(a) * 5), vz: r2(Math.cos(a) * 5), targetId: near.length ? near[i % near.length].id : undefined, done: false }; }) : [];
  return { skill, age: 0, windup: W, life, origin: { x: source.x, z: source.z }, facing: aim, radius: source.radius, marks, fired: [], nextHit: {}, orbs, ...(dash ? { dash } : {}) };
}

/** Advances a cast by dt. Hits name the explorer ids; the caller turns them into damage (x the guardian's attack). */
export function stepSkill(a: DgAttack, dt: number, source: DgPoint, targets: readonly DgTarget[]): DgStep {
  const out: DgStep = { hits: [], bursts: [], done: false };
  if (!(dt > 0) || !Number.isFinite(dt) || a.age >= a.life) { out.done = a.age >= a.life; return out; }
  const before = a.age; a.age = Math.min(a.life, a.age + dt);
  const mult = SKILL_MULT[a.skill];
  const hit = (id: string, m: number, source: DgHit['source'] = 'melee', extra: Partial<DgHit> = {}) => out.hits.push({ id, mult: m, source, ...extra });
  const tick = (key: string, period: number) => { if ((a.nextHit[key] ?? -1) > a.age) return false; a.nextHit[key] = a.age + period; return true; };
  const strike = (i: number, m: DgMark, fn: () => void) => { if (a.fired.includes(i) || a.age < m.at) return; a.fired.push(i); out.bursts.push(m); fn(); };
  const marks = a.marks;
  // Where a rolling or dashing guardian is now (its contact hits follow it, whatever the caller does with the move).
  const dashAt = (): DgPoint => { if (!a.dash || a.age < a.dash.start) return source; const f = Math.min(1, (a.age - a.dash.start) / Math.max(.01, a.dash.end - a.dash.start)); return { x: a.origin.x + (a.dash.to.x - a.origin.x) * f, z: a.origin.z + (a.dash.to.z - a.origin.z) * f }; };
  switch (a.skill) {
    case 'spore_trail': if (a.age >= a.windup) for (const t of targets) if (marks.some(m => inMark(m, t)) && tick('spore:' + t.id, .5)) hit(t.id, mult, 'hazard', { slow: 1.2 });
      if (before < a.windup && a.age >= a.windup) out.bursts.push(...marks); break;
    case 'bubble_orbs': if (a.age < a.windup) break;
      for (const orb of a.orbs) {
        if (orb.done) continue; const t = targets.find(p => p.id === orb.targetId) ?? targets[0];
        if (t) { const d = dist(orb, t); if (d < 1) { hit(t.id, mult, 'shot'); orb.done = true; out.bursts.push({ shape: 'circle', x: orb.x, z: orb.z, r: 1, at: a.age }); continue; }
          orb.vx += (t.x - orb.x) / d * 13 * dt; orb.vz += (t.z - orb.z) / d * 13 * dt; const sp = Math.hypot(orb.vx, orb.vz); if (sp > 7) { orb.vx *= 7 / sp; orb.vz *= 7 / sp; } }
        orb.x += orb.vx * dt; orb.z += orb.vz * dt;
      } break;
    case 'prism_lances': if (a.age < a.windup) break;
      for (let i = 0; i < marks.length; i++) { const m = marks[i], angle = (m.angle ?? 0) + (a.age - a.windup) * 1.2, beam = { ...m, x: source.x, z: source.z, angle };
        for (const t of targets) if (inMark(beam, t) && tick(`lance${i}:${t.id}`, .3)) hit(t.id, mult, 'shot'); } break;
    case 'riptide_dash': {
      const [line, ...trail] = marks;
      if (line) strike(0, line, () => { /* the dash itself is drawn by the boss sliding */ });
      if (a.dash && a.age >= a.dash.start && a.age <= a.dash.end + .05) { const at = dashAt(); for (const t of targets) if (dist(t, at) < a.radius + .9 && tick('dash:' + t.id, 9)) hit(t.id, .8); }
      if (a.age >= a.windup + .6) { trail.forEach((m, i) => { if (!a.fired.includes(i + 1)) { a.fired.push(i + 1); out.bursts.push(m); } }); for (const t of targets) if (trail.some(m => inMark(m, t)) && tick('tide:' + t.id, .5)) hit(t.id, mult, 'hazard'); }
      break;
    }
    case 'cap_roll': if (a.dash && a.age >= a.dash.start && a.age <= a.dash.end + .05) { if (!a.fired.includes(0)) { a.fired.push(0); out.bursts.push(marks[0]); } const at = dashAt(); for (const t of targets) if (dist(t, at) < a.radius + 1 && tick('roll:' + t.id, 9)) hit(t.id, mult); } break;
    case 'eclipse_wing': { const [wipe, ...safe] = marks; if (wipe) strike(0, wipe, () => { for (const t of targets) if (!safe.some(m => inMark(m, t, 0))) hit(t.id, mult, 'shot'); }); break; }
    case 'scatter_dust': marks.forEach((m, i) => strike(i, m, () => { for (const t of targets) if (inMark(m, t)) hit(t.id, mult, 'shot'); })); break;
    case 'anvil_drop': marks.forEach((m, i) => strike(i, m, () => { for (const t of targets) if (inMark(m, t)) hit(t.id, m.shape === 'ring' ? 1 : mult, 'shot'); })); break;
    default: {
      const status: Partial<DgHit> = a.skill === 'hush_bind' ? { root: 2.2 } : a.skill === 'chain_cage' ? { root: 1.5 } : a.skill === 'toll_echo' ? { slow: 1.5 } : {};
      const sky = a.skill === 'feather_rain' || a.skill === 'starfall' || a.skill === 'glow_beams';
      // One blow per explorer per cast for overlapping shapes struck at the same moment (spike rings, crosses, beams).
      marks.forEach((m, i) => strike(i, m, () => { for (const t of targets) if (inMark(m, t) && tick(`${a.skill}:${m.at}:${t.id}`, 99)) hit(t.id, mult, sky ? 'shot' : 'melee', status); }));
    }
  }
  if (a.dash && a.age >= a.dash.start && a.age <= a.dash.end + .1) out.move = dashAt();
  out.done = a.age >= a.life; return out;
}
/** 0 → 1 while a mark's telegraph fills; 1 exactly when it strikes. */
export function markProgress(a: DgAttack, m: DgMark) { return Math.max(0, Math.min(1, a.age / Math.max(.05, m.at))); }

/** Accept only a bounded cast from another browser (the host's guardian); never used to award anything. */
export function sanitizeAttack(raw: unknown, skills: readonly string[]): DgAttack | null {
  const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const pt = (v: unknown): v is DgPoint => rec(v) && num(v.x, -200, 200) && num(v.z, -200, 200);
  if (!rec(raw) || typeof raw.skill !== 'string' || !skills.includes(raw.skill) || !pt(raw.origin) || !Array.isArray(raw.marks) || !num(raw.facing, -100, 100) || !num(raw.radius, .2, 6)) return null;
  const skill = raw.skill as DungeonSkill, marks: DgMark[] = [];
  for (const m of raw.marks.slice(0, 64)) if (pt(m) && rec(m) && ['circle', 'ring', 'line', 'cone', 'safe'].includes(m.shape as string) && num(m.r, 0, 40) && num(m.at, 0, 12))
    marks.push({ shape: m.shape as DgShape, x: m.x, z: m.z, r: m.r, at: m.at, ...(num(m.inner, 0, 40) ? { inner: m.inner } : {}), ...(num(m.angle, -100, 100) ? { angle: m.angle } : {}), ...(num(m.len, 0, 40) ? { len: m.len } : {}), ...(num(m.width, 0, 10) ? { width: m.width } : {}), ...(num(m.arc, 0, 7) ? { arc: m.arc } : {}) });
  if (!marks.length) return null;
  const orbs: DgOrb[] = []; for (const o of Array.isArray(raw.orbs) ? raw.orbs.slice(0, 9) : []) if (pt(o) && rec(o) && num(o.vx, -10, 10) && num(o.vz, -10, 10)) orbs.push({ x: o.x, z: o.z, vx: o.vx, vz: o.vz, done: false, ...(typeof o.targetId === 'string' && o.targetId.length < 100 ? { targetId: o.targetId } : {}) });
  const d = rec(raw.dash) && pt(raw.dash.to) && num(raw.dash.start, 0, 12) && num(raw.dash.end, 0, 12) ? { to: { x: raw.dash.to.x, z: raw.dash.to.z }, start: raw.dash.start, end: raw.dash.end } : undefined;
  return { skill, age: 0, windup: SKILL_WINDUPS[skill], life: num(raw.life, .1, 15) ? raw.life : SKILL_WINDUPS[skill] + .2, origin: { x: raw.origin.x, z: raw.origin.z }, facing: raw.facing, radius: raw.radius, marks, fired: [], nextHit: {}, orbs, ...(d ? { dash: d } : {}) };
}

/** A pet's skill: the marks it strikes (around or toward its target) and the multiplier (x skillDmg x the owner's attack). */
export function petSkillMarks(skill: PetSkill, from: DgPoint, target: DgPoint, random: () => number): { marks: DgMark[]; mult: number; color: string } {
  const s = PET_SKILLS[skill], marks: DgMark[] = [], aim = toward(from, target, 0);
  if (s.shape === 'nova') marks.push({ shape: 'circle', x: target.x, z: target.z, r: s.radius, at: 0 });
  else if (s.shape === 'line') marks.push({ shape: 'line', x: from.x, z: from.z, angle: aim, len: Math.min(12, dist(from, target) + 3), width: s.radius * 2, r: 12, at: 0 });
  else for (let i = 0; i < s.count; i++) { const a = random() * TAU, d = Math.sqrt(random()) * 2.4; marks.push({ shape: 'circle', x: r2(target.x + Math.sin(a) * d), z: r2(target.z + Math.cos(a) * d), r: s.radius, at: 0 }); }
  return { marks, mult: s.mult, color: s.color };
}
/** Which of the given creatures a set of pet marks hits (each once). */
export function petHits<T extends DgPoint & { id: string; hp: number }>(marks: readonly DgMark[], enemies: readonly T[]): T[] {
  return enemies.filter(e => e.hp > 0 && marks.some(m => inMark(m, e, .6)));
}
