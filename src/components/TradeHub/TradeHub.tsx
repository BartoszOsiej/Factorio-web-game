import { useState, useEffect, useCallback } from 'react';
import { TradeService, type TradeListing, type TradeAgreement, type TradeFee, type TradeBan } from '../../services/trade/TradeService';
import { AuthService } from '../../services/auth/AuthService';
import { t } from '../../lib/i18n';

interface Props {
  onClose: () => void;
}

type Tab = 'browse' | 'myListings' | 'agreements' | 'fees';

const ITEMS = [
  { id: 'gem', name: 'Gem', icon: '💎' },
  { id: 'iron_plate', name: 'Iron Plate', icon: '⬜' },
  { id: 'copper_plate', name: 'Copper Plate', icon: '🟧' },
  { id: 'steel_plate', name: 'Steel Plate', icon: '⬛' },
  { id: 'circuit', name: 'Circuit', icon: '🔵' },
  { id: 'coal', name: 'Coal', icon: '⚫' },
  { id: 'stone', name: 'Stone', icon: '🪨' },
  { id: 'wood', name: 'Wood', icon: '🪵' },
];

export default function TradeHub({ onClose }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [tab, setTab] = useState<Tab>('browse');
  const [listings, setListings] = useState<TradeListing[]>([]);
  const [myListings, setMyListings] = useState<TradeListing[]>([]);
  const [agreements, setAgreements] = useState<TradeAgreement[]>([]);
  const [fees, setFees] = useState<TradeFee[]>([]);
  const [ban, setBan] = useState<TradeBan | null>(null);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create listing form
  const [showCreate, setShowCreate] = useState(false);
  const [newItem, setNewItem] = useState('gem');
  const [newQty, setNewQty] = useState(1);
  const [newPrice, setNewPrice] = useState(10);

  const [paying, setPaying] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const uid = AuthService.getCurrentUserId();
    const uname = AuthService.getCurrentUser();
    if (!uid || !uname) return;
    setUserId(uid);
    setUsername(uname);

    try {
      const [listings, myListings, agreements, fees, ban, unpaid] = await Promise.all([
        TradeService.getActiveListings(),
        TradeService.getMyListings(uid),
        TradeService.getMyAgreements(uid),
        TradeService.getMyFees(uid),
        TradeService.checkBan(uid),
        TradeService.getUnpaidCount(uid),
      ]);
      setListings(listings);
      setMyListings(myListings);
      setAgreements(agreements);
      setFees(fees);
      setBan(ban);
      setUnpaidCount(unpaid);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!userId) return;
    try {
      await TradeService.createListing(userId, username, newItem, newQty, newPrice);
      setShowCreate(false);
      loadData();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCancelListing = async (id: string) => {
    try {
      await TradeService.cancelListing(id);
      loadData();
    } catch (err) {
      setError(String(err));
    }
  };

  const handlePayFee = async (fee: TradeFee) => {
    if (!userId) return;
    setPaying(fee.id);
    try {
      const url = await TradeService.payFee(fee, userId, username);
      window.open(url, '_blank');
    } catch (err) {
      setError(String(err));
    } finally {
      setPaying(null);
    }
  };

  if (ban) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.9)' }}>
        <div className="bg-zinc-900 rounded-xl p-8 max-w-md w-full mx-4 border border-red-800 text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h2 className="text-xl font-bold text-red-400 mb-2 font-orbitron">TRADE BANNED</h2>
          <p className="text-zinc-400 mb-4">{ban.reason}</p>
          <p className="text-zinc-600 text-sm mb-6">Unpaid agreements: {ban.unpaid_agreements}/10</p>
          <button onClick={onClose} className="btn-factory px-6 py-2 text-zinc-400 hover:text-white">
            {t('close')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#080c12' }}>
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="bg-zinc-900 rounded-xl max-w-2xl w-full mx-4 border border-amber-800/30 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-bold text-amber-400 font-orbitron">TRADE HUB</h2>
          <div className="flex items-center gap-2">
            {unpaidCount > 0 && (
              <span className="text-xs text-red-400 bg-red-900/30 px-2 py-1 rounded">
                {unpaidCount}/10 unpaid
              </span>
            )}
            <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none">&times;</button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-2 p-2 bg-red-900/30 border border-red-800 rounded text-red-300 text-xs">
            {error}
            <button onClick={() => setError('')} className="ml-2 text-red-400">&times;</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {([
            ['browse', 'Browse', listings.filter(l => l.seller_id !== userId).length],
            ['myListings', 'My Offers', myListings.length],
            ['agreements', 'Deals', agreements.length],
            ['fees', 'Fees', fees.filter(f => f.status === 'pending').length],
          ] as [Tab, string, number][]).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2.5 text-xs font-orbitron tracking-wide transition-colors relative
                ${tab === key ? 'text-amber-400 bg-amber-900/10' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {label}
              {count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${key === 'fees' && tab !== 'fees' ? 'bg-red-800 text-red-200 animate-pulse' : 'bg-zinc-800 text-zinc-400'}`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center text-zinc-500 py-8">Loading...</div>
          ) : tab === 'browse' ? (
            <BrowseView listings={listings.filter(l => l.seller_id !== userId)} currentUserId={userId ?? ''} />
          ) : tab === 'myListings' ? (
            <MyListingsView
              listings={myListings}
              onCancel={handleCancelListing}
              onCreate={() => setShowCreate(true)}
            />
          ) : tab === 'agreements' ? (
            <AgreementsView agreements={agreements} />
          ) : (
            <FeesView fees={fees} onPay={handlePayFee} paying={paying} />
          )}
        </div>

        {/* Create listing modal */}
        {showCreate && (
          <div className="p-4 border-t border-zinc-800 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Item</label>
                <select
                  value={newItem}
                  onChange={e => setNewItem(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
                >
                  {ITEMS.map(item => (
                    <option key={item.id} value={item.id}>{item.icon} {item.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Quantity</label>
                <input
                  type="number" min={1} value={newQty}
                  onChange={e => setNewQty(parseInt(e.target.value) || 1)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Price (PLN)</label>
              <input
                type="number" min={1} value={newPrice}
                onChange={e => setNewPrice(parseInt(e.target.value) || 1)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreate} className="flex-1 btn-factory bg-amber-700 hover:bg-amber-600 text-white py-2 rounded text-sm font-bold">
                Post Offer
              </button>
              <button onClick={() => setShowCreate(false)} className="px-4 text-zinc-500 hover:text-white text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function BrowseView({ listings }: { listings: TradeListing[]; currentUserId: string }) {
  if (listings.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-2">📭</div>
        <p className="text-zinc-500 text-sm">No active listings</p>
      </div>
    );
  }
  return (
    <>
      {listings.map(l => (
        <div key={l.id} className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-white">{l.item_name} x{l.item_quantity}</div>
            <div className="text-xs text-zinc-500">by {l.seller_username}</div>
          </div>
          <div className="text-right">
            <div className="text-amber-400 font-bold">{l.price_pln} PLN</div>
            <div className="text-[10px] text-zinc-600">Contact seller via Trade Chat</div>
          </div>
        </div>
      ))}
    </>
  );
}

function MyListingsView({ listings, onCancel, onCreate }: {
  listings: TradeListing[]; onCancel: (id: string) => void; onCreate: () => void;
}) {
  return (
    <>
      <button onClick={onCreate} className="w-full bg-amber-700 hover:bg-amber-600 text-white py-2.5 rounded-lg text-sm font-bold mb-3 transition-colors">
        + New Offer
      </button>
      {listings.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">📦</div>
          <p className="text-zinc-500 text-sm">No offers yet</p>
        </div>
      ) : (
        listings.map(l => (
          <div key={l.id} className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="text-sm text-white">{l.item_name} x{l.item_quantity}</div>
              <div className="text-xs">
                <span className={`${l.status === 'active' ? 'text-green-400' : 'text-zinc-500'}`}>{l.status}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-amber-400 font-bold">{l.price_pln} PLN</div>
              {l.status === 'active' && (
                <button onClick={() => onCancel(l.id)} className="text-xs text-red-400 hover:text-red-300">
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </>
  );
}

function AgreementsView({ agreements }: { agreements: TradeAgreement[] }) {
  if (agreements.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-2">🤝</div>
        <p className="text-zinc-500 text-sm">No deals yet</p>
      </div>
    );
  }
  return (
    <>
      {agreements.map(a => (
        <div key={a.id} className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm text-white">{a.item_name} x{a.item_quantity}</div>
            <span className={`text-xs px-2 py-0.5 rounded ${statusColor(a.status)}`}>{a.status}</span>
          </div>
          <div className="text-xs text-zinc-500">
            {a.price_pln} PLN · buyer: {a.buyer_username}
          </div>
          {a.chat_proof && (
            <div className="mt-1 text-[10px] text-zinc-600 italic bg-zinc-900/50 rounded px-2 py-1">
              "{a.chat_proof}"
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function FeesView({ fees, onPay, paying }: {
  fees: TradeFee[]; onPay: (fee: TradeFee) => void; paying: string | null;
}) {
  const pending = fees.filter(f => f.status === 'pending');
  const paid = fees.filter(f => f.status === 'paid');

  if (fees.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-2">💳</div>
        <p className="text-zinc-500 text-sm">No fees</p>
      </div>
    );
  }

  return (
    <>
      {pending.length > 0 && (
        <>
          <div className="text-xs text-red-400 font-orbitron mb-2">PENDING ({pending.length})</div>
          {pending.map(f => (
            <div key={f.id} className="bg-red-900/20 border border-red-800/40 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="text-sm text-red-300">{(f.amount_grosz / 100).toFixed(2)} PLN fee</div>
                <div className="text-[10px] text-red-500/60">5% service fee</div>
              </div>
              <button
                onClick={() => onPay(f)}
                disabled={paying === f.id}
                className="bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-700 text-white text-xs px-4 py-1.5 rounded transition-colors"
              >
                {paying === f.id ? '...' : 'Pay'}
              </button>
            </div>
          ))}
        </>
      )}
      {paid.length > 0 && (
        <>
          <div className="text-xs text-green-400 font-orbitron mt-4 mb-2">PAID ({paid.length})</div>
          {paid.map(f => (
            <div key={f.id} className="bg-zinc-800/30 border border-zinc-800 rounded-lg p-3 flex items-center justify-between opacity-60">
              <div>
                <div className="text-sm text-zinc-400">{(f.amount_grosz / 100).toFixed(2)} PLN fee</div>
                <div className="text-[10px] text-zinc-600">paid</div>
              </div>
              <div className="text-green-500 text-xs">✅</div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function statusColor(s: string): string {
  switch (s) {
    case 'pending': return 'bg-yellow-900/30 text-yellow-400';
    case 'fee_paid': return 'bg-blue-900/30 text-blue-400';
    case 'completed': return 'bg-green-900/30 text-green-400';
    case 'disputed': return 'bg-red-900/30 text-red-400';
    case 'cancelled': return 'bg-zinc-800 text-zinc-500';
    default: return 'bg-zinc-800 text-zinc-500';
  }
}
