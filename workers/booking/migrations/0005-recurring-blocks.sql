-- Recurring blocked time, for things that happen every week rather than on one
-- date — lunch, in the first instance.
--
-- Splitting the weekly hours around lunch would not have worked: with last-start
-- semantics, a rule ending at 11:30 still lets a 90-minute lesson begin there
-- and run to 13:00, straight through it. A blocked *span* is checked against
-- each lesson's whole duration, so it withholds a long lesson earlier than a
-- short one, which is the behaviour wanted.
--
-- The table is rebuilt rather than altered: `date` was NOT NULL, and SQLite
-- cannot drop that.

CREATE TABLE availability_exceptions_rebuilt (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT,
  weekday      INTEGER CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  kind         TEXT NOT NULL CHECK (kind IN ('blocked', 'extra')),
  start_minute INTEGER,
  end_minute   INTEGER,
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  CHECK (date IS NOT NULL OR weekday IS NOT NULL)
);

INSERT INTO availability_exceptions_rebuilt (id, date, weekday, kind, start_minute, end_minute, note, created_at)
SELECT id, date, NULL, kind, start_minute, end_minute, note, created_at FROM availability_exceptions;

DROP TABLE availability_exceptions;

ALTER TABLE availability_exceptions_rebuilt RENAME TO availability_exceptions;

CREATE INDEX IF NOT EXISTS idx_exceptions_date ON availability_exceptions (date);
CREATE INDEX IF NOT EXISTS idx_exceptions_weekday ON availability_exceptions (weekday);

-- 12:30-13:30 Porto, every weekday she teaches.
INSERT INTO availability_exceptions (date, weekday, kind, start_minute, end_minute, note, created_at)
SELECT NULL, weekday, 'blocked', 750, 810, 'Lunch', datetime('now')
FROM (SELECT 1 AS weekday UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5);
