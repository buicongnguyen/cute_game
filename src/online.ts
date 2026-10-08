import type { GameBridge, NetworkDrop } from './game-bridge.ts';
import { newGame, cropProgress, ITEMS, type SaveState, type PlanetId, type Difficulty } from './model.ts';
import type { LookId } from './looks.ts';
import './online.css';
import { t, onLanguageChange } from './i18n.ts';
import {gameplayKey} from './gameplay-controls.ts';
import type {GameIntent,ActionReply} from './actions.ts';

interface GuestEntry { at:number;by:string;name:string;kind:'visit'|'water'|'gift'|'steal'|'message';what?:string;count?:number;text?:string }
interface Explorer { id:string;username?:string;name:string;color:string;level:number;gear:SaveState['gear'];look?:LookId;online?:boolean;x?:number;z?:number;y?:number;facing?:number;moving?:boolean;space?:string;planet?:string;difficulty?:string }
interface Home extends Explorer { discovered?:PlanetId[]; plots:SaveState['plots'];farm?:SaveState['farm'];placed?:unknown[];decorations?:unknown[];helper?:unknown;friends?:unknown[] }
interface EnemyState { id:string;x:number;z:number;hp:number;maxHp:number;[key:string]:unknown }
interface NetworkWorld {
  updateRemotePlayers(players:Explorer[]):void;clearRemotePlayers():void;
  setNetworkRole(role:'host'|'peer'|null):void;
  /** The host's difficulty while someone else hosts the room (creature scale, the Settings note); null otherwise. */
  roomDifficulty:Difficulty|null;
  enemySnapshots():EnemyState[];applyEnemySnapshots(enemies:EnemyState[]):void;
  environmentSnapshot():{time:number;lamps:[number,number][]};applyEnvironmentSnapshot(snapshot:{time:number;lamps:[number,number][]}):void;
  onRemoteDamage:(id:string,amount:number,source?:string,enemyId?:string)=>void;
  onEnvironmentAction:(action:{kind:'light-pillar'|'collect-ore';id:string;index?:number})=>void;
  applyEnvironmentAction(action:{kind:'light-pillar'|'collect-ore';id:string;index?:number}):{ok:boolean;rewards?:{id:string;count:number}[]};
  grantEnvironmentReward(eventId:string,rewards:{id:string;count:number}[]):unknown;
}
interface Session { authorityVersion?:number;account:Explorer|null;profile?:SaveState;revision?:number;friends?:Explorer[];requests?:Explorer[] }
interface ActionJob extends GameIntent {requestId:string;expectedRevision:number;rulesVersion:1;submitted?:boolean;retries?:number}
interface ChatAttempt { requestId:string;draft:string;accountId:string;room:string;connection:WebSocket;pending:boolean;timer?:number }
const el = <K extends keyof HTMLElementTagNameMap>(tag:K,className='',text='') => {const node=document.createElement(tag);node.className=className;node.textContent=text;return node;};
const button=(label:string,action:()=>void,className='')=>{const node=el('button',className,t(label));node.type='button';node.addEventListener('click',action);return node;};

