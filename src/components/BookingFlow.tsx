"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { BookingTimeWindowMark, PlantMark, SunMark, WaveMark } from "@/components/BrandMarks";
import { CustomSquareBookingFlow } from "@/components/CustomSquareBookingFlow";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import {
  BOOKING_DIRECT_URL,
  BOOKING_EMBED_URL,
  BOOKING_PROVIDER,
  BOOKING_PROVIDER_NAME,
  CALCOM_LINK,
  SAME_DAY_RESCHEDULE_FEE_CENTS,
  USE_CUSTOM_SQUARE_BOOKING,
  formatMoney
} from "@/lib/config";

type CalCommandArgs = unknown[];
type CalApi = ((command: string, ...args: CalCommandArgs) => void) & {
  loaded?: boolean;
  ns?: Record<string, CalApi>;
  q?: CalCommandArgs[];
};

declare global {
  interface Window {
    Cal?: CalApi;
  }
}

const calScriptSrc = "https://app.cal.com/embed/embed.js";
const acuityScriptSrc = "https://embed.acuityscheduling.com/js/embed.js";
const bookingDirectUrl = BOOKING_DIRECT_URL;
const bookingEmbedUrl = BOOKING_EMBED_URL;
const isSquare = BOOKING_PROVIDER === "square";
const isAcuity = BOOKING_PROVIDER === "acuity";
const isCalCom = BOOKING_PROVIDER === "calcom";
const sameDayFee = formatMoney(SAME_DAY_RESCHEDULE_FEE_CENTS);

function loadCalEmbed() {
  if (window.Cal) {
    window.Cal.ns = window.Cal.ns ?? {};
    return window.Cal;
  }

  const cal = ((...args: CalCommandArgs) => {
    cal.q = cal.q ?? [];
    cal.q.push(args);
  }) as CalApi;

  cal.q = [];
  cal.ns = {};
  window.Cal = cal;

  const script = document.createElement("script");
  script.src = calScriptSrc;
  script.async = true;
  document.head.appendChild(script);
  cal.loaded = true;

  return cal;
}

export function BookingFlow() {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [embedReady, setEmbedReady] = useState(false);

  useEffect(() => {
    if (!isCalCom || !CALCOM_LINK || !widgetRef.current) return;

    const parentElement = widgetRef.current;
    parentElement.innerHTML = "";

    const cal = loadCalEmbed();
    cal("init", { origin: "https://app.cal.com" });
    cal("inline", {
      elementOrSelector: parentElement,
      calLink: CALCOM_LINK
    });
    setEmbedReady(true);

    return () => {
      parentElement.innerHTML = "";
    };
  }, []);

  return (
    <main className="book-page">
      <SiteHeader currentPage="book" />

      <section className="booking-composition" aria-labelledby="booking-title">
        <aside className="booking-intro">
          <h1 id="booking-title">Book your<br />Portuguese<br />lesson</h1>
          <div className="editorial-rule" aria-hidden="true" />
          <p>Choose a live time in the secure booking calendar, then confirm your details.</p>
          <ul className="booking-intro__points">
            <li><PlantMark /><span>One to one</span></li>
            <li><WaveMark /><span>Online or in Porto</span></li>
            <li><SunMark /><span>Porto time</span></li>
          </ul>
          <BookingTimeWindowMark className="booking-intro__time-window" />
        </aside>

        <section className="booking-provider" aria-label={`${BOOKING_PROVIDER_NAME} lesson booking`}>
          <header className="booking-provider__header">
            <div>
              <p className="eyebrow">
                {USE_CUSTOM_SQUARE_BOOKING ? "Choose a day and time" : "Live availability"}
              </p>
              <h2>
                {BOOKING_PROVIDER === "none"
                  ? "Booking is being prepared."
                  : `Book securely with ${BOOKING_PROVIDER_NAME}.`}
              </h2>
              <p>
                {BOOKING_PROVIDER === "none"
                  ? "Live appointment details and secure confirmation will appear here."
                  : `Choose a live time, then pay securely in ${BOOKING_PROVIDER_NAME} to confirm your appointment.`}
              </p>
            </div>
            {bookingDirectUrl ? (
              <a className="button button--coral booking-provider__direct" href={bookingDirectUrl} target="_blank" rel="noreferrer">
                Open secure booking
              </a>
            ) : null}
          </header>

          {USE_CUSTOM_SQUARE_BOOKING ? (
            <CustomSquareBookingFlow />
          ) : isSquare && bookingEmbedUrl ? (
            <div className="booking-widget-stack">
              <div
                className="booking-embed-frame"
                aria-busy={!embedReady}
                aria-label="Square booking widget"
              >
                {!embedReady ? <p className="booking-loading">Loading live availability…</p> : null}
                <iframe
                  src={bookingEmbedUrl}
                  title="Schedule a Portuguese lesson with Square"
                  width="100%"
                  height="980"
                  allow="payment"
                  loading="eager"
                  referrerPolicy="strict-origin-when-cross-origin"
                  onLoad={() => setEmbedReady(true)}
                />
              </div>
              <p className="booking-fallback-note">
                If the embedded calendar does not appear, use “Open secure booking” above.
              </p>
            </div>
          ) : isAcuity && bookingEmbedUrl ? (
            <div className="booking-widget-stack">
              <Script src={acuityScriptSrc} strategy="afterInteractive" />
              <div className="booking-embed-frame" aria-busy={!embedReady} aria-label="Acuity booking widget">
                <iframe
                  src={bookingEmbedUrl}
                  title="Schedule a Portuguese lesson"
                  width="100%"
                  height="900"
                  loading="eager"
                  referrerPolicy="strict-origin-when-cross-origin"
                  onLoad={() => setEmbedReady(true)}
                />
              </div>
            </div>
          ) : isCalCom && CALCOM_LINK ? (
            <div className="booking-widget-stack">
              <div
                ref={widgetRef}
                className="booking-embed-frame"
                aria-busy={!embedReady}
                aria-label="Cal.com booking widget"
              />
            </div>
          ) : (
            <div className="booking-placeholder" aria-label="Booking setup placeholder">
              <p className="eyebrow">Not yet available</p>
              <h3>Booking will open here.</h3>
              <p>Available times and the secure confirmation route will appear once the provider is connected.</p>
            </div>
          )}
        </section>
      </section>

      <section className="booking-policy" id="change-booking">
        <WaveMark />
        <div>
          <p className="eyebrow">Flexible rescheduling</p>
          <p>
            Move to any available time. Changes are free before the lesson day; a {sameDayFee} fee applies on the day itself.
          </p>
        </div>
        {bookingDirectUrl ? (
          <a href={bookingDirectUrl} target="_blank" rel="noreferrer">Manage in {BOOKING_PROVIDER_NAME}</a>
        ) : null}
      </section>

      <SiteFooter />
    </main>
  );
}
