import type { Metadata } from "next";
import { ManageBooking } from "@/components/ManageBooking";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Your booking · Português com a Inês",
  description: "Move or cancel your Portuguese lesson.",
  // This page is only ever reached from a personal link in a confirmation email.
  robots: { index: false, follow: false }
};

export default function ManageBookingPage() {
  return (
    <>
      <SiteHeader currentPage="book" />
      <main className="manage-page" id="main-content">
        <section className="manage-page__intro">
          <h1>Your lesson</h1>
          <div className="editorial-rule" aria-hidden="true" />
          <p>Move it, or cancel it. Inês is updated automatically either way.</p>
        </section>
        <ManageBooking />
      </main>
      <SiteFooter />
    </>
  );
}
