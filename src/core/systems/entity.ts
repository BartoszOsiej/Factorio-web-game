import { GameState, Building, NPC, Enemy, EnemySpawner } from '../../game/types'
import { TILE_SIZE, NPC_MAX, ENEMY_MAX, SPAWNER_MAX, NPC_NAMES, NPC_DIALOGUES, ENEMY_STATS, BUILDING_SIZES } from '../../game/constants'
import { genId, getChunkAt } from './chunk'
import { placeBuilding, removeBuilding, grantXPToPlayer } from './economy'
import { spawnParticle } from './world'
import { addItemToBuilding, removeItemFromBuilding, removeItemFromBuildingOutput } from './helpers'

interface SupplyJob {
  srcId: string; srcX: number; srcY: number
  dstId: string; dstX: number; dstY: number
  itemId: string; amount: number
}

interface NPCState {
  supplyJob: SupplyJob | null
  supplyPhase: 'toSource' | 'toTarget' | null
}

const npcState = new Map<string, NPCState>()

function getNPCState(npc: NPC): NPCState {
  let s = npcState.get(npc.id)
  if (!s) {
    s = { supplyJob: null, supplyPhase: null }
    npcState.set(npc.id, s)
  }
  return s
}

export function spawnNPCs(state: GameState) {
  const effectiveMax = Math.min(NPC_MAX, 4 + Math.floor(state.statistics.buildingsPlaced / 20))
  if (state.npcs.size >= effectiveMax) return
  const buildings = Array.from(state.buildings.values())

  const typeRoll = Math.random()
  const type: NPC['type'] = typeRoll < 0.4 ? 'worker' : typeRoll < 0.55 ? 'guard' : typeRoll < 0.7 ? 'scout' : typeRoll < 0.85 ? 'trader' : 'settler'
  const home = buildings.length > 0 ? buildings[Math.floor(Math.random() * buildings.length)] : { x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20 }

  const npc: NPC = {
    id: genId(), type,
    x: (buildings.length > 0 ? home.x : 0) + (Math.random() - 0.5) * 12,
    y: (buildings.length > 0 ? home.y : 0) + (Math.random() - 0.5) * 12,
    targetX: buildings.length > 0 ? home.x : (Math.random() - 0.5) * 20,
    targetY: buildings.length > 0 ? home.y : (Math.random() - 0.5) * 20,
    health: 100, maxHealth: 100,
    speed: 0.09 + Math.random() * 0.04,
    state: 'idle', inventory: [],
    homeX: home.x, homeY: home.y,
    name: NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)],
    faction: 'colony',
    dialogue: NPC_DIALOGUES[type] || ['...'],
    taskTimer: Math.random() * 200, path: [], pathIndex: 0,
  }
  state.npcs.set(npc.id, npc)
}

function findSupplyJob(_state: GameState, buildingList: Building[]): SupplyJob | null {
  type Need = { building: Building; itemId: string; urgency: number }
  const needs: Need[] = []

  for (const b of buildingList) {
    switch (b.type) {
      case 'boiler': {
        const count = b.inventory.find(s => s.itemId === 'coal')?.count ?? 0
        if (count < 20) needs.push({ building: b, itemId: 'coal', urgency: 100 - count * 3 })
        break
      }
      case 'furnace': {
        for (const ore of ['iron', 'copper', 'stone']) {
          const count = b.inventory.find(s => s.itemId === ore)?.count ?? 0
          if (count < 15) needs.push({ building: b, itemId: ore, urgency: 60 - count * 2 })
        }
        const ipCount = b.inventory.find(s => s.itemId === 'iron_plate')?.count ?? 0
        if (ipCount < 10) needs.push({ building: b, itemId: 'iron_plate', urgency: 40 - ipCount * 2 })
        break
      }
      case 'assembler': {
        if (b.recipe) {
          for (const input of b.recipe.inputs) {
            const count = b.inventory.find(s => s.itemId === input.itemId)?.count ?? 0
            if (count < 10) needs.push({ building: b, itemId: input.itemId, urgency: 35 - count * 2 })
          }
        }
        break
      }
      case 'lab': {
        for (const sp of ['science_red', 'science_green', 'science_blue']) {
          const count = b.inventory.find(s => s.itemId === sp)?.count ?? 0
          if (count < 5) needs.push({ building: b, itemId: sp, urgency: 25 - count * 3 })
        }
        break
      }
      case 'turret': {
        const ammo = b.inventory.find(s => s.itemId === 'ammo')?.count ?? 0
        if (ammo < 10) needs.push({ building: b, itemId: 'ammo', urgency: 50 - ammo * 3 })
        break
      }
    }
  }

  needs.sort((a, b) => b.urgency - a.urgency)

  const sz = (type: string) => BUILDING_SIZES[type] || { w: 1, h: 1 }

  for (const need of needs) {
    let bestSrc: Building | null = null
    let bestCount = 0

    for (const src of buildingList) {
      if (src.id === need.building.id) continue
      const outSlot = src.outputInventory.find(s => s.itemId === need.itemId)
      if (outSlot && outSlot.count > bestCount) {
        bestSrc = src
        bestCount = outSlot.count
      }
      if (src.type === 'storage') {
        const inSlot = src.inventory.find(s => s.itemId === need.itemId)
        if (inSlot && inSlot.count > bestCount) {
          bestSrc = src
          bestCount = inSlot.count
        }
      }
    }

    if (bestSrc && bestCount > 0) {
      const srcSize = sz(bestSrc.type)
      const dstSize = sz(need.building.type)
      return {
        srcId: bestSrc.id,
        srcX: bestSrc.x + srcSize.w / 2,
        srcY: bestSrc.y + srcSize.h / 2,
        dstId: need.building.id,
        dstX: need.building.x + dstSize.w / 2,
        dstY: need.building.y + dstSize.h / 2,
        itemId: need.itemId,
        amount: Math.min(bestCount, 8),
      }
    }
  }
  return null
}

