"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { CustomSquareBookingFlow } from "@/components/CustomSquareBookingFlow";
import { SiteHeader } from "@/components/SiteHeader";
import {
  BOOKING_DIRECT_URL,
  BOOKING_EMBED_URL,
  BOOKING_PROVIDER,
  CALCOM_LINK,
  USE_CUSTOM_SQUARE_BOOKING
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

const calComLink = CALCOM_LINK;
const calScriptSrc = "https://app.cal.com/embed/embed.js";
const acuityScriptSrc = "https://embed.acuityscheduling.com/js/embed.js";
const bookingProvider = BOOKING_PROVIDER;
const bookingDirectUrl = BOOKING_DIRECT_URL;
const bookingEmbedUrl = BOOKING_EMBED_URL;
const isSquare = bookingProvider === "square";
const isAcuity = bookingProvider === "acuity";
const isCalCom = bookingProvider === "calcom";
const isAccountScheduler = isSquare || isAcuity;
const isHostedSquare = isSquare && !USE_CUSTOM_SQUARE_BOOKING;
const showTopExternalLink = Boolean(bookingDirectUrl && !isSquare);

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
    if (!isCalCom || !calComLink || !widgetRef.current) return;

    const parentElement = widgetRef.current;
    parentElement.innerHTML = "";

    const cal = loadCalEmbed();
    cal("init", { origin: "https://app.cal.com" });
    cal("inline", {
      elementOrSelector: parentElement,
      calLink: calComLink
    });
    setEmbedReady(true);

    return () => {
      parentElement.innerHTML = "";
    };
  }, []);

  return (
    <main>
      <SiteHeader currentPage="book" />

      <section className="booking-shell" aria-label="Book a Portuguese lesson">
        <section className="booking-calendar-panel" aria-label="Embedded lesson booking">
          <div className="booking-panel-top">
            <div className="booking-story">
              <h1>{USE_CUSTOM_SQUARE_BOOKING ? "Book your Portuguese lesson" : isHostedSquare ? "Book inside this page" : isAccountScheduler ? "Book or manage a lesson" : "Book your first Portuguese lesson"}</h1>
              <p>
                {USE_CUSTOM_SQUARE_BOOKING
                  ? "Choose a day, pick a time, and enter your details. The lesson is created through Inês's Square calendar."
                  : isHostedSquare
                    ? "Choose a time below. Square handles the secure confirmation while the flow stays embedded here where possible."
                  : isAccountScheduler
                    ? "Use the scheduler below to book, sign up, or log in."
                    : "Choose a time and pay securely below."}
              </p>
            </div>
            {showTopExternalLink ? (
              <a className="booking-top-link" href={bookingDirectUrl} target="_blank" rel="noreferrer">
                Open in new tab
              </a>
            ) : null}
          </div>
          {USE_CUSTOM_SQUARE_BOOKING ? (
            <CustomSquareBookingFlow />
          ) : isSquare && bookingEmbedUrl ? (
            <div className="booking-widget-stack">
              <div className="booking-embed-frame" aria-busy={!embedReady} aria-label="Square booking widget">
                <iframe
                  src={bookingEmbedUrl}
                  title="Schedule a Portuguese lesson"
                  width="100%"
                  height="980"
                  allow="payment"
                  referrerPolicy="strict-origin-when-cross-origin"
                  onLoad={() => setEmbedReady(true)}
                />
              </div>
            </div>
          ) : isAcuity && bookingEmbedUrl ? (
            <div className="booking-widget-stack">
              <Script src={acuityScriptSrc} strategy="afterInteractive" />
              <div className="booking-embed-frame" aria-busy={!embedReady} aria-label="Acuity booking widget">
                <iframe
                  src={bookingEmbedUrl}
                  title="Schedule a Portuguese lesson"
                  width="100%"
                  height="800"
                  referrerPolicy="strict-origin-when-cross-origin"
                  onLoad={() => setEmbedReady(true)}
                />
              </div>
            </div>
          ) : isCalCom && calComLink ? (
            <div className="booking-widget-stack">
              <div ref={widgetRef} className="booking-embed-frame" aria-busy={!embedReady} aria-label="Cal.com booking widget" />
            </div>
          ) : (
            <div className="booking-placeholder" aria-label="Booking setup placeholder">
              <span className="placeholder-icon" aria-hidden="true">
                <CalendarDays size={34} />
              </span>
              <h2>Booking will open here.</h2>
              <p>Once Inês connects the booking system, available times, payment, and student login will appear here.</p>
              <span className="placeholder-status">Calendar coming soon</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
