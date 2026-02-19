const express = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const Joi = require('joi');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const { validate } = require('../middleware/validate');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { invalidateCache } = require('../middleware/cache');

const router = express.Router();

// Multer config for ambassador photos
const ambassadorStorage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/ambassadors'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, req.params.id + ext);
  },
});
const ambassadorUpload = multer({
  storage: ambassadorStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Format non supporté. Utilisez JPG, PNG ou WebP.'));
  },
});

// GET /api/v1/admin/users — List all users
router.get(
  '/',
  authenticate,
  requireRole('super_admin'),
  async (req, res) => {
    try {
      const { role, status, search, page = 1, limit = 50 } = req.query;

      const applyFilters = (q) => {
        if (role) q = q.where({ role });
        if (status) q = q.where({ status });
        if (search) {
          q = q.where(function () {
            this.where('name', 'ilike', `%${search}%`)
              .orWhere('email', 'ilike', `%${search}%`);
          });
        }
        return q;
      };

      const total = await applyFilters(db('users')).count('id as count').first();
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      const users = await applyFilters(db('users'))
        .select('id', 'email', 'name', 'role', 'status', 'permissions', 'last_login_at', 'created_at',
          'ambassador_photo_url', 'ambassador_bio', 'region_id', 'show_on_public_page')
        .orderBy('created_at', 'desc')
        .offset(offset)
        .limit(parseInt(limit, 10));

      res.json({
        data: users,
        pagination: {
          total: parseInt(total.count, 10),
          page: parseInt(page, 10),
          pages: Math.ceil(parseInt(total.count, 10) / parseInt(limit, 10)),
        },
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// POST /api/v1/admin/users — Create user
const createSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().min(2).required(),
  role: Joi.string().valid('super_admin', 'commercial', 'comptable', 'enseignant', 'etudiant', 'cse', 'ambassadeur', 'lecture_seule').required(),
  password: Joi.string().min(8).required(),
  status: Joi.string().valid('active', 'disabled', 'pending').default('active'),
  permissions: Joi.object().default({}),
});

router.post(
  '/',
  authenticate,
  requireRole('super_admin'),
  validate(createSchema),
  auditAction('users'),
  async (req, res) => {
    try {
      const { email, name, role, password, status, permissions } = req.body;

      // Check duplicate
      const existing = await db('users').where({ email }).first();
      if (existing) return res.status(409).json({ error: 'EMAIL_EXISTS', message: 'Email already used' });

      const hash = await bcrypt.hash(password, 12);
      const [user] = await db('users').insert({
        email,
        name,
        role,
        password_hash: hash,
        status: status || 'active',
        permissions: JSON.stringify(permissions || {}),
      }).returning(['id', 'email', 'name', 'role', 'status', 'created_at']);

      req.auditEntityId = user.id;
      req.auditAfter = { email, name, role, status };

      // Send welcome email (fire and forget)
      emailService.sendWelcome({ email, name, role })
        .catch((e) => logger.error(`Welcome email failed: ${e.message}`));

      res.status(201).json(user);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// PUT /api/v1/admin/users/:id — Update user
const updateSchema = Joi.object({
  name: Joi.string().min(2),
  role: Joi.string().valid('super_admin', 'commercial', 'comptable', 'enseignant', 'etudiant', 'cse', 'ambassadeur', 'lecture_seule'),
  status: Joi.string().valid('active', 'disabled', 'pending'),
  permissions: Joi.object(),
  ambassador_photo_url: Joi.string().max(500).allow('', null),
  ambassador_bio: Joi.string().max(1000).allow('', null),
  region_id: Joi.number().integer().allow(null),
  show_on_public_page: Joi.boolean(),
}).min(1);

router.put(
  '/:id',
  authenticate,
  requireRole('super_admin'),
  validate(updateSchema),
  auditAction('users'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const user = await db('users').where({ id }).first();
      if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

      const updates = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.role !== undefined) updates.role = req.body.role;
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.permissions !== undefined) updates.permissions = JSON.stringify(req.body.permissions);
      // Ambassador-specific fields
      if (req.body.ambassador_photo_url !== undefined) updates.ambassador_photo_url = req.body.ambassador_photo_url || null;
      if (req.body.ambassador_bio !== undefined) updates.ambassador_bio = req.body.ambassador_bio || null;
      if (req.body.region_id !== undefined) updates.region_id = req.body.region_id || null;
      if (req.body.show_on_public_page !== undefined) updates.show_on_public_page = req.body.show_on_public_page;
      updates.updated_at = new Date();

      const [updated] = await db('users').where({ id }).update(updates)
        .returning(['id', 'email', 'name', 'role', 'status', 'permissions', 'updated_at',
          'ambassador_photo_url', 'ambassador_bio', 'region_id', 'show_on_public_page']);

      // Invalidate ambassador cache if relevant fields changed
      if (updates.role || updates.show_on_public_page !== undefined || updates.ambassador_photo_url !== undefined
          || updates.ambassador_bio !== undefined || updates.region_id !== undefined) {
        await invalidateCache('vc:cache:*/ambassador/*');
      }

      req.auditEntityId = id;
      req.auditAfter = updates;
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// POST /api/v1/admin/users/:id/toggle-status — Toggle active/disabled
router.post(
  '/:id/toggle-status',
  authenticate,
  requireRole('super_admin'),
  auditAction('users'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const user = await db('users').where({ id }).first();
      if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

      const newStatus = user.status === 'active' ? 'disabled' : 'active';
      const [updated] = await db('users').where({ id }).update({ status: newStatus, updated_at: new Date() })
        .returning(['id', 'email', 'name', 'role', 'status']);

      req.auditEntityId = id;
      req.auditAfter = { status: newStatus };
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// POST /api/v1/admin/users/import-csv — CSV import of users
router.post(
  '/import-csv',
  authenticate,
  requireRole('super_admin'),
  async (req, res) => {
    try {
      const { users: csvUsers, campaign_id, default_role } = req.body;
      if (!Array.isArray(csvUsers) || !csvUsers.length) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'users array required' });
      }

      const defaultPassword = 'VinsConv2026!';
      const hash = await bcrypt.hash(defaultPassword, 12);
      const results = { created: 0, skipped: 0, errors: [] };

      for (const u of csvUsers) {
        try {
          if (!u.email || !u.name) {
            results.errors.push({ email: u.email, reason: 'Missing email or name' });
            results.skipped++;
            continue;
          }

          const existing = await db('users').where({ email: u.email }).first();
          if (existing) {
            results.skipped++;
            continue;
          }

          const [newUser] = await db('users').insert({
            email: u.email,
            name: u.name,
            role: u.role || default_role || 'etudiant',
            password_hash: hash,
            status: 'active',
          }).returning('id');

          // Auto-add to campaign if specified
          if (campaign_id) {
            await db('participations').insert({
              user_id: newUser.id,
              campaign_id,
              role_in_campaign: 'student',
              class_group: u.class_group || null,
            }).onConflict(['user_id', 'campaign_id']).ignore();
          }

          results.created++;
        } catch (e) {
          results.errors.push({ email: u.email, reason: e.message });
          results.skipped++;
        }
      }

      res.status(201).json(results);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// PUT /api/v1/admin/users/:id/ambassador-photo — Upload ambassador photo
router.put(
  '/:id/ambassador-photo',
  authenticate,
  (req, res, next) => {
    // Accessible by admin OR the ambassador themselves
    if (req.user.roles?.includes('super_admin') || req.user.role === 'super_admin') return next();
    if (req.user.userId === req.params.id) return next();
    return res.status(403).json({ error: 'FORBIDDEN' });
  },
  (req, res, next) => {
    ambassadorUpload.single('photo')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (max 5 Mo)' : err.message });
      }
      if (err) return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      const { id } = req.params;
      const user = await db('users').where({ id }).first();
      if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
      if (!req.file) return res.status(400).json({ error: 'NO_FILE', message: 'Aucun fichier envoyé' });

      const ambassador_photo_url = `/uploads/ambassadors/${req.file.filename}`;
      await db('users').where({ id }).update({ ambassador_photo_url, updated_at: new Date() });
      await invalidateCache('vc:cache:*/ambassador/*');
      res.json({ ambassador_photo_url });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// POST /api/v1/admin/users/:id/anonymize — RGPD Droit à l'oubli (CDC §5.4)
const anonymizeSchema = Joi.object({
  reason: Joi.string().min(5).required(),
});

router.post(
  '/:id/anonymize',
  authenticate,
  requireRole('super_admin'),
  validate(anonymizeSchema),
  auditAction('users'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const user = await db('users').where({ id }).first();
      if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
      if (user.email.includes('@anonymized.local')) {
        return res.status(400).json({ error: 'ALREADY_ANONYMIZED', message: 'Utilisateur déjà anonymisé' });
      }

      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(user.email + Date.now()).digest('hex').substring(0, 12);
      const anonymizedName = 'Utilisateur supprimé';
      const anonymizedEmail = `deleted_${hash}@anonymized.local`;

      await db('users').where({ id }).update({
        name: anonymizedName,
        email: anonymizedEmail,
        avatar: null,
        password_hash: 'ANONYMIZED',
        status: 'disabled',
        permissions: JSON.stringify({}),
        updated_at: new Date(),
      });

      // Anonymize contacts linked to this user
      await db('contacts').where({ source_user_id: id }).update({
        source_user_id: null,
        source: `deleted_${hash}`,
      });

      // Revoke all tokens
      await db('refresh_tokens').where({ user_id: id }).update({ revoked: true });

      // Audit log — financial data (orders, payments, financial_events) preserved per legal obligation (10 years)
      await db('audit_log').insert({
        user_id: req.user.userId,
        action: 'user_anonymized',
        entity: 'users',
        entity_id: id,
        reason: req.body.reason,
        before: JSON.stringify({ name: user.name, email: user.email }),
        after: JSON.stringify({ name: anonymizedName, email: anonymizedEmail }),
        ip_address: req.ip,
      });

      req.auditEntityId = id;
      req.auditAfter = { anonymized: true };

      res.json({ message: 'Utilisateur anonymisé', anonymized: true, name: anonymizedName, email: anonymizedEmail });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
