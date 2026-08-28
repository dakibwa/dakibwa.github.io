import { computeAvailability, isSlotBookable, listLessonTypes, loadLessonType, loadSettings } from "./availability.mjs";
import {
  OPEN_ENDED_HORIZON_WEEKS,
  SERIES_LENGTHS,
  normaliseWeeks,
  outstandingFor,
  planOccurrences,
  slotOf
} from "./series.mjs";
import { buildCalendarInvite, buildCalendarSeriesInvite, calendarUid } from "./ics.mjs";
import { deliver } from "./email.mjs";
import {
  chargeSavedCard,
  createCheckoutSession,
  isTestMode,
  refundPayment,
  retrievePaymentIntent,
  stripeConfigured,
  verifyWebhook
} from "./stripe.mjs";
import { changePolicy } from "./policy.mjs";
import { verifyGoogleIdToken } from "./google.mjs";
import {
  createResetToken,
  createSession,
  hashPassword,
  normaliseEmail,
  passwordProblem,
  readResetToken,
  readSession,
  verifyPassword
} from "./auth.mjs";
import {
  PORTO,
  addDaysToKey,
  dateKey,
  differingZonedTime,
  formatInZone,
  formatShort,
  isValidTimeZone,
  parseDateKey
} from "./time.mjs";
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

/**
 * The body as an object, or an empty one.
 *
 * `null`, `7`, `"hi"` and `true` are all valid JSON, so a parse that succeeded
 * was not enough — those went straight into handlers doing `body.notes` and
 * `"repeat" in body`, and a four-byte unauthenticated body turned into a 500.
 */
