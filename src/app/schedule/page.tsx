import type { Metadata } from "next";
import { AccountHero } from "@/components/AccountHero";
import { TeacherSchedule } from "@/components/TeacherSchedule";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Schedule · Português com a Inês",
  description: "Teaching hours and bookings.",
  robots: { index: false, follow: false }
};

export default function SchedulePage() {
  return (
    <>
      <SiteHeader />
      <AccountHero
        intro="Set when you teach, block days off, and see what's booked."
        mark="/visuals/v2-splats/booking-availability-splat-v2.svg"
        title="Your schedule"
      />
      <main className="manage-page" id="main-content">
        <TeacherSchedule />
      </main>
      <SiteFooter />
    </>
  );
}
