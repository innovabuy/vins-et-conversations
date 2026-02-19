import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wine, Star, ShoppingCart, Check, ChevronLeft } from 'lucide-react';
import { featuredAPI } from '../../services/api';
import { useCart } from '../../contexts/CartContext';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

export default function SelectionPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addedId, setAddedId] = useState(null);
  const { addToCart } = useCart();

  useEffect(() => {
    featuredAPI.list()
      .then((r) => setProducts(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Header */}
      <section className="bg-gradient-to-br from-yellow-50 via-wine-50 to-yellow-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-yellow-100 text-yellow-800 rounded-full px-4 py-1.5 text-sm font-medium mb-4">
            <Star size={16} className="fill-yellow-600" /> Coups de coeur
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            La S&eacute;lection du Moment
          </h1>
          <p className="text-gray-600 max-w-xl mx-auto">
            Nos coups de coeur du moment, s&eacute;lectionn&eacute;s par Nicolas pour leur qualit&eacute; exceptionnelle.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link to="/boutique" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-8">
          <ChevronLeft size={16} /> Retour aux vins
        </Link>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Star size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg">La s&eacute;lection sera bient&ocirc;t disponible</p>
            <Link to="/boutique" className="inline-block mt-4 text-wine-700 hover:text-wine-800 font-medium text-sm">
              D&eacute;couvrir tous nos vins
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((p) => (
              <Link
                key={p.id}
                to={`/boutique/vin/${p.id}`}
                className="group bg-white border-2 border-yellow-200 rounded-2xl overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1 flex flex-col h-full"
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-yellow-50 to-wine-50 flex items-center justify-center">
                  <div className="absolute top-3 right-3 z-10 bg-yellow-400 text-yellow-900 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
                    <Star size={12} className="fill-yellow-900" /> S&eacute;lection
                  </div>
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 text-wine-300">
                      <Wine size={48} />
                      <span className="text-sm font-medium text-wine-400 text-center px-4">{p.name}</span>
                    </div>
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    {p.category_details ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: p.category_details.color || '#666' }}>
                        {p.category_details.icon} {p.category_details.name}
                      </span>
                    ) : null}
                    {p.region && <span className="text-xs text-gray-400">{p.region}</span>}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-wine-700 transition-colors">{p.name}</h3>
                  {p.appellation && <p className="text-sm text-gray-500 mt-1">{p.appellation}</p>}
                  {p.description && <p className="text-sm text-gray-500 mt-2 leading-relaxed">{p.description}</p>}
                  <div className="flex items-center justify-between mt-auto pt-4">
                    <span className="text-xl font-bold text-wine-700">{formatEur(p.price_ttc)}</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        addToCart({ id: p.id, name: p.name, price_ttc: p.price_ttc });
                        setAddedId(p.id);
                        setTimeout(() => setAddedId(null), 1500);
                      }}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        addedId === p.id
                          ? 'bg-green-100 text-green-700'
                          : 'bg-wine-600 text-white hover:bg-wine-700'
                      }`}
                    >
                      {addedId === p.id ? <><Check size={16} /> Ajout&eacute;</> : <><ShoppingCart size={16} /> Ajouter</>}
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
