"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { BookingApiError, formatLongDate, formatSlotTime } from "@/lib/booking-api";
import { CONTACT_WHATSAPP_URL } from "@/lib/config";
import {
  confirmManualLessonInvitation,
  declineManualLessonInvitation,
  fetchManualLessonInvitation,
  type ManualLessonInvitation,
} from "@/lib/manual-payments-api";
import { SITE_BASE_PATH } from "@/lib/paths";

const CHECK_INTERVAL_MS = 2500;
const MAX_FOLLOWUP_CHECKS = 6;

function invitationError(error: unknown) {
  return {
    message: error instanceof Error ? error.message : "This lesson could not be loaded. Please try again.",
    status: error instanceof BookingApiError ? error.status : 0,
  };
}

export function ManualLessonConfirmation() {
  const token = useRef("");
  const activeRequest = useRef<AbortController | null>(null);
  const [invitation, setInvitation] = useState<ManualLessonInvitation | null>(null);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [paymentConsent, setPaymentConsent] = useState(false);
  const [allowTeacherPayments, setAllowTeacherPayments] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [deadlinePassed, setDeadlinePassed] = useState(false);

  useEffect(() => {
    // The private email token stays in the fragment, never the query string,
    // local storage or any outgoing referrer.
    if (!token.current) {
      token.current = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    }
    if (!token.current) {
      setError({ message: "Open the full link from Inês’s lesson email to confirm your lesson.", status: 404 });
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let followupChecks = 0;
    setLoading(true);
    setError(null);

    async function load() {
      if (controller.signal.aborted) return;
      try {
        const result = await fetchManualLessonInvitation(token.current, controller.signal);
        if (controller.signal.aborted) return;
        setInvitation(result);
        setLoading(false);
        if (result.paymentState === "setting_up_card" && followupChecks < MAX_FOLLOWUP_CHECKS) {
          setChecking(true);
          followupChecks += 1;
          timer = setTimeout(load, CHECK_INTERVAL_MS);
        } else {
          setChecking(false);
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(invitationError(caught));
        setLoading(false);
        setChecking(false);
      }
    }

    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [retry]);

  useEffect(() => {
    if (!invitation || invitation.paymentState === "confirmed" || invitation.paymentState === "cancelled") {
      setDeadlinePassed(false);
      return;
    }

    const expiresAt = invitation.expiresAt;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function checkDeadline() {
      const remaining = Date.parse(expiresAt) - Date.now();
      if (remaining <= 0) {
        setDeadlinePassed(true);
      } else {
        setDeadlinePassed(false);
        timer = setTimeout(checkDeadline, Math.min(remaining, 2_147_483_647));
      }
    }
    checkDeadline();
    return () => clearTimeout(timer);
  }, [invitation]);

  function stopChecking() {
    activeRequest.current?.abort();
    setChecking(false);
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentConsent || !invitation || busy) return;
    stopChecking();
    setBusy(true);
    setError(null);
    try {
      const result = await confirmManualLessonInvitation(token.current, {
        paymentConsent: true,
        // An existing permission is not a fresh opt-in. Sending true for a
        // hidden control could re-enable permission revoked in another tab.
        allowTeacherPayments: invitation.acceptedTeacherPayments === null &&
          !invitation.teacherPaymentsAuthorised && allowTeacherPayments,
      });
      setInvitation(result);
      if (result.checkoutUrl) {
        const checkout = new URL(result.checkoutUrl);
        if (checkout.protocol !== "https:" || checkout.hostname !== "checkout.stripe.com") {
          throw new Error("The secure card setup link could not be opened. Please try again.");
        }
        window.location.assign(checkout.toString());
      } else if (result.paymentState === "setting_up_card") {
        setRetry((value) => value + 1);
      }
    } catch (caught) {
      setError(invitationError(caught));
      // An uncertain POST can still have recorded the student's first choice.
      // Read that choice before presenting controls for a retry.
      try {
        const current = await fetchManualLessonInvitation(token.current);
        setInvitation(current);
        if (current.paymentState === "confirmed" || current.paymentState === "cancelled") setError(null);
      } catch {
        // Keep the original error visible; a retry uses the same invitation.
      }
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (busy) return;
    stopChecking();
    setBusy(true);
    setError(null);
    try {
      const result = await declineManualLessonInvitation(token.current);
      setInvitation(result);
      setDeclining(false);
    } catch (caught) {
      setError(invitationError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !invitation) {
    return <p className="manual-confirmation__loading" role="status">Loading your lesson…</p>;
  }

  if (!invitation) {
    return (
      <section className="manual-confirmation" aria-label="Lesson confirmation">
        <h2>This lesson couldn&rsquo;t be opened</h2>
        <div className="booking-alert" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <p>{error?.message}</p>
        </div>
        {error && ![404, 410].includes(error.status) ? (
          <button className="button button--quiet" onClick={() => setRetry((value) => value + 1)} type="button">
            Try again
          </button>
        ) : null}
        <p><a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">Contact Inês</a> if you need a new link or a different time.</p>
      </section>
    );
  }

  const { booking } = invitation;
  const confirmed = invitation.paymentState === "confirmed" && booking.status === "confirmed";
  const cancelled = invitation.paymentState === "cancelled" || booking.status === "cancelled";
  const expired = !confirmed && !cancelled && (error?.status === 410 || deadlinePassed);
  const price = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(booking.lessonType.priceCents / 100);

  return (
    <section className="manual-confirmation" aria-label="Lesson confirmation">
      {confirmed ? (
        <div className="booking-outcome" role="status">
          <CheckCircle2 size={22} aria-hidden="true" />
          <div>
            <strong>Your lesson is confirmed.</strong>
            <p>Your saved card will be charged {price} when the lesson ends. Nothing is charged now.</p>
          </div>
        </div>
      ) : cancelled ? (
        <div role="status">
          <h2>This lesson has been cancelled</h2>
          <p>The reserved time has been released. No card payment was taken for this invitation.</p>
        </div>
      ) : expired ? (
        <div role="status">
          <h2>This confirmation link has expired</h2>
          <p>The reserved time has been released. <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">Contact Inês</a> to arrange your lesson again.</p>
        </div>
      ) : (
        <div>
          <h2>Inês has arranged this lesson for you</h2>
          <p>Check the details below and confirm your card payment to keep this time.</p>
        </div>
      )}

      <dl className="manual-confirmation__facts">
        <div>
          <dt>Lesson</dt>
          <dd>{booking.lessonType.id === "trial" ? "Trial · " : ""}{booking.lessonType.durationMinutes} minutes</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>
            {formatLongDate(booking.startAt)}
            <span>{formatSlotTime(booking.startAt)}–{formatSlotTime(booking.endAt)} · Porto time</span>
          </dd>
        </div>
        <div><dt>Where</dt><dd>{booking.location === "online" ? "Online" : "In Porto"}</dd></div>
        <div><dt>Price</dt><dd><strong>{price}</strong>{!cancelled ? " · charged after the lesson" : ""}</dd></div>
      </dl>

      {confirmed ? (
        <>
          {invitation.manageUrl ? (
            <a className="button button--coral" href={invitation.manageUrl} rel="noreferrer">Manage this lesson</a>
          ) : null}
          {invitation.teacherPaymentsAuthorised ? (
            <p>You also allow card payments for future lessons you arrange with Inês. You can turn this off in <a href={`${SITE_BASE_PATH}/book/?view=lessons`}>your profile</a>.</p>
          ) : null}
        </>
      ) : !cancelled && !expired ? (
        <>
          <p className="manual-confirmation__deadline">
            Confirm by {formatLongDate(invitation.expiresAt)} at {formatSlotTime(invitation.expiresAt)} (Porto time).
          </p>
          {invitation.paymentState === "setting_up_card" ? (
            <div className="manual-confirmation__checking" role="status">
              <p>{checking
                ? "Checking whether your card setup is complete…"
                : "Your card setup has not been confirmed yet. If you have finished, check again. Otherwise, continue below to save your card."}</p>
              {!checking ? (
                <button className="button button--quiet" disabled={busy || loading} onClick={() => setRetry((value) => value + 1)} type="button">
                  Check confirmation
                </button>
              ) : null}
            </div>
          ) : null}

          {!checking ? (
            <form className="manual-confirmation__form" onSubmit={confirm}>
              <div className="manual-confirmation__payment">
                <h3>Pay after your lesson</h3>
                <p>{invitation.hasSavedCard
                  ? "You already have a card saved securely with Stripe. Confirm below to use it for this lesson."
                  : "After confirming below, you’ll save a card securely with Stripe. No money is taken during card setup."}</p>
                <p>
                  We&rsquo;ll charge {price} when this lesson ends. Moving or cancelling is free until the previous Porto calendar day; on the lesson day, it costs €5 once per lesson. A recorded no-show costs €5 instead of the lesson price. Any earlier €5 change fee still applies.
                </p>
                <p>Moving keeps the lesson price due; cancelling removes it. There is no change fee if Inês moves or cancels.</p>
              </div>

              <label className="manual-confirmation__consent">
                <input checked={paymentConsent} disabled={busy} onChange={(event) => setPaymentConsent(event.target.checked)} required type="checkbox" />
                <span>I agree to the payment terms above, authorise these card charges and acknowledge the privacy notice.</span>
              </label>
              <a className="manual-confirmation__terms" href={`${SITE_BASE_PATH}/book/#terms-privacy`} target="_blank" rel="noreferrer">Read terms &amp; privacy (opens in a new tab)</a>

              {invitation.teacherPaymentsAuthorised ? (
                <p>You already allow card payments for lessons you arrange with Inês. You can turn this off in <a href={`${SITE_BASE_PATH}/book/?view=lessons`}>your profile</a>.</p>
              ) : invitation.acceptedTeacherPayments !== null ? (
                <p>
                  {invitation.acceptedTeacherPayments
                    ? "You selected card payments for future lessons you arrange with Inês. You can review or turn off this permission in your profile after confirmation."
                    : "This confirmation covers this lesson only. Future lessons Inês arranges will still ask you to confirm payment."}
                </p>
              ) : (
                <label className="manual-confirmation__consent manual-confirmation__consent--optional">
                  <input checked={allowTeacherPayments} disabled={busy} onChange={(event) => setAllowTeacherPayments(event.target.checked)} type="checkbox" />
                  <span>
                    <strong>Allow Inês to use my saved card for future lessons we arrange.</strong>
                    <span>Optional. Inês can add those lessons and email me their details. Each lesson&rsquo;s price, shown in its email, will be charged when it ends, with the same €5 terms above. I can turn this off in my profile.</span>
                  </span>
                </label>
              )}

              <button className="button button--coral" disabled={busy || loading || !paymentConsent} type="submit">
                {busy ? "Confirming…" : invitation.hasSavedCard ? "Confirm lesson and agree to pay" : "Save card and agree to pay"}
              </button>
            </form>
          ) : null}

          {declining ? (
            <div className="manual-confirmation__decline">
              <p>Decline this lesson? The reserved time will be released. No charge is made.</p>
              <div className="manual-confirmation__actions">
                <button className="button button--quiet" disabled={busy} onClick={() => void decline()} type="button">{busy ? "Declining…" : "Yes, decline lesson"}</button>
                <button className="manual-confirmation__text-button" disabled={busy} onClick={() => setDeclining(false)} type="button">Keep reviewing</button>
              </div>
            </div>
          ) : (
            <button className="manual-confirmation__text-button" disabled={busy} onClick={() => setDeclining(true)} type="button">Decline this lesson</button>
          )}
        </>
      ) : null}

      {error && !expired ? (
        <div className="booking-alert" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <p>{error.message}</p>
        </div>
      ) : null}
    </section>
  );
}
