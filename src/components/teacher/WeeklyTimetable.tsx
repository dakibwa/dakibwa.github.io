"use client";

import {
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Plus, Trash2, Video, MapPin } from "lucide-react";
import type { AdminBooking } from "@/lib/admin-api";
import { formatSlotTime } from "@/lib/booking-api";
import {
  WEEKDAYS,
  bookingSegments,
  canPaintHours,
  dateKey,
  dateLabel,
  lessonStarts,
  minuteLabel,
  paintHours,
  parseMinute,
  shiftDate,
  type TeachingWindow,
  type WeekHours,
} from "@/lib/teacher-calendar";

type Props = {
  weekStart: string;
  hours: WeekHours;
  bookings: AdminBooking[];
  blockedDays: Set<string>;
  editing: boolean;
  interval: number;
  disabled: boolean;
  mobileDay: number;
  onSelectDay: (index: number) => void;
  onChange: (day: number, windows: TeachingWindow[]) => void;
  onSelectBooking: (booking: AdminBooking) => void;
};

type Drag = { day: number; from: number; to: number; available: boolean };

export function WeeklyTimetable({
  weekStart,
  hours,
  bookings,
  blockedDays,
  editing,
  interval,
  disabled,
  mobileDay,
  onSelectDay,
  onChange,
  onSelectBooking,
}: Props) {
  const today = dateKey(new Date());
  const [focus, setFocus] = useState({
    day: WEEKDAYS[mobileDay].value,
    minute: 600,
  });
  const [exactDay, setExactDay] = useState(1);
  const [fullDay, setFullDay] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const exactRef = useRef<HTMLDetailsElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  const pointerType = useRef("");
  const segments = useMemo(
    () => bookingSegments(bookings, weekStart),
    [bookings, weekStart],
  );
  const step = [15, 30, 60].includes(interval) ? interval : 30;
  const allWindows = Object.values(hours)
    .flat()
    .filter(
      (window) =>
        Number.isFinite(window.start) && Number.isFinite(window.lastStart),
    );
  const start = fullDay
    ? 0
    : Math.max(
        0,
        Math.floor(
          Math.min(
            480,
            ...allWindows.map((w) => w.start),
            ...segments.map((b) => b.start),
          ) / 60,
        ) * 60,
      );
  const end = fullDay
    ? 1440
    : Math.min(
        1440,
        Math.ceil(
          Math.max(
            1200,
            ...allWindows.map((w) => w.lastStart + step),
            ...segments.map((b) => b.end),
          ) / 60,
        ) * 60,
      );
  const minutes = Array.from(
    { length: Math.ceil((end - start) / step) },
    (_, index) => start + index * step,
  );
  const focusMinute = Math.max(start, Math.min(end - step, focus.minute));

  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(
        `[data-slot-day="${focus.day}"][data-slot-minute="${focus.minute}"]`,
      )
      ?.focus();
  }, [focus, mobileDay]);

  function openExact(day: number) {
    setExactDay(day);
    if (exactRef.current) {
      exactRef.current.open = true;
      exactRef.current.scrollIntoView({ block: "nearest" });
    }
  }

  function toggle(day: number, minute: number) {
    if (disabled) return;
    if (!canPaintHours(hours[day] ?? [], interval)) return openExact(day);
    setFocus({ day, minute });
    onChange(
      day,
      paintHours(
        hours[day] ?? [],
        minute,
        minute,
        !lessonStarts(hours[day] ?? [], interval).includes(minute),
        interval,
      ),
    );
  }

  function beginDrag(
    event: PointerEvent<HTMLButtonElement>,
    day: number,
    minute: number,
  ) {
    pointerType.current = event.pointerType;
    if (event.pointerType !== "mouse" || event.button !== 0 || disabled) return;
    if (!canPaintHours(hours[day] ?? [], interval)) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    setFocus({ day, minute });
    setDrag({
      day,
      from: minute,
      to: minute,
      available: !lessonStarts(hours[day] ?? [], interval).includes(minute),
    });
  }

  function continueDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const cell = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-slot-minute]");
    if (cell && Number(cell.dataset.slotDay) === drag.day)
      setDrag({ ...drag, to: Number(cell.dataset.slotMinute) });
  }

  function finishDrag() {
    if (!drag) return;
    onChange(
      drag.day,
      paintHours(
        hours[drag.day] ?? [],
        drag.from,
        drag.to,
        drag.available,
        interval,
      ),
    );
    setDrag(null);
  }

  function moveFocus(
    event: KeyboardEvent<HTMLButtonElement>,
    day: number,
    minute: number,
  ) {
    const dayIndex = WEEKDAYS.findIndex((entry) => entry.value === day);
    let nextDay = dayIndex;
    let nextMinute = minute;
    if (event.key === "ArrowLeft") nextDay = Math.max(0, dayIndex - 1);
    else if (event.key === "ArrowRight") nextDay = Math.min(6, dayIndex + 1);
    else if (event.key === "ArrowUp") nextMinute -= step;
    else if (event.key === "ArrowDown") nextMinute += step;
    else if (event.key === "Home") nextMinute = start;
    else if (event.key === "End") nextMinute = end - step;
    else return;
    event.preventDefault();
    nextMinute = Math.max(start, Math.min(end - step, nextMinute));
    const weekday = WEEKDAYS[nextDay].value;
    pendingFocus.current = true;
    onSelectDay(nextDay);
    setFocus({ day: weekday, minute: nextMinute });
  }

  function updateExact(index: number, patch: Partial<TeachingWindow>) {
    onChange(
      exactDay,
      (hours[exactDay] ?? []).map((window, position) =>
        position === index ? { ...window, ...patch } : window,
      ),
    );
  }

  return (
    <>
      <div
        className={`teacher-timetable ${editing ? "teacher-timetable--editing" : ""}`}
        ref={gridRef}
      >
        <div className="teacher-week-days">
          <span className="teacher-axis-heading">Porto</span>
          {WEEKDAYS.map((day, index) => {
            const date = shiftDate(weekStart, index);
            return (
              <button
                className={`teacher-day-heading ${mobileDay === index ? "is-selected" : ""} ${!editing && date === today ? "is-today" : ""}`}
                key={day.value}
                type="button"
                aria-label={
                  editing
                    ? `${day.name}, show teaching hours`
                    : `${dateLabel(date)}, show lessons`
                }
                aria-pressed={mobileDay === index}
                onClick={() => {
                  onSelectDay(index);
                  setFocus((current) => ({ ...current, day: day.value }));
                }}
              >
                <span>{day.short}</span>
                {!editing ? (
                  <strong>{Number(date.slice(-2))}</strong>
                ) : (
                  <span className="teacher-day-full-name">
                    {day.name.slice(3)}
                  </span>
                )}
                {!editing &&
                segments.some((segment) => segment.date === date) ? (
                  <i
                    className="teacher-heading-booked-dot"
                    aria-label="Lessons booked"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <div
          className="teacher-timetable-scroll"
          aria-label={
            editing ? "Weekly teaching hours" : "Booked lessons this week"
          }
        >
          <div
            className="teacher-time-grid"
            style={{ "--slot-count": minutes.length } as CSSProperties}
          >
            <div className="teacher-time-axis" aria-hidden="true">
              {minutes.map((minute, index) =>
                minute % 60 === 0 ? (
                  <span
                    key={minute}
                    style={{
                      top: `calc(${index} * var(--teacher-slot-height))`,
                    }}
                  >
                    {minuteLabel(minute)}
                  </span>
                ) : null,
              )}
            </div>
            {WEEKDAYS.map((day, index) => {
              const date = shiftDate(weekStart, index);
              const off = !editing && blockedDays.has(date);
              const windows = hours[day.value] ?? [];
              const starts = lessonStarts(windows, interval);
              const daySegments = segments.filter(
                (segment) => segment.date === date,
              );
              return (
                <div
                  key={day.value}
                  data-mobile-active={mobileDay === index}
                  className={`teacher-time-day ${off ? "teacher-time-day--off" : ""}`}
                >
                  {off ? (
                    <span className="teacher-off-label">Day off</span>
                  ) : null}
                  {minutes.map((minute) => {
                    const selected =
                      drag?.day === day.value &&
                      minute >= Math.min(drag.from, drag.to) &&
                      minute <= Math.max(drag.from, drag.to)
                        ? drag.available
                        : starts.some(
                            (value) => value >= minute && value < minute + step,
                          );
                    const className = `teacher-time-slot ${selected && !off ? "is-available" : ""} ${minute % 60 === 0 ? "is-hour" : ""}`;
                    return editing ? (
                      <button
                        key={minute}
                        type="button"
                        className={className}
                        aria-pressed={selected}
                        disabled={disabled}
                        aria-label={`${day.name} ${minuteLabel(minute)}, ${selected ? "lesson start available" : "unavailable"}`}
                        tabIndex={
                          WEEKDAYS[mobileDay].value === day.value &&
                          focusMinute === minute
                            ? 0
                            : -1
                        }
                        data-slot-day={day.value}
                        data-slot-minute={minute}
                        onPointerDown={(event) =>
                          beginDrag(event, day.value, minute)
                        }
                        onPointerMove={continueDrag}
                        onPointerUp={finishDrag}
                        onPointerCancel={() => setDrag(null)}
                        onClick={(event) => {
                          if (
                            event.detail === 0 ||
                            pointerType.current !== "mouse" ||
                            !canPaintHours(windows, interval)
                          )
                            toggle(day.value, minute);
                        }}
                        onKeyDown={(event) =>
                          moveFocus(event, day.value, minute)
                        }
                      >
                        <span>{minuteLabel(minute)}</span>
                      </button>
                    ) : (
                      <span
                        className={className}
                        key={minute}
                        aria-hidden="true"
                      />
                    );
                  })}
                  {!editing
                    ? daySegments.map(
                        (
                          { booking, start: bookingStart, end: bookingEnd },
                          position,
                        ) => (
                          <button
                            key={`${booking.id}-${position}`}
                            type="button"
                            className={`teacher-calendar-lesson ${booking.location === "porto" ? "teacher-calendar-lesson--porto" : ""}`}
                            style={{
                              top: `calc(${(bookingStart - start) / step} * var(--teacher-slot-height) + 2px)`,
                              height: `max(38px, calc(${(bookingEnd - bookingStart) / step} * var(--teacher-slot-height) - 4px))`,
                            }}
                            aria-label={`${booking.student_name}, ${dateLabel(date)}, ${formatSlotTime(booking.starts_at)} to ${formatSlotTime(booking.ends_at)}, ${booking.location === "porto" ? "in Porto" : "online"}. View lesson`}
                            onClick={() => onSelectBooking(booking)}
                          >
                            <span className="teacher-lesson-time">
                              {formatSlotTime(booking.starts_at)}–
                              {formatSlotTime(booking.ends_at)}
                            </span>
                            <strong>{booking.student_name}</strong>
                            <span className="teacher-lesson-location">
                              {booking.location === "porto" ? (
                                <MapPin size={12} aria-hidden="true" />
                              ) : (
                                <Video size={12} aria-hidden="true" />
                              )}
                              {booking.location === "porto"
                                ? "In Porto"
                                : "Online"}
                            </span>
                          </button>
                        ),
                      )
                    : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="teacher-grid-footnote">
        <div className="teacher-calendar-key" aria-label="Timetable key">
          <span>
            <i className="teacher-key-starts" />
            {editing ? "Lesson starts" : "Usual hours"}
          </span>
          {!editing ? (
            <>
              <span>
                <i className="teacher-key-booked" />
                Booked
              </span>
              <span>
                <i className="teacher-key-off" />
                Day off
              </span>
            </>
          ) : null}
        </div>
        <button
          className="teacher-text-button"
          type="button"
          aria-pressed={fullDay}
          onClick={() => setFullDay(!fullDay)}
        >
          {fullDay ? "Usual daytime view" : "Show all 24 hours"}
        </button>
      </div>

      {editing ? (
        <details className="teacher-exact-hours" ref={exactRef}>
          <summary>Set exact hours</summary>
          <div className="teacher-form teacher-exact-hours__body">
            <label>
              <span>Day</span>
              <select
                value={exactDay}
                onChange={(event) => setExactDay(Number(event.target.value))}
              >
                {WEEKDAYS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="teacher-exact-windows">
              {(hours[exactDay] ?? []).map((window, index) => (
                <div className="teacher-exact-window" key={index}>
                  <label>
                    <span>First start</span>
                    <input
                      aria-label={`${WEEKDAYS.find((d) => d.value === exactDay)!.name} window ${index + 1}, first start`}
                      type="time"
                      disabled={disabled}
                      value={
                        Number.isFinite(window.start)
                          ? minuteLabel(window.start)
                          : ""
                      }
                      onChange={(event) =>
                        updateExact(index, {
                          start: parseMinute(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Last start</span>
                    <input
                      aria-label={`${WEEKDAYS.find((d) => d.value === exactDay)!.name} window ${index + 1}, last start`}
                      type={window.lastStart === 1440 ? "text" : "time"}
                      disabled={disabled}
                      value={
                        Number.isFinite(window.lastStart)
                          ? minuteLabel(window.lastStart)
                          : ""
                      }
                      onChange={(event) =>
                        updateExact(index, {
                          lastStart: parseMinute(event.target.value),
                        })
                      }
                    />
                  </label>
                  <button
                    className="teacher-icon-button"
                    aria-label={`Remove teaching window ${index + 1}`}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange(
                        exactDay,
                        (hours[exactDay] ?? []).filter(
                          (_, position) => position !== index,
                        ),
                      )
                    }
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button
                className="teacher-text-button"
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange(exactDay, [
                    ...(hours[exactDay] ?? []),
                    { start: 600, lastStart: 690 },
                  ])
                }
              >
                <Plus size={15} aria-hidden="true" />
                Add a time window
              </button>
            </div>
          </div>
        </details>
      ) : null}
    </>
  );
}
