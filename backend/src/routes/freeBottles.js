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

// POST /admin/free-bottles/record
router.post('/record', authenticate, requireRole('super_admin', 'commercial'), auditAction('free_bottles'), async (req, res) => {
  try {
    const { user_id, campaign_id, product_id, reason } = req.body;

    if (!user_id || !campaign_id || !product_id) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'user_id, campaign_id et product_id requis' });
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

    const balance = await rulesEngine.calculateFreeBottles(user_id, campaign_id, freeBottleRules);
    if (balance.available <= 0) {
      return res.status(400).json({
        error: 'NO_FREE_BOTTLES',
        message: 'Aucune bouteille gratuite disponible',
        balance,
      });
    }

    // Record in financial_events (append-only)
    const [event] = await db('financial_events').insert({
      campaign_id,
      type: 'free_bottle',
      amount: product.purchase_price || 0,
      description: reason || 'Enregistrement manuel 12+1',
      metadata: JSON.stringify({
        user_id,
        product_id,
        product_name: product.name,
        recorded_by: req.user.userId,
        manual_recording: true,
      }),
    }).returning('*');

    // Recalculate balance
    const newBalance = await rulesEngine.calculateFreeBottles(user_id, campaign_id, freeBottleRules);

    res.status(201).json({
      success: true,
      event: {
        id: event.id,
        type: event.type,
        amount: parseFloat(event.amount),
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
      const balance = await rulesEngine.calculateFreeBottles(user.id, campaign_id, freeBottleRules);
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

    res.json({ data: results, total: results.length });
  } catch (err) {
    console.error('Free bottles pending error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
