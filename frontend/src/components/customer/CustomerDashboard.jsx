import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ordersAPI, authAPI } from '../../services/api';
import OrderTracker from '../shared/OrderTracker';
import { ShoppingBag, User, LogOut, Save, Check } from 'lucide-react';
import { useAppSettings } from '../../contexts/AppSettingsContext';

export default function CustomerDashboard() {
  const { user, logout } = useAuth();
  const { appName } = useAppSettings();
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [profile, setProfile] = useState({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile({ name: user.name || '', email: user.email || '', phone: user.phone || '' });
    }
  }, [user]);

  useEffect(() => {
    ordersAPI.my()
      .then((res) => setOrders(res.data.data || []))
      .catch(() => {})
      .finally(() => setLoadingOrders(false));
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await authAPI.updateProfile({ name: profile.name, phone: profile.phone });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-wine-700">{appName || 'Vins & Conversations'}</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button onClick={logout} className="text-gray-400 hover:text-gray-600">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
          <button
            onClick={() => setTab('orders')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'orders' ? 'bg-white shadow text-wine-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <ShoppingBag size={16} />
            Mes commandes
          </button>
          <button
            onClick={() => setTab('profile')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'profile' ? 'bg-white shadow text-wine-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <User size={16} />
            Mon profil
          </button>
        </div>

        {/* Orders tab */}
        {tab === 'orders' && (
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h2 className="font-semibold text-lg mb-4">Mes commandes</h2>
            {loadingOrders ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
              </div>
            ) : (
              <OrderTracker orders={orders} showAmount showTimeline />
            )}
          </div>
        )}

        {/* Profile tab */}
        {tab === 'profile' && (
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h2 className="font-semibold text-lg mb-4">Mon profil</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
                />
                <p className="text-xs text-gray-400 mt-1">L'email ne peut pas etre modifie</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telephone</label>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="06 12 34 56 78"
                />
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {saved ? <Check size={16} /> : <Save size={16} />}
                {saving ? 'Enregistrement...' : saved ? 'Enregistre' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
