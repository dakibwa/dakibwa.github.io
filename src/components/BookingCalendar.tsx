"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Globe2,
  MapPin,
  MessageSquareText
} from "lucide-react";
import { AuthPanel } from "@/components/AuthPanel";
import { LessonMark } from "@/components/LessonMarks";
import { clearSession, fetchMe, readSession, type Student } from "@/lib/auth-api";
import {
  addDaysToKey,
  browserTimeZone,
  buildBookingWeeks,
  createBooking,
  differingLocalTime,
  fetchAvailability,
  formatLongDate,
  formatMoneyCents,
  formatSlotTime,
  listLessonTypes,
  portoDateKey,
  shortMonth,
  type LessonType,
  type Slot
} from "@/lib/booking-api";
import { BOOKING_TIME_ZONE, CONTACT_WHATSAPP_URL, SAME_DAY_RESCHEDULE_FEE_CENTS, formatLessonDuration } from "@/lib/config";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Step = "lesson" | "day" | "time" | "details";

type FormState = { notes: string; location: "online" | "porto" };
const emptyForm: FormState = { notes: "", location: "online" };

type Confirmation = { reference: string; startAt: string; manageUrl: string; email: string };

/**
 * Times read more easily grouped by part of day than as one long grid, and it
 * keeps each group short enough to scan on a phone.
 */
function groupSlots(slots: Slot[]) {
  const groups: { label: string; slots: Slot[] }[] = [
    { label: "Morning", slots: [] },
    { label: "Afternoon", slots: [] },
    { label: "Evening", slots: [] }
  ];

  for (const slot of slots) {
    const hour = Number(formatSlotTime(slot.startAt).slice(0, 2));
    groups[hour < 12 ? 0 : hour < 17 ? 1 : 2].slots.push(slot);
  }

  return groups.filter((group) => group.slots.length);
}

