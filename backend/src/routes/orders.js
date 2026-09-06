const express = require('express');
const Joi = require('joi');
const PDFDocument = require('pdfkit');
const db = require('../config/database');
const orderService = require('../services/orderService');
const { authenticate, requireRole, requireCampaignAccess, antifraudCheck } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditAction } = require('../middleware/audit');
const { invalidateCache } = require('../middleware/cache');
const logger = require('../utils/logger');
const { getAppBranding } = require('../utils/appBranding');
const { addCapNumerikFooter } = require('../utils/pdfFooter');

const router = express.Router();

const createOrderSchema = Joi.object({
  campaign_id: Joi.string().uuid().required(),
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().uuid().required(),
      qty: Joi.number().integer().min(1).required(),
    })
  ).min(1).required(),
  customer_id: Joi.string().uuid().allow(null),
  customer_name: Joi.string().max(200).allow(null, ''),
  customer_phone: Joi.string().max(30).allow(null, ''),
  customer_email: Joi.string().email().allow(null, ''),
  customer_notes: Joi.string().max(500).allow(null, ''),
  payment_method: Joi.string().valid('cash', 'check', 'card', 'transfer', 'pending', 'deferred').allow(null),
  notes: Joi.string().allow(null, ''),
  promo_code: Joi.string().allow(null, ''),
});

