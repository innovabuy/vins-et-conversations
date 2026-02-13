import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../../contexts/CartContext';
import { boutiqueAPI, shippingAPI } from '../../services/api';
import { ArrowLeft, Lock, ShoppingCart, Truck, Loader2 } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, getSessionId, getReferralCode, clearCart } = useCart();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', city: '', postal_code: '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [shipping, setShipping] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState('');

  // Fetch shipping when postal code is 5 digits
  useEffect(() => {
    if (!/^\d{5}$/.test(form.postal_code) || cart.total_items === 0) {
      setShipping(null);
      setShippingError('');
      return;
    }
    const deptCode = form.postal_code.substring(0, 2);
    setShippingLoading(true);
    setShippingError('');
    shippingAPI.calculate({ dept_code: deptCode, qty: cart.total_items })
      .then((res) => setShipping(res.data))
      .catch((err) => {
        setShipping(null);
        if (err.response?.data?.code === 'ZONE_NOT_FOUND') {
          setShippingError('Livraison non disponible pour votre département — contactez-nous');
        } else {
          setShippingError('Impossible de calculer les frais de livraison');
        }
      })
      .finally(() => setShippingLoading(false));
  }, [form.postal_code, cart.total_items]);

  const grandTotalTTC = cart.total_ttc + (shipping?.price_ttc || 0);

  if (cart.items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <ShoppingCart size={64} className="mx-auto text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Votre panier est vide</h2>
        <Link to="/boutique" className="btn-primary inline-flex items-center gap-2 mt-4">
          <ArrowLeft size={16} /> Retour aux vins
        </Link>
      </div>
    );
  }

  const validate = () => {
    const e = {};
    if (!form.name || form.name.length < 2) e.name = 'Nom requis (2 car. min)';
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email invalide';
    if (!form.address || form.address.length < 5) e.address = 'Adresse requise';
    if (!form.city || form.city.length < 2) e.city = 'Ville requise';
    if (!form.postal_code || !/^\d{5}$/.test(form.postal_code)) e.postal_code = 'Code postal (5 chiffres)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setOrderError('');

    try {
      const res = await boutiqueAPI.checkout({
        session_id: getSessionId(),
        customer: form,
        referral_code: getReferralCode() || undefined,
      });

      // If Stripe is configured, we'd integrate payment here.
      // For now, auto-confirm (simulates payment success)
      if (res.data.client_secret) {
        await boutiqueAPI.confirmCheckout({
          order_id: res.data.order_id,
          payment_intent_id: 'pi_demo_' + Date.now(),
        });
      } else {
        await boutiqueAPI.confirmCheckout({
          order_id: res.data.order_id,
          payment_intent_id: 'pi_demo_' + Date.now(),
        });
      }

      await clearCart();
      navigate(`/boutique/confirmation/${res.data.ref}`);
    } catch (err) {
      setOrderError(err.response?.data?.message || 'Erreur lors de la commande');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = (field) =>
    `w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wine-200 focus:border-wine-500 ${errors[field] ? 'border-red-300' : ''}`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/boutique/panier" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6">
        <ArrowLeft size={16} /> Retour au panier
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Commander</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-4">
          <h2 className="font-semibold text-gray-900">Vos coordonnées</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nom complet *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass('name')} />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass('email')} />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass('phone')} />
          </div>

          <h2 className="font-semibold text-gray-900 pt-2">Adresse de livraison</h2>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Adresse *</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass('address')} />
            {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ville *</label>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputClass('city')} />
              {errors.city && <p className="text-xs text-red-500 mt-1">{errors.city}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Code postal *</label>
              <input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className={inputClass('postal_code')} maxLength={5} />
              {errors.postal_code && <p className="text-xs text-red-500 mt-1">{errors.postal_code}</p>}
            </div>
          </div>

          {orderError && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{orderError}</div>
          )}

          <div className="pt-2">
            <p className="text-xs text-gray-500 mb-3">
              En passant commande, vous acceptez nos <Link to="/boutique/cgv" className="text-wine-700 hover:underline">CGV</Link> et notre politique de confidentialité.
            </p>
            <button
              type="submit"
              disabled={submitting || !!shippingError}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50"
            >
              <Lock size={16} />
              {submitting ? 'Traitement...' : `Payer ${formatEur(grandTotalTTC)}`}
            </button>
          </div>
        </form>

        {/* Recap */}
        <div className="lg:col-span-2">
          <div className="sticky top-24 bg-gray-50 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Récapitulatif</h3>
            <div className="divide-y">
              {cart.items.map((item) => (
                <div key={item.product_id} className="flex justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.qty} x {formatEur(item.price_ttc)}</p>
                  </div>
                  <span className="font-medium">{formatEur(item.price_ttc * item.qty)}</span>
                </div>
              ))}
            </div>

            {/* Sous-total produits */}
            <div className="border-t pt-3 flex justify-between text-sm">
              <span className="text-gray-600">Sous-total produits</span>
              <span className="font-medium">{formatEur(cart.total_ttc)}</span>
            </div>

            {/* Shipping */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 flex items-center gap-1">
                <Truck size={14} /> Livraison
              </span>
              {shippingLoading ? (
                <span className="text-gray-400 flex items-center gap-1">
                  <Loader2 size={14} className="animate-spin" /> Calcul...
                </span>
              ) : shippingError ? (
                <span className="text-red-500 text-xs">{shippingError}</span>
              ) : shipping ? (
                <span className="font-medium">{formatEur(shipping.price_ttc)}</span>
              ) : (
                <span className="text-gray-400 text-xs">Renseignez le code postal</span>
              )}
            </div>

            {/* Shipping breakdown */}
            {shipping && shipping.surcharges && (
              <div className="bg-white rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <div className="flex justify-between">
                  <span>{shipping.zone_name} ({shipping.pricing_type === 'forfait' ? 'forfait' : 'par colis'})</span>
                  <span>{formatEur(shipping.breakdown.base_price)}</span>
                </div>
                {shipping.surcharges.map((s, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{s.label}</span>
                    <span>+{formatEur(s.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-medium text-gray-700 pt-1 border-t">
                  <span>Transport HT</span>
                  <span>{formatEur(shipping.price_ht)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>TVA 20%</span>
                  <span>{formatEur(shipping.price_ttc - shipping.price_ht)}</span>
                </div>
              </div>
            )}

            {/* Grand total */}
            <div className="border-t pt-3 flex justify-between font-bold text-lg">
              <span>Total TTC</span>
              <span className="text-wine-700">{formatEur(grandTotalTTC)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
