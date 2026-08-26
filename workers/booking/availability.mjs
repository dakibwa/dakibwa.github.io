import {
  PORTO,
  addDaysToKey,
  dateKey,
  dayBounds,
  eachDateKey,
  parseDateKey,
  weekdayOf,
  zonedToUtc
} from "./time.mjs";

/**
 * Free slots = weekly teaching hours, plus one-off extra windows, minus blocked
 * windows, minus anything overlapping a confirmed booking, minus anything inside
 * the minimum-notice window.
 *
 * Every window is handled as minutes-from-midnight in Porto time and only
 * converted to a UTC instant at the last step, so a DST day yields the hours she
 * actually intends to teach rather than the hours arithmetic would give.
 */

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function mergeWindows(windows) {
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  const merged = [];

  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end);
    } else {
      merged.push({ ...window });
    }
  }

  return merged;
}

function subtractWindows(base, blocks) {
  let remaining = [...base];

  for (const block of blocks) {
    const next = [];
    for (const window of remaining) {
      if (!overlaps(window.start, window.end, block.start, block.end)) {
        next.push(window);
        continue;
      }
      if (block.start > window.start) next.push({ start: window.start, end: block.start });
      if (block.end < window.end) next.push({ start: block.end, end: window.end });
    }
    remaining = next;
  }

  return remaining.filter((window) => window.end > window.start);
}

export async function loadSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  const settings = Object.fromEntries((results ?? []).map((row) => [row.key, row.value]));

  return {
    minimumNoticeHours: Number(settings.minimum_notice_hours ?? 12),
    bookingHorizonDays: Number(settings.booking_horizon_days ?? 60),
    slotIntervalMinutes: Number(settings.slot_interval_minutes ?? 30),
    sameDayChangeFeeCents: Number(settings.same_day_change_fee_cents ?? 500),
    teacherName: settings.teacher_name || "Inês Dias Baía",
    teacherEmail: settings.teacher_email || "",
    replyToEmail: settings.reply_to_email || ""
  };
}

export async function loadLessonType(env, id) {
  return env.DB.prepare("SELECT * FROM lesson_types WHERE id = ? AND active = 1").bind(id).first();
}

export async function listLessonTypes(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, slug, name, description, duration_minutes, price_cents FROM lesson_types WHERE active = 1 ORDER BY sort_order"
  ).all();
  return results ?? [];
}

/**
 * @param ignoreBookingId lets a reschedule offer the slot the booking already
 *        occupies, instead of the student's own lesson blocking their move.
 */
export async function computeAvailability(env, { fromKey, toKey, lessonType, now, ignoreBookingId = null }) {
  const settings = await loadSettings(env);
  const duration = Number(lessonType.duration_minutes);
  const interval = settings.slotIntervalMinutes;

  const todayKey = dateKey(now, PORTO);
  const horizonKey = addDaysToKey(todayKey, settings.bookingHorizonDays);
  const start = fromKey < todayKey ? todayKey : fromKey;
  const end = toKey > horizonKey ? horizonKey : toKey;
  if (!parseDateKey(start) || !parseDateKey(end) || start > end) return { slots: [], settings };

  const earliest = new Date(now.getTime() + settings.minimumNoticeHours * 3600000);

  const windowStart = dayBounds(start).start.toISOString();
  const windowEnd = dayBounds(end).end.toISOString();

  const [rules, exceptions, booked] = await Promise.all([
    env.DB.prepare("SELECT weekday, start_minute, end_minute FROM availability_rules WHERE active = 1").all(),
    env.DB.prepare(
      "SELECT date, kind, start_minute, end_minute FROM availability_exceptions WHERE date BETWEEN ? AND ?"
    )
      .bind(start, end)
      .all(),
    env.DB.prepare(
      "SELECT id, starts_at, ends_at FROM bookings WHERE status = 'confirmed' AND ends_at > ? AND starts_at < ?"
    )
      .bind(windowStart, windowEnd)
      .all()
  ]);

  const rulesByWeekday = new Map();
  for (const rule of rules.results ?? []) {
    const list = rulesByWeekday.get(rule.weekday) ?? [];
    list.push({ start: rule.start_minute, end: rule.end_minute });
    rulesByWeekday.set(rule.weekday, list);
  }

  const exceptionsByDate = new Map();
  for (const exception of exceptions.results ?? []) {
    const list = exceptionsByDate.get(exception.date) ?? [];
    list.push(exception);
    exceptionsByDate.set(exception.date, list);
  }

  const busy = (booked.results ?? [])
    .filter((row) => row.id !== ignoreBookingId)
    .map((row) => ({ start: new Date(row.starts_at).getTime(), end: new Date(row.ends_at).getTime() }));

  const slotsByDate = {};

  for (const key of eachDateKey(start, end)) {
    const dayExceptions = exceptionsByDate.get(key) ?? [];
    const openWindows = mergeWindows([
      ...(rulesByWeekday.get(weekdayOf(key)) ?? []),
      ...dayExceptions
        .filter((exception) => exception.kind === "extra")
        .map((exception) => ({ start: exception.start_minute ?? 0, end: exception.end_minute ?? 1440 }))
    ]);

    const blockedWindows = dayExceptions
      .filter((exception) => exception.kind === "blocked")
      // A blocked row with no window means the whole day is off.
      .map((exception) => ({ start: exception.start_minute ?? 0, end: exception.end_minute ?? 1440 }));

    const bookable = subtractWindows(openWindows, blockedWindows);
    const { year, month, day } = parseDateKey(key);
    const daySlots = [];

    for (const window of bookable) {
      for (let minute = window.start; minute + duration <= window.end; minute += interval) {
        const slotStart = zonedToUtc(year, month, day, minute, PORTO);
        const slotEnd = new Date(slotStart.getTime() + duration * 60000);

        if (slotStart < earliest) continue;
        if (busy.some((entry) => overlaps(slotStart.getTime(), slotEnd.getTime(), entry.start, entry.end))) continue;

        daySlots.push({ startAt: slotStart.toISOString(), endAt: slotEnd.toISOString() });
      }
    }

    if (daySlots.length) slotsByDate[key] = daySlots;
  }

  return { slotsByDate, settings };
}

/**
 * Authoritative re-check at write time. Availability shown to a student is a
 * snapshot; this is what actually decides, and it closes the window where two
 * people pick the same slot seconds apart.
 */
export async function isSlotBookable(env, { startAt, lessonType, now, ignoreBookingId = null }) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return { ok: false, reason: "That time could not be understood." };

  const key = dateKey(start, PORTO);
  const { slotsByDate } = await computeAvailability(env, {
    fromKey: key,
    toKey: key,
    lessonType,
    now,
    ignoreBookingId
  });

  const match = (slotsByDate?.[key] ?? []).some((slot) => slot.startAt === start.toISOString());
  return match
    ? { ok: true, endAt: new Date(start.getTime() + lessonType.duration_minutes * 60000) }
    : { ok: false, reason: "That time has just been taken or is no longer available. Please choose another." };
}
