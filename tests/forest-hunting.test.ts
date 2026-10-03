import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import * as M from '../src/model.ts';
import { World, HERO_SCALE, HERO_MODEL_HEIGHT } from '../src/world.ts';
import { ENEMY_TYPES, FOREST_RAPTOR_COUNT, enemyScale } from '../src/enemy-types.ts';
import { enemyRoster } from '../src/enemy-roster.ts';
import { CombatSimulation } from '../src/combat.ts';
import { CombatView } from '../src/combat-view.ts';
import { createHarpoonProjectile } from '../src/harpoon-art.ts';
import { weaponModelName } from '../src/assets.ts';
import { setLanguage, t } from '../src/i18n.ts';

function world() {
  return Object.assign(Object.create(World.prototype), { state:M.newGame(),scene:new T.Scene(),camera:new T.PerspectiveCamera(40,4/3,.5,300),root:new T.Group(),player:new T.Group(),companion:new T.Group(),position:new T.Vector3(),destination:null,route:[],selected:null,obstacles:[],entities:[],enemies:[],plotMeshes:[],cropSignatures:[],particles:[],keys:new Set<string>(),facing:0,time:0,planet:'home',hazardTimer:0,marker:new T.Mesh(),ring:new T.Mesh(),cameraTarget:new T.Vector3(),sun:new T.DirectionalLight(),raycaster:new T.Raycaster(),onInteract(){},onAttackEnemy(){},onDamage(){},onZone(){} }) as World;
}

test('six large flying forest birds append after every existing home creature identity in world and server', () => {
  const roster=enemyRoster('home'),birds=roster.filter(e=>e.type==='forest_raptor');
  assert.equal(FOREST_RAPTOR_COUNT,6); assert.equal(birds.length,6);
  assert.deepEqual(roster.slice(146,151).map(e=>e.type),['bear','treant','croc','mushking','titan_turtle']);
  assert.deepEqual(birds.map(e=>e.id),Array.from({length:6},(_,i)=>`home:enemy:${151+i}`));
  assert.ok(birds.every(e=>e.zone==='forest'&&e.baseMaxHp===160&&!e.boss&&!e.dormant));
  const w=world();w.build('home');
  for(const bird of birds){const e=w.enemies.find(value=>value.id===bird.id)!;assert.equal(e.type,bird.type);assert.equal(e.maxHp,bird.baseMaxHp);assert.equal(e.xp,bird.xp);assert.ok(e.x<0);assert.equal(e.definition?.flying,true);assert.equal(e.definition?.behavior,'charger');}
  // w18: hawks are drawn at half their old 1.45 scale (creature-sizes.ts); they now stand under the explorer.
  assert.ok(Math.abs(enemyScale('forest_raptor')-1.45*.5)<1e-9);
  const fallback=(w as any).enemyModel('forest_raptor',ENEMY_TYPES.forest_raptor) as T.Group;fallback.updateMatrixWorld(true);
  assert.ok(new T.Box3().setFromObject(fallback).max.y<HERO_SCALE*HERO_MODEL_HEIGHT);
});

test('harpoon is a purchasable reusable forgeable ranged weapon with canonical bird rewards',()=>{
  const s=M.newGame();s.energy=10000;s.bag.spore=40;s.bag.starshard=40;s.bag.bone=40;
  const item=M.ITEMS.harpoon;assert.equal(item.price,650);assert.equal(item.slot,'weapon');assert.equal(item.weapon?.kind,'gun');assert.equal(item.weapon?.shot,'harpoon');
  assert.ok(M.SHOP_CATEGORIES.find(c=>c.tab==='Weapons')!.items.some(i=>i.id==='harpoon'));
  assert.equal(M.buy(s,'harpoon'),true);assert.equal(s.energy,9350);assert.equal(M.equip(s,'harpoon'),true);assert.equal(M.weaponStats(s).range,11);
  const cost=M.forgeCost(0);for(const[id,count]of Object.entries(cost.materials))s.bag[id]=count;assert.equal(M.canForge(s,'harpoon'),true);
  const loot=M.rollLoot('forest_raptor',0,()=>0);assert.ok(loot.some(item=>item.id==='feather'));assert.ok(loot.some(item=>item.id==='meat'));
  assert.equal(weaponModelName('harpoon'),'trident');assert.equal(weaponModelName('bow_star'),'bow_star');
  setLanguage('vi');try{assert.equal(t(item.name),'Lao săn ba chĩa');assert.equal(t(ENEMY_TYPES.forest_raptor.name),'Diều hâu rừng lớn');}finally{setLanguage('en');}
});

test('a harpoon basic attack travels, hits once, retains the item and renders a directed three-prong mesh',()=>{
  const s=M.newGame();s.bag.harpoon=1;M.equip(s,'harpoon');const target={id:'hawk',x:0,z:5,hp:160,radius:.8},hits:number[]=[];
  const sim=new CombatSimulation({position:()=>({x:0,z:0}),facing:()=>0,face(){},targets:()=>[target],weapon:()=>M.weaponStats(s),stats:()=>({...M.activeStats(s),critChance:0}),move(){},hit(e,hit){hits.push(hit.amount);e.hp-=hit.amount;return hit.amount;},effect(){}},()=>.5);
  assert.equal(sim.basic(target),true);sim.update(.04,true);assert.ok(sim.projectiles.some(p=>p.kind==='harpoon'));
  const scene=new T.Scene(),view=new CombatView(scene);view.update(.01,sim.projectiles);const mesh=scene.getObjectByName('harpoon-projectile') as T.Mesh;assert.ok(mesh);assert.equal(mesh.rotation.y,0);
  for(let i=0;i<30;i++)sim.update(.025,true);assert.equal(hits.length,1);assert.equal(s.bag.harpoon,1);view.clear();assert.equal(scene.children.length,0);
  const fork=createHarpoonProjectile();assert.ok(fork.geometry.index!.count/3<=100);assert.ok(!fork.castShadow&&!fork.receiveShadow);assert.equal((fork.material as T.MeshBasicMaterial).map,null);fork.geometry.dispose();(fork.material as T.Material).dispose();
});
