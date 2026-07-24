"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  UserRound
} from "lucide-react";
import {
  BOOKING_API_BASE_URL,
  LESSON_DURATION_MINUTES,
  SQUARE_BOOKING_URL,
  formatLessonDuration,
  formatMoney
} from "@/lib/config";

type BookingSlot = {
  id: string;
  startAt: string;
  endAt?: string;
  locationId?: string;
  durationMinutes?: number;
  teamMemberId?: string;
  serviceVariationId?: string;
  serviceVariationVersion?: number;
  appointmentSegments?: Array<{
    durationMinutes?: number;
    serviceVariationId?: string;
    serviceVariationVersion?: number;
    teamMemberId?: string;
  }>;
};

type AvailabilityResponse = {
  slots?: BookingSlot[];
};

type FormState = {
  name: string;
  email: string;
  phone: string;
  notes: string;
};

type SubmitState =
  | { status: "idle"; message: string }
  | { status: "submitting"; message: string }
  | { status: "success"; message: string; bookingId?: string }
  | { status: "error"; message: string };

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const apiBaseUrl = BOOKING_API_BASE_URL;
const hostedBookingUrl = SQUARE_BOOKING_URL;
const emptyForm: FormState = { name: "", email: "", phone: "", notes: "" };

const lisbonDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Lisbon",
  year: "numeric"
});

const monthLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric"
});

const longDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  weekday: "long",
  year: "numeric"
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Lisbon"
});

