import * as Game from './model.ts';
import * as Helper from './helper.ts';
import * as FarmHelper from './farm-helper.ts';
import * as Friends from './friends.ts';
import { deliversToChest, storeGains, takeStored } from './delivery.ts';
import { buyLook, wearLook } from './looks.ts';
import { huntFish } from './fish-hunting.ts';
import { useActivity } from './house-activities.ts';
import { sellProduce } from './item-views.ts';
import { claimProgress, rerollDaily, startChallenge, type ProgressKind } from './progression.ts';

export const ACTION_RULES_VERSION = 1;
export interface GameIntent { type: string; payload?: Record<string, unknown> }
export interface ActionReply { ok: true; profile: Game.SaveState; revision: number; authorityVersion: 1; result: unknown; replayed?: boolean; actionRevision?: number }
export interface ActionContext { now: number; random: () => number }
export class ActionError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const invalid = () => { throw new ActionError(400, 'That action is not available.'); };
function string(value: unknown, max = 100): string { return typeof value === 'string' && value.length > 0 && value.length <= max ? value : invalid(); }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : invalid(); }
function integer(value: unknown, fallback?: number): number { const result = value === undefined && fallback !== undefined ? fallback : number(value); return Number.isSafeInteger(result) && result >= 0 ? result : invalid(); }
function success<T>(result: T): T { if (result === false || result === null || result === undefined) throw new ActionError(409, 'That action is not available with your current progress.'); return result; }

