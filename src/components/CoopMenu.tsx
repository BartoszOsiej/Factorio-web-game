import { useState, useEffect, useRef, useCallback } from 'react';
import { t } from '../lib/i18n';

import { CoopLobbyService, type LobbyInfo } from '../services/coop/CoopLobbyService';

interface Props {
  onJoinLobby: (worldCode: string, worldSeed: number) => void;
  onLeaveLobby: () => void;
  lobbyInfo: LobbyInfo | null;
  isHost: boolean;
  onClose: () => void;
}

export default function CoopMenu({ onJoinLobby, onLeaveLobby, lobbyInfo, isHost, onClose }: Props) {
  const [view, setView] = useState<'lobby' | 'create' | 'join' | 'active'>(lobbyInfo ? 'active' : 'lobby');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState(lobbyInfo?.members || []);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (lobbyInfo) {
      setView('active');
      setMembers(lobbyInfo.members);

      heartbeatRef.current = setInterval(() => {
        CoopLobbyService.heartbeat(lobbyInfo.worldCode);
      }, 5000);

      refreshRef.current = setInterval(async () => {
        const info = await CoopLobbyService.getLobbyInfo(lobbyInfo.worldCode);
        if (info) setMembers(info.members);
      }, 3000);

      return () => {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        if (refreshRef.current) clearInterval(refreshRef.current);
      };
    }
  }, [lobbyInfo]);

  const handleCreate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const info = await CoopLobbyService.createLobby((window as any).__gameState);
      onJoinLobby(info.worldCode, info.worldSeed);
    } catch (e: any) {
      setError(e?.message || 'Failed to create lobby');
    }
    setLoading(false);
  }, [onJoinLobby]);

  const handleJoin = useCallback(async () => {
    if (joinCode.length < 4) { setError('Enter a valid code'); return; }
    setLoading(true);
    setError('');
    try {
      const info = await CoopLobbyService.joinLobby(joinCode.toUpperCase());
      onJoinLobby(info.worldCode, info.worldSeed);
    } catch (e: any) {
      setError(e?.message || 'Failed to join');
    }
    setLoading(false);
  }, [joinCode, onJoinLobby]);

  const handleLeave = useCallback(async () => {
    if (lobbyInfo) {
      await CoopLobbyService.leaveLobby(lobbyInfo.worldCode);
    }
    onLeaveLobby();
    setView('lobby');
    setMembers([]);
  }, [lobbyInfo, onLeaveLobby]);

  const copyCode = () => {
    if (lobbyInfo) {
      navigator.clipboard.writeText(lobbyInfo.worldCode);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-sm mx-4 overflow-hidden font-exo"
        style={{
          background: 'linear-gradient(180deg, #0f1418 0%, #0a0d11 100%)',
          border: '1px solid rgba(244,114,182,0.2)',
          borderTop: '1px solid rgba(244,114,182,0.4)',
          boxShadow: '0 0 60px rgba(0,0,0,0.8)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(244,114,182,0.1)' }}>
          <h2 className="font-orbitron font-bold text-base tracking-wider" style={{ color: '#f472b6' }}>🌐 {t('coopTitle')}</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors font-orbitron text-sm">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {view === 'lobby' && (
            <>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full py-3 rounded-xl font-orbitron font-bold text-sm tracking-wider transition-all disabled:opacity-40"
                style={{ background: 'rgba(244,114,182,0.15)', color: '#f472b6', border: '1px solid rgba(244,114,182,0.3)' }}
              >
                {loading ? '...' : '🏗️ Create World'}
              </button>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <span className="text-[10px] text-white/20 font-orbitron">OR</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              </div>

              <div>
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter world code"
                  maxLength={6}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-mono tracking-widest text-center outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', color: '#f472b6', border: '1px solid rgba(244,114,182,0.2)' }}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                />
                <button
                  onClick={handleJoin}
                  disabled={loading || joinCode.length < 4}
                  className="w-full mt-2 py-2.5 rounded-xl font-orbitron font-bold text-sm tracking-wider transition-all disabled:opacity-40"
                  style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}
                >
                  {loading ? '...' : '🔗 Join World'}
                </button>
              </div>

              {error && <div className="text-xs text-red-400 text-center font-orbitron">{error}</div>}
            </>
          )}

          {view === 'active' && lobbyInfo && (
            <>
              <div className="p-3 rounded-xl" style={{ background: 'rgba(244,114,182,0.06)', border: '1px solid rgba(244,114,182,0.15)' }}>
                <div className="text-[10px] font-orbitron tracking-wider mb-1.5" style={{ color: 'rgba(244,114,182,0.6)' }}>WORLD CODE</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono px-2 py-1.5 rounded-lg text-center tracking-[0.3em]" style={{ background: 'rgba(0,0,0,0.3)', color: '#f472b6', border: '1px solid rgba(244,114,182,0.2)' }}>
                    {lobbyInfo.worldCode}
                  </code>
                  <button
                    onClick={copyCode}
                    className="px-2.5 py-1.5 text-[10px] font-orbitron rounded-lg transition-all"
                    style={{ background: 'rgba(244,114,182,0.15)', color: '#f472b6', border: '1px solid rgba(244,114,182,0.25)' }}
                  >
                    📋
                  </button>
                </div>
                <div className="text-[10px] text-white/20 mt-1 font-orbitron">{isHost ? 'Host · Share code to invite' : 'Connected as guest'}</div>
              </div>

              <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-[10px] font-orbitron tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  PLAYERS ({members.length})
                </div>
                {members.length === 0 ? (
                  <div className="text-center text-white/20 text-xs py-4 font-orbitron">No players</div>
                ) : (
                  members.map(m => (
                    <div key={m.userId} className="flex items-center gap-2 py-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: m.role === 'host' ? '#f472b6' : '#4ade80' }} />
                      <span className="text-sm text-white/70">{m.username}</span>
                      {m.role === 'host' && <span className="text-[10px] text-white/30 font-orbitron">HOST</span>}
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={handleLeave}
                className="w-full py-2.5 rounded-xl font-orbitron font-bold text-sm tracking-wider transition-all"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                🚪 Leave World
              </button>

              {error && <div className="text-xs text-red-400 text-center font-orbitron">{error}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
