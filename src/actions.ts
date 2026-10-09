import * as Game from './model.ts';
import * as Helper from './helper.ts';
import * as AutoPlant from './auto-plant.ts';
import * as FarmHelper from './farm-helper.ts';
import * as Restock from './farm-restock.ts';
import { cleanseDebuffs, homeCleanseAllowed } from './home-care.ts';
import * as Friends from './friends.ts';
import { deliversToChest, potItems, storeGains, takeFromChest, takeStored } from './delivery.ts';
import { buyLook, wearLook } from './looks.ts';
import { setFriendLook } from './friend-looks.ts';
import { huntFish } from './fish-hunting.ts';
import { useActivity } from './house-activities.ts';
import { sellProduce, cookSellProduce } from './item-views.ts';
import { applyAudio } from './audio-settings.ts';
import { upgradeGear, upgradeSkill } from './upgrades.ts';
import { claimProgress, refreshProgress, rerollDaily, startChallenge, type ProgressKind } from './progression.ts';
import { refusalReason } from './refusals.ts';
import { startRun, claimStage, leaveRun } from './dungeon-rules.ts';
import { claimMatch } from './ctf-claim.ts';
import { claimRescue } from './rescue-claim.ts';

export const ACTION_RULES_VERSION = 1;
export interface GameIntent { type: string; payload?: Record<string, unknown> }
export interface ActionReply { ok: true; profile: Game.SaveState; revision: number; authorityVersion: 1; result: unknown; replayed?: boolean; actionRevision?: number }
export interface ActionContext { now: number; random: () => number }
export class ActionError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
/** The only generic text left: an intent the rules cannot read at all (unknown type, missing or malformed fields). The client logs it for developers rather than showing it. */
export const MALFORMED_ACTION = 'That action is not available.';
export const isMalformedAction = (error: unknown) => error instanceof Error && (error as ActionError).status === 400 && error.message === MALFORMED_ACTION;
const invalid = () => { throw new ActionError(400, MALFORMED_ACTION); };
function string(value: unknown, max = 100): string { return typeof value === 'string' && value.length > 0 && value.length <= max ? value : invalid(); }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : invalid(); }
function integer(value: unknown, fallback?: number): number { const result = value === undefined && fallback !== undefined ? fallback : number(value); return Number.isSafeInteger(result) && result >= 0 ? result : invalid(); }
const failed = (result: unknown) => result === false || result === null || result === undefined;

