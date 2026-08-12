/**
 * Stałe gry — rozmiary, limity, kolory, przepisy, drzewo badań, dane NPC i wrogów.
 * Wszystkie wartości są deterministyczne (poza world seed).
 */

/** Rozmiar kafelka w pikselach. */
export const TILE_SIZE = 32;
/** Rozmiar chunka w kafelkach (32×32). */
export const CHUNK_SIZE = 32;
/** Promień renderowania w chunkach. */
export const RENDER_DISTANCE = 4;
/** Maksymalna liczba cząsteczek (particles) na ekranie. */
export const MAX_PARTICLES = 300;
/** Maksymalna liczba NPC. */
export const NPC_MAX = 8;
/** Maksymalna liczba wrogów na mapie. */
export const ENEMY_MAX = 200;
/** Maksymalna liczba spawnerów wrogów. */
export const SPAWNER_MAX = 20;

/** Domyślny seed świata (używany gdy brak username). */
export const WORLD_SEED = 42;
/** Długość dnia w tickach (6000 ≈ 100s przy 60 ticków/s). */
export const DAY_LENGTH = 6000;

/** Kolory surowców i przedmiotów w ekwipunku i na mapie. */
export const RESOURCE_COLORS: Record<string, string> = {
  iron: '#8B7355',
  copper: '#B87333',
  coal: '#2C2C2C',
  stone: '#808080',
  wood: '#8B4513',
  oil: '#1a1a2e',
  water: '#4169E1',
  uranium: '#00FF00',
  iron_plate: '#c0c0c0',
  copper_plate: '#e8a060',
  steel_plate: '#a0a0b0',
  gear: '#888888',
  circuit: '#00cc44',
  advanced_circuit: '#0088cc',
  battery: '#ccaa00',
  plastic: '#c0c0d0',
  sulfuric_acid: '#cc8800',
  conveyor_belt: '#888888',
  inserter_item: '#ffcc00',
  miner_item: '#c0c0c0',
  furnace_item: '#ff6600',
  science_red: '#ff3333',
  science_green: '#33ff33',
  science_blue: '#3366ff',
  ammo: '#cc6600',
  wall_item: '#666666',
  turret_item: '#ff3333',
  petroleum_gas: '#88ccff',
  light_oil: '#aaddaa',
  heavy_oil: '#886644',
  solar_panel_item: '#2244aa',
  accumulator_item: '#aa8800',
  laser_turret_item: '#4444ff',
  flak_cannon_item: '#884444',
  tesla_coil_item: '#8844ff',
  mine_item: '#aa4400',
  roboport_item: '#2288aa',
  silo_item: '#666688',
  centrifuge_item: '#448844',
  artillery_item: '#666644',
  beacon_item: '#4444aa',
};

/** Kolory biomów używane przez renderer do wypełnienia tła chunka. */
export const BIOME_COLORS: Record<string, string> = {
  grass: '#36582e',
  desert: '#9e8054',
  snow: '#b0b4b8',
  forest: '#1c3c10',
  swamp: '#1e3420',
  volcanic: '#321208',
};

export const BUILDING_COLORS: Record<string, string> = {
  miner: '#5a5a50',
  furnace: '#3a1a0a',
  assembler: '#1a2a3a',
  conveyor: '#3a3830',
  inserter: '#4a3a10',
  storage: '#2a2218',
  power_pole: '#2a2a28',
  steam_engine: '#1a2030',
  boiler: '#2a1808',
  lab: '#081828',
  radar: '#182818',
  turret: '#281010',
  wall: '#3a3838',
  belt_junction: '#3a3830',
  splitter: '#404038',
  underground_belt: '#303028',
  pumpjack: '#1e1a10',
  refinery: '#182030',
  chemical_plant: '#18101e',
  pipe: '#1a1a1a',
  solar_panel: '#1a2a50',
  accumulator: '#3a3a10',
  laser_turret: '#182048',
  flak_cannon: '#282020',
  tesla_coil: '#201040',
  mine: '#3a2008',
  roboport: '#183040',
  pump: '#1a2030',
  silo: '#2a2a30',
  beacon: '#101830',
  centrifuge: '#203020',
  artillery: '#282018',
};

