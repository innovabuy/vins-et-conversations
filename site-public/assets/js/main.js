/* ============================================
   Vins & Conversations — Boutique JS
   Cart, featured wines, wizard with Chart.js,
   cookie banner, age gate, scroll reveal
   ============================================ */

/* ─── Cart System (localStorage) ───────────── */
const Cart = {
  KEY: 'vc_cart',
  getItems() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; }
  },
  save(items) {
    localStorage.setItem(this.KEY, JSON.stringify(items));
    this.updateBadge();
  },
  add(product) {
    const items = this.getItems();
    const existing = items.find(i => i.id === product.id);
    if (existing) { existing.qty += (product.qty || 1); }
    else { items.push({ id: product.id, name: product.name, price: parseFloat(product.price_ttc || product.price), qty: product.qty || 1, image_url: product.image_url || null, appellation: product.appellation || '' }); }
    this.save(items);
    this.showToast(`${product.name} ajouté au panier`);
  },
  remove(productId) {
    const items = this.getItems().filter(i => i.id !== productId);
    this.save(items);
  },
  updateQty(productId, qty) {
    const items = this.getItems();
    const item = items.find(i => i.id === productId);
    if (item) { item.qty = Math.max(1, qty); }
    this.save(items);
  },
  clear() { this.save([]); },
  getCount() { return this.getItems().reduce((sum, i) => sum + i.qty, 0); },
  getTotal() { return this.getItems().reduce((sum, i) => sum + i.price * i.qty, 0); },
  updateBadge() {
    const count = this.getCount();
    document.querySelectorAll('.cart-badge').forEach(b => {
      b.textContent = count;
      b.style.display = count > 0 ? 'flex' : 'none';
    });
  },
  showToast(msg) {
    let toast = document.getElementById('vc-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'vc-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }
};

/* ─── Init ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  Cart.updateBadge();
  initHeader();
  initMobileMenu();
  initScrollReveal();
  loadFeaturedWines();
  initWizard();
  initCookieBanner();
  initAgeGate();
});

/* ─── Header scroll effect ─────────────────── */
function initHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 50);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ─── Mobile menu ──────────────────────────── */
function initMobileMenu() {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('nav-menu');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }));
}

/* ─── Scroll Reveal ────────────────────────── */
function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');
  if (!reveals.length) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
  reveals.forEach(el => obs.observe(el));
}

/* ─── Helpers ──────────────────────────────── */
function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; }
function getProductImage(product) {
  return product.image_url || '';
}
function resolveWineType(color, category) {
  if (!color && (!category || (category||'').toLowerCase().includes('coffret'))) return 'coffret';
  if (color === 'blanc') { const c = (category||'').toLowerCase(); return (c.includes('moelleux') || c.includes('liquoreux') || c.includes('layon')) ? 'blanc_moelleux' : 'blanc_sec'; }
  if (color === 'rosé') return 'rose';
  if (['rouge', 'effervescent', 'sans_alcool'].includes(color)) return color;
  return 'rouge';
}

/* ─── Tasting criteria per wine type ───────── */
const TASTING_CRITERIA = {
  rouge: ['fruite','mineralite','rondeur','acidite','tanins','boise','longueur','puissance'],
  blanc_sec: ['fruite','mineralite','rondeur','acidite','boise','longueur','puissance'],
  blanc_moelleux: ['fruite','douceur','rondeur','acidite','boise','longueur','puissance'],
  rose: ['fruite','mineralite','rondeur','acidite','longueur','puissance'],
  effervescent: ['fruite','finesse_bulles','fraicheur','rondeur','longueur','puissance'],
  sans_alcool: ['fruite','acidite','douceur','longueur'],
};

const CRITERIA_LABELS = {
  fruite: { label: 'Fruité', low: 'Discret', high: 'Explosif' },
  mineralite: { label: 'Minéralité', low: 'Neutre', high: 'Minéral' },
  rondeur: { label: 'Rondeur', low: 'Vif', high: 'Rond' },
  acidite: { label: 'Acidité', low: 'Doux', high: 'Vif' },
  tanins: { label: 'Tanins', low: 'Soyeux', high: 'Corsé' },
  boise: { label: 'Boisé', low: 'Nature', high: 'Boisé' },
  longueur: { label: 'Longueur', low: 'Court', high: 'Long' },
  puissance: { label: 'Puissance', low: 'Léger', high: 'Puissant' },
  douceur: { label: 'Douceur', low: 'Sec', high: 'Liquoreux' },
  finesse_bulles: { label: 'Bulles', low: 'Grosses', high: 'Fines' },
  fraicheur: { label: 'Fraîcheur', low: 'Tempéré', high: 'Frais' },
};

