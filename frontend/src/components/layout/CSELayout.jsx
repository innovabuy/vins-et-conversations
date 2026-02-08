import { useAuth } from '../../contexts/AuthContext';
import { Outlet, useNavigate } from 'react-router-dom';
import { Wine, LogOut } from 'lucide-react';
import NotificationBell from '../shared/NotificationBell';

export default function CSELayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-[900px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wine size={24} className="text-wine-700" />
            <div>
              <h1 className="font-bold text-sm">Vins & Conversations</h1>
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
    </div>
  );
}
