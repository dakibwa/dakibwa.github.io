/**
 * The change policy, in one place.
 *
 * Inês set the current rule on 1 September 2026: a card is saved when the
 * student books, the lesson price is charged when the scheduled lesson ends,
 * and moving or cancelling on the lesson's Porto calendar day costs EUR 5.
 * Therefore a scheduled card charge stays changeable; only an older lesson
 * that has already been paid keeps the earlier prepaid lock/refund behaviour.
 */

import { dateKey, PORTO } from "./time.mjs";

export function changePolicy(row, now = new Date()) {
  const paid = row.payment_status === "paid";
  const scheduled = row.payment_status === "scheduled" || row.payment_status === "processing";
  const sameDay = dateKey(now, PORTO) === dateKey(new Date(row.starts_at), PORTO);

  return {
    paid,
    scheduled,
    sameDay,
    // A saved-card lesson can still move or cancel on the day: that action is
    // what triggers the EUR 5 charge. Older already-paid lessons retain their
    // original lock. Inês herself never consults this policy.
    locked: paid && sameDay,
    // Only money actually taken comes back.
    refundOnCancel: paid && !sameDay
  };
}

/**
 * Split a recurring run for the destructive bulk action. Unlike cancelling one
 * legacy lesson, bulk cancellation never applies a same-day fee behind the
 * scenes: today's occurrence stays and every later occurrence can go.
 */
export function planSeriesCancellation(rows, now = new Date()) {
  const cancellable = [];
  const kept = [];

  for (const row of rows) {
    if (dateKey(now, PORTO) === dateKey(new Date(row.starts_at), PORTO)) kept.push(row);
    else cancellable.push({ row, refund: changePolicy(row, now).refundOnCancel });
  }

  return { cancellable, kept };
}

/**
 * A duration change is also a price change. Legacy pay-in-person bookings and
 * future recurring lessons that have not charged yet can change safely. A paid
 * lesson would need a partial refund or a second charge, while a payment-due
 * lesson may already have a hosted Checkout Session for the old amount; neither
 * should be rewritten silently by the reschedule endpoint.
 */
export function lessonTypeChangeProblem(row, currentLessonType, nextLessonType) {
  if (currentLessonType.id === nextLessonType.id) return "";
  if (currentLessonType.id === "trial" || nextLessonType.id === "trial") {
    return "A trial lesson can't be changed into another lesson length. Choose a new date and time, or cancel it and book another lesson.";
  }

  if (row.payment_status === "not_required" || row.payment_status === "scheduled") return "";
  if (row.payment_status === "paid") {
    return "This lesson is already paid. To change its length, cancel it for a refund and book the other length.";
  }
  if (row.payment_status === "payment_due") {
    return "This lesson already has a payment due. Pay or cancel it before choosing another lesson length.";
  }
  return "This lesson's length can't be changed while its payment is being processed.";
}

/** A future saved-card charge follows the newly chosen lesson price. */
export function amountAfterLessonTypeChange(row, nextLessonType) {
  return ["scheduled", "processing"].includes(row.payment_status)
    ? nextLessonType.price_cents
    : (row.amount_cents ?? null);
}
