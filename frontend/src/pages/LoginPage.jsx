import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Wine, Eye, EyeOff, ArrowRight, KeyRound } from 'lucide-react';
import WineWavesAnimation from '../components/shared/WineWavesAnimation';
import api from '../services/api';
import { useAppSettings } from '../contexts/AppSettingsContext';

export default function LoginPage() {
  const [mode, setMode] = useState('login'); // login | forgot | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { app_logo_url, app_name } = useAppSettings();

  // Parse URL params for reset token
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('token');
  const [newPassword, setNewPassword] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);

      // First connection + not standalone + student → redirect to install guide
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const shownGuide = localStorage.getItem('vc-shown-install-guide');
      if (user.role === 'etudiant' && !isStandalone && !shownGuide) {
        navigate('/installer');
        return;
      }

      switch (user.role) {
        case 'super_admin':
        case 'commercial':
        case 'comptable':
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

  const handleForgot = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSuccess('Si cette adresse existe, un email de réinitialisation a été envoyé.');
    } catch (err) {
      setSuccess('Si cette adresse existe, un email de réinitialisation a été envoyé.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token: resetToken, password: newPassword });
      setSuccess('Mot de passe réinitialisé ! Vous pouvez vous connecter.');
      setMode('login');
    } catch (err) {
      setError(err.response?.data?.message || 'Lien expiré ou invalide');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: 'linear-gradient(to bottom, #44091c 0%, #5a0f25 100%)' }}>
      {/* Wine waves ocean */}
      <WineWavesAnimation />

      {/* Form container */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4 sm:items-center">
        <div
          className="w-full max-w-sm"
          style={{
            animation: 'loginFadeIn 0.8s ease-out 0.5s both',
          }}
        >
          {/* Logo + title */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-white/10 backdrop-blur-sm rounded-2xl mb-3">
              {app_logo_url ? (
                <img src={app_logo_url} alt={app_name} className="w-10 h-10 object-contain" />
              ) : (
                <Wine className="w-7 h-7 text-white" />
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{app_name}</h1>
            <p className="text-wine-300 text-sm mt-1">Plateforme de gestion des ventes</p>
          </div>

          {/* Card */}
          {resetToken ? (
            <div className="bg-white rounded-2xl shadow-2xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <KeyRound size={20} className="text-wine-700" />
                <h2 className="text-xl font-semibold">Nouveau mot de passe</h2>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
              {success && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>}
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
                  <input type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 caractères" required minLength={8} />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? 'Enregistrement...' : <>Réinitialiser <ArrowRight size={16} /></>}
                </button>
              </form>
            </div>
          ) : mode === 'forgot' ? (
            <div className="bg-white rounded-2xl shadow-2xl p-6">
              <h2 className="text-xl font-semibold mb-2">Mot de passe oublié</h2>
              <p className="text-sm text-gray-500 mb-6">Entrez votre email pour recevoir un lien de réinitialisation.</p>
              {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
              {success && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>}
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="votre@email.fr" required />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? 'Envoi...' : <>Envoyer le lien <ArrowRight size={16} /></>}
                </button>
                <button type="button" onClick={() => { setMode('login'); setError(''); setSuccess(''); }} className="text-sm text-wine-700 hover:underline w-full text-center">
                  Retour à la connexion
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-2xl p-6">
              <h2 className="text-xl font-semibold mb-6">Connexion</h2>
              {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
              {success && <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm">{success}</div>}
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="votre@email.fr" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} className="input pr-10" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setShowPw(!showPw)}>
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-end">
                  <button type="button" onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }} className="text-sm text-wine-700 hover:underline">
                    Mot de passe oublié ?
                  </button>
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? 'Connexion...' : <>Se connecter <ArrowRight size={16} /></>}
                </button>
              </form>
              <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
                <p className="font-medium mb-1">Comptes de démonstration :</p>
                <p>Admin : nicolas@vins-conversations.fr</p>
                <p>Élève : ackavong@eleve.sc.fr</p>
                <p>Mot de passe : VinsConv2026!</p>
              </div>
            </div>
          )}

          <p className="text-center mt-5">
            <Link to="/boutique" className="text-wine-300 hover:text-white text-sm transition-colors">
              Découvrir nos vins →
            </Link>
          </p>
        </div>
      </div>

      {/* Keyframe for form entrance */}
      <style>{`
        @keyframes loginFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