function initSoloEdition() {
  const dialog=el('dialog','social-dialog');dialog.id='online-dialog';
  const close=button('✕',()=>dialog.close(),'social-close');
  const header=el('header','social-header'),heading=el('h2');header.append(heading,close);
  const content=el('div','social-content'),intro=el('p','social-intro'),details=el('p','social-small'),keepPlaying=button('Keep playing',()=>dialog.close(),'social-primary');
  content.append(intro,details,keepPlaying);dialog.append(header,content);document.body.append(dialog);
  const slot=document.querySelector('#social-slot');
  const toggle=button('🌱',()=>dialog.showModal(),'social-toggle');toggle.id='online-button';toggle.dataset.staticHost='true';
  if(slot){slot.append(toggle);toggle.classList.add('social-inline-toggle');}else document.body.append(toggle);
  const refresh=()=>{
    dialog.setAttribute('aria-label',t('Solo adventure'));close.setAttribute('aria-label',t('Close solo information'));
    heading.textContent=t('Solo adventure');intro.textContent=t('Explore, grow your garden, and complete every adventure on your own. Your progress saves in this browser.');
    details.textContent=t('This GitHub Pages edition plays solo. Accounts, friends, and shared worlds are available in the multiplayer edition.');
    keepPlaying.textContent=t('Keep playing');toggle.textContent=slot?'🌱':`🌱 ${t('Solo adventure')}`;toggle.title=t('Solo adventure');toggle.setAttribute('aria-label',t('About this solo adventure'));
  };
  refresh();onLanguageChange(refresh);
  // If this edition was built with the address of a multiplayer server (VITE_ONLINE_URL), the title screen's "Play online" link shows only while that server answers; otherwise it stays hidden and nothing says "multiplayer".
  const server=String(import.meta.env.VITE_ONLINE_URL||'').replace(/\/+$/,''),link=document.querySelector<HTMLAnchorElement>('#online-link');
  if(server&&link){
    const check=async()=>{
      const abort=new AbortController(),timer=window.setTimeout(()=>abort.abort(),4000);
      try{const reply=await fetch(`${server}/api/health`,{headers:{'ngrok-skip-browser-warning':'1'},cache:'no-store',signal:abort.signal}),info=await reply.json();
        link.hidden=!(reply.ok&&info?.ok);if(!link.hidden)link.textContent=`🌐 ${t('Play online with friends')}${Number.isFinite(info.online)&&info.online>0?` · ${t('{n} online',{n:info.online})}`:''} →`;}
      catch{link.hidden=true;}finally{clearTimeout(timer);}
    };
    void check();window.setInterval(()=>{if(!document.hidden)void check();},60_000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
  }
}

export function initOnline(game:GameBridge) {
  // Static hosting has no account API or WebSocket server. Leave local saves intact.
  if(import.meta.env.VITE_STATIC_HOST==='true'){initSoloEdition();return;}
  const serviceBase=import.meta.env.BASE_URL;
  let account:Explorer|null=null,friends:Explorer[]=[],requests:Explorer[]=[],sent:Explorer[]=[],visitLog:GuestEntry[]=[],unreadLog=0,socket:WebSocket|null=null;
  let host:string|null=null,party:string|null=null,planet='',visiting:string|null=null,offline:SaveState|null=null,roomEpoch=0;
  let reconnect:number|undefined,saveTimer:number|undefined,saving:Promise<void>|null=null,stopped=false,revision=0,sessionEpoch=0;
  let actionQueue:ActionJob[]=[];const waiting=new Map<string,{resolve:(reply:ActionReply)=>void;reject:(error:Error)=>void}>();
  const pendingSave=()=>actionQueue.length>0;
  let poseClock=0,enemyClock=0,tab:'world'|'friends'|'diary'|'account'='world',register=false,status='Play together',authBusy=false;
  let authSubmit:HTMLButtonElement|null=null;
  const players=new Map<string,Explorer>(),rewardIds=new Set<string>(),chat:{name:string;message:string}[]=[];
  let chatRoom:string|null=null,chatDraft='',chatReady=false,chatAttempt:ChatAttempt|null=null;
  let sharingLoot=false;
  const toggle=button(`👥 ${t('Play together')}`,()=>{render();dialog.showModal();},'social-toggle');toggle.id='online-button';const socialSlot=document.querySelector('#social-slot');if(socialSlot){socialSlot.append(toggle);toggle.classList.add('social-inline-toggle');}else document.body.append(toggle);toggle.setAttribute('aria-label',t('Play together'));
  const dialog=el('dialog','social-dialog');dialog.id='online-dialog';dialog.setAttribute('aria-label',t('Play together'));document.body.append(dialog);
  const header=el('header','social-header'),heading=el('h2','',t('Play together')),close=button('✕',()=>dialog.close(),'social-close');close.setAttribute('aria-label',t('Close online menu'));header.append(heading,close);
  const tabs=el('nav','social-tabs'),content=el('div','social-content'),notice=el('p','social-notice');notice.setAttribute('role','status');dialog.append(header,tabs,notice,content);
  dialog.addEventListener('click',event=>{if(event.target===dialog&&event.clientX&&(event.clientX<dialog.getBoundingClientRect().left||event.clientX>dialog.getBoundingClientRect().right))dialog.close();});
  const world=()=>game.getWorld() as ReturnType<GameBridge['getWorld']> & NetworkWorld;
  let noticeSource='',noticeParams:Record<string,string|number>={},saveStatusSource='';
  function setNotice(message:string,params:Record<string,string|number>={}){noticeSource=message;noticeParams=params;notice.textContent=t(message,params);}
  function announce(message:string,params:Record<string,string|number>={}){setNotice(message,params);game.showNotice(t(message,params));}
  function setSaveStatus(message:string){saveStatusSource=message;const label=document.querySelector('#save-status');if(label)label.textContent=t(message);}
  async function api<T>(path:string,data?:unknown,method=data?'POST':'GET'):Promise<T>{
    // A fetch that never reaches the server (offline, DNS, server down) rejects with the browser's own English text ("Failed to fetch",
    // "Load failed"): say it in the game's words instead. No status, so flushSave keeps the action for a retry as before.
    let response:Response;try{response=await fetch(`${serviceBase}api/${path}`,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});}catch{throw new Error('Connection interrupted. Please try again.');}
    let value:{error?:string};try{value=await response.json();}catch{throw new Error('Online play needs the game server. Your offline adventure is ready to play.');}
    if(!response.ok)throw Object.assign(new Error(value.error||'Connection interrupted. Please try again.'),{status:response.status});return value as T;
  }
  const send=(value:unknown)=>{if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify(value));return true;}return false;};
  function captureChatDraft(){const input=content.querySelector<HTMLInputElement>('.social-chat-input');if(input)chatDraft=input.value;}
  function refreshChatControls(){
    const input=content.querySelector<HTMLInputElement>('.social-chat-input');if(input)input.value=chatDraft;
    const submit=content.querySelector<HTMLButtonElement>('.social-chat-send');if(submit){submit.disabled=!!chatAttempt?.pending||!chatReady;submit.textContent=t(chatAttempt?.pending?'Sending…':'Send');}
  }
  function stopChatWait(){if(chatAttempt?.timer!==undefined){clearTimeout(chatAttempt.timer);chatAttempt.timer=undefined;}}
  function releaseChat(message?:string){captureChatDraft();stopChatWait();if(chatAttempt)chatAttempt.pending=false;refreshChatControls();if(message)announce(message);}
  function clearChat(room:string|null=null){
    stopChatWait();chatAttempt=null;chatRoom=room;chatDraft='';chatReady=false;chat.length=0;
    const input=content.querySelector<HTMLInputElement>('.social-chat-input');if(input)input.value='';renderChat();refreshChatControls();
  }
  function chatMatches(requestId:unknown,connection:WebSocket){return !!chatAttempt&&chatAttempt.requestId===requestId&&chatAttempt.accountId===account?.id&&chatAttempt.room===chatRoom&&chatAttempt.connection===connection;}
  function acknowledgeChat(requestId:unknown,connection:WebSocket){
    if(!chatMatches(requestId,connection))return;captureChatDraft();const sent=chatAttempt!;stopChatWait();
    if(chatDraft===sent.draft)chatDraft='';chatAttempt=null;refreshChatControls();setNotice('Message sent.');
  }
  function submitChat(){
    captureChatDraft();if(chatAttempt?.pending||!chatDraft.trim())return;
    if(!account||!chatRoom||!chatReady||socket?.readyState!==WebSocket.OPEN){announce('Chat is reconnecting. Your draft is kept.');return;}
    // Reuse an uncertain delivery's ID so a retry cannot broadcast an accepted message twice.
    const previous=chatAttempt,requestId=previous&&previous.accountId===account.id&&previous.room===chatRoom&&previous.draft===chatDraft?previous.requestId:crypto.randomUUID();
    stopChatWait();const attempt:ChatAttempt={requestId,draft:chatDraft,accountId:account.id,room:chatRoom,connection:socket,pending:true};chatAttempt=attempt;
    refreshChatControls();setNotice('');
    try{socket.send(JSON.stringify({type:'chat',message:attempt.draft,requestId}));}
    catch{releaseChat('Chat is reconnecting. Your draft is kept.');return;}
    attempt.timer=window.setTimeout(()=>{if(chatAttempt===attempt&&attempt.pending)releaseChat('Message delivery is unconfirmed. Your draft is kept; you can try sending again.');},10000);
  }
  function sendRoom(value:{type:string;planet?:string;party?:string|null;id?:string}){
    if(!send(value))return false;
    // The server intentionally sends no new joined event for a room we already occupy.
    const sameRoom=value.type==='join'&&`${value.party?.trim().toUpperCase()||'public'}:${value.planet||'home'}`===chatRoom;
    if(!sameRoom){captureChatDraft();chatReady=false;refreshChatControls();}return true;
  }

  /** A private message to a friend, online or not: it shows in their guest diary and pops up if they are playing. */
  function messageForm(friendId:string,box:HTMLElement){
    box.replaceChildren(el('h4','',t('Message')));
    const form=el('form','social-inline'),input=el('input');input.maxLength=120;input.placeholder=t('Write a short message…');input.setAttribute('aria-label',t('Message'));input.name='friend-message';
    const submit=el('button','',t('Send'));submit.type='submit';form.append(input,submit);
    form.addEventListener('submit',event=>{event.preventDefault();const text=input.value.trim();if(!text)return;if(send({type:'dm',to:friendId,text})){input.value='';announce('Message sent.');}});
    box.append(form);input.focus();
  }
  /** Gifts: pick things from your bag to hand a friend (server: friends only, a daily limit; it lands in their chest). */
  function giftPicker(friendId:string,box:HTMLElement){
    box.replaceChildren(el('h4','',t('Give from your bag')));
    const bag=Object.entries(game.getState().bag).filter(([id,n])=>(n??0)>0&&ITEMS[id]).sort((a,b)=>(b[1]??0)-(a[1]??0)).slice(0,16);
    if(!bag.length){box.append(el('p','social-small',t('Your bag is empty.')));return;}
    const list=el('div','social-actions');
    for(const [id,n] of bag)list.append(button(`${t(ITEMS[id].name)} ×${n}`,async()=>{try{await queueAction({type:'giftFriend',payload:{ownerId:friendId,item:id,count:1}});announce('Gift sent!');giftPicker(friendId,box);}catch(error){announce((error as Error).message);}}));
    box.append(list);
  }
  function openPlayer(id:string){
    const player=players.get(id);if(!player||id===account?.id)return;captureChatDraft();render();dialog.showModal();
    const card=el('section','social-player-card'),title=el('h3','',player.name),actions=el('div','social-actions');card.append(title);
    if(player.username)card.append(el('p','social-small','@'+player.username));
    if(friends.some(friend=>friend.id===id)){actions.append(button('Visit garden',()=>{sendRoom({type:'visit',id});dialog.close();}));const gifts=el('div','social-gifts');actions.append(button('Send a gift',()=>giftPicker(id,gifts)),button('Message',()=>messageForm(id,gifts)));card.append(gifts);}
    else actions.append(button('Send friend request',async()=>{try{await api('friends/request',{id});announce('Friend request sent.');}catch(error){announce((error as Error).message);}}));
    card.append(actions);content.prepend(card);
  }
  world().onRemotePlayerClick=openPlayer;
  document.addEventListener('keydown',event=>{
    if(gameplayKey(event)!=='Enter'||event.repeat||(event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))return;
    if(document.querySelector('#dialog-layer:not([hidden])')||!account)return;event.preventDefault();captureChatDraft();tab='world';render();if(!dialog.open)dialog.showModal();content.querySelector<HTMLInputElement>('.social-chat-input')?.focus();
  });
  /** One line for the guest diary and for the toast when a friend does something at your home. */
  function guestLine(e:GuestEntry){const what=e.what&&ITEMS[e.what]?t(ITEMS[e.what].name):'';
    return e.kind==='water'?t('{name} watered your {item}!',{name:e.name,item:what}):e.kind==='gift'?t('{name} sent you a gift: {count} {item}',{name:e.name,count:e.count??1,item:what}):e.kind==='steal'?t('{name} picked your {item}!',{name:e.name,item:what}):e.kind==='message'?`${e.name}: ${e.text??''}`:t('{name} is visiting your garden',{name:e.name});}
  const ago=(at:number)=>{const s=Math.max(0,(Date.now()-at)/1000);return s<60?t('just now'):s<3600?t('{n} min ago',{n:Math.floor(s/60)}):s<86400?t('{n} h ago',{n:Math.floor(s/3600)}):t('{n} d ago',{n:Math.floor(s/86400)});};
  function refreshButton(){const label=account?t(status,{code:party||''}):t('Play together');toggle.textContent=socialSlot?'👥':`👥 ${label}`;toggle.dataset.badge=String(requests.length+unreadLog||'');world().friendIds=new Set(friends.map(f=>f.id));toggle.title=label;toggle.setAttribute('aria-label',t('Play together'));dialog.setAttribute('aria-label',t('Play together'));close.setAttribute('aria-label',t('Close online menu'));toggle.dataset.online=String(!!account);}
  function expireSession(){
    if(!account)return;game.setDungeonSender?.(null);sessionEpoch++;stopped=true;if(reconnect)clearTimeout(reconnect);if(saveTimer)clearTimeout(saveTimer);
    clearChat();const previous=socket;socket=null;previous?.close();account=null;host=null;party=null;visiting=null;players.clear();rejectActions('Your session ended. Pending actions remain on this device.');
    authority(null);world().clearRemotePlayers();game.setVisiting(null);game.setPersistence(null);game.setActionHandler(null);const previousOffline=offline||game.getOfflineState();if(previousOffline)game.applyState(previousOffline);offline=null;
    status='Play together';setSaveStatus('● Offline adventure restored');refreshButton();render();announce('Your online session ended. Sign in again to continue; pending online progress is kept on this device.');
  }
  /** Mirrors the host's difficulty into the world (server.mjs presence carries it). */
  function syncRoomDifficulty(){const d=host&&host!==account?.id?players.get(host)?.difficulty:null;world().roomDifficulty=d==='easy'||d==='normal'||d==='hard'?d:null;}
  function renderPlayers(){
    syncRoomDifficulty();
    const local=game.getPresence();const space=visiting?`home:${visiting}`:local.planet==='home'&&Math.hypot(local.x,local.z)<18?`home:${account?.id}`:'wild';
    world().updateRemotePlayers([...players.values()].filter(player=>player.id!==account?.id&&player.planet===local.planet&&(player.space==='wild'||player.space===space)));
  }
  function authority(next:string|null,enemies?:EnemyState[]){
    const becomingHost=next===account?.id&&host!==next;host=next;syncRoomDifficulty();
    if(enemies?.length&&(becomingHost||host!==account?.id))world().applyEnemySnapshots(enemies);
    const role=account&&socket?.readyState===WebSocket.OPEN?(host===account.id?'host':'peer'):null;
    world().setNetworkRole(role);
    if(!role){world().localPlayerId=account?.id??'local';world().onRemoteDamage=()=>{};world().onEnvironmentAction=()=>{};game.setNetworkHooks({role:null});return;}
    world().localPlayerId=account?.id??'local';
    world().onRemoteDamage=(id,_amount,source,enemyId)=>{if(role==='host'&&enemyId)send({type:'damage',id,source,enemyId});};
    world().onEnvironmentAction=action=>{send({type:'environmentAction',action});};
    game.setNetworkHooks({role,hit:()=>true,status:()=>true,moveTarget:()=>true,reportDamage:(enemyId,source)=>{if(role==='host')send({type:'damage',id:account?.id,source,enemyId});},reportDecoy:(owner,decoy,enemyId,source)=>{if(role==='host')send({type:'damage',id:owner??account?.id,source,enemyId,decoy});},visitCrop:index=>{
      const plot=world().state.plots[index];if(!visiting||!plot?.crop)return;
      // A growing crop is watered (it ripens sooner for the owner); a ripe one can be picked as before.
      if(cropProgress(plot)<1){void queueAction({type:'waterFriend',payload:{ownerId:visiting,index,generation:plot.generation}}).then(reply=>{const r=(reply as {result?:{xp?:number;left?:number}}).result;if(r?.xp)announce('💧 You watered the plant: 10% less remaining growing time. +{xp} XP · {count} waterings left in this garden today.',{xp:r.xp,count:r.left??0});else announce('You watered the plant. It will ripen a little sooner!');}).catch(error=>announce(error.message));return;}
      void queueAction({type:'stealCrop',payload:{ownerId:visiting,index,generation:plot.generation}}).catch(error=>announce(error.message));
    }});
  }

  function rememberActions(){if(!account)return;try{localStorage.setItem(`cute-game-actions-${account.id}`,JSON.stringify(actionQueue));}catch{/* Server receipts also make same-ID retries safe. */}}
  function rejectActions(message:string){for(const waiter of waiting.values())waiter.reject(new Error(message));waiting.clear();actionQueue=[];}
  function queueAction(intent:GameIntent):Promise<ActionReply>{
    if(!account||stopped)return Promise.reject(new Error('Reconnect before changing your online adventure.'));
    const job:ActionJob={...structuredClone(intent),requestId:`r${revision}-${crypto.randomUUID()}`,expectedRevision:revision,rulesVersion:1};actionQueue.push(job);rememberActions();setSaveStatus('◌ Saving online…');
    const answer=new Promise<ActionReply>((resolve,reject)=>waiting.set(job.requestId,{resolve,reject}));void flushSave();return answer;
  }
  async function shareNearbyLoot(){
    if(!account||visiting||sharingLoot)return;sharingLoot=true;const actorId=account.id,epoch=sessionEpoch,room=chatRoom;
    try{
      const result=await api<{drops:NetworkDrop[]}>('drops');if(account?.id!==actorId||sessionEpoch!==epoch||chatRoom!==room||visiting)return;
      const here=game.getPresence(),now=Date.now(),own=(result.drops||[]).filter(drop=>drop.owner===actorId&&drop.room===room&&drop.planet===here.planet&&drop.expiresAt>now&&drop.releaseAt>now&&Math.hypot(drop.x-here.x,drop.z-here.z)<=12);
      if(!own.length){announce('There is no protected loot of yours nearby.');return;}
      let count=0;for(const drop of own){if(account?.id!==actorId||sessionEpoch!==epoch||chatRoom!==room||visiting)return;await queueAction({type:'releaseDrop',payload:{ownerId:drop.ownerId,id:drop.id}});count++;}
      if(account?.id===actorId&&sessionEpoch===epoch)announce('Shared {count} nearby loot drops.',{count});
    }catch(error){if(account?.id===actorId&&sessionEpoch===epoch)announce((error as Error).message);}finally{sharingLoot=false;}
  }
  // Progress reaches the server only as an explicit intent, never a profile snapshot.
  function queueSave(_state:SaveState){if(actionQueue.length)void flushSave();}
  let retryMs=500; // a failed save is retried quickly at first, then backs off to 5 s
  async function flushSave(){
    if(saving)return saving;if(!actionQueue.length||!account||stopped)return;
    const accountId=account.id,epoch=sessionEpoch;
    saving=(async()=>{while(actionQueue.length&&account?.id===accountId&&sessionEpoch===epoch&&!stopped){const job=actionQueue[0];
      try{if(!job.submitted){job.expectedRevision=revision;job.submitted=true;rememberActions();}const {submitted,retries,...body}=job;void submitted;void retries;const reply=await api<ActionReply>('actions',body);if(account?.id!==accountId||sessionEpoch!==epoch)return;
        if(reply.revision>=revision){revision=reply.revision;game.applyAuthoritativeState(reply.profile);}actionQueue.shift();rememberActions();retryMs=500;waiting.get(job.requestId)?.resolve(reply);waiting.delete(job.requestId);
        // A new unsubmitted intent follows the revision returned by the preceding transaction.
        rememberActions();
        status=socket?.readyState===WebSocket.OPEN?'Online':'Reconnecting';setSaveStatus(actionQueue.length?'◌ Saving online…':'● Saved online');refreshButton();
      }catch(error){if(account?.id!==accountId||sessionEpoch!==epoch)return;const statusCode=(error as {status?:number}).status;
        if(statusCode===401){expireSession();return;}
        if(statusCode===409||statusCode===410||statusCode===426){try{const fresh=await api<Session>('auth/session');if(account?.id!==accountId||sessionEpoch!==epoch)return;if(!fresh.account){expireSession();return;}if(fresh.account.id!==accountId){begin(fresh);return;}revision=fresh.revision||0;if(fresh.profile)game.applyAuthoritativeState(fresh.profile);
          // Someone else changed this account meanwhile (a visitor watered a crop, say): the action itself is fine, so retry it on the new revision instead of dropping it (the server replays it if the first try had gone through).
          if(statusCode===409){job.retries=(job.retries??0)+1;if(job.retries<=3){job.expectedRevision=revision;rememberActions();continue;}}}catch{break;}}
        if(statusCode&&statusCode<500){actionQueue.shift();rememberActions();waiting.get(job.requestId)?.reject(error as Error);waiting.delete(job.requestId);continue;}
        status='Action pending';setSaveStatus('○ Action pending — reconnect to finish');refreshButton();break;
      }
    }})().finally(()=>{saving=null;if(actionQueue.length&&account&&!stopped){if(sessionEpoch!==epoch)void flushSave();else {saveTimer=window.setTimeout(()=>void flushSave(),retryMs);retryMs=Math.min(5000,retryMs*2);}}});
    return saving;
  }
  function connect(){
    if(!account||stopped)return;releaseChat();chatReady=false;refreshChatControls();let desiredParty=party,restoring=false,fallbackJoin:any=null;const desiredPlanet=game.getPresence().planet;const socketUrl=new URL(`${serviceBase}socket`,location.href);socketUrl.protocol=location.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(socketUrl);
    const connection=socket;
    function joined(message:any){
      if(desiredParty&&message.party!==desiredParty){if(!restoring){restoring=true;fallbackJoin=message;sendRoom({type:'join',planet:desiredPlanet,party:desiredParty});}return;}
      const nextRoom=typeof message.room==='string'?message.room:`${message.party||'public'}:${message.planet}`;if(chatRoom!==nextRoom)clearChat(nextRoom);chatReady=true;
      desiredParty=null;restoring=false;if(visiting)game.setVisiting(null);players.clear();for(const player of message.players||[])players.set(player.id,player);party=message.party;planet=message.planet;visiting=typeof message.visiting==='string'?message.visiting:null;
      // A visit changes the room, never the owner's saved adventure planet.
      if(message.enemies?.length)world().applyEnemySnapshots(message.enemies);game.clearNetworkDrops();const dropEpoch=++roomEpoch;void api<{drops:NetworkDrop[]}>('drops').then(result=>{if(socket===connection&&roomEpoch===dropEpoch&&chatRoom===nextRoom&&!visiting&&account)for(const drop of result.drops||[])if(drop.room===nextRoom)game.spawnNetworkDrop(drop,account.id);}).catch(()=>{});if(message.environment)world().applyEnvironmentSnapshot(message.environment);authority(message.host,message.enemies);renderPlayers();status=party?'Party {code}':'Online';refreshButton();if(dialog.open)render();else refreshChatControls();
    }
    socket.addEventListener('open',()=>{if(socket!==connection)return;status='Online';refreshButton();send({type:'active',active:!document.hidden});void flushSave();game.setDungeonSender?.(value=>socket===connection&&send(value));});
    socket.addEventListener('message',event=>{
      if(socket!==connection)return;let message:any;try{message=JSON.parse(event.data);}catch{return;}
      if(message.type==='welcome'){friends=message.friends||[];requests=message.requests||[];sent=message.sent||[];visitLog=message.visitLog||[];refreshButton();}
      else if(message.type==='joined')joined(message);
      else if(message.type==='authority'){if(message.environment)world().applyEnvironmentSnapshot(message.environment);authority(message.host,message.enemies);}
      else if(message.type==='enter'||message.type==='pose'){if(message.player?.id){const merged=message.delta&&players.has(message.player.id)?{...players.get(message.player.id),...message.player}:message.player;for(const key of Object.keys(merged))if(merged[key]===null)delete (merged as Record<string,unknown>)[key];players.set(message.player.id,merged);}renderPlayers();}
      else if(message.type==='leave'){players.delete(message.id);renderPlayers();}
      // The server dropped a pose that outran its movement budget (server/pose-budget.mjs): go back to its spot, so the proximity rules agree with the screen again.
      else if(message.type==='poseFix'){const w=world();if(message.planet===w.planet&&(message.visit??null)===visiting&&Number.isFinite(message.x)&&Number.isFinite(message.z)){w.position.set(message.x,w.position.y,message.z);w.destination=null;w.route=[];w.selected=null;}}
      else if(message.type==='enemies')world().applyEnemySnapshots(message.enemies);
      else if(message.type==='profile'&&message.authorityVersion===1&&message.profile&&message.revision>=revision){revision=message.revision;game.applyAuthoritativeState(message.profile);}
      else if(message.type==='enemyHealth')world().applyAuthoritativeEnemyHealth(message);
      else if(message.type==='colossus'||message.type==='colossusHit')dispatchEvent(new CustomEvent('zoo-colossus',{detail:message}));// colossus.ts
      else if(message.type==='environment')world().applyEnvironmentSnapshot(message.snapshot);
      else if(message.type==='gardenEvent'){
        if(message.blocked){
          const current=world(),farm=current.farmView;
          const target=()=>{if(world()!==current||current.farmView!==farm||current.planet!=='home'||!(visiting===message.ownerId||!visiting&&account?.id===message.ownerId))return null;const local=message.by===account?.id,thief=local?current.position:players.get(message.by);if(!thief||!Number.isFinite(thief.x)||!Number.isFinite(thief.z)||!local&&players.get(message.by)?.space!==`home:${message.ownerId}`)return null;return{x:thief.x!,z:thief.z!};};
          const thief=target();if(thief)farm?.guardBite(thief,target);
          if(message.by===account?.id)announce('The guard dog protected this garden. You lost {damage} HP.',{damage:message.damage||0});
        }
        else if(!message.blocked&&message.by===account?.id)announce('Crop collected. {count} visits left here today.',{count:message.remaining||0});
      }
      else if(message.type==='dropSpawn'&&message.drop)game.spawnNetworkDrop(message.drop,account!.id);
      else if(message.type==='dropClaimed')game.removeNetworkDrop(message.id);
      else if(message.type==='dropReleased')game.releaseNetworkDrop(message.id);
      else if(message.type==='healthResult')game.applyAuthorityHealth(message.delta||0,!!message.died);
      else if(message.type==='decoyHp'&&Number.isFinite(message.id)&&Number.isFinite(message.hp))game.applyDecoyHp(message.id,message.hp,String(message.kind),Number(message.x)||0,Number(message.z)||0);
      else if(typeof message.type==='string'&&message.type.startsWith('dg'))game.dungeonMessage?.(message);
      else if(message.type==='chatAck')acknowledgeChat(message.requestId,connection);
      else if(message.type==='chat'&&!restoring&&chatRoom){chat.push({name:String(message.name),message:String(message.message)});if(chat.length>60)chat.shift();if(dialog.open&&tab==='world')renderChat();else game.showNotice(`${message.name}: ${message.message}`);}
      else if(message.type==='friends'){const before=requests.length;friends=message.friends||[];requests=message.requests||[];sent=message.sent||[];visitLog=message.visitLog||visitLog;if(requests.length>before)announce('You have a new friend request!');refreshButton();if(dialog.open&&tab==='friends')render();}
      else if(message.type==='dmSent'&&message.ok===false)announce('That message could not be delivered. Try again.');
      else if(message.type==='guestNotice'&&message.entry){const e=message.entry as GuestEntry;visitLog=[e,...visitLog].slice(0,30);unreadLog++;refreshButton();announce(guestLine(e));if(dialog.open&&tab==='diary'){unreadLog=0;render();}}
      else if(message.type==='visit'){
        chatReady=true;refreshChatControls();visiting=message.home?.id||null;
        if(message.home){const home=message.home as Home;const state={...newGame(home.name,home.color),discovered:home.discovered??['home'],plots:home.plots,gear:home.gear,...(home.farm?{farm:home.farm}:{}),...(home.placed?{placed:home.placed}:{}),...(home.decorations?{decorations:home.decorations}:{}),...(home.helper?{helper:home.helper}:{}),...(home.friends?{friends:home.friends}:{})};game.setVisiting(home.name,state as SaveState);}
        else game.setVisiting(null);renderPlayers();announce(visiting?"Visiting {name}'s garden":'Back in your garden',{name:message.home?.name||''});if(dialog.open)render();
      }else if(message.type==='home'&&message.home?.id===visiting)game.setVisiting(message.home.name,{discovered:message.home.discovered,plots:message.home.plots,decorations:message.home.decorations,farm:message.home.farm,helper:message.home.helper,friends:message.home.friends} as Partial<SaveState>);
      else if(message.type==='effect'){if(message.visual)game.applyRemoteEffect(message.visual);else world().burst(message.x,message.z,message.color,8);}
      else if(message.type==='party'){party=message.code;announce('Party code: {code}',{code:party||''});if(dialog.open)render();}
      else if(message.type==='error'){if(chatMatches(message.requestId,connection))releaseChat();if(!message.requestId){chatReady=!!chatRoom&&connection.readyState===WebSocket.OPEN;refreshChatControls();}if(restoring&&fallbackJoin){desiredParty=null;restoring=false;joined(fallbackJoin);}announce(message.message||'That action was unavailable.');}
    });
    socket.addEventListener('close',event=>{
      if(socket!==connection)return;game.setDungeonSender?.(null);chatReady=false;releaseChat(chatAttempt?.pending?'Connection interrupted. Your chat draft is kept.':undefined);authority(null);world().clearRemotePlayers();players.clear();
      if(!account||stopped)return;if(event.code===4001){stopped=true;rejectActions('This online adventure is active in another tab.');if(saveTimer)clearTimeout(saveTimer);game.setPersistence(()=>{});status='Open in another tab';announce('This online adventure is active in another tab. Close it there, then reconnect here.');}
      else{status='Reconnecting';reconnect=window.setTimeout(connect,2500);const epoch=sessionEpoch;void api<Session>('auth/session').then(session=>{if(socket===connection&&sessionEpoch===epoch&&account&&!session.account)expireSession();}).catch(()=>{});}refreshButton();
    });
    socket.addEventListener('error',()=>{if(socket!==connection)return;chatReady=false;releaseChat(chatAttempt?.pending?'Connection interrupted. Your chat draft is kept.':undefined);status='Reconnecting';refreshButton();});
  }
  function begin(session:Session){
    if(!session.account||!session.profile)return;if(session.authorityVersion!==1){announce('This server needs the current game rules.');return;}sessionEpoch++;
    if(account?.id!==session.account.id){rememberActions();rejectActions('Your session ended. Pending actions remain on this device.');clearChat();party=null;visiting=null;}
    const previous=socket;socket=null;previous?.close();if(reconnect)clearTimeout(reconnect);if(saveTimer)clearTimeout(saveTimer);
    if(!account)offline=structuredClone(game.getState());account=session.account;friends=session.friends||[];requests=session.requests||[];stopped=false;
    revision=session.revision||0;try{const raw=localStorage.getItem(`cute-game-actions-${account.id}`),cached=raw?JSON.parse(raw):null;if(Array.isArray(cached))actionQueue=cached.filter(job=>job&&typeof job.requestId==='string'&&typeof job.type==='string'&&job.rulesVersion===1&&Number.isSafeInteger(job.expectedRevision)).slice(0,100);}catch{/* Keep this account's in-memory queue if storage is unavailable. */}
    game.setPersistence(queueSave);game.setActionHandler(queueAction);game.applyState(session.profile);connect();render();void flushSave();announce('Welcome, {name}. Your online adventure is ready.',{name:account.name});
  }
  async function signOut(){
    const originalEpoch=sessionEpoch;await flushSave();if(sessionEpoch!==originalEpoch)return;if(pendingSave()){announce('Your latest progress is still waiting to save. Reconnect before signing out.');return;}
    stopped=true;const epoch=sessionEpoch;
    try{await api('auth/logout',{});if(sessionEpoch!==epoch)return;}catch(error){if(sessionEpoch!==epoch)return;if((error as {status?:number}).status===401){expireSession();return;}stopped=false;announce((error as Error).message);return;}
    sessionEpoch++;
    clearChat();stopped=true;if(reconnect)clearTimeout(reconnect);if(saveTimer)clearTimeout(saveTimer);socket?.close();socket=null;account=null;host=null;party=null;visiting=null;players.clear();authority(null);world().clearRemotePlayers();
    game.setVisiting(null);game.setPersistence(null);game.setActionHandler(null);const state=offline||game.getOfflineState();if(state)game.applyState(state);setSaveStatus('● Saved on this device');status='Play together';refreshButton();render();announce('Your offline adventure is restored.');
  }
  async function reconnectOnline(){
    const epoch=++sessionEpoch;if(reconnect)clearTimeout(reconnect);stopped=true;const previous=socket;socket=null;previous?.close();
    try{const session=await api<Session>('auth/session');if(sessionEpoch!==epoch)return;if(!session.account){expireSession();return;}begin(session);}
    catch(error){if(sessionEpoch===epoch)announce((error as Error).message);}
  }
  function labeledInput(label:string,type='text',name=label){const wrapper=el('label','social-field',t(label));const input=el('input');input.type=type;input.name=name;input.required=true;wrapper.append(input);return{wrapper,input};}
  function personRow(person:Explorer,actions:HTMLElement[]){const row=el('div','social-person');const badge=el('span','social-avatar','●');badge.style.color=person.color;const name=el('span','',t('{name} · Lv {level}{online}',{name:person.name,level:person.level,online:person.online?t(' · online'):''}));row.append(badge,name,...actions);return row;}
  async function friendAction(action:string,id:string){try{const list=await api<{friends:Explorer[];requests:Explorer[];sent?:Explorer[]}>(`friends/${action}`,{id});friends=list.friends;requests=list.requests;sent=list.sent??sent;refreshButton();render();}catch(error){announce((error as Error).message);}}
  function renderChat(){const log=content.querySelector('.social-chat-log');if(!log)return;log.replaceChildren(...chat.slice(-30).map(entry=>{const line=el('p');line.append(el('strong','',entry.name+': '),document.createTextNode(entry.message));return line;}));log.scrollTop=log.scrollHeight;}
  function render(){
    captureChatDraft();content.replaceChildren();tabs.replaceChildren();authSubmit=null;setNotice('');heading.textContent=t(account?'Your online world':'Play together');
    if(!account){
      content.append(el('p','social-intro',t('Make a home, meet friends, and explore the same world. Your offline adventure stays saved separately.')));
      const form=el('form','social-auth');const username=labeledInput('Username','text','username'),password=labeledInput('Password','password','password');username.input.autocomplete='username';username.input.pattern='[a-zA-Z0-9_]{3,24}';username.input.minLength=3;username.input.maxLength=24;password.input.autocomplete=register?'new-password':'current-password';password.input.minLength=4;password.input.maxLength=128;
      form.append(username.wrapper,password.wrapper);let display:HTMLInputElement|undefined;
      if(register){const name=labeledInput('Explorer name','text','display-name');name.input.maxLength=20;name.input.value=game.getState().name;display=name.input;form.append(name.wrapper);}
      const submit=el('button','social-primary',t(register?'Create online adventure':'Sign in'));submit.type='submit';submit.disabled=authBusy;authSubmit=submit;form.append(submit);
      form.addEventListener('submit',async event=>{event.preventDefault();if(authBusy)return;authBusy=true;submit.disabled=true;try{begin(await api<Session>(`auth/${register?'register':'login'}`,{username:username.input.value,password:password.input.value,name:display?.value,color:game.getState().color}));}catch(error){setNotice((error as Error).message);}finally{authBusy=false;submit.disabled=false;if(authSubmit)authSubmit.disabled=false;}});
      content.append(form,button(register?'Already have an account? Sign in':'New here? Create an adventure',()=>{register=!register;render();},'social-link'),el('p','social-small',t('Accounts are stored on this game server. No email address is needed.')));return;
    }
    for(const [id,label]of [['world','🌍 World'],['friends',`${t('👥 Friends')}${requests.length?` (${requests.length})`:''}`],['diary',`${t('📒 Guest diary')}${unreadLog?` (${unreadLog})`:''}`],['account','🏡 Account']]as const){const item=button(label,()=>{tab=id;if(id==='diary'){unreadLog=0;refreshButton();}render();});item.setAttribute('aria-pressed',String(tab===id));tabs.append(item);}
    if(tab==='world'){
      content.append(el('p','social-intro',t(visiting?'Tap a ripe crop to try collecting it. A guard dog protects this garden if one lives here.':party?'Private party · {code}':'Public world · meet explorers outside your garden',{code:party||''})));
      const actions=el('div','social-actions');actions.append(button('Create private party',()=>sendRoom({type:'party'})),button('Return to public world',()=>sendRoom({type:'join',planet:game.getState().planet})));if(visiting)actions.append(button('Return to my garden',()=>send({type:'leaveVisit'})));else actions.append(button('Share nearby loot',()=>void shareNearbyLoot()));content.append(actions);
      const join=el('form','social-inline'),code=el('input');code.placeholder=t('Party code');code.setAttribute('aria-label',t('Party code'));code.name='party-code';code.maxLength=6;const submit=el('button','',t('Join party'));submit.type='submit';join.append(code,submit);join.addEventListener('submit',event=>{event.preventDefault();sendRoom({type:'join',planet:game.getState().planet,party:code.value.trim()});});content.append(join);
      const roster=el('div','social-roster');roster.append(el('h3','',t('Explorers in this world ({count})',{count:players.size})));for(const player of players.values())roster.append(personRow(player,player.id===account.id?[]:[button('View explorer',()=>openPlayer(player.id))]));content.append(roster);
      const log=el('div','social-chat-log');log.setAttribute('role','log');log.setAttribute('aria-label',t('World chat'));content.append(log);renderChat();
      const chatForm=el('form','social-inline'),input=el('input','social-chat-input');input.placeholder=t('Say hello…');input.setAttribute('aria-label',t('Chat message'));input.name='world-chat';input.maxLength=160;input.value=chatDraft;input.addEventListener('input',()=>{chatDraft=input.value;});const chatButton=el('button','social-chat-send',t('Send'));chatButton.type='submit';chatForm.append(input,chatButton);chatForm.addEventListener('submit',event=>{event.preventDefault();submitChat();});content.append(chatForm);refreshChatControls();
    }else if(tab==='diary'){
      content.append(el('p','social-intro',t('Friends who visit, water, or give gifts at your home show up here.')));
      if(!visitLog.length)content.append(el('p','social-small',t('No one has visited yet. Invite a friend to come and water your plants!')));
      for(const e of visitLog){const row=el('div','social-person');row.append(el('span','social-avatar',e.kind==='water'?'💧':e.kind==='gift'?'🎁':e.kind==='steal'?'🕵️':e.kind==='message'?'💬':'👋'),el('span','',guestLine(e)),el('small','social-small',ago(e.at)));content.append(row);}
    }else if(tab==='friends'){
      const add=el('form','social-inline'),input=el('input');input.placeholder=t('Friend’s username');input.setAttribute('aria-label',t('Friend username'));input.name='friend-username';input.maxLength=24;const submit=el('button','',t('Send request'));submit.type='submit';add.append(input,submit);add.addEventListener('submit',async event=>{event.preventDefault();try{await api('friends/request',{username:input.value});announce('Friend request sent.');input.value='';}catch(error){announce((error as Error).message);}});content.append(add);
      if(requests.length){content.append(el('h3','',t('Friend requests')));for(const friend of requests)content.append(personRow(friend,[button('Accept',()=>void friendAction('accept',friend.id)),button('Decline',()=>void friendAction('decline',friend.id))]));}
      if(sent.length){content.append(el('h3','',t('Waiting for a reply')));for(const person of sent)content.append(personRow(person,[button('Cancel request',()=>void friendAction('cancel',person.id),'social-link')]));}
      content.append(el('h3','',t('Your friends')));if(!friends.length)content.append(el('p','social-small',t('Add a friend by username to visit each other’s gardens.')));
      for(const friend of friends){const gifts=el('div','social-gifts');content.append(personRow(friend,[button('Visit garden',()=>{sendRoom({type:'visit',id:friend.id});dialog.close();}),button('Send a gift',()=>giftPicker(friend.id,gifts)),button('Message',()=>messageForm(friend.id,gifts)),button('Remove friend',()=>void friendAction('remove',friend.id),'social-link')]));content.append(gifts);}
    }else{
      content.append(el('h3','',account.name),el('p','',t('Username: {username}',{username:account.username||''})),el('p','social-small',t('Your progress saves to this server. Returning to offline play restores the adventure you left there.')),button('Save now',async()=>{queueSave(game.getState());await flushSave();if(account)announce(pendingSave()?'Save pending. Please keep this page open.':'Online adventure saved.');}),button('Reconnect',reconnectOnline),button('Sign out and play offline',()=>void signOut(),'social-primary'));
    }
  }
  game.onFrame(dt=>{
    if(!account||socket?.readyState!==WebSocket.OPEN)return;poseClock+=dt;enemyClock+=dt;const presence=game.getPresence();
    if(!visiting&&presence.planet!==planet){game.setVisiting(null);planet=presence.planet;sendRoom({type:'join',planet,party});return;}
    if(poseClock>=.1){poseClock=0;send({type:'pose',...presence});renderPlayers();}
    // The elected browser supplies AI positions/telegraphs; the server replaces HP,
    // damage and rewards with canonical combat values before relaying the snapshot.
    if(host===account.id&&enemyClock>=.15){enemyClock=0;send({type:'enemies',enemies:world().enemySnapshots()});}
  });
  game.onAction(action=>{if(!account)return;if(action.kind==='basic')send({type:'basic',targetId:action.targetId,requestId:crypto.randomUUID()});else if(action.kind==='skill')send({type:'skill',index:action.index,requestId:crypto.randomUUID()});if(account)send({type:'effect',effect:action.special||action.kind,visual:action.effect,x:action.x,z:action.z,color:action.kind==='skill'?'#d1a6ff':'#fff2a0'});});
  document.addEventListener('visibilitychange',()=>{send({type:'active',active:!document.hidden});if(document.hidden)void flushSave();});
  window.addEventListener('pagehide',rememberActions);
  onLanguageChange(()=>{
    // Keep partially typed credentials and chat drafts while relabeling an open menu.
    const drafts=Array.from(content.querySelectorAll<HTMLInputElement>('input')).map(input=>({name:input.name,value:input.value,focused:document.activeElement===input,start:input.selectionStart,end:input.selectionEnd}));
    const previousNotice=noticeSource,previousParams=noticeParams;refreshButton();
    if(dialog.open){
      render();
      for(const draft of drafts){const input=Array.from(content.querySelectorAll<HTMLInputElement>('input')).find(node=>node.name===draft.name);if(input){input.value=draft.value;if(draft.focused){input.focus();if(draft.start!==null&&draft.end!==null)input.setSelectionRange(draft.start,draft.end);}}}
      setNotice(previousNotice,previousParams);
    }
    if(saveStatusSource)setSaveStatus(saveStatusSource);
  });
  refreshButton();
  const initialEpoch=sessionEpoch;void api<Session>('auth/session').then(session=>{if(sessionEpoch===initialEpoch&&session.account)begin(session);}).catch(()=>{/* Offline play works without a server. */});
}
