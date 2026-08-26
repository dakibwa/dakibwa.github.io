import { computeAvailability, isSlotBookable, listLessonTypes, loadLessonType, loadSettings } from "./availability.mjs";
import { buildCalendarInvite, calendarUid } from "./ics.mjs";
import { deliver } from "./email.mjs";
import { PORTO, addDaysToKey, dateKey, formatInZone, isValidTimeZone, parseDateKey, timeZoneAbbreviation } from "./time.mjs";
import { bookingReference, createManageToken, readManageToken, safeEqual } from "./tokens.mjs";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = String(env.ALLOWED_ORIGIN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const base = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };

  // Echo the origin only when it is genuinely allowed. Falling back to the
  // first configured origin sends a header that can never match the caller,
  // which the browser reports as a mismatch rather than as "not allowed" —
  // the same confusing error either way, but only one of them is honest.
  return allowed.includes(origin) ? { ...base, "Access-Control-Allow-Origin": origin } : base;
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env) }
  });
}

function fail(message, status, request, env) {
  return json({ error: message }, status, request, env);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function siteUrl(env, path = "") {
  return `${String(env.SITE_URL ?? "https://portuguesewithines.com").replace(/\/+$/, "")}${path}`;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? "").trim());
}

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** Public shape of a booking. Never leaks another student's details. */
function publicBooking(row, lessonType, settings) {
  return {
    reference: row.reference,
    status: row.status,
    lessonType: { id: lessonType.id, name: lessonType.name, durationMinutes: lessonType.duration_minutes, priceCents: lessonType.price_cents },
    startAt: row.starts_at,
    endAt: row.ends_at,
    location: row.location,
    studentName: row.student_name,
    studentEmail: row.student_email,
    studentTimezone: row.student_timezone,
    notes: row.notes,
    rescheduleCount: row.reschedule_count,
    sameDayFeeCents: settings.sameDayChangeFeeCents
  };
}

/** Description lines shared by her calendar entry and the emails. */
function lessonSummary(row, lessonType) {
  return `${lessonType.name} — ${row.student_name}`;
}

function lessonDescription(row, lessonType, manageUrl) {
  const lines = [
    `${lessonType.name} (${lessonType.duration_minutes} minutes)`,
    `Student: ${row.student_name}`,
    `Email: ${row.student_email}`
  ];
  if (row.student_phone) lines.push(`Phone: ${row.student_phone}`);
  if (row.student_timezone && row.student_timezone !== PORTO) lines.push(`Their timezone: ${row.student_timezone}`);
  if (row.notes) lines.push(`Notes: ${row.notes}`);
  lines.push(`Reference: ${row.reference}`);
  if (manageUrl) lines.push(`Manage: ${manageUrl}`);
  return lines.join("\n");
}

function locationLabel(row) {
  return row.location === "porto" ? "In person, Porto" : "Online";
}

/**
 * Every student-facing and teacher-facing message for one lifecycle event.
 * Kept in one place so a change to wording cannot drift between the two sides.
 */
