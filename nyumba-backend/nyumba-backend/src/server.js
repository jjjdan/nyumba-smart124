require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');
const fs      = require('fs');

const routes            = require('./routes/index');
const { errorHandler }  = require('./middleware/errorHandler');
const { testConnection } = require('./config/database');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Security & CORS ───────────────────────────────────────────────────────

// helmet's default CSP blocks cross-origin assets/fetches, which breaks a
// served SPA that fetches its own API. Disable CSP here (the API is the
// thing that needs hardening, not a static asset host) — re-enable with a
// tuned policy if you need stricter headers in production.
app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  ...(process.env.NGROK_FRONTEND_URL ? [process.env.NGROK_FRONTEND_URL] : []),
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Trust proxy for accurate IP logging (needed behind Nginx/Railway/Render)
app.set('trust proxy', 1);

// ─── Body parsing ──────────────────────────────────────────────────────────

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── HTTP logging ──────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── API routes ────────────────────────────────────────────────────────────

app.use('/api', routes);

// ─── Serve the built frontend (Path B: one process, one port) ─────────────
//
// Looks for ../../nyumba-smart/dist next to this backend folder (i.e. the
// frontend repo cloned/extracted as a sibling directory: nyumba-smart and
// nyumba-backend side by side). Build it first with `npm run build` in the
// frontend folder. If that folder isn't present (e.g. pure API-only
// deployment, or you haven't built the frontend yet), the server falls
// back to the JSON health-check root route instead of crashing.

const FRONTEND_DIST = path.resolve(__dirname, '../../nyumba-smart/dist');
const frontendBuilt = fs.existsSync(path.join(FRONTEND_DIST, 'index.html'));

if (frontendBuilt) {
  app.use(express.static(FRONTEND_DIST));

  // SPA fallback: any non-API GET request returns index.html so React
  // Router-style client-side routes resolve correctly on refresh/direct
  // visit. This must come AFTER /api routes and static file serving so it
  // only catches what neither of those handled. Express 5 requires a named
  // wildcard parameter (*splat) instead of Express 4's bare '*'.
  app.get('/*splat', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
} else {
  // Root — useful as a deploy health ping when running API-only
  app.get('/', (req, res) => res.json({
    service: 'Nyumba Smart API',
    version: '1.0.0',
    docs: '/api/health',
    note: 'Frontend build not found at ' + FRONTEND_DIST + ' — running in API-only mode.',
  }));
}

// ─── Error handler (must be last) ─────────────────────────────────────────

app.use(errorHandler);

// ─── Boot ──────────────────────────────────────────────────────────────────

async function start() {
  try {
    const dbTime = await testConnection();
    console.log(`✅ Database connected — server time: ${dbTime}`);
  } catch (dbErr) {
    console.warn(`⚠️  Database not reachable: ${dbErr.message}`);
    console.warn('   Server will start anyway. Ensure DATABASE_URL is set correctly.');
  }

  app.listen(PORT, () => {
    console.log(`🚀 Nyumba Smart API running on http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Frontend:    ${frontendBuilt ? `serving from ${FRONTEND_DIST}` : 'NOT BUILT (API-only mode)'}`);
    console.log(`   MTN MoMo:    ${process.env.MTN_MOMO_BASE_URL || 'NOT CONFIGURED'}`);
    console.log(`   Airtel:      ${process.env.AIRTEL_MONEY_BASE_URL || 'NOT CONFIGURED'}`);
    console.log(`   SMS:         Africa's Talking (${process.env.AT_USERNAME || 'sandbox'})`);
  });
}

start();

module.exports = app; // for testing
