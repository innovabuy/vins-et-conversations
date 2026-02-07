const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/v1/notifications — Notifications de l'utilisateur connecté
router.get('/', authenticate, async (req, res) => {
  try {
    const data = await db('notifications')
      .where({ user_id: req.user.userId })
      .orderBy('created_at', 'desc')
      .limit(50);

    const unread = await db('notifications')
      .where({ user_id: req.user.userId, read: false })
      .count('id as count')
      .first();

    res.json({ data, unread: parseInt(unread?.count || 0, 10) });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/notifications/:id/read — Marquer comme lu
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const [notif] = await db('notifications')
      .where({ id: req.params.id, user_id: req.user.userId })
      .update({ read: true })
      .returning('*');

    if (!notif) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(notif);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/notifications/read-all — Marquer tout comme lu
router.put('/read-all', authenticate, async (req, res) => {
  try {
    await db('notifications')
      .where({ user_id: req.user.userId, read: false })
      .update({ read: true });

    res.json({ message: 'Toutes les notifications marquées comme lues' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/notifications/settings — Paramétrage alertes admin
router.get('/settings', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const user = await db('users').where({ id: req.user.userId }).first();
    const perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || {});
    const settings = perms.notification_settings || {
      order: true,
      payment: true,
      ranking: false,
      stock: true,
      unpaid: true,
      delivery: true,
      milestone: true,
    };
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/notifications/settings — Modifier les toggles
router.put('/settings', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const user = await db('users').where({ id: req.user.userId }).first();
    const perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || {});
    perms.notification_settings = req.body.settings;

    await db('users')
      .where({ id: req.user.userId })
      .update({ permissions: JSON.stringify(perms), updated_at: new Date() });

    res.json({ settings: perms.notification_settings });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
