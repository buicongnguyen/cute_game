import type { GameBridge } from './game-bridge.ts';
import { parseSave, newGame, type SaveState, type PlanetId } from './model.ts';
import './online.css';
import { t, onLanguageChange } from './i18n.ts';

interface Explorer { id:string;username?:string;name:string;color:string;level:number;gear:SaveState['gear'];online?:boolean;x?:number;z?:number;y?:number;facing?:number;moving?:boolean;space?:string;planet?:string }
interface Home extends Explorer { plots:SaveState['plots'];placed?:unknown[];decorations?:unknown[] }
interface EnemyState { id:string;x:number;z:number;hp:number;maxHp:number;[key:string]:unknown }
interface NetworkWorld {
  updateRemotePlayers(players:Explorer[]):void;clearRemotePlayers():void;
  setNetworkRole(role:'host'|'peer'|null):void;
  enemySnapshots():EnemyState[];applyEnemySnapshots(enemies:EnemyState[]):void;
  environmentSnapshot():{time:number;lamps:[number,number][]};applyEnvironmentSnapshot(snapshot:{time:number;lamps:[number,number][]}):void;
  onRemoteDamage:(id:string,amount:number,source?:string)=>void;
  onEnvironmentAction:(action:{kind:'light-pillar'|'collect-ore';id:string;index?:number})=>void;
  applyEnvironmentAction(action:{kind:'light-pillar'|'collect-ore';id:string;index?:number}):{ok:boolean;rewards?:{id:string;count:number}[]};
  grantEnvironmentReward(eventId:string,rewards:{id:string;count:number}[]):unknown;
}
interface Session { account:Explorer|null;profile?:SaveState;revision?:number;friends?:Explorer[];requests?:Explorer[] }
interface SaveJob {profile:SaveState;revision:number;mutation:string;dirty:boolean}
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
}

