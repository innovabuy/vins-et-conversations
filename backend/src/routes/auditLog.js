const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/v1/admin/audit-log — Liste audit trail avec pagination et filtres
router.get('/', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const { entity, action, user_id, start, end, page = 1, limit = 50 } = req.query;

    const applyFilters = (q) => {
      if (entity) q = q.where('audit_log.entity', entity);
      if (action) q = q.where('audit_log.action', 'ilike', `%${action}%`);
      if (user_id) q = q.where('audit_log.user_id', user_id);
      if (start) q = q.where('audit_log.created_at', '>=', start);
      if (end) q = q.where('audit_log.created_at', '<=', end);
      return q;
    };

    const total = await applyFilters(db('audit_log')).count('id as count').first();
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const entries = await applyFilters(
      db('audit_log')
        .leftJoin('users', 'audit_log.user_id', 'users.id')
        .select(
          'audit_log.*',
          'users.name as user_name',
          'users.email as user_email'
        )
    )
      .orderBy('audit_log.created_at', 'desc')
      .offset(offset)
      .limit(parseInt(limit, 10));

    // Parse JSONB fields
    const data = entries.map((e) => ({
      ...e,
      before: typeof e.before === 'string' ? JSON.parse(e.before) : e.before,
      after: typeof e.after === 'string' ? JSON.parse(e.after) : e.after,
    }));

    res.json({
      data,
      pagination: {
        total: parseInt(total.count, 10),
        page: parseInt(page, 10),
        pages: Math.ceil(parseInt(total.count, 10) / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/audit-log/entities — List distinct entities
router.get('/entities', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const entities = await db('audit_log').distinct('entity').orderBy('entity');
    res.json({ data: entities.map((e) => e.entity) });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
