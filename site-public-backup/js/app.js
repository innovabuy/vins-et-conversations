// ─── App Logic — Vins & Conversations Site Public ──────────────────
(function () {
  'use strict';

  // ─── Init ────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    Cart.captureReferralFromURL();
    Cart.updateBadge();
    initMobileMenu();
    await loadSettings();

    const page = document.body.dataset.page;
    const handlers = {
      index: initIndex,
      boutique: initBoutique,
      produit: initProduit,
      panier: initPanier,
      checkout: initCheckout,
      confirmation: initConfirmation,
      suivi: initSuivi,
      contact: initContact,
    };
    if (handlers[page]) handlers[page]();
  });

  // ─── Mobile menu ─────────────────────────────────
  function initMobileMenu() {
    const toggle = document.getElementById('menu-toggle');
    const nav = document.getElementById('nav-menu');
    if (toggle && nav) {
      toggle.addEventListener('click', () => {
        nav.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', nav.classList.contains('nav-open'));
      });
    }
  }

  // ─── Load app settings (logo, name) ──────────────
  async function loadSettings() {
    try {
      const data = await API.settings.getPublic();
      const settings = data.settings || data;
      const logoEls = document.querySelectorAll('.app-logo');
      const nameEls = document.querySelectorAll('.app-name');
      if (settings.app_logo_url) {
        logoEls.forEach(el => el.src = settings.app_logo_url);
      }
      if (settings.app_name) {
        nameEls.forEach(el => el.textContent = settings.app_name);
        document.title = document.title.replace('Vins & Conversations', settings.app_name);
      }
    } catch { /* fallback to defaults */ }
  }

  // ─── Helpers ─────────────────────────────────────
  function $(sel, ctx = document) { return ctx.querySelector(sel); }
  function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

  function formatPrice(price) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(price);
  }

  function productCard(p) {
    const img = p.image_url || 'img/logo.svg';
    const categoryBadge = p.category_name ? `<span class="badge badge-category">${p.category_name}</span>` : '';
    return `
      <a href="produit.html?id=${p.id}" class="card product-card">
        <div class="card-img-wrap">
          <img src="${img}" alt="${p.name}" loading="lazy" onerror="this.src='img/logo.svg'">
          ${p.is_featured ? '<span class="badge badge-featured">S\u00e9lection</span>' : ''}
          ${categoryBadge}
        </div>
        <div class="card-body">
          <h3 class="card-title">${p.name}</h3>
          <p class="card-subtitle">${p.appellation || p.region || ''}</p>
          <div class="card-footer">
            <span class="card-price">${formatPrice(p.price_ttc || p.price)}</span>
            ${p.vintage ? `<span class="card-vintage">${p.vintage}</span>` : ''}
          </div>
        </div>
      </a>`;
  }

  // ─── INDEX ───────────────────────────────────────
  async function initIndex() {
    // Featured products
    const grid = $('#featured-grid');
    if (grid) {
      try {
        const data = await API.catalog.featured();
        const products = data.products || data;
        if (products.length) {
          grid.innerHTML = products.map(productCard).join('');
        } else {
          grid.innerHTML = '<p class="text-muted">Aucune s\u00e9lection pour le moment.</p>';
        }
      } catch {
        grid.innerHTML = '<p class="text-muted">Impossible de charger les produits.</p>';
      }
    }

    // Categories
    const catGrid = $('#categories-grid');
    if (catGrid) {
      try {
        const data = await API.categories.list();
        const categories = data.categories || data;
        if (Array.isArray(categories) && categories.length) {
          catGrid.innerHTML = categories.map(c => `
            <a href="boutique.html?category=${c.id}" class="card category-card">
              <div class="category-icon" style="background:${c.color || 'var(--wine-100)'}">
                ${getCategoryIcon(c.name)}
              </div>
              <h3>${c.name}</h3>
              <p>${c.product_count || ''} ${c.product_count ? 'vin' + (c.product_count > 1 ? 's' : '') : ''}</p>
            </a>
          `).join('');
        }
      } catch { /* silent */ }
    }

    // Referral banner
    showReferralBanner();
  }

  function getCategoryIcon(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('rouge')) return '<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="12" r="10" fill="#722F37"/></svg>';
    if (n.includes('blanc')) return '<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="12" r="10" fill="#F5E6CA"/></svg>';
    if (n.includes('effervescent') || n.includes('cr\u00e9mant')) return '<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="12" r="10" fill="#FAD6A5"/></svg>';
    if (n.includes('coffret')) return '<svg viewBox="0 0 24 24" width="32" height="32"><rect x="4" y="6" width="16" height="12" rx="2" fill="#C4A35A"/></svg>';
    if (n.includes('sans alcool') || n.includes('jus')) return '<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="12" r="10" fill="#8BC34A"/></svg>';
    return '<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="12" cy="12" r="10" fill="#ab2049"/></svg>';
  }

  function showReferralBanner() {
    const code = Cart.getReferralCode();
    if (!code) return;
    const banner = document.createElement('div');
    banner.className = 'referral-banner';
    banner.innerHTML = `
      <span>Vous avez \u00e9t\u00e9 invit\u00e9(e) avec le code <strong>${code}</strong></span>
      <button onclick="this.parentElement.remove()" class="btn-close">&times;</button>`;
    document.body.prepend(banner);
  }

  // ─── BOUTIQUE ────────────────────────────────────
  let currentFilters = { page: 1, limit: 12 };

  async function initBoutique() {
    // Capture URL params as initial filters
    const params = new URLSearchParams(window.location.search);
    if (params.get('category')) currentFilters.category = params.get('category');
    if (params.get('color')) currentFilters.color = params.get('color');
    if (params.get('region')) currentFilters.region = params.get('region');
    if (params.get('search')) currentFilters.search = params.get('search');

    await loadFilters();
    await loadCatalog();
    showReferralBanner();
  }

  async function loadFilters() {
    const filtersBar = $('#filters-bar');
    if (!filtersBar) return;
    try {
      const [filterData, catData] = await Promise.all([
        API.catalog.filters(),
        API.categories.list(),
      ]);
      const filters = filterData.filters || filterData;
      const categories = catData.categories || catData;

      let html = '';

      // Search
      html += `<div class="filter-group">
        <input type="search" id="filter-search" class="filter-input" placeholder="Rechercher..." value="${currentFilters.search || ''}">
      </div>`;

      // Color chips
      if (filters.colors && filters.colors.length) {
        html += '<div class="filter-group filter-chips">';
        html += '<button class="chip ${!currentFilters.color ? "chip-active" : ""}" data-color="">Tous</button>';
        filters.colors.forEach(c => {
          const active = currentFilters.color === c ? 'chip-active' : '';
          const colorDot = `<span class="color-dot color-${c.toLowerCase()}"></span>`;
          html += `<button class="chip ${active}" data-color="${c}">${colorDot}${c}</button>`;
        });
        html += '</div>';
      }

      // Categories
      if (Array.isArray(categories) && categories.length) {
        html += '<div class="filter-group filter-chips">';
        html += `<button class="chip ${!currentFilters.category ? 'chip-active' : ''}" data-category="">Toutes</button>`;
        categories.forEach(c => {
          const active = String(currentFilters.category) === String(c.id) ? 'chip-active' : '';
          html += `<button class="chip ${active}" data-category="${c.id}">${c.name}</button>`;
        });
        html += '</div>';
      }

      // Region select
      if (filters.regions && filters.regions.length) {
        html += `<div class="filter-group">
          <select id="filter-region" class="filter-select">
            <option value="">Toutes les r\u00e9gions</option>
            ${filters.regions.map(r => `<option value="${r}" ${currentFilters.region === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
        </div>`;
      }

      filtersBar.innerHTML = html;

      // Event listeners
      const searchInput = $('#filter-search');
      if (searchInput) {
        let debounce;
        searchInput.addEventListener('input', () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => {
            currentFilters.search = searchInput.value;
            currentFilters.page = 1;
            loadCatalog();
          }, 400);
        });
      }

      $$('[data-color]', filtersBar).forEach(btn => {
        btn.addEventListener('click', () => {
          currentFilters.color = btn.dataset.color || undefined;
          currentFilters.page = 1;
          $$('[data-color]', filtersBar).forEach(b => b.classList.remove('chip-active'));
          btn.classList.add('chip-active');
          loadCatalog();
        });
      });

      $$('[data-category]', filtersBar).forEach(btn => {
        btn.addEventListener('click', () => {
          currentFilters.category = btn.dataset.category || undefined;
          currentFilters.page = 1;
          $$('[data-category]', filtersBar).forEach(b => b.classList.remove('chip-active'));
          btn.classList.add('chip-active');
          loadCatalog();
        });
      });

      const regionSelect = $('#filter-region');
      if (regionSelect) {
        regionSelect.addEventListener('change', () => {
          currentFilters.region = regionSelect.value || undefined;
          currentFilters.page = 1;
          loadCatalog();
        });
      }
    } catch { /* silent */ }
  }

  async function loadCatalog() {
    const grid = $('#catalog-grid');
    const paginationEl = $('#pagination');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-spinner"></div>';
    try {
      const data = await API.catalog.list(currentFilters);
      const products = data.products || data.data || [];
      const pagination = data.pagination || {};

      if (products.length) {
        grid.innerHTML = products.map(productCard).join('');
      } else {
        grid.innerHTML = '<p class="text-muted text-center">Aucun produit trouv\u00e9.</p>';
      }

      // Pagination
      if (paginationEl && pagination.total_pages > 1) {
        let pHtml = '';
        if (pagination.page > 1) {
          pHtml += `<button class="btn btn-secondary btn-sm" data-page="${pagination.page - 1}">&laquo; Pr\u00e9c\u00e9dent</button>`;
        }
        pHtml += `<span class="pagination-info">Page ${pagination.page} / ${pagination.total_pages}</span>`;
        if (pagination.page < pagination.total_pages) {
          pHtml += `<button class="btn btn-secondary btn-sm" data-page="${pagination.page + 1}">Suivant &raquo;</button>`;
        }
        paginationEl.innerHTML = pHtml;
        $$('[data-page]', paginationEl).forEach(btn => {
          btn.addEventListener('click', () => {
            currentFilters.page = parseInt(btn.dataset.page);
            loadCatalog();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          });
        });
        paginationEl.style.display = 'flex';
      } else if (paginationEl) {
        paginationEl.style.display = 'none';
      }
    } catch {
      grid.innerHTML = '<p class="text-muted text-center">Erreur de chargement du catalogue.</p>';
    }
  }

  // ─── PRODUIT ─────────────────────────────────────
  async function initProduit() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const container = $('#product-detail');
    if (!id || !container) return;

    container.innerHTML = '<div class="loading-spinner"></div>';
    try {
      const data = await API.catalog.detail(id);
      const p = data.product || data;

      document.title = `${p.name} — Vins & Conversations`;

      container.innerHTML = `
        <div class="product-layout">
          <div class="product-image">
            <img src="${p.image_url || 'img/logo.svg'}" alt="${p.name}" onerror="this.src='img/logo.svg'">
          </div>
          <div class="product-info">
            <nav class="breadcrumb">
              <a href="boutique.html">Nos vins</a> &rsaquo; <span>${p.name}</span>
            </nav>
            ${p.category_name ? `<span class="badge badge-category">${p.category_name}</span>` : ''}
            <h1>${p.name}</h1>
            <p class="product-appellation">${p.appellation || ''}</p>
            <div class="product-meta">
              ${p.region ? `<span>R\u00e9gion : ${p.region}</span>` : ''}
              ${p.vintage ? `<span>Mill\u00e9sime : ${p.vintage}</span>` : ''}
              ${p.color ? `<span>Couleur : ${p.color}</span>` : ''}
              ${p.volume ? `<span>Volume : ${p.volume}</span>` : ''}
            </div>
            <div class="product-price">${formatPrice(p.price_ttc || p.price)}</div>
            <p class="product-description">${p.description || ''}</p>

            <div class="product-actions">
              <div class="qty-selector">
                <button class="btn btn-secondary btn-sm" id="qty-minus">-</button>
                <input type="number" id="qty-input" value="1" min="1" max="99">
                <button class="btn btn-secondary btn-sm" id="qty-plus">+</button>
              </div>
              <button class="btn btn-primary" id="btn-add-cart">Ajouter au panier</button>
            </div>

            ${p.tasting_notes ? `
              <div class="product-section">
                <h3>Notes de d\u00e9gustation</h3>
                <p>${p.tasting_notes}</p>
              </div>` : ''}
            ${p.food_pairings ? `
              <div class="product-section">
                <h3>Accords mets & vins</h3>
                <p>${p.food_pairings}</p>
              </div>` : ''}
            ${p.awards ? `
              <div class="product-section">
                <h3>R\u00e9compenses</h3>
                <p>${p.awards}</p>
              </div>` : ''}
          </div>
        </div>`;

      // Qty controls
      const qtyInput = $('#qty-input');
      $('#qty-minus').addEventListener('click', () => {
        qtyInput.value = Math.max(1, parseInt(qtyInput.value) - 1);
      });
      $('#qty-plus').addEventListener('click', () => {
        qtyInput.value = Math.min(99, parseInt(qtyInput.value) + 1);
      });

      // Add to cart
      $('#btn-add-cart').addEventListener('click', async () => {
        const qty = parseInt(qtyInput.value) || 1;
        await Cart.addItem(p.id, qty);
      });
    } catch {
      container.innerHTML = '<p class="text-muted">Produit introuvable.</p>';
    }
  }

  // ─── PANIER ──────────────────────────────────────
  async function initPanier() {
    const container = $('#cart-content');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner"></div>';
    try {
      const data = await Cart.load();
      const items = data.items || [];

      if (!items.length) {
        container.innerHTML = `
          <div class="empty-state">
            <h2>Votre panier est vide</h2>
            <p>D\u00e9couvrez notre s\u00e9lection de vins</p>
            <a href="boutique.html" class="btn btn-primary">Voir le catalogue</a>
          </div>`;
        return;
      }

      renderCart(items, data);
    } catch {
      container.innerHTML = '<p class="text-muted">Erreur de chargement du panier.</p>';
    }
  }

  function renderCart(items, data) {
    const container = $('#cart-content');
    const subtotal = items.reduce((s, i) => s + (i.price_ttc || i.price || 0) * i.quantity, 0);
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);

    container.innerHTML = `
      <div class="cart-table">
        <div class="cart-header">
          <span>Produit</span><span>Prix</span><span>Quantit\u00e9</span><span>Sous-total</span><span></span>
        </div>
        ${items.map(item => `
          <div class="cart-row" data-id="${item.product_id}">
            <div class="cart-product">
              <img src="${item.image_url || 'img/logo.svg'}" alt="${item.name || 'Produit'}" onerror="this.src='img/logo.svg'">
              <span>${item.name || `Produit #${item.product_id}`}</span>
            </div>
            <span class="cart-price">${formatPrice(item.price_ttc || item.price || 0)}</span>
            <div class="qty-selector">
              <button class="btn btn-secondary btn-sm btn-qty-minus" data-id="${item.product_id}">-</button>
              <span>${item.quantity}</span>
              <button class="btn btn-secondary btn-sm btn-qty-plus" data-id="${item.product_id}">+</button>
            </div>
            <span class="cart-subtotal">${formatPrice((item.price_ttc || item.price || 0) * item.quantity)}</span>
            <button class="btn btn-close btn-remove" data-id="${item.product_id}">&times;</button>
          </div>
        `).join('')}
      </div>
      <div class="cart-summary">
        <div class="cart-totals">
          <div class="cart-total-row"><span>Sous-total (${totalQty} article${totalQty > 1 ? 's' : ''})</span><span>${formatPrice(subtotal)}</span></div>
          <div class="cart-total-row"><span>Frais de port</span><span>Calcul\u00e9s au checkout</span></div>
          <div class="cart-total-row cart-total-main"><span>Total TTC</span><span>${formatPrice(data.total_ttc || subtotal)}</span></div>
        </div>
        <div class="cart-actions">
          <a href="boutique.html" class="btn btn-secondary">Continuer mes achats</a>
          <a href="checkout.html" class="btn btn-primary">Passer commande</a>
        </div>
      </div>`;

    // Qty handlers
    $$('.btn-qty-minus').forEach(btn => btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      const item = items.find(i => i.product_id === id);
      if (item) await Cart.updateQty(id, item.quantity - 1);
      initPanier();
    }));
    $$('.btn-qty-plus').forEach(btn => btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      const item = items.find(i => i.product_id === id);
      if (item) await Cart.updateQty(id, item.quantity + 1);
      initPanier();
    }));
    $$('.btn-remove').forEach(btn => btn.addEventListener('click', async () => {
      await Cart.removeItem(parseInt(btn.dataset.id));
      initPanier();
    }));
  }

  // ─── CHECKOUT ────────────────────────────────────
  async function initCheckout() {
    const container = $('#checkout-content');
    if (!container) return;

    // Load cart
    const cartData = await Cart.load();
    const items = cartData.items || [];
    if (!items.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h2>Votre panier est vide</h2>
          <a href="boutique.html" class="btn btn-primary">Voir le catalogue</a>
        </div>`;
      return;
    }

    renderCheckout(items, cartData);
  }

  function renderCheckout(items, cartData) {
    const container = $('#checkout-content');
    const subtotal = items.reduce((s, i) => s + (i.price_ttc || i.price || 0) * i.quantity, 0);
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);

    container.innerHTML = `
      <div class="checkout-layout">
        <div class="checkout-form">
          <h2>Vos informations</h2>
          <form id="checkout-form">
            <div class="form-row">
              <div class="form-group">
                <label for="customer_name">Nom complet *</label>
                <input type="text" id="customer_name" name="customer_name" required>
              </div>
            </div>
            <div class="form-row form-row-2">
              <div class="form-group">
                <label for="email">Email *</label>
                <input type="email" id="email" name="email" required>
              </div>
              <div class="form-group">
                <label for="phone">T\u00e9l\u00e9phone</label>
                <input type="tel" id="phone" name="phone">
              </div>
            </div>
            <div class="form-group">
              <label for="address">Adresse *</label>
              <input type="text" id="address" name="address" required>
            </div>
            <div class="form-row form-row-2">
              <div class="form-group">
                <label for="city">Ville *</label>
                <input type="text" id="city" name="city" required>
              </div>
              <div class="form-group">
                <label for="postal_code">Code postal *</label>
                <input type="text" id="postal_code" name="postal_code" required pattern="[0-9]{5}" maxlength="5">
              </div>
            </div>
            <div id="shipping-info" class="shipping-info" style="display:none">
              <span id="shipping-label">Frais de port :</span>
              <span id="shipping-amount"></span>
            </div>
            <div id="stripe-card" class="stripe-card-element" style="display:none">
              <label>Paiement par carte</label>
              <div id="card-element"></div>
              <div id="card-errors" class="form-error"></div>
            </div>
            <button type="submit" class="btn btn-primary btn-lg btn-full" id="btn-pay">Confirmer et payer</button>
          </form>
        </div>
        <div class="checkout-summary">
          <h3>R\u00e9sum\u00e9 de commande</h3>
          ${items.map(i => `
            <div class="checkout-item">
              <span>${i.name || 'Produit'} &times; ${i.quantity}</span>
              <span>${formatPrice((i.price_ttc || i.price || 0) * i.quantity)}</span>
            </div>
          `).join('')}
          <div class="checkout-item checkout-subtotal">
            <span>Sous-total</span><span>${formatPrice(subtotal)}</span>
          </div>
          <div class="checkout-item" id="summary-shipping" style="display:none">
            <span>Livraison</span><span id="summary-shipping-amount"></span>
          </div>
          <div class="checkout-item checkout-total">
            <span>Total TTC</span><span id="summary-total">${formatPrice(subtotal)}</span>
          </div>
        </div>
      </div>`;

    let shippingCost = 0;

    // Shipping calc on postal code blur
    const postalInput = $('#postal_code');
    postalInput.addEventListener('blur', async () => {
      const cp = postalInput.value.trim();
      if (cp.length === 5 && /^\d{5}$/.test(cp)) {
        try {
          const res = await API.shipping.calculate(cp, totalQty);
          shippingCost = res.shipping_cost || res.cost || 0;
          $('#shipping-info').style.display = 'flex';
          $('#shipping-amount').textContent = shippingCost > 0 ? formatPrice(shippingCost) : 'Offerts';
          $('#summary-shipping').style.display = 'flex';
          $('#summary-shipping-amount').textContent = shippingCost > 0 ? formatPrice(shippingCost) : 'Offerts';
          $('#summary-total').textContent = formatPrice(subtotal + shippingCost);
        } catch {
          $('#shipping-info').style.display = 'flex';
          $('#shipping-amount').textContent = 'Non disponible';
        }
      }
    });

    // Form submission
    const form = $('#checkout-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#btn-pay');
      btn.disabled = true;
      btn.textContent = 'Traitement en cours...';

      try {
        const formData = {
          session_id: Cart.getSessionId(),
          customer_name: form.customer_name.value,
          email: form.email.value,
          phone: form.phone.value || undefined,
          shipping_address: {
            address: form.address.value,
            city: form.city.value,
            postal_code: form.postal_code.value,
          },
          referral_code: Cart.getReferralCode() || undefined,
        };

        const result = await API.checkout.create(formData);

        if (result.client_secret) {
          // Stripe payment
          await handleStripePayment(result, formData);
        } else {
          // Direct confirmation
          Cart.clear();
          window.location.href = `confirmation.html?ref=${result.order_ref || result.reference}`;
        }
      } catch (err) {
        Toast.show(err.message || 'Erreur lors de la commande', 'error');
        btn.disabled = false;
        btn.textContent = 'Confirmer et payer';
      }
    });
  }

  async function handleStripePayment(checkoutResult, formData) {
    // Check if Stripe.js is loaded
    if (typeof Stripe === 'undefined') {
      // Load Stripe.js dynamically
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    const stripe = Stripe(checkoutResult.publishable_key);
    const elements = stripe.elements({ clientSecret: checkoutResult.client_secret });

    const cardContainer = $('#stripe-card');
    cardContainer.style.display = 'block';

    const cardElement = elements.create('card', {
      style: {
        base: { fontSize: '16px', color: '#32325d', fontFamily: 'system-ui, sans-serif' },
      },
    });
    cardElement.mount('#card-element');

    cardElement.on('change', (event) => {
      const errors = $('#card-errors');
      errors.textContent = event.error ? event.error.message : '';
    });

    const btn = $('#btn-pay');
    btn.disabled = false;
    btn.textContent = 'Payer maintenant';

    // Replace form handler
    const form = $('#checkout-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = 'Paiement en cours...';

      const { error, paymentIntent } = await stripe.confirmCardPayment(checkoutResult.client_secret, {
        payment_method: { card: cardElement },
      });

      if (error) {
        Toast.show(error.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Payer maintenant';
      } else if (paymentIntent.status === 'succeeded') {
        try {
          await API.checkout.confirm({
            payment_intent_id: paymentIntent.id,
            order_id: checkoutResult.order_id,
          });
        } catch { /* confirmation will happen via webhook */ }
        Cart.clear();
        window.location.href = `confirmation.html?ref=${checkoutResult.order_ref || checkoutResult.reference}`;
      }
    };
  }

  // ─── CONFIRMATION ────────────────────────────────
  function initConfirmation() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const refEl = $('#order-ref');
    if (refEl && ref) refEl.textContent = ref;
    const linkEl = $('#tracking-link');
    if (linkEl && ref) linkEl.href = `suivi.html?ref=${ref}`;
  }

  // ─── SUIVI ───────────────────────────────────────
  function initSuivi() {
    const form = $('#tracking-form');
    const result = $('#tracking-result');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ref = form.ref.value.trim();
      const email = form.email.value.trim();
      if (!ref || !email) return;

      result.innerHTML = '<div class="loading-spinner"></div>';
      try {
        const data = await API.order.track(ref, email);
        const order = data.order || data;
        const statusLabels = {
          pending: 'En attente', confirmed: 'Confirm\u00e9e', preparing: 'En pr\u00e9paration',
          shipped: 'Exp\u00e9di\u00e9e', delivered: 'Livr\u00e9e', cancelled: 'Annul\u00e9e',
        };
        result.innerHTML = `
          <div class="tracking-card">
            <h3>Commande ${order.reference || ref}</h3>
            <div class="tracking-status badge badge-${order.status || 'pending'}">
              ${statusLabels[order.status] || order.status}
            </div>
            <div class="tracking-details">
              <p>Date : ${new Date(order.created_at).toLocaleDateString('fr-FR')}</p>
              <p>Total : ${formatPrice(order.total_ttc || order.total)}</p>
            </div>
            ${order.items ? `
              <div class="tracking-items">
                <h4>Articles</h4>
                ${order.items.map(i => `
                  <div class="tracking-item"><span>${i.name || 'Produit'} &times; ${i.quantity}</span><span>${formatPrice(i.subtotal || i.price * i.quantity)}</span></div>
                `).join('')}
              </div>` : ''}
          </div>`;
      } catch (err) {
        result.innerHTML = `<p class="text-muted">Commande introuvable. V\u00e9rifiez la r\u00e9f\u00e9rence et l'email.</p>`;
      }
    });
  }

  // ─── CONTACT ─────────────────────────────────────
  function initContact() {
    const form = $('#contact-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Envoi en cours...';

      try {
        await API.contact.send({
          name: form.name.value,
          email: form.email.value,
          message: form.message.value,
        });
        Toast.show('Message envoy\u00e9 avec succ\u00e8s !', 'success');
        form.reset();
      } catch (err) {
        Toast.show(err.message || 'Erreur lors de l\'envoi', 'error');
      }
      btn.disabled = false;
      btn.textContent = 'Envoyer';
    });
  }

})();
