const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const momoService = require('../services/momoService');
const smsService  = require('../services/smsService');

// ─── Receipt number generator ─────────────────────────────────────────────

function makeReceiptNo(provider) {
  const prefix = {
    'MTN Mobile Money': 'MM',
    'Airtel Money':     'AM',
    'Bank Transfer':    'BK',
    'System':           'SYS',
  }[provider] || 'TX';
  return `${prefix}-TX-${Math.floor(100000 + Math.random() * 900000)}`;
}

// ─── Initiate Payment ─────────────────────────────────────────────────────

/**
 * POST /api/payments/initiate
 * Creates a pending financial record then fires off the MoMo push.
 *
 * Body: { propertyId, provider, senderPhone, type?, offlineRecord? }
 */
async function initiatePayment(req, res, next) {
  try {
    const { propertyId, provider, senderPhone, type = 'Rent Payment', offlineRecord = false } = req.body;
    const { user } = req;

    // Validate property access
    let property;
    if (type === 'Rent Payment') {
      const propRes = await query(
        `SELECT p.*, l.user_id as landlord_user_id
         FROM properties p
         JOIN landlords l ON l.id = p.landlord_id
         WHERE p.id = $1 AND p.is_active = TRUE`,
        [propertyId]
      );
      if (!propRes.rows.length) throw createError('Property not found', 404);
      property = propRes.rows[0];

      if (property.status === 'Paid') {
        throw createError('Rent is already paid for this property this month', 409);
      }
    }

    const amount = property ? property.monthly_rent : req.body.amount;
    if (!amount || amount <= 0) throw createError('Invalid payment amount', 400);

    const receiptNo = makeReceiptNo(provider);
    const externalRef = uuidv4();

    // 1. Insert financial record in Pending state
    const recordRes = await query(
      `INSERT INTO financial_records
         (id, property_id, property_name, amount, type, provider,
          sender_phone_or_acc, receiver, status, receipt_no,
          is_offline_record, device_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending Push', $9, $10, $11, $12)
       RETURNING *`,
      [
        externalRef,
        propertyId || null,
        property?.name || 'Platform Fee',
        amount,
        type,
        provider,
        (senderPhone || user.phone).replace(/\s+/g, ''),
        property ? property.landlord_code : 'NYUMBA SMART LTD',
        receiptNo,
        offlineRecord,
        req.body.deviceId || null,
        user.id,
      ]
    );
    const record = recordRes.rows[0];

    // 2. If offline, stop here — will be synced later
    if (offlineRecord || provider === 'Bank Transfer') {
      return res.status(202).json({
        message: offlineRecord
          ? 'Payment queued offline. Will sync when online.'
          : 'Bank transfer recorded. Update status manually when confirmed.',
        transactionId: record.id,
        receiptNo,
        status: 'Pending Push',
      });
    }

    // 3. Fire MoMo push
    let gatewayRef;
    try {
      const gateway = await momoService.initiatePayment(
        provider,
        (senderPhone || user.phone).replace(/\s+/g, ''),
        amount,
        record.id,
        property
          ? `Rent for ${property.name}`
          : `Nyumba Smart ${type}`
      );
      gatewayRef = gateway.gatewayRef;
    } catch (momoErr) {
      // Mark record as Failed if gateway call itself errors
      await query(
        `UPDATE financial_records SET status = 'Failed', gateway_status = $1 WHERE id = $2`,
        [momoErr.message, record.id]
      );
      throw createError(`Payment gateway error: ${momoErr.message}`, 502);
    }

    // 4. Store gateway reference
    await query(
      `UPDATE financial_records SET gateway_ref = $1, gateway_status = 'PENDING' WHERE id = $2`,
      [gatewayRef, record.id]
    );

    res.status(202).json({
      message: 'Payment push sent. Customer will receive USSD prompt.',
      transactionId: record.id,
      gatewayRef,
      receiptNo,
      status: 'Pending Push',
    });

  } catch (err) {
    next(err);
  }
}

// ─── MTN Callback ─────────────────────────────────────────────────────────

