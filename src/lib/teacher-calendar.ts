import type {
  AdminBooking,
  AvailabilityException,
  AvailabilityRule,
} from "./admin-api";

export const WEEKDAYS = [
  { value: 1, name: "Monday", short: "Mon" },
  { value: 2, name: "Tuesday", short: "Tue" },
  { value: 3, name: "Wednesday", short: "Wed" },
  { value: 4, name: "Thursday", short: "Thu" },
  { value: 5, name: "Friday", short: "Fri" },
  { value: 6, name: "Saturday", short: "Sat" },
  { value: 0, name: "Sunday", short: "Sun" },
];

export type TeachingWindow = { start: number; lastStart: number };
export type WeekHours = Record<number, TeachingWindow[]>;

export function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftDate(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function mondayOf(key: string) {
  const day = new Date(`${key}T12:00:00Z`).getUTCDay();
  return shiftDate(key, -((day + 6) % 7));
}

export function shiftMonth(key: string, amount: number) {
  const date = new Date(`${key.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

export function monthDates(month: string) {
  const first = `${month.slice(0, 7)}-01`;
  const start = mondayOf(first);
  const last = shiftDate(shiftMonth(first, 1), -1);
  const count =
    Math.ceil(
      (new Date(`${last}T12:00:00Z`).getTime() -
        new Date(`${start}T12:00:00Z`).getTime() +
        86400000) /
        (7 * 86400000),
    ) * 7;
  return Array.from({ length: count }, (_, index) => shiftDate(start, index));
}

export function dateLabel(
  key: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
  },
) {
  return new Intl.DateTimeFormat("en-GB", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${key}T12:00:00Z`));
}

export function minuteLabel(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function parseMinute(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) return Number.NaN;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function hoursFromRules(rules: AvailabilityRule[]): WeekHours {
  const week = Object.fromEntries(
    WEEKDAYS.map((day) => [day.value, []]),
  ) as WeekHours;
  for (const rule of rules) {
    if (rule.active === 0) continue;
    week[rule.weekday].push({
      start: rule.start_minute,
      lastStart: rule.last_start_minute,
    });
  }
  for (const windows of Object.values(week))
    windows.sort((a, b) => a.start - b.start);
  return week;
}

export function serialiseHours(week: WeekHours) {
  return JSON.stringify(
    WEEKDAYS.map((day) =>
      [...(week[day.value] ?? [])].sort((a, b) => a.start - b.start),
    ),
  );
}

export function hoursProblem(week: WeekHours) {
  if (Object.values(week).flat().length > 100)
    return "Please use no more than 100 teaching windows in a week.";
  for (const day of WEEKDAYS) {
    for (const window of week[day.value] ?? []) {
      if (
        !Number.isInteger(window.start) ||
        !Number.isInteger(window.lastStart) ||
        window.start < 0 ||
        window.start > 1439 ||
        window.lastStart > 1440 ||
        window.lastStart < window.start
      ) {
        return `Check ${day.name}'s hours: the last start must be at or after the first.`;
      }
    }
  }
  return null;
}

/** Match the Worker's range merging before stepping, including precise times. */
export function lessonStarts(windows: TeachingWindow[], interval = 30) {
  const ranges: TeachingWindow[] = [];
  for (const window of [...windows].sort((a, b) => a.start - b.start)) {
    const last = ranges.at(-1);
    if (last && window.start <= last.lastStart)
      last.lastStart = Math.max(last.lastStart, window.lastStart);
    else ranges.push({ ...window });
  }
  return ranges.flatMap((range) => {
    if (
      !Number.isFinite(range.start) ||
      !Number.isFinite(range.lastStart) ||
      interval < 1
    )
      return [];
    return Array.from(
      {
        length: Math.max(
          0,
          Math.floor((range.lastStart - range.start) / interval) + 1,
        ),
      },
      (_, index) => range.start + index * interval,
    );
  });
}

export function canPaintHours(windows: TeachingWindow[], interval: number) {
  return (
    [15, 30, 60].includes(interval) &&
    windows.every(
      (window) =>
        window.start % interval === 0 &&
        window.lastStart % interval === 0 &&
        window.lastStart < 1440,
    )
  );
}

/** Editing one day never rounds or rewrites another day's existing windows. */
export function paintHours(
  windows: TeachingWindow[],
  from: number,
  to: number,
  available: boolean,
  interval = 30,
): TeachingWindow[] {
  if (!canPaintHours(windows, interval)) return windows;
  const starts = new Set(lessonStarts(windows, interval));
  for (
    let minute = Math.max(0, Math.min(from, to));
    minute <= Math.min(1440 - interval, Math.max(from, to));
    minute += interval
  ) {
    if (available) starts.add(minute);
    else starts.delete(minute);
  }
  const result: TeachingWindow[] = [];
  for (const minute of [...starts].sort((a, b) => a - b)) {
    const last = result.at(-1);
    if (last && last.lastStart + interval === minute) last.lastStart = minute;
    else result.push({ start: minute, lastStart: minute });
  }
  return result;
}

export function isWholeDayOff(exception: AvailabilityException) {
  return (
    exception.kind === "blocked" &&
    exception.weekday == null &&
    (exception.start_minute == null || exception.start_minute === 0) &&
    (exception.end_minute == null || exception.end_minute === 1440)
  );
}

export function daysOff(exceptions: AvailabilityException[]) {
  return new Set(
    exceptions.filter(isWholeDayOff).map((exception) => exception.date),
  );
}

function localMinute(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return (
    Number(parts.find((p) => p.type === "hour")!.value) * 60 +
    Number(parts.find((p) => p.type === "minute")!.value)
  );
}

export type BookingSegment = {
  booking: AdminBooking;
  date: string;
  start: number;
  end: number;
};

export function bookingSegments(
  bookings: AdminBooking[],
  weekStart: string,
): BookingSegment[] {
  const endOfWeek = shiftDate(weekStart, 6);
  return bookings.flatMap((booking) => {
    const startDay = dateKey(new Date(booking.starts_at));
    const endDay = dateKey(new Date(booking.ends_at));
    const result: BookingSegment[] = [];
    for (
      let day = startDay < weekStart ? weekStart : startDay;
      day <= endDay && day <= endOfWeek;
      day = shiftDate(day, 1)
    ) {
      const start = day === startDay ? localMinute(booking.starts_at) : 0;
      const end = day === endDay ? localMinute(booking.ends_at) : 1440;
      // A lesson crossing the repeated autumn hour must remain visible.
      if (end > start || day === startDay)
        result.push({
          booking,
          date: day,
          start,
          end:
            end > start
              ? end
              : Math.min(
                  1440,
                  start +
                    (Date.parse(booking.ends_at) -
                      Date.parse(booking.starts_at)) /
                      60000,
                ),
        });
    }
    return result;
  });
}
