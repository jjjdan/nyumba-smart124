/**
 * NYUMBA SMART — SMS Service via Africa's Talking (Uganda)
 * Docs: https://africastalking.com/sms
 *
 * AT_SMS_RATE_UGX should be set to 150 in .env (Shs 150 per outbound SMS)
 */

const SMS_RATE_UGX = parseInt(process.env.AT_SMS_RATE_UGX || '150', 10);
const LOCAL_ONLY_MESSAGING = process.env.LOCAL_ONLY_MESSAGING !== 'false';

/**
 * Sends one or more SMS messages via Africa's Talking.
 *
 * @param {string|string[]} recipients - E.164 Uganda numbers e.g. "+256772112233"
 * @param {string}          message    - SMS body text
 * @returns {{ sent: number, cost: number, results: Array }}
 */
async function sendSms(recipients, message) {
  const numbers = Array.isArray(recipients) ? recipients : [recipients];

  if (LOCAL_ONLY_MESSAGING) {
    return {
      sent: numbers.length,
      cost: 0,
      results: numbers.map(phone => ({ number: phone, status: 'LocalOnly' })),
    };
  }

  // AT API is form-encoded
  const params = new URLSearchParams({
    username: process.env.AT_USERNAME || 'sandbox',
    to:       numbers.join(','),
    message,
    from:     process.env.AT_SENDER_ID || 'NYUMBA',
  });

  const response = await fetch(
    'https://api.africastalking.com/version1/messaging',
    {
      method: 'POST',
      headers: {
        apiKey: process.env.AT_API_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`AT SMS send failed (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const results = data.SMSMessageData?.Recipients || [];
  const sent = results.filter(r => r.status === 'Success').length;

  return {
    sent,
    cost: sent * SMS_RATE_UGX,   // What we bill the landlord in UGX
    results,
  };
}

/**
 * Sends a rent-overdue reminder to a single tenant.
 */
async function sendOverdueReminder(tenantPhone, tenantName, propertyName, amountUGX) {
  const message =
    `Dear ${tenantName}, your rent of UGX ${amountUGX.toLocaleString()} ` +
    `for ${propertyName} is overdue. ` +
    `Please pay via MTN MoMo or Airtel Money. - Nyumba Smart`;

  return sendSms(tenantPhone, message);
}

/**
 * Sends a custom broadcast message from a landlord to all their tenants.
 */
async function sendBroadcast(tenantPhones, message) {
  if (!tenantPhones.length) return { sent: 0, cost: 0, results: [] };
  return sendSms(tenantPhones, message);
}

/**
 * Sends a payment confirmation SMS to the tenant.
 */
async function sendPaymentConfirmation(tenantPhone, tenantName, amountUGX, receiptNo) {
  const message =
    `Hi ${tenantName}, your rent payment of UGX ${amountUGX.toLocaleString()} ` +
    `has been received. Receipt: ${receiptNo}. Thank you - Nyumba Smart`;

  return sendSms(tenantPhone, message);
}

/**
 * Notify landlord that a tenant just paid rent into their Paystack account.
 */
async function sendLandlordPaymentAlert(
  landlordPhone,
  landlordName,
  tenantName,
  amountUGX,
  propertyName,
  receiptNo
) {
  const message =
    `Hi ${landlordName || 'Landlord'}, tenant ${tenantName || 'a tenant'} just paid ` +
    `UGX ${Number(amountUGX).toLocaleString()} rent for ${propertyName || 'their unit'}. ` +
    `Receipt ${receiptNo}. Funds are in your Paystack account. - Nyumba Smart`;

  return sendSms(landlordPhone, message);
}

module.exports = {
  sendSms,
  sendOverdueReminder,
  sendBroadcast,
  sendPaymentConfirmation,
  sendLandlordPaymentAlert,
};
