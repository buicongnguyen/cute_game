import '@fontsource-variable/nunito';
import './style.css';
import { t, localizeHtml, getLanguage, setLanguage, onLanguageChange, bindLanguage } from './i18n.ts';
import './menus.css';
import { Box3, Vector3 } from 'three';
import { World, type Entity, type Enemy } from './world.ts';
import { refinedAssets, sceneryKit, cropKit, fishKit, heroKit, spaceKit, wildsKit, brightKit, harshKit } from './assets.ts';
import { SpaceFlight, planRoutes, type RouteOption, type SpaceEvent } from './space.ts';
import { SpaceView } from './space-view.ts';
import { ShipSequence } from './ship-sequence.ts';
import { kitsFor } from './biomes.ts';
import { ENEMY_TYPES } from './enemy-types.ts';
import { FishingView, type PondView } from './fishing-view.ts';
import { decorIcon } from './icons.ts';
import { CombatHud, fightNear, lootText, zoneInfo } from './hud-combat.ts';
import * as M from './model.ts';
import { ContextGearSelection } from './context-gear.ts';
import { CombatTimers, FishingInput, MovementControls } from './gameplay-controls.ts';
import { CombatSimulation, BASE_SKILLS, SPECIALS, type CombatHit, type CombatEffect } from './combat.ts';
import { CombatView } from './combat-view.ts';
import { FishingSimulation, selectCatch, planCast, catchWeight } from './fishing.ts';
import { GroundGestures } from './gestures.ts';
import { ZOOM, clampZoom } from './camera-rig.ts';
import {clearSegment,WORLD_BOUNDS} from './navigation.ts';
import { progressEntries, claimProgress, recordEvent, rerollDaily, startChallenge, storyStep, challengeTitle, type ProgressKind } from './progression.ts';
import { STORY_STEPS } from './content.ts';
import type { GameBridge, GameAction, NetworkHooks } from './game-bridge.ts';
import { initOnline } from './online.ts';
import { initPlatform } from './platform.ts';
import { Sfx, type Sound } from './sfx.ts';
import { loadGraphics, saveGraphics, QUALITY, type QualitySetting } from './graphics.ts';
import { frameSteps } from './frame-steps.ts';
import { createDrops } from './drops-view.ts';
import { Minimap } from './minimap.ts';
import { produceLots, sellProduce, upgradeCards } from './item-views.ts';
import './item-views.css';
import { penHtml, penSignature, tickPen, collectText, dishesHtml, type FarmUi } from './farm-ui.ts';
// Compact HUD sizes; imported last so it overrides style.css (and the online/platform styles) for the HUD only.
import './hud-compact.css';
import './language.css';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let saved: M.SaveState | null = null;
try { saved = M.parseSave(localStorage.getItem(M.SAVE_KEY)); } catch { /* Play remains available without storage. */ }
let state = saved ?? M.newGame();
let started = false, modal = '', selectedItem: M.ItemId | null = null, activePlot = 0, lastFocused: HTMLElement | null = null;
let saveFailed = false, elapsed = 0, uiElapsed = 0, frameTime = 16;
const combatTimers = new CombatTimers();
const contextGear = new ContextGearSelection();
let gearState=state,gearPlanet=state.planet,gearWater=false,combatGearUntil=0;
const cooldowns = combatTimers.skills, skillDurations = [7,4,9,6];
let audio: AudioContext | null = null;
type FishPick={id:string;power:number;size:number;huge:boolean};
let fishGame: {input:FishingInput;simulation:FishingSimulation<FishPick>;lastPhase:string;seen:{missed:number;bait:number;early:number};tooEarlyUntil:number} | null = null;
/** Where the last line went in, so the Cast button and F recast to the same spot. */
let lastCast:{id:string;x:number;z:number}|null=null;
let fishingWater='home';
let shopTab='Weapons',journalTab:ProgressKind='story',craftStation:'craft'|'forge'='craft',craftTab='All';
let placement:{id:string;rotation:number;x:number;z:number;ok:boolean}|null=null,visiting:string|null=null,visitHome:M.SaveState|null=null;
let persistence:((state:M.SaveState)=>void)|null=null,network:NetworkHooks={role:null};
// The starship (set up once the world exists); while flying, space replaces the world.
let shipSequence:ShipSequence|undefined,flight:SpaceFlight|null=null,arriving=false;
// The graphics governor ignores the first seconds after starting or landing: model files are still
// arriving and shaders compiling, and those hitches say nothing about how fast the device is.
let settledAt=0;const settle=()=>{settledAt=performance.now()+4000;};
const frameListeners=new Set<(dt:number)=>void>(),actionListeners=new Set<(action:GameAction)=>void>();
function languageSelector(place:string){return `<div class="language-picker"><label for="language-${place}">Language</label><select id="language-${place}" data-language aria-label="Language"><option value="en" data-i18n-skip ${getLanguage()==='en'?'selected':''}>English</option><option value="vi" data-i18n-skip ${getLanguage()==='vi'?'selected':''}>Tiếng Việt</option></select></div>`;}
const app = $('#app');
app.innerHTML = `
  <div id="darkness" hidden></div><div id="world-labels" aria-label="Nearby places"></div>
  <div id="hud" hidden>
    <header class="player-card"><button class="avatar" data-action="bag" aria-label="Open character and backpack"><span>🌱</span><b id="level-badge">1</b></button><div class="player-details"><div class="player-name"><strong id="player-name"></strong><span id="level-text">Lv. 1</span></div><div class="meter health"><div id="hp-fill"></div><span id="hp-text">100 / 100</span></div><div class="meter experience"><div id="xp-fill"></div></div><div class="location"><span class="location-dot"></span><span id="zone-name">Clover Village</span></div></div></header>
    <nav class="top-actions" aria-label="Game menu"><div class="energy"><span>ϟ</span><b id="energy">0</b></div><button class="icon-button" data-action="bag" title="Backpack · I" aria-label="Backpack">🎒</button><button class="icon-button" data-action="quests" title="Journal · J" aria-label="Quest journal">📖<i id="quest-dot"></i></button><div id="social-slot"></div><button class="icon-button secondary-icon" data-action="help" title="How to play" aria-label="How to play">?</button><button class="icon-button" data-action="settings" title="Settings" aria-label="Settings">⚙</button><div id="platform-slot"></div></nav>
    <div class="tracker-stack"><button id="tracker-chip" class="tracker-chip" data-action="trackers" aria-label="Show quest and bounty" hidden><span id="chip-quest">🥕 0/3</span><span id="chip-bounty">🎯</span><i>▸</i></button><div class="tracker-panels"><aside class="quest-tracker"><button class="tracker-fold" data-action="trackers" aria-label="Fold quest and bounty">▾ Fold</button><div class="eyebrow">ADVENTURE <span id="quest-chapter">1 / 9</span></div><button id="quest-summary" data-action="quests"><span class="quest-icon" id="quest-icon">🥕</span><span><strong id="quest-title">A little green beginning</strong><small id="quest-task">Harvest 3 crops · 0 / 3</small></span><b class="tracker-count" id="quest-count"></b><span class="chevron">›</span></button><div class="quest-progress"><i id="quest-fill"></i></div><button id="quick-claim" data-action="claim" hidden>Collect your reward ✨</button></aside>
    <button id="bounty-tracker" class="bounty-tracker" data-action="journal-tab" data-kind="bounties"><span>🎯</span><div><strong id="bounty-title">A new bounty</strong><small id="bounty-task">Find your next adventure</small></div><b class="tracker-count" id="bounty-count"></b></button></div><div id="buff-bar" aria-label="Active effects"></div></div><button class="minimap" data-action="map" aria-label="Open village map"><canvas id="minimap" width="150" height="150"></canvas><span>N</span><small id="map-caption">CLOVER VILLAGE</small></button>
    <div id="boss-bar" hidden><span id="boss-icon">👑</span><div><div class="boss-head"><strong id="boss-name"></strong></div><div class="boss-meter"><i id="boss-fill"></i></div></div></div>
    <div id="target-frame" hidden aria-live="off"><span class="target-icon"></span><div><div class="target-head"><strong></strong><span class="target-level">Lv 1</span></div><div class="target-meter"><i></i><b class="target-hp"></b></div></div></div>
    <div id="zone-banner" role="status"><strong id="banner-name">Clover Village</strong><small id="banner-detail">A little place to call home</small><span id="banner-chip"></span></div>
    <button id="reel-button" class="reel-hud" data-action="reel" hidden aria-label="Reel in the line"><span class="reel-icon" aria-hidden="true">🎣</span><span id="reel-text">Reel</span></button><div id="fish-hint" role="status" hidden></div>
    <div id="context-prompt" hidden><button id="interact-button" data-action="interact"><kbd>F</kbd><span id="interact-text">Interact</span></button></div>
    <div class="bottom-bar"><div class="skills" aria-label="Combat skills"><button class="skill skill-spin" data-action="skill" data-index="0" aria-label="Q Whirlwind"><kbd>Q</kbd><span>🌀</span><small>Whirlwind</small><b class="cooldown"></b></button><button class="skill skill-dash" data-action="skill" data-index="1" aria-label="W Dash"><kbd>W</kbd><span>➶</span><small>Dash</small><b class="cooldown"></b></button><button class="skill skill-stomp" data-action="skill" data-index="2" aria-label="E Ground stomp"><kbd>E</kbd><span>💥</span><small>Stomp</small><b class="cooldown"></b></button><button class="skill skill-special" data-action="skill" data-index="3" aria-label="R Special attack"><kbd>R</kbd><span>✦</span><small id="special-name">Star punch</small><b class="cooldown"></b></button></div><div class="control-hint"><span>Click to wander</span><i>•</i> Arrows to move <i>•</i> <kbd>Space</kbd> attack</div><button class="home-button" data-action="return-home" title="Return home">⌂ <span>Home</span></button></div>
    <div id="touch-controls"><button data-move="ArrowUp" aria-label="Move up">▲</button><div><button data-move="ArrowLeft" aria-label="Move left">◀</button><button data-action="attack" aria-label="Attack">⚔</button><button data-move="ArrowRight" aria-label="Move right">▶</button></div><button data-move="ArrowDown" aria-label="Move down">▼</button></div>
    <div id="environment-bar" aria-label="Environment"></div><div id="placement-bar" hidden><p><span id="placement-name"></span><span id="placement-hint"></span></p><div class="placement-buttons"><button class="sky-button" data-action="rotate-decor">↻ Rotate</button><button class="primary" data-action="confirm-place">✔ Place</button><button class="soft-button" data-action="cancel-decor" aria-label="Cancel">✕</button></div></div><div id="visit-banner" hidden></div>
    <div class="save-indicator" id="save-status">● Saved on this device</div>
  </div>
  <div id="space-hud" hidden>
    <div class="space-top"><div class="space-fuel" aria-label="Fuel"><span>⛽</span><div class="fuel-meter"><i id="fuel-fill"></i></div><b id="fuel-text">100</b></div><div class="space-speed"><b id="space-speed">0</b><small>km/s</small></div><div class="energy"><span>ϟ</span><b id="space-energy">0</b></div></div>
    <canvas id="space-radar" width="150" height="150" aria-label="Radar: yellow dots are stardust, question marks are undiscovered planets"></canvas>
    <div id="space-labels"></div><div id="space-hint" role="status"></div><div id="space-floats"></div>
    <button id="land-button" data-action="land" hidden><span id="land-title">🛬 Land</span><small id="land-name"></small></button>
    <button id="autopilot-skip" data-action="autopilot-skip" hidden>⏭ Skip</button>
    <button id="boost-button" aria-label="Boost (Shift or Space)"><span>🚀</span><small>Boost</small></button>
    <div class="space-help">Hold to steer <i>•</i> <kbd>W</kbd> <kbd>A</kbd> <kbd>D</kbd> fly <i>•</i> <kbd>Shift</kbd> boost <i>•</i> <kbd>S</kbd> brake <i>•</i> <kbd>L</kbd> land</div>
  </div>
  <div id="warp-flash"></div>
  <div id="title-screen"><div class="title-shade"></div><div class="welcome-card">${languageSelector('welcome')}<div class="welcome-eyebrow"><span></span> YOUR NEXT LITTLE ADVENTURE</div><div class="brand-sprout">🌱</div><h1>Zoo <em data-i18n-skip>Garden</em><span>grow a little. wander a lot.</span></h1><p>A cozy home, a pocketful of seeds,<br>and a whole world waiting for you.</p><div class="welcome-form"><label for="name-input">WHAT SHOULD WE CALL YOU?</label><input id="name-input" aria-label="Your character name" maxlength="20" value="${esc(saved?.name ?? '')}" placeholder="Your name" autocomplete="off"><fieldset class="color-picker"><legend>Pick your favorite color</legend>${M.COLORS.map((c,i)=>`<button type="button" data-action="color" data-color="${c}" style="--swatch:${c}" class="${state.color===c?'selected':''}" aria-label="${['Sky blue','Rose pink','Leaf green','Honey yellow','Lavender','Terracotta'][i]}" aria-pressed="${state.color===c}"></button>`).join('')}</fieldset><button class="primary start-button" data-action="start">${saved?'Continue adventure':'Let’s play'} <span>→</span></button></div><div class="welcome-footer"><span>🌾 Grow</span><span>🎣 Discover</span><span>✨ Adventure</span></div><small class="local-note">${import.meta.env.VITE_STATIC_HOST==='true'?'Solo adventure · progress saved in this browser':'Play offline, or meet friends online'}</small></div><div class="title-caption"><span>🌿</span> WELCOME TO CLOVER VILLAGE</div></div>
  <div id="dialog-layer" hidden><section id="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header><span id="dialog-icon" aria-hidden="true"></span><div><span id="dialog-kicker" class="eyebrow">MAKE YOURSELF AT HOME</span><h2 id="dialog-title"></h2></div><button class="close-button" data-action="close" aria-label="Close dialog">×</button></header><div id="dialog-body"></div></section></div>
  <div id="toasts" role="status" aria-live="polite"></div><div id="floating-text"></div><div id="damage-flash"></div>
`;
const refreshStaticLanguage=bindLanguage(app), refreshWorldLanguage=bindLanguage($('#world'));
// Scenery is batched when a world is built, so give the small scenery kit a moment
// to arrive first. A slow connection starts with the simple shapes instead.
$('#title-screen').inert=true;
await Promise.race([Promise.all([sceneryKit.load(),wildsKit.load()]),new Promise(resolve=>setTimeout(resolve,4000))]);
$('#title-screen').inert=false;
const graphics=loadGraphics(state.settings.lowGraphics);
let world: World;
try { world = new World($('#world'), state, { antialias: !(graphics.mobile && devicePixelRatio >= 2) }); }
catch (error) { app.innerHTML = localizeHtml('<div class="fatal"><h1>Your garden needs WebGL</h1><p>Enable hardware acceleration in your browser, then reload this page.</p><p>Your saved adventure is safe.</p></div>'); throw error; }
world.applyGraphics(graphics.profile, graphics.ratio);world.fx?.setTextLayer($('#floating-text'));
// Over-head HP bars, target frame and boss bar; the trackers fold to a chip in fights ('auto'), or as the player asks.
const combatHud=new CombatHud($('#world-labels'),(x,y,z)=>world.screen(x,y,z));let trackerMode:'auto'|'open'|'fold'='auto',wasFight=false;
// The whole-world minimap (minimap.ts): terrain cached per world, markers redrawn five times a second.
const minimap=new Minimap($<HTMLCanvasElement>('#minimap'),$('#map-caption'),()=>started?{planet:world.planet,layout:world.environment.layout,position:world.position,facing:world.facing,entities:world.entities,enemies:world.enemies,
  penBuilt:M.penBuilt(world.state),ready:[...world.entities.filter(e=>e.kind==='plot'&&!!world.state.plots[e.index!]?.crop&&M.cropProgress(world.state.plots[e.index!])>=1),...(world.planet==='home'?M.readyAnimals(world.state).flatMap(a=>world.farmView?.positionOf(a.uid)??[]):[])],remotes:[...world.remotePlayers.values()].filter(r=>r.mesh.visible).map(r=>r.mesh.position)}:null);
