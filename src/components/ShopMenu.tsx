import { useState } from 'react';
import type { GameState } from '../game/types';
import { t } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { AuthService } from '../services/auth/AuthService';
import PaymentModal from './PaymentModal';

/** Props dla sklepu — engine (do powiadomień), stan gry i callback zamknięcia. */
interface Props {
  engine: { addNotification: (msg: string, type?: 'info' | 'error' | 'success' | 'build') => void };
  state: GameState;
  onClose: () => void;
}

const SKIN_COLORS = [
  { id: 'default', nameKey: 'skinSteelBlue', color: '#3388ee', gemCost: 0, zlCost: 0, priceId: '' },
  { id: 'crimson', nameKey: 'skinCrimson', color: '#cc2233', gemCost: 5, zlCost: 5, priceId: 'price_1TYVfpK4E5IHLVVAA1SYmslG' },
  { id: 'emerald', nameKey: 'skinEmerald', color: '#22aa55', gemCost: 5, zlCost: 5, priceId: 'price_1TYVv5K4E5IHLVVAXhT6osbx' },
  { id: 'gold', nameKey: 'skinGold', color: '#cc9922', gemCost: 8, zlCost: 8, priceId: 'price_1TYVwBK4E5IHLVVAJfZUCG3K' },
  { id: 'obsidian', nameKey: 'skinObsidian', color: '#334455', gemCost: 10, zlCost: 12, priceId: 'price_1TYVx4K4E5IHLVVAbo5r2MkW' },
  { id: 'arctic', nameKey: 'skinArctic', color: '#88ccee', gemCost: 12, zlCost: 15, priceId: 'price_1TYVxcK4E5IHLVVAqTG2lyEO' },
];

const HAT_TYPES = [
  { id: 'none', nameKey: 'hatNone', gemCost: 0, zlCost: 0, priceId: '' },
  { id: 'hardhat', nameKey: 'hatHardHat', gemCost: 8, zlCost: 10, priceId: 'price_1TYVyUK4E5IHLVVAudubM5qg' },
  { id: 'crown', nameKey: 'hatCrown', gemCost: 0, zlCost: 50, priceId: 'price_1TYVzJK4E5IHLVVAGeoq3G7O' },
  { id: 'beret', nameKey: 'hatBeret', gemCost: 10, zlCost: 12, priceId: 'price_1TYVzoK4E5IHLVVAToFxaUUB' },
  { id: 'helmet', nameKey: 'hatMilHelmet', gemCost: 15, zlCost: 20, priceId: 'price_1TYW0KK4E5IHLVVAqq91685S' },
];

const TRAIL_EFFECTS = [
  { id: 'none', nameKey: 'trailNone', gemCost: 0, zlCost: 0, priceId: '' },
  { id: 'sparkle', nameKey: 'trailSparkle', gemCost: 10, zlCost: 12, priceId: 'price_1TYW0zK4E5IHLVVActd503r0' },
  { id: 'flame', nameKey: 'trailFlame', gemCost: 0, zlCost: 20, priceId: 'price_1TYW1UK4E5IHLVVAVnQdxNYy' },
  { id: 'electric', nameKey: 'trailElectric', gemCost: 0, zlCost: 30, priceId: 'price_1TYW26K4E5IHLVVAV2y4L9r7' },
  { id: 'rainbow', nameKey: 'trailRainbow', gemCost: 0, zlCost: 50, priceId: 'price_1TYW2ZK4E5IHLVVAKUdeeXRQ' },
];

const BOOST_PACKS = [
  { id: 'speed_boost', nameKey: 'boostSpeed', descKey: 'boostSpeedDesc', gemCost: 3, zlCost: 5, icon: '⚡', color: '#fbbf24', priceId: 'price_1TYW3AK4E5IHLVVAkj7iFjem' },
  { id: 'mining_boost', nameKey: 'boostMining', descKey: 'boostMiningDesc', gemCost: 3, zlCost: 5, icon: '⛏', color: '#f97316', priceId: 'price_1TYW3eK4E5IHLVVAEQpIBt7z' },
  { id: 'xp_boost', nameKey: 'boostXP', descKey: 'boostXPDesc', gemCost: 5, zlCost: 8, icon: '⭐', color: '#a78bfa', priceId: 'price_1TYW42K4E5IHLVVATGU8HJ2s' },
  { id: 'shield', nameKey: 'boostShield', descKey: 'boostShieldDesc', gemCost: 5, zlCost: 8, icon: '🛡', color: '#38bdf8', priceId: 'price_1TYW4OK4E5IHLVVAcBO5zYoN' },
];

