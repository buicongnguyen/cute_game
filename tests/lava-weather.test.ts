import test from 'node:test';
import assert from 'node:assert/strict';
import {LavaWeather,lavaEvent,LAVA_EVENT_WEIGHTS,LAVA_ORE_RULES} from '../src/lava-weather.ts';
const player={x:50,z:0},height=()=>0;
test('lava events have a deterministic weighted240second active period and120second rest',()=>{
  const kinds=new Set<string>();for(let cycle=0;cycle<100;cycle++){const start=lavaEvent(cycle*360);kinds.add(start.id);assert.notEqual(start.id,'normal');assert.equal(start.left,240);assert.equal(lavaEvent(cycle*360+239).id,start.id);assert.equal(lavaEvent(cycle*360+240).id,'normal');assert.equal(lavaEvent(cycle*360+359).left,1);assert.deepEqual(lavaEvent(cycle*360),start);}
  assert.deepEqual([...kinds].sort(),Object.keys(LAVA_EVENT_WEIGHTS).sort());assert.equal(lavaEvent(NaN).index,0);
});
test('meteors warn for1.8seconds then damage and leave a90second ore only once',()=>{
  const weather=new LavaWeather(),options={forcedEvent:'meteor' as const};let frame=weather.step(2,player,height,options);assert.equal(frame.warnings.length,1);assert.equal(frame.impacts.length,0);const warning=frame.warnings[0];assert.ok(Math.hypot(warning.x-player.x,warning.z-player.z)>=5);assert.ok(Math.hypot(warning.x-player.x,warning.z-player.z)<=17);
  frame=weather.step(1.79,player,height,options);assert.equal(frame.impacts.length,0);frame=weather.step(.01,player,height,options);assert.equal(frame.impacts.length,1);assert.equal(frame.impacts[0].playerFraction,.3);assert.equal(frame.impacts[0].enemyFraction,.35);assert.equal(frame.impacts[0].radius,2.6);assert.equal(frame.oreSpawns[0].expiresAt,weather.time+90);
  const id=frame.oreSpawns[0].id;assert.ok(weather.collectOre(id));assert.equal(weather.collectOre(id),null);assert.equal(LAVA_ORE_RULES.meteor.hits,4);
});
test('safe-zone players, blocked terrain and raised mesas reject meteor targets',()=>{
  for(const[point,terrain,blocked]of [[{x:0,z:0},height,()=>false],[player,()=>1.5,()=>false],[player,height,()=>true]] as const){const weather=new LavaWeather();const frame=weather.step(10,point,terrain,{forcedEvent:'meteor',blocked});assert.equal(frame.warnings.length,0);}
});
test('storm tide rises gradually and warned fireballs carry the measured damage fractions',()=>{
  const weather=new LavaWeather();const frame=weather.step(3,player,height,{forcedEvent:'storm'});assert.equal(weather.tideOffset,.28);assert.equal(frame.warnings[0].kind,'fireball');const impact=weather.step(1,player,height,{forcedEvent:'storm'}).impacts[0];assert.equal(impact.playerFraction,.1);assert.equal(impact.enemyFraction,.1);assert.equal(impact.radius,1.4);
  weather.step(1,player,height,{forcedEvent:'normal'});assert.equal(weather.tideOffset,.14);
});
test('treasure vents emit two short-lived ores nearby and exclude distant vents',()=>{
  const weather=new LavaWeather(),options={forcedEvent:'treasure' as const,vents:[{x:45,z:0},{x:-50,z:0}]};const frame=weather.step(4,player,height,options);assert.equal(frame.oreSpawns.length,2);assert.ok(frame.oreSpawns.every(o=>o.kind==='ore_magma'&&o.expiresAt===104));const expired=weather.step(100,player,height,{forcedEvent:'normal'});assert.equal(expired.expiredOreIds.length,2);assert.equal(weather.ores.length,0);
});
test('dragon summons once per active event and a crowd can trigger a shared boss',()=>{
  const weather=new LavaWeather();assert.equal(weather.step(.1,player,height,{forcedEvent:'dragon'}).dragonSummon,true);assert.equal(weather.step(.1,player,height,{forcedEvent:'dragon'}).dragonSummon,false);assert.equal(weather.step(.1,player,height,{forcedEvent:'normal',nearbyPlayers:4}).dragonSummon,false);assert.equal(weather.step(.1,player,height,{forcedEvent:'meteor',nearbyPlayers:3}).dragonSummon,true);
});
test('weather snapshots continue the same warnings, random stream and collectibles after host migration',()=>{
  const a=new LavaWeather();a.step(2,player,height,{forcedEvent:'meteor'});a.step(.4,player,height,{forcedEvent:'meteor'});const b=new LavaWeather();assert.equal(b.restore(a.snapshot()),true);assert.deepEqual(b.snapshot(),a.snapshot());
  for(let i=0;i<60;i++){assert.deepEqual(b.step(.1,player,height,{forcedEvent:'meteor'}),a.step(.1,player,height,{forcedEvent:'meteor'}));}assert.deepEqual(b.snapshot(),a.snapshot());
});
test('peers advance received warnings without spawning their own local weather',()=>{
  const host=new LavaWeather();host.step(2,player,height,{forcedEvent:'meteor'});const peer=new LavaWeather();peer.restore(host.snapshot());const result=peer.step(2,player,height,{forcedEvent:'meteor',authority:false,nearbyPlayers:4});assert.equal(result.impacts.length,1);assert.equal(result.warnings.length,0);assert.equal(result.dragonSummon,false);
  assert.equal(peer.step(10,player,height,{forcedEvent:'treasure',authority:false,vents:[player]}).oreSpawns.length,0);
});

