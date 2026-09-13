-- No existing card or per-lesson acceptance is a teacher-booking mandate.
ALTER TABLE students ADD COLUMN teacher_payment_consent_at TEXT;
ALTER TABLE students ADD COLUMN teacher_payment_consent_version TEXT;
ALTER TABLE students ADD COLUMN teacher_payment_revoked_at TEXT;
ALTER TABLE students ADD COLUMN teacher_payment_revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE manual_booking_payments (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  expires_at TEXT,
  accepted_at TEXT,
  allow_future INTEGER NOT NULL DEFAULT 0,
  use_saved_card INTEGER NOT NULL DEFAULT 0,
  setup_customer_id TEXT,
  setup_customer_email TEXT,
  setup_started_at TEXT,
  consent_revision INTEGER NOT NULL DEFAULT 0
);
