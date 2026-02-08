import { useState, useEffect, useCallback } from 'react';
import { suppliersAPI, productsAPI } from '../../services/api';
import { Factory, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Save, Package, AlertTriangle } from 'lucide-react';

const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

function SupplierFormModal({ supplier, allProducts, onClose, onSaved }) {
  const isEdit = !!supplier;
  const [form, setForm] = useState(isEdit ? {
    name: supplier.name || '',
    contact_name: supplier.contact_name || '',
    email: supplier.email || '',
    phone: supplier.phone || '',
    address: supplier.address || '',
    products: supplier.products || [],
    notes: supplier.notes || '',
  } : { name: '', contact_name: '', email: '', phone: '', address: '', products: [], notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const toggleProduct = (pid) => {
    setForm((f) => ({
      ...f,
      products: f.products.includes(pid) ? f.products.filter((p) => p !== pid) : [...f.products, pid],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Le nom est obligatoire'); return; }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await suppliersAPI.update(supplier.id, form);
      } else {
        await suppliersAPI.create(form);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-bold">{isEdit ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nom *</label>
            <input type="text" name="name" value={form.name} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Contact</label>
              <input type="text" name="contact_name" value={form.contact_name} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nom du contact" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone</label>
              <input type="tel" name="phone" value={form.phone} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Adresse</label>
              <input type="text" name="address" value={form.address} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Produits associés</label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
              {allProducts.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-2 py-1">
                  <input type="checkbox" checked={form.products.includes(p.id)} onChange={() => toggleProduct(p.id)} className="rounded text-wine-700" />
                  <span>{p.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{p.category}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              <Save size={16} />
              {saving ? 'Enregistrement...' : isEdit ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [restockAlerts, setRestockAlerts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await suppliersAPI.list();
      setSuppliers(data.data || []);
      setRestockAlerts(data.restock_alerts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
    productsAPI.list().then(res => setAllProducts(res.data.data || res.data || [])).catch(console.error);
  }, [fetchSuppliers]);

  const handleToggle = async (id) => {
    try {
      await suppliersAPI.toggle(id);
      fetchSuppliers();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur');
    }
  };

  const handleDelete = async (supplier) => {
    if (!confirm(`Désactiver le fournisseur "${supplier.name}" ?`)) return;
    try {
      await suppliersAPI.remove(supplier.id);
      fetchSuppliers();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur');
    }
  };

  const openCreate = () => { setEditSupplier(null); setShowForm(true); };
  const openEdit = (s) => { setEditSupplier(s); setShowForm(true); };
  const handleSaved = () => { setShowForm(false); setEditSupplier(null); fetchSuppliers(); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Fournisseurs</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Nouveau fournisseur
        </button>
      </div>

      {restockAlerts.length > 0 && (
        <div className="card border-l-4 border-l-orange-500 bg-orange-50">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-orange-600" />
            <h2 className="font-semibold text-orange-800">Alertes de réapprovisionnement</h2>
          </div>
          <div className="space-y-2">
            {restockAlerts.map((alert) => (
              <div key={alert.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-orange-500" />
                  <span className="font-medium text-gray-800">{alert.name}</span>
                </div>
                <span className="text-orange-700 font-semibold">Stock : {alert.current_stock} unité(s)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
        ) : suppliers.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Factory size={40} className="mx-auto mb-3" />
            <p>Aucun fournisseur enregistré</p>
          </div>
        ) : (
          <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {suppliers.map((s) => (
              <div key={s.id} onClick={() => openEdit(s)} className={`border rounded-lg p-4 hover:bg-gray-50 cursor-pointer space-y-2 ${!s.active ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-wine-50 rounded-lg flex items-center justify-center flex-shrink-0"><Factory size={14} className="text-wine-600" /></div>
                    <p className="font-medium text-sm">{s.name}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>{s.active ? 'Actif' : 'Inactif'}</span>
                </div>
                {s.contact_name && <p className="text-xs text-gray-600">{s.contact_name}</p>}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {s.email && <span>{s.email}</span>}
                  {s.phone && <span>{s.phone}</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(s.product_details || []).map((p) => (<span key={p.id} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-wine-50 text-wine-700">{p.name}</span>))}
                </div>
                <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handleToggle(s.id)} className="text-xs px-2 py-1 rounded-lg border text-gray-500 hover:bg-gray-100">{s.active ? 'Désactiver' : 'Activer'}</button>
                  <button onClick={() => handleDelete(s)} className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50">Supprimer</button>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Fournisseur</th>
                <th className="pb-3 font-medium">Contact</th>
                <th className="pb-3 font-medium">Email</th>
                <th className="pb-3 font-medium">Téléphone</th>
                <th className="pb-3 font-medium">Produits</th>
                <th className="pb-3 font-medium">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {suppliers.map((s) => (
                <tr key={s.id} className={`hover:bg-gray-50 cursor-pointer ${!s.active ? 'opacity-50' : ''}`} onClick={() => openEdit(s)}>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-wine-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Factory size={16} className="text-wine-600" />
                      </div>
                      <div>
                        <p className="font-medium">{s.name}</p>
                        {s.address && <p className="text-xs text-gray-400 truncate max-w-[200px]">{s.address}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-gray-600">{s.contact_name || '—'}</td>
                  <td className="py-3 text-gray-500 text-xs">{s.email || '—'}</td>
                  <td className="py-3 text-gray-500">{s.phone || '—'}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      {(s.product_details || []).map((p) => (
                        <span key={p.id} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-wine-50 text-wine-700">{p.name}</span>
                      ))}
                      {(!s.product_details || s.product_details.length === 0) && <span className="text-xs text-gray-400">Aucun</span>}
                    </div>
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                      {s.active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Modifier">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => handleToggle(s.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title={s.active ? 'Désactiver' : 'Activer'}>
                        {s.active ? <ToggleRight size={16} className="text-green-600" /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => handleDelete(s)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Supprimer">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>

      {showForm && (
        <SupplierFormModal
          supplier={editSupplier}
          allProducts={allProducts}
          onClose={() => { setShowForm(false); setEditSupplier(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
