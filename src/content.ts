import { TITAN_ITEMS, TITAN_LOOT } from './titan-content.ts';
// Gameplay facts measured from the public reference client, 2026-09-30.
// Rendering assets, descriptions and implementation code are independently authored.
export type GearSlot = 'weapon' | 'hat' | 'outfit' | 'boots' | 'pet' | 'disguise';
export type PlanetId = 'home' | 'candy' | 'ice' | 'lava' | 'toy' | 'jungle' | 'ocean' | 'cloud' | 'shadow';
export type ItemId = string;
export type CropId = string;
export type Inventory = Partial<Record<ItemId, number>>;
export type BuffKey = 'atk' | 'def' | 'haste' | 'regen' | 'speed' | 'crit' | 'xp' | 'magnet' | 'luck' | 'light' | 'fireres' | 'lifesteal';
export type BuffDef = Partial<Record<BuffKey, number>> & {
    time: number;
};
export interface WeaponDef {
    kind: 'fist' | 'sword' | 'gun' | 'rod';
    range: number;
    cd: number;
    special?: string;
    shot?: string;
    arc?: number;
    quality?: number;
    /** Steady rods (rod_steady): tension builds slower, and the reel pulls heavy fish in faster. */
    steady?: boolean;
    spread?: number;
    fx?: string;
}
export interface ItemDef {
    name: string;
    icon: string;
    desc: string;
    type: string;
    sell: number;
    price?: number;
    materials?: Inventory;
    slot?: GearSlot;
    attack?: number;
    defense?: number;
    heal?: number;
    buff?: BuffDef;
    grow?: number;
    rare?: boolean;
    legend?: boolean;
    stats?: Partial<Record<'hp' | 'atk' | 'def' | 'crit' | 'speed' | 'regen', number>>;
    weapon?: WeaponDef;
    pet?: {
        scale?: number;
        dmg?: number;
        cd?: number;
        shot?: string;
        [key: string]: unknown;
    };
    luck?: number;
    xp?: number;
    light?: boolean;
    antidote?: boolean;
    lavaproof?: boolean;
    featherfall?: boolean;
    collider?: number;
    power?: number;
    size?: number[];
    cooked?: boolean;
    base?: string;
}
export interface CropDef {
    name: string;
    icon: string;
    duration: number;
    xp: number;
    level: number;
    seed?: string;
    buff?: BuffDef;
}
export interface PlanetDef {
    name: string;
    icon: string;
    level: number;
    color: string;
    sky: string;
    /** Three colours for the planet seen from space: lowland, highland and accent. */
    grad: [string, string, string];
    /** Ground colours: base, variation and the landing area (home uses its regions). */
    ground: [string, string, string];
    description: string;
    enemy: string;
    health: number;
    attack: number;
    xp: number;
    bosses: string[];
    spawns: [
        string,
        number
    ][];
}
export interface Recipe {
    result: string;
    energy: number;
    materials: Inventory;
    category: string;
    station: 'shop' | 'craft' | 'forge';
    count?: number;
}
const CROP_FACTS: Record<string, any> = {
    "radish": {
        "name": "Củ Cải Cười",
        "lvl": 1,
        "time": 15,
        "exp": 6,
        "energy": 4
    },
    "carrot": {
        "name": "Cà Rốt Tốc Hành",
        "lvl": 1,
        "time": 10,
        "exp": 4,
        "energy": 3,
        "buff": {
            "speed": 0.2,
            "time": 45
        }
    },
    "pumpkin": {
        "name": "Bí Ngô Mũm Mĩm",
        "lvl": 2,
        "time": 30,
        "exp": 14,
        "energy": 10
    },
    "mint": {
        "name": "Bạc Hà Mát Lạnh",
        "lvl": 3,
        "time": 35,
        "exp": 14,
        "energy": 9,
        "buff": {
            "regen": 3,
            "time": 60
        }
    },
    "chili": {
        "name": "Ớt Rồng Lửa",
        "lvl": 4,
        "time": 40,
        "exp": 18,
        "energy": 12,
        "buff": {
            "atk": 0.2,
            "time": 60
        }
    },
    "candy": {
        "name": "Hoa Kẹo Bông",
        "lvl": 4,
        "time": 50,
        "exp": 26,
        "energy": 18
    },
    "bean": {
        "name": "Đậu Thần Khổng Lồ",
        "lvl": 5,
        "time": 60,
        "exp": 24,
        "energy": 16,
        "buff": {
            "def": 15,
            "time": 90
        }
    },
    "star": {
        "name": "Nấm Sao Lấp Lánh",
        "lvl": 6,
        "time": 80,
        "exp": 45,
        "energy": 32
    },
    "berry": {
        "name": "Dâu Tiên Lấp Lánh",
        "lvl": 6,
        "time": 70,
        "exp": 30,
        "energy": 20,
        "buff": {
            "xp": 0.5,
            "time": 120
        }
    },
    "coffee": {
        "name": "Cà Phê Tỉnh Táo",
        "lvl": 7,
        "time": 60,
        "exp": 28,
        "energy": 18,
        "buff": {
            "haste": 0.35,
            "time": 60
        }
    },
    "moonflower": {
        "name": "Hoa Trăng Rằm",
        "lvl": 8,
        "time": 90,
        "exp": 40,
        "energy": 26,
        "buff": {
            "crit": 0.12,
            "time": 90
        }
    },
    "magnetmelon": {
        "name": "Dưa Nam Châm",
        "lvl": 9,
        "time": 100,
        "exp": 44,
        "energy": 30,
        "buff": {
            "magnet": 1,
            "time": 120
        }
    },
    "melon": {
        "name": "Dưa Cầu Vồng",
        "lvl": 9,
        "time": 120,
        "exp": 80,
        "energy": 60
    },
    "clover": {
        "name": "Cỏ Bốn Lá May Mắn",
        "lvl": 10,
        "time": 110,
        "exp": 50,
        "energy": 34,
        "buff": {
            "luck": 0.6,
            "time": 180
        }
    },
    "glowshroom": {
        "name": "Nấm Đèn Lồng",
        "lvl": 11,
        "time": 100,
        "exp": 48,
        "energy": 30,
        "buff": {
            "light": 1,
            "regen": 2,
            "time": 240
        }
    },
    "iceberry": {
        "name": "Dâu Băng Giá",
        "lvl": 12,
        "time": 120,
        "exp": 60,
        "energy": 40,
        "seed": "seed_ice",
        "buff": {
            "fireres": 0.6,
            "time": 120
        }
    },
    "goldcorn": {
        "name": "Ngô Vàng Ròng",
        "lvl": 13,
        "time": 150,
        "exp": 70,
        "energy": 110
    },
    "dragonfruit": {
        "name": "Thanh Long Lửa",
        "lvl": 15,
        "time": 160,
        "exp": 90,
        "energy": 70,
        "seed": "seed_fire",
        "heal": 9999,
        "buff": {
            "atk": 0.3,
            "regen": 5,
            "time": 90
        }
    },
    "rainbowrose": {
        "name": "Hồng Cầu Vồng",
        "lvl": 18,
        "time": 200,
        "exp": 120,
        "energy": 90,
        "seed": "seed_star",
        "buff": {
            "atk": 0.15,
            "def": 12,
            "haste": 0.15,
            "regen": 3,
            "speed": 0.1,
            "crit": 0.05,
            "time": 150
        }
    }
};
const ITEM_FACTS: Record<string, any> = {
    "seed_fire": {
        "name": "Hạt Giống Lửa",
        "type": "material",
        "sell": 30,
        "rare": true
    },
    "seed_ice": {
        "name": "Hạt Giống Băng",
        "type": "material",
        "sell": 25,
        "rare": true
    },
    "seed_star": {
        "name": "Hạt Giống Sao",
        "type": "material",
        "sell": 60,
        "rare": true
    },
    "plot_kit": {
        "name": "Luống Đất Mới",
        "type": "placeable",
        "sell": 20
    },
    "meat": {
        "name": "Thịt Tươi",
        "type": "food",
        "sell": 3,
        "heal": 25
    },
    "leather": {
        "name": "Da Thú",
        "type": "material",
        "sell": 4
    },
    "bone": {
        "name": "Xương",
        "type": "material",
        "sell": 3
    },
    "manure": {
        "name": "Phân Bón",
        "type": "farm",
        "sell": 2,
        "grow": 0.5
    },
    "spore": {
        "name": "Bào Tử Kỳ Diệu",
        "type": "farm",
        "sell": 25,
        "grow": 0.5,
        "rare": true
    },
    "tusk": {
        "name": "Nanh Heo Rừng",
        "type": "material",
        "sell": 20,
        "rare": true
    },
    "claw": {
        "name": "Vuốt Sói",
        "type": "food",
        "sell": 22,
        "buff": {
            "haste": 0.35,
            "time": 60
        },
        "rare": true
    },
    "sap": {
        "name": "Nhựa Cây Dính",
        "type": "material",
        "sell": 5
    },
    "nectar": {
        "name": "Mật Hoa Độc",
        "type": "food",
        "sell": 24,
        "buff": {
            "atk": 0.3,
            "time": 60
        },
        "rare": true
    },
    "spine": {
        "name": "Gai Xương Rồng",
        "type": "material",
        "sell": 4
    },
    "cwater": {
        "name": "Nước Xương Rồng",
        "type": "food",
        "sell": 8,
        "heal": 40,
        "buff": {
            "regen": 4,
            "time": 30
        }
    },
    "bloom": {
        "name": "Hoa Sa Mạc",
        "type": "food",
        "sell": 30,
        "buff": {
            "def": 20,
            "time": 90
        },
        "rare": true
    },
    "honey": {
        "name": "Mật Ong Vàng",
        "type": "food",
        "sell": 40,
        "heal": 9999,
        "buff": {
            "atk": 0.25,
            "time": 60
        },
        "rare": true
    },
    "sugar": {
        "name": "Đường Kẹo Sao",
        "type": "material",
        "sell": 7
    },
    "icecrystal": {
        "name": "Tinh Thể Băng",
        "type": "material",
        "sell": 10
    },
    "magma": {
        "name": "Lõi Magma",
        "type": "material",
        "sell": 14
    },
    "starshard": {
        "name": "Mảnh Sao Băng",
        "type": "material",
        "sell": 60,
        "rare": true
    },
    "mcrystal": {
        "name": "Tinh Thể Magma",
        "type": "material",
        "sell": 12
    },
    "obsidian": {
        "name": "Đá Vỏ Chai",
        "type": "material",
        "sell": 18
    },
    "firecore": {
        "name": "Lõi Lửa",
        "type": "material",
        "sell": 45,
        "rare": true
    },
    "dragonscale": {
        "name": "Vảy Rồng",
        "type": "material",
        "sell": 120,
        "rare": true
    },
    "fcrystal": {
        "name": "Pha Lê Lửa",
        "type": "material",
        "sell": 15
    },
    "gear": {
        "name": "Bánh Răng Đồ Chơi",
        "type": "material",
        "sell": 10
    },
    "battery": {
        "name": "Pin Siêu Cấp",
        "type": "material",
        "sell": 40,
        "rare": true
    },
    "vine": {
        "name": "Dây Leo Bền Chắc",
        "type": "material",
        "sell": 12
    },
    "amber": {
        "name": "Hổ Phách Cổ",
        "type": "material",
        "sell": 55,
        "rare": true
    },
    "pearl": {
        "name": "Ngọc Trai",
        "type": "material",
        "sell": 60,
        "rare": true
    },
    "coral": {
        "name": "San Hô Đỏ",
        "type": "material",
        "sell": 14
    },
    "feather": {
        "name": "Lông Vũ Mây",
        "type": "material",
        "sell": 16
    },
    "thunderstone": {
        "name": "Đá Sấm Sét",
        "type": "material",
        "sell": 70,
        "rare": true
    },
    "shadow": {
        "name": "Tinh Chất Bóng Đêm",
        "type": "material",
        "sell": 22
    },
    "moonstone": {
        "name": "Đá Mặt Trăng",
        "type": "material",
        "sell": 90,
        "rare": true
    },
    "dragonegg": {
        "name": "Trứng Rồng Lửa",
        "type": "material",
        "sell": 200,
        "rare": true
    },
    "potion": {
        "name": "Bình Máu",
        "type": "food",
        "sell": 6,
        "heal": 70
    },
    "worm": {
        "name": "Mồi Giun",
        "type": "bait",
        "sell": 1
    },
    "fish_perch": {
        "name": "Cá Rô Tí Hon",
        "type": "fish",
        "sell": 6,
        "heal": 15,
        "power": 0.2
    },
    "fish_clown": {
        "name": "Cá Hề Cam",
        "type": "fish",
        "sell": 10,
        "heal": 20,
        "power": 0.3
    },
    "fish_puffer": {
        "name": "Cá Nóc Tròn",
        "type": "fish",
        "sell": 18,
        "heal": 10,
        "power": 0.45
    },
    "fish_carp": {
        "name": "Cá Chép Vàng",
        "type": "fish",
        "sell": 28,
        "heal": 35,
        "power": 0.62
    },
    "fish_shark": {
        "name": "Cá Mập Con",
        "type": "fish",
        "sell": 65,
        "heal": 60,
        "rare": true,
        "power": 0.92
    },
    "fish_rainbow": {
        "name": "Cá Cầu Vồng",
        "type": "fish",
        "sell": 160,
        "heal": 100,
        "buff": {
            "atk": 0.2,
            "def": 10,
            "time": 120
        },
        "rare": true,
        "power": 0.8
    },
    "fish_catfish": {
        "name": "Cá Trê Râu Dài",
        "type": "fish",
        "sell": 22,
        "heal": 30,
        "power": 0.55,
        "size": [
            30,
            90
        ]
    },
    "fish_koi": {
        "name": "Cá Koi Rồng",
        "type": "fish",
        "sell": 45,
        "heal": 30,
        "buff": {
            "luck": 0.3,
            "time": 120
        },
        "rare": true,
        "power": 0.6,
        "size": [
            25,
            70
        ]
    },
    "fish_eel": {
        "name": "Lươn Điện",
        "type": "fish",
        "sell": 70,
        "heal": 25,
        "buff": {
            "haste": 0.3,
            "time": 60
        },
        "rare": true,
        "power": 0.78,
        "size": [
            60,
            180
        ]
    },
    "fish_swordfish": {
        "name": "Cá Kiếm",
        "type": "fish",
        "sell": 90,
        "heal": 50,
        "buff": {
            "crit": 0.1,
            "time": 90
        },
        "rare": true,
        "power": 0.85,
        "size": [
            90,
            300
        ]
    },
    "fish_jelly": {
        "name": "Sứa Kẹo Dẻo",
        "type": "fish",
        "sell": 26,
        "heal": 25,
        "power": 0.4,
        "size": [
            10,
            40
        ]
    },
    "fish_icepike": {
        "name": "Cá Chó Băng",
        "type": "fish",
        "sell": 48,
        "heal": 40,
        "buff": {
            "fireres": 0.4,
            "time": 90
        },
        "power": 0.7,
        "size": [
            50,
            150
        ]
    },
    "fish_whale": {
        "name": "Cá Voi Con KHỦNG",
        "type": "fish",
        "sell": 420,
        "heal": 200,
        "buff": {
            "def": 25,
            "regen": 5,
            "time": 180
        },
        "rare": true,
        "legend": true,
        "power": 0.97,
        "size": [
            400,
            1200
        ]
    },
    "fish_kraken": {
        "name": "Bạch Tuộc Khổng Lồ",
        "type": "fish",
        "sell": 380,
        "heal": 150,
        "buff": {
            "atk": 0.35,
            "time": 120
        },
        "rare": true,
        "legend": true,
        "power": 0.96,
        "size": [
            200,
            800
        ]
    },
    "fish_golden": {
        "name": "Cá Rồng Vàng",
        "type": "fish",
        "sell": 600,
        "heal": 9999,
        "buff": {
            "atk": 0.25,
            "def": 15,
            "crit": 0.1,
            "luck": 0.5,
            "time": 180
        },
        "rare": true,
        "legend": true,
        "power": 0.92,
        "size": [
            60,
            160
        ]
    },
    "fish_sunfish": {
        "name": "Cá Mặt Trăng",
        "type": "fish",
        "sell": 60,
        "heal": 60,
        "buff": {
            "regen": 4,
            "time": 90
        },
        "power": 0.72,
        "size": [
            80,
            250
        ]
    },
    "fish_angler": {
        "name": "Cá Lồng Đèn",
        "type": "fish",
        "sell": 85,
        "heal": 40,
        "buff": {
            "light": 1,
            "time": 240
        },
        "rare": true,
        "power": 0.8,
        "size": [
            30,
            90
        ]
    },
    "fish_manta": {
        "name": "Cá Đuối Khổng Lồ",
        "type": "fish",
        "sell": 320,
        "heal": 150,
        "buff": {
            "speed": 0.3,
            "def": 15,
            "time": 150
        },
        "rare": true,
        "legend": true,
        "power": 0.95,
        "size": [
            300,
            700
        ]
    },
    "boot": {
        "name": "Chiếc Ủng Cũ",
        "type": "junk",
        "sell": 1,
        "power": 0.15
    },
    "sword_wood": {
        "name": "Kiếm Gỗ",
        "type": "weapon",
        "sell": 10,
        "stats": {
            "atk": 6
        },
        "weapon": {
            "kind": "sword",
            "range": 2.3,
            "cd": 0.55,
            "arc": 0.35,
            "special": "crescent"
        }
    },
    "sword_tusk": {
        "name": "Kiếm Nanh Heo",
        "type": "weapon",
        "sell": 45,
        "stats": {
            "atk": 14,
            "crit": 0.05
        },
        "weapon": {
            "kind": "sword",
            "range": 2.5,
            "cd": 0.6,
            "arc": 0.3,
            "special": "gore"
        }
    },
    "sword_crystal": {
        "name": "Kiếm Pha Lê",
        "type": "weapon",
        "sell": 150,
        "stats": {
            "atk": 26,
            "crit": 0.1
        },
        "weapon": {
            "kind": "sword",
            "range": 2.7,
            "cd": 0.5,
            "arc": 0.3,
            "special": "wave"
        }
    },
    "gun_pea": {
        "name": "Súng Hạt Đậu",
        "type": "weapon",
        "sell": 20,
        "stats": {
            "atk": 4
        },
        "weapon": {
            "kind": "gun",
            "range": 10,
            "cd": 0.38,
            "shot": "pea",
            "special": "peastorm"
        }
    },
    "gun_bubble": {
        "name": "Súng Bong Bóng",
        "type": "weapon",
        "sell": 70,
        "stats": {
            "atk": 9
        },
        "weapon": {
            "kind": "gun",
            "range": 9,
            "cd": 0.5,
            "shot": "bubble",
            "special": "bigbubble"
        }
    },
    "gun_spike": {
        "name": "Súng Gai",
        "type": "weapon",
        "sell": 110,
        "stats": {
            "atk": 15
        },
        "weapon": {
            "kind": "gun",
            "range": 7,
            "cd": 0.75,
            "shot": "spike",
            "spread": 5,
            "special": "nova"
        }
    },
    "sword_candy": {
        "name": "Kiếm Kẹo Gậy",
        "type": "weapon",
        "sell": 90,
        "stats": {
            "atk": 22,
            "crit": 0.08
        },
        "weapon": {
            "kind": "sword",
            "range": 2.6,
            "cd": 0.5,
            "arc": 0.3,
            "special": "crescent"
        }
    },
    "gun_ice": {
        "name": "Súng Băng",
        "type": "weapon",
        "sell": 130,
        "stats": {
            "atk": 20
        },
        "weapon": {
            "kind": "gun",
            "range": 10,
            "cd": 0.42,
            "shot": "ice",
            "special": "blizzard"
        }
    },
    "sword_lava": {
        "name": "Kiếm Dung Nham",
        "type": "weapon",
        "sell": 220,
        "stats": {
            "atk": 38,
            "crit": 0.12
        },
        "weapon": {
            "kind": "sword",
            "range": 2.8,
            "cd": 0.5,
            "arc": 0.3,
            "special": "wave"
        }
    },
    "sword_obsidian": {
        "name": "Kiếm Hắc Diện",
        "type": "weapon",
        "sell": 260,
        "stats": {
            "atk": 46,
            "crit": 0.14
        },
        "weapon": {
            "kind": "sword",
            "range": 2.9,
            "cd": 0.5,
            "arc": 0.3,
            "special": "magma"
        }
    },
    "hammer_thunder": {
        "name": "Búa Sấm Sét",
        "type": "weapon",
        "sell": 300,
        "rare": true,
        "stats": {
            "atk": 55,
            "crit": 0.1
        },
        "weapon": {
            "kind": "sword",
            "range": 2.6,
            "cd": 0.85,
            "arc": 0.1,
            "special": "thunder",
            "fx": "#7ff7ff"
        }
    },
    "scythe_moon": {
        "name": "Lưỡi Hái Trăng",
        "type": "weapon",
        "sell": 320,
        "rare": true,
        "stats": {
            "atk": 48,
            "crit": 0.18
        },
        "weapon": {
            "kind": "sword",
            "range": 3.3,
            "cd": 0.6,
            "arc": -0.3,
            "special": "whirl",
            "fx": "#c9e8ff"
        }
    },
    "bow_star": {
        "name": "Cung Sao Băng",
        "type": "weapon",
        "sell": 280,
        "rare": true,
        "stats": {
            "atk": 34,
            "crit": 0.12
        },
        "weapon": {
            "kind": "gun",
            "range": 13,
            "cd": 0.55,
            "shot": "arrow",
            "special": "starfall"
        }
    },
    "staff_fire": {
        "name": "Trượng Hoả Long",
        "type": "weapon",
        "sell": 340,
        "rare": true,
        "stats": {
            "atk": 40
        },
        "weapon": {
            "kind": "gun",
            "range": 10,
            "cd": 0.7,
            "shot": "fireball",
            "special": "inferno"
        }
    },
    "blaster_rainbow": {
        "name": "Súng Cầu Vồng",
        "type": "weapon",
        "sell": 380,
        "rare": true,
        "stats": {
            "atk": 30,
            "crit": 0.08
        },
        "weapon": {
            "kind": "gun",
            "range": 11,
            "cd": 0.22,
            "shot": "rainbow",
            "special": "laser"
        }
    },
    "toy_hammer": {
        "name": "Búa Kêu Chít Chít",
        "type": "weapon",
        "sell": 120,
        "stats": {
            "atk": 24,
            "crit": 0.1
        },
        "weapon": {
            "kind": "sword",
            "range": 2.4,
            "cd": 0.6,
            "arc": 0.2,
            "special": "bonk",
            "fx": "#ffe14d"
        }
    },
    "trident": {
        "name": "Đinh Ba Thuỷ Thần",
        "type": "weapon",
        "sell": 340,
        "rare": true,
        "stats": {
            "atk": 50,
            "crit": 0.12
        },
        "weapon": {
            "kind": "sword",
            "range": 3.4,
            "cd": 0.62,
            "arc": 0.4,
            "special": "tsunami",
            "fx": "#6fd3ff"
        }
    },
    "rod": {
        "name": "Cần Câu Tre",
        "type": "weapon",
        "sell": 10,
        "weapon": {
            "kind": "rod",
            "quality": 0.3
        }
    },
    "rod_gold": {
        "name": "Cần Câu Vàng",
        "type": "weapon",
        "sell": 75,
        "weapon": {
            "kind": "rod",
            "quality": 0.7
        }
    },
    "rod_steady": {
        "name": "Cần Câu Vững Chãi",
        "type": "weapon",
        "sell": 300,
        "weapon": {
            "kind": "rod",
            "quality": 0.9,
            "steady": true
        }
    },
    "hat_straw": {
        "name": "Mũ Rơm",
        "type": "hat",
        "sell": 10,
        "stats": {
            "def": 3,
            "hp": 10
        }
    },
    "hat_leather": {
        "name": "Mũ Phi Công Da",
        "type": "hat",
        "sell": 25,
        "stats": {
            "def": 7,
            "hp": 20
        }
    },
    "hat_bear": {
        "name": "Mũ Trùm Gấu",
        "type": "hat",
        "sell": 90,
        "rare": true,
        "stats": {
            "def": 12,
            "atk": 5,
            "hp": 40
        }
    },
    "crown": {
        "name": "Vương Miện Gấu",
        "type": "hat",
        "sell": 200,
        "rare": true,
        "stats": {
            "atk": 10,
            "crit": 0.15
        }
    },
    "hat_space": {
        "name": "Mũ Phi Hành Gia",
        "type": "hat",
        "sell": 120,
        "stats": {
            "def": 14,
            "hp": 45,
            "atk": 4
        }
    },
    "armor_leather": {
        "name": "Áo Da",
        "type": "armor",
        "sell": 30,
        "stats": {
            "def": 8,
            "hp": 25
        }
    },
    "armor_wolf": {
        "name": "Áo Lông Sói",
        "type": "armor",
        "sell": 65,
        "stats": {
            "def": 12,
            "hp": 30,
            "speed": 0.12
        }
    },
    "armor_space": {
        "name": "Bộ Đồ Phi Hành Gia",
        "type": "armor",
        "sell": 180,
        "stats": {
            "def": 26,
            "hp": 80,
            "speed": 0.08
        }
    },
    "armor_bone": {
        "name": "Giáp Xương",
        "type": "armor",
        "sell": 100,
        "stats": {
            "def": 20,
            "hp": 60
        }
    },
    "armor_leaf": {
        "name": "Áo Lá Rừng Xanh",
        "type": "armor",
        "sell": 140,
        "stats": {
            "def": 18,
            "hp": 50,
            "regen": 2
        },
        "antidote": true
    },
    "armor_cloud": {
        "name": "Áo Mây Bồng Bềnh",
        "type": "armor",
        "sell": 260,
        "stats": {
            "def": 26,
            "hp": 80,
            "speed": 0.15
        },
        "featherfall": true
    },
    "hat_lantern": {
        "name": "Mũ Đèn Lồng Hồn",
        "type": "hat",
        "sell": 200,
        "stats": {
            "def": 16,
            "hp": 50
        },
        "light": true
    },
    "armor_wings": {
        "name": "Cánh Lửa",
        "type": "armor",
        "sell": 240,
        "stats": {
            "def": 24,
            "hp": 70,
            "speed": 0.18
        }
    },
    "dz_ninja": {
        "name": "🥷 Cải Trang Ninja",
        "type": "disguise",
        "sell": 200,
        "rare": true,
        "stats": {
            "atk": 8,
            "crit": 0.15,
            "speed": 0.2
        }
    },
    "dz_mage": {
        "name": "🧙 Cải Trang Pháp Sư",
        "type": "disguise",
        "sell": 220,
        "rare": true,
        "stats": {
            "atk": 12,
            "hp": 20
        }
    },
    "dz_knight": {
        "name": "🛡️ Cải Trang Hiệp Sĩ",
        "type": "disguise",
        "sell": 220,
        "rare": true,
        "stats": {
            "def": 25,
            "hp": 120,
            "atk": 6
        }
    },
    "dz_mecha": {
        "name": "🤖 Cải Trang Robot",
        "type": "disguise",
        "sell": 260,
        "rare": true,
        "stats": {
            "atk": 6,
            "def": 12,
            "hp": 60
        }
    },
    "dz_dino": {
        "name": "🦖 Cải Trang Khủng Long",
        "type": "disguise",
        "sell": 240,
        "rare": true,
        "stats": {
            "atk": 14,
            "hp": 90
        }
    },
    "dz_fairy": {
        "name": "🧚 Cải Trang Tiên Hoa",
        "type": "disguise",
        "sell": 200,
        "rare": true,
        "stats": {
            "hp": 40,
            "regen": 4,
            "speed": 0.15
        }
    },
    "dz_pirate": {
        "name": "🏴‍☠️ Cải Trang Hải Tặc",
        "type": "disguise",
        "sell": 230,
        "rare": true,
        "stats": {
            "atk": 10,
            "crit": 0.08
        },
        "luck": 0.25
    },
    "dz_superhero": {
        "name": "🦸 Cải Trang Siêu Anh Hùng",
        "type": "disguise",
        "sell": 300,
        "rare": true,
        "stats": {
            "atk": 16,
            "def": 12,
            "speed": 0.25
        }
    },
    "dz_vampire": {
        "name": "🧛 Cải Trang Ma Cà Rồng",
        "type": "disguise",
        "sell": 280,
        "rare": true,
        "stats": {
            "atk": 12,
            "crit": 0.1
        }
    },
    "dz_snowman": {
        "name": "⛄ Cải Trang Người Tuyết",
        "type": "disguise",
        "sell": 180,
        "rare": true,
        "stats": {
            "def": 10,
            "hp": 60
        }
    },
    "hat_cowboy": {
        "name": "Mũ Cao Bồi",
        "type": "hat",
        "sell": 30,
        "stats": {
            "def": 6,
            "hp": 20,
            "crit": 0.03
        }
    },
    "hat_wizard": {
        "name": "Mũ Phù Thuỷ",
        "type": "hat",
        "sell": 60,
        "stats": {
            "def": 5,
            "hp": 15,
            "atk": 6
        }
    },
    "hat_pirate": {
        "name": "Mũ Thuyền Trưởng",
        "type": "hat",
        "sell": 50,
        "stats": {
            "def": 8,
            "hp": 25
        },
        "luck": 0.1
    },
    "hat_chef": {
        "name": "Mũ Đầu Bếp",
        "type": "hat",
        "sell": 35,
        "stats": {
            "def": 4,
            "hp": 30
        }
    },
    "hat_bunny": {
        "name": "Băng Đô Tai Thỏ",
        "type": "hat",
        "sell": 30,
        "stats": {
            "def": 3,
            "hp": 15,
            "speed": 0.06
        }
    },
    "hat_cat": {
        "name": "Mũ Mèo Cam",
        "type": "hat",
        "sell": 40,
        "stats": {
            "def": 7,
            "hp": 25
        }
    },
    "hat_viking": {
        "name": "Mũ Sừng Viking",
        "type": "hat",
        "sell": 80,
        "stats": {
            "def": 14,
            "hp": 40,
            "atk": 4
        }
    },
    "hat_santa": {
        "name": "Mũ Ông Già Noel",
        "type": "hat",
        "sell": 45,
        "stats": {
            "def": 6,
            "hp": 30,
            "regen": 1
        }
    },
    "hat_graduate": {
        "name": "Mũ Tốt Nghiệp",
        "type": "hat",
        "sell": 70,
        "stats": {
            "def": 5,
            "hp": 20
        },
        "xp": 0.1
    },
    "hat_samurai": {
        "name": "Mũ Giáp Samurai",
        "type": "hat",
        "sell": 110,
        "stats": {
            "def": 16,
            "hp": 45,
            "crit": 0.05
        }
    },
    "hat_party": {
        "name": "Mũ Tiệc Tùng",
        "type": "hat",
        "sell": 20,
        "stats": {
            "hp": 10
        }
    },
    "hat_halo": {
        "name": "Vầng Hào Quang",
        "type": "hat",
        "sell": 150,
        "rare": true,
        "stats": {
            "def": 10,
            "hp": 60,
            "regen": 2
        },
        "light": true
    },
    "hat_frog": {
        "name": "Mũ Ếch Xanh",
        "type": "hat",
        "sell": 35,
        "stats": {
            "def": 5,
            "hp": 20,
            "speed": 0.05
        }
    },
    "armor_knight": {
        "name": "Giáp Hiệp Sĩ",
        "type": "armor",
        "sell": 160,
        "stats": {
            "def": 28,
            "hp": 90,
            "speed": -0.05
        }
    },
    "armor_pirate": {
        "name": "Áo Choàng Hải Tặc",
        "type": "armor",
        "sell": 90,
        "stats": {
            "def": 14,
            "hp": 40,
            "crit": 0.05
        },
        "luck": 0.1
    },
    "armor_chef": {
        "name": "Áo Đầu Bếp",
        "type": "armor",
        "sell": 40,
        "stats": {
            "def": 8,
            "hp": 40,
            "regen": 1
        }
    },
    "armor_tux": {
        "name": "Áo Vest Lịch Lãm",
        "type": "armor",
        "sell": 120,
        "stats": {
            "def": 12,
            "hp": 35,
            "crit": 0.08
        }
    },
    "armor_kimono": {
        "name": "Áo Kimono Hoa",
        "type": "armor",
        "sell": 100,
        "stats": {
            "def": 12,
            "hp": 40,
            "speed": 0.1
        }
    },
    "armor_hawaii": {
        "name": "Áo Hawaii Mùa Hè",
        "type": "armor",
        "sell": 45,
        "stats": {
            "def": 8,
            "hp": 30,
            "speed": 0.08
        }
    },
    "armor_superhero": {
        "name": "Bộ Đồ Siêu Anh Hùng",
        "type": "armor",
        "sell": 220,
        "rare": true,
        "stats": {
            "def": 20,
            "hp": 70,
            "atk": 8,
            "speed": 0.1
        }
    },
    "armor_angel": {
        "name": "Áo Cánh Thiên Thần",
        "type": "armor",
        "sell": 260,
        "rare": true,
        "stats": {
            "def": 22,
            "hp": 90,
            "regen": 3
        },
        "featherfall": true
    },
    "armor_santa": {
        "name": "Áo Ông Già Noel",
        "type": "armor",
        "sell": 70,
        "stats": {
            "def": 12,
            "hp": 50
        }
    },
    "armor_hoodie": {
        "name": "Áo Hoodie Cam",
        "type": "armor",
        "sell": 35,
        "stats": {
            "def": 6,
            "hp": 30,
            "speed": 0.05
        }
    },
    "boots_rocket": {
        "name": "Giày Tên Lửa",
        "type": "feet",
        "sell": 200,
        "rare": true,
        "stats": {
            "def": 4,
            "speed": 0.25
        }
    },
    "boots_cowboy": {
        "name": "Ủng Cao Bồi",
        "type": "feet",
        "sell": 50,
        "stats": {
            "def": 8,
            "hp": 20
        }
    },
    "boots_flipper": {
        "name": "Chân Vịt Lặn",
        "type": "feet",
        "sell": 90,
        "stats": {
            "def": 3
        }
    },
    "boots_cloud": {
        "name": "Giày Mây Bay",
        "type": "feet",
        "sell": 160,
        "stats": {
            "def": 5,
            "speed": 0.12
        },
        "featherfall": true
    },
    "boots_lava": {
        "name": "Giày Chống Dung Nham",
        "type": "feet",
        "sell": 90,
        "stats": {
            "def": 6
        },
        "lavaproof": true
    },
    "pet_robot": {
        "name": "Robot Mini",
        "type": "pet",
        "sell": 150,
        "stats": {
            "atk": 3
        },
        "pet": {
            "scale": 0.2,
            "dmg": 0.3,
            "cd": 1.2,
            "shot": "rainbow"
        }
    },
    "pet_parrot": {
        "name": "Vẹt Nhí Nhảnh",
        "type": "pet",
        "sell": 160,
        "stats": {
            "atk": 3
        },
        "pet": {
            "scale": 0.55,
            "dmg": 0.3,
            "cd": 1.3,
            "shot": "arrow"
        },
        "luck": 0.15
    },
    "pet_turtle": {
        "name": "Rùa Biển Con",
        "type": "pet",
        "sell": 180,
        "stats": {
            "def": 8
        },
        "pet": {
            "scale": 0.38,
            "dmg": 0.25,
            "cd": 1.8,
            "shot": "bubble"
        }
    },
    "pet_sheep": {
        "name": "Cừu Mây Con",
        "type": "pet",
        "sell": 220,
        "stats": {
            "hp": 40
        },
        "pet": {
            "scale": 0.5,
            "dmg": 0.3,
            "cd": 1.5,
            "shot": "ice"
        }
    },
    "pet_firefly": {
        "name": "Đom Đóm Sáng",
        "type": "pet",
        "sell": 260,
        "stats": {
            "atk": 4
        },
        "pet": {
            "scale": 0.5,
            "dmg": 0.35,
            "cd": 1.3,
            "shot": "fire"
        },
        "light": true
    },
    "pet_dragon": {
        "name": "Rồng Con",
        "type": "pet",
        "sell": 300,
        "rare": true,
        "stats": {
            "atk": 4
        },
        "pet": {
            "scale": 0.26,
            "dmg": 0.35,
            "cd": 1.6
        }
    },
    "deco_volcano": {
        "name": "Núi Lửa Mini",
        "type": "decor",
        "sell": 20,
        "collider": 0.8,
        "set": "lava"
    },
    "deco_lamp": {
        "name": "Đèn Dung Nham",
        "type": "decor",
        "sell": 30,
        "light": "#ff8a3d",
        "collider": 0.3,
        "set": "lava"
    },
    "deco_table": {
        "name": "Bàn Hắc Diện",
        "type": "decor",
        "sell": 45,
        "collider": 1.1,
        "set": "lava"
    },
    "deco_statue": {
        "name": "Tượng Người Đá",
        "type": "decor",
        "sell": 80,
        "rare": true,
        "collider": 0.7,
        "set": "lava"
    },
    "deco_nest": {
        "name": "Tổ Trứng Rồng",
        "type": "decor",
        "sell": 90,
        "rare": true,
        "collider": 0.6,
        "set": "lava"
    },
    "deco_trophy": {
        "name": "Cúp Đầu Rồng",
        "type": "decor",
        "sell": 150,
        "rare": true,
        "collider": 0.6,
        "set": "lava"
    },
    "deco_teddy": {
        "name": "Gấu Bông Khổng Lồ",
        "type": "decor",
        "sell": 40,
        "collider": 0.6,
        "set": "toy"
    },
    "deco_musicbox": {
        "name": "Hộp Nhạc Vũ Công",
        "type": "decor",
        "sell": 55,
        "collider": 0.5,
        "set": "toy"
    },
    "deco_traincar": {
        "name": "Đầu Tàu Đồ Chơi",
        "type": "decor",
        "sell": 80,
        "rare": true,
        "collider": 0.8,
        "set": "toy"
    },
    "deco_totem": {
        "name": "Cột Totem Rừng Sâu",
        "type": "decor",
        "sell": 60,
        "collider": 0.4,
        "set": "jungle"
    },
    "deco_rafflesia": {
        "name": "Hoa Xác Thối Khổng Lồ",
        "type": "decor",
        "sell": 45,
        "collider": 0.8,
        "set": "jungle"
    },
    "deco_fruittree": {
        "name": "Cây Quả Rừng",
        "type": "decor",
        "sell": 90,
        "rare": true,
        "collider": 0.5,
        "set": "jungle"
    },
    "deco_aquarium": {
        "name": "Bể Cá San Hô",
        "type": "decor",
        "sell": 90,
        "collider": 0.8,
        "set": "ocean"
    },
    "deco_shell": {
        "name": "Vỏ Ốc Khổng Lồ",
        "type": "decor",
        "sell": 50,
        "collider": 0.6,
        "set": "ocean"
    },
    "deco_piratechest": {
        "name": "Rương Hải Tặc",
        "type": "decor",
        "sell": 150,
        "rare": true,
        "collider": 0.6,
        "set": "ocean"
    },
    "deco_cloudsofa": {
        "name": "Ghế Mây Êm Ái",
        "type": "decor",
        "sell": 70,
        "collider": 0.8,
        "set": "sky"
    },
    "deco_windchime": {
        "name": "Chuông Gió Pha Lê",
        "type": "decor",
        "sell": 60,
        "collider": 0.3,
        "set": "sky"
    },
    "deco_rainbow": {
        "name": "Cổng Cầu Vồng",
        "type": "decor",
        "sell": 160,
        "rare": true,
        "collider": 0.5,
        "set": "sky"
    },
    "deco_ghostlantern": {
        "name": "Đèn Lồng Ma",
        "type": "decor",
        "sell": 60,
        "collider": 0.3,
        "set": "dark"
    },
    "deco_nightcrystal": {
        "name": "Pha Lê Đêm",
        "type": "decor",
        "sell": 90,
        "collider": 0.6,
        "set": "dark"
    },
    "deco_owlstatue": {
        "name": "Tượng Cú Đêm",
        "type": "decor",
        "sell": 180,
        "rare": true,
        "collider": 0.5,
        "set": "dark"
    }
};
const PLANET_FACTS: Record<string, any> = {
    "home": {
        "name": "Hành Tinh Mầm Xanh",
        "emoji": "🌱",
        "lvl": 1,
        "fuel": 0,
        "sky": "#aee4ff",
        "grad": [
            "#9be36f",
            "#3fae52",
            "#5ec8ff"
        ]
    },
    "candy": {
        "name": "Hành Tinh Kẹo Ngọt",
        "emoji": "🍭",
        "lvl": 6,
        "fuel": 40,
        "sky": "#ffc9ea",
        "ground": [
            "#ff9fd0",
            "#ffc4e4",
            "#ffe98a"
        ],
        "grad": [
            "#ffc2e0",
            "#ff7ab0",
            "#fff08a"
        ],
        "boss": "cake",
        "bosses": [
            "cake",
            "gingerbread",
            "jellyqueen"
        ],
        "spawns": [
            [
                "jelly",
                26
            ],
            [
                "gummy",
                16
            ],
            [
                "lollipop",
                16
            ],
            [
                "bunny",
                18
            ],
            [
                "chocobeetle",
                12
            ]
        ]
    },
    "ice": {
        "name": "Hành Tinh Băng Giá",
        "emoji": "❄️",
        "lvl": 10,
        "fuel": 80,
        "sky": "#d8f0ff",
        "ground": [
            "#cfe6fb",
            "#f4faff",
            "#b9d6f2"
        ],
        "grad": [
            "#e8f7ff",
            "#8fd3ff",
            "#ffffff"
        ],
        "boss": "yeti",
        "bosses": [
            "yeti",
            "mammoth",
            "frostowl"
        ],
        "spawns": [
            [
                "snowball",
                24
            ],
            [
                "penguin",
                18
            ],
            [
                "icebloom",
                14
            ],
            [
                "seal",
                14
            ],
            [
                "owl",
                16
            ]
        ]
    },
    "lava": {
        "name": "Hành Tinh Dung Nham",
        "emoji": "🌋",
        "lvl": 14,
        "fuel": 140,
        "sky": "#ffb08a",
        "ground": [
            "#6e5a60",
            "#8a6f6a",
            "#4f4450"
        ],
        "grad": [
            "#ff9a5a",
            "#c94a2a",
            "#4a3f4f"
        ],
        "boss": "golem",
        "bosses": [
            "golem",
            "dragon"
        ],
        "spawns": [
            [
                "magmaslime",
                22
            ],
            [
                "firelizard",
                12
            ],
            [
                "volcano",
                12
            ],
            [
                "firebat",
                20
            ],
            [
                "magmacrab",
                10
            ],
            [
                "magmaturtle",
                10
            ],
            [
                "lavaworm",
                8
            ]
        ]
    },
    "toy": {
        "name": "Hành Tinh Đồ Chơi",
        "emoji": "🧸",
        "lvl": 4,
        "fuel": 30,
        "sky": "#ffe9f6",
        "ground": [
            "#ffe4ef",
            "#e2f0ff",
            "#fff4c8"
        ],
        "grad": [
            "#ffe14d",
            "#ff7ab0",
            "#4dc3ff"
        ],
        "boss": "robot",
        "bosses": [
            "robot"
        ],
        "spawns": [
            [
                "toysoldier",
                20
            ],
            [
                "windmouse",
                18
            ],
            [
                "jackbox",
                16
            ]
        ]
    },
    "jungle": {
        "name": "Rừng Rậm Nguyên Sinh",
        "emoji": "🌿",
        "lvl": 8,
        "fuel": 60,
        "sky": "#bfe8b0",
        "ground": [
            "#3f8a3a",
            "#5aa84a",
            "#8a6a3a"
        ],
        "grad": [
            "#7fd35a",
            "#1f6e35",
            "#ffb13d"
        ],
        "boss": "gorilla",
        "bosses": [
            "gorilla"
        ],
        "spawns": [
            [
                "monkey",
                18
            ],
            [
                "snake",
                16
            ],
            [
                "chameleon",
                16
            ],
            [
                "flytrap",
                12
            ]
        ]
    },
    "ocean": {
        "name": "Hành Tinh Đại Dương",
        "emoji": "🌊",
        "lvl": 12,
        "fuel": 90,
        "sky": "#aee8ff",
        "ground": [
            "#f2dca0",
            "#e8cf8a",
            "#f8e8b8"
        ],
        "grad": [
            "#6fd3ff",
            "#2f7fd6",
            "#f2dca0"
        ],
        "boss": "leviathan",
        "bosses": [
            "leviathan"
        ],
        "spawns": [
            [
                "jellyzap",
                18
            ],
            [
                "hammershark",
                14
            ],
            [
                "urchin",
                14
            ],
            [
                "crab",
                12
            ]
        ]
    },
    "sky": {
        "name": "Quần Đảo Mây Trời",
        "emoji": "☁️",
        "lvl": 16,
        "fuel": 120,
        "sky": "#9fd8ff",
        "ground": [
            "#bfe8a0",
            "#d8f5c0",
            "#e8f0ff"
        ],
        "grad": [
            "#ffffff",
            "#8fd8ff",
            "#ffe14d"
        ],
        "boss": "phoenix",
        "bosses": [
            "phoenix"
        ],
        "spawns": [
            [
                "cloudsheep",
                22
            ],
            [
                "thunderbird",
                18
            ],
            [
                "windspirit",
                14
            ]
        ]
    },
    "dark": {
        "name": "Tinh Cầu Bóng Đêm",
        "emoji": "🌑",
        "lvl": 20,
        "fuel": 160,
        "sky": "#0d0b1a",
        "ground": [
            "#2a2440",
            "#3a3258",
            "#1e1a30"
        ],
        "grad": [
            "#8a5aff",
            "#2a2440",
            "#9ff7ff"
        ],
        "boss": "shadowlord",
        "bosses": [
            "shadowlord"
        ],
        "spawns": [
            [
                "wisp",
                22
            ],
            [
                "spider",
                18
            ],
            [
                "demoneye",
                14
            ]
        ]
    }
};
const SHOP_FACTS: {
    tab: string;
    items: {
        id: string;
        cost: number;
        mats?: Inventory;
        n?: number;
    }[];
}[] = [
    {
        "tab": "Vũ khí",
        "items": [
            {
                "id": "sword_wood",
                "cost": 25
            },
            {
                "id": "gun_pea",
                "cost": 40
            },
            {
                "id": "sword_tusk",
                "cost": 90,
                "mats": {
                    "tusk": 2,
                    "bone": 3
                }
            },
            {
                "id": "gun_bubble",
                "cost": 140,
                "mats": {
                    "sap": 4,
                    "nectar": 1
                }
            },
            {
                "id": "gun_spike",
                "cost": 220,
                "mats": {
                    "spine": 10
                }
            },
            {
                "id": "sword_crystal",
                "cost": 320,
                "mats": {
                    "bloom": 2,
                    "claw": 2,
                    "bone": 5
                }
            }
        ]
    },
    {
        "tab": "Trang phục",
        "items": [
            {
                "id": "hat_straw",
                "cost": 20
            },
            {
                "id": "hat_leather",
                "cost": 45,
                "mats": {
                    "leather": 3
                }
            },
            {
                "id": "armor_leather",
                "cost": 60,
                "mats": {
                    "leather": 5
                }
            },
            {
                "id": "armor_wolf",
                "cost": 130,
                "mats": {
                    "leather": 6,
                    "claw": 2
                }
            },
            {
                "id": "armor_bone",
                "cost": 200,
                "mats": {
                    "bone": 8,
                    "leather": 4
                }
            }
        ]
    },
    {
        "tab": "Thời trang",
        "items": [
            {
                "id": "hat_party",
                "cost": 15
            },
            {
                "id": "hat_bunny",
                "cost": 40,
                "mats": {
                    "leather": 2
                }
            },
            {
                "id": "hat_frog",
                "cost": 45,
                "mats": {
                    "leather": 2
                }
            },
            {
                "id": "hat_cat",
                "cost": 55,
                "mats": {
                    "leather": 3
                }
            },
            {
                "id": "hat_cowboy",
                "cost": 60,
                "mats": {
                    "leather": 4
                }
            },
            {
                "id": "hat_chef",
                "cost": 50,
                "mats": {
                    "sugar": 3
                }
            },
            {
                "id": "hat_santa",
                "cost": 80,
                "mats": {
                    "leather": 3,
                    "icecrystal": 2
                }
            },
            {
                "id": "hat_pirate",
                "cost": 90,
                "mats": {
                    "leather": 4,
                    "coral": 2
                }
            },
            {
                "id": "hat_wizard",
                "cost": 120,
                "mats": {
                    "sap": 3,
                    "starshard": 1
                }
            },
            {
                "id": "hat_graduate",
                "cost": 130,
                "mats": {
                    "leather": 4,
                    "gear": 3
                }
            },
            {
                "id": "hat_viking",
                "cost": 150,
                "mats": {
                    "bone": 6,
                    "tusk": 2
                }
            },
            {
                "id": "hat_samurai",
                "cost": 220,
                "mats": {
                    "bone": 6,
                    "obsidian": 3
                }
            },
            {
                "id": "hat_halo",
                "cost": 380,
                "mats": {
                    "feather": 8,
                    "moonstone": 1,
                    "starshard": 1
                }
            },
            {
                "id": "armor_hoodie",
                "cost": 50,
                "mats": {
                    "leather": 3
                }
            },
            {
                "id": "armor_hawaii",
                "cost": 70,
                "mats": {
                    "leather": 3,
                    "coral": 2
                }
            },
            {
                "id": "armor_chef",
                "cost": 60,
                "mats": {
                    "leather": 3
                }
            },
            {
                "id": "armor_santa",
                "cost": 110,
                "mats": {
                    "leather": 5,
                    "icecrystal": 3
                }
            },
            {
                "id": "armor_kimono",
                "cost": 160,
                "mats": {
                    "leather": 5,
                    "nectar": 1
                }
            },
            {
                "id": "armor_pirate",
                "cost": 170,
                "mats": {
                    "leather": 6,
                    "pearl": 1
                }
            },
            {
                "id": "armor_tux",
                "cost": 200,
                "mats": {
                    "leather": 6,
                    "gear": 4
                }
            },
            {
                "id": "armor_knight",
                "cost": 280,
                "mats": {
                    "bone": 10,
                    "obsidian": 4
                }
            },
            {
                "id": "armor_superhero",
                "cost": 420,
                "mats": {
                    "starshard": 2,
                    "battery": 2,
                    "leather": 6
                }
            },
            {
                "id": "armor_angel",
                "cost": 500,
                "mats": {
                    "feather": 14,
                    "moonstone": 1,
                    "starshard": 2
                }
            },
            {
                "id": "boots_cowboy",
                "cost": 70,
                "mats": {
                    "leather": 4
                }
            },
            {
                "id": "boots_flipper",
                "cost": 130,
                "mats": {
                    "coral": 5,
                    "leather": 2
                }
            },
            {
                "id": "boots_cloud",
                "cost": 240,
                "mats": {
                    "feather": 10
                }
            },
            {
                "id": "boots_rocket",
                "cost": 320,
                "mats": {
                    "battery": 2,
                    "gear": 6,
                    "magma": 2
                }
            }
        ]
    },
    {
        "tab": "🎭 Cải trang",
        "items": [
            {
                "id": "dz_snowman",
                "cost": 300,
                "mats": {
                    "icecrystal": 10,
                    "leather": 4
                }
            },
            {
                "id": "dz_fairy",
                "cost": 320,
                "mats": {
                    "nectar": 3,
                    "sugar": 8,
                    "feather": 4
                }
            },
            {
                "id": "dz_ninja",
                "cost": 360,
                "mats": {
                    "leather": 8,
                    "shadow": 4,
                    "claw": 2
                }
            },
            {
                "id": "dz_pirate",
                "cost": 380,
                "mats": {
                    "pearl": 2,
                    "coral": 8,
                    "leather": 6
                }
            },
            {
                "id": "dz_mage",
                "cost": 400,
                "mats": {
                    "starshard": 2,
                    "sap": 6,
                    "fcrystal": 2
                }
            },
            {
                "id": "dz_knight",
                "cost": 420,
                "mats": {
                    "bone": 12,
                    "obsidian": 6
                }
            },
            {
                "id": "dz_dino",
                "cost": 420,
                "mats": {
                    "amber": 3,
                    "vine": 10,
                    "bone": 6
                }
            },
            {
                "id": "dz_mecha",
                "cost": 480,
                "mats": {
                    "gear": 14,
                    "battery": 3
                }
            },
            {
                "id": "dz_vampire",
                "cost": 500,
                "mats": {
                    "shadow": 10,
                    "moonstone": 1,
                    "leather": 6
                }
            },
            {
                "id": "dz_superhero",
                "cost": 600,
                "mats": {
                    "starshard": 3,
                    "thunderstone": 2,
                    "battery": 2
                }
            }
        ]
    },
    {
        "tab": "Vật dụng",
        "items": [
            {
                "id": "potion",
                "cost": 15
            },
            {
                "id": "worm",
                "cost": 6,
                "n": 5
            },
            {
                "id": "manure",
                "cost": 8
            },
            {
                "id": "rod",
                "cost": 20
            },
            {
                "id": "rod_gold",
                "cost": 150,
                "mats": {
                    "bone": 3,
                    "sap": 2
                }
            },
            {
                "id": "rod_steady",
                "cost": 900,
                "mats": {
                    "coral": 4,
                    "pearl": 2
                }
            },
            {
                "id": "plot_kit",
                "cost": 80
            }
        ]
    },
    {
        "tab": "Vũ trụ",
        "items": [
            {
                "id": "sword_candy",
                "cost": 200,
                "mats": {
                    "sugar": 8,
                    "bone": 2
                }
            },
            {
                "id": "gun_ice",
                "cost": 260,
                "mats": {
                    "icecrystal": 8,
                    "sap": 2
                }
            },
            {
                "id": "sword_lava",
                "cost": 420,
                "mats": {
                    "magma": 8,
                    "starshard": 1
                }
            },
            {
                "id": "hat_space",
                "cost": 240,
                "mats": {
                    "starshard": 2,
                    "icecrystal": 3
                }
            },
            {
                "id": "armor_space",
                "cost": 360,
                "mats": {
                    "starshard": 3,
                    "sugar": 5,
                    "magma": 3
                }
            }
        ]
    },
    {
        "tab": "Huyền thoại",
        "items": [
            {
                "id": "bow_star",
                "cost": 480,
                "mats": {
                    "sugar": 10,
                    "sap": 4,
                    "starshard": 2
                }
            },
            {
                "id": "hammer_thunder",
                "cost": 520,
                "mats": {
                    "bone": 10,
                    "icecrystal": 6,
                    "starshard": 2
                }
            },
            {
                "id": "staff_fire",
                "cost": 560,
                "mats": {
                    "magma": 8,
                    "firecore": 2,
                    "obsidian": 4
                }
            },
            {
                "id": "scythe_moon",
                "cost": 600,
                "mats": {
                    "icecrystal": 8,
                    "obsidian": 4,
                    "starshard": 3
                }
            },
            {
                "id": "blaster_rainbow",
                "cost": 700,
                "mats": {
                    "sugar": 6,
                    "icecrystal": 6,
                    "magma": 6,
                    "starshard": 3
                }
            }
        ]
    }
];
const CRAFT_FACTS: {
    tab: string;
    items: {
        id: string;
        cost: number;
        mats?: Inventory;
        n?: number;
    }[];
}[] = [
    {
        "tab": "🌋 Trang bị",
        "items": [
            {
                "id": "boots_lava",
                "cost": 180,
                "mats": {
                    "obsidian": 4,
                    "mcrystal": 6
                }
            },
            {
                "id": "sword_obsidian",
                "cost": 450,
                "mats": {
                    "obsidian": 10,
                    "firecore": 2,
                    "mcrystal": 6
                }
            },
            {
                "id": "armor_wings",
                "cost": 420,
                "mats": {
                    "firecore": 3,
                    "dragonscale": 2,
                    "obsidian": 6
                }
            }
        ]
    },
    {
        "tab": "🐉 Thú cưng",
        "items": [
            {
                "id": "pet_dragon",
                "cost": 300,
                "mats": {
                    "dragonegg": 1,
                    "firecore": 3
                }
            }
        ]
    },
    {
        "tab": "🧸🌿",
        "items": [
            {
                "id": "toy_hammer",
                "cost": 150,
                "mats": {
                    "gear": 8,
                    "battery": 1
                }
            },
            {
                "id": "deco_teddy",
                "cost": 60,
                "mats": {
                    "gear": 4,
                    "leather": 3
                }
            },
            {
                "id": "deco_musicbox",
                "cost": 90,
                "mats": {
                    "gear": 6,
                    "battery": 1
                }
            },
            {
                "id": "pet_robot",
                "cost": 260,
                "mats": {
                    "battery": 3,
                    "gear": 10
                }
            },
            {
                "id": "armor_leaf",
                "cost": 220,
                "mats": {
                    "vine": 10,
                    "amber": 1
                }
            },
            {
                "id": "deco_totem",
                "cost": 90,
                "mats": {
                    "vine": 6,
                    "amber": 1
                }
            },
            {
                "id": "deco_rafflesia",
                "cost": 70,
                "mats": {
                    "vine": 4,
                    "nectar": 1
                }
            },
            {
                "id": "pet_parrot",
                "cost": 280,
                "mats": {
                    "amber": 3,
                    "vine": 8,
                    "feather": 2
                }
            }
        ]
    },
    {
        "tab": "🌊☁️🌑",
        "items": [
            {
                "id": "trident",
                "cost": 520,
                "mats": {
                    "pearl": 4,
                    "coral": 10,
                    "starshard": 2
                }
            },
            {
                "id": "deco_aquarium",
                "cost": 120,
                "mats": {
                    "coral": 8,
                    "pearl": 1
                }
            },
            {
                "id": "deco_shell",
                "cost": 70,
                "mats": {
                    "coral": 5
                }
            },
            {
                "id": "pet_turtle",
                "cost": 300,
                "mats": {
                    "pearl": 3,
                    "coral": 8
                }
            },
            {
                "id": "armor_cloud",
                "cost": 450,
                "mats": {
                    "feather": 14,
                    "thunderstone": 2
                }
            },
            {
                "id": "deco_cloudsofa",
                "cost": 100,
                "mats": {
                    "feather": 8
                }
            },
            {
                "id": "deco_windchime",
                "cost": 90,
                "mats": {
                    "feather": 4,
                    "icecrystal": 3
                }
            },
            {
                "id": "pet_sheep",
                "cost": 340,
                "mats": {
                    "feather": 12,
                    "thunderstone": 1
                }
            },
            {
                "id": "hat_lantern",
                "cost": 480,
                "mats": {
                    "shadow": 12,
                    "moonstone": 2,
                    "fcrystal": 2
                }
            },
            {
                "id": "deco_ghostlantern",
                "cost": 90,
                "mats": {
                    "shadow": 5,
                    "fcrystal": 1
                }
            },
            {
                "id": "deco_nightcrystal",
                "cost": 140,
                "mats": {
                    "shadow": 8,
                    "moonstone": 1
                }
            },
            {
                "id": "pet_firefly",
                "cost": 380,
                "mats": {
                    "shadow": 10,
                    "moonstone": 2,
                    "fcrystal": 3
                }
            }
        ]
    },
    {
        "tab": "🏡 Trang trí",
        "items": [
            {
                "id": "deco_volcano",
                "cost": 40,
                "mats": {
                    "mcrystal": 4
                }
            },
            {
                "id": "deco_lamp",
                "cost": 60,
                "mats": {
                    "mcrystal": 3,
                    "fcrystal": 1
                }
            },
            {
                "id": "deco_table",
                "cost": 90,
                "mats": {
                    "obsidian": 5
                }
            },
            {
                "id": "deco_statue",
                "cost": 160,
                "mats": {
                    "obsidian": 8,
                    "firecore": 1
                }
            },
            {
                "id": "deco_nest",
                "cost": 120,
                "mats": {
                    "obsidian": 3,
                    "dragonscale": 1
                }
            },
            {
                "id": "deco_trophy",
                "cost": 250,
                "mats": {
                    "dragonscale": 3,
                    "firecore": 2
                }
            }
        ]
    }
];
const DISGUISE_FACTS: Record<string, any> = {
    "dz_superhero": {
        "name": "Siêu Anh Hùng",
        "emoji": "🦸",
        "color": "#3f6fff",
        "weapon": {
            "kind": "fist",
            "range": 1.3,
            "cd": 0.28
        },
        "skills": [
            {
                "name": "Bay Lên Trời",
                "icon": "🦸",
                "cd": 3
            },
            {
                "name": "Lao Bổ Xuống",
                "icon": "☄️",
                "cd": 6
            },
            {
                "name": "Tia Mắt Laser",
                "icon": "👀",
                "cd": 7
            },
            {
                "name": "Ném Tảng Đá",
                "icon": "🪨",
                "cd": 10
            }
        ]
    },
    "dz_ninja": {
        "name": "Ninja Bóng Đêm",
        "emoji": "🥷",
        "color": "#c9c9ff",
        "weapon": {
            "kind": "sword",
            "range": 2.3,
            "cd": 0.3,
            "arc": 0.3,
            "fx": "#c9c9ff"
        },
        "skills": [
            {
                "name": "Phân Thân",
                "icon": "👥",
                "cd": 14
            },
            {
                "name": "Ẩn Thân",
                "icon": "👤",
                "cd": 12
            },
            {
                "name": "Ảnh Tập Kích",
                "icon": "⚡",
                "cd": 6
            },
            {
                "name": "Bom Khói",
                "icon": "💨",
                "cd": 12
            }
        ]
    },
    "dz_mage": {
        "name": "Đại Pháp Sư",
        "emoji": "🧙",
        "color": "#7f6fff",
        "weapon": {
            "kind": "gun",
            "range": 10,
            "cd": 0.7,
            "shot": "fireball"
        },
        "skills": [
            {
                "name": "Siêu Hoả Cầu",
                "icon": "🔥",
                "cd": 5
            },
            {
                "name": "Dịch Chuyển",
                "icon": "✨",
                "cd": 5
            },
            {
                "name": "Biến Thành Cừu",
                "icon": "🐑",
                "cd": 12
            },
            {
                "name": "Hố Đen",
                "icon": "🌀",
                "cd": 13
            }
        ]
    },
    "dz_knight": {
        "name": "Hiệp Sĩ Ánh Sáng",
        "emoji": "🛡️",
        "color": "#fff3c4",
        "weapon": {
            "kind": "sword",
            "range": 2.8,
            "cd": 0.6,
            "arc": 0.2,
            "fx": "#fff3c4"
        },
        "skills": [
            {
                "name": "Giơ Khiên",
                "icon": "🛡️",
                "cd": 8
            },
            {
                "name": "Xung Phong",
                "icon": "🐎",
                "cd": 7
            },
            {
                "name": "Khiêu Khích",
                "icon": "📯",
                "cd": 12
            },
            {
                "name": "Kiếm Thánh",
                "icon": "🗡️",
                "cd": 12
            }
        ]
    },
    "dz_mecha": {
        "name": "Robot Chiến Binh",
        "emoji": "🤖",
        "color": "#6ff2ff",
        "weapon": {
            "kind": "gun",
            "range": 11,
            "cd": 0.22,
            "shot": "rainbow"
        },
        "skills": [
            {
                "name": "Chế Độ Xe Tăng",
                "icon": "🚜",
                "cd": 12
            },
            {
                "name": "Tháp Pháo",
                "icon": "🗼",
                "cd": 14
            },
            {
                "name": "Tên Lửa Tầm Nhiệt",
                "icon": "🚀",
                "cd": 7
            },
            {
                "name": "Khiên Năng Lượng",
                "icon": "🔰",
                "cd": 16
            }
        ]
    },
    "dz_dino": {
        "name": "Khủng Long Bạo Chúa",
        "emoji": "🦖",
        "color": "#5fbf5a",
        "weapon": {
            "kind": "sword",
            "range": 2.4,
            "cd": 0.55,
            "arc": 0.4,
            "fx": "#ffffff"
        },
        "skills": [
            {
                "name": "Nuốt Chửng",
                "icon": "😋",
                "cd": 9
            },
            {
                "name": "Quẫy Đuôi",
                "icon": "🌪️",
                "cd": 5
            },
            {
                "name": "Gầm Kinh Hoàng",
                "icon": "📢",
                "cd": 12
            },
            {
                "name": "Hoá Khổng Lồ",
                "icon": "🦕",
                "cd": 18
            }
        ]
    },
    "dz_fairy": {
        "name": "Tiên Hoa",
        "emoji": "🧚",
        "color": "#ff9ec8",
        "weapon": {
            "kind": "gun",
            "range": 10,
            "cd": 0.42,
            "shot": "bubble"
        },
        "skills": [
            {
                "name": "Vòng Hoa Hồi Sinh",
                "icon": "💖",
                "cd": 12
            },
            {
                "name": "Bay Lơ Lửng",
                "icon": "🦋",
                "cd": 10
            },
            {
                "name": "Mê Hoặc",
                "icon": "💘",
                "cd": 14
            },
            {
                "name": "Cây Thần Trói Buộc",
                "icon": "🌳",
                "cd": 14
            }
        ]
    },
    "dz_pirate": {
        "name": "Thuyền Trưởng Hải Tặc",
        "emoji": "🏴‍☠️",
        "color": "#ffc93c",
        "weapon": {
            "kind": "gun",
            "range": 8,
            "cd": 0.6,
            "shot": "spike",
            "spread": 3
        },
        "skills": [
            {
                "name": "Đặt Đại Bác",
                "icon": "💣",
                "cd": 12
            },
            {
                "name": "Móc Câu",
                "icon": "🪝",
                "cd": 6
            },
            {
                "name": "Vẹt Trinh Sát",
                "icon": "🦜",
                "cd": 10
            },
            {
                "name": "Tàu Bắn Phá",
                "icon": "🏴‍☠️",
                "cd": 14
            }
        ]
    },
    "dz_vampire": {
        "name": "Bá Tước Ma Cà Rồng",
        "emoji": "🧛",
        "color": "#b0203a",
        "weapon": {
            "kind": "sword",
            "range": 2.3,
            "cd": 0.45,
            "arc": 0.3,
            "fx": "#b0203a"
        },
        "lifesteal": 0.1,
        "skills": [
            {
                "name": "Tia Hút Máu",
                "icon": "🩸",
                "cd": 7
            },
            {
                "name": "Hoá Dơi",
                "icon": "🦇",
                "cd": 9
            },
            {
                "name": "Bầy Dơi Quây",
                "icon": "🌑",
                "cd": 12
            },
            {
                "name": "Đêm Trăng Máu",
                "icon": "🌕",
                "cd": 15
            }
        ]
    },
    "dz_snowman": {
        "name": "Người Tuyết Vui Vẻ",
        "emoji": "⛄",
        "color": "#9fe8ff",
        "weapon": {
            "kind": "gun",
            "range": 10,
            "cd": 0.4,
            "shot": "ice"
        },
        "skills": [
            {
                "name": "Cầu Tuyết Lăn",
                "icon": "⚪",
                "cd": 7
            },
            {
                "name": "Người Tuyết Mồi",
                "icon": "⛄",
                "cd": 12
            },
            {
                "name": "Sàn Băng",
                "icon": "🧊",
                "cd": 12
            },
            {
                "name": "Kỷ Băng Hà",
                "icon": "❄️",
                "cd": 16
            }
        ]
    }
};
const FISH_WEIGHTS_RAW: Record<string, [
    string,
    number
][]> = {
    "home": [
        [
            "fish_perch",
            50
        ],
        [
            "fish_clown",
            28
        ],
        [
            "fish_puffer",
            8
        ],
        [
            "fish_koi",
            6
        ],
        [
            "fish_golden",
            0.3
        ],
        [
            "boot",
            7
        ]
    ],
    "lake": [
        [
            "fish_perch",
            26
        ],
        [
            "fish_clown",
            24
        ],
        [
            "fish_puffer",
            16
        ],
        [
            "fish_carp",
            14
        ],
        [
            "fish_catfish",
            14
        ],
        [
            "fish_swordfish",
            4
        ],
        [
            "fish_rainbow",
            3
        ],
        [
            "fish_whale",
            0.8
        ],
        [
            "fish_golden",
            0.4
        ],
        [
            "boot",
            6
        ]
    ],
    "swamp": [
        [
            "fish_perch",
            14
        ],
        [
            "fish_puffer",
            20
        ],
        [
            "fish_carp",
            24
        ],
        [
            "fish_catfish",
            16
        ],
        [
            "fish_shark",
            14
        ],
        [
            "fish_eel",
            6
        ],
        [
            "fish_rainbow",
            5
        ],
        [
            "fish_kraken",
            0.8
        ],
        [
            "fish_golden",
            0.4
        ],
        [
            "boot",
            6
        ]
    ],
    "candy": [
        [
            "fish_clown",
            26
        ],
        [
            "fish_puffer",
            20
        ],
        [
            "fish_jelly",
            22
        ],
        [
            "fish_carp",
            16
        ],
        [
            "fish_rainbow",
            12
        ],
        [
            "fish_golden",
            0.8
        ],
        [
            "boot",
            5
        ]
    ],
    "toy": [
        [
            "fish_clown",
            30
        ],
        [
            "fish_puffer",
            22
        ],
        [
            "fish_jelly",
            16
        ],
        [
            "fish_koi",
            6
        ],
        [
            "fish_golden",
            0.5
        ],
        [
            "boot",
            14
        ]
    ],
    "jungle": [
        [
            "fish_catfish",
            26
        ],
        [
            "fish_carp",
            20
        ],
        [
            "fish_eel",
            12
        ],
        [
            "fish_puffer",
            14
        ],
        [
            "fish_kraken",
            0.8
        ],
        [
            "fish_golden",
            0.5
        ],
        [
            "boot",
            6
        ]
    ],
    "ocean": [
        [
            "fish_clown",
            16
        ],
        [
            "fish_sunfish",
            18
        ],
        [
            "fish_swordfish",
            12
        ],
        [
            "fish_shark",
            16
        ],
        [
            "fish_angler",
            8
        ],
        [
            "fish_manta",
            1.2
        ],
        [
            "fish_whale",
            1.2
        ],
        [
            "fish_golden",
            0.6
        ],
        [
            "boot",
            4
        ]
    ],
    "dark": [
        [
            "fish_angler",
            26
        ],
        [
            "fish_eel",
            20
        ],
        [
            "fish_jelly",
            16
        ],
        [
            "fish_kraken",
            1.2
        ],
        [
            "fish_golden",
            0.6
        ],
        [
            "boot",
            6
        ]
    ],
    "ice": [
        [
            "fish_perch",
            14
        ],
        [
            "fish_carp",
            24
        ],
        [
            "fish_icepike",
            20
        ],
        [
            "fish_shark",
            26
        ],
        [
            "fish_rainbow",
            8
        ],
        [
            "fish_whale",
            1.2
        ],
        [
            "fish_golden",
            0.5
        ],
        [
            "boot",
            5
        ]
    ]
};
export const SPECIALS: Record<string, {
    name: string;
    cd: number;
}> = { "fist": { "name": "Liên Hoàn Quyền", "cd": 6 }, "crescent": { "name": "Chém Trăng Khuyết", "cd": 6 }, "gore": { "name": "Húc Nanh", "cd": 7 }, "wave": { "name": "Kiếm Khí", "cd": 6 }, "peastorm": { "name": "Mưa Đậu", "cd": 8 }, "bigbubble": { "name": "Bong Bóng Nhốt", "cd": 10 }, "nova": { "name": "Bão Gai", "cd": 9 }, "blizzard": { "name": "Bão Tuyết", "cd": 9 }, "magma": { "name": "Cột Dung Nham", "cd": 8 }, "thunder": { "name": "Sấm Sét Trời Giáng", "cd": 9 }, "bonk": { "name": "Búa Nện Chít Chít", "cd": 7 }, "tsunami": { "name": "Sóng Thần", "cd": 9 }, "whirl": { "name": "Lốc Trăng", "cd": 8 }, "starfall": { "name": "Mưa Sao Băng", "cd": 9 }, "inferno": { "name": "Vòng Hoả Ngục", "cd": 9 }, "laser": { "name": "Tia Cầu Vồng", "cd": 8 } };
export const LOOT_TABLES: Record<string, [
    string,
    number,
    number,
    number
][]> = { "mushroom": [["manure", 0.4, 1, 2], ["spore", 0.05, 1, 1], ["meat", 0.1, 1, 1]], "boar": [["meat", 0.6, 1, 2], ["leather", 0.45, 1, 2], ["bone", 0.25, 1, 1], ["manure", 0.3, 1, 2], ["tusk", 0.09, 1, 1]], "wolf": [["meat", 0.5, 1, 1], ["leather", 0.5, 1, 2], ["bone", 0.35, 1, 2], ["claw", 0.1, 1, 1]], "chomper": [["sap", 0.55, 1, 2], ["manure", 0.35, 1, 3], ["nectar", 0.1, 1, 1], ["spore", 0.04, 1, 1]], "cactus": [["spine", 0.6, 1, 3], ["cwater", 0.3, 1, 1], ["bloom", 0.08, 1, 1]], "bear": [["meat", 1, 2, 4], ["leather", 1, 2, 3], ["bone", 1, 2, 3], ["honey", 0.6, 1, 2], ["hat_bear", 0.25, 1, 1], ["crown", 0.12, 1, 1], ["starshard", 0.3, 1, 1]], "jelly": [["sugar", 0.5, 1, 2], ["manure", 0.25, 1, 2], ["spore", 0.04, 1, 1]], "gummy": [["sugar", 0.5, 1, 2], ["leather", 0.3, 1, 1], ["bone", 0.2, 1, 1]], "lollipop": [["sugar", 0.7, 1, 3], ["starshard", 0.03, 1, 1]], "cake": [["seed_star", 0.3, 1, 1], ["sugar", 1, 3, 5], ["honey", 0.6, 1, 2], ["starshard", 0.7, 1, 2]], "snowball": [["icecrystal", 0.5, 1, 1], ["manure", 0.2, 1, 1], ["seed_ice", 0.04, 1, 1]], "penguin": [["icecrystal", 0.4, 1, 2], ["meat", 0.5, 1, 1], ["leather", 0.3, 1, 1], ["seed_ice", 0.05, 1, 1]], "icebloom": [["icecrystal", 0.6, 1, 2], ["sap", 0.3, 1, 1], ["nectar", 0.08, 1, 1]], "yeti": [["seed_ice", 0.7, 1, 2], ["icecrystal", 1, 3, 5], ["leather", 1, 2, 3], ["bone", 1, 2, 3], ["starshard", 0.8, 1, 2], ["hat_bear", 0.2, 1, 1]], "magmaslime": [["magma", 0.3, 1, 1], ["mcrystal", 0.3, 1, 1], ["seed_fire", 0.04, 1, 1]], "minislime": [["mcrystal", 0.12, 1, 1], ["seed_fire", 0.02, 1, 1]], "toysoldier": [["gear", 0.55, 1, 2], ["battery", 0.03, 1, 1]], "windmouse": [["gear", 0.6, 1, 2], ["bone", 0.2, 1, 1]], "jackbox": [["gear", 0.4, 1, 1], ["sugar", 0.3, 1, 1], ["battery", 0.04, 1, 1]], "robot": [["dz_mecha", 0.08, 1, 1], ["battery", 1, 2, 3], ["gear", 1, 4, 6], ["deco_traincar", 0.3, 1, 1], ["starshard", 0.5, 1, 1], ["seed_star", 0.3, 1, 1]], "monkey": [["vine", 0.4, 1, 2], ["meat", 0.3, 1, 1], ["amber", 0.03, 1, 1]], "snake": [["leather", 0.5, 1, 2], ["vine", 0.3, 1, 1], ["nectar", 0.08, 1, 1]], "chameleon": [["leather", 0.5, 1, 2], ["amber", 0.06, 1, 1], ["claw", 0.08, 1, 1]], "flytrap": [["vine", 0.6, 1, 2], ["sap", 0.4, 1, 2], ["spore", 0.06, 1, 1]], "gorilla": [["dz_dino", 0.08, 1, 1], ["amber", 1, 2, 3], ["vine", 1, 4, 6], ["deco_fruittree", 0.3, 1, 1], ["honey", 0.7, 1, 2], ["starshard", 0.6, 1, 1]], "jellyzap": [["coral", 0.4, 1, 1], ["pearl", 0.03, 1, 1]], "hammershark": [["meat", 0.6, 1, 2], ["bone", 0.4, 1, 2], ["coral", 0.3, 1, 1]], "urchin": [["spine", 0.6, 1, 3], ["coral", 0.4, 1, 1]], "leviathan": [["dz_pirate", 0.08, 1, 1], ["pearl", 1, 2, 4], ["coral", 1, 4, 6], ["deco_piratechest", 0.3, 1, 1], ["starshard", 0.8, 1, 2]], "cloudsheep": [["feather", 0.5, 1, 2], ["leather", 0.2, 1, 1]], "thunderbird": [["feather", 0.6, 1, 2], ["thunderstone", 0.04, 1, 1]], "windspirit": [["feather", 0.4, 1, 1], ["icecrystal", 0.3, 1, 1]], "phoenix": [["dz_superhero", 0.06, 1, 1], ["thunderstone", 1, 2, 3], ["feather", 1, 4, 6], ["deco_rainbow", 0.3, 1, 1], ["starshard", 1, 1, 2], ["seed_star", 0.4, 1, 1]], "wisp": [["shadow", 0.5, 1, 1], ["fcrystal", 0.15, 1, 1]], "spider": [["shadow", 0.5, 1, 2], ["leather", 0.3, 1, 1], ["moonstone", 0.03, 1, 1]], "demoneye": [["shadow", 0.6, 1, 2], ["moonstone", 0.04, 1, 1]], "shadowlord": [["dz_vampire", 0.08, 1, 1], ["moonstone", 1, 2, 3], ["shadow", 1, 4, 6], ["deco_owlstatue", 0.3, 1, 1], ["starshard", 1, 2, 3], ["seed_star", 0.5, 1, 1]], "mushking": [["spore", 1, 2, 4], ["manure", 1, 3, 6], ["seed_star", 0.4, 1, 1], ["starshard", 0.4, 1, 1], ["honey", 0.5, 1, 2]], "jellyqueen": [["sugar", 1, 4, 6], ["seed_star", 0.5, 1, 1], ["starshard", 0.8, 1, 2], ["honey", 0.6, 1, 2]], "frostowl": [["icecrystal", 1, 3, 5], ["seed_ice", 1, 1, 2], ["seed_star", 0.4, 1, 1], ["starshard", 0.9, 1, 2]], "magmaturtle": [["obsidian", 0.55, 1, 2], ["mcrystal", 0.4, 1, 2], ["firecore", 0.12, 1, 1]], "lavaworm": [["mcrystal", 0.55, 1, 2], ["meat", 0.4, 1, 1], ["firecore", 0.1, 1, 1]], "firelizard": [["magma", 0.4, 1, 1], ["leather", 0.5, 1, 2], ["bone", 0.3, 1, 1], ["claw", 0.08, 1, 1]], "volcano": [["magma", 0.6, 1, 2], ["bloom", 0.06, 1, 1]], "golem": [["seed_fire", 0.8, 1, 2], ["magma", 1, 3, 5], ["firecore", 1, 1, 2], ["obsidian", 1, 3, 5], ["starshard", 1, 1, 2], ["deco_statue", 0.25, 1, 1], ["crown", 0.1, 1, 1]], "bee": [["honey", 0.12, 1, 1], ["nectar", 0.05, 1, 1], ["manure", 0.2, 1, 1]], "frog": [["meat", 0.4, 1, 1], ["nectar", 0.1, 1, 1], ["manure", 0.3, 1, 2]], "crab": [["meat", 0.5, 1, 2], ["bone", 0.4, 1, 2], ["spine", 0.3, 1, 2]], "treant": [["sap", 1, 3, 5], ["spore", 0.8, 1, 2], ["manure", 1, 3, 6], ["starshard", 0.25, 1, 1]], "croc": [["leather", 1, 3, 5], ["bone", 1, 2, 4], ["tusk", 0.6, 1, 2], ["crown", 0.1, 1, 1], ["starshard", 0.3, 1, 1]], "bunny": [["sugar", 0.5, 1, 2], ["leather", 0.2, 1, 1]], "chocobeetle": [["sugar", 0.6, 1, 2], ["bone", 0.3, 1, 1]], "gingerbread": [["sugar", 1, 4, 6], ["honey", 0.6, 1, 2], ["starshard", 0.8, 1, 2]], "seal": [["meat", 0.6, 1, 2], ["leather", 0.5, 1, 2], ["icecrystal", 0.3, 1, 1]], "owl": [["icecrystal", 0.4, 1, 1], ["bone", 0.2, 1, 1]], "mammoth": [["leather", 1, 4, 6], ["tusk", 1, 2, 3], ["icecrystal", 1, 2, 4], ["starshard", 0.9, 1, 2]], "firebat": [["mcrystal", 0.25, 1, 1], ["leather", 0.25, 1, 1]], "magmacrab": [["magma", 0.5, 1, 2], ["bone", 0.4, 1, 2]], "dragon": [["dragonscale", 1, 2, 4], ["firecore", 1, 2, 3], ["dragonegg", 0.5, 1, 1], ["starshard", 1, 2, 3], ["deco_trophy", 0.35, 1, 1], ["crown", 0.15, 1, 1]] };
export const COLLECTIONS: Record<string, {
    name: string;
    emoji: string;
    items: string[];
}> = { "toy": { "name": "Hành Tinh Đồ Chơi", "emoji": "🧸", "items": ["deco_teddy", "deco_musicbox", "deco_traincar", "toy_hammer", "pet_robot", "battery"] }, "jungle": { "name": "Rừng Rậm Nguyên Sinh", "emoji": "🌿", "items": ["deco_totem", "deco_rafflesia", "deco_fruittree", "armor_leaf", "pet_parrot", "amber"] }, "ocean": { "name": "Hành Tinh Đại Dương", "emoji": "🌊", "items": ["deco_aquarium", "deco_shell", "deco_piratechest", "trident", "pet_turtle", "pearl", "fish_manta"] }, "sky": { "name": "Quần Đảo Mây Trời", "emoji": "☁️", "items": ["deco_cloudsofa", "deco_windchime", "deco_rainbow", "armor_cloud", "pet_sheep", "thunderstone"] }, "dark": { "name": "Tinh Cầu Bóng Đêm", "emoji": "🌑", "items": ["deco_ghostlantern", "deco_nightcrystal", "deco_owlstatue", "hat_lantern", "pet_firefly", "moonstone"] }, "lava": { "name": "Hành Tinh Dung Nham", "emoji": "🌋", "items": ["deco_volcano", "deco_lamp", "deco_table", "deco_statue", "deco_nest", "deco_trophy", "dragonegg", "pet_dragon", "boots_lava", "armor_wings", "sword_obsidian"] } };
export const CROP_TIMER_VERSION = 3;
/** These baseline definitions are scaled once on module load, never on saved inventory or EXP. */
export const LEGACY_CROP_IDS = Object.freeze(Object.keys(CROP_FACTS));
for (const id of LEGACY_CROP_IDS) { const crop = CROP_FACTS[id]; crop.heal ??= 8 + crop.energy; crop.time *= 10; crop.exp *= 3; crop.energy *= 3; }
const FRUIT_FACTS: Record<string, any> = {
  apple: { name: 'Magic Red Apple', lvl: 3, time: 8 * 3600, exp: 400, energy: 600, heal: 120 },
  grape: { name: 'Juicy Purple Grapes', lvl: 5, time: 8 * 3600, exp: 450, energy: 700, buff: { regen: 4, time: 180 } },
  mango: { name: 'Golden Mango', lvl: 7, time: 8 * 3600, exp: 500, energy: 800, buff: { speed: .25, time: 180 } },
  pineapple: { name: 'Crown Pineapple', lvl: 9, time: 12 * 3600, exp: 750, energy: 1200, buff: { atk: .25, time: 180 } },
  coconut: { name: 'Refreshing Coconut', lvl: 11, time: 12 * 3600, exp: 800, energy: 1300, heal: 400, buff: { fireres: .5, time: 180 } },
  durian: { name: 'Spiky Durian', lvl: 14, time: 12 * 3600, exp: 950, energy: 1500, buff: { def: 25, time: 180 } },
  lychee: { name: 'Ruby Lychee', lvl: 16, time: 14 * 3600, exp: 1100, energy: 1800, buff: { crit: .15, haste: .2, time: 180 } },
  peach: { name: 'Immortal Peach', lvl: 18, time: 14 * 3600, exp: 1400, energy: 2200, heal: 9999, buff: { atk: .2, def: 15, regen: 5, xp: .5, time: 300 } },
};
Object.assign(CROP_FACTS, FRUIT_FACTS);
const cropIcons: Record<string, string> = { apple: '🍎', grape: '🍇', mango: '🥭', pineapple: '🍍', coconut: '🥥', durian: '🌳', lychee: '🔴', peach: '🍑', radish: '🌱', carrot: '🥕', pumpkin: '🎃', mint: '🌿', chili: '🌶️', candy: '🍭', bean: '🫘', star: '⭐', berry: '🍓', coffee: '☕', moonflower: '🌼', magnetmelon: '🧲', melon: '🍉', clover: '🍀', glowshroom: '🍄', iceberry: '🫐', goldcorn: '🌽', dragonfruit: '🐉', rainbowrose: '🌹' };
const typeIcons: Record<string, string> = { material: '💎', food: '🍲', farm: '🌿', bait: '🪱', fish: '🐟', junk: '🥾', weapon: '⚔️', hat: '🎩', armor: '🧥', feet: '👟', pet: '🐾', decor: '🏡', placeable: '🌱', disguise: '🎭' };
const slots: Record<string, GearSlot> = { weapon: 'weapon', hat: 'hat', armor: 'outfit', feet: 'boots', pet: 'pet', disguise: 'disguise' };
export const CROPS: Record<CropId, CropDef> = {};
export const ITEMS: Record<ItemId, ItemDef> = {};
for (const [id, fact] of Object.entries(CROP_FACTS)) {
    CROPS[id] = { name: fact.name, icon: cropIcons[id], duration: fact.time * 1000, xp: fact.exp, level: fact.lvl, seed: fact.seed, buff: fact.buff };
    ITEMS[id] = { name: fact.name, icon: cropIcons[id], type: 'crop', sell: fact.energy, heal: fact.heal ?? 8 + fact.energy, buff: fact.buff, desc: `Grows in ${fact.time}s. Harvest: ${fact.exp} XP. Sell: ${fact.energy} energy.` };
}
for (const [id, fact] of Object.entries(ITEM_FACTS)) {
    const icon = id.startsWith('seed_') ? '🌰' : id.startsWith('gun_') ? '🔫' : id.startsWith('rod') ? '🎣' : typeIcons[fact.type] || '✨';
    const stats = fact.stats || {};
    const effects = [stats.atk ? `+${stats.atk} attack` : null, stats.def ? `+${stats.def} defense` : null, stats.hp ? `+${stats.hp} health` : null, stats.speed ? `+${Math.round(stats.speed * 100)}% speed` : null, fact.heal ? `Restores ${fact.heal >= 9999 ? 'full' : fact.heal} health` : null, fact.buff ? `Temporary effects for ${fact.buff.time}s` : null].filter(Boolean);
    ITEMS[id] = { ...fact, icon, slot: slots[fact.type], attack: stats.atk, defense: stats.def, desc: effects.join(' · ') || `${fact.name}. ${fact.type === 'decor' ? 'Place in your home garden.' : 'Sell or use in crafting.'}` };
}
// The first evaluation had a wood material and a bunny companion. Keep both
// usable rather than deleting possessions when upgrading an existing save.
ITEMS.wood = { name: 'Wild wood', icon: '🪵', type: 'material', sell: 5, desc: 'A keepsake material from the first garden. Can still be sold.' };
ITEMS.bunny = { name: 'Mochi bunny', icon: '🐰', type: 'pet', slot: 'pet', sell: 0, stats: { atk: 3 }, attack: 3, pet: { scale: .5, dmg: .25, cd: 1.5 }, desc: 'Your original companion stays with you.' };
export const LEGACY_ITEMS: Record<string, string> = { turnip: 'radish', fertilizer: 'spore', fish: 'fish_perch', goldenfish: 'fish_koi', sword: 'sword_wood', blaster: 'gun_bubble', hat: 'hat_straw', outfit: 'armor_leather', boots: 'boots_cloud', firesword: 'sword_lava', fireboots: 'boots_lava', dragon: 'pet_dragon', crystal: 'starshard', ember: 'magma' };
export function canonicalItem(id: string) { return Object.hasOwn(LEGACY_ITEMS, id) ? LEGACY_ITEMS[id] : id; }
export const SHOP_CATEGORIES = SHOP_FACTS;
export const WORKSHOP_CATEGORIES = CRAFT_FACTS;
export const RECIPES: Recipe[] = [];
for (const [station, categories] of [['shop', SHOP_FACTS], ['craft', CRAFT_FACTS]] as const) {
    for (const category of categories)
        for (const entry of category.items) {
            const recipe: Recipe = { result: entry.id, energy: entry.cost, materials: entry.mats || {}, category: category.tab, station, count: (entry as any).n || 1 };
            RECIPES.push(recipe);
            if (station === 'shop' && ITEMS[entry.id]) {
                ITEMS[entry.id].price = entry.cost;
                ITEMS[entry.id].materials = entry.mats || {};
            }
        }
}
RECIPES.push({ result: 'obsidian', energy: 0, materials: { mcrystal: 3 }, category: 'Ancient furnace', station: 'forge' }, { result: 'firecore', energy: 0, materials: { obsidian: 3, mcrystal: 2 }, category: 'Ancient furnace', station: 'forge' });
for (const [id, base] of Object.entries({ ...ITEMS })) {
    if (!['crop', 'fish'].includes(base.type) && id !== 'meat')
        continue;
    const buff = base.buff ? { ...base.buff, time: base.buff.time * 2 } : undefined;
    if (buff)
        for (const key of Object.keys(buff) as (keyof BuffDef)[])
            if (!['time', 'light', 'magnet'].includes(key))
                buff[key] = (buff[key] || 0) * 1.35;
    ITEMS[`cooked_${id}`] = { ...base, name: `${base.name} · Nướng`, icon: '🔥', type: 'food', slot: undefined, price: undefined, base: id, cooked: true, sell: Math.round(base.sell * 2.2) + 2, heal: base.heal! >= 9999 ? 9999 : (base.heal || 15) * 2, buff, desc: 'Cooked at the garden volcano. Stronger healing and longer effects.' };
}
export const DISGUISES: Record<string, {
    name: string;
    emoji: string;
    color: string;
    weapon: WeaponDef;
    lifesteal?: number;
    skills: {
        name: string;
        icon: string;
        cd: number;
    }[];
}> = DISGUISE_FACTS;
const sourcePlanet = (id: string) => id === 'sky' ? 'cloud' : id === 'dark' ? 'shadow' : id;
export const PLANETS = {} as Record<PlanetId, PlanetDef>;
const basicEnemy: Record<string, [
    string,
    number,
    number,
    number
]> = { home: ['mushroom', 45, 6, 8], candy: ['jelly', 60, 8, 12], ice: ['snowball', 70, 9, 16], lava: ['magmaslime', 80, 11, 20], toy: ['toysoldier', 70, 9, 16], jungle: ['monkey', 110, 13, 24], ocean: ['jellyzap', 110, 14, 28], cloud: ['cloudsheep', 140, 16, 34], shadow: ['wisp', 130, 18, 40] };
for (const [raw, fact] of Object.entries(PLANET_FACTS)) {
    const id = sourcePlanet(raw) as PlanetId, [enemy, health, attack, xp] = basicEnemy[id];
    PLANETS[id] = { name: fact.name, icon: fact.emoji, level: fact.lvl, color: fact.ground?.[0] || fact.grad[0], sky: fact.sky, grad: fact.grad, ground: fact.ground || ['#86d25a', '#9be36f', '#e8cf92'], description: `${fact.name} · Landing from level ${fact.lvl}.`, enemy, health, attack, xp, bosses: fact.bosses || ['bear', 'treant', 'croc', 'mushking'], spawns: fact.spawns || [['mushroom', 20], ['boar', 12], ['bee', 6], ['wolf', 10], ['chomper', 14], ['cactus', 14]] };
}
export const FISH_WEIGHTS: Record<string, [
    string,
    number
][]> = FISH_WEIGHTS_RAW;
FISH_WEIGHTS.shadow = FISH_WEIGHTS_RAW.dark;
export interface FishDef {
    id: string;
    name: string;
    icon: string;
    rarity: 'common' | 'rare' | 'legendary' | 'junk';
    speed: number;
    power: number;
    stamina: number;
    sell: number;
    xp: number;
    size: number[];
    planet: string[];
}
export const FISH: Record<string, FishDef> = {};
for (const [id, item] of Object.entries(ITEMS))
    if (item.type === 'fish' || id === 'boot') {
        const power = item.power || .15;
        FISH[id] = { id, name: item.name, icon: item.icon, rarity: item.legend ? 'legendary' : item.rare ? 'rare' : id === 'boot' ? 'junk' : 'common', speed: power, power, stamina: power, sell: item.sell, xp: Math.round((4 + power * 25) * (item.legend ? 4 : 1)), size: item.size || [10, 60], planet: Object.entries(FISH_WEIGHTS).filter(([, items]) => items.some(([key]) => key === id)).map(([key]) => key) };
    }