const movement = new MovementControls(world.keys);
const combatView=new CombatView(world.scene);
const combat=new CombatSimulation({
  position:()=>world.position,facing:()=>world.facing,face:angle=>world.facing=angle,
  targets:()=>world.enemies,weapon:()=>M.weaponStats(state),stats:()=>M.activeStats(state),
  move:(x,z)=>{const steps=Math.max(1,Math.ceil(Math.hypot(x,z)/.2));for(let i=0;i<steps;i++)world.move(x/steps,z/steps);},
  hit:(target,impact)=>hit(target as Enemy,impact.amount,impact.stun,impact),
  clearShot:(from,to)=>clearSegment(from,to,world.obstacles,{bounds:WORLD_BOUNDS,clearance:.05}),
  effect:effect=>{showEffect(effect);emitAction({kind:'effect',effect});},
  heal:fraction=>state.hp=Math.min(M.maxHp(state),state.hp+M.maxHp(state)*fraction),
  status:(target,kind,duration)=>{if(!network.status?.(target.id,kind,duration))world.statusEnemy(target as Enemy,kind,duration);},
  moveTarget:(target,x,z)=>{if(!network.moveTarget?.(target.id,x,z))moveEnemy(target as Enemy,x,z);},
});
const gestures=new GroundGestures({tap:(x,y)=>{if(placement)placeAt(x,y);else world.pointer(x,y);},walk:(x,y)=>{if(!placement)world.steer(x,y);},zoom:ratio=>{world.zoom=clampZoom(world.zoom*ratio,'pinch');world.resize();},stop:()=>{world.destination=null;world.route=[];world.selected=null;}});
// Swings become additive slash trails and area skills become expanding rings with sparks.
function showEffect(effect:CombatEffect){
  const fx=world.fx,at={x:effect.x,z:effect.z};
  if(fx&&effect.kind==='arc'){const fist=effect.radius<=1.85;fx.slash(at,effect.facing??world.facing,effect.radius+.25,effect.color,fist?{arc:1.4,life:.15,thick:.4}:{arc:2.2});return;}
  if(fx&&(effect.kind==='ring'||effect.kind==='impact')){fx.ring(at,{color:effect.color,from:.3,to:Math.max(.8,effect.radius),life:.35,y:.15,thick:.25});fx.burst(at,{n:6,color:effect.color,glow:true,size:.12,speed:Math.min(8,effect.radius*1.6),up:2,y:.3,life:.4});return;}
  combatView.effect(effect);
}
function emitAction(action:Omit<GameAction,'x'|'z'|'facing'>){const value={...action,x:world.position.x,z:world.position.z,facing:world.facing};for(const listener of actionListeners)listener(value);}
function moveEnemy(target:Enemy,x:number,z:number){if(!Number.isFinite(x)||!Number.isFinite(z)||Math.hypot(target.x-x,target.z-z)>12||world.blocked(x,z))return;target.x=x;target.z=z;target.mesh.position.x=x;target.mesh.position.z=z;}
// Upgrade visuals in place when ready; playing and saved progress never wait on assets.
void refinedAssets.loadAll().then(() => world.applyRefinedAssets());
void spaceKit.load().then(() => world.applyRefinedAssets());
void cropKit.load();
// If the scenery kit arrived after the first build, rebuild while the title screen is still up.
if(!sceneryKit.ready)void sceneryKit.load().then(()=>{if(sceneryKit.ready&&!started){world.build(state.planet);world.refreshPlayer();}});

const sfx=new Sfx();
function tone(kind: Sound = 'click') { sfx.enabled = state.settings.sound; sfx.play(kind); }
const vibrate=(ms:number)=>{try{if(state.settings.sound&&matchMedia('(pointer: coarse)').matches)navigator.vibrate?.(ms);}catch{/* Optional. */}};
function save() { if(!started)return;if(persistence){persistence(state);return;}try { state.savedAt=Date.now();localStorage.setItem(M.SAVE_KEY,JSON.stringify(state));saveFailed=false;$('#save-status').textContent=t('● Saved on this device'); } catch { saveFailed=true;$('#save-status').textContent=t('○ Saving unavailable'); } }
// Keep at most three messages on screen (two on phones, where they also leave sooner); older ones fade out instead of stacking up the view.
const phoneScreen=matchMedia('(max-width: 600px), (max-height: 520px)');
function toast(message: string, icon='✨') {
  message=t(message);
  const stack=$('#toasts'),el=document.createElement('div');el.className='toast';el.innerHTML=`<span>${icon}</span><div>${esc(message)}</div>`;stack.append(el);
  const dismiss=(node:Element)=>{if(node.classList.contains('leaving'))return;node.classList.add('leaving');setTimeout(()=>node.remove(),300);};
  const live=Array.from(stack.children).filter(node=>!node.classList.contains('leaving'));const keep=phoneScreen.matches?2:3;for(const old of live.slice(0,Math.max(0,live.length-keep)))dismiss(old);
  setTimeout(()=>dismiss(el),phoneScreen.matches?2800:3800);
}
// Blender-rendered icons for crops, fish, gear and items; decorations are drawn from their
// 3D models by the game; cooked food shows the raw item with a flame. Emoji remain the fallback.
const ICON_BASE=`${import.meta.env.BASE_URL}assets/icons/`;
const missingIcons=new Set<string>();
function art(id:string,icon:string):string{
  if(id.startsWith('cooked_')&&Object.hasOwn(M.ITEMS,id.slice(7)))return `<span class="cooked-art">${art(id.slice(7),icon)}<i>🔥</i></span>`;
  const item=Object.hasOwn(M.ITEMS,id)?M.ITEMS[id]:undefined;
  if(item?.type==='decor'){const url=decorIcon(id);return url?`<img class="art-icon" src="${url}" alt="" draggable="false">`:icon;}
  const folder=Object.hasOwn(M.CROPS,id)?'crops':Object.hasOwn(M.FISH,id)?'fish':item?'items':'';
  return folder&&!missingIcons.has(id)?`<img class="art-icon" src="${ICON_BASE}${folder}/${id}.webp" alt="" draggable="false" data-id="${esc(id)}" data-fallback="${esc(icon)}">`:icon;
}
/** A small inline icon for ingredient lists and chips. */
const mini=(id:string)=>`<span class="mini-art">${art(id,M.ITEMS[id]?.icon??'✨')}</span>`;
document.addEventListener('error',event=>{const img=event.target;if(img instanceof HTMLImageElement&&img.dataset.fallback!==undefined){missingIcons.add(img.dataset.id??'');img.replaceWith(document.createTextNode(img.dataset.fallback));}},true);
const BUFF_WORDS:Record<string,string>={atk:'attack',def:'defense',haste:'attack speed',regen:'HP/s',speed:'speed',crit:'critical',xp:'XP',magnet:'loot magnet',luck:'luck',light:'light',fireres:'fire resistance',lifesteal:'life steal'};
function effectText(item:M.ItemDef){
  const parts=Object.entries(item.buff??{}).filter(([key])=>key!=='time'&&BUFF_WORDS[key]).map(([key,value])=>key==='magnet'||key==='light'?BUFF_WORDS[key]:key==='def'||key==='regen'?`+${value} ${BUFF_WORDS[key]}`:`+${Math.round(Number(value)*100)}% ${BUFF_WORDS[key]}`);
  const heal=item.heal?item.heal>=999?'Full heal':`Heals ${item.heal}`:'';
  if(!parts.length)return heal;
  return `${heal?`${heal} · `:''}${parts.slice(0,2).join(', ')}${parts.length>2?` +${parts.length-2} more`:''} for ${item.buff!.time}s`;
}
// Each place opens its panel with its own icon and colour band.
const DIALOG_LOOK:Record<string,[string,string]>={
  plant:['🌱','garden'],plot:['🌱','garden'],pen:['🐔','garden'],map:['🗺️','garden'],sell:['🧺','market'],shop:['🛍️','shop'],bag:['🎒','bag'],decor:['🏡','bag'],
  quests:['📖','journal'],upgrade:['💎','crystal'],chest:['📦','chest'],cook:['🍲','kitchen'],craft:['🔨','craft'],travel:['🚀','travel'],
  settings:['⚙️','calm'],help:['🧭','calm'],'fish-help':['🎣','water'],fishing:['🎣','water'],catch:['🐟','water'],death:['🌷','rose'],reset:['🌱','rose'],
};
function floating(text:string,x=world.position.x,z=world.position.z,style='item',rise=0) {world.fx?.text({x,y:rise,z},t(text),style);}
function levelCheck(before:number) {if(state.level>before){toast(`Level ${state.level}! A little stronger, a little braver.`,'🌟');tone('level');world.burst(world.position.x,world.position.z,'#f5dc8f',35);}}
function change<T>(action:()=>T):T {const before=state.level;const result=action();levelCheck(before);save();updateHud();return result;}
function uiBlocked(){return !!modal||!!document.querySelector('dialog[open]')||shipSequence?.busy||!!flight||arriving;}
function openDialog(type:string,title:string,body:string,kicker='MAKE YOURSELF AT HOME',icon?:string) {
  if(fishGame)endFishing();
  if(!modal)lastFocused=document.activeElement as HTMLElement;const reopened=modal===type;modal=type;movement.clear();gestures.clear();world.destination=null;world.route=[];
  const [defaultIcon,look]=DIALOG_LOOK[type]??['✨','garden'];$('#dialog').dataset.tone=look;$('#dialog-icon').innerHTML=localizeHtml(icon??defaultIcon);
  // Re-rendering the same panel (a tab, a purchase) keeps the reader's scroll position.
  const bodyNode=$('#dialog-body'),scroll=bodyNode.scrollTop,tab=bodyNode.querySelector('.panel-tabs .active')?.textContent;
  $('#dialog-title').textContent=t(title);$('#dialog-kicker').textContent=t(kicker);bodyNode.innerHTML=localizeHtml(body);$('#dialog-layer').hidden=false;$('#hud').inert=true;$('#world-labels').inert=true;
  bodyNode.scrollTop=reopened&&bodyNode.querySelector('.panel-tabs .active')?.textContent===tab?scroll:0;
  $('.close-button').focus({preventScroll:true});
}
function closeDialog(){modal='';$('#dialog-layer').hidden=true;$('#hud').inert=false;$('#world-labels').inert=false;lastFocused?.focus();movement.clear();}
function start() {settle();state.name=$<HTMLInputElement>('#name-input').value.trim().slice(0,20)||state.name;started=true;$('#title-screen').hidden=true;$('#hud').hidden=false;applyMovePad();save();updateHud();updateLabels();toast(saved?t('Welcome back, {name}. Your garden missed you!',{name:state.name}):'Start small: click a garden bed to plant your first carrot.','🌱');showZone('Clover Village');}

function updateHud() {
  $('#world').dataset.status=JSON.stringify({position:[+world.position.x.toFixed(2),+world.position.z.toFixed(2)],route:world.route.length,next:world.route[0]?[world.route[0].x,world.route[0].z]:null,visibility:document.visibilityState,modal,started,frameMs:Math.round(frameTime),drawCalls:world.renderer.info.render.calls});
  $('#player-name').textContent=state.name;$('#level-badge').textContent=t(String(state.level));$('#level-text').textContent=t(`Lv. ${state.level}`);$('#energy').textContent=t(state.energy.toLocaleString());
  $('#hp-fill').style.width=`${state.hp/M.maxHp(state)*100}%`;$('#hp-text').textContent=t(`${Math.ceil(state.hp)} / ${M.maxHp(state)}`);$('#xp-fill').style.width=`${state.xp/M.xpNeeded(state.level)*100}%`;
  $('.experience').setAttribute('title',t(`${state.xp} / ${M.xpNeeded(state.level)} experience`));
  const q=progressEntries(state,'story')[0],progress=q?.progress??0;
  $('#quest-chapter').textContent=t(state.quest<M.QUESTS.length?`${state.quest+1} / ${M.QUESTS.length}`:'ONGOING');$('#quest-icon').textContent=t(q?.icon??'🚀');$('#quest-title').textContent=t(q?.title??'A world of possibilities');$('#quest-task').textContent=t(q?`${q.description} · ${progress} / ${q.target}`:'Your next chapter awaits.');$('#quest-count').textContent=t(q?`${progress}/${q.target}`:'');
  $('#quest-fill').style.width=`${q?progress/q.target*100:100}%`;$('#quick-claim').hidden=!q?.complete;$('#quest-dot').hidden=!q?.complete;
  const skills=skillList();
  document.querySelectorAll<HTMLButtonElement>('.skill').forEach((button,i)=>{const skill=skills[i];button.querySelector('span')!.textContent=t(skill.icon);button.querySelector('small')!.textContent=t(skill.name);button.setAttribute('aria-label',t(`${['Q','W','E','R'][i]} ${t(skill.name)}`));button.setAttribute('title',t(skill.name));button.classList.toggle('on-cooldown',cooldowns[i]>0);button.querySelector('.cooldown')!.textContent=t(cooldowns[i]>0?Math.ceil(cooldowns[i]).toString():'');button.style.setProperty('--cooldown',`${cooldowns[i]/skillDurations[i]*100}%`);});
  $('#buff-bar').innerHTML=localizeHtml(M.activeBuffs(state).map(b=>`<span title="${esc(b.description)}">${b.icon} ${esc(b.name)} <b>${Math.ceil(b.remaining)}s</b></span>`).join('')+Object.entries(combat.statuses).filter(([,t])=>t>0).map(([name,t])=>`<span>✨ ${esc(name)} <b>${Math.ceil(t)}s</b></span>`).join(''));
  $('#environment-bar').innerHTML=localizeHtml(world.environmentStatus().map(e=>`<span>${e.icon??''} ${esc(e.label)} <b>${esc(String(e.value))}</b></span>`).join(''));
  const dark=$('#darkness');dark.hidden=!world.darknessActive()||!started;
  // Target frame and boss bar (hud-combat.ts). While a fight is near (or on a phone in the wild) the trackers fold into one chip.
  const hud=app,shown=combatHud.panels(world.enemies,world.selected,world.position.x,world.position.z,started);hud.classList.toggle('boss-on',shown.boss);hud.classList.toggle('target-on',shown.target);
  const fight=fightNear(world.enemies,world.position.x,world.position.z);if(fight&&!wasFight&&trackerMode==='open')trackerMode='auto';wasFight=fight;
  const folded=trackerMode==='fold'||trackerMode==='auto'&&(fight||shown.boss||innerWidth<600&&(state.planet!=='home'||world.lastZone!=='Clover Village'));
  $('.tracker-stack').classList.toggle('folded',folded);$('#tracker-chip').hidden=!folded;
  const bounty=progressEntries(state,'bounties')[0];$('#bounty-tracker').hidden=!bounty;if(bounty){$('#bounty-title').textContent=t(bounty.title);$('#bounty-task').textContent=t(`${bounty.progress}/${bounty.target} · ${bounty.claimed?'Complete':bounty.description}`);$('#bounty-count').textContent=t(bounty.claimed?'✓':`${bounty.progress}/${bounty.target}`);}
  if(folded){$('#chip-quest').textContent=t(q?`${q.icon} ${progress}/${q.target}`:'🚀');$('#chip-bounty').textContent=t(bounty?`🎯 ${bounty.progress}/${bounty.target}`:'');}
  // Light pools cut holes in the darkness; a lamp behind the perspective camera would project mirrored, so it is skipped.
  if(!dark.hidden){const holes=world.lightSources().flatMap(light=>{const p=world.screen(light.x,.7,light.z),edge=world.screen(light.x+light.radius,.7,light.z);return p.front?[`radial-gradient(circle ${Math.abs(edge.x-p.x)}px at ${p.x}px ${p.y}px, transparent 65%, black 100%)`]:[];});
    // Creatures' glowing eyes show through small holes outside the light (C8).
    for(const g of world.eyeGlints()){const p=world.screen(g.x,g.y,g.z),edge=world.screen(g.x+g.radius,g.y,g.z);if(p.front)holes.push(`radial-gradient(circle ${Math.max(18,Math.abs(edge.x-p.x))}px at ${p.x}px ${p.y}px, transparent 45%, black 100%)`);}
    dark.style.maskImage=holes.join(',');dark.style.maskComposite='intersect';}

  // The prompt stays short (the target frame names the creature) so the biggest tappable thing on a phone stays small.
  if(started&&!modal){const e=world.nearest();$('#context-prompt').hidden=!e;$('#interact-text').textContent=t(e?e.kind==='enemy'?'Attack':e.kind==='plot'?world.state.plots[e.index!]?.crop?M.cropProgress(world.state.plots[e.index!])===1?'Harvest crop':'Check growing crop':'Plant a seed':e.name:'');}else $('#context-prompt').hidden=true;
}
// The zone banner is outlined text with a difficulty chip and no card (C2): it plays once for 2.8 s and never blocks taps.
let zoneTimer=0;
function showZone(name:string) {const info=zoneInfo(name,state.planet),banner=$('#zone-banner');$('#zone-name').textContent=t(name);$('#banner-name').textContent=t(name);$('#banner-detail').textContent=t(info.detail);$('#banner-chip').textContent=t(info.chip);banner.classList.remove('show');void banner.offsetWidth;banner.classList.add('show');clearTimeout(zoneTimer);zoneTimer=window.setTimeout(()=>banner.classList.remove('show'),2800);}
world.onZone=showZone;
const labelNodes=new Map<string,HTMLElement>();
// Labels sit just above each model's real top. Heights are measured once per
// model, and again when a Blender model replaces the procedural placeholder.
const labelHeights=new WeakMap<object,{asset:unknown;height:number}>(),labelBox=new Box3();
function labelHeight(e:Entity){
  const asset=e.mesh.userData.refinedAsset,cached=labelHeights.get(e.mesh);if(cached&&cached.asset===asset)return cached.height;
  labelBox.setFromObject(e.mesh);const height=Number.isFinite(labelBox.max.y)?Math.min(8,labelBox.max.y+.15):3.3;
  labelHeights.set(e.mesh,{asset,height});return height;
}
// Place names are pinned to one point on their building (wy above it, back towards the pond's far edge) and re-projected every
// frame with no clamping or nudging, so they never slide around. A label that would leave the screen, sit under a HUD panel or
// cover a more important label fades out where it is instead of moving. 'covered' is decided 8 times a second, the rest per frame.
interface LabelAnchor {e:Entity;wy:number;back:number;centre:boolean;w:number;h:number;covered:boolean;off:boolean}
const labelAnchors=new Map<string,LabelAnchor>();
let hudPanels:{left:number;right:number;top:number;bottom:number}[]=[];
function measureHud(){hudPanels=[];document.querySelectorAll('#hud .player-card,#hud .top-actions,#hud .tracker-stack,#hud .minimap,#boss-bar,#target-frame,#hud .skills,#hud .home-button,#context-prompt,#touch-controls').forEach(node=>{const r=node.getBoundingClientRect();if(r.width&&r.height)hudPanels.push(r);});}
/** The label's screen box at its anchor: bottom centre for buildings, centre for the small crop marks. */
function labelRect(a:LabelAnchor){const p=world.screen(a.e.x,a.wy,a.e.z-a.back),top=p.y-(a.centre?a.h/2:a.h);return {x:p.x,y:p.y,front:p.front,left:p.x-a.w/2,right:p.x+a.w/2,top,bottom:top+a.h};}
const boxesMeet=(a:{left:number;right:number;top:number;bottom:number},b:{left:number;right:number;top:number;bottom:number})=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
function updateLabels() {
  if(!started)return;
  measureHud();const near=world.nearest(),candidates:{a:LabelAnchor;rank:number;distance:number}[]=[],active=new Set<string>();
  for(const e of world.entities){
    const distance=Math.hypot(e.x-world.position.x,e.z-world.position.z);
    let text=t(e.name),icon=e.icon,y:number,back=0,className='world-label',rank=2,reach=world.selected===e?30:11,aria='';
    if(e.kind==='plot'){
      // Compact crop labels (reference 29/09, RG-05): a ready badge or a 22x5 growth bar on the bed's front edge, nothing on
      // empty beds (the context button says "Plant a seed"); the seconds left are only in the bed panel.
      const plot=world.state.plots[e.index!];if(!plot?.crop)continue;const progress=M.cropProgress(plot);y=.12;back=-.88*M.BED_SCALE;reach=22;text='';
      if(progress>=1){icon='👆';className+=' plot-label ready';rank=1;aria=`${t(M.CROPS[plot.crop].name)} ready to harvest in garden bed ${e.index!+1}`;}
      else{icon=`<b style="width:${Math.round(progress*100)}%"></b>`;className+=' plot-label growing';rank=3;aria=`${t(M.CROPS[plot.crop].name)} growing in garden bed ${e.index!+1}, ${Math.ceil((1-progress)*M.CROPS[plot.crop].duration/1000)} seconds left`;}
    }else if(e.kind==='fish'&&e.pond){
      if(fishGame&&fishPond===e)continue;y=.35;back=e.pond.rz*1.02;
    }else if(e.kind==='enemy')continue; // Creature HP bars take their own path (hud-combat.ts), which never drops a bar.
    else y=labelHeight(e);
    if(distance>reach)continue;
    // The place the context button points at, or the selected one, always wins and is highlighted.
    if(e===near||e===world.selected){rank=0;if(e.kind!=='plot')className+=' near';}
    let label=labelNodes.get(e.id);
    if(!label){label=document.createElement('div');label.dataset.entity=e.id;label.setAttribute('role','img');labelNodes.set(e.id,label);$('#world-labels').append(label);}
    const html=localizeHtml(e.kind==='plot'?`<span>${icon}</span>`:`<span>${icon}</span>${esc(text)}`);let a=labelAnchors.get(e.id);
    if(label.className!==className){label.className=className;if(a)a.w=0;}
    if(label.innerHTML!==html){label.innerHTML=html;if(a)a.w=0;}
    label.setAttribute('aria-label',t(e.kind==='plot'?aria:text));label.hidden=!!modal;
    if(!a){a={e,wy:y,back,centre:e.kind==='plot',w:0,h:0,covered:false,off:false};labelAnchors.set(e.id,a);}
    a.e=e;a.wy=y;a.back=back;if(!a.w){a.w=label.offsetWidth;a.h=label.offsetHeight;}
    active.add(e.id);candidates.push({a,rank,distance});
  }
  for(const[id,node]of labelNodes)if(!active.has(id)){node.remove();labelNodes.delete(id);labelAnchors.delete(id);}
  // Nearest and most important labels win; a label that would cover one of them fades out (it is never moved).
  candidates.sort((p,q)=>p.rank-q.rank||p.distance-q.distance);
  const placed:ReturnType<typeof labelRect>[]=[];
  for(const c of candidates){const r=labelRect(c.a);c.a.covered=placed.some(o=>boxesMeet(o,r));if(!c.a.covered&&labelShows(r))placed.push(r);}
  positionLabels();
}
/** On screen in full and clear of the HUD panels. */
const labelShows=(r:ReturnType<typeof labelRect>)=>r.front&&r.left>=2&&r.right<=innerWidth-2&&r.top>=2&&r.bottom<=innerHeight-2&&!hudPanels.some(p=>boxesMeet(p,r));

