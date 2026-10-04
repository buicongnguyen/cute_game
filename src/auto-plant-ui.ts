import * as M from './model.ts';
import { t } from './i18n.ts';
import { autoPlantOff, bedChoice } from './auto-plant.ts';
import { cropFor, helperOf, robotResting } from './helper.ts';
import { FRIENDS, friendsOf, working } from './friends.ts';

/**
 * The Auto-planting switch and the line that says who plants a bed next (rule in auto-plant.ts). One row, the same
 * in the bed panel (with that bed's plan), in Bolt's panel and in Sprout's: one switch, wherever the player looks.
 * The texts are translated here (they carry names and crops), so the row is ready for either language.
 */
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** The garden friend (Sprout), rescued or not yet home. */
const gardener = (s: M.SaveState) => friendsOf(s).find(f => f.role === 'garden');
/** A garden with nobody to plant for the player has no switch to show. */
export const hasGardener = (s: M.SaveState) => !!s.helper?.owned || !!gardener(s);

export interface BedPlan { who: 'you' | 'helper' | 'wait'; crop: M.CropId | null; text: string }
/** Who plants bed `i` next and what, in the player's words: the player, a helper, or nobody until the player acts. */
export function bedPlan(s: M.SaveState, i: number): BedPlan {
  const off = autoPlantOff(s), h = helperOf(s), f = gardener(s), resting = h.owned && !h.paused && robotResting(s), robot = h.owned && !h.paused && !resting, friend = working(s, f);
  const you = (why: string): BedPlan => ({ who: 'you', crop: null, text: `${t('You plant this bed.')} ${t(why)}` });
  if (off === 'switch') return you('Your helpers only harvest.');
  if (off === 'robot') return you('Bolt is switched off, so nobody plants for you.');
  if (!robot && !friend) return you(resting ? 'Bolt is on his daily rest and plants again afterwards.' : 'No helper is at work right now.');
  const own = bedChoice(s, i), crop = cropFor(s, i), who = robot && friend ? t('Your helpers') : robot ? 'Bolt' : t(FRIENDS[f!.id].name);
  if (crop) return { who: 'helper', crop, text: t(own ? '{who} will plant {crop} here again. It is your own choice for this bed.' : '{who} will plant {crop} here. Plant a seed yourself and this bed keeps your crop.', { who, crop: t(M.CROPS[crop].name) }) };
  // The bed's own crop (or Bolt's chosen seed) cannot be planted now: it stays empty rather than getting something else.
  const wanted = own ?? (h.seed !== 'same' ? h.seed : null); if (!wanted) return you('No helper is at work right now.');
  const level = M.cropLevel(s, wanted), name = t(M.CROPS[wanted].name);
  return { who: 'wait', crop: wanted, text: level > s.level ? t('This bed waits for you, because {crop} needs level {level}.', { crop: name, level }) : t('This bed waits for you, because no {crop} seeds are left.', { crop: name }) };
}

/**
 * The switch as a settings row; with `bed`, the note is that bed's plan. Empty when the garden has no helper or the
 * explorer is away. While Bolt is switched off the switch shows off and cannot be moved: Bolt's own switch decides.
 * `friend` rides along as data-kind so the friend's panel can redraw itself.
 */
export function autoPlantRow(s: M.SaveState, bed?: number, friend?: string): string {
  if (!hasGardener(s) || s.planet !== 'home') return '';
  const off = autoPlantOff(s), plot = bed === undefined ? undefined : s.plots[bed], label = esc(t('Auto-planting'));
  const note = plot ? (plot.crop ? `${t('After this harvest:')} ` : '') + bedPlan(s, bed!).text
    : t(off === 'robot' ? 'Off while Bolt is switched off: you plant every bed yourself.' : off ? 'Off: you plant every bed yourself. Your helpers only harvest.' : 'On: your helpers replant empty beds. A bed you planted yourself keeps your crop, fruit trees too.');
  return `<div class="settings-row auto-plant-row" data-auto-plant="${off ?? 'on'}"><div><strong>🌱 ${label}</strong><small>${esc(note)}</small></div>`
    + `<button class="toggle ${off ? '' : 'on'}" role="switch" aria-checked="${!off}" aria-label="${label}" data-action="auto-plant"${friend ? ` data-kind="${esc(friend)}"` : ''}${off === 'robot' ? ' disabled' : ''}></button></div>`;
}
