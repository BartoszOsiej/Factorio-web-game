import { GameState } from '../../game/types'

interface AchievementReward {
  premiumCurrency?: number
  gems?: number
  xp?: number
  item?: { itemId: string; count: number }
}

interface AchievementDef {
  id: string
  name: string
  description: string
  check: (state: GameState) => boolean
  reward: AchievementReward
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: 'first_mine',        name: 'First Strike',       description: 'Mine your first resource.',                                  check: s => Object.values(s.statistics.itemsProduced).some(v => v > 0) || s.statistics.buildingsPlaced > 0 || (s.player.inventory.find(i => i.itemId === 'iron')?.count ?? 50) < 50,  reward: { premiumCurrency: 2, xp: 5 } },
  { id: 'builder',           name: 'Builder',             description: 'Place 10 buildings.',                                         check: s => s.statistics.buildingsPlaced >= 10,                                              reward: { premiumCurrency: 3, gems: 1 } },
  { id: 'architect',         name: 'Architect',           description: 'Place 50 buildings.',                                         check: s => s.statistics.buildingsPlaced >= 50,                                              reward: { premiumCurrency: 5, gems: 2, xp: 20 } },
  { id: 'megamaker',         name: 'Megamaker',            description: 'Place 200 buildings.',                                       check: s => s.statistics.buildingsPlaced >= 200,                                             reward: { premiumCurrency: 10, gems: 3, xp: 50 } },
  { id: 'first_plate',       name: 'Ironworker',          description: 'Produce your first iron plate.',                              check: s => (s.statistics.itemsProduced['iron_plate'] || 0) >= 1,                            reward: { premiumCurrency: 2, xp: 5 } },
  { id: 'automation',        name: 'Automation Begins',   description: 'Produce 100 iron plates automatically.',                     check: s => (s.statistics.itemsProduced['iron_plate'] || 0) >= 100,                         reward: { premiumCurrency: 5, gems: 1, xp: 15 } },
  { id: 'steel_producer',    name: 'Steel Magnate',       description: 'Produce your first steel plate.',                             check: s => (s.statistics.itemsProduced['steel_plate'] || 0) >= 1,                          reward: { premiumCurrency: 3, xp: 10 } },
  { id: 'circuit_prod',      name: 'Circuitry',           description: 'Produce your first circuit.',                                 check: s => (s.statistics.itemsProduced['circuit'] || 0) >= 1,                              reward: { premiumCurrency: 3, xp: 10 } },
  { id: 'first_enemy',       name: 'First Blood',         description: 'Kill your first enemy.',                                      check: s => s.statistics.enemiesKilled >= 1,                                                 reward: { premiumCurrency: 2, gems: 1 } },
  { id: 'exterminator',      name: 'Exterminator',        description: 'Kill 25 enemies.',                                            check: s => s.statistics.enemiesKilled >= 25,                                                reward: { premiumCurrency: 5, gems: 2, xp: 20 } },
  { id: 'biter_hunter',      name: 'Biter Hunter',        description: 'Kill 100 enemies.',                                           check: s => s.statistics.enemiesKilled >= 100,                                               reward: { premiumCurrency: 10, gems: 3, xp: 50 } },
  { id: 'level5',            name: 'Seasoned',            description: 'Reach player level 5.',                                       check: s => s.player.level >= 5,                                                             reward: { premiumCurrency: 5, gems: 2 } },
  { id: 'level10',           name: 'Veteran',             description: 'Reach player level 10.',                                      check: s => s.player.level >= 10,                                                            reward: { premiumCurrency: 10, gems: 3, xp: 30 } },
  { id: 'level20',           name: 'Legend',              description: 'Reach player level 20.',                                      check: s => s.player.level >= 20,                                                            reward: { premiumCurrency: 20, gems: 5, xp: 100 } },
  { id: 'first_research',    name: 'Scientist',           description: 'Unlock your first technology.',                               check: s => [...s.research.values()].some(r => r.unlocked),                                   reward: { premiumCurrency: 3, xp: 10 } },
  { id: 'full_research',     name: 'Completionist',       description: 'Unlock all technologies.',                                    check: s => [...s.research.values()].every(r => r.unlocked),                                  reward: { premiumCurrency: 30, gems: 5, xp: 200 } },
  { id: 'power_grid',        name: 'Electrified',         description: 'Build a boiler and a steam engine.',                         check: s => [...s.buildings.values()].some(b => b.type === 'boiler') && [...s.buildings.values()].some(b => b.type === 'steam_engine'), reward: { premiumCurrency: 5, gems: 1, xp: 15 } },
  { id: 'oil_refinery',      name: 'Black Gold',          description: 'Build a pumpjack and a refinery.',                            check: s => [...s.buildings.values()].some(b => b.type === 'pumpjack') && [...s.buildings.values()].some(b => b.type === 'refinery'), reward: { premiumCurrency: 5, xp: 20 } },
  { id: 'turret_defense',    name: 'Fortified',           description: 'Build 10 turrets.',                                           check: s => [...s.buildings.values()].filter(b => b.type === 'turret').length >= 10,         reward: { premiumCurrency: 5, gems: 2, xp: 15 } },
  { id: 'wall_builder',      name: 'Great Wall',          description: 'Place 50 walls.',                                             check: s => [...s.buildings.values()].filter(b => b.type === 'wall').length >= 50,           reward: { premiumCurrency: 5, xp: 10 } },
  { id: 'rich',              name: 'Gem Collector',       description: 'Earn 50 gems.',                                               check: s => s.player.premiumCurrency >= 50,                                                   reward: { premiumCurrency: 10, gems: 5 } },
  { id: 'polluter',          name: 'Industrial Smog',     description: 'Reach 500 pollution.',                                        check: s => s.pollution >= 500,                                                               reward: { premiumCurrency: 3, xp: 10 } },
  { id: 'survivor',          name: 'Survivor',            description: 'Play for 30 minutes.',                                        check: s => s.statistics.timePlayed >= 60 * 30 * 60,                                          reward: { premiumCurrency: 5, gems: 1, xp: 30 } },
  { id: 'marathon',          name: 'Marathon',            description: 'Play for 2 hours.',                                           check: s => s.statistics.timePlayed >= 60 * 60 * 120,                                         reward: { premiumCurrency: 15, gems: 3, xp: 100 } },
  { id: 'conveyor_master',   name: 'Conveyor Master',     description: 'Place 100 conveyor belts.',                                   check: s => [...s.buildings.values()].filter(b => b.type === 'conveyor' || b.type === 'splitter' || b.type === 'underground_belt').length >= 100, reward: { premiumCurrency: 5, xp: 15 } },
  { id: 'inserter_army',     name: 'Inserter Army',       description: 'Place 50 inserters.',                                         check: s => [...s.buildings.values()].filter(b => b.type === 'inserter').length >= 50,       reward: { premiumCurrency: 5, xp: 10 } },
  { id: 'factory_floor',     name: 'Busy Factory',        description: 'Have 20 buildings active simultaneously.',                   check: s => [...s.buildings.values()].filter(b => b.isActive).length >= 20,                  reward: { premiumCurrency: 5, gems: 1, xp: 15 } },
  { id: 'rocket_launch',     name: 'To the Stars',        description: 'Complete all research and launch the rocket!',               check: s => s.statistics.timePlayed >= 60 * 60 * 60 && [...s.research.values()].every(r => r.unlocked), reward: { premiumCurrency: 50, gems: 10, xp: 500 } },
]

