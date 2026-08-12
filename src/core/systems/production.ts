import { GameState, Building, Enemy } from '../../game/types'
import { TILE_SIZE, BUILDING_SIZES, RECIPES, RESOURCE_COLORS } from '../../game/constants'
import { getTileAt } from './chunk'
import { addItemToBuilding, addItemToBuildingOutput, removeItemFromBuilding, removeItemFromBuildingOutput, getAcceptedItemTypes } from './helpers'
import { grantXPToPlayer } from './economy'
import { spawnParticle } from './world'

function updateMiner(state: GameState, building: Building) {
  let foundResource = false
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const tile = getTileAt(state, building.x + dx, building.y + dy)
      if (tile.resource && tile.resourceAmount > 0 && tile.resource !== 'water' && tile.resource !== 'oil') {
        foundResource = true
        building.progress += state.player.miningSpeed
        if (building.progress >= 80) {
          building.progress = 0
          const outSlot = building.outputInventory.find(s => s.itemId === tile.resource)
          if (outSlot && outSlot.count >= 50) { building.isActive = true; return }
          const minedResource = tile.resource!
          tile.resourceAmount -= 1
          if (tile.resourceAmount <= 0) tile.resource = null
          addItemToBuildingOutput(building, minedResource, 1)
          state.statistics.itemsProduced[minedResource] = (state.statistics.itemsProduced[minedResource] || 0) + 1
          spawnParticle(state, building.x * TILE_SIZE + 16, building.y * TILE_SIZE + 16, 'resource', RESOURCE_COLORS[minedResource] || '#fff')
        }
        building.isActive = true
        return
      }
    }
  }
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const tile = getTileAt(state, building.x + dx, building.y + dy)
      if (tile.resource === 'oil' && tile.resourceAmount > 0) {
        foundResource = true
        building.progress += state.player.miningSpeed
        if (building.progress >= 60) {
          building.progress = 0
          tile.resourceAmount -= 1
          addItemToBuildingOutput(building, 'oil', 1)
          state.statistics.itemsProduced['oil'] = (state.statistics.itemsProduced['oil'] || 0) + 1
        }
        building.isActive = true
        return
      }
    }
  }
  building.isActive = foundResource
}

function updateFurnace(state: GameState, building: Building) {
  if (!building.recipe) {
    const ironSlot = building.inventory.find(s => s.itemId === 'iron')
    const copperSlot = building.inventory.find(s => s.itemId === 'copper')
    const stoneSlot = building.inventory.find(s => s.itemId === 'stone')
    const steelSlot = building.inventory.find(s => s.itemId === 'iron_plate')
    if (ironSlot) {
      building.recipe = RECIPES.iron_plate satisfies NonNullable<Building['recipe']>
    } else if (copperSlot) {
      building.recipe = RECIPES.copper_plate satisfies NonNullable<Building['recipe']>
    } else if (steelSlot && state.research.get('steel_processing')?.unlocked) {
      building.recipe = RECIPES.steel_plate satisfies NonNullable<Building['recipe']>
    } else if (stoneSlot) {
      building.recipe = {
        id: 'stone_brick', name: 'Stone Brick',
        inputs: [{ itemId: 'stone', count: 2 }],
        outputs: [{ itemId: 'stone_brick', count: 1 }],
        craftTime: 30, energyCost: 1, category: 'smelting',
      }
    }
  }

  if (!building.recipe) { building.isActive = false; return }

  if (building.recipe) {
    const hasInput = building.recipe.inputs.every(inp => {
      const slot = building.inventory.find(s => s.itemId === inp.itemId)
      return slot && slot.count >= inp.count
    })
    if (!hasInput) {
      building.recipe = null
      building.isActive = false
      return
    }
  }

  for (const output of building.recipe.outputs) {
    const outSlot = building.outputInventory.find(s => s.itemId === output.itemId)
    if (outSlot && outSlot.count >= 50) { building.isActive = false; return }
  }

  building.progress += state.player.craftingSpeed
  if (building.progress >= building.recipe.craftTime) {
    building.progress = 0
    for (const input of building.recipe.inputs) {
      removeItemFromBuilding(building, input.itemId, input.count)
      state.statistics.itemsConsumed[input.itemId] = (state.statistics.itemsConsumed[input.itemId] || 0) + input.count
    }
    for (const output of building.recipe.outputs) {
      addItemToBuildingOutput(building, output.itemId, output.count)
      state.statistics.itemsProduced[output.itemId] = (state.statistics.itemsProduced[output.itemId] || 0) + output.count
    }
    spawnParticle(state, building.x * TILE_SIZE + 16, building.y * TILE_SIZE + 8, 'fire', '#ff6600')
  }
  building.isActive = true
}

