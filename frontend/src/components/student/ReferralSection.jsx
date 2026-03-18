import { useState, useEffect } from 'react';
import { Link2, Copy, Check, Share2, QrCode, ShoppingCart, Users, TrendingUp } from 'lucide-react';
import { referralAPI } from '../../services/api';
import { copyToClipboard } from '../../utils/copyToClipboard';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

export default function ReferralSection({ campaignId, brandName, caReferred = 0 }) {
  const [linkData, setLinkData] = useState(null);
  const [stats, setStats] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignId) return;
    setLoading(true);
    Promise.allSettled([
      referralAPI.myLink(campaignId),
      referralAPI.stats(campaignId),
    ]).then(([linkRes, statsRes]) => {
      if (linkRes.status === 'fulfilled') setLinkData(linkRes.value.data);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
    }).finally(() => setLoading(false));
  }, [campaignId]);

  if (loading) return null;
  if (!linkData) return null;

  const handleCopy = async () => {
    try {
      await copyToClipboard(linkData.referral_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copie échouée:', err);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: brandName || 'Vins & Conversations',
      text: 'Découvrez notre sélection de vins !',
      url: linkData.referral_link,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or error
      }
    } else {
      // Fallback: WhatsApp
      const text = encodeURIComponent(`${shareData.text} ${shareData.url}`);
      window.open(`https://wa.me/?text=${text}`, '_blank');
    }
  };

  return (
    <div className="card">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Link2 size={16} className="text-wine-700" /> Ma boutique partagée
      </h3>

      {/* Link display */}
      <div className="bg-gray-50 rounded-lg p-3 mb-3">
        <p className="text-xs text-gray-500 mb-1">Mon lien de partage</p>
        <div className="flex items-center gap-2">
          <p className="text-sm font-mono text-wine-700 truncate flex-1">{linkData.referral_link}</p>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              copied ? 'bg-green-100 text-green-700' : 'bg-wine-100 text-wine-700 hover:bg-wine-200'
            }`}
          >
            {copied ? <><Check size={14} /> Copié</> : <><Copy size={14} /> Copier</>}
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-wine-700 text-white rounded-xl text-sm font-medium hover:bg-wine-800 transition-colors"
        >
          <Share2 size={16} /> Partager
        </button>
        <button
          onClick={() => setShowQR(!showQR)}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            showQR ? 'bg-wine-100 text-wine-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <QrCode size={16} />
        </button>
      </div>

      {/* QR Code (lazy loaded) */}
      {showQR && <QRCodeDisplay url={linkData.referral_link} />}

      {/* Stats — use caReferred prop (from dashboard) as reliable source */}
      {(caReferred > 0 || (stats && (stats.total_orders > 0 || stats.total_revenue > 0))) && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs font-medium text-gray-500 mb-2">Mes ventes par partage</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <ShoppingCart size={14} className="text-wine-600 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-800">{stats?.total_orders || '-'}</p>
              <p className="text-[10px] text-gray-500">Commandes</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <TrendingUp size={14} className="text-wine-600 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-800">{formatEur(stats?.total_revenue ?? caReferred)}</p>
              <p className="text-[10px] text-gray-500">CA référé</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <Users size={14} className="text-wine-600 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-800">{stats?.unique_clients || '-'}</p>
              <p className="text-[10px] text-gray-500">Clients</p>
            </div>
          </div>
        </div>
      )}
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
    <div className="flex justify-center mb-3 p-4 bg-white rounded-lg border">
      <QRCode value={url} size={180} />
    </div>
  );
}
