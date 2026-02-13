import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Wine, Thermometer, Award, Grape, Download, ShoppingCart, Minus, Plus, Check } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import api from '../../services/api';
import { buildRadarData } from '../../config/tastingCriteria';
import { useCart } from '../../contexts/CartContext';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const { addToCart } = useCart();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/public/catalog/${id}`);
        setProduct(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  if (!product) return <div className="text-center py-20 text-gray-400">Vin introuvable</div>;

  const radarData = buildRadarData(product.tasting_notes, product.color, product.category, product.category_tasting_axes);
  const hasRadar = !!radarData && product.category_type !== 'bundle';

  const grapes = product.grape_varieties || [];
  const foodPairing = product.food_pairing || [];
  const awards = product.awards || [];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/boutique" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6">
        <ArrowLeft size={16} /> Retour aux vins
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Image */}
        <div className="aspect-square bg-gradient-to-br from-wine-50 to-wine-100 rounded-2xl flex items-center justify-center overflow-hidden">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <Wine size={80} className="text-wine-300" />
          )}
        </div>

        {/* Info */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {product.color && <span className="px-3 py-1 bg-wine-100 text-wine-700 rounded-full text-sm font-medium">{product.color}</span>}
              {product.vintage && <span className="text-sm text-gray-500">Millésime {product.vintage}</span>}
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
            {product.appellation && <p className="text-lg text-gray-500 mt-1">{product.appellation}</p>}
            {product.region && <p className="text-sm text-gray-400">{product.region}</p>}
          </div>

          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold text-wine-700">{formatEur(product.price_ttc)}</span>
            <a
              href={`${api.defaults.baseURL}/public/catalog/${product.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            >
              <Download size={14} /> Fiche PDF
            </a>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center border rounded-lg">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="p-2 hover:bg-gray-50 text-gray-600"><Minus size={16} /></button>
              <span className="w-12 text-center font-semibold">{qty}</span>
              <button onClick={() => setQty(qty + 1)} className="p-2 hover:bg-gray-50 text-gray-600"><Plus size={16} /></button>
            </div>
            <button
              onClick={() => {
                addToCart({ id: product.id, name: product.name, price_ttc: product.price_ttc }, qty);
                setAdded(true);
                setTimeout(() => setAdded(false), 2000);
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
                added ? 'bg-green-600 text-white' : 'bg-wine-700 text-white hover:bg-wine-800'
              }`}
            >
              {added ? <><Check size={18} /> Ajouté au panier</> : <><ShoppingCart size={18} /> Ajouter au panier</>}
            </button>
          </div>

          {product.description && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-600 leading-relaxed">{product.description}</p>
            </div>
          )}

          {product.winemaker_notes && (
            <div className="bg-wine-50 rounded-xl p-4">
              <h3 className="font-semibold text-wine-800 mb-2">Notes du vigneron</h3>
              <p className="text-wine-700 text-sm leading-relaxed italic">{product.winemaker_notes}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {product.serving_temp && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <Thermometer size={20} className="text-blue-500" />
                <div>
                  <p className="text-xs text-gray-500">Service</p>
                  <p className="font-semibold text-sm">{product.serving_temp}</p>
                </div>
              </div>
            )}
            {grapes.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <Grape size={20} className="text-purple-500" />
                <div>
                  <p className="text-xs text-gray-500">Cépages</p>
                  <p className="font-semibold text-sm">{grapes.join(', ')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
        {/* Radar chart */}
        {hasRadar && (
          <div className="bg-white border rounded-2xl p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Profil gustatif</h3>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12, fill: '#6b7280' }} />
                <Radar name="Profil" dataKey="value" stroke="#7a1c3b" fill="#7a1c3b" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Food pairing + awards */}
        <div className="space-y-6">
          {foodPairing.length > 0 && (
            <div className="bg-white border rounded-2xl p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Accords mets & vins</h3>
              <div className="flex flex-wrap gap-2">
                {foodPairing.map((f, i) => (
                  <span key={i} className="px-3 py-1.5 bg-orange-50 text-orange-700 rounded-full text-sm">{f}</span>
                ))}
              </div>
            </div>
          )}

          {awards.length > 0 && (
            <div className="bg-white border rounded-2xl p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Récompenses</h3>
              <div className="space-y-2">
                {awards.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Award size={16} className="text-yellow-500" />
                    <span className="text-gray-700">{typeof a === 'string' ? a : a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
