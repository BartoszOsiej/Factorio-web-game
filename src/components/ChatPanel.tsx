import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { AuthService } from '../services/auth/AuthService';
import { TradeService } from '../services/trade/TradeService';
import { t } from '../lib/i18n';
import type { RealtimeChannel } from '@supabase/supabase-js';

const MAX_MSG_LEN = 200;
const HISTORY_LIMIT = 50;

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  created_at: string;
  channel?: string;
}

interface Props {
  onClose?: () => void;
  onTradeFeeCreated?: () => void;
}

export default function ChatPanel({ onClose, onTradeFeeCreated }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [channel, setChannel] = useState<'global' | 'trade'>('global');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const minimizedRef = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const username = AuthService.getCurrentUser();
  const userId = AuthService.getCurrentUserId();
  const isMobile = window.innerWidth < 768;

  const filteredMessages = messages.filter(m => (m.channel ?? 'global') === channel);

  useEffect(() => { minimizedRef.current = minimized; }, [minimized]);

  useEffect(() => {
    supabase
      .from('chat_messages')
      .select('id,username,message,created_at,channel')
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(({ data }) => {
        if (data) setMessages((data as ChatMessage[]).reverse());
      });

    const ch = supabase
      .channel('global-chat', { config: { broadcast: { self: true } } })
      .on('broadcast', { event: 'msg' }, ({ payload }) => {
        const msg = payload as ChatMessage;
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev.slice(-(HISTORY_LIMIT - 1)), msg];
        });
        if (minimizedRef.current) setUnread(u => u + 1);
      })
      .subscribe();

    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, []);

  useEffect(() => {
    if (!minimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnread(0);
    }
  }, [filteredMessages, minimized]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !username || sending) return;
    const msg = input.trim().slice(0, MAX_MSG_LEN);
    setInput('');
    setSendError('');
    setSending(true);

    const newMsg: ChatMessage = {
      id: crypto.randomUUID(),
      username,
      message: msg,
      channel,
      created_at: new Date().toISOString(),
    };

    channelRef.current?.send({ type: 'broadcast', event: 'msg', payload: newMsg });

    const { error } = await supabase.from('chat_messages').insert({
      id: newMsg.id,
      username,
      message: msg,
      user_id: userId,
      channel,
    });

    if (error) {
      setSendError('⚠ ' + t('chatHistoryError'));
      setTimeout(() => setSendError(''), 3000);
    }

    setSending(false);
  }, [input, username, sending, channel, userId]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Price scanner for trade channel: tracks last price mention per user
  const priceTracker = useRef<{ user: string; price: number; msg: string } | null>(null);
  const [pendingDeal, setPendingDeal] = useState<{ seller: string; buyer: string; price: number; msg: string } | null>(null);

  useEffect(() => {
    if (channel !== 'trade') return;
    const lastMsg = filteredMessages[filteredMessages.length - 1];
    if (!lastMsg || lastMsg.username === username) return;
    const price = TradeService.scanMessageForPrice(lastMsg.message);
    if (price && price > 0) {
      // First price mention → potential seller
      if (!priceTracker.current || priceTracker.current.user === lastMsg.username) {
        priceTracker.current = { user: lastMsg.username, price, msg: lastMsg.message };
      } else {
        // Different user mentions a price → potential agreement
        setPendingDeal({
          seller: priceTracker.current.user,
          buyer: lastMsg.username,
          price,
          msg: lastMsg.message,
        });
        priceTracker.current = null;
      }
    }
  }, [filteredMessages, channel, username]);

  const handleConfirmDeal = async () => {
    const deal = pendingDeal;
    if (!deal || !userId || !username) return;
    try {
      const fee = await TradeService.createFeeFromChat(
        deal.seller, deal.seller,
        deal.buyer, deal.buyer,
        deal.price, 'item', 1, deal.msg,
      );
      setPendingDeal(null);
      setSendError('Fee created! Pay ' + (fee.amount_grosz / 100).toFixed(2) + ' PLN');
      setTimeout(() => setSendError(''), 5000);
      onTradeFeeCreated?.();
    } catch (err) {
      setSendError('Failed: ' + String(err));
    }
  };

  if (minimized) {
    return (
      <div
        className="fixed z-25 cursor-pointer"
        style={{ bottom: isMobile ? '160px' : '96px', right: isMobile ? '8px' : '16px' }}
        onClick={() => { setMinimized(false); setUnread(0); }}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl font-orbitron text-xs"
          style={{
            background: 'rgba(10,14,20,0.95)',
            border: '1px solid rgba(216,128,16,0.3)',
            color: 'rgba(205,197,178,0.7)',
          }}
        >
          💬 {channel === 'trade' ? 'Trade' : 'Chat'} {unread > 0 && <span className="bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]">{unread}</span>}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-25 flex flex-col overflow-hidden font-exo"
      style={{
        background: 'linear-gradient(180deg, rgba(10,14,20,0.97) 0%, rgba(6,8,12,0.97) 100%)',
        border: '1px solid rgba(216,128,16,0.2)',
        borderTop: '1px solid rgba(216,128,16,0.4)',
        boxShadow: '0 0 40px rgba(0,0,0,0.8)',
        ...(isMobile ? {
          bottom: 0,
          right: 0,
          left: 0,
          width: '100%',
          height: '45vh',
          borderRadius: '20px 20px 0 0',
        } : {
          bottom: '96px',
          right: '16px',
          width: '288px',
          height: '280px',
          borderRadius: '16px',
        }),
      }}
    >
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex gap-1">
          <button
            onClick={() => setChannel('global')}
            className={`text-[10px] font-orbitron px-2 py-1 rounded transition-colors ${channel === 'global' ? 'bg-amber-900/30 text-amber-400' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            Global
          </button>
          <button
            onClick={() => setChannel('trade')}
            className={`text-[10px] font-orbitron px-2 py-1 rounded transition-colors ${channel === 'trade' ? 'bg-amber-900/30 text-amber-400' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            Trade
          </button>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setMinimized(true)} className="text-white/30 hover:text-white/60 text-xs px-1">—</button>
          {onClose && <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xs px-1">✕</button>}
        </div>
      </div>
      {pendingDeal && (
        <div className="mx-3 mt-1 p-2 bg-amber-900/30 border border-amber-700/50 rounded-lg flex items-center justify-between animate-pulse">
          <div className="text-xs text-amber-300">
            🤝 Deal: {pendingDeal.seller} ↔ {pendingDeal.buyer}<br />
            <span className="text-amber-400 font-bold">{pendingDeal.price} PLN</span>
          </div>
          <button
            onClick={handleConfirmDeal}
            className="text-[10px] bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded font-bold"
          >
            Confirm
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
        {filteredMessages.length === 0 && (
          <div className="text-center text-white/20 text-xs mt-4 font-orbitron">{t('chatEmpty')}</div>
        )}
        {filteredMessages.map(msg => {
          const isOwn = msg.username === username;
          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div
                className="text-xs leading-relaxed max-w-[80%] px-2 py-1 rounded-lg"
                style={{
                  background: isOwn ? 'rgba(216,128,16,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isOwn ? 'rgba(216,128,16,0.25)' : 'rgba(255,255,255,0.06)'}`,
                  textAlign: isOwn ? 'right' : 'left',
                }}
              >
                {!isOwn && (
                  <span className="font-semibold mr-1.5" style={{ color: 'rgba(56,189,248,0.8)' }}>
                    {msg.username}:
                  </span>
                )}
                <span style={{ color: 'rgba(205,197,178,0.8)' }}>{msg.message}</span>
                {isOwn && (
                  <span className="font-semibold ml-1.5" style={{ color: '#d88010' }}>
                    {t('chatMe')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-2 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {sendError && <div className="text-[10px] text-yellow-400/80 mb-1 px-1">{sendError}</div>}
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={username ? t('typeMessage') : t('chatLoginToChat')}
            disabled={!username}
            className="flex-1 px-2 py-1.5 text-xs rounded-lg outline-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.8)',
              caretColor: '#d88010',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !username}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold disabled:opacity-30 transition-all"
            style={{ background: 'rgba(216,128,16,0.2)', color: '#d88010', border: '1px solid rgba(216,128,16,0.3)' }}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
