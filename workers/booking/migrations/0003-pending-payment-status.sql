-- Widens the bookings.status CHECK to allow 'pending_payment'.
--
-- SQLite cannot alter a CHECK constraint, so the table is rebuilt. Columns are
-- named explicitly on both sides rather than relying on SELECT *, because
-- student_id and the payment columns were added by ALTER and so sit in a
-- different order from schema.sql.

CREATE TABLE bookings_rebuilt (
  id                TEXT PRIMARY KEY,
  reference         TEXT NOT NULL UNIQUE,
  lesson_type_id    TEXT NOT NULL REFERENCES lesson_types (id),
  student_id        TEXT REFERENCES students (id),
  student_name      TEXT NOT NULL,
  student_email     TEXT NOT NULL,
  student_phone     TEXT NOT NULL DEFAULT '',
  student_timezone  TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  location          TEXT NOT NULL DEFAULT 'online' CHECK (location IN ('online', 'porto')),
  notes             TEXT NOT NULL DEFAULT '',
  starts_at         TEXT NOT NULL,
  ends_at           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'confirmed'
                      CHECK (status IN ('confirmed', 'cancelled', 'pending_payment')),
  sequence          INTEGER NOT NULL DEFAULT 0,
  reschedule_count  INTEGER NOT NULL DEFAULT 0,
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

INSERT INTO bookings_rebuilt (
  id, reference, lesson_type_id, student_id, student_name, student_email, student_phone,
  student_timezone, location, notes, starts_at, ends_at, status, sequence, reschedule_count,
  same_day_change, previous_starts_at, cancelled_at, cancelled_by, created_at, updated_at,
  payment_status, amount_cents, stripe_session_id, stripe_payment_intent, hold_expires_at
)
SELECT
  id, reference, lesson_type_id, student_id, student_name, student_email, student_phone,
  student_timezone, location, notes, starts_at, ends_at, status, sequence, reschedule_count,
  same_day_change, previous_starts_at, cancelled_at, cancelled_by, created_at, updated_at,
  payment_status, amount_cents, stripe_session_id, stripe_payment_intent, hold_expires_at
FROM bookings;

DROP TABLE bookings;

ALTER TABLE bookings_rebuilt RENAME TO bookings;

CREATE INDEX IF NOT EXISTS idx_bookings_window ON bookings (status, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings (student_email);
CREATE INDEX IF NOT EXISTS idx_bookings_student ON bookings (student_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings (stripe_session_id);