export const BUILDING_SIZES: Record<string, { w: number; h: number }> = {
  miner: { w: 2, h: 2 },
  furnace: { w: 2, h: 2 },
  assembler: { w: 3, h: 3 },
  conveyor: { w: 1, h: 1 },
  inserter: { w: 1, h: 1 },
  storage: { w: 2, h: 2 },
  power_pole: { w: 1, h: 1 },
  steam_engine: { w: 3, h: 2 },
  boiler: { w: 2, h: 2 },
  lab: { w: 3, h: 3 },
  radar: { w: 2, h: 2 },
  turret: { w: 2, h: 2 },
  wall: { w: 1, h: 1 },
  belt_junction: { w: 1, h: 1 },
  splitter: { w: 2, h: 1 },
  underground_belt: { w: 1, h: 1 },
  pumpjack: { w: 2, h: 2 },
  refinery: { w: 3, h: 3 },
  chemical_plant: { w: 2, h: 2 },
  pipe: { w: 1, h: 1 },
  solar_panel: { w: 2, h: 2 },
  accumulator: { w: 2, h: 2 },
  laser_turret: { w: 2, h: 2 },
  flak_cannon: { w: 2, h: 2 },
  tesla_coil: { w: 2, h: 2 },
  mine: { w: 1, h: 1 },
  roboport: { w: 3, h: 3 },
  pump: { w: 2, h: 2 },
  silo: { w: 4, h: 4 },
  beacon: { w: 3, h: 3 },
  centrifuge: { w: 3, h: 3 },
  artillery: { w: 3, h: 3 },
};

export const BUILDING_HEALTH: Record<string, number> = {
  miner: 300,
  furnace: 200,
  assembler: 250,
  conveyor: 100,
  inserter: 100,
  storage: 350,
  power_pole: 75,
  steam_engine: 300,
  boiler: 250,
  lab: 200,
  radar: 150,
  turret: 400,
  wall: 500,
  belt_junction: 100,
  splitter: 100,
  underground_belt: 100,
  pumpjack: 250,
  refinery: 300,
  chemical_plant: 200,
  pipe: 100,
  solar_panel: 150,
  accumulator: 200,
  laser_turret: 500,
  flak_cannon: 450,
  tesla_coil: 600,
  mine: 50,
  roboport: 400,
  pump: 150,
  silo: 800,
  beacon: 300,
  centrifuge: 400,
  artillery: 700,
};

