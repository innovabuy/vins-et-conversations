const express = require('express');
const router = express.Router();
const adminRouter = express.Router();
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { invalidateCache } = require('../middleware/cache');

// ─── Public: GET /api/v1/site-pages/:slug ────────────────
router.get('/:slug', async (req, res) => {
  try {
    const page = await db('site_pages')
      .where({ slug: req.params.slug, is_active: true })
      .first();

    if (!page) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Page non trouvée' });
    }

    res.json(page);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Admin: auth + role guard ────────────────────────────
adminRouter.use(authenticate, requireRole('super_admin', 'commercial'));

// GET /api/v1/admin/site-pages — liste toutes les pages
adminRouter.get('/', async (req, res) => {
  try {
    const pages = await db('site_pages').orderBy('slug');
    res.json(pages);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/site-pages/:slug — créer ou mettre à jour
adminRouter.put('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, content_json } = req.body;

    const existing = await db('site_pages').where({ slug }).first();

    if (existing) {
      await db('site_pages').where({ slug }).update({
        title: title ?? existing.title,
        content_json: content_json !== undefined ? JSON.stringify(content_json) : existing.content_json,
        updated_at: db.fn.now(),
        updated_by: req.user.userId,
      });
      await invalidateCache(`vc:cache:*site-pages*`);
      const updated = await db('site_pages').where({ slug }).first();
      return res.json(updated);
    }

    // Create new page
    const [created] = await db('site_pages').insert({
      slug,
      title: title || slug,
      content_json: content_json ? JSON.stringify(content_json) : null,
      updated_by: req.user.userId,
    }).returning('*');

    await invalidateCache(`vc:cache:*site-pages*`);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/site-pages/:slug/toggle — activer/désactiver
adminRouter.post('/:slug/toggle', async (req, res) => {
  try {
    const { slug } = req.params;
    const page = await db('site_pages').where({ slug }).first();

    if (!page) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Page non trouvée' });
    }

    await db('site_pages').where({ slug }).update({
      is_active: !page.is_active,
      updated_at: db.fn.now(),
      updated_by: req.user.userId,
    });

    await invalidateCache(`vc:cache:*site-pages*`);
    const updated = await db('site_pages').where({ slug }).first();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
module.exports.adminRouter = adminRouter;
