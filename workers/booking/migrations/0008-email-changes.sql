-- Changing the address you sign in with, safely.
--
-- The new address is proved before it takes effect, exactly as a password reset
-- proves the old one: a single-use nonce is mailed to the address being claimed
-- and nothing moves until it comes back. Without that step, "change your email"
-- is a way to point your own account at someone else's address — and combined
-- with a Google sign-in that matched on email alone, it was a way to take their
-- account. Both halves are fixed together; neither is safe on its own.
--
-- The pending address is stored here rather than on `students`, so an
-- unconfirmed request never sits in the row that logins are matched against.

CREATE TABLE IF NOT EXISTS email_changes (
  nonce      TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students (id),
  new_email  TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_changes_student ON email_changes (student_id);
