import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {newGame,parseSave} from '../src/model.ts';
import {VI_ONLINE} from '../src/locales/vi-online.ts';
import {gameplayKey} from '../src/gameplay-controls.ts';

class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners=new Map();this.attributes=new Map();this.dataset={};this.classList={add(){}};this.open=false;this.style={};this.value='';this.selectionStart=null;this.selectionEnd=null;}
  append(...children){this.children.push(...children);}
  prepend(...children){this.children.unshift(...children);}
  closest(){return ['input','textarea','select'].includes(this.tagName)?this:null;}
  replaceChildren(...children){this.children=[...children];}
  setAttribute(name,value){this.attributes.set(name,value);}
  addEventListener(name,handler){this.listeners.set(name,handler);}
  querySelectorAll(selector){return elements(this).slice(1).filter(node=>selector==='input'?node.tagName==='input':selector.startsWith('.')?node.className===selector.slice(1):false);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  focus(){this.ownerDocument.activeElement=this;}
  setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  click(){return this.listeners.get('click')?.({target:this});}
}
const elements=root=>[root,...root.children.flatMap(elements)];
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const source=(await readFile(new URL('../src/online.ts',import.meta.url),'utf8')).replace(/^import '\.\/[^']+\.css';\r?$/gm,'').replaceAll('import.meta.env',JSON.stringify({VITE_STATIC_HOST:'false',BASE_URL:'/'}));
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const sessionFor=(id='alice')=>{const profile=newGame(id);return {authorityVersion:1,account:{id,username:id,name:id,color:profile.color,gear:{},level:1},profile,revision:0,friends:[],requests:[]};};

test('online progress submits serialized intents and never an optimistic profile snapshot',async()=>{
  const app=await fixture();app.bridge.getState().energy=999999;
  await Promise.all([app.bridge.perform({type:'buy',payload:{id:'rod'}}),app.bridge.perform({type:'settings',payload:{settings:{sound:false}}})]);
  const sent=app.requests.filter(r=>r.url.endsWith('/actions')).map(r=>JSON.parse(r.options.body));
  assert.equal(sent.length,2);assert.deepEqual(sent.map(v=>v.expectedRevision),[0,1]);assert.notEqual(sent[0].requestId,sent[1].requestId);
  assert.deepEqual(sent[0].payload,{id:'rod'});assert.ok(sent.every(v=>!('profile'in v)&&v.rulesVersion===1));assert.equal(app.bridge.getState().energy,0);
  assert.equal(app.requests.filter(r=>r.url.endsWith('/profile')).length,0);
});
test('an uncertain action keeps the exact receipt identity and revision when retried',async()=>{
  const app=await fixture({failFirstAction:true}),pending=app.bridge.perform({type:'buy',payload:{id:'rod'}});await flush();
  const first=app.requests.find(r=>r.url.endsWith('/actions')).options.body;
  app.socket.message({type:'profile',authorityVersion:1,revision:5,profile:newGame('Newer')});app.fire(5000);await pending;
  const sent=app.requests.filter(r=>r.url.endsWith('/actions'));assert.equal(sent.length,2);assert.equal(sent[1].options.body,first);
  assert.equal(app.bridge.getState().name,'Newer','an older replay profile cannot replace newer server state');
});
test('Enter opens chat but composition and typing keep their normal Enter behavior',async()=>{
  const app=await fixture();app.dialog.close();const key=app.document.listeners.get('keydown');let prevented=0;
  key({code:'Enter',key:'Enter',isComposing:true,target:app.body,preventDefault(){prevented++;}});assert.equal(app.dialog.open,false);
  key({code:'Enter',key:'Enter',target:app.input,preventDefault(){prevented++;}});assert.equal(app.dialog.open,false);
  key({code:'Enter',key:'Enter',target:app.body,preventDefault(){prevented++;}});assert.equal(app.dialog.open,true);assert.equal(app.document.activeElement.name,'world-chat');assert.equal(prevented,1);
});
test('selecting an explorer offers a friend request addressed by immutable player ID',async()=>{
  const app=await fixture();app.socket.message({type:'enter',player:{id:'bob',name:'Fern <3',planet:'home'}});
  app.bridge.getWorld().onRemotePlayerClick('bob');await app.button('Send friend request').click();
  const sent=app.requests.find(r=>r.url.endsWith('/friends/request'));assert.deepEqual(JSON.parse(sent.options.body),{id:'bob'});
});

