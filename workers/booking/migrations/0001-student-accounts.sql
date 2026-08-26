-- Adds student accounts, and links bookings to them.
--
-- schema.sql is the shape of a fresh database; this is how an existing one gets
-- there. Applied to both local and remote on 26 August 2026, before any real
-- booking existed.

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

CREATE INDEX IF NOT EXISTS idx_students_email ON students (email);

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT NOT NULL,
  at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts (email, at);

CREATE TABLE IF NOT EXISTS password_resets (
  nonce      TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- SQLite has no "ADD COLUMN IF NOT EXISTS"; this runs once, by hand, and is
-- recorded here so the change is not folklore.
ALTER TABLE bookings ADD COLUMN student_id TEXT REFERENCES students (id);

CREATE INDEX IF NOT EXISTS idx_bookings_student ON bookings (student_id, starts_at);