/** Shared deterministic game rules. Online callers must additionally validate session, spatial context and receipts. */
export function applyGameAction(state: Game.SaveState, intent: GameIntent, context: ActionContext = { now: Date.now(), random: Math.random }): unknown {
  const next = structuredClone(state);
  const result = reduceAction(next, intent, context);
  for(const key of Object.keys(state))if(!Object.hasOwn(next,key))delete (state as unknown as Record<string,unknown>)[key];
  Object.assign(state, next);
  return result;
}
function reduceAction(state: Game.SaveState, intent: GameIntent, context: ActionContext): unknown {
  if (!intent || typeof intent.type !== 'string' || !Number.isFinite(context.now) || context.now < 0) return invalid();
  const p = intent.payload ?? {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) return invalid();
  const id = () => string(p.id), index = () => integer(p.index), kind = () => string(p.kind), now = context.now, random = context.random;
  // Workers' harvest while the explorer is out goes to the house chest (delivery.ts).
  const before = deliversToChest(intent.type, p) ? { ...state.bag } : null;
  let result: unknown;
  switch (intent.type) {
    case 'buy': result = Game.buy(state, id()); break;
    case 'sell': result = Game.sell(state, id(), integer(p.count, 1)); if (!result) return invalid(); break;
    // The same crop, fish and junk stacks (item-views.ts PRODUCE_TYPES) whose total the button shows.
    case 'sellProduce': result = sellProduce(state); break;
    case 'craft': result = Game.craft(state, index()); break;
    case 'cook': result = Game.cook(state, id(), integer(p.count, 1)); break;
    case 'cookDish': result = Game.cookDish(state, id()); break;
    case 'upgrade': result = Game.upgrade(state, kind() as keyof typeof Game.UPGRADES); break;
    case 'forge': result = Game.forgeWeapon(state, id(), random); break;
    case 'equip': result = Game.equip(state, id()); break;
    case 'unequip': result = Game.unequip(state, string(p.slot) as Game.GearSlot); break;
    case 'eat': result = Game.eat(state, id(), now); break;
    case 'transfer': {
      const item = id(), toChest = p.toChest === true, available = toChest ? Game.looseQuantity(state, item) : state.chest[item] || 0;
      const count = p.count === undefined ? available : integer(p.count);
      if (count < 1 || count > available || count > 100000) return invalid();
      for (let i = 0; i < count; i++) success(Game.transfer(state, item, toChest)); result = count; break;
    }
    case 'plant': result = Game.plant(state, index(), id(), now); break;
    case 'plantAll': result = Game.plantAll(state, id(), now); break;
    case 'harvest': result = Game.harvest(state, index(), now); break;
    case 'harvestAll': result = Game.harvestAll(state, now); break;
    case 'fertilize': result = Game.fertilize(state, index(), now, id()); break;
    case 'expandGarden': result = Game.expandGarden(state, p.x === undefined ? undefined : number(p.x), p.z === undefined ? undefined : number(p.z), p.rotation === undefined ? 0 : number(p.rotation)); break;
    case 'buyBedKit': result = Game.readyPlotKit(state); if (!['bought', 'have'].includes(result as string)) return invalid(); break;
    case 'storeBed': result = Game.storeBed(state, index()); break;
    case 'upgradeBed': result = Game.upgradeBed(state, index(), now); break;
    case 'moveBed': result = Game.moveBed(state, index(), number(p.x), number(p.z), p.rotation === undefined ? undefined : number(p.rotation)); break;
    case 'placeDecoration': result = Game.placeDecoration(state, id(), number(p.x), number(p.z), p.rotation === undefined ? 0 : number(p.rotation)); break;
    case 'moveDecoration': result = Game.moveDecoration(state, string(p.uid), number(p.x), number(p.z), p.rotation === undefined ? undefined : number(p.rotation)); break;
    case 'removeDecoration': result = Game.removeDecoration(state, string(p.uid)); break;
    case 'buildPen': result = Game.buildPen(state); break;
    case 'buyAnimal': result = Game.buyAnimal(state, kind() as Game.AnimalKind, now); break;
    case 'feedAnimal': result = Game.feedAnimal(state, integer(p.uid), now, p.id === undefined ? undefined : id()); break;
    case 'feedAll': result = Game.feedAll(state, now, p.id === undefined ? undefined : id()); break;
    case 'collectProducts': {
      if (p.uids !== undefined && (!Array.isArray(p.uids) || p.uids.length > 100 || p.uids.some(v => !Number.isSafeInteger(v) || v < 1))) return invalid();
      result = Game.collectProducts(state, now, p.uids as number[] | undefined); break;
    }
    case 'expandPen': result = Game.expandPen(state); break;
    case 'buildSpeciesPen': result = Game.buildSpeciesPen(state, kind() as Game.AnimalKind, now); break;
    case 'buyHelper': result = Helper.buyHelper(state); if (result !== 'bought') return invalid(); break;
    case 'setHelperPaused': result = Helper.setHelperPaused(state, p.paused === true); break;
    case 'setHelperSeed': result = Helper.setHelperSeed(state, id()); break;
    case 'helperHarvest': result = Helper.helperHarvest(state, index(), now); break;
    case 'helperPlant': result = Helper.helperPlant(state, index(), now); break;
    case 'helperCatchUp': result = Helper.catchUp(state,now); break;
    case 'buyFarmHelper': result = FarmHelper.buyFarmHelper(state); if (result !== 'bought') return invalid(); break;
    case 'setFarmHelperPaused': if (typeof p.paused !== 'boolean') return invalid(); result = FarmHelper.setFarmHelperPaused(state, p.paused); break;
    case 'setFarmHelperAutoFeed': if (typeof p.autoFeed !== 'boolean') return invalid(); result = FarmHelper.setFarmHelperAutoFeed(state, p.autoFeed); break;
    case 'farmHelperCollect': result = FarmHelper.helperCollect(state, integer(p.uid), now); if (!(result as unknown[]).length) return invalid(); break;
    case 'farmHelperFeed': result = FarmHelper.helperFeed(state, integer(p.uid), now); break;
    case 'farmHelperCatchUp': if (!FarmHelper.canWork(state)) return invalid(); result = FarmHelper.catchUp(state, now); break;
    case 'rescueFriend': result = Friends.rescue(state, string(p.id, 20) as Friends.FriendId, now); break;
    case 'friendsArrive': result = Friends.arriveHome(state, { x: number(p.x), z: number(p.z) }); break;
    case 'setFriendAutoFeed': if (typeof p.autoFeed !== 'boolean') return invalid(); result = Friends.setFriendAutoFeed(state, string(p.id, 20) as Friends.FriendId, p.autoFeed); break;
    case 'setFriendPaused': if (typeof p.paused !== 'boolean') return invalid(); result = Friends.setFriendPaused(state, string(p.id, 20) as Friends.FriendId, p.paused); break;
    case 'friendWork': {
      const task = p.index !== undefined ? { kind: string(p.kind, 10), index: index() } : { kind: string(p.kind, 10), uid: integer(p.uid) };
      if (!['harvest', 'plant', 'collect', 'feed'].includes(task.kind) || ('index' in task) !== (task.kind === 'harvest' || task.kind === 'plant')) return invalid();
      // Another worker (the robot, the player, a friend) getting there first is normal: report it quietly, not as an error.
      result = Friends.friendWork(state, string(p.id, 20) as Friends.FriendId, task as Friends.FriendTask, now) ?? { kind: task.kind, raw: {}, cooked: {}, skipped: true }; break;
    }
    case 'buyLook': result = buyLook(state, string(p.id, 20)); break;
    case 'wearLook': result = wearLook(state, string(p.id, 20)); break;
    case 'friendsCatchUp': result = Friends.friendsCatchUp(state, now); break;
    case 'ackStored': result = takeStored(state); break;
    case 'giveFriendGear': result = Friends.giveGear(state, string(p.friend, 20) as Friends.FriendId, id()); break;
    case 'takeFriendGear': result = Friends.takeGear(state, string(p.friend, 20) as Friends.FriendId, string(p.slot, 10)); break;
    case 'fishHunt': result = huntFish(state, { weaponId: string(p.weaponId), pondId: string(p.pondId), slot: integer(p.slot), aim: p.aim as { x: number; z: number } }, p.from as { x: number; z: number }, now); break;
    case 'claimProgress': result = claimProgress(state, kind() as ProgressKind, id(), now); break;
    case 'claimQuest': result = claimProgress(state, 'story', `story:${state.progression.story.index}`, now); break;
    case 'rerollDaily': result = rerollDaily(state, index(), now); break;
    case 'startChallenge': result = startChallenge(state, p.kind === undefined ? 'kill' : kind(), now); break;
    case 'launch': result = Game.launch(state); break;
    case 'travel': result = Game.travel(state, id() as Game.PlanetId); break;
    case 'returnHome': state.planet = 'home'; result = true; break;
    case 'discover': result = Game.discover(state, id() as Game.PlanetId); break;
    case 'collectStardust': result={shard:Game.collectStardust(state,random)}; break;
    case 'claimMine': result = Game.claimMine(state, index(), now); break;
    case 'claimGift': result = Game.claimGift(state, index(), now, random); break;
    case 'openCave': result = Game.openCave(state); break;
    case 'lightBrazier': result = Game.lightBrazier(state, index(), random); break;
    case 'claimCaveChest': result = Game.claimCaveChest(state, now, random); break;
    case 'recoverBag': result = Game.recoverBag(state); break;
    case 'die': Game.die(state, number(p.x), number(p.z)); result = true; break;
    // Cottage activities: rests and buffs with cooldowns (house-activities.ts).
    case 'houseUse': result = useActivity(state, id(), now); break;
    case 'rest': if (state.planet !== 'home') return invalid(); state.hp = Game.maxHp(state); result = true; break;
    case 'reset': { const fresh=Game.newGame(state.name,state.color); fresh.settings={...state.settings}; for(const key of Object.keys(state))delete (state as unknown as Record<string,unknown>)[key]; Object.assign(state,fresh); result=true; break; }
    case 'settings': {
      const settings = p.settings;
      if (settings && typeof settings === 'object' && !Array.isArray(settings)) for (const key of ['sound', 'lowGraphics', 'movePad', 'placeBeds'] as const) if (typeof (settings as Record<string, unknown>)[key] === 'boolean') state.settings[key] = (settings as Record<string, boolean>)[key];
      const level = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).difficulty : undefined;
      // Raising is free; lowering works once a day (difficulty.ts), so the Normal rules cannot be dodged per action.
      if (Game.isDifficulty(level) && level !== Game.difficultyOf(state)) {
        if (Game.isLowering(Game.difficultyOf(state), level)) { if (Game.lowerReadyAt(state) > now) return invalid(); state.settings.difficultyLoweredAt = now; }
        state.settings.difficulty = level;
      }
      if(settings&&typeof settings==='object'&&['left','right'].includes((settings as Record<string,string>).joystickSide))state.settings.joystickSide=(settings as {joystickSide:'left'|'right'}).joystickSide;
      if (p.name !== undefined) state.name = string(p.name, 20).trim() || state.name;
      if (p.color !== undefined) { if (!Game.COLORS.includes(string(p.color))) return invalid(); state.color = string(p.color); }
      result = true; break;
    }
    default: return invalid();
  }
  success(result); if (before) storeGains(state, before); state.savedAt = now; return result;
}