async function fixture({failFirstAction=false,responseFor}={}){
  let session=sessionFor(),state=newGame('Offline'),language='en',timerId=0;
  const document=new Element(),window=new Element(),body=new Element(),slot=new Element(),timers=new Map(),sockets=[],requests=[],notices=[],visits=[],languageListeners=[],storage=new Map(),spawned=[];
  document.body=body;document.createElement=tag=>Object.assign(new Element(tag),{ownerDocument:document});document.createTextNode=textContent=>Object.assign(new Element('text'),{textContent});document.querySelector=selector=>selector==='#social-slot'?slot:null;
  const setTimeout=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout=id=>timers.delete(id);
  window.setTimeout=setTimeout;window.clearTimeout=clearTimeout;
  const i18n={t:(text,params={})=>(language==='vi'?VI_ONLINE[text]||text:text).replace(/\{(\w+)\}/g,(match,key)=>key in params?String(params[key]):match),onLanguageChange:fn=>{languageListeners.push(fn);return()=>{};}};
  class Socket extends Element {
    static OPEN=1;readyState=1;sent=[];failSend=false;
    constructor(url){super();this.url=String(url);sockets.push(this);}
    send(raw){if(this.failSend||this.readyState!==1)throw new Error('Socket closed');this.sent.push(JSON.parse(raw));}
    message(data){this.listeners.get('message')?.({data:JSON.stringify(data)});}
    close(code=1000){this.readyState=3;this.listeners.get('close')?.({code});}
  }
  const world=new Proxy({},{get:(object,key)=>Reflect.get(object,key)??(()=>{})}),bridge={getState:()=>state,getPresence:()=>({planet:state.planet,x:0,z:0}),getWorld:()=>world,getOfflineState:()=>newGame('Offline'),setPersistence(){},setActionHandler(fn){this.perform=fn;},applyAuthoritativeState(value){state=value;},clearNetworkDrops(){spawned.length=0;},spawnNetworkDrop(drop){spawned.push(drop);},removeNetworkDrop(){},releaseNetworkDrop(){},applyAuthorityHealth(){},setNetworkHooks(){},applyState:value=>{state=value;},showNotice:text=>notices.push(text),setVisiting:(...args)=>visits.push(args),onFrame(fn){this.frame=fn;},onAction(){}};
  const exports={};vm.runInNewContext(compiled,{exports,document,window,clearTimeout,setTimeout,URL,structuredClone,crypto:{randomUUID},location:{href:'https://game.example/',protocol:'https:'},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},WebSocket:Socket,require:name=>name==='./i18n.ts'?i18n:name==='./gameplay-controls.ts'?{gameplayKey}:{newGame,parseSave},fetch:async(url,options)=>{requests.push({url,options});if(url.endsWith('/actions')&&failFirstAction){failFirstAction=false;throw new Error('Connection reset');}const response=await responseFor?.(url,options,session);if(response)return response;return {ok:true,json:async()=>url.includes('/auth/')?structuredClone(session):url.endsWith('/actions')?{ok:true,authorityVersion:1,profile:structuredClone(session.profile),revision:++session.revision,result:true}:{ok:true}};}});
  exports.initOnline(bridge);await flush();slot.children[0].click();
  const all=()=>elements(body),find=name=>all().find(node=>node.name===name),button=label=>{const node=all().find(node=>node.tagName==='button'&&node.textContent===label);assert.ok(node,`Missing button ${label}`);return node;};
  const join=({party=null,planet='home',socket=sockets.at(-1)}={})=>socket.message({type:'joined',host:session.account?.id,planet,party,room:`${party||'public'}:${planet}`,players:session.account?[session.account]:[]});
  join();
  return {body,document,sockets,requests,notices,visits,bridge,all,find,button,join,storage,spawned,
    get socket(){return sockets.at(-1);},get input(){return find('world-chat');},get sendButton(){return all().find(node=>node.className==='social-chat-send');},get log(){return all().find(node=>node.className==='social-chat-log');},get dialog(){return all().find(node=>node.tagName==='dialog');},
    get chatPackets(){return sockets.flatMap(socket=>socket.sent).filter(message=>message.type==='chat');},
    draft(value){const input=find('world-chat');assert.ok(input);input.value=value;input.listeners.get('input')?.();},
    submit(){const form=all().find(node=>node.tagName==='form'&&node.children.some(child=>child.name==='world-chat'));assert.ok(form);form.listeners.get('submit')({preventDefault(){}});},
    fire(delay){const entry=[...timers].find(([,timer])=>timer.delay===delay);assert.ok(entry,`Missing timer ${delay}`);timers.delete(entry[0]);entry[1].fn();},
    setLanguage(value){language=value;for(const fn of languageListeners)fn();},
    setSession(value){session=value;},
    async signIn(id){session=sessionFor(id);find('username').value=id;find('password').value='test-password';const form=all().find(node=>node.className==='social-auth');await form.listeners.get('submit')({preventDefault(){}});await flush();join();if(!find('world-chat'))button('🌍 World').click();},
  };
}

