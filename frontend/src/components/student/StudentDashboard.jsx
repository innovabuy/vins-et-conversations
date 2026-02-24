import { useState, useEffect, useMemo } from 'react';
import { dashboardAPI, productsAPI, ordersAPI, campaignResourcesAPI, invoicesAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Flame, Trophy, ShoppingCart, User, ChevronUp, Wine, Package, Clock, Award, Zap, Heart, Target, DollarSign, ArrowLeft, ArrowRight, Check, Phone, Mail, FileText, CreditCard, Banknote, Building, HelpCircle, Users, TrendingUp, TrendingDown, Minus, BarChart3, BookOpen, ExternalLink, Video, Image, FileDown, LogOut } from 'lucide-react';
import WineBarrel from '../shared/WineBarrel';
import CapNumerikCredit from '../shared/CapNumerikCredit';
import ReferralSection from './ReferralSection';
import useCampaignBrandName from '../../utils/useCampaignBrandName';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const BADGE_ICONS = {
  trophy: Trophy, flame: Flame, banknote: DollarSign,
  zap: Zap, heart: Heart, target: Target,
};

const FALLBACK_BADGES = [
  { id: 'top_vendeur', name: 'Top Vendeur', icon: 'trophy', description: '1er au classement' },
  { id: 'streak_7', name: 'Serie 7j', icon: 'flame', description: '7 jours consecutifs' },
  { id: 'premier_1000', name: 'Premier 1000\u20AC', icon: 'banknote', description: 'CA atteint' },
  { id: 'machine_vendre', name: 'Machine a vendre', icon: 'zap', description: 'Objectif bouteilles' },
  { id: 'fidele', name: 'Fidele', icon: 'heart', description: 'Serie longue' },
  { id: 'objectif_perso', name: 'Objectif perso', icon: 'target', description: 'Objectif atteint' },
];

const STATUS_LABELS = {
  submitted: 'En attente',
  validated: 'Validee',
  preparing: 'En preparation',
  shipped: 'Expediee',
  delivered: 'Livree',
  cancelled: 'Annulee',
};

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Especes', icon: Banknote },
  { value: 'check', label: 'Cheque', icon: FileText },
  { value: 'card', label: 'Carte', icon: CreditCard },
  { value: 'transfer', label: 'Virement', icon: Building },
  { value: 'pending', label: 'A encaisser', icon: HelpCircle },
];

const PAYMENT_LABELS = { cash: 'Especes', check: 'Cheque', card: 'Carte', transfer: 'Virement', pending: 'A encaisser' };

function StreakBadge({ streak }) {
  if (streak === 0) return <span className="text-gray-400 text-sm">Pas de streak</span>;
  const flames = streak >= 5 ? '\uD83D\uDD25\uD83D\uDD25\uD83D\uDD25' : streak >= 3 ? '\uD83D\uDD25\uD83D\uDD25' : '\uD83D\uDD25';
  return <span className="text-lg">{flames} <span className="text-sm font-medium">{streak}j</span></span>;
}

