import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { campaignsAPI } from '../../services/api';
import { ChevronLeft, ChevronRight, Check, Building2, Users, Wine, Settings, FileText, Rocket } from 'lucide-react';
import { formatEur } from '../../utils/chartTheme';

const STEPS = [
  { key: 'type', label: 'Type', icon: Settings, desc: 'Type de client' },
  { key: 'org', label: 'Organisation', icon: Building2, desc: 'École ou entreprise' },
  { key: 'details', label: 'Détails', icon: FileText, desc: 'Nom, dates, objectif' },
  { key: 'products', label: 'Produits', icon: Wine, desc: 'Sélection des vins' },
  { key: 'participants', label: 'Participants', icon: Users, desc: 'Élèves ou contacts' },
  { key: 'summary', label: 'Récapitulatif', icon: Rocket, desc: 'Vérification finale' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'active', label: 'Active' },
];

export default function CampaignWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [resources, setResources] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    client_type_id: '',
    org_id: '',
    name: '',
    status: 'draft',
    goal: 0,
    start_date: '',
    end_date: '',
    config: {},
    products: [],
    participants: [],
  });

  useEffect(() => {
    campaignsAPI.resources()
      .then((r) => setResources(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const updateForm = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const canNext = () => {
    if (step === 0) return !!form.client_type_id;
    if (step === 1) return !!form.org_id;
    if (step === 2) return form.name.length >= 3;
    return true;
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        goal: parseFloat(form.goal) || 0,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        products: form.products.map((p, i) => ({ product_id: p.id, custom_price: p.custom_price || null, sort_order: i })),
      };
      const { data } = await campaignsAPI.create(payload);
      navigate(`/admin/campaigns/${data.id}`);
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur de création');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  if (!resources) return <div className="text-center py-20 text-gray-400">Erreur de chargement</div>;

  const selectedType = resources.clientTypes.find((t) => t.id === form.client_type_id);
  const selectedOrg = resources.organizations.find((o) => o.id === form.org_id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/campaigns')} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
        <h1 className="text-2xl font-bold text-gray-900">Nouvelle campagne</h1>
      </div>

      {/* Steps indicator */}
      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => i <= step && setStep(i)}
            className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              i === step ? 'bg-wine-700 text-white' :
              i < step ? 'bg-green-50 text-green-700' :
              'bg-gray-100 text-gray-400'
            }`}
          >
            <s.icon size={14} />
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="card min-h-[300px]">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg">Type de client</h2>
            <p className="text-sm text-gray-500">Choisissez le type de campagne.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {resources.clientTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => updateForm('client_type_id', t.id)}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${
                    form.client_type_id === t.id ? 'border-wine-600 bg-wine-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold">{t.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{t.name}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg">Organisation</h2>
            <p className="text-sm text-gray-500">Sélectionnez l'établissement ou l'entreprise.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {resources.organizations.map((o) => (
                <button
                  key={o.id}
                  onClick={() => updateForm('org_id', o.id)}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${
                    form.org_id === o.id ? 'border-wine-600 bg-wine-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold">{o.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{o.type} {o.address ? `— ${o.address}` : ''}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg">Détails campagne</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Nom *</label>
                <input type="text" value={form.name} onChange={(e) => updateForm('name', e.target.value)} className="w-full border rounded-lg px-3 py-2" placeholder="ex: Sacré-Coeur 2025-2026" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Statut</label>
                <select value={form.status} onChange={(e) => updateForm('status', e.target.value)} className="w-full border rounded-lg px-3 py-2">
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Objectif CA (EUR)</label>
                <input type="number" value={form.goal} onChange={(e) => updateForm('goal', e.target.value)} className="w-full border rounded-lg px-3 py-2" step="100" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date début</label>
                <input type="date" value={form.start_date} onChange={(e) => updateForm('start_date', e.target.value)} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date fin</label>
                <input type="date" value={form.end_date} onChange={(e) => updateForm('end_date', e.target.value)} className="w-full border rounded-lg px-3 py-2" />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg">Sélection des produits</h2>
            <p className="text-sm text-gray-500">{form.products.length} produit(s) sélectionné(s)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
              {resources.products.map((p) => {
                const selected = form.products.some((sp) => sp.id === p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (selected) {
                        updateForm('products', form.products.filter((sp) => sp.id !== p.id));
                      } else {
                        updateForm('products', [...form.products, { id: p.id, name: p.name, price_ttc: p.price_ttc, custom_price: null }]);
                      }
                    }}
                    className={`p-3 border-2 rounded-xl text-left transition-all ${
                      selected ? 'border-wine-600 bg-wine-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{p.name}</p>
                      {selected && <Check size={16} className="text-wine-700" />}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{p.color} — {formatEur(p.price_ttc)}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg">Participants</h2>
            <p className="text-sm text-gray-500">{form.participants.length} participant(s) sélectionné(s)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
              {resources.users.map((u) => {
                const selected = form.participants.includes(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      if (selected) {
                        updateForm('participants', form.participants.filter((id) => id !== u.id));
                      } else {
                        updateForm('participants', [...form.participants, u.id]);
                      }
                    }}
                    className={`flex items-center gap-3 p-3 border-2 rounded-xl text-left transition-all ${
                      selected ? 'border-wine-600 bg-wine-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{u.name}</p>
                      <p className="text-xs text-gray-500">{u.email} — {u.role}</p>
                    </div>
                    {selected && <Check size={16} className="text-wine-700 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <h2 className="font-bold text-lg">Récapitulatif</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 font-medium">Type</p>
                <p className="font-semibold mt-1">{selectedType?.label || '—'}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 font-medium">Organisation</p>
                <p className="font-semibold mt-1">{selectedOrg?.name || '—'}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 font-medium">Campagne</p>
                <p className="font-semibold mt-1">{form.name || '—'}</p>
                <p className="text-xs text-gray-500">{form.status} — Objectif: {formatEur(form.goal)}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 font-medium">Période</p>
                <p className="font-semibold mt-1">
                  {form.start_date ? new Date(form.start_date).toLocaleDateString('fr-FR') : '—'} → {form.end_date ? new Date(form.end_date).toLocaleDateString('fr-FR') : '—'}
                </p>
              </div>
            </div>

            <div className="p-4 bg-wine-50 rounded-xl">
              <p className="text-xs text-wine-700 font-medium mb-2">{form.products.length} produit(s)</p>
              <div className="flex flex-wrap gap-2">
                {form.products.map((p) => (
                  <span key={p.id} className="px-2 py-1 bg-white rounded-lg text-xs font-medium">{p.name}</span>
                ))}
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-xl">
              <p className="text-xs text-blue-700 font-medium mb-2">{form.participants.length} participant(s)</p>
              <div className="flex flex-wrap gap-2">
                {form.participants.map((id) => {
                  const u = resources.users.find((u) => u.id === id);
                  return <span key={id} className="px-2 py-1 bg-white rounded-lg text-xs font-medium">{u?.name || id}</span>;
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => step > 0 ? setStep(step - 1) : navigate('/admin/campaigns')}
          className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
        >
          <ChevronLeft size={16} />
          {step === 0 ? 'Annuler' : 'Précédent'}
        </button>

        {step < 5 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            Suivant <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Rocket size={16} />}
            Créer la campagne
          </button>
        )}
      </div>
    </div>
  );
}
