const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/database');
const { createError } = require('../middleware/errorHandler');

// ─── Token generation ───────────────────────────────────────────────────────

function generateAccessToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function generateRefreshToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
}

/**
 * Derives a landlord code from name, guaranteed unique by appending counter.
 */
async function generateUniqueLandlordCode(name) {
  const base = 'LL-' + name.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
  let code = base;
  let attempt = 0;
  while (true) {
    const { rows } = await query(
      'SELECT id FROM landlords WHERE landlord_code = $1',
      [code]
    );
    if (!rows.length) return code;
    attempt++;
    code = base.slice(0, 6 - String(attempt).length) + attempt;
  }
}

// ─── Controllers ────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Body: { name, email, phone, password, role, landlordCode? }
 */
async function register(req, res, next) {
  try {
    const { name, email, phone, password, role, landlordCode } = req.body;

    // Normalize phone — strip spaces, ensure Uganda format
    const normalizedPhone = phone.replace(/\s+/g, '');

    // Check duplicates
    const existing = await query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email.toLowerCase(), normalizedPhone]
    );
    if (existing.rows.length) {
      throw createError('Email or phone already registered', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await withTransaction(async (client) => {
      // 1. Create user
      const userRes = await client.query(
        `INSERT INTO users (name, email, phone, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, phone, role, created_at`,
        [name, email.toLowerCase(), normalizedPhone, passwordHash, role]
      );
      const user = userRes.rows[0];

      let profileData = {};

      if (role === 'landlord') {
        // 2a. Create landlord profile
        const code = await generateUniqueLandlordCode(name);
        const tierRes = await client.query(
          `SELECT id FROM subscription_tiers WHERE min_units = 1 LIMIT 1`
        );
        const tierId = tierRes.rows[0]?.id || null;

        const landlordRes = await client.query(
          `INSERT INTO landlords (user_id, landlord_code, subscription_id, trial_ends_at)
           VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')
           RETURNING id, landlord_code, units_count`,
          [user.id, code, tierId]
        );

        // Initialize SMS billing row
        await client.query(
          `INSERT INTO sms_billing (landlord_id) VALUES ($1)`,
          [landlordRes.rows[0].id]
        );

        // Map to camelCase so it matches what the frontend (and the
        // /auth/login, /auth/me responses) expect on `profile.landlordCode`.
        profileData = {
          landlordRowId: landlordRes.rows[0].id,
          landlordCode: landlordRes.rows[0].landlord_code,
          units_count: landlordRes.rows[0].units_count,
        };

      } else if (role === 'tenant') {
        // 2b. Validate landlord code
        const landlordRes = await client.query(
          `SELECT l.id, l.landlord_code, p.id as property_id
           FROM landlords l
           LEFT JOIN properties p ON p.landlord_code = l.landlord_code AND p.is_active = TRUE
           WHERE l.landlord_code = $1
           LIMIT 1`,
          [(landlordCode || '').toUpperCase().trim()]
        );

        if (!landlordRes.rows.length) {
          throw createError('Invalid landlord code — check the code your landlord gave you', 404);
        }

        const { landlord_code, property_id } = landlordRes.rows[0];

        const tenantRes = await client.query(
          `INSERT INTO tenants (user_id, landlord_code, property_id)
           VALUES ($1, $2, $3)
           RETURNING id, landlord_code, property_id`,
          [user.id, landlord_code, property_id || null]
        );

        profileData = {
          landlordCode: tenantRes.rows[0].landlord_code,
          propertyId: tenantRes.rows[0].property_id,
        };
      }

      return { user, profile: profileData };
    });

    const accessToken = generateAccessToken(result.user.id, role);
    const refreshToken = generateRefreshToken(result.user.id, role);

    // Store refresh token hash
    const tokenHash = await bcrypt.hash(refreshToken, 8);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_id)
       VALUES ($1, $2, $3, $4)`,
      [result.user.id, tokenHash, expiresAt, req.body.deviceId || null]
    );

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        role: result.user.role,
      },
      profile: result.profile,
    });

  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Body: { email, password, deviceId? }
 */
async function login(req, res, next) {
  try {
    const { email, password, deviceId } = req.body;

    const userRes = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.password_hash, u.is_active,
              l.landlord_code, l.id as landlord_row_id,
              t.landlord_code as tenant_landlord_code, t.property_id
       FROM users u
       LEFT JOIN landlords l ON l.user_id = u.id
       LEFT JOIN tenants   t ON t.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (!userRes.rows.length) {
      throw createError('Invalid credentials', 401);
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      throw createError('Account is deactivated. Contact support.', 403);
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      throw createError('Invalid credentials', 401);
    }

    const accessToken  = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id, user.role);

    // Store refresh token
    const tokenHash = await bcrypt.hash(refreshToken, 8);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_id)
       VALUES ($1, $2, $3, $4)`,
      [user.id, tokenHash, expiresAt, deviceId || null]
    );

    // Audit
    await query(
      `INSERT INTO audit_logs (user_id, action, ip_address, user_agent)
       VALUES ($1, 'LOGIN', $2, $3)`,
      [user.id, req.ip, req.headers['user-agent']]
    );

    const profile = {};
    if (user.role === 'landlord') {
      profile.landlordCode = user.landlord_code;
      profile.landlordRowId = user.landlord_row_id;
    } else if (user.role === 'tenant') {
      profile.landlordCode = user.tenant_landlord_code;
      profile.propertyId   = user.property_id;
    }

    res.json({
      accessToken,
      refreshToken,
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        phone: user.phone,
        role:  user.role,
      },
      profile,
    });

  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
