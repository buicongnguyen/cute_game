import type { SaveState } from './model.ts';
import type { World } from './world.ts';
import type { CombatHit, CombatEffect } from './combat.ts';
export type EnemyStatus='fear'|'charm'|'slow'|'blind'|'sheep'|'taunt';
export interface GamePresence { y:number;x:number;z:number;facing:number;planet:string;name:string;color:string;level:number;hp:number;maxHp:number;gear:SaveState['gear'];moving:boolean;visible:boolean }
export interface GameAction { kind:'basic'|'skill'|'effect';index?:number;special?:string;x:number;z:number;facing:number;effect?:unknown }
export interface NetworkHooks {
  role:'host'|'peer'|null;
  hit?:(enemyId:string,damage:number,stun:number,impact?:CombatHit)=>boolean;
  status?:(enemyId:string,kind:EnemyStatus,duration:number)=>boolean;
  moveTarget?:(enemyId:string,x:number,z:number)=>boolean;
  onHostKill?:(enemyId:string,xp:number,boss:boolean,type:string)=>void;
  onRemoteDamage?:(playerId:string,amount:number)=>void;
}
export interface GameBridge {
  getState():SaveState;applyState(next:SaveState):void;getWorld():World;getPresence():GamePresence;
  getOfflineState():SaveState|null;setPersistence(handler:((state:SaveState)=>void)|null):void;
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