function updateAssembler(state: GameState, building: Building) {
  if (!building.recipe) { building.isActive = false; return }

  for (const input of building.recipe.inputs) {
    const slot = building.inventory.find(s => s.itemId === input.itemId)
    if (!slot || slot.count < input.count) { building.isActive = false; return }
  }

  for (const output of building.recipe.outputs) {
    const outSlot = building.outputInventory.find(s => s.itemId === output.itemId)
    if (outSlot && outSlot.count >= 50) { building.isActive = false; return }
  }

  building.progress += state.player.craftingSpeed
  if (building.progress >= building.recipe.craftTime) {
    building.progress = 0
    for (const input of building.recipe.inputs) {
      removeItemFromBuilding(building, input.itemId, input.count)
      state.statistics.itemsConsumed[input.itemId] = (state.statistics.itemsConsumed[input.itemId] || 0) + input.count
    }
    for (const output of building.recipe.outputs) {
      addItemToBuildingOutput(building, output.itemId, output.count)
      state.statistics.itemsProduced[output.itemId] = (state.statistics.itemsProduced[output.itemId] || 0) + output.count
    }
    spawnParticle(state, building.x * TILE_SIZE + 24, building.y * TILE_SIZE + 24, 'spark', '#3366ff')
  }
  building.isActive = true
}

function updateLab(state: GameState, building: Building) {
  for (const [, research] of state.research) {
    if (research.unlocked) continue
    if (!research.prerequisites.every(p => state.research.get(p)?.unlocked)) continue

    let hasPacks = true
    for (const cost of research.cost) {
      const slot = building.inventory.find(s => s.itemId === cost.itemId)
      if (!slot || slot.count < 1) { hasPacks = false; break }
    }
    if (!hasPacks) continue

    if (state.tick % 30 === 0) {
      for (const cost of research.cost) {
        removeItemFromBuilding(building, cost.itemId, 1)
        state.statistics.itemsConsumed[cost.itemId] = (state.statistics.itemsConsumed[cost.itemId] || 0) + 1
      }
      research.progress += 1
      if (research.progress >= research.time) {
        research.unlocked = true
        applyResearchEffects(state, research.id)
        grantXPToPlayer(state, 20)
        spawnParticle(state, building.x * TILE_SIZE + 24, building.y * TILE_SIZE + 24, 'spark', '#00ccff')
      }
    }
    building.isActive = true
    return
  }
  building.isActive = false
}

function updateRadar(state: GameState, building: Building) {
  // Radar skanuje tylko co 60 ticków (oszczędza 452 getTileAt na tick)
  if (state.tick % 60 !== 0) return
  const radius = 12
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue
      const tile = getTileAt(state, building.x + dx, building.y + dy)
      tile.visibility = 1
    }
  }
  building.isActive = true
}

