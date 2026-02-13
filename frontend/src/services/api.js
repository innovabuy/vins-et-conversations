import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Intercepteur: ajoute le token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Intercepteur: refresh auto sur 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && error.response?.data?.error === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const { data } = await api.post('/auth/refresh');
        localStorage.setItem('accessToken', data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
};

// ─── Dashboard ────────────────────────────────────────
export const dashboardAPI = {
  student: (campaignId) => api.get('/dashboard/student', { params: { campaign_id: campaignId } }),
  studentRanking: (campaignId) => api.get('/dashboard/student/ranking', { params: { campaign_id: campaignId } }),
  studentLeaderboard: (campaignId, params) => api.get('/dashboard/student/leaderboard', { params: { campaign_id: campaignId, ...params } }),
  studentOrders: (campaignId) => api.get('/dashboard/student/orders', { params: { campaign_id: campaignId } }),
  adminCockpit: (campaignIds) => api.get('/dashboard/admin/cockpit', { params: { campaign_ids: campaignIds?.join(',') } }),
  teacher: (campaignId) => api.get('/dashboard/teacher', { params: { campaign_id: campaignId } }),
  bts: (campaignId) => api.get('/dashboard/bts', { params: { campaign_id: campaignId } }),
};

// ─── Products ─────────────────────────────────────────
export const productsAPI = {
  list: (params) => api.get('/products', { params }),
  get: (id) => api.get(`/products/${id}`),
  byCampaign: (campaignId) => api.get(`/campaigns/${campaignId}/products`),
  create: (data) => api.post('/admin/products', data),
  update: (id, data) => api.put(`/admin/products/${id}`, data),
  remove: (id) => api.delete(`/admin/products/${id}`),
  pdf: (id) => `${api.defaults.baseURL}/admin/products/${id}/pdf`,
};

// ─── Orders ───────────────────────────────────────────
export const ordersAPI = {
  create: (data) => api.post('/orders', data),
  adminCreate: (data) => api.post('/orders/admin/create', data),
  get: (id) => api.get(`/orders/${id}`),
  list: (params) => api.get('/orders/admin/list', { params }),
  validate: (id) => api.post(`/orders/admin/${id}/validate`),
  update: (id, data) => api.put(`/orders/admin/${id}`, data),
  cancel: (id) => api.delete(`/orders/admin/${id}`),
  pdf: (id) => `${api.defaults.baseURL}/orders/${id}/pdf`,
  sendEmail: (id) => api.post(`/orders/${id}/send-email`),
  myCustomers: () => api.get('/orders/my-customers'),
};

// ─── Campaigns ────────────────────────────────────────
export const campaignsAPI = {
  list: () => api.get('/admin/campaigns'),
  get: (id) => api.get(`/admin/campaigns/${id}`),
  create: (data) => api.post('/admin/campaigns', data),
  update: (id, data) => api.put(`/admin/campaigns/${id}`, data),
  duplicate: (id) => api.post(`/admin/campaigns/${id}/duplicate`),
  sendReport: (id, userIds) => api.post(`/admin/campaigns/${id}/send-report`, { user_ids: userIds }),
  resources: () => api.get('/admin/campaigns/resources'),
  listActive: () => api.get('/admin/campaigns', { params: { status: 'active' } }),
  reportPdf: (id) => `${api.defaults.baseURL}/admin/campaigns/${id}/report-pdf`,
};

// ─── Stock ────────────────────────────────────────────
export const stockAPI = {
  list: () => api.get('/admin/stock'),
  alerts: () => api.get('/admin/stock/alerts'),
  history: (productId) => api.get('/admin/stock/history', { params: { product_id: productId } }),
  addMovement: (data) => api.post('/admin/stock/movements', data),
  returns: () => api.get('/admin/stock/returns'),
  createReturn: (data) => api.post('/admin/stock/returns', data),
  updateReturn: (id, data) => api.put(`/admin/stock/returns/${id}`, data),
};

// ─── Delivery Notes ──────────────────────────────────
export const deliveryNotesAPI = {
  list: (params) => api.get('/admin/delivery-notes', { params }),
  get: (id) => api.get(`/admin/delivery-notes/${id}`),
  create: (data) => api.post('/admin/delivery-notes', data),
  update: (id, data) => api.put(`/admin/delivery-notes/${id}`, data),
  remove: (id) => api.delete(`/admin/delivery-notes/${id}`),
  sign: (id, data) => api.post(`/admin/delivery-notes/${id}/sign`, data),
  pdf: (id) => `${api.defaults.baseURL}/admin/delivery-notes/${id}/pdf`,
  sendEmail: (id) => api.post(`/admin/delivery-notes/${id}/send-email`),
};

