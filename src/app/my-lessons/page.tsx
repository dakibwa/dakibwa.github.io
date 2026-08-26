import type { Metadata } from "next";
import { MyLessons } from "@/components/MyLessons";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "My lessons · Português com a Inês",
  description: "Your booked Portuguese lessons.",
  robots: { index: false, follow: false }
};

export default function MyLessonsPage() {
  return (
    <>
      <SiteHeader currentPage="my-lessons" />
      <main className="manage-page" id="main-content">
        <section className="manage-page__intro">
          <h1>My lessons</h1>
          <div className="editorial-rule" aria-hidden="true" />
          <p>Everything you&rsquo;ve booked, and everything you can change.</p>
        </section>
        <MyLessons />
      </main>
      <SiteFooter />
    </>
  );
}
