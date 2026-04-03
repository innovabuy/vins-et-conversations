import { useState, useEffect, useCallback } from 'react';
import { deliveryRoutesAPI, deliveryNotesAPI } from '../../services/api';
import { Map, Plus, Truck, Calendar, X, Save, ChevronRight, ChevronLeft, Check, Package, Printer, Eye, Pencil, Trash2, ArrowUp, ArrowDown, ArrowLeft, Play, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const formatDateTime = (d) => d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_LABELS = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  planned: { label: 'Planifiée', color: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'En cours', color: 'bg-violet-100 text-violet-800' },
  delivered: { label: 'Livrée', color: 'bg-green-100 text-green-800' },
};

const STATUS_TRANSITIONS = { draft: ['planned'], planned: ['in_progress'], in_progress: ['delivered'], delivered: [] };
const TRANSITION_LABELS = { planned: 'Planifier', in_progress: 'Démarrer', delivered: 'Terminer' };

// ─── Route Creation Wizard ───────────────────────────
function RouteWizard({ onSave, onCancel }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ date: '', driver: '' });
  const [availableBLs, setAvailableBLs] = useState([]);
  const [selectedBLs, setSelectedBLs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');
  const [errors, setErrors] = useState({});

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
    setApiError('');
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
      setApiError(err.response?.data?.message || 'Erreur lors de la création');
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

      {apiError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{apiError}</span>
          <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date de la tournée *</label>
              <input type="date" value={form.date} onChange={e => { setForm(f => ({ ...f, date: e.target.value })); setErrors(e2 => ({ ...e2, date: '' })); }} className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.date ? 'border-red-400' : ''}`} required />
              {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Chauffeur *</label>
              <input type="text" value={form.driver} onChange={e => { setForm(f => ({ ...f, driver: e.target.value })); setErrors(e2 => ({ ...e2, driver: '' })); }} className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.driver ? 'border-red-400' : ''}`} placeholder="Nom du chauffeur" required />
              {errors.driver && <p className="text-xs text-red-500 mt-1">{errors.driver}</p>}
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => { const errs = {}; if (!form.date) errs.date = 'La date est requise'; if (!form.driver) errs.driver = 'Le chauffeur est requis'; setErrors(errs); if (Object.keys(errs).length === 0) setStep(2); }} className="btn-primary flex items-center gap-2">
              Suivant <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

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
                              <span className="text-xs text-gray-500">{bl.recipient_name || bl.user_name}</span>
                            </div>
                            <p className="text-xs text-gray-400 truncate">{bl.delivery_address || 'Adresse non renseignée'}</p>
                          </div>
                          <div className="text-right text-xs">
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
            <button onClick={() => { if (selectedBLs.length === 0) setApiError('Sélectionnez au moins un BL'); else { setApiError(''); setStep(3); } }} className="btn-primary flex items-center gap-2">
              Suivant <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

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

