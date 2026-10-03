import { t, localizeHtml } from './i18n.ts';
import { ITEMS, type ItemDef, type Inventory } from './content.ts';
import type { SaveState } from './model.ts';
import { farmHelperRow } from './farm-helper-ui.ts';
import { productPace } from './difficulty.ts';
import { BREEDS, coatOf, ANIMALS, ANIMAL_KINDS, ANIMAL_LIFESPAN_MS, productCount, productCapacity, productDuration, speciesPenCost, FARM_DISHES, PEN_BUILD, expired, lifetimeLeft, productFor, canBuildPen, penBuilt, animalCount, canBuyAnimal, canCookDish, canFeed, farmOf, playerCanFeed, playerFeedCrop, priceOf, growth, isAdult, penCapacity, penExpandCost, productProgress, productReady, timeLeft, type Animal, type Collected } from './farm.ts';

/**
 * The animal pen's panel and the kitchen's farm recipes, as HTML (main.ts opens them and routes the buttons).
 * Kept out of main.ts so the farm stays one feature in its own files.
 */
/** The crop the player picked for the Feed buttons (any crop); null = the feed-crop default (farm.ts playerFeedCrop). */
export const feedChoice: { id: string | null } = { id: null };
const loose = (s: SaveState, id: string) => (s.bag[id] ?? 0) - (Object.values(s.gear).includes(id) ? 1 : 0) > 0;
export function chosenFeed(s: SaveState) { return feedChoice.id && ITEMS[feedChoice.id]?.type === 'crop' && loose(s, feedChoice.id) ? feedChoice.id : playerFeedCrop(s); }
const feedOptions = (s: SaveState) => Object.keys(s.bag).filter(id => ITEMS[id]?.type === 'crop' && loose(s, id)).sort((a, b) => ITEMS[a].sell - ITEMS[b].sell || a.localeCompare(b));
export interface FarmUi { art(id: string, icon: string): string; esc(text: string): string; mini(id: string): string; chips(materials?: Inventory): string; effect(item: ItemDef): string }

