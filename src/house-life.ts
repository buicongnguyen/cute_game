/**
 * Life inside the cottage (house-ui.ts wires it): the "use" prompt for the nearest activity and its glowing ring,
 * what each activity does when used (house-activities.ts rules through the 'houseUse' action, feedback with fx,
 * sound and toasts), the trophy wall and collection log panels, friends' speech bubbles and the radio's music box.
 *
 * Per frame it only measures distances to a fixed list and moves one bubble; the prompt's DOM changes only when the
 * nearest activity (or its cooldown second) changes.
 */
import { t } from './i18n.ts';
import type { Entity, World } from './world.ts';
import type { HouseSession, ActivityEntity } from './house-session.ts';
import { TalkBag, lineFor, exchangeFor } from './house-talk.ts';
import type { RoomId } from './house.ts';
import { ACTIVITIES, activity, collectionLog, cooldownLeft, decorPlacements, decorSignature, friendLabel, trophies, photos, type Activity, type UseResult } from './house-activities.ts';
import { PLANETS, type BuffDef } from './content.ts';
import * as T from 'three';

export interface LifeDeps {
  world: World; house: HouseSession;
  visiting(): boolean; blocked(): boolean;
  perform(type: string, payload?: Record<string, unknown>): Promise<unknown>;
  openDialog(type: string, title: string, body: string, kicker?: string, icon?: string): void;
  toast(message: string, icon?: string): void; tone(kind?: string): void;
  ownGear(): void; looks?(): void; quests?(): void; soundOn(): boolean;
  /** Sleep fades the screen out and back (house-ui's veil). */
  dim(seconds: number): void;
  /** Re-route a tap as another entity kind (stove → cook, workbench → craft, globe → travel). */
  route(e: Entity): void;
}
/** How close the explorer must be for the prompt (metres). */
export const REACH = 1.9;
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** The nearest activity within reach of (x, z), or null. Allocation-free. */
export function nearestActivity(x: number, z: number, reach = REACH): Activity | null {
  let best: Activity | null = null, bestD = reach * reach;
  for (const a of ACTIVITIES) { const dx = a.at.x - x, dz = a.at.z - z, d = dx * dx + dz * dz; if (d < bestD) { bestD = d; best = a; } }
  return best;
}
const BUFF_NAMES: Record<string, string> = { regen: 'regeneration', def: 'defence', haste: 'attack speed', speed: 'movement speed', luck: 'luck', xp: 'experience' };
export function buffText(buff: BuffDef | undefined) {
  if (!buff) return '';
  const parts = Object.entries(buff).filter(([k]) => k !== 'time').map(([k, v]) => k === 'regen' ? `+${v} ${t(BUFF_NAMES[k])}` : `+${Math.round((v as number) * 100)}% ${t(BUFF_NAMES[k] ?? k)}`);
  return `${parts.join(', ')} · ${Math.round(buff.time / 60 * 10) / 10} ${t('min')}`;
}

/** A tiny music box: a looping pentatonic tune on its own quiet WebAudio voice. */
class MusicBox {
  private ctx: AudioContext | null = null; private gain: GainNode | null = null; private timer = 0; private step = 0;
  playing = false;
  private static NOTES = [523, 659, 784, 659, 587, 523, 440, 523, 659, 784, 880, 784, 659, 587, 523, 0];
  start() {
    try { this.ctx ??= new AudioContext(); if (this.ctx.state === 'suspended') void this.ctx.resume(); } catch { return; }
    if (!this.gain) { this.gain = this.ctx.createGain(); this.gain.gain.value = .07; this.gain.connect(this.ctx.destination); }
    this.playing = true; this.step = 0; this.timer = 0;
  }
  stop() { this.playing = false; }
  /** Called each frame while inside; schedules a note every 0.32 s. */
  tick(dt: number) {
    if (!this.playing || !this.ctx || !this.gain) return;
    if ((this.timer -= dt) > 0) return; this.timer = .32;
    const f = MusicBox.NOTES[this.step++ % MusicBox.NOTES.length]; if (!f) return;
    const at = this.ctx.currentTime, osc = this.ctx.createOscillator(), env = this.ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = f; env.gain.setValueAtTime(.9, at); env.gain.exponentialRampToValueAtTime(.001, at + .6);
    osc.connect(env); env.connect(this.gain); osc.start(at); osc.stop(at + .62);
  }
}

