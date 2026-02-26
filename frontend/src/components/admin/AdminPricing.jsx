import { useState, useEffect } from 'react';
import { pricingConditionsAPI, clientTypesAPI } from '../../services/api';
import { FileText, Plus, Save, X, Trash2, Award } from 'lucide-react';

export default function AdminPricing() {
  const [conditions, setConditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    client_type: '', label: '', discount_pct: 0, commission_pct: 0,
    commission_student: '', min_order: 0, payment_terms: '', active: true,
  });

  // Tier editor state
  const [clientTypes, setClientTypes] = useState([]);
  const [editingTiers, setEditingTiers] = useState(null); // client_type id
  const [tiers, setTiers] = useState([]);
  const [tierSaving, setTierSaving] = useState(false);
  const [tierMsg, setTierMsg] = useState(null);

  useEffect(() => { loadConditions(); loadClientTypes(); }, []);

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

  const loadClientTypes = async () => {
    try {
      const res = await clientTypesAPI.list();
      const all = res.data?.data || res.data || [];
      setClientTypes(all.filter((ct) => {
        const tr = typeof ct.tier_rules === 'string' ? JSON.parse(ct.tier_rules) : (ct.tier_rules || {});
        return tr.tiers && tr.tiers.length > 0 || ct.name === 'cse' || ct.name === 'ambassadeur';
      }));
    } catch (err) {
      console.error(err);
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

  // Tier editor
  const startEditTiers = (ct) => {
    const tr = typeof ct.tier_rules === 'string' ? JSON.parse(ct.tier_rules) : (ct.tier_rules || {});
    setEditingTiers(ct.id);
    setTiers((tr.tiers || []).map((t) => ({ ...t })));
    setTierMsg(null);
  };

  const addTier = () => {
    setTiers([...tiers, { threshold: 0, label: '', reward: '', color: '#6B7280' }]);
  };

  const removeTier = (idx) => {
    setTiers(tiers.filter((_, i) => i !== idx));
  };

  const updateTier = (idx, field, value) => {
    setTiers(tiers.map((t, i) => i === idx ? { ...t, [field]: field === 'threshold' ? parseFloat(value) || 0 : value } : t));
  };

  const saveTiers = async () => {
    // Validate
    for (const t of tiers) {
      if (!t.label || t.threshold <= 0 || !t.reward) {
        setTierMsg({ type: 'error', text: 'Chaque palier doit avoir un seuil > 0, un label et une récompense.' });
        return;
      }
    }
    setTierSaving(true);
    try {
      const ct = clientTypes.find((c) => c.id === editingTiers);
      const existingRules = typeof ct.tier_rules === 'string' ? JSON.parse(ct.tier_rules) : (ct.tier_rules || {});
      const newRules = { ...existingRules, tiers: tiers.sort((a, b) => a.threshold - b.threshold) };
      await clientTypesAPI.update(editingTiers, { tier_rules: newRules });
      setTierMsg({ type: 'success', text: 'Paliers enregistrés' });
      setEditingTiers(null);
      loadClientTypes();
    } catch (err) {
      setTierMsg({ type: 'error', text: err.response?.data?.message || 'Erreur' });
    } finally {
      setTierSaving(false);
    }
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
      <div className="card overflow-x-auto mb-6">
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

      {/* Tier editor section */}
      {clientTypes.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Award size={20} className="text-wine-600" />
            <h2 className="text-lg font-bold text-gray-900">Paliers de fidélité</h2>
          </div>

          {tierMsg && (
            <div className={`mb-3 p-2 rounded text-sm ${tierMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {tierMsg.text}
            </div>
          )}

          {clientTypes.map((ct) => {
            const tr = typeof ct.tier_rules === 'string' ? JSON.parse(ct.tier_rules) : (ct.tier_rules || {});
            const ctTiers = tr.tiers || [];
            const isEditing = editingTiers === ct.id;

            return (
              <div key={ct.id} className="border rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">{ct.label || ct.name} <span className="text-gray-400 font-normal">({ct.name})</span></h3>
                  {!isEditing ? (
                    <button onClick={() => startEditTiers(ct)} className="text-wine-600 hover:text-wine-800 text-xs">Modifier</button>
                  ) : (
                    <button onClick={() => setEditingTiers(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                  )}
                </div>

                {!isEditing ? (
                  ctTiers.length === 0 ? (
                    <p className="text-xs text-gray-400">Aucun palier défini</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {ctTiers.map((t, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color || '#6B7280' }} />
                          <span className="font-medium">{t.label}</span>
                          <span className="text-gray-500">{t.threshold} €</span>
                          <span className="text-gray-400">→ {t.reward}</span>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div>
                    <div className="space-y-2 mb-3">
                      {tiers.map((t, i) => (
                        <div key={i} className="grid grid-cols-[80px_1fr_1fr_50px_auto] gap-2 items-center">
                          <input
                            type="number" min="0" step="100"
                            value={t.threshold} onChange={(e) => updateTier(i, 'threshold', e.target.value)}
                            className="input-field text-xs" placeholder="Seuil €"
                          />
                          <input
                            value={t.label} onChange={(e) => updateTier(i, 'label', e.target.value)}
                            className="input-field text-xs" placeholder="Label"
                          />
                          <input
                            value={t.reward} onChange={(e) => updateTier(i, 'reward', e.target.value)}
                            className="input-field text-xs" placeholder="Récompense"
                          />
                          <input
                            type="color" value={t.color || '#6B7280'}
                            onChange={(e) => updateTier(i, 'color', e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                          />
                          <button onClick={() => removeTier(i)} className="text-red-400 hover:text-red-600" title="Supprimer">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <button onClick={addTier} className="text-xs text-wine-600 hover:text-wine-800 flex items-center gap-1">
                        <Plus size={14} /> Ajouter un palier
                      </button>
                      <button onClick={saveTiers} disabled={tierSaving} className="btn-primary text-xs flex items-center gap-1">
                        <Save size={14} /> {tierSaving ? 'Enregistrement...' : 'Enregistrer'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