test('chat keeps its draft until a matching sender acknowledgement, without double submission',async()=>{
  const app=await fixture();assert.equal(app.socket.url,'wss://game.example/socket');app.draft('Xin chào 🌿');app.submit();
  const sent=app.chatPackets[0];assert.match(sent.requestId,/^[\da-f-]{36}$/i);assert.equal(sent.message,'Xin chào 🌿');assert.equal(app.input.value,'Xin chào 🌿');assert.equal(app.sendButton.disabled,true);
  app.submit();assert.equal(app.chatPackets.length,1);
  app.socket.message({type:'chat',id:'alice',name:'alice',message:'Xin chào 🌿'});assert.equal(app.input.value,'Xin chào 🌿','an echo is not a delivery acknowledgement');
  app.socket.message({type:'chatAck',requestId:randomUUID()});assert.equal(app.sendButton.disabled,true);
  app.socket.message({type:'chatAck',requestId:sent.requestId});assert.equal(app.input.value,'');assert.equal(app.sendButton.disabled,false);app.submit();assert.equal(app.chatPackets.length,1);
});

test('editing a pending draft, changing language or switching tabs does not lose the next message',async()=>{
  const app=await fixture();app.draft('First');app.submit();const first=app.chatPackets[0];app.draft('Second <b>not markup</b>');
  app.setLanguage('vi');assert.equal(app.sendButton.textContent,'Đang gửi…');assert.equal(app.sendButton.disabled,true);assert.equal(app.input.value,'Second <b>not markup</b>');
  app.setLanguage('en');app.button('👥 Friends').click();app.socket.message({type:'chatAck',requestId:first.requestId});app.button('🌍 World').click();
  assert.equal(app.input.value,'Second <b>not markup</b>');app.submit();assert.equal(app.chatPackets.length,2);assert.notEqual(app.chatPackets[1].requestId,first.requestId);
});

