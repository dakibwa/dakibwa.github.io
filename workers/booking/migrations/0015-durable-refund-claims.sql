CREATE TABLE IF NOT EXISTS booking_refunds (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
  request TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_refund_id TEXT,
  created_at TEXT NOT NULL,
  attempted_at TEXT
);
