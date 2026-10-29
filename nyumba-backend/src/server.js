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

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    // Add your production domain here
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Trust proxy for accurate IP logging (needed behind Nginx/Railway/Render)
app.set('trust proxy', 1);

// ─── Body parsing ──────────────────────────────────────────────────────────
// Capture raw body for Paystack webhook HMAC verification (landlord/platform key).

app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    if (req.originalUrl && req.originalUrl.includes('/payments/paystack/webhook')) {
      req.rawBody = buf;
    }
  },
}));
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

// Two folder layouts are common depending on how people extract/clone the
// two zips, so check both rather than assuming one:
//   Sibling layout:  parent/nyumba-smart/  and  parent/nyumba-backend/
//   Nested layout:   nyumba-smart/  and  nyumba-smart/nyumba-backend/
//                     (i.e. this backend folder living INSIDE the frontend
//                     folder — what you get if you extract the backend zip
//                     straight into an existing nyumba-smart directory)
const CANDIDATE_DIST_PATHS = [
  path.resolve(__dirname, '../../nyumba-smart/dist'), // sibling layout
  path.resolve(__dirname, '../../dist'),               // nested layout
];
const FRONTEND_DIST = CANDIDATE_DIST_PATHS.find(p => fs.existsSync(path.join(p, 'index.html')));
const frontendBuilt = !!FRONTEND_DIST;

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
    note: 'Frontend build not found. Checked: ' + CANDIDATE_DIST_PATHS.join(', ') +
          ' — run `npm run build` in the frontend folder, then restart this server.',
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
    console.log(`   Paystack:    landlord-owned keys (platform fallback: ${process.env.PAYSTACK_PLATFORM_SECRET_KEY ? 'SET' : 'NOT SET'})`);
    console.log(`   Encryption:  ${process.env.ENCRYPTION_KEY ? 'SET' : 'NOT SET — Payment Settings will fail'}`);
    console.log(`   SMS:         Africa's Talking (${process.env.AT_USERNAME || 'sandbox'})`);
  });
}

start();

module.exports = app; // for testing