/**
 * POST /api/payments/mtn/callback
 * Called by MTN MoMo when payment status changes.
 * This endpoint must be publicly reachable (configure in MTN developer portal).
 */
async function mtnCallback(req, res, next) {
  try {
    const { referenceId, status, financialTransactionId, reason } = req.body;

    const recordRes = await query(
      `SELECT * FROM financial_records WHERE gateway_ref = $1`,
      [referenceId]
    );
    if (!recordRes.rows.length) {
      return res.status(200).json({ received: true }); // Silently ack unknown refs
    }

    const record = recordRes.rows[0];
    const isSuccess = status === 'SUCCESSFUL';

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE financial_records
         SET status = $1, gateway_status = $2, gateway_payload = $3, synced_at = NOW()
         WHERE id = $4`,
        [
          isSuccess ? 'Cleared' : 'Failed',
          status,
          JSON.stringify(req.body),
          record.id,
        ]
      );

      if (isSuccess && record.property_id) {
        // Mark property as Paid
        await client.query(
          `UPDATE properties SET status = 'Paid' WHERE id = $1`,
          [record.property_id]
        );

        // Send confirmation SMS to tenant
        try {
          const propRes = await client.query(
            `SELECT tenant_name, tenant_phone FROM properties WHERE id = $1`,
            [record.property_id]
          );
          if (propRes.rows[0]?.tenant_phone) {
            await smsService.sendPaymentConfirmation(
              propRes.rows[0].tenant_phone,
              propRes.rows[0].tenant_name,
              record.amount,
              record.receipt_no
            );
          }
        } catch (smsErr) {
          console.error('[SMS] Confirmation send failed:', smsErr.message);
        }
      }
    });

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/airtel/callback
 * Called by Airtel Money when payment status changes.
 */
async function airtelCallback(req, res, next) {
  try {
    const transactionId = req.body.transaction?.id;
    const airtelStatus  = req.body.transaction?.status; // TS = success, TF = fail

    const recordRes = await query(
      `SELECT * FROM financial_records WHERE gateway_ref = $1 OR id = $1`,
      [transactionId]
    );
    if (!recordRes.rows.length) return res.status(200).json({ received: true });

    const record = recordRes.rows[0];
    const isSuccess = airtelStatus === 'TS';

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE financial_records
         SET status = $1, gateway_status = $2, gateway_payload = $3, synced_at = NOW()
         WHERE id = $4`,
        [
          isSuccess ? 'Cleared' : 'Failed',
          airtelStatus,
          JSON.stringify(req.body),
          record.id,
        ]
      );

      if (isSuccess && record.property_id) {
        await client.query(
          `UPDATE properties SET status = 'Paid' WHERE id = $1`,
          [record.property_id]
        );

        try {
          const propRes = await client.query(
            `SELECT tenant_name, tenant_phone FROM properties WHERE id = $1`,
            [record.property_id]
          );
          if (propRes.rows[0]?.tenant_phone) {
            await smsService.sendPaymentConfirmation(
              propRes.rows[0].tenant_phone,
              propRes.rows[0].tenant_name,
              record.amount,
              record.receipt_no
            );
          }
        } catch (smsErr) {
          console.error('[SMS] Confirmation send failed:', smsErr.message);
        }
      }
    });

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
}

// ─── Status Poll ──────────────────────────────────────────────────────────

/**
 * GET /api/payments/:transactionId/status
 * Allows frontend to poll payment status (fallback if webhook is slow).
 */
