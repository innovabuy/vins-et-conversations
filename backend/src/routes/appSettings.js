const express = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const { invalidateCache } = require('../middleware/cache');
const logger = require('../utils/logger');

const router = express.Router();
const publicRouter = express.Router();

// ─── Multer config for logos ────────────────────────
const logoStorage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/logos'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `logo_${Date.now()}${ext}`);
  },
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Format non supporté. Utilisez JPG, PNG, WebP ou SVG.'));
  },
});

const SECRET_KEYS = ['stripe_test_secret_key', 'stripe_live_secret_key', 'stripe_webhook_secret', 'smtp_password'];

function maskSecret(value) {
  if (!value || value.length <= 8) return '****';
  return '****' + value.slice(-8);
}

// ─── Admin: GET /api/v1/admin/settings ───────────────
router.get('/', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const settings = await db('app_settings').orderBy('key');
    const result = {};
    for (const s of settings) {
      result[s.key] = SECRET_KEYS.includes(s.key) ? maskSecret(s.value) : s.value;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Admin: GET /api/v1/admin/settings/stripe-test ───
router.get('/stripe-test', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const modeRow = await db('app_settings').where({ key: 'stripe_mode' }).first();
    const mode = modeRow?.value || 'test';
    const secretKeyName = mode === 'live' ? 'stripe_live_secret_key' : 'stripe_test_secret_key';
    const secretRow = await db('app_settings').where({ key: secretKeyName }).first();
    const secretKey = secretRow?.value;

    if (!secretKey || secretKey.includes('placeholder') || secretKey.length < 10) {
      return res.json({ connected: false, mode, error: 'Clé secrète non configurée' });
    }

    const stripe = require('stripe')(secretKey);
    const balance = await stripe.balance.retrieve();
    res.json({ connected: true, mode, currency: balance.available?.[0]?.currency || 'eur' });
  } catch (err) {
    logger.error(`Stripe test connection failed: ${err.message}`);
    res.json({ connected: false, mode: 'test', error: err.message });
  }
});

