import {cropBadgeAnchor} from './crop-cards.ts';
import {HELP_TOPICS} from './help-topics.ts';
import './farm.css';
import './joystick.css';
import { FishingProof } from './fishing-proof.ts';
import '@fontsource-variable/nunito';
import './style.css';
import './skills.css';
import { t, localizeHtml, getLanguage, setLanguage, onLanguageChange, bindLanguage } from './i18n.ts';
import './menus.css';
import { Box3, Vector3 } from 'three';
import { World, type Entity, type Enemy } from './world.ts';
import { dogCoatOf } from './dog-world.ts';
import { dogFollows } from './guard-dog.ts';
import { refinedAssets, sceneryKit, cropKit, fishKit, heroKit, spaceKit, wildsKit, brightKit, harshKit, dressingKit, KIT_FILES } from './assets.ts';
import { onArtLoaded } from './art-retry.ts';
import { LateArtQueue } from './late-art.ts';
import { parseHouse } from './house-activities.ts';
import { HOUSE_FILE } from './house-view.ts';
import { initArtNote } from './art-status.ts';
import { SpaceFlight, planRoutes, type RouteOption, type SpaceEvent } from './space.ts';
import { SpaceView } from './space-view.ts';
import { ShipSequence } from './ship-sequence.ts';
import { kitsFor } from './biomes.ts';
import { ENEMY_TYPES } from './enemy-types.ts';
import { FishingView, type PondView } from './fishing-view.ts';
import { FishHuntingView } from './fish-hunting-view.ts';
import { FISH_HUNT_COOLDOWN_MS, fishHuntTargets, huntingPondAt, type FishHuntResult } from './fish-hunting.ts';
import { LakeGuardianView, guardianLake } from './lake-guardian-view.ts';
import { decorIcon } from './icons.ts';
import { CombatHud, fightNear, lootText, zoneInfo, aggro } from './hud-combat.ts';
import { ChallengeDirector, renderChallenge } from './hud-challenge.ts';
import { KeysGuide } from './hud-keys.ts';
import * as M from './model.ts';
import {applyGameAction,isMalformedAction,type GameIntent,type ActionReply} from './actions.ts';
import { ContextGearSelection } from './context-gear.ts';
import { quickEatView, healingFoods, type FoodChoice } from './quick-eat.ts';
import { mountLongPress, cancelLongPresses } from './long-press.ts';
import { mountTouchButtons, cancelButtonTouches } from './touch-buttons.ts';
import { previewGear, canTryOn, autoHeld } from './try-on.ts';
import './quick-eat.css';
import { CombatTimers, FishingInput, MovementControls, gameplayKey, keyboardBindings, movementKey } from './gameplay-controls.ts';
import {mountJoystick} from './joystick.ts';
import { CombatSimulation, BASE_SKILLS, SPECIALS, type CombatHit, type CombatEffect } from './combat.ts';
import { skillPip } from './skill-pip.ts';
import { skillTip, BUFF_CHIPS } from './skill-info.ts';
import { skillSound } from './skill-sounds.ts';
import { initUpgradeBench as mountUpgradeBench } from './upgrade-bench.ts';
import { CombatView } from './combat-view.ts';
import { SkillFx } from './skill-fx.ts';
import { terrainHeight } from './environments.ts';
import { FishingSimulation, selectCatch, planCast, catchWeight, resolveMysteryCatch, newMysteryCaller, attractMystery, mysteryMissed, mysteryLanded } from './fishing.ts';
import { GroundGestures } from './gestures.ts';
import { ZOOM, clampZoom } from './camera-rig.ts';
import {clearSegment,WORLD_BOUNDS} from './navigation.ts';
import { progressEntries, claimProgress, recordEvent, rerollDaily, startChallenge, storyStep, challengeTitle, asHelper, type ProgressKind } from './progression.ts';
import { STORY_STEPS } from './content.ts';
import type { GameBridge, GameAction, NetworkHooks, NetworkDrop } from './game-bridge.ts';
import { initOnline } from './online.ts';
import { defeatPaysPlayer } from './safe-zone.ts';
import { initHudLayout } from './hud-layout.ts';
import { initBots, neighboursOn, setNeighboursOn } from './bots.ts';
import { initPlatform, toggleFullscreen } from './platform.ts';
import { Sfx, type Sound } from './sfx.ts';
import { audioOf, audioRowsHtml, bindAudioSliders, syncAudio } from './audio-settings.ts';
import { loadGraphics, saveGraphics, QUALITY, type QualitySetting } from './graphics.ts';
import { frameSteps } from './frame-steps.ts';
import { createDrops } from './drops-view.ts';
import { Minimap } from './minimap.ts';
import { produceLots, sellProduce, upgradeCards, cookSellPlan } from './item-views.ts';
import { cookSellHtml, treeFertilizerNote } from './econ-ui.ts';
import { initNewsBoard } from './news-board.ts';
import './econ-ui.css';
import './item-views.css';
import { penHtml, penSignature, tickPen, collectText, dishesHtml, chosenFeed, feedChoice, type FarmUi } from './farm-ui.ts';
// Compact HUD sizes; imported last so it overrides style.css (and the online/platform styles) for the HUD only.
import './hud-compact.css';
import { HelperView } from './helper-view.ts';
import * as Helper from './helper.ts';
import { helperRow, helperPanel } from './helper-ui.ts';
import { autoPlanting, autoPlantSwitch } from './auto-plant.ts';
import { autoPlantRow } from './auto-plant-ui.ts';
import * as FarmHelper from './farm-helper.ts';
import { FarmHelperView } from './farm-helper-view.ts';
import { FarmHelperController } from './farm-helper-controller.ts';
import { farmHelperPanel } from './farm-helper-ui.ts';
import { homeChip } from './home-care.ts';
import * as Restock from './farm-restock.ts';
import './helper.css';
import { FriendCrew, postFor } from './friend-crew.ts';
import { setFriendDresser } from './friend-view.ts';
import { PROFILE_SLOTS, activeSlot, activeKey, slotKey, setActiveSlot } from './profiles.ts';
import { ChatBubbles } from './friend-chat.ts';
import { Nameplates } from './nameplates.ts';
import { FRIENDS, FRIEND_IDS, type FriendId } from './friends.ts';
import { friendPanel, lockedHint, RESCUE_LINES } from './friend-ui.ts';
import './language.css';
import './house.css';
import { initHouse } from './house-ui.ts';
import { indoorStore, purposeHtml, wardrobeItem } from './house-stores.ts';
import { showsGain, type GainSource } from './work-effects.ts';
import { initLookShop } from './look-shop.ts';
import { GROWTH } from './growth.ts';
import * as Tester from './tester.ts';
import './tester.css';
import './item-groups.css';
import './special-offers.css';
import './hud-desk.css'; // last: the timed bonus line, level chip and desktop layout override the older HUD sheets
import {setDock,initDockFraming} from './dialog-dock';
import {iconPath} from './item-icons.ts';
import { WORK_ACTIONS, CATCH_UP_ACTIONS, explorerAway } from './delivery.ts';
import { initStoredNote } from './delivery-ui.ts';
import * as IG from './item-groups.ts';
import { dogMayToss, dogTossFactor, DOG_TOSS_CD } from './guard-dog.ts';

// The HUD asks for the same ~40 elements several times a second: remember them while they stay in the page.
const $found=new Map<string,HTMLElement>();
const $ = <T extends HTMLElement = HTMLElement>(selector: string) => {let el=$found.get(selector);if(!el?.isConnected){el=document.querySelector<HTMLElement>(selector)??undefined;if(el)$found.set(selector,el);}return el as T;};
/** Write only what changed: an unchanged write still dirties style and layout, 8 times a second on a slow phone. */
const setText=(el:Element,v:string)=>{if(el.textContent!==v)el.textContent=v;};
const lastHtml=new WeakMap<Element,string>();
const setHtml=(el:Element,v:string)=>{if(lastHtml.get(el)===v)return false;lastHtml.set(el,v);el.innerHTML=v;return true;};
const lastWidth=new WeakMap<Element,string>();
const setWidth=(el:HTMLElement,v:string)=>{if(lastWidth.get(el)===v)return;lastWidth.set(el,v);el.style.width=v;};
/** The discovery pill's size, measured once per text change (its text is set in one place); 0 = measure again. */
const discoverySize={w:0,h:0};
// Sized by a ResizeObserver (after layout) instead of offsetWidth: reading it when the pill appears forced a ~60 ms layout on slow phones.
let discoveryObserver:ResizeObserver|null=null;
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let saved: M.SaveState | null = null;
try { saved = M.parseSave(localStorage.getItem(activeKey())); } catch { /* Play remains available without storage. */ }
let state = saved ?? M.newGame();
let started = false, modal = '', selectedItem: M.ItemId | null = null, activePlot = 0, lastFocused: HTMLElement | null = null;
let saveFailed = false, elapsed = 0, uiElapsed = 0, frameTime = 16;
const combatTimers = new CombatTimers();
const contextGear = new ContextGearSelection();
let gearState=state,gearPlanet=state.planet,gearWater=false,combatGearUntil=0;
const cooldowns = combatTimers.skills, skillDurations = [7,4,9,6];
let audio: AudioContext | null = null;
type FishPick={id:string;power:number;size:number;huge:boolean;mystery?:boolean;supergiant?:boolean};
type FishingRound={input:FishingInput;simulation:FishingSimulation<FishPick>;lastPhase:string;seen:{missed:number;bait:number;early:number;strains?:number};strainWarned?:boolean;tooEarlyUntil:number;ticket?:string;pending?:boolean;ready?:FishPick;proof?:FishingProof;approach:number;pondId:string;mysteryOut?:boolean};
let fishGame:FishingRound|null=null;
let fishingEpoch=0;
/** Where the last line went in, so the Cast button and F recast to the same spot. */
let lastCast:{id:string;x:number;z:number}|null=null;
let fishingWater='home';
let shopTab='Weapons',journalTab:ProgressKind='story',craftStation:'craft'|'forge'='craft',craftTab='All';
let placement:{id:string;rotation:number;x:number;z:number;ok:boolean}|null=null,visiting:string|null=null,visitHome:M.SaveState|null=null;
let persistence:((state:M.SaveState)=>void)|null=null,network:NetworkHooks={role:null};
let actionHandler:((intent:GameIntent)=>Promise<ActionReply>)|null=null;
/**
 * Runs one intent through the shared rules (actions.ts), or the server online. A refusal comes back with its reason in
 * plain words (refusals.ts) and is shown as a toast. Two kinds stay off the screen and go to the console for developers:
 * a malformed intent (the generic "not available" text: a bug in the caller, nothing the player can act on), and any
 * refusal of a `quiet` intent, which the helpers send by themselves (another worker or the player got there first).
 */
