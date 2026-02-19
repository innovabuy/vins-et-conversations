import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Truck, Factory, Package, Users,
  CreditCard, BarChart3, BookOpen, Bell, Map, FileText, Settings,
  Download, Wine, LogOut, Menu, X, ChevronRight, Shield, Tag, Building2, Image, ExternalLink
} from 'lucide-react';
import NotificationBell from '../shared/NotificationBell';
import { useAppSettings } from '../../contexts/AppSettingsContext';

const allNavItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Cockpit', end: true },
  { to: '/admin/campaigns', icon: BookOpen, label: 'Campagnes' },
  { to: '/admin/orders', icon: ShoppingCart, label: 'Commandes' },
  { to: '/admin/delivery', icon: Truck, label: 'Bons de livraison' },
  { to: '/admin/suppliers', icon: Factory, label: 'Fournisseurs' },
  { to: '/admin/stock', icon: Package, label: 'Stock' },
  { to: '/admin/crm', icon: Users, label: 'Contacts / CRM' },
  { to: '/admin/finance', icon: CreditCard, label: 'Finance & Marges', adminOnly: true },
  { to: '/admin/payments', icon: CreditCard, label: 'Paiements' },
  { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/admin/catalog', icon: Wine, label: 'Catalogue' },
  { to: '/admin/categories', icon: Tag, label: 'Catégories' },
  { to: '/admin/notifications', icon: Bell, label: 'Notifications' },
  { to: '/admin/routes', icon: Map, label: 'Tournées' },
  { to: '/admin/shipping', icon: Truck, label: 'Transport', adminOnly: true },
  { to: '/admin/pricing', icon: FileText, label: 'Conditions', adminOnly: true },
  { to: '/admin/exports', icon: Download, label: 'Exports', adminOnly: true },
  { to: '/admin/users', icon: Settings, label: 'Utilisateurs', adminOnly: true },
  { to: '/admin/organization-types', icon: Building2, label: "Types d'org.", adminOnly: true },
  { to: '/admin/campaign-types', icon: Tag, label: 'Types campagne', adminOnly: true },
  { to: '/admin/audit', icon: Shield, label: 'Audit', adminOnly: true },
  { to: '/admin/site-images', icon: Image, label: 'Images site', adminOnly: true },
  { to: '/admin/settings', icon: Settings, label: 'Paramètres', adminOnly: true },
];

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { app_logo_url, app_name } = useAppSettings();
  const isAdmin = user?.role === 'super_admin';
  const navItems = allNavItems.filter((item) => !item.adminOnly || isAdmin);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <button onClick={() => setSidebarOpen(true)} aria-label="Ouvrir le menu">
          <Menu size={24} />
        </button>
        <div className="flex items-center gap-2">
          {app_logo_url ? (
            <img src={app_logo_url} alt={app_name} className="h-6 w-auto object-contain" />
          ) : (
            <Wine size={20} className="text-wine-700" />
          )}
          <span className="font-semibold">{app_name?.split(' ')[0] || 'V&C'} Admin</span>
        </div>
        <NotificationBell />
        <div className="w-8 h-8 rounded-full bg-wine-100 flex items-center justify-center text-wine-700 text-sm font-bold">
          {user?.name?.charAt(0)}
        </div>
      </header>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50 transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {app_logo_url ? (
                <img src={app_logo_url} alt={app_name} className="h-7 w-auto object-contain" />
              ) : (
                <Wine size={24} className="text-wine-700" />
              )}
              <div>
                <h2 className="font-bold text-sm">{app_name}</h2>
                <p className="text-xs text-gray-500">Administration</p>
              </div>
            </div>
            <button className="lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu">
              <X size={20} />
            </button>
          </div>
        </div>

        <nav className="p-2 overflow-y-auto h-[calc(100%-140px)]" role="navigation" aria-label="Menu principal">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
                  isActive
                    ? 'bg-wine-50 text-wine-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
          <hr className="my-2 border-gray-100" />
          <a
            href="/boutique"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ExternalLink size={18} />
            Voir le site
          </a>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-wine-100 flex items-center justify-center text-wine-700 text-sm font-bold">
              {user?.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.role}</p>
            </div>
            <div className="hidden lg:block"><NotificationBell /></div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