export function updateNPCs(state: GameState) {
  const buildingList = Array.from(state.buildings.values())

  for (const task of state.buildQueue) {
    if (task.assignedNpcId && !state.npcs.has(task.assignedNpcId)) {
      task.assignedNpcId = undefined
    }
  }

  for (const [, npc] of state.npcs) {
    npc.taskTimer--

    if (npc.type === 'guard') {
      let nearestEnemy: Enemy | null = null
      let nearestDist = Infinity
      for (const [, enemy] of state.enemies) {
        const d = Math.sqrt((enemy.x - npc.x) ** 2 + (enemy.y - npc.y) ** 2)
        if (d < nearestDist) { nearestDist = d; nearestEnemy = enemy }
      }
      if (nearestEnemy && nearestDist < 14) {
        const dx = nearestEnemy.x - npc.x
        const dy = nearestEnemy.y - npc.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 1.5) {
          npc.x += (dx / dist) * npc.speed * 1.3
          npc.y += (dy / dist) * npc.speed * 1.3
        } else if (state.tick % 30 === 0) {
          nearestEnemy.health -= 5
          spawnParticle(state, nearestEnemy.x * TILE_SIZE, nearestEnemy.y * TILE_SIZE, 'spark', '#ff4444')
          if (nearestEnemy.health <= 0) {
            state.enemies.delete(nearestEnemy.id)
            state.statistics.enemiesKilled++
            grantXPToPlayer(state, 5)
            spawnParticle(state, nearestEnemy.x * TILE_SIZE, nearestEnemy.y * TILE_SIZE, 'explosion', '#ff6600')
          }
        }
        continue
      }
    }

    if (npc.type !== 'guard') {
      let nearEnemy = false
      for (const [, enemy] of state.enemies) {
        const d = Math.sqrt((enemy.x - npc.x) ** 2 + (enemy.y - npc.y) ** 2)
        if (d < 10) { nearEnemy = true; break }
      }
      if (nearEnemy) {
        npc.state = 'fleeing'
        npc.taskTimer = 300
      }
    }

    switch (npc.state) {
      case 'idle': {
        if (npc.taskTimer > 0) break

        if (npc.type === 'worker') {
          const freeTask = state.buildQueue.find(q => !q.assignedNpcId)
          if (freeTask) {
            freeTask.assignedNpcId = npc.id
            npc.state = 'working'
            npc.taskTimer = 1800
            break
          }
          const sJob = findSupplyJob(state, buildingList)
          if (sJob) {
            const s = getNPCState(npc)
            s.supplyJob = sJob
            s.supplyPhase = 'toSource'
            npc.targetX = sJob.srcX
            npc.targetY = sJob.srcY
            npc.state = 'working'
            npc.taskTimer = 700
            break
          }
          npc.targetX = npc.homeX + (Math.random() - 0.5) * 16
          npc.targetY = npc.homeY + (Math.random() - 0.5) * 16
          npc.state = 'moving'
          npc.taskTimer = 150 + Math.random() * 200
        } else if (npc.type === 'guard') {
          npc.state = 'patrolling'
          const anchor = buildingList.length > 0
            ? buildingList[Math.floor(Math.random() * Math.min(buildingList.length, 5))]
            : { x: npc.homeX, y: npc.homeY }
          npc.targetX = anchor.x + (Math.random() - 0.5) * 14
          npc.targetY = anchor.y + (Math.random() - 0.5) * 14
          npc.taskTimer = 200 + Math.random() * 300
        } else if (npc.type === 'scout') {
          npc.state = 'moving'
          npc.targetX = npc.x + (Math.random() - 0.5) * 40
          npc.targetY = npc.y + (Math.random() - 0.5) * 40
          npc.taskTimer = 200 + Math.random() * 300
        } else if (npc.type === 'trader') {
          npc.state = 'trading'
          npc.targetX = state.player.x + (Math.random() - 0.5) * 4
          npc.targetY = state.player.y + (Math.random() - 0.5) * 4
          npc.taskTimer = 200 + Math.random() * 300
        } else {
          npc.state = 'gathering'
          npc.targetX = npc.homeX + (Math.random() - 0.5) * 20
          npc.targetY = npc.homeY + (Math.random() - 0.5) * 20
          npc.taskTimer = 200 + Math.random() * 300
        }
        break
      }

      case 'moving':
      case 'patrolling':
      case 'gathering': {
        const dx = npc.targetX - npc.x
        const dy = npc.targetY - npc.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0.5) {
          const step = Math.min(npc.speed, dist)
          npc.x += (dx / dist) * step
          npc.y += (dy / dist) * step
        } else {
          npc.x = Math.round(npc.x)
          npc.y = Math.round(npc.y)
          npc.state = 'idle'
          npc.taskTimer = 40 + Math.random() * 80
        }
        break
      }

      case 'working': {
        const myTask = state.buildQueue.find(q => q.assignedNpcId === npc.id)
        const freeTask2 = !myTask ? state.buildQueue.find(q => !q.assignedNpcId) : null
        const buildTask = myTask || freeTask2
        if (buildTask) {
          if (!myTask) buildTask.assignedNpcId = npc.id
          const dx = buildTask.x - npc.x
          const dy = buildTask.y - npc.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > 1.5) {
            npc.x += (dx / dist) * npc.speed
            npc.y += (dy / dist) * npc.speed
          } else {
            buildTask.constructionProgress += 1.2
            if (buildTask.constructionProgress >= 100) {
              const placed = placeBuilding(state, buildTask.type, buildTask.x, buildTask.y, buildTask.direction, true)
              if (placed) {
                state.buildQueue = state.buildQueue.filter(q => q.id !== buildTask.id)
                spawnParticle(state, buildTask.x * TILE_SIZE + 16, buildTask.y * TILE_SIZE + 16, 'spark', '#88ffcc')
                npc.state = 'idle'
                npc.taskTimer = 30
              } else {
                buildTask.constructionProgress = 80
                npc.taskTimer = 60
              }
            }
          }
          if (npc.taskTimer <= 0) {
            if (buildTask.assignedNpcId === npc.id) buildTask.assignedNpcId = undefined
            npc.state = 'idle'
            npc.taskTimer = 60
          }
          break
        }

        const s = getNPCState(npc)
        const sJob = s.supplyJob
        if (sJob) {
          if (s.supplyPhase === 'toSource') {
            const dx = sJob.srcX - npc.x
            const dy = sJob.srcY - npc.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > 1.5) {
              npc.x += (dx / dist) * npc.speed
              npc.y += (dy / dist) * npc.speed
            } else {
              const src = buildingList.find(b => b.id === sJob.srcId)
              if (src) {
                let picked = 0
                const outSlot = src.outputInventory.find(s => s.itemId === sJob.itemId)
                if (outSlot && outSlot.count > 0) {
                  const take = Math.min(sJob.amount, outSlot.count)
                  removeItemFromBuildingOutput(src, sJob.itemId, take)
                  picked = take
                } else if (src.type === 'storage') {
                  const inSlot = src.inventory.find(s => s.itemId === sJob.itemId)
                  if (inSlot && inSlot.count > 0) {
                    const take = Math.min(sJob.amount, inSlot.count)
                    removeItemFromBuilding(src, sJob.itemId, take)
                    picked = take
                  }
                }
                if (picked > 0) {
                  const existNpc = npc.inventory.find(s => s.itemId === sJob.itemId)
                  if (existNpc) existNpc.count += picked
                  else npc.inventory.push({ itemId: sJob.itemId, count: picked })
                  s.supplyPhase = 'toTarget'
                  npc.targetX = sJob.dstX
                  npc.targetY = sJob.dstY
                } else {
                  s.supplyJob = null
                  npc.state = 'idle'
                  npc.taskTimer = 30
                }
              } else {
                s.supplyJob = null
                npc.state = 'idle'
                npc.taskTimer = 30
              }
            }
          } else if (s.supplyPhase === 'toTarget') {
            const dx = sJob.dstX - npc.x
            const dy = sJob.dstY - npc.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > 1.5) {
              npc.x += (dx / dist) * npc.speed
              npc.y += (dy / dist) * npc.speed
            } else {
              const dst = buildingList.find(b => b.id === sJob.dstId)
              if (dst) {
                for (const inv of npc.inventory) {
                  addItemToBuilding(dst, inv.itemId, inv.count)
                }
              }
              npc.inventory = []
              s.supplyJob = null
              npc.state = 'idle'
              npc.taskTimer = 30
            }
          }
          if (npc.taskTimer <= 0) {
            npc.inventory = []
            s.supplyJob = null
            npc.state = 'idle'
            npc.taskTimer = 60
          }
          break
        }

        npc.state = 'idle'
        npc.taskTimer = 30
        break
      }

      case 'trading': {
        const dx = state.player.x - npc.x
        const dy = state.player.y - npc.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 4) {
          npc.x += (dx / dist) * npc.speed
          npc.y += (dy / dist) * npc.speed
        }
        if (npc.taskTimer <= 0) {
          npc.state = 'idle'
          npc.taskTimer = 60
        }
        break
      }

      case 'fleeing': {
        let fleeDx = 0, fleeDy = 0
        let enemyCount = 0
        for (const [, enemy] of state.enemies) {
          const d = Math.sqrt((enemy.x - npc.x) ** 2 + (enemy.y - npc.y) ** 2)
          if (d < 15) {
            fleeDx -= (enemy.x - npc.x) / (d + 0.001)
            fleeDy -= (enemy.y - npc.y) / (d + 0.001)
            enemyCount++
          }
        }
        if (enemyCount === 0 || npc.taskTimer <= 0) {
          for (const task of state.buildQueue) {
            if (task.assignedNpcId === npc.id) {
              task.assignedNpcId = undefined
              task.constructionProgress = Math.max(0, task.constructionProgress - 20)
            }
          }
          npc.state = 'idle'
          npc.taskTimer = 60
        } else {
          const len = Math.sqrt(fleeDx * fleeDx + fleeDy * fleeDy) || 1
          npc.x += (fleeDx / len) * npc.speed * 1.4
          npc.y += (fleeDy / len) * npc.speed * 1.4
          npc.taskTimer--
        }
        break
      }
    }
  }
}

