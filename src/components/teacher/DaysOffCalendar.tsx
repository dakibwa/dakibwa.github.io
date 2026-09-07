"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react";
import {
  WEEKDAYS,
  dateLabel,
  monthDates,
  shiftDate,
  shiftMonth,
} from "@/lib/teacher-calendar";

type Props = {
  today: string;
  saved: Set<string>;
  selected: Set<string>;
  bookedCounts: Map<string, number>;
  notes: Map<string, string>;
  busy: boolean;
  needsRefresh: boolean;
  note: string;
  onNote: (note: string) => void;
  onToggle: (date: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onRefresh: () => void;
  onViewLessons: (date: string) => void;
};

export function DaysOffCalendar({
  today,
  saved,
  selected,
  bookedCounts,
  notes,
  busy,
  needsRefresh,
  note,
  onNote,
  onToggle,
  onSave,
  onDiscard,
  onRefresh,
  onViewLessons,
}: Props) {
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [focusDate, setFocusDate] = useState(today);
  const calendarRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  const dates = monthDates(month);
  const changed = [...new Set([...saved, ...selected])].filter(
    (date) => date >= today && saved.has(date) !== selected.has(date),
  );
  const newlyBlocked = changed.filter((date) => selected.has(date));
  const withLessons = newlyBlocked
    .filter((date) => (bookedCounts.get(date) ?? 0) > 0)
    .sort();
  const affectedLessons = withLessons.reduce(
    (sum, date) => sum + (bookedCounts.get(date) ?? 0),
    0,
  );
  const nextOff = [...selected].filter((date) => date >= today).sort()[0];
  const activeFocus =
    dates.includes(focusDate) && focusDate >= today
      ? focusDate
      : dates.find(
          (date) => date >= today && date.slice(0, 7) === month.slice(0, 7),
        );

  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    calendarRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day-off="${focusDate}"]`)
      ?.focus();
  }, [focusDate, month]);

  function moveMonth(amount: number) {
    const next = shiftMonth(month, amount);
    setMonth(next);
    setFocusDate(
      next < today && next.slice(0, 7) === today.slice(0, 7) ? today : next,
    );
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const movement: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    let next: string;
    if (event.key in movement) next = shiftDate(date, movement[event.key]);
    else if (event.key === "Home")
      next = shiftDate(
        date,
        -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7),
      );
    else if (event.key === "End")
      next = shiftDate(
        date,
        6 - ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7),
      );
    else if (event.key === "PageUp") next = shiftMonth(date, -1);
    else if (event.key === "PageDown") next = shiftMonth(date, 1);
    else return;
    event.preventDefault();
    if (next < today) next = today;
    pendingFocus.current = true;
    setMonth(`${next.slice(0, 7)}-01`);
    setFocusDate(next);
  }

  return (
    <section
      className="teacher-days-off"
      aria-labelledby="teacher-days-off-title"
    >
      <div className="teacher-days-off-intro">
        <span className="teacher-eyebrow">Make room for yourself</span>
        <h2 id="teacher-days-off-title">Days off</h2>
        <p>
          Click the dates you won&rsquo;t teach, then save. Click a marked date
          again to open it back up.
        </p>
        <p className="teacher-secondary-copy">
          Existing lessons stay booked. Move or cancel them separately.
        </p>
      </div>
      <div className="teacher-month" ref={calendarRef}>
        <div className="teacher-month-heading">
          <h3 aria-live="polite">
            {dateLabel(month, { month: "long", year: "numeric" })}
          </h3>
          <div className="teacher-calendar-arrows">
            <button
              className="teacher-icon-button"
              type="button"
              aria-label="Previous month"
              disabled={month.slice(0, 7) <= today.slice(0, 7)}
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft size={19} aria-hidden="true" />
            </button>
            <button
              className="teacher-icon-button"
              type="button"
              aria-label="Next month"
              onClick={() => moveMonth(1)}
            >
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="teacher-month-weekdays" aria-hidden="true">
          {WEEKDAYS.map((day) => (
            <span key={day.value}>{day.short}</span>
          ))}
        </div>
        <div
          className="teacher-month-dates"
          role="group"
          aria-label="Select days off"
        >
          {dates.map((date) => {
            const off = selected.has(date);
            const dirty = saved.has(date) !== off;
            const count = bookedCounts.get(date) ?? 0;
            return (
              <button
                key={date}
                type="button"
                data-day-off={date}
                className={`teacher-month-date ${off ? "is-off" : ""} ${dirty ? "is-draft" : ""} ${date.slice(0, 7) !== month.slice(0, 7) ? "is-outside-month" : ""}`}
                disabled={date < today || busy || needsRefresh}
                title={notes.get(date)}
                aria-pressed={off}
                aria-current={date === today ? "date" : undefined}
                aria-label={`${dateLabel(date)}, ${off ? "day off" : "not blocked"}${count ? `, ${count} ${count === 1 ? "lesson" : "lessons"} booked` : ""}${dirty ? ", unsaved change" : ""}`}
                tabIndex={date === activeFocus ? 0 : -1}
                onClick={() => {
                  setFocusDate(date);
                  onToggle(date);
                }}
                onKeyDown={(event) => onKey(event, date)}
              >
                <span>{Number(date.slice(-2))}</span>
                {count ? (
                  <i className="teacher-date-booked-dot" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
        <div
          className="teacher-calendar-key"
          aria-label="Days off calendar key"
        >
          <span>
            <i className="teacher-key-booked" />
            Day off
          </span>
          <span>
            <i className="teacher-key-dot" />
            Lesson booked
          </span>
          <span>
            <i className="teacher-key-draft" />
            Unsaved change
          </span>
        </div>
      </div>
      <div className="teacher-days-off-save">
        {newlyBlocked.length ? (
          <label className="teacher-day-off-note">
            <span>
              Note for these days <small>(optional)</small>
            </span>
            <input
              value={note}
              disabled={busy}
              maxLength={200}
              onChange={(event) => onNote(event.target.value)}
              placeholder="For example, a holiday"
            />
          </label>
        ) : null}
        {affectedLessons ? (
          <div className="teacher-inline-notice" role="status">
            <p>
              {affectedLessons} booked{" "}
              {affectedLessons === 1 ? "lesson falls" : "lessons fall"} on your
              new days off.
            </p>
            <button
              type="button"
              className="teacher-text-button"
              onClick={() => onViewLessons(withLessons[0])}
            >
              View those lessons <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <div className="teacher-save-row">
          {needsRefresh ? (
            <button
              className="button button--coral"
              type="button"
              disabled={busy}
              onClick={onRefresh}
            >
              Reload days off
            </button>
          ) : (
            <button
              className="button button--coral"
              type="button"
              disabled={busy || !changed.length}
              onClick={onSave}
            >
              {busy ? "Saving…" : "Save days off"}
            </button>
          )}
          {changed.length ? (
            <button
              className="teacher-text-button"
              type="button"
              disabled={busy || needsRefresh}
              onClick={onDiscard}
            >
              Discard
            </button>
          ) : null}
        </div>
        <p className="teacher-save-note" aria-live="polite">
          {changed.length
            ? `${changed.length} ${changed.length === 1 ? "date" : "dates"} changed, not saved yet.`
            : nextOff
              ? `Next day off: ${dateLabel(nextOff, { day: "numeric", month: "long" })}${notes.get(nextOff) ? ` · ${notes.get(nextOff)}` : "."}`
              : "No days off planned yet."}
        </p>
      </div>
    </section>
  );
}
