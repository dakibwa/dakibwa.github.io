-- Her approved public product set (README "Sources of truth"): trial EUR 20/60,
-- single EUR 25/60, long EUR 35/90. Legacy students keep individually agreed
-- pricing, which is deliberately not advertised and so is not modelled here.
INSERT OR REPLACE INTO lesson_types (id, slug, name, description, duration_minutes, price_cents, sort_order, active) VALUES
  ('trial',  'trial-lesson',  'Trial lesson',   'A full hour, not a sales call. We find out where your Portuguese is and what you want to do with it.', 60, 2000, 1, 1),
  ('single', 'single-lesson', 'Single lesson',  'One to one, in Porto or online.',                                                                        60, 2500, 2, 1),
  ('long',   'long-lesson',   'Longer lesson',  'An hour and a half, if you want more time to talk.',                                                    90, 3500, 3, 1);

-- Placeholder teaching hours so the calendar is never empty before Inês sets
-- her own. Weekdays 10:00-13:00 and 14:00-19:00 Porto time.
DELETE FROM availability_rules;
INSERT INTO availability_rules (weekday, start_minute, end_minute, active) VALUES
  (1, 600, 780, 1), (1, 840, 1140, 1),
  (2, 600, 780, 1), (2, 840, 1140, 1),
  (3, 600, 780, 1), (3, 840, 1140, 1),
  (4, 600, 780, 1), (4, 840, 1140, 1),
  (5, 600, 780, 1), (5, 840, 1140, 1);

INSERT OR REPLACE INTO settings (key, value) VALUES
  ('minimum_notice_hours', '12'),
  ('booking_horizon_days', '60'),
  ('slot_interval_minutes', '30'),
  ('same_day_change_fee_cents', '500'),
  ('teacher_name', 'Inês Dias Baía'),
  ('teacher_email', ''),
  ('reply_to_email', '');
