import { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from '../game/engine';
import { GameState } from '../game/types';
import { BUILDING_COLORS, RESOURCE_COLORS } from '../game/constants';
import { t } from '../lib/i18n';
import { initAudio } from '../game/audio';
import LangSelector from './LangSelector';

interface Props {
  engine: GameEngine;
  gameState: GameState;
  currentUser: string;
  onBuild: () => void;
  onCraft: () => void;
  onResearch: () => void;
  onStats: () => void;
  onSave: () => void;
  onCoop: () => void;
  onFriends: () => void;
  onAdmin: () => void;
  onGuide: () => void;
  onPico8: () => void;
  onTradeHub: () => void;
  onLogout: () => void;
}

export default function MobileControls({
  engine, gameState, currentUser, onBuild, onCraft, onResearch, onStats, onSave, onCoop, onFriends, onAdmin, onGuide, onLogout, onPico8, onTradeHub,
}: Props) {
  const joystickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [joystickActive, setJoystickActive] = useState(false);
  const joystickOrigin = useRef({ x: 0, y: 0 });
  const joystickDelta = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef<number>(0);
  const joystickActiveRef = useRef(false);
  const joystickTouchId = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      if (joystickActiveRef.current && engine) {
        const { x, y } = joystickDelta.current;
        const speed = 0.18;
        if (Math.abs(x) > 0.05 || Math.abs(y) > 0.05) {
          engine.state.player.x += x * speed;
          engine.state.player.y += y * speed;
        }
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [engine]);

  const handleJoystickStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    initAudio();
    const touch = e.changedTouches[0];
    joystickTouchId.current = touch.identifier;
    const rect = joystickRef.current!.getBoundingClientRect();
    joystickOrigin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    joystickActiveRef.current = true;
    setJoystickActive(true);
  }, []);

  const handleJoystickMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!joystickActiveRef.current) return;
    let touch: React.Touch | undefined;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === joystickTouchId.current) {
        touch = e.touches[i];
        break;
      }
    }
    if (!touch) return;
    const maxDist = 40;
    let dx = touch.clientX - joystickOrigin.current.x;
    let dy = touch.clientY - joystickOrigin.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    joystickDelta.current = { x: dx / maxDist, y: dy / maxDist };
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }, [joystickActive]);

  const handleJoystickEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    let joystickFingerLifted = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId.current) {
        joystickFingerLifted = true;
        break;
      }
    }
    if (!joystickFingerLifted) return;
    joystickTouchId.current = null;
    joystickActiveRef.current = false;
    setJoystickActive(false);
    joystickDelta.current = { x: 0, y: 0 };
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate(0, 0)';
    }
  }, []);

  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setSelectedBuilding(engine.selectedBuilding);
    }, 100);
    return () => clearInterval(id);
  }, [engine]);

  const isAdmin = currentUser.toUpperCase() === 'ADMIN';
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none" style={{ userSelect: 'none' }}>

      {/* ── Top action bar ── */}
      <div
        className="absolute top-14 left-0 right-0 flex justify-center gap-2 px-3 pointer-events-auto"
        style={{ zIndex: 11 }}
      >
        <TopBtn label={t('mobileBuild')} icon="🔨" color="#f59e0b" onClick={onBuild} />
        <TopBtn label={t('mobileCraft')} icon="⚙️" color="#22c55e" onClick={onCraft} />
        <TopBtn label={t('mobileTech')} icon="🔬" color="#38bdf8" onClick={onResearch} />
        <TopBtn label={t('mobileStats')} icon="📊" color="#a78bfa" onClick={onStats} />
      </div>

      {/* ── Drawer toggle ── */}
      <button
        onClick={() => { setDrawerOpen(p => !p); initAudio(); }}
        style={{
          position: 'absolute', top: '14px', right: '14px',
          width: '44px', height: '44px', borderRadius: '10px',
          background: drawerOpen ? 'rgba(216,128,16,0.25)' : 'rgba(0,0,0,0.6)',
          border: `1.5px solid ${drawerOpen ? 'rgba(216,128,16,0.6)' : 'rgba(255,255,255,0.15)'}`,
          color: drawerOpen ? '#d88010' : 'rgba(255,255,255,0.6)',
          fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          touchAction: 'none', zIndex: 20, pointerEvents: 'auto',
          boxShadow: drawerOpen ? '0 0 15px rgba(216,128,16,0.3)' : 'none',
          transition: 'all 0.2s ease',
        }}
      >
        {drawerOpen ? '✕' : '☰'}
      </button>

      {/* ── Drawer ── */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 pointer-events-auto"
            style={{ background: 'rgba(0,0,0,0.5)', zIndex: 18 }}
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className="absolute pointer-events-auto"
            style={{
              top: '64px', right: '14px', zIndex: 19,
              display: 'flex', flexDirection: 'column', gap: '6px',
              animation: 'slide-up 0.15s ease',
            }}
          >
            <DrawerBtn label={t('mobileStats')} icon="📊" color="#a78bfa" onClick={() => { onStats(); setDrawerOpen(false); }} />
            <DrawerBtn label={t('mobileCoop')} icon="🌐" color="#f472b6" onClick={() => { onCoop(); setDrawerOpen(false); }} />
            <DrawerBtn label={t('mobileFriends')} icon="👥" color="#f472b6" onClick={() => { onFriends(); setDrawerOpen(false); }} />
            <DrawerBtn label={t('mobileGuide')} icon="📖" color="#22d3ee" onClick={() => { onGuide(); setDrawerOpen(false); }} />
            <DrawerBtn label={t('mobileSave')} icon="💾" color="#94a3b8" onClick={() => { onSave(); setDrawerOpen(false); }} />
            <DrawerBtn label="PICO-8" icon="🕹️" color="#FFEC27" onClick={() => { onPico8(); setDrawerOpen(false); }} />
            <DrawerBtn label="Trade" icon="🏪" color="#FFCC00" onClick={() => { onTradeHub(); setDrawerOpen(false); }} />
            {isAdmin && (
              <DrawerBtn label={t('mobileAdmin')} icon="🛡️" color="#ef4444" onClick={() => { onAdmin(); setDrawerOpen(false); }} />
            )}
            <div style={{ padding: '4px 0' }}>
              <LangSelector />
            </div>
            <button
              onTouchEnd={(e) => { e.preventDefault(); onLogout(); }}
              onClick={onLogout}
              style={{
                width: '100%', height: '40px', borderRadius: '10px',
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)',
                color: '#f87171', fontSize: '10px', fontFamily: 'Orbitron',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                touchAction: 'none',
              }}
            >
              <span>⬡</span>
              <span>{t('mobileLogout')}</span>
            </button>
          </div>
        </>
      )}

      {/* ── Minimap — top-left, above joystick ── */}
      <div
        className="absolute rounded-xl overflow-hidden pointer-events-none"
        style={{
          top: '100px', left: '12px',
          width: '72px', height: '72px',
          background: 'linear-gradient(180deg, #111820, #0c1016)',
          border: '1px solid rgba(216,128,16,0.3)',
          boxShadow: '0 0 14px rgba(0,0,0,0.8)',
          opacity: 0.85, zIndex: 12,
        }}
      >
        <div className="absolute top-0.5 left-1 text-[5px] font-orbitron text-white/25 z-10 tracking-widest">{t('hudMap')}</div>
        <MiniMapCanvas state={gameState} size={72} />
      </div>

      {/* ── Joystick ── */}
      <div
        ref={joystickRef}
        className="absolute pointer-events-auto"
        style={{
          bottom: '28px', left: '28px',
          width: '100px', height: '100px', borderRadius: '50%',
          background: 'rgba(0,0,0,0.5)',
          border: '2px solid rgba(216,128,16,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          touchAction: 'none', boxShadow: '0 0 24px rgba(0,0,0,0.6)',
        }}
        onTouchStart={handleJoystickStart}
        onTouchMove={handleJoystickMove}
        onTouchEnd={handleJoystickEnd}
      >
        <div
          ref={knobRef}
          style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: joystickActive ? 'rgba(216,128,16,0.75)' : 'rgba(216,128,16,0.45)',
            border: '2px solid rgba(216,128,16,0.9)',
            transition: joystickActive ? 'none' : 'transform 0.15s ease',
            boxShadow: joystickActive ? '0 0 20px rgba(216,128,16,0.6)' : '0 0 10px rgba(216,128,16,0.2)',
          }}
        />
      </div>

      {/* ── Bottom-right action cluster ── */}
      <div
        className="absolute pointer-events-auto flex flex-row gap-3 items-end"
        style={{ bottom: '28px', right: '16px' }}
      >
        <div className="flex flex-col gap-2 items-center">
          <DemolishBtn engine={engine} />
          <MineHoldBtn engine={engine} />
        </div>
        <AttackHoldBtn engine={engine} />
      </div>

      {/* ── Cancel building banner ── */}
      {selectedBuilding && (
        <div
          className="absolute pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-2xl"
          style={{
            bottom: '155px', left: '50%', transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg, #0f1418, #0a0d11)',
            border: '1.5px solid rgba(56,189,248,0.5)',
            boxShadow: '0 0 20px rgba(56,189,248,0.2)', zIndex: 15,
          }}
        >
          <span className="text-xs text-white/50 font-exo">{t('mobilePlacing')}</span>
          <span className="text-sm font-bold text-sky-400 font-exo">{selectedBuilding.replace(/_/g, ' ')}</span>
          <button
            className="ml-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              background: 'rgba(239,68,68,0.25)',
              border: '1px solid rgba(239,68,68,0.5)',
              color: '#f87171', touchAction: 'none',
            }}
            onTouchEnd={(e) => { e.preventDefault(); engine.cancelBuilding(); }}
            onClick={() => engine.cancelBuilding()}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function AttackHoldBtn({ engine }: { engine: GameEngine }) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pressed, setPressed] = useState(false);
  const [flash, setFlash] = useState(false);

  const start = (e: React.TouchEvent) => {
    e.preventDefault();
    initAudio();
    setPressed(true);
    const hit = engine.attackNearestEnemy();
    if (hit) { setFlash(true); setTimeout(() => setFlash(false), 120); }
    intervalRef.current = setInterval(() => {
      const h = engine.attackNearestEnemy();
      if (h) { setFlash(true); setTimeout(() => setFlash(false), 120); }
    }, 350);
  };

  const stop = (e: React.TouchEvent) => {
    e.preventDefault();
    setPressed(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  return (
    <button
      style={{
        width: '68px', height: '68px', borderRadius: '50%',
        background: flash ? 'rgba(251,191,36,0.7)' : pressed ? 'rgba(251,191,36,0.45)' : 'rgba(251,191,36,0.2)',
        border: '2.5px solid rgba(251,191,36,0.7)', color: 'white', fontSize: '28px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none',
        boxShadow: pressed ? '0 0 28px rgba(251,191,36,0.6)' : '0 0 14px rgba(251,191,36,0.2)',
        transform: pressed ? 'scale(0.88)' : 'scale(1)',
        transition: 'transform 0.08s ease, box-shadow 0.08s ease, background 0.08s ease',
      }}
      onTouchStart={start} onTouchEnd={stop} onTouchCancel={stop}
    >⚔️</button>
  );
}

function MineHoldBtn({ engine }: { engine: GameEngine }) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pressed, setPressed] = useState(false);

  const start = (e: React.TouchEvent) => {
    e.preventDefault();
    initAudio();
    setPressed(true);
    engine.mineInFront();
    intervalRef.current = setInterval(() => engine.mineInFront(), 200);
  };

  const stop = (e: React.TouchEvent) => {
    e.preventDefault();
    setPressed(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  return (
    <button
      style={{
        width: '56px', height: '56px', borderRadius: '50%',
        background: pressed ? 'rgba(220,38,38,0.55)' : 'rgba(220,38,38,0.35)',
        border: '2px solid rgba(220,38,38,0.6)', color: 'white', fontSize: '20px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none',
        boxShadow: pressed ? '0 0 25px rgba(220,38,38,0.5)' : '0 0 15px rgba(220,38,38,0.2)',
        transform: pressed ? 'scale(0.88)' : 'scale(1)',
        transition: 'transform 0.08s ease, box-shadow 0.08s ease, background 0.08s ease',
      }}
      onTouchStart={start} onTouchEnd={stop} onTouchCancel={stop}
    >⛏</button>
  );
}

function DemolishBtn({ engine }: { engine: GameEngine }) {
  const [flash, setFlash] = useState(false);

  const handleTap = (e: React.TouchEvent) => {
    e.preventDefault();
    initAudio();
    const removed = engine.removeNearestBuilding();
    if (removed) { setFlash(true); setTimeout(() => setFlash(false), 200); }
  };

  return (
    <button
      onTouchEnd={handleTap}
      onClick={() => engine.removeNearestBuilding()}
      style={{
        width: '40px', height: '40px', borderRadius: '10px',
        background: flash ? 'rgba(239,68,68,0.55)' : 'rgba(239,68,68,0.18)',
        border: `1.5px solid rgba(239,68,68,${flash ? '0.9' : '0.45'})`,
        color: '#f87171', fontSize: '16px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px',
        touchAction: 'none',
        transition: 'background 0.15s, border-color 0.15s',
        boxShadow: flash ? '0 0 16px rgba(239,68,68,0.5)' : 'none',
      }}
    >
      <span>🗑</span>
      <span style={{ fontSize: '5px', fontFamily: 'Orbitron', opacity: 0.6 }}>{t('mobileDemolish')}</span>
    </button>
  );
}

function TopBtn({ label, icon, color, onClick }: { label: string; icon: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={() => { initAudio(); onClick(); }}
      style={{
        flex: 1, maxWidth: '80px', height: '48px', borderRadius: '12px',
        background: 'rgba(0,0,0,0.65)',
        border: `1.5px solid ${color}44`, color, fontSize: '18px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
        touchAction: 'none', boxShadow: `0 0 10px ${color}22`,
      }}
    >
      <span>{icon}</span>
      <span style={{ fontSize: '7px', fontFamily: 'Orbitron', letterSpacing: '0.05em', opacity: 0.65 }}>{label}</span>
    </button>
  );
}

function DrawerBtn({ label, icon, color, onClick }: { label: string; icon: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '160px', height: '40px', borderRadius: '10px',
        background: 'rgba(0,0,0,0.8)',
        border: `1.5px solid ${color}44`, color, fontSize: '14px',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '10px',
        padding: '0 14px', touchAction: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
      }}
    >
      <span style={{ fontSize: '16px' }}>{icon}</span>
      <span style={{ fontSize: '10px', fontFamily: 'Orbitron', letterSpacing: '0.05em', opacity: 0.8 }}>{label}</span>
    </button>
  );
}

