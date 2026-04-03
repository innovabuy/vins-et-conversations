import { useState, useEffect, useRef } from 'react';
import { Shield, Plus, RotateCcw, Banknote, X, AlertTriangle } from 'lucide-react';
import { cautionChecksAPI, ordersAPI, usersAPI } from '../../services/api';

function UserAutocomplete({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const debounceRef = useRef(null);

  const search = (q) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await usersAPI.list({ search: q, limit: 5 });
        setResults(res.data.data || []);
      } catch (_) {}
    }, 300);
  };

  return (
    <div className="relative">
      <input type="text" value={query}
        onChange={(e) => search(e.target.value)}
        placeholder={selected ? `${selected.name} (${selected.email})` : 'Rechercher par nom ou email...'}
        className="w-full border rounded-lg px-3 py-2 text-sm" />
      {results.length > 0 && (
        <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg mt-1 shadow-lg max-h-32 overflow-y-auto">
          {results.map((u) => (
            <button key={u.id} type="button" onClick={() => {
              onChange(u.id);
              setSelected(u);
              setQuery('');
              setResults([]);
            }} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
              {u.name} <span className="text-gray-400">({u.email})</span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <button type="button" onClick={() => { setSelected(null); onChange(''); setQuery(''); }}
          className="absolute right-2 top-2 text-gray-400 hover:text-red-500"><X size={14} /></button>
      )}
    </div>
  );
}

const STATUS_LABELS = {
  held: { label: 'En cours', color: 'bg-amber-100 text-amber-800' },
  returned: { label: 'Restitué', color: 'bg-green-100 text-green-800' },
  cashed: { label: 'Encaissé', color: 'bg-blue-100 text-blue-800' },
};

export default function AdminCautionChecks() {
  const [checks, setChecks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ order_id: '', user_id: '', product_id: '', campaign_id: '', amount: '', check_number: '', check_date: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const params = filter ? { status: filter } : {};
      const [checksRes, summaryRes] = await Promise.all([
        cautionChecksAPI.list(params),
        cautionChecksAPI.summary(),
      ]);
      setChecks(checksRes.data.data);
      setSummary(summaryRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError('Le montant est obligatoire');
      return;
    }
    setSaving(true);
    try {
      await cautionChecksAPI.create({
        ...form,
        amount: parseFloat(form.amount),
        order_id: form.order_id || null,
        user_id: form.user_id || null,
        product_id: form.product_id || null,
        campaign_id: form.campaign_id || null,
      });
      setShowForm(false);
      setForm({ order_id: '', user_id: '', product_id: '', campaign_id: '', amount: '', check_number: '', check_date: '', notes: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const [actionError, setActionError] = useState('');

  const handleAction = async (id, status) => {
    const data = { status };
    if (status === 'returned') {
      data.returned_date = new Date().toISOString().slice(0, 10);
    }
    setActionError('');
    try {
      await cautionChecksAPI.update(id, data);
      load();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Erreur');
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-400">Chargement...</div>;

  return (
    <div className="space-y-4">
      {/* Header with totals */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-blue-600" />
          <h2 className="text-lg font-bold text-gray-800">Chèques de caution</h2>
          {summary && (
            <span className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-sm font-medium text-amber-700">
              {summary.total_count} en cours — {summary.total_held.toFixed(2)} €
            </span>
          )}
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">
          <Plus size={16} /> Enregistrer un chèque
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['', 'held', 'returned', 'cashed'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-lg border ${filter === s ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {s === '' ? 'Tous' : STATUS_LABELS[s].label}
          </button>
        ))}
      </div>

      {/* Create form modal */}
      {showForm && (
        <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Nouveau chèque de caution</h3>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Montant (€) *</label>
              <input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="150.00" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">N° chèque</label>
              <input type="text" value={form.check_number} onChange={(e) => setForm({ ...form, check_number: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="1234567" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date du chèque</label>
              <input type="date" value={form.check_date} onChange={(e) => setForm({ ...form, check_date: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ID Commande (UUID)</label>
              <input type="text" value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optionnel" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Utilisateur</label>
              <UserAutocomplete value={form.user_id} onChange={(id) => setForm({ ...form, user_id: id })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ID Campagne (UUID)</label>
              <input type="text" value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optionnel" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Optionnel" />
            </div>
            {error && <p className="md:col-span-3 text-sm text-red-600">{error}</p>}
            <div className="md:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">Annuler</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Client</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Commande</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Produit</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Montant</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">N° chèque</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Statut</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {checks.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Aucun chèque de caution</td></tr>
              ) : checks.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">{c.user_name || '—'}</div>
                    <div className="text-xs text-gray-400">{c.user_email || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.order_ref || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.product_name || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">{parseFloat(c.amount).toFixed(2)} €</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.check_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.check_date ? new Date(c.check_date).toLocaleDateString('fr-FR') : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[c.status]?.color || 'bg-gray-100'}`}>
                      {STATUS_LABELS[c.status]?.label || c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.status === 'held' && (
                      <div className="flex gap-1">
                        <button onClick={() => handleAction(c.id, 'returned')} title="Restituer"
                          className="p-1.5 rounded-lg text-green-600 hover:bg-green-50"><RotateCcw size={14} /></button>
                        <button onClick={() => handleAction(c.id, 'cashed')} title="Encaisser"
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50"><Banknote size={14} /></button>
                      </div>
                    )}
                    {c.status === 'returned' && c.returned_date && (
                      <span className="text-xs text-gray-400">Restitué le {new Date(c.returned_date).toLocaleDateString('fr-FR')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