// ─── Contacts / CRM ─────────────────────────────────
export const contactsAPI = {
  list: (params) => api.get('/admin/contacts', { params }),
  search: (q) => api.get('/admin/contacts/search', { params: { q } }),
  history: (id) => api.get(`/admin/contacts/${id}/history`),
  create: (data) => api.post('/admin/contacts', data),
  update: (id, data) => api.put(`/admin/contacts/${id}`, data),
};

// ─── Suppliers ───────────────────────────────────────
export const suppliersAPI = {
  list: () => api.get('/admin/suppliers'),
  get: (id) => api.get(`/admin/suppliers/${id}`),
  create: (data) => api.post('/admin/suppliers', data),
  update: (id, data) => api.put(`/admin/suppliers/${id}`, data),
  toggle: (id) => api.put(`/admin/suppliers/${id}/toggle`),
  remove: (id) => api.delete(`/admin/suppliers/${id}`),
};

// ─── Payments ────────────────────────────────────────
export const paymentsAPI = {
  list: (params) => api.get('/admin/payments', { params }),
  reconcile: (id, data) => api.put(`/admin/payments/${id}/reconcile`, data),
  cashDeposit: (data) => api.post('/admin/payments/cash-deposit', data),
};

// ─── Delivery Routes ─────────────────────────────────
export const deliveryRoutesAPI = {
  list: (params) => api.get('/admin/delivery-routes', { params }),
  get: (id) => api.get(`/admin/delivery-routes/${id}`),
  create: (data) => api.post('/admin/delivery-routes', data),
  update: (id, data) => api.put(`/admin/delivery-routes/${id}`, data),
  delete: (id) => api.delete(`/admin/delivery-routes/${id}`),
  updateStatus: (id, data) => api.put(`/admin/delivery-routes/${id}/status`, data),
  addStop: (id, data) => api.post(`/admin/delivery-routes/${id}/add-stop`, data),
  removeStop: (id, blId) => api.delete(`/admin/delivery-routes/${id}/remove-stop/${blId}`),
  pdf: (id) => `${api.defaults.baseURL}/admin/delivery-routes/${id}/pdf`,
};

// ─── Notifications ───────────────────────────────────
export const notificationsAPI = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  getSettings: () => api.get('/notifications/settings'),
  updateSettings: (settings) => api.put('/notifications/settings', { settings }),
};

// ─── Stripe Payments ────────────────────────────────
export const stripeAPI = {
  createIntent: (orderId) => api.post('/payments/create-intent', { order_id: orderId }),
};

// ─── CSE Dashboard ──────────────────────────────────
export const cseDashboardAPI = {
  get: (campaignId) => api.get('/dashboard/cse', { params: { campaign_id: campaignId } }),
};

// ─── Invoices ───────────────────────────────────────
export const invoicesAPI = {
  download: (orderId) => api.get(`/orders/${orderId}/invoice`, { responseType: 'blob' }),
};

// ─── Pricing Conditions ─────────────────────────────
export const pricingConditionsAPI = {
  list: () => api.get('/admin/pricing-conditions'),
  create: (data) => api.post('/admin/pricing-conditions', data),
  update: (id, data) => api.put(`/admin/pricing-conditions/${id}`, data),
};

// ─── Catalog PDF ───────────────────────────────────
export const catalogPdfAPI = {
  pdfUrl: (params) => {
    const qs = new URLSearchParams(params).toString();
    return `${api.defaults.baseURL}/admin/catalog/pdf${qs ? '?' + qs : ''}`;
  },
  sendEmail: (data) => api.post('/admin/catalog/send-email', data),
};

// ─── Exports ────────────────────────────────────────
export const exportsAPI = {
  pennylane: (start, end) => api.get('/admin/exports/pennylane', { params: { start, end }, responseType: 'blob' }),
  salesJournal: (start, end) => api.get('/admin/exports/sales-journal', { params: { start, end }, responseType: 'blob' }),
  commissions: (campaignId) => api.get('/admin/exports/commissions', { params: { campaign_id: campaignId }, responseType: 'blob' }),
  stock: () => api.get('/admin/exports/stock', { responseType: 'blob' }),
  deliveryNotes: (start, end) => api.get('/admin/exports/delivery-notes', { params: { start, end }, responseType: 'blob' }),
  activityReport: (start, end) => api.get('/admin/exports/activity-report', { params: { start, end }, responseType: 'blob' }),
};