function updateTurret(state: GameState, building: Building) {
  const range = 12
  let nearestEnemy: Enemy | null = null
  let nearestDistSq = Infinity

  for (const [, enemy] of state.enemies) {
    const dx = enemy.x - building.x
    const dy = enemy.y - building.y
    const distSq = dx * dx + dy * dy
    if (distSq < range * range && distSq < nearestDistSq) {
      nearestDistSq = distSq
      nearestEnemy = enemy
    }
  }

  if (nearestEnemy) {
    const dx = nearestEnemy.x - building.x
    const dy = nearestEnemy.y - building.y
    if (Math.abs(dx) > Math.abs(dy)) {
      building.direction = dx > 0 ? 'right' : 'left'
    } else {
      building.direction = dy > 0 ? 'down' : 'up'
    }

    const ammoSlot = building.inventory.find(s => s.itemId === 'ammo')
    if (ammoSlot && ammoSlot.count > 0 && state.tick % 20 === 0) {
      const turretMult = state.research.get('military')?.unlocked
        ? (state.research.get('military')!.effects.turretDamage || 1)
        : 1
      const damage = 15 * turretMult
      nearestEnemy.health -= damage
      removeItemFromBuilding(building, 'ammo', 1)
      spawnParticle(state, nearestEnemy.x * TILE_SIZE, nearestEnemy.y * TILE_SIZE, 'spark', '#ff3333')

      if (nearestEnemy.health <= 0) {
        state.enemies.delete(nearestEnemy.id)
        state.statistics.enemiesKilled++
        grantXPToPlayer(state, 8)
        spawnParticle(state, nearestEnemy.x * TILE_SIZE, nearestEnemy.y * TILE_SIZE, 'explosion', '#ff6600')
      }
    }
    building.isActive = true
  } else {
    building.isActive = false
  }
}

function updateLaserTurret(state: GameState, building: Building) {
  const range = 14
  let nearestEnemy: Enemy | null = null
  let nearestDistSq = Infinity

  for (const [, enemy] of state.enemies) {
    const dx = enemy.x - building.x
    const dy = enemy.y - building.y
    const distSq = dx * dx + dy * dy
    if (distSq < range * range && distSq < nearestDistSq) {
      nearestDistSq = distSq
      nearestEnemy = enemy
    }
  }

  if (nearestEnemy && building.energy > 5) {
    building.energy -= 2
    const damage = 25
    nearestEnemy.health -= damage
    spawnParticle(state, nearestEnemy.x * TILE_SIZE, nearestEnemy.y * TILE_SIZE, 'spark', '#00ffff')
    spawnParticle(state, building.x * TILE_SIZE + 16, building.y * TILE_SIZE + 4, 'spark', '#88ffff')

    if (nearestEnemy.health <= 0) {
      state.enemies.delete(nearestEnemy.id)
      state.statistics.enemiesKilled++
      grantXPToPlayer(state, 12)
      spawnParticle(state, nearestEnemy.x * TILE_SIZE, nearestEnemy.y * TILE_SIZE, 'explosion', '#00ffff')
    }
    building.isActive = true
  } else {
    building.isActive = false
  }
}

function updateFlakCannon(state: GameState, building: Building) {
  const range = 10
  let nearestEnemy: Enemy | null = null
  let nearestDistSq = Infinity

  // Flak prioritizes flying enemies
  for (const [, enemy] of state.enemies) {
    if (enemy.type !== 'destroyer' && enemy.type !== 'drone') continue
    const dx = enemy.x - building.x
    const dy = enemy.y - building.y
    const distSq = dx * dx + dy * dy
    if (distSq < range * range && distSq < nearestDistSq) {
      nearestDistSq = distSq
      nearestEnemy = enemy
    }
  }

  // Fall back to any enemy if no flyers
  if (!nearestEnemy) {
    for (const [, enemy] of state.enemies) {
      const dx = enemy.x - building.x
      const dy = enemy.y - building.y
      const distSq = dx * dx + dy * dy
      if (distSq < range * range && distSq < nearestDistSq) {
        nearestDistSq = distSq
        nearestEnemy = enemy
      }
    }
  }

  if (nearestEnemy && building.energy > 3) {
    building.energy -= 1
    const damage = 20
    nearestEnemy.health -= damage
    spawnParticle(state, nearestEnemy.x * TILE_SIZE, nearestEnemy.y * TILE_SIZE, 'explosion', '#ff4444')
    spawnParticle(state, building.x * TILE_SIZE + 16, building.y * TILE_SIZE + 4, 'spark', '#ff8800')

    if (nearestEnemy.health <= 0) {
      state.enemies.delete(nearestEnemy.id)
      state.statistics.enemiesKilled++
      grantXPToPlayer(state, 10)
      spawnParticle(state, nearestEnemy.x * TILE_SIZE, nearestEnemy.y * TILE_SIZE, 'explosion', '#ff6600')
    }
    building.isActive = true
  } else {
    building.isActive = false
  }
}