// ─── Route Detail/Edit Component ─────────────────────
function RouteDetail({ routeId, onBack, onDeleted }) {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [availableBLs, setAvailableBLs] = useState([]);
  const [showAddBL, setShowAddBL] = useState(false);
  const [apiError, setApiError] = useState('');

  const fetchRoute = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await deliveryRoutesAPI.get(routeId);
      setRoute(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [routeId]);

  useEffect(() => { fetchRoute(); }, [fetchRoute]);

  const startEdit = () => {
    setEditForm({
      date: route.date?.substring(0, 10) || '',
      driver: route.driver || '',
      zone: route.zone || '',
      notes: route.notes || '',
      stops: [...route.stops],
      km: route.km || 0,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setApiError('');
    setSaving(true);
    try {
      await deliveryRoutesAPI.update(routeId, editForm);
      setEditing(false);
      fetchRoute();
    } catch (err) {
      setApiError(err.response?.data?.message || 'Erreur de sauvegarde');
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (newStatus) => {
    const label = TRANSITION_LABELS[newStatus] || newStatus;
    if (!confirm(`${label} la tournée ?`)) return;
    setApiError('');
    try {
      await deliveryRoutesAPI.updateStatus(routeId, { status: newStatus });
      fetchRoute();
    } catch (err) {
      setApiError(err.response?.data?.message || 'Erreur de mise à jour');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Supprimer cette tournée ?')) return;
    setApiError('');
    try {
      await deliveryRoutesAPI.delete(routeId);
      onDeleted();
    } catch (err) {
      setApiError(err.response?.data?.message || 'Erreur de suppression');
    }
  };

  const handleAddStop = async (blId) => {
    setApiError('');
    try {
      await deliveryRoutesAPI.addStop(routeId, { delivery_note_id: blId });
      setShowAddBL(false);
      fetchRoute();
    } catch (err) {
      setApiError(err.response?.data?.message || 'Erreur');
    }
  };

  const handleRemoveStop = async (blId) => {
    if (!confirm('Retirer cet arrêt ?')) return;
    setApiError('');
    try {
      await deliveryRoutesAPI.removeStop(routeId, blId);
      fetchRoute();
    } catch (err) {
      setApiError(err.response?.data?.message || 'Erreur');
    }
  };

  const handlePrint = () => {
    const url = deliveryRoutesAPI.pdf(routeId);
    const token = localStorage.getItem('accessToken');
    window.open(`${url}?token=${token}`, '_blank');
  };

  const moveStop = (idx, dir) => {
    const newStops = [...editForm.stops];
    const target = idx + dir;
    if (target < 0 || target >= newStops.length) return;
    [newStops[idx], newStops[target]] = [newStops[target], newStops[idx]];
    setEditForm(f => ({ ...f, stops: newStops }));
  };

  const removeEditStop = (idx) => {
    setEditForm(f => ({ ...f, stops: f.stops.filter((_, i) => i !== idx) }));
  };

  // Load available BLs for add-stop modal
  useEffect(() => {
    if (showAddBL) {
      deliveryNotesAPI.list({ status: 'ready' })
        .then(res => {
          const bls = res.data.data || [];
          const existingIds = (route?.stops || []).map(s => s.delivery_note_id);
          setAvailableBLs(bls.filter(b => !existingIds.includes(b.id)));
        })
        .catch(console.error);
    }
  }, [showAddBL, route]);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>;
  if (!route) return <div className="text-center py-12 text-gray-400">Tournée introuvable</div>;

  const status = STATUS_LABELS[route.status] || { label: route.status, color: 'bg-gray-100 text-gray-700' };
  const transitions = STATUS_TRANSITIONS[route.status] || [];
  const canEdit = route.status !== 'delivered';
  const canDelete = ['draft', 'planned'].includes(route.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600"><ArrowLeft size={20} /></button>
          <div>
            <h2 className="text-lg font-bold">Tournée du {formatDate(route.date)}</h2>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${status.color}`}>{status.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
              <Pencil size={14} /> Modifier
            </button>
          )}
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">
            <Printer size={14} /> PDF
          </button>
          {canDelete && (
            <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
              <Trash2 size={14} /> Supprimer
            </button>
          )}
        </div>
      </div>

      {apiError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{apiError}</span>
          <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      {/* Workflow buttons */}
      {transitions.length > 0 && !editing && (
        <div className="flex gap-2">
          {transitions.map(next => (
            <button key={next} onClick={() => handleStatusChange(next)} className="btn-primary flex items-center gap-2">
              {next === 'planned' && <Calendar size={16} />}
              {next === 'in_progress' && <Play size={16} />}
              {next === 'delivered' && <CheckCircle size={16} />}
              {TRANSITION_LABELS[next]}
            </button>
          ))}
        </div>
      )}

      {/* Edit mode */}
      {editing ? (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold">Modifier la tournée</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
              <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Chauffeur</label>
              <input type="text" value={editForm.driver} onChange={e => setEditForm(f => ({ ...f, driver: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Zone</label>
              <input type="text" value={editForm.zone} onChange={e => setEditForm(f => ({ ...f, zone: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Km estimés</label>
              <input type="number" value={editForm.km} onChange={e => setEditForm(f => ({ ...f, km: parseFloat(e.target.value) || 0 }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
            </div>
          </div>

          {/* Stops reorder */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Arrêts ({editForm.stops.length})</h4>
            <div className="border rounded-lg divide-y">
              {editForm.stops.map((stop, idx) => (
                <div key={stop.delivery_note_id || idx} className="flex items-center gap-3 p-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveStop(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowUp size={14} /></button>
                    <button onClick={() => moveStop(idx, 1)} disabled={idx === editForm.stops.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowDown size={14} /></button>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{stop.recipient || 'Destinataire inconnu'}</p>
                    <p className="text-xs text-gray-400 truncate">{stop.address || stop.bl_ref || stop.ref || ''}</p>
                  </div>
                  <button onClick={() => removeEditStop(idx)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save size={16} /> {saving ? 'Sauvegarde...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Read mode — Summary */}
          <div className="card">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-gray-500 block text-xs">Chauffeur</span><span className="font-medium">{route.driver || '—'}</span></div>
              <div><span className="text-gray-500 block text-xs">Zone</span><span className="font-medium">{route.zone || '—'}</span></div>
              <div><span className="text-gray-500 block text-xs">Arrêts</span><span className="font-semibold text-wine-700">{route.stops?.length || 0}</span></div>
              <div><span className="text-gray-500 block text-xs">Km estimés</span><span className="font-medium">{route.km || 0} km</span></div>
            </div>
            {route.notes && (
              <div className="mt-3 pt-3 border-t text-sm">
                <span className="text-gray-500 text-xs block">Notes</span>
                <p className="mt-0.5">{route.notes}</p>
              </div>
            )}
            {(route.departed_at || route.completed_at) && (
              <div className="mt-3 pt-3 border-t grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {route.departed_at && <div><span className="text-gray-500 block text-xs">Départ</span><span className="font-medium flex items-center gap-1"><Clock size={12} /> {formatDateTime(route.departed_at)}</span></div>}
                {route.completed_at && <div><span className="text-gray-500 block text-xs">Arrivée</span><span className="font-medium flex items-center gap-1"><CheckCircle size={12} /> {formatDateTime(route.completed_at)}</span></div>}
                {route.duration_minutes != null && <div><span className="text-gray-500 block text-xs">Durée</span><span className="font-semibold">{route.duration_minutes} min</span></div>}
              </div>
            )}
          </div>

          {/* Stops list */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Arrêts ({route.stops?.length || 0})</h3>
              {canEdit && (
                <button onClick={() => setShowAddBL(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-wine-200 text-wine-700 rounded-lg hover:bg-wine-50">
                  <Plus size={14} /> Ajouter un BL
                </button>
              )}
            </div>
            <div className="border rounded-lg divide-y">
              {(route.stops || []).map((stop, idx) => {
                const itemsCount = (stop.items || []).reduce((s, it) => s + it.qty, 0);
                return (
                  <div key={stop.delivery_note_id || idx} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{idx + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{stop.recipient || 'Destinataire inconnu'}</span>
                          {stop.bl_ref && <span className="font-mono text-xs text-gray-500">{stop.bl_ref}</span>}
                        </div>
                        {stop.address && <p className="text-xs text-gray-400 mt-0.5">{stop.address}</p>}
                        {stop.phone && <p className="text-xs text-gray-400">Tel: {stop.phone}</p>}
                        {stop.items && stop.items.length > 0 && (
                          <div className="mt-2 space-y-0.5">
                            {stop.items.map((it, i) => (
                              <div key={i} className="flex justify-between text-xs text-gray-500">
                                <span>{it.product_name}</span>
                                <span className="font-medium">x{it.qty}</span>
                              </div>
                            ))}
                            <div className="text-xs font-semibold text-gray-700 pt-1 border-t mt-1">{itemsCount} articles</div>
                          </div>
                        )}
                      </div>
                      {canEdit && stop.delivery_note_id && (
                        <button onClick={() => handleRemoveStop(stop.delivery_note_id)} className="text-red-400 hover:text-red-600 mt-0.5"><X size={16} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
              {(!route.stops || route.stops.length === 0) && (
                <div className="p-6 text-center text-gray-400 text-sm">Aucun arrêt</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Add BL Modal */}
      {showAddBL && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowAddBL(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Ajouter un BL</h3>
              <button onClick={() => setShowAddBL(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-2">
              {availableBLs.length === 0 ? (
                <p className="text-center text-gray-400 py-6 text-sm">Aucun BL disponible</p>
              ) : availableBLs.map(bl => (
                <button key={bl.id} onClick={() => handleAddStop(bl.id)} className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-wine-50 transition-colors text-left">
                  <Package size={16} className="text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{bl.ref}</span>
                      <span className="text-xs text-gray-500">{bl.recipient_name || bl.user_name}</span>
                    </div>
                    <p className="text-xs text-gray-400 truncate">{bl.delivery_address || 'Adresse non renseignée'}</p>
                  </div>
                  <span className="text-xs text-gray-500">{bl.total_items || '?'} art.</span>
                </button>
              ))}
            </div>
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
  const [filters, setFilters] = useState({ status: '', zone: '', driver: '', date_from: '', date_to: '', hide_delivered: false });
  const [mode, setMode] = useState('list'); // list | creating | detail
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [apiError, setApiError] = useState('');

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.status) params.status = filters.status;
      if (filters.zone) params.zone = filters.zone;
      if (filters.driver) params.driver = filters.driver;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.hide_delivered) params.hide_delivered = 'true';
      const { data } = await deliveryRoutesAPI.list(params);
      setRoutes(data.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  const handleCreate = async (payload) => {
    await deliveryRoutesAPI.create(payload);
    setMode('list');
    fetchRoutes();
  };

  const handleStatusUpdate = async (id, newStatus) => {
    const label = TRANSITION_LABELS[newStatus] || newStatus;
    if (!confirm(`${label} la tournée ?`)) return;
    setApiError('');
    try {
      await deliveryRoutesAPI.updateStatus(id, { status: newStatus });
      fetchRoutes();
    } catch (err) {
      setApiError(err.response?.data?.message || 'Erreur de mise à jour');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette tournée ?')) return;
    setApiError('');
    try {
      await deliveryRoutesAPI.delete(id);
      fetchRoutes();
    } catch (err) {
      setApiError(err.response?.data?.message || 'Erreur de suppression');
    }
  };

  const handlePrint = (id) => {
    const url = deliveryRoutesAPI.pdf(id);
    const token = localStorage.getItem('accessToken');
    window.open(`${url}?token=${token}`, '_blank');
  };

  const openDetail = (id) => {
    setSelectedRouteId(id);
    setMode('detail');
  };

  const STATUSES = ['draft', 'planned', 'in_progress', 'delivered'];

  if (mode === 'creating') {
    return (
      <div className="card">
        <RouteWizard onSave={handleCreate} onCancel={() => setMode('list')} />
      </div>
    );
  }

  if (mode === 'detail' && selectedRouteId) {
    return (
      <RouteDetail
        routeId={selectedRouteId}
        onBack={() => { setMode('list'); fetchRoutes(); }}
        onDeleted={() => { setMode('list'); fetchRoutes(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tournées</h1>
        <button onClick={() => setMode('creating')} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nouvelle tournée</button>
      </div>

      {apiError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{apiError}</span>
          <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[130px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Tous</option>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s].label}</option>)}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Chauffeur</label>
            <input type="text" value={filters.driver} onChange={e => setFilters(f => ({ ...f, driver: e.target.value }))} placeholder="Rechercher..." className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Date début</label>
            <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Date fin</label>
            <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-2">
            <input type="checkbox" checked={filters.hide_delivered} onChange={e => setFilters(f => ({ ...f, hide_delivered: e.target.checked }))} className="rounded text-wine-700" />
            Masquer livrées
          </label>
          <button onClick={() => setFilters({ status: '', zone: '', driver: '', date_from: '', date_to: '', hide_delivered: false })} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Effacer</button>
        </div>
      </div>

      {/* Table */}
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
                <th className="pb-3 font-medium">Chauffeur</th>
                <th className="pb-3 font-medium">Zone</th>
                <th className="pb-3 font-medium">Arrêts</th>
                <th className="pb-3 font-medium">Km</th>
                <th className="pb-3 font-medium">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {routes.map(r => {
                const st = STATUS_LABELS[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-700' };
                const transitions = STATUS_TRANSITIONS[r.status] || [];
                const stopsCount = Array.isArray(r.stops) ? r.stops.length : 0;
                const canDel = ['draft', 'planned'].includes(r.status);
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="py-3"><div className="flex items-center gap-1.5"><Calendar size={14} className="text-gray-400" /><span>{formatDate(r.date)}</span></div></td>
                    <td className="py-3"><div className="flex items-center gap-1.5"><Truck size={14} className="text-gray-400" /><span>{r.driver || '—'}</span></div></td>
                    <td className="py-3"><div className="flex items-center gap-1.5"><Map size={14} className="text-gray-400" /><span>{r.zone || '—'}</span></div></td>
                    <td className="py-3 font-semibold">{stopsCount}</td>
                    <td className="py-3 text-gray-500">{r.km ?? '—'} km</td>
                    <td className="py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span></td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openDetail(r.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Voir"><Eye size={15} /></button>
                        <button onClick={() => handlePrint(r.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="PDF"><Printer size={15} /></button>
                        {transitions.length > 0 && transitions.map(next => (
                          <button key={next} onClick={() => handleStatusUpdate(r.id, next)} className="text-xs px-2.5 py-1.5 rounded-lg border border-wine-200 text-wine-700 hover:bg-wine-50">
                            {TRANSITION_LABELS[next]}
                          </button>
                        ))}
                        {canDel && (
                          <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Supprimer"><Trash2 size={15} /></button>
                        )}
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
