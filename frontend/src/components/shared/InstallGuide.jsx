import { useState, useEffect } from 'react';
import { Download, Smartphone, Monitor, ArrowRight, Check, Wine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function detectPlatform() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

function WineLogo() {
  return (
    <div className="w-20 h-20 mx-auto mb-6 bg-wine-700 rounded-3xl flex items-center justify-center shadow-lg">
      <svg viewBox="0 0 512 512" className="w-12 h-12">
        <g transform="translate(256,256)">
          <path d="M-60,-140 L-60,-40 Q-60,60 0,100 Q60,60 60,-40 L60,-140 Z" fill="none" stroke="#fff" strokeWidth="16" strokeLinejoin="round"/>
          <line x1="0" y1="100" x2="0" y2="170" stroke="#fff" strokeWidth="14" strokeLinecap="round"/>
          <line x1="-40" y1="170" x2="40" y2="170" stroke="#fff" strokeWidth="14" strokeLinecap="round"/>
        </g>
      </svg>
    </div>
  );
}

function StepCard({ number, children }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-8 h-8 rounded-full bg-wine-100 text-wine-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
        {number}
      </div>
      <div className="flex-1 pt-1">{children}</div>
    </div>
  );
}

function AndroidGuide({ deferredPrompt }) {
  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    }
  };

  if (deferredPrompt) {
    return (
      <div className="space-y-6">
        <p className="text-center text-gray-600">
          Installez l'app directement depuis votre navigateur :
        </p>
        <button
          onClick={handleInstall}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-wine-700 text-white rounded-2xl hover:bg-wine-800 font-semibold text-lg shadow-lg"
        >
          <Download size={24} /> Installer l'application
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-center text-sm text-gray-500 mb-4">Suivez ces 3 etapes dans Chrome :</p>
      <StepCard number={1}>
        <p className="text-sm font-medium">Appuyez sur le menu <span className="inline-block bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">{'\u22EE'}</span></p>
        <p className="text-xs text-gray-500">En haut a droite de Chrome</p>
      </StepCard>
      <StepCard number={2}>
        <p className="text-sm font-medium">Selectionnez "Ajouter a l'ecran d'accueil"</p>
        <p className="text-xs text-gray-500">Dans le menu qui s'affiche</p>
      </StepCard>
      <StepCard number={3}>
        <p className="text-sm font-medium">Confirmez en appuyant sur "Ajouter"</p>
        <p className="text-xs text-gray-500">L'icone V&C apparaitra sur votre ecran</p>
      </StepCard>
    </div>
  );
}

function IOSGuide() {
  return (
    <div className="space-y-5">
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-700">
        Utilisez Safari pour installer l'app. Chrome/Firefox ne supportent pas l'installation sur iOS.
      </div>
      <p className="text-center text-sm text-gray-500 mb-4">Suivez ces 3 etapes dans Safari :</p>
      <StepCard number={1}>
        <p className="text-sm font-medium">Appuyez sur le bouton Partager</p>
        <p className="text-xs text-gray-500">L'icone carre avec la fleche vers le haut, en bas de l'ecran</p>
        <div className="mt-2 flex justify-center">
          <svg width="32" height="32" viewBox="0 0 32 32" className="text-blue-500">
            <rect x="6" y="10" width="20" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="16" y1="4" x2="16" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <polyline points="11,9 16,4 21,9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </StepCard>
      <StepCard number={2}>
        <p className="text-sm font-medium">Appuyez sur "Sur l'ecran d'accueil"</p>
        <p className="text-xs text-gray-500">Faites defiler si necessaire</p>
      </StepCard>
      <StepCard number={3}>
        <p className="text-sm font-medium">Appuyez sur "Ajouter"</p>
        <p className="text-xs text-gray-500">L'icone V&C apparaitra sur votre ecran</p>
      </StepCard>
    </div>
  );
}

function DesktopGuide() {
  const [copied, setCopied] = useState(false);
  const url = window.location.origin;

  const copyUrl = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-5 text-center">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <Monitor size={32} className="mx-auto mb-2 text-blue-500" />
        <p className="text-sm text-blue-700 font-medium">Ouvrez cette page sur votre telephone</p>
        <p className="text-xs text-blue-600 mt-1">L'application fonctionne mieux sur mobile</p>
      </div>
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs text-gray-500 mb-2">Envoyez-vous ce lien :</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm bg-white px-3 py-2 rounded border truncate">{url}</code>
          <button onClick={copyUrl} className="px-3 py-2 bg-wine-700 text-white rounded text-sm hover:bg-wine-800">
            {copied ? 'Copie !' : 'Copier'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InstallGuide() {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState('desktop');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  useEffect(() => {
    setPlatform(detectPlatform());
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleContinue = () => {
    localStorage.setItem('vc-shown-install-guide', 'true');
    navigate('/login');
  };

  if (isStandalone) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-wine-50 to-white flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center">
          <WineLogo />
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <Check size={32} className="text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Application installee !</h1>
          <p className="text-gray-500 text-sm mb-6">Vous utilisez deja l'app en mode standalone.</p>
          <button onClick={handleContinue} className="btn-primary w-full flex items-center justify-center gap-2">
            Continuer <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-wine-50 to-white flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <WineLogo />
        <h1 className="text-xl font-bold text-gray-900 text-center mb-1">Installer Vins & Conversations</h1>
        <p className="text-gray-500 text-sm text-center mb-6">
          Accedez rapidement a l'app depuis votre ecran d'accueil
        </p>

        {/* Platform tabs */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs mb-6">
          {[['android', 'Android'], ['ios', 'iOS'], ['desktop', 'Ordi']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setPlatform(v)}
              className={`flex-1 py-2 px-3 rounded-md transition-colors ${
                platform === v ? 'bg-white shadow text-wine-700 font-medium' : 'text-gray-500'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-5 mb-6">
          {platform === 'android' && <AndroidGuide deferredPrompt={deferredPrompt} />}
          {platform === 'ios' && <IOSGuide />}
          {platform === 'desktop' && <DesktopGuide />}
        </div>

        <button onClick={handleContinue} className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-wine-700 transition-colors py-3">
          Continuer vers l'app <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
