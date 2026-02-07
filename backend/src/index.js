require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middlewares globaux ──────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Trop de requêtes' },
});
app.use('/api/', limiter);

// Rate limit plus strict pour l'auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'RATE_LIMITED', message: 'Trop de tentatives de connexion' },
});
app.use('/api/v1/auth/', authLimiter);

// ─── Routes ───────────────────────────────────────────
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/products', require('./routes/products'));
app.use('/api/v1/orders', require('./routes/orders'));
app.use('/api/v1/dashboard', require('./routes/dashboard'));
app.use('/api/v1/admin/campaigns', require('./routes/campaigns'));
app.use('/api/v1/admin/stock', require('./routes/stock'));
app.use('/api/v1/admin/delivery-notes', require('./routes/deliveryNotes'));
app.use('/api/v1/admin/contacts', require('./routes/contacts'));
app.use('/api/v1/admin/suppliers', require('./routes/suppliers'));
app.use('/api/v1/admin/payments', require('./routes/payments'));
app.use('/api/v1/admin/delivery-routes', require('./routes/deliveryRoutes'));
app.use('/api/v1/notifications', require('./routes/notifications'));

// ─── Health check ─────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const db = require('./config/database');
    await db.raw('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// ─── 404 & Error handler ─────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.path} non trouvée` });
});

app.use((err, req, res, _next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'SERVER_ERROR', message: process.env.NODE_ENV === 'development' ? err.message : 'Erreur interne' });
});

// ─── Start ────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`🍷 Vins & Conversations API running on port ${PORT}`);
    logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
