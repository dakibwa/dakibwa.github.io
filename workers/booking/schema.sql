-- Booking system schema for Português com a Inês.
--
-- All instants are stored as ISO-8601 UTC strings ("2026-09-03T09:00:00.000Z").
-- Wall-clock availability is stored as minutes-from-midnight in Porto time and
-- resolved against Europe/Lisbon at query time, so the stored rules survive DST
-- rather than drifting an hour twice a year.

CREATE TABLE IF NOT EXISTS lesson_types (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL,
  price_cents      INTEGER NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1
);

-- Recurring weekly teaching hours. weekday: 0=Sunday .. 6=Saturday, matching
-- JavaScript's getUTCDay() so there is one convention end to end.
CREATE TABLE IF NOT EXISTS availability_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday      INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1440),
  end_minute   INTEGER NOT NULL CHECK (end_minute BETWEEN 0 AND 1440),
  active       INTEGER NOT NULL DEFAULT 1,
  CHECK (end_minute > start_minute)
);

-- One-off overrides on a specific Porto calendar date.
--   kind='blocked' with NULL minutes  -> whole day off
--   kind='blocked' with minutes       -> that window only
--   kind='extra'                      -> bookable outside the weekly rules
CREATE TABLE IF NOT EXISTS availability_exceptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('blocked', 'extra')),
  start_minute INTEGER,
  end_minute   INTEGER,
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exceptions_date ON availability_exceptions (date);

CREATE TABLE IF NOT EXISTS bookings (
  id                TEXT PRIMARY KEY,
  reference         TEXT NOT NULL UNIQUE,
  lesson_type_id    TEXT NOT NULL REFERENCES lesson_types (id),
  student_name      TEXT NOT NULL,
  student_email     TEXT NOT NULL,
  student_phone     TEXT NOT NULL DEFAULT '',
  student_timezone  TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  location          TEXT NOT NULL DEFAULT 'online' CHECK (location IN ('online', 'porto')),
  notes             TEXT NOT NULL DEFAULT '',
  starts_at         TEXT NOT NULL,
  ends_at           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  -- ICS SEQUENCE. Every change increments it or calendar clients ignore the update.
  sequence          INTEGER NOT NULL DEFAULT 0,
  reschedule_count  INTEGER NOT NULL DEFAULT 0,
  -- Set when a change landed on the lesson's own Porto date: this is what the
  -- EUR 5 same-day fee is charged against, and why Inês is emailed about it.
  same_day_change   INTEGER NOT NULL DEFAULT 0,
  previous_starts_at TEXT,
  cancelled_at      TEXT,
  cancelled_by      TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- Availability is computed by subtracting confirmed bookings from the rules,
-- so this index carries every read on the hot path.
CREATE INDEX IF NOT EXISTS idx_bookings_window ON bookings (status, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings (student_email);

-- Delivery record and idempotency guard: a retried request must not send a
-- second confirmation. dedupe_key is what makes that true.
CREATE TABLE IF NOT EXISTS email_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  TEXT,
  kind        TEXT NOT NULL,
  recipient   TEXT NOT NULL,
  dedupe_key  TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL,
  provider_id TEXT,
  error       TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
