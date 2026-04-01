const express = require('express');
const Joi = require('joi');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const cartService = require('../services/cartService');
const boutiqueOrderService = require('../services/boutiqueOrderService');
const paymentService = require('../services/paymentService');
const logger = require('../utils/logger');

const { authenticateOptional } = require('../middleware/auth');

const router = express.Router();

// ─── Validation schemas ──────────────────────────────

const cartSchema = Joi.object({
  session_id: Joi.string().uuid().optional(),
  items: Joi.array().items(
    Joi.object({
      product_id: Joi.string().uuid().required(),
      qty: Joi.number().integer().min(1).max(999).required(),
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
  promo_code: Joi.string().allow('', null).optional(),
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
    if (err.code === 'QTY_TOO_HIGH') {
      return res.status(400).json({ error: 'QTY_TOO_HIGH', message: err.message });
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── GET /my-contact — Contact info for logged-in user ──
const rateLimitMap = new Map();
function rateLimit(key, maxPerMin = 10) {
  const now = Date.now();
  const entries = rateLimitMap.get(key) || [];
  const recent = entries.filter((t) => now - t < 60000);
  if (recent.length >= maxPerMin) return false;
  recent.push(now);
  rateLimitMap.set(key, recent);
  return true;
}

router.get('/my-contact', authenticateOptional, async (req, res) => {
  try {
    if (!req.user) return res.json({ found: false });
    const contact = await db('contacts')
      .where(function () {
        this.where('source_user_id', req.user.userId)
          .orWhere('email', req.user.email);
      })
      .orderBy('updated_at', 'desc')
      .first();
    if (!contact) return res.json({ found: false });
    const notes = typeof contact.notes === 'string' ? JSON.parse(contact.notes || '{}') : (contact.notes || {});
    res.json({
      found: true,
      name: contact.name,
      address: contact.address,
      city: notes.city || null,
      zip: notes.postal_code || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── GET /user-lookup?email=X — Contact lookup by email (rate limited) ──
router.get('/user-lookup', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'EMAIL_REQUIRED' });
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!rateLimit(`lookup:${ip}`)) {
      return res.status(429).json({ error: 'RATE_LIMIT', message: 'Trop de requêtes. Réessayez dans une minute.' });
    }
    const contact = await db('contacts')
      .where('email', email.toLowerCase().trim())
      .orderBy('updated_at', 'desc')
      .first();
    if (!contact) return res.json({ found: false });
    const notes = typeof contact.notes === 'string' ? JSON.parse(contact.notes || '{}') : (contact.notes || {});
    res.json({
      found: true,
      name: contact.name,
      address: contact.address,
      city: notes.city || null,
      zip: notes.postal_code || null,
    });
  } catch (err) {
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

router.post('/checkout', authenticateOptional, async (req, res) => {
  try {
    const { error, value } = checkoutSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

    // Get cart
    const cart = await cartService.getCart(value.session_id);
    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({ error: 'EMPTY_CART', message: 'Le panier est vide' });
    }

    // Create boutique order — pass authenticated user for campaign routing
    const order = await boutiqueOrderService.createBoutiqueOrder({
      cartItems: cart.items,
      customer: value.customer,
      referralCode: value.referral_code || null,
      delivery_type: value.delivery_type || 'home_delivery',
      promoCode: value.promo_code || null,
      authenticatedUserId: req.user?.userId || null,
    });

    // Skip Stripe for backorder (pending_stock) — payment will happen when stock arrives
    let clientSecret = null;
    if (!order.backorder) {
      const stripe = await paymentService.getProvider();
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
      promo_discount: order.promo_discount || 0,
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

// ─── GET /campaigns/:id/info — Public campaign info for join page ───

router.get('/campaigns/:id/info', async (req, res) => {
  try {
    const campaign = await db('campaigns')
      .leftJoin('organizations', 'campaigns.org_id', 'organizations.id')
      .leftJoin('campaign_types', 'campaigns.campaign_type_id', 'campaign_types.id')
      .where('campaigns.id', req.params.id)
      .whereIn('campaigns.status', ['active', 'draft'])
      .select(
        'campaigns.id', 'campaigns.name', 'campaigns.brand_name',
        'campaigns.goal', 'campaigns.start_date', 'campaigns.end_date',
        'organizations.name as org_name',
        'campaign_types.code as campaign_type_code'
      )
      .first();

    if (!campaign) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND', message: 'Campagne introuvable' });

    res.json({
      id: campaign.id,
      name: campaign.name,
      brand_name: campaign.brand_name,
      org_name: campaign.org_name,
      goal: campaign.goal ? parseFloat(campaign.goal) : null,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      campaign_type_code: campaign.campaign_type_code || null,
    });
  } catch (err) {
    logger.error(`Campaign info error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── POST /campaigns/:id/join — Public self-registration into a campaign ───

const joinCampaignSchema = Joi.object({
  first_name: Joi.string().min(1).max(50).required(),
  last_name: Joi.string().min(1).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(100).required(),
  class_group: Joi.string().allow('', null).optional(),
});

router.post('/campaigns/:id/join', async (req, res) => {
  try {
    const { error, value } = joinCampaignSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });

    const campaign = await db('campaigns')
      .where({ id: req.params.id })
      .whereIn('status', ['active', 'draft'])
      .first();

    if (!campaign) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND', message: 'Campagne introuvable' });

    // Resolve role from campaign_type
    const campaignType = campaign.campaign_type_id
      ? await db('campaign_types').where({ id: campaign.campaign_type_id }).first()
      : null;

    const CAMPAIGN_TYPE_ROLE_MAP = {
      scolaire: 'etudiant',
      lycee: 'etudiant',
      bts_ndrc: 'etudiant',
      cse: 'cse',
      ambassadeur: 'ambassadeur',
    };

    const typeCode = campaignType?.code;
    const userRole = CAMPAIGN_TYPE_ROLE_MAP[typeCode];

    if (!userRole) {
      return res.status(400).json({
        error: 'UNSUPPORTED_CAMPAIGN_TYPE',
        message: `L'inscription par lien n'est pas disponible pour ce type de campagne${typeCode ? ` (${typeCode})` : ''}`,
      });
    }

    const CAMPAIGN_TYPE_ROLE_IN_CAMPAIGN = {
      scolaire: 'participant',
      lycee: 'participant',
      bts_ndrc: 'participant',
      cse: 'cse_member',
      ambassadeur: 'ambassador',
    };

    const roleInCampaign = CAMPAIGN_TYPE_ROLE_IN_CAMPAIGN[typeCode];

    const email = value.email.toLowerCase().trim();
    const fullName = `${value.first_name.trim()} ${value.last_name.trim()}`;
    const bcrypt = require('bcryptjs');

    let user = await db('users').where({ email }).first();
    let isNew = false;

    if (user) {
      // User exists — check if already in this campaign
      const existing = await db('participations')
        .where({ user_id: user.id, campaign_id: campaign.id })
        .first();
      if (existing) {
        // Already registered — log them in
        const authService = require('../auth/authService');
        const loginData = await authService.login(email, value.password);
        return res.json({ success: true, already_registered: true, ...loginData });
      }

      // Upgrade role if joining a higher-privilege campaign (CSE or ambassadeur)
      if (userRole === 'cse' && user.role !== 'cse') {
        await db('users').where({ id: user.id }).update({ role: 'cse', cse_role: 'member' });
      } else if (userRole === 'ambassadeur' && user.role !== 'ambassadeur') {
        await db('users').where({ id: user.id }).update({ role: 'ambassadeur' });
      }
    } else {
      // Create new account with role derived from campaign type
      const passwordHash = await bcrypt.hash(value.password, 10);
      const userId = uuidv4();
      const insertData = {
        id: userId,
        name: fullName,
        email,
        password_hash: passwordHash,
        role: userRole,
        status: 'active',
      };
      // CSE members get cse_role = 'member' (QR join = collaborateur by default)
      if (userRole === 'cse') {
        insertData.cse_role = 'member';
      }
      await db('users').insert(insertData);
      user = { id: userId };
      isNew = true;
    }

    // Create participation
    const { generateUniqueReferralCode } = require('../utils/referralCode');
    const referralCode = await generateUniqueReferralCode(campaign.name, fullName);

    const participationData = {
      user_id: user.id,
      campaign_id: campaign.id,
      role_in_campaign: roleInCampaign,
      class_group: value.class_group || null,
      referral_code: referralCode,
      config: JSON.stringify({}),
    };
    // CSE: store sub_role for collaborator differentiation
    if (userRole === 'cse') {
      participationData.sub_role = 'collaborateur';
    }

    await db('participations').insert(participationData);

    // Auto-login: generate tokens
    const authService = require('../auth/authService');
    let loginData;
    if (isNew) {
      // For new users, generate tokens directly (we know the password)
      loginData = await authService.login(email, value.password);
    } else {
      // Existing user — they must provide the correct password
      try {
        loginData = await authService.login(email, value.password);
      } catch {
        // Wrong password but participation was created — still success, just no auto-login
        return res.status(201).json({
          success: true,
          new_account: false,
          campaign_name: campaign.name,
          message: 'Inscription réussie. Connectez-vous avec votre mot de passe habituel.',
        });
      }
    }

    res.status(201).json({
      success: true,
      new_account: isNew,
      campaign_name: campaign.name,
      referral_code: referralCode,
      ...loginData,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'DUPLICATE', message: 'Vous êtes déjà inscrit(e) à cette campagne' });
    }
    if (err.message === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Mot de passe incorrect pour ce compte existant' });
    }
    logger.error(`Join campaign error: ${err.message}`);
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
