import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Wine, Search, Filter, ChevronRight, ShoppingCart, Check, Star } from 'lucide-react';
import api from '../../services/api';
import { featuredAPI } from '../../services/api';
import { useCart } from '../../contexts/CartContext';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

const COLOR_MAP = {
  rouge: 'bg-red-100 text-red-700',
  blanc: 'bg-yellow-50 text-yellow-700',
  rosé: 'bg-pink-100 text-pink-700',
  effervescent: 'bg-sky-100 text-sky-700',
  sans_alcool: 'bg-green-100 text-green-700',
};

const COLOR_CHIPS = [
  { value: 'rouge', label: 'Rouge', dot: 'bg-red-500' },
  { value: 'blanc', label: 'Blanc', dot: 'bg-yellow-400' },
  { value: 'rosé', label: 'Rosé', dot: 'bg-pink-400' },
  { value: 'effervescent', label: 'Effervescent', dot: 'bg-sky-400' },
  { value: 'sans_alcool', label: 'Sans alcool', dot: 'bg-green-500' },
];

export default function BoutiqueHome() {
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get('campagne');
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [color, setColor] = useState('');
  const [region, setRegion] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [addedId, setAddedId] = useState(null);
  const [referrerName, setReferrerName] = useState(null);
  const [featured, setFeatured] = useState([]);
  const { addToCart, getReferralCode } = useCart();

  // Detect referral (ambassador or student)
  useEffect(() => {
    const code = getReferralCode();
    if (code && !referrerName) {
      api.get(`/public/referral/${code}`)
        .then(r => setReferrerName(r.data.name))
        .catch(() => {
          // Fallback to ambassador endpoint for backward compat
          api.get(`/public/ambassador/${code}`)
            .then(r => setReferrerName(r.data.name))
            .catch(() => {});
        });
    }
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (color) params.color = color;
      if (region) params.region = region;
      if (categoryId) params.category_id = categoryId;
      if (campaignId) params.campaign_id = campaignId;
      const { data } = await api.get('/public/catalog', { params });
      setProducts(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/public/filters').then(r => setFilters(r.data)).catch(console.error);
    featuredAPI.list().then(r => setFeatured(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchProducts(); }, [search, color, region, categoryId, campaignId]);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900 text-white py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
            <Wine size={16} /> Vins sélectionnés avec passion
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            Des vins d'exception<br />
            <span className="text-wine-200">pour des moments uniques</span>
          </h1>
          <p className="text-lg text-wine-200 max-w-2xl mx-auto mb-8">
            Découvrez notre sélection de vins français, choisis avec soin par Nicolas Froment.
            Chaque bouteille raconte une histoire.
          </p>
          <a href="#catalog" className="inline-flex items-center gap-2 bg-white text-wine-800 px-6 py-3 rounded-xl font-semibold hover:bg-wine-50 transition-all">
            Découvrir nos vins <ChevronRight size={18} />
          </a>
        </div>
      </section>

      {/* Referral banner */}
      {referrerName && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100">
          <div className="max-w-7xl mx-auto px-4 py-2.5 text-center text-sm text-indigo-700">
            Recommandé par <span className="font-semibold">{referrerName}</span>
          </div>
        </div>
      )}

      {/* Featured — Sélection du moment */}
      {featured.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center gap-2 mb-6">
            <Star size={20} className="text-yellow-500 fill-yellow-500" />
            <h2 className="text-xl font-bold text-gray-900">Notre sélection du moment</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured.map((p) => (
              <Link
                key={p.id}
                to={`/boutique/vin/${p.id}`}
                className="group relative bg-white border-2 border-yellow-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1"
              >
                <div className="absolute top-3 right-3 z-10 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
                  <Star size={12} className="fill-yellow-900" /> Sélection
                </div>
                <div className="aspect-[4/3] bg-gradient-to-br from-yellow-50 to-wine-50 flex items-center justify-center">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <Wine size={48} className="text-wine-300" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {p.category_details ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: p.category_details.color || '#666' }}>{p.category_details.icon} {p.category_details.name}</span>
                    ) : p.color ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${COLOR_MAP[p.color?.toLowerCase()] || 'bg-gray-100 text-gray-600'}`}>{p.color}</span>
                    ) : null}
                    {p.region && <span className="text-xs text-gray-400">{p.region}</span>}
                  </div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-wine-700 transition-colors">{p.name}</h3>
                  {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-lg font-bold text-wine-700">{formatEur(p.price_ttc)}</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
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
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Catalog */}
      <section id="catalog" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
          <div className="relative flex-1 w-full">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un vin..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-wine-200 focus:border-wine-500 outline-none"
            />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm hover:bg-gray-50">
            <Filter size={16} /> Régions
            {region && <span className="w-2 h-2 rounded-full bg-wine-600" />}
          </button>
        </div>

        {/* Color chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setColor('')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              !color ? 'bg-wine-700 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            Tous
          </button>
          {COLOR_CHIPS.map((c) => (
            <button
              key={c.value}
              onClick={() => setColor(color === c.value ? '' : c.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                color === c.value ? 'bg-wine-700 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${c.dot} ${color === c.value ? 'ring-1 ring-white' : ''}`} />
              {c.label}
            </button>
          ))}
        </div>

        {/* Category filter buttons */}
        {filters?.categoryObjects?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={() => setCategoryId('')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${!categoryId ? 'bg-wine-700 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              Toutes catégories
            </button>
            {filters.categoryObjects.map(cat => (
              <button key={cat.id} onClick={() => setCategoryId(categoryId === cat.id ? '' : cat.id)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${categoryId === cat.id ? 'text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`} style={categoryId === cat.id ? { backgroundColor: cat.color || '#7a1c3b' } : {}}>
                <span>{cat.icon}</span> {cat.name}
              </button>
            ))}
          </div>
        )}

        {showFilters && filters && (
          <div className="flex flex-wrap gap-3 mb-6 p-4 bg-gray-50 rounded-xl">
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">Toutes régions</option>
              {filters.regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {region && (
              <button onClick={() => setRegion('')} className="text-sm text-wine-700 hover:underline">Réinitialiser</button>
            )}
          </div>
        )}

        {/* Products grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Wine size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">Aucun vin trouvé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((p) => (
              <Link
                key={p.id}
                to={`/boutique/vin/${p.id}`}
                className="group bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1"
              >
                <div className="aspect-[4/3] bg-gradient-to-br from-wine-50 to-wine-100 flex items-center justify-center">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <Wine size={48} className="text-wine-300" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {p.category_details ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: p.category_details.color || '#666' }}>{p.category_details.icon} {p.category_details.name}</span>
                    ) : p.color ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${COLOR_MAP[p.color?.toLowerCase()] || 'bg-gray-100 text-gray-600'}`}>{p.color}</span>
                    ) : null}
                    {p.region && <span className="text-xs text-gray-400">{p.region}</span>}
                  </div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-wine-700 transition-colors">{p.name}</h3>
                  {p.appellation && <p className="text-xs text-gray-500 mt-1">{p.appellation}</p>}
                  {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-lg font-bold text-wine-700">{formatEur(p.price_ttc)}</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
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
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
