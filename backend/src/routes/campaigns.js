const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditAction } = require('../middleware/audit');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/v1/admin/campaigns
router.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const campaigns = await db('campaigns')
      .join('organizations', 'campaigns.org_id', 'organizations.id')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .select('campaigns.*', 'organizations.name as org_name', 'client_types.label as type_label')
      .orderBy('campaigns.created_at', 'desc');

    const enriched = await Promise.all(campaigns.map(async (c) => {
      const stats = await db('orders')
        .where({ campaign_id: c.id })
        .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .sum('total_ttc as ca').count('id as orders').first();
      const participants = await db('participations').where({ campaign_id: c.id }).count('id as count').first();
      const daysRemaining = c.end_date
        ? Math.max(0, Math.ceil((new Date(c.end_date) - new Date()) / 86400000)) : null;

      return {
        ...c,
        ca: parseFloat(stats?.ca || 0),
        orders_count: parseInt(stats?.orders || 0, 10),
        participants: parseInt(participants?.count || 0, 10),
        days_remaining: daysRemaining,
        progress: c.goal > 0 ? Math.round((parseFloat(stats?.ca || 0) / c.goal) * 100) : 0,
      };
    }));

    res.json({ data: enriched });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/campaigns/:id — Détail campagne + stats complètes
router.get('/:id', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const campaign = await db('campaigns')
      .where('campaigns.id', req.params.id)
      .join('organizations', 'campaigns.org_id', 'organizations.id')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .select('campaigns.*', 'organizations.name as org_name', 'client_types.label as type_label')
      .first();
    if (!campaign) return res.status(404).json({ error: 'NOT_FOUND' });

    const validStatuses = ['submitted', 'validated', 'preparing', 'shipped', 'delivered'];

    // KPIs globaux
    const orderStats = await db('orders')
      .where({ campaign_id: campaign.id })
      .whereIn('status', validStatuses)
      .select(
        db.raw('COALESCE(SUM(total_ttc), 0) as ca_ttc'),
        db.raw('COALESCE(SUM(total_ht), 0) as ca_ht'),
        db.raw('COUNT(id) as orders_count'),
        db.raw('COALESCE(AVG(total_ttc), 0) as panier_moyen')
      )
      .first();

    const participantsCount = await db('participations')
      .where({ campaign_id: campaign.id }).count('id as count').first();

    const bottlesResult = await db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .where('orders.campaign_id', campaign.id)
      .whereIn('orders.status', validStatuses)
      .select(db.raw('COALESCE(SUM(order_items.qty), 0) as total_bottles'))
      .first();

    const daysRemaining = campaign.end_date
      ? Math.max(0, Math.ceil((new Date(campaign.end_date) - new Date()) / 86400000)) : null;

    // Participants avec stats individuelles
    const participants = await db('participations')
      .where('participations.campaign_id', campaign.id)
      .join('users', 'participations.user_id', 'users.id')
      .leftJoin(
        db('orders')
          .where('campaign_id', campaign.id)
          .whereIn('status', validStatuses)
          .select('user_id')
          .sum('total_ttc as ca')
          .count('id as orders_count')
          .groupBy('user_id')
          .as('o'),
        'o.user_id', 'users.id'
      )
      .select(
        'users.id', 'users.name', 'users.email', 'users.role',
        'participations.created_at as joined_at',
        db.raw('COALESCE(o.ca, 0) as ca'),
        db.raw('COALESCE(o.orders_count, 0) as orders_count')
      )
      .orderBy('ca', 'desc');

    // Vins / produits avec stats
    const products = await db('campaign_products')
      .where('campaign_products.campaign_id', campaign.id)
      .join('products', 'campaign_products.product_id', 'products.id')
      .leftJoin(
        db('order_items')
          .join('orders', 'order_items.order_id', 'orders.id')
          .where('orders.campaign_id', campaign.id)
          .whereIn('orders.status', validStatuses)
          .select('order_items.product_id')
          .sum('order_items.qty as qty_sold')
          .select(db.raw('SUM(order_items.qty * order_items.unit_price_ttc) as ca_ttc'))
          .groupBy('order_items.product_id')
          .as('s'),
        's.product_id', 'products.id'
      )
      .select(
        'products.id', 'products.name', 'products.color', 'products.region',
        'products.price_ttc', 'products.category',
        'campaign_products.custom_price', 'campaign_products.active as cp_active',
        db.raw('COALESCE(s.qty_sold, 0) as qty_sold'),
        db.raw('COALESCE(s.ca_ttc, 0) as ca_ttc')
      )
      .orderBy('qty_sold', 'desc');

    // Stats par classe (group by organization pour multi-classes)
    const classeStats = await db('participations')
      .where('participations.campaign_id', campaign.id)
      .join('users', 'participations.user_id', 'users.id')
      .leftJoin(
        db('orders')
          .where('campaign_id', campaign.id)
          .whereIn('status', validStatuses)
          .select('user_id')
          .sum('total_ttc as ca')
          .count('id as orders_count')
          .groupBy('user_id')
          .as('o'),
        'o.user_id', 'users.id'
      )
      .select(
        db.raw("COALESCE(users.metadata->>'class', 'Non assigné') as class_name"),
        db.raw('COUNT(DISTINCT users.id) as students'),
        db.raw('COALESCE(SUM(o.ca), 0) as ca'),
        db.raw('COALESCE(SUM(o.orders_count), 0) as orders_count')
      )
      .groupBy('class_name')
      .orderBy('ca', 'desc');

    // Evolution CA par jour
    const dailyCA = await db('orders')
      .where({ campaign_id: campaign.id })
      .whereIn('status', validStatuses)
      .select(db.raw("DATE(created_at) as date"))
      .sum('total_ttc as ca')
      .groupBy('date')
      .orderBy('date');

    res.json({
      campaign: {
        ...campaign,
        ca_ttc: parseFloat(orderStats?.ca_ttc || 0),
        ca_ht: parseFloat(orderStats?.ca_ht || 0),
        orders_count: parseInt(orderStats?.orders_count || 0, 10),
        panier_moyen: parseFloat(orderStats?.panier_moyen || 0),
        participants_count: parseInt(participantsCount?.count || 0, 10),
        total_bottles: parseInt(bottlesResult?.total_bottles || 0, 10),
        days_remaining: daysRemaining,
        progress: campaign.goal > 0 ? Math.round((parseFloat(orderStats?.ca_ttc || 0) / campaign.goal) * 100) : 0,
      },
      participants,
      products,
      classes: classeStats,
      dailyCA,
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/campaigns/:id/send-report — Rapport adapté par rôle
router.post('/:id/send-report', authenticate, requireRole('super_admin', 'commercial'), auditAction('campaigns'), async (req, res) => {
  try {
    const { user_ids } = req.body; // optional: specific user IDs, else all participants
    const campaign = await db('campaigns')
      .where('campaigns.id', req.params.id)
      .join('organizations', 'campaigns.org_id', 'organizations.id')
      .select('campaigns.*', 'organizations.name as org_name')
      .first();
    if (!campaign) return res.status(404).json({ error: 'NOT_FOUND' });

    const validStatuses = ['submitted', 'validated', 'preparing', 'shipped', 'delivered'];

    // Global stats
    const globalStats = await db('orders')
      .where({ campaign_id: campaign.id })
      .whereIn('status', validStatuses)
      .select(
        db.raw('COALESCE(SUM(total_ttc), 0) as ca_ttc'),
        db.raw('COALESCE(SUM(total_ht), 0) as ca_ht'),
        db.raw('COUNT(id) as orders_count')
      ).first();

    const totalBottles = await db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .where('orders.campaign_id', campaign.id)
      .whereIn('orders.status', validStatuses)
      .select(db.raw('COALESCE(SUM(order_items.qty), 0) as total')).first();

    const participantsCount = await db('participations')
      .where({ campaign_id: campaign.id }).count('id as count').first();

    const progress = campaign.goal > 0
      ? Math.round((parseFloat(globalStats.ca_ttc) / campaign.goal) * 100) : 0;

    const period = campaign.start_date && campaign.end_date
      ? `${new Date(campaign.start_date).toLocaleDateString('fr-FR')} — ${new Date(campaign.end_date).toLocaleDateString('fr-FR')}`
      : '—';

    const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

    // Determine recipients
    let recipients;
    if (user_ids && user_ids.length) {
      recipients = await db('users').whereIn('id', user_ids);
    } else {
      recipients = await db('participations')
        .where({ campaign_id: campaign.id })
        .join('users', 'participations.user_id', 'users.id')
        .select('users.*');
    }

    let sent = 0;
    for (const user of recipients) {
      let reportContent = '';

      if (['super_admin', 'commercial', 'comptable'].includes(user.role)) {
        // Admin: full financials
        reportContent = `
          <div class="card">
            <div class="card-row"><span class="card-label">CA TTC</span><span class="card-value">${formatEur(globalStats.ca_ttc)}</span></div>
            <div class="card-row"><span class="card-label">CA HT</span><span class="card-value">${formatEur(globalStats.ca_ht)}</span></div>
            <div class="card-row"><span class="card-label">Commission (5% HT)</span><span class="card-value">${formatEur(parseFloat(globalStats.ca_ht) * 0.05)}</span></div>
            <div class="card-row"><span class="card-label">Commandes</span><span class="card-value">${globalStats.orders_count}</span></div>
            <div class="card-row"><span class="card-label">Bouteilles</span><span class="card-value">${totalBottles.total}</span></div>
            <div class="card-row"><span class="card-label">Participants</span><span class="card-value">${participantsCount.count}</span></div>
          </div>`;
      } else if (user.role === 'enseignant') {
        // Teacher: no EUR amounts
        reportContent = `
          <div class="card">
            <div class="card-row"><span class="card-label">Progression</span><span class="card-value">${progress}%</span></div>
            <div class="card-row"><span class="card-label">Commandes</span><span class="card-value">${globalStats.orders_count}</span></div>
            <div class="card-row"><span class="card-label">Bouteilles vendues</span><span class="card-value">${totalBottles.total}</span></div>
            <div class="card-row"><span class="card-label">Participants actifs</span><span class="card-value">${participantsCount.count}</span></div>
          </div>`;
      } else if (user.role === 'etudiant') {
        // Student: personal stats
        const userStats = await db('orders')
          .where({ campaign_id: campaign.id, user_id: user.id })
          .whereIn('status', validStatuses)
          .select(
            db.raw('COALESCE(SUM(total_ttc), 0) as my_ca'),
            db.raw('COUNT(id) as my_orders')
          ).first();
        const myBottles = await db('order_items')
          .join('orders', 'order_items.order_id', 'orders.id')
          .where({ 'orders.campaign_id': campaign.id, 'orders.user_id': user.id })
          .whereIn('orders.status', validStatuses)
          .select(db.raw('COALESCE(SUM(order_items.qty), 0) as total')).first();
        reportContent = `
          <div class="card">
            <div class="card-row"><span class="card-label">Mon CA</span><span class="card-value">${formatEur(userStats.my_ca)}</span></div>
            <div class="card-row"><span class="card-label">Mes commandes</span><span class="card-value">${userStats.my_orders}</span></div>
            <div class="card-row"><span class="card-label">Bouteilles vendues</span><span class="card-value">${myBottles.total}</span></div>
          </div>`;
      } else if (user.role === 'cse') {
        // CSE: savings
        const cseStats = await db('orders')
          .where({ campaign_id: campaign.id, user_id: user.id })
          .whereIn('status', validStatuses)
          .select(db.raw('COALESCE(SUM(total_ttc), 0) as my_ca')).first();
        const savings = parseFloat(cseStats.my_ca) * 0.10; // 10% discount
        reportContent = `
          <div class="card">
            <div class="card-row"><span class="card-label">Total commandes</span><span class="card-value">${formatEur(cseStats.my_ca)}</span></div>
            <div class="card-row"><span class="card-label">Économie réalisée (-10%)</span><span class="card-value highlight">${formatEur(savings)}</span></div>
          </div>`;
      } else if (user.role === 'ambassadeur') {
        // Ambassador: tier progress
        const ambStats = await db('orders')
          .where({ campaign_id: campaign.id, user_id: user.id })
          .whereIn('status', validStatuses)
          .select(db.raw('COALESCE(SUM(total_ttc), 0) as my_ca')).first();
        const ca = parseFloat(ambStats.my_ca);
        const tier = ca >= 5000 ? 'Platine' : ca >= 3000 ? 'Or' : ca >= 1500 ? 'Argent' : ca >= 500 ? 'Bronze' : 'Débutant';
        const nextTier = ca >= 5000 ? '—' : ca >= 3000 ? `${formatEur(5000 - ca)} pour Platine` : ca >= 1500 ? `${formatEur(3000 - ca)} pour Or` : ca >= 500 ? `${formatEur(1500 - ca)} pour Argent` : `${formatEur(500 - ca)} pour Bronze`;
        reportContent = `
          <div class="card">
            <div class="card-row"><span class="card-label">Mon CA</span><span class="card-value">${formatEur(ca)}</span></div>
            <div class="card-row"><span class="card-label">Niveau actuel</span><span class="card-value highlight">${tier}</span></div>
            <div class="card-row"><span class="card-label">Prochain palier</span><span class="card-value">${nextTier}</span></div>
          </div>`;
      }

      await emailService.sendCampaignReport({
        email: user.email,
        name: user.name,
        campaignName: campaign.name,
        orgName: campaign.org_name,
        period,
        progress,
        reportContent,
      });
      sent++;
    }

    res.json({ message: `${sent} rapport(s) envoyé(s)`, sent });
  } catch (err) {
    logger.error(`Send report error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/campaigns/:id/duplicate
router.post('/:id/duplicate', authenticate, requireRole('super_admin'), auditAction('campaigns'), async (req, res) => {
  try {
    const source = await db('campaigns').where({ id: req.params.id }).first();
    if (!source) return res.status(404).json({ error: 'NOT_FOUND' });

    const newId = uuidv4();
    const year = new Date().getFullYear();
    await db.transaction(async (trx) => {
      await trx('campaigns').insert({
        id: newId,
        org_id: source.org_id,
        client_type_id: source.client_type_id,
        name: source.name.replace(/\d{4}[-/]\d{4}/, `${year}-${year + 1}`),
        status: 'draft',
        goal: source.goal,
        config: source.config,
      });

      // Copier les produits assignés
      const products = await trx('campaign_products').where({ campaign_id: source.id });
      if (products.length) {
        await trx('campaign_products').insert(
          products.map((p) => ({ campaign_id: newId, product_id: p.product_id, custom_price: p.custom_price, active: p.active, sort_order: p.sort_order }))
        );
      }
    });

    res.status(201).json({ id: newId, message: 'Campagne dupliquée' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// Campaign creation schema
const campaignSchema = Joi.object({
  name: Joi.string().min(3).max(200).required(),
  org_id: Joi.string().uuid().required(),
  client_type_id: Joi.string().uuid().required(),
  status: Joi.string().valid('draft', 'active', 'paused', 'completed', 'archived').default('draft'),
  goal: Joi.number().min(0).default(0),
  start_date: Joi.date().allow(null),
  end_date: Joi.date().allow(null),
  config: Joi.object().default({}),
  products: Joi.array().items(Joi.object({
    product_id: Joi.string().uuid().required(),
    custom_price: Joi.number().allow(null),
    sort_order: Joi.number().integer().default(0),
  })).default([]),
  participants: Joi.array().items(Joi.string().uuid()).default([]),
});

// GET /api/v1/admin/campaigns/resources — Lookup data for wizard
router.get('/resources', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const organizations = await db('organizations').orderBy('name');
    const clientTypes = await db('client_types').orderBy('label');
    const products = await db('products').where({ active: true }).orderBy('sort_order');
    const users = await db('users').where({ active: true }).select('id', 'name', 'email', 'role').orderBy('name');
    res.json({ organizations, clientTypes, products, users });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/campaigns — Create campaign (full wizard)
router.post('/', authenticate, requireRole('super_admin'), auditAction('campaigns'), validate(campaignSchema), async (req, res) => {
  try {
    const { products: productList, participants, ...campaignData } = req.body;

    const newId = uuidv4();
    await db.transaction(async (trx) => {
      await trx('campaigns').insert({ id: newId, ...campaignData });

      if (productList.length) {
        await trx('campaign_products').insert(
          productList.map((p, i) => ({
            campaign_id: newId,
            product_id: p.product_id,
            custom_price: p.custom_price,
            sort_order: p.sort_order ?? i,
            active: true,
          }))
        );
      }

      if (participants.length) {
        await trx('participations').insert(
          participants.map((userId) => ({
            user_id: userId,
            campaign_id: newId,
          }))
        );
      }
    });

    res.status(201).json({ id: newId, message: 'Campagne créée' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/campaigns/:id — Update campaign
router.put('/:id', authenticate, requireRole('super_admin'), auditAction('campaigns'), async (req, res) => {
  try {
    const { products: productList, participants, ...campaignData } = req.body;

    await db.transaction(async (trx) => {
      const [updated] = await trx('campaigns')
        .where({ id: req.params.id })
        .update({ ...campaignData, updated_at: new Date() })
        .returning('*');
      if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });

      // Sync products if provided
      if (productList) {
        await trx('campaign_products').where({ campaign_id: req.params.id }).del();
        if (productList.length) {
          await trx('campaign_products').insert(
            productList.map((p, i) => ({
              campaign_id: req.params.id,
              product_id: p.product_id,
              custom_price: p.custom_price,
              sort_order: p.sort_order ?? i,
              active: true,
            }))
          );
        }
      }

      // Sync participants if provided
      if (participants) {
        await trx('participations').where({ campaign_id: req.params.id }).del();
        if (participants.length) {
          await trx('participations').insert(
            participants.map((userId) => ({
              user_id: userId,
              campaign_id: req.params.id,
            }))
          );
        }
      }

      res.json(updated);
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
