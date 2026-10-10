/**
 * The Delvers' Vault: a five-stage co-op dungeon behind the south gate (dungeon.ts runs it, dungeon-rules.ts holds the
 * pure rules, dungeon-patterns.ts the boss skills). Behaviour follows the reference's co-op dungeon (5 stages: clear the
 * creatures, beat the stage boss, step through the portal; zone difficulty 5, boss HP x1.4), with our own places,
 * creatures, bosses, wording and art.
 *
 * Numbers in the creature table are the definition values; dungeon-rules.ts scales them (x4.8 for difficulty 5, x1.4 and
 * x1.35 for bosses, then the party size).
 */
import type { ItemDef } from './content.ts';
import type { EnemyDefinition } from './enemy-types.ts';

export type DungeonSkill =
  | 'spore_trail' | 'cap_spikes' | 'cap_roll' | 'glow_beams'
  | 'toll_echo' | 'hush_bind' | 'feather_rain' | 'great_chime'
  | 'bubble_orbs' | 'polyp_bloom' | 'tentacle_sweep' | 'riptide_dash'
  | 'hammer_cross' | 'anvil_drop' | 'spark_flurry' | 'chain_cage'
  | 'prism_lances' | 'scatter_dust' | 'eclipse_wing' | 'starfall';

export interface DungeonStage {
  id: string; name: string; icon: string; tagline: string;
  /** Arena dressing: floor tint, sky (background) and fog colours, glow accent. */
  floor: string; sky: string; fog: string; accent: string;
  /** Creatures of this stage and how many of each. */
  mobs: Array<[string, number]>;
  boss: string;
  /** Rune seals the boss always drops (min, max). */
  seals: [number, number];
}
export interface DungeonBoss {
  id: string; name: string; icon: string;
  /** Definition HP, attack and attack cooldown (the reference's stage bosses use 3000/34/2.2 … 6800/50/1.9). */
  hp: number; atk: number; atkCd: number; xp: number;
  skills: readonly DungeonSkill[];
  pet: string;
}

const mob = (name: string, hp: number, damage: number, speed: number, xp: number, family: string, color: string, accent: string, behavior: EnemyDefinition['behavior'], extra: Partial<EnemyDefinition> = {}): EnemyDefinition =>
  ({ name, hp, damage, speed, xp, family, color, accent, behavior, reach: 1.6, sight: 30, radius: .7, cooldown: 1.5, windup: .45, boss: false, ...extra });
const boss = (name: string, hp: number, damage: number, cooldown: number, xp: number, family: string, color: string, accent: string, extra: Partial<EnemyDefinition> = {}): EnemyDefinition =>
  ({ name, hp, damage, speed: 2.6, xp, family, color, accent, behavior: 'boss', reach: 2.8, sight: 40, radius: 1.5, cooldown, windup: .6, boss: true, ...extra });

