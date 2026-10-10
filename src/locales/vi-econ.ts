/** Round 28 (economy, news board, sound settings, fishing and watering rules) in Vietnamese. */
export const VI_ECON: Record<string, string> = {
  "Removes half of the crop's original growing time. Two uses ripen a newly planted non-tree crop. Fruit trees: up to 2 hours per dose.": 'Giảm thời gian chờ bằng một nửa thời gian sinh trưởng ban đầu của cây. Dùng hai lần làm cây mới trồng chín ngay, trừ cây ăn quả: mỗi lần giảm tối đa 2 giờ.',
  'Rerolls left today: {n}': 'Lượt đổi nhiệm vụ còn lại hôm nay: {n}',

  'Keep backpack on defeat': 'Giữ ba lô khi bị hạ',
  'Keep carried items when defeated. Existing dropped bags stay recoverable.': 'Giữ đồ mang theo khi bị hạ. Các túi đã rơi vẫn có thể nhặt lại.',
  'Your backpack is safe.': 'Ba lô của bạn vẫn an toàn.',
  'Fruit tree fertilizer': 'Phân bón cho cây ăn quả',
  'Each dose removes half the original growing time, up to 2 hours for fruit trees.': 'Mỗi lần bón giảm một nửa thời gian trồng ban đầu, tối đa 2 giờ với cây ăn quả.',
  'You have used all three rerolls today, or this task cannot be rerolled.': 'Bạn đã dùng hết ba lượt đổi hôm nay, hoặc nhiệm vụ này không thể đổi.',

  // Level gates (level-gates.ts, refusals.ts)
  'Needs level {level}': 'Cần cấp {level}',
  'Needs level {level}.': 'Cần đạt cấp {level}.',
  'Needs level {level} to wear.': 'Cần đạt cấp {level} để mặc.',
  // Fruit trees and fertilizer (tree-crops.ts, econ-ui.ts)
  'Fruit trees grow at their own pace. Fertilizer does not help them.': 'Cây ăn quả lớn theo nhịp riêng. Phân bón không giúp được chúng.',
  'Fruit trees grow at their own pace': 'Cây ăn quả lớn theo nhịp riêng',
  'Fertilizer does not help fruit trees. Use it on your other crops.': 'Phân bón không giúp cây ăn quả. Hãy dùng cho các cây trồng khác.',
  // Cook & sell all (item-views.ts, econ-ui.ts)
  '🔥 Cook & sell all → ϟ {amount}': '🔥 Nấu & bán hết → ϟ {amount}',
  'Cooked: ϟ {amount}': 'Nấu chín: ϟ {amount}',
  'Raw: ϟ {amount}': 'Để sống: ϟ {amount}',
  '+{amount} more by cooking': 'Nấu lên được thêm {amount}',
  'Cooked food sells for more. Cook it in the kitchen at home first.': 'Đồ nấu chín bán được giá hơn. Hãy nấu trong bếp ở nhà trước.',
  'Cooked and sold everything for {amount} energy.': 'Đã nấu và bán hết, được {amount} năng lượng.',
  // Sound settings (audio-settings.ts)
  'Music volume': 'Âm lượng nhạc',
  'The cottage radio and its tunes': 'Radio trong nhà và những giai điệu của nó',
  'Effects volume': 'Âm lượng hiệu ứng',
  'Taps, hits, splashes and chimes': 'Tiếng chạm, tiếng đánh, tiếng nước và tiếng chuông',
  'Vibration': 'Rung',
  'A little buzz on bites, hits and big moments (phones)': 'Rung nhẹ khi cá cắn câu, khi trúng đòn và lúc quan trọng (điện thoại)',
  'Turn up the music volume in Settings to hear the radio.': 'Tăng âm lượng nhạc trong Cài đặt để nghe radio.',
  // News board (news-board.ts)
  'News': 'Tin tức',
  'News board': 'Bảng tin',
  'News sections': 'Mục tin tức',
  'Coming soon': 'Sắp ra mắt',
  'NEW': 'MỚI',
  'Earlier updates': 'Các bản cập nhật trước',
  'No news yet.': 'Chưa có tin nào.',
  'More plans are on the way.': 'Còn nhiều kế hoạch đang chờ.',
  'WHAT IS NEW IN ZOO GARDEN': 'CÓ GÌ MỚI Ở ZOO GARDEN',
  // Watering a friend's crops (visit-rules.ts, server/action-service.mjs)
  '💧 You watered the plant: 10% less remaining growing time. +{xp} XP · {count} waterings left in this garden today.': '💧 Bạn đã tưới cây: giảm 10% thời gian sinh trưởng còn lại. +{xp} XP · hôm nay còn {count} lần tưới ở khu vườn này.',
  'You have watered this garden ten times today. Come back tomorrow.': 'Hôm nay bạn đã tưới khu vườn này mười lần rồi. Mai quay lại nhé.',
  // Endgame goals, milestones, forge odds (econ round 2)
  'Milestone: level {level}! +{energy} energy and a moonstone. Onward, legend!': 'Cột mốc cấp {level}! +{energy} năng lượng và một đá mặt trăng. Tiến lên nào, huyền thoại!',
  'Answer a Rescue call': 'Đáp lại một Lời Kêu Cứu',
  'Win a Flag Rush match': 'Thắng một trận Giật Cờ',
  'Reach level 30': 'Đạt cấp 30',
  'Reach level 40': 'Đạt cấp 40',
  'Reach level 50': 'Đạt cấp 50',
  'Reach level 60': 'Đạt cấp 60',
  "Clear the Delvers' Vault": 'Vượt qua Hầm Thám Hiểm',
  'Hurt the Cinderpeak Colossus': 'Làm đau Cự Thạch Núi Tro',
  'Chance {chance}% · about ϟ {energy} per level on average': 'Cơ hội {chance}% · trung bình khoảng ϟ {energy} mỗi cấp',
  'On average about {tries} tries, ϟ {energy} for +1': 'Trung bình khoảng {tries} lần thử, ϟ {energy} cho +1',
};
