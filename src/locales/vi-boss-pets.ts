// Vietnamese for the boss companions (boss-pet-content.ts).
// Loaded only for Vietnamese players (locales/vi-pack.ts); the English text lives in the shared content module.
import { BOSS_PETS } from '../boss-pet-content.ts';
/** Vietnamese boss name and companion name for every BOSS_PETS key. */
export const BOSS_PET_NAMES: Record<string, { bossVi: string; vi: string }> = {
  bear: { bossVi: 'Gấu Vua', vi: 'Gấu Vua Con' },
  treant: { bossVi: 'Cây Cổ Thụ Nổi Giận', vi: 'Cây Cổ Thụ Con' },
  croc: { bossVi: 'Cá Sấu Chúa', vi: 'Cá Sấu Chúa Con' },
  mushking: { bossVi: 'Vua Nấm Khổng Lồ', vi: 'Vua Nấm Con' },
  cake: { bossVi: 'Vua Bánh Kem', vi: 'Vua Bánh Kem Con' },
  gingerbread: { bossVi: 'Người Bánh Gừng Khổng Lồ', vi: 'Người Bánh Gừng Con' },
  jellyqueen: { bossVi: 'Nữ Hoàng Thạch Dẻo', vi: 'Nữ Hoàng Thạch Dẻo Con' },
  yeti: { bossVi: 'Người Tuyết Yeti', vi: 'Người Tuyết Yeti Con' },
  mammoth: { bossVi: 'Voi Ma Mút Băng', vi: 'Voi Ma Mút Băng Con' },
  frostowl: { bossVi: 'Cú Băng Chúa Tể', vi: 'Cú Băng Con' },
  golem: { bossVi: 'Người Đá Magma', vi: 'Người Đá Magma Con' },
  dragon: { bossVi: 'Rồng Núi Lửa', vi: 'Rồng Núi Lửa Con' },
  robot: { bossVi: 'Robot Đồ Chơi Khổng Lồ', vi: 'Robot Đồ Chơi Con' },
  gorilla: { bossVi: 'Vua Khỉ Đột Rừng Xanh', vi: 'Khỉ Đột Rừng Con' },
  leviathan: { bossVi: 'Thuỷ Quái Leviathan', vi: 'Thuỷ Quái Con' },
  phoenix: { bossVi: 'Phượng Hoàng Sấm', vi: 'Phượng Hoàng Sấm Con' },
  shadowlord: { bossVi: 'Chúa Tể Bóng Tối', vi: 'Chúa Tể Bóng Tối Con' },
};
export const BOSS_PET_VI: Record<string, string> = Object.fromEntries(Object.entries(BOSS_PETS).flatMap(([key, b]) => [
  [`Little ${b.boss}`, BOSS_PET_NAMES[key].vi],
  [`A little companion won from ${b.boss}. It follows you and attacks nearby enemies.`, `Người bạn nhỏ nhận được khi hạ ${BOSS_PET_NAMES[key].bossVi}. Bé đi theo bạn và tấn công kẻ địch ở gần.`],
]));