/** Creature definitions, keyed by type (registered into ENEMY_TYPES by dungeon.ts while the game runs). */
export const DUNGEON_ENEMIES: Record<string, EnemyDefinition> = {
  dg_gnat: mob('Lantern Gnat', 90, 14, 4.3, 30, 'winged', '#ffd86b', '#7fe7ff', 'melee', { flying: true, radius: .5, reach: 1.4, cooldown: 1.1, windup: .3 }),
  dg_truffle: mob('Truffle Beetle', 200, 18, 3.2, 40, 'quadruped', '#8a5a3c', '#ffcf6b', 'charger', { radius: .8, cooldown: 2.4, windup: .65 }),
  dg_tintoad: mob('Tin Toad', 150, 18, 2.8, 40, 'blob', '#9fb8c9', '#ffd23f', 'hopper', { radius: .65 }),
  dg_waxwisp: mob('Wax Wisp', 170, 20, 2.2, 45, 'blob', '#fff1d6', '#7a8cff', 'shooter', { reach: 9, radius: .55, cooldown: 2.2, windup: .5, flying: true }),
  dg_urchin: mob('Puff Urchin', 210, 22, 2.6, 50, 'blob', '#ff8ab3', '#ffe36b', 'melee', { radius: .7 }),
  dg_shrimp: mob('Squirt Shrimp', 180, 22, 2.4, 50, 'crab', '#ff9a5a', '#fff1cf', 'shooter', { reach: 9, radius: .6, cooldown: 2.1, windup: .5 }),
  dg_imp: mob('Cinder Imp', 260, 24, 3.4, 55, 'bunny', '#ff6a3a', '#ffd23f', 'melee', { radius: .6, cooldown: 1.3, windup: .35 }),
  dg_bellowbug: mob('Bellows Beetle', 230, 26, 2.2, 55, 'quadruped', '#5a4a58', '#ff9a3a', 'shooter', { reach: 9, radius: .75, cooldown: 2.3, windup: .55 }),
  dg_comet: mob('Comet Sprite', 220, 26, 4.4, 60, 'winged', '#9fd8ff', '#fff6a8', 'melee', { flying: true, radius: .5, reach: 1.4, cooldown: 1.1, windup: .3 }),
  dg_moonhare: mob('Moon Hare Guard', 300, 28, 3.3, 65, 'bunny', '#e8e4ff', '#b48cff', 'melee', { radius: .65 }),
  dg_morel: boss('Mother Morel', 3000, 34, 2.2, 900, 'mushroom', '#e8734a', '#ffe9a8', { speed: 2.3 }),
  dg_owl: boss('Bellwarden Owl', 3800, 38, 2.1, 1050, 'winged', '#6a5a8f', '#ffd23f', { speed: 2.6 }),
  dg_anemone: boss('Queen Anemone', 4600, 42, 2.0, 1250, 'flower', '#ff5fa2', '#7fe0ff', { speed: 2.2 }),
  dg_bellows: boss('Old Bellows', 5400, 46, 1.9, 1450, 'robot', '#6b5d6e', '#ff8a2b', { speed: 2.4 }),
  dg_empress: boss('Moon Moth Empress', 6800, 50, 1.9, 1800, 'winged', '#cfd7ff', '#8fe6ff', { speed: 2.7 }),
};

export const DUNGEON_BOSSES: Record<string, DungeonBoss> = {
  dg_morel: { id: 'dg_morel', name: 'Mother Morel', icon: '🍄', hp: 3000, atk: 34, atkCd: 2.2, xp: 900, skills: ['spore_trail', 'cap_spikes', 'cap_roll', 'glow_beams'], pet: 'pet_dg_morel' },
  dg_owl: { id: 'dg_owl', name: 'Bellwarden Owl', icon: '🦉', hp: 3800, atk: 38, atkCd: 2.1, xp: 1050, skills: ['toll_echo', 'hush_bind', 'feather_rain', 'great_chime'], pet: 'pet_dg_owl' },
  dg_anemone: { id: 'dg_anemone', name: 'Queen Anemone', icon: '🪸', hp: 4600, atk: 42, atkCd: 2.0, xp: 1250, skills: ['bubble_orbs', 'polyp_bloom', 'tentacle_sweep', 'riptide_dash'], pet: 'pet_dg_anemone' },
  dg_bellows: { id: 'dg_bellows', name: 'Old Bellows', icon: '🔨', hp: 5400, atk: 46, atkCd: 1.9, xp: 1450, skills: ['hammer_cross', 'anvil_drop', 'spark_flurry', 'chain_cage'], pet: 'pet_dg_bellows' },
  dg_empress: { id: 'dg_empress', name: 'Moon Moth Empress', icon: '🦋', hp: 6800, atk: 50, atkCd: 1.9, xp: 1800, skills: ['prism_lances', 'scatter_dust', 'eclipse_wing', 'starfall'], pet: 'pet_dg_empress' },
};

export const DUNGEON_STAGES: readonly DungeonStage[] = [
  { id: 'grotto', name: 'Glowcap Grotto', icon: '🍄', tagline: 'Soft lights, sharp spores.', floor: '#3f7f86', sky: '#16303f', fog: '#1f4a58', accent: '#7fe7ff', mobs: [['dg_gnat', 8], ['dg_truffle', 6]], boss: 'dg_morel', seals: [4, 6] },
  { id: 'belfry', name: 'Belfry of Hushed Bells', icon: '🔔', tagline: 'Every bell remembers a song.', floor: '#7a5e9a', sky: '#2a2044', fog: '#3a2e5e', accent: '#ffd23f', mobs: [['dg_tintoad', 8], ['dg_waxwisp', 6]], boss: 'dg_owl', seals: [5, 7] },
  { id: 'coral', name: 'Coral Throne', icon: '🪸', tagline: 'The tide bows to its queen.', floor: '#3aa0a8', sky: '#0e3550', fog: '#165468', accent: '#ff7ab8', mobs: [['dg_urchin', 8], ['dg_shrimp', 6]], boss: 'dg_anemone', seals: [6, 8] },
  { id: 'forge', name: 'Ember Forge', icon: '🔥', tagline: 'The old furnace never sleeps.', floor: '#a0583a', sky: '#381812', fog: '#50241a', accent: '#ffb13d', mobs: [['dg_imp', 9], ['dg_bellowbug', 6]], boss: 'dg_bellows', seals: [7, 9] },
  { id: 'observatory', name: 'Starfall Observatory', icon: '🌙', tagline: 'Where the moon keeps its secrets.', floor: '#4a5bb0', sky: '#111842', fog: '#1e2862', accent: '#d6b8ff', mobs: [['dg_comet', 9], ['dg_moonhare', 7]], boss: 'dg_empress', seals: [10, 14] },
];

