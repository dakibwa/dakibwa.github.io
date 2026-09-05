"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarOff, Check, Plus, Trash2 } from "lucide-react";
import { AuthPanel } from "@/components/AuthPanel";
import {
  addException,
  cancelBookingAs,
  createBookingFor,
  rescheduleBookingAs,
  fetchBookings,
  fetchSchedule,
  minutesToTime,
  removeException,
  saveRules,
  setNoShow,
  timeToMinutes,
  type AdminBooking,
  type AvailabilityException
} from "@/lib/admin-api";
import { clearSession, fetchMe, readSession, type Student } from "@/lib/auth-api";
import { formatLongDate, formatSlotTime, portoTimeToUtc } from "@/lib/booking-api";
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

type NewLesson = { email: string; name: string; lessonType: string; date: string; time: string; notes: string };
const emptyLesson: NewLesson = { email: "", name: "", lessonType: "single", date: "", time: "17:00", notes: "" };

function canSetNoShow(booking: AdminBooking, now = new Date()) {
  return (
    booking.payment_status === "scheduled" &&
    now >= new Date(booking.starts_at) &&
    now < new Date(booking.ends_at)
  );
}

export function TeacherSchedule() {
  const [token, setToken] = useState("");
  const [me, setMe] = useState<Student | null>(null);
  const [checking, setChecking] = useState(true);
  const [newLesson, setNewLesson] = useState<NewLesson>(emptyLesson);
  const [adding, setAdding] = useState(false);
  // Which booking is being moved, and to when. One at a time.
  const [moving, setMoving] = useState<{ id: string; date: string; time: string } | null>(null);
  const [week, setWeek] = useState<WeekState>({});
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [paymentReview, setPaymentReview] = useState<{ id: string; reference: string }[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [newDayOff, setNewDayOff] = useState({ date: "", note: "" });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      setChecking(false);
      return;
    }

    // Her ordinary account carries a teacher role, so there is no second
    // password to remember and her actions are attributable rather than
    // anonymous.
    fetchMe(session)
      .then((data) => {
        setMe(data?.student ?? null);
        if (data?.student.role === "teacher") setToken(session);
      })
      .catch(() => clearSession())
      .finally(() => setChecking(false));
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
        setPaymentReview(bookingList.manualPaymentReconciliation ?? []);
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

  if (checking) return <p className="booking-state-note">One moment…</p>;

  if (!token) {
    // Signed in, but not as her: say so plainly rather than showing an empty
    // schedule or a bare "not authorised".
    if (me) {
      return (
        <div className="booking-alert" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          <p>
            You&rsquo;re signed in as {me.name}, and this page is Inês&rsquo;s. If it should be yours,{" "}
            <a href="/book/?view=lessons">switch account</a>.
          </p>
        </div>
      );
    }

    return (
      <AuthPanel
        heading="Sign in"
        headingLevel={2}
        intro="Your teaching hours, your days off, and everything that's booked."
        onSignedIn={(student) => {
          setMe(student);
          if (student.role === "teacher") setToken(readSession());
        }}
      />
    );
  }

  return (
    <div className="teacher-schedule">
      {paymentReview.length ? (
        <div className="booking-alert" role="status">
          <AlertCircle aria-hidden="true" size={20} />
          <p>{paymentReview.length} {paymentReview.length === 1 ? "payment or refund needs" : "payments or refunds need"} review: {paymentReview.map((item) => item.reference).join(", ")}. Review these payments in Stripe before retrying. Their lessons remain locked until the result is confirmed.</p>
        </div>
      ) : null}
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
        <h2>Add a lesson</h2>
        <p className="booking-state-note">
          For someone who booked with you another way. They&rsquo;ll get the same confirmation and calendar
          invitation, and can change it themselves afterwards.
        </p>

        <form
          className="schedule-add-lesson"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!newLesson.email || !newLesson.date) return;
            setAdding(true);
            setError("");
            try {
              await createBookingFor(token, {
                email: newLesson.email.trim(),
                name: newLesson.name.trim(),
                lessonType: newLesson.lessonType,
                startAt: portoTimeToUtc(newLesson.date, newLesson.time),
                location: "online",
                notes: newLesson.notes.trim()
              });
              setNewLesson(emptyLesson);
              setStatus("Added. They've been emailed the details.");
              load(token);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "That lesson could not be added.");
            } finally {
              setAdding(false);
            }
          }}
        >
          <label>
            <span>Their email</span>
            <input
              onChange={(event) => setNewLesson((c) => ({ ...c, email: event.target.value }))}
              required
              type="email"
              value={newLesson.email}
            />
          </label>
          <label>
            <span>Their name</span>
            <input
              onChange={(event) => setNewLesson((c) => ({ ...c, name: event.target.value }))}
              value={newLesson.name}
            />
          </label>
          <label>
            <span>Lesson</span>
            <select
              onChange={(event) => setNewLesson((c) => ({ ...c, lessonType: event.target.value }))}
              value={newLesson.lessonType}
            >
              <option value="trial">Trial lesson</option>
              <option value="single">Single lesson</option>
              <option value="long">Longer lesson</option>
            </select>
          </label>
          <label>
            <span>Date</span>
            <input
              onChange={(event) => setNewLesson((c) => ({ ...c, date: event.target.value }))}
              required
              type="date"
              value={newLesson.date}
            />
          </label>
          <label>
            <span>Time (Porto)</span>
            <input
              onChange={(event) => setNewLesson((c) => ({ ...c, time: event.target.value }))}
              required
              type="time"
              value={newLesson.time}
            />
          </label>
          <button className="button button--coral" disabled={adding} type="submit">
            {adding ? "Adding…" : "Add lesson"}
          </button>
        </form>
      </section>

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
                  {booking.attendance_status === "no_show" ? (
                    <span className="schedule-flag">No-show · €5 after this lesson</span>
                  ) : booking.same_day_fee_status === "paid" ? (
                    <span className="schedule-flag">€5 same-day fee paid</span>
                  ) : booking.same_day_change ? (
                    <span className="schedule-flag">€5 same-day fee due</span>
                  ) : null}
                  {canSetNoShow(booking, now) ? (
                    <button
                      className="schedule-move"
                      onClick={async () => {
                        const next = booking.attendance_status !== "no_show";
                        if (
                          next &&
                          !window.confirm(
                            `Mark ${booking.student_name} as a no-show? Only €5 will be charged when this lesson ends.`
                          )
                        ) {
                          return;
                        }
                        setError("");
                        try {
                          await setNoShow(token, booking.id, next);
                          setStatus(
                            next
                              ? "Marked as a no-show. Only €5 will be charged when the lesson ends."
                              : "No-show removed. The normal lesson price will be charged when it ends."
                          );
                          load(token);
                        } catch (caught) {
                          setError(caught instanceof Error ? caught.message : "Attendance could not be changed.");
                        }
                      }}
                      type="button"
                    >
                      {booking.attendance_status === "no_show" ? "Undo no-show" : "Mark no-show"}
                    </button>
                  ) : null}
                  <button
                    className="schedule-move"
                    onClick={() =>
                      setMoving((current) =>
                        current?.id === booking.id
                          ? null
                          : {
                              id: booking.id,
                              date: booking.starts_at.slice(0, 10),
                              time: formatSlotTime(booking.starts_at)
                            }
                      )
                    }
                    type="button"
                  >
                    {moving?.id === booking.id ? "Never mind" : "Move"}
                  </button>
                  <button
                    className="schedule-cancel"
                    onClick={async () => {
                      // Deliberate confirmation: this emails the student and
                      // takes the lesson out of her calendar.
                      if (!window.confirm(`Cancel ${booking.student_name}'s lesson? They will be emailed.`)) return;
                      try {
                        await cancelBookingAs(token, booking.id);
                        setStatus("Cancelled. They've been emailed.");
                        load(token);
                      } catch (caught) {
                        setError(caught instanceof Error ? caught.message : "That could not be cancelled.");
                      }
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
                {moving?.id === booking.id ? (
                  <form
                    className="schedule-move-form"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      setError("");
                      try {
                        await rescheduleBookingAs(token, booking.id, portoTimeToUtc(moving.date, moving.time));
                        setMoving(null);
                        setStatus("Moved. They've been emailed the new time.");
                        load(token);
                      } catch (caught) {
                        setError(caught instanceof Error ? caught.message : "That could not be moved.");
                      }
                    }}
                  >
                    <label>
                      <span>New date</span>
                      <input
                        onChange={(event) => setMoving((c) => (c ? { ...c, date: event.target.value } : c))}
                        required
                        type="date"
                        value={moving.date}
                      />
                    </label>
                    <label>
                      <span>Time (Porto)</span>
                      <input
                        onChange={(event) => setMoving((c) => (c ? { ...c, time: event.target.value } : c))}
                        required
                        type="time"
                        value={moving.time}
                      />
                    </label>
                    <button className="button button--coral" type="submit">
                      Move lesson
                    </button>
                  </form>
                ) : null}
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
          These are the first and last times a lesson can <em>start</em>, in Porto time. A 90-minute lesson
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
                  {exception.note ? `: ${exception.note}` : ""}
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
