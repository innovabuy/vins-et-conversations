import { useState, useEffect } from 'react';
import { dashboardAPI, productsAPI, ordersAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Flame, Trophy, ShoppingCart, User, ChevronUp, Wine, Package, Clock } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const STATUS_LABELS = {
  submitted: 'En attente',
  validated: 'Validée',
  preparing: 'En préparation',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

function StreakBadge({ streak }) {
  if (streak === 0) return <span className="text-gray-400 text-sm">Pas de streak</span>;
  const flames = streak >= 5 ? '🔥🔥🔥' : streak >= 3 ? '🔥🔥' : '🔥';
  return <span className="text-lg">{flames} <span className="text-sm font-medium">{streak}j</span></span>;
}

function RankingTab({ campaignId }) {
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignId) return;
    dashboardAPI.studentRanking(campaignId)
      .then((res) => setRanking(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [campaignId]);

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>;
  if (!ranking) return <p className="text-center text-gray-500 py-8">Classement indisponible</p>;

  return (
    <div className="space-y-3">
      <h2 className="font-semibold mb-1">Classement</h2>
      <p className="text-sm text-gray-500 mb-3">
        Votre position : <span className="font-bold text-wine-700">{ranking.myPosition}e</span> sur {ranking.totalParticipants}
      </p>
      <div className="space-y-2">
        {ranking.ranking.map((r) => (
          <div key={r.rank} className={`flex items-center gap-3 p-2.5 rounded-xl ${r.isMe ? 'bg-wine-50 ring-1 ring-wine-200' : r.rank <= 3 ? 'bg-gray-50' : ''}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              r.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
              r.rank === 2 ? 'bg-gray-300 text-gray-700' :
              r.rank === 3 ? 'bg-orange-300 text-orange-800' :
              'bg-gray-100 text-gray-500'
            }`}>{r.rank}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{r.name} {r.isMe && <span className="text-wine-600 text-xs">(vous)</span>}</p>
              <p className="text-xs text-gray-400">{r.classGroup} · {r.bottles} bout. · {r.ordersCount} cmd</p>
            </div>
            <span className="font-semibold text-sm">{formatEur(r.ca)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderHistory({ campaignId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignId) return;
    dashboardAPI.studentOrders(campaignId)
      .then((res) => setOrders(res.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [campaignId]);

  if (loading) return null;
  if (!orders.length) return null;

  return (
    <div className="card">
      <h3 className="font-semibold mb-3 flex items-center gap-2"><Clock size={16} /> Historique commandes</h3>
      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg text-sm">
            <div>
              <p className="font-mono text-xs text-gray-500">{o.ref}</p>
              <p className="text-xs text-gray-400">{formatDate(o.created_at)} · {o.total_items} art.</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatEur(o.total_ttc)}</p>
              <p className="text-xs text-gray-400">{STATUS_LABELS[o.status] || o.status}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('home');
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);

  const campaignId = user?.campaigns?.[0]?.campaign_id;

  useEffect(() => {
    if (!campaignId) return;
    Promise.all([
      dashboardAPI.student(campaignId),
      productsAPI.byCampaign(campaignId),
    ]).then(([dashRes, prodRes]) => {
      setData(dashRes.data);
      setProducts(prodRes.data.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, [campaignId]);

  const updateCart = (productId, delta) => {
    setCart((prev) => {
      const qty = Math.max(0, (prev[productId] || 0) + delta);
      if (qty === 0) { const next = { ...prev }; delete next[productId]; return next; }
      return { ...prev, [productId]: qty };
    });
  };

  const submitOrder = async () => {
    const items = Object.entries(cart).map(([productId, qty]) => ({ productId, qty }));
    if (!items.length) return;
    try {
      await ordersAPI.create({ campaign_id: campaignId, items });
      setCart({});
      // Refresh dashboard
      const { data: fresh } = await dashboardAPI.student(campaignId);
      setData(fresh);
      setTab('home');
      alert('Commande envoyée !');
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur');
    }
  };

  const cartTotal = Object.entries(cart).reduce((sum, [pid, qty]) => {
    const p = products.find((x) => x.id === pid);
    return sum + (p ? p.price_ttc * qty : 0);
  }, 0);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;

  const tabs = [
    { id: 'home', label: 'Accueil', icon: Trophy },
    { id: 'order', label: 'Commander', icon: ShoppingCart },
    { id: 'ranking', label: 'Classement', icon: ChevronUp },
    { id: 'profile', label: 'Profil', icon: User },
  ];

  return (
    <div className="max-w-[390px] mx-auto min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-wine-800 to-wine-950 text-white p-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-wine-200 text-sm">Bonjour</p>
            <h1 className="text-lg font-bold">{user?.name}</h1>
          </div>
          <span className="badge bg-white/20 text-white">{data?.classGroup}</span>
        </div>

        {tab === 'home' && data && (
          <>
            <div className="text-center py-4">
              <p className="text-wine-200 text-sm">Mon CA</p>
              <p className="text-4xl font-bold">{formatEur(data.ca)}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold">{data.bottlesSold}</p>
                <p className="text-xs text-wine-200">Bouteilles</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold">{data.position}<sup>e</sup></p>
                <p className="text-xs text-wine-200">Classement</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <StreakBadge streak={data.streak} />
                <p className="text-xs text-wine-200 mt-1">Streak</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {tab === 'home' && data && (
          <div className="space-y-4">
            {/* Progression bouteilles gratuites */}
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">🎁 Bouteilles gratuites</h3>
                <span className="badge bg-wine-100 text-wine-800">{data.freeBottles.available} disponible(s)</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
                <div
                  className="bg-gradient-to-r from-wine-500 to-wine-700 h-3 rounded-full transition-all"
                  style={{ width: `${((data.freeBottles.totalSold % data.freeBottles.threshold) / data.freeBottles.threshold) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">
                Encore {data.freeBottles.nextIn} bouteille(s) avant la prochaine gratuite
              </p>
            </div>
          </div>
        )}

        {tab === 'order' && (
          <div className="space-y-3">
            <h2 className="font-semibold">Catalogue</h2>
            {products.map((p) => (
              <div key={p.id} className="card flex items-center gap-3">
                <div className="w-12 h-12 bg-wine-50 rounded-lg flex items-center justify-center">
                  <Wine size={20} className="text-wine-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.category}{p.label ? ` · ${p.label}` : ''}</p>
                  <p className="font-semibold text-wine-700">{formatEur(p.custom_price || p.price_ttc)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateCart(p.id, -1)} className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center font-bold text-lg">−</button>
                  <span className="w-6 text-center font-medium">{cart[p.id] || 0}</span>
                  <button onClick={() => updateCart(p.id, 1)} className="w-11 h-11 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center font-bold text-lg">+</button>
                </div>
              </div>
            ))}

            {Object.keys(cart).length > 0 && (
              <div className="fixed bottom-20 left-0 right-0 max-w-[390px] mx-auto px-4">
                <button onClick={submitOrder} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Package size={18} />
                  Envoyer la commande · {formatEur(cartTotal)}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'ranking' && <RankingTab campaignId={campaignId} />}

        {tab === 'profile' && (
          <div className="space-y-4">
            <div className="card">
              <h3 className="font-semibold mb-3">Mon profil</h3>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500">Nom :</span> {user?.name}</p>
                <p><span className="text-gray-500">Email :</span> {user?.email}</p>
                <p><span className="text-gray-500">Rôle :</span> Étudiant</p>
              </div>
            </div>
            {data && (
              <div className="card">
                <h3 className="font-semibold mb-3">Streak & Badges</h3>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <StreakBadge streak={data.streak} />
                    <p className="text-xs text-gray-500 mt-1">Streak actuel</p>
                  </div>
                </div>
              </div>
            )}
            <OrderHistory campaignId={campaignId} />
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-[390px] mx-auto bg-white border-t border-gray-200">
        <div className="flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-3 flex flex-col items-center gap-1 text-xs font-medium transition-colors ${
                tab === t.id ? 'text-wine-700' : 'text-gray-400'
              }`}
            >
              <t.icon size={20} />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
