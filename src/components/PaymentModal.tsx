import { useState } from 'react';
import { t } from '../lib/i18n';
import { AuthService } from '../services/auth/AuthService';
import { supabase } from '../lib/supabase';

const PLANS = [
  { id: 'starter', name: 'STARTER', price: 9.99, color: '#f59e0b', priceId: 'price_1TYW6EK4E5IHLVVAW4SaLTXU' },
  { id: 'premium', name: 'PREMIUM', price: 24.99, color: '#a78bfa', priceId: 'price_1TYW9LK4E5IHLVVAZrXNVjWk' },
];

/** Props modalu płatności — callback zamknięcia. */
interface Props {
  onClose: () => void;
}

/** Modal płatności Stripe — wybór subskrypcji (starter/premium) przez Stripe Checkout. */
export default function PaymentModal({ onClose }: Props) {
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'premium'>('starter');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const username = AuthService.getCurrentUser();
  const userId = AuthService.getCurrentUserId();

  const plan = PLANS.find(p => p.id === selectedPlan)!;

  const handleCheckout = async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: fnError } = await supabase.functions.invoke('stripe-checkout', {
        body: {
          priceId: plan.priceId,
          userId,
          username,
          successUrl: window.location.origin + '?checkout=success',
          cancelUrl: window.location.origin + '?checkout=cancel',
        },
      })

      if (fnError) throw new Error(fnError.message)
      if (!data?.url) throw new Error('No checkout URL returned')

      // Redirect to Stripe Checkout
      window.location.href = data.url
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Payment error. Please try again.')
      setLoading(false)
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 max-w-sm w-full mx-4 animate-slide-up font-exo"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #111820 0%, #0c1016 100%)',
          border: '1px solid rgba(216,128,16,0.2)',
          borderTop: '1px solid rgba(216,128,16,0.4)',
          boxShadow: '0 0 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(216,128,16,0.06)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-orbitron font-bold tracking-wider text-base" style={{ color: '#d88010' }}>
            💳 {t('selectPlan').toUpperCase()}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all text-xs"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 text-xs text-center py-2 rounded-lg font-semibold"
            style={{
              background: 'rgba(239,68,68,0.1)',
              color: '#f87171',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Plan selector */}
          <div>
            <label className="block text-[10px] font-orbitron tracking-widest text-white/30 mb-2 uppercase">
              {t('selectPlan')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PLANS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlan(p.id as 'starter' | 'premium')}
                  className="p-3 rounded-xl text-center transition-all"
                  style={{
                    background: selectedPlan === p.id ? `${p.color}15` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${selectedPlan === p.id ? `${p.color}50` : `${p.color}20`}`,
                  }}
                >
                  <div className="font-orbitron font-bold text-[11px] tracking-wider" style={{ color: p.color }}>
                    {p.name}
                  </div>
                  <div className="font-mono text-sm font-bold mt-0.5" style={{ color: p.color }}>
                    {p.price.toFixed(2)} zł/mies.
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Payment info */}
          <div className="p-3 rounded-xl text-xs"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            <span className="text-cyan-400">🔒</span> {t('paymentStripe')} ·{' '}
            {plan.name === 'PREMIUM' ? '24.99 zł/mies.' : '9.99 zł/mies.'} · {t('paymentCancelAnytime')}
          </div>

          {/* Pay button */}
          <button
            onClick={handleCheckout}
            disabled={loading || !userId}
            className="w-full py-3 rounded-xl font-orbitron font-bold text-sm tracking-widest transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${plan.color}cc, ${plan.color})`,
              color: 'white',
              boxShadow: `0 0 20px ${plan.color}30, inset 0 1px 0 rgba(255,255,255,0.1)`,
              border: `1px solid ${plan.color}60`,
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('paymentRedirect')}
              </span>
            ) : (
              `${t('payButton', { price: plan.price.toFixed(2) })} · ${plan.name}`
            )}
          </button>

          {!userId && (
            <div className="text-xs text-center text-yellow-400/70">
              {t('paymentLoginRequired')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
