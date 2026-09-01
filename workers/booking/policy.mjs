/**
 * The prepaid change policy, in one place.
 *
 * Dan set it on 28 August 2026: every student pays when they book, and the
 * money is what locks the lesson's own Porto day. Until that day a lesson
 * moves freely and a cancellation is refunded in full, automatically. On the
 * day itself a paid lesson can be neither moved nor cancelled — the slot was
 * held all week and paid for, so it happens or it is forfeit. No same-day
 * fee, no no-show fee, no chasing anyone: one rule, and the arithmetic is
 * always a refund, never a new charge.
 *
 * Bookings made before prepay went live carry payment_status 'not_required'
 * and keep the terms they were booked under (the €5 same-day change fee);
 * this module leaves them unlocked so those promises are kept.
 */

import { dateKey, PORTO } from "./time.mjs";

export function changePolicy(row, now = new Date()) {
  const paid = row.payment_status === "paid";
  // A weekly lesson on a saved card: not charged yet, but committed to charge
  // on its own day. On that day it is as locked as a paid one — that charge
  // going out regardless is the policy — while cancelling it ahead of its day
  // simply means it is never charged, so there is nothing to refund.
  const scheduled = row.payment_status === "scheduled" || row.payment_status === "payment_due";
  const sameDay = dateKey(now, PORTO) === dateKey(new Date(row.starts_at), PORTO);

  return {
    paid,
    scheduled,
    sameDay,
    // Students cannot move or cancel a committed lesson on its own Porto day.
    // Inês herself is never locked — teacher actions do not consult this.
    locked: (paid || scheduled) && sameDay,
    // Only money actually taken comes back.
    refundOnCancel: paid && !sameDay
  };
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
  return row.payment_status === "scheduled" ? nextLessonType.price_cents : (row.amount_cents ?? null);
}

/** What a fixed run of lessons costs at checkout. */
export function seriesTotalCents(count, priceCents) {
  if (!Number.isInteger(count) || count < 1) throw new Error("A run needs at least one lesson.");
  return count * priceCents;
}
