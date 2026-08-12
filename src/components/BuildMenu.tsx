import { useState } from 'react';
import { BUILDING_COLORS } from '../game/constants';
import { GameEngine } from '../game/engine';
import { getBuildingCost, canAffordBuilding } from '../game/systems';
import { GameState } from '../game/types';
import { t } from '../lib/i18n';

/** Props dla menu budowy — silnik, stan gry i callback zamknięcia. */
interface Props {
  engine: GameEngine;
  state: GameState;
  onClose: () => void;
}

const BUILDABLE_ITEMS = [
  { type: 'conveyor', name: 'buildingConveyorBelt', desc: 'Transports items', color: BUILDING_COLORS.conveyor, category: 'Logistics' },
  { type: 'inserter', name: 'buildingInserter', desc: 'Moves items to/from belts', color: BUILDING_COLORS.inserter, category: 'Logistics' },
  { type: 'splitter', name: 'buildingSplitter', desc: 'Splits belt into two lanes', color: BUILDING_COLORS.splitter, category: 'Logistics' },
  { type: 'underground_belt', name: 'buildingUndergroundBelt', desc: 'Routes under obstacles', color: BUILDING_COLORS.underground_belt, category: 'Logistics' },
  { type: 'pipe', name: 'buildingPipe', desc: 'Transports fluids', color: BUILDING_COLORS.pipe, category: 'Logistics' },
  { type: 'roboport', name: 'buildingRoboport', desc: 'Robot logistics hub', color: BUILDING_COLORS.roboport, category: 'Logistics' },
  { type: 'beacon', name: 'buildingBeacon', desc: 'Boosts nearby production', color: BUILDING_COLORS.beacon, category: 'Logistics' },
  { type: 'miner', name: 'buildingMiner', desc: 'Auto-mines resources', color: BUILDING_COLORS.miner, category: 'Production' },
  { type: 'furnace', name: 'buildingFurnace', desc: 'Smelts ores to plates', color: BUILDING_COLORS.furnace, category: 'Production' },
  { type: 'assembler', name: 'buildingAssembler', desc: 'Crafts items from recipes', color: BUILDING_COLORS.assembler, category: 'Production' },
  { type: 'centrifuge', name: 'buildingCentrifuge', desc: 'Processes uranium', color: BUILDING_COLORS.centrifuge, category: 'Production' },
  { type: 'pumpjack', name: 'buildingPumpjack', desc: 'Extracts crude oil', color: BUILDING_COLORS.pumpjack, category: 'Oil' },
  { type: 'refinery', name: 'buildingRefinery', desc: 'Refines oil into chemicals', color: BUILDING_COLORS.refinery, category: 'Oil' },
  { type: 'chemical_plant', name: 'buildingChemicalPlant', desc: 'Processes chemicals', color: BUILDING_COLORS.chemical_plant, category: 'Oil' },
  { type: 'pump', name: 'buildingPump', desc: 'Pumps water', color: BUILDING_COLORS.pump, category: 'Oil' },
  { type: 'boiler', name: 'buildingBoiler', desc: 'Burns coal for power', color: BUILDING_COLORS.boiler, category: 'Power' },
  { type: 'steam_engine', name: 'buildingSteamEngine', desc: 'Generates electricity', color: BUILDING_COLORS.steam_engine, category: 'Power' },
  { type: 'power_pole', name: 'buildingPowerPole', desc: 'Distributes electricity', color: BUILDING_COLORS.power_pole, category: 'Power' },
  { type: 'solar_panel', name: 'buildingSolarPanel', desc: 'Clean energy from sun', color: BUILDING_COLORS.solar_panel, category: 'Power' },
  { type: 'accumulator', name: 'buildingAccumulator', desc: 'Stores excess energy', color: BUILDING_COLORS.accumulator, category: 'Power' },
  { type: 'storage', name: 'buildingStorage', desc: 'Stores 48 item stacks', color: BUILDING_COLORS.storage, category: 'Storage' },
  { type: 'lab', name: 'buildingLab', desc: 'Researches technologies', color: BUILDING_COLORS.lab, category: 'Research' },
  { type: 'radar', name: 'buildingRadar', desc: 'Reveals map area', color: BUILDING_COLORS.radar, category: 'Research' },
  { type: 'silo', name: 'buildingSilo', desc: 'Rocket silo — victory building', color: BUILDING_COLORS.silo, category: 'Research' },
  { type: 'turret', name: 'buildingTurret', desc: 'Auto-attacks enemies', color: BUILDING_COLORS.turret, category: 'Defense' },
  { type: 'wall', name: 'buildingWall', desc: 'Blocks enemy movement', color: BUILDING_COLORS.wall, category: 'Defense' },
  { type: 'laser_turret', name: 'buildingLaserTurret', desc: 'Energy-powered laser', color: BUILDING_COLORS.laser_turret, category: 'Defense' },
  { type: 'flak_cannon', name: 'buildingFlakCannon', desc: 'Anti-air cannon', color: BUILDING_COLORS.flak_cannon, category: 'Defense' },
  { type: 'tesla_coil', name: 'buildingTeslaCoil', desc: 'Electric damage tower', color: BUILDING_COLORS.tesla_coil, category: 'Defense' },
  { type: 'mine', name: 'buildingMine', desc: 'Explodes when enemy steps on it', color: BUILDING_COLORS.mine, category: 'Defense' },
  { type: 'artillery', name: 'buildingArtillery', desc: 'Long-range bombardment', color: BUILDING_COLORS.artillery, category: 'Defense' },
];

