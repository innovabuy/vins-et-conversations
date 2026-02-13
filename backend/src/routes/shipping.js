const express = require('express');
const router = express.Router();
const adminRouter = express.Router();
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const logger = require('../utils/logger');

// ─── PUBLIC: POST /api/v1/shipping/calculate ──────────
router.post('/calculate', async (req, res) => {
  try {
    const { dept_code, qty, date } = req.body;

    if (!dept_code || !qty) {
      return res.status(400).json({ error: true, code: 'INVALID_PARAMS', message: 'dept_code et qty requis' });
    }

    const quantity = parseInt(qty, 10);
    if (isNaN(quantity) || quantity < 1) {
      return res.status(400).json({ error: true, code: 'INVALID_QTY', message: 'Quantité invalide' });
    }

    const calcDate = date || new Date().toISOString().slice(0, 10);

    // Find zone (standard difficulty by default)
    const zone = await db('shipping_zones')
      .where({ dept_code: String(dept_code).padStart(2, '0'), difficulty: 'standard', active: true })
      .first();

    if (!zone) {
      return res.status(404).json({
        error: true,
        code: 'ZONE_NOT_FOUND',
        message: 'Département non couvert, nous contacter',
      });
    }

    // Find matching rate for qty and date
    const rate = await db('shipping_rates')
      .where({ zone_id: zone.id })
      .where('min_qty', '<=', quantity)
      .where('max_qty', '>=', quantity)
      .where('valid_from', '<=', calcDate)
      .where('valid_to', '>=', calcDate)
      .first();

    if (!rate) {
      return res.status(404).json({
        error: true,
        code: 'RATE_NOT_FOUND',
        message: 'Aucun tarif disponible pour cette quantité et cette période',
      });
    }

    // Calculate base price
    const priceHt = parseFloat(rate.price_ht);
    let basePrice;
    if (rate.pricing_type === 'forfait') {
      basePrice = priceHt;
    } else {
      // par_colis
      basePrice = parseFloat((priceHt * quantity).toFixed(2));
    }

    const surcharges = [];
    let totalSurcharges = 0;

    // Fixed surcharges: Sûreté +2€
    surcharges.push({ label: 'Sûreté', amount: 2.00 });
    totalSurcharges += 2.00;

    // Transition énergétique +0.15€
    surcharges.push({ label: 'Transition énergétique', amount: 0.15 });
    totalSurcharges += 0.15;

    // Corse surcharge
    const surCorse = parseFloat(zone.surcharge_corse || 0);
    if (surCorse > 0) {
      surcharges.push({ label: 'Supplément Corse', amount: surCorse });
      totalSurcharges += surCorse;
    }

    let subtotal = basePrice + totalSurcharges;

    // Seasonal surcharge
    let seasonalAmount = 0;
    if (zone.seasonal_eligible) {
      const d = new Date(calcDate);
      const month = d.getMonth() + 1; // 1-12
      const day = d.getDate();
      const isSeasonal = (month > 5 && month < 9) || (month === 5 && day >= 1) || (month === 8 && day <= 31);
      if (isSeasonal) {
        const pct = parseFloat(zone.surcharge_seasonal_pct || 0);
        if (pct > 0) {
          seasonalAmount = parseFloat((subtotal * pct / 100).toFixed(2));
          surcharges.push({ label: `Saisonnier (+${pct}%)`, amount: seasonalAmount });
        }
      }
    }

    const totalHT = parseFloat((subtotal + seasonalAmount).toFixed(2));
    const totalTTC = parseFloat((totalHT * 1.20).toFixed(2));

    res.json({
      price_ht: totalHT,
      price_ttc: totalTTC,
      zone_name: `${zone.dept_code} - ${zone.dept_name}`,
      zone_difficulty: zone.difficulty,
      pricing_type: rate.pricing_type,
      surcharges,
      breakdown: {
        base_price: basePrice,
        surcharges_total: parseFloat((totalSurcharges + seasonalAmount).toFixed(2)),
        price_ht: totalHT,
        tva_rate: 20,
        price_ttc: totalTTC,
      },
    });
  } catch (err) {
    logger.error(`Shipping calculate error: ${err.message}`);
    res.status(500).json({ error: true, code: 'SERVER_ERROR', message: err.message });
  }
});

// ─── ADMIN ROUTES ─────────────────────────────────────
adminRouter.use(authenticate, requireRole('super_admin', 'commercial'));

// GET /api/v1/admin/shipping-zones — list zones
adminRouter.get('/shipping-zones', async (req, res) => {
  try {
    const zones = await db('shipping_zones').orderBy('dept_code').orderBy('difficulty');
    res.json({ data: zones });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/shipping-zones/:id — update zone
adminRouter.put('/shipping-zones/:id', auditAction('shipping_zones'), async (req, res) => {
  try {
    const { id } = req.params;
    const { seasonal_eligible, surcharge_corse, surcharge_seasonal_pct, active } = req.body;
    const updates = {};
    if (seasonal_eligible !== undefined) updates.seasonal_eligible = seasonal_eligible;
    if (surcharge_corse !== undefined) updates.surcharge_corse = surcharge_corse;
    if (surcharge_seasonal_pct !== undefined) updates.surcharge_seasonal_pct = surcharge_seasonal_pct;
    if (active !== undefined) updates.active = active;

    const [updated] = await db('shipping_zones').where({ id }).update(updates).returning('*');
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/shipping-rates — list rates (filterable by zone_id)
adminRouter.get('/shipping-rates', async (req, res) => {
  try {
    let query = db('shipping_rates')
      .join('shipping_zones', 'shipping_rates.zone_id', 'shipping_zones.id')
      .select('shipping_rates.*', 'shipping_zones.dept_code', 'shipping_zones.dept_name', 'shipping_zones.difficulty');

    if (req.query.zone_id) query = query.where('shipping_rates.zone_id', req.query.zone_id);
    if (req.query.dept_code) query = query.where('shipping_zones.dept_code', req.query.dept_code);

    const rates = await query.orderBy('shipping_zones.dept_code').orderBy('shipping_rates.min_qty');
    res.json({ data: rates });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/shipping-rates/:id — update rate
adminRouter.put('/shipping-rates/:id', auditAction('shipping_rates'), async (req, res) => {
  try {
    const { id } = req.params;
    const { price_ht, min_qty, max_qty, pricing_type, valid_from, valid_to } = req.body;
    const updates = {};
    if (price_ht !== undefined) updates.price_ht = price_ht;
    if (min_qty !== undefined) updates.min_qty = min_qty;
    if (max_qty !== undefined) updates.max_qty = max_qty;
    if (pricing_type !== undefined) updates.pricing_type = pricing_type;
    if (valid_from !== undefined) updates.valid_from = valid_from;
    if (valid_to !== undefined) updates.valid_to = valid_to;

    const [updated] = await db('shipping_rates').where({ id }).update(updates).returning('*');
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/shipping-rates/import — reimport grid
adminRouter.post('/shipping-rates/import', auditAction('shipping_rates'), async (req, res) => {
  try {
    const { importShippingGrid } = require('../scripts/import-shipping-grid');
    const result = await importShippingGrid(db);
    res.json({ message: 'Import réussi', ...result });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = { router, adminRouter };
