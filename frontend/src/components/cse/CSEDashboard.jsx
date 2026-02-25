import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { cseDashboardAPI, ordersAPI, invoicesAPI } from '../../services/api';
import { ShoppingCart, Package, FileText, Truck, AlertTriangle, RefreshCw, Wine, TrendingUp, Target, Award } from 'lucide-react';

export default function CSEDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('products');

  const campaignId = user?.campaigns?.[0]?.campaign_id;

  useEffect(() => {
    if (!campaignId) return;
    loadDashboard();
  }, [campaignId]);

  const loadDashboard = async () => {
    try {
      const res = await cseDashboardAPI.get(campaignId);
      setData(res.data);
    } catch (err) {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateCartQty = (productId, qty) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.id !== productId));
    } else {
      setCart((prev) => prev.map((i) => i.id === productId ? { ...i, qty } : i));
    }
  };

  const cartTotal = cart.reduce((sum, i) => sum + i.cse_price_ttc * i.qty, 0);
  const minOrder = data?.minOrder || 0;
  const isUnderMin = cartTotal > 0 && cartTotal < minOrder;

  const handleOrder = async () => {
    if (isUnderMin || cart.length === 0) return;
    setOrdering(true);
    try {
      await ordersAPI.create({
        campaign_id: campaignId,
        items: cart.map((i) => ({ productId: i.id, qty: i.qty })),
      });
      setCart([]);
      loadDashboard();
      setActiveTab('orders');
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la commande');
    } finally {
      setOrdering(false);
    }
  };

  const reorder = (order) => {
    if (!order.items?.length || !data?.products) return;
    const newCart = [];
    for (const item of order.items) {
      const product = data.products.find((p) => p.id === item.product_id);
      if (product) newCart.push({ ...product, qty: item.qty });
    }
    if (newCart.length) {
      setCart(newCart);
      setActiveTab('cart');
    }
  };

  const downloadInvoice = async (orderId) => {
    try {
      const res = await invoicesAPI.download(orderId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `facture-${orderId}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Erreur de téléchargement');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" />
      </div>
    );
  }

  if (!data) {
    return <div className="card text-center py-12 text-gray-500">Aucune campagne CSE active</div>;
  }

  const tabs = [
    { key: 'products', label: 'Catalogue', icon: Package },
    { key: 'cart', label: `Panier (${cart.length})`, icon: ShoppingCart },
    { key: 'orders', label: 'Commandes', icon: FileText },
    { key: 'tracking', label: 'Livraisons', icon: Truck },
  ];

  return (
    <div>
      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 bg-white rounded-lg p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-wine-50 text-wine-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Campaign CA Gauge */}
      {data.campaign_goal > 0 && (
        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Target size={18} className="text-wine-600" />
            <h3 className="font-semibold text-gray-800">Objectif de la campagne</h3>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold text-wine-700">{data.campaign_ca_ttc?.toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €</span>
            <span className="text-gray-500">/ {data.campaign_goal?.toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €</span>
            <span className={`ml-auto text-sm font-semibold px-2 py-0.5 rounded-full ${
              data.campaign_progress >= 100 ? 'bg-green-100 text-green-700' :
              data.campaign_progress >= 75 ? 'bg-wine-100 text-wine-700' :
              data.campaign_progress >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
            }`}>{data.campaign_progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all ${
                data.campaign_progress >= 100 ? 'bg-green-500' :
                data.campaign_progress >= 75 ? 'bg-wine-600' :
                data.campaign_progress >= 50 ? 'bg-wine-500' : 'bg-wine-400'
              }`}
              style={{ width: `${Math.min(100, data.campaign_progress)}%` }}
            />
          </div>
          {data.delivery_free_threshold > 0 && data.campaign_ca_ttc < data.delivery_free_threshold && (
            <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle size={12} />
              Livraison offerte à partir de {data.delivery_free_threshold?.toLocaleString('fr-FR')} € de CA
            </p>
          )}
        </div>
      )}

      {/* Tier Progression */}
      {data.current_tier !== undefined && (
        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Award size={18} className="text-wine-600" />
            <h3 className="font-semibold text-gray-800">Palier fidélité</h3>
          </div>
          {data.current_tier ? (
            <div className="flex items-center gap-3 mb-2">
              <span
                className="px-3 py-1 rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: data.current_tier.color || '#722F37' }}
              >
                {data.current_tier.label}
              </span>
              <span className="text-sm text-gray-600">{data.current_tier.reward}</span>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-2">Aucun palier atteint pour le moment</p>
          )}
          {data.next_tier && (
            <>
              <div className="flex items-baseline justify-between text-xs text-gray-500 mb-1">
                <span>Progression vers {data.next_tier.label}</span>
                <span>{data.tier_progress_pct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, data.tier_progress_pct || 0)}%`,
                    backgroundColor: data.next_tier.color || '#722F37',
                  }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Récompense : {data.next_tier.reward}
              </p>
            </>
          )}
          {!data.next_tier && data.current_tier && (
            <p className="text-xs text-green-600 font-medium">Palier maximum atteint !</p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">x</button>
        </div>
      )}

      {/* Products */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.products.map((p) => (
            <div key={p.id} className="card flex flex-col">
              <div className="flex gap-3 mb-2">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="w-16 h-20 object-cover rounded flex-shrink-0"
                    loading="lazy"
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                  />
                ) : null}
                {!p.image_url && (
                  <div className="w-16 h-20 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                    <Wine size={24} className="text-gray-300" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm mb-1">{p.name}</h3>
                  <p className="text-xs text-gray-500">{p.category} {p.label ? `— ${p.label}` : ''}</p>
                  {p.description && <p className="text-xs text-gray-600 line-clamp-2">{p.description}</p>}
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-3 mt-auto">
                <span className="text-lg font-bold text-wine-700">{p.cse_price_ttc.toFixed(2)} EUR</span>
                <span className="text-sm text-gray-400 line-through">{p.original_price_ttc.toFixed(2)} EUR</span>
                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">-{data.discountPct}%</span>
              </div>
              <button onClick={() => addToCart(p)} className="btn-primary w-full text-sm py-1.5">
                Ajouter au panier
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Cart */}
      {activeTab === 'cart' && (
        <div className="card">
          {cart.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Votre panier est vide</p>
          ) : (
            <>
              <div className="space-y-3 mb-4">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.cse_price_ttc.toFixed(2)} EUR/u</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateCartQty(item.id, item.qty - 1)} className="w-7 h-7 rounded border text-center">-</button>
                      <span className="w-8 text-center text-sm">{item.qty}</span>
                      <button onClick={() => updateCartQty(item.id, item.qty + 1)} className="w-7 h-7 rounded border text-center">+</button>
                      <span className="font-medium text-sm w-20 text-right">{(item.cse_price_ttc * item.qty).toFixed(2)} EUR</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3">
                <div className="flex justify-between text-lg font-bold mb-2">
                  <span>Total TTC</span>
                  <span className="text-wine-700">{cartTotal.toFixed(2)} EUR</span>
                </div>

                {isUnderMin && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-amber-700 text-sm">
                    <AlertTriangle size={16} />
                    Commande minimum: {minOrder} EUR (il manque {(minOrder - cartTotal).toFixed(2)} EUR)
                  </div>
                )}

                <button
                  onClick={handleOrder}
                  disabled={isUnderMin || ordering}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {ordering ? 'Commande en cours...' : 'Commander'}
                </button>
                <p className="text-xs text-gray-500 mt-2 text-center">Paiement par virement{data?.paymentTerms ? ` sous ${data.paymentTerms}` : ''}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Order history */}
      {activeTab === 'orders' && (
        <div className="card">
          <h3 className="font-semibold mb-3">Historique des commandes</h3>
          {data.orders.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune commande</p>
          ) : (
            <div className="space-y-2">
              {data.orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between border-b pb-2 text-sm">
                  <div>
                    <p className="font-medium">{order.ref}</p>
                    <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{parseFloat(order.total_ttc).toFixed(2)} EUR</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                      order.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{order.status}</span>
                    <button onClick={() => reorder(order)} className="text-wine-600 hover:text-wine-800" title="Recommander">
                      <RefreshCw size={16} />
                    </button>
                    <button onClick={() => downloadInvoice(order.id)} className="text-wine-600 hover:text-wine-800" title="Facture">
                      <FileText size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delivery tracking */}
      {activeTab === 'tracking' && (
        <div className="card">
          <h3 className="font-semibold mb-3">Suivi des livraisons</h3>
          {data.orders.filter((o) => o.delivery_status).length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune livraison en cours</p>
          ) : (
            <div className="space-y-2">
              {data.orders.filter((o) => o.delivery_status).map((order) => (
                <div key={order.id} className="flex items-center justify-between border-b pb-2 text-sm">
                  <div>
                    <p className="font-medium">{order.ref}</p>
                    <p className="text-xs text-gray-500">
                      Date prévue: {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('fr-FR') : '-'}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    order.delivery_status === 'delivered' ? 'bg-green-100 text-green-700' :
                    order.delivery_status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>{order.delivery_status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
