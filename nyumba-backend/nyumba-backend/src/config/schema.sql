-- =============================================================
-- NYUMBA SMART — PostgreSQL Schema
-- Run this against your database once to set up all tables
-- =============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- USERS
-- =============================================================
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(200) NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  phone           VARCHAR(20) UNIQUE NOT NULL,   -- e.g. +256772112233
  password_hash   TEXT NOT NULL,
  role            VARCHAR(20) NOT NULL CHECK (role IN ('landlord', 'tenant', 'admin')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- =============================================================
-- LANDLORDS (extends users where role='landlord')
-- =============================================================
CREATE TABLE IF NOT EXISTS landlords (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  landlord_code    VARCHAR(20) UNIQUE NOT NULL,  -- e.g. LL-KARUMA
  units_count      INTEGER NOT NULL DEFAULT 0,
  subscription_id  UUID,                          -- FK added later
  trial_ends_at    TIMESTAMPTZ,
  momo_number      VARCHAR(20),                   -- landlord's payout MoMo
  bank_details     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_landlords_user_id ON landlords(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_landlords_code ON landlords(landlord_code);

-- =============================================================
-- TENANTS (extends users where role='tenant')
-- =============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  landlord_code VARCHAR(20) NOT NULL,    -- connects to landlords.landlord_code
  property_id   UUID,                    -- FK added after properties table
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenants_user_id      ON tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_landlord_code ON tenants(landlord_code);

-- =============================================================
-- PROPERTIES (rental units)
-- =============================================================
CREATE TABLE IF NOT EXISTS properties (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  landlord_id    UUID NOT NULL REFERENCES landlords(id) ON DELETE CASCADE,
  landlord_code  VARCHAR(20) NOT NULL,
  name           VARCHAR(300) NOT NULL,
  address        TEXT NOT NULL,
  tenant_name    VARCHAR(200),
  tenant_phone   VARCHAR(20),
  tenant_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  monthly_rent   BIGINT NOT NULL,       -- in UGX (no decimals for shillings)
  status         VARCHAR(20) NOT NULL DEFAULT 'Overdue'
                   CHECK (status IN ('Paid', 'Overdue', 'Partially Paid', 'Vacant')),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_properties_landlord_id ON properties(landlord_id);
CREATE INDEX IF NOT EXISTS idx_properties_landlord_code ON properties(landlord_code);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);

-- Now add the FK back to tenants
ALTER TABLE tenants
  ADD CONSTRAINT fk_tenants_property
  FOREIGN KEY (property_id)
  REFERENCES properties(id)
  ON DELETE SET NULL;

-- =============================================================
-- SUBSCRIPTION TIERS (admin-configurable)
-- =============================================================
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             VARCHAR(100) NOT NULL,
  min_units        INTEGER NOT NULL,
  max_units        INTEGER NOT NULL,
  price_per_month  BIGINT NOT NULL,   -- UGX
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (min_units <= max_units)
);

-- Seed default tiers from the frontend
INSERT INTO subscription_tiers (name, min_units, max_units, price_per_month) VALUES
  ('Free Trial Plan',          1,   3,      0),
  ('Standard Sanyu Level',     4,  10,  25000),
  ('Premium Plaza Level I',   11,  25,  45000),
  ('Premium Plaza Level II',  26,  50,  70000),
  ('Enterprise Mega Level I', 51, 150, 110000),
  ('Enterprise Mega Level II',151, 500, 180000)
ON CONFLICT DO NOTHING;

-- Add subscription FK to landlords
ALTER TABLE landlords
  ADD CONSTRAINT fk_landlords_subscription
  FOREIGN KEY (subscription_id)
  REFERENCES subscription_tiers(id)
  ON DELETE SET NULL;

-- =============================================================
-- FINANCIAL RECORDS (transactions ledger)
-- =============================================================
CREATE TABLE IF NOT EXISTS financial_records (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id         UUID REFERENCES properties(id) ON DELETE SET NULL,
  property_name       VARCHAR(300),              -- denormalized for receipts
  amount              BIGINT NOT NULL,            -- UGX
  transaction_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  type                VARCHAR(50) NOT NULL
                        CHECK (type IN ('Rent Payment', 'Maintenance Cost',
                                        'Subscription Fee', 'Message Billing')),
  provider            VARCHAR(50) NOT NULL
                        CHECK (provider IN ('MTN Mobile Money', 'Airtel Money',
                                            'Bank Transfer', 'System')),
  sender_phone_or_acc VARCHAR(100),
  receiver            VARCHAR(200),
  status              VARCHAR(30) NOT NULL DEFAULT 'Pending'
                        CHECK (status IN ('Cleared', 'Pending Push',
                                          'Pending Cloud Sync', 'Failed')),
  receipt_no          VARCHAR(100) UNIQUE,
  -- MoMo / payment gateway fields
  gateway_ref         VARCHAR(200),              -- MTN/Airtel transaction ID
  gateway_status      VARCHAR(50),              -- raw status from gateway
  gateway_payload     JSONB,                    -- full gateway response
  -- offline sync support
  is_offline_record   BOOLEAN NOT NULL DEFAULT FALSE,
  device_id           VARCHAR(100),
  synced_at           TIMESTAMPTZ,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_financial_property_id ON financial_records(property_id);
CREATE INDEX IF NOT EXISTS idx_financial_status      ON financial_records(status);
CREATE INDEX IF NOT EXISTS idx_financial_type        ON financial_records(type);
CREATE INDEX IF NOT EXISTS idx_financial_gateway_ref ON financial_records(gateway_ref);

-- =============================================================
-- COMPLAINTS / REPAIR TICKETS
-- =============================================================
CREATE TABLE IF NOT EXISTS complaints (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id  UUID REFERENCES properties(id) ON DELETE SET NULL,
  property_name VARCHAR(300),
  title        VARCHAR(500) NOT NULL,
  description  TEXT NOT NULL,
  category     VARCHAR(30) NOT NULL
                 CHECK (category IN ('Plumbing', 'Electricity', 'Water',
                                     'Rent Issue', 'Other')),
  status       VARCHAR(20) NOT NULL DEFAULT 'Received'
                 CHECK (status IN ('Received', 'In Progress', 'Settled')),
  priority     VARCHAR(10) NOT NULL DEFAULT 'Medium'
                 CHECK (priority IN ('Low', 'Medium', 'High')),
  raised_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  raised_by_name VARCHAR(200),
  resolved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  -- offline sync
  is_offline_record BOOLEAN NOT NULL DEFAULT FALSE,
  device_id    VARCHAR(100),
  synced_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_complaints_property_id ON complaints(property_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status      ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_raised_by   ON complaints(raised_by_id);

-- =============================================================
-- IN-APP MESSAGES
-- =============================================================
CREATE TABLE IF NOT EXISTS messages (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  landlord_code  VARCHAR(20) NOT NULL,
  tenant_phone   VARCHAR(20),              -- NULL = broadcast to all
  text           TEXT NOT NULL,
  sender_role    VARCHAR(20) NOT NULL CHECK (sender_role IN ('landlord', 'tenant', 'system')),
  sender_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  is_read        BOOLEAN NOT NULL DEFAULT FALSE,
  sms_sent       BOOLEAN NOT NULL DEFAULT FALSE,   -- whether SMS was dispatched
  sms_cost_ugx   INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_landlord_code ON messages(landlord_code);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_phone  ON messages(tenant_phone);

-- =============================================================
-- SMS BILLING LEDGER (tracks cumulative SMS costs per landlord)
-- =============================================================
CREATE TABLE IF NOT EXISTS sms_billing (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  landlord_id   UUID NOT NULL REFERENCES landlords(id) ON DELETE CASCADE,
  accrued_ugx   BIGINT NOT NULL DEFAULT 0,     -- running balance owed
  paid_ugx      BIGINT NOT NULL DEFAULT 0,     -- total paid so far
  last_paid_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_billing_landlord ON sms_billing(landlord_id);

-- =============================================================
-- AUDIT LOG (security & trace logs)
-- =============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(100) NOT NULL,
  entity     VARCHAR(100),
  entity_id  UUID,
  details    JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action  ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- =============================================================
-- REFRESH TOKENS
-- =============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  device_id   VARCHAR(100),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user   ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash   ON refresh_tokens(token_hash);

-- =============================================================
-- TRIGGERS — auto-update updated_at on row changes
-- =============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','landlords','tenants','properties',
    'subscription_tiers','financial_records','complaints'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;
