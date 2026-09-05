-- Freeze Stripe parameters before the first external request. A later saved
-- card, public price or policy change must not alter an ambiguous retry.
ALTER TABLE bookings ADD COLUMN charge_request TEXT;
ALTER TABLE bookings ADD COLUMN same_day_fee_request TEXT;
