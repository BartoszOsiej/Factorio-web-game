import { Direction, Building } from '../../game/types'

export const DIR_OFFSETS: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
}

export function getAcceptedItemTypes(buildingType: string): string[] | 'any' {
  switch (buildingType) {
    case 'furnace': return ['iron', 'copper', 'stone', 'iron_plate']
    case 'assembler': return 'any'
    case 'storage': return 'any'
    case 'lab': return ['science_red', 'science_green', 'science_blue']
    case 'boiler': return ['coal']
    case 'turret': return ['ammo']
    case 'flak_cannon': return ['ammo']
    case 'artillery': return ['ammo']
    case 'centrifuge': return ['uranium', 'iron', 'copper']
    case 'pumpjack': return []
    case 'refinery': return ['oil', 'light_oil', 'heavy_oil']
    case 'chemical_plant': return 'any'
    case 'pump': return []
    default: return []
  }
}

export function addItemToBuilding(building: Building, itemId: string, count: number) {
  const slot = building.inventory.find(s => s.itemId === itemId)
  if (slot) slot.count += count
  else building.inventory.push({ itemId, count })
}

export function addItemToBuildingOutput(building: Building, itemId: string, count: number) {
  const slot = building.outputInventory.find(s => s.itemId === itemId)
  if (slot) slot.count += count
  else building.outputInventory.push({ itemId, count })
}

export function removeItemFromBuilding(building: Building, itemId: string, count: number) {
  const slot = building.inventory.find(s => s.itemId === itemId)
  if (slot) {
    slot.count -= count
    if (slot.count <= 0) building.inventory = building.inventory.filter(s => s.count > 0)
  }
}

export function removeItemFromBuildingOutput(building: Building, itemId: string, count: number) {
  const slot = building.outputInventory.find(s => s.itemId === itemId)
  if (slot) {
    slot.count -= count
    if (slot.count <= 0) building.outputInventory = building.outputInventory.filter(s => s.count > 0)
  }
}