/** The garden holds at most 24 beds (a 6 x 4 grid): the 9 starting beds and 15 more. Saves made before the cap had 33 (LEGACY_MAX_PLOTS). */
export const STARTING_PLOTS = 9, MAX_EXTRA_PLOTS = 15, MAX_DECORATIONS = 40, LEGACY_MAX_PLOTS = 33;
export const UPGRADES = { health: { name: 'Health', icon: '❤️', base: 12, step: 25 }, attack: { name: 'Attack', icon: '👊', base: 15, step: 3 }, defense: { name: 'Defense', icon: '🛡️', base: 14, step: 4 }, crit: { name: 'Critical chance', icon: '💥', base: 18, step: .025, max: 28 } } as const;
export const STORY_STEPS: {
    title: string;
    event?: string;
    condition?: string;
    target: number;
    chapter: number;
    icon: string;
    end?: Inventory;
}[] = [
    { title: 'Harvest three crops', event: 'harvest', target: 3, chapter: 0, icon: '🌾' },
    { title: 'Earn 20 energy at the market', event: 'sell', target: 20, chapter: 0, icon: '🧺' },
    { title: 'Buy or craft one item', event: 'craft', target: 1, chapter: 0, icon: '🗡️' },
    { title: 'Equip a weapon', condition: 'equipped', target: 1, chapter: 0, icon: '✋' },
    { title: 'Defeat five creatures', event: 'kill', target: 5, chapter: 0, icon: '⚔️' },
    { title: 'Buy a crystal upgrade', event: 'upgrade', target: 1, chapter: 0, icon: '💎' },
    { title: 'Catch two fish', event: 'fish', target: 2, chapter: 0, icon: '🎣' },
    { title: 'Use ten skills', event: 'skill', target: 10, chapter: 0, icon: '🌀' },
    { title: 'Reach level 5', condition: 'level', target: 5, chapter: 0, icon: '⭐', end: { seed_star: 1, spore: 2, plot_kit: 1 } },
    { title: 'Defeat 25 creatures', event: 'kill', target: 25, chapter: 1, icon: '⚔️' },
    { title: 'Place another garden bed', condition: 'plots', target: 1, chapter: 1, icon: '🌱' },
    { title: 'Cook three meals', event: 'cook', target: 3, chapter: 1, icon: '🔥' },
    { title: 'Defeat a boss', event: 'boss', target: 1, chapter: 1, icon: '👑' },
    { title: 'Catch a rare fish', event: 'fishrare', target: 1, chapter: 1, icon: '🐠' },
    { title: 'Reach level 8', condition: 'level', target: 8, chapter: 1, icon: '⭐', end: { seed_fire: 2, seed_ice: 2, claw: 2 } },
    { title: 'Visit another planet', event: 'planet', target: 1, chapter: 2, icon: '🚀' },
    { title: 'Mine five deposits', event: 'mine', target: 5, chapter: 2, icon: '⛏️' },
    { title: 'Discover three planets', condition: 'visited', target: 3, chapter: 2, icon: '🔭' },
    { title: 'Craft or buy three items', event: 'craft', target: 3, chapter: 2, icon: '🔨' },
    { title: 'Place two decorations', condition: 'decor', target: 2, chapter: 2, icon: '🏡' },
    { title: 'Reach level 12', condition: 'level', target: 12, chapter: 2, icon: '⭐', end: { starshard: 2, seed_star: 2, spore: 3 } },
    { title: 'Defeat three bosses', event: 'boss', target: 3, chapter: 3, icon: '👑' },
    { title: 'Discover five planets', condition: 'visited', target: 5, chapter: 3, icon: '🔭' },
    { title: 'Equip a disguise', condition: 'disguise', target: 1, chapter: 3, icon: '🎭' },
    { title: 'Defeat 150 creatures', event: 'kill', target: 150, chapter: 3, icon: '⚔️' },
    { title: 'Reach level 18', condition: 'level', target: 18, chapter: 3, icon: '⭐' },
    { title: 'Discover every planet', condition: 'visited', target: 9, chapter: 3, icon: '🔭' },
    { title: 'Defeat ten bosses', event: 'boss', target: 10, chapter: 3, icon: '👑' },
    { title: 'Reach level 25', condition: 'level', target: 25, chapter: 3, icon: '⭐', end: { starshard: 3, moonstone: 1, thunderstone: 2, seed_star: 3 } },
];
// Keep optional metadata absent when it has no value.
for (const item of Object.values(ITEMS))
    for (const key of Object.keys(item) as (keyof ItemDef)[])
        if (item[key] === undefined)
            delete item[key];