function updateMine(state: GameState, building: Building) {
  if (!building.isActive) return
  const triggerRange = 2

  for (const [, enemy] of state.enemies) {
    const dx = enemy.x - building.x
    const dy = enemy.y - building.y
    const dSq = dx * dx + dy * dy
    if (dSq <= triggerRange * triggerRange) {
      // Explode — damage all nearby enemies
      const explosionRange = 6
      for (const [, e] of state.enemies) {
        const edx = e.x - building.x
        const edy = e.y - building.y
        if (edx * edx + edy * edy <= explosionRange * explosionRange) {
          e.health -= 80
          if (e.health <= 0) {
            state.enemies.delete(e.id)
            state.statistics.enemiesKilled++
            grantXPToPlayer(state, 8)
          }
        }
      }
      spawnParticle(state, building.x * TILE_SIZE + 16, building.y * TILE_SIZE + 16, 'explosion', '#ff4400')
      const [mx, my] = [building.x, building.y]
      removeBuilding(state, mx, my)
      break
    }
  }
}

function updatePumpjack(state: GameState, building: Building) {
  let foundOil = false
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const tile = getTileAt(state, building.x + dx, building.y + dy)
      if (tile.resource === 'oil' && tile.resourceAmount > 0) {
        foundOil = true
        building.progress += state.player.miningSpeed
        if (building.progress >= 80) {
          building.progress = 0
          const outSlot = building.outputInventory.find(s => s.itemId === 'oil')
          if (outSlot && outSlot.count >= 50) { building.isActive = true; return }
          tile.resourceAmount -= 1
          if (tile.resourceAmount <= 0) tile.resource = null
          addItemToBuildingOutput(building, 'oil', 1)
          state.statistics.itemsProduced['oil'] = (state.statistics.itemsProduced['oil'] || 0) + 1
          spawnParticle(state, building.x * TILE_SIZE + 16, building.y * TILE_SIZE + 16, 'resource', RESOURCE_COLORS['oil'] || '#1a1a2e')
        }
        building.isActive = true
        return
      }
    }
  }
  building.isActive = foundOil
}