async function readJson(request) {
  try {
    const data = await request.json();
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function siteUrl(env, path = "") {
  return `${String(env.SITE_URL ?? "https://portuguesewithines.com").replace(/\/+$/, "")}${path}`;
}

/*
 * Deliberately narrower than the RFC. The old pattern allowed quotes, brackets,
 * commas and semicolons in the local part — none of which Resend will send to,
 * and all of which then travelled into the iCalendar ATTENDEE line. Refusing
 * them at registration puts the error in front of the person who can fix it.
 */
function isEmail(value) {
  return /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(
    String(value ?? "").trim()
  );
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
    sameDayFeeCents: settings.sameDayChangeFeeCents,
    paymentStatus: row.payment_status,
    amountCents: row.amount_cents
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
async function notify(env, { event, row, lessonType, settings, manageUrl, previousStartsAt, byTeacher = false }) {
  const teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  const replyTo = settings.replyToEmail || teacherEmail || undefined;
  const start = new Date(row.starts_at);

  // "Porto time", in words — the site's own vocabulary. "(WEST)" was accurate
  // but jargon to a student; the your-time line below the hero and the calendar
  // attachment already carry the conversion for anyone in another zone.
  const portoTime = `${formatInZone(start, PORTO)}, Porto time`;
  const studentZone = isValidTimeZone(row.student_timezone) ? row.student_timezone : PORTO;
  // Null unless the student's clock genuinely reads differently from Porto's.
  const studentTime = differingZonedTime(start, studentZone);

  // The date and time is the one thing the reader is looking for, so it is
  // lifted out of the detail table into its own panel rather than being the
  // second row of five.
  const hero = portoTime;
  // Porto time *is* Inês's time, so this note is the student's clock on her
  // copy and their own on theirs. Labelling it "Your time" to her was wrong.
  const studentHeroNote = studentTime ? `${studentTime} — your time` : "";
  const teacherHeroNote = studentTime ? `${studentTime} — the student's time` : "";

  const baseRows = [
    { label: "Lesson", value: `${lessonType.name} · ${lessonType.duration_minutes} minutes` },
    { label: "Where", value: locationLabel(row) },
    { label: "Reference", value: row.reference }
  ];

  // The student's copy also says what it costs and how paying works — the
  // confirmation is the one email everyone reads, and payment shouldn't be a
  // surprise at the door. Not on a cancellation, where a price is just noise,
  // and not on Inês's copy, which would be telling her her own prices.
  // A prepaid booking says "paid"; one from before prepay keeps the old terms.
  const isPaid = row.payment_status === "paid";
  const wasRefunded = row.payment_status === "refunded";
  const isOnCard = row.payment_status === "scheduled" || row.payment_status === "payment_due";
  const priceValue = isPaid
    ? `€${(lessonType.price_cents / 100).toFixed(0)} · paid`
    : isOnCard
      ? `€${(lessonType.price_cents / 100).toFixed(0)} · goes to your saved card on the day`
      : `€${(lessonType.price_cents / 100).toFixed(0)} · pay on the day, in person`;
  const studentRows =
    event === "cancelled"
      ? baseRows
      : [...baseRows.slice(0, 2), { label: "Price", value: priceValue }, ...baseRows.slice(2)];

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

  // Subjects carry the date, not the reference: "PT-LS29CT" tells the reader
  // nothing in an inbox list, and the date is what they are scanning for.
  const shortWhen = formatShort(start, PORTO);

  // Two footers because two sets of terms are live at once: prepaid bookings
  // carry the one-rule policy, and bookings from before prepay keep the fee
  // terms they were booked under.
  const paidChangeFooter =
    "Move or cancel it free until the day before, from the link above. On the day of the lesson it's yours — no changes and no refunds.";
  const unpaidChangeFooter = `Need to change it? Use the link above. Changing on the day of the lesson costs €${(
    settings.sameDayChangeFeeCents / 100
  ).toFixed(0)}; any earlier is free.`;
  const refundNote = wasRefunded
    ? `Your €${((row.amount_cents ?? lessonType.price_cents) / 100).toFixed(0)} is on its way back to your card — refunds usually show within a few days.`
    : "";

  const student = {
    booked: {
      subject: `Your Portuguese lesson is booked — ${shortWhen}`,
      heading: "You're booked",
      intro: `Olá ${row.student_name.split(" ")[0]}, your lesson with Inês is ${
        isPaid ? "paid and confirmed" : "confirmed"
      }. It's in your calendar attachment, and you can move or cancel it any time using the button below.`,
      callout: "",
      footer: isPaid ? paidChangeFooter : unpaidChangeFooter
    },
    rescheduled: byTeacher
      ? {
          // Written for someone who did not ask for this. The old copy said
          // "that's done", which reads as a confirmation of something you did
          // — a strange thing to receive when Inês moved your lesson.
          subject: `Inês has moved your lesson — now ${shortWhen}`,
          heading: "Inês has moved your lesson",
          intro: `Olá ${row.student_name.split(" ")[0]}, Inês has had to move your lesson. Sorry about that — the new time is below and your calendar has been updated. If it doesn't suit, move it again from the link below or reply and she'll find another.`,
          callout: "",
          footer: "No charge for a change she makes."
        }
      : {
          subject: `Your lesson has moved — ${shortWhen}`,
          heading: "Your lesson has moved",
          intro: `Olá ${row.student_name.split(" ")[0]}, that's done — your lesson is now at the time below and your calendar has been updated.`,
          callout: isPaid || isOnCard ? "" : sameDayNotice,
          footer: isPaid || isOnCard ? paidChangeFooter : "You can move or cancel it again from the same link."
        },
    cancelled: byTeacher
      ? {
          subject: `Inês has cancelled your lesson on ${shortWhen}`,
          heading: "Inês has cancelled this lesson",
          intro: `Olá ${row.student_name.split(" ")[0]}, Inês has had to cancel this lesson and it has been removed from your calendar. Sorry about that — book another time whenever suits you, or reply and she'll sort one out with you.`,
          callout: refundNote,
          footer: wasRefunded ? "Refunded in full — a cancellation she makes never costs you anything." : "No charge for a cancellation she makes."
        }
      : {
          subject: `Your lesson on ${shortWhen} is cancelled`,
          heading: "Your lesson is cancelled",
          intro: `Olá ${row.student_name.split(" ")[0]}, your lesson has been cancelled and removed from your calendar.`,
          callout: wasRefunded ? refundNote : isOnCard ? "Nothing was charged for this lesson." : sameDayNotice,
          footer: "You're welcome back any time — booking is always open on the website."
        }
  }[event];

  const teacher = {
    booked: {
      subject: `New booking — ${row.student_name}, ${shortWhen}`,
      heading: "New booking",
      // The invitation carries PARTSTAT=ACCEPTED, so there is nothing for her
      // to accept — telling her to was instructing a step that doesn't exist.
      intro: `${row.student_name} has booked a lesson. The attached invitation goes straight into your calendar.`,
      callout: ""
    },
    rescheduled: {
      subject: byTeacher
        ? `You moved ${row.student_name}'s lesson — ${shortWhen}`
        : `${row.same_day_change ? "Same-day change" : "Lesson moved"} — ${row.student_name}, ${shortWhen}`,
      heading: byTeacher ? "You moved this lesson" : row.same_day_change ? "Changed on the lesson day" : "Lesson moved",
      intro: byTeacher
        ? `You moved ${row.student_name}'s lesson${
            previousStartsAt ? ` from ${formatInZone(new Date(previousStartsAt), PORTO)}` : ""
          }. They have been told, and your calendar has been updated.`
        : `${row.student_name} moved their lesson${
            previousStartsAt ? ` from ${formatInZone(new Date(previousStartsAt), PORTO)}` : ""
          }. Your calendar has been updated.`,
      callout: row.same_day_change
        ? `This was changed on the day of the lesson, so the €${(settings.sameDayChangeFeeCents / 100).toFixed(
            0
          )} fee applies. Collect it at the lesson.`
        : ""
    },
    cancelled: {
      subject: byTeacher
        ? `You cancelled ${row.student_name}'s lesson — ${shortWhen}`
        : `${row.same_day_change ? "Same-day cancellation" : "Cancellation"} — ${row.student_name}, ${shortWhen}`,
      heading: byTeacher ? "You cancelled this lesson" : row.same_day_change ? "Cancelled on the lesson day" : "Lesson cancelled",
      intro: byTeacher
        ? `You cancelled ${row.student_name}'s lesson on ${formatInZone(start, PORTO)}. They have been told, and it is off your calendar.`
        : `${row.student_name} cancelled their lesson on ${formatInZone(start, PORTO)}. It has been removed from your calendar.`,
      callout: wasRefunded
        ? `€${((row.amount_cents ?? lessonType.price_cents) / 100).toFixed(0)} was refunded automatically — nothing to sort out.`
        : row.same_day_change
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
        hero,
        heroNote: studentHeroNote,
        preheader: `${lessonType.name} · ${portoTime}`,
        rows: studentRows,
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
          hero,
          heroNote: teacherHeroNote,
          preheader: `${row.student_name} · ${lessonType.name} · ${portoTime}`,
          rows: [
            ...baseRows,
            { label: "Student", value: `${row.student_name}\n${row.student_email}${row.student_phone ? `\n${row.student_phone}` : ""}` },
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

/**
 * A whole run of lessons, in one email each way.
 *
 * Twelve bookings must not mean twelve emails, but each lesson still has to
 * reach Inês's calendar as its own entry — so one message carries one calendar
 * file holding every occurrence, each under its own booking's UID. Changing a
 * single week later goes out through the ordinary per-lesson path and matches
 * the event already sitting in her calendar.
 */
async function notifySeries(env, { rows, lessonType, settings, series, manageUrls, skipped, reason = "booked" }) {
  if (!rows.length) return [];

  const teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  const replyTo = settings.replyToEmail || teacherEmail || undefined;
  const first = rows[0];
  const studentZone = isValidTimeZone(first.student_timezone) ? first.student_timezone : PORTO;

  const events = rows.map((row) => ({
    uid: calendarUid(row.id),
    sequence: row.sequence,
    summary: lessonSummary(row, lessonType),
    description: lessonDescription(row, lessonType, manageUrls[row.id] ?? ""),
    location: locationLabel(row),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    organiserName: settings.teacherName,
    organiserEmail: env.MAIL_SENDER_ADDRESS || "bookings@portuguesewithines.com",
    url: manageUrls[row.id] ?? ""
  }));

  const invite = (attendee) =>
    buildCalendarSeriesInvite({
      method: "REQUEST",
      events: events.map((event) => ({ ...event, attendees: [attendee] }))
    });

  const dateLines = rows
    .map((row) => formatInZone(new Date(row.starts_at), PORTO))
    .join("\n");

  const cadence = series.occurrences ? `${rows.length} lessons` : "Every week, until you stop it";
  const skippedNote = skipped.length
    ? `${
        skipped.length === 1
          ? "One week was not free, so there is no lesson that week:"
          : `${skipped.length} weeks were not free, so there is no lesson on these dates:`
      } ${skipped.map((entry) => formatShort(new Date(entry.startAt), PORTO)).join(", ")}.`
    : "";

  const rowsForBoth = [
    { label: "Lesson", value: `${lessonType.name} · ${lessonType.duration_minutes} minutes` },
    { label: "Where", value: locationLabel(first) },
    { label: "Repeats", value: cadence },
    { label: "Dates", value: dateLines }
  ];

  // Price on the student's copy only, per lesson — Inês doesn't need her own
  // prices repeated to her. A prepaid run's first lesson is paid and the rest
  // charge the saved card on their own day; an older run keeps the
  // pay-on-the-day terms it was booked under.
  const seriesOnCard = rows.some((row) => row.payment_status === "paid" || row.payment_status === "scheduled");
  const seriesFirstPaid = rows.some((row) => row.payment_status === "paid");
  const studentSeriesRows = [
    ...rowsForBoth.slice(0, 2),
    {
      label: "Price",
      value: seriesOnCard
        ? `€${(lessonType.price_cents / 100).toFixed(0)} a lesson · ${
            seriesFirstPaid ? "first lesson paid, the rest go" : "goes"
          } to your saved card on the day of each lesson`
        : `€${(lessonType.price_cents / 100).toFixed(0)} a lesson · pay on the day, in person`
    },
    ...rowsForBoth.slice(2)
  ];
  const seriesFooter = seriesOnCard
    ? "Move or cancel any single lesson free until the day before it — a lesson not yet charged is never charged, and one already paid is refunded automatically. On a lesson's own day it's yours — no changes and no refunds."
    : `Changing a lesson on the day it happens costs €${(settings.sameDayChangeFeeCents / 100).toFixed(0)}; any earlier is free.`;

  const sends = [
    deliver(env, {
      to: first.student_email,
      subject:
        reason === "extended"
          ? `More of your weekly lessons are in the calendar — from ${formatShort(new Date(first.starts_at), PORTO)}`
          : `Your weekly Portuguese lessons are booked — from ${formatShort(new Date(first.starts_at), PORTO)}`,
      kind: reason === "extended" ? "student_series_extended" : "student_series_booked",
      bookingId: first.id,
      // Keyed on the occurrences it describes, not how many there are. A count
      // collides every week for an open-ended series, so after the first top-up
      // every later one was silently swallowed as a duplicate.
      dedupeKey: `student:series:${series.id}:${rows[0].id}`,
      replyTo,
      calendar: { body: invite({ name: first.student_name, email: first.student_email }), method: "REQUEST" },
      content: {
        heading: reason === "extended" ? "More lessons in your calendar" : "Your weekly slot is booked",
        intro:
          reason === "extended"
            ? `Olá ${first.student_name.split(" ")[0]}, your weekly slot keeps going, so a few more lessons have been added to your calendar. Move or cancel any one of them on its own from your lessons page, or stop the repeat there whenever you like.`
            : `Olá ${first.student_name.split(" ")[0]}, the same time is now held for you each week. Every lesson is in the calendar attachment, and you can move or cancel any one of them on its own from your lessons page.`,
        callout: skippedNote,
        hero: `${formatInZone(new Date(first.starts_at), PORTO)}, Porto time`,
        heroNote: differingZonedTime(new Date(first.starts_at), studentZone) ? `${differingZonedTime(new Date(first.starts_at), studentZone)} — your time` : "",
        preheader: `${lessonType.name} · ${cadence}`,
        rows: studentSeriesRows,
        action: { label: "See all your lessons", url: siteUrl(env, "/my-lessons/") },
        footer: seriesFooter
      }
    })
  ];

  if (teacherEmail) {
    sends.push(
      deliver(env, {
        to: teacherEmail,
        subject:
          reason === "extended"
            ? `Weekly slot extended — ${first.student_name}, to ${formatShort(new Date(rows[rows.length - 1].starts_at), PORTO)}`
            : `Weekly booking — ${first.student_name}, from ${formatShort(new Date(first.starts_at), PORTO)}`,
        kind: reason === "extended" ? "teacher_series_extended" : "teacher_series_booked",
        bookingId: first.id,
        dedupeKey: `teacher:series:${series.id}:${rows[0].id}`,
        replyTo: first.student_email,
        calendar: { body: invite({ name: settings.teacherName, email: teacherEmail }), method: "REQUEST" },
        content: {
          heading: reason === "extended" ? "A weekly slot was extended" : "A weekly slot was booked",
          intro:
            reason === "extended"
              ? `${first.student_name}'s open-ended weekly slot has been carried forward. The new lessons are in the calendar attachment.`
              : `${first.student_name} booked the same slot each week. Every lesson is in the calendar attachment.`,
          callout: skippedNote,
          hero: `${formatInZone(new Date(first.starts_at), PORTO)}, Porto time`,
          heroNote: "",
          preheader: `${first.student_name} · ${cadence}`,
          rows: [
            ...rowsForBoth,
            { label: "Student", value: `${first.student_name}\n${first.student_email}${first.student_phone ? `\n${first.student_phone}` : ""}` },
            ...(first.notes ? [{ label: "Notes", value: first.notes }] : [])
          ],
          action: null,
          footer: "Sent automatically by the booking system on portuguesewithines.com."
        }
      })
    );
  }

  return Promise.allSettled(sends);
}

/**
 * Claim a time, or find out someone else already has.
 *
 * Availability is checked before this, but a check and a separate insert are
 * two statements, and between them another request can pass the same check.
 * Under load that is not theoretical: four different students were confirmed
 * into one lesson in testing. So the decision and the write are one statement,
 * and SQLite settles it — a row is written only if nothing overlapping exists,
 * and zero rows affected means somebody won the race.
 *
 * Overlap, not equality: her lessons are 60 and 90 minutes on a 30-minute grid,
 * so a 90-minute lesson at 17:00 and a 60-minute one at 17:30 collide while
 * starting at different times. A unique index on the start time would miss it.
 */
async function claimSlot(env, { columns, values, startAt, endAt, studentId = null }) {
  const placeholders = columns.map(() => "?").join(", ");
  /*
   * A student's own pending hold doesn't block them: someone who starts paying,
   * backs out to change a detail, and confirms again would otherwise be told
   * their own slot "has just been taken" for the life of the abandoned hold.
   * Only one checkout can complete — the other hold expires unpaid.
   */
  const result = await env.DB.prepare(
    `INSERT INTO bookings (${columns.join(", ")})
     SELECT ${placeholders}
     WHERE NOT EXISTS (
       SELECT 1 FROM bookings
       WHERE status IN ('confirmed', 'pending_payment')
         AND starts_at < ?
         AND ends_at > ?
         AND NOT (status = 'pending_payment' AND student_id IS ?)
     )`
  )
    .bind(...values, endAt, startAt, studentId)
    .run();

  return (result?.meta?.changes ?? 0) > 0;
}

/**
 * A whole run cancelled, in one email each way.
 *
 * Stopping an open-ended series used to call notify() per lesson, so twelve
 * occurrences meant twenty-four requests to the mail provider in the same
 * instant — most of which its rate limit drops on the floor, silently. One
 * message carries one calendar file cancelling every occurrence, each under its
 * own booking's UID with its own incremented SEQUENCE, which is what a calendar
 * needs to remove them.
 */
async function notifySeriesCancelled(env, { rows, lessonType, settings }) {
  if (!rows.length) return [];

  const teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  const replyTo = settings.replyToEmail || teacherEmail || undefined;
  const first = rows[0];

  const events = rows.map((row) => ({
    uid: calendarUid(row.id),
    sequence: row.sequence,
    summary: lessonSummary(row, lessonType),
    description: lessonDescription(row, lessonType, ""),
    location: locationLabel(row),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    organiserName: settings.teacherName,
    organiserEmail: env.MAIL_SENDER_ADDRESS || "bookings@portuguesewithines.com"
  }));

  const invite = (attendee) =>
    buildCalendarSeriesInvite({ method: "CANCEL", events: events.map((event) => ({ ...event, attendees: [attendee] })) });

  const dates = rows.map((row) => formatInZone(new Date(row.starts_at), PORTO)).join("\n");
  const count = `${rows.length} ${rows.length === 1 ? "lesson" : "lessons"}`;

  const sends = [
    deliver(env, {
      to: first.student_email,
      subject: `Your weekly lessons are cancelled — ${count}`,
      kind: "student_series_cancelled",
      bookingId: first.id,
      dedupeKey: `student:series-cancel:${first.id}:${rows.length}`,
      replyTo,
      calendar: { body: invite({ name: first.student_name, email: first.student_email }), method: "CANCEL" },
      content: {
        heading: "Your weekly lessons are cancelled",
        preheader: `${count} removed from your calendar.`,
        intro: `Olá ${first.student_name.split(" ")[0]}, the rest of your weekly run has been cancelled and removed from your calendar. You're welcome back any time — booking is always open on the website.`,
        callout: "",
        hero: "",
        heroNote: "",
        rows: [{ label: "Cancelled", value: dates }],
        action: null,
        footer: "Booking is always open on portuguesewithines.com."
      }
    })
  ];

  if (teacherEmail) {
    sends.push(
      deliver(env, {
        to: teacherEmail,
        subject: `Weekly run cancelled — ${first.student_name}, ${count}`,
        kind: "teacher_series_cancelled",
        bookingId: first.id,
        dedupeKey: `teacher:series-cancel:${first.id}:${rows.length}`,
        replyTo: first.student_email,
        calendar: { body: invite({ name: settings.teacherName, email: teacherEmail }), method: "CANCEL" },
        content: {
          heading: "A weekly run was cancelled",
          preheader: `${first.student_name} · ${count}`,
          intro: `${first.student_name} cancelled the rest of their weekly lessons. They are off your calendar.`,
          callout: "",
          hero: "",
          heroNote: "",
          rows: [
            { label: "Student", value: `${first.student_name}\n${first.student_email}` },
            { label: "Cancelled", value: dates }
          ],
          action: null,
          footer: "Sent automatically by the booking system on portuguesewithines.com."
        }
      })
    );
  }

  return Promise.allSettled(sends);
}

/** The signed-in student, or null. */
async function currentStudent(request, env) {
  const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return null;

  const studentId = await readSession(bearer, env.BOOKING_TOKEN_SECRET);
  if (!studentId) return null;

  return env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(studentId).first();
}

function publicStudent(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    timezone: row.timezone,
    role: row.role ?? "student"
  };
}

/**
 * Throttles guessing without letting an attacker lock a real student out: the
 * window is short and keyed on recent failures only.
 */
async function tooManyFailures(env, email) {
  const since = new Date(Date.now() - 15 * 60000).toISOString();
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE email = ? AND at > ?")
    .bind(email, since)
    .first();
  return (row?.count ?? 0) >= 8;
}

async function recordFailure(env, email) {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO login_attempts (email, at) VALUES (?, ?)").bind(email, now),
    env.DB.prepare("DELETE FROM login_attempts WHERE at < ?").bind(new Date(Date.now() - 86400000).toISOString())
  ]);
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

      /*
       * `await`, not a bare return. The catch below exists to turn any handler
       * failure into a tidy JSON 500, and it never fired: returning a promise
       * from inside a try block does not route its rejection there, because the
       * function has already returned by the time it rejects.
       */
      if (request.method === "GET" && path === "/health") return await handleHealth(request, env);
      if (request.method === "GET" && path === "/lesson-types") {
        // The page adapts to payment mode before anyone books — prepay shows
        // "confirm and pay", hides the open-ended repeat, and says the policy.
        const settings = await loadSettings(env);
        return json(
          {
            lessonTypes: await listLessonTypes(env),
            prepay: settings.paymentMode === "prepay" && stripeConfigured(env)
          },
          200,
          request,
          env
        );
      }
      if (request.method === "GET" && path === "/availability") return await handleAvailability(request, env, url);

      if (request.method === "POST" && path === "/stripe/webhook") return await handleStripeWebhook(request, env, ctx);

      if (request.method === "POST" && path === "/auth/register") return await handleRegister(request, env);
      if (request.method === "POST" && path === "/auth/login") return await handleLogin(request, env);
      if (request.method === "POST" && path === "/auth/google") return await handleGoogleSignIn(request, env);
      if (request.method === "POST" && path === "/auth/forgot") return await handleForgot(request, env, ctx);
      if (request.method === "POST" && path === "/auth/reset") return await handleReset(request, env);
      if (request.method === "GET" && path === "/me") return await handleMe(request, env);
      if (request.method === "POST" && path === "/me") return await handleUpdateMe(request, env);
      if (request.method === "POST" && path === "/me/email") return await handleRequestEmailChange(request, env, ctx);
      if (request.method === "POST" && path === "/me/email/confirm") return await handleConfirmEmailChange(request, env);

      // Preview before commit: a student is told which weeks are free, and
      // which are not, before anything is booked in their name.
      if (request.method === "POST" && path === "/bookings/series/preview") {
        return await handleSeriesPreview(request, env);
      }

      if (request.method === "POST" && path === "/bookings") return await handleCreate(request, env, ctx);

      const stopSeries = path.match(/^\/series\/([^/]+)\/stop$/);
      if (stopSeries && request.method === "POST") return await handleStopSeries(request, env, ctx, stopSeries[1]);

      const manage = path.match(/^\/bookings\/([^/]+)$/);
      if (manage && request.method === "GET") return await handleGetBooking(request, env, manage[1]);

      const reschedule = path.match(/^\/bookings\/([^/]+)\/reschedule$/);
      if (reschedule && request.method === "POST") return await handleReschedule(request, env, ctx, reschedule[1]);

      const cancel = path.match(/^\/bookings\/([^/]+)\/cancel$/);
      if (cancel && request.method === "POST") return await handleCancel(request, env, ctx, cancel[1]);

      if (path.startsWith("/admin/")) return await handleAdmin(request, env, ctx, url, path);

      return fail("Not found.", 404, request, env);
    } catch (error) {
      console.error("booking-worker", error?.stack ?? String(error));
      return fail("Something went wrong handling that request.", 500, request, env);
    }
  },

  /**
   * Nightly: pull every open-ended series forward so a student always has a run
   * of lessons in front of them and Inês's calendar is blocked that far ahead.
   *
   * Deliberately not done on a page view. Her calendar has to be right whether
   * or not anyone has opened the site, and a read path that quietly writes
   * bookings is the kind of thing that is impossible to reason about later.
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(topUpOpenSeries(env));
    ctx.waitUntil(chargeDueLessons(env));
    ctx.waitUntil(resendFailedEmails(env));
  }
};

/**
 * The morning charge: every lesson happening today that booked itself onto a
 * saved card gets charged now. This is the policy made mechanical — free to
 * change until the day before, charged on the day regardless — and it runs at
 * 03:10 Porto time, hours before the earliest lesson.
 *
 * A decline is a fact of card networks, not an exception: the lesson stays
 * confirmed, the student gets a pay-now link, Inês gets a note, and the row
 * is marked 'payment_due' so it is never charged twice.
 */
async function chargeDueLessons(env) {
  if (!stripeConfigured(env)) return;

  const todayKey = dateKey(new Date(), PORTO);
  const { results } = await env.DB.prepare(
    "SELECT * FROM bookings WHERE status = 'confirmed' AND payment_status = 'scheduled'"
  ).all();

  for (const row of results ?? []) {
    if (dateKey(new Date(row.starts_at), PORTO) !== todayKey) continue;

    try {
      const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(row.student_id).first();
      const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
        .bind(row.lesson_type_id)
        .first();
      if (!student || !lessonType) continue;

      if (student.stripe_customer_id && student.stripe_payment_method) {
        try {
          const intent = await chargeSavedCard(env, {
            customer: student.stripe_customer_id,
            paymentMethod: student.stripe_payment_method,
            amountCents: row.amount_cents ?? lessonType.price_cents,
            description: `${lessonType.name} · ${row.reference}`,
            metadata: { booking_reference: row.reference }
          });

          await env.DB.prepare(
            "UPDATE bookings SET payment_status = 'paid', stripe_payment_intent = ?, updated_at = ? WHERE id = ?"
          )
            .bind(intent.id ?? null, new Date().toISOString(), row.id)
            .run();

          await notifyLessonCharged(env, { row, lessonType });
          continue;
        } catch (error) {
          console.error("auto-charge", row.reference, String(error?.message ?? error));
        }
      }

      // No saved card, or the charge declined: same outcome either way — the
      // lesson stands, and the money is asked for by link instead.
      await env.DB.prepare("UPDATE bookings SET payment_status = 'payment_due', updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), row.id)
        .run();
      await notifyPaymentDue(env, { row, lessonType });
    } catch (error) {
      console.error("charge-due", row.reference, String(error?.message ?? error));
    }
  }
}

async function notifyLessonCharged(env, { row, lessonType }) {
  const settings = await loadSettings(env);
  const start = new Date(row.starts_at);
  const amount = `€${((row.amount_cents ?? lessonType.price_cents) / 100).toFixed(0)}`;

  await deliver(env, {
    to: row.student_email,
    subject: `Today's lesson is paid — ${formatShort(start, PORTO)}`,
    kind: "student_lesson_charged",
    bookingId: row.id,
    dedupeKey: `charged:${row.id}`,
    replyTo: settings.replyToEmail || env.TEACHER_EMAIL || settings.teacherEmail || undefined,
    content: {
      heading: "Today's lesson is paid",
      preheader: `${lessonType.name} · ${amount} to your saved card`,
      intro: `Olá ${row.student_name.split(" ")[0]}, ${amount} for today's ${lessonType.name.toLowerCase()} went to your saved card, as booked. See you at ${formatInZone(start, PORTO).split(", ").pop()}, Porto time.`,
      callout: "",
      rows: [
        { label: "Lesson", value: `${lessonType.name} · ${lessonType.duration_minutes} minutes` },
        { label: "Reference", value: row.reference }
      ],
      action: null,
      footer: "Sent automatically by the booking system on portuguesewithines.com."
    }
  });
}

async function notifyPaymentDue(env, { row, lessonType }) {
  const settings = await loadSettings(env);
  const teacherEmail = env.TEACHER_EMAIL || settings.teacherEmail;
  const start = new Date(row.starts_at);
  const amount = `€${((row.amount_cents ?? lessonType.price_cents) / 100).toFixed(0)}`;

  let payUrl = "";
  try {
    const session = await createCheckoutSession(env, {
      booking: row,
      lessonType,
      customerEmail: row.student_email,
      forceHosted: true,
      successUrl: siteUrl(env, "/my-lessons/?paid=1"),
      cancelUrl: siteUrl(env, "/my-lessons/")
    });
    payUrl = session.url ?? "";
    if (session.id) {
      await env.DB.prepare("UPDATE bookings SET stripe_session_id = ? WHERE id = ?").bind(session.id, row.id).run();
    }
  } catch (error) {
    console.error("payment-due-link", row.reference, String(error?.message ?? error));
  }

  await deliver(env, {
    to: row.student_email,
    subject: `Today's lesson — the card didn't go through`,
    kind: "student_payment_due",
    bookingId: row.id,
    dedupeKey: `payment-due:${row.id}`,
    replyTo: settings.replyToEmail || teacherEmail || undefined,
    content: {
      heading: "The card didn't go through",
      preheader: `${lessonType.name} · ${amount} still to pay`,
      intro: `Olá ${row.student_name.split(" ")[0]}, today's ${lessonType.name.toLowerCase()} couldn't be charged to your saved card — banks do this sometimes. The lesson still stands; please pay with the button below, or sort it out with Inês at the lesson.`,
      callout: "",
      rows: [
        { label: "Lesson", value: `${lessonType.name} · ${lessonType.duration_minutes} minutes` },
        { label: "Price", value: amount },
        { label: "Reference", value: row.reference }
      ],
      action: payUrl ? { label: "Pay for this lesson", url: payUrl } : null,
      footer: "Sent automatically by the booking system on portuguesewithines.com."
    }
  });

  if (teacherEmail) {
    await deliver(env, {
      to: teacherEmail,
      subject: `Card declined — ${row.student_name}, ${formatShort(start, PORTO)}`,
      kind: "teacher_payment_due",
      bookingId: row.id,
      dedupeKey: `payment-due-teacher:${row.id}`,
      replyTo: row.student_email,
      content: {
        heading: "A card didn't go through",
        preheader: `${row.student_name} · ${lessonType.name} · ${amount}`,
        intro: `${row.student_name}'s ${amount} for today's lesson couldn't be charged automatically. They've been sent a payment link — if it's still unpaid at the lesson, that's the one to mention.`,
        callout: "",
        rows: [
          { label: "Student", value: `${row.student_name}\n${row.student_email}` },
          { label: "Reference", value: row.reference }
        ],
        action: null,
        footer: "Sent automatically by the booking system on portuguesewithines.com."
      }
    });
  }
}

/**
 * Retry what the provider refused.
 *
 * email_log has always been described as the audit trail for a reconciliation
 * sweep, and there was no sweep — nothing in the worker ever read the table. A
 * booking would confirm, the confirmation would fail on a rate limit, and
 * neither the student nor Inês would ever learn the lesson existed.
 *
 * Only the fact of the failure is retryable, not the message: the body is not
 * stored. So this re-sends the one thing that can be rebuilt from the booking —
 * its own confirmation — and leaves anything else for a person to see.
 */
async function resendFailedEmails(env) {
  const cutoff = new Date(Date.now() - 5 * 60000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT * FROM email_log
     WHERE status = 'failed' AND booking_id IS NOT NULL AND created_at < ?
     ORDER BY created_at LIMIT 25`
  )
    .bind(cutoff)
    .all();

  if (!results?.length) return;

  const settings = await loadSettings(env);

  for (const entry of results) {
    try {
      const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(entry.booking_id).first();
      if (!row) continue;

      const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
        .bind(row.lesson_type_id)
        .first();
      if (!lessonType) continue;

      const event = row.status === "cancelled" ? "cancelled" : "booked";
      const token = await createManageToken(row.id, env.BOOKING_TOKEN_SECRET);

      // deliver() clears a failed row before retrying, so this is not suppressed
      // as a duplicate the way it used to be.
      await notify(env, {
        event,
        row,
        lessonType,
        settings,
        manageUrl: siteUrl(env, `/booking/?token=${encodeURIComponent(token)}`)
      });
    } catch (error) {
      console.error("email-resend", entry.dedupe_key, String(error?.message ?? error));
    }
  }
}

async function topUpOpenSeries(env) {
  const now = new Date();
  const { results } = await env.DB.prepare(
    "SELECT * FROM booking_series WHERE status = 'active' AND occurrences IS NULL"
  ).all();

  for (const series of results ?? []) {
    try {
      const counted = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM bookings WHERE series_id = ? AND status = 'confirmed'"
      )
        .bind(series.id)
        .first();

      const outstanding = outstandingFor(series, { bookedCount: counted?.count ?? 0, now });
      if (!outstanding || outstanding.count <= 0) continue;

      const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(series.student_id).first();
      const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
        .bind(series.lesson_type_id)
        .first();
      if (!student || !lessonType) continue;

      const filled = await fillSeries(env, {
        series,
        student,
        lessonType,
        fromKey: outstanding.fromKey,
        count: outstanding.count,
        now,
        // A prepaid run keeps its promise as it grows: each new occurrence
        // charges the saved card on its own day. An older run stays as booked.
        paymentState: series.prepaid ? "scheduled" : "none"
      });

      if (!filled.rows.length) continue;

      const settings = await loadSettings(env);
      const manageUrls = {};
      for (const row of filled.rows) {
        const token = await createManageToken(row.id, env.BOOKING_TOKEN_SECRET);
        manageUrls[row.id] = siteUrl(env, `/booking/?token=${encodeURIComponent(token)}`);
      }

      await notifySeries(env, {
        rows: filled.rows,
        lessonType,
        settings,
        series,
        manageUrls,
        skipped: filled.skipped,
        // Not a new booking — this slot was already theirs. Telling an existing
        // student it "is now held for you each week" every month reads as a
        // duplicate of something they did in September.
        reason: "extended"
      });
    } catch (error) {
      // One bad series must not stop the rest being extended.
      console.error("series-topup", series.id, String(error?.message ?? error));
    }
  }
}

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

  let paymentMode = "off";
  try {
    paymentMode = (await loadSettings(env)).paymentMode;
  } catch {
    // Already reported through `missing` above.
  }

  return json(
    {
      ok: missing.length === 0,
      missing,
      lessonTypes,
      emailMode: env.RESEND_API_KEY && env.EMAIL_DRY_RUN !== "1" ? "live" : "dry-run",
      paymentMode,
      stripe: stripeConfigured(env) ? (isTestMode(env) ? "test" : "live") : "not-configured",
      googleSignIn: env.GOOGLE_CLIENT_ID ? "configured" : "not-configured"
    },
    // A health check that always answers 200 cannot be alerted on. Nothing reads
    // the status code today — check-booking-link.mjs parses the body — so this
    // only adds a signal.
    missing.length === 0 ? 200 : 503,
    request,
    env
  );
}

/** Fire-and-forget: housekeeping must never delay or fail an availability read. */
function ctx_releaseHolds(env) {
  releaseExpiredHolds(env).catch((error) => console.error("release-holds", String(error?.message ?? error)));
}

async function handleAvailability(request, env, url) {
  const lessonTypeId = url.searchParams.get("lessonType") ?? "single";
  const lessonType = await loadLessonType(env, lessonTypeId);
  if (!lessonType) return fail("That lesson type is not available.", 400, request, env);

  const now = new Date();
  const fromKey = url.searchParams.get("from") || dateKey(now, PORTO);
  // Generous, because computeAvailability clamps to the booking horizon anyway.
  // A hard-coded default narrower than the horizon silently truncates the
  // answer for any caller that does not pass an explicit range.
  const toKey = url.searchParams.get("to") || addDaysToKey(fromKey, 140);
  if (!parseDateKey(fromKey) || !parseDateKey(toKey)) return fail("Invalid date range.", 400, request, env);

  ctx_releaseHolds(env);
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
  // Booking requires an account. Identity then comes from the signed-in
  // student rather than from whatever was typed into a form, so a person's
  // lessons stay together and /my-lessons can show all of them.
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in to book a lesson.", 401, request, env);

  const body = await readJson(request);
  const now = new Date();

  const notes = cleanText(body.notes, 1000);
  const location = body.location === "porto" ? "porto" : "online";
  const timezone = isValidTimeZone(body.timezone) ? body.timezone : student.timezone;

  const lessonType = await loadLessonType(env, cleanText(body.lessonType, 40) || "single");
  if (!lessonType) return fail("That lesson type is not available.", 400, request, env);

  // The trial is a first lesson, priced to make starting easy — not a discount
  // for people already having lessons. Anyone with a booking that wasn't
  // cancelled has started; a cancelled trial that never happened doesn't count
  // against booking another. (Dan, 28 August 2026.)
  if (lessonType.id === "trial") {
    const prior = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM bookings WHERE student_id = ? AND status != 'cancelled'"
    )
      .bind(student.id)
      .first();
    if ((prior?.n ?? 0) > 0) {
      return fail(
        "The trial is for your first lesson with Inês — you're past that! Book a single lesson instead.",
        400,
        request,
        env
      );
    }
  }

  // `null` is the deliberate open-ended choice and `undefined` is "not asked
  // for", so the two must not be collapsed. Anything else unrecognised is a
  // refusal rather than a silent fallback to a one-off.
  const wantsRepeat = "repeat" in body && body.repeat !== undefined;
  const repeatWeeks = wantsRepeat ? normaliseWeeks(body.repeat) : undefined;
  if (wantsRepeat && repeatWeeks === undefined) {
    return fail(`Choose ${SERIES_LENGTHS.join(", ")} weeks, or every week.`, 400, request, env);
  }

  // Cheap abuse guard: a real student does not book six lessons in a minute,
  // and without this one account can fill her whole calendar.
  // Counts booking *acts*, not rows. A twelve-week series writes twelve rows
  // for one decision, so its occurrences are excluded here and the series
  // itself is counted once — otherwise booking a term locks the student out of
  // their own calendar for an hour.
  const sinceIso = new Date(now.getTime() - 3600000).toISOString();
  const recent = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM bookings WHERE student_id = ?1 AND created_at > ?2 AND series_id IS NULL)
          + (SELECT COUNT(*) FROM booking_series WHERE student_id = ?1 AND created_at > ?2) AS acts,
            (SELECT COUNT(*) FROM bookings WHERE student_id = ?1 AND created_at > ?2) AS lessons`
  )
    .bind(student.id, sinceIso)
    .first();

  /*
   * Two bounds, because one act can write twelve rows. Counting only acts let a
   * single account take sixty lessons an hour through repeats; counting only
   * rows would lock someone out of their own term booking. So: five decisions,
   * and no more than about two terms' worth of lessons, in an hour.
   */
  if ((recent?.acts ?? 0) >= 5 || (recent?.lessons ?? 0) >= 26) {
    return fail("That's several bookings in a short time. Please email Inês directly instead.", 429, request, env);
  }

  const check = await isSlotBookable(env, { startAt: body.startAt, lessonType, now });
  if (!check.ok) return fail(check.reason, 409, request, env);

  const settings = await loadSettings(env);
  const prepay = settings.paymentMode === "prepay" && stripeConfigured(env);

  // A repeat under prepay charges the first lesson now — saving the card, with
  // Stripe's own consent wording — and each later lesson charges itself on its
  // own day. That covers the open-ended run too, so nothing is refused here.
  // (Dan, 28 August 2026: "maybe they prepay the first but the ones after that
  // should be automatic".)

  const id = crypto.randomUUID();
  const reference = bookingReference();
  const startsAt = new Date(body.startAt).toISOString();
  const timestamp = now.toISOString();
  // A little longer than Stripe's own session expiry, so the hold outlives
  // checkout rather than the other way round.
  const holdExpiresAt = new Date(now.getTime() + 35 * 60000).toISOString();

  const endsAt = check.endAt.toISOString();
  const claimed = await claimSlot(env, {
    columns: [
      "id", "reference", "lesson_type_id", "student_id", "student_name", "student_email", "student_phone",
      "student_timezone", "location", "notes", "starts_at", "ends_at", "status", "sequence", "created_at",
      "updated_at", "payment_status", "amount_cents", "hold_expires_at"
    ],
    values: [
      id,
      reference,
      lessonType.id,
      student.id,
      student.name,
      student.email,
      student.phone,
      timezone,
      location,
      notes,
      startsAt,
      endsAt,
      prepay ? "pending_payment" : "confirmed",
      0,
      timestamp,
      timestamp,
      prepay ? "pending" : "not_required",
      prepay ? lessonType.price_cents : null,
      prepay ? holdExpiresAt : null
    ],
    startAt: startsAt,
    endAt: endsAt,
    studentId: student.id
  });

  if (!claimed) {
    return fail("That time has just been taken. Please choose another.", 409, request, env);
  }

  // Keep the account's timezone in step with the browser it was booked from.
  if (timezone !== student.timezone) {
    await env.DB.prepare("UPDATE students SET timezone = ? WHERE id = ?").bind(timezone, student.id).run();
  }

  const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
  const token = await createManageToken(id, env.BOOKING_TOKEN_SECRET);
  const manageUrl = siteUrl(env, `/booking/?token=${encodeURIComponent(token)}`);

  // Prepay: the slot is held, not booked, and nothing is emailed until Stripe
  // says the money arrived. Confirming first and reconciling later is how you
  // end up telling a student they have a lesson they never paid for.
  // A repeat under prepay is handled below — the whole run goes in one checkout.
  if (prepay && !wantsRepeat) {
    try {
      const session = await createCheckoutSession(env, {
        booking: row,
        lessonType,
        customerEmail: student.email,
        successUrl: siteUrl(env, `/booking/?token=${encodeURIComponent(token)}&paid=1`),
        cancelUrl: siteUrl(env, "/book/?cancelled=1")
      });

      await env.DB.prepare("UPDATE bookings SET stripe_session_id = ? WHERE id = ?").bind(session.id, id).run();

      // Hosted checkout answers with a URL to send the student to; embedded
      // answers with a client secret the page mounts Stripe's form from.
      return json(
        {
          booking: publicBooking(row, lessonType, settings),
          ...(session.url ? { checkoutUrl: session.url } : { checkoutClientSecret: session.client_secret })
        },
        201,
        request,
        env
      );
    } catch (error) {
      // Never leave a dead hold behind when checkout could not even be created.
      await env.DB.prepare("DELETE FROM bookings WHERE id = ?").bind(id).run();
      console.error("stripe-checkout", String(error?.message ?? error));
      return fail("We couldn't start the payment. Please try again in a moment.", 502, request, env);
    }
  }

  // A repeat is created only once the first lesson is real, so a failure part
  // way through leaves a booked lesson rather than a series pointing at nothing.
  if (wantsRepeat) {
    const slot = slotOf(startsAt);
    const seriesId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO booking_series (id, student_id, lesson_type_id, location, notes, weekday, minute_of_day,
         occurrences, status, filled_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
    )
      .bind(
        seriesId,
        student.id,
        lessonType.id,
        location,
        notes,
        slot.weekday,
        slot.minuteOfDay,
        repeatWeeks,
        slot.dateKey,
        timestamp,
        timestamp
      )
      .run();

    await env.DB.prepare("UPDATE bookings SET series_id = ? WHERE id = ?").bind(seriesId, id).run();
    const series = await env.DB.prepare("SELECT * FROM booking_series WHERE id = ?").bind(seriesId).first();

    // The lesson just booked is the first occurrence, so the rest start a week on.
    const remaining = (repeatWeeks ?? OPEN_ENDED_HORIZON_WEEKS) - 1;
    const filled =
      remaining > 0
        ? await fillSeries(env, {
            series,
            student,
            lessonType,
            fromKey: addDaysToKey(slot.dateKey, 7),
            count: remaining,
            now,
            // Under prepay the whole run is held until the first lesson's
            // payment lands; the webhook then flips the rest to 'scheduled'.
            paymentState: prepay ? "hold" : "none",
            holdExpiresAt: prepay ? holdExpiresAt : null
          })
        : { rows: [], skipped: [] };

    const first = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
    const allRows = [first, ...filled.rows];

    const seriesPayload = {
      id: seriesId,
      weeks: repeatWeeks,
      openEnded: repeatWeeks === null,
      booked: allRows.map((occurrence) => occurrence.starts_at),
      skipped: filled.skipped.map((occurrence) => occurrence.startAt)
    };

    if (prepay) {
      try {
        // The first lesson is the only charge now; paying it saves the card
        // that every later lesson in the run charges itself to.
        const session = await createCheckoutSession(env, {
          booking: first,
          lessonType,
          customerEmail: student.email,
          saveCard: true,
          seriesId,
          successUrl: siteUrl(env, "/my-lessons/?paid=1"),
          cancelUrl: siteUrl(env, "/book/?cancelled=1"),
          skippedStartAts: filled.skipped.map((occurrence) => occurrence.startAt)
        });

        await env.DB.prepare("UPDATE bookings SET stripe_session_id = ? WHERE series_id = ? OR id = ?")
          .bind(session.id, seriesId, id)
          .run();

        // Emails wait for the webhook; the run isn't real until it's paid.
        return json(
          {
            booking: publicBooking(first, lessonType, settings),
            manageUrl,
            manageToken: token,
            series: seriesPayload,
            ...(session.url ? { checkoutUrl: session.url } : { checkoutClientSecret: session.client_secret })
          },
          201,
          request,
          env
        );
      } catch (error) {
        // Never leave a run of dead holds behind when checkout couldn't start.
        await env.DB.prepare("DELETE FROM bookings WHERE series_id = ? OR id = ?").bind(seriesId, id).run();
        await env.DB.prepare("DELETE FROM booking_series WHERE id = ?").bind(seriesId).run();
        console.error("stripe-series-checkout", String(error?.message ?? error));
        return fail("We couldn't start the payment. Please try again in a moment.", 502, request, env);
      }
    }

    const manageUrls = {};
    for (const occurrence of allRows) {
      const occurrenceToken = await createManageToken(occurrence.id, env.BOOKING_TOKEN_SECRET);
      manageUrls[occurrence.id] = siteUrl(env, `/booking/?token=${encodeURIComponent(occurrenceToken)}`);
    }

    ctx.waitUntil(
      notifySeries(env, { rows: allRows, lessonType, settings, series, manageUrls, skipped: filled.skipped })
    );

    return json(
      {
        booking: publicBooking(first, lessonType, settings),
        manageUrl,
        manageToken: token,
        series: seriesPayload
      },
      201,
      request,
      env
    );
  }

  ctx.waitUntil(notify(env, { event: "booked", row, lessonType, settings, manageUrl }));

  return json(
    { booking: publicBooking(row, lessonType, settings), manageUrl, manageToken: token },
    201,
    request,
    env
  );
}

/**
 * Insert one occurrence of a series. Deliberately the same shape of row as a
 * one-off booking, carrying only `series_id` extra — everything downstream
 * treats it as an ordinary lesson, which is what makes moving or cancelling a
 * single week work without any special case.
 */
/**
 * `paymentState` is the world the occurrence is born into: 'none' for a run
 * from before prepay, 'hold' while its run's first checkout is still open, and
 * 'scheduled' for a lesson that will charge the saved card on its own day.
 */
async function insertOccurrence(env, { seriesId, student, lessonType, timezone, location, notes, startAt, endAt, now, paymentState = "none", holdExpiresAt = null }) {
  const id = crypto.randomUUID();
  const timestamp = now.toISOString();
  const startsAt = new Date(startAt).toISOString();
  const endsAt = new Date(endAt).toISOString();

  const claimed = await claimSlot(env, {
    columns: [
      "id", "reference", "lesson_type_id", "student_id", "student_name", "student_email", "student_phone",
      "student_timezone", "location", "notes", "starts_at", "ends_at", "status", "sequence", "created_at",
      "updated_at", "payment_status", "amount_cents", "hold_expires_at", "series_id"
    ],
    values: [
      id,
      bookingReference(),
      lessonType.id,
      student.id,
      student.name,
      student.email,
      student.phone,
      timezone,
      location,
      notes,
      startsAt,
      endsAt,
      paymentState === "hold" ? "pending_payment" : "confirmed",
      0,
      timestamp,
      timestamp,
      paymentState === "hold" ? "pending" : paymentState === "scheduled" ? "scheduled" : "not_required",
      paymentState === "none" ? null : lessonType.price_cents,
      paymentState === "hold" ? holdExpiresAt : null,
      seriesId
    ],
    startAt: startsAt,
    endAt: endsAt,
    studentId: student.id
  });

  // Losing the race is a skipped week, not a failed booking: the rest of the
  // run is still worth having, and the student is told which weeks were missed.
  if (!claimed) return null;

  return env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
}

/**
 * Fill a series forward, skipping any week that is not free.
 *
 * `filled_to` moves to the last week *considered*, not the last one booked, so
 * a skipped week is never reconsidered on the next top-up and the run cannot
 * stall on it forever.
 */
async function fillSeries(env, { series, student, lessonType, fromKey, count, now, paymentState = "none", holdExpiresAt = null }) {
  const { bookable, skipped } = await planOccurrences(env, {
    fromKey,
    minuteOfDay: series.minute_of_day,
    count,
    lessonType,
    now
  });

  const rows = [];
  const lost = [];
  for (const occurrence of bookable) {
    const row = await insertOccurrence(env, {
      seriesId: series.id,
      student,
      lessonType,
      timezone: student.timezone,
      location: series.location,
      notes: series.notes,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      now,
      paymentState,
      holdExpiresAt
    });

    if (row) rows.push(row);
    else lost.push({ key: occurrence.key, startAt: occurrence.startAt.toISOString(), reason: "Taken while booking." });

    /*
     * The bookmark moves with each occurrence, not once at the end. Advancing it
     * only after the loop meant a run that died half way left rows committed and
     * `filled_to` untouched — so the next night replanned the same weeks, found
     * its own bookings in the way, and emailed the student and Inês to say those
     * lessons had been "left out". They were in the calendar the whole time.
     */
    await env.DB.prepare("UPDATE booking_series SET filled_to = ?, updated_at = ? WHERE id = ?")
      .bind(occurrence.key, now.toISOString(), series.id)
      .run();
  }

  const allSkipped = [...skipped, ...lost];
  const considered = [...bookable.map((o) => o.key), ...skipped.map((o) => o.key)].sort();
  const lastConsidered = considered[considered.length - 1] ?? series.filled_to;
  if (lastConsidered) {
    await env.DB.prepare("UPDATE booking_series SET filled_to = ?, updated_at = ? WHERE id = ?")
      .bind(lastConsidered, now.toISOString(), series.id)
      .run();
  }

  return { rows, skipped: allSkipped };
}

/**
 * What a repeat would actually book, without booking it.
 *
 * The student sees the skipped weeks before they commit rather than after, so
 * "eight weeks" never quietly turns into seven in their inbox.
 */
async function handleSeriesPreview(request, env) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in to book a lesson.", 401, request, env);

  const body = await readJson(request);
  const weeks = normaliseWeeks(body.weeks);
  if (weeks === undefined) {
    return fail(`Choose ${SERIES_LENGTHS.join(", ")} weeks, or every week.`, 400, request, env);
  }

  const lessonType = await loadLessonType(env, cleanText(body.lessonType, 40) || "single");
  if (!lessonType) return fail("That lesson type is not available.", 400, request, env);

  const start = new Date(body.startAt);
  if (Number.isNaN(start.getTime())) return fail("That time could not be understood.", 400, request, env);

  const slot = slotOf(start);
  const now = new Date();
  const count = weeks ?? OPEN_ENDED_HORIZON_WEEKS;

  const { bookable, skipped } = await planOccurrences(env, {
    fromKey: slot.dateKey,
    minuteOfDay: slot.minuteOfDay,
    count,
    lessonType,
    now
  });

  return json(
    {
      weeks,
      openEnded: weeks === null,
      bookable: bookable.map((o) => o.startAt.toISOString()),
      skipped: skipped.map((o) => o.startAt)
    },
    200,
    request,
    env
  );
}

/**
 * Stop a series. The lessons already booked are left alone unless the student
 * asks for them too: someone who wants to stop repeating usually still intends
 * to come to the ones in their calendar, and silently cancelling those would be
 * the worse mistake of the two.
 */
async function handleStopSeries(request, env, ctx, seriesId) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in.", 401, request, env);

  const series = await env.DB.prepare("SELECT * FROM booking_series WHERE id = ? AND student_id = ?")
    .bind(seriesId, student.id)
    .first();
  if (!series) return fail("That repeating booking could not be found.", 404, request, env);

  const body = await readJson(request);
  const cancelRemaining = body.cancelRemaining === true;
  const now = new Date();

  await env.DB.prepare("UPDATE booking_series SET status = 'ended', ended_at = ?, updated_at = ? WHERE id = ?")
    .bind(now.toISOString(), now.toISOString(), seriesId)
    .run();

  let cancelled = 0;
  if (cancelRemaining) {
    const { results } = await env.DB.prepare(
      "SELECT * FROM bookings WHERE series_id = ? AND status = 'confirmed' AND starts_at > ? ORDER BY starts_at"
    )
      .bind(seriesId, now.toISOString())
      .all();

    const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
      .bind(series.lesson_type_id)
      .first();
    const settings = await loadSettings(env);

    const cancelledRows = [];
    for (const row of results ?? []) {
      await env.DB.prepare(
        "UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancelled_by = 'student', sequence = sequence + 1, updated_at = ? WHERE id = ?"
      )
        .bind(now.toISOString(), now.toISOString(), row.id)
        .run();
      cancelledRows.push(await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first());
      cancelled += 1;
    }

    // One message each way, not one per lesson: a dozen occurrences used to mean
    // two dozen simultaneous requests to the mail provider, and its rate limit
    // drops most of them without saying so.
    if (cancelledRows.length) {
      ctx.waitUntil(notifySeriesCancelled(env, { rows: cancelledRows, lessonType, settings }));
    }
  }

  return json({ ok: true, stopped: true, cancelled }, 200, request, env);
}

async function handleGetBooking(request, env, token) {
  const row = await getBookingByToken(env, token);
  if (!row) return fail("That booking link is not valid.", 404, request, env);

  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();
  const settings = await loadSettings(env);

  const policy = changePolicy(row);

  return json(
    {
      booking: publicBooking(row, lessonType, settings),
      isPast: new Date(row.starts_at) <= new Date(),
      // Fee terms only apply to bookings from before prepay; a paid lesson is
      // simply locked on its day instead.
      sameDayFeeApplies: !policy.paid && policy.sameDay,
      changeLocked: policy.locked,
      refundOnCancel: policy.refundOnCancel
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

  // A paid lesson is locked on its own Porto day: it happens or it's forfeit.
  if (changePolicy(row, now).locked) {
    return fail(
      "This lesson is today, so it can't be moved. If something has happened, reply to your confirmation email and Inês will help.",
      409,
      request,
      env
    );
  }

  const body = await readJson(request);
  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();

  const check = await isSlotBookable(env, { startAt: body.startAt, lessonType, now, ignoreBookingId: row.id });
  if (!check.ok) return fail(check.reason, 409, request, env);

  // The fee is for changing on the lesson's own Porto date, judged against the
  // lesson they are moving away from.
  const sameDay = dateKey(now, PORTO) === dateKey(new Date(row.starts_at), PORTO) ? 1 : 0;
  const startsAt = new Date(body.startAt).toISOString();
  const endsAt = check.endAt.toISOString();

  // Same gap as creating a booking: the check above and this write are two
  // statements, and a lesson can be claimed between them.
  /*
   * The row must still be exactly where the handler found it. Six round trips
   * happen between reading it and writing it, and without these two extra
   * conditions both of the obvious races land: a cancel arriving in that window
   * was overwritten — the lesson moved after it was cancelled, and the calendar
   * invite brought it back — and two simultaneous moves both reported success
   * while only one of them was true.
   */
  const moved = await env.DB.prepare(
    `UPDATE bookings SET starts_at = ?, ends_at = ?, previous_starts_at = ?, sequence = sequence + 1,
       reschedule_count = reschedule_count + 1, same_day_change = ?, updated_at = ?
     WHERE id = ?
       AND status = 'confirmed'
       AND starts_at = ?
       AND NOT EXISTS (
         SELECT 1 FROM bookings other
         WHERE other.status IN ('confirmed', 'pending_payment')
           AND other.id != bookings.id
           AND other.starts_at < ? AND other.ends_at > ?
       )`
  )
    .bind(startsAt, endsAt, row.starts_at, sameDay, now.toISOString(), row.id, row.starts_at, endsAt, startsAt)
    .run();

  if ((moved?.meta?.changes ?? 0) === 0) {
    // Say which it was, rather than blaming the slot for a cancellation.
    const current = await env.DB.prepare("SELECT status FROM bookings WHERE id = ?").bind(row.id).first();
    if (current?.status === "cancelled") {
      return fail("That lesson has been cancelled, so it can't be moved.", 409, request, env);
    }
    return fail("That lesson has just changed. Please reload and try again.", 409, request, env);
  }

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
  const policy = changePolicy(row, now);

  if (policy.locked) {
    return fail(
      "This lesson is today, so it can't be cancelled. If something has happened, reply to your confirmation email and Inês will help.",
      409,
      request,
      env
    );
  }

  /*
   * Refund before cancelling, never after: a cancelled row with money still
   * held is a promise broken quietly, while a refunded row that failed to
   * cancel is retried by the student and Stripe answers "already refunded" —
   * which is treated as success below, so the retry completes the cancel.
   */
  const refunded = policy.refundOnCancel ? 1 : 0;
  if (policy.refundOnCancel) {
    try {
      await refundPayment(env, row.stripe_payment_intent, row.amount_cents ?? undefined);
    } catch (error) {
      const message = String(error?.message ?? error);
      if (!/already been refunded|charge_already_refunded/i.test(message)) {
        console.error("stripe-refund", row.reference, message);
        return fail("We couldn't process the refund just now, so nothing was cancelled. Please try again in a moment.", 502, request, env);
      }
    }
  }

  const sameDay = policy.paid ? 0 : dateKey(now, PORTO) === dateKey(new Date(row.starts_at), PORTO) ? 1 : 0;

  await env.DB.prepare(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancelled_by = 'student',
       sequence = sequence + 1, same_day_change = ?, updated_at = ?,
       payment_status = CASE WHEN ? = 1 THEN 'refunded' ELSE payment_status END
     WHERE id = ?`
  )
    .bind(now.toISOString(), sameDay, now.toISOString(), refunded, row.id)
    .run();

  const updated = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?").bind(row.lesson_type_id).first();
  const settings = await loadSettings(env);

  ctx.waitUntil(notify(env, { event: "cancelled", row: updated, lessonType, settings, manageUrl: "" }));

  return json({ booking: publicBooking(updated, lessonType, settings), sameDayFeeApplied: Boolean(sameDay) }, 200, request, env);
}


// --- Stripe -----------------------------------------------------------------

/**
 * Confirms a booking once Stripe says the money arrived.
 *
 * Nothing here trusts the request until the signature verifies, and nothing
 * runs twice: Stripe delivers at least once, so the event id is recorded first
 * and a repeat stops there. A 200 is returned even for events we ignore, or
 * Stripe retries them for 24 hours.
 */
async function handleStripeWebhook(request, env, ctx) {
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response("Not configured.", { status: 503 });

  const payload = await request.text();
  const verified = await verifyWebhook(payload, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!verified) return new Response("Bad signature.", { status: 400 });

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Bad payload.", { status: 400 });
  }

  try {
    await env.DB.prepare("INSERT INTO stripe_events (id, type, processed_at) VALUES (?, ?, ?)")
      .bind(event.id, event.type, new Date().toISOString())
      .run();
  } catch {
    return new Response("Already handled.", { status: 200 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response("Ignored.", { status: 200 });
  }

  const session = event.data?.object ?? {};
  const bookingId = session.client_reference_id;
  if (!bookingId) return new Response("No booking reference.", { status: 200 });

  // One payment for a whole run: every held occurrence confirms together.
  if (session.metadata?.series_id) {
    return await confirmPaidSeries(env, ctx, session);
  }

  const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(bookingId).first();
  if (!row) return new Response("Unknown booking.", { status: 200 });

  // An already-confirmed lesson paying by link — after a declined automatic
  // charge — just settles up: mark it paid and say thank you, quietly.
  if (row.status === "confirmed") {
    if (row.payment_status === "payment_due" || row.payment_status === "scheduled") {
      await env.DB.prepare(
        "UPDATE bookings SET payment_status = 'paid', stripe_payment_intent = ?, updated_at = ? WHERE id = ? AND payment_status != 'paid'"
      )
        .bind(session.payment_intent ?? null, new Date().toISOString(), bookingId)
        .run();

      const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
        .bind(row.lesson_type_id)
        .first();
      const settings = await loadSettings(env);
      ctx.waitUntil(
        deliver(env, {
          to: row.student_email,
          subject: `Paid — thank you`,
          kind: "student_payment_received",
          bookingId: row.id,
          dedupeKey: `link-paid:${row.id}`,
          replyTo: settings.replyToEmail || env.TEACHER_EMAIL || settings.teacherEmail || undefined,
          content: {
            heading: "Paid — thank you",
            preheader: `${lessonType?.name ?? "Lesson"} · ${row.reference}`,
            intro: `Olá ${row.student_name.split(" ")[0]}, that's settled — thank you. Nothing else to do.`,
            callout: "",
            rows: [{ label: "Reference", value: row.reference }],
            action: null,
            footer: "Sent automatically by the booking system on portuguesewithines.com."
          }
        })
      );
      return new Response("ok", { status: 200 });
    }
    return new Response("Already confirmed.", { status: 200 });
  }

  await env.DB.prepare(
    `UPDATE bookings SET status = 'confirmed', payment_status = 'paid', stripe_payment_intent = ?,
       hold_expires_at = NULL, updated_at = ? WHERE id = ?`
  )
    .bind(session.payment_intent ?? null, new Date().toISOString(), bookingId)
    .run();

  const confirmed = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(bookingId).first();
  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
    .bind(confirmed.lesson_type_id)
    .first();
  const settings = await loadSettings(env);
  const token = await createManageToken(bookingId, env.BOOKING_TOKEN_SECRET);

  ctx.waitUntil(
    notify(env, {
      event: "booked",
      row: confirmed,
      lessonType,
      settings,
      manageUrl: siteUrl(env, `/booking/?token=${encodeURIComponent(token)}`)
    })
  );

  return new Response("ok", { status: 200 });
}