async function refreshToken(req, res, next) {
  try {
    const { refreshToken: token } = req.body;
    if (!token) throw createError('Refresh token required', 400);

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      throw createError('Invalid or expired refresh token', 401);
    }

    // Find matching stored token
    const stored = await query(
      `SELECT id, token_hash, expires_at, revoked_at
       FROM refresh_tokens
       WHERE user_id = $1 AND expires_at > NOW() AND revoked_at IS NULL
       ORDER BY created_at DESC LIMIT 20`,
      [decoded.userId]
    );

    let matchRow = null;
    for (const row of stored.rows) {
      if (await bcrypt.compare(token, row.token_hash)) {
        matchRow = row;
        break;
      }
    }

    if (!matchRow) throw createError('Refresh token not recognised', 401);

    const newAccessToken = generateAccessToken(decoded.userId, decoded.role);

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Revokes the refresh token for this device.
 */
async function logout(req, res, next) {
  try {
    const { refreshToken: token } = req.body;

    if (token) {
      // Find and revoke
      const stored = await query(
        `SELECT id, token_hash FROM refresh_tokens
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [req.user.id]
      );
      for (const row of stored.rows) {
        const match = await bcrypt.compare(token, row.token_hash);
        if (match) {
          await query(
            `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
            [row.id]
          );
          break;
        }
      }
    }

    await query(
      `INSERT INTO audit_logs (user_id, action, ip_address) VALUES ($1, 'LOGOUT', $2)`,
      [req.user.id, req.ip]
    );

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Returns the current user plus role-specific profile data
 * (landlordCode, units, propertyId) — needed so the frontend
 * can restore full session context after a page refresh.
 */
async function getMe(req, res, next) {
  try {
    const userRes = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role,
              l.landlord_code, l.units_count, l.id as landlord_row_id,
              t.landlord_code as tenant_landlord_code, t.property_id
       FROM users u
       LEFT JOIN landlords l ON l.user_id = u.id
       LEFT JOIN tenants   t ON t.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!userRes.rows.length) throw createError('User not found', 404);
    const row = userRes.rows[0];

    const profile = {};
    if (row.role === 'landlord') {
      profile.landlordCode = row.landlord_code;
      profile.units_count = row.units_count;
      profile.landlordRowId = row.landlord_row_id;
    } else if (row.role === 'tenant') {
      profile.landlordCode = row.tenant_landlord_code;
      profile.propertyId = row.property_id;
    }

    res.json({
      user: {
        id: row.id, name: row.name, email: row.email,
        phone: row.phone, role: row.role,
      },
      profile,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refreshToken, logout, getMe };
