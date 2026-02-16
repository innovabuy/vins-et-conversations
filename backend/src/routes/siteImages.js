const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { invalidateCache } = require('../middleware/cache');
const logger = require('../utils/logger');

const router = express.Router();
const publicRouter = express.Router();

// ─── Multer config ──────────────────────────────────
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/site'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `site_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.mp4'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Format non supporté. Utilisez JPG, PNG, WebP, SVG ou MP4.'));
  },
});

// ─── Admin: GET /api/v1/admin/site-images ────────────
router.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const images = await db('site_images')
      .leftJoin('users', 'site_images.updated_by', 'users.id')
      .select('site_images.*', 'users.name as updated_by_name')
      .orderBy(['site_images.page', 'site_images.id']);

    // Group by page
    const grouped = {};
    for (const img of images) {
      if (!grouped[img.page]) grouped[img.page] = [];
      grouped[img.page].push(img);
    }
    res.json({ data: grouped });
  } catch (err) {
    logger.error(`Site images list error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Admin: PUT /api/v1/admin/site-images/:id/upload ─
router.put(
  '/:id/upload',
  authenticate,
  requireRole('super_admin', 'commercial'),
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (max 5 Mo)' : err.message });
      }
      if (err) return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      const existing = await db('site_images').where({ id: req.params.id }).first();
      if (!existing) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!req.file) return res.status(400).json({ error: 'NO_FILE', message: 'Aucun fichier envoyé' });

      // Delete old file if it exists
      if (existing.image_url) {
        const oldPath = path.join(__dirname, '../../', existing.image_url);
        fs.unlink(oldPath, () => {});
      }

      const image_url = `/uploads/site/${req.file.filename}`;
      const [updated] = await db('site_images')
        .where({ id: req.params.id })
        .update({ image_url, updated_at: new Date(), updated_by: req.user.userId })
        .returning('*');

      await invalidateCache('vc:cache:*/site-images*');
      res.json(updated);
    } catch (err) {
      logger.error(`Site image upload error: ${err.message}`);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// ─── Admin: PUT /api/v1/admin/site-images/:id ────────
router.put('/:id', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const { alt_text, active } = req.body;
    const updates = { updated_at: new Date(), updated_by: req.user.userId };
    if (alt_text !== undefined) updates.alt_text = alt_text;
    if (active !== undefined) updates.active = active;

    const [updated] = await db('site_images')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });

    await invalidateCache('vc:cache:*/site-images*');
    res.json(updated);
  } catch (err) {
    logger.error(`Site image update error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Public: GET /api/v1/public/site-images ──────────
publicRouter.get('/', async (req, res) => {
  try {
    const images = await db('site_images')
      .where({ active: true })
      .whereNotNull('image_url')
      .select('slot', 'image_url', 'alt_text');
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(images);
  } catch (err) {
    logger.error(`Public site images error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Public: GET /api/v1/public/site-images/:slot ────
publicRouter.get('/:slot', async (req, res) => {
  try {
    const image = await db('site_images')
      .where({ slot: req.params.slot, active: true })
      .first();
    if (!image || !image.image_url) return res.status(404).json({ error: 'NOT_FOUND' });
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ slot: image.slot, image_url: image.image_url, alt_text: image.alt_text });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