test('chat rejection and timeout retain text and retry the same request ID without automatic resends',async()=>{
  const app=await fixture();app.draft('Please keep me');app.submit();const first=app.chatPackets[0];
  app.socket.message({type:'error',requestId:first.requestId,message:'Please wait a moment before trying again.'});assert.equal(app.input.value,first.message);assert.equal(app.sendButton.disabled,false);
  app.submit();assert.equal(app.chatPackets[1].requestId,first.requestId);app.setLanguage('vi');app.fire(10000);
  assert.equal(app.chatPackets.length,2);assert.equal(app.input.value,first.message);assert.equal(app.sendButton.disabled,false);assert.match(app.notices.at(-1),/Chưa xác nhận/);
  app.submit();assert.equal(app.chatPackets[2].requestId,first.requestId);app.socket.message({type:'chatAck',requestId:first.requestId});assert.equal(app.input.value,'');
});

test('a late acknowledgement after timeout clears only its own unedited draft',async()=>{
  const app=await fixture();app.draft('Slow delivery');app.submit();const first=app.chatPackets[0];app.fire(10000);app.socket.message({type:'chatAck',requestId:first.requestId});assert.equal(app.input.value,'');app.submit();assert.equal(app.chatPackets.length,1);
});

test('disconnect preserves a draft and requires a confirmed room before an idempotent manual retry',async()=>{
  const app=await fixture();app.draft('Across reconnect');app.submit();const first=app.chatPackets[0],oldSocket=app.socket;oldSocket.close();await flush();
  assert.equal(app.input.value,first.message);assert.equal(app.sendButton.disabled,true);app.submit();assert.equal(app.chatPackets.length,1);
  app.fire(2500);assert.notEqual(app.socket,oldSocket);assert.equal(app.sendButton.disabled,true);app.join();assert.equal(app.input.value,first.message);assert.equal(app.sendButton.disabled,false);assert.equal(app.chatPackets.length,1);
  app.submit();assert.equal(app.chatPackets[1].requestId,first.requestId);oldSocket.message({type:'chatAck',requestId:first.requestId});assert.equal(app.sendButton.disabled,true,'old socket acknowledgement cannot clear a current delivery');app.socket.message({type:'chatAck',requestId:first.requestId});assert.equal(app.input.value,'');
});

test('send exceptions retain text and release the pending button',async()=>{
  const app=await fixture();app.draft('Socket failed');app.socket.failSend=true;app.submit();assert.equal(app.chatPackets.length,0);assert.equal(app.input.value,'Socket failed');assert.equal(app.sendButton.disabled,false);app.socket.failSend=false;app.submit();assert.equal(app.chatPackets.length,1);
});

test('room changes clear history, drafts and pending acknowledgements; no-op room joins keep chat usable',async()=>{
  const app=await fixture();app.socket.message({type:'chat',name:'Bob',message:'Public message'});app.draft('Public draft');app.submit();const publicSend=app.chatPackets[0];
  app.button('Create private party').click();assert.equal(app.sendButton.disabled,true);app.join({party:'ABC123'});assert.equal(app.input.value,'');assert.equal(app.log.children.length,0);assert.equal(app.sendButton.disabled,false);
  app.draft('Party draft');app.socket.message({type:'chatAck',requestId:publicSend.requestId});assert.equal(app.input.value,'Party draft');
  app.socket.message({type:'chat',name:'Bob',message:'Party message'});app.button('Return to public world').click();assert.equal(app.sendButton.disabled,true);app.submit();assert.equal(app.chatPackets.length,1,'do not send a previous-room draft while changing rooms');app.join();assert.equal(app.input.value,'');assert.equal(app.log.children.length,0);
  app.button('Return to public world').click();assert.equal(app.sendButton.disabled,false,'server emits no joined event when already in the requested room');
  app.draft('Home draft');app.join({planet:'candy'});assert.equal(app.input.value,'');assert.equal(app.log.children.length,0);
});