/* ─── Featured Wines + Add to Cart ─────────── */
let allProducts = []; // cached products from API

async function loadFeaturedWines() {
  const grid = document.getElementById('wines-grid');
  if (!grid) return;
  try {
    const res = await fetch('/api/v1/public/featured');
    if (!res.ok) throw new Error('API error');
    const result = await res.json();
    const wines = result.data || result;
    if (wines && wines.length > 0) {
      grid.innerHTML = wines.slice(0, 4).map(w => renderWineCard(w)).join('');
      grid.querySelectorAll('.btn-add-cart').forEach(btn => btn.addEventListener('click', onAddToCart));
    }
  } catch (err) {
    console.warn('Featured wines fallback to static', err);
    // Add click handlers to static fallback cards
    grid.querySelectorAll('.btn-add-cart').forEach(btn => btn.addEventListener('click', onAddToCart));
  }
}

function renderWineCard(w) {
  return `<div class="wine-card reveal visible">
    <div class="wine-card-img"><img src="${getProductImage(w)}" alt="${escapeHtml(w.name)}" loading="lazy"></div>
    <div class="wine-card-body">
      <h3>${escapeHtml(w.name)}</h3>
      <p class="appellation">${escapeHtml(w.appellation || w.region || '')}</p>
      ${w.label ? `<span class="wine-badge">${escapeHtml(w.label)}</span>` : ''}
      <div class="wine-price">${parseFloat(w.price_ttc || w.price).toFixed(2)} € <small>TTC</small></div>
      <button class="btn btn-wine btn-sm btn-add-cart" data-id="${w.id}" data-name="${escapeHtml(w.name)}" data-price="${w.price_ttc||w.price}" data-img="${getProductImage(w)}" data-appellation="${escapeHtml(w.appellation||'')}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
        Ajouter
      </button>
    </div>
  </div>`;
}

function onAddToCart(e) {
  const btn = e.currentTarget;
  Cart.add({
    id: btn.dataset.id || 'static-' + btn.dataset.name,
    name: btn.dataset.name,
    price_ttc: btn.dataset.price,
    image_url: btn.dataset.img,
    appellation: btn.dataset.appellation,
  });
}

