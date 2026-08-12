/** Typ surowca dostępnego na mapie. */
export type ResourceType = 'iron' | 'copper' | 'coal' | 'stone' | 'wood' | 'oil' | 'water' | 'uranium';
/** Typ budynku — wszystkie konstrukcje stawiane przez gracza/NPC. */
export type BuildingType = 'miner' | 'furnace' | 'assembler' | 'conveyor' | 'inserter' | 'storage' | 'power_pole' | 'steam_engine' | 'boiler' | 'lab' | 'radar' | 'turret' | 'wall' | 'belt_junction' | 'splitter' | 'underground_belt' | 'pumpjack' | 'refinery' | 'chemical_plant' | 'pipe'
  | 'solar_panel' | 'accumulator' | 'laser_turret' | 'flak_cannon' | 'tesla_coil'
  | 'mine' | 'roboport' | 'pump' | 'silo' | 'beacon' | 'centrifuge' | 'artillery';
/** Typ NPC — worker (buduje), scout (eksploruje), trader (handluje), guard (chroni), settler (osadnik). */
export type NPCType = 'worker' | 'scout' | 'trader' | 'guard' | 'settler';
/** Typ wroga — biter (podstawowy), spitter (strzela), worm (wieża), behemoth (ciężki), spawner (gniazdo), destroyer (latający), leviathan (olbrzym), drone (szybki). */
export type EnemyType = 'biter' | 'spitter' | 'worm' | 'behemoth' | 'spawner' | 'destroyer' | 'leviathan' | 'drone';
/** Typ biomu — wpływa na kolorystykę i generację surowców. */
export type BiomeType = 'grass' | 'desert' | 'snow' | 'forest' | 'swamp' | 'volcanic';
/** Kierunek — używany przez gracza, budynki, przenośniki i insertery. */
export type Direction = 'up' | 'down' | 'left' | 'right';
/** Alias dla ID przedmiotu (string). */
export type ItemId = string;

/** Para współrzędnych (x, y) — używana przez pozycję, pathfinding, target. */
export interface Position {
  x: number;
  y: number;
}

/** Współrzędne chunka w gridzie (cx, cy). */
export interface ChunkCoord {
  cx: number;
  cy: number;
}

/** Pojedynczy kafelek (tile) świata — zawiera biom, surowiec, budynek, pollution i widoczność. */
export interface Tile {
  x: number;
  y: number;
  biome: BiomeType;
  resource: ResourceType | null;
  resourceAmount: number;
  resourceYield: 'depleted' | 'normal' | 'rich' | 'very_rich';
  building: Building | null;
  pollution: number;
  visibility: number;
}

/** Budynek na mapie — posiada health, inventory, output, recipe, energię i level ulepszenia. */
export interface Building {
  id: string;
  type: BuildingType;
  x: number;
  y: number;
  direction: Direction;
  health: number;
  maxHealth: number;
  recipe: Recipe | null;
  progress: number;
  energy: number;
  maxEnergy: number;
  inventory: InventorySlot[];
  outputInventory: InventorySlot[];
  isActive: boolean;
  level: number;
}

/** Pojedynczy slot w ekwipunku (itemId + ilość). */
export interface InventorySlot {
  itemId: ItemId;
  count: number;
}

/** Przepis rzemieślniczy — wejścia, wyjścia, czas, koszt energii, kategoria. */
export interface Recipe {
  id: string;
  name: string;
  inputs: InventorySlot[];
  outputs: InventorySlot[];
  craftTime: number;
  energyCost: number;
  category: string;
}

/** Stan pojedynczego segmentu przenośnika — przedmiot, progress (0-1), kierunek. */
export interface ConveyorState {
  itemId: ItemId | null;
  progress: number;
  direction: Direction;
}

/** Niezależny NPC — porusza się, pracuje, buduje z kolejki, handluje, patroluje. */
export interface NPC {
  id: string;
  type: NPCType;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  health: number;
  maxHealth: number;
  speed: number;
  state: 'idle' | 'moving' | 'working' | 'building' | 'fleeing' | 'trading' | 'patrolling' | 'gathering';
  inventory: InventorySlot[];
  homeX: number;
  homeY: number;
  name: string;
  faction: string;
  dialogue: string[];
  taskTimer: number;
  path: Position[];
  pathIndex: number;
}

