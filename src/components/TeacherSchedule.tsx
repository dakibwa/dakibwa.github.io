"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Repeat2,
} from "lucide-react";
import { AuthPanel } from "@/components/AuthPanel";
import { WeeklyTimetable } from "@/components/teacher/WeeklyTimetable";
import { DaysOffCalendar } from "@/components/teacher/DaysOffCalendar";
import { LessonDetails } from "@/components/teacher/LessonDetails";
import { ManualLessonForm } from "@/components/teacher/ManualLessonForm";
import {
  addException,
  fetchBookings,
  fetchSchedule,
  removeException,
  saveRules,
  type AdminBooking,
  type AvailabilityException,
} from "@/lib/admin-api";
import { fetchMe, readSession, type Student } from "@/lib/auth-api";
import { portoTimeToUtc } from "@/lib/booking-api";
import { BOOKING_CONFIGURED } from "@/lib/config";
import { SITE_BASE_PATH } from "@/lib/paths";
import {
  dateKey,
  dateLabel,
  daysOff,
  hoursFromRules,
  hoursProblem,
  isWholeDayOff,
  mondayOf,
  serialiseHours,
  shiftDate,
  type WeekHours,
} from "@/lib/teacher-calendar";

const emptyWeek = hoursFromRules([]);

export function TeacherSchedule() {
  const [token, setToken] = useState("");
  const [me, setMe] = useState<Student | null>(null);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authAttempt, setAuthAttempt] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const today = dateKey(now);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [mobileDay, setMobileDay] = useState(
    () => (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7,
  );
  const [editing, setEditing] = useState(false);
  const [savedHours, setSavedHours] = useState<WeekHours>(emptyWeek);
  const [draftHours, setDraftHours] = useState<WeekHours>(emptyWeek);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [draftDaysOff, setDraftDaysOff] = useState<Set<string>>(new Set());
  const [dayOffNote, setDayOffNote] = useState("");
  const [interval, setIntervalMinutes] = useState(30);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(
    null,
  );
  const [paymentReview, setPaymentReview] = useState<
    { id: string; reference: string }[]
  >([]);
  const [initialised, setInitialised] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleAttempt, setScheduleAttempt] = useState(0);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState("");
  const [savingHours, setSavingHours] = useState(false);
  const [savingDays, setSavingDays] = useState(false);
  const [daysNeedRefresh, setDaysNeedRefresh] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const bookingRequest = useRef(0);
  const topRef = useRef<HTMLElement>(null);
  const savedDaysOff = useMemo(() => daysOff(exceptions), [exceptions]);
  const dayOffNotes = useMemo(() => {
    const notes = new Map<string, string>();
    for (const exception of exceptions.filter(isWholeDayOff)) {
      if (exception.note)
        notes.set(
          exception.date,
          [notes.get(exception.date), exception.note]
            .filter(Boolean)
            .join(" · "),
        );
    }
    return notes;
  }, [exceptions]);
  const hoursDirty = serialiseHours(savedHours) !== serialiseHours(draftHours);
  const invalidHours = hoursProblem(draftHours);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const session = readSession();
    if (!session) {
      setChecking(false);
      return;
    }
    setChecking(true);
    setAuthError("");
    fetchMe(session)
      .then((data) => {
        if (!active) return;
        setMe(data?.student ?? null);
        if (data?.student.role === "teacher") setToken(session);
      })
      .catch(() => {
        if (active)
          setAuthError("We couldn’t check your account. Please try again.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [authAttempt]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setScheduleError("");
    fetchSchedule(token)
      .then((schedule) => {
        if (!active) return;
        const hours = hoursFromRules(schedule.rules);
        setSavedHours(hours);
        setDraftHours(hours);
        setExceptions(schedule.exceptions);
        setDraftDaysOff(daysOff(schedule.exceptions));
        setIntervalMinutes(schedule.settings?.slotIntervalMinutes ?? 30);
        setInitialised(true);
      })
      .catch((caught) => {
        if (active)
          setScheduleError(
            caught instanceof Error
              ? caught.message
              : "Your teaching hours could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, scheduleAttempt]);

  const reloadBookings = useCallback(async () => {
    if (!token) return;
    const request = ++bookingRequest.current;
    setBookingsLoading(true);
    setBookingsError("");
    try {
      // Include an overnight lesson that began before the displayed week.
      const fromDate = [
        shiftDate(weekStart, -1),
        shiftDate(today, -1),
      ].sort()[0];
      const result = await fetchBookings(
        token,
        portoTimeToUtc(fromDate, "00:00"),
      );
      if (request !== bookingRequest.current) return;
      setBookings(
        result.bookings.filter((booking) => booking.status === "confirmed"),
      );
      setPaymentReview(result.manualPaymentReconciliation ?? []);
    } catch (caught) {
      if (request === bookingRequest.current)
        setBookingsError(
          caught instanceof Error
            ? caught.message
            : "The lessons for this week could not be loaded.",
        );
    } finally {
      if (request === bookingRequest.current) setBookingsLoading(false);
    }
  }, [token, weekStart, today]);

  useEffect(() => {
    void reloadBookings();
  }, [reloadBookings]);

  useEffect(() => {
    const dirty =
      hoursDirty ||
      [...new Set([...savedDaysOff, ...draftDaysOff])].some(
        (date) => savedDaysOff.has(date) !== draftDaysOff.has(date),
      );
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hoursDirty, savedDaysOff, draftDaysOff]);

  async function saveHours() {
    if (savingHours || invalidHours) return;
    setSavingHours(true);
    setError("");
    setStatus("");
    const submitted = draftHours;
    try {
      await saveRules(
        token,
        Object.entries(submitted).flatMap(([day, windows]) =>
          windows.map((window) => ({
            weekday: Number(day),
            startMinute: window.start,
            lastStartMinute: window.lastStart,
          })),
        ),
      );
      setSavedHours(submitted);
      setStatus("Teaching hours saved. Students can now book these times.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your hours could not be saved. Your changes are still here.",
      );
    } finally {
      setSavingHours(false);
    }
  }

  async function refreshDays() {
    const schedule = await fetchSchedule(token);
    setExceptions(schedule.exceptions);
    setDaysNeedRefresh(false);
    return daysOff(schedule.exceptions);
  }

  async function saveDays() {
    if (savingDays || daysNeedRefresh) return;
    setSavingDays(true);
    setError("");
    setStatus("");
    try {
      const changed = [...new Set([...savedDaysOff, ...draftDaysOff])]
        .filter(
          (date) =>
            date >= today && savedDaysOff.has(date) !== draftDaysOff.has(date),
        )
        .sort();
      for (const date of changed) {
        if (draftDaysOff.has(date)) await addException(token, date, dayOffNote);
        else
          for (const exception of exceptions.filter(
            (item) => item.date === date && isWholeDayOff(item),
          ))
            await removeException(token, exception.id);
      }
      setDraftDaysOff(await refreshDays());
      setDayOffNote("");
      setStatus("Days off saved. Existing lessons are unchanged.");
    } catch {
      // Reconcile completed writes before retrying a partly saved selection.
      // Keep the intended draft, and never remove partial-day/extra-hour rows.
      try {
        await refreshDays();
      } catch {
        setDaysNeedRefresh(true);
      }
      setError(
        "Not all days off could be saved. Your remaining changes are still selected. Reload if needed, then try again.",
      );
    } finally {
      setSavingDays(false);
    }
  }

  const bookedCounts = new Map<string, number>();
  for (const booking of bookings) {
    const first = dateKey(new Date(booking.starts_at));
    const last = dateKey(new Date(Date.parse(booking.ends_at) - 1));
    for (let day = first; day <= last; day = shiftDate(day, 1))
      bookedCounts.set(day, (bookedCounts.get(day) ?? 0) + 1);
  }
  const weekEnd = shiftDate(weekStart, 6);
  const weekCount = bookings.filter(
    (booking) =>
      dateKey(new Date(booking.starts_at)) <= weekEnd &&
      dateKey(new Date(Date.parse(booking.ends_at) - 1)) >= weekStart,
  ).length;

  if (!BOOKING_CONFIGURED)
    return (
      <p className="booking-state-note">
        The booking service is not connected yet.
      </p>
    );
  if (checking)
    return (
      <p className="teacher-loading" role="status">
        Opening your schedule…
      </p>
    );
  if (authError)
    return (
      <div className="teacher-inline-error" role="alert">
        <p>{authError}</p>
        <button
          className="teacher-text-button"
          type="button"
          onClick={() => setAuthAttempt((value) => value + 1)}
        >
          Try again
        </button>
      </div>
    );
  if (!token) {
    if (me)
      return (
        <div className="booking-alert" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          <p>
            You&rsquo;re signed in as {me.name}, and this page is Inês&rsquo;s.
            If it should be yours,{" "}
            <a href={`${SITE_BASE_PATH}/book/?view=lessons`}>switch account</a>.
          </p>
        </div>
      );
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
  if (scheduleError)
    return (
      <div className="teacher-inline-error" role="alert">
        <p>{scheduleError}</p>
        <button
          className="teacher-text-button"
          type="button"
          onClick={() => setScheduleAttempt((value) => value + 1)}
        >
          Reload schedule
        </button>
      </div>
    );
  if (!initialised)
    return (
      <p className="teacher-loading" role="status">
        Loading your teaching hours…
      </p>
    );

  return (
    <div className="teacher-workspace">
      {paymentReview.length ? (
        <div className="teacher-inline-notice" role="status">
          <AlertCircle size={19} aria-hidden="true" />
          <p>
            {paymentReview.length}{" "}
            {paymentReview.length === 1
              ? "payment or refund needs"
              : "payments or refunds need"}{" "}
            review: {paymentReview.map((item) => item.reference).join(", ")}.
            Review these in Stripe before retrying. Their lessons remain locked
            until the result is confirmed.
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="teacher-inline-error" role="alert">
          {error}
        </div>
      ) : null}
      {status ? (
        <div className="teacher-inline-success" role="status">
          <Check size={17} aria-hidden="true" />
          {status}
        </div>
      ) : null}

      <section
        className="teacher-week"
        aria-labelledby="teacher-week-title"
        ref={topRef}
      >
        <div className="teacher-week-toolbar">
          <div className="teacher-week-title">
            <span className="teacher-eyebrow">
              {editing ? "Set your rhythm" : "Your week at a glance"}
            </span>
            <h2 id="teacher-week-title">
              {editing
                ? "Your usual week"
                : `${dateLabel(weekStart, { day: "numeric", month: "short" })} – ${dateLabel(weekEnd, { day: "numeric", month: "short", year: "numeric" })}`}
            </h2>
          </div>
          <div
            className="teacher-view-switch"
            role="group"
            aria-label="Calendar view"
          >
            <button
              type="button"
              aria-pressed={!editing}
              onClick={() => setEditing(false)}
            >
              Lessons
            </button>
            <button
              type="button"
              aria-pressed={editing}
              onClick={() => setEditing(true)}
            >
              Teaching hours
              {hoursDirty ? (
                <span
                  className="teacher-unsaved-dot"
                  aria-label="unsaved changes"
                />
              ) : null}
            </button>
          </div>
        </div>
        <div className="teacher-week-subbar">
          <p>
            {editing
              ? "Click or drag down a day to mark lesson start times."
              : "Choose a lesson to see its details, move it or cancel."}
          </p>
          {editing ? (
            <span className="teacher-repeat-note">
              <Repeat2 size={15} aria-hidden="true" />
              Repeats every week
            </span>
          ) : (
            <div className="teacher-week-navigation">
              <button
                className="teacher-icon-button"
                type="button"
                aria-label="Previous week"
                onClick={() => setWeekStart(shiftDate(weekStart, -7))}
              >
                <ChevronLeft size={19} aria-hidden="true" />
              </button>
              <button
                className="teacher-text-button"
                type="button"
                onClick={() => setWeekStart(mondayOf(today))}
              >
                This week
              </button>
              <button
                className="teacher-icon-button"
                type="button"
                aria-label="Next week"
                onClick={() => setWeekStart(shiftDate(weekStart, 7))}
              >
                <ChevronRight size={19} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        {!editing && bookingsLoading ? (
          <p className="teacher-calendar-loading" role="status">
            Loading this week&rsquo;s lessons…
          </p>
        ) : !editing && bookingsError ? (
          <div className="teacher-calendar-loading" role="alert">
            <p>{bookingsError}</p>
            <button
              className="teacher-text-button"
              type="button"
              onClick={() => void reloadBookings()}
            >
              Reload lessons
            </button>
          </div>
        ) : (
          <WeeklyTimetable
            weekStart={weekStart}
            hours={editing ? draftHours : savedHours}
            bookings={bookings}
            blockedDays={savedDaysOff}
            editing={editing}
            interval={interval}
            disabled={savingHours}
            mobileDay={mobileDay}
            onSelectDay={setMobileDay}
            onChange={(day, windows) => {
              setDraftHours((current) => ({ ...current, [day]: windows }));
              setStatus("");
            }}
            onSelectBooking={setSelectedBooking}
          />
        )}
        {editing ? (
          <div className="teacher-hours-save">
            <p className="teacher-secondary-copy">
              The last marked time is the last a lesson can{" "}
              <strong>start</strong>. A lesson can finish later.
            </p>
            <div className="teacher-save-row">
              <span className="teacher-save-note" aria-live="polite">
                {hoursDirty
                  ? "You have unsaved hours."
                  : "Your saved weekly hours."}
              </span>
              {hoursDirty ? (
                <button
                  className="teacher-text-button"
                  type="button"
                  disabled={savingHours}
                  onClick={() => setDraftHours(savedHours)}
                >
                  Discard
                </button>
              ) : null}
              <button
                className="button button--coral"
                type="button"
                disabled={savingHours || !hoursDirty || Boolean(invalidHours)}
                onClick={() => void saveHours()}
              >
                {savingHours ? "Saving…" : "Save teaching hours"}
              </button>
            </div>
            {invalidHours ? (
              <p className="teacher-inline-error" role="alert">
                {invalidHours}
              </p>
            ) : null}
          </div>
        ) : !bookingsLoading && !bookingsError && !weekCount ? (
          <p className="teacher-empty-week">
            No lessons booked this week. Your usual hours are shown above.
          </p>
        ) : null}
      </section>

      <DaysOffCalendar
        today={today}
        saved={savedDaysOff}
        selected={draftDaysOff}
        bookedCounts={bookedCounts}
        notes={dayOffNotes}
        busy={savingDays}
        needsRefresh={daysNeedRefresh}
        note={dayOffNote}
        onNote={setDayOffNote}
        onToggle={(date) => {
          setDraftDaysOff((current) => {
            const next = new Set(current);
            if (next.has(date)) next.delete(date);
            else next.add(date);
            return next;
          });
          setStatus("");
        }}
        onSave={() => void saveDays()}
        onDiscard={() => {
          setDraftDaysOff(savedDaysOff);
          setDayOffNote("");
        }}
        onRefresh={() => {
          setSavingDays(true);
          void refreshDays()
            .catch(() =>
              setError("Days off could not be reloaded. Please try again."),
            )
            .finally(() => setSavingDays(false));
        }}
        onViewLessons={(date) => {
          setMobileDay((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7);
          setWeekStart(mondayOf(date));
          setEditing(false);
          topRef.current?.scrollIntoView({
            block: "start",
            behavior: "instant",
          });
        }}
      />

      <ManualLessonForm token={token} onCreated={() => void reloadBookings()} />
      {selectedBooking ? (
        <LessonDetails
          key={selectedBooking.id}
          booking={selectedBooking}
          token={token}
          now={now}
          onClose={() => setSelectedBooking(null)}
          onChanged={(message) => {
            setSelectedBooking(null);
            setStatus(message);
            void reloadBookings();
          }}
        />
      ) : null}
    </div>
  );
}