/** Skill names (shown over the boss as it winds up) and telegraph colours. */
export const DUNGEON_SKILL_INFO: Record<DungeonSkill, { name: string; color: string }> = {
  spore_trail: { name: 'SPORE TRAIL', color: '#9dff5a' },
  cap_spikes: { name: 'CAP SPIKES', color: '#ff7a3a' },
  cap_roll: { name: 'ROLLING CAP', color: '#ffb13d' },
  glow_beams: { name: 'GLOW BEAMS', color: '#7fe7ff' },
  toll_echo: { name: 'ECHOING TOLL', color: '#ffd23f' },
  hush_bind: { name: 'HUSH BIND', color: '#b48cff' },
  feather_rain: { name: 'FEATHER RAIN', color: '#ff5a5a' },
  great_chime: { name: 'GREAT CHIME — RUN!', color: '#ff3b3b' },
  bubble_orbs: { name: 'BUBBLE ORBS', color: '#7fe0ff' },
  polyp_bloom: { name: 'POLYP BLOOM', color: '#ff7ab8' },
  tentacle_sweep: { name: 'TENTACLE SWEEP', color: '#ff3bd0' },
  riptide_dash: { name: 'RIPTIDE DASH', color: '#3fd0c0' },
  hammer_cross: { name: 'HAMMER CROSS', color: '#ff7a1f' },
  anvil_drop: { name: 'ANVIL DROP', color: '#ff3b3b' },
  spark_flurry: { name: 'SPARK FLURRY', color: '#ffb13d' },
  chain_cage: { name: 'CHAIN CAGE', color: '#c9a0ff' },
  prism_lances: { name: 'PRISM LANCES', color: '#8fe6ff' },
  scatter_dust: { name: 'MOON DUST — SPREAD OUT!', color: '#ff9af0' },
  eclipse_wing: { name: 'ECLIPSE WING — FIND THE LIGHT!', color: '#ff2a2a' },
  starfall: { name: 'STARFALL', color: '#fff36b' },
};

export type PetSkill = 'p_sporeburst' | 'p_glowbeam' | 'p_chime' | 'p_featherdrop' | 'p_bubblepop' | 'p_tentacle' | 'p_anvil' | 'p_sparks' | 'p_moonbeam' | 'p_stardust';
/** Pet skills: mult x skillDmg x the owner's attack, on the nearest creature within 12 m (dungeon.ts). */
export const PET_SKILLS: Record<PetSkill, { name: string; mult: number; radius: number; count: number; color: string; shape: 'nova' | 'drops' | 'line' }> = {
  p_sporeburst: { name: 'Spore Burst', mult: 2.2, radius: 3.2, count: 1, color: '#9dff5a', shape: 'nova' },
  p_glowbeam: { name: 'Glow Beam', mult: 1.4, radius: 1.2, count: 1, color: '#7fe7ff', shape: 'line' },
  p_chime: { name: 'Little Chime', mult: 1.6, radius: 2.8, count: 1, color: '#ffd23f', shape: 'nova' },
  p_featherdrop: { name: 'Feather Drop', mult: 1.1, radius: 1.4, count: 5, color: '#ff8a8a', shape: 'drops' },
  p_bubblepop: { name: 'Bubble Pop', mult: 1.1, radius: 1.2, count: 6, color: '#7fe0ff', shape: 'drops' },
  p_tentacle: { name: 'Tiny Tentacle', mult: 2.0, radius: 1.3, count: 1, color: '#ff7ab8', shape: 'line' },
  p_anvil: { name: 'Mini Anvil', mult: 2.6, radius: 2.4, count: 1, color: '#ff7a1f', shape: 'nova' },
  p_sparks: { name: 'Spark Shower', mult: 1.2, radius: 1.3, count: 5, color: '#ffb13d', shape: 'drops' },
  p_moonbeam: { name: 'Moonbeam', mult: 1.5, radius: 1.2, count: 1, color: '#8fe6ff', shape: 'line' },
  p_stardust: { name: 'Stardust', mult: 1.2, radius: 1.4, count: 6, color: '#fff36b', shape: 'drops' },
};
export interface DungeonPet { boss: string; skills: [PetSkill, PetSkill]; skillCd: number; skillDmg: number }
export const DUNGEON_PETS: Record<string, DungeonPet> = {
  pet_dg_morel: { boss: 'dg_morel', skills: ['p_sporeburst', 'p_glowbeam'], skillCd: 6, skillDmg: 2.2 },
  pet_dg_owl: { boss: 'dg_owl', skills: ['p_chime', 'p_featherdrop'], skillCd: 6, skillDmg: 2.1 },
  pet_dg_anemone: { boss: 'dg_anemone', skills: ['p_bubblepop', 'p_tentacle'], skillCd: 5.5, skillDmg: 2.3 },
  pet_dg_bellows: { boss: 'dg_bellows', skills: ['p_anvil', 'p_sparks'], skillCd: 5, skillDmg: 1.9 },
  pet_dg_empress: { boss: 'dg_empress', skills: ['p_moonbeam', 'p_stardust'], skillCd: 4.5, skillDmg: 1.7 },
};
export const DUNGEON_PET_IDS = Object.keys(DUNGEON_PETS);

