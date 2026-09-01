-- Record the student's explicit agreement to future automatic charges when a
-- prepaid weekly run begins. Existing unpaid series remain null.

ALTER TABLE booking_series ADD COLUMN payment_consent_at TEXT;