export function spawnEnemies(state: GameState) {
  if (state.enemies.size >= ENEMY_MAX) return

  for (const [, spawner] of state.spawners) {
    spawner.spawnTimer--
    if (spawner.spawnTimer <= 0) {
      spawner.spawnTimer = Math.max(60, spawner.spawnRate) * (state.evolution < 0.1 ? 2.5 : 1)
      // Spawn different types based on evolution level
      const types: Enemy['type'][] = ['biter', 'spitter']
      if (state.evolution > 0.3) types.push('biter', 'spitter') // more biters/spitters
      if (state.evolution > 0.5) types.push('behemoth')
      if (state.evolution > 0.7) types.push('destroyer')
      if (state.evolution > 0.9) types.push('leviathan', 'drone')
      // Occasional worm
      if (Math.random() < 0.1) types.push('worm')
      const type = types[Math.floor(Math.random() * types.length)]
      const stats = ENEMY_STATS[type]
      const evo = state.evolution

      const enemy: Enemy = {
        id: genId(), type,
        x: spawner.x + (Math.random() - 0.5) * 4,
        y: spawner.y + (Math.random() - 0.5) * 4,
        health: stats.health * (1 + evo), maxHealth: stats.health * (1 + evo),
        attack: stats.attack * (1 + evo * 0.5), speed: stats.speed * (1 + evo * 0.2),
        range: stats.range, target: null, evolution: evo,
        state: 'moving', attackCooldown: 0, spawnerId: spawner.id,
      }
      state.enemies.set(enemy.id, enemy)
      spawner.enemies.push(enemy.id)
    }
  }

  if (state.spawners.size < SPAWNER_MAX && (state.tick % 600 === 0 || (state.tick === 1200 && state.spawners.size === 0))) {
    const angle = Math.random() * Math.PI * 2
    const dist = 30 + Math.random() * 40
    const sx = Math.floor(state.player.x + Math.cos(angle) * dist)
    const sy = Math.floor(state.player.y + Math.sin(angle) * dist)

    const spawner: EnemySpawner = {
      id: genId(), x: sx, y: sy,
      health: 300 * (1 + state.evolution), maxHealth: 300 * (1 + state.evolution),
      spawnTimer: 300, spawnRate: Math.max(60, 300 - state.evolution * 100),
      evolution: state.evolution, enemies: [],
    }
    state.spawners.set(spawner.id, spawner)
    getChunkAt(state, sx, sy)
  }
}