export function initOnline(game:GameBridge) {
  // Static hosting has no account API or WebSocket server. Leave local saves intact.
  if(import.meta.env.VITE_STATIC_HOST==='true'){initSoloEdition();return;}
  const serviceBase=import.meta.env.BASE_URL;
  let account:Explorer|null=null,friends:Explorer[]=[],requests:Explorer[]=[],socket:WebSocket|null=null;
  let host:string|null=null,party:string|null=null,planet='',visiting:string|null=null,offline:SaveState|null=null;
  let reconnect:number|undefined,saveTimer:number|undefined,pendingSave:SaveJob|null=null,saving:Promise<void>|null=null,stopped=false,revision=0;
  let poseClock=0,enemyClock=0,environmentClock=0,tab:'world'|'friends'|'account'='world',register=false,status='Play together',authBusy=false;
  let authSubmit:HTMLButtonElement|null=null;
  const players=new Map<string,Explorer>(),rewardIds=new Set<string>(),chat:{name:string;message:string}[]=[];
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
    const response=await fetch(`${serviceBase}api/${path}`,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
    let value:{error?:string};try{value=await response.json();}catch{throw new Error('Online play needs the game server. Your offline adventure is ready to play.');}
    if(!response.ok)throw Object.assign(new Error(value.error||'Connection interrupted. Please try again.'),{status:response.status});return value as T;
  }
  const send=(value:unknown)=>{if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify(value));return true;}return false;};
  function refreshButton(){const label=account?t(status,{code:party||''}):t('Play together');toggle.textContent=socialSlot?'👥':`👥 ${label}`;toggle.title=label;toggle.setAttribute('aria-label',t('Play together'));dialog.setAttribute('aria-label',t('Play together'));close.setAttribute('aria-label',t('Close online menu'));toggle.dataset.online=String(!!account);}
  function expireSession(){
    if(!account)return;stopped=true;if(reconnect)clearTimeout(reconnect);if(saveTimer)clearTimeout(saveTimer);
    const previous=socket;socket=null;previous?.close();account=null;host=null;party=null;visiting=null;players.clear();pendingSave=null;
    authority(null);world().clearRemotePlayers();game.setVisiting(null);game.setPersistence(null);const previousOffline=offline||game.getOfflineState();if(previousOffline)game.applyState(previousOffline);offline=null;
    status='Play together';setSaveStatus('● Offline adventure restored');refreshButton();render();announce('Your online session ended. Sign in again to continue; pending online progress is kept on this device.');
  }
  function renderPlayers(){
    const local=game.getPresence();const space=visiting?`home:${visiting}`:local.planet==='home'&&Math.hypot(local.x,local.z)<18?`home:${account?.id}`:'wild';
    world().updateRemotePlayers([...players.values()].filter(player=>player.id!==account?.id&&player.planet===local.planet&&(player.space==='wild'||player.space===space)));
  }
  function authority(next:string|null,enemies?:EnemyState[]){
    const becomingHost=next===account?.id&&host!==next;host=next;
    if(enemies?.length&&(becomingHost||host!==account?.id))world().applyEnemySnapshots(enemies);
    const role=account&&socket?.readyState===WebSocket.OPEN?(host===account.id?'host':'peer'):null;
    world().setNetworkRole(role);
    if(!role){world().onRemoteDamage=()=>{};world().onEnvironmentAction=()=>{};game.setNetworkHooks({role:null});return;}
    world().onRemoteDamage=(id,amount,source)=>{if(role==='host')send({type:'damage',id,amount,source});};
    world().onEnvironmentAction=action=>{send({type:'environmentAction',action});};
    game.setNetworkHooks({role,hit:(id,damage,stun,impact)=>{
      if(!socket||socket.readyState!==WebSocket.OPEN)return false;
      // Both players submit hits through the current host; this also records reward contributors.
      send({type:'attack',id,damage,stun,impact});return true;
    },status:(id,kind,duration)=>send({type:'status',id,kind,duration}),moveTarget:(id,x,z)=>send({type:'moveEnemy',id,x,z}),onHostKill:(id,xp,boss,type)=>{send({type:'defeat',id,xp,boss,enemy:type});}});
  }
  function queueSave(state:SaveState){
    if(!account||stopped)return;state.savedAt=Date.now();pendingSave={profile:structuredClone(state),revision:++revision,mutation:crypto.randomUUID(),dirty:true};
    setSaveStatus('◌ Saving online…');
    try{localStorage.setItem(`cute-game-online-${account.id}`,JSON.stringify(pendingSave));}catch{/* The server remains the primary online save. */}
    if(saveTimer!==undefined)clearTimeout(saveTimer);saveTimer=window.setTimeout(()=>void flushSave(),900);
  }
  async function flushSave(){
    if(saving)return saving;if(!pendingSave||!account)return;
    const snapshot=pendingSave,saveAccountId=account.id;pendingSave=null;
    saving=(async()=>{try{await api('profile',snapshot,'PUT');if(account?.id!==saveAccountId)return;if(revision===snapshot.revision){try{localStorage.setItem(`cute-game-online-${account.id}`,JSON.stringify({...snapshot,dirty:false}));}catch{}}status=socket?.readyState===WebSocket.OPEN?'Online':'Reconnecting';setSaveStatus(pendingSave?'◌ Saving online…':'● Saved online');refreshButton();}
      catch(error){if(account?.id!==saveAccountId)return;if((error as {status?:number}).status===401){expireSession();return;}if(!pendingSave)pendingSave=snapshot;status='Save pending';setSaveStatus('○ Online save kept on this device');if((error as {status?:number}).status===409){stopped=true;game.setPersistence(()=>{});announce('Another session saved newer progress. Reconnect to load it; your pending copy is kept on this device.');}refreshButton();}
      finally{saving=null;if(pendingSave&&account&&!stopped){saveTimer=window.setTimeout(()=>void flushSave(),5000);}}})();
    return saving;
  }
  function connect(){
    if(!account||stopped)return;let desiredParty=party,restoring=false,fallbackJoin:any=null;const desiredPlanet=game.getPresence().planet;const socketUrl=new URL(`${serviceBase}socket`,location.href);socketUrl.protocol=location.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(socketUrl);
    const connection=socket;
    function joined(message:any){
      if(desiredParty&&message.party!==desiredParty){if(!restoring){restoring=true;fallbackJoin=message;send({type:'join',planet:desiredPlanet,party:desiredParty});}return;}
      desiredParty=null;restoring=false;if(visiting)game.setVisiting(null);players.clear();for(const player of message.players||[])players.set(player.id,player);party=message.party;planet=message.planet;visiting=null;
      if(game.getState().planet!==planet){const state=structuredClone(game.getState());state.planet=planet as PlanetId;game.applyState(state);}
      if(message.enemies?.length)world().applyEnemySnapshots(message.enemies);if(message.environment)world().applyEnvironmentSnapshot(message.environment);authority(message.host,message.enemies);renderPlayers();status=party?'Party {code}':'Online';refreshButton();if(dialog.open)render();
    }
    socket.addEventListener('open',()=>{if(socket!==connection)return;status='Online';refreshButton();send({type:'active',active:!document.hidden});void flushSave();});
    socket.addEventListener('message',event=>{
      if(socket!==connection)return;let message:any;try{message=JSON.parse(event.data);}catch{return;}
      if(message.type==='welcome'){friends=message.friends||[];requests=message.requests||[];}
      else if(message.type==='joined')joined(message);
      else if(message.type==='authority'){if(message.environment)world().applyEnvironmentSnapshot(message.environment);authority(message.host,message.enemies);}
      else if(message.type==='enter'||message.type==='pose'){if(message.player?.id)players.set(message.player.id,message.player);renderPlayers();}
      else if(message.type==='leave'){players.delete(message.id);renderPlayers();}
      else if(message.type==='enemies'&&host!==account?.id)world().applyEnemySnapshots(message.enemies);
      else if(message.type==='attack'&&host===account?.id)game.applyRemoteHit(message.id,message.damage,message.stun,message.impact);
      else if(message.type==='status'&&host===account?.id)game.applyRemoteStatus(message.id,message.kind,message.duration);
      else if(message.type==='moveEnemy'&&host===account?.id)game.applyRemoteMove(message.id,message.x,message.z);
      else if(message.type==='environment'&&host!==account?.id)world().applyEnvironmentSnapshot(message.snapshot);
      else if(message.type==='environmentAction'&&host===account?.id){const result=world().applyEnvironmentAction(message.action);send({type:'environmentResult',requestId:message.requestId,...result});send({type:'environment',snapshot:world().environmentSnapshot()});}
      else if(message.type==='environmentReward'){world().grantEnvironmentReward(message.eventId,message.rewards);queueSave(game.getState());game.showNotice(t('Shared ore collected. Your materials are in your backpack.'));}
      else if(message.type==='reward'){
        const reward=message.reward;if(reward&&!rewardIds.has(reward.eventId)){rewardIds.add(reward.eventId);if(rewardIds.size>1000)rewardIds.delete(rewardIds.values().next().value!);game.applySharedKill(reward.eventId,reward.xp,reward.boss,reward.enemy);}
      }else if(message.type==='damage')game.applyRemoteDamage(message.amount,message.source);
      else if(message.type==='chat'){chat.push({name:String(message.name),message:String(message.message)});if(chat.length>60)chat.shift();if(dialog.open&&tab==='world')renderChat();else game.showNotice(`${message.name}: ${message.message}`);}
      else if(message.type==='friends'){friends=message.friends||[];requests=message.requests||[];if(dialog.open&&tab==='friends')render();}
      else if(message.type==='visit'){
        visiting=message.home?.id||null;
        if(message.home){const home=message.home as Home;const state={...newGame(home.name,home.color),plots:home.plots,gear:home.gear,...(home.placed?{placed:home.placed}:{}),...(home.decorations?{decorations:home.decorations}:{})};game.setVisiting(home.name,state as SaveState);}
        else game.setVisiting(null);renderPlayers();announce(visiting?"Visiting {name}'s garden":'Back in your garden',{name:message.home?.name||''});if(dialog.open)render();
      }else if(message.type==='home'&&message.home?.id===visiting)game.setVisiting(message.home.name,{plots:message.home.plots,decorations:message.home.decorations});
      else if(message.type==='effect'){if(message.visual)game.applyRemoteEffect(message.visual);else world().burst(message.x,message.z,message.color,8);}
      else if(message.type==='party'){party=message.code;announce('Party code: {code}',{code:party||''});if(dialog.open)render();}
      else if(message.type==='error'){if(restoring&&fallbackJoin){desiredParty=null;restoring=false;joined(fallbackJoin);}announce(message.message||'That action was unavailable.');}
    });
    socket.addEventListener('close',event=>{
      if(socket!==connection)return;authority(null);world().clearRemotePlayers();players.clear();
      if(!account||stopped)return;if(event.code===4001){stopped=true;pendingSave=null;if(saveTimer)clearTimeout(saveTimer);game.setPersistence(()=>{});status='Open in another tab';announce('This online adventure is active in another tab. Close it there, then reconnect here.');}
      else{status='Reconnecting';reconnect=window.setTimeout(connect,2500);void api<Session>('auth/session').then(session=>{if(account&&!session.account)expireSession();}).catch(()=>{});}refreshButton();
    });
    socket.addEventListener('error',()=>{if(socket!==connection)return;status='Reconnecting';refreshButton();});
  }
  function begin(session:Session){
    if(!session.account||!session.profile)return;
    if(!account)offline=structuredClone(game.getState());account=session.account;friends=session.friends||[];requests=session.requests||[];stopped=false;
    let state=session.profile;revision=session.revision||0;try{const raw=localStorage.getItem(`cute-game-online-${account.id}`),cached=raw?JSON.parse(raw):null;if(cached?.dirty&&Number.isSafeInteger(cached.revision)&&cached.revision>revision){const profile=parseSave(JSON.stringify(cached.profile));if(profile){state=profile;revision=cached.revision;}}}catch{/* Ignore unavailable local cache. */}
    game.setPersistence(queueSave);game.applyState(state);queueSave(state);connect();render();announce('Welcome, {name}. Your online adventure is ready.',{name:account.name});
  }
  async function signOut(){
    await flushSave();if(pendingSave){announce('Your latest progress is still waiting to save. Reconnect before signing out.');return;}
    try{await api('auth/logout',{});}catch(error){if((error as {status?:number}).status===401){expireSession();return;}announce((error as Error).message);return;}
    stopped=true;if(reconnect)clearTimeout(reconnect);if(saveTimer)clearTimeout(saveTimer);socket?.close();socket=null;account=null;host=null;party=null;visiting=null;players.clear();authority(null);world().clearRemotePlayers();
    game.setVisiting(null);game.setPersistence(null);const state=offline||game.getOfflineState();if(state)game.applyState(state);setSaveStatus('● Saved on this device');status='Play together';refreshButton();render();announce('Your offline adventure is restored.');
  }
  function labeledInput(label:string,type='text',name=label){const wrapper=el('label','social-field',t(label));const input=el('input');input.type=type;input.name=name;input.required=true;wrapper.append(input);return{wrapper,input};}
  function personRow(person:Explorer,actions:HTMLElement[]){const row=el('div','social-person');const badge=el('span','social-avatar','●');badge.style.color=person.color;const name=el('span','',t('{name} · Lv {level}{online}',{name:person.name,level:person.level,online:person.online?t(' · online'):''}));row.append(badge,name,...actions);return row;}
  async function friendAction(action:string,id:string){try{const list=await api<{friends:Explorer[];requests:Explorer[]}>(`friends/${action}`,{id});friends=list.friends;requests=list.requests;render();}catch(error){announce((error as Error).message);}}
  function renderChat(){const log=content.querySelector('.social-chat-log');if(!log)return;log.replaceChildren(...chat.slice(-30).map(entry=>{const line=el('p');line.append(el('strong','',entry.name+': '),document.createTextNode(entry.message));return line;}));log.scrollTop=log.scrollHeight;}
  function render(){
    content.replaceChildren();tabs.replaceChildren();authSubmit=null;setNotice('');heading.textContent=t(account?'Your online world':'Play together');
    if(!account){
      content.append(el('p','social-intro',t('Make a home, meet friends, and explore the same world. Your offline adventure stays saved separately.')));
      const form=el('form','social-auth');const username=labeledInput('Username','text','username'),password=labeledInput('Password','password','password');username.input.autocomplete='username';username.input.pattern='[a-zA-Z0-9_]{3,24}';username.input.minLength=3;username.input.maxLength=24;password.input.autocomplete=register?'new-password':'current-password';password.input.minLength=8;password.input.maxLength=128;
      form.append(username.wrapper,password.wrapper);let display:HTMLInputElement|undefined;
      if(register){const name=labeledInput('Explorer name','text','display-name');name.input.maxLength=20;name.input.value=game.getState().name;display=name.input;form.append(name.wrapper);}
      const submit=el('button','social-primary',t(register?'Create online adventure':'Sign in'));submit.type='submit';submit.disabled=authBusy;authSubmit=submit;form.append(submit);
      form.addEventListener('submit',async event=>{event.preventDefault();if(authBusy)return;authBusy=true;submit.disabled=true;try{begin(await api<Session>(`auth/${register?'register':'login'}`,{username:username.input.value,password:password.input.value,name:display?.value,color:game.getState().color}));}catch(error){setNotice((error as Error).message);}finally{authBusy=false;submit.disabled=false;if(authSubmit)authSubmit.disabled=false;}});
      content.append(form,button(register?'Already have an account? Sign in':'New here? Create an adventure',()=>{register=!register;render();},'social-link'),el('p','social-small',t('Accounts are stored on this game server. No email address is needed.')));return;
    }
    for(const [id,label]of [['world','🌍 World'],['friends',`${t('👥 Friends')}${requests.length?` (${requests.length})`:''}`],['account','🏡 Account']]as const){const item=button(label,()=>{tab=id;render();});item.setAttribute('aria-pressed',String(tab===id));tabs.append(item);}
    if(tab==='world'){
      content.append(el('p','social-intro',t(visiting?'You are visiting a friend. Their garden is read-only.':party?'Private party · {code}':'Public world · meet explorers outside your garden',{code:party||''})));
      const actions=el('div','social-actions');actions.append(button('Create private party',()=>send({type:'party'})),button('Return to public world',()=>send({type:'join',planet:game.getState().planet})));if(visiting)actions.append(button('Return to my garden',()=>send({type:'leaveVisit'})));content.append(actions);
      const join=el('form','social-inline'),code=el('input');code.placeholder=t('Party code');code.setAttribute('aria-label',t('Party code'));code.name='party-code';code.maxLength=6;const submit=el('button','',t('Join party'));submit.type='submit';join.append(code,submit);join.addEventListener('submit',event=>{event.preventDefault();send({type:'join',planet:game.getState().planet,party:code.value.trim()});});content.append(join);
      const roster=el('div','social-roster');roster.append(el('h3','',t('Explorers in this world ({count})',{count:players.size})));for(const player of players.values())roster.append(personRow(player,[]));content.append(roster);
      const log=el('div','social-chat-log');log.setAttribute('role','log');log.setAttribute('aria-label',t('World chat'));content.append(log);renderChat();
      const chatForm=el('form','social-inline'),input=el('input');input.placeholder=t('Say hello…');input.setAttribute('aria-label',t('Chat message'));input.name='world-chat';input.maxLength=160;const chatButton=el('button','',t('Send'));chatButton.type='submit';chatForm.append(input,chatButton);chatForm.addEventListener('submit',event=>{event.preventDefault();if(input.value.trim()&&send({type:'chat',message:input.value}))input.value='';});content.append(chatForm);
    }else if(tab==='friends'){
      const add=el('form','social-inline'),input=el('input');input.placeholder=t('Friend’s username');input.setAttribute('aria-label',t('Friend username'));input.name='friend-username';input.maxLength=24;const submit=el('button','',t('Send request'));submit.type='submit';add.append(input,submit);add.addEventListener('submit',async event=>{event.preventDefault();try{await api('friends/request',{username:input.value});announce('Friend request sent.');input.value='';}catch(error){announce((error as Error).message);}});content.append(add);
      if(requests.length){content.append(el('h3','',t('Friend requests')));for(const friend of requests)content.append(personRow(friend,[button('Accept',()=>void friendAction('accept',friend.id)),button('Decline',()=>void friendAction('decline',friend.id))]));}
      content.append(el('h3','',t('Your friends')));if(!friends.length)content.append(el('p','social-small',t('Add a friend by username to visit each other’s gardens.')));
      for(const friend of friends)content.append(personRow(friend,[button('Visit garden',()=>{send({type:'visit',id:friend.id});dialog.close();}),button('Remove friend',()=>void friendAction('remove',friend.id),'social-link')]));
    }else{
      content.append(el('h3','',account.name),el('p','',t('Username: {username}',{username:account.username||''})),el('p','social-small',t('Your progress saves to this server. Returning to offline play restores the adventure you left there.')),button('Save now',async()=>{queueSave(game.getState());await flushSave();if(account)announce(pendingSave?'Save pending. Please keep this page open.':'Online adventure saved.');}),button('Reconnect',async()=>{if(reconnect)clearTimeout(reconnect);stopped=true;const previous=socket;socket=null;previous?.close();try{const session=await api<Session>('auth/session');if(!session.account){expireSession();return;}begin(session);}catch(error){announce((error as Error).message);}}),button('Sign out and play offline',()=>void signOut(),'social-primary'));
    }
  }
  game.onFrame(dt=>{
    if(!account||socket?.readyState!==WebSocket.OPEN)return;poseClock+=dt;enemyClock+=dt;environmentClock+=dt;const presence=game.getPresence();
    if(!visiting&&presence.planet!==planet){game.setVisiting(null);planet=presence.planet;send({type:'join',planet,party});return;}
    if(poseClock>=.1){poseClock=0;send({type:'pose',...presence});renderPlayers();}
    if(host===account.id&&enemyClock>=.15){enemyClock=0;send({type:'enemies',enemies:world().enemySnapshots()});}
    if(host===account.id&&environmentClock>=1){environmentClock=0;send({type:'environment',snapshot:world().environmentSnapshot()});}
  });
  game.onAction(action=>{if(account)send({type:'effect',effect:action.special||action.kind,visual:action.effect,x:action.x,z:action.z,color:action.kind==='skill'?'#d1a6ff':'#fff2a0'});});
  document.addEventListener('visibilitychange',()=>{send({type:'active',active:!document.hidden});if(document.hidden)void flushSave();});
  window.addEventListener('pagehide',()=>{if(account&&pendingSave)void fetch(`${serviceBase}api/profile`,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(pendingSave),keepalive:true}).catch(()=>{});});
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
  void api<Session>('auth/session').then(session=>{if(session.account)begin(session);}).catch(()=>{/* Offline play works without a server. */});
}
