// Vietnamese for the Dawn star dancer disguise (dz_dawnstar: content.ts, combat.ts DZ, skill-info.ts).
// DAWNSTAR_ITEMS_VI is catalog text (merged into VI_CATALOG like the dye names: tests/catalog-locale.test.ts wants every
// item's name and description and every disguise skill's name there).
export const DAWNSTAR_ITEMS_VI: Record<string, string> = {
  'Dawn star dancer': 'Cải Trang Vũ Công Sao Mai',
  '+40 health · +10% speed': '+40 máu · +10% tốc độ',
  'Ribbon lasso': 'Thòng Lọng Ruy Băng',
  'Morning glow': 'Nắng Mai Rạng Rỡ',
  'Sparkle step': 'Bước Nhảy Lấp Lánh',
  'Star shower': 'Mưa Sao Băng',
};
/**
 * The four skill tips and the buff chip (merged into VI_PACK by vi-pack.ts). The keys are the English sentences as
 * skill-info.ts builds them from combat.ts DZ, numbers included: tests/dawnstar.test.ts fails when a number changes
 * there and not here.
 */
export const DAWNSTAR_VI: Record<string, string> = {
  'Flick a ribbon through a 120° cone 6 m ahead: ×1.2 damage, and every enemy it catches is pulled 2.5 m toward you and tied up for 1.5 s.':
    'Vung dải ruy băng quét hình nón 120° xa 6 m phía trước: ×1,2 sát thương, mọi kẻ địch bị quấn trúng đều bị kéo 2,5 m về phía bạn và trói chặt 1,5 giây.',
  'Morning glow: no damage for 3 s and 15% health back, and your pets attack 50% faster for 6 s.':
    'Nắng mai rạng rỡ: không nhận sát thương 3 giây và hồi 15% máu, thú cưng của bạn đánh nhanh hơn 50% trong 6 giây.',
  'Step 8.4 m forward on sparkles, untouchable. The trail glitters for 5 s: enemies on it are slowed and take ×0.2 damage every 0.5 s.':
    'Bước lướt 8,4 m về phía trước trên vệt lấp lánh, bất khả xâm phạm. Vệt sáng còn lấp lánh 5 giây: kẻ địch đứng trên đó bị làm chậm và nhận ×0,2 sát thương mỗi 0,5 giây.',
  '8 stars fall in a ring 3.2 m around you, ×1.1 damage within 2.2 m each; then a great dawn star bursts: ×2.4 damage within 6 m, and enemies there are stunned 1.5 s.':
    '8 ngôi sao rơi thành vòng cách bạn 3,2 m, mỗi ngôi ×1,1 sát thương trong 2,2 m; rồi một ngôi sao mai lớn bừng nổ: ×2,4 sát thương trong 6 m, kẻ địch ở đó bị choáng 1,5 giây.',
  'Pets cheered on': 'Thú cưng hăng hái',
};
