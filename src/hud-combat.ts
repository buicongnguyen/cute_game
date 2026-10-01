import * as T from 'three';
import type { Enemy, Entity } from './world.ts';
import { ENEMY_TYPES, HOME_SPAWNS, PLANET_SPAWNS, PLANET_BOSSES } from './enemy-types.ts';
import { PLANETS, type PlanetId } from './model.ts';
import { modelIcon } from './icons.ts';

/**
 * The combat HUD: over-head HP bars, the target frame, the boss-bar rule, tracker folding and the
 * zone banner text. The layout rules are plain functions so tests can check them without a DOM.
 */

/** Over-head bar box in CSS px: a level pill plus the reference's 56x9 bar (RC-09 measured 73x16). */
export const BAR = { w: 80, h: 17 };
/** A creature is engaged once it chases, winds up or attacks; walking home or idling is calm. */
export const aggro = (e: Pick<Enemy, 'phase'>) => !!e.phase && e.phase !== 'idle' && e.phase !== 'return';
/** Over-head bars show while hurt, aggro or selected, never for bosses (they use the boss bar). */
export const engaged = (e: Enemy, selected: unknown) => e.hp > 0 && !e.boss && (e.hp < e.maxHp || aggro(e) || e === selected);

export interface BarSpot { id: string; x: number; y: number }
/**
 * Places over-head bars, given nearest first, by their bottom centre. A bar is never dropped: it is clamped
 * into the screen, and when it would cover a bar already placed it tries one row up, two up, then one down,
 * and only then accepts the overlap (a covered bar still beats a missing one).
 */
export function placeBars(items: BarSpot[], view: { width: number; height: number; top?: number; bottom?: number }, size = BAR): BarSpot[] {
  const placed: BarSpot[] = [], row = size.h + 3, top = (view.top ?? 6) + size.h, bottom = view.height - (view.bottom ?? 4);
  const hits = (x: number, y: number) => placed.some(p => Math.abs(p.x - x) < size.w && Math.abs(p.y - y) < size.h + 1);
  for (const item of items) {
    const x = Math.min(view.width - 4 - size.w / 2, Math.max(4 + size.w / 2, item.x)), y = Math.min(bottom, Math.max(top, item.y));
    let best = y;
    for (const step of [0, -1, -2, 1]) { const ny = Math.min(bottom, Math.max(top, y + step * row)); if (!hits(x, ny)) { best = ny; break; } }
    placed.push({ id: item.id, x, y: best });
  }
  return placed;
}

/** The target frame follows the selected creature, or the last one hit within 3 s (RC-17); bosses use the boss bar. */
export function targetOf(selected: Entity | null, lastHit: { e: Enemy; at: number } | null, now: number): Enemy | null {
  const pick = selected?.kind === 'enemy' ? selected as Enemy : lastHit && now - lastHit.at < 3000 ? lastHit.e : null;
  return pick && pick.hp > 0 && !pick.boss ? pick : null;
}
/** The boss bar shows for a boss within 35 m that is aggro or hurt (RC-32). */
export function bossFor(enemies: readonly Enemy[], x: number, z: number): Enemy | null {
  let best: Enemy | null = null, bestD = 35;
  for (const e of enemies) if (e.boss && e.hp > 0 && (aggro(e) || e.hp < e.maxHp)) { const d = Math.hypot(e.x - x, e.z - z); if (d < bestD) { best = e; bestD = d; } }
  return best;
}
/** A fight is near when an aggro creature is within 12 m: the trackers fold into a chip so they cannot hide it. */
export const fightNear = (enemies: readonly Enemy[], x: number, z: number, r = 12) => enemies.some(e => e.hp > 0 && aggro(e) && Math.hypot(e.x - x, e.z - z) < r);

/**
 * One loot line for a defeat: a single item reads in full, several merge into '+N items' so lines do not pile up.
 * The drops module may replace this with ground pickups; keep the signature.
 */
export function lootText(items: readonly { icon: string; name: string; count: number }[]): string {
  if (!items.length) return '';
  if (items.length === 1) return `${items[0].icon} ${items[0].name} ×${items[0].count}`;
  return `${items.slice(0, 3).map(i => i.icon).join('')} +${items.reduce((n, i) => n + i.count, 0)} items`;
}