async function notify(env, { event, row, lessonType, settings, manageUrl, previousStartsAt }) {
  const teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  const replyTo = settings.replyToEmail || teacherEmail || undefined;
  const start = new Date(row.starts_at);

  const portoTime = `${formatInZone(start, PORTO)} (${timeZoneAbbreviation(start, PORTO)})`;
  const studentZone = isValidTimeZone(row.student_timezone) ? row.student_timezone : PORTO;
  const studentTime = `${formatInZone(start, studentZone)} (${timeZoneAbbreviation(start, studentZone)})`;
  const showBothZones = studentZone !== PORTO;

  const baseRows = [
    { label: "Lesson", value: `${lessonType.name} · ${lessonType.duration_minutes} minutes` },
    { label: "Porto time", value: portoTime },
    ...(showBothZones ? [{ label: "Your time", value: studentTime }] : []),
    { label: "Where", value: locationLabel(row) },
    { label: "Reference", value: row.reference }
  ];

  const uid = calendarUid(row.id);
  const method = event === "cancelled" ? "CANCEL" : "REQUEST";
  const invite = (attendees) =>
    buildCalendarInvite({
      method,
      uid,
      sequence: row.sequence,
      summary: lessonSummary(row, lessonType),
      description: lessonDescription(row, lessonType, manageUrl),
      location: locationLabel(row),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      organiserName: settings.teacherName,
      organiserEmail: env.MAIL_SENDER_ADDRESS || "bookings@portuguesewithines.com",
      attendees,
      url: manageUrl
    });

  const sameDayNotice = row.same_day_change
    ? `This change was made on the day of the lesson, so the €${(settings.sameDayChangeFeeCents / 100).toFixed(
        0
      )} same-day change fee applies.`
    : "";

  const student = {
    booked: {
      subject: `Your Portuguese lesson is booked — ${row.reference}`,
      heading: "You're booked",
      intro: `Olá ${row.student_name.split(" ")[0]}, your lesson with Inês is confirmed. It's in your calendar attachment, and you can move or cancel it any time using the button below.`,
      callout: "",
      footer: `Need to change it? Use the link above. Changing on the day of the lesson costs €${(
        settings.sameDayChangeFeeCents / 100
      ).toFixed(0)}; any earlier is free.`
    },
    rescheduled: {
      subject: `Your lesson has moved — ${row.reference}`,
      heading: "Your lesson has moved",
      intro: `Olá ${row.student_name.split(" ")[0]}, that's done — your lesson is now at the time below and your calendar has been updated.`,
      callout: sameDayNotice,
      footer: "You can move or cancel it again from the same link."
    },
    cancelled: {
      subject: `Your lesson is cancelled — ${row.reference}`,
      heading: "Your lesson is cancelled",
      intro: `Olá ${row.student_name.split(" ")[0]}, your lesson has been cancelled and removed from your calendar.`,
      callout: sameDayNotice,
      footer: "You're welcome back any time — booking is always open on the website."
    }
  }[event];

  const teacher = {
    booked: {
      subject: `New booking — ${row.student_name}, ${formatInZone(start, PORTO)}`,
      heading: "New booking",
      intro: `${row.student_name} has booked a lesson. Accepting the attached invitation adds it to your calendar.`,
      callout: ""
    },
    rescheduled: {
      subject: `${row.same_day_change ? "Same-day change" : "Lesson moved"} — ${row.student_name}`,
      heading: row.same_day_change ? "Changed on the lesson day" : "Lesson moved",
      intro: `${row.student_name} moved their lesson${
        previousStartsAt ? ` from ${formatInZone(new Date(previousStartsAt), PORTO)}` : ""
      }. Your calendar has been updated.`,
      callout: row.same_day_change
        ? `This was changed on the day of the lesson, so the €${(settings.sameDayChangeFeeCents / 100).toFixed(
            0
          )} fee applies. Collect it at the lesson.`
        : ""
    },
    cancelled: {
      subject: `${row.same_day_change ? "Same-day cancellation" : "Cancellation"} — ${row.student_name}`,
      heading: row.same_day_change ? "Cancelled on the lesson day" : "Lesson cancelled",
      intro: `${row.student_name} cancelled their lesson on ${formatInZone(start, PORTO)}. It has been removed from your calendar.`,
      callout: row.same_day_change
        ? `This was cancelled on the day of the lesson, so the €${(settings.sameDayChangeFeeCents / 100).toFixed(
            0
          )} fee applies.`
        : ""
    }
  }[event];

  const sends = [
    deliver(env, {
      to: row.student_email,
      subject: student.subject,
      kind: `student_${event}`,
      bookingId: row.id,
      dedupeKey: `student:${event}:${row.id}:${row.sequence}`,
      replyTo,
      calendar: { body: invite([{ name: row.student_name, email: row.student_email }]), method },
      content: {
        heading: student.heading,
        intro: student.intro,
        callout: student.callout,
        rows: baseRows,
        action: manageUrl && event !== "cancelled" ? { label: "Change or cancel this lesson", url: manageUrl } : null,
        footer: student.footer
      }
    })
  ];

  if (teacherEmail) {
    sends.push(
      deliver(env, {
        to: teacherEmail,
        subject: teacher.subject,
        kind: `teacher_${event}`,
        bookingId: row.id,
        dedupeKey: `teacher:${event}:${row.id}:${row.sequence}`,
        replyTo: row.student_email,
        calendar: { body: invite([{ name: settings.teacherName, email: teacherEmail }]), method },
        content: {
          heading: teacher.heading,
          intro: teacher.intro,
          callout: teacher.callout,
          rows: [
            ...baseRows,
            { label: "Student", value: `${row.student_name}<br>${row.student_email}${row.student_phone ? `<br>${row.student_phone}` : ""}` },
            ...(row.notes ? [{ label: "Notes", value: row.notes }] : [])
          ],
          action: null,
          footer: "Sent automatically by the booking system on portuguesewithines.com."
        }
      })
    );
  }

  return Promise.allSettled(sends);
}

