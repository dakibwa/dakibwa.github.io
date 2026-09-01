"use client";

import { Fragment, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
  MessageSquareText,
  Repeat,
  X
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
import { fetchMe, readSession, type LessonSeries, type MyBooking, type Student } from "@/lib/auth-api";
import {
  addDaysToKey,
  browserTimeZone,
  buildBookingWeeks,
  cancelBooking,
  createBooking,
  differingLocalTime,
  fetchAvailability,
  fetchBooking,
  formatBookedLessonLabel,
  formatLongDate,
  formatMoneyCents,
  formatSlotTime,
  listLessonTypes,
  portoDateKey,
  previewSeries,
  rescheduleBooking,
  shortMonth,
  stopSeries,
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
const weekdayNames = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

type Step = "pattern" | "repeat" | "lesson" | "day" | "time" | "details";
type BookingIntent = "choose" | "book" | "lessons";
type BookingKind = "" | "trial" | "once" | "recurring";
type CalendarWeekCount = 1 | 4 | 8;

/** "once" is a real choice, not the absence of one, so it lives in the union. */
type RepeatOption = "once" | 4 | "open";
type FormState = { notes: string; location: "online" | "porto"; repeat: RepeatOption };
const emptyForm: FormState = { notes: "", location: "online", repeat: "once" };

function minutesToClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const RECURRING_OPTIONS: { value: Exclude<RepeatOption, "once">; label: string; description: string }[] = [
  { value: 4, label: "4 weeks", description: "Four weekly lessons, then it stops" },
  { value: "open", label: "Until I stop it", description: "Keep the same weekly time" }
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

let bookingMotionTimer: number | null = null;

function finishBookingMotion() {
  if (bookingMotionTimer !== null) window.clearTimeout(bookingMotionTimer);
  document.documentElement.classList.remove("booking-transitioning");
  bookingMotionTimer = null;
}

function transitionBooking(update: () => void) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }

  if (bookingMotionTimer !== null) finishBookingMotion();
  document.documentElement.classList.add("booking-transitioning");
  flushSync(update);
  bookingMotionTimer = window.setTimeout(finishBookingMotion, 200);
}

/**
 * A decision should hand the student to the next decision, especially on a
 * phone where the next panel sits below what they just chose. If that decision
 * is already comfortably visible, however, moving the page only makes the
 * workspace feel unstable. The view change settles first, then two animation
 * frames let the browser measure the final position before deciding whether a
 * scroll is actually needed. Reduced-motion preferences are respected.
 */
function orientTo(id: string, focus = false, forceOnMobile = false) {
  const orient = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target = document.getElementById(id);
        if (!target) return;
        if (focus) target.focus({ preventScroll: true });
        const bounds = target.getBoundingClientRect();
        const visibleHeight = Math.max(0, Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, 0));
        const enoughVisible = bounds.top >= 12 && visibleHeight >= Math.min(bounds.height, 160);
        const shouldGuideMobile = forceOnMobile && window.matchMedia("(max-width: 699px)").matches;
        if (enoughVisible && !shouldGuideMobile) return;
        target.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start"
        });
      });
    });
  };

  // The final DOM exists synchronously. Start guiding immediately rather than
  // waiting for the decorative fade to finish, which previously created a
  // noticeable pause followed by a second, separate movement.
  orient();
}

