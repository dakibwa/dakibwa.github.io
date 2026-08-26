"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, Clock3, Globe2, MapPin } from "lucide-react";
import { AuthPanel } from "@/components/AuthPanel";
import { LessonMark } from "@/components/LessonMarks";
import {
  clearSession,
  fetchMe,
  readSession,
  type MyBooking,
  type Student
} from "@/lib/auth-api";
import { browserTimeZone, differingLocalTime, formatLongDate, formatMoneyCents, formatSlotTime } from "@/lib/booking-api";
import { BOOKING_TIME_ZONE, formatLessonDuration } from "@/lib/config";

export function MyLessons() {
  const [student, setStudent] = useState<Student | null>(null);
  const [bookings, setBookings] = useState<MyBooking[]>([]);
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
      setBookings(data.bookings);
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

  if (loading) return <p className="booking-state-note">Loading your lessons…</p>;

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

  const upcoming = bookings.filter((booking) => !booking.isPast && booking.status === "confirmed");
  const past = bookings.filter((booking) => booking.isPast || booking.status === "cancelled");

  return (
    <div className="my-lessons">
      <div className="my-lessons__header">
        <p>
          Signed in as <strong>{student.name}</strong> ({student.email})
        </p>
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

      {error ? (
        <div className="booking-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <p>{error}</p>
        </div>
      ) : null}

      <section className="my-lessons__group">
        <h2>Coming up</h2>
        {upcoming.length ? (
          <ul className="lesson-list">
            {upcoming.map((booking) => (
              <li key={booking.reference}>
                <LessonMark className="lesson-list__mark" lessonTypeId={booking.lessonType.id} />
                <div className="lesson-list__body">
                  <h3>{booking.lessonType.name}</h3>
                  <p>
                    <CalendarDays size={16} aria-hidden="true" />
                    {formatLongDate(booking.startAt)}, {formatSlotTime(booking.startAt)} Porto time
                  </p>
                  {differingLocalTime(booking.startAt, zone) ? (
                    <p>
                      <Globe2 size={16} aria-hidden="true" />
                      {differingLocalTime(booking.startAt, zone)} your time
                    </p>
                  ) : null}
                  <p>
                    <Clock3 size={16} aria-hidden="true" />
                    {formatLessonDuration(booking.lessonType.durationMinutes)}
                    <MapPin size={16} aria-hidden="true" />
                    {booking.location === "porto" ? "In Porto" : "Online"}
                  </p>
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
