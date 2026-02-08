import { useParams, Link } from 'react-router-dom';
import { CheckCircle, Package, ArrowRight } from 'lucide-react';

export default function ConfirmationPage() {
  const { ref } = useParams();

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