export function initHouseLife(d: LifeDeps) {
  const { world, house } = d, view = house.view;
  const prompt = document.createElement('button'); prompt.id = 'house-prompt'; prompt.type = 'button'; prompt.hidden = true; document.body.append(prompt);
  const bubble = document.createElement('div'); bubble.id = 'house-bubble'; bubble.hidden = true; document.body.append(bubble);
  const music = new MusicBox();
  let near: Activity | null = null, shown = '', scan = 0, chatClock = 4, chatLeft = 0, chatFriend: T.Object3D | null = null, decorClock = 0;
  const v = new T.Vector3(), talk = new TalkBag(), queue: { who: T.Object3D; text: string }[] = [];
  const fx = (a: Activity) => ({ x: a.at.x, y: a.y, z: a.at.z });

  const feedback = (a: Activity, r: UseResult) => {
    const at = fx(a), f = world.fx;
    const colour = ({ sofa: '#ffd0e0', fire: '#ffb04a', tea: '#c8f5ff', bed: '#d6c2ff', bath: '#bfefff', sink: '#e8fbff', easel: '#ffb3c7' } as Record<string, string>)[a.id] ?? '#ffffff';
    f?.burst(at, { n: 16, color: colour, speed: 2.4, up: 3, size: .1, life: 1, glow: true, gravity: -1, y: 0 });
    f?.ring({ x: a.at.x, z: a.at.z }, { color: colour, from: .3, to: 1.8, life: .6 });
    if (r.healed > 0) f?.text(at, `+${Math.round(r.healed)}`, 'heal');
    if (a.id === 'bed') { d.dim(1.4); f?.text(at, 'Zzz…', 'callout'); }
    else if (a.id === 'easel') f?.text(at, `+${Math.round(r.xp)} XP`, 'callout');
    else f?.text(at, t(a.verb) + '!', 'callout');
    d.tone(a.id === 'bath' || a.id === 'sink' || a.id === 'tea' ? 'splash' : a.id === 'bed' ? 'level' : 'success');
    const note = a.id === 'easel' ? t('A new painting for the craft room wall! +{n} XP', { n: Math.round(r.xp) }) : a.note ? t(a.note, { n: r.buff?.regen ?? 0 }) : t(a.verb);
    d.toast(r.buff ? `${note} · ${Math.round(r.buff.time / 60 * 10) / 10} ${t('min')}` : note, a.icon);
  };
  const use = async (a: Activity) => {
    if (a.kind === 'open') {
      if (a.id === 'trophies') return trophyWall();
      if (a.id === 'books') return collectionPanel();
      if (a.id === 'diary') { d.tone('pop'); return d.quests?.(); }
      if (a.id === 'wardrobe' || a.id === 'mirror') { if (d.visiting()) return d.toast('Enjoy looking around. Your own garden is waiting at home.', '🌷'); return a.id === 'mirror' && d.looks ? d.looks() : d.ownGear(); }
      const e = world.entities.find(x => x.id === 'house:' + a.id); if (e) d.route(e); return;
    }
    if (a.kind === 'fun') {
      if (a.id === 'duck') { d.tone('pop'); world.fx?.text(fx(a), t('Squeak!'), 'callout'); world.fx?.burst(fx(a), { n: 8, color: '#ffe36b', speed: 2, up: 3, size: .08, glow: true, y: 0 }); return; }
      if (a.id === 'radio') { if (music.playing) { music.stop(); d.toast('The radio is off.', '📻'); } else if (d.soundOn()) { music.start(); d.toast('A cosy tune fills the cottage.', '🎶'); } else d.toast('Turn on sound in Settings to hear the radio.', '🔇'); return; }
    }
    if (d.visiting()) return d.toast('Enjoy looking around. Your own garden is waiting at home.', '🌷');
    const left = cooldownLeft(world.state, a.id);
    if (left > 0) { d.tone('click'); return d.toast(t('{name} is ready again in {time}.', { name: t(a.name), time: mmss(left) }), '⏳'); }
    const r = await d.perform('houseUse', { id: a.id }) as UseResult | null;
    if (r) { feedback(a, r); shown = ''; syncDecor(); }
  };

  const trophyWall = () => {
    const s = world.state, cups = s.bosses ?? [], friends = photos(s);
    const planetName = (key: string) => { const [p, type] = key.split(':'); const def = (PLANETS as Record<string, { name: string; icon: string }>)[p]; return `${def?.icon ?? '🏆'} ${esc(t((type ?? p).replace(/_/g, ' ')))} <small>${esc(t(def?.name ?? p))}</small>`; };
    d.tone('pop');
    d.openDialog('house-trophies', t('Trophy wall'), `<p class="intro">${t('Every boss you beat puts a cup on the shelf; every friend you rescue hangs a photo by the fire.')}</p>`
      + `<h4 class="house-h">🏆 ${t('Bosses beaten')} · ${cups.length}</h4>${cups.length ? `<ul class="house-list">${cups.map(c => `<li>${planetName(c)}</li>`).join('')}</ul>` : `<p class="fineprint">${t('No trophies yet. Beat a boss in the wild!')}</p>`}`
      + `<h4 class="house-h">📷 ${t('Friends rescued')} · ${friends.length}</h4>${friends.length ? `<ul class="house-list">${friends.map(f => `<li>🤝 ${esc(t(friendLabel(f)))}</li>`).join('')}</ul>` : `<p class="fineprint">${t('Rescue a friend from a cage to hang their photo.')}</p>`}`, t('LIVING ROOM'), '🏆');
  };
  const collectionPanel = () => {
    const log = collectionLog(world.state);
    d.tone('pop');
    d.openDialog('house-collection', t('Collection log'), `<div class="house-log-total"><b>${log.pct}%</b><span>${t('of the encyclopaedia complete')}</span></div>`
      + log.rows.map(r => `<div class="house-log-row"><span class="house-log-icon">${r.icon}</span><div><strong>${esc(t(r.label))}</strong><div class="house-bar"><i style="width:${r.pct}%"></i></div></div><b>${r.have}/${r.total}</b></div>`).join(''), t('STUDY'), '📚');
  };

  /** Trophies, photos and paintings follow the save (rebuilds the batch only when they change). */
  const syncDecor = () => { if (view.setDecor(decorSignature(world.state), decorPlacements(world.state))) void 0; };

  const project = (x: number, y: number, z: number) => { v.set(x, y, z).project(world.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight] as const; };
  const frame = (dt: number) => {
    if (!house.inside) { if (!prompt.hidden) prompt.hidden = true; if (!bubble.hidden) bubble.hidden = true; view.highlight.visible = false; if (music.playing) music.stop(); return; }
    music.tick(dt);
    if ((decorClock -= dt) <= 0) { decorClock = .5; syncDecor(); }
    // The nearest activity: re-measured 8 times a second, the DOM touched only when the text changes.
    if ((scan -= dt) <= 0) {
      scan = .12; near = d.blocked() ? null : nearestActivity(world.position.x, world.position.z);
      const left = near ? cooldownLeft(world.state, near.id) : 0;
      const label = near ? `${near.icon}|${t(near.verb)}|${left > 0 ? mmss(left) : ''}|${near.id === 'radio' && music.playing ? 1 : 0}` : '';
      if (label !== shown) {
        shown = label; prompt.hidden = !near;
        if (near) { prompt.innerHTML = `<span class="hp-icon">${near.icon}</span><span class="hp-text"><span class="hp-verb">${esc(near.id === 'radio' && music.playing ? t('Stop music') : t(near.verb))}</span>${left > 0 ? `<small>⏳ ${mmss(left)}</small>` : near.buff ? `<small>${esc(buffText(near.buff))}</small>` : ''}</span>`; prompt.classList.toggle('cooling', left > 0); prompt.setAttribute('aria-label', t(near.verb)); }
      }
      view.highlight.visible = !!near; if (near) view.highlight.position.set(near.at.x, .03, near.at.z);
    }
    // Friends chat now and then: one bubble at a time, above whoever is settled.
    if (chatLeft > 0) {
      chatLeft -= dt;
      if (chatLeft <= 0 || !chatFriend) { bubble.hidden = true; chatFriend = null; }
      else { const p = chatFriend.position, [x, y] = project(p.x, p.y + 1.9, p.z); bubble.style.visibility = x < 90 || x > innerWidth - 90 || y < 60 ? 'hidden' : ''; bubble.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`; }
    } else if (queue.length) {
      // The reply of a two-friend exchange follows the first line.
      const next = queue.shift()!; bubble.textContent = next.text; bubble.hidden = false; chatFriend = next.who; chatLeft = 3.2;
    } else if ((chatClock -= dt) <= 0) {
      chatClock = 5 + Math.random() * 5;
      const settled = [...view.friends.values()].filter(f => Math.hypot(f.spot.x - f.group.position.x, f.spot.z - f.group.position.z) < .1);
      const pick = settled[Math.floor(Math.random() * settled.length)];
      if (pick) {
        const room = ((pick.spot as { room?: RoomId }).room ?? 'living'), mate = settled.find(f => f !== pick && (f.spot as { room?: RoomId }).room === room);
        const pair = mate && Math.random() < .35 ? exchangeFor(talk, room) : null;
        if (pair && mate) { queue.push({ who: mate.group, text: t(pair[1]) }); bubble.textContent = t(pair[0]); }
        else bubble.textContent = t(lineFor(talk, { room, stage: pick.stage, role: pick.role }));
        bubble.hidden = false; chatFriend = pick.group; chatLeft = 3.4;
      }
    }
  };
  prompt.addEventListener('click', () => { if (near && !d.blocked()) void use(near); });
  /** Taps on activity entities (house-ui's interact calls this first). */
  const interact = (e: Entity) => { const id = (e as ActivityEntity).activity; const a = id ? activity(id) : undefined; if (!a || e.kind !== 'house-use') return false; void use(a); return true; };
  return { frame, interact, use, nearest: () => near, music, trophies: () => trophies(world.state) };
}
