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
  studentOrders: (campaignId) => api.get('/dashboard/student/orders', { params: { campaign_id: campaignId } }),
  adminCockpit: (campaignIds) => api.get('/dashboard/admin/cockpit', { params: { campaign_ids: campaignIds?.join(',') } }),
  teacher: (campaignId) => api.get('/dashboard/teacher', { params: { campaign_id: campaignId } }),
};

// ─── Products ─────────────────────────────────────────
export const productsAPI = {
  list: () => api.get('/products'),
  byCampaign: (campaignId) => api.get(`/campaigns/${campaignId}/products`),
  create: (data) => api.post('/admin/products', data),
  update: (id, data) => api.put(`/admin/products/${id}`, data),
  remove: (id) => api.delete(`/admin/products/${id}`),
};

// ─── Orders ───────────────────────────────────────────
export const ordersAPI = {
  create: (data) => api.post('/orders', data),
  get: (id) => api.get(`/orders/${id}`),
  list: (params) => api.get('/orders/admin/list', { params }),
  validate: (id) => api.post(`/orders/admin/${id}/validate`),
};

// ─── Campaigns ────────────────────────────────────────
export const campaignsAPI = {
  list: () => api.get('/admin/campaigns'),
  duplicate: (id) => api.post(`/admin/campaigns/${id}/duplicate`),
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
  sign: (id, data) => api.post(`/admin/delivery-notes/${id}/sign`, data),
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
  create: (data) => api.post('/admin/delivery-routes', data),
  update: (id, data) => api.put(`/admin/delivery-routes/${id}`, data),
};

// ─── Notifications ───────────────────────────────────
export const notificationsAPI = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  getSettings: () => api.get('/notifications/settings'),
  updateSettings: (settings) => api.put('/notifications/settings', { settings }),
};

export default api;
