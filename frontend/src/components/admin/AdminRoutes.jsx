import { useState, useEffect, useCallback } from 'react';
import { deliveryRoutesAPI, deliveryNotesAPI } from '../../services/api';
import { Map, Plus, Truck, Calendar, X, Save, ChevronRight, ChevronLeft, Check, Package } from 'lucide-react';

const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

const STATUS_LABELS = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  planned: { label: 'Planifiée', color: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'En cours', color: 'bg-violet-100 text-violet-800' },
  completed: { label: 'Terminée', color: 'bg-green-100 text-green-800' },
};

const STATUS_TRANSITIONS = { draft: ['planned'], planned: ['in_progress'], in_progress: ['completed'], completed: [] };

// ─── Route Creation Wizard ───────────────────────────
function RouteWizard({ onSave, onCancel }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ date: '', driver: '' });
  const [availableBLs, setAvailableBLs] = useState([]);
  const [selectedBLs, setSelectedBLs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 2: Load available BLs
  useEffect(() => {
    if (step === 2) {
      setLoading(true);
      deliveryNotesAPI.list({ status: 'ready' })
        .then(res => setAvailableBLs(res.data.data || []))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [step]);

  const toggleBL = (bl) => {
    setSelectedBLs(prev => {
      const exists = prev.find(b => b.id === bl.id);
      if (exists) return prev.filter(b => b.id !== bl.id);
      return [...prev, bl];
    });
  };

  // Group BLs by postal code prefix (first 2 digits of address)
  const groupedBLs = availableBLs.reduce((acc, bl) => {
    const addr = bl.delivery_address || bl.recipient_name || 'Sans adresse';
    const match = addr.match(/\b(\d{2})\d{3}\b/);
    const zone = match ? `Zone ${match[1]}` : 'Autre';
    if (!acc[zone]) acc[zone] = [];
    acc[zone].push(bl);
    return acc;
  }, {});

  const totalItems = selectedBLs.reduce((s, bl) => s + (bl.total_items || 0), 0);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const stops = selectedBLs.map(bl => ({
        delivery_note_id: bl.id,
        ref: bl.ref,
        recipient: bl.recipient_name || bl.user_name,
        address: bl.delivery_address || '',
        items: bl.total_items || 0,
      }));
      await onSave({
        date: form.date,
        driver: form.driver,
        zone: Object.keys(groupedBLs).join(', '),
        stops,
        km: 0,
      });
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Nouvelle tournée</h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            {s > 1 && <div className={`w-8 h-0.5 ${step >= s ? 'bg-wine-400' : 'bg-gray-200'}`} />}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= s ? 'bg-wine-700 text-white' : 'bg-gray-100 text-gray-400'}`}>{s}</div>
          </div>
        ))}
        <span className="text-sm text-gray-500 ml-2">
          {step === 1 && 'Date et chauffeur'}
          {step === 2 && 'Sélection des BL'}
          {step === 3 && 'Récapitulatif'}
        </span>
      </div>

      {/* Step 1: Date & Driver */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date de la tournée *</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Chauffeur *</label>
              <input type="text" value={form.driver} onChange={e => setForm(f => ({ ...f, driver: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nom du chauffeur" required />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => { if (form.date && form.driver) setStep(2); else alert('Veuillez remplir la date et le chauffeur'); }} className="btn-primary flex items-center gap-2">
              Suivant <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Select BLs */}
      {step === 2 && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
          ) : availableBLs.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Package size={32} className="mx-auto mb-2" />
              <p className="text-sm">Aucun BL prêt à livrer</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">{selectedBLs.length} BL sélectionné(s) sur {availableBLs.length} disponible(s)</p>
              {Object.entries(groupedBLs).map(([zone, bls]) => (
                <div key={zone}>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">{zone}</h3>
                  <div className="space-y-2">
                    {bls.map(bl => {
                      const isSelected = selectedBLs.some(b => b.id === bl.id);
                      return (
                        <label key={bl.id} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${isSelected ? 'border-wine-300 bg-wine-50' : 'hover:bg-gray-50'}`}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleBL(bl)} className="rounded text-wine-700" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-medium">{bl.ref}</span>
                              <span className="text-xs text-gray-500">→ {bl.recipient_name || bl.user_name}</span>
                            </div>
                            <p className="text-xs text-gray-400 truncate">{bl.delivery_address || 'Adresse non renseignée'}</p>
                          </div>
                          <div className="text-right text-xs">
                            <p className="font-semibold">{formatEur(bl.total_ttc)}</p>
                            <p className="text-gray-400">{bl.total_items || '?'} art.</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"><ChevronLeft size={16} /> Retour</button>
            <button onClick={() => { if (selectedBLs.length === 0) alert('Sélectionnez au moins un BL'); else setStep(3); }} className="btn-primary flex items-center gap-2">
              Suivant <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Summary */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Date :</span> <span className="font-medium">{formatDate(form.date)}</span></div>
              <div><span className="text-gray-500">Chauffeur :</span> <span className="font-medium">{form.driver}</span></div>
              <div><span className="text-gray-500">Nombre d'arrêts :</span> <span className="font-semibold text-wine-700">{selectedBLs.length}</span></div>
              <div><span className="text-gray-500">Articles totaux :</span> <span className="font-semibold">{totalItems}</span></div>
            </div>
          </div>

          <h3 className="text-sm font-semibold">Ordre des arrêts</h3>
          <div className="border rounded-lg divide-y">
            {selectedBLs.map((bl, idx) => (
              <div key={bl.id} className="flex items-center gap-3 p-3 text-sm">
                <div className="w-7 h-7 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{idx + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{bl.recipient_name || bl.user_name}</p>
                  <p className="text-xs text-gray-400 truncate">{bl.delivery_address || 'Adresse non renseignée'}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs">{bl.ref}</p>
                  <p className="text-xs text-gray-500">{bl.total_items || '?'} art.</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"><ChevronLeft size={16} /> Retour</button>
            <button onClick={handleSubmit} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save size={16} />{saving ? 'Création...' : 'Créer la tournée'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────
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
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  const handleCreate = async (payload) => {
    await deliveryRoutesAPI.create(payload);
    setCreating(false);
    fetchRoutes();
  };

  const handleStatusUpdate = async (id, newStatus) => {
    const statusLabel = STATUS_LABELS[newStatus]?.label || newStatus;
    if (!confirm(`Passer la tournée au statut "${statusLabel}" ?`)) return;
    try {
      await deliveryRoutesAPI.update(id, { status: newStatus });
      fetchRoutes();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur de mise à jour');
    }
  };

  const zones = [...new Set(routes.map(r => r.zone).filter(Boolean))];
  const STATUSES = ['draft', 'planned', 'in_progress', 'completed'];

  if (creating) {
    return (
      <div className="card">
        <RouteWizard onSave={handleCreate} onCancel={() => setCreating(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tournées</h1>
        <button onClick={() => setCreating(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nouvelle tournée</button>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Tous</option>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s].label}</option>)}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Zone</label>
            <select value={filters.zone} onChange={e => setFilters(f => ({ ...f, zone: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Toutes</option>
              {zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <button onClick={() => setFilters({ status: '', zone: '' })} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Effacer</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
        ) : routes.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><Map size={40} className="mx-auto mb-3" /><p>Aucune tournée trouvée</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Zone</th>
                <th className="pb-3 font-medium">Chauffeur</th>
                <th className="pb-3 font-medium">Arrêts</th>
                <th className="pb-3 font-medium">Km</th>
                <th className="pb-3 font-medium">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {routes.map(r => {
                const status = STATUS_LABELS[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-700' };
                const transitions = STATUS_TRANSITIONS[r.status] || [];
                const stopsCount = Array.isArray(r.stops) ? r.stops.length : 0;
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="py-3"><div className="flex items-center gap-1.5"><Calendar size={14} className="text-gray-400" /><span>{formatDate(r.date)}</span></div></td>
                    <td className="py-3"><div className="flex items-center gap-1.5"><Map size={14} className="text-gray-400" /><span>{r.zone || '—'}</span></div></td>
                    <td className="py-3"><div className="flex items-center gap-1.5"><Truck size={14} className="text-gray-400" /><span>{r.driver || '—'}</span></div></td>
                    <td className="py-3 font-semibold">{stopsCount}</td>
                    <td className="py-3 text-gray-500">{r.km ?? '—'} km</td>
                    <td className="py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span></td>
                    <td className="py-3 text-right">
                      {transitions.length > 0 && (
                        <div className="flex items-center justify-end gap-1">
                          {transitions.map(nextStatus => (
                            <button key={nextStatus} onClick={() => handleStatusUpdate(r.id, nextStatus)} className="text-xs px-3 py-1.5 rounded-lg border border-wine-200 text-wine-700 hover:bg-wine-50">
                              {STATUS_LABELS[nextStatus]?.label || nextStatus}
                            </button>
                          ))}
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
