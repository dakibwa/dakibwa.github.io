"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Globe2, MapPin } from "lucide-react";
import {
  addDaysToKey,
  browserTimeZone,
  buildMonthGrid,
  cancelBooking,
  fetchAvailability,
  fetchBooking,
  formatLongDate,
  formatMoneyCents,
  differingLocalTime,
  formatSlotTime,
  portoDateKey,
  rescheduleBooking,
  type Booking,
  type Slot
} from "@/lib/booking-api";
import { BOOKING_TIME_ZONE, CONTACT_WHATSAPP_URL, formatLessonDuration } from "@/lib/config";

const monthLabelFormatter = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

type Mode = "view" | "reschedule" | "confirm-cancel";
type Outcome = { kind: "rescheduled" | "cancelled"; sameDayFee: boolean } | null;

export function ManageBooking() {
  const [token, setToken] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isPast, setIsPast] = useState(false);
  const [sameDayFeeApplies, setSameDayFeeApplies] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [mode, setMode] = useState<Mode>("view");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [working, setWorking] = useState(false);
  const [studentZone, setStudentZone] = useState(BOOKING_TIME_ZONE);

  const [monthKey, setMonthKey] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const [slotsByDate, setSlotsByDate] = useState<Record<string, Slot[]>>({});
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    const key = portoDateKey(new Date());
    setTodayKey(key);
    setMonthKey(key.slice(0, 7));
    setStudentZone(browserTimeZone());

    const params = new URLSearchParams(window.location.search);
    const found = params.get("token");
    if (!found) {
      setError("This page needs the link from your confirmation email.");
      setLoading(false);
      return;
    }

    setToken(found);
    fetchBooking(found)
      .then((data) => {
        setBooking(data.booking);
        setIsPast(data.isPast);
        setSameDayFeeApplies(data.sameDayFeeApplies);
      })
      .catch((caught: Error) => setError(caught.message))
      .finally(() => setLoading(false));
  }, []);

  const loadSlots = useCallback(
    (signal?: AbortSignal) => {
      if (!booking || !monthKey || !todayKey || mode !== "reschedule") return;

      const monthStart = `${monthKey}-01`;
      setLoadingSlots(true);

      fetchAvailability(booking.lessonType.id, monthStart < todayKey ? todayKey : monthStart, addDaysToKey(`${monthKey}-01`, 41), signal)
        .then((data) => {
          setSlotsByDate(data.slotsByDate);
          setSelectedDate((current) =>
            current && data.slotsByDate[current]?.length ? current : Object.keys(data.slotsByDate).sort()[0] ?? ""
          );
        })
        .catch(() => setSlotsByDate({}))
        .finally(() => {
          if (!signal?.aborted) setLoadingSlots(false);
        });
    },
    [booking, monthKey, todayKey, mode]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadSlots(controller.signal);
    return () => controller.abort();
  }, [loadSlots]);

  const calendarDays = useMemo(() => (monthKey ? buildMonthGrid(monthKey) : []), [monthKey]);

  async function doReschedule() {
    if (!token || !selectedSlot) return;
    setWorking(true);
    setActionError("");
    try {
      const result = await rescheduleBooking(token, selectedSlot);
      setBooking(result.booking);
      setOutcome({ kind: "rescheduled", sameDayFee: result.sameDayFeeApplied });
      setMode("view");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "That change could not be made.");
      loadSlots();
    } finally {
      setWorking(false);
    }
  }

  async function doCancel() {
    if (!token) return;
    setWorking(true);
    setActionError("");
    try {
      const result = await cancelBooking(token);
      setBooking(result.booking);
      setOutcome({ kind: "cancelled", sameDayFee: result.sameDayFeeApplied });
      setMode("view");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "That lesson could not be cancelled.");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <p className="booking-state-note">Finding your booking…</p>;
  }

  if (error || !booking) {
    return (
      <div className="booking-alert" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <p>
          {error || "That booking could not be found."} If you can&rsquo;t find your confirmation email,{" "}
          <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
            message Inês
          </a>{" "}
          and she&rsquo;ll sort it out.
        </p>
      </div>
    );
  }

  const cancelled = booking.status === "cancelled";

  return (
    <div className="manage-booking">
      {outcome ? (
        <div className="booking-outcome" role="status">
          <CheckCircle2 size={22} aria-hidden="true" />
          <div>
            <strong>
              {outcome.kind === "rescheduled" ? "Your lesson has been moved." : "Your lesson has been cancelled."}
            </strong>
            <p>
              We&rsquo;ve emailed you the details and updated your calendar.
              {outcome.sameDayFee
                ? ` Because this was on the day of the lesson, the ${formatMoneyCents(
                    booking.sameDayFeeCents
                  )} same-day fee applies — Inês will mention it.`
                : ""}
            </p>
          </div>
        </div>
      ) : null}

      <div className="manage-booking__card">
        <p className="eyebrow">{cancelled ? "Cancelled" : "Your booking"}</p>
        <h2>{booking.lessonType.name}</h2>
        <dl className="manage-booking__facts">
          <div>
            <dt>
              <CalendarDays size={17} aria-hidden="true" /> Porto time
            </dt>
            <dd className={cancelled ? "is-struck" : ""}>
              {formatLongDate(booking.startAt)}, {formatSlotTime(booking.startAt)}
            </dd>
          </div>
          {differingLocalTime(booking.startAt, studentZone) ? (
            <div>
              <dt>
                <Globe2 size={17} aria-hidden="true" /> Your time
              </dt>
              <dd className={cancelled ? "is-struck" : ""}>
                {formatLongDate(booking.startAt, studentZone)}, {formatSlotTime(booking.startAt, studentZone)}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>
              <Clock3 size={17} aria-hidden="true" /> Length
            </dt>
            <dd>{formatLessonDuration(booking.lessonType.durationMinutes)}</dd>
          </div>
          <div>
            <dt>
              <MapPin size={17} aria-hidden="true" /> Where
            </dt>
            <dd>{booking.location === "porto" ? "In person, in Porto" : "Online"}</dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>{booking.reference}</dd>
          </div>
        </dl>
      </div>

      {cancelled ? (
        <p className="booking-state-note">
          This lesson is cancelled. You&rsquo;re very welcome to <a href="/book/">book another one</a>.
        </p>
      ) : isPast ? (
        <p className="booking-state-note">This lesson has already happened, so it can no longer be changed here.</p>
      ) : (
        <>
          {sameDayFeeApplies && !outcome ? (
            <div className="booking-alert booking-alert--warn" role="status">
              <AlertCircle size={18} aria-hidden="true" />
              <p>
                Your lesson is today. Changing or cancelling now means the{" "}
                {formatMoneyCents(booking.sameDayFeeCents)} same-day fee applies.
              </p>
            </div>
          ) : null}

          {actionError ? (
            <div className="booking-alert" role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <p>{actionError}</p>
            </div>
          ) : null}

          {mode === "view" ? (
            <div className="manage-booking__actions">
              <button className="button button--coral" onClick={() => setMode("reschedule")} type="button">
                Move to another time
              </button>
              <button className="button button--quiet" onClick={() => setMode("confirm-cancel")} type="button">
                Cancel this lesson
              </button>
            </div>
          ) : null}

          {mode === "confirm-cancel" ? (
            <div className="manage-booking__confirm">
              <p>
                Cancel your {booking.lessonType.name.toLowerCase()} on {formatLongDate(booking.startAt)} at{" "}
                {formatSlotTime(booking.startAt)}? This can&rsquo;t be undone — you&rsquo;d need to book again.
              </p>
              <div className="manage-booking__actions">
                <button className="button button--coral" disabled={working} onClick={doCancel} type="button">
                  {working ? "Cancelling…" : "Yes, cancel it"}
                </button>
                <button className="button button--quiet" onClick={() => setMode("view")} type="button">
                  Keep my lesson
                </button>
              </div>
            </div>
          ) : null}

          {mode === "reschedule" ? (
            <div className="manage-booking__reschedule">
              <div className="calendar-section-heading">
                <h3>Pick a new time</h3>
                <p>All times are Porto time.</p>
              </div>

              <div className="calendar-month-nav">
                <button
                  aria-label="Previous month"
                  disabled={monthKey <= todayKey.slice(0, 7)}
                  onClick={() => {
                    const [year, month] = monthKey.split("-").map(Number);
                    const previous = new Date(Date.UTC(year, month - 2, 1));
                    setMonthKey(`${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`);
                  }}
                  type="button"
                >
                  <ChevronLeft size={20} />
                </button>
                <strong>{monthKey ? monthLabelFormatter.format(new Date(`${monthKey}-01T12:00:00Z`)) : ""}</strong>
                <button
                  aria-label="Next month"
                  onClick={() => {
                    const [year, month] = monthKey.split("-").map(Number);
                    const next = new Date(Date.UTC(year, month, 1));
                    setMonthKey(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
                  }}
                  type="button"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="calendar-weekdays" aria-hidden="true">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div className="calendar-grid">
                {calendarDays.map((cell) => {
                  const slots = slotsByDate[cell.key] ?? [];
                  return (
                    <button
                      aria-pressed={selectedDate === cell.key}
                      className={
                        selectedDate === cell.key ? "is-selected" : slots.length ? "has-availability" : ""
                      }
                      disabled={!slots.length}
                      key={cell.key}
                      onClick={() => {
                        setSelectedDate(cell.key);
                        setSelectedSlot("");
                      }}
                      type="button"
                    >
                      <span className={cell.inMonth ? "" : "is-muted"}>{cell.day}</span>
                    </button>
                  );
                })}
              </div>

              {loadingSlots ? (
                <p className="booking-state-note">Checking what&rsquo;s free…</p>
              ) : (slotsByDate[selectedDate] ?? []).length ? (
                <div className="slot-grid">
                  {(slotsByDate[selectedDate] ?? []).map((slot) => (
                    <button
                      aria-pressed={selectedSlot === slot.startAt}
                      className={selectedSlot === slot.startAt ? "is-selected" : ""}
                      key={slot.startAt}
                      onClick={() => setSelectedSlot(slot.startAt)}
                      type="button"
                    >
                      {formatSlotTime(slot.startAt)}
                      {differingLocalTime(slot.startAt, studentZone) ? (
                        <small>{differingLocalTime(slot.startAt, studentZone)} your time</small>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="booking-state-note">No times free on this day. Try another.</p>
              )}

              <div className="manage-booking__actions">
                <button
                  className="button button--coral"
                  disabled={!selectedSlot || working}
                  onClick={doReschedule}
                  type="button"
                >
                  {working ? "Moving…" : selectedSlot ? `Move to ${formatSlotTime(selectedSlot)}` : "Choose a time"}
                </button>
                <button className="button button--quiet" onClick={() => setMode("view")} type="button">
                  Never mind
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
