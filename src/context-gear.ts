import { ITEMS, type ItemId, type ItemDef } from './content.ts';
import type { SaveState } from './model.ts';

export type ContextGearState = Pick<SaveState, 'bag' | 'gear'> & { fists?: boolean };
export interface GearContext { nearWater: boolean; fighting: boolean; fishing: boolean }

function ownedWeapon(state: ContextGearState, id: string | undefined): ItemDef | undefined {
  if (!id || !Object.hasOwn(ITEMS, id) || !Object.hasOwn(state.bag, id)) return;
  const quantity = state.bag[id], item = ITEMS[id];
  if (!Number.isSafeInteger(quantity) || quantity! < 1 || item.slot !== 'weapon' || !item.weapon) return;
  return item;
}

function ownedCombat(state: ContextGearState, id: string | undefined): boolean {
  const kind = ownedWeapon(state, id)?.weapon?.kind;
  return kind === 'sword' || kind === 'gun' || kind === 'fist';
}

/** Stable ordering even when the same inventory was inserted in another order. */
const idOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const attack = (item: ItemDef) => item.stats?.atk ?? item.attack ?? 0;

/**
 * Recommends the item to hold without equipping it, saving, or changing inventory.
 * The caller owns water-distance hysteresis and applies a recommendation only
 * when it changes. A combat choice survives automatic rod selection, but never
 * crosses save/account identities or references a weapon no longer in the bag.
 */
export class ContextGearSelection {
  private state: ContextGearState | null = null;
  private combat: ItemId | null = null;
  /** The player took the weapon off by hand: fists until a weapon is equipped again. */
  private fists = false;

  private observe(state: ContextGearState) {
    // A save that chose fists (SaveState.fists, set by the 'unequip' action) starts with fists, on the server as well.
    if (this.state !== state) { this.state = state; this.combat = null; this.fists = state.fists === true; }
    const equipped = Object.hasOwn(state.gear, 'weapon') ? state.gear.weapon : undefined;
    if (ownedCombat(state, equipped)) { this.combat = equipped!; this.fists = false; }
    else if (state.fists === true && !equipped) { this.fists = true; this.combat = null; }
    else if (this.combat && !ownedCombat(state, this.combat)) this.combat = null;
  }

  /**
   * A manual Remove of the weapon. Without it the remembered (or strongest) weapon came straight back on the next
   * frame, so the slot could never be emptied. Rods still come out by the water; leaving it gives fists again.
   */
  holdFists(state: ContextGearState) { this.observe(state); if (!state.gear.weapon) { this.fists = true; this.combat = null; } }

  /**
   * The state to write to the save: a rod held only because of the water is stored as the combat choice it replaced
   * (no weapon for fists), so a reload away from the pond restores the player's pick rather than the strongest weapon.
   */
  persisted<S extends ContextGearState>(state: S): S {
    this.observe(state);
    if (ownedWeapon(state, state.gear.weapon)?.weapon?.kind !== 'rod' || !this.combat && !this.fists) return state;
    const gear = { ...state.gear }; if (this.combat) gear.weapon = this.combat; else delete gear.weapon;
    return { ...state, gear };
  }

  /** Best owned rod, regardless of which weapon is currently held. */
  forFishing(state: ContextGearState): ItemId | null {
    this.observe(state);
    const rods = Object.keys(state.bag).filter(id => ownedWeapon(state, id)?.weapon?.kind === 'rod');
    rods.sort((a, b) => (ITEMS[b].weapon!.quality ?? 0) - (ITEMS[a].weapon!.quality ?? 0) || idOrder(a, b));
    return rods[0] ?? null;
  }

  /** Manual combat choice first (a manual Remove means fists), then remembered choice, then strongest owned weapon; null means fists. */
  forCombat(state: ContextGearState): ItemId | null {
    this.observe(state);
    if (this.fists) return null;
    if (this.combat) return this.combat;
    const weapons = Object.keys(state.bag).filter(id => ownedCombat(state, id));
    weapons.sort((a, b) => attack(ITEMS[b]) - attack(ITEMS[a]) ||
      ITEMS[b].weapon!.range - ITEMS[a].weapon!.range ||
      ITEMS[a].weapon!.cd - ITEMS[b].weapon!.cd || idOrder(a, b));
    return weapons[0] ?? null;
  }

  choose(state: ContextGearState, context: GearContext): ItemId | null {
    this.observe(state);
    // An explicitly held hunting tool stays ready at the pond. Starting ordinary rod fishing still takes priority.
    if (!context.fishing && state.gear.weapon === 'harpoon' && ownedCombat(state, 'harpoon')) return 'harpoon';
    if (!context.fighting && (context.fishing || context.nearWater)) {
      const rod = this.forFishing(state);
      if (rod) return rod;
    }
    return this.forCombat(state);
  }
}
