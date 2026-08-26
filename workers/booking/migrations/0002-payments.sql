-- Prepayment support.
--
-- Payment is off by default: `payment_mode` stays 'off' until there is a real
-- Stripe account for Inês. With it off, every booking is confirmed on creation
-- exactly as before and none of these columns are read.

ALTER TABLE bookings ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE bookings ADD COLUMN amount_cents INTEGER;
ALTER TABLE bookings ADD COLUMN stripe_session_id TEXT;
ALTER TABLE bookings ADD COLUMN stripe_payment_intent TEXT;
-- A slot held for an unpaid booking is released after this instant, so an
-- abandoned checkout cannot silently keep a time off the calendar.
ALTER TABLE bookings ADD COLUMN hold_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings (stripe_session_id);

-- Stripe delivers webhooks at least once. This is what makes handling them
-- exactly once: the insert fails on a repeat, and the handler stops.
CREATE TABLE IF NOT EXISTS stripe_events (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

INSERT OR REPLACE INTO settings (key, value) VALUES ('payment_mode', 'off');
