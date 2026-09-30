import '@fontsource-variable/nunito';
import './style.css';
import { World, type Entity, type Enemy } from './world.ts';
import { refinedAssets } from './assets.ts';
import * as M from './model.ts';
import { CombatTimers, FishingInput, MovementControls } from './gameplay-controls.ts';
import { CombatSimulation, BASE_SKILLS, SPECIALS, type CombatHit } from './combat.ts';
import { CombatView } from './combat-view.ts';
import { FishingSimulation, selectCatch } from './fishing.ts';
import { GroundGestures } from './gestures.ts';
import {clearSegment,WORLD_BOUNDS} from './navigation.ts';
import { progressEntries, claimProgress, recordEvent, rerollDaily, startChallenge, type ProgressKind } from './progression.ts';
import type { GameBridge, GameAction, NetworkHooks } from './game-bridge.ts';
import { initOnline } from './online.ts';
import { initPlatform } from './platform.ts';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let saved: M.SaveState | null = null;
try { saved = M.parseSave(localStorage.getItem(M.SAVE_KEY)); } catch { /* Play remains available without storage. */ }
let state = saved ?? M.newGame();
let started = false, modal = '', selectedItem: M.ItemId | null = null, activePlot = 0, lastFocused: HTMLElement | null = null;
let saveFailed = false, elapsed = 0, uiElapsed = 0, frameTime = 16;
const combatTimers = new CombatTimers();
const cooldowns = combatTimers.skills, skillDurations = [7,4,9,6];
let audio: AudioContext | null = null;
let fishGame: {input:FishingInput;simulation:FishingSimulation;id:string;size:number;huge:boolean;bait:boolean;lastPhase:string;missedBites:number} | null = null;
let fishingWater='home';
let shopTab='Weapons',journalTab:ProgressKind='story',craftStation:'craft'|'forge'='craft',craftTab='All';
let placement:{id:string;rotation:number}|null=null,visiting:string|null=null,visitHome:M.SaveState|null=null;
let persistence:((state:M.SaveState)=>void)|null=null,network:NetworkHooks={role:null};
const frameListeners=new Set<(dt:number)=>void>(),actionListeners=new Set<(action:GameAction)=>void>();
const app = $('#app');
app.innerHTML = `
  <div id="darkness" hidden></div><div id="world-labels" aria-label="Nearby places"></div>
  <div id="hud" hidden>
    <header class="player-card"><button class="avatar" data-action="bag" aria-label="Open character and backpack"><span>🌱</span><b id="level-badge">1</b></button><div class="player-details"><div class="player-name"><strong id="player-name"></strong><span id="level-text">Lv. 1</span></div><div class="meter health"><div id="hp-fill"></div><span id="hp-text">100 / 100</span></div><div class="meter experience"><div id="xp-fill"></div></div><div class="location"><span class="location-dot"></span><span id="zone-name">Clover Village</span></div></div></header>
    <nav class="top-actions" aria-label="Game menu"><div class="energy"><span>ϟ</span><b id="energy">0</b></div><button class="icon-button" data-action="bag" title="Backpack · I" aria-label="Backpack">🎒</button><button class="icon-button" data-action="quests" title="Journal · J" aria-label="Quest journal">📖<i id="quest-dot"></i></button><div id="social-slot"></div><button class="icon-button secondary-icon" data-action="help" title="How to play" aria-label="How to play">?</button><button class="icon-button" data-action="settings" title="Settings" aria-label="Settings">⚙</button><div id="platform-slot"></div></nav>
    <aside class="quest-tracker"><div class="eyebrow">YOUR LITTLE ADVENTURE <span id="quest-chapter">1 / 9</span></div><button id="quest-summary" data-action="quests"><span class="quest-icon" id="quest-icon">🥕</span><span><strong id="quest-title">A little green beginning</strong><small id="quest-task">Harvest 3 crops · 0 / 3</small></span><span class="chevron">›</span></button><div class="quest-progress"><i id="quest-fill"></i></div><button id="quick-claim" data-action="claim" hidden>Collect your reward ✨</button></aside>
    <button id="bounty-tracker" class="bounty-tracker" data-action="journal-tab" data-kind="bounties"><span>🎯</span><div><strong id="bounty-title">A new bounty</strong><small id="bounty-task">Find your next adventure</small></div></button><button class="minimap" data-action="map" aria-label="Open village map"><canvas id="minimap" width="160" height="160"></canvas><span>N</span><small id="map-caption">CLOVER VILLAGE</small></button>
    <div id="zone-banner"><span id="zone-icon">🌿</span><div><strong id="banner-name">Clover Village</strong><small id="banner-detail">A little place to call home</small></div></div>
    <div id="context-prompt" hidden><button id="interact-button" data-action="interact"><kbd>F</kbd><span id="interact-text">Interact</span></button></div>
    <div class="bottom-bar"><div class="skills" aria-label="Combat skills"><button class="skill skill-spin" data-action="skill" data-index="0" aria-label="Q Whirlwind"><kbd>Q</kbd><span>🌀</span><small>Whirlwind</small><b class="cooldown"></b></button><button class="skill skill-dash" data-action="skill" data-index="1" aria-label="W Dash"><kbd>W</kbd><span>➶</span><small>Dash</small><b class="cooldown"></b></button><button class="skill skill-stomp" data-action="skill" data-index="2" aria-label="E Ground stomp"><kbd>E</kbd><span>💥</span><small>Stomp</small><b class="cooldown"></b></button><button class="skill skill-special" data-action="skill" data-index="3" aria-label="R Special attack"><kbd>R</kbd><span>✦</span><small id="special-name">Star punch</small><b class="cooldown"></b></button></div><div class="control-hint"><span>Click to wander</span><i>•</i> Arrows to move <i>•</i> <kbd>Space</kbd> attack</div><button class="home-button" data-action="return-home" title="Return home">⌂ <span>Home</span></button></div>
    <div id="touch-controls"><button data-move="ArrowUp" aria-label="Move up">▲</button><div><button data-move="ArrowLeft" aria-label="Move left">◀</button><button data-action="attack" aria-label="Attack">⚔</button><button data-move="ArrowRight" aria-label="Move right">▶</button></div><button data-move="ArrowDown" aria-label="Move down">▼</button></div>
    <div id="buff-bar" aria-label="Active effects"></div><div id="environment-bar" aria-label="Environment"></div><div id="placement-bar" hidden><strong id="placement-name"></strong><span>Tap an open spot near home · R rotates · Escape cancels</span><button class="soft-button" data-action="rotate-decor">Rotate ↻</button><button class="soft-button" data-action="cancel-decor">Cancel</button></div><div id="visit-banner" hidden></div>
    <div class="save-indicator" id="save-status">● Saved on this device</div>
  </div>
  <div id="title-screen"><div class="title-shade"></div><div class="welcome-card"><div class="welcome-eyebrow"><span></span> YOUR NEXT LITTLE ADVENTURE</div><div class="brand-sprout">🌱</div><h1>Zoo <em>Garden</em><span>grow a little. wander a lot.</span></h1><p>A cozy home, a pocketful of seeds,<br>and a whole world waiting for you.</p><div class="welcome-form"><label for="name-input">WHAT SHOULD WE CALL YOU?</label><input id="name-input" aria-label="Your character name" maxlength="20" value="${esc(saved?.name ?? '')}" placeholder="Your name" autocomplete="off"><fieldset class="color-picker"><legend>Pick your favorite color</legend>${M.COLORS.map((c,i)=>`<button type="button" data-action="color" data-color="${c}" style="--swatch:${c}" class="${state.color===c?'selected':''}" aria-label="${['Sky blue','Rose pink','Leaf green','Honey yellow','Lavender','Terracotta'][i]}" aria-pressed="${state.color===c}"></button>`).join('')}</fieldset><button class="primary start-button" data-action="start">${saved?'Continue adventure':'Let’s play'} <span>→</span></button></div><div class="welcome-footer"><span>🌾 Grow</span><span>🎣 Discover</span><span>✨ Adventure</span></div><small class="local-note">${import.meta.env.VITE_STATIC_HOST==='true'?'Solo adventure · progress saved in this browser':'Play offline, or meet friends online'}</small></div><div class="title-caption"><span>🌿</span> WELCOME TO CLOVER VILLAGE</div></div>
  <div id="dialog-layer" hidden><section id="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header><div><span id="dialog-kicker" class="eyebrow">MAKE YOURSELF AT HOME</span><h2 id="dialog-title"></h2></div><button class="close-button" data-action="close" aria-label="Close dialog">×</button></header><div id="dialog-body"></div></section></div>
  <div id="toasts" role="status" aria-live="polite"></div><div id="floating-text"></div><div id="damage-flash"></div>
`;
let world: World;
try { world = new World($('#world'), state); }
catch (error) { app.innerHTML = '<div class="fatal"><h1>Your garden needs WebGL</h1><p>Enable hardware acceleration in your browser, then reload this page.</p><p>Your saved adventure is safe.</p></div>'; throw error; }
world.setQuality(state.settings.lowGraphics);
const movement = new MovementControls(world.keys);
const combatView=new CombatView(world.scene);
const combat=new CombatSimulation({
  position:()=>world.position,facing:()=>world.facing,face:angle=>world.facing=angle,
  targets:()=>world.enemies,weapon:()=>M.weaponStats(state),stats:()=>M.activeStats(state),
  move:(x,z)=>{const steps=Math.max(1,Math.ceil(Math.hypot(x,z)/.2));for(let i=0;i<steps;i++)world.move(x/steps,z/steps);},
  hit:(target,impact)=>hit(target as Enemy,impact.amount,impact.stun,impact),
  clearShot:(from,to)=>clearSegment(from,to,world.obstacles,{bounds:WORLD_BOUNDS,clearance:.05}),
  effect:effect=>{combatView.effect(effect);emitAction({kind:'effect',effect});},
  heal:fraction=>state.hp=Math.min(M.maxHp(state),state.hp+M.maxHp(state)*fraction),
  status:(target,kind,duration)=>{if(!network.status?.(target.id,kind,duration))world.statusEnemy(target as Enemy,kind,duration);},
  moveTarget:(target,x,z)=>{if(!network.moveTarget?.(target.id,x,z))moveEnemy(target as Enemy,x,z);},
});
const gestures=new GroundGestures({tap:(x,y)=>{if(placement)placeAt(x,y);else world.pointer(x,y);},walk:(x,y)=>{if(placement)return;const p=world.groundPoint(x,y);if(p)world.walkTo(p.x,p.z);},zoom:ratio=>{world.zoom=Math.max(13,Math.min(38,world.zoom*ratio));world.resize();},stop:()=>{world.destination=null;world.route=[];world.selected=null;}});
function emitAction(action:Omit<GameAction,'x'|'z'|'facing'>){const value={...action,x:world.position.x,z:world.position.z,facing:world.facing};for(const listener of actionListeners)listener(value);}
function moveEnemy(target:Enemy,x:number,z:number){if(!Number.isFinite(x)||!Number.isFinite(z)||Math.hypot(target.x-x,target.z-z)>12||world.blocked(x,z))return;target.x=x;target.z=z;target.mesh.position.x=x;target.mesh.position.z=z;}
// Upgrade visuals in place when ready; playing and saved progress never wait on assets.
void refinedAssets.loadAll().then(() => world.applyRefinedAssets());

