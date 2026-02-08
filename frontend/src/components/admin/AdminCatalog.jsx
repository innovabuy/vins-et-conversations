import { useState, useEffect, useCallback } from 'react';
import { productsAPI, catalogPdfAPI } from '../../services/api';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer
} from 'recharts';
import { Wine, Plus, Pencil, Trash2, X, Save, ChevronLeft, Award, Thermometer, Grape, UtensilsCrossed, Download, Mail, FileText, Package, Eye, EyeOff } from 'lucide-react';
import { WINE_TYPE_OPTIONS, TASTING_CRITERIA, resolveWineType, getCriteriaForProduct, buildRadarData } from '../../config/tastingCriteria';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

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
  visible_boutique: false, bundle_products: [],
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

// ─── Product Form (enriched) ─────────────────────────
function ProductForm({ product, onSave, onCancel, allProducts = [] }) {
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

  // Resolve wine type from color + category
  const wineType = resolveWineType(form.color, form.category);
  const criteria = TASTING_CRITERIA[wineType] || null;
  const isCoffret = wineType === 'coffret';

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

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      await onSave(payload);
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur');
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
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Catégorie</label>
            <input value={form.category || ''} onChange={e => handleChange('category', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
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
            <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
            <input value={form.label || ''} onChange={e => handleChange('label', e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Bio, HVE, AOP..." />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Cépages</label>
            <TagsInput value={form.grape_varieties} onChange={v => handleChange('grape_varieties', v)} placeholder="Ajouter un cépage..." />
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

      {/* Section Dégustation / Coffret */}
      {isCoffret ? (
        <fieldset className="border rounded-lg p-4 space-y-4">
          <legend className="text-sm font-semibold text-gray-700 px-2">Contenu du coffret</legend>
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

      {/* Section Accords */}
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

      {/* Section Distinctions */}
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
    if (editing?.id) await productsAPI.update(editing.id, payload);
    else await productsAPI.create(payload);
    setEditing(null);
    fetchProducts();
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Désactiver le produit "${name}" ?`)) return;
    try { await productsAPI.remove(id); fetchProducts(); } catch { alert('Erreur'); }
  };

  const toggleBoutique = async (id, current) => {
    try {
      await productsAPI.update(id, { visible_boutique: !current });
      setProducts(prev => prev.map(p => p.id === id ? { ...p, visible_boutique: !current } : p));
    } catch { alert('Erreur'); }
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
      alert('Catalogue envoyé !');
      setEmailModal(false);
      setEmailForm({ email: '', subject: 'Catalogue Vins & Conversations', message: '' });
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur d\'envoi');
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
        <ProductForm product={editing === 'new' ? null : editing} onSave={handleSave} onCancel={() => setEditing(null)} allProducts={products} />
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
                    <td className="py-3">{hasTasting ? <span className="text-xs text-wine-600">★ Profil</span> : <span className="text-xs text-gray-300">—</span>}</td>
                    <td className="py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(p)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Modifier"><Pencil size={16} /></button>
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
    </div>
  );
}
