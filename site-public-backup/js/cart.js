// ─── Cart Manager — Vins & Conversations Site Public ────────────────
const Cart = {
  SESSION_KEY: 'vc_cart_session',
  ITEMS_KEY: 'vc_cart_items',
  REFERRAL_KEY: 'vc_referral_code',

  getSessionId() {
    let id = sessionStorage.getItem(this.SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() :
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
      sessionStorage.setItem(this.SESSION_KEY, id);
    }
    return id;
  },

  getReferralCode() {
    return sessionStorage.getItem(this.REFERRAL_KEY) || null;
  },

  setReferralCode(code) {
    if (code) sessionStorage.setItem(this.REFERRAL_KEY, code);
  },

  captureReferralFromURL() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) this.setReferralCode(ref);
  },

  getLocalItems() {
    try {
      return JSON.parse(sessionStorage.getItem(this.ITEMS_KEY) || '[]');
    } catch { return []; }
  },

  setLocalItems(items) {
    sessionStorage.setItem(this.ITEMS_KEY, JSON.stringify(items));
    this.updateBadge();
  },

  async addItem(productId, qty = 1) {
    const items = this.getLocalItems();
    const existing = items.find(i => i.product_id === productId);
    if (existing) {
      existing.quantity += qty;
    } else {
      items.push({ product_id: productId, quantity: qty });
    }
    await this.sync(items);
    Toast.show('Produit ajout\u00e9 au panier', 'success');
  },

  async removeItem(productId) {
    const items = this.getLocalItems().filter(i => i.product_id !== productId);
    await this.sync(items);
  },

  async updateQty(productId, qty) {
    if (qty <= 0) return this.removeItem(productId);
    const items = this.getLocalItems();
    const item = items.find(i => i.product_id === productId);
    if (item) {
      item.quantity = qty;
      await this.sync(items);
    }
  },

  async load() {
    try {
      const sessionId = sessionStorage.getItem(this.SESSION_KEY);
      if (!sessionId) return { items: [], total: 0 };
      const data = await API.cart.get(sessionId);
      if (data.items) this.setLocalItems(data.items);
      return data;
    } catch {
      return { items: this.getLocalItems(), total: 0 };
    }
  },

  async sync(items) {
    this.setLocalItems(items);
    try {
      const sessionId = this.getSessionId();
      const data = await API.cart.update(sessionId, items);
      if (data.items) this.setLocalItems(data.items);
      return data;
    } catch (err) {
      console.warn('Cart sync failed, using local items', err);
      return { items };
    }
  },

  clear() {
    sessionStorage.removeItem(this.SESSION_KEY);
    sessionStorage.removeItem(this.ITEMS_KEY);
    sessionStorage.removeItem(this.REFERRAL_KEY);
    this.updateBadge();
  },

  getCount() {
    return this.getLocalItems().reduce((sum, i) => sum + i.quantity, 0);
  },

  updateBadge() {
    const badges = document.querySelectorAll('.cart-badge');
    const count = this.getCount();
    badges.forEach(badge => {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    });
  },
};
