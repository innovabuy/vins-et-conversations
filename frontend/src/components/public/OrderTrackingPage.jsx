import { useState } from 'react';
import { boutiqueAPI } from '../../services/api';
import { Search, Package, CheckCircle, Truck, MapPin, Clock } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const STATUS_STEPS = {
  pending_payment: { label: 'En attente de paiement', step: 0, icon: Clock },
  submitted: { label: 'Confirmée', step: 1, icon: CheckCircle },
  validated: { label: 'Validée', step: 2, icon: CheckCircle },
  preparing: { label: 'En préparation', step: 3, icon: Package },
  shipped: { label: 'Expédiée', step: 4, icon: Truck },
  delivered: { label: 'Livrée', step: 5, icon: MapPin },
  cancelled: { label: 'Annulée', step: -1, icon: Clock },
};

export default function OrderTrackingPage() {
  const [ref, setRef] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!ref || !email) return;

    setLoading(true);
    setError('');
    setOrder(null);

    try {
      const res = await boutiqueAPI.trackOrder(ref.trim().toUpperCase(), email.trim());
      setOrder(res.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Commande introuvable. Vérifiez la référence et l\'email.');
      } else {
        setError('Erreur lors de la recherche.');
      }
    } finally {
      setLoading(false);
    }
  };

  const statusInfo = order ? STATUS_STEPS[order.status] || STATUS_STEPS.submitted : null;
  const steps = ['Confirmée', 'Validée', 'En préparation', 'Expédiée', 'Livrée'];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Suivi de commande</h1>
      <p className="text-gray-500 mb-6">Entrez votre référence de commande et votre email pour voir le statut.</p>

      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-8">
        <input
          type="text"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Référence (ex: VC-2026-0001)"
          className="flex-1 border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-wine-200"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Votre email"
          className="flex-1 border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-wine-200"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex items-center justify-center gap-2 px-5 py-2.5 disabled:opacity-50"
        >
          <Search size={16} /> {loading ? 'Recherche...' : 'Rechercher'}
        </button>
      </form>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-6">{error}</div>}

      {order && (
        <div className="space-y-6">
          {/* Order header */}
          <div className="bg-white border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg">Commande {order.ref}</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {statusInfo?.label}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Client</p>
                <p className="font-medium">{order.customer_name}</p>
              </div>
              <div>
                <p className="text-gray-500">Date</p>
                <p className="font-medium">{formatDate(order.created_at)}</p>
              </div>
              <div>
                <p className="text-gray-500">Articles</p>
                <p className="font-medium">{order.total_items}</p>
              </div>
              <div>
                <p className="text-gray-500">Total</p>
                <p className="font-bold text-wine-700">{formatEur(order.total_ttc)}</p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {order.status !== 'cancelled' && statusInfo?.step > 0 && (
            <div className="bg-white border rounded-xl p-5">
              <div className="flex justify-between mb-2">
                {steps.map((s, i) => (
                  <div key={s} className={`text-xs text-center flex-1 ${i + 1 <= statusInfo.step ? 'text-wine-700 font-medium' : 'text-gray-400'}`}>
                    {s}
                  </div>
                ))}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-wine-700 h-2 rounded-full transition-all"
                  style={{ width: `${(statusInfo.step / 5) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Items */}
          {order.items?.length > 0 && (
            <div className="bg-white border rounded-xl p-5">
              <h3 className="font-semibold mb-3">Articles commandés</h3>
              <div className="divide-y">
                {order.items.map((item, i) => (
                  <div key={i} className="flex justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.qty} x {formatEur(item.unit_price_ttc)}</p>
                    </div>
                    <span className="font-medium">{formatEur(item.qty * item.unit_price_ttc)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