// ========== RANKING TAB (enriched) ==========
function RankingTab({ campaignId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [classFilter, setClassFilter] = useState('all');

  useEffect(() => {
    if (!campaignId) return;
    setLoading(true);
    dashboardAPI.studentLeaderboard(campaignId, { period, class: classFilter })
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [campaignId, period, classFilter]);

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>;
  if (!data) return <p className="text-center text-gray-500 py-8">Classement indisponible</p>;

  const { campaignHeader } = data;

  return (
    <div className="space-y-3">
      {/* Campaign header */}
      {campaignHeader && (
        <div className="bg-wine-50 rounded-xl p-3 mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-wine-700">{campaignHeader.name}</span>
            {campaignHeader.days_remaining != null && (
              <span className="text-xs text-wine-600">{campaignHeader.days_remaining}j restants</span>
            )}
          </div>
          <div className="w-full bg-wine-200 rounded-full h-2 mb-1">
            <div className="bg-wine-700 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, campaignHeader.progress_pct)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-wine-600">
            <span>{formatEur(campaignHeader.total_ca)}</span>
            <span>{campaignHeader.progress_pct}%</span>
            <span>Obj: {formatEur(campaignHeader.goal)}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-2">
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs flex-1">
          {[['all', 'Tout'], ['month', 'Mois'], ['week', 'Sem.']].map(([v, l]) => (
            <button key={v} onClick={() => setPeriod(v)} className={`flex-1 py-1.5 px-2 rounded-md transition-colors ${period === v ? 'bg-white shadow text-wine-700 font-medium' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
        {data?.ranking && (() => {
          const groups = [...new Set(data.ranking.map(r => r.classGroup).filter(Boolean))].sort();
          return groups.length > 1 ? (
            <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
              {[['all', 'Tous'], ...groups.map(g => [g, g])].map(([v, l]) => (
                <button key={v} onClick={() => setClassFilter(v)} className={`py-1.5 px-3 rounded-md transition-colors ${classFilter === v ? 'bg-white shadow text-wine-700 font-medium' : 'text-gray-500'}`}>{l}</button>
              ))}
            </div>
          ) : null;
        })()}
      </div>

      <p className="text-sm text-gray-500">
        Position : <span className="font-bold text-wine-700">{data.myPosition || '-'}e</span> sur {data.totalParticipants}
      </p>

      <div className="space-y-2">
        {data.ranking.map((r) => (
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
        {data.ranking.length === 0 && <p className="text-center text-gray-400 text-sm py-4">Aucune vente sur cette periode</p>}
      </div>
    </div>
  );
}

// ========== ORDER FLOW (3 steps) ==========
function OrderFlow({ campaignId, products, customers, onComplete }) {
  const [step, setStep] = useState(1); // 1: client, 2: products, 3: recap
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [cart, setCart] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const updateCart = (productId, delta) => {
    setCart((prev) => {
      const qty = Math.max(0, (prev[productId] || 0) + delta);
      if (qty === 0) { const next = { ...prev }; delete next[productId]; return next; }
      return { ...prev, [productId]: qty };
    });
  };

  const cartTotal = useMemo(() => Object.entries(cart).reduce((sum, [pid, qty]) => {
    const p = products.find((x) => x.id === pid);
    return sum + (p ? (p.custom_price || p.price_ttc) * qty : 0);
  }, 0), [cart, products]);

  const cartItems = useMemo(() => Object.entries(cart).reduce((sum, [, qty]) => sum + qty, 0), [cart]);

  // Autocomplete suggestions
  useEffect(() => {
    if (!customerName || customerName.length < 2) { setSuggestions([]); return; }
    const q = customerName.toLowerCase();
    setSuggestions(customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5));
  }, [customerName, customers]);

  const selectCustomer = (c) => {
    setCustomerName(c.name);
    setCustomerPhone(c.phone || '');
    setCustomerEmail(c.email || '');
    setSuggestions([]);
  };

  const submitOrder = async () => {
    setSubmitting(true);
    try {
      const items = Object.entries(cart).map(([productId, qty]) => ({ productId, qty }));
      await ordersAPI.create({
        campaign_id: campaignId,
        items,
        customer_name: customerName,
        customer_phone: customerPhone || undefined,
        customer_email: customerEmail || undefined,
        customer_notes: customerNotes || undefined,
        payment_method: paymentMethod,
      });
      onComplete();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 1: Client form
  if (step === 1) return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`w-8 h-1.5 rounded-full ${s <= step ? 'bg-wine-700' : 'bg-gray-200'}`} />
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-2">1/3 Client</span>
      </div>
      <h2 className="font-semibold">Pour qui est cette commande ?</h2>

      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">Nom du client *</label>
        <input
          type="text"
          className="input"
          placeholder="Ex: Mme Dupont"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
            {suggestions.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCustomer(c)}
                className="w-full text-left px-3 py-2 hover:bg-wine-50 text-sm border-b last:border-0"
              >
                <span className="font-medium">{c.name}</span>
                {c.phone && <span className="text-gray-400 ml-2">{c.phone}</span>}
                <span className="text-xs text-gray-300 ml-2">{c.order_count} cmd</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Telephone</label>
        <div className="relative">
          <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="tel" className="input pl-9" placeholder="06 12 34 56 78" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <div className="relative">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="email" className="input pl-9" placeholder="client@email.fr" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea className="input" rows={2} placeholder="Ex: voisine 2e etage, rappeler mardi..." value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
      </div>

      <button
        onClick={() => setStep(2)}
        disabled={!customerName.trim()}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
      >
        Choisir les produits <ArrowRight size={16} />
      </button>
    </div>
  );

  // Step 2: Products
  if (step === 2) return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`w-8 h-1.5 rounded-full ${s <= step ? 'bg-wine-700' : 'bg-gray-200'}`} />
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-2">2/3 Produits</span>
      </div>

      <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-wine-700">
        <ArrowLeft size={14} /> Retour
      </button>

      <div className="bg-wine-50 rounded-lg px-3 py-2 text-sm">
        Client : <span className="font-semibold text-wine-800">{customerName}</span>
      </div>

      {products.map((p) => (
        <div key={p.id} className="card flex items-center gap-3">
          <div className="w-12 h-12 bg-wine-50 rounded-lg flex items-center justify-center">
            <Wine size={20} className="text-wine-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">{p.name}</p>
            <p className="text-xs text-gray-500">
              {p.category}{p.label ? ` · ${p.label}` : ''}
              {p.category_is_alcohol !== false && <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold">12+1</span>}
            </p>
            <p className="font-semibold text-wine-700">{formatEur(p.custom_price || p.price_ttc)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => updateCart(p.id, -1)} className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-lg">&minus;</button>
            <span className="w-6 text-center font-medium">{cart[p.id] || 0}</span>
            <button onClick={() => updateCart(p.id, 1)} className="w-10 h-10 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center font-bold text-lg">+</button>
          </div>
        </div>
      ))}

      {cartItems > 0 && (
        <div className="fixed bottom-20 left-0 right-0 max-w-[390px] mx-auto px-4">
          <button onClick={() => setStep(3)} className="btn-primary w-full flex items-center justify-center gap-2">
            Recapitulatif · {cartItems} art. · {formatEur(cartTotal)} <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );

  // Step 3: Recap + payment
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`w-8 h-1.5 rounded-full ${s <= step ? 'bg-wine-700' : 'bg-gray-200'}`} />
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-2">3/3 Confirmation</span>
      </div>

      <button onClick={() => setStep(2)} className="flex items-center gap-1 text-sm text-wine-700">
        <ArrowLeft size={14} /> Modifier
      </button>

      {/* Client summary */}
      <div className="card">
        <h3 className="font-semibold text-sm mb-2">Client</h3>
        <p className="text-sm">{customerName}</p>
        {customerPhone && <p className="text-xs text-gray-500">{customerPhone}</p>}
        {customerEmail && <p className="text-xs text-gray-500">{customerEmail}</p>}
      </div>

      {/* Products summary */}
      <div className="card">
        <h3 className="font-semibold text-sm mb-2">Articles ({cartItems})</h3>
        {Object.entries(cart).map(([pid, qty]) => {
          const p = products.find((x) => x.id === pid);
          if (!p) return null;
          return (
            <div key={pid} className="flex justify-between text-sm py-1 border-b last:border-0">
              <span>{p.name} x{qty}</span>
              <span className="font-medium">{formatEur((p.custom_price || p.price_ttc) * qty)}</span>
            </div>
          );
        })}
        <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t">
          <span>Total TTC</span>
          <span className="text-wine-700">{formatEur(cartTotal)}</span>
        </div>
      </div>

      {/* Payment method */}
      <div className="card">
        <h3 className="font-semibold text-sm mb-3">Moyen de paiement *</h3>
        <div className="grid grid-cols-2 gap-2">
          {PAYMENT_METHODS.map((pm) => (
            <button
              key={pm.value}
              onClick={() => setPaymentMethod(pm.value)}
              className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm ${
                paymentMethod === pm.value
                  ? 'border-wine-700 bg-wine-50 text-wine-800'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <pm.icon size={18} />
              {pm.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={submitOrder}
        disabled={!paymentMethod || submitting}
        className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {submitting ? 'Envoi...' : <><Check size={18} /> Valider la commande</>}
      </button>
    </div>
  );
}

// ========== MAIN DASHBOARD ==========
export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('home');
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderSuccess, setOrderSuccess] = useState(false);

  const campaignId = user?.campaigns?.[0]?.campaign_id;

  const fetchAll = () => {
    if (!campaignId) return;
    setLoading(true);
    Promise.allSettled([
      dashboardAPI.student(campaignId),
      productsAPI.byCampaign(campaignId),
      ordersAPI.myCustomers(),
      campaignResourcesAPI.list(campaignId),
    ]).then(([dashRes, prodRes, custRes, resRes]) => {
      if (dashRes.status === 'fulfilled') setData(dashRes.value.data);
      if (prodRes.status === 'fulfilled') setProducts(prodRes.value.data.data || []);
      if (custRes.status === 'fulfilled') setCustomers(custRes.value.data.data || []);
      if (resRes.status === 'fulfilled') setResources(resRes.value.data.data || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [campaignId]);

  const handleOrderComplete = () => {
    setOrderSuccess(true);
    fetchAll();
    setTimeout(() => {
      setOrderSuccess(false);
      setTab('home');
    }, 2000);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;

  const tabs = [
    { id: 'home', label: 'Accueil', icon: Trophy },
    { id: 'order', label: 'Commander', icon: ShoppingCart },
    { id: 'ranking', label: 'Classement', icon: ChevronUp },
    ...(resources.length > 0 ? [{ id: 'resources', label: 'Ressources', icon: BookOpen }] : []),
    { id: 'profile', label: 'Profil', icon: User },
  ];

  const campaign = data?.campaign;
  const brandName = useCampaignBrandName(campaign);
  const relative = data?.relative;

  return (
    <div className="max-w-[390px] mx-auto min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-wine-800 to-wine-950 text-white p-6 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-wine-200 text-sm">Bonjour</p>
            <h1 className="text-lg font-bold">{user?.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge bg-white/20 text-white">{data?.classGroup}</span>
            <button onClick={logout} className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Deconnexion">
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {tab === 'home' && data && (
          <>
            <div className="text-center py-4">
              <p className="text-wine-200 text-sm">{data.ca_referred > 0 ? 'Mon CA total' : 'Mon CA'}</p>
              <p className="text-4xl font-bold">{formatEur(data.ca_referred > 0 ? data.ca_total : data.ca)}</p>
              {data.ca_referred > 0 && (
                <p className="text-wine-300 text-xs mt-1">dont {formatEur(data.ca_referred)} par partage</p>
              )}
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
        {/* ===== HOME TAB ===== */}
        {tab === 'home' && data && (
          <div className="space-y-4">
            {/* Free bottles */}
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">{'\uD83C\uDF81'} Bouteilles gratuites</h3>
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

            {/* Barriques — Part des anges (V4.1) */}
            {(data.fund_collective || data.fund_individual) && (
              <div className="card">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Wine size={16} className="text-wine-700" /> Mes parts des anges
                </h3>
                <div className={`grid gap-4 ${data.fund_collective && data.fund_individual ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {data.fund_collective && (
                    <WineBarrel
                      amount={data.fund_collective.amount}
                      label={data.fund_collective.label}
                      fillPct={campaign?.goal > 0 ? Math.min(95, (data.fund_collective.base_amount / campaign.goal) * 100) : 50}
                      color="#722F37"
                    />
                  )}
                  {data.fund_individual && (
                    <WineBarrel
                      amount={data.fund_individual.amount}
                      label={data.fund_individual.label}
                      fillPct={data.fund_individual.base_amount > 0 ? Math.min(95, (data.ca / (campaign?.avg_ca_per_student || data.ca)) * 50 + 20) : 10}
                      color="#8B5E3C"
                    />
                  )}
                </div>
                <div className="mt-2 text-center">
                  {data.fund_collective && <p className="text-[10px] text-gray-400">{data.fund_collective.rate}% du CA HT collectif</p>}
                  {data.fund_individual && <p className="text-[10px] text-gray-400">{data.fund_individual.rate}% de ton CA HT perso</p>}
                </div>
              </div>
            )}

            {/* Referral section — hidden for alcohol-free campaigns */}
            {!campaign?.alcohol_free && <ReferralSection campaignId={campaignId} brandName={brandName} />}

            {/* Campaign collective stats */}
            {campaign && (
              <div className="card">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><BarChart3 size={16} className="text-wine-700" /> Ma campagne</h3>

                {/* Goal progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500">{campaign.name}</span>
                    <span className="font-medium text-wine-700">{campaign.progress_pct}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-4 relative overflow-hidden">
                    <div
                      className={`h-4 rounded-full transition-all ${
                        campaign.progress_pct >= 100 ? 'bg-green-500' :
                        campaign.progress_pct >= 75 ? 'bg-wine-600' :
                        campaign.progress_pct >= 50 ? 'bg-wine-500' : 'bg-wine-400'
                      }`}
                      style={{ width: `${Math.min(100, campaign.progress_pct)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>{formatEur(campaign.total_ca)}</span>
                    <span>Objectif : {formatEur(campaign.goal)}</span>
                  </div>
                </div>

                {/* Days remaining */}
                {campaign.days_remaining != null && (
                  <div className="bg-wine-50 rounded-lg px-3 py-2 text-center mb-3">
                    <span className="text-2xl font-bold text-wine-700">{campaign.days_remaining}</span>
                    <span className="text-xs text-wine-600 ml-1">jours restants</span>
                    {campaign.daily_target > 0 && (
                      <p className="text-xs text-wine-500 mt-0.5">Objectif quotidien : {formatEur(campaign.daily_target)}</p>
                    )}
                  </div>
                )}

                {/* Collective stats cards */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-gray-800">{formatEur(campaign.total_ca)}</p>
                    <p className="text-[10px] text-gray-500">CA total</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-gray-800">{campaign.total_bottles}</p>
                    <p className="text-[10px] text-gray-500">Bouteilles</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-gray-800">{campaign.active_participants}/{campaign.total_participants}</p>
                    <p className="text-[10px] text-gray-500">Participants actifs</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-gray-800">{formatEur(campaign.avg_ca_per_student)}</p>
                    <p className="text-[10px] text-gray-500">CA moyen/eleve</p>
                  </div>
                </div>

                {/* Relative position */}
                {relative && (
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    relative.vs_average_text === 'above' ? 'bg-green-50 text-green-700' :
                    relative.vs_average_text === 'below' ? 'bg-orange-50 text-orange-700' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    {relative.vs_average_text === 'above' ? <TrendingUp size={16} /> :
                     relative.vs_average_text === 'below' ? <TrendingDown size={16} /> :
                     <Minus size={16} />}
                    <span>
                      {relative.vs_average_text === 'above' && `+${relative.vs_average_pct}% au-dessus de la moyenne`}
                      {relative.vs_average_text === 'below' && `${relative.vs_average_pct}% en-dessous de la moyenne`}
                      {relative.vs_average_text === 'equal' && `Pile dans la moyenne`}
                    </span>
                  </div>
                )}

                {/* Mini leaderboard preview */}
                {data.leaderboard_preview?.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-medium text-gray-500">Top classement</h4>
                      <button onClick={() => setTab('ranking')} className="text-xs text-wine-700 font-medium">Voir tout &rarr;</button>
                    </div>
                    {data.leaderboard_preview.map((r) => (
                      <div key={r.rank} className={`flex items-center gap-2 py-1.5 text-sm ${r.isMe ? 'text-wine-700 font-medium' : ''}`}>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          r.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                          r.rank === 2 ? 'bg-gray-300 text-gray-700' :
                          r.rank === 3 ? 'bg-orange-300 text-orange-800' :
                          'bg-gray-100 text-gray-500'
                        }`}>{r.rank}</span>
                        <span className="flex-1 truncate">{r.name} {r.isMe && '(vous)'}</span>
                        <span className="text-xs">{formatEur(r.ca)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Recent orders */}
            {data.recent_orders?.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Clock size={14} /> Dernieres commandes</h3>
                {data.recent_orders.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 py-2 border-b last:border-0 text-sm">
                    {o.products?.length > 0 && (
                      <div className="flex -space-x-2 flex-shrink-0">
                        {o.products.slice(0, 2).map((p, i) => (
                          p.image_url ? <img key={i} src={p.image_url} alt={p.name} className="w-8 h-8 rounded-full object-cover border-2 border-white" />
                            : <div key={i} className="w-8 h-8 rounded-full bg-wine-100 flex items-center justify-center text-wine-700 text-xs font-bold border-2 border-white">{p.name?.charAt(0)}</div>
                        ))}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {o.customer_name || 'Client'}
                        {o.is_referred && <span className="ml-1.5 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] rounded-full font-medium">Référé</span>}
                      </p>
                      <p className="text-xs text-gray-400">{formatDate(o.created_at)} · {o.total_items} art.</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold">{formatEur(o.total_ttc)}</p>
                      {o.payment_method && <p className="text-[10px] text-gray-400">{PAYMENT_LABELS[o.payment_method] || o.payment_method}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* New order button */}
            <button onClick={() => setTab('order')} className="btn-primary w-full flex items-center justify-center gap-2">
              <ShoppingCart size={18} /> Nouvelle commande
            </button>
          </div>
        )}

        {/* ===== ORDER TAB ===== */}
        {tab === 'order' && (
          orderSuccess ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={32} className="text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-green-700 mb-1">Commande envoyee !</h2>
              <p className="text-sm text-gray-500">Retour a l'accueil...</p>
            </div>
          ) : (
            <OrderFlow
              campaignId={campaignId}
              products={products}
              customers={customers}
              onComplete={handleOrderComplete}
            />
          )
        )}

        {/* ===== RANKING TAB ===== */}
        {tab === 'ranking' && <RankingTab campaignId={campaignId} />}

        {/* ===== RESOURCES TAB ===== */}
        {tab === 'resources' && resources.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><BookOpen size={16} /> Ressources</h3>
            {resources.map((r) => {
              const typeIcons = { pdf: FileDown, video: Video, image: Image, document: FileText, link: ExternalLink };
              const TypeIcon = typeIcons[r.type] || ExternalLink;
              const typeColors = { pdf: 'bg-red-50 text-red-600', video: 'bg-purple-50 text-purple-600', image: 'bg-blue-50 text-blue-600', document: 'bg-orange-50 text-orange-600', link: 'bg-green-50 text-green-600' };
              return (
                <a
                  key={r.id}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card flex items-start gap-3 hover:shadow-md transition-shadow"
                >
                  <div className={`p-2 rounded-lg ${typeColors[r.type] || 'bg-gray-50 text-gray-600'}`}>
                    <TypeIcon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900">{r.title}</p>
                    {r.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.description}</p>}
                    <span className="text-[10px] text-gray-400 uppercase mt-1 inline-block">{r.type}</span>
                  </div>
                  <ExternalLink size={14} className="text-gray-300 shrink-0 mt-1" />
                </a>
              );
            })}
          </div>
        )}

        {/* ===== PROFILE TAB ===== */}
        {tab === 'profile' && (
          <div className="space-y-4">
            <div className="card">
              <h3 className="font-semibold mb-3">Mon profil</h3>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-500">Nom :</span> {user?.name}</p>
                <p><span className="text-gray-500">Email :</span> {user?.email}</p>
                <p><span className="text-gray-500">Role :</span> Etudiant</p>
              </div>
            </div>

            {/* Badges */}
            {data && (
              <div className="card">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Award size={16} /> Badges & Streak</h3>
                <div className="flex items-center gap-4 mb-4">
                  <div className="text-center">
                    <StreakBadge streak={data.streak} />
                    <p className="text-xs text-gray-500 mt-1">Streak actuel</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(data.badgeDefinitions || FALLBACK_BADGES).map((badge) => {
                    const earned = data.badges?.find((b) => b.id === badge.id);
                    const Icon = BADGE_ICONS[badge.icon] || Award;
                    return (
                      <div key={badge.id} className={`text-center p-2 rounded-xl transition-all ${earned ? 'bg-wine-50 ring-1 ring-wine-200' : 'bg-gray-50 opacity-40'}`}>
                        <Icon size={24} className={earned ? 'text-wine-700 mx-auto' : 'text-gray-400 mx-auto'} />
                        <p className="text-xs font-medium mt-1">{badge.name}</p>
                        {earned ? (
                          <p className="text-[10px] text-wine-600">{new Date(earned.earned_at).toLocaleDateString('fr-FR')}</p>
                        ) : (
                          <p className="text-[10px] text-gray-400">{badge.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Order history with customer + payment */}
            <ProfileOrders campaignId={campaignId} />

            {/* My customers */}
            {customers.length > 0 && (
              <div className="card">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Users size={16} /> Mes clients ({customers.length})</h3>
                <div className="space-y-2">
                  {customers.map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{c.order_count} cmd</p>
                        {c.last_order_at && <p className="text-[10px] text-gray-400">{formatDate(c.last_order_at)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <CapNumerikCredit />

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-[390px] mx-auto bg-white border-t border-gray-200" role="navigation" aria-label="Navigation principale">
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

function ProfileOrders({ campaignId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    if (!campaignId) return;
    dashboardAPI.studentOrders(campaignId)
      .then((res) => setOrders(res.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [campaignId]);

  const handleDownloadInvoice = async (order) => {
    setDownloading(order.id);
    try {
      const res = await invoicesAPI.download(order.id);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `facture-${order.ref || order.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Erreur lors du telechargement de la facture');
    } finally {
      setDownloading(null);
    }
  };

  if (loading || !orders.length) return null;

  return (
    <div className="card">
      <h3 className="font-semibold mb-3 flex items-center gap-2"><Clock size={16} /> Historique commandes</h3>
      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg text-sm">
            <div>
              <p className="font-mono text-xs text-gray-500">{o.ref}</p>
              {o.customer_name && <p className="text-xs text-gray-600 font-medium">{o.customer_name}</p>}
              <p className="text-xs text-gray-400">{formatDate(o.created_at)} · {o.total_items} art.</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatEur(o.total_ttc)}</p>
              <p className="text-xs text-gray-400">{STATUS_LABELS[o.status] || o.status}</p>
              {o.payment_method && <p className="text-[10px] text-gray-300">{PAYMENT_LABELS[o.payment_method] || o.payment_method}</p>}
              {['validated', 'delivered'].includes(o.status) && (
                <button
                  onClick={() => handleDownloadInvoice(o)}
                  disabled={downloading === o.id}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-wine-700 hover:text-wine-900 font-medium"
                >
                  <FileDown size={12} />
                  {downloading === o.id ? 'Telechargement...' : 'Facture'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