export const RECIPES: Record<string, {
  id: string; name: string; inputs: { itemId: string; count: number }[];
  outputs: { itemId: string; count: number }[]; craftTime: number; energyCost: number; category: string;
}> = {
  iron_plate: { id: 'iron_plate', name: 'Iron Plate', inputs: [{ itemId: 'iron', count: 1 }], outputs: [{ itemId: 'iron_plate', count: 1 }], craftTime: 60, energyCost: 1, category: 'smelting' },
  copper_plate: { id: 'copper_plate', name: 'Copper Plate', inputs: [{ itemId: 'copper', count: 1 }], outputs: [{ itemId: 'copper_plate', count: 1 }], craftTime: 60, energyCost: 1, category: 'smelting' },
  steel_plate: { id: 'steel_plate', name: 'Steel Plate', inputs: [{ itemId: 'iron_plate', count: 5 }], outputs: [{ itemId: 'steel_plate', count: 1 }], craftTime: 300, energyCost: 2, category: 'smelting' },
  gear: { id: 'gear', name: 'Gear Wheel', inputs: [{ itemId: 'iron_plate', count: 2 }], outputs: [{ itemId: 'gear', count: 1 }], craftTime: 30, energyCost: 1, category: 'crafting' },
  circuit: { id: 'circuit', name: 'Electronic Circuit', inputs: [{ itemId: 'copper_plate', count: 3 }, { itemId: 'iron_plate', count: 1 }], outputs: [{ itemId: 'circuit', count: 1 }], craftTime: 60, energyCost: 1, category: 'crafting' },
  advanced_circuit: { id: 'advanced_circuit', name: 'Advanced Circuit', inputs: [{ itemId: 'circuit', count: 2 }, { itemId: 'copper_plate', count: 2 }, { itemId: 'plastic', count: 2 }], outputs: [{ itemId: 'advanced_circuit', count: 1 }], craftTime: 120, energyCost: 2, category: 'crafting' },
  battery: { id: 'battery', name: 'Battery', inputs: [{ itemId: 'copper_plate', count: 1 }, { itemId: 'iron_plate', count: 1 }, { itemId: 'sulfuric_acid', count: 2 }], outputs: [{ itemId: 'battery', count: 1 }], craftTime: 180, energyCost: 2, category: 'chemistry' },
  plastic: { id: 'plastic', name: 'Plastic Bar', inputs: [{ itemId: 'coal', count: 1 }, { itemId: 'oil', count: 3 }], outputs: [{ itemId: 'plastic', count: 2 }], craftTime: 60, energyCost: 1, category: 'chemistry' },
  conveyor_belt: { id: 'conveyor_belt', name: 'Conveyor Belt', inputs: [{ itemId: 'iron_plate', count: 1 }, { itemId: 'gear', count: 1 }], outputs: [{ itemId: 'conveyor_belt', count: 2 }], craftTime: 30, energyCost: 0.5, category: 'crafting' },
  inserter_item: { id: 'inserter_item', name: 'Inserter', inputs: [{ itemId: 'iron_plate', count: 1 }, { itemId: 'gear', count: 1 }, { itemId: 'circuit', count: 1 }], outputs: [{ itemId: 'inserter_item', count: 1 }], craftTime: 60, energyCost: 1, category: 'crafting' },
  miner_item: { id: 'miner_item', name: 'Mining Drill', inputs: [{ itemId: 'iron_plate', count: 3 }, { itemId: 'gear', count: 3 }, { itemId: 'circuit', count: 1 }], outputs: [{ itemId: 'miner_item', count: 1 }], craftTime: 120, energyCost: 2, category: 'crafting' },
  furnace_item: { id: 'furnace_item', name: 'Furnace', inputs: [{ itemId: 'stone', count: 5 }, { itemId: 'iron_plate', count: 2 }], outputs: [{ itemId: 'furnace_item', count: 1 }], craftTime: 90, energyCost: 1, category: 'crafting' },
  science_red: { id: 'science_red', name: 'Red Science Pack', inputs: [{ itemId: 'gear', count: 1 }, { itemId: 'copper_plate', count: 1 }], outputs: [{ itemId: 'science_red', count: 1 }], craftTime: 60, energyCost: 1, category: 'crafting' },
  science_green: { id: 'science_green', name: 'Green Science Pack', inputs: [{ itemId: 'conveyor_belt', count: 1 }, { itemId: 'inserter_item', count: 1 }], outputs: [{ itemId: 'science_green', count: 1 }], craftTime: 120, energyCost: 1, category: 'crafting' },
  science_blue: { id: 'science_blue', name: 'Blue Science Pack', inputs: [{ itemId: 'advanced_circuit', count: 1 }, { itemId: 'gear', count: 1 }, { itemId: 'sulfuric_acid', count: 1 }], outputs: [{ itemId: 'science_blue', count: 1 }], craftTime: 300, energyCost: 2, category: 'crafting' },
  sulfuric_acid: { id: 'sulfuric_acid', name: 'Sulfuric Acid', inputs: [{ itemId: 'iron_plate', count: 1 }, { itemId: 'water', count: 2 }, { itemId: 'oil', count: 1 }], outputs: [{ itemId: 'sulfuric_acid', count: 2 }], craftTime: 60, energyCost: 1, category: 'chemistry' },
  ammo: { id: 'ammo', name: 'Firearm Magazine', inputs: [{ itemId: 'iron_plate', count: 4 }], outputs: [{ itemId: 'ammo', count: 1 }], craftTime: 30, energyCost: 1, category: 'military' },
  wall_item: { id: 'wall_item', name: 'Wall', inputs: [{ itemId: 'stone', count: 5 }], outputs: [{ itemId: 'wall_item', count: 1 }], craftTime: 30, energyCost: 0.5, category: 'crafting' },
  turret_item: { id: 'turret_item', name: 'Gun Turret', inputs: [{ itemId: 'iron_plate', count: 5 }, { itemId: 'gear', count: 5 }, { itemId: 'copper_plate', count: 5 }], outputs: [{ itemId: 'turret_item', count: 1 }], craftTime: 180, energyCost: 2, category: 'military' },
  solar_panel_item: { id: 'solar_panel_item', name: 'Solar Panel', inputs: [{ itemId: 'steel_plate', count: 3 }, { itemId: 'circuit', count: 5 }, { itemId: 'copper_plate', count: 4 }], outputs: [{ itemId: 'solar_panel_item', count: 1 }], craftTime: 120, energyCost: 1.5, category: 'energy' },
  accumulator_item: { id: 'accumulator_item', name: 'Accumulator', inputs: [{ itemId: 'iron_plate', count: 4 }, { itemId: 'battery', count: 2 }], outputs: [{ itemId: 'accumulator_item', count: 1 }], craftTime: 90, energyCost: 1, category: 'energy' },
  laser_turret_item: { id: 'laser_turret_item', name: 'Laser Turret', inputs: [{ itemId: 'steel_plate', count: 8 }, { itemId: 'advanced_circuit', count: 3 }, { itemId: 'battery', count: 2 }], outputs: [{ itemId: 'laser_turret_item', count: 1 }], craftTime: 240, energyCost: 3, category: 'military' },
  flak_cannon_item: { id: 'flak_cannon_item', name: 'Flak Cannon', inputs: [{ itemId: 'steel_plate', count: 10 }, { itemId: 'gear', count: 8 }, { itemId: 'ammo', count: 5 }], outputs: [{ itemId: 'flak_cannon_item', count: 1 }], craftTime: 300, energyCost: 3, category: 'military' },
  tesla_coil_item: { id: 'tesla_coil_item', name: 'Tesla Coil', inputs: [{ itemId: 'steel_plate', count: 6 }, { itemId: 'advanced_circuit', count: 5 }, { itemId: 'battery', count: 4 }], outputs: [{ itemId: 'tesla_coil_item', count: 1 }], craftTime: 360, energyCost: 4, category: 'military' },
  mine_item: { id: 'mine_item', name: 'Land Mine', inputs: [{ itemId: 'iron_plate', count: 2 }, { itemId: 'ammo', count: 1 }], outputs: [{ itemId: 'mine_item', count: 2 }], craftTime: 30, energyCost: 0.5, category: 'military' },
  roboport_item: { id: 'roboport_item', name: 'Roboport', inputs: [{ itemId: 'steel_plate', count: 10 }, { itemId: 'gear', count: 10 }, { itemId: 'advanced_circuit', count: 5 }], outputs: [{ itemId: 'roboport_item', count: 1 }], craftTime: 360, energyCost: 4, category: 'logistics' },
  silo_item: { id: 'silo_item', name: 'Rocket Silo', inputs: [{ itemId: 'steel_plate', count: 20 }, { itemId: 'advanced_circuit', count: 10 }, { itemId: 'battery', count: 5 }], outputs: [{ itemId: 'silo_item', count: 1 }], craftTime: 600, energyCost: 5, category: 'production' },
  centrifuge_item: { id: 'centrifuge_item', name: 'Centrifuge', inputs: [{ itemId: 'steel_plate', count: 10 }, { itemId: 'advanced_circuit', count: 5 }, { itemId: 'uranium', count: 2 }], outputs: [{ itemId: 'centrifuge_item', count: 1 }], craftTime: 360, energyCost: 4, category: 'production' },
  artillery_item: { id: 'artillery_item', name: 'Artillery', inputs: [{ itemId: 'steel_plate', count: 15 }, { itemId: 'gear', count: 10 }, { itemId: 'advanced_circuit', count: 5 }, { itemId: 'ammo', count: 10 }], outputs: [{ itemId: 'artillery_item', count: 1 }], craftTime: 480, energyCost: 5, category: 'military' },
  beacon_item: { id: 'beacon_item', name: 'Beacon', inputs: [{ itemId: 'steel_plate', count: 5 }, { itemId: 'advanced_circuit', count: 3 }], outputs: [{ itemId: 'beacon_item', count: 1 }], craftTime: 180, energyCost: 2, category: 'logistics' },
};

