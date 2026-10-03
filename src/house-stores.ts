/**
 * The cottage's own "stores". Inside, the stove, workbench, globe, wardrobe and mirror open the same panels as the
 * village buildings (cooking, crafting, the starship's route map, the bag, the Look shop), and they used to open
 * them word for word: the stove said "VOLCANO KITCHEN", the globe "Starship Sprout" with a launch button, the
 * wardrobe was the whole backpack. Players read that as the outdoor shops leaking into the house. Each indoor
 * place now has its own title, icon and a purpose line saying what it is for and where the outdoor version is;
 * main.ts openDialog applies this only while the explorer is inside.
 */
export interface IndoorStore { title: string; kicker: string; icon: string; purpose: string }
export const INDOOR_STORES: Record<'cook' | 'craft' | 'travel' | 'wardrobe' | 'looks' | 'bench', IndoorStore> = {
  cook: { title: 'Cottage stove', kicker: 'KITCHEN · AT HOME', icon: '🍳', purpose: 'Cook your harvest and catch at home. Same free recipes as the Volcano Kitchen in the village.' },
  craft: { title: 'Craft-room workbench', kicker: 'CRAFT ROOM · AT HOME', icon: '🪚', purpose: 'Make things from your materials at home. The ember forge for weapons is in the village.' },
  travel: { title: 'Study globe', kicker: 'STUDY · AT HOME', icon: '🌍', purpose: 'Plan your next trip here. The starship takes off from its pad in the village.' },
  wardrobe: { title: 'Wardrobe', kicker: 'BEDROOM · AT HOME', icon: '👗', purpose: 'Change what you wear: only your clothes, pets and gear. Buy new ones at the Little outfitters in the village.' },
  bench: { title: 'Upgrade bench', kicker: 'CRAFT ROOM · AT HOME', icon: '⚒️', purpose: 'Level up the gear you own and your fighting skills. Weapons follow the same forge rules as the ember forge in the village.' },
  looks: { title: 'Mirror · Looks', kicker: 'BEDROOM · AT HOME', icon: '🪞', purpose: 'Body, height and ears. Hats, outfits and weapons are sold at the Little outfitters and worn from the wardrobe.' },
};
/** The indoor dress of a panel opened inside the cottage, or null (outdoors, or a panel with no indoor twin). */
export function indoorStore(type: string, inside: boolean, fromWardrobe = false): IndoorStore | null {
  if (!inside) return null;
  if (type === 'bag') return fromWardrobe ? INDOOR_STORES.wardrobe : null;
  return (INDOOR_STORES as Record<string, IndoorStore>)[type] ?? null;
}
/** The purpose line on top of the panel (main.ts localizes the body after, so the English source is fine here). */
export const purposeHtml = (store: IndoorStore) => `<p class="store-purpose"><span aria-hidden="true">${store.icon}</span><span>${store.purpose}</span></p>`;
/** Only clothes, pets and gear belong in the wardrobe. */
export const wardrobeItem = (item: { slot?: string } | undefined) => !!item?.slot;
