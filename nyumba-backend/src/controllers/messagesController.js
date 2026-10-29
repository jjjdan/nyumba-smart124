const { query, withTransaction } = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const smsService = require('../services/smsService');

/**
 * POST /api/messages/reminder
 * Landlord sends overdue reminder to a single tenant or all overdue tenants.
 *
 * Body: { propertyId? } — if omitted, sends to ALL overdue tenants under landlord
 */
async function sendReminder(req, res, next) {
  try {
    const { propertyId } = req.body;
    const { user } = req;

    // Get landlord row
    const landlordRes = await query(
      `SELECT l.id, l.landlord_code FROM landlords l WHERE l.user_id = $1`,
      [user.id]
    );
    if (!landlordRes.rows.length) throw createError('Landlord profile not found', 404);
    const landlord = landlordRes.rows[0];

    // Get overdue properties
    let propQuery;
    let propParams;
    if (propertyId) {
      propQuery = `SELECT * FROM properties WHERE id = $1 AND landlord_id = $2 AND LOWER(status) = 'overdue'`;
      propParams = [propertyId, landlord.id];
    } else {
      propQuery = `SELECT * FROM properties WHERE landlord_id = $1 AND LOWER(status) = 'overdue' AND is_active = TRUE`;
      propParams = [landlord.id];
    }
    const propsRes = await query(propQuery, propParams);
    if (!propsRes.rows.length) {
      return res.json({ message: 'No overdue tenants to notify', sent: 0, cost: 0 });
    }

    let totalSent = 0;
    let totalCost = 0;
    const results = [];

    for (const prop of propsRes.rows) {
      if (!prop.tenant_phone) continue;
      const message = `Overdue rent reminder for ${prop.name} — UGX ${prop.monthly_rent.toLocaleString()}`;
      await query(
        `INSERT INTO messages
           (landlord_code, tenant_phone, text, sender_role, sender_id, sms_sent, sms_cost_ugx)
         VALUES ($1, $2, $3, 'system', $4, FALSE, 0)`,
        [landlord.landlord_code, prop.tenant_phone, message, user.id]
      );
      totalSent += 1;
      results.push({ property: prop.name, phone: prop.tenant_phone, status: 'posted' });
    }

    // Update landlord SMS billing balance
    await query(
      `UPDATE sms_billing SET accrued_ugx = accrued_ugx + $1, updated_at = NOW()
       WHERE landlord_id = $2`,
      [totalCost, landlord.id]
    );

    res.json({ message: `Reminders posted in the app`, sent: totalSent, cost: 0, results, localOnly: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/messages/broadcast
 * Landlord broadcasts a custom message to all their tenants.
 *
 * Body: { text }
 */
async function sendBroadcast(req, res, next) {
  try {
    const { text } = req.body;
    const { user } = req;

    if (!text || !text.trim()) throw createError('Message text is required', 400);

    const landlordRes = await query(
      `SELECT l.id, l.landlord_code FROM landlords l WHERE l.user_id = $1`,
      [user.id]
    );
    if (!landlordRes.rows.length) throw createError('Landlord profile not found', 404);
    const landlord = landlordRes.rows[0];

    const propsRes = await query(
      `SELECT DISTINCT tenant_phone, tenant_name FROM properties
       WHERE landlord_id = $1 AND tenant_phone IS NOT NULL AND is_active = TRUE`,
      [landlord.id]
    );

    if (!propsRes.rows.length) {
      return res.json({ message: 'No tenants with registered phone numbers', sent: 0, cost: 0 });
    }

    const phones = propsRes.rows.map(r => r.tenant_phone);

    // Always save a broadcast locally. A NULL tenant_phone makes it visible
    // to every tenant linked to this landlord code.
    const localMessage = await query(
      `INSERT INTO messages (landlord_code, tenant_phone, text, sender_role, sender_id, sms_sent, sms_cost_ugx)
       VALUES ($1, NULL, $2, 'landlord', $3, FALSE, 0)
       RETURNING id`,
      [landlord.landlord_code, text.trim(), user.id]
    );

    return res.json({
      message: 'Broadcast posted for tenants in the app',
      sent: phones.length,
      cost: 0,
      recipientCount: phones.length,
      localOnly: true,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/messages/billing
 * Returns current SMS billing balance for the landlord.
 */
async function getSmsBilling(req, res, next) {
  try {
    const landlordRes = await query(
      `SELECT l.id FROM landlords l WHERE l.user_id = $1`,
      [req.user.id]
    );
    if (!landlordRes.rows.length) throw createError('Landlord not found', 404);

    const billing = await query(
      `SELECT accrued_ugx, paid_ugx, last_paid_at, updated_at
       FROM sms_billing WHERE landlord_id = $1`,
      [landlordRes.rows[0].id]
    );

    const row = billing.rows[0] || { accrued_ugx: 0, paid_ugx: 0 };
    res.json({
      outstanding: row.accrued_ugx,
      totalPaid:   row.paid_ugx,
      lastPaidAt:  row.last_paid_at,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/messages/billing/settle
 * Called after landlord pays their SMS bill via MoMo.
 * Expects paymentsController to have already created/cleared the financial record.
 *
 * Body: { receiptNo }
 */
async function settleSmsBilling(req, res, next) {
  try {
    const { receiptNo } = req.body;

    const landlordRes = await query(
      `SELECT l.id, sb.accrued_ugx
       FROM landlords l
       JOIN sms_billing sb ON sb.landlord_id = l.id
       WHERE l.user_id = $1`,
      [req.user.id]
    );
    if (!landlordRes.rows.length) throw createError('Landlord not found', 404);
    const { id: landlordId, accrued_ugx } = landlordRes.rows[0];

    await withTransaction(async (client) => {
      // Zero out the accrued balance, increment paid total
      await client.query(
        `UPDATE sms_billing
         SET paid_ugx = paid_ugx + $1,
             accrued_ugx = 0,
             last_paid_at = NOW(),
             updated_at = NOW()
         WHERE landlord_id = $2`,
        [accrued_ugx, landlordId]
      );
    });

    res.json({ message: 'SMS billing settled', amountSettled: accrued_ugx, receiptNo });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/messages
 * List messages for the current user's landlord code.
 */
async function listMessages(req, res, next) {
  try {
    const { user } = req;
    let landlordCode;

    if (user.role === 'landlord') {
      const lr = await query(`SELECT landlord_code FROM landlords WHERE user_id = $1`, [user.id]);
      landlordCode = lr.rows[0]?.landlord_code;
    } else if (user.role === 'tenant') {
      const tr = await query(`SELECT landlord_code FROM tenants WHERE user_id = $1`, [user.id]);
      landlordCode = tr.rows[0]?.landlord_code;
    }

    if (!landlordCode) throw createError('No landlord code found', 404);

    const result = await query(
      `SELECT * FROM messages
       WHERE landlord_code = $1
         AND (tenant_phone IS NULL OR tenant_phone = $2)
       ORDER BY created_at DESC LIMIT 50`,
      [landlordCode, user.phone]
    );

    res.json({ messages: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendReminder, sendBroadcast, getSmsBilling, settleSmsBilling, listMessages };
