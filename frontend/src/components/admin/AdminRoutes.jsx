import { useState, useEffect, useCallback } from 'react';
import { deliveryRoutesAPI } from '../../services/api';
import { Map, Plus, Truck, Calendar, X, Save } from 'lucide-react';

const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '\u2014';

const STATUS_LABELS = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  planned: { label: 'Planifi\u00e9e', color: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'En cours', color: 'bg-violet-100 text-violet-800' },
  completed: { label: 'Termin\u00e9e', color: 'bg-green-100 text-green-800' },
};

const STATUS_TRANSITIONS = {
  draft: ['planned'],
  planned: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
};

const STATUSES = ['draft', 'planned', 'in_progress', 'completed'];

function RouteForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ date: '', zone: '', driver: '', stops: '', km: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let stopsArray;
      try {
        stopsArray = JSON.parse(form.stops);
        if (!Array.isArray(stopsArray)) throw new Error();
      } catch {
        alert('Le champ "Arr\u00eats" doit \u00eatre un tableau JSON valide.\nExemple : ["Nantes Centre", "Saint-Herblain"]');
        setSaving(false);
        return;
      }

      await onSave({
        date: form.date,
        zone: form.zone,
        driver: form.driver,
        stops: stopsArray,
        km: parseFloat(form.km) || 0,
      });
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de la cr\u00e9ation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold">Nouvelle tourn\u00e9e</h2>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date *</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Zone *</label>
          <input
            type="text"
            value={form.zone}
            onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Ex : Nantes Nord"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Chauffeur *</label>
          <input
            type="text"
            value={form.driver}
            onChange={(e) => setForm((f) => ({ ...f, driver: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Nom du chauffeur"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Kilom\u00e8tres</label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={form.km}
            onChange={(e) => setForm((f) => ({ ...f, km: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="0"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Arr\u00eats (tableau JSON) *</label>
          <textarea
            value={form.stops}
            onChange={(e) => setForm((f) => ({ ...f, stops: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
            rows={3}
            placeholder='["Nantes Centre", "Saint-Herblain", "Rez\u00e9"]'
            required
          />
          <p className="text-xs text-gray-400 mt-1">Format : tableau JSON de noms d\u2019arr\u00eats</p>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
          Annuler
        </button>
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={16} />
          {saving ? 'Cr\u00e9ation...' : 'Cr\u00e9er la tourn\u00e9e'}
        </button>
      </div>
    </form>
  );
}

export default function AdminRoutes() {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', zone: '' });
  const [creating, setCreating] = useState(false);

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.zone) params.zone = filters.zone;
      const { data } = await deliveryRoutesAPI.list(params);
      setRoutes(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  const handleCreate = async (payload) => {
    await deliveryRoutesAPI.create(payload);
    setCreating(false);
    fetchRoutes();
  };

  const handleStatusUpdate = async (id, newStatus) => {
    const statusLabel = STATUS_LABELS[newStatus]?.label || newStatus;
    if (!confirm(`Passer la tourn\u00e9e au statut "${statusLabel}" ?`)) return;
    try {
      await deliveryRoutesAPI.update(id, { status: newStatus });
      fetchRoutes();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur de mise \u00e0 jour');
    }
  };

  // Extract unique zones for filter dropdown
  const zones = [...new Set(routes.map((r) => r.zone).filter(Boolean))];

  if (creating) {
    return (
      <div className="card">
        <RouteForm onSave={handleCreate} onCancel={() => setCreating(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tourn\u00e9es</h1>
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Nouvelle tourn\u00e9e
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Tous</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s].label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Zone</label>
            <select
              value={filters.zone}
              onChange={(e) => setFilters((f) => ({ ...f, zone: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Toutes</option>
              {zones.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setFilters({ status: '', zone: '' })}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
          >
            Effacer
          </button>
        </div>
      </div>

      {/* Routes Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
          </div>
        ) : routes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Map size={40} className="mx-auto mb-3" />
            <p>Aucune tourn\u00e9e trouv\u00e9e</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Zone</th>
                <th className="pb-3 font-medium">Chauffeur</th>
                <th className="pb-3 font-medium">Arr\u00eats</th>
                <th className="pb-3 font-medium">Km</th>
                <th className="pb-3 font-medium">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {routes.map((r) => {
                const status = STATUS_LABELS[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-700' };
                const transitions = STATUS_TRANSITIONS[r.status] || [];
                const stopsCount = Array.isArray(r.stops) ? r.stops.length : 0;
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-gray-400" />
                        <span>{formatDate(r.date)}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <Map size={14} className="text-gray-400" />
                        <span>{r.zone}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <Truck size={14} className="text-gray-400" />
                        <span>{r.driver}</span>
                      </div>
                    </td>
                    <td className="py-3 font-semibold">{stopsCount}</td>
                    <td className="py-3 text-gray-500">{r.km ?? '\u2014'} km</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {transitions.length > 0 && (
                        <div className="flex items-center justify-end gap-1">
                          {transitions.map((nextStatus) => {
                            const nextLabel = STATUS_LABELS[nextStatus]?.label || nextStatus;
                            return (
                              <button
                                key={nextStatus}
                                onClick={() => handleStatusUpdate(r.id, nextStatus)}
                                className="text-xs px-3 py-1.5 rounded-lg border border-wine-200 text-wine-700 hover:bg-wine-50"
                              >
                                {nextLabel}
                              </button>
                            );
                          })}
                        </div>
                      )}
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