// GET /api/v1/orders/allowed-payment-methods — Modes de paiement autorisés pour le rôle (MUST be before /:id)
router.get(
  '/allowed-payment-methods',
  authenticate,
  async (req, res) => {
    try {
      const methods = orderService.getAllowedPaymentMethods(req.user.role);
      let hasCautionHeld = false;
      if (methods.includes('deferred')) {
        const caution = await db('caution_checks')
          .where({ user_id: req.user.userId, status: 'held' })
          .first();
        hasCautionHeld = !!caution;
      }
      res.json({ data: methods, deferred_info: { has_caution_held: hasCautionHeld } });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/orders/my-customers — Liste clients de l'étudiant (MUST be before /:id)
router.get(
  '/my-customers',
  authenticate,
  async (req, res) => {
    try {
      const customers = await db('contacts')
        .leftJoin('orders', 'contacts.id', 'orders.customer_id')
        .where('contacts.source_user_id', req.user.userId)
        .groupBy('contacts.id', 'contacts.name', 'contacts.phone', 'contacts.email', 'contacts.notes')
        .select(
          'contacts.id',
          'contacts.name',
          'contacts.phone',
          'contacts.email',
          'contacts.notes',
          db.raw('COUNT(orders.id) as order_count'),
          db.raw('MAX(orders.created_at) as last_order_at')
        )
        .orderBy('last_order_at', 'desc');

      res.json({ data: customers });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// POST /api/v1/orders — Créer une commande
router.post(
  '/',
  authenticate,
  antifraudCheck,
  validate(createOrderSchema),
  async (req, res) => {
    try {
      // Student validation: customer_name and payment_method required
      if (req.user.role === 'etudiant') {
        if (!req.body.customer_name) {
          return res.status(400).json({ error: 'CUSTOMER_NAME_REQUIRED', message: 'Le nom du client est obligatoire' });
        }
        if (!req.body.payment_method) {
          return res.status(400).json({ error: 'PAYMENT_METHOD_REQUIRED', message: 'Le moyen de paiement est obligatoire' });
        }
      }

      // Validate payment_method against role-based allowed list
      if (req.body.payment_method) {
        const allowed = orderService.getAllowedPaymentMethods(req.user.role);
        if (!allowed.includes(req.body.payment_method)) {
          return res.status(400).json({
            error: 'PAYMENT_METHOD_NOT_ALLOWED',
            message: `Le mode de paiement '${req.body.payment_method}' n'est pas autorisé pour votre rôle`,
          });
        }
      }

      const order = await orderService.createOrder({
        userId: req.user.userId,
        campaignId: req.body.campaign_id,
        items: req.body.items,
        customerId: req.body.customer_id,
        customerName: req.body.customer_name,
        customerPhone: req.body.customer_phone,
        customerEmail: req.body.customer_email,
        customerNotes: req.body.customer_notes,
        paymentMethod: req.body.payment_method,
        notes: req.body.notes,
        promoCode: req.body.promo_code || null,
      });
      res.status(201).json(order);
    } catch (err) {
      if (err.message === 'NOT_PARTICIPANT') {
        return res.status(403).json({ error: 'NOT_PARTICIPANT', message: 'Vous ne participez pas à cette campagne' });
      }
      if (err.message === 'INVALID_PRODUCTS') {
        return res.status(400).json({ error: 'INVALID_PRODUCTS', message: 'Produits invalides pour cette campagne' });
      }
      if (err.message === 'PRODUCT_UNAVAILABLE') {
        return res.status(400).json({ error: 'PRODUCT_UNAVAILABLE', message: "Un produit de votre panier n'est plus disponible. Veuillez le retirer et réessayer." });
      }
      if (err.message === 'MIN_ORDER_NOT_MET') {
        return res.status(400).json({ error: 'MIN_ORDER_NOT_MET', message: 'Commande minimum non atteinte' });
      }
      if (err.message.startsWith('DEFERRED_NOT_ELIGIBLE:')) {
        const names = err.message.split(':')[1];
        return res.status(400).json({ error: 'DEFERRED_NOT_ELIGIBLE', message: `Aucun produit éligible au paiement différé : ${names}` });
      }
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/orders/my — Unified order listing per role (MUST be before /:id)
router.get(
  '/my',
  authenticate,
  async (req, res) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const role = req.user.role;

      // Base query builder
      let query = db('orders')
        .leftJoin('contacts', 'orders.customer_id', 'contacts.id');

      // Role-based filtering
      if (role === 'etudiant') {
        query = query.where('orders.user_id', req.user.userId);
      } else if (role === 'cse') {
        query = query.where('orders.user_id', req.user.userId);
      } else if (role === 'ambassadeur') {
        query = query.where(function () {
          this.where('orders.user_id', req.user.userId)
            .orWhere('orders.referred_by', req.user.userId);
        });
      } else if (role === 'customer') {
        query = query.where('contacts.email', req.user.email);
      } else if (role === 'enseignant') {
        // Teacher: orders in my campaigns only
        const myCampaigns = await db('participations')
          .where({ user_id: req.user.userId })
          .select('campaign_id');
        const campaignIds = myCampaigns.map((p) => p.campaign_id);
        if (campaignIds.length === 0) {
          return res.json({ data: [], total: 0, page: parseInt(page), limit: parseInt(limit) });
        }
        query = query.whereIn('orders.campaign_id', campaignIds);
      } else {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Accès non autorisé' });
      }

      if (status) {
        query = query.where('orders.status', status);
      }

      // Count total
      const [{ count: total }] = await query.clone().clearSelect().clearOrder().count('orders.id as count');

      // Select fields — NO monetary fields for teacher
      let selectFields;
      if (role === 'enseignant') {
        selectFields = [
          'orders.id', 'orders.ref', 'orders.status', 'orders.total_items',
          'orders.source', 'orders.created_at', 'orders.updated_at',
          'contacts.name as customer_name',
        ];
      } else {
        selectFields = [
          'orders.id', 'orders.ref', 'orders.status', 'orders.total_ht',
          'orders.total_ttc', 'orders.total_items', 'orders.source',
          'orders.created_at', 'orders.updated_at',
          'contacts.name as customer_name',
        ];
      }

      const data = await query
        .select(selectFields)
        .orderBy('orders.created_at', 'desc')
        .limit(parseInt(limit))
        .offset(offset);

      res.json({ data, total: parseInt(total), page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/orders/:id — Détail commande
router.get('/:id', authenticate, async (req, res) => {
  try {
    const order = await db('orders')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .leftJoin('users as referrer', 'referrer.id', 'orders.referred_by')
      .where('orders.id', req.params.id)
      .select(
        'orders.*',
        db.raw("COALESCE(users.name, contacts.name, 'Client boutique') as user_name"),
        db.raw("COALESCE(users.email, contacts.email) as user_email"),
        'referrer.name as referrer_name',
        'referrer.email as referrer_email'
      )
      .first();

    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });

    // Vérifier accès
    if (req.user.role !== 'super_admin' && req.user.role !== 'commercial' && req.user.role !== 'comptable') {
      if (order.user_id !== req.user.userId && order.referred_by !== req.user.userId) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    const items = await db('order_items')
      .leftJoin('products', 'order_items.product_id', 'products.id')
      .where('order_items.order_id', req.params.id)
      .select(
        'order_items.*',
        db.raw("COALESCE(products.name, 'Frais de port') as product_name"),
        'products.image_url',
        'products.allows_deferred'
      );

    // Build caution_info for deferred-eligible orders
    const deferredProducts = items.filter((i) => i.allows_deferred);
    let cautionInfo = null;
    if (deferredProducts.length > 0) {
      // Find caution check for this order's user (status = held preferred)
      const userId = order.user_id;
      let cautionCheck = null;
      if (userId) {
        cautionCheck = await db('caution_checks')
          .where({ user_id: userId })
          .orderByRaw("CASE status WHEN 'held' THEN 0 WHEN 'cashed' THEN 1 WHEN 'returned' THEN 2 END")
          .first();
      }
      cautionInfo = {
        has_deferred_products: true,
        deferred_products: deferredProducts.map((p) => p.product_name),
        caution_check: cautionCheck ? {
          id: cautionCheck.id,
          amount: parseFloat(cautionCheck.amount),
          status: cautionCheck.status,
          received_at: cautionCheck.check_date || cautionCheck.created_at,
          returned_date: cautionCheck.returned_date || null,
        } : null,
      };
    }

    res.json({ ...order, order_items: items, caution_info: cautionInfo });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/v1/admin/orders — Liste commandes admin
router.get(
  '/admin/list',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable'),
  async (req, res) => {
    try {
      const result = await orderService.listOrders({
        campaignId: req.query.campaign_id,
        status: req.query.status,
        userId: req.query.user_id,
        source: req.query.source,
        includeReferrals: req.query.include_referrals === 'true' || req.query.include_referrals === true,
        page: parseInt(req.query.page || 1, 10),
        limit: parseInt(req.query.limit || 20, 10),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
);

// POST /api/v1/admin/orders/:id/validate — Valider une commande
router.post(
  '/admin/:id/validate',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const order = await orderService.validateOrder(req.params.id, req.user.userId);
      res.json(order);
    } catch (err) {
      if (err.message === 'ORDER_NOT_FOUND') {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      // Garde de règlement (orderService.validateOrder) : pas d'encaissement booké,
      // donc pas de validation. Message explicite, sans quoi l'écran n'affiche qu'« Erreur ».
      if (err.message === 'ORDER_NOT_SETTLED') {
        return res.status(409).json({
          error: 'ORDER_NOT_SETTLED',
          message: 'Cette commande ne peut pas être validée : aucun règlement n\'est enregistré. Enregistrez le règlement avant de valider.',
        });
      }
      res.status(400).json({ error: err.message });
    }
  }
);

// PUT /api/v1/orders/admin/:id/mark-paid — Enregistrer un règlement encaissé hors ligne.
//
// Symétrie STRICTE avec la confirmation webhook (boutiqueOrderService.confirmBoutiqueOrder /
// confirmCawlBoutiqueOrder) : enregistrer un règlement fait passer la commande en 'submitted',
// JAMAIS en 'validated'. Encaisser et valider sont deux actes distincts — la validation, avec
// son 12+1, son email et son BL, reste le fait du bouton « Valider la commande ».
//
// Avant ce correctif, la route sautait directement à 'validated' et divergeait du chemin
// nominal sur cinq axes : statut atteint, type d'événement financier ('payment_received' au
// lieu de 'sale'), absence de sortie de stock, INSERT d'une ligne de règlement en doublon,
// et absence de garde d'idempotence.
router.put(
  '/admin/:id/mark-paid',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const order = await db('orders').where({ id: req.params.id }).first();
      if (!order) return res.status(404).json({ error: 'NOT_FOUND' });

      // Deux refus distincts, mais UN SEUL message pour l'utilisateur quand la situation
      // qu'il vit est la même (« j'ai cliqué sur une commande déjà réglée ») :
      //   - un 'sale' existe        → 409 ALREADY_PAID, quel que soit le chemin emprunté ;
      //   - sinon, statut incompatible → 400, avec le statut réel dans le message.
      // La présence d'un 'sale' est le critère de vérité : c'est lui qui marque le revenu
      // booké, qu'il vienne du webhook, d'un enregistrement manuel, ou de la création d'une
      // commande campagne (orderService.createOrder en pose un dès l'insertion).
      const ALREADY_PAID = {
        error: 'ALREADY_PAID',
        message: 'Cette commande a déjà été réglée.',
      };

      // Statuts recevables pour un règlement. 'pending_stock' y figure comme RATTRAPAGE
      // assumé, et non comme un second correctif : une commande en attente de stock n'a
      // aujourd'hui aucun chemin de reprise de paiement côté client (le back sait créer
      // une session, l'exposition manque). Enregistrer le règlement ici est donc le seul
      // moyen de la faire avancer. Le corps de la route est inchangé : la commande passe
      // en 'submitted' avec son événement 'sale' et ses sorties de stock, puis se valide
      // normalement.
      const SETTLEABLE_STATUSES = ['pending_payment', 'pending_stock'];

      if (!SETTLEABLE_STATUSES.includes(order.status)) {
        const settled = await db('financial_events')
          .where({ order_id: order.id, type: 'sale' })
          .first();
        if (settled) return res.status(409).json(ALREADY_PAID);
        return res.status(400).json({
          error: 'INVALID_STATUS_TRANSITION',
          message: `Seules les commandes en attente de paiement ou de réapprovisionnement peuvent recevoir un règlement (statut actuel : ${order.status}).`,
        });
      }

      const { payment_method, notes } = req.body;
      // Map order payment_method to payments.method (contrainte : stripe/transfer/cash/check/paypal/cawl)
      const payMethodMap = { card: 'stripe', stripe: 'stripe', transfer: 'transfer', cash: 'cash', check: 'check', paypal: 'paypal' };
      const payMethod = payMethodMap[payment_method] || 'stripe';
      const saleAmount = parseFloat(order.total_ttc);

      let alreadySettled = false;

      await db.transaction(async (trx) => {
        // Verrou de ligne : sérialise deux appels concurrents. Le second attend la fin du
        // premier, relit 'submitted', et ressort sans écrire — c'est la seule garde qui
        // tienne réellement sous concurrence, un simple test de statut hors transaction
        // laissant les deux appels passer de front.
        const locked = await trx('orders').where({ id: order.id }).forUpdate().first();
        if (!SETTLEABLE_STATUSES.includes(locked.status)) {
          alreadySettled = true;
          return;
        }

        // Filet décisif : un 'sale' déjà booké signifie que le revenu est enregistré —
        // webhook arrivé entre-temps, OU commande campagne poussée à tort en
        // 'pending_payment' (PUT /admin/:id accepte un statut arbitraire). Sans ce filet,
        // on doublerait le chiffre d'affaires ET la sortie de stock.
        const existingSale = await trx('financial_events')
          .where({ order_id: order.id, type: 'sale' })
          .first();
        if (existingSale) {
          alreadySettled = true;
          return;
        }

        await trx('orders').where({ id: order.id }).update({
          status: 'submitted',
          payment_method: payment_method || order.payment_method,
          notes: notes ? (order.notes ? `${order.notes}\n${notes}` : notes) : order.notes,
          updated_at: new Date(),
        });

        // Règlement : la ligne posée à la création de la session de paiement existe déjà
        // (méthode 'cawl' ou 'stripe', statut 'pending') → UPDATE. INSERT en filet seulement,
        // pour ne jamais créer un second règlement sur la même commande.
        const existingPayment = await trx('payments')
          .where({ order_id: order.id })
          .orderBy('created_at')
          .first();
        if (existingPayment) {
          await trx('payments').where({ id: existingPayment.id }).update({
            method: payMethod,
            amount: saleAmount,
            status: 'reconciled',
            reconciled_at: new Date(),
            updated_at: new Date(),
          });
        } else {
          await trx('payments').insert({
            order_id: order.id,
            method: payMethod,
            amount: saleAmount,
            status: 'reconciled',
            reconciled_at: new Date(),
          });
        }

        // Booking REVENU : 'sale', comme le webhook. financial_events reste append-only.
        await trx('financial_events').insert({
          order_id: order.id,
          campaign_id: order.campaign_id,
          type: 'sale',
          amount: saleAmount,
          description: `Règlement encaissé hors ligne — ${payment_method || 'non précisé'}`,
          metadata: JSON.stringify({
            manual: true,
            payment_method: payment_method || null,
            recorded_by: req.user.userId,
          }),
        });

        // Sorties de stock (items produits uniquement, pas le port) — symétrie webhook.
        const items = await trx('order_items')
          .where({ order_id: order.id })
          .whereNotNull('product_id')
          .select('product_id', 'qty');
        if (items.length > 0) {
          await trx('stock_movements').insert(
            items.map((item) => ({
              product_id: item.product_id,
              campaign_id: order.campaign_id,
              type: 'exit',
              qty: item.qty,
              reference: order.ref,
            }))
          );
        }

        // Notification aux admins — symétrie webhook.
        const admins = await trx('users').whereIn('role', ['super_admin', 'comptable']).select('id');
        if (admins.length) {
          await trx('notifications').insert(
            admins.map((a) => ({
              user_id: a.id,
              type: 'order',
              message: `Règlement enregistré — ${order.ref} (${saleAmount.toFixed(2)} EUR)`,
              link: `/admin/orders?selected=${order.id}`,
            }))
          );
        }
      });

      if (alreadySettled) {
        logger.info(`mark-paid refusé: règlement déjà enregistré pour ${order.ref}`);
        return res.status(409).json(ALREADY_PAID);
      }

      const updated = await db('orders').where({ id: order.id }).first();

      // Invalidation CIBLÉE du cache de lecture (namespace vc:cache:* uniquement).
      // Remplace un flushDb() qui visait toute la base Redis — et qui, de fait, ne s'exécutait
      // jamais : config/redis.js n'expose pas `.client`, la garde était toujours fausse.
      await invalidateCache('vc:cache:*');

      logger.info(`Règlement enregistré pour ${order.ref} (${payMethod}, ${saleAmount}) → submitted`);

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// PUT /api/v1/orders/:id/deferred-items — Validate or refuse deferred items (Nicolas)
router.put(
  '/admin/:id/deferred-items',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const { action, item_ids } = req.body;
      if (!action || !['validate', 'refuse'].includes(action)) {
        return res.status(400).json({ error: 'INVALID_ACTION', message: 'action doit être "validate" ou "refuse"' });
      }
      if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
        return res.status(400).json({ error: 'MISSING_ITEMS', message: 'item_ids requis' });
      }

      const order = await db('orders').where({ id: req.params.id }).first();
      if (!order) return res.status(404).json({ error: 'NOT_FOUND' });

      // Verify items belong to this order and are deferred+pending
      const items = await db('order_items')
        .where('order_id', req.params.id)
        .where('is_deferred', true)
        .where('deferred_status', 'pending')
        .whereIn('id', item_ids);

      if (items.length === 0) {
        return res.status(400).json({ error: 'NO_PENDING_ITEMS', message: 'Aucune ligne différée en attente trouvée' });
      }

      const validItemIds = items.map((i) => i.id);
      const newStatus = action === 'validate' ? 'validated' : 'refused';

      await db.transaction(async (trx) => {
        // Update deferred_status on items
        await trx('order_items')
          .whereIn('id', validItemIds)
          .update({ deferred_status: newStatus });

        // Financial event (append-only)
        const itemsAmount = items.reduce((sum, i) => sum + parseFloat(i.unit_price_ttc) * i.qty, 0);
        await trx('financial_events').insert({
          order_id: order.id,
          campaign_id: order.campaign_id,
          type: action === 'validate' ? 'deferred_validated' : 'deferred_refused',
          amount: action === 'validate' ? parseFloat(itemsAmount.toFixed(2)) : 0,
          description: `${action === 'validate' ? 'Validation' : 'Refus'} paiement différé — ${items.length} ligne(s)`,
        });

        // Check if all deferred items are now resolved
        const remaining = await trx('order_items')
          .where('order_id', req.params.id)
          .where('is_deferred', true)
          .where('deferred_status', 'pending')
          .count('id as count')
          .first();

        if (parseInt(remaining.count, 10) === 0) {
          // All deferred items resolved — check if any were refused
          const refused = await trx('order_items')
            .where('order_id', req.params.id)
            .where('is_deferred', true)
            .where('deferred_status', 'refused')
            .count('id as count')
            .first();

          const allRefused = await trx('order_items')
            .where('order_id', req.params.id)
            .where('is_deferred', true)
            .count('id as count')
            .first();

          if (parseInt(refused.count, 10) === parseInt(allRefused.count, 10)) {
            // All deferred items refused — cancel if no immediate items
            const immediateItems = await trx('order_items')
              .where('order_id', req.params.id)
              .where('is_deferred', false)
              .count('id as count')
              .first();
            if (parseInt(immediateItems.count, 10) === 0) {
              await trx('orders').where({ id: req.params.id }).update({ status: 'cancelled', updated_at: new Date() });
            } else {
              await trx('orders').where({ id: req.params.id }).update({ status: 'validated', requires_caution_review: false, updated_at: new Date() });
            }
          } else {
            // Some validated — order goes to validated
            await trx('orders').where({ id: req.params.id }).update({ status: 'validated', requires_caution_review: false, updated_at: new Date() });
          }
        }
      });

      // Send refusal email if action is refuse
      if (action === 'refuse') {
        try {
          const emailService = require('../services/emailService');
          const itemDetails = await db('order_items')
            .join('products', 'order_items.product_id', 'products.id')
            .whereIn('order_items.id', validItemIds)
            .select('products.name', 'order_items.qty', 'order_items.unit_price_ttc');

          const buyer = await db('users').where({ id: order.user_id }).first();
          if (buyer) {
            emailService.sendDeferredRefused({
              email: buyer.email,
              name: buyer.name,
              orderRef: order.ref,
              items: itemDetails,
            }).catch((e) => logger.error(`Deferred refusal email failed: ${e.message}`));
          }

          // Email referrer if different from buyer
          if (order.referred_by && order.referred_by !== order.user_id) {
            const referrer = await db('users').where({ id: order.referred_by }).first();
            if (referrer) {
              emailService.sendDeferredRefused({
                email: referrer.email,
                name: referrer.name,
                orderRef: order.ref,
                items: itemDetails,
              }).catch((e) => logger.error(`Deferred refusal email (referrer) failed: ${e.message}`));
            }
          }
        } catch (e) {
          logger.error(`Deferred refusal email hook error: ${e.message}`);
        }
      }

      // Invalidate Redis cache
      try {
        const redis = require('../config/redis');
        if (redis.client) await redis.client.flushDb();
      } catch (_) { /* graceful */ }

      const updatedOrder = await db('orders').where({ id: req.params.id }).first();
      const updatedItems = await db('order_items')
        .leftJoin('products', 'order_items.product_id', 'products.id')
        .where('order_items.order_id', req.params.id)
        .select('order_items.*', db.raw("COALESCE(products.name, 'Frais de port') as product_name"));

      res.json({ ...updatedOrder, order_items: updatedItems });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/orders/:id/invoice — Generate invoice PDF
router.get('/:id/invoice', authenticate, async (req, res) => {
  try {
    const order = await db('orders')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .where('orders.id', req.params.id)
      .select(
        'orders.*',
        db.raw("COALESCE(contacts.name, users.name, 'Client') as user_name"),
        db.raw('COALESCE(users.email, contacts.email) as user_email')
      )
      .first();

    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });

    // Access control: owner OR referred_by student can access invoice
    if (!['super_admin', 'commercial', 'comptable'].includes(req.user.role)) {
      if (order.user_id !== req.user.userId && order.referred_by !== req.user.userId) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    const items = await db('order_items')
      .leftJoin('products', 'order_items.product_id', 'products.id')
      .where('order_items.order_id', req.params.id)
      .select('order_items.*', db.raw("COALESCE(products.name, 'Frais de port') as product_name"));

    // Calculate TVA split from order_items.vat_rate (persisted at order time)
    let tva20HT = 0;
    let tva55HT = 0;
    for (const item of items) {
      const lineHT = parseFloat(item.unit_price_ht) * item.qty;
      if (parseFloat(item.vat_rate) === 5.5) {
        tva55HT += lineHT;
      } else {
        tva20HT += lineHT;
      }
    }
    const tva20Amount = parseFloat((tva20HT * 0.20).toFixed(2));
    const tva55Amount = parseFloat((tva55HT * 0.055).toFixed(2));

    // Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=facture-${order.ref}.pdf`);
    doc.pipe(res);

    // Header
    const brandingInv = await getAppBranding();
    doc.fontSize(20).text(brandingInv.app_name, { align: 'center' });
    doc.fontSize(10).text('Nicolas Froment — Angers', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Facture ${order.ref}`, { align: 'left' });
    doc.fontSize(10).text(`Date: ${new Date(order.created_at).toLocaleDateString('fr-FR')}`);
    doc.text(`Client: ${order.user_name}`);
    doc.moveDown();

    // Items table header
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Produit', 50, doc.y, { width: 200, continued: false });
    const headerY = doc.y - 12;
    doc.text('Qté', 260, headerY, { width: 40 });
    doc.text('P.U. HT', 310, headerY, { width: 60 });
    doc.text('TVA', 380, headerY, { width: 40 });
    doc.text('Total HT', 430, headerY, { width: 70 });
    doc.moveTo(50, doc.y + 2).lineTo(520, doc.y + 2).stroke();
    doc.moveDown(0.5);

    // Items
    doc.font('Helvetica');
    for (const item of items) {
      const lineHT = parseFloat(item.unit_price_ht) * item.qty;
      const y = doc.y;
      doc.text(item.product_name, 50, y, { width: 200 });
      doc.text(String(item.qty), 260, y, { width: 40 });
      doc.text(`${parseFloat(item.unit_price_ht).toFixed(2)}`, 310, y, { width: 60 });
      doc.text(`${parseFloat(item.vat_rate)}%`, 380, y, { width: 40 });
      doc.text(`${lineHT.toFixed(2)}`, 430, y, { width: 70 });
    }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(520, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    doc.font('Helvetica-Bold');
    doc.text(`Total HT: ${parseFloat(order.total_ht).toFixed(2)} EUR`, 350, doc.y);
    if (tva20Amount > 0) doc.text(`TVA 20%: ${tva20Amount.toFixed(2)} EUR`, 350);
    if (tva55Amount > 0) doc.text(`TVA 5.5%: ${tva55Amount.toFixed(2)} EUR`, 350);
    doc.text(`Total TTC: ${parseFloat(order.total_ttc).toFixed(2)} EUR`, 350);

    doc.fillColor('#c0c0c0').fontSize(6).text('Réalisation Cap-Numerik Angers — 07 60 40 39 66 — www.cap-numerik.fr', 50, 780, { align: 'center', width: 495 });
    addCapNumerikFooter(doc);
    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/orders/admin/create — Créer commande côté admin
router.post(
  '/admin/create',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const { campaign_id, customer_id, items, notes, promo_code, payment_method, target_user_id } = req.body;
      if (!campaign_id || !items || !items.length) {
        return res.status(400).json({ error: 'MISSING_FIELDS', message: 'campaign_id et items sont requis' });
      }
      const effectiveUserId = target_user_id || req.user.userId;
      const order = await orderService.createOrder({
        userId: effectiveUserId,
        campaignId: campaign_id,
        items,
        customerId: customer_id,
        notes,
        promoCode: promo_code || null,
        paymentMethod: payment_method || null,
      });
      res.status(201).json(order);
    } catch (err) {
      if (err.message === 'INVALID_PRODUCTS') return res.status(400).json({ error: err.message });
      if (err.message === 'PRODUCT_UNAVAILABLE') return res.status(400).json({ error: err.message, message: "Un produit n'est plus disponible." });
      if (err.message === 'NOT_PARTICIPANT') return res.status(403).json({ error: err.message });
      if (err.message.startsWith('DEFERRED_NOT_ELIGIBLE:')) {
        const names = err.message.split(':')[1];
        return res.status(400).json({ error: 'DEFERRED_NOT_ELIGIBLE', message: `Aucun produit éligible au paiement différé : ${names}` });
      }
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// PUT /api/v1/orders/admin/:id — Modifier commande (si draft/submitted)
router.put(
  '/admin/:id',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const order = await db('orders').where({ id: req.params.id }).first();
      if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!['draft', 'submitted'].includes(order.status)) {
        return res.status(400).json({ error: 'ORDER_NOT_EDITABLE', message: 'Seules les commandes en brouillon ou soumises peuvent être modifiées' });
      }

      const update = { updated_at: new Date() };
      if (req.body.notes !== undefined) update.notes = req.body.notes;
      if (req.body.status) update.status = req.body.status;

      // If items are being updated, recalculate totals
      if (req.body.items && Array.isArray(req.body.items)) {
        const products = await db('products').whereIn('id', req.body.items.map(i => i.productId || i.product_id));
        let totalHT = 0, totalTTC = 0, totalItems = 0;

        // Delete old order_items and insert new ones
        await db('order_items').where({ order_id: req.params.id }).del();

        const orderItems = [];
        for (const item of req.body.items) {
          const pid = item.productId || item.product_id;
          const product = products.find(p => p.id === pid);
          if (!product) continue;
          const qty = item.qty;
          totalHT += parseFloat(product.price_ht) * qty;
          totalTTC += parseFloat(product.price_ttc) * qty;
          totalItems += qty;
          orderItems.push({
            order_id: req.params.id,
            product_id: pid,
            qty,
            unit_price_ht: product.price_ht,
            unit_price_ttc: product.price_ttc,
            vat_rate: product.tva_rate,
          });
        }
        if (orderItems.length > 0) await db('order_items').insert(orderItems);

        update.total_ht = parseFloat(totalHT.toFixed(2));
        update.total_ttc = parseFloat(totalTTC.toFixed(2));
        update.total_items = totalItems;
        update.items = JSON.stringify(req.body.items);
      }

      const [updated] = await db('orders').where({ id: req.params.id }).update(update).returning('*');
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// DELETE /api/v1/orders/admin/:id — Annuler commande
router.delete(
  '/admin/:id',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const order = await db('orders').where({ id: req.params.id }).first();
      if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
      if (order.status === 'cancelled') return res.status(400).json({ error: 'ALREADY_CANCELLED' });

      await db('orders').where({ id: req.params.id }).update({ status: 'cancelled', updated_at: new Date() });

      // Create correction financial event
      await db('financial_events').insert({
        order_id: req.params.id,
        campaign_id: order.campaign_id,
        type: 'correction',
        amount: -parseFloat(order.total_ttc),
        description: `Annulation commande ${order.ref}`,
      });

      res.json({ message: 'Commande annulée', ref: order.ref });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// PATCH /api/v1/orders/admin/:id/assign — Rattacher commande boutique à un étudiant
router.patch(
  '/admin/:id/assign',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: true, code: 'MISSING_USER_ID', message: 'user_id requis' });

      const order = await db('orders').where({ id: req.params.id }).first();
      if (!order) return res.status(404).json({ error: true, code: 'NOT_FOUND', message: 'Commande introuvable' });

      if (order.referred_by) {
        return res.status(409).json({ error: true, code: 'ALREADY_ASSIGNED', message: `Commande déjà rattachée` });
      }

      // Verify user exists and get referral code
      const user = await db('users').where({ id: user_id }).first();
      if (!user) return res.status(400).json({ error: true, code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable' });
      if (!['etudiant', 'ambassadeur'].includes(user.role)) {
        return res.status(400).json({ error: true, code: 'INVALID_ROLE', message: 'L\'utilisateur doit être étudiant ou ambassadeur' });
      }

      const participation = await db('participations').where({ user_id }).select('referral_code').first();
      const referralCode = participation?.referral_code || null;
      const source = user.role === 'etudiant' ? 'student_referral' : 'ambassador_referral';

      await db('orders').where({ id: req.params.id }).update({
        referred_by: user_id,
        referral_code: referralCode,
        source,
        updated_at: new Date(),
      });

      // Append-only financial event for traceability
      await db('financial_events').insert({
        order_id: req.params.id,
        campaign_id: order.campaign_id,
        type: 'correction',
        amount: 0,
        description: `Rattachement commande ${order.ref} à ${user.name} (${user.role})`,
      });

      res.json({ message: 'Commande rattachée', ref: order.ref, assigned_to: user.name, referral_code: referralCode });
    } catch (err) {
      res.status(500).json({ error: true, code: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/orders/:id/pdf — Générer PDF commande
router.get('/:id/pdf', authenticate, async (req, res) => {
  try {
    // LEFT JOIN users + COALESCE contacts : PDF accessible aussi pour cmd boutique web (user_id NULL)
    // Priorité contacts.name : pour un document destiné au client, c'est le nom du client final (pas l'étudiant qui a saisi la commande pour lui)
    const order = await db('orders')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .where('orders.id', req.params.id)
      .select(
        'orders.*',
        db.raw("COALESCE(contacts.name, users.name, 'Client') as user_name"),
        db.raw('COALESCE(users.email, contacts.email) as user_email'),
        'contacts.name as customer_name',
        'contacts.address as customer_address'
      )
      .first();

    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });

    if (!['super_admin', 'commercial', 'comptable'].includes(req.user.role)) {
      if (order.user_id !== req.user.userId) return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const items = await db('order_items')
      .leftJoin('products', 'order_items.product_id', 'products.id')
      .where('order_items.order_id', req.params.id)
      .select('order_items.*', db.raw("COALESCE(products.name, 'Frais de port') as product_name"));

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=commande-${order.ref}.pdf`);
    doc.pipe(res);

    // Header
    const brandingBon = await getAppBranding();
    doc.fontSize(22).fillColor('#7a1c3b').text(brandingBon.app_name, { align: 'center' });
    doc.fontSize(9).fillColor('#666').text('Nicolas Froment — Angers — vins.et.conversations@gmail.com', { align: 'center' });
    doc.moveDown(1.5);

    // Order info
    doc.fontSize(14).fillColor('#333').text(`Bon de commande ${order.ref}`);
    doc.fontSize(10).fillColor('#666');
    doc.text(`Date : ${new Date(order.created_at).toLocaleDateString('fr-FR')}`);
    doc.text(`Client : ${order.customer_name || order.user_name}`);
    if (order.customer_address) doc.text(`Adresse : ${order.customer_address}`);
    doc.moveDown();

    // Table header
    doc.fontSize(9).fillColor('#333').font('Helvetica-Bold');
    const tableTop = doc.y;
    doc.text('Produit', 50, tableTop, { width: 200 });
    doc.text('Qté', 260, tableTop, { width: 40 });
    doc.text('P.U. HT', 310, tableTop, { width: 60 });
    doc.text('TVA', 380, tableTop, { width: 40 });
    doc.text('Total HT', 440, tableTop, { width: 70 });
    doc.moveTo(50, doc.y + 4).lineTo(520, doc.y + 4).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);

    // Items
    doc.font('Helvetica').fillColor('#333');
    for (const item of items) {
      const lineHT = parseFloat(item.unit_price_ht) * item.qty;
      const y = doc.y;
      doc.text(item.product_name, 50, y, { width: 200 });
      doc.text(String(item.qty), 260, y, { width: 40 });
      doc.text(`${parseFloat(item.unit_price_ht).toFixed(2)} €`, 310, y, { width: 60 });
      doc.text(`${parseFloat(item.vat_rate)}%`, 380, y, { width: 40 });
      doc.text(`${lineHT.toFixed(2)} €`, 440, y, { width: 70 });
    }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(520, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);

    // Totals
    doc.font('Helvetica-Bold').fillColor('#333');
    doc.text(`Total HT : ${parseFloat(order.total_ht).toFixed(2)} €`, 350, doc.y);
    const tvaAmount = parseFloat(order.total_ttc) - parseFloat(order.total_ht);
    doc.text(`TVA : ${tvaAmount.toFixed(2)} €`, 350);
    doc.fontSize(12).fillColor('#7a1c3b').text(`Total TTC : ${parseFloat(order.total_ttc).toFixed(2)} €`, 350);

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#999').font('Helvetica');
    doc.text(`Conditions : paiement à réception sauf accord préalable. ${brandingBon.app_name} — SIRET 000 000 000 00000`, 50);

    doc.fillColor('#c0c0c0').fontSize(6).text('Réalisation Cap-Numerik Angers — 07 60 40 39 66 — www.cap-numerik.fr', 50, 780, { align: 'center', width: 495 });
    addCapNumerikFooter(doc);
    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/orders/:id/send-email — Préparer envoi email
router.post(
  '/:id/send-email',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      // LEFT JOIN users + contacts : send-email fonctionne aussi pour cmd boutique web (user_id NULL)
      // Email destinataire = acheteur (users.email ou contacts.email), PAS le parrain (qui a son propre flux ligne 502)
      const order = await db('orders')
        .leftJoin('users', 'orders.user_id', 'users.id')
        .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
        .where('orders.id', req.params.id)
        .select(
          'orders.*',
          db.raw("COALESCE(users.name, contacts.name, '(externe)') as user_name"),
          db.raw('COALESCE(users.email, contacts.email) as user_email')
        )
        .first();

      if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!order.user_email) {
        return res.status(422).json({
          error: 'NO_RECIPIENT_EMAIL',
          message: 'Commande sans email destinataire',
        });
      }

      // Log the email action (actual sending will be configured later with nodemailer)
      await db('audit_log').insert({
        user_id: req.user.userId,
        action: 'SEND_EMAIL',
        entity: 'orders',
        entity_id: req.params.id,
        after: JSON.stringify({ to: order.user_email, subject: `Commande ${order.ref}`, status: 'queued' }),
        ip_address: req.ip,
      });

      res.json({ message: 'Email préparé', to: order.user_email, ref: order.ref, status: 'queued' });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
