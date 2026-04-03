import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search, Tag, Percent, Euro, ToggleLeft, ToggleRight, AlertTriangle, X } from 'lucide-react';
import { promoCodesAPI } from '../../services/api';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : null;

export default function AdminPromoCodes() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCode, setEditingCode] = useState(null);
  const [form, setForm] = useState({ code: '', type: 'percentage', value: '', max_uses: '', min_order_ttc: '', valid_from: '', valid_until: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await promoCodesAPI.list();
      setCodes(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filteredCodes = codes.filter((c) => {
    if (!searchQuery) return true;
    return c.code.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const openCreate = () => {
    setEditingCode(null);
    setForm({ code: '', type: 'percentage', value: '', max_uses: '', min_order_ttc: '', valid_from: '', valid_until: '' });
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (code) => {
    setEditingCode(code);
    setForm({
      code: code.code,
      type: code.type,
      value: code.value,
      max_uses: code.max_uses || '',
      min_order_ttc: code.min_order_ttc || '',
      valid_from: code.valid_from ? code.valid_from.slice(0, 10) : '',
      valid_until: code.valid_until ? code.valid_until.slice(0, 10) : '',
    });
    setFormError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        code: form.code,
        type: form.type,
        value: parseFloat(form.value),
        max_uses: form.max_uses ? parseInt(form.max_uses) : null,
        min_order_ttc: form.min_order_ttc ? parseFloat(form.min_order_ttc) : 0,
        valid_from: form.valid_from || null,
        valid_until: form.valid_until || null,
      };
      if (editingCode) {
        await promoCodesAPI.update(editingCode.id, payload);
      } else {
        await promoCodesAPI.create(payload);
      }
      setShowModal(false);
      await loadData();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (code) => {
    try {
      await promoCodesAPI.update(code.id, { active: !code.active });
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (code) => {
    if (!window.confirm(`Supprimer le code ${code.code} ?`)) return;
    setApiError('');
    try {
      await promoCodesAPI.delete(code.id);
      await loadData();
    } catch (err) {
      setApiError(err.response?.data?.message || 'Erreur lors de la suppression');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tag size={24} /> Codes promo
          </h1>
          <p className="text-sm text-gray-500 mt-1">{codes.length} code{codes.length > 1 ? 's' : ''} au total</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouveau code
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher un code..."
          className="w-full sm:w-64 pl-9 pr-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-wine-200"
        />
      </div>

      {apiError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{apiError}</span>
          <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Valeur</th>
              <th className="px-4 py-3 font-medium">Utilisations</th>
              <th className="px-4 py-3 font-medium">Min. commande</th>
              <th className="px-4 py-3 font-medium">Validite</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCodes.map((code) => (
              <tr key={code.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-bold text-wine-700">{code.code}</td>
                <td className="px-4 py-3">
                  {code.type === 'percentage' ? (
                    <span className="inline-flex items-center gap-1 text-blue-600"><Percent size={14} /> Pourcentage</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-green-600"><Euro size={14} /> Fixe</span>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">
                  {code.type === 'percentage' ? `${parseFloat(code.value)}%` : formatEur(parseFloat(code.value))}
                </td>
                <td className="px-4 py-3">
                  {code.current_uses}{code.max_uses ? ` / ${code.max_uses}` : ' / Illimite'}
                </td>
                <td className="px-4 py-3">
                  {parseFloat(code.min_order_ttc) > 0 ? formatEur(parseFloat(code.min_order_ttc)) : '-'}
                </td>
                <td className="px-4 py-3 text-xs">
                  {code.valid_until ? (
                    <span>{formatDate(code.valid_from)} - {formatDate(code.valid_until)}</span>
                  ) : (
                    <span className="text-gray-400">Permanent</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {code.active ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">Actif</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Inactif</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(code)} className="p-1.5 rounded hover:bg-gray-100" title="Modifier">
                      <Pencil size={14} className="text-gray-500" />
                    </button>
                    <button onClick={() => handleToggle(code)} className="p-1.5 rounded hover:bg-gray-100" title={code.active ? 'Desactiver' : 'Activer'}>
                      {code.active ? <ToggleRight size={14} className="text-green-600" /> : <ToggleLeft size={14} className="text-gray-400" />}
                    </button>
                    <button onClick={() => handleDelete(code)} className="p-1.5 rounded hover:bg-red-50" title="Supprimer">
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredCodes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">Aucun code promo</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editingCode ? 'Modifier le code' : 'Nouveau code promo'}</h2>

            {formError && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">{formError}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Code *</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="BIENVENUE10"
                  className="w-full border rounded-lg px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-wine-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, type: 'percentage' })}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                        form.type === 'percentage' ? 'bg-wine-50 border-wine-300 text-wine-700' : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      <Percent size={14} className="inline mr-1" /> %
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, type: 'fixed' })}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                        form.type === 'fixed' ? 'bg-wine-50 border-wine-300 text-wine-700' : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      <Euro size={14} className="inline mr-1" /> EUR
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Valeur *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder={form.type === 'percentage' ? '10' : '5.00'}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wine-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Nb max d'utilisations</label>
                  <input
                    type="number"
                    min="1"
                    value={form.max_uses}
                    onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                    placeholder="Illimite"
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wine-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Montant min. commande</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.min_order_ttc}
                    onChange={(e) => setForm({ ...form, min_order_ttc: e.target.value })}
                    placeholder="0.00"
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wine-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Valide a partir du</label>
                  <input
                    type="date"
                    value={form.valid_from}
                    onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wine-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Valide jusqu'au</label>
                  <input
                    type="date"
                    value={form.valid_until}
                    onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wine-200"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.code || !form.value} className="btn-primary disabled:opacity-50">
                {saving ? 'Enregistrement...' : editingCode ? 'Modifier' : 'Creer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
