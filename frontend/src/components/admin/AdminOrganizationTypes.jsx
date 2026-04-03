import { useState, useEffect, useCallback } from 'react';
import { organizationTypesAPI, campaignTypesAPI } from '../../services/api';
import { Plus, Pencil, Trash2, X, Save, Building2, ChevronLeft, AlertTriangle } from 'lucide-react';

function OrgTypeFormModal({ type, allCampaignTypes, onSave, onClose }) {
  const isNew = !type || type === 'new';
  const [form, setForm] = useState(isNew ? {
    code: '', label: '', description: '', default_client_type_id: null,
    default_config: {}, active: true, allowed_campaign_type_ids: [],
  } : {
    code: type.code, label: type.label, description: type.description || '',
    default_client_type_id: type.default_client_type_id || null,
    default_config: typeof type.default_config === 'string' ? JSON.parse(type.default_config) : (type.default_config || {}),
    active: type.active !== false,
    allowed_campaign_type_ids: (type.allowed_campaign_types || []).map((ct) => ct.id),
  });
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    setSaving(true);
    try {
      await onSave(isNew ? null : type.id, form);
      onClose();
    } catch (err) {
      setApiError(err.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const toggleCampType = (id) => {
    setForm((f) => ({
      ...f,
      allowed_campaign_type_ids: f.allowed_campaign_type_ids.includes(id)
        ? f.allowed_campaign_type_ids.filter((x) => x !== id)
        : [...f.allowed_campaign_type_ids, id],
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{isNew ? "Nouveau type d'organisation" : 'Modifier le type'}</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {apiError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{apiError}</span>
              <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Code *</label>
            <input type="text" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="w-full border rounded-lg px-3 py-2" required disabled={!isNew} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Label *</label>
            <input type="text" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className="w-full border rounded-lg px-3 py-2" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2" rows={2} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Types de campagne autorisés</label>
            <div className="space-y-2 mt-1">
              {allCampaignTypes.map((ct) => (
                <label key={ct.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.allowed_campaign_type_ids.includes(ct.id)}
                    onChange={() => toggleCampType(ct.id)}
                    className="rounded"
                  />
                  {ct.label} <span className="text-gray-400">({ct.code})</span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="rounded" />
            Actif
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Annuler</button>
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
              <Save size={14} /> {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminOrganizationTypes() {
  const [types, setTypes] = useState([]);
  const [campaignTypes, setCampaignTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [apiError, setApiError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [otRes, ctRes] = await Promise.all([
        organizationTypesAPI.list(),
        campaignTypesAPI.list(),
      ]);
      setTypes(otRes.data.data || []);
      setCampaignTypes(ctRes.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (id, data) => {
    if (id) {
      await organizationTypesAPI.update(id, data);
    } else {
      await organizationTypesAPI.create(data);
    }
    fetchData();
  };

  const handleDelete = async (type) => {
    if (!confirm(`Supprimer le type "${type.label}" ?`)) return;
    setApiError('');
    try {
      await organizationTypesAPI.delete(type.id);
      fetchData();
    } catch (err) {
      setApiError(err.response?.data?.message || 'Erreur de suppression');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 size={24} className="text-wine-700" />
          <h1 className="text-2xl font-bold text-gray-900">Types d'organisation</h1>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Nouveau type
        </button>
      </div>

      {apiError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{apiError}</span>
          <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {types.map((t) => (
          <div key={t.id} className={`bg-white rounded-xl border p-5 space-y-3 ${!t.active ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{t.label}</h3>
                <p className="text-xs text-gray-500">{t.code}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setEditing(t)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(t)} className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg"><Trash2 size={14} /></button>
              </div>
            </div>
            {t.description && <p className="text-sm text-gray-600">{t.description}</p>}
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">{t.org_count} org.</span>
              {!t.active && <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Inactif</span>}
            </div>
            {(t.allowed_campaign_types || []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {t.allowed_campaign_types.map((ct) => (
                  <span key={ct.id} className="px-2 py-0.5 bg-wine-50 text-wine-700 rounded-full text-xs">{ct.label}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {types.length === 0 && (
        <div className="text-center py-12 text-gray-400">Aucun type d'organisation</div>
      )}

      {editing && (
        <OrgTypeFormModal
          type={editing}
          allCampaignTypes={campaignTypes}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
