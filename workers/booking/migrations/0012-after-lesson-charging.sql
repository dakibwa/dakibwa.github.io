-- Save a card when the booking is made, then charge only when the lesson ends.
--
-- A lesson can carry two independent charges: its normal price at the end, and
-- one EUR 5 fee if the student moves or cancels it on its Porto calendar day.
-- Keeping those states separate prevents a same-day move from either replacing
-- the later lesson charge or being charged twice on a retry.

ALTER TABLE bookings ADD COLUMN payment_consent_at TEXT;
ALTER TABLE bookings ADD COLUMN payment_consent_version TEXT;
ALTER TABLE bookings ADD COLUMN attendance_status TEXT NOT NULL DEFAULT 'expected'
  CHECK (attendance_status IN ('expected', 'no_show'));
ALTER TABLE bookings ADD COLUMN no_show_marked_at TEXT;
ALTER TABLE bookings ADD COLUMN charged_cents INTEGER;
ALTER TABLE bookings ADD COLUMN same_day_fee_status TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE bookings ADD COLUMN same_day_fee_cents INTEGER;
ALTER TABLE bookings ADD COLUMN same_day_fee_payment_intent TEXT;
ALTER TABLE bookings ADD COLUMN same_day_fee_session_id TEXT;

ALTER TABLE booking_series ADD COLUMN payment_consent_version TEXT;
ALTER TABLE booking_series ADD COLUMN automatic_payment INTEGER NOT NULL DEFAULT 0;

-- Preserve any existing saved-card series if this migration is applied after
-- the earlier prepayment experiment.
UPDATE booking_series SET automatic_payment = prepaid WHERE prepaid = 1;

CREATE INDEX IF NOT EXISTS idx_bookings_due_charge
  ON bookings (payment_status, ends_at);
CREATE INDEX IF NOT EXISTS idx_bookings_due_same_day_fee
  ON bookings (same_day_fee_status, updated_at);
