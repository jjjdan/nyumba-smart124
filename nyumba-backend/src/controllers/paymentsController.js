const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const paystackService = require('../services/paystackService');
const receiptService  = require('../services/receiptService');
const smsService      = require('../services/smsService');
const { encrypt, decrypt, maskSecret } = require('../utils/encryption');

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeReceiptNo(provider) {
  const prefix = {
    'MTN Mobile Money': 'MM',
    'Airtel Money':     'AM',
    'Bank Transfer':    'BK',
    'System':           'SYS',
  }[provider] || 'TX';
  return `${prefix}-TX-${Math.floor(100000 + Math.random() * 900000)}`;
}

async function getLandlordByUserId(userId) {
  const res = await query(
    `SELECT l.*, u.email as user_email, u.name as user_name, u.phone as user_phone
     FROM landlords l
     JOIN users u ON u.id = l.user_id
     WHERE l.user_id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}

/**
 * Resolve which Paystack secret to use:
 *  - Rent Payment → landlord's encrypted key
 *  - Platform fees → PAYSTACK_PLATFORM_SECRET_KEY
 */
async function resolveSecretForPayment({ type, landlordRow }) {
  if (type === 'Rent Payment') {
    if (!landlordRow?.paystack_secret_encrypted) {
      throw createError(
        'Your landlord has not connected Paystack yet. Ask them to add their secret key under Payment Settings.',
        422
      );
    }
    try {
      return {
        secretKey: decrypt(landlordRow.paystack_secret_encrypted),
        landlordId: landlordRow.id,
        keyOwner: 'landlord',
      };
    } catch (err) {
      throw createError('Could not unlock landlord Paystack key. Contact support.', 500);
    }
  }

  const platformKey = process.env.PAYSTACK_PLATFORM_SECRET_KEY;
  if (!platformKey) {
    throw createError('Platform Paystack key is not configured (PAYSTACK_PLATFORM_SECRET_KEY).', 503);
  }
  return {
    secretKey: platformKey,
    landlordId: landlordRow?.id || null,
    keyOwner: 'platform',
  };
}

/**
 * After a successful charge: mark paid, write PDF, notify landlord + tenant.
 */
async function finalizeSuccessfulPayment(client, record, gatewayPayload) {
  await client.query(
    `UPDATE financial_records
     SET status = 'Cleared',
         gateway_status = 'success',
         gateway_payload = $1,
         synced_at = NOW()
     WHERE id = $2`,
    [JSON.stringify(gatewayPayload || {}), record.id]
  );

  if (record.property_id) {
    await client.query(
      `UPDATE properties SET status = 'Paid' WHERE id = $1`,
      [record.property_id]
    );
  }

  let receiptPdf = null;
  try {
    const propRes = await client.query(
      `SELECT p.name, p.tenant_name, p.tenant_phone, p.landlord_code,
              l.user_id as landlord_user_id, u.phone as landlord_phone, u.name as landlord_name
       FROM properties p
       JOIN landlords l ON l.id = p.landlord_id
       JOIN users u ON u.id = l.user_id
       WHERE p.id = $1`,
      [record.property_id]
    );
    const prop = propRes.rows[0];

    if (prop) {
      const pdf = receiptService.generateRentReceipt({
        receiptNo: record.receipt_no,
        tenantName: prop.tenant_name,
        propertyName: prop.name || record.property_name,
        amountUGX: record.amount,
        provider: record.provider,
        landlordCode: prop.landlord_code,
        paidAt: new Date().toISOString(),
      });
      receiptPdf = pdf.relativePath;
      await client.query(
        `UPDATE financial_records SET receipt_pdf = $1 WHERE id = $2`,
        [receiptPdf, record.id]
      );

      // In-app system message for the landlord
      await client.query(
        `INSERT INTO messages (landlord_code, tenant_phone, text, sender_role, sender_id, sms_sent)
         VALUES ($1, NULL, $2, 'system', NULL, FALSE)`,
        [
          prop.landlord_code,
          `Tenant ${prop.tenant_name || 'a tenant'} just paid rent of UGX ${Number(record.amount).toLocaleString()} for ${prop.name}. Receipt ${record.receipt_no}.`,
        ]
      );

      // SMS confirmations (best-effort)
      try {
        if (prop.tenant_phone) {
          await smsService.sendPaymentConfirmation(
            prop.tenant_phone,
            prop.tenant_name,
            record.amount,
            record.receipt_no
          );
        }
      } catch (smsErr) {
        console.error('[SMS] Tenant confirmation failed:', smsErr.message);
      }

      try {
        if (prop.landlord_phone) {
          await smsService.sendLandlordPaymentAlert(
            prop.landlord_phone,
            prop.landlord_name,
            prop.tenant_name,
            record.amount,
            prop.name,
            record.receipt_no
          );
        }
      } catch (smsErr) {
        console.error('[SMS] Landlord alert failed:', smsErr.message);
      }
    }
  } catch (finalErr) {
    console.error('[Payments] finalize side-effects error:', finalErr.message);
  }

  return receiptPdf;
}

// ─── Phase 1: Payment Settings ─────────────────────────────────────────────

/**
 * GET /api/payments/settings
 * Landlord views whether Paystack is connected (never returns the raw key).
 */
async function getPaymentSettings(req, res, next) {
  try {
    const landlord = await getLandlordByUserId(req.user.id);
    if (!landlord) throw createError('Landlord profile not found', 404);

    res.json({
      connected: Boolean(landlord.paystack_secret_encrypted),
      keyHint: landlord.paystack_key_hint || null,
      connectedAt: landlord.paystack_connected_at || null,
      webhookUrl: `${process.env.PUBLIC_API_URL || ''}/api/payments/paystack/webhook`,
      note: 'Paste your personal Paystack Secret Key. Rent is charged into your Paystack account; Nyumba Smart never holds the money.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/payments/settings
 * Body: { secretKey: "sk_live_..." }
 * Encrypts and stores the landlord's Paystack secret key.
 */
async function updatePaymentSettings(req, res, next) {
  try {
    const { secretKey } = req.body;
    if (!secretKey || typeof secretKey !== 'string') {
      throw createError('secretKey is required', 400);
    }
    const trimmed = secretKey.trim();
    if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(trimmed)) {
      throw createError('Invalid Paystack secret key format (expected sk_test_… or sk_live_…)', 400);
    }

    const landlord = await getLandlordByUserId(req.user.id);
    if (!landlord) throw createError('Landlord profile not found', 404);

    let encrypted;
    try {
      encrypted = encrypt(trimmed);
    } catch (encErr) {
      throw createError(`Encryption failed: ${encErr.message}`, 500);
    }

    const hint = maskSecret(trimmed);
    await query(
      `UPDATE landlords
       SET paystack_secret_encrypted = $1,
           paystack_key_hint = $2,
           paystack_connected_at = NOW()
       WHERE id = $3`,
      [encrypted, hint, landlord.id]
    );

    res.json({
      message: 'Paystack secret key saved securely.',
      connected: true,
      keyHint: hint,
      connectedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/payments/settings
 * Disconnects Paystack (wipes encrypted key).
 */
async function deletePaymentSettings(req, res, next) {
  try {
    const landlord = await getLandlordByUserId(req.user.id);
    if (!landlord) throw createError('Landlord profile not found', 404);

    await query(
      `UPDATE landlords
       SET paystack_secret_encrypted = NULL,
           paystack_key_hint = NULL,
           paystack_connected_at = NULL
       WHERE id = $1`,
      [landlord.id]
    );

    res.json({ message: 'Paystack disconnected.', connected: false });
  } catch (err) {
    next(err);
  }
}

// ─── Phase 2: Checkout ─────────────────────────────────────────────────────

/**
 * POST /api/payments/initiate
 * Decrypts landlord (or platform) key in memory → Paystack charge/initialize.
 */
async function initiatePayment(req, res, next) {
  try {
    const { propertyId, provider, senderPhone, type = 'Rent Payment', offlineRecord = false } = req.body;
    const { user } = req;

    let property = null;
    let landlordRow = null;

    if (type === 'Rent Payment') {
      const propRes = await query(
        `SELECT p.*, l.id as landlord_row_id, l.user_id as landlord_user_id,
                l.landlord_code, l.paystack_secret_encrypted
         FROM properties p
         JOIN landlords l ON l.id = p.landlord_id
         WHERE p.id = $1 AND p.is_active = TRUE`,
        [propertyId]
      );
      if (!propRes.rows.length) throw createError('Property not found', 404);
      property = propRes.rows[0];
      landlordRow = {
        id: property.landlord_row_id,
        paystack_secret_encrypted: property.paystack_secret_encrypted,
        landlord_code: property.landlord_code,
      };

      if (property.status === 'Paid') {
        throw createError('Rent is already paid for this property this month', 409);
      }
    } else {
      // Platform fee — resolve paying landlord for ledger linkage
      landlordRow = await getLandlordByUserId(user.id);
    }

    const amount = property ? property.monthly_rent : req.body.amount;
    if (!amount || amount <= 0) throw createError('Invalid payment amount', 400);

    const receiptNo = makeReceiptNo(provider);
    const externalRef = uuidv4();
    const phone = (senderPhone || user.phone).replace(/\s+/g, '');

    const recordRes = await query(
      `INSERT INTO financial_records
         (id, property_id, landlord_id, property_name, amount, type, provider,
          sender_phone_or_acc, receiver, status, receipt_no,
          is_offline_record, device_id, created_by, paystack_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Pending Push', $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        externalRef,
        propertyId || null,
        landlordRow?.id || null,
        property?.name || 'Platform Fee',
        amount,
        type,
        provider,
        phone,
        property ? property.landlord_code : 'NYUMBA SMART LTD',
        receiptNo,
        offlineRecord,
        req.body.deviceId || null,
        user.id,
        externalRef,
      ]
    );
    const record = recordRes.rows[0];

    if (offlineRecord) {
      return res.status(202).json({
        message: 'Payment queued offline. Will sync when online.',
        transactionId: record.id,
        receiptNo,
        status: 'Pending Push',
      });
    }

    const { secretKey } = await resolveSecretForPayment({ type, landlordRow });

    let gateway;
    try {
      gateway = await paystackService.initiatePayment({
        secretKey,
        provider,
        email: user.email,
        phone,
        amountUGX: amount,
        reference: externalRef,
        metadata: {
          financial_record_id: record.id,
          property_id: propertyId || null,
          type,
          receipt_no: receiptNo,
          landlord_id: landlordRow?.id || null,
        },
        callbackUrl: process.env.PAYSTACK_CALLBACK_URL || undefined,
      });
    } catch (gwErr) {
      await query(
        `UPDATE financial_records SET status = 'Failed', gateway_status = $1 WHERE id = $2`,
        [gwErr.message, record.id]
      );
      throw createError(`Paystack error: ${gwErr.message}`, 502);
    }

    await query(
      `UPDATE financial_records
       SET gateway_ref = $1, paystack_ref = $2, gateway_status = $3, gateway_payload = $4
       WHERE id = $5`,
      [
        gateway.gatewayRef,
        gateway.reference || externalRef,
        gateway.status || 'PENDING',
        JSON.stringify(gateway.raw || {}),
        record.id,
      ]
    );

    res.status(202).json({
      message: provider === 'Bank Transfer'
        ? 'Bank payment initialized. Complete the transfer via the authorization URL / instructions.'
        : 'Payment push sent via Paystack. Approve the MTN/Airtel prompt on your phone.',
      transactionId: record.id,
      gatewayRef: gateway.gatewayRef,
      authorizationUrl: gateway.authorizationUrl || null,
      displayText: gateway.displayText || null,
      receiptNo,
      status: 'Pending Push',
    });
  } catch (err) {
    next(err);
  }
}

