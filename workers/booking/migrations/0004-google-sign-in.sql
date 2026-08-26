-- Google Sign-In.
--
-- password_hash stays NOT NULL rather than forcing a table rebuild: an account
-- created through Google stores an empty string, which no password can ever
-- verify against, and such a student sets a password by using "forgot password"
-- if they ever want one.

ALTER TABLE students ADD COLUMN google_sub TEXT;

CREATE INDEX IF NOT EXISTS idx_students_google ON students (google_sub);
