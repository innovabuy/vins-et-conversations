import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X } from 'lucide-react';

const stripePromise = import.meta.env.VITE_STRIPE_PUBLIC_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : null;

function CheckoutForm({ clientSecret, onSuccess, onError }) {
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
      <div className="border rounded-lg p-3 bg-gray-50">
        <CardElement options={{
          style: {
            base: { fontSize: '16px', color: '#374151', '::placeholder': { color: '#9CA3AF' } },
          },
        }} />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || loading}
        className="btn-primary w-full disabled:opacity-50"
      >
        {loading ? 'Traitement...' : 'Payer'}
      </button>
    </form>
  );
}

export default function PaymentModal({ isOpen, onClose, clientSecret, amount, onSuccess, onError }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Paiement par carte</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {amount && (
          <p className="text-2xl font-bold text-wine-700 mb-4">
            {parseFloat(amount).toFixed(2)} EUR
          </p>
        )}

        {stripePromise && clientSecret ? (
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutForm
              clientSecret={clientSecret}
              onSuccess={(pi) => { onSuccess?.(pi); onClose(); }}
              onError={onError}
            />
          </Elements>
        ) : (
          <p className="text-gray-500 text-sm">
            Stripe non configuré. Contactez l'administrateur.
          </p>
        )}
      </div>
    </div>
  );
}
