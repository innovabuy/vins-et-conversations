const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/v1/formation/modules — List all formation modules with user progress
router.get(
  '/modules',
  authenticate,
  requireRole('etudiant', 'super_admin'),
  async (req, res) => {
    try {
      const modules = await db('formation_modules')
        .where({ active: true })
        .orderBy('sort_order');

      // Get user progress
      const progress = await db('formation_progress')
        .where({ user_id: req.user.userId });

      const progressMap = {};
      progress.forEach((p) => { progressMap[p.module_id] = p; });

      const result = modules.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        type: m.type,
        url: m.url,
        duration_minutes: m.duration_minutes,
        status: progressMap[m.id]?.status || 'not_started',
        score: progressMap[m.id]?.score || 0,
        completed_at: progressMap[m.id]?.completed_at || null,
      }));

      const completed = result.filter((m) => m.status === 'completed').length;
      const total = result.length;

      res.json({
        modules: result,
        progress: { completed, total, pct: total > 0 ? Math.round((completed / total) * 100) : 0 },
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// PUT /api/v1/formation/modules/:id/progress — Update progress for a module
router.put(
  '/modules/:id/progress',
  authenticate,
  requireRole('etudiant', 'super_admin'),
  async (req, res) => {
    try {
      const { status, score } = req.body;
      const moduleId = req.params.id;

      // Validate module exists
      const mod = await db('formation_modules').where({ id: moduleId, active: true }).first();
      if (!mod) return res.status(404).json({ error: 'MODULE_NOT_FOUND' });

      const validStatuses = ['not_started', 'in_progress', 'completed'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid status' });
      }

      const existing = await db('formation_progress')
        .where({ user_id: req.user.userId, module_id: moduleId })
        .first();

      const data = {
        status: status || 'in_progress',
        score: score || 0,
        completed_at: status === 'completed' ? new Date() : null,
        updated_at: new Date(),
      };

      if (existing) {
        await db('formation_progress').where({ id: existing.id }).update(data);
      } else {
        await db('formation_progress').insert({
          user_id: req.user.userId,
          module_id: moduleId,
          ...data,
        });
      }

      res.json({ updated: true, module_id: moduleId, ...data });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
