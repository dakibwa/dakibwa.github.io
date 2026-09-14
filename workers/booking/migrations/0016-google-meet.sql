-- Additive and opt-in: no existing lesson/payment state is changed.
ALTER TABLE bookings ADD COLUMN meeting_url TEXT;
ALTER TABLE bookings ADD COLUMN meeting_event_id TEXT;
ALTER TABLE bookings ADD COLUMN meeting_sequence INTEGER;
ALTER TABLE bookings ADD COLUMN meeting_claim_id TEXT;
ALTER TABLE bookings ADD COLUMN meeting_retry_at TEXT;
ALTER TABLE bookings ADD COLUMN meeting_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN meeting_notified_at TEXT;
ALTER TABLE bookings ADD COLUMN meeting_notification_claim_until TEXT;

CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  teacher_id TEXT NOT NULL REFERENCES students(id),
  google_sub TEXT NOT NULL,
  email TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  calendar_id TEXT,
  calendar_creation_attempted_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reconnect')),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS google_calendar_oauth_states (
  state_hash TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES students(id),
  session_version INTEGER NOT NULL,
  session_hash TEXT NOT NULL,
  verifier_encrypted TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