async function perform<T=any>(type:string,payload:Record<string,unknown>={},{quiet=false}:{quiet?:boolean}={}):Promise<T|undefined>{
  const before=state.level,original=state,online=!!actionHandler;
  try{const result=actionHandler?(await actionHandler({type,payload})).result:applyGameAction(state,{type,payload},{now:Date.now(),random:Math.random});
    if(state!==original)return undefined;if(!online)levelCheck(before);save();updateHud();return result as T;
  }catch(error){if(state===original)reportRefusal(type,payload,error,quiet);return undefined;}
}
function reportRefusal(type:string,payload:Record<string,unknown>,error:unknown,quiet:boolean){
  const message=error instanceof Error?error.message:'';
  if(isMalformedAction(error)){console.warn(`[zoo] malformed action "${type}"`,payload,error);return;}
  if(quiet||!message){console.debug(`[zoo] ${type} skipped: ${message||String(error)}`,payload);return;}
  toast(t(message),'💭');
}
// The starship (set up once the world exists); while flying, space replaces the world.
let shipSequence:ShipSequence|undefined,flight:SpaceFlight|null=null,arriving=false,launchPending=false;
// The graphics governor ignores the first seconds after starting or landing: model files are still
// arriving and shaders compiling, and those hitches say nothing about how fast the device is.
let settledAt=0;const settle=()=>{settledAt=performance.now()+4000;};
const frameListeners=new Set<(dt:number)=>void>(),actionListeners=new Set<(action:GameAction)=>void>();
function languageSelector(place:string){return `<div class="language-picker"><label for="language-${place}">Language</label><select id="language-${place}" data-language aria-label="Language"><option value="en" data-i18n-skip ${getLanguage()==='en'?'selected':''}>English</option><option value="vi" data-i18n-skip ${getLanguage()==='vi'?'selected':''}>Tiếng Việt</option></select></div>`;}
function keyboardSettings(){
  const selected=state.settings.keyboardLayout==='classic'?'classic':'wasd';
  const description=selected==='wasd'?'WASD: move · J/K/L/;: skills · P: journal':'Arrows: move · Q/W/E/R: skills · J: journal';
  return `<div class="settings-row keyboard-settings"><div><strong>PC keyboard layout</strong><small>${description}</small></div><div class="segmented" role="radiogroup" aria-label="PC keyboard layout">${(['classic','wasd'] as const).map(layout=>`<button role="radio" aria-checked="${selected===layout}" class="${selected===layout?'on':''}" data-action="keyboard-layout" data-kind="${layout}">${layout==='wasd'?'WASD + JKL;':'Arrows + QWER'}</button>`).join('')}</div></div>`;
}
const app = $('#app');
app.innerHTML = `
  <div id="darkness" hidden></div><div id="world-labels" aria-label="Nearby places"></div>
  <div id="hud" hidden>
    <header class="player-card"><button class="avatar" data-action="bag" aria-label="Open character and backpack"><span>🌱</span></button><div class="player-details"><div class="player-name"><strong id="player-name"></strong><span id="level-text" class="level-chip">Lv 1</span></div><div class="meter health"><div id="hp-fill"></div><span id="hp-text">100 / 100</span></div><div class="meter experience"><div id="xp-fill"></div><span id="xp-text">EXP 0 / 32</span></div><div class="location"><span class="location-dot"></span><span id="zone-name">Clover Village</span></div></div></header>
    <nav class="top-actions" aria-label="Game menu"><div class="energy"><span>ϟ</span><b id="energy">0</b></div><button class="icon-button" data-action="bag" title="Backpack · I" aria-label="Backpack">🎒</button><button class="icon-button" data-action="quests" title="Journal · J" aria-label="Quest journal">📖<i id="quest-dot"></i></button><div id="social-slot"></div><button class="icon-button secondary-icon" data-action="help" title="How to play" aria-label="How to play">?</button><button class="icon-button" data-action="settings" title="Settings" aria-label="Settings">⚙</button><div id="platform-slot"></div></nav>
    <div class="tracker-stack"><button id="tracker-chip" class="tracker-chip" data-action="trackers" aria-label="Show quest and bounty" hidden><span id="chip-quest">🥕 0/3</span><span id="chip-chal"></span><span id="chip-bounty">🎯</span><i>▸</i></button><div class="tracker-panels"><aside class="quest-tracker"><button class="tracker-fold" data-action="trackers" aria-label="Fold quest and bounty">▾ Fold</button><div class="eyebrow">ADVENTURE <span id="quest-chapter">1 / 9</span></div><button id="quest-summary" data-action="quests"><span class="quest-icon" id="quest-icon">🥕</span><span><strong id="quest-title">A little green beginning</strong><small id="quest-task">Harvest 3 crops · 0 / 3</small></span><b class="tracker-count" id="quest-count"></b><span class="chevron">›</span></button><div class="quest-progress"><i id="quest-fill"></i></div><button id="quick-claim" data-action="claim" hidden>Collect your reward ✨</button></aside>
    <button id="challenge-tracker" class="challenge-tracker" data-action="journal-tab" data-kind="challenges" hidden><span class="ch-ring" aria-hidden="true"><span class="ch-icon">⏱️</span></span><div><strong>Quick challenge</strong><small></small></div><b class="tracker-count"></b></button>
    <button id="bounty-tracker" class="bounty-tracker" data-action="journal-tab" data-kind="bounties"><span>🎯</span><div><strong id="bounty-title">A new bounty</strong><small id="bounty-task">Find your next adventure</small></div><b class="tracker-count" id="bounty-count"></b></button></div><div id="buff-bar" aria-label="Active effects"></div><div class="quick-eat"><button id="quick-eat" class="idle" data-action="quick-eat" title="Eat · H" aria-label="Eat"><span id="quick-eat-icon" aria-hidden="true">🍽️</span><b id="quick-eat-count">0</b></button><button class="quick-eat-pick" data-action="quick-eat-pick" aria-label="Choose food" aria-expanded="false">▾</button><div id="quick-eat-menu" hidden></div></div></div><button class="minimap" data-action="map" aria-label="Open village map"><canvas id="minimap" width="150" height="150"></canvas><span>N</span><small id="map-caption">CLOVER VILLAGE</small></button>
    <div id="boss-bar" hidden><span id="boss-icon">👑</span><div><div class="boss-head"><strong id="boss-name"></strong></div><div class="boss-meter"><i id="boss-fill"></i></div></div></div>
    <div id="target-frame" hidden aria-live="off"><span class="target-icon"></span><div><div class="target-head"><strong></strong><span class="target-level">Lv 1</span></div><div class="target-meter"><i></i><b class="target-hp"></b></div></div></div>
    <div id="zone-banner" role="status"><strong id="banner-name">Clover Village</strong><small id="banner-detail">A little place to call home</small><span id="banner-chip"></span></div>
    <button id="reel-button" class="reel-hud" data-action="reel" hidden aria-label="Reel in the line"><span class="reel-icon" aria-hidden="true">🎣</span><span id="reel-text">Reel</span></button><div id="fish-hint" role="status" hidden></div>
    <div id="context-prompt" hidden><button id="interact-button" data-action="interact"><kbd>F</kbd><span id="interact-text">Interact</span></button></div>
    <div class="bottom-bar"><div class="skills" aria-label="Combat skills"><button class="skill skill-spin" data-action="skill" data-index="0" aria-label="Q Whirlwind"><kbd>Q</kbd><span>🌀</span><small>Whirlwind</small><b class="cooldown"></b></button><button class="skill skill-dash" data-action="skill" data-index="1" aria-label="W Dash"><kbd>W</kbd><span>➶</span><small>Dash</small><b class="cooldown"></b></button><button class="skill skill-stomp" data-action="skill" data-index="2" aria-label="E Ground stomp"><kbd>E</kbd><span>💥</span><small>Stomp</small><b class="cooldown"></b></button><button class="skill skill-special" data-action="skill" data-index="3" aria-label="R Special attack"><kbd>R</kbd><span>✦</span><small id="special-name">Star punch</small><b class="cooldown"></b></button></div><div id="keys-guide" class="keys-guide" aria-label="Keyboard controls"></div><div class="control-hint"><span>Click to wander</span><i>•</i> <span id="movement-hint">Arrows to move</span> <i>•</i> <kbd>Space</kbd> attack</div><button class="home-button" data-action="return-home" title="Return home">⌂ <span>Home</span></button></div>
    <div id="touch-controls"><button data-move="ArrowUp" aria-label="Move up">▲</button><div><button data-move="ArrowLeft" aria-label="Move left">◀</button><button data-action="attack" aria-label="Attack">⚔</button><button data-move="ArrowRight" aria-label="Move right">▶</button></div><button data-move="ArrowDown" aria-label="Move down">▼</button></div>
    <div id="environment-bar" aria-label="Environment"></div><div id="placement-bar" hidden><p><span id="placement-name"></span><span id="placement-hint"></span></p><div class="placement-buttons"><button class="sky-button" data-action="rotate-decor">↻ Rotate</button><button class="primary" data-action="confirm-place">✔ Place</button><button class="soft-button" data-action="cancel-decor" aria-label="Cancel">✕</button></div></div><div id="visit-banner" hidden></div>
    <button id="discovery-progress" data-action="discovery" aria-label="Discovery log"><b aria-hidden="true">?</b><span id="discovery-text"></span></button>
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
  <div id="title-screen"><div class="title-shade"></div><div class="welcome-card">${languageSelector('welcome')}<div class="welcome-eyebrow"><span></span> YOUR NEXT LITTLE ADVENTURE</div><div class="brand-sprout">🌱</div><h1>Zoo <em data-i18n-skip>Garden</em><span>grow a little. wander a lot.</span></h1><p>A cozy home, a pocketful of seeds,<br>and a whole world waiting for you.</p><div class="welcome-form">${profilePicker()}<label for="name-input">WHAT SHOULD WE CALL YOU?</label><input id="name-input" aria-label="Your character name" maxlength="20" value="${esc(saved?.name ?? '')}" placeholder="Your name" autocomplete="off"><fieldset class="color-picker"><legend>Pick your favorite color</legend>${M.COLORS.map((c,i)=>`<button type="button" data-action="color" data-color="${c}" style="--swatch:${c}" class="${state.color===c?'selected':''}" aria-label="${['Sky blue','Rose pink','Leaf green','Honey yellow','Lavender','Terracotta'][i]}" aria-pressed="${state.color===c}"></button>`).join('')}</fieldset><button class="primary start-button" data-action="start">${saved?'Continue adventure':'Let’s play'} <span>→</span></button></div><div class="welcome-footer"><span>🌾 Grow</span><span>🎣 Discover</span><span>✨ Adventure</span></div>${import.meta.env.VITE_ONLINE_URL?`<a id="online-link" class="online-link" hidden href="${esc(String(import.meta.env.VITE_ONLINE_URL))}">🌐 ${t('Play online with friends')} →</a>`:''}<small class="local-note">${import.meta.env.VITE_STATIC_HOST==='true'?'Solo adventure · progress saved in this browser':'Play offline, or meet friends online'}</small></div><div class="title-caption"><span>🌿</span> WELCOME TO CLOVER VILLAGE</div></div>
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
initDockFraming(world.camera); // desktop menus dock right; slide the picture so the hero stays clear (dialog-dock.ts)
// Your guard dog: none while visiting someone else's garden (it stays at your own pen).
world.ownDog=()=>visiting?null:dogCoatOf(state);
world.petStaysHome=()=>!!visiting; // and your pet waits there too (pet-pen.ts)
world.applyGraphics(graphics.profile, graphics.ratio);world.fx?.setTextLayer($('#floating-text'));
// Over-head HP bars, target frame and boss bar; the trackers fold to a chip in fights ('auto'), or as the player asks.
// The timed bonus line (hud-challenge.ts) and the desktop keyboard guide (hud-keys.ts).
const challenges=new ChallengeDirector({state:()=>state,active:()=>started&&!modal&&!visiting&&!flight&&!world.interior&&state.hp>0&&world.state===state,
  chances:()=>{const p=world.position,near=(r:number,boss:boolean)=>world.enemies.some(e=>e.hp>0&&e.boss===boss&&Math.hypot(e.x-p.x,e.z-p.z)<r);
    return {kill:near(45,false),skill:near(30,false)||near(30,true),harvest:world.planet==='home'&&state.plots.filter(x=>x.crop).length>=4,fish:!!contextGear.forFishing(state)&&world.entities.some(e=>e.pond&&Math.hypot(e.x-p.x,e.z-p.z)<25),boss:world.enemies.some(e=>e.boss&&e.hp>0&&aggro(e)&&Math.hypot(e.x-p.x,e.z-p.z)<25)};},
  start:async type=>!!await perform('startChallenge',{kind:type}),claim:async id=>!!await perform('claimProgress',{kind:'challenges',id}),toast:(text,icon)=>toast(text,icon),won:()=>tone('success')});
const keysGuide=new KeysGuide($('#keys-guide'),(()=>{try{return localStorage;}catch{return null;}})());
const combatHud=new CombatHud($('#world-labels'),(x,y,z)=>world.screen(x,y,z));let trackerMode:'auto'|'open'|'fold'='auto',wasFight=false;
// The whole-world minimap (minimap.ts): terrain cached per world, markers redrawn five times a second.
const minimap=new Minimap($<HTMLCanvasElement>('#minimap'),$('#map-caption'),()=>started?{planet:world.planet,layout:world.environment.layout,position:world.position,facing:world.facing,entities:world.entities,enemies:world.enemies,
  penBuilt:M.penBuilt(world.state),ready:[...world.entities.filter(e=>e.kind==='plot'&&!!world.state.plots[e.index!]?.crop&&M.cropProgress(world.state.plots[e.index!])>=1),...(world.planet==='home'?M.readyAnimals(world.state).flatMap(a=>world.farmView?.positionOf(a.uid)??[]):[])],remotes:[...world.remotePlayers.values()].filter(r=>r.mesh.visible).map(r=>r.mesh.position)}:null);
const movement = new MovementControls(world.keys);
const joystick=mountJoystick($('#hud'),()=>started&&!uiBlocked()&&!placement&&!flight,direction=>{world.joystickInput=direction;});
const combatView=new CombatView(world.scene);
// Laser gaze beams, electric bolts and bursts, scorch marks and the ⚡ mark (skill-fx.ts), for the explorer and remote players alike.
const skillFx=new SkillFx(world.scene,world.fx??null,{
  explorerAt:(x,z)=>Math.hypot(world.position.x-x,world.position.z-z)<1.5?world.player:[...world.remotePlayers.values()].find(r=>r.mesh.visible&&Math.hypot(r.pose.x-x,r.pose.z-z)<1.5)?.mesh??null,
  ground:(x,z)=>world.interior?0:Math.max(0,terrainHeight(world.environment.layout,{x,z})),targets:()=>world.enemies,sound:kind=>tone(kind),
  density:()=>world.fx?.density??1,isLocal:(x,z)=>Math.hypot(world.position.x-x,world.position.z-z)<1.5});
combatView.electric=(x,y,z,dx,dz)=>skillFx.crackle(x,y,z,dx,dz);
combatView.trail=(x,y,z,color)=>world.fx?.burst({x,z},{n:1,glow:true,color,size:.06,life:.38,speed:.25,up:.15,gravity:0,y:y-.15,spread:.1});
world.onElectricShot=(x,y,z,dx,dz)=>skillFx.crackle(x,y,z,dx,dz);world.onElectricPop=(x,z)=>skillFx.shock({x,z,kind:'impact',radius:.7,color:'#8fdcff',look:'shock'},false,false);
const combat=new CombatSimulation({
  position:()=>world.position,facing:()=>world.facing,face:angle=>world.facing=angle,
  moving:()=>world.moving,skillLevel:i=>M.skillLevel(state,i),
  // The pet shoots only while it follows you away from home (pet-pen.ts); waiting by the pen it never fights.
  pet:()=>{const pet=state.gear.pet&&M.ITEMS[state.gear.pet]?.pet;return pet&&Number.isFinite(pet.dmg)&&Number.isFinite(pet.cd)&&started&&!visiting&&!fishGame&&!!world.petPen?.mayFight(world.planet,world.position,!!world.interior)?{dmg:pet.dmg!*M.gearFactor(state,state.gear.pet!),cd:pet.cd!,shot:pet.shot,x:world.companion.position.x,z:world.companion.position.z}:null;},
  // The guard dog tosses bones only while it follows you away from home (guard-dog.ts); your target first.
  dog:()=>{const g=world.guardDogs;return g&&started&&!visiting&&!fishGame&&!world.boarded&&dogMayToss(g.place,world.planet,world.position,!!world.interior)?{x:g.link.x,z:g.link.z,dmg:dogTossFactor(state.level),cd:DOG_TOSS_CD,target:world.selected?.kind==='enemy'?(world.selected as Enemy).id:null}:null;},
  targets:()=>world.enemies,weapon:()=>M.weaponStats(state),stats:()=>M.activeStats(state),
  move:(x,z)=>{const steps=Math.max(1,Math.ceil(Math.hypot(x,z)/.2));for(let i=0;i<steps;i++)world.move(x/steps,z/steps);},
  hit:(target,impact)=>hit(target as Enemy,impact.amount,impact.stun,impact),
  clearShot:(from,to)=>clearSegment(from,to,world.obstacles,{bounds:WORLD_BOUNDS,clearance:.05}),
  effect:effect=>{showEffect(effect);emitAction({kind:'effect',effect});},
  heal:fraction=>{if(!actionHandler)state.hp=Math.min(M.maxHp(state),state.hp+M.maxHp(state)*fraction);},
  execute:(target,fraction)=>executeEnemy(target as Enemy,fraction),
  status:(target,kind,duration)=>{if(actionHandler)return;if(!network.status?.(target.id,kind,duration))world.statusEnemy(target as Enemy,kind,duration);},
  moveTarget:(target,x,z)=>{if(actionHandler)return;if(!network.moveTarget?.(target.id,x,z))moveEnemy(target as Enemy,x,z);},
});
combatHud.isMarked=id=>combat.marked.has(id);
const gestures=new GroundGestures({tap:(x,y)=>{if(placement)placeAt(x,y);else world.pointer(x,y);},walk:(x,y)=>{if(!placement)world.steer(x,y);},zoom:ratio=>{world.zoom=clampZoom(world.zoom*ratio,'pinch');world.resize();},stop:()=>{world.destination=null;world.route=[];world.selected=null;}});
// Swings become additive slash trails and area skills become expanding rings with sparks.
function showEffect(effect:CombatEffect){
  const fx=world.fx,at={x:effect.x,z:effect.z};
  if(skillFx.disguises.play(effect))return;
  if(effect.kind==='toss'){world.guardDogs?.toss(effect);return;}
  if(effect.look==='boulder'&&effect.kind==='cast'){skillFx.boulders.throw(effect);return;}
  if(effect.look==='boulder'&&effect.kind==='ring'&&fx){const y=world.interior?0:Math.max(0,terrainHeight(world.environment.layout,at));fx.burst(at,{n:20,color:['#c96a3a','#f3b27a','#8b5034'],size:.25,speed:8,up:8,y:y+.2,life:.65,gravity:18});fx.ring(at,{color:effect.color,from:.3,to:effect.radius,life:.4,y:y+.12,thick:.25});return;}
  if(effect.look==='eyes'&&effect.kind==='beam'){skillFx.gaze(effect);return;}
  if(effect.look==='burn'){skillFx.burn(effect);return;}
  // Electric bursts keep the faint disc and rim at the exact blast radius, then crackle instead of the plain ring.
  if(effect.look==='shock'&&(effect.kind==='ring'||effect.kind==='impact')){if(fx&&effect.kind==='ring'&&effect.radius>=1.5){fx.ring(at,{color:effect.color,from:effect.radius,to:effect.radius,life:.42,y:.1,thick:1,opacity:.18});fx.ring(at,{color:'#d8f4ff',from:effect.radius,to:effect.radius*1.02,life:.42,y:.12,thick:.06,opacity:.9});}skillFx.shock(effect);return;}
  if(fx&&effect.kind==='arc'){const fist=effect.radius<=1.85;fx.slash(at,effect.facing??world.facing,effect.radius+.25,effect.color,fist?{arc:1.4,life:.15,thick:.4}:{arc:Math.min(6.2,effect.arc??2.2)});return;}
  // An area hit also leaves a faint filled disc and a rim at its exact radius (skill-info.ts), so the player sees what the blast covered.
  if(fx&&effect.kind==='ring'&&effect.radius>=1.5){fx.ring(at,{color:effect.color,from:effect.radius,to:effect.radius,life:.42,y:.1,thick:1,opacity:.22});fx.ring(at,{color:effect.color,from:effect.radius,to:effect.radius*1.02,life:.42,y:.12,thick:.06,opacity:.85});}
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
// The village's fence, gates, blossom trees, stepping stones and bushes are made from the scenery kit when the world is built.
// A kit that arrives after Start (a slow phone network) is picked up by one rebuild at the next quiet moment at home.
let villageNeedsKit=!sceneryKit.ready;
if(!sceneryKit.ready)void sceneryKit.load().then(()=>{if(sceneryKit.ready&&!started){world.build(state.planet);world.refreshPlayer();villageNeedsKit=false;}});
frameListeners.add(()=>{if(!villageNeedsKit||!sceneryKit.ready||!started)return;if(world.planet!=='home'){villageNeedsKit=false;return;} // another planet: the next home build has the kit
  if(modal||visiting||flight||world.interior||fishGame||placement||world.enemies.some(e=>e.hp>0&&aggro(e)))return;
  villageNeedsKit=false;rebuildHomePresentation('home');world.refreshPlayer();});
// Models that only arrive after their retries (art-retry.ts) swap in without a reload; before Play a rebuild also brings in late trees.
// Files landing together are handled once per frame, each refreshing only what it dresses (late-art.ts).
initArtNote();const lateArt=new LateArtQueue();onArtLoaded(url=>lateArt.add(url));
frameListeners.add(()=>{const urls=lateArt.take();if(!urls.length)return;if(!started){world.build(state.planet);world.refreshPlayer();}else{world.refreshArt(urls);if(house.inside&&urls.includes(HOUSE_FILE))void house.house.view.refine();}if(urls.includes(KIT_FILES.fish)&&!fishGame)stockPonds();});

const sfx=new Sfx();
// Settings volume sliders (audio-settings.ts): effects preview with a click while dragging; letting go saves.
bindAudioSliders(app,(kind,value)=>{if(kind==='sfx'){sfx.volume=value;sfx.play('click');}},(kind,value)=>{void perform('settings',{settings:kind==='music'?{musicVolume:value}:{sfxVolume:value}}).then(()=>syncAudio(state.settings));});
function tone(kind: Sound = 'click') { sfx.volume = audioOf(state.settings).sfxVolume; sfx.play(kind); }
const vibrate=(ms:number)=>{try{if(audioOf(state.settings).vibrate&&matchMedia('(pointer: coarse)').matches)navigator.vibrate?.(ms);}catch{/* Optional. */}};
function save() { if(!started)return;if(persistence){persistence(state);return;}try { state.savedAt=Date.now();localStorage.setItem(activeKey(),JSON.stringify(contextGear.persisted(state)));saveFailed=false;$('#save-status').textContent=t('● Saved on this device'); } catch { saveFailed=true;$('#save-status').textContent=t('○ Saving unavailable'); } }
// Keep at most three messages on screen (two on phones, where they also leave sooner); older ones fade out instead of stacking up the view.
const phoneScreen=matchMedia('(max-width: 600px), (max-height: 520px)');
function toast(message: string, icon='✨') {
  message=t(message);
  const stack=$('#toasts'),el=document.createElement('div');el.className='toast';el.innerHTML=`<span>${icon}</span><div>${esc(message)}</div>`;stack.append(el);
  const dismiss=(node:Element)=>{if(node.classList.contains('leaving'))return;node.classList.add('leaving');setTimeout(()=>node.remove(),300);};
  const live=Array.from(stack.children).filter(node=>!node.classList.contains('leaving'));const keep=phoneScreen.matches?2:3;for(const old of live.slice(0,Math.max(0,live.length-keep)))dismiss(old);
  setTimeout(()=>dismiss(el),phoneScreen.matches?2800:3800);
}
// Blender-rendered icons for crops, fish, gear, items, cooked food and dishes (item-icons.ts); decorations are drawn
// from their 3D models by the game. Emoji remain the fallback.
const ICON_BASE=`${import.meta.env.BASE_URL}assets/icons/`;
const missingIcons=new Set<string>();
function art(id:string,icon:string):string{
  if(Object.hasOwn(M.ITEMS,id)&&M.ITEMS[id].type==='decor'){const url=decorIcon(id);return url?`<img class="art-icon" src="${url}" alt="" draggable="false">`:icon;}
  const path=iconPath(id);
  return path&&!missingIcons.has(id)?`<img class="art-icon" src="${ICON_BASE}${path}" alt="" draggable="false" data-id="${esc(id)}" data-fallback="${esc(icon)}">`:icon;
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
/** Home clears bad effects (home-care.ts): a short sparkle and a toast. */
function cleansedFx(){world.fx?.burst({x:world.position.x,z:world.position.z},{n:18,color:['#ffffff','#bff7ff','#ffe9a8'],glow:true,size:.1,speed:3,up:4,y:1});toast('Cleansed! Bad effects wash away at home.','✨');}
function levelCheck(before:number) {if(state.level>before){toast(`Level ${state.level}! A little stronger, a little braver.`,'🌟');tone('level');world.burst(world.position.x,world.position.z,'#f5dc8f',35);}}
function change<T>(action:()=>T):T {const before=state.level;const result=action();levelCheck(before);save();updateHud();return result;}
function uiBlocked(){return !!modal||!!document.querySelector('dialog[open]')||shipSequence?.busy||!!flight||arriving;}
function botActive(){return started&&!actionHandler&&!document.hidden&&!uiBlocked()&&!placement&&!world.interior&&world.planet==='home'&&state.hp>0;}
/** 'wardrobe' while the bag was opened from the bedroom wardrobe: it then lists only things to wear (house-stores.ts). */
let bagMode:'bag'|'wardrobe'='bag';
function openDialog(type:string,title:string,body:string,kicker='MAKE YOURSELF AT HOME',icon?:string) {
  if(fishGame)endFishing();
  // Inside the cottage the stove, workbench, globe, wardrobe and mirror are their own places, not the village shops (house-stores.ts).
  const store=indoorStore(type,!!world.interior,bagMode==='wardrobe');if(store){title=store.title;kicker=store.kicker;icon=store.icon;body=purposeHtml(store)+body;}$('#dialog').dataset.station=store?type:'';setDock(type);
  if(!modal)lastFocused=document.activeElement as HTMLElement;const reopened=modal===type;modal=type;clearHeldInput();world.destination=null;world.route=[];
  const [defaultIcon,look]=DIALOG_LOOK[type]??['✨','garden'];$('#dialog').dataset.tone=look;$('#dialog-icon').innerHTML=localizeHtml(icon??defaultIcon);
  // Re-rendering the same panel (a tab, a purchase) keeps the reader's scroll position.
  const bodyNode=$('#dialog-body'),scroll=bodyNode.scrollTop,tab=bodyNode.querySelector('.panel-tabs .active')?.textContent;
  $('#dialog-title').textContent=t(title);$('#dialog-kicker').textContent=t(kicker);bodyNode.innerHTML=localizeHtml(body);$('#dialog-layer').hidden=false;$('#hud').inert=true;$('#world-labels').inert=true;
  bodyNode.scrollTop=reopened&&bodyNode.querySelector('.panel-tabs .active')?.textContent===tab?scroll:0;
  $('.close-button').focus({preventScroll:true});
}
// The Mirror docks with 'trying-on' even before a preview (look-shop.ts), so closing always clears it: a later panel or confirmation must not inherit it.
function closeDialog(){endTryOn();$('#dialog-layer').classList.remove('trying-on');modal='';bagMode='bag';$('#dialog-layer').hidden=true;$('#hud').inert=false;$('#world-labels').inert=false;lastFocused?.focus();clearHeldInput();}
/** The three save profiles on the title screen: name and level of each, or an empty slot for a new game. */
function profilePicker(){
  const cur=activeSlot();
  const items=Array.from({length:PROFILE_SLOTS},(_,i)=>{let s:M.SaveState|null=null;try{s=M.parseSave(localStorage.getItem(slotKey(i)));}catch{}
    return `<button type="button" data-action="profile" data-slot="${i}" class="${i===cur?'selected':''}" aria-pressed="${i===cur}"><b>${t('Profile')} ${i+1}</b><small>${s?`${esc(s.name)} · ${t('Level')} ${s.level}`:t('New game')}</small></button>`;}).join('');
  return `<fieldset class="profile-picker"><legend>${t('Choose a save profile')}</legend>${items}</fieldset>`;
}
/** The first helper's greeting: the cook introduces herself and offers the 1M energy she says she won in the lottery. */
function welcomeDialog(){
  openDialog('welcome',t('Welcome to the game!'),`<p class="intro">${t('Hi boss! I am Pepper, your cook. Welcome to the game!')}</p><p>${t('Guess what? You are lucky today! I played the lottery and won 1,000,000 energy. Do you want it?')}</p><div class="button-row"><button class="primary" data-action="welcome-take">${t('Yes, take it!')}</button><button class="soft-button" data-action="welcome-pass">${t('No, thanks')}</button></div>`,t('YOUR COOK'),'🍳');
}
async function start() {settle();showTrimNote();const name=$<HTMLInputElement>('#name-input').value.trim().slice(0,20)||state.name;if(name!==state.name)await perform('settings',{name});started=true;$('#title-screen').hidden=true;$('#hud').hidden=false;if(state.welcome==='pending')welcomeDialog();void world.renderer.compileAsync(world.scene,world.camera).catch(()=>{}); // warm the village's shaders off the first walk
  applyMovePad();save();updateHud();updateLabels();toast(saved?t('Welcome back, {name}. Your garden missed you!',{name:state.name}):'Start small: click a garden bed to plant your first carrot.','🌱');showZone('Clover Village');}

/** Beds that ripened while the game was closed: the helper harvests and replants each once (helper.ts catchUp). */
async function helperCatchUp(){const r=actionHandler?await workPerform<ReturnType<typeof Helper.catchUp>>('helperCatchUp'):change(()=>applyGameAction(state,{type:'helperCatchUp',payload:{away:catchUpAway()}}) as ReturnType<typeof Helper.catchUp>);if(r&&(r.harvested.length||r.planted.length))setTimeout(()=>toast(t('While you were away, Bolt harvested {count} crops and planted {beds} beds.',{count:r.harvested.length,beds:r.planted.length}),'🤖'),2600);}
function updateHud() {
  const known=new Set(world.state.discovered),discoveryCount=t('Discovered {count}/{total} planets',{count:known.size,total:Object.keys(M.PLANETS).length});
  if(setHtml($('#discovery-text'),`<strong>🔭 ${esc(world.state.name)}</strong><span>${esc(discoveryCount)}</span><small aria-hidden="true">${Object.entries(M.PLANETS).map(([id,planet])=>known.has(id as M.PlanetId)?planet.icon:'❔').join(' ')}</small>`)){$('#discovery-progress').setAttribute('aria-label',`${world.state.name} · ${discoveryCount} · ${t('Discovery log')}`);}
  $('#world').dataset.status=JSON.stringify({position:[+world.position.x.toFixed(2),+world.position.z.toFixed(2)],route:world.route.length,next:world.route[0]?[world.route[0].x,world.route[0].z]:null,visibility:document.visibilityState,modal,started,frameMs:Math.round(frameTime),drawCalls:world.renderer.info.render.calls});
  setText($('#player-name'),state.name);setText($('#level-text'),t(`Lv ${state.level}`));setText($('#energy'),t(state.energy.toLocaleString()));
  setWidth($('#hp-fill'),`${state.hp/M.maxHp(state)*100}%`);setText($('#hp-text'),t(`${Math.ceil(state.hp)} / ${M.maxHp(state)}`));setWidth($('#xp-fill'),`${state.xp/M.xpNeeded(state.level)*100}%`);
  updateQuickEat();
  setText($('#xp-text'),`EXP ${Math.floor(state.xp)} / ${M.xpNeeded(state.level)}`);
  $('.experience').setAttribute('title',t(`${Math.floor(state.xp)} / ${M.xpNeeded(state.level)} experience`));
  const q=progressEntries(state,'story')[0],progress=q?.progress??0;
  setText($('#quest-chapter'),t(state.quest<M.QUESTS.length?`${state.quest+1} / ${M.QUESTS.length}`:'ONGOING'));setText($('#quest-icon'),t(q?.icon??'🚀'));setText($('#quest-title'),t(q?.title??'A world of possibilities'));setText($('#quest-task'),t(q?`${q.description} · ${progress} / ${q.target}`:'Your next chapter awaits.'));setText($('#quest-count'),t(q?`${progress}/${q.target}`:''));
  setWidth($('#quest-fill'),`${q?progress/q.target*100:100}%`);$('#quick-claim').hidden=!q?.complete;$('#quest-dot').hidden=!q?.complete;
  const skills=skillList(),bindings=keyboardBindings(state.settings.keyboardLayout);
  setText($('#movement-hint'),t(bindings.movement));
  $('.top-actions [data-action="quests"]').setAttribute('title',t('Journal · {key}',{key:bindings.journal.toUpperCase()}));
  document.querySelectorAll<HTMLButtonElement>('.skill').forEach((button,i)=>{const skill=skills[i],key=bindings.skills[i].toUpperCase();setText(button.querySelector('kbd')!,key);setText(button.querySelector('span')!,t(skill.icon));setText(button.querySelector('small')!,t(skill.name));button.setAttribute('aria-label',t(`${key} ${t(skill.name)}`));const tip=currentSkillTip(i);if(button.title!==tip)button.title=tip;if(readyWas[i]>0&&cooldowns[i]<=0){button.classList.remove('ready-pop');void button.offsetWidth;button.classList.add('ready-pop');tone('ready');}readyWas[i]=cooldowns[i];button.classList.toggle('on-cooldown',cooldowns[i]>0);setText(button.querySelector('.cooldown')!,t(cooldowns[i]>0?Math.ceil(cooldowns[i]).toString():''));skillPip(button,state.gear.disguise?0:M.skillLevel(state,i));const cd=`${cooldowns[i]/skillDurations[i]*100}%`;if(button.style.getPropertyValue('--cooldown')!==cd)button.style.setProperty('--cooldown',cd);});
  setHtml($('#buff-bar'),localizeHtml(M.activeBuffs(state).map(b=>`<span title="${esc(b.description)}">${b.icon} ${esc(b.name)} <b>${Math.ceil(b.remaining)}s</b></span>`).join('')+Object.entries(combat.statuses).filter(([,t])=>t>0).map(([name,left])=>{const chip=BUFF_CHIPS[name];return `<span class="skill-buff">${chip?.icon??'✨'} ${esc(t(chip?.name??name))} <b>${Math.ceil(left)}s</b></span>`;}).join('')+homeChip(world.homeRecovering&&!visiting,t('Home: fast recovery'))));
  setHtml($('#environment-bar'),localizeHtml(world.environmentStatus().map(e=>`<span>${e.icon??''} ${esc(e.label)} <b>${esc(String(e.value))}</b></span>`).join('')));
  const dark=$('#darkness');dark.hidden=!world.darknessActive()||!started;
  // Target frame and boss bar (hud-combat.ts). While a fight is near (or on a phone in the wild) the trackers fold into one chip.
  const hud=app,shown=combatHud.panels(world.enemies,world.selected,world.position.x,world.position.z,started);hud.classList.toggle('boss-on',shown.boss);hud.classList.toggle('target-on',shown.target);
  const fight=fightNear(world.enemies,world.position.x,world.position.z);if(fight&&!wasFight&&trackerMode==='open')trackerMode='auto';wasFight=fight;
  const folded=trackerMode==='fold'||trackerMode==='auto'&&(fight||shown.boss||innerWidth<600&&(state.planet!=='home'||world.lastZone!=='Clover Village'));
  $('.tracker-stack').classList.toggle('folded',folded);$('#tracker-chip').hidden=!folded;
  const bounty=progressEntries(state,'bounties')[0];$('#bounty-tracker').hidden=!bounty;if(bounty){$('#bounty-title').textContent=t(bounty.title);$('#bounty-task').textContent=t(`${bounty.progress}/${bounty.target} · ${bounty.claimed?'Complete':bounty.description}`);$('#bounty-count').textContent=t(bounty.claimed?'✓':`${bounty.progress}/${bounty.target}`);}
  const chal=challenges.view();renderChallenge($('#challenge-tracker'),chal);setText($('#chip-chal'),chal?chal.chip:'');keysGuide.render(state.settings.keyboardLayout,getLanguage());
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
interface LabelAnchor {e:Entity;wy:number;back:number;dx:number;centre:boolean;w:number;h:number;covered:boolean;off:boolean;tf?:string}
const labelAnchors=new Map<string,LabelAnchor>();
let hudPanels:{left:number;right:number;top:number;bottom:number}[]=[];
let hudFresh=false;
function measureHud(){hudPanels=[];document.querySelectorAll('#hud .player-card,#hud .top-actions,#hud .tracker-stack,#keys-guide,#hud .minimap,#boss-bar,#target-frame,#hud .skills,#hud .home-button,#context-prompt,#touch-controls,#movement-joystick').forEach(node=>{const r=node.getBoundingClientRect();if(r.width&&r.height)hudPanels.push(r);});}
/** The label's screen box at its anchor: bottom centre for buildings, centre for the small crop marks. */
function labelRect(a:LabelAnchor){const p=world.screen(a.e.x+a.dx,a.wy,a.e.z-a.back),top=p.y-(a.centre?a.h/2:a.h);return {x:p.x,y:p.y,front:p.front,left:p.x-a.w/2,right:p.x+a.w/2,top,bottom:top+a.h};}
const smallLabels=()=>innerWidth<=600||innerHeight<=520;
const boxesMeet=(a:{left:number;right:number;top:number;bottom:number},b:{left:number;right:number;top:number;bottom:number})=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
/** True when a box touches none of the HUD panels (measureHud). */
const clearOfHud=(r:{left:number;right:number;top:number;bottom:number},panels:typeof hudPanels)=>!panels.some(p=>boxesMeet(p,r));
function updateLabels() {
  if(!started)return;
  if(hudFresh)hudFresh=false;else measureHud();const near=world.nearest(),candidates:{a:LabelAnchor;rank:number;distance:number}[]=[],active=new Set<string>();
  for(const e of world.entities){
    const distance=Math.hypot(e.x-world.position.x,e.z-world.position.z);
    let text=t(e.name),icon=e.icon,y:number,back=0,dx=0,centre=e.kind==='plot',className='world-label',rank=2,reach=world.selected===e?30:11,aria='',spot:ReturnType<typeof house.house.labelAt>;
    if(e.kind==='plot'){
      // Compact crop labels (reference 29/09, RG-05): a ready badge or a 22x5 growth bar on the bed's front edge, nothing on
      // empty beds (the context button says "Plant a seed"); the seconds left are only in the bed panel.
      const plot=world.state.plots[e.index!];if(!plot?.crop)continue;const progress=M.cropProgress(plot);y=.12;back=-.88*M.BED_SCALE;reach=22;text='';
      if(progress>=1){({y,back}=cropBadgeAnchor(plot.crop,M.CROP_SCALE));icon='👆';className+=' plot-label ready';rank=1;aria=`${t(M.CROPS[plot.crop].name)} ready to harvest in garden bed ${e.index!+1}`;}
      else{icon=`<b style="width:${Math.round(progress*100)}%"></b>`;className+=' plot-label growing';rank=3;aria=`${t(M.CROPS[plot.crop].name)} growing in garden bed ${e.index!+1}, ${Math.ceil((1-progress)*M.cropDuration(plot)/1000)} seconds left`;}
    }else if(e.kind==='fish'&&e.pond){
      if(fishGame&&fishPond===e)continue;y=.35;back=e.pond.rz*1.02;
    }else if(e.kind==='enemy')continue; // Creature HP bars take their own path (hud-combat.ts), which never drops a bar.
    // Indoors each label sits low on the middle of the thing it names, which is also its tap box (house-hotspots.ts); phones show nearer ones only.
    else if(world.interior&&(spot=house.house.labelAt(e))){y=spot.y;back=e.z-spot.z;dx=spot.x-e.x;centre=true;reach=smallLabels()?6:30;if(house.hovered()===e)className+=' hover';}
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
    if(!a){a={e,wy:y,back,dx,centre,w:0,h:0,covered:false,off:false};labelAnchors.set(e.id,a);}
    a.e=e;a.wy=y;a.back=back;a.dx=dx;a.centre=centre;if(!a.w){a.w=label.offsetWidth;a.h=label.offsetHeight;}
    active.add(e.id);candidates.push({a,rank,distance});
  }
  for(const[id,node]of labelNodes)if(!active.has(id)){node.remove();labelNodes.delete(id);labelAnchors.delete(id);}
  // Nearest and most important labels win; a label that would cover one of them fades out (it is never moved).
  candidates.sort((p,q)=>p.rank-q.rank||p.distance-q.distance);
  const placed:ReturnType<typeof labelRect>[]=[],cap=world.interior&&smallLabels()?5:Infinity; // a phone indoors shows the five nearest things at most
  for(const c of candidates){const r=labelRect(c.a);c.a.covered=placed.length>=cap||placed.some(o=>boxesMeet(o,r));if(!c.a.covered&&labelShows(r))placed.push(r);}
  positionLabels();
}
/** On screen in full and clear of the HUD panels. */
const labelShows=(r:ReturnType<typeof labelRect>)=>r.front&&r.left>=2&&r.right<=innerWidth-2&&r.top>=2&&r.bottom<=innerHeight-2&&!hudPanels.some(p=>boxesMeet(p,r));

/** Re-project the labels after each render so they move in step with the camera instead of trailing it. */
function positionLabels(){
  const discovery=$('#discovery-progress'),point=world.screen(2.6,2.7,14.5);
  const hide=!started||world.planet!=='home'||Math.hypot(world.position.x-2.6,world.position.z-14.5)>16||!point.front||!!modal||!!world.interior; // indoors the well is out of sight
  if(discovery.hidden!==hide)discovery.hidden=hide; // writes only on change: each one dirties style for the whole HUD
  // Its rect comes from the left/top it is given plus the cached size (translateX(-50%) centres it): no layout read per frame.
  let pill={left:0,right:0,top:0,bottom:0};
  if(!discoveryObserver){discoveryObserver=new ResizeObserver(([e])=>{const b=e.borderBoxSize?.[0];discoverySize.w=b?b.inlineSize:(e.target as HTMLElement).offsetWidth;discoverySize.h=b?b.blockSize:(e.target as HTMLElement).offsetHeight;});discoveryObserver.observe(discovery,{box:'border-box'});}
  if(!discovery.hidden&&discoverySize.w){const width=discoverySize.w,left=Math.max(width/2+8,Math.min(innerWidth-width/2-8,point.x)),top=Math.max(90,Math.min(innerHeight-discoverySize.h-8,point.y));pill={left:left-width/2,right:left+width/2,top,bottom:top+discoverySize.h};const l=left.toFixed(1)+'px',tp=top.toFixed(1)+'px';if(discovery.style.left!==l){discovery.style.left=l;discovery.style.bottom='auto';}if(discovery.style.top!==tp)discovery.style.top=tp;}
  // Never over the fight buttons, the stick or any other HUD panel (phones): hide it while they meet.
  const vis=!discovery.hidden&&discoverySize.w>0&&clearOfHud(pill,hudPanels)?'':'hidden';if(discovery.style.visibility!==vis)discovery.style.visibility=vis;
  combatHud.frame(world.enemies,world.selected,world.position.x,world.position.z,!started||!!modal||!!world.interior);
  if(!started||modal)return;
  for(const [id,a] of labelAnchors){
    const node=labelNodes.get(id);if(!node)continue;const r=labelRect(a),off=a.covered||!labelShows(r);
    const tf=`translate(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px) translate(-50%,${a.centre?'-50%':'-100%'})`;if(!off&&a.tf!==tf){a.tf=tf;node.style.transform=tf;} // a hidden label stays put: no style work for it
    if(off!==a.off){a.off=off;node.toggleAttribute('data-off',off);}
  }
}
/** The explorer is in the wilds or off home: the workers' harvest goes to the house chest (delivery.ts). */
function explorerOut(){return explorerAway(world.planet,world.position.x,world.position.z);}
/** Helpers only work at home while the explorer is on this planet: the catch-up right after a trip (another planet or a visit) is work done while away, so it goes to the chest too. */
let tripBackUntil=0,tripSeen=false;
function catchUpAway(){return explorerOut()||Date.now()<tripBackUntil;}
/** perform() for the workers' jobs: tells the rules whether the explorer is out (the server uses its own pose). */
function workPerform<T=any>(type:string,payload:Record<string,unknown>={}){return perform<T>(type,CATCH_UP_ACTIONS.has(type)?{...payload,away:catchUpAway()}:WORK_ACTIONS.has(type)?{...payload,away:explorerOut()}:payload,{quiet:true});} // the helpers act by themselves: a refused job is logged, never toasted
/** A save from before the 24-bed cap lost its extra beds (model.ts trimGarden): say once what came back. */
function showTrimNote(){const n=state.gardenTrim;if(!n)return;void perform('ackTrim');setTimeout(()=>toast(t('Your garden now holds {max} beds: {beds} extra beds were refunded for ϟ {energy}.',{max:M.MAX_PLOTS,beds:n.beds,energy:n.energy})+(Object.keys(n.items).length?' '+t('Their crops are in your bag.'):''),'🌱'),1800);}
/** Harvest orbs fly to the bag, or into the chest when the harvest is stored there (never across the map). */
/** Whether a gain effect shows now: the workers' only outdoors in the home village, the explorer's own always (work-effects.ts). */
function gainShows(source:GainSource){return showsGain(source,{planet:world.planet,indoors:!!world.interior,away:explorerOut()});}
/** Where collected orbs fly: to whoever collected them. A helper's find goes to the helper (it carries it home), never across the yard to the explorer. */
function orbTarget(by?:{x:number;z:number}){if(by){const at=world.position.clone().set(by.x,.9,by.z);return ()=>at;}if(!explorerOut())return ()=>world.position;const c=world.entities.find(x=>x.kind==='chest'),at=world.position.clone().set(c?.x??0,0,c?.z??0);return ()=>at;}
/** Sparkles, the XP number and a few orbs flying into the bag when a crop comes up. */
function harvestBurst(index:number,crop:M.CropId,source:GainSource='own',by?:{x:number;z:number}){
  if(!gainShows(source))return;const e=world.entities.find(x=>x.kind==='plot'&&x.index===index);if(!e)return;
  world.fx?.burst({x:e.x,z:e.z},{n:10,color:['#9be36f','#ffe66d','#ffffff'],glow:true,speed:3,up:5,y:.4});
  world.fx?.orbs({x:e.x,z:e.z},2,'#9be36f',orbTarget(source==='worker'?by:undefined));
  floating('+'+M.CROPS[crop].xp+' XP',e.x,e.z,'xp');tone('harvest');
}
function plantBurst(index:number,source:GainSource='own'){if(!gainShows(source))return;const e=world.entities.find(x=>x.kind==='plot'&&x.index===index);if(e)world.fx?.burst({x:e.x,z:e.z},{n:6,color:['#8a5a3a','#6a3f2a'],size:.1,speed:2,up:3,y:.25});}
/** Ripe tap: harvest every ripe bed in the garden (the user's rule; the reference stops at 5 m), nearest first, 140 ms apart, then one summary toast. */
async function harvestNearby(index:number){
  // Hold the beds themselves: storing a bed meanwhile shifts the indices.
  const harvestingState=state,beds=M.ripeNearby(state,index).map(i=>({...M.bedPosition(state,i),generation:state.plots[i].generation,crop:state.plots[i].crop,plantedAt:state.plots[i].plantedAt}));let gathered=0,last:M.CropId|null=null;
  beds.forEach((bed,n)=>{const run=async()=>{
    if(state!==harvestingState||visiting||world.planet!=='home')return;
    const i=state.plots.findIndex((plot,i)=>{const p=M.bedPosition(state,i);return p.x===bed.x&&p.z===bed.z&&plot.crop===bed.crop&&plot.generation===bed.generation&&plot.plantedAt===bed.plantedAt;}),crop=i<0?null:await perform<M.CropId>('harvest',{index:i});
    if(state!==harvestingState||visiting||world.planet!=='home')return;
    if(crop){gathered++;last=crop;harvestBurst(i,crop);world.syncCrops();}
    if(n===beds.length-1&&last)toast(gathered>1?`Harvested ${gathered} crops from the garden.`:`${t(M.CROPS[last].name)} harvested.`,M.CROPS[last].icon);
  };if(n)setTimeout(run,n*140);else run();});
}
// A fruit tree takes 8 to 14 hours: hours and minutes read better than 28,799 seconds.
function growText(plot:M.Plot){const progress=M.cropProgress(plot),left=Math.ceil((1-progress)*M.cropDuration(plot)/1000);return progress>=1?'Ripe! Close this panel and tap the bed to harvest.':left>=3600?`About ${Math.floor(left/3600)} h ${Math.floor(left%3600/60)} min until ripe`:`About ${left} seconds until ripe`;}
/**
 * The garden's grow button (reference openSeeds/openPlot): place a kit already in the bag, else buy one with energy
 * (grey while it is out of reach), or a note at the cap. Only at home, never while visiting.
 */
function expandButton(growing:boolean){
  if(visiting||state.planet!=='home')return '';
  const kits=state.bag.plot_kit||0,cost=M.gardenExpansionCost(state);
  if(state.plots.length>=M.MAX_PLOTS)return `<p class="muted wide grow-button grow-max">🌱 Your garden has the maximum ${M.MAX_PLOTS} beds</p>`; // a note, not a button: nothing to press at the cap
  const label=growing?`➕ Expand garden: add 1 bed (${kits?'one in your bag':`ϟ ${cost}`})`:kits?`➕ Place another bed (${kits} in your bag)`:`➕ Expand garden: add 1 bed (ϟ ${cost})`;
  return `<button class="${kits||state.energy>=cost?'primary':'soft-button'} wide grow-button" data-action="expand">${label}</button>`;
}
/**
 * Reference buyPlot: pay for a garden bed kit if none is in the bag. The bed then goes down by itself on the free spot
 * nearest the garden, or, with "Place new beds myself" on, the see-through bed lets the player choose the spot.
 */
async function buyPlot(){
  // The same order as the rule (model.ts readyPlotKit), checked first so a grey button explains itself instead of asking the rules.
  if(state.plots.length>=M.MAX_PLOTS){toast(t('Your garden already has the maximum {count} beds.',{count:M.MAX_PLOTS}),'🌱');return;}
  if(state.planet!=='home'||visiting){toast('Garden beds belong at home. Return to your garden first.','🏡');return;}
  if(!(state.bag.plot_kit||0)&&state.energy<M.gardenExpansionCost(state)){toast(t('You need {amount} energy to expand the garden.',{amount:M.gardenExpansionCost(state)}),'ϟ');return;}
  const result=await perform('buyBedKit');if(!result)return;
  if(result==='bought')tone('coin');beginPlacement('plot_kit');
}
/** Puts a bed kit from the bag down automatically (expandGarden picks the spot); the kit stays in the bag if there is no room. */
async function autoPlaceBed(){
  if(!await perform('expandGarden')){toast('There is no free spot left for another bed. Your kit stays in your bag.','🌱');return;}
  const i=state.plots.length-1,p=M.bedPosition(state,i);closeDialog();world.syncCrops();plantBurst(i);tone('pop');
  world.fx?.burst({x:p.x,z:p.z},{n:10,color:['#9be36f','#ffe66d'],glow:true,speed:2.5,up:4,y:.3});
  toast('A new garden bed! Tap it to plant.','🌱');
}
/** The bed panel's upgrade row: level stars, the speed-up so far and the button for the next level (model.ts upgradeBed). */
function bedUpgradeRow(index:number){
  if(visiting||state.planet!=='home'||!state.plots[index])return '';
  const level=M.bedLevel(state.plots[index]),max=M.BED_MAX_LEVEL,cost=level<max?M.bedUpgradeCost(state,level):0,stars='★'.repeat(level)+'☆'.repeat(max-level);
  return `<div class="garden-actions bed-upgrade"><span><b class="bed-stars" aria-hidden="true">${stars}</b> ${esc(t('Bed level {level} of {max}',{level,max}))}${level?` · ${esc(t('−{percent}% grow time ({ratio}× harvests)',{percent:Math.round((1-1/M.bedSpeedUp(level))*100),ratio:M.bedSpeedUp(level)}))}`:''}</span>${level<max?`<button class="${state.energy>=cost?'primary':'soft-button'}" data-action="upgrade-bed" title="${esc(t('Each level halves this bed’s grow time: level 3 grows 8× faster.'))}">⬆ ${esc(t('Upgrade bed (ϟ {cost})',{cost}))}</button>`:`<span class="chip">${esc(t('Fully upgraded'))}</span>`}</div>`;
}
/** Redraws the open bed panel as the bed is now; a ripe bed is left alone (opening it harvests). */
function refreshPlot(){const p=state.plots[activePlot];if((modal==='plot'||modal==='plant')&&p&&!(p.crop&&M.cropProgress(p)>=1))plotDialog(activePlot);}
let plotSeen='',stockShown='';
function stockKey(){let k='';for(const id in state.bag)k+=id+':'+state.bag[id]+',';k+='|';for(const id in state.chest)k+=id+':'+state.chest[id]+',';return k;}
function plotDialog(index:number) {
  if(visiting){network.visitCrop?.(index);return;}
  activePlot=index;const plot=state.plots[index];if(!plot)return;
  if(plot.crop&&M.cropProgress(plot)>=1){harvestNearby(index);return;}
  if(plot.crop){
    // Reference openPlot: the crop with a big progress bar, a card per fertilizer, a tip when there is none, then expand.
    const crop=M.CROPS[plot.crop],progress=M.cropProgress(plot),fertilizer=M.isTreeCrop(plot.crop)?treeFertilizerNote():(['manure','spore'] as const).map(id=>{const n=state.bag[id]||0,item=M.ITEMS[id];
      return `<div class="crop-row garden-row fertilizer-row"><span class="crop-art">${art(id,item.icon)}</span><div><strong>${esc(t(item.name))} <span class="chip">×${n}</span></strong><p>${esc(item.desc)}</p></div><button class="primary" data-action="${id==='spore'?'fertilize':'fertilize-manure'}" ${n?'':'disabled'}>Use</button></div>`;}).join('');
    openDialog('plot','Growing bed',`<div class="crop-row garden-row bed-status"><span class="crop-art">${art(plot.crop,crop.icon)}</span><div><strong>${esc(t(crop.name))}</strong><div class="grow-meter big"><i id="grow-fill" style="width:${progress*100}%"></i></div><p class="muted" id="grow-time">${growText(plot)}</p></div></div>${fertilizer}${!M.isTreeCrop(plot.crop)&&!state.bag.manure&&!state.bag.spore?'<p class="garden-tip">💡 Defeat Grumpy Mushrooms, Wild Boars, Snapping Flowers… to collect fertilizer, or buy it at the equipment shop.</p>':''}${bedUpgradeRow(index)}${expandButton(true)}${helperRow(state,!!visiting,index)}`,'GARDEN BED '+(index+1),art(plot.crop,crop.icon));return;
  }
  const empty=state.plots.filter(p=>!p.crop).length;
  // Unlocked crops first, then locked ones by the level that opens them.
  const crops=Object.entries(M.CROPS).sort(([,a],[,b])=>Number(state.level<a.level)-Number(state.level<b.level)||a.level-b.level);
  // Reference openSeeds: the grow button first, "store this bed" on an extra bed, then the seeds. A ripe tap gathers the
  // ripe beds around it, so the old "Harvest all" button is gone from here.
  openDialog('plant','Choose a seed',`${expandButton(false)}${helperRow(state,!!visiting,index)}<div class="garden-actions">${bedUpgradeRow(index)}${M.isExtraBed(state,index)&&!M.bedLevel(state.plots[index])?'<button class="soft-button" data-action="store-bed">🎒 Store this bed</button>':''}<span>${state.plots.length} / ${M.MAX_PLOTS} beds · ${empty} empty</span></div><div class="crop-list">${crops.map(([id,c])=>{
    const level=M.cropLevel(state,id),locked=state.level<level,needsSeed=!!c.seed&&!state.bag[c.seed],item=M.ITEMS[id],effect=item?effectText(item):'';
    return `<div class="crop-row garden-row ${locked?'locked':''}"><span class="crop-art">${art(id,c.icon)}</span><div><strong>${esc(t(c.name))}</strong>${effect?`<p>${esc(effect)}</p>`:''}<div class="chips"><span class="chip chip-time">⏱ ${(ms=>ms>=3_600_000?`${+(ms/3_600_000).toFixed(1)} h`:`${ms/1000}s`)(M.bedGrowTime(state.plots[index],M.cropGrowTime(state,id)))}</span><span class="chip chip-xp">✨ ${M.cropXp(state,id)} XP</span>${item?`<span class="chip chip-energy">ϟ ${M.sellPrice(state,id)}</span>`:''}${c.seed?`<span class="chip chip-seed">${M.ITEMS[c.seed]?mini(c.seed):'🌰'} ${state.bag[c.seed]||0} seeds</span>`:''}</div></div>${locked?`<span class="chip chip-lock">🔒 Level ${level}</span>`:`<div class="button-row"><button class="primary" data-action="plant" data-item="${id}" ${needsSeed?'disabled':''}>Plant</button><button class="sky-button" data-action="plant-all" data-item="${id}" ${needsSeed||!empty?'disabled':''}>All (${c.seed?Math.min(empty,state.bag[c.seed]||0):empty})</button></div>`}</div>`;
  }).join('')}</div>`,'YOUR GARDEN');
}
function inventory() {
  const entries=Object.entries(state.bag).filter(([id,n])=>n!>0&&(bagMode!=='wardrobe'||wardrobeItem(M.ITEMS[id]))) as [M.ItemId,number][];
  const slots:[M.GearSlot,string,string][]=[['weapon','⚔️','Weapon'],['hat','👒','Hat'],['outfit','🧥','Outfit'],['boots','👟','Boots'],['pet','🐾','Pet'],['disguise','🎭','Disguise']];
  if(selectedItem&&!state.bag[selectedItem])selectedItem=null;
  const item=selectedItem?M.ITEMS[selectedItem]:null,stats=M.activeStats(state),slot=item?.slot;
  openDialog('bag','Your explorer & backpack',`<div class="stat-strip"><span>❤️ <b>${Math.ceil(state.hp)}/${Math.round(stats.maxHp)}</b></span><span>⚔️ <b>${stats.attack.toFixed(1)}</b></span><span>🛡️ <b>${stats.defense}</b></span><span>💨 <b>${stats.speed.toFixed(1)}</b></span><span>✨ <b>${Math.round(stats.critChance*100)}% crit</b></span></div><div class="equipment">${slots.map(([key,icon,name])=>`<div><button data-action="inspect" data-item="${state.gear[key]||''}" ${!state.gear[key]?'disabled':''}><span>${state.gear[key]?art(state.gear[key]!,M.ITEMS[state.gear[key]!].icon):icon}</span><small>${state.gear[key]?esc(t(M.ITEMS[state.gear[key]!].name))+M.levelTag(state,state.gear[key]!):name}</small></button>${state.gear[key]&&!autoHeld(state.gear[key]!)?`<button class="unequip" data-action="unequip" data-slot="${key}" aria-label="Unequip ${name}">Remove</button>`:''}</div>`).join('')}</div><div class="section-label">${bagMode==='wardrobe'?'TO WEAR':'BACKPACK'} <span>${entries.reduce((n,[,q])=>n+q,0)} items</span></div>${IG.groupedHtml('bag',IG.groupItems(entries,([id])=>id,IG.BAG_ORDER,undefined,id=>M.ownedScore(state,id)),([id,count])=>`<button class="item-tile ${id===selectedItem?'selected':''}" data-action="inspect" data-item="${id}" aria-label="${esc(t(M.ITEMS[id].name))}, ${count}"><span>${art(id,M.ITEMS[id].icon)}</span><b>${count}</b><small>${esc(t(M.ITEMS[id].name))}${M.levelTag(state,id)}</small>${Object.values(state.gear).includes(id)?'<i>Equipped</i>':''}</button>`,'inventory-grid')||'<div class="empty-state"><span>🎒</span><strong>Your first harvest belongs here.</strong></div>'}${item?`<div class="item-detail"><span class="item-hero">${art(selectedItem!,item.icon)}</span><div><h3>${esc(t(item.name))}${M.levelTag(state,selectedItem!)}</h3>${M.powerChip(selectedItem!,state)}${M.gearProgressHtml(state,selectedItem!)}<p>${esc(item.desc)}</p><div class="button-row">${slot&&autoHeld(selectedItem!)?'<span class="chip">Used automatically near ponds</span>':slot?`<button class="primary" data-action="equip" data-item="${selectedItem}" ${state.gear[slot]===selectedItem||M.gearLevel(selectedItem!)>state.level?'disabled':''}>${state.gear[slot]===selectedItem?'Equipped':'Equip'}</button>${M.gearLevel(selectedItem!)>state.level?`<span class="chip chip-gate">🔒 ${esc(t('Needs level {level}',{level:M.gearLevel(selectedItem!)}))}</span>`:''}`:''}${slot&&state.gear[slot]!==selectedItem?tryOnButton(selectedItem!):''}${item.heal||item.buff?`<button class="primary" data-action="eat" data-item="${selectedItem}">Use${item.heal?` · +${item.heal} HP`:''}</button>`:''}${item.weapon&&item.weapon.kind!=='rod'?`<button class="soft-button" data-action="forge-menu" data-item="${selectedItem}">🔨 Forge +${M.forgeLevel(state,selectedItem!)}</button>`:''}${M.looseQuantity(state,selectedItem!)>0?`<button class="soft-button" data-action="drop-item" data-item="${selectedItem}">Drop one</button>`:''}${item.type==='decor'||item.type==='placeable'?`<button class="primary" data-action="place-decor" data-item="${selectedItem}">Place</button>`:''}</div></div></div>`:''}${bagMode==='wardrobe'?'':'<div class="button-row"><button class="soft-button" data-action="go" data-kind="cook">🔥 Kitchen</button><button class="soft-button" data-action="decorations">🏡 Decorate</button><button class="soft-button" data-action="journal-tab" data-kind="collection">🐟 Fish log</button></div>'}`,'CHARACTER');
}
// "36 energy · 6 XP · 15 stars" becomes three coloured chips.
function rewardChips(label:string){return label.split(' · ').filter(Boolean).map(part=>{const kind=/energy|năng lượng/i.test(part)?'energy':/xp/i.test(part)?'xp':/star|sao/i.test(part)?'star':'';return `<span class="chip${kind?` chip-${kind}`:''}">${kind==='energy'?'ϟ ':kind==='xp'?'✨ ':kind==='star'?'⭐ ':''}${esc(kind?part.replace(/\s*(energy|stars?|năng lượng|sao)$/i,''):part)}</span>`;}).join('');}
// Materials as small chips: icon and have/need like the reference (the name is a tooltip and screen-reader text); red = still short.
// "Have" is what the station can use: the loose bag, plus the house chest at home (pantry.ts), which the tooltip names.
function materialChips(materials?:M.Inventory){const list=Object.entries(materials??{}) as [M.ItemId,number][];return list.length?`<span class="chips">${list.map(([id,n])=>{const have=M.pantry(state,id),chest=M.fromChest(state,id,n),name=esc(t(M.ITEMS[id].name))+(chest?' · '+esc(t('{count} from the chest',{count:chest})):'');return `<span class="chip${have<n?' chip-miss':''}" title="${name}">${mini(id)}<span class="vh">${name}</span> ${have}/${n}</span>`;}).join('')}</span>`:'';}
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
    const index=state.progression.story.index,chapter=storyStep(index).chapter,steps=STORY_STEPS.map((_,i)=>({...storyStep(i,state),i})).filter(step=>step.chapter===chapter&&index<STORY_STEPS.length);
    const list=$('#dialog-body .quest-list');if(!list||!steps.length)return;
    const done=steps.filter(step=>step.i<index).map(step=>`<div class="quest-row complete"><span>✓</span><div><strong>${esc(step.title)}</strong><small>Step ${step.i+1} · complete</small></div></div>`).join('');
    const next=steps.filter(step=>step.i>index).map(step=>`<div class="quest-row locked"><span>🔒</span><div><strong>${esc(step.title)}</strong><small>Finish the step before to unlock</small></div></div>`).join('');
    list.insertAdjacentHTML('afterbegin',localizeHtml(`<div class="chapter-banner">${esc(storyStep(index).icon??'📖')} Chapter ${chapter+1} <b>${steps.filter(step=>step.i<index).length} / ${steps.length}</b></div>${done}`));
    list.insertAdjacentHTML('beforeend',localizeHtml(next));
  }
}
const SHOP_TABS=['Weapons','Clothing','Pets','Disguises','Supplies','Decor'];
/** "Try on" for wearable gear not already worn; pressed while the explorer is wearing it as a preview. */
function tryOnButton(id:M.ItemId){return canTryOn(id)&&!Object.values(state.gear).includes(id)?`<button class="soft-button try-on" data-action="try-on" data-item="${id}" aria-pressed="${tryingOn===id}">${tryingOn===id?'👀 Trying on':'👕 Try on'}</button>`:'';}
function shop(){
  // Special offers (special-offers.ts): a tag by the name and a line on how the item is usually obtained.
  const specialTag=(id:string)=>M.isSpecial(id)?` <span class="special-tag">${esc(t('✨ Special'))}</span>`:'',gated=(id:string)=>M.gearLevel(id)>state.level,gate=(id:string)=>gated(id)?`<span class="chips"><span class="chip chip-gate">🔒 ${esc(t('Needs level {level}',{level:M.gearLevel(id)}))}</span></span>`:'',specialNote=(id:string)=>M.isSpecial(id)?`<p class="special-note">${esc(t(M.SOURCE_NOTE[M.specialSource(id)]))}</p>`:'';
  const matches=(item:M.ItemDef)=>shopTab==='Weapons'?item.slot==='weapon':shopTab==='Clothing'?['hat','outfit','boots'].includes(item.slot??''):shopTab==='Pets'?item.slot==='pet':shopTab==='Disguises'?item.slot==='disguise':shopTab==='Decor'?item.type==='decor':!item.slot&&item.type!=='decor';
  // Weakest to strongest (item-power.ts), ties by price; special offers (one flat price) tie by their usual worth.
  const entries=IG.groupItems(Object.entries(M.ITEMS).filter(([id,item])=>M.shopPrice(state,id)!==null&&matches(item)),([id])=>id,IG.GEAR_ORDER,([id])=>M.isSpecial(id)?M.ITEMS[id].sell:M.shopPrice(state,id)??0);
  openDialog('shop','Little outfitters',`<nav class="panel-tabs" aria-label="Shop categories">${SHOP_TABS.map(tab=>`<button class="${shopTab===tab?'active':''}" aria-pressed="${shopTab===tab}" data-action="shop-tab" data-kind="${tab}">${tab}</button>`).join('')}</nav>${IG.groupedHtml('shop',entries,([id,item])=>`<div class="shop-item${M.isSpecial(id)?' special-offer':''}"><span class="shop-icon">${art(id,item.icon)}</span><div><strong>${esc(t(item.name))}${specialTag(id)}${state.bag[id]?M.levelTag(state,id):''}${state.bag[id]?` <small>×${state.bag[id]}</small>`:''}</strong>${M.powerChip(id)}<p>${esc(item.desc)}</p>${specialNote(id)}${gate(id)}${materialChips(item.materials)}</div>${Tester.isTester(state)&&M.isSpecial(id)?'<div class="button-row tester-row">':''}<button class="primary" data-action="buy" data-item="${id}" ${state.energy<M.shopPrice(state,id)!||!M.hasMaterials(state,item.materials)||gated(id)?'disabled':''}>ϟ ${M.shopPrice(state,id)!.toLocaleString()}</button>${Tester.isTester(state)&&M.isSpecial(id)?Tester.testerBuyButton(state,id)+'</div>':''}${item.weapon?.kind==='rod'&&state.bag[id]?'<span class="chip">Used automatically near ponds</span>':item.slot?Object.values(state.gear).includes(id)?'<span class="chip chip-seed">✓ Equipped</span>':state.bag[id]?`<button class="sky-button" data-action="equip" data-item="${id}" ${gated(id)?'disabled':''}>Equip</button>`:'':''}${tryOnButton(id)}</div>`)||'<p class="empty-state">Visit the workshop for this collection.</p>'}`,'ϟ '+state.energy+' ENERGY');
  if(shopTab==='Pets'&&state.planet==='home'&&!visiting)$('#dialog-body').insertAdjacentHTML('beforeend',localizeHtml('<div class="button-row"><button class="soft-button" data-action="pen-menu">🐔 Animal pen</button></div>'));
}

// The market, like the reference's (bundle @939401): one big button sells every crop, fish and junk stack; rows sell 1 or all.
function market(){const sellable=(Object.keys(state.bag) as M.ItemId[]).map(id=>[id,M.looseQuantity(state,id)] as [M.ItemId,number]).filter(([id,n])=>M.ITEMS[id].sell>0&&n>0),produce=produceLots(state);openDialog('sell','From your garden, with love',`<div class="owl-note"><span>🧺</span><p><strong>Harvest market</strong>Trade treasures for energy. Keep a snack for the trail!</p></div>${produce.total?`<button class="primary sell-produce" data-action="sell-produce">Sell all produce &amp; fish → ϟ ${produce.total}${produce.fromChest?`<small class="from-chest">${esc(t('{count} from the chest',{count:produce.fromChest}))}</small>`:''}</button>${cookSellHtml(cookSellPlan(state),esc)}`:''}${IG.groupedHtml('sell',IG.groupItems(sellable,([id])=>id,IG.BAG_ORDER),([id,n])=>`<div class="shop-item"><span class="shop-icon">${art(id,M.ITEMS[id].icon)}</span><div><strong>${esc(t(M.ITEMS[id].name))} <small>×${n}</small></strong><div class="chips"><span class="chip chip-energy">ϟ ${M.sellPrice(state,id)} each</span></div></div><div class="button-row"><button class="soft-button" data-action="sell-one" data-item="${id}">Sell 1</button>${n>1?`<button class="primary" data-action="sell-all" data-item="${id}" aria-label="Sell all for ${n*M.sellPrice(state,id)} energy">All · ϟ ${n*M.sellPrice(state,id)}</button>`:''}</div></div>`)||'<div class="empty-state"><span>🌾</span><strong>Something good is growing</strong><p>Bring crops, fish, or materials to sell here.</p><button class="primary" data-action="go" data-kind="plot">Visit the garden →</button></div>'}`,'ϟ '+state.energy+' ENERGY');}
// The chest as two grids of big item tiles, like the reference: tap a tile to move that stack across.
function storage(){const tiles=(inv:M.Inventory,toChest:boolean)=>IG.groupedHtml(toChest?'chest-bag':'chest',IG.groupItems((Object.entries(inv)as[M.ItemId,number][]).filter(([,n])=>n>0),([id])=>id,IG.BAG_ORDER),([id,n])=>{const name=esc(t(M.ITEMS[id].name)),locked=toChest&&M.looseQuantity(state,id)===0;return `<button class="chest-slot" data-action="transfer" data-item="${id}" data-direction="${toChest?'store':'take'}" ${locked?'disabled':''} title="${name}" aria-label="${toChest?'Store':'Take'} ${name}, ${n}${locked?' (equipped)':''}"><span>${art(id,M.ITEMS[id].icon)}</span>${n>1?`<b>${n}</b>`:''}</button>`;},'chest-grid');openDialog('chest','Keep your treasures safe',`<p class="intro">Tap an item to move it between your backpack and the chest. Chest items stay safe if you get knocked out.</p><div class="storage-columns"><div><h3>🎒 Backpack</h3>${tiles(state.bag,true)?tiles(state.bag,true):'<p class="muted">Nothing here yet.</p>'}</div><div><h3>📦 Chest</h3>${tiles(state.chest,false)?`<button class="soft-button take-all" data-action="take-all">Take all</button>${tiles(state.chest,false)}`:'<p class="muted">Room for something special.</p>'}</div></div>`,'YOUR STORAGE CHEST');}
// The wishing crystal, like the reference's openUpgrade: energy on top, one compact card per stat with level, current value and gain.
/** The crystal answers a wish: a ring and sparks at the crystal and "<icon> <name> ↑" over the explorer, as in the reference. */
function upgradeFeedback(kind:keyof typeof M.UPGRADES){const crystal=world.entities.find(e=>e.kind==='upgrade'),def=M.UPGRADES[kind];if(crystal){world.fx?.ring({x:crystal.x,z:crystal.z},{color:'#8ef6ff',to:3,life:.6});world.fx?.burst({x:crystal.x,z:crystal.z},{n:20,color:['#8ef6ff','#d68cff','#ffffff'],glow:true,speed:4,up:8,y:1.6});}floating(`${def.icon} ${t(def.name)} ↑`,world.position.x,world.position.z,'lvl');}
/** The on-screen movement pad shows only when chosen in Settings (the reference is tap-to-move only). */
const mobileJoystickDefault=matchMedia('(pointer: coarse)').matches;
function joystickEnabled(){return state.settings.movePad??mobileJoystickDefault;}
function applyMovePad(){$('#hud').classList.remove('move-pad');joystick.setEnabled(joystickEnabled());$('#hud').classList.toggle('joystick-right',state.settings.joystickSide==='right');movement.clear();measureHud();}
function upgrades(){openDialog('upgrade','A wish for something more',`<div class="en-head">Energy: <b>ϟ ${state.energy.toLocaleString()}</b></div><div class="upgrade-cards">${upgradeCards(state).map(c=>`<div class="upgrade-card"><span class="upgrade-icon">${c.icon}</span><div><strong>${t(c.name)} <small>Level ${c.level}</small></strong><p>Now: ${c.now} • ${c.gain}</p></div><button class="primary" data-action="upgrade" data-kind="${c.kind}" ${c.affordable?'':'disabled'}>${c.max?'MAX':`ϟ ${c.cost}`}</button></div>`).join('')}</div>`,'THE WISHING CRYSTAL');}
function cooking(){if(!M.kitchenOpen(state)&&!Tester.isTester(state)){openDialog('cook','A warm meal for the trail',`<p class="intro">🔒 ${esc(t('Unlocks at level {level}',{level:M.KITCHEN_LEVEL}))}</p>`,'VOLCANO KITCHEN');return;}const ingredients=M.pantryIds(state).filter(id=>M.ITEMS['cooked_'+id]).map(id=>[id,M.pantry(state,id)] as const);const cookTotal=ingredients.reduce((a,[,n])=>a+n,0);openDialog('cook','A warm meal for the trail',`<p class="intro">Cooked food heals more and lasts longer. Cooking here is free.</p>${cookTotal?`<button class="primary sell-produce cook-everything" data-action="cook-everything">${esc(t('Cook all → {count} meals',{count:cookTotal}))}</button>`:''}<div class="shop-grid">${ingredients.map(([id,n])=>`<div class="shop-item"><span class="shop-icon">${art(id,M.ITEMS[id].icon)}</span><div><strong>${esc(t(M.ITEMS[id].name))} <small>×${n}</small></strong><p>${esc(M.ITEMS['cooked_'+id].desc)}</p><span class="chips"><span class="chip cook-result">→ ${mini('cooked_'+id)} ${esc(t(M.ITEMS['cooked_'+id].name))}</span></span></div><div class="button-row"><button class="soft-button" data-action="cook-one" data-item="${id}">Cook 1</button><button class="primary" data-action="cook-all" data-item="${id}" aria-label="Cook all">All</button></div></div>`).join('')||'<p class="empty-state">Bring crops, fish, or meat from your adventures.</p>'}</div>${dishesHtml(state,farmUi)}${Tester.testerKitchenHtml(state,art)}`,'VOLCANO KITCHEN');}
/**
 * The animal pen collects all ready stock, nearest first and 140 ms apart; tapping an animal collects only its stock.
 * With nothing waiting, either interaction opens the pen panel.
 */
const farmUi:FarmUi={art,esc,mini,chips:materialChips,effect:effectText};let penShown='';
function penDialog(){if(visiting)return;penShown=penSignature(state);const built=M.penBuilt(state);openDialog('pen',built?'Your animal pen':'A spot for an animal pen',penHtml(state,farmUi),built?'ANIMAL PEN':'PEN SITE',built?'🐔':'🪧');}
/** Asks before feeding a crop that sells for more than the time it saves (farm.ts feedLoses); "Feed anyway" re-sends the button. */
function feedConfirm(crop:string,action:string,id?:string){const item=M.ITEMS[crop];openDialog('feed-confirm','Feed this crop?',`<p class="intro">${esc(t('{crop} sells for ϟ {sell} at the market, more than feeding it saves. Feed it anyway?',{crop:t(item.name),sell:M.sellPrice(state,crop)}))}</p><div class="button-row"><button class="soft-button" data-action="pen-menu">${esc(t('Keep it'))}</button><button class="primary" data-action="${action}" ${id?`data-id="${esc(id)}"`:''} data-sure="1">${esc(t('Feed anyway'))}</button></div>`,'ANIMAL PEN',item.icon);}
/** Buys the pen: the yard and coop pop up on the plot with a burst, then the panel offers animals. */
async function buildPenAction(){
  const check=M.canBuildPen(state);
  if(check==='energy'){toast(`You need ${M.PEN_BUILD.price} energy to build the pen.`,'ϟ');return;}
  if(!await perform('buildPen'))return;
  world.showPenBuilt();tone('success');world.fx?.burst({x:M.PEN.x,z:M.PEN.z},{n:22,color:['#ffe66d','#f2cf5b','#ffffff','#ff9ec4'],glow:true,speed:3.2,up:5,y:.5});
  // Close the panel so the yard is seen popping up, then offer the animals.
  closeDialog();toast('The animal pen is built! Buy a chick to get started.','🐔');setTimeout(()=>{if(!modal)penDialog();},1100);
}
function penTap(){if(M.readyAnimals(state).length)collectFarm();else penDialog();}
function feedBurst(uid:number,source:GainSource='own'){if(!gainShows(source))return;const p=world.farmView?.positionOf(uid);if(p)world.fx?.burst({x:p.x,z:p.z},{n:6,color:['#9be36f','#ffe66d'],size:.08,speed:1.5,up:3,y:.4});}
function farmCollectFeedback(collected:readonly M.Collected[],origin?:{x:number;z:number},source:GainSource='own',by?:{x:number;z:number}){
  if(!gainShows(source))return; // the products are already in the bag or chest: only the flight, orbs and floats are skipped
  const groups=new Map<number,M.Collected[]>();for(const product of collected){const list=groups.get(product.uid)??[];list.push(product);groups.set(product.uid,list);world.farmView?.collect(product.uid,product.item,origin??world.farmView?.positionOf(product.uid)??M.PEN);}
  for(const [uid,list]of groups){const p=world.farmView?.positionOf(uid)??origin??M.PEN;world.fx?.burst({x:p.x,z:p.z},{n:8,color:['#fff7c2','#ffe66d','#ffffff'],glow:true,speed:3,up:5,y:.6});world.fx?.orbs({x:p.x,z:p.z},2,'#ffe66d',orbTarget(source==='worker'?by:undefined));floating('+'+M.ANIMALS[list[0].kind].xp*list.length+' XP',p.x,p.z,'xp');}
  if(collected.length)tone('harvest');
}
function collectFarm(uid?:number){
  if(visiting||world.planet!=='home')return;
  const collectingState=state;
  const me=world.position,order=M.readyAnimals(state).filter(a=>uid===undefined||a.uid===uid).map(a=>({a,p:world.farmView?.positionOf(a.uid)??{x:M.PEN.x,z:M.PEN.z}})).sort((x,y)=>Math.hypot(x.p.x-me.x,x.p.z-me.z)-Math.hypot(y.p.x-me.x,y.p.z-me.z));
  const got:M.Collected[]=[];if(modal==='pen')closeDialog();
  order.forEach(({a,p:origin},n)=>{const run=async()=>{
    if(state!==collectingState||visiting||world.planet!=='home')return;
    const collected=await perform<M.Collected[]>('collectProducts',{uids:[a.uid]});if(state!==collectingState||visiting||world.planet!=='home')return;const c=collected?.[0];
    if(c){got.push(...collected!);farmCollectFeedback(collected!,origin);}
    if(n===order.length-1&&got.length)toast(collectText(got),M.ITEMS[got[0].item].icon);
  };if(n)setTimeout(run,n*140);else run();});
}
async function buyAnimal(kind:M.AnimalKind){
  const check=M.canBuyAnimal(state,kind),d=M.ANIMALS[kind];
  if(check==='energy'){toast(`You need ${M.priceOf(state,kind)} energy for a ${d.baby.toLowerCase()}.`,'ϟ');return;}
  const a=await perform('buyAnimal',{kind});if(!a)return;
  tone('coin');toast(`A little ${d.baby.toLowerCase()} joined your pen!`,d.babyIcon);penDialog();
  setTimeout(()=>{const p=world.farmView?.positionOf(a.uid);if(p)world.fx?.burst({x:p.x,z:p.z},{n:12,color:['#ffd6e8','#ffe66d','#ffffff'],glow:true,speed:2.5,up:4,y:.3});},50);
}
function crafting(){
  const recipes=M.RECIPES.map((recipe,index)=>({...recipe,index})).filter(r=>r.station===craftStation),categories=['All',...new Set(recipes.map(r=>r.category))];
  if(!categories.includes(craftTab))craftTab='All';
  openDialog('craft',craftStation==='forge'?'The ember forge':'Made with a little magic',`<div class="button-row"><button class="soft-button" data-action="forge-menu">🔨 Strengthen weapons</button>${Tester.isTester(state)?Tester.TESTER_TAG:''}</div><nav class="panel-tabs" aria-label="Workshop categories">${categories.map(category=>`<button class="${craftTab===category?'active':''}" data-action="craft-tab" data-kind="${esc(category)}">${esc(category)}</button>`).join('')}</nav>${IG.groupedHtml('craft',IG.groupItems(recipes.filter(r=>craftTab==='All'||r.category===craftTab),r=>r.result,IG.GEAR_ORDER,r=>r.energy),r=>`<div class="shop-item"><span class="shop-icon">${art(r.result,M.ITEMS[r.result].icon)}</span><div><strong>${esc(t(M.ITEMS[r.result].name))}${r.count&&r.count>1?` ×${r.count}`:''}</strong>${M.powerChip(r.result)}<p>${esc(M.ITEMS[r.result].desc)}</p>${materialChips(r.materials)}</div>${Tester.isTester(state)?'<div class="button-row tester-row">':''}<button class="primary" data-action="craft" data-index="${r.index}" aria-label="Craft for ${r.energy} energy" ${!M.canCraft(state,r.index)?'disabled':''}><span class="wide-label">Craft </span>ϟ ${r.energy}</button>${Tester.testerMakeButton(state,'tester-craft',r.index,r.energy)}${Tester.isTester(state)?'</div>':''}</div>`)||'<p class="empty-state">Collect materials on your travels, then return.</p>'}`,craftStation==='forge'?'LAVA FURNACE':'WORKSHOP');
}
function forgeMenu(id?:string){
  const weapons=Object.entries(state.bag).filter(([key,n])=>n!>0&&M.ITEMS[key]?.slot==='weapon'&&M.ITEMS[key]?.weapon?.kind!=='rod');
  if(id)selectedItem=id;
  openDialog('forge','Strengthen your weapon',`<div class="button-row"><button class="soft-button" data-action="craft-back">← ${esc(t(craftStation==='forge'?'Back to the furnace':'Back to the workshop'))}</button></div><p class="intro">Each attempt has a 30% chance to add one forge level, up to +15. Each level adds 1% attack. Failed attempts consume materials and energy, but never lower your weapon level.</p><div class="shop-grid">${weapons.map(([key])=>{const level=M.forgeLevel(state,key),cost=M.forgeCost(level);return `<div class="shop-item"><span class="shop-icon">${art(key,M.ITEMS[key].icon)}</span><div><strong>${esc(t(M.ITEMS[key].name))} +${level}</strong><p>${t('Attack bonus: {count}%',{count:level})}</p>${level<15?materialChips(cost.materials):'<p>Maximum forge level</p>'}</div>${Tester.isTester(state)?'<div class="button-row tester-row">':''}<button class="primary" data-action="forge" data-item="${key}" ${M.canForge(state,key)?'':'disabled'}>${level<15?'ϟ '+cost.energy:t('Maximum')}</button>${level<15?Tester.testerMakeButton(state,'tester-forge',key):''}${Tester.isTester(state)?'</div>':''}</div>`;}).join('')||'<p class="empty-state">Get a weapon first, then bring it here to forge.</p>'}</div>`,'WEAPON FORGE','🔨');
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
  if(bed&&state.plots.length>=M.MAX_PLOTS){toast(`Your garden already has the maximum ${M.MAX_PLOTS} beds.`,'🌱');return;}
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
async function confirmPlacement(){
  if(!placement)return;const {id,x,z,rotation,ok}=placement,item=M.ITEMS[id];
  if(!ok){toast('Can’t place it here (blocked by something or outside the fence).','❌');return;}
  // The kit pays for the bed: without one expandGarden would charge energy, so a vanished item just ends placement.
  if(!state.bag[id]){cancelPlacement();return;}
  if(!await perform('placeDecoration',{id,x,z,rotation})){movePlacement(x,z);return;}
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
function map(){openDialog('map','Every path is a possibility',`<p class="intro">Choose a place and your explorer will walk there.</p><div class="map-illustration"><div class="map-path"></div><span class="map-house">🏡</span><span class="map-trees">🌳 🌲 🌳</span><span class="map-garden">🌱 🌱</span><span class="map-pond">🎣</span><span class="map-rocket">🚀</span><span class="map-stall">🧺</span><b>Clover Village</b></div><div class="map-destinations">${(state.planet==='home'?[['plot','🌱','Garden'],['sell','🧺','Market'],['shop','🛍️','Outfitters'],['fish','🎣','Pond'],['upgrade','💎','Crystal'],['craft','🔨','Workshop'],['chest','📦','Storage'],['travel','🚀','Rocket']]:[['mine','💎','Crystal vein'],['travel','🚀','Rocket']]).map(([kind,icon,name])=>`<button class="soft-button" data-action="go" data-kind="${kind}">${icon} ${name}</button>`).join('')}${(world.planet==='home'?[['forest','🍄 Mushroom Forest'],['meadow','🌊 Lake Meadow'],['swamp','🌿 Chomper Swamp'],['canyon','🏜️ Redrock Canyon']]:[['wild','Explore the wild']]).map(([kind,label])=>`<button class="soft-button" data-action="wild" data-kind="${kind}">${label}</button>`).join('')}</div><p class="fineprint">${state.discovered.length} of 9 worlds discovered · Click the ground to choose your own path.</p>`,'YOUR EXPLORER’S MAP');}
// Tester code (tester.ts): solo only, so the online server never sees these rules.
function testerOnline(){return !!actionHandler||!!persistence;}
const testerTry=Tester.attemptLimiter(undefined,undefined,Tester.savedTries());let testerOpen=false;
function testerMore(){return `<details class="settings-more"${testerOpen||Tester.isTester(state)?' open':''}><summary>More</summary><div class="settings-row"><div><strong>Tester code</strong><small>${testerOnline()?'Tester code works in solo play':Tester.isTester(state)?'Tester mode is on':'For testing items and performance'}</small></div><div class="button-row tester-code"><input id="tester-code" type="password" autocomplete="off" maxlength="64" aria-label="Tester code" ${testerOnline()?'disabled':''}><button class="soft-button" data-action="tester-apply" ${testerOnline()?'disabled':''}>Apply</button></div></div>${Tester.isTester(state)&&!testerOnline()?'<div class="button-row"><button class="primary" data-action="tester-shop">🧪 <span>Tester shop</span></button><button class="soft-button" data-action="tester-exit">Exit tester mode</button></div>':''}</details>`;}
function testerShop(){openDialog('tester','Tester shop',Tester.testerShopHtml(state,art),'TESTER','🧪');}
/** Runs a tester rule on the solo save, then saves and redraws like perform() does offline. */
function testerDo(rule:(s:M.SaveState)=>boolean){if(testerOnline()){toast(t('Tester code works in solo play'),'💭');return false;}const before=state.level;if(!rule(state))return false;state.savedAt=Date.now();levelCheck(before);save();updateHud();tone('success');return true;}
async function testerApply(){testerOpen=true;if(testerOnline()){toast(t('Tester code works in solo play'),'💭');return;}
  const input=document.querySelector<HTMLInputElement>('#tester-code'),code=input?.value??'';if(!code.trim())return;
  if(!testerTry()){toast(t('Too many tries. Wait a minute and try again.'),'⏳');return;}
  if(!(await Tester.codeMatches(code))){if(input)input.value='';toast(t('That code is not quite right.'),'💭');return;}
  testerDo(Tester.unlockTester);toast(t('Tester mode on: {count} energy',{count:Tester.TESTER_ENERGY.toLocaleString()}),'🧪');settings();}
function settings(){openDialog('settings','Your little preferences',`<div class="settings-row"><div><strong>Language</strong><small>Choose your language</small></div>${languageSelector('settings')}</div><div class="settings-row"><div><strong>Full screen</strong><small>Fill the whole screen; press again to leave.</small></div><button class="toggle ${document.fullscreenElement?'on':''}" role="switch" aria-checked="${!!document.fullscreenElement}" aria-label="Full screen" data-action="fullscreen"></button></div>${audioRowsHtml(state.settings)}<div class="settings-row"><div><strong>AI neighbours</strong><small>Friendly explorers who fight in the wild, make friends and give gifts. Always off while you play online.</small></div><button class="toggle ${neighboursOn()?'on':''}" role="switch" aria-checked="${neighboursOn()}" aria-label="AI neighbours" data-action="neighbours"></button></div><div class="settings-row"><div><strong>Show joystick</strong><small>Drag the stick to walk in any direction. Skill buttons move to the opposite side.</small></div><button class="toggle ${joystickEnabled()?'on':''}" role="switch" aria-checked="${joystickEnabled()}" aria-label="Show joystick" data-action="move-pad"></button></div><div class="settings-row"><div><strong>Joystick side</strong><small>Choose the hand you use to move</small></div><div class="segmented" role="radiogroup" aria-label="Joystick side">${(['left','right'] as const).map(side=>`<button role="radio" aria-checked="${(state.settings.joystickSide??'left')===side}" data-action="joystick-side" data-kind="${side}">${side==='left'?'Left':'Right'}</button>`).join('')}</div></div>${keyboardSettings()}<div class="settings-row"><div><strong>Graphics</strong><small>${graphics.setting==='auto'?`Automatic · now ${QUALITY[graphics.level].label}`:QUALITY[graphics.level].label} · ${graphics.ratio.toFixed(2)}× resolution${graphics.fps?` · ${Math.round(graphics.fps)} fps`:''}</small></div><div class="segmented" role="radiogroup" aria-label="Graphics quality">${(['auto','high','medium','low'] as QualitySetting[]).map(q=>`<button role="radio" aria-checked="${graphics.setting===q}" class="${graphics.setting===q?'on':''}" data-action="graphics" data-kind="${q}">${q==='auto'?'Auto':QUALITY[q].label}</button>`).join('')}</div></div><div class="settings-row"><div><strong>Difficulty</strong><small>${M.DIFFICULTY_NOTE[M.difficultyOf(state)]}${world.roomDifficulty&&world.roomDifficulty!==M.difficultyOf(state)?` <span class="host-difficulty">${esc(t('Host difficulty: {level}',{level:t(M.DIFFICULTY_LABEL[world.roomDifficulty])}))}</span>`:''}</small></div><div class="segmented" role="radiogroup" aria-label="Difficulty">${M.DIFFICULTIES.map(d=>`<button role="radio" aria-checked="${M.difficultyOf(state)===d}" class="${M.difficultyOf(state)===d?'on':''}" data-action="difficulty" data-kind="${d}">${M.DIFFICULTY_LABEL[d]}</button>`).join('')}</div></div><div class="settings-row"><div><strong>Place new beds myself</strong><small>Off: a new garden bed goes down by itself next to the garden</small></div><button class="toggle ${state.settings.placeBeds?'on':''}" role="switch" aria-checked="${!!state.settings.placeBeds}" aria-label="Place new beds myself" data-action="place-beds"></button></div><div class="settings-row"><div><strong>Camera distance</strong><small>See more of your little world</small></div><div class="button-row"><button class="soft-button" data-action="zoom-in" aria-label="Zoom in">−</button><span id="zoom-value">${Math.round(world.zoom*100)}%</span><button class="soft-button" data-action="zoom-out" aria-label="Zoom out">＋</button></div></div>${testerMore()}<div class="save-note">🌱 <span>Your progress saves automatically ${persistence?'to your online account':'in this browser'}.${saveFailed?' Storage is unavailable. Keep this tab open to preserve this session.':''}</span></div><div class="button-row"><button class="soft-button" data-action="help">How to play</button><button class="text-button danger" data-action="reset-confirm">Start a new adventure</button></div><p class="fineprint">Zoo Garden · progress saved on this device when offline</p>`,'SETTINGS');}
function help(){openDialog('help','A small guide to a big world',`<div class="help-grid">${HELP_TOPICS.map(([icon,title,body])=>`<div><span>${icon}</span><h3>${esc(t(title))}</h3><p>${esc(t(body))}</p></div>`).join('')}</div><div class="button-row"><button class="soft-button" data-action="fullscreen">⛶ ${t('Fullscreen')}</button></div>`,'MAKE YOURSELF AT HOME');}

// Fishing happens in the world: no panel, just the pond, the line and a big Reel button.
let fishPond:Entity|null=null,recastUntil=0;
const fishingView=new FishingView(world.scene,world.fx!,fishKit,sound=>tone(sound));
// The mystery shadow is called only while fishing (fishing.ts attractMystery): offline this caller decides, online the server's does and this one mirrors it for the view.
let mysteryCaller=newMysteryCaller();
/** A mystery that came and was not landed: one try used; after the last one the shadow sinks away. */
function mysteryGotAway(f:FishingRound){if(!f.mysteryOut)return;f.mysteryOut=false;if(mysteryMissed(mysteryCaller))fishingView.dropMystery(f.pondId);}
const huntingView=new FishHuntingView(world.scene,fishingView);
const guardianView=new LakeGuardianView(world.scene,fishingView);
let huntingPending:{owner:M.SaveState;scene:typeof world.root}|null=null;
// The garden helper (helper.ts rules, helper-view.ts walking and poses, helper-ui.ts panels).
const helperView=new HelperView();world.scene.add(helperView.group);
function helperDialog(){if(visiting)return;openDialog('helper','Garden helper',helperPanel(state,{esc,mini,picture:`${ICON_BASE}helper.webp`}),'GARDEN HELPER','🤖');}
const helperPending=new Set<string>();
/** The empty bed whose seed list the player has open: no helper plants it until the panel closes (auto-plant.ts). */
function heldBed(){return modal==='plant'&&!visiting?activePlot:undefined;}
function helperAction(kind:'helperHarvest'|'helperPlant',i:number){
  if(kind==='helperPlant'&&(!autoPlanting(state)||i===heldBed()))return false; // switched off, or the player took the bed, while Bolt was walking to it
  const effect=(crop:M.CropId|undefined|null)=>{if(crop){if(kind==='helperHarvest')harvestBurst(i,crop,'worker');else{plantBurst(i,'worker');if(gainShows('worker'))tone('pop');}world.syncCrops();}return !!crop;};
  if(!actionHandler)return effect(change(()=>{try{return applyGameAction(state,{type:kind,payload:{index:i,away:explorerOut()}}) as M.CropId;}catch{return null;}}));
  const key=kind+':'+i;if(helperPending.has(key))return false;helperPending.add(key);
  void perform<M.CropId>(kind,{index:i,away:explorerOut()},{quiet:true}).then(effect).finally(()=>helperPending.delete(key));return true;
}
const helperHarvest=(i:number)=>helperAction('helperHarvest',i),helperPlant=(i:number)=>helperAction('helperPlant',i);

const farmHelperView=new FarmHelperView();world.scene.add(farmHelperView.group);
function farmHelperContext(){return started&&!document.hidden&&!flight&&!visiting&&(!actionHandler||network.role!==null)&&world.planet==='home'&&world.state===state?world.root:null;}
function farmHelperDialog(){if(visiting||world.planet!=='home'||!M.penBuilt(state))return;openDialog('farm-helper','Animal pen helper',farmHelperPanel(state,`${ICON_BASE}helper.webp`),'ANIMAL PEN','🤖');}
const farmHelperController=new FarmHelperController({state:()=>state,context:farmHelperContext,perform:workPerform,completed(result,catchUp){
  farmCollectFeedback(result.collected,undefined,'worker');for(const uid of result.fed)feedBurst(uid,'worker');
  if(result.fed.length&&gainShows('worker'))tone('pop');
  if(catchUp&&(result.collected.length||result.fed.length))toast(t('Your animal helper collected {count} products and fed {fed} animals.',{count:result.collected.length,fed:result.fed.length}),'🤖');
  if(result.restocked?.length){const r=Restock.restockSummary(result.restocked);toast(t('Pen robot restocked {animals} for ϟ {spent}.',r),'🔁');}
  if(modal==='pen')penDialog();
}});
// Rescued friends (friends.ts rules, friend-crew.ts cages/following/jobs, friend-view.ts looks, friend-ui.ts panel).
setFriendDresser((color,gear,look)=>world.friendAvatar(color,gear,look));
const helperChat=new ChatBubbles(world,()=>!started||modal!=='');
const crew=new FriendCrew({world,chat:helperChat,own:()=>state,visiting:()=>!!visiting,flying:()=>!!flight||world.boarded,started:()=>started,
  robotBed:()=>helperView.task?.index,robotAnimal:()=>farmHelperView.task?.uid,heldBed,animalAt:uid=>world.farmView?.positionOf(uid)??undefined,perform:(type,payload)=>type==='rescueFriend'?perform(type,payload):workPerform(type,payload), // a rescue is the player's own tap; the rest are the friends' own jobs
  rescued(id,at){const [hi,story]=RESCUE_LINES[id];tone('level');world.fx?.burst({x:at.x,z:at.z},{n:30,color:['#ffe66d','#ffffff',FRIENDS[id].tint],size:.14,speed:5,up:6,y:.8});floating(hi,at.x,at.z,'level',1.4);toast(t(story),'💖');},
  locked(id){toast(lockedHint(id),'🔒');},
  worked(id,task,r,at){
    if(task.kind==='harvest'){harvestBurst(task.index,Object.keys(r.raw)[0]??'carrot','worker',at);world.syncCrops();}else if(task.kind==='plant'){plantBurst(task.index,'worker');world.syncCrops();}
    else if(task.kind==='feed')feedBurst(task.uid,'worker');else farmCollectFeedback(r.collected??[],at,'worker',at);
    if(!gainShows('worker'))return;
    for(const [item,n] of Object.entries(r.cooked))floating('+'+n+' '+t(M.ITEMS[item]?.name??item),postFor(id).x,postFor(id).z,'item',1);
    if(Object.keys(r.cooked).length)tone('pop');
  },
  grew(id,stage){toast(t('{name} grew up! Now {share} of your height.',{name:t(FRIENDS[id].name),share:String(GROWTH[stage].height)}),'🌱');tone('success');},
  arrived(ids){toast(t('{names} reached Clover Village and went to work!',{names:ids.map(id=>t(FRIENDS[id].name)).join(', ')}),'🏡');void friendsCatchUp();}});
const nameplates=new Nameplates(world,()=>!started||modal!=='');
frameListeners.add(dt=>{crew.update(dt);helperChat.frame(dt);nameplates.frame();});
function friendDialog(id:FriendId){openDialog('friend',FRIENDS[id].name,friendPanel(world.state,id),'RESCUED FRIEND',{garden:'🌱',farm:'🐄',cook:'🍳'}[FRIENDS[id].role]);}
async function friendsCatchUp(){if(!(state.friends??[]).some(f=>f.home&&!f.paused))return;const r=await workPerform<Partial<Record<FriendId,{jobs:number;cooked:number}>>>('friendsCatchUp');const jobs=Object.values(r??{}).reduce((n,v)=>n+(v?.jobs??0),0);if(jobs)setTimeout(()=>toast(t('While you were away, your friends did {count} jobs.',{count:jobs}),'🤝'),3200);}
const storedNote=initStoredNote({state:()=>state,home:()=>started&&!visiting&&!flight&&world.planet==='home'&&world.state===state&&!explorerOut(),perform,openChest:()=>storage(),t,name:id=>t(M.ITEMS[id as M.ItemId]?.name??id),took:n=>{tone('click');toast(t('Took {count} items from the chest.',{count:n}),'📦');},covered:()=>!!modal},app);frameListeners.add(dt=>storedNote.frame(dt));
let friendsHome=false;frameListeners.add(()=>{const home=started&&!visiting&&!flight&&world.planet==='home';if(started&&!home)tripSeen=true;if(home&&!friendsHome){if(tripSeen){tripBackUntil=Date.now()+120_000;tripSeen=false;}void friendsCatchUp();void helperCatchUp();}friendsHome=home;});
let farmHelperSettingsPending=false;
async function farmHelperSetting(type:'buyFarmHelper'|'upgradeFarmRestock'|'setFarmRestock'|'setFarmHelperPaused'|'setFarmHelperAutoFeed',payload:Record<string,unknown>={}){
  if(farmHelperSettingsPending||!farmHelperContext())return;
  const original=state,scene=world.root;farmHelperSettingsPending=true;
  try{const result=await perform(type,payload);if(state!==original||world.root!==scene||!farmHelperContext())return;
    if(type==='upgradeFarmRestock'&&result==='upgraded'){tone('coin');toast('Auto-restock upgraded!','🔁');}
    if(type==='buyFarmHelper'&&result==='bought'){farmHelperView.reset();tone('coin');toast('Your animal helper is ready! Automatic feeding starts off.','🤖');}
    if(modal==='farm-helper')farmHelperDialog();
  }finally{farmHelperSettingsPending=false;}
}
const rodTip=new Vector3();
/** Indoors the ponds are "far away": no ambient ripples (fx draws in the cottage's scene then, so they would ring among the furniture). */
const FAR_AWAY=new Vector3(1e4,0,1e4);
function tipPosition(){const tip=world.player.getObjectByName('rod-tip');if(tip){world.player.updateWorldMatrix(true,true);tip.getWorldPosition(rodTip);}else rodTip.set(world.position.x,1.4,world.position.z);return rodTip;}
function pondView(e:Entity):PondView{return {id:e.id,x:e.x,z:e.z,rx:e.pond!.rx,rz:e.pond!.rz,surface:e.pond!.surface,waterId:e.waterId??state.planet};}
function stockPonds(){fishingView.attach(world.scene);fishingView.populate(world.outdoorEntities.filter(e=>e.kind==='fish'&&e.pond).map(pondView),waterId=>(M.FISH_WEIGHTS[waterId]??M.FISH_WEIGHTS.home).flatMap(([id,weight])=>Array(Math.max(1,Math.min(6,Math.round(weight/8)))).fill(id)),waterId=>{const pool=(M.FISH_WEIGHTS[waterId]??M.FISH_WEIGHTS.home).filter(([id])=>M.FISH[id].rarity!=='junk');return pool[Math.floor(Math.random()*pool.length)]?.[0]??'fish_carp';},pondStock);}
// Rod fish follow the harpoon slots' species so picking up hunting gear by the shore keeps the pond's look.
function pondStock(pond:PondView){const hunt=huntingPondAt(state.planet,pond.x,pond.z);return hunt?fishHuntTargets(hunt,0,state.hunting).map(t=>t.id):null;}
const formatSize=(cm:number)=>cm>=100?`${(cm/100).toFixed(2).replace(/\.?0+$/,'')} m`:`${cm} cm`;
function showReel(on:boolean,mode:'reel'|'cast'|'hunt'='reel'){const button=$('#reel-button');button.hidden=!on;button.classList.toggle('cast',mode==='cast');button.classList.toggle('hunt',mode==='hunt');button.classList.remove('bite','down');button.removeAttribute('aria-pressed');button.setAttribute('aria-label',t(mode==='hunt'?'Hunt a fish':mode==='cast'?'Cast':'Reel in the line'));$('#reel-text').textContent=t(mode==='hunt'?'Hunt':mode==='cast'?'Cast':'Reel');$('.reel-icon').textContent=mode==='hunt'?'🔱':'🎣';$('#hud').classList.toggle('fishing',on&&mode==='reel');$('#fish-hint').hidden=!(on&&mode!=='cast');}
function endFishing(message?:string,icon='🎣'){fishingEpoch++;const was=!!fishGame;if(fishGame){mysteryGotAway(fishGame);fishingView.dropMystery(fishGame.pondId);}if(fishGame?.ticket&&actionHandler)void perform('fishCancel',{ticketId:fishGame.ticket});fishGame=null;fishingView.cancel();world.fishing='idle';showReel(false);if(was&&message)toast(message,icon);}
/** Apply only actual changes: staying by the shore must not rebuild the avatar or save every frame. */
function applyContextWeapon(id:M.ItemId|null){
  if((state.gear.weapon??null)===id)return;
  if(!(id?M.equip(state,id):M.unequip(state,'weapon')))return;
  world.refreshPlayer();if(!actionHandler)save();updateHud();
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
function updateHunting(dt:number){
  if(huntingPending&&(huntingPending.owner!==state||huntingPending.scene!==world.root))huntingPending=null;
  const enabled=started&&!uiBlocked()&&!document.hidden&&!visiting&&!flight&&!fishGame&&state.hp>0&&!state.gear.disguise&&state.gear.weapon==='harpoon';
  const entity=enabled?world.entities.filter(e=>e.kind==='fish'&&e.pond&&Math.hypot(e.x-world.position.x,e.z-world.position.z)<=e.radius+3)
    .sort((a,b)=>Math.hypot(a.x-world.position.x,a.z-world.position.z)-a.radius-(Math.hypot(b.x-world.position.x,b.z-world.position.z)-b.radius))[0]:null;
  const pond=entity?huntingPondAt(state.planet,entity.x,entity.z):null;
  huntingView.update(dt,pond,state.hunting,fishKit.ready,world.root,state);
  const button=$('#reel-button');
  if(pond){
    if(button.hidden||!button.classList.contains('hunt'))showReel(true,'hunt');
    $('#fish-hint').textContent=t(huntingView.targets.length?'Tap a fish to throw your harpoon.':'Fish are returning soon.');
    button.classList.toggle('down',!!huntingPending||huntingView.now()-(state.hunting?.lastShotAt??0)<FISH_HUNT_COOLDOWN_MS);
  }else if(button.classList.contains('hunt'))showReel(false);
}
/**
 * The Lake Guardian (lake-guardian.ts) shows by the big meadow lake with any gear; holding the harpoon makes it a target
 * (FishHuntingView). A catch is read from the save (hunting.guardianAt), so offline and online replies celebrate alike.
 */
let guardianSeen:{owner:M.SaveState;at:number|undefined}|null=null;
function updateGuardian(dt:number){
  guardianView.attach(world.scene);
  const lake=started&&!visiting&&!flight&&!world.interior?guardianLake(state.planet,world.position):null,now=huntingView.now(),at=state.hunting?.guardianAt;
  if(guardianSeen?.owner===state&&at!==undefined&&at!==guardianSeen.at&&Math.abs(now-at)<10_000){
    const p=guardianView.position??world.position;guardianView.caught(p,lake?.surface??.3,world.fx);toast('You caught the Lake Guardian! It will come back for you tomorrow.','🎏');tone('level');
  }
  guardianSeen={owner:state,at};
  if(guardianView.update(dt,lake,now,state.hunting,fishKit.ready,world.fx)==='surfaced'&&lake&&Math.hypot(lake.x-world.position.x,lake.z-world.position.z)<lake.rx+14)
    toast(state.gear.weapon==='harpoon'&&!state.gear.disguise?'The Lake Guardian has surfaced! Tap it to throw your harpoon.':'A glowing Lake Guardian is circling the lake. Only a harpoon can catch it.','🎏');
}
async function throwHarpoon(aim?:{x:number;z:number}){
  if(!started||uiBlocked()||visiting||flight||fishGame||huntingPending||state.gear.weapon!=='harpoon'||state.gear.disguise||combatTimers.attackCooldown>0)return;
  updateHunting(0);const pond=huntingView.pond;if(!pond)return;
  if(state.hunting&&huntingView.now()-state.hunting.lastShotAt<FISH_HUNT_COOLDOWN_MS)return;
  const from={x:world.position.x,z:world.position.z},target=huntingView.nearest(aim??from,from,M.ITEMS.harpoon.weapon!.range);
  if(!target){toast('No fish in reach. Move along the shore.','🐟');return;}
  const point=aim??{x:target.x,z:target.z},owner=state,scene=world.root,scope={owner,scene};
  huntingPending=scope;
  world.destination=null;world.route=[];world.moving=false;world.selected=null;world.ring.visible=false;
  world.facing=Math.atan2(point.x-from.x,point.z-from.z);
  try{
    const result=await perform<FishHuntResult>('fishHunt',{weaponId:'harpoon',pondId:pond.id,slot:target.slot,aim:point,from});
    if(!result||huntingPending!==scope||state!==owner||world.root!==scene||fishGame||flight||visiting||state.hp<=0||state.gear.disguise||state.gear.weapon!=='harpoon')return;
    huntingView.syncClock(result.serverNow);huntingView.throw(from,point);
    world.playerAttack('gun');combatTimers.attackCooldown=FISH_HUNT_COOLDOWN_MS/1000;tone('shoot');
    world.fx?.ring({...point,y:pond.surface+.02},{color:result.hit?'#ffe66d':'#bfe9ff',from:.15,to:.7,life:.5});
    if(result.hit){const item=M.ITEMS[result.id];floating(`${item.icon} ${t(item.name)} · ${formatSize(result.size)}`,point.x,point.z,'item');tone('success');}
    else floating(t('Missed! Aim at a fish.'),point.x,point.z,'xp');
  }finally{if(huntingPending===scope)huntingPending=null;}
}
function fish(pond?:Entity|null){
  pond??=world.entities.filter(e=>e.kind==='fish'&&e.pond).sort((a,b)=>Math.hypot(a.x-world.position.x,a.z-world.position.z)-a.radius-(Math.hypot(b.x-world.position.x,b.z-world.position.z)-b.radius))[0]??null;
  if(!pond?.pond||Math.hypot(pond.x-world.position.x,pond.z-world.position.z)>pond.radius+3){toast('Walk up to a pond to cast your line.','🎣');return;}
  if(state.gear.weapon==='harpoon'&&!state.gear.disguise){const tap=world.pondTap?.id===pond.id?world.pondTap:undefined;world.pondTap=null;void throwHarpoon(tap);return;}
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
  const choose=(bonus:number):FishPick|null=>{
    const round=fishGame;if(!round)return null;
    if(actionHandler){
      if(round.ready){const pick=round.ready;delete round.ready;round.mysteryOut=!!pick.mystery;return pick;}
      if(!round.pending){round.pending=true;
        void (async()=>{if(round.ticket){await perform('fishCancel',{ticketId:round.ticket});delete round.ticket;}
          if(fishGame!==round)return;
          const result=await perform<{ticketId:string;bait:boolean;pick:FishPick;mysterySpot?:{x:number;z:number};lineSeed?:number}>('fishStart',{water:fishingWater,rodId,cast:simulation.cast??cast});
          if(!result){if(fishGame===round)endFishing();return;}
          if(fishGame!==round){void perform('fishCancel',{ticketId:result.ticketId});return;}
          if(result.pick.mystery&&result.mysterySpot){const tries=mysteryCaller.active?.water===round.pondId?mysteryCaller.active.tries:0;mysteryCaller.active={water:round.pondId,...result.mysterySpot,tries};fishingView.callMystery(round.pondId,result.mysterySpot);}
          simulation.setBait(result.bait);if(result.lineSeed!==undefined)simulation.setLineSeed(result.lineSeed);
          round.ticket=result.ticketId;round.proof=new FishingProof(performance.now());round.ready=result.pick;round.pending=false;
        })();
      }return null;
    }
    const call=attractMystery(mysteryCaller,round.pondId,simulation.cast??cast,Date.now(),Math.random,water);
    if(call.spot)fishingView.callMystery(round.pondId,call.spot);
    const mysteryId=call.mystery?fishingView.mysteryIn(round.pondId):null;round.mysteryOut=!!mysteryId;
    if(mysteryId){const f=M.FISH[mysteryId];return {id:mysteryId,power:f.power,size:0,huge:false,mystery:true};}
    const selected=selectCatch(weights.map(([id,weight])=>{const f=M.FISH[id];return {id,weight:catchWeight(weight,f.rarity,bonus),min:f.size[0],max:f.size[1],junk:f.rarity==='junk'};}));return {...selected,power:M.FISH[selected.id].power};
  };
  const simulation=new FishingSimulation<FishPick>({quality:rod.quality??.3,steady:rod.steady===true,bait:(state.bag.worm??0)>0,luck:stats.luck,choose,approachFrom:p=>fishingView.approachDistance(p.id,!!p.mystery),water,cast,player:{x:world.position.x,z:world.position.z}});
  fishingEpoch++;fishGame={input,simulation,lastPhase:'cast',seen:{missed:0,bait:0,early:0},tooEarlyUntil:0,approach:0,pondId:pond.id};
  world.destination=null;world.route=[];world.moving=false;world.selected=null;world.ring.visible=false;world.facing=Math.atan2(cast.x-world.position.x,cast.z-world.position.z);
  world.fishing='cast';world.castT=.5;showReel(true);
  fishingView.begin(pondView(pond),tipPosition(),cast);
}
const FISH_HINTS:Record<string,string>={cast:'Casting…',wait:'Wait for a fish…',approach:'A fish is coming… wait!',nibble:'A nibble… not yet!',bite:'Bite! Press Reel!'};
function updateFishing(dt:number){
  const f=fishGame;if(!f)return;const sim=f.simulation;
  if(world.destination||world.route.length||world.moving||world.keys.size||world.joystickInput){endFishing('Fishing line reeled in.');return;}
  sim.update(dt,f.input.held);
  // Line strain (fishing.ts STRAIN): warn as the bar fills, then a strain that held goes into the proof (the server rolls it too).
  if(sim.strains>(f.seen.strains??0)){f.seen.strains=sim.strains;if(!sim.snapped){f.proof?.strain(performance.now(),sim.progress);floating('😮‍💨 The line held!',world.position.x,world.position.z,'xp');tone('reel');vibrate(25);}}
  if(sim.strained&&!f.strainWarned){f.strainWarned=true;floating('⚠️ Line strained!',world.position.x,world.position.z,'alert');tone('alert');}else if(!sim.strained&&sim.tension<.68)f.strainWarned=false;// re-arm 0.12 under STRAIN.warn
  if(f.proof&&(sim.phase==='hooked'||sim.phase==='caught'))f.proof.sample(performance.now(),f.input.held,sim.tension,sim.progress,sim.phase==='caught');
  if(sim.phase==='wait'&&f.lastPhase!=='wait')mysteryGotAway(f);
  if(f.ticket&&sim.phase==='wait'&&f.lastPhase!=='wait'){const ticket=f.ticket;delete f.ticket;delete f.proof;void perform('fishCancel',{ticketId:ticket});}
  if(f.proof&&performance.now()-f.proof.startedAt>175000){endFishing('This cast has expired. Cast again.');return;}
  // Worms are used at a missed bite, a snap, slack line and a catch (not when a fish just swims off).
  if(sim.baitUsed>f.seen.bait){const used=sim.baitUsed-f.seen.bait;f.seen.bait=sim.baitUsed;if(!actionHandler)change(()=>{for(let i=0;i<used;i++)M.removeItem(state.bag,'worm');});sim.setBait((state.bag.worm??0)>0);}
  if(sim.missedBites>f.seen.missed){f.seen.missed=sim.missedBites;toast('Missed the bite — wait for the next fish.','🎣');}
  if(sim.earlyPresses>f.seen.early){f.seen.early=sim.earlyPresses;f.tooEarlyUntil=sim.time+1.5;}
  if(sim.phase!==f.lastPhase){if(sim.phase==='bite')vibrate(40);f.lastPhase=sim.phase;}
  world.fishing=sim.phase==='cast'?'cast':sim.phase==='hooked'?'fight':'wait';
  $('#fish-hint').textContent=t(sim.phase==='wait'&&sim.time<f.tooEarlyUntil?'Too early! Wait for the bobber to sink.':sim.phase==='hooked'?(sim.strained?'Line strained! Let go!':sim.surge>0?'Surge! Let go!':sim.tension>.65?'Easy… let the line go':'Hold Reel to pull it in'):FISH_HINTS[sim.phase]??'');
  const button=$('#reel-button');button.classList.toggle('bite',sim.phase==='bite');button.classList.toggle('strained',sim.strained);button.classList.toggle('down',f.input.held);button.setAttribute('aria-pressed',String(f.input.held));
  if(!sim.finished)return;
  fishGame=null;world.fishing='idle';
  if(sim.phase==='escaped'){
    mysteryGotAway(f);
    if(f.ticket&&actionHandler)void perform('fishCancel',{ticketId:f.ticket});
    if(sim.snapped){fishingView.snap();setTimeout(()=>floating('Line snapped! 💔',world.position.x,world.position.z,'hurt'),250);}else fishingView.cancel();
    showReel(true,'cast');recastUntil=performance.now()+6000;toast(sim.reason,'💧');return;
  }
  showReel(false);void finishFishingCatch(f);
}
/** Commit the catch before the optional leap animation; travel/reloads must not erase earned loot. */
async function finishFishingCatch(f:FishingRound){
    const pick=f.simulation.pick!,caughtState=state,scene=world.root,epoch=fishingEpoch,online=!!actionHandler;
    let result:FishPick|undefined=pick;if(pick.mystery){mysteryLanded(mysteryCaller);f.mysteryOut=false;}
    if(online){result=await perform<FishPick>('fishFinish',{ticketId:f.ticket,telemetry:f.proof?.finish(performance.now())});}
    else if(pick.mystery)result={...resolveMysteryCatch({id:pick.id,max:M.FISH[pick.id].size[1]}),power:pick.power};
    if(state!==caughtState)return;
    const current=()=>state===caughtState&&world.root===scene&&fishingEpoch===epoch&&!fishGame;
    if(!result){if(current())fishingView.cancel();return;}
    const reward=result,item=M.ITEMS[reward.id],caught=M.FISH[reward.id];
    if(!online&&!change(()=>reward.mystery?M.grantMysteryCatch(state,reward.id,reward.size,reward.supergiant):M.grantCatch(state,reward.id,reward.size,reward.huge))){if(current()){fishingView.cancel();toast('There is no room for this catch.','🎒');}return;}
    if(!current())return;
    fishingView.land(()=>world.position,()=>{
      if(!current())return;tone('success');
      world.fx?.burst(world.position,{n:18,color:['#bfe9ff','#ffffff','#ffe66d'],glow:true,speed:4,up:6});
      floating(item.icon+' '+t(item.name),world.position.x,world.position.z,reward.supergiant?'item big':'item');
      if(caught&&caught.rarity!=='junk'&&reward.size>0)setTimeout(()=>floating((reward.supergiant?t('SUPERGIANT')+' ':reward.huge?t('HUGE')+' ':'📏 ')+formatSize(reward.size),world.position.x,world.position.z,reward.huge?'crit big':'xp'),350);
      if(reward.huge)world.fx?.shake(.3);
      {const m=caught&&reward.size>0?M.catchMultiplier(caught,reward.size,reward.huge):1;if(m>=1.5)setTimeout(()=>floating(t('×{n} size bonus',{n:m.toFixed(1)}),world.position.x,world.position.z,'level'),900);}
      if(reward.mystery)toast(reward.supergiant?'The mysterious shadow was a supergiant fish!':'A treasure was hiding beneath the question mark!',item.icon);
      else if(caught?.rarity==='legendary')toast(t('Legendary catch! {name}, {size}.',{name:t(caught.name),size:formatSize(reward.size)}),'👑');
      if(!fishGame){showReel(true,'cast');recastUntil=performance.now()+6000;}
    },{id:reward.id,supergiant:reward.supergiant,icon:item.icon,fish:!!caught});
}


world.onAlert=()=>tone('alert');
world.onBuilt=()=>{if(fishGame)endFishing();stockPonds();minimap.invalidate();};
stockPonds();
// Fish models stream in after the first build; restock the ponds when they arrive.
void fishKit.load().then(()=>{if(fishKit.ready&&!fishGame)stockPonds();});
// The Blender explorer, gear and pets stream in after the world is playable.
// Gear and pet files load on demand as the explorer puts them on (see World.kitFor).
void heroKit.load().then(()=>{if(heroKit.ready)world.refreshAvatars();});
// The cottage interior (house-ui.ts): the door, walking in and out, friends and their Dress panel.
const house=initHouse({world,started:()=>started,visiting:()=>!!visiting,blocked:uiBlocked,perform:(type,payload)=>perform(type,payload),openDialog,closeDialog,modal:()=>modal,toast,tone:kind=>tone(kind as Parameters<typeof tone>[0]),ownGear:()=>{bagMode='wardrobe';inventory();},looks:()=>lookShop.open(),bench:()=>bench.open(),quests,soundOn:()=>syncAudio(state.settings).musicVolume>0,iconUrl:id=>`${ICON_BASE}items/${id}.webp`});
// The bedroom mirror's Look shop (look-shop.ts): body styles bought with energy, previewed like gear try-on.
// A tap on an indoor label picks its thing, like a tap on the thing (labels themselves never take pointer events).
house.house.labelBox=id=>{const a=labelAnchors.get(id);return a&&!a.off&&!modal&&labelNodes.get(id)?.hidden===false?labelRect(a):null;};
const lookShop=initLookShop({world,perform:(type,payload)=>perform(type,payload),openDialog,modal:()=>modal,toast,tone:kind=>tone(kind as Parameters<typeof tone>[0]),endGearTryOn:()=>{if(tryingOn){tryingOn=null;world.tryOnGear=null;}}});
frameListeners.add(dt=>house.frame(dt));frameListeners.add(dt=>challenges.tick(dt));
// The craft room's upgrade bench (upgrade-bench.ts): gear levels and skill levels, both run through actions.ts.
const bench=mountUpgradeBench({state:()=>state,perform:(type,payload)=>perform(type,payload) as never,openDialog,modal:()=>modal,toast,tone:kind=>tone(kind as Parameters<typeof tone>[0]),ui:()=>({art,chips:materialChips,skills:[...BASE_SKILLS,SPECIALS[M.weaponStats({...state,gear:{...state.gear,disguise:undefined}}).special??'fist']??SPECIALS.fist],disguised:!!state.gear.disguise,weaponKind:M.weaponStats({...state,gear:{...state.gear,disguise:undefined}}).kind})});
world.onInteract=async(e)=>{
  if(!started||uiBlocked())return;tone();if(house.interact(e))return;if(visiting&&e.kind!=='travel'&&e.kind!=='plot'){toast('Enjoy looking around. Your own garden is waiting at home.','🌷');return;}const env=world.interactEnvironment(e);if(env){if(env.message)toast(env.message);save();updateHud();if(env.openCrafting){craftStation='forge';crafting();}return;}
  if(e.kind==='plot')plotDialog(e.index!);else if(e.kind==='sell')market();else if(e.kind==='shop')shop();else if(e.kind==='chest')storage();else if(e.kind==='upgrade')upgrades();else if(e.kind==='cook')cooking();else if(e.kind==='craft'){craftStation='craft';crafting();}else if(e.kind==='travel')planets();else if(e.kind==='fish')fish(e);
  else if(e.kind==='pen')penTap();
  else if(e.kind==='cage')crew.tapCage(e);
  else if(e.kind==='friend'&&e.index!==undefined)friendDialog(FRIEND_IDS[e.index]);
  else if(e.kind==='animal'){if(M.readyAnimals(state).some(a=>a.uid===e.animalUid))collectFarm(e.animalUid);else penDialog();}
  else if(e.kind==='home'){if(!await perform('rest'))return;toast('Home, sweet home. Your health is restored.','🏡');}
  else if(e.kind==='dropped'){if(!await perform('recoverBag'))return;world.syncDropped();toast('All your little treasures are back.','🎒');}
  else if(e.kind==='mine'){const index=e.index;if(index===undefined||!M.mineAvailable(state,state.planet,index)){toast('This crystal needs a moment to regrow.','💎');return;}if(!await perform('claimMine',{index}))return;world.burst(e.x,e.z,'#d9c9f3');toast('A crystal for your crafting collection!','💎');}
  else if(e.kind==='gift'){if(e.index===undefined)return;const outcome=await perform<M.GiftOutcome>('claimGift',{index:e.index!});if(!outcome)return;e.mesh.visible=false;if(outcome.kind==='bomb'){for(const target of world.enemies)if(target.hp>0&&Math.hypot(target.x-e.x,target.z-e.z)<(outcome.radius??4.5))hit(target,Math.round(M.attack(state)*(outcome.damageMultiplier??3)));world.burst(e.x,e.z,'#ffb269',28);checkDefeat();}toast(outcome.label,'🎁');}
};
// Loot lands on the ground (drops.ts) and reaches the bag through the pickup magnet, with a '+n name' float.
const drops=createDrops(world,{layer:$('#world-labels'),alive:()=>state.hp>0&&!world.interior,item:id=>Object.hasOwn(M.ITEMS,id)?M.ITEMS[id]:undefined,
  iconUrl:id=>Object.hasOwn(M.ITEMS,id)&&M.ITEMS[id].type==='decor'?decorIcon(id)||null:iconPath(id)?ICON_BASE+iconPath(id):null,
  canAdd:(id,n)=>Number.isSafeInteger((state.bag[id]??0)+n),onPick:(d,stack)=>{
    const feedback=(id:string,count:number)=>{floating('+'+count+' '+t(M.ITEMS[id].name),world.position.x,world.position.z,'item',stack*.7);tone('coin');};
    if(actionHandler){const meta=networkDrops.get(d.uid);if(!meta)return;networkDrops.delete(d.uid);const collectingState=state,root=world.root;
      void perform<{item:string;count:number}>('claimDrop',{ownerId:meta.drop.ownerId,id:meta.drop.id}).then(result=>{
        if(state!==collectingState||world.root!==root||visiting)return;
        if(result)feedback(result.item,result.count);else if(meta.drop.expiresAt>Date.now())spawnNetworkDrop(meta.drop,meta.actor);
      });
    }else if(change(()=>M.addItem(state,d.item,d.count)))feedback(d.item,d.count);
  },
  onFull:()=>toast('Your backpack is full. Store or sell something first.','🎒'),onRare:(d,name)=>{floating(`${d.rarity==='legendary'?'👑':'✨'} ${name}`,d.x,d.z,'item');tone('level');},onExpire:d=>world.burst(d.x,d.z,'#cfd6e6',6)});
const networkDrops=new Map<number,{drop:NetworkDrop;actor:string}>();
function spawnNetworkDrop(drop:NetworkDrop,actor:string){
  if(!drop||!M.ITEMS[drop.item]||drop.expiresAt<=Date.now()||drop.planet!==world.planet||visiting||[...networkDrops.values()].some(v=>v.drop.id===drop.id))return;
  const d=drops.spawn(drop.item,drop.count,drop.x,drop.z,{thrown:!!drop.thrown&&drop.owner===actor});if(!d)return;
  d.vx=d.vz=0;d.life=Math.max(0,(drop.expiresAt-Date.now())/1000);networkDrops.set(d.uid,{drop,actor});
}
function removeNetworkDrop(id:string){for(const [uid,meta]of networkDrops)if(meta.drop.id===id){drops.sim.drops=drops.sim.drops.filter(d=>d.uid!==uid);networkDrops.delete(uid);}}
frameListeners.add(dt=>{for(const [uid,meta]of networkDrops){const d=drops.sim.drops.find(d=>d.uid===uid);if(!d){networkDrops.delete(uid);continue;}d.pickupLocked=meta.drop.owner!==meta.actor&&Date.now()<meta.drop.releaseAt;}drops.update(dt);});
// Drawn on the next frame's render: a one-frame lag is invisible on a 0.5 m gardener.
frameListeners.add(dt=>helperView.update(dt,{state:!flight&&world.planet==='home'?world.state:null,act:started&&!visiting&&world.state===state&&!document.hidden,now:Date.now(),harvest:helperHarvest,plant:helperPlant,held:heldBed()}));
frameListeners.add(dt=>{farmHelperController.sync();farmHelperView.update(dt,{state:!flight&&world.planet==='home'?world.state:null,context:world.root,act:!!farmHelperContext(),pending:farmHelperController.pending,now:Date.now(),position:uid=>world.farmView?.positionOf(uid)??undefined,work:task=>farmHelperController.work(task)});});
function grantDefeat(e:{id:string;xp:number;boss:boolean;type?:string;name?:string;x?:number;z?:number;helper?:boolean}){
  if(actionHandler)return;
  // In the safe zone nothing that falls far outside it pays you: no EXP, no orbs, no loot (safe-zone.ts).
  if(!defeatPaysPlayer(world.position,{x:e.x??world.position.x,z:e.z??world.position.z},world.planet,!!world.networkRole))return;
  const defeat=()=>M.grantDefeat(state,e.type??'slime',e.xp,e.boss,Math.random,false),loot=change(()=>e.helper?asHelper(defeat):defeat());// a pet's kill is not the player's for the timed challenge
  // Experience flies in as cyan orbs; the loot is tossed onto the ground where the creature fell.
  const x=e.x??world.position.x,z=e.z??world.position.z;
  world.fx?.orbs({x,z},Math.min(8,3+Math.floor(e.xp/20)),'#7ff0ff',()=>world.position,()=>tone('coin'));
  floating(`+${e.xp} EXP`,x,z,'xp',.5);
  // Loot lands on the ground (drops.ts); picking it up shows the +n float.
  drops.spawnLoot(loot,x,z);
  if(e.boss){toast(`${e.name??'Boss'} defeated!`,'👑');tone('level');}
  // The first-defeat companion is banked straight into the bag (model.ts grantDefeat), never dropped on the ground.
  if(loot.pet)toast(`${t(M.ITEMS[loot.pet].name)} joined you! It waits in your bag.`,M.ITEMS[loot.pet].icon);
}
function hit(e:Enemy,damage:number,stun=0,impact?:CombatHit,remote=false,hazard=false){
  if(e.hp<=0||(visiting&&!remote))return;if(actionHandler)return;if(!remote&&network.hit?.(e.id,damage,stun,impact))return;
  world.damageEnemy(e,damage,stun,hazard);combatHud.noteHit(e);world.hitFeedback(e,damage,!!impact?.critical);if(!hazard||impact)tone(impact?.critical?'crit':'hit');
  if(impact?.lift&&e.hp>0)world.knockUpEnemy(e,impact.lift,.75);
  if(impact?.knock&&e.hp>0)world.knockEnemy(e,impact.direction.x,impact.direction.z,impact.knock);
  if(e.hp===0){world.defeatFeedback(e);tone('poof');
    const type=(e as Enemy&{type?:string}).type??'slime';if(network.onHostKill)network.onHostKill(e.id,e.xp,e.boss,type);else grantDefeat({...e,type,helper:!!impact?.helper});}
}
/** Devour finishes a weakened ordinary creature even through a defensive shell. */
function executeEnemy(enemy:Enemy,healFraction:number){
  if(actionHandler||visiting||enemy.boss||enemy.hp<=0||enemy.hp/enemy.maxHp>=.4||Math.hypot(enemy.x-world.position.x,enemy.z-world.position.z)>3.2+enemy.radius)return;
  hit(enemy,enemy.hp+1,0,undefined,false,true);
  if(enemy.hp<=0)change(()=>{state.hp=Math.min(M.maxHp(state),state.hp+M.maxHp(state)*Math.max(0,Math.min(.25,healFraction)));});
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
  if(id==='harpoon')toast('Harpoon ready. Tap pond fish or select a forest bird.','🔱');
}
/** Eating from the bag or the HUD button: one path, with "+N ❤️" over the explorer like the reference's useItem. */
async function eatFood(id:M.ItemId){
  // Healing food at full health does nothing (model.ts eat refuses it): say so here, for the bag's Use button as for quick-eat.
  const item=M.ITEMS[id];if(item&&!item.buff&&state.hp>=M.maxHp(state)){toast('Your health is already full.','❤️');return false;}
  const before=state.hp,ok=await perform<boolean>('eat',{id});
  if(ok){const healed=Math.round(state.hp-before);if(healed>0)floating(`+${healed} ❤️`,world.position.x,world.position.z,'item');tone('pop');}
  return !!ok;
}
const QUICK_EAT_KEY='zoo-garden-quick-eat';
let quickEatChoice:FoodChoice=(()=>{try{return (localStorage.getItem(QUICK_EAT_KEY)||'auto') as FoodChoice;}catch{return 'auto';}})(),quickEatShown='';
/** The quick-eat button: tap eats the best fit (or the picked food); greyed out but still tappable when it cannot help. */
async function quickEat(){
  if(!started)return;const view=quickEatView(state,quickEatChoice);
  if(view.reason){toast(view.reason==='none'?'No food in your backpack. Harvest crops, fish or cook a meal.':'Your health is already full.',view.reason==='none'?'🎒':'❤️');return;}
  await eatFood(view.id!);
}
function updateQuickEat(){
  const view=quickEatView(state,quickEatChoice),key=`${view.id}|${view.count}|${view.idle}|${quickEatChoice}|${getLanguage()}`;if(key===quickEatShown)return;quickEatShown=key;
  const button=$('#quick-eat'),name=view.id?t(M.ITEMS[view.id].name):'';button.classList.toggle('idle',view.idle);button.classList.toggle('picked',quickEatChoice!=='auto');
  $('#quick-eat-icon').innerHTML=view.id?art(view.id,M.ITEMS[view.id].icon):'🍽️';$('#quick-eat-count').textContent=String(view.count);
  button.setAttribute('aria-label',view.id?`${t('Eat')} ${name} · +${M.ITEMS[view.id].heal} HP · ×${view.count}`:t('Eat'));button.title=view.id?`${t('Eat · H')} · ${name}`:t('Eat · H');
}
/** Long-press or the chevron: pick a food to always use, or Auto (smallest heal that covers the missing health). */
function quickEatMenu(open:boolean){
  const menu=$('#quick-eat-menu');if(!open&&menu.hidden)return;menu.hidden=!open;$('.quick-eat-pick').setAttribute('aria-expanded',String(open));if(!open)return;
  const row=(id:string,label:string,icon:string,extra='')=>`<button data-action="quick-eat-choose" data-item="${id}" aria-pressed="${quickEatChoice===id}"><span>${icon}</span><small>${esc(label)}</small>${extra}</button>`;
  menu.innerHTML=localizeHtml(row('auto',t('Auto'),'✨')+healingFoods(state).map(id=>row(id,t(M.ITEMS[id].name),art(id,M.ITEMS[id].icon),`<b>+${M.ITEMS[id].heal! >999?'∞':M.ITEMS[id].heal} · ×${state.bag[id]}</b>`)).join(''));
}
mountLongPress($('#quick-eat'),()=>quickEatMenu(true),()=>started&&!document.hidden&&!uiBlocked());
let tryingOn:M.ItemId|null=null;
/**
 * Try-on: the explorer wears the item at once (World.tryOnGear, never saved or sent online) while the menu
 * steps aside so the avatar stays in view; tapping again, another action or closing the menu reverts it.
 */
function tryOn(id:M.ItemId){
  if(tryingOn===id){endTryOn();}else{tryingOn=id;world.tryOnGear=previewGear(state.gear,id);world.refreshPlayer();$('#dialog-layer').classList.add('trying-on');world.fx?.burst(world.position,{n:10,color:['#ffe66d','#ffffff'],glow:true,speed:2.5,up:5});}
  if(modal==='shop')shop();else if(modal==='bag')inventory();
}
function endTryOn(){if(!tryingOn&&!world.tryOnGear&&!world.tryOnLook)return;tryingOn=null;world.tryOnGear=null;world.tryOnLook=null;$('#dialog-layer').classList.remove('trying-on');world.refreshPlayer();}
function basicAttack(e?:Enemy){
  if(!started||uiBlocked()||visiting||combatTimers.attackCooldown>0)return;
  prepareCombatWeapon();
  if(combat.basic(e)){const stats=M.activeStats(state),weapon=M.weaponStats(state);combatTimers.attackCooldown=(weapon.cd??.4)/Math.max(.2,1+stats.haste);const volt=weapon.shot==='volt';world.playerAttack(weapon.kind,volt?'#bfefff':undefined);tone(volt?'zap':weapon.kind==='gun'?'shoot':weapon.kind==='sword'?'swing':'punch');emitAction({kind:'basic',targetId:e?.id});}
}
world.onAttackEnemy=basicAttack;
/** The tooltip and long-press tip of skill slot i, with the numbers at the current level (skill-info.ts). */
function currentSkillTip(i:number){const disguise=state.gear.disguise,weapon=M.weaponStats(state);return skillTip(skillList()[i],i,{special:weapon.special??'fist',weaponKind:weapon.kind,level:disguise?0:M.skillLevel(state,i),disguise});}
const readyWas=[0,0,0,0];
// Long-press a skill button (phones have no hover): its tip shows for a few seconds and the press does not cast.
{let hide=0;const tipEl=document.createElement('div');tipEl.id='skill-tip';tipEl.hidden=true;tipEl.setAttribute('role','status');document.body.append(tipEl);
  document.querySelectorAll<HTMLButtonElement>('.skill').forEach((button,i)=>{
    mountLongPress(button,()=>{tipEl.textContent=currentSkillTip(i);tipEl.hidden=false;clearTimeout(hide);hide=window.setTimeout(()=>{tipEl.hidden=true;},3500);},()=>started&&!document.hidden&&!uiBlocked());});}
function skillList(){const disguise=state.gear.disguise?M.DISGUISES[state.gear.disguise]:null;return disguise?.skills??[...BASE_SKILLS,SPECIALS[M.weaponStats(state).special??'fist']??SPECIALS.fist];}
function skill(index:number){
  if(!started||uiBlocked()||visiting||cooldowns[index]>0||index<0||index>3)return;
  prepareCombatWeapon();
  const disguise=state.gear.disguise,weapon=M.weaponStats(state),skills=skillList();
  if(!(disguise?combat.disguise(disguise,index):combat.skill(index,weapon.special??'fist')))return;
  skillDurations[index]=M.skillCooldown(state,index,skills[index].cd,!!disguise)/Math.max(.2,1+M.activeStats(state).haste);cooldowns[index]=skillDurations[index];
  if(!actionHandler)change(()=>recordEvent(state,'skill'));if(!disguise&&index===0)world.spinT=2.2;else if(disguise?(disguise==='dz_knight'&&index===1)||(disguise==='dz_aodai_man'&&index===2):index===1)world.fx?.burst(world.position,{n:10,color:'#f3e2bd',size:.14,speed:3,up:2,y:.1});tone(skillSound(index,disguise,weapon.special));emitAction({kind:'skill',index,special:disguise??weapon.special});
}
let dying=false;
function checkDefeat(){if(!started||state.hp>0||dying)return false;if(actionHandler){dying=true;void perform('die',{x:world.position.x,z:world.position.z}).then(()=>{dying=false;endFishing();resetCombat();rebuildHomePresentation('home');world.refreshPlayer();toast('You are safe at home.','🏡');});return true;}endFishing();resetCombat();change(()=>M.die(state,world.position.x,world.position.z));rebuildHomePresentation('home');world.refreshPlayer();openDialog('death','A little rest, then try again',`<div class="grow-illustration">🌷</div><p class="center">You’re safe at home. Your level, energy, and equipped gear are safe too.</p><p class="center muted">${state.dropped?'Your loose items are waiting where you fell.':'Nothing was dropped.'}</p><button class="primary wide" data-action="close">Back on my feet →</button>`,'EVERY EXPLORER TAKES A TUMBLE');return true;}
world.onDamage=(amount,source='melee',enemyId)=>{
  if(actionHandler){if(enemyId&&network.role==='host')network.reportDamage?.(enemyId,source);return;}
  if(combatTimers.invulnerable>0||combat.invulnerable||(source==='melee'&&(combat.statuses.flight??0)>0)||!started||(!network.role&&uiBlocked())||visiting)return;
  const defense=M.activeStats(state).defense+combat.defenseBonus+(combat.statuses.armor>0?80:0),damage=Math.max(1,Math.round(amount*60/(defense+60)));
  if(fishGame)endFishing('The fish got away when you were hit.');
  state.hp=Math.max(0,state.hp-damage);combatTimers.invulnerable=.55;world.hurtFeedback(damage);tone('hurt');vibrate(60);$('#damage-flash').classList.add('active');setTimeout(()=>$('#damage-flash').classList.remove('active'),160);
  checkDefeat();
  updateHud();
};
world.onHazardEnemy=(enemy,damage)=>hit(enemy,damage,0,undefined,true,true);
world.onEnvironmentEvent=event=>{if(event.message)toast(event.message,'🌍');save();updateHud();};
function resetCombat(){combat.reset();combatTimers.reset();combatView.clear();skillFx.clear();world.movementLocked=false;world.playerFlying=false;world.playerStealth=false;}

function rebuildHomePresentation(planet:M.PlanetId){
  const shared=network.role&&world.planet===planet, enemies=shared?world.enemySnapshots():null,environment=shared?world.environmentSnapshot():null;
  world.build(planet);if(enemies)world.applyEnemySnapshots(enemies);if(environment)world.applyEnvironmentSnapshot(environment);
}
const sharedKills=new Set<string>();
export const gameBridge:GameBridge={
  getState:()=>state,getWorld:()=>world,
  getPresence:()=>({y:house.poseY(world.position.y),x:world.position.x,z:world.position.z,facing:world.facing,planet:world.planet,name:state.name,color:state.color,level:state.level,hp:state.hp,maxHp:M.maxHp(state),gear:state.gear,moving:world.moving,visible:!document.hidden,visual:world.visualSnapshot(),dog:(()=>{const dog=world.ownDog?.();return dog!==null&&dog!==undefined&&dogFollows(world.planet,world.position,!!world.interior)?dog:null;})()}),
  getOfflineState:()=>{try{return M.parseSave(localStorage.getItem(activeKey()));}catch{return null;}},
  applyState(next){fishingEpoch++;mysteryCaller=newMysteryCaller();fishingView.dropMystery();if(flight)exitSpace();shipSequence?.reset();arriving=false;autopilotTarget=null;homeQueued=false;state=next;applyMovePad();const nameInput=document.querySelector<HTMLInputElement>('#name-input');if(nameInput)nameInput.value=state.name;visiting=null;visitHome=null;world.state=state;resetCombat();world.build(state.planet);world.refreshPlayer();if(modal==='bag')inventory();else if(modal==='quests')quests();else if(modal)closeDialog();updateHud();updateLabels();},
  setPersistence(handler){persistence=handler;},
  setActionHandler(handler){actionHandler=handler;world.authoritativeAction=handler?intent=>handler(intent).then(reply=>reply.result):undefined;},
  applyAuthoritativeState(next){
    const planetChanged=next.planet!==state.planet,wasDead=state.hp<=0;const heldRod=M.ITEMS[state.gear.weapon??'']?.weapon?.kind==='rod'?state.gear.weapon:undefined;const previousGear=JSON.stringify(state.gear),wasFishing=!!world.fishing&&world.fishing!=='idle',plotsChanged=next.plots.length!==state.plots.length,decorChanged=JSON.stringify(next.decorations)!==JSON.stringify(state.decorations);
    const beforeLevel=state.level;const current=state as unknown as Record<string,unknown>;for(const key of Object.keys(current))if(!Object.hasOwn(next,key))delete current[key];Object.assign(state,next);if(wasFishing&&!planetChanged){const rod=contextGear.forFishing(state);if(rod)state.gear.weapon=rod;}else if(!planetChanged&&gearWater&&heldRod&&(state.bag[heldRod]??0)>0)state.gear.weapon=heldRod;const gearChanged=JSON.stringify(state.gear)!==previousGear;levelCheck(beforeLevel);if(planetChanged){visiting=null;visitHome=null;world.state=state;endFishing();resetCombat();world.build(state.planet);world.refreshPlayer();if(wasDead)toast('You are safe at home.','🏡');}if(!visiting){world.state=state;if(plotsChanged){const position=world.position.clone();rebuildHomePresentation(state.planet);world.position.copy(position);}else{world.syncCrops();if(decorChanged)world.syncDecorations();}if(gearChanged)world.refreshPlayer();world.syncDropped();}
    updateHud();updateLabels();
  },
  spawnNetworkDrop,removeNetworkDrop,releaseNetworkDrop(id){for(const meta of networkDrops.values())if(meta.drop.id===id)meta.drop.releaseAt=0;},clearNetworkDrops(){networkDrops.clear();drops.clear();},
  applyAuthorityHealth(delta,died){if(delta<0){world.hurtFeedback(-delta);tone('hurt');if(fishGame)endFishing('The fish got away when you were hit.');}if(died){visiting=null;visitHome=null;world.state=state;endFishing();resetCombat();world.build(state.planet);world.refreshPlayer();closeDialog();toast('You are safe at home.','🏡');}updateHud();},
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
      if(home.name)visitHome.name=home.name;if(home.discovered)visitHome.discovered=[...home.discovered];visitHome.plots=structuredClone(home.plots??visitHome.plots);visitHome.decorations=structuredClone(home.decorations??visitHome.decorations);visitHome.farm=M.parseFarm((home as {farm?:unknown}).farm);visitHome.helper=M.parseHelper((home as {helper?:unknown}).helper);Object.assign(visitHome,{friends:structuredClone((home as {friends?:unknown}).friends??[])});
      if(expanded){const position=world.position.clone();rebuildHomePresentation('home');world.position.copy(position);world.refreshPlayer();}
      else{world.syncCrops();if(decorChanged)world.syncDecorations();}
      updateLabels();return;
    }
    visiting=owner;resetCombat();closeDialog();
    if(owner&&home){visitHome={...structuredClone(state),name:home.name??state.name,planet:'home',discovered:[...(home.discovered??['home'])],plots:structuredClone(home.plots??state.plots),decorations:structuredClone(home.decorations??[]),farm:M.parseFarm((home as {farm?:unknown}).farm),helper:M.parseHelper((home as {helper?:unknown}).helper),friends:M.parseFriends((home as {friends?:unknown}).friends),bosses:M.parseBosses((home as {bosses?:unknown}).bosses),house:parseHouse((home as {house?:unknown}).house)};world.state=visitHome;rebuildHomePresentation('home');}
    else{visitHome=null;world.state=state;rebuildHomePresentation(state.planet);}
    world.refreshPlayer();$('#visit-banner').hidden=!owner;$('#visit-banner').textContent=t(owner?t('Visiting {owner} · look around their garden',{owner}):'');updateLabels();
  },
  showNotice:message=>toast(message),
  botHit:(id,damage)=>{const e=world.enemies.find(x=>x.id===id);if(!botActive()||visiting||!e||e.hp<=0||!Number.isFinite(damage)||damage<=0)return;world.damageEnemy(e,damage,0,false);},
  ownsItem:id=>(state.bag[id]||0)>0||(state.chest[id]||0)>0||Object.values(state.gear).includes(id),
  grantGift:gift=>{
    if(!started||!Number.isFinite(gift.energy)||gift.energy<0)return false;
    if(gift.item&&gift.count>0&&!M.addItem(state,gift.item,gift.count))return false;
    state.energy+=gift.energy;tone('level');save();updateLabels();return true;
  },
  botContext:()=>({active:botActive(),ready:botActive()&&!visiting&&!fishGame}),
  onFrame(listener){frameListeners.add(listener);return()=>frameListeners.delete(listener);},
  onAction(listener){actionListeners.add(listener);return()=>actionListeners.delete(listener);},
};

function go(kind:string){closeDialog();const entities=world.entities.filter(e=>e.kind===kind);const entity=kind==='plot'?entities.find(e=>!world.state.plots[e.index!]?.crop)||entities[0]:entities[0];if(entity){world.select(entity);toast(`Off to ${kind==='plot'?'the garden':entity.name.toLowerCase()}…`,'👣');}else toast('That place is back in Clover Village.','🏡');}
// ---- The starship: take-off, a piloted flight between planets, and landing ----
const SCENERY_KITS={scenery:sceneryKit,wilds:wildsKit,bright:brightKit,harsh:harshKit,dressing:dressingKit};
shipSequence=new ShipSequence(world,tone);const ship=shipSequence;
const spaceView=new SpaceView($('#space-labels'),spaceKit);
const spaceKeys=new Set<string>(),boostPointers=new Set<number>();let spacePointer:{pointerId:number;x:number;y:number}|null=null,boostHeld=false;
const prefetch=(id:M.PlanetId)=>{for(const name of kitsFor(id))void SCENERY_KITS[name].load();};
function leaveWorld(){if(house.inside)house.house.leave();/* the globe's Fly here starts indoors */closeDialog();resetCombat();cancelPlacement();endFishing();world.destination=null;world.route=[];world.selected=null;world.marker.visible=false;world.ring.visible=false;movement.clear();}
async function launch(){
  if(ship.busy||flight||arriving||launchPending)return;launchPending=true;const launchingState=state;
  try{
    const paid=await perform('launch');if(state!==launchingState)return;
    if(!paid){toast(`The starship needs ϟ ${M.LAUNCH_COST} energy to fill its tank.`,'⛽');return;}
    leaveWorld();toast('Lift-off in three, two, one…','🚀');
    ship.launch(()=>warp(()=>{if(state===launchingState)enterSpace();}));
  }finally{launchPending=false;}
}
/** Star-map pick: pay the launch as usual, then the autopilot flies to the planet and lands. */
let autopilotTarget:M.PlanetId|null=null;
async function flyTo(id:M.PlanetId){
  if(ship.busy||flight||arriving||launchPending)return;const r=starRoutes().find(r=>r.id===id);if(!r||r.lock)return;
  autopilotTarget=id;await launch();if(!ship.busy)autopilotTarget=null;
}
/** A quick trip home with the starship, without piloting: the old free ride back. */
/** Set when "return home" is pressed while the ship is still coming down: it takes off again once landed. */
let homeQueued=false;
function flyHome(){if(ship.phase==='land'||arriving){if(!homeQueued){homeQueued=true;toast('Heading home once we land…','🚀');}return;}if(ship.busy||flight||launchPending)return;leaveWorld();ship.launch(()=>void arrive('home'));}
function warp(then:()=>void){const flash=$('#warp-flash');flash.classList.add('show');setTimeout(()=>{then();setTimeout(()=>flash.classList.remove('show'),150);},600);}
function enterSpace(){
  flight=new SpaceFlight(state.planet,state.discovered);flight.setAutopilot(autopilotTarget);autopilotTarget=null;spaceView.build(flight,graphics.level==='low');
  $('#hud').hidden=true;$('#world-labels').hidden=true;$('#space-hud').hidden=false;
  if(flight.autopilot){const p=M.PLANETS[flight.autopilot.id];spaceHint(t('🧭 Autopilot to {planet}: sit back, or press Skip.',{planet:`${p.icon} ${t(p.name)}`}),5);}else spaceHint(matchMedia('(pointer: coarse)').matches?t('Hold anywhere to steer toward your finger · hold {boost} to speed up · fly close to a planet to land',{boost:`<b>${t('Boost')}</b>`}):t('Hold the mouse to steer (or {keys}) · {shift} boosts · fly close to a planet to land',{keys:'<kbd>W</kbd> <kbd>A</kbd> <kbd>D</kbd>',shift:'<kbd>Shift</kbd>'}),5);tone('cast');
}
function exitSpace(){flight=null;spaceView.hideLabels();clearHeldInput();$('#space-hud').hidden=true;$('#hud').hidden=false;$('#world-labels').hidden=false;}
let hintTimer=0;
function spaceHint(html:string,seconds=5){const hint=$('#space-hint');hint.innerHTML=localizeHtml(html);hint.classList.add('show');clearTimeout(hintTimer);hintTimer=window.setTimeout(()=>hint.classList.remove('show'),seconds*1000);}
function spaceFloat(html:string){const el=document.createElement('div');el.className='space-float';el.innerHTML=localizeHtml(html);$('#space-floats').append(el);setTimeout(()=>el.remove(),1600);}
function tryLanding(){
  if(!flight||flight.landing)return;if(flight.autopilot){flight.skipAutopilot();prefetch(flight.landing!.planet.id);tone('crit');return;}
  const over=flight.over;if(!over){spaceHint('Fly over a planet to land on it.',2);return;}
  if(!flight.land(id=>M.canLand(state,id))){const p=M.PLANETS[over.id];spaceHint(`🔒 The air on ${t(p.name)} is too rough. You need <b>level ${p.level}</b> to land.`,3);tone('hurt');return;}
  prefetch(over.id);tone('crit');$('#land-button').hidden=true;
}
async function onSpaceEvent(event:SpaceEvent){
  switch(event.kind){
    case 'boost':tone('swing');break;
    case 'bump':spaceView.shake=.5;tone('hit');break;
    case 'empty':spaceHint('⛽ Out of fuel! The starship can only crawl. Collect <b>stardust</b> ✨ to refuel.',5);break;
    case 'edge':spaceHint('🌌 This is the edge of the universe. Time to turn back!',3);break;
    case 'dust':{const journey=flight,reward=await perform<{shard:boolean;nextDust?:{id:number;x:number;z:number}}>('collectStardust',{position:journey?{x:journey.x,z:journey.z}:undefined,dustId:event.id});if(!reward)break;if(journey&&flight===journey&&reward.nextDust){const dust=journey.layout.dust.find(d=>d.id===reward.nextDust!.id);if(dust)Object.assign(dust,reward.nextDust);}spaceFloat(`✨ +14 fuel · +3 ϟ${reward.shard?' · 🌟 Star shard!':''}`);tone(reward.shard?'level':'coin');break;}
    case 'discover':{if(!await perform('discover',{id:event.planet,position:flight?{x:flight.x,z:flight.z}:undefined}))break;prefetch(event.planet);const p=M.PLANETS[event.planet];
      spaceHint(`🔭 New planet discovered: <b>${p.icon} ${t(p.name)}</b><br><small>Bosses: ${p.bosses.map(b=>t(ENEMY_TYPES[b]?.name)??b).join(', ')} · landing from level ${p.level}</small>`,6);tone('level');break;}
    case 'landed':void arrive(event.planet);break;
  }
}
/** Swaps worlds behind a flash, then brings the starship down onto the new pad. */
async function arrive(id:M.PlanetId){
  if(arriving)return;arriving=true;const arrivingState=state,journey=flight;
  const flash=$('#warp-flash');flash.classList.add('show');
  await new Promise(resolve=>setTimeout(resolve,600));
  try{
    if(state!==arrivingState)return;
    const arrived=await perform<{cleansed?:number}|boolean>(id==='home'?'returnHome':'travel',{id});if(state!==arrivingState)return;
    if(!arrived){homeQueued=false;if(journey&&flight===journey){journey.landing=null;journey.autopilot=null;}else ship.reset();return;}
    await Promise.race([Promise.all(kitsFor(id).map(name=>SCENERY_KITS[name].load())),new Promise(resolve=>setTimeout(resolve,2500))]);
    if(state!==arrivingState)return;
    if(flight)exitSpace();
    ship.reset();world.build(id);world.refreshPlayer();world.applyRefinedAssets();updateLabels();settle();
    // Compile the new world's shaders in the background, so the first frames after landing don't hitch.
    void world.renderer.compileAsync(world.scene,world.camera).catch(()=>{});
    const p=M.PLANETS[id];
    ship.land(()=>{showZone(id==='home'?'Clover Village':t(p.name));floating(`${p.icon} ${t(p.name)}`,world.position.x,world.position.z,'level',1);toast(id==='home'?'Home, sweet home!':t('Welcome to {planet}! Watch out for its creatures.',{planet:t(p.name)}),p.icon);
      if(typeof arrived==='object'&&arrived.cleansed)cleansedFx();if(homeQueued){homeQueued=false;if(state.planet!=='home')flyHome();}});
  }finally{if(state===arrivingState){arriving=false;setTimeout(()=>flash.classList.remove('show'),150);}else{homeQueued=false;flash.classList.remove('show');}}
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
$('#world').addEventListener('pointerdown',event=>{if(!flight||arriving||spacePointer||event.button!==0)return;event.preventDefault();spacePointer={pointerId:event.pointerId,x:event.clientX,y:event.clientY};$('#world').setPointerCapture(event.pointerId);});
addEventListener('pointermove',event=>{if(flight&&spacePointer?.pointerId===event.pointerId)spacePointer={pointerId:event.pointerId,x:event.clientX,y:event.clientY};});
// Steering and Boost belong to their own fingers; releasing either must leave the other held.
for(const type of ['pointerup','pointercancel','lostpointercapture'] as const)addEventListener(type,event=>{if(spacePointer?.pointerId===event.pointerId)spacePointer=null;boostPointers.delete(event.pointerId);boostHeld=boostPointers.size>0;});
const boostButton=$('#boost-button');
boostButton.addEventListener('pointerdown',event=>{if(!flight||arriving||event.button!==0)return;event.stopPropagation();event.preventDefault();boostPointers.add(event.pointerId);boostHeld=true;boostButton.setPointerCapture(event.pointerId);});
app.addEventListener('click',async event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
  // A clicked HUD button gives up focus, so Space and other shortcuts cannot press it again.
  if((event as MouseEvent).detail>0&&button.closest('#hud,#world-labels'))button.blur();
  const action=button.dataset.action,id=button.dataset.item as M.ItemId,index=Number(button.dataset.index);if(action!=='reel')tone();
  // Any other menu action (another item, a tab, buying, equipping) ends the try-on first.
  if(tryingOn&&action!=='try-on')endTryOn();
  if(action!=='quick-eat-pick'&&action!=='quick-eat-choose')quickEatMenu(false);
  switch(action){
    case 'start':start();break;case 'discovery':planets();break;
    case 'color':await perform('settings',{color:button.dataset.color!});document.querySelectorAll<HTMLButtonElement>('.color-picker button').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});world.refreshPlayer();break;
    case 'forge-menu':forgeMenu(id);break;
    case 'craft-back':crafting();break;
    case 'forge':{button.disabled=true;const result=await perform<M.ForgeOutcome>('forge',{id});if(result){toast(result.success?t('Forged to +{level}!',{level:result.level}):'The forge attempt failed. Your weapon kept its level.',result.success?'✨':'🔨');tone(result.success?'level':'pop');}forgeMenu(id);break;}
    case 'drop-item':{if(actionHandler)await perform('dropItem',{id,count:1});else if(M.looseQuantity(state,id)>0){change(()=>M.removeItem(state.bag,id));drops.spawn(id,1,world.position.x,world.position.z,{thrown:true,dir:world.facing});}inventory();break;}
    case 'close':closeDialog();break;case 'bag':bagMode='bag';inventory();break;case 'inspect':if(id){selectedItem=id;inventory();}break;case 'quests':quests();break;case 'map':map();break;case 'settings':settings();break;case 'keys-guide':keysGuide.toggle();updateHud();break;case 'trackers':trackerMode=$('.tracker-stack').classList.contains('folded')?'open':'fold';updateHud();break;case 'help':help();break;
    case 'claim':if(await perform('claimQuest')){tone('success');toast('A little milestone. A lovely reward!','🎁');if(modal)quests();}break;
    case 'plant':{const i=activePlot,opened=modal,root=world.root,taken=state.plots[i]?.crop;if(taken){toast(t('This bed already grows {crop}.',{crop:t(M.CROPS[taken].name)}),'🌱');refreshPlot();break;}if(await perform('plant',{index:i,id})&&world.root===root&&!visiting){plantBurst(i);tone('pop');world.syncCrops();if(modal===opened&&activePlot===i)closeDialog();toast(`${t(M.CROPS[id as M.CropId].name)} planted. Let the sunshine do its thing.`,'🌱');}break;}
    case 'cook-everything':{let made=0;for(const id of M.pantryIds(state).filter(id=>M.ITEMS['cooked_'+id])){const n=M.pantry(state,id);if(n>0&&await perform('cook',{id,count:n}))made+=n;}if(made){tone('success');toast(t('Cooked {count} meals. Enjoy!',{count:made}),'🍲');}cooking();break;}
    // Open panels can be out of date: a helper may have used the last one meanwhile. Then the panel just catches up.
    case 'cook-one':case 'cook-all':if(M.pantry(state,id)<1){cooking();break;}if(await perform('cook',{id,count:action==='cook-all'?M.pantry(state,id):1})){tone('success');cooking();}break;
    // Reference: a fertilizer that ripens the crop closes the panel; one that only speeds it up refreshes it.
    case 'fertilize-manure':case 'fertilize':{const i=activePlot,opened=modal,root=world.root,generation=state.plots[i]?.generation;
      // The panel stays open while the crop ripens (refreshPlot leaves a ripe bed alone): nothing left to speed up.
      if(state.plots[i]?.crop&&M.cropProgress(state.plots[i])>=1){if(modal===opened)closeDialog();toast('Ready to harvest!','🌿');break;}
      if(await perform('fertilize',{index:i,id:action==='fertilize'?'spore':'manure'})&&world.root===root&&!visiting){world.syncCrops();const p=state.plots[i];if(!p?.crop||p.generation!==generation)break;const active=modal===opened&&activePlot===i;if(M.cropProgress(p)>=1){if(active)closeDialog();toast('Ready to harvest!','🌿');}else{if(active)plotDialog(i);toast('Your crop will be ready sooner.','🌿');}}break;}
    case 'expand':buyPlot();break;
    case 'helper':helperDialog();break;
    case 'helper-buy':{const r=await perform('buyHelper');if(r==='bought'){tone('coin');helperView.reset();toast('Bolt joins your garden! It will tend the beds by itself.','🤖');}else if(r==='energy')toast(`You need ${Helper.HELPER_COST} energy to hire Bolt.`,'ϟ');else if(r==='away')toast('Garden beds belong at home. Return to your garden first.','🏡');helperDialog();break;}
    case 'helper-pause':if(state.helper)await perform('setHelperPaused',{paused:!state.helper!.paused});helperDialog();break;
    case 'helper-seed':await perform('setHelperSeed',{id});helperDialog();break;
    case 'helper-all-beds':if(await perform('clearBedChoices')!==undefined&&state.helper&&state.helper.seed!=='same')toast(t('Bolt now plants {crop} in every bed.',{crop:t(M.CROPS[state.helper.seed].name)}),'🤖');helperDialog();break;
    case 'auto-plant':{if(visiting)break;await perform('setAutoPlant',{on:!autoPlantSwitch(state)});if(modal==='helper')helperDialog();else if(modal==='friend'&&button.dataset.kind)friendDialog(button.dataset.kind as FriendId);else refreshPlot();break;}
    case 'farm-helper':farmHelperDialog();break;
    case 'farm-helper-buy':await farmHelperSetting('buyFarmHelper');break;
    case 'farm-helper-pause':await farmHelperSetting('setFarmHelperPaused',{paused:!FarmHelper.helperOf(state).paused});break;
    case 'farm-helper-feed':await farmHelperSetting('setFarmHelperAutoFeed',{autoFeed:!FarmHelper.helperOf(state).autoFeed});break;
    case 'farm-restock-upgrade':await farmHelperSetting('upgradeFarmRestock');break;
    case 'farm-restock-toggle':await farmHelperSetting('setFarmRestock',{on:!Restock.restockOf(state)?.on});break;
    case 'farm-restock-keep':{const steps=Restock.RESTOCK_KEEP_STEPS,i=steps.indexOf((Restock.restockOf(state)?.keep??250) as typeof steps[number]);await farmHelperSetting('setFarmRestock',{keep:steps[(i+1)%steps.length]});break;}
    case 'confirm-place':confirmPlacement();break;
    case 'upgrade-bed':{const i=activePlot,cost=M.bedUpgradeCost(state,M.bedLevel(state.plots[i]));if(state.energy<cost){toast(`You need ${cost} energy to upgrade this bed.`,'ϟ');break;}if(await perform('upgradeBed',{index:i})){const level=M.bedLevel(state.plots[i]),p=M.bedPosition(state,i);world.syncCrops();world.fx?.burst({x:p.x,z:p.z},{n:14,color:['#ffd84d','#fff3a8'],glow:true,speed:2.5,up:4,y:.3});tone('success');toast(t('Bed upgraded to level {level}: −{percent}% grow time ({ratio}× harvests).',{level,percent:Math.round((1-1/M.bedSpeedUp(level))*100),ratio:M.bedSpeedUp(level)}),'⭐');plotDialog(i);}break;}
    case 'store-bed':{const i=activePlot;if(await perform('storeBed',{index:i})){closeDialog();world.dropPlotsFrom(i);tone('poof');toast('The bed is packed away. It is in your bag as a garden bed kit.','🎒');}break;}
    case 'shop-tab':shopTab=button.dataset.kind!;shop();break;
    case 'toggle-group':{const shut=IG.toggleFold(button.dataset.panel??'',button.dataset.group??''),section=button.closest('.item-group');button.setAttribute('aria-expanded',String(!shut));section?.classList.toggle('folded',shut);break;}
    case 'journal-tab':journalTab=button.dataset.kind as ProgressKind;quests();break;
    case 'start-challenge':if(await perform('startChallenge',{kind:button.dataset.kind})){quests();toast('Quick challenge started!','⏱️');}break;
    case 'reroll-daily':await perform('rerollDaily',{index});quests();break;
    case 'progress-claim':if(await perform('claimProgress',{kind:button.dataset.kind,id:button.dataset.id})){tone('success');toast('Reward collected.','🎁');}quests();break;
    case 'plant-all':{const empty=state.plots.map((p,i)=>p.crop?-1:i).filter(i=>i>=0);const count=await perform('plantAll',{id});if(count===undefined)break;empty.filter(i=>state.plots[i]?.crop).slice(0,12).forEach(i=>plantBurst(i));if(count)tone('pop');world.syncCrops();closeDialog();toast(`Planted ${count} garden beds.`,'🌱');break;}
    case 'harvest-all':{const ready=state.plots.map((p,i)=>p.crop&&M.cropProgress(p)>=1?[i,p.crop] as const:null).filter(Boolean) as (readonly [number,M.CropId])[];const count=await perform('harvestAll');if(count===undefined)break;ready.slice(0,12).forEach(([i,crop])=>harvestBurst(i,crop));world.syncCrops();closeDialog();toast(`Harvested ${typeof count==='number'?count:Array.isArray(count)?count.length:0} crops.`,'🌾');break;}
    case 'unequip':{if(await perform('unequip',{slot:button.dataset.slot})&&button.dataset.slot==='weapon')contextGear.holdFists(state);world.refreshPlayer();save();inventory();break;}
    case 'craft-tab':craftTab=button.dataset.kind!;crafting();break;
    case 'decorations':decorations();break;
    case 'decor-shop':shopTab='Decor';shop();break;
    case 'place-decor':beginPlacement(id);break;
    case 'cancel-decor':cancelPlacement();break;
    case 'rotate-decor':rotatePlacement();break;
    case 'remove-decor':if(await perform('removeDecoration',{uid:button.dataset.id})){world.syncDecorations();decorations();}break;
    case 'buy':if(await perform('buy',{id})){
      // Gear goes straight onto the explorer, like picking up a fishing rod.
      if(M.ITEMS[id].slot&&!autoHeld(id)&&await perform('equip',{id}))equipFeedback(id);else{floating(`+ ${t(M.ITEMS[id].name)}`,world.position.x,world.position.z,'item');tone('success');}
      shop();}break;
    case 'equip':if(await perform('equip',{id})){equipFeedback(id);if(modal==='shop')shop();else inventory();}break;
    case 'eat':await eatFood(id);inventory();break;
    case 'quick-eat':await quickEat();break;
    case 'quick-eat-pick':quickEatMenu($('#quick-eat-menu').hidden);break;
    case 'quick-eat-choose':quickEatChoice=id as FoodChoice;try{localStorage.setItem(QUICK_EAT_KEY,quickEatChoice);}catch{}quickEatMenu(false);updateQuickEat();break;
    case 'try-on':tryOn(id);break;
    case 'sell-one':case 'sell-all':{if(M.looseQuantity(state,id)<1){market();break;}const n=action==='sell-all'?M.looseQuantity(state,id):1;const value=await perform('sell',{id,count:n});if(value){tone('success');toast(`Sold for ${value} energy. Thank you, neighbor!`,'ϟ');}market();break;}
    case 'cook-sell-produce':{const value=await perform<number>('cookSellProduce');if(value){tone('success');floating(`+${value} ϟ`);toast(t('Cooked and sold everything for {amount} energy.',{amount:value}),'🔥');}market();break;}
    case 'sell-produce':{const chest=produceLots(state).fromChest,value=await perform('sellProduce');if(value){tone('success');floating(`+${value} ϟ`);toast(t('Sold all your produce for {amount} energy. Thank you, neighbor!',{amount:value})+(chest?' '+t('{count} from the chest',{count:chest})+'.':''),'ϟ');}market();break;}
    // A tap moves the whole stack, like the reference's chest (equipped gear stays in the backpack).
    case 'transfer':{const store=button.dataset.direction==='store',n=store?M.looseQuantity(state,id):state.chest[id]??0;if(n<1){storage();break;}await perform('transfer',{id,count:n,toChest:store});tone('click');storage();break;}
    case 'take-all':{const r=await perform<{count:number}>('takeChest');if(r?.count){tone('click');toast(t('Took {count} items from the chest.',{count:r.count}),'📦');}storage();break;}
    case 'upgrade':{const kind=button.dataset.kind as keyof typeof M.UPGRADES;if(await perform('upgrade',{kind})){upgradeFeedback(kind);upgrades();tone('success');}break;}
    case 'craft':if(await perform('craft',{index})){crafting();toast('Made with your own two hands. Check your backpack!','🔨');}break;
    case 'launch':launch();break;case 'land':case 'autopilot-skip':tryLanding();break;case 'fly-to':flyTo(button.dataset.kind as M.PlanetId);break;
    case 'go':go(button.dataset.kind!);break;
    case 'wild':{closeDialog();const destinations:Record<string,[number,number]>={forest:[-30,0],meadow:[0,30],swamp:[0,-30],canyon:[30,0]};const destination=destinations[button.dataset.kind??'forest']??[0,-30];world.walkTo(destination[0],destination[1]);toast('Follow the path beyond the garden gate.','🍄');break;}
    case 'return-home':if(state.planet!=='home')flyHome();else{endFishing();huntingPending=null;movement.clear();closeDialog();world.position.set(0,0,0);world.destination=null;world.route=[];world.selected=null;world.pondTap=null;updateHunting(0);toast('Home, sweet home.','🏡');}break;
    case 'interact':world.interactNearest();break;case 'attack':basicAttack();break;case 'skill':skill(index);break;
    case 'fish-again':fish(fishPond);break;
    case 'reel':if(fishGame){if(event.detail===0)fishGame.input.toggle();}else if(button.classList.contains('hunt'))void throwHarpoon();else if(button.classList.contains('cast'))fish(fishPond);break;
    case 'keyboard-layout':movement.clear();await perform('settings',{settings:{keyboardLayout:button.dataset.kind}});movement.clear();settings();break;
    case 'move-pad':await perform('settings',{settings:{movePad:!joystickEnabled()}});applyMovePad();settings();break;
    case 'joystick-side':await perform('settings',{settings:{joystickSide:button.dataset.kind}});applyMovePad();settings();break;
    case 'neighbours':setNeighboursOn(!neighboursOn());settings();break;
    case 'vibrate':await perform('settings',{settings:{vibrate:!audioOf(state.settings).vibrate}});settings();if(audioOf(state.settings).vibrate)vibrate(40);break;
    case 'difficulty':{const d=button.dataset.kind,from=M.difficultyOf(state);if(!M.isDifficulty(d)||d===from){settings();break;}
      // Raising is free; lowering asks first and works once a day (difficulty.ts LOWER_COOLDOWN_MS).
      if(M.isLowering(from,d)){const wait=M.lowerReadyAt(state)-Date.now();if(wait>0){toast(t('You can lower the difficulty again in {hours} h.',{hours:Math.ceil(wait/3_600_000)}),'⏳');break;}
        if(!button.dataset.sure){openDialog('difficulty-confirm','Lower the difficulty?',`<p class="intro">${esc(t('Switch to {level}? You can lower the difficulty only once a day; raising it is always free. Crops already planted keep their value.',{level:t(M.DIFFICULTY_LABEL[d])}))}</p><div class="button-row"><button class="soft-button" data-action="settings">${esc(t('Keep {level}',{level:t(M.DIFFICULTY_LABEL[from])}))}</button><button class="primary" data-action="difficulty" data-kind="${d}" data-sure="1">${esc(t('Lower to {level}',{level:t(M.DIFFICULTY_LABEL[d])}))}</button></div>`,'SETTINGS','⚖️');break;}}
      await perform('settings',{settings:{difficulty:d}});settings();break;}
    case 'tester-apply':await testerApply();break;case 'tester-shop':testerShop();break;
    case 'tester-craft':{const r=M.RECIPES[index];if(r&&testerDo(s=>Tester.testerCraft(s,index)))toast(t(M.ITEMS[r.result].name),M.ITEMS[r.result].icon);crafting();break;}
    case 'tester-cook':if(id&&testerDo(s=>Tester.testerCook(s,id)))toast(t(M.ITEMS[id].name),M.ITEMS[id].icon);cooking();break;
    case 'tester-forge':if(id&&testerDo(s=>Tester.testerForgeMax(s,id)))toast(t('Forged to +{level}!',{level:Tester.MAX_FORGE_LEVEL}),'✨');forgeMenu(id);break;
    case 'tester-buy':if(id&&testerDo(s=>Tester.testerBuy(s,id)))toast(t(M.ITEMS[id].name),M.ITEMS[id].icon);if(modal==='shop')shop();else testerShop();break;
    case 'tester-friend':if(id&&testerDo(s=>Tester.testerFriend(s,id as FriendId)))toast(t('{name} is home!',{name:t(FRIENDS[id as FriendId].name)}),'🏡');testerShop();break;
    case 'tester-planets':if(!button.dataset.sure){button.dataset.sure='1';button.textContent=t('Tap again to confirm');break;}if(testerDo(Tester.testerPlanets))toast(t('All planets unlocked'),'🪐');testerShop();break;
    case 'tester-exit':if(testerDo(Tester.exitTester)){toast(t('Tester mode is off. Your energy stays.'),'🧪');settings();}break;
    case 'tester-level':if(!button.dataset.sure){button.dataset.sure='1';button.textContent=t('Tap again to confirm');break;}if(testerDo(Tester.testerMaxLevel))world.refreshPlayer();testerShop();break;
    case 'place-beds':await perform('settings',{settings:{placeBeds:!state.settings.placeBeds}});settings();break;
    case 'collect-farm':collectFarm();break;
    case 'pen-menu':penDialog();break;
    case 'collect-animal':collectFarm(Number(button.dataset.id));break;
    case 'build-species-pen':if(await perform('buildSpeciesPen',{kind:button.dataset.kind})){tone('success');penDialog();}break;
    case 'buy-animal':buyAnimal(button.dataset.kind as M.AnimalKind);break;
    case 'feed-animal':{const choice=chosenFeed(state),target=M.farmOf(state).animals.find(a=>a.uid===Number(button.dataset.id));if(choice&&target&&!button.dataset.sure&&M.feedLoses(state,choice,target)){feedConfirm(choice,'feed-animal',button.dataset.id);break;}const crop=await perform('feedAnimal',{uid:Number(button.dataset.id),...(choice?{id:choice}:{})});if(crop){tone('pop');feedBurst(Number(button.dataset.id));toast(`Fed a ${t(M.ITEMS[crop].name).toLowerCase()}. It will be quicker now.`,M.ITEMS[crop].icon);}penDialog();break;}
    case 'feed-all':{const pick=chosenFeed(state);if(pick&&!button.dataset.sure&&M.farmOf(state).animals.some(a=>M.playerCanFeed(a)&&M.feedLoses(state,pick,a))){feedConfirm(pick,'feed-all');break;}const before=new Set(M.farmOf(state).animals.filter(a=>M.canFeed(a)).map(a=>a.uid)),choice=chosenFeed(state),n=await perform('feedAll',choice?{id:choice}:{});if(n){tone('pop');for(const uid of before){const animal=M.farmOf(state).animals.find(a=>a.uid===uid);if(animal&&!M.canFeed(animal))feedBurst(uid);}toast(t(n>1?'Fed {count} animals.':'Fed {count} animal.',{count:n}),'🥕');}penDialog();break;}
    case 'build-pen':buildPenAction();break;
    case 'expand-pen':{const cost=M.penExpandCost(state);if(cost!==null&&state.energy<cost){toast(t('You need {amount} energy to make the pen bigger.',{amount:cost}),'ϟ');break;} // one toast: the reason, before asking the rules
      if(await perform('expandPen')){tone('success');toast('The pen is bigger: room for 3 more chickens and 4 more cows.','🐔');}penDialog();break;}
    case 'friend-feed':{const id=button.dataset.kind as FriendId,f=state.friends?.find(f=>f.id===id);if(f&&await perform('setFriendAutoFeed',{id,autoFeed:!f.autoFeed}))friendDialog(id);break;}
    case 'fullscreen':{void toggleFullscreen(message=>toast(message,'⛶')).then(()=>setTimeout(()=>{if(modal==='settings')settings();},250));break;}
    case 'profile':{const slot=Number(button.dataset.slot);if(slot!==activeSlot()&&setActiveSlot(slot))location.reload();break;}
    case 'welcome-take':case 'welcome-pass':{const take=action==='welcome-take';if(state.welcome==='pending'&&await perform('welcomeStart',{take})){closeDialog();toast(take?t('Pepper joined you, and you start with 1,000,000 energy!'):t('Pepper joined you. A fair start it is!'),'🍳');updateHud();}break;}
    case 'friend-call':{const id=button.dataset.kind as FriendId;if(await perform('callFriend',{id}))friendDialog(id);break;}
    case 'helper-call':{if(await perform('callHelper'))helperDialog();break;}
    case 'friend-pause':{const id=button.dataset.kind as FriendId,f=state.friends?.find(f=>f.id===id);if(f&&await perform('setFriendPaused',{id,paused:!f.paused}))friendDialog(id);break;}
    case 'cook-dish':if(await perform('cookDish',{id})){tone('success');toast(`${t(M.ITEMS[id].name)} is ready. Enjoy!`,M.ITEMS[id].icon);cooking();}break;case 'graphics':graphics.choose(button.dataset.kind as QualitySetting);world.applyGraphics(graphics.profile,graphics.ratio);saveGraphics(graphics);await perform('settings',{settings:{lowGraphics:graphics.level==='low'}});settings();break;
    case 'zoom-in':case 'zoom-out':world.zoom=clampZoom(Math.round((world.zoom+(action==='zoom-in'?-ZOOM.button:ZOOM.button))*100)/100,'wheel');world.resize();$('#zoom-value').textContent=t(`${Math.round(world.zoom*100)}%`);break;
    case 'reset-confirm':openDialog('reset','Begin a brand-new story?',`<p class="intro">This replaces your ${persistence?'online account adventure':'offline adventure in this browser'}, including your garden, items, and levels.</p><div class="button-row"><button class="soft-button" data-action="settings">Keep my adventure</button><button class="primary danger-button" data-action="reset">Start fresh</button></div>`,'A FRESH START');break;
    case 'reset':{const offline=!actionHandler;if(!await perform('reset'))break;if(offline)neighbours.reset();state=structuredClone(state);world.state=state;rebuildHomePresentation('home');world.refreshPlayer();resetCombat();selectedItem=null;save();closeDialog();if(state.welcome==='pending')welcomeDialog();updateHud();toast('Every adventure starts with a little seed.','🌱');break;} // the new story's welcome (Pepper and her offer) at once, not on the next reload
  }
});
$('#dialog-layer').addEventListener('click',e=>{if(e.target===$('#dialog-layer'))closeDialog();});
$('#world').addEventListener('pointerdown',event=>{if(started&&!uiBlocked()){const e=event as PointerEvent;e.preventDefault();gestures.down(e.pointerId,e.clientX,e.clientY);$('#world').setPointerCapture(e.pointerId);}});
$('#world').addEventListener('pointermove',event=>{const e=event as PointerEvent;gestures.move(e.pointerId,e.clientX,e.clientY);});
$('#world').addEventListener('wheel',event=>{if(uiBlocked())return;const e=event as WheelEvent;e.preventDefault();world.zoom=clampZoom(world.zoom+e.deltaY*ZOOM.wheelStep,'wheel');world.resize();},{passive:false});

$('#world').addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',event=>{
  const pressed=gameplayKey(event);if(!pressed)return;
  if(document.querySelector('dialog[open]'))return;
  const typing=(event.target as HTMLElement).matches('input,textarea,select')||(event.target as HTMLElement).isContentEditable;
  if(flight){if(typing)return;const key=pressed.toLowerCase();if(key===' '||key.startsWith('arrow'))event.preventDefault();if(!event.repeat&&['l','enter','f'].includes(key))tryLanding();else spaceKeys.add(key);return;}
  if(event.key==='Escape'){if(placement)cancelPlacement();else closeDialog();return;}if(placement&&event.key==='Enter'){confirmPlacement();return;}
  if(modal&&event.key==='Tab'){const controls=Array.from($('#dialog').querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a,[tabindex="0"]'));const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}return;}
  if(typing){if(pressed==='Enter'&&!started)start();return;}
  if(fishGame&&event.code==='Space'){event.preventDefault();fishGame.input.holdSpace();return;}
  if(!started||uiBlocked())return;
  const direction=movementKey(pressed,state.settings.keyboardLayout);
  if(direction){event.preventDefault();movement.pressKey(direction,event.code||event.key);return;}
  if(event.repeat)return;
  const key=pressed.toLowerCase(),bindings=keyboardBindings(state.settings.keyboardLayout),skillIndex=(bindings.skills as readonly string[]).indexOf(key);if(placement&&key==='r'){rotatePlacement();return;}if(key==='i')inventory();else if(key===bindings.journal)quests();else if(key==='m')map();else if(key==='f')world.interactNearest();else if(key==='h')void quickEat();else if(skillIndex>=0){event.preventDefault();skill(skillIndex);}else if(pressed===' '){event.preventDefault();basicAttack();}
});
// The keyboard guide counts game keys to learn when to fold itself (hud-keys.ts).
window.addEventListener('keydown',event=>{if(started&&!uiBlocked()&&!event.repeat&&gameplayKey(event))keysGuide.used();});
document.addEventListener('keyup',e=>{const key=gameplayKey({...e,code:e.code,key:e.key});spaceKeys.delete(key.toLowerCase());movement.releaseKey(e.code||e.key);if(fishGame&&e.code==='Space')fishGame.input.releaseSpace();});
document.addEventListener('pointerdown',e=>{if(e.button!==0)return;const target=(e.target as HTMLElement).closest<HTMLElement>('button');if(target?.dataset.move){e.preventDefault();movement.pressPointer(e.pointerId,target.dataset.move);target.setPointerCapture(e.pointerId);}if(target?.id==='reel-button'&&fishGame&&fishGame.input.ready){e.preventDefault();fishGame.input.pressPointer(e.pointerId);target.setPointerCapture(e.pointerId);}});
const releasePointer=(e:PointerEvent)=>{gestures.up(e.pointerId,e.type!=='pointerup');movement.releasePointer(e.pointerId);fishGame?.input.releasePointer(e.pointerId);};
document.addEventListener('pointerup',releasePointer);document.addEventListener('pointercancel',releasePointer);document.addEventListener('lostpointercapture',releasePointer);
function clearHeldInput(){cancelLongPresses();cancelButtonTouches();movement.clear();joystick.clear();fishGame?.input.clear();gestures.clear();spaceKeys.clear();spacePointer=null;boostPointers.clear();boostHeld=false;}
window.addEventListener('blur',()=>{clearHeldInput();save();});window.addEventListener('beforeunload',save);document.addEventListener('visibilitychange',()=>{clearHeldInput();save();});
window.addEventListener('resize',clearHeldInput);window.addEventListener('orientationchange',clearHeldInput);
mountTouchButtons();
let previous=performance.now(),wasAirborne=false;
// A phone may suspend animation callbacks entirely. Neither a hidden callback nor the
// first frame after returning should spend that absence on flight, fishing or effects.
document.addEventListener('visibilitychange',()=>{previous=performance.now();graphics.sample(0,false);});
function frame(now:number){
  if(document.hidden){previous=now;graphics.sample(0,false);requestAnimationFrame(frame);return;}
  const frameMs=Math.max(0,now-previous);frameTime=frameTime*.9+frameMs*.1;const realDt=Math.min(1,frameMs/1000);previous=now;elapsed+=realDt;uiElapsed+=realDt;
  // HUD panel boxes are read at the top of the frame, while layout is still clean from the last one; read after
  // this frame's HUD writes they forced a synchronous layout eight times a second (PERF-ANALYSIS.md).
  if(flight&&!arriving){updateSpace(realDt);if(uiElapsed>.12){uiElapsed=0;updateHud();}if(elapsed>8){elapsed=0;save();}requestAnimationFrame(frame);return;}
  if(uiElapsed>.12&&started){measureHud();hudFresh=true;}
  ship.update(realDt,world.time);
  // Hit-stop: after a critical hit the world runs at a tenth of its speed for a heartbeat.
  let dt=realDt;const fx=world.fx;if(fx&&fx.hitstop>0){fx.hitstop-=realDt;dt*=.1;}
  // Simulate in small steps, then draw once. Movement remains consistent when a
  // browser throttles rendering, and collisions do not tunnel at a low frame rate. At most four steps
  // run per frame; a longer stall turns into slow motion rather than a spiral of ever longer frames.
  updateContextWeapon();joystick.update();
  for(const step of frameSteps(dt)){const active=started&&!uiBlocked()&&!document.hidden,combatActive=started&&!document.hidden&&(!uiBlocked()||!!network.role);combatTimers.advance(step,combatActive);combat.update(step,combatActive);world.movementLocked=combat.locksMovement;world.playerFlying=(combat.statuses.flight??0)>0;world.playerStealth=(combat.statuses.stealth??0)>0;world.playerSizeScale=combat.visualScale;world.playerShield=combat.invulnerable;world.playerBat=(combat.statuses.bats??0)>0;gestures.update(step,active);world.update(step,active,false,started&&!document.hidden&&(active||!!network.role));if(active)world.player.position.y+=combat.airborne;combatView.update(step,combat.projectiles,combatActive,combat.allies);skillFx.boulders.update(combatActive?step:0);skillFx.disguises.update(combatActive?step:0);if(started&&!document.hidden&&!actionHandler)M.tickEffects(state,step);if(fishGame&&!document.hidden)updateFishing(step);}
  // Landing from the ground slam squashes the explorer and jolts the camera.
  const airborne=combat.airborne>0;if(wasAirborne&&!airborne){world.landT=.25;slamImpact();}wasAirborne=airborne;
  // The explorer's pose follows the weapon, skills, fishing line and hit invulnerability.
  const weaponKind=M.weaponStats(state).kind;world.weaponKind=state.gear.weapon&&M.ITEMS[state.gear.weapon]?.weapon?.kind==='rod'?'rod':state.gear.disguise?'fist':weaponKind;world.pose=combat.pose;world.invulnerable=combatTimers.invulnerable>0;world.fishTension=fishGame?.simulation.tension??0;
  autoAttack(weaponKind);
  updateHunting(dt);updateGuardian(dt);
  fishingView.update(dt,world.time,fishGame||fishingView.active?tipPosition():rodTip,world.interior?FAR_AWAY:world.position,fishGame?.simulation??null);
  skillFx.update(dt);world.gazeAngle=skillFx.gazeAngle(world.player);
  if(!fishGame&&!$('#reel-button').hidden&&!$('#reel-button').classList.contains('hunt')&&(performance.now()>recastUntil||world.moving))showReel(false);
  // Resizing the WebGL canvas clears its drawing buffer. Apply automatic quality changes
  // before drawing, so the browser never presents an empty frame during a quality transition.
  const graphicsChange=graphics.sample(realDt,started&&!document.hidden&&!uiBlocked()&&performance.now()>settledAt);if(graphicsChange)world.applyGraphics(graphics.profile,graphics.ratio);if(graphics.takeSave())saveGraphics(graphics);
  world.render();positionLabels();minimap.frame(realDt);fx?.updateText(realDt,innerWidth,innerHeight);
  for(const listener of frameListeners)listener(dt);
  if(uiElapsed>.12){uiElapsed=0;world.syncCrops();updateHud();updateLabels();if(modal==='plot'||modal==='plant'){const p=state.plots[activePlot],seen=p?`${activePlot}|${p.crop??''}|${p.generation??''}|${state.plots.filter(q=>!q.crop).length}|${autoPlantRow(state,activePlot)}`:'';if(plotSeen&&seen&&seen!==plotSeen)refreshPlot();plotSeen=seen;}else plotSeen='';if(modal==='plot'){const p=state.plots[activePlot];if(p?.crop&&$('#grow-fill')){$('#grow-fill').style.width=`${M.cropProgress(p)*100}%`;$('#grow-time').textContent=t(growText(p));}}if(modal==='pen'){if(penSignature(state)!==penShown)penDialog();else tickPen($('#dialog-body'),state);}
    // Helpers keep working while the market, chest or kitchen is open: redraw it when the bag or chest changes, so no row offers what is gone.
    if(modal==='sell'||modal==='chest'||modal==='cook'){const k=stockKey();if(stockShown&&k!==stockShown){if(modal==='sell')market();else if(modal==='chest')storage();else cooking();}stockShown=k;}else stockShown='';}
  if(elapsed>8){elapsed=0;if(started)save();}requestAnimationFrame(frame);
}
requestAnimationFrame(frame);


function refreshDocumentLanguage(){
  document.title=t('Zoo Garden — A little world of adventure');
  document.querySelector('meta[name="description"]')?.setAttribute('content',t('A cozy little 3D world. Plant a garden, catch fish, battle monsters, and explore new planets.'));
}
refreshDocumentLanguage();
app.addEventListener('change',event=>{const input=event.target;if(input instanceof HTMLSelectElement&&input.hasAttribute('data-language'))setLanguage(input.value==='vi'?'vi':'en');if(input instanceof HTMLSelectElement&&input.hasAttribute('data-feed-choice'))feedChoice.id=input.value;});
onLanguageChange(()=>{
  refreshStaticLanguage();refreshWorldLanguage();refreshDocumentLanguage();
  app.querySelectorAll<HTMLSelectElement>('[data-language]').forEach(input=>{input.value=getLanguage();});
  updateHud();updateLabels();minimap.invalidate();
  if(started)showZone(world.lastZone||t(M.PLANETS[state.planet].name));
  if(modal==='settings'){settings();$<HTMLSelectElement>('#language-settings').focus({preventScroll:true});}
  else if(modal==='bag')inventory();else if(modal==='quests')quests();else if(modal==='shop')shop();else if(modal==='sell')market();else if(modal==='chest')storage();else if(modal==='upgrade')upgrades();else if(modal==='cook')cooking();else if(modal==='craft')crafting();else if(modal==='forge')forgeMenu();else if(modal==='decor')decorations();else if(modal==='map')map();else if(modal==='travel')planets();else if(modal==='help')help();else if(modal==='pen')penDialog();else if(modal==='helper')helperDialog();else if(modal==='farm-helper')farmHelperDialog();
});
initOnline(gameBridge);
// The 📰 news board (news-board.ts): its menu button, unread count and the panel that opens itself once for new updates.
const newsBoard=initNewsBoard({openDialog,idle:()=>started&&!modal&&!uiBlocked(),root:app,url:`${import.meta.env.BASE_URL}news.json`});
initHudLayout();
const neighbours=initBots(gameBridge);if(import.meta.env.DEV||import.meta.env.VITE_PERF_HOOK)Object.assign(window,{__bots:neighbours});
initPlatform(message=>toast(message));
// Development builds expose the game to browser tests; production builds leave this out.
if(import.meta.env.DEV||import.meta.env.VITE_PERF_HOOK)Object.assign(window,{__zoo:{world,panel:(type:string)=>{if(type==='wardrobe'){bagMode='wardrobe';inventory();}else({bag:inventory,shop,upgrade:upgrades,looks:()=>lookShop.open(),sell:market,travel:planets,map,quests,settings,help,craft:crafting,cook:cooking,chest:storage} as Record<string,()=>void>)[type]?.();},house,bench,combat,skill,challenges,keysGuide,startChallenge:(type:string)=>perform('startChallenge',{kind:type}),get cooldowns(){return cooldowns;},lookShop,drops,crew,fishingView,huntingView,guardianView,helperView,farmHelperView,get fishGame(){return fishGame;},get state(){return state;},planets,launch,flyHome,get flight(){return flight;},spaceView,toast,showZone,dialogs:{shop,market,inventory,settings,quests,help,map,upgrades,crafting,decorations,storage,cooking,forgeMenu,testerShop}}});
