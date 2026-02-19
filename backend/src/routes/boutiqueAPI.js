const express = require('express');
const Joi = require('joi');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const cartService = require('../services/cartService');
const boutiqueOrderService = require('../services/boutiqueOrderService');
const { getStripe } = require('../services/stripeService');
const logger = require('../utils/logger');

const router = express.Router();

// ─── Validation schemas ──────────────────────────────

const cartSchema = Joi.object({
  session_id: Joi.string().uuid().optional(),
  items: Joi.array().items(
    Joi.object({
      product_id: Joi.string().uuid().required(),
      qty: Joi.number().integer().min(1).max(99).required(),
    })
  ).min(0).required(),
});

const checkoutSchema = Joi.object({
  session_id: Joi.string().uuid().required(),
  delivery_type: Joi.string().valid('home_delivery', 'click_and_collect').default('home_delivery'),
  customer: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().allow('', null).optional(),
    address: Joi.string().min(5).max(200).allow('', null).optional(),
    city: Joi.string().min(2).max(100).allow('', null).optional(),
    postal_code: Joi.string().pattern(/^\d{5}$/).allow('', null).optional(),
  }).required(),
  referral_code: Joi.string().allow('', null).optional(),
}).custom((value, helpers) => {
  // Address required for home delivery
  if (value.delivery_type === 'home_delivery') {
    if (!value.customer.address || !value.customer.city || !value.customer.postal_code) {
      return helpers.error('any.custom', { message: 'Adresse requise pour la livraison a domicile' });
    }
  }
  return value;
});

const confirmSchema = Joi.object({
  order_id: Joi.string().uuid().required(),
  payment_intent_id: Joi.string().required(),
});

const trackingSchema = Joi.object({
  email: Joi.string().email().required(),
});

// ─── POST /cart — Create/update cart ─────────────────

