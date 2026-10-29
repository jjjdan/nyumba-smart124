const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

/**
 * Verifies the JWT and attaches user to req.user.
 * Throws 401 if token is missing/invalid/expired.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.slice(7);
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Pull user from DB on each request (so revoked accounts are caught immediately)
    const result = await query(
      'SELECT id, name, email, phone, role, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!result.rows.length || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Account not found or deactivated' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Role-based access control.
 * Usage: authorize('admin') or authorize('landlord', 'admin')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