/** Re-project the labels after each render so they move in step with the camera instead of trailing it. */
function positionLabels(){
  combatHud.frame(world.enemies,world.selected,world.position.x,world.position.z,!started||!!modal);
  if(!started||modal)return;
  for(const [id,a] of labelAnchors){
    const node=labelNodes.get(id);if(!node)continue;const r=labelRect(a),off=a.covered||!labelShows(r);
    node.style.transform=`translate(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px) translate(-50%,${a.centre?'-50%':'-100%'})`;
    if(off!==a.off){a.off=off;node.toggleAttribute('data-off',off);}
  }
}
/** Sparkles, the XP number and a few orbs flying into the bag when a crop comes up. */
function harvestBurst(index:number,crop:M.CropId){
  const e=world.entities.find(x=>x.kind==='plot'&&x.index===index);if(!e)return;
  world.fx?.burst({x:e.x,z:e.z},{n:10,color:['#9be36f','#ffe66d','#ffffff'],glow:true,speed:3,up:5,y:.4});
  world.fx?.orbs({x:e.x,z:e.z},2,'#9be36f',()=>world.position);
  floating('+'+M.CROPS[crop].xp+' XP',e.x,e.z,'xp');tone('harvest');
}
function plantBurst(index:number){const e=world.entities.find(x=>x.kind==='plot'&&x.index===index);if(e)world.fx?.burst({x:e.x,z:e.z},{n:6,color:['#8a5a3a','#6a3f2a'],size:.1,speed:2,up:3,y:.25});}
/** Ripe tap: harvest every ripe bed in the garden (the user's rule; the reference stops at 5 m), nearest first, 140 ms apart, then one summary toast. */
function harvestNearby(index:number){
  // Hold the beds themselves: storing a bed meanwhile shifts the indices.
  const beds=M.ripeNearby(state,index).map(i=>state.plots[i]);let gathered=0,last:M.CropId|null=null;
  beds.forEach((bed,n)=>{const run=()=>{
    const i=state.plots.indexOf(bed),crop=i<0||visiting||world.planet!=='home'?null:change(()=>M.harvest(state,i));
    if(crop){gathered++;last=crop;harvestBurst(i,crop);world.syncCrops();}
    if(n===beds.length-1&&last)toast(gathered>1?`Harvested ${gathered} crops from the garden.`:`${t(M.CROPS[last].name)} harvested.`,M.CROPS[last].icon);
  };if(n)setTimeout(run,n*140);else run();});
}
function growText(plot:M.Plot){const progress=M.cropProgress(plot);return progress>=1?'Ripe! Close this panel and tap the bed to harvest.':`About ${Math.ceil((1-progress)*M.CROPS[plot.crop!].duration/1000)} seconds until ripe`;}
/**
 * The garden's grow button (reference openSeeds/openPlot): place a kit already in the bag, else buy one with energy
 * (grey while it is out of reach), or a note at the cap. Only at home, never while visiting.
 */
function expandButton(growing:boolean){
  if(visiting||state.planet!=='home')return '';
  const kits=state.bag.plot_kit||0,cost=M.gardenExpansionCost(state);
  if(state.plots.length>=M.STARTING_PLOTS+M.MAX_EXTRA_PLOTS)return `<button class="soft-button wide grow-button" data-action="expand">🌱 Your garden has the maximum ${M.MAX_EXTRA_PLOTS} extra beds</button>`;
  const label=growing?`➕ Expand garden: add 1 bed (${kits?'one in your bag':`ϟ ${cost}`})`:kits?`➕ Place another bed (${kits} in your bag)`:`➕ Expand garden: add 1 bed (ϟ ${cost})`;
  return `<button class="${kits||state.energy>=cost?'primary':'soft-button'} wide grow-button" data-action="expand">${label}</button>`;
}
/**
 * Reference buyPlot: pay for a garden bed kit if none is in the bag. The bed then goes down by itself on the free spot
 * nearest the garden, or, with "Place new beds myself" on, the see-through bed lets the player choose the spot.
 */
function buyPlot(){
  const result=change(()=>M.readyPlotKit(state));
  if(result==='max')toast(`Your garden already has the maximum ${M.MAX_EXTRA_PLOTS} extra beds.`,'🌱');
  else if(result==='away')toast('Garden beds belong at home. Return to your garden first.','🏡');
  else if(result==='energy')toast(`You need ${M.gardenExpansionCost(state)} energy to expand the garden.`,'ϟ');
  else{if(result==='bought')tone('coin');beginPlacement('plot_kit');}
}
/** Puts a bed kit from the bag down automatically (expandGarden picks the spot); the kit stays in the bag if there is no room. */
function autoPlaceBed(){
  if(!change(()=>M.expandGarden(state))){toast('There is no free spot left for another bed. Your kit stays in your bag.','🌱');return;}
  const i=state.plots.length-1,p=M.bedPosition(state,i);closeDialog();world.syncCrops();plantBurst(i);tone('pop');
  world.fx?.burst({x:p.x,z:p.z},{n:10,color:['#9be36f','#ffe66d'],glow:true,speed:2.5,up:4,y:.3});
  toast('A new garden bed! Tap it to plant.','🌱');
}
function plotDialog(index:number) {
  if(visiting){toast(t('{owner}’s garden is for admiring. Your own garden is waiting at home.',{owner:visiting}),'🌷');return;}
  activePlot=index;const plot=state.plots[index];if(!plot)return;
  if(plot.crop&&M.cropProgress(plot)>=1){harvestNearby(index);return;}
  if(plot.crop){
    // Reference openPlot: the crop with a big progress bar, a card per fertilizer, a tip when there is none, then expand.
    const crop=M.CROPS[plot.crop],progress=M.cropProgress(plot),fertilizer=(['manure','spore'] as const).map(id=>{const n=state.bag[id]||0,item=M.ITEMS[id];
      return `<div class="crop-row garden-row fertilizer-row"><span class="crop-art">${art(id,item.icon)}</span><div><strong>${esc(t(item.name))} <span class="chip">×${n}</span></strong><p>${esc(item.desc)}</p></div><button class="primary" data-action="${id==='spore'?'fertilize':'fertilize-manure'}" ${n?'':'disabled'}>Use</button></div>`;}).join('');
    openDialog('plot','Growing bed',`<div class="crop-row garden-row bed-status"><span class="crop-art">${art(plot.crop,crop.icon)}</span><div><strong>${esc(t(crop.name))}</strong><div class="grow-meter big"><i id="grow-fill" style="width:${progress*100}%"></i></div><p class="muted" id="grow-time">${growText(plot)}</p></div></div>${fertilizer}${!state.bag.manure&&!state.bag.spore?'<p class="garden-tip">💡 Defeat Grumpy Mushrooms, Wild Boars, Snapping Flowers… to collect fertilizer, or buy it at the equipment shop.</p>':''}${expandButton(true)}`,'GARDEN BED '+(index+1),art(plot.crop,crop.icon));return;
  }
  const empty=state.plots.filter(p=>!p.crop).length;
  // Unlocked crops first, then locked ones by the level that opens them.
  const crops=Object.entries(M.CROPS).sort(([,a],[,b])=>Number(state.level<a.level)-Number(state.level<b.level)||a.level-b.level);
  // Reference openSeeds: the grow button first, "store this bed" on an extra bed, then the seeds. A ripe tap gathers the
  // ripe beds around it, so the old "Harvest all" button is gone from here.
  openDialog('plant','Choose a seed',`${expandButton(false)}<div class="garden-actions">${M.isExtraBed(state,index)?'<button class="soft-button" data-action="store-bed">🎒 Store this bed</button>':''}<span>${state.plots.length} / ${M.STARTING_PLOTS+M.MAX_EXTRA_PLOTS} beds · ${empty} empty</span></div><div class="crop-list">${crops.map(([id,c])=>{
    const locked=state.level<c.level,needsSeed=!!c.seed&&!state.bag[c.seed],item=M.ITEMS[id],effect=item?effectText(item):'';
    return `<div class="crop-row garden-row ${locked?'locked':''}"><span class="crop-art">${art(id,c.icon)}</span><div><strong>${esc(t(c.name))}</strong>${effect?`<p>${esc(effect)}</p>`:''}<div class="chips"><span class="chip chip-time">⏱ ${c.duration/1000}s</span><span class="chip chip-xp">✨ ${c.xp} XP</span>${item?`<span class="chip chip-energy">ϟ ${item.sell}</span>`:''}${c.seed?`<span class="chip chip-seed">${M.ITEMS[c.seed]?mini(c.seed):'🌰'} ${state.bag[c.seed]||0} seeds</span>`:''}</div></div>${locked?`<span class="chip chip-lock">🔒 Level ${c.level}</span>`:`<div class="button-row"><button class="primary" data-action="plant" data-item="${id}" ${needsSeed?'disabled':''}>Plant</button><button class="sky-button" data-action="plant-all" data-item="${id}" ${needsSeed||!empty?'disabled':''}>All (${c.seed?Math.min(empty,state.bag[c.seed]||0):empty})</button></div>`}</div>`;
  }).join('')}</div>`,'YOUR GARDEN');
}
function inventory() {
  const entries=Object.entries(state.bag).filter(([,n])=>n!>0) as [M.ItemId,number][];
  const slots:[M.GearSlot,string,string][]=[['weapon','⚔️','Weapon'],['hat','👒','Hat'],['outfit','🧥','Outfit'],['boots','👟','Boots'],['pet','🐾','Pet'],['disguise','🎭','Disguise']];
  if(selectedItem&&!state.bag[selectedItem])selectedItem=null;
  const item=selectedItem?M.ITEMS[selectedItem]:null,stats=M.activeStats(state),slot=item?.slot;
  openDialog('bag','Your explorer & backpack',`<div class="stat-strip"><span>❤️ <b>${Math.ceil(state.hp)}/${Math.round(stats.maxHp)}</b></span><span>⚔️ <b>${stats.attack.toFixed(1)}</b></span><span>🛡️ <b>${stats.defense}</b></span><span>💨 <b>${stats.speed.toFixed(1)}</b></span><span>✨ <b>${Math.round(stats.critChance*100)}% crit</b></span></div><div class="equipment">${slots.map(([key,icon,name])=>`<div><button data-action="inspect" data-item="${state.gear[key]||''}" ${!state.gear[key]?'disabled':''}><span>${state.gear[key]?art(state.gear[key]!,M.ITEMS[state.gear[key]!].icon):icon}</span><small>${state.gear[key]?esc(t(M.ITEMS[state.gear[key]!].name)):name}</small></button>${state.gear[key]?`<button class="unequip" data-action="unequip" data-slot="${key}" aria-label="Unequip ${name}">Remove</button>`:''}</div>`).join('')}</div><div class="section-label">BACKPACK <span>${entries.reduce((n,[,q])=>n+q,0)} items</span></div><div class="inventory-grid">${entries.map(([id,count])=>`<button class="item-tile ${id===selectedItem?'selected':''}" data-action="inspect" data-item="${id}" aria-label="${esc(t(M.ITEMS[id].name))}, ${count}"><span>${art(id,M.ITEMS[id].icon)}</span><b>${count}</b><small>${esc(t(M.ITEMS[id].name))}</small>${Object.values(state.gear).includes(id)?'<i>Equipped</i>':''}</button>`).join('')||'<div class="empty-state"><span>🎒</span><strong>Your first harvest belongs here.</strong></div>'}</div>${item?`<div class="item-detail"><span class="item-hero">${art(selectedItem!,item.icon)}</span><div><h3>${esc(t(item.name))}</h3><p>${esc(item.desc)}</p><div class="button-row">${item.weapon?.kind==='rod'?'<span class="chip">Automatic near water</span>':slot?`<button class="primary" data-action="equip" data-item="${selectedItem}" ${state.gear[slot]===selectedItem?'disabled':''}>${state.gear[slot]===selectedItem?'Equipped':'Equip'}</button>`:''}${item.heal||item.buff?`<button class="primary" data-action="eat" data-item="${selectedItem}">Use${item.heal?` · +${item.heal} HP`:''}</button>`:''}${item.type==='decor'||item.type==='placeable'?`<button class="primary" data-action="place-decor" data-item="${selectedItem}">Place</button>`:''}</div></div></div>`:''}<div class="button-row"><button class="soft-button" data-action="go" data-kind="cook">🔥 Kitchen</button><button class="soft-button" data-action="decorations">🏡 Decorate</button><button class="soft-button" data-action="journal-tab" data-kind="collection">🐟 Fish log</button></div>`,'CHARACTER');
}
// "36 energy · 6 XP · 15 stars" becomes three coloured chips.
function rewardChips(label:string){return label.split(' · ').filter(Boolean).map(part=>{const kind=/energy|năng lượng/i.test(part)?'energy':/xp/i.test(part)?'xp':/star|sao/i.test(part)?'star':'';return `<span class="chip${kind?` chip-${kind}`:''}">${kind==='energy'?'ϟ ':kind==='xp'?'✨ ':kind==='star'?'⭐ ':''}${esc(kind?part.replace(/\s*(energy|stars?|năng lượng|sao)$/i,''):part)}</span>`;}).join('');}
// Materials as small chips: icon and have/need like the reference (the name is a tooltip and screen-reader text); red = still short.
function materialChips(materials?:M.Inventory){const list=Object.entries(materials??{}) as [M.ItemId,number][];return list.length?`<span class="chips">${list.map(([id,n])=>`<span class="chip${(state.bag[id]||0)<n?' chip-miss':''}" title="${esc(t(M.ITEMS[id].name))}">${mini(id)}<span class="vh">${esc(t(M.ITEMS[id].name))}</span> ${state.bag[id]||0}/${n}</span>`).join('')}</span>`:'';}
const JOURNAL_TABS:[ProgressKind,string][]=[['story','Story'],['daily','Daily'],['weekly','Weekly'],['achievements','Achievements'],['pass','Star pass'],['bounties','Bounties'],['collection','Collection'],['challenges','Challenges']];
function quests(){
  const entries=progressEntries(state,journalTab),claimable=entries.filter(e=>e.complete&&!e.claimed).length;
  openDialog('quests','Your adventure journal',`<nav class="panel-tabs" aria-label="Journal sections">${JOURNAL_TABS.map(([id,label])=>`<button class="${journalTab===id?'active':''}" aria-pressed="${journalTab===id}" data-action="journal-tab" data-kind="${id}">${label}</button>`).join('')}</nav><p class="intro">${journalTab==='daily'?'New tasks every day.':journalTab==='weekly'?'Resets each week.':journalTab==='pass'?'Daily and weekly stars unlock rewards.':journalTab==='bounties'?'Hunt creatures across the worlds.':journalTab==='collection'?'Fish found and your best catches.':'Every little win counts.'} ${claimable?`<b>${claimable} ready!</b>`:''}</p>${journalTab==='challenges'?`<div class="button-row">${['kill','skill','harvest','fish','boss'].map(type=>`<button class="soft-button" data-action="start-challenge" data-kind="${type}" ${state.level<2||entries.some(e=>!e.claimed)?'disabled':''}>${challengeTitle(type)}</button>`).join('')}</div>`:''}<div class="quest-list">${entries.map(e=>`<div class="quest-row ${e.claimed?'complete':e.complete?'current':''}"><span>${e.claimed?'✓':e.icon??'⭐'}</span><div><strong>${esc(e.title)}<b>${Math.min(e.progress,e.target)}/${e.target}</b></strong><small>${esc(e.description)}</small><div class="entry-meter"><i style="width:${Math.min(100,e.progress/e.target*100)}%"></i></div></div><div class="quest-reward"><span class="chips">${rewardChips(e.rewardLabel)}</span><button class="primary" data-action="progress-claim" data-kind="${journalTab}" data-id="${esc(e.id)}" ${!e.complete||e.claimed?'disabled':''}>${e.claimed?'Collected':'Collect'}</button>${journalTab==='daily'&&!e.claimed&&!e.id.endsWith('login')&&!e.id.endsWith('chest')?`<button class="text-button" data-action="reroll-daily" data-index="${Number(e.id.split(':').at(-1))}" ${state.progression.daily.rerolled?'disabled':''}>Reroll</button>`:''}</div></div>`).join('')||'<p class="empty-state">More discoveries are waiting out in the world.</p>'}</div>`,'EXPLORE • GROW • COLLECT');
  // The collection tab also shows every fish: caught ones in colour with the record size, the rest as silhouettes.
  if(journalTab==='collection'){
    const fishIds=Object.keys(M.FISH).filter(id=>M.FISH[id].rarity!=='junk'),caught=fishIds.filter(id=>state.fishRecords[id]);
    $('#dialog-body').insertAdjacentHTML('beforeend',localizeHtml(`<div class="section-label">FISH <span>${caught.length} / ${fishIds.length} caught</span></div><div class="fish-grid">${fishIds.map(id=>{const f=M.FISH[id],record=state.fishRecords[id];return `<div class="fish-card ${record?'':'unknown'} ${f.rarity}"><span>${art(id,f.icon)}</span><strong>${record?esc(f.name):'???'}</strong><small>${record?formatSize(record):f.rarity}</small></div>`;}).join('')}</div>`));
  }
  // The story tab shows the whole chapter: finished steps, the current one, then what comes next.
  if(journalTab==='story'){
    const index=state.progression.story.index,chapter=storyStep(index).chapter,steps=STORY_STEPS.map((step,i)=>({...step,i})).filter(step=>step.chapter===chapter&&index<STORY_STEPS.length);
    const list=$('#dialog-body .quest-list');if(!list||!steps.length)return;
    const done=steps.filter(step=>step.i<index).map(step=>`<div class="quest-row complete"><span>✓</span><div><strong>${esc(step.title)}</strong><small>Step ${step.i+1} · complete</small></div></div>`).join('');
    const next=steps.filter(step=>step.i>index).map(step=>`<div class="quest-row locked"><span>🔒</span><div><strong>${esc(step.title)}</strong><small>Finish the step before to unlock</small></div></div>`).join('');
    list.insertAdjacentHTML('afterbegin',localizeHtml(`<div class="chapter-banner">${esc(storyStep(index).icon??'📖')} Chapter ${chapter+1} <b>${steps.filter(step=>step.i<index).length} / ${steps.length}</b></div>${done}`));
    list.insertAdjacentHTML('beforeend',localizeHtml(next));
  }
}
const SHOP_TABS=['Weapons','Clothing','Pets','Disguises','Supplies','Decor'];
function shop(){
  const matches=(item:M.ItemDef)=>shopTab==='Weapons'?item.slot==='weapon':shopTab==='Clothing'?['hat','outfit','boots'].includes(item.slot??''):shopTab==='Pets'?item.slot==='pet':shopTab==='Disguises'?item.slot==='disguise':shopTab==='Decor'?item.type==='decor':!item.slot&&item.type!=='decor';
  const entries=Object.entries(M.ITEMS).filter(([,item])=>item.price!==undefined&&matches(item));
  openDialog('shop','Little outfitters',`<nav class="panel-tabs" aria-label="Shop categories">${SHOP_TABS.map(tab=>`<button class="${shopTab===tab?'active':''}" aria-pressed="${shopTab===tab}" data-action="shop-tab" data-kind="${tab}">${tab}</button>`).join('')}</nav><div class="shop-grid">${entries.map(([id,item])=>`<div class="shop-item"><span class="shop-icon">${art(id,item.icon)}</span><div><strong>${esc(t(item.name))}${state.bag[id]?` <small>×${state.bag[id]}</small>`:''}</strong><p>${esc(item.desc)}</p>${materialChips(item.materials)}</div><button class="primary" data-action="buy" data-item="${id}" ${state.energy<item.price!||Object.entries(item.materials??{}).some(([id,n])=>M.looseQuantity(state,id)<n!)?'disabled':''}>ϟ ${item.price}</button>${item.weapon?.kind==='rod'&&state.bag[id]?'<span class="chip">Used automatically near ponds</span>':item.slot?Object.values(state.gear).includes(id)?'<span class="chip chip-seed">✓ Equipped</span>':state.bag[id]?`<button class="sky-button" data-action="equip" data-item="${id}">Equip</button>`:'':''}</div>`).join('')||'<p class="empty-state">Visit the workshop for this collection.</p>'}</div>`,'ϟ '+state.energy+' ENERGY');
}