async function getPaymentStatus(req, res, next) {
  try {
    const { transactionId } = req.params;

    const result = await query(
      `SELECT id, status, gateway_status, gateway_ref, receipt_no,
              amount, provider, property_id, updated_at
       FROM financial_records WHERE id = $1`,
      [transactionId]
    );
    if (!result.rows.length) throw createError('Transaction not found', 404);
    const record = result.rows[0];

    // If still pending, actively poll the gateway
    if (record.gateway_status === 'PENDING' && record.gateway_ref) {
      try {
        const { status: gwStatus, raw } = await momoService.checkPaymentStatus(
          record.provider,
          record.gateway_ref
        );

        if (gwStatus !== 'PENDING') {
          await withTransaction(async (client) => {
            const newStatus = gwStatus === 'SUCCESSFUL' ? 'Cleared' : 'Failed';
            await client.query(
              `UPDATE financial_records
               SET status = $1, gateway_status = $2, gateway_payload = $3, synced_at = NOW()
               WHERE id = $4`,
              [newStatus, gwStatus, JSON.stringify(raw), record.id]
            );
            if (gwStatus === 'SUCCESSFUL' && record.property_id) {
              await client.query(
                `UPDATE properties SET status = 'Paid' WHERE id = $1`,
                [record.property_id]
              );
            }
          });
          record.status = gwStatus === 'SUCCESSFUL' ? 'Cleared' : 'Failed';
          record.gateway_status = gwStatus;
        }
      } catch (pollErr) {
        console.error('[Poll] Gateway poll error:', pollErr.message);
      }
    }

    res.json({ transaction: record });
  } catch (err) {
    next(err);
  }
}

// ─── List Financials ─────────────────────────────────────────────────────

/**
 * GET /api/payments
 * Role-filtered transaction history.
 */
async function listFinancials(req, res, next) {
  try {
    const { user } = req;
    const { limit = 50, offset = 0 } = req.query;

    let sql;
    let params;

    if (user.role === 'admin') {
      sql = `SELECT fr.*, p.name as property_name_rel
             FROM financial_records fr
             LEFT JOIN properties p ON p.id = fr.property_id
             ORDER BY fr.created_at DESC
             LIMIT $1 OFFSET $2`;
      params = [limit, offset];

    } else if (user.role === 'landlord') {
      sql = `SELECT fr.*
             FROM financial_records fr
             JOIN properties p ON p.id = fr.property_id
             JOIN landlords l ON l.id = p.landlord_id AND l.user_id = $1
             ORDER BY fr.created_at DESC
             LIMIT $2 OFFSET $3`;
      params = [user.id, limit, offset];

    } else {
      // Tenant
      sql = `SELECT fr.*
             FROM financial_records fr
             JOIN tenants t ON t.property_id = fr.property_id AND t.user_id = $1
             ORDER BY fr.created_at DESC
             LIMIT $2 OFFSET $3`;
      params = [user.id, limit, offset];
    }

    const result = await query(sql, params);
    res.json({ financials: result.rows });
  } catch (err) {
    next(err);
  }
}

// ─── Offline Sync ─────────────────────────────────────────────────────────

/**
 * POST /api/payments/sync
 * Bulk-uploads offline records collected on device.
 *
 * Body: { records: Array<OfflineRecord> }
 */
async function syncOfflinePayments(req, res, next) {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || !records.length) {
      throw createError('No offline records provided', 400);
    }

    const results = { synced: [], failed: [] };

    for (const rec of records) {
      try {
        const receiptNo = makeReceiptNo(rec.provider);
        await query(
          `INSERT INTO financial_records
             (property_id, property_name, amount, type, provider,
              sender_phone_or_acc, receiver, status, receipt_no,
              is_offline_record, device_id, synced_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Cleared', $8, TRUE, $9, NOW(), $10)
           ON CONFLICT (receipt_no) DO NOTHING`,
          [
            rec.propertyId || null,
            rec.propertyName || null,
            rec.amount,
            rec.type || 'Rent Payment',
            rec.provider,
            rec.senderPhone || '',
            rec.receiver || '',
            receiptNo,
            rec.deviceId || null,
            req.user.id,
          ]
        );

        // Mark property as Paid if it's a rent payment
        if (rec.propertyId && rec.type === 'Rent Payment') {
          await query(
            `UPDATE properties SET status = 'Paid' WHERE id = $1`,
            [rec.propertyId]
          );
        }

        results.synced.push({ localId: rec.localId, receiptNo });
      } catch (recErr) {
        results.failed.push({ localId: rec.localId, error: recErr.message });
      }
    }

    res.json({
      message: `Synced ${results.synced.length} records, ${results.failed.length} failed`,
      ...results,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  initiatePayment,
  mtnCallback,
  airtelCallback,
  getPaymentStatus,
  listFinancials,
  syncOfflinePayments,
};