function tone(kind: 'click'|'success'|'hit'|'level' = 'click') {
  if (!state.settings.sound) return;
  try { audio ??= new AudioContext(); void audio.resume(); const notes = kind==='success'?[523,659,784]:kind==='level'?[523,659,784,1046]:kind==='hit'?[180]:[420];
    notes.forEach((frequency,i)=>{const oscillator=audio!.createOscillator(), gain=audio!.createGain(),t=audio!.currentTime+i*.09;oscillator.type=kind==='hit'?'triangle':'sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.035,t);gain.gain.exponentialRampToValueAtTime(.001,t+.16);oscillator.connect(gain);gain.connect(audio!.destination);oscillator.start(t);oscillator.stop(t+.17);});
  } catch { /* Sound is optional. */ }
}
function save() { if(!started)return;if(persistence){persistence(state);return;}try { state.savedAt=Date.now();localStorage.setItem(M.SAVE_KEY,JSON.stringify(state));saveFailed=false;$('#save-status').textContent='● Saved on this device'; } catch { saveFailed=true;$('#save-status').textContent='○ Saving unavailable'; } }
function toast(message: string, icon='✨') {const el=document.createElement('div');el.className='toast';el.innerHTML=`<span>${icon}</span><div>${esc(message)}</div>`;$('#toasts').append(el);setTimeout(()=>el.remove(),4000);}
function floating(text:string,x=world.position.x,z=world.position.z,color='#ffffff') {const pos=world.screen(x,2.5,z),el=document.createElement('span');el.className='float';el.textContent=text;el.style.cssText=`left:${pos.x}px;top:${pos.y}px;color:${color}`;$('#floating-text').append(el);setTimeout(()=>el.remove(),1200);}
function levelCheck(before:number) {if(state.level>before){toast(`Level ${state.level}! A little stronger, a little braver.`,'🌟');tone('level');world.burst(world.position.x,world.position.z,'#f5dc8f',35);}}
function change<T>(action:()=>T):T {const before=state.level;const result=action();levelCheck(before);save();updateHud();return result;}
function uiBlocked(){return !!modal||!!document.querySelector('dialog[open]');}
function openDialog(type:string,title:string,body:string,kicker='MAKE YOURSELF AT HOME') {
  if(!modal)lastFocused=document.activeElement as HTMLElement;modal=type;movement.clear();gestures.clear();world.destination=null;world.route=[];
  $('#dialog-title').textContent=title;$('#dialog-kicker').textContent=kicker;$('#dialog-body').innerHTML=body;$('#dialog-layer').hidden=false;$('#hud').inert=true;$('#world-labels').inert=true;
  $('.close-button').focus();
}
function closeDialog(){if(fishGame){fishGame=null;toast('Fishing line reeled in.','🎣');}modal='';$('#dialog-layer').hidden=true;$('#hud').inert=false;$('#world-labels').inert=false;lastFocused?.focus();movement.clear();}
function start() {state.name=$<HTMLInputElement>('#name-input').value.trim().slice(0,20)||state.name;started=true;$('#title-screen').hidden=true;$('#hud').hidden=false;save();updateHud();updateLabels();toast(saved?`Welcome back, ${state.name}. Your garden missed you!`:'Start small: click a garden bed to plant your first carrot.','🌱');showZone('Clover Village');}

function updateHud() {
  $('#world').dataset.status=JSON.stringify({position:[+world.position.x.toFixed(2),+world.position.z.toFixed(2)],route:world.route.length,next:world.route[0]?[world.route[0].x,world.route[0].z]:null,visibility:document.visibilityState,modal,started,frameMs:Math.round(frameTime),drawCalls:world.renderer.info.render.calls});
  $('#player-name').textContent=state.name;$('#level-badge').textContent=String(state.level);$('#level-text').textContent=`Lv. ${state.level}`;$('#energy').textContent=state.energy.toLocaleString();
  $('#hp-fill').style.width=`${state.hp/M.maxHp(state)*100}%`;$('#hp-text').textContent=`${Math.ceil(state.hp)} / ${M.maxHp(state)}`;$('#xp-fill').style.width=`${state.xp/M.xpNeeded(state.level)*100}%`;
  $('.experience').setAttribute('title',`${state.xp} / ${M.xpNeeded(state.level)} experience`);
  const q=progressEntries(state,'story')[0],progress=q?.progress??0;
  $('#quest-chapter').textContent=state.quest<M.QUESTS.length?`${state.quest+1} / ${M.QUESTS.length}`:'ONGOING';$('#quest-icon').textContent=q?.icon??'🚀';$('#quest-title').textContent=q?.title??'A world of possibilities';$('#quest-task').textContent=q?`${q.description} · ${progress} / ${q.target}`:'Your next chapter awaits.';
  $('#quest-fill').style.width=`${q?progress/q.target*100:100}%`;$('#quick-claim').hidden=!q?.complete;$('#quest-dot').hidden=!q?.complete;
  const skills=skillList();
  document.querySelectorAll<HTMLButtonElement>('.skill').forEach((button,i)=>{const skill=skills[i];button.querySelector('span')!.textContent=skill.icon;button.querySelector('small')!.textContent=skill.name;button.setAttribute('aria-label',`${['Q','W','E','R'][i]} ${skill.name}`);button.setAttribute('title',skill.name);button.classList.toggle('on-cooldown',cooldowns[i]>0);button.querySelector('.cooldown')!.textContent=cooldowns[i]>0?Math.ceil(cooldowns[i]).toString():'';button.style.setProperty('--cooldown',`${cooldowns[i]/skillDurations[i]*100}%`);});
  $('#buff-bar').innerHTML=M.activeBuffs(state).map(b=>`<span title="${esc(b.description)}">${b.icon} ${esc(b.name)} <b>${Math.ceil(b.remaining)}s</b></span>`).join('')+Object.entries(combat.statuses).filter(([,t])=>t>0).map(([name,t])=>`<span>✨ ${esc(name)} <b>${Math.ceil(t)}s</b></span>`).join('');
  $('#environment-bar').innerHTML=world.environmentStatus().map(e=>`<span>${e.icon??''} ${esc(e.label)} <b>${esc(String(e.value))}</b></span>`).join('');
  const dark=$('#darkness');dark.hidden=!world.darknessActive()||!started;
  const bounty=progressEntries(state,'bounties')[0];$('#bounty-tracker').hidden=!bounty;if(bounty){$('#bounty-title').textContent=bounty.title;$('#bounty-task').textContent=`${bounty.progress}/${bounty.target} · ${bounty.claimed?'Complete':bounty.description}`;}
  if(!dark.hidden){const holes=world.lightSources().map(light=>{const p=world.screen(light.x,.7,light.z),edge=world.screen(light.x+light.radius,.7,light.z);return `radial-gradient(circle ${Math.abs(edge.x-p.x)}px at ${p.x}px ${p.y}px, transparent 65%, black 100%)`;});dark.style.maskImage=holes.join(',');dark.style.maskComposite='intersect';}

  if(started&&!modal){const e=world.nearest();$('#context-prompt').hidden=!e;$('#interact-text').textContent=e?e.kind==='enemy'?`Attack ${e.name}`:e.kind==='plot'?world.state.plots[e.index!]?.crop?M.cropProgress(world.state.plots[e.index!])===1?'Harvest crop':'Check growing crop':'Plant a seed':e.name:'';}else $('#context-prompt').hidden=true;
}
function showZone(name:string) {$('#zone-name').textContent=name;$('#banner-name').textContent=name;$('#banner-detail').textContent=name==='Clover Village'?'A peaceful place · health restores here':name==='Bramble Woods'?'Beyond the gate, a little courage goes a long way':M.PLANETS[state.planet].description;$('#zone-banner').classList.add('show');setTimeout(()=>$('#zone-banner').classList.remove('show'),3500);}
world.onZone=showZone;
const labelNodes=new Map<string,HTMLButtonElement>();
function updateLabels() {
  const active=new Set<string>();
  if(!started)return;
  for(const e of world.entities){
    const distance=Math.hypot(e.x-world.position.x,e.z-world.position.z);let text=e.name,icon=e.icon,y=3.3;
    if(e.kind==='plot'){const p=world.state.plots[e.index!];if(!p)continue;y=.65;if(p.crop){const progress=M.cropProgress(p);text=progress>=1?'Harvest':`${Math.ceil((1-progress)*M.CROPS[p.crop].duration/1000)}s`;icon=progress>=1?M.CROPS[p.crop].icon:'🌱';}else {text='Plant';icon='+';}if(distance>14)continue;}
    if(e.kind==='enemy'){const enemy=e as Enemy;if(enemy.hp<=0||distance>10)continue;y=enemy.boss?4.5:2;text=e.name;}
    else if(e.kind==='home')y=6.3;
    if(distance>23)continue;const p=world.screen(e.x,y,e.z);if(!p.visible||p.y<125||p.y>innerHeight-120)continue;
    active.add(e.id);let label=labelNodes.get(e.id);
    if(!label){label=document.createElement('button');label.className='world-label '+(e.kind==='plot'?'plot-label':e.kind==='enemy'?'enemy-label':'');label.dataset.entity=e.id;labelNodes.set(e.id,label);$('#world-labels').append(label);}
    const html=e.kind==='enemy'?`<span>${(e as Enemy).boss?'👑 ':''}${esc(text)}</span><i><b style="width:${(e as Enemy).hp/(e as Enemy).maxHp*100}%"></b></i>`:`<span>${icon}</span>${esc(text)}`;
    if(label.innerHTML!==html)label.innerHTML=html;label.setAttribute('aria-label',e.kind==='plot'?`${text} in garden bed ${e.index!+1}`:text);label.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;label.hidden=!!modal;
  }
  for(const[id,node]of labelNodes)if(!active.has(id)){node.remove();labelNodes.delete(id);}
  const canvas=$<HTMLCanvasElement>('#minimap'),ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,160,160);ctx.fillStyle=M.PLANETS[state.planet].color;ctx.fillRect(0,0,160,160);
  const mx=(x:number)=>80+x*1.55,mz=(z:number)=>80+z*1.55;
  if(state.planet==='home'){ctx.fillStyle='#dfc69b';ctx.fillRect(77,0,6,150);ctx.fillRect(47,92,90,5);ctx.fillStyle='#75b8c4';ctx.beginPath();ctx.ellipse(mx(19),mz(8),9,6,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d6b58a';ctx.beginPath();ctx.moveTo(55,mz(-20));ctx.lineTo(105,mz(-20));ctx.stroke();}
  for(const e of world.entities){if(e.kind==='plot')continue;ctx.fillStyle=e.kind==='enemy'?'#bc7771':e.kind==='home'?'#f6df9d':e.kind==='travel'?'#fff5de':'#fff1d0';ctx.beginPath();ctx.arc(mx(e.x),mz(e.z),e.kind==='home'?4:2,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(mx(world.position.x),mz(world.position.z),4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#557a63';ctx.beginPath();ctx.arc(mx(world.position.x),mz(world.position.z),2,0,Math.PI*2);ctx.fill();$('#map-caption').textContent=M.PLANETS[state.planet].name.toUpperCase();
}

function plotDialog(index:number) {
  if(visiting){toast(`${visiting}’s garden is for admiring. Your own garden is waiting at home.`,'🌷');return;}
  activePlot=index;const plot=state.plots[index];if(!plot)return;
  if(plot.crop&&M.cropProgress(plot)>=1){const crop=change(()=>M.harvest(state,index));if(crop){tone('success');world.syncCrops();toast(`${M.CROPS[crop].name} harvested.`,M.CROPS[crop].icon);}return;}
  if(plot.crop){const crop=M.CROPS[plot.crop];openDialog('plot','A little patience…',`<div class="grow-illustration">${crop.icon}</div><p class="center">Your ${esc(crop.name)} is growing.</p><div class="grow-meter"><i id="grow-fill"></i></div><p class="center muted" id="grow-time"></p><button class="primary wide" data-action="fertilize" ${!state.bag.spore?'disabled':''}>✨ Instant growth (${state.bag.spore||0})</button><button class="soft-button wide" data-action="fertilize-manure" ${!state.bag.manure?'disabled':''}>🌿 Halve growth time (${state.bag.manure||0})</button><button class="soft-button wide" data-action="harvest-all">Harvest all ready crops</button>`,'GARDEN BED '+(index+1));return;}
  openDialog('plant','Choose something to grow',`<p class="intro">Most seeds are free; rare varieties need their own seed item. Each harvest can be sold, cooked, or eaten for a different boost.</p><div class="garden-actions"><button class="primary" data-action="harvest-all">🌾 Harvest all ready crops</button><button class="soft-button" data-action="expand" ${state.plots.length>=33?'disabled':''}>＋ Garden bed · ${state.bag.plot_kit?'use plot kit':`ϟ ${60+Math.max(0,state.plots.length-9)*20}`}</button><span>${state.plots.length} / 33 beds</span></div><div class="crop-options">${Object.entries(M.CROPS).map(([id,c])=>`<div class="crop-option"><span>${c.icon}</span><strong>${esc(c.name)}</strong><small>${state.level<c.level?`Level ${c.level}`:`${c.duration/1000}s · ${c.xp} XP${c.seed?` · ${state.bag[c.seed]||0} seeds`:''}`}</small><div class="button-row"><button class="primary" data-action="plant" data-item="${id}" ${state.level<c.level||c.seed&&!state.bag[c.seed]?'disabled':''}>Plant</button><button class="soft-button" data-action="plant-all" data-item="${id}" ${state.level<c.level||c.seed&&!state.bag[c.seed]?'disabled':''}>Plant all</button></div></div>`).join('')}</div>`,'YOUR GARDEN');
}
function inventory() {
  const entries=Object.entries(state.bag).filter(([,n])=>n!>0) as [M.ItemId,number][];
  const slots:[M.GearSlot,string,string][]=[['weapon','⚔️','Weapon'],['hat','👒','Hat'],['outfit','🧥','Outfit'],['boots','👟','Boots'],['pet','🐾','Pet'],['disguise','🎭','Disguise']];
  if(selectedItem&&!state.bag[selectedItem])selectedItem=null;
  const item=selectedItem?M.ITEMS[selectedItem]:null,stats=M.activeStats(state),slot=item?.slot;
  openDialog('bag','Your explorer & backpack',`<div class="stat-strip"><span>❤️ <b>${Math.ceil(state.hp)}/${Math.round(stats.maxHp)}</b></span><span>⚔️ <b>${stats.attack.toFixed(1)}</b></span><span>🛡️ <b>${stats.defense}</b></span><span>💨 <b>${stats.speed.toFixed(1)}</b></span><span>✨ <b>${Math.round(stats.critChance*100)}% crit</b></span></div><div class="equipment">${slots.map(([key,icon,name])=>`<div><button data-action="inspect" data-item="${state.gear[key]||''}" ${!state.gear[key]?'disabled':''}><span>${state.gear[key]?M.ITEMS[state.gear[key]!].icon:icon}</span><small>${state.gear[key]?esc(M.ITEMS[state.gear[key]!].name):name}</small></button>${state.gear[key]?`<button class="unequip" data-action="unequip" data-slot="${key}" aria-label="Unequip ${name}">Remove</button>`:''}</div>`).join('')}</div><div class="section-label">BACKPACK <span>${entries.reduce((n,[,q])=>n+q,0)} items</span></div><div class="inventory-grid">${entries.map(([id,count])=>`<button class="item-tile ${id===selectedItem?'selected':''}" data-action="inspect" data-item="${id}" aria-label="${esc(M.ITEMS[id].name)}, ${count}"><span>${M.ITEMS[id].icon}</span><b>${count}</b><small>${esc(M.ITEMS[id].name)}</small>${Object.values(state.gear).includes(id)?'<i>Equipped</i>':''}</button>`).join('')||'<div class="empty-state"><span>🎒</span><strong>Your first harvest belongs here.</strong></div>'}</div>${item?`<div class="item-detail"><span class="item-hero">${item.icon}</span><div><h3>${esc(item.name)}</h3><p>${esc(item.desc)}</p><div class="button-row">${slot?`<button class="primary" data-action="equip" data-item="${selectedItem}" ${state.gear[slot]===selectedItem?'disabled':''}>${state.gear[slot]===selectedItem?'Equipped':'Equip'}</button>`:''}${item.heal||item.buff?`<button class="primary" data-action="eat" data-item="${selectedItem}">Use${item.heal?` · +${item.heal} HP`:''}</button>`:''}${item.type==='decor'||item.type==='placeable'?`<button class="primary" data-action="place-decor" data-item="${selectedItem}">Place at home</button>`:''}</div></div></div>`:''}<div class="button-row"><button class="soft-button" data-action="go" data-kind="cook">🔥 Volcano kitchen</button><button class="soft-button" data-action="decorations">🏡 Home decorations</button><button class="soft-button" data-action="journal-tab" data-kind="collection">🐟 Fish collection</button></div>`,'CHARACTER');
}
const JOURNAL_TABS:[ProgressKind,string][]=[['story','Story'],['daily','Daily'],['weekly','Weekly'],['achievements','Achievements'],['pass','Star pass'],['bounties','Bounties'],['collection','Collection'],['challenges','Challenges']];
function quests(){
  const entries=progressEntries(state,journalTab),claimable=entries.filter(e=>e.complete&&!e.claimed).length;
  openDialog('quests','Your adventure journal',`<nav class="panel-tabs" aria-label="Journal sections">${JOURNAL_TABS.map(([id,label])=>`<button class="${journalTab===id?'active':''}" aria-pressed="${journalTab===id}" data-action="journal-tab" data-kind="${id}">${label}</button>`).join('')}</nav><p class="intro">${journalTab==='daily'?'Fresh tasks every day.':journalTab==='weekly'?'Longer adventures reset each week.':journalTab==='pass'?'Earn stars from daily and weekly tasks to unlock rewards.':journalTab==='bounties'?'Track creatures across the worlds.':journalTab==='collection'?'Discover fish and keep a record of your best catches.':'Every little achievement counts.'} ${claimable?`${claimable} reward${claimable===1?'':'s'} ready.`:''}</p>${journalTab==='challenges'?`<div class="button-row">${['kill','skill','harvest','fish','boss'].map(type=>`<button class="soft-button" data-action="start-challenge" data-kind="${type}" ${state.level<2||entries.some(e=>!e.claimed)?'disabled':''}>${type} challenge</button>`).join('')}</div>`:''}<div class="quest-list">${entries.map(e=>`<div class="quest-row ${e.claimed?'complete':e.complete?'current':''}"><span>${e.claimed?'✓':e.icon??'⭐'}</span><div><strong>${esc(e.title)}</strong><small>${esc(e.description)}</small><div class="entry-meter"><i style="width:${Math.min(100,e.progress/e.target*100)}%"></i></div><small>${Math.min(e.progress,e.target)} / ${e.target}</small></div><div class="quest-reward"><span>${esc(e.rewardLabel)}</span><button class="primary" data-action="progress-claim" data-kind="${journalTab}" data-id="${esc(e.id)}" ${!e.complete||e.claimed?'disabled':''}>${e.claimed?'Collected':'Collect'}</button>${journalTab==='daily'&&!e.claimed&&!e.id.endsWith('login')&&!e.id.endsWith('chest')?`<button class="text-button" data-action="reroll-daily" data-index="${Number(e.id.split(':').at(-1))}" ${state.progression.daily.rerolled?'disabled':''}>Reroll</button>`:''}</div></div>`).join('')||'<p class="empty-state">More discoveries are waiting out in the world.</p>'}</div>`,'EXPLORE • GROW • COLLECT');
}
const SHOP_TABS=['Weapons','Clothing','Pets','Disguises','Supplies','Decor'];
function shop(){
  const matches=(item:M.ItemDef)=>shopTab==='Weapons'?item.slot==='weapon':shopTab==='Clothing'?['hat','outfit','boots'].includes(item.slot??''):shopTab==='Pets'?item.slot==='pet':shopTab==='Disguises'?item.slot==='disguise':shopTab==='Decor'?item.type==='decor':!item.slot&&item.type!=='decor';
  const entries=Object.entries(M.ITEMS).filter(([,item])=>item.price!==undefined&&matches(item));
  openDialog('shop','Little outfitters',`<nav class="panel-tabs" aria-label="Shop categories">${SHOP_TABS.map(tab=>`<button class="${shopTab===tab?'active':''}" aria-pressed="${shopTab===tab}" data-action="shop-tab" data-kind="${tab}">${tab}</button>`).join('')}</nav><div class="shop-grid">${entries.map(([id,item])=>`<div class="shop-item"><span class="shop-icon">${item.icon}</span><div><strong>${esc(item.name)}</strong><p>${esc(item.desc)}</p><small>Owned: ${state.bag[id]||0}${Object.entries(item.materials??{}).map(([mat,n])=>` · ${M.ITEMS[mat].icon} ${esc(M.ITEMS[mat].name)} ${state.bag[mat]||0}/${n}`).join('')}</small></div><button class="primary" data-action="buy" data-item="${id}" ${state.energy<item.price!||Object.entries(item.materials??{}).some(([id,n])=>M.looseQuantity(state,id)<n!)?'disabled':''}>ϟ ${item.price}</button></div>`).join('')||'<p class="empty-state">Visit the workshop for this collection.</p>'}</div>`,'ϟ '+state.energy+' ENERGY');
}

function market(){const sellable=(Object.keys(state.bag) as M.ItemId[]).map(id=>[id,M.looseQuantity(state,id)] as [M.ItemId,number]).filter(([id,n])=>M.ITEMS[id].sell>0&&n>0);openDialog('sell','From your garden, with love',`<div class="owl-note"><span>🧺</span><p><strong>Welcome to the harvest market</strong>Trade your treasures for energy. Save a snack for the trail!</p></div><div class="shop-grid">${sellable.map(([id,n])=>`<div class="shop-item"><span class="shop-icon">${M.ITEMS[id].icon}</span><div><strong>${M.ITEMS[id].name} <small>×${n}</small></strong><p>ϟ ${M.ITEMS[id].sell} each</p></div><div class="button-row"><button class="soft-button" data-action="sell-one" data-item="${id}">Sell 1</button><button class="primary" data-action="sell-all" data-item="${id}">Sell all · ϟ ${n*M.ITEMS[id].sell}</button></div></div>`).join('')||'<div class="empty-state"><span>🌾</span><strong>Something good is growing</strong><p>Bring crops, fish, or materials to sell here.</p><button class="primary" data-action="go" data-kind="plot">Visit the garden →</button></div>'}</div>`,'ϟ '+state.energy+' ENERGY');}
function storage(){const rows=(inv:M.Inventory,toChest:boolean)=>(Object.entries(inv)as[M.ItemId,number][]).map(([id,n])=>`<div class="storage-row"><span>${M.ITEMS[id].icon} ${M.ITEMS[id].name} <b>×${n}</b></span><button class="soft-button" data-action="transfer" data-item="${id}" data-direction="${toChest?'store':'take'}" ${toChest&&M.looseQuantity(state,id)===0?'disabled':''}>${toChest?'Store →':'← Take'}</button></div>`).join('');openDialog('chest','Keep your treasures safe',`<p class="intro">Items in your chest stay safe when you get knocked out.</p><div class="storage-columns"><div><h3>🎒 Backpack</h3>${rows(state.bag,true)||'<p class="muted">Nothing here yet.</p>'}</div><div><h3>📦 Chest</h3>${rows(state.chest,false)||'<p class="muted">Room for something special.</p>'}</div></div>`,'YOUR STORAGE CHEST');}
function upgrades(){const stats=M.activeStats(state),options:[keyof typeof M.UPGRADES,string,string][]=[['health','❤️ Health','+25 maximum health'],['attack','⚔️ Attack','+3 attack'],['defense','🛡️ Defense','+4 defense'],['crit','✨ Critical chance','+2.5% critical chance']];openDialog('upgrade','A wish for something more',`<div class="stat-strip"><span>❤️ ${stats.maxHp}</span><span>⚔️ ${stats.attack.toFixed(1)}</span><span>🛡️ ${stats.defense}</span><span>✨ ${Math.round(stats.critChance*100)}%</span></div><div class="upgrade-grid">${options.map(([id,name,description])=>`<div><h3>${name}</h3><p>${description}</p><button class="primary" data-action="upgrade" data-kind="${id}" ${state.energy<M.upgradeCost(state,id)||id==='crit'&&state.critUp>=28?'disabled':''}>ϟ ${M.upgradeCost(state,id)}</button></div>`).join('')}</div>`,'THE WISHING CRYSTAL');}
function cooking(){const ingredients=Object.entries(state.bag).filter(([id,n])=>n!>0&&M.ITEMS['cooked_'+id]);openDialog('cook','A warm meal for the trail',`<p class="intro">Cook crops, fish, and meat for stronger healing and longer effects. Cooking is free at your garden kitchen.</p><div class="shop-grid">${ingredients.map(([id,n])=>`<div class="shop-item"><span class="shop-icon">${M.ITEMS[id].icon}</span><div><strong>${esc(M.ITEMS[id].name)} ×${n}</strong><p>${esc(M.ITEMS['cooked_'+id].desc)}</p></div><div class="button-row"><button class="soft-button" data-action="cook-one" data-item="${id}">Cook 1</button><button class="primary" data-action="cook-all" data-item="${id}">Cook all</button></div></div>`).join('')||'<p class="empty-state">Bring crops, fish, or meat from your adventures.</p>'}</div>`,'VOLCANO KITCHEN');}
function crafting(){
  const recipes=M.RECIPES.map((recipe,index)=>({...recipe,index})).filter(r=>r.station===craftStation),categories=['All',...new Set(recipes.map(r=>r.category))];
  if(!categories.includes(craftTab))craftTab='All';
  openDialog('craft',craftStation==='forge'?'The ember forge':'Made with a little magic',`<nav class="panel-tabs" aria-label="Workshop categories">${categories.map(category=>`<button class="${craftTab===category?'active':''}" data-action="craft-tab" data-kind="${esc(category)}">${esc(category)}</button>`).join('')}</nav><div class="shop-grid">${recipes.filter(r=>craftTab==='All'||r.category===craftTab).map(r=>`<div class="shop-item"><span class="shop-icon">${M.ITEMS[r.result].icon}</span><div><strong>${esc(M.ITEMS[r.result].name)}${r.count&&r.count>1?` ×${r.count}`:''}</strong><p>${esc(M.ITEMS[r.result].desc)}</p><small>${Object.entries(r.materials).map(([id,n])=>`${M.ITEMS[id].icon} ${esc(M.ITEMS[id].name)} ${state.bag[id]||0}/${n}`).join(' · ')}</small></div><button class="primary" data-action="craft" data-index="${r.index}" ${!M.canCraft(state,r.index)?'disabled':''}>Craft · ϟ ${r.energy}</button></div>`).join('')||'<p class="empty-state">Collect materials on your travels, then return.</p>'}</div>`,craftStation==='forge'?'LAVA FURNACE':'WORKSHOP');
}
function decorations(){
  const owned=Object.entries(state.bag).filter(([id,n])=>n!>0&&(M.ITEMS[id].type==='decor'));
  openDialog('decor','Make this place your own',`<p class="intro">Place decorations on clear ground near home. Move around first to choose a spot, then select an item and tap the ground. R rotates before placement.</p><div class="shop-grid">${owned.map(([id,n])=>`<div class="shop-item"><span class="shop-icon">${M.ITEMS[id].icon}</span><div><strong>${esc(M.ITEMS[id].name)} ×${n}</strong></div><button class="primary" data-action="place-decor" data-item="${id}">Place</button></div>`).join('')||'<p>No decorations in your backpack. Browse the Decor tab at the shop.</p>'}</div><h3>Placed at home</h3><div class="shop-grid">${state.decorations.map(d=>`<div class="storage-row"><span>${M.ITEMS[d.id].icon} ${esc(M.ITEMS[d.id].name)}</span><button class="soft-button" data-action="remove-decor" data-id="${d.uid}">Pack away</button></div>`).join('')||'<p class="muted">A fresh canvas.</p>'}</div><button class="soft-button" data-action="decor-shop">Browse decorations</button>`,'YOUR HOME');
}
function beginPlacement(id:string){if(visiting)return;if(state.planet!=='home'){toast('Decorations belong at home. Return to your garden first.','🏡');return;}closeDialog();placement={id,rotation:0};$('#placement-bar').hidden=false;$('#placement-name').textContent=`${M.ITEMS[id].icon} Place ${M.ITEMS[id].name}`;}
function cancelPlacement(){placement=null;$('#placement-bar').hidden=true;}
function placeAt(x:number,y:number){
  const point=world.groundPoint(x,y);if(!placement||!point)return;
  if(world.blocked(point.x,point.z)||point.z<-19||Math.hypot(point.x,point.z)>24||world.entities.some(e=>e.kind==='plot'&&Math.hypot(e.x-point.x,e.z-point.z)<1.1)){toast('Choose clear ground inside the village.','🏡');return;}
  const {id,rotation}=placement;if(change(()=>M.placeDecoration(state,id,point.x,point.z,rotation))){cancelPlacement();world.syncDecorations();toast(`${M.ITEMS[id].name} placed.`,'🏡');}
}

function planets(){openDialog('travel','There’s a whole sky out there',`<p class="intro">Your village is always a free ride away.</p><div class="planet-grid">${Object.entries(M.PLANETS).map(([id,p])=>`<div class="planet-card ${id===state.planet?'here':''}"><span style="background:${p.sky}">${p.icon}</span><div><h3>${p.name}</h3><p>${p.description}</p><small>${state.visited.includes(id as M.PlanetId)?'✓ Discovered':`Level ${p.level}`}</small></div><button class="${id===state.planet?'soft-button':'primary'}" data-action="travel" data-planet="${id}" ${id===state.planet||state.level<p.level||state.energy<p.fare?'disabled':''}>${id===state.planet?'You are here':state.level<p.level?`🔒 Level ${p.level}`:p.fare?`Fly · ϟ ${p.fare}`:'Return home'}</button></div>`).join('')}</div>`,'STARSHIP STATION');}
function map(){openDialog('map','Every path is a possibility',`<p class="intro">Choose a place and your explorer will walk there.</p><div class="map-illustration"><div class="map-path"></div><span class="map-house">🏡</span><span class="map-trees">🌳 🌲 🌳</span><span class="map-garden">🌱 🌱</span><span class="map-pond">🎣</span><span class="map-rocket">🚀</span><span class="map-stall">🧺</span><b>Clover Village</b></div><div class="map-destinations">${(state.planet==='home'?[['plot','🌱','Garden'],['sell','🧺','Market'],['shop','🛍️','Outfitters'],['fish','🎣','Pond'],['upgrade','💎','Crystal'],['craft','🔨','Workshop'],['chest','📦','Storage'],['travel','🚀','Rocket']]:[['mine','💎','Crystal vein'],['travel','🚀','Rocket']]).map(([kind,icon,name])=>`<button class="soft-button" data-action="go" data-kind="${kind}">${icon} ${name}</button>`).join('')}${(world.planet==='home'?[['forest','🍄 Mushroom Forest'],['meadow','🌊 Lake Meadow'],['swamp','🌿 Chomper Swamp'],['canyon','🏜️ Redrock Canyon']]:[['wild','Explore the wild']]).map(([kind,label])=>`<button class="soft-button" data-action="wild" data-kind="${kind}">${label}</button>`).join('')}</div><p class="fineprint">${state.visited.length} of 9 worlds discovered · Click the ground to choose your own path.</p>`,'YOUR EXPLORER’S MAP');}
function settings(){openDialog('settings','Your little preferences',`<div class="settings-row"><div><strong>Gentle sound effects</strong><small>Soft notes for everyday discoveries</small></div><button class="toggle ${state.settings.sound?'on':''}" role="switch" aria-checked="${state.settings.sound}" aria-label="Sound effects" data-action="sound"></button></div><div class="settings-row"><div><strong>Low graphics mode</strong><small>Fewer shadows for a smoother journey</small></div><button class="toggle ${state.settings.lowGraphics?'on':''}" role="switch" aria-checked="${state.settings.lowGraphics}" aria-label="Low graphics mode" data-action="quality"></button></div><div class="settings-row"><div><strong>Camera distance</strong><small>See more of your little world</small></div><div class="button-row"><button class="soft-button" data-action="zoom-in" aria-label="Zoom in">−</button><span id="zoom-value">${Math.round(world.zoom)}</span><button class="soft-button" data-action="zoom-out" aria-label="Zoom out">＋</button></div></div><div class="save-note">🌱 <span>Your progress saves automatically ${persistence?'to your online account':'in this browser'}.${saveFailed?' Storage is unavailable. Keep this tab open to preserve this session.':''}</span></div><div class="button-row"><button class="soft-button" data-action="help">How to play</button><button class="text-button danger" data-action="reset-confirm">Start a new adventure</button></div><p class="fineprint">Zoo Garden · progress saved on this device when offline</p>`,'SETTINGS');}
function help(){openDialog('help','A small guide to a big world',`<div class="help-grid">${[['👣','Wander','Click or tap to walk; hold the ground to steer. Pinch or scroll to zoom. Arrow keys and the direction pad also move.'],['🌱','Grow','Click a garden bed, pick a free seed, and come back when it sparkles. Crops grow while you are away.'],['🧺','Trade','Sell your harvest at the pink market. Buy equipment at the blue stall. Equip it from your backpack (I).'],['⚔️','Be brave','Click a creature to follow and attack it. Space attacks nearby enemies. Q spins, W dashes, E stomps, and R uses your weapon’s special.'],['🎣','Catch a moment','Equip a fishing rod and visit the pond. Wait through the nibbles, press at the bite, then hold to reel and release during surges.'],['📖','Follow your curiosity','Complete story chapters, daily tasks, achievements, and collections. Collect rewards to level up. The rocket opens new worlds from level 5.'],['📦','Keep it safe','If you fall, loose items stay in a pink backpack where you fell. Your equipment, levels, and energy are safe. Store treasures in the chest.'],['⌨️','Handy shortcuts','I: backpack · J: journal · M: map · F: nearby interaction · Esc: close. The Home button brings you back safely.']].map(([icon,title,body])=>`<div><span>${icon}</span><h3>${title}</h3><p>${body}</p></div>`).join('')}</div>`,'MAKE YOURSELF AT HOME');}

function fish(waterId=fishingWater){
  fishingWater=waterId;
  const rod=M.weaponStats(state);
  if(rod.kind!=='rod'){const owned=(Object.keys(state.bag) as M.ItemId[]).find(id=>M.ITEMS[id].weapon?.kind==='rod');openDialog('fish-help','A quiet moment by the water',`<div class="grow-illustration">🎣</div><p class="center">Equip a fishing rod to cast your line. Better rods make difficult fish easier to land.</p><button class="primary wide" data-action="${owned?'equip-rod':'go'}" data-item="${owned??''}" data-kind="shop">${owned?'Equip a fishing rod':'Visit the outfitters'}</button>`,'FISHING');return;}
  const weights=M.FISH_WEIGHTS[waterId]??M.FISH_WEIGHTS.home,stats=M.activeStats(state),bait=(state.bag.worm??0)>0;
  const pool=weights.map(([id,weight])=>{const fish=M.FISH[id];return {id,weight:weight*(fish.rarity==='rare'?1+stats.luck+(rod.quality??0)*.4:fish.rarity==='legendary'?1+stats.luck*2+(rod.quality??0)*.6:1),min:fish.size[0],max:fish.size[1],junk:fish.rarity==='junk'};});
  const selected=selectCatch(pool),definition=M.FISH[selected.id],input=new FishingInput();input.ready=true;
  fishGame={input,simulation:new FishingSimulation({quality:rod.quality??0,power:definition.power,bait}),id:selected.id,size:selected.size,huge:selected.huge,bait,lastPhase:'cast',missedBites:0};
  openDialog('fishing','Just you and the water',`<div class="fishing-scene"><span class="ripple r1"></span><span class="ripple r2"></span><span class="bobber">🎣</span><span class="swimming-fish">🐟</span></div><h3 class="center" id="fish-message" role="status">Casting your line…</h3><div class="fish-stage" id="fish-stage">${bait?'🪱 Worm bait ready':'No bait · natural lure'}</div><div class="tension-label"><span>LINE TENSION</span><span id="tension-value">25%</span></div><div class="tension-track"><i class="safe-zone"></i><b id="tension-needle"></b></div><div class="tension-ends"><span>Slack</span><span>Steady</span><span>Snap!</span></div><div class="catch-progress"><i id="catch-fill"></i></div><button class="primary wide reel-button" id="reel-button" data-action="reel">Wait for a bite…</button><p class="fineprint">Press when the fish bites, then hold to reel. Release when it surges. Space holds; Enter toggles the focused button. Escape reels in and leaves.</p>`,'FISHING');
}
function updateFishing(dt:number){
  const f=fishGame;if(!f)return;const sim=f.simulation;sim.update(dt,f.input.held);
  if(sim.missedBites>f.missedBites){f.missedBites=sim.missedBites;if(f.bait)change(()=>M.removeItem(state.bag,'worm'));f.bait=(state.bag.worm??0)>0;sim.setBait(f.bait);toast('Missed the bite — wait for the next fish.','🎣');}
  if(sim.phase!==f.lastPhase){if(sim.phase==='bite'){f.input.clear();f.input.enable($<HTMLButtonElement>('#reel-button'));tone('success');}f.lastPhase=sim.phase;}
  $('#fish-message').textContent=sim.message;$('#fish-stage').textContent=sim.phase==='fight'?(sim.surge>0?'⚡ SURGE — release the line':'🐟 The fish is tiring — reel gently'):sim.phase==='bite'?'❗ BITE!':sim.phase==='nibble'?'The bobber is twitching…':'Watch the water';
  $('.fishing-scene').classList.toggle('surging',sim.surge>0);$('.fishing-scene').classList.toggle('biting',sim.phase==='bite');
  $('#tension-needle').style.left=`${Math.min(1,sim.tension)*100}%`;$('#tension-value').textContent=`${Math.round(sim.tension*100)}%`;$('#catch-fill').style.width=`${sim.progress*100}%`;
  $('#reel-button').setAttribute('aria-pressed',String(f.input.held));$('#reel-button').textContent=sim.phase==='bite'?'Hook now!':sim.phase==='fight'?f.input.held?'Reeling… release during surges':'Hold to reel · Space':'Wait for a bite…';
  if(!sim.finished)return;fishGame=null;
  if(f.bait)change(()=>M.removeItem(state.bag,'worm'));
  if(sim.phase==='escaped'){closeDialog();toast(sim.reason,'💧');return;}
  const caught=M.FISH[f.id];change(()=>M.grantCatch(state,f.id,f.size,f.huge));tone('success');
  openDialog('catch','A lovely little catch',`<div class="grow-illustration">${caught.icon}</div><h3 class="center">${esc(caught.name)}</h3><p class="center">${f.size} cm · ${f.huge?'Huge catch! · ':''}${caught.rarity}</p><p class="center muted">Recorded in your collection. Worth ϟ ${caught.sell} at the market.</p><div class="button-row center-row"><button class="soft-button" data-action="close">Lovely!</button><button class="primary" data-action="fish-again">Cast again →</button></div>`,'WELL CAUGHT');
}

world.onInteract=(e)=>{
  if(!started||uiBlocked())return;tone();if(visiting&&e.kind!=='travel'){toast('Enjoy looking around. Your own garden is waiting at home.','🌷');return;}const env=world.interactEnvironment(e);if(env){if(env.message)toast(env.message);save();updateHud();if(env.openCrafting){craftStation='forge';crafting();}return;}
  if(e.kind==='plot')plotDialog(e.index!);else if(e.kind==='sell')market();else if(e.kind==='shop')shop();else if(e.kind==='chest')storage();else if(e.kind==='upgrade')upgrades();else if(e.kind==='cook')cooking();else if(e.kind==='craft'){craftStation='craft';crafting();}else if(e.kind==='travel')planets();else if(e.kind==='fish')fish((e as Entity&{waterId?:string}).waterId??state.planet);
  else if(e.kind==='home'){change(()=>state.hp=M.maxHp(state));toast('Home, sweet home. Your health is restored.','🏡');}
  else if(e.kind==='dropped'){change(()=>M.recoverBag(state));world.syncDropped();toast('All your little treasures are back.','🎒');}
  else if(e.kind==='mine'){const index=e.index;if(index===undefined||!M.mineAvailable(state,state.planet,index)){toast('This crystal needs a moment to regrow.','💎');return;}if(!change(()=>M.claimMine(state,index)))return;world.burst(e.x,e.z,'#d9c9f3');toast('A crystal for your crafting collection!','💎');}
  else if(e.kind==='gift'){if(e.index===undefined)return;const outcome=change(()=>M.claimGift(state,e.index!));if(!outcome)return;e.mesh.visible=false;if(outcome.kind==='bomb'){for(const target of world.enemies)if(target.hp>0&&Math.hypot(target.x-e.x,target.z-e.z)<(outcome.radius??4.5))hit(target,Math.round(M.attack(state)*(outcome.damageMultiplier??3)));world.burst(e.x,e.z,'#ffb269',28);checkDefeat();}toast(outcome.label,'🎁');}
};
function grantDefeat(e:{id:string;xp:number;boss:boolean;type?:string;name?:string}){
  const loot=change(()=>M.grantDefeat(state,e.type??'slime',e.xp,e.boss));
  toast(`${e.name??'Creature'} defeated! +${e.xp} XP${loot.length?` · ${loot.map(item=>`${M.ITEMS[item.id]?.name??item.id} ×${item.count}`).join(', ')}`:''}`,e.boss?'👑':'✨');if(e.boss)tone('level');
}
function hit(e:Enemy,damage:number,stun=0,impact?:CombatHit,remote=false,hazard=false){
  if(e.hp<=0||(visiting&&!remote))return;if(!remote&&network.hit?.(e.id,damage,stun,impact))return;
  world.damageEnemy(e,damage,stun,hazard);floating(`${impact?.critical?'CRIT ':''}${damage}`,e.x,e.z,impact?.critical?'#ffcf65':'#fff0b5');
  if(impact?.lift&&e.hp>0)world.knockUpEnemy(e,impact.lift,.75);
  if(impact?.knock&&e.hp>0){const steps=Math.ceil(impact.knock/.2);for(let i=0;i<steps;i++)moveEnemy(e,e.x+impact.direction.x*impact.knock/steps,e.z+impact.direction.z*impact.knock/steps);}
  if(e.hp===0){const type=(e as Enemy&{type?:string}).type??'slime';if(network.onHostKill)network.onHostKill(e.id,e.xp,e.boss,type);else grantDefeat({...e,type});}
}
function basicAttack(e?:Enemy){
  if(!started||uiBlocked()||visiting||combatTimers.attackCooldown>0)return;
  if(combat.basic(e)){const stats=M.activeStats(state);combatTimers.attackCooldown=(M.weaponStats(state).cd??.4)/Math.max(.2,1+stats.haste);tone('hit');emitAction({kind:'basic'});}
}
world.onAttackEnemy=basicAttack;
function skillList(){const disguise=state.gear.disguise?M.DISGUISES[state.gear.disguise]:null;return disguise?.skills??[...BASE_SKILLS,SPECIALS[M.weaponStats(state).special??'fist']??SPECIALS.fist];}
function skill(index:number){
  if(!started||uiBlocked()||visiting||cooldowns[index]>0||index<0||index>3)return;
  const disguise=state.gear.disguise,weapon=M.weaponStats(state),skills=skillList();
  if(weapon.kind==='rod'&&!disguise){toast('Equip a combat weapon to use these skills.','🎣');return;}
  if(!(disguise?combat.disguise(disguise,index):combat.skill(index,weapon.special??'fist')))return;
  skillDurations[index]=skills[index].cd/Math.max(.2,1+M.activeStats(state).haste);cooldowns[index]=skillDurations[index];
  change(()=>recordEvent(state,'skill'));tone('hit');emitAction({kind:'skill',index,special:disguise??weapon.special});
}
function checkDefeat(){if(!started||state.hp>0)return false;fishGame=null;resetCombat();change(()=>M.die(state,world.position.x,world.position.z));rebuildHomePresentation('home');world.refreshPlayer();openDialog('death','A little rest, then try again',`<div class="grow-illustration">🌷</div><p class="center">You’re safe at home. Your level, energy, and equipped gear are safe too.</p><p class="center muted">${state.dropped?'Your loose items are waiting where you fell.':'Nothing was dropped.'}</p><button class="primary wide" data-action="close">Back on my feet →</button>`,'EVERY EXPLORER TAKES A TUMBLE');return true;}
world.onDamage=(amount,source='melee')=>{
  if(combatTimers.invulnerable>0||combat.invulnerable||(source==='melee'&&(combat.statuses.flight??0)>0)||!started||(!network.role&&uiBlocked())||visiting)return;
  const defense=M.activeStats(state).defense+(combat.statuses.armor>0?80:0),damage=Math.max(1,Math.round(amount*60/(defense+60)));
  state.hp=Math.max(0,state.hp-damage);combatTimers.invulnerable=.55;floating('-'+damage,world.position.x,world.position.z,'#f2aaa1');$('#damage-flash').classList.add('active');setTimeout(()=>$('#damage-flash').classList.remove('active'),160);
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
  applyState(next){state=next;const nameInput=document.querySelector<HTMLInputElement>('#name-input');if(nameInput)nameInput.value=state.name;visiting=null;visitHome=null;world.state=state;resetCombat();world.build(state.planet);world.refreshPlayer();if(modal==='bag')inventory();else if(modal==='quests')quests();else if(modal)closeDialog();updateHud();updateLabels();},
  setPersistence(handler){persistence=handler;},
  setNetworkHooks(hooks){network=hooks;world.networkRole=hooks.role;},
  applyRemoteHit(id,damage,stun=0,impact){const enemy=world.enemies.find(e=>e.id===id);if(enemy)hit(enemy,damage,stun,impact,true);},
  applyRemoteStatus(id,kind,duration){const enemy=world.enemies.find(e=>e.id===id);if(enemy)world.statusEnemy(enemy,kind,Math.min(12,duration));},
  applyRemoteMove(id,x,z){const enemy=world.enemies.find(e=>e.id===id);if(enemy)moveEnemy(enemy,x,z);},
  applySharedKill(id,xp,boss,type){if(sharedKills.has(id))return;sharedKills.add(id);if(sharedKills.size>500)sharedKills.delete(sharedKills.values().next().value!);grantDefeat({id,xp,boss,type});},
  applyRemoteEffect(effect){combatView.effect(effect);},
  applyRemoteDamage(amount,source){world.onDamage(amount,source==='shot'||source==='hazard'?source:'melee');},
  setVisiting(owner,home){
    if(owner&&owner===visiting&&home&&visitHome){
      const expanded=home.plots&&home.plots.length!==visitHome.plots.length,decorChanged=JSON.stringify(home.decorations??[])!==JSON.stringify(visitHome.decorations);
      visitHome.plots=structuredClone(home.plots??visitHome.plots);visitHome.decorations=structuredClone(home.decorations??visitHome.decorations);
      if(expanded){const position=world.position.clone();rebuildHomePresentation('home');world.position.copy(position);world.refreshPlayer();}
      else{world.syncCrops();if(decorChanged)world.syncDecorations();}
      updateLabels();return;
    }
    visiting=owner;resetCombat();closeDialog();
    if(owner&&home){visitHome={...structuredClone(state),planet:'home',plots:structuredClone(home.plots??state.plots),decorations:structuredClone(home.decorations??[])};world.state=visitHome;rebuildHomePresentation('home');}
    else{visitHome=null;world.state=state;rebuildHomePresentation(state.planet);}
    world.refreshPlayer();$('#visit-banner').hidden=!owner;$('#visit-banner').textContent=owner?`Visiting ${owner} · look around their garden`:'';updateLabels();
  },
  showNotice:message=>toast(message),
  onFrame(listener){frameListeners.add(listener);return()=>frameListeners.delete(listener);},
  onAction(listener){actionListeners.add(listener);return()=>actionListeners.delete(listener);},
};

function go(kind:string){closeDialog();const entities=world.entities.filter(e=>e.kind===kind);const entity=kind==='plot'?entities.find(e=>!world.state.plots[e.index!]?.crop)||entities[0]:entities[0];if(entity){world.select(entity);toast(`Off to ${kind==='plot'?'the garden':entity.name.toLowerCase()}…`,'👣');}else toast('That place is back in Clover Village.','🏡');}
function travelTo(id:M.PlanetId){if(!change(()=>M.travel(state,id))){toast('A little more energy or experience is needed.','🚀');return;}closeDialog();resetCombat();cancelPlacement();world.build(id);world.refreshPlayer();updateLabels();showZone(M.PLANETS[id].name);tone('level');}
app.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
  if(button.dataset.entity){const e=world.entities.find(e=>e.id===button.dataset.entity);if(e&&!modal)world.select(e);return;}
  const action=button.dataset.action,id=button.dataset.item as M.ItemId,index=Number(button.dataset.index);if(action!=='reel')tone();
  switch(action){
    case 'start':start();break;
    case 'color':state.color=button.dataset.color!;document.querySelectorAll<HTMLButtonElement>('.color-picker button').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});world.refreshPlayer();break;
    case 'close':closeDialog();break;case 'bag':inventory();break;case 'inspect':if(id){selectedItem=id;inventory();}break;case 'quests':quests();break;case 'map':map();break;case 'settings':settings();break;case 'help':help();break;
    case 'claim':if(change(()=>M.claimQuest(state))){tone('success');toast('A little milestone. A lovely reward!','🎁');if(modal)quests();}break;
    case 'plant':if(change(()=>M.plant(state,activePlot,id as M.CropId))){world.syncCrops();closeDialog();toast(`${M.CROPS[id as M.CropId].name} planted. Let the sunshine do its thing.`,'🌱');}break;
    case 'cook-one':case 'cook-all':if(change(()=>M.cook(state,id,action==='cook-all'?(state.bag[id]||0):1))){tone('success');cooking();}break;
    case 'fertilize-manure':if(change(()=>M.fertilize(state,activePlot,'manure'))){world.syncCrops();closeDialog();toast('Your crop will be ready sooner.','🌿');}break;
    case 'fertilize':if(change(()=>M.fertilize(state,activePlot))){world.syncCrops();closeDialog();toast('Ready to harvest!','🌿');}break;
    case 'expand':if(change(()=>M.expandGarden(state))){world.syncCrops();closeDialog();toast('A new little patch of possibility.','🌱');}else toast('You need more energy for a new bed.','ϟ');break;
    case 'shop-tab':shopTab=button.dataset.kind!;shop();break;
    case 'journal-tab':journalTab=button.dataset.kind as ProgressKind;quests();break;
    case 'start-challenge':if(change(()=>startChallenge(state,button.dataset.kind!))){quests();toast('Quick challenge started!','⏱️');}break;
    case 'reroll-daily':change(()=>rerollDaily(state,index));quests();break;
    case 'progress-claim':if(change(()=>claimProgress(state,button.dataset.kind as ProgressKind,button.dataset.id!))){tone('success');toast('Reward collected.','🎁');}quests();break;
    case 'plant-all':{const count=change(()=>M.plantAll(state,id));world.syncCrops();closeDialog();toast(`Planted ${count} garden beds.`,'🌱');break;}
    case 'harvest-all':{const count=change(()=>M.harvestAll(state));world.syncCrops();closeDialog();toast(`Harvested ${typeof count==='number'?count:Array.isArray(count)?count.length:0} crops.`,'🌾');break;}
    case 'unequip':{M.unequip(state,button.dataset.slot as M.GearSlot);world.refreshPlayer();save();inventory();break;}
    case 'craft-tab':craftTab=button.dataset.kind!;crafting();break;
    case 'decorations':decorations();break;
    case 'decor-shop':shopTab='Decor';shop();break;
    case 'place-decor':beginPlacement(id);break;
    case 'cancel-decor':cancelPlacement();break;
    case 'rotate-decor':if(placement){placement.rotation=(placement.rotation+Math.PI/2)%(Math.PI*2);$('#placement-name').textContent=`${M.ITEMS[placement.id].name} · ${Math.round(placement.rotation*180/Math.PI)}°`;}break;
    case 'remove-decor':if(change(()=>M.removeDecoration(state,button.dataset.id!))){world.syncDecorations();decorations();}break;
    case 'buy':if(change(()=>M.buy(state,id))){shop();toast(`${M.ITEMS[id].name} is in your backpack.`,'🎒');}break;
    case 'equip':if(change(()=>M.equip(state,id))){world.refreshPlayer();inventory();toast(`${M.ITEMS[id].name} equipped.`,'✨');}break;
    case 'eat':change(()=>M.eat(state,id));inventory();break;
    case 'sell-one':case 'sell-all':{const n=action==='sell-all'?M.looseQuantity(state,id):1;const value=change(()=>M.sell(state,id,n));if(value){tone('success');toast(`Sold for ${value} energy. Thank you, neighbor!`,'ϟ');}market();break;}
    case 'transfer':change(()=>M.transfer(state,id,button.dataset.direction==='store'));storage();break;
    case 'upgrade':if(change(()=>M.upgrade(state,button.dataset.kind as keyof typeof M.UPGRADES))){upgrades();tone('success');}break;
    case 'craft':if(change(()=>M.craft(state,index))){crafting();toast('Made with your own two hands. Check your backpack!','🔨');}break;
    case 'travel':travelTo(button.dataset.planet as M.PlanetId);break;
    case 'go':go(button.dataset.kind!);break;
    case 'wild':{closeDialog();const destinations:Record<string,[number,number]>={forest:[-30,0],meadow:[0,30],swamp:[0,-30],canyon:[30,0]};const destination=destinations[button.dataset.kind??'forest']??[0,-30];world.walkTo(destination[0],destination[1]);toast('Follow the path beyond the garden gate.','🍄');break;}
    case 'return-home':if(state.planet!=='home')travelTo('home');else{closeDialog();world.position.set(0,0,0);world.destination=null;world.route=[];world.selected=null;toast('Home, sweet home.','🏡');}break;
    case 'interact':world.interactNearest();break;case 'attack':basicAttack();break;case 'skill':skill(index);break;
    case 'equip-rod':change(()=>M.equip(state,id));world.refreshPlayer();closeDialog();fish();break;case 'fish-again':fish();break;
    case 'reel':if(fishGame&&event.detail===0){fishGame.input.toggle();}break;
    case 'sound':state.settings.sound=!state.settings.sound;save();settings();break;case 'quality':state.settings.lowGraphics=!state.settings.lowGraphics;world.setQuality(state.settings.lowGraphics);save();settings();break;
    case 'zoom-in':world.zoom=Math.max(13,world.zoom-2);world.resize();$('#zoom-value').textContent=String(world.zoom);break;case 'zoom-out':world.zoom=Math.min(33,world.zoom+2);world.resize();$('#zoom-value').textContent=String(world.zoom);break;
    case 'reset-confirm':openDialog('reset','Begin a brand-new story?',`<p class="intro">This replaces your ${persistence?'online account adventure':'offline adventure in this browser'}, including your garden, items, and levels.</p><div class="button-row"><button class="soft-button" data-action="settings">Keep my adventure</button><button class="primary danger-button" data-action="reset">Start fresh</button></div>`,'A FRESH START');break;
    case 'reset':{const settingsCopy={...state.settings};state=M.newGame(state.name,state.color);state.settings=settingsCopy;world.state=state;rebuildHomePresentation('home');world.refreshPlayer();resetCombat();selectedItem=null;save();closeDialog();updateHud();toast('Every adventure starts with a little seed.','🌱');break;}
  }
});
$('#dialog-layer').addEventListener('click',e=>{if(e.target===$('#dialog-layer'))closeDialog();});
$('#world').addEventListener('pointerdown',event=>{if(started&&!uiBlocked()){const e=event as PointerEvent;e.preventDefault();gestures.down(e.pointerId,e.clientX,e.clientY);$('#world').setPointerCapture(e.pointerId);}});
$('#world').addEventListener('pointermove',event=>{const e=event as PointerEvent;gestures.move(e.pointerId,e.clientX,e.clientY);});
$('#world').addEventListener('wheel',event=>{if(uiBlocked())return;const e=event as WheelEvent;e.preventDefault();world.zoom=Math.max(13,Math.min(38,world.zoom+e.deltaY*.015));world.resize();},{passive:false});

$('#world').addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]'))return;
  if(event.key==='Escape'){if(placement)cancelPlacement();else closeDialog();return;}
  if(modal&&event.key==='Tab'){const controls=Array.from($('#dialog').querySelectorAll<HTMLElement>('button:not(:disabled),input,a,[tabindex="0"]'));const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}return;}
  if((event.target as HTMLElement).matches('input,textarea')){if(event.key==='Enter'&&!started)start();return;}
  if(fishGame&&event.code==='Space'){event.preventDefault();fishGame.input.holdSpace();return;}
  if(!started||uiBlocked())return;
  if(event.key.startsWith('Arrow')){event.preventDefault();movement.pressKey(event.key);}
  if(event.repeat)return;
  const key=event.key.toLowerCase();if(placement&&key==='r'){placement.rotation=(placement.rotation+Math.PI/2)%(Math.PI*2);return;}if(key==='i')inventory();else if(key==='j')quests();else if(key==='m')map();else if(key==='f')world.interactNearest();else if(['q','w','e','r'].includes(key))skill(['q','w','e','r'].indexOf(key));else if(event.code==='Space'){event.preventDefault();basicAttack();}
});
document.addEventListener('keyup',e=>{movement.releaseKey(e.key);if(fishGame&&e.code==='Space')fishGame.input.releaseSpace();});
document.addEventListener('pointerdown',e=>{const target=(e.target as HTMLElement).closest<HTMLElement>('button');if(target?.dataset.move){e.preventDefault();movement.pressPointer(e.pointerId,target.dataset.move);target.setPointerCapture(e.pointerId);}if(target?.id==='reel-button'&&fishGame&&fishGame.input.ready){e.preventDefault();fishGame.input.pressPointer(e.pointerId);target.setPointerCapture(e.pointerId);}});
const releasePointer=(e:PointerEvent)=>{gestures.up(e.pointerId,e.type!=='pointerup');movement.releasePointer(e.pointerId);fishGame?.input.releasePointer(e.pointerId);};
document.addEventListener('pointerup',releasePointer);document.addEventListener('pointercancel',releasePointer);document.addEventListener('lostpointercapture',releasePointer);
window.addEventListener('blur',()=>{movement.clear();fishGame?.input.clear();gestures.clear();save();});window.addEventListener('beforeunload',save);document.addEventListener('visibilitychange',()=>{movement.clear();fishGame?.input.clear();gestures.clear();save();});
let previous=performance.now();
function frame(now:number){frameTime=frameTime*.9+(now-previous)*.1;const dt=Math.min(1,(now-previous)/1000);previous=now;elapsed+=dt;uiElapsed+=dt;
  // Simulate in small steps, then draw once. Movement remains consistent when a
  // browser throttles rendering, and collisions do not tunnel at a low frame rate.
  for(let remaining=dt;remaining>0;){const step=Math.min(.025,remaining);remaining-=step;const active=started&&!uiBlocked()&&!document.hidden,combatActive=started&&!document.hidden&&(!uiBlocked()||!!network.role);combatTimers.advance(step,combatActive);combat.update(step,combatActive);world.movementLocked=combat.locksMovement;world.playerFlying=(combat.statuses.flight??0)>0;world.playerStealth=(combat.statuses.stealth??0)>0;gestures.update(step,active);world.update(step,active,false,started&&!document.hidden&&(active||!!network.role));if(active)world.player.position.y+=combat.airborne;combatView.update(step,combat.projectiles,combatActive,combat.allies);if(started&&!document.hidden)M.tickEffects(state,step);if(fishGame&&!document.hidden)updateFishing(step);}world.render();for(const listener of frameListeners)listener(dt);
  if(uiElapsed>.12){uiElapsed=0;world.syncCrops();updateHud();updateLabels();if(modal==='plot'){const p=state.plots[activePlot],progress=M.cropProgress(p);$('#grow-fill').style.width=`${progress*100}%`;$('#grow-time').textContent=progress>=1?'Ready! Close this window and tap the crop to harvest.':`${Math.ceil((1-progress)*M.CROPS[p.crop!].duration/1000)} seconds until harvest`;}}
  if(elapsed>8){elapsed=0;if(started)save();}requestAnimationFrame(frame);
}
requestAnimationFrame(frame);


initOnline(gameBridge);
initPlatform(message=>toast(message));






