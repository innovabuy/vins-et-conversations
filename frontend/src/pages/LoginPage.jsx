import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Wine, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      // Redirect by role
      switch (user.role) {
        case 'super_admin':
        case 'commercial':
          navigate('/admin'); break;
        case 'etudiant':
          navigate('/student'); break;
        case 'enseignant':
          navigate('/teacher'); break;
        case 'cse':
          navigate('/cse'); break;
        case 'ambassadeur':
          navigate('/ambassador'); break;
        default:
          navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-wine-900 via-wine-800 to-wine-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
            <Wine className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Vins & Conversations</h1>
          <p className="text-wine-200 mt-1">Plateforme de gestion des ventes</p>
        </div>

        <form onSubmit={handleSubmit} className="card">
          <h2 className="text-xl font-semibold mb-6">Connexion</h2>

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.fr"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPw(!showPw)}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </div>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
            <p className="font-medium mb-1">Comptes de démonstration :</p>
            <p>Admin : nicolas@vins-conversations.fr</p>
            <p>Élève : ackavong@eleve.sc.fr</p>
            <p>Mot de passe : VinsConv2026!</p>
          </div>
        </form>
      </div>
    </div>
  );
}
