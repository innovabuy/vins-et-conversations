import { useState, useEffect } from 'react';
import { X, Download, Share } from 'lucide-react';

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [platform, setPlatform] = useState('desktop');

  useEffect(() => {
    // Don't show if already dismissed or installed
    if (localStorage.getItem('vc-install-dismissed')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Detect platform
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) setPlatform('ios');
    else if (/android/i.test(ua)) setPlatform('android');
    else setPlatform('desktop');

    // Listen for beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // For iOS/Safari, show custom prompt after 2s on mobile
    const timer = setTimeout(() => {
      if (/iPad|iPhone|iPod/.test(ua) && !window.matchMedia('(display-mode: standalone)').matches) {
        setShow(true);
      }
    }, 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setShow(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('vc-install-dismissed', 'true');
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleDismiss} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        {/* Logo */}
        <div className="w-16 h-16 mx-auto mb-4 bg-wine-700 rounded-2xl flex items-center justify-center">
          <svg viewBox="0 0 512 512" className="w-10 h-10">
            <g transform="translate(256,256)">
              <path d="M-60,-140 L-60,-40 Q-60,60 0,100 Q60,60 60,-40 L60,-140 Z" fill="none" stroke="#fff" strokeWidth="16" strokeLinejoin="round"/>
              <line x1="0" y1="100" x2="0" y2="170" stroke="#fff" strokeWidth="14" strokeLinecap="round"/>
              <line x1="-40" y1="170" x2="40" y2="170" stroke="#fff" strokeWidth="14" strokeLinecap="round"/>
            </g>
          </svg>
        </div>

        <h2 className="text-lg font-bold text-gray-900 mb-1">Vins & Conversations</h2>
        <p className="text-sm text-gray-500 mb-4">Installer l'application pour un accès rapide</p>

        {platform === 'ios' ? (
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 mb-4">
            <p className="flex items-center justify-center gap-2 mb-2">
              <Share size={16} className="text-blue-500" />
              Appuyez sur <strong>Partager</strong>
            </p>
            <p>puis <strong>Ajouter à l'écran d'accueil</strong></p>
          </div>
        ) : platform === 'android' || deferredPrompt ? (
          <button onClick={handleInstall} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-wine-700 text-white rounded-lg hover:bg-wine-800 font-medium mb-4">
            <Download size={18} /> Installer
          </button>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 mb-4">
            <p>Ajoutez cette page à vos favoris pour un accès rapide</p>
          </div>
        )}

        <button onClick={handleDismiss} className="text-sm text-gray-500 hover:text-gray-700">Plus tard</button>
      </div>
    </div>
  );
}