test('rejected room transitions preserve the current conversation and draft',async()=>{
  const app=await fixture();app.socket.message({type:'chat',name:'Bob',message:'Stay here'});app.draft('Still here');app.find('party-code').value='BAD123';const form=app.all().find(node=>node.tagName==='form'&&node.children.some(child=>child.name==='party-code'));form.listeners.get('submit')({preventDefault(){}});assert.equal(app.sendButton.disabled,true);
  app.socket.message({type:'error',message:'That party code was not found.'});assert.equal(app.input.value,'Still here');assert.equal(app.log.children.length,1);assert.equal(app.sendButton.disabled,false);
});

test('sign-out and expired accounts erase chats before another player signs in',async()=>{
  for(const expire of [false,true]){
    const app=await fixture();app.socket.message({type:'chat',name:'Secret name',message:'Private history'});app.draft('Private draft');app.submit();const oldSocket=app.socket,oldId=app.chatPackets[0].requestId;
    if(expire){app.setSession({account:null});oldSocket.close();await flush();}else{app.button('🏡 Account').click();app.button('Sign out and play offline').click();await flush();}
    assert.ok(app.find('username'));await app.signIn('bob');assert.equal(app.input.value,'');assert.equal(app.log.children.length,0);
    app.draft('Bob draft');oldSocket.message({type:'chatAck',requestId:oldId});oldSocket.message({type:'chat',name:'Late',message:'Previous session'});assert.equal(app.input.value,'Bob draft');assert.equal(app.log.children.length,0);
  }
});

test('garden visits forward farm and helper snapshots initially and on live updates',async()=>{
  const app=await fixture(),home={...sessionFor('friend').account,plots:[],decorations:[],farm:{expanded:true,animals:[{id:'cow-1',kind:'cow'}]},helper:{owned:true,level:2}};
  app.socket.message({type:'visit',home});assert.equal(app.visits.at(-1)[0],'friend');assert.deepEqual(structuredClone(app.visits.at(-1)[1].farm),home.farm);assert.deepEqual(structuredClone(app.visits.at(-1)[1].helper),home.helper);
  const update={...home,farm:{...home.farm,animals:[]},helper:{owned:true,level:3}};app.socket.message({type:'home',home:update});assert.deepEqual(structuredClone(app.visits.at(-1)[1].farm),update.farm);assert.deepEqual(structuredClone(app.visits.at(-1)[1].helper),update.helper);
  const count=app.visits.length;app.socket.message({type:'home',home:{...update,id:'other'}});assert.equal(app.visits.length,count);
});

test('private-party reconnect ignores the temporary public room and keeps the private draft',async()=>{
  const app=await fixture();app.join({party:'ABC123'});app.socket.message({type:'chat',name:'Friend',message:'Private room'});app.draft('Private draft');app.submit();const first=app.chatPackets[0];app.socket.close();await flush();app.fire(2500);
  app.join();assert.ok(app.socket.sent.some(message=>message.type==='join'&&message.party==='ABC123'));assert.equal(app.sendButton.disabled,true);
  app.socket.message({type:'chat',name:'Stranger',message:'Temporary public room'});assert.equal(app.log.children.length,1);assert.equal(app.input.value,'Private draft');
  app.join({party:'ABC123'});assert.equal(app.log.children.length,1);assert.equal(app.input.value,'Private draft');app.submit();assert.equal(app.chatPackets[1].requestId,first.requestId);
});

test('an account change discovered by reconnect cannot reveal the previous account transcript',async()=>{
  const app=await fixture();app.socket.message({type:'chat',name:'Alice friend',message:'Alice conversation'});app.draft('Alice draft');app.submit();const first=app.chatPackets[0],oldSocket=app.socket;
  app.button('🏡 Account').click();app.setSession(sessionFor('bob'));await app.button('Reconnect').click();await flush();app.join();app.button('🌍 World').click();
  assert.equal(app.log.children.length,0);assert.equal(app.input.value,'');app.draft('Bob draft');oldSocket.message({type:'chatAck',requestId:first.requestId});assert.equal(app.input.value,'Bob draft');
});

