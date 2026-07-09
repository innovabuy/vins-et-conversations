import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, Package, ArrowRight, XCircle, AlertCircle } from 'lucide-react';
import { paypalAPI } from '../../services/api';

export default function ConfirmationPage() {
  const { ref } = useParams();
  const [searchParams] = useSearchParams();

  const isPaypalReturn = searchParams.get('paypal') === '1';
  const orderId = searchParams.get('order_id');
  const token = searchParams.get('token'); // = paypal_order_id, ajouté par PayPal au retour

  // Statut de capture. 'idle' = flux non-PayPal → confirmation affichée directement.
  // Retour PayPal : 'loading' dès le 1er rendu (pas de flash de confirmation), puis
  // 'success' ou 'error'. La confirmation n'est JAMAIS rendue sans capture réussie.
  const [captureStatus, setCaptureStatus] = useState(isPaypalReturn ? 'loading' : 'idle');

  useEffect(() => {
    if (!isPaypalReturn) return; // flux non-PayPal : rien à capturer

    // Retour PayPal anormal : order_id ou token manquant → échec (jamais succès)
    if (!orderId || !token) {
      setCaptureStatus('error');
      return;
    }

    let settled = false;
    const finish = (status) => {
      if (settled) return; // premier arrivé gagne : réponse OU timeout, jamais les deux
      settled = true;
      setCaptureStatus(status);
    };

    // Garde anti-blocage : axios n'a pas de timeout → sans ça, une socket suspendue
    // laisserait l'écran « Validation… » infini. Un timeout client est AMBIGU (le serveur
    // a peut-être capturé) → 'uncertain', pas 'error' (on n'invite pas à re-payer).
    const timer = setTimeout(() => finish('uncertain'), 30000);

    paypalAPI.captureOrder({ paypal_order_id: token, order_id: orderId })
      // Succès normal OU idempotent (page rechargée) : les deux renvoient success:true
      .then(({ data }) => finish(data?.success ? 'success' : 'error'))
      .catch((err) => {
        // Ambigu : le serveur a peut-être capturé avant de tomber (gateway 502/503/504)
        // ou aucune réponse reçue (réseau) → 'uncertain' (NE PAS inviter à re-payer :
        // un re-checkout créerait un nouvel order_id non couvert par l'idempotence).
        // Définitif : 400/403/404 (ORDER_MISMATCH, devise, incomplete) → 'error', retry sûr.
        const status = err.response?.status;
        if (!err.response || status === 502 || status === 503 || status === 504) {
          finish('uncertain');
        } else {
          finish('error');
        }
      });

    return () => { settled = true; clearTimeout(timer); };
  }, [isPaypalReturn, orderId, token]);

  // ── Capture PayPal en cours : ne jamais afficher la confirmation ──
  if (captureStatus === 'loading') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center justify-center mb-6">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-wine-700" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Validation de votre paiement…</h1>
        <p className="text-gray-600">
          Nous confirmons votre paiement PayPal. Merci de patienter, ne fermez pas cette page.
        </p>
      </div>
    );
  }

  // ── Capture PayPal échouée (ou retour anormal) : ne jamais afficher la confirmation ──
  if (captureStatus === 'error') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-6">
          <XCircle size={32} className="text-red-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Paiement non finalisé</h1>
        <p className="text-gray-600 mb-2">Votre paiement PayPal n'a pas pu être finalisé.</p>
        <p className="text-gray-500 text-sm mb-8">Votre panier est conservé — vous pouvez réessayer.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/boutique/panier" className="btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5">
            Retour au panier <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  // ── État ambigu (timeout client ou 502/503/504/réseau) : le paiement a PEUT-ÊTRE
  //    abouti. On ne montre ni « validée » ni « réessayez » — message prudent, aucun
  //    bouton de re-paiement (éviter un double débit via un nouveau checkout). ──
  if (captureStatus === 'uncertain') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-6">
          <AlertCircle size={32} className="text-amber-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Paiement en cours de vérification</h1>
        <p className="text-gray-600 mb-2">
          Nous n'avons pas pu confirmer l'état de votre paiement PayPal.{' '}
          <span className="font-semibold">Ne relancez pas le paiement.</span>
        </p>
        <p className="text-gray-500 text-sm mb-8">
          Vérifiez votre email de confirmation dans quelques minutes, ou suivez votre commande. En cas de doute, contactez-nous.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/boutique/suivi" className="btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5">
            Suivre ma commande <ArrowRight size={16} />
          </Link>
          <Link to="/boutique/contact" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border rounded-xl text-sm hover:bg-gray-50">
            Nous contacter
          </Link>
        </div>
      </div>
    );
  }

  // ── 'idle' (flux non-PayPal) ou 'success' (capture confirmée) : confirmation ──
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
        <CheckCircle size={32} className="text-green-600" />
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-3">Merci pour votre commande !</h1>
      <p className="text-gray-600 mb-2">
        Votre commande <span className="font-semibold text-wine-700">{ref}</span> a été confirmée.
      </p>
      <p className="text-gray-500 text-sm mb-8">
        Un email de confirmation vous a été envoyé. Vous serez informé lors de l'expédition.
      </p>

      <div className="bg-gray-50 rounded-xl p-6 mb-8 text-left">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Package size={18} /> Prochaines étapes
        </h3>
        <ol className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="bg-wine-100 text-wine-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mt-0.5">1</span>
            <span>Préparation de votre commande par notre équipe</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="bg-wine-100 text-wine-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mt-0.5">2</span>
            <span>Expédition et notification par email</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="bg-wine-100 text-wine-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mt-0.5">3</span>
            <span>Livraison à l'adresse indiquée</span>
          </li>
        </ol>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link to="/boutique/suivi" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border rounded-xl text-sm hover:bg-gray-50">
          Suivre ma commande
        </Link>
        <Link to="/boutique" className="btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5">
          Continuer mes achats <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
