import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import AdminLayout from './components/layout/AdminLayout';
import AdminCockpit from './components/admin/AdminCockpit';
import AdminOrders from './components/admin/AdminOrders';
import AdminCatalog from './components/admin/AdminCatalog';
import AdminCampaigns from './components/admin/AdminCampaigns';
import AdminCampaignDetail from './components/admin/AdminCampaignDetail';
import CampaignWizard from './components/admin/CampaignWizard';
import AdminStock from './components/admin/AdminStock';
import AdminDeliveryNotes from './components/admin/AdminDeliveryNotes';
import AdminCRM from './components/admin/AdminCRM';
import AdminSuppliers from './components/admin/AdminSuppliers';
import AdminPayments from './components/admin/AdminPayments';
import AdminRoutes from './components/admin/AdminRoutes';
import AdminNotifications from './components/admin/AdminNotifications';
import AdminPricing from './components/admin/AdminPricing';
import AdminExports from './components/admin/AdminExports';
import AdminFinance from './components/admin/AdminFinance';
import AdminUsers from './components/admin/AdminUsers';
import AdminAnalytics from './components/admin/AdminAnalytics';
import AdminAuditLog from './components/admin/AdminAuditLog';
import AdminCategories from './components/admin/AdminCategories';
import StudentDashboard from './components/student/StudentDashboard';
import CSELayout from './components/layout/CSELayout';
import CSEDashboard from './components/cse/CSEDashboard';
import AmbassadorLayout from './components/layout/AmbassadorLayout';
import AmbassadorDashboard from './components/ambassador/AmbassadorDashboard';
import BTSLayout from './components/layout/BTSLayout';
import BTSDashboard from './components/bts/BTSDashboard';
import TeacherLayout from './components/layout/TeacherLayout';
import TeacherDashboard from './components/teacher/TeacherDashboard';
import InstallPrompt from './components/shared/InstallPrompt';
import InstallGuide from './components/shared/InstallGuide';
import { ToastProvider } from './components/shared/Toast';
import PublicLayout from './components/layout/PublicLayout';
import BoutiqueHome from './components/public/BoutiqueHome';
import ProductDetail from './components/public/ProductDetail';
import ContactForm from './components/public/ContactForm';
import CartPage from './components/public/CartPage';
import CheckoutPage from './components/public/CheckoutPage';
import ConfirmationPage from './components/public/ConfirmationPage';
import OrderTrackingPage from './components/public/OrderTrackingPage';
import CGVPage from './components/public/CGVPage';
import MentionsLegalesPage from './components/public/MentionsLegalesPage';
import { CartProvider } from './contexts/CartContext';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine-700" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/installer" element={<InstallGuide />} />

      {/* Public boutique */}
      <Route path="/boutique" element={<CartProvider><PublicLayout /></CartProvider>}>
        <Route index element={<BoutiqueHome />} />
        <Route path="vin/:id" element={<ProductDetail />} />
        <Route path="contact" element={<ContactForm />} />
        <Route path="panier" element={<CartPage />} />
        <Route path="commander" element={<CheckoutPage />} />
        <Route path="confirmation/:ref" element={<ConfirmationPage />} />
        <Route path="suivi" element={<OrderTrackingPage />} />
        <Route path="cgv" element={<CGVPage />} />
        <Route path="mentions-legales" element={<MentionsLegalesPage />} />
      </Route>

      {/* Admin routes */}
      <Route path="/admin" element={
        <ProtectedRoute roles={['super_admin', 'commercial', 'comptable']}>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<AdminCockpit />} />
        <Route path="campaigns" element={<AdminCampaigns />} />
        <Route path="campaigns/new" element={<CampaignWizard />} />
        <Route path="campaigns/:id" element={<AdminCampaignDetail />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="delivery" element={<AdminDeliveryNotes />} />
        <Route path="suppliers" element={<AdminSuppliers />} />
        <Route path="stock" element={<AdminStock />} />
        <Route path="crm" element={<AdminCRM />} />
        <Route path="finance" element={<AdminFinance />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="audit" element={<AdminAuditLog />} />
        <Route path="catalog" element={<AdminCatalog />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="routes" element={<AdminRoutes />} />
        <Route path="pricing" element={<AdminPricing />} />
        <Route path="exports" element={<AdminExports />} />
        <Route path="users" element={<AdminUsers />} />
      </Route>

      {/* CSE routes */}
      <Route path="/cse" element={
        <ProtectedRoute roles={['cse']}>
          <CSELayout />
        </ProtectedRoute>
      }>
        <Route index element={<CSEDashboard />} />
      </Route>

      {/* Ambassador routes */}
      <Route path="/ambassador" element={
        <ProtectedRoute roles={['ambassadeur']}>
          <AmbassadorLayout />
        </ProtectedRoute>
      }>
        <Route index element={<AmbassadorDashboard />} />
      </Route>

      {/* Teacher routes */}
      <Route path="/teacher" element={
        <ProtectedRoute roles={['enseignant']}>
          <TeacherLayout />
        </ProtectedRoute>
      }>
        <Route index element={<TeacherDashboard />} />
      </Route>

      {/* BTS routes */}
      <Route path="/bts" element={
        <ProtectedRoute roles={['etudiant']}>
          <BTSLayout />
        </ProtectedRoute>
      }>
        <Route index element={<BTSDashboard />} />
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
          ['super_admin', 'commercial', 'comptable'].includes(user.role) ? '/admin' :
          user.role === 'cse' ? '/cse' :
          user.role === 'ambassadeur' ? '/ambassador' :
          user.role === 'enseignant' ? '/teacher' :
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
        <ToastProvider>
          <AppRoutes />
          <InstallPrompt />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
