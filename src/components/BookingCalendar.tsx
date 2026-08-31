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
  Repeat
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
import { clearSession, fetchMe, readSession, type LessonSeries, type MyBooking, type Student } from "@/lib/auth-api";
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

type Step = "lesson" | "day" | "time" | "details";
type BookingIntent = "choose" | "book" | "lessons";
type CalendarWeekCount = 1 | 4 | 8;

/** "once" is a real choice, not the absence of one, so it lives in the union. */
type RepeatOption = "once" | 4 | "open";
type FormState = { notes: string; location: "online" | "porto"; repeat: RepeatOption };
const emptyForm: FormState = { notes: "", location: "online", repeat: "once" };

function minutesToClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

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

let bookingTransition: ViewTransition | null = null;
let bookingFallbackTimer: number | null = null;
let bookingFallbackFinished: Promise<void> | null = null;
let resolveBookingFallback: (() => void) | null = null;

function finishBookingFallback() {
  if (bookingFallbackTimer !== null) window.clearTimeout(bookingFallbackTimer);
  document.documentElement.classList.remove("booking-fallback-transitioning");
  bookingFallbackTimer = null;
  const resolve = resolveBookingFallback;
  resolveBookingFallback = null;
  bookingFallbackFinished = null;
  resolve?.();
}

function fallbackBookingTransition(update: () => void) {
  if (bookingFallbackFinished) finishBookingFallback();
  bookingFallbackFinished = new Promise((resolve) => {
    resolveBookingFallback = resolve;
  });
  document.documentElement.classList.add("booking-fallback-transitioning");
  flushSync(update);
  bookingFallbackTimer = window.setTimeout(finishBookingFallback, 280);
}

/**
 * The calendar changes shape as choices are made. Where the browser supports
 * same-document view transitions, let it blend the old and new geometry
 * instead of flashing between two layouts. The state update stays synchronous
 * so the new snapshot is reliable; older browsers get the same working flow
 * with the small CSS entrance fades below it.
 */
function transitionBooking(update: () => void) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }

  if (typeof document.startViewTransition !== "function") {
    fallbackBookingTransition(update);
    return;
  }

  bookingTransition?.skipTransition();
  document.documentElement.classList.add("booking-transitioning");
  let transition: ViewTransition;
  try {
    transition = document.startViewTransition(() => flushSync(update));
  } catch {
    bookingTransition = null;
    document.documentElement.classList.remove("booking-transitioning");
    fallbackBookingTransition(update);
    return;
  }
  bookingTransition = transition;
  // A quick second choice deliberately aborts the first transition. Chromium
  // rejects `ready`/`updateCallbackDone` for that interrupted visual snapshot
  // even though the state update itself succeeded, so consume those expected
  // rejections rather than surfacing a false page error.
  void transition.ready.catch(() => undefined);
  void transition.updateCallbackDone.catch(() => undefined);
  void transition.finished
    .catch(() => undefined)
    .finally(() => {
      if (bookingTransition === transition) {
        bookingTransition = null;
        document.documentElement.classList.remove("booking-transitioning");
      }
    });
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

  const activeTransition = bookingTransition;
  if (activeTransition) {
    void activeTransition.finished.catch(() => undefined).then(orient);
  } else if (bookingFallbackFinished) {
    void bookingFallbackFinished.then(orient);
  } else {
    orient();
  }
}

