/**
 * NYUMBA SMART — Mobile Money Payment Service
 * Supports MTN MoMo Uganda and Airtel Money Uganda
 *
 * MTN Docs:  https://momodeveloper.mtn.com/docs/services/collection
 * Airtel Docs: https://developers.airtel.africa/documentation
 */

const { v4: uuidv4 } = require('uuid');

// ─── MTN MoMo Uganda ──────────────────────────────────────────────────────

async function mtnGetToken() {
  const credentials = Buffer.from(
    `${process.env.MTN_MOMO_COLLECTION_API_USER}:${process.env.MTN_MOMO_COLLECTION_API_KEY}`
  ).toString('base64');

  const response = await fetch(
    `${process.env.MTN_MOMO_BASE_URL}/collection/token/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Ocp-Apim-Subscription-Key': process.env.MTN_MOMO_COLLECTION_PRIMARY_KEY,
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`MTN token fetch failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Initiates a MoMo Collection (pull payment request).
 * The customer receives a USSD push on their phone to approve.
 *
 * @param {string} phoneNumber  - e.g. "256772112233" (no + prefix for MTN)
 * @param {number} amountUGX
 * @param {string} externalRef  - our internal transaction ID
 * @param {string} description  - shown to customer on USSD prompt
 * @returns {{ referenceId: string }} - use this to poll status
 */
async function mtnRequestToPay(phoneNumber, amountUGX, externalRef, description) {
  const referenceId = uuidv4();
  const token = await mtnGetToken();

  // MTN expects phone without leading +
  const msisdn = phoneNumber.replace(/^\+/, '').replace(/\s+/g, '');

  const body = {
    amount: String(amountUGX),
    currency: 'UGX',
    externalId: externalRef,
    payer: {
      partyIdType: 'MSISDN',
      partyId: msisdn,
    },
    payerMessage: description,
    payeeNote: `Nyumba Smart: ${description}`,
  };

  const response = await fetch(
    `${process.env.MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': referenceId,
        'X-Target-Environment': process.env.MTN_MOMO_ENVIRONMENT || 'sandbox',
        'X-Callback-Url': process.env.MTN_MOMO_CALLBACK_URL,
        'Ocp-Apim-Subscription-Key': process.env.MTN_MOMO_COLLECTION_PRIMARY_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (response.status !== 202) {
    const errBody = await response.text();
    throw new Error(`MTN requestToPay failed (${response.status}): ${errBody}`);
  }

  return { referenceId };
}

/**
 * Polls the status of an MTN MoMo payment.
 * Status values: PENDING | SUCCESSFUL | FAILED
 */
async function mtnGetPaymentStatus(referenceId) {
  const token = await mtnGetToken();

  const response = await fetch(
    `${process.env.MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Target-Environment': process.env.MTN_MOMO_ENVIRONMENT || 'sandbox',
        'Ocp-Apim-Subscription-Key': process.env.MTN_MOMO_COLLECTION_PRIMARY_KEY,
      },
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`MTN status check failed (${response.status}): ${errBody}`);
  }

  return await response.json();
}

// ─── Airtel Money Uganda ───────────────────────────────────────────────────

let airtelTokenCache = null;
let airtelTokenExpiry = 0;

async function airtelGetToken() {
  if (airtelTokenCache && Date.now() < airtelTokenExpiry) {
    return airtelTokenCache;
  }

  const response = await fetch(
    `${process.env.AIRTEL_MONEY_BASE_URL}/auth/oauth2/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.AIRTEL_MONEY_CLIENT_ID,
        client_secret: process.env.AIRTEL_MONEY_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Airtel token fetch failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  airtelTokenCache = data.access_token;
  // Expire 60 seconds early to avoid edge cases
  airtelTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  return airtelTokenCache;
}

/**
 * Initiates an Airtel Money payment collection.
 *
 * @param {string} phoneNumber  - e.g. "+256752989898"
 * @param {number} amountUGX
 * @param {string} externalRef  - our internal transaction ID
 * @param {string} description
 * @returns {{ transactionId: string }}
 */
async function airtelRequestToPay(phoneNumber, amountUGX, externalRef, description) {
  const token = await airtelGetToken();
  const msisdn = phoneNumber.replace(/^\+/, '').replace(/\s+/g, '');

  const body = {
    reference: description,
    subscriber: {
      country: 'UG',
      currency: 'UGX',
      msisdn,
    },
    transaction: {
      amount: amountUGX,
      country: 'UG',
      currency: 'UGX',
      id: externalRef,
    },
  };

  const response = await fetch(
    `${process.env.AIRTEL_MONEY_BASE_URL}/merchant/v2/payments/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Country': 'UG',
        'X-Currency': 'UGX',
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (!response.ok || data.status?.code !== '200') {
    throw new Error(
      `Airtel payment failed (${response.status}): ${JSON.stringify(data)}`
    );
  }

  return { transactionId: data.data?.transaction?.id || externalRef };
}

/**
 * Polls the status of an Airtel Money payment.
 */
async function airtelGetPaymentStatus(transactionId) {
  const token = await airtelGetToken();

  const response = await fetch(
    `${process.env.AIRTEL_MONEY_BASE_URL}/standard/v1/payments/${transactionId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Country': 'UG',
        'X-Currency': 'UGX',
      },
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Airtel status check failed (${response.status}): ${errBody}`);
  }

  return await response.json();
}

// ─── Unified entry point ───────────────────────────────────────────────────

/**
 * Initiates a payment request via the specified provider.
 *
 * @param {'MTN Mobile Money'|'Airtel Money'} provider
 * @param {string} phoneNumber
 * @param {number} amountUGX
 * @param {string} externalRef   - our DB transaction ID
 * @param {string} description
 * @returns {{ gatewayRef: string }}
 */
async function initiatePayment(provider, phoneNumber, amountUGX, externalRef, description) {
  if (provider === 'MTN Mobile Money') {
    const { referenceId } = await mtnRequestToPay(phoneNumber, amountUGX, externalRef, description);
    return { gatewayRef: referenceId };
  }

  if (provider === 'Airtel Money') {
    const { transactionId } = await airtelRequestToPay(phoneNumber, amountUGX, externalRef, description);
    return { gatewayRef: transactionId };
  }

  throw new Error(`Unsupported payment provider: ${provider}`);
}

/**
 * Checks payment status from the gateway.
 * Returns a normalised status: 'PENDING' | 'SUCCESSFUL' | 'FAILED'
 */
async function checkPaymentStatus(provider, gatewayRef) {
  if (provider === 'MTN Mobile Money') {
    const data = await mtnGetPaymentStatus(gatewayRef);
    const statusMap = { PENDING: 'PENDING', SUCCESSFUL: 'SUCCESSFUL', FAILED: 'FAILED' };
    return {
      status: statusMap[data.status] || 'PENDING',
      raw: data,
    };
  }

  if (provider === 'Airtel Money') {
    const data = await airtelGetPaymentStatus(gatewayRef);
    const code = data.data?.transaction?.status;
    const statusMap = { TS: 'SUCCESSFUL', TF: 'FAILED', TP: 'PENDING' };
    return {
      status: statusMap[code] || 'PENDING',
      raw: data,
    };
  }

  throw new Error(`Unsupported provider for status check: ${provider}`);
}

module.exports = {
  initiatePayment,
  checkPaymentStatus,
  mtnGetPaymentStatus,
  airtelGetPaymentStatus,
};
