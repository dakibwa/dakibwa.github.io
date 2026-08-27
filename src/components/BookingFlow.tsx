"use client";

import { AssetMark } from "@/components/BrandMarks";
import { BookingCalendar } from "@/components/BookingCalendar";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import {
  BOOKING_CONFIGURED,
  CONTACT_WHATSAPP_URL,
  SAME_DAY_RESCHEDULE_FEE_CENTS,
  formatMoney
} from "@/lib/config";

const sameDayFee = formatMoney(SAME_DAY_RESCHEDULE_FEE_CENTS);

/**
 * The intro is a short banner rather than a full-height column. The booking
 * flow is the work of this page, and it was being squeezed into little more
 * than half the viewport by a panel that only ever said three things.
 */
export function BookingFlow() {
  return (
    <>
      <SiteHeader currentPage="book" />

      <main className="book-page" id="main-content">
        <section className="booking-composition" aria-labelledby="booking-title">
          <aside className="booking-intro">
            <h1 id="booking-title">
              Book your
              <br />
              Portuguese
              <br />
              lesson
            </h1>
            <div className="editorial-rule" aria-hidden="true" />
            <ul className="booking-intro__points">
              <li>
                <AssetMark asset="/visuals/v2-splats/one-to-one-splat-v2.svg" />
                <span>One to one</span>
              </li>
              <li>
                <AssetMark asset="/visuals/v2-splats/in-porto-or-online-splat-v2.svg" />
                <span>In Porto or online</span>
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

          <section className="booking-provider" aria-label="Lesson booking">
            {BOOKING_CONFIGURED ? (
              <BookingCalendar />
            ) : (
              <div className="booking-placeholder" aria-label="Booking setup placeholder">
                <p className="eyebrow">Not yet available</p>
                <h3>Booking will open here.</h3>
                <p>
                  Times will appear once booking is connected. In the meantime,{" "}
                  <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                    message Inês
                  </a>{" "}
                  and she&rsquo;ll arrange a lesson with you.
                </p>
              </div>
            )}
          </section>
        </section>

        <section className="booking-policy" id="change-booking">
          <AssetMark asset="/visuals/v2-splats/flexible-rescheduling-splat-v2.svg" />
          <div>
            <p className="eyebrow">Changing a lesson</p>
            <p>
              Move it from the link in your confirmation email, or your <a href="/my-lessons/">lessons page</a>. Free
              the day before or earlier &mdash; <strong>{sameDayFee} on the day itself</strong>. Not turning up at all
              is <strong>half the lesson</strong>, so it&rsquo;s always worth telling her.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
