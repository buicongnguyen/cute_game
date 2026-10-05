// A little companion for every regular boss (titans have their own, titan-content.ts). Won on the first defeat, then 10% a kill.
import type { ItemDef } from './content.ts';
type Shot = 'bubble' | 'ice' | 'rainbow' | undefined;
/** key = ENEMY_TYPES key; flying pets are drawn hovering (pet-pen.ts FLYING_PETS). */
export const BOSS_PETS: Record<string, { boss: string; icon: string; vi: string; stats: Record<string, number>; shot?: Shot; flying?: boolean; sell: number }> = {
  bear: { boss: 'King Bear', icon: '🐻', vi: 'Gấu Vua Con', stats: { hp: 40, def: 6 }, sell: 600 },
  treant: { boss: 'Ancient Treant', icon: '🌳', vi: 'Cây Cổ Thụ Con', stats: { hp: 45, regen: 1 }, sell: 620 },
  croc: { boss: 'Crocodile King', icon: '🐊', vi: 'Cá Sấu Chúa Con', stats: { atk: 8, def: 4 }, sell: 640 },
  mushking: { boss: 'Mushroom King', icon: '🍄', vi: 'Vua Nấm Con', stats: { hp: 40, regen: 1 }, sell: 620 },
  cake: { boss: 'Cake King', icon: '🍰', vi: 'Vua Bánh Kem Con', stats: { hp: 45, speed: 0.05 }, sell: 660 },
  gingerbread: { boss: 'Gingerbread Giant', icon: '🍪', vi: 'Người Bánh Gừng Con', stats: { def: 8, hp: 30 }, sell: 660 },
  jellyqueen: { boss: 'Jelly Queen', icon: '🍮', vi: 'Nữ Hoàng Thạch Dẻo Con', stats: { hp: 50, regen: 1 }, shot: 'bubble', sell: 680 },
  yeti: { boss: 'Snow Yeti', icon: '☃️', vi: 'Người Tuyết Yeti Con', stats: { def: 9, hp: 40 }, shot: 'ice', sell: 700 },
  mammoth: { boss: 'Ice Mammoth', icon: '🦣', vi: 'Voi Ma Mút Băng Con', stats: { hp: 60, def: 6 }, shot: 'ice', sell: 720 },
  frostowl: { boss: 'Frost Owl', icon: '🦉', vi: 'Cú Băng Con', stats: { atk: 8, crit: 0.03 }, shot: 'ice', flying: true, sell: 740 },
  golem: { boss: 'Magma Golem', icon: '🪨', vi: 'Người Đá Magma Con', stats: { def: 10, hp: 50 }, sell: 760 },
  dragon: { boss: 'Volcano Dragon', icon: '🐉', vi: 'Rồng Núi Lửa Con', stats: { atk: 12, crit: 0.04 }, flying: true, sell: 880 },
  robot: { boss: 'Giant Toy Robot', icon: '🤖', vi: 'Robot Đồ Chơi Con', stats: { atk: 9, def: 5 }, sell: 700 },
  gorilla: { boss: 'Jungle Gorilla', icon: '🦍', vi: 'Khỉ Đột Rừng Con', stats: { atk: 11, hp: 40 }, sell: 780 },
  leviathan: { boss: 'Ocean Leviathan', icon: '🐋', vi: 'Thuỷ Quái Con', stats: { hp: 70, speed: 0.08 }, shot: 'bubble', sell: 840 },
  phoenix: { boss: 'Thunder Phoenix', icon: '🦅', vi: 'Phượng Hoàng Sấm Con', stats: { atk: 12, speed: 0.08 }, shot: 'rainbow', flying: true, sell: 860 },
  shadowlord: { boss: 'Shadow Lord', icon: '🦇', vi: 'Chúa Tể Bóng Tối Con', stats: { atk: 13, crit: 0.05 }, flying: true, sell: 900 },
};
export const BOSS_PET_IDS = Object.keys(BOSS_PETS).map(k => `pet_b_${k}`);
export const BOSS_PET_CHANCE = 0.1;
export const BOSS_PET_ITEMS: Record<string, ItemDef> = Object.fromEntries(Object.entries(BOSS_PETS).map(([key, b]) => [`pet_b_${key}`, {
  type: 'pet', slot: 'pet', sell: b.sell, rare: true, stats: b.stats,
  pet: { scale: 0.09, dmg: 0.4, cd: 1.5, ...(b.shot ? { shot: b.shot } : {}) },
  name: `Little ${b.boss}`, icon: b.icon,
  desc: `A little companion won from ${b.boss}. It follows you and attacks nearby enemies.`,
} as ItemDef]));
export const BOSS_PET_LOOT: Record<string, [string, number, number, number][]> = Object.fromEntries(Object.keys(BOSS_PETS).map(k => [k, [[`pet_b_${k}`, BOSS_PET_CHANCE, 1, 1]]]));
export const BOSS_PET_VI: Record<string, string> = Object.fromEntries(Object.entries(BOSS_PETS).flatMap(([, b]) => [
  [`Little ${b.boss}`, b.vi],
  [`A little companion won from ${b.boss}. It follows you and attacks nearby enemies.`, `Người bạn nhỏ nhận được khi hạ ${b.boss}. Bé đi theo bạn và tấn công kẻ địch ở gần.`],
]));