export function checkAchievements(state: GameState) {
  for (const def of ACHIEVEMENT_DEFS) {
    if (state.player.achievements.includes(def.id)) continue
    if (def.check(state)) {
      state.player.achievements.push(def.id)
      let msg = `🏆 Achievement: ${def.name} — ${def.description}`
      if (def.reward.premiumCurrency) {
        state.player.premiumCurrency += def.reward.premiumCurrency
        msg += ` +${def.reward.premiumCurrency} gems`
      }
      if (def.reward.gems) {
        state.player.gems += def.reward.gems
        msg += ` +${def.reward.gems}💎`
      }
      if (def.reward.xp) {
        state.player.xp += def.reward.xp
        while (state.player.xp >= state.player.level * 500) {
          state.player.xp -= state.player.level * 500
          state.player.level++
          state.player.premiumCurrency += 3
          state.player.gems += 1
          msg += ` Level Up! → ${state.player.level}`
        }
      }
      state.notifications.push({ text: msg, timer: 300 })
    }
  }
}

export const ACHIEVEMENT_CATALOG = ACHIEVEMENT_DEFS.map(({ id, name, description, reward }) => ({
  id, name, description,
  reward: {
    premiumCurrency: reward.premiumCurrency || 0,
    gems: reward.gems || 0,
    xp: reward.xp || 0,
  },
}))
