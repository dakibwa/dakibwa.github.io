"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { AssetMark } from "@/components/BrandMarks";
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
  previewSeries,
  shortMonth,
  type LessonType,
  type RepeatChoice,
  type SeriesOutcome,
  type Slot
} from "@/lib/booking-api";
import { BOOKING_TIME_ZONE, CONTACT_WHATSAPP_URL, SAME_DAY_RESCHEDULE_FEE_CENTS, formatLessonDuration } from "@/lib/config";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Step = "lesson" | "day" | "time" | "details";

/** "once" is a real choice, not the absence of one, so it lives in the union. */
type RepeatOption = "once" | 4 | "open";
type FormState = { notes: string; location: "online" | "porto"; repeat: RepeatOption };
const emptyForm: FormState = { notes: "", location: "online", repeat: "once" };

const REPEAT_OPTIONS: { value: RepeatOption; label: string }[] = [
  { value: "once", label: "Just once" },
  { value: 4, label: "4 weeks" },
  { value: "open", label: "Every week" }
];

/** The wire form: `undefined` books one lesson, `null` repeats indefinitely. */
function repeatPayload(option: RepeatOption): RepeatChoice | undefined {
  if (option === "once") return undefined;
  return option === "open" ? null : option;
}

type Confirmation = {
  reference: string;
  startAt: string;
  manageUrl: string;
  email: string;
  series?: SeriesOutcome;
};

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
  const [seriesPreview, setSeriesPreview] = useState<{ bookable: string[]; skipped: string[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
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

      /*
       * Ask for more than the horizon and let the Worker clamp it, rather than
       * hard-coding a window that has to be remembered every time the horizon
       * moves. It was fixed at 62 days while the grid was sized from whatever
       * horizon the API reported — so raising the horizon past 62 would have
       * drawn weeks of empty cells announcing "no times free", which would have
       * been a lie rather than a gap.
       */
      fetchAvailability(lessonTypeId, todayKey, addDaysToKey(todayKey, 140), signal)
        .then((data) => {
          setSlotsByDate(data.slotsByDate);
          setHorizonDays(data.horizonDays || 90);
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

  /*
   * Which weeks a repeat would actually take, asked for before anything is
   * booked. A student who picks eight weeks and gets seven should learn that
   * while they can still change their mind, not from the confirmation email.
   */
  useEffect(() => {
    const repeat = repeatPayload(form.repeat);
    if (repeat === undefined || !chosen || !lessonType || !student) {
      setSeriesPreview(null);
      setPreviewing(false);
      return;
    }

    let cancelled = false;
    setPreviewing(true);

    previewSeries(readSession(), { lessonType: lessonType.id, startAt: chosen.startAt, weeks: repeat })
      .then((result) => {
        if (cancelled) return;
        setSeriesPreview({ bookable: result.bookable, skipped: result.skipped });
      })
      .catch(() => {
        // The confirm step re-checks every week anyway, so a failed preview
        // costs a reassurance, not correctness.
        if (!cancelled) setSeriesPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.repeat, chosen, lessonType, student]);

  const canSubmit = Boolean(chosen && lessonType && student) && !submitting;

  /*
   * The confirmation mounts its region and its text in one commit, which is the
   * case a live region is least reliable at announcing. Moving focus to the
   * heading is what the step changes already do, and it works here for the same
   * reason: it says the thing and puts the reader at the top of it.
   */
  useEffect(() => {
    if (!confirmation) return;
    const frame = requestAnimationFrame(() => document.getElementById("booking-success-heading")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [confirmation]);

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
      const repeat = repeatPayload(form.repeat);
      const result = await createBooking(readSession(), {
        notes: form.notes.trim(),
        lessonType: lessonType.id,
        startAt: chosen.startAt,
        location: form.location,
        timezone: studentZone,
        // Omitted entirely for a one-off: `null` means "every week" on the wire.
        ...(repeat === undefined ? {} : { repeat })
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
        email: result.booking.studentEmail,
        series: result.series
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
        {/* The tick and the word sat above the heading and pushed everything
            down a screen that is mostly one sentence of good news. Beside it,
            they confirm the same thing and cost no height. */}
        <div className="booking-success__head">
          <h2 id="booking-success-heading" tabIndex={-1}>
            You&rsquo;re booked in.
          </h2>
          <p className="eyebrow booking-success__badge">
            <CheckCircle2 size={18} aria-hidden="true" />
            Booked
          </p>
        </div>
        <p className="booking-success__when">
          {formatLongDate(confirmation.startAt)} at {formatSlotTime(confirmation.startAt)} Porto time
          {localTime ? ` · ${localTime} your time` : ""}
        </p>
        <p>
          A confirmation and calendar invitation are on their way to <strong>{confirmation.email}</strong>.
        </p>

        {confirmation.series ? (
          <div className="booking-success__series">
            <p>
              <strong>
                {confirmation.series.booked.length}{" "}
                {confirmation.series.booked.length === 1 ? "lesson" : "lessons"} booked
              </strong>
              {confirmation.series.openEnded
                ? " — and this time stays yours every week until you stop it."
                : " at the same time each week."}
            </p>
            {confirmation.series.skipped.length ? (
              <div className="booking-alert booking-alert--warn booking-skipped">
                <AlertCircle size={18} aria-hidden="true" />
                <div>
                  <p>
                    <strong>
                      {confirmation.series.skipped.length === 1
                        ? "One week wasn't free, so it is not booked"
                        : `${confirmation.series.skipped.length} weeks weren't free, so they are not booked`}
                    </strong>
                  </p>
                  <ul>
                    {confirmation.series.skipped.map((startAt) => (
                      <li key={startAt}>{formatLongDate(startAt)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <dl className="booking-success__reference">
          <dt>Your reference</dt>
          <dd>{confirmation.reference}</dd>
        </dl>
        {/* The email is no longer the only way back. Everything a student has
            booked is in their own area, so that leads, and the emailed link
            stays for this one lesson because it works without signing in. */}
        <div className="booking-success__actions">
          <Link className="button button--coral" href="/my-lessons/">
            Go to your lessons
          </Link>
          <a className="text-action" href={confirmation.manageUrl}>
            Change or cancel this one
          </a>
        </div>
        <p className="booking-success__note">
          Everything you book lives in your lessons, and you can move or cancel any of it there. Changing on the day of
          the lesson costs {formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}; any earlier is free. Not coming without
          telling her is half the lesson.
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
            <div className="booking-step-head booking-step-head--lesson">
              <h2 className="booking-step-heading" id="booking-step-heading" tabIndex={-1}>
                Which lesson?
              </h2>
              <a className="button button--coral booking-existing-link" href="/my-lessons/">
                Already booked? Sign in
              </a>
            </div>
            {/* No list roles here. An explicit role replaces the implicit one,
                so role="listitem" on a <button> destroyed the button role and
                these announced as unnamed list items — the first step of the
                booking flow, unusable to a screen reader. */}
            <div className="lesson-choice">
              {lessonTypes.map((type) => (
                <button
                  className="lesson-card"
                  key={type.id}
                  onClick={() => {
                    setLessonTypeId(type.id);
                    setSelectedSlot("");
                    goTo("day");
                  }}
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

          </>
        ) : null}

        {step === "day" ? (
          <>
            <div className="booking-step-head">
              <h2 className="booking-step-heading" id="booking-step-heading" tabIndex={-1}>
                Pick a day
              </h2>
              <button className="booking-back" onClick={() => goTo("lesson")} type="button">
                <ArrowLeft size={16} aria-hidden="true" /> Back
              </button>
            </div>

            <div className="calendar-panel">
              <AssetMark asset="/visuals/v2-splats/at-your-pace-splat-v2.svg" className="calendar-panel__mark" />
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
            <h2 className="booking-step-heading" id="booking-step-heading" tabIndex={-1}>
              {selectedDate ? formatLongDate(`${selectedDate}T12:00:00Z`) : "Choose a time"}
            </h2>
            <div className="booking-step-note-row">
              <p className="booking-step-note">
                {lessonType ? `${lessonType.name} · ${formatLessonDuration(lessonType.duration_minutes)}` : ""} · Porto
                time
              </p>
              <button className="booking-back" onClick={() => goTo("day")} type="button">
                <ArrowLeft size={16} aria-hidden="true" /> Back
              </button>
            </div>

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
                  {/* The only way back from this step now, so it reads as a
                      control rather than as a footnote. */}
                  <button className="booking-recap__change" onClick={() => goTo("time")} type="button">
                    <ArrowLeft size={14} aria-hidden="true" />
                    Change time
                  </button>
                </div>
              </aside>

              {checkingSession ? (
                <p className="booking-state-note">One moment…</p>
              ) : !student ? (
                <AuthPanel
                  heading="Almost there"
                  initialMode="register"
                  keepCopy
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

                  {/* The same segmented control the account tabs use. Two small
                      radios read as a stray form control among her buttons, and
                      the choice is one of the two things a student actually
                      decides here — it should look like a decision. The radios
                      are still what holds the state; they are only unpainted. */}
                  <fieldset className="booking-location-choice">
                    <legend>Where</legend>
                    <div className={`segmented segmented--${form.location}`}>
                      <span aria-hidden="true" className="segmented__thumb" />
                      {(["online", "porto"] as const).map((option) => (
                        <label className={form.location === option ? "is-active" : ""} key={option}>
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
                    </div>
                  </fieldset>

                  {/* Radios again rather than buttons, so the whole thing is one
                      group to a screen reader and to the arrow keys. */}
                  <fieldset className="booking-repeat-choice">
                    <legend>How often</legend>
                    <div className="chip-choice">
                      {REPEAT_OPTIONS.map((option) => (
                        <label
                          className={form.repeat === option.value ? "is-active" : ""}
                          key={String(option.value)}
                        >
                          <input
                            checked={form.repeat === option.value}
                            name="repeat"
                            onChange={() => setForm((current) => ({ ...current, repeat: option.value }))}
                            type="radio"
                            value={String(option.value)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>

                    {form.repeat !== "once" ? (
                      <>
                        <p className="booking-repeat-note" role="status">
                          {previewing ? (
                            "Checking which weeks are free…"
                          ) : seriesPreview ? (
                            <>
                              <strong>
                                {seriesPreview.bookable.length}{" "}
                                {seriesPreview.bookable.length === 1 ? "lesson" : "lessons"}
                              </strong>{" "}
                              at this time
                              {form.repeat === "open" ? ", and it keeps going until you stop it" : ""}.
                            </>
                          ) : (
                            "You can move or cancel any single lesson later without stopping the rest."
                          )}
                        </p>

                        {/* Its own block, not a clause at the end of a sentence.
                            A student picking four weeks and getting three needs
                            to see which week they will not have — and it was the
                            quietest thing on the panel. */}
                        {!previewing && seriesPreview?.skipped.length ? (
                          <div className="booking-alert booking-alert--warn booking-skipped" role="status">
                            <AlertCircle size={18} aria-hidden="true" />
                            <div>
                              <p>
                                <strong>
                                  {seriesPreview.skipped.length === 1
                                    ? "One week isn't free"
                                    : `${seriesPreview.skipped.length} weeks aren't free`}
                                </strong>{" "}
                                — you won&rsquo;t have a lesson{" "}
                                {seriesPreview.skipped.length === 1 ? "that week" : "those weeks"}.
                              </p>
                              <ul>
                                {seriesPreview.skipped.map((startAt) => (
                                  <li key={startAt}>{formatLongDate(startAt)}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
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

                  {/* Says what is actually about to happen. "Confirm this lesson"
                      above a preview reading "8 lessons" invites the reader to
                      believe only the first one is being booked. */}
                  <button className="button button--coral booking-confirm-button" disabled={!canSubmit} type="submit">
                    {submitting
                      ? "Booking…"
                      : form.repeat === "once"
                        ? "Confirm this lesson"
                        : seriesPreview
                          ? `Confirm ${seriesPreview.bookable.length === 1 ? "this lesson" : `these ${seriesPreview.bookable.length} lessons`}`
                          : "Confirm these lessons"}
                  </button>

                  <p className="booking-form-note">
                    You don&rsquo;t pay now &mdash; Inês will arrange payment with you directly. Change your booking
                    any time from your <a href="/my-lessons/">lessons page</a>; changing on the same day is{" "}
                    <strong>{formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}</strong>, and not turning up is half the
                    lesson.
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