export const RESEARCH_TREE: Record<string, {
  id: string; name: string; description: string; cost: { itemId: string; count: number }[];
  time: number; prerequisites: string[]; effects: Record<string, number>;
}> = {
  automation: { id: 'automation', name: 'Automation', description: 'Basic automation technology', cost: [{ itemId: 'science_red', count: 10 }], time: 1200, prerequisites: [], effects: { miningSpeed: 1.2 } },
  logistics: { id: 'logistics', name: 'Logistics', description: 'Improved logistics systems', cost: [{ itemId: 'science_red', count: 20 }], time: 1800, prerequisites: ['automation'], effects: { beltSpeed: 1.5 } },
  electronics: { id: 'electronics', name: 'Electronics', description: 'Advanced circuit production', cost: [{ itemId: 'science_red', count: 15 }, { itemId: 'science_green', count: 10 }], time: 2400, prerequisites: ['automation'], effects: { craftingSpeed: 1.3 } },
  steel_processing: { id: 'steel_processing', name: 'Steel Processing', description: 'Unlock steel production', cost: [{ itemId: 'science_red', count: 20 }], time: 1200, prerequisites: [], effects: { unlockSteel: 1 } },
  military: { id: 'military', name: 'Military', description: 'Basic military technology', cost: [{ itemId: 'science_red', count: 10 }, { itemId: 'science_green', count: 10 }], time: 1800, prerequisites: [], effects: { turretDamage: 1.5 } },
  oil_processing: { id: 'oil_processing', name: 'Oil Processing', description: 'Unlock oil processing', cost: [{ itemId: 'science_green', count: 20 }], time: 2400, prerequisites: ['logistics', 'steel_processing'], effects: { unlockOil: 1 } },
  advanced_electronics: { id: 'advanced_electronics', name: 'Advanced Electronics', description: 'Advanced circuit technology', cost: [{ itemId: 'science_green', count: 20 }, { itemId: 'science_blue', count: 5 }], time: 3600, prerequisites: ['electronics', 'oil_processing'], effects: { craftingSpeed: 1.5, assemblerSpeed: 1.3 } },
  weapon_upgrade: { id: 'weapon_upgrade', name: 'Weapon Upgrades', description: 'Improved weapons', cost: [{ itemId: 'science_green', count: 15 }, { itemId: 'science_blue', count: 10 }], time: 3000, prerequisites: ['military', 'advanced_electronics'], effects: { turretDamage: 2.0, playerDamage: 1.5 } },
  power_armor: { id: 'power_armor', name: 'Power Armor', description: 'Advanced protection', cost: [{ itemId: 'science_blue', count: 20 }, { itemId: 'science_green', count: 30 }], time: 4800, prerequisites: ['advanced_electronics', 'military'], effects: { playerHealth: 2.0, playerSpeed: 1.3 } },
  rocket_science: { id: 'rocket_science', name: 'Rocket Science', description: 'The final frontier', cost: [{ itemId: 'science_blue', count: 50 }, { itemId: 'science_green', count: 50 }, { itemId: 'science_red', count: 50 }], time: 7200, prerequisites: ['power_armor', 'weapon_upgrade', 'advanced_electronics'], effects: { victory: 1 } },
};

