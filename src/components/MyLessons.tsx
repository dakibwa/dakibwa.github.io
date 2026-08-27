"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, Clock3, Globe2, MapPin, Repeat } from "lucide-react";
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
  differingLocalTime,
  formatLongDate,
  formatMoneyCents,
  formatSlotTime,
  stopSeries
} from "@/lib/booking-api";
import { BOOKING_TIME_ZONE, formatLessonDuration } from "@/lib/config";

/** Index matches the Worker's weekday, which is 0 = Sunday. */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function minutesToClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function MyLessons() {
  const [student, setStudent] = useState<Student | null>(null);
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [series, setSeries] = useState<LessonSeries[]>([]);
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
    load();
  }, [load]);

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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That repeat could not be stopped.");
    } finally {
      setStopping("");
    }
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
        intro="Your lessons, and any changes you want to make to them, all live here."
        onSignedIn={(signedIn) => {
          setStudent(signedIn);
          setLoading(true);
          load();
        }}
      />
    );
  }

  /*
   * Both lists come from one query sorted newest-first, which is right for what
   * has happened and backwards for what has not: it put a student's next lesson
   * at the bottom of "Coming up" and one three months away at the top. Soonest
   * first going forward, most recent first going back — in both cases the one
   * you care about is the one you land on.
   */
  const upcoming = bookings
    .filter((booking) => !booking.isPast && booking.status === "confirmed")
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const past = bookings
    .filter((booking) => booking.isPast || booking.status === "cancelled")
    .sort((a, b) => b.startAt.localeCompare(a.startAt));

  return (
    <div className="my-lessons">
      <div className="my-lessons__header">
        <p>
          Signed in as <strong>{student.name}</strong> ({student.email})
        </p>
        <div className="my-lessons__header-actions">
          <button className="text-action" onClick={() => setEditing((open) => !open)} type="button">
            {editing ? "Done" : "Edit details"}
          </button>
          <button
            className="button button--quiet"
            onClick={() => {
              clearSession();
              setStudent(null);
              setBookings([]);
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
            className="text-action"
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
            className="text-action"
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
              Your name changes straight away. A new email address has to confirm itself first, so nothing moves until
              you use the link we send it.
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
              <button
                className="text-action"
                disabled={stopping === entry.id}
                onClick={() => stopRepeating(entry.id)}
                type="button"
              >
                {stopping === entry.id ? "Stopping…" : "Stop repeating"}
              </button>
            </div>
          ))}
          <p className="my-lessons__series-note">
            Stopping a repeat keeps the lessons already booked — cancel any of them on its own below.
          </p>
        </section>
      ) : null}

      <section className="my-lessons__group">
        <h2>Coming up</h2>
        {upcoming.length ? (
          <ul className="lesson-list">
            {upcoming.map((booking) => (
              <li key={booking.reference}>
                <LessonMark className="lesson-list__mark" lessonTypeId={booking.lessonType.id} />
                <div className="lesson-list__body">
                  {/* The date is what tells one of these apart from the next.
                      The lesson type was the heading on every card, which on a
                      page of eight read as the same word eight times — it is
                      still there, in the line that carries the other details. */}
                  <h3>
                    {formatLongDate(booking.startAt)}, {formatSlotTime(booking.startAt)}
                    <em> Porto time</em>
                  </h3>
                  {differingLocalTime(booking.startAt, zone) ? (
                    <p>
                      <span>
                        <Globe2 size={16} aria-hidden="true" />
                        {differingLocalTime(booking.startAt, zone)} your time
                      </span>
                    </p>
                  ) : null}
                  <p>
                    <span>
                      <Clock3 size={16} aria-hidden="true" />
                      {booking.lessonType.name} · {formatLessonDuration(booking.lessonType.durationMinutes)}
                    </span>
                    <span>
                      <MapPin size={16} aria-hidden="true" />
                      {booking.location === "porto" ? "In Porto" : "Online"}
                    </span>
                  </p>
                  {booking.seriesId && series.some((entry) => entry.id === booking.seriesId) ? (
                    <p className="lesson-list__repeats">
                      <Repeat size={16} aria-hidden="true" />
                      One of your weekly lessons
                    </p>
                  ) : null}
                  {booking.sameDayFeeApplies ? (
                    <p className="lesson-list__fee">
                      This lesson is today — changing or cancelling it now costs {formatMoneyCents(feeCents)}.
                    </p>
                  ) : null}
                </div>
                <div className="lesson-list__actions">
                  <span className="lesson-list__reference">{booking.reference}</span>
                  <a className="button button--coral" href={`/booking/?token=${encodeURIComponent(booking.manageToken)}`}>
                    Move or cancel
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="booking-state-note">
            Nothing booked yet. <a href="/book/">Book a lesson</a> whenever you like.
          </p>
        )}
      </section>

      {past.length ? (
        <section className="my-lessons__group">
          <h2>Earlier</h2>
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