export function BookingCalendar() {
  const [step, setStep] = useState<Step>("lesson");
  const [lessonTypes, setLessonTypes] = useState<LessonType[]>([]);
  const [lessonTypeId, setLessonTypeId] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const [horizonDays, setHorizonDays] = useState(30);
  const [slotsByDate, setSlotsByDate] = useState<Record<string, Slot[]>>({});
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [studentZone, setStudentZone] = useState(BOOKING_TIME_ZONE);
  const [student, setStudent] = useState<Student | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const lessonType = lessonTypes.find((type) => type.id === lessonTypeId) ?? null;

  useEffect(() => {
    const key = portoDateKey(new Date());
    setTodayKey(key);
    setStudentZone(browserTimeZone());

    listLessonTypes()
      .then(({ lessonTypes: types }) => setLessonTypes(types))
      .catch((error: Error) => setLoadError(error.message));

    const session = readSession();
    if (!session) {
      setCheckingSession(false);
      return;
    }

    fetchMe(session)
      .then((data) => setStudent(data?.student ?? null))
      .catch(() => clearSession())
      .finally(() => setCheckingSession(false));
  }, []);

  const loadAvailability = useCallback(
    (signal?: AbortSignal) => {
      if (!lessonTypeId || !todayKey) return;

      setLoadingSlots(true);
      setLoadError("");

      // The whole bookable horizon in one request: it is 30 days, so there is
      // nothing to page through and no month navigation to get wrong.
      fetchAvailability(lessonTypeId, todayKey, addDaysToKey(todayKey, 62), signal)
        .then((data) => {
          setSlotsByDate(data.slotsByDate);
          setHorizonDays(data.horizonDays || 30);
        })
        .catch((error: Error) => {
          if (signal?.aborted) return;
          setSlotsByDate({});
          setLoadError(error.message);
        })
        .finally(() => {
          if (!signal?.aborted) setLoadingSlots(false);
        });
    },
    [lessonTypeId, todayKey]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadAvailability(controller.signal);
    return () => controller.abort();
  }, [loadAvailability]);

  const calendarWeeks = useMemo(
    () => (todayKey ? buildBookingWeeks(todayKey, horizonDays) : []),
    [todayKey, horizonDays]
  );
  const daySlots = selectedDate ? slotsByDate[selectedDate] ?? [] : [];
  const chosen = daySlots.find((slot) => slot.startAt === selectedSlot) ?? null;

  const canSubmit = Boolean(chosen && lessonType && student) && !submitting;

  function goTo(next: Step) {
    setStep(next);
    setSubmitError("");
    // Moving focus to the heading is what makes a stepped flow usable with a
    // screen reader; without it the change is silent.
    requestAnimationFrame(() => document.getElementById("booking-step-heading")?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !chosen || !lessonType) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const result = await createBooking(readSession(), {
        notes: form.notes.trim(),
        lessonType: lessonType.id,
        startAt: chosen.startAt,
        location: form.location,
        timezone: studentZone
      });

      // With prepayment on, the slot is only held: Stripe finishes the booking.
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      setConfirmation({
        reference: result.booking.reference,
        startAt: result.booking.startAt,
        manageUrl: result.manageUrl ?? "/my-lessons/",
        email: result.booking.studentEmail
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The booking could not be created.";
      setSubmitError(message);
      if (/taken|available/i.test(message)) {
        loadAvailability();
        goTo("time");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    const localTime = differingLocalTime(confirmation.startAt, studentZone);
    return (
      <section className="booking-success" aria-live="polite">
        <CheckCircle2 size={40} aria-hidden="true" />
        <p className="eyebrow">Booked</p>
        <h2>You&rsquo;re booked in.</h2>
        <p className="booking-success__when">
          {formatLongDate(confirmation.startAt)} at {formatSlotTime(confirmation.startAt)} Porto time
          {localTime ? ` · ${localTime} your time` : ""}
        </p>
        <p>
          A confirmation is on its way to <strong>{confirmation.email}</strong>, with a calendar invitation and a link to
          change or cancel the lesson yourself.
        </p>
        <dl className="booking-success__reference">
          <dt>Your reference</dt>
          <dd>{confirmation.reference}</dd>
        </dl>
        <a className="button button--coral" href={confirmation.manageUrl}>
          Manage this booking
        </a>
        <p className="booking-success__note">
          Keep that email — it&rsquo;s how you get back to this booking. Changing on the day of the lesson costs{" "}
          {formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}; any earlier is free.
        </p>
      </section>
    );
  }

  return (
    <section className="booking-steps" aria-label="Book a Portuguese lesson">
      {loadError ? (
        <div className="booking-alert" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          <p>
            {loadError}{" "}
            <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
              Message Inês instead
            </a>
            .
          </p>
        </div>
      ) : null}

      <div className="booking-stage">
        {step === "lesson" ? (
          <>
            <h2 className="booking-step-heading" id="booking-step-heading" tabIndex={-1}>
              Which lesson?
            </h2>
            <div className="lesson-choice" role="list">
              {lessonTypes.map((type) => (
                <button
                  className="lesson-card"
                  key={type.id}
                  onClick={() => {
                    setLessonTypeId(type.id);
                    setSelectedSlot("");
                    goTo("day");
                  }}
                  role="listitem"
                  type="button"
                >
                  <LessonMark className="lesson-card__mark" lessonTypeId={type.id} />
                  <span className="lesson-card__text">
                    <strong>{type.name}</strong>
                    <span className="lesson-card__meta">
                      {formatLessonDuration(type.duration_minutes)} · {formatMoneyCents(type.price_cents)}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" size={20} />
                </button>
              ))}
              {!lessonTypes.length && !loadError ? <p className="booking-state-note">Loading lessons…</p> : null}
            </div>

            <p className="booking-existing">
              Already have a lesson booked? <a href="/my-lessons/">Move or cancel it</a>.
            </p>
          </>
        ) : null}

        {step === "day" ? (
          <>
            <button className="booking-back" onClick={() => goTo("lesson")} type="button">
              <ArrowLeft size={17} aria-hidden="true" /> {lessonType?.name ?? "Lesson"}
            </button>
            <h2 className="booking-step-heading" id="booking-step-heading" tabIndex={-1}>
              Pick a day
            </h2>

            <div className="calendar-panel">
              <div className="calendar-weekdays" aria-hidden="true">
                {weekdayLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div aria-busy={loadingSlots}>
                {calendarWeeks.map((week) => (
                  <Fragment key={week.key}>
                    {week.showMonth ? <p className="calendar-month">{week.month}</p> : null}
                    <div className="calendar-week">
                      {week.cells.map((cell) => {
                        const slots = slotsByDate[cell.key] ?? [];
                        return (
                          <button
                            aria-label={`${formatLongDate(`${cell.key}T12:00:00Z`)}${
                              slots.length ? `, ${slots.length} times free` : ", no times free"
                            }`}
                            className={`${slots.length ? "has-availability" : ""}${cell.isToday ? " is-today" : ""}`}
                            disabled={!slots.length}
                            key={cell.key}
                            onClick={() => {
                              setSelectedDate(cell.key);
                              setSelectedSlot("");
                              goTo("time");
                            }}
                            type="button"
                          >
                            <span>
                              {cell.day}
                              {cell.month !== week.monthNumber ? <em>{shortMonth(cell.month, cell.key)}</em> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Fragment>
                ))}
              </div>
              {loadingSlots ? <p className="booking-state-note">Checking what&rsquo;s free…</p> : null}
            </div>
          </>
        ) : null}

        {step === "time" ? (
          <>
            <button className="booking-back" onClick={() => goTo("day")} type="button">
              <ArrowLeft size={17} aria-hidden="true" /> Another day
            </button>
            <h2 className="booking-step-heading" id="booking-step-heading" tabIndex={-1}>
              {selectedDate ? formatLongDate(`${selectedDate}T12:00:00Z`) : "Choose a time"}
            </h2>
            <p className="booking-step-note">
              {lessonType ? `${lessonType.name} · ${formatLessonDuration(lessonType.duration_minutes)}` : ""} · Porto time
            </p>

            {daySlots.length ? (
              <div className="time-groups">
                {groupSlots(daySlots).map((group) => (
                  <div className="time-group" key={group.label}>
                    <h3>{group.label}</h3>
                    <div className="slot-grid">
                      {group.slots.map((slot) => {
                        const local = differingLocalTime(slot.startAt, studentZone);
                        return (
                          <button
                            key={slot.startAt}
                            onClick={() => {
                              setSelectedSlot(slot.startAt);
                              goTo("details");
                            }}
                            type="button"
                          >
                            {formatSlotTime(slot.startAt)}
                            {local ? <small>{local} your time</small> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="booking-state-note">No times free on this day. Go back and pick another.</p>
            )}
          </>
        ) : null}

        {step === "details" ? (
          <>
            <button className="booking-back" onClick={() => goTo("time")} type="button">
              <ArrowLeft size={15} aria-hidden="true" /> Change time
            </button>
            <h2 className="booking-step-heading" id="booking-step-heading" tabIndex={-1}>
              {student ? "Confirm your lesson" : "Sign in to confirm"}
            </h2>

            <div className="booking-final">
              <aside className="booking-recap">
                <LessonMark className="booking-recap__mark" lessonTypeId={lessonType?.id ?? "single"} />
                <h3>{lessonType?.name}</h3>
                <p>
                  <CalendarDays size={17} aria-hidden="true" />
                  <span>{chosen ? `${formatLongDate(chosen.startAt)}, ${formatSlotTime(chosen.startAt)}` : "—"}</span>
                </p>
                {chosen && differingLocalTime(chosen.startAt, studentZone) ? (
                  <p>
                    <Globe2 size={17} aria-hidden="true" />
                    {differingLocalTime(chosen.startAt, studentZone)} your time
                  </p>
                ) : null}
                <div className="booking-recap__pair">
                  <p>
                    <Clock3 size={17} aria-hidden="true" />
                    {lessonType ? formatLessonDuration(lessonType.duration_minutes) : "—"}
                  </p>
                  <p>
                    <MapPin size={17} aria-hidden="true" />
                    {form.location === "porto" ? "In Porto" : "Online"}
                  </p>
                </div>
                {/* One control rather than a Change beside each line: two sat at
                    the top competing with the heading, and the time is the only
                    one worth reaching for from here. */}
                <div className="booking-recap__foot">
                  {lessonType ? <strong>{formatMoneyCents(lessonType.price_cents)}</strong> : null}
                  <button className="booking-recap__change" onClick={() => goTo("time")} type="button">
                    Change time
                  </button>
                </div>
              </aside>

              {checkingSession ? (
                <p className="booking-state-note">One moment…</p>
              ) : !student ? (
                <AuthPanel
                  heading="Almost there"
                  intro="An account keeps all your lessons in one place, so you can move or cancel any of them whenever you like."
                  onSignedIn={setStudent}
                />
              ) : (
                <form className="student-details-form" onSubmit={submit}>
                  <p className="booking-identity">
                    Booking as <strong>{student.name}</strong> ({student.email}){" "}
                    <button
                      onClick={() => {
                        clearSession();
                        setStudent(null);
                      }}
                      type="button"
                    >
                      Not you?
                    </button>
                  </p>

                  <fieldset className="booking-location-choice">
                    <legend>Where</legend>
                    {(["online", "porto"] as const).map((option) => (
                      <label key={option}>
                        <input
                          checked={form.location === option}
                          name="location"
                          onChange={() => setForm((current) => ({ ...current, location: option }))}
                          type="radio"
                          value={option}
                        />
                        <span>{option === "online" ? "Online" : "In Porto"}</span>
                      </label>
                    ))}
                  </fieldset>

                  <label>
                    <span>
                      <MessageSquareText size={16} aria-hidden="true" />
                      Anything Inês should know <em>(optional)</em>
                    </span>
                    <textarea
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                      rows={3}
                      value={form.notes}
                    />
                  </label>

                  {submitError ? (
                    <div className="booking-alert" role="alert">
                      <AlertCircle size={18} aria-hidden="true" />
                      <p>{submitError}</p>
                    </div>
                  ) : null}

                  <button className="button button--coral booking-confirm-button" disabled={!canSubmit} type="submit">
                    {submitting ? "Booking…" : "Confirm this lesson"}
                  </button>

                  <p className="booking-form-note">
                    You don&rsquo;t pay now. Inês will arrange payment with you directly.
                  </p>
                </form>
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
