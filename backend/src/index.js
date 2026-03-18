require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');
const logger = require('./utils/logger');

const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Webhook route (BEFORE express.json for raw body) ─
app.use('/api/v1/webhooks', require('./routes/webhooks'));

// ─── Middleware: mesure temps de réponse (CDC §9.2) ───
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 500) {
      logger.warn(`Slow request: ${req.method} ${req.path} — ${duration}ms`);
    }
  });
  next();
});

// ─── Middlewares globaux ──────────────────────────────
app.use(helmet());
app.use(compression());
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  process.env.SITE_PUBLIC_URL || 'http://localhost:8080',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // In dev mode, accept all origins (access via IP, etc.)
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    cb(new Error('CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Rate limiting
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID && !process.env.LOAD_TEST) {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Trop de requêtes' },
  });
  app.use('/api/', limiter);

  // Rate limit plus strict pour l'auth
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'RATE_LIMITED', message: 'Trop de tentatives de connexion' },
  });
  app.use('/api/v1/auth/', authLimiter);

  // Rate limit API publique (100 req/min)
  const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Limite de requêtes API publique atteinte (100/min)' },
  });
  app.use('/api/v1/public/', publicLimiter);
}

// ─── Swagger documentation ───────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Vins & Conversations API',
}));

// ─── Static files (uploaded images) ───────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── Routes ───────────────────────────────────────────
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/products', require('./routes/products'));
app.use('/api/v1/admin/products', require('./routes/products').adminRouter);
app.use('/api/v1/campaigns', require('./routes/products').campaignProductsRouter);
app.use('/api/v1/orders', require('./routes/orders'));
app.use('/api/v1/dashboard', require('./routes/dashboard'));
app.use('/api/v1/admin/campaigns', require('./routes/campaigns'));
app.use('/api/v1/admin/stock', require('./routes/stock'));
app.use('/api/v1/admin/delivery-notes', require('./routes/signatureBL'));
app.use('/api/v1/admin/delivery-notes', require('./routes/groupedBL'));
app.use('/api/v1/admin/delivery-notes', require('./routes/deliveryNotes'));
app.use('/api/v1/admin/contacts', require('./routes/contacts'));
app.use('/api/v1/admin/suppliers', require('./routes/suppliers'));
app.use('/api/v1/admin/payments', require('./routes/payments'));
app.use('/api/v1/admin/delivery-routes', require('./routes/deliveryRoutes'));
app.use('/api/v1/admin/pricing-conditions', require('./routes/pricingConditions'));
app.use('/api/v1/admin/exports', require('./routes/exports'));
app.use('/api/v1/admin/margins', require('./routes/margins'));
app.use('/api/v1/admin/analytics', require('./routes/analytics'));
app.use('/api/v1/admin/audit-log', require('./routes/auditLog'));
app.use('/api/v1/admin/financial-events', require('./routes/financialEvents'));
app.use('/api/v1/payments', require('./routes/paymentIntents'));
app.use('/api/v1/notifications', require('./routes/notifications'));
app.use('/api/v1/ambassador', require('./routes/ambassador'));
app.use('/api/v1/referral', require('./routes/referral'));
app.use('/api/v1/formation', require('./routes/formation'));
app.use('/api/v1/admin/users', require('./routes/users'));
app.use('/api/v1/admin/invitations', require('./routes/invitations'));
app.use('/api/v1/public', require('./routes/signatureBL').publicRouter);
app.use('/api/v1/public', require('./routes/publicCatalog'));
app.use('/api/v1/public', require('./routes/boutiqueAPI'));
app.use('/api/v1/admin/catalog', require('./routes/catalogPdf'));
app.use('/api/v1/categories', require('./routes/categories'));
app.use('/api/v1/admin/categories', require('./routes/categories').adminRouter);
app.use('/api/v1/admin/settings', require('./routes/appSettings'));
app.use('/api/v1/settings', require('./routes/appSettings').publicRouter);
app.use('/api/v1/shipping', require('./routes/shipping').router);
app.use('/api/v1/admin', require('./routes/shipping').adminRouter);
app.use('/api/v1/campaigns', require('./routes/campaignResources'));
app.use('/api/v1/admin/campaign-resources', require('./routes/campaignResources').adminRouter);
app.use('/api/v1/admin/organization-types', require('./routes/organizationTypes'));
app.use('/api/v1/admin/campaign-types', require('./routes/campaignTypes'));
app.use('/api/v1/admin/client-types', require('./routes/clientTypes'));
app.use('/api/v1/admin/site-images', require('./routes/siteImages'));
app.use('/api/v1/public/site-images', require('./routes/siteImages').publicRouter);
app.use('/api/v1/admin/free-bottles', require('./routes/freeBottles'));
app.use('/api/v1/paypal', require('./routes/paypal'));
app.use('/api/v1/admin/promo-codes', require('./routes/promoCodes'));
app.use('/api/v1/promo-codes', require('./routes/promoCodes').publicRouter);

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
    logger.info(`Vins & Conversations API running on port ${PORT}`);
    logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`   Swagger docs: http://localhost:${PORT}/api/docs`);
  });
}

module.exports = app;
