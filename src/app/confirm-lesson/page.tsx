import type { Metadata } from "next";
import { AccountHero } from "@/components/AccountHero";
import { ManualLessonConfirmation } from "@/components/ManualLessonConfirmation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./manual-confirmation.css";

export const metadata: Metadata = {
  title: "Confirm your lesson · Português com a Inês",
  description: "Review the lesson Inês has arranged for you and confirm payment.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ConfirmLessonPage() {
  return (
    <>
      <SiteHeader />
      <AccountHero title="Confirm your lesson" mark="/visuals/v2-splats/booking-availability-splat-v2.svg" />
      <main className="manage-page manual-confirmation-page" id="main-content">
        <ManualLessonConfirmation />
      </main>
      <SiteFooter />
    </>
  );
}
