import {WEEKLY_CATEGORIES,ALL_TIME_CATEGORIES,profileTotals,addProgress,entryFor,rankEntries,boardReply,weekKey,validBoard,validCategory,BOARD_SIZE} from '../src/ranking-logic.ts';

/**
 * Weekly counters live on the account record (`account.ranking`), outside the game profile, and only authoritative
 * actions move them: call this inside a store command with the profile before and after the action (action-service.mjs,
 * combat-authority.mjs). Only gains count, and a new week (Monday 00:00 UTC) starts from zero.
 */
export function noteProgress(account,before,after,now=Date.now()){
  if(!account||!after)return;
  const a=profileTotals(before),b=profileTotals(after);
  // Nothing earned: leave the record alone (last week's counters already read as an empty week).
  if(!WEEKLY_CATEGORIES.some(key=>b[key]>a[key]))return;
  account.ranking=addProgress(account.ranking,a,b,now);
}

/** Every board is rebuilt from the in-memory accounts at most once per `ttl` (and when the week turns): O(accounts). */
export const RANKING_TTL=45_000;
export function createRanking({source,ttl=RANKING_TTL,clock=()=>Date.now()}){
  let cache=null;
  function build(now){
    const accounts=[...source()].filter(account=>account&&typeof account.id==='string'&&account.profile&&typeof account.profile==='object');
    const boards=new Map();
    for(const [board,cats] of [['weekly',WEEKLY_CATEGORIES],['all',ALL_TIME_CATEGORIES]])for(const cat of cats){
      const rows=[];for(const account of accounts){const entry=entryFor(account.id,account.profile,account.ranking,board,cat,now);if(entry)rows.push(entry);}
      boards.set(`${board}:${cat}`,rankEntries(rows));
    }
    return {at:now,week:weekKey(now),players:accounts.length,boards};
  }
  function current(now){if(!cache||now-cache.at>=ttl||now<cache.at||cache.week!==weekKey(now))cache=build(now);return cache;}
  return {
    /** The reply for GET /api/ranking: top BOARD_SIZE rows and, when signed in, the caller's own rank. */
    query({board='weekly',cat,meId=null}={}){
      if(!validBoard(board))throw Object.assign(new Error('Choose a weekly or all-time board.'),{status:400});
      cat??=board==='weekly'?'exp':'level';
      if(!validCategory(board,cat))throw Object.assign(new Error('That ranking category was not found.'),{status:400});
      const now=clock(),data=current(now);
      return {...boardReply(data.boards.get(`${board}:${cat}`)||[],board,cat,now,data.players,meId,BOARD_SIZE),cachedAt:data.at,refreshIn:Math.max(0,data.at+ttl-now)};
    },
    invalidate(){cache=null;},
  };
}