// The market, like the reference's (bundle @939401): one big button sells every crop, fish and junk stack; rows sell 1 or all.
function market(){const sellable=(Object.keys(state.bag) as M.ItemId[]).map(id=>[id,M.looseQuantity(state,id)] as [M.ItemId,number]).filter(([id,n])=>M.ITEMS[id].sell>0&&n>0),produce=produceLots(state);openDialog('sell','From your garden, with love',`<div class="owl-note"><span>🧺</span><p><strong>Harvest market</strong>Trade treasures for energy. Keep a snack for the trail!</p></div>${produce.total?`<button class="primary sell-produce" data-action="sell-produce">Sell all produce &amp; fish → ϟ ${produce.total}</button>`:''}<div class="shop-grid">${sellable.map(([id,n])=>`<div class="shop-item"><span class="shop-icon">${art(id,M.ITEMS[id].icon)}</span><div><strong>${esc(t(M.ITEMS[id].name))} <small>×${n}</small></strong><div class="chips"><span class="chip chip-energy">ϟ ${M.ITEMS[id].sell} each</span></div></div><div class="button-row"><button class="soft-button" data-action="sell-one" data-item="${id}">Sell 1</button>${n>1?`<button class="primary" data-action="sell-all" data-item="${id}" aria-label="Sell all for ${n*M.ITEMS[id].sell} energy">All · ϟ ${n*M.ITEMS[id].sell}</button>`:''}</div></div>`).join('')||'<div class="empty-state"><span>🌾</span><strong>Something good is growing</strong><p>Bring crops, fish, or materials to sell here.</p><button class="primary" data-action="go" data-kind="plot">Visit the garden →</button></div>'}</div>`,'ϟ '+state.energy+' ENERGY');}
// The chest as two grids of big item tiles, like the reference: tap a tile to move that stack across.
function storage(){const tiles=(inv:M.Inventory,toChest:boolean)=>(Object.entries(inv)as[M.ItemId,number][]).filter(([,n])=>n>0).map(([id,n])=>{const name=esc(t(M.ITEMS[id].name)),locked=toChest&&M.looseQuantity(state,id)===0;return `<button class="chest-slot" data-action="transfer" data-item="${id}" data-direction="${toChest?'store':'take'}" ${locked?'disabled':''} title="${name}" aria-label="${toChest?'Store':'Take'} ${name}, ${n}${locked?' (equipped)':''}"><span>${art(id,M.ITEMS[id].icon)}</span>${n>1?`<b>${n}</b>`:''}</button>`;}).join('');openDialog('chest','Keep your treasures safe',`<p class="intro">Tap an item to move it between your backpack and the chest. Chest items stay safe if you get knocked out.</p><div class="storage-columns"><div><h3>🎒 Backpack</h3>${tiles(state.bag,true)?`<div class="chest-grid">${tiles(state.bag,true)}</div>`:'<p class="muted">Nothing here yet.</p>'}</div><div><h3>📦 Chest</h3>${tiles(state.chest,false)?`<div class="chest-grid">${tiles(state.chest,false)}</div>`:'<p class="muted">Room for something special.</p>'}</div></div>`,'YOUR STORAGE CHEST');}
// The wishing crystal, like the reference's openUpgrade: energy on top, one compact card per stat with level, current value and gain.
/** The crystal answers a wish: a ring and sparks at the crystal and "<icon> <name> ↑" over the explorer, as in the reference. */
function upgradeFeedback(kind:keyof typeof M.UPGRADES){const crystal=world.entities.find(e=>e.kind==='upgrade'),def=M.UPGRADES[kind];if(crystal){world.fx?.ring({x:crystal.x,z:crystal.z},{color:'#8ef6ff',to:3,life:.6});world.fx?.burst({x:crystal.x,z:crystal.z},{n:20,color:['#8ef6ff','#d68cff','#ffffff'],glow:true,speed:4,up:8,y:1.6});}floating(`${def.icon} ${t(def.name)} ↑`,world.position.x,world.position.z,'lvl');}
/** The on-screen movement pad shows only when chosen in Settings (the reference is tap-to-move only). */
function applyMovePad(){$('#hud').classList.toggle('move-pad',!!state.settings.movePad);movement.clear();measureHud();}
function upgrades(){openDialog('upgrade','A wish for something more',`<div class="en-head">Energy: <b>ϟ ${state.energy.toLocaleString()}</b></div><div class="upgrade-cards">${upgradeCards(state).map(c=>`<div class="upgrade-card"><span class="upgrade-icon">${c.icon}</span><div><strong>${t(c.name)} <small>Level ${c.level}</small></strong><p>Now: ${c.now} • ${c.gain}</p></div><button class="primary" data-action="upgrade" data-kind="${c.kind}" ${c.affordable?'':'disabled'}>${c.max?'MAX':`ϟ ${c.cost}`}</button></div>`).join('')}</div>`,'THE WISHING CRYSTAL');}
function cooking(){const ingredients=Object.entries(state.bag).filter(([id,n])=>n!>0&&M.ITEMS['cooked_'+id]);openDialog('cook','A warm meal for the trail',`<p class="intro">Cooked food heals more and lasts longer. Cooking here is free.</p><div class="shop-grid">${ingredients.map(([id,n])=>`<div class="shop-item"><span class="shop-icon">${art(id,M.ITEMS[id].icon)}</span><div><strong>${esc(t(M.ITEMS[id].name))} <small>×${n}</small></strong><p>${esc(M.ITEMS['cooked_'+id].desc)}</p></div><div class="button-row"><button class="soft-button" data-action="cook-one" data-item="${id}">Cook 1</button><button class="primary" data-action="cook-all" data-item="${id}" aria-label="Cook all">All</button></div></div>`).join('')||'<p class="empty-state">Bring crops, fish, or meat from your adventures.</p>'}</div>${dishesHtml(state,farmUi)}`,'VOLCANO KITCHEN');}
/**
 * The animal pen (farm.ts, farm-ui.ts, farm-view.ts). A tap on the pen or an animal collects every waiting egg and
 * bottle of milk, nearest first and 140 ms apart like the harvest; with nothing waiting it opens the pen panel.
 */
const farmUi:FarmUi={art,esc,mini,chips:materialChips,effect:effectText};let penShown='';
function penDialog(){if(visiting)return;penShown=penSignature(state);const built=M.penBuilt(state);openDialog('pen',built?'Your animal pen':'A spot for an animal pen',penHtml(state,farmUi),built?'ANIMAL PEN':'PEN SITE',built?'🐔':'🪧');}
/** Buys the pen: the yard and coop pop up on the plot with a burst, then the panel offers animals. */
function buildPenAction(){
  const check=M.canBuildPen(state);
  if(check==='energy'){toast(`You need ${M.PEN_BUILD.price} energy to build the pen.`,'ϟ');return;}
  if(!change(()=>M.buildPen(state)))return;
  world.showPenBuilt();tone('success');world.fx?.burst({x:M.PEN.x,z:M.PEN.z},{n:22,color:['#ffe66d','#f2cf5b','#ffffff','#ff9ec4'],glow:true,speed:3.2,up:5,y:.5});
  // Close the panel so the yard is seen popping up, then offer the animals.
  closeDialog();toast('The animal pen is built! Buy a chick to get started.','🐔');setTimeout(()=>{if(!modal)penDialog();},1100);
}
function penTap(){if(M.readyAnimals(state).length)collectFarm();else penDialog();}
function feedBurst(uid:number){const p=world.farmView?.positionOf(uid);if(p)world.fx?.burst({x:p.x,z:p.z},{n:6,color:['#9be36f','#ffe66d'],size:.08,speed:1.5,up:3,y:.4});}
function collectFarm(){
  if(visiting||world.planet!=='home')return;
  const collectingState=state;
  const me=world.position,order=M.readyAnimals(state).map(a=>({a,p:world.farmView?.positionOf(a.uid)??{x:M.PEN.x,z:M.PEN.z}})).sort((x,y)=>Math.hypot(x.p.x-me.x,x.p.z-me.z)-Math.hypot(y.p.x-me.x,y.p.z-me.z));
  const got:M.Collected[]=[];if(modal==='pen')closeDialog();
  order.forEach(({a},n)=>{const run=()=>{
    if(state!==collectingState||visiting||world.planet!=='home')return;
    const [c]=change(()=>M.collectProducts(state,Date.now(),[a.uid]));
    if(c){got.push(c);world.farmView?.collect(c.uid,c.item);const p=world.farmView?.positionOf(c.uid);if(p){world.fx?.burst({x:p.x,z:p.z},{n:8,color:['#fff7c2','#ffe66d','#ffffff'],glow:true,speed:3,up:5,y:.6});world.fx?.orbs({x:p.x,z:p.z},2,'#ffe66d',()=>world.position);floating('+'+M.ANIMALS[c.kind].xp+' XP',p.x,p.z,'xp');}tone('harvest');}
    if(n===order.length-1&&got.length)toast(collectText(got),M.ITEMS[got[0].item].icon);
  };if(n)setTimeout(run,n*140);else run();});
}
function buyAnimal(kind:M.AnimalKind){
  const check=M.canBuyAnimal(state,kind),d=M.ANIMALS[kind];
  if(check==='energy'){toast(`You need ${d.price} energy for a ${d.baby.toLowerCase()}.`,'ϟ');return;}
  const a=change(()=>M.buyAnimal(state,kind));if(!a)return;
  tone('coin');toast(`A little ${d.baby.toLowerCase()} joined your pen!`,d.babyIcon);penDialog();
  setTimeout(()=>{const p=world.farmView?.positionOf(a.uid);if(p)world.fx?.burst({x:p.x,z:p.z},{n:12,color:['#ffd6e8','#ffe66d','#ffffff'],glow:true,speed:2.5,up:4,y:.3});},50);
}
function crafting(){
  const recipes=M.RECIPES.map((recipe,index)=>({...recipe,index})).filter(r=>r.station===craftStation),categories=['All',...new Set(recipes.map(r=>r.category))];
  if(!categories.includes(craftTab))craftTab='All';
  openDialog('craft',craftStation==='forge'?'The ember forge':'Made with a little magic',`<nav class="panel-tabs" aria-label="Workshop categories">${categories.map(category=>`<button class="${craftTab===category?'active':''}" data-action="craft-tab" data-kind="${esc(category)}">${esc(category)}</button>`).join('')}</nav><div class="shop-grid">${recipes.filter(r=>craftTab==='All'||r.category===craftTab).map(r=>`<div class="shop-item"><span class="shop-icon">${art(r.result,M.ITEMS[r.result].icon)}</span><div><strong>${esc(t(M.ITEMS[r.result].name))}${r.count&&r.count>1?` ×${r.count}`:''}</strong><p>${esc(M.ITEMS[r.result].desc)}</p>${materialChips(r.materials)}</div><button class="primary" data-action="craft" data-index="${r.index}" aria-label="Craft for ${r.energy} energy" ${!M.canCraft(state,r.index)?'disabled':''}><span class="wide-label">Craft </span>ϟ ${r.energy}</button></div>`).join('')||'<p class="empty-state">Collect materials on your travels, then return.</p>'}</div>`,craftStation==='forge'?'LAVA FURNACE':'WORKSHOP');
}
function decorations(){
  const owned=Object.entries(state.bag).filter(([id,n])=>n!>0&&(M.ITEMS[id].type==='decor'));
  openDialog('decor','Make this place your own',`<p class="intro">Pick an item, tap the ground to move it, ↻ turns it, then ✔ Place.</p><div class="shop-grid">${owned.map(([id,n])=>`<div class="shop-item"><span class="shop-icon">${art(id,M.ITEMS[id].icon)}</span><div><strong>${esc(t(M.ITEMS[id].name))} ×${n}</strong></div><button class="primary" data-action="place-decor" data-item="${id}">Place</button></div>`).join('')||'<p class="muted">No decorations yet. Find them in the shop’s Decor tab.</p>'}</div><div class="section-label">PLACED AT HOME</div><div class="shop-grid">${state.decorations.map(d=>`<div class="storage-row"><span>${mini(d.id)} ${esc(t(M.ITEMS[d.id].name))}</span><button class="soft-button" data-action="remove-decor" data-id="${d.uid}">Pack away</button></div>`).join('')||'<p class="muted">A fresh canvas.</p>'}</div><button class="soft-button" data-action="decor-shop">Browse decorations</button>`,'YOUR HOME');
}
/**
 * Placing a garden bed kit or a decoration (reference decor.startPlace/moveGhost/rotate/confirm): a see-through model
 * 2.2 m ahead of the explorer, turned to their facing in 45° steps; taps on the ground move it, ↻ turns it 45°, ✔ Place
 * puts it down where the spot is free, and the ghost and bar turn red where it is not.
 */
