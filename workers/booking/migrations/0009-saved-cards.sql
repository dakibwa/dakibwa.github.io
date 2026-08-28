-- First lesson paid at booking, the rest charged on their own day.
--
-- Dan, 28 August 2026: a student should not have to pay a whole run of
-- lessons up front. The first checkout saves the card (Stripe shows its own
-- consent wording for that), and every later lesson in the run is charged
-- automatically on the morning of the lesson — which is also exactly the
-- policy: free to change until the day before, charged on the day regardless.
--
-- The card itself never touches this database: Stripe keeps it, and these two
-- columns hold only the opaque customer and payment-method identifiers needed
-- to ask Stripe to charge it again.

ALTER TABLE students ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE students ADD COLUMN stripe_payment_method TEXT;

-- A series booked under prepay keeps charging per lesson as it tops up; one
-- booked before prepay never starts to. The flag records which world the run
-- was created in, so a top-up years later still keeps the original promise.
ALTER TABLE booking_series ADD COLUMN prepaid INTEGER NOT NULL DEFAULT 0;