/** Wróg — atakuje budynki i gracza, ewoluuje z czasem. */
export interface Enemy {
  id: string;
  type: EnemyType;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  attack: number;
  speed: number;
  range: number;
  target: Position | null;
  evolution: number;
  state: 'idle' | 'moving' | 'attacking' | 'dying';
  attackCooldown: number;
  spawnerId: string | null;
}

/** Gniazdo wrogów — spawnuje fale, ewoluuje, przechowuje listę swoich enemy. */
export interface EnemySpawner {
  id: string;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  spawnTimer: number;
  spawnRate: number;
  evolution: number;
  enemies: string[];
}

/** Cząsteczka (particle) — efekt wizualny (dym, iskry, ogień, eksplozja, ambient). */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'smoke' | 'spark' | 'fire' | 'resource' | 'explosion' | 'ambient';
}

/** Wydarzenie świata — meteor, raid, migracja, odkrycie, karawana, trzęsienie ziemi, złoże. */
export interface WorldEvent {
  id: string;
  type: 'meteor' | 'raid' | 'migration' | 'discovery' | 'trade_caravan' | 'earthquake' | 'resource_vein';
  x: number;
  y: number;
  timer: number;
  data: Record<string, unknown>;
}

/** Technologia w drzewie badań — koszt, czas, wymagania, efekty. */
export interface Research {
  id: string;
  name: string;
  description: string;
  cost: InventorySlot[];
  time: number;
  prerequisites: string[];
  unlocked: boolean;
  progress: number;
  effects: Record<string, number>;
}

/** Stan gracza — pozycja, health, ekwipunek, XP, level, waluty premium, kosmetyki. */
export interface PlayerState {
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  inventory: InventorySlot[];
  selectedSlot: number;
  direction: Direction;
  speed: number;
  reach: number;
  miningSpeed: number;
  craftingSpeed: number;
  xp: number;
  level: number;
  premiumCurrency: number;
  gems: number;
  premiumBalance: number;
  premiumTier: 'free' | 'starter' | 'premium';
  cosmetics: { skinColor: string; hatType: string; trailEffect: string };
  achievements: string[];
  totalPlayTime: number;
}

/** Element kolejki budowy — NPC buduje na podstawie tego zadania. */
export interface BuildQueueItem {
  id: string;
  type: string;
  x: number;
  y: number;
  direction: Direction;
  assignedNpcId?: string;
  constructionProgress: number; // 0..100
}

/** Główny stan gry — agreguje wszystkie podstany (gracz, kamera, chunki, budynki, NPC, wrogowie, badania, pogoda, statystyki). */
export interface GameState {
  player: PlayerState;
  camera: { x: number; y: number; zoom: number };
  chunks: Map<string, Tile[][]>;
  buildings: Map<string, Building>;
  npcs: Map<string, NPC>;
  enemies: Map<string, Enemy>;
  spawners: Map<string, EnemySpawner>;
  conveyors: Map<string, ConveyorState[]>;
  particles: Particle[];
  events: WorldEvent[];
  research: Map<string, Research>;
  tick: number;
  pollution: number;
  totalPollutionGenerated: number;
  evolution: number;
  powerGrid: Map<string, { production: number; consumption: number; stored: number }>;
  dayTime: number;
  dayLength: number;
  weather: 'clear' | 'rain' | 'heavy_rain' | 'storm' | 'fog' | 'snow';
  weatherTimer: number;
  statistics: {
    itemsProduced: Record<string, number>;
    itemsConsumed: Record<string, number>;
    enemiesKilled: number;
    buildingsPlaced: number;
    timePlayed: number;
  };
  notifications: { text: string; timer: number; type?: 'info' | 'error' | 'success' | 'build' }[];
  buildQueue: BuildQueueItem[];
  worldSeed: number;
  coopVisitors?: Map<string, { username: string; x: number; y: number; color: string }>;
}