function beginPlacement(id:string){if(visiting)return;if(state.planet!=='home'){toast('Decorations belong at home. Return to your garden first.','🏡');return;}
  const item=M.ITEMS[id],bed=item?.type==='placeable';if(!item||!state.bag[id])return;
  if(bed&&state.plots.length>=M.STARTING_PLOTS+M.MAX_EXTRA_PLOTS){toast(`Your garden already has the maximum ${M.MAX_EXTRA_PLOTS} extra beds.`,'🌱');return;}
  if(!bed&&state.decorations.length>=M.MAX_DECORATIONS){toast(`Your garden already holds ${M.MAX_DECORATIONS} decorations.`,'🏡');return;}
  if(bed&&!state.settings.placeBeds){autoPlaceBed();return;}
  closeDialog();const step=Math.PI/4;
  placement={id,rotation:Math.round(world.facing/step)*step+Math.PI,x:0,z:0,ok:false};
  $('#placement-bar').hidden=false;document.body.classList.add('placing');$('#placement-name').innerHTML=localizeHtml(`Place <b>${esc(t(item.name))}</b>: tap the garden to choose a spot`);
  movePlacement(world.position.x+Math.sin(world.facing)*2.2,world.position.z+Math.cos(world.facing)*2.2);
  if(bed)toast('Tap an empty spot in the garden to choose where, then press ✔ Place.','👆');
}
function cancelPlacement(){placement=null;$('#placement-bar').hidden=true;document.body.classList.remove('placing');$('#placement-bar').classList.remove('bad');world.placementGhost(null);}
function movePlacement(x:number,z:number){
  if(!placement)return;placement.x=Math.round(x*100)/100;placement.z=Math.round(z*100)/100;const {id,rotation}=placement;
  placement.ok=M.ITEMS[id]?.type==='placeable'?M.bedSpotOk(state,placement.x,placement.z,rotation):M.decorSpotOk(state,placement.x,placement.z)&&!world.blocked(placement.x,placement.z);
  world.placementGhost(placement);$('#placement-bar').classList.toggle('bad',!placement.ok);
  $('#placement-hint').textContent=t(placement.ok?'':'Blocked here or outside the fence');
}
function rotatePlacement(){if(!placement)return;placement.rotation=(placement.rotation+Math.PI/4)%(Math.PI*2);movePlacement(placement.x,placement.z);tone('pop');}
function confirmPlacement(){
  if(!placement)return;const {id,x,z,rotation,ok}=placement,item=M.ITEMS[id];
  if(!ok){toast('Can’t place it here (blocked by something or outside the fence).','❌');return;}
  // The kit pays for the bed: without one expandGarden would charge energy, so a vanished item just ends placement.
  if(!state.bag[id]){cancelPlacement();return;}
  if(!change(()=>M.placeDecoration(state,id,x,z,rotation))){movePlacement(x,z);return;}
  cancelPlacement();
  if(item.type==='placeable'){world.syncCrops();plantBurst(state.plots.length-1);tone('pop');toast('A new garden bed! Tap it to plant.','🌱');}
  else{world.syncDecorations();tone('success');toast(`${t(item.name)} placed.`,'🏡');}
}
function placeAt(x:number,y:number){const point=world.groundPoint(x,y);if(placement&&point)movePlacement(point.x,point.z);}

/** Star-map routes for the current save: easiest first, with locks and the recommended pick. */
function starRoutes(){return planRoutes(starRouteInput());}
function starRouteInput(){return ({from:state.planet,level:state.level,discovered:state.discovered,levels:Object.fromEntries(Object.entries(M.PLANETS).map(([id,p])=>[id,p.level])) as Record<M.PlanetId,number>});}
/** The starship's star map: every planet easiest first; pick an open one and the autopilot flies you there. */
function planets(){
  const ready=state.energy>=M.LAUNCH_COST,all=Object.keys(M.PLANETS).length,routes=planRoutes({from:state.planet,level:state.level,discovered:state.discovered,levels:Object.fromEntries(Object.entries(M.PLANETS).map(([id,p])=>[id,p.level])) as Record<M.PlanetId,number>});
  const names=(ids:string[])=>ids.map(b=>t(ENEMY_TYPES[b]?.name??b)).join(', ');
  const card=(r:RouteOption)=>{
    const p=M.PLANETS[r.id],lv=`<span class="${state.level<r.level?'miss':''}">⭐ ${t('Lv {level}',{level:r.level})}</span>`;
    const why=r.lock==='here'?`<b class="planet-here">📍 ${t('You are here')}</b>`:r.lock==='undiscovered'?`<b class="route-lock">🔭 ${t('Not discovered yet')}</b>`:r.lock==='level'?`<b class="route-lock">🔒 ${t('Needs level {level}',{level:r.level})}</b>`:r.lock==='fuel'?`<b class="route-lock">⛽ ${t('Too far for one tank')}</b>`:!ready?`<b class="route-lock">ϟ ${t('Needs ϟ {amount}',{amount:M.LAUNCH_COST})}</b>`:`<b class="route-go">🚀 ${t('Fly here')}</b>`;
    const off=!!r.lock||!ready,cls=`planet-card route${r.lock?' locked':''}${r.recommended?' recommended':''}${r.lock==='here'?' here':''}`;
    if(!r.discovered)return `<button class="${cls} mystery" data-action="fly-to" data-kind="${r.id}" disabled aria-label="${esc(t('Mysterious planet'))}"><span class="planet-ball">❓</span><span class="route-info"><b class="route-name">${t('Mysterious planet')}</b><span class="planet-tags">${lv}</span><small>${t('Fly out and follow the ? on the radar to find it.')}</small></span>${why}</button>`;
    return `<button class="${cls}" data-action="fly-to" data-kind="${r.id}" ${off?'disabled':''} aria-label="${esc(t(p.name))}"><span class="planet-ball" style="background:radial-gradient(circle at 32% 30%,${p.grad[0]},${p.grad[1]} 60%,${p.grad[2]})">${p.icon}</span><span class="route-info"><b class="route-name">${t(p.name)}${r.recommended?` <i class="route-best">★ ${t('Recommended')}</i>`:''}</b><span class="planet-tags">${lv}${r.lock==='here'?'':`<span>📏 ${r.distance} · ⛽ ${r.fuel}</span>`}</span><small>🐾 ${names([...new Set(p.spawns.map(s=>s[0]))])}</small><small>👑 ${names(p.bosses)}</small></span>${why}</button>`;
  };
  openDialog('travel','Starship Sprout',`<div class="starmap-fuel"><span>⛽</span><div><strong>Tank: ϟ ${M.LAUNCH_COST}</strong><small>You have ϟ ${state.energy}</small></div><button class="primary launch-button" data-action="launch" ${ready?'':'disabled'}>${ready?'🚀 Take off!':`Needs ϟ ${M.LAUNCH_COST}`}</button></div>
    <p class="intro">${t('Pick a planet and the autopilot flies you there and lands, or take off and fly it yourself.')}</p>
    <h3 class="starmap-title">🔭 Discovery log · ${state.discovered.length} / ${all} · ${t('easiest first')}</h3><div class="planet-grid route-list">${routes.map(card).join('')}</div>`,'STAR MAP','🚀');
}
function map(){openDialog('map','Every path is a possibility',`<p class="intro">Choose a place and your explorer will walk there.</p><div class="map-illustration"><div class="map-path"></div><span class="map-house">🏡</span><span class="map-trees">🌳 🌲 🌳</span><span class="map-garden">🌱 🌱</span><span class="map-pond">🎣</span><span class="map-rocket">🚀</span><span class="map-stall">🧺</span><b>Clover Village</b></div><div class="map-destinations">${(state.planet==='home'?[['plot','🌱','Garden'],['sell','🧺','Market'],['shop','🛍️','Outfitters'],['fish','🎣','Pond'],['upgrade','💎','Crystal'],['craft','🔨','Workshop'],['chest','📦','Storage'],['travel','🚀','Rocket']]:[['mine','💎','Crystal vein'],['travel','🚀','Rocket']]).map(([kind,icon,name])=>`<button class="soft-button" data-action="go" data-kind="${kind}">${icon} ${name}</button>`).join('')}${(world.planet==='home'?[['forest','🍄 Mushroom Forest'],['meadow','🌊 Lake Meadow'],['swamp','🌿 Chomper Swamp'],['canyon','🏜️ Redrock Canyon']]:[['wild','Explore the wild']]).map(([kind,label])=>`<button class="soft-button" data-action="wild" data-kind="${kind}">${label}</button>`).join('')}</div><p class="fineprint">${state.visited.length} of 9 worlds discovered · Click the ground to choose your own path.</p>`,'YOUR EXPLORER’S MAP');}
function settings(){openDialog('settings','Your little preferences',`<div class="settings-row"><div><strong>Language</strong><small>Choose your language</small></div>${languageSelector('settings')}</div><div class="settings-row"><div><strong>Gentle sound effects</strong><small>Soft notes for everyday discoveries</small></div><button class="toggle ${state.settings.sound?'on':''}" role="switch" aria-checked="${state.settings.sound}" aria-label="Sound effects" data-action="sound"></button></div><div class="settings-row"><div><strong>Show movement pad</strong><small>Arrow buttons on touch screens. Tapping the ground always works.</small></div><button class="toggle ${state.settings.movePad?'on':''}" role="switch" aria-checked="${!!state.settings.movePad}" aria-label="Show movement pad" data-action="move-pad"></button></div><div class="settings-row"><div><strong>Graphics</strong><small>${graphics.setting==='auto'?`Automatic · now ${QUALITY[graphics.level].label}`:QUALITY[graphics.level].label} · ${graphics.ratio.toFixed(2)}× resolution${graphics.fps?` · ${Math.round(graphics.fps)} fps`:''}</small></div><div class="segmented" role="radiogroup" aria-label="Graphics quality">${(['auto','high','medium','low'] as QualitySetting[]).map(q=>`<button role="radio" aria-checked="${graphics.setting===q}" class="${graphics.setting===q?'on':''}" data-action="graphics" data-kind="${q}">${q==='auto'?'Auto':QUALITY[q].label}</button>`).join('')}</div></div><div class="settings-row"><div><strong>Place new beds myself</strong><small>Off: a new garden bed goes down by itself next to the garden</small></div><button class="toggle ${state.settings.placeBeds?'on':''}" role="switch" aria-checked="${!!state.settings.placeBeds}" aria-label="Place new beds myself" data-action="place-beds"></button></div><div class="settings-row"><div><strong>Camera distance</strong><small>See more of your little world</small></div><div class="button-row"><button class="soft-button" data-action="zoom-in" aria-label="Zoom in">−</button><span id="zoom-value">${Math.round(world.zoom*100)}%</span><button class="soft-button" data-action="zoom-out" aria-label="Zoom out">＋</button></div></div><div class="save-note">🌱 <span>Your progress saves automatically ${persistence?'to your online account':'in this browser'}.${saveFailed?' Storage is unavailable. Keep this tab open to preserve this session.':''}</span></div><div class="button-row"><button class="soft-button" data-action="help">How to play</button><button class="text-button danger" data-action="reset-confirm">Start a new adventure</button></div><p class="fineprint">Zoo Garden · progress saved on this device when offline</p>`,'SETTINGS');}
function help(){openDialog('help','A small guide to a big world',`<div class="help-grid">${[['👣','Wander','Click or tap to walk; hold to steer. Pinch or scroll to zoom. Arrow keys work too, and Settings can show a movement pad on touch screens.'],['🌱','Grow','Tap a garden bed, pick a seed and come back when it sparkles. Crops grow while you are away.'],['🧺','Trade','Sell your harvest at the pink market, buy gear at the blue stall and equip it in the backpack (I).'],['⚔️','Be brave','Tap a creature to follow and attack it. Space hits nearby enemies; Q spins, W dashes, E stomps, R is your weapon’s special.'],['🎣','Catch a moment','Keep a rod in your backpack. It is held automatically near a pond. Press Reel when it bites, hold to pull, and let go when the fish surges or the line turns red.'],['📖','Follow your curiosity','Story chapters, daily tasks, achievements and collections give rewards. The rocket opens new worlds from level 5.'],['📦','Keep it safe','If you fall, loose items wait in a pink backpack where you fell; gear, levels and energy stay. The chest keeps treasures safe.'],['⌨️','Handy shortcuts','I backpack · J journal · M map · F interact · Esc close. Home brings you back safely.']].map(([icon,title,body])=>`<div><span>${icon}</span><h3>${title}</h3><p>${body}</p></div>`).join('')}</div>`,'MAKE YOURSELF AT HOME');}

