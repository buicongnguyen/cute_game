// Vietnamese for the four moves (moves.ts, skill-info.ts moveDescription, upgrade-bench.ts, main.ts).
export const MOVES_VI: Record<string, string> = {
  'Petal Rain': 'Mưa Cánh Hoa',
  'Sky Spin': 'Lốc Xoáy Trên Không',
  'Throw petals in an arc onto a marked spot {min} to {max} m away (your target, else the nearest enemy): they land after {time} s for ×{dmg} damage at the centre and ×{edge} within {r} m.':
    'Ném cánh hoa theo đường vòng cung xuống điểm đã đánh dấu cách {min} đến {max} m (mục tiêu của bạn, nếu không thì kẻ địch gần nhất): sau {time} giây cánh hoa rơi xuống, gây ×{dmg} sát thương ở tâm và ×{edge} trong vòng {r} m.',
  'In the air: Petal Rain, {n} shots straight down in a line, ×{dmg} damage each.':
    'Trên không: Mưa Cánh Hoa, {n} phát rơi thẳng xuống thành một hàng, mỗi phát gây ×{dmg} sát thương.',
  'Rush {d} m in a line, untouchable: each enemy within {w} m of your path takes ×{dmg} damage once, and ground marks cannot hurt you on the way.':
    'Lướt {d} m theo đường thẳng, bất khả xâm phạm: mỗi kẻ địch cách đường lướt không quá {w} m chịu ×{dmg} sát thương một lần, và các vùng cảnh báo trên mặt đất không làm bạn bị thương trên đường đi.',
  'In the air: Sky Step, the same dash at your height; steer and it turns once.':
    'Trên không: Bước Gió Trên Không, cú lướt y hệt ở độ cao của bạn; bẻ lái thì nó đổi hướng một lần.',
  'Slam a {r} m ring around you: ×{dmg} damage, enemies thrown up, large ones stunned {stun} s.':
    'Nện một vòng chấn động {r} m quanh bạn: ×{dmg} sát thương, kẻ địch bị hất tung, kẻ to xác bị choáng {stun} giây.',
  'In the air: Sky Quake, a dive with a {r} m ring for ×{low} to ×{high} damage, more from higher.':
    'Trên không: Địa Chấn Từ Trời, cú lao xuống kèm vòng chấn động {r} m gây ×{low} đến ×{high} sát thương, càng cao càng mạnh.',
  'Three quick hits in a {r} m arc ahead: ×{a}, ×{b} and ×{c} damage; the third launches small enemies.':
    'Ba cú đánh nhanh theo hình quạt {r} m phía trước: ×{a}, ×{b} và ×{c} sát thương; cú thứ ba hất tung kẻ địch nhỏ.',
  'In the air: Sky Spin, one spin for ×{dmg} damage on every enemy within {r} m.':
    'Trên không: Lốc Xoáy Trên Không, một vòng xoay gây ×{dmg} sát thương lên mọi kẻ địch trong vòng {r} m.',
  'Each level: +10% damage and +0.12 m splash radius.': 'Mỗi cấp: +10% sát thương và +0,12 m bán kính nổ.',
  'Each level: +8% damage and +0.3 m ring radius.': 'Mỗi cấp: +8% sát thương và +0,3 m bán kính vòng chấn động.',
};
/** The help topic 'Four moves' (help-topics.ts): its Vietnamese title and text. */
export const MOVES_HELP_VI = ['Bốn chiêu thức', 'Q ném cánh hoa theo đường vòng cung xuống một điểm đã đánh dấu, W lướt xuyên qua kẻ địch, E nện một vòng chấn động hất tung chúng, còn R đánh liền ba cú (vũ khí có tuyệt kỹ riêng thì giữ tuyệt kỹ đó ở R). Bố trí WASD dùng J/K/L/; theo cùng thứ tự. Nhảy lên trước thì mỗi chiêu đổi khác: Q thả ba phát rơi thẳng xuống, W lướt ở độ cao của bạn, E lao xuống với vòng chấn động rộng hơn, còn R xoay một vòng đánh trúng mọi phía. Trên điện thoại, nhấn Nhảy rồi trượt cùng ngón tay sang kỹ năng. Đánh trúng liên tiếp sẽ tạo chuỗi đòn: cú Mưa Đấm thứ ba hất tung kẻ địch nhỏ, và một cú Địa Chấn hoặc cú lao xuống sau ba đòn trúng là đòn kết liễu. Cải trang thay đổi cả bốn kỹ năng.'] as const;
