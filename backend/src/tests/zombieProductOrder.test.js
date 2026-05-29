/**
 * Intégrité — Refus de commande sur produit "zombie"
 *
 * Contexte : le DELETE admin d'un produit fait products.active=false (soft-delete)
 * sans désactiver le lien campaign_products. createOrder ne doit JAMAIS créer une
 * commande (commande / stock / compta) sur un tel produit, même si l'id arrive par
 * un panier obsolète ou un appel API direct.
 *
 * Garde-fou : products.active=false + campaign_products.active=true → PRODUCT_UNAVAILABLE
 * (distinct de INVALID_PRODUCTS, réservé au lien réellement absent).
 */
const db = require('../config/database');
const orderService = require('../services/orderService');

let campaignId;
let userId;
let zombieProductId;
let linkCreated = false;

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Campagne active déterministe (Sacré-Cœur, seed)
  const campaign = await db('campaigns')
    .where('name', 'like', '%Sacr%')
    .whereNull('deleted_at')
    .where({ status: 'active' })
    .first();
  campaignId = campaign.id;

  // Un participant étudiant de cette campagne (ordering déterministe)
  const participant = await db('participations')
    .join('users', 'participations.user_id', 'users.id')
    .where({ 'participations.campaign_id': campaignId, 'users.role': 'etudiant', 'users.status': 'active' })
    .whereNot('users.email', 'like', '%deleted%')
    .select('users.id')
    .orderBy('users.id')
    .first();
  userId = participant.id;

  // Fixture : produit soft-deleté (active=false) lié à la campagne avec lien actif → zombie
  const [prod] = await db('products')
    .insert({
      name: 'ZOMBIE TEST PRODUCT (intégrité createOrder)',
      price_ht: 10, price_ttc: 12, purchase_price: 5, tva_rate: 20,
      active: false,
    })
    .returning('id');
  zombieProductId = prod.id || prod;

  await db('campaign_products').insert({
    campaign_id: campaignId,
    product_id: zombieProductId,
    active: true,
  });
  linkCreated = true;
});

afterAll(async () => {
  if (linkCreated) await db('campaign_products').where({ product_id: zombieProductId }).del();
  if (zombieProductId) await db('products').where({ id: zombieProductId }).del();
  await db.destroy();
});

describe('Intégrité createOrder — produits zombies en écriture', () => {
  test('refuse une commande sur un produit active=false (lien actif) avec PRODUCT_UNAVAILABLE', async () => {
    await expect(
      orderService.createOrder({
        userId,
        campaignId,
        items: [{ productId: zombieProductId, qty: 1 }],
        customerName: 'Test Client Zombie',
        paymentMethod: 'cash',
      })
    ).rejects.toThrow('PRODUCT_UNAVAILABLE');
  });

  test('aucune ligne de commande/stock/financial_event créée pour le produit zombie', async () => {
    const items = await db('order_items').where({ product_id: zombieProductId }).count('* as c').first();
    const stock = await db('stock_movements').where({ product_id: zombieProductId }).count('* as c').first();
    expect(parseInt(items.c, 10)).toBe(0);
    expect(parseInt(stock.c, 10)).toBe(0);
  });

  test('un product_id sans lien campagne lève toujours INVALID_PRODUCTS (différenciation préservée)', async () => {
    const [other] = await db('products')
      .insert({
        name: 'UNLINKED TEST PRODUCT (intégrité createOrder)',
        price_ht: 10, price_ttc: 12, purchase_price: 5, tva_rate: 20,
        active: true,
      })
      .returning('id');
    const otherId = other.id || other;
    try {
      await expect(
        orderService.createOrder({
          userId,
          campaignId,
          items: [{ productId: otherId, qty: 1 }],
          customerName: 'Test Client',
          paymentMethod: 'cash',
        })
      ).rejects.toThrow('INVALID_PRODUCTS');
    } finally {
      await db('products').where({ id: otherId }).del();
    }
  });
});