/**
 * Confirms every occurrence of a prepaid run once its one payment lands.
 *
 * Idempotent the same way the single path is: rows already confirmed are left
 * alone, and a repeat delivery finds nothing pending and stops. The skipped
 * weeks note rides in on checkout metadata, because by webhook time the
 * planning that produced it is long gone.
 */
async function confirmPaidSeries(env, ctx, session) {
  const seriesId = session.metadata.series_id;
  const series = await env.DB.prepare("SELECT * FROM booking_series WHERE id = ?").bind(seriesId).first();
  if (!series) return new Response("Unknown series.", { status: 200 });

  const now = new Date().toISOString();
  const firstId = session.client_reference_id;

  // Only the first lesson was charged; it confirms as paid. The rest confirm
  // as 'scheduled' — each will charge the saved card on its own day.
  const paidFirst = await env.DB.prepare(
    `UPDATE bookings SET status = 'confirmed', payment_status = 'paid', stripe_payment_intent = ?,
       hold_expires_at = NULL, updated_at = ?
     WHERE id = ? AND status = 'pending_payment'`
  )
    .bind(session.payment_intent ?? null, now, firstId)
    .run();

  if ((paidFirst?.meta?.changes ?? 0) === 0) return new Response("Already confirmed.", { status: 200 });

  await env.DB.prepare(
    `UPDATE bookings SET status = 'confirmed', payment_status = 'scheduled',
       hold_expires_at = NULL, updated_at = ?
     WHERE series_id = ? AND status = 'pending_payment'`
  )
    .bind(now, seriesId)
    .run();

  await env.DB.prepare("UPDATE booking_series SET prepaid = 1, updated_at = ? WHERE id = ?")
    .bind(now, seriesId)
    .run();

  // The saved card lives behind the payment intent: Stripe's customer and
  // payment-method ids go on the student so later lessons — and later runs —
  // can charge without them present. Failure here is logged, not fatal: the
  // run is real either way, and a missing card surfaces as a normal declined
  // charge with a pay-now link when the first automatic charge is attempted.
  if (session.payment_intent) {
    try {
      const intent = await retrievePaymentIntent(env, session.payment_intent);
      const paymentMethod = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
      const customer = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
      if (customer && paymentMethod) {
        await env.DB.prepare("UPDATE students SET stripe_customer_id = ?, stripe_payment_method = ? WHERE id = ?")
          .bind(customer, paymentMethod, series.student_id)
          .run();
      }
    } catch (error) {
      console.error("save-card", seriesId, String(error?.message ?? error));
    }
  }

  const { results: rows } = await env.DB.prepare(
    "SELECT * FROM bookings WHERE series_id = ? AND status = 'confirmed' ORDER BY starts_at"
  )
    .bind(seriesId)
    .all();
  const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
    .bind(series.lesson_type_id)
    .first();
  const settings = await loadSettings(env);

  let skipped = [];
  try {
    skipped = JSON.parse(session.metadata.skipped ?? "[]").map((startAt) => ({ startAt }));
  } catch {
    skipped = [];
  }

  const manageUrls = {};
  for (const occurrence of rows) {
    const occurrenceToken = await createManageToken(occurrence.id, env.BOOKING_TOKEN_SECRET);
    manageUrls[occurrence.id] = siteUrl(env, `/booking/?token=${encodeURIComponent(occurrenceToken)}`);
  }

  ctx.waitUntil(notifySeries(env, { rows, lessonType, settings, series, manageUrls, skipped }));

  return new Response("ok", { status: 200 });
}

