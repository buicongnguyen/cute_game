import type * as T from 'three';
import { PEN, ANIMAL_KINDS, type FarmState } from './farm.ts';
import { PERCH_FEET, newPetLink, penSpots, petFollows, petMayFight, petStyle, petTrail, restY, stepPet, PET_HOVER, type PetLink, type PetStyle, type Spot } from './pet-pen.ts';

/** What the pet needs from the world (world.ts passes itself). */
export interface PetHost {
  companion: T.Object3D; planet: string; position: T.Vector3; facing: number; boarded: boolean; time: number;
  state: { gear: { pet?: string }; farm?: FarmState };
  interior?: unknown; farmView?: { isBuilt: boolean };
  /** True while the pet stays at your own pen out of this world (visiting a friend's garden); main.ts sets it. */
  petStaysHome?: () => boolean;
}
type Wing = { node: T.Object3D; base: number; side: number };

/**
 * Ties pet-pen.ts to the companion model each frame: where it is (pen, out with you, on its way back), how high, which
 * way it faces, and the flap or hop that goes with it. world.ts keeps building the model (petFor); this only poses it.
 */
export class PetCompanion {
  readonly link: PetLink = newPetLink();
  private planet = '';
  private id = '';
  private spotsKey = '';
  private spots: Spot[] = [];
  /** False while the pet is away at your own pen in another garden (a visit): the companion is not drawn. */
  shown = true;
  /** Where the pet is now: 'pen', 'follow' or 'return' (for probes, tests and the fighting gate). */
  get place() { return this.link.place; }
  /** True while the pet may shoot (pet-pen.ts petMayFight). */
  mayFight(planet: string, pose: { x: number; z: number; y?: number }, indoors = false) { return this.shown && petMayFight(this.link.place, planet, pose, indoors); }
  update(h: PetHost, dt: number) {
    const id = h.state.gear.pet ?? '', c = h.companion;
    if (!id) { this.id = ''; this.shown = true; return; }
    const style = petStyle(id), feet = PERCH_FEET[id] ?? 0, away = !!h.petStaysHome?.();
    this.shown = !away;
    if (away) { this.link.place = 'pen'; this.link.hop = null; this.planet = h.planet; return; }
    const home = h.planet === 'home', farm = h.state.farm;
    const key = home ? `${style}:${!!(h.farmView?.isBuilt ?? farm?.built)}:${JSON.stringify(farm?.speciesPens ?? {})}` : '';
    if (key !== this.spotsKey) {
      this.spotsKey = key;
      this.spots = home ? penSpots(style, PEN, h.farmView?.isBuilt ?? farm?.built ?? false, ANIMAL_KINDS.map(k => farm?.speciesPens?.[k]).filter((p): p is { x: number; z: number } => !!p)) : [];
      if (this.link.place === 'pen' && this.spots.length) this.placeAt(this.spots[Math.min(this.link.spot, this.spots.length - 1)], style, feet);
    }
    const follow = petFollows(h.planet, h.position, !!h.interior);
    // A new pet, or a new world (a landing, a flight home): a pet out with you lands beside you; one at home is at the pen.
    if (this.id !== id || this.planet !== h.planet) {
      this.link.hop = null;
      if (follow || !this.spots.length) { const at = petTrail(h.position, h.facing); this.link.x = at.x; this.link.z = at.z; this.link.y = h.position.y + (style === 'walk' ? 0 : PET_HOVER); this.link.place = 'follow'; }
      else { this.link.place = 'pen'; this.link.spot = 0; this.placeAt(this.spots[0], style, feet); }
      this.id = id; this.planet = h.planet;
    }
    const before = { x: this.link.x, z: this.link.z };
    stepPet(this.link, dt, follow, h.position, h.facing, h.position.y, this.spots, style, feet);
    const l = this.link, moved = Math.hypot(l.x - before.x, l.z - before.z), t = h.time, flying = style !== 'walk';
    // Flyers bob while airborne; walkers hop as they move (a smaller bounce while standing), as the companion always did.
    const bob = flying ? (l.resting && style === 'perch' ? 0 : Math.sin(t * 3) * (l.resting ? .08 : .18)) : Math.abs(Math.sin(t * 5)) * .12 * (moved > dt * .5 ? 1 : l.resting ? .15 : .3);
    c.position.set(l.x, l.y + bob, l.z);
    // While perched it looks about now and then; otherwise it faces where it goes.
    c.rotation.y = l.resting ? l.heading + Math.sin(t * .7 + l.seq) * .5 : l.heading;
    c.rotation.z = flying && !(l.resting && style === 'perch') ? Math.sin(t * 2.5) * .1 : 0;
    // Wings: folded on a perch (with a quick ruffle now and then), flapping in the air, slower while hovering in place.
    const perched = l.resting && style === 'perch', ruffle = Math.sin(t * .9 + l.seq) > .93 ? Math.sin(t * 22) * .35 : 0;
    for (const w of (c.userData.wings ?? []) as Wing[]) w.node.rotation.z = w.base + w.side * (perched ? ruffle : Math.sin(t * (l.resting ? 12 : 18)) * .6);
  }
  private placeAt(s: Spot, style: PetStyle, feet: number) { this.link.x = s.x; this.link.z = s.z; this.link.y = restY(style, s, feet); this.link.speed = 0; }
}
