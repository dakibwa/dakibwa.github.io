-- Gives a student account a role, so Inês can sign in as herself and manage
-- bookings rather than pasting a shared token into /schedule.
--
-- The ADMIN_TOKEN route stays: it is the way back in if she is ever locked out
-- of her own account, and it is what the schedule page fell back to before.

ALTER TABLE students ADD COLUMN role TEXT NOT NULL DEFAULT 'student';

CREATE INDEX IF NOT EXISTS idx_students_role ON students (role);
