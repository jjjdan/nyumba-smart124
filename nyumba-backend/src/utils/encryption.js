/**
 * AES-256-GCM helpers for encrypting landlord Paystack secret keys at rest.
 * Requires ENCRYPTION_KEY env — 32-byte key as 64 hex chars or any passphrase
 * which is hashed with SHA-256 into a 32-byte key.
 */
const crypto = require('crypto');

function resolveKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      'ENCRYPTION_KEY is not set or too short. Set a long random secret (64 hex chars recommended).'
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * @param {string} plaintext
 * @returns {string} base64(iv|tag|ciphertext)
 */
function encrypt(plaintext) {
  if (typeof plaintext !== 'string' || !plaintext) {
    throw new Error('Nothing to encrypt');
  }
  const key = resolveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * @param {string} payload - value from encrypt()
 * @returns {string} plaintext
 */
function decrypt(payload) {
  if (typeof payload !== 'string' || !payload) {
    throw new Error('Nothing to decrypt');
  }
  const key = resolveKey();
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 28) throw new Error('Invalid encrypted payload');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * Mask a secret key for UI display: sk_live_••••••••abcd
 */
function maskSecret(secret) {
  if (!secret || secret.length < 8) return '••••••••';
  const start = secret.slice(0, 8);
  const end = secret.slice(-4);
  return `${start}${'•'.repeat(12)}${end}`;
}

module.exports = { encrypt, decrypt, maskSecret };