export function CustomSquareBookingFlow() {
  const [ready, setReady] = useState(false);
  const [todayKey, setTodayKey] = useState("");
  const [monthKey, setMonthKey] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [liveSlots, setLiveSlots] = useState<Record<string, BookingSlot[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle", message: "" });

  useEffect(() => {
    const now = new Date();
    const currentTodayKey = toDateKey(now);
    const initialMonthKey = toMonthKey(now);
    const firstAvailable = firstDemoDateKey(currentTodayKey, initialMonthKey);

    setTodayKey(currentTodayKey);
    setMonthKey(initialMonthKey);
    setSelectedDate(firstAvailable ?? currentTodayKey);
    setReady(true);
  }, []);

  const demoSlots = useMemo(() => {
    if (!ready || !monthKey || !todayKey) return {};
    return buildDemoSlots(todayKey, monthKey);
  }, [monthKey, ready, todayKey]);

  useEffect(() => {
    if (!ready || !apiBaseUrl || !monthKey) return;

    const controller = new AbortController();
    const monthStart = parseDateKey(monthKey);
    const monthEnd = addMonths(monthStart, 1);

    setLoadingSlots(true);
    setAvailabilityError("");

    fetch(
      `${apiBaseUrl}/availability?${new URLSearchParams({
        start: toDateKey(monthStart),
        end: toDateKey(monthEnd)
      })}`,
      { headers: { Accept: "application/json" }, signal: controller.signal }
    )
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as AvailabilityResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error || "Square availability is not available yet.");
        }
        return groupSlotsByDate(data.slots ?? []);
      })
      .then((slotsByDate) => {
        setLiveSlots(slotsByDate);
        const firstDate = Object.keys(slotsByDate)
          .sort()
          .find((dateKey) => dateKey >= todayKey);

        setSelectedDate((currentDate) =>
          currentDate && slotsByDate[currentDate]?.length ? currentDate : firstDate ?? currentDate
        );
        setSelectedSlotId("");
      })
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        setLiveSlots({});
        setAvailabilityError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSlots(false);
      });

    return () => controller.abort();
  }, [monthKey, ready, todayKey]);

  const slotsByDate = apiBaseUrl ? liveSlots : demoSlots;
  const selectedSlots = selectedDate ? slotsByDate[selectedDate] ?? [] : [];
  const selectedSlot = selectedSlots.find((slot) => slot.id === selectedSlotId) ?? null;
  const selectedDay = selectedDate ? parseDateKey(selectedDate) : null;
  const calendarDays = useMemo(() => {
    if (!ready || !monthKey) return [];
    return buildCalendarDays(monthKey);
  }, [monthKey, ready]);
  const canSubmit =
    Boolean(apiBaseUrl) &&
    Boolean(selectedSlot) &&
    form.name.trim().length > 1 &&
    form.email.includes("@") &&
    form.phone.trim().length > 5 &&
    submitState.status !== "submitting";

  if (!ready) {
    return (
      <section className="custom-booking-calendar booking-loading-panel" aria-label="Loading booking calendar">
        <div />
      </section>
    );
  }

  function changeMonth(offset: number) {
    const nextMonth = addMonths(parseDateKey(monthKey), offset);
    const nextMonthKey = toMonthKey(nextMonth);
    setMonthKey(nextMonthKey);
    setSelectedSlotId("");

    if (!selectedDate.startsWith(nextMonthKey.slice(0, 7))) {
      setSelectedDate(firstDemoDateKey(todayKey, nextMonthKey) ?? nextMonthKey);
    }
  }

  function chooseDate(dateKey: string) {
    setSelectedDate(dateKey);
    setSelectedSlotId("");
    setSubmitState({ status: "idle", message: "" });
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot || !canSubmit) return;

    setSubmitState({ status: "submitting", message: "Creating the booking in Square..." });

    try {
      const response = await fetch(`${apiBaseUrl}/bookings`, {
        body: JSON.stringify({
          customer: {
            email: form.email.trim(),
            name: form.name.trim(),
            phone: form.phone.trim()
          },
          customerNote: form.notes.trim(),
          slot: selectedSlot
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const data = (await response.json().catch(() => ({}))) as { bookingId?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Square could not confirm that time.");
      }

      setSubmitState({
        bookingId: data.bookingId,
        message: "Booked. Check your email for the confirmation and change-booking link.",
        status: "success"
      });
    } catch (error) {
      setSubmitState({
        message: error instanceof Error ? error.message : "The booking could not be created.",
        status: "error"
      });
    }
  }

  return (
    <section className="custom-booking-calendar" aria-label="Custom Square booking calendar">
      <div className="calendar-column">
        <div className="calendar-section-heading">
          <h2>Choose a day</h2>
          <p>Outlined dates have bookable times.</p>
        </div>

        <div className="calendar-month-nav">
          <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)}>
            <ChevronLeft size={20} />
          </button>
          <strong>{monthLabelFormatter.format(parseDateKey(monthKey))}</strong>
          <button type="button" aria-label="Next month" onClick={() => changeMonth(1)}>
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="calendar-weekdays" aria-hidden="true">
          {weekdays.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>

        <div className="calendar-grid" aria-label="Available lesson dates">
          {calendarDays.map((day) => {
            const slots = slotsByDate[day.dateKey] ?? [];
            const hasSlots = slots.length > 0;
            const isSelected = selectedDate === day.dateKey;
            const isPast = day.dateKey < todayKey;
            const disabled = isPast || !hasSlots;

            return (
              <button
                aria-label={`${longDateFormatter.format(day.date)}${hasSlots ? `, ${slots.length} available times` : ""}`}
                aria-pressed={isSelected}
                className={isSelected ? "is-selected" : hasSlots ? "has-availability" : ""}
                disabled={disabled}
                key={day.dateKey}
                onClick={() => chooseDate(day.dateKey)}
                type="button"
              >
                <span className={day.inMonth ? "" : "is-muted"}>{day.date.getDate()}</span>
              </button>
            );
          })}
        </div>

        <div className="calendar-note">
          <span aria-hidden="true" />
          <p>
            {apiBaseUrl
              ? "Live availability · Porto time"
              : "Preview mode is showing sample slots until the Square API is connected."}
          </p>
        </div>
      </div>

      <div className="booking-detail-column">
        <div className="time-panel">
          <div className="calendar-section-heading">
            <h2>Available times</h2>
            <p aria-live="polite">{selectedDay ? longDateFormatter.format(selectedDay) : "Choose a day"}</p>
          </div>

          {loadingSlots ? (
            <p className="booking-state-note">Checking Square availability...</p>
          ) : availabilityError ? (
            <div className="booking-alert" role="status">
              <AlertCircle size={18} />
              <p>{availabilityError}</p>
            </div>
          ) : selectedSlots.length ? (
            <div className="slot-grid" aria-label="Available lesson times">
              {selectedSlots.map((slot) => (
                <button
                  className={selectedSlotId === slot.id ? "is-selected" : ""}
                  key={slot.id}
                  onClick={() => {
                    setSelectedSlotId(slot.id);
                    setSubmitState({ status: "idle", message: "" });
                  }}
                  type="button"
                >
                  {formatSlotTime(slot.startAt)}
                </button>
              ))}
            </div>
          ) : (
            <p className="booking-state-note">No times are available on this day.</p>
          )}
        </div>

        <div className="booking-summary-grid">
          <div className="lesson-summary">
            <h3>Portuguese lesson</h3>
            <p>
              <Clock3 size={18} aria-hidden="true" />
              {formatLessonDuration(selectedSlot?.durationMinutes ?? LESSON_DURATION_MINUTES)}
            </p>
            <p>
              <CalendarDays size={18} aria-hidden="true" />
              {selectedSlot && selectedDay
                ? `${formatSlotTime(selectedSlot.startAt)} on ${longDateFormatter.format(selectedDay)}`
                : "Choose a time"}
            </p>
            <p>
              <MapPin size={18} aria-hidden="true" />
              In Porto or online
            </p>
            <strong>{formatMoney()}</strong>
          </div>

          <form className="student-details-form" onSubmit={submitBooking}>
            <h3>Your details</h3>
            <label>
              <span>
                <UserRound size={16} aria-hidden="true" />
                Full name
              </span>
              <input
                autoComplete="name"
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
                value={form.name}
              />
            </label>
            <label>
              <span>
                <Mail size={16} aria-hidden="true" />
                Email
              </span>
              <input
                autoComplete="email"
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                required
                type="email"
                value={form.email}
              />
            </label>
            <label>
              <span>
                <Phone size={16} aria-hidden="true" />
                Phone or WhatsApp
              </span>
              <input
                autoComplete="tel"
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                required
                type="tel"
                value={form.phone}
              />
            </label>
            <label>
              <span>
                <MessageSquareText size={16} aria-hidden="true" />
                Notes
              </span>
              <textarea
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                value={form.notes}
              />
            </label>

            <button className="button button-primary booking-confirm-button" disabled={!canSubmit} type="submit">
              {apiBaseUrl ? (submitState.status === "submitting" ? "Confirming..." : "Confirm booking") : "Connect Square API"}
            </button>

            {submitState.message ? (
              <p className={`booking-form-status is-${submitState.status}`} aria-live="polite">
                {submitState.status === "success" ? <CheckCircle2 size={17} aria-hidden="true" /> : null}
                {submitState.status === "error" ? <AlertCircle size={17} aria-hidden="true" /> : null}
                {submitState.message}
              </p>
            ) : null}
          </form>
        </div>

        {hostedBookingUrl ? (
          <p className="booking-manage-link">
            Already have a booking?{" "}
            <a href={hostedBookingUrl} target="_blank" rel="noreferrer">
              Open Square to sign in <ExternalLink size={14} aria-hidden="true" />
            </a>
          </p>
        ) : null}
      </div>
    </section>
  );
}

function buildCalendarDays(monthKey: string) {
  const monthStart = parseDateKey(monthKey);
  const offset = (monthStart.getDay() + 6) % 7;
  const gridStart = addDays(monthStart, -offset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      dateKey: toDateKey(date),
      inMonth: date.getMonth() === monthStart.getMonth()
    };
  });
}

