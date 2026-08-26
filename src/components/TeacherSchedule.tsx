"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarOff, Check, Plus, Trash2 } from "lucide-react";
import {
  addException,
  fetchBookings,
  fetchSchedule,
  minutesToTime,
  removeException,
  saveRules,
  timeToMinutes,
  type AdminBooking,
  type AvailabilityException
} from "@/lib/admin-api";
import { formatLongDate, formatSlotTime } from "@/lib/booking-api";
import { BOOKING_CONFIGURED } from "@/lib/config";

/** 1=Monday .. 0=Sunday, matching the Worker's JavaScript weekday convention. */
const weekdays = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" }
];

type Window = { start: string; lastStart: string };
type WeekState = Record<number, Window[]>;

const STORAGE_KEY = "ines-schedule-token";

export function TeacherSchedule() {
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [week, setWeek] = useState<WeekState>({});
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [newDayOff, setNewDayOff] = useState({ date: "", note: "" });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setToken(stored);
    } catch {
      // Private browsing or blocked storage: she just signs in each visit.
    }
  }, []);

  const load = useCallback(
    async (activeToken: string) => {
      setLoading(true);
      setError("");
      try {
        const [schedule, bookingList] = await Promise.all([fetchSchedule(activeToken), fetchBookings(activeToken)]);

        const next: WeekState = {};
        for (const day of weekdays) next[day.value] = [];
        for (const rule of schedule.rules) {
          next[rule.weekday] = [
            ...(next[rule.weekday] ?? []),
            { start: minutesToTime(rule.start_minute), lastStart: minutesToTime(rule.last_start_minute) }
          ];
        }

        setWeek(next);
        setExceptions(schedule.exceptions);
        setBookings(bookingList.bookings.filter((booking) => booking.status === "confirmed"));
        try {
          window.localStorage.setItem(STORAGE_KEY, activeToken);
        } catch {
          // Not being able to remember the key is not a failure worth surfacing.
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load your schedule.");
        setToken("");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (token) load(token);
  }, [token, load]);

  function signIn(event: FormEvent) {
    event.preventDefault();
    setToken(tokenInput.trim());
  }

  async function persist(nextWeek: WeekState) {
    setStatus("");
    setError("");
    const rules = Object.entries(nextWeek).flatMap(([weekday, windows]) =>
      windows
        .filter(
          (window) => window.start && window.lastStart && timeToMinutes(window.lastStart) >= timeToMinutes(window.start)
        )
        .map((window) => ({
          weekday: Number(weekday),
          startMinute: timeToMinutes(window.start),
          lastStartMinute: timeToMinutes(window.lastStart)
        }))
    );

    try {
      await saveRules(token, rules);
      setStatus("Saved. Your booking page now offers these hours.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your hours.");
    }
  }

  function updateWindow(weekday: number, index: number, patch: Partial<Window>) {
    setWeek((current) => ({
      ...current,
      [weekday]: (current[weekday] ?? []).map((window, position) =>
        position === index ? { ...window, ...patch } : window
      )
    }));
  }

  if (!BOOKING_CONFIGURED) {
    return <p className="booking-state-note">The booking service is not connected yet.</p>;
  }

  if (!token) {
    return (
      <form className="schedule-signin" onSubmit={signIn}>
        <label>
          <span>Access key</span>
          <input
            autoComplete="off"
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="Paste the key Dan gave you"
            type="password"
            value={tokenInput}
          />
        </label>
        <button className="button button--coral" type="submit">
          Open my schedule
        </button>
        {error ? (
          <div className="booking-alert" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : null}
      </form>
    );
  }

  return (
    <div className="teacher-schedule">
      {error ? (
        <div className="booking-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}
      {status ? (
        <div className="booking-outcome" role="status">
          <Check size={20} aria-hidden="true" />
          <div>
            <strong>{status}</strong>
          </div>
        </div>
      ) : null}

      <section className="schedule-block">
        <h2>Next lessons</h2>
        {loading ? (
          <p className="booking-state-note">Loading…</p>
        ) : bookings.length ? (
          <ul className="schedule-bookings">
            {bookings.map((booking) => (
              <li key={booking.id}>
                <div>
                  <strong>
                    {formatLongDate(booking.starts_at)}, {formatSlotTime(booking.starts_at)}
                  </strong>
                  <span>
                    {booking.student_name} · {booking.lesson_name} ·{" "}
                    {booking.location === "porto" ? "In Porto" : "Online"}
                  </span>
                  {booking.notes ? <em>{booking.notes}</em> : null}
                </div>
                <div className="schedule-bookings__meta">
                  <a href={`mailto:${booking.student_email}`}>{booking.student_email}</a>
                  {booking.same_day_change ? <span className="schedule-flag">€5 same-day fee due</span> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="booking-state-note">Nothing booked yet.</p>
        )}
      </section>

      <section className="schedule-block">
        <h2>When you teach</h2>
        <p className="booking-state-note">
          These are the first and last times a lesson can <em>start</em>, in Porto time — so a 90-minute lesson
          booked at your last start time runs past it. Leave a day empty to keep it free.
        </p>

        <div className="schedule-week">
          {weekdays.map((day) => (
            <div className="schedule-day" key={day.value}>
              <h3>{day.label}</h3>
              <div className="schedule-day__windows">
                {(week[day.value] ?? []).map((window, index) => (
                  <div className="schedule-window" key={index}>
                    <input
                      aria-label={`${day.label}: earliest a lesson can start`}
                      onChange={(event) => updateWindow(day.value, index, { start: event.target.value })}
                      type="time"
                      value={window.start}
                    />
                    <span aria-hidden="true">to</span>
                    <input
                      aria-label={`${day.label}: latest a lesson can start`}
                      onChange={(event) => updateWindow(day.value, index, { lastStart: event.target.value })}
                      type="time"
                      value={window.lastStart}
                    />
                    <button
                      aria-label={`Remove this ${day.label} window`}
                      onClick={() =>
                        setWeek((current) => ({
                          ...current,
                          [day.value]: (current[day.value] ?? []).filter((_, position) => position !== index)
                        }))
                      }
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  className="schedule-add"
                  onClick={() =>
                    setWeek((current) => ({
                      ...current,
                      [day.value]: [...(current[day.value] ?? []), { start: "10:00", lastStart: "19:00" }]
                    }))
                  }
                  type="button"
                >
                  <Plus size={15} aria-hidden="true" /> Add hours
                </button>
              </div>
            </div>
          ))}
        </div>

        <button className="button button--coral" onClick={() => persist(week)} type="button">
          Save my hours
        </button>
      </section>

      <section className="schedule-block">
        <h2>Days off</h2>
        <p className="booking-state-note">Block a date and nobody can book it, whatever your usual hours are.</p>

        <form
          className="schedule-dayoff"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!newDayOff.date) return;
            try {
              await addException(token, newDayOff.date, newDayOff.note);
              setNewDayOff({ date: "", note: "" });
              load(token);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not block that date.");
            }
          }}
        >
          <input
            aria-label="Date to block"
            onChange={(event) => setNewDayOff((current) => ({ ...current, date: event.target.value }))}
            type="date"
            value={newDayOff.date}
          />
          <input
            aria-label="Reason (optional)"
            onChange={(event) => setNewDayOff((current) => ({ ...current, note: event.target.value }))}
            placeholder="Reason (optional)"
            value={newDayOff.note}
          />
          <button className="button button--quiet" type="submit">
            Block this day
          </button>
        </form>

        {exceptions.length ? (
          <ul className="schedule-exceptions">
            {exceptions.map((exception) => (
              <li key={exception.id}>
                <CalendarOff size={16} aria-hidden="true" />
                <span>
                  {formatLongDate(`${exception.date}T12:00:00Z`)}
                  {exception.note ? ` — ${exception.note}` : ""}
                </span>
                <button
                  aria-label={`Unblock ${exception.date}`}
                  onClick={async () => {
                    await removeException(token, exception.id);
                    load(token);
                  }}
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="booking-state-note">No days blocked.</p>
        )}
      </section>
    </div>
  );
}
