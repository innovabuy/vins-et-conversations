import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Wine, CheckCircle } from 'lucide-react';
import { useAppSettings } from '../contexts/AppSettingsContext';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

export default function JoinCampaignPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { setUserData } = useAuth();
  const { app_logo_url, app_name } = useAppSettings();

  const [campaign, setCampaign] = useState(null);
  const [campaignLoading, setCampaignLoading] = useState(true);
  const [campaignError, setCampaignError] = useState('');
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '', class_group: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/public/campaigns/${campaignId}/info`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Campagne introuvable');
        return res.json();
      })
      .then(setCampaign)
      .catch((err) => setCampaignError(err.message))
      .finally(() => setCampaignLoading(false));
  }, [campaignId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/public/campaigns/${campaignId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Erreur lors de l\'inscription');
        return;
      }
      if (data.accessToken) {
        setUserData(data.user, data.accessToken);
        setSuccess(data);
      } else {
        setSuccess(data);
      }
    } catch {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  if (campaignLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" />
      </div>
    );
  }

  if (campaignError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <Wine size={48} className="mx-auto text-gray-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Campagne introuvable</h1>
          <p className="text-gray-500">Ce lien d'inscription n'est plus valide ou la campagne n'existe pas.</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Bienvenue ! Vous êtes inscrit(e)</h1>
          <p className="text-gray-500 mb-6">
            Campagne : <span className="font-medium text-gray-700">{success.campaign_name || campaign.name}</span>
          </p>
          {success.accessToken ? (
            <button
              onClick={() => {
                const role = success.user?.role;
                const dest = role === 'cse' ? '/cse' :
                  role === 'ambassadeur' ? '/ambassador' :
                  role === 'enseignant' ? '/teacher' :
                  role === 'etudiant' ? '/student' :
                  '/login';
                navigate(dest);
              }}
              className="w-full py-3 bg-wine-700 text-white rounded-xl font-medium hover:bg-wine-800 transition-colors"
            >
              Accéder à mon espace
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 bg-wine-700 text-white rounded-xl font-medium hover:bg-wine-800 transition-colors"
            >
              Se connecter
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {app_logo_url ? (
            <img src={app_logo_url} alt={app_name} className="h-12 mx-auto mb-4" />
          ) : (
            <Wine size={40} className="mx-auto text-wine-700 mb-4" />
          )}
          <h1 className="text-2xl font-bold text-gray-900">Rejoindre la campagne</h1>
          <p className="text-lg font-medium text-wine-700 mt-1">{campaign.brand_name || campaign.name}</p>
          {campaign.org_name && <p className="text-sm text-gray-500 mt-1">{campaign.org_name}</p>}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Prénom</label>
              <input
                type="text"
                required
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-wine-500 focus:border-wine-500"
                placeholder="Prénom"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
              <input
                type="text"
                required
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-wine-500 focus:border-wine-500"
                placeholder="Nom"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-wine-500 focus:border-wine-500"
              placeholder="votre@email.fr"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mot de passe</label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-wine-500 focus:border-wine-500"
              placeholder="6 caractères minimum"
            />
          </div>

          {(!campaign.campaign_type_code || ['scolaire', 'lycee', 'bts_ndrc'].includes(campaign.campaign_type_code)) && <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Classe / Groupe (optionnel)</label>
            <input
              type="text"
              value={form.class_group}
              onChange={(e) => setForm({ ...form, class_group: e.target.value })}
              className="w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-wine-500 focus:border-wine-500"
              placeholder="Ex: BTS NDRC 1, GA..."
            />
          </div>}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-wine-700 text-white rounded-xl font-medium hover:bg-wine-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Inscription en cours...' : 'Rejoindre la campagne'}
          </button>

          <p className="text-xs text-center text-gray-400">
            Déjà un compte ? <a href="/login" className="text-wine-600 hover:underline">Se connecter</a>
          </p>
        </form>
      </div>
    </div>
  );
}