async function getBookingByToken(env, token) {
  const bookingId = await readManageToken(token, env.BOOKING_TOKEN_SECRET);
  if (!bookingId) return null;
  return env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(bookingId).first();
}

const worker = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (!env.DB) return fail("The booking database is not bound to this Worker.", 500, request, env);
      if (!env.BOOKING_TOKEN_SECRET) return fail("The booking service is not fully configured.", 500, request, env);

      if (request.method === "GET" && path === "/health") return handleHealth(request, env);
      if (request.method === "GET" && path === "/lesson-types") {
        return json({ lessonTypes: await listLessonTypes(env) }, 200, request, env);
      }
      if (request.method === "GET" && path === "/availability") return handleAvailability(request, env, url);
      if (request.method === "POST" && path === "/bookings") return handleCreate(request, env, ctx);

      const manage = path.match(/^\/bookings\/([^/]+)$/);
      if (manage && request.method === "GET") return handleGetBooking(request, env, manage[1]);

      const reschedule = path.match(/^\/bookings\/([^/]+)\/reschedule$/);
      if (reschedule && request.method === "POST") return handleReschedule(request, env, ctx, reschedule[1]);

      const cancel = path.match(/^\/bookings\/([^/]+)\/cancel$/);
      if (cancel && request.method === "POST") return handleCancel(request, env, ctx, cancel[1]);

      if (path.startsWith("/admin/")) return handleAdmin(request, env, url, path);

      return fail("Not found.", 404, request, env);
    } catch (error) {
      console.error("booking-worker", error?.stack ?? String(error));
      return fail("Something went wrong handling that request.", 500, request, env);
    }
  }
};

async function handleHealth(request, env) {
  const missing = [];
  if (!env.DB) missing.push("DB");
  if (!env.BOOKING_TOKEN_SECRET) missing.push("BOOKING_TOKEN_SECRET");
  if (!env.RESEND_API_KEY && env.EMAIL_DRY_RUN !== "1") missing.push("RESEND_API_KEY");

  let lessonTypes = 0;
  let teacherEmail = "";
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM lesson_types WHERE active = 1").first();
    lessonTypes = row?.count ?? 0;
    const settings = await loadSettings(env);
    teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  } catch {
    missing.push("schema");
  }

  if (!teacherEmail) missing.push("TEACHER_EMAIL");

  return json(
    { ok: missing.length === 0, missing, lessonTypes, emailMode: env.RESEND_API_KEY && env.EMAIL_DRY_RUN !== "1" ? "live" : "dry-run" },
    200,
    request,
    env
  );
}

async function handleAvailability(request, env, url) {
  const lessonTypeId = url.searchParams.get("lessonType") ?? "single";
  const lessonType = await loadLessonType(env, lessonTypeId);
  if (!lessonType) return fail("That lesson type is not available.", 400, request, env);

  const now = new Date();
  const fromKey = url.searchParams.get("from") || dateKey(now, PORTO);
  const toKey = url.searchParams.get("to") || addDaysToKey(fromKey, 34);
  if (!parseDateKey(fromKey) || !parseDateKey(toKey)) return fail("Invalid date range.", 400, request, env);

  const { slotsByDate, settings } = await computeAvailability(env, { fromKey, toKey, lessonType, now });

  return json(
    {
      slotsByDate: slotsByDate ?? {},
      timeZone: PORTO,
      minimumNoticeHours: settings.minimumNoticeHours,
      horizonDays: settings.bookingHorizonDays,
      lessonType: {
        id: lessonType.id,
        name: lessonType.name,
        durationMinutes: lessonType.duration_minutes,
        priceCents: lessonType.price_cents
      }
    },
    200,
    request,
    env
  );
}

