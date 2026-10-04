import { open } from './shoot.mjs';
const { browser, page } = await open();
page.on('pageerror', e => console.log('ERR', e.message));
await page.click('[data-action="start"]');
await page.waitForTimeout(6000);
await page.addStyleTag({ content: '#hud,#title-screen,.toast,#house-bubble,[id*="toast"]{display:none!important}' });
const gear = await page.evaluate(() => { const by = {}; for (const [id, it] of Object.entries(__zoo.state ? (window.__items ?? {}) : {})) {} return null; });
// Cast of avatars: different looks and outfits.
await page.evaluate(() => {
  const w = __zoo.world;
  const looks = ['girl-teen-bunny-bare', 'boy-tall-none-panda', 'sturdy-grown-cat-bare', 'slim-chibi-none-fox', 'girl-tiny-none-kitty', 'boy-teen-bunny-frog', 'slim-tall-cat-tiger', 'sturdy-chibi-none-penguin', 'girl-chibi-none-owl'];
  const colors = ['#ff7fa8', '#6bc86b', '#ffb347', '#a98bff', '#ff6b6b', '#54c8e8', '#f2d24b', '#e07fd0', '#7fd1ae'];
  const hats = ['hat_straw', 'hat_cowboy', undefined, 'hat_bear', undefined, 'hat_straw', undefined, 'hat_cowboy', undefined];
  const outfits = ['armor_chef', 'armor_cloud', 'armor_leather', 'armor_space', 'armor_chef', 'armor_cloud', 'armor_leather', 'armor_space', 'armor_cloud'];
  const boots = ['boots_cloud', undefined, 'boots_lava', 'boots_cloud', undefined, 'boots_lava', 'boots_cloud', undefined, 'boots_lava'];
  looks.forEach((look, i) => {
    const row = i % 2, col = Math.floor(i / 2);
    w.addRemotePlayer('cast' + i, { x: -4.4 + i * 1.1, z: 3.6 + (row ? .9 : -.5) - Math.abs(i - 4) * .12, facing: (i - 4) * -.1, color: colors[i], look, name: '', gear: { hat: hats[i], outfit: outfits[i], boots: boots[i] }, planet: 'home' });
  });
  w.position.set(0, 0, 3.6); w.facing = 0; w.zoom = .68; w.resize();
});
await page.waitForTimeout(2500);
await page.screenshot({ path: 'promo/test-cast.png' });
await browser.close();
