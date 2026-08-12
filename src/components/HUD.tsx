import { useRef, useEffect, useState } from 'react';
import { GameState } from '../game/types';
import { BUILDING_COLORS, RESOURCE_COLORS } from '../game/constants';
import { t } from '../lib/i18n';

/** Props HUD — stan gry i lista aktywnych powiadomień. */
interface Props {
  state: GameState;
  notifications: { text: string; timer: number; type?: string }[];
}



/** Heads-Up Display — pasek stanu gracza (health, XP, poziom), pasek dnia/nocy, minimap, powiadomienia, hotbar ekwipunku. */
export default function HUD({ state, notifications }: Props) {
  const dayProgress = state.dayTime / state.dayLength;
  const isDay = dayProgress > 0.25 && dayProgress < 0.75;
  const hpPct = (state.player.health / state.player.maxHealth) * 100;
  const xpPct = (state.player.xp / (state.player.level * 100)) * 100;

  const hpColor = hpPct > 50
    ? 'from-emerald-500 to-green-400'
    : hpPct > 25
    ? 'from-amber-500 to-yellow-400'
    : 'from-red-600 to-red-400';

  const hpGlow = hpPct > 50 ? 'bar-glow-green' : hpPct > 25 ? 'bar-glow-amber' : 'bar-glow-red';

  const isMobile = window.innerWidth < 768;
  const [hintsVisible, setHintsVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setHintsVisible(false), 30000);
    return () => clearTimeout(t);
  }, []);

  if (isMobile) {
    return (
      <div className="fixed top-0 left-0 right-0 pointer-events-none z-10 font-exo">
        {/* Top status bar */}
        <div className="flex items-center justify-between px-3 py-2" style={{
          background: 'linear-gradient(to bottom, rgba(7,9,11,0.94) 0%, transparent 100%)',
        }}>
          {/* Left: HP + XP */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px]" style={{ color: hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#f59e0b' : '#ef4444' }}>❤</span>
              <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className={`h-full rounded-full bg-gradient-to-r ${hpColor} transition-all`} style={{ width: `${hpPct}%` }} />
              </div>
              <span className="text-[9px] text-white/40 font-mono">{Math.ceil(state.player.health)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-indigo-400">⚡</span>
              <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-all" style={{ width: `${xpPct}%` }} />
              </div>
              <span className="text-[9px] text-violet-400/80 font-mono">Lv{state.player.level}</span>
            </div>
          </div>

          {/* Center: Day/Evol */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-orbitron" style={{ color: isDay ? '#fbbf24' : '#818cf8' }}>
              {isDay ? `☀ ${t('hudDay')}` : `🌙 ${t('hudNight')}`}
            </span>
            <span className="text-[8px] text-orange-400/70 font-mono">{t('hudEvol')} {(state.evolution * 100).toFixed(1)}%</span>
          </div>

          {/* Right: Resources (top 5) */}
          <div className="flex flex-col gap-0.5 items-end">
            {state.player.inventory.slice(0, 5).map((slot, i) => (
              <div key={i} className="flex items-center gap-1 px-1.5 py-0.5 rounded" style={{
                background: 'rgba(6,10,18,0.8)',
                border: `1px solid ${RESOURCE_COLORS[slot.itemId] || '#888'}33`,
              }}>
                <div className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: RESOURCE_COLORS[slot.itemId] || '#888' }} />
                <span className="text-[9px] text-white/70 font-mono tabular-nums">{slot.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="absolute top-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 w-full px-4">
          {notifications.slice(0, 2).map((n, i) => {
            const notifColor = n.type === 'error' ? '#f87171' : n.type === 'success' ? '#4ade80' : n.type === 'build' ? '#38bdf8' : 'rgba(205,197,178,0.9)';
            return (
              <div key={i} className="px-3 py-1.5 text-xs font-exo rounded-lg text-center w-full max-w-xs"
                style={{
                  background: 'rgba(10,14,20,0.9)',
                  border: '1px solid rgba(216,128,16,0.2)',
                  color: notifColor,
                  opacity: Math.min(1, n.timer / 30),
                }}
              >
                {n.text}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 pointer-events-none z-10 font-exo">
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{
          background: 'linear-gradient(to bottom, rgba(7,9,11,0.96) 0%, rgba(7,9,11,0.6) 70%, transparent 100%)',
          borderBottom: 'none',
        }}
      >
        {/* Left: Health, XP, Currency, Time */}
        <div className="flex items-center gap-3">
          {/* HP */}
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill={hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#f59e0b' : '#ef4444'} className="flex-shrink-0" style={{ filter: `drop-shadow(0 0 4px ${hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#f59e0b' : '#ef4444'})` }}>
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <div className="w-24 h-2 hud-bar">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${hpColor} ${hpGlow} transition-all duration-500`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
            <span className="text-[10px] text-white/40 font-mono tabular-nums w-14">
              {Math.ceil(state.player.health)}<span className="text-white/20">/{state.player.maxHealth}</span>
            </span>
          </div>

          {/* XP */}
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" className="flex-shrink-0" style={{ filter: 'drop-shadow(0 0 4px #818cf8)' }}>
              <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
            </svg>
            <div className="w-24 h-2 hud-bar">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 bar-glow-blue transition-all duration-500"
                style={{ width: `${xpPct}%` }}
              />
            </div>
            <span className="text-[10px] text-white/40 font-mono">
              <span className="text-violet-400/80">Lv{state.player.level}</span>
            </span>
          </div>

          {/* Gems */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
            <span className="text-cyan-400 text-xs font-bold" style={{ filter: 'drop-shadow(0 0 4px #06b6d4)' }}>💎</span>
            <span className="text-[11px] text-cyan-300/80 font-mono tabular-nums">{state.player.gems}</span>
          </div>

          {/* Day/Night */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md" style={{ background: 'rgba(6,10,18,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
            {isDay ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#fbbf24" style={{ filter: 'drop-shadow(0 0 4px #fbbf24)' }}>
                <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" stroke="#fbbf24" strokeWidth="2" /><line x1="12" y1="21" x2="12" y2="23" stroke="#fbbf24" strokeWidth="2" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="#fbbf24" strokeWidth="2" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="#fbbf24" strokeWidth="2" /><line x1="1" y1="12" x2="3" y2="12" stroke="#fbbf24" strokeWidth="2" /><line x1="21" y1="12" x2="23" y2="12" stroke="#fbbf24" strokeWidth="2" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#818cf8" style={{ filter: 'drop-shadow(0 0 4px #818cf8)' }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
            <span className="text-[10px] font-orbitron" style={{ color: isDay ? '#fbbf24' : '#818cf8' }}>
              {isDay ? t('hudDay') : t('hudNight')}
            </span>
          </div>

          {/* Weather */}
          <span className="text-[10px] text-white/25 font-exo capitalize">{state.weather}</span>
        </div>

        {/* Center: Key metrics */}
        <div className="flex items-center gap-4">
          <MetricBadge label={t('hudTick')} value={state.tick.toString()} />
          <MetricBadge label={t('hudEvol')} value={`${(state.evolution * 100).toFixed(1)}%`} color="#f97316" glow="rgba(249,115,22,0.4)" />
          <MetricBadge label={t('hudSmog')} value={state.pollution.toFixed(0)} color="#eab308" glow="rgba(234,179,8,0.4)" />
        </div>

        {/* Right: Resources */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-xs">
          {state.player.inventory.slice(0, 8).map((slot, i) => (
            <div
              key={i}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors"
              style={{
                background: 'rgba(6,10,18,0.7)',
                border: `1px solid ${RESOURCE_COLORS[slot.itemId] || '#888'}22`,
              }}
            >
              <div
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{
                  backgroundColor: RESOURCE_COLORS[slot.itemId] || '#888',
                  boxShadow: `0 0 4px ${RESOURCE_COLORS[slot.itemId] || '#888'}`,
                }}
              />
              <span className="text-[10px] text-white/60 font-mono tabular-nums">{slot.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="absolute top-14 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none" style={{ minWidth: 260 }}>
        {[...notifications].reverse().map((n, i) => {
          const notifColor = n.type === 'error'
            ? { border: '1px solid rgba(239,68,68,0.3)', text: '#f87171', icon: '✕' }
            : n.type === 'success'
            ? { border: '1px solid rgba(34,197,94,0.3)', text: '#4ade80', icon: '✓' }
            : n.type === 'build'
            ? { border: '1px solid rgba(56,189,248,0.3)', text: '#38bdf8', icon: '🔨' }
            : { border: '1px solid rgba(216,128,16,0.2)', text: 'rgba(205,197,178,0.9)', icon: '▶' };
          return (
            <div
              key={i}
              className="px-5 py-2 text-sm font-exo rounded-lg notify-enter"
              style={{
                background: 'linear-gradient(180deg, #111820 0%, #0c1016 100%)',
                border: notifColor.border,
                boxShadow: 'inset 0 1px 0 rgba(216,128,16,0.06), 0 4px 20px rgba(0,0,0,0.7)',
                color: notifColor.text,
                opacity: Math.min(1, n.timer / 30),
                backdropFilter: 'blur(10px)',
                transform: `translateX(-50%)`,
                position: 'relative',
                left: '50%',
              }}
            >
              <span className="mr-2" style={{ color: notifColor.text }}>{notifColor.icon}</span>{n.text}
            </div>
          );
        })}
      </div>

      {/* Minimap */}
      <div
        className="absolute top-14 right-4 w-44 h-44 rounded-xl overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(188deg, #111820 0%, #0c1016 100%)',
          border: '1px solid rgba(216,128,16,0.18)',
          borderTop: '1px solid rgba(216,128,16,0.35)',
          boxShadow: 'inset 0 1px 0 rgba(216,128,16,0.06), 0 0 0 1px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="absolute top-1 left-2 text-[8px] font-orbitron text-white/20 tracking-widest z-10">{t('hudMap')}</div>
        <Minimap state={state} />
      </div>

      {/* Weather indicator */}
      {state.weather && state.weather !== 'clear' && (
        <div
          className="absolute top-40 right-4 rounded-lg px-2 py-1 text-[10px] font-orbitron tracking-wider"
          style={{
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: state.weather === 'storm' ? '#ff6666' : state.weather === 'snow' ? '#aaddff' : state.weather === 'fog' ? '#aabbcc' : '#88aaff',
          }}
        >
          {state.weather === 'rain' && '🌧 RAIN'}
          {state.weather === 'heavy_rain' && '⛈ STORM'}
          {state.weather === 'snow' && '❄ SNOW'}
          {state.weather === 'fog' && '🌫 FOG'}
          {state.weather === 'storm' && '⚡ STORM'}
        </div>
      )}

      {/* Controls hint — fades out after 30 s */}
      {hintsVisible && (
        <div className="absolute bottom-16 left-4 text-[9px] text-white/15 pointer-events-none space-y-0.5 font-exo transition-opacity duration-1000">
          <div>{t('hudControls1')}</div>
          <div>{t('hudControls2')}</div>
        </div>
      )}
    </div>
  );
}

/** Pojedynczy badge metryki na HUD (np. "Dzień 08:32" lub "Pollution 45.2"). */
function MetricBadge({ label, value, color, glow }: { label: string; value: string; color?: string; glow?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[8px] font-orbitron tracking-widest text-white/20 mb-0.5">{label}</span>
      <span
        className="text-[11px] font-mono tabular-nums font-semibold"
        style={{
          color: color || 'rgba(255,255,255,0.55)',
          textShadow: glow ? `0 0 10px ${glow}` : 'none',
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Minimapa w rogu ekranu — rysuje chunki, budynki, NPC, wrogów na Canvas 2D. Skaluje świat do rozmiaru minimapy. */
function Minimap({ state, size = 176 }: { state: GameState; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#06080a';
    ctx.fillRect(0, 0, size, size);

    const scale = size <= 80 ? 1.5 : 2;
    const cx = size / 2;
    const cy = size / 2;
    const px = state.player.x;
    const py = state.player.y;

    for (const [, chunk] of state.chunks) {
      for (let y = 0; y < chunk.length; y++) {
        for (let x = 0; x < chunk[y].length; x++) {
          const tile = chunk[y][x];
          if (tile.visibility < 0.5) continue;
          const mx = (tile.x - px) * scale + cx;
          const my = (tile.y - py) * scale + cy;
          if (mx < -2 || mx > size + 2 || my < -2 || my > size + 2) continue;

          if (tile.building) {
            const MINIMAP_BUILDING_COLORS: Record<string, string> = {
              miner: '#f59e0b', furnace: '#ef4444', assembler: '#3b82f6',
              conveyor: '#f97316', inserter: '#fb923c', splitter: '#fb923c',
              underground_belt: '#fb923c', pipe: '#64748b',
              boiler: '#dc2626', steam_engine: '#fbbf24', power_pole: '#facc15',
              lab: '#a855f7', radar: '#06b6d4', turret: '#dc2626', wall: '#6b7280',
              storage: '#0ea5e9', refinery: '#c084fc', chemical_plant: '#34d399',
              pumpjack: '#a3e635',
              solar_panel: '#2563eb', accumulator: '#eab308', laser_turret: '#6366f1',
              flak_cannon: '#b91c1c', tesla_coil: '#8b5cf6', mine: '#ea580c',
              roboport: '#0891b2', pump: '#0284c7', silo: '#6b7280',
              beacon: '#818cf8', centrifuge: '#16a34a', artillery: '#71717a',
            };
            ctx.fillStyle = MINIMAP_BUILDING_COLORS[tile.building.type] || BUILDING_COLORS[tile.building.type] || '#888';
            // Draw slightly larger for multi-tile buildings
            const bSize = scale >= 2 ? scale + 1 : scale;
            ctx.fillRect(mx, my, bSize, bSize);
            // Building border for visibility
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(mx, my, bSize, bSize);
          } else if (tile.resource) {
            ctx.fillStyle = RESOURCE_COLORS[tile.resource] || '#888';
          } else {
            const colors: Record<string, string> = {
              grass: '#0f2a14', desert: '#3a2a1a', snow: '#2a3040',
              forest: '#0a2010', swamp: '#121a12', volcanic: '#1a0f0a',
            };
            ctx.fillStyle = colors[tile.biome] || '#0f2a14';
          }
          ctx.fillRect(mx, my, scale, scale);
        }
      }
    }

    // Player glow
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 8);
    gradient.addColorStop(0, 'rgba(56,189,248,0.8)');
    gradient.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - 8, cy - 8, 16, 16);

    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Enemies — type-specific icons and sizes
    const ENEMY_MINIMAP_COLORS: Record<string, string> = {
      biter: '#ef4444', spitter: '#f97316', worm: '#dc2626',
      behemoth: '#b91c1c', spawner: '#7f1d1d',
      destroyer: '#6366f1', leviathan: '#9333ea', drone: '#facc15',
    };
    for (const [, enemy] of state.enemies) {
      const ex = (enemy.x - px) * scale + cx;
      const ey = (enemy.y - py) * scale + cy;
      if (ex < 0 || ex > size || ey < 0 || ey > size) continue;
      const dotSize = enemy.type === 'behemoth' ? 4 : enemy.type === 'leviathan' ? 5 : enemy.type === 'spawner' ? 4 : 2;
      ctx.fillStyle = ENEMY_MINIMAP_COLORS[enemy.type] || '#ef4444';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = enemy.type === 'leviathan' ? 5 : 2;
      if (enemy.type === 'destroyer' || enemy.type === 'drone') {
        // Diamond shape for flying enemies
        ctx.beginPath();
        ctx.moveTo(ex, ey - dotSize);
        ctx.lineTo(ex + dotSize, ey);
        ctx.lineTo(ex, ey + dotSize);
        ctx.lineTo(ex - dotSize, ey);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(ex - dotSize / 2, ey - dotSize / 2, dotSize, dotSize);
      }
      ctx.shadowBlur = 0;
    }

    // NPCs — type-specific colors
    const NPC_MINIMAP_COLORS: Record<string, string> = {
      worker: '#22c55e', scout: '#06b6d4', trader: '#eab308',
      guard: '#6b7280', settler: '#a3a3a3',
    };
    for (const [, npc] of state.npcs) {
      const nx = (npc.x - px) * scale + cx;
      const ny = (npc.y - py) * scale + cy;
      if (nx < 0 || nx > size || ny < 0 || ny > size) continue;
      ctx.fillStyle = NPC_MINIMAP_COLORS[npc.type] || '#22c55e';
      ctx.fillRect(nx - 1, ny - 1, 2, 2);
    }

    // Border frame
    ctx.strokeStyle = 'rgba(56,189,248,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, size, size);
  }, [state.tick, size]);

  return <canvas ref={canvasRef} width={size} height={size} className="w-full h-full" />;
}

