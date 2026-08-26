import type { Metadata } from "next";
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
      <main className="manage-page" id="main-content">
        <section className="manage-page__intro">
          <h1>Your schedule</h1>
          <div className="editorial-rule" aria-hidden="true" />
          <p>Set when you teach, block days off, and see what&rsquo;s booked.</p>
        </section>
        <TeacherSchedule />
      </main>
      <SiteFooter />
    </>
  );
}
