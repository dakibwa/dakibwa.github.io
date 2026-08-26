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
--
-- last_start_minute is the latest time a lesson may *begin*, not the time she
-- finishes. That distinction is the whole point: "last lesson at 19:00" then
-- holds for a 90-minute lesson exactly as it does for a 60-minute one, instead
-- of silently becoming 18:30 for the longer format.
CREATE TABLE IF NOT EXISTS availability_rules (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday           INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute      INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1440),
  last_start_minute INTEGER NOT NULL CHECK (last_start_minute BETWEEN 0 AND 1440),
  active            INTEGER NOT NULL DEFAULT 1,
  CHECK (last_start_minute >= start_minute)
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

-- Student accounts. Booking requires one, so a student's lessons persist and
-- they can see and change all of them in one place rather than depending on
-- having kept the right confirmation email.
CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  timezone      TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

-- Emails are matched case-insensitively; the column already stores them
-- lower-cased, and this makes the lookup an index hit rather than a scan.
CREATE INDEX IF NOT EXISTS idx_students_email ON students (email);

-- Failed sign-in attempts, so an account can be slowed down under guessing
-- without locking the real student out permanently.
CREATE TABLE IF NOT EXISTS login_attempts (
  email      TEXT NOT NULL,
  at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts (email, at);

-- Reset tokens are single-use: the row is deleted when spent, so a link in an
-- old email cannot be replayed.
CREATE TABLE IF NOT EXISTS password_resets (
  nonce      TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id                TEXT PRIMARY KEY,
  reference         TEXT NOT NULL UNIQUE,
  lesson_type_id    TEXT NOT NULL REFERENCES lesson_types (id),
  student_id        TEXT REFERENCES students (id),
  -- Name and email are copied onto the booking rather than only joined, so a
  -- past lesson still reads correctly if the student later changes either.
  student_name      TEXT NOT NULL,
  student_email     TEXT NOT NULL,
  student_phone     TEXT NOT NULL DEFAULT '',
  student_timezone  TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  location          TEXT NOT NULL DEFAULT 'online' CHECK (location IN ('online', 'porto')),
  notes             TEXT NOT NULL DEFAULT '',
  starts_at         TEXT NOT NULL,
  ends_at           TEXT NOT NULL,
  -- pending_payment is a slot held while Stripe checkout is open. It becomes
  -- confirmed on the webhook, or lapses when hold_expires_at passes.
  status            TEXT NOT NULL DEFAULT 'confirmed'
                      CHECK (status IN ('confirmed', 'cancelled', 'pending_payment')),
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
  updated_at        TEXT NOT NULL,
  payment_status    TEXT NOT NULL DEFAULT 'not_required',
  amount_cents      INTEGER,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  hold_expires_at   TEXT
);

-- Availability is computed by subtracting confirmed bookings from the rules,
-- so this index carries every read on the hot path.
CREATE INDEX IF NOT EXISTS idx_bookings_window ON bookings (status, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings (student_email);
CREATE INDEX IF NOT EXISTS idx_bookings_student ON bookings (student_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings (stripe_session_id);

-- Stripe delivers webhooks at least once; this makes handling them exactly once.
CREATE TABLE IF NOT EXISTS stripe_events (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

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