router.post('/cart', async (req, res) => {
  try {
    const { error, value } = cartSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

    const sessionId = value.session_id || uuidv4();
    const cart = await cartService.updateCart(sessionId, value.items);

    res.json({ session_id: sessionId, ...cart });
  } catch (err) {
    logger.error(`Cart update error: ${err.message}`);
    if (err.message === 'INVALID_PRODUCTS') {
      return res.status(400).json({ error: 'INVALID_PRODUCTS', message: 'Produits invalides ou indisponibles' });
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── GET /cart/:session_id — Get cart ────────────────

router.get('/cart/:session_id', async (req, res) => {
  try {
    const cart = await cartService.getCart(req.params.session_id);
    res.json({ session_id: req.params.session_id, ...cart });
  } catch (err) {
    logger.error(`Cart get error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── POST /checkout — Create order + Stripe PaymentIntent ──

router.post('/checkout', async (req, res) => {
  try {
    const { error, value } = checkoutSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

    // Get cart
    const cart = await cartService.getCart(value.session_id);
    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({ error: 'EMPTY_CART', message: 'Le panier est vide' });
    }

    // Create boutique order
    const order = await boutiqueOrderService.createBoutiqueOrder({
      cartItems: cart.items,
      customer: value.customer,
      referralCode: value.referral_code || null,
      delivery_type: value.delivery_type || 'home_delivery',
    });

    // Skip Stripe for backorder (pending_stock) — payment will happen when stock arrives
    let clientSecret = null;
    if (!order.backorder) {
      const stripe = await getStripe();
      if (stripe) {
        const amountCents = Math.round(order.total_ttc * 100);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: 'eur',
          metadata: {
            order_id: order.id,
            order_ref: order.ref,
            source: 'boutique_web',
          },
        });
        clientSecret = paymentIntent.client_secret;
      }
    }

    // Clear cart
    await cartService.deleteCart(value.session_id);

    res.status(201).json({
      order_id: order.id,
      ref: order.ref,
      total_ttc: order.total_ttc,
      shipping_ht: order.shipping_ht,
      shipping_ttc: order.shipping_ttc,
      backorder: order.backorder || false,
      client_secret: clientSecret,
    });
  } catch (err) {
    logger.error(`Checkout error: ${err.message}`);
    if (err.message === 'INVALID_PRODUCTS') {
      return res.status(400).json({ error: 'INVALID_PRODUCTS', message: 'Produits invalides dans le panier' });
    }
    if (err.message.startsWith('INSUFFICIENT_STOCK:')) {
      const parts = err.message.split(':');
      return res.status(400).json({
        error: 'INSUFFICIENT_STOCK',
        message: `Stock insuffisant pour ${parts[1]}`,
        product: parts[1],
        available: parseInt(parts[2]) || 0,
      });
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── POST /checkout/confirm — Confirm after payment ──

router.post('/checkout/confirm', async (req, res) => {
  try {
    const { error, value } = confirmSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

    const order = await boutiqueOrderService.confirmBoutiqueOrder(
      value.order_id,
      value.payment_intent_id
    );

    // Send confirmation email (fire and forget)
    try {
      const emailService = require('../services/emailService');
      const contact = await require('../config/database')('contacts')
        .where({ id: order.customer_id })
        .first();
      const orderItems = await require('../config/database')('order_items')
        .join('products', 'order_items.product_id', 'products.id')
        .where('order_items.order_id', order.id)
        .select('products.name', 'order_items.qty', 'order_items.unit_price_ttc');

      if (contact) {
        emailService.sendBoutiqueOrderConfirmation({
          email: contact.email,
          name: contact.name,
          orderRef: order.ref,
          totalTTC: parseFloat(order.total_ttc),
          items: orderItems,
        }).catch((e) => logger.error(`Boutique confirmation email failed: ${e.message}`));
      }
    } catch (e) {
      logger.error(`Email send error: ${e.message}`);
    }

    res.json({ confirmed: true, ref: order.ref, status: 'submitted' });
  } catch (err) {
    logger.error(`Checkout confirm error: ${err.message}`);
    if (err.message === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: 'Commande introuvable' });
    }
    if (err.message === 'ORDER_NOT_PENDING_PAYMENT') {
      return res.status(400).json({ error: 'ORDER_NOT_PENDING_PAYMENT', message: 'Commande déjà confirmée' });
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── GET /order/:ref — Order tracking by ref + email ─

router.get('/order/:ref', async (req, res) => {
  try {
    const { error, value } = trackingSchema.validate(req.query);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

    const order = await boutiqueOrderService.getOrderByRefAndEmail(
      req.params.ref,
      value.email
    );

    if (!order) {
      return res.status(404).json({ error: 'ORDER_NOT_FOUND', message: 'Commande introuvable' });
    }

    res.json(order);
  } catch (err) {
    logger.error(`Order tracking error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── GET /ambassador/:code — Resolve referral code ───

router.get('/ambassador/:code', async (req, res) => {
  try {
    const result = await boutiqueOrderService.resolveReferralCode(req.params.code);
    if (!result) {
      return res.status(404).json({ error: 'CODE_NOT_FOUND', message: 'Code de parrainage invalide' });
    }
    res.json({ name: result.name, code: result.referral_code });
  } catch (err) {
    logger.error(`Ambassador resolve error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── GET /referral/:code — Generic referral code resolve ───

router.get('/referral/:code', async (req, res) => {
  try {
    const result = await boutiqueOrderService.resolveReferralCode(req.params.code);
    if (!result) {
      return res.status(404).json({ error: 'CODE_NOT_FOUND', message: 'Code de parrainage invalide' });
    }
    res.json({ name: result.name, code: result.referral_code, role: result.role });
  } catch (err) {
    logger.error(`Referral resolve error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── POST /register — Lightweight external client registration ───

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().allow('', null).optional(),
  referral_code: Joi.string().allow('', null).optional(),
});

router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

    let referralSource = null;
    if (value.referral_code) {
      const referral = await boutiqueOrderService.resolveReferralCode(value.referral_code);
      if (referral) referralSource = `referral:${referral.name}`;
    }

    const contact = await boutiqueOrderService.upsertContact({
      name: value.name,
      email: value.email,
      phone: value.phone || null,
      referralSource,
    });

    res.status(201).json({ id: contact.id, name: contact.name, email: contact.email, registered: true });
  } catch (err) {
    logger.error(`Register error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── POST /join-school — Auto-create student account from school campaign link ───

const joinSchoolSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  campaign_code: Joi.string().required(),
  class_group: Joi.string().allow('', null).optional(),
});

router.post('/join-school', async (req, res) => {
  try {
    const { error, value } = joinSchoolSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

    // Find campaign by join_code in config, or by id/name
    const campaign = await db('campaigns')
      .where(function () {
        this.whereRaw("config->>'join_code' = ?", [value.campaign_code])
          .orWhere('id', value.campaign_code)
          .orWhere('name', value.campaign_code);
      })
      .where('active', true)
      .first();

    if (!campaign) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND', message: 'Code campagne invalide' });

    // Check if user already exists
    let user = await db('users').where({ email: value.email }).first();
    const bcrypt = require('bcryptjs');

    if (user) {
      // If user already exists, just add participation if missing
      const existing = await db('participations')
        .where({ user_id: user.id, campaign_id: campaign.id })
        .first();
      if (existing) {
        return res.json({ message: 'Déjà inscrit', user_id: user.id, referral_code: existing.referral_code, already_registered: true });
      }
    } else {
      // Create new student account with random password (must reset)
      const tempPassword = crypto.randomBytes(8).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const userId = require('uuid').v4();

      await db('users').insert({
        id: userId,
        name: value.name,
        email: value.email,
        password_hash: passwordHash,
        role: 'etudiant',
        status: 'active',
      });
      user = { id: userId, name: value.name, isNew: true };
    }

    // Create participation with referral code
    const { generateUniqueReferralCode } = require('../utils/referralCode');
    const referralCode = await generateUniqueReferralCode(campaign.name, value.name);

    await db('participations').insert({
      user_id: user.id,
      campaign_id: campaign.id,
      role: 'student',
      class_group: value.class_group || null,
      referral_code: referralCode,
      config: JSON.stringify({}),
    });

    res.status(201).json({
      user_id: user.id,
      name: value.name,
      campaign_name: campaign.name,
      referral_code: referralCode,
      new_account: !!user.isNew,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'DUPLICATE', message: 'Participation déjà existante' });
    }
    logger.error(`Join school error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
