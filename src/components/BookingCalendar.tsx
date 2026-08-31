"use client";

import { Fragment, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
/*
 * Loaded when it is needed, not before. The sign-in panel — with the Google
 * button, the segmented tabs and the whole account form behind it — is only
 * reached at the last step, and having it in the first chunk meant a student
 * choosing a lesson waited for code they might never see. It is fetched while
 * they are picking a date.
 */
const AuthPanel = dynamic(() => import("@/components/AuthPanel").then((m) => m.AuthPanel), {
  loading: () => <p className="booking-state-note">Loading…</p>
});
const AccountControls = dynamic(() => import("@/components/MyLessons").then((m) => m.MyLessons), {
  loading: () => <p className="booking-state-note">Loading your account…</p>
});
import { LessonMark } from "@/components/LessonMarks";
import { clearSession, fetchMe, readSession, type MyBooking, type Student } from "@/lib/auth-api";
import {
  addDaysToKey,
  browserTimeZone,
  buildBookingWeeks,
  cancelBooking,
  createBooking,
  differingLocalTime,
  fetchAvailability,
  fetchBooking,
  formatLongDate,
  formatMoneyCents,
  formatSlotTime,
  listLessonTypes,
  portoDateKey,
  previewSeries,
  rescheduleBooking,
  shortMonth,
  type ManagedBooking,
  type LessonType,
  type RepeatChoice,
  type SeriesOutcome,
  type Slot
} from "@/lib/booking-api";
import {
  BOOKING_HORIZON_DAYS_FALLBACK,
  BOOKING_TIME_ZONE,
  CONTACT_WHATSAPP_URL,
  SAME_DAY_RESCHEDULE_FEE_CENTS,
  STRIPE_PUBLISHABLE_KEY,
  formatLessonDuration
} from "@/lib/config";
import { staticLessonTypes } from "@/lib/lesson-products";

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
  manageToken: string;
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

/**
 * Stripe's embedded checkout: their payment form, mounted inside this page, so
 * paying never means leaving the site. The script is loaded only at the moment
 * a payment actually starts — the booking page carries no Stripe weight for
 * anyone browsing, and none at all until prepayment is switched on.
 */
declare global {
  interface Window {
    Stripe?: (publishableKey: string) => {
      initEmbeddedCheckout: (options: { clientSecret: string }) => Promise<{
        mount: (element: HTMLElement) => void;
        destroy: () => void;
      }>;
    };
  }
}

let stripeJs: Promise<void> | null = null;
function loadStripeJs() {
  if (typeof window !== "undefined" && window.Stripe) return Promise.resolve();
  if (!stripeJs) {
    stripeJs = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.onload = () => resolve();
      script.onerror = () => {
        stripeJs = null;
        reject(new Error("The payment form couldn't load. Please check your connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return stripeJs;
}

/**
 * A decision should hand the student to the next decision, especially on a
 * phone where the next panel sits below what they just chose. Two animation
 * frames let React commit the collapsed state before the browser measures the
 * new position. Reduced-motion preferences are respected.
 */
function orientTo(id: string, focus = false) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!target) return;
      if (focus) target.focus({ preventScroll: true });
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });
    });
  });
}

