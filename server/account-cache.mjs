import {parseSave} from '../src/model.ts';

/** Keep connected peers' account identity without retaining fields deleted by a commit. */
export function rememberAccount(accounts,value){
  if(!value)return null;
  const previous=accounts.get(value.id);
  if(previous&&(previous.accountRevision||0)>(value.accountRevision||0))return previous;
  const profile=parseSave(JSON.stringify(value.profile));
  if(!profile)throw new Error('An account contains an unreadable adventure.');
  const record={...value,profile};
  if(previous){
    if((previous.profileRevision||0)>(record.profileRevision||0)){
      record.profile=previous.profile;record.profileRevision=previous.profileRevision;
      record.lastMutation=previous.lastMutation;record.receivedAt=previous.receivedAt;
    }
    for(const key of Object.keys(previous))if(!Object.hasOwn(record,key))delete previous[key];
    Object.assign(previous,record);return previous;
  }
  accounts.set(record.id,record);return record;
}
