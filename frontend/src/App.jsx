import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import AdminLayout from './components/layout/AdminLayout';
import AdminCockpit from './components/admin/AdminCockpit';
import AdminOrders from './components/admin/AdminOrders';
import AdminCatalog from './components/admin/AdminCatalog';
import AdminCampaigns from './components/admin/AdminCampaigns';
import AdminStock from './components/admin/AdminStock';
import AdminDeliveryNotes from './components/admin/AdminDeliveryNotes';
import AdminCRM from './components/admin/AdminCRM';
import AdminSuppliers from './components/admin/AdminSuppliers';
import AdminPayments from './components/admin/AdminPayments';
import AdminRoutes from './components/admin/AdminRoutes';
import AdminNotifications from './components/admin/AdminNotifications';
import StudentDashboard from './components/student/StudentDashboard';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}

function PlaceholderModule({ title }) {
  return (
    <div className="card text-center py-12">
      <h2 className="text-xl font-semibold text-gray-400 mb-2">{title}</h2>
      <p className="text-gray-400">Module en cours de développement — Phase 2+</p>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Admin routes */}
      <Route path="/admin" element={
        <ProtectedRoute roles={['super_admin', 'commercial', 'comptable']}>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<AdminCockpit />} />
        <Route path="campaigns" element={<AdminCampaigns />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="delivery" element={<AdminDeliveryNotes />} />
        <Route path="suppliers" element={<AdminSuppliers />} />
        <Route path="stock" element={<AdminStock />} />
        <Route path="crm" element={<AdminCRM />} />
        <Route path="finance" element={<PlaceholderModule title="Finance & Marges" />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="analytics" element={<PlaceholderModule title="Analytics" />} />
        <Route path="catalog" element={<AdminCatalog />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="routes" element={<AdminRoutes />} />
        <Route path="pricing" element={<PlaceholderModule title="Conditions commerciales" />} />
        <Route path="exports" element={<PlaceholderModule title="Exports comptables" />} />
        <Route path="users" element={<PlaceholderModule title="Utilisateurs & Droits" />} />
      </Route>

      {/* Student route */}
      <Route path="/student" element={
        <ProtectedRoute roles={['etudiant']}>
          <StudentDashboard />
        </ProtectedRoute>
      } />

      {/* Redirects */}
      <Route path="/" element={
        user ? <Navigate to={
          ['super_admin', 'commercial'].includes(user.role) ? '/admin' :
          user.role === 'etudiant' ? '/student' :
          '/login'
        } replace /> : <Navigate to="/login" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
