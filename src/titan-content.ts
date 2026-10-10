// Gameplay facts from the public reference, 2026-10-02. Original runtime/art implementation.
import type { ItemDef } from './content.ts';
export type TitanSkill='sweep'|'pull'|'lines'|'bombard'|'leap'|'donut'|'orbs'|'pools'|'summon'|'stomp4';
export const TITANS = {
  "titan_turtle": {
    "name": "Ancient Mountain Turtle",
    "planet": "home",
    "hp": 1500,
    "damage": 30,
    "speed": 1.4,
    "reach": 6.5,
    "sight": 22,
    "xp": 3000,
    "radius": 4.2,
    "cooldown": 2.6,
    "windup": 0.8,
    "boss": true,
    "titan": true,
    "scale": 2.4,
    "height": 5.2,
    "behavior": "boss",
    "family": "titan",
    "color": "#6b8a4a",
    "accent": "#c9a86a",
    "glow": "#8fe05a",
    "flying": false,
    "skills": [
      "stomp4",
      "lines",
      "leap",
      "summon",
      "donut"
    ]
  },
  "titan_hydra": {
    "name": "Three-Headed Candy Hydra",
    "planet": "candy",
    "hp": 1600,
    "damage": 32,
    "speed": 1.8,
    "reach": 6.5,
    "sight": 22,
    "xp": 3400,
    "radius": 3.8,
    "cooldown": 2.4,
    "windup": 0.8,
    "boss": true,
    "titan": true,
    "scale": 2.3,
    "height": 6,
    "behavior": "boss",
    "family": "titan",
    "color": "#ff5aa8",
    "accent": "#8ae0ff",
    "glow": "#ffe14d",
    "flying": false,
    "skills": [
      "sweep",
      "orbs",
      "pools",
      "bombard",
      "summon"
    ]
  },
  "titan_crystal": {
    "name": "Ice Crystal Queen",
    "planet": "ice",
    "hp": 1700,
    "damage": 34,
    "speed": 1.6,
    "reach": 6.5,
    "sight": 22,
    "xp": 3800,
    "radius": 3.6,
    "cooldown": 2.3,
    "windup": 0.8,
    "boss": true,
    "titan": true,
    "scale": 2.2,
    "height": 6.4,
    "behavior": "boss",
    "family": "titan",
    "color": "#9fe8ff",
    "accent": "#e8f8ff",
    "glow": "#6a8cff",
    "flying": true,
    "skills": [
      "lines",
      "orbs",
      "donut",
      "sweep",
      "bombard"
    ]
  },
  "titan_scorpion": {
    "name": "Inferno Scorpion",
    "planet": "lava",
    "hp": 1800,
    "damage": 38,
    "speed": 2,
    "reach": 7,
    "sight": 22,
    "xp": 4400,
    "radius": 4.4,
    "cooldown": 2.2,
    "windup": 0.8,
    "boss": true,
    "titan": true,
    "scale": 2.4,
    "height": 4.6,
    "behavior": "boss",
    "family": "titan",
    "color": "#3a2a2e",
    "accent": "#ff6a2b",
    "glow": "#ffc23d",
    "flying": false,
    "skills": [
      "pools",
      "leap",
      "lines",
      "sweep",
      "stomp4"
    ]
  },
  "titan_clock": {
    "name": "Clockwork Spider",
    "planet": "toy",
    "hp": 1500,
    "damage": 30,
    "speed": 2,
    "reach": 6.5,
    "sight": 22,
    "xp": 3000,
    "radius": 4.2,
    "cooldown": 2.4,
    "windup": 0.8,
    "boss": true,
    "titan": true,
    "scale": 2.4,
    "height": 5,
    "behavior": "boss",
    "family": "titan",
    "color": "#c89a3a",
    "accent": "#8a8ea0",
    "glow": "#3fb0ff",
    "flying": false,
    "skills": [
      "bombard",
      "sweep",
      "summon",
      "lines",
      "orbs"
    ]
  },
  "titan_flower": {
    "name": "Death Flower Rafflesia",
    "planet": "jungle",
    "hp": 1650,
    "damage": 32,
    "speed": 0,
    "reach": 9,
    "sight": 20,
    "xp": 3400,
    "radius": 4,
    "cooldown": 2.2,
    "windup": 0.8,
    "boss": true,
    "titan": true,
    "scale": 2.4,
    "height": 5.4,
    "behavior": "boss",
    "family": "titan",
    "color": "#c0203a",
    "accent": "#ffe0b0",
    "glow": "#4fbf5a",
    "flying": false,
    "skills": [
      "pull",
      "pools",
      "orbs",
      "summon",
      "donut"
    ]
  },
  "titan_kraken": {
    "name": "Abyssal Kraken",
    "planet": "ocean",
    "hp": 1750,
    "damage": 34,
    "speed": 1.6,
    "reach": 8,
    "sight": 22,
    "xp": 3800,
    "radius": 4.4,
    "cooldown": 2.3,
    "windup": 0.8,
    "boss": true,
    "titan": true,
    "scale": 2.4,
    "height": 5.6,
    "behavior": "boss",
    "family": "titan",
    "color": "#8a3a9a",
    "accent": "#ff9ad8",
    "glow": "#3fd0c0",
    "flying": false,
    "skills": [
      "pull",
      "sweep",
      "stomp4",
      "pools",
      "bombard"
    ]
  },
  "titan_whale": {
    "name": "Celestial Cloud Whale",
    "planet": "cloud",
    "hp": 1850,
    "damage": 38,
    "speed": 2.2,
    "reach": 7,
    "sight": 24,
    "xp": 4400,
    "radius": 4.6,
    "cooldown": 2.3,
    "windup": 0.8,
    "boss": true,
    "titan": true,
    "scale": 2.5,
    "height": 4,
    "behavior": "boss",
    "family": "titan",
    "color": "#dff0ff",
    "accent": "#8ab8ff",
    "glow": "#fff27a",
    "flying": true,
    "skills": [
      "bombard",
      "orbs",
      "pull",
      "lines",
      "donut"
    ]
  },
  "titan_eye": {
    "name": "Void Eye",
    "planet": "shadow",
    "hp": 2000,
    "damage": 40,
    "speed": 1.8,
    "reach": 7.5,
    "sight": 24,
    "xp": 5200,
    "radius": 3.8,
    "cooldown": 2.1,
    "windup": 0.8,
    "boss": true,
    "titan": true,
    "scale": 2.3,
    "height": 5,
    "behavior": "boss",
    "family": "titan",
    "color": "#2a1a3e",
    "accent": "#b06aff",
    "glow": "#ff3b6a",
    "flying": true,
    "skills": [
      "sweep",
      "pull",
      "orbs",
      "donut",
      "lines",
      "bombard"
    ]
  }
} as const;
export type TitanId=keyof typeof TITANS;
export const TITAN_BY_PLANET=Object.fromEntries(Object.entries(TITANS).map(([id,d])=>[d.planet,id])) as Record<string,TitanId>;
export const TITAN_ITEMS:Record<string,ItemDef> = {
  "hat_t_turtle": {
    "type": "hat",
    "sell": 900,
    "rare": true,
    "legend": true,
    "stats": {
      "def": 30,
      "hp": 150,
      "regen": 3
    },
    "name": "Ancient Mountain Helm",
    "icon": "👑",
    "desc": "A legendary trophy from Ancient Mountain Turtle.",
    "slot": "hat"
  },
  "hat_t_hydra": {
    "type": "hat",
    "sell": 900,
    "rare": true,
    "legend": true,
    "stats": {
      "atk": 16,
      "crit": 0.08,
      "hp": 60
    },
    "name": "Candy Hydra Crown",
    "icon": "👑",
    "desc": "A legendary trophy from Three-Headed Candy Hydra.",
    "slot": "hat"
  },
  "hat_t_crystal": {
    "type": "hat",
    "sell": 950,
    "rare": true,
    "legend": true,
    "stats": {
      "crit": 0.12,
      "def": 18,
      "hp": 80
    },
    "light": true,
    "name": "Ice Crystal Crown",
    "icon": "👑",
    "desc": "A legendary trophy from Ice Crystal Queen.",
    "slot": "hat"
  },
  "hat_t_scorpion": {
    "type": "hat",
    "sell": 1000,
    "rare": true,
    "legend": true,
    "stats": {
      "atk": 20,
      "def": 12
    },
    "lavaproof": true,
    "name": "Inferno Scorpion Helm",
    "icon": "👑",
    "desc": "A legendary trophy from Inferno Scorpion.",
    "slot": "hat"
  },
  "hat_t_clock": {
    "type": "hat",
    "sell": 900,
    "rare": true,
    "legend": true,
    "stats": {
      "speed": 0.18,
      "atk": 10
    },
    "xp": 0.3,
    "name": "Clockwork Crown",
    "icon": "👑",
    "desc": "A legendary trophy from Clockwork Spider.",
    "slot": "hat"
  },
  "hat_t_flower": {
    "type": "hat",
    "sell": 950,
    "rare": true,
    "legend": true,
    "stats": {
      "hp": 120,
      "regen": 5
    },
    "antidote": true,
    "name": "Rafflesia Crown",
    "icon": "👑",
    "desc": "A legendary trophy from Death Flower Rafflesia.",
    "slot": "hat"
  },
  "hat_t_kraken": {
    "type": "hat",
    "sell": 950,
    "rare": true,
    "legend": true,
    "stats": {
      "def": 16,
      "atk": 12
    },
    "luck": 0.4,
    "name": "Kraken Tentacle Hat",
    "icon": "👑",
    "desc": "A legendary trophy from Abyssal Kraken.",
    "slot": "hat"
  },
  "hat_t_whale": {
    "type": "hat",
    "sell": 1000,
    "rare": true,
    "legend": true,
    "stats": {
      "speed": 0.22,
      "hp": 140
    },
    "xp": 0.2,
    "name": "Cloud Whale Hat",
    "icon": "👑",
    "desc": "A legendary trophy from Celestial Cloud Whale.",
    "slot": "hat"
  },
  "hat_t_eye": {
    "type": "hat",
    "sell": 1100,
    "rare": true,
    "legend": true,
    "stats": {
      "atk": 22,
      "crit": 0.1
    },
    "light": true,
    "luck": 0.25,
    "name": "Void Eye Crown",
    "icon": "👑",
    "desc": "A legendary trophy from Void Eye.",
    "slot": "hat"
  },
  "pet_t_turtle": {
    "type": "pet",
    "sell": 1400,
    "rare": true,
    "legend": true,
    "stats": {
      "def": 25,
      "hp": 120,
      "regen": 3
    },
    "pet": {
      "scale": 0.09,
      "dmg": 0.5,
      "cd": 1.6,
      "shot": "bubble"
    },
    "name": "Little Mountain Turtle",
    "icon": "🐢",
    "desc": "A legendary companion that follows you and attacks nearby enemies.",
    "slot": "pet"
  },
  "pet_t_hydra": {
    "type": "pet",
    "sell": 1400,
    "rare": true,
    "legend": true,
    "stats": {
      "atk": 12
    },
    "pet": {
      "scale": 0.09,
      "dmg": 0.8,
      "cd": 0.9,
      "shot": "rainbow"
    },
    "name": "Little Candy Hydra",
    "icon": "🐉",
    "desc": "A legendary companion that follows you and attacks nearby enemies.",
    "slot": "pet"
  },
  "pet_t_crystal": {
    "type": "pet",
    "sell": 1450,
    "rare": true,
    "legend": true,
    "stats": {
      "crit": 0.1
    },
    "light": true,
    "pet": {
      "scale": 0.1,
      "dmg": 0.7,
      "cd": 1.1,
      "shot": "ice"
    },
    "name": "Little Crystal Queen",
    "icon": "❄️",
    "desc": "A legendary companion that follows you and attacks nearby enemies.",
    "slot": "pet"
  },
  "pet_t_scorpion": {
    "type": "pet",
    "sell": 1500,
    "rare": true,
    "legend": true,
    "stats": {
      "atk": 14
    },
    "lavaproof": true,
    "pet": {
      "scale": 0.09,
      "dmg": 0.9,
      "cd": 1,
      "shot": "fire"
    },
    "name": "Little Inferno Scorpion",
    "icon": "🦂",
    "desc": "A legendary companion that follows you and attacks nearby enemies.",
    "slot": "pet"
  },
  "pet_t_clock": {
    "type": "pet",
    "sell": 1400,
    "rare": true,
    "legend": true,
    "stats": {
      "speed": 0.15
    },
    "xp": 0.25,
    "pet": {
      "scale": 0.09,
      "dmg": 0.6,
      "cd": 0.8,
      "shot": "spike"
    },
    "name": "Little Clockwork Spider",
    "icon": "⚙️",
    "desc": "A legendary companion that follows you and attacks nearby enemies.",
    "slot": "pet"
  },
  "pet_t_flower": {
    "type": "pet",
    "sell": 1450,
    "rare": true,
    "legend": true,
    "stats": {
      "hp": 100,
      "regen": 6
    },
    "antidote": true,
    "pet": {
      "scale": 0.09,
      "dmg": 0.6,
      "cd": 1.2,
      "shot": "bubble"
    },
    "name": "Little Rafflesia",
    "icon": "🌺",
    "desc": "A legendary companion that follows you and attacks nearby enemies.",
    "slot": "pet"
  },
  "pet_t_kraken": {
    "type": "pet",
    "sell": 1450,
    "rare": true,
    "legend": true,
    "stats": {
      "def": 12
    },
    "luck": 0.35,
    "pet": {
      "scale": 0.09,
      "dmg": 0.7,
      "cd": 1.1,
      "shot": "bubble"
    },
    "name": "Little Abyssal Kraken",
    "icon": "🐙",
    "desc": "A legendary companion that follows you and attacks nearby enemies.",
    "slot": "pet"
  },
  "pet_t_whale": {
    "type": "pet",
    "sell": 1500,
    "rare": true,
    "legend": true,
    "stats": {
      "hp": 150,
      "speed": 0.2
    },
    "xp": 0.2,
    "pet": {
      "scale": 0.09,
      "dmg": 0.7,
      "cd": 1.2,
      "shot": "ice"
    },
    "name": "Little Cloud Whale",
    "icon": "🐳",
    "desc": "A legendary companion that follows you and attacks nearby enemies.",
    "slot": "pet"
  },
  "pet_t_eye": {
    "type": "pet",
    "sell": 1600,
    "rare": true,
    "legend": true,
    "stats": {
      "atk": 16,
      "crit": 0.08
    },
    "light": true,
    "luck": 0.2,
    "pet": {
      "scale": 0.1,
      "dmg": 1,
      "cd": 1,
      "shot": "rainbow"
    },
    "name": "Little Void Eye",
    "icon": "👁️",
    "desc": "A legendary companion that follows you and attacks nearby enemies.",
    "slot": "pet"
  }
};
export const TITAN_LOOT:Record<string,[string,number,number,number][]> = {
  "titan_turtle": [
    [
      "hat_t_turtle",
      0.12,
      1,
      1
    ],
    [
      "pet_t_turtle",
      0.06,
      1,
      1
    ],
    [
      "starshard",
      1,
      3,
      5
    ],
    [
      "seed_star",
      1,
      2,
      3
    ],
    [
      "honey",
      1,
      2,
      4
    ],
    [
      "crown",
      0.3,
      1,
      1
    ]
  ],
  "titan_hydra": [
    [
      "hat_t_hydra",
      0.12,
      1,
      1
    ],
    [
      "pet_t_hydra",
      0.06,
      1,
      1
    ],
    [
      "sugar",
      1,
      8,
      12
    ],
    [
      "starshard",
      1,
      3,
      5
    ],
    [
      "seed_star",
      1,
      2,
      3
    ]
  ],
  "titan_crystal": [
    [
      "hat_t_crystal",
      0.12,
      1,
      1
    ],
    [
      "pet_t_crystal",
      0.06,
      1,
      1
    ],
    [
      "icecrystal",
      1,
      8,
      12
    ],
    [
      "seed_ice",
      1,
      2,
      4
    ],
    [
      "starshard",
      1,
      3,
      5
    ]
  ],
  "titan_scorpion": [
    [
      "hat_t_scorpion",
      0.12,
      1,
      1
    ],
    [
      "pet_t_scorpion",
      0.06,
      1,
      1
    ],
    [
      "firecore",
      1,
      3,
      5
    ],
    [
      "obsidian",
      1,
      5,
      8
    ],
    [
      "dragonscale",
      0.6,
      1,
      2
    ],
    [
      "starshard",
      1,
      3,
      5
    ]
  ],
  "titan_clock": [
    [
      "hat_t_clock",
      0.12,
      1,
      1
    ],
    [
      "pet_t_clock",
      0.06,
      1,
      1
    ],
    [
      "gear",
      1,
      10,
      15
    ],
    [
      "battery",
      1,
      3,
      5
    ],
    [
      "starshard",
      1,
      2,
      4
    ]
  ],
  "titan_flower": [
    [
      "hat_t_flower",
      0.12,
      1,
      1
    ],
    [
      "pet_t_flower",
      0.06,
      1,
      1
    ],
    [
      "vine",
      1,
      8,
      12
    ],
    [
      "amber",
      1,
      3,
      5
    ],
    [
      "spore",
      1,
      3,
      5
    ],
    [
      "starshard",
      1,
      2,
      4
    ]
  ],
  "titan_kraken": [
    [
      "hat_t_kraken",
      0.12,
      1,
      1
    ],
    [
      "pet_t_kraken",
      0.06,
      1,
      1
    ],
    [
      "pearl",
      1,
      4,
      6
    ],
    [
      "coral",
      1,
      8,
      12
    ],
    [
      "starshard",
      1,
      3,
      5
    ]
  ],
  "titan_whale": [
    [
      "hat_t_whale",
      0.12,
      1,
      1
    ],
    [
      "pet_t_whale",
      0.06,
      1,
      1
    ],
    [
      "feather",
      1,
      8,
      12
    ],
    [
      "thunderstone",
      1,
      3,
      5
    ],
    [
      "starshard",
      1,
      3,
      5
    ]
  ],
  "titan_eye": [
    [
      "hat_t_eye",
      0.12,
      1,
      1
    ],
    [
      "pet_t_eye",
      0.06,
      1,
      1
    ],
    [
      "shadow",
      1,
      8,
      12
    ],
    [
      "moonstone",
      1,
      3,
      5
    ],
    [
      "starshard",
      1,
      4,
      6
    ],
    [
      "seed_star",
      1,
      2,
      3
    ]
  ]
};