const PREMIUM_TIERS = [
  {
    id: 'free' as const,
    name: 'FREE',
    price: '0 zł',
    color: '#94a3b8',
    features: ['Basic inventory (30 slots)', '1 save slot', '5 friends max', 'Standard chat'],
  },
  {
    id: 'starter' as const,
    name: 'STARTER',
    price: '9.99 zł/mies.',
    color: '#f59e0b',
    features: ['50 inventory slots', '3 save slots', '20 friends', 'Priority chat', 'Exclusive Starter badge', '+1 gem/level'],
  },
  {
    id: 'premium' as const,
    name: 'PREMIUM',
    price: '24.99 zł/mies.',
    color: '#a78bfa',
    features: ['Unlimited inventory', '10 save slots', 'Unlimited friends', 'Custom chat color', 'All cosmetics unlocked', 'Rainbow trail', '+2 gems/level', 'Early access features'],
  },
];

/** Sklep — kosmetyki (skiny, kapelusze, traile), boosty (speed, mining, XP, shield) i subskrypcje premium przez Stripe. */
export default function ShopMenu({ engine, state, onClose }: Props) {
  const [tab, setTab] = useState<'cosmetics' | 'boosts' | 'premium'>('cosmetics');
  const [message, setMessage] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [stripeLoading, setStripeLoading] = useState<string | null>(null);

  const handleStripeCheckout = async (priceId: string, label: string) => {
    setStripeLoading(label);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('stripe-checkout', {
        body: {
          priceId,
          userId: AuthService.getCurrentUserId(),
          username: AuthService.getCurrentUser(),
          successUrl: 'https://factoryworld.mmc29213.workers.dev/?checkout=success',
          cancelUrl: 'https://factoryworld.mmc29213.workers.dev/?checkout=cancel',
        },
      })
      if (fnError) throw new Error(fnError.message)
      if (!data?.url) throw new Error('No checkout URL')
      window.location.href = data.url
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : 'Stripe error')
      setStripeLoading(null)
    }
  };

  const purchaseWithGems = (gemCost: number, callback: () => void) => {
    if (state.player.gems < gemCost) { setMessage(t('insufficientGems')); return; }
    state.player.gems -= gemCost;
    callback();
    setMessage(t('purchased'));
    engine.addNotification(t('purchased'), 'success');
  };

  const purchaseWithZl = (zlCost: number, callback: () => void) => {
    if (state.player.premiumBalance < zlCost) { setMessage(t('insufficientBalance')); return; }
    state.player.premiumBalance -= zlCost;
    callback();
    setMessage(t('purchased'));
    engine.addNotification(t('purchased'), 'success');
  };

  const isError = message === t('insufficientBalance') || message === t('insufficientGems');

  return (
    <>
    {showPayment && <PaymentModal onClose={() => setShowPayment(false)} />}
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={onClose}>
      <div
        className="panel-glass rounded-2xl p-5 max-w-lg w-full mx-4 max-h-[82vh] overflow-y-auto animate-slide-up font-exo"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: '1px solid rgba(6,182,212,0.15)' }}>
          <div>
            <h2 className="font-orbitron font-bold text-lg tracking-wider" style={{ color: '#06b6d4' }}>{t('shop').toUpperCase()}</h2>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-cyan-400 text-sm">💎</span>
                <span className="text-cyan-300 font-mono font-bold tabular-nums">{state.player.gems}</span>
                <span className="text-white/20 text-xs">{t('gems')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-green-400 font-mono font-bold tabular-nums">{state.player.premiumBalance.toFixed(2)}</span>
                <span className="text-white/20 text-xs">zł</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all text-sm font-orbitron">✕</button>
        </div>

        {/* Feedback message */}
        {message && (
          <div
            className="text-xs text-center mb-3 py-1.5 rounded-lg font-semibold"
            style={{
              background: isError ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
              color: isError ? '#f87171' : '#4ade80',
              border: `1px solid ${isError ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
            }}
          >{message}</div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: 'rgba(0,0,0,0.3)' }}>
          {(['cosmetics', 'boosts', 'premium'] as const).map(tabKey => (
            <button
              key={tabKey}
              onClick={() => { setTab(tabKey); setMessage(''); }}
              className="flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all duration-200 font-exo capitalize"
              style={{
                background: tab === tabKey ? 'rgba(6,182,212,0.15)' : 'transparent',
                color: tab === tabKey ? '#06b6d4' : 'rgba(255,255,255,0.35)',
                border: `1px solid ${tab === tabKey ? 'rgba(6,182,212,0.3)' : 'transparent'}`,
                boxShadow: tab === tabKey ? '0 0 15px rgba(6,182,212,0.1)' : 'none',
              }}
            >
              {tabKey === 'premium' ? `👑 ${t('account')}` : tabKey === 'cosmetics' ? t('cosmetics') : t('boosts')}
            </button>
          ))}
        </div>

        {tab === 'cosmetics' && (
          <div className="space-y-5">
            <CosmeticSection title={t('skinColor')}>
              <div className="grid grid-cols-3 gap-2">
                {SKIN_COLORS.map(skin => {
                  const owned = state.player.cosmetics.skinColor === skin.color;
                  const cb = () => { state.player.cosmetics.skinColor = skin.color; };
                  return (
                    <div key={skin.id}
                      className="p-2.5 rounded-xl text-center transition-all"
                      style={{
                        background: owned ? `${skin.color}18` : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${owned ? `${skin.color}50` : 'rgba(255,255,255,0.06)'}`,
                        boxShadow: owned ? `0 0 12px ${skin.color}20` : 'none',
                      }}
                    >
                      <div className="w-8 h-8 rounded-full mx-auto mb-1.5" style={{ backgroundColor: skin.color, boxShadow: `0 0 12px ${skin.color}60` }} />
                      <div className="text-[11px] text-white/70 font-medium mb-1.5">{t(skin.nameKey)}</div>
                      {skin.gemCost === 0 && skin.zlCost === 0
                        ? <div className="text-[10px] text-white/30">{t('free')}</div>
                        : <div className="flex gap-1 justify-center flex-wrap">
                            {skin.gemCost > 0 && (
                              <button onClick={() => purchaseWithGems(skin.gemCost, cb)}
                                className="text-[9px] px-1.5 py-0.5 rounded-md font-bold transition-all hover:opacity-80 active:scale-95"
                                style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }}>
                                💎 {skin.gemCost}
                              </button>
                            )}
                            <button onClick={() => purchaseWithZl(skin.zlCost, cb)}
                              className="text-[9px] px-1.5 py-0.5 rounded-md font-bold transition-all hover:opacity-80 active:scale-95"
                              style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
                              {skin.zlCost.toFixed(2)} zł
                            </button>
                            {skin.priceId && (
                              <button onClick={() => handleStripeCheckout(skin.priceId, skin.id)}
                                disabled={stripeLoading === skin.id}
                                className="text-[9px] px-1.5 py-0.5 rounded-md font-bold transition-all hover:opacity-80 active:scale-95 disabled:opacity-50"
                                style={{ background: 'rgba(168,85,247,0.12)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.25)' }}>
                                {stripeLoading === skin.id ? '⏳' : '💳'}
                              </button>
                            )}
                          </div>
                      }
                    </div>
                  );
                })}
              </div>
            </CosmeticSection>

            <CosmeticSection title={t('hat')}>
              <div className="grid grid-cols-3 gap-2">
                {HAT_TYPES.map(hat => {
                  const owned = state.player.cosmetics.hatType === hat.id;
                  const cb = () => { state.player.cosmetics.hatType = hat.id; };
                  return (
                    <div key={hat.id}
                      className="p-2.5 rounded-xl text-center transition-all"
                      style={{
                        background: owned ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${owned ? 'rgba(6,182,212,0.35)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <div className="text-xl mb-1">🎩</div>
                      <div className="text-[11px] text-white/70 font-medium mb-1.5">{t(hat.nameKey)}</div>
                      {hat.gemCost === 0 && hat.zlCost === 0
                        ? <div className="text-[10px] text-white/30">{t('free')}</div>
                        : <div className="flex gap-1 justify-center flex-wrap">
                            {hat.gemCost > 0 && (
                              <button onClick={() => purchaseWithGems(hat.gemCost, cb)}
                                className="text-[9px] px-1.5 py-0.5 rounded-md font-bold transition-all hover:opacity-80 active:scale-95"
                                style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }}>
                                💎 {hat.gemCost}
                              </button>
                            )}
                            <button onClick={() => purchaseWithZl(hat.zlCost, cb)}
                              className="text-[9px] px-1.5 py-0.5 rounded-md font-bold transition-all hover:opacity-80 active:scale-95"
                              style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
                              {hat.zlCost.toFixed(2)} zł
                            </button>
                            {hat.priceId && (
                              <button onClick={() => handleStripeCheckout(hat.priceId, hat.id)}
                                disabled={stripeLoading === hat.id}
                                className="text-[9px] px-1.5 py-0.5 rounded-md font-bold transition-all hover:opacity-80 active:scale-95 disabled:opacity-50"
                                style={{ background: 'rgba(168,85,247,0.12)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.25)' }}>
                                {stripeLoading === hat.id ? '⏳' : '💳'}
                              </button>
                            )}
                          </div>
                      }
                    </div>
                  );
                })}
              </div>
            </CosmeticSection>

            <CosmeticSection title={t('trailEffect')}>
              <div className="grid grid-cols-3 gap-2">
                {TRAIL_EFFECTS.map(trail => {
                  const owned = state.player.cosmetics.trailEffect === trail.id;
                  const cb = () => { state.player.cosmetics.trailEffect = trail.id; };
                  return (
                    <div key={trail.id}
                      className="p-2.5 rounded-xl text-center transition-all"
                      style={{
                        background: owned ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${owned ? 'rgba(6,182,212,0.35)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <div className="text-[11px] text-white/70 font-medium mb-1.5">{t(trail.nameKey)}</div>
                      {trail.gemCost === 0 && trail.zlCost === 0
                        ? <div className="text-[10px] text-white/30">{t('free')}</div>
                        : <div className="flex gap-1 justify-center flex-wrap">
                            {trail.gemCost > 0 && (
                              <button onClick={() => purchaseWithGems(trail.gemCost, cb)}
                                className="text-[9px] px-1.5 py-0.5 rounded-md font-bold transition-all hover:opacity-80 active:scale-95"
                                style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }}>
                                💎 {trail.gemCost}
                              </button>
                            )}
                            <button onClick={() => purchaseWithZl(trail.zlCost, cb)}
                              className="text-[9px] px-1.5 py-0.5 rounded-md font-bold transition-all hover:opacity-80 active:scale-95"
                              style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
                              {trail.zlCost.toFixed(2)} zł
                            </button>
                            {trail.priceId && (
                              <button onClick={() => handleStripeCheckout(trail.priceId, trail.id)}
                                disabled={stripeLoading === trail.id}
                                className="text-[9px] px-1.5 py-0.5 rounded-md font-bold transition-all hover:opacity-80 active:scale-95 disabled:opacity-50"
                                style={{ background: 'rgba(168,85,247,0.12)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.25)' }}>
                                {stripeLoading === trail.id ? '⏳' : '💳'}
                              </button>
                            )}
                          </div>
                      }
                    </div>
                  );
                })}
              </div>
            </CosmeticSection>
          </div>
        )}

        {tab === 'boosts' && (
          <div className="grid grid-cols-2 gap-2.5">
            {BOOST_PACKS.map(pack => {
              const applyBoost = () => {
                switch (pack.id) {
                  case 'speed_boost': state.player.speed = Math.min(state.player.speed * 1.05, state.player.speed * 1.1); break;
                  case 'mining_boost': state.player.miningSpeed = Math.min(state.player.miningSpeed * 1.1, state.player.miningSpeed * 1.2); break;
                  case 'xp_boost': state.player.craftingSpeed = Math.min(state.player.craftingSpeed * 1.2, state.player.craftingSpeed * 1.4); break;
                  case 'shield': state.player.health = Math.min(state.player.health + state.player.maxHealth * 0.25, state.player.maxHealth); break;
                }
              };
              return (
                <div
                  key={pack.id}
                  className="p-4 rounded-xl text-left"
                  style={{
                    background: `${pack.color}08`,
                    border: `1px solid ${pack.color}25`,
                    boxShadow: `0 0 15px ${pack.color}08`,
                  }}
                >
                  <div className="text-2xl mb-2">{pack.icon}</div>
                  <div className="text-sm text-white/85 font-semibold">{t(pack.nameKey)}</div>
                  <div className="text-[11px] text-white/30 mt-1 mb-2 leading-tight">{t(pack.descKey)}</div>
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => purchaseWithGems(pack.gemCost, applyBoost)}
                      className="text-[10px] px-2 py-0.5 rounded-md font-bold transition-all hover:opacity-80 active:scale-95"
                      style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)' }}>
                      💎 {pack.gemCost}
                    </button>
                    <button onClick={() => purchaseWithZl(pack.zlCost, applyBoost)}
                      className="text-[10px] px-2 py-0.5 rounded-md font-bold transition-all hover:opacity-80 active:scale-95"
                      style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
                      {pack.zlCost.toFixed(2)} zł
                    </button>
                    {pack.priceId && (
                      <button onClick={() => handleStripeCheckout(pack.priceId, pack.id)}
                        disabled={stripeLoading === pack.id}
                        className="text-[10px] px-2 py-0.5 rounded-md font-bold transition-all hover:opacity-80 active:scale-95 disabled:opacity-50"
                        style={{ background: 'rgba(168,85,247,0.12)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.25)' }}>
                        {stripeLoading === pack.id ? '⏳' : '💳'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'premium' && (
          <div className="space-y-3">
            <p className="text-xs text-white/30 text-center mb-4 font-exo">{t('selectPlan')} · {t('paymentStripe')}</p>
            {PREMIUM_TIERS.map(tier => {
              const isCurrent = state.player.premiumTier === tier.id;
              return (
                <div
                  key={tier.id}
                  className="rounded-xl p-4 transition-all"
                  style={{
                    background: isCurrent ? `${tier.color}10` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isCurrent ? `${tier.color}50` : `${tier.color}20`}`,
                    boxShadow: isCurrent ? `0 0 20px ${tier.color}15` : 'none',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-orbitron font-bold text-sm tracking-wider" style={{ color: tier.color }}>{tier.name}</span>
                      {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: `${tier.color}20`, color: tier.color }}>{t('currentPlan').toUpperCase()}</span>}
                    </div>
                    <span className="font-mono text-sm font-bold" style={{ color: tier.color }}>{tier.price}</span>
                  </div>
                  <ul className="space-y-1 mb-3">
                    {tier.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-[11px]" style={{ color: isCurrent ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)' }}>
                        <span style={{ color: tier.color }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && (
                    <button
                      onClick={() => setShowPayment(true)}
                      className="w-full py-1.5 rounded-lg text-xs font-semibold font-orbitron tracking-wider transition-all hover:opacity-90 active:scale-95"
                      style={{ background: `${tier.color}20`, color: tier.color, border: `1px solid ${tier.color}40` }}
                    >
                      {t('buy').toUpperCase()}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </>
  );
}

/** Sekcja kosmetyków z nagłówkiem (linia + tytuł). */
function CosmeticSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ boxShadow: '0 0 5px #06b6d4' }} />
        <span className="text-[10px] font-orbitron tracking-[0.2em] text-cyan-400/50 uppercase">{title}</span>
      </div>
      {children}
    </div>
  );
}