export function BookingCalendar({ initialManageToken = "" }: { initialManageToken?: string } = {}) {
  const [step, setStep] = useState<Step>("pattern");
  const [intent, setIntent] = useState<BookingIntent>("choose");
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
  const [bookingKind, setBookingKind] = useState<BookingKind>("");
  const [todayKey, setTodayKey] = useState("");
  const [horizonDays, setHorizonDays] = useState(BOOKING_HORIZON_DAYS_FALLBACK);
  const [slotsByDate, setSlotsByDate] = useState<Record<string, Slot[]>>({});
  const [selectedDate, setSelectedDate] = useState("");
  const [calendarWeekCount, setCalendarWeekCount] = useState<CalendarWeekCount>(4);
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
  const [lessonSeries, setLessonSeries] = useState<LessonSeries[]>([]);
  const [checkingSession, setCheckingSession] = useState(true);
  // The Worker treats any non-cancelled booking as the start of the student's
  // relationship with Inês, including an upcoming first lesson. Mirror that
  // exact rule here: a card the server will refuse is a trap, not a choice.
  const [hasPriorBooking, setHasPriorBooking] = useState(false);
  const [managedToken, setManagedToken] = useState("");
  const [managedSeriesId, setManagedSeriesId] = useState<string | null>(null);
  const [managedLessonTypeId, setManagedLessonTypeId] = useState("");
  const [managed, setManaged] = useState<ManagedBooking | null>(null);
  const [manageMode, setManageMode] = useState<
    "view" | "reschedule" | "confirm-cancel" | "sequence" | "confirm-stop-sequence" | "confirm-cancel-sequence"
  >("view");
  const [manageLoading, setManageLoading] = useState(false);
  const [manageWorking, setManageWorking] = useState(false);
  const [manageError, setManageError] = useState("");
  const [manageOutcome, setManageOutcome] = useState("");
  const [managedCalendarPlaceholderHeight, setManagedCalendarPlaceholderHeight] = useState(0);
  const [showAccountSignIn, setShowAccountSignIn] = useState(false);
  const [upcomingRequestKey, setUpcomingRequestKey] = useState(0);
  const manageDialogRef = useRef<HTMLDivElement>(null);
  const managedRescheduleRef = useRef<HTMLDivElement>(null);

  const lessonType = lessonTypes.find((type) => type.id === lessonTypeId) ?? null;
  const managedDurationChoices = managed?.booking.lessonType.id === "trial"
    ? []
    : lessonTypes
        .filter((type) => type.id !== "trial" && [60, 90].includes(type.duration_minutes))
        .filter(
          (type, index, choices) =>
            choices.findIndex((choice) => choice.duration_minutes === type.duration_minutes) === index
        );
  const managedPaymentStatus = managed?.booking.paymentStatus ?? "not_required";
  const canChangeManagedDuration =
    managedDurationChoices.length > 1 && ["not_required", "scheduled"].includes(managedPaymentStatus);

  const refreshStudent = useCallback(async () => {
    const session = readSession();
    if (!session) {
      setStudent(null);
      setMyBookings([]);
      setLessonSeries([]);
      setHasPriorBooking(false);
      return null;
    }

    const data = await fetchMe(session);
    setStudent(data?.student ?? null);
    setMyBookings(data?.bookings ?? []);
    setLessonSeries(data?.series ?? []);
    setHasPriorBooking((data?.bookings ?? []).some((booking) => booking.status !== "cancelled"));
    return data;
  }, []);

  useEffect(() => {
    const key = portoDateKey(new Date());
    setTodayKey(key);
    setStudentZone(browserTimeZone());
    if (new URLSearchParams(window.location.search).get("view") === "lessons") {
      setIntent("lessons");
      if (!readSession()) setShowAccountSignIn(true);
    }

    listLessonTypes()
      .then(({ lessonTypes: types, prepay: prepayOn }) => {
        setLessonTypes(types);
        setPrepay(Boolean(prepayOn));
      })
      .catch((error: Error) => setLoadError(error.message));

    // `fetchMe` already clears a genuinely invalid session on a 401. A network
    // interruption (including a quick reload while this request is in flight)
    // must not sign the student out as a side effect.
    refreshStudent()
      .catch(() => undefined)
      .finally(() => setCheckingSession(false));
  }, [refreshStudent]);

  // Signing in mid-flow can reveal a history the lesson step didn't know
  // about. If the trial is the current choice, dissolve it and put the real
  // choices back in the same place. A large warning makes an eligibility rule
  // feel like the student's mistake; the unavailable option simply leaves.
  useEffect(() => {
    if (!hasPriorBooking || lessonTypeId !== "trial") return;
    transitionBooking(() => {
      setIntent("book");
      setBookingKind("");
      setLessonTypeId("");
      setSelectedDate("");
      setSelectedSlot("");
      setCalendarWeekCount(8);
      setStep("pattern");
    });
    orientTo("booking-lesson-choice");
  }, [hasPriorBooking, lessonTypeId]);

  const openManaged = useCallback(async (token: string, seriesId: string | null = null) => {
    if (!token) return;
    setIntent("lessons");
    setManagedToken(token);
    setManagedSeriesId(seriesId);
    setManagedLessonTypeId("");
    setManageLoading(true);
    setManageError("");
    setManageOutcome("");
    setManagedCalendarPlaceholderHeight(0);
    setManageMode("view");
    setSelectedSlot("");
    try {
      const result = await fetchBooking(token);
      transitionBooking(() => {
        setManaged(result);
        setManagedLessonTypeId(result.booking.lessonType.id);
        setSelectedDate(portoDateKey(new Date(result.booking.startAt)));
        setManageLoading(false);
      });
    } catch (caught) {
      transitionBooking(() => {
        setManaged(null);
        setManagedLessonTypeId("");
        setManageError(caught instanceof Error ? caught.message : "That lesson could not be opened.");
        setManageLoading(false);
      });
    }
  }, []);

  useEffect(() => {
    if (initialManageToken) openManaged(initialManageToken);
  }, [initialManageToken, openManaged]);

  const availabilityLessonTypeId =
    manageMode === "reschedule" && managed
      ? managedLessonTypeId || managed.booking.lessonType.id
      : lessonTypeId;

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
  const activeLessonSeriesIds = new Set(lessonSeries.map((entry) => entry.id));
  const calendarBookingGroupId = (booking: MyBooking) =>
    booking.seriesId && activeLessonSeriesIds.has(booking.seriesId)
      ? `series:${booking.seriesId}`
      : `booking:${booking.reference}`;
  const allUpcomingLessonCount = new Set(calendarBookings.map(calendarBookingGroupId)).size;

  const allBookingsByDate = calendarBookings.reduce<Record<string, MyBooking[]>>((dates, booking) => {
    const key = portoDateKey(new Date(booking.startAt));
    (dates[key] ??= []).push(booking);
    return dates;
  }, {});
  const allCalendarWeeks = todayKey ? buildBookingWeeks(todayKey, horizonDays) : [];
  const firstRelevantWeek = allCalendarWeeks.findIndex((week) =>
    week.cells.some((cell) => Boolean(slotsByDate[cell.key]?.length || allBookingsByDate[cell.key]?.length))
  );
  const currentWeekHasBooking = Boolean(
    allCalendarWeeks[0]?.cells.some((cell) => Boolean(allBookingsByDate[cell.key]?.length))
  );
  const todayWeekday = todayKey ? new Date(`${todayKey}T12:00:00Z`).getUTCDay() : -1;
  const startsOnClosedWeekend = (todayWeekday === 0 || todayWeekday === 6) && !currentWeekHasBooking;
  const uncappedCalendarWeeks =
    availabilityLessonTypeId && firstRelevantWeek > 0
      ? allCalendarWeeks.slice(firstRelevantWeek).map((week, index) =>
          index === 0 && !week.showMonth ? { ...week, showMonth: true } : week
        )
      : !availabilityLessonTypeId && startsOnClosedWeekend
        ? allCalendarWeeks.slice(1).map((week, index) =>
            index === 0 && !week.showMonth ? { ...week, showMonth: true } : week
          )
      : allCalendarWeeks;
  // A 56-day inclusive range can touch a ninth Monday–Sunday row. New booking
  // still uses the full eight-week horizon; the lesson overview owns only four
  // rows. The Upcoming lessons list is the management surface; this stays as
  // the four-week visual overview beneath it.
  const calendarWeeks = uncappedCalendarWeeks.slice(0, 8);
  const fourWeekCalendarWeeks = calendarWeeks.slice(0, 4);
  const overviewCalendarWeeks = intent === "lessons" ? fourWeekCalendarWeeks : calendarWeeks;
  const fourWeekCalendarDates = new Set(fourWeekCalendarWeeks.flatMap((week) => week.cells.map((cell) => cell.key)));
  const visibleCalendarDates = new Set(overviewCalendarWeeks.flatMap((week) => week.cells.map((cell) => cell.key)));
  const calendarWindowBookings = calendarBookings.filter((booking) =>
    visibleCalendarDates.has(portoDateKey(new Date(booking.startAt)))
  );
  const calendarLessonCount = new Set(calendarWindowBookings.map(calendarBookingGroupId)).size;
  const bookingsByDate = calendarWindowBookings.reduce<Record<string, MyBooking[]>>((dates, booking) => {
    const key = portoDateKey(new Date(booking.startAt));
    (dates[key] ??= []).push(booking);
    return dates;
  }, {});
  const selectedCalendarWeek = selectedDate
    ? overviewCalendarWeeks.find((week) => week.cells.some((cell) => cell.key === selectedDate))
    : undefined;
  const selectedDateInOverview = Boolean(selectedCalendarWeek);
  const standardCalendarWeekCount: Exclude<CalendarWeekCount, 1> = intent === "lessons" ? 4 : 8;
  const visibleCalendarWeekCount = calendarWeekCount === 1 && !selectedCalendarWeek
    ? standardCalendarWeekCount
    : calendarWeekCount;
  const displayedCalendarWeeks = visibleCalendarWeekCount === 1 && selectedCalendarWeek
    ? [{ ...selectedCalendarWeek, showMonth: true }]
    : overviewCalendarWeeks;
  const returnCalendarWeekCount = visibleCalendarWeekCount === 1 ? standardCalendarWeekCount : null;
  const daySlots = selectedDate ? slotsByDate[selectedDate] ?? [] : [];
  const chosen = daySlots.find((slot) => slot.startAt === selectedSlot) ?? null;
  const selectedDayBookings = selectedDate ? bookingsByDate[selectedDate] ?? [] : [];
  const firstCalendarBookingStart = calendarWindowBookings[0]?.startAt ?? "";
  const isConfirmingBooking = step === "details" && Boolean(lessonType && chosen) && !managed;
  const needsLessonsSignIn = intent === "lessons" && showAccountSignIn && !student;
  const showStartChoice = intent === "choose" && !managed && !isConfirmingBooking;
  const showLessonChoice = intent === "book" && !managed && !isConfirmingBooking;
  const showWorkflowCalendar =
    !isConfirmingBooking &&
    !needsLessonsSignIn &&
    (intent === "lessons" ||
      Boolean(intent === "book" && lessonType && !["pattern", "repeat", "lesson"].includes(step)) ||
      Boolean(managed));
  const resolvedManagedSeriesId = managedSeriesId ?? myBookings.find((booking) => booking.manageToken === managedToken)?.seriesId ?? null;
  const activeManagedSeries = resolvedManagedSeriesId
    ? lessonSeries.find((entry) => entry.id === resolvedManagedSeriesId) ?? null
    : null;
  const manageDialogOpen = Boolean(manageLoading || manageError || managed);
  const regularLessonTypes = lessonTypes.filter((type) => type.id !== "trial");
  const trialLessonType = lessonTypes.find((type) => type.id === "trial") ?? null;
  const panelMotionKey = showAccountSignIn && !student
    ? "sign-in"
    : managed && manageMode === "reschedule"
      ? `managed-${managed.booking.reference}-reschedule`
      : `calendar-${selectedDate || "none"}-${lessonTypeId || "none"}`;

  useEffect(() => {
    if (intent !== "lessons" || selectedDate || !firstCalendarBookingStart) return;
    setSelectedDate(portoDateKey(new Date(firstCalendarBookingStart)));
    setCalendarWeekCount(4);
  }, [firstCalendarBookingStart, intent, selectedDate]);

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
    } else if (next === "pattern" || next === "repeat" || next === "lesson") {
      orientTo("booking-lesson-choice");
    }
  }

  function startBookingJourney() {
    transitionBooking(() => {
      setIntent("book");
      setShowAccountSignIn(false);
      setManaged(null);
      setManagedToken("");
      setManagedLessonTypeId("");
      setManageMode("view");
      setBookingKind("");
      setLessonTypeId("");
      setSelectedDate("");
      setSelectedSlot("");
      setCalendarWeekCount(8);
      setStep("pattern");
      setForm(emptyForm);
    });
    orientTo("booking-lesson-choice", true);
  }

  function openLessonsJourney() {
    transitionBooking(() => {
      setIntent("lessons");
      setBookingKind("");
      setLessonTypeId("");
      setSelectedSlot("");
      setCalendarWeekCount(4);
      setUpcomingRequestKey((current) => current + 1);
      setStep("day");
      setShowAccountSignIn(!student);
      if (firstCalendarBookingStart) {
        setSelectedDate(portoDateKey(new Date(firstCalendarBookingStart)));
      } else {
        setSelectedDate("");
      }
    });
    if (!student) orientTo("booking-lessons-sign-in", true);
  }

  function resetJourneyToStart() {
    closeManagedLesson();
    setIntent("choose");
    setShowAccountSignIn(false);
    setBookingKind("");
    setLessonTypeId("");
    setSelectedDate("");
    setSelectedSlot("");
    setCalendarWeekCount(4);
    setStep("pattern");
    setPayment(null);
    setPaymentError("");
  }

  function returnToJourneyStart() {
    transitionBooking(resetJourneyToStart);
    orientTo("booking-journey-start", true);
  }

  function openAccountShortcut() {
    closeManagedLesson();
    setIntent("lessons");
    setShowAccountSignIn(false);
    setBookingKind("");
    setLessonTypeId("");
    setSelectedSlot("");
    setCalendarWeekCount(4);
    setStep("day");
    setPayment(null);
    setPaymentError("");
    setSelectedDate(firstCalendarBookingStart ? portoDateKey(new Date(firstCalendarBookingStart)) : "");
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

      transitionBooking(() =>
        setConfirmation({
          reference: result.booking.reference,
          startAt: result.booking.startAt,
          manageUrl: result.manageUrl ?? "/book/?view=lessons",
          manageToken: result.manageToken ?? "",
          email: result.booking.studentEmail,
          series: result.series
        })
      );
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
    if (!managedToken || !selectedSlot || !managed) return;
    setManageWorking(true);
    setManageError("");
    try {
      const previousLessonTypeId = managed.booking.lessonType.id;
      await rescheduleBooking(managedToken, selectedSlot, managedLessonTypeId || previousLessonTypeId);
      const refreshed = await fetchBooking(managedToken);
      transitionBooking(() => {
        setManaged(refreshed);
        setManagedLessonTypeId(refreshed.booking.lessonType.id);
        setSelectedDate(portoDateKey(new Date(refreshed.booking.startAt)));
        setSelectedSlot("");
        setManageMode("view");
        setManageOutcome(
          refreshed.booking.lessonType.id === previousLessonTypeId
            ? "Your lesson has been moved. We’ve emailed you and updated your calendar."
            : `Your lesson is now ${formatBookedLessonLabel(refreshed.booking.lessonType)}. We’ve emailed you and updated your calendar.`
        );
      });
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
      transitionBooking(() => {
        setManaged({ ...managed, booking: result.booking });
        setManageMode("view");
        setManageOutcome(
          result.booking.paymentStatus === "refunded"
            ? "Your lesson has been cancelled. Your refund is on its way back to your card."
            : "Your lesson has been cancelled. We’ve emailed you and updated your calendar."
        );
      });
      await refreshStudent();
    } catch (caught) {
      setManageError(caught instanceof Error ? caught.message : "That lesson could not be cancelled.");
    } finally {
      setManageWorking(false);
    }
  }

  async function stopManagedSequence(cancelRemaining = false) {
    if (!resolvedManagedSeriesId) return;
    setManageWorking(true);
    setManageError("");
    try {
      const result = await stopSeries(readSession(), resolvedManagedSeriesId, cancelRemaining);
      transitionBooking(() => {
        setManageMode("view");
        if (!cancelRemaining) {
          setManageOutcome("This sequence has stopped. The lessons already booked stay in your calendar.");
          return;
        }

        const cancelledLessons = `${result.cancelled} ${result.cancelled === 1 ? "lesson" : "lessons"}`;
        setManageOutcome(
          result.kept
            ? `This sequence has stopped and ${cancelledLessons} ${result.cancelled === 1 ? "was" : "were"} cancelled. Today’s lesson stays booked.`
            : result.cancelled
              ? `This sequence has stopped and ${cancelledLessons} ${result.cancelled === 1 ? "was" : "were"} cancelled.`
              : "This sequence has stopped. There were no future booked lessons to cancel."
        );
      });
      await refreshStudent();
    } catch (caught) {
      setManageError(caught instanceof Error ? caught.message : cancelRemaining ? "Those lessons could not be cancelled." : "That sequence could not be stopped.");
    } finally {
      setManageWorking(false);
    }
  }

  const closeManagedLesson = useCallback(() => {
    setManaged(null);
    setManagedToken("");
    setManagedSeriesId(null);
    setManagedLessonTypeId("");
    setManageMode("view");
    setManageError("");
    setManageOutcome("");
    setManagedCalendarPlaceholderHeight(0);
    setSelectedSlot("");
    if (selectedDate && !selectedDateInOverview) {
      setSelectedDate(firstCalendarBookingStart ? portoDateKey(new Date(firstCalendarBookingStart)) : "");
    }
    if (new URLSearchParams(window.location.search).has("manage")) {
      window.history.replaceState({}, "", "/book/");
    }
  }, [firstCalendarBookingStart, selectedDate, selectedDateInOverview]);

  const returnFromManagedLesson = useCallback(() => {
    transitionBooking(() => {
      closeManagedLesson();
      setUpcomingRequestKey((current) => current + 1);
    });
  }, [closeManagedLesson]);

  const dismissManagedDialog = useCallback(() => {
    if (manageWorking) return;
    if (manageOutcome && student) {
      returnFromManagedLesson();
      return;
    }
    transitionBooking(closeManagedLesson);
  }, [closeManagedLesson, manageOutcome, manageWorking, returnFromManagedLesson, student]);

  useEffect(() => {
    if (!manageDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      if (manageMode === "reschedule") managedRescheduleRef.current?.focus({ preventScroll: true });
      else manageDialogRef.current?.focus({ preventScroll: true });
    });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissManagedDialog();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [dismissManagedDialog, manageDialogOpen, manageMode]);

  function beginManagedReschedule() {
    if (!managed) return;
    const managedDate = portoDateKey(new Date(managed.booking.startAt));
    const isInCalendar = overviewCalendarWeeks.some((week) => week.cells.some((cell) => cell.key === managedDate));
    const calendarHeight = managedRescheduleRef.current?.getBoundingClientRect().height ?? 0;
    transitionBooking(() => {
      setManagedCalendarPlaceholderHeight(calendarHeight);
      setManageMode("reschedule");
      setManagedLessonTypeId(managed.booking.lessonType.id);
      setSelectedDate(isInCalendar ? managedDate : "");
      setSelectedSlot("");
      setCalendarWeekCount(isInCalendar ? 1 : 4);
      setManageError("");
      setLoadingSlots(true);
    });
  }

  function returnFromConfirmationToUpcoming() {
    if (!confirmation) return;
    const bookedDate = portoDateKey(new Date(confirmation.startAt));

    transitionBooking(() => {
      setConfirmation(null);
      setIntent("lessons");
      setBookingKind("");
      setLessonTypeId("");
      setSelectedSlot("");
      setCalendarWeekCount(4);
      setSelectedDate(
        fourWeekCalendarDates.has(bookedDate)
          ? bookedDate
          : firstCalendarBookingStart
            ? portoDateKey(new Date(firstCalendarBookingStart))
            : ""
      );
      setStep("day");
      setForm(emptyForm);
      setSeriesPreview(null);
      setPayment(null);
      setPaymentError("");
      setUpcomingRequestKey((current) => current + 1);
    });
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
                ? ". This time stays yours every week until you stop it."
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
            onClick={returnFromConfirmationToUpcoming}
            type="button"
          >
            Back to upcoming lessons
          </button>
          <button
            className="text-action"
            onClick={() => {
              if (confirmation.manageToken) {
                transitionBooking(() => {
                  setConfirmation(null);
                  void openManaged(confirmation.manageToken, confirmation.series?.id ?? null);
                });
              } else {
                window.location.assign(confirmation.manageUrl);
              }
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
        {student ? (
          <section
            className="unified-account-area"
            id="account-controls"
            aria-label="Account, upcoming and past lessons"
          >
            <AccountControls
              calendarHorizonDays={horizonDays}
              embedded
              onBackToStart={resetJourneyToStart}
              onManage={(token, seriesId) =>
                transitionBooking(() => {
                  void openManaged(token, seriesId);
                })
              }
              onOpenAccountSection={openAccountShortcut}
              onTransition={transitionBooking}
              onSignedOut={() => {
                setStudent(null);
                setMyBookings([]);
                setLessonSeries([]);
                setManaged(null);
                setManagedToken("");
                setManagedSeriesId(null);
                setManagedLessonTypeId("");
                setManageMode("view");
                setHasPriorBooking(false);
                setIntent("choose");
                setLessonTypeId("");
                setSelectedDate("");
                setSelectedSlot("");
              }}
              openUpcomingRequest={upcomingRequestKey}
              showCalendar={false}
              showHistory
              showUpcomingLessons
              showSeries={false}
            />
          </section>
        ) : null}

        {manageDialogOpen ? (
          <div
            className={`lesson-manage-overlay${manageMode === "reschedule" ? " lesson-manage-overlay--reschedule" : ""}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) dismissManagedDialog();
            }}
            role="presentation"
          >
            {manageMode !== "reschedule" ? (
            <div
              aria-labelledby="lesson-manage-heading"
              aria-modal="true"
              className="lesson-manage-dialog"
              ref={manageDialogRef}
              role="dialog"
              tabIndex={-1}
            >
              <button
                aria-label="Close lesson management"
                className="lesson-manage-dialog__close"
                disabled={manageWorking}
                onClick={dismissManagedDialog}
                type="button"
              >
                <X aria-hidden="true" size={19} />
              </button>

              <div
                className="lesson-manage-dialog__content"
                key={manageLoading ? "loading" : !managed ? "error" : manageOutcome ? "outcome" : manageMode}
              >
              {manageLoading ? (
                <div className="lesson-manage-dialog__loading">
                  <p className="eyebrow">One moment</p>
                  <h2 id="lesson-manage-heading">Opening your lesson…</h2>
                </div>
              ) : managed ? (
                <>
                  <p className={`lesson-calendar__status${resolvedManagedSeriesId ? " lesson-calendar__status--recurring" : ""}`}>
                    {resolvedManagedSeriesId ? <Repeat size={13} aria-hidden="true" /> : <CheckCircle2 size={13} aria-hidden="true" />}
                    {managed.booking.status === "cancelled"
                      ? "Cancelled"
                      : resolvedManagedSeriesId
                        ? "Recurring lesson"
                        : "Booked"}
                  </p>
                  <h2 id="lesson-manage-heading">
                    {manageMode === "confirm-cancel"
                      ? "Cancel this lesson?"
                      : manageMode === "confirm-cancel-sequence"
                        ? "Cancel booked lessons?"
                        : manageMode === "sequence" || manageMode === "confirm-stop-sequence"
                        ? "Manage recurring lesson"
                        : manageOutcome
                          ? "All sorted"
                          : "Manage this lesson"}
                  </h2>

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

                  <div className="lesson-manage-dialog__lesson">
                    <strong>{formatLongDate(managed.booking.startAt)}, {formatSlotTime(managed.booking.startAt)}</strong>
                    <span>{formatBookedLessonLabel(managed.booking.lessonType)} · {managed.booking.location === "porto" ? "In Porto" : "Online"}</span>
                  </div>

                  {!manageOutcome && manageMode === "view" ? (
                    <>
                      {managed.changeLocked && managed.booking.status !== "cancelled" ? (
                        <p className="lesson-calendar__notice">This lesson is today and can&rsquo;t be changed or cancelled.</p>
                      ) : managed.sameDayFeeApplies && managed.booking.status !== "cancelled" ? (
                        <p className="lesson-calendar__notice">
                          Changing or cancelling today costs {formatMoneyCents(managed.booking.sameDayFeeCents)}.
                        </p>
                      ) : null}

                      {managed.booking.status === "confirmed" && !managed.isPast && !managed.changeLocked ? (
                        <>
                          <p className="lesson-manage-dialog__question">Would you like to change or cancel it?</p>
                          <div className="lesson-manage-dialog__actions">
                            <button className="button button--coral" onClick={beginManagedReschedule} type="button">
                              Change
                            </button>
                            <button
                              className="button button--quiet"
                              onClick={() => transitionBooking(() => setManageMode("confirm-cancel"))}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : null}

                      {resolvedManagedSeriesId ? (
                        <div className="lesson-manage-dialog__series">
                          <Repeat aria-hidden="true" size={17} />
                          <div>
                            <strong>Part of a recurring sequence</strong>
                            <span>
                              {activeManagedSeries
                                ? `${weekdayNames[activeManagedSeries.weekday]} at ${minutesToClock(activeManagedSeries.minuteOfDay)} Porto time`
                                : "This sequence is no longer adding lessons."}
                            </span>
                          </div>
                          {activeManagedSeries ? (
                            <button className="text-action" onClick={() => transitionBooking(() => setManageMode("sequence"))} type="button">
                              Manage sequence
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {manageMode === "confirm-cancel" ? (
                    <div className="lesson-manage-dialog__decision">
                      <p>
                        This only cancels the lesson on this date.
                        {managed.refundOnCancel && managed.booking.amountCents
                          ? ` Your ${formatMoneyCents(managed.booking.amountCents)} comes back to your card.`
                          : ""}
                      </p>
                      <div className="lesson-manage-dialog__actions">
                        <button className="button button--coral" disabled={manageWorking} onClick={cancelManagedLesson} type="button">
                          {manageWorking ? "Cancelling…" : "Yes, cancel it"}
                        </button>
                        <button
                          className="button button--quiet"
                          disabled={manageWorking}
                          onClick={() => transitionBooking(() => setManageMode("view"))}
                          type="button"
                        >
                          Keep lesson
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {activeManagedSeries && manageMode === "sequence" ? (
                    <div className="lesson-manage-dialog__decision">
                      <p>
                        Choose whether to keep the lessons already in your calendar or cancel them too.
                      </p>
                      <div className="lesson-manage-dialog__actions lesson-manage-dialog__actions--sequence">
                        <button className="button button--quiet" onClick={() => transitionBooking(() => setManageMode("confirm-stop-sequence"))} type="button">
                          Stop repeating
                        </button>
                        <button className="button button--coral" onClick={() => transitionBooking(() => setManageMode("confirm-cancel-sequence"))} type="button">
                          Cancel all booked lessons
                        </button>
                        <button className="text-action" onClick={() => transitionBooking(() => setManageMode("view"))} type="button">
                          Back
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {activeManagedSeries && manageMode === "confirm-stop-sequence" ? (
                    <div className="lesson-manage-dialog__decision">
                      <p><strong>Stop this recurring sequence?</strong> Your booked lessons will stay.</p>
                      <div className="lesson-manage-dialog__actions">
                        <button className="button button--coral" disabled={manageWorking} onClick={() => stopManagedSequence(false)} type="button">
                          {manageWorking ? "Stopping…" : "Yes, stop repeating"}
                        </button>
                        <button
                          className="button button--quiet"
                          disabled={manageWorking}
                          onClick={() => transitionBooking(() => setManageMode("sequence"))}
                          type="button"
                        >
                          Keep repeating
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {activeManagedSeries && manageMode === "confirm-cancel-sequence" ? (
                    <div className="lesson-manage-dialog__decision">
                      <p>
                        <strong>Cancel every upcoming lesson in this sequence?</strong> This also stops new lessons being added. Any paid lesson that can still be cancelled is refunded automatically. A lesson happening today stays booked.
                      </p>
                      <div className="lesson-manage-dialog__actions">
                        <button className="button button--coral" disabled={manageWorking} onClick={() => stopManagedSequence(true)} type="button">
                          {manageWorking ? "Cancelling…" : "Yes, cancel all"}
                        </button>
                        <button
                          className="button button--quiet"
                          disabled={manageWorking}
                          onClick={() => transitionBooking(() => setManageMode("sequence"))}
                          type="button"
                        >
                          Keep booked lessons
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {manageOutcome || managed.booking.status === "cancelled" || managed.isPast || managed.changeLocked ? (
                    <button className="button button--quiet lesson-manage-dialog__done" onClick={dismissManagedDialog} type="button">
                      Done
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="eyebrow">Your lesson</p>
                  <h2 id="lesson-manage-heading">That lesson couldn&rsquo;t be opened</h2>
                  <div className="booking-alert" role="alert">
                    <AlertCircle size={18} aria-hidden="true" />
                    <p>{manageError || "Please try again."}</p>
                  </div>
                  <button className="button button--quiet lesson-manage-dialog__done" onClick={dismissManagedDialog} type="button">
                    Close
                  </button>
                </>
              )}
              </div>
            </div>
            ) : null}
          </div>
        ) : null}

        {showStartChoice ? (
          <section className="booking-journey-start" id="booking-journey-start" tabIndex={-1}>
            <div className="booking-journey-start__heading">
              <p className="eyebrow">Start here</p>
              <h2>What would you like to do?</h2>
            </div>
            <div className="booking-journey-start__choices">
              <button className="booking-intent-card booking-intent-card--book" onClick={startBookingJourney} type="button">
                <span className="booking-intent-card__icon" aria-hidden="true">
                  <CalendarDays size={24} />
                </span>
                <strong>Book a new lesson</strong>
                <ChevronRight aria-hidden="true" size={20} />
              </button>
              <button className="booking-intent-card" onClick={openLessonsJourney} type="button">
                <span className="booking-intent-card__icon" aria-hidden="true">
                  <CheckCircle2 size={24} />
                </span>
                <strong>View your lessons</strong>
                {student && allUpcomingLessonCount ? (
                  <span className="booking-intent-card__count" aria-label={`${allUpcomingLessonCount} upcoming lessons`}>
                    {allUpcomingLessonCount}
                  </span>
                ) : null}
                <ChevronRight aria-hidden="true" size={20} />
              </button>
            </div>
          </section>
        ) : null}

        {needsLessonsSignIn ? (
          <section className="booking-workflow-sign-in" id="booking-lessons-sign-in" tabIndex={-1}>
            <div className="booking-workflow-step-head">
              <h2>Sign in to view your lessons</h2>
              <button className="booking-back booking-back--tertiary" onClick={returnToJourneyStart} type="button">
                <ArrowLeft size={16} aria-hidden="true" /> Back
              </button>
            </div>
            <AuthPanel
              heading="Your account"
              headingLevel={3}
              initialMode="signin"
              intro="Your upcoming lessons will appear first, with your calendar beneath them."
              onSignedIn={(signedIn) => {
                transitionBooking(() => {
                  setStudent(signedIn);
                  setShowAccountSignIn(false);
                });
                void refreshStudent();
              }}
            />
          </section>
        ) : null}

        {showLessonChoice ? (
          <div className="unified-booking__lesson-picker" id="booking-lesson-choice" tabIndex={-1}>
            {lessonType && !["pattern", "repeat", "lesson"].includes(step) ? (
              <div className="booking-choice-summary" aria-label="Booking choices">
                <LessonMark className="booking-choice-summary__mark" lessonTypeId={lessonType.id} />
                <span className="booking-choice-summary__copy">
                  <span className="eyebrow">
                    {bookingKind === "recurring" ? "Recurring lessons" : bookingKind === "trial" ? "Trial lesson" : "One lesson"}
                  </span>
                  <strong>{formatLessonDuration(lessonType.duration_minutes)}</strong>
                  <small>
                    {formatMoneyCents(lessonType.price_cents)}
                    {bookingKind === "recurring"
                      ? form.repeat === "open"
                        ? " · every week until you stop it"
                        : " · weekly for 4 weeks"
                      : ""}
                  </small>
                </span>
                <button
                  className="text-action booking-choice-summary__change"
                  onClick={() =>
                    transitionBooking(() => {
                      setBookingKind("");
                      setLessonTypeId("");
                      setSelectedSlot("");
                      setCalendarWeekCount(8);
                      goTo("pattern");
                    })
                  }
                  type="button"
                >
                  Change choices
                </button>
              </div>
            ) : step === "pattern" ? (
              <>
                <div className="booking-workflow-step-head">
                  <h2>How would you like to book?</h2>
                  <button className="booking-back booking-back--tertiary" onClick={returnToJourneyStart} type="button">
                    <ArrowLeft size={16} aria-hidden="true" /> Back
                  </button>
                </div>
                {checkingSession ? (
                  <p className="booking-state-note">Checking which lessons are available to you…</p>
                ) : (
                  <div className="lesson-choice">
                  {!hasPriorBooking && trialLessonType ? (
                    <button
                      aria-label={`Trial lesson ${formatLessonDuration(trialLessonType.duration_minutes)} · ${formatMoneyCents(trialLessonType.price_cents)}`}
                      className="lesson-card"
                      onClick={() =>
                        transitionBooking(() => {
                          setBookingKind("trial");
                          setForm((current) => ({ ...current, repeat: "once" }));
                          setLoadingSlots(true);
                          setSlotsByDate({});
                          setLessonTypeId(trialLessonType.id);
                          setCalendarWeekCount(8);
                          setSelectedSlot("");
                          goTo("day");
                        })
                      }
                      type="button"
                    >
                      <LessonMark className="lesson-card__mark" lessonTypeId={trialLessonType.id} />
                      <span className="lesson-card__text">
                        <strong>Trial lesson</strong>
                        <span className="lesson-card__meta">
                          {formatLessonDuration(trialLessonType.duration_minutes)} · {formatMoneyCents(trialLessonType.price_cents)}
                        </span>
                      </span>
                      <ChevronRight aria-hidden="true" size={20} />
                    </button>
                  ) : null}
                  <button
                    aria-label="One lesson · choose 60 or 90 minutes"
                    className="lesson-card"
                    onClick={() =>
                      transitionBooking(() => {
                        setBookingKind("once");
                        setForm((current) => ({ ...current, repeat: "once" }));
                        setLessonTypeId("");
                        goTo("lesson");
                      })
                    }
                    type="button"
                  >
                    <LessonMark className="lesson-card__mark" lessonTypeId="single-60" />
                    <span className="lesson-card__text">
                      <strong>One lesson</strong>
                      <span className="lesson-card__meta">Choose 60 or 90 minutes</span>
                    </span>
                    <ChevronRight aria-hidden="true" size={20} />
                  </button>
                  <button
                    aria-label="Recurring lessons · keep the same weekly time"
                    className="lesson-card"
                    onClick={() =>
                      transitionBooking(() => {
                        setBookingKind("recurring");
                        setForm((current) => ({ ...current, repeat: 4 }));
                        setLessonTypeId("");
                        goTo("repeat");
                      })
                    }
                    type="button"
                  >
                    <span className="lesson-card__mark lesson-card__mark--repeat" aria-hidden="true"><Repeat size={25} /></span>
                    <span className="lesson-card__text">
                      <strong>Recurring lessons</strong>
                      <span className="lesson-card__meta">Keep the same weekly time</span>
                    </span>
                    <ChevronRight aria-hidden="true" size={20} />
                  </button>
                  {!lessonTypes.length && !loadError ? (
                    <p className="booking-state-note">No lessons are listed right now.</p>
                  ) : null}
                  </div>
                )}
              </>
            ) : step === "repeat" ? (
              <>
                <div className="booking-workflow-step-head">
                  <h2>How long should it repeat?</h2>
                  <button className="booking-back booking-back--tertiary" onClick={() => transitionBooking(() => goTo("pattern"))} type="button">
                    <ArrowLeft size={16} aria-hidden="true" /> Back
                  </button>
                </div>
                <div className="lesson-choice lesson-choice--repeat">
                  {RECURRING_OPTIONS.map((option) => (
                    <button
                      aria-label={`${option.label} · ${option.description}`}
                      className="lesson-card"
                      key={String(option.value)}
                      onClick={() =>
                        transitionBooking(() => {
                          setForm((current) => ({ ...current, repeat: option.value }));
                          goTo("lesson");
                        })
                      }
                      type="button"
                    >
                      <span className="lesson-card__mark lesson-card__mark--repeat" aria-hidden="true"><Repeat size={25} /></span>
                      <span className="lesson-card__text">
                        <strong>{option.label}</strong>
                        <span className="lesson-card__meta">{option.description}</span>
                      </span>
                      <ChevronRight aria-hidden="true" size={20} />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="booking-workflow-step-head">
                  <h2>Choose lesson length</h2>
                  <button
                    className="booking-back booking-back--tertiary"
                    onClick={() => transitionBooking(() => goTo(bookingKind === "recurring" ? "repeat" : "pattern"))}
                    type="button"
                  >
                    <ArrowLeft size={16} aria-hidden="true" /> Back
                  </button>
                </div>
                <div className="lesson-choice lesson-choice--duration">
                  {regularLessonTypes.map((type) => (
                    <button
                      aria-label={`${formatLessonDuration(type.duration_minutes)} lesson · ${formatMoneyCents(type.price_cents)}`}
                      className="lesson-card"
                      key={type.id}
                      onClick={() =>
                        transitionBooking(() => {
                          setLoadingSlots(true);
                          setSlotsByDate({});
                          setLessonTypeId(type.id);
                          setCalendarWeekCount(8);
                          setSelectedSlot("");
                          goTo("day");
                        })
                      }
                      type="button"
                    >
                      <LessonMark className="lesson-card__mark" lessonTypeId={type.id} />
                      <span className="lesson-card__text">
                        <strong>{formatLessonDuration(type.duration_minutes)}</strong>
                        <span className="lesson-card__meta">{formatMoneyCents(type.price_cents)}</span>
                      </span>
                      <ChevronRight aria-hidden="true" size={20} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        {intent === "lessons" && !needsLessonsSignIn && !isConfirmingBooking ? (
          <div className="booking-workflow-context" aria-label="Viewing your lessons">
            <div>
              <span className="eyebrow">Your calendar</span>
              <strong>{calendarLessonCount ? `${calendarLessonCount} in the next 4 weeks` : "Nothing in the next 4 weeks"}</strong>
            </div>
            <button className="text-action" onClick={startBookingJourney} type="button">
              Book a new lesson
            </button>
          </div>
        ) : null}

        {showWorkflowCalendar ? (
          <div
            className="unified-calendar-shell"
            style={managed && manageMode === "reschedule" && managedCalendarPlaceholderHeight
              ? { height: `${managedCalendarPlaceholderHeight}px` }
              : undefined}
          >
          <div
            aria-labelledby={managed && manageMode === "reschedule" ? "managed-reschedule-heading" : undefined}
            aria-modal={managed && manageMode === "reschedule" ? true : undefined}
            className={`unified-calendar${managed && manageMode === "reschedule" ? " unified-calendar--managed-overlay" : ""}`}
            id="lesson-calendar"
            ref={managedRescheduleRef}
            role={managed && manageMode === "reschedule" ? "dialog" : undefined}
            tabIndex={managed && manageMode === "reschedule" ? -1 : undefined}
          >
          {managed && manageMode === "reschedule" ? (
            <button
              aria-label="Close lesson management"
              className="lesson-manage-workspace__close"
              disabled={manageWorking}
              onClick={dismissManagedDialog}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
          ) : null}
          <div className="calendar-panel unified-calendar__grid">
            <AssetMark asset="/visuals/v2-splats/at-your-pace-splat-v2.svg" className="calendar-panel__mark" />
            <div className="unified-calendar__toolbar">
              <div className="unified-calendar__legend" aria-label="Calendar key">
                <span><i className="is-booked" aria-hidden="true" /> Booked lesson</span>
                {intent === "book" || manageMode === "reschedule" ? (
                  <span><i className="is-free" aria-hidden="true" /> Free to book</span>
                ) : null}
              </div>
              <div className="unified-calendar__range-actions">
                {visibleCalendarWeekCount !== 1 ? (
                  <span className="unified-calendar__range">Next {visibleCalendarWeekCount} weeks</span>
                ) : null}
                {returnCalendarWeekCount ? (
                  <button
                    aria-controls="booking-calendar-weeks"
                    className="text-action unified-calendar__expand"
                    onClick={() => transitionBooking(() => setCalendarWeekCount(returnCalendarWeekCount))}
                    type="button"
                  >
                    Show all
                  </button>
                ) : null}
              </div>
            </div>
            <div className="calendar-weekdays" aria-hidden="true">
              {weekdayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div
              aria-busy={loadingSlots}
              className="calendar-weeks"
              id="booking-calendar-weeks"
              key={visibleCalendarWeekCount === 1 && selectedCalendarWeek
                ? `compact-${selectedCalendarWeek.key}`
                : `overview-${visibleCalendarWeekCount}`}
            >
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
                          data-date-key={cell.key}
                          disabled={!slots.length && !lessons.length}
                          key={cell.key}
                          onClick={() => {
                            transitionBooking(() => {
                              setSelectedDate(cell.key);
                              setCalendarWeekCount(1);
                              setSelectedSlot("");
                              if (lessonType && !managed) {
                                setStep("time");
                                setSubmitError("");
                              }
                            });
                            orientTo("booking-next-step", false, true);
                          }}
                          type="button"
                        >
                          <span>
                            {cell.day}
                            {cell.month !== week.monthNumber ? <em>{shortMonth(cell.month, cell.key)}</em> : null}
                            {lessons.length ? (
                              <small className="calendar-booking-times">
                                {(lessons.length <= 2 ? lessons : lessons.slice(0, 1)).map((booking) => (
                                  <span key={booking.reference}>{formatSlotTime(booking.startAt)}</span>
                                ))}
                                {lessons.length > 2 ? <span>+{lessons.length - 1} more</span> : null}
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
            <div className="unified-calendar__panel-content" key={panelMotionKey}>
            {showAccountSignIn && !student ? (
              <AuthPanel
                heading="Sign in"
                headingLevel={3}
                initialMode="signin"
                intro="Your booked lessons will appear on this calendar."
                onSignedIn={(signedIn) => {
                  transitionBooking(() => {
                    setStudent(signedIn);
                    setShowAccountSignIn(false);
                  });
                  void refreshStudent();
                }}
              />
            ) : managed && manageMode === "reschedule" ? (
              <div className="unified-calendar__move">
                <div className="managed-lesson__header">
                  <div>
                    <p className="eyebrow">Change this lesson</p>
                    <h3 id="managed-reschedule-heading">Choose a new date and time</h3>
                  </div>
                  <button
                    className="booking-back booking-back--tertiary"
                    onClick={() => transitionBooking(() => setManageMode("view"))}
                    type="button"
                  >
                    <ArrowLeft size={16} aria-hidden="true" /> Back
                  </button>
                </div>
                <p className="booking-state-note managed-lesson__current-time">
                  Currently {formatBookedLessonLabel(managed.booking.lessonType)} on{" "}
                  {formatLongDate(managed.booking.startAt)}, {formatSlotTime(managed.booking.startAt)}
                </p>
                {canChangeManagedDuration ? (
                  <fieldset className="managed-lesson__duration">
                    <legend>Lesson length</legend>
                    <div
                      className={`segmented${managedDurationChoices.findIndex((type) => type.id === managedLessonTypeId) === 1 ? " segmented--second" : ""}`}
                    >
                      <span aria-hidden="true" className="segmented__thumb" />
                      {managedDurationChoices.map((type) => (
                        <label
                          className={managedLessonTypeId === type.id ? "is-active" : ""}
                          key={type.id}
                        >
                          <input
                            aria-label={`${type.duration_minutes} minutes`}
                            checked={managedLessonTypeId === type.id}
                            name="managed-lesson-duration"
                            onChange={() => {
                              if (type.id === managedLessonTypeId) return;
                              setLoadingSlots(true);
                              setSlotsByDate({});
                              setManagedLessonTypeId(type.id);
                              setSelectedSlot("");
                            }}
                            type="radio"
                            value={type.id}
                          />
                          {type.duration_minutes} mins
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : managed.booking.lessonType.id !== "trial" && managedPaymentStatus === "paid" ? (
                  <p className="booking-state-note managed-lesson__duration-note">
                    Lesson length: {formatBookedLessonLabel(managed.booking.lessonType)}. As this lesson is already paid,
                    cancel and rebook to change its length.
                  </p>
                ) : null}
                {manageError ? (
                  <div className="booking-alert" role="alert">
                    <AlertCircle size={18} aria-hidden="true" />
                    <p>{manageError}</p>
                  </div>
                ) : null}
                <p className="booking-state-note">
                  {selectedDate ? `${formatLongDate(`${selectedDate}T12:00:00Z`)} · Porto time` : "Choose a free day on the calendar."}
                </p>
                {loadingSlots ? (
                  <p className="booking-state-note">Checking what&rsquo;s free…</p>
                ) : daySlots.length ? (
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
                      ? "Changing…"
                      : selectedSlot
                        ? `Change to ${formatSlotTime(selectedSlot)}`
                        : "Choose a time"}
                  </button>
                  <button
                    className="button button--quiet"
                    onClick={() => transitionBooking(() => setManageMode("view"))}
                    type="button"
                  >
                    Keep current time
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="eyebrow">
                  {selectedDate
                    ? selectedDayBookings.length
                      ? "Selected day"
                      : lessonType
                        ? "Choose a time"
                        : "Selected day"
                    : intent === "lessons"
                      ? "Upcoming lessons"
                      : "Choose a day"}
                </p>
                <h3>
                  {selectedDate
                    ? formatLongDate(`${selectedDate}T12:00:00Z`)
                    : intent === "lessons" && !calendarWindowBookings.length
                      ? "Nothing booked yet"
                      : "Choose a day"}
                </h3>

                {selectedDayBookings.length ? (
                  <div className="unified-calendar__bookings">
                    {selectedDayBookings.map((booking) => (
                      <button
                        className="lesson-calendar__lesson lesson-calendar__lesson--booked"
                        key={booking.reference}
                        onClick={() =>
                          transitionBooking(() => {
                            void openManaged(booking.manageToken, booking.seriesId);
                          })
                        }
                        type="button"
                      >
                        <LessonMark className="lesson-calendar__mark" lessonTypeId={booking.lessonType.id} />
                        <span className="lesson-calendar__lesson-copy">
                          <span className="lesson-calendar__status">
                            <CheckCircle2 size={13} aria-hidden="true" /> Booked
                          </span>
                          <strong>{formatSlotTime(booking.startAt)} Porto time</strong>
                          <span>
                            {formatBookedLessonLabel(booking.lessonType)} · {booking.location === "porto" ? "In Porto" : "Online"}
                          </span>
                        </span>
                        <ChevronRight aria-hidden="true" size={20} />
                      </button>
                    ))}
                  </div>
                ) : null}

                {lessonType ? (
                  <div className="unified-calendar__availability">
                    {!selectedDate ? (
                      <p className="booking-state-note">Choose a day marked free.</p>
                    ) : loadingSlots ? (
                      <p className="booking-state-note">Checking what&rsquo;s free…</p>
                    ) : daySlots.length ? (
                      <div className="slot-grid" key={selectedDate}>
                        {daySlots.map((slot) => {
                          const local = differingLocalTime(slot.startAt, studentZone);
                          return (
                            <button
                              key={slot.startAt}
                              onClick={() =>
                                transitionBooking(() => {
                                  setSelectedSlot(slot.startAt);
                                  goTo("details");
                                })
                              }
                              type="button"
                            >
                              {formatSlotTime(slot.startAt)}
                              {local ? <small>{local} your time</small> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="booking-state-note">No free times on this day.</p>
                    )}
                  </div>
                ) : intent === "book" ? (
                  <p className="unified-calendar__prompt">Choose a lesson type above to add free times to this calendar.</p>
                ) : null}
              </>
            )}
            </div>
          </aside>
          </div>
          </div>
        ) : null}

        {isConfirmingBooking ? (
          <div className="booking-confirmation-stage">
            <h2 className="booking-step-heading" id="booking-step-heading" tabIndex={-1}>
              {student ? "Confirm your lesson" : "Sign in to confirm"}
            </h2>

            <div className="booking-final">
              <aside className="booking-recap">
                <LessonMark className="booking-recap__mark" lessonTypeId={lessonType?.id ?? "single"} />
                <h3>{chosen ? `${formatLongDate(chosen.startAt)}, ${formatSlotTime(chosen.startAt)}` : "Choose a time"}</h3>
                {form.repeat !== "once" ? (
                  <p className="booking-recap__rhythm">
                    <Repeat size={17} aria-hidden="true" />
                    <span>{form.repeat === "open" ? "Every week until you stop it" : "Weekly for 4 weeks"}</span>
                  </p>
                ) : null}
                {chosen && differingLocalTime(chosen.startAt, studentZone) ? (
                  <p>
                    <Globe2 size={17} aria-hidden="true" />
                    {differingLocalTime(chosen.startAt, studentZone)} your time
                  </p>
                ) : null}
                <div className="booking-recap__pair">
                  <p>
                    <Clock3 size={17} aria-hidden="true" />
                    {lessonType ? formatLessonDuration(lessonType.duration_minutes) : "Not selected"}
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
                  <button
                    className="booking-recap__change"
                    onClick={() => transitionBooking(() => goTo("time"))}
                    type="button"
                  >
                    <ArrowLeft size={14} aria-hidden="true" />
                    Change time
                  </button>
                </div>
              </aside>

              {payment ? (
                <div className="booking-payment">
                  <p className="booking-payment__summary">
                    {lessonType ? `${formatLessonDuration(lessonType.duration_minutes)} lesson` : "Your lesson"}
                    {lessonType ? ` · ${formatMoneyCents(lessonType.price_cents)}` : ""}
                    {form.repeat !== "once" ? " for your first lesson" : ""}. Your time is held while you pay.
                  </p>
                  {paymentError ? (
                    <div className="booking-alert" role="alert">
                      <AlertCircle size={18} aria-hidden="true" />
                      <p>{paymentError}</p>
                    </div>
                  ) : null}
                  <div className="booking-payment__mount" ref={paymentMountRef} />
                  <button className="text-action" onClick={() => setPayment(null)} type="button">
                    Back to make a change
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

                  {form.repeat !== "once" ? (
                    <section className="booking-repeat-choice" aria-label="Recurring lesson preview">
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
                                </strong>
                                . You won&rsquo;t have a lesson{" "}
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
                    </section>
                  ) : null}

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
                      You&rsquo;ll pay for your first lesson now, securely with Stripe. Each later lesson goes to the same
                      card automatically on its own day. Move or cancel any lesson free until the day before from your{" "}
                      <button
                        className="booking-form-note__calendar"
                        onClick={() => transitionBooking(() => goTo("time"))}
                        type="button"
                      >
                        lesson calendar
                      </button>
                      . On a lesson&rsquo;s own day it&rsquo;s yours:{" "}
                      <strong>no changes and no refunds</strong>.
                    </p>
                  ) : prepay ? (
                    <p className="booking-form-note">
                      You&rsquo;ll pay now, securely with Stripe. Move or cancel free until the day before from your{" "}
                      <button
                        className="booking-form-note__calendar"
                        onClick={() => transitionBooking(() => goTo("time"))}
                        type="button"
                      >
                        lesson calendar
                      </button>
                      . A cancellation is refunded automatically. On the day of
                      the lesson it&rsquo;s yours: <strong>no changes and no refunds</strong>.
                    </p>
                  ) : (
                    <p className="booking-form-note">
                      You pay on the day, in person with Inês. Change your booking any time from your{" "}
                      <button
                        className="booking-form-note__calendar"
                        onClick={() => transitionBooking(() => goTo("time"))}
                        type="button"
                      >
                        lesson calendar
                      </button>
                      . It is free until the day before, with{" "}
                      <strong>{formatMoneyCents(SAME_DAY_RESCHEDULE_FEE_CENTS)}</strong> charged on the day itself.
                    </p>
                  )}
                </form>
              )}
            </div>
          </div>
        ) : null}
      </div>

    </section>
  );
}
