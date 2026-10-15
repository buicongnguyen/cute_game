// Vietnamese for the arrival flags (place-flags.ts, place-flags-view.ts), the goals badge on the map (goals-ui.ts) and the
// eased story step (content.ts STORY_STEPS, docs/FIX-PLAN.md 5.5 and 5.6).
export const FLAGS_VI: Record<string, string> = {
  'Guardian Lake': 'Hồ Cá Thần',
  'Cinderpeak': 'Núi Tro',
  'Out of the west gate.': 'Ra khỏi cổng tây.',
  'Out of the south gate.': 'Ra khỏi cổng nam.',
  'Out of the north gate.': 'Ra khỏi cổng bắc.',
  'Out of the east gate.': 'Ra khỏi cổng đông.',
  'Just past the south gate, to the west of the road.': 'Ngay qua cổng nam, bên tây con đường.',
  'Just past the south gate, to the east of the road.': 'Ngay qua cổng nam, bên đông con đường.',
  'The big lake far south in the meadow.': 'Hồ lớn ở tận phía nam đồng cỏ.',
  'Far east in the canyon, where the Colossus stands.': 'Tận phía đông hẻm núi, nơi Cự Thạch đứng.',
  'Land there with the starship.': 'Hạ cánh ở đó bằng phi thuyền.',
  'Flag planted: {place}': 'Đã cắm cờ: {place}',
  'Places reached': 'Nơi đã đặt chân',
  'Walk somewhere new and a flag in your colour goes up there.': 'Đến một nơi mới là lá cờ màu của bạn sẽ được cắm ở đó.',
  'Next: {place} · {hint}': 'Tiếp theo: {place} · {hint}',
  'A flag stands at every place. Well travelled!': 'Nơi nào cũng đã có cờ của bạn. Đúng là nhà thám hiểm!',
  'Level up to land on new worlds.': 'Lên cấp để hạ cánh xuống hành tinh mới.',
  'Goals: places reached {r}, planets {p}, collection {c}%. {next}': 'Mục tiêu: nơi đã đặt chân {r}, hành tinh {p}, sưu tập {c}%. {next}',
};
/** Story step titles live in the catalog (vi-catalog.ts merges this table), next to the other steps. */
export const FLAGS_STORY_VI: Record<string, string> = {
  'Catch five fish': 'Câu 5 con cá',
};
