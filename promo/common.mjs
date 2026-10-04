import { open } from './shoot.mjs';
export const CAST = [
  ['girl-teen-bunny-bare', '#ff7fa8', 'hat_party', 'armor_kimono', 'boots_cloud'],
  ['boy-tall-none-panda', '#6bc86b', 'hat_pirate', 'armor_pirate', undefined],
  ['sturdy-grown-cat-bare', '#ffb347', 'hat_viking', 'armor_knight', 'boots_lava'],
  ['slim-chibi-none-fox', '#a98bff', 'hat_chef', 'armor_chef', undefined],
  ['girl-tiny-none-kitty', '#ff6b6b', 'hat_halo', 'armor_angel', undefined],
  ['boy-teen-bunny-frog', '#54c8e8', undefined, 'armor_hawaii', 'boots_flipper'],
  ['slim-tall-cat-tiger', '#f2d24b', 'hat_samurai', 'armor_superhero', undefined],
  ['sturdy-chibi-none-penguin', '#e07fd0', 'hat_santa', 'armor_santa', undefined],
  ['girl-chibi-none-owl', '#7fd1ae', 'hat_graduate', 'armor_tux', 'boots_cowboy'],
];
export async function start(opts) {
  const o = await open(opts); const { page } = o;
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.click('[data-action="start"]');
  await page.waitForTimeout(6000);
  await page.addStyleTag({ content: '#hud,.toast,#keys-guide,#zone-banner{display:none!important}.promo{position:fixed;left:48px;bottom:44px;z-index:99999;padding:18px 28px;border-radius:22px;background:rgba(255,252,240,.92);color:#2f5d2a;font:800 34px/1.15 Nunito,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25);transition:opacity .6s}.promo small{display:block;font:700 20px/1.3 Nunito,system-ui,sans-serif;color:#7a6a3a;margin-top:6px}.promo b{color:#f2a010}' });
  return o;
}
export const caption = (page, title, sub) => page.evaluate(([t, s]) => { document.querySelector('.promo')?.remove(); if (!t) return; const d = document.createElement('div'); d.className = 'promo'; d.innerHTML = `<b>Zoo</b> Garden · ${t}<small>${s}</small>`; document.body.append(d); }, [title, sub]);
export const cast = page => page.evaluate(C => {
  const w = __zoo.world;
  C.forEach(([look, color, hat, outfit, boots], i) => w.addRemotePlayer('cast' + i, { x: -4.4 + i * 1.1, z: 3.6 + (i % 2 ? .9 : -.5) - Math.abs(i - 4) * .12, facing: (i - 4) * -.1, color, look, name: '', gear: { hat, outfit, boots }, planet: 'home' }));
}, CAST);
export const go = async (page, x, z, zoom, ms = 2800) => { await page.evaluate(([x, z, zoom]) => { const w = __zoo.world; w.position.set(x, 0, z); w.facing = 0; w.zoom = zoom; w.resize(); }, [x, z, zoom]); await page.waitForTimeout(ms); };
export const VI = process.env.LANG_CODE === 'vi';
export const SUF = VI ? '-vi' : '';
export const TXT = VI ? {
  crew: ['Mặc đồ cho cả nhóm', '12 mũ thú · hơn 100 bộ đồ, nón và giày'],
  garden: ['Trồng rau củ và cây ăn quả', 'Táo, xoài, dừa, hồng cầu vồng và nhiều nữa'],
  animals: ['Nuôi thú cưng ở nông trại', 'Gà, bò, vịt, heo và chú chó giữ nhà'],
  house: ['Ngôi nhà ấm cúng của bạn', 'Bạn bè trò chuyện, nấu ăn và nghỉ ngơi cùng bạn'],
  helpers: ['Bạn giúp việc chăm vườn, nấu ăn và trò chuyện', 'Cả nhóm lo khu vườn khi bạn đi khám phá'],
  intro: ['Lớn lên một chút. Khám phá thật nhiều.', 'Nông trại 3D ấm áp đầy phiêu lưu'],
  tag: 'lớn lên một chút. khám phá thật nhiều.',
} : {
  crew: ['Dress up your crew', '12 hoods · 100+ outfits, hats and boots'],
  garden: ['Grow crops and fruit trees', 'Apples, mangoes, coconuts, rainbow roses and more'],
  animals: ['Raise happy farm animals', 'Chickens, cows, ducks, pigs and a loyal guard dog'],
  house: ['Your cosy cottage', 'Friends chat, cook and rest right beside you'],
  helpers: ['Helpers that work, cook and chat', 'Your crew tends the garden while you explore'],
  intro: ['Grow a little. Wander a lot.', 'A cosy 3D farm adventure'],
  tag: 'grow a little. wander a lot.',
};
