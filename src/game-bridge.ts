import type { SaveState } from './model.ts';
import type { World } from './world.ts';
import type { CombatHit, CombatEffect } from './combat.ts';
import type {GameIntent,ActionReply} from './actions.ts';
export type EnemyStatus='fear'|'charm'|'slow'|'blind'|'sheep'|'taunt';
export interface GamePresence { y:number;x:number;z:number;facing:number;planet:string;name:string;color:string;level:number;hp:number;maxHp:number;gear:SaveState['gear'];moving:boolean;visible:boolean;visual?:{size:number;stealth:boolean;shield:boolean;flight:number;bat:boolean} }
export interface GameAction { kind:'basic'|'skill'|'effect';targetId?:string;index?:number;special?:string;x:number;z:number;facing:number;effect?:unknown }
export interface NetworkHooks {
  role:'host'|'peer'|null;
  visitCrop?:(index:number)=>void;
  reportDamage?:(enemyId:string,source:string)=>void;
  hit?:(enemyId:string,damage:number,stun:number,impact?:CombatHit)=>boolean;
  status?:(enemyId:string,kind:EnemyStatus,duration:number)=>boolean;
  moveTarget?:(enemyId:string,x:number,z:number)=>boolean;
  onHostKill?:(enemyId:string,xp:number,boss:boolean,type:string)=>void;
  onRemoteDamage?:(playerId:string,amount:number)=>void;
}
export interface NetworkDrop {id:string;ownerId:string;item:string;count:number;room:string;planet:string;x:number;z:number;owner:string;releaseAt:number;expiresAt:number;thrown?:boolean}
export interface GameBridge {
  spawnNetworkDrop(drop:NetworkDrop,actor:string):void;removeNetworkDrop(id:string):void;releaseNetworkDrop(id:string):void;clearNetworkDrops():void;
  applyAuthorityHealth(delta:number,died:boolean):void;
  getState():SaveState;applyState(next:SaveState):void;getWorld():World;getPresence():GamePresence;
  getOfflineState():SaveState|null;setPersistence(handler:((state:SaveState)=>void)|null):void;
  setActionHandler(handler:((intent:GameIntent)=>Promise<ActionReply>)|null):void;
  applyAuthoritativeState(next:SaveState):void;
  setNetworkHooks(hooks:NetworkHooks):void;
  applyRemoteHit(enemyId:string,damage:number,stun?:number,impact?:CombatHit):void;
  applyRemoteStatus(enemyId:string,kind:EnemyStatus,duration:number):void;
  applyRemoteMove(enemyId:string,x:number,z:number):void;
  applySharedKill(enemyId:string,xp:number,boss:boolean,type?:string):void;
  applyRemoteDamage(amount:number,source?:string):void;
  applyRemoteEffect(effect:CombatEffect):void;
  setVisiting(owner:string|null,homeState?:Partial<SaveState>):void;
  showNotice(text:string):void;
  onFrame(listener:(dt:number)=>void):()=>void;
  onAction(listener:(action:GameAction)=>void):()=>void;
}

