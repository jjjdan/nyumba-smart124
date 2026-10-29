/**
 * NYUMBA SMART — Paystack payment service
 *
 * Every API call uses the landlord's (or platform's) secret key in
 * Authorization — never a shared app-level collection key for rent.
 *
 * Docs: https://paystack.com/docs/api/
 */

const PAYSTACK_BASE = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';

/** UGX → Paystack minor units (×100, consistent with Paystack subunit convention). */
function toMinorUnits(amountUGX) {
  return Math.round(Number(amountUGX) * 100);
}

function providerCode(provider) {
  if (provider === 'MTN Mobile Money') return 'mtn';
  if (provider === 'Airtel Money') return 'airtel';
  return null;
}

/**
 * Normalise Uganda phone to digits only, country code included (256…).
 */
function normaliseMsisdn(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    digits = `256${digits.slice(1)}`;
  }
  if (!digits.startsWith('256') && digits.length === 9) {
    digits = `256${digits}`;
  }
  return digits;
}

async function paystackFetch(secretKey, path, options = {}) {
  const response = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    const text = await response.text();
    throw new Error(`Paystack returned non-JSON (${response.status}): ${text}`);
  }

  if (!response.ok || data.status === false) {
    throw new Error(data.message || `Paystack error (${response.status})`);
  }

  return data;
}

/**
 * Charge mobile money (STK / USSD push) via Paystack Charge API.
 * Money settles into the Paystack account that owns `secretKey`.
 *
 * @returns {{ reference: string, gatewayRef: string, displayText?: string, status: string, raw: object }}
 */
async function chargeMobileMoney({
  secretKey,
  email,
  amountUGX,
  phone,
  provider,
  reference,
  metadata = {},
}) {
  const code = providerCode(provider);
  if (!code) throw new Error(`Unsupported mobile money provider: ${provider}`);

  const body = {
    email: email || `tenant+${reference}@nyumbasmart.local`,
    amount: toMinorUnits(amountUGX),
    currency: 'UGX',
    reference,
    metadata,
    mobile_money: {
      phone: normaliseMsisdn(phone),
      provider: code,
    },
  };

  const data = await paystackFetch(secretKey, '/charge', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    reference: data.data?.reference || reference,
    gatewayRef: String(data.data?.reference || data.data?.id || reference),
    displayText: data.data?.display_text || data.data?.display_text,
    status: data.data?.status || 'pending',
    raw: data,
  };
}

/**
 * Initialize a Paystack transaction (hosted / bank channels).
 * Used for Bank Transfer and as a fallback path.
 *
 * @returns {{ reference: string, gatewayRef: string, authorizationUrl?: string, accessCode?: string, raw: object }}
 */
async function initializeTransaction({
  secretKey,
  email,
  amountUGX,
  reference,
  channels = ['mobile_money', 'bank', 'card'],
  metadata = {},
  callbackUrl,
}) {
  const body = {
    email: email || `payer+${reference}@nyumbasmart.local`,
    amount: toMinorUnits(amountUGX),
    currency: 'UGX',
    reference,
    channels,
    metadata,
  };
  if (callbackUrl) body.callback_url = callbackUrl;

  const data = await paystackFetch(secretKey, '/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    reference: data.data?.reference || reference,
    gatewayRef: data.data?.reference || reference,
    authorizationUrl: data.data?.authorization_url,
    accessCode: data.data?.access_code,
    raw: data,
  };
}

/**
 * Unified rent/platform payment entry.
 * MoMo → Charge (STK push). Bank → Initialize (customer completes transfer).
 */
async function initiatePayment({
  secretKey,
  provider,
  email,
  phone,
  amountUGX,
  reference,
  metadata = {},
  callbackUrl,
}) {
  if (provider === 'MTN Mobile Money' || provider === 'Airtel Money') {
    return chargeMobileMoney({
      secretKey,
      email,
      amountUGX,
      phone,
      provider,
      reference,
      metadata,
    });
  }

  if (provider === 'Bank Transfer') {
    return initializeTransaction({
      secretKey,
      email,
      amountUGX,
      reference,
      channels: ['bank_transfer', 'bank'],
      metadata,
      callbackUrl,
    });
  }

  throw new Error(`Unsupported payment provider: ${provider}`);
}

/**
 * Verify transaction by reference using the same secret key that received funds.
 */
async function verifyTransaction(secretKey, reference) {
  const data = await paystackFetch(secretKey, `/transaction/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
  });

  const status = data.data?.status; // success | failed | abandoned | ...
  let normalised = 'PENDING';
  if (status === 'success') normalised = 'SUCCESSFUL';
  else if (status === 'failed' || status === 'abandoned' || status === 'reversed') normalised = 'FAILED';

  return {
    status: normalised,
    amountMinor: data.data?.amount,
    paidAt: data.data?.paid_at,
    channel: data.data?.channel,
    raw: data,
  };
}

/**
 * Verify Paystack webhook signature (HMAC SHA512 of raw body with secret key).
 */
function verifyWebhookSignature(secretKey, rawBody, signatureHeader) {
  if (!secretKey || !signatureHeader || !rawBody) return false;
  const crypto = require('crypto');
  const hash = crypto
    .createHmac('sha512', secretKey)
    .update(typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody))
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(String(signatureHeader)));
  } catch {
    return false;
  }
}

module.exports = {
  initiatePayment,
  initializeTransaction,
  chargeMobileMoney,
  verifyTransaction,
  verifyWebhookSignature,
  toMinorUnits,
  normaliseMsisdn,
  providerCode,
};
