import { Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, Wine, BookOpen } from 'lucide-react';
import NotificationBell from '../shared/NotificationBell';
import CapNumerikCredit from '../shared/CapNumerikCredit';
import { useAppSettings } from '../../contexts/AppSettingsContext';

export default function TeacherLayout() {
  const { user, logout } = useAuth();
  const { app_logo_url, app_name } = useAppSettings();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-[700px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {app_logo_url ? (
              <img src={app_logo_url} alt={app_name} className="h-6 w-auto object-contain" />
            ) : (
              <Wine size={22} className="text-wine-700" />
            )}
            <span className="font-bold text-wine-700">{app_name?.split('&')[0]?.trim() || 'V&C'}</span>
            <BookOpen size={16} className="text-gray-400" />
            <span className="text-sm text-gray-500">Espace Enseignant</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <NotificationBell />
            <button onClick={logout} className="p-1.5 text-gray-400 hover:text-gray-600" title="Déconnexion">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-[700px] mx-auto px-4 py-6">
        <Outlet />
      </main>
      <CapNumerikCredit />
    </div>
  );
}
