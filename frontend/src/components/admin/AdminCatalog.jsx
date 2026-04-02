import React, { useState, useEffect, useCallback, useRef } from 'react';
import { productsAPI, catalogPdfAPI, categoriesAPI } from '../../services/api';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer
} from 'recharts';
import { Wine, Plus, Pencil, Trash2, X, Save, ChevronLeft, Award, Thermometer, Grape, UtensilsCrossed, Download, Mail, FileText, Package, Eye, EyeOff, Star, Upload, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { WINE_TYPE_OPTIONS, TASTING_CRITERIA, resolveWineType, getCriteriaForProduct, buildRadarData } from '../../config/tastingCriteria';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

// ─── Toast system ────────────────────────────────────
const TOAST_ICONS = { success: CheckCircle, error: AlertCircle, info: Info };
const TOAST_STYLES = {
  success: 'bg-green-50 border-green-300 text-green-800',
  error: 'bg-red-50 border-red-300 text-red-800',
  info: 'bg-blue-50 border-blue-300 text-blue-800',
};

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((t) => {
        const Icon = TOAST_ICONS[t.type] || Info;
        return (
          <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm max-w-sm animate-slide-in ${TOAST_STYLES[t.type] || TOAST_STYLES.info}`}>
            <Icon size={16} className="shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => onDismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);
  const dismissToast = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);
  return { toasts, addToast, dismissToast };
}

const COLOR_OPTIONS = [
  { value: '', label: 'Toutes' },
  { value: 'rouge', label: 'Rouge' },
  { value: 'blanc', label: 'Blanc' },
  { value: 'rosé', label: 'Rosé' },
  { value: 'effervescent', label: 'Effervescent' },
  { value: 'sans_alcool', label: 'Sans alcool' },
];

const COLOR_BADGES = {
  rouge: 'bg-red-100 text-red-800',
  blanc: 'bg-yellow-100 text-yellow-800',
  rosé: 'bg-pink-100 text-pink-800',
  effervescent: 'bg-sky-100 text-sky-800',
  sans_alcool: 'bg-green-100 text-green-800',
  coffret: 'bg-amber-100 text-amber-800',
};

const EMPTY_PRODUCT = {
  name: '', price_ht: '', price_ttc: '', purchase_price: '',
  tva_rate: 20, category: '', label: '', image_url: '', description: '', active: true,
  region: '', appellation: '', color: '', vintage: '', grape_varieties: [],
  serving_temp: '', food_pairing: [], tasting_notes: null, winemaker_notes: '', awards: [],
  visible_boutique: false, allow_backorder: false, allows_deferred: false, caution_amount: 0, bundle_products: [],
  // Dynamic fields per category type
  weight: '', allergens: '', conservation: '', volume: '', bottle_count: null,
};

function parseJsonField(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// ─── Tasting Radar Chart (dynamic axes) ─────────────
function TastingRadar({ notes, color, category, size = 250 }) {
  const data = buildRadarData(notes, color, category);
  if (!data) return null;
  return (
    <div style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="75%">
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: '#6b7280' }} />
          <PolarRadiusAxis angle={90} domain={[0, 5]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke="#7a1c3b" fill="#7a1c3b" fillOpacity={0.25} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Tags Input ──────────────────────────────────────
function TagsInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState('');
  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      if (!value.includes(input.trim())) onChange([...value, input.trim()]);
      setInput('');
    }
  };
  const remove = (tag) => onChange(value.filter(t => t !== tag));
  return (
    <div className="border rounded-lg px-2 py-1.5 flex flex-wrap gap-1 items-center min-h-[38px]">
      {value.map(tag => (
        <span key={tag} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-wine-50 text-wine-700">
          {tag}
          <button type="button" onClick={() => remove(tag)} className="text-wine-400 hover:text-wine-700"><X size={12} /></button>
        </span>
      ))}
      <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={value.length === 0 ? placeholder : ''} className="flex-1 min-w-[100px] text-sm outline-none py-0.5" />
    </div>
  );
}

// ─── Product Detail (fiche produit) ──────────────────
function ProductDetail({ product, onClose, onEdit }) {
  const grapes = parseJsonField(product.grape_varieties);
  const pairing = parseJsonField(product.food_pairing);
  const awards = parseJsonField(product.awards);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"><ChevronLeft size={16} /> Retour</button>
        <button onClick={() => onEdit(product)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-50"><Pencil size={14} /> Modifier</button>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left: info */}
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {product.color && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${COLOR_BADGES[product.color] || 'bg-gray-100 text-gray-700'}`}>{product.color}</span>}
              {product.label && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-wine-50 text-wine-700">{product.label}</span>}
              {product.vintage && <span className="text-sm text-gray-500">{product.vintage}</span>}
            </div>
          </div>

          {product.appellation && (
            <div className="text-sm"><span className="text-gray-500">Appellation :</span> {product.appellation} — {product.region}</div>
          )}

          {product.description && (
            <div className="text-sm text-gray-600 leading-relaxed">{product.description}</div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">Prix TTC</p><p className="text-lg font-bold text-wine-700">{formatEur(product.price_ttc)}</p></div>
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">Prix HT</p><p className="text-lg font-bold">{formatEur(product.price_ht)}</p></div>
            <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-500">Marge</p><p className="text-lg font-bold text-green-600">{formatEur(product.price_ht - product.purchase_price)}</p></div>
          </div>

          {grapes.length > 0 && (
            <div className="flex items-start gap-2">
              <Grape size={16} className="text-wine-600 mt-0.5 shrink-0" />
              <div><p className="text-xs text-gray-500 mb-1">Cépages</p><div className="flex flex-wrap gap-1">{grapes.map(g => <span key={g} className="px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700">{g}</span>)}</div></div>
            </div>
          )}

          {product.serving_temp && (
            <div className="flex items-center gap-2 text-sm"><Thermometer size={16} className="text-blue-500" /><span className="text-gray-500">Service :</span> {product.serving_temp}</div>
          )}

          {pairing.length > 0 && (
            <div className="flex items-start gap-2">
              <UtensilsCrossed size={16} className="text-orange-500 mt-0.5 shrink-0" />
              <div><p className="text-xs text-gray-500 mb-1">Accords mets</p><div className="flex flex-wrap gap-1">{pairing.map(f => <span key={f} className="px-2 py-0.5 rounded-full text-xs bg-orange-50 text-orange-700">{f}</span>)}</div></div>
            </div>
          )}

          {product.winemaker_notes && (
            <div className="bg-wine-50 rounded-lg p-4 text-sm text-wine-800 italic">"{product.winemaker_notes}"</div>
          )}

          {awards.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Award size={14} className="text-yellow-500" /> Distinctions</p>
              <div className="space-y-1">
                {awards.map((a, i) => <div key={i} className="flex items-center gap-2 text-sm"><span className="text-yellow-600 font-semibold">{a.year}</span><span>{a.name}</span></div>)}
              </div>
            </div>
          )}
        </div>

        {/* Right: radar */}
        {product.tasting_notes && (
          <div className="flex flex-col items-center">
            <h3 className="font-semibold text-sm mb-2">Profil de dégustation</h3>
            <TastingRadar notes={product.tasting_notes} color={product.color} category={product.category} size={280} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Components Section (coffret TVA ventilation) ────
const ComponentsSection = React.forwardRef(function ComponentsSection({ productId, priceTTC, onToast }, ref) {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newComp, setNewComp] = useState({ component_name: '', amount_ht: '', vat_rate: '20.00' });
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    productsAPI.components(productId).then((r) => setComponents(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, [productId]);

  const handleAdd = async () => {
    if (!newComp.component_name || !newComp.amount_ht) return;
    setValidationError('');
    try {
      const res = await productsAPI.addComponent(productId, {
        component_name: newComp.component_name,
        amount_ht: parseFloat(newComp.amount_ht),
        vat_rate: parseFloat(newComp.vat_rate),
        sort_order: components.length,
      });
      setComponents([...components, res.data.data]);
      setNewComp({ component_name: '', amount_ht: '', vat_rate: '20.00' });
      setAdding(false);
    } catch (e) { onToast?.(e.response?.data?.message || 'Erreur ajout composant', 'error'); }
  };

  // Expose validateAndSave to parent form via ref
  React.useImperativeHandle(ref, () => ({
    async validateAndSave() {
      setValidationError('');
      if (!adding) return true; // nothing pending
      const hasName = !!newComp.component_name.trim();
      const hasAmount = !!newComp.amount_ht;
      if (hasName && hasAmount) {
        // Auto-save the pending component
        await handleAdd();
        return true;
      }
      if (hasName || hasAmount) {
        // Partially filled — block submission
        setValidationError('Un composant est en cours de saisie — complétez-le ou annulez avant d\'enregistrer.');
        return false;
      }
      return true; // form open but empty — allow
    }
  }));

  const handleDelete = async (cid) => {
    try {
      await productsAPI.removeComponent(productId, cid);
      setComponents(components.filter((c) => c.id !== cid));
    } catch (e) { onToast?.('Erreur suppression composant', 'error'); }
  };

  if (loading) return null;

  const sumTTC = components.reduce((s, c) => s + parseFloat(c.amount_ht) * (1 + parseFloat(c.vat_rate) / 100), 0);
  const coherent = components.length === 0 || Math.abs(sumTTC - priceTTC) < 0.02;
  const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

  return (
    <fieldset className="border rounded-lg p-4 space-y-3">
      <legend className="text-sm font-semibold text-gray-700 px-2">Composition (ventilation TVA coffret)</legend>
      {validationError && (
        <div className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded">{validationError}</div>
      )}
      {components.length > 0 && (
        <div className="space-y-2">
          {components.map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2 text-sm">
              <div>
                <span className="font-medium">{c.component_name}</span>
                <span className="text-gray-500 ml-2">{formatEur(c.amount_ht)} HT — TVA {c.vat_rate}%</span>
              </div>
              <button type="button" onClick={() => handleDelete(c.id)} className="text-red-500 hover:text-red-700 text-xs">Supprimer</button>
            </div>
          ))}
          <div className={`text-xs font-medium px-2 py-1 rounded ${coherent ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
            Total composants TTC : {formatEur(sumTTC)} — Prix produit TTC : {formatEur(priceTTC)}
            {coherent ? ' — Coherent' : ' — Ecart detecte'}
          </div>
        </div>
      )}
      {adding ? (
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="text-xs text-gray-500">Nom</label>
            <input value={newComp.component_name} onChange={(e) => { setNewComp({ ...newComp, component_name: e.target.value }); setValidationError(''); }} className="block border rounded px-2 py-1 text-sm w-40" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Montant HT</label>
            <input type="number" step="0.01" value={newComp.amount_ht} onChange={(e) => { setNewComp({ ...newComp, amount_ht: e.target.value }); setValidationError(''); }} className="block border rounded px-2 py-1 text-sm w-24" />
          </div>
          <div>
            <label className="text-xs text-gray-500">TVA %</label>
            <select value={newComp.vat_rate} onChange={(e) => setNewComp({ ...newComp, vat_rate: e.target.value })} className="block border rounded px-2 py-1 text-sm">
              <option value="20.00">20%</option>
              <option value="5.50">5,5%</option>
            </select>
          </div>
          <button type="button" onClick={handleAdd} className="px-3 py-1.5 bg-wine-700 text-white text-sm rounded-lg">Ajouter</button>
          <button type="button" onClick={() => { setAdding(false); setValidationError(''); setNewComp({ component_name: '', amount_ht: '', vat_rate: '20.00' }); }} className="px-3 py-1.5 text-sm text-gray-600">Annuler</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="text-xs text-wine-700 hover:text-wine-800 font-medium">+ Ajouter un composant</button>
      )}
    </fieldset>
  );
});

// ─── Product Form (enriched) ─────────────────────────
function ProductForm({ product, onSave, onCancel, allProducts = [], categoriesList = [], onToast }) {
  const componentsRef = useRef(null);
  const [coffretMessage, setCoffretMessage] = useState(null);
  const initial = product ? {
    ...product,
    grape_varieties: parseJsonField(product.grape_varieties),
    food_pairing: parseJsonField(product.food_pairing),
    awards: parseJsonField(product.awards),
    tasting_notes: product.tasting_notes ? (typeof product.tasting_notes === 'string' ? JSON.parse(product.tasting_notes) : product.tasting_notes) : null,
    bundle_products: parseJsonField(product.bundle_products),
  } : EMPTY_PRODUCT;
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Resolve wine type from color + category
  const wineType = resolveWineType(form.color, form.category);
  const criteria = TASTING_CRITERIA[wineType] || null;
  const isCoffret = wineType === 'coffret';
  const selectedCategory = categoriesList.find(c => c.id === form.category_id);
  const isWineProduct = !selectedCategory || ['wine', 'sparkling'].includes(selectedCategory.product_type);
  const isFoodProduct = selectedCategory?.product_type === 'food';
  const isBeverageProduct = selectedCategory?.product_type === 'beverage';
  const isGiftSet = selectedCategory?.product_type === 'gift_set';

  // Auto-enable tasting for new products when criteria exist
  useEffect(() => {
    if (criteria && !form.tasting_notes && !product?.id) {
      const notes = {};
      criteria.forEach(c => { notes[c.key] = 0; });
      setForm(f => ({ ...f, tasting_notes: notes }));
    }
  }, [wineType]);

  const showTasting = !!criteria && !!form.tasting_notes;

  const handleChange = (field, value) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'price_ht' || field === 'tva_rate') {
        const ht = field === 'price_ht' ? parseFloat(value) : parseFloat(next.price_ht);
        const tva = field === 'tva_rate' ? parseFloat(value) : parseFloat(next.tva_rate);
        if (!isNaN(ht) && !isNaN(tva)) next.price_ttc = (ht * (1 + tva / 100)).toFixed(2);
      }
      return next;
    });
  };

  // When wine type changes, adapt tasting_notes to keep common keys
  const handleWineTypeChange = (newColor, newCategory) => {
    setForm(f => {
      const next = { ...f, color: newColor, category: newCategory };
      const newType = resolveWineType(newColor, newCategory);
      const newCriteria = TASTING_CRITERIA[newType];
      if (!newCriteria) {
        next.tasting_notes = null;
      } else if (f.tasting_notes) {
        const adapted = {};
        newCriteria.forEach(c => { adapted[c.key] = f.tasting_notes[c.key] || 0; });
        next.tasting_notes = adapted;
      }
      return next;
    });
  };

  const handleTastingChange = (key, value) => {
    setForm(f => {
      const base = f.tasting_notes || {};
      return { ...f, tasting_notes: { ...base, [key]: parseInt(value) } };
    });
  };

  const enableTasting = () => {
    if (!criteria) return;
    const notes = {};
    criteria.forEach(c => { notes[c.key] = form.tasting_notes?.[c.key] || 0; });
    setForm(f => ({ ...f, tasting_notes: notes }));
  };

  const toggleBundleProduct = (productId) => {
    setForm(f => {
      const current = f.bundle_products || [];
      const next = current.includes(productId) ? current.filter(id => id !== productId) : [...current, productId];
      return { ...f, bundle_products: next };
    });
  };

  const addAward = () => setForm(f => ({ ...f, awards: [...f.awards, { year: new Date().getFullYear(), name: '' }] }));
  const updateAward = (i, field, val) => setForm(f => ({ ...f, awards: f.awards.map((a, j) => j === i ? { ...a, [field]: field === 'year' ? parseInt(val) || '' : val } : a) }));
  const removeAward = (i) => setForm(f => ({ ...f, awards: f.awards.filter((_, j) => j !== i) }));

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !product?.id) return;
    setUploading(true);
    try {
      const { data } = await productsAPI.uploadImage(product.id, file);
      setForm(f => ({ ...f, image_url: data.image_url }));
    } catch (err) {
      onToast?.(err.response?.data?.message || 'Erreur upload image', 'error');
    } finally { setUploading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Auto-save or block pending component before product save
    if (componentsRef.current) {
      const ok = await componentsRef.current.validateAndSave();
      if (!ok) return;
    }
    // Validation champs obligatoires
    const missing = [];
    if (!form.name?.trim()) missing.push('Nom');
    if (!form.category_id) missing.push('Catégorie');
    if (!form.price_ht && form.price_ht !== 0) missing.push('Prix HT');
    if (!form.price_ttc && form.price_ttc !== 0) missing.push('Prix TTC');
    if (!form.purchase_price && form.purchase_price !== 0) missing.push('Prix achat');
    if (missing.length) {
      onToast?.(`Champs obligatoires manquants : ${missing.join(', ')}`, 'error');
      return;
    }
    // Validation cohérence des prix
    const ht = parseFloat(form.price_ht);
    const ttc = parseFloat(form.price_ttc);
    const achat = parseFloat(form.purchase_price);
    const errors = [];
    if (ht <= 0 || ttc <= 0 || achat <= 0) errors.push('Tous les prix doivent être supérieurs à 0');
    if (achat >= ht) errors.push(`Prix achat (${achat.toFixed(2)}€) doit être inférieur au prix HT (${ht.toFixed(2)}€)`);
    if (ttc <= ht) errors.push(`Prix TTC (${ttc.toFixed(2)}€) doit être supérieur au prix HT (${ht.toFixed(2)}€)`);
    if (errors.length) {
      onToast?.(errors.join(' / '), 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        price_ht: parseFloat(form.price_ht),
        price_ttc: parseFloat(form.price_ttc),
        purchase_price: parseFloat(form.purchase_price),
        tva_rate: parseFloat(form.tva_rate),
        vintage: form.vintage ? parseInt(form.vintage) : null,
        tasting_notes: form.tasting_notes || null,
        bundle_products: isCoffret ? (form.bundle_products || []) : [],
      };
      const result = await onSave(payload);
      // Auto-reopen for new coffret so user can add components immediately
      if (!product?.id && (isGiftSet || isCoffret) && result?.id) {
        setCoffretMessage('Coffret créé — ajoutez maintenant les composants ci-dessous');
      }
    } catch (err) {
      onToast?.(err.response?.data?.message || err.message || 'Erreur inconnue', 'error');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold">{product?.id ? 'Modifier le produit' : 'Nouveau produit'}</h2>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
      </div>

      {/* Section Identité */}
      <fieldset className="border rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold text-gray-700 px-2">Identité</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Nom *</label>
            <input value={form.name} onChange={e => handleChange('name', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>
          {isWineProduct && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Couleur / Type</label>
            <select value={wineType} onChange={e => {
              const t = e.target.value;
              if (t === 'coffret') handleWineTypeChange(null, 'Coffrets');
              else if (t === 'blanc_sec') handleWineTypeChange('blanc', 'Blancs Secs');
              else if (t === 'blanc_moelleux') handleWineTypeChange('blanc', 'Blancs Moelleux');
              else if (t === 'rose') handleWineTypeChange('rosé', form.category);
              else handleWineTypeChange(t, form.category);
            }} className="w-full border rounded-lg px-3 py-2 text-sm">
              {WINE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Catégorie *</label>
            <select value={form.category_id || ''} onChange={e => { handleChange('category_id', e.target.value || null); const cat = categoriesList.find(c => c.id === e.target.value); if (cat) handleChange('category', cat.name); }} className="w-full border rounded-lg px-3 py-2 text-sm" required>
              <option value="">— Sélectionner —</option>
              {categoriesList.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.icon_emoji || c.icon} {c.name}{c.is_alcohol === false ? ' (sans alcool)' : ''}</option>)}
            </select>
          </div>
          {isWineProduct && (<>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Région</label>
            <input value={form.region || ''} onChange={e => handleChange('region', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: Loire, Bordeaux" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Appellation</label>
            <input value={form.appellation || ''} onChange={e => handleChange('appellation', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: Anjou, Vouvray" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Millésime</label>
            <input type="number" value={form.vintage || ''} onChange={e => handleChange('vintage', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="2023" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Cépages</label>
            <TagsInput value={form.grape_varieties} onChange={v => handleChange('grape_varieties', v)} placeholder="Ajouter un cépage..." />
          </div>
          </>)}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
            <input value={form.label || ''} onChange={e => handleChange('label', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Bio, HVE, AOP..." />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea value={form.description || ''} onChange={e => handleChange('description', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <button type="button" onClick={() => handleChange('visible_boutique', !form.visible_boutique)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.visible_boutique ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.visible_boutique ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <div>
              <span className="text-sm font-medium text-gray-700">Visible en boutique</span>
              <p className="text-xs text-gray-400">Ce produit sera affiché sur la vitrine publique</p>
            </div>
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <button type="button" onClick={() => handleChange('allow_backorder', !form.allow_backorder)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.allow_backorder ? 'bg-amber-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.allow_backorder ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <div>
              <span className="text-sm font-medium text-gray-700">Autoriser la pré-commande</span>
              <p className="text-xs text-gray-400">Ce produit peut être commandé même si le stock est à 0</p>
            </div>
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <button type="button" onClick={() => handleChange('allows_deferred', !form.allows_deferred)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.allows_deferred ? 'bg-blue-500' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.allows_deferred ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <div>
              <span className="text-sm font-medium text-gray-700">Éligible paiement différé (caution)</span>
              <p className="text-xs text-gray-400">Ce produit peut être payé par caution avec chèque de garantie</p>
            </div>
          </div>
          {form.allows_deferred && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Montant de la caution (€)</label>
              <input type="number" step="0.01" min="0" value={form.caution_amount || ''} onChange={(e) => handleChange('caution_amount', e.target.value)}
                className="w-full border rounded-xl px-4 py-2.5 text-sm" placeholder="0.00" />
            </div>
          )}
          {/* Image produit */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-2">Photo du produit</label>
            <div className="flex items-start gap-4">
              {form.image_url ? (
                <img src={form.image_url} alt={form.name} className="w-24 h-24 object-contain rounded-lg border" />
              ) : (
                <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                  <Wine size={32} />
                </div>
              )}
              <div className="flex flex-col gap-2">
                {product?.id ? (
                  <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? 'bg-gray-100 text-gray-400' : 'bg-wine-50 text-wine-700 hover:bg-wine-100'}`}>
                    <Upload size={16} />
                    {uploading ? 'Upload...' : 'Changer la photo'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                  </label>
                ) : (
                  <p className="text-xs text-gray-400 italic">Enregistrez le produit d'abord pour ajouter une photo</p>
                )}
                <p className="text-xs text-gray-400">JPG, PNG ou WebP — max 5 Mo</p>
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      {/* Section Prix */}
      <fieldset className="border rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold text-gray-700 px-2">Prix</legend>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">TVA *</label>
            <select value={form.tva_rate} onChange={e => handleChange('tva_rate', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value={20}>20%</option>
              <option value={5.5}>5.5%</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Prix HT *</label>
            <input type="number" step="0.01" value={form.price_ht} onChange={e => handleChange('price_ht', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Prix TTC *</label>
            <input type="number" step="0.01" value={form.price_ttc} onChange={e => handleChange('price_ttc', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Prix achat *</label>
            <input type="number" step="0.01" value={form.purchase_price} onChange={e => handleChange('purchase_price', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          </div>
        </div>
      </fieldset>

      {/* Section type-specific: Coffret / Alimentaire / Boisson / Dégustation */}
      {isCoffret || isGiftSet ? (
        <fieldset className="border rounded-lg p-4 space-y-4">
          <legend className="text-sm font-semibold text-gray-700 px-2">Contenu du coffret</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre de bouteilles</label>
              <input type="number" min="1" value={form.bottle_count || ''} onChange={e => handleChange('bottle_count', e.target.value ? parseInt(e.target.value) : null)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: 3, 6" />
            </div>
          </div>
          <p className="text-xs text-gray-500">Sélectionnez les produits inclus dans ce coffret :</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {allProducts.filter(p => p.id !== product?.id && p.color !== null).map(p => (
              <label key={p.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${(form.bundle_products || []).includes(p.id) ? 'border-wine-500 bg-wine-50' : 'hover:bg-gray-50'}`}>
                <input type="checkbox" checked={(form.bundle_products || []).includes(p.id)} onChange={() => toggleBundleProduct(p.id)} className="rounded text-wine-700" />
                <Package size={14} className="text-wine-500 shrink-0" />
                <span>{p.name}</span>
                {p.color && <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] ${COLOR_BADGES[p.color] || 'bg-gray-100'}`}>{p.color}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      ) : isFoodProduct ? (
        <fieldset className="border rounded-lg p-4 space-y-4">
          <legend className="text-sm font-semibold text-gray-700 px-2">Caractéristiques alimentaires</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Poids</label>
              <input value={form.weight || ''} onChange={e => handleChange('weight', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: 180g, 250g" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Conservation</label>
              <input value={form.conservation || ''} onChange={e => handleChange('conservation', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: À conserver au frais, DLC 6 mois" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Allergènes</label>
              <textarea value={form.allergens || ''} onChange={e => handleChange('allergens', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Ex: Contient du lait, gluten. Peut contenir des traces de fruits à coque." />
            </div>
          </div>
        </fieldset>
      ) : isBeverageProduct ? (
        <fieldset className="border rounded-lg p-4 space-y-4">
          <legend className="text-sm font-semibold text-gray-700 px-2">Caractéristiques boisson</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Volume</label>
              <input value={form.volume || ''} onChange={e => handleChange('volume', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: 75cl, 1L, 33cl" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Variété</label>
              <input value={form.grape_varieties?.join?.(', ') || (Array.isArray(form.grape_varieties) ? '' : form.grape_varieties || '')} onChange={e => handleChange('grape_varieties', e.target.value ? e.target.value.split(',').map(s => s.trim()) : [])} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: Pomme Gala, Raisin Muscat" />
            </div>
          </div>
        </fieldset>
      ) : (
        <fieldset className="border rounded-lg p-4 space-y-4">
          <legend className="text-sm font-semibold text-gray-700 px-2">Dégustation</legend>
          {criteria ? (
            <>
              {!form.tasting_notes ? (
                <button type="button" onClick={enableTasting} className="text-sm text-wine-700 hover:text-wine-800 font-medium">+ Activer les critères de dégustation</button>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{criteria.length} critères pour {WINE_TYPE_OPTIONS.find(o => o.value === wineType)?.label || wineType}</span>
                    <button type="button" onClick={() => handleChange('tasting_notes', null)} className="text-xs text-red-400 hover:text-red-600">Désactiver</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {criteria.map(c => (
                      <div key={c.key} title={c.description}>
                        <label className="block text-xs text-gray-500 mb-1">{c.label} <span className="font-semibold">{form.tasting_notes?.[c.key] ?? 0}</span>/5</label>
                        <input type="range" min="0" max="5" step="1" value={form.tasting_notes?.[c.key] ?? 0} onChange={e => handleTastingChange(c.key, e.target.value)} className="w-full accent-wine-700" />
                        <p className="text-[10px] text-gray-400 mt-0.5">{c.description}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center">
                    <TastingRadar notes={form.tasting_notes} color={form.color} category={form.category} size={200} />
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400">Sélectionnez un type de vin pour activer les critères de dégustation.</p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes du vigneron</label>
            <textarea value={form.winemaker_notes || ''} onChange={e => handleChange('winemaker_notes', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Description personnelle du vigneron..." />
          </div>
        </fieldset>
      )}

      {/* Section Accords & Service — wine/sparkling only */}
      {isWineProduct && (
      <fieldset className="border rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold text-gray-700 px-2">Accords & Service</legend>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Accords mets</label>
          <TagsInput value={form.food_pairing} onChange={v => handleChange('food_pairing', v)} placeholder="Ajouter un accord..." />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Température de service</label>
          <input value={form.serving_temp || ''} onChange={e => handleChange('serving_temp', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: 8-10°C" />
        </div>
      </fieldset>
      )}

      {/* Section Distinctions — wine/sparkling only */}
      {isWineProduct && (
      <fieldset className="border rounded-lg p-4 space-y-4">
        <legend className="text-sm font-semibold text-gray-700 px-2">Distinctions</legend>
        {form.awards.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="number" value={a.year} onChange={e => updateAward(i, 'year', e.target.value)} className="w-20 border rounded-lg px-2 py-1.5 text-sm" placeholder="Année" />
            <input value={a.name} onChange={e => updateAward(i, 'name', e.target.value)} className="flex-1 border rounded-lg px-2 py-1.5 text-sm" placeholder="Nom de la récompense" />
            <button type="button" onClick={() => removeAward(i)} className="p-1 text-red-400 hover:text-red-600"><X size={16} /></button>
          </div>
        ))}
        <button type="button" onClick={addAward} className="text-xs text-wine-700 hover:text-wine-800 font-medium">+ Ajouter une distinction</button>
      </fieldset>
      )}

      {/* Section Composition (coffrets uniquement) */}
      {product?.id && (isGiftSet || isCoffret) ? (
        <>
          {coffretMessage && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-300 text-green-800 px-4 py-3 rounded-lg text-sm">
              <CheckCircle size={16} />
              {coffretMessage}
            </div>
          )}
          <ComponentsSection ref={componentsRef} productId={product.id} priceTTC={parseFloat(form.price_ttc || 0)} onToast={onToast} />
        </>
      ) : !product?.id && (isGiftSet || isCoffret) ? (
        <fieldset className="border rounded-lg p-4">
          <legend className="text-sm font-semibold text-gray-700 px-2">Composition (ventilation TVA coffret)</legend>
          <p className="text-sm text-gray-500 italic">Enregistrez d'abord le produit pour pouvoir ajouter des composants.</p>
        </fieldset>
      ) : null}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Annuler</button>
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={16} />{saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

// ─── Main Component ──────────────────────────────────
export default function AdminCatalog() {
  const { toasts, addToast, dismissToast } = useToasts();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [filters, setFilters] = useState({ color: '', region: '', category: '', boutiqueOnly: false });
  const [emailModal, setEmailModal] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: '', subject: 'Catalogue Vins & Conversations', message: '' });
  const [sending, setSending] = useState(false);
  const [pdfModal, setPdfModal] = useState(false);
  const [pdfSegment, setPdfSegment] = useState('public');
  const [categoriesList, setCategoriesList] = useState([]);

  useEffect(() => {
    categoriesAPI.list().then(r => setCategoriesList(r.data.data || [])).catch(() => {});
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.color) params.color = filters.color;
      if (filters.region) params.region = filters.region;
      if (filters.category) params.category = filters.category;
      const { data } = await productsAPI.list(params);
      setProducts(data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const handleSave = async (payload) => {
    if (editing?.id) {
      await productsAPI.update(editing.id, payload);
      addToast('Produit mis à jour', 'success');
      setEditing(null);
    } else {
      const { data } = await productsAPI.create(payload);
      const newProduct = data.data || data;
      const cat = categoriesList.find(c => c.id === payload.category_id);
      const isCoffretProduct = cat?.product_type === 'gift_set' || payload.category === 'Coffrets';
      if (isCoffretProduct && newProduct?.id) {
        // Auto-reopen in edit mode so user can add components
        addToast('Coffret créé — ajoutez les composants', 'success');
        setEditing({ ...payload, ...newProduct });
      } else {
        addToast('Produit créé', 'success');
        setEditing(null);
      }
    }
    fetchProducts();
    return editing?.id ? { id: editing.id } : undefined;
  };


  const handleDelete = async (id, name) => {
    if (!confirm(`Désactiver le produit "${name}" ?`)) return;
    try { await productsAPI.remove(id); fetchProducts(); addToast('Produit désactivé', 'success'); } catch (err) { addToast(err.response?.data?.message || err.message || 'Erreur', 'error'); }
  };

  const toggleBoutique = async (id, current) => {
    try {
      await productsAPI.update(id, { visible_boutique: !current });
      setProducts(prev => prev.map(p => p.id === id ? { ...p, visible_boutique: !current } : p));
    } catch (err) { addToast(err.response?.data?.message || err.message || 'Erreur', 'error'); }
  };

  const toggleFeatured = async (id, current, categoryId) => {
    try {
      const newVal = !current;
      await productsAPI.update(id, { is_featured: newVal });
      // When enabling, un-feature other products in same category (server-side enforced, update locally)
      setProducts(prev => prev.map(p => {
        if (p.id === id) return { ...p, is_featured: newVal };
        if (newVal && categoryId && p.category_id === categoryId) return { ...p, is_featured: false };
        return p;
      }));
    } catch (err) { addToast(err.response?.data?.message || err.message || 'Erreur', 'error'); }
  };

  const handleDownloadPdf = (segment = 'public') => {
    const token = localStorage.getItem('accessToken');
    const params = {};
    if (filters.color) params.color = filters.color;
    if (segment !== 'public') params.segment = segment;
    const url = catalogPdfAPI.pdfUrl(params);
    const a = document.createElement('a');
    a.href = url + (url.includes('?') ? '&' : '?') + `token=${token}`;
    a.target = '_blank';
    a.click();
  };

  const handleSendEmail = async () => {
    setSending(true);
    try {
      await catalogPdfAPI.sendEmail({ ...emailForm, segment: pdfSegment });
      addToast('Catalogue envoyé', 'success');
      setEmailModal(false);
      setEmailForm({ email: '', subject: 'Catalogue Vins & Conversations', message: '' });
    } catch (err) {
      addToast(err.response?.data?.message || 'Erreur d\'envoi', 'error');
    } finally {
      setSending(false);
    }
  };

  // Product detail view
  if (viewing) {
    return (
      <div className="card">
        <ProductDetail product={viewing} onClose={() => setViewing(null)} onEdit={(p) => { setViewing(null); setEditing(p); }} />
      </div>
    );
  }

  // Product form
  if (editing) {
    return (
      <div className="card">
        <ProductForm product={editing === 'new' ? null : editing} onSave={handleSave} onCancel={() => setEditing(null)} allProducts={products} categoriesList={categoriesList} onToast={addToast} />
      </div>
    );
  }

  // Unique regions for filter
  const regions = [...new Set(products.map(p => p.region).filter(Boolean))];
  const displayProducts = filters.boutiqueOnly ? products.filter(p => p.visible_boutique) : products;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Catalogue</h1>
        <div className="flex gap-2">
          <button onClick={() => setPdfModal(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"><FileText size={14} /> Catalogue PDF</button>
          <button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nouveau produit</button>
        </div>
      </div>

      {/* PDF Catalog Modal */}
      {pdfModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Catalogue PDF</h3>
              <button onClick={() => { setPdfModal(false); setEmailModal(false); }} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Segment client</label>
              <select value={pdfSegment} onChange={e => setPdfSegment(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="public">Grand Public</option>
                <option value="scolaire">Scolaire</option>
                <option value="cse">CSE (prix remisés)</option>
                <option value="ambassadeur_bronze">Ambassadeur Bronze</option>
                <option value="ambassadeur_argent">Ambassadeur Argent</option>
                <option value="ambassadeur_or">Ambassadeur Or</option>
                <option value="bts_ndrc">BTS NDRC</option>
              </select>
            </div>

            <p className="text-xs text-gray-500">
              Le catalogue PDF premium sera généré avec les prix et conditions du segment sélectionné.
            </p>

            <div className="flex gap-2">
              <button onClick={() => { handleDownloadPdf(pdfSegment); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 font-medium">
                <Download size={14} /> Télécharger
              </button>
              <button onClick={() => setEmailModal(true)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 font-medium">
                <Mail size={14} /> Envoyer par email
              </button>
            </div>

            {emailModal && (
              <div className="border-t pt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Email destinataire *</label>
                  <input type="email" value={emailForm.email} onChange={e => setEmailForm(f => ({ ...f, email: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="client@example.fr" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Objet</label>
                  <input type="text" value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Message (optionnel)</label>
                  <textarea value={emailForm.message} onChange={e => setEmailForm(f => ({ ...f, message: e.target.value }))} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Veuillez trouver ci-joint notre catalogue..." />
                </div>
                <button onClick={handleSendEmail} disabled={!emailForm.email || sending} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                  {sending ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Mail size={14} />}
                  Envoyer le catalogue
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Couleur</label>
            <select value={filters.color} onChange={e => setFilters(f => ({ ...f, color: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
              {COLOR_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Région</label>
            <select value={filters.region} onChange={e => setFilters(f => ({ ...f, region: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Toutes</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button onClick={() => setFilters(f => ({ ...f, boutiqueOnly: !f.boutiqueOnly }))}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border ${filters.boutiqueOnly ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-500'}`}>
            {filters.boutiqueOnly ? <Eye size={14} /> : <EyeOff size={14} />}
            {filters.boutiqueOnly ? 'Boutique seuls' : 'Tous les produits'}
          </button>
          <button onClick={() => setFilters({ color: '', region: '', category: '', boutiqueOnly: false })} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Effacer</button>
        </div>
      </div>

      {/* Products grid */}
      <div className="card">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" /></div>
        ) : displayProducts.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><Wine size={40} className="mx-auto mb-3" /><p>Aucun produit</p></div>
        ) : (
          <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {displayProducts.map(p => {
              const margin = p.price_ht - p.purchase_price;
              return (
                <div key={p.id} onClick={() => setViewing(p)} className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-wine-50 rounded-lg flex items-center justify-center"><Wine size={14} className="text-wine-600" /></div>
                      <p className="font-medium text-sm">{p.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.color && <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${COLOR_BADGES[p.color] || 'bg-gray-100 text-gray-700'}`}>{p.color}</span>}
                      <span onClick={e => { e.stopPropagation(); toggleFeatured(p.id, p.is_featured, p.category_id); }}>
                        <Star size={14} className={p.is_featured ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'} />
                      </span>
                      <span onClick={e => { e.stopPropagation(); toggleBoutique(p.id, p.visible_boutique); }}>
                        {p.visible_boutique ? <Eye size={14} className="text-green-500" /> : <EyeOff size={14} className="text-gray-300" />}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{formatEur(p.price_ttc)}</span>
                    <span className="text-xs text-green-600">Marge {formatEur(margin)}</span>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setEditing(p)} className="text-xs px-2 py-1 border rounded-lg hover:bg-gray-100">Modifier</button>
                    <button onClick={() => { const url = productsAPI.pdf(p.id); window.open(url + '?token=' + localStorage.getItem('accessToken'), '_blank'); }} className="text-xs px-2 py-1 border rounded-lg hover:bg-gray-100"><FileText size={12} className="inline mr-1" />PDF</button>
                    <button onClick={() => handleDelete(p.id, p.name)} className="text-xs px-2 py-1 border border-red-200 text-red-500 rounded-lg hover:bg-red-50">Désactiver</button>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop table */}
          <table className="hidden md:table w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Produit</th>
                <th className="pb-3 font-medium">Couleur</th>
                <th className="pb-3 font-medium">Région</th>
                <th className="pb-3 font-medium">Prix TTC</th>
                <th className="pb-3 font-medium">Marge</th>
                <th className="pb-3 font-medium">Boutique</th>
                <th className="pb-3 font-medium" title="Sélection du moment (1 par catégorie)">Sélection</th>
                <th className="pb-3 font-medium">Dégustation</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayProducts.map(p => {
                const margin = p.price_ht - p.purchase_price;
                const marginPct = p.purchase_price > 0 ? ((margin / p.purchase_price) * 100).toFixed(0) : 0;
                const hasTasting = !!p.tasting_notes;
                return (
                  <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setViewing(p)}>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-wine-50 rounded-lg flex items-center justify-center flex-shrink-0"><Wine size={16} className="text-wine-600" /></div>
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <div className="flex items-center gap-1">
                            {p.label && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-wine-50 text-wine-700">{p.label}</span>}
                            {p.vintage && <span className="text-xs text-gray-400">{p.vintage}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">{p.color && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${COLOR_BADGES[p.color] || 'bg-gray-100 text-gray-700'}`}>{p.color}</span>}</td>
                    <td className="py-3 text-gray-500 text-xs">{p.region || '—'}{p.appellation ? ` · ${p.appellation}` : ''}</td>
                    <td className="py-3 font-semibold">{formatEur(p.price_ttc)}</td>
                    <td className="py-3"><span className={`text-xs font-medium ${margin > 0 ? 'text-green-600' : 'text-red-600'}`}>{formatEur(margin)} ({marginPct}%)</span></td>
                    <td className="py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleBoutique(p.id, p.visible_boutique)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${p.visible_boutique ? 'bg-green-500' : 'bg-gray-300'}`}
                        title={p.visible_boutique ? 'Visible en boutique' : 'Masqué en boutique'}>
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${p.visible_boutique ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                    <td className="py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleFeatured(p.id, p.is_featured, p.category_id)}
                        title={p.is_featured ? 'Retirer de la sélection' : 'Ajouter à la sélection (1 par catégorie)'}
                        className="p-1 rounded-lg hover:bg-yellow-50 transition-colors">
                        <Star size={16} className={p.is_featured ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'} />
                      </button>
                    </td>
                    <td className="py-3">{hasTasting ? <span className="text-xs text-wine-600">★ Profil</span> : <span className="text-xs text-gray-300">—</span>}</td>
                    <td className="py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Modifier"><Pencil size={16} /></button>
                        <button onClick={() => { const url = productsAPI.pdf(p.id); window.open(url + '?token=' + localStorage.getItem('accessToken'), '_blank'); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Fiche PDF"><FileText size={16} /></button>
                        <button onClick={() => handleDelete(p.id, p.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Désactiver"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
