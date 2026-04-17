import { useState, useEffect, useRef } from 'react';
import { ambassadorAPI, ordersAPI } from '../../services/api';
import { Trophy, Share2, ShoppingCart, ShoppingBag, Gift, Copy, Check, QrCode, Eye, X, Calendar, Wallet } from 'lucide-react';
import { copyToClipboard } from '../../utils/copyToClipboard';

const fmtEur = (v, decimals = 2) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);

const TIER_COLORS = {
  Bronze: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-400', bar: 'bg-amber-500' },
  Argent: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-400', bar: 'bg-gray-500' },
  Or: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-500', bar: 'bg-yellow-500' },
  Platine: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-500', bar: 'bg-purple-500' },
};

const FILTER_TABS = [
  { id: 'all', label: 'Toutes' },
  { id: 'direct', label: 'Directes' },
  { id: 'referral', label: 'Via parrainage' },
];

function FilterTabs({ value, onChange, ariaLabel }) {
  const refs = useRef([]);

  const handleKeyDown = (e, idx) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = (idx + dir + FILTER_TABS.length) % FILTER_TABS.length;
      refs.current[next]?.focus();
      onChange(FILTER_TABS[next].id);
    } else if (e.key === 'Home') {
      e.preventDefault();
      refs.current[0]?.focus();
      onChange(FILTER_TABS[0].id);
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = FILTER_TABS.length - 1;
      refs.current[last]?.focus();
      onChange(FILTER_TABS[last].id);
    }
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
      {FILTER_TABS.map((t, i) => {
        const selected = value === t.id;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={`flex-1 text-sm py-1.5 px-3 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-wine-500 ${
              selected ? 'bg-white text-wine-700 font-medium shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AmbassadorDashboard() {
  const [data, setData] = useState(null);
  const [referralData, setReferralData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [salesFilter, setSalesFilter] = useState('all');
  const [ordersFilter, setOrdersFilter] = useState('all');

  useEffect(() => {
    loadDashboard();
    ambassadorAPI.referralStats().then(r => setReferralData(r.data)).catch(console.error);
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await ambassadorAPI.dashboard();
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const referralCode = referralData?.referralCode;
  const referralLink = referralCode
    ? `${window.location.origin}/boutique?ref=${referralCode}`
    : `${window.location.origin}/boutique`;

  const copyLink = async () => {
    try {
      await copyToClipboard(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copie échouée:', err);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  }

  if (!data) return <p className="text-center text-gray-500 py-12">Impossible de charger le tableau de bord.</p>;

  const { tier, sales, referralClicks, gains, commission, commission_tiers, monthly, monthlyTier, monthlyHistory, free_bottles } = data;
  const orders = data.orders || data.recentOrders || [];
  const tierStyle = TIER_COLORS[tier.current?.label] || TIER_COLORS.Bronze;
  const monthlyTierStyle = TIER_COLORS[monthlyTier?.current?.label] || TIER_COLORS.Bronze;

  const referredIds = new Set((referralData?.referredOrders || []).map(o => o.id));
  const taggedOrders = orders.map(o => ({
    ...o,
    order_source: referredIds.has(o.id) ? 'referral' : 'direct',
  }));
  const filterBy = (list, f) => (f === 'all' ? list : list.filter(o => o.order_source === f));
  const salesFilteredOrders = filterBy(taggedOrders, salesFilter);
  const ordersFilteredOrders = filterBy(taggedOrders, ordersFilter);

  const directCA = data.direct_ca_ttc || 0;
  const referredCA = data.referred_ca_ttc || 0;
  const sumBottles = (list) => list.reduce((s, o) => s + (parseInt(o.total_items, 10) || 0), 0);
  const salesKPIs = salesFilter === 'all'
    ? { ca: sales.caTTC, bottles: sales.bottles, count: sales.orderCount }
    : salesFilter === 'direct'
      ? { ca: directCA, bottles: sumBottles(salesFilteredOrders), count: salesFilteredOrders.length }
      : { ca: referredCA, bottles: sumBottles(salesFilteredOrders), count: salesFilteredOrders.length };

  return (
    <div className="space-y-6">
      {/* CTA — Passer commande (V4.2 BLOC 1.2) */}
      <a
        href={referralLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full bg-wine-700 text-white py-3 rounded-lg font-medium hover:bg-wine-800 transition-colors"
      >
        <ShoppingBag size={18} />
        Passer commande sur la boutique
      </a>

      {/* 1 — Partage & Parrainage (hidden for alcohol-free campaigns) */}
      {!data.alcohol_free && <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Share2 size={20} className="text-wine-700" />
          <h2 className="font-semibold text-lg">Partage & Parrainage</h2>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          <p className="text-xs text-gray-500 mb-1">Votre lien de parrainage</p>
          <div className="flex items-center gap-2">
            <input type="text" value={referralLink} readOnly className="input-field text-sm flex-1" />
            <button onClick={copyLink} className="btn-primary text-sm px-3 py-2 flex items-center gap-1">
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Clics sur votre lien</span>
          <span className="font-semibold">{referralClicks}</span>
        </div>

        <div className="mt-3 flex gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Découvrez les vins V&C : ${referralLink}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-green-500 text-white text-center py-2 rounded-lg text-sm hover:bg-green-600"
          >
            WhatsApp
          </a>
          <a
            href={`mailto:?subject=Vins%20%26%20Conversations&body=${encodeURIComponent(`Découvrez les vins V&C : ${referralLink}`)}`}
            className="flex-1 bg-blue-500 text-white text-center py-2 rounded-lg text-sm hover:bg-blue-600"
          >
            Email
          </a>
          <button
            onClick={() => setShowQR(!showQR)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${showQR ? 'bg-wine-100 text-wine-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <QrCode size={16} />
          </button>
        </div>

        {showQR && <QRCodeDisplay url={referralLink} />}
      </div>}

      {/* 2 — Mes Gains */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Gift size={20} className="text-wine-700" />
          <h2 className="font-semibold text-lg">Mes Gains</h2>
        </div>

        {/* Commission breakdown — direct vs referred (V4.2 BLOC 1.3) */}
        {(() => {
          return (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-blue-700">{fmtEur(directCA, 0)} EUR</p>
                <p className="text-xs text-gray-500">Ventes directes</p>
              </div>
              <div className="bg-indigo-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-indigo-700">{fmtEur(referredCA, 0)} EUR</p>
                <p className="text-xs text-gray-500">Via parrainage</p>
              </div>
            </div>
          );
        })()}

        {/* Section "Ma Commission" (fund_individual) masquée — remplacée par commission_tiers progressifs ci-dessous */}

        {commission_tiers && commission_tiers.rate > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-3">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={18} className="text-indigo-700" />
              <h3 className="font-semibold text-indigo-800">Mes commissions du mois</h3>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full ml-auto">
                Palier {commission_tiers.palier_actuel} — {(commission_tiers.rate * 100).toFixed(0)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-white rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-indigo-700">{fmtEur(commission_tiers.commission_mensuelle_ht)} EUR</p>
                <p className="text-xs text-gray-500">Commission du mois</p>
              </div>
              <div className="bg-white rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-gray-700">{fmtEur(commission_tiers.ca_ttc_mensuel, 0)} EUR</p>
                <p className="text-xs text-gray-500">CA TTC mensuel</p>
              </div>
            </div>
            {commission_tiers.prochain_palier_seuil && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Prochain palier : {fmtEur(commission_tiers.prochain_palier_seuil, 0)} EUR</span>
                  <span>{Math.max(0, 100 - (commission_tiers.ecart_prochain_palier / commission_tiers.prochain_palier_seuil * 100)).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-indigo-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${Math.min(100, (commission_tiers.ca_ttc_mensuel / commission_tiers.prochain_palier_seuil * 100)).toFixed(0)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Encore {fmtEur(commission_tiers.ecart_prochain_palier, 0)} EUR pour le palier suivant</p>
              </div>
            )}
            {!commission_tiers.prochain_palier_seuil && (
              <p className="text-xs text-indigo-600 font-medium">Palier maximum atteint !</p>
            )}
          </div>
        )}

        {gains.currentReward ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
            <p className="text-sm text-green-700 font-medium">Palier {gains.currentTierLabel} atteint</p>
            <p className="text-lg font-bold text-green-800">{gains.currentReward}</p>
          </div>
        ) : (
          <p className="text-gray-500 text-sm mb-3">Aucune récompense pour le moment. Continuez vos ventes !</p>
        )}

        {gains.nextReward && (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Prochaine récompense ({gains.nextTierLabel})</p>
            <p className="font-medium text-gray-700">{gains.nextReward}</p>
            <p className="text-xs text-gray-400 mt-1">Encore {fmtEur(gains.amountToNext, 0)} EUR de CA</p>
          </div>
        )}
      </div>

      {/* 3 — 12+1 Bouteilles offertes */}
      {free_bottles && !free_bottles.disabled && free_bottles.threshold > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Gift size={20} className="text-green-600" />
            <h2 className="font-semibold text-lg">12+1 — Bouteilles offertes</h2>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-green-700">{free_bottles.totalSold}</p>
              <p className="text-xs text-gray-500">Bouteilles vendues</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-emerald-700">{free_bottles.earned}</p>
              <p className="text-xs text-gray-500">Gratuites gagnées</p>
            </div>
            <div className="bg-teal-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-teal-700">{free_bottles.available}</p>
              <p className="text-xs text-gray-500">A récupérer</p>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{free_bottles.totalSold % free_bottles.threshold} / {free_bottles.threshold} vers la prochaine</span>
              <span>{Math.round((free_bottles.totalSold % free_bottles.threshold) / free_bottles.threshold * 100)}%</span>
            </div>
            <div className="w-full bg-green-100 rounded-full h-3">
              <div
                className="h-3 rounded-full bg-green-500 transition-all"
                style={{ width: `${(free_bottles.totalSold % free_bottles.threshold) / free_bottles.threshold * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Encore {free_bottles.nextIn} bouteille{free_bottles.nextIn > 1 ? 's' : ''} pour la prochaine gratuite
            </p>
          </div>
        </div>
      )}

      {/* 4 — Ma Progression / Tiers */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={20} className="text-wine-700" />
          <h2 className="font-semibold text-lg">Ma Progression</h2>
        </div>

        {monthlyTier?.current ? (
          <div className={`p-3 rounded-lg border ${monthlyTierStyle.bg} ${monthlyTierStyle.border} mb-4`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold text-lg ${monthlyTierStyle.text}`}>{monthlyTier.current.label}</span>
              <span className="text-sm text-gray-600">{fmtEur(monthlyTier.ca, 0)} EUR de CA ce mois</span>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 mb-4">Aucun palier atteint pour le moment.</p>
        )}

        {monthlyTier?.next && (
          <div>
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Prochain : {monthlyTier.next.label}</span>
              <span>{monthlyTier.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${monthlyTierStyle.bar}`}
                style={{ width: `${monthlyTier.progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Plus que {fmtEur(gains.amountToNext, 0)} EUR pour atteindre {monthlyTier.next.label}
            </p>
          </div>
        )}

        {!monthlyTier?.next && monthlyTier?.current && (
          <p className="text-sm text-green-600 font-medium">Palier maximum atteint !</p>
        )}

        {/* All tiers display — loaded from API (CDC §2.2 — zero hardcoded) */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {(data.tiers || []).map((t) => {
            const reached = monthlyTier?.ca >= t.threshold;
            const style = TIER_COLORS[t.label];
            return (
              <div key={t.label} className={`text-center p-2 rounded-lg text-xs ${reached ? `${style.bg} ${style.text} font-medium` : 'bg-gray-100 text-gray-400'}`}>
                <div>{t.label}</div>
                <div>{t.threshold} EUR</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5 — Mes Ventes (avec tabs filtre) */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart size={20} className="text-wine-700" />
          <h2 className="font-semibold text-lg">Mes Ventes</h2>
        </div>

        <FilterTabs value={salesFilter} onChange={setSalesFilter} ariaLabel="Filtrer les ventes" />

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-blue-700">{fmtEur(salesKPIs.ca, 0)} EUR</p>
            <p className="text-xs text-gray-500">CA TTC</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-green-700">{salesKPIs.bottles}</p>
            <p className="text-xs text-gray-500">Bouteilles</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-purple-700">{salesKPIs.count}</p>
            <p className="text-xs text-gray-500">Commandes</p>
          </div>
        </div>

        {monthly && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={14} className="text-orange-600" />
              <span className="text-xs font-medium text-orange-700">{monthly.month}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-orange-800">{fmtEur(parseFloat(monthly.ca_ttc), 0)} EUR</span>
              <span className="text-xs text-orange-600">{monthly.orders_count} commande{monthly.orders_count > 1 ? 's' : ''}</span>
            </div>
            {monthlyTier && (
              <div className="mt-2 pt-2 border-t border-orange-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-orange-600">Palier du mois</span>
                  {monthlyTier.current ? (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${monthlyTierStyle.bg} ${monthlyTierStyle.text}`}>{monthlyTier.current.label}</span>
                  ) : (
                    <span className="text-xs text-gray-400">Aucun palier</span>
                  )}
                </div>
                {monthlyTier.next && (
                  <div className="mt-1">
                    <div className="flex justify-between text-xs text-orange-500">
                      <span>Prochain : {monthlyTier.next.label}</span>
                      <span>{monthlyTier.progress}%</span>
                    </div>
                    <div className="w-full bg-orange-200 rounded-full h-1.5 mt-0.5">
                      <div className={`h-1.5 rounded-full ${monthlyTierStyle.bar}`} style={{ width: `${monthlyTier.progress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6 — Mes commandes (avec tabs filtre) */}
      {orders.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBag size={20} className="text-wine-700" />
            <h2 className="font-semibold text-lg">Mes commandes</h2>
          </div>

          <FilterTabs value={ordersFilter} onChange={setOrdersFilter} ariaLabel="Filtrer les commandes" />

          {ordersFilteredOrders.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">Aucune commande dans cette catégorie</p>
          ) : (
            <>
              <div className="space-y-2">
                {(showAllOrders ? ordersFilteredOrders : ordersFilteredOrders.slice(0, 10)).map((o) => (
                  <div key={o.id} onClick={() => setSelectedOrder(o.id)} className="flex items-center justify-between text-sm bg-gray-50 rounded p-2 cursor-pointer hover:bg-gray-100 transition-colors">
                    <div>
                      <span className="font-medium">{o.ref}</span>
                      <span className="text-xs text-gray-400 ml-2">{new Date(o.created_at).toLocaleDateString('fr-FR')}</span>
                      {o.customer_name && (
                        <span className="text-sm text-gray-600 block">{o.customer_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        o.status === 'delivered' ? 'bg-green-100 text-green-700' :
                        o.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{o.status}</span>
                      <span className="font-medium">{fmtEur(parseFloat(o.total_ttc))} EUR</span>
                      <Eye size={14} className="text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
              {ordersFilteredOrders.length > 10 && (
                <button
                  onClick={() => setShowAllOrders(!showAllOrders)}
                  className="mt-2 text-sm text-wine-700 hover:text-wine-900 font-medium"
                >
                  {showAllOrders ? 'Voir moins' : `Voir tout (${ordersFilteredOrders.length})`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* 7 — Historique mensuel */}
      {monthlyHistory?.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={20} className="text-wine-700" />
            <h2 className="font-semibold text-lg">Historique mensuel</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Mois</th>
                  <th className="pb-2 font-medium text-right">CA TTC</th>
                  <th className="pb-2 font-medium text-right">Cmd</th>
                  <th className="pb-2 font-medium text-right">Palier</th>
                </tr>
              </thead>
              <tbody>
                {monthlyHistory.map((m, idx) => {
                  const style = TIER_COLORS[m.tier_label];
                  return (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="py-2">{m.month}</td>
                      <td className="py-2 text-right font-medium">{fmtEur(m.ca_ttc, 0)} EUR</td>
                      <td className="py-2 text-right">{m.orders_count}</td>
                      <td className="py-2 text-right">
                        {m.tier_label ? (
                          <span className={`text-xs px-2 py-0.5 rounded ${style?.bg || 'bg-gray-100'} ${style?.text || 'text-gray-600'}`}>{m.tier_label}</span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedOrder && <AmbassadorOrderDetail orderId={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  );
}

function QRCodeDisplay({ url }) {
  const [QRCode, setQRCode] = useState(null);
  useEffect(() => {
    import('react-qr-code').then((mod) => setQRCode(() => mod.default)).catch(() => {});
  }, []);
  if (!QRCode) return <div className="text-center py-4 text-sm text-gray-400">Chargement QR code...</div>;
  return (
    <div className="flex justify-center mt-3 p-4 bg-white rounded-lg border">
      <QRCode value={url} size={180} />
    </div>
  );
}

const STATUS_LABELS = {
  submitted: 'En attente', validated: 'Validée', preparing: 'En préparation',
  shipped: 'Expédiée', delivered: 'Livrée', pending_payment: 'Paiement en attente',
};
const PAYMENT_LABELS = {
  cash: 'Espèces', check: 'Chèque', card: 'Carte', transfer: 'Virement',
  pending: 'À encaisser', deferred: 'Différé',
};

function AmbassadorOrderDetail({ orderId, onClose }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ordersAPI.get(orderId).then(res => setOrder(res.data)).catch(console.error).finally(() => setLoading(false));
  }, [orderId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Détail commande</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
        ) : !order ? (
          <p className="text-center text-gray-500 py-8">Commande introuvable</p>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-wine-700">{order.ref}</p>
                <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${order.status === 'delivered' ? 'bg-green-100 text-green-700' : order.status === 'shipped' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
            </div>

            <div className="divide-y">
              {(order.order_items || []).filter(i => i.type !== 'shipping').map((item, idx) => (
                <div key={idx} className="flex justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-xs text-gray-400">{item.qty} x {fmtEur(parseFloat(item.unit_price_ttc))} EUR</p>
                  </div>
                  <p className="font-medium">{fmtEur(item.qty * parseFloat(item.unit_price_ttc))} EUR</p>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 flex justify-between items-center">
              <span className="text-sm text-gray-600">Total TTC</span>
              <span className="text-lg font-bold text-wine-700">{fmtEur(parseFloat(order.total_ttc))} EUR</span>
            </div>

            {order.payment_method && (
              <p className="text-xs text-gray-500">Paiement : {PAYMENT_LABELS[order.payment_method] || order.payment_method}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