function updateRefinery(state: GameState, building: Building) {
  if (!building.recipe) {
    const oilSlot = building.inventory.find(s => s.itemId === 'oil')
    const lightOilSlot = building.inventory.find(s => s.itemId === 'light_oil')
    const heavyOilSlot = building.inventory.find(s => s.itemId === 'heavy_oil')

    if (oilSlot && oilSlot.count >= 5) {
      building.recipe = {
        id: 'oil_refining', name: 'Oil Refining',
        inputs: [{ itemId: 'oil', count: 5 }],
        outputs: [{ itemId: 'petroleum_gas', count: 3 }, { itemId: 'light_oil', count: 1 }, { itemId: 'heavy_oil', count: 1 }],
        craftTime: 120, energyCost: 2, category: 'oil_processing',
      }
    } else if (lightOilSlot && lightOilSlot.count >= 1) {
      building.recipe = {
        id: 'light_oil_cracking', name: 'Light Oil Cracking',
        inputs: [{ itemId: 'light_oil', count: 1 }],
        outputs: [{ itemId: 'petroleum_gas', count: 2 }],
        craftTime: 60, energyCost: 1, category: 'oil_processing',
      }
    } else if (heavyOilSlot && heavyOilSlot.count >= 1) {
      building.recipe = {
        id: 'heavy_oil_cracking', name: 'Heavy Oil Cracking',
        inputs: [{ itemId: 'heavy_oil', count: 1 }],
        outputs: [{ itemId: 'light_oil', count: 1 }, { itemId: 'petroleum_gas', count: 1 }],
        craftTime: 80, energyCost: 1, category: 'oil_processing',
      }
    }
  }

  if (!building.recipe) { building.isActive = false; return }

  for (const input of building.recipe.inputs) {
    const slot = building.inventory.find(s => s.itemId === input.itemId)
    if (!slot || slot.count < input.count) {
      building.recipe = null
      building.isActive = false
      return
    }
  }

  for (const output of building.recipe.outputs) {
    const outSlot = building.outputInventory.find(s => s.itemId === output.itemId)
    if (outSlot && outSlot.count >= 50) { building.isActive = false; return }
  }

  building.progress += state.player.craftingSpeed
  if (building.progress >= building.recipe.craftTime) {
    building.progress = 0
    for (const input of building.recipe.inputs) {
      removeItemFromBuilding(building, input.itemId, input.count)
      state.statistics.itemsConsumed[input.itemId] = (state.statistics.itemsConsumed[input.itemId] || 0) + input.count
    }
    for (const output of building.recipe.outputs) {
      addItemToBuildingOutput(building, output.itemId, output.count)
      state.statistics.itemsProduced[output.itemId] = (state.statistics.itemsProduced[output.itemId] || 0) + output.count
    }
    spawnParticle(state, building.x * TILE_SIZE + 24, building.y * TILE_SIZE + 24, 'smoke', '#4a6a8a')
    building.recipe = null
  }
  building.isActive = true
}

function updateChemicalPlant(state: GameState, building: Building) {
  if (!building.recipe) {
    for (const [, recipe] of Object.entries(RECIPES)) {
      if (recipe.category !== 'chemistry') continue
      const hasAllInputs = recipe.inputs.every(input => {
        const slot = building.inventory.find(s => s.itemId === input.itemId)
        return slot && slot.count >= input.count
      })
      if (hasAllInputs) {
        building.recipe = recipe
        break
      }
    }
  }

  if (!building.recipe) { building.isActive = false; return }

  let hasInputs = true
  for (const input of building.recipe.inputs) {
    const slot = building.inventory.find(s => s.itemId === input.itemId)
    if (!slot || slot.count < input.count) { hasInputs = false; break }
  }

  if (!hasInputs) {
    building.recipe = null
    building.isActive = false
    return
  }

  for (const output of building.recipe.outputs) {
    const outSlot = building.outputInventory.find(s => s.itemId === output.itemId)
    if (outSlot && outSlot.count >= 50) { building.isActive = false; return }
  }

  building.progress += state.player.craftingSpeed
  if (building.progress >= building.recipe.craftTime) {
    building.progress = 0
    for (const input of building.recipe.inputs) {
      removeItemFromBuilding(building, input.itemId, input.count)
      state.statistics.itemsConsumed[input.itemId] = (state.statistics.itemsConsumed[input.itemId] || 0) + input.count
    }
    for (const output of building.recipe.outputs) {
      addItemToBuildingOutput(building, output.itemId, output.count)
      state.statistics.itemsProduced[output.itemId] = (state.statistics.itemsProduced[output.itemId] || 0) + output.count
    }
    spawnParticle(state, building.x * TILE_SIZE + 16, building.y * TILE_SIZE + 16, 'smoke', '#6a4a8a')
    building.recipe = null
  }
  building.isActive = true
}

