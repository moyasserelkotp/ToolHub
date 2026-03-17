/**
 * ToolHub API Authentication Middleware
 * =====================================
 * Guards write operations (POST/PUT/DELETE) with a Bearer token.
 * Read-only endpoints (GET) remain public so agents can discover tools freely.
 *
 * Set TOOLHUB_ADMIN_TOKEN in .env. If the env var is absent the server runs
 * in open/dev mode (a warning is logged on startup).
 *
 * Usage in index.js:
 *   const { requireApiKey, warnIfNoToken } = require('./middleware/auth');
 *   warnIfNoToken();                          // call once at startup
 *   app.use(requireApiKey);                   // applied globally — guards writes only
 */

const ADMIN_TOKEN = process.env.TOOLHUB_ADMIN_TOKEN;

// READ-ONLY methods + paths that agents must reach without a key
const PUBLIC_METHODS  = new Set(['GET', 'HEAD', 'OPTIONS']);
const PUBLIC_PATHS    = new Set([
  '/',
  '/health',
  '/tools/search',   // POST but intentionally public — discovery
]);

/**
 * Express middleware.
 * - GET / HEAD / OPTIONS → always allowed
 * - POST /tools/search   → always allowed (semantic discovery)
 * - Anything else        → requires Authorization: Bearer <TOOLHUB_ADMIN_TOKEN>
 */
function requireApiKey(req, res, next) {
  // Pass through if no token is configured (dev mode)
  if (!ADMIN_TOKEN) return next();

  // Public methods are fine
  if (PUBLIC_METHODS.has(req.method)) return next();

  // Explicitly public write endpoints
  if (PUBLIC_PATHS.has(req.path)) return next();
  // Also allow /tools/search even when called via full path
  if (req.method === 'POST' && req.path === '/search') return next();

  // Extract Bearer token
  const auth  = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;

  if (token === ADMIN_TOKEN) return next();

  return res.status(401).json({
    error:   'Unauthorized',
    message: 'Provide a valid Bearer token in the Authorization header.',
    hint:    'Set TOOLHUB_ADMIN_TOKEN in your .env and pass it as: Authorization: Bearer <token>',
  });
}

/**
 * Log a startup warning when TOOLHUB_ADMIN_TOKEN is not set.
 * Call this once in index.js after loading dotenv.
 */
function warnIfNoToken() {
  if (!ADMIN_TOKEN) {
    console.warn('⚠️  TOOLHUB_ADMIN_TOKEN is not set — API is running in OPEN mode.');
    console.warn('   Set it in server/.env to protect write endpoints in production.');
  } else {
    console.log('🔐 API auth enabled — write endpoints require Bearer token.');
  }
}

module.exports = { requireApiKey, warnIfNoToken };