export function BookingCalendar({ initialManageToken = "" }: { initialManageToken?: string } = {}) {
  const [step, setStep] = useState<Step>("lesson");
  /*
   * Seeded from the published lesson copy so the three cards are in the static
   * HTML and on screen at first paint. Before this the first step was an empty
   * panel until the bundle had hydrated and a round trip had returned — four
   * seconds of nothing on a slow phone. The API answer overwrites this as soon
   * as it arrives, so the live table still decides names and prices.
   */
  const [lessonTypes, setLessonTypes] = useState<LessonType[]>(staticLessonTypes);
  // Payment at booking: set from the API, so the page tells the truth in
  // either mode without a rebuild when the switch is flipped.
  const [prepay, setPrepay] = useState(false);
  const [payment, setPayment] = useState<{ clientSecret: string } | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const paymentMountRef = useRef<HTMLDivElement>(null);

  // Mount Stripe's embedded form when a payment starts; tear it down when the
  // student backs out. Completion never reaches this effect — Stripe returns
  // the student back to this workspace itself.
  useEffect(() => {
    if (!payment || !STRIPE_PUBLISHABLE_KEY) return;
    let cancelled = false;
    let mounted: { destroy: () => void } | null = null;

    loadStripeJs()
      .then(() => {
        if (cancelled || !window.Stripe || !paymentMountRef.current) return;
        return window.Stripe(STRIPE_PUBLISHABLE_KEY)
          .initEmbeddedCheckout({ clientSecret: payment.clientSecret })
          .then((checkout) => {
            if (cancelled) {
              checkout.destroy();
              return;
            }
            mounted = checkout;
            if (paymentMountRef.current) checkout.mount(paymentMountRef.current);
          });
      })
      .catch((error: Error) => {
        if (!cancelled) setPaymentError(error.message);
      });

    return () => {
      cancelled = true;
      mounted?.destroy();
    };
  }, [payment]);
  const [lessonTypeId, setLessonTypeId] = useState("");
  const [todayKey, setTodayKey] = useState("");
  const [horizonDays, setHorizonDays] = useState(BOOKING_HORIZON_DAYS_FALLBACK);
  const [slotsByDate, setSlotsByDate] = useState<Record<string, Slot[]>>({});
  const [selectedDate, setSelectedDate] = useState("");
  const [calendarCompact, setCalendarCompact] = useState(false);
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
  const [myBookings, setMyBookings] = useState<MyBooking[]>([]);
  const [checkingSession, setCheckingSession] = useState(true);
  // Someone with a lesson behind them shouldn't see the trial at all — the
  // server refuses it anyway, but a card you can't book is a trap, not a choice.
  const [hadLesson, setHadLesson] = useState(false);
  const [trialNotice, setTrialNotice] = useState("");
  const [managedToken, setManagedToken] = useState("");
  const [managed, setManaged] = useState<ManagedBooking | null>(null);
  const [manageMode, setManageMode] = useState<"view" | "reschedule" | "confirm-cancel">("view");
  const [manageLoading, setManageLoading] = useState(false);
  const [manageWorking, setManageWorking] = useState(false);
  const [manageError, setManageError] = useState("");
  const [manageOutcome, setManageOutcome] = useState("");
  const [showAccountSignIn, setShowAccountSignIn] = useState(false);

  const lessonType = lessonTypes.find((type) => type.id === lessonTypeId) ?? null;

  const refreshStudent = useCallback(async () => {
    const session = readSession();
    if (!session) {
      setStudent(null);
      setMyBookings([]);
      setHadLesson(false);
      return null;
    }

    const data = await fetchMe(session);
    setStudent(data?.student ?? null);
    setMyBookings(data?.bookings ?? []);
    setHadLesson((data?.bookings ?? []).some((booking) => booking.status !== "cancelled"));
    return data;
  }, []);

  useEffect(() => {
    const key = portoDateKey(new Date());
    setTodayKey(key);
    setStudentZone(browserTimeZone());
    if (new URLSearchParams(window.location.search).get("view") === "lessons" && !readSession()) {
      setShowAccountSignIn(true);
    }

    listLessonTypes()
      .then(({ lessonTypes: types, prepay: prepayOn }) => {
        setLessonTypes(types);
        setPrepay(Boolean(prepayOn));
      })
      .catch((error: Error) => setLoadError(error.message));

    refreshStudent()
      .catch(() => clearSession())
      .finally(() => setCheckingSession(false));
  }, [refreshStudent]);

  // Signing in mid-flow can reveal a history the lesson step didn't know
  // about. If the trial is the current choice, step back rather than letting
  // the confirm button walk into the server's refusal.
  useEffect(() => {
    if (!hadLesson || lessonTypeId !== "trial") return;
    setLessonTypeId("");
    setSelectedSlot("");
    goTo("lesson");
    setTrialNotice("The trial is for a first lesson with Inês — you're past that! A single lesson is the same hour.");
  }, [hadLesson, lessonTypeId]);

  const openManaged = useCallback(async (token: string) => {
    if (!token) return;
    setCalendarCompact(true);
    setManagedToken(token);
    setManageLoading(true);
    setManageError("");
    setManageOutcome("");
    setManageMode("view");
    setSelectedSlot("");
    try {
      const result = await fetchBooking(token);
      setManaged(result);
      setSelectedDate(portoDateKey(new Date(result.booking.startAt)));
    } catch (caught) {
      setManaged(null);
      setManageError(caught instanceof Error ? caught.message : "That lesson could not be opened.");
    } finally {
      setManageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialManageToken) openManaged(initialManageToken);
  }, [initialManageToken, openManaged]);

  const availabilityLessonTypeId =
    manageMode === "reschedule" && managed ? managed.booking.lessonType.id : lessonTypeId;

  const loadAvailability = useCallback(
    (signal?: AbortSignal) => {
      if (!availabilityLessonTypeId || !todayKey) {
        setSlotsByDate({});
        setLoadingSlots(false);
        return;
      }

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
      fetchAvailability(availabilityLessonTypeId, todayKey, addDaysToKey(todayKey, 140), signal)
        .then((data) => {
          setSlotsByDate(data.slotsByDate);
          setHorizonDays(data.horizonDays || BOOKING_HORIZON_DAYS_FALLBACK);
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
    [availabilityLessonTypeId, todayKey]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadAvailability(controller.signal);
    return () => controller.abort();
  }, [loadAvailability]);

  const calendarBookings = myBookings
    .filter((booking) => !booking.isPast && booking.status === "confirmed")
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const bookingHistory = myBookings
    .filter((booking) => booking.isPast || booking.status === "cancelled")
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  if (
    managed &&
    !managed.isPast &&
    managed.booking.status === "confirmed" &&
    !calendarBookings.some((booking) => booking.reference === managed.booking.reference)
  ) {
    calendarBookings.push({
      reference: managed.booking.reference,
      status: managed.booking.status,
      startAt: managed.booking.startAt,
      endAt: managed.booking.endAt,
      location: managed.booking.location,
      notes: managed.booking.notes,
      lessonType: managed.booking.lessonType,
      isPast: managed.isPast,
      sameDayFeeApplies: managed.sameDayFeeApplies,
      changeLocked: managed.changeLocked,
      paymentStatus: managed.booking.paymentStatus,
      seriesId: null,
      manageToken: managedToken
    });
  }

  const bookingsByDate = calendarBookings.reduce<Record<string, MyBooking[]>>((dates, booking) => {
    const key = portoDateKey(new Date(booking.startAt));
    (dates[key] ??= []).push(booking);
    return dates;
  }, {});
  const latestBookingKey = calendarBookings.length
    ? portoDateKey(new Date(calendarBookings[calendarBookings.length - 1].startAt))
    : todayKey;
  const dayNumber = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86_400_000;
  };
  const visibleHorizon =
    todayKey && latestBookingKey
      ? Math.max(horizonDays, dayNumber(latestBookingKey) - dayNumber(todayKey) + 1)
      : horizonDays;
  const allCalendarWeeks = todayKey ? buildBookingWeeks(todayKey, visibleHorizon) : [];
  const firstRelevantWeek = allCalendarWeeks.findIndex((week) =>
    week.cells.some((cell) => Boolean(slotsByDate[cell.key]?.length || bookingsByDate[cell.key]?.length))
  );
  const currentWeekHasBooking = Boolean(
    allCalendarWeeks[0]?.cells.some((cell) => Boolean(bookingsByDate[cell.key]?.length))
  );
  const todayWeekday = todayKey ? new Date(`${todayKey}T12:00:00Z`).getUTCDay() : -1;
  const startsOnClosedWeekend = (todayWeekday === 0 || todayWeekday === 6) && !currentWeekHasBooking;
  const calendarWeeks =
    availabilityLessonTypeId && firstRelevantWeek > 0
      ? allCalendarWeeks.slice(firstRelevantWeek).map((week, index) =>
          index === 0 && !week.showMonth ? { ...week, showMonth: true } : week
        )
      : !availabilityLessonTypeId && startsOnClosedWeekend
        ? allCalendarWeeks.slice(1).map((week, index) =>
            index === 0 && !week.showMonth ? { ...week, showMonth: true } : week
          )
      : allCalendarWeeks;
  const selectedCalendarWeek = selectedDate
    ? calendarWeeks.find((week) => week.cells.some((cell) => cell.key === selectedDate))
    : undefined;
  const isCalendarCompact = calendarCompact && Boolean(selectedCalendarWeek);
  const displayedCalendarWeeks =
    isCalendarCompact && selectedCalendarWeek
      ? [{ ...selectedCalendarWeek, showMonth: true }]
      : calendarWeeks;
  const daySlots = selectedDate ? slotsByDate[selectedDate] ?? [] : [];
  const chosen = daySlots.find((slot) => slot.startAt === selectedSlot) ?? null;
  const selectedDayBookings = selectedDate ? bookingsByDate[selectedDate] ?? [] : [];
  const firstCalendarBookingStart = calendarBookings[0]?.startAt ?? "";
  const isConfirmingBooking = step === "details" && Boolean(lessonType && chosen) && !managed;

  useEffect(() => {
    if (selectedDate || !firstCalendarBookingStart) return;
    setSelectedDate(portoDateKey(new Date(firstCalendarBookingStart)));
  }, [firstCalendarBookingStart, selectedDate]);

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
    if (next === "details") {
      // Moving focus to the heading is what makes a stepped flow usable with a
      // screen reader; without it the change is silent.
      orientTo("booking-step-heading", true);
    } else if (next === "time") {
      orientTo("booking-next-step");
    } else if (next === "day") {
      orientTo("lesson-calendar");
    } else if (next === "lesson") {
      orientTo("booking-lesson-choice");
    }
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
      // Embedded mode mounts the payment form right here; hosted redirects.
      if (result.checkoutClientSecret) {
        if (STRIPE_PUBLISHABLE_KEY) {
          setPaymentError("");
          setPayment({ clientSecret: result.checkoutClientSecret });
          return;
        }
        setSubmitError("Payment isn't available just now. Please try again in a few minutes, or message Inês.");
        return;
      }
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      setConfirmation({
        reference: result.booking.reference,
        startAt: result.booking.startAt,
        manageUrl: result.manageUrl ?? "/book/?view=lessons",
        manageToken: result.manageToken ?? "",
        email: result.booking.studentEmail,
        series: result.series
      });
      void refreshStudent();
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

  async function moveManagedLesson() {
    if (!managedToken || !selectedSlot) return;
    setManageWorking(true);
    setManageError("");
    try {
      await rescheduleBooking(managedToken, selectedSlot);
      const refreshed = await fetchBooking(managedToken);
      setManaged(refreshed);
      setSelectedDate(portoDateKey(new Date(refreshed.booking.startAt)));
      setSelectedSlot("");
      setManageMode("view");
      setManageOutcome("Your lesson has been moved. We’ve emailed you and updated your calendar.");
      await refreshStudent();
    } catch (caught) {
      setManageError(caught instanceof Error ? caught.message : "That lesson could not be moved.");
      loadAvailability();
    } finally {
      setManageWorking(false);
    }
  }

  async function cancelManagedLesson() {
    if (!managedToken || !managed) return;
    setManageWorking(true);
    setManageError("");
    try {
      const result = await cancelBooking(managedToken);
      setManaged({ ...managed, booking: result.booking });
      setManageMode("view");
      setManageOutcome(
        result.booking.paymentStatus === "refunded"
          ? "Your lesson has been cancelled. Your refund is on its way back to your card."
          : "Your lesson has been cancelled. We’ve emailed you and updated your calendar."
      );
      await refreshStudent();
    } catch (caught) {
      setManageError(caught instanceof Error ? caught.message : "That lesson could not be cancelled.");
    } finally {
      setManageWorking(false);
    }
  }

  function closeManagedLesson() {
    setManaged(null);
    setManagedToken("");
    setManageMode("view");
    setManageError("");
    setManageOutcome("");
    setSelectedSlot("");
    if (new URLSearchParams(window.location.search).has("manage")) {
      window.history.replaceState({}, "", "/book/");
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
        <div className="booking-success__actions">
          <button
            className="button button--coral"
            onClick={() => {
              setConfirmation(null);
              setStep("day");
              setSelectedDate(portoDateKey(new Date(confirmation.startAt)));
            }}
            type="button"
          >
            Back to your calendar
          </button>
          <button
            className="text-action"
            onClick={() => {
              setConfirmation(null);
              if (confirmation.manageToken) openManaged(confirmation.manageToken);
              else window.location.assign(confirmation.manageUrl);
            }}
            type="button"
          >
            Change or cancel this one
          </button>
        </div>
        <p className="booking-success__note">
          This lesson is now marked on your calendar. You can open it there to move or cancel it. Changing on the day
          costs {formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}; any earlier is free.
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
        <div className="unified-booking__head">
          {checkingSession ? (
            <p className="booking-state-note">Checking your account…</p>
          ) : student ? (
            <div className="unified-booking__account">
              <p className="unified-booking__identity">
                Signed in as <strong>{student.name}</strong>
              </p>
            </div>
          ) : (
            <button className="text-action" onClick={() => setShowAccountSignIn(true)} type="button">
              Sign in to see your lessons
            </button>
          )}
        </div>

        {student ? (
          <section
            className="unified-account-controls"
            id="account-controls"
            aria-label="Account and repeating lessons"
          >
            <AccountControls
              embedded
              onSignedOut={() => {
                setStudent(null);
                setMyBookings([]);
                setHadLesson(false);
              }}
              showCalendar={false}
              showHistory={false}
            />
          </section>
        ) : null}

        {trialNotice ? (
          <div className="booking-alert" role="status">
            <AlertCircle size={18} aria-hidden="true" />
            <p>{trialNotice}</p>
          </div>
        ) : null}

        {!managed && !isConfirmingBooking ? (
          <div className="unified-booking__lesson-picker" id="booking-lesson-choice">
            {lessonType && step !== "lesson" ? (
              <div className="booking-choice-summary" aria-label="Chosen lesson type">
                <LessonMark className="booking-choice-summary__mark" lessonTypeId={lessonType.id} />
                <span className="booking-choice-summary__copy">
                  <span className="eyebrow">Booking</span>
                  <strong>{lessonType.name}</strong>
                  <small>
                    {formatLessonDuration(lessonType.duration_minutes)} · {formatMoneyCents(lessonType.price_cents)}
                  </small>
                </span>
                <button
                  className="text-action booking-choice-summary__change"
                  onClick={() => {
                    setSelectedSlot("");
                    setCalendarCompact(false);
                    goTo("lesson");
                  }}
                  type="button"
                >
                  Change lesson
                </button>
              </div>
            ) : (
              <>
                <p className="eyebrow">What would you like to book?</p>
                <div className="lesson-choice">
                  {(hadLesson ? lessonTypes.filter((type) => type.id !== "trial") : lessonTypes).map((type) => (
                    <button
                      aria-pressed={lessonTypeId === type.id}
                      className={`lesson-card${lessonTypeId === type.id ? " is-selected" : ""}`}
                      key={type.id}
                      onClick={() => {
                        if (type.id !== lessonTypeId) {
                          setLoadingSlots(true);
                          setSlotsByDate({});
                        }
                        setLessonTypeId(type.id);
                        setCalendarCompact(false);
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
                  {!lessonTypes.length && !loadError ? (
                    <p className="booking-state-note">No lessons are listed right now.</p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}

        {!isConfirmingBooking && !calendarBookings.length ? (
          <p className="unified-calendar__empty-summary">No lessons currently booked. Choose a lesson type to add one.</p>
        ) : null}

        {!isConfirmingBooking ? (
          <div className="unified-calendar" id="lesson-calendar">
          <div className="calendar-panel unified-calendar__grid">
            <AssetMark asset="/visuals/v2-splats/at-your-pace-splat-v2.svg" className="calendar-panel__mark" />
            <div className="unified-calendar__toolbar">
              <div className="unified-calendar__legend" aria-label="Calendar key">
                <span><i className="is-booked" aria-hidden="true" /> Your lesson</span>
                <span><i className="is-free" aria-hidden="true" /> Free to book</span>
              </div>
              {isCalendarCompact ? (
                <button
                  className="text-action unified-calendar__expand"
                  onClick={() => setCalendarCompact(false)}
                  type="button"
                >
                  Show all dates
                </button>
              ) : null}
            </div>
            <div className="calendar-weekdays" aria-hidden="true">
              {weekdayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div aria-busy={loadingSlots}>
              {displayedCalendarWeeks.map((week) => (
                <Fragment key={week.key}>
                  {week.showMonth ? <p className="calendar-month">{week.month}</p> : null}
                  <div className="calendar-week">
                    {week.cells.map((cell) => {
                      const slots = slotsByDate[cell.key] ?? [];
                      const lessons = bookingsByDate[cell.key] ?? [];
                      const lessonLabel = lessons.length === 1 ? "1 lesson" : `${lessons.length} lessons`;
                      return (
                        <button
                          aria-label={`${formatLongDate(`${cell.key}T12:00:00Z`)}${
                            lessons.length ? `, ${lessonLabel}` : ""
                          }${
                            slots.length
                              ? `, ${slots.length} times free`
                              : lessons.length
                                ? ""
                                : ", unavailable"
                          }`}
                          aria-pressed={selectedDate === cell.key}
                          className={`${slots.length ? "has-availability" : ""}${
                            lessons.length ? " has-booking" : ""
                          }${selectedDate === cell.key ? " is-selected" : ""}${cell.isToday ? " is-today" : ""}`}
                          disabled={!slots.length && !lessons.length}
                          key={cell.key}
                          onClick={() => {
                            setSelectedDate(cell.key);
                            setCalendarCompact(true);
                            setSelectedSlot("");
                            if (lessonType && !managed) goTo("time");
                            else orientTo("booking-next-step");
                          }}
                          type="button"
                        >
                          <span>
                            {cell.day}
                            {cell.month !== week.monthNumber ? <em>{shortMonth(cell.month, cell.key)}</em> : null}
                            {lessons.length ? (
                              <small className={lessons.length > 1 ? "calendar-booking-count" : undefined}>
                                {lessons.length === 1 ? formatSlotTime(lessons[0].startAt) : `${lessons.length}×`}
                              </small>
                            ) : null}
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

          <aside className="unified-calendar__panel" id="booking-next-step" aria-live="polite" tabIndex={-1}>
            {showAccountSignIn && !student ? (
              <AuthPanel
                heading="Sign in"
                headingLevel={3}
                initialMode="signin"
                intro="Your booked lessons will appear on this calendar."
                onSignedIn={(signedIn) => {
                  setStudent(signedIn);
                  setShowAccountSignIn(false);
                  void refreshStudent();
                }}
              />
            ) : manageLoading ? (
              <p className="booking-state-note">Opening your lesson…</p>
            ) : managed ? (
              <>
                <button className="booking-back" onClick={closeManagedLesson} type="button">
                  <ArrowLeft size={16} aria-hidden="true" /> Back to calendar
                </button>
                {manageOutcome ? (
                  <div className="booking-outcome" role="status">
                    <CheckCircle2 size={20} aria-hidden="true" />
                    <p>{manageOutcome}</p>
                  </div>
                ) : null}
                {manageError ? (
                  <div className="booking-alert" role="alert">
                    <AlertCircle size={18} aria-hidden="true" />
                    <p>{manageError}</p>
                  </div>
                ) : null}
                <p className="eyebrow">{managed.booking.status === "cancelled" ? "Cancelled" : "Your lesson"}</p>
                <h3>{managed.booking.lessonType.name}</h3>
                <dl className="unified-calendar__lesson-facts">
                  <div>
                    <dt>Date</dt>
                    <dd>{formatLongDate(managed.booking.startAt)}</dd>
                  </div>
                  <div>
                    <dt>Time</dt>
                    <dd>{formatSlotTime(managed.booking.startAt)} Porto time</dd>
                  </div>
                  <div>
                    <dt>Where</dt>
                    <dd>{managed.booking.location === "porto" ? "In Porto" : "Online"}</dd>
                  </div>
                </dl>

                {managed.changeLocked && managed.booking.status !== "cancelled" ? (
                  <p className="lesson-calendar__notice">
                    This lesson is today and can&rsquo;t be moved or cancelled.
                  </p>
                ) : managed.sameDayFeeApplies && managed.booking.status !== "cancelled" ? (
                  <p className="lesson-calendar__notice">
                    Changing or cancelling today costs {formatMoneyCents(managed.booking.sameDayFeeCents)}.
                  </p>
                ) : null}

                {manageMode === "view" &&
                managed.booking.status !== "cancelled" &&
                !managed.isPast &&
                !managed.changeLocked ? (
                  <div className="manage-booking__actions">
                    <button
                      className="button button--coral"
                      onClick={() => {
                        setManageMode("reschedule");
                        setSelectedSlot("");
                        setLoadingSlots(true);
                      }}
                      type="button"
                    >
                      Move this lesson
                    </button>
                    <button className="button button--quiet" onClick={() => setManageMode("confirm-cancel")} type="button">
                      Cancel lesson
                    </button>
                  </div>
                ) : null}

                {manageMode === "confirm-cancel" ? (
                  <div className="manage-booking__confirm">
                    <p>
                      Cancel this lesson?
                      {managed.refundOnCancel && managed.booking.amountCents
                        ? ` Your ${formatMoneyCents(managed.booking.amountCents)} comes back to your card.`
                        : ""}
                    </p>
                    <div className="manage-booking__actions">
                      <button className="button button--coral" disabled={manageWorking} onClick={cancelManagedLesson} type="button">
                        {manageWorking ? "Cancelling…" : "Yes, cancel it"}
                      </button>
                      <button className="button button--quiet" onClick={() => setManageMode("view")} type="button">
                        Keep my lesson
                      </button>
                    </div>
                  </div>
                ) : null}

                {manageMode === "reschedule" ? (
                  <div className="unified-calendar__move">
                    <p className="eyebrow">Pick a new time on this calendar</p>
                    <p className="booking-state-note">
                      {selectedDate ? formatLongDate(`${selectedDate}T12:00:00Z`) : "Choose a free day"} · Porto time
                    </p>
                    {daySlots.length ? (
                      <div className="slot-grid">
                        {daySlots.map((slot) => (
                          <button
                            aria-pressed={selectedSlot === slot.startAt}
                            className={selectedSlot === slot.startAt ? "is-selected" : ""}
                            key={slot.startAt}
                            onClick={() => setSelectedSlot(slot.startAt)}
                            type="button"
                          >
                            {formatSlotTime(slot.startAt)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="booking-state-note">Choose a day marked free.</p>
                    )}
                    <div className="manage-booking__actions">
                      <button
                        className="button button--coral"
                        disabled={!selectedSlot || manageWorking}
                        onClick={moveManagedLesson}
                        type="button"
                      >
                        {manageWorking
                          ? "Moving…"
                          : selectedSlot
                            ? `Move to ${formatSlotTime(selectedSlot)}`
                            : "Choose a time"}
                      </button>
                      <button className="booking-back" onClick={() => setManageMode("view")} type="button">
                        <ArrowLeft size={16} aria-hidden="true" /> Keep current time
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : manageError ? (
              <div className="booking-alert" role="alert">
                <AlertCircle size={18} aria-hidden="true" />
                <p>{manageError}</p>
              </div>
            ) : (
              <>
                <p className="eyebrow">{selectedDate ? "Selected day" : "Your calendar"}</p>
                <h3>{selectedDate ? formatLongDate(`${selectedDate}T12:00:00Z`) : "Choose a day"}</h3>

                {selectedDayBookings.length ? (
                  <div className="unified-calendar__bookings">
                    {selectedDayBookings.map((booking) => (
                      <button
                        className="lesson-calendar__lesson"
                        key={booking.reference}
                        onClick={() => openManaged(booking.manageToken)}
                        type="button"
                      >
                        <LessonMark className="lesson-calendar__mark" lessonTypeId={booking.lessonType.id} />
                        <span className="lesson-calendar__lesson-copy">
                          <strong>{formatSlotTime(booking.startAt)} Porto time</strong>
                          <span>
                            {booking.lessonType.name} · {booking.location === "porto" ? "In Porto" : "Online"}
                          </span>
                        </span>
                        <ChevronRight aria-hidden="true" size={20} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="booking-state-note">
                    {calendarBookings.length ? "No lesson booked on this day." : "No lessons currently booked."}
                  </p>
                )}

                {lessonType ? (
                  <div className="unified-calendar__availability">
                    <div>
                      <p className="eyebrow">Free for a {lessonType.name.toLowerCase()}</p>
                      <p className="booking-state-note">
                        {formatLessonDuration(lessonType.duration_minutes)} · {formatMoneyCents(lessonType.price_cents)} · Porto time
                      </p>
                    </div>
                    {!selectedDate ? (
                      <p className="booking-state-note">Choose a day marked free.</p>
                    ) : loadingSlots ? (
                      <p className="booking-state-note">Checking what&rsquo;s free…</p>
                    ) : daySlots.length ? (
                      <div className="time-groups">
                        {groupSlots(daySlots).map((group) => (
                          <div className="time-group" key={group.label}>
                            <h4>{group.label}</h4>
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
                      <p className="booking-state-note">No free times on this day.</p>
                    )}
                  </div>
                ) : (
                  <p className="unified-calendar__prompt">Choose a lesson type above to add free times to this calendar.</p>
                )}
              </>
            )}
          </aside>
          </div>
        ) : null}

        {isConfirmingBooking ? (
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
                {/* Who the booking is for lives with the rest of the recap, not
                    at the top of the form it was crowding. */}
                {student ? (
                  <p className="booking-identity">
                    Booking as <strong>{student.name}</strong> ({student.email}){" "}
                    <button
                      onClick={() => {
                        clearSession();
                        setStudent(null);
                        setMyBookings([]);
                        setHadLesson(false);
                      }}
                      type="button"
                    >
                      Not you?
                    </button>
                  </p>
                ) : null}
              </aside>

              {payment ? (
                <div className="booking-payment">
                  <p className="booking-payment__summary">
                    {lessonType?.name}
                    {lessonType ? ` · ${formatMoneyCents(lessonType.price_cents)}` : ""}
                    {form.repeat !== "once" ? " for your first lesson" : ""} — your time is held while you pay.
                  </p>
                  {paymentError ? (
                    <div className="booking-alert" role="alert">
                      <AlertCircle size={18} aria-hidden="true" />
                      <p>{paymentError}</p>
                    </div>
                  ) : null}
                  <div className="booking-payment__mount" ref={paymentMountRef} />
                  <button className="text-action" onClick={() => setPayment(null)} type="button">
                    Back — change something first
                  </button>
                </div>
              ) : checkingSession ? (
                <p className="booking-state-note">One moment…</p>
              ) : !student ? (
                <AuthPanel
                  heading="Almost there"
                  initialMode="register"
                  keepCopy
                  intro="An account keeps all your lessons in one place, so you can move or cancel any of them whenever you like."
                  onSignedIn={(signedIn) => {
                    setStudent(signedIn);
                    void refreshStudent();
                  }}
                />
              ) : (
                <form className="student-details-form" onSubmit={submit}>
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
                        ? prepay && lessonType
                          ? `Confirm and pay ${formatMoneyCents(lessonType.price_cents)}`
                          : "Confirm this lesson"
                        : seriesPreview
                          ? prepay && lessonType
                            ? `Confirm and pay ${formatMoneyCents(lessonType.price_cents)} for your first lesson`
                            : `Confirm ${seriesPreview.bookable.length === 1 ? "this lesson" : `these ${seriesPreview.bookable.length} lessons`}`
                          : "Confirm these lessons"}
                  </button>

                  {prepay && form.repeat !== "once" ? (
                    <p className="booking-form-note">
                      You&rsquo;ll pay your first lesson now, securely with Stripe — each later lesson goes to the same
                      card automatically on its own day. Move or cancel any lesson free until the day before from your{" "}
                      <button className="booking-form-note__calendar" onClick={() => goTo("time")} type="button">
                        lesson calendar
                      </button>
                      . On a lesson&rsquo;s own day it&rsquo;s yours:{" "}
                      <strong>no changes and no refunds</strong>.
                    </p>
                  ) : prepay ? (
                    <p className="booking-form-note">
                      You&rsquo;ll pay now, securely with Stripe. Move or cancel free until the day before from your{" "}
                      <button className="booking-form-note__calendar" onClick={() => goTo("time")} type="button">
                        lesson calendar
                      </button>{" "}
                      — a cancellation is refunded automatically. On the day of
                      the lesson it&rsquo;s yours: <strong>no changes and no refunds</strong>.
                    </p>
                  ) : (
                    <p className="booking-form-note">
                      You pay on the day, in person with Inês. Change your booking any time from your{" "}
                      <button className="booking-form-note__calendar" onClick={() => goTo("time")} type="button">
                        lesson calendar
                      </button>{" "}
                      &mdash; free until the day before,{" "}
                      <strong>{formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}</strong> on the day itself.
                    </p>
                  )}
                </form>
              )}
            </div>
          </>
        ) : null}

        {student && bookingHistory.length ? (
          <details className="booking-history">
            <summary>
              <span>History</span>
              <small>
                {bookingHistory.length} {bookingHistory.length === 1 ? "booking" : "bookings"}
              </small>
            </summary>
            <ul className="booking-history__list">
              {bookingHistory.map((booking) => (
                <li key={booking.reference}>
                  <div>
                    <strong>
                      {booking.lessonType.name}
                      {booking.status === "cancelled" ? <em> · cancelled</em> : null}
                    </strong>
                    <span>
                      <CalendarDays size={16} aria-hidden="true" />
                      {formatLongDate(booking.startAt)}, {formatSlotTime(booking.startAt)}
                    </span>
                  </div>
                  <small>{booking.reference}</small>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

    </section>
  );
}
