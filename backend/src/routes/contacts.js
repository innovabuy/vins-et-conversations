const express = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const { invalidateCache } = require('../middleware/cache');

const router = express.Router();

// Multer config for ambassador contact photos
const ambassadorStorage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/ambassadors'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, 'contact-' + req.params.id + ext);
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

// GET /api/v1/admin/contacts — Liste paginée
router.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    let query = db('contacts')
      .leftJoin('orders', 'contacts.id', 'orders.customer_id')
      .groupBy('contacts.id')
      .select(
        'contacts.*',
        db.raw('COUNT(orders.id) as orders_count'),
        db.raw('COALESCE(SUM(orders.total_ttc), 0) as total_ca'),
        db.raw('MAX(orders.created_at) as last_order_at')
      );

    if (req.query.type) query = query.where('contacts.type', req.query.type);
    if (req.query.source) query = query.where('contacts.source', 'ilike', `%${req.query.source}%`);

    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 50, 10);

    const countQuery = db('contacts');
    if (req.query.type) countQuery.where('type', req.query.type);
    if (req.query.source) countQuery.where('source', 'ilike', `%${req.query.source}%`);
    const total = await countQuery.count('id as count').first();

    const data = await query
      .orderBy('contacts.created_at', 'desc')
      .limit(limit)
      .offset((page - 1) * limit);

    res.json({
      data: data.map((c) => ({
        ...c,
        orders_count: parseInt(c.orders_count, 10),
        total_ca: parseFloat(c.total_ca),
      })),
      pagination: { page, limit, total: parseInt(total?.count || 0, 10) },
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/contacts/search?q=xxx
router.get('/search', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ data: [] });

    const data = await db('contacts')
      .where('name', 'ilike', `%${q}%`)
      .orWhere('email', 'ilike', `%${q}%`)
      .orWhere('phone', 'ilike', `%${q}%`)
      .limit(20)
      .orderBy('name');

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/contacts/:id/history — Commandes liées
router.get('/:id/history', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const orders = await db('orders')
      .where({ customer_id: req.params.id })
      .orderBy('created_at', 'desc')
      .select('id', 'ref', 'status', 'total_ttc', 'total_items', 'created_at');

    res.json({ data: orders });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/contacts — Créer contact
router.post('/', authenticate, requireRole('super_admin', 'commercial'), auditAction('contacts'), async (req, res) => {
  try {
    const { name, email, phone, address, source, source_user_id, type, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'NAME_REQUIRED' });

    const validTypes = ['particulier', 'cse', 'ambassadeur', 'professionnel'];
    const contactType = type || 'particulier';
    if (!validTypes.includes(contactType)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: `type invalide. Valeurs acceptées : ${validTypes.join(', ')}` });
    }

    const insertData = {
      name, email, phone, address, source, source_user_id,
      type: contactType,
      notes: notes ? JSON.stringify(notes) : '{}',
    };

    // Ambassador-specific fields
    if (type === 'ambassadeur') {
      if (req.body.show_on_public_page !== undefined) insertData.show_on_public_page = req.body.show_on_public_page;
      if (req.body.ambassador_bio !== undefined) insertData.ambassador_bio = req.body.ambassador_bio || null;
      if (req.body.region_id !== undefined) insertData.region_id = req.body.region_id || null;
    }

    const [contact] = await db('contacts').insert(insertData).returning('*');

    if (type === 'ambassadeur') await invalidateCache('vc:cache:*/ambassador/*');

    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/contacts/:id — Modifier contact
router.put('/:id', authenticate, requireRole('super_admin', 'commercial'), auditAction('contacts'), async (req, res) => {
  try {
    const validTypes = ['particulier', 'cse', 'ambassadeur', 'professionnel'];
    if (req.body.type && !validTypes.includes(req.body.type)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: `type invalide. Valeurs acceptées : ${validTypes.join(', ')}` });
    }

    // Only include fields explicitly provided in the body
    const updates = { updated_at: new Date() };
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.email !== undefined) updates.email = req.body.email;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (req.body.address !== undefined) updates.address = req.body.address;
    if (req.body.source !== undefined) updates.source = req.body.source;
    if (req.body.type !== undefined) updates.type = req.body.type;
    if (req.body.notes !== undefined) updates.notes = JSON.stringify(req.body.notes);

    // Ambassador-specific fields: only update if provided
    if (req.body.type === 'ambassadeur' || req.body.type === undefined) {
      // type is ambassador or not changing — allow ambassador field updates if provided
      if (req.body.show_on_public_page !== undefined) updates.show_on_public_page = req.body.show_on_public_page;
      if (req.body.ambassador_bio !== undefined) updates.ambassador_bio = req.body.ambassador_bio || null;
      if (req.body.region_id !== undefined) updates.region_id = req.body.region_id || null;
    }
    // Reset ambassador fields only when type is explicitly changed away from ambassadeur
    if (req.body.type !== undefined && req.body.type !== 'ambassadeur') {
      updates.show_on_public_page = false;
      updates.ambassador_photo_url = null;
      updates.ambassador_bio = null;
      updates.region_id = null;
    }

    const [contact] = await db('contacts')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');

    if (!contact) return res.status(404).json({ error: 'NOT_FOUND' });

    await invalidateCache('vc:cache:*/ambassador/*');
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/contacts/:id/ambassador-photo — Upload ambassador contact photo
router.put(
  '/:id/ambassador-photo',
  authenticate,
  requireRole('super_admin', 'commercial'),
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
      const contact = await db('contacts').where({ id }).first();
      if (!contact) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!req.file) return res.status(400).json({ error: 'NO_FILE', message: 'Aucun fichier envoyé' });

      const ambassador_photo_url = `/uploads/ambassadors/${req.file.filename}`;
      await db('contacts').where({ id }).update({ ambassador_photo_url, updated_at: new Date() });
      await invalidateCache('vc:cache:*/ambassador/*');
      res.json({ ambassador_photo_url });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
