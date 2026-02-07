import { useState, useEffect, useCallback } from 'react';
import { stockAPI, productsAPI } from '../../services/api';
import {
  Package, Plus, ArrowDown, ArrowUp, RotateCcw, AlertTriangle
} from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

const MOVEMENT_TYPES = {
  initial: { label: 'Stock initial', icon: Package, color: 'text-blue-600' },
  entry: { label: 'Entrée', icon: ArrowDown, color: 'text-green-600' },
  exit: { label: 'Sortie (vente)', icon: ArrowUp, color: 'text-red-600' },
  return: { label: 'Retour', icon: RotateCcw, color: 'text-purple-600' },
  free: { label: 'Gratuit', icon: Package, color: 'text-orange-600' },
  correction: { label: 'Correction', icon: AlertTriangle, color: 'text-gray-600' },
};

const RETURN_STATUS = {
  pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approuvé', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Refusé', color: 'bg-red-100 text-red-800' },
  credited: { label: 'Avoir émis', color: 'bg-blue-100 text-blue-800' },
};

const EMPTY_MOVEMENT = { product_id: '', type: 'initial', qty: '', reference: '' };

function StockGauge({ value }) {
  const max = Math.max(value, 50);
  const pct = Math.min((value / max) * 100, 100);
  const color = value > 20 ? 'bg-green-500' : value >= 10 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold ${
        value > 20 ? 'text-green-600' : value >= 10 ? 'text-orange-600' : 'text-red-600'
      }`}>
        {value}
      </span>
    </div>
  );
}

function MovementForm({ products, onSubmit, onCancel }) {
  const [form, setForm] = useState(EMPTY_MOVEMENT);
  const [saving, setSaving] = useState(false);

  const handleChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_id || !form.qty) return;
    setSaving(true);
    try {
      await onSubmit({
        product_id: parseInt(form.product_id, 10),
        type: form.type,
        qty: parseInt(form.qty, 10),
        reference: form.reference || undefined,
      });
      setForm(EMPTY_MOVEMENT);
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de l\'ajout du mouvement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900">Nouveau mouvement de stock</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
          <select
            value={form.type}
            onChange={(e) => handleChange('type', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {Object.entries(MOVEMENT_TYPES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Produit *</label>
          <select
            value={form.product_id}
            onChange={(e) => handleChange('product_id', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            required
          >
            <option value="">Sélectionner...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Quantité *</label>
          <input
            type="number"
            min="1"
            value={form.qty}
            onChange={(e) => handleChange('qty', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="0"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Référence</label>
          <input
            value={form.reference}
            onChange={(e) => handleChange('reference', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="BL-001, facture..."
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          {saving ? 'Enregistrement...' : 'Ajouter le mouvement'}
        </button>
      </div>
    </form>
  );
}

export default function AdminStock() {
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'returns'

  const fetchStock = useCallback(async () => {
    setLoading(true);
    try {
      const [stockRes, productsRes, returnsRes] = await Promise.all([
        stockAPI.list(),
        productsAPI.list(),
        stockAPI.returns(),
      ]);
      setStock(stockRes.data.data || stockRes.data || []);
      setProducts(productsRes.data.data || productsRes.data || []);
      setReturns(returnsRes.data.data || returnsRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  const handleAddMovement = async (payload) => {
    await stockAPI.addMovement(payload);
    setShowMovementForm(false);
    fetchStock();
  };

  const handleUpdateReturn = async (id, status) => {
    const action = status === 'approved' ? 'Approuver' : status === 'rejected' ? 'Refuser' : 'Mettre à jour';
    if (!confirm(`${action} ce retour ?`)) return;
    try {
      await stockAPI.updateReturn(id, { status });
      fetchStock();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de la mise à jour');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" />
      </div>
    );
  }

  const lowStockCount = stock.filter((s) => s.current_stock < 10).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des stocks</h1>
        <div className="flex items-center gap-3">
          {lowStockCount > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded-full">
              <AlertTriangle size={14} />
              {lowStockCount} alerte{lowStockCount > 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => setShowMovementForm(!showMovementForm)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            Mouvement
          </button>
        </div>
      </div>

      {/* Movement Form */}
      {showMovementForm && (
        <div className="card">
          <MovementForm
            products={products}
            onSubmit={handleAddMovement}
            onCancel={() => setShowMovementForm(false)}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'stock'
              ? 'bg-white text-wine-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <Package size={16} />
            Stock ({stock.length})
          </span>
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'returns'
              ? 'bg-white text-wine-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-2">
            <RotateCcw size={16} />
            Retours / Avoirs ({returns.length})
          </span>
        </button>
      </div>

      {/* Stock Table */}
      {activeTab === 'stock' && (
        <div className="card overflow-x-auto">
          {stock.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Package size={40} className="mx-auto mb-3" />
              <p>Aucun produit en stock</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">Produit</th>
                  <th className="pb-3 font-medium text-center">Initial</th>
                  <th className="pb-3 font-medium text-center">Reçu</th>
                  <th className="pb-3 font-medium text-center">Vendu</th>
                  <th className="pb-3 font-medium text-center">Gratuit</th>
                  <th className="pb-3 font-medium text-center">Retourné</th>
                  <th className="pb-3 font-medium text-center">Stock actuel</th>
                  <th className="pb-3 font-medium">Jauge</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stock.map((item) => {
                  const currentStock = item.current_stock != null
                    ? item.current_stock
                    : (item.initial || 0) + (item.received || 0) - (item.sold || 0) - (item.free_given || 0) + (item.returned || 0);

                  return (
                    <tr key={item.id} className={`hover:bg-gray-50 ${currentStock < 10 ? 'bg-red-50/50' : ''}`}>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-wine-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Package size={16} className="text-wine-600" />
                          </div>
                          <div>
                            <p className="font-medium">{item.name}</p>
                            {item.category && <p className="text-xs text-gray-400">{item.category}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-center tabular-nums">{item.initial || 0}</td>
                      <td className="py-3 text-center tabular-nums">
                        <span className="text-green-600">+{item.received || 0}</span>
                      </td>
                      <td className="py-3 text-center tabular-nums">
                        <span className="text-red-600">-{item.sold || 0}</span>
                      </td>
                      <td className="py-3 text-center tabular-nums">
                        <span className="text-orange-600">-{item.free_given || 0}</span>
                      </td>
                      <td className="py-3 text-center tabular-nums">
                        <span className="text-purple-600">+{item.returned || 0}</span>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`font-bold text-base tabular-nums ${
                          currentStock > 20 ? 'text-green-700' : currentStock >= 10 ? 'text-orange-600' : 'text-red-600'
                        }`}>
                          {currentStock}
                        </span>
                      </td>
                      <td className="py-3">
                        <StockGauge value={currentStock} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Formula reminder */}
          {stock.length > 0 && (
            <div className="mt-4 pt-4 border-t text-xs text-gray-400 text-center">
              Formule : Stock actuel = Initial + Recu - Vendu - Gratuit + Retourne
            </div>
          )}
        </div>
      )}

      {/* Returns / Credits Tab */}
      {activeTab === 'returns' && (
        <div className="card overflow-x-auto">
          {returns.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <RotateCcw size={40} className="mx-auto mb-3" />
              <p>Aucun retour enregistre</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">Produit</th>
                  <th className="pb-3 font-medium">Commande</th>
                  <th className="pb-3 font-medium text-center">Qte</th>
                  <th className="pb-3 font-medium">Motif</th>
                  <th className="pb-3 font-medium">Statut</th>
                  <th className="pb-3 font-medium text-right">Avoir</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {returns.map((ret) => {
                  const status = RETURN_STATUS[ret.status] || { label: ret.status, color: 'bg-gray-100 text-gray-700' };
                  return (
                    <tr key={ret.id} className="hover:bg-gray-50">
                      <td className="py-3">
                        <p className="font-medium">{ret.product_name || `Produit #${ret.product_id}`}</p>
                      </td>
                      <td className="py-3 font-mono text-xs text-gray-500">
                        {ret.order_ref || `#${ret.order_id}`}
                      </td>
                      <td className="py-3 text-center tabular-nums">{ret.qty}</td>
                      <td className="py-3">
                        <p className="text-gray-700 max-w-[200px] truncate">{ret.reason || '—'}</p>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="py-3 text-right font-semibold">
                        {ret.credit_amount != null ? formatEur(ret.credit_amount) : '—'}
                      </td>
                      <td className="py-3 text-right">
                        {ret.status === 'pending' && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleUpdateReturn(ret.id, 'approved')}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                            >
                              Approuver
                            </button>
                            <button
                              onClick={() => handleUpdateReturn(ret.id, 'rejected')}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                            >
                              Refuser
                            </button>
                          </div>
                        )}
                        {ret.status === 'approved' && (
                          <button
                            onClick={() => handleUpdateReturn(ret.id, 'credited')}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            Emettre avoir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Stock Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="text-green-600 bg-green-50 p-2 rounded-lg">
              <ArrowDown size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total en stock</p>
              <p className="text-xl font-bold">
                {stock.reduce((sum, s) => {
                  const cs = s.current_stock != null
                    ? s.current_stock
                    : (s.initial || 0) + (s.received || 0) - (s.sold || 0) - (s.free_given || 0) + (s.returned || 0);
                  return sum + cs;
                }, 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="text-red-600 bg-red-50 p-2 rounded-lg">
              <ArrowUp size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total vendu</p>
              <p className="text-xl font-bold">
                {stock.reduce((sum, s) => sum + (s.sold || 0), 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="text-orange-600 bg-orange-50 p-2 rounded-lg">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Stock bas (&lt;10)</p>
              <p className="text-xl font-bold">{lowStockCount}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
