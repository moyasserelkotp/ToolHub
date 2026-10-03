const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme_generate_a_real_secret_in_production';

const PUBLIC_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PUBLIC_PATHS = new Set(['/', '/health']);

function requireAuth(req, res, next) {
  // Public discovery
  if (PUBLIC_METHODS.has(req.method)) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();
  if (req.method === 'POST' && (
    req.path === '/search' ||
    req.path === '/tools/search' ||
    req.path === '/skills/search'
  )) return next();
  
  // Public auth routes
  if (req.path.startsWith('/auth')) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

function requireRole(requiredRole) {
  const roles = { admin: 3, editor: 2, viewer: 1 };
  
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Forbidden: No role assigned' });
    }
    
    const userLevel = roles[req.user.role] || 0;
    const requiredLevel = roles[requiredRole] || 3;
    
    if (userLevel < requiredLevel) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }
    
    next();
  };
}

// Keep a stub for compatibility if any other files look for it for now
function warnIfNoToken() {}

module.exports = { requireAuth, requireRole, warnIfNoToken };
