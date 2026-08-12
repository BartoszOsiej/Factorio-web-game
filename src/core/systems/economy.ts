import { GameState, Building, Direction } from '../../game/types'
import { BUILDING_HEALTH, BUILDING_SIZES, CHUNK_SIZE } from '../../game/constants'
import { genId, getChunkAt, getTileAt } from './chunk'

const BUILDING_COSTS: Record<string, { itemId: string; count: number }[]> = {
  conveyor:          [{ itemId: 'iron_plate', count: 4 }, { itemId: 'gear', count: 4 }],
  inserter:          [{ itemId: 'iron_plate', count: 5 }, { itemId: 'gear', count: 5 }, { itemId: 'circuit', count: 3 }],
  splitter:          [{ itemId: 'iron_plate', count: 10 }, { itemId: 'gear', count: 8 }],
  underground_belt:  [{ itemId: 'iron_plate', count: 10 }, { itemId: 'gear', count: 8 }],
  miner:             [{ itemId: 'iron_plate', count: 15 }, { itemId: 'gear', count: 12 }, { itemId: 'circuit', count: 5 }],
  furnace:           [{ itemId: 'stone', count: 20 }, { itemId: 'iron_plate', count: 10 }],
  assembler:         [{ itemId: 'iron_plate', count: 15 }, { itemId: 'gear', count: 12 }, { itemId: 'circuit', count: 8 }],
  storage:           [{ itemId: 'iron_plate', count: 12 }, { itemId: 'gear', count: 8 }],
  power_pole:        [{ itemId: 'iron_plate', count: 2 }, { itemId: 'copper_plate', count: 2 }],
  steam_engine:      [{ itemId: 'iron_plate', count: 30 }, { itemId: 'gear', count: 20 }, { itemId: 'copper_plate', count: 10 }],
  boiler:            [{ itemId: 'stone', count: 20 }, { itemId: 'iron_plate', count: 15 }, { itemId: 'copper_plate', count: 8 }],
  lab:               [{ itemId: 'iron_plate', count: 20 }, { itemId: 'gear', count: 15 }, { itemId: 'circuit', count: 12 }],
  radar:             [{ itemId: 'iron_plate', count: 15 }, { itemId: 'gear', count: 10 }, { itemId: 'circuit', count: 8 }],
  turret:            [{ itemId: 'iron_plate', count: 25 }, { itemId: 'gear', count: 20 }, { itemId: 'copper_plate', count: 15 }],
  wall:              [{ itemId: 'stone', count: 8 }],
  belt_junction:     [{ itemId: 'iron_plate', count: 5 }, { itemId: 'gear', count: 5 }],
  pumpjack:          [{ itemId: 'iron_plate', count: 25 }, { itemId: 'gear', count: 20 }, { itemId: 'circuit', count: 10 }],
  refinery:          [{ itemId: 'iron_plate', count: 40 }, { itemId: 'gear', count: 30 }, { itemId: 'circuit', count: 20 }, { itemId: 'steel_plate', count: 10 }],
  chemical_plant:    [{ itemId: 'iron_plate', count: 30 }, { itemId: 'gear', count: 20 }, { itemId: 'circuit', count: 15 }, { itemId: 'steel_plate', count: 8 }],
  pipe:              [{ itemId: 'iron_plate', count: 2 }],
  solar_panel:       [{ itemId: 'steel_plate', count: 8 }, { itemId: 'circuit', count: 10 }, { itemId: 'copper_plate', count: 10 }],
  accumulator:       [{ itemId: 'iron_plate', count: 10 }, { itemId: 'battery', count: 4 }],
  laser_turret:      [{ itemId: 'steel_plate', count: 20 }, { itemId: 'advanced_circuit', count: 8 }, { itemId: 'battery', count: 5 }],
  flak_cannon:       [{ itemId: 'steel_plate', count: 25 }, { itemId: 'gear', count: 20 }, { itemId: 'ammo', count: 10 }],
  tesla_coil:        [{ itemId: 'steel_plate', count: 15 }, { itemId: 'advanced_circuit', count: 12 }, { itemId: 'battery', count: 8 }],
  mine:              [{ itemId: 'iron_plate', count: 5 }, { itemId: 'ammo', count: 2 }],
  roboport:          [{ itemId: 'steel_plate', count: 25 }, { itemId: 'gear', count: 25 }, { itemId: 'advanced_circuit', count: 12 }],
  pump:              [{ itemId: 'iron_plate', count: 10 }, { itemId: 'gear', count: 5 }],
  silo:              [{ itemId: 'steel_plate', count: 50 }, { itemId: 'advanced_circuit', count: 25 }, { itemId: 'battery', count: 12 }],
  beacon:            [{ itemId: 'steel_plate', count: 12 }, { itemId: 'advanced_circuit', count: 8 }],
  centrifuge:        [{ itemId: 'steel_plate', count: 25 }, { itemId: 'advanced_circuit', count: 12 }, { itemId: 'uranium', count: 5 }],
  artillery:         [{ itemId: 'steel_plate', count: 40 }, { itemId: 'gear', count: 25 }, { itemId: 'advanced_circuit', count: 12 }, { itemId: 'ammo', count: 20 }],
}

