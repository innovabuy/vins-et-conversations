const express = require('express');
const path = require('path');
const multer = require('multer');
const Joi = require('joi');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const authService = require('../auth/authService');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

const BASE_URL = process.env.BASE_URL || process.env.FRONTEND_URL || '';

// Multer for ambassador self-upload
const ambassadorStorage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/ambassadors'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, req.user.userId + ext);
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

const router = express.Router();

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const registerSchema = Joi.object({
  code: Joi.string().required(),
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  parental_consent: Joi.boolean().optional(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

// POST /api/v1/auth/login
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    if (err.message === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect' });
    }
    if (err.message === 'ACCOUNT_DISABLED') {
      return res.status(403).json({ error: 'ACCOUNT_DISABLED', message: 'Compte désactivé' });
    }
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/v1/auth/register
router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const result = await authService.register(
      req.body.code, req.body.name, req.body.email, req.body.password, req.body.parental_consent
    );
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(201).json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    if (err.message === 'INVALID_INVITATION') {
      return res.status(400).json({ error: 'INVALID_INVITATION', message: 'Code d\'invitation invalide ou expiré' });
    }
    if (err.message === 'EMAIL_EXISTS') {
      return res.status(409).json({ error: 'EMAIL_EXISTS', message: 'Cet email est déjà utilisé' });
    }
    if (err.message === 'PARENTAL_CONSENT_REQUIRED') {
      return res.status(400).json({ error: 'PARENTAL_CONSENT_REQUIRED', message: 'Le consentement parental est obligatoire pour les étudiants mineurs' });
    }
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const token = req.body.refreshToken || req.cookies.refreshToken;
    if (!token) return res.status(401).json({ error: 'REFRESH_REQUIRED' });

    const result = await authService.refresh(token);
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ accessToken: result.accessToken });
  } catch (err) {
    res.status(401).json({ error: 'INVALID_REFRESH_TOKEN' });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  await authService.logout(req.user.userId);
  res.clearCookie('refreshToken');
  res.json({ message: 'Déconnexion réussie' });
});

// POST /api/v1/auth/register-customer
const customerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  phone: Joi.string().allow('', null).optional(),
  age_verified: Joi.boolean().valid(true).required().messages({
    'any.only': 'La vérification de l\'âge est obligatoire',
  }),
  cgv_accepted: Joi.boolean().valid(true).required().messages({
    'any.only': 'L\'acceptation des CGV est obligatoire',
  }),
});

router.post('/register-customer', validate(customerSchema), async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Check email uniqueness
    const existing = await db('users').where({ email: email.toLowerCase().trim() }).first();
    if (existing) {
      return res.status(409).json({ error: 'EMAIL_EXISTS', message: 'Cet email est déjà utilisé' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID ? crypto.randomUUID() : require('uuid').v4();

    await db('users').insert({
      id: userId,
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      name,
      role: 'customer',
      status: 'active',
    });

    // Upsert contact for this customer
    try {
      const boutiqueOrderService = require('../services/boutiqueOrderService');
      await boutiqueOrderService.upsertContact({
        name,
        email: email.toLowerCase().trim(),
        phone: phone || null,
      });
    } catch (e) {
      logger.warn(`Customer contact upsert failed: ${e.message}`);
    }

    // Auto-login
    const result = await authService.login(email.toLowerCase().trim(), password);
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(201).json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    logger.error(`Customer registration error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/v1/auth/forgot-password
const forgotSchema = Joi.object({
  email: Joi.string().email().required(),
});

router.post('/forgot-password', validate(forgotSchema), async (req, res) => {
  try {
    const { email } = req.body;
    const user = await db('users').where({ email: email.toLowerCase().trim() }).first();

    // Always return success (don't leak whether email exists)
    if (!user) {
      return res.json({ message: 'Si cette adresse existe, un email a été envoyé.' });
    }

    // Generate secure token
    const token = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate previous tokens
    await db('password_reset_tokens').where({ user_id: user.id, used: false }).update({ used: true });

    await db('password_reset_tokens').insert({
      user_id: user.id,
      token,
      expires_at: expiresAt,
    });

    const resetUrl = `${BASE_URL}/login?reset=1&token=${token}`;
    emailService.sendPasswordReset({
      email: user.email,
      name: user.name,
      resetUrl,
    }).catch((e) => logger.error(`Password reset email failed: ${e.message}`));

    res.json({ message: 'Si cette adresse existe, un email a été envoyé.' });
  } catch (err) {
    logger.error(`Forgot password error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/v1/auth/reset-password
const resetSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(8).required(),
});

router.post('/reset-password', validate(resetSchema), async (req, res) => {
  try {
    const { token, password } = req.body;

    const resetToken = await db('password_reset_tokens')
      .where({ token, used: false })
      .where('expires_at', '>', new Date())
      .first();

    if (!resetToken) {
      return res.status(400).json({ error: 'INVALID_TOKEN', message: 'Lien expiré ou invalide' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.transaction(async (trx) => {
      await trx('users').where({ id: resetToken.user_id }).update({
        password_hash: passwordHash,
        updated_at: new Date(),
      });
      await trx('password_reset_tokens').where({ id: resetToken.id }).update({ used: true });
      // Revoke all refresh tokens for security
      await trx('refresh_tokens').where({ user_id: resetToken.user_id }).update({ revoked: true });
    });

    logger.info(`Password reset successful for user ${resetToken.user_id}`);
    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (err) {
    logger.error(`Reset password error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// PUT /auth/profile/photo — upload ambassador own photo
router.put(
  '/profile/photo',
  authenticate,
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
      const user = await db('users').where({ id: req.user.userId }).first();
      if (!user || user.role !== 'ambassadeur') return res.status(403).json({ error: 'FORBIDDEN' });
      if (!req.file) return res.status(400).json({ error: 'NO_FILE', message: 'Aucun fichier envoyé' });

      const ambassador_photo_url = `/uploads/ambassadors/${req.file.filename}`;
      await db('users').where({ id: req.user.userId }).update({ ambassador_photo_url, updated_at: new Date() });
      res.json({ ambassador_photo_url });
    } catch (err) {
      logger.error(`Photo upload error: ${err.message}`);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
);

// PUT /auth/profile — update own name/phone
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, phone, ambassador_photo_url, ambassador_bio, region_id } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone.trim() || null;
    // Ambassador-specific fields (only for ambassadeur role)
    const currentUser = await db('users').where({ id: req.user.userId }).first();
    if (currentUser.role === 'ambassadeur') {
      if (ambassador_photo_url !== undefined) updates.ambassador_photo_url = ambassador_photo_url || null;
      if (ambassador_bio !== undefined) updates.ambassador_bio = ambassador_bio || null;
      if (region_id !== undefined) updates.region_id = region_id || null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'NO_FIELDS' });
    }
    await db('users').where({ id: req.user.userId }).update(updates);
    const user = await db('users').where({ id: req.user.userId }).first();
    res.json({
      id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role,
      ambassador_photo_url: user.ambassador_photo_url, ambassador_bio: user.ambassador_bio, region_id: user.region_id,
    });
  } catch (err) {
    logger.error(`Profile update error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

module.exports = router;