/** The level the vault recommends; its companions need it to be worn (level-gates.ts). */
export const DUNGEON_LEVEL = 20;
export const DUNGEON_SEAL = 'dg_seal', DUNGEON_CHEST = 'deco_dgchest';
export const DUNGEON_ITEMS: Record<string, ItemDef> = {
  dg_seal: { name: 'Rune Seal', icon: '🔱', type: 'material', sell: 60, rare: true, desc: 'A warm little seal stamped with the vault keeper\'s rune. Delvers trade them like coins.' } as ItemDef,
  deco_dgchest: { name: 'Delver\'s Chest', icon: '🧰', type: 'decor', sell: 260, collider: .7, desc: 'A treasure chest carried up from the deepest vault. It still hums with starlight.' } as ItemDef,
  pet_dg_morel: { name: 'Little Morel', icon: '🍄', type: 'pet', slot: 'pet', sell: 1500, rare: true, legend: true, stats: { def: 20, hp: 120 }, pet: { scale: .16, dmg: .6, cd: 1.3, shot: 'ice' }, desc: 'A sleepy mushroom from the Glowcap Grotto. Now and then it bursts spores or shines a glow beam.' } as ItemDef,
  pet_dg_owl: { name: 'Little Bellwarden', icon: '🦉', type: 'pet', slot: 'pet', sell: 1550, rare: true, legend: true, stats: { speed: .15 }, xp: .25, pet: { scale: .14, dmg: .7, cd: 1.1, shot: 'spike' }, desc: 'A tiny owl with a tiny bell. It rings little chimes and drops feathers on your foes.' } as ItemDef,
  pet_dg_anemone: { name: 'Little Anemone', icon: '🪸', type: 'pet', slot: 'pet', sell: 1650, rare: true, legend: true, stats: { atk: 16, crit: .08 }, light: true, pet: { scale: .13, dmg: .9, cd: .9, shot: 'bubble' }, desc: 'A wiggly sea anemone from the Coral Throne. It pops bubbles and flicks tiny tentacles.' } as ItemDef,
  pet_dg_bellows: { name: 'Little Bellows', icon: '🔨', type: 'pet', slot: 'pet', sell: 1650, rare: true, legend: true, stats: { atk: 16, hp: 40 }, pet: { scale: .14, dmg: 1, cd: .8, shot: 'fire' }, desc: 'A pocket forge golem. It drops a mini anvil and showers sparks when you fight.' } as ItemDef,
  pet_dg_empress: { name: 'Little Moon Moth', icon: '🦋', type: 'pet', slot: 'pet', sell: 1800, rare: true, legend: true, stats: { atk: 15, crit: .1 }, luck: .3, pet: { scale: .12, dmg: 1.1, cd: .9, shot: 'rainbow' }, desc: 'A moth with moonlight on its wings. It sends moonbeams and sprinkles stardust.' } as ItemDef,
};