test('switching accounts preserves the old pending queue without executing it as the new account',async()=>{
  const app=await fixture({failFirstAction:true});
  const pending=app.bridge.perform({type:'buy',payload:{id:'rod'}}).catch(error=>error.message);await flush();
  const original=JSON.parse(app.requests.find(r=>r.url.endsWith('/actions')).options.body);
  app.button('🏡 Account').click();app.setSession(sessionFor('bob'));await app.button('Reconnect').click();await flush();app.join();
  assert.match(await pending,/session ended/);assert.equal(app.requests.filter(r=>r.url.endsWith('/actions')).length,1);
  assert.equal(JSON.parse(app.storage.get('cute-game-actions-alice'))[0].requestId,original.requestId);
  await app.bridge.perform({type:'settings',payload:{settings:{sound:false}}});
  const sent=app.requests.filter(r=>r.url.endsWith('/actions')).map(r=>JSON.parse(r.options.body));
  assert.deepEqual(sent.map(job=>job.type),['buy','settings']);assert.equal(app.bridge.getState().name,'bob');
});

test('same-account reconnect ignores its old in-flight response and retries the durable receipt before new work',async()=>{
  let release,first=true;
  const app=await fixture({responseFor:(url)=>{if(url.endsWith('/actions')&&first){first=false;return new Promise(resolve=>{release=resolve;});}}});
  const pending=app.bridge.perform({type:'buy',payload:{id:'rod'}});await flush();
  app.button('🏡 Account').click();await app.button('Reconnect').click();await flush();
  const second=app.bridge.perform({type:'settings',payload:{settings:{sound:false}}});
  release({ok:true,json:async()=>({ok:true,authorityVersion:1,profile:newGame('Stale response'),revision:100,result:true})});
  await Promise.all([pending,second]);
  const sent=app.requests.filter(r=>r.url.endsWith('/actions')).map(r=>JSON.parse(r.options.body));
  assert.equal(sent.length,3);assert.equal(sent[0].requestId,sent[1].requestId);assert.deepEqual(sent.map(job=>job.expectedRevision),[0,0,1]);assert.equal(app.bridge.getState().name,'alice');
});

test('a delayed drop listing from a previous party cannot leak into the newly joined room',async()=>{
  const responses=[];
  const app=await fixture({responseFor:url=>url.endsWith('/drops')?new Promise(resolve=>responses.push(resolve)):undefined});
  await flush();app.join({party:'ABC123'});await flush();
  responses[0]({ok:true,json:async()=>({drops:[{id:'public-drop',room:'public:home'}]})});await flush();assert.equal(app.spawned.length,0);
  responses[1]({ok:true,json:async()=>({drops:[{id:'private-drop',room:'ABC123:home'}]})});await flush();assert.equal(app.spawned[0].id,'private-drop');
});

test('returning to the same room accepts only the new drop snapshot, not a delayed earlier listing',async()=>{
  const responses=[],app=await fixture({responseFor:url=>url.endsWith('/drops')?new Promise(resolve=>responses.push(resolve)):undefined});
  await flush();app.join({party:'ABC123'});await flush();app.join();await flush();
  responses[2]({ok:true,json:async()=>({drops:[{id:'current-drop',room:'public:home'}]})});await flush();
  responses[0]({ok:true,json:async()=>({drops:[{id:'old-claimed-drop',room:'public:home'}]})});await flush();
  assert.deepEqual(app.spawned.map(drop=>drop.id),['current-drop']);responses[1]({ok:true,json:async()=>({drops:[]})});await flush();
});