const UPGRADE_COSTS: Record<number, { itemId: string; count: number }[]> = {
  2: [{ itemId: 'iron_plate', count: 10 }, { itemId: 'circuit', count: 5 }],
  3: [{ itemId: 'steel_plate', count: 10 }, { itemId: 'advanced_circuit', count: 5 }],
}

export function getBuildingCost(type: string): { itemId: string; count: number }[] {
  return BUILDING_COSTS[type] || []
}

export function canAffordBuilding(state: GameState, type: string): boolean {
  const cost = BUILDING_COSTS[type]
  if (!cost) return true
  return cost.every(c => {
    const slot = state.player.inventory.find(s => s.itemId === c.itemId)
    return slot && slot.count >= c.count
  })
}

export function payBuildingCost(state: GameState, type: string): boolean {
  const cost = BUILDING_COSTS[type]
  if (!cost) return true
  if (!canAffordBuilding(state, type)) return false
  for (const c of cost) {
    removeItemFromPlayer(state, c.itemId, c.count)
  }
  return true
}

export function createBuilding(type: string, x: number, y: number, direction: string): Building {
  const health = BUILDING_HEALTH[type] || 100
  return {
    id: genId(), type: type as Building['type'], x, y,
    direction: direction as Direction, health, maxHealth: health,
    recipe: null, progress: 0, energy: 0,
    maxEnergy: type === 'steam_engine' ? 100 : type === 'boiler' ? 50 : 0,
    inventory: [], outputInventory: [], isActive: false, level: 1,
  }
}

export function placeBuilding(state: GameState, type: string, x: number, y: number, direction: string, skipPayment = false): boolean {
  const size = BUILDING_SIZES[type] || { w: 1, h: 1 }

  for (let dy = 0; dy < size.h; dy++) {
    for (let dx = 0; dx < size.w; dx++) {
      const tx = x + dx, ty = y + dy
      const chunk = getChunkAt(state, tx, ty)
      if (!chunk) return false
      const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
      const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
      if (chunk[ly][lx].building) return false
    }
  }

  if (!skipPayment && !payBuildingCost(state, type)) return false

  const building = createBuilding(type, x, y, direction)
  state.buildings.set(`${x},${y}`, building)

  for (let dy = 0; dy < size.h; dy++) {
    for (let dx = 0; dx < size.w; dx++) {
      const tx = x + dx, ty = y + dy
      const chunk = getChunkAt(state, tx, ty)
      if (chunk) {
        const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
        const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
        chunk[ly][lx].building = building
      }
    }
  }

  if (type === 'conveyor') {
    state.conveyors.set(`${x},${y}`, [
      { itemId: null, progress: 0, direction: direction as Direction },
      { itemId: null, progress: 0.5, direction: direction as Direction },
    ])
  }

  state.statistics.buildingsPlaced++
  grantXPToPlayer(state, 3)
  return true
}