const CATEGORIES = ['Logistics', 'Production', 'Oil', 'Power', 'Storage', 'Research', 'Defense'];
const CATEGORY_COLORS: Record<string, string> = {
  Logistics: '#c8890a', Production: '#1a7a45', Oil: '#7a5fa0',
  Power: '#c8a020', Storage: '#4a5a6a', Research: '#2a6080', Defense: '#8b2020',
};

const ITEM_NAMES: Record<string, string> = {
  iron: 'Iron', copper: 'Copper', stone: 'Stone', coal: 'Coal', wood: 'Wood',
  iron_plate: 'Iron Plate', copper_plate: 'Cu Plate', steel_plate: 'Steel Plate',
  gear: 'Gear', circuit: 'Circuit', ammo: 'Ammo',
  science_red: 'Red Sci', science_green: 'Green Sci', science_blue: 'Blue Sci',
  oil: 'Oil', uranium: 'Uranium',
};

const CATEGORY_KEYS: Record<string, string> = {
  Logistics: 'categoryLogistics',
  Production: 'categoryProduction',
  Oil: 'categoryOil',
  Power: 'categoryPower',
  Storage: 'categoryStorage',
  Research: 'categoryResearch',
  Defense: 'categoryDefense',
};

/** Menu budowy — lista wszystkich dostępnych budynków z kosztami, podział na kategorie i wyszukiwarkę. */
export default function BuildMenu({ engine, state, onClose }: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSelect = (type: string) => {
    if (!canAffordBuilding(state, type)) {
      engine.addNotification('Not enough resources!');
      return;
    }
    engine.selectedBuilding = type;
    engine.addNotification(`Selected: ${type.replace(/_/g, ' ')} (Q to rotate)`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="panel-glass rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 w-full sm:max-w-2xl sm:mx-4 max-h-[85vh] overflow-y-auto animate-slide-up font-exo"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 pb-3" style={{ borderBottom: '1px solid rgba(42,54,66,0.8)' }}>
          <div>
            <h2 className="font-orbitron font-bold text-lg text-white tracking-wider">{t('buildMenu')}</h2>
            <p className="text-xs text-white/30 mt-1">
              {t('directionLabel')} <span className="text-amber-400 font-semibold">{engine.selectedDirection.toUpperCase()}</span>
              <span className="text-white/20 ml-2">{t('qToRotate')}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all text-sm font-orbitron"
          >✕</button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('searchBuildings')}
            className="w-full px-3 py-2 text-xs rounded-lg outline-none font-exo"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(216,128,16,0.2)',
              color: 'rgba(255,255,255,0.8)',
              caretColor: '#d88010',
            }}
            autoFocus
          />
        </div>

        {CATEGORIES.map(category => {
          const q = searchQuery.toLowerCase();
          const items = BUILDABLE_ITEMS.filter(i => i.category === category && (
            !q || t(i.name).toLowerCase().includes(q) || i.desc.toLowerCase().includes(q) || i.type.includes(q)
          ));
          if (items.length === 0) return null;
          const catColor = CATEGORY_COLORS[category];
          return (
            <div key={category} className="mb-5">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: catColor, boxShadow: `0 0 6px ${catColor}` }} />
                <span className="text-[10px] font-orbitron tracking-[0.2em] uppercase" style={{ color: `${catColor}99` }}>{t(CATEGORY_KEYS[category] || category)}</span>
                <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${catColor}20, transparent)` }} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {items.map(item => {
                  const costs = getBuildingCost(item.type);
                  const affordable = canAffordBuilding(state, item.type);
                  const isSelected = engine.selectedBuilding === item.type;
                  return (
                    <button
                      key={item.type}
                      onClick={() => handleSelect(item.type)}
                      disabled={!affordable}
                      className="group p-3 rounded-xl text-left transition-all duration-150"
                      style={{
                        background: isSelected
                          ? `${item.color}15`
                          : affordable
                          ? 'rgba(255,255,255,0.025)'
                          : 'rgba(255,255,255,0.008)',
                        border: `1px solid ${isSelected ? `${item.color}50` : affordable ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)'}`,
                        opacity: affordable ? 1 : 0.4,
                        cursor: affordable ? 'pointer' : 'not-allowed',
                        boxShadow: isSelected ? `0 0 15px ${item.color}20` : 'none',
                      }}
                    >
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <div
                          className="w-8 h-8 rounded-lg flex-shrink-0"
                          style={{
                            backgroundColor: `${item.color}22`,
                            border: `1px solid ${item.color}44`,
                            boxShadow: `0 0 10px ${item.color}22`,
                          }}
                        >
                          <div className="w-full h-full rounded-lg" style={{ background: item.color, opacity: 0.7, borderRadius: 'inherit' }} />
                        </div>
                        <span className="text-sm font-medium text-white/85 leading-tight">{t(item.name)}</span>
                      </div>
                      <p className="text-white/25 text-[11px] leading-tight mb-1.5">{item.desc}</p>
                      <div className="flex flex-wrap gap-1">
                        {costs.map(c => {
                          const slot = state.player.inventory.find(s => s.itemId === c.itemId);
                          const have = slot ? slot.count : 0;
                          const enough = have >= c.count;
                          return (
                            <span
                              key={c.itemId}
                              className="text-[10px] px-1.5 py-0.5 rounded-md font-mono"
                              style={{
                                background: enough ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                color: enough ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)',
                                border: `1px solid ${enough ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                              }}
                            >
                              {ITEM_NAMES[c.itemId] || c.itemId} {have}/{c.count}
                            </span>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
