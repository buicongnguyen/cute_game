import { t } from './i18n.ts';
import { PLANETS, YARD, type PlanetId } from './model.ts';
import { zoneAt, type EnvironmentLayout } from './environments.ts';
import { trailOffset, trailDistance, RIM_START } from './biomes.ts';
import { aggro } from './hud-combat.ts';

/**
 * The map panel: a 150x150 2D canvas showing the whole world north-up at 75/144 px per metre, framed as a rounded
 * panel by the stylesheet (hud-ours.css). Home is drawn as the land really lies (stage 2 of docs/QUALITY-PLAN.md): the four
 * wilds melt into one another along wandering borders, with the dark rim wood around the island, each wild's own
 * marks (tree clumps, reed pools, meadow flowers, canyon ledges), the sand roads from the four gates, the village
 * green, the ponds, the cottage and the starship; planets show their ground, islands, lava pools and tracks. On top: bosses always (a crown), other creatures within 40 m (red, brighter
 * when aggro), ready garden beds, the dropped backpack, other players and the explorer's arrow with its facing.
 * The terrain is drawn once per world into an offscreen canvas; markers redraw at most every 0.2 s (like the reference).
 */
export const MAP_PX = 150, MAP_C = MAP_PX / 2, MAP_SCALE = 75 / 144;
/** Same colours as the home ground (ground.ts) so the map reads as the world. */
export const ZONE_COLORS = { home: '#93e06a', forest: '#5cbf57', meadow: '#a6e070', swamp: '#5fb889', canyon: '#f1bb7c' } as const;
export const ZONE_NAMES = { home: 'Clover Village', forest: 'Mushroom Forest', meadow: 'Blue Lake Meadow', swamp: 'Chomper Swamp', canyon: 'Redrock Canyon' } as const;
/** Where the explorer stands, for the caption: the home zone by position, otherwise the planet (fixes "CLOVER VILLAGE" in the wilds). */
export function mapCaption(planet: PlanetId, x: number, z: number): string {
  return t(planet === 'home' ? ZONE_NAMES[zoneAt({ x, z })] : PLANETS[planet]?.name ?? '');
}
/** World metres to canvas pixels. */
export const mapPoint = (x: number, z: number) => ({ x: MAP_C + x * MAP_SCALE, y: MAP_C + z * MAP_SCALE });
/** Creatures other than bosses show within this range, like the reference. */
export const CREATURE_RANGE = 40;

export interface MapThing { x: number; z: number; kind: string; mesh: { visible: boolean } }
export interface MapCreature extends MapThing { hp: number; boss: boolean; phase?: string }
export interface MapView {
  /** False while the animal pen is only a marked plot (drawn as a small square, not the yard). */
  penBuilt?: boolean;
  planet: PlanetId; layout: EnvironmentLayout; position: { x: number; z: number }; facing: number;
  entities: readonly (MapThing & { pond?: { rx: number; rz: number } })[]; enemies: readonly MapCreature[];
  /** Ready garden beds (world positions). */
  ready: readonly { x: number; z: number }[];
  remotes: readonly { x: number; z: number }[];
}

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
function disc(ctx: Ctx, x: number, z: number, r: number) { const p = mapPoint(x, z); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); }

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
const mix = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** The wilds clockwise from east (atan2(z, x) = 0): canyon, meadow (south), forest (west), swamp (north), as environments.zoneAt has them. */
const RING = ['canyon', 'meadow', 'forest', 'swamp'] as const;
const RGB = { home: hex(ZONE_COLORS.home), forest: hex(ZONE_COLORS.forest), meadow: hex(ZONE_COLORS.meadow), swamp: hex(ZONE_COLORS.swamp), canyon: hex(ZONE_COLORS.canyon), rim: hex('#2f7d4a') };
/** How far (radians) a border between two wilds wanders at this distance from the village, so no border is a ruler line. */
export const borderWander = (d: number) => (Math.sin(d * .11) * .09 + Math.sin(d * .043 + 1.7) * .07) * smooth((d - 18) / 14);
/**
 * The map colour of a home-world point (r, g, b 0-255): the zone's ground colour, blended over a soft, wandering border
 * into its neighbour, with the village green in the middle and the rim wood beyond the edge of the world.
 */