export function removeBuilding(state: GameState, x: number, y: number): boolean {
  const key = `${x},${y}`
  const building = state.buildings.get(key)
  if (!building) return false

  const size = BUILDING_SIZES[building.type] || { w: 1, h: 1 }
  for (let dy = 0; dy < size.h; dy++) {
    for (let dx = 0; dx < size.w; dx++) {
      const tx = x + dx, ty = y + dy
      const chunk = getChunkAt(state, tx, ty)
      if (chunk) {
        const lx = ((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
        const ly = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
        chunk[ly][lx].building = null
      }
    }
  }

  const cost = BUILDING_COSTS[building.type]
  if (cost) {
    for (const c of cost) {
      addItemToPlayer(state, c.itemId, c.count)
    }
  }

  state.buildings.delete(key)
  state.conveyors.delete(key)
  return true
}

export function addItemToPlayer(state: GameState, itemId: string, count: number) {
  const slot = state.player.inventory.find(s => s.itemId === itemId)
  if (slot) slot.count += count
  else state.player.inventory.push({ itemId, count })
}

export function removeItemFromPlayer(state: GameState, itemId: string, count: number): boolean {
  const slot = state.player.inventory.find(s => s.itemId === itemId)
  if (!slot || slot.count < count) return false
  slot.count -= count
  if (slot.count <= 0) state.player.inventory = state.player.inventory.filter(s => s.count > 0)
  return true
}

export function getUpgradeCost(level: number): { itemId: string; count: number }[] {
  return UPGRADE_COSTS[level + 1] || []
}

export function canAffordUpgrade(state: GameState, level: number): boolean {
  const cost = UPGRADE_COSTS[level + 1]
  if (!cost) return false
  return cost.every(c => {
    const slot = state.player.inventory.find(s => s.itemId === c.itemId)
    return slot && slot.count >= c.count
  })
}

export function upgradeBuilding(state: GameState, x: number, y: number): boolean {
  const key = `${x},${y}`
  const building = state.buildings.get(key)
  if (!building || building.level >= 3) return false

  const cost = UPGRADE_COSTS[building.level + 1]
  if (!cost) return false
  if (!cost.every(c => {
    const slot = state.player.inventory.find(s => s.itemId === c.itemId)
    return slot && slot.count >= c.count
  })) return false

  for (const c of cost) {
    removeItemFromPlayer(state, c.itemId, c.count)
  }

  building.level++
  building.maxHealth = Math.floor(building.maxHealth * 1.5)
  building.health = building.maxHealth
  grantXPToPlayer(state, 10)
  return true
}

export function playerMine(state: GameState, tx: number, ty: number): boolean {
  const tile = getTileAt(state, tx, ty)
  if (tile.resource && tile.resourceAmount > 0 && tile.resource !== 'water' && tile.resource !== 'oil') {
    const minedResource = tile.resource
    tile.resourceAmount -= 1
    if (tile.resourceAmount <= 0) tile.resource = null
    addItemToPlayer(state, minedResource, 1)
    grantXPToPlayer(state, 1)
    return true
  }
  return false
}

export function grantXPToPlayer(state: GameState, amount: number, notify?: (msg: string) => void) {
  state.player.xp += amount
  let requiredXP = state.player.level * 500
  while (state.player.xp >= requiredXP) {
    state.player.xp -= requiredXP
    state.player.level++
    state.player.premiumCurrency += 3
    state.player.gems += 1
    const msg = `Level Up! Now level ${state.player.level}! +1 gem`
    if (notify) notify(msg)
    state.notifications.push({ text: msg, timer: 180 })
    requiredXP = state.player.level * 500
  }
}
