import { useState, useEffect, useCallback } from 'react';
import { ordersAPI, campaignsAPI } from '../../services/api';
import {
  ShoppingCart, Search, Filter, Check, Eye, FileText,
  ChevronLeft, ChevronRight, X
} from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_LABELS = {
  submitted: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
  validated: { label: 'Validée', color: 'bg-green-100 text-green-800' },
  preparing: { label: 'En préparation', color: 'bg-blue-100 text-blue-800' },
  shipped: { label: 'Expédiée', color: 'bg-purple-100 text-purple-800' },
  delivered: { label: 'Livrée', color: 'bg-gray-100 text-gray-800' },
  cancelled: { label: 'Annulée', color: 'bg-red-100 text-red-800' },
};

function OrderDetail({ orderId, onClose }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ordersAPI.get(orderId)
      .then((res) => setOrder(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>;
  if (!order) return <p className="text-center text-gray-500 py-8">Commande introuvable</p>;

  const status = STATUS_LABELS[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-700' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Commande {order.ref}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-gray-500">Client :</span> {order.user_name}</div>
        <div><span className="text-gray-500">Statut :</span> <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span></div>
        <div><span className="text-gray-500">Date :</span> {formatDate(order.created_at)}</div>
        <div><span className="text-gray-500">Total TTC :</span> <span className="font-semibold">{formatEur(order.total_ttc)}</span></div>
        <div><span className="text-gray-500">Total HT :</span> {formatEur(order.total_ht)}</div>
        <div><span className="text-gray-500">Articles :</span> {order.total_items}</div>
      </div>
      {order.notes && <div className="text-sm"><span className="text-gray-500">Notes :</span> {order.notes}</div>}
      <h3 className="font-semibold text-sm mt-4">Lignes de commande</h3>
      <div className="border rounded-lg divide-y">
        {order.order_items?.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <p className="font-medium">{item.product_name}</p>
              <p className="text-xs text-gray-500">{formatEur(item.unit_price_ttc)} x {item.qty}</p>
            </div>
            <span className="font-semibold">{formatEur(item.unit_price_ttc * item.qty)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ campaign_id: '', status: '', page: 1 });
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.campaign_id) params.campaign_id = filters.campaign_id;
      if (filters.status) params.status = filters.status;
      params.page = filters.page;
      params.limit = 20;
      const { data } = await ordersAPI.list(params);
      setOrders(data.data);
      setPagination(data.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    campaignsAPI.list().then((res) => setCampaigns(res.data.data || [])).catch(console.error);
  }, []);

  const handleValidate = async (id) => {
    if (!confirm('Valider cette commande ?')) return;
    try {
      await ordersAPI.validate(id);
      fetchOrders();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur de validation');
    }
  };

  if (selectedOrder) {
    return (
      <div className="card">
        <OrderDetail orderId={selectedOrder} onClose={() => setSelectedOrder(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Commandes</h1>
        <span className="text-sm text-gray-500">{pagination.total} commande(s)</span>
      </div>

      {/* Filtres */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Campagne</label>
            <select
              value={filters.campaign_id}
              onChange={(e) => setFilters((f) => ({ ...f, campaign_id: e.target.value, page: 1 }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Toutes</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Tous</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <button
            onClick={() => setFilters({ campaign_id: '', status: '', page: 1 })}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
          >
            Effacer
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <ShoppingCart size={40} className="mx-auto mb-3" />
            <p>Aucune commande trouvée</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Ref</th>
                <th className="pb-3 font-medium">Étudiant</th>
                <th className="pb-3 font-medium">Montant</th>
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Articles</th>
                <th className="pb-3 font-medium">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o) => {
                const status = STATUS_LABELS[o.status] || { label: o.status, color: 'bg-gray-100 text-gray-700' };
                return (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="py-3 font-mono text-xs">{o.ref}</td>
                    <td className="py-3">
                      <p className="font-medium">{o.user_name}</p>
                      <p className="text-xs text-gray-400">{o.user_email}</p>
                    </td>
                    <td className="py-3 font-semibold">{formatEur(o.total_ttc)}</td>
                    <td className="py-3 text-gray-500 text-xs">{formatDate(o.created_at)}</td>
                    <td className="py-3">{o.total_items}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedOrder(o.id)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                          title="Voir détail"
                        >
                          <Eye size={16} />
                        </button>
                        {o.status === 'submitted' && (
                          <button
                            onClick={() => handleValidate(o.id)}
                            className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"
                            title="Valider"
                          >
                            <Check size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {pagination.page} sur {pagination.pages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              disabled={pagination.page <= 1}
              className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              disabled={pagination.page >= pagination.pages}
              className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
