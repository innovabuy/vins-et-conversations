const db = require('../config/database');
const { getRedis } = require('../middleware/cache');

const CART_TTL = 86400; // 24h
const CART_PREFIX = 'vc:cart:';

// In-memory fallback for when Redis is unavailable (test env)
const memoryStore = new Map();

async function getStore() {
  const redis = getRedis();
  if (redis) return { type: 'redis', client: redis };
  return { type: 'memory' };
}

/**
 * Get cart by session ID
 */
async function getCart(sessionId) {
  const store = await getStore();
  const key = CART_PREFIX + sessionId;

  let raw;
  if (store.type === 'redis') {
    raw = await store.client.get(key);
  } else {
    const entry = memoryStore.get(key);
    if (entry && entry.expires > Date.now()) {
      raw = entry.data;
    } else {
      memoryStore.delete(key);
    }
  }

  if (!raw) return { items: [], total_ht: 0, total_ttc: 0, total_items: 0 };
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/**
 * Update cart — server-authoritative pricing
 * @param {string} sessionId
 * @param {Array} items - [{ product_id, qty }]
 * @returns {Object} cart with server-computed prices
 */
async function updateCart(sessionId, items) {
  if (!items || items.length === 0) {
    await deleteCart(sessionId);
    return { items: [], total_ht: 0, total_ttc: 0, total_items: 0 };
  }

  // Fetch product info from DB (server-authoritative pricing)
  const productIds = items.map((i) => i.product_id);
  const products = await db('products')
    .whereIn('id', productIds)
    .where({ active: true, visible_boutique: true })
    .select('id', 'name', 'price_ht', 'price_ttc', 'tva_rate');

  const productMap = {};
  products.forEach((p) => { productMap[p.id] = p; });

  let total_ht = 0;
  let total_ttc = 0;
  let total_items = 0;

  if (products.length === 0) {
    throw new Error('INVALID_PRODUCTS');
  }

  const cartItems = items
    .filter((i) => productMap[i.product_id] && i.qty > 0)
    .map((i) => {
      const p = productMap[i.product_id];
      if (i.qty > 999) {
        const err = new Error('Quantité maximum : 999 par référence');
        err.status = 400;
        err.code = 'QTY_TOO_HIGH';
        throw err;
      }
      const qty = Math.max(1, i.qty);
      total_ht += parseFloat(p.price_ht) * qty;
      total_ttc += parseFloat(p.price_ttc) * qty;
      total_items += qty;
      return {
        product_id: p.id,
        qty,
        name: p.name,
        price_ht: parseFloat(p.price_ht),
        price_ttc: parseFloat(p.price_ttc),
        tva_rate: parseFloat(p.tva_rate),
      };
    });

  const cart = {
    items: cartItems,
    total_ht: parseFloat(total_ht.toFixed(2)),
    total_ttc: parseFloat(total_ttc.toFixed(2)),
    total_items,
  };

  const store = await getStore();
  const key = CART_PREFIX + sessionId;
  const data = JSON.stringify(cart);

  if (store.type === 'redis') {
    await store.client.setex(key, CART_TTL, data);
  } else {
    memoryStore.set(key, { data, expires: Date.now() + CART_TTL * 1000 });
  }

  return cart;
}

/**
 * Delete cart
 */
async function deleteCart(sessionId) {
  const store = await getStore();
  const key = CART_PREFIX + sessionId;

  if (store.type === 'redis') {
    await store.client.del(key);
  } else {
    memoryStore.delete(key);
  }
}

module.exports = { getCart, updateCart, deleteCart };
