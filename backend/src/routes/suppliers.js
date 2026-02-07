const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/v1/admin/suppliers — Liste fournisseurs (contacts type=fournisseur + produits associés)
// We use a separate approach: contacts with type extensions + product links via metadata
router.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    // Get suppliers from contacts with type info, or use a virtual approach
    // Since schema doesn't have a suppliers table, we store suppliers as contacts with type metadata
    const suppliers = await db('contacts')
      .where('type', 'professionnel')
      .orderBy('name');

    // Get stock alerts for restock suggestions
    const stockAlerts = await db.raw(`
      SELECT p.id, p.name,
        COALESCE(SUM(CASE WHEN sm.type IN ('initial','entry','return') THEN sm.qty ELSE -sm.qty END), 0) as current_stock
      FROM products p
      LEFT JOIN stock_movements sm ON p.id = sm.product_id
      WHERE p.active = true
      GROUP BY p.id, p.name
      HAVING COALESCE(SUM(CASE WHEN sm.type IN ('initial','entry','return') THEN sm.qty ELSE -sm.qty END), 0) < ?
    `, [parseInt(req.query.threshold || 20, 10)]);

    const enriched = suppliers.map((s) => {
      const supplierNotes = typeof s.notes === 'string' ? JSON.parse(s.notes) : (s.notes || {});
      return {
        ...s,
        products: supplierNotes.products || [],
        last_order_date: supplierNotes.last_order_date || null,
      };
    });

    res.json({
      data: enriched,
      restock_alerts: stockAlerts.rows.map((r) => ({
        ...r,
        current_stock: parseInt(r.current_stock, 10),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
