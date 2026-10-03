import type { Sound } from './sfx.ts';
/** Each skill's cast sound, so a blizzard, a thunder chain and a hammer blow no longer share one 'punch'. */
const SPECIAL: Record<string, Sound> = {
  fist: 'punch', crescent: 'swing', gore: 'swing', wave: 'swing', tsunami: 'splash', peastorm: 'shoot', bigbubble: 'pop', nova: 'shoot',
  blizzard: 'freeze', magma: 'boom', thunder: 'zap', bonk: 'boom', whirl: 'swing', starfall: 'magic', inferno: 'boom', laser: 'zap',
};
const DISGUISE: Record<string, readonly Sound[]> = {
  dz_superhero: ['magic', 'boom', 'zap', 'boom'], dz_ninja: ['poof', 'poof', 'swing', 'poof'], dz_mage: ['cast', 'magic', 'magic', 'magic'],
  dz_knight: ['magic', 'swing', 'alert', 'magic'], dz_mecha: ['shock', 'zap', 'zap', 'magic'], dz_dino: ['crit', 'swing', 'alert', 'boom'],
  dz_fairy: ['magic', 'magic', 'magic', 'magic'], dz_pirate: ['boom', 'snap', 'alert', 'boom'], dz_vampire: ['magic', 'poof', 'poof', 'magic'],
  dz_snowman: ['freeze', 'poof', 'freeze', 'freeze'],
};
export function skillSound(index: number, disguise?: string, special = 'fist'): Sound {
  if (disguise) return DISGUISE[disguise]?.[index] ?? 'punch';
  return index === 0 ? 'swing' : index === 1 ? 'swing' : index === 2 ? 'boom' : SPECIAL[special] ?? 'crit';
}