export function BookingCalendar({ initialManageToken = "" }: { initialManageToken?: string } = {}) {
  const [step, setStep] = useState<Step>("lesson");
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
  const [managed, setManaged] = useState<ManagedBooking | null>(null);
  const [manageMode, setManageMode] = useState<"view" | "reschedule" | "confirm-cancel" | "sequence" | "confirm-stop-sequence">("view");
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

    refreshStudent()
      .catch(() => clearSession())
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
      setLessonTypeId("");
      setSelectedDate("");
      setSelectedSlot("");
      setCalendarWeekCount(8);
      setStep("lesson");
    });
    orientTo("booking-lesson-choice");
  }, [hasPriorBooking, lessonTypeId]);

  const openManaged = useCallback(async (token: string, seriesId: string | null = null) => {
    if (!token) return;
    setIntent("lessons");
    setCalendarWeekCount(1);
    setManagedToken(token);
    setManagedSeriesId(seriesId);
    setManageLoading(true);
    setManageError("");
    setManageOutcome("");
    setManageMode("view");
    setSelectedSlot("");
    try {
      const result = await fetchBooking(token);
      transitionBooking(() => {
        setManaged(result);
        setSelectedDate(portoDateKey(new Date(result.booking.startAt)));
        setManageLoading(false);
      });
    } catch (caught) {
      transitionBooking(() => {
        setManaged(null);
        setManageError(caught instanceof Error ? caught.message : "That lesson could not be opened.");
        setManageLoading(false);
      });
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
  const allUpcomingLessonCount = new Set(
    calendarBookings.map((booking) => booking.seriesId ? `series:${booking.seriesId}` : `booking:${booking.reference}`)
  ).size;

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
  // rows, and anything beyond them lives in Upcoming lessons in the account menu.
  const calendarWeeks = uncappedCalendarWeeks.slice(0, 8);
  const fourWeekCalendarWeeks = calendarWeeks.slice(0, 4);
  const fourWeekCalendarEnd = fourWeekCalendarWeeks.at(-1)?.cells.at(-1)?.key ?? "";
  const overviewCalendarWeeks = intent === "lessons" ? fourWeekCalendarWeeks : calendarWeeks;
  const visibleCalendarDates = new Set(overviewCalendarWeeks.flatMap((week) => week.cells.map((cell) => cell.key)));
  const calendarWindowBookings = calendarBookings.filter((booking) =>
    visibleCalendarDates.has(portoDateKey(new Date(booking.startAt)))
  );
  const calendarLessonCount = new Set(
    calendarWindowBookings.map((booking) => booking.seriesId ? `series:${booking.seriesId}` : `booking:${booking.reference}`)
  ).size;
  const bookingsByDate = calendarWindowBookings.reduce<Record<string, MyBooking[]>>((dates, booking) => {
    const key = portoDateKey(new Date(booking.startAt));
    (dates[key] ??= []).push(booking);
    return dates;
  }, {});
  const selectedCalendarWeek = selectedDate
    ? overviewCalendarWeeks.find((week) => week.cells.some((cell) => cell.key === selectedDate))
    : undefined;
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
    (intent === "lessons" || Boolean(intent === "book" && lessonType && step !== "lesson") || Boolean(managed));
  const resolvedManagedSeriesId = managedSeriesId ?? myBookings.find((booking) => booking.manageToken === managedToken)?.seriesId ?? null;
  const activeManagedSeries = resolvedManagedSeriesId
    ? lessonSeries.find((entry) => entry.id === resolvedManagedSeriesId) ?? null
    : null;
  const visibleLessonTypes = hasPriorBooking ? lessonTypes.filter((type) => type.id !== "trial") : lessonTypes;
  const panelMotionKey = showAccountSignIn && !student
    ? "sign-in"
    : manageLoading
      ? "manage-loading"
      : managed
        ? `managed-${managed.booking.reference}-${manageMode}`
        : manageError
          ? "manage-error"
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
    } else if (next === "lesson") {
      orientTo("booking-lesson-choice");
    }
  }

  function startBookingJourney() {
    transitionBooking(() => {
      setIntent("book");
      setShowAccountSignIn(false);
      setManaged(null);
      setManagedToken("");
      setManageMode("view");
      setLessonTypeId("");
      setSelectedDate("");
      setSelectedSlot("");
      setCalendarWeekCount(8);
      setStep("lesson");
    });
    orientTo("booking-lesson-choice", true);
  }

  function openLessonsJourney() {
    transitionBooking(() => {
      setIntent("lessons");
      setLessonTypeId("");
      setSelectedSlot("");
      setCalendarWeekCount(4);
      setStep("day");
      setShowAccountSignIn(!student);
      if (firstCalendarBookingStart) {
        setSelectedDate(portoDateKey(new Date(firstCalendarBookingStart)));
      } else {
        setSelectedDate("");
      }
    });
    orientTo(student ? "lesson-calendar" : "booking-lessons-sign-in", true);
  }

  function resetJourneyToStart() {
    closeManagedLesson();
    setIntent("choose");
    setShowAccountSignIn(false);
    setLessonTypeId("");
    setSelectedDate("");
    setSelectedSlot("");
    setCalendarWeekCount(4);
    setStep("lesson");
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
    if (!managedToken || !selectedSlot) return;
    setManageWorking(true);
    setManageError("");
    try {
      await rescheduleBooking(managedToken, selectedSlot);
      const refreshed = await fetchBooking(managedToken);
      transitionBooking(() => {
        setManaged(refreshed);
        setSelectedDate(portoDateKey(new Date(refreshed.booking.startAt)));
        setSelectedSlot("");
        setManageMode("view");
        setManageOutcome("Your lesson has been moved. We’ve emailed you and updated your calendar.");
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

  async function stopManagedSequence() {
    if (!resolvedManagedSeriesId) return;
    setManageWorking(true);
    setManageError("");
    try {
      await stopSeries(readSession(), resolvedManagedSeriesId);
      transitionBooking(() => {
        setManageMode("view");
        setManageOutcome("This sequence has stopped. The lessons already booked stay in your calendar.");
      });
      await refreshStudent();
    } catch (caught) {
      setManageError(caught instanceof Error ? caught.message : "That sequence could not be stopped.");
    } finally {
      setManageWorking(false);
    }
  }

  function closeManagedLesson() {
    setManaged(null);
    setManagedToken("");
    setManagedSeriesId(null);
    setManageMode("view");
    setManageError("");
    setManageOutcome("");
    setSelectedSlot("");
    if (selectedDate && !overviewCalendarWeeks.some((week) => week.cells.some((cell) => cell.key === selectedDate))) {
      setSelectedDate(firstCalendarBookingStart ? portoDateKey(new Date(firstCalendarBookingStart)) : "");
    }
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
            onClick={() =>
              transitionBooking(() => {
                setConfirmation(null);
                setStep("day");
                setSelectedDate(portoDateKey(new Date(confirmation.startAt)));
              })
            }
            type="button"
          >
            Back to your calendar
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
              laterThan={fourWeekCalendarEnd}
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
                setManageMode("view");
                setHasPriorBooking(false);
                setIntent("choose");
                setLessonTypeId("");
                setSelectedDate("");
                setSelectedSlot("");
              }}
              showCalendar={false}
              showHistory
              showLaterLessons
              showSeries={false}
            />
          </section>
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
              intro="Your upcoming lessons will appear on the calendar."
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
                  onClick={() =>
                    transitionBooking(() => {
                      setSelectedSlot("");
                      setCalendarWeekCount(8);
                      goTo("lesson");
                    })
                  }
                  type="button"
                >
                  Change lesson
                </button>
              </div>
            ) : (
              <>
                <div className="booking-workflow-step-head">
                  <h2>Choose a lesson</h2>
                  <button className="booking-back booking-back--tertiary" onClick={returnToJourneyStart} type="button">
                    <ArrowLeft size={16} aria-hidden="true" /> Back
                  </button>
                </div>
                {checkingSession ? (
                  <p className="booking-state-note">Checking which lessons are available to you…</p>
                ) : (
                  <div className="lesson-choice">
                  {visibleLessonTypes.map((type) => (
                    <button
                      aria-pressed={lessonTypeId === type.id}
                      className={`lesson-card${lessonTypeId === type.id ? " is-selected" : ""}`}
                      key={type.id}
                      onClick={() =>
                        transitionBooking(() => {
                          if (type.id !== lessonTypeId) {
                            setLoadingSlots(true);
                            setSlotsByDate({});
                          }
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
                )}
              </>
            )}
          </div>
        ) : null}

        {intent === "lessons" && !needsLessonsSignIn && !managed && !isConfirmingBooking ? (
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
          <div className="unified-calendar" id="lesson-calendar">
          <div className="calendar-panel unified-calendar__grid">
            <AssetMark asset="/visuals/v2-splats/at-your-pace-splat-v2.svg" className="calendar-panel__mark" />
            <div className="unified-calendar__toolbar">
              <div className="unified-calendar__legend" aria-label="Calendar key">
                <span><i className="is-booked" aria-hidden="true" /> Booked lesson</span>
                {intent === "book" ? <span><i className="is-free" aria-hidden="true" /> Free to book</span> : null}
              </div>
              <div className="unified-calendar__range-actions">
                <span className="unified-calendar__range">
                  {visibleCalendarWeekCount === 1 ? "Selected week" : `Next ${visibleCalendarWeekCount} weeks`}
                </span>
                {returnCalendarWeekCount ? (
                  <button
                    aria-controls="booking-calendar-weeks"
                    className="text-action unified-calendar__expand"
                    onClick={() => transitionBooking(() => setCalendarWeekCount(returnCalendarWeekCount))}
                    type="button"
                  >
                    Back to {returnCalendarWeekCount} weeks
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
            ) : manageLoading ? (
              <p className="booking-state-note">Opening your lesson…</p>
            ) : managed ? (
              <>
                <div className="managed-lesson__header">
                  <div>
                    <p className="lesson-calendar__status">
                      {managed.booking.status === "cancelled" ? "Cancelled lesson" : "Booked lesson"}
                    </p>
                    <h3>{managed.booking.lessonType.name}</h3>
                  </div>
                  <button
                    aria-label="Back to calendar"
                    className="booking-back booking-back--tertiary"
                    onClick={() => transitionBooking(closeManagedLesson)}
                    type="button"
                  >
                    <ArrowLeft size={16} aria-hidden="true" /> Calendar
                  </button>
                </div>
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
                      onClick={() =>
                        transitionBooking(() => {
                          setManageMode("reschedule");
                          setSelectedSlot("");
                          setLoadingSlots(true);
                        })
                      }
                      type="button"
                    >
                      Move this lesson
                    </button>
                    <button
                      className="button button--quiet"
                      onClick={() => transitionBooking(() => setManageMode("confirm-cancel"))}
                      type="button"
                    >
                      Cancel this lesson
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
                      <button
                        className="button button--quiet"
                        onClick={() => transitionBooking(() => setManageMode("view"))}
                        type="button"
                      >
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
                      <button
                        className="button button--quiet"
                        onClick={() => transitionBooking(() => setManageMode("view"))}
                        type="button"
                      >
                        Keep time
                      </button>
                    </div>
                  </div>
                ) : null}

                {resolvedManagedSeriesId &&
                manageMode !== "reschedule" &&
                manageMode !== "confirm-cancel" ? (
                  <section className="managed-lesson__series-context" aria-labelledby="managed-sequence-heading">
                    <div className="managed-lesson__series-heading">
                      <Repeat size={18} aria-hidden="true" />
                      <div>
                        <h3 className="eyebrow" id="managed-sequence-heading">Part of a recurring sequence</h3>
                        {activeManagedSeries ? (
                          <p>
                            {weekdayNames[activeManagedSeries.weekday]} at {minutesToClock(activeManagedSeries.minuteOfDay)} Porto time
                            {activeManagedSeries.openEnded ? ", every week" : ""}. {activeManagedSeries.upcoming} {activeManagedSeries.upcoming === 1 ? "lesson is" : "lessons are"} already booked.
                          </p>
                        ) : (
                          <p>This sequence is no longer adding lessons. This booked occurrence is still yours.</p>
                        )}
                      </div>
                    </div>

                    {activeManagedSeries && manageMode === "view" ? (
                      <button className="text-action" onClick={() => transitionBooking(() => setManageMode("sequence"))} type="button">
                        Manage sequence <ChevronRight size={17} aria-hidden="true" />
                      </button>
                    ) : null}

                    {activeManagedSeries && manageMode === "sequence" ? (
                      <div className="managed-lesson__series-manage">
                        <p>
                          You can stop new weekly lessons being added. Every date already booked stays in your calendar and can still be moved or cancelled individually.
                        </p>
                        <div className="manage-booking__actions">
                          <button className="button button--quiet" onClick={() => transitionBooking(() => setManageMode("confirm-stop-sequence"))} type="button">
                            Stop repeating
                          </button>
                          <button className="text-action" onClick={() => transitionBooking(() => setManageMode("view"))} type="button">
                            Back to this lesson
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {activeManagedSeries && manageMode === "confirm-stop-sequence" ? (
                      <div className="managed-lesson__series-manage">
                        <p><strong>Stop this recurring sequence?</strong> Your booked lessons will stay.</p>
                        <div className="manage-booking__actions">
                          <button className="button button--coral" disabled={manageWorking} onClick={stopManagedSequence} type="button">
                            {manageWorking ? "Stopping…" : "Yes, stop repeating"}
                          </button>
                          <button className="button button--quiet" disabled={manageWorking} onClick={() => transitionBooking(() => setManageMode("view"))} type="button">
                            Keep repeating
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </>
            ) : manageError ? (
              <div className="booking-alert" role="alert">
                <AlertCircle size={18} aria-hidden="true" />
                <p>{manageError}</p>
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
                            {booking.lessonType.name} · {booking.location === "porto" ? "In Porto" : "Online"}
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
                      <div className="time-groups" key={selectedDate}>
                        {groupSlots(daySlots).map((group) => (
                          <div className="time-group" key={group.label}>
                            <h4>{group.label}</h4>
                            <div className="slot-grid">
                              {group.slots.map((slot) => {
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
                          </div>
                        ))}
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
        ) : null}

        {isConfirmingBooking ? (
          <div className="booking-confirmation-stage">
            <h2 className="booking-step-heading" id="booking-step-heading" tabIndex={-1}>
              {student ? "Confirm your lesson" : "Sign in to confirm"}
            </h2>

            <div className="booking-final">
              <aside className="booking-recap">
                <LessonMark className="booking-recap__mark" lessonTypeId={lessonType?.id ?? "single"} />
                <h3>{lessonType?.name}</h3>
                <p>
                  <CalendarDays size={17} aria-hidden="true" />
                  <span>{chosen ? `${formatLongDate(chosen.startAt)}, ${formatSlotTime(chosen.startAt)}` : "Not selected"}</span>
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
                    {lessonType?.name}
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
