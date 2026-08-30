-- Dan, 30 August 2026: students may choose a lesson up to eight weeks ahead,
-- rather than browsing the previous three-month window.
INSERT OR REPLACE INTO settings (key, value)
VALUES ('booking_horizon_days', '56');
