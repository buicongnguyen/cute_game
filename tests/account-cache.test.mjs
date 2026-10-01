import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberAccount} from '../server/account-cache.mjs';
import {newGame} from '../src/model.ts';

test('committed field removal clears live ride and cast state without replacing peer identity',()=>{
  const cache=new Map(),value={id:'alice',profile:newGame(),friends:['bob'],accountRevision:1,profileRevision:1,rideUntil:Date.now()+45000,ridePlanet:'ocean',fishingTicket:{id:'old-cast'},drops:[{id:'old-drop'}]};
  const peer={account:rememberAccount(cache,value)};
  const next={id:'alice',profile:newGame(),friends:[],accountRevision:2,profileRevision:2};
  assert.equal(rememberAccount(cache,next),peer.account);
  for(const field of ['rideUntil','ridePlanet','fishingTicket','drops'])assert.equal(Object.hasOwn(peer.account,field),false,field);
  assert.deepEqual(peer.account.friends,[]);
  assert.equal(rememberAccount(cache,value),peer.account,'late reads preserve the current object');
  assert.equal(peer.account.accountRevision,2);assert.equal(peer.account.rideUntil,undefined);assert.deepEqual(peer.account.friends,[]);
});

test('same-version cache refresh cannot replace a newer profile with an older snapshot',()=>{
  const cache=new Map(),old={id:'alice',profile:newGame(),friends:[],accountRevision:2,profileRevision:1};
  const latest=structuredClone(old);latest.profileRevision=2;latest.profile.energy=50;
  const current=rememberAccount(cache,latest);assert.equal(rememberAccount(cache,old),current);
  assert.equal(current.profileRevision,2);assert.equal(current.profile.energy,50);
});
