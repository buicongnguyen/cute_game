/**
 * First-30-minutes guidance (pure rules, no DOM): the way home from space, the pointer to the first garden bed,
 * walking to a quest's place, the wild-zone gate, which shop tab holds an item, and a few panel helpers.
 * main.ts wires them up; guide-ui.ts draws the pointer and the space button.
 */
import type { SaveState } from './model.ts';
import { SPACE_EDGE, FUEL_MAX } from './space.ts';

/** A phone or tablet: wording says "Tap" there and "Click" with a mouse. */
export const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const tapOrClick = (touch = isTouch()) => touch ? 'Tap' : 'Click';
/** The map panel's last line, with the verb for the device. */
export const chooseOwnPathHint = (touch = isTouch()) => touch ? 'Tap the ground to choose your own path.' : 'Click the ground to choose your own path.';

// ---- Space: the way home ----
/** Below this much fuel (percent) the Return home button turns into a big pulsing call. */
export const LOW_FUEL = 10;
/** An emergency tow always leaves at least this much fuel, so the ship can reach home. */
export const TOW_FUEL = 40;
/** Whether the Return home button should shout: nearly dry, or the ship is leaning on the edge of the universe. */
export function homeButtonUrgent(flight: { fuel: number; x: number; z: number }) {
  return flight.fuel <= LOW_FUEL || Math.hypot(flight.x, flight.z) > SPACE_EDGE - 40;
}
/**
 * The fuel a ship has when "Return home" is pressed in flight. With a dry tank the pilot pays the launch cost for a
 * full tank; with no energy to pay, the ship gets a free tow (TOW_FUEL), so a flight can never be a dead end.
 */
export function refuelForHome(fuel: number, energy: number, launchCost: number): { pay: boolean; fuel: number } {
  if (fuel > LOW_FUEL) return { pay: false, fuel };
  return energy >= launchCost ? { pay: true, fuel: FUEL_MAX } : { pay: false, fuel: Math.max(fuel, TOW_FUEL) };
}

// ---- The garden pointer ----
/** True until the first crop is planted or harvested: the pointer stays on the nearest empty bed. */
export function needsGardenGuide(s: Pick<SaveState, 'plots' | 'counters' | 'planet'>) {
  return s.planet === 'home' && s.counters.harvests === 0 && s.plots.length > 0 && s.plots.every(p => !p.crop);
}
export interface Spot { x: number; z: number }
/** The empty bed nearest to `from` (its index and position), or null. */
export function nearestEmptyBed(plots: readonly { crop: unknown }[], position: (i: number) => Spot, from: Spot): (Spot & { index: number }) | null {
  let best: (Spot & { index: number }) | null = null, bestD = Infinity;
  plots.forEach((p, index) => {
    if (p.crop) return;
    const at = position(index), d = Math.hypot(at.x - from.x, at.z - from.z);
    if (d < bestD) { bestD = d; best = { ...at, index }; }
  });
  return best;
}
/**
 * Where an off-screen target is, as a point on the screen's edge (inset by `pad`) and the angle (radians, 0 = right,
 * y down) the arrow should point. `x`,`y` is the projected position and may lie anywhere, even behind the camera.
 */
export function edgeArrow(x: number, y: number, w: number, h: number, pad = 56, front = true) {
  const cx = w / 2, cy = h / 2; let dx = x - cx, dy = y - cy;
  if (!front) { dx = -dx; dy = -dy; }
  if (!dx && !dy) dy = 1;
  const k = Math.min((cx - pad) / Math.abs(dx || 1e-9), (cy - pad) / Math.abs(dy || 1e-9));
  return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) };
}

// ---- A quest's place ----
/** The map place (data-kind of the map's buttons) where a story step is done, or null when it has none. */
export function questPlace(step: { event?: string } | undefined | null): string | null {
  if (!step) return null;
  switch (step.event) {
    case 'harvest': return 'plot';
    case 'sell': return 'sell';
    case 'craft': return 'shop';
    case 'upgrade': return 'upgrade';
    case 'fish': case 'fishrare': return 'fish';
    case 'cook': return 'cook';
    case 'planet': return 'travel';
    default: return null;
  }
}

// ---- The wild-zone gate ----
export const ZONE_EDGE = 16;
export interface WildRoute { x: number; z: number; inside: boolean }
/**
 * The map's wild places lie past the village ring. The first tap walks to the ring (just before the creatures);
 * `armed` (the same place was tapped already, or the explorer stands at the ring) walks in.
 */
export function wildRoute(dest: readonly [number, number], armed: boolean): WildRoute {
  const [x, z] = dest, d = Math.hypot(x, z);
  if (armed || d <= ZONE_EDGE) return { x, z, inside: true };
  return { x: x / d * ZONE_EDGE, z: z / d * ZONE_EDGE, inside: false };
}
/** Whether a fresh explorer should be warned: the creatures out there come in packs from level 1. */
export const wildDanger = (level: number) => level < 8;

// ---- The outfitters ----
export const SHOP_TABS = ['Weapons', 'Clothing', 'Pets', 'Disguises', 'Supplies', 'Decor'] as const;
interface ShopItem { slot?: string; type?: string; weapon?: { kind?: string } }
/** Whether an item is listed on a shop tab. The fishing rod is listed under Weapons and again under Supplies ("Rods & tools"). */
export function shopTabMatches(tab: string, item: ShopItem) {
  switch (tab) {
    case 'Weapons': return item.slot === 'weapon';
    case 'Clothing': return ['hat', 'outfit', 'boots'].includes(item.slot ?? '');
    case 'Pets': return item.slot === 'pet';
    case 'Disguises': return item.slot === 'disguise';
    case 'Decor': return item.type === 'decor';
    case 'Dyes': return false; // its body is dye-ui.ts's
    default: return (!item.slot && item.type !== 'decor') || item.weapon?.kind === 'rod';
  }
}
/** The tab to open for a place the help text sends the player to. */
export const rodShopTab = 'Supplies';

// ---- Numbers ----
/** Thousands separators like the HUD's energy counter. */
export const formatEnergy = (n: number) => Math.round(n).toLocaleString();
/** The dialog header's energy line ("ϟ 1,000,091 ENERGY"). */
export const energyKicker = (n: number) => `ϟ ${formatEnergy(n)} ENERGY`;

// ---- The grey price button ----
/** Class and attributes of a shop price button: only a level gate disables it; being short of energy or materials stays tappable so the refusal says what is missing. */
export const priceButtonState = (gated: boolean, short: boolean) => ({ disabled: gated, short: !gated && short });

// ---- Pen list ----
/** Animals cheapest and lowest level first. */
export function sortAnimalKinds<K extends string>(kinds: readonly K[], level: (k: K) => number, price: (k: K) => number): K[] {
  return [...kinds].sort((a, b) => level(a) - level(b) || price(a) - price(b));
}

// ---- Surprise challenges ----
/** Quick challenges start from level 5, and never during a fight, so the first fights stay uncluttered. */
export const surpriseOk = (level: number, fighting: boolean) => level >= 5 && !fighting;

// ---- Colossus banner ----
/** The Colossus event banner shows from this level; below it the zone name has the top of the screen to itself. */
export const COLOSSUS_BANNER_LEVEL = 10;
