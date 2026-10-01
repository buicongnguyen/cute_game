import { ITEMS, type ItemId, type ItemDef } from './content.ts';
import type { SaveState } from './model.ts';

export type ContextGearState = Pick<SaveState, 'bag' | 'gear'>;
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

  private observe(state: ContextGearState) {
    if (this.state !== state) { this.state = state; this.combat = null; }
    const equipped = Object.hasOwn(state.gear, 'weapon') ? state.gear.weapon : undefined;
    if (ownedCombat(state, equipped)) this.combat = equipped!;
    else if (this.combat && !ownedCombat(state, this.combat)) this.combat = null;
  }

  /** Best owned rod, regardless of which weapon is currently held. */
  forFishing(state: ContextGearState): ItemId | null {
    this.observe(state);
    const rods = Object.keys(state.bag).filter(id => ownedWeapon(state, id)?.weapon?.kind === 'rod');
    rods.sort((a, b) => (ITEMS[b].weapon!.quality ?? 0) - (ITEMS[a].weapon!.quality ?? 0) || idOrder(a, b));
    return rods[0] ?? null;
  }

  /** Manual combat choice first, then remembered choice, then strongest owned weapon; null means fists. */
  forCombat(state: ContextGearState): ItemId | null {
    this.observe(state);
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