function buildDemoSlots(todayKey: string, monthKey: string) {
  const slotsByDate: Record<string, BookingSlot[]> = {};
  const monthStart = parseDateKey(monthKey);
  const monthEnd = addMonths(monthStart, 1);

  for (let date = monthStart; date < monthEnd; date = addDays(date, 1)) {
    const dateKey = toDateKey(date);
    const weekday = date.getDay();
    const isBookableWeekday = weekday === 1 || weekday === 3 || weekday === 5;

    if (dateKey <= todayKey || !isBookableWeekday) continue;

    const times = weekday === 5 ? ["10:30", "14:00", "16:30"] : ["09:00", "12:00", "17:00"];
    slotsByDate[dateKey] = times.map((time) => makeDemoSlot(dateKey, time));
  }

  return slotsByDate;
}

function firstDemoDateKey(todayKey: string, monthKey: string) {
  const demoSlots = buildDemoSlots(todayKey, monthKey);
  return Object.keys(demoSlots).sort()[0];
}

function makeDemoSlot(dateKey: string, time: string): BookingSlot {
  const [hour, minute] = time.split(":").map(Number);
  const start = parseDateKey(dateKey);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start);
  end.setMinutes(start.getMinutes() + LESSON_DURATION_MINUTES);

  return {
    durationMinutes: LESSON_DURATION_MINUTES,
    endAt: end.toISOString(),
    id: `preview-${dateKey}-${time}`,
    startAt: start.toISOString()
  };
}

function groupSlotsByDate(slots: BookingSlot[]) {
  return slots.reduce<Record<string, BookingSlot[]>>((groups, slot) => {
    const dateKey = dateKeyFromInstant(slot.startAt);
    groups[dateKey] = [...(groups[dateKey] ?? []), slot].sort((first, second) =>
      first.startAt.localeCompare(second.startAt)
    );
    return groups;
  }, {});
}

function dateKeyFromInstant(value: string) {
  const parts = lisbonDateFormatter.formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function formatSlotTime(value: string) {
  return timeFormatter.format(new Date(value));
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}