/** Difficulty by home zone or planet; creature levels are difficulty × 3 − 2 (world.spawnSpecies). */
export const ZONE_DIFFICULTY: Record<string, number> = { home: 0, forest: 1, meadow: 1, swamp: 2, canyon: 3, candy: 3, ice: 4, lava: 5, toy: 2, jungle: 3, ocean: 4, cloud: 5, shadow: 6 };
const HOME_ZONES: Record<string, { id: string; boss: string }> = { 'Mushroom Forest': { id: 'forest', boss: 'treant' }, 'Blue Lake Meadow': { id: 'meadow', boss: 'mushking' }, 'Chomper Swamp': { id: 'swamp', boss: 'croc' }, 'Redrock Canyon': { id: 'canyon', boss: 'bear' } };
const names = (types: readonly string[]) => types.map(t => ENEMY_TYPES[t]?.name).filter(Boolean).slice(0, 3).join(', ');
/** Zone banner text: the detail names what lives there, the chip rates it ('★★ · Lv 4+ · King Bear'). */
export function zoneInfo(name: string, planet: PlanetId | string): { detail: string; chip: string } {
  if (planet === 'home' && name === 'Clover Village') return { detail: 'A peaceful place · health restores here', chip: 'Safe' };
  const home = planet === 'home' ? HOME_ZONES[name] : undefined, id = home?.id ?? planet, level = Math.max(1, (ZONE_DIFFICULTY[id] ?? 1) * 3 - 2);
  const spawns = home ? HOME_SPAWNS[home.id] : PLANET_SPAWNS[planet as PlanetId], bosses = home ? [home.boss] : PLANET_BOSSES[planet as PlanetId] ?? [];
  const stars = '★'.repeat(Math.max(1, Math.min(5, Math.ceil((ZONE_DIFFICULTY[id] ?? 1) / 1.3))));
  const detail = home ? `Wild creatures: ${names((spawns ?? []).map(s => s[0]))}` : PLANETS[planet as PlanetId]?.description ?? '';
  const boss = bosses[0] ? ENEMY_TYPES[bosses[0]]?.name : '';
  return { detail, chip: `${stars} · Lv ${level}+${boss ? ` · 👑 ${boss}` : ''}` };
}

/** Where a creature's bar sits: just above its own model, measured once per model (and again when Blender art replaces it). */
const heights = new WeakMap<object, { asset: unknown; h: number }>(), box = new T.Box3();
export function barHeight(e: Enemy): number {
  const asset = e.mesh.userData.refinedAsset, known = heights.get(e.mesh);
  if (known && known.asset === asset) return e.mesh.position.y + known.h;
  box.setFromObject(e.mesh); const h = Number.isFinite(box.max.y) ? Math.min(7, Math.max(.8, box.max.y - e.mesh.position.y + .15)) : 1.8;
  heights.set(e.mesh, { asset, h }); return e.mesh.position.y + h;
}
/** A portrait drawn from the creature's own model, once per type. */
export function enemyIcon(e: Enemy): string {
  return modelIcon(`enemy:${e.type ?? e.name}`, () => {
    // Object3D.clone copies userData through JSON, and a creature's userData links back to itself; clone without it.
    const stash: [T.Object3D, Record<string, unknown>][] = [];
    e.mesh.traverse(o => { stash.push([o, o.userData]); o.userData = {}; });
    let c: T.Object3D;
    try { c = e.mesh.clone(true); } finally { for (const [o, data] of stash) o.userData = data; }
    c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.setScalar(1); c.visible = true;
    // Hidden parts and attack telegraph rings would still count in the icon's framing box, so they leave the copy.
    const extra: T.Object3D[] = []; c.traverse(o => { if (o !== c && (!o.visible || o.name === 'attack-telegraph')) extra.push(o); });
    for (const o of extra) o.removeFromParent();
    return c;
  });
}

type Screen = (x: number, y: number, z: number) => { x: number; y: number; visible: boolean; front: boolean };
/** The portrait, or null while the creature flashes from a hit (the icon would bake the flash in); the caller retries. */
const portrait = (e: Enemy) => { if ((e.flash ?? 0) > 0) return null; const url = enemyIcon(e); return url ? `<img src="${url}" alt="" draggable="false">` : '⚔️'; };