export function updateEnemies(state: GameState) {
  for (const [, enemy] of state.enemies) {
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - 1)

    let targetX = state.player.x
    let targetY = state.player.y
    const pdx = enemy.x - state.player.x
    const pdy = enemy.y - state.player.y
    let targetDistSq = pdx * pdx + pdy * pdy

    // Type-specific behavior
    const isFlying = enemy.type === 'destroyer' || enemy.type === 'drone'
    const isLeviathan = enemy.type === 'leviathan'

    // Drones swarm toward other drones
    if (enemy.type === 'drone') {
      for (const [, other] of state.enemies) {
        if (other.id !== enemy.id && other.type === 'drone') {
          const sdx = other.x - enemy.x
          const sdy = other.y - enemy.y
          const sdSq = sdx * sdx + sdy * sdy
          if (sdSq > 4 && sdSq < 100) {
            // Slight attraction to nearby drones
            const sdist = Math.sqrt(sdSq)
            enemy.x += (sdx / sdist) * 0.01
            enemy.y += (sdy / sdist) * 0.01
          }
        }
      }
    }

    for (const [, building] of state.buildings) {
      const dx = enemy.x - building.x
      const dy = enemy.y - building.y
      const dSq = dx * dx + dy * dy
      if (dSq < targetDistSq && dSq < 625) {
        targetDistSq = dSq
        targetX = building.x
        targetY = building.y
      }
    }

    const effectiveRange = isLeviathan ? enemy.range * 1.5 : enemy.range

    if (targetDistSq > effectiveRange ** 2) {
      const dx = targetX - enemy.x
      const dy = targetY - enemy.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 0.1) {
        const moveSpeed = enemy.speed * 0.04
        if (isFlying) {
          // Flyers move faster and more directly
          enemy.x += (dx / dist) * moveSpeed * 1.3
          enemy.y += (dy / dist) * moveSpeed * 1.3
        } else {
          enemy.x += (dx / dist) * moveSpeed
          enemy.y += (dy / dist) * moveSpeed
        }
        enemy.state = 'moving'
      }
    } else {
      enemy.state = 'attacking'
      if (enemy.attackCooldown <= 0) {
        // Leviathan has longer cooldown but area damage
        enemy.attackCooldown = isLeviathan ? 80 : 55

        const playerDistSq = (enemy.x - state.player.x) ** 2 + (enemy.y - state.player.y) ** 2
        if (playerDistSq <= effectiveRange * effectiveRange) {
          state.player.health -= enemy.attack
          spawnParticle(state, state.player.x * TILE_SIZE, state.player.y * TILE_SIZE, 'spark', '#ff0000')
          // Leviathan area damage
          if (isLeviathan && playerDistSq < 4) {
            state.player.health -= enemy.attack * 0.3
          }
        }

        for (const [key, building] of state.buildings) {
          const dx = enemy.x - building.x
          const dy = enemy.y - building.y
          const dSq = dx * dx + dy * dy
          const rangePlus = effectiveRange + 0.5
          if (dSq <= rangePlus * rangePlus) {
            building.health -= enemy.attack
            spawnParticle(state, building.x * TILE_SIZE, building.y * TILE_SIZE, 'spark', '#ff6600')
            // Leviathan area damage
            if (isLeviathan) {
              for (const [bk, bv] of state.buildings) {
                if (bk !== key) {
                  const adx = enemy.x - bv.x
                  const ady = enemy.y - bv.y
                  const aSq = adx * adx + ady * ady
                  if (aSq < 4) {
                    bv.health -= enemy.attack * 0.2
                    if (bv.health <= 0) {
                      const [bbx, bby] = bk.split(',').map(Number)
                      removeBuilding(state, bbx, bby)
                    }
                  }
                }
              }
            }
            if (building.health <= 0) {
              const [bx, by] = key.split(',').map(Number)
              removeBuilding(state, bx, by)
              spawnParticle(state, building.x * TILE_SIZE, building.y * TILE_SIZE, 'explosion', '#ff6600')
            }
            break
          }
        }
      }
    }

    if (enemy.health <= 0) {
      state.enemies.delete(enemy.id)
      state.statistics.enemiesKilled++
      grantXPToPlayer(state, 8)
      spawnParticle(state, enemy.x * TILE_SIZE, enemy.y * TILE_SIZE, 'explosion', '#ff6600')
    }
  }
}