// Fishing happens in the world: no panel, just the pond, the line and a big Reel button.
let fishPond:Entity|null=null,recastUntil=0;
const fishingView=new FishingView(world.scene,world.fx!,fishKit,sound=>tone(sound));
const rodTip=new Vector3();
function tipPosition(){const tip=world.player.getObjectByName('rod-tip');if(tip){world.player.updateWorldMatrix(true,true);tip.getWorldPosition(rodTip);}else rodTip.set(world.position.x,1.4,world.position.z);return rodTip;}
function pondView(e:Entity):PondView{return {id:e.id,x:e.x,z:e.z,rx:e.pond!.rx,rz:e.pond!.rz,surface:e.pond!.surface,waterId:e.waterId??state.planet};}
function stockPonds(){fishingView.attach(world.scene);fishingView.populate(world.entities.filter(e=>e.kind==='fish'&&e.pond).map(pondView),waterId=>(M.FISH_WEIGHTS[waterId]??M.FISH_WEIGHTS.home).flatMap(([id,weight])=>Array(Math.max(1,Math.min(6,Math.round(weight/8)))).fill(id)));}
const formatSize=(cm:number)=>cm>=100?`${(cm/100).toFixed(2).replace(/\.?0+$/,'')} m`:`${cm} cm`;
function showReel(on:boolean,mode:'reel'|'cast'='reel'){const button=$('#reel-button');button.hidden=!on;button.classList.toggle('cast',mode==='cast');button.classList.remove('bite','down');$('#reel-text').textContent=t(mode==='cast'?'Cast':'Reel');$('#hud').classList.toggle('fishing',on&&mode==='reel');$('#fish-hint').hidden=!(on&&mode==='reel');}
function endFishing(message?:string,icon='🎣'){const was=!!fishGame;fishGame=null;fishingView.cancel();world.fishing='idle';showReel(false);if(was&&message)toast(message,icon);}
/** Apply only actual changes: staying by the shore must not rebuild the avatar or save every frame. */
function applyContextWeapon(id:M.ItemId|null){
  if((state.gear.weapon??null)===id)return;
  if(!(id?M.equip(state,id):M.unequip(state,'weapon')))return;
  world.refreshPlayer();save();updateHud();
}
function prepareCombatWeapon(){
  combatGearUntil=performance.now()+3000;
  if(fishGame)endFishing('Fishing line reeled in.');
  applyContextWeapon(contextGear.forCombat(state));
}
function updateContextWeapon(){
  if(!started||visiting||uiBlocked()||document.hidden)return;
  if(gearState!==state||gearPlanet!==state.planet){gearState=state;gearPlanet=state.planet;gearWater=false;combatGearUntil=0;}
  let shore=Infinity;
  for(const pond of world.entities)if(pond.kind==='fish'&&pond.pond)shore=Math.min(shore,Math.hypot(pond.x-world.position.x,pond.z-world.position.z)-pond.radius);
  // A one-metre buffer keeps tiny movements on the boundary from swapping gear repeatedly.
  gearWater=shore<=(gearWater?4:3);
  const fighting=!fishGame&&(world.selected?.kind==='enemy'||fightNear(world.enemies,world.position.x,world.position.z)||performance.now()<combatGearUntil);
  applyContextWeapon(contextGear.choose(state,{nearWater:gearWater,fighting,fishing:!!fishGame}));
}
function fish(pond?:Entity|null){
  pond??=world.entities.filter(e=>e.kind==='fish'&&e.pond).sort((a,b)=>Math.hypot(a.x-world.position.x,a.z-world.position.z)-a.radius-(Math.hypot(b.x-world.position.x,b.z-world.position.z)-b.radius))[0]??null;
  if(!pond?.pond||Math.hypot(pond.x-world.position.x,pond.z-world.position.z)>pond.radius+3){toast('Walk up to a pond to cast your line.','🎣');return;}
  const rodId=contextGear.forFishing(state);
  if(!rodId){openDialog('fish-help','A quiet moment by the water',`<div class="grow-illustration">🎣</div><p class="center">Keep a fishing rod in your backpack to cast your line. Your best rod is held automatically near water, and your combat weapon returns when you leave or fight.</p><button class="primary wide" data-action="go" data-kind="shop">Visit the outfitters</button>`,'FISHING');return;}
  applyContextWeapon(rodId);combatGearUntil=0;
  // Read the owned rod directly so a costume's combat skills cannot prevent casting.
  const rod=M.ITEMS[rodId].weapon!;
  fishPond=pond;fishingWater=pond.waterId??state.planet;
  // The tap on the water picks the cast point, near or far (the reference's plan()); a recast reuses the last spot.
  const water={x:pond.x,z:pond.z,r:pond.pond.rx},tap=world.pondTap?.id===pond.id?world.pondTap:lastCast?.id===pond.id?lastCast:water;world.pondTap=null;
  const {cast}=planCast(water,world.position,tap);lastCast={id:pond.id,...cast};
  const weights=M.FISH_WEIGHTS[fishingWater]??M.FISH_WEIGHTS.home,stats=M.activeStats(state),input=new FishingInput();input.ready=true;
  // Each fish that swims up is chosen then, with the worm/rod/luck bonus on rare and legendary fish.
  const choose=(bonus:number):FishPick=>{const s=selectCatch(weights.map(([id,weight])=>{const f=M.FISH[id];return {id,weight:catchWeight(weight,f.rarity,bonus),min:f.size[0],max:f.size[1],junk:f.rarity==='junk'};}));return {...s,power:M.FISH[s.id].power};};
  const simulation=new FishingSimulation<FishPick>({quality:rod.quality??.3,bait:(state.bag.worm??0)>0,luck:stats.luck,choose,approachFrom:p=>fishingView.approachDistance(p.id),water,cast,player:{x:world.position.x,z:world.position.z}});
  fishGame={input,simulation,lastPhase:'cast',seen:{missed:0,bait:0,early:0},tooEarlyUntil:0};
  world.destination=null;world.route=[];world.moving=false;world.selected=null;world.ring.visible=false;world.facing=Math.atan2(cast.x-world.position.x,cast.z-world.position.z);
  world.fishing='cast';world.castT=.5;showReel(true);
  fishingView.begin(pondView(pond),tipPosition(),cast);
}
const FISH_HINTS:Record<string,string>={cast:'Casting…',wait:'Wait for a fish…',approach:'A fish is coming… wait!',nibble:'A nibble… not yet!',bite:'Bite! Press Reel!'};
function updateFishing(dt:number){
  const f=fishGame;if(!f)return;const sim=f.simulation;
  if(world.destination||world.route.length||world.moving||world.keys.size){endFishing('Fishing line reeled in.');return;}
  sim.update(dt,f.input.held);
  // Worms are used at a missed bite, a snap, slack line and a catch (not when a fish just swims off).
  if(sim.baitUsed>f.seen.bait){const used=sim.baitUsed-f.seen.bait;f.seen.bait=sim.baitUsed;change(()=>{for(let i=0;i<used;i++)M.removeItem(state.bag,'worm');});sim.setBait((state.bag.worm??0)>0);}
  if(sim.missedBites>f.seen.missed){f.seen.missed=sim.missedBites;toast('Missed the bite — wait for the next fish.','🎣');}
  if(sim.earlyPresses>f.seen.early){f.seen.early=sim.earlyPresses;f.tooEarlyUntil=sim.time+1.5;}
  if(sim.phase!==f.lastPhase){if(sim.phase==='bite')vibrate(40);f.lastPhase=sim.phase;}
  world.fishing=sim.phase==='cast'?'cast':sim.phase==='hooked'?'fight':'wait';
  $('#fish-hint').textContent=t(sim.phase==='wait'&&sim.time<f.tooEarlyUntil?'Too early! Wait for the bobber to sink.':sim.phase==='hooked'?(sim.surge>0?'Surge! Let go!':sim.tension>.78?'Easy… let the line go':'Hold Reel to pull it in'):FISH_HINTS[sim.phase]??'');
  const button=$('#reel-button');button.classList.toggle('bite',sim.phase==='bite');button.classList.toggle('down',f.input.held);button.setAttribute('aria-pressed',String(f.input.held));
  if(!sim.finished)return;
  fishGame=null;world.fishing='idle';
  if(sim.phase==='escaped'){
    if(sim.snapped){fishingView.snap();setTimeout(()=>floating('Line snapped! 💔',world.position.x,world.position.z,'hurt'),250);}else fishingView.cancel();
    showReel(true,'cast');recastUntil=performance.now()+6000;toast(sim.reason,'💧');return;
  }
  const pick=sim.pick!,caught=M.FISH[pick.id],caughtState=state;showReel(false);
  fishingView.land(()=>world.position,()=>{
    if(state!==caughtState)return; // A delayed catch must never reward another account or a new adventure.
    change(()=>M.grantCatch(state,pick.id,pick.size,pick.huge));tone('success');
    world.fx?.burst(world.position,{n:18,color:['#bfe9ff','#ffffff','#ffe66d'],glow:true,speed:4,up:6});
    floating(`${caught.rarity==='legendary'?'👑':caught.rarity==='rare'?'✨':caught.rarity==='junk'?'🥾':'🐟'} ${t(caught.name)}`,world.position.x,world.position.z,caught.rarity==='junk'?'item':'item big');
    if(caught.rarity!=='junk')setTimeout(()=>floating(`${pick.huge?'💪 HUGE ':'📏 '}${formatSize(pick.size)}`,world.position.x,world.position.z,pick.huge?'crit big':'xp'),350);
    if(pick.huge)world.fx?.shake(.3);
    if(caught.rarity==='legendary')toast(`Legendary catch! ${t(caught.name)}, ${formatSize(pick.size)}.`,'👑');
    if(!fishGame){showReel(true,'cast');recastUntil=performance.now()+6000;}
  });
}


world.onAlert=()=>tone('alert');
world.onBuilt=()=>{if(fishGame)endFishing();stockPonds();minimap.invalidate();};
stockPonds();
// Fish models stream in after the first build; restock the ponds when they arrive.
void fishKit.load().then(()=>{if(fishKit.ready)stockPonds();});
// The Blender explorer, gear and pets stream in after the world is playable.
// Gear and pet files load on demand as the explorer puts them on (see World.kitFor).
void heroKit.load().then(()=>{if(heroKit.ready)world.refreshAvatars();});
world.onInteract=(e)=>{
  if(!started||uiBlocked())return;tone();if(visiting&&e.kind!=='travel'){toast('Enjoy looking around. Your own garden is waiting at home.','🌷');return;}const env=world.interactEnvironment(e);if(env){if(env.message)toast(env.message);save();updateHud();if(env.openCrafting){craftStation='forge';crafting();}return;}
  if(e.kind==='plot')plotDialog(e.index!);else if(e.kind==='sell')market();else if(e.kind==='shop')shop();else if(e.kind==='chest')storage();else if(e.kind==='upgrade')upgrades();else if(e.kind==='cook')cooking();else if(e.kind==='craft'){craftStation='craft';crafting();}else if(e.kind==='travel')planets();else if(e.kind==='fish')fish(e);
  else if(e.kind==='pen')penTap();
  else if(e.kind==='home'){change(()=>state.hp=M.maxHp(state));toast('Home, sweet home. Your health is restored.','🏡');}
  else if(e.kind==='dropped'){change(()=>M.recoverBag(state));world.syncDropped();toast('All your little treasures are back.','🎒');}
  else if(e.kind==='mine'){const index=e.index;if(index===undefined||!M.mineAvailable(state,state.planet,index)){toast('This crystal needs a moment to regrow.','💎');return;}if(!change(()=>M.claimMine(state,index)))return;world.burst(e.x,e.z,'#d9c9f3');toast('A crystal for your crafting collection!','💎');}
  else if(e.kind==='gift'){if(e.index===undefined)return;const outcome=change(()=>M.claimGift(state,e.index!));if(!outcome)return;e.mesh.visible=false;if(outcome.kind==='bomb'){for(const target of world.enemies)if(target.hp>0&&Math.hypot(target.x-e.x,target.z-e.z)<(outcome.radius??4.5))hit(target,Math.round(M.attack(state)*(outcome.damageMultiplier??3)));world.burst(e.x,e.z,'#ffb269',28);checkDefeat();}toast(outcome.label,'🎁');}
};
// Loot lands on the ground (drops.ts) and reaches the bag through the pickup magnet, with a '+n name' float.
const drops=createDrops(world,{layer:$('#world-labels'),alive:()=>state.hp>0,item:id=>Object.hasOwn(M.ITEMS,id)?M.ITEMS[id]:undefined,
  iconUrl:id=>M.ITEMS[id]?.type==='decor'?decorIcon(id)||null:`${ICON_BASE}${Object.hasOwn(M.CROPS,id)?'crops':Object.hasOwn(M.FISH,id)?'fish':'items'}/${id}.webp`,
  canAdd:(id,n)=>Number.isSafeInteger((state.bag[id]??0)+n),onPick:(d,stack)=>{if(!change(()=>M.addItem(state,d.item,d.count)))return;floating(`+${d.count} ${t(M.ITEMS[d.item].name)}`,world.position.x,world.position.z,'item',stack*.7);tone('coin');},
  onFull:()=>toast('Your backpack is full. Store or sell something first.','🎒'),onRare:(d,name)=>{floating(`${d.rarity==='legendary'?'👑':'✨'} ${name}`,d.x,d.z,'item');tone('level');},onExpire:d=>world.burst(d.x,d.z,'#cfd6e6',6)});
frameListeners.add(dt=>drops.update(dt));
function grantDefeat(e:{id:string;xp:number;boss:boolean;type?:string;name?:string;x?:number;z?:number}){
  const loot=change(()=>M.grantDefeat(state,e.type??'slime',e.xp,e.boss,Math.random,false));
  // Experience flies in as cyan orbs; the loot is tossed onto the ground where the creature fell.
  const x=e.x??world.position.x,z=e.z??world.position.z;
  world.fx?.orbs({x,z},Math.min(8,3+Math.floor(e.xp/20)),'#7ff0ff',()=>world.position,()=>tone('coin'));
  floating(`+${e.xp} EXP`,x,z,'xp',.5);
  // Loot lands on the ground (drops.ts); picking it up shows the +n float.
  drops.spawnLoot(loot,x,z);
  if(e.boss){toast(`${e.name??'Boss'} defeated!`,'👑');tone('level');}
}
function hit(e:Enemy,damage:number,stun=0,impact?:CombatHit,remote=false,hazard=false){
  if(e.hp<=0||(visiting&&!remote))return;if(!remote&&network.hit?.(e.id,damage,stun,impact))return;
  world.damageEnemy(e,damage,stun,hazard);combatHud.noteHit(e);world.hitFeedback(e,damage,!!impact?.critical);if(!hazard||impact)tone(impact?.critical?'crit':'hit');
  if(impact?.lift&&e.hp>0)world.knockUpEnemy(e,impact.lift,.75);
  if(impact?.knock&&e.hp>0)world.knockEnemy(e,impact.direction.x,impact.direction.z,impact.knock);
  if(e.hp===0){world.defeatFeedback(e);tone('poof');
    const type=(e as Enemy&{type?:string}).type??'slime';if(network.onHostKill)network.onHostKill(e.id,e.xp,e.boss,type);else grantDefeat({...e,type});}
}
/** Ground slam impact, after the reference: flying dirt, two shockwaves and a heavy shake. */
function slamImpact(){
  const fx=world.fx;if(!fx)return;const at=world.position;
  fx.shake(.7);fx.ring(at,{color:'#fff3c4',to:4.6,life:.45,thick:.25});fx.ring(at,{color:'#ffb347',to:3.5,life:.6,thick:.12});
  fx.burst(at,{n:26,color:['#b98a5e','#8b5a36','#d9b58a'],speed:7,up:7,size:.18,life:1.1,y:.2});fx.burst(at,{n:14,color:'#ffffff',glow:true,speed:8,up:3,size:.12,life:.5});
  tone('crit');vibrate(80);
}
/** Standing still near a creature, the explorer fights it automatically, as in the reference. */
function autoAttack(kind:string){
  if(!started||uiBlocked()||visiting||fishGame||placement||kind==='rod'||world.selected||world.destination||world.route.length||world.moving||world.keys.size||combat.locksMovement||combatTimers.attackCooldown>0)return;
  const reach=kind==='gun'?6:2.4,p=world.position;
  let best:Enemy|null=null,bestDistance=Infinity;
  for(const e of world.enemies){if(e.hp<=0||!e.mesh.visible)continue;const d=Math.hypot(e.x-p.x,e.z-p.z)-e.radius;if(d<reach&&d<bestDistance){best=e;bestDistance=d;}}
  if(best)world.select(best);
}
/** The new item appears on the explorer with a sparkle, a name tag and a chime. */
function equipFeedback(id:string){
  world.refreshPlayer();world.fx?.burst(world.position,{n:16,color:['#ffe66d','#ffffff'],glow:true,speed:3,up:6});
  floating(`${t(M.ITEMS[id].name)} ↑`,world.position.x,world.position.z,'item big');tone('level');
}
function basicAttack(e?:Enemy){
  if(!started||uiBlocked()||visiting||combatTimers.attackCooldown>0)return;
  prepareCombatWeapon();
  if(combat.basic(e)){const stats=M.activeStats(state),weapon=M.weaponStats(state);combatTimers.attackCooldown=(weapon.cd??.4)/Math.max(.2,1+stats.haste);world.playerAttack(weapon.kind);tone(weapon.kind==='gun'?'shoot':weapon.kind==='sword'?'swing':'punch');emitAction({kind:'basic'});}
}
world.onAttackEnemy=basicAttack;
function skillList(){const disguise=state.gear.disguise?M.DISGUISES[state.gear.disguise]:null;return disguise?.skills??[...BASE_SKILLS,SPECIALS[M.weaponStats(state).special??'fist']??SPECIALS.fist];}
function skill(index:number){
  if(!started||uiBlocked()||visiting||cooldowns[index]>0||index<0||index>3)return;
  prepareCombatWeapon();
  const disguise=state.gear.disguise,weapon=M.weaponStats(state),skills=skillList();
  if(!(disguise?combat.disguise(disguise,index):combat.skill(index,weapon.special??'fist')))return;
  skillDurations[index]=skills[index].cd/Math.max(.2,1+M.activeStats(state).haste);cooldowns[index]=skillDurations[index];
  change(()=>recordEvent(state,'skill'));if(index===0)world.spinT=2.2;else if(index===1)world.fx?.burst(world.position,{n:10,color:'#f3e2bd',size:.14,speed:3,up:2,y:.1});tone(index===0?'swing':index===3?'crit':'punch');emitAction({kind:'skill',index,special:disguise??weapon.special});
}
function checkDefeat(){if(!started||state.hp>0)return false;endFishing();resetCombat();change(()=>M.die(state,world.position.x,world.position.z));rebuildHomePresentation('home');world.refreshPlayer();openDialog('death','A little rest, then try again',`<div class="grow-illustration">🌷</div><p class="center">You’re safe at home. Your level, energy, and equipped gear are safe too.</p><p class="center muted">${state.dropped?'Your loose items are waiting where you fell.':'Nothing was dropped.'}</p><button class="primary wide" data-action="close">Back on my feet →</button>`,'EVERY EXPLORER TAKES A TUMBLE');return true;}
world.onDamage=(amount,source='melee')=>{
  if(combatTimers.invulnerable>0||combat.invulnerable||(source==='melee'&&(combat.statuses.flight??0)>0)||!started||(!network.role&&uiBlocked())||visiting)return;
  const defense=M.activeStats(state).defense+(combat.statuses.armor>0?80:0),damage=Math.max(1,Math.round(amount*60/(defense+60)));
  if(fishGame)endFishing('The fish got away when you were hit.');
  state.hp=Math.max(0,state.hp-damage);combatTimers.invulnerable=.55;world.hurtFeedback(damage);tone('hurt');vibrate(60);$('#damage-flash').classList.add('active');setTimeout(()=>$('#damage-flash').classList.remove('active'),160);
  checkDefeat();
  updateHud();
};
world.onHazardEnemy=(enemy,damage)=>hit(enemy,damage,0,undefined,true,true);
world.onEnvironmentEvent=event=>{if(event.message)toast(event.message,'🌍');save();updateHud();};
function resetCombat(){combat.reset();combatTimers.reset();combatView.clear();world.movementLocked=false;world.playerFlying=false;world.playerStealth=false;}