/** DOM side: owns the over-head bars in the label layer and fills the target frame and boss bar. */
export class CombatHud {
  private bars = new Map<string, { el: HTMLDivElement; fill: HTMLElement; lv: HTMLElement; pct: number; level: number; sel: boolean }>();
  private lastHit: { e: Enemy; at: number } | null = null;
  private targetId = ''; private bossId = '';
  private layer: HTMLElement; private screen: Screen;
  constructor(layer: HTMLElement, screen: Screen) { this.layer = layer; this.screen = screen; }

  noteHit(e: Enemy) { this.lastHit = { e, at: performance.now() }; }

  /** Every frame: bars follow their creatures. Cheap: only creatures within 18 m are projected. */
  frame(enemies: readonly Enemy[], selected: Entity | null, px: number, pz: number, hidden: boolean) {
    const items: (BarSpot & { e: Enemy; d: number })[] = [];
    if (!hidden) for (const e of enemies) {
      if (!e.mesh.visible || !engaged(e, selected)) continue;
      const d = Math.hypot(e.x - px, e.z - pz); if (d > 18) continue;
      const p = this.screen(e.x, barHeight(e), e.z);
      if (!p.front || p.x < -40 || p.x > innerWidth + 40 || p.y < -60 || p.y > innerHeight + 20) continue;
      items.push({ id: e.id, x: p.x, y: p.y, e, d });
    }
    // The selected creature first, then nearest: they keep their natural spot, others make room.
    items.sort((a, b) => (b.e === selected ? 1 : 0) - (a.e === selected ? 1 : 0) || a.d - b.d);
    const spots = placeBars(items, { width: innerWidth, height: innerHeight }), live = new Set<string>();
    spots.forEach((s, i) => {
      const e = items[i].e; live.add(s.id);
      let bar = this.bars.get(s.id);
      if (!bar) {
        const el = document.createElement('div'); el.className = 'enemy-label'; el.dataset.entity = s.id; el.innerHTML = '<span></span><i><b></b></i>';
        this.layer.append(el); bar = { el, lv: el.firstElementChild as HTMLElement, fill: el.querySelector('b')!, pct: -1, level: -1, sel: false }; this.bars.set(s.id, bar);
      }
      const pct = Math.round(e.hp / e.maxHp * 100), level = e.level ?? 1, sel = e === selected;
      if (pct !== bar.pct) { bar.fill.style.width = `${pct}%`; bar.pct = pct; }
      if (level !== bar.level) { bar.lv.textContent = String(level); bar.level = level; }
      if (sel !== bar.sel) { bar.el.classList.toggle('sel', sel); bar.sel = sel; }
      bar.el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px) translate(-50%,-100%)`;
    });
    for (const [id, bar] of this.bars) if (!live.has(id)) { bar.el.remove(); this.bars.delete(id); }
  }

  /** A few times a second: the target frame and the boss bar. Returns whether each shows, for layout classes. */
  panels(enemies: readonly Enemy[], selected: Entity | null, px: number, pz: number, on: boolean): { target: boolean; boss: boolean } {
    const target = on ? targetOf(selected, this.lastHit, performance.now()) : null, frame = document.getElementById('target-frame')!;
    frame.hidden = !target;
    if (target) {
      if (target.id !== this.targetId) { const icon = portrait(target); frame.querySelector('.target-icon')!.innerHTML = icon ?? ''; frame.querySelector('strong')!.textContent = target.name; if (icon !== null) this.targetId = target.id; }
      frame.querySelector('.target-level')!.textContent = `Lv ${target.level ?? 1}`;
      (frame.querySelector('.target-meter i') as HTMLElement).style.width = `${target.hp / target.maxHp * 100}%`;
      frame.querySelector('.target-hp')!.textContent = `${Math.ceil(target.hp)} / ${target.maxHp}`;
    } else this.targetId = '';
    const boss = on ? bossFor(enemies, px, pz) : null, bar = document.getElementById('boss-bar')!;
    bar.hidden = !boss;
    if (boss) {
      if (boss.id !== this.bossId) { const icon = portrait(boss); document.getElementById('boss-icon')!.innerHTML = icon ?? '👑'; document.getElementById('boss-name')!.textContent = `👑 ${boss.name}`; if (icon !== null) this.bossId = boss.id; }
      document.getElementById('boss-fill')!.style.width = `${boss.hp / boss.maxHp * 100}%`;
      document.getElementById('boss-hp')!.textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    } else this.bossId = '';
    return { target: !!target, boss: !!boss };
  }
  clear() { for (const bar of this.bars.values()) bar.el.remove(); this.bars.clear(); this.lastHit = null; }
}
