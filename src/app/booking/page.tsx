import type { Metadata } from "next";
import { AccountHero } from "@/components/AccountHero";
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
      <AccountHero
        intro="Move it, or cancel it. Inês is updated automatically either way."
        mark="/visuals/v2-splats/flexible-rescheduling-splat-v2.svg"
        title="Your lesson"
      />
      <main className="manage-page" id="main-content">
        <ManageBooking />
      </main>
      <SiteFooter />
    </>
  );
}