/** Shared deterministic game rules. Online callers must additionally validate session, spatial context and receipts. */
export function applyGameAction(state: Game.SaveState, intent: GameIntent, context: ActionContext = { now: Date.now(), random: Math.random }): unknown {
  const next = structuredClone(state);
  // Workers' harvest bound for the chest (delivery.ts) is limited by the chest's room, not the bag's (storage-slots.ts).
  const payload = intent?.payload && typeof intent.payload === 'object' && !Array.isArray(intent.payload) ? intent.payload : {};
  Game.clearFullNote();
  const result = typeof intent?.type === 'string' && deliversToChest(intent.type, payload, context.now - state.savedAt) ? Game.intoChest(() => reduceAction(next, intent, context)) : reduceAction(next, intent, context);
  for(const key of Object.keys(state))if(!Object.hasOwn(next,key))delete (state as unknown as Record<string,unknown>)[key];
  Object.assign(state, next);
  return result;
}
function reduceAction(state: Game.SaveState, intent: GameIntent, context: ActionContext): unknown {
  if (!intent || typeof intent.type !== 'string' || !Number.isFinite(context.now) || context.now < 0) return invalid();
  const p = intent.payload ?? {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) return invalid();
  const id = () => string(p.id), index = () => integer(p.index), kind = () => string(p.kind), now = context.now, random = context.random;
  // A refusal says why in plain words (refusals.ts), read from the state as the rule saw it.
  // A grant the bag (or chest) had no slot for says so, whichever action it was (storage-slots.ts).
  const refuse = (): never => { const full = Game.fullNote(); throw new ActionError(409, full === 'chest' ? Game.CHEST_FULL : full === 'bag' ? Game.BAG_FULL : refusalReason(intent.type, state, p as Record<string, unknown>, now)); };
  const success = <T>(result: T): T => failed(result) ? refuse() : result;
  // Workers' harvest while the explorer is out goes to the house chest (delivery.ts).
  const before = deliversToChest(intent.type, p, now - state.savedAt) ? { ...state.bag } : null, potBefore = before ? potItems(state) : {};
  let result: unknown;
  switch (intent.type) {
    case 'buy': result = Game.buy(state, id()); break;
    case 'sell': result = Game.sell(state, id(), integer(p.count, 1)); if (!result) return refuse(); break;
    // The same crop, fish and junk stacks (item-views.ts PRODUCE_TYPES) whose total the button shows.
    case 'sellProduce': result = sellProduce(state); break;
    // Cook every cookable stack first (item-views.ts cookSellProduce), then sell it all.
    case 'cookSellProduce': result = cookSellProduce(state); if (!result) return refuse(); break;
    case 'craft': result = Game.craft(state, index()); break;
    case 'cook': result = Game.cook(state, id(), integer(p.count, 1)); break;
    case 'cookDish': result = Game.cookDish(state, id()); break;
    case 'upgrade': result = Game.upgrade(state, kind() as keyof typeof Game.UPGRADES); break;
    case 'forge': result = Game.forgeWeapon(state, id(), random); break;
    // The cottage upgrade bench (upgrades.ts): deterministic gear levels and skill levels.
    case 'upgradeGear': result = upgradeGear(state, id()); break;
    case 'upgradeSkill': result = upgradeSkill(state, index()); break;
    // Taking the weapon off by hand means fists, saved so a reload and the server's combat honour it; a combat weapon put on ends it.
    case 'equip': result = Game.equip(state, id()); if (result && ['sword', 'gun', 'fist'].includes(Game.ITEMS[state.gear.weapon ?? '']?.weapon?.kind ?? '') && Game.ITEMS[id()]?.slot === 'weapon') delete state.fists; break;
    case 'unequip': result = Game.unequip(state, string(p.slot) as Game.GearSlot); if (result && p.slot === 'weapon') state.fists = true; break;
    case 'eat': result = Game.eat(state, id(), now); break;
    case 'transfer': {
      const item = id(), toChest = p.toChest === true, available = toChest ? Game.looseQuantity(state, item) : state.chest[item] || 0;
      const count = p.count === undefined ? available : integer(p.count);
      if (count > 100000) return invalid();
      // The chest stands in the village (delivery.ts takeFromChest): away from home only the backpack counts.
      if (state.planet !== 'home' || count < 1 || count > available) return refuse();
      for (let i = 0; i < count; i++) success(Game.transfer(state, item, toChest)); result = count; break;
    }
    // The player's own planting: the crop becomes that bed's choice, which helpers replant and never replace (auto-plant.ts).
    case 'plant': result = AutoPlant.plantByHand(state, index(), id(), now); break;
    case 'plantAll': result = AutoPlant.plantAllByHand(state, id(), now); break;
    case 'setAutoPlant': if (typeof p.on !== 'boolean') return invalid(); result = AutoPlant.setAutoPlant(state, p.on); break;
    case 'clearBedChoices': result = AutoPlant.forgetChoices(state); break;
    case 'harvest': result = Game.harvest(state, index(), now); break;
    case 'harvestAll': result = Game.harvestAll(state, now); break;
    case 'fertilize': result = Game.fertilize(state, index(), now, id()); break;
    case 'expandGarden': result = Game.expandGarden(state, p.x === undefined ? undefined : number(p.x), p.z === undefined ? undefined : number(p.z), p.rotation === undefined ? 0 : number(p.rotation)); break;
    case 'buyBedKit': result = Game.readyPlotKit(state); if (!['bought', 'have'].includes(result as string)) return refuse(); break;
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
    case 'buyHelper': result = Helper.buyHelper(state); if (result !== 'bought') return refuse(); break;
    case 'setHelperPaused': result = Helper.setHelperPaused(state, p.paused === true); break;
    case 'setHelperSeed': result = Helper.setHelperSeed(state, id()); break;
    case 'helperHarvest': result = Helper.helperHarvest(state, index(), now); break;
    case 'helperPlant': result = Helper.helperPlant(state, index(), now); break;
    case 'helperCatchUp': result = Helper.catchUp(state,now); break;
    case 'buyFarmHelper': result = FarmHelper.buyFarmHelper(state); if (result !== 'bought') return refuse(); break;
    case 'setFarmHelperPaused': if (typeof p.paused !== 'boolean') return invalid(); result = FarmHelper.setFarmHelperPaused(state, p.paused); break;
    case 'setFarmHelperAutoFeed': if (typeof p.autoFeed !== 'boolean') return invalid(); result = FarmHelper.setFarmHelperAutoFeed(state, p.autoFeed); break;
    case 'farmHelperCollect': result = FarmHelper.helperCollect(state, integer(p.uid), now); if (!(result as unknown[]).length) return refuse(); break;
    case 'farmHelperFeed': result = FarmHelper.helperFeed(state, integer(p.uid), now); break;
    case 'farmHelperCatchUp': if (!FarmHelper.canWork(state)) return refuse(); result = { ...FarmHelper.catchUp(state, now), restocked: Restock.restock(state, now, Restock.RESTOCK_CATCH_UP_CAP) }; break;
    case 'upgradeFarmRestock': result = Restock.upgradeRestock(state, now); if (result !== 'upgraded') return refuse(); break;
    case 'setFarmRestock': result = Restock.setRestock(state, p.on, p.keep); break;
    case 'farmHelperRestock': result = Restock.restock(state, now); if (!(result as unknown[]).length) return refuse(); break;
    case 'homeCleanse': if (!homeCleanseAllowed(state)) return refuse(); result = cleanseDebuffs(state, now); break;
    case 'rescueFriend': result = Friends.rescue(state, string(p.id, 40) as Friends.FriendId, now); break;
    case 'friendsArrive': result = Friends.arriveHome(state, { x: number(p.x), z: number(p.z) }); break;
    case 'setFriendAutoFeed': if (typeof p.autoFeed !== 'boolean') return invalid(); result = Friends.setFriendAutoFeed(state, string(p.id, 40) as Friends.FriendId, p.autoFeed); break;
    case 'welcomeStart': if (typeof p.take !== 'boolean') return invalid(); result = Friends.welcomeStart(state, p.take, now); break;
    // Nothing new to wear is not a refusal: she simply keeps her clothes ({ changed: false }).
    case 'friendOutfit': {
      const friend = string(p.id, 40) as Friends.FriendId, pick = number(p.pick); if (pick < 0 || pick >= 1) return invalid();
      if (!Friends.friendOf(state, friend)) return refuse();
      result = { changed: Friends.changeOutfit(state, friend, pick) }; break;
    }
    case 'callHelper': result = Helper.callHelper(state, now); break;
    case 'callFriend': result = Friends.callFriend(state, string(p.id, 40) as Friends.FriendId, now); break;
    case 'setFriendPaused': if (typeof p.paused !== 'boolean') return invalid(); result = Friends.setFriendPaused(state, string(p.id, 40) as Friends.FriendId, p.paused); break;
    case 'friendWork': {
      const task = p.index !== undefined ? { kind: string(p.kind, 10), index: index() } : { kind: string(p.kind, 10), uid: integer(p.uid) };
      if (!['harvest', 'plant', 'collect', 'feed'].includes(task.kind) || ('index' in task) !== (task.kind === 'harvest' || task.kind === 'plant')) return invalid();
      // Another worker (the robot, the player, a friend) getting there first is normal: report it quietly, not as an error.
      result = Friends.friendWork(state, string(p.id, 40) as Friends.FriendId, task as Friends.FriendTask, now) ?? { kind: task.kind, raw: {}, cooked: {}, skipped: true }; break;
    }
    case 'buyLook': result = buyLook(state, string(p.id, 40)); break;
    case 'wearLook': result = wearLook(state, string(p.id, 40)); break;
    // A friend's look (friend-looks.ts): owned options are free; `buy` buys the missing ones for the player first.
    case 'friendLook': result = setFriendLook(state, string(p.friend, 20) as Friends.FriendId, string(p.id, 40), p.buy === true); break;
    case 'friendsCatchUp': result = Friends.friendsCatchUp(state, now); break;
    case 'ackStored': result = takeStored(state); break;
    case 'ackTrim': result = Game.takeTrimNote(state); break;
    case 'takeChest': result = takeFromChest(state, p.items); if (!(result as { count: number }).count && Game.fullNote()) return refuse(); break;
    case 'giveFriendGear': result = Friends.giveGear(state, string(p.friend, 20) as Friends.FriendId, id()); break;
    case 'takeFriendGear': result = Friends.takeGear(state, string(p.friend, 20) as Friends.FriendId, string(p.slot, 10)); break;
    case 'fishHunt': result = huntFish(state, { weaponId: string(p.weaponId), pondId: string(p.pondId), slot: integer(p.slot), aim: p.aim as { x: number; z: number } }, p.from as { x: number; z: number }, now); break;
    case 'claimProgress': result = claimProgress(state, kind() as ProgressKind, id(), now); break;
    case 'claimQuest': result = claimProgress(state, 'story', `story:${state.progression.story.index}`, now); break;
    case 'rerollDaily': result = rerollDaily(state, index(), now); break;
    case 'startChallenge': result = startChallenge(state, p.kind === undefined ? 'kill' : kind(), now); break;
    case 'launch': result = Game.launch(state); break;
    case 'travel': result = Game.travel(state, id() as Game.PlanetId); if (result && state.planet === 'home') cleanseDebuffs(state, now); break;
    case 'returnHome': state.planet = 'home'; result = { cleansed: cleanseDebuffs(state, now) }; break;
    case 'discover': result = Game.discover(state, id() as Game.PlanetId); break;
    case 'collectStardust': result={shard:Game.collectStardust(state,random)}; break;
    case 'claimMine': result = Game.claimMine(state, index(), now); break;
    case 'claimGift': result = Game.claimGift(state, index(), now, random); break;
    case 'openCave': result = Game.openCave(state); break;
    case 'lightBrazier': result = Game.lightBrazier(state, index(), random); break;
    case 'claimCaveChest': result = Game.claimCaveChest(state, now, random); break;
    case 'recoverBag': result = Game.recoverBag(state, p.id === undefined ? undefined : string(p.id, 40), now); break;
    // Backpack +4 slots / chest +10 slots for energy and materials (storage-slots.ts, the reference's expansion table).
    case 'expandStorage': if (!Game.isStorageKind(p.kind)) return invalid(); result = Game.expandStorage(state, p.kind); break;
    // The Delvers' Vault (dungeon-rules.ts): one of today's runs, then each stage's rewards in order (server dice online).
    case 'dungeonStart': result = startRun(state, string(p.runId, 64), now, p.party === undefined ? 1 : integer(p.party)); break;
    case 'dungeonClaim': result = claimStage(state, string(p.runId, 64), integer(p.stage), now, random); break;
    case 'dungeonLeave': result = leaveRun(state) || { left: true }; break;
    // Flag Rush (ctf-claim.ts): a finished match's EXP, once per match, six a day, never faster than it was played.
    // Rescue Call (rescue-claim.ts): waves held pay EXP and energy (capped a day), five wins a day pay in full with the gift.
    case 'rescueClaim': result = claimRescue(state, { runId: string(p.runId, 64), mission: string(p.mission, 16), waves: integer(p.waves), won: p.won === true, seconds: integer(p.seconds) }, now, random); break;
    case 'ctfClaim': result = claimMatch(state, { matchId: string(p.matchId, 64), won: p.won === true, draw: p.draw === true, caps: integer(p.caps), rets: integer(p.rets), kills: integer(p.kills), size: integer(p.size), seconds: integer(p.seconds) }, now); break;
    case 'die': result = { dropped: !!Game.die(state, number(p.x), number(p.z), now) }; break;
    // Cottage activities: rests and buffs with cooldowns (house-activities.ts).
    case 'houseUse': result = useActivity(state, id(), now); break;
    case 'rest': if (state.planet !== 'home') return refuse(); state.hp = Game.maxHp(state); result = true; break;
    case 'reset': { const fresh=Game.newGame(state.name,state.color); fresh.settings={...state.settings}; delete fresh.settings.tester; /* a new adventure starts outside tester mode */ for(const key of Object.keys(state))delete (state as unknown as Record<string,unknown>)[key]; Object.assign(state,fresh); result=true; break; }
    case 'settings': {
      const settings = p.settings;
      if (settings && typeof settings === 'object' && !Array.isArray(settings)) { applyAudio(state.settings, settings as Record<string, unknown>); for (const key of ['lowGraphics', 'movePad', 'placeBeds'] as const) if (typeof (settings as Record<string, unknown>)[key] === 'boolean') state.settings[key] = (settings as Record<string, boolean>)[key]; }
      const level = settings && typeof settings === 'object' ? (settings as Record<string, unknown>).difficulty : undefined;
      // Raising is free; lowering works once a day (difficulty.ts), so the Normal rules cannot be dodged per action.
      if (Game.isDifficulty(level) && level !== Game.difficultyOf(state)) {
        if (Game.isLowering(Game.difficultyOf(state), level)) { if (Game.lowerReadyAt(state) > now) return refuse(); state.settings.difficultyLoweredAt = now; }
        state.settings.difficulty = level;
        refreshProgress(state, now); // a cook task or story step the new kitchen lock makes impossible swaps at once
      }
      if(settings&&typeof settings==='object'&&['left','right'].includes((settings as Record<string,string>).joystickSide))state.settings.joystickSide=(settings as {joystickSide:'left'|'right'}).joystickSide;
      const keyboardLayout = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Record<string, unknown>).keyboardLayout : undefined;
      if (keyboardLayout === 'classic' || keyboardLayout === 'wasd') state.settings.keyboardLayout = keyboardLayout;
      const renderRes = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Record<string, unknown>).renderRes : undefined;
      if (renderRes === 'auto') delete state.settings.renderRes; else if (renderRes === 'sharp' || renderRes === 'balanced' || renderRes === 'saver') state.settings.renderRes = renderRes; // anything else is ignored, like the other preferences
      if (p.name !== undefined) state.name = string(p.name, 20).trim() || state.name;
      if (p.color !== undefined) { if (!Game.COLORS.includes(string(p.color))) return invalid(); state.color = string(p.color); }
      result = true; break;
    }
    default: return invalid();
  }
  success(result); if (before) storeGains(state, before, potBefore); state.savedAt = now; return result;
}
