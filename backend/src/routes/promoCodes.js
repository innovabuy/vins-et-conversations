const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();
const publicRouter = express.Router();

// ─── Admin CRUD ──────────────────────────────────────

// GET / - List all promo codes
router.get('/', authenticate, async (req, res) => {
  try {
    const codes = await db('promo_codes').orderBy('created_at', 'desc');
    res.json({ data: codes });
  } catch (err) {
    logger.error(`List promo codes error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST / - Create a promo code
const createSchema = Joi.object({
  code: Joi.string().min(2).max(50).required(),
  type: Joi.string().valid('percentage', 'fixed').required(),
  value: Joi.number().positive().required(),
  max_uses: Joi.number().integer().min(1).allow(null).optional(),
  min_order_ttc: Joi.number().min(0).default(0),
  valid_from: Joi.date().iso().allow(null).optional(),
  valid_until: Joi.date().iso().allow(null).optional(),
  active: Joi.boolean().default(true),
});

router.post('/', authenticate, auditAction('promo_codes'), async (req, res) => {
  try {
    const { error, value } = createSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

    value.code = value.code.toUpperCase().trim();

    if (value.type === 'percentage' && value.value > 100) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Le pourcentage ne peut pas depasser 100' });
    }

    const [promo] = await db('promo_codes').insert(value).returning('*');
    res.status(201).json({ data: promo });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'DUPLICATE_CODE', message: 'Ce code promo existe deja' });
    }
    logger.error(`Create promo code error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /:id - Update a promo code
const updateSchema = Joi.object({
  code: Joi.string().min(2).max(50).optional(),
  type: Joi.string().valid('percentage', 'fixed').optional(),
  value: Joi.number().positive().optional(),
  max_uses: Joi.number().integer().min(1).allow(null).optional(),
  min_order_ttc: Joi.number().min(0).optional(),
  valid_from: Joi.date().iso().allow(null).optional(),
  valid_until: Joi.date().iso().allow(null).optional(),
  active: Joi.boolean().optional(),
});

router.put('/:id', authenticate, auditAction('promo_codes'), async (req, res) => {
  try {
    const { error, value } = updateSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

    if (value.code) value.code = value.code.toUpperCase().trim();
    if (value.type === 'percentage' && value.value > 100) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Le pourcentage ne peut pas depasser 100' });
    }

    const [updated] = await db('promo_codes')
      .where({ id: req.params.id })
      .update(value)
      .returning('*');

    if (!updated) return res.status(404).json({ error: 'NOT_FOUND', message: 'Code promo introuvable' });
    res.json({ data: updated });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'DUPLICATE_CODE', message: 'Ce code promo existe deja' });
    }
    logger.error(`Update promo code error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /:id - Delete a promo code
router.delete('/:id', authenticate, auditAction('promo_codes'), async (req, res) => {
  try {
    const usedInOrders = await db('orders').where({ promo_code_id: req.params.id }).first();
    if (usedInOrders) {
      return res.status(400).json({ error: 'IN_USE', message: 'Ce code a ete utilise, desactivez-le plutot.' });
    }

    const deleted = await db('promo_codes').where({ id: req.params.id }).del();
    if (!deleted) return res.status(404).json({ error: 'NOT_FOUND', message: 'Code promo introuvable' });
    res.json({ success: true });
  } catch (err) {
    logger.error(`Delete promo code error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Public: validate promo code ─────────────────────

const validateSchema = Joi.object({
  code: Joi.string().required(),
  order_total_ttc: Joi.number().positive().required(),
});

publicRouter.post('/validate', async (req, res) => {
  try {
    const { error, value } = validateSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

    const code = value.code.toUpperCase().trim();
    const promo = await db('promo_codes').where({ code }).first();

    // 1. Code exists and is active
    if (!promo || !promo.active) {
      return res.json({ valid: false, message: 'Code promo invalide ou inactif' });
    }

    // 2. Date validity
    const now = new Date();
    if (promo.valid_from && new Date(promo.valid_from) > now) {
      return res.json({ valid: false, message: 'Ce code promo n\'est pas encore actif' });
    }
    if (promo.valid_until && new Date(promo.valid_until) < now) {
      return res.json({ valid: false, message: 'Ce code promo a expire' });
    }

    // 3. Usage limit
    if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
      return res.json({ valid: false, message: 'Ce code promo a atteint son nombre maximum d\'utilisations' });
    }

    // 4. Minimum order
    if (parseFloat(promo.min_order_ttc) > 0 && value.order_total_ttc < parseFloat(promo.min_order_ttc)) {
      return res.json({
        valid: false,
        message: `Montant minimum de commande : ${parseFloat(promo.min_order_ttc).toFixed(2)} EUR`,
      });
    }

    // Calculate discount
    let discount_amount;
    if (promo.type === 'percentage') {
      discount_amount = Math.round(value.order_total_ttc * (parseFloat(promo.value) / 100) * 100) / 100;
    } else {
      discount_amount = Math.min(parseFloat(promo.value), value.order_total_ttc);
    }

    const final_total = Math.round((value.order_total_ttc - discount_amount) * 100) / 100;

    res.json({
      valid: true,
      promo_code_id: promo.id,
      type: promo.type,
      value: parseFloat(promo.value),
      discount_amount,
      final_total,
    });
  } catch (err) {
    logger.error(`Validate promo code error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
