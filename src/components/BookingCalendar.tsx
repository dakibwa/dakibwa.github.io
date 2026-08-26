"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe2,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  UserRound
} from "lucide-react";
import {
  addDaysToKey,
  browserTimeZone,
  buildMonthGrid,
  createBooking,
  fetchAvailability,
  formatLongDate,
  formatMoneyCents,
  differingLocalTime,
  formatSlotTime,
  listLessonTypes,
  portoDateKey,
  type LessonType,
  type Slot
} from "@/lib/booking-api";
import { BOOKING_TIME_ZONE, CONTACT_WHATSAPP_URL, SAME_DAY_RESCHEDULE_FEE_CENTS, formatLessonDuration } from "@/lib/config";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthLabelFormatter = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

type FormState = {
  name: string;
  email: string;
  phone: string;
  notes: string;
  location: "online" | "porto";
};

const emptyForm: FormState = { name: "", email: "", phone: "", notes: "", location: "online" };

type Confirmation = { reference: string; startAt: string; manageUrl: string; email: string };

function monthKeyOf(key: string) {
  return key.slice(0, 7);
}

export function BookingCalendar() {
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
  const detailsRef = useRef<HTMLDivElement>(null);

  const lessonType = lessonTypes.find((type) => type.id === lessonTypeId) ?? null;
  const showBothZones = studentZone !== BOOKING_TIME_ZONE;

  useEffect(() => {
    const now = new Date();
    const key = portoDateKey(now);
    setTodayKey(key);
    setMonthKey(monthKeyOf(key));
    setStudentZone(browserTimeZone());

    listLessonTypes()
      .then(({ lessonTypes: types }) => {
        setLessonTypes(types);
        setLessonTypeId((current) => current || types.find((type) => type.id === "single")?.id || types[0]?.id || "");
      })
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  const loadAvailability = useCallback(
    (signal?: AbortSignal) => {
      if (!lessonTypeId || !monthKey || !todayKey) return;

      const monthStart = `${monthKey}-01`;
      const from = monthStart < todayKey ? todayKey : monthStart;
      const to = addDaysToKey(`${monthKey}-01`, 41);

      setLoadingSlots(true);
      setLoadError("");

      fetchAvailability(lessonTypeId, from, to, signal)
        .then((data) => {
          setSlotsByDate(data.slotsByDate);
          setSelectedDate((current) => {
            if (current && data.slotsByDate[current]?.length) return current;
            return Object.keys(data.slotsByDate).sort()[0] ?? "";
          });
          setSelectedSlot("");
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

  const canSubmit =
    Boolean(chosen) &&
    Boolean(lessonType) &&
    form.name.trim().length > 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()) &&
    !submitting;

  function changeMonth(offset: number) {
    const [year, month] = monthKey.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + offset, 1));
    const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    if (offset < 0 && nextKey < monthKeyOf(todayKey)) return;
    setMonthKey(nextKey);
    setSelectedSlot("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !chosen || !lessonType) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const result = await createBooking({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim(),
        lessonType: lessonType.id,
        startAt: chosen.startAt,
        location: form.location,
        timezone: studentZone
      });

      setConfirmation({
        reference: result.booking.reference,
        startAt: result.booking.startAt,
        manageUrl: result.manageUrl,
        email: result.booking.studentEmail
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The booking could not be created.";
      setSubmitError(message);
      // A 409 means someone took the slot in the meantime; refresh so the
      // student is choosing from times that still exist.
      if (message.toLowerCase().includes("taken") || message.toLowerCase().includes("available")) {
        loadAvailability();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <section className="booking-success" aria-live="polite">
        <CheckCircle2 size={40} aria-hidden="true" />
        <p className="eyebrow">Booked</p>
        <h2>You&rsquo;re booked in.</h2>
        <p className="booking-success__when">
          {formatLongDate(confirmation.startAt)} at {formatSlotTime(confirmation.startAt)} Porto time
          {differingLocalTime(confirmation.startAt, studentZone)
            ? ` · ${differingLocalTime(confirmation.startAt, studentZone)} your time`
            : ""}
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
    <section className="custom-booking-calendar" aria-label="Book a Portuguese lesson">
      <div className="calendar-column">
        <div className="calendar-section-heading">
          <h2>Choose a lesson</h2>
        </div>

        <div className="lesson-type-picker" role="radiogroup" aria-label="Lesson type">
          {lessonTypes.map((type) => (
            <button
              aria-checked={type.id === lessonTypeId}
              className={`lesson-type-option${type.id === lessonTypeId ? " is-selected" : ""}`}
              key={type.id}
              onClick={() => {
                setLessonTypeId(type.id);
                setSelectedSlot("");
              }}
              role="radio"
              type="button"
            >
              <strong>{type.name}</strong>
              <span>
                {formatLessonDuration(type.duration_minutes)} · {formatMoneyCents(type.price_cents)}
              </span>
            </button>
          ))}
        </div>

        <div className="calendar-section-heading">
          <h2>Choose a day</h2>
          <p>Outlined dates have times free.</p>
        </div>

        <div className="calendar-month-nav">
          <button
            aria-label="Previous month"
            disabled={monthKey <= monthKeyOf(todayKey)}
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

        <div className="calendar-grid" aria-label="Dates with available lesson times">
          {calendarDays.map((cell) => {
            const slots = slotsByDate[cell.key] ?? [];
            const isSelected = selectedDate === cell.key;

            return (
              <button
                aria-label={`${formatLongDate(`${cell.key}T12:00:00Z`)}${
                  slots.length ? `, ${slots.length} times free` : ", no times free"
                }`}
                aria-pressed={isSelected}
                className={isSelected ? "is-selected" : slots.length ? "has-availability" : ""}
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

        <div className="calendar-note">
          <span aria-hidden="true" />
          <p>
            All times are Porto time{showBothZones ? `. Where your own time differs, it is shown too.` : "."}
          </p>
        </div>
      </div>

      <div className="booking-detail-column" ref={detailsRef}>
        <div className="time-panel">
          <div className="calendar-section-heading">
            <h2>Available times</h2>
            <p aria-live="polite">{selectedDate ? formatLongDate(`${selectedDate}T12:00:00Z`) : "Choose a day"}</p>
          </div>

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
          ) : loadingSlots ? (
            <p className="booking-state-note">Checking what&rsquo;s free…</p>
          ) : daySlots.length ? (
            <div className="slot-grid" aria-label="Available times">
              {daySlots.map((slot) => (
                <button
                  aria-pressed={selectedSlot === slot.startAt}
                  className={selectedSlot === slot.startAt ? "is-selected" : ""}
                  key={slot.startAt}
                  onClick={() => {
                    setSelectedSlot(slot.startAt);
                    setSubmitError("");
                  }}
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
        </div>

        <div className="booking-summary-grid">
          <div className="lesson-summary">
            <h3>{lessonType?.name ?? "Portuguese lesson"}</h3>
            <p>
              <Clock3 size={18} aria-hidden="true" />
              {lessonType ? formatLessonDuration(lessonType.duration_minutes) : "—"}
            </p>
            <p>
              <CalendarDays size={18} aria-hidden="true" />
              {chosen ? `${formatSlotTime(chosen.startAt)} on ${formatLongDate(chosen.startAt)}` : "Choose a time"}
            </p>
            {chosen && differingLocalTime(chosen.startAt, studentZone) ? (
              <p>
                <Globe2 size={18} aria-hidden="true" />
                {differingLocalTime(chosen.startAt, studentZone)} your time
              </p>
            ) : null}
            <p>
              <MapPin size={18} aria-hidden="true" />
              {form.location === "porto" ? "In person, in Porto" : "Online"}
            </p>
            {lessonType ? <strong>{formatMoneyCents(lessonType.price_cents)}</strong> : null}
          </div>

          <form className="student-details-form" onSubmit={submit}>
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
                Phone or WhatsApp <em>(optional)</em>
              </span>
              <input
                autoComplete="tel"
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                type="tel"
                value={form.phone}
              />
            </label>

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
              {submitting ? "Booking…" : chosen ? `Book ${formatSlotTime(chosen.startAt)} Porto time` : "Choose a time first"}
            </button>

            <p className="booking-form-note">
              You don&rsquo;t pay now. Inês will arrange payment with you directly.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
