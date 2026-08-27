import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Wine, Search, Filter, ChevronRight, ChevronLeft, ShoppingCart, Check, Star, Clock } from 'lucide-react';
import api from '../../services/api';
import { featuredAPI } from '../../services/api';
import { useCart } from '../../contexts/CartContext';
import { useToast } from '../shared/Toast';
import { useSiteImage } from '../../contexts/SiteImagesContext';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

// Contenu par défaut du header — repris à l'identique du H1/sous-titre qui étaient
// écrits en dur ici. Fallback si la ligne 'accueil' est absente, inactive ou injoignable.
//
// MODÈLE DU H1 (arbitrage du 27/08) : le titre est porté par DEUX clés distinctes,
// title et title_highlight, parce que le H1 est bicolore — la seconde moitié est
// rendue dans un <span className="text-wine-200">. Le <br /> et le <span> ne sont
// rendus QUE si title_highlight est non vide : Nicolas peut donc écrire un titre sur
// une seule ligne sans casser la mise en page. Surtout pas de convention « \n dans une
// clé unique » : elle serait invisible dans l'éditeur JSON du back-office.
const DEFAULT_CONTENT = {
  hero: {
    title: 'Des vins d\'exception',
    title_highlight: 'pour des moments uniques',
    subtitle: 'Découvrez notre sélection de vins français, choisis avec soin par Nicolas Froment. Chaque bouteille raconte une histoire.',
  },
};

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const reqIdRef = useRef(0);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [addedId, setAddedId] = useState(null);
  const [referrerName, setReferrerName] = useState(null);
  const [featured, setFeatured] = useState([]);
  // Carrousel mobile « Sélection du moment » (une slide à la fois) — desktop garde la grille sm:grid
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef(null);
  const slideRefs = useRef([]);
  const { addToCart, getReferralCode } = useCart();
  const toast = useToast();
  const addToCartHandled = useRef(false);
  const heroBg = useSiteImage('accueil_hero_fallback');
  const [content, setContent] = useState(DEFAULT_CONTENT);

  // Contenu CMS du header (H1 + sous-titre). Effet dédié, dépendances vides.
  useEffect(() => {
    api.get('/site-pages/accueil')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});
  }, []);

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

  const fetchProducts = async (pageToFetch) => {
    // Séquence : seule la réponse de la requête la plus récente est appliquée
    // (protège contre un changement de filtre survenu pendant un fetch en cours).
    const reqId = ++reqIdRef.current;
    if (pageToFetch === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = { page: pageToFetch };
      if (search) params.search = search;
      if (region) params.region = region;
      if (categoryId) params.category_id = categoryId;
      if (campaignId) params.campaign_id = campaignId;
      const { data } = await api.get('/public/catalog', { params });
      if (reqId !== reqIdRef.current) return; // réponse périmée → ignorée
      const items = data.data || [];
      // Page 1 (mount ou changement de filtre) → remplace ; pages suivantes → concatène.
      setProducts(prev => (pageToFetch === 1 ? items : [...prev, ...items]));
      setTotalPages(data.pagination?.pages || 1);
      setTotalCount(data.pagination?.total ?? items.length);
    } catch (err) {
      if (reqId === reqIdRef.current) console.error(err);
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    api.get('/public/filters').then(r => setFilters(r.data)).catch(console.error);
    featuredAPI.list().then(r => setFeatured(r.data.data || [])).catch(() => {});
  }, []);

  // Changement de filtre → on repart page 1 (la liste sera remplacée, pas concaténée).
  useEffect(() => { setPage(1); }, [search, region, categoryId, campaignId]);

  // Fetch sur changement de page OU de filtre.
  useEffect(() => { fetchProducts(page); }, [page, search, region, categoryId, campaignId]);

  // Sync swipe tactile → activeIndex via IntersectionObserver (la slide ≥50% visible devient active).
  // Garde flèches + points alignés sur la position réelle quand l'utilisateur swipe à la main.
  useEffect(() => {
    if (featured.length < 2 || !carouselRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = slideRefs.current.indexOf(entry.target);
            if (idx !== -1) setActiveIndex(idx);
          }
        });
      },
      { root: carouselRef.current, threshold: 0.5 }
    );
    slideRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [featured]);

  // Navigation programmatique (flèches / points) — borne l'index, scroll la slide cible en vue.
  const scrollToIndex = (i) => {
    const clamped = Math.max(0, Math.min(i, featured.length - 1));
    const el = slideRefs.current[clamped];
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    setActiveIndex(clamped);
  };

  return (
    <div>
      {/* Hero */}
      <section
        className={`relative text-white py-20 sm:py-28 ${heroBg?.image_url ? 'bg-wine-900' : 'bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900'}`}
        style={heroBg?.image_url ? { backgroundImage: `url(${heroBg.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {heroBg?.image_url && <div className="absolute inset-0 bg-black/45" aria-hidden="true" />}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
            <Wine size={16} /> Vins sélectionnés avec passion
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
            {content.hero.title}
            {content.hero.title_highlight && (
              <>
                <br />
                <span className="text-wine-200">{content.hero.title_highlight}</span>
              </>
            )}
          </h1>
          <p className="text-lg text-wine-200 max-w-2xl mx-auto mb-8">{content.hero.subtitle}</p>
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
          <div className="relative">
          <div ref={carouselRef} className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide sm:overflow-visible sm:pb-0 sm:grid sm:gap-6"
            style={{ gridTemplateColumns: `repeat(${Math.min(featured.length, 4)}, minmax(0, 1fr))` }}
          >
            {featured.map((p, i) => (
              <Link
                key={p.id}
                ref={(el) => (slideRefs.current[i] = el)}
                to={`/boutique/vin/${p.id}`}
                className="group relative bg-white border-2 border-yellow-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1 flex flex-col w-full flex-shrink-0 snap-start sm:min-w-0 sm:w-auto sm:flex-shrink"
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
                    {/* Badge 12+1 masqué sur la vitrine publique (demande Mathéo) — la mécanique 12+1 reste active côté back ; conservé en espace connecté */}
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
          {/* Flèches latérales — mobile only, non circulaires (désactivées aux bornes) */}
          {featured.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => scrollToIndex(activeIndex - 1)}
                disabled={activeIndex === 0}
                aria-label="Produit précédent"
                className="sm:hidden absolute left-1 top-1/2 -translate-y-1/2 z-20 grid place-items-center h-9 w-9 rounded-full bg-white/90 shadow-md border border-gray-200 text-gray-700 transition-opacity disabled:opacity-0 disabled:pointer-events-none"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={() => scrollToIndex(activeIndex + 1)}
                disabled={activeIndex === featured.length - 1}
                aria-label="Produit suivant"
                className="sm:hidden absolute right-1 top-1/2 -translate-y-1/2 z-20 grid place-items-center h-9 w-9 rounded-full bg-white/90 shadow-md border border-gray-200 text-gray-700 transition-opacity disabled:opacity-0 disabled:pointer-events-none"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
          </div>
          {/* Points indicateurs — mobile only, synchronisés avec activeIndex (tappables) */}
          {featured.length > 1 && (
            <div className="sm:hidden flex items-center justify-center gap-2 mt-3">
              {featured.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => scrollToIndex(i)}
                  aria-label={`Aller au produit ${i + 1}`}
                  aria-current={activeIndex === i}
                  className={`h-2 rounded-full transition-all ${activeIndex === i ? 'w-5 bg-wine-700' : 'w-2 bg-gray-300 hover:bg-gray-400'}`}
                />
              ))}
            </div>
          )}
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
                    {/* Badge 12+1 masqué sur la vitrine publique (demande Mathéo) — la mécanique 12+1 reste active côté back ; conservé en espace connecté */}
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

        {/* Charger plus — visible uniquement s'il reste des pages */}
        {!loading && page < totalPages && (
          <div className="flex flex-col items-center gap-2 mt-10">
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold border border-wine-200 text-wine-700 hover:bg-wine-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingMore ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-wine-700" />
                  Chargement…
                </>
              ) : (
                <>Charger plus de vins <ChevronRight size={18} /></>
              )}
            </button>
            <span className="text-xs text-gray-400">{products.length} sur {totalCount} vins</span>
          </div>
        )}
      </section>
    </div>
  );
}
