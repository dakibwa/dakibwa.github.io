CREATE TABLE IF NOT EXISTS student_recurring_rates (
  student_id TEXT NOT NULL REFERENCES students(id),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (60, 90)),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  redeemed_at TEXT NOT NULL,
  PRIMARY KEY (student_id, duration_minutes)
);
CREATE TABLE IF NOT EXISTS request_limits (
  key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
ALTER TABLE students ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN charge_started_at TEXT;
ALTER TABLE bookings ADD COLUMN same_day_fee_started_at TEXT;
CREATE TABLE IF NOT EXISTS revoked_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
