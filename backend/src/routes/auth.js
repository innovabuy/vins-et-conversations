const express = require('express');
const Joi = require('joi');
const authService = require('../auth/authService');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');

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
      req.body.code, req.body.name, req.body.email, req.body.password
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

module.exports = router;