function rebuildHomePresentation(planet:M.PlanetId){
  const shared=network.role&&world.planet===planet, enemies=shared?world.enemySnapshots():null,environment=shared?world.environmentSnapshot():null;
  world.build(planet);if(enemies)world.applyEnemySnapshots(enemies);if(environment)world.applyEnvironmentSnapshot(environment);
}
const sharedKills=new Set<string>();
export const gameBridge:GameBridge={
  getState:()=>state,getWorld:()=>world,
  getPresence:()=>({y:world.position.y,x:world.position.x,z:world.position.z,facing:world.facing,planet:world.planet,name:state.name,color:state.color,level:state.level,hp:state.hp,maxHp:M.maxHp(state),gear:state.gear,moving:world.moving,visible:!document.hidden}),
  getOfflineState:()=>{try{return M.parseSave(localStorage.getItem(M.SAVE_KEY));}catch{return null;}},
  applyState(next){state=next;applyMovePad();const nameInput=document.querySelector<HTMLInputElement>('#name-input');if(nameInput)nameInput.value=state.name;visiting=null;visitHome=null;world.state=state;resetCombat();world.build(state.planet);world.refreshPlayer();if(modal==='bag')inventory();else if(modal==='quests')quests();else if(modal)closeDialog();updateHud();updateLabels();},
  setPersistence(handler){persistence=handler;},
  setNetworkHooks(hooks){network=hooks;world.networkRole=hooks.role;},
  applyRemoteHit(id,damage,stun=0,impact){const enemy=world.enemies.find(e=>e.id===id);if(enemy)hit(enemy,damage,stun,impact,true);},
  applyRemoteStatus(id,kind,duration){const enemy=world.enemies.find(e=>e.id===id);if(enemy)world.statusEnemy(enemy,kind,Math.min(12,duration));},
  applyRemoteMove(id,x,z){const enemy=world.enemies.find(e=>e.id===id);if(enemy)moveEnemy(enemy,x,z);},
  applySharedKill(id,xp,boss,type){if(sharedKills.has(id))return;sharedKills.add(id);if(sharedKills.size>500)sharedKills.delete(sharedKills.values().next().value!);const enemy=world.enemies.find(e=>e.id===id);grantDefeat({id,xp,boss,type,x:enemy?.x,z:enemy?.z});},
  applyRemoteEffect(effect){showEffect(effect);},
  applyRemoteDamage(amount,source){world.onDamage(amount,source==='shot'||source==='hazard'?source:'melee');},
  setVisiting(owner,home){
    if(owner&&owner===visiting&&home&&visitHome){
      const expanded=home.plots&&home.plots.length!==visitHome.plots.length,decorChanged=JSON.stringify(home.decorations??[])!==JSON.stringify(visitHome.decorations);
      visitHome.plots=structuredClone(home.plots??visitHome.plots);visitHome.decorations=structuredClone(home.decorations??visitHome.decorations);visitHome.farm=M.parseFarm((home as {farm?:unknown}).farm);
      if(expanded){const position=world.position.clone();rebuildHomePresentation('home');world.position.copy(position);world.refreshPlayer();}
      else{world.syncCrops();if(decorChanged)world.syncDecorations();}
      updateLabels();return;
    }
    visiting=owner;resetCombat();closeDialog();
    if(owner&&home){visitHome={...structuredClone(state),planet:'home',plots:structuredClone(home.plots??state.plots),decorations:structuredClone(home.decorations??[]),farm:M.parseFarm((home as {farm?:unknown}).farm)};world.state=visitHome;rebuildHomePresentation('home');}
    else{visitHome=null;world.state=state;rebuildHomePresentation(state.planet);}
    world.refreshPlayer();$('#visit-banner').hidden=!owner;$('#visit-banner').textContent=t(owner?t('Visiting {owner} · look around their garden',{owner}):'');updateLabels();
  },
  showNotice:message=>toast(message),
  onFrame(listener){frameListeners.add(listener);return()=>frameListeners.delete(listener);},
  onAction(listener){actionListeners.add(listener);return()=>actionListeners.delete(listener);},
};

function go(kind:string){closeDialog();const entities=world.entities.filter(e=>e.kind===kind);const entity=kind==='plot'?entities.find(e=>!world.state.plots[e.index!]?.crop)||entities[0]:entities[0];if(entity){world.select(entity);toast(`Off to ${kind==='plot'?'the garden':entity.name.toLowerCase()}…`,'👣');}else toast('That place is back in Clover Village.','🏡');}
// ---- The starship: take-off, a piloted flight between planets, and landing ----
const SCENERY_KITS={scenery:sceneryKit,wilds:wildsKit,bright:brightKit,harsh:harshKit};
shipSequence=new ShipSequence(world,tone);const ship=shipSequence;
const spaceView=new SpaceView($('#space-labels'),spaceKit);
const spaceKeys=new Set<string>();let spacePointer:{x:number;y:number}|null=null,boostHeld=false;
const prefetch=(id:M.PlanetId)=>{for(const name of kitsFor(id))void SCENERY_KITS[name].load();};
function leaveWorld(){closeDialog();resetCombat();cancelPlacement();endFishing();world.destination=null;world.route=[];world.selected=null;world.marker.visible=false;world.ring.visible=false;movement.clear();}
function launch(){
  if(ship.busy||flight||arriving)return;
  if(!change(()=>M.launch(state))){toast(`The starship needs ϟ ${M.LAUNCH_COST} energy to fill its tank.`,'⛽');return;}
  leaveWorld();toast('Lift-off in three, two, one…','🚀');
  ship.launch(()=>warp(enterSpace));
}
/** Star-map pick: pay the launch as usual, then the autopilot flies to the planet and lands. */
let autopilotTarget:M.PlanetId|null=null;
function flyTo(id:M.PlanetId){
  if(ship.busy||flight||arriving)return;const r=starRoutes().find(r=>r.id===id);if(!r||r.lock)return;
  autopilotTarget=id;launch();if(!ship.busy)autopilotTarget=null;
}
/** A quick trip home with the starship, without piloting: the old free ride back. */
function flyHome(){if(ship.busy||flight||arriving)return;leaveWorld();ship.launch(()=>void arrive('home'));}
function warp(then:()=>void){const flash=$('#warp-flash');flash.classList.add('show');setTimeout(()=>{then();setTimeout(()=>flash.classList.remove('show'),150);},600);}
function enterSpace(){
  flight=new SpaceFlight(state.planet,state.discovered);flight.setAutopilot(autopilotTarget);autopilotTarget=null;spaceView.build(flight,graphics.level==='low');
  $('#hud').hidden=true;$('#world-labels').hidden=true;$('#space-hud').hidden=false;
  if(flight.autopilot){const p=M.PLANETS[flight.autopilot.id];spaceHint(t('🧭 Autopilot to {planet}: sit back, or press Skip.',{planet:`${p.icon} ${t(p.name)}`}),5);}else spaceHint(matchMedia('(pointer: coarse)').matches?'Hold anywhere to steer toward your finger · hold <b>Boost</b> to speed up · fly close to a planet to land':'Hold the mouse to steer (or <kbd>W</kbd> <kbd>A</kbd> <kbd>D</kbd>) · <kbd>Shift</kbd> boosts · fly close to a planet to land',5);tone('cast');
}
function exitSpace(){flight=null;spaceView.hideLabels();spaceKeys.clear();spacePointer=null;boostHeld=false;$('#space-hud').hidden=true;$('#hud').hidden=false;$('#world-labels').hidden=false;}
let hintTimer=0;
function spaceHint(html:string,seconds=5){const hint=$('#space-hint');hint.innerHTML=localizeHtml(html);hint.classList.add('show');clearTimeout(hintTimer);hintTimer=window.setTimeout(()=>hint.classList.remove('show'),seconds*1000);}
function spaceFloat(html:string){const el=document.createElement('div');el.className='space-float';el.innerHTML=localizeHtml(html);$('#space-floats').append(el);setTimeout(()=>el.remove(),1600);}
function tryLanding(){
  if(!flight||flight.landing)return;if(flight.autopilot){flight.skipAutopilot();prefetch(flight.landing!.planet.id);tone('crit');return;}
  const over=flight.over;if(!over){spaceHint('Fly over a planet to land on it.',2);return;}
  if(!flight.land(id=>M.canLand(state,id))){const p=M.PLANETS[over.id];spaceHint(`🔒 The air on ${t(p.name)} is too rough. You need <b>level ${p.level}</b> to land.`,3);tone('hurt');return;}
  prefetch(over.id);tone('crit');$('#land-button').hidden=true;
}
function onSpaceEvent(event:SpaceEvent){
  switch(event.kind){
    case 'boost':tone('swing');break;
    case 'bump':spaceView.shake=.5;tone('hit');break;
    case 'empty':spaceHint('⛽ Out of fuel! The starship can only crawl. Collect <b>stardust</b> ✨ to refuel.',5);break;
    case 'edge':spaceHint('🌌 This is the edge of the universe. Time to turn back!',3);break;
    case 'dust':{const shard=M.collectStardust(state);spaceFloat(`✨ +14 fuel · +3 ϟ${shard?' · 🌟 Star shard!':''}`);tone(shard?'level':'coin');break;}
    case 'discover':{M.discover(state,event.planet);save();prefetch(event.planet);const p=M.PLANETS[event.planet];
      spaceHint(`🔭 New planet discovered: <b>${p.icon} ${t(p.name)}</b><br><small>Bosses: ${p.bosses.map(b=>t(ENEMY_TYPES[b]?.name)??b).join(', ')} · landing from level ${p.level}</small>`,6);tone('level');break;}
    case 'landed':void arrive(event.planet);break;
  }
}
/** Swaps worlds behind a flash, then brings the starship down onto the new pad. */
async function arrive(id:M.PlanetId){
  if(arriving)return;arriving=true;
  const flash=$('#warp-flash');flash.classList.add('show');
  await new Promise(resolve=>setTimeout(resolve,600));
  try{
    M.travel(state,id);save();
    await Promise.race([Promise.all(kitsFor(id).map(name=>SCENERY_KITS[name].load())),new Promise(resolve=>setTimeout(resolve,2500))]);
    if(flight)exitSpace();
    ship.reset();world.build(id);world.refreshPlayer();world.applyRefinedAssets();updateLabels();settle();
    // Compile the new world's shaders in the background, so the first frames after landing don't hitch.
    void world.renderer.compileAsync(world.scene,world.camera).catch(()=>{});
    const p=M.PLANETS[id];
    ship.land(()=>{showZone(id==='home'?'Clover Village':t(p.name));floating(`${p.icon} ${t(p.name)}`,world.position.x,world.position.z,'level',1);toast(id==='home'?'Home, sweet home!':`Welcome to ${t(p.name)}! Watch out for its creatures.`,p.icon);});
  }finally{arriving=false;setTimeout(()=>flash.classList.remove('show'),150);}
}
function updateSpace(dt:number){
  if(!flight)return;
  const k=spaceKeys,input={turn:(k.has('d')||k.has('arrowright')?1:0)-(k.has('a')||k.has('arrowleft')?1:0),thrust:k.has('w')||k.has('arrowup')?1:0,brake:k.has('s')||k.has('arrowdown'),boost:k.has('shift')||k.has(' ')||boostHeld,
    aim:spacePointer?spaceView.aimAt(spacePointer.x/innerWidth*2-1,-(spacePointer.y/innerHeight)*2+1):null};
  // The autopilot flight plays sped up (4x), so a chosen trip takes seconds.
  for(let remaining=dt*(flight.autopilot?4:1);remaining>0&&flight;){const step=Math.min(.025,remaining);remaining-=step;for(const event of flight.step(step,input))onSpaceEvent(event);}
  if(!flight)return;
  spaceView.update(dt,flight,flight.discovered,state.level,innerWidth,innerHeight);spaceView.render(world.renderer);
  spaceView.drawRadar($<HTMLCanvasElement>('#space-radar').getContext('2d')!,flight,flight.discovered,flight.time);
  $('#fuel-fill').style.width=`${flight.fuel}%`;$('#fuel-fill').classList.toggle('low',flight.fuel<20);$('#fuel-text').textContent=t(String(Math.round(flight.fuel)));
  $('#space-speed').textContent=t(String(Math.round(flight.speed*10)));$('#space-energy').textContent=t(String(state.energy));
  $('#autopilot-skip').hidden=!flight.autopilot;$('#boost-button').hidden=!!flight.autopilot;const land=$('#land-button'),over=flight.autopilot?null:flight.over;land.hidden=!over||!!flight.landing;
  if(over&&!flight.landing){const p=M.PLANETS[over.id],locked=state.level<p.level;land.classList.toggle('locked',locked);$('#land-title').textContent=t(locked?`🔒 ${t(p.name)}`:'🛬 Land');$('#land-name').textContent=t(locked?`Needs level ${p.level}`:`${p.icon} ${t(p.name)}`);}
}
$('#world').addEventListener('pointerdown',event=>{if(!flight)return;const e=event as PointerEvent;spacePointer={x:e.clientX,y:e.clientY};});
addEventListener('pointermove',event=>{if(flight&&spacePointer){const e=event as PointerEvent;spacePointer={x:e.clientX,y:e.clientY};}});
for(const type of ['pointerup','pointercancel'])addEventListener(type,()=>{spacePointer=null;});
const boostButton=$('#boost-button');
boostButton.addEventListener('pointerdown',event=>{event.stopPropagation();event.preventDefault();boostHeld=true;});
for(const type of ['pointerup','pointerleave','pointercancel'])boostButton.addEventListener(type,()=>{boostHeld=false;});
app.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
  // A clicked HUD button gives up focus, so Space and other shortcuts cannot press it again.
  if((event as MouseEvent).detail>0&&button.closest('#hud,#world-labels'))button.blur();
  const action=button.dataset.action,id=button.dataset.item as M.ItemId,index=Number(button.dataset.index);if(action!=='reel')tone();
  switch(action){
    case 'start':start();break;
    case 'color':state.color=button.dataset.color!;document.querySelectorAll<HTMLButtonElement>('.color-picker button').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});world.refreshPlayer();break;
    case 'close':closeDialog();break;case 'bag':inventory();break;case 'inspect':if(id){selectedItem=id;inventory();}break;case 'quests':quests();break;case 'map':map();break;case 'settings':settings();break;case 'trackers':trackerMode=$('.tracker-stack').classList.contains('folded')?'open':'fold';updateHud();break;case 'help':help();break;
    case 'claim':if(change(()=>M.claimQuest(state))){tone('success');toast('A little milestone. A lovely reward!','🎁');if(modal)quests();}break;
    case 'plant':if(change(()=>M.plant(state,activePlot,id as M.CropId))){plantBurst(activePlot);tone('pop');world.syncCrops();closeDialog();toast(`${t(M.CROPS[id as M.CropId].name)} planted. Let the sunshine do its thing.`,'🌱');}break;
    case 'cook-one':case 'cook-all':if(change(()=>M.cook(state,id,action==='cook-all'?(state.bag[id]||0):1))){tone('success');cooking();}break;
    // Reference: a fertilizer that ripens the crop closes the panel; one that only speeds it up refreshes it.
    case 'fertilize-manure':case 'fertilize':if(change(()=>M.fertilize(state,activePlot,action==='fertilize'?'spore':'manure'))){world.syncCrops();const p=state.plots[activePlot];if(M.cropProgress(p)>=1){closeDialog();toast('Ready to harvest!','🌿');}else{plotDialog(activePlot);toast('Your crop will be ready sooner.','🌿');}}break;
    case 'expand':buyPlot();break;
    case 'confirm-place':confirmPlacement();break;
    case 'store-bed':{const i=activePlot;if(change(()=>M.storeBed(state,i))){closeDialog();world.dropPlotsFrom(i);tone('poof');toast('The bed is packed away. It is in your bag as a garden bed kit.','🎒');}break;}
    case 'shop-tab':shopTab=button.dataset.kind!;shop();break;
    case 'journal-tab':journalTab=button.dataset.kind as ProgressKind;quests();break;
    case 'start-challenge':if(change(()=>startChallenge(state,button.dataset.kind!))){quests();toast('Quick challenge started!','⏱️');}break;
    case 'reroll-daily':change(()=>rerollDaily(state,index));quests();break;
    case 'progress-claim':if(change(()=>claimProgress(state,button.dataset.kind as ProgressKind,button.dataset.id!))){tone('success');toast('Reward collected.','🎁');}quests();break;
    case 'plant-all':{const empty=state.plots.map((p,i)=>p.crop?-1:i).filter(i=>i>=0);const count=change(()=>M.plantAll(state,id));empty.filter(i=>state.plots[i]?.crop).slice(0,12).forEach(plantBurst);if(count)tone('pop');world.syncCrops();closeDialog();toast(`Planted ${count} garden beds.`,'🌱');break;}
    case 'harvest-all':{const ready=state.plots.map((p,i)=>p.crop&&M.cropProgress(p)>=1?[i,p.crop] as const:null).filter(Boolean) as (readonly [number,M.CropId])[];const count=change(()=>M.harvestAll(state));ready.slice(0,12).forEach(([i,crop])=>harvestBurst(i,crop));world.syncCrops();closeDialog();toast(`Harvested ${typeof count==='number'?count:Array.isArray(count)?count.length:0} crops.`,'🌾');break;}
    case 'unequip':{M.unequip(state,button.dataset.slot as M.GearSlot);world.refreshPlayer();save();inventory();break;}
    case 'craft-tab':craftTab=button.dataset.kind!;crafting();break;
    case 'decorations':decorations();break;
    case 'decor-shop':shopTab='Decor';shop();break;
    case 'place-decor':beginPlacement(id);break;
    case 'cancel-decor':cancelPlacement();break;
    case 'rotate-decor':rotatePlacement();break;
    case 'remove-decor':if(change(()=>M.removeDecoration(state,button.dataset.id!))){world.syncDecorations();decorations();}break;
    case 'buy':if(change(()=>M.buy(state,id))){
      // Gear goes straight onto the explorer, like picking up a fishing rod.
      if(M.ITEMS[id].slot&&change(()=>M.equip(state,id)))equipFeedback(id);else{floating(`+ ${t(M.ITEMS[id].name)}`,world.position.x,world.position.z,'item');tone('success');}
      shop();}break;
    case 'equip':if(change(()=>M.equip(state,id))){equipFeedback(id);if(modal==='shop')shop();else inventory();}break;
    case 'eat':change(()=>M.eat(state,id));inventory();break;
    case 'sell-one':case 'sell-all':{const n=action==='sell-all'?M.looseQuantity(state,id):1;const value=change(()=>M.sell(state,id,n));if(value){tone('success');toast(`Sold for ${value} energy. Thank you, neighbor!`,'ϟ');}market();break;}
    case 'sell-produce':{const value=change(()=>sellProduce(state));if(value){tone('success');floating(`+${value} ϟ`);toast(`Sold all your produce for ${value} energy. Thank you, neighbor!`,'ϟ');}market();break;}
    // A tap moves the whole stack, like the reference's chest (equipped gear stays in the backpack).
    case 'transfer':{const store=button.dataset.direction==='store',n=store?M.looseQuantity(state,id):state.chest[id]??0;change(()=>{for(let i=0;i<n&&M.transfer(state,id,store);i++);});tone('click');storage();break;}
    case 'upgrade':{const kind=button.dataset.kind as keyof typeof M.UPGRADES;if(change(()=>M.upgrade(state,kind))){upgradeFeedback(kind);upgrades();tone('success');}break;}
    case 'craft':if(change(()=>M.craft(state,index))){crafting();toast('Made with your own two hands. Check your backpack!','🔨');}break;
    case 'launch':launch();break;case 'land':case 'autopilot-skip':tryLanding();break;case 'fly-to':flyTo(button.dataset.kind as M.PlanetId);break;
    case 'go':go(button.dataset.kind!);break;
    case 'wild':{closeDialog();const destinations:Record<string,[number,number]>={forest:[-30,0],meadow:[0,30],swamp:[0,-30],canyon:[30,0]};const destination=destinations[button.dataset.kind??'forest']??[0,-30];world.walkTo(destination[0],destination[1]);toast('Follow the path beyond the garden gate.','🍄');break;}
    case 'return-home':if(state.planet!=='home')flyHome();else{closeDialog();world.position.set(0,0,0);world.destination=null;world.route=[];world.selected=null;toast('Home, sweet home.','🏡');}break;
    case 'interact':world.interactNearest();break;case 'attack':basicAttack();break;case 'skill':skill(index);break;
    case 'fish-again':fish(fishPond);break;
    case 'reel':if(fishGame){if(event.detail===0)fishGame.input.toggle();}else if(button.classList.contains('cast'))fish(fishPond);break;
    case 'move-pad':state.settings.movePad=!state.settings.movePad;save();applyMovePad();settings();break;
    case 'sound':state.settings.sound=!state.settings.sound;save();settings();break;
    case 'place-beds':if(state.settings.placeBeds)delete state.settings.placeBeds;else state.settings.placeBeds=true;save();settings();break;
    case 'collect-farm':collectFarm();break;
    case 'buy-animal':buyAnimal(button.dataset.kind as M.AnimalKind);break;
    case 'feed-animal':{const crop=change(()=>M.feedAnimal(state,Number(button.dataset.id)));if(crop){tone('pop');feedBurst(Number(button.dataset.id));toast(`Fed a ${t(M.ITEMS[crop].name).toLowerCase()}. It will be quicker now.`,M.ITEMS[crop].icon);}penDialog();break;}
    case 'feed-all':{const before=new Set(M.farmOf(state).animals.filter(a=>M.canFeed(a)).map(a=>a.uid)),n=change(()=>M.feedAll(state));if(n){tone('pop');for(const uid of before)if(!M.canFeed(M.farmOf(state).animals.find(a=>a.uid===uid)!))feedBurst(uid);toast(`Fed ${n} animal${n>1?'s':''}.`,'🥕');}penDialog();break;}
    case 'build-pen':buildPenAction();break;
    case 'expand-pen':if(change(()=>M.expandPen(state))){tone('success');toast('The pen is bigger: room for 3 more chickens and 4 more cows.','🐔');}else toast(`You need ${M.penExpandCost(state)??0} energy to make the pen bigger.`,'ϟ');penDialog();break;
    case 'cook-dish':if(change(()=>M.cookDish(state,id))){tone('success');toast(`${t(M.ITEMS[id].name)} is ready. Enjoy!`,M.ITEMS[id].icon);cooking();}break;case 'graphics':graphics.choose(button.dataset.kind as QualitySetting);world.applyGraphics(graphics.profile,graphics.ratio);saveGraphics(graphics);state.settings.lowGraphics=graphics.level==='low';save();settings();break;
    case 'zoom-in':case 'zoom-out':world.zoom=clampZoom(Math.round((world.zoom+(action==='zoom-in'?-ZOOM.button:ZOOM.button))*100)/100,'wheel');world.resize();$('#zoom-value').textContent=t(`${Math.round(world.zoom*100)}%`);break;
    case 'reset-confirm':openDialog('reset','Begin a brand-new story?',`<p class="intro">This replaces your ${persistence?'online account adventure':'offline adventure in this browser'}, including your garden, items, and levels.</p><div class="button-row"><button class="soft-button" data-action="settings">Keep my adventure</button><button class="primary danger-button" data-action="reset">Start fresh</button></div>`,'A FRESH START');break;
    case 'reset':{const settingsCopy={...state.settings};state=M.newGame(state.name,state.color);state.settings=settingsCopy;world.state=state;rebuildHomePresentation('home');world.refreshPlayer();resetCombat();selectedItem=null;save();closeDialog();updateHud();toast('Every adventure starts with a little seed.','🌱');break;}
  }
});
$('#dialog-layer').addEventListener('click',e=>{if(e.target===$('#dialog-layer'))closeDialog();});
$('#world').addEventListener('pointerdown',event=>{if(started&&!uiBlocked()){const e=event as PointerEvent;e.preventDefault();gestures.down(e.pointerId,e.clientX,e.clientY);$('#world').setPointerCapture(e.pointerId);}});
$('#world').addEventListener('pointermove',event=>{const e=event as PointerEvent;gestures.move(e.pointerId,e.clientX,e.clientY);});
$('#world').addEventListener('wheel',event=>{if(uiBlocked())return;const e=event as WheelEvent;e.preventDefault();world.zoom=clampZoom(world.zoom+e.deltaY*ZOOM.wheelStep,'wheel');world.resize();},{passive:false});

