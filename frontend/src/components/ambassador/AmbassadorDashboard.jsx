import { useState, useEffect } from 'react';
import { ambassadorAPI } from '../../services/api';
import { Trophy, Share2, ShoppingCart, Gift, Copy, Check, ExternalLink } from 'lucide-react';

const TIER_COLORS = {
  Bronze: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-400', bar: 'bg-amber-500' },
  Argent: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-400', bar: 'bg-gray-500' },
  Or: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-500', bar: 'bg-yellow-500' },
  Platine: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-500', bar: 'bg-purple-500' },
};

export default function AmbassadorDashboard() {
  const [data, setData] = useState(null);
  const [referralData, setReferralData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  }

  if (!data) return <p className="text-center text-gray-500 py-12">Impossible de charger le tableau de bord.</p>;

  const { tier, sales, recentOrders, referralClicks, gains } = data;
  const tierStyle = TIER_COLORS[tier.current?.label] || TIER_COLORS.Bronze;

  return (
    <div className="space-y-6">
      {/* Section 1 — Progression / Tiers */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={20} className="text-wine-700" />
          <h2 className="font-semibold text-lg">Ma Progression</h2>
        </div>

        {tier.current ? (
          <div className={`p-3 rounded-lg border ${tierStyle.bg} ${tierStyle.border} mb-4`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold text-lg ${tierStyle.text}`}>{tier.current.label}</span>
              <span className="text-sm text-gray-600">{tier.ca.toFixed(0)} EUR de CA</span>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 mb-4">Aucun palier atteint pour le moment.</p>
        )}

        {tier.next && (
          <div>
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Prochain : {tier.next.label}</span>
              <span>{tier.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${tierStyle.bar}`}
                style={{ width: `${tier.progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Plus que {gains.amountToNext.toFixed(0)} EUR pour atteindre {tier.next.label}
            </p>
          </div>
        )}

        {!tier.next && tier.current && (
          <p className="text-sm text-green-600 font-medium">Palier maximum atteint !</p>
        )}

        {/* All tiers display — loaded from API (CDC §2.2 — zero hardcoded) */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {(data.tiers || []).map((t) => {
            const reached = tier.ca >= t.threshold;
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

      {/* Section 2 — Partage / QR */}
      <div className="card">
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
        </div>
      </div>

      {/* Section 3 — Ventes */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart size={20} className="text-wine-700" />
          <h2 className="font-semibold text-lg">Mes Ventes</h2>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-blue-700">{sales.caTTC.toFixed(0)} EUR</p>
            <p className="text-xs text-gray-500">CA TTC</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-green-700">{sales.bottles}</p>
            <p className="text-xs text-gray-500">Bouteilles</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-purple-700">{sales.orderCount}</p>
            <p className="text-xs text-gray-500">Commandes</p>
          </div>
        </div>

        {recentOrders.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Dernières commandes</h3>
            <div className="space-y-2">
              {recentOrders.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm bg-gray-50 rounded p-2">
                  <div>
                    <span className="font-medium">{o.ref}</span>
                    <span className="text-xs text-gray-400 ml-2">{new Date(o.created_at).toLocaleDateString('fr-FR')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      o.status === 'delivered' ? 'bg-green-100 text-green-700' :
                      o.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{o.status}</span>
                    <span className="font-medium">{parseFloat(o.total_ttc).toFixed(0)} EUR</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section 4 — Ventes via mon lien */}
      {referralData?.referredOrders?.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <ExternalLink size={20} className="text-wine-700" />
            <h2 className="font-semibold text-lg">Ventes via mon lien</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-indigo-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-indigo-700">{referralData.referredOrders.length}</p>
              <p className="text-xs text-gray-500">Commandes parrainées</p>
            </div>
            <div className="bg-wine-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-wine-700">
                {referralData.referredOrders.reduce((s, o) => s + parseFloat(o.total_ttc || 0), 0).toFixed(0)} EUR
              </p>
              <p className="text-xs text-gray-500">CA parrainé</p>
            </div>
          </div>
          <div className="space-y-2">
            {referralData.referredOrders.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center justify-between text-sm bg-gray-50 rounded p-2">
                <div>
                  <span className="font-medium">{o.ref}</span>
                  <span className="text-xs text-gray-400 ml-2">{new Date(o.created_at).toLocaleDateString('fr-FR')}</span>
                </div>
                <span className="font-medium">{parseFloat(o.total_ttc).toFixed(0)} EUR</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 5 — Gains */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Gift size={20} className="text-wine-700" />
          <h2 className="font-semibold text-lg">Mes Gains</h2>
        </div>

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
            <p className="text-xs text-gray-400 mt-1">Encore {gains.amountToNext.toFixed(0)} EUR de CA</p>
          </div>
        )}
      </div>
    </div>
  );
}
