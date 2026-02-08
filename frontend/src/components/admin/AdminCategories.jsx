import { useState, useEffect, useCallback } from 'react';
import { categoriesAPI } from '../../services/api';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, X, Save, GripVertical } from 'lucide-react';

export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', icon: '', color: '#7a1c3b', sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await categoriesAPI.list();
      setCategories(data.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const openNew = () => {
    setForm({ name: '', description: '', icon: '', color: '#7a1c3b', sort_order: categories.length + 1 });
    setEditing('new');
  };

  const openEdit = (cat) => {
    setForm({ name: cat.name, description: cat.description || '', icon: cat.icon || '', color: cat.color || '#7a1c3b', sort_order: cat.sort_order });
    setEditing(cat.id);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing === 'new') {
        await categoriesAPI.create(form);
      } else {
        await categoriesAPI.update(editing, form);
      }
      setEditing(null);
      fetchCategories();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette catégorie ?')) return;
    try {
      await categoriesAPI.delete(id);
      fetchCategories();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur');
    }
  };

  const handleToggle = async (cat) => {
    try {
      await categoriesAPI.update(cat.id, { name: cat.name, active: !cat.active });
      fetchCategories();
    } catch (err) { alert(err.response?.data?.message || 'Erreur'); }
  };

  const moveCategory = async (idx, dir) => {
    const newCats = [...categories];
    const target = idx + dir;
    if (target < 0 || target >= newCats.length) return;
    [newCats[idx], newCats[target]] = [newCats[target], newCats[idx]];
    const order = newCats.map((c, i) => ({ id: c.id, sort_order: i + 1 }));
    try {
      await categoriesAPI.reorder(order);
      fetchCategories();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Catégories</h1>
        <button onClick={openNew} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nouvelle catégorie</button>
      </div>

      {/* Edit/Create Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">{editing === 'new' ? 'Nouvelle catégorie' : 'Modifier la catégorie'}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nom *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Icône (emoji)</label>
                  <input type="text" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm text-xl" maxLength={4} placeholder="🍷" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Couleur</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-10 rounded border cursor-pointer" />
                    <input type="text" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.name} className="btn-primary flex items-center gap-2">
                <Save size={16} /> {saving ? 'Sauvegarde...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Categories list */}
      <div className="card">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
        ) : categories.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><p>Aucune catégorie</p></div>
        ) : (
          <div className="border rounded-lg divide-y">
            {categories.map((cat, idx) => (
              <div key={cat.id} className={`flex items-center gap-4 p-4 ${!cat.active ? 'opacity-50' : ''}`}>
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveCategory(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button onClick={() => moveCategory(idx, 1)} disabled={idx === categories.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowDown size={14} /></button>
                </div>
                <span className="text-2xl w-8 text-center">{cat.icon || '📦'}</span>
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color || '#999' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{cat.name}</p>
                  {cat.description && <p className="text-xs text-gray-400 truncate">{cat.description}</p>}
                </div>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{cat.product_count || 0} produit{(cat.product_count || 0) !== 1 ? 's' : ''}</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={cat.active} onChange={() => handleToggle(cat)} className="rounded text-wine-700" />
                  <span className="text-xs text-gray-500">Actif</span>
                </label>
                <button onClick={() => openEdit(cat)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Pencil size={15} /></button>
                <button onClick={() => handleDelete(cat.id)} disabled={(cat.product_count || 0) > 0} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 disabled:opacity-30 disabled:cursor-not-allowed" title={(cat.product_count || 0) > 0 ? 'Produits rattachés' : 'Supprimer'}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