export function homeMapColor(x: number, z: number): [number, number, number] {
  const d = Math.hypot(x, z), turn = Math.PI / 2;
  // Position around the ring in quarter turns, 0 = the middle of the canyon.
  const q = ((Math.atan2(z, x) + borderWander(d)) / turn % 4 + 4) % 4, i = Math.round(q) % 4, off = q - Math.round(q);
  // Within .09 of a quarter turn (about 8 degrees) of a border the two wilds blend.
  const edge = .5 - Math.abs(off), other = RING[(i + (off > 0 ? 1 : 3)) % 4];
  let c = edge < .09 ? mix(RGB[RING[i]], RGB[other], .5 - smooth(edge / .09) * .5) : RGB[RING[i]];
  if (d < 21) c = mix(RGB.home, c, smooth((d - 17) / 4));
  if (d > RIM_START - 9) c = mix(c, RGB.rim, smooth((d - (RIM_START - 9)) / 9));
  return c;
}
/** A small repeatable random stream, so the map's marks are the same on every visit. */
function stream(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/** Each wild's own marks: [how many, colour, size]. */
const MARKS = { forest: [90, '#3f9a45', 1.5], meadow: [46, '#d8f7a0', 1.1], swamp: [34, '#3f9e96', 1.7], canyon: [44, '#d48f52', 1.3] } as const;

/** The home world: the lie of the land, each wild's marks, the roads and the village green. */
function drawHome(ctx: Ctx) {
  const s = MAP_SCALE, image = ctx.createImageData?.(MAP_PX, MAP_PX);
  if (image?.data) {
    for (let py = 0, o = 0; py < MAP_PX; py++) for (let px = 0; px < MAP_PX; px++, o += 4) {
      const c = homeMapColor((px + .5 - MAP_C) / s, (py + .5 - MAP_C) / s);
      image.data[o] = c[0]; image.data[o + 1] = c[1]; image.data[o + 2] = c[2]; image.data[o + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  } else { ctx.fillStyle = ZONE_COLORS.home; ctx.fillRect(0, 0, MAP_PX, MAP_PX); }
  // Marks: scattered inside their own wild, off the roads and the village.
  const random = stream(20261011);
  for (const zone of ['forest', 'meadow', 'swamp', 'canyon'] as const) {
    const [count, color, size] = MARKS[zone]; ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (let n = 0, tries = 0; n < count && tries < count * 12; tries++) {
      const a = random() * TAU, d = 26 + Math.sqrt(random()) * 116, x = Math.cos(a) * d, z = Math.sin(a) * d, r = size * (.7 + random() * .6);
      if (zoneAt({ x, z }) !== zone || trailDistance(x, z) < 6) continue; n++;
      const p = mapPoint(x, z);
      if (zone === 'canyon') { ctx.beginPath(); ctx.moveTo(p.x - r * 1.6, p.y); ctx.lineTo(p.x + r * 1.6, p.y - r * .5); ctx.stroke(); }
      else if (zone === 'swamp') { ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.5, r * .8, 0, 0, TAU); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); }
    }
  }
  // Sand roads from the four gates to the border: a soft ink edge under the sand.
  for (const [color, width] of [['rgba(58, 36, 51, .3)', 3.6], ['#f3dfa6', 2.2]] as const) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.beginPath();
      for (let t = 18; t <= 148; t += 4) { const w = trailOffset(t), p = mapPoint(ax ? ax * t : w, az ? az * t : w); if (t === 18) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      ctx.stroke();
    }
  }
  // The village green with its hedge line, open at the four gates (world.ts: fences where |sin 2a| >= .32).
  ctx.fillStyle = ZONE_COLORS.home; disc(ctx, 0, 0, 18 * s);
  ctx.strokeStyle = '#fff6e0'; ctx.lineWidth = 1.5; const gap = Math.asin(.32) / 2;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(MAP_C, MAP_C, 18 * s, i * Math.PI / 2 + gap, (i + 1) * Math.PI / 2 - gap); ctx.stroke(); }
}