const seconds = (ms: number) => { const s = Math.ceil(ms / 1000); return s >= 3600 ? t('{hours}h {minutes}m', { hours: Math.floor(s / 3600), minutes: Math.floor(s % 3600 / 60) }) : s >= 60 ? t('{minutes}m {seconds}s', { minutes: Math.floor(s / 60), seconds: s % 60 }) : t('{count}s', { count: s }); };
/** What the animal is doing, for its row and its meter: growing up, making its product, or waiting to be collected. */
export function animalStatus(a: Animal, now = Date.now()) {
  const d = ANIMALS[a.kind], product = ITEMS[d.product];
  if (a.kind === 'dog') return { progress: 1, text: t(a.pen ? 'Guarding crops · protected dog house · 30 bite damage' : 'Guarding crops · 18 bite damage'), ready: false };
  if (expired(a, now)) return { progress: 1, text: t('Lifespan ended. Meat ready! Tap the pen to collect.'), ready: true };
  const life = ' · ' + t('Life left: {time}', { time: seconds(lifetimeLeft(a, now)) });
  if (!isAdult(a, now)) return { progress: growth(a, now), text: t('Grows up in {time}', { time: seconds(timeLeft(a, now)) }) + (a.fedYoung ? t(' · fed') : '') + life, ready: false };
  if (productReady(a, now)) return { progress: 1, text: t('{name} ×{count}/{capacity} ready! Tap to collect.', { name: t(product.name), count: productCount(a, now), capacity: productCapacity(a) }) + life, ready: true };
  return { progress: productProgress(a, now), text: t('{name} in {time}', { name: t(product.name), time: seconds(timeLeft(a, now)) }) + (a.fed ? t(' · fed') : '') + life, ready: false };
}
/** Changes when the panel needs drawing again (an animal grew up, a product became ready, feed or energy changed). */
export function penSignature(s: SaveState, now = Date.now()) {
  return [penBuilt(s), s.energy, s.level, chosenFeed(s), chosenFeed(s) ? s.bag[chosenFeed(s)!] : 0, farmOf(s).penLevel, JSON.stringify(s.farm?.helper), ...farmOf(s).animals.map(a => `${a.uid}:${isAdult(a, now)}:${productCount(a, now)}:${a.pen}:${expired(a, now)}:${canFeed(a, now)}`)].join('|');
}
/** Moves the meters and times of an open pen panel without drawing it again. */
export function tickPen(root: ParentNode, s: SaveState, now = Date.now()) {
  for (const a of farmOf(s).animals) {
    const row = root.querySelector(`[data-animal="${a.uid}"]`); if (!row) continue;
    const st = animalStatus(a, now), fill = row.querySelector<HTMLElement>('.grow-meter > i'), text = row.querySelector('.animal-time');
    if (fill) fill.style.width = `${st.progress * 100}%`; if (text) text.textContent = st.text;
  }
}
/** The empty site's panel: what the pen gives, and the build button (level-gated, energy-priced). */
export function sitePenHtml(s: SaveState) {
  const check = canBuildPen(s);
  const button = check === 'level' ? `<button class="soft-button wide" disabled>🔒 ${t('Reach level {level} to build', { level: PEN_BUILD.level })}</button>`
    : `<button class="${check === 'ok' ? 'primary' : 'soft-button'} wide" data-action="build-pen">🔨 ${t('Build the animal pen · ϟ {price}', { price: PEN_BUILD.price })}</button>`;
  const kinds = ANIMAL_KINDS.map(k => `<span class="chip">${ANIMALS[k].babyIcon} ${t('{name} from level {level} · ϟ {price}', { name: t(ANIMALS[k].baby), level: ANIMALS[k].level, price: priceOf(s, k) })}</span>`).join('');
  return localizeHtml(`<p class="intro">Build a welcoming farm for chickens, ducks, cows and pigs. A guard dog keeps visitors away from ripe crops.</p><div class="chips farm-counts">${kinds}</div>${button}<p class="garden-tip">💡 Livestock produces while you are away and leaves meat after two real hours. Your guard dog waits by the pen at home, trots after you in the wilds and on other planets, and guards the garden either way.</p>`);
}
export function penHtml(s: SaveState, ui: FarmUi, now = Date.now()) {
  if (!penBuilt(s)) return sitePenHtml(s);
  const farm = farmOf(s), ready = farm.animals.filter(a => productReady(a, now)), crop = chosenFeed(s), hungry = farm.animals.filter(a => playerCanFeed(a, now)).length;
  const counts = ANIMAL_KINDS.map(k => `<span class="chip">${ANIMALS[k].icon} ${animalCount(s, k)}/${penCapacity(s, k)} ${t(ANIMALS[k].name)}</span>`).join('');
  const gathered = ready.reduce<Record<string, number>>((n, a) => { const id = productFor(a, now); n[id] = (n[id] || 0) + productCount(a, now); return n; }, {});
  const collect = ready.length ? `<button class="primary wide" data-action="collect-farm">🧺 ${t('Collect {count}:', { count: Object.values(gathered).reduce((a,b)=>a+b,0) })} ${Object.entries(gathered).map(([id, n]) => `${ui.mini(id)} ${n}`).join(' ')}</button>` : '';
  const feed = `<div class="garden-actions farm-feed"><span>${crop ? `${t('Feed:')} ${ui.mini(crop)} ${feedOptions(s).length > 1 ? `<select data-feed-choice aria-label="${ui.esc(t('Feed:'))}">${feedOptions(s).map(id => `<option value="${id}"${id === crop ? ' selected' : ''}>${ui.esc(t(ITEMS[id].name))} ×${s.bag[id]}</option>`).join('')}</select>` : `${ui.esc(t(ITEMS[crop].name))} ×${s.bag[crop]}`} ${feedChoice.id === crop ? '' : t('(your cheapest crop)')}` : feedOptions(s).length ? `${t('Feed:')} <select data-feed-choice aria-label="${ui.esc(t('Feed:'))}"><option value="" selected>${ui.esc(t('Pick a crop'))}</option>${feedOptions(s).map(id => `<option value="${id}">${ui.esc(t(ITEMS[id].name))} ×${s.bag[id]}</option>`).join('')}</select>` : 'Bring a crop from the garden to feed them: a fed animal finishes its current wait twice as fast.'}</span>${crop && hungry ? `<button class="sky-button" data-action="feed-all">${t('Feed all ({count})', { count: hungry })}</button>` : ''}</div>`;
  const rows = farm.animals.map((a, i) => {
    const d = ANIMALS[a.kind], adult = isAdult(a, now), dead = expired(a, now), product = productFor(a, now), st = animalStatus(a, now), name = dead ? t('{name} · Meat ready', { name: t(d.name) }) : t(adult ? d.name : d.baby);
    return `<div class="crop-row garden-row animal-row${st.ready ? ' ready' : ''}" data-animal="${a.uid}"><span class="crop-art">${dead ? ITEMS.meat.icon : adult ? d.icon : d.babyIcon}</span><div><strong>${name} ${i + 1} <span class="muted">· ${ui.esc(t(BREEDS[a.kind][coatOf(a)]))}</span>${st.ready ? ` <span class="chip chip-energy">${ui.mini(product)} ×${productCount(a, now)}</span>` : ''}</strong><div class="grow-meter"><i style="width:${st.progress * 100}%"></i></div><p class="muted animal-time">${ui.esc(st.text)}</p></div>${a.kind === 'dog' ? '' : st.ready ? `<button class="primary" data-action="collect-animal" data-id="${a.uid}" aria-label="${ui.esc(t('Collect from {name} {number}', { name, number: i + 1 }))}">${t('Collect ×{count}', { count: productCount(a, now) })}</button>` : `<button class="soft-button" data-action="feed-animal" data-id="${a.uid}" ${crop && playerCanFeed(a, now) ? '' : 'disabled'} aria-label="${ui.esc(t('Feed {name} {number}', { name, number: i + 1 }))}">Feed</button>`}</div>`;
  }).join('') || '<p class="empty-state">The farm is empty. Choose a new friend below.</p>';
  const shop = ANIMAL_KINDS.map(k => {
    const d = ANIMALS[k], check = canBuyAnimal(s, k), product = ITEMS[d.product];
    const label = check === 'level' ? `🔒 ${t('Level {level}', { level: d.level })}` : check === 'full' ? 'Pen full' : t('Buy · ϟ {price}', { price: priceOf(s, k) });
    const description = k === 'dog' ? t('Protects ripe crops from theft. No feeding, products or lifespan limit.') : t('Grows up in {time}, then gives {product} every {interval}.', { time: seconds(d.growMs), product: `${ui.mini(d.product)} ${t(product.name).toLowerCase()}`, interval: seconds(d.productMs * productPace(s)) });
    return `<div class="crop-row garden-row farm-shop-row${check === 'level' ? ' locked' : ''}"><span class="crop-art">${d.babyIcon}</span><div><strong>${t(d.baby)}${d.baby !== d.name ? ' → ' + t(d.name) : ''}</strong><p>${description}</p>${k === 'dog' ? '' : `<p class="muted">${t('Lifespan: {time}. Collect meat when it ends.', { time: seconds(ANIMAL_LIFESPAN_MS) })}</p><div class="chips"><span class="chip chip-xp">✨ ${t('{count} XP each', { count: d.xp })}</span><span class="chip chip-energy">${ui.mini(d.product)} ϟ ${product.sell}</span></div>`}</div><button class="${check === 'ok' ? 'primary' : 'soft-button'}" data-action="buy-animal" data-kind="${k}" ${check === 'ok' || check === 'energy' ? '' : 'disabled'}>${label}</button></div>`;
  }).join('');
  const cost = penExpandCost(s);
  const grow = cost === null ? '<p class="muted">Your pen is as big as it gets.</p>' : `<button class="${s.energy >= cost ? 'primary' : 'soft-button'} wide" data-action="expand-pen">➕ ${t('Bigger pen: +{chickens} chickens, +{ducks} ducks, +{cows} cows, +{pigs} pigs (ϟ {cost})', { chickens: ANIMALS.chicken.capStep, cows: ANIMALS.cow.capStep, ducks: ANIMALS.duck.capStep, pigs: ANIMALS.pig.capStep, cost })}</button>`;
  const pens = ANIMAL_KINDS.map(kind => {
    const cost = speciesPenCost(s, kind), name = t(ANIMALS[kind].name);
    return `<div class="garden-actions farm-species-pen"><span>${ANIMALS[kind].icon} ${t('{name} shelter', { name })}<small>${t(kind === 'dog' ? 'Guard bite damage rises from 18 to 30.' : 'Stores 5 products instead of 3; production takes 70% of the normal time.')}</small></span>${cost === null ? `<span class="chip">✓ ${t('Built')}</span>` : `<button class="soft-button" data-action="build-species-pen" data-kind="${kind}" ${s.energy < cost ? 'disabled' : ''}>${t('Build · ϟ {price}', { price: cost })}</button>`}</div>`;
  }).join('');
  return localizeHtml(`<div class="chips farm-counts">${counts}</div>${farmHelperRow(s)}${collect}${feed}<div class="crop-list">${rows}</div><div class="section-label">NEW FRIENDS</div><div class="crop-list">${shop}</div>${grow}<div class="section-label">${t('SPECIES SHELTERS')}</div>${pens}<p class="garden-tip">${t('Farm clock: 1 game hour = 1 real minute. Production continues while you are away.')}</p><p class="garden-tip">💡 Livestock produces while you are away and leaves meat after two real hours. Your guard dog waits by the pen at home, trots after you in the wilds and on other planets, and guards the garden either way. Sell the products at the market or cook them at the kitchen.</p>`);
}
/** One summary line for a collect: "Collected 3: 2 eggs, 1 milk." */
export function collectText(list: readonly Collected[]) {
  const n: Record<string, number> = {}; for (const c of list) n[c.item] = (n[c.item] || 0) + 1;
  return t('Collected {count}: {items}.', { count: list.length, items: Object.entries(n).map(([id, k]) => `${k} ${t(ITEMS[id].name.toLowerCase() + (k > 1 && ['egg','duck_egg','truffle'].includes(id) ? 's' : ''))}`).join(', ') });
}
/** The kitchen's farm recipes (cards like the roasting ones), or '' when no farm product was ever owned. */
export function dishesHtml(s: SaveState, ui: FarmUi) {
  if (!FARM_DISHES.some(d => Object.keys(d.materials).some(m => s.collection[m] || s.bag[m]))) return '';
  return localizeHtml(`<div class="section-label">FROM YOUR ANIMAL PEN</div><div class="shop-grid">${FARM_DISHES.map(d => {
    const item = ITEMS[d.id];
    return `<div class="shop-item"><span class="shop-icon">${ui.art(d.id, item.icon)}</span><div><strong>${ui.esc(t(item.name))}</strong><p>${ui.esc(ui.effect(item))}</p>${ui.chips(d.materials)}</div><button class="primary" data-action="cook-dish" data-item="${d.id}" ${canCookDish(s, d.id) ? '' : 'disabled'}>Cook</button></div>`;
  }).join('')}</div>`);
}
