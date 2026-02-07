const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

// GET /api/v1/admin/delivery-routes — Liste tournées
router.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    let query = db('delivery_routes').orderBy('date', 'desc');

    if (req.query.status) query = query.where('status', req.query.status);
    if (req.query.zone) query = query.where('zone', 'ilike', `%${req.query.zone}%`);

    const data = await query;
    res.json({
      data: data.map((r) => ({
        ...r,
        stops: typeof r.stops === 'string' ? JSON.parse(r.stops) : r.stops,
        stops_count: (typeof r.stops === 'string' ? JSON.parse(r.stops) : r.stops).length,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/delivery-routes — Créer tournée
router.post('/', authenticate, requireRole('super_admin', 'commercial'), auditAction('delivery_routes'), async (req, res) => {
  try {
    const { date, zone, driver, stops, km } = req.body;
    if (!date) return res.status(400).json({ error: 'DATE_REQUIRED' });

    const [route] = await db('delivery_routes').insert({
      date,
      zone: zone || null,
      driver: driver || null,
      stops: JSON.stringify(stops || []),
      km: km || 0,
      status: 'draft',
    }).returning('*');

    res.status(201).json(route);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/delivery-routes/:id — Modifier tournée
router.put('/:id', authenticate, requireRole('super_admin', 'commercial'), auditAction('delivery_routes'), async (req, res) => {
  try {
    const { date, zone, driver, stops, km, status } = req.body;
    const valid = ['draft', 'planned', 'in_progress', 'completed'];
    if (status && !valid.includes(status)) return res.status(400).json({ error: 'INVALID_STATUS' });

    const update = { updated_at: new Date() };
    if (date) update.date = date;
    if (zone !== undefined) update.zone = zone;
    if (driver !== undefined) update.driver = driver;
    if (stops) update.stops = JSON.stringify(stops);
    if (km !== undefined) update.km = km;
    if (status) update.status = status;

    const [route] = await db('delivery_routes')
      .where({ id: req.params.id })
      .update(update)
      .returning('*');

    if (!route) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(route);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
