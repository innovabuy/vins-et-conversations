import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Gift, ChevronRight, Wine, ShoppingCart } from 'lucide-react';
import api from '../../services/api';
import { useCart } from '../../contexts/CartContext';
import { useSiteImage } from '../../contexts/SiteImagesContext';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

export default function CoffretsVitrinePage() {
  const [content, setContent] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addedId, setAddedId] = useState(null);
  const { addToCart } = useCart();
  const heroBg = useSiteImage('coffrets_hero');

  useEffect(() => {
    api.get('/site-pages/coffrets')
      .then(({ data }) => { if (data.content_json) setContent(data.content_json); })
      .catch(() => {});

    api.get('/public/catalog', { params: { product_type: 'gift_set' } })
      .then(({ data }) => setProducts(data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const heroTitle = content?.hero?.title || 'Nos Coffrets — L\'art de l\'offrir';
  const heroSubtitle = content?.hero?.subtitle || 'Offrez une expérience gustative unique avec nos coffrets cadeaux soigneusement composés.';

  const handleAdd = (p) => {
    addToCart({ id: p.id, name: p.name, price_ttc: p.price_ttc });
    setAddedId(p.id);
    setTimeout(() => setAddedId(null), 1500);
  };

  return (
    <div>
      <section
        className={`relative text-white py-20 ${heroBg?.image_url ? 'bg-wine-900' : 'bg-gradient-to-br from-wine-800 via-wine-700 to-wine-900'}`}
        style={heroBg?.image_url ? { backgroundImage: `url(${heroBg.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {heroBg?.image_url && <div className="absolute inset-0 bg-black/50" aria-hidden="true" />}
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5 text-sm mb-6">
            <Gift size={16} /> Coffrets cadeaux
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6">{heroTitle}</h1>
          <p className="text-lg text-wine-200 max-w-2xl mx-auto">{heroSubtitle}</p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-16">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <Gift size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Aucun coffret disponible pour le moment.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((p) => (
              <div key={p.id} className="group bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1 flex flex-col">
                <Link to={`/boutique/vin/${p.id}`} className="block">
                  <div className="aspect-[3/4] overflow-hidden bg-gradient-to-br from-wine-50 to-amber-50 flex items-center justify-center">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-wine-300">
                        <Wine size={48} />
                        <span className="text-sm font-medium text-wine-400 text-center px-4">{p.name}</span>
                      </div>
                    )}
                  </div>
                </Link>
                <div className="p-4 flex-1 flex flex-col">
                  <Link to={`/boutique/vin/${p.id}`}>
                    <h3 className="font-semibold text-gray-900 group-hover:text-wine-700 transition-colors">{p.name}</h3>
                  </Link>
                  {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                  <div className="flex items-center justify-between mt-auto pt-4">
                    <span className="text-lg font-bold text-wine-700">{formatEur(p.price_ttc)}</span>
                    <button
                      onClick={() => handleAdd(p)}
                      className={`p-2 rounded-lg transition-colors ${addedId === p.id ? 'bg-green-100 text-green-700' : 'bg-wine-50 text-wine-700 hover:bg-wine-100'}`}
                    >
                      <ShoppingCart size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-center mt-12">
          <Link to="/boutique" className="inline-flex items-center gap-2 bg-wine-700 text-white px-8 py-3 rounded-xl font-semibold hover:bg-wine-800 transition-colors">
            Voir tout le catalogue <ChevronRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
