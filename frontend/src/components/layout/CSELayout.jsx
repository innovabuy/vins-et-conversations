import { useAuth } from '../../contexts/AuthContext';
import { Outlet, useNavigate } from 'react-router-dom';
import { Wine, LogOut } from 'lucide-react';
import NotificationBell from '../shared/NotificationBell';
import CapNumerikCredit from '../shared/CapNumerikCredit';
import { useAppSettings } from '../../contexts/AppSettingsContext';

export default function CSELayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { app_logo_url, app_name } = useAppSettings();

  // Get org logo from user campaigns metadata if available
  const orgLogo = user?.campaigns?.[0]?.org_logo_url || null;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-[900px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {app_logo_url ? (
              <img src={app_logo_url} alt={app_name} className="h-7 w-auto object-contain" />
            ) : (
              <Wine size={24} className="text-wine-700" />
            )}
            {orgLogo && (
              <>
                <span className="text-gray-300">|</span>
                <img src={orgLogo} alt="Partenaire" className="h-7 w-auto object-contain" />
              </>
            )}
            <div>
              <h1 className="font-bold text-sm">{app_name}</h1>
              <p className="text-xs text-gray-500">Espace CSE</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
            <NotificationBell />
            <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-4 py-6">
        <Outlet />
      </main>
      <CapNumerikCredit />
    </div>
  );
}