// ─── Admin: PUT /api/v1/admin/settings ───────────────
router.put('/', authenticate, requireRole('super_admin'), auditAction('app_settings'), async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const allowedKeys = [
      'app_logo_url', 'app_name', 'app_primary_color',
      'stripe_mode', 'stripe_test_publishable_key', 'stripe_test_secret_key',
      'stripe_live_publishable_key', 'stripe_live_secret_key', 'stripe_webhook_secret',
      'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_name', 'smtp_from_email', 'smtp_mode',
      'pickup_enabled', 'pickup_address', 'pickup_details',
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedKeys.includes(key)) continue;
      // Don't overwrite secrets with the masked value
      if (SECRET_KEYS.includes(key) && value.startsWith('****')) continue;
      await db('app_settings')
        .where({ key })
        .update({ value: String(value), updated_at: new Date() });
    }

    await invalidateCache('vc:cache:*/settings*');

    // Invalidate cached Stripe instance when keys change
    const stripeKeys = Object.keys(updates).filter((k) => k.startsWith('stripe_'));
    if (stripeKeys.length > 0) {
      try {
        const { resetStripeCache } = require('../services/stripeService');
        resetStripeCache();
      } catch (e) { /* ignore if not yet available */ }
    }

    // Invalidate cached SMTP transporter when keys change
    const smtpKeys = Object.keys(updates).filter((k) => k.startsWith('smtp_'));
    if (smtpKeys.length > 0) {
      try {
        const { resetSmtpCache } = require('../services/emailService');
        resetSmtpCache();
      } catch (e) { /* ignore */ }
    }

    const settings = await db('app_settings').orderBy('key');
    const result = {};
    for (const s of settings) {
      result[s.key] = SECRET_KEYS.includes(s.key) ? maskSecret(s.value) : s.value;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Admin: POST /api/v1/admin/settings/email-test ────
router.post('/email-test', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const emailService = require('../services/emailService');
    const result = await emailService.sendWelcome({
      email: req.user.email,
      name: req.user.name || 'Admin',
      role: req.user.role || 'super_admin',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Admin: PUT /api/v1/admin/settings/logo — Upload logo global ──
router.put('/logo', authenticate, requireRole('super_admin'), (req, res, next) => {
  uploadLogo.single('logo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (max 2 Mo)' : err.message });
    }
    if (err) return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'NO_FILE', message: 'Aucun fichier envoyé' });
    const logo_url = `/uploads/logos/${req.file.filename}`;
    await db('app_settings')
      .where({ key: 'app_logo_url' })
      .update({ value: logo_url, updated_at: new Date() });
    await invalidateCache('vc:cache:*/settings*');
    res.json({ success: true, logo_url });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Admin: PUT /api/v1/admin/organizations/:id/logo — Upload logo organisation ──
router.put('/organizations/:id/logo', authenticate, requireRole('super_admin', 'commercial'), (req, res, next) => {
  uploadLogo.single('logo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (max 2 Mo)' : err.message });
    }
    if (err) return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'NO_FILE', message: 'Aucun fichier envoyé' });
    const logo_url = `/uploads/logos/${req.file.filename}`;
    const [updated] = await db('organizations')
      .where({ id: req.params.id })
      .update({ logo_url })
      .returning('*');
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ success: true, logo_url });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Admin: PUT /api/v1/admin/organizations/:id ──────
router.put('/organizations/:id', authenticate, requireRole('super_admin', 'commercial'), auditAction('organizations'), async (req, res) => {
  try {
    const { name, type, address, logo_url, organization_type_id } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (address !== undefined) updates.address = address;
    if (logo_url !== undefined) updates.logo_url = logo_url;
    if (organization_type_id !== undefined) updates.organization_type_id = organization_type_id;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'NO_FIELDS' });
    }

    // Coherence check: when changing org type, verify existing campaigns are compatible
    if (organization_type_id) {
      const campaigns = await db('campaigns')
        .where({ org_id: req.params.id })
        .whereNotNull('campaign_type_id')
        .select('campaigns.id', 'campaigns.name', 'campaigns.campaign_type_id');

      if (campaigns.length) {
        const allowed = await db('organization_type_campaign_types')
          .where({ organization_type_id })
          .select('campaign_type_id');
        const allowedSet = new Set(allowed.map((r) => r.campaign_type_id));

        const incompatible = campaigns.filter((c) => !allowedSet.has(c.campaign_type_id));
        if (incompatible.length) {
          return res.status(409).json({
            error: 'INCOMPATIBLE_CAMPAIGNS',
            message: `${incompatible.length} campagne(s) incompatible(s) avec ce type d'organisation`,
            campaigns: incompatible.map((c) => ({ id: c.id, name: c.name })),
          });
        }
      }
    }

    const [updated] = await db('organizations')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');

    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Public: GET /api/v1/settings/public ─────────────
publicRouter.get('/public', async (req, res) => {
  try {
    const settings = await db('app_settings')
      .whereIn('key', ['app_logo_url', 'app_name', 'app_primary_color', 'pickup_enabled', 'pickup_address', 'pickup_details']);
    const result = {};
    for (const s of settings) result[s.key] = s.value;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Public: GET /api/v1/settings/stripe-public-key ──
publicRouter.get('/stripe-public-key', async (req, res) => {
  try {
    const modeRow = await db('app_settings').where({ key: 'stripe_mode' }).first();
    const mode = modeRow?.value || 'test';
    const pubKeyName = mode === 'live' ? 'stripe_live_publishable_key' : 'stripe_test_publishable_key';
    const pubKeyRow = await db('app_settings').where({ key: pubKeyName }).first();
    res.json({ publishable_key: pubKeyRow?.value || '', mode });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
