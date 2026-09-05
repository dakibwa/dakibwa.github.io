import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Terms & privacy | Português com a Inês",
  description: "How booking, payments and cancellations work, and how Inês uses your information.",
  alternates: { canonical: "/terms/" }
};

export default function TermsPrivacyPage() {
  return (
    <>
      <SiteHeader currentPage="terms" />

      <main className="policy-page" id="main-content">
        <header className="policy-page__hero">
          <h1>Terms &amp; privacy</h1>
          <p>Booking, payments and your information.</p>
          <p>Last updated 5 September 2026</p>
        </header>

        <div className="policy-page__body">
          <nav className="policy-page__index" aria-label="On this page">
            <a href="#booking">Booking &amp; payments</a>
            <a href="#privacy">Your privacy</a>
          </nav>

          <section id="booking" aria-labelledby="booking-terms-title">
            <h2 id="booking-terms-title">Booking &amp; payments</h2>
            <p>
              Lessons are one-to-one European Portuguese, online or in Porto. You see the length, price in euros
              and payment method before confirming. Lesson times and change deadlines use Porto time.
            </p>

            <h3>How you pay</h3>
            <p>
              If your booking says to pay Inês directly, you pay her on the day. No card is charged by the website.
            </p>
            <p>
              If your booking asks you to save a card, Stripe stores it securely. Nothing is charged when you book.
              You agree to automatic payment when each lesson ends. Complete the card setup and look for your
              confirmation email before treating the lesson as booked.
            </p>

            <h3>Recurring lessons</h3>
            <p>
              You pay for each lesson separately. Ongoing lessons continue until you stop the repeat in your lesson
              calendar. Stopping cancels future lessons, but keeps any lesson booked for today.
            </p>

            <h3>Moving or cancelling</h3>
            <p>
              Use your lesson calendar before the lesson starts. Changes are free until the day before. Moving or
              cancelling on the lesson day costs €5, once per lesson. If you move it, you still pay for the lesson
              at its new time. If you cancel, you do not pay the lesson price. There is no change fee if Inês moves
              or cancels a lesson.
            </p>
            <p>
              For saved-card bookings, the €5 fee is charged automatically. Any lesson already paid in advance
              keeps the change and refund rules shown in your calendar.
            </p>

            <h3>Missed lessons and card payments</h3>
            <p>
              If you miss a saved-card lesson and Inês records it as missed, the lesson charge is €5. Any same-day
              change fee is separate. If a card payment fails or needs your approval, you receive a secure link to
              complete it.
            </p>
          </section>

          <section id="privacy" aria-labelledby="privacy-title">
            <h2 id="privacy-title">Your privacy</h2>

            <h3>What we use and why</h3>
            <p>
              Your name, email, sign-in details, time zone and booking history help us arrange lessons, manage your
              account and send booking messages. Your phone number and lesson notes are optional.
            </p>
            <p>
              We use these details to fulfil our agreement with you. We keep financial records to meet legal
              duties, and use account and booking records to prevent misuse and resolve problems — our legitimate
              interests in running the service.
            </p>

            <h3>Who helps run the service</h3>
            <p>
              Cloudflare hosts the website and booking records. Resend sends booking emails. Google handles sign-in
              if you choose it. Stripe handles card payments; we keep payment references, never your full card
              details.
            </p>
            <p>
              These providers may process information outside the European Economic Area. Such transfers require
              safeguards, such as EU-approved contracts or recognised protections in the destination country.
              Contact us for details of the safeguards that apply.
            </p>

            <h3>How long we keep information</h3>
            <p>
              We keep information only as long as needed for your lessons and account, payment records, support,
              security or legal duties. Passwords are stored in a protected form, never as readable text.
            </p>

            <h3>Your choices</h3>
            <p>
              You can ask for a copy, correction, transfer or deletion of your information, or ask us to limit or
              stop a particular use. Some records must be kept for legal reasons. You can also complain to
              Portugal&apos;s data protection authority, the <a href="https://www.cnpd.pt/">CNPD</a>.
            </p>

            <h3>Cookies and browser storage</h3>
            <p>
              The website uses browser storage for sign-in, security, checkout and navigation. Google or Stripe may
              use cookies when you use their services. We do not use advertising analytics.
            </p>
          </section>

          <section aria-labelledby="policy-contact-title">
            <h2 id="policy-contact-title">Questions or requests?</h2>
            <p>
              Inês Dias Baía, trading as Português com a Inês, provides the lessons and is responsible for your
              personal information. <a href="mailto:bookings@portuguesewithines.com">Email Inês</a>
              {" "}about a booking, payment, refund or privacy request.
            </p>
            <p>These terms do not limit your legal rights.</p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