export const NPC_NAMES = [
  'Elena', 'Marcus', 'Sofia', 'Viktor', 'Aria', 'Dmitri', 'Luna', 'Kai',
  'Nadia', 'Rex', 'Zara', 'Finn', 'Mira', 'Axel', 'Ivy', 'Hugo',
  'Nova', 'Leo', 'Ada', 'Raven', 'Jade', 'Blaze', 'Echo', 'Storm',
];

export const NPC_DIALOGUES: Record<string, string[]> = {
  worker: [
    'Another day in the factory!',
    'The conveyor belts need maintenance.',
    'Production is running smoothly.',
    'I need more resources over here!',
    'Watch out for biters at night.',
    'This place runs on coal and determination.',
    'More materials! The factory is hungry!',
    'The belt system could use an upgrade.',
    'Pro tip: underground belts save space.',
    'Dont forget to refuel the boilers.',
    'I heard there is a resource vein nearby.',
    'Production quota: MET.',
  ],
  scout: [
    'I spotted a resource vein to the east!',
    'Enemies are gathering near the perimeter.',
    'The pollution is attracting more biters.',
    'I found an abandoned outpost!',
    'The terrain gets rough up north.',
    'There is a massive iron patch two chunks south.',
    'I see biter nests expanding to the east.',
    'Oil seeps are visible in the swamp biome.',
    'Coal deposit running low in sector 7.',
    'The factory smoke is visible from far away.',
  ],
  trader: [
    'Looking to trade? I have rare goods!',
    'Prices are fair, I promise.',
    'I can get you anything you need.',
    'Special discount for factory owners!',
    'My caravan travels far and wide.',
    'I have circuits from a distant factory.',
    'Rare minerals? I know a guy.',
    'Got any surplus iron plates?',
  ],
  guard: [
    'Perimeter is secure, for now.',
    'Stay alert, biters are restless.',
    'The walls are holding strong.',
    'I heard something in the bushes.',
    'Night watch is the hardest.',
    'More turrets would make me sleep better.',
    'The biters are learning. I swear it.',
    'Ammo stock is getting low.',
  ],
  settler: [
    'This looks like a good place to settle.',
    'The factory provides, the factory protects.',
    'We should expand the walls further.',
    'I dream of green fields without pollution.',
    'Progress requires sacrifice.',
    'My children will know only the factory.',
    'This land was wild before we tamed it.',
    'Sometimes I miss the quiet. But this is better.',
  ],
};

