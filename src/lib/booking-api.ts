import { BOOKING_API_BASE_URL, BOOKING_TIME_ZONE } from "@/lib/config";

export type LessonType = {
  id: string;
  slug: string;
  name: string;
  description: string;
  duration_minutes: number;
  price_cents: number;
};

export type Slot = { startAt: string; endAt: string };

export type AvailabilityResponse = {
  slotsByDate: Record<string, Slot[]>;
  timeZone: string;
  minimumNoticeHours: number;
  horizonDays: number;
  lessonType: { id: string; name: string; durationMinutes: number; priceCents: number };
};

export type Booking = {
  reference: string;
  status: "confirmed" | "cancelled";
  lessonType: { id: string; name: string; durationMinutes: number; priceCents: number };
  startAt: string;
  endAt: string;
  location: "online" | "porto";
  studentName: string;
  studentEmail: string;
  studentTimezone: string;
  notes: string;
  rescheduleCount: number;
  sameDayFeeCents: number;
};

export type ManagedBooking = {
  booking: Booking;
  isPast: boolean;
  sameDayFeeApplies: boolean;
};

export class BookingApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BookingApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BOOKING_API_BASE_URL) {
    throw new BookingApiError("Booking is not connected yet.", 503);
  }

  let response: Response;
  try {
    response = await fetch(`${BOOKING_API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers }
    });
  } catch {
    // A network failure here is indistinguishable from the Worker being down,
    // and both mean the same thing to a student: use another way to reach her.
    throw new BookingApiError("We couldn't reach the booking system. Please check your connection, or message Inês directly.", 0);
  }

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new BookingApiError(data.error || "Something went wrong. Please try again.", response.status);
  }

  return data;
}

export function listLessonTypes() {
  return request<{ lessonTypes: LessonType[] }>("/lesson-types");
}

export function fetchAvailability(lessonType: string, from: string, to: string, signal?: AbortSignal) {
  return request<AvailabilityResponse>(
    `/availability?${new URLSearchParams({ lessonType, from, to })}`,
    { signal }
  );
}

/** Requires a signed-in student: identity comes from the session, not the form. */
export function createBooking(
  session: string,
  payload: {
    notes: string;
    lessonType: string;
    startAt: string;
    location: "online" | "porto";
    timezone: string;
  }
) {
  return request<{
    booking: Booking;
    // Present only when prepayment is switched on: the student is sent to
    // Stripe, and the booking is not confirmed until the webhook arrives.
    checkoutUrl?: string;
    manageUrl?: string;
    manageToken?: string;
  }>("/bookings", {
    method: "POST",
    headers: { Authorization: `Bearer ${session}` },
    body: JSON.stringify(payload)
  });
}

export function fetchBooking(token: string) {
  return request<ManagedBooking>(`/bookings/${encodeURIComponent(token)}`);
}

export function rescheduleBooking(token: string, startAt: string) {
  return request<{ booking: Booking; sameDayFeeApplied: boolean }>(
    `/bookings/${encodeURIComponent(token)}/reschedule`,
    { method: "POST", body: JSON.stringify({ startAt }) }
  );
}

export function cancelBooking(token: string) {
  return request<{ booking: Booking; sameDayFeeApplied: boolean }>(
    `/bookings/${encodeURIComponent(token)}/cancel`,
    { method: "POST", body: "{}" }
  );
}

/** The student's own zone, so times can be shown in it alongside Porto time. */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || BOOKING_TIME_ZONE;
  } catch {
    return BOOKING_TIME_ZONE;
  }
}

export function portoDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  return parts;
}

export function addDaysToKey(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
    shifted.getUTCDate()
  ).padStart(2, "0")}`;
}

export function formatSlotTime(startAt: string, timeZone = BOOKING_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(startAt));
}

export function formatLongDate(value: string | Date, timeZone = BOOKING_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatMoneyCents(cents: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

/**
 * The same instant in the student's own zone, or null when it reads the same as
 * Porto time. Lisbon and London share an offset, so a naive "zones differ"
 * check prints "10:00 your time" under "10:00" for every UK student.
 *
 * Compared per instant rather than per zone: two zones can agree for part of
 * the year and diverge for the rest, around each side's DST change.
 */
export function differingLocalTime(startAt: string, studentZone: string) {
  if (studentZone === BOOKING_TIME_ZONE) return null;

  const local = formatSlotTime(startAt, studentZone);
  return local === formatSlotTime(startAt) ? null : local;
}

export type DayCell = { key: string; day: number; month: number; isToday: boolean };

/**
 * A Monday-first grid running from the week containing `fromKey` to the end of
 * the bookable horizon, rounded out to whole weeks.
 *
 * Deliberately not a calendar month. Late in a month a month grid is mostly
 * dates that are already gone — on the 28th, four fifths of the grid is dead —
 * and it hides the start of the next month, which is exactly where the free
 * time is. This window only ever contains days worth looking at, and it needs
 * no month navigation because it already spans the whole horizon.
 */
export function buildBookingGrid(fromKey: string, horizonDays: number): DayCell[] {
  const [year, month, day] = fromKey.split("-").map(Number);
  const from = Date.UTC(year, month - 1, day);
  const leading = (new Date(from).getUTCDay() + 6) % 7; // Monday = 0
  const gridStart = from - leading * 86400000;

  // Whole weeks, enough to cover the horizon, and never a single week.
  const spanDays = leading + Math.max(horizonDays, 7) + 1;
  const cells = Math.ceil(spanDays / 7) * 7;

  return Array.from({ length: cells }, (_, index) => {
    const date = new Date(gridStart + index * 86400000);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      isToday: key === fromKey
    };
  });
}

/** Month name for a cell, used to label where the grid crosses into a new one. */
export function monthLabel(monthNumber: number, yearHint: string) {
  const [year] = yearHint.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
