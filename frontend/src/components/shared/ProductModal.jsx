import { useState, useEffect, useCallback } from 'react';
import { X, Wine, Thermometer, Award, Grape, Download, ShoppingCart, Minus, Plus, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';
import api from '../../services/api';
import { buildRadarData } from '../../config/tastingCriteria';
import { useCart } from '../../contexts/CartContext';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

export default function ProductModal({ product, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const { addToCart } = useCart();

  // Fetch full product detail
  useEffect(() => {
    if (!product) return;
    setLoading(true);
    setQty(1);
    setAdded(false);
    (async () => {
      try {
        const { data } = await api.get(`/public/catalog/${product.id}`);
        setDetail(data);
      } catch {
        setDetail(product); // fallback to summary data
      } finally {
        setLoading(false);
      }
    })();
  }, [product]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft' && hasPrev) onPrev();
    if (e.key === 'ArrowRight' && hasNext) onNext();
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!product) return null;

  const p = detail || product;
  const radarData = buildRadarData(p.tasting_notes, p.color, p.category, p.category_tasting_axes);
  const hasRadar = !!radarData && p.category_type !== 'bundle';
  const grapes = p.grape_varieties || [];
  const foodPairing = p.food_pairing || [];
  const awards = p.awards || [];

  const handleAdd = () => {
    addToCart({ id: p.id, name: p.name, price_ttc: p.price_ttc }, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Nav arrows — outside the modal panel */}
      {hasPrev && (
        <button
          onClick={onPrev}
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-[60] w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white transition-colors"
          aria-label="Vin précédent"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      {hasNext && (
        <button
          onClick={onNext}
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-[60] w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white transition-colors"
          aria-label="Vin suivant"
        >
          <ChevronRight size={24} />
        </button>
      )}

      {/* Modal panel */}
      <div className="relative z-[55] bg-white w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl sm:mx-4 overflow-y-auto shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          aria-label="Fermer"
        >
          <X size={20} />
        </button>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" />
          </div>
        ) : (
          <div className="p-5 sm:p-6">
            {/* Top: image + info */}
            <div className="flex flex-col sm:flex-row gap-5">
              {/* Image */}
              <div className="sm:w-56 sm:flex-shrink-0 aspect-square bg-gradient-to-br from-wine-50 to-wine-100 rounded-xl flex items-center justify-center overflow-hidden">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <Wine size={60} className="text-wine-300" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {p.color && <span className="px-2.5 py-0.5 bg-wine-100 text-wine-700 rounded-full text-xs font-medium capitalize">{p.color}</span>}
                    {p.vintage && <span className="text-xs text-gray-500">Millésime {p.vintage}</span>}
                    {product.matchScore !== undefined && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        product.matchScore >= 80 ? 'bg-green-100 text-green-700' :
                        product.matchScore >= 60 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {product.matchScore}% match
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{p.name}</h2>
                  {p.appellation && <p className="text-sm text-gray-500">{p.appellation}</p>}
                  {p.region && <p className="text-xs text-gray-400">{p.region}</p>}
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-wine-700">{formatEur(p.price_ttc)}</span>
                  {p.id && (
                    <a
                      href={`${api.defaults.baseURL}/public/catalog/${p.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
                    >
                      <Download size={12} /> PDF
                    </a>
                  )}
                </div>

                {/* Add to cart */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center border rounded-lg">
                    <button onClick={() => setQty(Math.max(1, qty - 1))} className="p-1.5 hover:bg-gray-50 text-gray-600"><Minus size={14} /></button>
                    <span className="w-9 text-center font-semibold text-sm">{qty}</span>
                    <button onClick={() => setQty(qty + 1)} className="p-1.5 hover:bg-gray-50 text-gray-600"><Plus size={14} /></button>
                  </div>
                  <button
                    onClick={handleAdd}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                      added ? 'bg-green-600 text-white' : 'bg-wine-700 text-white hover:bg-wine-800'
                    }`}
                  >
                    {added ? <><Check size={16} /> Ajouté au panier</> : <><ShoppingCart size={16} /> Ajouter au panier</>}
                  </button>
                </div>

                {/* Details grid */}
                <div className="flex flex-wrap gap-2">
                  {p.serving_temp && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 rounded-lg text-xs">
                      <Thermometer size={14} className="text-blue-500" />
                      <span className="text-gray-700">{p.serving_temp}</span>
                    </div>
                  )}
                  {grapes.length > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 rounded-lg text-xs">
                      <Grape size={14} className="text-purple-500" />
                      <span className="text-gray-700">{grapes.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Description */}
            {p.description && (
              <div className="mt-5">
                <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">Description</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{p.description}</p>
              </div>
            )}

            {/* Winemaker notes */}
            {p.winemaker_notes && (
              <div className="mt-4 bg-wine-50 rounded-xl p-4">
                <h3 className="font-semibold text-wine-800 mb-1.5 text-sm">Notes du vigneron</h3>
                <p className="text-wine-700 text-sm leading-relaxed italic">{p.winemaker_notes}</p>
              </div>
            )}

            {/* Radar chart + food pairing */}
            <div className={`mt-5 grid gap-4 ${hasRadar ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              {hasRadar && (
                <div className="border rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-2 text-sm">Profil gustatif</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: '#6b7280' }} />
                      <Radar dataKey="value" stroke="#7a1c3b" fill="#7a1c3b" fillOpacity={0.2} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="space-y-3">
                {foodPairing.length > 0 && (
                  <div className="border rounded-xl p-4">
                    <h3 className="font-semibold text-gray-900 mb-2 text-sm">Accords mets & vins</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {foodPairing.map((f, i) => (
                        <span key={i} className="px-2.5 py-1 bg-orange-50 text-orange-700 rounded-full text-xs">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                {awards.length > 0 && (
                  <div className="border rounded-xl p-4">
                    <h3 className="font-semibold text-gray-900 mb-2 text-sm">Récompenses</h3>
                    <div className="space-y-1">
                      {awards.map((a, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          <Award size={14} className="text-yellow-500" />
                          <span className="text-gray-700">{typeof a === 'string' ? a : a.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
