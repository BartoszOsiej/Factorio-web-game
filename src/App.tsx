import { useRef, useState, useCallback, useEffect, Component, ReactNode, lazy, Suspense } from 'react';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import MobileControls from './components/MobileControls';
import TutorialOverlay from './components/TutorialOverlay';
import { ActionBarBtn, WrenchIcon, FlaskIcon, PackageIcon, ChartIcon, TrophyIcon, GemIcon, SaveIcon, FriendsIcon } from './ui/components/ActionBar';

const BuildMenu = lazy(() => import('./components/BuildMenu'));
const ResearchMenu = lazy(() => import('./components/ResearchMenu'));
const InventoryMenu = lazy(() => import('./components/InventoryMenu'));
const StatsMenu = lazy(() => import('./components/StatsMenu'));
const LeaderboardMenu = lazy(() => import('./components/LeaderboardMenu'));
const ShopMenu = lazy(() => import('./components/ShopMenu'));
const BuildingInfo = lazy(() => import('./components/BuildingInfo'));
const SaveLoad = lazy(() => import('./components/SaveLoad'));
const AuthScreen = lazy(() => import('./components/AuthScreen'));
const StartScreen = lazy(() => import('./components/StartScreen'));
const ChatPanel = lazy(() => import('./components/ChatPanel'));
const FriendsPanel = lazy(() => import('./components/FriendsPanel'));
const VisitWorldView = lazy(() => import('./components/VisitWorldView'));
const PremiumPopup = lazy(() => import('./components/PremiumPopup'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const GuideMenu = lazy(() => import('./components/GuideMenu'));
const CoopMenu = lazy(() => import('./components/CoopMenu'));
const LangSelector = lazy(() => import('./components/LangSelector'));
const Pico8Console = lazy(() => import('./easter/pico8/Pico8Console'));
const TradeHub = lazy(() => import('./components/TradeHub/TradeHub'));
import { CoopLobbyService, type LobbyInfo } from './services/coop/CoopLobbyService';
import { GameEngine } from './game/engine';
import { GameState } from './game/types';
import { AuthService } from './services/auth/AuthService';
import { isAdmin } from './config/admins';
import { saveGame, loadGame } from './lib/saveSystem';
import { supabase } from './lib/supabase';
import { t } from './lib/i18n';

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

/** Główny komponent aplikacji — orkiestruje wszystkie widoki (auth, start, gra, menuy), zarządza stanem UI i synchronizacją co-op. */
function App() {
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => { document.title = t('gameTitle'); }, []);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [started, setStarted] = useState(false);
  const [showBuild, setShowBuild] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [visitingWorld, setVisitingWorld] = useState<{ id: string; name: string } | null>(null);
  const [notifications, setNotifications] = useState<{ text: string; timer: number; type?: string }[]>([]);
  const [currentUser, setCurrentUser] = useState<string | null>(AuthService.getCurrentUser());
  const [hasSaveData, setHasSaveData] = useState(false);
  const [showPremiumPopup, setShowPremiumPopup] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showCoop, setShowCoop] = useState(false);
  const [showPico8, setShowPico8] = useState(false);
  const [showTradeHub, setShowTradeHub] = useState(false);
  const [saveCooldown, setSaveCooldown] = useState(0);
  const [showSaveOverlay, setShowSaveOverlay] = useState(false);
  const [coopMode, setCoopMode] = useState(false);
  const [worldCode, setWorldCode] = useState<string | null>(null);
  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo | null>(null);
  const [tutorialStep, setTutorialStep] = useState<{ step: import('./core/systems/tutorial').TutorialStep; index: number; total: number } | null>(null);
  const coopChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const coopPosIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coopModeRef = useRef(false);
  coopModeRef.current = coopMode;
  const worldCodeRef = useRef<string | null>(null);
  worldCodeRef.current = worldCode;

  const engine = engineRef.current;

  // Pause game when Trade Hub opens
  useEffect(() => {
    if (showTradeHub) engine?.pause();
    else engine?.resume();
  }, [showTradeHub, engine]);

  const handleEngineReady = useCallback((engine: GameEngine) => {
    engineRef.current = engine;
    (window as { __gameState?: GameState }).__gameState = engine.state;
    engine.onStateChange = (state) => {
      setGameState({ ...state });
      setNotifications([...engine.notifications]);
      if (engine.keys.has('b')) { setShowBuild(prev => !prev); engine.keys.delete('b'); }
      if (engine.keys.has('r')) { setShowResearch(prev => !prev); engine.keys.delete('r'); }
      if (engine.keys.has('i')) { setShowInventory(prev => !prev); engine.keys.delete('i'); }
      if (engine.keys.has('Backquote')) { setShowPico8(prev => !prev); engine.keys.delete('Backquote'); }
    };
    engine.onBuildingAction = (action, type, x, y, dir) => {
      if (!coopModeRef.current || !coopChannelRef.current) return;
      const myId = AuthService.getCurrentUserId();
      if (!myId) return;
      coopChannelRef.current.send({
        type: 'broadcast', event: action === 'place' ? 'build_place' : 'build_remove',
        payload: { type, x, y, dir, senderId: myId },
      });
    };
    engine.onTutorialStep = (step, index, total) => {
      setTutorialStep({ step, index, total });
    };
    engine.onTutorialComplete = () => {
      setTutorialStep(null);
    };
    engine.startTutorial();
  }, []);

  const handleAuth = useCallback((username: string, hasSaveDataArg: boolean) => {
    setCurrentUser(username);
    setHasSaveData(hasSaveDataArg);
    // Set world seed based on username so each player gets a unique world
    if (engineRef.current) {
      engineRef.current.setSeedFromUsername(username);
    }
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't fire shortcuts when user is typing in any input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'Tab') { e.preventDefault(); setShowStats(prev => !prev); }
      if (e.key === 'l') setShowLeaderboard(prev => !prev);
      if (e.key === 'p') setShowShop(prev => !prev);
      if (e.key === 'Enter' && !started) setStarted(true);
      if (e.key === 'Escape') {
        setShowBuild(false); setShowResearch(false); setShowInventory(false);
        setShowStats(false); setShowLeaderboard(false); setShowShop(false); setShowSaveLoad(false);
        setShowFriends(false);
        if (engineRef.current) engineRef.current.selectedBuilding = null;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [started]);

  useEffect(() => {
    if (currentUser && started && gameState) {
      const noPopup = localStorage.getItem('novactorio_no_premium_popup') === '1';
      if (!noPopup && gameState.player.premiumTier === 'free') {
        const timer = setTimeout(() => setShowPremiumPopup(true), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [currentUser, started, gameState?.player.premiumTier]);

  useEffect(() => {
    if (!started || !currentUser) return;
    const interval = setInterval(() => {
      if (engineRef.current) {
        saveGame(currentUser, engineRef.current.state);
      }
    }, 10000);
    const handleUnload = () => {
      if (engineRef.current && currentUser) {
        saveGame(currentUser, engineRef.current.state);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [started, currentUser]);

  useEffect(() => {
    if (!started || !hasSaveData || !currentUser) return;
    // Wait for engine to be ready (GameCanvas effect runs before App effects)
    const tryLoad = () => {
      const eng = engineRef.current;
      if (!eng) { setTimeout(tryLoad, 100); return; }
      const save = loadGame(currentUser);
      if (save) {
        eng.loadFromSave(save);
      }
    };
    setTimeout(tryLoad, 300);
    setHasSaveData(false);
  }, [started, hasSaveData, currentUser]);

  // Save cooldown countdown effect
  useEffect(() => {
    if (saveCooldown <= 0) return;
    const t2 = setInterval(() => {
      setSaveCooldown(prev => {
        if (prev <= 1) {
          setShowSaveOverlay(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t2);
  }, [saveCooldown]);

  const triggerSave = useCallback(() => {
    if (!currentUser || !engineRef.current || saveCooldown > 0) return;
    setSaveCooldown(10);
    setShowSaveOverlay(true);
    saveGame(currentUser, engineRef.current.state);
  }, [currentUser, saveCooldown]);

  const handleJoinLobby = useCallback((code: string, seed: number) => {
    setWorldCode(code);
    setCoopMode(true);
    const eng = engineRef.current;
    if (eng && eng.state.worldSeed !== seed) {
      eng.state.worldSeed = seed;
    }
  }, []);

  const handleLeaveLobby = useCallback(async () => {
    setWorldCode(null);
    setCoopMode(false);
    setLobbyInfo(null);
    if (coopChannelRef.current) {
      supabase.removeChannel(coopChannelRef.current);
      coopChannelRef.current = null;
    }
    if (coopPosIntervalRef.current) {
      clearInterval(coopPosIntervalRef.current);
      coopPosIntervalRef.current = null;
    }
    if (engineRef.current) {
      engineRef.current.state.coopVisitors?.clear();
    }
  }, []);

  // Co-op: Realtime channel (subscribes when worldCode is set)
  useEffect(() => {
    if (!started || !currentUser || !engine || !worldCode) return;
    const myId = AuthService.getCurrentUserId();
    if (!myId) return;

    interface VisitorPayload { id: string; username: string; x: number; y: number; color: string }
    interface BuildPayload { type: string; x: number; y: number; dir: string; senderId: string }
    interface IdPayload { id: string }

    const channel = supabase
      .channel(`coop-${worldCode}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'pos' }, ({ payload }) => {
        const { id, username, x, y, color } = payload as unknown as VisitorPayload;
        if (id !== myId) engine.updateCoopVisitor(id, username, x, y, color);
      })
      .on('broadcast', { event: 'leave' }, ({ payload }) => {
        engine.removeCoopVisitor((payload as unknown as IdPayload).id);
      })
      .on('broadcast', { event: 'build_place' }, ({ payload }) => {
        const { type, x, y, dir, senderId } = payload as unknown as BuildPayload;
        if (senderId !== myId) engine.placeBuildingFromCoop(type, x, y, dir);
      })
      .on('broadcast', { event: 'build_remove' }, ({ payload }) => {
        const { x, y, senderId } = payload as unknown as BuildPayload;
        if (senderId !== myId) engine.removeBuildingFromCoop(x, y);
      })
      .subscribe();

    coopChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      coopChannelRef.current = null;
    };
  }, [started, currentUser, engine, worldCode]);

  // Co-op: position broadcast + lobby heartbeat
  useEffect(() => {
    if (!started || !currentUser || !coopMode || !engine || !worldCode) return;
    const myId = AuthService.getCurrentUserId();
    if (!myId) return;

    const interval = setInterval(() => {
      if (!engine.running || !coopChannelRef.current) return;
      coopChannelRef.current.send({
        type: 'broadcast', event: 'pos',
        payload: { id: myId, username: currentUser, x: engine.state.player.x, y: engine.state.player.y, color: '#3388ee' },
      });
    }, 200);
    coopPosIntervalRef.current = interval;

    return () => {
      clearInterval(interval);
      coopPosIntervalRef.current = null;
    };
  }, [started, currentUser, coopMode, engine, worldCode]);

  // Auto-refresh lobby info while connected
  useEffect(() => {
    if (!worldCode) return;
    const interval = setInterval(async () => {
      const info = await CoopLobbyService.getLobbyInfo(worldCode);
      if (info) setLobbyInfo(info);
    }, 5000);
    CoopLobbyService.getLobbyInfo(worldCode).then(i => { if (i) setLobbyInfo(i); });
    return () => clearInterval(interval);
  }, [worldCode]);

  return (
    <div className="w-screen h-screen overflow-hidden select-none font-exo" style={{ background: 'var(--bg)' }}>
      {!currentUser && <Suspense fallback={null}><AuthScreen onAuth={handleAuth} /></Suspense>}
      {currentUser && !started && <Suspense fallback={null}><StartScreen onStart={() => setStarted(true)} /></Suspense>}
      {currentUser && started && (
        <ErrorBoundary>
          <GameCanvas engineRef={engineRef} onEngineReady={handleEngineReady} />
        </ErrorBoundary>
      )}
      {currentUser && started && gameState && <HUD state={gameState} notifications={notifications} />}
      {currentUser && started && gameState && engine && <Suspense fallback={null}><BuildingInfo engine={engine} state={gameState} /></Suspense>}

      {/* Mobile controls */}
      {currentUser && started && isMobile && engine && gameState && (
        <MobileControls
          engine={engine}
          gameState={gameState}
          currentUser={currentUser}
          onBuild={() => setShowBuild(true)}
          onCraft={() => setShowInventory(true)}
          onResearch={() => setShowResearch(true)}
          onStats={() => setShowStats(true)}
          onSave={() => setShowSaveLoad(true)}
          onCoop={() => setShowCoop(true)}
          onFriends={() => setShowFriends(true)}
          onAdmin={() => setShowAdmin(true)}
          onGuide={() => setShowGuide(true)}
          onPico8={() => setShowPico8(true)}
          onTradeHub={() => setShowTradeHub(true)}
          onLogout={() => { AuthService.logout(); setCurrentUser(null); setStarted(false); }}
        />
      )}

      {/* Chat */}
      {currentUser && started && <Suspense fallback={null}><ChatPanel /></Suspense>}

      {/* Bottom action bar */}
      {currentUser && started && !isMobile && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 animate-slide-up"
          style={{
            background: 'linear-gradient(180deg, #111820 0%, #0c1016 100%)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(216,128,16,0.18)',
            borderTop: '1px solid rgba(216,128,16,0.35)',
            borderRadius: '3px',
            padding: '6px 10px',
            boxShadow: 'inset 0 1px 0 rgba(216,128,16,0.08), 0 0 0 1px rgba(0,0,0,0.7), 0 -8px 40px rgba(0,0,0,0.9), 0 0 40px rgba(216,128,16,0.04)',
          }}
        >
          <ActionBarBtn label={t('actionBuild')} shortcut="B" onClick={() => setShowBuild(true)} active={showBuild}
            icon={<WrenchIcon />} color="#f59e0b" />
          <ActionBarBtn label={t('actionResearch')} shortcut="R" onClick={() => setShowResearch(true)} active={showResearch}
            icon={<FlaskIcon />} color="#38bdf8" />
          <ActionBarBtn label={t('actionCraft')} shortcut="I" onClick={() => setShowInventory(true)} active={showInventory}
            icon={<PackageIcon />} color="#22c55e" />
          <ActionBarBtn label={t('actionStats')} shortcut="Tab" onClick={() => setShowStats(true)} active={showStats}
            icon={<ChartIcon />} color="#a78bfa" />
          <ActionBarBtn label={t('actionRanks')} shortcut="L" onClick={() => setShowLeaderboard(true)} active={showLeaderboard}
            icon={<TrophyIcon />} color="#fbbf24" />
          <ActionBarBtn label={t('actionShop')} shortcut="P" onClick={() => setShowShop(true)} active={showShop}
            icon={<GemIcon />} color="#06b6d4" />
          <ActionBarBtn label={t('actionFriends')} shortcut="" onClick={() => setShowFriends(true)} active={showFriends}
            icon={<FriendsIcon />} color="#f472b6" />
          <ActionBarBtn label="Trade" shortcut="" onClick={() => setShowTradeHub(true)} active={false}
            icon={<span>🏪</span>} color="#FFCC00" />
          {isAdmin(currentUser) && (
            <>
              <div className="w-px h-6 mx-1" style={{ background: 'rgba(220,38,38,0.3)' }} />
              <ActionBarBtn label={t('actionAdmin')} shortcut="" onClick={() => setShowAdmin(true)} active={showAdmin}
                icon={<span>🛡️</span>} color="#ef4444" />
            </>
          )}
          <div className="w-px h-6 mx-1" style={{ background: 'rgba(245,158,11,0.15)' }} />
          <ActionBarBtn label={t('guide')} shortcut="" onClick={() => setShowGuide(true)} active={showGuide}
            icon={<span>📖</span>} color="#22d3ee" />
          <div className="w-px h-6 mx-1" style={{ background: 'rgba(245,158,11,0.15)' }} />
          <ActionBarBtn label={saveCooldown > 0 ? `⏳ ${saveCooldown}s` : t('actionSave')} shortcut="" onClick={triggerSave} active={saveCooldown > 0}
            icon={<SaveIcon />} color={saveCooldown > 0 ? '#22c55e' : '#94a3b8'} />
          <ActionBarBtn label={t('actionLoad')} shortcut="" onClick={() => setShowSaveLoad(true)} active={showSaveLoad}
            icon={<span>📂</span>} color="#60a5fa" />
          <div className="w-px h-6 mx-1" style={{ background: 'rgba(245,158,11,0.15)' }} />
          <ActionBarBtn label={t('actionCoop')} shortcut="" onClick={() => setShowCoop(true)} active={coopMode}
            icon={<span>🌐</span>} color="#f472b6" />
          <div className="w-px h-6 mx-1" style={{ background: 'rgba(245,158,11,0.15)' }} />
          <ActionBarBtn label="PICO-8" shortcut="`" onClick={() => setShowPico8(true)} active={false}
            icon={<span>🕹️</span>} color="#FFEC27" />
          <div className="w-px h-6 mx-1" style={{ background: 'rgba(245,158,11,0.15)' }} />
          <button
            onClick={() => { AuthService.logout(); setCurrentUser(null); setStarted(false); }}
            className="btn-factory flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all"
            style={{ background: 'transparent', border: '1px solid transparent' }}
            title={`${t('actionLogout')} (${currentUser})`}
          >
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            <span className="text-[9px] font-orbitron tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {currentUser?.substring(0, 6) || 'OUT'}
            </span>
          </button>
          <div className="w-px h-6 mx-1" style={{ background: 'rgba(245,158,11,0.15)' }} />
          <Suspense fallback={null}><LangSelector /></Suspense>
        </div>
      )}

      {/* Placing indicator */}
      {currentUser && engine?.selectedBuilding && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-20 text-sm px-5 py-2.5 rounded-xl font-exo animate-fade-in"
          style={{
            background: 'linear-gradient(180deg, #0f1418 0%, #0a0d11 100%)',
            border: '1px solid rgba(42,54,66,0.9)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <span className="text-white/40">{t('placing')}</span>
          <span className="font-semibold text-emerald-400">{engine.selectedBuilding.replace(/_/g, ' ')}</span>
          <span className="text-white/25 ml-2">· {t('direction')}: <span className="text-white/40">{engine.selectedDirection.toUpperCase()}</span></span>
          <span className="text-white/20 ml-2 text-xs">{t('rotateHint')}</span>
        </div>
      )}

      {/* Menus */}
      {showBuild && engine && gameState && <Suspense fallback={null}><BuildMenu engine={engine} state={gameState} onClose={() => setShowBuild(false)} /></Suspense>}
      {showResearch && engine && gameState && <Suspense fallback={null}><ResearchMenu engine={engine} state={gameState} onClose={() => setShowResearch(false)} /></Suspense>}
      {showInventory && engine && gameState && <Suspense fallback={null}><InventoryMenu engine={engine} state={gameState} onClose={() => setShowInventory(false)} /></Suspense>}
      {showStats && gameState && <Suspense fallback={null}><StatsMenu state={gameState} onClose={() => setShowStats(false)} /></Suspense>}
      {showLeaderboard && <Suspense fallback={null}><LeaderboardMenu onClose={() => setShowLeaderboard(false)} /></Suspense>}
      {showShop && engine && gameState && <Suspense fallback={null}><ShopMenu engine={engine} state={gameState} onClose={() => setShowShop(false)} /></Suspense>}
      {showSaveLoad && engine && <Suspense fallback={null}><SaveLoad engine={engine} onClose={() => setShowSaveLoad(false)} saveCooldown={saveCooldown} onSave={triggerSave} /></Suspense>}
      {showPico8 && <Suspense fallback={null}><Pico8Console onClose={() => setShowPico8(false)} /></Suspense>}
      {showTradeHub && <Suspense fallback={null}><TradeHub onClose={() => setShowTradeHub(false)} /></Suspense>}
      {showFriends && <Suspense fallback={null}><FriendsPanel onClose={() => setShowFriends(false)} onVisitWorld={(id, name) => setVisitingWorld({ id, name })} /></Suspense>}
      {showAdmin && engine && gameState && <Suspense fallback={null}><AdminPanel engine={engine} state={gameState} onClose={() => setShowAdmin(false)} /></Suspense>}
      {showCoop && <Suspense fallback={null}><CoopMenu
        onJoinLobby={handleJoinLobby}
        onLeaveLobby={handleLeaveLobby}
        lobbyInfo={lobbyInfo}
        isHost={lobbyInfo?.hostId === AuthService.getCurrentUserId()}
        onClose={() => setShowCoop(false)}
      /></Suspense>}
      {visitingWorld && <Suspense fallback={null}><VisitWorldView friendId={visitingWorld.id} friendName={visitingWorld.name} onClose={() => setVisitingWorld(null)} /></Suspense>}
      {showGuide && <Suspense fallback={null}><GuideMenu onClose={() => setShowGuide(false)} /></Suspense>}
      {showPremiumPopup && (
        <Suspense fallback={null}><PremiumPopup
          onClose={() => setShowPremiumPopup(false)}
          onDontAsk={() => { localStorage.setItem('novactorio_no_premium_popup', '1'); setShowPremiumPopup(false); }}
          onBuyPremium={() => setShowShop(true)}
        /></Suspense>
      )}

      {/* Save cooldown overlay */}
      {showSaveOverlay && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
          <div className="animate-slide-up text-center" style={{
            background: 'rgba(0,0,0,0.75)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: '20px',
            padding: '30px 50px',
            boxShadow: '0 0 60px rgba(34,197,94,0.15), inset 0 1px 0 rgba(34,197,94,0.08)',
            backdropFilter: 'blur(8px)',
          }}>
            <div className="font-orbitron font-black text-sm tracking-[0.3em] mb-1" style={{ color: '#4ade80' }}>
              ZAPISYWANIE STANU GRY
            </div>
            <div className="font-mono text-5xl font-bold animate-pulse" style={{ color: '#22c55e' }}>
              {saveCooldown}s
            </div>
            <div className="w-full h-1 mt-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-full rounded-full transition-all duration-1000 ease-linear"
                style={{
                  width: `${(saveCooldown / 10) * 100}%`,
                  background: 'linear-gradient(90deg, #166534, #22c55e)',
                  boxShadow: '0 0 8px rgba(34,197,94,0.5)',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* COOP mode indicator */}
      {coopMode && started && currentUser && (
        <div className="fixed bottom-24 left-4 z-20 px-3 py-1.5 rounded-xl text-[10px] font-orbitron tracking-wider"
          style={{
            background: 'rgba(244,114,182,0.12)',
            border: '1px solid rgba(244,114,182,0.3)',
            color: '#f472b6',
            boxShadow: '0 0 15px rgba(244,114,182,0.1)',
          }}
        >
          🌐 {t('coopActive')}
        </div>
      )}

      {/* Tutorial overlay */}
      {tutorialStep && (
        <TutorialOverlay
          step={tutorialStep.step}
          index={tutorialStep.index}
          total={tutorialStep.total}
          onSkip={() => { engine?.tutorial?.skip(); setTutorialStep(null); }}
        />
      )}
    </div>
  );
}

export default App;

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-black/90 z-50 font-exo">
          <div className="text-center p-8 rounded-2xl" style={{ background: '#0c1016', border: '1px solid rgba(239,68,68,0.3)' }}>
            <div className="text-red-400 text-2xl mb-3 font-orbitron">{t('gameError')}</div>
            <div className="text-white/50 text-sm mb-4 max-w-xs">{this.state.error}</div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 rounded-lg text-sm font-orbitron"
              style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}
            >
              {t('reloadGame')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

