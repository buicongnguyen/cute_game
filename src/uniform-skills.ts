/**
 * Fighting skills that come with a uniform: the outfit in the outfit slot replaces the weapon special (the R skill) while
 * it is worn. model.ts weaponStats applies it, so the client, the tips and the server's combat all see the same special;
 * combat.ts runs it (CombatSimulation.special) and SPECIALS (combat.ts) names it.
 */
export const UNIFORM_SPECIAL: Readonly<Record<string, string>> = {
  armor_army: 'volley',
  armor_navy: 'anchor',
  armor_aodai: 'lotus',
  armor_aodai_man: 'dragon',
  armor_usa: 'eagle',
  armor_vietnam: 'goldstar',
};
export const uniformSpecial = (outfit: string | undefined) => outfit ? UNIFORM_SPECIAL[outfit] : undefined;