export function updatePowerGrid(state: GameState) {
  for (const [, building] of state.buildings) {
    if (building.type !== 'boiler') continue
    const coalSlot = building.inventory.find(s => s.itemId === 'coal')
    if (coalSlot && coalSlot.count > 0) {
      building.energy = Math.min(building.maxEnergy, building.energy + 1.2)
      if (state.tick % 90 === 0) {
        removeItemFromBuilding(building, 'coal', 1)
        state.statistics.itemsConsumed['coal'] = (state.statistics.itemsConsumed['coal'] || 0) + 1
        spawnParticle(state, building.x * TILE_SIZE + 16, building.y * TILE_SIZE, 'smoke', '#555')
      }
      building.isActive = true
    } else {
      building.isActive = false
    }
  }

  const boilers = Array.from(state.buildings.values()).filter(b => b.type === 'boiler' && b.energy > 0)
  for (const [, building] of state.buildings) {
    if (building.type !== 'steam_engine') continue
    let hasPower = false
    for (const other of boilers) {
      if (Math.abs(other.x - building.x) <= 10 && Math.abs(other.y - building.y) <= 10) {
        other.energy -= 0.2
        building.energy = Math.min(building.maxEnergy, building.energy + 0.3)
        hasPower = true
      }
    }
    building.isActive = hasPower
  }
}

export function applyResearchEffects(state: GameState, researchId: string) {
  const research = state.research.get(researchId)
  if (!research) return
  for (const [key, value] of Object.entries(research.effects)) {
    switch (key) {
      case 'miningSpeed': state.player.miningSpeed *= value; break
      case 'craftingSpeed': state.player.craftingSpeed *= value; break
      case 'playerSpeed': state.player.speed *= value; break
      case 'playerHealth': state.player.maxHealth *= value; state.player.health = state.player.maxHealth; break
    }
  }
}

export function updateProduction(state: GameState) {
  updatePowerGrid(state)

  for (const [, building] of state.buildings) {
    switch (building.type) {
      case 'miner': updateMiner(state, building); break
      case 'furnace': updateFurnace(state, building); break
      case 'assembler': updateAssembler(state, building); break
      case 'lab': updateLab(state, building); break
      case 'radar': updateRadar(state, building); break
      case 'turret': updateTurret(state, building); break
      case 'laser_turret': updateLaserTurret(state, building); break
      case 'flak_cannon': updateFlakCannon(state, building); break
      case 'mine': updateMine(state, building); break
      case 'pumpjack': updatePumpjack(state, building); break
      case 'refinery': updateRefinery(state, building); break
      case 'chemical_plant': updateChemicalPlant(state, building); break
    }
  }

  if (state.tick % 60 !== 0) return
  for (const [, building] of state.buildings) {
    if (building.outputInventory.length === 0) continue
    const item = building.outputInventory[0]
    if (!item || item.count <= 0) continue

    const neighbors = [
      { x: building.x - 1, y: building.y },
      { x: building.x + 1, y: building.y },
      { x: building.x, y: building.y - 1 },
      { x: building.x, y: building.y + 1 },
      { x: building.x + (BUILDING_SIZES[building.type]?.w || 1), y: building.y },
      { x: building.x, y: building.y + (BUILDING_SIZES[building.type]?.h || 1) },
    ]

    for (const nb of neighbors) {
      const tile = getTileAt(state, nb.x, nb.y)
      const nbBuilding = tile?.building
      if (!nbBuilding || nbBuilding === building) continue
      const accepted = getAcceptedItemTypes(nbBuilding.type)
      if (accepted === 'any' || (Array.isArray(accepted) && accepted.includes(item.itemId))) {
        const existingSlot = nbBuilding.inventory.find(s => s.itemId === item.itemId)
        const totalCount = existingSlot?.count ?? 0
        if (totalCount < 50) {
          removeItemFromBuildingOutput(building, item.itemId, 1)
          addItemToBuilding(nbBuilding, item.itemId, 1)
          break
        }
      }
    }
  }
}
