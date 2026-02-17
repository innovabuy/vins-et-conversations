import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wine, ShoppingCart, Check, ArrowRight, ArrowLeft, Sparkles, Eye } from 'lucide-react';
import api from '../../services/api';
import { useCart } from '../../contexts/CartContext';
import ProductModal from './ProductModal';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

const COLOR_OPTIONS = [
  { value: '', label: 'Tous les vins', emoji: '🍷' },
  { value: 'rouge', label: 'Rouge', emoji: '🔴' },
  { value: 'blanc', label: 'Blanc', emoji: '⚪' },
  { value: 'rosé', label: 'Rosé', emoji: '🩷' },
  { value: 'effervescent', label: 'Effervescent', emoji: '🫧' },
];

const TASTE_AXES = [
  { key: 'fruite', label: 'Fruité', description: 'Intensité des arômes fruités', low: 'Discret', high: 'Intense' },
  { key: 'acidite', label: 'Acidité / Fraîcheur', description: 'Vivacité en bouche', low: 'Doux', high: 'Vif' },
  { key: 'rondeur', label: 'Rondeur', description: 'Souplesse et onctuosité', low: 'Sec', high: 'Rond' },
  { key: 'puissance', label: 'Puissance', description: 'Intensité globale du vin', low: 'Léger', high: 'Puissant' },
  { key: 'longueur', label: 'Longueur', description: 'Persistance aromatique en bouche', low: 'Court', high: 'Long' },
];

function computeMatchScore(userPrefs, productNotes) {
  if (!productNotes) return 0;
  const notes = typeof productNotes === 'string' ? JSON.parse(productNotes) : productNotes;

  const axes = TASTE_AXES.filter(a => notes[a.key] !== undefined && notes[a.key] !== null);
  if (axes.length === 0) return 0;

  let sumSqDiff = 0;
  for (const axis of axes) {
    const diff = (userPrefs[axis.key] || 0) - (notes[axis.key] || 0);
    sumSqDiff += diff * diff;
  }

  // Max possible distance: sqrt(n * 5^2) where n = axes count, values 0-5
  const maxDist = Math.sqrt(axes.length * 25);
  const dist = Math.sqrt(sumSqDiff);
  const score = Math.max(0, Math.round((1 - dist / maxDist) * 100));
  return score;
}

