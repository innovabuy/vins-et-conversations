import { Link } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { ShoppingCart, Trash2, Plus, Minus, ArrowLeft, ArrowRight } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

export default function CartPage() {
  const { cart, updateQty, removeFromCart, loading } = useCart();

  if (cart.items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <ShoppingCart size={64} className="mx-auto text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Votre panier est vide</h2>
        <p className="text-gray-500 mb-6">Parcourez notre sélection de vins et ajoutez vos coups de coeur.</p>
        <Link to="/boutique" className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft size={16} /> Retour aux vins
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Mon panier</h1>

      <div className="space-y-4">
        {cart.items.map((item) => (
          <div key={item.product_id} className="flex items-center gap-4 p-4 bg-white border rounded-xl">
            <div className="flex-1">
              <h3 className="font-medium text-gray-900">{item.name}</h3>
              <p className="text-sm text-gray-500">{formatEur(item.price_ttc)} / bouteille</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateQty(item.product_id, item.qty - 1)}
                disabled={loading}
                className="p-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
              >
                <Minus size={14} />
              </button>
              <span className="w-8 text-center font-medium">{item.qty}</span>
              <button
                onClick={() => updateQty(item.product_id, item.qty + 1)}
                disabled={loading}
                className="p-1.5 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
              >
                <Plus size={14} />
              </button>
            </div>
            <span className="font-semibold text-wine-700 w-24 text-right">
              {formatEur(item.price_ttc * item.qty)}
            </span>
            <button
              onClick={() => removeFromCart(item.product_id)}
              disabled={loading}
              className="p-1.5 text-red-400 hover:text-red-600"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>{cart.total_items} article{cart.total_items > 1 ? 's' : ''}</span>
          <span>Total HT : {formatEur(cart.total_ht)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold text-gray-900">
          <span>Total TTC</span>
          <span className="text-wine-700">{formatEur(cart.total_ttc)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-between">
        <Link to="/boutique" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft size={16} /> Continuer mes achats
        </Link>
        <Link
          to="/boutique/commander"
          className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-3"
        >
          Commander <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
