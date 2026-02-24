// ─── API Client — Vins & Conversations Site Public ─────────────────
const API = {
  baseURL: '/api/v1',

  async get(path, params = {}) {
    const url = new URL(this.baseURL + path, window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Erreur ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (err.name === 'TypeError') {
        Toast.show('Erreur de connexion au serveur', 'error');
      }
      throw err;
    }
  },

  async post(path, body = {}) {
    try {
      const res = await fetch(this.baseURL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Erreur ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (err.name === 'TypeError') {
        Toast.show('Erreur de connexion au serveur', 'error');
      }
      throw err;
    }
  },

  // ─── Catalog ─────────────────────────────────────
  catalog: {
    list(params) { return API.get('/public/catalog', params); },
    detail(id) { return API.get(`/public/catalog/${id}`); },
    featured() { return API.get('/public/featured'); },
    filters() { return API.get('/public/filters'); },
  },

  // ─── Cart ────────────────────────────────────────
  cart: {
    get(sessionId) { return API.get(`/public/cart/${sessionId}`); },
    update(sessionId, items) {
      return API.post('/public/cart', { session_id: sessionId, items });
    },
  },

  // ─── Checkout ────────────────────────────────────
  checkout: {
    create(data) { return API.post('/public/checkout', data); },
    confirm(data) { return API.post('/public/checkout/confirm', data); },
  },

  // ─── Shipping ────────────────────────────────────
  shipping: {
    calculate(postalCode, quantity) {
      return API.post('/shipping/calculate', {
        department_code: postalCode.substring(0, 2),
        bottle_count: quantity,
      });
    },
  },

  // ─── Order Tracking ──────────────────────────────
  order: {
    track(ref, email) { return API.get(`/public/order/${ref}`, { email }); },
  },

  // ─── Referral ────────────────────────────────────
  referral: {
    resolve(code) { return API.get(`/public/referral/${code}`); },
  },

  // ─── Ambassador ──────────────────────────────────
  ambassador: {
    resolve(code) { return API.get(`/public/ambassador/${code}`); },
  },

  // ─── Contact ─────────────────────────────────────
  contact: {
    send(data) { return API.post('/public/contact', data); },
  },

  // ─── Settings ────────────────────────────────────
  settings: {
    getPublic() { return API.get('/settings/public'); },
  },

  // ─── Categories ──────────────────────────────────
  categories: {
    list() { return API.get('/categories'); },
  },
};

// ─── Toast notifications ────────────────────────────
const Toast = {
  container: null,

  init() {
    if (this.container) return;
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    document.body.appendChild(this.container);
  },

  show(message, type = 'info', duration = 4000) {
    this.init();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    this.container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
};