export default function TasteWizard() {
  const [step, setStep] = useState(0);
  const [color, setColor] = useState('');
  const [prefs, setPrefs] = useState(() => {
    const init = {};
    TASTE_AXES.forEach(a => { init[a.key] = 3; });
    return init;
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [addedId, setAddedId] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const { addToCart } = useCart();

  const handleCompute = async () => {
    setLoading(true);
    try {
      const params = {};
      if (color) params.color = color;
      params.limit = 100;
      const { data } = await api.get('/public/catalog', { params });
      const products = data.data || [];

      const scored = products
        .filter(p => p.tasting_notes)
        .map(p => ({
          ...p,
          matchScore: computeMatchScore(prefs, p.tasting_notes),
        }))
        .sort((a, b) => b.matchScore - a.matchScore);

      setResults(scored);
      setStep(2);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const displayedResults = results ? results.slice(0, 10) : [];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-wine-50 text-wine-700 rounded-full px-4 py-1.5 text-sm font-medium mb-4">
          <Sparkles size={16} /> Recommandation personnalisée
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
          Trouvez le vin qui vous correspond
        </h1>
        <p className="text-gray-500">
          Indiquez vos préférences gustatives et nous vous suggérerons les vins les plus adaptés.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {['Type', 'Goûts', 'Résultats'].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              i <= step ? 'bg-wine-700 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {i + 1}
            </div>
            <span className={`text-sm hidden sm:inline ${i <= step ? 'text-wine-700 font-medium' : 'text-gray-400'}`}>{label}</span>
            {i < 2 && <div className={`w-8 h-px ${i < step ? 'bg-wine-700' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 0: Color */}
      {step === 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Quel type de vin recherchez-vous ?</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setColor(opt.value)}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  color === opt.value
                    ? 'border-wine-700 bg-wine-50 text-wine-800'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <span className="text-2xl block mb-1">{opt.emoji}</span>
                <span className="text-sm font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end pt-4">
            <button
              onClick={() => setStep(1)}
              className="btn-primary flex items-center gap-2 px-6 py-2.5"
            >
              Suivant <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Sliders */}
      {step === 1 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Vos préférences gustatives</h2>
          <p className="text-sm text-gray-500">Déplacez les curseurs selon vos goûts (1 = peu, 5 = beaucoup)</p>

          <div className="space-y-5">
            {TASTE_AXES.map((axis) => (
              <div key={axis.key} className="bg-white border rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-gray-900">{axis.label}</label>
                  <span className="text-wine-700 font-bold text-lg">{prefs[axis.key]}/5</span>
                </div>
                <p className="text-xs text-gray-400 mb-3">{axis.description}</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-14 text-right">{axis.low}</span>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    value={prefs[axis.key]}
                    onChange={(e) => setPrefs({ ...prefs, [axis.key]: parseInt(e.target.value) })}
                    className="flex-1 accent-wine-700"
                  />
                  <span className="text-xs text-gray-400 w-14">{axis.high}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={() => setStep(0)} className="flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm hover:bg-gray-50">
              <ArrowLeft size={16} /> Retour
            </button>
            <button
              onClick={handleCompute}
              disabled={loading}
              className="btn-primary flex items-center gap-2 px-6 py-2.5 disabled:opacity-50"
            >
              {loading ? 'Analyse...' : 'Voir mes recommandations'} <Sparkles size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Results */}
      {step === 2 && results && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Nos recommandations pour vous
            </h2>
            <button onClick={() => setStep(1)} className="text-sm text-wine-700 hover:underline flex items-center gap-1">
              <ArrowLeft size={14} /> Modifier mes goûts
            </button>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Wine size={48} className="mx-auto mb-4 opacity-50" />
              <p>Aucun vin avec profil gustatif trouvé.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedResults.map((p, index) => (
                <div key={p.id} className="bg-white border rounded-xl p-4 flex items-center gap-4 hover:border-wine-200 transition-colors">
                  <button
                    onClick={() => setSelectedIndex(index)}
                    className="flex-shrink-0 w-12 h-12 rounded-full bg-wine-50 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-wine-300 transition-all"
                  >
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <Wine size={20} className="text-wine-400" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedIndex(index)}
                        className="font-semibold text-gray-900 hover:text-wine-700 truncate text-left"
                      >
                        {p.name}
                      </button>
                      {index === 0 && (
                        <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                          Top match
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      {p.color && <span className="capitalize">{p.color}</span>}
                      {p.region && <span>{p.region}</span>}
                      <span className="font-medium text-wine-700">{formatEur(p.price_ttc)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-center">
                      <div className={`text-lg font-bold ${
                        p.matchScore >= 80 ? 'text-green-600' :
                        p.matchScore >= 60 ? 'text-yellow-600' :
                        'text-gray-400'
                      }`}>
                        {p.matchScore}%
                      </div>
                      <div className="text-[10px] text-gray-400">match</div>
                    </div>
                    <button
                      onClick={() => setSelectedIndex(index)}
                      className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all"
                      title="Voir la fiche"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => {
                        addToCart({ id: p.id, name: p.name, price_ttc: p.price_ttc });
                        setAddedId(p.id);
                        setTimeout(() => setAddedId(null), 1500);
                      }}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        addedId === p.id
                          ? 'bg-green-100 text-green-700'
                          : 'bg-wine-50 text-wine-700 hover:bg-wine-100'
                      }`}
                    >
                      {addedId === p.id ? <><Check size={14} /> Ajouté</> : <><ShoppingCart size={14} /> Ajouter</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-center pt-6">
            <Link to="/boutique" className="text-sm text-wine-700 hover:underline">
              Voir tout le catalogue
            </Link>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {selectedIndex !== null && displayedResults[selectedIndex] && (
        <ProductModal
          product={displayedResults[selectedIndex]}
          onClose={() => setSelectedIndex(null)}
          onPrev={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
          onNext={() => setSelectedIndex(Math.min(displayedResults.length - 1, selectedIndex + 1))}
          hasPrev={selectedIndex > 0}
          hasNext={selectedIndex < displayedResults.length - 1}
        />
      )}
    </div>
  );
}