// ─── Phase 3: Webhook Confirmation ─────────────────────────────────────────

/**
 * POST /api/payments/paystack/webhook
 * Verify signature with the landlord's (or platform) secret, then mark Paid.
 * Requires req.rawBody (Buffer) set by express.json verify hook in server.js.
 */
async function paystackWebhook(req, res, next) {
  try {
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.rawBody;
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const reference =
      event?.data?.reference ||
      event?.data?.id ||
      null;

    if (!reference) {
      return res.status(200).json({ received: true, ignored: 'no reference' });
    }

    const recordRes = await query(
      `SELECT fr.*, l.paystack_secret_encrypted, l.id as landlord_row_id
       FROM financial_records fr
       LEFT JOIN landlords l ON l.id = fr.landlord_id
       WHERE fr.paystack_ref = $1 OR fr.gateway_ref = $1 OR fr.id::text = $1`,
      [String(reference)]
    );

    if (!recordRes.rows.length) {
      return res.status(200).json({ received: true, ignored: 'unknown reference' });
    }

    const record = recordRes.rows[0];

    // Pick the secret that owns this transaction
    let secretKey = null;
    if (record.type === 'Rent Payment' && record.paystack_secret_encrypted) {
      try {
        secretKey = decrypt(record.paystack_secret_encrypted);
      } catch (e) {
        console.error('[Webhook] decrypt failed:', e.message);
        return res.status(400).json({ error: 'Cannot verify webhook' });
      }
    } else {
      secretKey = process.env.PAYSTACK_PLATFORM_SECRET_KEY;
    }

    if (!secretKey) {
      return res.status(400).json({ error: 'No key available to verify webhook' });
    }

    const valid = paystackService.verifyWebhookSignature(
      secretKey,
      rawBody || JSON.stringify(event),
      signature
    );
    if (!valid) {
      console.warn('[Webhook] Invalid Paystack signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const eventName = event.event || '';
    const dataStatus = event.data?.status;
    const isSuccess =
      eventName === 'charge.success' ||
      eventName === 'transaction.success' ||
      dataStatus === 'success';

    if (record.status === 'Cleared') {
      return res.status(200).json({ received: true, already: 'cleared' });
    }

    if (isSuccess) {
      await withTransaction(async (client) => {
        await finalizeSuccessfulPayment(client, record, event);
      });
    } else if (
      eventName === 'charge.failed' ||
      dataStatus === 'failed' ||
      dataStatus === 'abandoned'
    ) {
      await query(
        `UPDATE financial_records
         SET status = 'Failed', gateway_status = $1, gateway_payload = $2, synced_at = NOW()
         WHERE id = $3`,
        [dataStatus || eventName, JSON.stringify(event), record.id]
      );
    }

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
}

// ─── Status Poll (fallback if webhook is slow) ─────────────────────────────

async function getPaymentStatus(req, res, next) {
  try {
    const { transactionId } = req.params;

    const result = await query(
      `SELECT fr.id, fr.status, fr.gateway_status, fr.gateway_ref, fr.paystack_ref,
              fr.receipt_no, fr.amount, fr.provider, fr.property_id, fr.type,
              fr.receipt_pdf, fr.updated_at, fr.landlord_id,
              l.paystack_secret_encrypted
       FROM financial_records fr
       LEFT JOIN landlords l ON l.id = fr.landlord_id
       WHERE fr.id = $1`,
      [transactionId]
    );
    if (!result.rows.length) throw createError('Transaction not found', 404);
    const record = result.rows[0];

    if (
      (record.status === 'Pending Push' || record.gateway_status === 'PENDING' ||
        record.gateway_status === 'pay_offline' || record.gateway_status === 'pending') &&
      (record.paystack_ref || record.gateway_ref)
    ) {
      try {
        let secretKey;
        if (record.type === 'Rent Payment' && record.paystack_secret_encrypted) {
          secretKey = decrypt(record.paystack_secret_encrypted);
        } else {
          secretKey = process.env.PAYSTACK_PLATFORM_SECRET_KEY;
        }

        if (secretKey) {
          const verified = await paystackService.verifyTransaction(
            secretKey,
            record.paystack_ref || record.gateway_ref
          );

          if (verified.status === 'SUCCESSFUL') {
            await withTransaction(async (client) => {
              await finalizeSuccessfulPayment(client, record, verified.raw);
            });
            record.status = 'Cleared';
            record.gateway_status = 'success';
          } else if (verified.status === 'FAILED') {
            await query(
              `UPDATE financial_records
               SET status = 'Failed', gateway_status = $1, gateway_payload = $2, synced_at = NOW()
               WHERE id = $3`,
              [verified.status, JSON.stringify(verified.raw), record.id]
            );
            record.status = 'Failed';
            record.gateway_status = verified.status;
          }
        }
      } catch (pollErr) {
        console.error('[Poll] Paystack verify error:', pollErr.message);
      }
    }

    res.json({
      transaction: {
        id: record.id,
        status: record.status,
        gateway_status: record.gateway_status,
        receipt_no: record.receipt_no,
        amount: record.amount,
        provider: record.provider,
        property_id: record.property_id,
        receipt_pdf: record.receipt_pdf,
        updated_at: record.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── List / Offline Sync (unchanged behaviour) ─────────────────────────────

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

        if (rec.propertyId && rec.type === 'Rent Payment') {
          await query(`UPDATE properties SET status = 'Paid' WHERE id = $1`, [rec.propertyId]);
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
  getPaymentSettings,
  updatePaymentSettings,
  deletePaymentSettings,
  initiatePayment,
  paystackWebhook,
  getPaymentStatus,
  listFinancials,
  syncOfflinePayments,
};
