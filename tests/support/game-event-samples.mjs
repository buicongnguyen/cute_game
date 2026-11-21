// One payload for every game event (src/game-events.ts GameEvents), for the bus tests and the emit table.
// A new event gets a line here and a site in tests/game-events-main.test.mjs.
const enemy = { id: 'bear-1', kind: 'enemy', type: 'bear', name: 'King Bear', boss: true, hp: 40, maxHp: 100, x: 3, z: 4 };
const impact = { amount: 12, critical: true, stun: 0, lift: 0, knock: 0, direction: { x: 1, z: 0 } };
export const EVENT_SAMPLES = {
  started: {},
  levelUp: { level: 4 },
  storyStep: { index: 2, from: 1 },
  reward: { kind: 'story', entry: { id: 'story:0', title: 'Harvest three crops', description: '', progress: 3, target: 3, complete: true, claimed: false, rewardLabel: '67 energy' }, energy: 67 },
  place: { name: 'Mushroom Forest', planet: 'home', from: 'home/Clover Village' },
  creatureAlert: { enemy },
  creatureDefeat: { enemy: { ...enemy, hp: 0 }, impact },
  bossApproach: { enemy },
  bossEngaged: { enemy },
  bossBreak: { enemy },
  playerHurt: { amount: 9, source: 'melee' },
  hitLanded: { enemy, damage: 12, impact },
  fishCatch: { id: 'koi', size: 31.5, huge: false },
  harvest: { crops: ['carrot'], all: false, first: true },
  rescue: { id: 'pepper', at: { x: 1, z: 2 } },
  friendHome: { id: 'pepper' },
  firstWin: {},
  telegraph: { enemy, time: 0.6 },
};