// ─── Users Admin ───────────────────────────────────
export const usersAPI = {
  list: (params) => api.get('/admin/users', { params }),
  create: (data) => api.post('/admin/users', data),
  update: (id, data) => api.put(`/admin/users/${id}`, data),
  toggleStatus: (id) => api.post(`/admin/users/${id}/toggle-status`),
  importCSV: (data) => api.post('/admin/users/import-csv', data),
  anonymize: (id, reason) => api.post(`/admin/users/${id}/anonymize`, { reason }),
};

// ─── Invitations ───────────────────────────────────
export const invitationsAPI = {
  list: (params) => api.get('/admin/invitations', { params }),
  create: (data) => api.post('/admin/invitations', data),
};

// ─── Formation (BTS) ───────────────────────────────
export const formationAPI = {
  modules: () => api.get('/formation/modules'),
  updateProgress: (moduleId, data) => api.put(`/formation/modules/${moduleId}/progress`, data),
};

// ─── Ambassador ────────────────────────────────────
export const ambassadorAPI = {
  dashboard: (campaignId) => api.get('/dashboard/ambassador', { params: { campaign_id: campaignId } }),
  referralClick: (userId, source) => api.post('/ambassador/referral-click', { user_id: userId, source }),
  referralStats: () => api.get('/ambassador/referral-stats'),
};

// ─── Margins ────────────────────────────────────────
export const marginsAPI = {
  list: (params) => api.get('/admin/margins', { params }),
  byCampaign: (params) => api.get('/admin/margins/by-campaign', { params }),
  byClient: (params) => api.get('/admin/margins/by-client', { params }),
  bySupplier: (params) => api.get('/admin/margins/by-supplier', { params }),
  byProduct: (params) => api.get('/admin/margins/by-product', { params }),
  bySeller: (params) => api.get('/admin/margins/by-seller', { params }),
  overview: (params) => api.get('/admin/margins/overview', { params }),
  filterOptions: () => api.get('/admin/margins/filter-options'),
};

// ─── Analytics ─────────────────────────────────────
export const analyticsAPI = {
  get: (params) => api.get('/admin/analytics', { params }),
};

// ─── Categories ───────────────────────────────────
export const categoriesAPI = {
  listPublic: () => api.get('/categories'),
  list: () => api.get('/admin/categories'),
  create: (data) => api.post('/admin/categories', data),
  update: (id, data) => api.put(`/admin/categories/${id}`, data),
  delete: (id) => api.delete(`/admin/categories/${id}`),
  reorder: (order) => api.put('/admin/categories/reorder', { order }),
};

// ─── Audit Log ─────────────────────────────────────
export const auditLogAPI = {
  list: (params) => api.get('/admin/audit-log', { params }),
  entities: () => api.get('/admin/audit-log/entities'),
};

// ─── App Settings ─────────────────────────────────
export const appSettingsAPI = {
  getPublic: () => api.get('/settings/public'),
  getAdmin: () => api.get('/admin/settings'),
  update: (data) => api.put('/admin/settings', data),
};

// ─── Organizations ────────────────────────────────
export const organizationsAPI = {
  update: (id, data) => api.put(`/admin/settings/organizations/${id}`, data),
};

// ─── Boutique E-commerce ──────────────────────────
export const boutiqueAPI = {
  getCart: (sessionId) => api.get(`/public/cart/${sessionId}`),
  updateCart: (data) => api.post('/public/cart', data),
  checkout: (data) => api.post('/public/checkout', data),
  confirmCheckout: (data) => api.post('/public/checkout/confirm', data),
  trackOrder: (ref, email) => api.get(`/public/order/${ref}`, { params: { email } }),
  resolveAmbassador: (code) => api.get(`/public/ambassador/${code}`),
};

// ─── Shipping ────────────────────────────────────
export const shippingAPI = {
  calculate: (data) => api.post('/shipping/calculate', data),
  zones: () => api.get('/admin/shipping-zones'),
  updateZone: (id, data) => api.put(`/admin/shipping-zones/${id}`, data),
  rates: (params) => api.get('/admin/shipping-rates', { params }),
  updateRate: (id, data) => api.put(`/admin/shipping-rates/${id}`, data),
  importGrid: () => api.post('/admin/shipping-rates/import'),
};

export default api;