/**
 * Releases slots whose checkout was abandoned.
 *
 * Called opportunistically rather than on a schedule: availability already
 * ignores an expired hold, so this is only housekeeping to stop the table
 * filling with dead rows.
 */
async function releaseExpiredHolds(env) {
  await env.DB.prepare(
    "DELETE FROM bookings WHERE status = 'pending_payment' AND hold_expires_at IS NOT NULL AND hold_expires_at < ?"
  )
    .bind(new Date().toISOString())
    .run();

  // A prepaid run whose checkout was abandoned leaves a series row with no
  // bookings once the holds above are swept; without this it lingers forever.
  await env.DB.prepare(
    `DELETE FROM booking_series WHERE id IN (
       SELECT s.id FROM booking_series s
       LEFT JOIN bookings b ON b.series_id = s.id
       WHERE b.id IS NULL
     )`
  ).run();
}

// --- Accounts ---------------------------------------------------------------

async function handleRegister(request, env) {
  const body = await readJson(request);
  const email = normaliseEmail(body.email);
  const name = cleanText(body.name, 120);
  const phone = cleanText(body.phone, 40);
  const timezone = isValidTimeZone(body.timezone) ? body.timezone : PORTO;

  if (name.length < 2) return fail("Please give your name.", 400, request, env);
  if (!isEmail(email)) return fail("Please give a valid email address.", 400, request, env);

  const problem = passwordProblem(body.password);
  if (problem) return fail(problem, 400, request, env);

  const existing = await env.DB.prepare("SELECT id FROM students WHERE email = ?").bind(email).first();
  if (existing) {
    return fail("There is already an account with that email. Try signing in instead.", 409, request, env);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO students (id, email, name, phone, timezone, password_hash, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(id, email, name, phone, timezone, await hashPassword(body.password), now, now)
    .run();

  const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(id).first();
  return json(
    { student: publicStudent(student), session: await createSession(id, env.BOOKING_TOKEN_SECRET) },
    201,
    request,
    env
  );
}

async function handleLogin(request, env) {
  const body = await readJson(request);
  const email = normaliseEmail(body.email);

  if (!isEmail(email)) return fail("Please give a valid email address.", 400, request, env);

  if (await tooManyFailures(env, email)) {
    return fail("Too many attempts. Please wait a few minutes and try again.", 429, request, env);
  }

  const student = await env.DB.prepare("SELECT * FROM students WHERE email = ?").bind(email).first();

  // One message for both cases, so this cannot be used to discover which
  // addresses have accounts. The password is still verified against a dummy
  // hash when there is no account, so the reply takes the same time either way.
  const stored = student?.password_hash ?? "pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const correct = await verifyPassword(String(body.password ?? ""), stored);

  if (!student || !correct) {
    await recordFailure(env, email);
    return fail("That email and password do not match.", 401, request, env);
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE students SET last_login_at = ? WHERE id = ?").bind(new Date().toISOString(), student.id),
    env.DB.prepare("DELETE FROM login_attempts WHERE email = ?").bind(email)
  ]);

  return json(
    { student: publicStudent(student), session: await createSession(student.id, env.BOOKING_TOKEN_SECRET) },
    200,
    request,
    env
  );
}

/**
 * Signs in with a Google ID token, creating the account on first use.
 *
 * Matching is by verified email, so someone who registered with a password and
 * later uses Google lands on the same account and sees the same lessons, rather
 * than quietly acquiring a second one.
 */
async function handleGoogleSignIn(request, env) {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) return fail("Google sign-in is not configured.", 503, request, env);

  const body = await readJson(request);
  const profile = await verifyGoogleIdToken(body.credential, clientId);
  if (!profile) return fail("That Google sign-in could not be verified. Please try again.", 401, request, env);

  const now = new Date().toISOString();

  /*
   * The Google account id first, the address only as a fallback.
   *
   * Matching on email alone and then overwriting google_sub was an account
   * takeover waiting to happen: anyone who could point their own row at an
   * address someone else uses with Google would receive that person's account
   * on their next sign-in, and keep a password on it afterwards. `sub` is the
   * identifier Google actually promises is stable and unique to one account.
   * Email remains the fallback so someone who registered with a password and
   * later uses Google still lands on their own account — but only when that
   * row is not already claimed by a different Google account.
   */
  let student = await env.DB.prepare("SELECT * FROM students WHERE google_sub = ?").bind(profile.sub).first();

  if (!student) {
    const byEmail = await env.DB.prepare("SELECT * FROM students WHERE email = ?").bind(profile.email).first();
    if (byEmail?.google_sub && byEmail.google_sub !== profile.sub) {
      return fail(
        "That address is already linked to a different Google account. Please sign in with your password.",
        409,
        request,
        env
      );
    }
    student = byEmail ?? null;
  }

  if (student) {
    // The address is deliberately not rewritten here. A student who changed it
    // on the site means that change to stand, and forcing it back to whatever
    // Google holds would both undo them and collide with the unique index.
    await env.DB.prepare("UPDATE students SET google_sub = ?, last_login_at = ? WHERE id = ?")
      .bind(profile.sub, now, student.id)
      .run();
    student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(student.id).first();
  } else {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO students (id, email, name, phone, timezone, password_hash, google_sub, created_at, last_login_at)
       VALUES (?, ?, ?, '', ?, '', ?, ?, ?)`
    )
      .bind(
        id,
        profile.email,
        profile.name || profile.email.split("@")[0],
        isValidTimeZone(body.timezone) ? body.timezone : PORTO,
        profile.sub,
        now,
        now
      )
      .run();
    student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(id).first();
  }

  return json(
    { student: publicStudent(student), session: await createSession(student.id, env.BOOKING_TOKEN_SECRET) },
    200,
    request,
    env
  );
}

async function handleForgot(request, env, ctx) {
  const body = await readJson(request);
  const email = normaliseEmail(body.email);
  const student = isEmail(email)
    ? await env.DB.prepare("SELECT * FROM students WHERE email = ?").bind(email).first()
    : null;

  if (student) {
    const token = await createResetToken(student.id, env.BOOKING_TOKEN_SECRET);
    const nonce = token.split(".")[2];
    await env.DB.prepare("INSERT OR REPLACE INTO password_resets (nonce, student_id, created_at) VALUES (?, ?, ?)")
      .bind(nonce, student.id, new Date().toISOString())
      .run();

    const settings = await loadSettings(env);
    const resetUrl = siteUrl(env, `/reset-password/?token=${encodeURIComponent(token)}`);

    ctx.waitUntil(
      deliver(env, {
        to: student.email,
        subject: "Reset your password — Português com a Inês",
        kind: "password_reset",
        dedupeKey: `reset:${nonce}`,
        replyTo: settings.replyToEmail || env.TEACHER_EMAIL || settings.teacherEmail || undefined,
        content: {
          heading: "Reset your password",
          preheader: "Choose a new password — the link works for one hour.",
          intro: `Olá ${student.name.split(" ")[0]}, use the button below to choose a new password. The link works for one hour, and only once.`,
          callout: "",
          rows: [],
          action: { label: "Choose a new password", url: resetUrl },
          footer: "If you didn't ask for this, you can ignore it — your password has not changed."
        }
      })
    );
  }

  // Always the same answer, whether or not the address has an account.
  return json({ ok: true }, 200, request, env);
}

async function handleReset(request, env) {
  const body = await readJson(request);
  const parsed = await readResetToken(body.token, env.BOOKING_TOKEN_SECRET);
  if (!parsed) return fail("That reset link has expired. Please request a new one.", 400, request, env);

  const problem = passwordProblem(body.password);
  if (problem) return fail(problem, 400, request, env);

  // Single use: the row is the record that this token has not been spent.
  const record = await env.DB.prepare("SELECT * FROM password_resets WHERE nonce = ? AND student_id = ?")
    .bind(parsed.nonce, parsed.studentId)
    .first();
  if (!record) return fail("That reset link has already been used. Please request a new one.", 400, request, env);

  await env.DB.batch([
    env.DB.prepare("UPDATE students SET password_hash = ? WHERE id = ?").bind(
      await hashPassword(body.password),
      parsed.studentId
    ),
    env.DB.prepare("DELETE FROM password_resets WHERE nonce = ?").bind(parsed.nonce),
    env.DB.prepare("DELETE FROM login_attempts WHERE email = (SELECT email FROM students WHERE id = ?)").bind(
      parsed.studentId
    )
  ]);

  const student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(parsed.studentId).first();
  return json(
    { student: publicStudent(student), session: await createSession(student.id, env.BOOKING_TOKEN_SECRET) },
    200,
    request,
    env
  );
}

async function handleMe(request, env) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in.", 401, request, env);

  const settings = await loadSettings(env);
  const { results } = await env.DB.prepare(
    `SELECT b.*, l.name AS lesson_name, l.duration_minutes, l.price_cents
     FROM bookings b JOIN lesson_types l ON l.id = b.lesson_type_id
     WHERE b.student_id = ? ORDER BY b.starts_at DESC`
  )
    .bind(student.id)
    .all();

  const now = new Date();
  const bookings = await Promise.all(
    (results ?? []).map(async (row) => ({
      reference: row.reference,
      status: row.status,
      startAt: row.starts_at,
      endAt: row.ends_at,
      location: row.location,
      notes: row.notes,
      lessonType: {
        id: row.lesson_type_id,
        name: row.lesson_name,
        durationMinutes: row.duration_minutes,
        priceCents: row.price_cents
      },
      isPast: new Date(row.starts_at) <= now,
      sameDayFeeApplies: row.payment_status !== "paid" && dateKey(now, PORTO) === dateKey(new Date(row.starts_at), PORTO),
      changeLocked: changePolicy(row, now).locked,
      paymentStatus: row.payment_status,
      seriesId: row.series_id ?? null,
      manageToken: await createManageToken(row.id, env.BOOKING_TOKEN_SECRET)
    }))
  );

  // Only what the page needs to say "this repeats, and here is how to stop it".
  const { results: seriesRows } = await env.DB.prepare(
    `SELECT s.*, COUNT(b.id) AS upcoming
     FROM booking_series s
     LEFT JOIN bookings b
       ON b.series_id = s.id AND b.status = 'confirmed' AND b.starts_at > ?
     WHERE s.student_id = ? AND s.status = 'active'
     GROUP BY s.id`
  )
    .bind(now.toISOString(), student.id)
    .all();

  const series = (seriesRows ?? []).map((row) => ({
    id: row.id,
    weekday: row.weekday,
    minuteOfDay: row.minute_of_day,
    occurrences: row.occurrences ?? null,
    openEnded: row.occurrences === null,
    upcoming: row.upcoming ?? 0
  }));

  return json(
    { student: publicStudent(student), bookings, series, sameDayFeeCents: settings.sameDayChangeFeeCents },
    200,
    request,
    env
  );
}

/**
 * Ask to change the address you sign in with.
 *
 * Nothing moves here. The new address is only written once it has proved it
 * receives mail, because an address change that takes effect on assertion alone
 * is a way to point your account at somebody else's inbox — and, before the
 * Google matching fix that ships with this, a way to take their account.
 *
 * The answer is the same whether or not the address is already taken. Telling
 * the caller "that one exists" would turn this endpoint into a way to test
 * whether a given person has an account, which is the thing sign-in and
 * forgotten-password already go out of their way not to reveal.
 */
async function handleRequestEmailChange(request, env, ctx) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in.", 401, request, env);

  const body = await readJson(request);
  const email = normaliseEmail(body.email);
  if (!isEmail(email)) return fail("That email address doesn't look right.", 400, request, env);
  if (email === student.email) return fail("That's already your email address.", 400, request, env);

  const taken = await env.DB.prepare("SELECT id FROM students WHERE email = ?").bind(email).first();
  const now = new Date().toISOString();

  if (!taken) {
    const token = await createResetToken(student.id, env.BOOKING_TOKEN_SECRET);
    const nonce = token.split(".")[2];

    // One pending change per student: asking again replaces the last request
    // rather than leaving a second live link in a second inbox.
    await env.DB.prepare("DELETE FROM email_changes WHERE student_id = ?").bind(student.id).run();
    await env.DB.prepare(
      "INSERT INTO email_changes (nonce, student_id, new_email, created_at) VALUES (?, ?, ?, ?)"
    )
      .bind(nonce, student.id, email, now)
      .run();

    const settings = await loadSettings(env);
    const confirmUrl = siteUrl(env, `/my-lessons/?emailToken=${encodeURIComponent(token)}`);

    ctx.waitUntil(
      deliver(env, {
        to: email,
        subject: "Confirm your new email — Português com a Inês",
        kind: "email_change",
        dedupeKey: `email-change:${nonce}`,
        replyTo: settings.replyToEmail || env.TEACHER_EMAIL || settings.teacherEmail || undefined,
        content: {
          heading: "Confirm this address",
          preheader: "One click, and this becomes the address you sign in with.",
          intro: `Olá ${student.name.split(" ")[0]}, confirm this address and it becomes the one you sign in with and receive lesson emails at. The link works for one hour, and only once.`,
          callout: "",
          rows: [{ label: "New address", value: email }],
          action: { label: "Confirm this address", url: confirmUrl },
          footer: "If you didn't ask for this, ignore it — nothing has changed."
        }
      })
    );

    // And a word to the address on file, which is the one that would notice a
    // change nobody asked for.
    ctx.waitUntil(
      deliver(env, {
        to: student.email,
        subject: "Someone asked to change your email — Português com a Inês",
        kind: "email_change_notice",
        dedupeKey: `email-change-notice:${nonce}`,
        replyTo: settings.replyToEmail || env.TEACHER_EMAIL || settings.teacherEmail || undefined,
        content: {
          heading: "A change was requested",
          preheader: "Your address has not changed yet.",
          intro: `Olá ${student.name.split(" ")[0]}, someone signed in to your account and asked to move it to ${email}. Nothing has changed yet — it only takes effect if that address confirms.`,
          callout: "If this wasn't you, change your password now and tell Inês.",
          rows: [],
          action: null,
          footer: "Sent automatically by the booking system on portuguesewithines.com."
        }
      })
    );
  }

  return json({ ok: true, pending: email }, 200, request, env);
}

/**
 * Apply a change the new address has proved.
 *
 * Two loose ends are tidied here rather than left for later: any live password
 * reset is dropped, because a reset link already sitting in the old mailbox
 * would otherwise stay valid for its remaining hour and let whoever holds that
 * mailbox set a password on the account; and future lessons are re-addressed,
 * because that is where her confirmations and reminders are sent. Past and
 * cancelled lessons keep the address they were actually taken under — that is
 * the record of what happened, and rewriting it would be a small lie.
 */
async function handleConfirmEmailChange(request, env) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in.", 401, request, env);

  const body = await readJson(request);
  // readResetToken returns { studentId, nonce }, not a string. Comparing the
  // object to an id was never equal, so every confirmation was refused —
  // including the right person's, with a valid link. It failed closed, so it
  // was a dead feature rather than an open door, but it was completely dead.
  const parsed = await readResetToken(body.token, env.BOOKING_TOKEN_SECRET);
  if (!parsed || parsed.studentId !== student.id) {
    return fail("That link is no longer valid. Please ask for a new one.", 400, request, env);
  }

  const nonce = parsed.nonce;
  const pending = await env.DB.prepare("SELECT * FROM email_changes WHERE nonce = ? AND student_id = ?")
    .bind(nonce, student.id)
    .first();
  if (!pending) return fail("That link has already been used. Please ask for a new one.", 400, request, env);

  const now = new Date().toISOString();

  // Between the request and the click, someone else may have taken it.
  const taken = await env.DB.prepare("SELECT id FROM students WHERE email = ? AND id != ?")
    .bind(pending.new_email, student.id)
    .first();
  if (taken) {
    await env.DB.prepare("DELETE FROM email_changes WHERE nonce = ?").bind(nonce).run();
    return fail("That address is now in use on another account.", 409, request, env);
  }

  try {
    await env.DB.prepare("UPDATE students SET email = ? WHERE id = ?").bind(pending.new_email, student.id).run();
  } catch {
    await env.DB.prepare("DELETE FROM email_changes WHERE nonce = ?").bind(nonce).run();
    return fail("That address is now in use on another account.", 409, request, env);
  }

  await env.DB.prepare("DELETE FROM email_changes WHERE student_id = ?").bind(student.id).run();
  await env.DB.prepare("DELETE FROM password_resets WHERE student_id = ?").bind(student.id).run();
  await env.DB.prepare("DELETE FROM login_attempts WHERE email = ?").bind(student.email).run().catch(() => {});

  await env.DB.prepare(
    `UPDATE bookings SET student_email = ?, updated_at = ?
     WHERE student_id = ? AND status IN ('confirmed', 'pending_payment') AND starts_at > ?`
  )
    .bind(pending.new_email, now, student.id, now)
    .run();

  const updated = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(student.id).first();
  return json({ student: publicStudent(updated) }, 200, request, env);
}

async function handleUpdateMe(request, env) {
  const student = await currentStudent(request, env);
  if (!student) return fail("Please sign in.", 401, request, env);

  const body = await readJson(request);
  const name = cleanText(body.name, 120) || student.name;
  // "in body", not falsiness: a field that was not sent must keep its value,
  // while one sent empty is a student deliberately clearing it. Sending only a
  // name used to wipe the phone number without anyone noticing.
  const phone = "phone" in body ? cleanText(body.phone, 40) : student.phone;
  const timezone = isValidTimeZone(body.timezone) ? body.timezone : student.timezone;

  await env.DB.prepare("UPDATE students SET name = ?, phone = ?, timezone = ? WHERE id = ?")
    .bind(name, phone, timezone, student.id)
    .run();

  const updated = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(student.id).first();
  return json({ student: publicStudent(updated) }, 200, request, env);
}

/**
 * Either the shared token, or a signed-in teacher.
 *
 * The token stays as the way back in if she is ever locked out of her own
 * account; day to day she signs in as herself, which also means her actions are
 * attributable rather than anonymous.
 */
async function isAdmin(request, env) {
  const provided = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (env.ADMIN_TOKEN && safeEqual(provided, env.ADMIN_TOKEN)) return { via: "token", student: null };

  const student = await currentStudent(request, env);
  if (student?.role === "teacher") return { via: "account", student };

  return null;
}

async function handleAdmin(request, env, ctx, url, path) {
  const admin = await isAdmin(request, env);
  if (!admin) return fail("Not authorised.", 401, request, env);

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
      // The latest a lesson may begin, not when she finishes.
      const lastStart = Number(rule.lastStartMinute);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
      if (!Number.isInteger(start) || !Number.isInteger(lastStart)) continue;
      if (lastStart < start || start < 0 || lastStart > 1440) continue;
      statements.push(
        env.DB.prepare(
          "INSERT INTO availability_rules (weekday, start_minute, last_start_minute, active) VALUES (?, ?, ?, 1)"
        ).bind(weekday, start, lastStart)
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

  // --- Bookings on a student's behalf --------------------------------------

  if (request.method === "GET" && path === "/admin/students") {
    const { results } = await env.DB.prepare(
      "SELECT id, name, email, phone FROM students WHERE role = 'student' ORDER BY name"
    ).all();
    return json({ students: results ?? [] }, 200, request, env);
  }

  if (request.method === "POST" && path === "/admin/bookings") {
    const body = await readJson(request);
    const email = normaliseEmail(body.email);
    const name = cleanText(body.name, 120);
    if (!isEmail(email)) return fail("Please give the student's email address.", 400, request, env);

    const lessonType = await loadLessonType(env, cleanText(body.lessonType, 40) || "single");
    if (!lessonType) return fail("That lesson type is not available.", 400, request, env);

    const start = new Date(body.startAt);
    if (Number.isNaN(start.getTime())) return fail("That time could not be understood.", 400, request, env);
    const endsAt = new Date(start.getTime() + lessonType.duration_minutes * 60000);

    /*
     * Her own bookings are checked for clashes only — not against her published
     * hours or the notice window. Those exist to shape what students may choose;
     * she is the one who decides, and squeezing in a lesson outside them is a
     * normal thing for her to do. A double booking is never intended, so that
     * is still refused.
     */
    const clash = await env.DB.prepare(
      `SELECT reference FROM bookings
       WHERE status IN ('confirmed', 'pending_payment') AND ends_at > ? AND starts_at < ?`
    )
      .bind(start.toISOString(), endsAt.toISOString())
      .first();
    if (clash) return fail(`That overlaps an existing lesson (${clash.reference}).`, 409, request, env);

    let student = await env.DB.prepare("SELECT * FROM students WHERE email = ?").bind(email).first();
    const now = new Date().toISOString();

    if (!student) {
      // No password: the student sets one with "forgot password" when they
      // first want to manage the lesson themselves.
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO students (id, email, name, phone, timezone, password_hash, created_at)
         VALUES (?, ?, ?, '', ?, '', ?)`
      )
        .bind(id, email, name || email.split("@")[0], PORTO, now)
        .run();
      student = await env.DB.prepare("SELECT * FROM students WHERE id = ?").bind(id).first();
    }

    const id = crypto.randomUUID();
    const reference = bookingReference();
    await env.DB.prepare(
      `INSERT INTO bookings (id, reference, lesson_type_id, student_id, student_name, student_email, student_phone,
         student_timezone, location, notes, starts_at, ends_at, status, sequence, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 0, ?, ?)`
    )
      .bind(
        id,
        reference,
        lessonType.id,
        student.id,
        student.name,
        student.email,
        student.phone,
        student.timezone,
        body.location === "porto" ? "porto" : "online",
        cleanText(body.notes, 1000),
        start.toISOString(),
        endsAt.toISOString(),
        now,
        now
      )
      .run();

    const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first();
    const settings = await loadSettings(env);
    const token = await createManageToken(id, env.BOOKING_TOKEN_SECRET);

    // The student is told, exactly as if they had booked it themselves.
    ctx.waitUntil(
      notify(env, {
        event: "booked",
        row,
        lessonType,
        settings,
        manageUrl: siteUrl(env, `/booking/?token=${encodeURIComponent(token)}`)
      })
    );

    return json({ booking: publicBooking(row, lessonType, settings) }, 201, request, env);
  }

  const adminReschedule = path.match(/^\/admin\/bookings\/([^/]+)\/reschedule$/);
  if (adminReschedule && request.method === "POST") {
    const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(adminReschedule[1]).first();
    if (!row) return fail("That booking could not be found.", 404, request, env);

    const body = await readJson(request);
    const start = new Date(body.startAt);
    if (Number.isNaN(start.getTime())) return fail("That time could not be understood.", 400, request, env);

    const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
      .bind(row.lesson_type_id)
      .first();
    const endsAt = new Date(start.getTime() + lessonType.duration_minutes * 60000);

    const clash = await env.DB.prepare(
      `SELECT reference FROM bookings
       WHERE id != ? AND status IN ('confirmed', 'pending_payment') AND ends_at > ? AND starts_at < ?`
    )
      .bind(row.id, start.toISOString(), endsAt.toISOString())
      .first();
    if (clash) return fail(`That overlaps an existing lesson (${clash.reference}).`, 409, request, env);

    const now = new Date();
    await env.DB.prepare(
      `UPDATE bookings SET starts_at = ?, ends_at = ?, previous_starts_at = ?, sequence = sequence + 1,
         reschedule_count = reschedule_count + 1, same_day_change = 0, updated_at = ? WHERE id = ?`
    )
      .bind(start.toISOString(), endsAt.toISOString(), row.starts_at, now.toISOString(), row.id)
      .run();

    const updated = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
    const settings = await loadSettings(env);
    const token = await createManageToken(row.id, env.BOOKING_TOKEN_SECRET);

    ctx.waitUntil(
      notify(env, {
        event: "rescheduled",
        row: updated,
        lessonType,
        settings,
        manageUrl: siteUrl(env, `/booking/?token=${encodeURIComponent(token)}`),
        previousStartsAt: row.starts_at,
        // She moved it, not them. Without this the student is thanked for a
        // change they did not make, and she is told they made it.
        byTeacher: true
      })
    );

    return json({ booking: publicBooking(updated, lessonType, settings) }, 200, request, env);
  }

  const adminCancel = path.match(/^\/admin\/bookings\/([^/]+)\/cancel$/);
  if (adminCancel && request.method === "POST") {
    const row = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(adminCancel[1]).first();
    if (!row) return fail("That booking could not be found.", 404, request, env);
    if (row.status === "cancelled") return fail("That lesson is already cancelled.", 409, request, env);

    // Her cancellation always refunds a paid lesson — same-day included. A
    // student loses the change window on the lesson day; she never does, and
    // the money follows automatically so there is nothing to remember.
    const refunded = row.payment_status === "paid" && row.stripe_payment_intent ? 1 : 0;
    if (refunded) {
      try {
        await refundPayment(env, row.stripe_payment_intent, row.amount_cents ?? undefined);
      } catch (error) {
        const message = String(error?.message ?? error);
        if (!/already been refunded|charge_already_refunded/i.test(message)) {
          console.error("stripe-refund-admin", row.reference, message);
          return fail("The refund could not be processed, so the lesson was not cancelled. Try again in a moment.", 502, request, env);
        }
      }
    }

    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancelled_by = 'teacher',
         sequence = sequence + 1, same_day_change = 0, updated_at = ?,
         payment_status = CASE WHEN ? = 1 THEN 'refunded' ELSE payment_status END
       WHERE id = ?`
    )
      .bind(now, now, refunded, row.id)
      .run();

    const updated = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(row.id).first();
    const lessonType = await env.DB.prepare("SELECT * FROM lesson_types WHERE id = ?")
      .bind(row.lesson_type_id)
      .first();
    const settings = await loadSettings(env);

    // No same-day fee when she is the one cancelling — and the emails should say
    // she did it, rather than telling the student they cancelled their own lesson.
    ctx.waitUntil(
      notify(env, { event: "cancelled", row: updated, lessonType, settings, manageUrl: "", byTeacher: true })
    );

    return json({ booking: publicBooking(updated, lessonType, settings) }, 200, request, env);
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
