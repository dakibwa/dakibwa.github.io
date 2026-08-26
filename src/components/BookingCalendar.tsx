"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe2,
  MapPin,
  MessageSquareText
} from "lucide-react";
import { AuthPanel } from "@/components/AuthPanel";
import { LessonMark, SquiggleRule } from "@/components/LessonMarks";
import { clearSession, fetchMe, readSession, type Student } from "@/lib/auth-api";
import {
  addDaysToKey,
  browserTimeZone,
  buildMonthGrid,
  createBooking,
  differingLocalTime,
  fetchAvailability,
  formatLongDate,
  formatMoneyCents,
  formatSlotTime,
  listLessonTypes,
  portoDateKey,
  type LessonType,
  type Slot
} from "@/lib/booking-api";
import { BOOKING_TIME_ZONE, CONTACT_WHATSAPP_URL, SAME_DAY_RESCHEDULE_FEE_CENTS, formatLessonDuration } from "@/lib/config";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthLabelFormatter = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

type Step = "lesson" | "day" | "time" | "details";
const stepOrder: Step[] = ["lesson", "day", "time", "details"];

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
  const [monthKey, setMonthKey] = useState("");
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
    setMonthKey(key.slice(0, 7));
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
      if (!lessonTypeId || !monthKey || !todayKey) return;

      const monthStart = `${monthKey}-01`;
      setLoadingSlots(true);
      setLoadError("");

      fetchAvailability(lessonTypeId, monthStart < todayKey ? todayKey : monthStart, addDaysToKey(monthStart, 41), signal)
        .then((data) => setSlotsByDate(data.slotsByDate))
        .catch((error: Error) => {
          if (signal?.aborted) return;
          setSlotsByDate({});
          setLoadError(error.message);
        })
        .finally(() => {
          if (!signal?.aborted) setLoadingSlots(false);
        });
    },
    [lessonTypeId, monthKey, todayKey]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadAvailability(controller.signal);
    return () => controller.abort();
  }, [loadAvailability]);

  const calendarDays = useMemo(() => (monthKey ? buildMonthGrid(monthKey) : []), [monthKey]);
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

  function changeMonth(offset: number) {
    const [year, month] = monthKey.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + offset, 1));
    const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    if (offset < 0 && nextKey < todayKey.slice(0, 7)) return;
    setMonthKey(nextKey);
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

  const stepIndex = stepOrder.indexOf(step);
  const trail = [
    { step: "lesson" as Step, label: "Lesson", value: lessonType?.name ?? "" },
    { step: "day" as Step, label: "Day", value: selectedDate ? shortDateFormatter.format(new Date(`${selectedDate}T12:00:00Z`)) : "" },
    { step: "time" as Step, label: "Time", value: chosen ? `${formatSlotTime(chosen.startAt)} Porto` : "" },
    { step: "details" as Step, label: "Confirm", value: "" }
  ];

  return (
    <section className="booking-steps" aria-label="Book a Portuguese lesson">
      <ol className="booking-trail">
        {trail.map((entry, index) => {
          const done = index < stepIndex;
          const current = index === stepIndex;
          return (
            <li className={current ? "is-current" : done ? "is-done" : ""} key={entry.step}>
              <button
                aria-current={current ? "step" : undefined}
                disabled={!done}
                onClick={() => goTo(entry.step)}
                type="button"
              >
                <span className="booking-trail__index" aria-hidden="true">
                  {done ? <Check size={13} strokeWidth={3} /> : index + 1}
                </span>
                <span className="booking-trail__label">
                  {entry.label}
                  {done && entry.value ? <em>{entry.value}</em> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <SquiggleRule className="booking-squiggle" />

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
                  <strong>{type.name}</strong>
                  <span className="lesson-card__meta">
                    {formatLessonDuration(type.duration_minutes)} · {formatMoneyCents(type.price_cents)}
                  </span>
                  <span className="lesson-card__description">{type.description}</span>
                  <span className="lesson-card__go" aria-hidden="true">
                    Choose <ChevronRight size={15} />
                  </span>
                </button>
              ))}
              {!lessonTypes.length && !loadError ? <p className="booking-state-note">Loading lessons…</p> : null}
            </div>
          </>
        ) : null}

        {step === "day" ? (
          <>
            <button className="booking-back" onClick={() => goTo("lesson")} type="button">
              <ArrowLeft size={15} aria-hidden="true" /> Change lesson
            </button>
            <h2 className="booking-step-heading" id="booking-step-heading" tabIndex={-1}>
              Pick a day
            </h2>
            <p className="booking-step-note">
              Days with times free are outlined. All times are Porto time.
            </p>

            <div className="calendar-panel">
              <div className="calendar-month-nav">
                <button
                  aria-label="Previous month"
                  disabled={monthKey <= todayKey.slice(0, 7)}
                  onClick={() => changeMonth(-1)}
                  type="button"
                >
                  <ChevronLeft size={20} />
                </button>
                <strong>{monthKey ? monthLabelFormatter.format(new Date(`${monthKey}-01T12:00:00Z`)) : ""}</strong>
                <button aria-label="Next month" onClick={() => changeMonth(1)} type="button">
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="calendar-weekdays" aria-hidden="true">
                {weekdayLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div className="calendar-grid" aria-busy={loadingSlots}>
                {calendarDays.map((cell) => {
                  const slots = slotsByDate[cell.key] ?? [];
                  return (
                    <button
                      aria-label={`${formatLongDate(`${cell.key}T12:00:00Z`)}${
                        slots.length ? `, ${slots.length} times free` : ", no times free"
                      }`}
                      className={slots.length ? "has-availability" : ""}
                      disabled={!slots.length}
                      key={cell.key}
                      onClick={() => {
                        setSelectedDate(cell.key);
                        setSelectedSlot("");
                        goTo("time");
                      }}
                      type="button"
                    >
                      <span className={cell.inMonth ? "" : "is-muted"}>{cell.day}</span>
                      {slots.length ? <i aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
              {loadingSlots ? <p className="booking-state-note">Checking what&rsquo;s free…</p> : null}
            </div>
          </>
        ) : null}

        {step === "time" ? (
          <>
            <button className="booking-back" onClick={() => goTo("day")} type="button">
              <ArrowLeft size={15} aria-hidden="true" /> Pick another day
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
                  <Clock3 size={17} aria-hidden="true" />
                  {lessonType ? formatLessonDuration(lessonType.duration_minutes) : "—"}
                </p>
                <p>
                  <CalendarDays size={17} aria-hidden="true" />
                  {chosen ? `${formatLongDate(chosen.startAt)}, ${formatSlotTime(chosen.startAt)}` : "—"}
                </p>
                {chosen && differingLocalTime(chosen.startAt, studentZone) ? (
                  <p>
                    <Globe2 size={17} aria-hidden="true" />
                    {differingLocalTime(chosen.startAt, studentZone)} your time
                  </p>
                ) : null}
                <p>
                  <MapPin size={17} aria-hidden="true" />
                  {form.location === "porto" ? "In person, in Porto" : "Online"}
                </p>
                {lessonType ? <strong>{formatMoneyCents(lessonType.price_cents)}</strong> : null}
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
