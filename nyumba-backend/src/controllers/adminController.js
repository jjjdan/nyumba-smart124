const { query, withTransaction } = require('../config/database');
const { createError } = require('../middleware/errorHandler');

/**
 * GET /api/admin/dashboard
 * High-level platform metrics.
 */
async function getDashboard(req, res, next) {
  try {
    const [users, props, financials, complaints, subs] = await Promise.all([
      query(`SELECT role, COUNT(*) as count FROM users WHERE is_active = TRUE GROUP BY role`),
      query(`SELECT status, COUNT(*) as count FROM properties WHERE is_active = TRUE GROUP BY status`),
      query(
        `SELECT
           SUM(CASE WHEN type = 'Subscription Fee' AND status = 'Cleared' THEN amount ELSE 0 END) as sub_revenue,
           SUM(CASE WHEN type = 'Rent Payment'      AND status = 'Cleared' THEN amount ELSE 0 END) as rent_processed,
           SUM(CASE WHEN type = 'Message Billing'   AND status = 'Cleared' THEN amount ELSE 0 END) as sms_revenue,
           COUNT(*) as total_transactions
         FROM financial_records`
      ),
      query(`SELECT status, COUNT(*) as count FROM complaints GROUP BY status`),
      query(
        `SELECT st.name, COUNT(l.id) as landlord_count
         FROM subscription_tiers st
         LEFT JOIN landlords l ON l.subscription_id = st.id
         GROUP BY st.id, st.name
         ORDER BY st.min_units ASC`
      ),
    ]);

    const userMap   = Object.fromEntries(users.rows.map(r => [r.role, parseInt(r.count)]));
    const propMap   = Object.fromEntries(props.rows.map(r => [r.status, parseInt(r.count)]));
    const compMap   = Object.fromEntries(complaints.rows.map(r => [r.status, parseInt(r.count)]));
    const fin       = financials.rows[0];

    res.json({
      users: {
        landlords: userMap.landlord || 0,
        tenants:   userMap.tenant   || 0,
        admins:    userMap.admin    || 0,
        total:     Object.values(userMap).reduce((a, b) => a + b, 0),
      },
      properties: {
        paid:          propMap['Paid']          || 0,
        overdue:       propMap['Overdue']        || 0,
        partiallyPaid: propMap['Partially Paid'] || 0,
        vacant:        propMap['Vacant']         || 0,
        total:         Object.values(propMap).reduce((a, b) => a + b, 0),
      },
      revenue: {
        subscriptions:    parseInt(fin.sub_revenue   || 0),
        rentProcessed:    parseInt(fin.rent_processed || 0),
        smsRevenue:       parseInt(fin.sms_revenue    || 0),
        totalTransactions: parseInt(fin.total_transactions || 0),
      },
      complaints: {
        received:   compMap['Received']   || 0,
        inProgress: compMap['In Progress'] || 0,
        settled:    compMap['Settled']     || 0,
      },
      subscriptionBreakdown: subs.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/tiers
 * List all subscription tiers.
 */
async function listTiers(req, res, next) {
  try {
    const result = await query(
      `SELECT * FROM subscription_tiers ORDER BY min_units ASC`
    );
    res.json({ tiers: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/tiers
 * Bulk-replace all subscription tiers (admin configures pricing).
 * Body: { tiers: Array<{ name, minUnits, maxUnits, pricePerMonth }> }
 */
async function updateTiers(req, res, next) {
  try {
    const { tiers } = req.body;
    if (!Array.isArray(tiers) || !tiers.length) {
      throw createError('Tiers array required', 400);
    }

    await withTransaction(async (client) => {
      // Deactivate all existing
      await client.query(`UPDATE subscription_tiers SET is_active = FALSE`);

      for (const tier of tiers) {
        await client.query(
          `INSERT INTO subscription_tiers (name, min_units, max_units, price_per_month, is_active)
           VALUES ($1, $2, $3, $4, TRUE)
           ON CONFLICT DO NOTHING`,
          [tier.name, tier.minUnits, tier.maxUnits, tier.pricePerMonth]
        );
      }
    });

    await query(
      `INSERT INTO audit_logs (user_id, action, details)
       VALUES ($1, 'UPDATE_SUBSCRIPTION_TIERS', $2)`,
      [req.user.id, JSON.stringify({ tierCount: tiers.length })]
    );

    const updated = await query(`SELECT * FROM subscription_tiers WHERE is_active = TRUE ORDER BY min_units ASC`);
    res.json({ tiers: updated.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/users
 * List all users with optional role filter.
 */
async function listUsers(req, res, next) {
  try {
    const { role, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.created_at,
             l.landlord_code, l.units_count,
             st.name as subscription_tier
      FROM users u
      LEFT JOIN landlords l ON l.user_id = u.id
      LEFT JOIN subscription_tiers st ON st.id = l.subscription_id
    `;
    const params = [];
    let idx = 1;

    if (role) {
      sql += ` WHERE u.role = $${idx++}`;
      params.push(role);
    }
    sql += ` ORDER BY u.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/users/:id
 * Activate or deactivate a user account.
 */
async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') throw createError('isActive (boolean) required', 400);

    const result = await query(
      `UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, name, email, is_active`,
      [isActive, id]
    );
    if (!result.rows.length) throw createError('User not found', 404);

    await query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, details)
       VALUES ($1, $2, 'users', $3, $4)`,
      [req.user.id, isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', id, JSON.stringify({ targetUser: id })]
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/logs
 * Return recent audit logs.
 */
async function getAuditLogs(req, res, next) {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const result = await query(
      `SELECT al.*, u.name as user_name, u.email as user_email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ logs: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/payout-settings
 * GET /PUT payout destination for platform fees.
 */
async function getPayoutSettings(req, res, next) {
  try {
    // In production these would be encrypted at rest in a settings table
    res.json({
      momoDetails: process.env.ADMIN_PAYOUT_MOMO || 'Not configured',
      bankDetails: process.env.ADMIN_PAYOUT_BANK || 'Not configured',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboard,
  listTiers,
  updateTiers,
  listUsers,
  updateUser,
  getAuditLogs,
  getPayoutSettings,
};
