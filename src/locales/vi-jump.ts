// Vietnamese for jumping and air combat (jump-rules.ts, main.ts, upgrade-bench.ts, hud-keys.ts).
export const JUMP_VI: Record<string, string> = {
  'Jump': 'Nhảy',
  'jump': 'nhảy',
  'Jump and air combat': 'Nhảy và đánh trên không',
  'Jump, air moves, dodging and combos.': 'Nhảy, đòn trên không, né đòn và chuỗi đòn.',
  'Off: the classic fight, with Space as the basic attack.': 'Tắt: lối đánh cũ, Space là đòn đánh thường.',
  'On in solo play. Online play uses the classic rules for now.': 'Bật khi chơi một mình. Chơi trực tuyến tạm thời dùng luật cũ.',
  'Space key': 'Phím Space',
  'Space: jump · F: attack': 'Space: nhảy · F: tấn công',
  'Space: attack · Left Shift: jump · F: attack': 'Space: tấn công · Shift trái: nhảy · F: tấn công',
  'HITS': 'ĐÒN',
  'FINISHER!': 'KẾT LIỄU!',
  'LAUNCH!': 'HẤT TUNG!',
  'DODGE': 'NÉ',
  'PERFECT DODGE!': 'NÉ HOÀN HẢO!',
  '🛡️ Blocked': '🛡️ Bị chặn',
  'Sky Step': 'Bước Gió Trên Không',
  'Sky Quake': 'Địa Chấn Từ Trời',
  'Single jump': 'Nhảy đơn',
  'Double jump': 'Nhảy đôi',
  'Triple jump': 'Nhảy ba',
  'A higher jump dodges more and hits harder from above. Bosses block hits from the ground and from a single jump; the double jump gets past their guard.': 'Nhảy càng cao càng dễ né và đánh từ trên xuống càng mạnh. Trùm chặn các đòn đánh từ mặt đất và từ độ cao nhảy đơn; nhảy đôi mới vượt qua được thế thủ của chúng.',
  'Double jump learned! Jump again in the air.': 'Đã học nhảy đôi! Hãy nhảy thêm lần nữa khi đang ở trên không.',
  'Triple jump learned! Jump three times in the air.': 'Đã học nhảy ba! Hãy nhảy ba lần liên tiếp trên không.',
  'You need a higher level or more energy and materials to improve your jump, or it is at its best.': 'Bạn cần cấp cao hơn hoặc thêm năng lượng và nguyên liệu để nâng cấp cú nhảy, hoặc nó đã đạt mức cao nhất.',
};
/** The help dialog's topic (help-topics.ts 'Jump and air combat'): its Vietnamese title and text, joined to the help table in vi-help-topics.ts. */
export const JUMP_HELP_VI = ['Nhảy và đánh trên không', 'Space để nhảy (nút Nhảy trên điện thoại), F để tấn công. Những vòng gợn sóng trên mặt đất kèm mũi tên trong lời cảnh báo là đòn mặt đất: hãy nhảy lên và chúng sẽ lướt qua bên dưới. Nhảy vào phút chót để né hoàn hảo và chắc chắn có đòn chí mạng. Trên không, tấn công khi đang bay lên để vung đòn nhanh, khi đang rơi để bổ nhào. Nâng cấp Nhảy ở bàn nâng cấp trong nhà: nhảy đôi ở cấp 10, nhảy ba ở cấp 25. Trùm ở các thế giới sau chặn đòn đánh từ mặt đất và từ độ cao nhảy đơn; hãy đánh chúng từ độ cao nhảy đôi.'] as const;