async function handleCreate(request, env, ctx) {
  const body = await readJson(request);
  const now = new Date();

  const name = cleanText(body.name, 120);
  const email = cleanText(body.email, 200).toLowerCase();
  const phone = cleanText(body.phone, 40);
  const notes = cleanText(body.notes, 1000);
  const location = body.location === "porto" ? "porto" : "online";
  const timezone = isValidTimeZone(body.timezone) ? body.timezone : PORTO;

  if (name.length < 2) return fail("Please give your name.", 400, request, env);
  if (!isEmail(email)) return fail("Please give a valid email address.", 400, request, env);

  const lessonType = await loadLessonType(env, cleanText(body.lessonType, 40) || "single");
  if (!lessonType) return fail("That lesson type is not available.", 400, request, env);

  // Cheap abuse guard: a real student does not book six lessons in a minute,
  // and without this one script can fill her whole calendar.
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM bookings WHERE student_email = ? AND created_at > ?"
  )
    .bind(email, new Date(now.getTime() - 3600000).toISOString())
    .first();
  if ((recent?.count ?? 0) >= 5) {
    return fail("That's several bookings in a short time. Please email Inês directly instead.", 429, request, env);
  }

  const check = await isSlotBookable(env, { startAt: body.startAt, lessonType, now });
  if (!check.ok) return fail(check.reason, 409, request, env);

  const id = crypto.randomUUID();
  const reference = bookingReference();
  const startsAt = new Date(body.startAt).toISOString();
  const endsAt = check.endAt.toISOString();
  const timestamp = now.toISOString();

  await env.DB.prepare(
    `INSERT INTO bookings (id, reference, lesson_type_id, student_name, student_email, student_phone,
       student_timezone, location, notes, starts_at, ends_at, status, sequence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 0, ?, ?)`
  )
    .bind(id, reference, lessonType.id, name, email, phone, timezone, location, notes, startsAt, endsAt, timestamp, timestamp)
    .run();

  const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
  const settings = await loadSettings(env);
  const token = await createManageToken(id, env.BOOKING_TOKEN_SECRET);
  const manageUrl = siteUrl(env, `/booking/?token=${encodeURIComponent(token)}`);

  ctx.waitUntil(notify(env, { event: "booked", row, lessonType, settings, manageUrl }));

  return json(
    { booking: publicBooking(row, lessonType, settings), manageUrl, manageToken: token },
    201,
    request,
    env
  );
}

async function handleGetBooking(request, env, token) {
  const row = await getBookingByToken(env, token);
  if (!row) return fail("That booking link is not valid.", 404, request, env);

  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();
  const settings = await loadSettings(env);

  return json(
    {
      booking: publicBooking(row, lessonType, settings),
      isPast: new Date(row.starts_at) <= new Date(),
      sameDayFeeApplies: dateKey(new Date(), PORTO) === dateKey(new Date(row.starts_at), PORTO)
    },
    200,
    request,
    env
  );
}

async function handleReschedule(request, env, ctx, token) {
  const row = await getBookingByToken(env, token);
  if (!row) return fail("That booking link is not valid.", 404, request, env);
  if (row.status === "cancelled") return fail("That lesson has already been cancelled.", 409, request, env);

  const now = new Date();
  if (new Date(row.starts_at) <= now) return fail("That lesson has already started. Please email Inês.", 409, request, env);

  const body = await readJson(request);
  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();

  const check = await isSlotBookable(env, { startAt: body.startAt, lessonType, now, ignoreBookingId: row.id });
  if (!check.ok) return fail(check.reason, 409, request, env);

  // The fee is for changing on the lesson's own Porto date, judged against the
  // lesson they are moving away from.
  const sameDay = dateKey(now, PORTO) === dateKey(new Date(row.starts_at), PORTO) ? 1 : 0;
  const startsAt = new Date(body.startAt).toISOString();

  await env.DB.prepare(
    `UPDATE bookings SET starts_at = ?, ends_at = ?, previous_starts_at = ?, sequence = sequence + 1,
       reschedule_count = reschedule_count + 1, same_day_change = ?, updated_at = ? WHERE id = ?`
  )
    .bind(startsAt, check.endAt.toISOString(), row.starts_at, sameDay, now.toISOString(), row.id)
    .run();

  const updated = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
  const settings = await loadSettings(env);
  const manageUrl = siteUrl(env, `/booking/?token=${encodeURIComponent(token)}`);

  ctx.waitUntil(
    notify(env, { event: "rescheduled", row: updated, lessonType, settings, manageUrl, previousStartsAt: row.starts_at })
  );

  return json(
    { booking: publicBooking(updated, lessonType, settings), sameDayFeeApplied: Boolean(sameDay) },
    200,
    request,
    env
  );
}