$('#world').addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]'))return;
  if(flight){const key=event.code==='Space'?' ':event.key.toLowerCase();if(key===' '||key.startsWith('arrow'))event.preventDefault();if(!event.repeat&&['l','enter','f'].includes(key))tryLanding();else spaceKeys.add(key);return;}
  if(event.key==='Escape'){if(placement)cancelPlacement();else closeDialog();return;}if(placement&&event.key==='Enter'){confirmPlacement();return;}
  if(modal&&event.key==='Tab'){const controls=Array.from($('#dialog').querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a,[tabindex="0"]'));const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}return;}
  if((event.target as HTMLElement).matches('input,textarea,select')){if(event.key==='Enter'&&!started)start();return;}
  if(fishGame&&event.code==='Space'){event.preventDefault();fishGame.input.holdSpace();return;}
  if(!started||uiBlocked())return;
  if(event.key.startsWith('Arrow')){event.preventDefault();movement.pressKey(event.key);}
  if(event.repeat)return;
  const key=event.key.toLowerCase();if(placement&&key==='r'){rotatePlacement();return;}if(key==='i')inventory();else if(key==='j')quests();else if(key==='m')map();else if(key==='f')world.interactNearest();else if(['q','w','e','r'].includes(key))skill(['q','w','e','r'].indexOf(key));else if(event.code==='Space'){event.preventDefault();basicAttack();}
});
document.addEventListener('keyup',e=>{spaceKeys.delete(e.code==='Space'?' ':e.key.toLowerCase());movement.releaseKey(e.key);if(fishGame&&e.code==='Space')fishGame.input.releaseSpace();});
document.addEventListener('pointerdown',e=>{const target=(e.target as HTMLElement).closest<HTMLElement>('button');if(target?.dataset.move){e.preventDefault();movement.pressPointer(e.pointerId,target.dataset.move);target.setPointerCapture(e.pointerId);}if(target?.id==='reel-button'&&fishGame&&fishGame.input.ready){e.preventDefault();fishGame.input.pressPointer(e.pointerId);target.setPointerCapture(e.pointerId);}});
const releasePointer=(e:PointerEvent)=>{gestures.up(e.pointerId,e.type!=='pointerup');movement.releasePointer(e.pointerId);fishGame?.input.releasePointer(e.pointerId);};
document.addEventListener('pointerup',releasePointer);document.addEventListener('pointercancel',releasePointer);document.addEventListener('lostpointercapture',releasePointer);
window.addEventListener('blur',()=>{movement.clear();fishGame?.input.clear();gestures.clear();save();});window.addEventListener('beforeunload',save);document.addEventListener('visibilitychange',()=>{movement.clear();fishGame?.input.clear();gestures.clear();save();});
let previous=performance.now(),wasAirborne=false;
function frame(now:number){frameTime=frameTime*.9+(now-previous)*.1;const realDt=Math.min(1,(now-previous)/1000);previous=now;elapsed+=realDt;uiElapsed+=realDt;
  if(flight&&!arriving){updateSpace(realDt);if(uiElapsed>.12){uiElapsed=0;updateHud();}if(elapsed>8){elapsed=0;save();}requestAnimationFrame(frame);return;}
  ship.update(realDt,world.time);
  // Hit-stop: after a critical hit the world runs at a tenth of its speed for a heartbeat.
  let dt=realDt;const fx=world.fx;if(fx&&fx.hitstop>0){fx.hitstop-=realDt;dt*=.1;}
  // Simulate in small steps, then draw once. Movement remains consistent when a
  // browser throttles rendering, and collisions do not tunnel at a low frame rate. At most four steps
  // run per frame; a longer stall turns into slow motion rather than a spiral of ever longer frames.
  updateContextWeapon();
  for(const step of frameSteps(dt)){const active=started&&!uiBlocked()&&!document.hidden,combatActive=started&&!document.hidden&&(!uiBlocked()||!!network.role);combatTimers.advance(step,combatActive);combat.update(step,combatActive);world.movementLocked=combat.locksMovement;world.playerFlying=(combat.statuses.flight??0)>0;world.playerStealth=(combat.statuses.stealth??0)>0;gestures.update(step,active);world.update(step,active,false,started&&!document.hidden&&(active||!!network.role));if(active)world.player.position.y+=combat.airborne;combatView.update(step,combat.projectiles,combatActive,combat.allies);if(started&&!document.hidden)M.tickEffects(state,step);if(fishGame&&!document.hidden)updateFishing(step);}
  // Landing from the ground slam squashes the explorer and jolts the camera.
  const airborne=combat.airborne>0;if(wasAirborne&&!airborne){world.landT=.25;slamImpact();}wasAirborne=airborne;
  // The explorer's pose follows the weapon, skills, fishing line and hit invulnerability.
  const weaponKind=M.weaponStats(state).kind;world.weaponKind=state.gear.weapon&&M.ITEMS[state.gear.weapon]?.weapon?.kind==='rod'?'rod':state.gear.disguise?'fist':weaponKind;world.pose=combat.pose;world.invulnerable=combatTimers.invulnerable>0;world.fishTension=fishGame?.simulation.tension??0;
  autoAttack(weaponKind);
  fishingView.update(dt,world.time,fishGame||fishingView.active?tipPosition():rodTip,world.position,fishGame?.simulation??null);
  if(!fishGame&&!$('#reel-button').hidden&&(performance.now()>recastUntil||world.moving))showReel(false);
  // Resizing the WebGL canvas clears its drawing buffer. Apply automatic quality changes
  // before drawing, so the browser never presents an empty frame during a quality transition.
  const graphicsChange=graphics.sample(realDt,started&&!document.hidden&&!uiBlocked()&&performance.now()>settledAt);if(graphicsChange)world.applyGraphics(graphics.profile,graphics.ratio);if(graphics.takeSave())saveGraphics(graphics);
  world.render();positionLabels();minimap.frame(realDt);fx?.updateText(realDt,innerWidth,innerHeight);
  for(const listener of frameListeners)listener(dt);
  if(uiElapsed>.12){uiElapsed=0;world.syncCrops();updateHud();updateLabels();if(modal==='plot'){const p=state.plots[activePlot];if(p?.crop){$('#grow-fill').style.width=`${M.cropProgress(p)*100}%`;$('#grow-time').textContent=t(growText(p));}}if(modal==='pen'){if(penSignature(state)!==penShown)penDialog();else tickPen($('#dialog-body'),state);}}
  if(elapsed>8){elapsed=0;if(started)save();}requestAnimationFrame(frame);
}
requestAnimationFrame(frame);


function refreshDocumentLanguage(){
  document.title=t('Zoo Garden — A little world of adventure');
  document.querySelector('meta[name="description"]')?.setAttribute('content',t('A cozy little 3D world. Plant a garden, catch fish, battle monsters, and explore new planets.'));
}
refreshDocumentLanguage();
app.addEventListener('change',event=>{const input=event.target;if(input instanceof HTMLSelectElement&&input.hasAttribute('data-language'))setLanguage(input.value==='vi'?'vi':'en');});
onLanguageChange(()=>{
  refreshStaticLanguage();refreshWorldLanguage();refreshDocumentLanguage();
  app.querySelectorAll<HTMLSelectElement>('[data-language]').forEach(input=>{input.value=getLanguage();});
  updateHud();updateLabels();minimap.invalidate();
  if(started)showZone(world.lastZone||t(M.PLANETS[state.planet].name));
  if(modal==='settings'){settings();$<HTMLSelectElement>('#language-settings').focus({preventScroll:true});}
  else if(modal==='bag')inventory();else if(modal==='quests')quests();else if(modal==='shop')shop();else if(modal==='sell')market();else if(modal==='chest')storage();else if(modal==='upgrade')upgrades();else if(modal==='cook')cooking();else if(modal==='craft')crafting();else if(modal==='decor')decorations();else if(modal==='map')map();else if(modal==='travel')planets();else if(modal==='help')help();else if(modal==='pen')penDialog();
});
initOnline(gameBridge);
initPlatform(message=>toast(message));
// Development builds expose the game to browser tests; production builds leave this out.
if(import.meta.env.DEV)Object.assign(window,{__zoo:{world,drops,fishingView,get fishGame(){return fishGame;},get state(){return state;},planets,launch,flyHome,get flight(){return flight;},spaceView,toast,showZone}});
