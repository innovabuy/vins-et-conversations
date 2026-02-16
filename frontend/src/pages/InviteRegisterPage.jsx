import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Wine } from 'lucide-react';
import { useAppSettings } from '../contexts/AppSettingsContext';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

export default function InviteRegisterPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { setUserData } = useAuth();
  const { app_logo_url, app_name } = useAppSettings();

  const [form, setForm] = useState({ name: '', email: '', password: '', parental_consent: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Erreur d\'inscription');
        return;
      }
      // Store token and redirect
      setUserData(data.user, data.accessToken);
      const role = data.user?.role;
      const dest = role === 'etudiant' ? '/student' :
        role === 'enseignant' ? '/teacher' :
        role === 'cse' ? '/cse' :
        role === 'ambassadeur' ? '/ambassador' :
        '/login';
      navigate(dest, { replace: true });
    } catch (err) {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-wine-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          {app_logo_url ? (
            <img src={app_logo_url} alt={app_name} className="h-12 w-auto mx-auto mb-2" />
          ) : (
            <Wine size={40} className="text-wine-700 mx-auto mb-2" />
          )}
          <h1 className="text-2xl font-bold text-gray-900">{app_name || 'Vins & Conversations'}</h1>
          <p className="text-sm text-gray-500 mt-1">Inscription par invitation</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
                placeholder="Prénom Nom"
                required
                minLength={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
                placeholder="prenom.nom@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe *</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
                placeholder="8 caractères minimum"
                required
                minLength={8}
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="consent"
                checked={form.parental_consent}
                onChange={(e) => setForm({ ...form, parental_consent: e.target.checked })}
                className="mt-1 rounded border-gray-300"
              />
              <label htmlFor="consent" className="text-xs text-gray-600">
                J'atteste avoir l'autorisation parentale pour participer (mineur) ou avoir plus de 18 ans.
              </label>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-wine-700 text-white font-medium py-2.5 rounded-lg hover:bg-wine-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Inscription...' : 'S\'inscrire'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400">
            Code d'invitation : <span className="font-mono">{code?.substring(0, 8)}...</span>
          </p>
        </div>
      </div>
    </div>
  );
}