// Original English labels keep the interface consistent without changing IDs or balance.
const englishNames: Record<string, string> = {
    ...Object.fromEntries(Object.entries(FRUIT_FACTS).map(([id, fact]) => [id, fact.name])),
    radish: 'Radish', carrot: 'Carrot', pumpkin: 'Pumpkin', mint: 'Mint', chili: 'Chili', candy: 'Candy bloom', bean: 'Shield bean', star: 'Star fruit', berry: 'Berry', coffee: 'Coffee bean', moonflower: 'Moonflower', magnetmelon: 'Magnet melon', melon: 'Melon', clover: 'Lucky clover', glowshroom: 'Glow mushroom', iceberry: 'Ice berry', goldcorn: 'Golden corn', dragonfruit: 'Dragon fruit', rainbowrose: 'Rainbow rose',
    seed_fire: 'Fire seed', seed_ice: 'Ice seed', seed_star: 'Star seed', plot_kit: 'Garden bed kit', meat: 'Meat', leather: 'Leather', bone: 'Bone', manure: 'Fertilizer', spore: 'Magic spore', tusk: 'Tusk', claw: 'Claw', sap: 'Sap', nectar: 'Nectar', spine: 'Cactus spine', cwater: 'Cactus water', bloom: 'Wild flower', honey: 'Honey', sugar: 'Sugar', icecrystal: 'Ice crystal', magma: 'Magma', starshard: 'Star shard', mcrystal: 'Magma crystal', obsidian: 'Obsidian', firecore: 'Fire core', dragonscale: 'Dragon scale', fcrystal: 'Fire crystal', gear: 'Toy gear', battery: 'Battery', vine: 'Vine', amber: 'Amber', pearl: 'Pearl', coral: 'Coral', feather: 'Feather', thunderstone: 'Thunder stone', shadow: 'Shadow essence', moonstone: 'Moonstone', dragonegg: 'Dragon egg', potion: 'Healing potion', worm: 'Worm bait', boot: 'Old boot', rod: 'Fishing rod', rod_gold: 'Golden fishing rod', rod_steady: 'Steady fishing rod', crown: 'Royal crown', trident: 'Ocean trident', toy_hammer: 'Toy hammer', wood: 'Wild wood', bunny: 'Mochi bunny',
    fish_perch: 'Perch', fish_clown: 'Clownfish', fish_puffer: 'Pufferfish', fish_carp: 'Carp', fish_shark: 'Shark', fish_rainbow: 'Rainbow fish', fish_catfish: 'Catfish', fish_koi: 'Koi', fish_eel: 'Eel', fish_swordfish: 'Swordfish', fish_jelly: 'Jellyfish', fish_icepike: 'Ice pike', fish_whale: 'Whale', fish_kraken: 'Kraken', fish_golden: 'Golden fish', fish_sunfish: 'Sunfish', fish_angler: 'Anglerfish', fish_manta: 'Manta ray',
    armor_wings: 'Dragon wings', armor_tux: 'Tuxedo', armor_kimono: 'Kimono', armor_hawaii: 'Island shirt', armor_hoodie: 'Hoodie', hat_halo: 'Halo', hat_graduate: 'Graduation cap', boots_flipper: 'Swim flippers',
    dz_ninja: 'Shadow ninja', dz_mage: 'Archmage', dz_knight: 'Sun knight', dz_mecha: 'Battle robot', dz_dino: 'Tyrannosaur', dz_fairy: 'Flower fairy', dz_pirate: 'Pirate captain', dz_superhero: 'Superhero', dz_vampire: 'Vampire count', dz_snowman: 'Snowman',
    deco_volcano: 'Little volcano', deco_lamp: 'Lava lamp', deco_table: 'Obsidian table', deco_statue: 'Golem statue', deco_nest: 'Dragon nest', deco_trophy: 'Dragon trophy', deco_teddy: 'Giant teddy', deco_musicbox: 'Music box', deco_traincar: 'Toy train', deco_totem: 'Forest totem', deco_rafflesia: 'Giant forest flower', deco_fruittree: 'Fruit tree', deco_aquarium: 'Coral aquarium', deco_shell: 'Giant seashell', deco_piratechest: 'Pirate treasure', deco_cloudsofa: 'Cloud sofa', deco_windchime: 'Crystal wind chime', deco_rainbow: 'Rainbow arch', deco_ghostlantern: 'Ghost lantern', deco_nightcrystal: 'Night crystal', deco_owlstatue: 'Owl statue',
};
function itemLabel(id: string) {
    if (englishNames[id])
        return englishNames[id];
    const [kind, ...parts] = id.split('_');
    const material = parts.join(' '), type: Record<string, string> = { sword: 'sword', gun: 'blaster', hammer: 'hammer', scythe: 'scythe', bow: 'bow', staff: 'staff', blaster: 'blaster', hat: 'hat', armor: 'outfit', boots: 'boots', pet: 'companion' };
    const label = type[kind] ? `${material} ${type[kind]}` : id.replaceAll('_', ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
}
for (const [id, item] of Object.entries(ITEMS)) {
    const old = item.name;
    item.name = id.startsWith('cooked_') ? `Roasted ${itemLabel(id.slice(7)).toLowerCase()}` : itemLabel(id);
    if (item.desc.startsWith(old))
        item.desc = item.name + item.desc.slice(old.length);
    if (CROPS[id])
        CROPS[id].name = item.name;
    if (FISH[id])
        FISH[id].name = item.name;
}
// The garden items say what they do (the growing-bed panel shows these lines beside its Use buttons).
ITEMS.plot_kit.desc = 'One more garden bed for home. Place it from your backpack, or tap a garden bed and choose ➕ Expand garden.';
// Both fertilizers advance half the original timer, as requested for the updated game.
ITEMS.manure.desc = "Removes half of the crop's original growing time. Two uses ripen a newly planted crop.";
ITEMS.spore.desc = ITEMS.manure.desc;
const planetLabels: Record<PlanetId, string> = { home: 'Clover Village', candy: 'Candy Planet', ice: 'Frost Planet', lava: 'Volcano Planet', toy: 'Toybox Planet', jungle: 'Wild Jungle', ocean: 'Ocean Planet', cloud: 'Cloud Islands', shadow: 'Night Planet' };
for (const [id, planet] of Object.entries(PLANETS)) {
    planet.name = planetLabels[id as PlanetId];
    planet.description = `${planet.name} · Landing from level ${planet.level}.`;
}
const skillLabels: Record<string, string[]> = { dz_ninja: ['Shadow clones', 'Vanish', 'Shadow strike', 'Smoke bomb'], dz_mage: ['Great fireball', 'Blink', 'Sheep spell', 'Black hole'], dz_knight: ['Raise shield', 'Charge', 'Challenge', 'Holy blade'], dz_mecha: ['Tank mode', 'Turret', 'Homing missiles', 'Energy shield'], dz_dino: ['Devour', 'Tail sweep', 'Terrifying roar', 'Giant form'], dz_fairy: ['Healing flowers', 'Float', 'Charm', 'Binding tree'], dz_pirate: ['Cannon', 'Hook', 'Scout parrot', 'Broadside'], dz_superhero: ['Take flight', 'Meteor dive', 'Laser gaze', 'Boulder throw'], dz_vampire: ['Life drain', 'Bat form', 'Bat swarm', 'Blood moon'], dz_snowman: ['Rolling snowball', 'Snow decoy', 'Ice rink', 'Ice age'] };
for (const [id, disguise] of Object.entries(DISGUISES)) {
    disguise.name = ITEMS[id].name;
    disguise.skills.forEach((skill, i) => skill.name = skillLabels[id][i]);
}
for (const [id, collection] of Object.entries(COLLECTIONS))
    collection.name = planetLabels[sourcePlanet(id) as PlanetId];
const specialLabels: Record<string, string> = { fist: 'Rapid punches', crescent: 'Crescent slash', gore: 'Tusk charge', wave: 'Blade wave', peastorm: 'Pea storm', bigbubble: 'Bubble cage', nova: 'Spike storm', blizzard: 'Blizzard', magma: 'Magma pillar', thunder: 'Thunderstrike', bonk: 'Squeaky smash', tsunami: 'Tsunami', whirl: 'Moon cyclone', starfall: 'Starfall', inferno: 'Inferno ring', laser: 'Rainbow beam' };
for (const [id, special] of Object.entries(SPECIALS))
    special.name = specialLabels[id];
const categoryLabels = new Map<string, string>();
SHOP_CATEGORIES.forEach((category, i) => { const label = ['Weapons', 'Equipment', 'Fashion', 'Disguises', 'Supplies', 'Space gear', 'Legendary'][i]; categoryLabels.set(category.tab, label); category.tab = label; });
WORKSHOP_CATEGORIES.forEach((category, i) => { const label = ['Volcano equipment', 'Companions', 'Toybox and jungle', 'Ocean, cloud and night', 'Decorations'][i]; categoryLabels.set(category.tab, label); category.tab = label; });
for (const recipe of RECIPES)
    recipe.category = categoryLabels.get(recipe.category) || recipe.category;
// Explain how to use specialist equipment where a stat line alone is not enough.
ITEMS.rod.desc='Keep this rod in your backpack. It is held automatically near a pond; your combat weapon returns away from water. Hook at the bite, then balance reeling with line tension.';
ITEMS.rod_gold.desc='A stronger rod that makes difficult fish easier to land and improves rare catches.';
ITEMS.rod_steady.desc='A sturdy rod with a forgiving line: tension builds slowly and heavy fish feel lighter. It can still snap, so let go of Reel when the fish surges.';
const worldDescriptions:Record<PlanetId,string>={home:'Your garden and four trails: forest, meadow, swamp and canyon.',candy:'Sweet forests, springy surprises and powerful candy creatures.',ice:'Slippery ice, frozen ponds and snowbound bosses. Plan your stopping distance.',lava:'Eruptions, rising lava, meteors and a hidden cave furnace. Watch the warning circles.',toy:'Ride the moving trains and open surprise gifts among giant toys.',jungle:'Changing thorn walls, poisonous plants and restorative fruit.',ocean:'Swim between islands. Refill your air at bubbles or ride a sea turtle.',cloud:'Bounce between floating islands and watch the wind near their edges.',shadow:'Explore the darkness, light ancient pillars and face the Night Lord.'};
for(const id of Object.keys(PLANETS)as PlanetId[])PLANETS[id].description=worldDescriptions[id];

Object.assign(ITEMS, TITAN_ITEMS);
Object.assign(LOOT_TABLES, TITAN_LOOT);

// New recipes append after the reference catalog so saved/in-flight recipe indexes remain stable.
ITEMS.harpoon={name:'Hunting harpoon',icon:'🔱',desc:'A reusable throwing fork for hunting fish near ponds and large forest birds. +20 attack. No ammunition needed.',type:'weapon',slot:'weapon',sell:250,price:650,materials:{},attack:20,stats:{atk:20},weapon:{kind:'gun',range:11,cd:1.3,shot:'harpoon',special:'wave',fx:'#c9f0ec'}};
SHOP_CATEGORIES.find(category=>category.tab==='Weapons')!.items.push({id:'harpoon',cost:650});
RECIPES.push({result:'harpoon',energy:650,materials:{},category:'Weapons',station:'shop'});
LOOT_TABLES.forest_raptor=[['feather',1,1,2],['meat',.7,1,2]];