function MiniMapCanvas({ state, size }: { state: GameState; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = 1.5;
    const cx = size / 2;
    const cy = size / 2;
    const px = state.player.x;
    const py = state.player.y;

    ctx.fillStyle = '#06080a';
    ctx.fillRect(0, 0, size, size);

    for (const [, chunk] of state.chunks) {
      for (let y = 0; y < chunk.length; y++) {
        for (let x = 0; x < chunk[y].length; x++) {
          const tile = chunk[y][x];
          if (tile.visibility < 0.5) continue;
          const mx = (tile.x - px) * scale + cx;
          const my = (tile.y - py) * scale + cy;
          if (mx < -2 || mx > size + 2 || my < -2 || my > size + 2) continue;
          if (tile.building) {
            ctx.fillStyle = BUILDING_COLORS[tile.building.type] || '#888';
          } else if (tile.resource) {
            ctx.fillStyle = RESOURCE_COLORS[tile.resource] || '#555';
          } else {
            const biomeColors: Record<string, string> = {
              grass: '#0f2a14', desert: '#3a2a1a', snow: '#2a3040',
              forest: '#0a2010', swamp: '#121a12', volcanic: '#1a0f0a',
            };
            ctx.fillStyle = biomeColors[tile.biome] || '#0f2a14';
          }
          ctx.fillRect(mx, my, scale, scale);
        }
      }
    }

    for (const [, enemy] of state.enemies) {
      const ex = (enemy.x - px) * scale + cx;
      const ey = (enemy.y - py) * scale + cy;
      if (ex < 0 || ex > size || ey < 0 || ey > size) continue;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(ex - 1, ey - 1, 2, 2);
    }

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 5);
    g.addColorStop(0, 'rgba(56,189,248,0.9)');
    g.addColorStop(1, 'rgba(56,189,248,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 5, cy - 5, 10, 10);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }, [state.tick, size]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size }} />;
}