/** The static layer: ground, water, trails, fence. */
export function drawTerrain(ctx: Ctx, view: Pick<MapView, 'planet' | 'layout' | 'entities'>) {
  const { planet, layout } = view, s = MAP_SCALE;
  ctx.clearRect(0, 0, MAP_PX, MAP_PX);
  if (planet === 'home') drawHome(ctx);
  else {
    const [base, , pad] = PLANETS[planet].ground;
    ctx.fillStyle = planet === 'ocean' ? '#3a9ad9' : planet === 'cloud' ? '#d9e4ff' : base; ctx.fillRect(0, 0, MAP_PX, MAP_PX);
    ctx.fillStyle = base; for (const i of layout.islands) disc(ctx, i.x, i.z, Math.max(1.5, i.r * s));
    ctx.strokeStyle = base; ctx.lineWidth = 2; for (const l of layout.links) { const a = mapPoint(l.a.x, l.a.z), b = mapPoint(l.b.x, l.b.z); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.fillStyle = '#ff6a2b'; for (const p of layout.pools) disc(ctx, p.x, p.z, Math.max(1.5, p.r * s));
    ctx.fillStyle = '#7fd36b'; for (const p of layout.poison) disc(ctx, p.x, p.z, Math.max(1.2, p.r * s));
    ctx.strokeStyle = '#9aa6b8'; ctx.lineWidth = 2; for (const t of layout.tracks) { const p = mapPoint(t.x, t.z); ctx.beginPath(); ctx.arc(p.x, p.y, t.r * s, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = pad; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; const c = mapPoint(0, 0); ctx.beginPath(); ctx.arc(c.x, c.y, 11 * s, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // Ponds and lakes (their fishing spots carry the water's half-extents).
  ctx.fillStyle = '#4cb8f0';
  for (const e of view.entities) if (e.pond) { const p = mapPoint(e.x, e.z); ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(1.5, e.pond.rx * s), Math.max(1.2, e.pond.rz * s), 0, 0, TAU); ctx.fill(); }
}

/** Markers over the terrain: buildings, creatures, beds, players and the explorer's arrow. */
export function drawMarkers(ctx: Ctx, view: MapView) {
  const { position: me } = view;
  for (const e of view.entities) {
    if (e.kind === 'home') { const p = mapPoint(e.x, e.z); ctx.fillStyle = '#c47a3a'; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); }
    else if (e.kind === 'dropped') { ctx.fillStyle = '#ff7ab0'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; const p = mapPoint(e.x, e.z); ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, TAU); ctx.fill(); ctx.stroke(); }
    else if (e.kind === 'pen' && view.penBuilt === false) { const c = mapPoint(e.x, e.z); ctx.fillStyle = '#c9a46a'; ctx.fillRect(c.x - 2.5, c.y - 2.5, 5, 5); }
    else if (e.kind === 'pen') { const c = mapPoint(e.x, e.z); ctx.fillStyle = '#efc879'; ctx.strokeStyle = '#8a5a3b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(c.x, c.y, YARD.rx * MAP_SCALE, YARD.rz * MAP_SCALE, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
    else if (e.kind === 'rescue-portal') { const p = mapPoint(e.x, e.z); ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, TAU); ctx.fill(); ctx.fillText('📯', p.x, p.y + .5); }
    else if (e.kind === 'travel') { const p = mapPoint(e.x, e.z); ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🚀', p.x, p.y); }
  }
  ctx.fillStyle = '#ffe66d'; for (const b of view.ready) { const p = mapPoint(b.x, b.z); ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); }
  for (const e of view.enemies) {
    if (e.hp <= 0) continue;
    if (e.boss) { ctx.fillStyle = '#7a1f1f'; disc(ctx, e.x, e.z, 5); const p = mapPoint(e.x, e.z); ctx.fillStyle = '#ffc93c'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♛', p.x, p.y + .5); continue; }
    if (!e.mesh.visible || Math.hypot(e.x - me.x, e.z - me.z) > CREATURE_RANGE) continue;
    ctx.fillStyle = aggro(e) ? '#ff2d55' : '#c0392b'; disc(ctx, e.x, e.z, 2);
  }
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ff7ab0'; ctx.lineWidth = 2;
  for (const r of view.remotes) { const p = mapPoint(r.x, r.z); ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, TAU); ctx.fill(); ctx.stroke(); }
  // The explorer: a cream arrow outlined in ink, pointing where they face (facing = atan2(dx, dz), 0 = south).
  const p = mapPoint(me.x, me.z);
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI - view.facing);
  ctx.fillStyle = '#fff6e0'; ctx.strokeStyle = '#3a2433'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.lineTo(5, 4.5); ctx.lineTo(0, 2); ctx.lineTo(-5, 4.5); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
}

/** Owns the canvas and its cached terrain; call frame(dt) every frame, it redraws five times a second. */
export class Minimap {
  private terrain: HTMLCanvasElement | OffscreenCanvas | null = null; private terrainKey = ''; private wait = 0; private caption = '';
  private canvas: HTMLCanvasElement; private captionNode: HTMLElement | null; private view: () => MapView | null;
  constructor(canvas: HTMLCanvasElement, captionNode: HTMLElement | null, view: () => MapView | null) { this.canvas = canvas; this.captionNode = captionNode; this.view = view; }
  /** Forces the next frame to redraw, terrain included (after a world build). */
  invalidate() { this.terrainKey = ''; this.wait = 0; }
  frame(dt: number) {
    this.wait -= dt; if (this.wait > 0) return; this.wait = .2;
    const view = this.view(); if (!view) return;
    const ctx = this.canvas.getContext('2d'); if (!ctx) return;
    const key = `${view.planet}:${view.entities.filter(e => 'pond' in e && e.pond).length}`;
    if (key !== this.terrainKey) {
      this.terrain ??= typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(MAP_PX, MAP_PX) : Object.assign(document.createElement('canvas'), { width: MAP_PX, height: MAP_PX });
      const tctx = this.terrain.getContext('2d') as Ctx | null; if (!tctx) return;
      drawTerrain(tctx, view); this.terrainKey = key;
    }
    ctx.clearRect(0, 0, MAP_PX, MAP_PX); ctx.drawImage(this.terrain as CanvasImageSource, 0, 0); drawMarkers(ctx, view);
    const caption = mapCaption(view.planet, view.position.x, view.position.z);
    if (caption !== this.caption && this.captionNode) { this.caption = caption; this.captionNode.textContent = caption; }
  }
}
