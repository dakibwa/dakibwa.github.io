-- Recurring student bookings: the same slot every week.
--
-- The occurrences are ordinary rows in `bookings`, not something computed at
-- read time. That is the whole point of the feature — Inês's calendar has to
-- actually hold the time — and it means every existing behaviour keeps working
-- per lesson without knowing series exist: the manage link, the iCalendar UID
-- and SEQUENCE, the same-day fee, rescheduling one week because of a dentist
-- appointment. A series is the recipe; the bookings are the lessons.
--
-- `occurrences` NULL means open-ended: it is kept topped up to a rolling
-- horizon instead of ending. `filled_to` records how far ahead that has been
-- done, so topping up is cheap and repeatable.

CREATE TABLE IF NOT EXISTS booking_series (
  id             TEXT PRIMARY KEY,
  student_id     TEXT NOT NULL REFERENCES students (id),
  lesson_type_id TEXT NOT NULL REFERENCES lesson_types (id),
  location       TEXT NOT NULL DEFAULT 'online' CHECK (location IN ('online', 'porto')),
  notes          TEXT NOT NULL DEFAULT '',
  -- The slot, in Porto terms. Stored as weekday plus minutes-from-midnight so
  -- the series survives a daylight-saving change as "Wednesdays at 17:30"
  -- rather than drifting by an hour, which is what storing a UTC time would do.
  weekday        INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  minute_of_day  INTEGER NOT NULL CHECK (minute_of_day BETWEEN 0 AND 1439),
  -- NULL = open-ended.
  occurrences    INTEGER CHECK (occurrences IS NULL OR occurrences > 0),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  -- Latest Porto date this series has been filled up to (YYYY-MM-DD).
  filled_to      TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  ended_at       TEXT
);

-- Nullable: every booking made before this migration, and every one-off after
-- it, simply has no series.
ALTER TABLE bookings ADD COLUMN series_id TEXT REFERENCES booking_series (id);

CREATE INDEX IF NOT EXISTS idx_bookings_series ON bookings (series_id);
CREATE INDEX IF NOT EXISTS idx_series_student ON booking_series (student_id);
CREATE INDEX IF NOT EXISTS idx_series_active ON booking_series (status, filled_to);
