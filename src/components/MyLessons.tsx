"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, ChevronRight, Globe2, Repeat } from "lucide-react";
import { AuthPanel } from "@/components/AuthPanel";
import { LessonMark } from "@/components/LessonMarks";
import {
  clearSession,
  confirmEmailChange,
  fetchMe,
  readSession,
  requestEmailChange,
  updateProfile,
  type LessonSeries,
  type MyBooking,
  type Student
} from "@/lib/auth-api";
import {
  browserTimeZone,
  buildBookingWeeks,
  differingLocalTime,
  formatLongDate,
  formatMoneyCents,
  formatSlotTime,
  portoDateKey,
  shortMonth,
  stopSeries
} from "@/lib/booking-api";
import { BOOKING_HORIZON_DAYS_FALLBACK, BOOKING_TIME_ZONE, formatLessonDuration } from "@/lib/config";

/** Index matches the Worker's weekday, which is 0 = Sunday. */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function minutesToClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function MyLessons({
  embedded = false,
  onBook,
  onManage,
  onSignedOut,
  showCalendar = true,
  showHistory = true
}: {
  embedded?: boolean;
  onBook?: () => void;
  onManage?: (token: string) => void;
  onSignedOut?: () => void;
  showCalendar?: boolean;
  showHistory?: boolean;
} = {}) {
  const [student, setStudent] = useState<Student | null>(null);
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [series, setSeries] = useState<LessonSeries[]>([]);
  const [confirmingStop, setConfirmingStop] = useState("");
  const [stopping, setStopping] = useState("");
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState({ name: "", email: "" });
  const [savingName, setSavingName] = useState(false);
  const [emailPending, setEmailPending] = useState("");
  const [detailsNote, setDetailsNote] = useState("");
  const [feeCents, setFeeCents] = useState(500);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zone, setZone] = useState(BOOKING_TIME_ZONE);
  const [todayKey, setTodayKey] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  const load = useCallback(async () => {
    const session = readSession();
    if (!session) {
      setStudent(null);
      setLoading(false);
      return;
    }

    try {
      const data = await fetchMe(session);
      if (!data) {
        setStudent(null);
        return;
      }
      setStudent(data.student);
      setDetails({ name: data.student.name, email: data.student.email });
      setBookings(data.bookings);
      setSeries(data.series ?? []);
      setFeeCents(data.sameDayFeeCents);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your lessons.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setZone(browserTimeZone());
    setTodayKey(portoDateKey(new Date()));
    load();
  }, [load]);

  useEffect(() => {
    if (selectedDate) return;
    const next = bookings
      .filter((booking) => !booking.isPast && booking.status === "confirmed")
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
    if (next) setSelectedDate(portoDateKey(new Date(next.startAt)));
  }, [bookings, selectedDate]);

  /*
   * The link mailed to the new address lands back here. It is applied only for
   * a signed-in student, so possession of the link alone is not enough — the
   * person confirming has to be the person who asked.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const changeToken = params.get("emailToken");
    if (!changeToken || !readSession()) return;

    confirmEmailChange(readSession(), changeToken)
      .then((result) => {
        setStudent(result.student);
        setDetails({ name: result.student.name, email: result.student.email });
        setDetailsNote("That's your email address updated.");
        setEmailPending("");
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "That link could not be used.");
      })
      .finally(() => {
        // Take the token out of the address bar either way, so a refresh does
        // not try to spend a link that has already been used.
        params.delete("emailToken");
        const query = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
      });
  }, []);

  /**
   * Stops the repeat without touching the lessons already booked. Someone who
   * stops repeating almost always still intends to come to the ones in their
   * calendar, and cancelling those silently would be the worse mistake — each
   * can still be cancelled on its own.
   */
  async function saveName() {
    setSavingName(true);
    setError("");
    setDetailsNote("");
    try {
      // Phone and timezone go back untouched: the endpoint keeps a field it is
      // not sent, but sending what we hold is one less thing to rely on.
      const result = await updateProfile(readSession(), {
        name: details.name.trim(),
        phone: student?.phone,
        timezone: student?.timezone
      });
      setStudent(result.student);
      setDetailsNote("Saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That could not be saved.");
    } finally {
      setSavingName(false);
    }
  }

  async function changeEmail() {
    setError("");
    setDetailsNote("");
    try {
      const result = await requestEmailChange(readSession(), details.email.trim());
      setEmailPending(result.pending);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That could not be sent.");
    }
  }

  async function stopRepeating(seriesId: string) {
    setStopping(seriesId);
    setError("");
    try {
      await stopSeries(readSession(), seriesId);
      // Reload rather than patching state: the lessons keep their series_id in
      // the database, and it is the *active* series list that decides whether
      // "one of your weekly lessons" is still true of them.
      await load();
      setSeries((current) => current.filter((entry) => entry.id !== seriesId));
      setConfirmingStop("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That repeat could not be stopped.");
    } finally {
      setStopping("");
    }
  }

  function keepRepeating(seriesId: string) {
    setConfirmingStop("");
    // The choice that opened the confirmation reappears in the next render.
    // Put keyboard focus back there instead of dropping it on the document.
    window.requestAnimationFrame(() => document.getElementById(`stop-repeat-${seriesId}`)?.focus());
  }

  const upcoming = bookings
    .filter((booking) => !booking.isPast && booking.status === "confirmed")
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const past = bookings
    .filter((booking) => booking.isPast || booking.status === "cancelled")
    .sort((a, b) => b.startAt.localeCompare(a.startAt));

  const bookingsByDate = upcoming.reduce<Record<string, MyBooking[]>>((dates, booking) => {
    const key = portoDateKey(new Date(booking.startAt));
    (dates[key] ??= []).push(booking);
    return dates;
  }, {});
  const latestDate = upcoming.length ? portoDateKey(new Date(upcoming[upcoming.length - 1].startAt)) : todayKey;
  const toDayNumber = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86_400_000;
  };
  const calendarHorizon =
    todayKey && latestDate
      ? Math.max(BOOKING_HORIZON_DAYS_FALLBACK, toDayNumber(latestDate) - toDayNumber(todayKey) + 1)
      : BOOKING_HORIZON_DAYS_FALLBACK;
  const calendarWeeks = todayKey ? buildBookingWeeks(todayKey, calendarHorizon) : [];
  const selectedBookings = selectedDate ? bookingsByDate[selectedDate] ?? [] : [];

  function manage(booking: MyBooking) {
    if (onManage) onManage(booking.manageToken);
    else window.location.assign(`/book/?manage=${encodeURIComponent(booking.manageToken)}`);
  }

  if (loading) return <p className="booking-state-note">Loading your lessons…</p>;

  /*
   * An unreachable API leaves `student` null, which used to fall straight
   * through to the sign-in panel — telling someone who is signed in that they
   * are not, and burying the real message. The session is still in hand, so
   * say what actually happened and offer the way back.
   */
  if (!student && error && readSession()) {
    return (
      <div className="my-lessons">
        <div className="booking-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{error}</p>
        </div>
        <p className="booking-state-note">
          <button
            className="text-action"
            onClick={() => {
              setError("");
              setLoading(true);
              load();
            }}
            type="button"
          >
            Try again
          </button>
        </p>
      </div>
    );
  }

  if (!student) {
    return (
      <AuthPanel
        heading="Sign in"
        headingLevel={2}
        intro="Your lessons, and any changes you want to make to them, all live here."
        onSignedIn={(signedIn) => {
          setStudent(signedIn);
          setLoading(true);
          load();
        }}
      />
    );
  }

  return (
    <div className="my-lessons">
      <div className={`my-lessons__header${embedded ? " my-lessons__header--embedded" : ""}`}>
        {embedded ? (
          <h2>Account</h2>
        ) : (
          <p>
            Signed in as <strong>{student.name}</strong> ({student.email})
          </p>
        )}
        <div className="my-lessons__header-actions">
          <button
            className={embedded ? "text-action" : "button button--coral"}
            onClick={() => setEditing((open) => !open)}
            type="button"
          >
            {editing ? "Done" : "Edit details"}
          </button>
          <button
            className={embedded ? "text-action text-action--muted" : "button button--quiet"}
            onClick={() => {
              clearSession();
              setStudent(null);
              setBookings([]);
              onSignedOut?.();
            }}
            type="button"
          >
            Sign out
          </button>
        </div>
      </div>

      {editing ? (
        <section className="my-lessons__details">
          <label>
            <span>Your name</span>
            <input
              autoComplete="name"
              onChange={(event) => setDetails((current) => ({ ...current, name: event.target.value }))}
              value={details.name}
            />
          </label>
          <button
            className="button button--coral"
            disabled={savingName || !details.name.trim() || details.name.trim() === student.name}
            onClick={saveName}
            type="button"
          >
            {savingName ? "Saving…" : "Save name"}
          </button>

          <label>
            <span>Email address</span>
            <input
              autoComplete="email"
              onChange={(event) => setDetails((current) => ({ ...current, email: event.target.value }))}
              type="email"
              value={details.email}
            />
          </label>
          {/* Changing the address you sign in with is deliberately the slower of
              the two: nothing moves until the new address answers. */}
          <button
            className="button button--coral"
            disabled={!details.email.trim() || details.email.trim() === student.email}
            onClick={changeEmail}
            type="button"
          >
            Send a confirmation link
          </button>

          {emailPending ? (
            <p className="my-lessons__details-note">
              Check <strong>{emailPending}</strong> — it only becomes your address once that link is used. Until then
              you sign in with {student.email}.
            </p>
          ) : (
            <p className="my-lessons__details-note">
              A new email address only takes effect once you confirm it from the link we send.
            </p>
          )}

          {detailsNote ? (
            <p className="my-lessons__details-note my-lessons__details-note--ok">{detailsNote}</p>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div className="booking-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      {series.length ? (
        <section className="my-lessons__series">
          <h2>Repeating</h2>
          {series.map((entry) => (
            <div className="my-lessons__series-row" key={entry.id}>
              <p>
                <Repeat size={16} aria-hidden="true" />
                <strong>{WEEKDAYS[entry.weekday]}s at {minutesToClock(entry.minuteOfDay)}</strong> Porto time
                {entry.openEnded ? ", every week" : ""} — {entry.upcoming}{" "}
                {entry.upcoming === 1 ? "lesson" : "lessons"} still to come.
              </p>
              {confirmingStop === entry.id ? (
                <div
                  aria-labelledby={`stop-series-${entry.id}`}
                  className="my-lessons__series-confirmation"
                  role="group"
                >
                  <div>
                    <h3 id={`stop-series-${entry.id}`}>Stop repeating lessons?</h3>
                    <p>Your booked lessons will stay. You can cancel them individually below.</p>
                  </div>
                  <div className="my-lessons__series-confirmation-actions">
                    <button
                      autoFocus
                      className="button button--coral"
                      disabled={stopping === entry.id}
                      onClick={() => stopRepeating(entry.id)}
                      type="button"
                    >
                      {stopping === entry.id ? "Stopping…" : "Yes, stop repeating"}
                    </button>
                    <button
                      className="text-action"
                      disabled={stopping === entry.id}
                      onClick={() => keepRepeating(entry.id)}
                      type="button"
                    >
                      No, keep repeating
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="text-action"
                  id={`stop-repeat-${entry.id}`}
                  onClick={() => setConfirmingStop(entry.id)}
                  type="button"
                >
                  Stop repeating
                </button>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {showCalendar ? (
      <section className="my-lessons__group">
        <div className="lesson-calendar__heading">
          <div>
            <h2>Your calendar</h2>
            <p>Choose a marked day to see or change the lesson.</p>
          </div>
          {onBook ? (
            <button className="button button--coral" onClick={onBook} type="button">
              Book another lesson
            </button>
          ) : (
            <a className="button button--coral" href="/book/">
              Book another lesson
            </a>
          )}
        </div>

        {upcoming.length ? (
          <div className="lesson-calendar">
            <div className="calendar-panel lesson-calendar__grid">
              <div className="calendar-weekdays" aria-hidden="true">
                {WEEKDAY_LABELS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div>
                {calendarWeeks.map((week) => (
                  <div className="lesson-calendar__week" key={week.key}>
                    {week.showMonth ? <p className="calendar-month">{week.month}</p> : null}
                    <div className="calendar-week">
                      {week.cells.map((cell) => {
                        const dayBookings = bookingsByDate[cell.key] ?? [];
                        const lessonLabel = dayBookings.length === 1 ? "1 lesson" : `${dayBookings.length} lessons`;
                        const timeLabel =
                          dayBookings.length === 1 ? formatSlotTime(dayBookings[0].startAt) : lessonLabel;
                        return (
                          <button
                            aria-label={`${formatLongDate(`${cell.key}T12:00:00Z`)}${
                              dayBookings.length ? `, ${lessonLabel}` : ", no lessons"
                            }`}
                            aria-pressed={selectedDate === cell.key}
                            className={`${dayBookings.length ? "has-booking" : ""}${
                              selectedDate === cell.key ? " is-selected" : ""
                            }${cell.isToday ? " is-today" : ""}`}
                            disabled={!dayBookings.length}
                            key={cell.key}
                            onClick={() => setSelectedDate(cell.key)}
                            type="button"
                          >
                            <span>
                              {cell.day}
                              {cell.month !== week.monthNumber ? <em>{shortMonth(cell.month, cell.key)}</em> : null}
                              {dayBookings.length ? <small>{timeLabel}</small> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="lesson-calendar__agenda" aria-live="polite">
              <p className="eyebrow">Your {selectedBookings.length === 1 ? "lesson" : "lessons"}</p>
              <h3>{selectedDate ? formatLongDate(`${selectedDate}T12:00:00Z`) : "Choose a day"}</h3>
              {selectedBookings.map((booking) => (
                <button
                  className="lesson-calendar__lesson"
                  key={booking.reference}
                  onClick={() => manage(booking)}
                  type="button"
                >
                  <LessonMark className="lesson-calendar__mark" lessonTypeId={booking.lessonType.id} />
                  <span className="lesson-calendar__lesson-copy">
                    <strong>{formatSlotTime(booking.startAt)} Porto time</strong>
                    <span>
                      {booking.lessonType.name} · {formatLessonDuration(booking.lessonType.durationMinutes)} ·{" "}
                      {booking.location === "porto" ? "In Porto" : "Online"}
                    </span>
                    {differingLocalTime(booking.startAt, zone) ? (
                      <small>
                        <Globe2 size={14} aria-hidden="true" />
                        {differingLocalTime(booking.startAt, zone)} your time
                      </small>
                    ) : null}
                    {booking.changeLocked ? (
                      <small className="lesson-calendar__notice">
                        This lesson is today and can&rsquo;t be changed.
                      </small>
                    ) : booking.sameDayFeeApplies ? (
                      <small className="lesson-calendar__notice">
                        Changing it today costs {formatMoneyCents(feeCents)}.
                      </small>
                    ) : null}
                  </span>
                  <ChevronRight aria-hidden="true" size={20} />
                </button>
              ))}
            </aside>
          </div>
        ) : (
          <p className="booking-state-note">Nothing booked yet.</p>
        )}
      </section>
      ) : null}

      {showHistory && past.length ? (
        <section className="my-lessons__group">
          <h2>History</h2>
          <ul className="lesson-list lesson-list--past">
            {past.map((booking) => (
              <li key={booking.reference}>
                <div className="lesson-list__body">
                  <h3>
                    {booking.lessonType.name}
                    {booking.status === "cancelled" ? <em> · cancelled</em> : null}
                  </h3>
                  <p>
                    <CalendarDays size={16} aria-hidden="true" />
                    {formatLongDate(booking.startAt)}, {formatSlotTime(booking.startAt)}
                  </p>
                </div>
                <span className="lesson-list__reference">{booking.reference}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
