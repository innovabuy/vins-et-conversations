import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, AlertCircle, Loader2, ShieldAlert, Package, ArrowRight } from 'lucide-react';
import { useCart } from '../../contexts/CartContext';
import { cawlAPI } from '../../services/api';

/**
 * Page de retour CAWL — /boutique/retour-cawl
 *
 * CETTE PAGE NE BOOKE JAMAIS. Elle ne fait AUCUNE écriture : ni commande, ni paiement, ni
 * financial_events. Le booking est la responsabilité EXCLUSIVE du webhook (confirmCawlOrder).
 * Ici on LIT l'état, on ne le crée pas.
 *
 * Le webhook CAWL et le retour navigateur sont asynchrones et peuvent arriver dans N'IMPORTE
 * QUEL ORDRE. On sonde donc /cawl/return-status de façon bornée jusqu'à ce que la commande
 * passe en 'submitted' (preuve que le webhook a booké), sans jamais forcer la main.
 *
 * Le RETURNMAC n'est PAS vérifiable ici (le front ne connaît pas la valeur attendue) :
 * il est POSTé au serveur, qui le compare en temps constant à payments.metadata.returnmac.
 * 403 → RETURNMAC_MISMATCH → écran d'alerte, JAMAIS de confirmation.
 */

// Attente AVANT chaque sondage, en millisecondes (le 1er part immédiatement) : ~28 s au
// total en 9 appels. Chaque appel déclenche un GetHostedCheckoutStatus chez CAWL, on espace
// donc progressivement. Même budget que le timeout de capture PayPal (ConfirmationPage).
const POLL_SCHEDULE_MS = [0, 2000, 2000, 3000, 3000, 4000, 4000, 5000, 5000];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hors du composant : une définition inline serait recréée à chaque rendu et remonterait
// tout le sous-arbre à chaque changement d'état.
const Shell = ({ children }) => (
  <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">{children}</div>
);

