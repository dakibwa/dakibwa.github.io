import type { Metadata } from "next";
import { AssetMark } from "@/components/BrandMarks";
import { MyLessons } from "@/components/MyLessons";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "My lessons · Português com a Inês",
  description: "Your booked Portuguese lessons.",
  robots: { index: false, follow: false }
};

/**
 * The same two-column composition the booking page uses.
 *
 * This page used to open on a full-width band and then drop everything into a
 * 760px column, which on a laptop left roughly 340px of empty cream down each
 * side while a student's lessons queued up vertically in the middle. The title
 * moves into the blue panel it shares with /book, and the lessons take the
 * space that was going spare.
 */
export default function MyLessonsPage() {
  return (
    <>
      <SiteHeader currentPage="my-lessons" />

      <main className="book-page" id="main-content">
        <section className="booking-composition" aria-labelledby="my-lessons-title">
          <aside className="booking-intro">
            <h1 id="my-lessons-title">
              My
              <br />
              lessons
            </h1>
            <div className="editorial-rule" aria-hidden="true" />
            <ul className="booking-intro__points">
              <li>
                <AssetMark asset="/visuals/v2-splats/at-your-pace-splat-v2.svg" />
                <span>Everything you&rsquo;ve booked</span>
              </li>
              <li>
                <AssetMark asset="/visuals/v2-splats/flexible-rescheduling-splat-v2.svg" />
                <span>Move or cancel any of it</span>
              </li>
              <li>
                <AssetMark asset="/visuals/v2-splats/lesson-format-splat-v2.svg" />
                <span>Porto time</span>
              </li>
            </ul>
            <AssetMark
              asset="/visuals/v2-splats/booking-availability-splat-v2.svg"
              className="booking-intro__time-window"
            />
          </aside>

          <section className="booking-provider" aria-label="Your lessons">
            <MyLessons />
          </section>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
