import { useState, useEffect } from 'react';
import { pricingConditionsAPI } from '../../services/api';
import { FileText, Plus, Save, X } from 'lucide-react';

export default function AdminPricing() {
  const [conditions, setConditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    client_type: '', label: '', discount_pct: 0, commission_pct: 0,
    commission_student: '', min_order: 0, payment_terms: '', active: true,
  });

  useEffect(() => { loadConditions(); }, []);

  const loadConditions = async () => {
    try {
      const res = await pricingConditionsAPI.list();
      setConditions(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await pricingConditionsAPI.update(editing, form);
      } else {
        await pricingConditionsAPI.create(form);
      }
      setEditing(null);
      setShowCreate(false);
      setForm({ client_type: '', label: '', discount_pct: 0, commission_pct: 0, commission_student: '', min_order: 0, payment_terms: '', active: true });
      loadConditions();
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (c) => {
    setEditing(c.id);
    setForm({
      client_type: c.client_type,
      label: c.label,
      discount_pct: parseFloat(c.discount_pct),
      commission_pct: parseFloat(c.commission_pct),
      commission_student: c.commission_student || '',
      min_order: parseFloat(c.min_order),
      payment_terms: c.payment_terms || '',
      active: c.active,
    });
    setShowCreate(true);
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conditions commerciales</h1>
          <p className="text-sm text-gray-500 mt-1">Grille tarifaire par type de client</p>
        </div>
        <button onClick={() => { setShowCreate(true); setEditing(null); setForm({ client_type: '', label: '', discount_pct: 0, commission_pct: 0, commission_student: '', min_order: 0, payment_terms: '', active: true }); }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {/* Edit/Create form */}
      {showCreate && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{editing ? 'Modifier' : 'Nouvelle'} condition</h3>
            <button onClick={() => { setShowCreate(false); setEditing(null); }}><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type client</label>
              <input value={form.client_type} onChange={(e) => setForm({ ...form, client_type: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Remise %</label>
              <input type="number" value={form.discount_pct} onChange={(e) => setForm({ ...form, discount_pct: parseFloat(e.target.value) || 0 })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Commission %</label>
              <input type="number" value={form.commission_pct} onChange={(e) => setForm({ ...form, commission_pct: parseFloat(e.target.value) || 0 })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Commission étudiant</label>
              <input value={form.commission_student} onChange={(e) => setForm({ ...form, commission_student: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Commande min</label>
              <input type="number" value={form.min_order} onChange={(e) => setForm({ ...form, min_order: parseFloat(e.target.value) || 0 })} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Conditions paiement</label>
              <input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} className="input-field" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
                <span className="text-sm">Actif</span>
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={handleSave} className="btn-primary flex items-center gap-2"><Save size={16} /> Enregistrer</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 px-3">Type client</th>
              <th className="py-2 px-3">Label</th>
              <th className="py-2 px-3">Remise %</th>
              <th className="py-2 px-3">Commission %</th>
              <th className="py-2 px-3">Cmd min</th>
              <th className="py-2 px-3">Paiement</th>
              <th className="py-2 px-3">Actif</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {conditions.map((c) => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 font-medium">{c.client_type}</td>
                <td className="py-2 px-3">{c.label}</td>
                <td className="py-2 px-3">{parseFloat(c.discount_pct)}%</td>
                <td className="py-2 px-3">{parseFloat(c.commission_pct)}%</td>
                <td className="py-2 px-3">{parseFloat(c.min_order) > 0 ? `${parseFloat(c.min_order)} EUR` : '-'}</td>
                <td className="py-2 px-3">{c.payment_terms || '-'}</td>
                <td className="py-2 px-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.active ? 'Oui' : 'Non'}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <button onClick={() => startEdit(c)} className="text-wine-600 hover:text-wine-800 text-xs">Modifier</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
