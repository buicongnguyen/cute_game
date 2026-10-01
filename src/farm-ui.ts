import { ITEMS, type ItemDef, type Inventory } from './content.ts';
import type { SaveState } from './model.ts';
import { ANIMALS, ANIMAL_KINDS, FARM_DISHES, PEN_BUILD, canBuildPen, penBuilt, animalCount, canBuyAnimal, canCookDish, canFeed, farmOf, feedCrop, growth, isAdult, penCapacity, penExpandCost, productProgress, productReady, timeLeft, type Animal, type Collected } from './farm.ts';

/**
 * The animal pen's panel and the kitchen's farm recipes, as HTML (main.ts opens them and routes the buttons).
 * Kept out of main.ts so the farm stays one feature in its own files.
 */
export interface FarmUi { art(id: string, icon: string): string; esc(text: string): string; mini(id: string): string; chips(materials?: Inventory): string; effect(item: ItemDef): string }

const seconds = (ms: number) => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };
/** What the animal is doing, for its row and its meter: growing up, making its product, or waiting to be collected. */
export function animalStatus(a: Animal, now = Date.now()) {
  const d = ANIMALS[a.kind], product = ITEMS[d.product];
  if (!isAdult(a, now)) return { progress: growth(a, now), text: `Grows up in ${seconds(timeLeft(a, now))}${a.fedYoung ? ' · fed' : ''}`, ready: false };
  if (productReady(a, now)) return { progress: 1, text: `${product.name} ready! Tap the pen to collect.`, ready: true };
  return { progress: productProgress(a, now), text: `${product.name} in ${seconds(timeLeft(a, now))}${a.fed ? ' · fed' : ''}`, ready: false };
}
/** Changes when the panel needs drawing again (an animal grew up, a product became ready, feed or energy changed). */
export function penSignature(s: SaveState, now = Date.now()) {
  return [penBuilt(s), s.energy, s.level, feedCrop(s), feedCrop(s) ? s.bag[feedCrop(s)!] : 0, farmOf(s).penLevel, ...farmOf(s).animals.map(a => `${a.uid}:${isAdult(a, now)}:${productReady(a, now)}:${canFeed(a, now)}`)].join('|');
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
  const button = check === 'level' ? `<button class="soft-button wide" disabled>🔒 Reach level ${PEN_BUILD.level} to build</button>`
    : `<button class="${check === 'ok' ? 'primary' : 'soft-button'} wide" data-action="build-pen">🔨 Build the animal pen · ϟ ${PEN_BUILD.price}</button>`;
  const kinds = ANIMAL_KINDS.map(k => `<span class="chip">${ANIMALS[k].babyIcon} ${k === 'cow' ? 'calves' : 'chicks'} from level ${ANIMALS[k].level} · ϟ ${ANIMALS[k].price}</span>`).join('');
  return `<p class="intro">A roped-off plot waits here for a coop, troughs and a sandy yard. Once it stands you can raise chicks and calves: they roam the village, graze and peck, and give you eggs and milk.</p><div class="chips farm-counts">${kinds}</div>${button}<p class="garden-tip">💡 Your animals are friends, never food: meat still comes from wild creatures.</p>`;
}
export function penHtml(s: SaveState, ui: FarmUi, now = Date.now()) {
  if (!penBuilt(s)) return sitePenHtml(s);
  const farm = farmOf(s), ready = farm.animals.filter(a => productReady(a, now)), crop = feedCrop(s), hungry = farm.animals.filter(a => canFeed(a, now)).length;
  const counts = ANIMAL_KINDS.map(k => `<span class="chip">${ANIMALS[k].icon} ${animalCount(s, k)}/${penCapacity(s, k)} ${ANIMALS[k].name.toLowerCase()}s</span>`).join('');
  const gathered = ready.reduce<Record<string, number>>((n, a) => { const id = ANIMALS[a.kind].product; n[id] = (n[id] || 0) + 1; return n; }, {});
  const collect = ready.length ? `<button class="primary wide" data-action="collect-farm">🧺 Collect ${ready.length}: ${Object.entries(gathered).map(([id, n]) => `${ui.mini(id)} ${n}`).join(' ')}</button>` : '';
  const feed = `<div class="garden-actions farm-feed"><span>${crop ? `Feed: ${ui.mini(crop)} ${ui.esc(ITEMS[crop].name)} ×${s.bag[crop]} (your cheapest crop)` : 'Bring a crop from the garden to feed them: fed animals grow and produce twice as fast.'}</span>${crop && hungry ? `<button class="sky-button" data-action="feed-all">Feed all (${hungry})</button>` : ''}</div>`;
  const rows = farm.animals.map((a, i) => {
    const d = ANIMALS[a.kind], adult = isAdult(a, now), st = animalStatus(a, now), name = adult ? d.name : d.baby;
    return `<div class="crop-row garden-row animal-row${st.ready ? ' ready' : ''}" data-animal="${a.uid}"><span class="crop-art">${adult ? d.icon : d.babyIcon}</span><div><strong>${name} ${i + 1}${st.ready ? ` <span class="chip chip-energy">${ui.mini(d.product)} ready</span>` : ''}</strong><div class="grow-meter"><i style="width:${st.progress * 100}%"></i></div><p class="muted animal-time">${ui.esc(st.text)}</p></div><button class="soft-button" data-action="feed-animal" data-id="${a.uid}" ${crop && canFeed(a, now) ? '' : 'disabled'} aria-label="Feed ${name} ${i + 1}">Feed</button></div>`;
  }).join('') || '<p class="empty-state">The pen is empty. A chick or a calf will grow up here and give you eggs or milk.</p>';
  const shop = ANIMAL_KINDS.map(k => {
    const d = ANIMALS[k], check = canBuyAnimal(s, k), product = ITEMS[d.product];
    const label = check === 'level' ? `🔒 Level ${d.level}` : check === 'full' ? 'Pen full' : `Buy · ϟ ${d.price}`;
    return `<div class="crop-row garden-row${check === 'level' ? ' locked' : ''}"><span class="crop-art">${d.babyIcon}</span><div><strong>${d.baby} → ${d.name}</strong><p>Grows up in ${seconds(d.growMs)}, then gives ${ui.mini(d.product)} ${product.name.toLowerCase()} every ${seconds(d.productMs)}.</p><div class="chips"><span class="chip chip-xp">✨ ${d.xp} XP each</span><span class="chip chip-energy">${ui.mini(d.product)} ϟ ${product.sell}</span></div></div><button class="${check === 'ok' ? 'primary' : 'soft-button'}" data-action="buy-animal" data-kind="${k}" ${check === 'ok' || check === 'energy' ? '' : 'disabled'}>${label}</button></div>`;
  }).join('');
  const cost = penExpandCost(s);
  const grow = cost === null ? '<p class="muted">Your pen is as big as it gets.</p>' : `<button class="${s.energy >= cost ? 'primary' : 'soft-button'} wide" data-action="expand-pen">➕ Bigger pen: +2 chickens, +1 cow (ϟ ${cost})</button>`;
  return `<div class="chips farm-counts">${counts}</div>${collect}${feed}<div class="crop-list">${rows}</div><div class="section-label">NEW FRIENDS</div><div class="crop-list">${shop}</div>${grow}<p class="garden-tip">💡 Your animals are friends, never food: meat still comes from wild creatures. Sell eggs and milk at the market or cook them at the kitchen.</p>`;
}
/** One summary line for a collect: "Collected 3: 2 eggs, 1 milk." */
export function collectText(list: readonly Collected[]) {
  const n: Record<string, number> = {}; for (const c of list) n[c.item] = (n[c.item] || 0) + 1;
  return `Collected ${list.length}: ${Object.entries(n).map(([id, k]) => `${k} ${ITEMS[id].name.toLowerCase()}${k > 1 && id === 'egg' ? 's' : ''}`).join(', ')}.`;
}
/** The kitchen's farm recipes (cards like the roasting ones), or '' when no farm product was ever owned. */
export function dishesHtml(s: SaveState, ui: FarmUi) {
  if (!FARM_DISHES.some(d => Object.keys(d.materials).some(m => s.collection[m] || s.bag[m]))) return '';
  return `<div class="section-label">FROM YOUR ANIMAL PEN</div><div class="shop-grid">${FARM_DISHES.map(d => {
    const item = ITEMS[d.id];
    return `<div class="shop-item"><span class="shop-icon">${ui.art(d.id, item.icon)}</span><div><strong>${ui.esc(item.name)}</strong><p>${ui.esc(ui.effect(item))}</p>${ui.chips(d.materials)}</div><button class="primary" data-action="cook-dish" data-item="${d.id}" ${canCookDish(s, d.id) ? '' : 'disabled'}>Cook</button></div>`;
  }).join('')}</div>`;
}
