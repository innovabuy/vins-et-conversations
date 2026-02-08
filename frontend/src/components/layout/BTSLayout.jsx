import { Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, Wine, GraduationCap } from 'lucide-react';
import NotificationBell from '../shared/NotificationBell';

export default function BTSLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-[400px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wine size={20} className="text-wine-700" />
            <span className="font-bold text-wine-700 text-sm">V&C</span>
            <GraduationCap size={16} className="text-gray-400" />
            <span className="text-xs text-gray-500">BTS NDRC</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">{user?.name}</span>
            <NotificationBell />
            <button onClick={logout} className="p-1 text-gray-400 hover:text-gray-600" title="Déconnexion">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-[400px] mx-auto px-4 py-4">
        <Outlet />
      </main>
    </div>
  );
}
