import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, CheckCheck } from 'lucide-react';
import { notificationsAPI } from '../../services/api';

const TYPE_ICONS = {
  order: '🛒',
  payment: '💳',
  stock: '📦',
  delivery: '🚚',
  milestone: '🎯',
  contact: '📩',
};

const ENTITY_ROUTES = {
  order: (id) => `/admin/orders?selected=${id}`,
  payment: () => '/admin/payments',
  stock: () => '/admin/stock',
  delivery: () => '/admin/delivery',
  campaign: (id) => `/admin/campaigns/${id}`,
  contact: () => '/admin/crm',
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchNotifications = async () => {
    try {
      const { data } = await notificationsAPI.list();
      setNotifications(data.data || []);
      setUnread(data.unread || 0);
    } catch (err) {
      console.error('NotificationBell fetch error:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const markRead = async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setUnread((u) => Math.max(0, u - 1));
    } catch (err) {
      console.error('NotificationBell markRead error:', err);
    }
  };

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch (err) {
      console.error('NotificationBell markAllRead error:', err);
    }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
        <Bell size={18} className="text-gray-500" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/30 z-[200]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl z-[201] max-h-[70vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-sm">Notifications</h3>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-wine-700 hover:text-wine-900">
                    <CheckCheck size={14} /> Tout marquer lu
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-200 transition-colors">
                  <X size={16} className="text-gray-400" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Aucune notification
                </div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 transition-colors ${!n.read ? 'bg-wine-50/50' : ''}`}
                    onClick={() => {
                      if (!n.read) markRead(n.id);
                      const dest = n.link || (() => {
                        const routeFn = ENTITY_ROUTES[n.entity] || ENTITY_ROUTES[n.type];
                        return routeFn ? routeFn(n.entity_id) : null;
                      })();
                      if (dest) {
                        navigate(dest);
                        setOpen(false);
                      }
                    }}
                  >
                    <span className="text-lg flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type] || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!n.read ? 'font-medium text-gray-900' : 'text-gray-600'}`}>{n.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(n.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-wine-600 flex-shrink-0 mt-2" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