/* ─── Full Wizard ──────────────────────────── */
function initWizard() {
  const overlay = document.getElementById('wizard-overlay');
  if (!overlay) return;
  const openBtn = document.getElementById('open-wizard');
  const modal = overlay.querySelector('.wizard-modal');
  let step = 0, selectedType = null, userPrefs = {};
  let winesCatalog = [];

  async function loadCatalog() {
    if (winesCatalog.length) return;
    try {
      const r = await fetch('/api/v1/public/catalog?limit=50');
      if (!r.ok) throw new Error();
      const result = await r.json();
      winesCatalog = (result.data || result.products || result).filter(w => w.tasting_notes);
      allProducts = winesCatalog;
    } catch { winesCatalog = []; }
  }

  function open() { step = 0; selectedType = null; userPrefs = {}; loadCatalog().then(() => renderWizardStep()); overlay.classList.add('active'); document.body.style.overflow = 'hidden'; }
  function close() { overlay.classList.remove('active'); document.body.style.overflow = ''; }

  // Wine type icons (SVG)
  const typeIcons = {
    rouge: '<svg viewBox="0 0 40 40" fill="none"><path d="M20 4c-4 0-8 6-8 14 0 6 3.5 10 8 10s8-4 8-10c0-8-4-14-8-14z" fill="#722F37"/><rect x="18" y="28" width="4" height="8" rx="1" fill="#722F37"/><rect x="14" y="36" width="12" height="2" rx="1" fill="#722F37"/></svg>',
    blanc_sec: '<svg viewBox="0 0 40 40" fill="none"><path d="M20 4c-4 0-8 6-8 14 0 6 3.5 10 8 10s8-4 8-10c0-8-4-14-8-14z" fill="#E8D5A3"/><rect x="18" y="28" width="4" height="8" rx="1" fill="#C4A55A"/><rect x="14" y="36" width="12" height="2" rx="1" fill="#C4A55A"/></svg>',
    blanc_moelleux: '<svg viewBox="0 0 40 40" fill="none"><path d="M20 4c-4 0-8 6-8 14 0 6 3.5 10 8 10s8-4 8-10c0-8-4-14-8-14z" fill="#F0D68A"/><rect x="18" y="28" width="4" height="8" rx="1" fill="#D4A930"/><rect x="14" y="36" width="12" height="2" rx="1" fill="#D4A930"/></svg>',
    effervescent: '<svg viewBox="0 0 40 40" fill="none"><path d="M16 8h8l2 18H14L16 8z" fill="#E8E4D0"/><circle cx="18" cy="14" r="1" fill="#fff" opacity=".7"/><circle cx="22" cy="18" r="1.2" fill="#fff" opacity=".6"/><circle cx="19" cy="22" r=".8" fill="#fff" opacity=".5"/><rect x="14" y="26" width="12" height="2" rx="1" fill="#C4A55A"/></svg>',
    rose: '<svg viewBox="0 0 40 40" fill="none"><path d="M20 4c-4 0-8 6-8 14 0 6 3.5 10 8 10s8-4 8-10c0-8-4-14-8-14z" fill="#E8A0B0"/><rect x="18" y="28" width="4" height="8" rx="1" fill="#D08090"/><rect x="14" y="36" width="12" height="2" rx="1" fill="#D08090"/></svg>',
    tous: '<svg viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="14" fill="none" stroke="#C4A55A" stroke-width="2"/><text x="20" y="24" text-anchor="middle" font-size="14" fill="#C4A55A">?</text></svg>'
  };

  const typeLabels = {
    rouge: 'Rouge', blanc_sec: 'Blanc Sec', blanc_moelleux: 'Moelleux',
    effervescent: 'Effervescent', rose: 'Rosé', tous: 'Guidez-moi'
  };

  function renderWizardStep() {
    if (step === 0) renderTypeSelection();
    else if (step === 1) renderSliders();
    else renderResults();
  }

  function renderTypeSelection() {
    modal.innerHTML = `
      <button class="wizard-close" aria-label="Fermer">&times;</button>
      <div class="wizard-progress"><div class="wizard-progress-dot active"></div><div class="wizard-progress-dot"></div><div class="wizard-progress-dot"></div></div>
      <h2>Quel type de vin cherchez-vous ?</h2>
      <p class="wizard-subtitle">Étape 1 sur 3 — Choisissez un style</p>
      <div class="wizard-type-grid">
        ${Object.keys(typeLabels).map(t => `
          <button class="wizard-type-btn" data-type="${t}">
            <div class="type-icon">${typeIcons[t]}</div>
            <span>${typeLabels[t]}</span>
          </button>
        `).join('')}
      </div>
      <a href="#selection" class="wizard-skip" onclick="document.getElementById('wizard-overlay').classList.remove('active');document.body.style.overflow=''">Voir tout le catalogue directement &rarr;</a>
    `;
    modal.querySelector('.wizard-close').addEventListener('click', close);
    modal.querySelectorAll('.wizard-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedType = btn.dataset.type;
        step = 1;
        renderWizardStep();
      });
    });
  }

  function renderSliders() {
    const criteria = selectedType === 'tous'
      ? ['fruite','rondeur','acidite','puissance','longueur','boise']
      : (TASTING_CRITERIA[selectedType] || TASTING_CRITERIA.rouge);

    modal.innerHTML = `
      <button class="wizard-close" aria-label="Fermer">&times;</button>
      <div class="wizard-progress"><div class="wizard-progress-dot active"></div><div class="wizard-progress-dot active"></div><div class="wizard-progress-dot"></div></div>
      <h2>Vos préférences gustatives</h2>
      <p class="wizard-subtitle">Étape 2 sur 3 — Ajustez les curseurs selon vos goûts</p>
      <div class="wizard-sliders">
        ${criteria.map(key => {
          const c = CRITERIA_LABELS[key] || { label: key, low: '0', high: '5' };
          return `<div class="slider-row">
            <label>${c.label}</label>
            <div class="slider-wrap">
              <span class="slider-hint">${c.low}</span>
              <input type="range" min="0" max="5" value="3" data-key="${key}" class="tasting-slider">
              <span class="slider-hint">${c.high}</span>
            </div>
            <span class="slider-val">3</span>
          </div>`;
        }).join('')}
      </div>
      <div class="wizard-nav">
        <button class="btn btn-outline wizard-prev">Retour</button>
        <button class="btn btn-wine wizard-next">Voir les résultats</button>
      </div>
    `;
    modal.querySelector('.wizard-close').addEventListener('click', close);
    modal.querySelector('.wizard-prev').addEventListener('click', () => { step = 0; renderWizardStep(); });
    modal.querySelectorAll('.tasting-slider').forEach(s => {
      s.addEventListener('input', () => { s.closest('.slider-row').querySelector('.slider-val').textContent = s.value; });
    });
    modal.querySelector('.wizard-next').addEventListener('click', () => {
      userPrefs = {};
      modal.querySelectorAll('.tasting-slider').forEach(s => { userPrefs[s.dataset.key] = parseInt(s.value); });
      step = 2;
      renderWizardStep();
    });
  }

  function renderResults() {
    // Filter wines by type, calculate match
    let wines = winesCatalog.filter(w => w.tasting_notes);
    if (selectedType !== 'tous') {
      wines = wines.filter(w => resolveWineType(w.color, w.category) === selectedType);
    }
    // If no wines for this type, show all
    if (!wines.length) wines = winesCatalog.filter(w => w.tasting_notes);

    const scored = wines.map(w => {
      const notes = w.tasting_notes;
      let totalDist = 0, axes = 0;
      Object.keys(userPrefs).forEach(k => {
        if (notes[k] !== undefined) {
          totalDist += Math.pow(userPrefs[k] - notes[k], 2);
          axes++;
        }
      });
      const maxDist = axes * 25; // max possible distance (5^2 per axis)
      const match = maxDist > 0 ? Math.round((1 - totalDist / maxDist) * 100) : 50;
      return { ...w, match };
    }).sort((a, b) => b.match - a.match).slice(0, 6);

    modal.innerHTML = `
      <button class="wizard-close" aria-label="Fermer">&times;</button>
      <div class="wizard-progress"><div class="wizard-progress-dot active"></div><div class="wizard-progress-dot active"></div><div class="wizard-progress-dot active"></div></div>
      <h2>Nos recommandations pour vous</h2>
      <p class="wizard-subtitle">${scored.length} vins correspondent à vos goûts</p>
      <div class="wizard-results-grid">
        ${scored.map((w, i) => `
          <div class="wizard-result-card" data-idx="${i}">
            <div class="match-badge">${w.match}%</div>
            <div class="result-img"><img src="${getProductImage(w)}" alt="${escapeHtml(w.name)}" loading="lazy"></div>
            <div class="result-info">
              <h4>${escapeHtml(w.name)}</h4>
              <p class="result-appellation">${escapeHtml(w.appellation || '')}</p>
              ${w.label ? `<span class="wine-badge">${escapeHtml(w.label)}</span>` : ''}
              <div class="result-price">${parseFloat(w.price_ttc).toFixed(2)} €</div>
              <canvas class="mini-radar" width="120" height="120" data-widx="${i}"></canvas>
            </div>
            <button class="btn btn-wine btn-sm btn-add-cart" data-id="${w.id}" data-name="${escapeHtml(w.name)}" data-price="${w.price_ttc}" data-img="${getProductImage(w)}" data-appellation="${escapeHtml(w.appellation||'')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
              Ajouter au panier
            </button>
          </div>
        `).join('')}
      </div>
      <div class="wizard-nav">
        <button class="btn btn-outline wizard-prev">Recommencer</button>
        <a href="boutique.html" class="btn btn-wine">Voir tout le catalogue</a>
      </div>
    `;
    modal.querySelector('.wizard-close').addEventListener('click', close);
    modal.querySelector('.wizard-prev').addEventListener('click', () => { step = 0; renderWizardStep(); });
    modal.querySelectorAll('.btn-add-cart').forEach(btn => btn.addEventListener('click', onAddToCart));

    // Draw mini radar charts
    setTimeout(() => {
      scored.forEach((w, i) => {
        const canvas = modal.querySelector(`canvas[data-widx="${i}"]`);
        if (canvas) drawMiniRadar(canvas, w.tasting_notes, userPrefs);
      });
    }, 50);
  }

  if (openBtn) openBtn.addEventListener('click', open);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

