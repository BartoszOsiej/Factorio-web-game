import { GameState } from '../../game/types'

export type TutorialStepId =
  | 'welcome'
  | 'move'
  | 'open_inventory'
  | 'first_mine'
  | 'build_furnace'
  | 'smelt_iron'
  | 'build_assembler'
  | 'build_miner'
  | 'automate_iron'
  | 'build_boiler'
  | 'build_engine'
  | 'research'
  | 'build_turret'
  | 'survive_night'
  | 'complete'

interface TutorialCondition {
  type: 'mine' | 'build' | 'craft' | 'research' | 'kill' | 'inventory' | 'time' | 'move' | 'open_menu'
  target?: string
  count?: number
}

export interface TutorialStep {
  id: TutorialStepId
  message: string
  detail: string
  highlight?: string
  condition: TutorialCondition | null
  position?: 'top' | 'center' | 'bottom'
  autoProgress?: boolean
}


function step(id: TutorialStepId) {
  return {
    msg: (message: string) => ({
      detail: (detail: string) => ({
        highlight: (highlight: string) => ({
          waitFor: (condition: TutorialCondition | null): TutorialStep => ({
            id, message, detail, highlight, condition, position: 'center', autoProgress: false,
          }),
        }),
      }),
    }),
  }
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  step('welcome')
    .msg('🌍 Welcome to Novactorio!')
    .detail('This is your world. Build, mine, automate, survive. Let me guide you.')
    .highlight('')
    .waitFor({ type: 'move' }),

  step('move')
    .msg('🎮 WASD or Arrow Keys')
    .detail('Move your character around the world. Explore the terrain.')
    .highlight('')
    .waitFor({ type: 'move', count: 10 }),

  step('first_mine')
    .msg('⛏️ Mine Resources')
    .detail('Click on the brown iron ore patches on the ground to mine them. You need iron and copper.')
    .highlight('')
    .waitFor({ type: 'mine', target: 'iron', count: 5 }),

  step('open_inventory')
    .msg('📦 Inventory (I)')
    .detail('Press I to open your inventory and see what you collected. You can craft here.')
    .highlight('inventory')
    .waitFor({ type: 'open_menu', target: 'inventory' }),

  step('build_furnace')
    .msg('🔥 Build a Furnace')
    .detail('Press B to open the build menu. Select Furnace (costs 5 stone) and place it on the ground.')
    .highlight('build')
    .waitFor({ type: 'build', target: 'furnace' }),

  step('smelt_iron')
    .msg('⚙️ Smelt Iron Plates')
    .detail('Click on the furnace. Add iron ore to the input. It will smelt into iron plates automatically.')
    .highlight('')
    .waitFor({ type: 'craft', target: 'iron_plate', count: 5 }),

  step('build_miner')
    .msg('🏭 Automate Mining')
    .detail('Build a Miner (costs 10 iron plates + 5 gears) on top of iron ore. It mines automatically!')
    .highlight('build')
    .waitFor({ type: 'build', target: 'miner' }),

  step('build_assembler')
    .msg('🔧 Build an Assembler')
    .detail('Assemblers craft items automatically. Build one (costs 15 iron plates + 10 gears + 5 circuits).')
    .highlight('build')
    .waitFor({ type: 'build', target: 'assembler' }),

  step('automate_iron')
    .msg('♻️ Automate Iron Plates')
    .detail('Place an inserter to move iron from miner to furnace. Place another to move plates to storage.')
    .highlight('build')
    .waitFor({ type: 'craft', target: 'iron_plate', count: 50 }),

  step('build_boiler')
    .msg('⚡ Build a Boiler')
    .detail('You need power! Build a boiler (costs 10 iron plates). Feed it coal to generate steam.')
    .highlight('build')
    .waitFor({ type: 'build', target: 'boiler' }),

  step('build_engine')
    .msg('🔌 Build a Steam Engine')
    .detail('Place a steam engine next to the boiler. It converts steam into electricity for your factory.')
    .highlight('build')
    .waitFor({ type: 'build', target: 'steam_engine' }),

  step('research')
    .msg('🔬 Research (R)')
    .detail('Press R to open research. Start with Automation to unlock advanced buildings.')
    .highlight('research')
    .waitFor({ type: 'research' }),

  step('build_turret')
    .msg('🛡️ Defend Yourself')
    .detail('Biters are attracted to pollution. Build turrets and craft ammo to defend your factory.')
    .highlight('build')
    .waitFor({ type: 'build', target: 'turret' }),

  step('survive_night')
    .msg('🌙 Survive the Night')
    .detail('Night falls. Enemies become more aggressive. Make sure your defenses hold.')
    .highlight('')
    .waitFor({ type: 'time', count: 6000 }),

  step('complete')
    .msg('🏆 Tutorial Complete!')
    .detail('You now know the basics. Build your factory, research technologies, and thrive. The world is yours.')
    .highlight('')
    .waitFor(null),
]