export const ITEM_NAMES: Record<string, string> = {
  iron: 'Iron', copper: 'Copper', stone: 'Stone', coal: 'Coal', wood: 'Wood',
  iron_plate: 'Iron Plate', copper_plate: 'Cu Plate', steel_plate: 'Steel Plate',
  gear: 'Gear', circuit: 'Circuit', ammo: 'Ammo',
  science_red: 'Red Sci', science_green: 'Green Sci', science_blue: 'Blue Sci',
  oil: 'Oil', uranium: 'Uranium',
  solar_panel_item: 'Solar Panel', accumulator_item: 'Accumulator',
  laser_turret_item: 'Laser Turret', flak_cannon_item: 'Flak Cannon',
  tesla_coil_item: 'Tesla Coil', mine_item: 'Land Mine',
  roboport_item: 'Roboport', silo_item: 'Rocket Silo',
  centrifuge_item: 'Centrifuge', artillery_item: 'Artillery',
  beacon_item: 'Beacon', advanced_circuit: 'Adv Circuit',
  battery: 'Battery', plastic: 'Plastic', sulfuric_acid: 'Sulfuric Acid',
  conveyor_belt: 'Conveyor', inserter_item: 'Inserter',
  miner_item: 'Miner', furnace_item: 'Furnace',
  wall_item: 'Wall', turret_item: 'Turret',
  petroleum_gas: 'Petroleum', light_oil: 'Light Oil', heavy_oil: 'Heavy Oil',
};

export const ENEMY_STATS: Record<string, { health: number; attack: number; speed: number; range: number }> = {
  biter: { health: 30, attack: 8, speed: 1.5, range: 1.2 },
  spitter: { health: 20, attack: 12, speed: 1.0, range: 5 },
  worm: { health: 100, attack: 20, speed: 0, range: 8 },
  behemoth: { health: 500, attack: 40, speed: 1.2, range: 1.5 },
  spawner: { health: 300, attack: 0, speed: 0, range: 0 },
  destroyer: { health: 150, attack: 25, speed: 3.0, range: 4 },
  leviathan: { health: 2000, attack: 80, speed: 0.8, range: 2 },
  drone: { health: 40, attack: 15, speed: 4.0, range: 1.5 },
};