test('visiting a garden from another planet preserves the canonical return destination',async()=>{
  const app=await fixture();app.bridge.getState().planet='lava';
  app.socket.message({type:'joined',host:'alice',planet:'home',party:null,room:'public:home',visiting:'friend',players:[]});
  app.bridge.frame(.2);assert.equal(app.bridge.getState().planet,'lava');assert.equal(app.socket.sent.filter(message=>message.type==='join').length,0);
  app.socket.message({type:'visit',home:{...sessionFor('friend').account,plots:[]}});
  app.socket.message({type:'visit',home:null});app.bridge.frame(.2);
  assert.equal(app.bridge.getState().planet,'lava');assert.equal(app.socket.sent.at(-1).type,'join');assert.equal(app.socket.sent.at(-1).planet,'lava');
});

test('only the elected host publishes enemy AI snapshots, at a bounded rate, including after host migration',async()=>{
  const app=await fixture(),snapshots=[{id:'home:enemy:0',type:'slime',x:25,z:0,hp:12,maxHp:12}];app.bridge.getWorld().enemySnapshots=()=>snapshots;
  for(let i=0;i<60;i++)app.bridge.frame(1/60);
  const packets=()=>app.socket.sent.filter(message=>message.type==='enemies');
  assert.ok(packets().length>=5&&packets().length<=7);assert.deepEqual(packets()[0].enemies,snapshots);
  const count=packets().length;app.socket.message({type:'authority',host:'bob'});for(let i=0;i<60;i++)app.bridge.frame(1/60);assert.equal(packets().length,count);
  app.socket.message({type:'authority',host:'alice'});app.bridge.frame(.02);assert.equal(packets().length,count+1);
});

test('the share-loot control releases only the current owners protected nearby drops',async()=>{
  const now=Date.now(),drop={id:'mine',owner:'alice',ownerId:'alice',room:'public:home',planet:'home',item:'bone',count:1,x:2,z:0,releaseAt:now+10000,expiresAt:now+30000};
  const app=await fixture({responseFor:url=>url.endsWith('/drops')?{ok:true,json:async()=>({drops:[drop,{...drop,id:'other',owner:'bob'},{...drop,id:'far',x:40},{...drop,id:'public',releaseAt:0}]})}:undefined});
  app.button('Share nearby loot').click();app.button('Share nearby loot').click();await flush();
  const sent=app.requests.filter(r=>r.url.endsWith('/actions')).map(r=>JSON.parse(r.options.body));
  assert.equal(sent.length,1);assert.equal(sent[0].type,'releaseDrop');assert.deepEqual(sent[0].payload,{ownerId:'alice',id:'mine'});assert.match(app.notices.at(-1),/Shared 1/);
  app.setLanguage('vi');assert.ok(app.button('Chia sẻ đồ rơi gần đây'));
});

test('garden owners see their dog chase the visiting thief without receiving the thief damage notice',async()=>{
  const app=await fixture(),bites=[],world=app.bridge.getWorld();world.planet='home';world.position={x:0,z:0};world.farmView={guardBite:point=>bites.push(point)};
  app.socket.message({type:'enter',player:{id:'bob',name:'Bob',planet:'home',space:'home:alice',x:2,z:4}});const notices=app.notices.length;
  app.socket.message({type:'gardenEvent',ownerId:'alice',by:'bob',blocked:true,damage:18});
  assert.deepEqual(structuredClone(bites),[{x:2,z:4}]);assert.equal(app.notices.length,notices);
  app.socket.message({type:'gardenEvent',ownerId:'other',by:'bob',blocked:true,damage:18});assert.equal(bites.length,1);
});

test('an older reconnect response cannot replace the account loaded by a newer reconnect attempt',async()=>{
  let release,sessionCalls=0;const app=await fixture({responseFor:url=>{if(url.endsWith('/auth/session')&&++sessionCalls===2)return new Promise(resolve=>{release=resolve;});}});
  app.button('🏡 Account').click();const reconnect=app.button('Reconnect'),first=reconnect.click();await flush();app.setSession(sessionFor('bob'));await reconnect.click();
  release({ok:true,json:async()=>sessionFor('alice')});await first;assert.equal(app.bridge.getState().name,'bob');
});
