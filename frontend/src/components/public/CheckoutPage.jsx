import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { boutiqueAPI, shippingAPI, authAPI, appSettingsAPI, paypalAPI, promoCodesAPI } from '../../services/api';
import { ArrowLeft, Lock, ShoppingCart, Truck, Loader2, User, MapPin, CreditCard, Check, LogIn, UserPlus, UserX, Store, Wallet, Building2, Tag, X } from 'lucide-react';

const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

// Dynamic Stripe promise
let cachedStripePromise = null;
function getStripePromise() {
  if (cachedStripePromise) return cachedStripePromise;
  cachedStripePromise = appSettingsAPI.stripePublicKey()
    .then((res) => {
      const key = res.data.publishable_key;
      if (key && !key.includes('placeholder') && key.length > 10) return loadStripe(key);
      const envKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
      return envKey ? loadStripe(envKey) : null;
    })
    .catch(() => {
      const envKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
      return envKey ? loadStripe(envKey) : null;
    });
  return cachedStripePromise;
}

// Inline payment form
function InlinePaymentForm({ clientSecret, amount, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);
    try {
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) },
      });
      if (result.error) {
        setError(result.error.message);
        onError?.(result.error.message);
      } else if (result.paymentIntent.status === 'succeeded') {
        onSuccess?.(result.paymentIntent);
      }
    } catch (err) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border rounded-lg p-4 bg-gray-50">
        <CardElement options={{
          style: { base: { fontSize: '16px', color: '#374151', '::placeholder': { color: '#9CA3AF' } } },
        }} />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50"
      >
        <Lock size={16} />
        {loading ? 'Traitement...' : `Payer ${formatEur(amount)}`}
      </button>
    </form>
  );
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, getSessionId, getReferralCode, clearCart, mergeCartOnLogin } = useCart();
  const { user, login, setUserData } = useAuth();
  const [step, setStep] = useState(1);
  const [identMode, setIdentMode] = useState('guest'); // guest | login | register
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '', city: '', postal_code: '',
  });
  const [deliveryType, setDeliveryType] = useState('home_delivery');
  const { settings } = useAppSettings();
  const pickupEnabled = settings?.pickup_enabled === 'true';
  const pickupAddress = settings?.pickup_address || "Saint-Sylvain-d'Anjou — Maine-et-Loire (49)";
  const pickupDetails = settings?.pickup_details || 'Sur rendez-vous, du lundi au vendredi de 9h a 18h';
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', phone: '', age_verified: false, cgv_accepted: false });
  const [errors, setErrors] = useState({});
  const [authError, setAuthError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [shipping, setShipping] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState('');
  const [orderData, setOrderData] = useState(null); // { order_id, ref, total_ttc, client_secret }
  const [stripeObj, setStripeObj] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('stripe');
  const [promoInput, setPromoInput] = useState('');
  const [promoResult, setPromoResult] = useState(null); // { valid, promo_code_id, discount_amount, ... }
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

  // Load Stripe
  useEffect(() => {
    getStripePromise().then(setStripeObj);
  }, []);

  // Pre-fill from logged-in user
  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        name: prev.name || user.name || '',
        email: prev.email || user.email || '',
      }));
      setStep(2); // Skip identification if logged in
    }
  }, [user]);

  // Fetch shipping when postal code is 5 digits (not for click & collect)
  useEffect(() => {
    if (deliveryType === 'click_and_collect') {
      setShipping(null);
      setShippingError('');
      return;
    }
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
          setShippingError('Livraison non disponible pour votre departement');
        } else {
          setShippingError('Impossible de calculer les frais de livraison');
        }
      })
      .finally(() => setShippingLoading(false));
  }, [form.postal_code, cart.total_items, deliveryType]);

  const grandTotalTTC = cart.total_ttc + (deliveryType === 'click_and_collect' ? 0 : (shipping?.price_ttc || 0)) - (promoResult?.discount_amount || 0);

  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoError('');
    setPromoResult(null);
    try {
      const orderTotal = cart.total_ttc + (deliveryType === 'click_and_collect' ? 0 : (shipping?.price_ttc || 0));
      const { data } = await promoCodesAPI.validate({ code: promoInput.trim(), order_total_ttc: orderTotal });
      if (data.valid) {
        setPromoResult(data);
      } else {
        setPromoError(data.message || 'Code promo invalide');
      }
    } catch {
      setPromoError('Erreur lors de la validation du code');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoResult(null);
    setPromoError('');
    setPromoInput('');
  };

  if (cart.items.length === 0 && !orderData) {
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

  const inputClass = (field) =>
    `w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-wine-200 focus:border-wine-500 ${errors[field] ? 'border-red-300' : ''}`;

  // Step 1: Identification
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setSubmitting(true);
    try {
      const u = await login(loginForm.email, loginForm.password);
      setForm((prev) => ({ ...prev, name: u.name, email: u.email }));
      await mergeCartOnLogin();
      setStep(2);
    } catch (err) {
      setAuthError(err.response?.data?.message || 'Identifiants incorrects');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    const errs = {};
    if (!registerForm.name || registerForm.name.length < 2) errs.reg_name = 'Nom requis';
    if (!registerForm.email) errs.reg_email = 'Email requis';
    if (!registerForm.password || registerForm.password.length < 8) errs.reg_password = '8 caracteres minimum';
    if (!registerForm.age_verified) errs.reg_age = 'Verification requise';
    if (!registerForm.cgv_accepted) errs.reg_cgv = 'Acceptation requise';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const { data } = await authAPI.registerCustomer(registerForm);
      setUserData(data.user, data.accessToken);
      setForm((prev) => ({ ...prev, name: data.user.name, email: data.user.email }));
      await mergeCartOnLogin();
      setStep(2);
    } catch (err) {
      setAuthError(err.response?.data?.message || 'Erreur lors de l\'inscription');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuestContinue = () => {
    const errs = {};
    if (!form.name || form.name.length < 2) errs.name = 'Nom requis';
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Email invalide';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setStep(2);
  };

  // Step 2: Address validation + create order
  const validateAddress = () => {
    if (deliveryType === 'click_and_collect') return true; // No address needed
    const e = {};
    if (!form.address || form.address.length < 5) e.address = 'Adresse requise';
    if (!form.city || form.city.length < 2) e.city = 'Ville requise';
    if (!form.postal_code || !/^\d{5}$/.test(form.postal_code)) e.postal_code = 'Code postal (5 chiffres)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreateOrder = async () => {
    if (!validateAddress()) return;
    setSubmitting(true);
    setOrderError('');
    try {
      const res = await boutiqueAPI.checkout({
        session_id: getSessionId(),
        delivery_type: deliveryType,
        customer: deliveryType === 'click_and_collect' ? { name: form.name, email: form.email, phone: form.phone } : form,
        referral_code: getReferralCode() || undefined,
        promo_code: promoResult?.valid ? promoInput.trim() : undefined,
      });
      setOrderData(res.data);
      // Backorder: skip payment, go to confirmation directly
      if (res.data.backorder) {
        await clearCart();
        navigate(`/boutique/confirmation/${res.data.ref}?backorder=1`);
        return;
      }
      setStep(3);
    } catch (err) {
      setOrderError(err.response?.data?.message || 'Erreur lors de la commande');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 3: Payment success
  const handlePaymentSuccess = async (paymentIntent) => {
    try {
      await boutiqueAPI.confirmCheckout({
        order_id: orderData.order_id,
        payment_intent_id: paymentIntent.id,
      });
      await clearCart();
      navigate(`/boutique/confirmation/${orderData.ref}`);
    } catch (err) {
      setOrderError(err.response?.data?.message || 'Erreur de confirmation');
    }
  };

  // If no Stripe, fall back to demo flow
  const handleDemoPayment = async () => {
    setSubmitting(true);
    try {
      await boutiqueAPI.confirmCheckout({
        order_id: orderData.order_id,
        payment_intent_id: 'pi_demo_' + Date.now(),
      });
      await clearCart();
      navigate(`/boutique/confirmation/${orderData.ref}`);
    } catch (err) {
      setOrderError(err.response?.data?.message || 'Erreur de confirmation');
    } finally {
      setSubmitting(false);
    }
  };

  // PayPal flow: create order on backend, redirect to PayPal approval URL
  const handlePayPalPayment = async () => {
    setSubmitting(true);
    setOrderError('');
    try {
      const { data } = await paypalAPI.createOrder({ order_id: orderData.order_id });
      if (data.approval_url) {
        window.location.href = data.approval_url;
      } else {
        setOrderError('URL d\'approbation PayPal introuvable');
      }
    } catch (err) {
      setOrderError(err.response?.data?.message || 'Erreur PayPal');
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { num: 1, label: 'Identification', icon: User },
    { num: 2, label: 'Adresse', icon: MapPin },
    { num: 3, label: 'Paiement', icon: CreditCard },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/boutique/panier" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6">
        <ArrowLeft size={16} /> Retour au panier
      </Link>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              step >= s.num ? 'bg-wine-100 text-wine-700' : 'bg-gray-100 text-gray-400'
            }`}>
              {step > s.num ? <Check size={14} /> : <s.icon size={14} />}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className={`w-8 h-0.5 mx-1 ${step > s.num ? 'bg-wine-300' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Main content */}
        <div className="lg:col-span-3 space-y-4">
          {/* ═══ STEP 1: IDENTIFICATION ═══ */}
          {step === 1 && (
            <div>
              <h2 className="font-semibold text-gray-900 mb-4">Identification</h2>

              {/* Mode tabs */}
              <div className="flex gap-2 mb-6">
                {[
                  { id: 'login', label: 'Se connecter', icon: LogIn },
                  { id: 'register', label: 'Creer un compte', icon: UserPlus },
                  { id: 'guest', label: 'Invite', icon: UserX },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setIdentMode(m.id); setErrors({}); setAuthError(''); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      identMode === m.id ? 'bg-wine-100 text-wine-700 ring-1 ring-wine-300' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <m.icon size={14} />
                    {m.label}
                  </button>
                ))}
              </div>

              {authError && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">{authError}</div>}

              {identMode === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                    <input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} className={inputClass()} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Mot de passe</label>
                    <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} className={inputClass()} />
                  </div>
                  <button type="submit" disabled={submitting} className="btn-primary w-full py-2.5 disabled:opacity-50">
                    {submitting ? 'Connexion...' : 'Se connecter'}
                  </button>
                </form>
              )}

              {identMode === 'register' && (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Nom *</label>
                      <input value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} className={inputClass('reg_name')} />
                      {errors.reg_name && <p className="text-xs text-red-500 mt-1">{errors.reg_name}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                      <input type="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} className={inputClass('reg_email')} />
                      {errors.reg_email && <p className="text-xs text-red-500 mt-1">{errors.reg_email}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Mot de passe *</label>
                      <input type="password" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} className={inputClass('reg_password')} />
                      {errors.reg_password && <p className="text-xs text-red-500 mt-1">{errors.reg_password}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Telephone</label>
                      <input value={registerForm.phone} onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} className={inputClass()} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={registerForm.age_verified} onChange={(e) => setRegisterForm({ ...registerForm, age_verified: e.target.checked })} className="rounded" />
                      Je certifie avoir plus de 18 ans *
                    </label>
                    {errors.reg_age && <p className="text-xs text-red-500">{errors.reg_age}</p>}
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={registerForm.cgv_accepted} onChange={(e) => setRegisterForm({ ...registerForm, cgv_accepted: e.target.checked })} className="rounded" />
                      J'accepte les CGV *
                    </label>
                    {errors.reg_cgv && <p className="text-xs text-red-500">{errors.reg_cgv}</p>}
                  </div>
                  <button type="submit" disabled={submitting} className="btn-primary w-full py-2.5 disabled:opacity-50">
                    {submitting ? 'Inscription...' : 'Creer mon compte'}
                  </button>
                </form>
              )}

              {identMode === 'guest' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Nom *</label>
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
                    <label className="block text-xs font-medium text-gray-500 mb-1">Telephone</label>
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass()} />
                  </div>
                  <button onClick={handleGuestContinue} className="btn-primary w-full py-2.5">
                    Continuer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 2: DELIVERY + ADDRESS ═══ */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Mode de livraison</h2>
                <button onClick={() => setStep(1)} className="text-sm text-wine-700 hover:underline">Modifier identification</button>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <User size={14} className="inline mr-1" /> {form.name} ({form.email})
              </div>

              {/* Delivery type selection */}
              <div className="space-y-2">
                <button
                  onClick={() => setDeliveryType('home_delivery')}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    deliveryType === 'home_delivery' ? 'border-wine-600 bg-wine-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Truck size={20} className={deliveryType === 'home_delivery' ? 'text-wine-700 mt-0.5' : 'text-gray-400 mt-0.5'} />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Livraison a domicile</p>
                    <p className="text-xs text-gray-500">Frais de port calcules selon votre departement</p>
                  </div>
                  {shipping && deliveryType === 'home_delivery' && (
                    <span className="text-sm font-semibold text-wine-700">{formatEur(shipping.price_ttc)}</span>
                  )}
                </button>

                {pickupEnabled && (
                  <button
                    onClick={() => setDeliveryType('click_and_collect')}
                    className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                      deliveryType === 'click_and_collect' ? 'border-wine-600 bg-wine-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Store size={20} className={deliveryType === 'click_and_collect' ? 'text-wine-700 mt-0.5' : 'text-gray-400 mt-0.5'} />
                    <div className="flex-1">
                      <p className="font-medium text-sm">Retrait sur place — <span className="text-green-600">Gratuit</span></p>
                      <p className="text-xs text-gray-500">{pickupAddress}</p>
                      <p className="text-xs text-gray-400">{pickupDetails}</p>
                    </div>
                    <span className="text-sm font-semibold text-green-600">0,00 EUR</span>
                  </button>
                )}
              </div>

              {/* Address form — only for home delivery */}
              {deliveryType === 'home_delivery' && (
                <>
                  <h3 className="font-medium text-sm text-gray-700 mt-2">Adresse de livraison</h3>
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
                </>
              )}

              {/* Click & Collect info */}
              {deliveryType === 'click_and_collect' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-green-800">Retrait sur place</p>
                  <p className="text-sm text-green-700 mt-1">{pickupAddress}</p>
                  <p className="text-xs text-green-600 mt-1">{pickupDetails}</p>
                </div>
              )}

              {orderError && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{orderError}</div>}

              <button
                onClick={handleCreateOrder}
                disabled={submitting || !!shippingError}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                {submitting ? 'Creation de la commande...' : 'Passer au paiement'}
              </button>
            </div>
          )}

          {/* ═══ STEP 3: PAYMENT ═══ */}
          {step === 3 && orderData && (
            <div className="space-y-4">
              <h2 className="font-semibold text-gray-900">Paiement</h2>

              <div className="bg-green-50 rounded-lg p-3 text-sm text-green-700">
                Commande {orderData.ref} creee. Finalisez le paiement ci-dessous.
              </div>

              {orderError && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{orderError}</div>}

              {/* Payment method selector */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Mode de paiement</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => setPaymentMethod('stripe')}
                    disabled={!stripeObj || !orderData.client_secret}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                      paymentMethod === 'stripe' ? 'border-wine-600 bg-wine-50' : 'border-gray-200 hover:border-gray-300'
                    } ${!stripeObj || !orderData.client_secret ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <CreditCard size={20} className={paymentMethod === 'stripe' ? 'text-wine-700' : 'text-gray-400'} />
                    <div>
                      <p className="font-medium text-sm">Carte bancaire</p>
                      <p className="text-xs text-gray-500">Via Stripe</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setPaymentMethod('paypal')}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                      paymentMethod === 'paypal' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Wallet size={20} className={paymentMethod === 'paypal' ? 'text-blue-600' : 'text-gray-400'} />
                    <div>
                      <p className="font-medium text-sm">PayPal</p>
                      <p className="text-xs text-gray-500">Paiement securise</p>
                    </div>
                  </button>

                  {user?.role === 'cse' && (
                    <button
                      onClick={() => setPaymentMethod('transfer')}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                        paymentMethod === 'transfer' ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Building2 size={20} className={paymentMethod === 'transfer' ? 'text-green-600' : 'text-gray-400'} />
                      <div>
                        <p className="font-medium text-sm">Virement 30 jours</p>
                        <p className="text-xs text-gray-500">Reservé CSE</p>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Stripe payment form */}
              {paymentMethod === 'stripe' && stripeObj && orderData.client_secret && (
                <Elements stripe={stripeObj} options={{ clientSecret: orderData.client_secret }}>
                  <InlinePaymentForm
                    clientSecret={orderData.client_secret}
                    amount={orderData.total_ttc}
                    onSuccess={handlePaymentSuccess}
                    onError={(msg) => setOrderError(msg)}
                  />
                </Elements>
              )}

              {/* PayPal payment */}
              {paymentMethod === 'paypal' && (
                <div className="space-y-3">
                  <button
                    onClick={handlePayPalPayment}
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium text-white bg-[#0070ba] hover:bg-[#005ea6] disabled:opacity-50 transition-colors"
                  >
                    <Wallet size={16} />
                    {submitting ? 'Redirection vers PayPal...' : `Payer ${formatEur(orderData.total_ttc)} avec PayPal`}
                  </button>
                  <p className="text-xs text-gray-400 text-center">
                    Vous serez redirigé vers PayPal pour finaliser le paiement.
                  </p>
                </div>
              )}

              {/* CSE transfer */}
              {paymentMethod === 'transfer' && (
                <div className="space-y-3">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                    Votre commande sera validée avec un delai de paiement de 30 jours par virement.
                  </div>
                  <button
                    onClick={handleDemoPayment}
                    disabled={submitting}
                    className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50"
                  >
                    <Building2 size={16} />
                    {submitting ? 'Confirmation...' : `Confirmer ${formatEur(orderData.total_ttc)}`}
                  </button>
                </div>
              )}

              {/* Fallback when no stripe and no payment method selected */}
              {paymentMethod === 'stripe' && (!stripeObj || !orderData.client_secret) && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">Stripe non configure. Selectionnez PayPal ou un autre mode de paiement.</p>
                </div>
              )}

              <p className="text-xs text-gray-400 text-center">
                Paiement securise. {paymentMethod === 'stripe' && 'Carte de test : 4242 4242 4242 4242'}
              </p>
            </div>
          )}
        </div>

        {/* Recap sidebar */}
        <div className="lg:col-span-2">
          <div className="sticky top-24 bg-gray-50 rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Recapitulatif</h3>
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

            <div className="border-t pt-3 flex justify-between text-sm">
              <span className="text-gray-600">Sous-total</span>
              <span className="font-medium">{formatEur(cart.total_ttc)}</span>
            </div>

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

            {/* Promo code input */}
            {step < 3 && (
              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-1"><Tag size={14} /> Code promo</p>
                {promoResult ? (
                  <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm font-medium text-green-700">{promoInput.toUpperCase()}</span>
                      <span className="text-sm text-green-600 ml-2">-{formatEur(promoResult.discount_amount)}</span>
                    </div>
                    <button onClick={handleRemovePromo} className="text-green-600 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                      placeholder="BIENVENUE10"
                      className="flex-1 border rounded-lg px-3 py-1.5 text-sm uppercase outline-none focus:ring-2 focus:ring-wine-200 focus:border-wine-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                    />
                    <button
                      onClick={handleApplyPromo}
                      disabled={promoLoading || !promoInput.trim()}
                      className="px-3 py-1.5 bg-wine-700 text-white text-sm rounded-lg hover:bg-wine-800 disabled:opacity-50"
                    >
                      {promoLoading ? <Loader2 size={14} className="animate-spin" /> : 'OK'}
                    </button>
                  </div>
                )}
                {promoError && <p className="text-xs text-red-500">{promoError}</p>}
              </div>
            )}

            {promoResult && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Remise ({promoResult.type === 'percentage' ? `${promoResult.value}%` : 'fixe'})</span>
                <span className="font-medium">-{formatEur(promoResult.discount_amount)}</span>
              </div>
            )}

            {shipping && shipping.surcharges && (
              <div className="bg-white rounded-lg p-3 text-xs text-gray-500 space-y-1">
                <div className="flex justify-between">
                  <span>{shipping.zone_name} — {shipping.qty_bottles} bout. ({shipping.qty_colis} colis)</span>
                  <span>{formatEur(shipping.breakdown.base_price)}</span>
                </div>
                {shipping.surcharges.map((s, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{s.label}</span>
                    <span>+{formatEur(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}

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