export class TutorialEngine {
  private currentIndex = 0
  private stepStartTick = 0
  private previousCheck = ''
  onStep?: (step: TutorialStep, index: number, total: number) => void
  onComplete?: () => void
  active = true

  get currentStep(): TutorialStep | null {
    if (this.currentIndex >= TUTORIAL_STEPS.length) return null
    return TUTORIAL_STEPS[this.currentIndex]
  }

  get progress(): { current: number; total: number } {
    return { current: this.currentIndex, total: TUTORIAL_STEPS.length }
  }

  skip() {
    this.currentIndex = TUTORIAL_STEPS.length
    this.active = false
    this.onComplete?.()
  }

  update(state: GameState) {
    if (!this.active) return
    const step = this.currentStep
    if (!step || !step.condition) {
      if (step) {
        this.onStep?.(step, this.currentIndex, TUTORIAL_STEPS.length)
      }
      this.active = false
      this.onComplete?.()
      return
    }

    if (this.checkCondition(step.condition, state)) {
      this.currentIndex++
      this.stepStartTick = state.tick
      const next = this.currentStep
      if (next) {
        this.onStep?.(next, this.currentIndex, TUTORIAL_STEPS.length)
      } else {
        this.active = false
        this.onComplete?.()
      }
    } else if (this.currentIndex === 0 || this.stepStartTick === 0) {
      this.onStep?.(step, this.currentIndex, TUTORIAL_STEPS.length)
      this.stepStartTick = state.tick
    }
  }

  private checkCondition(c: TutorialCondition, state: GameState): boolean {
    switch (c.type) {
      case 'move': {
        const moved = Math.abs(state.player.x) + Math.abs(state.player.y)
        return moved >= (c.count || 5)
      }
      case 'mine': {
        const mined = c.target ? (state.statistics.itemsProduced[c.target] || 0) : Object.values(state.statistics.itemsProduced).reduce((a, b) => a + b, 0)
        return mined >= (c.count || 1)
      }
      case 'build': {
        const has = [...state.buildings.values()].some(b => !c.target || b.type === c.target)
        return c.target ? has : [...state.buildings.values()].length >= (c.count || 1)
      }
      case 'craft': {
        return (state.statistics.itemsProduced[c.target || ''] || 0) >= (c.count || 1)
      }
      case 'research': {
        return [...state.research.values()].some(r => r.unlocked)
      }
      case 'kill': {
        return state.statistics.enemiesKilled >= (c.count || 1)
      }
      case 'inventory': {
        if (c.target) {
          return (state.player.inventory.find(i => i.itemId === c.target)?.count || 0) >= (c.count || 1)
        }
        return state.player.inventory.length > 0
      }
      case 'time': {
        return state.tick >= (c.count || 100)
      }
      case 'open_menu': {
        return this.previousCheck.includes(c.target || '')
      }
      default:
        return false
    }
  }

  notifyMenuOpened(menu: string) {
    this.previousCheck = menu
  }
}
