const express = require('express');
const { exec } = require('child_process');
const { authenticate, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/database', authenticate, requireRole('super_admin'), async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `vc_backup_${timestamp}.sql`;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const proc = exec(`pg_dump "${dbUrl}"`);
  proc.stdout.pipe(res);
  proc.stderr.on('data', (d) => logger.error('pg_dump stderr:', d));
  proc.on('error', (e) => {
    logger.error('pg_dump error:', e);
    if (!res.headersSent) res.status(500).json({ error: 'Backup failed' });
  });
});

module.exports = router;