async function handleCancel(request, env, ctx, token) {
  const row = await getBookingByToken(env, token);
  if (!row) return fail("That booking link is not valid.", 404, request, env);
  if (row.status === "cancelled") return fail("That lesson is already cancelled.", 409, request, env);

  const now = new Date();
  const sameDay = dateKey(now, PORTO) === dateKey(new Date(row.starts_at), PORTO) ? 1 : 0;

  await env.DB.prepare(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancelled_by = 'student',
       sequence = sequence + 1, same_day_change = ?, updated_at = ? WHERE id = ?`
  )
    .bind(now.toISOString(), sameDay, now.toISOString(), row.id)
    .run();

  const updated = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();
  const settings = await loadSettings(env);

  ctx.waitUntil(notify(env, { event: "cancelled", row: updated, lessonType, settings, manageUrl: "" }));

  return json({ booking: publicBooking(updated, lessonType, settings), sameDayFeeApplied: Boolean(sameDay) }, 200, request, env);
}

async function handleAdmin(request, env, url, path) {
  const provided = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!env.ADMIN_TOKEN || !safeEqual(provided, env.ADMIN_TOKEN)) {
    return fail("Not authorised.", 401, request, env);
  }

  if (request.method === "GET" && path === "/admin/bookings") {
    const from = url.searchParams.get("from") ?? new Date(Date.now() - 7 * 86400000).toISOString();
    const { results } = await env.DB.prepare(
      "SELECT b.*, l.name AS lesson_name FROM bookings b JOIN lesson_types l ON l.id = b.lesson_type_id WHERE b.starts_at > ? ORDER BY b.starts_at"
    )
      .bind(from)
      .all();
    return json({ bookings: results ?? [] }, 200, request, env);
  }

  if (request.method === "GET" && path === "/admin/availability") {
    const [rules, exceptions] = await Promise.all([
      env.DB.prepare("SELECT * FROM availability_rules ORDER BY weekday, start_minute").all(),
      env.DB.prepare("SELECT * FROM availability_exceptions WHERE date >= ? ORDER BY date")
        .bind(dateKey(new Date(), PORTO))
        .all()
    ]);
    return json({ rules: rules.results ?? [], exceptions: exceptions.results ?? [], settings: await loadSettings(env) }, 200, request, env);
  }

  if (request.method === "POST" && path === "/admin/availability") {
    const body = await readJson(request);
    if (!Array.isArray(body.rules)) return fail("Expected a rules array.", 400, request, env);

    const statements = [env.DB.prepare("DELETE FROM availability_rules")];
    for (const rule of body.rules.slice(0, 100)) {
      const weekday = Number(rule.weekday);
      const start = Number(rule.startMinute);
      const end = Number(rule.endMinute);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
      if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start || start < 0 || end > 1440) continue;
      statements.push(
        env.DB.prepare("INSERT INTO availability_rules (weekday, start_minute, end_minute, active) VALUES (?, ?, ?, 1)").bind(
          weekday,
          start,
          end
        )
      );
    }

    await env.DB.batch(statements);
    return json({ ok: true, count: statements.length - 1 }, 200, request, env);
  }

  if (request.method === "POST" && path === "/admin/exceptions") {
    const body = await readJson(request);
    if (body.remove) {
      await env.DB.prepare("DELETE FROM availability_exceptions WHERE id = ?").bind(Number(body.remove)).run();
      return json({ ok: true }, 200, request, env);
    }
    if (!parseDateKey(body.date)) return fail("Invalid date.", 400, request, env);

    await env.DB.prepare(
      "INSERT INTO availability_exceptions (date, kind, start_minute, end_minute, note, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(
        body.date,
        body.kind === "extra" ? "extra" : "blocked",
        body.startMinute ?? null,
        body.endMinute ?? null,
        cleanText(body.note, 200),
        new Date().toISOString()
      )
      .run();
    return json({ ok: true }, 200, request, env);
  }

  if (request.method === "POST" && path === "/admin/settings") {
    const body = await readJson(request);
    const allowed = new Set([
      "minimum_notice_hours",
      "booking_horizon_days",
      "slot_interval_minutes",
      "same_day_change_fee_cents",
      "teacher_name",
      "teacher_email",
      "reply_to_email"
    ]);
    const statements = Object.entries(body.settings ?? {})
      .filter(([key]) => allowed.has(key))
      .map(([key, value]) =>
        env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, String(value))
      );
    if (statements.length) await env.DB.batch(statements);
    return json({ ok: true, updated: statements.length }, 200, request, env);
  }

  return fail("Not found.", 404, request, env);
}

export default worker;
