# Pond fish and forest hawks

This is an additional local-game activity, not a claim about the reference game's hunting rules.

Buy the **Hunting harpoon** from **Outfitters → Weapons** for **1,000 energy**. Equip it from the backpack and tap an ordinary fish swimming in a pond, or use **Hunt** to select a fish in range. The weapon is reusable: it consumes no ammunition. It has 11 m range, 1.3-second throw cooldown, +100 attack and supports normal weapon forging. Each caught pond fish returns after 18 seconds.

Fish hunting uses only the harpoon in this release. Bows retain their existing combat behavior. Harpoon hunting does not reveal mysterious shadows or create giant catches; equip a rod from the backpack to use the existing line-fishing minigame. Ordinary hunting fish occupy canonical pond slots; their availability is separate from line-fishing silhouettes. Online rewards and cooldowns are checked by the action service; a hosted service still needs deployment and multi-client testing.

Six **Great Forest Hawks** live in Mushroom Forest, outside Clover Village's safe area. They are flying enemies with 160 HP, 36 base EXP and the existing charger attack behavior. Harpoons and other weapons can fight them. Each defeat guarantees 1–2 feathers and has a 70% chance of 1–2 meat before normal loot modifiers. Their six roster entries append after all existing home enemies and the home Titan, preserving existing enemy IDs and save/authority references.

## Vietnamese guide

Mua **Lao săn ba chĩa** tại **Cửa hàng Trang bị → Vũ khí** với **1.000 năng lượng**, rồi trang bị từ túi đồ. Chạm cá thường đang bơi trong ao hoặc nhấn **Săn** để chọn cá trong tầm. Lao dùng nhiều lần, không cần đạn; tầm phóng 11 m, hồi sau 1.3 giây, cộng 100 tấn công và có thể cường hóa như vũ khí khác. Cá đã săn xuất hiện lại sau 18 giây.

Bản này chỉ dùng lao để săn cá. Cung vẫn dùng trong chiến đấu như trước. Săn bằng lao không bắt được bóng cá bí ẩn hay tạo cá siêu khổng lồ; hãy trang bị cần câu từ túi đồ để chơi câu bằng dây. Cá thường để săn có vị trí riêng trong từng ao, độc lập với bóng cá bí ẩn. Khi chơi online, máy chủ kiểm tra phần thưởng và thời gian hồi; dịch vụ online vẫn cần triển khai và kiểm thử với nhiều người chơi.

Có sáu **Diều hâu rừng lớn** bay trong Rừng Nấm, ngoài vùng an toàn của làng. Mỗi con có 160 máu và cho 36 EXP cơ bản. Có thể dùng lao hoặc vũ khí khác để đánh. Mỗi lần hạ gục luôn cho 1–2 lông vũ và có 70% cơ hội nhận 1–2 thịt, trước các hệ số phần thưởng thông thường.

## Art provenance and rendering limits

- `art/blender/kit/build_forest_birds.py` adapts the wing shoulder/elbow/tip layout, tail fan and hawk palette from the local `3d_astra/github-io/src/ambient-life.js` function `birdGeometry`. It adds closed volumes and a face suitable for this game's art style. `art/forest-birds-manifest.json` records the source hash, bounds, pivots and output budget. No reference-game artwork was downloaded.
- `public/assets/models/forest-birds.glb` is 45,504 bytes and 1,452 triangles. Its `forest_raptor` root has four rigid parts (`body`, `head`, `wing_l`, `wing_r`), baked to four runtime draw meshes. The two wings flap around their own pivots; no texture, skeleton or baked animation is required. The same geometry/materials are reused across six birds. Runtime scale is 1.45, deliberately larger than the usual small creature silhouettes; navigation uses a 0.8 m body radius rather than the full wingspan.
- Held harpoons reuse the existing `trident` model in `gear-weapons.glb`; `icons/items/harpoon.webp` reuses the trident icon. No additional weapon model download is required. `src/harpoon-art.ts` makes one recognizable three-pronged projectile mesh of 84 triangles, with baked vertex colors and no texture or shadow pass. It also supplies the fallback hand model while gear loads.
- Normal enemy collision and damage remain on the game's horizontal combat plane. This feature does not introduce flight steering or a separate aerial hit system. Six birds bound the added active-creature cost; long-session balancing and physical-phone performance still need user play-testing.

Automated coverage checks stable enemy IDs, matching client/server rosters, bird scale and rig parts, weapon purchase/equip/forge/loot, translations, reusable combat throws and projectile mesh budget. Root release checks additionally cover the fishing action and browser interaction.
