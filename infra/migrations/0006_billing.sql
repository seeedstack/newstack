-- PAYPAL_SPEC.md §6 (Data model), adapted: gateway is PayPal, not Razorpay.
-- All money stored as integer paise (PAYPAL_SPEC §2: ₹60 = 6000, ₹360 = 36000).

CREATE TABLE plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  amount_paise   INT  NOT NULL CHECK (amount_paise > 0),
  interval       TEXT NOT NULL CHECK (interval IN ('month','year')),
  gateway_plan_id TEXT,              -- PayPal billing plan id, filled in once created at the gateway
  active         BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO plans (code, name, amount_paise, interval) VALUES
  ('monthly_60', 'Monthly', 6000, 'month'),
  ('annual_360', 'Annual', 36000, 'year');

CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id               UUID NOT NULL REFERENCES plans(id),
  status                TEXT NOT NULL CHECK (status IN
                          ('incomplete','trialing','active','past_due','canceled','expired')),
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT false,
  grace_until           TIMESTAMPTZ,
  gateway               TEXT NOT NULL DEFAULT 'paypal',
  gateway_sub_id        TEXT UNIQUE,      -- PayPal subscription id (I-xxx), or order id for one-time annual
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
-- Entitlement rule (PAYPAL_SPEC §6) reads active/past_due/canceled subscriptions per user;
-- expiry sweep scans for past_due rows whose grace has elapsed.
CREATE INDEX idx_subscriptions_grace ON subscriptions(grace_until) WHERE status = 'past_due';

CREATE TABLE payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id    UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_paise       INT NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'INR',
  status             TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','refunded','partially_refunded')),
  gateway_payment_id TEXT UNIQUE,         -- PayPal capture id
  method             TEXT,
  failure_reason     TEXT,
  invoice_number     TEXT UNIQUE,
  paid_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_user ON payments(user_id, created_at DESC);
CREATE INDEX idx_payments_subscription ON payments(subscription_id);

-- Sequential invoice numbers (PAYPAL_SPEC §4.11): one counter, gapless per calendar year.
CREATE TABLE invoice_counters (
  year    INT PRIMARY KEY,
  next_seq INT NOT NULL DEFAULT 1
);

CREATE TABLE refunds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  amount_paise     INT NOT NULL CHECK (amount_paise > 0),
  gateway_refund_id TEXT UNIQUE,
  reason           TEXT,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Webhook dedupe (PAYPAL_SPEC §7): unique on (gateway, gateway_event_id); a duplicate delivery
-- is a no-op, never a failure.
CREATE TABLE webhook_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway           TEXT NOT NULL,
  gateway_event_id  TEXT NOT NULL,
  type              TEXT NOT NULL,
  payload           JSONB NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ,
  error             TEXT,
  UNIQUE (gateway, gateway_event_id)
);

-- Billing admin actions (extend/revoke/refund) get their own audit trail, mirroring
-- auth_events' shape — separate from auth_events since the event vocabulary and target
-- type (subscription, not user auth) differ.
CREATE TABLE billing_audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    UUID NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL CHECK (action IN
                ('manual_extend','manual_revoke','refund_issued','plan_changed','subscription_canceled','subscription_resumed')),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Billing transactional emails: a separate outbox from email_outbox (PAYPAL_SPEC §4.10) since
-- these carry structured context (amount, plan, renewal date) that auth's token-only outbox
-- row shape has no column for; same claim/backoff pattern as mailer/repo.ts's outbox.
CREATE TABLE billing_email_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN
                    ('receipt','renewal_reminder','payment_failed','canceled','expired','refund_processed')),
  context         JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);
CREATE INDEX idx_billing_email_outbox_due ON billing_email_outbox(next_attempt_at) WHERE status = 'pending';

-- Admin panel access (PAYPAL_SPEC §4.12): a handful of internal staff, same complexity-budget
-- call as curatorPlugin's shared-secret header — a users.is_admin flag, not a roles table.
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
