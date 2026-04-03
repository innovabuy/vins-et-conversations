import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { campaignsAPI, clientTypesAPI } from '../../services/api';
import { ChevronLeft, ChevronRight, Check, Building2, Users, Wine, Settings, FileText, Rocket, Image, PiggyBank, Upload, Plus, X, AlertTriangle } from 'lucide-react';
import { organizationsAPI } from '../../services/api';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { formatEur } from '../../utils/chartTheme';

const STEPS = [
  { key: 'type', label: 'Type', icon: Settings, desc: 'Type de client' },
  { key: 'org', label: 'Organisation', icon: Building2, desc: 'École ou entreprise' },
  { key: 'branding', label: 'Identité', icon: Image, desc: 'Logo partenaire' },
  { key: 'details', label: 'Détails', icon: FileText, desc: 'Nom, dates, objectif' },
  { key: 'products', label: 'Produits', icon: Wine, desc: 'Sélection des vins' },
  { key: 'participants', label: 'Participants', icon: Users, desc: 'Élèves ou contacts' },
  { key: 'summary', label: 'Récapitulatif', icon: Rocket, desc: 'Vérification finale' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'En pause' },
  { value: 'completed', label: 'Terminée' },
];

function NewClientTypeModal({ existingTypes, onCreated, onClose }) {
  const [sourceId, setSourceId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ctForm, setCtForm] = useState({
    name: '',
    label: '',
    pricing_rules: { type: 'none', value: 0, applies_to: 'all', min_order: 0 },
    commission_rules: {},
    free_bottle_rules: { enabled: false, every_n_sold: 12, choice: 'catalog' },
    tier_rules: { enabled: false, tiers: [] },
    ui_config: { color: '#722F37', icon: 'wine', dashboard_type: 'student' },
  });

  const handleCopyFrom = async (id) => {
    if (!id) {
      setSourceId('');
      return;
    }
    setSourceId(id);
    try {
      const { data } = await clientTypesAPI.get(id);
      setCtForm((f) => ({
        ...f,
        pricing_rules: typeof data.pricing_rules === 'string' ? JSON.parse(data.pricing_rules) : (data.pricing_rules || {}),
        commission_rules: typeof data.commission_rules === 'string' ? JSON.parse(data.commission_rules) : (data.commission_rules || {}),
        free_bottle_rules: typeof data.free_bottle_rules === 'string' ? JSON.parse(data.free_bottle_rules) : (data.free_bottle_rules || {}),
        tier_rules: typeof data.tier_rules === 'string' ? JSON.parse(data.tier_rules) : (data.tier_rules || {}),
        ui_config: typeof data.ui_config === 'string' ? JSON.parse(data.ui_config) : (data.ui_config || {}),
      }));
    } catch { /* ignore */ }
  };

  const updatePricing = (key, val) => setCtForm((f) => ({ ...f, pricing_rules: { ...f.pricing_rules, [key]: val } }));
  const updateFreeBottle = (key, val) => setCtForm((f) => ({ ...f, free_bottle_rules: { ...f.free_bottle_rules, [key]: val } }));
  const updateUi = (key, val) => setCtForm((f) => ({ ...f, ui_config: { ...f.ui_config, [key]: val } }));

  const handleSubmit = async () => {
    setError('');
    if (ctForm.name.length < 2) { setError('Nom trop court (min 2 caractères)'); return; }
    if (ctForm.label.length < 2) { setError('Libellé trop court (min 2 caractères)'); return; }
    setSaving(true);
    try {
      const { data } = await clientTypesAPI.create(ctForm);
      onCreated(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 my-8">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Nouveau type de client</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Nom (code interne) *</label>
            <input type="text" value={ctForm.name} onChange={(e) => setCtForm((f) => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ex: association_sportive" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Libellé (affiché) *</label>
            <input type="text" value={ctForm.label} onChange={(e) => setCtForm((f) => ({ ...f, label: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ex: Association Sportive" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Copier depuis un type existant</label>
            <select value={sourceId} onChange={(e) => handleCopyFrom(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Partir de zéro</option>
              {existingTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div className="border-t pt-3 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Tarification</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Type de remise</label>
              <select value={ctForm.pricing_rules.type || 'none'} onChange={(e) => updatePricing('type', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="none">Aucune</option>
                <option value="percentage_discount">% de remise</option>
                <option value="fixed_discount">Remise fixe</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Valeur remise</label>
              <input type="number" min="0" step="0.5" value={ctForm.pricing_rules.value || 0} onChange={(e) => updatePricing('value', parseFloat(e.target.value) || 0)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Commande minimum (EUR)</label>
            <input type="number" min="0" step="10" value={ctForm.pricing_rules.min_order || 0} onChange={(e) => updatePricing('min_order', parseFloat(e.target.value) || 0)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="border-t pt-3 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Bouteilles gratuites</h4>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ctForm.free_bottle_rules.enabled} onChange={(e) => updateFreeBottle('enabled', e.target.checked)} className="rounded" />
            Activer les bouteilles gratuites
          </label>
          {ctForm.free_bottle_rules.enabled && (
            <div>
              <label className="block text-xs font-medium mb-1">1 gratuite pour X vendues</label>
              <input type="number" min="1" value={ctForm.free_bottle_rules.every_n_sold || 12} onChange={(e) => updateFreeBottle('every_n_sold', parseInt(e.target.value) || 12)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
        </div>

        <div className="border-t pt-3 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Apparence</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Couleur</label>
              <input type="color" value={ctForm.ui_config.color || '#722F37'} onChange={(e) => updateUi('color', e.target.value)} className="w-full h-9 border rounded-lg cursor-pointer" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Type dashboard</label>
              <select value={ctForm.ui_config.dashboard_type || 'student'} onChange={(e) => updateUi('dashboard_type', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="student">Étudiant</option>
                <option value="cse">CSE</option>
                <option value="ambassador">Ambassadeur</option>
              </select>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Annuler</button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
            {saving ? 'Création...' : 'Créer le type'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CampaignWizard() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEdit = !!editId;
  const appSettings = useAppSettings();
  const [step, setStep] = useState(isEdit ? 3 : 0); // Edit mode starts at details
  const [resources, setResources] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPartnerLogo, setUploadingPartnerLogo] = useState(false);
  const [showNewClientType, setShowNewClientType] = useState(false);
  const [apiError, setApiError] = useState('');

  const [form, setForm] = useState({
    client_type_id: '',
    campaign_type_id: '',
    org_id: '',
    partner_logo_url: '',
    name: '',
    brand_name: '',
    status: 'draft',
    goal: 0,
    start_date: '',
    end_date: '',
    alcohol_free: false,
    config: {},
    fund_collective_pct: '',
    fund_individual_pct: '',
    products: [],
    participants: [],
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: res } = await campaignsAPI.resources();
        setResources(res);

        // In edit mode, load existing campaign data
        if (editId) {
          const { data: detail } = await campaignsAPI.get(editId);
          const c = detail.campaign;
          const campConfig = typeof c.config === 'string' ? JSON.parse(c.config) : (c.config || {});
          setForm({
            client_type_id: c.client_type_id || '',
            campaign_type_id: c.campaign_type_id || '',
            org_id: c.org_id || '',
            partner_logo_url: '',
            name: c.name || '',
            brand_name: c.brand_name || '',
            status: c.status || 'draft',
            goal: c.goal || 0,
            start_date: c.start_date ? c.start_date.split('T')[0] : '',
            end_date: c.end_date ? c.end_date.split('T')[0] : '',
            alcohol_free: c.alcohol_free || false,
            config: campConfig,
            fund_collective_pct: campConfig.fund_collective_pct ?? '',
            fund_individual_pct: campConfig.fund_individual_pct ?? '',
            products: (detail.products || []).map((p) => ({
              id: p.id,
              name: p.name,
              price_ttc: p.price_ttc,
              custom_price: p.custom_price,
            })),
            participants: (detail.participants || []).map((p) => p.id),
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [editId]);

  const updateForm = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const canNext = () => {
    if (step === 0) return !!form.campaign_type_id;
    if (step === 1) return !!form.org_id;
    if (step === 2) return true; // branding — optional
    if (step === 3) return form.name.length >= 3;
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    setApiError('');
    try {
      // Save partner logo to organization if provided
      if (form.partner_logo_url && form.org_id) {
        await organizationsAPI.update(form.org_id, { logo_url: form.partner_logo_url }).catch(() => {});
      }
      const { partner_logo_url, fund_collective_pct, fund_individual_pct, campaign_type_id, ...rest } = form;
      const configWithFunds = { ...rest.config };
      if (fund_collective_pct !== '' && fund_collective_pct != null) configWithFunds.fund_collective_pct = parseFloat(fund_collective_pct);
      if (fund_individual_pct !== '' && fund_individual_pct != null) configWithFunds.fund_individual_pct = parseFloat(fund_individual_pct);
      const payload = {
        ...rest,
        campaign_type_id: campaign_type_id || null,
        config: configWithFunds,
        goal: parseFloat(rest.goal) || 0,
        start_date: rest.start_date || null,
        end_date: rest.end_date || null,
        products: rest.products.map((p, i) => ({ product_id: p.id, custom_price: p.custom_price || null, sort_order: i })),
      };

      if (isEdit) {
        await campaignsAPI.update(editId, payload);
        navigate(`/admin/campaigns/${editId}`);
      } else {
        const { data } = await campaignsAPI.create(payload);
        navigate(`/admin/campaigns/${data.id}`);
      }
    } catch (err) {
      setApiError(err.response?.data?.message || `Erreur ${isEdit ? 'de modification' : 'de création'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleNewClientTypeCreated = (newType) => {
    // Add to resources and select it
    setResources((r) => ({ ...r, clientTypes: [...r.clientTypes, newType] }));
    updateForm('client_type_id', newType.id);
    setShowNewClientType(false);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  if (!resources) return <div className="text-center py-20 text-gray-400">Erreur de chargement</div>;

  const selectedType = resources.clientTypes.find((t) => t.id === form.client_type_id);
  const selectedCampaignType = (resources.campaignTypes || []).find((t) => t.id === form.campaign_type_id);
  const selectedOrg = resources.organizations.find((o) => o.id === form.org_id);

  // Filter organizations by selected campaign type compatibility
  const filteredOrgs = form.campaign_type_id && resources.orgTypeCampTypes
    ? resources.organizations.filter((o) => {
        if (!o.organization_type_id) return true; // orgs without type are always shown
        return resources.orgTypeCampTypes.some(
          (j) => j.organization_type_id === o.organization_type_id && j.campaign_type_id === form.campaign_type_id
        );
      })
    : resources.organizations;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/campaigns')} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Modifier la campagne' : 'Nouvelle campagne'}</h1>
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

      {apiError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{apiError}</span>
          <button onClick={() => setApiError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      {/* Step content */}
      <div className="card min-h-[300px]">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg">Type de campagne</h2>
            <p className="text-sm text-gray-500">Choisissez le type de campagne à créer.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(resources.campaignTypes || []).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    updateForm('campaign_type_id', t.id);
                    // Auto-set client_type_id from campaign type default
                    if (t.default_client_type_id) {
                      updateForm('client_type_id', t.default_client_type_id);
                    }
                    // Reset org if incompatible
                    if (form.org_id) {
                      const org = resources.organizations.find((o) => o.id === form.org_id);
                      if (org && org.organization_type_id) {
                        const compatible = (resources.orgTypeCampTypes || []).some(
                          (j) => j.organization_type_id === org.organization_type_id && j.campaign_type_id === t.id
                        );
                        if (!compatible) updateForm('org_id', '');
                      }
                    }
                  }}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${
                    form.campaign_type_id === t.id ? 'border-wine-600 bg-wine-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold">{t.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{t.code}</p>
                  {t.description && <p className="text-xs text-gray-400 mt-1">{t.description}</p>}
                </button>
              ))}
            </div>
            {/* Fallback: show client types if no campaign types available */}
            {(!resources.campaignTypes || resources.campaignTypes.length === 0) && (
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
            )}

            {/* Override client type + new type button */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Type de client (override)</label>
                  <select value={form.client_type_id} onChange={(e) => updateForm('client_type_id', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">— Auto (depuis type campagne) —</option>
                    {resources.clientTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => setShowNewClientType(true)}
                  className="flex items-center gap-1.5 px-3 py-2 mt-5 text-sm border-2 border-dashed border-wine-300 rounded-lg hover:bg-wine-50 text-wine-700 font-medium whitespace-nowrap"
                >
                  <Plus size={14} />
                  Nouveau type
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg">Organisation</h2>
            <p className="text-sm text-gray-500">Sélectionnez l'établissement ou l'entreprise{selectedCampaignType ? ` (compatible avec "${selectedCampaignType.label}")` : ''}.</p>
            {filteredOrgs.length === 0 && (
              <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">Aucune organisation compatible avec ce type de campagne.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredOrgs.map((o) => (
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
            <h2 className="font-bold text-lg">Identité visuelle</h2>
            <p className="text-sm text-gray-500">Ajoutez le logo du partenaire pour cette campagne.</p>
            <div>
              <label className="block text-sm font-medium mb-2">Logo partenaire</label>
              <div className="flex items-start gap-4">
                {form.partner_logo_url ? (
                  <img src={form.partner_logo_url} alt="Logo partenaire" className="h-16 w-auto object-contain border rounded-lg p-2" onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <div className="h-16 w-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                    <Image size={24} />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {form.org_id ? (
                    <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                      uploadingPartnerLogo ? 'bg-gray-100 text-gray-400' : 'bg-wine-50 text-wine-700 hover:bg-wine-100'
                    }`}>
                      <Upload size={16} />
                      {uploadingPartnerLogo ? 'Upload...' : form.partner_logo_url ? 'Changer le logo' : 'Uploader un logo'}
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="hidden" disabled={uploadingPartnerLogo} onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingPartnerLogo(true);
                        setApiError('');
                        try {
                          const { data } = await organizationsAPI.uploadLogo(form.org_id, file);
                          updateForm('partner_logo_url', data.logo_url);
                        } catch (err) {
                          setApiError(err.response?.data?.message || 'Erreur upload logo');
                        } finally { setUploadingPartnerLogo(false); }
                      }} />
                    </label>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Sélectionnez d'abord une organisation</p>
                  )}
                  <p className="text-xs text-gray-400">JPG, PNG, WebP ou SVG — max 2 Mo</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-xs text-gray-500 mb-3">Aperçu des logos</p>
              <div className="flex items-center justify-center gap-6">
                {appSettings.app_logo_url ? (
                  <img src={appSettings.app_logo_url} alt="Logo V&C" className="h-12 w-auto object-contain" />
                ) : (
                  <div className="flex items-center gap-2">
                    <Wine size={24} className="text-wine-700" />
                    <span className="font-bold text-sm">{appSettings.app_name}</span>
                  </div>
                )}
                {form.partner_logo_url ? (
                  <>
                    <span className="text-gray-300 text-lg">+</span>
                    <img
                      src={form.partner_logo_url}
                      alt="Logo partenaire"
                      className="h-12 w-auto object-contain"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </>
                ) : (
                  <span className="text-xs text-gray-400 italic">Aucun logo partenaire</span>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg">Détails campagne</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Nom *</label>
                <input type="text" value={form.name} onChange={(e) => updateForm('name', e.target.value)} className="w-full border rounded-lg px-3 py-2" placeholder="ex: Sacré-Coeur 2025-2026" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Nom de marque extranet</label>
                <input type="text" value={form.brand_name} onChange={(e) => updateForm('brand_name', e.target.value)} className="w-full border rounded-lg px-3 py-2" placeholder="Laisser vide pour afficher Vins & Conversations" />
                <p className="text-xs text-gray-400 mt-1">Affiché sur les extranets étudiants et BTS uniquement</p>
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

            {/* Alcohol-free toggle */}
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.alcohol_free}
                  onChange={(e) => updateForm('alcohol_free', e.target.checked)}
                  className="w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="font-medium text-sm text-amber-900">Campagne sans alcool (public mineur)</span>
                  <p className="text-xs text-amber-700 mt-0.5">Seuls les produits du terroir seront proposes (conformite loi Evin)</p>
                </div>
              </label>
            </div>

            {form.alcohol_free && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                <span>Les produits contenant de l'alcool seront automatiquement masques dans le catalogue et les dashboards de cette campagne.</span>
              </div>
            )}

            {/* Commission % inputs — visible for types with commission rules */}
            {(selectedCampaignType ? ['scolaire', 'bts_ndrc'].includes(selectedCampaignType.code) : selectedType && ['scolaire', 'bts_ndrc'].includes(selectedType.name)) && (
              <div className="mt-6 p-4 bg-wine-50 rounded-xl space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <PiggyBank size={18} className="text-wine-700" />
                  <h3 className="font-semibold text-sm text-wine-800">Cagnottes (commissions)</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">% Cagnotte collective</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0" max="100" step="0.5"
                        value={form.fund_collective_pct}
                        onChange={(e) => updateForm('fund_collective_pct', e.target.value)}
                        className="w-full border rounded-lg px-3 py-2"
                        placeholder="5"
                      />
                      <span className="text-sm text-gray-500 font-medium">%</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Sur le CA HT global de la campagne</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">% Cagnotte individuelle</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0" max="100" step="0.5"
                        value={form.fund_individual_pct}
                        onChange={(e) => updateForm('fund_individual_pct', e.target.value)}
                        className="w-full border rounded-lg px-3 py-2"
                        placeholder="2"
                      />
                      <span className="text-sm text-gray-500 font-medium">%</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Sur le CA HT personnel de l'eleve</p>
                  </div>
                </div>
                {(() => {
                  const total = (parseFloat(form.fund_collective_pct) || 0) + (parseFloat(form.fund_individual_pct) || 0);
                  return total > 100 ? (
                    <p className="text-xs text-red-600 font-medium">Total des commissions ({total}%) depasse 100%</p>
                  ) : total > 0 ? (
                    <p className="text-xs text-wine-600">Total commissions : {total}%</p>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-bold text-lg">Sélection des produits</h2>
            {form.alcohol_free && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                <span>Campagne sans alcool — seuls les produits du terroir sont affiches</span>
              </div>
            )}
            <p className="text-sm text-gray-500">{form.products.length} produit(s) sélectionné(s)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
              {resources.products.filter((p) => {
                if (!form.alcohol_free) return true;
                // Hide wine products when alcohol_free — use category field to detect
                const cat = (p.category || '').toLowerCase();
                return cat.includes('jus') || cat.includes('soft') || cat.includes('coffret') || cat.includes('terroir') || cat.includes('sans alcool');
              }).map((p) => {
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

        {step === 5 && (
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

        {step === 6 && (
          <div className="space-y-6">
            <h2 className="font-bold text-lg">Récapitulatif</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 font-medium">Type de campagne</p>
                <p className="font-semibold mt-1">{selectedCampaignType?.label || selectedType?.label || '—'}</p>
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

        {step < 6 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            Suivant <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Rocket size={16} />}
            {isEdit ? 'Enregistrer' : 'Créer la campagne'}
          </button>
        )}
      </div>

      {showNewClientType && (
        <NewClientTypeModal
          existingTypes={resources.clientTypes}
          onCreated={handleNewClientTypeCreated}
          onClose={() => setShowNewClientType(false)}
        />
      )}
    </div>
  );
}
