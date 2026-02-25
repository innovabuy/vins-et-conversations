const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

/** Extract userId from JWT — handles both `userId` and `id` payload shapes */
function getUserId(req) {
  return req.user.userId || req.user.id;
}

// GET /api/v1/notifications — Notifications de l'utilisateur connecté
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      console.error('NotificationRoute GET /: userId missing from token', req.user);
      return res.json({ data: [], unread: 0 });
    }

    const data = await db('notifications')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(50);

    const unread = await db('notifications')
      .where({ user_id: userId, read: false })
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
    const userId = getUserId(req);
    if (!userId) {
      console.error('NotificationRoute PUT /:id/read: userId missing from token', req.user);
      return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'userId missing from token' });
    }

    const [notif] = await db('notifications')
      .where({ id: req.params.id, user_id: userId })
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
    const userId = getUserId(req);
    if (!userId) {
      console.error('NotificationRoute PUT /read-all: userId missing from token', req.user);
      return res.json({ message: 'OK' });
    }

    await db('notifications')
      .where({ user_id: userId, read: false })
      .update({ read: true });

    res.json({ message: 'Toutes les notifications marquées comme lues' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/notifications/settings — Paramétrage alertes admin
router.get('/settings', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const userId = getUserId(req);
    const user = await db('users').where({ id: userId }).first();
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
    const userId = getUserId(req);
    const user = await db('users').where({ id: userId }).first();
    const perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : (user.permissions || {});
    perms.notification_settings = req.body.settings;

    await db('users')
      .where({ id: userId })
      .update({ permissions: JSON.stringify(perms), updated_at: new Date() });

    res.json({ settings: perms.notification_settings });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
