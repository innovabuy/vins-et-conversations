import { useState, useEffect, useCallback } from 'react';
import { notificationsAPI } from '../../services/api';
import {
  Bell, Check, Settings,
  ShoppingCart, CreditCard, Trophy, Package, AlertTriangle, Truck, Star,
} from 'lucide-react';

const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '\u2014';

const TYPE_CONFIG = {
  order: { label: 'Commande', icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
  payment: { label: 'Paiement', icon: CreditCard, color: 'text-green-600 bg-green-50' },
  ranking: { label: 'Classement', icon: Trophy, color: 'text-yellow-600 bg-yellow-50' },
  stock: { label: 'Stock', icon: Package, color: 'text-orange-600 bg-orange-50' },
  unpaid: { label: 'Impay\u00e9', icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
  delivery: { label: 'Livraison', icon: Truck, color: 'text-violet-600 bg-violet-50' },
  milestone: { label: 'Palier', icon: Star, color: 'text-wine-600 bg-wine-50' },
};

const TABS = [
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'settings', label: 'Param\u00e9trage', icon: Settings },
];

function NotificationsList() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await notificationsAPI.list();
      setNotifications(data.data || []);
      setUnreadCount(data.unread || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{notifications.length} notification(s)</span>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-wine-100 text-wine-800">
              {unreadCount} non lue(s)
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 text-sm text-wine-700 hover:text-wine-800"
          >
            <Check size={14} />
            Tout marquer comme lu
          </button>
        )}
      </div>

      {/* Notification List */}
      {notifications.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Bell size={40} className="mx-auto mb-3" />
          <p>Aucune notification</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const typeConf = TYPE_CONFIG[n.type] || { label: n.type, icon: Bell, color: 'text-gray-600 bg-gray-50' };
            const TypeIcon = typeConf.icon;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                  n.read
                    ? 'bg-white border-gray-100'
                    : 'bg-wine-50/30 border-wine-200'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${typeConf.color}`}>
                  <TypeIcon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm ${n.read ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
                        {n.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">{formatDate(n.created_at)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${typeConf.color}`}>
                          {typeConf.label}
                        </span>
                      </div>
                    </div>
                    {!n.read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-wine-100 text-wine-600"
                        title="Marquer comme lu"
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {!n.read && (
                  <div className="w-2 h-2 rounded-full bg-wine-600 flex-shrink-0 mt-2" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NotificationSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    notificationsAPI.getSettings()
      .then(({ data }) => setSettings(data.settings || {}))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (type) => {
    const newSettings = { ...settings, [type]: !settings[type] };
    setSettings(newSettings);
    setSaving(true);
    try {
      await notificationsAPI.updateSettings(newSettings);
    } catch (err) {
      // Revert on error
      setSettings(settings);
      alert(err.response?.data?.message || 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-wine-700" />
      </div>
    );
  }

  if (!settings) {
    return <p className="text-center text-gray-500 py-8">Impossible de charger les param\u00e8tres</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Activez ou d\u00e9sactivez les notifications par type. Les modifications sont sauvegard\u00e9es automatiquement.
      </p>

      <div className="space-y-2">
        {Object.entries(TYPE_CONFIG).map(([type, conf]) => {
          const TypeIcon = conf.icon;
          const enabled = settings[type] !== false; // default to true if unset
          return (
            <div
              key={type}
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${conf.color}`}>
                  <TypeIcon size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{conf.label}</p>
                  <p className="text-xs text-gray-400">Notifications de type {conf.label.toLowerCase()}</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle(type)}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enabled ? 'bg-wine-600' : 'bg-gray-300'
                }`}
                role="switch"
                aria-checked={enabled}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminNotifications() {
  const [activeTab, setActiveTab] = useState('notifications');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="flex border-b mb-4">
          {TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  isActive
                    ? 'border-wine-700 text-wine-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <TabIcon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'notifications' && <NotificationsList />}
        {activeTab === 'settings' && <NotificationSettings />}
      </div>
    </div>
  );
}