/* ─── Mini Radar Chart (Canvas 2D) ─────────── */
function drawMiniRadar(canvas, wineNotes, userPrefs) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 10;

  const keys = Object.keys(wineNotes).filter(k => wineNotes[k] !== undefined);
  if (keys.length < 3) return;
  const n = keys.length;
  const angleStep = (2 * Math.PI) / n;

  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 0.5;
  for (let ring = 1; ring <= 5; ring++) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + i * angleStep;
      const r = R * ring / 5;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Wine profile (filled)
  ctx.beginPath();
  keys.forEach((k, i) => {
    const a = -Math.PI / 2 + i * angleStep;
    const v = (wineNotes[k] || 0) / 5;
    const x = cx + R * v * Math.cos(a), y = cy + R * v * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(114, 47, 55, 0.2)';
  ctx.fill();
  ctx.strokeStyle = '#722F37';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // User preferences (dashed golden)
  if (userPrefs && Object.keys(userPrefs).length) {
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    keys.forEach((k, i) => {
      const a = -Math.PI / 2 + i * angleStep;
      const v = (userPrefs[k] || 0) / 5;
      const x = cx + R * v * Math.cos(a), y = cy + R * v * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = '#C4A55A';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* ─── Cookie Banner ────────────────────────── */
function initCookieBanner() {
  if (localStorage.getItem('vc_cookies_consent')) return;
  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.innerHTML = `
    <div class="cookie-inner">
      <p>Ce site utilise des cookies essentiels pour le panier et la navigation. <a href="confidentialite.html">En savoir plus</a></p>
      <div class="cookie-buttons">
        <button class="btn btn-sm btn-wine" id="cookie-accept">Accepter</button>
        <button class="btn btn-sm btn-outline" id="cookie-refuse">Refuser</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner.classList.add('show'), 500);
  document.getElementById('cookie-accept').addEventListener('click', () => {
    localStorage.setItem('vc_cookies_consent', 'accepted');
    banner.classList.remove('show');
    setTimeout(() => banner.remove(), 300);
  });
  document.getElementById('cookie-refuse').addEventListener('click', () => {
    localStorage.setItem('vc_cookies_consent', 'refused');
    banner.classList.remove('show');
    setTimeout(() => banner.remove(), 300);
  });
}

/* ─── Age Gate ─────────────────────────────── */
function initAgeGate() {
  if (sessionStorage.getItem('vc_age_verified')) return;
  const gate = document.createElement('div');
  gate.id = 'age-gate';
  gate.innerHTML = `
    <div class="age-gate-modal">
      <img src="assets/images/logo-vc.jpeg" alt="V&C" class="age-gate-logo">
      <h2>Bienvenue chez Vins & Conversations</h2>
      <p>Ce site propose la vente de boissons alcoolisées.<br>Vous devez avoir l'âge légal pour continuer.</p>
      <div class="age-gate-buttons">
        <button class="btn btn-wine" id="age-yes">J'ai plus de 18 ans</button>
        <button class="btn btn-outline" id="age-no">Je suis mineur</button>
      </div>
      <p class="age-gate-warning">L'abus d'alcool est dangereux pour la santé. À consommer avec modération.</p>
    </div>
  `;
  document.body.appendChild(gate);
  document.body.style.overflow = 'hidden';
  document.getElementById('age-yes').addEventListener('click', () => {
    sessionStorage.setItem('vc_age_verified', 'true');
    gate.classList.add('fade-out');
    document.body.style.overflow = '';
    setTimeout(() => gate.remove(), 400);
  });
  document.getElementById('age-no').addEventListener('click', () => {
    gate.querySelector('.age-gate-modal').innerHTML = '<h2>Accès refusé</h2><p>Vous devez avoir 18 ans ou plus pour accéder à ce site.</p><p style="margin-top:20px"><a href="https://www.google.com" style="color:var(--gold)">Quitter le site</a></p>';
  });
}
