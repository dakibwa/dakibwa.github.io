import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Privacy | Português com a Inês",
  description: "How Português com a Inês uses and protects website, account, booking and payment information."
};

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader currentPage="privacy" />

      <main className="policy-page" id="main-content">
        <header className="policy-page__hero">
          <p className="eyebrow">Your information</p>
          <h1>Privacy notice</h1>
          <p>Last updated 1 September 2026</p>
        </header>

        <div className="policy-page__body">
          <section>
            <h2>Who is responsible</h2>
            <p>
              Inês Dias Baía, trading as Português com a Inês, is responsible for the personal information used to
              arrange and deliver lessons. Contact{" "}
              <a href="mailto:bookings@portuguesewithines.com">bookings@portuguesewithines.com</a> with any privacy
              question or request.
            </p>
          </section>

          <section>
            <h2>What the website uses</h2>
            <p>
              The booking system uses the name, email address, optional phone number, time zone, lesson choices,
              notes, account sign-in information and booking history that you provide. It also records the operational
              history needed to confirm, move, cancel and support a lesson.
            </p>
          </section>

          <section>
            <h2>Payments</h2>
            <p>
              Stripe processes online payments. Card details are entered directly into Stripe&apos;s secure checkout and
              are not stored by Português com a Inês. The booking system keeps only Stripe&apos;s opaque
              customer, payment-method, checkout and payment references where they are needed to confirm, refund or
              charge a lesson you agreed to.
            </p>
          </section>

          <section>
            <h2>Why the information is used</h2>
            <p>
              Account, booking, lesson, payment and service messages are used to perform the agreement with you or
              take the steps you request before booking. Necessary financial records are kept to meet legal duties.
              Security, conflict prevention, support and protection against misuse rely on the legitimate interest in
              running a safe and reliable lesson service. Optional Google sign-in is used only when you choose it.
            </p>
          </section>

          <section>
            <h2>Services that help run the website</h2>
            <p>
              Cloudflare hosts the website, booking service and database; Stripe handles payments; Resend delivers
              booking email; and Google handles Google sign-in when selected. Each provider processes only the
              information needed for its part of the service and applies its own security and privacy terms.
            </p>
          </section>

          <section>
            <h2>Where information is processed</h2>
            <p>
              The service is operated from Portugal and uses international technology providers. If a provider
              processes personal information outside the European Economic Area, the transfer must use a lawful
              safeguard such as an adequacy decision or approved contractual protections.
            </p>
          </section>

          <section>
            <h2>Retention and security</h2>
            <p>
              Booking, payment and communication records are kept only as long as they are needed to run the service,
              resolve a problem, protect the account, or meet accounting and legal duties. Passwords are stored only
              as salted hashes. Access tokens and payment secrets stay in protected service configuration, not in the
              public website or booking database.
            </p>
          </section>

          <section>
            <h2>Your choices and rights</h2>
            <p>
              You can ask to access, correct, restrict, export or delete your personal information, or object to a use
              of it. Some booking or payment records may have to be retained for legal reasons. You can also complain
              to Portugal&apos;s data protection authority, the{" "}
              <a href="https://www.cnpd.pt/" rel="noreferrer">CNPD</a>, if you believe your information has been
              handled incorrectly.
            </p>
          </section>

          <section>
            <h2>Cookies and local storage</h2>
            <p>
              The site does not use advertising analytics. It uses only the browser storage and provider technology
              needed for sign-in, security and checkout. Stripe or Google may set essential data when you choose their
              payment or sign-in flow.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
