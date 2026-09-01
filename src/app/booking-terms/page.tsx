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
            <h2>Saving a card and paying after a lesson</h2>
            <p>
              You save a reusable card securely with Stripe when you book. Nothing is charged at that point. Your
              time is held while the card setup is open and the booking is confirmed only after Stripe confirms that
              the card has been saved. The price shown for the lesson is charged automatically when its scheduled end
              time arrives, using Porto time for the lesson schedule.
            </p>
          </section>

          <section>
            <h2>Weekly lessons and saved cards</h2>
            <p>
              A weekly run is not a subscription or a prepaid package. Each booked lesson is charged separately to
              the same saved card when that lesson ends. A reusable card is required for automatic charges.
            </p>
            <p>
              Before booking, you must agree to those automatic charges. You can stop the repeat or manage an
              individual future lesson from your lesson calendar.
            </p>
          </section>

          <section>
            <h2>Moving, cancelling and refunds</h2>
            <p>
              You may move or cancel a lesson free until the day before it, counting by Porto time. If you move or
              cancel on the lesson&apos;s Porto calendar day, a €5 fee is charged automatically to the saved card. A
              cancelled lesson is not charged its full lesson price.
            </p>
            <p>
              A same-day fee is charged at most once for the same lesson, even if you change it more than once. If
              Inês changes or cancels a lesson, no same-day fee is charged.
            </p>
          </section>

          <section>
            <h2>No-shows</h2>
            <p>
              After a lesson starts and before its scheduled end, Inês can record that the student did not attend. If
              she records a no-show, €5 is charged when the lesson ends instead of the full lesson price. She can
              correct that status before the charge starts.
            </p>
          </section>

          <section>
            <h2>Confirmation and failed payments</h2>
            <p>
              A booking is confirmed by the confirmation email, not by reaching the card-setup return page. If an
              automatic charge fails or needs authentication, you receive a secure link to complete that specific
              payment. Inês receives the same status so it is not treated as paid by mistake.
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
