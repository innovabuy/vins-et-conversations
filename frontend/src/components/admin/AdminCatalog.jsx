import { useState, useEffect } from 'react';
import { productsAPI } from '../../services/api';
import { Wine, Plus, Pencil, Trash2, X, Save } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

const EMPTY_PRODUCT = {
  name: '', price_ht: '', price_ttc: '', purchase_price: '',
  tva_rate: 20, category: '', label: '', image_url: '', description: '', active: true,
};

function ProductForm({ product, onSave, onCancel }) {
  const [form, setForm] = useState(product || EMPTY_PRODUCT);
  const [saving, setSaving] = useState(false);

  const handleChange = (field, value) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      // Auto-calculate TTC from HT when tva_rate or price_ht changes
      if (field === 'price_ht' || field === 'tva_rate') {
        const ht = field === 'price_ht' ? parseFloat(value) : parseFloat(next.price_ht);
        const tva = field === 'tva_rate' ? parseFloat(value) : parseFloat(next.tva_rate);
        if (!isNaN(ht) && !isNaN(tva)) {
          next.price_ttc = (ht * (1 + tva / 100)).toFixed(2);
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        price_ht: parseFloat(form.price_ht),
        price_ttc: parseFloat(form.price_ttc),
        purchase_price: parseFloat(form.purchase_price),
        tva_rate: parseFloat(form.tva_rate),
      };
      await onSave(payload);
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold">{product?.id ? 'Modifier le produit' : 'Nouveau produit'}</h2>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Nom *</label>
          <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">TVA *</label>
          <select value={form.tva_rate} onChange={(e) => handleChange('tva_rate', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value={20}>20%</option>
            <option value={5.5}>5.5%</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Prix HT *</label>
          <input type="number" step="0.01" value={form.price_ht} onChange={(e) => handleChange('price_ht', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Prix TTC *</label>
          <input type="number" step="0.01" value={form.price_ttc} onChange={(e) => handleChange('price_ttc', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Prix d'achat *</label>
          <input type="number" step="0.01" value={form.purchase_price} onChange={(e) => handleChange('purchase_price', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Catégorie</label>
          <input value={form.category || ''} onChange={(e) => handleChange('category', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Rouge, Blanc, Rosé..." />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
          <input value={form.label || ''} onChange={(e) => handleChange('label', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Bio, AOP..." />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">URL image</label>
          <input value={form.image_url || ''} onChange={(e) => handleChange('image_url', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
          <textarea value={form.description || ''} onChange={(e) => handleChange('description', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={16} />
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

export default function AdminCatalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | product object

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data } = await productsAPI.list();
      setProducts(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleSave = async (payload) => {
    if (editing?.id) {
      await productsAPI.update(editing.id, payload);
    } else {
      await productsAPI.create(payload);
    }
    setEditing(null);
    fetchProducts();
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Désactiver le produit "${name}" ?`)) return;
    try {
      await productsAPI.remove(id);
      fetchProducts();
    } catch (err) {
      alert('Erreur lors de la désactivation');
    }
  };

  if (editing) {
    return (
      <div className="card">
        <ProductForm
          product={editing === 'new' ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Catalogue</h1>
        <button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Nouveau produit
        </button>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Wine size={40} className="mx-auto mb-3" />
            <p>Aucun produit dans le catalogue</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Produit</th>
                <th className="pb-3 font-medium">Catégorie</th>
                <th className="pb-3 font-medium">Prix HT</th>
                <th className="pb-3 font-medium">Prix TTC</th>
                <th className="pb-3 font-medium">Achat</th>
                <th className="pb-3 font-medium">TVA</th>
                <th className="pb-3 font-medium">Marge</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((p) => {
                const margin = p.price_ht - p.purchase_price;
                const marginPct = p.purchase_price > 0 ? ((margin / p.purchase_price) * 100).toFixed(0) : 0;
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-wine-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Wine size={16} className="text-wine-600" />
                        </div>
                        <div>
                          <p className="font-medium">{p.name}</p>
                          {p.label && <p className="text-xs text-gray-400">{p.label}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-gray-500">{p.category || '—'}</td>
                    <td className="py-3">{formatEur(p.price_ht)}</td>
                    <td className="py-3 font-semibold">{formatEur(p.price_ttc)}</td>
                    <td className="py-3 text-gray-500">{formatEur(p.purchase_price)}</td>
                    <td className="py-3">{p.tva_rate}%</td>
                    <td className="py-3">
                      <span className={`text-xs font-medium ${margin > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatEur(margin)} ({marginPct}%)
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Modifier">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => handleDelete(p.id, p.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Désactiver">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
