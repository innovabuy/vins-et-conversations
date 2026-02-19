import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Wine, Search, Filter, ChevronRight, ShoppingCart, Check, Star, Clock } from 'lucide-react';
import api from '../../services/api';
import { featuredAPI } from '../../services/api';
import { useCart } from '../../contexts/CartContext';
import { useToast } from '../shared/Toast';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

const COLOR_MAP = {
  rouge: 'bg-red-100 text-red-700',
  blanc: 'bg-yellow-50 text-yellow-700',
  rosé: 'bg-pink-100 text-pink-700',
  effervescent: 'bg-sky-100 text-sky-700',
  sans_alcool: 'bg-green-100 text-green-700',
};


export default function BoutiqueHome() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const campaignId = searchParams.get('campagne');
  const [products, setProducts] = useState([]);
  const [filters, setFilters] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [addedId, setAddedId] = useState(null);
  const [referrerName, setReferrerName] = useState(null);
  const [featured, setFeatured] = useState([]);
  const { addToCart, getReferralCode } = useCart();
  const toast = useToast();
  const addToCartHandled = useRef(false);

  // Handle add_to_cart URL parameter (from coffrets.html)
  useEffect(() => {
    const productId = searchParams.get('add_to_cart');
    if (productId && !addToCartHandled.current) {
      addToCartHandled.current = true;
      addToCart(productId, 1)
        .then(() => toast.success('Produit ajouté au panier'))
        .catch(() => toast.error('Erreur lors de l\'ajout au panier'));
      navigate('/boutique', { replace: true });
    }
  }, [searchParams]);

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

  useEffect(() => { fetchProducts(); }, [search, region, categoryId, campaignId]);

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
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="#catalog" className="inline-flex items-center gap-2 bg-white text-wine-800 px-6 py-3 rounded-xl font-semibold hover:bg-wine-50 transition-all">
              Découvrir nos vins <ChevronRight size={18} />
            </a>
            <Link to="/boutique/wizard" className="inline-flex items-center gap-2 bg-wine-600/30 backdrop-blur text-white px-6 py-3 rounded-xl font-semibold hover:bg-wine-600/50 transition-all border border-white/20">
              Quel vin pour moi ? <ChevronRight size={18} />
            </Link>
          </div>
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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Star size={20} className="text-yellow-500 fill-yellow-500" />
              <h2 className="text-xl font-bold text-gray-900">Notre sélection du moment</h2>
            </div>
            <Link to="/boutique/selection" className="text-sm text-wine-700 hover:text-wine-800 font-medium flex items-center gap-1">
              Tout voir <ChevronRight size={16} />
            </Link>
          </div>
          <div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide sm:overflow-visible sm:pb-0 sm:grid sm:gap-6"
            style={{ gridTemplateColumns: `repeat(${Math.min(featured.length, 4)}, minmax(0, 1fr))` }}
          >
            {featured.map((p) => (
              <Link
                key={p.id}
                to={`/boutique/vin/${p.id}`}
                className="group relative bg-white border-2 border-yellow-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1 flex flex-col min-w-[260px] flex-shrink-0 snap-start sm:min-w-0 sm:flex-shrink"
              >
                <div className="absolute top-3 right-3 z-10 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
                  <Star size={12} className="fill-yellow-900" /> Sélection
                </div>
                <div className="aspect-[3/4] overflow-hidden bg-gradient-to-br from-yellow-50 to-wine-50 flex items-center justify-center">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 text-wine-300">
                      <Wine size={48} />
                      <span className="text-sm font-medium text-wine-400 text-center px-4">{p.name}</span>
                    </div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col">
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
                  <div className="flex items-center justify-between mt-auto pt-3">
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

        {/* Category filter buttons */}
        {filters?.categoryObjects?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={() => setCategoryId('')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${!categoryId ? 'bg-wine-700 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              Toutes catégories
            </button>
            {filters.categoryObjects.map(cat => (
              <button key={cat.id} onClick={() => setCategoryId(categoryId === cat.id ? '' : cat.id)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${categoryId === cat.id ? 'text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`} style={categoryId === cat.id ? { backgroundColor: cat.color || '#7a1c3b' } : {}}>
                <span>{cat.icon_emoji || cat.icon}</span> {cat.name}
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((p) => (
              <Link
                key={p.id}
                to={`/boutique/vin/${p.id}`}
                className="group relative bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1 flex flex-col h-full"
              >
                {/* Pré-commande badge */}
                {!p.in_stock && p.allow_backorder && (
                  <div className="absolute top-3 left-3 z-10 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
                    <Clock size={12} /> Pré-commande
                  </div>
                )}
                <div className="aspect-[3/4] overflow-hidden bg-gradient-to-br from-wine-50 to-wine-100 flex items-center justify-center relative">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 text-wine-300">
                      <Wine size={48} />
                      <span className="text-sm font-medium text-wine-400 text-center px-4">{p.name}</span>
                    </div>
                  )}
                  {!p.in_stock && !p.allow_backorder && (
                    <div className="absolute inset-0 bg-gray-200/60 flex items-center justify-center">
                      <span className="bg-white/90 px-3 py-1 rounded-lg text-sm font-medium text-gray-600">Rupture de stock</span>
                    </div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    {p.category_details ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: p.category_details.color || '#666' }}>{p.category_details.icon} {p.category_details.name}</span>
                    ) : p.color ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${COLOR_MAP[p.color?.toLowerCase()] || 'bg-gray-100 text-gray-600'}`}>{p.color}</span>
                    ) : null}
                    {p.region && <span className="text-xs text-gray-400">{p.region}</span>}
                  </div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-wine-700 transition-colors">{p.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{p.appellation || '\u00A0'}</p>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2 flex-1">{p.description || '\u00A0'}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-lg font-bold text-wine-700">{formatEur(p.price_ttc)}</span>
                    {(!p.in_stock && !p.allow_backorder) ? (
                      <span className="text-xs text-gray-400 font-medium">Indisponible</span>
                    ) : (
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
                          : !p.in_stock ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-wine-50 text-wine-700 hover:bg-wine-100'
                      }`}
                    >
                      {addedId === p.id ? <><Check size={14} /> Ajouté</> : !p.in_stock ? <><Clock size={14} /> Pré-commander</> : <><ShoppingCart size={14} /> Ajouter</>}
                    </button>
                    )}
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
