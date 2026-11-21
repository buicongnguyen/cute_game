/**
 * The music of each place (AAA-PLAN WP13): one entry per state of the music director (music-director.ts). A tune is
 * data for the live score (music-score.ts): a key, a mode, a tempo and a few 8-bar chord progressions; the melody over
 * them is drawn from the tune's seed, so nothing here is a written melody and nothing is downloaded. Round 2's recorded
 * tracks only add `file` to an entry.
 *
 *   village                             the theme's own key and tempo; it plays once, then rests 60 to 120 s
 *   forest, meadow, swamp, canyon       the wild regions of the home planet (HOME_ZONES names them)
 *   candy ... shadow                    one per planet
 *   danger                              not a tune: the drums that join the tune of the place when something gives chase
 *   boss                                its own fast minor tune with its own beat
 *   space, ctf, rescue, vault           the flight between planets and the three modes (MODES names them)
 *   indoors                             nothing: the cottage radio is the music there (features/radio.ts)
 *
 * This file imports nothing.
 */
export interface Tune {
  /** The key as a MIDI note (48 = C3) and the mode: 0 major, 1 dorian, 2 phrygian, 3 lydian, 4 mixolydian, 5 minor. */
  key?: number; mode?: number;
  /** Beats a minute; how far every second eighth note is pushed late (0 = straight, .15 = a bounce). */
  bpm?: number; swing?: number;
  /** The 8-bar progressions: one scale degree (1 to 7) per bar. A tune without them plays nothing. */
  progs?: readonly string[];
  /** The marimba figure, one character per eighth note: 0, 1, 2 = the chord's root, third, fifth, 3 = the root above, '.' = a rest. */
  arp?: string;
  /** How many of the melody's notes sound (0 to 1). */
  lead?: number;
  /** The bass: 0 = root and fifth on the beats, 1 = the root twice a bar, 2 = a pulse of eighth notes. */
  bass?: number;
  /** Drums, one character per eighth note ('x' = a stroke): kick, shaker, tom. A tune's own beat always plays; `danger` lends its beat to the others. */
  beat?: readonly [string, string, string];
  /** This tune's volume beside the others (1 = as measured; promo/music-clips.mjs keeps them within 2 LU of the theme). */
  gain?: number;
  /** It plays this many 8-bar phrases, then rests between these two numbers of seconds. Without `rest` it plays on. */
  play?: number; rest?: readonly [number, number];
  /** A recorded track of this state (under public/assets/): asked for late, played once on arrival when it is there. */
  file?: string;
}

/** True: no live score anywhere, only the recorded theme (the one flag of AAA-PLAN section 9). */
export const THEME_ONLY = false;

/** The zone names of the home planet (world.ts) and their tunes. */
export const HOME_ZONES: Record<string, string> = { 'Clover Village': 'village', 'Mushroom Forest': 'forest', 'Blue Lake Meadow': 'meadow', 'Chomper Swamp': 'swamp', 'Redrock Canyon': 'canyon' };
/** The class a mode puts on the page's body (ctf.ts, rescue.ts, dungeon.ts) and its tune. */
export const MODES: Record<string, string> = { 'in-ctf': 'ctf', 'in-rescue': 'rescue', 'in-vault': 'vault' };

export const MUSIC: Record<string, Tune> = {
  village: { key: 48, mode: 0, bpm: 104, progs: ['15641564', '16451645', '14561451', '13451625'], arp: '01201201', lead: .85, bass: 0, play: 2, rest: [60, 120], file: 'audio/zoo-garden-theme.mp3' },
  forest: { key: 53, mode: 3, bpm: 92, swing: .12, progs: ['12121265', '15211521', '12651265', '16251621'], arp: '0.21.021', lead: .8, bass: 0 },
  meadow: { key: 55, mode: 0, bpm: 96, progs: ['14151415', '16431643', '15461451', '13641365'], arp: '01232101', lead: .75, bass: 1, gain: 1.15 },
  swamp: { key: 50, mode: 1, bpm: 84, progs: ['14141714', '17411741', '13411341', '14731471'], arp: '.0.1.2.1', lead: .7, bass: 1, gain: 1.4 },
  canyon: { key: 52, mode: 4, bpm: 108, progs: ['17411741', '14741474', '15741574', '17141715'], arp: '02120212', lead: .8, bass: 0 },
  candy: { key: 45, mode: 0, bpm: 120, swing: .14, progs: ['14511451', '16251625', '15641564', '12511451'], arp: '01201201', lead: .9, bass: 0 },
  ice: { key: 46, mode: 3, bpm: 76, progs: ['12121212', '15211521', '16251625', '13121312'], arp: '0..1..2.', lead: .6, bass: 1, gain: 1.35 },
  lava: { key: 48, mode: 2, bpm: 112, progs: ['12121232', '16711671', '12371237', '13211321'], arp: '02120212', lead: .75, bass: 2 },
  toy: { key: 50, mode: 0, bpm: 126, progs: ['15141514', '14151451', '16451645', '13461325'], arp: '03120312', lead: .9, bass: 0, gain: .92 },
  jungle: { key: 55, mode: 1, bpm: 116, swing: .1, progs: ['14141414', '17411714', '13471347', '14171413'], arp: '0.20.212', lead: .8, bass: 0, beat: ['', '.x.x.x.x', ''], gain: .92 },
  ocean: { key: 51, mode: 0, bpm: 80, progs: ['16411641', '14161415', '13461346', '15461564'], arp: '01232101', lead: .7, bass: 1, gain: 1.3 },
  cloud: { key: 45, mode: 3, bpm: 72, progs: ['12151215', '16211621', '15121512', '13261325'], arp: '0..1..2.', lead: .6, bass: 1, gain: 1.38 },
  shadow: { key: 54, mode: 5, bpm: 88, progs: ['16371637', '17671767', '14651465', '16711671'], arp: '.0.1.2.1', lead: .7, bass: 1, gain: 1.3 },
  danger: { beat: ['x..x..x.', '.x.x.x.x', '...............x'] },
  boss: { key: 50, mode: 5, bpm: 138, progs: ['17671767', '16171617', '14171415', '16371657'], arp: '02020212', lead: .8, bass: 2, beat: ['x..x..x.', 'xxxxxxxx', '....x......xx.x.'] },
  space: { key: 48, mode: 3, bpm: 66, progs: ['12121212', '15121512', '13121316', '16251621'], arp: '0...2...', lead: .5, bass: 1, gain: 1.42 },
  ctf: { key: 52, mode: 4, bpm: 132, progs: ['17411741', '14151415', '15741574', '17141514'], arp: '01201201', lead: .85, bass: 0, beat: ['x...x...', '.x.x.x.x', ''], gain: .92 },
  rescue: { key: 45, mode: 5, bpm: 124, progs: ['16371637', '14171417', '16711671', '13671365'], arp: '02120212', lead: .8, bass: 2, beat: ['x..x..x.', '..x...x.', ''] },
  vault: { key: 49, mode: 2, bpm: 100, progs: ['12121212', '13211321', '16711671', '12371231'], arp: '.0.1.2.1', lead: .65, bass: 1, gain: 1.2 },
  indoors: {},
};
