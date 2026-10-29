/**
 * Creates (or updates) the platform admin account from env vars:
 *   ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_PASSWORD
 *
 * Run with: node src/config/seedAdmin.js
 * Safe to re-run — it upserts the admin account.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, getPool } = require('./database');

async function seedAdmin() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    console.error('❌ Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD in .env first.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ ADMIN_BOOTSTRAP_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);

  if (existing.rows.length) {
    await query(
      `UPDATE users SET password_hash = $1, role = 'admin', is_active = TRUE, is_verified = TRUE
       WHERE email = $2`,
      [passwordHash, email.toLowerCase()]
    );
    console.log(`✅ Updated existing admin account: ${email}`);
  } else {
    await query(
      `INSERT INTO users (name, email, phone, password_hash, role, is_verified)
       VALUES ('Nyumba Smart Admin', $1, '+256700000000', $2, 'admin', TRUE)`,
      [email.toLowerCase(), passwordHash]
    );
    console.log(`✅ Created admin account: ${email}`);
  }

  console.log('   Log in via the Admin tab using this email and password.');
  await getPool().end();
}

seedAdmin().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
