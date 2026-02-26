import { Wine, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppSettings } from '../contexts/AppSettingsContext';

export default function InviteErrorPage() {
  const { app_logo_url, app_name } = useAppSettings();

  return (
    <div className="min-h-screen bg-gradient-to-br from-wine-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6">
          {app_logo_url ? (
            <img src={app_logo_url} alt={app_name} className="h-12 w-auto mx-auto mb-2" />
          ) : (
            <Wine size={40} className="text-wine-700 mx-auto mb-2" />
          )}
          <h1 className="text-2xl font-bold text-gray-900">{app_name || 'Vins & Conversations'}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <AlertTriangle size={48} className="text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Lien d'invitation invalide ou incomplet</h2>
          <p className="text-sm text-gray-600 mb-4">
            Le lien que vous avez utilisé semble tronqué. Contactez votre enseignant pour recevoir un nouveau lien d'invitation.
          </p>
          <Link to="/login" className="text-sm text-wine-700 hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}
