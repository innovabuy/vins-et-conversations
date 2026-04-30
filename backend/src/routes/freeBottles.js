/**
 * Free Bottles — Manual recording routes
 * POST /admin/free-bottles/record — Record a manual free bottle claim
 * GET /admin/free-bottles/pending — List students with available free bottles
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const rulesEngine = require('../services/rulesEngine');
const { ACTIVE_STATUSES } = require('../services/dashboardService');

// POST /admin/free-bottles/record
router.post('/record', authenticate, requireRole('super_admin', 'commercial'), auditAction('free_bottles'), async (req, res) => {
  try {
    const { user_id, campaign_id, product_id, reason, quantity } = req.body;

    if (!user_id || !campaign_id || !product_id) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'user_id, campaign_id et product_id requis' });
    }

    const qty = quantity != null ? parseInt(quantity, 10) : 1;
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: 'INVALID_QUANTITY', message: 'quantity doit être un entier positif' });
    }

    // Validate student exists and participates
    const participation = await db('participations')
      .where({ user_id, campaign_id })
      .first();
    if (!participation) {
      return res.status(404).json({ error: 'NOT_PARTICIPANT', message: 'Cet utilisateur ne participe pas a cette campagne' });
    }

    // Validate product exists and is active
    const product = await db('products')
      .join('product_categories', 'products.category_id', 'product_categories.id')
      .where('products.id', product_id)
      .select('products.*', 'product_categories.is_alcohol')
      .first();
    if (!product || !product.active) {
      return res.status(404).json({ error: 'PRODUCT_NOT_FOUND', message: 'Produit introuvable ou inactif' });
    }

    // Load rules and check free bottle balance
    const rules = await rulesEngine.loadRulesForCampaign(campaign_id);
    const freeBottleRules = rules?.freeBottle;

    // Check alcohol-only constraint
    if (freeBottleRules?.applies_to_alcohol_only && !product.is_alcohol) {
      return res.status(400).json({ error: 'ALCOHOL_ONLY', message: 'Seuls les produits avec alcool sont eligibles au 12+1' });
    }

    const balance = await rulesEngine.calculateFreeBottles(user_id, campaign_id, freeBottleRules, { includeReferredBy: true });
    if (balance.available <= 0) {
      return res.status(400).json({
        error: 'NO_FREE_BOTTLES',
        message: 'Aucune bouteille gratuite disponible',
        balance,
      });
    }

    if (qty > balance.available) {
      return res.status(400).json({
        error: 'INSUFFICIENT_FREE_BOTTLES',
        message: `Seulement ${balance.available} bouteille(s) disponible(s), ${qty} demandée(s)`,
        balance,
      });
    }

    // Record in financial_events (append-only) — one row per bottle for auditability
    const rows = Array.from({ length: qty }, () => ({
      campaign_id,
      type: 'free_bottle',
      amount: product.purchase_price || 0,
      description: reason || `Enregistrement manuel 12+1${qty > 1 ? ` (lot de ${qty})` : ''}`,
      metadata: JSON.stringify({
        user_id,
        product_id,
        product_name: product.name,
        recorded_by: req.user.userId,
        manual_recording: true,
      }),
    }));
    const events = await db('financial_events').insert(rows).returning('*');

    // Recalculate balance
    const newBalance = await rulesEngine.calculateFreeBottles(user_id, campaign_id, freeBottleRules, { includeReferredBy: true });

    res.status(201).json({
      success: true,
      recorded: events.length,
      event: {
        id: events[0].id,
        type: events[0].type,
        amount: parseFloat(events[0].amount),
        product_name: product.name,
      },
      balance: newBalance,
    });
  } catch (err) {
    console.error('Free bottle record error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /admin/free-bottles/pending
router.get('/pending', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) {
      return res.status(400).json({ error: 'MISSING_CAMPAIGN', message: 'campaign_id requis' });
    }

    const rules = await rulesEngine.loadRulesForCampaign(campaign_id);
    const freeBottleRules = rules?.freeBottle;
    const threshold = freeBottleRules?.n || 12;

    // Get all participants
    const participants = await db('participations')
      .join('users', 'participations.user_id', 'users.id')
      .where({ 'participations.campaign_id': campaign_id, 'users.role': 'etudiant', 'users.status': 'active' })
      .select('users.id', 'users.name', 'users.email');

    const results = [];
    for (const user of participants) {
      const balance = await rulesEngine.calculateFreeBottles(user.id, campaign_id, freeBottleRules, { includeReferredBy: true });
      if (balance.available > 0) {
        results.push({
          user_id: user.id,
          user_name: user.name,
          user_email: user.email,
          earned: balance.earned,
          used: balance.used,
          available: balance.available,
          totalSold: balance.totalSold,
          threshold,
        });
      }
    }

    // Fetch alcohol products available in this campaign — UNION (P2-FIX 30/04 Mathéo retour 4b) :
    //   1) campaign_products active + 2) produits réellement commandés sur la campagne.
    // Évite l'invisibilité des produits orphelins (ex: Lagoalva, Fils de Marcel Moelleux sur BTS NDRC).
    const productsCampaign = db('campaign_products')
      .join('products', 'campaign_products.product_id', 'products.id')
      .join('product_categories', 'products.category_id', 'product_categories.id')
      .where({ 'campaign_products.campaign_id': campaign_id, 'campaign_products.active': true, 'products.active': true })
      .where('product_categories.is_alcohol', true)
      .select('products.id', 'products.name', 'products.purchase_price');

    const productsOrdered = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .join('product_categories', 'products.category_id', 'product_categories.id')
      .where('orders.campaign_id', campaign_id)
      .whereIn('orders.status', ACTIVE_STATUSES)
      .where('products.active', true)
      .where('product_categories.is_alcohol', true)
      .where('order_items.type', 'product')
      .distinct('products.id', 'products.name', 'products.purchase_price');

    const products = await db
      .union([productsCampaign, productsOrdered], true)
      .orderBy('purchase_price', 'asc');

    res.json({ data: results, products, total: results.length });
  } catch (err) {
    console.error('Free bottles pending error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /admin/free-bottles/ambassadors — List ambassadors with 12+1 status
router.get('/ambassadors', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) {
      return res.status(400).json({ error: 'MISSING_CAMPAIGN', message: 'campaign_id requis' });
    }

    const ambassadors = await db('participations')
      .join('users', 'participations.user_id', 'users.id')
      .where({ 'participations.campaign_id': campaign_id, 'users.role': 'ambassadeur', 'users.status': 'active' })
      .select('users.id', 'users.name', 'users.email', 'participations.config');

    const data = ambassadors.map((a) => {
      const config = typeof a.config === 'string' ? JSON.parse(a.config) : (a.config || {});
      return {
        user_id: a.id,
        user_name: a.name,
        user_email: a.email,
        free_bottle_enabled: config.free_bottle_enabled !== false,
      };
    });

    res.json({ data });
  } catch (err) {
    console.error('Free bottles ambassadors error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PATCH /admin/free-bottles/toggle — Toggle free_bottle_enabled for a participant
router.patch('/toggle', authenticate, requireRole('super_admin', 'commercial'), auditAction('free_bottles'), async (req, res) => {
  try {
    const { user_id, campaign_id, enabled } = req.body;

    if (!user_id || !campaign_id || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'user_id, campaign_id et enabled (boolean) requis' });
    }

    const participation = await db('participations')
      .where({ user_id, campaign_id })
      .first();
    if (!participation) {
      return res.status(404).json({ error: 'NOT_PARTICIPANT', message: 'Participation introuvable' });
    }

    const currentConfig = typeof participation.config === 'string'
      ? JSON.parse(participation.config) : (participation.config || {});
    currentConfig.free_bottle_enabled = enabled;

    await db('participations')
      .where({ user_id, campaign_id })
      .update({ config: JSON.stringify(currentConfig) });

    res.json({ success: true, free_bottle_enabled: enabled });
  } catch (err) {
    console.error('Free bottle toggle error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /admin/free-bottles/history — Full history of all free bottle redemptions
router.get('/history', authenticate, requireRole('super_admin', 'commercial', 'comptable'), async (req, res) => {
  try {
    const { campaign_id, student_id, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    let query = db('financial_events')
      .join('campaigns', 'financial_events.campaign_id', 'campaigns.id')
      .where('financial_events.type', 'free_bottle');

    let countQuery = db('financial_events')
      .where('type', 'free_bottle');

    if (campaign_id) {
      query = query.where('financial_events.campaign_id', campaign_id);
      countQuery = countQuery.where('campaign_id', campaign_id);
    }
    if (student_id) {
      query = query.whereRaw("financial_events.metadata->>'user_id' = ?", [student_id]);
      countQuery = countQuery.whereRaw("metadata->>'user_id' = ?", [student_id]);
    }

    const totalResult = await countQuery.count('id as c').first();
    const total = parseInt(totalResult?.c || 0, 10);

    const rows = await query
      .orderBy('financial_events.created_at', 'desc')
      .offset(offset)
      .limit(limitNum)
      .select(
        'financial_events.id',
        'financial_events.created_at',
        'financial_events.amount',
        'financial_events.metadata',
        'campaigns.name as campaign_name'
      );

    // Resolve user names in batch
    const userIds = new Set();
    const recorderIds = new Set();
    rows.forEach((r) => {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
      if (meta.user_id) userIds.add(meta.user_id);
      if (meta.recorded_by) recorderIds.add(meta.recorded_by);
    });
    const allIds = [...new Set([...userIds, ...recorderIds])];
    const users = allIds.length > 0
      ? await db('users').whereIn('id', allIds).select('id', 'name', 'email')
      : [];
    const userMap = {};
    users.forEach((u) => { userMap[u.id] = u; });

    const data = rows.map((r) => {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
      return {
        id: r.id,
        date: r.created_at,
        student_name: userMap[meta.user_id]?.name || 'Inconnu',
        student_id: meta.user_id || null,
        campaign_name: r.campaign_name,
        product_name: meta.product_name || 'Produit inconnu',
        quantity: 1,
        amount: parseFloat(r.amount),
        recorded_by: userMap[meta.recorded_by]?.email || 'système',
      };
    });

    res.json({ data, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error('Free bottles history error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /admin/free-bottles/history/export — Export history as CSV
router.get('/history/export', authenticate, requireRole('super_admin', 'commercial', 'comptable'), async (req, res) => {
  try {
    const { campaign_id, student_id } = req.query;

    let query = db('financial_events')
      .join('campaigns', 'financial_events.campaign_id', 'campaigns.id')
      .where('financial_events.type', 'free_bottle');

    if (campaign_id) query = query.where('financial_events.campaign_id', campaign_id);
    if (student_id) query = query.whereRaw("financial_events.metadata->>'user_id' = ?", [student_id]);

    const rows = await query
      .orderBy('financial_events.created_at', 'desc')
      .select(
        'financial_events.created_at',
        'financial_events.amount',
        'financial_events.metadata',
        'campaigns.name as campaign_name'
      );

    // Resolve user names
    const allIds = new Set();
    rows.forEach((r) => {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
      if (meta.user_id) allIds.add(meta.user_id);
      if (meta.recorded_by) allIds.add(meta.recorded_by);
    });
    const users = allIds.size > 0
      ? await db('users').whereIn('id', [...allIds]).select('id', 'name', 'email')
      : [];
    const userMap = {};
    users.forEach((u) => { userMap[u.id] = u; });

    const csvEscape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    const headers = ['Date', 'Étudiant', 'Campagne', 'Produit', 'Quantité', 'Coût achat (EUR)', 'Enregistré par'];
    const csvRows = [headers.join(';')];

    rows.forEach((r) => {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
      csvRows.push([
        csvEscape(new Date(r.created_at).toLocaleDateString('fr-FR')),
        csvEscape(userMap[meta.user_id]?.name || 'Inconnu'),
        csvEscape(r.campaign_name),
        csvEscape(meta.product_name || 'Produit inconnu'),
        1,
        parseFloat(r.amount).toFixed(2),
        csvEscape(userMap[meta.recorded_by]?.email || 'système'),
      ].join(';'));
    });

    // Total row
    const totalAmount = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
    csvRows.push(['', '', '', csvEscape('TOTAL'), rows.length, totalAmount.toFixed(2), ''].join(';'));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gratuites-12+1-${Date.now()}.csv"`);
    res.send('\uFEFF' + csvRows.join('\n'));
  } catch (err) {
    console.error('Free bottles history export error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