export default function CawlReturnPage() {
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();

  // CAWL ajoute ses paramètres à notre returnUrl neutre. La casse exacte (RETURNMAC en
  // majuscules) n'est pas garantie contractuellement : on lit de façon insensible à la casse.
  // Le backend tolère déjà un hostedCheckoutId absent — le RETURNMAC seul reste la garde.
  const orderId = searchParams.get('order_id');
  const returnmac = searchParams.get('RETURNMAC') || searchParams.get('returnmac');
  const hostedCheckoutId = searchParams.get('hostedCheckoutId')
    || searchParams.get('hostedcheckoutid')
    || searchParams.get('hostedCheckoutID');

  // idle n'existe pas : on arrive toujours en 'loading', jamais de flash de confirmation.
  const [state, setState] = useState('loading');
  const [orderRef, setOrderRef] = useState(null);
  const cartClearedRef = useRef(false);

  useEffect(() => {
    // Retour incomplet → jamais un succès. On n'invente rien depuis l'URL.
    if (!orderId || !returnmac) {
      setState('invalid');
      return;
    }

    let cancelled = false;

    const finish = (next, ref) => {
      if (cancelled) return;
      if (ref) setOrderRef(ref);
      setState(next);
    };

    (async () => {
      let sawCapture = false; // statusCode de capture vu au moins une fois
      let sawCancel = false;  // session annulée côté CAWL

      for (let i = 0; i < POLL_SCHEDULE_MS.length; i += 1) {
        if (POLL_SCHEDULE_MS[i] > 0) await sleep(POLL_SCHEDULE_MS[i]);
        if (cancelled) return;

        try {
          const { data } = await cawlAPI.returnStatus({
            order_id: orderId,
            hostedCheckoutId: hostedCheckoutId || undefined,
            returnmac,
          });

          if (data?.order_ref && !cancelled) setOrderRef(data.order_ref);

          // Le webhook est passé : la commande est bookée. Seul état qui vaut confirmation.
          if (data?.order_status === 'submitted') {
            if (!cartClearedRef.current) {
              cartClearedRef.current = true;
              clearCart().catch(() => {}); // purement client — n'affecte aucun état financier
            }
            finish('success', data.order_ref);
            return;
          }

          if (data?.statusCode === 9) sawCapture = true;
          if (typeof data?.status === 'string' && /CANCELLED/i.test(data.status)) sawCancel = true;

          // Annulation explicite ET aucun encaissement observé → échec net, retry sûr.
          if (sawCancel && !sawCapture) {
            finish('cancelled', data?.order_ref);
            return;
          }
        } catch (err) {
          const httpStatus = err.response?.status;
          const code = err.response?.data?.error;

          // RETURNMAC forgé : terminal, aucune reprise, aucune confirmation.
          if (httpStatus === 403 || code === 'RETURNMAC_MISMATCH') {
            finish('forged');
            return;
          }
          // Aucune session CAWL pour cette commande : le retour ne correspond à rien.
          if (httpStatus === 404) {
            finish('invalid');
            return;
          }
          // 5xx, 503 CAWL_NOT_CONFIGURED, réseau : AMBIGU. On retente, puis 'uncertain'.
          // On ne bascule jamais en 'cancelled' sur une erreur technique.
        }
      }

      if (cancelled) return;
      // Budget épuisé. Encaissement constaté mais webhook pas encore arrivé → attente, pas
      // un échec. Sinon 'uncertain' : on n'affirme rien et on N'INVITE PAS à re-payer
      // (un nouveau checkout créerait un order_id hors idempotence — leçon PayPal).
      finish(sawCapture ? 'pending' : 'uncertain');
    })();

    return () => { cancelled = true; };
    // clearCart est stable (useCallback) ; la sonde ne doit pas redémarrer à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, returnmac, hostedCheckoutId]);

  if (state === 'loading') {
    return (
      <Shell>
        <Loader2 size={48} className="mx-auto text-wine-700 animate-spin" />
        <h1 className="mt-6 text-2xl font-semibold text-gray-900">Vérification du paiement…</h1>
        <p className="mt-2 text-gray-500">
          Merci de patienter, ne fermez pas cette page.
        </p>
      </Shell>
    );
  }

  if (state === 'success') {
    return (
      <Shell>
        <CheckCircle size={56} className="mx-auto text-green-600" />
        <h1 className="mt-6 text-2xl font-semibold text-gray-900">Paiement confirmé</h1>
        <p className="mt-2 text-gray-600">
          Votre commande {orderRef ? <strong>{orderRef}</strong> : null} est enregistrée. Un email de confirmation vous a été envoyé.
        </p>
        {orderRef && (
          <Link
            to={`/boutique/confirmation/${orderRef}`}
            className="btn-primary mt-8 inline-flex items-center gap-2 px-6 py-3"
          >
            Voir ma commande <ArrowRight size={16} />
          </Link>
        )}
        <div className="mt-4">
          <Link to="/boutique" className="text-sm text-wine-700 hover:underline">Retour à la boutique</Link>
        </div>
      </Shell>
    );
  }

  if (state === 'pending') {
    return (
      <Shell>
        <Package size={56} className="mx-auto text-wine-700" />
        <h1 className="mt-6 text-2xl font-semibold text-gray-900">Paiement accepté, finalisation en cours</h1>
        <p className="mt-2 text-gray-600">
          Votre banque a accepté le paiement. L'enregistrement définitif de la commande
          {orderRef ? <> <strong>{orderRef}</strong></> : null} se termine, cela peut prendre quelques instants.
          <strong> Ne payez pas une seconde fois.</strong>
        </p>
        <button onClick={() => window.location.reload()} className="btn-primary mt-8 px-6 py-3">
          Actualiser
        </button>
        <div className="mt-4">
          <Link to="/boutique/suivi" className="text-sm text-wine-700 hover:underline">Suivre ma commande</Link>
        </div>
      </Shell>
    );
  }

  if (state === 'cancelled') {
    return (
      <Shell>
        <XCircle size={56} className="mx-auto text-red-500" />
        <h1 className="mt-6 text-2xl font-semibold text-gray-900">Paiement non abouti</h1>
        <p className="mt-2 text-gray-600">
          Le paiement a été annulé ou refusé. <strong>Aucun montant n'a été débité.</strong>
          {orderRef ? <> Votre commande <strong>{orderRef}</strong> est toujours en attente de règlement.</> : null}
        </p>
        <Link to="/boutique/panier" className="btn-primary mt-8 inline-flex items-center gap-2 px-6 py-3">
          Reprendre ma commande
        </Link>
        <div className="mt-4">
          <Link to="/boutique" className="text-sm text-wine-700 hover:underline">Retour à la boutique</Link>
        </div>
      </Shell>
    );
  }

  if (state === 'forged') {
    return (
      <Shell>
        <ShieldAlert size={56} className="mx-auto text-red-600" />
        <h1 className="mt-6 text-2xl font-semibold text-gray-900">Retour de paiement non vérifiable</h1>
        <p className="mt-2 text-gray-600">
          Ce lien de retour n'a pas pu être authentifié. Aucune confirmation ne peut être affichée.
          Si vous avez été débité, contactez-nous avec votre référence de commande — nous vérifierons.
        </p>
        <Link to="/boutique/contact" className="btn-primary mt-8 inline-flex items-center gap-2 px-6 py-3">
          Nous contacter
        </Link>
      </Shell>
    );
  }

  if (state === 'invalid') {
    return (
      <Shell>
        <AlertCircle size={56} className="mx-auto text-amber-500" />
        <h1 className="mt-6 text-2xl font-semibold text-gray-900">Retour de paiement incomplet</h1>
        <p className="mt-2 text-gray-600">
          Les informations de retour sont incomplètes ou ne correspondent à aucune session de paiement.
          Si vous avez été débité, contactez-nous — nous vérifierons avant tout nouveau règlement.
        </p>
        <Link to="/boutique/contact" className="btn-primary mt-8 inline-flex items-center gap-2 px-6 py-3">
          Nous contacter
        </Link>
      </Shell>
    );
  }

  // 'uncertain' — on n'affirme NI succès NI échec, et on n'invite pas à re-payer.
  return (
    <Shell>
      <AlertCircle size={56} className="mx-auto text-amber-500" />
      <h1 className="mt-6 text-2xl font-semibold text-gray-900">Confirmation en attente</h1>
      <p className="mt-2 text-gray-600">
        Nous n'avons pas encore reçu la confirmation de votre banque pour la commande
        {orderRef ? <> <strong>{orderRef}</strong></> : null}. Cela peut prendre quelques minutes.
        <strong> Ne relancez pas le paiement</strong> : si le règlement est passé, il sera pris en compte
        automatiquement et vous recevrez un email.
      </p>
      <button onClick={() => window.location.reload()} className="btn-primary mt-8 px-6 py-3">
        Actualiser
      </button>
      <div className="mt-4 space-x-4">
        <Link to="/boutique/suivi" className="text-sm text-wine-700 hover:underline">Suivre ma commande</Link>
        <Link to="/boutique/contact" className="text-sm text-wine-700 hover:underline">Nous contacter</Link>
      </div>
    </Shell>
  );
}
