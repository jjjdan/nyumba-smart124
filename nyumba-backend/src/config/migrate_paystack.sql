-- =============================================================
-- Migration: Landlord-owned Paystack keys + receipt PDF path
-- Run once against an existing database:
--   psql $DATABASE_URL -f src/config/migrate_paystack.sql
-- =============================================================

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS paystack_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS paystack_key_hint         VARCHAR(40),
  ADD COLUMN IF NOT EXISTS paystack_connected_at     TIMESTAMPTZ;

ALTER TABLE financial_records
  ADD COLUMN IF NOT EXISTS landlord_id   UUID REFERENCES landlords(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receipt_pdf   TEXT,
  ADD COLUMN IF NOT EXISTS paystack_ref  VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_financial_landlord_id ON financial_records(landlord_id);
CREATE INDEX IF NOT EXISTS idx_financial_paystack_ref ON financial_records(paystack_ref);
