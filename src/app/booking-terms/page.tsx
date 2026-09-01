import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Booking and payment terms | Português com a Inês",
  description: "Booking, payment, recurring lesson, cancellation and refund terms for lessons with Inês."
};

export default function BookingTermsPage() {
  return (
    <>
      <SiteHeader currentPage="terms" />

      <main className="policy-page" id="main-content">
        <header className="policy-page__hero">
          <p className="eyebrow">Clear before you book</p>
          <h1>Booking and payment terms</h1>
          <p>Last updated 1 September 2026</p>
        </header>

        <div className="policy-page__body">
          <section>
            <h2>Lessons and prices</h2>
            <p>
              Português com a Inês provides one-to-one European Portuguese lessons online and in Porto. The lesson,
              duration and total price in euros are shown before you confirm a booking.
            </p>
          </section>

          <section>
            <h2>Paying for one lesson</h2>
            <p>
              When online payment is available, a trial or single lesson is paid securely through Stripe when you
              book. The payment methods Stripe can offer depend on the lesson and your device; a card or MB WAY may be
              available. Your time is held while checkout is open and is confirmed only after Stripe confirms payment.
            </p>
          </section>

          <section>
            <h2>Weekly lessons and saved cards</h2>
            <p>
              A weekly run is not a subscription or a prepaid package. You pay for the first lesson when you book.
              Each later booked lesson is charged separately to the same card on the morning of that lesson. Because
              MB WAY cannot be used for recurring automatic payments, a reusable card is required for a weekly run.
            </p>
            <p>
              Before checkout, you must agree to those later card charges. You can stop the repeat or cancel an
              eligible future lesson from your lesson calendar, so a lesson removed before its charge day is not
              charged.
            </p>
          </section>

          <section>
            <h2>Moving, cancelling and refunds</h2>
            <p>
              You may move or cancel a paid lesson free until the day before it, counting by Porto time. A paid
              cancellation in that window is refunded automatically to the original payment method. On the calendar
              day of the lesson, the time is committed and cannot be moved, cancelled or refunded through the student
              account. If something exceptional has happened, contact Inês.
            </p>
            <p>
              If Inês cancels a paid lesson, it is refunded in full, including a same-day cancellation. Refunds can
              take several working days to appear, depending on the payment provider and bank.
            </p>
          </section>

          <section>
            <h2>Confirmation and failed payments</h2>
            <p>
              A booking is confirmed by the confirmation email, not by reaching the checkout return page. If a later
              automatic card charge fails or needs authentication, the lesson remains in the calendar and you receive
              a secure link to complete payment. Inês receives the same status so it is not treated as paid by mistake.
            </p>
          </section>

          <section>
            <h2>Contact and your rights</h2>
            <p>
              Questions about a lesson, payment or refund can be sent to{" "}
              <a href="mailto:bookings@portuguesewithines.com">bookings@portuguesewithines.com</a>. These booking terms
              do not limit any consumer rights that the law gives you.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
